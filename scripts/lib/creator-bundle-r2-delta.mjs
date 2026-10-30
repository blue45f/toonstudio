/** 내용 주소 GLB의 누락분만 고른다. 기존 객체의 불일치는 덮어쓰기 대신 중단한다. */
import { createHash } from "node:crypto";
import { BUNDLE_V2_BUCKET, BUNDLE_V2_INDEX_KEY, BUNDLE_V2_MANIFEST_SCHEMA, bundleV2ObjectKey } from "../plan-creator-bundle-deploy.mjs";

const SHA = /^[a-f0-9]{64}$/u;
const MD5 = /^[a-f0-9]{32}$/u;
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const fail = (message) => { throw new TypeError(`${message} 원격 목록과 로컬 전체 계획을 새로 검증하세요. 기존 객체는 덮어쓰지 않습니다.`); };

/** 로컬 파일을 이미 읽는 전체 계획 단계에서 함께 계산할 지문이다. */
export function bundleR2BodyFingerprint(body) {
  return { bytes: body.byteLength, sha256: createHash("sha256").update(body).digest("hex"), md5: createHash("md5").update(body).digest("hex") };
}

/**
 * remote에는 방금 읽은 실제 목록을 전달한다. 단일 PUT의 MD5 etag만 바로 재사용한다.
 * multipart 등 비교할 수 없는 etag는 원격 본문 SHA 검증 대상으로 돌려보낸다.
 * 새 인덱스는 Static Assets release에 넣는다. 기존 manifest.json은 호환용으로 보존한다.
 */
export function planBundleR2Delta(fullPlan, fingerprints, remote) {
  if (fullPlan?.schema !== BUNDLE_V2_MANIFEST_SCHEMA || fullPlan.version !== 1 || fullPlan.bucket !== BUNDLE_V2_BUCKET
    || fullPlan.keyScheme !== "sha256" || !Array.isArray(fullPlan.objects) || !(fingerprints instanceof Map) || !(remote instanceof Map)
    || fullPlan.excludedByRights?.length !== 0) fail("전체 권리 검증을 마친 bundle-v2 계획과 실제 지문이 필요합니다.");
  const missing = [], unchanged = [], verifyRemote = [], seen = new Set();
  let indexCount = 0, logicalObjects = 0, objectBytes = 0;
  for (const object of fullPlan.objects) {
    if (seen.has(object.key)) fail("계획에 중복 객체 키가 있습니다.");
    seen.add(object.key);
    if (object.key === BUNDLE_V2_INDEX_KEY) {
      if (object.source !== null || typeof object.inlineBody !== "string") fail("기존 배포 인덱스 descriptor가 다릅니다.");
      indexCount += 1;
      continue;
    }
    if (!SHA.test(object.sha256) || object.key !== bundleV2ObjectKey(object.sha256) || !positive(object.bytes)
      || typeof object.source !== "string" || object.source.length === 0 || object.inlineBody !== undefined) fail("내용 주소 GLB descriptor가 아닙니다.");
    const local = fingerprints.get(object.key);
    if (!local || local.bytes !== object.bytes || local.sha256 !== object.sha256 || !MD5.test(local.md5)) fail("로컬 실제 GLB 지문과 계획이 다릅니다.");
    logicalObjects += 1;
    objectBytes += object.bytes;
    const existing = remote.get(object.key);
    if (existing === undefined) { missing.push(object); continue; }
    if (!existing || !positive(existing.size) || existing.size !== object.bytes || typeof existing.etag !== "string") fail("같은 SHA 키의 원격 크기 또는 메타데이터가 다릅니다.");
    const etag = existing.etag.replace(/^"([a-fA-F0-9]{32})"$/u, "$1").toLowerCase();
    if (MD5.test(etag)) {
      if (etag !== local.md5) fail("같은 SHA 키의 원격 MD5가 다릅니다.");
      unchanged.push(object);
    } else {
      verifyRemote.push(object);
    }
  }
  if (indexCount !== 1 || logicalObjects === 0 || fullPlan.totals?.glbObjects !== logicalObjects
    || fullPlan.totals.glbBytes !== objectBytes || fingerprints.size !== logicalObjects) fail("전체 계획의 고유 GLB 합계와 지문 집합이 다릅니다.");
  return { missing, unchanged, verifyRemote, legacyIndexPreserved: true };
}

/** 비교할 수 없는 etag를 가진 기존 객체는 GET 본문 전체로 확인한다. */
export function assertBundleR2RemoteBody(object, body) {
  const actual = bundleR2BodyFingerprint(body);
  if (actual.bytes !== object.bytes || actual.sha256 !== object.sha256) fail("같은 SHA 키의 원격 본문이 다릅니다.");
}

/** 업로드 시작 전에 불확실한 기존 객체를 전부 확인한다. 첫 실패 이후 PUT은 실행하지 않는다. */
export async function verifyBundleR2Delta(plan, readObject) {
  for (const object of plan.verifyRemote) assertBundleR2RemoteBody(object, await readObject(object));
  return { ...plan, unchanged: [...plan.unchanged, ...plan.verifyRemote], verifyRemote: [] };
}
