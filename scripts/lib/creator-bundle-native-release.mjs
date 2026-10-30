import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { REPO_ROOT, WEB_PUBLIC } from "./repo-paths.mjs";
import { RELEASE_SCHEMA, RELEASE_DESCRIPTOR_PATH, STATIC_URL_PREFIX } from "../publish-creator-bundle-release.mjs";

const SHA = /^[a-f0-9]{64}$/u;
const LIMITS = { catalog: 32 * 1024 * 1024, index: 1024 * 1024 };
export const NATIVE_COMPOSITE_CONFIG_PATH = "config/creator-bundle-composite-ingest.json";
export const LUMA_NATIVE_COMPOSITE_CONFIG_PATH = "config/creator-bundle-nature-luma-composite-ingest.json";
export const NATIVE_RELEASE_COMPLETION_PREFIX = "/assets/studio/bundle-v2/release-index/";
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SYNTHETIC_COMPLETION = Object.freeze({ qaSynthetic: true, actualR2Proof: false, productionValidation: false });
const hash = body => createHash("sha256").update(body).digest("hex");
const fail = message => { throw new Error(`${message} 같은 후보 원문으로 release를 생성한 뒤 다시 검증하세요.`); };
function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) fail("release 필드가 계약과 다릅니다.");
}
function objectBinding(input, kind) {
  exact(input, ["url", "sha256", "bytes"]);
  const prefix = kind === "catalog" ? "theme-packs" : "deploy-index";
  if (typeof input.sha256 !== "string" || !SHA.test(input.sha256)
    || !Number.isSafeInteger(input.bytes) || input.bytes <= 0 || input.bytes > LIMITS[kind]
    || input.url !== `${STATIC_URL_PREFIX}${prefix}.${input.sha256}.json`) fail("release 경로·SHA·바이트 계약이 다릅니다.");
  return Object.freeze({ url: input.url, sha256: input.sha256, bytes: input.bytes });
}
/** 앱의 release helper와 같은 정확한 JSON 계약이다. 앱 TS를 Node에서 직접 import하지 않는다. */
export function requireNativeBundleRelease(input) {
  exact(input, ["schema", "version", "catalog", "index"]);
  if (input.schema !== RELEASE_SCHEMA || input.version !== 1) fail("release 스키마가 다릅니다.");
  return Object.freeze({ schema: RELEASE_SCHEMA, version: 1,
    catalog: objectBinding(input.catalog, "catalog"), index: objectBinding(input.index, "index") });
}
function checkedFile(root, name) {
  if (typeof name !== "string" || name.includes("\\") || name.split("/").some(part => !part || part === "." || part === "..")) fail("release 상대 경로가 모호합니다.");
  const current = resolve(root);
  let anchor = current.startsWith(sep) ? sep : dirname(current);
  for (const part of [...relative(anchor, current).split(sep), ...name.split("/")]) {
    const matches = readdirSync(anchor).filter(entry => entry.toLowerCase() === part.toLowerCase());
    if (matches.length !== 1 || matches[0] !== part) fail("release 경로가 없거나 대소문자가 모호합니다.");
    anchor = join(anchor, part);
    if (lstatSync(anchor).isSymbolicLink()) fail("release 입력의 심볼릭 링크를 거부합니다.");
  }
  if (!lstatSync(anchor).isFile()) fail("release 입력이 일반 파일이 아닙니다.");
  return anchor;
}
function readSnapshot(path, expected, limit) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || before.size > limit
    || (expected && before.size !== expected.bytes)) fail("release 원문의 크기 또는 파일 형식이 다릅니다.");
  const body = readFileSync(path), after = lstatSync(path), sha256 = hash(body);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs
    || body.length !== before.size || (expected && sha256 !== expected.sha256)) fail("release 원문 바이트·SHA가 다르거나 읽는 동안 변경됐습니다.");
  return { path, body, bytes: body.length, sha256 };
}
function parseJson(body) {
  if (!Buffer.from(body.toString("utf8")).equals(body)) fail("release 원문이 UTF-8이 아닙니다.");
  try { return JSON.parse(body.toString("utf8")); } catch { fail("release 원문이 JSON이 아닙니다."); }
}
function requireCompositeConfigPath(path) {
  if (![NATIVE_COMPOSITE_CONFIG_PATH, LUMA_NATIVE_COMPOSITE_CONFIG_PATH].includes(path)) fail("명시한 Native composite 설정 경로가 지원 범위와 다릅니다.");
  return path;
}

/** 실제 빌드 고정 descriptor와 정적 원문 두 개를 읽고 가용성의 catalog SHA 연결까지 확인한다. */
export function loadNativeBundleRelease({ repoRoot = REPO_ROOT, webPublic = WEB_PUBLIC, compositeConfigPath = NATIVE_COMPOSITE_CONFIG_PATH } = {}) {
  requireCompositeConfigPath(compositeConfigPath);
  const descriptorFile = readSnapshot(checkedFile(repoRoot, RELEASE_DESCRIPTOR_PATH), undefined, 16 * 1024);
  const descriptor = requireNativeBundleRelease(parseJson(descriptorFile.body));
  const catalogFile = readSnapshot(checkedFile(webPublic, descriptor.catalog.url.slice(1)), descriptor.catalog, LIMITS.catalog);
  const indexFile = readSnapshot(checkedFile(webPublic, descriptor.index.url.slice(1)), descriptor.index, LIMITS.index);
  const catalog = parseJson(catalogFile.body), index = parseJson(indexFile.body);
  if (catalog?.schema !== "toonstudio.bg3d-bundle-theme-packs.v1" || catalog.version !== 1
    || catalog.inServiceOnly !== true || catalog.downloadable !== false || !Array.isArray(catalog.assets)
    || catalog.totals?.placeableAssets !== catalog.assets.length || index?.schema !== "toonstudio.bundle-v2-deploy-index.v1"
    || index.version !== 1 || index.keyScheme !== "sha256" || index.catalogSha256 !== descriptor.catalog.sha256
    || index.files !== catalog.totals.placeableAssets || index.bytes !== catalog.assets.reduce((sum, asset) => sum + asset.bytes, 0)) {
    fail("release catalog/index의 스키마·합계·catalogSha256 연결이 다릅니다.");
  }
  // 전체 composite 재현 검사를 대체하지 않고 이 빌드의 생성 원본 연결을 고정한다.
  const compositeFile = readSnapshot(checkedFile(repoRoot, compositeConfigPath), undefined, 1024 * 1024);
  const composite = parseJson(compositeFile.body);
  if (composite?.schema !== "toonstudio.creator-bundle-composite-ingest.v1" || composite.version !== 1
    || composite.projection !== "apps/web/public" + descriptor.catalog.url || composite.projectionSha256 !== descriptor.catalog.sha256
    || composite.expected?.files !== catalog.assets.length || composite.expected?.bytes !== index.bytes
    || typeof composite.snapshotGeneratedAt !== "string" || !Number.isFinite(Date.parse(composite.snapshotGeneratedAt))
    || composite.snapshotGeneratedAt !== catalog.sourceManifest?.generatedAt) {
    fail("새 composite 생성 원본과 빌드 release의 경로·SHA·합계·생성 시각이 다릅니다.");
  }
  const binding = Object.freeze({ descriptorSha256: descriptorFile.sha256, descriptorBytes: descriptorFile.bytes,
    compositeConfigSha256: compositeFile.sha256, compositeConfigBytes: compositeFile.bytes,
    ...(compositeConfigPath === NATIVE_COMPOSITE_CONFIG_PATH ? {} : { compositeConfigPath }),
    catalog: descriptor.catalog, index: descriptor.index });
  const release = { descriptor, descriptorFile, compositeFile, catalogFile, indexFile, catalog, binding, repoRoot, webPublic, compositeConfigPath };
  assertNativeBundleReleaseCurrent(release);
  return release;
}
export function assertNativeBundleReleaseCurrent(release) {
  const compositeConfigPath = requireCompositeConfigPath(release.compositeConfigPath);
  for (const [root, name, snapshot, limit] of [
    [release.repoRoot, RELEASE_DESCRIPTOR_PATH, release.descriptorFile, 16 * 1024],
    [release.repoRoot, compositeConfigPath, release.compositeFile, 1024 * 1024],
    [release.webPublic, release.descriptor.catalog.url.slice(1), release.catalogFile, LIMITS.catalog],
    [release.webPublic, release.descriptor.index.url.slice(1), release.indexFile, LIMITS.index],
  ]) {
    const current = readSnapshot(checkedFile(root, name), snapshot, limit);
    if (current.path !== snapshot.path || !current.body.equals(snapshot.body)) fail("검증 중 release 입력이 변경됐습니다.");
  }
}
export function nativeReleaseBindingProblems(binding, catalogSha256, { compositeConfigPath = NATIVE_COMPOSITE_CONFIG_PATH } = {}) {
  try {
    requireCompositeConfigPath(compositeConfigPath);
    exact(binding, ["descriptorSha256", "descriptorBytes", "compositeConfigSha256", "compositeConfigBytes", "catalog", "index",
      ...(compositeConfigPath === NATIVE_COMPOSITE_CONFIG_PATH ? [] : ["compositeConfigPath"])]);
    if (compositeConfigPath !== NATIVE_COMPOSITE_CONFIG_PATH && binding.compositeConfigPath !== compositeConfigPath) fail("Native 증거의 composite 설정 경로가 명시 편입 모드와 다릅니다.");
    if (typeof binding.descriptorSha256 !== "string" || !SHA.test(binding.descriptorSha256) || !Number.isSafeInteger(binding.descriptorBytes)
      || binding.descriptorBytes <= 0 || binding.descriptorBytes > 16 * 1024) fail("descriptor 원문 SHA·바이트 기록이 없습니다.");
    if (typeof binding.compositeConfigSha256 !== "string" || !SHA.test(binding.compositeConfigSha256)
      || !Number.isSafeInteger(binding.compositeConfigBytes) || binding.compositeConfigBytes <= 0
      || binding.compositeConfigBytes > 1024 * 1024) fail("새 composite 원문 SHA·바이트 기록이 없습니다.");
    const descriptor = requireNativeBundleRelease({ schema: RELEASE_SCHEMA, version: 1, catalog: binding.catalog, index: binding.index });
    if (descriptor.catalog.sha256 !== catalogSha256) fail("Native catalog SHA와 release가 다릅니다.");
    return [];
  } catch (error) { return [error.message]; }
}
/** 실제 R2 조회가 아니다. 검증된 같은 index 원문의 로컬 QA 응답 경로만 정한다. */
export function getNativeBundleReleaseCompletionBinding(descriptor) {
  const { index } = requireNativeBundleRelease(descriptor);
  return Object.freeze({ url: `${NATIVE_RELEASE_COMPLETION_PREFIX}${index.sha256}.json`, sha256: index.sha256, bytes: index.bytes });
}

/** URLSearchParams 정규화로 별칭을 허용하지 않고 정확한 단일 소문자 v4 nonce GET만 받는다. */
export function nativeReleaseCompletionRequest(descriptor, requestTarget, method) {
  const binding = getNativeBundleReleaseCompletionBinding(descriptor), prefix = `${binding.url}?release-check=`;
  const nonce = typeof requestTarget === "string" && requestTarget.startsWith(prefix) ? requestTarget.slice(prefix.length) : "";
  if (method !== "GET" || nonce.length !== 36 || !UUID_V4.test(nonce) || requestTarget !== prefix + nonce) {
    fail("로컬 completion 요청의 정확한 경로·단일 v4 nonce·GET 계약이 다릅니다.");
  }
  return Object.freeze({ method, requestTarget, releaseCheckNonce: nonce });
}

/** 매 요청 현재 release 불변성과 원문 bytes/SHA를 확인한다. nonce의 재사용·자동 재시도는 거부한다. */
export function prepareNativeBundleReleaseCompletion(release, { requestTarget, method, usedNonces }) {
  const binding = getNativeBundleReleaseCompletionBinding(release.descriptor);
  const request = nativeReleaseCompletionRequest(release.descriptor, requestTarget, method);
  if (!(usedNonces instanceof Set) || usedNonces.has(request.releaseCheckNonce)) fail("로컬 completion nonce가 없거나 재사용됐습니다.");
  assertNativeBundleReleaseCurrent(release);
  const body = Buffer.from(release.indexFile.body);
  if (body.length !== binding.bytes || hash(body) !== binding.sha256) fail("로컬 completion 원문이 같은 index bytes/SHA와 다릅니다.");
  usedNonces.add(request.releaseCheckNonce);
  return { body, proof: Object.freeze({ ...request, status: 200, bodySha256: hash(body), bodyBytes: body.length, ...SYNTHETIC_COMPLETION }) };
}

export function createNativeBundleReleaseTrace(binding) {
  const descriptor = requireNativeBundleRelease({ schema: RELEASE_SCHEMA, version: 1, catalog: binding.catalog, index: binding.index });
  return { catalog: { ...binding.catalog, requests: 0 }, index: { ...binding.index, requests: 0 },
    completion: { ...getNativeBundleReleaseCompletionBinding(descriptor), requests: 0, responses: [] },
    unexpected: [], descriptorRequests: 0, ...SYNTHETIC_COMPLETION };
}

export function nativeReleaseTraceProblems(trace, binding) {
  if (!trace || !Array.isArray(trace.unexpected) || trace.unexpected.length !== 0) return ["release 정적 경로에 미등록 요청이 있거나 요청 기록이 없습니다."];
  for (const kind of ["catalog", "index"]) {
    const { requests, ...observed } = trace[kind] ?? {};
    if (!Number.isSafeInteger(requests) || requests < 1 || !isDeepStrictEqual(observed, binding?.[kind])) {
      return ["실제 브라우저가 같은 release의 catalog/index 원문을 모두 요청하지 않았습니다."];
    }
  }
  try {
    if (trace.qaSynthetic !== true || trace.actualR2Proof !== false || trace.productionValidation !== false) {
      fail("Native completion의 로컬 합성·비운영 증거 표기가 없습니다.");
    }
    const descriptor = requireNativeBundleRelease({ schema: RELEASE_SCHEMA, version: 1, catalog: binding?.catalog, index: binding?.index });
    const completion = getNativeBundleReleaseCompletionBinding(descriptor);
    const { requests, responses, ...observed } = trace.completion ?? {};
    if (!Number.isSafeInteger(requests) || requests < 1 || !Array.isArray(responses) || responses.length !== requests
      || !isDeepStrictEqual(observed, completion)) fail("같은 index 원문에 연결된 실제 completion 요청·응답 기록이 없습니다.");
    const nonces = new Set();
    for (const response of responses) {
      exact(response, ["method", "requestTarget", "releaseCheckNonce", "status", "bodySha256", "bodyBytes",
        "qaSynthetic", "actualR2Proof", "productionValidation"]);
      const request = nativeReleaseCompletionRequest(descriptor, response.requestTarget, response.method);
      if (response.releaseCheckNonce !== request.releaseCheckNonce || nonces.has(request.releaseCheckNonce)
        || response.status !== 200 || response.bodySha256 !== completion.sha256 || response.bodyBytes !== completion.bytes
        || response.qaSynthetic !== true || response.actualR2Proof !== false || response.productionValidation !== false) {
        fail("로컬 completion의 고유 요청 nonce·성공 응답·원문 SHA/bytes·합성 표기가 다릅니다.");
      }
      nonces.add(request.releaseCheckNonce);
    }
  } catch (error) { return [error.message]; }
  return [];
}
