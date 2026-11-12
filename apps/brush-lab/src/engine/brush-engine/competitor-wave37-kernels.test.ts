import { describe, expect, it } from "vitest";

import {
  evaluateAnisotropicSmudgeReservoirAndRake,
  evaluateCapillaryCauliflowerAndGranulation,
  evaluateCentrifugalBristleTurnSplayAndTilt,
  evaluateCentripetalCatmullCurvatureAdaptiveStamps,
  evaluateSubpixelDualEnvelopeLineartAA,
} from "./competitor-wave37-kernels";

describe("Wave 37 경쟁사 패리티 R&D 커널 검증", () => {
  it("구심(alpha=0.5) Catmull-Rom 곡률 적응형 스탬프가 균일 선형 보간 대비 콩알자국(scallop)과 코너 꺾임을 유의미하게 줄인다", () => {
    const report = evaluateCentripetalCatmullCurvatureAdaptiveStamps({
      controlPoints: [
        { x: 6, y: 44, pressure01: 0.3 },
        { x: 32, y: 8, pressure01: 0.78 },
        { x: 54, y: 48, pressure01: 0.9 },
        { x: 88, y: 12, pressure01: 0.38 },
      ],
      baseDiameterPx: 14,
      baseSpacingRatio: 0.12,
      curvatureTighteningGain: 2.6,
    });

    expect(report.adaptiveStamps.length).toBeGreaterThan(20);
    expect(report.centripetalAdaptiveScallopRatio01).toBeLessThan(report.uniformLinearScallopRatio01);
    expect(report.scallopReductionGain01).toBeGreaterThan(0.02);
    expect(report.centripetalMaxTurnKinkDeg).toBeLessThan(report.linearMaxTurnKinkDeg);
    expect(report.cornerKinkReductionRatio01).toBeGreaterThan(0.5);
  });

  it("서브픽셀 1px Smoothstep SDF 안티앨리어싱이 이진 임계 스탬프 대비 계단 분산을 줄이고 고속 출필 테이퍼를 형성한다", () => {
    const aa = evaluateSubpixelDualEnvelopeLineartAA({
      canvasSizePx: 48,
      strokeWidthPx: 8,
      exitVelocityPxPerSec: 1600,
      aaBandPx: 1.15,
    });

    expect(aa.subpixelEdgeGradientVariance).toBeLessThan(aa.binaryEdgeGradientVariance);
    expect(aa.edgeStaircaseVarianceReduction01).toBeGreaterThan(0.15);
    expect(aa.terminalRadiusPx).toBeLessThan(1.5);
    expect(aa.tipSubpixelSharpness01).toBeGreaterThan(0.6);
  });

  it("원심 강모 급선회 부채꼴 벌어짐과 저고도 스타일러스 기울기 측면 셰이딩이 단조롭게 증가한다", () => {
    const gentle = evaluateCentrifugalBristleTurnSplayAndTilt({
      bristleCount: 32,
      baseRadiusPx: 10,
      turnRateRadPerSec: 1.0,
      speedPxPerSec: 300,
      tiltAltitudeDeg: 75,
      stiffness01: 0.5,
    });
    const sharp = evaluateCentrifugalBristleTurnSplayAndTilt({
      bristleCount: 32,
      baseRadiusPx: 10,
      turnRateRadPerSec: 11.0,
      speedPxPerSec: 750,
      tiltAltitudeDeg: 22,
      stiffness01: 0.5,
    });

    expect(sharp.centrifugalFanSplayRatio).toBeGreaterThan(gentle.centrifugalFanSplayRatio);
    expect(sharp.centrifugalFanSplayRatio).toBeGreaterThan(1.25);
    expect(sharp.tiltedBroadSideAspectRatio).toBeGreaterThan(gentle.tiltedBroadSideAspectRatio);
    expect(sharp.releaseFlickWidthRatio01).toBeLessThan(gentle.releaseFlickWidthRatio01);
  });

  it("모세관 꽃양배추 엣지 링과 종이 골 과립 침전이 Ghost-Buffer 상한 위반 0건으로 동작한다", () => {
    const wet = evaluateCapillaryCauliflowerAndGranulation({
      wetness01: 0.85,
      evaporation01: 0.72,
      granulation01: 0.8,
      paperTooth01: 0.68,
      targetWashCeiling01: 0.68,
    });

    expect(wet.ghostCeilingViolationCount).toBe(0);
    expect(wet.edgeCapillaryRingDensity01).toBeGreaterThan(wet.centerPigmentDensity01);
    expect(wet.edgeRingContrastGain01).toBeGreaterThan(0.01);
    expect(wet.valleyFlocculationIndex01).toBeGreaterThan(0.05);
  });

  it("양방향 스머지 리저버가 바탕색 픽업 연속성과 갈퀴 고랑 대비를 동시에 만족한다", () => {
    const smudge = evaluateAnisotropicSmudgeReservoirAndRake({
      brushLoadRgb: { r: 0.95, g: 0.8, b: 0.1 },
      canvasSampleStrip: [
        { r: 0.1, g: 0.3, b: 0.8 },
        { r: 0.15, g: 0.35, b: 0.75 },
        { r: 0.2, g: 0.42, b: 0.68 },
      ],
      pickupRate01: 0.35,
      colorDepositRate01: 0.7,
      rakeBristleDepth01: 0.65,
    });

    expect(smudge.trajectoryColors).toHaveLength(3);
    expect(smudge.pickupContinuityScore01).toBeGreaterThan(0.65);
    expect(smudge.rakeFurrowContrast01).toBeGreaterThan(0.3);
  });

});
