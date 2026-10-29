import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import nodeTest from "node:test";

import { test as vitestTest } from "vitest";

import { buildLocalIngestPlan, checkLocalIngest, DEFAULT_CONFIG, runLocalIngestCli, validateLocalIngestConfig, writeLocalIngest } from "./rebuild-creator-bundle-local-ingest.mjs";
import { loadPackRightsLedger } from "./lib/creator-bundle-pack-rights.mjs";
import { selfContainedGlb } from "./lib/creator-bundle-pack-rights-test-support.mjs";

const test = process.env.VITEST ? vitestTest : nodeTest;
const sha = (body) => createHash("sha256").update(body).digest("hex");
const INGEST = "cbv1-ingest-local-cute-park", CATALOG = "cbv1-008-cute-park-pack";
const SOURCE = "01-city/cute-park-pack/models/mixed/gLTF";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "creator-ingest-test-")), libraryRoot = join(root, "library"), source = join(libraryRoot, SOURCE, "Bench.glb");
  mkdirSync(dirname(source), { recursive: true });
  const body = selfContainedGlb("ingestion"); writeFileSync(source, body);
  const asset = { id: `${INGEST}-bench-${sha(body).slice(0, 12)}`, pack: 0, path: `${INGEST}/native/Bench.glb`, bytes: body.length, sha256: sha(body), tris: 0 };
  const projection = { inServiceOnly: true, downloadable: false, budgetProfile: "mobile", packs: [{ catalogIds: [CATALOG], ingestPackIds: [INGEST] }], assets: [asset] };
  const projectionBytes = Buffer.from(JSON.stringify(projection));
  const config = { schema: "toonstudio.creator-bundle-local-ingest.v1", projection: "fixtures/projection.json", projectionSha256: sha(projectionBytes), snapshotGeneratedAt: "2026-10-28T14:13:13.555666+00:00", copyPolicy: "copy-only-no-hardlinks", expected: { files: 1, bytes: body.length }, packs: [{ catalogId: CATALOG, ingestId: INGEST, librarySource: SOURCE, files: 1, bytes: body.length }] };
  const inputs = { libraryRoot, config, projectionBytes, ledger: structuredClone(loadPackRightsLedger()) };
  return { root, source, body, asset, projection, inputs, output: join(root, "output"), plan: () => buildLocalIngestPlan(inputs) };
}

function inFixture(run) { const f = fixture(); try { run(f); } finally { rmSync(f.root, { recursive: true, force: true }); } }
function updateProjection(f) { f.inputs.projectionBytes = Buffer.from(JSON.stringify(f.projection)); f.inputs.config.projectionSha256 = sha(f.inputs.projectionBytes); }

test("설정은 역사 8팩을 보존하고 현재 10팩·1929개의 공개 메타데이터와 바이트 합계를 대조한다", () => {
  const config = JSON.parse(readFileSync(DEFAULT_CONFIG, "utf8"));
  validateLocalIngestConfig(config);
  const historical = [
    ["cbv1-008-cute-park-pack", "cbv1-ingest-local-cute-park", "01-city/cute-park-pack/models/mixed/gLTF", 103, 94403244],
    ["cbv1-024-cute-dungeon-megapack", "cbv1-ingest-local-cute-dungeon", "02-medieval-fantasy/cute-dungeon-megapack/models/mixed/gLTF", 320, 196787736],
    ["cbv1-014-cute-graveyard", "cbv1-ingest-local-cute-graveyard", "05-horror-gothic/cute-graveyard/models/mixed/gLTF", 253, 142555424],
    ["cbv1-076-medieval-weapons", "cbv1-ingest-local-medieval-weapons", "02-medieval-fantasy/free-medieval-weapons-small-low-poly-pack/models/mixed/gLTF", 32, 18906768],
    ["cbv1-053-scifi-arena-blue-base", "cbv1-ingest-local-scifi-blue-base", "06-scifi/sci-fi-arena-blue-base/models/mixed/gLTF", 114, 81671064],
    ["cbv1-081-cartoon-car-megapack", "cbv1-ingest-local-cartoon-car-megapack", "20-vehicles/cartoon-car-megapack/models/mixed/gLTF", 180, 302323400],
    ["cbv1-017-cartoon-cars-2", "cbv1-ingest-local-cartoon-cars-2", "20-vehicles/cartoon-cars-2/models/mixed/Gltf", 453, 863451444],
    ["cbv1-018-army-pack", "cbv1-ingest-local-army-pack", "30-props/army-pack/models/mixed/gLTF", 309, 193324500],
  ];
  assert.equal(config.packs.length, 10);
  assert.equal(config.expected.files, 1929);
  assert.deepEqual(config.packs.slice(0, 8).map((pack) => [pack.catalogId, pack.ingestId, pack.librarySource, pack.files, pack.bytes]), historical);
  assert.deepEqual(config.packs.slice(8).map((pack) => [pack.catalogId, pack.ingestId, pack.librarySource, pack.files]), [
    ["cbv1-012-cemetery-statues", "cbv1-ingest-local-cemetery-statues", "05-horror-gothic/cemetery-statues/models/glb", 50],
    ["cbv1-077-small-props-pack", "cbv1-ingest-local-small-props-pack", "02-medieval-fantasy/free-medieval-props-small-pack-low-poly/models/mixed/gLTF/Props", 115],
  ]);
  assert.equal(config.packs.reduce((sum, pack) => sum + pack.files, 0), config.expected.files);
  assert.equal(config.packs.reduce((sum, pack) => sum + pack.bytes, 0), config.expected.bytes);
  const projectionBytes = readFileSync(join(dirname(DEFAULT_CONFIG), "..", config.projection));
  assert.equal(sha(projectionBytes), config.projectionSha256);
  const projection = JSON.parse(projectionBytes);
  assert.equal(projection.sourceManifest.generatedAt, config.snapshotGeneratedAt);
  assert.equal(projection.assets.length, config.expected.files);
  assert.equal(projection.totals.placeableAssets, config.expected.files);
  assert.equal(projection.assets.reduce((sum, asset) => sum + asset.bytes, 0), config.expected.bytes);
  for (const pack of config.packs) {
    const assets = projection.assets.filter((asset) => asset.path.startsWith(pack.ingestId + "/native/"));
    assert.equal(assets.length, pack.files, pack.ingestId);
    assert.equal(assets.reduce((sum, asset) => sum + asset.bytes, 0), pack.bytes, pack.ingestId);
    for (const asset of assets) {
      assert.ok(asset.id.startsWith(pack.ingestId + "-"), asset.id);
      assert.ok(projection.packs[asset.pack].catalogIds.includes(pack.catalogId), asset.id);
      assert.ok(projection.packs[asset.pack].ingestPackIds.includes(pack.ingestId), asset.id);
    }
  }
  assert(!JSON.stringify(config).includes("/Users/"));
  const wrong = structuredClone(config); wrong.packs[0].librarySource = "/outside/pack";
  assert.throws(() => validateLocalIngestConfig(wrong), /상대 경로/u);
});

test("중복 인자·알 수 없는 모드·dry-run과 check 혼용을 파일 읽기 전에 거부한다", () => {
  assert.throws(() => runLocalIngestCli(["--dry-run", "--dry-run"]), /중복/u);
  assert.throws(() => runLocalIngestCli(["--publish"]), /알 수 없/u);
  assert.throws(() => runLocalIngestCli(["--library-root", "unused", "--dry-run", "--check"]), /실행 모드/u);
});

test("dry-run은 파일을 만들지 않고 기존 생성기의 권리·메트릭을 거친 정확한 source ID를 계획한다", () => inFixture((f) => {
  const configPath = join(f.root, "config.json"), projectionPath = join(f.root, "projection.json");
  writeFileSync(configPath, JSON.stringify(f.inputs.config)); writeFileSync(projectionPath, f.inputs.projectionBytes);
  const output = JSON.parse(runLocalIngestCli(["--library-root", f.inputs.libraryRoot, "--config", configPath, "--projection", projectionPath, "--output-root", f.output, "--dry-run"]));
  assert.deepEqual(output, { mode: "dry-run", packs: 1, files: 1, bytes: f.body.length });
  assert.equal(existsSync(f.output), false);
  const entry = f.plan().manifest.assets[0];
  assert.equal(entry.id, f.asset.id); assert.equal(entry.sourcePath, "Bench.glb"); assert.equal(entry.files[0].path, f.asset.path);
}));

test("copy-only 재현은 바이트·해시·source ID를 보존하고 원본과 inode를 공유하지 않는다", () => inFixture((f) => {
  const plan = f.plan(); writeLocalIngest(plan, f.output);
  assert.deepEqual(checkLocalIngest(plan, f.output), { packs: 1, files: 1, bytes: f.body.length });
  const destination = join(f.output, f.asset.path);
  assert.deepEqual(readFileSync(destination), f.body); assert.notEqual(statSync(destination).ino, statSync(f.source).ino);
  assert.deepEqual(JSON.parse(readFileSync(join(f.output, "manifest-v2.json"), "utf8")), plan.manifest);
  assert(!readFileSync(join(f.output, "ingestion-origins.json"), "utf8").includes(f.inputs.libraryRoot));
  writeFileSync(destination, "edited output"); assert.deepEqual(readFileSync(f.source), f.body);
  assert.throws(() => checkLocalIngest(plan, f.output), /SHA-256/u);
}));

test("원장 hold·빠진 증빙은 GLB 복사 전에 거부한다", () => inFixture((f) => {
  const entry = f.inputs.ledger.packs.find((pack) => pack.id === CATALOG);
  entry.serve = "hold"; delete entry.grant; entry.holdReason = "evidence-incomplete"; entry.holdLabel = "준비 중이며 공개 시점은 정해지지 않았다.";
  assert.throws(f.plan, /권리 게이트/u); assert.equal(existsSync(f.output), false);
  entry.serve = "allow"; delete entry.holdReason; delete entry.holdLabel; entry.evidence = [];
  assert.throws(f.plan, /원장 거부/u);
}));

test("권위 projection·원본 해시·팩 소유권 변조를 거부한다", () => inFixture((f) => {
  f.inputs.projectionBytes = Buffer.from("{}"); assert.throws(f.plan, /projection의 SHA/u);
  updateProjection(f); writeFileSync(f.source, Buffer.concat([f.body, Buffer.from("tamper")])); assert.throws(f.plan, /원본 크기·SHA/u);
  writeFileSync(f.source, f.body); f.projection.packs[0].catalogIds = ["cbv1-052-scifi-arena-cargo"]; updateProjection(f); assert.throws(f.plan, /팩 소유권/u);
}));

test("상대 경로 traversal과 라이브러리 밖 symlink를 거부한다", () => inFixture((f) => {
  f.projection.assets[0].path = `${INGEST}/native/../Bench.glb`; updateProjection(f); assert.throws(f.plan, /상대 경로/u);
  f.projection.assets[0].path = `${INGEST}/native/Bench.glb`; updateProjection(f);
  const outside = join(f.root, "outside.glb"); writeFileSync(outside, f.body); rmSync(f.source); symlinkSync(outside, f.source);
  assert.throws(f.plan, /symlink 탈출/u);
}));

test("원본 해시를 다시 기록해도 외부 텍스처 GLB는 기존 모바일 게이트가 거부한다", () => inFixture((f) => {
  const jsonLength = f.body.readUInt32LE(12), json = JSON.parse(f.body.subarray(20, 20 + jsonLength).toString("utf8"));
  json.images[0].uri = "../outside.png";
  let chunk = Buffer.from(JSON.stringify(json)); chunk = Buffer.concat([chunk, Buffer.alloc((4 - chunk.length % 4) % 4, 32)]);
  const body = Buffer.alloc(20 + chunk.length); body.writeUInt32LE(0x46546c67, 0); body.writeUInt32LE(2, 4); body.writeUInt32LE(body.length, 8); body.writeUInt32LE(chunk.length, 12); body.writeUInt32LE(0x4e4f534a, 16); chunk.copy(body, 20);
  writeFileSync(f.source, body); Object.assign(f.asset, { sha256: sha(body), bytes: body.length });
  f.inputs.config.expected.bytes = body.length; f.inputs.config.packs[0].bytes = body.length; updateProjection(f);
  assert.throws(f.plan, /GLB 모바일/u);
}));

test("출력은 원본·public 밖 새 디렉터리만 받으며 기존 출력과 숨은 잔여 파일을 보호한다", () => inFixture((f) => {
  const plan = f.plan(), publicRoot = join(f.root, "public"); mkdirSync(publicRoot);
  assert.throws(() => writeLocalIngest(plan, join(publicRoot, "output")), /공개 디렉터리/u);
  assert.throws(() => writeLocalIngest(plan, join(f.inputs.libraryRoot, "output")), /라이브러리/u);
  writeLocalIngest(plan, f.output); assert.throws(() => writeLocalIngest(plan, f.output), /덮어쓰지/u);
  writeFileSync(join(f.output, ".draft.glb"), "leftover"); assert.throws(() => checkLocalIngest(plan, f.output), /알 수 없는 출력/u);
}));

test("부분 복사 실패는 staging을 정리하고 원본·기존 파일을 변경하지 않는다", () => inFixture((f) => {
  const plan = f.plan();
  assert.throws(() => writeLocalIngest(plan, f.output, { copyFile: (source, destination) => { copyFileSync(source, destination); throw new Error("copy failed"); } }), /copy failed/u);
  assert.equal(existsSync(f.output), false); assert.equal(readdirSync(f.root).some((name) => name.startsWith(".creator-bundle-ingest-")), false);
  assert.deepEqual(readFileSync(f.source), f.body);
}));

test("manifest symlink와 ID 변경은 출력 검증에서 거부한다", () => inFixture((f) => {
  const plan = f.plan(); writeLocalIngest(plan, f.output); const path = join(f.output, "manifest-v2.json");
  const changed = structuredClone(plan.manifest); changed.assets[0].sourcePath = "different.glb"; writeFileSync(path, JSON.stringify(changed));
  assert.throws(() => checkLocalIngest(plan, f.output), /sourcePath/u);
  rmSync(path); symlinkSync(join(f.root, "unread-secret.json"), path); assert.throws(() => checkLocalIngest(plan, f.output), /manifest symlink/u);
}));
