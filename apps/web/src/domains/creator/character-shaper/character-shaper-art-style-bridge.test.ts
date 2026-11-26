import { readFileSync } from "node:fs";
import path from "node:path";

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  ART_STYLE_PACKS,
  artStylePack,
  applyShadeTintToHex,
  buildShaperMtoonSettingsFromArtStylePack,
  resolveShaper27ChannelPalette,
  rgbTupleToHex,
  summarizeArtStylePackKo,
} from "./character-shaper-art-style-bridge";
import { applyShaperMtoonUniformsToVrm } from "./character-shaper-mtoon-uniforms";

import type { CharacterRecipeColors } from "./character-shaper-contract";

const HEX_RE = /^#[0-9a-f]{6}$/u;

function makeFakeVrm() {
  const mat = Object.assign(new THREE.MeshBasicMaterial({ name: "BodyMToon" }), {
    isMToonMaterial: true,
    shadingToonyFactor: 0.9,
    shadingShiftFactor: -0.05,
    parametricRimLiftFactor: 0.1,
    parametricRimFresnelPowerFactor: 4,
    rimLightingMixFactor: 0.4,
    outlineWidthFactor: 0.002,
    outlineLightingMixFactor: 0.5,
    shadeColorFactor: new THREE.Color("#d0b0a0"),
    parametricRimColorFactor: new THREE.Color("#ffffff"),
    outlineColorFactor: new THREE.Color("#1c1917"),
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  mesh.name = "TS_Body";
  const scene = new THREE.Group();
  scene.add(mesh);
  return { scene, mat };
}

describe("character-shaper-art-style-bridge", () => {
  it("converts all 8 T1 art-style packs into valid MToon settings and applies cleanly to Three.js VRM", () => {
    expect(ART_STYLE_PACKS).toHaveLength(8);

    for (const pack of ART_STYLE_PACKS) {
      const settings = buildShaperMtoonSettingsFromArtStylePack(pack, {
        skinHex: "#f3d3bd",
        hairHex: "#2b1d16",
      });
      expect(settings.shaderMode).toBe("toon");
      expect(settings.shadePos).toBeGreaterThanOrEqual(0.2);
      expect(settings.shadePos).toBeLessThanOrEqual(0.8);
      expect(settings.shadeWidth).toBeGreaterThanOrEqual(0.04);
      expect(settings.shadeWidth).toBeLessThanOrEqual(0.92);
      expect(settings.outlineScale).toBeGreaterThanOrEqual(0.4);
      expect(settings.outlineScale).toBeLessThanOrEqual(2.2);
      expect(settings.shadeColorHex).toMatch(HEX_RE);
      expect(settings.outlineColorHex).toMatch(HEX_RE);
      if (pack.toon.rim) {
        expect(settings.rimColorHex).toMatch(HEX_RE);
      } else {
        expect(settings.rimColorHex).toBeNull();
      }

      const vrm = makeFakeVrm();
      const result = applyShaperMtoonUniformsToVrm({ scene: vrm.scene }, settings);
      expect(result.updatedMaterials).toBe(1);
      expect(Number.isFinite(vrm.mat.shadingToonyFactor)).toBe(true);
      expect(Number.isFinite(vrm.mat.outlineWidthFactor)).toBe(true);
      expect(summarizeArtStylePackKo(pack)).toContain("등신");
    }

    // Specific pack semantics: shounen-ink uses fixed black thick outline (6.5mm -> 1.63x), webtoon-action enables cool rim
    const shounen = buildShaperMtoonSettingsFromArtStylePack(artStylePack("jp-shounen-ink"));
    expect(shounen.outlineColorHex).toBe("#000000");
    expect(shounen.outlineScale).toBeGreaterThan(1.5);
    expect(shounen.outlinePressure).toBe(true);

    const action = buildShaperMtoonSettingsFromArtStylePack(artStylePack("kr-webtoon-action"));
    expect(action.rimColorHex).toBe(rgbTupleToHex([0.55, 0.7, 1]));
  });

  it("applies multiply and OKLab shade tints accurately without NaN", () => {
    expect(applyShadeTintToHex("#ffffff", { kind: "multiply", rgb: [0.5, 0.25, 0] })).toBe("#804000");
    const oklabHex = applyShadeTintToHex("#f3d3bd", { kind: "oklab", dL: -0.22, dHueDeg: -20, chroma: 1.0 });
    expect(oklabHex).toMatch(HEX_RE);
    expect(oklabHex).not.toBe("#f3d3bd");
  });

  it("resolves all 27 OKLab channels from CharacterRecipeColors and recommends deterministic hair-tip", () => {
    const colors: CharacterRecipeColors = {
      skin: "#f3d3bd",
      hairBase: "#3b2820",
      hairTip: null,
      iris: "#2b4d88",
      top: "#557799",
      bottom: "#282e38",
      shoes: "#1c1c20",
    };
    const harmony = resolveShaper27ChannelPalette(colors, "kr-webtoon-romance");
    expect(Object.keys(harmony.resolved)).toHaveLength(27);
    expect(harmony.recommendedHairTipHex).toMatch(HEX_RE);
    expect(harmony.recommendedHairTipHex).not.toBe("#3b2820");
    expect(harmony.resolved["hair-tip"]).toBe(harmony.recommendedHairTipHex);
    expect(harmony.groups.map((g) => g.id)).toEqual(["face", "hair", "wardrobe"]);

    // Explicit hairTip overrides resolved channel while keeping pure recommendation available
    const withExplicitTip = resolveShaper27ChannelPalette({ ...colors, hairTip: "#e699b8" }, "kr-webtoon-romance");
    expect(withExplicitTip.resolved["hair-tip"]).toBe("#e699b8");
    expect(withExplicitTip.recommendedHairTipHex).toBe(harmony.recommendedHairTipHex);
  });

  it("imports zero files from apps/character-lab directly", () => {
    const dir = import.meta.dirname;
    for (const file of ["character-shaper-art-style-bridge.ts", "CharacterShaperArtStyleSection.tsx"]) {
      const source = readFileSync(path.join(dir, file), "utf8");
      expect(source).not.toMatch(/from\s+["'][^"']*character-lab/u);
      expect(source).not.toMatch(/import\(\s*["'][^"']*character-lab/u);
    }
  });
});
