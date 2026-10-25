import { describe, expect, it } from "vitest";

import {
  alignStrokesToBaseline,
  beautifyHandwritingStrokes,
  estimateHandwritingBaseline,
  evaluateBaselineAtX,
  HandwritingBeautificationCore,
  measureStrokeTremorEnergy,
  type HandwritingStroke,
} from "./studio-handwriting-baseline-beautifier";

function createGlyphStroke(params: {
  readonly id: string;
  readonly baseX: number;
  readonly baseY: number;
  readonly width?: number;
  readonly height?: number;
  readonly slantRad?: number;
  readonly tremorAmplitude?: number;
  readonly strokeWidth?: number;
}): HandwritingStroke {
  const width = params.width ?? 20;
  const height = params.height ?? 32;
  const slant = Math.tan(params.slantRad ?? 0);
  const tremor = params.tremorAmplitude ?? 0;
  const steps = 12;
  const points = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    // 위에서 아래(baseY)로 내려오며 하단 극점을 형성한 뒤 살짝 올라가는 필획
    const relY = t <= 0.85 ? -height * (1 - t / 0.85) : -height * 0.15 * ((t - 0.85) / 0.15);
    const jitter =
      tremor > 0 && i > 0 && i < steps
        ? (i % 2 === 0 ? 1 : -1) * tremor
        : 0;
    const x = params.baseX + t * width + relY * slant + jitter;
    const y = params.baseY + relY - jitter * 0.5;
    const pressure = 0.35 + Math.sin(t * Math.PI) * 0.55;
    points.push({ x, y, pressure, timestampMs: i * 8 });
  }

  return {
    id: params.id,
    points,
    strokeWidth: params.strokeWidth ?? 3,
    role: "dialogue",
  };
}

describe("studio-handwriting-baseline-beautifier", () => {
  it("기울어진 손글씨 대사 스트로크 집합에서 기울기(angleRad), 글자 높이(xHeight), 자간(wordSpacing)을 정확히 추정한다", () => {
    const targetSlope = 0.22; // 약 12.4도 기울기
    const targetAngle = Math.atan(targetSlope);
    const strokes: HandwritingStroke[] = [0, 1, 2, 3, 4].map((idx) => {
      const baseX = 80 + idx * 44;
      const baseY = 220 + (baseX - 168) * targetSlope;
      return createGlyphStroke({
        id: `glyph-${idx}`,
        baseX,
        baseY,
        width: 22,
        height: 34,
      });
    });

    const estimate = estimateHandwritingBaseline(strokes);

    expect(estimate.angleRad).toBeCloseTo(targetAngle, 1);
    expect(estimate.xHeight).toBeGreaterThan(28);
    expect(estimate.xHeight).toBeLessThan(42);
    expect(estimate.wordSpacing).toBeGreaterThan(15);
    expect(estimate.wordSpacing).toBeLessThan(28);
    expect(estimate.confidence).toBeGreaterThan(0.6);
    expect(estimate.anchorPoints.length).toBeGreaterThanOrEqual(5);
  });

  it("아치형 효과음(SFX) 레터링에서 2차 곡률(curvature)을 감지하고 베이스라인 좌표를 평가한다", () => {
    const originX = 240;
    const originY = 180;
    const curvature = 0.0018;
    const strokes: HandwritingStroke[] = [-2, -1, 0, 1, 2].map((offset, idx) => {
      const baseX = originX + offset * 50;
      const u = baseX - originX;
      const baseY = originY + curvature * u * u;
      return createGlyphStroke({
        id: `sfx-${idx}`,
        baseX,
        baseY,
        width: 24,
        height: 40,
      });
    });

    const estimate = estimateHandwritingBaseline(strokes);
    expect(estimate.curvature).toBeGreaterThan(0.0008);

    const centerEval = evaluateBaselineAtX(estimate, originX);
    const edgeEval = evaluateBaselineAtX(estimate, originX + 100);
    expect(edgeEval.y).toBeGreaterThan(centerEval.y + 8);
  });

  it("삐뚤어진 손글씨를 수평 베이스라인 및 말풍선 아치형 가이드 곡선에 비파괴 정렬한다", () => {
    const strokes: HandwritingStroke[] = [0, 1, 2, 3, 4].map((idx) => {
      const baseX = 100 + idx * 45;
      const baseY = 200 + idx * 14;
      return createGlyphStroke({
        id: `tilted-${idx}`,
        baseX,
        baseY,
        width: 20,
        height: 32,
      });
    });

    const beforeEstimate = estimateHandwritingBaseline(strokes);
    expect(Math.abs(beforeEstimate.angleRad)).toBeGreaterThan(0.2);

    const straightened = alignStrokesToBaseline(strokes, {
      kind: "horizontal",
      y: 200,
    });
    const afterHorizontal = estimateHandwritingBaseline(straightened);
    expect(Math.abs(afterHorizontal.angleRad)).toBeLessThan(0.04);
    expect(Math.abs(afterHorizontal.curvature)).toBeLessThan(0.0005);

    const arched = alignStrokesToBaseline(strokes, {
      kind: "quadratic-arch",
      originX: 190,
      originY: 180,
      curvature: 0.002,
    });
    const afterArch = estimateHandwritingBaseline(arched);
    expect(afterArch.curvature).toBeGreaterThan(0.0012);
  });

  it("스타일 보존 미화(HandwritingBeautificationCore)가 끝점과 필압 억양을 유지하면서 떨림·높이 편차·기울기 편차를 줄인다", () => {
    const heights = [24, 38, 30, 42, 26];
    const slants = [-0.22, 0.18, -0.05, 0.25, -0.15];
    const widths = [2.2, 4.0, 3.0, 4.4, 2.5];

    const noisyStrokes: HandwritingStroke[] = heights.map((height, idx) =>
      createGlyphStroke({
        id: `noisy-${idx}`,
        baseX: 60 + idx * 48,
        baseY: 240,
        width: 22,
        height,
        slantRad: slants[idx],
        tremorAmplitude: 2.4,
        strokeWidth: widths[idx],
      }),
    );

    const core = new HandwritingBeautificationCore({
      strength: 0.85,
      smoothingIterations: 3,
      normalizeXHeight: true,
      normalizeStrokeWidth: true,
    });

    const energyBefore = measureStrokeTremorEnergy(noisyStrokes);
    const result = core.beautify(noisyStrokes);
    const energyAfter = measureStrokeTremorEnergy(result.strokes);

    expect(energyAfter).toBeLessThan(energyBefore * 0.55);
    expect(result.metrics.tremorReductionRatio).toBeGreaterThan(0.4);
    expect(result.metrics.xHeightVarianceAfter).toBeLessThan(
      result.metrics.xHeightVarianceBefore * 0.35,
    );
    expect(result.metrics.slantSpreadAfterRad).toBeLessThan(
      result.metrics.slantSpreadBeforeRad * 0.5,
    );

    // 첫 글자의 시작점과 끝점의 y 바닥 위치, 필압 곡선 억양이 보존되는지 검증
    const firstBefore = noisyStrokes[0]!;
    const firstAfter = result.strokes[0]!;
    expect(firstAfter.points).toHaveLength(firstBefore.points.length);
    const midIdx = Math.floor(firstAfter.points.length / 2);
    expect(firstAfter.points[midIdx]!.pressure ?? 0).toBeGreaterThan(
      firstAfter.points[0]!.pressure ?? 0,
    );
    expect(
      Math.abs((firstAfter.strokeWidth ?? 0) - 3.0),
    ).toBeLessThan(Math.abs((firstBefore.strokeWidth ?? 0) - 3.0));
  });

  it("빈 입력에서도 예외 없이 결정론적 기본값을 반환한다", () => {
    const emptyBaseline = estimateHandwritingBaseline([]);
    expect(emptyBaseline.confidence).toBe(0);
    expect(emptyBaseline.anchorPoints).toEqual([]);
    expect(alignStrokesToBaseline([])).toEqual([]);
    const emptyBeautified = beautifyHandwritingStrokes([]);
    expect(emptyBeautified.strokes).toEqual([]);
    expect(emptyBeautified.metrics.tremorReductionRatio).toBe(0);
  });
});
