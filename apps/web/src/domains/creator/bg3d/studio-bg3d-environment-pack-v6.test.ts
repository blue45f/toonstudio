import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_CC0_ENVIRONMENT_ASSETS,
  STUDIO_BG3D_ENVIRONMENT_ASSETS,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_MCP_FREE_V1,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_V6,
  STUDIO_BG3D_ENVIRONMENT_CYCLES_PASSES,
  STUDIO_BG3D_LEGACY_ENVIRONMENT_ASSETS,
  buildStudioBg3dCyclesCompositorLayerPlan,
  getStudioBg3dEnvironmentAsset,
  getStudioBg3dEnvironmentAssetByHash,
  getStudioBg3dEnvironmentCyclesPasses,
  isStudioBg3dEnvironmentAssetId,
  resolveStudioBg3dCc0CounterpartEnvironment,
  resolveStudioBg3dEnvironmentUrl,
} from "./studio-bg3d-environment-catalog";
import {
  DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
  validateStudioBg3dGlb,
} from "./studio-bg3d-glb-validation";

function bytesFor(url: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../../../../public${url}`, import.meta.url)));
}

describe("Studio revised environment delivery v6", () => {
  it("selects twelve revised scenes while preserving every historical ID and hash", () => {
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS.slice(0, 12)).toEqual(STUDIO_BG3D_ENVIRONMENT_ASSETS_V6);
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_V6).toHaveLength(12);
    expect(STUDIO_BG3D_LEGACY_ENVIRONMENT_ASSETS).toHaveLength(12);
    const selectedIds = new Set(STUDIO_BG3D_ENVIRONMENT_ASSETS.map(({ id }) => id));
    for (const legacy of STUDIO_BG3D_LEGACY_ENVIRONMENT_ASSETS) {
      expect(selectedIds.has(legacy.id)).toBe(false);
      expect(getStudioBg3dEnvironmentAsset(legacy.id)).toBe(legacy);
      expect(getStudioBg3dEnvironmentAssetByHash(legacy.sha256)).toBe(legacy);
      const revised = STUDIO_BG3D_ENVIRONMENT_ASSETS.find(({ fileName }) => fileName === legacy.fileName);
      expect(revised?.url).not.toBe(legacy.url);
      expect(revised?.sha256).not.toBe(legacy.sha256);
      expect(revised?.theme).toBe(legacy.theme);
      expect(revised?.camera).toEqual(legacy.camera);
    }
  });

  it.each(STUDIO_BG3D_ENVIRONMENT_ASSETS_V6)(
    "$fileName preserves exact bytes and passes the actual mobile admission gate with embedded PBR maps",
    async (asset) => {
      const bytes = bytesFor(asset.url);
      const result = await validateStudioBg3dGlb(bytes, {
        declared: { byteSize: asset.byteSize, sha256: asset.sha256 },
        cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
        profile: "mobile",
        budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
        digest: async (input) => createHash("sha256").update(input).digest("hex"),
      });
      expect(result.ok, result.code).toBe(true);
      if (!result.ok) return;
      expect(result.metrics.textures).toBeGreaterThan(0);
      expect(result.metrics.maxImageDimension).toBeLessThanOrEqual(1024);
      expect(result.metrics.undeterminedImageDimensions).toBe(0);
      expect(result.metrics.estimatedDecodedImageBytes).toBeLessThanOrEqual(128 * 1024 * 1024);
      expect(result.metrics.lights).toBe(0);
      expect(result.metrics.animations).toBe(0);
      expect(asset.normalization).toBe("authored-metres");
      expect(asset.provenance.origin).toBe("original-procedural-with-cc0-sources");
      expect(asset.provenance.sources?.length).toBeGreaterThan(0);
      expect(asset.provenance.sources?.every((source) => source.startsWith("https://polyhaven.com/a/"))).toBe(true);
      expect(Object.isFrozen(asset.provenance.sources)).toBe(true);
      expect(asset.provenance.externalResources).toBe(0);
      const thumbnail = bytesFor(asset.thumbnailUrl);
      expect([...thumbnail.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    },
  );

  it("wires all 48 Cycles multipass renders (beauty, 16-bit depth, 16-bit normal, AO) for the 12 V6 environments", () => {
    expect(STUDIO_BG3D_ENVIRONMENT_CYCLES_PASSES).toHaveLength(12);
    for (const v6 of STUDIO_BG3D_ENVIRONMENT_ASSETS_V6) {
      const stem = v6.fileName.replace(/\.glb$/u, "");
      const byV6Id = getStudioBg3dEnvironmentCyclesPasses(v6.id);
      const byV1Id = getStudioBg3dEnvironmentCyclesPasses(v6.id.replace(/-v6$/u, "-v1"));
      const byStem = getStudioBg3dEnvironmentCyclesPasses(stem);
      expect(byV6Id).not.toBeNull();
      expect(byV1Id).toBe(byV6Id);
      expect(byStem).toBe(byV6Id);
      expect(byV6Id!.engine).toBe("CYCLES");
      expect(byV6Id!.resolution).toEqual([1000, 750]);
      expect(byV6Id!.samples).toBe(24);
      expect(byV6Id!.colorDepth).toEqual({
        beauty: "8",
        depth: "16",
        normal: "16",
        ao: "8",
      });
      const plan = buildStudioBg3dCyclesCompositorLayerPlan(v6.id);
      expect(plan).toHaveLength(4);
      expect(plan?.map((layer) => layer.pass)).toEqual(["beauty", "ao", "normal", "depth"]);
      expect(plan?.[0]).toMatchObject({ pass: "beauty", blendMode: "normal", opacity: 1, visible: true, url: byV6Id!.files.beautyUrl });
      expect(plan?.[1]).toMatchObject({ pass: "ao", blendMode: "multiply", opacity: 0.35, visible: true, url: byV6Id!.files.aoUrl });
      expect(plan?.[2]).toMatchObject({ pass: "normal", visible: false, url: byV6Id!.files.normalUrl });
      expect(plan?.[3]).toMatchObject({ pass: "depth", visible: false, url: byV6Id!.files.depthUrl });
      for (const passUrl of [
        byV6Id!.files.beautyUrl,
        byV6Id!.files.depthUrl,
        byV6Id!.files.normalUrl,
        byV6Id!.files.aoUrl,
      ]) {
        const png = bytesFor(passUrl);
        expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        expect(png.byteLength).toBeGreaterThan(1024);
      }
    }
    expect(buildStudioBg3dCyclesCompositorLayerPlan("non-existent-env")).toBeNull();
  });

  it("resolves all 10 self-authored CC0 webtoon environments (authored-v1) and maps Tripo MCP environments to their CC0 counterparts", async () => {
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1).toHaveLength(10);
    expect(STUDIO_BG3D_CC0_ENVIRONMENT_ASSETS).toHaveLength(31);
    expect(STUDIO_BG3D_CC0_ENVIRONMENT_ASSETS.every((asset) => asset.provenance.license === "CC0-1.0")).toBe(true);

    for (const authored of STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1) {
      expect(authored.id).toMatch(/-authored-v1$/u);
      expect(isStudioBg3dEnvironmentAssetId(authored.id)).toBe(true);
      expect(getStudioBg3dEnvironmentAsset(authored.id)).toBe(authored);
      expect(getStudioBg3dEnvironmentAssetByHash(authored.sha256)).toBe(authored);
      expect(resolveStudioBg3dEnvironmentUrl(authored.id)).toBe(authored.url);
      expect(authored.provenance.license).toBe("CC0-1.0");
      expect(authored.provenance.generator).toBe("scripts/generate_self_authored_environment_pack_v1.py");
      expect(authored.url).toMatch(/^\/assets\/3d\/environments\/authored-v1\/[a-z0-9_]+\.glb$/u);

      const bytes = bytesFor(authored.url);
      const validation = await validateStudioBg3dGlb(bytes, {
        declared: { byteSize: authored.byteSize, sha256: authored.sha256 },
        cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
        profile: "mobile",
        budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
        digest: async (input) => createHash("sha256").update(input).digest("hex"),
      });
      expect(validation.ok, validation.code).toBe(true);
      const thumbnail = bytesFor(authored.thumbnailUrl);
      expect([...thumbnail.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    }

    for (const mcpAsset of STUDIO_BG3D_ENVIRONMENT_ASSETS_MCP_FREE_V1) {
      const counterpart = resolveStudioBg3dCc0CounterpartEnvironment(mcpAsset.id);
      expect(counterpart).not.toBeNull();
      expect(counterpart!.id).toBe(mcpAsset.id.replace(/-mcp-v1$/u, "-authored-v1"));
      expect(counterpart!.fileName).toBe(mcpAsset.fileName);
      expect(counterpart!.provenance.license).toBe("CC0-1.0");
      expect(counterpart!.url).toBe(`/assets/3d/environments/authored-v1/${mcpAsset.fileName}`);
      expect(counterpart!.sha256).not.toBe(mcpAsset.sha256);

      expect(resolveStudioBg3dEnvironmentUrl(mcpAsset.id)).toBe(mcpAsset.url);
      expect(resolveStudioBg3dEnvironmentUrl(mcpAsset.id, { preferCc0Counterpart: true })).toBe(counterpart!.url);
      expect(resolveStudioBg3dEnvironmentUrl(mcpAsset.url, { preferCc0Counterpart: true })).toBe(counterpart!.url);
    }
  });
});

