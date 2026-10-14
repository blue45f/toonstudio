import { describe, expect, it } from "vitest";

import {
  applyStudioBrushTextureV1,
  normalizeStudioBrushTextureSettingsV1,
  studioBrushTextureIsActiveV1,
} from "../brush/studio-brush-texture-combine-v1";
import {
  bakeStudioBrushPatternR8GrainTileV1,
  sampleStudioBrushPatternFieldV1,
} from "../brush/studio-brush-pattern-r8-grain-assets";
import {
  StudioBrushR8GrainRegistry,
  composeStudioBrushR8TipPaperAlphaMap,
} from "../brush/studio-brush-r8-grain-runtime";

import { BRUSH_STUDIO_V6_RECIPE_SEEDS } from "./brush-studio-v6-recipe-catalog";
import {
  BRUSH_STUDIO_V6_TEXTURE_RECIPE_GROUP,
  BRUSH_STUDIO_V6_TEXTURE_RECIPE_SEEDS,
  BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS,
  brushStudioV6TextureRecipeGrainSettings,
  brushStudioV6TextureRecipeSpec,
  composeBrushStudioV6TextureRecipePreviewV1,
} from "./brush-studio-v6-recipe-catalog-texture";
import {
  createBrushStudioV6Program,
  normalizeBrushStudioV6Program,
} from "./brush-studio-v6-engine";

import type { StudioBrushTipAlphaMap } from "../brush/studio-brush-tip-stamp";

const EXPECTED_IDS = [
  "texture-chalk",
  "texture-canvas-oil",
  "texture-halftone-tone",
  "texture-rough-charcoal",
  "texture-fibre-pencil",
  "texture-granule-wash",
] as const;

describe("texture default brush preset set — seeds & specs", () => {
  it("ships the six named texture presets in the 텍스처 group", () => {
    expect(BRUSH_STUDIO_V6_TEXTURE_RECIPE_SEEDS.map((seed) => seed.id)).toEqual([...EXPECTED_IDS]);
    for (const seed of BRUSH_STUDIO_V6_TEXTURE_RECIPE_SEEDS) {
      expect(seed.group).toBe(BRUSH_STUDIO_V6_TEXTURE_RECIPE_GROUP);
      expect(seed.label.length).toBeGreaterThan(0);
      expect(seed.description.length).toBeGreaterThan(0);
    }
  });

  it("keeps seeds and texture specs in exact 1:1 correspondence", () => {
    expect(BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS.map((spec) => spec.recipeId)).toEqual([
      ...EXPECTED_IDS,
    ]);
    for (const spec of BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS) {
      expect(brushStudioV6TextureRecipeSpec(spec.recipeId)).toBe(spec);
      // depth is authored explicitly — the resolver never relies on amount injection.
      expect(typeof spec.texture.depth).toBe("number");
      expect(spec.texture.depth!).toBeGreaterThan(0);
    }
    expect(brushStudioV6TextureRecipeSpec("texture-unknown")).toBeNull();
    expect(brushStudioV6TextureRecipeGrainSettings("texture-unknown")).toBeNull();
  });

  it("registers the presets in the full catalog without id collisions", () => {
    const ids = BRUSH_STUDIO_V6_RECIPE_SEEDS.map((seed) => seed.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of EXPECTED_IDS) expect(ids).toContain(id);
  });

  it("uses only engine node ids that survive program normalization unchanged", () => {
    for (const seed of BRUSH_STUDIO_V6_TEXTURE_RECIPE_SEEDS) {
      const created = createBrushStudioV6Program(seed.id);
      const normalized = normalizeBrushStudioV6Program(created);
      // An unknown slot id would be silently replaced by normalize — equality
      // with the created program proves every authored slot id is real.
      expect(normalized.slots).toEqual(created.slots);
      expect(normalized.tuning).toEqual(created.tuning);
    }
  });
});

describe("texture default brush preset set — grain wiring", () => {
  it("normalizes every spec losslessly onto the pattern tile + texture section", () => {
    for (const spec of BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS) {
      const grain = brushStudioV6TextureRecipeGrainSettings(spec.recipeId);
      expect(grain).not.toBeNull();
      const bake = bakeStudioBrushPatternR8GrainTileV1(spec.patternStyleId);
      expect(grain!.source).toEqual(bake.source);
      expect(grain!.space).toBe(spec.grainSpace);
      expect(grain!.scale).toBe(spec.grainScale);
      expect(grain!.contrast).toBe(spec.grainContrast);
      expect(grain!.seed).toBe(spec.grainSeed);
      expect(grain!.amount).toBe(spec.texture.depth);
      // The authored texture section round-trips normalization unchanged —
      // no value was clamped or dropped on the way into the stroke path.
      expect(grain!.texture).toEqual(normalizeStudioBrushTextureSettingsV1(spec.texture));
      expect(grain!.texture!.mode).toBe(spec.texture.mode);
      expect(studioBrushTextureIsActiveV1(grain!.texture!)).toBe(true);
    }
  });

  it("covers the combine modes and pattern styles the set promises", () => {
    const modes = new Set(BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS.map((spec) => spec.texture.mode));
    expect(modes).toEqual(new Set(["height", "overlay", "linear-height", "subtract"]));
    const styles = new Set(BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS.map((spec) => spec.patternStyleId));
    expect(styles).toEqual(new Set(["noise", "canvas-weave", "halftone-dots", "paper-fibre"]));
  });
});

describe("texture default brush preset set — preview equals stroke", () => {
  it("preview dab matches a hand-driven stroke compose texel-for-texel", () => {
    for (const spec of BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS) {
      const preview = composeBrushStudioV6TextureRecipePreviewV1(spec.recipeId, { size: 32 });
      expect(preview).not.toBeNull();

      const grain = brushStudioV6TextureRecipeGrainSettings(spec.recipeId)!;
      const bake = bakeStudioBrushPatternR8GrainTileV1(spec.patternStyleId);
      const registry = new StudioBrushR8GrainRegistry();
      expect(registry.hydrate(bake.source, bake.decodedBytes).status).toBe("ready");
      const sampler = registry.resolve(bake.source)!;
      const tip: StudioBrushTipAlphaMap = {
        size: 32,
        alphas: new Float32Array(32 * 32).fill(1),
        shape: "round",
        softness: 0,
        custom: true,
        revision: `texture-recipe-preview:${spec.recipeId}:32:1`,
      };
      const stroke = composeStudioBrushR8TipPaperAlphaMap({
        tip,
        sampler,
        grain,
        centerX: 16,
        centerY: 16,
        radiusX: 16,
        radiusY: 16,
        angleRadians: 0,
        strokeOriginX: 0,
        strokeOriginY: 0,
        strokeSeed: spec.grainSeed,
        dabIndex: 0,
      });
      expect(stroke).not.toBeNull();
      expect(preview!.alphas).toEqual(stroke!.alphas);
      expect(preview!.revision).toBe(stroke!.revision);
    }
  });

  it("height presets leave the pattern peaks empty and ink the valleys", () => {
    // texture-chalk: height reach = 12 · depth(≈0.06) · coverage(1) ≈ 0.72, so a
    // texel survives only where the levelled pattern stays below the reach.
    const spec = brushStudioV6TextureRecipeSpec("texture-chalk")!;
    const texture = normalizeStudioBrushTextureSettingsV1(spec.texture);
    const bright = applyStudioBrushTextureV1(texture, 1, 0.95, spec.grainSeed, 0);
    const dark = applyStudioBrushTextureV1(texture, 1, 0.1, spec.grainSeed, 0);
    expect(bright).toBe(0);
    expect(dark).toBeGreaterThan(0.4);

    const preview = composeBrushStudioV6TextureRecipePreviewV1("texture-chalk", { size: 48 })!;
    let zero = 0;
    let positive = 0;
    for (const alpha of preview.alphas) {
      if (alpha === 0) zero += 1;
      else if (alpha > 0) positive += 1;
    }
    // The chalk texture must actually break coverage both ways — a flat
    // preview would mean the pattern never reached the combine module.
    expect(zero).toBeGreaterThan(0);
    expect(positive).toBeGreaterThan(0);
  });

  it("halftone preview inks only dot centres at the height reach, background stays 0", () => {
    const preview = composeBrushStudioV6TextureRecipePreviewV1("texture-halftone-tone", {
      size: 48,
    })!;
    // reach = 12 · (round(0.07·255)/255) ≈ 0.847 — no texel may exceed it,
    // and the dot field must produce both inked centres and empty background.
    let sawZero = false;
    let max = 0;
    for (const alpha of preview.alphas) {
      expect(alpha).toBeLessThanOrEqual(0.85);
      if (alpha === 0) sawZero = true;
      if (alpha > max) max = alpha;
    }
    expect(sawZero).toBe(true);
    expect(max).toBeGreaterThan(0.5);
  });

  it("dab depth jitter varies the chalk texture between dabs but stays deterministic", () => {
    const first = composeBrushStudioV6TextureRecipePreviewV1("texture-chalk", {
      size: 32,
      dabIndex: 0,
    })!;
    const again = composeBrushStudioV6TextureRecipePreviewV1("texture-chalk", {
      size: 32,
      dabIndex: 0,
    })!;
    const other = composeBrushStudioV6TextureRecipePreviewV1("texture-chalk", {
      size: 32,
      dabIndex: 7,
    })!;
    expect(first.alphas).toEqual(again.alphas);
    expect(first.alphas).not.toEqual(other.alphas);
  });

  it("pattern field sampling agrees with the baked tile the stroke reads", () => {
    // The preview/stroke identity rests on the tile being the field, quantized.
    for (const spec of BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS) {
      const bake = bakeStudioBrushPatternR8GrainTileV1(spec.patternStyleId);
      for (const [x, y] of [[3, 5], [100, 40], [255, 255], [17, 200]] as const) {
        const field = sampleStudioBrushPatternFieldV1(spec.patternStyleId, x + 0.5, y + 0.5, 256);
        expect(bake.decodedBytes[y * 256 + x]).toBe(Math.round(field * 255));
      }
    }
  });

  it("returns null for unknown recipes instead of a fallback texture", () => {
    expect(composeBrushStudioV6TextureRecipePreviewV1("texture-unknown")).toBeNull();
  });
});
