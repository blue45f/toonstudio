import { describe, expect, it } from "vitest";

import {
  AdaptiveSmartBrushStabilizer,
  clipSegmentOutsideSafeEllipses,
  compositeLinearInkOverPaper,
  computeDiscreteMengerCurvature,
  computeThinLensCocRadiusPx,
  createPremultipliedLinearBuffer,
  decomposeCutDepthParallaxPlanes,
  downsamplePremultipliedCrispInkMip,
  generateClippedParallelSpeedLines,
  generateClippedRadialFocusLines,
  isPointInsideRotatedSafeEllipse,
  linearChannelToSrgb8,
  MAX_INK_POOL_MULTIPLIER_HARD_CAP,
  projectStylusNibFootprint,
  rasterizeAnisotropicCapsuleSegment,
  RGSS_4X_SUBPIXEL_OFFSETS,
  simulateStrokeEndpointInkPooling,
  srgb8ChannelToLinear,
  type ProceduralInkLineSegment,
  type RawStylusSample,
  type RotatedSafeEllipse,
} from "./index";

function countSafeEllipseIntrusions(
  segments: readonly ProceduralInkLineSegment[],
  ellipses: readonly RotatedSafeEllipse[],
): number {
  let intrusions = 0;
  for (const seg of segments) {
    for (let step = 0; step <= 20; step += 1) {
      const t = step / 20;
      const px = seg.x0 + (seg.x1 - seg.x0) * t;
      const py = seg.y0 + (seg.y1 - seg.y0) * t;
      for (const ellipse of ellipses) {
        if (isPointInsideRotatedSafeEllipse(px, py, ellipse)) intrusions += 1;
      }
    }
  }
  return intrusions;
}

describe("wasm64-wave38-hdr-subpixel-smart-brush", () => {
  it("1. 4x 회전 격자(RGSS) 서브픽셀 오프셋은 원점 점대칭과 90도 회전 불변성을 만족한다", () => {
    expect(RGSS_4X_SUBPIXEL_OFFSETS).toHaveLength(4);
    const sumX = RGSS_4X_SUBPIXEL_OFFSETS.reduce((acc, p) => acc + p[0], 0);
    const sumY = RGSS_4X_SUBPIXEL_OFFSETS.reduce((acc, p) => acc + p[1], 0);
    expect(sumX).toBeCloseTo(0, 10);
    expect(sumY).toBeCloseTo(0, 10);

    for (const [ox, oy] of RGSS_4X_SUBPIXEL_OFFSETS) {
      const hasInverted = RGSS_4X_SUBPIXEL_OFFSETS.some(
        ([qx, qy]) => Math.abs(qx + ox) < 1e-9 && Math.abs(qy + oy) < 1e-9,
      );
      const hasRotated90 = RGSS_4X_SUBPIXEL_OFFSETS.some(
        ([qx, qy]) => Math.abs(qx + oy) < 1e-9 && Math.abs(qy - ox) < 1e-9,
      );
      expect(hasInverted).toBe(true);
      expect(hasRotated90).toBe(true);
    }
  });

  it("2. 수평 중심선 캡슐 래스터화 시 상하 픽셀 행의 서브픽셀 커버리지가 정확히 대칭이다", () => {
    const res = rasterizeAnisotropicCapsuleSegment({
      width: 16,
      height: 16,
      x0: 3,
      y0: 8,
      x1: 13,
      y1: 8,
      radiusPx: 1.15,
    });
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const aTop = res.buffer.data[(y * 16 + x) * 4 + 3] ?? 0;
        const aBottom = res.buffer.data[((15 - y) * 16 + x) * 4 + 3] ?? 0;
        expect(aTop).toBeCloseTo(aBottom, 6);
      }
    }
  });

  it("3. 수직 중심선 캡슐의 좌우 대칭성과 +45도/-45도 대각선 총 잉크 커버리지 불변성을 보장한다", () => {
    const vertical = rasterizeAnisotropicCapsuleSegment({
      width: 16,
      height: 16,
      x0: 8,
      y0: 3,
      x1: 8,
      y1: 13,
      radiusPx: 0.95,
    });
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const aLeft = vertical.buffer.data[(y * 16 + x) * 4 + 3] ?? 0;
        const aRight = vertical.buffer.data[(y * 16 + (15 - x)) * 4 + 3] ?? 0;
        expect(aLeft).toBeCloseTo(aRight, 6);
      }
    }

    const diagPos = rasterizeAnisotropicCapsuleSegment({
      width: 20,
      height: 20,
      x0: 4,
      y0: 4,
      x1: 16,
      y1: 16,
      radiusPx: 0.9,
    });
    const diagNeg = rasterizeAnisotropicCapsuleSegment({
      width: 20,
      height: 20,
      x0: 4,
      y0: 16,
      x1: 16,
      y1: 4,
      radiusPx: 0.9,
    });
    expect(diagPos.totalInkCoverage).toBeCloseTo(diagNeg.totalInkCoverage, 5);
  });

  it("4. 가변 반지름 캡슐의 시작점과 끝점을 뒤집어도 픽셀별 커버리지가 동일하다", () => {
    const forward = rasterizeAnisotropicCapsuleSegment({
      width: 24,
      height: 24,
      x0: 4.3,
      y0: 6.7,
      x1: 19.2,
      y1: 17.4,
      radiusStartPx: 0.55,
      radiusEndPx: 1.75,
    });
    const backward = rasterizeAnisotropicCapsuleSegment({
      width: 24,
      height: 24,
      x0: 19.2,
      y0: 17.4,
      x1: 4.3,
      y1: 6.7,
      radiusStartPx: 1.75,
      radiusEndPx: 0.55,
    });
    expect(forward.totalInkCoverage).toBeCloseTo(backward.totalInkCoverage, 5);
    for (let i = 0; i < forward.buffer.data.length; i += 1) {
      expect(forward.buffer.data[i] ?? 0).toBeCloseTo(backward.buffer.data[i] ?? 0, 5);
    }
  });

  it("5. 법선 선명도(normalSharpness)와 접선 선명도(tangentialSharpness)를 분리 제어해 회색 번짐을 억제한다", () => {
    const crisp = rasterizeAnisotropicCapsuleSegment({
      width: 24,
      height: 24,
      x0: 4,
      y0: 12.25,
      x1: 20,
      y1: 12.25,
      radiusPx: 1.4,
      normalSharpness: 0.96,
      tangentialSharpness: 0.2,
    });
    const soft = rasterizeAnisotropicCapsuleSegment({
      width: 24,
      height: 24,
      x0: 4,
      y0: 12.25,
      x1: 20,
      y1: 12.25,
      radiusPx: 1.4,
      normalSharpness: 0.08,
      tangentialSharpness: 0.2,
    });
    const countMidGray = (arr: Float32Array): number => {
      let count = 0;
      for (let i = 3; i < arr.length; i += 4) {
        const a = arr[i] ?? 0;
        if (a > 0.08 && a < 0.88) count += 1;
      }
      return count;
    };
    expect(countMidGray(crisp.buffer.data)).toBeLessThan(countMidGray(soft.buffer.data));
  });

  it("6. 600dpi 극세 속눈썹 선(반지름 0.2px 미만)도 픽셀 사이에서 소실되지 않고 광학 밀도를 유지한다", () => {
    const hairline = rasterizeAnisotropicCapsuleSegment({
      width: 16,
      height: 16,
      x0: 2,
      y0: 8.31,
      x1: 14,
      y1: 8.69,
      radiusPx: 0.18,
    });
    expect(hairline.touchedPixelCount).toBeGreaterThanOrEqual(12);
    expect(hairline.peakAlpha).toBeGreaterThan(0.2);
    expect(hairline.totalInkCoverage).toBeGreaterThan(2.5);
  });

  it("7. 2x 및 4x 프리멀티플라이드 선명 밉맵 다운샘플링 시 가는 속눈썹과 해칭 밀도를 보존한다", () => {
    const canvas = createPremultipliedLinearBuffer(64, 64);
    rasterizeAnisotropicCapsuleSegment({
      width: 64,
      height: 64,
      x0: 8,
      y0: 18.4,
      x1: 56,
      y1: 22.4,
      radiusPx: 0.45,
      target: canvas,
    });
    rasterizeAnisotropicCapsuleSegment({
      width: 64,
      height: 64,
      x0: 12,
      y0: 44.2,
      x1: 52,
      y1: 38.6,
      radiusPx: 0.4,
      target: canvas,
    });

    const mip2x = downsamplePremultipliedCrispInkMip({ source: canvas, factor: 2 });
    const mip4x = downsamplePremultipliedCrispInkMip({ source: canvas, factor: 4 });
    expect(mip2x.buffer.width).toBe(32);
    expect(mip4x.buffer.width).toBe(16);
    expect(mip2x.peakRetentionRatioVsBox).toBeGreaterThan(1.2);
    expect(mip4x.peakRetentionRatioVsBox).toBeGreaterThan(1.45);

    for (let i = 0; i < mip4x.buffer.data.length; i += 4) {
      const a = mip4x.buffer.data[i + 3] ?? 0;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      expect(mip4x.buffer.data[i] ?? 0).toBeLessThanOrEqual(a + 1e-6);
    }
  });

  it("8. 선명 밉맵 다운샘플러는 빈 배경을 0으로 유지하고 균일한 평칠 톤을 인위적으로 어둡게 만들지 않는다", () => {
    const empty = createPremultipliedLinearBuffer(16, 16);
    const emptyMip = downsamplePremultipliedCrispInkMip({ source: empty, factor: 4 });
    expect(emptyMip.peakAlpha).toBe(0);
    expect(emptyMip.meanAlpha).toBe(0);

    const flatWash = createPremultipliedLinearBuffer(16, 16);
    for (let i = 0; i < flatWash.data.length; i += 4) {
      flatWash.data[i] = 0.1;
      flatWash.data[i + 1] = 0.1;
      flatWash.data[i + 2] = 0.1;
      flatWash.data[i + 3] = 0.35;
    }
    const washMip = downsamplePremultipliedCrispInkMip({ source: flatWash, factor: 4 });
    expect(washMip.peakAlpha).toBeCloseTo(0.35, 6);
    expect(washMip.meanAlpha).toBeCloseTo(0.35, 6);
  });

  it("9. 선형 광량 원고지 합성기는 50% 반투명 흑색 잉크를 감마 왜곡(128) 없이 정확한 sRGB 188로 합성한다", () => {
    const halfInk = createPremultipliedLinearBuffer(2, 2);
    halfInk.data[3] = 0.5;
    const comp = compositeLinearInkOverPaper({
      ink: halfInk,
      paperSrgb8: { r: 255, g: 255, b: 255 },
    });
    expect(comp.linearRgb[0]).toBeCloseTo(0.5, 5);
    expect(comp.srgb8Rgba[0]).toBe(188);
    expect(comp.srgb8Rgba[3]).toBe(255);
    expect(comp.srgb8Rgba[4]).toBe(255);
  });

  it("10. 컬러 잉크와 따뜻한 미색 원고지 및 HDR 노출 보정(exposureStops) 합성이 정확히 동작한다", () => {
    const ink = createPremultipliedLinearBuffer(1, 1);
    ink.data[0] = 0.25;
    ink.data[1] = 0.05;
    ink.data[2] = 0.02;
    ink.data[3] = 0.5;
    const paper = { r: 250, g: 247, b: 240 };
    const base = compositeLinearInkOverPaper({ ink, paperSrgb8: paper, exposureStops: 0 });
    const brighter = compositeLinearInkOverPaper({ ink, paperSrgb8: paper, exposureStops: 0.6 });
    expect(brighter.linearRgb[0] ?? 0).toBeGreaterThan(base.linearRgb[0] ?? 0);
    expect(brighter.srgb8Rgba[0] ?? 0).toBeGreaterThan(base.srgb8Rgba[0] ?? 0);
  });

  it("11. sRGB 8비트와 선형 광량 변환 함수가 왕복 정합성과 단조 증가성을 만족한다", () => {
    expect(srgb8ChannelToLinear(0)).toBe(0);
    expect(srgb8ChannelToLinear(255)).toBeCloseTo(1, 6);
    for (const v of [0, 12, 64, 128, 188, 240, 255]) {
      expect(linearChannelToSrgb8(srgb8ChannelToLinear(v))).toBe(v);
    }
  });

  it("12. 3점 이산 멩거 곡률은 일직선에서 0을 반환하고 원호에서 반지름의 역수(1/R)에 수렴한다", () => {
    expect(computeDiscreteMengerCurvature(0, 0, 10, 0, 20, 0)).toBe(0);
    const r = 50;
    const kappa = computeDiscreteMengerCurvature(
      Math.cos(0.2) * r,
      Math.sin(0.2) * r,
      Math.cos(0.35) * r,
      Math.sin(0.35) * r,
      Math.cos(0.5) * r,
      Math.sin(0.5) * r,
    );
    expect(kappa).toBeCloseTo(1 / r, 4);
  });

  it("13. 생체역학 스마트 브러시 보정기는 느린 외곽선 곡선의 수직 손떨림 노이즈를 크게 줄인다", () => {
    const stabilizer = new AdaptiveSmartBrushStabilizer();
    const noisySamples: RawStylusSample[] = [];
    const radius = 160;
    for (let i = 0; i < 45; i += 1) {
      const theta = (i / 44) * 0.45;
      const jitter = (i % 2 === 0 ? 1 : -1) * 1.9;
      noisySamples.push({
        x: Math.cos(theta) * (radius + jitter),
        y: Math.sin(theta) * (radius + jitter),
        pressure: 0.65,
        timestampMs: 1_000 + i * 10,
      });
    }

    const stabilized = stabilizer.processStroke(noisySamples);
    let rawJitterSum = 0;
    let filteredJitterSum = 0;
    for (let i = 10; i < stabilized.length; i += 1) {
      const s = stabilized[i];
      if (!s) continue;
      rawJitterSum += Math.abs(Math.hypot(s.rawX, s.rawY) - radius);
      filteredJitterSum += Math.abs(Math.hypot(s.x, s.y) - radius);
    }
    expect(filteredJitterSum).toBeLessThan(rawJitterSum * 0.45);
  });

  it("14. 빠른 크로스해칭 플릭에서는 차단 주파수를 높여 지연(lagDistancePx)을 최소화한다", () => {
    const slowOut = new AdaptiveSmartBrushStabilizer().processStroke(
      Array.from({ length: 16 }, (_, i) => ({
        x: i * 0.7,
        y: Math.sin(i * 0.35) * 3,
        timestampMs: 2_000 + i * 12,
      })),
    );
    const fastOut = new AdaptiveSmartBrushStabilizer().processStroke(
      Array.from({ length: 16 }, (_, i) => ({
        x: i * 22,
        y: i * 14,
        timestampMs: 2_000 + i * 8,
      })),
    );
    const slowTail = slowOut[slowOut.length - 1];
    const fastTail = fastOut[fastOut.length - 1];

    expect(fastTail?.adaptiveCutoffHz ?? 0).toBeGreaterThan((slowTail?.adaptiveCutoffHz ?? 0) * 5);
    expect(fastTail?.smoothingAlpha ?? 0).toBeGreaterThan(0.75);
    expect(fastTail?.smoothingAlpha ?? 0).toBeGreaterThan(slowTail?.smoothingAlpha ?? 1);
  });

  it("15. 스타일러스 기울기 각도에 따라 펜촉 타원 종횡비와 장축 방위각이 정확히 투영된다", () => {
    const upright = projectStylusNibFootprint({ tiltXDeg: 0, tiltYDeg: 0 });
    expect(upright.aspectRatio).toBe(1);
    expect(upright.zenithTiltDeg).toBe(0);

    const tiltedX = projectStylusNibFootprint({ tiltXDeg: 55, tiltYDeg: 0 });
    const tiltedSteep = projectStylusNibFootprint({ altitudeDeg: 22, azimuthDeg: 90 });
    expect(tiltedX.aspectRatio).toBeGreaterThan(1.8);
    expect(tiltedX.azimuthRad).toBeCloseTo(0, 5);
    expect(tiltedSteep.aspectRatio).toBeGreaterThan(tiltedX.aspectRatio);
    expect(tiltedSteep.azimuthRad).toBeCloseTo(Math.PI / 2, 5);
  });

  it("16. 명시적 timestampMs 기반 스트로크 처리는 reset 후 재실행해도 완전히 결정적이다", () => {
    const stabilizer = new AdaptiveSmartBrushStabilizer();
    const stroke: RawStylusSample[] = [
      { x: 10, y: 20, pressure: 0.4, tiltXDeg: 15, tiltYDeg: -10, timestampMs: 5_000 },
      { x: 14, y: 25, pressure: 0.55, tiltXDeg: 16, tiltYDeg: -9, timestampMs: 5_008 },
      { x: 21, y: 31, pressure: 0.7, tiltXDeg: 18, tiltYDeg: -8, timestampMs: 5_016 },
      { x: 30, y: 36, pressure: 0.65, tiltXDeg: 18, tiltYDeg: -8, timestampMs: 5_024 },
    ];
    expect(stabilizer.processStroke(stroke)).toEqual(stabilizer.processStroke(stroke));
  });

  it("17. 스트로크 끝점 장시간 체류 시 먹 맺힘 배율은 포화 곡선을 따르며 절대 상한을 넘지 않는다", () => {
    const samples: RawStylusSample[] = [
      { x: 100, y: 100, pressure: 0.85, timestampMs: 1_000 },
      { x: 100.2, y: 100.1, pressure: 0.85, timestampMs: 1_120 },
      { x: 100.3, y: 100.2, pressure: 0.9, timestampMs: 1_400 },
      { x: 100.3, y: 100.2, pressure: 0.95, timestampMs: 12_000 },
    ];
    const res = simulateStrokeEndpointInkPooling(samples, {
      baseRadiusPx: 2.4,
      maxPoolRadiusBoost: 0.4,
    });
    expect(res.endPoolingMultiplier).toBeGreaterThan(1.25);
    expect(res.endPoolingMultiplier).toBeLessThanOrEqual(1.4 + 1e-6);
    expect(res.endPoolingMultiplier).toBeLessThanOrEqual(MAX_INK_POOL_MULTIPLIER_HARD_CAP);
    for (const s of res.samples) {
      expect(s.poolingMultiplier).toBeGreaterThanOrEqual(1);
      expect(s.poolingMultiplier).toBeLessThanOrEqual(1.4 + 1e-6);
      expect(s.effectiveOpacity).toBeGreaterThanOrEqual(0);
      expect(s.effectiveOpacity).toBeLessThanOrEqual(1);
    }
  });

  it("18. 빠른 필압 해제 플릭 시 스트로크 말단 반지름이 바늘 끝처럼 매끄럽게 가늘어진다", () => {
    const flickSamples: RawStylusSample[] = [
      { x: 20, y: 100, pressure: 0.75, timestampMs: 3_000 },
      { x: 45, y: 100, pressure: 0.72, timestampMs: 3_010 },
      { x: 75, y: 100, pressure: 0.5, timestampMs: 3_018 },
      { x: 112, y: 100, pressure: 0.18, timestampMs: 3_026 },
      { x: 152, y: 100, pressure: 0.04, timestampMs: 3_034 },
    ];
    const res = simulateStrokeEndpointInkPooling(flickSamples, {
      baseRadiusPx: 2.5,
      releaseTaperLengthPx: 45,
      minTipRadiusRatio: 0.08,
    });
    const firstRadius = res.samples[0]?.effectiveRadiusPx ?? 0;
    const lastRadius = res.samples[res.samples.length - 1]?.effectiveRadiusPx ?? 0;
    expect(res.endTaperMultiplier).toBeCloseTo(0.08, 4);
    expect(lastRadius).toBeLessThan(firstRadius * 0.15);
  });

  it("19. 2.5D 깊이 평면 분해기는 원경부터 근경 순(화가 알고리즘)으로 결정적 정렬을 수행한다", () => {
    const result = decomposeCutDepthParallaxPlanes(
      [
        { layerId: "fg-blade", role: "foreground-prop", depthMeters: 1.1 },
        { layerId: "hero", role: "character-focus", depthMeters: 3.0 },
        { layerId: "sky", role: "skybox", depthMeters: 60 },
        { layerId: "alley-wall", role: "far-bg", depthMeters: 12 },
      ],
      { focalDistanceMeters: 3.0, cameraPanX: 0.5 },
    );
    expect(result.planes.map((p) => p.layerId)).toEqual(["sky", "alley-wall", "hero", "fg-blade"]);
    expect(result.planes.map((p) => p.painterOrderIndex)).toEqual([0, 1, 2, 3]);
  });

  it("20. 초점 평면 레이어는 정확히 cocRadiusPx === 0 이며 초점에서 멀어질수록 착란원 반경이 커진다", () => {
    expect(Object.is(computeThinLensCocRadiusPx(3.0, 3.0), 0)).toBe(true);
    const result = decomposeCutDepthParallaxPlanes(
      [
        { layerId: "far", depthMeters: 18 },
        { layerId: "mid", depthMeters: 5.5 },
        { layerId: "focus-char", depthMeters: 3.0 },
        { layerId: "near-petal", depthMeters: 1.2 },
      ],
      { focalDistanceMeters: 3.0, cameraPanX: 0.8, cameraPanY: -0.4 },
    );
    const focusPlane = result.planes.find((p) => p.layerId === "focus-char");
    const midPlane = result.planes.find((p) => p.layerId === "mid");
    const farPlane = result.planes.find((p) => p.layerId === "far");
    const nearPlane = result.planes.find((p) => p.layerId === "near-petal");

    expect(focusPlane?.isAtFocalPlane).toBe(true);
    expect(Object.is(focusPlane?.cocRadiusPx, 0)).toBe(true);
    expect(Object.is(focusPlane?.parallaxShiftX, 0)).toBe(true);
    expect(Object.is(focusPlane?.parallaxShiftY, 0)).toBe(true);
    expect(farPlane?.cocRadiusPx ?? 0).toBeGreaterThan(midPlane?.cocRadiusPx ?? 0);
    expect(nearPlane?.cocRadiusPx ?? 0).toBeGreaterThan(0);
  });

  it("21. prefersReducedMotion 활성화 시 모든 깊이 평면의 패럴랙스 변위를 정확히 0으로 고정한다", () => {
    const reduced = decomposeCutDepthParallaxPlanes(
      [
        { layerId: "sky", depthMeters: 50 },
        { layerId: "hero", depthMeters: 3.0 },
        { layerId: "fg", depthMeters: 0.9 },
      ],
      {
        focalDistanceMeters: 3.0,
        cameraPanX: 1,
        cameraPanY: -1,
        scrollDeltaNormalized: 0.9,
        prefersReducedMotion: true,
      },
    );
    expect(reduced.prefersReducedMotion).toBe(true);
    for (const plane of reduced.planes) {
      expect(Object.is(plane.parallaxShiftX, 0)).toBe(true);
      expect(Object.is(plane.parallaxShiftY, 0)).toBe(true);
    }
  });

  it("22. 방사형 집중선은 회전된 캐릭터 얼굴 및 말풍선 안전 타원 내부에 단 하나의 정점도 침범하지 않는다", () => {
    const safeEllipses: readonly RotatedSafeEllipse[] = [
      { id: "hero-face", centerX: 540, centerY: 480, radiusX: 115, radiusY: 145, rotationDeg: 24 },
      { id: "speech-1", centerX: 290, centerY: 310, radiusX: 140, radiusY: 85, rotationDeg: -18 },
      { id: "speech-2", centerX: 790, centerY: 690, radiusX: 130, radiusY: 90, rotationDeg: 12 },
    ];
    const focus = generateClippedRadialFocusLines({
      canvasWidth: 1080,
      canvasHeight: 1200,
      focusCenterX: 540,
      focusCenterY: 480,
      lineCount: 120,
      innerClearRadiusPx: 40,
      safeEllipses,
      seed: 20261127,
    });
    expect(focus.segments.length).toBeGreaterThan(80);
    expect(focus.clippedRayCount).toBeGreaterThan(0);
    expect(focus.intrudingVertexCount).toBe(0);
    expect(countSafeEllipseIntrusions(focus.segments, safeEllipses)).toBe(0);
  });

  it("23. 대각 속도선은 다중 회전 안전 타원을 가로지를 때 외곽 구간으로만 정확히 분할되어 0-침범을 보장한다", () => {
    const safeEllipses: readonly RotatedSafeEllipse[] = [
      { id: "face", centerX: 400, centerY: 420, radiusX: 110, radiusY: 135, rotationDeg: -32 },
      { id: "dialogue", centerX: 670, centerY: 360, radiusX: 155, radiusY: 95, rotationDeg: 21 },
    ];
    expect(clipSegmentOutsideSafeEllipses(80, 420, 920, 380, safeEllipses, 2).length).toBeGreaterThanOrEqual(2);

    const speed = generateClippedParallelSpeedLines({
      canvasWidth: 1000,
      canvasHeight: 900,
      directionDeg: -27,
      lineCount: 96,
      safeEllipses,
      seed: 38099,
    });
    expect(speed.segments.length).toBeGreaterThan(60);
    expect(speed.clippedRayCount).toBeGreaterThan(0);
    expect(speed.intrudingVertexCount).toBe(0);
    expect(countSafeEllipseIntrusions(speed.segments, safeEllipses)).toBe(0);
  });

  it("24. 절차적 집중선·속도선 생성기는 동일 시드에서 완전히 동일한 출력을 재현한다", () => {
    const ellipses: readonly RotatedSafeEllipse[] = [
      { centerX: 320, centerY: 320, radiusX: 90, radiusY: 110, rotationDeg: 15 },
    ];
    const baseOpts = { canvasWidth: 640, canvasHeight: 640, focusCenterX: 320, focusCenterY: 320, safeEllipses: ellipses };
    const runA = generateClippedRadialFocusLines({ ...baseOpts, seed: 777 });
    const runB = generateClippedRadialFocusLines({ ...baseOpts, seed: 777 });
    const runC = generateClippedRadialFocusLines({ ...baseOpts, seed: 778 });
    expect(runB).toEqual(runA);
    expect(runC.segments[0]?.angleRad).not.toBe(runA.segments[0]?.angleRad);
  });
});
