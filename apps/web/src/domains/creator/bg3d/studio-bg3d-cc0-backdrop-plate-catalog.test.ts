import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_CC0_BACKDROP_CATEGORIES,
  STUDIO_BG3D_CC0_BACKDROP_PLATE_CATALOG,
  findStudioBg3dCc0BackdropPlate,
  getStudioBg3dScenePresetBackdropPlates,
  listStudioBg3dCc0BackdropPlatesByCategory,
} from "./studio-bg3d-cc0-backdrop-plate-catalog";
import { STUDIO_BG3D_SCENE_COMPOSITION_PRESETS } from "./studio-bg3d-scene-composition-presets";

const WEB_PUBLIC_DIR = path.resolve(import.meta.dirname, "../../../../public");
const CC0_MANIFEST_PATH = path.join(
  WEB_PUBLIC_DIR,
  "assets/studio/cc0-20260906/manifest.json",
);

describe("studio-bg3d-cc0-backdrop-plate-catalog", () => {
  it("registers all 39 Poly Haven CC0 2K background plates from manifest.json", () => {
    const manifest = JSON.parse(fs.readFileSync(CC0_MANIFEST_PATH, "utf8")) as {
      readonly assets: readonly { readonly id: string; readonly kind: string }[];
    };
    const manifestBackdropIds = manifest.assets
      .filter((asset) => asset.kind === "background")
      .map((asset) => asset.id);

    expect(manifestBackdropIds).toHaveLength(39);
    expect(STUDIO_BG3D_CC0_BACKDROP_PLATE_CATALOG).toHaveLength(39);

    const catalogIds = new Set(STUDIO_BG3D_CC0_BACKDROP_PLATE_CATALOG.map((entry) => entry.id));
    expect(catalogIds.size).toBe(39);
    for (const id of manifestBackdropIds) {
      expect(catalogIds.has(id)).toBe(true);
    }
  });

  it("verifies all 39 2048x1152 background.webp and 384x216 thumbnail.webp files exist on disk", () => {
    for (const entry of STUDIO_BG3D_CC0_BACKDROP_PLATE_CATALOG) {
      const imageDiskPath = path.join(WEB_PUBLIC_DIR, entry.imageUrl.replace(/^\//, ""));
      const previewDiskPath = path.join(WEB_PUBLIC_DIR, entry.previewUrl.replace(/^\//, ""));

      expect(fs.existsSync(imageDiskPath)).toBe(true);
      expect(fs.existsSync(previewDiskPath)).toBe(true);

      const imageHeader = fs.readFileSync(imageDiskPath).subarray(0, 12);
      expect(imageHeader.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(imageHeader.subarray(8, 12).toString("ascii")).toBe("WEBP");

      const previewHeader = fs.readFileSync(previewDiskPath).subarray(0, 12);
      expect(previewHeader.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(previewHeader.subarray(8, 12).toString("ascii")).toBe("WEBP");
    }
  });

  it("partitions all 39 backdrop plates across the 3 categories and links all 16 genre scene presets", () => {
    let sumByCategory = 0;
    for (const category of STUDIO_BG3D_CC0_BACKDROP_CATEGORIES) {
      const items = listStudioBg3dCc0BackdropPlatesByCategory(category.id);
      expect(items.length).toBeGreaterThanOrEqual(10);
      sumByCategory += items.length;
    }
    expect(sumByCategory).toBe(39);
    expect(listStudioBg3dCc0BackdropPlatesByCategory(null)).toHaveLength(39);

    const hansaplatz = findStudioBg3dCc0BackdropPlate("polyhaven-background-hansaplatz");
    expect(hansaplatz?.sourcePanoramaId).toBe("hansaplatz");

    for (const preset of STUDIO_BG3D_SCENE_COMPOSITION_PRESETS) {
      const plates = getStudioBg3dScenePresetBackdropPlates(preset.id);
      expect(plates.length).toBeGreaterThanOrEqual(2);
    }
  });
});
