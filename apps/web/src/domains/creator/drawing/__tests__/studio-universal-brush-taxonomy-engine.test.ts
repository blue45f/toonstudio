import { describe, expect, it } from "vitest";

import {
  applyConceptsNudgeAndSlice,
  applyGlfxFilterSuite,
  applyKlecksFilterAndVanishPointSuite,
  applyMiniPaintArtisticFilterSuite,
  applyPixelArtAdvancedBrush,
  applySculptGlPixol25DBrushDab,
  COMPETITOR_FILTER_PRESETS,
  computePomaxBezierParallelOffsetEnvelope,
  COREL_PARTICLE_BRUSH_PRESETS,
  decodeCleanRoomBrushQrPayload,
  encodeCleanRoomBrushQrPayload,
  evaluateArtRageAndFrescoBrushStep,
  evaluateBayerDitherBrushMask,
  evaluateInkscapeCalligraphicSpiroStroke,
  evaluateKlecksPrecisionSliderMapping,
  evaluateKlecksTrigonometricPrng01,
  evaluateKonvaCardinalTensionSpline,
  evaluateMiltonAnalyticalCapsuleSdfCoverage01,
  evaluateMyPaintFullDynamicsStep,
  evaluateP5BrushVectorFieldAngleDeg,
  evaluateSaiVer2BrushStep,
  evaluateSculptGlQuarticFalloff01,
  executeBooleanPolygonBrushClip,
  executeFabricBrushSuite,
  executeHarmonyProceduralBrush,
  executeKlecksBrushEngineSuite,
  executeWickCroquisBlobAndGapFill,
  filterPixelPerfectStroke,
  fitSchneiderCubicBezierSpline,
  FIVE_TILE_PATTERN_BRUSH_PRESETS,
  FREEHAND_ROUGH_BRUSH_PRESETS,
  generateJsPaintBrushMask,
  HARMONY_BRUSH_KINDS,
  IBIS_MEDIBANG_BRUSH_PRESETS,
  KLECKS_BRUSH_PRESETS,
  layoutFiveTileVectorPatternBrush,
  measureUniversalBrushTaxonomyEngineBenchmark,
  mixCieLabColorSpace,
  mixSpectral38BandKubelkaMunkWithGamutMap,
  MYPAINT_BRUSH_PRESETS,
  MYPAINT_CANONICAL_INPUT_CATALOG,
  MYPAINT_CANONICAL_SETTING_CATALOG,
  P5_BRUSH_PRESET_CATALOG,
  P5_BRUSH_VECTOR_FIELDS,
  queryStrokeSpatialRTreeBBox,
  simplifyStrokePolylineRdp,
  SKELETAL_ART_BRUSH_PRESETS,
  SKETCHPAD_BRUSH_KINDS,
  SPECTRAL_38BAND_WAVELENGTHS_NM,
  stepCorelPainterParticleBrush,
  stepLazyBrushWithCircularFriction,
  stepPhotoshopMixerBrushReservoir,
  synthesizeComicRibbonStampChain,
  synthesizeHeavyPaintBlockInPolygons,
  synthesizeP5BrushWatercolorBleedPolygon,
  synthesizePerfectFreehandStrokeOutline,
  synthesizeRoughSketchyStrokeAndHachureFill,
  synthesizeSketchpadBrushDabs,
  synthesizeWeaveSilkSymmetryRibbons,
  traceP5BrushFlowLine,
  UNIVERSAL_BRUSH_REA_EVIDENCE_LEDGER,
  warpSkeletalArtBrushAlongSpine,
  WAVE22_VECTOR_PARTICLE_PIXOL_REA_EVIDENCE_LEDGER,
  WAVE23_REA_DEEP_SEMANTIC_LEDGER,
  WAVE24_MYPAINT_SPECTRAL_BOOLEAN_REA_LEDGER,
  WAVE25_FREEHAND_ROUGH_SPATIAL_REA_LEDGER,
  WAVE26_COMPETITOR_FILTER_BRUSH_REA_LEDGER,
} from "../studio-universal-brush-taxonomy-engine";

describe("studio-universal-brush-taxonomy-engine (Wave 21 & Wave 22 범용 브러시·드로잉 엔진 내재화)", () => {
  it("2026-10-26 REA 실측 증거 원장(Wave 21 6개 + Wave 22 4개 = 10개 대상, 30만+ AST 노드)을 정본으로 노출한다", () => {
    expect(UNIVERSAL_BRUSH_REA_EVIDENCE_LEDGER).toHaveLength(6);
    expect(WAVE22_VECTOR_PARTICLE_PIXOL_REA_EVIDENCE_LEDGER).toHaveLength(4);
    for (const entry of UNIVERSAL_BRUSH_REA_EVIDENCE_LEDGER) {
      expect(entry.astEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.parentAstEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.visitedAstNodes).toBeGreaterThan(5000);
      expect(entry.internalizedBrushCount).toBeGreaterThanOrEqual(10);
    }
    for (const entry of WAVE22_VECTOR_PARTICLE_PIXOL_REA_EVIDENCE_LEDGER) {
      expect(entry.staticAnalysisEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.visitedAstNodes).toBeGreaterThan(400);
      expect(entry.internalizedKernels.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("mrdoob/harmony 11종 절차적 브러시 전 종류가 유효한 기하 프리미티브를 생성한다", () => {
    const stroke = Array.from({ length: 12 }, (_, idx) => ({
      x: 20 + idx * 7,
      y: 35 + Math.cos(idx * 0.5) * 6,
      pressure01: 0.85,
    }));

    expect(HARMONY_BRUSH_KINDS).toHaveLength(11);
    for (const kind of HARMONY_BRUSH_KINDS) {
      const res = executeHarmonyProceduralBrush(kind, stroke, { seed: 42 });
      expect(res.brushKind).toBe(kind);
      expect(res.primitiveCount).toBeGreaterThan(0);
    }

    const sketchy = executeHarmonyProceduralBrush("sketchy", stroke, { seed: 42 });
    expect(sketchy.chordLinkCount).toBeGreaterThan(0);
    const chrome = executeHarmonyProceduralBrush("chrome", stroke, { seed: 42 });
    expect(chrome.chordLinkCount).toBeGreaterThan(0);
  });

  it("acamposuribe/p5.brush 11종 브러시 프리셋과 7종 벡터장 유선·다각형 수채 번짐이 결정론적으로 동작한다", () => {
    expect(P5_BRUSH_PRESET_CATALOG).toHaveLength(11);
    expect(P5_BRUSH_VECTOR_FIELDS).toHaveLength(7);

    for (const field of P5_BRUSH_VECTOR_FIELDS) {
      const angle = evaluateP5BrushVectorFieldAngleDeg(field, 0.35, 0.65, 99);
      expect(Number.isFinite(angle)).toBe(true);
    }

    const flowLine = traceP5BrushFlowLine({
      presetId: "charcoal",
      fieldKind: "waves",
      startX: 40,
      startY: 50,
      lengthPx: 96,
      baseAngleDeg: 15,
      wiggleIntensity: 1.2,
    });
    expect(flowLine.length).toBeGreaterThan(4);
    expect(flowLine.every((pt) => pt.radiusPx > 0 && pt.opacity01 > 0)).toBe(true);

    const bleedLayers = synthesizeP5BrushWatercolorBleedPolygon({
      vertices: [
        { x: 10, y: 10 },
        { x: 90, y: 10 },
        { x: 90, y: 80 },
        { x: 10, y: 80 },
      ],
      bleedStrength01: 0.45,
      direction: "out",
      layerCount: 6,
    });
    expect(bleedLayers).toHaveLength(6);
    expect(bleedLayers[0].vertices.length).toBeGreaterThan(4);
  });

  it("Sketchpad 5.1 18종 브러시(Spirograph 하이포트로코이드, Mirror 대칭, Tile 래핑, Rainbow 색상환)를 합성한다", () => {
    expect(SKETCHPAD_BRUSH_KINDS).toHaveLength(18);
    const pts = [
      { x: 50, y: 60, pressure01: 0.7 },
      { x: 80, y: 90, pressure01: 0.9 },
      { x: 110, y: 110, pressure01: 0.8 },
    ];

    const spiro = synthesizeSketchpadBrushDabs("spirograph", pts, { baseSizePx: 16 });
    expect(spiro.length).toBe(pts.length * 6);

    const mirror = synthesizeSketchpadBrushDabs("mirror", pts, { canvasWidth: 300 });
    expect(mirror.length).toBe(pts.length * 2);
    expect(mirror[1].x).toBe(250);
  });

  it("ibisPaint X & MediBang Paint 19종 웹툰·리본 스탬프 체인과 FNV-1a QR 브러시 공유 코덱이 왕복 검증된다", () => {
    expect(IBIS_MEDIBANG_BRUSH_PRESETS).toHaveLength(19);
    const stamps = synthesizeComicRibbonStampChain(
      "ribbon-petal-chain",
      [
        { x: 0, y: 0, pressure01: 0.6 },
        { x: 60, y: 0, pressure01: 0.9 },
      ],
      20,
    );
    expect(stamps.length).toBeGreaterThan(4);
    expect(stamps.some((s) => s.nozzleIndex > 0)).toBe(true);

    const encoded = encodeCleanRoomBrushQrPayload({
      presetId: "ribbon-lace-frill",
      baseDiameterPx: 32.5,
      opacity01: 0.88,
      spacingRatio: 0.5,
    });
    const decoded = decodeCleanRoomBrushQrPayload(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.presetId).toBe("ribbon-lace-frill");
    expect(decoded?.baseDiameterPx).toBe(32.5);
    expect(decodeCleanRoomBrushQrPayload(encoded.replace("0.88", "0.12"))).toBeNull();
  });

  it("Photopea Mixer Brush, SAI Ver.2 저필압 블러/고필압 착색, Concepts Nudge/Slice, JS Paint/Pixilart 픽셀 브러시가 정확히 동작한다", () => {
    const mixer = stepPhotoshopMixerBrushReservoir(
      { wet01: 0.75, load01: 0.6, mix01: 0.8, flow01: 0.9 },
      [1, 0.9, 0.1],
      [0.1, 0.2, 0.95],
      [0.1, 0.2, 0.95],
    );
    expect(mixer.effectiveTransfer01).toBeGreaterThan(0.5);
    expect(mixer.canvasRgb01[2]).toBeGreaterThan(0.1);

    const saiLight = evaluateSaiVer2BrushStep({
      pressure01: 0.14,
      minDensity01: 0.25,
      waterBlending01: 0.8,
      blurPressureThreshold01: 0.28,
      edgeHardness01: 0.5,
    });
    expect(saiLight.mode).toBe("blur-blend-only");
    expect(saiLight.pigmentDepositAlpha01).toBe(0);

    const saiFirm = evaluateSaiVer2BrushStep({
      pressure01: 0.82,
      minDensity01: 0.25,
      waterBlending01: 0.8,
      blurPressureThreshold01: 0.28,
      edgeHardness01: 0.5,
    });
    expect(saiFirm.mode).toBe("pigment-deposit");
    expect(saiFirm.pigmentDepositAlpha01).toBeGreaterThan(0.7);

    const concepts = applyConceptsNudgeAndSlice({
      strokePoints: [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
        { x: 30, y: 40 },
      ],
      nudgeCenter: { x: 20, y: 20 },
      nudgeDeltaX: 5,
      nudgeDeltaY: -4,
      nudgeRadiusPx: 15,
      sliceY: 30,
    });
    expect(concepts.nudgedPoints[1].x).toBe(25);
    expect(concepts.slicedSegments).toHaveLength(1);

    expect(generateJsPaintBrushMask("diagonal", 5)).toHaveLength(5);
    expect(generateJsPaintBrushMask("square", 4)).toHaveLength(16);
    expect(evaluateBayerDitherBrushMask(1, 2, 0)).toBe(false);
    expect(evaluateBayerDitherBrushMask(1, 2, 1)).toBe(true);

    const clean = filterPixelPerfectStroke([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(clean).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);

    const bench = measureUniversalBrushTaxonomyEngineBenchmark();
    expect(bench.reaEvidenceTargetCount).toBe(52);
    expect(bench.wave22ReaEvidenceTargetCount).toBe(4);
    expect(bench.wave23ReaSemanticTargetCount).toBe(4);
    expect(bench.wave24ReaEvidenceCount).toBe(4);
    expect(bench.wave25ReaEvidenceCount).toBe(4);
    expect(bench.wave26ReaEvidenceCount).toBe(8);
    expect(bench.wave27ReaUiUxEvidenceCount).toBe(2);
    expect(bench.wave28HolisticReaEvidenceCount).toBe(6);
    expect(bench.unfragmentedEcosystemReaEvidenceCount).toBe(7);
    expect(bench.monolithicTotalReaEvidenceCount).toBe(7);
    expect(bench.completeEcosystemToolPresetCount).toBe(14);
    expect(bench.monolithicTotalToolPresetCount).toBe(16);
    expect(bench.competitorFilterPresetCount).toBe(12);
    expect(bench.klecksVanishPointRayCount).toBe(36);
    expect(bench.glfxHalftoneDotCmykCount).toBe(4);
    expect(bench.totalVisitedAstNodes).toBeGreaterThan(1000000);
    expect(bench.totalSemanticDataFlowRelations).toBeGreaterThan(75000);
    expect(bench.qrCodecRoundtripVerified).toBe(true);
  });

  it("Wave 22 벡터 골격(Non-Stretch Guide), 5-타일 코너 패턴, Inkscape 캘리그라피/Spiro/PowerStroke, Lazy-Brush, Fabric.js, Corel 입자, WeaveSilk, SculptGL Pixol, HeavyPaint, ArtRage/Fresco, Piskel/Milton 커널이 정확히 동작한다", () => {
    expect(SKELETAL_ART_BRUSH_PRESETS).toHaveLength(8);
    expect(FIVE_TILE_PATTERN_BRUSH_PRESETS).toHaveLength(8);
    expect(COREL_PARTICLE_BRUSH_PRESETS).toHaveLength(9);

    const spine = [
      { x: 0, y: 0, pressure01: 0.7 },
      { x: 120, y: 0, pressure01: 0.9 },
      { x: 120, y: 120, pressure01: 0.8 },
    ];
    const warped = warpSkeletalArtBrushAlongSpine("katana-blade", spine, 1);
    expect(warped.length).toBe(24);
    expect(warped[0].zone).toBe("head-non-stretch");
    expect(warped[warped.length - 1].zone).toBe("tail-non-stretch");
    expect(warped.some((s) => s.zone === "middle-stretch")).toBe(true);

    const patternTiles = layoutFiveTileVectorPatternBrush({
      presetId: "greek-meander-border",
      points: spine,
      nominalTileWidthPx: 24,
      cornerThresholdDeg: 45,
    });
    expect(patternTiles.some((t) => t.role === "start-tile")).toBe(true);
    expect(patternTiles.some((t) => t.role === "outer-corner-tile")).toBe(true);
    expect(patternTiles.some((t) => t.role === "end-tile")).toBe(true);

    const inkscape = evaluateInkscapeCalligraphicSpiroStroke(spine, {
      nibAngleDeg: 35,
      fixation01: 0.85,
      mass01: 0.3,
      tremor01: 0.1,
      wiggle01: 0.1,
      baseWidthPx: 18,
      powerStrokeNodes: [
        { t01: 0, widthScale: 0.4 },
        { t01: 0.5, widthScale: 1.6 },
        { t01: 1, widthScale: 0.3 },
      ],
    });
    expect(inkscape).toHaveLength(3);
    expect(inkscape[1].projectedWidthPx).toBeGreaterThan(inkscape[0].projectedWidthPx);

    const lazyStay = stepLazyBrushWithCircularFriction({
      prevBrushX: 10,
      prevBrushY: 10,
      targetPointerX: 22,
      targetPointerY: 10,
      radiusPx: 20,
      friction01: 0.4,
    });
    expect(lazyStay.hasMoved).toBe(false);

    const lazyMove = stepLazyBrushWithCircularFriction({
      prevBrushX: 10,
      prevBrushY: 10,
      targetPointerX: 50,
      targetPointerY: 10,
      radiusPx: 20,
      friction01: 0.4,
    });
    expect(lazyMove.hasMoved).toBe(true);
    expect(lazyMove.brushX).toBeGreaterThan(10);

    const fabricSpray = executeFabricBrushSuite({
      kind: "spray",
      points: [{ x: 40, y: 40 }],
      widthPx: 8,
      sprayDensity: 30,
      optimizeOverlapping: true,
    });
    expect(fabricSpray.length).toBeGreaterThan(0);
    expect(fabricSpray.length).toBeLessThanOrEqual(30);

    const corelSpring = stepCorelPainterParticleBrush({
      presetId: "silk-harmonic-spring",
      points: spine,
      radiusPx: 18,
    });
    expect(corelSpring.length).toBe(24);

    const silk = synthesizeWeaveSilkSymmetryRibbons({
      points: [{ x: 130, y: 100, pressure01: 0.8 }],
      centerX: 100,
      centerY: 100,
      symmetryFolds: 6,
      mirrorSector: true,
    });
    expect(silk).toHaveLength(12);

    expect(evaluateSculptGlQuarticFalloff01(0)).toBe(1);
    expect(evaluateSculptGlQuarticFalloff01(0.5)).toBeCloseTo(0.6875, 4);
    expect(evaluateSculptGlQuarticFalloff01(1)).toBe(0);

    const pixolCrease = applySculptGlPixol25DBrushDab({
      mode: "crease",
      centerX: 50,
      centerY: 50,
      radiusPx: 25,
      intensity01: 0.8,
      sampleX: 52,
      sampleY: 50,
      currentHeightZ: 10,
      negative: true,
    });
    expect(pixolCrease.heightZ).toBeLessThan(10);
    expect(pixolCrease.matCapU01).toBeGreaterThanOrEqual(0);
    expect(pixolCrease.matCapU01).toBeLessThanOrEqual(1);

    const heavySlabs = synthesizeHeavyPaintBlockInPolygons({
      kind: "rake",
      points: spine,
      baseSizePx: 24,
    });
    expect(heavySlabs).toHaveLength(3);

    const artrage = evaluateArtRageAndFrescoBrushStep({
      baseRadiusPx: 16,
      speedPxPerFrame: 1.5,
      pressure01: 0.85,
      existingWetness01: 0.6,
      swatchPaletteHex: ["#ff0055", "#00ffcc", "#ffee00"],
    });
    expect(artrage.gloopViscosityRadiusPx).toBeGreaterThan(16);
    expect(artrage.multicolorBandRgb).toHaveLength(3);

    const piskelDither = applyPixelArtAdvancedBrush({
      mode: "checker_dither",
      col: 2,
      row: 3,
      canvasWidthCols: 32,
      currentColorIndex: 4,
      paletteHexRamp: ["#111111", "#333333", "#777777", "#bbbbbb", "#ffffff"],
      secondaryColorHex: "#000000",
    });
    expect(piskelDither.outputHex).toBe("#ffffff");
    expect(piskelDither.mirroredCol).toBe(29);

    const miltonCenter = evaluateMiltonAnalyticalCapsuleSdfCoverage01({
      pixelCenterX: 30,
      pixelCenterY: 20,
      segAx: 10,
      segAy: 20,
      segBx: 50,
      segBy: 20,
      radiusA: 5,
      radiusB: 5,
    });
    expect(miltonCenter).toBe(1);
  });

  it("Wave 23 REA 심층 시맨틱 원장(4개 타깃, 8.2만+ AST 노드, 4.2만+ 데이터흐름), Schneider 3차 베지어 피팅, Pomax 평행 오프셋 첨점 감지, Klecks 6종 엔진(10종 프리셋), Wick Croquis/갭필, Konva 텐션 스플라인이 정확히 동작한다", () => {
    expect(WAVE23_REA_DEEP_SEMANTIC_LEDGER).toHaveLength(4);
    for (const entry of WAVE23_REA_DEEP_SEMANTIC_LEDGER) {
      expect(entry.parentAnalysisEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.summaryViewEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.modulesViewEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.jsFactsViewEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.visitedAstNodes).toBeGreaterThan(5000);
      expect(entry.dataFlowRelations).toBeGreaterThan(3000);
    }

    const sWavePoints = Array.from({ length: 18 }, (_, i) => ({
      x: i * 10,
      y: Math.sin(i * 0.45) * 32,
      pressure01: 0.75,
    }));
    const fitted = fitSchneiderCubicBezierSpline(sWavePoints, 2.5);
    expect(fitted.segments.length).toBeGreaterThanOrEqual(2);
    expect(fitted.svgPathData).toMatch(/^M 0\.00 0\.00 C /);

    const sharpBendSegment = {
      p0: { x: 0, y: 0 },
      ctrl1: { x: 18, y: 90 },
      ctrl2: { x: 20, y: -90 },
      p3: { x: 38, y: 0 },
    };
    const offsetEnv = computePomaxBezierParallelOffsetEnvelope({
      segment: sharpBendSegment,
      startRadiusPx: 30,
      endRadiusPx: 30,
      sampleSteps: 32,
    });
    expect(offsetEnv.samples).toHaveLength(33);
    expect(offsetEnv.cuspCount).toBeGreaterThan(0);
    expect(offsetEnv.maxAbsCurvature).toBeGreaterThan(0.03);

    expect(KLECKS_BRUSH_PRESETS).toHaveLength(10);
    for (const preset of KLECKS_BRUSH_PRESETS) {
      const res = executeKlecksBrushEngineSuite({
        presetId: preset.id,
        points: sWavePoints,
        seed: 20261026,
      });
      expect(res.presetId).toBe(preset.id);
      expect(res.dabCount).toBeGreaterThan(0);
    }

    const prngVal = evaluateKlecksTrigonometricPrng01(7);
    expect(prngVal).toBeGreaterThanOrEqual(0);
    expect(prngVal).toBeLessThanOrEqual(1);

    const wick = executeWickCroquisBlobAndGapFill({
      points: [
        { x: 0, y: 0, pressure01: 0 },
        { x: 40, y: 0, pressure01: 1 },
      ],
      baseRadiusPx: 12,
      stabilizerWeight0to100: 50,
      gapEndpoints: [
        { a: { x: 5, y: 5 }, b: { x: 11, y: 8 } },
        { a: { x: 0, y: 0 }, b: { x: 80, y: 80 } },
      ],
      gapFillAmountPx: 10,
    });
    expect(wick.croquisPressures01[0]).toBeCloseTo(0.14, 4);
    expect(wick.croquisPressures01[1]).toBeCloseTo(1.0, 4);
    expect(wick.effectiveStabilizerWeight).toBeCloseTo(0.8, 3);
    expect(wick.closedGapBridgeCount).toBe(1);

    const konvaControls = evaluateKonvaCardinalTensionSpline(
      [
        { x: 0, y: 0 },
        { x: 30, y: 40 },
        { x: 60, y: 0 },
      ],
      0.5,
    );
    expect(konvaControls).toHaveLength(1);
    expect(konvaControls[0].prevControlPoint.x).toBeLessThan(30);
    expect(konvaControls[0].nextControlPoint.x).toBeGreaterThan(30);
  });

  it("Wave 24 libmypaint 46종 설정·18종 입력 동역학, spectral.js 38밴드 KM + OKLCh 가멋 매핑, colormix.js CIE Lab 혼합, polygon-clipping 2D 불리언 폴리곤 연산이 정확히 동작한다", () => {
    expect(WAVE24_MYPAINT_SPECTRAL_BOOLEAN_REA_LEDGER).toHaveLength(4);
    for (const entry of WAVE24_MYPAINT_SPECTRAL_BOOLEAN_REA_LEDGER) {
      expect(entry.parentAnalysisEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.jsFactsEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.nodeId).toMatch(/^jag_node_[0-9a-f]{64}$/);
      expect(entry.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
    }

    expect(MYPAINT_CANONICAL_INPUT_CATALOG).toHaveLength(18);
    expect(MYPAINT_CANONICAL_SETTING_CATALOG).toHaveLength(64);
    expect(MYPAINT_BRUSH_PRESETS).toHaveLength(10);
    expect(SPECTRAL_38BAND_WAVELENGTHS_NM).toHaveLength(38);
    expect(SPECTRAL_38BAND_WAVELENGTHS_NM[0]).toBe(380);
    expect(SPECTRAL_38BAND_WAVELENGTHS_NM[37]).toBe(750);

    for (const preset of MYPAINT_BRUSH_PRESETS) {
      const step = evaluateMyPaintFullDynamicsStep({
        presetId: preset.id,
        x: 64,
        y: 128,
        pressure01: 0.78,
        directionAngleDeg: 45,
        tiltAscensionDeg: 10,
      });
      expect(step.presetId).toBe(preset.id);
      expect(step.radiusPx).toBeGreaterThan(0);
      expect(step.linearizedOpaque01).toBeGreaterThan(0);
      expect(step.linearizedOpaque01).toBeLessThanOrEqual(1);
      expect(step.gridmapX256).toBeGreaterThanOrEqual(0);
      expect(step.gridmapX256).toBeLessThan(256);
    }

    const spectralMix = mixSpectral38BandKubelkaMunkWithGamutMap([
      { rgb01: [0.02, 0.22, 0.94], factor: 0.5, tintingStrength: 1.1 },
      { rgb01: [0.98, 0.86, 0.08], factor: 0.5, tintingStrength: 1.0 },
    ]);
    expect(spectralMix.reflectance38).toHaveLength(38);
    expect(spectralMix.rgb01[1]).toBeGreaterThan(0.25);
    expect(spectralMix.oklab[0]).toBeGreaterThan(0.2);

    const labMix = mixCieLabColorSpace([
      { rgb01: [0.95, 0.1, 0.1], weight: 1 },
      { rgb01: [0.1, 0.1, 0.95], weight: 1 },
    ]);
    expect(labMix.lab[0]).toBeGreaterThan(20);
    expect(labMix.rgb01[0]).toBeGreaterThan(0.3);
    expect(labMix.rgb01[2]).toBeGreaterThan(0.3);

    const rectA = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ];
    const rectB = [
      { x: 10, y: 5 },
      { x: 30, y: 5 },
      { x: 30, y: 25 },
      { x: 10, y: 25 },
    ];
    for (const op of ["union", "difference", "intersection", "xor"] as const) {
      const clipRes = executeBooleanPolygonBrushClip({
        subject: rectA,
        clip: rectB,
        operation: op,
      });
      expect(clipRes.operation).toBe(op);
      expect(clipRes.vertices.length).toBeGreaterThanOrEqual(3);
      expect(clipRes.signedAreaPx2).toBeGreaterThan(0);
    }
  });

  it("Wave 25 perfect-freehand 가변 폭 윤곽, rough.js 7종 해칭·이중선 베지어, simplify-js 2단계 RDP 단순화, rbush OMT 2D 공간 인덱스 쿼리가 정확히 동작한다", () => {
    expect(WAVE25_FREEHAND_ROUGH_SPATIAL_REA_LEDGER).toHaveLength(4);
    for (const entry of WAVE25_FREEHAND_ROUGH_SPATIAL_REA_LEDGER) {
      expect(entry.parentAnalysisEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.summaryViewEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.factsViewEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.semanticTraceEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.semanticQueryId).toMatch(/^jsrq_[0-9a-f]{64}$/);
      expect(entry.assetNodeId).toMatch(/^jag_node_[0-9a-f]{64}$/);
      expect(entry.primarySymbolNodeId).toMatch(/^jag_node_[0-9a-f]{64}$/);
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
    }

    expect(FREEHAND_ROUGH_BRUSH_PRESETS).toHaveLength(10);
    const sampleStroke = [
      { x: 10, y: 10, pressure01: 0.7 },
      { x: 40, y: 12, pressure01: 0.85 },
      { x: 25, y: 28, pressure01: 0.6 },
      { x: 75, y: 32, pressure01: 0.9 },
      { x: 110, y: 18, pressure01: 0.75 },
    ];

    for (const preset of FREEHAND_ROUGH_BRUSH_PRESETS) {
      const pf = synthesizePerfectFreehandStrokeOutline({
        presetId: preset.id,
        points: sampleStroke,
      });
      expect(pf.presetId).toBe(preset.id);
      expect(pf.outlinePoints.length).toBeGreaterThan(10);
      expect(pf.svgPolygonPath).toMatch(/^M /);
      expect(pf.totalLengthPx).toBeGreaterThan(60);

      const rough = synthesizeRoughSketchyStrokeAndHachureFill({
        presetId: preset.id,
        strokePoints: sampleStroke,
        seed: 20261026,
      });
      expect(rough.presetId).toBe(preset.id);
      expect(rough.doubleLineBeziers.length).toBe((sampleStroke.length - 1) * 2);
      expect(rough.hachureSegments.length).toBeGreaterThan(0);
      expect(rough.svgStrokePath).toMatch(/^M /);
    }

    const denseLine = Array.from({ length: 30 }, (_, idx) => ({
      x: idx * 4,
      y: idx < 15 ? idx * 2 : 30 - (idx - 15) * 2,
      pressure01: 0.8,
    }));
    const rdp = simplifyStrokePolylineRdp(denseLine, 1.5, false);
    expect(rdp.length).toBeGreaterThanOrEqual(3);
    expect(rdp.length).toBeLessThan(denseLine.length);

    const spatial = queryStrokeSpatialRTreeBBox({
      items: [
        { id: "s1", minX: 0, minY: 0, maxX: 25, maxY: 25 },
        { id: "s2", minX: 20, minY: 15, maxX: 60, maxY: 50 },
        { id: "s3", minX: 90, minY: 90, maxX: 120, maxY: 120 },
      ],
      queryBox: { minX: 18, minY: 10, maxX: 40, maxY: 35 },
    });
    expect(spatial.collides).toBe(true);
    expect(spatial.matchedIds).toEqual(["s1", "s2"]);
  });

  it("Wave 26 경쟁사 드로잉·사진·이펙트 앱(PhotoCraft, EffectCraft, LightCraft, DesignCraft) 및 glfx.js / Klecks / miniPaint 필터·집중선·하프톤·유화·청사진 커널이 정확히 동작한다", () => {
    expect(WAVE26_COMPETITOR_FILTER_BRUSH_REA_LEDGER).toHaveLength(8);
    expect(COMPETITOR_FILTER_PRESETS).toHaveLength(12);
    for (const entry of WAVE26_COMPETITOR_FILTER_BRUSH_REA_LEDGER) {
      expect(entry.parentEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.summaryEvidenceId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.internalizedKernels.length).toBeGreaterThanOrEqual(2);
    }

    const glfx = applyGlfxFilterSuite({
      centerRgb01: [0.55, 0.42, 0.25],
      neighborSamplesRgb01: [
        [0.54, 0.43, 0.24],
        [0.57, 0.41, 0.26],
        [0.98, 0.98, 0.98],
      ],
      denoiseExponent: 24,
      lensBlurRadiusPx: 14,
      lensBlurBrightness: 0.5,
      lensBlurAngleRad: 0.4,
      sampleX: 48,
      sampleY: 32,
      centerX: 30,
      centerY: 20,
      halftoneAngleRad: 0.25,
      halftoneSizePx: 6,
      inkBigAverageRgb01: [0.75, 0.75, 0.75],
      inkSmallAverageRgb01: [0.35, 0.35, 0.35],
      inkStrength01: 0.4,
      hexScalePx: 12,
      warpRadiusPx: 60,
      swirlAngleRad: 1.5,
      bulgeStrength: 0.5,
    });
    expect(glfx.denoisedRgb01[0]).toBeLessThan(0.6);
    expect(glfx.lensBlurRhombusDirections).toHaveLength(3);
    expect(glfx.lensBlurGammaPower).toBeCloseTo(Math.pow(10, 0.5), 4);
    expect(glfx.halftoneCmyk01).toHaveLength(4);
    expect(glfx.inkDarkenedRgb01[0]).toBeLessThan(0.55);
    expect(glfx.swirlWarpedCoord.x).not.toBe(48);
    expect(glfx.bulgeWarpedCoord.x).not.toBe(48);

    const klecks = applyKlecksFilterAndVanishPointSuite({
      vanishCenterX: 100,
      vanishCenterY: 50,
      vanishLineCount: 24,
      distortX: 45,
      distortY: 25,
      distortStepSizePx: 4,
      distortType: 0,
      distortScaleX: 20,
      distortScaleY: 20,
      distortStrengthX: 10,
      distortStrengthY: 8,
      distortPhaseX: 0.2,
      distortPhaseY: 0.3,
      pixelRgba01: [0.1, 0.1, 0.1, 1],
      isInvertedToAlpha: true,
      replaceRgb01: [0.2, 0.4, 0.9],
      tiltStart: { x: 0, y: 50 },
      tiltEnd: { x: 200, y: 50 },
      tiltBlurRadiusPx: 18,
      tiltGradientRadiusPx: 50,
    });
    expect(klecks.vanishPointRays).toHaveLength(48);
    expect(klecks.toAlphaPixelRgba01[3]).toBeCloseTo(0.9, 4);
    expect(klecks.toAlphaPixelRgba01[2]).toBeCloseTo(0.9, 4);
    expect(klecks.tiltShiftBlurRadiusPx).toBeGreaterThan(0);

    const miniPaint = applyMiniPaintArtisticFilterSuite({
      neighborhoodRgb255: [
        [200, 100, 50],
        [204, 102, 48],
        [202, 99, 52],
        [20, 20, 20],
      ],
      oilLevels: 32,
      sampleRgb255: [220, 180, 40],
      sobelEdgeLuminance255: 190,
      coordX: 100,
      coordY: 40,
      blueprintGridStepPx: 20,
    });
    expect(miniPaint.oilModalRgb255[0]).toBeGreaterThan(195);
    expect(miniPaint.heatmapRgb255[0]).toBe(255);
    expect(miniPaint.blueprintCompositeRgb255[2]).toBeGreaterThan(163);
    expect(miniPaint.solarizedRgb255[0]).toBe(185);
  });

  it("Wave 27 Klecks·miniPaint REA UI/UX 비선형 정밀 슬라이더 매핑 및 수직 거리 감쇠(Falloff)를 검증한다", () => {
    const smallBrush = evaluateKlecksPrecisionSliderMapping({
      slider01: 0.15,
      min: 1,
      max: 120,
      exponent: 1.6,
      perpendicularDistancePx: 0,
      isFineMode: false,
      swatchRgb01: [0.1, 0.15, 0.2],
    });
    expect(smallBrush.falloffFactor).toBe(1);
    expect(smallBrush.mappedValue).toBeLessThan(10);
    expect(smallBrush.decimalPlaces).toBe(1);
    expect(smallBrush.roundtripSlider01).toBeCloseTo(0.15, 4);
    expect(smallBrush.isWhiteBestContrast).toBe(true);

    const fineFalloff = evaluateKlecksPrecisionSliderMapping({
      slider01: 0.75,
      min: 1,
      max: 120,
      exponent: 1.6,
      perpendicularDistancePx: 110,
      isFineMode: true,
      swatchRgb01: [0.92, 0.95, 0.88],
    });
    expect(fineFalloff.falloffFactor).toBeCloseTo(0.1, 4);
    expect(fineFalloff.decimalPlaces).toBe(0);
    expect(fineFalloff.isWhiteBestContrast).toBe(false);

    const bench = measureUniversalBrushTaxonomyEngineBenchmark();
    expect(bench.wave27ReaUiUxEvidenceCount).toBe(2);
    expect(bench.wave28HolisticReaEvidenceCount).toBe(6);
    expect(bench.unfragmentedEcosystemReaEvidenceCount).toBe(7);
    expect(bench.monolithicTotalReaEvidenceCount).toBe(7);
    expect(bench.holisticToolPresetCount).toBe(12);
    expect(bench.completeEcosystemToolPresetCount).toBe(14);
    expect(bench.monolithicTotalToolPresetCount).toBe(16);
    expect(bench.reaEvidenceTargetCount).toBe(52);
  });
});
