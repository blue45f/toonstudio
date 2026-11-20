import { describe, expect, it } from "vitest";

import {
  applyFalloffEasing,
  evaluateBlendSpine,
  evaluateFalloffStrength,
  evaluatePatternDuplicator,
  expandBlendOrDuplicatorToEditableItems,
  hashDeterministicFloat,
  interpolateOklchRgba,
  linearRgbaToOklch,
  measureSpineArcLength,
  oklchToLinearRgba,
  replaceBlendSpine,
  resamplePolylineByArcLength,
  sampleSpineAtFraction,
  type BlendShapeKey,
  type BlendSpineConfig,
  type DuplicatorSymbolRef,
  type LinearRgbaColor,
  type SpineCurve,
} from "./studio-blend-spine-duplicator";

const WARM_RED: LinearRgbaColor = { r: 0.9, g: 0.15, b: 0.1, a: 1 };
const COOL_BLUE: LinearRgbaColor = { r: 0.1, g: 0.35, b: 0.92, a: 1 };

function makeTriangle(cx: number, cy: number, radius: number): BlendShapeKey {
  return {
    id: "tri",
    points: [
      { x: cx, y: cy - radius },
      { x: cx + radius * Math.cos(Math.PI / 6), y: cy + radius * Math.sin(Math.PI / 6) },
      { x: cx - radius * Math.cos(Math.PI / 6), y: cy + radius * Math.sin(Math.PI / 6) },
    ],
    closed: true,
    fill: WARM_RED,
    stroke: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
    strokeWidthPx: 2,
    opacity: 1,
  };
}

function makeSquare(cx: number, cy: number, half: number): BlendShapeKey {
  return {
    id: "sq",
    points: [
      { x: cx - half, y: cy - half },
      { x: cx + half, y: cy - half },
      { x: cx + half, y: cy + half },
      { x: cx - half, y: cy + half },
    ],
    closed: true,
    fill: COOL_BLUE,
    stroke: { r: 0.2, g: 0.2, b: 0.25, a: 1 },
    strokeWidthPx: 6,
    opacity: 0.6,
  };
}

const SAMPLE_SYMBOL_A: DuplicatorSymbolRef = {
  symbolId: "link-a",
  localPoints: [
    { x: -10, y: -4 },
    { x: 10, y: -4 },
    { x: 10, y: 4 },
    { x: -10, y: 4 },
  ],
  closed: true,
  baseFill: WARM_RED,
  strokeWidthPx: 1.5,
};

const SAMPLE_SYMBOL_B: DuplicatorSymbolRef = {
  symbolId: "link-b",
  localPoints: [
    { x: -6, y: -6 },
    { x: 6, y: -6 },
    { x: 6, y: 6 },
    { x: -6, y: 6 },
  ],
  closed: true,
  baseFill: COOL_BLUE,
  strokeWidthPx: 2,
};

describe("studio-blend-spine-duplicator", () => {
  it("OKLCH 왕복 변환과 최단·최장 색상각 보간이 정확히 동작한다", () => {
    const oklch = linearRgbaToOklch(WARM_RED);
    const back = oklchToLinearRgba(oklch);
    expect(back.r).toBeCloseTo(WARM_RED.r, 3);
    expect(back.g).toBeCloseTo(WARM_RED.g, 3);
    expect(back.b).toBeCloseTo(WARM_RED.b, 3);

    const midShort = interpolateOklchRgba(WARM_RED, COOL_BLUE, 0.5, "shortest");
    const midLong = interpolateOklchRgba(WARM_RED, COOL_BLUE, 0.5, "longest");
    expect(midShort.a).toBeCloseTo(1, 4);
    expect(Math.hypot(midShort.r - midLong.r, midShort.g - midLong.g, midShort.b - midLong.b)).toBeGreaterThan(0.15);
  });

  it("정점 수가 다른 도형을 호길이 리샘플링으로 매칭하고 Replace Spine 및 접선 정렬을 비파괴로 평가한다", () => {
    const baseConfig: BlendSpineConfig = {
      kind: "blend-morph",
      id: "blend-chain-1",
      startShape: makeTriangle(0, 0, 20),
      endShape: makeSquare(200, 0, 20),
      spacing: { mode: "steps", steps: 3 },
      alignToTangent: false,
      resampleVertexCount: 12,
    };

    const straightEval = evaluateBlendSpine(baseConfig);
    expect(straightEval.stepCount).toBe(5);
    expect(straightEval.matchedVertexCount).toBe(12);
    expect(straightEval.totalArcLengthPx).toBeCloseTo(200, 1);
    expect(straightEval.steps[0]!.points).toHaveLength(12);
    expect(straightEval.steps[2]!.center.x).toBeCloseTo(100, 1);
    expect(straightEval.steps[2]!.strokeWidthPx).toBeCloseTo(4, 2);
    expect(straightEval.steps[2]!.opacity).toBeCloseTo(0.8, 2);

    const curvedSpine: SpineCurve = {
      kind: "cubic-bezier",
      segments: [
        {
          p0: { x: 0, y: 0 },
          c1: { x: 0, y: 120 },
          c2: { x: 200, y: 120 },
          p1: { x: 200, y: 0 },
        },
      ],
    };
    const replaced = replaceBlendSpine({ ...baseConfig, alignToTangent: true }, curvedSpine);
    const curvedEval = evaluateBlendSpine(replaced);

    expect(curvedEval.totalArcLengthPx).toBeGreaterThan(220);
    expect(curvedEval.fingerprint).not.toBe(straightEval.fingerprint);
    // 시작점은 위로(+Y) 향하므로 접선 각도가 양수, 중간점은 수평(0 근처)
    expect(curvedEval.steps[0]!.rotationRad).toBeGreaterThan(0.5);
    expect(Math.abs(curvedEval.steps[2]!.rotationRad)).toBeLessThan(0.15);
    expect(curvedEval.steps[2]!.center.y).toBeGreaterThan(70);
  });

  it("Pattern Along Path(거리 기반)와 Cuttle rep 변조·다중 심볼 순환을 정확히 계산한다", () => {
    const arcSpine: SpineCurve = {
      kind: "polyline",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
    };
    expect(measureSpineArcLength(arcSpine)).toBeCloseTo(200, 4);
    expect(sampleSpineAtFraction(arcSpine, 0.75).point.y).toBeCloseTo(50, 2);

    const result = evaluatePatternDuplicator({
      kind: "pattern-duplicator",
      id: "zipper-path",
      symbols: [SAMPLE_SYMBOL_A, SAMPLE_SYMBOL_B],
      symbolOrder: "ping-pong",
      distribution: {
        kind: "path",
        spine: arcSpine,
        spacing: { mode: "distance", distancePx: 50 },
        alignToTangent: true,
        normalOffsetPx: 4,
      },
      repModulator: {
        scaleStart: 0.5,
        scaleEnd: 1.5,
        rotationStepDeg: 10,
        alternateFlipY: true,
      },
    });

    expect(result.instanceCount).toBe(5);
    expect(result.instances.map((i) => i.symbolId)).toEqual([
      "link-a",
      "link-b",
      "link-a",
      "link-b",
      "link-a",
    ]);
    expect(result.instances[0]!.scaleX).toBeCloseTo(0.5, 4);
    expect(result.instances[4]!.scaleX).toBeCloseTo(1.5, 4);
    expect(result.instances[1]!.scaleY).toBeLessThan(0);
    expect(result.instances[0]!.worldPoints).toHaveLength(4);
  });

  it("Cavalry Falloff Field(Linear/Radial/Noise)와 시드 지터가 결정적으로 재현된다", () => {
    const radialValCenter = evaluateFalloffStrength(
      { x: 50, y: 50 },
      [{ kind: "radial", center: { x: 50, y: 50 }, innerRadiusPx: 10, outerRadiusPx: 100 }],
    );
    const radialValFar = evaluateFalloffStrength(
      { x: 250, y: 50 },
      [{ kind: "radial", center: { x: 50, y: 50 }, innerRadiusPx: 10, outerRadiusPx: 100 }],
    );
    expect(radialValCenter).toBeCloseTo(1, 4);
    expect(radialValFar).toBeCloseTo(0, 4);

    const dupConfig = {
      kind: "pattern-duplicator" as const,
      id: "crowd-grid",
      symbols: [SAMPLE_SYMBOL_A],
      distribution: { kind: "grid" as const, columns: 4, rows: 3, spacingX: 40, spacingY: 40, centered: true },
      falloffFields: [
        { kind: "radial" as const, center: { x: 0, y: 0 }, innerRadiusPx: 0, outerRadiusPx: 120 },
        { kind: "noise" as const, scalePx: 30, seed: 77, weight: 0.4 },
      ],
      falloffCombineMode: "max" as const,
      falloffResponse: {
        scaleDelta: 0.8,
        rotationDeltaDeg: 45,
        opacityDelta: -0.3,
        tintTarget: COOL_BLUE,
      },
      jitter: { seed: 2026, positionPx: 5, rotationDeg: 12, scaleRatio: 0.1 },
    };

    const run1 = evaluatePatternDuplicator(dupConfig);
    const run2 = evaluatePatternDuplicator(dupConfig);
    const runOtherSeed = evaluatePatternDuplicator({
      ...dupConfig,
      jitter: { seed: 9999, positionPx: 5, rotationDeg: 12, scaleRatio: 0.1 },
    });

    expect(run1.instanceCount).toBe(12);
    expect(run1.instances).toEqual(run2.instances);
    expect(run1.instances[0]!.position).not.toEqual(runOtherSeed.instances[0]!.position);
    expect(hashDeterministicFloat(42, 3, 1)).toBe(hashDeterministicFloat(42, 3, 1));
    expect(applyFalloffEasing(0.5, "smoothstep")).toBeCloseTo(0.5, 4);
  });

  it("Expand 변환과 호길이 리샘플링이 일관된 편집 레이어 항목을 생성한다", () => {
    const resampled = resamplePolylineByArcLength(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      5,
      false,
    );
    expect(resampled.map((p) => Math.round(p.x))).toEqual([0, 25, 50, 75, 100]);

    const radialEval = evaluatePatternDuplicator({
      kind: "pattern-duplicator",
      id: "magic-ring",
      symbols: [SAMPLE_SYMBOL_A],
      distribution: { kind: "radial", count: 6, radiusPx: 80, alignOutward: true },
    });
    const expanded = expandBlendOrDuplicatorToEditableItems(radialEval);
    expect(expanded).toHaveLength(6);
    expect(expanded[0]!.id).toBe("magic-ring:inst:0:link-a");
    expect(expanded[0]!.points).toHaveLength(4);
  });
});
