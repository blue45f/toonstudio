import { describe, expect, it } from "vitest";

import { sha256HexPortable } from "../studio-sha256";

import {
  normalizeStudioBrushGrainSettings,
  resolveNormalizedStudioBrushFootprintGrainAlphaMultiplierAt,
  resolveNormalizedStudioBrushGrainAlphaMultiplierAt,
  serializeStudioBrushGrainSettingsCanonical,
  studioBrushGrainIsActive,
} from "./studio-brush-material-dynamics";
import {
  StudioBrushR8GrainRegistry,
  composeStudioBrushR8TipPaperAlphaMap,
} from "./studio-brush-r8-grain-runtime";

import type { NormalizedStudioBrushGrainSettings } from "./studio-brush-material-dynamics";
import type { StudioBrushTipAlphaMap } from "./studio-brush-tip-stamp";

const LEGACY = {
  space: "stroke-fixed",
  amount: 0.375,
  scale: 6.25,
  contrast: 0.5,
  seed: 73,
} as const;

describe("grain texture-section wiring (normalize)", () => {
  it("keeps legacy canonical bytes when texture is omitted or null", () => {
    const expected =
      "{\"space\":\"stroke-fixed\",\"amount\":0.375,\"scale\":6.25,\"contrast\":0.5,\"seed\":73}";
    expect(serializeStudioBrushGrainSettingsCanonical(LEGACY)).toBe(expected);
    expect(serializeStudioBrushGrainSettingsCanonical({ ...LEGACY, texture: null })).toBe(expected);
    expect(normalizeStudioBrushGrainSettings(LEGACY)).not.toHaveProperty("texture");
  });

  it("appends a normalized texture section after the legacy keys", () => {
    const normalized = normalizeStudioBrushGrainSettings({
      ...LEGACY,
      texture: { mode: "height", depth: 0.05, brightness: 2, invert: true },
    });
    expect(normalized.texture).toEqual({
      mode: "height",
      depth: 0.05,
      depthJitter: 0,
      minimumDepth: 0,
      brightness: 1,
      contrast: 0,
      invert: true,
    });
    expect(serializeStudioBrushGrainSettingsCanonical(normalized).startsWith(
      "{\"space\":\"stroke-fixed\",\"amount\":0.375,\"scale\":6.25,\"contrast\":0.5,\"seed\":73,\"texture\":",
    )).toBe(true);
  });

  it("injects the authored amount as depth when the section omits depth", () => {
    const normalized = normalizeStudioBrushGrainSettings({
      amount: 0.7,
      texture: { mode: "multiply" },
    });
    expect(normalized.texture?.depth).toBe(0.7);
  });

  it("treats a texture-only grain as active", () => {
    expect(studioBrushGrainIsActive({ amount: 0, texture: { mode: "height", depth: 0.4 } }))
      .toBe(true);
    expect(studioBrushGrainIsActive({ amount: 0 })).toBe(false);
  });
});

describe("grain texture-section wiring (procedural dab path)", () => {
  it("multiply-default texture renders exactly like legacy grain", () => {
    const legacy = normalizeStudioBrushGrainSettings({
      amount: 0.7, scale: 5.5, contrast: 0.65, seed: 73,
    });
    const wired = normalizeStudioBrushGrainSettings({
      amount: 0.7, scale: 5.5, contrast: 0.65, seed: 73,
      texture: { mode: "multiply" },
    });
    for (let index = 0; index < 24; index += 1) {
      const x = index * 3.7;
      const y = 11 + index * 1.3;
      expect(resolveNormalizedStudioBrushGrainAlphaMultiplierAt(x, y, 0, 0, 991, wired))
        .toBe(resolveNormalizedStudioBrushGrainAlphaMultiplierAt(x, y, 0, 0, 991, legacy));
      expect(resolveNormalizedStudioBrushFootprintGrainAlphaMultiplierAt(
        x, y, 13, 7, 0.4, 0, 0, 991, wired,
      )).toBe(resolveNormalizedStudioBrushFootprintGrainAlphaMultiplierAt(
        x, y, 13, 7, 0.4, 0, 0, 991, legacy,
      ));
    }
  });

  it("height mode leaves ink only where the pattern is a dark valley", () => {
    const legacy = normalizeStudioBrushGrainSettings({
      amount: 0.9, scale: 3.2, contrast: 0.8, seed: 41,
    });
    const height = normalizeStudioBrushGrainSettings({
      amount: 0.9, scale: 3.2, contrast: 0.8, seed: 41,
      texture: { mode: "height", depth: 0.05 },
    });
    // reach = 12 * (13/255) * 1 ≈ 0.612; pattern recovered from the legacy multiplier.
    let valleys = 0;
    let ridges = 0;
    for (let index = 0; index < 64; index += 1) {
      const x = index * 1.7;
      const y = 5 + index * 0.9;
      const multiplier = resolveNormalizedStudioBrushGrainAlphaMultiplierAt(x, y, 0, 0, 7, legacy);
      const pattern = 1 - (1 - multiplier) / 0.9;
      const combined = resolveNormalizedStudioBrushGrainAlphaMultiplierAt(x, y, 0, 0, 7, height);
      if (pattern > 0.612) {
        expect(combined).toBe(0);
        ridges += 1;
      } else if (pattern < 0.5) {
        expect(combined).toBeGreaterThan(0);
        valleys += 1;
      }
    }
    expect(valleys).toBeGreaterThan(0);
    expect(ridges).toBeGreaterThan(0);
  });

  it("depth jitter is deterministic per dab and stays inside the dab-depth range", () => {
    const settings = normalizeStudioBrushGrainSettings({
      amount: 0.9, scale: 3.2, contrast: 0.8, seed: 41,
      texture: { mode: "subtract", depth: 0.8, depthJitter: 0.9, minimumDepth: 0.25 },
    });
    const seen = new Set<number>();
    for (let dab = 0; dab < 16; dab += 1) {
      const value = resolveNormalizedStudioBrushGrainAlphaMultiplierAt(20, 15, 0, 0, 7, settings, dab);
      expect(resolveNormalizedStudioBrushGrainAlphaMultiplierAt(20, 15, 0, 0, 7, settings, dab))
        .toBe(value);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      seen.add(value);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("grain texture-section wiring (R8 dab composition)", () => {
  function uniformSampler(value: number) {
    const bytes = new Uint8Array(16).fill(value);
    const source = {
      kind: "r8-texture-v1",
      asset: {
        assetId: `uniform-${value}`,
        encodedSha256: `sha256:${"e".repeat(64)}`,
        decodedSha256: `sha256:${sha256HexPortable(bytes)}`,
        byteLength: 8,
        mediaType: "image/png",
        width: 4,
        height: 4,
        channel: "luminance",
        encoding: "r8-unorm",
      },
    };
    const registry = new StudioBrushR8GrainRegistry({ maxEntries: 2, maxBytes: 64 });
    expect(registry.hydrate(source, bytes).status).toBe("ready");
    return { registry, source, sampler: registry.resolve(source)! };
  }

  const tip: StudioBrushTipAlphaMap = {
    size: 2,
    alphas: new Float32Array([1, 1, 1, 1]),
    shape: "hard",
    softness: 0,
    custom: true,
    revision: "tip-uniform",
  };

  function compose(value: number, texture?: NormalizedStudioBrushGrainSettings["texture"]) {
    const { sampler } = uniformSampler(value);
    const grain = {
      space: "canvas-fixed",
      amount: 1,
      scale: 4,
      contrast: 0,
      seed: 1,
      source: sampler.source,
      ...(texture ? { texture } : {}),
    } satisfies NormalizedStudioBrushGrainSettings;
    return composeStudioBrushR8TipPaperAlphaMap({
      tip, sampler, grain,
      centerX: 10, centerY: 20, radiusX: 4, radiusY: 2, angleRadians: 0,
      strokeOriginX: 10, strokeOriginY: 20, strokeSeed: 71,
    });
  }

  it("height over a bright R8 ridge leaves no ink; over a dark valley it leaves ink", () => {
    const texture = normalizeStudioBrushGrainSettings({
      texture: { mode: "height", depth: 0.05 },
    }).texture;
    const bright = compose(230, texture);
    expect(bright).not.toBeNull();
    expect([...bright!.alphas]).toEqual([0, 0, 0, 0]);
    const dark = compose(30, texture);
    expect(dark).not.toBeNull();
    expect(dark!.alphas[0]).toBeCloseTo(12 * (13 / 255) - 30 / 255, 6);
    expect([...dark!.alphas].every((alpha) => alpha > 0)).toBe(true);
  });

  it("texture-less R8 composition is unchanged (legacy multiply of the sampler)", () => {
    const plain = compose(30);
    expect(plain).not.toBeNull();
    // amount 1, contrast 0: multiplier = sampled pattern value 30/255.
    expect(plain!.alphas[0]).toBeCloseTo(30 / 255, 6);
  });
});
