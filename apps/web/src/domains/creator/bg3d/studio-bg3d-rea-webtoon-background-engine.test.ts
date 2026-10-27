import { describe, expect, it } from "vitest";

import { TRIPO3D_MCP_GENERATED_MODELS } from "../scene-3d/studio-tripo3d-customizer-engine";
import {
  STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES,
  STUDIO_VARCO3D_WEBTOON_PROP_ASSETS,
} from "../scene-3d/studio-varco3d-character-lab-diorama-catalog";
import {
  STUDIO_BG3D_REA_COMPETITOR_PROFILES,
  STUDIO_BG3D_TRIPO_GLB_CALIBRATION_CATALOG,
  STUDIO_BG3D_VARCO_GLB_CALIBRATION_CATALOG,
  buildCalibratedTripoBg3dGlbPlacement,
  buildCalibratedVarcoBg3dGlbPlacement,
  buildTripoBg3dProceduralTwinPrimitives,
  buildVarco3dDioramaDetailedPrimitives,
  buildVarco3dPropDetailedPrimitives,
  resolveReaDioramaSummaryKo,
} from "./studio-bg3d-rea-webtoon-background-engine";

describe("studio-bg3d-rea-webtoon-background-engine", () => {
  it("defines 8 REA competitor reverse-engineering profiles with camera, toon line, and dressing specs", () => {
    expect(STUDIO_BG3D_REA_COMPETITOR_PROFILES).toHaveLength(8);
    const ids = STUDIO_BG3D_REA_COMPETITOR_PROFILES.map((p) => p.id);
    expect(ids).toEqual([
      "acon3d-carpenstreet",
      "snaptoon-unreal-npr",
      "clip-studio-3d-lt",
      "sketchup-webtoon-warehouse",
      "varco-3d-ncsoft",
      "tripo-3d-studio-mcp",
      "dondraw-webtoon-stage",
      "blender-freestyle-lineart",
    ]);

    for (const profile of STUDIO_BG3D_REA_COMPETITOR_PROFILES) {
      expect(profile.reverseEngineeredSystemsKo.length).toBeGreaterThanOrEqual(3);
      expect(profile.cameraPreset.fovDeg).toBeGreaterThanOrEqual(28);
      expect(profile.cameraPreset.fovDeg).toBeLessThanOrEqual(45);
      expect(profile.toonRenderProfile.silhouetteLineMm).toBeGreaterThan(
        profile.toonRenderProfile.creaseLineMm,
      );
      expect(profile.toonRenderProfile.creaseLineMm).toBeGreaterThan(
        profile.toonRenderProfile.detailLineMm,
      );
    }
  });

  it("calibrates all 17 Tripo 3D and 10 VARCO 3D background GLB assets to human-scale meters with base-pivot grounding", () => {
    const bg3dModels = TRIPO3D_MCP_GENERATED_MODELS.filter((m) => m.domain === "bg3d");
    expect(bg3dModels).toHaveLength(17);
    expect(STUDIO_BG3D_TRIPO_GLB_CALIBRATION_CATALOG).toHaveLength(bg3dModels.length);

    for (const model of bg3dModels) {
      const placement = buildCalibratedTripoBg3dGlbPlacement(model.id);
      expect(placement.kind).toBe("glb");
      expect(placement.url).toBe(model.url);
      expect(placement.scale[0]).toBeGreaterThanOrEqual(1);
      expect(placement.position[1]).toBeGreaterThanOrEqual(0);

      const twinPrims = buildTripoBg3dProceduralTwinPrimitives(model.id);
      expect(twinPrims.length).toBe(1 + model.customizableParts.length);
      expect(twinPrims.every((p) => p.tags?.includes("tripo3d-bg-kit"))).toBe(true);
    }

    expect(STUDIO_BG3D_VARCO_GLB_CALIBRATION_CATALOG).toHaveLength(10);
    for (const varcoSpec of STUDIO_BG3D_VARCO_GLB_CALIBRATION_CATALOG) {
      const placement = buildCalibratedVarcoBg3dGlbPlacement(varcoSpec.assetId);
      expect(placement.kind).toBe("glb");
      expect(placement.url).toBe(varcoSpec.url);
      expect(placement.scale[0]).toBeGreaterThanOrEqual(0.9);
      expect(placement.position[1]).toBeGreaterThanOrEqual(0);
    }
  });

  it("builds multi-part detailed 3D geometry for all 21 VARCO 3D Korean webtoon props while keeping 1 anchor tag per prop", () => {
    expect(STUDIO_VARCO3D_WEBTOON_PROP_ASSETS).toHaveLength(21);

    for (const prop of STUDIO_VARCO3D_WEBTOON_PROP_ASSETS) {
      const parts = buildVarco3dPropDetailedPrimitives(prop, [1.5, -0.8]);
      expect(parts.length).toBeGreaterThanOrEqual(5);

      const anchorItems = parts.filter((item) => item.tags?.includes("varco3d-prop"));
      const detailItems = parts.filter((item) => item.tags?.includes("varco3d-prop-detail"));

      expect(anchorItems).toHaveLength(1);
      expect(detailItems.length).toBe(parts.length - 1);
      expect(anchorItems[0]!.tags).toContain(prop.id);
      expect(anchorItems[0]!.tags).toContain(prop.category);
    }
  });

  it("builds rich architectural cutaway stages for all 22 VARCO 3D isometric dioramas", () => {
    expect(STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES).toHaveLength(22);

    for (const diorama of STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES) {
      const stagePrims = buildVarco3dDioramaDetailedPrimitives(diorama, {
        competitorId: "acon3d-carpenstreet",
      });
      expect(stagePrims.length).toBeGreaterThanOrEqual(14);
      const baseShell = stagePrims.filter((p) => p.tags?.includes("varco3d-diorama"));
      const details = stagePrims.filter((p) => p.tags?.includes("varco3d-diorama-detail"));
      expect(baseShell).toHaveLength(3);
      expect(details.length).toBeGreaterThanOrEqual(11);
    }

    const summary = resolveReaDioramaSummaryKo(
      "diorama_school_hallway",
      ["prop_school_desk_chair", "prop_school_steel_lockers", "prop_convenience_snack_shelf"],
      "snaptoon-unreal-npr",
    );
    expect(summary.totalEstimatedPrimitives).toBeGreaterThan(30);
    expect(summary.totalEstimatedPrimitives).toBeLessThan(160);
  });
});
