import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import manifest from "../../../../public/assets/3d/environments/expansion-v2/manifest.json";

import {
  getStudioBg3dEnvironmentAsset, getStudioBg3dEnvironmentAssetByHash, resolveStudioBg3dEnvironmentUrl,
  STUDIO_BG3D_CC0_ENVIRONMENT_ASSETS, STUDIO_BG3D_CURRENT_EXPANSION_ENVIRONMENTS,
  STUDIO_BG3D_ENVIRONMENT_ASSETS, STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1,
} from "./studio-bg3d-environment-catalog";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb } from "./studio-bg3d-glb-validation";

it("수정한 배경 다섯 판만 새 선택에 노출하고 조사실의 원본 ID를 유지한다", () => {
  expect(manifest.assets).toHaveLength(5);
  expect(STUDIO_BG3D_CURRENT_EXPANSION_ENVIRONMENTS).toHaveLength(6);
  const unchanged = STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1.filter(
    (asset) => STUDIO_BG3D_CURRENT_EXPANSION_ENVIRONMENTS.includes(asset),
  );
  expect(unchanged.map((asset) => asset.fileName)).toEqual(["police_interview_room.glb"]);
});

it.each(manifest.assets)("$fileName의 원고에 저장된 구판과 새 선택이 각각 자신의 실제 바이트로 열린다", async (revision) => {
  const old = getStudioBg3dEnvironmentAsset(revision.sourceId);
  const active = getStudioBg3dEnvironmentAsset(revision.id);
  expect(old?.sha256).toBe(revision.sourceSha256);
  expect(active?.sha256).toBe(revision.sha256);
  expect(active?.camera).toEqual(old?.camera);
  expect(active?.bounds).toEqual(old?.bounds);
  expect(active?.thumbnailUrl).toBe(old?.thumbnailUrl);
  for (const catalog of [STUDIO_BG3D_ENVIRONMENT_ASSETS, STUDIO_BG3D_CC0_ENVIRONMENT_ASSETS]) {
    expect(catalog).toContain(active);
    expect(catalog).not.toContain(old);
  }
  for (const asset of [old, active]) {
    if (!asset) throw new Error("원본·수정본이 카탈로그에 모두 있어야 합니다");
    expect(getStudioBg3dEnvironmentAssetByHash(asset.sha256)).toBe(asset);
    for (const key of [asset.id, asset.sha256, asset.url]) {
      expect(resolveStudioBg3dEnvironmentUrl(key)).toBe(asset.url);
      expect(resolveStudioBg3dEnvironmentUrl(key, { preferCc0Counterpart: true })).toBe(asset.url);
    }
    const bytes = new Uint8Array(readFileSync(new URL(`../../../../public${asset.url}`, import.meta.url)));
    expect(await validateStudioBg3dGlb(bytes, {
      declared: { byteSize: asset.byteSize, sha256: asset.sha256 },
      cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
      profile: "mobile", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
      digest: async (input) => createHash("sha256").update(input).digest("hex"),
    })).toMatchObject({ ok: true, code: "valid" });
  }
});
