import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import nodeTest from "node:test";
import { fileURLToPath } from "node:url";
import { test as vitestTest } from "vitest";

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

const sha256Of = (buffer) => createHash("sha256").update(buffer).digest("hex");

const SELF_CONTAINED = selfContainedGlb("allow-a");
const EXTERNAL = makeGlb({
  asset: { version: "2.0" },
  buffers: [{ byteLength: 0 }],
  images: [{ uri: "../Textures/atlas.png" }],
});

const ALLOWED_PACK = { catalogIds: ["cbv1-901-fixture-allowed"], title: "Allowed Pack" };
const HELD_PACK = { catalogIds: ["cbv1-902-fixture-held"], title: "Held Pack" };
const UNLISTED_PACK = { catalogIds: ["cbv1-903-fixture-unlisted"], title: "Unlisted Pack" };

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

function themePacksFor(assets, packs = [ALLOWED_PACK, HELD_PACK]) {
  return {
    schema: "toonstudio.bg3d-bundle-theme-packs.v1",
    version: 1,
    inServiceOnly: true,
    downloadable: false,
    assetRoot: "/assets/studio/bundle-v2/",
    sourceManifest: { generatedAt: "2026-10-21T05:14:22.108Z" },
    totals: { packs: packs.length, placeableAssets: assets.length, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 },
    packs: packs.map((pack) => ({ ...pack, title: pack.title })),
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
    const rel = "pack-a/native/Some Folder/Model+A&B.glb";
    writeTree(root, { [rel]: SELF_CONTAINED });
    const themePacks = themePacksFor([assetEntry("cbv1-ingest-001-m001", 0, rel, SELF_CONTAINED)]);
    const { plan, errors } = createBundleV2DeployPlan({
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
    writeTree(root, { [allowedRel]: SELF_CONTAINED });
    const themePacks = themePacksFor([
      assetEntry("allowed-m001", 0, allowedRel, SELF_CONTAINED),
      assetEntry("held-m001", 1, "held/h1.glb", heldGlb),
      assetEntry("held-m002", 1, "held/h2.glb", selfContainedGlb("held-2")),
    ]);
    const { plan, errors } = createBundleV2DeployPlan({
      themePacks, assetRoot: root, ledger: ledgerWithAllowedAndHeld(),
    });
    assert.deepEqual(errors, []);
    assert.equal(plan.totals.glbObjects, 1);
    assert.equal(plan.totals.excludedAssets, 2);
    assert.equal(plan.excludedByRights.length, 1);
    assert.equal(plan.excludedByRights[0].title, "Held Pack");
    assert.equal(plan.excludedByRights[0].reason, "hold");
    assert.equal(plan.excludedByRights[0].assets, 2);
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
    const { plan, errors } = createBundleV2DeployPlan({
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
    const missing = createBundleV2DeployPlan({ themePacks, assetRoot: root });
    assert.equal(missing.plan, null);
    assert.match(missing.errors[0], /권리 원장이 없어/);

    // 증빙 없이 allow로 바꾼 원장은 검증에서 걸려 계획 자체를 거부한다.
    const unproven = fixtureLedger([
      ledgerEntry({ ...ALLOWED_PACK, serve: "allow", evidence: [] }),
    ]);
    const rejected = createBundleV2DeployPlan({ themePacks, assetRoot: root, ledger: unproven });
    assert.equal(rejected.plan, null);
    assert.match(rejected.errors[0], /권리 원장이 올바르지 않습니다/);

    const secondaryOnly = fixtureLedger([
      ledgerEntry({
        ...ALLOWED_PACK,
        serve: "allow",
        evidence: [{ kind: "secondary-lookup", claim: "itch CC0 표기", source: "report" }],
      }),
    ]);
    assert.equal(createBundleV2DeployPlan({ themePacks, assetRoot: root, ledger: secondaryOnly }).plan, null);
  });
});

test("같은 바이트의 에셋은 한 객체로 합치되 인덱스는 에셋 단위로 센다", () => {
  withTempRoot((root) => {
    writeTree(root, { "allowed/a.glb": SELF_CONTAINED, "allowed/copy-of-a.glb": SELF_CONTAINED });
    const themePacks = themePacksFor([
      assetEntry("allowed-m001", 0, "allowed/a.glb", SELF_CONTAINED),
      assetEntry("allowed-m002", 0, "allowed/copy-of-a.glb", SELF_CONTAINED),
    ]);
    const { plan, errors } = createBundleV2DeployPlan({
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
    const { plan, errors } = createBundleV2DeployPlan({
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
    const missing = createBundleV2DeployPlan({ themePacks: good, assetRoot: join(root, "nope"), ledger });
    assert.equal(missing.plan, null);
    assert.match(missing.errors[0], /실물 파일이 없습니다/);
    const wrongHash = themePacksFor([{ ...good.assets[0], sha256: "0".repeat(64) }]);
    const mismatch = createBundleV2DeployPlan({ themePacks: wrongHash, assetRoot: root, ledger });
    assert.equal(mismatch.plan, null);
    assert.match(mismatch.errors[0], /해시 불일치/);
  });
});

test("CLI dry-run은 hold를 제외하고 sha256 키를 출력하며 아무것도 쓰지 않는다", () => {
  withTempRoot((root) => {
    const rel = "allowed/a.glb";
    writeTree(root, { [rel]: SELF_CONTAINED });
    const themePacks = themePacksFor([
      assetEntry("allowed-m001", 0, rel, SELF_CONTAINED),
      assetEntry("held-m001", 1, "held/h1.glb", selfContainedGlb("held")),
    ]);
    const themePacksPath = join(root, "theme-packs.json");
    const ledgerPath = join(root, "ledger.json");
    const outPath = join(root, "manifest-out.json");
    writeFileSync(themePacksPath, JSON.stringify(themePacks));
    writeFileSync(ledgerPath, JSON.stringify(ledgerWithAllowedAndHeld()));
    const result = spawnSync(process.execPath, [
      SCRIPT, "--dry-run", "--asset-root", root, "--theme-packs", themePacksPath,
      "--pack-rights", ledgerPath, "--out", outPath,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`assets/studio/bundle-v2/${sha256Of(SELF_CONTAINED)}\\.glb`));
    assert.match(result.stdout, /제외: Held Pack — 에셋 1개 \(hold\)/);
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
