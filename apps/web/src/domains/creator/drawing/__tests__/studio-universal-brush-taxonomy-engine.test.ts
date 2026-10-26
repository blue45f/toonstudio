import { describe, expect, it } from "vitest";

import {
  applyConceptsNudgeAndSlice,
  applyPixelArtAdvancedBrush,
  applySculptGlPixol25DBrushDab,
  COREL_PARTICLE_BRUSH_PRESETS,
  decodeCleanRoomBrushQrPayload,
  encodeCleanRoomBrushQrPayload,
  evaluateArtRageAndFrescoBrushStep,
  evaluateBayerDitherBrushMask,
  evaluateInkscapeCalligraphicSpiroStroke,
  evaluateMiltonAnalyticalCapsuleSdfCoverage01,
  evaluateP5BrushVectorFieldAngleDeg,
  evaluateSaiVer2BrushStep,
  evaluateSculptGlQuarticFalloff01,
  executeFabricBrushSuite,
  executeHarmonyProceduralBrush,
  filterPixelPerfectStroke,
  FIVE_TILE_PATTERN_BRUSH_PRESETS,
  generateJsPaintBrushMask,
  HARMONY_BRUSH_KINDS,
  IBIS_MEDIBANG_BRUSH_PRESETS,
  layoutFiveTileVectorPatternBrush,
  measureUniversalBrushTaxonomyEngineBenchmark,
  P5_BRUSH_PRESET_CATALOG,
  P5_BRUSH_VECTOR_FIELDS,
  SKELETAL_ART_BRUSH_PRESETS,
  SKETCHPAD_BRUSH_KINDS,
  stepCorelPainterParticleBrush,
  stepLazyBrushWithCircularFriction,
  stepPhotoshopMixerBrushReservoir,
  synthesizeComicRibbonStampChain,
  synthesizeHeavyPaintBlockInPolygons,
  synthesizeP5BrushWatercolorBleedPolygon,
  synthesizeSketchpadBrushDabs,
  synthesizeWeaveSilkSymmetryRibbons,
  traceP5BrushFlowLine,
  UNIVERSAL_BRUSH_REA_EVIDENCE_LEDGER,
  warpSkeletalArtBrushAlongSpine,
  WAVE22_VECTOR_PARTICLE_PIXOL_REA_EVIDENCE_LEDGER,
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
    expect(bench.reaEvidenceTargetCount).toBe(10);
    expect(bench.wave22ReaEvidenceTargetCount).toBe(4);
    expect(bench.totalVisitedAstNodes).toBeGreaterThan(300000);
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
});
