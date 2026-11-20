import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
  validateStudioBg3dGlb,
} from "./studio-bg3d-glb-validation";
import {
  HERO_V1_DESKTOP_BUDGET,
  HERO_V1_DESKTOP_NODE_NAMES,
  HERO_V1_MOBILE_BUDGET,
  HERO_V1_MOBILE_NODE_NAMES,
} from "./studio-bg3d-hero-v1-catalog-entries";
import {
  BG3D_HERO_LIGHTING_PRESET_IDS,
  BG3D_HERO_V2_SLUGS,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_ALL,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_ALL_MOBILE,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V2,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V2_MOBILE,
  STUDIO_BG3D_HERO_ALL_ENTRIES,
  STUDIO_BG3D_HERO_V2_ENTRIES,
  selectBg3dHeroV2AssetForTier,
  validateBg3dHeroV2CatalogContracts,
} from "./studio-bg3d-hero-v2-catalog-entries";
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

describe("studio-bg3d-hero-v2-catalog-entries", () => {
  it("registers all 6 new Hero BG v2 scenes and exposes all 12 combined Hero BG scenes (v1+v2)", () => {
    expect(BG3D_HERO_V2_SLUGS).toHaveLength(6);
    expect(STUDIO_BG3D_HERO_V2_ENTRIES).toHaveLength(6);
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V2).toHaveLength(6);
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V2_MOBILE).toHaveLength(6);
    expect(STUDIO_BG3D_HERO_ALL_ENTRIES).toHaveLength(12);
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_ALL).toHaveLength(12);
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_ALL_MOBILE).toHaveLength(12);

    for (const slug of BG3D_HERO_V2_SLUGS) {
      expect(selectBg3dHeroV2AssetForTier(slug, "desktop")?.url).toBe(
        `/assets/3d/environments/hero-v2/${slug}/desktop.glb`,
      );
      expect(selectBg3dHeroV2AssetForTier(slug, "mobile")?.url).toBe(
        `/assets/3d/environments/hero-v2/${slug}/mobile.glb`,
      );
    }

    const audit = validateBg3dHeroV2CatalogContracts();
    expect(audit.ok).toBe(true);
    expect(audit.issues).toEqual([]);
  });

  it.each(STUDIO_BG3D_HERO_V2_ENTRIES)(
    "$slug verifies desktop/mobile GLB bytes, SHA-256, canonical nodes, admission gate, 512x512 thumbnail, and 3-tier Freestyle SVG on disk",
    async (entry) => {
      expect(entry.deliveryStatus).toBe("verified-on-disk");
      expect(entry.lightingPresetIds).toEqual(BG3D_HERO_LIGHTING_PRESET_IDS);

      const thumbnail = readFileSync(publicAssetPath(entry.desktopAsset.thumbnailUrl));
      expect([...thumbnail.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(thumbnail.readUInt32BE(16)).toBe(512);
      expect(thumbnail.readUInt32BE(20)).toBe(512);

      const svgText = readFileSync(publicAssetPath(entry.freestyleSvg.url), "utf8");
      expect(Buffer.byteLength(svgText, "utf8")).toBe(entry.freestyleSvg.byteSize);
      expect(entry.freestyleSvg.byteSize).toBeLessThan(2.5 * 1024 * 1024);
      for (const sw of entry.freestyleSvg.strokeWidths) {
        expect(svgText).toContain(`stroke-width="${sw}"`);
      }

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
          expect(nodeNames.has(requiredNode), `${asset.id} missing ${requiredNode}`).toBe(true);
        }
      }
    },
  );
});
