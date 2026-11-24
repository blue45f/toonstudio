// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ALL_SIX_PASS_IDS,
  CONTACT_LOCK_PRESETS,
  DEFAULT_BRUSH_PIGMENT_OKLCH,
  DEFAULT_GPEN_NIB_CONFIG,
  DEFAULT_RAKING_LIGHT_CONFIG,
  DEFAULT_SIX_PASS_VISIBILITY,
  DEFAULT_TAPERED_CONTOUR_CONFIG,
  PERSPECTIVE_CAMERA_PRESETS,
  StudioBrush3dExtremePanel,
  advancePencilTipWear,
  bakeSixPass2dLayers,
  compositeSixPassLayers,
  computeImpastoSobelNormals,
  computeInkPooling,
  computeOklchFaceShadowTint,
  computePaperTransfer,
  createDemoBrushStrokePoints,
  createDemoFaceContourSamples,
  createInitialPencilTipWear,
  createPaperHeightmap3Channel,
  evaluateFaceShadowSdf,
  evaluateTaperedContour,
  projectPerspectiveGuideLines,
  renderImpastoBrushPreviewCanvas,
  renderSixPassFacePreviewCanvas,
  samplePaperChannel,
  shadeImpastoRakingLight,
  simulateBristleSplay,
  simulateExtremeBrushStroke,
  simulateGPenTineSplit,
  solveContactLockIk,
  solvePerspectivePnPFromVanishingLines,
  type ImpastoBuffer25D,
} from "./index";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/u;
const FORBIDDEN_STORAGE_REGEX = /\blocalStorage\b|\bsessionStorage\b/u;
const FORBIDDEN_TRANSITION_ALL_REGEX = /\btransition-all\b/u;
const FORBIDDEN_SPARKLES_REGEX = /\bSparkles\b/u;
const FORBIDDEN_PRIVATE_STORE_MAP_REGEX =
  /\bprivate\s+(?:readonly\s+)?store\b|\bstore\s*=\s*new\s+Map\b/u;
const FORBIDDEN_BIGINT_LITERAL_REGEX = /\b\d+n\b/u;

function createMockCanvas2dContext(): CanvasRenderingContext2D {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "",
  } as unknown as CanvasRenderingContext2D;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Wave 38F — 극한의 브러시 질감 6축 물리 엔진", () => {
  it("1. 3채널 종이 요철 하이트맵(height·absorbency·anisotropy)이 결정론적이고 프리셋별 물성을 구분한다", () => {
    const roughA = createPaperHeightmap3Channel("rough-watercolor", 32, 32, 42);
    const roughB = createPaperHeightmap3Channel("rough-watercolor", 32, 32, 42);
    const kent = createPaperHeightmap3Channel("kent-webtoon-smooth", 32, 32, 42);
    const linen = createPaperHeightmap3Channel("canvas-linen-weave", 32, 32, 42);

    expect(roughA.heightField).toEqual(roughB.heightField);
    expect(roughA.roughnessIndex).toBeGreaterThan(kent.roughnessIndex);
    expect(roughA.peakMean).toBeGreaterThan(roughA.valleyMean);

    const sampleRough = samplePaperChannel(roughA, 0.37, 0.62);
    const sampleLinen = samplePaperChannel(linen, 0.37, 0.62);
    expect(sampleRough.height).toBeGreaterThanOrEqual(0);
    expect(sampleRough.height).toBeLessThanOrEqual(1);
    expect(sampleRough.absorbency).toBeGreaterThan(0);
    expect(sampleLinen.anisotropy).toBeGreaterThan(sampleRough.anisotropy);
  });

  it("2. 필압 기반 산마루↔골짜기 건식/습식 전사가 필압에 대해 단조 증가하고 건식 저필압에서 산마루가 우세하다", () => {
    const peakPaper = { height: 0.92, absorbency: 0.45, anisotropy: 0.4 };
    const valleyPaper = { height: 0.1, absorbency: 0.9, anisotropy: 0.4 };
    const pressures = [0.05, 0.2, 0.4, 0.6, 0.8, 1.0];

    let prevPeakDry = -1;
    let prevValleyDry = -1;
    let prevValleyWet = -1;
    for (const pressure of pressures) {
      const peakDry = computePaperTransfer({ paper: peakPaper, pressure, wetness: 0.05 });
      const valleyDry = computePaperTransfer({ paper: valleyPaper, pressure, wetness: 0.05 });
      const valleyWet = computePaperTransfer({ paper: valleyPaper, pressure, wetness: 0.92 });

      expect(peakDry.totalTransfer).toBeGreaterThanOrEqual(prevPeakDry);
      expect(valleyDry.totalTransfer).toBeGreaterThanOrEqual(prevValleyDry);
      expect(valleyWet.totalTransfer).toBeGreaterThanOrEqual(prevValleyWet);

      prevPeakDry = peakDry.totalTransfer;
      prevValleyDry = valleyDry.totalTransfer;
      prevValleyWet = valleyWet.totalTransfer;
    }

    // 건식 저필압에서는 산마루(peak)에 안료가 더 잘 걸리고, 습식에서는 골짜기 모세관 흡수가 극대화된다
    const lowDryPeak = computePaperTransfer({ paper: peakPaper, pressure: 0.28, wetness: 0.05 });
    const lowDryValley = computePaperTransfer({ paper: valleyPaper, pressure: 0.28, wetness: 0.05 });
    const wetValley = computePaperTransfer({ paper: valleyPaper, pressure: 0.55, wetness: 0.92 });

    expect(lowDryPeak.totalTransfer).toBeGreaterThan(lowDryValley.totalTransfer + 0.12);
    expect(wetValley.capillaryAbsorption).toBeGreaterThan(lowDryValley.capillaryAbsorption + 0.35);
    expect(wetValley.granulationWeight).toBeGreaterThan(0.5);
  });

  it("3. 임파스토 2.5D 두께 버퍼 -> Sobel 노멀맵 & 사선 광원 셰이딩이 평면 대비 뚜렷한 비균일 입체 음영을 생성한다", () => {
    const w = 48;
    const h = 32;
    const flatBuffer: ImpastoBuffer25D = {
      width: w,
      height: h,
      thickness: new Float32Array(w * h).fill(0.8),
      pigmentL: new Float32Array(w * h).fill(0.45),
      pigmentC: new Float32Array(w * h).fill(0.12),
      pigmentH: new Float32Array(w * h).fill(250),
      wetnessMap: new Float32Array(w * h).fill(0.7),
      peakThickness: 0.8,
      meanThickness: 0.8,
      coverageRatio: 1,
    };

    const flatSobel = computeImpastoSobelNormals(flatBuffer.thickness, w, h, 2.6);
    const flatShading = shadeImpastoRakingLight(flatBuffer, DEFAULT_RAKING_LIGHT_CONFIG);
    expect(flatSobel.maxSlope).toBeCloseTo(0, 5);
    expect(flatShading.luminanceVariance).toBeLessThan(1e-6);

    const stroke = simulateExtremeBrushStroke(createDemoBrushStrokePoints(w, h, 0.9, 24), {
      presetId: "canvas-linen-weave",
      width: w,
      height: h,
      wetness: 0.65,
      bristleCount: 32,
      brushRadiusPx: 5,
      impastoLoad: 1.8,
      nibConfig: DEFAULT_GPEN_NIB_CONFIG,
      rakingLight: DEFAULT_RAKING_LIGHT_CONFIG,
      pigmentOklch: DEFAULT_BRUSH_PIGMENT_OKLCH,
    });

    expect(stroke.impasto.peakThickness).toBeGreaterThan(0.35);
    expect(stroke.shading.luminanceVariance).toBeGreaterThan(0.002);
    expect(stroke.shading.luminanceRange).toBeGreaterThan(0.15);
    expect(stroke.shading.meanNormalDeviationDeg).toBeGreaterThan(1.5);
    expect(stroke.shading.peakSpecular).toBeGreaterThan(0.05);
  });

  it("4. 멀티 브리슬 스플레이는 16~48가닥 범위를 준수하고 필압에 따라 접촉 가닥과 스플레이 폭이 확대된다", () => {
    const clampedLow = simulateBristleSplay(
      { bristleCount: 4, brushRadiusPx: 6, stiffness: 0.5, splayFactor: 0.7, clumpiness: 0.2, tiltRad: 0.3, azimuthRad: 0 },
      0.8,
      200,
      0.9,
    );
    const clampedHigh = simulateBristleSplay(
      { bristleCount: 99, brushRadiusPx: 6, stiffness: 0.5, splayFactor: 0.7, clumpiness: 0.2, tiltRad: 0.3, azimuthRad: 0 },
      0.8,
      200,
      0.9,
    );
    expect(clampedLow.strands).toHaveLength(16);
    expect(clampedHigh.strands).toHaveLength(48);

    const lightPress = simulateBristleSplay(
      { bristleCount: 32, brushRadiusPx: 6, stiffness: 0.45, splayFactor: 0.8, clumpiness: 0.2, tiltRad: 0.2, azimuthRad: 0 },
      0.15,
      180,
      0.9,
    );
    const heavyPress = simulateBristleSplay(
      { bristleCount: 32, brushRadiusPx: 6, stiffness: 0.45, splayFactor: 0.8, clumpiness: 0.2, tiltRad: 0.2, azimuthRad: 0 },
      0.95,
      180,
      0.9,
    );
    expect(heavyPress.effectiveSpanPx).toBeGreaterThan(lightPress.effectiveSpanPx);
    expect(heavyPress.activeStrandCount).toBeGreaterThan(lightPress.activeStrandCount);
  });

  it("5. G펜 2-갈래 닙 탄성 갈라짐이 임계 필압 이하 0, 고필압 탄성 증가, 저잉크 메니스커스 파열(Railroading)을 재현한다", () => {
    const belowThreshold = simulateGPenTineSplit(DEFAULT_GPEN_NIB_CONFIG, 0.15, 0, 0.9);
    const midPressure = simulateGPenTineSplit(DEFAULT_GPEN_NIB_CONFIG, 0.65, 0, 0.9);
    const highPressure = simulateGPenTineSplit(DEFAULT_GPEN_NIB_CONFIG, 0.98, 0, 0.9);
    const stifferNib = simulateGPenTineSplit(
      { ...DEFAULT_GPEN_NIB_CONFIG, elasticity: 0.95 },
      0.8,
      0,
      0.9,
    );
    const softerNib = simulateGPenTineSplit(
      { ...DEFAULT_GPEN_NIB_CONFIG, elasticity: 0.2 },
      0.8,
      0,
      0.9,
    );
    const starvedRailroad = simulateGPenTineSplit(
      { ...DEFAULT_GPEN_NIB_CONFIG, elasticity: 0.25, inkViscosity: 0.3 },
      0.98,
      0,
      0.1,
    );

    expect(belowThreshold.tineSeparationPx).toBe(0);
    expect(midPressure.tineSeparationPx).toBeGreaterThan(0);
    expect(highPressure.tineSeparationPx).toBeGreaterThan(midPressure.tineSeparationPx);
    expect(softerNib.tineSeparationPx).toBeGreaterThan(stifferNib.tineSeparationPx);
    expect(stifferNib.snapBackSharpness).toBeGreaterThan(softerNib.snapBackSharpness);
    expect(starvedRailroad.meniscusIntact).toBe(false);
    expect(starvedRailroad.railroadGapRatio).toBeGreaterThan(0.15);
  });

  it("6. 스트로크 끝 잉크 고임(Ink Pooling)과 연필심 마모(Tip Wear)가 물리 법칙에 맞게 누적된다", () => {
    const fastMid = computeInkPooling(520, 0.85, 0.85, false);
    const slowTerminal = computeInkPooling(18, 0.85, 0.85, true);
    const dryTerminal = computeInkPooling(18, 0.02, 0.85, true);

    expect(slowTerminal.poolingFactor).toBeGreaterThan(fastMid.poolingFactor + 0.3);
    expect(slowTerminal.haloDarkening).toBeGreaterThan(dryTerminal.haloDarkening + 0.2);

    const sharp = createInitialPencilTipWear(0.25);
    const worn1 = advancePencilTipWear(sharp, 120, 0.75, 0.85, 0.45);
    const worn2 = advancePencilTipWear(worn1, 240, 0.85, 0.85, 0.55);

    expect(worn1.currentFlatWidthMm).toBeGreaterThan(sharp.currentFlatWidthMm);
    expect(worn2.currentFlatWidthMm).toBeGreaterThan(worn1.currentFlatWidthMm);
    expect(worn2.sharpnessRatio).toBeLessThan(worn1.sharpnessRatio);
    expect(worn2.graphiteTransferBoost).toBeGreaterThan(sharp.graphiteTransferBoost);
  });

  it("7. 통합 극한 브러시 파이프라인이 잉크 소진·끝 고임·닙 갈라짐·마모를 단일 스트로크에서 일관 계산한다", () => {
    const strokePoints = createDemoBrushStrokePoints(64, 40, 0.9, 28);
    const result = simulateExtremeBrushStroke(strokePoints, {
      presetId: "cold-press-cotton",
      width: 64,
      height: 40,
      wetness: 0.72,
      bristleCount: 24,
      brushRadiusPx: 4.5,
      impastoLoad: 1.5,
      nibConfig: DEFAULT_GPEN_NIB_CONFIG,
      rakingLight: DEFAULT_RAKING_LIGHT_CONFIG,
      pigmentOklch: DEFAULT_BRUSH_PIGMENT_OKLCH,
    });

    expect(result.samples).toHaveLength(28);
    expect(result.endInkReserve).toBeLessThan(0.95);
    expect(result.peakTineSplitPx).toBeGreaterThan(1.5);
    expect(result.endPoolingFactor).toBeGreaterThan(0.15);
    expect(result.finalTipWear.currentFlatWidthMm).toBeGreaterThan(0.25);
  });
});

describe("Wave 38F — 완벽 3D 6축 NPR 스위트 (Face SDF · Tapered Contour · Contact IK · PnP · 6패스 베이크)", () => {
  it("8. 얼굴 전용 Face Shadow SDF가 방위각 +θ/-θ에서 완벽한 좌/우 거울 대칭을 이루고 코/광대 잡음 0건을 보장한다", () => {
    const rightLit = evaluateFaceShadowSdf({ azimuthDeg: 64, elevationDeg: 22, gridSize: 32 });
    const leftLit = evaluateFaceShadowSdf({ azimuthDeg: -64, elevationDeg: 22, gridSize: 32 });
    const frontLit = evaluateFaceShadowSdf({ azimuthDeg: 0, elevationDeg: 18, gridSize: 32 });

    expect(rightLit.noseCheekArtifactScore).toBe(0);
    expect(leftLit.noseCheekArtifactScore).toBe(0);
    expect(frontLit.noseCheekArtifactScore).toBe(0);
    expect(frontLit.litRatio).toBeGreaterThan(0.9);

    // 우측 광원은 오른쪽 얼굴이 더 밝고, 좌측 광원은 왼쪽 얼굴이 정확히 대칭으로 밝아야 한다
    expect(rightLit.rightLitRatio).toBeGreaterThan(rightLit.leftLitRatio + 0.35);
    expect(Math.abs(rightLit.rightLitRatio - leftLit.leftLitRatio)).toBeLessThan(1e-5);
    expect(Math.abs(rightLit.leftLitRatio - leftLit.rightLitRatio)).toBeLessThan(1e-5);

    let maxMirrorDiff = 0;
    const n = rightLit.gridSize;
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const a = rightLit.litMask[y * n + x] ?? 0;
        const b = leftLit.litMask[y * n + (n - 1 - x)] ?? 0;
        maxMirrorDiff = Math.max(maxMirrorDiff, Math.abs(a - b));
      }
    }
    expect(maxMirrorDiff).toBeLessThan(1e-5);
  });

  it("9. OKLCH 난색(SSS) 및 보색 쿨 섀도우 틴트가 무채색 회색이 아닌 유채색 섀도우 색조를 산출한다", () => {
    const warm = computeOklchFaceShadowTint(undefined, "warm-subsurface", 68);
    const cool = computeOklchFaceShadowTint(undefined, "complementary-cool", 68);

    expect(warm.shadowTintOklch.c).toBeGreaterThan(0.06);
    expect(cool.shadowTintOklch.c).toBeGreaterThan(0.06);
    expect(warm.shadowTintOklch.l).toBeLessThan(warm.litSkinOklch.l);
    expect(cool.shadowTintOklch.h).toBeCloseTo(248, 1);
    expect(warm.sssTerminatorOklch.c).toBeGreaterThan(warm.litSkinOklch.c);
  });

  it("10. 2D G펜급 가변 두께 NPR 외곽선이 경계별 두께 서열·테이퍼·음영측 가중·미세 지터를 계산한다", () => {
    const contour = evaluateTaperedContour(
      createDemoFaceContourSamples(25, 45),
      DEFAULT_TAPERED_CONTOUR_CONFIG,
    );

    expect(contour.points).toHaveLength(25);
    expect(contour.maxWidthPx).toBeGreaterThan(contour.minWidthPx * 2);
    expect(contour.meanJitterPx).toBeGreaterThan(0.1);
    expect(contour.categoryMeanWidths.silhouette).toBeGreaterThan(
      contour.categoryMeanWidths["inner-detail"],
    );

    // 동일 경계 조건에서 음영측(lightFacing=-1) 선이 광원측(+1)보다 굵어야 한다
    const litVsShadow = evaluateTaperedContour([
      { t: 0.5, x: 0, y: 0, category: "silhouette", normalDiscontinuity: 0.5, depthDelta: 0.2, materialBreak: false, lightFacing: 1, distanceFromCameraM: 2.4 },
      { t: 0.5, x: 0, y: 0, category: "silhouette", normalDiscontinuity: 0.5, depthDelta: 0.2, materialBreak: false, lightFacing: -1, distanceFromCameraM: 2.4 },
    ]);
    expect(litVsShadow.points[1]?.widthPx ?? 0).toBeGreaterThan(
      litVsShadow.points[0]?.widthPx ?? 0,
    );
  });

  it("11. 1드래그 Contact-Lock IK가 모든 프리셋과 극단적 하강 드래그에서도 발바닥 지면 0mm 비관통을 보장한다", () => {
    for (const preset of CONTACT_LOCK_PRESETS) {
      const solved = solveContactLockIk(preset.request);
      expect(solved.groundPenetrationMm).toBe(0);
      expect(solved.leftFootElevationMm).toBeGreaterThanOrEqual(0);
      expect(solved.rightFootElevationMm).toBeGreaterThanOrEqual(0);
      expect(solved.joints.leftAnkle[1]).toBeGreaterThanOrEqual(0);
      expect(solved.joints.rightAnkle[1]).toBeGreaterThanOrEqual(0);
      expect(solved.isBalanced).toBe(true);
    }

    // 골반을 지하(-0.5m)로 과도하게 드래그해도 지면 관통은 0mm여야 한다
    const extremeDown = solveContactLockIk({
      dragHandle: { joint: "pelvis", targetPos: [0.45, -0.5, 0.3] },
      groundPlaneY: 0,
      enableBalanceCompensation: true,
    });
    expect(extremeDown.groundPenetrationMm).toBe(0);
    expect(extremeDown.joints.pelvis[1]).toBeGreaterThanOrEqual(0.3);
  });

  it("12. Contact-Lock IK가 의자 좌판·소품·커플 손목 자석 락 앵커를 정밀하게 결속하고 무게중심을 안정화한다", () => {
    const sit = solveContactLockIk(CONTACT_LOCK_PRESETS[1]?.request);
    const couple = solveContactLockIk(CONTACT_LOCK_PRESETS[2]?.request);

    expect(sit.contactErrorsMm["chair-seat-pelvis"]).toBeLessThan(12);
    expect(couple.contactErrorsMm["couple-wrist-magnet"]).toBeLessThan(15);
    expect(couple.comBalanceOffsetM).toBeLessThan(0.25);
  });

  it("13. Perspective PnP 역산기가 24mm/50mm/85mm 러프 소실점 선분 2쌍에서 초점거리·수평선·피치/요를 정확히 복원한다", () => {
    for (const preset of PERSPECTIVE_CAMERA_PRESETS) {
      const guides = projectPerspectiveGuideLines(
        {
          focalLengthMm: preset.focalLengthMm,
          pitchDeg: preset.pitchDeg,
          yawDeg: preset.yawDeg,
          sensorWidthMm: 36,
        },
        1280,
        720,
      );
      const solved = solvePerspectivePnPFromVanishingLines(guides);
      expect(solved.valid).toBe(true);
      expect(Math.abs(solved.focalLengthMm - preset.focalLengthMm)).toBeLessThan(0.25);
      expect(Math.abs(solved.pitchDeg - preset.pitchDeg)).toBeLessThan(0.25);
      expect(Math.abs(solved.yawDeg - preset.yawDeg)).toBeLessThan(0.25);
      expect(solved.residualOrthogonalityError).toBeLessThan(1e-4);
    }

    // 평행한 퇴화 선분 입력은 NaN 없이 valid=false와 한글 경고를 반환한다
    const parallelDegenerate = solvePerspectivePnPFromVanishingLines({
      pairA: [
        { a: { x: 0, y: 100 }, b: { x: 500, y: 100 } },
        { a: { x: 0, y: 200 }, b: { x: 500, y: 200 } },
      ],
      pairB: [
        { a: { x: 100, y: 0 }, b: { x: 100, y: 500 } },
        { a: { x: 200, y: 0 }, b: { x: 200, y: 500 } },
      ],
      imageWidthPx: 1280,
      imageHeightPx: 720,
    });
    expect(parallelDegenerate.valid).toBe(false);
    expect(parallelDegenerate.warningKo).toBeTruthy();
  });

  it("14. 3D -> 2D 6패스 분리 레이어 베이크가 6개 독립 패스 완전성과 zOrder 1..6 정렬을 보장한다", () => {
    const manifest = bakeSixPass2dLayers({
      gridSize: 32,
      lightAzimuthDeg: 48,
      lightElevationDeg: 26,
      tintMode: "warm-subsurface",
    });

    expect(manifest.passes).toHaveLength(6);
    const ids = manifest.passes.map((p) => p.id);
    expect(ids).toEqual(ALL_SIX_PASS_IDS);
    expect(manifest.passes.map((p) => p.zOrder)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const pass of manifest.passes) {
      expect(pass.coverageRatio, `${pass.id} 커버리지 누락`).toBeGreaterThan(0.02);
      expect(pass.pixelsL).toHaveLength(32 * 32);
      expect(pass.pixelsA).toHaveLength(32 * 32);
    }
  });

  it("15. 6패스 레이어 합성기가 개별 패스 토글(전체 vs 선화 단독 vs 셀 음영 제거)에 즉시 반응한다", () => {
    const manifest = bakeSixPass2dLayers({
      gridSize: 28,
      lightAzimuthDeg: 55,
      lightElevationDeg: 24,
    });

    const fullComp = compositeSixPassLayers(manifest, DEFAULT_SIX_PASS_VISIBILITY);
    const noCelComp = compositeSixPassLayers(manifest, {
      ...DEFAULT_SIX_PASS_VISIBILITY,
      "cel-shade": false,
    });
    const lineOnlyComp = compositeSixPassLayers(manifest, {
      "albedo-id": false,
      "cel-shade": false,
      "cast-shadow": false,
      "z-fog": false,
      "rim-light": false,
      lineart: true,
    });

    expect(fullComp.activePassCount).toBe(6);
    expect(noCelComp.activePassCount).toBe(5);
    expect(lineOnlyComp.activePassCount).toBe(1);
    expect(lineOnlyComp.activePassIds).toEqual(["lineart"]);
    expect(fullComp.compositeChecksum).not.toBe(noCelComp.compositeChecksum);
    expect(fullComp.compositeChecksum).not.toBe(lineOnlyComp.compositeChecksum);
    expect(noCelComp.meanLuminance).toBeGreaterThan(fullComp.meanLuminance);
  });

  it("16. 2.5D 임파스토 및 6패스 얼굴 프리뷰 캔버스 렌더러가 mock 컨텍스트에서 안전하게 동작한다", () => {
    const brushCanvas = document.createElement("canvas");
    brushCanvas.width = 360;
    brushCanvas.height = 200;
    const brushCtx = createMockCanvas2dContext();
    vi.spyOn(brushCanvas, "getContext").mockReturnValue(brushCtx as unknown as GPUCanvasContext);

    const stroke = simulateExtremeBrushStroke(createDemoBrushStrokePoints(48, 32, 0.85, 18), {
      presetId: "cold-press-cotton",
      width: 48,
      height: 32,
      wetness: 0.55,
      bristleCount: 24,
      brushRadiusPx: 4.5,
      impastoLoad: 1.4,
      nibConfig: DEFAULT_GPEN_NIB_CONFIG,
      rakingLight: DEFAULT_RAKING_LIGHT_CONFIG,
      pigmentOklch: DEFAULT_BRUSH_PIGMENT_OKLCH,
    });
    expect(renderImpastoBrushPreviewCanvas(brushCanvas, stroke, DEFAULT_RAKING_LIGHT_CONFIG)).toBe(
      true,
    );
    expect(brushCtx.fillRect).toHaveBeenCalled();

    const faceCanvas = document.createElement("canvas");
    faceCanvas.width = 360;
    faceCanvas.height = 220;
    const faceCtx = createMockCanvas2dContext();
    vi.spyOn(faceCanvas, "getContext").mockReturnValue(faceCtx as unknown as GPUCanvasContext);

    const manifest = bakeSixPass2dLayers({ gridSize: 24, lightAzimuthDeg: 40, lightElevationDeg: 25 });
    const composite = compositeSixPassLayers(manifest, DEFAULT_SIX_PASS_VISIBILITY);
    const ik = solveContactLockIk(CONTACT_LOCK_PRESETS[0]?.request);
    const pnp = solvePerspectivePnPFromVanishingLines(
      projectPerspectiveGuideLines({ focalLengthMm: 50, pitchDeg: 4, yawDeg: 38 }, 1280, 720),
    );
    expect(renderSixPassFacePreviewCanvas(faceCanvas, composite, manifest, ik, pnp)).toBe(true);
    expect(faceCtx.fillRect).toHaveBeenCalled();
    expect(faceCtx.stroke).toHaveBeenCalled();
  });
});

describe("Wave 38F — StudioBrush3dExtremePanel UI 상호작용 및 Calm Atelier 위생 계약", () => {
  it("17. props 없이 단독 렌더링되고 종이 프리셋·닙/마모 슬라이더·Face SDF·6패스 토글·IK/PnP 조작이 실시간 반영된다", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => createMockCanvas2dContext() as unknown as GPUCanvasContext,
    );
    // 1) 완전 무인자(Props 없음) 단독 렌더링 검증
    render(createElement(StudioBrush3dExtremePanel));
    expect(screen.getByTestId("studio-brush-3d-extreme-panel")).toBeTruthy();
    cleanup();

    // 2) 콜백 연동 및 전체 UI 상호작용 검증
    const onSummaryChange = vi.fn();
    render(createElement(StudioBrush3dExtremePanel, { onSummaryChange }));
    expect(screen.getByTestId("studio-brush-3d-extreme-panel")).toBeTruthy();
    expect(screen.getByTestId("ik-ground-penetration-badge").textContent).toContain("0.00mm");
    expect(screen.getByTestId("sixpass-active-count-badge").textContent).toContain("6/6");
    expect(screen.getByTestId("pnp-readout").textContent).toContain("50.0mm");

    // 종이 프리셋 및 브러시 물리 슬라이더 변경
    fireEvent.click(screen.getByTestId("paper-preset-canvas-linen-weave"));
    fireEvent.change(screen.getByTestId("slider-nib-split"), { target: { value: "10.4" } });
    fireEvent.change(screen.getByTestId("slider-bristle-count"), { target: { value: "44" } });
    fireEvent.change(screen.getByTestId("slider-tip-wear"), { target: { value: "0.48" } });
    fireEvent.click(screen.getByTestId("btn-sharpen-tip"));
    expect((screen.getByTestId("slider-tip-wear") as HTMLInputElement).value).toBe("0.22");

    // Face Shadow SDF 각도·틴트 및 6패스 토글
    fireEvent.click(screen.getByTestId("tint-mode-cool"));
    fireEvent.change(screen.getByTestId("slider-face-azimuth"), { target: { value: "-70" } });
    fireEvent.click(screen.getByTestId("toggle-pass-cel-shade"));
    expect(screen.getByTestId("sixpass-active-count-badge").textContent).toContain("5/6");
    fireEvent.click(screen.getByTestId("btn-sixpass-lineart-only"));
    expect(screen.getByTestId("sixpass-active-count-badge").textContent).toContain("1/6");
    fireEvent.click(screen.getByTestId("btn-sixpass-all-on"));
    expect(screen.getByTestId("sixpass-active-count-badge").textContent).toContain("6/6");

    // Contact-Lock IK 및 Perspective PnP 프리셋 전환
    fireEvent.click(screen.getByTestId("ik-preset-chair-sit-lock"));
    fireEvent.change(screen.getByTestId("slider-ik-pelvis-offset"), { target: { value: "-24" } });
    expect(screen.getByTestId("ik-ground-penetration-badge").textContent).toContain("0.00mm");

    fireEvent.click(screen.getByTestId("pnp-preset-wide-24mm"));
    expect(screen.getByTestId("pnp-readout").textContent).toContain("24.0mm");
    expect(onSummaryChange).toHaveBeenCalled();

    // 초기화 검증
    fireEvent.click(screen.getByTestId("btn-reset-brush-3d-lab"));
    expect(screen.getByTestId("pnp-readout").textContent).toContain("50.0mm");
    expect(screen.getByTestId("sixpass-active-count-badge").textContent).toContain("6/6");
  });

  it("18. 모듈 전역 위생 계약: 전 소스 <= 800줄, 원시 색상·Web Storage·transition-all·Sparkles·private store Map·BigInt 리터럴 0건", () => {
    const dir = path.dirname(new URL(import.meta.url).pathname);
    const sourceFiles = fs
      .readdirSync(dir)
      .filter((name) => /\.(ts|tsx)$/u.test(name) && !name.includes(".test."));
    expect(sourceFiles.length).toBeGreaterThanOrEqual(5);

    for (const file of sourceFiles) {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${file} 줄 수 초과(${lineCount}줄)`).toBeLessThanOrEqual(800);
      expect(content, `${file} 원시 색상 검출`).not.toMatch(RAW_COLOR_REGEX);
      expect(content, `${file} Web Storage 검출`).not.toMatch(FORBIDDEN_STORAGE_REGEX);
      expect(content, `${file} transition-all 검출`).not.toMatch(FORBIDDEN_TRANSITION_ALL_REGEX);
      expect(content, `${file} Sparkles 검출`).not.toMatch(FORBIDDEN_SPARKLES_REGEX);
      expect(content, `${file} private store Map 검출`).not.toMatch(
        FORBIDDEN_PRIVATE_STORE_MAP_REGEX,
      );
      expect(content, `${file} BigInt 리터럴 검출`).not.toMatch(FORBIDDEN_BIGINT_LITERAL_REGEX);
    }
  });
});
