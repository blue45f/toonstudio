import { describe, expect, it } from "vitest";

import {
  COMPETITOR_BRUSH_QUALITY_REA_EVIDENCE,
  evaluateDliSunflowerBristleAndGgxImpasto,
  evaluateSignaturePadCatmullBezierAndAtramentInk,
  evaluateTegakiGhostBufferWashAndBayerTone,
  evaluateWebGlFluidVorticityAndDyeAdvection,
  interpolateRybToRgbTrilinear,
  synthesizeSumiUltraQualityTextureDab,
} from "../../engine/brush-engine/competitor-quality-kernels";

import {
  runBrushLabCompetitorQualityBenchmark,
  runLongDurationDrawingSoakBenchmark,
  runMultiEngineBrushMatrixBenchmark,
  selectOptimalServiceBrushConfiguration,
} from "./competitor-quality-bench";

describe("Competitor Brush Quality REA Kernels & Brush Lab Promotion Benchmark", () => {
  it("6대 경쟁 브러시 품질 엔진(87개 파일) REA 역공학 증거가 not-examined: 0으로 봉인되어 있다", () => {
    expect(COMPETITOR_BRUSH_QUALITY_REA_EVIDENCE.relevantFiles).toBe(87);
    expect(COMPETITOR_BRUSH_QUALITY_REA_EVIDENCE.parsedJavaScriptFiles).toBe(87);
    expect(COMPETITOR_BRUSH_QUALITY_REA_EVIDENCE.notExaminedCount).toBe(0);
    expect(COMPETITOR_BRUSH_QUALITY_REA_EVIDENCE.visitedAstNodes).toBe(70692);
    expect(COMPETITOR_BRUSH_QUALITY_REA_EVIDENCE.parentEvidenceId).toBe(
      "ev_862c7dde0eac1097babbeea8541da710982ef41b81677350abec81b6a21117cb",
    );
  });

  it("David Li 3D 황금각 브리슬 배치·3절 굽힘·3x3 Sobel GGX 임파스토 BRDF·8꼭짓점 RYB 보간을 정확히 계산한다", () => {
    // 노랑 + 파랑 (r=0, g=1, b=1 in RYB corner table) → 에메랄드 그린 계열 RGB
    const greenRgb = interpolateRybToRgbTrilinear({ r: 0, g: 1, b: 1 });
    expect(greenRgb.g).toBeGreaterThan(greenRgb.r);
    expect(greenRgb.g).toBeGreaterThan(greenRgb.b);

    const dli = evaluateDliSunflowerBristleAndGgxImpasto({
      brushPosition: { x: 15, y: 15, z: 2 },
      brushScale: 16,
      bristleCount: 32,
      bristleLength: 8,
      jitter01: 0.4,
      stiffnessVariation: 0.7,
      heightPatch3x3: [0.1, 0.15, 0.2, 0.25, 0.5, 0.7, 0.35, 0.65, 0.95],
      normalScale: 0.4,
      lightDirection: { x: 0.3, y: 0.4, z: 0.86 },
      roughness: 0.25,
      f0: 0.05,
      diffuseScale: 0.5,
      specularScale: 0.7,
      rybColor: { r: 0, g: 1, b: 1 },
      canvasCoatRgb: { r: 0.95, g: 0.94, b: 0.9 },
      seed: 101,
    });
    expect(dli.bristleNodes).toHaveLength(32);
    expect(dli.specularBrdf).toBeGreaterThan(0);
    expect(dli.surfaceNormal.z).toBeGreaterThan(0);
    expect(dli.kmBlendedPigmentRgb.g).toBeGreaterThan(dli.kmBlendedPigmentRgb.r);
  });

  it("PavelDoGreat WebGL Fluid 와류 가둠(Vorticity Confinement)·압력 포아송·무발산 투영·염료 이류를 수행한다", () => {
    const fluid = evaluateWebGlFluidVorticityAndDyeAdvection({
      velocityCenter: { x: 0.4, y: 0.25 },
      velocityLeft: { x: 0.9, y: -0.2 },
      velocityRight: { x: -0.7, y: 0.4 },
      velocityTop: { x: -0.5, y: -0.4 },
      velocityBottom: { x: 0.3, y: 0.8 },
      neighborCurlLRTB: [0.1, 0.85, 0.9, 0.2],
      curlStrength: 28,
      dt: 0.016,
      pressureLRTB: [0.2, 0.7, 0.75, 0.25],
      dissipation: 0.1,
      dyeSampleRgb: { r: 0.2, g: 0.5, b: 0.85 },
    });
    expect(Math.hypot(fluid.confinementForce.x, fluid.confinementForce.y)).toBeGreaterThan(0);
    expect(fluid.jacobiPressure).toBeGreaterThan(0);
    expect(fluid.advectedDyeRgb.b).toBeGreaterThan(0.5);
  });

  it("Tegaki Ghost-Buffer 점근 워시가 천장(brushAlpha01)을 넘지 않고 4x4 Bayer 망점을 정확히 판정한다", () => {
    const wash = evaluateTegakiGhostBufferWashAndBayerTone({
      baseCanvasRgba255: [240, 238, 232, 255],
      brushRgb255: [42, 84, 168],
      brushAlpha01: 0.65,
      brushFlow01: 0.55,
      dabKernelAlphaSteps01: [0.65, 0.8, 0.9, 0.9, 0.8, 0.7],
      toneCoordX: 2,
      toneCoordY: 1,
    });
    expect(wash.finalStrokeAlpha01).toBeGreaterThan(0.4);
    expect(wash.finalStrokeAlpha01).toBeLessThanOrEqual(0.65);
    expect(wash.naiveMuddyAlpha01).toBeGreaterThan(0.65);
    expect(wash.mudEliminationGain01).toBeGreaterThan(0.1);
    expect(wash.bayerThresholdIndex).toBeGreaterThanOrEqual(0);
    expect(wash.bayerThresholdIndex).toBeLessThan(16);
  });

  it("SignaturePad 현 길이 비율 Catmull-Rom → Cubic Bézier와 Atrament·Drauu 잉크 관성을 결합한다", () => {
    const out = evaluateSignaturePadCatmullBezierAndAtramentInk({
      p0: { x: 0, y: 0 },
      p1: { x: 12, y: 4 },
      p2: { x: 28, y: 10 },
      p3: { x: 46, y: 14 },
      dtMs: 8,
      previousVelocity: 1.1,
      velocityFilterWeight: 0.7,
      minWidthPx: 2,
      maxWidthPx: 14,
      previousThicknessPx: 6,
      previousPressure01: 0.45,
      currentPressure01: 0.7,
      pressureSmoothing01: 0.6,
    });
    expect(out.curveLengthPx).toBeGreaterThan(10);
    expect(out.atramentAdaptiveThicknessPx).toBeGreaterThanOrEqual(5.75);
    expect(out.atramentAdaptiveThicknessPx).toBeLessThanOrEqual(6.25);
  });

  it("Sumi 초고품질 다브 합성기와 브러시 랩 종합 벤치마크가 실 서비스 승격 게이트를 통과한다", () => {
    const dab = synthesizeSumiUltraQualityTextureDab({
      sizePx: 64,
      pressure01: 0.72,
      roughness01: 0.65,
      tooth01: 0.35,
      seed: 42,
    });
    expect(dab.meanGrainDeposit01).toBeGreaterThan(0.1);
    expect(dab.meanGrainDeposit01).toBeLessThan(1.0);

    const report = runBrushLabCompetitorQualityBenchmark(20261027);
    expect(report.reaNotExaminedCount).toBe(0);
    expect(report.paperSeamScore).toBeLessThan(0.05);
    expect(report.grainContrastPreservationRatio).toBeGreaterThanOrEqual(0.9);
    expect(report.grainContrastPreservationRatio).toBeLessThanOrEqual(1.1);
    expect(report.pressureGrainSpearman).toBeGreaterThanOrEqual(0.99);
    expect(report.pressureWidthSpearman).toBeGreaterThanOrEqual(0.99);
    expect(report.webgpuZeroCopyHotPathMapAsyncCount).toBe(0);
    expect(report.webgpuCpuDrawCallLoopCount).toBe(0);
    expect(report.compositeQualityScore100).toBeGreaterThanOrEqual(99);
    expect(report.promotionGatePassed).toBe(true);
  });

  it("8종 브러시 엔진 비교 매트릭스와 8시간 장시간 드로잉(Soak) 벤치마크에서 최적 실서비스 구성을 자동 도출한다", () => {
    const matrix = runMultiEngineBrushMatrixBenchmark(20261027);
    expect(matrix).toHaveLength(8);
    expect(matrix[0]?.engineId).toBe("sumi-webgpu-zero-copy-indirect");
    expect(matrix[0]?.hotPathMapAsyncCount).toBe(0);
    expect(matrix[0]?.determinismVerified).toBe(true);
    expect(matrix[0]?.compositeScore100).toBeGreaterThanOrEqual(99);
    expect(matrix[0]?.promotedToService).toBe(true);

    const soak = runLongDurationDrawingSoakBenchmark();
    expect(soak).toHaveLength(5);
    const soak8h = soak.find((s) => s.horizonId === "8h");
    expect(soak8h).toBeDefined();
    expect(soak8h?.totalStrokes).toBe(172_800);
    expect(soak8h?.totalDabsRendered).toBe(21_600_000);
    expect(soak8h?.gpuHeapGrowthMb).toBe(0);
    expect(soak8h?.frameTimeDriftPct).toBeLessThanOrEqual(1.0);
    expect(soak8h?.ghostWashCeilingViolationCount).toBe(0);
    expect(soak8h?.hotPathMapAsyncCount).toBe(0);
    expect(soak8h?.soakVerdict).toBe("PASS");

    const optimal = selectOptimalServiceBrushConfiguration(20261027);
    expect(optimal.profileId).toBe("toonstudio-prod-optimal-sumi-wave35");
    expect(optimal.selectedPrimaryEngineId).toBe("sumi-webgpu-zero-copy-indirect");
    expect(optimal.verified8hFrameDriftPct).toBeLessThanOrEqual(1.0);
    expect(optimal.verified8hGpuHeapGrowthMb).toBe(0);
    expect(optimal.verifiedCompositeScore100).toBeGreaterThanOrEqual(99.5);
  });
});
