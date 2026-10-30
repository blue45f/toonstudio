#!/usr/bin/env node
/** 검증한 카탈로그의 불변 정적 JSON 2개와 빌드 고정 descriptor를 private 출력에 준비한다. */
import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./lib/repo-paths.mjs";
import { evaluateServeDecision, packRightsProjection, validatePackRightsLedger } from "./lib/creator-bundle-pack-rights.mjs";
import { relativePathProblem } from "./lib/creator-bundle-pack-rights-form.mjs";
import { BUNDLE_V2_BUCKET, BUNDLE_V2_INDEX_KEY, BUNDLE_V2_MANIFEST_SCHEMA, buildBundleV2DeployIndex, bundleV2ObjectKey, createBundleV2DeployPlan } from "./plan-creator-bundle-deploy.mjs";

export const RELEASE_SCHEMA = "toonstudio.bg3d-bundle-release.v1";
export const STATIC_DIRECTORY = "apps/web/public/assets/3d/environments/bundle-v1";
export const STATIC_URL_PREFIX = "/assets/3d/environments/bundle-v1/";
export const RELEASE_DESCRIPTOR_PATH = "apps/web/src/domains/creator/bg3d/studio-bg3d-bundle-release.generated.json";
const MAX_STATIC_BYTES = 25 * 1024 * 1024;
const hash = (body) => createHash("sha256").update(body).digest("hex");
const jsonBytes = (value) => Buffer.from(JSON.stringify(value) + "\n");
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const fail = (message) => { throw new Error(`${message} 입력과 출력 경로를 확인한 뒤 --check로 다시 검사하세요.`); };
const inside = (root, path) => { const r = relative(root, path); return r === "" || (!isAbsolute(r) && r !== ".." && !r.startsWith(`..${sep}`)); };

function safeRelative(value) {
  if (relativePathProblem(value, 800) !== null || value.split("/").some((part) => part === "")) fail("모호하거나 루트 밖으로 이동하는 상대 경로입니다.");
  return value;
}
function checkedPath(root, name, directory = false) {
  let path = root;
  for (const part of safeRelative(name).split("/")) {
    const matches = readdirSync(path).filter((entry) => entry.toLowerCase() === part.toLowerCase());
    if (matches.length !== 1 || matches[0] !== part) fail("경로가 없거나 대소문자가 모호합니다.");
    path = join(path, part);
    if (lstatSync(path).isSymbolicLink()) fail("심볼릭 링크를 거부합니다.");
  }
  if (!(directory ? lstatSync(path).isDirectory() : lstatSync(path).isFile())) fail("필요한 일반 파일 또는 디렉터리가 아닙니다.");
  return path;
}
function absolutePath(value, directory = false) {
  const path = resolve(value);
  if (path === sep && directory) return path;
  return checkedPath(sep, path.slice(sep.length).split(sep).join("/"), directory);
}
function fileState(path) {
  path = absolutePath(path);
  const before = lstatSync(path), checksum = createHash("sha256"), fd = openSync(path, "r"), buffer = Buffer.allocUnsafe(1024 * 1024);
  try { let n; while ((n = readSync(fd, buffer, 0, buffer.length, null)) > 0) checksum.update(buffer.subarray(0, n)); }
  finally { closeSync(fd); }
  const after = lstatSync(path);
  if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs) fail("해시를 읽는 동안 입력 파일이 바뀌었습니다.");
  return { bytes: after.size, sha256: checksum.digest("hex") };
}
function assertSources(release) {
  for (const item of release.sourceChecks) if (!isDeepStrictEqual(fileState(item.path), { bytes: item.bytes, sha256: item.sha256 })) fail("계획 이후 카탈로그·원장·GLB 입력이 변경됐습니다.");
}
function assertArtifacts(release) {
  if (release.files.length !== 3 || new Set(release.files.map((file) => file.path)).size !== 3) fail("발행 산출물은 정확히 세 파일이어야 합니다.");
  for (const file of release.files) if (!Buffer.isBuffer(file.body) || file.body.length !== file.bytes || hash(file.body) !== file.sha256) fail("발행할 본문과 SHA·바이트의 연결이 변경됐습니다.");
}

/** 기존 planner가 검증한 전수 GLB 계획과 원문 카탈로그 바이트를 서로 묶는다. */
export function createReleaseCatalog({ catalogBytes, deployPlan, ledger, sourceChecks = [] }) {
  if (!Buffer.isBuffer(catalogBytes) || !positive(catalogBytes.length) || catalogBytes.length > MAX_STATIC_BYTES
    || !Buffer.from(catalogBytes.toString("utf8")).equals(catalogBytes)) fail("카탈로그는 25MiB 이하의 올바른 UTF-8 JSON 원문이어야 합니다.");
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  if (catalog?.schema !== "toonstudio.bg3d-bundle-theme-packs.v1" || catalog.version !== 1 || catalog.inServiceOnly !== true || catalog.downloadable !== false
    || catalog.assetRoot !== "/assets/studio/bundle-v2/" || !Array.isArray(catalog.assets) || catalog.assets.length === 0 || !Array.isArray(catalog.packs)
    || deployPlan?.schema !== BUNDLE_V2_MANIFEST_SCHEMA || deployPlan.version !== 1 || deployPlan.bucket !== BUNDLE_V2_BUCKET || deployPlan.assetRoot !== catalog.assetRoot
    || deployPlan.keyScheme !== "sha256" || !Array.isArray(deployPlan.objects) || !Array.isArray(deployPlan.excludedByRights) || deployPlan.excludedByRights.length !== 0) fail("카탈로그 또는 검증된 배포 계획의 서비스 전용·권리·namespace 계약이 다릅니다.");
  if (validatePackRightsLedger(ledger).length !== 0) fail("유효한 현재 권리 원장이 필요합니다.");
  for (const pack of catalog.packs) {
    const decision = evaluateServeDecision(ledger, pack, { group: "pack" });
    if (!decision.serve || !isDeepStrictEqual(pack.rights, packRightsProjection(decision.entry))) {
      fail("카탈로그의 권리·제작자·표기 의무가 현재 원장과 다릅니다.");
    }
  }
  const bySha = new Map(), ids = new Set(), paths = new Set();
  let assetBytes = 0;
  for (const asset of catalog.assets) {
    if (!asset || typeof asset.id !== "string" || ids.has(asset.id) || typeof asset.path !== "string" || paths.has(asset.path)
      || !sha(asset.sha256) || !positive(asset.bytes) || !Number.isSafeInteger(asset.pack) || !catalog.packs[asset.pack]) fail("카탈로그 에셋 ID·경로·SHA·바이트·소속이 올바르지 않습니다.");
    safeRelative(asset.path);
    const pack = catalog.packs[asset.pack];
    if (pack.rights?.serve !== "allow" || pack.rights.commercialUse !== true || !Array.isArray(pack.ingestPackIds)
      || !pack.ingestPackIds.some((id) => asset.path.startsWith(id + "/native/") && asset.id.startsWith(id + "-"))) fail("카탈로그의 실제 팩 소속 또는 상업 이용 권리와 다릅니다.");
    const object = bySha.get(asset.sha256) ?? { bytes: asset.bytes, ids: [], sources: [] };
    if (object.bytes !== asset.bytes) fail("동일 SHA의 바이트 수가 다릅니다.");
    object.ids.push(asset.id); object.sources.push(asset.path); bySha.set(asset.sha256, object);
    ids.add(asset.id); paths.add(asset.path); assetBytes += asset.bytes;
  }
  if (!Number.isSafeInteger(assetBytes) || catalog.totals?.placeableAssets !== catalog.assets.length || catalog.totals?.packs !== catalog.packs.length) fail("카탈로그 전수 합계가 다릅니다.");
  const glbs = deployPlan.objects.filter((object) => object.source !== null), indexes = deployPlan.objects.filter((object) => object.source === null);
  if (glbs.length !== bySha.size || indexes.length !== 1 || deployPlan.objects.at(-1) !== indexes[0]) fail("계획의 고유 GLB 또는 마지막 legacy index 객체 수가 다릅니다.");
  const seen = new Set();
  let objectBytes = 0;
  for (const object of glbs) {
    const expected = bySha.get(object.sha256);
    if (!expected || seen.has(object.sha256) || object.key !== bundleV2ObjectKey(object.sha256) || object.publicPath !== "/" + object.key
      || object.bytes !== expected.bytes || !expected.sources.includes(object.source) || !Array.isArray(object.assetIds)
      || !isDeepStrictEqual([...object.assetIds].sort(), [...expected.ids].sort())) fail("검증 계획의 GLB namespace·바이트·SHA·전수 에셋 연결이 다릅니다.");
    seen.add(object.sha256); objectBytes += object.bytes;
  }
  const included = { assets: catalog.assets.length, assetBytes, packs: catalog.packs.length, objects: glbs.length, objectBytes };
  const expectedLegacy = buildBundleV2DeployIndex(catalog, included), legacy = indexes[0];
  if (legacy.key !== BUNDLE_V2_INDEX_KEY || legacy.publicPath !== "/" + BUNDLE_V2_INDEX_KEY || typeof legacy.inlineBody !== "string"
    || legacy.bytes !== Buffer.byteLength(legacy.inlineBody) || legacy.sha256 !== hash(Buffer.from(legacy.inlineBody))
    || !isDeepStrictEqual(JSON.parse(legacy.inlineBody), expectedLegacy)) fail("기존 planner inline index의 본문·합계·SHA가 다릅니다.");
  const totals = { objects: glbs.length + 1, glbObjects: glbs.length, glbAssets: catalog.assets.length,
    totalBytes: objectBytes + legacy.bytes, glbBytes: objectBytes, assetBytes, excludedAssets: 0 };
  if (!isDeepStrictEqual(deployPlan.totals, totals)) fail("계획의 논리 에셋·고유 객체 전체 통계가 다릅니다.");
  const catalogBody = Buffer.from(catalogBytes), catalogSha256 = hash(catalogBody);
  const indexBody = jsonBytes({ ...expectedLegacy, catalogSha256 }), indexSha256 = hash(indexBody);
  const catalogName = `theme-packs.${catalogSha256}.json`, indexName = `deploy-index.${indexSha256}.json`;
  const descriptor = { schema: RELEASE_SCHEMA, version: 1,
    catalog: Object.freeze({ url: STATIC_URL_PREFIX + catalogName, sha256: catalogSha256, bytes: catalogBody.length }),
    index: Object.freeze({ url: STATIC_URL_PREFIX + indexName, sha256: indexSha256, bytes: indexBody.length }) };
  const files = [[`${STATIC_DIRECTORY}/${catalogName}`, catalogBody], [`${STATIC_DIRECTORY}/${indexName}`, indexBody], [RELEASE_DESCRIPTOR_PATH, jsonBytes(descriptor)]]
    .map(([path, body]) => Object.freeze({ path, body, bytes: body.length, sha256: hash(body) }));
  const release = Object.freeze({ schema: RELEASE_SCHEMA, descriptor: Object.freeze(descriptor), files: Object.freeze(files),
    sourceChecks: Object.freeze(sourceChecks.map((item) => Object.freeze({ ...item }))),
    summary: Object.freeze({ assets: catalog.assets.length, assetBytes, objects: glbs.length, objectBytes, catalogSha256, indexSha256 }) });
  assertArtifacts(release); assertSources(release);
  return release;
}

function outputLocation(outputRoot, protectedRoots, protectedFiles) {
  if (typeof outputRoot !== "string" || !outputRoot.trim()) fail("--output-root에 private envelope 경로를 지정해야 합니다.");
  const requested = resolve(outputRoot), parent = absolutePath(dirname(requested), true), output = join(parent, basename(requested));
  if ([REPO_ROOT, ...protectedRoots].some((root) => inside(resolve(root), output) || inside(output, resolve(root)))
    || protectedFiles.some((file) => inside(output, resolve(file))) || output.split(sep).some((part) => ["public", "dist"].includes(part))) fail("출력은 저장소·원본·public·dist 밖의 private envelope여야 합니다.");
  if (existsSync(output) || lstatExists(output)) absolutePath(output, true);
  return output;
}
function lstatExists(path) { try { lstatSync(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
function checkArtifactTree(release, root) {
  const expected = new Map(release.files.map((file) => [file.path, file])), directories = new Set(), found = new Set();
  for (const path of expected.keys()) { let part = dirname(path); while (part !== ".") { directories.add(part.split(sep).join("/")); part = dirname(part); } }
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name), name = relative(root, full).split(sep).join("/");
      if (entry.isSymbolicLink()) fail("발행 결과의 심볼릭 링크를 거부합니다.");
      if (entry.isDirectory()) { if (!directories.has(name)) fail("발행 결과에 등록하지 않은 디렉터리가 있습니다."); walk(full); continue; }
      const wanted = expected.get(name);
      if (!entry.isFile() || !wanted || !readFileSync(full).equals(wanted.body)) fail("발행 결과의 파일 목록 또는 정확한 바이트가 다릅니다.");
      found.add(name);
    }
  }
  walk(root);
  if (found.size !== expected.size) fail("발행 결과에 빠진 파일이 있습니다.");
}
export function checkReleaseCatalog(release, outputRoot, { protectedRoots = [], protectedFiles = [] } = {}) {
  assertArtifacts(release); assertSources(release);
  const output = outputLocation(outputRoot, protectedRoots, protectedFiles), entries = readdirSync(output);
  if (!isDeepStrictEqual(entries, ["release"])) fail("private envelope에는 완성된 release 디렉터리만 있어야 합니다.");
  const root = checkedPath(output, "release", true);
  checkArtifactTree(release, root); assertSources(release);
  return { ...release.summary, releaseRoot: root };
}

/** 기존 출력은 전부 같은 바이트일 때만 멱등 성공하며 어떤 파일도 덮어쓰지 않는다. */
export function writeReleaseCatalog(release, outputRoot, { protectedRoots = [], protectedFiles = [], writeFile = writeFileSync, rename = renameSync } = {}) {
  assertArtifacts(release); assertSources(release);
  const output = outputLocation(outputRoot, protectedRoots, protectedFiles);
  if (existsSync(output)) return { ...checkReleaseCatalog(release, output, { protectedRoots, protectedFiles }), unchanged: true };
  mkdirSync(output, { mode: 0o700 });
  const owner = lstatSync(output);
  let stage, stageOwner, published = false;
  const owns = (path, identity) => path && lstatExists(path) && !lstatSync(path).isSymbolicLink() && lstatSync(path).dev === identity.dev && lstatSync(path).ino === identity.ino;
  try {
    stage = mkdtempSync(join(output, ".staging-")); stageOwner = lstatSync(stage);
    for (const file of release.files) {
      if (!owns(output, owner) || !owns(stage, stageOwner)) fail("예약한 출력 디렉터리가 변경됐습니다.");
      const destination = join(stage, file.path);
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      checkedPath(stage, dirname(file.path).split(sep).join("/"), true);
      writeFile(destination, file.body, { flag: "wx", mode: 0o600 });
    }
    assertArtifacts(release); assertSources(release); checkArtifactTree(release, stage);
    if (!owns(output, owner) || !owns(stage, stageOwner) || lstatExists(join(output, "release"))) fail("출력 경로가 변경돼 원자적 게시를 중단합니다.");
    rename(stage, join(output, "release")); published = true;
    return { ...release.summary, releaseRoot: join(output, "release"), unchanged: false };
  } finally {
    if (!published && owns(output, owner) && owns(stage, stageOwner)) rmSync(stage, { recursive: true, force: true });
    if (!published && owns(output, owner) && readdirSync(output).length === 0) rmdirSync(output);
  }
}

export function parseReleaseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (Object.hasOwn(options, flag)) fail("중복된 인자입니다: " + flag);
    if (["--check", "--write", "--help"].includes(flag)) { options[flag] = true; continue; }
    if (!["--catalog", "--asset-root", "--pack-rights", "--output-root"].includes(flag) || !argv[i + 1] || argv[i + 1].startsWith("--")) fail("알 수 없거나 값이 없는 인자입니다: " + flag);
    options[flag] = argv[++i];
  }
  if (options["--help"]) return options;
  if (!options["--catalog"] || !options["--asset-root"] || Boolean(options["--check"]) === Boolean(options["--write"])
    || (options["--write"] && !options["--output-root"])) fail("--catalog·--asset-root와 --check 또는 --write 중 하나가 필요하며 쓰기에는 --output-root가 필요합니다.");
  return options;
}
export function runReleasePublisher(argv) {
  const options = parseReleaseArgs(argv);
  if (options["--help"]) return "정적 발행 준비: --catalog <카탈로그 JSON> --asset-root <검증된 private 입력> (--check | --write --output-root <새 private envelope>) [--pack-rights <원장>]\n--check에 output-root를 주면 기존 발행 결과도 대조합니다. 운영 업로드·legacy 파일 변경은 하지 않습니다.";
  const catalogPath = absolutePath(options["--catalog"]), assetRoot = absolutePath(options["--asset-root"], true);
  const ledgerPath = absolutePath(options["--pack-rights"] ?? join(REPO_ROOT, "config/creator-bundle-pack-rights.json"));
  const catalogBytes = readFileSync(catalogPath), ledgerBytes = readFileSync(ledgerPath), themePacks = JSON.parse(catalogBytes.toString("utf8"));
  const ledger = JSON.parse(ledgerBytes.toString("utf8"));
  const { plan, errors } = createBundleV2DeployPlan({ themePacks, assetRoot, ledger });
  if (!plan || errors.length || plan.excludedByRights.length) fail("기존 planner의 전수 경로·권리·GLB·SHA 검증을 통과하지 못했습니다: " + errors.slice(0, 5).join(" / "));
  const sourceChecks = [{ path: catalogPath, bytes: catalogBytes.length, sha256: hash(catalogBytes) }, { path: ledgerPath, bytes: ledgerBytes.length, sha256: hash(ledgerBytes) },
    ...themePacks.assets.map((asset) => ({ path: checkedPath(assetRoot, asset.path), bytes: asset.bytes, sha256: asset.sha256 }))];
  const release = createReleaseCatalog({ catalogBytes, deployPlan: plan, ledger, sourceChecks });
  const location = { protectedRoots: [assetRoot], protectedFiles: [catalogPath, ledgerPath] };
  const result = options["--write"] ? writeReleaseCatalog(release, options["--output-root"], location)
    : options["--output-root"] ? checkReleaseCatalog(release, options["--output-root"], location) : release.summary;
  return JSON.stringify({ mode: options["--write"] ? "private-write" : "check", ...result, productionWrites: false });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(runReleasePublisher(process.argv.slice(2))); }
  catch (error) { console.error("정적 카탈로그 발행 준비 실패: " + (error instanceof Error ? error.message : String(error))); process.exitCode = 2; }
}
