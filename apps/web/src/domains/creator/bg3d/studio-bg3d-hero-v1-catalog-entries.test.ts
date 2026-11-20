import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_CC0_ENVIRONMENT_ASSETS,
  STUDIO_BG3D_ENVIRONMENT_ASSETS,
  getStudioBg3dEnvironmentAsset,
  getStudioBg3dEnvironmentAssetByHash,
  isStudioBg3dEnvironmentAssetId,
  resolveStudioBg3dEnvironmentUrl,
} from "./studio-bg3d-environment-catalog";
import {
  DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
  validateStudioBg3dGlb,
} from "./studio-bg3d-glb-validation";
import {
  BG3D_HERO_V1_SLUGS,
  HERO_V1_DESKTOP_BUDGET,
  HERO_V1_DESKTOP_NODE_NAMES,
  HERO_V1_MOBILE_BUDGET,
  HERO_V1_MOBILE_NODE_NAMES,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V1,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V1_MOBILE,
  STUDIO_BG3D_HERO_V1_ENTRIES,
  hydrateBg3dHeroV1FromManifest,
  selectBg3dHeroV1AssetForTier,
  validateBg3dHeroV1CatalogContracts,
} from "./studio-bg3d-hero-v1-catalog-entries";
import { STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS } from "./studio-bg3d-meshopt";

const GLB_JSON_CHUNK = 0x4e4f534a;

interface GltfDocument {
  readonly buffers?: readonly { readonly uri?: string }[];
  readonly images?: readonly { readonly uri?: string }[];
  readonly extensionsRequired?: readonly string[];
  readonly nodes?: readonly { readonly name?: string }[];
}

function publicAssetPath(url: string): string {
  return fileURLToPath(new URL(`../../../../public${url}`, import.meta.url));
}

function parseJsonChunk(bytes: Uint8Array): GltfDocument {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(GLB_JSON_CHUNK);
  return JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)),
  ) as GltfDocument;
}

describe("studio-bg3d-hero-v1-catalog-entries", () => {
  it("registers all 6 Wave 4 hero scenes at the top of the live catalog with desktop 8-node & mobile 4-node contracts", () => {
    expect(STUDIO_BG3D_HERO_V1_ENTRIES).toHaveLength(6);
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V1).toHaveLength(6);
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V1_MOBILE).toHaveLength(6);
    expect(HERO_V1_DESKTOP_BUDGET.nodeNames).toHaveLength(8);
    expect(HERO_V1_MOBILE_BUDGET.nodeNames).toHaveLength(4);
    expect(HERO_V1_DESKTOP_BUDGET.forbiddenExtensions).toContain("KHR_draco_mesh_compression");
    expect(HERO_V1_MOBILE_BUDGET.allowedExtensions).toContain("EXT_meshopt_compression");

    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS.slice(0, 6)).toEqual(STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V1);
    expect(STUDIO_BG3D_CC0_ENVIRONMENT_ASSETS.slice(0, 6)).toEqual(STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V1);

    for (const slug of BG3D_HERO_V1_SLUGS) {
      const desktop = selectBg3dHeroV1AssetForTier(slug, "desktop");
      const mobile = selectBg3dHeroV1AssetForTier(slug, "mobile");
      expect(desktop).toBeDefined();
      expect(mobile).toBeDefined();
      expect(desktop!.url).toBe(`/assets/3d/environments/hero-v1/${slug}.glb`);
      expect(mobile!.url).toBe(`/assets/3d/environments/hero-v1/${slug}-mobile.glb`);

      for (const asset of [desktop!, mobile!]) {
        expect(isStudioBg3dEnvironmentAssetId(asset.id)).toBe(true);
        expect(getStudioBg3dEnvironmentAsset(asset.id)).toBe(asset);
        expect(getStudioBg3dEnvironmentAssetByHash(asset.sha256)).toBe(asset);
        expect(resolveStudioBg3dEnvironmentUrl(asset.id)).toBe(asset.url);
        expect(resolveStudioBg3dEnvironmentUrl(asset.sha256)).toBe(asset.url);
        expect(resolveStudioBg3dEnvironmentUrl(asset.id, { preferCc0Counterpart: true })).toBe(asset.url);
      }
    }

    const audit = validateBg3dHeroV1CatalogContracts();
    expect(audit.ok).toBe(true);
    expect(audit.issues).toEqual([]);
  });

  it.each(STUDIO_BG3D_HERO_V1_ENTRIES)(
    "$slug verifies desktop/mobile GLB bytes, SHA-256, canonical nodes, admission gate, and 512x512 PNG thumbnail on disk",
    async (entry) => {
      expect(entry.deliveryStatus).toBe("verified-on-disk");

      const thumbnail = readFileSync(publicAssetPath(entry.desktopAsset.thumbnailUrl));
      expect([...thumbnail.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(thumbnail.readUInt32BE(16)).toBe(512);
      expect(thumbnail.readUInt32BE(20)).toBe(512);

      const tiers = [
        {
          asset: entry.desktopAsset,
          profile: "desktop" as const,
          budget: HERO_V1_DESKTOP_BUDGET,
          requiredNodes: HERO_V1_DESKTOP_NODE_NAMES,
        },
        {
          asset: entry.mobileAsset,
          profile: "mobile" as const,
          budget: HERO_V1_MOBILE_BUDGET,
          requiredNodes: HERO_V1_MOBILE_NODE_NAMES,
        },
      ];

      for (const { asset, profile, budget, requiredNodes } of tiers) {
        const bytes = new Uint8Array(readFileSync(publicAssetPath(asset.url)));
        expect(bytes.byteLength).toBe(asset.byteSize);
        expect(bytes.byteLength).toBeLessThanOrEqual(budget.maxFileSizeBytes);
        expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(asset.sha256);

        const admission = await validateStudioBg3dGlb(bytes, {
          declared: { byteSize: asset.byteSize, sha256: asset.sha256 },
          cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
          profile,
          budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
          supportedRequiredExtensions: STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS,
          digest: async (input) => createHash("sha256").update(input).digest("hex"),
        });
        expect(admission, asset.id).toMatchObject({ ok: true, code: "valid" });
        if (!admission.ok) return;

        expect(admission.metrics.triangles).toBeLessThanOrEqual(budget.maxTriangles);
        expect(admission.metrics.drawCalls).toBeLessThanOrEqual(budget.maxDrawCalls);
        expect(admission.metrics.materials).toBeLessThanOrEqual(budget.maxMaterials);
        expect(admission.metrics.lights).toBe(0);
        expect(admission.metrics.animations).toBe(0);
        expect(admission.metrics.skins).toBe(0);

        const doc = parseJsonChunk(bytes);
        expect((doc.buffers ?? []).every(({ uri }) => uri === undefined)).toBe(true);
        expect((doc.images ?? []).every(({ uri }) => uri === undefined)).toBe(true);
        expect(doc.extensionsRequired ?? []).not.toContain("KHR_draco_mesh_compression");
        const nodeNames = new Set((doc.nodes ?? []).map((n) => n.name));
        for (const requiredNode of requiredNodes) {
          expect(nodeNames.has(requiredNode), `${asset.fileName} missing ${requiredNode}`).toBe(true);
        }
      }
    },
  );

  it("immutably overrides verified byte sizes and SHA-256 hashes via hydrateBg3dHeroV1FromManifest", () => {
    const hydrated = hydrateBg3dHeroV1FromManifest([
      {
        slug: "rofan_imperial_palace_hall_balcony",
        desktopByteSize: 8_420_000,
        desktopSha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        mobileByteSize: 3_110_000,
        mobileSha256: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    ]);

    const palace = hydrated.find((e) => e.slug === "rofan_imperial_palace_hall_balcony")!;
    const cafe = hydrated.find((e) => e.slug === "kr_atelier_cafe_interior")!;
    expect(palace.deliveryStatus).toBe("verified-on-disk");
    expect(palace.desktopAsset.byteSize).toBe(8_420_000);
    expect(palace.mobileAsset.byteSize).toBe(3_110_000);
    expect(cafe.desktopAsset.byteSize).toBe(5_430_228);
    expect(cafe.deliveryStatus).toBe("verified-on-disk");
  });
});
