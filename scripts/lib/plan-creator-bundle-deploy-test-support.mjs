/**
 * 배포 플래너 테스트 지원: 픽스처 팩·원장·theme-packs·임시 트리 도우미.
 * plan-creator-bundle-deploy.test.mjs(API)와 plan-creator-bundle-deploy-cli.test.mjs(CLI)가 같은 픽스처를 쓴다.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { CATALOG_PACKS } from "../generate-creator-bundle-theme-packs.mjs";
import { createBundleV2DeployPlan } from "../plan-creator-bundle-deploy.mjs";
import { findPackRights, packRightsProjection } from "./creator-bundle-pack-rights.mjs";
import { fixtureLedger, ledgerEntry, selfContainedGlb } from "./creator-bundle-pack-rights-test-support.mjs";

export const sha256Of = (buffer) => createHash("sha256").update(buffer).digest("hex");

export const SELF_CONTAINED = selfContainedGlb("allow-a");

// 생성기가 내는 theme-packs 팩과 같은 모양: 카탈로그 번호·제목·제작사·인제스션 폴더(ingestPackIds).
export const ALLOWED_PACK = {
  catalogIds: ["cbv1-901-fixture-allowed"], title: "Allowed Pack", creator: "RG Poly", ingestPackIds: ["allowed"],
};
export const HELD_PACK = {
  catalogIds: ["cbv1-902-fixture-held"], title: "Held Pack", creator: "RG Poly", ingestPackIds: ["held"],
};
export const UNLISTED_PACK = {
  catalogIds: ["cbv1-903-fixture-unlisted"], title: "Unlisted Pack", creator: "RG Poly", ingestPackIds: ["unlisted"],
};

// 플래너는 theme-packs 팩의 ingestPackIds를 생성기 팩 정의(CATALOG_PACKS)와 대조한다. API 테스트는 픽스처 정의를 주입한다.
export const FIXTURE_DEFS = [ALLOWED_PACK, HELD_PACK, UNLISTED_PACK].map((pack) => ({
  catalogIds: pack.catalogIds, title: pack.title, creator: pack.creator, ingest: pack.ingestPackIds,
}));
export const planFor = (args) => createBundleV2DeployPlan({ packDefs: FIXTURE_DEFS, ...args });

// CLI는 생성기의 실제 팩 정의를 쓰므로 CLI 테스트는 실제 팩(Pirate Island·Old Town)으로 픽스처를 만든다.
function realPack(title) {
  const def = CATALOG_PACKS.find((candidate) => candidate.title === title);
  assert.ok(def, `생성기 정의에 ${title}가 없습니다.`);
  return { catalogIds: def.catalogIds, title: def.title, creator: def.creator, ingestPackIds: def.ingest };
}
export const REAL_ALLOWED = realPack("Pirate Island");
export const REAL_HELD = realPack("Old Town — Courtyards");

export function ledgerWithAllowedAndHeld() {
  return fixtureLedger([
    ledgerEntry({ ...ALLOWED_PACK, serve: "allow" }),
    ledgerEntry({ ...HELD_PACK, serve: "hold" }),
  ]);
}

export function writeTree(root, files) {
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

export function themePacksFor(assets, packs = [ALLOWED_PACK, HELD_PACK], ledger = ledgerWithAllowedAndHeld()) {
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

export function assetEntry(id, pack, path, buffer) {
  return { id, pack, path, bytes: buffer.length, sha256: sha256Of(buffer), tris: 12 };
}

export function withTempRoot(run) {
  const root = mkdtempSync(join(tmpdir(), "bundle-v2-plan-test-"));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// CLI 테스트용: 실제 팩 정의(Pirate Island 허용 · Old Town hold)로 만든 원장과 theme-packs.
export function cliLedger() {
  return fixtureLedger([
    ledgerEntry({ ...REAL_ALLOWED, serve: "allow" }),
    ledgerEntry({ ...REAL_HELD, serve: "hold" }),
  ]);
}
export const cliThemePacks = (assets) => themePacksFor(assets, [REAL_ALLOWED, REAL_HELD], cliLedger());
