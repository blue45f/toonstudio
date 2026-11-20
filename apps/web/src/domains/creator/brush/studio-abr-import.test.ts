import { describe, expect, it } from "vitest";

import { decodeStudioBrushTipAlphaMapBase64 } from "./studio-brush-tip-stamp";
import {
  STUDIO_ABR_IMPORT_LIMITS,
  StudioAbrImportError,
  assertStudioAbrEnvelope,
  convertStudioAbrDocument,
  convertStudioAbrSampleToTip,
} from "../studio-abr-import";

import type { Abr, Brush, SampleInfo } from "ag-psd";

function sampledBrush(name: string, sampleId: string): Brush {
  return {
    name,
    shape: {
      type: "sampled",
      name,
      size: 42,
      angle: 18,
      roundness: 0.62,
      spacingOn: true,
      spacing: 0.24,
      flipX: false,
      flipY: false,
      sampledData: sampleId,
    },
    shapeDynamics: {
      sizeDynamics: { control: "pen pressure", steps: 0, jitter: 0, minimum: 0.2 },
      minimumDiameter: 0.2,
      tiltScale: 1,
      angleDynamics: { control: "pen tilt", steps: 0, jitter: 0.5, minimum: 0 },
      roundnessDynamics: { control: "off", steps: 0, jitter: 0, minimum: 0 },
      minimumRoundness: 0.2,
      flipX: false,
      flipY: false,
      brushProjection: false,
    },
    transfer: {
      flowDynamics: { control: "pen pressure", steps: 0, jitter: 0, minimum: 0.15 },
      opacityDynamics: { control: "pen pressure", steps: 0, jitter: 0, minimum: 0.25 },
      wetnessDynamics: { control: "off", steps: 0, jitter: 0, minimum: 0 },
      mixDynamics: { control: "off", steps: 0, jitter: 0, minimum: 0 },
    },
    spacing: 0.24,
    noise: false,
    wetEdges: false,
    useBrushSize: true,
    toolOptions: {
      type: "brush",
      brushPreset: true,
      flow: 0.7,
      smooth: 20,
      mode: "normal",
      opacity: 0.8,
      smoothing: true,
      smoothingValue: 40,
      smoothingRadiusMode: false,
      smoothingCatchup: true,
      smoothingCatchupAtEnd: true,
      smoothingZoomCompensation: true,
      pressureSmoothing: true,
      usePressureOverridesSize: true,
      usePressureOverridesOpacity: true,
      useLegacy: false,
    },
  };
}

function computedBrush(name: string): Brush {
  return {
    name,
    shape: {
      type: "computed",
      size: 16,
      angle: -25,
      roundness: 0.35,
      hardness: 0.94,
      spacingOn: true,
      spacing: 0.12,
      flipX: false,
      flipY: false,
    },
    spacing: 0.12,
    noise: false,
    wetEdges: false,
    useBrushSize: true,
  };
}

function sample(id = "sample-1", width = 4, height = 2): SampleInfo {
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) alpha[y * width + x] = x >= 1 && x <= 2 ? 255 : 0;
  }
  return { id, bounds: { x: 0, y: 0, w: width, h: height }, alpha };
}

describe("Studio ABR envelope and sample conversion", () => {
  it("accepts modern big-endian ABR versions and rejects legacy or oversized payloads", () => {
    for (const version of [6, 7, 9, 10]) {
      assertStudioAbrEnvelope(Uint8Array.of(0, version, 0, 1));
    }
    expect(() => assertStudioAbrEnvelope(Uint8Array.of(0, 2, 0, 1)))
      .toThrowError(StudioAbrImportError);
    expect(() => assertStudioAbrEnvelope(new Uint8Array(STUDIO_ABR_IMPORT_LIMITS.maxBytes + 1)))
      .toThrowError(/32MB/u);
  });

  it("letterboxes rectangular samples and emits a bounded square alpha payload", () => {
    const result = convertStudioAbrSampleToTip(sample());
    expect(result.alphaMapSize).toBe(8);
    const alpha = decodeStudioBrushTipAlphaMapBase64(result.alphaMapBase64)!;
    expect(alpha).toHaveLength(64);
    expect(Math.max(...alpha)).toBe(255);
    expect(alpha.slice(0, 8)).toEqual(new Uint8Array(8));
  });
});

describe("Studio ABR document conversion", () => {
  it("maps sampled tips, dimensions, pressure, opacity, flow, angle and smoothing", () => {
    const result = convertStudioAbrDocument({
      brushes: [sampledBrush("잉크 ABR", "SAMPLE-1")],
      samples: [sample("sample-1")],
      patterns: [],
    });
    expect(result).toMatchObject({
      sourceBrushCount: 1,
      sourceSampleCount: 1,
      skippedBrushCount: 0,
    });
    const candidate = result.brushes[0]!;
    expect(candidate.name).toBe("잉크 ABR");
    expect(candidate.sourceSampleId).toBe("sample-1");
    expect(candidate.snapshot).toMatchObject({
      brushId: "ink-particle",
      strokeWidth: 42,
      brushOpacity: 0.8,
      stabilizer: 4,
      postCorrection: 2,
      tipAngle: 18,
      tipRoundness: 0.62,
    });
    expect(candidate.snapshot.brushDynamics.tip.alphaMapBase64).toBeTruthy();
    expect(candidate.snapshot.brushDynamics.width.mappings[0]).toMatchObject({
      source: "pressure",
      from: 0.2,
      to: 1,
    });
    expect(candidate.snapshot.brushDynamics.opacity.mappings[0]?.source).toBe("pressure");
    expect(candidate.snapshot.brushDynamics.flow.mappings[0]?.source).toBe("pressure");
    expect(candidate.snapshot.brushDynamics.angle.mappings[0]?.source).toBe("tilt-magnitude");
  });

  it("keeps computed brushes with a procedural hard tip and skips missing sampled data", () => {
    const document: Abr = {
      brushes: [computedBrush("하드 원형"), sampledBrush("누락", "absent")],
      samples: [],
      patterns: [],
    };
    const result = convertStudioAbrDocument(document);
    expect(result.brushes).toHaveLength(1);
    expect(result.skippedBrushCount).toBe(1);
    expect(result.brushes[0]?.snapshot.brushDynamics.tip).toMatchObject({
      shape: "hard",
      alphaMapBase64: null,
    });
  });

  it("rejects aggregate sample dimensions before converting brushes", () => {
    const oversized = sample("too-large", STUDIO_ABR_IMPORT_LIMITS.maxSamplePixels + 1, 1);
    const document = { brushes: [sampledBrush("큰 촉", "too-large")], samples: [oversized], patterns: [] };
    expect(() => convertStudioAbrDocument(document)).toThrowError(/안전 처리 한도/u);
  });

  it("raises tip resolution to 512~1024px with R8 MIP pyramid and raises width cap to 500px", () => {
    const hiResSample = sample("tip-512", 512, 512);
    const tip = convertStudioAbrSampleToTip(hiResSample);
    expect(STUDIO_ABR_IMPORT_LIMITS.outputTipMax).toBe(1024);
    expect(STUDIO_ABR_IMPORT_LIMITS.maxStrokeWidth).toBe(500);
    expect(tip.alphaMapSize).toBe(512);
    expect(tip.documentAlphaMapSize).toBe(64);
    expect(tip.mipLevels.map((lvl) => lvl.size)).toEqual([512, 256, 128, 64]);

    const wideBrush = sampledBrush("대형 브러시", "tip-512");
    wideBrush.shape.size = 420;
    const result = convertStudioAbrDocument({
      brushes: [wideBrush],
      samples: [hiResSample],
      patterns: [],
    });
    const candidate = result.brushes[0]!;
    expect(candidate.snapshot.strokeWidth).toBe(420);
    expect(candidate.snapshot.brushDynamics.width.base).toBe(420);
    expect(candidate.snapshot.brushDynamics.tip.alphaMapBase64).toBeTruthy();
    expect(candidate.snapshot.brushDynamics.tip.alphaMapSize).toBe(64);
    expect(candidate.highResTip?.alphaMapSize).toBe(512);
    expect(candidate.highResTip?.mipLevels).toHaveLength(4);
  });

  it("preserves Photopea ABR descriptors (dualBrush, useTexture, useColorDynamics, Wtdg, Transfer, Scatter, BrushPose)", () => {
    const primary = sample("primary-tip", 64, 64);
    const secondary = sample("dual-tip", 32, 32);
    const fullBrush: Brush = {
      ...sampledBrush("Photopea Full Parity", "primary-tip"),
      wetEdges: true,
      scatter: {
        bothAxes: true,
        count: 3,
        scatterDynamics: { control: "pen pressure", steps: 0, jitter: 0.45, minimum: 0.1 },
        countDynamics: { control: "off", steps: 0, jitter: 0.2, minimum: 0 },
      },
      texture: {
        id: "tex-paper",
        name: "Watercolor Paper",
        invert: true,
        scale: 1.5,
        brightness: 10,
        contrast: 35,
        blendMode: "height" as unknown as Brush["texture"] extends { blendMode: infer B } ? B : never,
        depth: 0.78,
        depthMinimum: 0.15,
        depthDynamics: { control: "pen pressure", steps: 0, jitter: 0.25, minimum: 0.15 },
        textureEachTip: true,
      },
      dualBrush: {
        flip: false,
        shape: {
          type: "sampled",
          name: "Dual Tip",
          size: 21,
          angle: 0,
          roundness: 1,
          spacingOn: true,
          spacing: 0.2,
          flipX: false,
          flipY: false,
          sampledData: "dual-tip",
        },
        blendMode: "multiply",
        useScatter: false,
        spacing: 0.2,
        count: 1,
        bothAxes: false,
        countDynamics: { control: "off", steps: 0, jitter: 0, minimum: 0 },
        scatterDynamics: { control: "off", steps: 0, jitter: 0, minimum: 0 },
      },
      colorDynamics: {
        foregroundBackground: { control: "pen pressure", steps: 0, jitter: 0.4, minimum: 0.2 },
        hue: 0.25,
        saturation: 0.3,
        brightness: 0.15,
        purity: 0,
        perTip: false,
      },
      brushPose: {
        overrideAngle: true,
        overrideTiltX: true,
        overrideTiltY: true,
        overridePressure: true,
        pressure: 0.65,
        tiltX: 20,
        tiltY: -15,
        angle: 35,
      },
    };
    const result = convertStudioAbrDocument({
      brushes: [fullBrush],
      samples: [primary, secondary],
      patterns: [],
    });
    const candidate = result.brushes[0]!;
    expect(candidate.approximatedFeatures).toEqual([]);
    expect(candidate.snapshot.brushDynamics.dualBrush).toMatchObject({
      enabled: true,
      blendMode: "multiply",
      sizeRatio: 0.5,
    });
    expect(candidate.snapshot.brushDynamics.grain).toMatchObject({
      space: "stroke-fixed",
      amount: 0.78,
      texture: {
        mode: "height",
        depth: 0.78,
        depthJitter: 0.25,
        minimumDepth: 0.15,
        invert: true,
        depthControl: { source: "pressure" },
      },
    });
    expect(candidate.snapshot.brushDynamics.colorDynamics).toMatchObject({
      foregroundBackgroundMix: 0.2,
      foregroundBackgroundJitter: 0.4,
      hueJitter: 45,
      saturationJitter: 0.3,
      valueJitter: 0.15,
    });
    expect(candidate.snapshot.brushDynamics.cspBrushExtensions?.strokeColorAndScale.perStrokeColorJitter).toBe(true);
    expect(candidate.snapshot.enginePrograms?.watercolor?.wetEdgeBloomProgramId).toBe("edge-bloom");
    expect(candidate.snapshot.tipAngle).toBe(35);
    expect(candidate.snapshot.brushDynamics.fallbackPressure).toBe(0.65);
    expect(candidate.snapshot.brushDynamics.scatterRatio).toBeCloseTo(0.9, 5);
    expect(candidate.program?.mixing.kind).toBe("wet");
    expect(candidate.descriptors).toMatchObject({
      hasDualBrush: true,
      hasTexture: true,
      hasColorDynamics: true,
      wetEdges: true,
      hasScatter: true,
      hasBrushPose: true,
      hasTransfer: true,
    });
  });
});
