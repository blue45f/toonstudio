import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { RELEASE_DESCRIPTOR_PATH, RELEASE_SCHEMA, STATIC_URL_PREFIX } from "./publish-creator-bundle-release.mjs";
import { assertNativeBundleReleaseCurrent, loadNativeBundleRelease, nativeReleaseBindingProblems,
  nativeReleaseTraceProblems, NATIVE_COMPOSITE_CONFIG_PATH, requireNativeBundleRelease } from "./lib/creator-bundle-native-release.mjs";

const hash = body => createHash("sha256").update(body).digest("hex");
const bytes = value => Buffer.from(JSON.stringify(value) + "\n");
function put(path, body) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body); return path; }
function fixture(indexPatch = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "native-release-test-"))), repoRoot = join(root, "repo");
  const webPublic = join(repoRoot, "apps/web/public");
  const catalogBody = bytes({ schema: "toonstudio.bg3d-bundle-theme-packs.v1", version: 1,
    inServiceOnly: true, downloadable: false, assetRoot: "/assets/studio/bundle-v2/",
    sourceManifest: { generatedAt: "2026-10-30T00:00:00.000Z" },
    assets: [{ id: "cbv1-ingest-fixture-leaf", bytes: 128 }], totals: { placeableAssets: 1 } });
  const indexBody = bytes({ schema: "toonstudio.bundle-v2-deploy-index.v1", version: 1,
    keyScheme: "sha256", files: 1, bytes: 128, catalogSha256: hash(catalogBody), ...indexPatch });
  const descriptor = { schema: RELEASE_SCHEMA, version: 1,
    catalog: { url: `${STATIC_URL_PREFIX}theme-packs.${hash(catalogBody)}.json`, sha256: hash(catalogBody), bytes: catalogBody.length },
    index: { url: `${STATIC_URL_PREFIX}deploy-index.${hash(indexBody)}.json`, sha256: hash(indexBody), bytes: indexBody.length } };
  const descriptorPath = put(join(repoRoot, RELEASE_DESCRIPTOR_PATH), bytes(descriptor));
  const composite = { schema: "toonstudio.creator-bundle-composite-ingest.v1", version: 1,
    projection: "apps/web/public" + descriptor.catalog.url, projectionSha256: descriptor.catalog.sha256,
    snapshotGeneratedAt: "2026-10-30T00:00:00.000Z", expected: { files: 1, bytes: 128 } };
  const compositePath = put(join(repoRoot, NATIVE_COMPOSITE_CONFIG_PATH), bytes(composite));
  const catalogPath = put(join(webPublic, descriptor.catalog.url.slice(1)), catalogBody);
  const indexPath = put(join(webPublic, descriptor.index.url.slice(1)), indexBody);
  return { root, repoRoot, webPublic, descriptor, descriptorPath, composite, compositePath, catalogPath, indexPath,
    load: () => loadNativeBundleRelease({ repoRoot, webPublic }) };
}
function withFixture(run, patch) {
  const value = fixture(patch);
  try { run(value); } finally { rmSync(value.root, { recursive: true, force: true }); }
}

test("앱 빌드 descriptor와 정적 원문 둘의 정확 SHA·bytes를 읽고 immutable binding을 만든다", () => withFixture(f => {
  const release = f.load();
  assert.deepEqual(release.descriptor, f.descriptor);
  assert.equal(release.binding.catalog.sha256, hash(readFileSync(f.catalogPath)));
  assert.equal(release.binding.index.sha256, hash(readFileSync(f.indexPath)));
  assert.equal(release.binding.descriptorSha256, hash(readFileSync(f.descriptorPath)));
  assert.equal(release.binding.compositeConfigSha256, hash(readFileSync(f.compositePath)));
  assert.deepEqual(nativeReleaseBindingProblems(release.binding, f.descriptor.catalog.sha256), []);
  assert.doesNotThrow(() => assertNativeBundleReleaseCurrent(release));
}));

test("catalog/index 원문 hash가 각각 맞아도 서로 다른 catalog 연결이나 합계는 거부한다", () => {
  for (const patch of [{ catalogSha256: "f".repeat(64) }, { files: 2 }, { bytes: 129 }, { keyScheme: "path" }]) {
    withFixture(f => assert.throws(f.load, /catalogSha256 연결/u), patch);
  }
});

test("legacy·외부·encoded·query·다른 hash 경로와 미지원 release 필드를 거부한다", () => withFixture(f => {
  for (const url of ["/assets/3d/environments/bundle-v1/theme-packs.json", "https://example.test/catalog.json",
    f.descriptor.catalog.url + "?v=1", f.descriptor.catalog.url + "#part",
    f.descriptor.catalog.url.replace("theme-packs.", "%74heme-packs."), f.descriptor.index.url]) {
    assert.throws(() => requireNativeBundleRelease({ ...f.descriptor, catalog: { ...f.descriptor.catalog, url } }));
  }
  for (const patch of [{ bytes: 0 }, { bytes: 32 * 1024 * 1024 + 1 }, { sha256: "A".repeat(64) }, { future: true }]) {
    assert.throws(() => requireNativeBundleRelease({ ...f.descriptor, catalog: { ...f.descriptor.catalog, ...patch } }));
  }
  assert.throws(() => requireNativeBundleRelease({ ...f.descriptor, future: true }));
}));

test("원문 변경은 browser proxy 사용 전과 최종 재대조에서 모두 실패한다", () => {
  for (const name of ["descriptorPath", "compositePath", "catalogPath", "indexPath"]) withFixture(f => {
    const release = f.load(), body = readFileSync(f[name]);
    const changed = Buffer.from(body); changed[0] ^= 1; writeFileSync(f[name], changed);
    assert.throws(() => assertNativeBundleReleaseCurrent(release), /바이트·SHA/u);
  });
});

test("descriptor와 정적 본문의 symlink를 거부한다", () => {
  for (const name of ["descriptorPath", "compositePath", "catalogPath", "indexPath"]) withFixture(f => {
    const body = readFileSync(f[name]), outside = put(join(f.root, "outside.json"), body);
    rmSync(f[name]); symlinkSync(outside, f[name]);
    assert.throws(f.load, /심볼릭 링크/u);
  });
});

test("새 composite 생성 원본의 projection 경로·SHA·개수·바이트·생성 시각을 release와 대조한다", () => {
  for (const mutate of [
    value => { value.projection = "apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json"; },
    value => { value.projectionSha256 = "f".repeat(64); },
    value => { value.expected.files = 1929; }, value => { value.expected.bytes += 1; },
    value => { value.snapshotGeneratedAt = "2026-10-29T00:00:00.000Z"; },
  ]) withFixture(f => {
    mutate(f.composite); writeFileSync(f.compositePath, bytes(f.composite));
    assert.throws(f.load, /composite 생성 원본/u);
  });
});

test("실제 catalog/index 요청 trace와 동일 release binding이 모두 있어야 한다", () => withFixture(f => {
  const release = f.load(), trace = { catalog: { ...release.binding.catalog, requests: 1 },
    index: { ...release.binding.index, requests: 1 }, unexpected: [] };
  assert.deepEqual(nativeReleaseTraceProblems(trace, release.binding), []);
  for (const mutate of [
    value => { value.index.requests = 0; }, value => { value.catalog.sha256 = "f".repeat(64); },
    value => { value.index.url = "/assets/studio/bundle-v2/manifest.json"; },
    value => { value.unexpected.push("/assets/3d/environments/bundle-v1/theme-packs.json"); },
  ]) {
    const changed = structuredClone(trace); mutate(changed);
    assert.ok(nativeReleaseTraceProblems(changed, release.binding).length > 0);
  }
  assert.ok(nativeReleaseBindingProblems(release.binding, "e".repeat(64)).length > 0);
}));
