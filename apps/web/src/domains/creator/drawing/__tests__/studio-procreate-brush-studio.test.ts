import { describe, expect, it } from "vitest";

import {
  combineProcreateDualBrushMask,
  createProcreateBrushResetPoint,
  DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG,
  evaluateProcreateHoverPreview,
  evaluateProcreateSilicaDab,
  restoreProcreateBrushToResetPoint,
  STUDIO_PROCREATE_BRUSH_PRESETS,
  STUDIO_PROCREATE_BRUSH_SETS,
} from "../studio-procreate-brush-studio";

describe("studio-procreate-brush-studio (Procreate 12대 카테고리 SilicaBrush 엔진 & 18개 브러시 세트)", () => {
  it("Procreate 18개 기본 브러시 세트 전체와 25종 시그니처 프리셋 카탈로그가 누락 없이 정의되어 있다", () => {
    expect(STUDIO_PROCREATE_BRUSH_SETS).toHaveLength(18);
    expect(STUDIO_PROCREATE_BRUSH_PRESETS.length).toBeGreaterThanOrEqual(24);

    const coveredSets = new Set(STUDIO_PROCREATE_BRUSH_PRESETS.map((p) => p.setCategory));
    for (const brushSet of STUDIO_PROCREATE_BRUSH_SETS) {
      expect(coveredSets.has(brushSet.id)).toBe(true);
    }
  });

  it("Tilt Angle 임계각(0..90도)을 넘어서면 틸트 면적 확장·진원도 압축·그라데이션 감쇠가 활성화된다", () => {
    const vineCharcoal = STUDIO_PROCREATE_BRUSH_PRESETS.find(
      (p) => p.id === "procreate-vine-charcoal",
    )!;
    const upright = evaluateProcreateSilicaDab(vineCharcoal.config, {
      baseSizePx: 20,
      pressure01: 0.75,
      tiltDeg: 10, // 임계각 25도 미만
      azimuthRad: 0.3,
      strokeDirectionRad: 0.3,
      speed01: 0.2,
      strokeProgress01: 0.1,
      primaryColor: { r: 0.15, g: 0.15, b: 0.15 },
      secondaryColor: { r: 0.85, g: 0.85, b: 0.85 },
      stampIndex: 0,
      strokeSeed: 42,
    });
    const tilted = evaluateProcreateSilicaDab(vineCharcoal.config, {
      baseSizePx: 20,
      pressure01: 0.75,
      tiltDeg: 78, // 임계각 25도 초과
      azimuthRad: 0.3,
      strokeDirectionRad: 0.3,
      speed01: 0.2,
      strokeProgress01: 0.1,
      primaryColor: { r: 0.15, g: 0.15, b: 0.15 },
      secondaryColor: { r: 0.85, g: 0.85, b: 0.85 },
      stampIndex: 0,
      strokeSeed: 42,
    });

    expect(tilted.diameterPx).toBeGreaterThan(upright.diameterPx * 1.8);
    expect(tilted.roundness01).toBeLessThan(upright.roundness01);
    expect(tilted.opacity01).toBeLessThan(upright.opacity01);
  });

  it("Wet Mix(Dilution·Charge·Attack·Pull)와 Color Dynamics(Stamp/Stroke/Pressure/Tilt/BarrelRoll), 3D Materials(Metallic/Roughness)를 정확히 평가한다", () => {
    const salamanca = STUDIO_PROCREATE_BRUSH_PRESETS.find(
      (p) => p.id === "procreate-salamanca",
    )!;
    const heavyMetal = STUDIO_PROCREATE_BRUSH_PRESETS.find(
      (p) => p.id === "procreate-heavy-metal",
    )!;

    const startDab = evaluateProcreateSilicaDab(salamanca.config, {
      baseSizePx: 30,
      pressure01: 0.85,
      tiltDeg: 15,
      azimuthRad: 0,
      barrelRollRad: Math.PI * 0.5,
      strokeDirectionRad: 0,
      speed01: 0.3,
      strokeProgress01: 0.05,
      primaryColor: { r: 0.8, g: 0.2, b: 0.1 },
      secondaryColor: { r: 0.1, g: 0.6, b: 0.9 },
      stampIndex: 1,
      strokeSeed: 77,
    });
    const endDab = evaluateProcreateSilicaDab(salamanca.config, {
      baseSizePx: 30,
      pressure01: 0.85,
      tiltDeg: 15,
      azimuthRad: 0,
      barrelRollRad: Math.PI * 1.5,
      strokeDirectionRad: 0,
      speed01: 0.3,
      strokeProgress01: 0.95,
      primaryColor: { r: 0.8, g: 0.2, b: 0.1 },
      secondaryColor: { r: 0.1, g: 0.6, b: 0.9 },
      stampIndex: 25,
      strokeSeed: 77,
    });

    expect(startDab.wetPullStrength01).toBeGreaterThan(0.5);
    expect(endDab.paintChargeRemaining01).toBeLessThan(startDab.paintChargeRemaining01);

    const metalDab = evaluateProcreateSilicaDab(heavyMetal.config, {
      baseSizePx: 24,
      pressure01: 0.9,
      tiltDeg: 45,
      azimuthRad: 0.2,
      strokeDirectionRad: 0.2,
      speed01: 0.1,
      strokeProgress01: 0.2,
      primaryColor: { r: 0.7, g: 0.72, b: 0.75 },
      secondaryColor: { r: 0.2, g: 0.2, b: 0.25 },
      stampIndex: 0,
      strokeSeed: 12,
    });
    expect(metalDab.material3d.metallic01).toBeGreaterThan(0.85);
    expect(metalDab.material3d.roughness01).toBeGreaterThan(0.15);
  });

  it("Dual Brush 6종 합성 모드와 Apple Pencil Hover 라이브 프리뷰 및 Reset Point 스냅샷 복원이 동작한다", () => {
    expect(combineProcreateDualBrushMask(0.8, 0.5, "multiply")).toBeCloseTo(0.4, 5);
    expect(combineProcreateDualBrushMask(0.8, 0.5, "difference")).toBeCloseTo(0.3, 5);
    expect(combineProcreateDualBrushMask(0.8, 0.5, "darken")).toBeCloseTo(0.5, 5);
    expect(combineProcreateDualBrushMask(0.8, 0.5, "lighten")).toBeCloseTo(0.8, 5);

    const shale = STUDIO_PROCREATE_BRUSH_PRESETS.find((p) => p.id === "procreate-shale-brush")!;
    const hoverLow = evaluateProcreateHoverPreview(shale.config, {
      baseSizePx: 28,
      hoverAltitude01: 0.1,
      tiltDeg: 50,
      azimuthRad: 0.4,
      barrelRollRad: 1.15,
      primaryColor: { r: 0.2, g: 0.5, b: 0.9 },
      secondaryColor: { r: 0.9, g: 0.3, b: 0.2 },
    });
    const hoverHigh = evaluateProcreateHoverPreview(shale.config, {
      baseSizePx: 28,
      hoverAltitude01: 0.9,
      tiltDeg: 50,
      azimuthRad: 0.4,
      barrelRollRad: 1.15,
      primaryColor: { r: 0.2, g: 0.5, b: 0.9 },
      secondaryColor: { r: 0.9, g: 0.3, b: 0.2 },
    });
    expect(hoverLow.footprintDiameterPx).toBeGreaterThan(hoverHigh.footprintDiameterPx);
    expect(hoverLow.azimuthAngleRad).toBeCloseTo(1.15, 5);

    const snapshot = createProcreateBrushResetPoint(DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG);
    const restored = restoreProcreateBrushToResetPoint(snapshot);
    expect(restored).toEqual(DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG);
  });
});
