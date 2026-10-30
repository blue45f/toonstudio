import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ALLOWED_PACK, SELF_CONTAINED, assetEntry, ledgerWithAllowedAndHeld, planFor, themePacksFor, writeTree } from "./lib/plan-creator-bundle-deploy-test-support.mjs";
import { BUNDLE_V2_INDEX_KEY } from "./plan-creator-bundle-deploy.mjs";
import { RELEASE_DESCRIPTOR_PATH, RELEASE_SCHEMA, STATIC_DIRECTORY, STATIC_URL_PREFIX, checkReleaseCatalog, createReleaseCatalog, parseReleaseArgs, writeReleaseCatalog } from "./publish-creator-bundle-release.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const hash = (body) => createHash("sha256").update(body).digest("hex");
const data = (value) => Buffer.from(JSON.stringify(value) + "\n");
function fixture(run, { duplicates = false, sources = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "release-publisher-test-"))), assetRoot = join(root, "source");
  try {
    const assets = [assetEntry("allowed-one", 0, "allowed/native/One.glb", SELF_CONTAINED)];
    if (duplicates) assets.push(assetEntry("allowed-two", 0, "allowed/native/Two.glb", SELF_CONTAINED));
    writeTree(assetRoot, Object.fromEntries(assets.map((asset) => [asset.path, SELF_CONTAINED])));
    const catalog = themePacksFor(assets, [ALLOWED_PACK]), catalogBytes = data(catalog);
    const { plan, errors } = planFor({ themePacks: catalog, assetRoot, ledger: ledgerWithAllowedAndHeld() });
    assert.deepEqual(errors, []); assert.ok(plan);
    const sourceChecks = sources ? assets.map((asset) => ({ path: join(assetRoot, asset.path), bytes: asset.bytes, sha256: asset.sha256 })) : [];
    const release = createReleaseCatalog({ catalogBytes, deployPlan: plan, ledger: ledgerWithAllowedAndHeld(), sourceChecks });
    run({ root, assetRoot, assets, catalog, catalogBytes, plan, release, output: join(root, "output") });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("원문 바이트를 유지하고 서로 결합한 내용 주소 JSON 두 개와 descriptor만 생성한다", () => fixture((f) => {
  assert.equal(f.release.files.length, 3);
  const descriptor = f.release.descriptor;
  assert.equal(descriptor.schema, RELEASE_SCHEMA);
  assert.equal(descriptor.catalog.sha256, hash(f.catalogBytes));
  assert.equal(descriptor.catalog.bytes, f.catalogBytes.length);
  assert.equal(descriptor.catalog.url, `${STATIC_URL_PREFIX}theme-packs.${hash(f.catalogBytes)}.json`);
  const metadata = f.release.files.find((file) => file.path.startsWith(STATIC_DIRECTORY + "/theme-packs."));
  assert.deepEqual(metadata.body, f.catalogBytes);
  const indexFile = f.release.files.find((file) => file.path.startsWith(STATIC_DIRECTORY + "/deploy-index."));
  const index = JSON.parse(indexFile.body);
  assert.equal(index.catalogSha256, hash(f.catalogBytes));
  assert.equal(index.files, 1); assert.equal(index.bytes, SELF_CONTAINED.length);
  assert.equal(index.keyScheme, "sha256"); assert.equal(index.objects, 1);
  assert.equal(descriptor.index.sha256, hash(indexFile.body));
  assert.equal(descriptor.index.bytes, indexFile.body.length);
  assert.equal(descriptor.index.url, `${STATIC_URL_PREFIX}deploy-index.${hash(indexFile.body)}.json`);
  assert.deepEqual(JSON.parse(f.release.files.find((file) => file.path === RELEASE_DESCRIPTOR_PATH).body), descriptor);
  assert.equal(f.release.files.some((file) => file.path.endsWith("/theme-packs.json") || file.path.endsWith("/manifest.json")), false);
}));

test("논리 에셋 수·바이트와 중복 제거한 GLB 객체 통계를 구분한다", () => fixture((f) => {
  const index = JSON.parse(f.release.files[1].body);
  assert.equal(index.files, 2); assert.equal(index.bytes, SELF_CONTAINED.length * 2);
  assert.equal(index.objects, 1); assert.equal(index.objectBytes, SELF_CONTAINED.length);
}, { duplicates: true }));

test("본문·통계·권리·namespace가 바뀐 기존 planner 계획은 거부한다", () => fixture((f) => {
  for (const mutate of [(p) => { p.objects[0].key = "elsewhere/model.glb"; }, (p) => { p.objects[0].bytes += 1; },
    (p) => { p.objects[0].assetIds = ["other"]; }, (p) => { p.objects.at(-1).sha256 = "0".repeat(64); },
    (p) => { p.objects.at(-1).key = "assets/studio/bundle-v2/other.json"; }, (p) => { p.totals.assetBytes += 1; },
    (p) => { p.excludedByRights.push({ assets: 1 }); }, (p) => { p.bucket = "other"; }]) {
    const changed = structuredClone(f.plan); mutate(changed);
    assert.throws(() => createReleaseCatalog({ catalogBytes: f.catalogBytes, deployPlan: changed, ledger: ledgerWithAllowedAndHeld() }));
  }
}));

test("카탈로그 바이트의 작은 변화도 새 catalog/index 주소를 만든다", () => fixture((f) => {
  const pretty = Buffer.from(JSON.stringify(f.catalog, null, 2) + "\n");
  const other = createReleaseCatalog({ catalogBytes: pretty, deployPlan: f.plan, ledger: ledgerWithAllowedAndHeld() });
  assert.notEqual(other.descriptor.catalog.url, f.release.descriptor.catalog.url);
  assert.notEqual(other.descriptor.index.url, f.release.descriptor.index.url);
  assert.deepEqual(JSON.parse(other.files[0].body), f.catalog);
}));

test("같은 에셋·계획·합계를 유지한 권리와 표기 의무 변경도 원장 대조로 거부한다", () => fixture((f) => {
  for (const mutate of [(rights) => { rights.status = rights.status === "licensed" ? "public-domain" : "licensed"; },
    (rights) => { rights.licenseName = "CC0-1.0"; },
    (rights) => { rights.attributionRequired = !rights.attributionRequired; },
    (rights) => { rights.attribution = "다른 제작자"; }]) {
    const changed = structuredClone(f.catalog); mutate(changed.packs[0].rights);
    assert.throws(() => createReleaseCatalog({ catalogBytes: data(changed), deployPlan: f.plan, ledger: ledgerWithAllowedAndHeld() }), /권리|표기 의무/u);
  }
  assert.throws(() => createReleaseCatalog({ catalogBytes: f.catalogBytes, deployPlan: f.plan }), /권리 원장/u);
}));

test("카탈로그와 계획의 해시·전수 소속·논리 합계가 맞아야 한다", () => fixture((f) => {
  for (const mutate of [(c) => { c.assets[0].sha256 = "0".repeat(64); }, (c) => { c.assets[0].pack = 99; },
    (c) => { c.assets[0].id = "other"; }, (c) => { c.assets[0].path = "../escape.glb"; },
    (c) => { c.packs[0].rights.commercialUse = false; }, (c) => { c.totals.placeableAssets += 1; },
    (c) => { c.downloadable = true; }, (c) => { c.assetRoot = "https://example.test/"; }]) {
    const changed = structuredClone(f.catalog); mutate(changed);
    assert.throws(() => createReleaseCatalog({ catalogBytes: data(changed), deployPlan: f.plan, ledger: ledgerWithAllowedAndHeld() }));
  }
  assert.throws(() => createReleaseCatalog({ catalogBytes: Buffer.concat([f.catalogBytes, Buffer.from([255])]), deployPlan: f.plan, ledger: ledgerWithAllowedAndHeld() }), /UTF-8/u);
}));

test("결정적 출력은 원문 버퍼와 caller plan을 수정하지 않는다", () => fixture((f) => {
  const before = structuredClone(f.plan), original = Buffer.from(f.catalogBytes);
  const again = createReleaseCatalog({ catalogBytes: f.catalogBytes, deployPlan: f.plan, ledger: ledgerWithAllowedAndHeld() });
  assert.deepEqual(again.files.map((file) => file.body), f.release.files.map((file) => file.body));
  assert.deepEqual(f.plan, before); assert.deepEqual(f.catalogBytes, original);
  f.catalogBytes.fill(32);
  assert.deepEqual(f.release.files[0].body, original);
}));

test("새 private envelope에 세 파일만 원자 게시하고 legacy 자료를 건드리지 않는다", () => fixture((f) => {
  const legacy = join(f.root, "legacy.json"); writeFileSync(legacy, "구자료");
  const result = writeReleaseCatalog(f.release, f.output, { protectedRoots: [f.assetRoot] });
  assert.equal(result.unchanged, false); assert.deepEqual(readdirSync(f.output), ["release"]);
  for (const file of f.release.files) assert.deepEqual(readFileSync(join(result.releaseRoot, file.path)), file.body);
  assert.equal(readFileSync(legacy, "utf8"), "구자료");
  assert.equal(existsSync(join(result.releaseRoot, "assets/studio/bundle-v2", BUNDLE_V2_INDEX_KEY)), false);
}));

test("동일 바이트만 멱등 성공하며 mtime·inode를 바꾸지 않는다", () => fixture((f) => {
  const first = writeReleaseCatalog(f.release, f.output), path = join(first.releaseRoot, RELEASE_DESCRIPTOR_PATH), before = statSync(path);
  const second = writeReleaseCatalog(f.release, f.output), after = statSync(path);
  assert.equal(second.unchanged, true); assert.equal(before.ino, after.ino); assert.equal(before.mtimeMs, after.mtimeMs);
  assert.equal(checkReleaseCatalog(f.release, f.output).catalogSha256, f.release.summary.catalogSha256);
}));

test("기존 파일이 다른 바이트이면 덮어쓰지 않고 실패한다", () => fixture((f) => {
  const result = writeReleaseCatalog(f.release, f.output), path = join(result.releaseRoot, RELEASE_DESCRIPTOR_PATH);
  writeFileSync(path, "보존할 다른 바이트");
  assert.throws(() => writeReleaseCatalog(f.release, f.output), /바이트/u);
  assert.equal(readFileSync(path, "utf8"), "보존할 다른 바이트");
}));

test("추가 파일·빠진 파일·symlink가 있는 결과는 멱등으로 간주하지 않는다", () => fixture((f) => {
  const result = writeReleaseCatalog(f.release, f.output);
  writeFileSync(join(result.releaseRoot, "extra.json"), "{}");
  assert.throws(() => checkReleaseCatalog(f.release, f.output), /목록/u);
  rmSync(join(result.releaseRoot, "extra.json"));
  const target = join(result.releaseRoot, RELEASE_DESCRIPTOR_PATH); rmSync(target);
  assert.throws(() => checkReleaseCatalog(f.release, f.output), /빠진 파일/u);
  symlinkSync(join(f.root, "missing"), target);
  assert.throws(() => writeReleaseCatalog(f.release, f.output), /심볼릭/u);
}));

test("부분 쓰기 실패는 자기 staging만 정리하고 기존 자료를 보존한다", () => fixture((f) => {
  let writes = 0;
  assert.throws(() => writeReleaseCatalog(f.release, f.output, { writeFile: (path, body, options) => {
    assert.equal(options.flag, "wx");
    if (++writes === 2) throw new Error("합성 쓰기 실패");
    writeFileSync(path, body, options);
  } }), /합성/u);
  assert.equal(existsSync(f.output), false);
  assert.deepEqual(readFileSync(join(f.assetRoot, f.assets[0].path)), SELF_CONTAINED);
}));

test("예약 뒤 생긴 다른 파일은 실패 정리에서 삭제하지 않는다", () => fixture((f) => {
  assert.throws(() => writeReleaseCatalog(f.release, f.output, { writeFile: () => {
    writeFileSync(join(f.output, "keep"), "보존"); throw new Error("중단");
  } }));
  assert.equal(readFileSync(join(f.output, "keep"), "utf8"), "보존");
  assert.deepEqual(readdirSync(f.output), ["keep"]);
}));

test("계획 뒤 원본 변경이나 산출물 버퍼 변조는 게시하지 않는다", () => fixture((f) => {
  writeFileSync(join(f.assetRoot, f.assets[0].path), "변경");
  assert.throws(() => writeReleaseCatalog(f.release, f.output), /변경/u);
  assert.equal(existsSync(f.output), false);
}, { sources: true }));

test("생성한 산출물 Buffer를 나중에 바꾸면 고정 SHA와 달라 실패한다", () => fixture((f) => {
  f.release.files[0].body[0] ^= 1;
  assert.throws(() => writeReleaseCatalog(f.release, f.output), /본문과 SHA/u);
  assert.equal(existsSync(f.output), false);
}));

test("공개 경로·원본 안 또는 기존 symlink에 출력하지 않는다", () => fixture((f) => {
  mkdirSync(join(f.root, "public"));
  assert.throws(() => writeReleaseCatalog(f.release, join(f.root, "public/out")), /private/u);
  assert.throws(() => writeReleaseCatalog(f.release, join(f.assetRoot, "out"), { protectedRoots: [f.assetRoot] }), /private/u);
  const linked = join(f.root, "link"); symlinkSync(f.assetRoot, linked);
  assert.throws(() => writeReleaseCatalog(f.release, linked), /심볼릭/u);
}));

test("production은 없고 명시 check 또는 private write만 허용한다", () => {
  const base = ["--catalog", "/catalog.json", "--asset-root", "/input"];
  assert.equal(parseReleaseArgs([...base, "--check"])["--check"], true);
  assert.equal(parseReleaseArgs([...base, "--write", "--output-root", "/private"])["--write"], true);
  for (const args of [[...base], [...base, "--production"], [...base, "--write"], [...base, "--check", "--write"],
    [...base, "--check", "--check"], [...base, "--unknown", "x"]]) assert.throws(() => parseReleaseArgs(args));
});
