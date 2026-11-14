import { describe, it, expect } from "vitest";

import {
  SHAPER_ARCHETYPE_CATALOG,
  SHAPER_CEL_SHADING_PRESETS,
  SHAPER_HAIR_SILHOUETTES,
  SHAPER_OUTFIT_SETS,
  Studio3DShaperToonMaker,
  buildShaperCharacterMannequinPrimitives,
  createDefaultShaperCustomizerState,
} from "./studio-3d-shaper-toon-maker";

describe("Studio3DShaperToonMaker", () => {
  it("initializes with default shonen archetype and standard styling slots", () => {
    const maker = new Studio3DShaperToonMaker();
    expect(maker.getArchetype()).toBe("shonen-hero-8head");
    expect(maker.getStyling().hairstyleId).toBe("short-messy-hero");
    expect(maker.getStyling().outfitId).toBe("korean-school-uniform-v1");
  });

  it("evaluates archetype proportions accurately across all 11 webtoon archetypes", () => {
    expect(SHAPER_ARCHETYPE_CATALOG).toHaveLength(11);
    expect(SHAPER_HAIR_SILHOUETTES).toHaveLength(6);
    expect(SHAPER_OUTFIT_SETS).toHaveLength(6);
    expect(SHAPER_CEL_SHADING_PRESETS).toHaveLength(4);

    const heroMaker = new Studio3DShaperToonMaker("shonen-hero-8head");
    const heroProp = heroMaker.evaluateArchetypeProportions();
    expect(heroProp.legLengthRatio).toBeGreaterThan(0.55);
    expect(heroProp.headScale[0]).toBeLessThan(1.0);

    const chibiMaker = new Studio3DShaperToonMaker("sd-chibi-4head");
    const chibiProp = chibiMaker.evaluateArchetypeProportions();
    expect(chibiProp.headScale[0]).toBe(1.8);
    expect(chibiProp.legLengthRatio).toBe(0.42);

    for (const item of SHAPER_ARCHETYPE_CATALOG) {
      const m = new Studio3DShaperToonMaker(item.id);
      const prop = m.evaluateArchetypeProportions();
      expect(prop.limbLengthFactor).toBeGreaterThan(0.5);
      expect(prop.shoulderWidthFactor).toBeGreaterThan(0.6);
    }
  });

  it("builds proportional 3D character mannequin primitives from continuous customizer sliders", () => {
    const dukeState = {
      ...createDefaultShaperCustomizerState("northern-duke-85head"),
      headRatio: 8.5,
      hairSilhouetteId: "rofan-long-wave" as const,
      outfitSetId: "northern-duke-cape" as const,
    };
    const dukeScene = buildShaperCharacterMannequinPrimitives(dukeState);
    expect(dukeScene.primitives.length).toBeGreaterThanOrEqual(14);
    expect(dukeScene.summaryKo).toContain("8.5등신");
    expect(dukeScene.summaryKo).toContain("로판 롱웨이브");
    expect(dukeScene.summaryKo).toContain("북부대공 하프케이프");

    const chibiState = createDefaultShaperCustomizerState("sd-chibi-4head");
    const chibiScene = buildShaperCharacterMannequinPrimitives(chibiState);
    const dukeHeadY = dukeScene.primitives.find((p) => p.id.endsWith("-head"))?.position[1] ?? 0;
    const chibiHeadY = chibiScene.primitives.find((p) => p.id.endsWith("-head"))?.position[1] ?? 0;
    expect(dukeHeadY).toBeGreaterThan(chibiHeadY);
  });

  it("evaluates 3D surface ink world positions via barycentric interpolation", () => {
    const maker = new Studio3DShaperToonMaker();

    const vertices = new Float32Array([
      0, 0, 0,
      10, 0, 0,
      0, 10, 0,
    ]);
    const indices = new Uint32Array([0, 1, 2]);

    const stroke = {
      id: "stroke-1",
      targetMeshId: "character-face",
      colorHex: "#ff0000",
      width: 2,
      opacity: 1,
      points: [
        {
          triangleIndex: 0,
          barycentric: [0.5, 0.5, 0.0] as const,
          pressure: 1,
          localOffset: 0,
        },
        {
          triangleIndex: 0,
          barycentric: [0.3333, 0.3333, 0.3334] as const,
          pressure: 0.8,
          localOffset: 0,
        },
      ],
    };

    const worldPts = maker.evaluateStrokeWorldPositions(stroke, vertices, indices);
    expect(worldPts.length).toBe(2);
    expect(worldPts[0]![0]).toBeCloseTo(5.0, 3);
    expect(worldPts[0]![1]).toBeCloseTo(0.0, 3);
    expect(worldPts[1]![0]).toBeCloseTo(3.333, 2);
    expect(worldPts[1]![1]).toBeCloseTo(3.333, 2);
  });
});
