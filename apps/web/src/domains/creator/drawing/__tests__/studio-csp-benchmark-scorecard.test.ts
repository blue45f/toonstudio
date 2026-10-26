import { describe, expect, it } from "vitest";

import {
  CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY,
  evaluateStudioCspBenchmarkScorecard,
  measureLivePigmentEngineBenchmark,
  measureMagmaAndKlekiEngineBenchmark,
  resolveStudioDeviceFormFactor,
} from "../studio-csp-benchmark-scorecard";
import { measureProcreateSilicaEngineBenchmark } from "../studio-procreate-silica-codecs";
import {
  applyCompleteGlfxFilterExtensionSuite,
  applyHolisticColorGradingAndCurvesSuite,
  COMPLETE_ECOSYSTEM_TOOL_PRESETS,
  COMPLETE_UNFRAGMENTED_ECOSYSTEM_REA_LEDGER,
  evaluateBernsteinBasis,
  evaluateBernsteinFfdLatticeMeshWarp,
  evaluateCloneStampAndConicalAirbrush,
  evaluateCompleteUnfragmentedStudioSummary,
  evaluateHolisticGradientTool,
  evaluateHolisticLayerCompositorAndEasel,
  evaluateHolisticPerspectiveAndFreeTransform,
  evaluateMultiPolygonSelectAndMarquee,
  evaluatePiskelOnionSkinAndSpritesheet,
  evaluateRichCanvasTypographyLayout,
  evaluateSculptGlTwistAndDynamicTopology,
  executeHolisticFloodFillAndMagicErase,
  HOLISTIC_STUDIO_TOOL_PRESETS,
  measureUniversalBrushTaxonomyEngineBenchmark,
  WAVE28_HOLISTIC_ECOSYSTEM_REA_LEDGER,
} from "../studio-universal-brush-taxonomy-engine";

describe("studio-csp-benchmark-scorecard (클립스튜디오 대비 2배 우위 검증)", () => {
  it("뷰포트 폭과 포인터 특성에 따라 데스크톱·태블릿·모바일(compact) 폼팩터를 판별한다", () => {
    expect(resolveStudioDeviceFormFactor(1440, false)).toBe("desktop");
    expect(resolveStudioDeviceFormFactor(1024, false)).toBe("tablet");
    expect(resolveStudioDeviceFormFactor(1366, true)).toBe("tablet");
    expect(resolveStudioDeviceFormFactor(390, true)).toBe("compact");
  });

  it("실시간 잠재 안료 혼합 벤치마크가 선형 평균 대비 2배 이상의 녹색 채도 보존과 캐시 히트율 및 6-DoF 배럴 롤 대비를 기록한다", () => {
    const pigment = measureLivePigmentEngineBenchmark();
    expect(pigment.greenChromaGainOverLinear).toBeGreaterThanOrEqual(2.0);
    expect(pigment.cacheHitRateAfterWarmup).toBeGreaterThan(0.7);
    expect(pigment.impastoSpecularContrastRatio).toBeGreaterThanOrEqual(2.15);
    expect(pigment.glazeOpticalDepthSteps).toBeGreaterThanOrEqual(5);
    expect(pigment.stylusTiltBroadeningRatio).toBeGreaterThan(1.4);
    expect(pigment.barrelRollCalligraphicContrast).toBeGreaterThanOrEqual(3.5);
  });

  it("데스크톱·태블릿·모바일 모든 기기 프로파일과 5대 경쟁사(CSP/Procreate/Rebelle 7/PaintStorm/Krita) 대비 2.0배 이상을 달성한다", () => {
    for (const deviceFormFactor of ["desktop", "tablet", "compact"] as const) {
      const scorecard = evaluateStudioCspBenchmarkScorecard({
        deviceFormFactor,
        strokeWidthPx: 24,
        brushOpacity: 0.9,
        stabilizerLevel: 4,
        wetMixEnabled: true,
        grainDepth: 0.72,
        bristleCount: 32,
        colorMixingMode: "latent-pigment",
      });

      expect(scorecard.performanceRatio).toBeGreaterThanOrEqual(2.0);
      expect(scorecard.qualityRatio).toBeGreaterThanOrEqual(2.0);
      expect(scorecard.featureRatio).toBeGreaterThanOrEqual(2.4);
      expect(scorecard.compositeRatio).toBeGreaterThanOrEqual(2.0);
      expect(scorecard.meetsTwoXTarget).toBe(true);
      expect(scorecard.internalizedEngines).toHaveLength(5);
      expect(scorecard.competitorComparisons).toHaveLength(5);
      for (const comp of scorecard.competitorComparisons) {
        expect(comp.exceedsTarget).toBe(true);
        expect(comp.superiorityRatio).toBeGreaterThanOrEqual(2.0);
      }
      expect(
        scorecard.performanceMetrics.some(
          (metric) => metric.id === "realtime-sync-delta-compression",
        ),
      ).toBe(true);
      expect(
        scorecard.qualityMetrics.some(
          (metric) => metric.id === "dip-pen-railroad-clumping-chromatography",
        ),
      ).toBe(true);
      expect(
        scorecard.qualityMetrics.some(
          (metric) => metric.id === "screentone-sdf-oklab-gradient-fidelity",
        ),
      ).toBe(true);
      expect(
        scorecard.featureMetrics.some((metric) => metric.id === "stylus-tilt-dual-brush-engine"),
      ).toBe(true);
      expect(
        scorecard.featureMetrics.some(
          (metric) => metric.id === "expressive-brush-personality-diversity",
        ),
      ).toBe(true);
      expect(
        scorecard.featureMetrics.some(
          (metric) => metric.id === "vector-ruler-fisheye-timelapse-suite",
        ),
      ).toBe(true);
      expect(
        scorecard.featureMetrics.some(
          (metric) => metric.id === "magma-kleki-anisotropic-reservoir-csl-suite",
        ),
      ).toBe(true);
      expect(scorecard.webCompetitorComparisons).toHaveLength(4);
      for (const webComp of scorecard.webCompetitorComparisons) {
        expect(webComp.exceedsTarget).toBe(true);
        expect(webComp.superiorityRatio).toBeGreaterThanOrEqual(2.0);
      }
    }

    const magmaKlekiBench = measureMagmaAndKlekiEngineBenchmark();
    expect(magmaKlekiBench.magmaPresetCount).toBe(19);
    expect(magmaKlekiBench.vineTiltExpansionRatio).toBeGreaterThan(2.0);
    expect(magmaKlekiBench.wireHeaderCompressionRatio).toBeGreaterThan(15);
    expect(magmaKlekiBench.klekiSketchyWebLinkRatio).toBeGreaterThan(0);

    const procreateBench = measureProcreateSilicaEngineBenchmark();
    expect(procreateBench.procreateBrushSetCount).toBe(18);
    expect(procreateBench.procreatePresetCount).toBeGreaterThanOrEqual(24);
    expect(procreateBench.vineCharcoalTiltExpansionRatio).toBeGreaterThan(1.8);
    expect(procreateBench.hoverAltitudeFootprintRatio).toBeGreaterThan(1.1);

    const universalBench = measureUniversalBrushTaxonomyEngineBenchmark();
    expect(universalBench.reaEvidenceTargetCount).toBe(45);
    expect(universalBench.wave22ReaEvidenceTargetCount).toBe(4);
    expect(universalBench.wave23ReaSemanticTargetCount).toBe(4);
    expect(universalBench.wave24ReaEvidenceCount).toBe(4);
    expect(universalBench.wave25ReaEvidenceCount).toBe(4);
    expect(universalBench.wave26ReaEvidenceCount).toBe(8);
    expect(universalBench.wave27ReaUiUxEvidenceCount).toBe(2);
    expect(universalBench.wave28HolisticReaEvidenceCount).toBe(6);
    expect(universalBench.unfragmentedEcosystemReaEvidenceCount).toBe(7);
    expect(universalBench.holisticToolPresetCount).toBe(12);
    expect(universalBench.completeEcosystemToolPresetCount).toBe(14);
    expect(universalBench.harmonyBrushKindCount).toBe(11);
    expect(universalBench.p5BrushPresetCount).toBe(11);
    expect(universalBench.p5BrushVectorFieldCount).toBe(7);
    expect(universalBench.sketchpadBrushKindCount).toBe(18);
    expect(universalBench.ibisMediBangPresetCount).toBe(19);
    expect(universalBench.skeletalArtBrushPresetCount).toBe(8);
    expect(universalBench.fiveTilePatternPresetCount).toBe(8);
    expect(universalBench.corelParticlePresetCount).toBe(9);
    expect(universalBench.klecksPresetCount).toBe(10);
    expect(universalBench.myPaintInputCount).toBe(18);
    expect(universalBench.myPaintSettingCount).toBe(64);
    expect(universalBench.myPaintPresetCount).toBe(10);
    expect(universalBench.spectral38BandCount).toBe(38);
    expect(universalBench.booleanPolygonUnionVertexCount).toBeGreaterThanOrEqual(4);
    expect(universalBench.freehandRoughPresetCount).toBe(10);
    expect(universalBench.perfectFreehandOutlineVertexCount).toBeGreaterThan(20);
    expect(universalBench.roughHachureSegmentCount).toBeGreaterThan(6);
    expect(universalBench.rdpSimplifiedPointCount).toBeLessThan(14);
    expect(universalBench.rbushSpatialHitCount).toBe(2);
    expect(universalBench.competitorFilterPresetCount).toBe(12);
    expect(universalBench.klecksVanishPointRayCount).toBe(36);
    expect(universalBench.glfxHalftoneDotCmykCount).toBe(4);
    expect(universalBench.schneiderFittedSegmentCount).toBeGreaterThanOrEqual(2);
    expect(universalBench.pomaxOffsetCuspCount).toBeGreaterThan(0);
    expect(universalBench.wickClosedGapCount).toBe(1);
    expect(universalBench.qrCodecRoundtripVerified).toBe(true);
  });

  it("REA로 역공학 검증된 Clip Studio Paint 5.1.5 아키텍처 기준선 요약을 제공한다", () => {
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.appVersion).toBe("5.1.5");
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.editImageToolNodeCount).toBe(255);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.editImageToolVariantColumnCount).toBe(507);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.brushShapePresetCount).toBe(14);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.mixPaletteToolCount).toBe(3);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.mixColorSetSwatchCount).toBe(13);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.modifyKeyRuleCount).toBe(84);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.toneDotShapeCount).toBe(22);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.rulerEngineCount).toBe(7);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.dessinDollV2BoneCount).toBe(56);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.handSetupCornerPoseCount).toBe(6);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.tgCxsPlugInExportedSymbolCount).toBe(7765);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.filterPluginBundles).toContain(
      "FlowBasedAbstraction.bundle",
    );
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.filterPluginBundles).toContain(
      "PencilArtFilter.bundle",
    );
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.filterPluginBundles).toContain(
      "TPPChromaticAberration.bundle",
    );
  });

  it("Wave 28 114개 파일 전 기능 통합 코퍼스 일괄 REA 원장(6개 서브시스템) 및 플루드필·그라디언트·호모그래피·톤커브·W3C 레이어·이젤 커널을 검증한다", () => {
    expect(WAVE28_HOLISTIC_ECOSYSTEM_REA_LEDGER).toHaveLength(6);
    expect(HOLISTIC_STUDIO_TOOL_PRESETS).toHaveLength(12);
    for (const entry of WAVE28_HOLISTIC_ECOSYSTEM_REA_LEDGER) {
      expect(entry.parentEvidenceId).toBe(
        "ev_442cce74aefb79ad517d22c48d4442e8d7ef4f8d50446d56609154642b36cfa8",
      );
      expect(entry.corpusFileCount).toBe(114);
      expect(entry.visitedAstNodes).toBe(195455);
      expect(entry.dataFlowRelations).toBe(97197);
    }

    const floodFill = executeHolisticFloodFillAndMagicErase({
      rgbaBuffer: new Uint8ClampedArray(16 * 4).fill(220),
      width: 4,
      height: 4,
      seedX: 1,
      seedY: 1,
      tolerance255: 20,
      growPx: 1,
      isContiguous: true,
    });
    expect(floodFill.filledPixelCount).toBe(16);
    expect(floodFill.grownPixelCount).toBe(16);

    const grad = evaluateHolisticGradientTool({
      x1: 0,
      y1: 0,
      x2: 40,
      y2: 38,
      doSnap45: true,
      kind: "linear-mirror",
      doLockAlpha: true,
      sampleX: 20,
      sampleY: 20,
    });
    expect(grad.snappedAngleDeg).toBe(45);
    expect(grad.compositeOperation).toBe("source-atop");

    const homography = evaluateHolisticPerspectiveAndFreeTransform({
      beforeQuad: [0, 0, 100, 0, 100, 100, 0, 100],
      afterQuad: [10, 5, 95, 12, 105, 95, 5, 90],
      sampleX: 50,
      sampleY: 50,
      transformAngleDeg: 45,
      viewportScale: 2,
    });
    expect(homography.resizeCursor).toBe("ne-resize");
    expect(homography.effectiveSnapDistancePx).toBe(3.5);

    const grading = applyHolisticColorGradingAndCurvesSuite({
      originalRgb01: [0.6, 0.4, 0.2],
      blurredRgb01: [0.3, 0.3, 0.3],
      unsharpStrength: 0.5,
      brightness: 0.1,
      contrast: 0.2,
      hueShiftMinus1To1: 0.2,
      saturationMinus1To1: 0.3,
      curveControlPoints01: [
        [0, 0],
        [0.5, 0.65],
        [1, 1],
      ],
    });
    expect(grading.toneCurveLut256[128]).toBeGreaterThan(140);

    const comp = evaluateHolisticLayerCompositorAndEasel({
      baseRgba01: [0.8, 0.7, 0.6, 0.9],
      activeRgba01: [0.3, 0.5, 0.9, 0.8],
      blendMode: "soft-light",
      hasClippingMask: true,
      isAlphaLocked: false,
      dirtyRect: { x: 10, y: 10, width: 300, height: 300 },
      rawPoints: [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
      ],
      stabilizerStrength01: 0.7,
      easelScale: 1.5,
      easelAngleDeg: 14,
      easelIsMirrored: true,
      snapRotation15: true,
    });
    expect(comp.dirtyHistoryTileCount).toBe(4);
    expect(comp.snappedEaselAngleDeg).toBe(15);
  });

  it("Wave 29 699개 파일(618,741 AST 노드) 비분할 일괄 REA 원장(7개 서브시스템) 및 FFD·다중선택·타이포·클론·3D조각·어니언스킨·Vibrance 커널을 검증한다", () => {
    expect(COMPLETE_UNFRAGMENTED_ECOSYSTEM_REA_LEDGER).toHaveLength(7);
    expect(COMPLETE_ECOSYSTEM_TOOL_PRESETS).toHaveLength(14);
    for (const entry of COMPLETE_UNFRAGMENTED_ECOSYSTEM_REA_LEDGER) {
      expect(entry.parentEvidenceId).toBe(
        "ev_4742ae24c0e0894803c2af285fca4288a072af5f0190032d8529e469685af06b",
      );
      expect(entry.corpusFileCount).toBe(699);
      expect(entry.visitedAstNodes).toBe(618741);
      expect(entry.dataFlowRelations).toBe(13781);
    }

    expect(evaluateBernsteinBasis(4, 2, 0.5)).toBeCloseTo(0.375, 4);
    const ffd = evaluateBernsteinFfdLatticeMeshWarp({
      cols: 5,
      rows: 5,
      rect: { x: 0, y: 0, width: 200, height: 100 },
      centerDisplaceX: 28,
      centerDisplaceY: -12,
      sampleS01: 0.5,
      sampleT01: 0.5,
      meshResolution: 12,
    });
    expect(ffd.warpedPoint.x).toBeGreaterThan(102);
    expect(ffd.controlPointCount).toBe(25);
    expect(ffd.triangleIndexCount).toBe(864);

    const sel = evaluateMultiPolygonSelectAndMarquee({
      shape: "ellipse",
      startX: 10,
      startY: 10,
      endX: 90,
      endY: 70,
      isShiftPressed: true,
      operation: "union",
    });
    expect(sel.vertexCount).toBe(50);
    expect(sel.isTooThin).toBe(false);
    expect(sel.constrainedEnd.x).toBe(70);

    const typo = evaluateRichCanvasTypographyLayout({
      text: "TOON\tSTUDIO\nPRO",
      fontSizePx: 24,
      lineHeightEm: 1.25,
      letterSpacingPx: 2,
      align: "center",
      strokeWidthPx: 3,
    });
    expect(typo.lineCount).toBe(2);
    expect(typo.effectiveStrokeJoin).toBe("round");
    expect(typo.boundingBox.width).toBeGreaterThan(150);

    const cloneAir = evaluateCloneStampAndConicalAirbrush({
      cloneOriginX: 100,
      cloneOriginY: 80,
      clickStartX: 50,
      clickStartY: 50,
      currentMouseX: 62,
      currentMouseY: 58,
      brushDiameterPx: 40,
      sampleDistFromCenterPx: 14,
      airbrushSeed01: [0.25, 0.5],
      targetRgb255: [20, 20, 20],
      foregroundRgb255: [22, 18, 20],
      replacementRgb255: [50, 200, 100],
      tolerance255: 10,
    });
    expect(cloneAir.sourceSampleCoord).toEqual({ x: 112, y: 88 });
    expect(cloneAir.radialFeatherAlpha01).toBeLessThan(1);
    expect(cloneAir.colorReplacedRgb255).toEqual([50, 200, 100]);

    const sculpt = evaluateSculptGlTwistAndDynamicTopology({
      vertex: [10, 0, 0],
      center: [0, 0, 0],
      radius: 25,
      twistAngleRad: Math.PI / 2,
      maskWeight01: 1,
      edgeLength: 1.8,
      detailThreshold: 1.0,
    });
    expect(sculpt.twistedVertex[1]).toBeGreaterThan(5);
    expect(sculpt.topologyAction).toBe("subdivide-split");

    const piskel = evaluatePiskelOnionSkinAndSpritesheet({
      zoom: 2,
      gridWidth: 1,
      offsetX: 0,
      offsetY: 0,
      width: 64,
      height: 64,
      frameHashes: ["f1", "f2"],
      layerCount: 3,
      totalFrameCount: 12,
    });
    expect(piskel.spritesheetCols).toBe(4);
    expect(piskel.spritesheetRows).toBe(3);

    const glfxExt = applyCompleteGlfxFilterExtensionSuite({
      rgb01: [0.4, 0.6, 0.3],
      vibranceMinus1To1: 0.5,
      uv01: [0.8, 0.7],
      vignetteSize01: 0.3,
      vignetteAmount01: 0.7,
      sepiaAmount01: 0.6,
      dotScreenAngleRad: 0.4,
      dotScreenSizePx: 5,
      pixelCoord: [24, 18],
    });
    expect(glfxExt.vibranceRgb01[0]).toBeLessThan(0.4);
    expect(glfxExt.vignetteRgb01[1]).toBeLessThan(0.6);

    const summary = evaluateCompleteUnfragmentedStudioSummary({
      presetId: "ecosystem-ffd-lattice-5x5",
      sampleX: 44,
      sampleY: 22,
      rgb01: [0.3, 0.6, 0.4],
    });
    expect(summary.ffdDisplacementPx).toBeGreaterThan(0);
    expect(summary.onionSkinAlpha01).toBeCloseTo(0.35, 4);
  });
});



