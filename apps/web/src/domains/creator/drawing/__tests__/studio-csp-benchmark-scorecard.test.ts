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
  evaluateAgPsdPackBitsAndLayerChannelCodec,
  evaluateBernsteinBasis,
  evaluateBernsteinFfdLatticeMeshWarp,
  evaluateCloneStampAndConicalAirbrush,
  evaluateCompleteUnfragmentedStudioSummary,
  evaluateCuloriCiede2000AndOklchGamutMap,
  evaluateExcalidrawElbowArrowAndLaserTrail,
  evaluateFabricSprayDeduplicationAndAtrament,
  evaluateHolisticGradientTool,
  evaluateHolisticLayerCompositorAndEasel,
  evaluateHolisticPerspectiveAndFreeTransform,
  evaluateKonvaEmbossEnhancePosterizeSuite,
  evaluateKonvaKaleidoscopePolarMirror,
  evaluateMandalaSymmetryAndPerspectiveRuler,
  evaluateMonolithicTotalEngineTelemetry,
  evaluateMultiPolygonSelectAndMarquee,
  evaluateOtsuBimodalCannyAndSkiaLookahead,
  evaluatePaperCatmullRomSmoothAndFlatten,
  evaluatePiskelDitherLightenAndKlecksCatchUp,
  evaluatePiskelOnionSkinAndSpritesheet,
  evaluateRichCanvasTypographyLayout,
  evaluateSculptGlCreaseFlattenAndTangentSmooth,
  evaluateSculptGlTwistAndDynamicTopology,
  evaluateGpuDrivenFrustumHiZIndirectCull,
  evaluatePixiV8RenderBundleAndUboBatcher,
  evaluateVelloEulerSpiralFlattenAndAnalyticAa,
  evaluateWasmLinearMemoryBvhAndWorkerRing,
  evaluateWebGpuHighSpeedArchitectureTelemetry,
  evaluateZeroCopyComputeToVertexAndRadixStateSort,
  executeHolisticFloodFillAndMagicErase,
  HOLISTIC_STUDIO_TOOL_PRESETS,
  measureUniversalBrushTaxonomyEngineBenchmark,
  MONOLITHIC_TOTAL_ECOSYSTEM_REA_LEDGER,
  MONOLITHIC_TOTAL_TOOL_PRESETS,
  WAVE28_HOLISTIC_ECOSYSTEM_REA_LEDGER,
  WEBGPU_HIGHSPEED_ARCHITECTURE_PRESETS,
  WEBGPU_HIGHSPEED_BRUSH_REA_LEDGER,
  WEBGPU_ZERO_COPY_INDIRECT_BRUSH_WGSL,
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
    expect(universalBench.reaEvidenceTargetCount).toBe(58);
    expect(universalBench.wave22ReaEvidenceTargetCount).toBe(4);
    expect(universalBench.wave23ReaSemanticTargetCount).toBe(4);
    expect(universalBench.wave24ReaEvidenceCount).toBe(4);
    expect(universalBench.wave25ReaEvidenceCount).toBe(4);
    expect(universalBench.wave26ReaEvidenceCount).toBe(8);
    expect(universalBench.wave27ReaUiUxEvidenceCount).toBe(2);
    expect(universalBench.wave28HolisticReaEvidenceCount).toBe(6);
    expect(universalBench.unfragmentedEcosystemReaEvidenceCount).toBe(7);
    expect(universalBench.monolithicTotalReaEvidenceCount).toBe(8);
    expect(universalBench.webGpuHighSpeedReaEvidenceCount).toBe(5);
    expect(universalBench.holisticToolPresetCount).toBe(12);
    expect(universalBench.completeEcosystemToolPresetCount).toBe(14);
    expect(universalBench.monolithicTotalToolPresetCount).toBe(20);
    expect(universalBench.webGpuHighSpeedPresetCount).toBe(12);
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

  it("Wave 30~32 767개 파일 무누락 일괄 REA 원장(8개 서브시스템·20개 프리셋)과 칼레이도스코프·엠보스·Paper.js·Excalidraw·만다라·ag-psd PackBits·culori CIEDE2000·Otsu/Canny·SculptGL Crease·Piskel·Klecks·JSPaint를 검증한다", () => {
    expect(MONOLITHIC_TOTAL_ECOSYSTEM_REA_LEDGER).toHaveLength(8);
    expect(MONOLITHIC_TOTAL_TOOL_PRESETS).toHaveLength(20);
    expect(MONOLITHIC_TOTAL_ECOSYSTEM_REA_LEDGER[0]?.relevantFiles).toBe(755);
    expect(MONOLITHIC_TOTAL_ECOSYSTEM_REA_LEDGER[0]?.visitedAstNodes).toBe(771934);
    expect(MONOLITHIC_TOTAL_ECOSYSTEM_REA_LEDGER[6]?.relevantFiles).toBe(767);
    expect(MONOLITHIC_TOTAL_ECOSYSTEM_REA_LEDGER[6]?.evidenceId).toBe(
      "ev_13bbde3494001044d31ebdb3d481f0cd91c96f6dc995f78b17c1cf9984ea2d28",
    );
    expect(MONOLITHIC_TOTAL_ECOSYSTEM_REA_LEDGER[7]?.relevantFiles).toBe(767);
    expect(MONOLITHIC_TOTAL_ECOSYSTEM_REA_LEDGER[7]?.visitedAstNodes).toBe(791354);
    expect(MONOLITHIC_TOTAL_ECOSYSTEM_REA_LEDGER[7]?.dataFlowRelations).toBe(56403);
    expect(MONOLITHIC_TOTAL_ECOSYSTEM_REA_LEDGER[7]?.evidenceId).toBe(
      "ev_6a28510e2b0c37cbe1bd3296ceeb41c7b4ae4ce8a7999b91ef1ee495ec361cdc",
    );

    const kaleido = evaluateKonvaKaleidoscopePolarMirror({
      width: 128,
      height: 128,
      sampleX: 100,
      sampleY: 40,
      power: 3,
      angleDeg: 45,
    });
    expect(kaleido.clampedPower).toBe(3);
    expect(kaleido.minSectionSize).toBe(16);
    expect(kaleido.mirroredThetaIndex).toBeGreaterThanOrEqual(0);
    expect(kaleido.mirroredThetaIndex).toBeLessThan(16);

    const embossSuite = evaluateKonvaEmbossEnhancePosterizeSuite({
      rgb: [140, 120, 100],
      neighborLuminance3x3: [20, 40, 60, 50, 120, 190, 90, 180, 240],
      channelMinRgb: [20, 20, 20],
      channelMaxRgb: [220, 220, 220],
      embossStrength01: 0.8,
      embossWhiteLevel01: 0.5,
      embossDirection: "top-left",
      embossBlend: true,
      enhanceAmount: 0.5,
      posterizeLevels: 4,
      threshold01: 0.5,
    });
    expect(embossSuite.directionalSobelResponse).not.toBe(0);
    expect(embossSuite.enhancedRgb[0]).toBeGreaterThan(140);
    expect([0, 255]).toContain(embossSuite.thresholdBit);

    const paper = evaluatePaperCatmullRomSmoothAndFlatten({
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 80 },
        { x: 90, y: 10 },
        { x: 140, y: 90 },
      ],
      factor: 0.5,
      flatness: 0.4,
    });
    expect(paper.controlHandles).toHaveLength(4);
    expect(paper.subdivisionCount).toBeGreaterThan(0);
    expect(paper.flattenedPolyline.length).toBeGreaterThan(4);

    const elbow = evaluateExcalidrawElbowArrowAndLaserTrail({
      start: { x: 20, y: 20 },
      end: { x: 180, y: 120 },
      startHeading: "RIGHT",
      endHeading: "DOWN",
      obstaclePaddingPx: 24,
      laserTrailSamples: [
        { x: 30, y: 30, ageMs: 100 },
        { x: 60, y: 50, ageMs: 800 },
      ],
      laserDurationMs: 1000,
    });
    expect(elbow.bendCount).toBeGreaterThanOrEqual(2);
    expect(elbow.laserSegments[0]!.opacity01).toBeGreaterThan(elbow.laserSegments[1]!.opacity01);

    const spray = evaluateFabricSprayDeduplicationAndAtrament({
      pointerX: 50,
      pointerY: 50,
      sprayWidth: 20,
      density: 24,
      dotWidth: 3,
      dotWidthVariance: 2,
      randomOpacity: true,
      prevPoint: { x: 30, y: 40 },
      baseSmoothing01: 0.7,
    });
    expect(spray.optimizedRectCount).toBeGreaterThan(0);
    expect(spray.optimizedRectCount).toBeLessThanOrEqual(24);
    expect(spray.atramentAdaptiveSmoothing01).toBeGreaterThan(0.7);

    const mandala = evaluateMandalaSymmetryAndPerspectiveRuler({
      centerX: 100,
      centerY: 100,
      sampleX: 140,
      sampleY: 110,
      axisCount: 8,
      includeMirrorReflection: true,
      vanishingPoint: { x: 100, y: 20 },
      rulerMode: "isometric-30",
    });
    expect(mandala.totalSymmetricCopies).toBe(16);
    expect([30, 90, 150, 210, 270, 330]).toContain(mandala.snappedAngleDeg);

    const psd = evaluateAgPsdPackBitsAndLayerChannelCodec({
      scanlineBytes: [200, 200, 200, 200, 200, 128, 64, 32, 32, 32, 32],
      blendModeName: "multiply",
      transparencyProtected: true,
      hidden: false,
      clipping: true,
    });
    expect(psd.decodedScanline).toEqual([200, 200, 200, 200, 200, 128, 64, 32, 32, 32, 32]);
    expect(psd.compressionRatio01).toBeLessThan(1);
    expect(psd.psdBlendKey4Char).toBe("mul ");
    expect(psd.layerFlagsBitmask).toBe(9);
    expect(psd.clippingByte).toBe(1);

    const culori = evaluateCuloriCiede2000AndOklchGamutMap({
      stdLab: { l: 50, a: 2.6772, b: -79.7751 },
      smpLab: { l: 50, a: 0, b: -82.7485 },
      targetOklch: { l: 0.72, c: 0.42, hDeg: 145 },
    });
    expect(culori.ciede2000DeltaE).toBeCloseTo(2.0425, 3);
    expect(culori.clampedOklchChroma).toBeGreaterThan(0.1);
    expect(culori.clampedOklchChroma).toBeLessThan(0.42);
    expect(culori.gamutMappedSrgb01[1]).toBeGreaterThan(0.5);

    const vision = evaluateOtsuBimodalCannyAndSkiaLookahead({
      luminanceSamples: [15, 18, 22, 24, 28, 200, 210, 220, 230, 245],
      gradX: 90,
      gradY: 45,
      neighborMagnitudes: [60, 70],
      lowThreshold: 40,
      highThreshold: 80,
      recentPoints: [
        { x: 10, y: 10 },
        { x: 20, y: 15 },
        { x: 32, y: 22 },
      ],
    });
    expect(vision.otsuOptimalThreshold).toBe(28);
    expect(vision.maxBetweenClassVariance).toBeGreaterThan(8000);
    expect(vision.cannyEdgeState).toBe("strong");
    expect(vision.predictedNextPoint.x).toBeGreaterThan(32);

    const sculptCrease = evaluateSculptGlCreaseFlattenAndTangentSmooth({
      vertex: [2, 1, 0.5],
      center: [0, 0, 0],
      normal: [0, 0, 1],
      laplacianTarget: [2.4, 1.3, 1.9],
      radius: 10,
      intensity01: 0.8,
      isNegative: false,
    });
    expect(sculptCrease.creasedVertex[2]).toBeGreaterThan(0.5);
    expect(sculptCrease.flattenedVertex[2]).toBeLessThan(0.5);
    expect(sculptCrease.tangentSmoothedVertex[2]).toBeCloseTo(0.5, 5);

    const piskelKlecks = evaluatePiskelDitherLightenAndKlecksCatchUp({
      col: 3,
      row: 4,
      isRightButton: false,
      baseLuma255: 140,
      isShiftOncePerPixel: true,
      isCtrlDarken: false,
      targetX: 100,
      lastSmoothedX: 60,
      smoothing01: 0.65,
      catchUpTicks: 4,
      jspaintBrushSize: 8,
      jspaintShape: "reverse_diagonal",
    });
    expect(piskelKlecks.usesPrimaryDitherColor).toBe(true);
    expect(piskelKlecks.adjustedLuma255).toBeGreaterThan(140);
    expect(piskelKlecks.caughtUpX).toBeGreaterThan(80);
    expect(piskelKlecks.jspaintCanvasSizePx).toBe(8);
    expect(piskelKlecks.jspaintEffectiveSpanPx).toBeCloseTo(7.6, 3);

    const telemetry = evaluateMonolithicTotalEngineTelemetry({
      presetId: "monolithic-ag-psd-packbits-8bim",
      strength01: 0.75,
      symmetryAxes: 8,
    });
    expect(telemetry.mandalaSymmetricCopyCount).toBe(16);
    expect(telemetry.paperSubdivisionCount).toBeGreaterThan(0);
    expect(telemetry.psdCompressionRatio01).toBeLessThan(1);
    expect(telemetry.ciede2000DeltaE).toBeGreaterThan(0);
    expect(telemetry.otsuOptimalThreshold).toBe(31);
    expect(telemetry.sculptCreaseZ).toBeGreaterThan(0.5);
    expect(telemetry.klecksCatchUpX).toBeGreaterThan(20);
  });

  it("Wave 33 215개 파일 WebGPU 초고속 브러시 아키텍처(Vello WGSL·Orillusion Indirect·PixiJS v8 RenderBundle/UBO·Three.js Zero-Copy·WASM Morton LBVH) REA 원장(5개 엔트리·12개 프리셋)과 커널을 검증한다", () => {
    expect(WEBGPU_HIGHSPEED_BRUSH_REA_LEDGER).toHaveLength(5);
    expect(WEBGPU_HIGHSPEED_ARCHITECTURE_PRESETS).toHaveLength(12);
    expect(WEBGPU_ZERO_COPY_INDIRECT_BRUSH_WGSL).toContain("atomicAdd(&indirect_args.instance_count, 1u)");
    expect(WEBGPU_HIGHSPEED_BRUSH_REA_LEDGER[0]?.parentEvidenceId).toBe(
      "ev_c8f3c2e349c2ec10d5e86761c2414b5b260185090f10d835f9e767f90eeb7f9b",
    );
    expect(WEBGPU_HIGHSPEED_BRUSH_REA_LEDGER[0]?.evidenceId).toBe(
      "ev_346020a1c98a9a75accd29be7d1a2be8690cd59e2ca60ea0eaa42f712c42de8b",
    );
    expect(WEBGPU_HIGHSPEED_BRUSH_REA_LEDGER[0]?.relevantFiles).toBe(215);
    expect(WEBGPU_HIGHSPEED_BRUSH_REA_LEDGER[0]?.visitedAstNodes).toBe(133090);
    expect(WEBGPU_HIGHSPEED_BRUSH_REA_LEDGER[0]?.dataFlowRelations).toBe(29090);

    const vello = evaluateVelloEulerSpiralFlattenAndAnalyticAa({
      p0: { x: 10, y: 12 },
      p1: { x: 74, y: 36 },
      th0Rad: 0.42,
      th1Rad: -0.28,
      strokeHalfWidthPx: 8,
      flattenTolerancePx: 0.25,
      pixelOrigin: { x: 20, y: 12.2 },
      evenOddRule: false,
      sampleFract01: 0.35,
      gaussianSigmaDistance: 0.5,
    });
    expect(vello.parabolaIntegral01).toBeGreaterThan(0);
    expect(vello.subdivisionCount).toBeGreaterThanOrEqual(2);
    expect(vello.analyticPixelCoverage4[0]).toBeGreaterThan(0);
    expect(vello.erf7GaussianAlpha01).toBeGreaterThan(0.2);
    expect(vello.mitchellBicubicWeights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);

    const cull = evaluateGpuDrivenFrustumHiZIndirectCull({
      instances: [
        { minX: -20, minY: -20, maxX: 30, maxY: 30, depth01: 0.2, enabled: true },
        { minX: 400, minY: 400, maxX: 450, maxY: 450, depth01: 0.2, enabled: true },
        { minX: 10, minY: 10, maxX: 40, maxY: 40, depth01: 0.85, enabled: true },
      ],
      frustumRect: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
      hizMaxOccluderDepth01: 0.6,
      indexCountPerQuad: 6,
    });
    expect(cull.visibleInstanceCount).toBe(1);
    expect(cull.culledInstanceCount).toBe(2);
    expect(Array.from(cull.drawIndexedIndirectBufferU32)).toEqual([6, 1, 0, 0, 0]);
    expect(cull.cpuDrawCallsSubmitted).toBe(1);

    const pixi = evaluatePixiV8RenderBundleAndUboBatcher({
      colorFormatId: 1,
      depthStencilFormatId: 2,
      msaaSampleCount: 4,
      flipYParity: false,
      deviceEpochId: 1,
      cachedBundleStateKeys: [1082369, 1082369],
      uniformGroupFloatCounts: [16, 40, 64, 80],
      minUniformOffsetAlignmentBytes: 256,
    });
    expect(pixi.validBundleCount).toBe(2);
    expect(pixi.executeBundlesCallCount).toBe(1);
    expect(pixi.uboAlignedOffsetsBytes).toEqual([0, 256, 512, 768]);
    expect(pixi.totalUboBatchBytes).toBe(1280);

    const zeroCopy = evaluateZeroCopyComputeToVertexAndRadixStateSort({
      dabs: [
        { x: 10, y: 10, radiusPx: 8, angleRad: 0, pipelineId: 3, blendModeId: 2, textureArraySlice: 5 },
        { x: 20, y: 15, radiusPx: 9, angleRad: 0.1, pipelineId: 1, blendModeId: 1, textureArraySlice: 2 },
        { x: 30, y: 20, radiusPx: 10, angleRad: 0.2, pipelineId: 3, blendModeId: 2, textureArraySlice: 5 },
      ],
    });
    expect(zeroCopy.perFrameMapAsyncCalls).toBe(0);
    expect(zeroCopy.unsortedPipelineSwitches).toBe(2);
    expect(zeroCopy.sortedPipelineSwitches).toBe(1);
    expect(zeroCopy.usesTexture2DArray).toBe(true);

    const wasm = evaluateWasmLinearMemoryBvhAndWorkerRing({
      normalizedX01: 0.5,
      normalizedY01: 0.5,
      wasmLinearByteOffset: 300,
      bucketPoints: [
        { x: 30, y: 22 },
        { x: 35, y: 45 },
        { x: 40, y: 25 },
      ],
      prevSelectedPoint: { x: 20, y: 20 },
      nextBucketAverage: { x: 55, y: 24 },
      mainThreadJankMs: 25,
    });
    expect(wasm.mortonCode32).toBeGreaterThan(0);
    expect(wasm.alignedWasmWriteBufferOffset).toBe(512);
    expect(wasm.lttbSelectedCandidateIndex).toBe(1);
    expect(wasm.workerDroppedFramesUnderMainJank).toBe(0);

    const archTel = evaluateWebGpuHighSpeedArchitectureTelemetry({
      presetId: "webgpu-vello-euler-flatten-aa",
      indirectCullingEnabled: true,
      strokeQuality01: 0.85,
    });
    expect(archTel.indirectVisibleInstances).toBe(2);
    expect(archTel.renderBundleValidCount).toBe(3);
    expect(archTel.indirectDrawCalls).toBe(1);
  });
});



