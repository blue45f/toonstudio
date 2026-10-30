#!/usr/bin/env node
/** 검증된 private 입력을 원본 복사·Atlas 재생성과 대조한다. 원본만으로 생성하는 명령이 아니다. */
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, closeSync, readSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./lib/repo-paths.mjs";
import { relativePathProblem } from "./lib/creator-bundle-pack-rights-form.mjs";
import { loadPackRightsLedger } from "./lib/creator-bundle-pack-rights.mjs";
import { buildThemePacks } from "./generate-creator-bundle-theme-packs.mjs";
import { buildLocalIngestPlan } from "./rebuild-creator-bundle-local-ingest.mjs";

export const COMPOSITE_SCHEMA = "toonstudio.creator-bundle-composite-ingest.v1";
export const BASE_REVISION = "4685be49e2c108ad1602fb1851670bdf6eca002d";
export const BASE_CONFIG_PATH = "config/creator-bundle-local-ingest.json";
export const COMPOSITE_CONFIG_PATH = "config/creator-bundle-composite-ingest.json";
export const PROJECTION_PATH = "apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json";
const THEMES_PATH = "apps/web/public/assets/3d/environments/bundle-v1/manifest.json";
const SIDECARS = ["manifest-v2.json", "preparation-proof.json"];
const hash = (body) => createHash("sha256").update(body).digest("hex");
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const inside = (root, path) => { const r = relative(root, path); return r === "" || (!isAbsolute(r) && r !== ".." && !r.startsWith(`..${sep}`)); };
const fail = (message) => { throw new Error(`${message} 입력·설정을 확인하고 --check로 다시 검사하세요.`); };
function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail("설정 또는 descriptor의 필드가 계약과 다릅니다.");
}
function safeRelative(value) {
  if (relativePathProblem(value, 800) !== null || value.split("/").some((p) => p === "")) fail("루트 밖 이동 또는 모호한 상대 경로를 거부합니다.");
  return value;
}
function checkedPath(root, name, directory = false) {
  let current = root;
  for (const part of safeRelative(name).split("/")) {
    const matches = readdirSync(current).filter((entry) => entry.toLowerCase() === part.toLowerCase());
    if (matches.length !== 1 || matches[0] !== part) fail("없는 경로 또는 대소문자가 모호한 경로입니다.");
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) fail("심볼릭 링크 입력을 거부합니다.");
  }
  if (!(directory ? lstatSync(current).isDirectory() : lstatSync(current).isFile())) fail("필요한 일반 파일 또는 디렉터리가 아닙니다.");
  return current;
}
function checkedAbsolute(value, directory = false) {
  const requested = resolve(value), anchor = requested.startsWith(sep) ? sep : dirname(requested);
  return checkedPath(anchor, relative(anchor, requested).split(sep).join("/"), directory);
}
function fileState(path) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink()) fail("일반 파일만 해시 검사할 수 있습니다.");
  const checksum = createHash("sha256"), fd = openSync(path, "r"), buffer = Buffer.allocUnsafe(1024 * 1024);
  try { let count; while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) checksum.update(buffer.subarray(0, count)); }
  finally { closeSync(fd); }
  const after = lstatSync(path);
  if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs) fail("읽는 동안 파일이 변경됐습니다.");
  return { bytes: after.size, sha256: checksum.digest("hex") };
}
function assertState(path, expected) {
  if (!isDeepStrictEqual(fileState(checkedAbsolute(path)), expected)) fail("계획 이후 입력의 바이트·SHA256이 변경됐습니다.");
}
function remember(states, path, expected, read = true) {
  path = checkedAbsolute(path);
  const state = fileState(path);
  if (expected && !isDeepStrictEqual(state, expected)) fail("실제 입력의 바이트·SHA256이 기록과 다릅니다.");
  if (states.has(path) && !isDeepStrictEqual(states.get(path), state)) fail("중복 입력의 해시가 서로 다릅니다.");
  states.set(path, state);
  if (!read) return undefined;
  const body = readFileSync(path);
  if (body.length !== state.bytes || hash(body) !== state.sha256) fail("파싱할 입력 바이트가 해시 검사 이후 변경됐습니다.");
  return body;
}

export function validateCompositeConfig(config) {
  exact(config, ["schema", "version", "copyPolicy", "base", "atlas", "projection", "projectionSha256", "snapshotGeneratedAt", "expected"]);
  exact(config.base, ["revision", "configPath", "configSha256", "projectionPath", "projectionSha256"]);
  exact(config.atlas, ["recipe", "recipeSha256", "preparationProofSha256"]);
  exact(config.expected, ["baseAssets", "derivedAssets", "files", "bytes"]);
  if (config.schema !== COMPOSITE_SCHEMA || config.version !== 1 || config.copyPolicy !== "copy-only-no-hardlinks"
    || config.base.revision !== BASE_REVISION || config.base.configPath !== BASE_CONFIG_PATH || config.base.projectionPath !== PROJECTION_PATH
    || ![PROJECTION_PATH, PROJECTION_PATH.replace(/\.json$/u, `.${config.projectionSha256}.json`)].includes(config.projection)
    || ![config.base.configSha256, config.base.projectionSha256, config.atlas.recipeSha256, config.atlas.preparationProofSha256, config.projectionSha256].every(sha)
    || !Object.values(config.expected).every(positive) || config.expected.baseAssets + config.expected.derivedAssets !== config.expected.files
    || typeof config.snapshotGeneratedAt !== "string" || !Number.isFinite(Date.parse(config.snapshotGeneratedAt))) fail("composite 버전·고정 기준·SHA·합계 계약이 올바르지 않습니다.");
  safeRelative(config.atlas.recipe);
}

export function readPinnedBase(config, { repoRoot = REPO_ROOT, readGit = (args) => execFileSync("git", args, { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 }) } = {}) {
  const configBytes = readGit(["show", `${config.base.revision}:${config.base.configPath}`]);
  const projectionBytes = readGit(["show", `${config.base.revision}:${config.base.projectionPath}`]);
  if (hash(configBytes) !== config.base.configSha256 || hash(projectionBytes) !== config.base.projectionSha256) fail("고정 Git 객체의 설정·projection SHA가 다릅니다.");
  const baseConfig = JSON.parse(configBytes);
  if (baseConfig.schema !== "toonstudio.creator-bundle-local-ingest.v1" || baseConfig.projectionSha256 !== hash(projectionBytes)) fail("고정 v1 설정과 projection 연결이 다릅니다.");
  return { config: baseConfig, projectionBytes, projection: JSON.parse(projectionBytes) };
}

export function runDerivedVerifier({ repoRoot, python, recipePath, ledgerPath, libraryRoot, inputRoot, pinnedProjection }) {
  const parent = checkedAbsolute(realpathSync(tmpdir()), true);
  if ([repoRoot, libraryRoot, inputRoot].some((root) => inside(root, parent))) fail("임시 폴더는 저장소·원본·검사 대상 밖이어야 합니다. TMPDIR을 확인하세요.");
  const temporary = mkdtempSync(join(parent, "toonstudio-composite-atlas-")), owner = lstatSync(temporary);
  try {
    const projectionPath = join(temporary, "pinned-projection.json");
    writeFileSync(projectionPath, pinnedProjection, { flag: "wx", mode: 0o600 });
    let body;
    try {
      body = execFileSync(python, ["-B", join(repoRoot, "scripts/prepare-creator-bundle-atlas-intake.py"),
        "--recipe", recipePath, "--projection", projectionPath, "--pack-rights", ledgerPath,
        "--library-root", libraryRoot, "--check", "--verify-derived-root", inputRoot],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 120_000 });
    } catch { fail("Python의 원본·Atlas·파생 입력 재생성 검사가 실패했습니다. 해당 CLI를 --check로 검사하세요."); }
    const result = JSON.parse(body);
    const snapshot = result.inputFiles?.find((item) => item.path === projectionPath);
    if (!snapshot || snapshot.sha256 !== hash(pinnedProjection) || snapshot.bytes !== pinnedProjection.length) fail("Python이 고정 projection 바이트를 검사하지 않았습니다.");
    result.inputFiles = result.inputFiles.filter((item) => item.path !== projectionPath);
    return result;
  } finally {
    if (existsSync(temporary) && !lstatSync(temporary).isSymbolicLink() && lstatSync(temporary).dev === owner.dev && lstatSync(temporary).ino === owner.ino) rmSync(temporary, { recursive: true, force: true });
  }
}

function registerDescriptors(assets) {
  const ids = new Set(), paths = new Set(), sources = new Set();
  for (const asset of assets) {
    exact(asset, ["id", "packId", "role", "format", "sourcePath", "files"]);
    if (typeof asset.id !== "string" || typeof asset.packId !== "string" || !/^cbv1-ingest-[a-z0-9-]+$/u.test(asset.packId)
      || !asset.id.startsWith(asset.packId + "-") || asset.role !== "runtime" || asset.format !== "glb"
      || !Array.isArray(asset.files) || asset.files.length !== 1) fail("에셋의 ID·팩·GLB descriptor 계약이 다릅니다.");
    const primary = asset.files[0];
    exact(primary, ["kind", "path", "bytes", "sha256"]);
    safeRelative(asset.sourcePath); safeRelative(primary.path);
    const source = `${asset.packId}\0${asset.sourcePath}`;
    if (primary.kind !== "primary" || !asset.sourcePath.endsWith(".glb") || primary.path !== asset.packId + "/native/" + asset.sourcePath
      || !positive(primary.bytes) || !sha(primary.sha256) || ids.has(asset.id) || paths.has(primary.path) || sources.has(source)) fail("에셋 경로·해시·바이트 또는 중복 source 계약이 다릅니다.");
    ids.add(asset.id); paths.add(primary.path); sources.add(source);
  }
}

function checkInputTree(root, assets) {
  const expected = new Set([...SIDECARS, ...assets.map((asset) => asset.files[0].path)]), directories = new Set();
  for (const file of expected) { let parent = dirname(file); while (parent !== ".") { directories.add(parent.split(sep).join("/")); parent = dirname(parent); } }
  const found = new Set();
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name), name = relative(root, full).split(sep).join("/");
      if (entry.isSymbolicLink()) fail("검사 입력의 심볼릭 링크를 거부합니다.");
      if (entry.isDirectory()) { if (!directories.has(name)) fail("등록하지 않은 입력 디렉터리가 있습니다."); walk(full); }
      else if (!entry.isFile() || !expected.has(name)) fail("등록하지 않은 payload·sidecar·특수 파일이 있습니다.");
      else found.add(name);
    }
  }
  walk(root);
  if (found.size !== expected.size) fail("입력의 payload 또는 필수 sidecar가 빠졌습니다.");
  for (const asset of assets) {
    const primary = asset.files[0];
    assertState(checkedPath(root, primary.path), { bytes: primary.bytes, sha256: primary.sha256 });
  }
}

export function assertBaseProjectionPreserved(baseProjection, currentProjection) {
  const current = new Map(currentProjection.assets.map((asset) => [asset.id, asset]));
  for (const old of baseProjection.assets) {
    if (!isDeepStrictEqual(current.get(old.id), old)) fail("역사 에셋의 ID·경로·바이트·SHA·tris·팩 소속이 바뀌었습니다.");
  }
}

function generatedProjection(plan, root) {
  const { output, stats } = plan.generate({ manifestV2: plan.manifest, themesDoc: plan.themes, assetRoot: root, ledger: plan.ledger, onError: fail });
  if (stats.hashMismatch || output.assets.length !== plan.manifest.assets.length
    || output.totals.placeableAssets !== plan.config.expected.files || output.assets.reduce((sum, asset) => sum + asset.bytes, 0) !== plan.config.expected.bytes) fail("현재 생성기의 전수 권리·모바일 예산·GLB 입장 결과가 다릅니다.");
  if (!isDeepStrictEqual(output, plan.projection)) fail("실제 전체 생성 결과와 현재 공개 projection이 다릅니다.");
  assertBaseProjectionPreserved(plan.pinned.projection, output);
}

function ownerUriPath(packRoot, source, uri, allowParent = true) {
  if (typeof uri !== "string" || !uri || uri !== uri.trim() || /[\\?#]/u.test(uri)
    || Array.from(uri).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
    || /^[a-z][a-z0-9+.-]*:/iu.test(uri) || uri.startsWith("/") || /%(?![a-f0-9]{2})/iu.test(uri)) fail("소유 팩의 명시적 로컬 URI만 허용합니다.");
  let decoded;
  try { decoded = decodeURIComponent(uri); } catch { fail("URI 인코딩이 올바르지 않습니다."); }
  const raw = uri.split("/"), parts = decoded.split("/");
  if (raw.length !== parts.length || parts.some((part, index) => !part || part === "."
    || (part === ".." && (!allowParent || raw[index] !== part)))) fail("인코딩으로 숨긴 경로 또는 BIN 상위 이동을 거부합니다.");
  let current = dirname(source);
  for (const [index, part] of parts.entries()) {
    if (part === "..") {
      if (current === packRoot) fail("URI가 소유 팩 밖으로 이동합니다.");
      current = dirname(current);
    } else current = checkedPath(current, part, index < parts.length - 1);
  }
  if (!inside(packRoot, current)) fail("URI가 소유 팩 밖에 있습니다.");
  return current;
}

function sourcePlan(recipe, derived, proof, library, states, derivedInputs) {
  exact(recipe, ["schema", "version", "generatedAt", "packs"]);
  if (recipe.schema !== "toonstudio.creator-bundle-atlas-intake.v1" || recipe.version !== 1
    || !Array.isArray(recipe.packs) || recipe.packs.length === 0) fail("Atlas recipe의 버전 또는 팩 목록이 다릅니다.");
  const packs = new Map();
  for (const pack of recipe.packs) {
    const fields = ["catalogId", "ingestId", "packRoot", "sourceDirectory", "imagePaths"];
    exact(pack, Object.hasOwn(pack, "sourceFormat") ? [...fields, "sourceFormat"] : fields);
    if (Object.hasOwn(pack, "sourceFormat") && pack.sourceFormat !== "gltf") fail("지원하지 않는 recipe sourceFormat입니다.");
    if (typeof pack.ingestId !== "string" || packs.has(pack.ingestId) || !pack.imagePaths
      || typeof pack.imagePaths !== "object" || Array.isArray(pack.imagePaths) || Object.keys(pack.imagePaths).length === 0) fail("Atlas 팩 또는 이미지 매핑이 중복되거나 올바르지 않습니다.");
    packs.set(pack.ingestId, pack);
  }
  const hasGltf = recipe.packs.some((pack) => pack.sourceFormat === "gltf"), mappings = new Map(), proofs = new Map();
  if (hasGltf) {
    if (!Array.isArray(derived.sourceInputs) || derived.sourceInputs.length !== derived.assets.length
      || !Array.isArray(proof.assets) || proof.assets.length !== derived.assets.length) fail("glTF 원본 sourceInputs 또는 준비 증거가 빠졌습니다.");
    const assets = new Map(derived.assets.map((asset) => [`${asset.packId}\0${asset.sourcePath}`, asset]));
    for (const item of derived.sourceInputs) {
      exact(item, ["packId", "sourcePath", "originalSourcePath", "sourceFormat"]);
      const pack = packs.get(item.packId), key = `${item.packId}\0${item.sourcePath}`;
      safeRelative(item.sourcePath); safeRelative(item.originalSourcePath);
      const format = pack?.sourceFormat ?? "glb";
      if (!pack || !assets.has(key) || mappings.has(key) || item.sourceFormat !== format
        || item.originalSourcePath !== (format === "gltf" ? item.sourcePath.replace(/\.glb$/u, ".gltf") : item.sourcePath)) fail("sourceInputs의 형식·원본/출력 매핑 또는 중복이 recipe와 다릅니다.");
      mappings.set(key, item);
    }
    for (const item of proof.assets) {
      if (!item || typeof item.outputPath !== "string" || proofs.has(item.outputPath)) fail("준비 증거의 출력 매핑이 중복되거나 없습니다.");
      proofs.set(item.outputPath, item);
    }
  } else if (Object.hasOwn(derived, "sourceInputs")) fail("GLB 전용 입력에 glTF sourceInputs를 혼합할 수 없습니다.");
  const sourceTrees = new Map(), sourceFormats = new Map();
  const requireInput = (path, expected = states.get(path)) => {
    if (!derivedInputs.has(path) || !expected || !isDeepStrictEqual(states.get(path), expected)) fail("원본 출처의 실제 입력 fingerprint가 누락됐거나 준비 증거와 다릅니다.");
  };
  for (const pack of recipe.packs) {
    const packRoot = checkedPath(library, safeRelative(pack.packRoot), true);
    const directory = checkedPath(packRoot, safeRelative(pack.sourceDirectory), true), originals = [], used = new Set();
    if (sourceTrees.has(directory)) fail("Atlas 원본 폴더의 명시 소속이 중복입니다.");
    for (const asset of derived.assets.filter((entry) => entry.packId === pack.ingestId)) {
      const item = mappings.get(`${asset.packId}\0${asset.sourcePath}`), name = item?.originalSourcePath ?? asset.sourcePath;
      const original = checkedPath(directory, name);
      requireInput(original); originals.push(original);
      if (pack.sourceFormat !== "gltf") continue;
      const record = proofs.get(asset.files[0].path);
      exact(record, ["catalogId", "sourcePath", "outputPath", "source", "derived", "normalization", "sourceFormat", "originalSourcePath", "sourceBuffer"]);
      if (record.catalogId !== pack.catalogId || record.sourcePath !== asset.sourcePath || record.sourceFormat !== "gltf"
        || record.originalSourcePath !== name || !isDeepStrictEqual(record.derived, { bytes: asset.files[0].bytes, sha256: asset.files[0].sha256 })) fail("glTF 준비 증거의 원본·출력 출처가 다릅니다.");
      requireInput(original, record.source);
      const document = JSON.parse(remember(states, original, record.source));
      if (!Array.isArray(document.buffers) || document.buffers.length !== 1 || !positive(document.buffers[0]?.byteLength)
        || !Array.isArray(document.images) || document.images.length === 0) fail("glTF의 단일 BIN 또는 이미지 계약이 다릅니다.");
      const binary = ownerUriPath(packRoot, original, document.buffers[0].uri, false);
      exact(record.sourceBuffer, ["path", "bytes", "sha256"]);
      if (!binary.endsWith(".bin") || binary !== checkedPath(packRoot, record.sourceBuffer.path)
        || record.sourceBuffer.bytes !== document.buffers[0].byteLength) fail("glTF BIN의 원문 URI·길이·출처가 준비 증거와 다릅니다.");
      requireInput(binary, { bytes: record.sourceBuffer.bytes, sha256: record.sourceBuffer.sha256 });
      const embedded = record.normalization?.embeddedTextures;
      if (record.normalization?.geometryBytesPreserved !== true || record.normalization.externalImageUrisRemaining !== 0
        || !Array.isArray(embedded) || embedded.length !== document.images.length) fail("glTF 원문·이미지 보존 증거가 다릅니다.");
      for (const [index, image] of document.images.entries()) {
        if (Object.hasOwn(image, "bufferView") || !Object.hasOwn(pack.imagePaths, image.uri)) fail("승인하지 않은 glTF 이미지 URI입니다.");
        const path = ownerUriPath(packRoot, original, image.uri);
        if (path !== checkedPath(packRoot, pack.imagePaths[image.uri])) fail("이미지 URI가 명시된 소유 팩 매핑과 다릅니다.");
        exact(embedded[index], ["uri", "sha256", "bytes"]);
        if (embedded[index].uri !== image.uri) fail("내부화한 이미지의 URI가 원문과 다릅니다.");
        requireInput(path, { bytes: embedded[index].bytes, sha256: embedded[index].sha256 }); used.add(image.uri);
      }
    }
    if (originals.length === 0) fail("Atlas 원본 폴더의 명시 소속이 없습니다.");
    if (pack.sourceFormat === "gltf") {
      if (!isDeepStrictEqual([...used].sort(), Object.keys(pack.imagePaths).sort())) fail("glTF recipe에 사용하지 않는 이미지 매핑이 있습니다.");
      sourceFormats.set(directory, "gltf");
    }
    sourceTrees.set(directory, originals.sort());
  }
  if (derived.assets.some((asset) => !packs.has(asset.packId))) fail("recipe에 없는 파생 팩이 있습니다.");
  return { sourceTrees, ...(hasGltf ? { sourceFormats } : {}) };
}

export function assertCompositePlanCurrent(plan, root = plan.inputRoot) {
  for (const [directory, expected] of plan.sourceTrees) {
    const sourceFormat = plan.sourceFormats?.get(directory) ?? "glb";
    const found = [];
    function walk(current) {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const path = join(current, entry.name);
        if (entry.isSymbolicLink()) fail("Atlas 원본 목록에 심볼릭 링크가 생겼습니다.");
        if (entry.isDirectory()) walk(path);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith("." + sourceFormat)) found.push(path);
        else if (!entry.isFile()) fail("Atlas 원본 목록에 특수 파일이 생겼습니다.");
      }
    }
    walk(directory);
    if (!isDeepStrictEqual(found.sort(), expected)) fail("Python 검증 이후 Atlas 원본 " + sourceFormat.toUpperCase() + " 목록이 변경됐습니다.");
  }
  for (const [path, state] of plan.states) assertState(path, state);
  checkInputTree(plan.inputRoot, plan.manifest.assets);
  if (root !== plan.inputRoot) checkInputTree(root, plan.manifest.assets);
  if (!isDeepStrictEqual(JSON.parse(readFileSync(join(root, "manifest-v2.json"))), plan.manifest)
    || fileState(join(root, "preparation-proof.json")).sha256 !== plan.config.atlas.preparationProofSha256) fail("전체 manifest 또는 준비 증거가 변경됐습니다.");
}

export function buildCompositeIngestPlan({ libraryRoot, inputRoot, config, configPath, ledgerPath, python = "python3", repoRoot = REPO_ROOT }, dependencies = {}) {
  validateCompositeConfig(config);
  const states = new Map(), root = checkedAbsolute(repoRoot, true), library = checkedAbsolute(libraryRoot, true), input = checkedAbsolute(inputRoot, true);
  if (inside(root, input) || inside(library, input) || input.split(sep).some((part) => ["public", "dist"].includes(part))) fail("검사 대상은 저장소·원본·공개 경로 밖의 private 입력이어야 합니다.");
  if (configPath && !isDeepStrictEqual(JSON.parse(remember(states, configPath)), config)) fail("읽은 composite 설정과 실행 설정이 다릅니다.");
  const rightsPath = checkedAbsolute(ledgerPath ?? join(root, "config/creator-bundle-pack-rights.json"));
  remember(states, rightsPath, undefined, false);
  const ledger = (dependencies.loadLedger ?? loadPackRightsLedger)(rightsPath);
  const projectionBody = remember(states, checkedPath(root, config.projection));
  if (hash(projectionBody) !== config.projectionSha256) fail("현재 공개 projection의 SHA가 다릅니다.");
  const projection = JSON.parse(projectionBody), themes = JSON.parse(remember(states, checkedPath(root, THEMES_PATH)));
  const recipePath = checkedPath(root, config.atlas.recipe), recipeBody = remember(states, recipePath), recipe = JSON.parse(recipeBody);
  if (hash(recipeBody) !== config.atlas.recipeSha256 || recipe.generatedAt !== config.snapshotGeneratedAt) fail("Atlas recipe SHA 또는 명시 생성 시각이 다릅니다.");
  const pinned = (dependencies.readPinned ?? readPinnedBase)(config, { repoRoot: root });
  const base = (dependencies.buildBase ?? buildLocalIngestPlan)({ libraryRoot: library, config: pinned.config, projectionBytes: pinned.projectionBytes, ledger });
  if (base.manifest.assets.length !== config.expected.baseAssets) fail("고정 기존 입력의 전수 개수가 다릅니다.");
  for (const asset of base.manifest.assets) {
    const pack = pinned.config.packs.find((item) => item.ingestId === asset.packId);
    if (!pack) fail("기존 원본 팩 설정이 빠졌습니다.");
    const primary = asset.files[0];
    remember(states, checkedPath(library, `${pack.librarySource}/${asset.sourcePath}`), { bytes: primary.bytes, sha256: primary.sha256 }, false);
  }
  const manifestBody = remember(states, checkedPath(input, SIDECARS[0])), proofBody = remember(states, checkedPath(input, SIDECARS[1]));
  if (hash(proofBody) !== config.atlas.preparationProofSha256) fail("준비 증거 SHA가 명시 설정과 다릅니다.");
  const proof = JSON.parse(proofBody);
  if (proof.schema !== "toonstudio.creator-bundle-atlas-intake.v1-proof" || proof.productApplied !== false || proof.studioRuntimeVerified !== false) fail("준비 증거의 스키마 또는 검증 범위가 다릅니다.");
  for (const name of ["scripts/prepare-creator-bundle-atlas-intake.py", "scripts/normalize_studio_asset_glb.py"]) remember(states, checkedPath(root, name), undefined, false);
  const derived = (dependencies.verifyDerived ?? runDerivedVerifier)({ repoRoot: root, python, recipePath, ledgerPath: rightsPath, libraryRoot: library, inputRoot: input, pinnedProjection: pinned.projectionBytes });
  if (derived.mode !== "verify-derived" || derived.persistentOutputWritten !== false || derived.summary?.inputUnchanged !== true || derived.summary?.targetUnchanged !== true
    || !Array.isArray(derived.assets) || derived.assets.length !== config.expected.derivedAssets || derived.summary.derivedAssets !== derived.assets.length
    || derived.summary.derivedBytes !== derived.assets.reduce((sum, asset) => sum + (asset.files?.[0]?.bytes ?? 0), 0)
    || derived.targetManifest?.sha256 !== hash(manifestBody) || derived.targetManifest?.bytes !== manifestBody.length
    || derived.controls?.recipe?.sha256 !== hash(recipeBody) || derived.controls?.rights?.sha256 !== states.get(rightsPath).sha256
    || derived.controls?.projection?.sha256 !== hash(pinned.projectionBytes) || !Array.isArray(derived.inputFiles) || derived.inputFiles.length === 0) fail("Python의 실제 파생 재생성·입력 불변·대상 manifest 증거가 다릅니다.");
  const derivedInputs = new Set();
  for (const item of derived.inputFiles) {
    exact(item, ["path", "bytes", "sha256"]);
    if (!isAbsolute(item.path) || !positive(item.bytes) || !sha(item.sha256) || derivedInputs.has(item.path)
      || !(inside(library, item.path) || [recipePath, rightsPath].includes(item.path))) fail("파생 검증의 실제 입력 fingerprint가 올바르지 않습니다.");
    derivedInputs.add(item.path);
    remember(states, item.path, { bytes: item.bytes, sha256: item.sha256 }, false);
  }
  const assets = [...structuredClone(base.manifest.assets), ...derived.assets];
  registerDescriptors(assets);
  const manifest = { ...structuredClone(base.manifest), generatedAt: config.snapshotGeneratedAt, totals: { ...base.manifest.totals, assets: assets.length }, assets };
  if (assets.length !== config.expected.files || assets.reduce((sum, asset) => sum + asset.files[0].bytes, 0) !== config.expected.bytes
    || !isDeepStrictEqual(JSON.parse(manifestBody), manifest)) fail("전체 private manifest가 원본·Atlas 재현 결과와 다릅니다.");
  const sources = sourcePlan(recipe, derived, proof, library, states, derivedInputs);
  const plan = { config, states, ...sources, repoRoot: root, libraryRoot: library, inputRoot: input, pinned, ledger, themes, projection, manifest,
    generate: dependencies.generate ?? buildThemePacks, summary: { baseAssets: base.manifest.assets.length, derivedAssets: derived.assets.length, files: assets.length, bytes: config.expected.bytes } };
  assertCompositePlanCurrent(plan);
  generatedProjection(plan, input);
  assertCompositePlanCurrent(plan);
  return plan;
}

export function writeCompositeIngest(plan, outputRoot, { copyFile = copyFileSync, rename = renameSync } = {}) {
  if (!outputRoot) fail("쓰기에는 --output-root로 새 private 디렉터리를 지정해야 합니다.");
  const requested = resolve(outputRoot), parent = checkedAbsolute(dirname(requested), true), output = join(parent, basename(requested));
  if ([plan.repoRoot, plan.libraryRoot, plan.inputRoot].some((root) => inside(root, output) || inside(output, root))
    || output.split(sep).some((part) => ["public", "dist"].includes(part)) || existsSync(output)) fail("출력은 저장소·원본·기존 입력·공개 경로 밖의 새 디렉터리여야 합니다.");
  assertCompositePlanCurrent(plan);
  mkdirSync(output, { mode: 0o700 });
  const owner = lstatSync(output);
  let stage, stageOwner, published = false;
  const owns = (path, identity) => path && existsSync(path) && !lstatSync(path).isSymbolicLink() && lstatSync(path).dev === identity.dev && lstatSync(path).ino === identity.ino;
  try {
    stage = mkdtempSync(join(output, ".staging-")); stageOwner = lstatSync(stage);
    for (const name of [...plan.manifest.assets.map((asset) => asset.files[0].path), ...SIDECARS]) {
      if (!owns(output, owner) || !owns(stage, stageOwner)) fail("예약한 출력 디렉터리가 변경됐습니다.");
      const source = checkedPath(plan.inputRoot, name), destination = join(stage, name);
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      copyFile(source, destination, constants.COPYFILE_EXCL);
      const left = statSync(source), right = statSync(destination);
      if (left.dev === right.dev && left.ino === right.ino) fail("하드링크 복사를 거부합니다.");
    }
    assertCompositePlanCurrent(plan, stage);
    generatedProjection(plan, stage);
    assertCompositePlanCurrent(plan, stage);
    if (!owns(output, owner) || !owns(stage, stageOwner) || existsSync(join(output, "input"))) fail("예약한 출력이 변경돼 게시하지 않습니다.");
    rename(stage, join(output, "input")); published = true;
    return { ...plan.summary, inputRoot: join(output, "input") };
  } finally {
    if (!published && owns(output, owner) && owns(stage, stageOwner)) rmSync(stage, { recursive: true, force: true });
    if (!published && owns(output, owner) && readdirSync(output).length === 0) rmdirSync(output);
  }
}

export function parseCompositeArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (Object.hasOwn(options, flag)) fail("중복된 인자입니다: " + flag);
    if (["--check", "--dry-run", "--write", "--help"].includes(flag)) { options[flag] = true; continue; }
    if (!["--library-root", "--input-root", "--output-root", "--config", "--pack-rights", "--python"].includes(flag) || !argv[i + 1] || argv[i + 1].startsWith("--")) fail("알 수 없거나 값이 없는 인자입니다: " + flag);
    options[flag] = argv[++i];
  }
  if (options["--help"]) return options;
  if (["--check", "--dry-run", "--write"].filter((flag) => options[flag]).length > 1) fail("--check·--dry-run·--write 중 하나만 지정하세요.");
  options.check = Boolean(options["--check"] || options["--dry-run"]);
  if (options.check && options["--output-root"]) {
    if (options["--input-root"]) fail("읽기 검사에는 --input-root와 기존 호환 --output-root를 함께 쓰지 마세요.");
    options["--input-root"] = options["--output-root"]; delete options["--output-root"];
  }
  if (!options["--library-root"] || !options["--input-root"] || (!options.check && !options["--output-root"])) fail("--library-root·검증된 --input-root와 쓰기일 때 새 --output-root가 필요합니다.");
  return options;
}

export function runCompositeIngestCli(argv, dependencies = {}) {
  const options = parseCompositeArgs(argv);
  if (options["--help"]) return "검증된 private 입력 재현: --library-root <원본> --input-root <prepared/input> (--check | --write --output-root <새 private envelope>)\n기존 --check --output-root <prepared/input>도 읽기 별칭으로 허용합니다. 원본만으로 생성하는 명령이 아닙니다.";
  const configPath = resolve(options["--config"] ?? join(REPO_ROOT, COMPOSITE_CONFIG_PATH));
  const plan = buildCompositeIngestPlan({ libraryRoot: options["--library-root"], inputRoot: options["--input-root"], configPath,
    config: JSON.parse(readFileSync(configPath)), ledgerPath: options["--pack-rights"], python: options["--python"] }, dependencies);
  const result = options.check ? plan.summary : writeCompositeIngest(plan, options["--output-root"]);
  return JSON.stringify({ mode: options.check ? "check" : "copy", ...result, persistentOutputWritten: !options.check });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(runCompositeIngestCli(process.argv.slice(2))); }
  catch (error) { console.error("composite 재현 실패: " + (error instanceof Error ? error.message : String(error))); process.exitCode = 2; }
}
