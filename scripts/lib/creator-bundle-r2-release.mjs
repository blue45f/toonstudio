/** 전체 원격 GLB를 SHA로 확인한 뒤 같은 정적 index 원문을 마지막 완료 객체로 전달한다. */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createReleaseCatalog, RELEASE_DESCRIPTOR_PATH, RELEASE_SCHEMA, STATIC_DIRECTORY, STATIC_URL_PREFIX } from "../publish-creator-bundle-release.mjs";
import { createBundleV2DeployPlan, BUNDLE_V2_KEY_PREFIX, bundleV2ObjectKey } from "../plan-creator-bundle-deploy.mjs";
import { relativePathProblem } from "./creator-bundle-pack-rights-form.mjs";
import { assertBundleR2RemoteBody, bundleR2BodyFingerprint, planBundleR2Delta, verifyBundleR2Delta } from "./creator-bundle-r2-delta.mjs";
import { transferFail } from "./creator-bundle-r2-rest.mjs";

const contexts = new WeakMap();
const sha = (body) => createHash("sha256").update(body).digest("hex");
const json = (body) => { try { return JSON.parse(body.toString("utf8")); } catch { transferFail("LOCAL_JSON", "로컬 release JSON 형식이 다릅니다. 원장을 확인하고 --check로 재검증하세요."); } };
const sameKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");

function checkedAbsolute(value, directory = false) {
  const full = resolve(value);
  let path = sep;
  for (const part of full.slice(sep.length).split(sep)) {
    if (!part || part === "." || part === "..") transferFail("LOCAL_PATH", "모호한 로컬 경로입니다. 경로를 확인하세요.");
    const matches = readdirSync(path).filter((entry) => entry.toLowerCase() === part.toLowerCase());
    if (matches.length !== 1 || matches[0] !== part) transferFail("LOCAL_PATH", "없는 경로 또는 대소문자가 모호한 경로입니다. 경로를 확인하세요.");
    path = join(path, part);
    if (lstatSync(path).isSymbolicLink()) transferFail("LOCAL_SYMLINK", "로컬 입력의 심볼릭 링크를 거부합니다. 실제 경로를 지정하세요.");
  }
  if (!(directory ? lstatSync(path).isDirectory() : lstatSync(path).isFile())) transferFail("LOCAL_PATH", "필요한 일반 파일 또는 디렉터리가 아닙니다. 경로를 확인하세요.");
  return path;
}
function stableRead(path) {
  path = checkedAbsolute(path);
  const before = lstatSync(path), body = readFileSync(path), after = lstatSync(path);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || after.size !== body.length) transferFail("LOCAL_CHANGED", "읽는 동안 로컬 입력이 변경됐습니다. --check로 다시 확인하세요.");
  return { path, body, bytes: body.length, sha256: sha(body) };
}
function descriptorEntry(value, kind) {
  if (!sameKeys(value, ["url", "bytes", "sha256"]) || !Number.isSafeInteger(value.bytes) || value.bytes <= 0
    || !/^[a-f0-9]{64}$/u.test(value.sha256) || value.url !== `${STATIC_URL_PREFIX}${kind}.${value.sha256}.json`) transferFail("RELEASE_DESCRIPTOR", "빌드 고정 descriptor의 namespace·바이트·SHA가 다릅니다. 정적 release를 재검증하세요.");
  return value;
}
function descriptorFrom(body) {
  const descriptor = json(body);
  if (!sameKeys(descriptor, ["schema", "version", "catalog", "index"]) || descriptor.schema !== RELEASE_SCHEMA || descriptor.version !== 1
    || !Buffer.from(JSON.stringify(descriptor) + "\n").equals(body)) transferFail("RELEASE_DESCRIPTOR", "생성된 정규형 release descriptor가 아닙니다. publisher 출력과 대조하세요.");
  descriptorEntry(descriptor.catalog, "theme-packs"); descriptorEntry(descriptor.index, "deploy-index");
  return descriptor;
}
function assertControls(state) {
  for (const control of state.controls) {
    const current = stableRead(control.path);
    if (current.bytes !== control.bytes || current.sha256 !== control.sha256) transferFail("CONTROL_CHANGED", "원장·카탈로그·descriptor·정적 index가 변경됐습니다. 다음 PUT을 실행하지 않습니다.");
  }
}

/** packDefs 주입은 기존 planner fixture용이며 CLI는 항상 실제 생성기의 정의를 사용한다. */
export function prepareBundleR2Release({ releaseRoot, assetRoot, ledgerPath, packDefs }) {
  const root = checkedAbsolute(releaseRoot, true), assets = checkedAbsolute(assetRoot, true);
  const relation = relative(root, assets);
  if (!isAbsolute(relation) && (relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`)))) transferFail("ASSET_ROOT_PUBLIC", "GLB 입력은 정적 release 트리 밖의 private 디렉터리여야 합니다.");
  const descriptorFile = stableRead(join(root, RELEASE_DESCRIPTOR_PATH)), descriptor = descriptorFrom(descriptorFile.body);
  const catalogFile = stableRead(join(root, STATIC_DIRECTORY, basename(descriptor.catalog.url)));
  const indexFile = stableRead(join(root, STATIC_DIRECTORY, basename(descriptor.index.url)));
  const ledgerFile = stableRead(ledgerPath), ledger = json(ledgerFile.body), catalog = json(catalogFile.body);
  for (const [file, binding] of [[catalogFile, descriptor.catalog], [indexFile, descriptor.index]]) {
    if (file.bytes !== binding.bytes || file.sha256 !== binding.sha256) transferFail("RELEASE_HASH", "descriptor와 실제 정적 JSON의 원문 바이트·SHA가 다릅니다.");
  }
  const fingerprints = new Map();
  const readFile = (path) => {
    const file = stableRead(path), fingerprint = bundleR2BodyFingerprint(file.body);
    fingerprints.set(bundleV2ObjectKey(fingerprint.sha256), Object.freeze(fingerprint));
    return file.body;
  };
  const { plan, errors } = createBundleV2DeployPlan({ themePacks: catalog, assetRoot: assets, ledger, readFile, ...(packDefs === undefined ? {} : { packDefs }) });
  if (!plan || errors.length || plan.excludedByRights.length) transferFail("FULL_PLAN_REFUSED", "현재 원장의 전체 경로·권리·실물 계획이 실패했습니다. --check와 기존 planner로 원인을 확인하세요.");
  const controls = [descriptorFile, catalogFile, indexFile, ledgerFile].map((file) => Object.freeze({
    path: file.path, bytes: file.bytes, sha256: file.sha256,
  }));
  const payloadChecks = catalog.assets.map((asset) => {
    if (relativePathProblem(asset.path, 1024)) transferFail("ASSET_PATH", "등록 GLB 경로가 올바르지 않습니다.");
    return { path: checkedAbsolute(join(assets, asset.path)), bytes: asset.bytes, sha256: asset.sha256 };
  });
  const release = createReleaseCatalog({ catalogBytes: catalogFile.body, deployPlan: plan, ledger, sourceChecks: [...controls, ...payloadChecks] });
  if (!isDeepStrictEqual(release.descriptor, descriptor) || !release.files[1].body.equals(indexFile.body)
    || !release.files[2].body.equals(descriptorFile.body)) transferFail("RELEASE_PAIR", "전체 권리 계획에서 재생성한 release 쌍과 빌드 고정 출력이 다릅니다.");
  const objects = plan.objects.map((object) => Object.freeze({ ...object, ...(object.assetIds ? { assetIds: Object.freeze([...object.assetIds]) } : {}) }));
  const fullPlan = Object.freeze({ ...plan, objects: Object.freeze(objects), totals: Object.freeze({ ...plan.totals }), excludedByRights: Object.freeze([]) });
  const completion = Object.freeze({ key: `${BUNDLE_V2_KEY_PREFIX}release-index/${indexFile.sha256}.json`,
    sha256: indexFile.sha256, bytes: indexFile.bytes });
  const context = Object.freeze({ schema: "toonstudio.bundle-r2-release-context.v1", summary: release.summary, completion,
    identity: Object.freeze({ catalogSha256: catalogFile.sha256, indexSha256: indexFile.sha256, descriptorSha256: descriptorFile.sha256 }) });
  contexts.set(context, { fullPlan, fingerprints, assetRoot: assets, controls, completion, completionBody: Buffer.from(indexFile.body) });
  return context;
}

async function listWholePrefix(rest, guard) {
  const remote = new Map(), cursors = new Set();
  let cursor, pages = 0;
  for (;;) {
    guard();
    if (++pages > 10_000) transferFail("LIST_PAGE_LIMIT", "R2 목록 페이지 상한을 넘었습니다. 완전한 목록으로 간주하지 않습니다.");
    const page = await rest.listPage(cursor);
    if (!page || !Array.isArray(page.objects) || (page.truncated !== undefined && typeof page.truncated !== "boolean")
      || (page.cursor !== undefined && (typeof page.cursor !== "string" || page.cursor.length > 4096 || /[\r\n]/u.test(page.cursor)))) transferFail("LIST_FORMAT", "R2 목록 marker·cursor의 형식이 다릅니다.");
    if (page.cursor !== undefined && cursors.has(page.cursor)) transferFail("LIST_CURSOR", "반복된 R2 목록 cursor입니다. 전체 목록을 확인할 수 없습니다.");
    for (const item of page.objects) {
      const size = typeof item.size === "string" && /^\d+$/u.test(item.size) ? Number(item.size) : item.size;
      if (typeof item.key !== "string" || !item.key.startsWith(BUNDLE_V2_KEY_PREFIX) || /[\r\n]/u.test(item.key)
        || !Number.isSafeInteger(size) || size < 0 || typeof item.etag !== "string" || remote.has(item.key)) transferFail("LIST_INCONSISTENT", "R2 목록의 객체·크기·중복이 올바르지 않습니다. 누락분 PUT을 시작하지 않습니다.");
      remote.set(item.key, { size, etag: item.etag });
    }
    // 공식 optional 계약: false 또는 marker/cursor 동시 생략은 terminal이다. 빈 목록 자체로 끝내지 않는다.
    if (page.truncated === false || (page.truncated === undefined && page.cursor === undefined)) return { remote, pages };
    if (typeof page.cursor !== "string" || !page.cursor) transferFail("LIST_CURSOR", "다음 페이지를 가리키지만 새 cursor가 없습니다. 전체 목록을 확인할 수 없습니다.");
    cursor = page.cursor; cursors.add(cursor);
  }
}

/** 본문 전송 시간을 보장하지 않는 최소 요청·간격·마지막 확인 예산이다. */
export function estimateBundleR2RequestBudget({ objects, missing, pages, production, completionPresent, intervalMs = 500, requestTimeoutMs = 30_000 }) {
  if (!Number.isSafeInteger(objects) || objects <= 0 || !Number.isSafeInteger(missing) || missing < 0 || missing > objects
    || !Number.isSafeInteger(pages) || pages <= 0 || !Number.isSafeInteger(intervalMs) || intervalMs < 334
    || !Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0 || requestTimeoutMs > 30_000) transferFail("BUDGET_INPUT", "전체 객체·누락·목록 페이지·요청 정책으로 예산을 계산하세요.");
  const reused = objects - missing, completionRequests = production && !completionPresent ? 3 : 1;
  const remainingRequests = reused + (production ? missing * 3 : 0) + 2 + completionRequests;
  const requests = 2 + pages + remainingRequests;
  const reserveMs = requestTimeoutMs * (production && !completionPresent ? 3 : 2);
  return Object.freeze({ scope: "r2-http-only", requests, remainingRequests, spacingLowerBoundMs: Math.max(0, requests - 1) * intervalMs,
    minimumRemainingMs: Math.max(0, remainingRequests - 1) * intervalMs + reserveMs,
    reserveMs, intervalMs, requestTimeoutMs, transferDurationGuaranteed: false });
}

function assertCompletion(state, body) {
  if (!Buffer.isBuffer(body) || body.length !== state.completion.bytes || sha(body) !== state.completion.sha256
    || !body.equals(state.completionBody)) transferFail("COMPLETION_MISMATCH", "기존 완료 key의 원문이 같은 정적 index와 다릅니다. 덮어쓰지 말고 원격 상태를 별도 확인하세요.");
}

/** 단일 실행자와 조건부 PUT 보장이 다르다. GET404와 PUT 사이의 원자성을 주장하지 않는다. */
export async function runBundleR2Release(context, { rest, production = false, assertWriteAuthority,
  onEvent = async () => {}, now = Date.now, maximumDurationMs = 7_200_000, requestBudget } = {}) {
  const state = contexts.get(context);
  if (!state || !rest || !Number.isSafeInteger(maximumDurationMs) || maximumDurationMs <= 0) transferFail("RELEASE_CONTEXT", "현재 입력에서 준비한 release context와 명시적인 R2 adapter가 필요합니다.");
  if (production && typeof assertWriteAuthority !== "function") transferFail("WRITE_AUTHORITY", "운영 PUT에는 정확한 main SHA·CI·단일 실행자 게이트가 필요합니다.");
  if (production && (!Number.isSafeInteger(requestBudget) || requestBudget <= 0 || requestBudget > 100_000)) transferFail("REQUEST_BUDGET", "운영에는 명시적인 전체 요청 수 예산이 필요합니다. --remote-check 결과와 --request-budget을 대조하세요.");
  if (production && rest.getRequestStats && rest.getRequestStats().requestsStarted !== 0) transferFail("ADAPTER_ALREADY_USED", "이 실행의 요청 수를 정확히 결합하려면 새 adapter가 필요합니다. 이전 실행을 자동 이어받지 않습니다.");
  const started = now(), guard = () => {
    if (now() - started >= maximumDurationMs) transferFail("RUN_TIMEOUT", "전체 실행 시간이 초과됐습니다. 남은 객체를 자동 재시도하지 않습니다.");
  };
  assertControls(state); guard();
  const legacyBefore = await rest.readLegacyIndex();
  const completionBefore = await rest.readCompletion(state.completion);
  if (completionBefore !== null) assertCompletion(state, completionBefore);
  const { remote, pages } = await listWholePrefix(rest, guard);
  guard();
  const delta = planBundleR2Delta(state.fullPlan, state.fingerprints, remote);
  if (completionBefore !== null && delta.missing.length) transferFail("COMPLETION_WITH_MISSING_OBJECTS", "완료 표식이 있지만 GLB가 누락됐습니다. 열린 완료 상태를 자동 보수하지 말고 별도 확인하세요.");
  const policy = rest.requestPolicy ?? { intervalMs: 500, requestTimeoutMs: 30_000 };
  const parameters = { objects: state.fullPlan.totals.glbObjects, missing: delta.missing.length, pages,
    completionPresent: completionBefore !== null, intervalMs: policy.intervalMs, requestTimeoutMs: policy.requestTimeoutMs };
  const productionBudget = estimateBundleR2RequestBudget({ ...parameters, production: true });
  const budget = estimateBundleR2RequestBudget({ ...parameters, production });
  if (production && (requestBudget < budget.requests || (rest.requestPolicy && rest.requestPolicy.maximumRequests < budget.requests))) transferFail("REQUEST_BUDGET_TOO_SMALL", "실제 전체 요청 수가 명시 예산을 넘습니다. PUT 없이 중단합니다. 읽기 계획에서 필요한 요청 수를 확인하세요.");
  if (production && maximumDurationMs - (now() - started) < budget.minimumRemainingMs) transferFail("TIME_BUDGET_TOO_SMALL", "요청 간격과 마지막 완료 확인에 필요한 최소 시간이 부족합니다. PUT 없이 중단하고 명시 예산을 다시 검토하세요.");
  await onEvent({ phase: "budget-planned", budget, productionBudget });
  // MD5 ETag로 분류된 객체도 원문 전체 SHA를 확인한다. 순수 delta API의 기본 계약은 바꾸지 않는다.
  const verified = await verifyBundleR2Delta({ ...delta, unchanged: [], verifyRemote: [...delta.unchanged, ...delta.verifyRemote] }, async (object) => {
    guard(); const body = await rest.getObject(object);
    if (body === null) transferFail("REMOTE_DISAPPEARED", "기존 객체가 목록 조회 뒤 사라졌습니다. PUT을 시작하지 않습니다.");
    return body;
  });
  const summary = { ...context.summary, pages, missing: verified.missing.length, reused: verified.unchanged.length,
    uploaded: 0, uploadedBytes: 0, legacyIndexPreserved: true, conditionalPutGuaranteed: false,
    singleExecutorRequired: true, staticReleasePublished: false, remoteWholeShaVerified: verified.unchanged.length,
    budget, productionBudget, completion: { ...state.completion, present: completionBefore !== null, reused: false, uploaded: 0, verified: false } };
  await onEvent({ phase: "remote-verified", pages, missing: summary.missing, reused: summary.reused });
  if (production && verified.missing.length) {
    guard(); assertControls(state); await assertWriteAuthority();
    for (const object of verified.missing) {
      guard(); assertControls(state);
      const local = stableRead(join(state.assetRoot, object.source));
      assertBundleR2RemoteBody(object, local.body);
      const existing = await rest.getObject(object);
      if (existing !== null) transferFail("OBJECT_APPEARED_BEFORE_PUT", "누락 객체가 PUT 직전에 나타났습니다. 단일 실행자 상태를 확인하고 덮어쓰지 마세요.");
      guard(); assertControls(state);
      await onEvent({ phase: "put-started", key: object.key, sha256: object.sha256, bytes: object.bytes });
      await rest.putObject(object, local.body);
      guard();
      const received = await rest.getObject(object);
      if (received === null) transferFail("PUT_NOT_READABLE", "PUT 뒤 원격 객체를 확인할 수 없습니다. 다시 보내지 말고 상태를 별도 확인하세요.");
      assertBundleR2RemoteBody(object, received);
      summary.uploaded += 1; summary.uploadedBytes += object.bytes;
      summary.remoteWholeShaVerified += 1;
      await onEvent({ phase: "put-verified", key: object.key, uploaded: summary.uploaded, total: verified.missing.length });
    }
  }
  guard(); assertControls(state);
  const legacyAfter = await rest.readLegacyIndex();
  if ((legacyBefore === null) !== (legacyAfter === null) || (legacyBefore !== null && !legacyBefore.equals(legacyAfter))) transferFail("LEGACY_INDEX_CHANGED", "실행 중 고정 legacy index가 변경됐습니다. 다른 배포 실행자를 확인하세요.");
  guard(); assertControls(state);
  const completionAfter = await rest.readCompletion(state.completion);
  if (completionBefore !== null) {
    if (completionAfter === null) transferFail("COMPLETION_DISAPPEARED", "검증 중 완료 표식이 사라졌습니다. 정상 배포로 보고하지 않습니다.");
    assertCompletion(state, completionAfter);
    summary.completion.reused = summary.completion.verified = true;
  } else {
    if (completionAfter !== null) transferFail("COMPLETION_APPEARED", "완료 표식이 실행 중 나타났습니다. 같은 원문이어도 다른 실행자를 확인하고 덮어쓰지 않습니다.");
    if (production) {
      guard(); assertControls(state);
      if (maximumDurationMs - (now() - started) < policy.requestTimeoutMs * 3 + policy.intervalMs * 2) transferFail("TIME_BUDGET_TOO_SMALL", "마지막 완료 PUT·원문·legacy 확인 시간이 부족합니다. 완료 표식 없이 중단합니다.");
      await assertWriteAuthority();
      guard(); assertControls(state);
      await onEvent({ phase: "completion-put-started", ...state.completion });
      await rest.putCompletion(state.completion, Buffer.from(state.completionBody));
      guard();
      const received = await rest.readCompletion(state.completion);
      if (received === null) transferFail("COMPLETION_NOT_READABLE", "완료 PUT 뒤 원문을 확인하지 못했습니다. 재전송하지 말고 원격 상태를 별도 확인하세요.");
      assertCompletion(state, received);
      summary.completion.present = summary.completion.verified = true;
      summary.completion.uploaded = 1;
      await onEvent({ phase: "completion-put-verified", ...state.completion });
    }
  }
  guard(); assertControls(state);
  const legacyFinal = await rest.readLegacyIndex();
  if ((legacyBefore === null) !== (legacyFinal === null) || (legacyBefore !== null && !legacyBefore.equals(legacyFinal))) transferFail("LEGACY_INDEX_CHANGED", "완료 확인 뒤 legacy index 원문이 달라졌습니다. 다른 실행자를 별도 확인하고 자동 재실행하지 마세요.");
  guard(); assertControls(state);
  return { ...summary, legacyIndexSha256: legacyBefore === null ? null : sha(legacyBefore), legacyIndexBytes: legacyBefore === null ? null : legacyBefore.length,
    allGlbsVerified: verified.unchanged.length + summary.uploaded === state.fullPlan.totals.glbObjects,
    productionWrites: production ? summary.uploaded + summary.completion.uploaded : 0, controlsUnchanged: true, durationMs: now() - started };
}
