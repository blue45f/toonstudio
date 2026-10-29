import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import nodeTest from "node:test";
import { test as vitestTest } from "vitest";

import { buildAppendLocalIngestPlan, DEFAULT_ADDITIONS, runAppendLocalIngestCli, validateAdditionsRecipe, writeAppendLocalIngest } from "./append-creator-bundle-local-ingest.mjs";
import { DEFAULT_CONFIG } from "./rebuild-creator-bundle-local-ingest.mjs";
import { loadPackRightsLedger } from "./lib/creator-bundle-pack-rights.mjs";
import { selfContainedGlb } from "./lib/creator-bundle-pack-rights-test-support.mjs";

const test = process.env.VITEST ? vitestTest : nodeTest;
const sha = (body) => createHash("sha256").update(body).digest("hex");
const BASE = {
  catalogId: "cbv1-008-cute-park-pack",
  ingestId: "cbv1-ingest-local-cute-park",
  librarySource: "01-city/cute-park-pack/models/mixed/gLTF",
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "creator-ingest-append-test-"));
  const libraryRoot = join(root, "library"), existingRoot = join(root, "existing"), output = join(root, "next");
  const recipe = JSON.parse(readFileSync(DEFAULT_ADDITIONS, "utf8"));
  const oldBody = selfContainedGlb("existing-park"), sourcePath = "Bench.glb", oldPath = BASE.ingestId + "/native/" + sourcePath;
  const primary = { kind: "primary", path: oldPath, bytes: oldBody.length, sha256: sha(oldBody) };
  const oldAsset = { id: BASE.ingestId + "-original-id", packId: BASE.ingestId, role: "runtime", format: "glb", sourcePath, files: [primary] };
  const projectionBytes = Buffer.from(JSON.stringify({
    inServiceOnly: true, downloadable: false, budgetProfile: "mobile",
    packs: [{ catalogIds: [BASE.catalogId], ingestPackIds: [BASE.ingestId] }],
    assets: [{ id: oldAsset.id, pack: 0, path: oldPath, bytes: oldBody.length, sha256: primary.sha256, tris: 0 }],
  }));
  const original = { kind: "toonstudio.asset-bundle.v2", version: 2, inServiceOnly: true, downloadable: false, generatedAt: "2026-10-28T14:13:13.555666+00:00", totals: { assets: 1 }, assets: [oldAsset] };
  for (const path of [join(existingRoot, oldPath), join(libraryRoot, BASE.librarySource, sourcePath)]) {
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, oldBody);
  }
  writeFileSync(join(existingRoot, "manifest-v2.json"), JSON.stringify(original));
  const added = recipe.packs.map((pack, index) => {
    pack.recordedFiles = 1;
    const path = join(libraryRoot, pack.librarySource, pack.representativeSource);
    const body = selfContainedGlb("addition-" + index);
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body);
    return { path, body, pack };
  });
  const baseConfig = {
    schema: "toonstudio.creator-bundle-local-ingest.v1", projection: "fixtures/projection.json", projectionSha256: sha(projectionBytes),
    snapshotGeneratedAt: original.generatedAt, copyPolicy: "copy-only-no-hardlinks", expected: { files: 1, bytes: oldBody.length },
    packs: [{ ...BASE, files: 1, bytes: oldBody.length }],
  };
  const inputs = { existingRoot, libraryRoot, recipe, baseConfig, projectionBytes, ledger: structuredClone(loadPackRightsLedger()), generatedAt: "2026-10-29T01:00:00.000Z" };
  return { root, existingRoot, libraryRoot, output, inputs, original, oldBody, oldPath, added, plan: () => buildAppendLocalIngestPlan(inputs) };
}
function inFixture(run) { const f = fixture(); try { run(f); } finally { rmSync(f.root, { recursive: true, force: true }); } }

test("추가 recipe의 두 팩 관찰값과 현재 10팩 정본을 대조하고 역사 8팩을 보존한다", () => {
  const recipe = JSON.parse(readFileSync(DEFAULT_ADDITIONS, "utf8")), base = JSON.parse(readFileSync(DEFAULT_CONFIG, "utf8"));
  validateAdditionsRecipe(recipe);
  assert.equal(recipe.status, "pending-intake-validation");
  assert.deepEqual(recipe.packs.map((pack) => [pack.catalogId, pack.ingestId, pack.recordedFiles]), [
    ["cbv1-012-cemetery-statues", "cbv1-ingest-local-cemetery-statues", 50],
    ["cbv1-077-small-props-pack", "cbv1-ingest-local-small-props-pack", 115],
  ]);
  assert.equal(base.packs.length, 10);
  assert.equal(base.expected.files, 1929);
  assert.deepEqual(base.packs.slice(0, 8).map((pack) => [pack.catalogId, pack.ingestId, pack.librarySource, pack.files, pack.bytes]), [
    ["cbv1-008-cute-park-pack", "cbv1-ingest-local-cute-park", "01-city/cute-park-pack/models/mixed/gLTF", 103, 94403244],
    ["cbv1-024-cute-dungeon-megapack", "cbv1-ingest-local-cute-dungeon", "02-medieval-fantasy/cute-dungeon-megapack/models/mixed/gLTF", 320, 196787736],
    ["cbv1-014-cute-graveyard", "cbv1-ingest-local-cute-graveyard", "05-horror-gothic/cute-graveyard/models/mixed/gLTF", 253, 142555424],
    ["cbv1-076-medieval-weapons", "cbv1-ingest-local-medieval-weapons", "02-medieval-fantasy/free-medieval-weapons-small-low-poly-pack/models/mixed/gLTF", 32, 18906768],
    ["cbv1-053-scifi-arena-blue-base", "cbv1-ingest-local-scifi-blue-base", "06-scifi/sci-fi-arena-blue-base/models/mixed/gLTF", 114, 81671064],
    ["cbv1-081-cartoon-car-megapack", "cbv1-ingest-local-cartoon-car-megapack", "20-vehicles/cartoon-car-megapack/models/mixed/gLTF", 180, 302323400],
    ["cbv1-017-cartoon-cars-2", "cbv1-ingest-local-cartoon-cars-2", "20-vehicles/cartoon-cars-2/models/mixed/Gltf", 453, 863451444],
    ["cbv1-018-army-pack", "cbv1-ingest-local-army-pack", "30-props/army-pack/models/mixed/gLTF", 309, 193324500],
  ]);
  assert.deepEqual(base.packs.slice(8).map((pack) => [pack.catalogId, pack.ingestId, pack.librarySource, pack.files]), [
    ["cbv1-012-cemetery-statues", "cbv1-ingest-local-cemetery-statues", "05-horror-gothic/cemetery-statues/models/glb", 50],
    ["cbv1-077-small-props-pack", "cbv1-ingest-local-small-props-pack", "02-medieval-fantasy/free-medieval-props-small-pack-low-poly/models/mixed/gLTF/Props", 115],
  ]);
  assert.equal(base.packs.reduce((sum, pack) => sum + pack.files, 0), base.expected.files);
  assert.equal(base.packs.reduce((sum, pack) => sum + pack.bytes, 0), base.expected.bytes);
  const projectionBytes = readFileSync(join(dirname(DEFAULT_CONFIG), "..", base.projection));
  assert.equal(sha(projectionBytes), base.projectionSha256);
  const projection = JSON.parse(projectionBytes);
  assert.equal(projection.assets.length, base.expected.files);
  assert.equal(projection.assets.reduce((sum, asset) => sum + asset.bytes, 0), base.expected.bytes);
  for (const [index, planned] of recipe.packs.entries()) {
    const actual = base.packs[index + 8];
    assert.equal(actual.catalogId, planned.catalogId);
    assert.equal(actual.ingestId, planned.ingestId);
    assert.equal(actual.librarySource, planned.librarySource);
    assert.equal(actual.files, planned.recordedFiles);
    const assets = projection.assets.filter((asset) => asset.path.startsWith(actual.ingestId + "/native/"));
    assert.equal(assets.length, actual.files);
    assert.equal(assets.reduce((sum, asset) => sum + asset.bytes, 0), actual.bytes);
    for (const asset of assets) {
      assert.ok(asset.id.startsWith(actual.ingestId + "-"));
      assert.ok(projection.packs[asset.pack].catalogIds.includes(actual.catalogId));
      assert.ok(projection.packs[asset.pack].ingestPackIds.includes(actual.ingestId));
    }
  }
  assert.equal(recipe.rawModelsPublished, false);
  assert(!JSON.stringify(recipe).includes("/Users/"));
  for (const pack of recipe.packs) {
    assert.equal(Object.hasOwn(pack, "bytes"), false);
    assert.equal(Object.hasOwn(pack, "sha256"), false);
  }
  const wrong = structuredClone(recipe); wrong.packs[0].bytes = 123;
  assert.throws(() => validateAdditionsRecipe(wrong), /필드/u);
});

test("명시 실행 모드·새 출력 루트가 없거나 인자가 겹치면 파일 읽기 전에 거부한다", () => {
  assert.throws(() => runAppendLocalIngestCli(["--dry-run", "--dry-run"]), /중복/u);
  assert.throws(() => runAppendLocalIngestCli(["--publish"]), /알 수 없/u);
  assert.throws(() => runAppendLocalIngestCli(["--existing-root", "unused", "--library-root", "unused", "--output-root", "unused", "--dry-run", "--write"]), /하나/u);
  assert.throws(() => runAppendLocalIngestCli(["--existing-root", "unused", "--library-root", "unused", "--output-root", "unused"]), /하나/u);
});

test("계획은 파일을 쓰지 않으며 원본 descriptor와 licensed 권리 정체성을 보존한다", () => inFixture((f) => {
  const before = readFileSync(join(f.existingRoot, "manifest-v2.json"));
  const plan = f.plan(), again = f.plan();
  assert.equal(existsSync(f.output), false);
  assert.deepEqual(plan.manifest.assets[0], f.original.assets[0]);
  assert.equal(plan.manifest.assets.length, 3);
  assert.deepEqual(plan.manifest, again.manifest);
  assert.deepEqual(readFileSync(join(f.existingRoot, "manifest-v2.json")), before);
  for (const item of plan.origins.addedPackRights) {
    assert.equal(item.rights.status, "licensed");
    assert.equal(item.rights.licenseName, "구매 번들 ToonStudio 상업적 프로젝트 사용 (소유자 확인)");
    assert.equal(item.rights.commercialUse, true);
  }
  assert.equal(plan.summary.baseFiles, 1);
  assert.equal(plan.summary.addedFiles, 2);
  assert(!JSON.stringify(plan.origins).includes(f.root));
}));

test("새 private envelope/input만 게시하며 기존 파일·원본 해시·inode를 보존한다", () => inFixture((f) => {
  const plan = f.plan(), before = readFileSync(join(f.existingRoot, "manifest-v2.json"));
  writeAppendLocalIngest(plan, f.output);
  const input = join(f.output, "input"), actual = JSON.parse(readFileSync(join(input, "manifest-v2.json"), "utf8"));
  assert.deepEqual(actual.assets[0], f.original.assets[0]);
  assert.deepEqual(actual, plan.manifest);
  assert.deepEqual(readFileSync(join(input, f.oldPath)), f.oldBody);
  assert.deepEqual(readFileSync(join(f.existingRoot, "manifest-v2.json")), before);
  for (const record of plan.records) {
    assert.equal(sha(readFileSync(join(input, record.path))), record.sha256);
    assert.notEqual(statSync(join(input, record.path)).ino, statSync(record.sourceReal).ino);
  }
  assert.deepEqual(readdirSync(f.output), ["input"]);
  assert.throws(() => writeAppendLocalIngest(plan, f.output), /덮어쓰지/u);
}));

test("기존 descriptor·원본 라이브러리 또는 실제 수가 달라지면 출력을 만들지 않는다", () => inFixture((f) => {
  const manifestPath = join(f.existingRoot, "manifest-v2.json"), original = readFileSync(manifestPath);
  const changed = structuredClone(f.original); changed.assets[0].sourcePath = "Elsewhere.glb";
  writeFileSync(manifestPath, JSON.stringify(changed)); assert.throws(f.plan, /descriptor/u);
  writeFileSync(manifestPath, original);
  const libraryBase = join(f.libraryRoot, BASE.librarySource, "Bench.glb");
  writeFileSync(libraryBase, "changed"); assert.throws(f.plan, /SHA-256/u);
  writeFileSync(libraryBase, f.oldBody);
  f.inputs.recipe.packs[0].recordedFiles = 2; assert.throws(f.plan, /실제 GLB 수/u);
  assert.equal(existsSync(f.output), false);
}));

test("동일 prefix의 기존 ID 변경도 정본 projection 대조에서 거부한다", () => inFixture((f) => {
  const manifest = structuredClone(f.original);
  manifest.assets[0].id = BASE.ingestId + "-changed-id";
  writeFileSync(join(f.existingRoot, "manifest-v2.json"), JSON.stringify(manifest));
  assert.throws(f.plan, /descriptor·ID/u);
  const valid = readFileSync(join(f.existingRoot, f.oldPath));
  assert.deepEqual(valid, f.oldBody);
  assert.equal(existsSync(f.output), false);
}));

test("복사 원본인 기존 private GLB가 그대로여도 구매 library의 기존 원본 변경은 거부한다", () => inFixture((f) => {
  const plan = f.plan();
  writeFileSync(join(f.libraryRoot, BASE.librarySource, "Bench.glb"), "changed canonical source");
  assert.throws(() => writeAppendLocalIngest(plan, f.output), /SHA-256/u);
  assert.equal(existsSync(f.output), false);
  assert.deepEqual(readFileSync(join(f.existingRoot, f.oldPath)), f.oldBody);
}));

test("소유팩의 중간 디렉터리를 다른 팩으로 바꾼 symlink도 거부한다", () => inFixture((f) => {
  const pack = f.inputs.recipe.packs[0], segments = pack.librarySource.split("/");
  const owned = join(f.libraryRoot, segments[0], segments[1]), substitute = join(f.libraryRoot, "other-owner");
  mkdirSync(substitute);
  rmSync(owned, { recursive: true }); symlinkSync(substitute, owned, "dir");
  assert.throws(f.plan, /중간 symlink/u);
  assert.equal(existsSync(f.output), false);
}));

test("현재 hold·다른 owner 폴더·기존 팩 충돌·traversal은 GLB 복사 전에 거부한다", () => inFixture((f) => {
  const pack = f.inputs.recipe.packs[0], source = pack.librarySource;
  pack.librarySource = f.inputs.recipe.packs[1].librarySource;
  assert.throws(f.plan, /중복|소유권/u); pack.librarySource = source;
  pack.librarySource = "../outside"; assert.throws(f.plan, /상대 경로/u); pack.librarySource = source;
  const originalIngest = pack.ingestId; pack.ingestId = BASE.ingestId;
  assert.throws(f.plan, /충돌/u); pack.ingestId = originalIngest;
  const entry = f.inputs.ledger.packs.find((candidate) => candidate.id === pack.catalogId);
  entry.serve = "hold"; entry.holdReason = "evidence-incomplete"; entry.holdLabel = "준비 중이며 공개 시점은 정해지지 않았다.";
  assert.throws(f.plan, /권리 게이트/u);
  assert.equal(existsSync(f.output), false);
}));

test("원본 트리 symlink 탈출과 외부 이미지 GLB는 기존 모바일 게이트로 닫힌다", () => inFixture((f) => {
  const added = f.added[0], outside = join(f.root, "outside.glb");
  writeFileSync(outside, added.body); rmSync(added.path); symlinkSync(outside, added.path);
  assert.throws(f.plan, /symlink/u); rmSync(added.path);
  const jsonLength = added.body.readUInt32LE(12), json = JSON.parse(added.body.subarray(20, 20 + jsonLength).toString("utf8"));
  json.images[0].uri = "../outside.png";
  let chunk = Buffer.from(JSON.stringify(json)); chunk = Buffer.concat([chunk, Buffer.alloc((4 - chunk.length % 4) % 4, 32)]);
  const body = Buffer.alloc(20 + chunk.length);
  body.writeUInt32LE(0x46546c67, 0); body.writeUInt32LE(2, 4); body.writeUInt32LE(body.length, 8);
  body.writeUInt32LE(chunk.length, 12); body.writeUInt32LE(0x4e4f534a, 16); chunk.copy(body, 20);
  writeFileSync(added.path, body);
  assert.throws(f.plan, /GLB 모바일/u);
  assert.equal(existsSync(f.output), false);
}));

test("계획 뒤 원장·기존 manifest 변경과 복사 중 원본 변경은 실패하고 기존 자료를 보존한다", () => inFixture((f) => {
  const plan = f.plan(), original = readFileSync(join(f.existingRoot, "manifest-v2.json"));
  const entry = plan.ledger.packs.find((candidate) => candidate.id === f.inputs.recipe.packs[0].catalogId);
  entry.grant.commercialUse = false; assert.throws(() => writeAppendLocalIngest(plan, f.output), /권리/u);
  entry.grant.commercialUse = true;
  writeFileSync(join(f.existingRoot, "manifest-v2.json"), "{}"); assert.throws(() => writeAppendLocalIngest(plan, f.output), /manifest/u);
  writeFileSync(join(f.existingRoot, "manifest-v2.json"), original);
  assert.throws(() => writeAppendLocalIngest(plan, f.output, { copyFile: (source, destination, flags) => {
    copyFileSync(source, destination, flags); writeFileSync(f.added[0].path, "changed after plan");
  } }), /SHA-256/u);
  assert.equal(existsSync(f.output), false);
  assert.deepEqual(readFileSync(join(f.existingRoot, "manifest-v2.json")), original);
  assert.deepEqual(readFileSync(join(f.existingRoot, f.oldPath)), f.oldBody);
}));

test("부분 복사·최종 rename 실패는 새 staging만 정리하고 기존 입력은 바꾸지 않는다", () => inFixture((f) => {
  const plan = f.plan(), before = readFileSync(join(f.existingRoot, "manifest-v2.json"));
  assert.throws(() => writeAppendLocalIngest(plan, f.output, { copyFile: (source, destination, flags) => {
    copyFileSync(source, destination, flags); throw new Error("copy failure");
  } }), /copy failure/u);
  assert.equal(existsSync(f.output), false);
  assert.throws(() => writeAppendLocalIngest(plan, f.output, { rename: () => { throw new Error("rename failure"); } }), /rename failure/u);
  assert.equal(existsSync(f.output), false);
  assert.deepEqual(readFileSync(join(f.existingRoot, "manifest-v2.json")), before);
}));

test("복사 중 다른 자료가 새 출력에 생기면 덮어쓰거나 cleanup으로 지우지 않는다", () => inFixture((f) => {
  const plan = f.plan();
  let first = true;
  assert.throws(() => writeAppendLocalIngest(plan, f.output, { copyFile: (source, destination, flags) => {
    copyFileSync(source, destination, flags);
    if (first) { first = false; mkdirSync(join(f.output, "input")); writeFileSync(join(f.output, "input", "other.txt"), "preserve"); }
  } }), /예약한 출력/u);
  assert.equal(readFileSync(join(f.output, "input", "other.txt"), "utf8"), "preserve");
  assert.deepEqual(readdirSync(f.output), ["input"]);
  assert.deepEqual(readFileSync(join(f.existingRoot, f.oldPath)), f.oldBody);
}));

test("기존 입력·라이브러리·public 안 출력은 쓰기 시작 전에 거부한다", () => inFixture((f) => {
  const plan = f.plan(), publicRoot = join(f.root, "public"); mkdirSync(publicRoot);
  for (const output of [join(f.existingRoot, "new"), join(f.libraryRoot, "new"), join(publicRoot, "new")]) {
    assert.throws(() => writeAppendLocalIngest(plan, output), /공개 경로/u);
    assert.equal(existsSync(output), false);
  }
}));

test("계획 뒤 같은 팩 안의 동일 바이트를 가리키는 원본 symlink도 거부한다", () => inFixture((f) => {
  const plan = f.plan(), added = f.added[0], alias = join(dirname(added.path), "Other.glb");
  copyFileSync(added.path, alias); rmSync(added.path); symlinkSync(alias, added.path);
  assert.throws(() => writeAppendLocalIngest(plan, f.output), /symlink/u);
  assert.equal(existsSync(f.output), false);
  assert.deepEqual(readFileSync(join(f.existingRoot, f.oldPath)), f.oldBody);
}));

test("계획 뒤 기존 manifest를 같은 본문의 symlink로 바꾸어도 거부한다", () => inFixture((f) => {
  const plan = f.plan(), path = join(f.existingRoot, "manifest-v2.json"), copy = join(f.root, "manifest-copy.json");
  copyFileSync(path, copy); rmSync(path); symlinkSync(copy, path);
  assert.throws(() => writeAppendLocalIngest(plan, f.output), /symlink/u);
  assert.equal(existsSync(f.output), false);
  assert.deepEqual(readFileSync(join(f.existingRoot, f.oldPath)), f.oldBody);
}));

test("나중 복사에서 앞서 복사한 staging GLB가 변조돼도 최종 게시하지 않는다", () => inFixture((f) => {
  const plan = f.plan();
  let first;
  assert.throws(() => writeAppendLocalIngest(plan, f.output, { copyFile: (source, destination, flags) => {
    copyFileSync(source, destination, flags);
    if (!first) first = destination;
    else writeFileSync(first, "changed earlier staging body");
  } }), /SHA-256/u);
  assert.equal(existsSync(f.output), false);
  assert.deepEqual(readFileSync(join(f.existingRoot, f.oldPath)), f.oldBody);
}));

test("staging의 manifest 밖 파일은 새 입력에 섞어 게시하지 않는다", () => inFixture((f) => {
  const plan = f.plan();
  let inserted = false;
  assert.throws(() => writeAppendLocalIngest(plan, f.output, { copyFile: (source, destination, flags) => {
    copyFileSync(source, destination, flags);
    if (!inserted) {
      inserted = true;
      const stage = join(f.output, readdirSync(f.output).find((name) => name.startsWith(".staging-")));
      writeFileSync(join(stage, "unrecorded.txt"), "not an admitted input");
    }
  } }), /알 수 없는 staging 파일/u);
  assert.equal(existsSync(f.output), false);
  assert.deepEqual(readFileSync(join(f.existingRoot, f.oldPath)), f.oldBody);
}));

test("staging metadata 경로에 끼운 symlink로 원본 파일을 덮어쓰지 않는다", () => inFixture((f) => {
  const plan = f.plan();
  let inserted = false;
  assert.throws(() => writeAppendLocalIngest(plan, f.output, { copyFile: (source, destination, flags) => {
    copyFileSync(source, destination, flags);
    if (!inserted) {
      inserted = true;
      const stage = join(f.output, readdirSync(f.output).find((name) => name.startsWith(".staging-")));
      symlinkSync(f.added[0].path, join(stage, "manifest-v2.json"));
    }
  } }), /EEXIST/u);
  assert.deepEqual(readFileSync(f.added[0].path), f.added[0].body);
  assert.deepEqual(readFileSync(join(f.existingRoot, f.oldPath)), f.oldBody);
  assert.equal(existsSync(f.output), false);
}));
