#!/usr/bin/env node
/** 검증한 로컬 GLB 입력을 재현한다. 네트워크·원본 변경·공개 경로 쓰기·하드링크를 사용하지 않는다. */
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildThemePacks, CATALOG_PACKS } from "./generate-creator-bundle-theme-packs.mjs";
import { evaluateServeDecision, loadPackRightsLedger, validatePackRightsLedger } from "./lib/creator-bundle-pack-rights.mjs";
import { isSha256, relativePathProblem } from "./lib/creator-bundle-pack-rights-form.mjs";
import { REPO_ROOT } from "./lib/repo-paths.mjs";

const SCHEMA = "toonstudio.creator-bundle-local-ingest.v1";
export const DEFAULT_CONFIG = join(REPO_ROOT, "config/creator-bundle-local-ingest.json");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inside = (root, path) => { const rel = relative(root, path); return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel)); };
const fail = (message) => { throw new Error(message); };
function safeRelative(value) { const problem = relativePathProblem(value, 800); if (problem) fail(`상대 경로 거부: ${problem}`); return value; }
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail("입력 계약의 필드가 다릅니다.");
}

export function validateLocalIngestConfig(config) {
  exactKeys(config, ["schema", "projection", "projectionSha256", "snapshotGeneratedAt", "copyPolicy", "expected", "packs"]);
  if (config.schema !== SCHEMA || config.copyPolicy !== "copy-only-no-hardlinks" || !isSha256(config.projectionSha256)
    || typeof config.snapshotGeneratedAt !== "string" || !Number.isFinite(Date.parse(config.snapshotGeneratedAt))) fail("인제스션 설정 계약이 올바르지 않습니다.");
  safeRelative(config.projection);
  exactKeys(config.expected, ["files", "bytes"]);
  if (!positive(config.expected.files) || !positive(config.expected.bytes) || !Array.isArray(config.packs) || config.packs.length === 0) fail("입력 합계가 올바르지 않습니다.");
  const ids = new Set(), catalogs = new Set(), sources = new Set();
  for (const pack of config.packs) {
    exactKeys(pack, ["catalogId", "ingestId", "librarySource", "files", "bytes"]);
    if (!/^cbv1-ingest-local-[a-z0-9-]+$/u.test(pack.ingestId) || !positive(pack.files) || !positive(pack.bytes)
      || ids.has(pack.ingestId) || catalogs.has(pack.catalogId) || sources.has(pack.librarySource)) fail("중복되거나 올바르지 않은 팩 입력입니다.");
    safeRelative(pack.librarySource); ids.add(pack.ingestId); catalogs.add(pack.catalogId); sources.add(pack.librarySource);
  }
  if (config.packs.reduce((sum, p) => sum + p.files, 0) !== config.expected.files || config.packs.reduce((sum, p) => sum + p.bytes, 0) !== config.expected.bytes) fail("팩별 합계와 전체 합계가 다릅니다.");
}

/** 공개 projection의 ID·경로·해시를 권위로 삼고 기존 생성기의 원장·모바일 GLB 게이트를 재사용한다. */
export function buildLocalIngestPlan({ libraryRoot, config, projectionBytes, ledger }) {
  validateLocalIngestConfig(config);
  if (hash(projectionBytes) !== config.projectionSha256) fail("권위 projection의 SHA-256이 다릅니다.");
  const problems = validatePackRightsLedger(ledger);
  if (problems.length) fail(`권리 원장 거부: ${problems.join(" / ")}`);
  const projection = JSON.parse(projectionBytes);
  if (!Array.isArray(projection.assets) || !Array.isArray(projection.packs) || projection.inServiceOnly !== true || projection.downloadable !== false || projection.budgetProfile !== "mobile") fail("권위 projection 계약이 올바르지 않습니다.");
  const root = realpathSync(libraryRoot), manifestAssets = [], sourceAssets = [], records = [], selected = [], ids = new Set(), paths = new Set();
  for (const pack of config.packs) {
    const def = CATALOG_PACKS.find((entry) => entry.catalogIds.includes(pack.catalogId) && entry.ingest.includes(pack.ingestId));
    const decision = def && evaluateServeDecision(ledger, def, { group: "pack" });
    if (!decision?.serve) fail(`권리 게이트가 닫힌 팩입니다: ${pack.catalogId}`);
    if (!decision.entry.libraryPacks.includes(pack.librarySource.split("/")[1])) fail("원장의 로컬 팩 소유권과 입력 경로가 다릅니다.");
    const sourceBase = realpathSync(join(root, pack.librarySource));
    if (!inside(root, sourceBase) || !statSync(sourceBase).isDirectory()) fail("라이브러리 밖 원본 폴더를 거부합니다.");
    const candidates = projection.assets.filter((asset) => typeof asset.path === "string" && asset.path.startsWith(`${pack.ingestId}/native/`));
    let bytes = 0;
    for (const asset of candidates) {
      const sourcePath = safeRelative(asset.path.slice(`${pack.ingestId}/native/`.length));
      safeRelative(asset.path);
      if (!sourcePath.endsWith(".glb") || typeof asset.id !== "string" || !asset.id.startsWith(`${pack.ingestId}-`) || ids.has(asset.id) || paths.has(asset.path) || !isSha256(asset.sha256) || !positive(asset.bytes)) fail("에셋 ID·경로·해시 계약이 올바르지 않습니다.");
      const projectedPack = projection.packs[asset.pack];
      if (!projectedPack?.catalogIds?.includes(pack.catalogId) || !projectedPack.ingestPackIds?.includes(pack.ingestId)) fail("projection의 팩 소유권이 다릅니다.");
      const libraryPath = `${pack.librarySource}/${sourcePath}`, sourceReal = realpathSync(join(root, libraryPath));
      if (!inside(root, sourceReal) || !inside(sourceBase, sourceReal) || !statSync(sourceReal).isFile()) fail("원본 경로의 symlink 탈출을 거부합니다.");
      const body = readFileSync(sourceReal);
      if (body.length !== asset.bytes || hash(body) !== asset.sha256) fail(`원본 크기·SHA-256 불일치: ${asset.id}`);
      const primary = { kind: "primary", path: asset.path, bytes: asset.bytes, sha256: asset.sha256 };
      const entry = { id: asset.id, packId: pack.ingestId, role: "runtime", format: "glb", sourcePath, files: [primary] };
      manifestAssets.push(entry); sourceAssets.push({ ...entry, files: [{ ...primary, path: libraryPath }] });
      records.push({ ...primary, sourceReal }); selected.push(asset); ids.add(asset.id); paths.add(asset.path); bytes += asset.bytes;
    }
    if (candidates.length !== pack.files || bytes !== pack.bytes) fail(`팩별 파일 수·바이트 합계가 다릅니다: ${pack.ingestId}`);
  }
  if (manifestAssets.length !== config.expected.files) fail("전체 파일 수가 다릅니다.");
  const sourceManifest = { kind: "toonstudio.asset-bundle.v2", version: 2, generatedAt: config.snapshotGeneratedAt, totals: { assets: sourceAssets.length }, assets: sourceAssets };
  const { output, stats } = buildThemePacks({ manifestV2: sourceManifest, themesDoc: { themes: [] }, assetRoot: root, ledger, onError: fail });
  const admitted = new Map(output.assets.map((asset) => [asset.id, asset]));
  if (stats.hashMismatch || admitted.size !== selected.length || selected.some((asset) => {
    const current = admitted.get(asset.id);
    return !current || current.bytes !== asset.bytes || current.sha256 !== asset.sha256 || current.tris !== asset.tris;
  })) fail("기존 생성기의 GLB 모바일·권리·메트릭 검증을 통과하지 못했습니다.");
  const manifest = { kind: "toonstudio.asset-bundle.v2", version: 2, inServiceOnly: true, downloadable: false, generatedAt: config.snapshotGeneratedAt, totals: { assets: manifestAssets.length }, assets: manifestAssets };
  return { libraryRoot: root, config, records, manifest, summary: { packs: config.packs.length, files: records.length, bytes: records.reduce((sum, record) => sum + record.bytes, 0) } };
}

function outputLocation(plan, outputRoot, mustExist) {
  if (!outputRoot) fail("--output-root가 필요합니다.");
  const requested = resolve(outputRoot), parent = realpathSync(dirname(requested)), output = join(parent, basename(requested));
  if (inside(realpathSync(REPO_ROOT), output) || inside(plan.libraryRoot, output) || output.split(sep).some((part) => part === "public" || part === "dist")) fail("출력은 저장소·원본 라이브러리·공개 디렉터리 밖이어야 합니다.");
  if (mustExist) {
    if (!lstatSync(output).isDirectory() || lstatSync(output).isSymbolicLink() || realpathSync(output) !== output) fail("출력 디렉터리 symlink를 거부합니다.");
  } else if (existsSync(output)) fail("기존 출력은 덮어쓰지 않습니다. --check 또는 새 디렉터리를 사용하세요.");
  return output;
}

/** 기존 private 입력도 읽기 전용으로 대조한다. 알 수 없는 파일과 symlink는 받지 않는다. */
export function checkLocalIngest(plan, outputRoot) {
  const output = outputLocation(plan, outputRoot, true), expected = new Map(plan.records.map((record) => [record.path, record]));
  const manifestPath = join(output, "manifest-v2.json");
  if (lstatSync(manifestPath).isSymbolicLink() || !lstatSync(manifestPath).isFile()) fail("manifest symlink를 거부합니다.");
  const actualManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!isDeepStrictEqual(actualManifest, plan.manifest)) fail("재현 manifest의 ID·sourcePath·해시·바이트가 다릅니다.");
  const found = new Set();
  function walk(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, item.name), path = relative(output, full).split(sep).join("/");
      if (item.isSymbolicLink()) fail("출력 트리의 symlink를 거부합니다.");
      if (item.isDirectory()) { walk(full); continue; }
      if (!item.isFile()) fail(`일반 파일이 아닌 출력을 거부합니다: ${path}`);
      if (path === "manifest-v2.json") continue;
      if (path === "ingestion-origins.json" || path === "projection-additions-20261028.json") {
        const origins = JSON.parse(readFileSync(full, "utf8"));
        if (origins.schema !== "toonstudio.local-private-ingestion-origins.v1" || !Array.isArray(origins.packs)) fail("원본 귀속 sidecar 계약이 다릅니다.");
        if (origins.libraryRoot && realpathSync(origins.libraryRoot) !== plan.libraryRoot) fail("sidecar의 원본 루트가 다릅니다.");
        for (const origin of origins.packs) {
          const config = plan.config.packs.find((pack) => pack.ingestId === origin.ingestId);
          if (!config || ["librarySource", "files", "bytes"].some((key) => config[key] !== origin[key])) fail("sidecar의 팩 귀속이 다릅니다.");
        }
        continue;
      }
      const record = expected.get(path);
      if (!record || !item.isFile()) fail(`알 수 없는 출력 파일: ${path}`);
      const body = readFileSync(full);
      if (body.length !== record.bytes || hash(body) !== record.sha256) fail(`출력 크기·SHA-256 불일치: ${path}`);
      found.add(path);
    }
  }
  walk(output);
  if (found.size !== expected.size) fail("출력 GLB 파일이 빠졌습니다.");
  return plan.summary;
}

/** 복사만 사용해 출력 편집이 원본 inode에 영향을 주지 않는다. 완성·검증된 staging만 공개한다. */
export function writeLocalIngest(plan, outputRoot, { copyFile = copyFileSync } = {}) {
  const output = outputLocation(plan, outputRoot, false), stage = mkdtempSync(join(dirname(output), ".creator-bundle-ingest-"));
  let published = false;
  try {
    for (const record of plan.records) {
      const destination = join(stage, record.path);
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      copyFile(record.sourceReal, destination, constants.COPYFILE_EXCL);
    }
    writeFileSync(join(stage, "manifest-v2.json"), `${JSON.stringify(plan.manifest, null, 2)}\n`, { mode: 0o600 });
    writeFileSync(join(stage, "ingestion-origins.json"), `${JSON.stringify({ schema: "toonstudio.local-private-ingestion-origins.v1", copyPolicy: plan.config.copyPolicy, projectionSha256: plan.config.projectionSha256, packs: plan.config.packs, rawModelsPublished: false }, null, 2)}\n`, { mode: 0o600 });
    checkLocalIngest(plan, stage);
    if (existsSync(output)) fail("출력 디렉터리가 작업 중 생겨 덮어쓰지 않습니다.");
    renameSync(stage, output); published = true;
    return plan.summary;
  } finally { if (!published) rmSync(stage, { recursive: true, force: true }); }
}

export function dispatchCompositeIngestCli(argv, { readConfig = (path) => JSON.parse(readFileSync(path, "utf8")), invoke = (args) => execFileSync(process.execPath, args, { encoding: "utf8", maxBuffer: 1024 * 1024 }) } = {}) {
  // 새 계약만 별도 CLI로 분기하며 기존 v1 함수·동기 문자열 반환 규칙은 그대로 둔다.
  const tokens = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (tokens.has(flag)) fail(`중복된 인자: ${flag}`);
    if (["--help", "--check", "--dry-run", "--write"].includes(flag)) { tokens.set(flag, true); continue; }
    if (!["--library-root", "--input-root", "--output-root", "--config", "--projection", "--pack-rights", "--python"].includes(flag)
      || !argv[index + 1] || argv[index + 1].startsWith("--")) fail(`알 수 없거나 값이 없는 인자: ${flag}`);
    tokens.set(flag, argv[++index]);
  }
  if (!tokens.has("--help") && (!tokens.has("--library-root")
    || ["--check", "--dry-run", "--write"].filter((flag) => tokens.has(flag)).length > 1)) fail("--library-root와 서로 겹치지 않는 실행 모드가 필요합니다.");
  const selectedConfig = tokens.get("--config") ?? DEFAULT_CONFIG;
  if (!tokens.has("--help") && readConfig(selectedConfig)?.schema === "toonstudio.creator-bundle-composite-ingest.v1") {
    try {
      return invoke([join(REPO_ROOT, "scripts/rebuild-creator-bundle-composite-ingest.mjs"), ...argv]).trim();
    } catch { fail("composite 재현 검사가 실패했습니다. 새 CLI의 --help와 --check --input-root <prepared/input> 경로를 확인하세요."); }
  }
  return null;
}

export function runLocalIngestCli(argv) {
  const delegated = dispatchCompositeIngestCli(argv);
  if (delegated !== null) return delegated;
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (["--dry-run", "--check", "--help"].includes(flag)) { if (options[flag]) fail(`중복된 인자: ${flag}`); options[flag] = true; continue; }
    if (!["--library-root", "--output-root", "--config", "--projection", "--pack-rights"].includes(flag) || !argv[i + 1] || argv[i + 1].startsWith("--") || options[flag]) fail(`알 수 없거나 중복된 인자: ${flag}`);
    options[flag] = argv[++i];
  }
  if (options["--help"]) return "node scripts/rebuild-creator-bundle-local-ingest.mjs --library-root <dir> [--output-root <new-private-dir>] [--dry-run|--check] [--config <file>] [--projection <file>] [--pack-rights <file>]\n복사만 사용하며 원본·공개 경로는 변경하지 않습니다. --check는 기존 출력을 읽기 전용으로 검증합니다.\ncomposite 설정은 --input-root <prepared/input>이 필요합니다. 기존 --check --output-root <prepared/input> 읽기 별칭도 유지합니다. 새 쓰기는 --input-root와 별도의 --output-root를 지정하세요.";
  if (!options["--library-root"] || (options["--dry-run"] && options["--check"])) fail("--library-root와 서로 겹치지 않는 실행 모드가 필요합니다.");
  const config = JSON.parse(readFileSync(options["--config"] ?? DEFAULT_CONFIG, "utf8")); validateLocalIngestConfig(config);
  const plan = buildLocalIngestPlan({ libraryRoot: options["--library-root"], config, projectionBytes: readFileSync(options["--projection"] ?? join(REPO_ROOT, config.projection)), ledger: loadPackRightsLedger(options["--pack-rights"]) });
  if (options["--dry-run"]) { if (options["--output-root"]) outputLocation(plan, options["--output-root"], false); }
  else if (options["--check"]) checkLocalIngest(plan, options["--output-root"]);
  else writeLocalIngest(plan, options["--output-root"]);
  return JSON.stringify({ mode: options["--dry-run"] ? "dry-run" : options["--check"] ? "check" : "copy", ...plan.summary });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(runLocalIngestCli(process.argv.slice(2))); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; }
}
