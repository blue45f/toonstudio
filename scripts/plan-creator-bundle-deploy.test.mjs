import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import nodeTest from "node:test";
import { fileURLToPath } from "node:url";
import { test as vitestTest } from "vitest";

import { CATALOG_PACKS } from "./generate-creator-bundle-theme-packs.mjs";
import {
  findPackRights,
  loadPackRightsLedger,
  packRightsProjection,
} from "./lib/creator-bundle-pack-rights.mjs";
import {
  fixtureLedger,
  ledgerEntry,
  makeGlb,
  selfContainedGlb,
} from "./lib/creator-bundle-pack-rights-test-support.mjs";
import {
  assessPlanForMode,
  BUNDLE_V2_INDEX_KEY,
  bundleV2ObjectKey,
  bundleV2PublicPath,
  createBundleV2DeployPlan,
  glbHasExternalResourceUri,
} from "./plan-creator-bundle-deploy.mjs";

// 루트 `vitest run`(scripts/**/*.test.mjs 수집)과 `node --test` 양쪽에서 같은 파일이 돈다.
const test = process.env.VITEST ? vitestTest : nodeTest;

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "plan-creator-bundle-deploy.mjs");
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const sha256Of = (buffer) => createHash("sha256").update(buffer).digest("hex");

const SELF_CONTAINED = selfContainedGlb("allow-a");
const EXTERNAL = makeGlb({
  asset: { version: "2.0" },
  buffers: [{ byteLength: 0 }],
  images: [{ uri: "../Textures/atlas.png" }],
});

// 생성기가 내는 theme-packs 팩과 같은 모양: 카탈로그 번호·제목·제작사·인제스션 폴더(ingestPackIds).
const ALLOWED_PACK = {
  catalogIds: ["cbv1-901-fixture-allowed"], title: "Allowed Pack", creator: "RG Poly", ingestPackIds: ["allowed"],
};
const HELD_PACK = {
  catalogIds: ["cbv1-902-fixture-held"], title: "Held Pack", creator: "RG Poly", ingestPackIds: ["held"],
};
const UNLISTED_PACK = {
  catalogIds: ["cbv1-903-fixture-unlisted"], title: "Unlisted Pack", creator: "RG Poly", ingestPackIds: ["unlisted"],
};

// 플래너는 theme-packs 팩의 ingestPackIds를 생성기 팩 정의(CATALOG_PACKS)와 대조한다. API 테스트는 픽스처 정의를 주입한다.
const FIXTURE_DEFS = [ALLOWED_PACK, HELD_PACK, UNLISTED_PACK].map((pack) => ({
  catalogIds: pack.catalogIds, title: pack.title, creator: pack.creator, ingest: pack.ingestPackIds,
}));
const planFor = (args) => createBundleV2DeployPlan({ packDefs: FIXTURE_DEFS, ...args });

// CLI는 생성기의 실제 팩 정의를 쓰므로 CLI 테스트는 실제 팩(Pirate Island·Old Town)으로 픽스처를 만든다.
function realPack(title) {
  const def = CATALOG_PACKS.find((candidate) => candidate.title === title);
  assert.ok(def, `생성기 정의에 ${title}가 없습니다.`);
  return { catalogIds: def.catalogIds, title: def.title, creator: def.creator, ingestPackIds: def.ingest };
}
const REAL_ALLOWED = realPack("Pirate Island");
const REAL_HELD = realPack("Old Town — Courtyards");

function ledgerWithAllowedAndHeld() {
  return fixtureLedger([
    ledgerEntry({ ...ALLOWED_PACK, serve: "allow" }),
    ledgerEntry({ ...HELD_PACK, serve: "hold" }),
  ]);
}

function writeTree(root, files) {
  for (const [rel, buffer] of Object.entries(files)) {
    const target = join(root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, buffer);
  }
}

/**
 * 생성기가 만든 것처럼, 원장이 allow한 팩에는 원장 투영과 같은 권리 블록을 싣는다.
 * 원장 이전 스냅샷을 흉내 내려면 팩에서 rights를 지운다.
 */
function generatedPack(pack, ledger) {
  const entry = findPackRights(ledger, pack);
  return entry?.serve === "allow" ? { ...pack, rights: packRightsProjection(entry) } : { ...pack };
}

function themePacksFor(assets, packs = [ALLOWED_PACK, HELD_PACK], ledger = ledgerWithAllowedAndHeld()) {
  return {
    schema: "toonstudio.bg3d-bundle-theme-packs.v1",
    version: 1,
    inServiceOnly: true,
    downloadable: false,
    assetRoot: "/assets/studio/bundle-v2/",
    sourceManifest: { generatedAt: "2026-10-21T05:14:22.108Z" },
    totals: { packs: packs.length, placeableAssets: assets.length, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 },
    packs: packs.map((pack) => generatedPack(pack, ledger)),
    assets,
  };
}

function assetEntry(id, pack, path, buffer) {
  return { id, pack, path, bytes: buffer.length, sha256: sha256Of(buffer), tris: 12 };
}

function withTempRoot(run) {
  const root = mkdtempSync(join(tmpdir(), "bundle-v2-plan-test-"));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("R2 키와 공개 경로는 sha256 불투명 키다 (원본 폴더·파일명이 들어가지 않는다)", () => {
  const sha = "ab".repeat(32);
  assert.equal(bundleV2ObjectKey(sha), `assets/studio/bundle-v2/${sha}.glb`);
  assert.equal(bundleV2PublicPath(sha), `/assets/studio/bundle-v2/${sha}.glb`);
  // 경로 문자나 대문자 hex로는 키를 만들 수 없다 — 원본 경로가 키로 새어 들어오지 못한다.
  assert.throws(() => bundleV2ObjectKey("pack-a/native/Some Folder/Model+A&B.glb"), TypeError);
  assert.throws(() => bundleV2ObjectKey("AB".repeat(32)), TypeError);
  assert.throws(() => bundleV2ObjectKey(`${sha}/../x`), TypeError);
});

test("외부 uri 판정은 검증기와 같이 uri 속성 존재로 결정한다", () => {
  assert.equal(glbHasExternalResourceUri(SELF_CONTAINED), false);
  assert.equal(glbHasExternalResourceUri(EXTERNAL), true);
  assert.equal(glbHasExternalResourceUri(Buffer.alloc(4)), null);
});

test("계획은 GLB 전수 대조를 통과하면 sha256 키 객체와 인덱스를 마지막 객체로 산출한다", () => {
  withTempRoot((root) => {
    const rel = "allowed/native/Some Folder/Model+A&B.glb";
    writeTree(root, { [rel]: SELF_CONTAINED });
    const themePacks = themePacksFor([assetEntry("cbv1-ingest-001-m001", 0, rel, SELF_CONTAINED)]);
    const { plan, errors } = planFor({
      themePacks, assetRoot: root, ledger: ledgerWithAllowedAndHeld(),
    });
    assert.deepEqual(errors, []);
    assert.equal(plan.keyScheme, "sha256");
    assert.equal(plan.totals.glbObjects, 1);
    assert.equal(plan.totals.glbAssets, 1);
    assert.equal(plan.totals.objects, 2);
    assert.equal(plan.totals.glbBytes, SELF_CONTAINED.length);
    assert.deepEqual(plan.excludedByRights, []);
    const [glb, index] = plan.objects;
    const sha = sha256Of(SELF_CONTAINED);
    assert.equal(glb.key, `assets/studio/bundle-v2/${sha}.glb`);
    assert.equal(glb.publicPath, `/assets/studio/bundle-v2/${sha}.glb`);
    assert.equal(glb.source, rel);
    assert.ok(!glb.key.includes("Some Folder") && !glb.publicPath.includes("Model"));
    assert.equal(glb.contentType, "model/gltf-binary");
    assert.deepEqual(glb.assetIds, ["cbv1-ingest-001-m001"]);
    assert.equal(index.key, BUNDLE_V2_INDEX_KEY);
    const indexBody = JSON.parse(index.inlineBody);
    assert.equal(indexBody.files, 1);
    assert.equal(indexBody.bytes, SELF_CONTAINED.length);
    assert.equal(indexBody.objects, 1);
    assert.equal(indexBody.keyScheme, "sha256");
    assert.equal(indexBody.packs, 1);
  });
});

test("hold 팩의 에셋은 실물을 읽지 않고 제외하며, 인덱스 합계는 허용된 에셋만 센다", () => {
  withTempRoot((root) => {
    const allowedRel = "allowed/a.glb";
    // hold 팩 에셋의 실물은 일부러 만들지 않는다 — 게이트가 읽으려 들면 '실물 파일이 없습니다'로 실패한다.
    const heldGlb = selfContainedGlb("held");
    const heldGlb2 = selfContainedGlb("held-2");
    writeTree(root, { [allowedRel]: SELF_CONTAINED });
    const themePacks = themePacksFor([
      assetEntry("allowed-m001", 0, allowedRel, SELF_CONTAINED),
      assetEntry("held-m001", 1, "held/h1.glb", heldGlb),
      assetEntry("held-m002", 1, "held/h2.glb", heldGlb2),
    ]);
    const { plan, errors } = planFor({
      themePacks, assetRoot: root, ledger: ledgerWithAllowedAndHeld(),
    });
    assert.deepEqual(errors, []);
    assert.equal(plan.totals.glbObjects, 1);
    assert.equal(plan.totals.excludedAssets, 2);
    assert.equal(plan.excludedByRights.length, 1);
    assert.equal(plan.excludedByRights[0].title, "Held Pack");
    assert.equal(plan.excludedByRights[0].reason, "hold");
    assert.equal(plan.excludedByRights[0].assets, 2);
    assert.equal(plan.excludedByRights[0].bytes, heldGlb.length + heldGlb2.length);
    const keys = plan.objects.map((object) => object.key);
    assert.ok(!keys.includes(bundleV2ObjectKey(sha256Of(heldGlb))));
    const index = JSON.parse(plan.objects.at(-1).inlineBody);
    assert.equal(index.files, 1);
    assert.equal(index.bytes, SELF_CONTAINED.length);
    assert.equal(index.packs, 1);
    // theme-packs가 원장보다 오래됐음(제외 에셋 존재)을 모드 판정이 알려 준다.
    assert.deepEqual(assessPlanForMode(plan, "dry-run"), { stale: true, refusal: null });
    assert.match(assessPlanForMode(plan, "production").refusal, /--production 거부/);
    assert.equal(assessPlanForMode(plan, "write").refusal, null);
  });
});

test("원장에 없는 팩의 에셋도 제외한다 (미등록은 hold와 같다)", () => {
  withTempRoot((root) => {
    const themePacks = themePacksFor(
      [assetEntry("unlisted-m001", 0, "unlisted/u.glb", SELF_CONTAINED)],
      [UNLISTED_PACK],
    );
    const { plan, errors } = planFor({
      themePacks, assetRoot: root, ledger: ledgerWithAllowedAndHeld(),
    });
    assert.deepEqual(errors, []);
    assert.equal(plan.totals.glbObjects, 0);
    assert.equal(plan.excludedByRights[0].reason, "missing-entry");
    assert.match(assessPlanForMode(plan, "write").refusal, /배포할 GLB가 없습니다/);
    assert.equal(assessPlanForMode(plan, "dry-run").refusal, null);
  });
});

test("원장이 없거나 잘못됐으면 어떤 객체도 만들지 않는다 (fail-closed)", () => {
  withTempRoot((root) => {
    const rel = "allowed/a.glb";
    writeTree(root, { [rel]: SELF_CONTAINED });
    const themePacks = themePacksFor([assetEntry("allowed-m001", 0, rel, SELF_CONTAINED)]);
    const missing = planFor({ themePacks, assetRoot: root });
    assert.equal(missing.plan, null);
    assert.match(missing.errors[0], /권리 원장이 없어/);

    // 증빙 없이 allow로 바꾼 원장은 검증에서 걸려 계획 자체를 거부한다.
    const unproven = fixtureLedger([
      ledgerEntry({ ...ALLOWED_PACK, serve: "allow", evidence: [] }),
    ]);
    const rejected = planFor({ themePacks, assetRoot: root, ledger: unproven });
    assert.equal(rejected.plan, null);
    assert.match(rejected.errors[0], /권리 원장이 올바르지 않습니다/);

    const secondaryOnly = fixtureLedger([
      ledgerEntry({
        ...ALLOWED_PACK,
        serve: "allow",
        evidence: [{ kind: "secondary-lookup", claim: "itch CC0 표기", source: "report" }],
      }),
    ]);
    assert.equal(planFor({ themePacks, assetRoot: root, ledger: secondaryOnly }).plan, null);

    // pending 묶음은 allow할 수 없고, 그런 원장은 계획 단계에서 통째로 거부된다.
    const pendingAllow = fixtureLedger([ledgerEntry({ ...ALLOWED_PACK, group: "pending", serve: "allow" })]);
    const pending = planFor({ themePacks, assetRoot: root, ledger: pendingAllow });
    assert.equal(pending.plan, null);
    assert.match(pending.errors[0], /pending 묶음 팩은 인제스션/);
  });
});

test("배치 가능 팩(group pack)이 아닌 묶음과 제목·제작사가 다른 팩은 allow여도 계획에 넣지 않는다", () => {
  withTempRoot((root) => {
    const crowdPack = {
      catalogIds: ["cbv1-904-fixture-crowd"], title: "Crowd Pack", creator: "RG Poly", ingestPackIds: ["crowd"],
    };
    const foodPack = { catalogIds: [], title: "Food Pack", creator: "RG Poly", ingestPackIds: ["food"] };
    const ledger = fixtureLedger([
      ledgerEntry({ ...crowdPack, group: "crowd", serve: "allow" }),
      ledgerEntry({ ...foodPack, serve: "allow" }),
    ]);
    // 군중 항목이 placeable packs에 섞여 들어오고, 제목만 같은 다른 제작사 팩이 끼어든 theme-packs.
    const spoof = { ...foodPack, creator: "EmaceArt" };
    writeTree(root, { "food/f.glb": selfContainedGlb("food") }); // 정상 Food Pack의 실물만 있다 (나머지는 읽히면 안 된다).
    const themePacks = {
      ...themePacksFor([
        assetEntry("crowd-m001", 0, "crowd/c.glb", SELF_CONTAINED),
        assetEntry("food-m001", 1, "food/f.glb", selfContainedGlb("food")),
        assetEntry("food-m002", 2, "food/f2.glb", selfContainedGlb("food-2")),
      ], [crowdPack, foodPack, spoof], ledger),
    };
    themePacks.packs[2] = { ...spoof, rights: packRightsProjection(findPackRights(ledger, foodPack)) };
    const packDefs = [crowdPack, foodPack].map((pack) => ({
      catalogIds: pack.catalogIds, title: pack.title, creator: pack.creator, ingest: pack.ingestPackIds,
    }));
    const { plan, errors } = planFor({ themePacks, assetRoot: root, ledger, packDefs });
    assert.deepEqual(errors, []);
    const reasons = Object.fromEntries(plan.excludedByRights.map((record) => [record.title, record.reason]));
    assert.equal(reasons["Crowd Pack"], "group-mismatch");
    assert.equal(reasons["Food Pack"], "identity-mismatch");
    // 같은 제목의 정상 팩(제작사 일치)은 그대로 열린다.
    assert.equal(plan.totals.excludedAssets, 2);
    assert.equal(plan.totals.glbAssets, 1);
  });
});

test("theme-packs의 권리 블록이 원장 투영과 다르거나 없으면 그 팩을 제외하고 --production을 거부한다 (rights-drift)", () => {
  const strict = {
    ...ALLOWED_PACK,
    serve: "allow",
    grant: { status: "licensed", licenseName: "Fixture License", commercialUse: false, attributionRequired: false },
  };
  const ledger = fixtureLedger([ledgerEntry(strict)]);
  const projection = packRightsProjection(findPackRights(ledger, ALLOWED_PACK));
  assert.equal(projection.commercialUse, false);
  const drifted = [
    ["권리 블록이 없는 원장 이전 스냅샷", undefined],
    ["상업 이용을 원장보다 넓게 적음", { ...projection, commercialUse: true }],
    ["status가 다름", { ...projection, status: "public-domain" }],
    ["라이선스 이름이 다름", { ...projection, licenseName: "Another License" }],
    ["출처 표기 요구를 뺌", { ...projection, attributionRequired: true }],
    ["모르는 필드가 섞임", { ...projection, redistributionAllowed: true }],
    ["serve가 hold", { ...projection, serve: "hold" }],
    ["문자열", "allow"],
  ];
  for (const [label, rights] of drifted) {
    withTempRoot((root) => {
      // 실물을 만들지 않는다 — drift는 파일을 읽기 전에 닫혀야 한다 (읽으면 '실물 파일이 없습니다' 오류가 난다).
      const pack = rights === undefined ? { ...ALLOWED_PACK } : { ...ALLOWED_PACK, rights };
      const themePacks = {
        ...themePacksFor([assetEntry("allowed-m001", 0, "allowed/a.glb", SELF_CONTAINED)], [ALLOWED_PACK], ledger),
        packs: [pack],
      };
      const { plan, errors } = planFor({ themePacks, assetRoot: root, ledger });
      assert.deepEqual(errors, [], label);
      assert.equal(plan.totals.glbObjects, 0, label);
      assert.equal(plan.excludedByRights[0].reason, "rights-drift", label);
      assert.match(assessPlanForMode(plan, "production").refusal, /배포할 GLB가 없습니다/, label);
    });
  }
  // 원장 투영과 같은 블록이면 정상적으로 계획에 들어간다.
  withTempRoot((root) => {
    writeTree(root, { "allowed/a.glb": SELF_CONTAINED });
    const themePacks = themePacksFor([assetEntry("allowed-m001", 0, "allowed/a.glb", SELF_CONTAINED)], [ALLOWED_PACK], ledger);
    const { plan, errors } = planFor({ themePacks, assetRoot: root, ledger });
    assert.deepEqual(errors, []);
    assert.equal(plan.totals.glbObjects, 1);
    assert.deepEqual(plan.excludedByRights, []);
  });
});

test("rights-drift 팩이 있으면 다른 팩이 정상이어도 stale로 보고 --production을 거부한다", () => {
  withTempRoot((root) => {
    const ledger = fixtureLedger([
      ledgerEntry({ ...ALLOWED_PACK, serve: "allow" }),
      ledgerEntry({ ...UNLISTED_PACK, serve: "allow", grant: { status: "licensed", licenseName: "Other", commercialUse: false, attributionRequired: false } }),
    ]);
    writeTree(root, { "allowed/a.glb": SELF_CONTAINED });
    const themePacks = themePacksFor([
      assetEntry("allowed-m001", 0, "allowed/a.glb", SELF_CONTAINED),
      assetEntry("unlisted-m001", 1, "unlisted/u.glb", selfContainedGlb("unlisted")),
    ], [ALLOWED_PACK, UNLISTED_PACK], ledger);
    themePacks.packs[1].rights = { ...themePacks.packs[1].rights, commercialUse: true };
    const { plan, errors } = planFor({ themePacks, assetRoot: root, ledger });
    assert.deepEqual(errors, []);
    assert.equal(plan.totals.glbObjects, 1);
    assert.equal(plan.excludedByRights[0].reason, "rights-drift");
    const production = assessPlanForMode(plan, "production");
    assert.equal(production.stale, true);
    assert.match(production.refusal, /--production 거부/);
  });
});

test("에셋 경로는 에셋 루트 상대 경로이고 소속 팩 폴더 아래여야 한다 — 다른 팩 폴더·루트 밖 파일은 허용된 팩의 이름으로 올라가지 못한다", () => {
  withTempRoot((root) => {
    // 다른 팩(held) 폴더에 실제 파일이 있고 sha256·크기도 맞는다 — 경로 검사만이 막는다.
    writeTree(root, { "held/h1.glb": SELF_CONTAINED, "allowed/a.glb": SELF_CONTAINED });
    const ledger = ledgerWithAllowedAndHeld();
    const rejected = [
      ["다른 팩 폴더", "held/h1.glb", /ingestPackIds 폴더 아래가 아닙니다/],
      ["접두사만 같은 폴더", "allowed-evil/a.glb", /ingestPackIds 폴더 아래가 아닙니다/],
      ["상위 경로 탈출", "../outside/secret.glb", /에셋 루트 상대 경로가 아닙니다/],
      ["폴더 안에서 상위로", "allowed/../held/h1.glb", /에셋 루트 상대 경로가 아닙니다/],
      ["절대 경로", "/allowed/a.glb", /에셋 루트 상대 경로가 아닙니다/],
      ["역슬래시", "allowed\\a.glb", /에셋 루트 상대 경로가 아닙니다/],
      ["스킴", "file:allowed/a.glb", /에셋 루트 상대 경로가 아닙니다/],
      ["빈 세그먼트", "allowed//a.glb", /에셋 루트 상대 경로가 아닙니다/],
      ["현재 디렉터리 세그먼트", "allowed/./a.glb", /에셋 루트 상대 경로가 아닙니다/],
      ["빈 경로", "", /경로가 비었거나 너무 깁니다/],
      ["경로 없음", undefined, /경로가 비었거나 너무 깁니다/],
      ["너무 긴 경로", `allowed/${"a".repeat(1100)}.glb`, /경로가 비었거나 너무 깁니다/],
    ];
    for (const [label, path, pattern] of rejected) {
      const themePacks = themePacksFor([{ ...assetEntry("allowed-m001", 0, "allowed/a.glb", SELF_CONTAINED), path }]);
      const { plan, errors } = planFor({ themePacks, assetRoot: root, ledger });
      assert.equal(plan, null, label);
      assert.match(errors[0], /에셋 경로가 올바르지 않습니다/, label);
      assert.match(errors[0], pattern, label);
    }
    // ingestPackIds가 없는 팩은 생성기 정의와 달라 판정 단계에서 닫힌다 (경로 점검까지 가지 않는다).
    const noIngest = { ...ALLOWED_PACK };
    delete noIngest.ingestPackIds;
    const themePacks = themePacksFor([assetEntry("allowed-m001", 0, "allowed/a.glb", SELF_CONTAINED)], [noIngest]);
    const result = planFor({ themePacks, assetRoot: root, ledger });
    assert.deepEqual(result.errors, []);
    assert.equal(result.plan.totals.glbObjects, 0);
    assert.equal(result.plan.excludedByRights[0].reason, "ingest-mismatch");
    // 정상 경로(여러 단계 폴더)는 통과한다.
    const nested = themePacksFor([assetEntry("allowed-m001", 0, "allowed/a.glb", SELF_CONTAINED)]);
    assert.deepEqual(planFor({ themePacks: nested, assetRoot: root, ledger }).errors, []);
  });
});

test("같은 바이트의 에셋은 한 객체로 합치되 인덱스는 에셋 단위로 센다", () => {
  withTempRoot((root) => {
    writeTree(root, { "allowed/a.glb": SELF_CONTAINED, "allowed/copy-of-a.glb": SELF_CONTAINED });
    const themePacks = themePacksFor([
      assetEntry("allowed-m001", 0, "allowed/a.glb", SELF_CONTAINED),
      assetEntry("allowed-m002", 0, "allowed/copy-of-a.glb", SELF_CONTAINED),
    ]);
    const { plan, errors } = planFor({
      themePacks, assetRoot: root, ledger: ledgerWithAllowedAndHeld(),
    });
    assert.deepEqual(errors, []);
    assert.equal(plan.totals.glbObjects, 1);
    assert.equal(plan.totals.glbAssets, 2);
    assert.equal(plan.totals.glbBytes, SELF_CONTAINED.length);
    assert.equal(plan.totals.assetBytes, SELF_CONTAINED.length * 2);
    assert.deepEqual(plan.objects[0].assetIds, ["allowed-m001", "allowed-m002"]);
    const index = JSON.parse(plan.objects.at(-1).inlineBody);
    assert.equal(index.files, 2);
    assert.equal(index.bytes, SELF_CONTAINED.length * 2);
    assert.equal(index.objects, 1);
  });
});

test("외부 uri GLB가 허용된 팩의 배치 가능에 남아 있으면 계획을 거부한다", () => {
  withTempRoot((root) => {
    const rel = "allowed/External.glb";
    writeTree(root, { [rel]: EXTERNAL });
    const themePacks = themePacksFor([assetEntry("allowed-m001", 0, rel, EXTERNAL)]);
    const { plan, errors } = planFor({
      themePacks, assetRoot: root, ledger: ledgerWithAllowedAndHeld(),
    });
    assert.equal(plan, null);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /외부 리소스 uri/);
  });
});

test("실물 누락과 해시 불일치는 각각 오류로 보고한다", () => {
  withTempRoot((root) => {
    const rel = "allowed/a.glb";
    writeTree(root, { [rel]: SELF_CONTAINED });
    const ledger = ledgerWithAllowedAndHeld();
    const good = themePacksFor([assetEntry("allowed-m001", 0, rel, SELF_CONTAINED)]);
    const missing = planFor({ themePacks: good, assetRoot: join(root, "nope"), ledger });
    assert.equal(missing.plan, null);
    assert.match(missing.errors[0], /실물 파일이 없습니다/);
    const wrongHash = themePacksFor([{ ...good.assets[0], sha256: "0".repeat(64) }]);
    const mismatch = planFor({ themePacks: wrongHash, assetRoot: root, ledger });
    assert.equal(mismatch.plan, null);
    assert.match(mismatch.errors[0], /해시 불일치/);
  });
});

test("계획 입력 검증: 형식·루트·서비스 전용 표기·팩 참조·해시 형식·크기·GLB 헤더를 각각 거부한다", () => {
  withTempRoot((root) => {
    const rel = "allowed/a.glb";
    writeTree(root, { [rel]: SELF_CONTAINED, "allowed/garbage.glb": Buffer.from("not a glb at all, but sha and size match") });
    const ledger = ledgerWithAllowedAndHeld();
    const base = () => themePacksFor([assetEntry("allowed-m001", 0, rel, SELF_CONTAINED)]);
    const run = (themePacks) => planFor({ themePacks, assetRoot: root, ledger });
    const expectError = (label, themePacks, pattern) => {
      const { plan, errors } = run(themePacks);
      assert.equal(plan, null, label);
      assert.ok(errors.some((error) => pattern.test(error)), `${label}: ${errors.join(" | ")}`);
    };

    assert.deepEqual(run(base()).errors, [], "기준선");
    expectError("스키마가 다름", { ...base(), schema: "other" }, /theme-packs\.json 형식이 올바르지 않습니다/);
    expectError("assets가 배열이 아님", { ...base(), assets: null }, /theme-packs\.json 형식이 올바르지 않습니다/);
    expectError("assetRoot가 다름", { ...base(), assetRoot: "/assets/other/" }, /assetRoot가 \/assets\/studio\/bundle-v2\/가 아닙니다/);
    expectError("downloadable", { ...base(), downloadable: true }, /서비스 내 사용 전용/);
    expectError("inServiceOnly 아님", { ...base(), inServiceOnly: false }, /서비스 내 사용 전용/);
    expectError("팩 참조 범위 밖", { ...base(), assets: [{ ...base().assets[0], pack: 99 }] }, /에셋의 팩 참조가 올바르지 않습니다/);
    expectError("팩 참조가 문자열", { ...base(), assets: [{ ...base().assets[0], pack: "length" }] }, /에셋의 팩 참조가 올바르지 않습니다/);
    expectError("팩 참조 음수", { ...base(), assets: [{ ...base().assets[0], pack: -1 }] }, /에셋의 팩 참조가 올바르지 않습니다/);
    expectError("sha256 형식", { ...base(), assets: [{ ...base().assets[0], sha256: "zz" }] }, /에셋 sha256이 올바르지 않습니다/);
    expectError("sha256 대문자", { ...base(), assets: [{ ...base().assets[0], sha256: sha256Of(SELF_CONTAINED).toUpperCase() }] }, /에셋 sha256이 올바르지 않습니다/);
    expectError("크기 불일치", { ...base(), assets: [{ ...base().assets[0], bytes: SELF_CONTAINED.length + 1 }] }, /크기 불일치/);
    const garbage = Buffer.from("not a glb at all, but sha and size match");
    expectError(
      "GLB 헤더 없음",
      { ...base(), assets: [assetEntry("allowed-m001", 0, "allowed/garbage.glb", garbage)] },
      /GLB로 읽을 수 없습니다/,
    );
  });
});

test("theme-packs 팩의 ingestPackIds가 생성기 팩 정의와 다르면 allow여도 제외한다 — 손으로 고친 파일이 다른 팩 폴더를 달 수 없다", () => {
  withTempRoot((root) => {
    // 허용된 팩이 hold 팩의 폴더를 자기 폴더로 선언한다. 폴더에는 sha256·크기가 맞는 실물이 있다.
    writeTree(root, { "held/h1.glb": SELF_CONTAINED });
    const ledger = ledgerWithAllowedAndHeld();
    const forged = { ...ALLOWED_PACK, ingestPackIds: ["held"] };
    const themePacks = themePacksFor([assetEntry("allowed-m001", 0, "held/h1.glb", SELF_CONTAINED)], [forged, HELD_PACK], ledger);
    const { plan, errors } = planFor({ themePacks, assetRoot: root, ledger });
    assert.deepEqual(errors, []);
    assert.equal(plan.totals.glbObjects, 0);
    assert.equal(plan.excludedByRights[0].reason, "ingest-mismatch");
    assert.match(assessPlanForMode(plan, "production").refusal, /배포할 GLB가 없습니다/);

    // 폴더를 늘려도(정의에 없는 폴더 추가) 정의와 같지 않으면 제외한다.
    const extended = { ...ALLOWED_PACK, ingestPackIds: [...ALLOWED_PACK.ingestPackIds, "held"] };
    const extendedPacks = themePacksFor([assetEntry("allowed-m001", 0, "held/h1.glb", SELF_CONTAINED)], [extended, HELD_PACK], ledger);
    assert.equal(planFor({ themePacks: extendedPacks, assetRoot: root, ledger }).plan.excludedByRights[0].reason, "ingest-mismatch");

    // 정의에 없는 팩(원장에는 allow)도 제외한다.
    const noDef = planFor({ themePacks, assetRoot: root, ledger, packDefs: [] });
    assert.equal(noDef.plan.excludedByRights[0].reason, "ingest-mismatch");
  });
});

test("심볼릭 링크로 다른 팩 폴더의 파일을 가리키면 sha256이 맞아도 올리지 않는다", () => {
  withTempRoot((root) => {
    writeTree(root, { "held/h1.glb": SELF_CONTAINED, "allowed/real.glb": SELF_CONTAINED });
    symlinkSync(join(root, "held/h1.glb"), join(root, "allowed/link-to-held.glb"));
    symlinkSync(join(root, "held"), join(root, "allowed/dirlink"));
    const ledger = ledgerWithAllowedAndHeld();
    for (const path of ["allowed/link-to-held.glb", "allowed/dirlink/h1.glb"]) {
      const themePacks = themePacksFor([assetEntry("allowed-m001", 0, path, SELF_CONTAINED)]);
      const { plan, errors } = planFor({ themePacks, assetRoot: root, ledger });
      assert.equal(plan, null, path);
      assert.match(errors[0], /에셋 파일이 올바르지 않습니다.*소속 팩 폴더 밖/, path);
    }
    // 같은 팩 폴더 안의 일반 파일은 통과한다.
    const ok = themePacksFor([assetEntry("allowed-m001", 0, "allowed/real.glb", SELF_CONTAINED)]);
    assert.deepEqual(planFor({ themePacks: ok, assetRoot: root, ledger }).errors, []);
  });
});

test("비정상 입력(null 항목·디렉터리 경로·읽기 오류)은 던지지 않고 오류로 보고한다", () => {
  withTempRoot((root) => {
    writeTree(root, { "allowed/a.glb": SELF_CONTAINED });
    mkdirSync(join(root, "allowed/subdir"), { recursive: true });
    const ledger = ledgerWithAllowedAndHeld();
    const base = () => themePacksFor([assetEntry("allowed-m001", 0, "allowed/a.glb", SELF_CONTAINED)]);

    const nullAsset = { ...base(), assets: [null] };
    const asset = planFor({ themePacks: nullAsset, assetRoot: root, ledger });
    assert.equal(asset.plan, null);
    assert.match(asset.errors[0], /에셋 항목이 객체가 아닙니다/);

    // null 팩을 가리키는 에셋은 제외로 기록되고 던지지 않는다.
    const nullPack = { ...base(), packs: [null, HELD_PACK] };
    const pack = planFor({ themePacks: nullPack, assetRoot: root, ledger });
    assert.deepEqual(pack.errors, []);
    assert.equal(pack.plan.excludedByRights[0].reason, "missing-entry");

    const directory = themePacksFor([{ ...assetEntry("allowed-m001", 0, "allowed/subdir", SELF_CONTAINED), path: "allowed/subdir" }]);
    const dir = planFor({ themePacks: directory, assetRoot: root, ledger });
    assert.equal(dir.plan, null);
    assert.match(dir.errors[0], /에셋 파일이 올바르지 않습니다.*일반 파일이 아닙니다/);

    const failing = planFor({
      themePacks: base(), assetRoot: root, ledger, readFile: () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); },
    });
    assert.equal(failing.plan, null);
    assert.match(failing.errors[0], /실물 파일을 읽을 수 없습니다.*EACCES/);
  });
});

test("커밋된 theme-packs.json의 모든 팩은 생성기 팩 정의와 같은 인제스션 폴더를 가진다", () => {
  const themePacks = JSON.parse(readFileSync(
    join(REPO_ROOT, "apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json"),
    "utf8",
  ));
  const defs = new Map(CATALOG_PACKS.map((def) => [def.title, def]));
  for (const pack of themePacks.packs) {
    const def = defs.get(pack.title);
    assert.ok(def, `${pack.title}: 생성기 팩 정의에 없습니다.`);
    assert.deepEqual(pack.ingestPackIds, def.ingest, `${pack.title}: 인제스션 폴더가 생성기 정의와 다릅니다. 생성기를 다시 실행하세요.`);
  }
});

test("커밋된 원장과 커밋된 theme-packs.json으로 계획하면 원장이 열지 않은 팩의 에셋은 실물을 읽지 않고 전부 제외한다", () => {
  const ledger = loadPackRightsLedger();
  const themePacks = JSON.parse(readFileSync(
    join(REPO_ROOT, "apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json"),
    "utf8",
  ));
  // 존재하지 않는 에셋 루트: 열린 팩이 없으면 아무 파일도 읽지 않으므로 오류 없이 계획이 나온다.
  const assetRoot = join(tmpdir(), "bundle-v2-plan-test-no-such-asset-root");
  const { plan, errors } = createBundleV2DeployPlan({ themePacks, assetRoot, ledger });
  const opened = ledger.packs.filter((entry) => entry.serve === "allow" && entry.group === "pack");
  if (opened.length === 0) {
    assert.deepEqual(errors, []);
    assert.equal(plan.totals.glbObjects, 0);
    assert.equal(plan.totals.excludedAssets, themePacks.assets.length);
    // 제외 기록은 배치 가능 에셋이 있는 팩 단위다 (에셋이 없는 팩은 기록되지 않는다).
    assert.equal(plan.excludedByRights.length, new Set(themePacks.assets.map((asset) => asset.pack)).size);
    assert.ok(plan.excludedByRights.every((record) => record.reason === "hold"));
    assert.equal(assessPlanForMode(plan, "dry-run").stale, true);
    assert.match(assessPlanForMode(plan, "production").refusal, /배포할 GLB가 없습니다/);
    assert.match(assessPlanForMode(plan, "write").refusal, /배포할 GLB가 없습니다/);
  } else {
    // 팩이 열렸다면 두 경우가 있다: theme-packs가 재생성 전이면 권리 블록이 없어 rights-drift로 제외돼 계획이 나오고,
    // 재생성됐으면 실물 트리가 없어 열린 팩의 실물 누락 오류가 난다. 어느 쪽이든 닫힌 팩의 폴더는 건드리지 않는다.
    const openedIngest = opened.flatMap((entry) => themePacks.packs
      .filter((pack) => entry.catalogIds.some((id) => pack.catalogIds?.includes(id)))
      .flatMap((pack) => pack.ingestPackIds));
    if (plan === null) {
      assert.ok(errors.length > 0);
      assert.ok(errors.every((error) => /실물 파일이 없습니다|권리 원장이 올바르지 않습니다|에셋 경로가 올바르지 않습니다/.test(error)), errors.slice(0, 3).join(" | "));
      assert.ok(errors.every((error) => openedIngest.some((id) => error.includes(`${id}/`))), "닫힌 팩의 실물을 읽으려 했습니다.");
    } else {
      for (const object of plan.objects.filter((candidate) => candidate.source !== null)) {
        assert.ok(openedIngest.some((id) => object.source.startsWith(`${id}/`)), `닫힌 팩의 객체가 계획에 있습니다: ${object.source}`);
      }
    }
  }
});

// CLI 테스트용: 실제 팩 정의(Pirate Island 허용 · Old Town hold)로 만든 원장과 theme-packs.
function cliLedger() {
  return fixtureLedger([
    ledgerEntry({ ...REAL_ALLOWED, serve: "allow" }),
    ledgerEntry({ ...REAL_HELD, serve: "hold" }),
  ]);
}
const cliThemePacks = (assets) => themePacksFor(assets, [REAL_ALLOWED, REAL_HELD], cliLedger());

test("CLI dry-run은 hold를 제외하고 sha256 키를 출력하며 아무것도 쓰지 않는다", () => {
  withTempRoot((root) => {
    const rel = `${REAL_ALLOWED.ingestPackIds[0]}/a.glb`;
    writeTree(root, { [rel]: SELF_CONTAINED });
    const themePacks = cliThemePacks([
      assetEntry("allowed-m001", 0, rel, SELF_CONTAINED),
      assetEntry("held-m001", 1, `${REAL_HELD.ingestPackIds[0]}/h1.glb`, selfContainedGlb("held")),
    ]);
    const themePacksPath = join(root, "theme-packs.json");
    const ledgerPath = join(root, "ledger.json");
    const outPath = join(root, "manifest-out.json");
    writeFileSync(themePacksPath, JSON.stringify(themePacks));
    writeFileSync(ledgerPath, JSON.stringify(cliLedger()));
    const result = spawnSync(process.execPath, [
      SCRIPT, "--dry-run", "--asset-root", root, "--theme-packs", themePacksPath,
      "--pack-rights", ledgerPath, "--out", outPath,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`assets/studio/bundle-v2/${sha256Of(SELF_CONTAINED)}\\.glb`));
    assert.match(result.stdout, /제외: Old Town — Courtyards — 에셋 1개 \(hold\)/);
    assert.match(result.stdout, /이 도구는 R2 객체를 지우지 않습니다/);
    assert.match(result.stdout, /dry-run: 매니페스트를 쓰지 않고 업로드도 하지 않았습니다/);
    assert.throws(() => readFileSync(outPath), /ENOENT/);
  });
});

test("CLI는 잘못된 원장이면 계획 단계 이전에 종료 코드 2로 닫는다", () => {
  withTempRoot((root) => {
    const themePacksPath = join(root, "theme-packs.json");
    const ledgerPath = join(root, "ledger.json");
    writeFileSync(themePacksPath, JSON.stringify(themePacksFor([])));
    writeFileSync(ledgerPath, JSON.stringify({ schema: "other" }));
    const result = spawnSync(process.execPath, [
      SCRIPT, "--dry-run", "--asset-root", root, "--theme-packs", themePacksPath, "--pack-rights", ledgerPath,
    ], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /권리 원장이 올바르지 않습니다/);
  });
});

test("CLI는 pnpm run 형태의 맨 -- 를 건너뛰고 옵션을 읽는다", () => {
  withTempRoot((root) => {
    const rel = `${REAL_ALLOWED.ingestPackIds[0]}/a.glb`;
    writeTree(root, { [rel]: SELF_CONTAINED });
    const themePacksPath = join(root, "theme-packs.json");
    const ledgerPath = join(root, "ledger.json");
    writeFileSync(themePacksPath, JSON.stringify(cliThemePacks([assetEntry("allowed-m001", 0, rel, SELF_CONTAINED)])));
    writeFileSync(ledgerPath, JSON.stringify(cliLedger()));
    const result = spawnSync(process.execPath, [
      SCRIPT, "--dry-run", "--", "--asset-root", root, "--theme-packs", themePacksPath, "--pack-rights", ledgerPath,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`assets/studio/bundle-v2/${sha256Of(SELF_CONTAINED)}\\.glb`));
  });
});
