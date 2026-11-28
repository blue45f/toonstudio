import { describe, expect, it } from "vitest";
import {
  buildSketchConsolidationWgsl,
  clusterOverdrawnSketchStrokes,
  computeSha256Hex,
  consolidateRoughSketchToCleanInk,
  escapeSvgXml,
  evaluateCenterlineAccuracyAgainstReference,
  renderSketchConsolidationAuditSvg,
  summarizeSketchConsolidationKo,
  validateSketchConsolidationWgsl,
  type RawSketchStroke,
  type SketchPoint2D,
  type Vec2,
} from "./index";

function sampleLine(x0: number, y0: number, x1: number, y1: number, count: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count > 1 ? i / (count - 1) : 0;
    pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
  }
  return pts;
}

function sampleArc(cx: number, cy: number, radius: number, startRad: number, endRad: number, count: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count > 1 ? i / (count - 1) : 0;
    const ang = startRad + (endRad - startRad) * t;
    pts.push({ x: cx + Math.cos(ang) * radius, y: cy + Math.sin(ang) * radius });
  }
  return pts;
}

function sampleSCurve(x0: number, y0: number, spanX: number, ampY: number, count: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count > 1 ? i / (count - 1) : 0;
    pts.push({
      x: x0 + spanX * t,
      y: y0 + Math.sin(t * Math.PI * 2) * ampY,
    });
  }
  return pts;
}

function buildNoisyOverdrawBundle(
  reference: readonly Vec2[],
  idPrefix: string,
  lateralBiases: readonly number[],
  options?: {
    readonly reverseFlags?: readonly boolean[];
    readonly waveAmpPx?: number;
    readonly pressure?: number;
  },
): RawSketchStroke[] {
  const waveAmp = options?.waveAmpPx ?? 1.8;
  const basePressure = options?.pressure ?? 0.6;
  const strokes: RawSketchStroke[] = [];

  for (let k = 0; k < lateralBiases.length; k += 1) {
    const bias = lateralBiases[k] ?? 0;
    const reverse = options?.reverseFlags?.[k] ?? false;
    const pts: SketchPoint2D[] = [];

    for (let i = 0; i < reference.length; i += 1) {
      const curr = reference[i];
      if (!curr) continue;
      const prev = reference[Math.max(0, i - 1)] ?? curr;
      const next = reference[Math.min(reference.length - 1, i + 1)] ?? curr;
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.max(Math.hypot(dx, dy), 1e-6);
      const nx = -dy / len;
      const ny = dx / len;
      const phase = (i / Math.max(1, reference.length - 1)) * Math.PI * 6 + k * 1.15;
      const offset = bias + Math.sin(phase) * waveAmp;
      pts.push({
        x: curr.x + nx * offset,
        y: curr.y + ny * offset,
        pressure: basePressure,
      });
    }

    if (reverse) {
      pts.reverse();
    }
    strokes.push({ strokeId: `${idPrefix}-${k + 1}`, points: pts });
  }
  return strokes;
}

describe("Wave 130 — 다중 겹침 러프 스케치 단일 먹선 중앙선 통합 & G펜 필압 복원 엔진", () => {
  it("1. 6겹 잡음 직선 러프 번들을 정확히 1개 먹선으로 압축한다", () => {
    const truth = sampleLine(20, 100, 260, 100, 48);
    const bundle = buildNoisyOverdrawBundle(truth, "line", [-5.2, -3.1, -1.0, 1.1, 3.0, 5.2]);
    const result = consolidateRoughSketchToCleanInk(bundle);

    expect(result.metrics.strokeCountBefore).toBe(6);
    expect(result.metrics.strokeCountAfter).toBe(1);
    expect(result.metrics.compressionRatio).toBeCloseTo(6, 5);
    expect(result.metrics.orthogonalFalseMergeCount).toBe(0);
    expect(result.inkStrokes[0]?.totalLengthPx ?? 0).toBeGreaterThan(225);
  });

  it("2. 6겹 잡음 원호(Arc) 러프 번들을 반지름 수축 없이 단일 곡선 먹선으로 통합한다", () => {
    const truth = sampleArc(180, 180, 110, -Math.PI * 0.78, -Math.PI * 0.12, 56);
    const bundle = buildNoisyOverdrawBundle(truth, "arc", [-5.0, -2.8, -0.9, 0.9, 2.8, 5.0]);
    const result = consolidateRoughSketchToCleanInk(bundle);

    expect(result.metrics.strokeCountBefore).toBe(6);
    expect(result.metrics.strokeCountAfter).toBe(1);
    const ink = result.inkStrokes[0];
    expect(ink).toBeDefined();
    if (!ink) return;
    const accuracy = evaluateCenterlineAccuracyAgainstReference(truth, ink, bundle);
    expect(accuracy.centerlineRmsePx).toBeLessThan(1.6);
    expect(accuracy.passesAccuracyTarget).toBe(true);
  });

  it("3. 6겹 잡음 S-곡선 러프 번들을 변곡점 붕괴 없이 단일 먹선으로 통합한다", () => {
    const truth = sampleSCurve(20, 140, 260, 44, 60);
    const bundle = buildNoisyOverdrawBundle(truth, "scurve", [-4.8, -2.6, -0.8, 0.8, 2.6, 4.8]);
    const result = consolidateRoughSketchToCleanInk(bundle);

    expect(result.metrics.strokeCountBefore).toBe(6);
    expect(result.metrics.strokeCountAfter).toBe(1);
    const ink = result.inkStrokes[0];
    expect(ink).toBeDefined();
    if (!ink) return;
    const accuracy = evaluateCenterlineAccuracyAgainstReference(truth, ink, bundle);
    expect(accuracy.centerlineRmsePx).toBeLessThan(accuracy.meanRawStrokeRmsePx * 0.65);
    expect(accuracy.passesAccuracyTarget).toBe(true);
  });

  it("4. 참 직선 곡선 대비 통합 중앙선 RMSE가 개별 잡음 러프 평균 RMSE보다 35% 이상 낮다", () => {
    const truth = sampleLine(30, 80, 290, 120, 50);
    const bundle = buildNoisyOverdrawBundle(truth, "acc", [-6.0, -3.5, -1.4, 1.4, 3.5, 6.0], {
      waveAmpPx: 2.2,
    });
    const result = consolidateRoughSketchToCleanInk(bundle);
    const ink = result.inkStrokes[0];
    expect(ink).toBeDefined();
    if (!ink) return;

    const accuracy = evaluateCenterlineAccuracyAgainstReference(truth, ink, bundle);
    expect(accuracy.meanRawStrokeRmsePx).toBeGreaterThan(2.5);
    expect(accuracy.centerlineRmsePx).toBeLessThan(accuracy.meanRawStrokeRmsePx * 0.65);
    expect(accuracy.rmseReductionPercent).toBeGreaterThan(35);
    expect(accuracy.passesAccuracyTarget).toBe(true);
  });

  it("5. 왕복(좌→우 3겹 + 우→좌 3겹) 역방향 연필선을 자동 반전 정렬해 중앙선 붕괴 없이 통합한다", () => {
    const truth = sampleLine(10, 120, 270, 120, 48);
    const bundle = buildNoisyOverdrawBundle(truth, "recip", [-4.2, -2.2, -0.5, 0.5, 2.2, 4.2], {
      reverseFlags: [false, true, false, true, false, true],
    });
    const result = consolidateRoughSketchToCleanInk(bundle);

    expect(result.metrics.strokeCountAfter).toBe(1);
    expect(result.metrics.totalReversedAlignedStrokes).toBe(3);
    const ink = result.inkStrokes[0];
    expect(ink).toBeDefined();
    if (!ink) return;
    expect(ink.totalLengthPx).toBeGreaterThan(245);
    const accuracy = evaluateCenterlineAccuracyAgainstReference(truth, ink, bundle);
    expect(accuracy.centerlineRmsePx).toBeLessThan(1.2);
  });

  it("6. S-곡선 위 정방향 3겹 + 역방향 3겹 왕복 연필선도 방향 자동 정렬로 정확히 통합한다", () => {
    const truth = sampleSCurve(15, 130, 240, 38, 56);
    const bundle = buildNoisyOverdrawBundle(truth, "recip-s", [-3.8, -1.9, -0.6, 0.6, 1.9, 3.8], {
      reverseFlags: [false, false, false, true, true, true],
    });
    const result = consolidateRoughSketchToCleanInk(bundle);

    expect(result.metrics.strokeCountAfter).toBe(1);
    expect(result.metrics.totalReversedAlignedStrokes).toBe(3);
    const ink = result.inkStrokes[0];
    expect(ink).toBeDefined();
    if (!ink) return;
    const accuracy = evaluateCenterlineAccuracyAgainstReference(truth, ink, bundle);
    expect(accuracy.passesAccuracyTarget).toBe(true);
  });

  it("7. 아웃라이어 삐침(stray parallel outlier) 1개 혼입 시 후버 IRLS가 편향을 강건하게 억제한다", () => {
    const truth = sampleLine(20, 120, 260, 120, 48);
    const cleanFive = buildNoisyOverdrawBundle(truth, "core", [-2.2, -1.1, 0.0, 1.1, 2.2], {
      waveAmpPx: 0.7,
    });
    const strayOutlier: RawSketchStroke = {
      strokeId: "stray-outlier",
      points: truth.map((p) => ({ x: p.x, y: p.y + 11.5, pressure: 0.5 })),
    };

    const withOutlier = consolidateRoughSketchToCleanInk([...cleanFive, strayOutlier], {
      clusterBandwidthPx: 14,
      huberDeltaPx: 3.5,
    });

    expect(withOutlier.metrics.strokeCountBefore).toBe(6);
    expect(withOutlier.metrics.strokeCountAfter).toBe(1);
    expect(withOutlier.metrics.totalOutlierSuppressedStrokes).toBeGreaterThanOrEqual(1);
    const ink = withOutlier.inkStrokes[0];
    expect(ink).toBeDefined();
    if (!ink) return;
    const meanY = ink.samples.reduce((acc, s) => acc + s.y, 0) / ink.samples.length;
    // 단순 평균이면 11.5 / 6 = +1.92px 치우치지만 후버 강건 가중은 0.7px 이내로 억제한다.
    expect(Math.abs(meanY - 120)).toBeLessThan(0.75);
  });

  it("8. 끝단 삐침(flaring overshoot flick) 아웃라이어가 있어도 중앙선이 크게 끌려가지 않는다", () => {
    const truth = sampleLine(20, 100, 240, 100, 44);
    const core = buildNoisyOverdrawBundle(truth, "base", [-1.8, -0.8, 0.0, 0.8, 1.8], {
      waveAmpPx: 0.5,
    });
    const flaring: RawSketchStroke = {
      strokeId: "flare-tail",
      points: truth.map((p, idx) => {
        const t = idx / (truth.length - 1);
        const flare = t > 0.65 ? Math.pow((t - 0.65) / 0.35, 1.5) * 18 : 1.2;
        return { x: p.x, y: p.y + flare, pressure: 0.5 };
      }),
    };

    const result = consolidateRoughSketchToCleanInk([...core, flaring], {
      clusterBandwidthPx: 14,
      huberDeltaPx: 3.2,
    });

    expect(result.metrics.strokeCountAfter).toBe(1);
    const ink = result.inkStrokes[0];
    expect(ink).toBeDefined();
    if (!ink) return;
    const tailSample = ink.samples[ink.samples.length - 1];
    expect(Math.abs((tailSample?.y ?? 0) - 100)).toBeLessThan(2.5);
  });

  it("9. 직교 X-교차선(십자 창틀: 가로 3겹 + 세로 3겹)에서 오병합 0건을 보장한다", () => {
    const horiz = buildNoisyOverdrawBundle(
      sampleLine(20, 120, 220, 120, 40),
      "h",
      [-2.5, 0, 2.5],
      { waveAmpPx: 0.6 },
    );
    const vert = buildNoisyOverdrawBundle(
      sampleLine(120, 20, 120, 220, 40),
      "v",
      [-2.5, 0, 2.5],
      { waveAmpPx: 0.6 },
    );
    const result = consolidateRoughSketchToCleanInk([...horiz, ...vert]);

    expect(result.metrics.strokeCountBefore).toBe(6);
    expect(result.metrics.strokeCountAfter).toBe(2);
    expect(result.metrics.orthogonalFalseMergeCount).toBe(0);
    expect(result.metrics.orthogonalRejectedPairs).toBeGreaterThanOrEqual(9);
  });

  it("10. 직교 T-접합(가로 턱선 + 세로 목선)을 독립 클러스터 2개로 분리한다", () => {
    const jaw = buildNoisyOverdrawBundle(sampleLine(40, 100, 220, 100, 36), "jaw", [-2, 0, 2], {
      waveAmpPx: 0.5,
    });
    const neck = buildNoisyOverdrawBundle(sampleLine(130, 100, 130, 230, 32), "neck", [-2, 0, 2], {
      waveAmpPx: 0.5,
    });
    const result = consolidateRoughSketchToCleanInk([...jaw, ...neck]);

    expect(result.metrics.strokeCountAfter).toBe(2);
    expect(result.metrics.orthogonalFalseMergeCount).toBe(0);
    expect(result.metrics.orthogonalRejectedPairs).toBeGreaterThan(0);
  });

  it("11. 직교 L-코너 접합(가로 프레임 + 세로 프레임)을 오병합하지 않는다", () => {
    const top = buildNoisyOverdrawBundle(sampleLine(40, 60, 200, 60, 34), "top", [-1.5, 1.5], {
      waveAmpPx: 0.4,
    });
    const right = buildNoisyOverdrawBundle(sampleLine(200, 60, 200, 200, 34), "right", [-1.5, 1.5], {
      waveAmpPx: 0.4,
    });
    const result = consolidateRoughSketchToCleanInk([...top, ...right]);

    expect(result.metrics.strokeCountAfter).toBe(2);
    expect(result.metrics.orthogonalFalseMergeCount).toBe(0);
  });

  it("12. 45도 대각 교차선(|dot| ≈ 0.707 < 0.82)을 서로 다른 클러스터로 분리한다", () => {
    const diagA = buildNoisyOverdrawBundle(sampleLine(20, 20, 200, 200, 36), "da", [-2, 0, 2], {
      waveAmpPx: 0.5,
    });
    const diagB = buildNoisyOverdrawBundle(sampleLine(20, 110, 200, 110, 36), "db", [-2, 0, 2], {
      waveAmpPx: 0.5,
    });
    const result = consolidateRoughSketchToCleanInk([...diagA, ...diagB]);

    expect(result.metrics.strokeCountAfter).toBe(2);
    expect(result.metrics.orthogonalFalseMergeCount).toBe(0);
  });

  it("13. 평행하지만 대역폭(14px) 밖인 두 선(간격 32px)은 독립 먹선으로 유지한다", () => {
    const upper = buildNoisyOverdrawBundle(sampleLine(20, 80, 220, 80, 36), "up", [-1.5, 1.5], {
      waveAmpPx: 0.4,
    });
    const lower = buildNoisyOverdrawBundle(sampleLine(20, 112, 220, 112, 36), "lo", [-1.5, 1.5], {
      waveAmpPx: 0.4,
    });
    const result = consolidateRoughSketchToCleanInk([...upper, ...lower], {
      clusterBandwidthPx: 14,
    });

    expect(result.metrics.strokeCountAfter).toBe(2);
  });

  it("14. 동일 직선상이지만 30px 간격으로 떨어진 두 분리 획은 오병합하지 않는다", () => {
    const segA: RawSketchStroke = { strokeId: "seg-a", points: sampleLine(10, 80, 100, 80, 24) };
    const segB: RawSketchStroke = { strokeId: "seg-b", points: sampleLine(130, 80, 220, 80, 24) };
    const result = consolidateRoughSketchToCleanInk([segA, segB]);

    expect(result.metrics.strokeCountAfter).toBe(2);
  });

  it("15. 다중 독립 클러스터 혼합 장면(4개 번들 18획)을 정확히 4개 먹선으로 통합한다", () => {
    const brow = buildNoisyOverdrawBundle(sampleLine(40, 60, 140, 56, 26), "brow", [-2, -0.5, 1, 2.2], {
      waveAmpPx: 0.4,
    });
    const jaw = buildNoisyOverdrawBundle(sampleArc(120, 120, 85, 0.2, 2.1, 36), "jaw", [-3, -1.5, 0, 1.5, 3], {
      waveAmpPx: 0.6,
    });
    const neck = buildNoisyOverdrawBundle(sampleLine(120, 205, 120, 310, 28), "neck", [-2, 0, 2, 3.2], {
      waveAmpPx: 0.5,
    });
    const collar = buildNoisyOverdrawBundle(sampleLine(50, 290, 210, 300, 34), "collar", [-2.5, -1, 0.5, 1.5, 2.5], {
      waveAmpPx: 0.5,
    });

    const result = consolidateRoughSketchToCleanInk([...brow, ...jaw, ...neck, ...collar]);
    expect(result.metrics.strokeCountBefore).toBe(18);
    expect(result.metrics.strokeCountAfter).toBe(4);
    expect(result.metrics.orthogonalFalseMergeCount).toBe(0);
  });

  it("16. 만화 G펜 양 끝단 테이퍼를 자동 복원한다 (tipWidthPx < midWidthPx)", () => {
    const truth = sampleLine(20, 100, 260, 100, 48);
    const bundle = buildNoisyOverdrawBundle(truth, "taper", [-2.5, -1, 0, 1, 2.5]);
    const result = consolidateRoughSketchToCleanInk(bundle, {
      gpenBaseWidthPx: 1.8,
      gpenMaxWidthPx: 5.4,
      taperRatio: 0.2,
    });

    const ink = result.inkStrokes[0];
    expect(ink).toBeDefined();
    if (!ink) return;
    expect(ink.tipStartWidthPx).toBeLessThan(ink.midWidthPx * 0.6);
    expect(ink.tipEndWidthPx).toBeLessThan(ink.midWidthPx * 0.6);
    expect(ink.minWidthPx).toBeGreaterThan(0.3);
    expect(ink.maxWidthPx).toBeLessThanOrEqual(5.4 + 1e-6);
  });

  it("17. 러프 중첩 밀도(가운데 구간을 여러 번 덧그린 강조 구간)에 비례해 G펜 선폭을 두껍게 복원한다", () => {
    const fullLine = sampleLine(0, 100, 300, 100, 60);
    const midLine = sampleLine(105, 100, 195, 100, 26);
    const baseTwo = buildNoisyOverdrawBundle(fullLine, "full", [-1.2, 1.2], {
      waveAmpPx: 0.3,
      pressure: 0.55,
    });
    const emphasisFour = buildNoisyOverdrawBundle(midLine, "emph", [-2.4, -0.8, 0.8, 2.4], {
      waveAmpPx: 0.3,
      pressure: 0.55,
    });

    const result = consolidateRoughSketchToCleanInk([...baseTwo, ...emphasisFour]);
    expect(result.metrics.strokeCountAfter).toBe(1);
    const ink = result.inkStrokes[0];
    expect(ink).toBeDefined();
    if (!ink) return;

    const sideSamples = ink.samples.filter((s) => s.normalizedT > 0.22 && s.normalizedT < 0.3);
    const midSamples = ink.samples.filter((s) => s.normalizedT > 0.44 && s.normalizedT < 0.56);
    const sideWidth = sideSamples.reduce((a, s) => a + s.widthPx, 0) / Math.max(1, sideSamples.length);
    const midWidth = midSamples.reduce((a, s) => a + s.widthPx, 0) / Math.max(1, midSamples.length);

    expect(ink.peakOverdrawDensity).toBeGreaterThan(4.5);
    expect(midWidth).toBeGreaterThan(sideWidth * 1.15);
  });

  it("18. 국소 곡률이 큰 구간은 직선 구간보다 G펜 선폭 변화가 뚜렷하게 반영된다", () => {
    const flatTruth = sampleLine(0, 100, 200, 100, 50);
    const tightArcTruth = sampleArc(100, 100, 36, -Math.PI * 0.85, Math.PI * 0.15, 50);
    const flatInk = consolidateRoughSketchToCleanInk(
      buildNoisyOverdrawBundle(flatTruth, "flat", [-1.2, 0, 1.2], { waveAmpPx: 0.2, pressure: 0.5 }),
    ).inkStrokes[0];
    const arcInk = consolidateRoughSketchToCleanInk(
      buildNoisyOverdrawBundle(tightArcTruth, "tight", [-1.2, 0, 1.2], { waveAmpPx: 0.2, pressure: 0.5 }),
    ).inkStrokes[0];

    expect(flatInk).toBeDefined();
    expect(arcInk).toBeDefined();
    if (!flatInk || !arcInk) return;
    expect(arcInk.maxCurvatureRadPerPx).toBeGreaterThan(flatInk.maxCurvatureRadPerPx + 0.015);
    expect(arcInk.midWidthPx).toBeGreaterThan(flatInk.midWidthPx);
  });

  it("19. 입력 필압 프로파일(강필압 vs 약필압)이 복원된 G펜 선폭에 반영된다", () => {
    const truth = sampleLine(10, 80, 210, 80, 40);
    const light = consolidateRoughSketchToCleanInk(
      buildNoisyOverdrawBundle(truth, "light", [-1.5, 0, 1.5], { waveAmpPx: 0.3, pressure: 0.15 }),
    ).inkStrokes[0];
    const heavy = consolidateRoughSketchToCleanInk(
      buildNoisyOverdrawBundle(truth, "heavy", [-1.5, 0, 1.5], { waveAmpPx: 0.3, pressure: 0.95 }),
    ).inkStrokes[0];

    expect(light).toBeDefined();
    expect(heavy).toBeDefined();
    if (!light || !heavy) return;
    expect(heavy.midWidthPx).toBeGreaterThan(light.midWidthPx * 1.25);
  });

  it("20. 단독 깔끔한 선(1획)은 형상 훼손 없이 그대로 통과한다", () => {
    const cleanCurve = sampleArc(120, 120, 90, 0, Math.PI * 0.6, 40);
    const single: RawSketchStroke = {
      strokeId: "clean-solo",
      points: cleanCurve.map((p) => ({ x: p.x, y: p.y, pressure: 0.65 })),
    };
    const result = consolidateRoughSketchToCleanInk([single]);

    expect(result.metrics.strokeCountBefore).toBe(1);
    expect(result.metrics.strokeCountAfter).toBe(1);
    expect(result.metrics.singleStrokePassthroughCount).toBe(1);
    const ink = result.inkStrokes[0];
    expect(ink?.passthroughUnmodified).toBe(true);
    expect(ink?.huberResidualRmsePx).toBe(0);
    if (!ink) return;
    const acc = evaluateCenterlineAccuracyAgainstReference(cleanCurve, ink, [single]);
    expect(acc.centerlineRmsePx).toBeLessThan(0.25);
  });

  it("21. 부분 겹침 치킨스크래치(staggered rough strokes)를 연속 단일 먹선으로 병합한다", () => {
    const s1: RawSketchStroke = { strokeId: "c1", points: sampleLine(0, 100, 140, 101, 30) };
    const s2: RawSketchStroke = { strokeId: "c2", points: sampleLine(70, 99, 210, 100, 30) };
    const s3: RawSketchStroke = { strokeId: "c3", points: sampleLine(130, 101, 260, 100, 30) };
    const result = consolidateRoughSketchToCleanInk([s1, s2, s3], {
      minOverlapFraction: 0.25,
    });

    expect(result.metrics.strokeCountAfter).toBe(1);
    expect(result.inkStrokes[0]?.totalLengthPx ?? 0).toBeGreaterThan(180);
  });

  it("22. 순수 ES2017 동기 FIPS 180-4 SHA-256이 공식 NIST 테스트 벡터와 정확히 일치한다", () => {
    expect(computeSha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(computeSha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      computeSha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("23. 동일 입력에 대해 consolidatedInkSha256Hex가 100% 결정론적이며 입력 변경 시 즉시 변한다", () => {
    const truth = sampleLine(10, 50, 210, 50, 36);
    const bundleA = buildNoisyOverdrawBundle(truth, "det", [-3, -1, 1, 3]);
    const bundleB = buildNoisyOverdrawBundle(truth, "det", [-3, -1, 1, 3.5]);

    const run1 = consolidateRoughSketchToCleanInk(bundleA);
    const run2 = consolidateRoughSketchToCleanInk(bundleA);
    const run3 = consolidateRoughSketchToCleanInk(bundleB);

    expect(run1.consolidatedInkSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(run1.consolidatedInkSha256Hex).toBe(run2.consolidatedInkSha256Hex);
    expect(run1.consolidatedInkSha256Hex).not.toBe(run3.consolidatedInkSha256Hex);
  });

  it("24. 빈 입력([])을 NaN 없이 안전하게 처리하고 유효한 SHA-256 지문을 반환한다", () => {
    const result = consolidateRoughSketchToCleanInk([]);
    expect(result.inkStrokes).toHaveLength(0);
    expect(result.clusters).toHaveLength(0);
    expect(result.metrics.strokeCountBefore).toBe(0);
    expect(result.metrics.strokeCountAfter).toBe(0);
    expect(result.consolidatedInkSha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("25. 1점 스트로크·중복점·0길이 스트로크를 안전하게 제외한다", () => {
    const invalid: RawSketchStroke[] = [
      { strokeId: "empty", points: [] },
      { strokeId: "one-pt", points: [{ x: 10, y: 20 }] },
      { strokeId: "zero-len", points: [{ x: 50, y: 50 }, { x: 50, y: 50 }] },
    ];
    const valid: RawSketchStroke = { strokeId: "valid", points: sampleLine(0, 10, 100, 10, 16) };
    const result = consolidateRoughSketchToCleanInk([...invalid, valid]);

    expect(result.droppedInvalidStrokes).toBe(3);
    expect(result.metrics.strokeCountBefore).toBe(1);
    expect(result.metrics.strokeCountAfter).toBe(1);
  });

  it("26. NaN·Infinity 좌표가 섞인 스트로크를 방어 정화해 출력 좌표를 모두 유한하게 유지한다", () => {
    const dirty: RawSketchStroke = {
      strokeId: "dirty",
      points: [
        { x: 0, y: 50, pressure: Number.NaN },
        { x: Number.NaN, y: 50 },
        { x: 50, y: Number.POSITIVE_INFINITY },
        { x: 80, y: 52, pressure: 0.7 },
        { x: 160, y: 50, pressure: 0.6 },
      ],
    };
    const result = consolidateRoughSketchToCleanInk([dirty]);

    expect(result.sanitizedInvalidPoints).toBe(2);
    expect(result.inkStrokes).toHaveLength(1);
    for (const s of result.inkStrokes[0]?.samples ?? []) {
      expect(Number.isFinite(s.x)).toBe(true);
      expect(Number.isFinite(s.y)).toBe(true);
      expect(Number.isFinite(s.widthPx)).toBe(true);
      expect(Number.isFinite(s.leftEdge.x)).toBe(true);
      expect(Number.isFinite(s.rightEdge.y)).toBe(true);
    }
  });

  it("27. 음수·NaN 옵션 전달 시 안전 기본값과 클램핑 범위로 복구한다", () => {
    const truth = sampleLine(10, 40, 150, 40, 24);
    const bundle = buildNoisyOverdrawBundle(truth, "opt", [-2, 0, 2]);
    const result = consolidateRoughSketchToCleanInk(bundle, {
      clusterBandwidthPx: Number.NaN,
      minTangentCosine: -5,
      resampleStepPx: 0,
      huberDeltaPx: Number.POSITIVE_INFINITY,
      taperRatio: 5,
      gpenBaseWidthPx: -2,
      gpenMaxWidthPx: -1,
    });

    expect(result.options.clusterBandwidthPx).toBe(14);
    expect(result.options.minTangentCosine).toBe(0.5);
    expect(result.options.resampleStepPx).toBe(1);
    expect(result.options.taperRatio).toBe(0.42);
    expect(result.options.gpenMaxWidthPx).toBeGreaterThan(result.options.gpenBaseWidthPx);
    expect(result.metrics.strokeCountAfter).toBe(1);
  });

  it("28. WebGPU WGSL 중앙선 거리장 필터 & G펜 SDF 안티앨리어싱 셰이더를 생성하고 검증 통과한다", () => {
    const artifact = buildSketchConsolidationWgsl({ clusterBandwidthPx: 12, huberDeltaPx: 4 });
    const validation = validateSketchConsolidationWgsl(artifact);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(artifact.uniformBufferByteLength).toBe(64);
    expect(artifact.uniformBufferByteLength % 16).toBe(0);
    expect(artifact.bindings).toHaveLength(3);
    expect(artifact.entryPoints).toContain("cs_centerline_distance_filter");
    expect(artifact.entryPoints).toContain("fs_gpen_sdf_antialias");
    expect(validation.bindingCount).toBe(3);
  });

  it("29. 손상된 WGSL(괄호 불균형·바인딩 누락·16B 정렬 위반)을 정확히 거부한다", () => {
    const artifact = buildSketchConsolidationWgsl();
    const brokenDelimiter = validateSketchConsolidationWgsl(`${artifact.wgsl}\n{`);
    expect(brokenDelimiter.valid).toBe(false);
    expect(brokenDelimiter.errors.some((e) => e.includes("curly braces"))).toBe(true);

    const brokenAlign = validateSketchConsolidationWgsl({
      ...artifact,
      uniformBufferByteLength: 52,
    });
    expect(brokenAlign.valid).toBe(false);
    expect(brokenAlign.errors.some((e) => e.includes("multiple of 16"))).toBe(true);

    const missingBinding = validateSketchConsolidationWgsl(
      artifact.wgsl.replace("@group(0) @binding(2)", "@group(0) @binding(9)"),
    );
    expect(missingBinding.valid).toBe(false);
    expect(missingBinding.errors.some((e) => e.includes("@binding(2)"))).toBe(true);
  });

  it("30. GLSL 금지어(gl_FragColor, dFdx, texture2D) 및 NaN이 섞인 WGSL을 거부한다", () => {
    const artifact = buildSketchConsolidationWgsl();
    const glslBad = validateSketchConsolidationWgsl(
      `${artifact.wgsl}\n// gl_FragColor dFdx texture2D`,
    );
    expect(glslBad.valid).toBe(false);
    expect(glslBad.errors.some((e) => e.includes("forbidden GLSL"))).toBe(true);

    const nanBad = validateSketchConsolidationWgsl(`${artifact.wgsl}\n// NaN`);
    expect(nanBad.valid).toBe(false);
    expect(nanBad.errors.some((e) => e.includes("non-finite"))).toBe(true);
  });

  it("31. 인쇄 안전 순수 OKLCH SVG를 생성하며 원시 hex/rgb/hsl 및 NaN/Infinity가 0건이다", () => {
    const truth = sampleSCurve(20, 120, 220, 36, 44);
    const bundle = buildNoisyOverdrawBundle(truth, "svg", [-4, -2, 0, 2, 4]);
    const result = consolidateRoughSketchToCleanInk(bundle);

    const lightSvg = renderSketchConsolidationAuditSvg(result, { theme: "light" });
    const darkSvg = renderSketchConsolidationAuditSvg(result, { theme: "dark" });

    for (const svg of [lightSvg, darkSvg]) {
      expect(svg).toContain("<svg ");
      expect(svg).toContain("oklch(");
      expect(svg).toContain('data-layer="rough-pencil-underlay"');
      expect(svg).toContain('data-layer="gpen-consolidated-ink"');
      expect(svg).toContain('data-layer="cluster-audit-panel"');
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/\brgba?\s*\(/i);
      expect(svg).not.toMatch(/\bhsla?\s*\(/i);
      expect(svg).not.toMatch(/\b(?:NaN|Infinity)\b/);
    }
  });

  it("32. SVG 제목의 XML/XSS 특수문자(<, >, &, \", ')를 안전하게 이스케이프한다", () => {
    const result = consolidateRoughSketchToCleanInk([]);
    const rawTitle = `<script>alert("xss" & 'probe')</script>`;
    const svg = renderSketchConsolidationAuditSvg(result, { title: rawTitle });

    expect(svg).not.toContain("<script>");
    expect(svg).toContain(escapeSvgXml(rawTitle));
  });

  it("33. 한국어 선화 클린업 QA 브리프가 자연스러운 문장으로 작성되며 번역투 문구가 0건이다", () => {
    const truth = sampleArc(140, 140, 95, -Math.PI * 0.7, -Math.PI * 0.15, 48);
    const bundle = buildNoisyOverdrawBundle(truth, "ko", [-4.5, -2.2, -0.5, 0.5, 2.2, 4.5], {
      reverseFlags: [false, true, false, true, false, true],
    });
    const result = consolidateRoughSketchToCleanInk(bundle);
    const ink = result.inkStrokes[0];
    expect(ink).toBeDefined();
    if (!ink) return;
    const accuracy = evaluateCenterlineAccuracyAgainstReference(truth, ink, bundle);
    const report = summarizeSketchConsolidationKo(result, accuracy);

    expect(report.verdictKo).toBe("통과");
    expect(report.orthogonalSafe).toBe(true);
    expect(report.fullTextKo).toContain("□ ");
    expect(report.fullTextKo).toContain("  ㅇ ");
    expect(report.accuracyLineKo).not.toBeNull();
    expect(report.fullTextKo).not.toContain("가능하게 합니다");
    expect(report.fullTextKo).not.toContain("직관적인 경험을 제공");
    expect(report.fullTextKo).not.toContain("원활한 워크플로우를 보장");
  });

  it("34. clusterOverdrawnSketchStrokes 단독 호출 시 클러스터와 직교 분리 카운트를 정확히 반환한다", () => {
    const h = buildNoisyOverdrawBundle(sampleLine(20, 100, 180, 100, 30), "ch", [-2, 0, 2], {
      waveAmpPx: 0.4,
    });
    const v = buildNoisyOverdrawBundle(sampleLine(100, 20, 100, 180, 30), "cv", [-2, 0, 2], {
      waveAmpPx: 0.4,
    });
    const clustered = clusterOverdrawnSketchStrokes([...h, ...v]);

    expect(clustered.clusters).toHaveLength(2);
    expect(clustered.validInputStrokes).toBe(6);
    expect(clustered.orthogonalFalseMergeCount).toBe(0);
    expect(clustered.orthogonalRejectedPairs).toBeGreaterThanOrEqual(9);
  });
});
