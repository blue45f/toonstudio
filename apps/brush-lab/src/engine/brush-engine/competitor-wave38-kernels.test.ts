import { describe, expect, it } from "vitest";

import {
  evaluateAnisotropicFiberFeatherAndChromaSeparation,
  evaluateBarrelTwistChiselNibProjection,
  evaluateDualBrushBooleanMasking,
  evaluateVelocityInkPoolingAndNibSplit,
} from "./competitor-wave38-kernels";

describe("Wave 38 심화 경쟁사 패리티 R&D 커널 검증", () => {
  it("듀얼 브러시 불리언 각인은 주 실루엣 밖 번짐 0을 보장하며 내부 질감 대비를 높인다", () => {
    const multiply = evaluateDualBrushBooleanMasking({
      canvasSizePx: 48,
      primaryRadiusPx: 16,
      secondaryGrainScalePx: 4.5,
      carveDepth01: 0.72,
      combineMode: "multiply",
      seed: 20261112,
    });
    const subtract = evaluateDualBrushBooleanMasking({
      canvasSizePx: 48,
      primaryRadiusPx: 16,
      secondaryGrainScalePx: 4.5,
      carveDepth01: 0.72,
      combineMode: "linear-height-subtract",
      seed: 20261112,
    });

    expect(multiply.outsideSilhouetteLeakage01).toBe(0);
    expect(subtract.outsideSilhouetteLeakage01).toBe(0);
    expect(multiply.internalGrainContrastGain01).toBeGreaterThan(0.08);
    expect(subtract.internalGrainContrastGain01).toBeGreaterThan(0.1);
    expect(multiply.silhouettePreservationRatio01).toBeGreaterThan(0.85);
  });

  it("배럴 트위스트 3D 치즐 투영은 칼날 세필-광폭 리본 전환과 359°→1° 연속성을 만족한다", () => {
    const report = evaluateBarrelTwistChiselNibProjection({
      nibWidthPx: 24,
      nibThicknessRatio01: 0.14,
      strokeDirectionRad: 0,
      tiltAltitudeDeg: 52,
      azimuthDeg: 20,
    });

    expect(report.broadToEdgeWidthRatio).toBeGreaterThan(3.5);
    expect(report.wraparoundWidthDeltaPx).toBeLessThan(1.2);
    expect(report.sweepSamples.length).toBeGreaterThanOrEqual(8);
  });

  it("딥펜 체류 잉크 고임과 고필압 펜촉 갈라짐(트윈 레일)을 재현한다", () => {
    const lowSpeedHighPressure = evaluateVelocityInkPoolingAndNibSplit({
      baseRadiusPx: 8,
      pressure01: 0.92,
      speedPxPerSec: 65,
      cornerTurnAngleDeg: 110,
      inkLoad01: 0.32,
    });
    const fastLight = evaluateVelocityInkPoolingAndNibSplit({
      baseRadiusPx: 8,
      pressure01: 0.35,
      speedPxPerSec: 1100,
      cornerTurnAngleDeg: 10,
      inkLoad01: 0.32,
    });

    expect(lowSpeedHighPressure.dwellCornerPoolGain01).toBeGreaterThan(fastLight.dwellCornerPoolGain01);
    expect(lowSpeedHighPressure.highPressureTineSplitSpanPx).toBeGreaterThan(3.5);
    expect(fastLight.highPressureTineSplitSpanPx).toBe(0);
    expect(lowSpeedHighPressure.twinRailPeakOverCenterGain01).toBeGreaterThan(0.08);
  });

  it("이방성 종이 섬유 수채 번짐과 다중 안료 색분리 후광이 Ghost 상한을 위반하지 않는다", () => {
    const report = evaluateAnisotropicFiberFeatherAndChromaSeparation({
      baseRadiusPx: 14,
      wetness01: 0.84,
      fiberAnisotropy01: 0.78,
      heavyPigmentRgb01: { r: 0.12, g: 0.22, b: 0.68 },
      lightDyeRgb01: { r: 0.08, g: 0.74, b: 0.78 },
      dyeMobilityBias01: 0.82,
      targetWashCeiling01: 0.68,
    });

    expect(report.fiberAnisotropyAspectRatio).toBeGreaterThan(1.28);
    expect(report.chromaHaloSeparation01).toBeGreaterThan(0.08);
    expect(report.ghostCeilingViolationCount).toBe(0);
  });
});
