import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";

import {
  BUNDLE_V2_INDEX_KEY,
  bundleV2ObjectKey,
  bundleV2PublicPath,
  createBundleV2DeployPlan,
  glbHasExternalResourceUri,
} from "./plan-creator-bundle-deploy.mjs";

/** 최소 GLB: 헤더 + JSON 청크(+ 패딩) + BIN 청크 헤더만으로 판정에 충분하다. */
function makeGlb(json) {
  const jsonText = JSON.stringify(json);
  const padded = jsonText + " ".repeat((4 - (jsonText.length % 4)) % 4);
  const total = 12 + 8 + padded.length + 8;
  const buffer = Buffer.alloc(total);
  buffer.writeUInt32LE(0x46546c67, 0); // glTF
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(total, 8);
  buffer.writeUInt32LE(padded.length, 12);
  buffer.writeUInt32LE(0x4e4f534a, 16); // JSON
  buffer.write(padded, 20, "utf8");
  buffer.writeUInt32LE(0, 20 + padded.length);
  buffer.writeUInt32LE(0x004e4942, 24 + padded.length); // BIN\0
  return buffer;
}

const SELF_CONTAINED = makeGlb({
  asset: { version: "2.0" },
  buffers: [{ byteLength: 0 }],
  images: [{ bufferView: 0, mimeType: "image/png" }],
});
const EXTERNAL = makeGlb({
  asset: { version: "2.0" },
  buffers: [{ byteLength: 0 }],
  images: [{ uri: "../Textures/atlas.png" }],
});

const themePacksFixture = {
  schema: "toonstudio.bg3d-bundle-theme-packs.v1",
  version: 1,
  inServiceOnly: true,
  downloadable: false,
  assetRoot: "/assets/studio/bundle-v2/",
  sourceManifest: { generatedAt: "2026-10-21T05:14:22.108Z" },
  totals: { packs: 1, placeableAssets: 1, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 },
  packs: [{ title: "Fixture" }],
  assets: [{
    id: "cbv1-ingest-001-fixture-m001",
    pack: 0,
    path: "pack-a/native/Some Folder/Model+A&B.glb",
    bytes: SELF_CONTAINED.length,
    sha256: createHash("sha256").update(SELF_CONTAINED).digest("hex"),
    tris: 12,
  }],
};

let root;
before(() => {
  root = mkdtempSync(join(tmpdir(), "bundle-v2-plan-test-"));
  const target = join(root, themePacksFixture.assets[0].path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, SELF_CONTAINED);
});
after(() => rmSync(root, { recursive: true, force: true }));

test("키와 공개 경로는 로더 규칙과 같다 (디코드 키, 조각별 인코딩 URL)", () => {
  const path = "pack-a/native/Some Folder/Model+A&B.glb";
  assert.equal(bundleV2ObjectKey(path), `assets/studio/bundle-v2/${path}`);
  assert.equal(
    bundleV2PublicPath(path),
    "/assets/studio/bundle-v2/pack-a/native/Some%20Folder/Model%2BA%26B.glb",
  );
});

test("외부 uri 판정은 검증기와 같이 uri 속성 존재로 결정한다", () => {
  assert.equal(glbHasExternalResourceUri(SELF_CONTAINED), false);
  assert.equal(glbHasExternalResourceUri(EXTERNAL), true);
  assert.equal(glbHasExternalResourceUri(Buffer.alloc(4)), null);
});

test("계획은 GLB 전수 대조를 통과하면 인덱스를 마지막 객체로 산출한다", () => {
  const { plan, errors } = createBundleV2DeployPlan({ themePacks: themePacksFixture, assetRoot: root });
  assert.deepEqual(errors, []);
  assert.equal(plan.totals.glbObjects, 1);
  assert.equal(plan.totals.objects, 2);
  assert.equal(plan.totals.glbBytes, SELF_CONTAINED.length);
  const [glb, index] = plan.objects;
  assert.equal(glb.key, "assets/studio/bundle-v2/pack-a/native/Some Folder/Model+A&B.glb");
  assert.equal(glb.publicPath, "/assets/studio/bundle-v2/pack-a/native/Some%20Folder/Model%2BA%26B.glb");
  assert.equal(glb.contentType, "model/gltf-binary");
  assert.equal(index.key, BUNDLE_V2_INDEX_KEY);
  const indexBody = JSON.parse(index.inlineBody);
  assert.equal(indexBody.files, 1);
  assert.equal(indexBody.bytes, SELF_CONTAINED.length);
});

test("외부 uri GLB가 배치 가능에 남아 있으면 계획을 거부한다", () => {
  const badRoot = mkdtempSync(join(tmpdir(), "bundle-v2-plan-bad-"));
  try {
    const rel = "pack-a/native/External.glb";
    mkdirSync(dirname(join(badRoot, rel)), { recursive: true });
    writeFileSync(join(badRoot, rel), EXTERNAL);
    const fixture = {
      ...themePacksFixture,
      assets: [{
        ...themePacksFixture.assets[0],
        path: rel,
        bytes: EXTERNAL.length,
        sha256: createHash("sha256").update(EXTERNAL).digest("hex"),
      }],
    };
    const { plan, errors } = createBundleV2DeployPlan({ themePacks: fixture, assetRoot: badRoot });
    assert.equal(plan, null);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /외부 리소스 uri/);
  } finally {
    rmSync(badRoot, { recursive: true, force: true });
  }
});

test("실물 누락과 해시 불일치는 각각 오류로 보고한다", () => {
  const missing = createBundleV2DeployPlan({ themePacks: themePacksFixture, assetRoot: join(root, "nope") });
  assert.equal(missing.plan, null);
  assert.match(missing.errors[0], /실물 파일이 없습니다/);
  const wrongHash = {
    ...themePacksFixture,
    assets: [{ ...themePacksFixture.assets[0], sha256: "0".repeat(64) }],
  };
  const mismatch = createBundleV2DeployPlan({ themePacks: wrongHash, assetRoot: root });
  assert.equal(mismatch.plan, null);
  assert.match(mismatch.errors[0], /해시 불일치/);
});
