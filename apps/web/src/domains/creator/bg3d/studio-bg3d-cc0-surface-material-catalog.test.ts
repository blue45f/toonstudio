import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG,
  STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATEGORIES,
  STUDIO_BG3D_SURFACE_MATERIAL_ROOM_KITS,
  buildStudioBg3dCc0SurfaceMaterialOverride,
  findStudioBg3dCc0SurfaceMaterial,
  listStudioBg3dCc0SurfaceMaterialsByCategory,
  resolveStudioBg3dSurfaceMaterialRoomKit,
} from "./studio-bg3d-cc0-surface-material-catalog";
import { isStudioBg3dSurfacePresetId } from "./studio-bg3d-surface-presets";

const WEB_PUBLIC_DIR = path.resolve(import.meta.dirname, "../../../../public");
const CC0_MANIFEST_PATH = path.join(
  WEB_PUBLIC_DIR,
  "assets/studio/cc0-20260906/manifest.json",
);

describe("studio-bg3d-cc0-surface-material-catalog", () => {
  it("registers all 82 CC0 2K surface-texture entries from manifest.json (80 Poly Haven + 2 ambientCG)", () => {
    const manifest = JSON.parse(fs.readFileSync(CC0_MANIFEST_PATH, "utf8")) as {
      readonly assets: readonly { readonly id: string; readonly kind: string }[];
    };
    const manifestSurfaceIds = manifest.assets
      .filter((asset) => asset.kind === "surface-texture")
      .map((asset) => asset.id);

    expect(manifestSurfaceIds).toHaveLength(82);
    expect(STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG).toHaveLength(82);

    const catalogIds = new Set(STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG.map((entry) => entry.id));
    expect(catalogIds.size).toBe(82);
    for (const id of manifestSurfaceIds) {
      expect(catalogIds.has(id)).toBe(true);
    }

    const polyHavenCount = STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG.filter(
      (entry) => entry.provider === "Poly Haven",
    ).length;
    const ambientCgCount = STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG.filter(
      (entry) => entry.provider === "ambientCG",
    ).length;
    expect(polyHavenCount).toBe(80);
    expect(ambientCgCount).toBe(2);
  });

  it("verifies all 82 baseColor/preview WebP textures and all 320 2K PBR JPEG maps exist on disk", () => {
    let pbrMapCount = 0;

    for (const entry of STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG) {
      const baseColorDiskPath = path.join(WEB_PUBLIC_DIR, entry.baseColorUrl.replace(/^\//, ""));
      const previewDiskPath = path.join(WEB_PUBLIC_DIR, entry.previewUrl.replace(/^\//, ""));

      expect(fs.existsSync(baseColorDiskPath)).toBe(true);
      expect(fs.existsSync(previewDiskPath)).toBe(true);

      const header = fs.readFileSync(baseColorDiskPath).subarray(0, 12);
      expect(header.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(header.subarray(8, 12).toString("ascii")).toBe("WEBP");

      expect(isStudioBg3dSurfacePresetId(entry.surfacePresetId)).toBe(true);
      expect(entry.roughness).toBeGreaterThanOrEqual(0);
      expect(entry.roughness).toBeLessThanOrEqual(1);
      expect(entry.metalness).toBeGreaterThanOrEqual(0);
      expect(entry.metalness).toBeLessThanOrEqual(1);

      if (entry.pbrMaps) {
        for (const mapUrl of [
          entry.pbrMaps.roughnessUrl,
          entry.pbrMaps.normalGlUrl,
          entry.pbrMaps.aoUrl,
          entry.pbrMaps.displacementUrl,
        ]) {
          const mapDiskPath = path.join(WEB_PUBLIC_DIR, mapUrl.replace(/^\//, ""));
          expect(fs.existsSync(mapDiskPath)).toBe(true);
          const mapHeader = fs.readFileSync(mapDiskPath).subarray(0, 4);
          if (mapUrl.endsWith(".png")) {
            expect(mapHeader[0]).toBe(0x89);
            expect(mapHeader[1]).toBe(0x50);
            expect(mapHeader[2]).toBe(0x4e);
            expect(mapHeader[3]).toBe(0x47);
          } else {
            expect(mapHeader[0]).toBe(0xff);
            expect(mapHeader[1]).toBe(0xd8);
            expect(mapHeader[2]).toBe(0xff);
          }
          pbrMapCount += 1;
        }
      }
    }

    expect(pbrMapCount).toBe(320);
  });

  it("partitions all 82 surface materials across the 6 categories and builds material overrides", () => {
    let sumByCategory = 0;
    for (const category of STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATEGORIES) {
      const items = listStudioBg3dCc0SurfaceMaterialsByCategory(category.id);
      expect(items.length).toBeGreaterThanOrEqual(10);
      sumByCategory += items.length;
    }
    expect(sumByCategory).toBe(82);
    expect(listStudioBg3dCc0SurfaceMaterialsByCategory(null)).toHaveLength(82);

    const sample = findStudioBg3dCc0SurfaceMaterial("polyhaven-wood-floor");
    expect(sample?.category).toBe("wood");
    const override = buildStudioBg3dCc0SurfaceMaterialOverride("polyhaven-wood-floor");
    expect(override).toMatchObject({
      colorMode: "multiply",
      color: sample?.tintHex,
      roughness: sample?.roughness,
      metalness: sample?.metalness,
    });
    expect(buildStudioBg3dCc0SurfaceMaterialOverride("unknown-material")).toBeNull();
  });

  it("resolves all 6 architectural room surface material kits", () => {
    expect(STUDIO_BG3D_SURFACE_MATERIAL_ROOM_KITS).toHaveLength(6);
    for (const kit of STUDIO_BG3D_SURFACE_MATERIAL_ROOM_KITS) {
      const resolved = resolveStudioBg3dSurfaceMaterialRoomKit(kit.id);
      expect(resolved).not.toBeNull();
      expect(resolved?.floor.id).toBe(kit.floorMaterialId);
      expect(resolved?.wall.id).toBe(kit.wallMaterialId);
      expect(resolved?.accent.id).toBe(kit.accentMaterialId);
    }
    expect(resolveStudioBg3dSurfaceMaterialRoomKit("non-existent-kit")).toBeNull();
  });
});
