import assert from "node:assert/strict";
import { BUNDLE_V2_BUCKET, BUNDLE_V2_INDEX_KEY, BUNDLE_V2_MANIFEST_SCHEMA, bundleV2ObjectKey } from "../plan-creator-bundle-deploy.mjs";
import { assertBundleR2RemoteBody, bundleR2BodyFingerprint, planBundleR2Delta, verifyBundleR2Delta } from "./creator-bundle-r2-delta.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

function fixture() {
  const bodies = [Buffer.from("기존 GLB 전체 바이트"), Buffer.from("새 GLB 전체 바이트")];
  const fingerprints = new Map();
  const objects = bodies.map((body, index) => {
    const fp = bundleR2BodyFingerprint(body), key = bundleV2ObjectKey(fp.sha256);
    fingerprints.set(key, fp);
    return { key, bytes: fp.bytes, sha256: fp.sha256, source: `pack/native/${index}.glb` };
  });
  const plan = { schema: BUNDLE_V2_MANIFEST_SCHEMA, version: 1, bucket: BUNDLE_V2_BUCKET, keyScheme: "sha256", excludedByRights: [],
    totals: { glbObjects: 2, glbBytes: bodies.reduce((sum, body) => sum + body.length, 0) },
    objects: [...objects, { key: BUNDLE_V2_INDEX_KEY, source: null, inlineBody: "{}\n" }] };
  return { bodies, fingerprints, objects, plan };
}

test("신규 GLB만 선택하고 고정 인덱스는 원격 상태와 무관하게 보존한다", () => {
  const f = fixture(), remote = new Map([[BUNDLE_V2_INDEX_KEY, { size: 999, etag: "낡은 인덱스" }]]);
  const delta = planBundleR2Delta(f.plan, f.fingerprints, remote);
  assert.deepEqual(delta.missing, f.objects);
  assert.deepEqual(delta.unchanged, []);
  assert.equal(delta.legacyIndexPreserved, true);
  assert.equal(delta.missing.some((object) => object.key === BUNDLE_V2_INDEX_KEY), false);
});

test("크기와 단일 PUT MD5가 같은 원격 객체를 다시 업로드하지 않는다", () => {
  const f = fixture(), object = f.objects[0], local = f.fingerprints.get(object.key);
  const remote = new Map([[object.key, { size: object.bytes, etag: `"${local.md5.toUpperCase()}"` }]]);
  const delta = planBundleR2Delta(f.plan, f.fingerprints, remote);
  assert.deepEqual(delta.unchanged, [object]);
  assert.deepEqual(delta.missing, [f.objects[1]]);
});

test("동일 SHA 키의 크기 또는 MD5 충돌은 재업로드로 바꾸지 않고 실패한다", () => {
  const f = fixture(), object = f.objects[0], md5 = f.fingerprints.get(object.key).md5;
  for (const existing of [{ size: object.bytes + 1, etag: md5 }, { size: object.bytes, etag: "0".repeat(32) }, { size: NaN, etag: md5 }]) {
    assert.throws(() => planBundleR2Delta(f.plan, f.fingerprints, new Map([[object.key, existing]])), /원격|크기/u);
  }
});

test("multipart etag는 본문 전체 SHA를 확인한 뒤에만 재사용한다", async () => {
  const f = fixture(), object = f.objects[0];
  const delta = planBundleR2Delta(f.plan, f.fingerprints, new Map([[object.key, { size: object.bytes, etag: "multipart-2" }]]));
  assert.deepEqual(delta.verifyRemote, [object]);
  assert.deepEqual(delta.missing, [f.objects[1]]);
  const calls = [];
  const verified = await verifyBundleR2Delta(delta, async (item) => { calls.push(item); return f.bodies[0]; });
  assert.deepEqual(calls, [object]);
  assert.deepEqual(verified.verifyRemote, []);
  assert.deepEqual(verified.unchanged, [object]);
  await assert.rejects(verifyBundleR2Delta(delta, async () => Buffer.alloc(object.bytes)), /원격 본문/u);
});

test("파일 수만 맞춘 변조 계획·잘못된 지문·다른 버킷·권리 제외를 거부한다", () => {
  const mutations = [
    (f) => { f.plan.bucket = "다른 버킷"; },
    (f) => { f.plan.excludedByRights.push({ assets: 1 }); },
    (f) => { f.plan.totals.glbBytes += 1; },
    (f) => { f.objects[0].key = BUNDLE_V2_INDEX_KEY + "/../fake.glb"; },
    (f) => { f.plan.objects.push(f.objects[0]); },
    (f) => { f.fingerprints.delete(f.objects[0].key); },
    (f) => { f.fingerprints.get(f.objects[0].key).sha256 = "0".repeat(64); },
    (f) => { f.fingerprints.set("추가 키", { bytes: 1 }); },
    (f) => { f.plan.objects.pop(); },
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); assert.throws(() => planBundleR2Delta(f.plan, f.fingerprints, new Map())); }
});

test("기존 객체의 같은 길이 본문 변조도 SHA 검사에서 실패한다", () => {
  const f = fixture();
  assertBundleR2RemoteBody(f.objects[0], f.bodies[0]);
  const changed = Buffer.from(f.bodies[0]); changed[0] ^= 1;
  assert.throws(() => assertBundleR2RemoteBody(f.objects[0], changed), /원격 본문/u);
});
