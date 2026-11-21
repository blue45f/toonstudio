import { describe, expect, it } from "vitest";

import {
  CSP_EDIT_IMAGE_TOOL_18_CATEGORIES,
  CSP_VARIANT_507_COLUMN_AUDIT_SUMMARY,
  extractCspFullEngineParameters,
} from "../csp-sut-full-engine-schema";
import { semanticField } from "../csp-sut-variant-schema";

describe("csp-sut-full-engine-schema (CSP 5.1.5 507컬럼 · 255서브툴 전수 스키마)", () => {
  it("EditImageTool.todb 507컬럼의 리본·스프레이·텍스처·색상지터·혼색·수채경계·4단계 AA·이중브러시·벡터보정 값을 정확히 추출한다", () => {
    const extracted = extractCspFullEngineParameters({
      BrushSize: 28,
      Opacity: 85,
      BrushFlow: 72,
      BrushHardness: 60,
      BrushInterval: 14,
      BrushRibbon: 1,
      DualRibbon: 1,
      BrushUseSpray: 1,
      BrushSpraySize: 6,
      BrushSpraySizeSyncBrushSize: 0,
      BrushSprayDensity: 65,
      BrushSprayBias: -40,
      BrushThickness: 45,
      BrushRotation: 30,
      BrushRotationRandomScale: 25,
      BrushPatternOrderType2: 2,
      BrushPatternReverseHorizontal: 1,
      BrushBlendPatternByDarken: 1,
      TextureDensity: 55,
      TextureScale: 120,
      TextureRotate: 15,
      TextureCompositeMode: 5,
      TextureReverseDensity: 1,
      TextureForPlot: 1,
      TextureBrightness: 12,
      TextureContrast: -10,
      BrushChangePatternColor: 1,
      BrushChangeStrokeColor: 1,
      BrushHueChange: 35,
      BrushSaturationChange: 20,
      BrushValueChange: 15,
      BrushStrokeHueChange: 10,
      BrushSubColor: 30,
      BrushUseWaterColor2: 1,
      BrushColorMixingMode: 1,
      BrushLMSLinearity: 90,
      BrushMixColor: 62,
      BrushMixAlpha: 48,
      BrushMixColorExtension: 44,
      BrushUseWaterEdge: 1,
      BrushWaterEdgeStyle: 2,
      BrushWaterEdgeRadius: 5,
      BrushWaterEdgeStrength: 70,
      BrushWaterEdgeVividness: 80,
      AntiAlias: 0,
      BrushUseRevision: 1,
      BrushRevision: 35,
      BrushSharpenCorner: 1,
      BrushUseIn: 1,
      BrushInLength: 18,
      BrushUseOut: 1,
      BrushOutLength: 24,
      UseDualBrush: 1,
      DualBrushCompositeMode: 3,
      ChangeRGBByDual: 1,
      SyncDualBrushSize: 0,
      DualSize: 16,
      DualFlow: 80,
      DualHardness: 50,
      DualInterval: 22,
      VectorPinchLevel: 75,
      VectorPinchArea: 60,
      LineWidthOperation: 2,
      LineWidthMultiplyValue: 1.5,
    });

    expect(extracted.brushSizePx).toBe(28);
    expect(extracted.opacity01).toBeCloseTo(0.85, 5);
    expect(extracted.ribbon).toEqual({ enabled: true, dualEnabled: true });
    expect(extracted.spray).toMatchObject({
      enabled: true,
      particleSizePx: 6,
      syncWithBrushSize: false,
      densityPercent: 65,
      bias: -40,
    });
    expect(extracted.tipShape).toMatchObject({
      thicknessPercent: 45,
      rotationDeg: 30,
      patternOrder: "random",
      reverseHorizontal: true,
      blendPatternByDarken: true,
    });
    expect(extracted.texture).toMatchObject({
      enabled: true,
      density01: 0.55,
      scalePercent: 120,
      compositeMode: "height",
      reverseDensity: true,
      applyByEachPlot: true,
      brightness: 12,
      contrast: -10,
    });
    expect(extracted.colorJitter).toMatchObject({
      enabledPerTip: true,
      enabledPerStroke: true,
      tipHueJitterDeg: 35,
      subColorMixRate01: 0.3,
    });
    expect(extracted.waterColor).toMatchObject({
      wetMixEnabled: true,
      colorMixingMode: "perceptual-lms",
      lmsLinearity01: 0.9,
      waterEdgeEnabled: true,
      waterEdgeStyle: 2,
      waterEdgeRadiusPx: 5,
    });
    expect(extracted.correction).toMatchObject({
      antiAlias: 0,
      stabilizerLevel: 35,
      sharpenCorner: true,
      useInTaper: true,
      inLengthPx: 18,
      useOutTaper: true,
      outLengthPx: 24,
    });
    expect(extracted.dualBrush).toMatchObject({
      enabled: true,
      compositeMode: "color-burn",
      changeRgbByDual: true,
      syncSize: false,
      sizePx: 16,
    });
    expect(extracted.vectorCorrection).toMatchObject({
      pinchLevel: 75,
      pinchAreaPx: 60,
      lineWidthOperation: "scale-up",
      lineWidthMultiply: 1.5,
    });
  });

  it("18개 전체 서브툴 카테고리 및 507컬럼 REA 감사 메타데이터와 semanticField 별칭을 제공한다", () => {
    expect(CSP_EDIT_IMAGE_TOOL_18_CATEGORIES).toHaveLength(18);
    expect(CSP_VARIANT_507_COLUMN_AUDIT_SUMMARY.totalVariantColumns).toBe(507);
    expect(CSP_VARIANT_507_COLUMN_AUDIT_SUMMARY.totalToolNodes).toBe(255);
    expect(semanticField("BrushRibbon")).toBe("ribbon");
    expect(semanticField("BrushUseSpray")).toBe("spray");
    expect(semanticField("BrushHueChange")).toBe("colorJitter");
    expect(semanticField("AntiAlias")).toBe("tipShape");
    expect(semanticField("DualBrushCompositeMode")).toBe("dualBrush");
    expect(semanticField("FutureCspField")).toBeNull();
  });
});
