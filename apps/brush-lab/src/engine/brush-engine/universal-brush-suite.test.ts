import { describe, expect, it } from "vitest";

import {
  evaluateLabKlecksBlendAndSmudgeStep,
  evaluateLabMyPaintOpaqueLinearizeAndPosterize,
  evaluateLabPerfectFreehandSimulatedPressureAndRadius,
  evaluateLabSaiWatercolorPressure,
  evaluateLabSculptGlQuarticFalloff01,
  evaluateLabWickCroquisPressure01,
  filterLabPixelPerfectCells,
  fitLabSchneiderCubicBezier,
  generateLabHarmonySegments,
  generateLabRoughLehmerDoubleStroke,
  mixLabLuminanceWeightedKubelkaMunk,
  stepLabKmMixerBrushReservoir,
  stepLabLazyBrushCircularFriction,
  warpLabSkeletalNonStretchU01,
} from "./universal-brush-suite";

describe("universal-brush-suite (Sumi 클린룸 범용 브러시 커널 Wave 21 & Wave 22)", () => {
  it("Harmony 절차적 브러시 모드별로 결정론적 근접 코드 세그먼트를 생성한다", () => {
    const anchors = Array.from({ length: 12 }, (_, idx) => ({
      x: 10 + idx * 6,
      y: 20 + Math.sin(idx) * 4,
      pressure01: 0.85,
    }));

    const sketchy = generateLabHarmonySegments("sketchy", anchors, 42);
    const shaded = generateLabHarmonySegments("shaded", anchors, 42);
    const chrome = generateLabHarmonySegments("chrome", anchors, 42);
    const fur = generateLabHarmonySegments("fur", anchors, 42);
    const longfur = generateLabHarmonySegments("longfur", anchors, 42);
    const web = generateLabHarmonySegments("web", anchors, 42);

    expect(sketchy.some((seg) => seg.isChordLink)).toBe(true);
    expect(shaded.some((seg) => seg.isChordLink)).toBe(true);
    expect(chrome.some((seg) => seg.isChordLink)).toBe(true);
    expect(fur.some((seg) => seg.isChordLink)).toBe(true);
    expect(longfur.some((seg) => seg.isChordLink)).toBe(true);
    expect(web.some((seg) => seg.isChordLink)).toBe(true);
  });

  it("Kubelka-Munk 기반 Mixer Brush 저수조 스텝이 캔버스 안료 흡수와 착색을 동시에 수행한다", () => {
    const step = stepLabKmMixerBrushReservoir({
      wet01: 0.8,
      load01: 0.65,
      mix01: 0.7,
      flow01: 0.9,
      canvasRgb: [0.95, 0.85, 0.1],
      reservoirRgb: [0.1, 0.25, 0.9],
      supplyRgb: [0.1, 0.25, 0.9],
    });

    expect(step.transfer01).toBeGreaterThan(0.5);
    expect(step.reservoirRgb[1]).toBeGreaterThan(0.25);
    expect(step.canvasRgb[2]).toBeGreaterThan(0.1);
  });

  it("SAI Ver.2 수채화 필압 임계값 이하에서는 블러 전용, 초과 시 안료 착색 모드로 전환한다", () => {
    const light = evaluateLabSaiWatercolorPressure(0.15, 0.28, 0.2, 0.8);
    expect(light.isBlurOnlyMode).toBe(true);
    expect(light.depositAlpha01).toBe(0);
    expect(light.blurStrength01).toBeGreaterThan(0.5);

    const firm = evaluateLabSaiWatercolorPressure(0.85, 0.28, 0.2, 0.8);
    expect(firm.isBlurOnlyMode).toBe(false);
    expect(firm.depositAlpha01).toBeGreaterThan(0.75);
  });

  it("Pixel-Perfect 1px 직각 L-코너 계단 픽셀을 제거한다", () => {
    const raw = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ];
    const filtered = filterLabPixelPerfectCells(raw);
    expect(filtered).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  it("Wave 22 SculptGL C^2 4차 다항식 폴오프, Lazy-Brush 원형 마찰 감쇠, 골격 비신축 가이드 매핑이 정확히 동작한다", () => {
    expect(evaluateLabSculptGlQuarticFalloff01(0)).toBe(1);
    expect(evaluateLabSculptGlQuarticFalloff01(0.5)).toBeCloseTo(0.6875, 4);
    expect(evaluateLabSculptGlQuarticFalloff01(1)).toBe(0);

    const stay = stepLabLazyBrushCircularFriction({
      brushX: 0,
      brushY: 0,
      pointerX: 12,
      pointerY: 0,
      radiusPx: 20,
      friction01: 0.5,
    });
    expect(stay.hasMoved).toBe(false);

    const move = stepLabLazyBrushCircularFriction({
      brushX: 0,
      brushY: 0,
      pointerX: 50,
      pointerY: 0,
      radiusPx: 20,
      friction01: 0.5,
    });
    expect(move.hasMoved).toBe(true);
    expect(move.brushX).toBeGreaterThan(0);

    const headU = warpLabSkeletalNonStretchU01({
      arcPositionPx: 15,
      totalSpineArcPx: 300,
      nominalLengthPx: 150,
      headGuide01: 0.2,
      tailGuide01: 0.8,
    });
    expect(headU).toBeCloseTo(0.1, 3);
  });

  it("Wave 23 Schneider 3차 베지어 피팅, Klecks KM 블렌드/스머지 스캔라인, Wick Croquis 필압 매핑이 정확히 동작한다", () => {
    const fitted = fitLabSchneiderCubicBezier([
      { x: 0, y: 0 },
      { x: 25, y: 18 },
      { x: 55, y: 22 },
      { x: 90, y: 5 },
    ]);
    expect(fitted).not.toBeNull();
    expect(fitted?.p0).toEqual({ x: 0, y: 0 });
    expect(fitted?.p3).toEqual({ x: 90, y: 5 });
    expect(fitted?.ctrl1.y).toBeGreaterThan(0);

    const klecks = evaluateLabKlecksBlendAndSmudgeStep({
      sizePx: 18,
      opacity01: 0.8,
      blending01: 0.7,
      prevY: 10,
      currY: 30,
      brushRgb: [0.1, 0.3, 0.9],
      canvasRgb: [0.95, 0.85, 0.15],
    });
    expect(klecks.adaptiveSpacingPx).toBeCloseTo(4, 3);
    expect(klecks.radialSharpness01).toBeCloseTo(0.512, 3);
    expect(klecks.smudgeScanlineOrder).toBe("bottom-to-top");
    expect(klecks.mixedRgb[1]).toBeGreaterThan(0.3);

    expect(evaluateLabWickCroquisPressure01(0)).toBeCloseTo(0.14, 4);
    expect(evaluateLabWickCroquisPressure01(1)).toBeCloseTo(1.0, 4);
  });

  it("Wave 24 MyPaint opaque_linearize 광학 선형화·포스터라이즈 양자화 및 spectral.js 휘도 가중 KM 혼합이 정확히 동작한다", () => {
    const myPaint = evaluateLabMyPaintOpaqueLinearizeAndPosterize({
      baseOpaque01: 0.8,
      opaqueLinearize01: 0.9,
      dabsPerRadius: 3,
      rgb01: [0.78, 0.42, 0.19],
      posterize01: 1.0,
      posterizeNum: 0.04,
    });
    expect(myPaint.linearizedAlphaPerDab01).toBeLessThan(0.8);
    expect(myPaint.linearizedAlphaPerDab01).toBeGreaterThan(0.2);
    expect(myPaint.quantizedRgb01[0]).toBeCloseTo(0.75, 2);

    const mixed = mixLabLuminanceWeightedKubelkaMunk({
      rgbA: [0.05, 0.2, 0.9],
      factorA: 0.5,
      tintingStrengthA: 1.2,
      rgbB: [0.95, 0.85, 0.1],
      factorB: 0.5,
      tintingStrengthB: 1.0,
    });
    expect(mixed[1]).toBeGreaterThan(0.25);
  });

  it("Wave 25 perfect-freehand 속도 기반 가상 필압·박화 반경 및 rough.js Park-Miller Lehmer LCG 이중선 오프셋이 정확히 동작한다", () => {
    const pfSlow = evaluateLabPerfectFreehandSimulatedPressureAndRadius({
      prevPressure01: 0.5,
      distancePx: 2,
      sizePx: 16,
      thinning: 0.7,
      runningLengthPx: 24,
      totalLengthPx: 80,
      taperStartPx: 12,
      taperEndPx: 16,
    });
    const pfFast = evaluateLabPerfectFreehandSimulatedPressureAndRadius({
      prevPressure01: 0.5,
      distancePx: 15,
      sizePx: 16,
      thinning: 0.7,
      runningLengthPx: 24,
      totalLengthPx: 80,
      taperStartPx: 12,
      taperEndPx: 16,
    });
    expect(pfSlow.simulatedPressure01).toBeGreaterThan(pfFast.simulatedPressure01);
    expect(pfSlow.radiusPx).toBeGreaterThan(pfFast.radiusPx);

    const roughShort = generateLabRoughLehmerDoubleStroke({
      x1: 10,
      y1: 20,
      x2: 110,
      y2: 40,
      roughness: 1.4,
      bowing: 1.2,
      seed: 20261026,
    });
    const roughLong = generateLabRoughLehmerDoubleStroke({
      x1: 0,
      y1: 0,
      x2: 600,
      y2: 0,
      roughness: 1.4,
      bowing: 1.2,
      seed: 20261026,
    });
    expect(roughShort.dampingFactor).toBe(1);
    expect(roughLong.dampingFactor).toBeCloseTo(0.4, 4);
    expect(roughShort.firstPassMidpoint.x).not.toBe(roughShort.secondPassMidpoint.x);
  });
});
