import { describe, expect, it } from "vitest";

import {
  applyCspBrushShapePreset,
  CSP_BRUSH_SHAPE_PRESETS,
  CSP_BUILT_IN_AUTO_ACTIONS,
  CSP_COLOR_TRANSFER_REFERENCE_PRESETS,
  CSP_DEFAULT_MODIFY_KEY_RULES,
  CSP_DIAL_MENU_MODES,
  CSP_LAUNCHER_ECOSYSTEM_SPEC,
  CSP_MIX_PALETTE_TOOLS,
  CSP_PUBLISHING_DEVICE_PROFILES,
  CSP_RULER_TYPES,
  CSP_SMART_SMOOTHING_SUPERRES_MODELS,
  CSP_TONE_DOT_SHAPES,
  cutCspVectorStrokeWithEraser,
  evaluateCspToneDotSdf,
  projectPointToCspRuler,
  resolveCspToolModifyKeyOverride,
  smoothCspVectorStroke,
  stepCspMixPaletteStroke,
} from "../studio-csp-comprehensive-suite";

describe("studio-csp-comprehensive-suite (Clip Studio & Clip Studio Paint 전 기능 심층 내재화)", () => {
  it("BrushPreset.bfps 14종 브러시 모양 프리셋을 정확히 제공하고 크기 오버라이드를 지원한다", () => {
    expect(CSP_BRUSH_SHAPE_PRESETS).toHaveLength(14);
    const gouache = applyCspBrushShapePreset("csp-bfps-gouache", 64);
    expect(gouache.nameKo).toBe("구아슈");
    expect(gouache.initVariantId).toBe(89);
    expect(gouache.activeVariantId).toBe(90);
    expect(gouache.useWaterColor).toBe(true);
    expect(gouache.brushSizePx).toBe(64);
  });

  it("MixPaletteTool.todb 3대 전용 도구(붓/색 혼합/스포이트)와 웨트 픽업·확장 스트로크를 시뮬레이션한다", () => {
    expect(CSP_MIX_PALETTE_TOOLS).toHaveLength(3);

    const brushStep = stepCspMixPaletteStroke({
      toolId: "mix-brush",
      activeDrawingColor: { r: 1, g: 0.2, b: 0.1, a: 1 },
      carriedBrushReservoirColor: { r: 0.8, g: 0.2, b: 0.1, a: 1 },
      canvasSampleColor: { r: 0.1, g: 0.4, b: 0.9, a: 1 },
      pressure01: 0.85,
    });
    expect(brushStep.nextCanvasColor.r).toBeGreaterThan(0.4);
    expect(brushStep.nextReservoirColor.b).toBeGreaterThan(0.15);

    const spuitStep = stepCspMixPaletteStroke({
      toolId: "mix-eyedropper",
      activeDrawingColor: { r: 0, g: 0, b: 0, a: 1 },
      carriedBrushReservoirColor: { r: 0, g: 0, b: 0, a: 1 },
      canvasSampleColor: { r: 0.25, g: 0.75, b: 0.5, a: 1 },
    });
    expect(spuitStep.pickedDrawingColor).toEqual({ r: 0.25, g: 0.75, b: 0.5, a: 1 });
  });

  it("DefaultToolModifyKey.tomd 수식키 조합에 따라 임시 도구 전환을 정확히 판별한다", () => {
    expect(CSP_DEFAULT_MODIFY_KEY_RULES.length).toBeGreaterThanOrEqual(9);
    expect(resolveCspToolModifyKeyOverride({ altKey: true })?.action).toBe("eyedropper-pick");
    expect(resolveCspToolModifyKeyOverride({ ctrlOrMetaKey: true, altKey: true })?.action).toBe(
      "brush-size-drag",
    );
    expect(resolveCspToolModifyKeyOverride({ spaceKey: true, shiftKey: true })?.action).toBe(
      "canvas-rotate",
    );
    expect(resolveCspToolModifyKeyOverride({ penTailEraser: true })?.action).toBe(
      "eraser-temporary",
    );
  });

  it("TGCxsPlugIn CSToneWorkData 22종 망점 SDF를 모두 평가한다", () => {
    expect(CSP_TONE_DOT_SHAPES).toHaveLength(22);
    for (const item of CSP_TONE_DOT_SHAPES) {
      const centerCov = evaluateCspToneDotSdf(item.id, 0, 0, 0.55);
      const cornerCov = evaluateCspToneDotSdf(item.id, 0.95, 0.95, 0.2);
      expect(centerCov).toBeGreaterThanOrEqual(0);
      expect(centerCov).toBeLessThanOrEqual(1);
      expect(cornerCov).toBeLessThanOrEqual(centerCov);
    }
  });

  it("TGCxsPlugIn CSRuler* 7종 특수·대칭·투시 자 투영 및 대칭 복제를 수행한다", () => {
    expect(CSP_RULER_TYPES).toHaveLength(7);

    const parallel = projectPointToCspRuler(
      { type: "parallel", origin: { x: 0, y: 0 }, angleRad: 0 },
      { x: 120, y: 45 },
      { x: 10, y: 20 },
    );
    expect(parallel.snappedPoint.y).toBeCloseTo(20, 5);
    expect(parallel.snappedPoint.x).toBeCloseTo(120, 5);

    const sym = projectPointToCspRuler(
      {
        type: "symmetry",
        origin: { x: 100, y: 100 },
        symmetryLineCount: 4,
        mirrorReflect: true,
      },
      { x: 130, y: 110 },
    );
    expect(sym.symmetryCopies).toHaveLength(8);
  });

  it("TGCxsPlugIn CSVec4Smooth 및 CSVec4Cut(교차점 벡터 지우개)을 수행한다", () => {
    const rawStroke = [
      { x: 0, y: 50, pressure: 0.4 },
      { x: 25, y: 52, pressure: 0.8 },
      { x: 50, y: 48, pressure: 0.5 },
      { x: 75, y: 51, pressure: 0.9 },
      { x: 100, y: 50, pressure: 0.6 },
    ];
    const smoothed = smoothCspVectorStroke(rawStroke, {
      smoothLineWeight: 0.5,
      smoothPressureWeight: 0.5,
    });
    expect(smoothed.length).toBeGreaterThanOrEqual(3);

    const crossVertical = [
      { x: 30, y: 0, pressure: 0.5 },
      { x: 30, y: 100, pressure: 0.5 },
    ];
    const cutResult = cutCspVectorStrokeWithEraser(
      rawStroke,
      [crossVertical],
      [
        { x: 60, y: 0 },
        { x: 60, y: 100 },
      ],
      "intersection",
    );
    expect(cutResult).toHaveLength(1);
    expect(cutResult[0]?.[cutResult[0].length - 1]?.x).toBeLessThanOrEqual(50);
  });

  it("오토 액션(default.laf), 색감 변환 8종, 초해상도 7모델, 출판/이북 프로파일, 퀵 다이얼, 런처 생태계를 포함한다", () => {
    expect(CSP_BUILT_IN_AUTO_ACTIONS).toHaveLength(10);
    expect(CSP_COLOR_TRANSFER_REFERENCE_PRESETS).toHaveLength(8);
    expect(CSP_SMART_SMOOTHING_SUPERRES_MODELS).toHaveLength(7);
    expect(CSP_PUBLISHING_DEVICE_PROFILES).toHaveLength(5);
    expect(CSP_DIAL_MENU_MODES).toHaveLength(6);
    expect(CSP_LAUNCHER_ECOSYSTEM_SPEC.placementRecordCount).toBe(93);
  });
});
