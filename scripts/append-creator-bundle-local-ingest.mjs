#!/usr/bin/env node
/** 검증한 기존 입력을 보존하며 새 GLB만 private 입력에 추가한다. 공개 경로·원본·네트워크를 변경하지 않는다. */
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

import { buildThemePacks, CATALOG_PACKS } from "./generate-creator-bundle-theme-packs.mjs";
import { DEFAULT_PACK_RIGHTS_PATH, evaluateServeDecision, loadPackRightsLedger, packRightsProjection, validatePackRightsLedger } from "./lib/creator-bundle-pack-rights.mjs";
import { isSha256, relativePathProblem } from "./lib/creator-bundle-pack-rights-form.mjs";
import { REPO_ROOT } from "./lib/repo-paths.mjs";
import { buildLocalIngestPlan, validateLocalIngestConfig } from "./rebuild-creator-bundle-local-ingest.mjs";

export const DEFAULT_ADDITIONS = join(REPO_ROOT, "config/creator-bundle-local-ingest-additions.json");
const SCHEMA = "toonstudio.creator-bundle-local-ingest-additions.v1";
const hash = (body) => createHash("sha256").update(body).digest("hex");
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const fail = (message) => { throw new Error(message); };
const inside = (root, path) => { const rel = relative(root, path); return rel === "" || (!rel.startsWith(".." + sep) && rel !== ".." && !isAbsolute(rel)); };
function safeRelative(value) { const problem = relativePathProblem(value, 800); if (problem) fail("상대 경로 거부: " + problem); return value; }
function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail("입력 계약의 필드가 다릅니다.");
}
function noSymlinkPath(root, path) {
  let current = root;
  for (const segment of safeRelative(path).split("/")) {
    current = join(current, segment);
    if (lstatSync(current).isSymbolicLink()) fail("원본 경로의 중간 symlink를 거부합니다.");
  }
}

export function validateAdditionsRecipe(recipe) {
  exactKeys(recipe, ["schema", "status", "baseConfig", "copyPolicy", "outputPolicy", "rawModelsPublished", "observation", "packs"]);
  if (recipe.schema !== SCHEMA || recipe.status !== "pending-intake-validation" || recipe.copyPolicy !== "copy-only-no-hardlinks"
    || recipe.outputPolicy !== "new-private-envelope-with-atomic-input" || recipe.rawModelsPublished !== false
    || typeof recipe.observation !== "string" || !recipe.observation.trim() || !Array.isArray(recipe.packs) || recipe.packs.length === 0) fail("추가 입력 계획 계약이 올바르지 않습니다.");
  safeRelative(recipe.baseConfig);
  const catalogs = new Set(), ingests = new Set(), sources = new Set();
  for (const pack of recipe.packs) {
    exactKeys(pack, ["catalogId", "ingestId", "librarySource", "recordedFiles", "metadataSource", "representativeSource"]);
    if (typeof pack.catalogId !== "string" || !/^cbv1-ingest-local-[a-z0-9-]+$/u.test(pack.ingestId) || !positive(pack.recordedFiles)
      || catalogs.has(pack.catalogId) || ingests.has(pack.ingestId) || sources.has(pack.librarySource)) fail("중복되거나 올바르지 않은 추가 팩입니다.");
    safeRelative(pack.librarySource); safeRelative(pack.metadataSource); safeRelative(pack.representativeSource);
    if (!pack.representativeSource.endsWith(".glb")) fail("대표 입력은 GLB 상대 경로여야 합니다.");
    catalogs.add(pack.catalogId); ingests.add(pack.ingestId); sources.add(pack.librarySource);
  }
}

function packDecision(ledger, pack, libraryRoot) {
  const def = CATALOG_PACKS.find((candidate) => candidate.catalogIds.includes(pack.catalogId) && candidate.ingest.includes(pack.ingestId));
  const decision = def && evaluateServeDecision(ledger, def, { group: "pack" });
  if (!decision?.serve) fail("현재 권리 게이트가 닫힌 팩입니다: " + pack.catalogId);
  const segments = safeRelative(pack.librarySource).split("/");
  if (segments.length < 3 || !decision.entry.libraryPacks.includes(segments[1])) fail("원장의 로컬 팩 소유권과 입력 경로가 다릅니다.");
  noSymlinkPath(libraryRoot, pack.librarySource);
  const packRoot = realpathSync(join(libraryRoot, segments[0], segments[1]));
  const sourceBase = realpathSync(join(libraryRoot, pack.librarySource));
  if (!inside(libraryRoot, packRoot) || !inside(packRoot, sourceBase) || !statSync(sourceBase).isDirectory()) fail("라이브러리·소유 팩 밖 입력을 거부합니다.");
  return { sourceBase, rights: packRightsProjection(decision.entry) };
}

function checkedBody(root, path, bytes, sha256) {
  safeRelative(path);
  if (!positive(bytes) || !isSha256(sha256)) fail("파일 바이트·SHA-256 계약이 올바르지 않습니다.");
  const requested = join(root, path), sourceReal = realpathSync(requested);
  noSymlinkPath(root, path);
  if (!inside(root, sourceReal) || lstatSync(requested).isSymbolicLink() || !statSync(sourceReal).isFile()) fail("원본 파일의 symlink 탈출을 거부합니다.");
  const body = readFileSync(sourceReal);
  if (body.length !== bytes || hash(body) !== sha256) fail("원본 크기·SHA-256 불일치: " + path);
  return sourceReal;
}

function checkedRecord(record) {
  const current = checkedBody(record.sourceRoot, record.sourcePath, record.bytes, record.sha256);
  if (current !== record.sourceReal) fail("계획 이후 원본의 실제 경로가 변경됐습니다.");
}

function ownedDirectory(path, owner) {
  try {
    const current = lstatSync(path);
    return current.isDirectory() && !current.isSymbolicLink() && current.dev === owner.dev && current.ino === owner.ino;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

/** 복사 중 앞선 파일의 변조와 알 수 없는 추가 파일을 최종 게시 전에 확인한다. */
function checkStaging(stage, records) {
  const expected = new Set(["manifest-v2.json", "ingestion-origins.json", ...records.map((record) => record.path)]);
  const found = new Set();
  function walk(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name), name = relative(stage, path).split(sep).join("/");
      if (item.isSymbolicLink()) fail("추가 출력 staging의 symlink를 거부합니다.");
      if (item.isDirectory()) {
        if (![...expected].some((file) => file.startsWith(name + "/"))) fail("알 수 없는 staging 디렉터리를 거부합니다.");
        walk(path);
      } else if (!item.isFile() || !expected.has(name)) fail("알 수 없는 staging 파일을 거부합니다.");
      else found.add(name);
    }
  }
  walk(stage);
  if (found.size !== expected.size) fail("완성 staging에 필수 파일이 빠졌습니다.");
  for (const record of records) checkedBody(stage, record.path, record.bytes, record.sha256);
}

function admitManifest(manifest, assetRoot, ledger) {
  const { output, stats } = buildThemePacks({ manifestV2: manifest, themesDoc: { themes: [] }, assetRoot, ledger, onError: fail });
  const admitted = new Map(output.assets.map((asset) => [asset.id, asset]));
  if (stats.hashMismatch || admitted.size !== manifest.assets.length || manifest.assets.some((asset) => {
    const result = admitted.get(asset.id), primary = asset.files[0];
    return !result || result.bytes !== primary.bytes || result.sha256 !== primary.sha256;
  })) fail("기존 생성기의 GLB 모바일·자기완결성·권리 검증을 통과하지 못했습니다.");
}

/** 기존 descriptor는 그대로 복제하고, 신규 ID는 팩·상대 경로·본문 해시에 결정적으로 연결한다. */
export function buildAppendLocalIngestPlan({ existingRoot, libraryRoot, recipe, baseConfig, projectionBytes, ledger, generatedAt = new Date().toISOString() }) {
  validateAdditionsRecipe(recipe); validateLocalIngestConfig(baseConfig);
  const problems = validatePackRightsLedger(ledger);
  if (problems.length) fail("권리 원장 거부: " + problems.join(" / "));
  if (!Number.isFinite(Date.parse(generatedAt))) fail("생성 시각이 올바르지 않습니다.");
  const originalRoot = realpathSync(existingRoot), library = realpathSync(libraryRoot);
  if (!statSync(originalRoot).isDirectory() || !statSync(library).isDirectory()) fail("입력 루트는 디렉터리여야 합니다.");
  const manifestPath = join(originalRoot, "manifest-v2.json");
  if (lstatSync(manifestPath).isSymbolicLink()) fail("기존 manifest의 symlink를 거부합니다.");
  const manifestBytes = readFileSync(manifestPath), original = JSON.parse(manifestBytes);
  if (original.kind !== "toonstudio.asset-bundle.v2" || original.version !== 2 || original.inServiceOnly !== true || original.downloadable !== false
    || !Array.isArray(original.assets) || original.totals?.assets !== baseConfig.expected.files || original.assets.length !== baseConfig.expected.files) fail("기존 manifest 계약·파일 수가 다릅니다.");
  const canonical = buildLocalIngestPlan({ libraryRoot: library, config: baseConfig, projectionBytes, ledger });
  if (!isDeepStrictEqual(original, canonical.manifest)) fail("기존 manifest의 descriptor·ID·경로가 정본 projection과 다릅니다.");
  const ids = new Set(), paths = new Set(), records = [], baseCounts = new Map();
  for (const pack of baseConfig.packs) {
    packDecision(ledger, pack, library);
    baseCounts.set(pack.ingestId, { files: 0, bytes: 0 });
  }
  for (const asset of original.assets) {
    const count = baseCounts.get(asset.packId);
    if (!count || asset.role !== "runtime" || asset.format !== "glb" || !Array.isArray(asset.files) || asset.files.length !== 1
      || asset.files[0].kind !== "primary" || typeof asset.id !== "string" || !asset.id.startsWith(asset.packId + "-")
      || ids.has(asset.id)) fail("기존 에셋 ID·팩 소유권·포맷 계약이 다릅니다.");
    safeRelative(asset.sourcePath);
    const primary = asset.files[0];
    if (primary.path !== asset.packId + "/native/" + asset.sourcePath || !asset.sourcePath.endsWith(".glb") || paths.has(primary.path)) fail("기존 sourcePath·출력 경로가 다릅니다.");
    const sourceReal = checkedBody(originalRoot, primary.path, primary.bytes, primary.sha256);
    records.push({ ...primary, sourceReal, sourceRoot: originalRoot, sourcePath: primary.path }); ids.add(asset.id); paths.add(primary.path);
    count.files += 1; count.bytes += primary.bytes;
  }
  for (const pack of baseConfig.packs) if (baseCounts.get(pack.ingestId).files !== pack.files || baseCounts.get(pack.ingestId).bytes !== pack.bytes) fail("기존 팩의 파일 수·바이트 합계가 다릅니다.");
  const additions = [], sourceAssets = [], newPacks = [], rights = [];
  for (const pack of recipe.packs) {
    if (baseConfig.packs.some((existing) => existing.ingestId === pack.ingestId || existing.catalogId === pack.catalogId || existing.librarySource === pack.librarySource)) fail("기존 팩과 충돌하는 추가 입력을 거부합니다.");
    const { sourceBase, rights: projection } = packDecision(ledger, pack, library);
    const candidates = [];
    function walk(directory) {
      for (const item of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
        const full = join(directory, item.name);
        if (item.isSymbolicLink()) fail("추가 입력 트리의 symlink를 거부합니다.");
        if (item.isDirectory()) walk(full);
        else if (item.isFile() && item.name.endsWith(".glb")) candidates.push(relative(sourceBase, full).split(sep).join("/"));
      }
    }
    walk(sourceBase);
    if (candidates.length !== pack.recordedFiles || !candidates.includes(pack.representativeSource)) fail("기존 기록과 실제 GLB 수·대표 파일이 다릅니다: " + pack.catalogId);
    let bytes = 0;
    for (const sourcePath of candidates) {
      safeRelative(sourcePath);
      noSymlinkPath(library, pack.librarySource + "/" + sourcePath);
      const sourceReal = realpathSync(join(sourceBase, sourcePath));
      if (!inside(sourceBase, sourceReal)) fail("추가 입력의 symlink 탈출을 거부합니다.");
      const body = readFileSync(sourceReal), sha256 = hash(body);
      const suffix = hash(Buffer.from(sourcePath + "\0" + sha256)).slice(0, 20);
      const id = pack.ingestId + "-" + suffix, path = pack.ingestId + "/native/" + sourcePath;
      if (ids.has(id) || paths.has(path)) fail("신규 에셋 ID·경로가 충돌합니다.");
      const primary = { kind: "primary", path, bytes: body.length, sha256 };
      const asset = { id, packId: pack.ingestId, role: "runtime", format: "glb", sourcePath, files: [primary] };
      additions.push(asset);
      sourceAssets.push({ ...asset, files: [{ ...primary, path: pack.librarySource + "/" + sourcePath }] });
      records.push({ ...primary, sourceReal, sourceRoot: library, sourcePath: pack.librarySource + "/" + sourcePath }); ids.add(id); paths.add(path); bytes += body.length;
    }
    newPacks.push({ catalogId: pack.catalogId, ingestId: pack.ingestId, librarySource: pack.librarySource, files: candidates.length, bytes });
    rights.push({ catalogId: pack.catalogId, ingestId: pack.ingestId, rights: projection });
  }
  const manifest = { ...structuredClone(original), generatedAt, totals: { ...original.totals, assets: original.assets.length + additions.length }, assets: [...structuredClone(original.assets), ...additions] };
  admitManifest({ ...manifest, totals: { assets: sourceAssets.length }, assets: sourceAssets }, library, ledger);
  return {
    existingRoot: originalRoot, libraryRoot: library, recipe, ledger, ledgerSha256: hash(Buffer.from(JSON.stringify(ledger))),
    baseManifestPath: manifestPath, baseManifestSha256: hash(manifestBytes), originalAssets: structuredClone(original.assets), records, manifest,
    originalSourceChecks: canonical.records.map((record) => {
      const pack = baseConfig.packs.find((item) => record.path.startsWith(item.ingestId + "/native/"));
      const sourcePath = pack.librarySource + "/" + record.path.slice((pack.ingestId + "/native/").length);
      noSymlinkPath(library, sourcePath);
      return { sourceRoot: library, sourcePath, sourceReal: record.sourceReal, bytes: record.bytes, sha256: record.sha256 };
    }),
    origins: { schema: "toonstudio.local-private-ingestion-origins.v1", copyPolicy: recipe.copyPolicy, baseManifestSha256: hash(manifestBytes), baseProjectionSha256: baseConfig.projectionSha256, packs: [...structuredClone(baseConfig.packs), ...newPacks], addedPackRights: rights, rawModelsPublished: false },
    summary: { baseFiles: original.assets.length, addedPacks: newPacks.length, addedFiles: additions.length, files: records.length, bytes: records.reduce((sum, record) => sum + record.bytes, 0) },
  };
}

function outputLocation(plan, outputRoot) {
  if (!outputRoot) fail("--output-root가 필요합니다.");
  const requested = resolve(outputRoot), parent = realpathSync(dirname(requested)), output = join(parent, basename(requested));
  if ([realpathSync(REPO_ROOT), plan.existingRoot, plan.libraryRoot].some((root) => inside(root, output))
    || output.split(sep).some((part) => part === "public" || part === "dist")) fail("출력은 저장소·기존 입력·원본 라이브러리·공개 경로 밖이어야 합니다.");
  if (existsSync(output)) fail("기존 출력은 덮어쓰지 않습니다. 새 private 디렉터리를 사용하세요.");
  return output;
}

function assertInputsCurrent(plan) {
  noSymlinkPath(plan.existingRoot, "manifest-v2.json");
  if (hash(readFileSync(plan.baseManifestPath)) !== plan.baseManifestSha256 || hash(Buffer.from(JSON.stringify(plan.ledger))) !== plan.ledgerSha256) fail("계획 이후 기존 manifest·권리가 변경됐습니다.");
  for (const control of plan.controlFiles ?? []) if (hash(readFileSync(control.path)) !== control.sha256) fail("계획 이후 입력 설정·원장이 변경됐습니다.");
  for (const record of plan.originalSourceChecks) checkedRecord(record);
}

/** 새 envelope를 배타적으로 예약한다. 완성된 input/만 rename하며 기존 경로는 교체하지 않는다. */
export function writeAppendLocalIngest(plan, outputRoot, { copyFile = copyFileSync, rename = renameSync } = {}) {
  const output = outputLocation(plan, outputRoot);
  assertInputsCurrent(plan);
  mkdirSync(output, { mode: 0o700 });
  const owner = lstatSync(output);
  let stage, stageOwner, published = false;
  const ownOutput = () => ownedDirectory(output, owner);
  const ownStage = () => stage && stageOwner && ownedDirectory(stage, stageOwner);
  try {
    stage = mkdtempSync(join(output, ".staging-"));
    stageOwner = lstatSync(stage);
    for (const record of plan.records) {
      if (!ownOutput() || !ownStage()) fail("예약한 출력 staging이 변경돼 중단합니다.");
      checkedRecord(record);
      safeRelative(record.path);
      const destination = join(stage, record.path);
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      noSymlinkPath(stage, dirname(record.path).split(sep).join("/"));
      copyFile(record.sourceReal, destination, constants.COPYFILE_EXCL);
    }
    assertInputsCurrent(plan);
    for (const record of plan.records) checkedRecord(record);
    if (!ownOutput() || !ownStage()) fail("예약한 출력 staging이 변경돼 중단합니다.");
    writeFileSync(join(stage, "manifest-v2.json"), JSON.stringify(plan.manifest, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    writeFileSync(join(stage, "ingestion-origins.json"), JSON.stringify(plan.origins, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    checkStaging(stage, plan.records);
    if (!isDeepStrictEqual(plan.manifest.assets.slice(0, plan.originalAssets.length), plan.originalAssets)) fail("기존 descriptor가 변경됐습니다.");
    if (!ownOutput() || !ownStage() || existsSync(join(output, "input"))) fail("예약한 출력이 변경돼 보존하고 중단합니다.");
    rename(stage, join(output, "input")); published = true;
    return plan.summary;
  } finally {
    if (!published) {
      if (ownOutput() && ownStage()) rmSync(stage, { recursive: true, force: true });
      // 알 수 없는 새 파일은 삭제하지 않는다. 배타적으로 예약했던 빈 디렉터리만 정리한다.
      if (existsSync(output) && ownOutput() && readdirSync(output).length === 0) rmdirSync(output);
    }
  }
}

export function runAppendLocalIngestCli(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (["--dry-run", "--write", "--help"].includes(flag)) { if (options[flag]) fail("중복된 인자: " + flag); options[flag] = true; continue; }
    if (!["--existing-root", "--library-root", "--output-root", "--recipe", "--pack-rights"].includes(flag) || !argv[i + 1] || argv[i + 1].startsWith("--") || options[flag]) fail("알 수 없거나 중복된 인자: " + flag);
    options[flag] = argv[++i];
  }
  if (options["--help"]) return "node scripts/append-creator-bundle-local-ingest.mjs --existing-root <private-ingest> --library-root <library> --output-root <new-private-envelope> (--dry-run|--write) [--recipe <file>] [--pack-rights <file>]\n원본과 기존 입력은 변경하지 않습니다. --write의 검증 완료 입력은 <output-root>/input/입니다. 다음 단계에서만 projection과 정본 재현 설정을 갱신하세요.";
  if (!options["--existing-root"] || !options["--library-root"] || !options["--output-root"] || Boolean(options["--dry-run"]) === Boolean(options["--write"])) fail("입력·출력 루트와 --dry-run 또는 --write 하나가 필요합니다.");
  const recipePath = options["--recipe"] ?? DEFAULT_ADDITIONS, recipeBytes = readFileSync(recipePath), recipe = JSON.parse(recipeBytes);
  validateAdditionsRecipe(recipe);
  const configPath = join(REPO_ROOT, recipe.baseConfig), configBytes = readFileSync(configPath);
  const config = JSON.parse(configBytes), projectionPath = join(REPO_ROOT, safeRelative(config.projection)), projectionBytes = readFileSync(projectionPath);
  const ledgerPath = options["--pack-rights"] ?? DEFAULT_PACK_RIGHTS_PATH, ledgerBytes = readFileSync(ledgerPath);
  const plan = buildAppendLocalIngestPlan({ existingRoot: options["--existing-root"], libraryRoot: options["--library-root"], recipe, baseConfig: config, projectionBytes, ledger: loadPackRightsLedger(ledgerPath) });
  plan.controlFiles = [{ path: recipePath, sha256: hash(recipeBytes) }, { path: configPath, sha256: hash(configBytes) }, { path: projectionPath, sha256: hash(projectionBytes) }, { path: ledgerPath, sha256: hash(ledgerBytes) }];
  outputLocation(plan, options["--output-root"]);
  if (options["--write"]) writeAppendLocalIngest(plan, options["--output-root"]);
  return JSON.stringify({ mode: options["--write"] ? "copy" : "dry-run", ...plan.summary });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(runAppendLocalIngestCli(process.argv.slice(2))); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; }
}
