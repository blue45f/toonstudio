/**
 * Clip Studio Paint 5.1.5 실행 가능 서브툴 브러시 프리셋 24종 (전 브러시 카테고리 커버).
 */

import type { CspFullEngineVariantParameters } from "../../../../../../packages/studio-format-gateway/src/csp-sut-full-engine-schema";

export interface CspExecutableBrushPreset {
  readonly id: string;
  readonly pwId: number;
  readonly nameKo: string;
  readonly category:
    | "pen"
    | "pencil-pastel"
    | "watercolor"
    | "thick-paint"
    | "india-ink"
    | "airbrush"
    | "blend"
    | "decoration"
    | "eraser";
  readonly params: CspFullEngineVariantParameters;
}

function makeDefaultParams(
  overrides: {
    brushSizePx?: number;
    opacity01?: number;
    flow01?: number;
    hardness01?: number;
    intervalPercent?: number;
    ribbon?: Partial<CspFullEngineVariantParameters["ribbon"]>;
    spray?: Partial<CspFullEngineVariantParameters["spray"]>;
    tipShape?: Partial<CspFullEngineVariantParameters["tipShape"]>;
    texture?: Partial<CspFullEngineVariantParameters["texture"]>;
    colorJitter?: Partial<CspFullEngineVariantParameters["colorJitter"]>;
    waterColor?: Partial<CspFullEngineVariantParameters["waterColor"]>;
    correction?: Partial<CspFullEngineVariantParameters["correction"]>;
    dualBrush?: Partial<CspFullEngineVariantParameters["dualBrush"]>;
  } = {},
): CspFullEngineVariantParameters {
  return {
    brushSizePx: overrides.brushSizePx ?? 10,
    opacity01: overrides.opacity01 ?? 1,
    flow01: overrides.flow01 ?? 1,
    hardness01: overrides.hardness01 ?? 0.9,
    intervalPercent: overrides.intervalPercent ?? 10,
    ribbon: { enabled: false, dualEnabled: false, ...overrides.ribbon },
    spray: {
      enabled: false,
      particleSizePx: 4,
      syncWithBrushSize: true,
      densityPercent: 35,
      bias: 0,
      rotationDeg: 0,
      rotationRandomScale01: 0,
      ...overrides.spray,
    },
    tipShape: {
      thicknessPercent: 100,
      verticalThickness: false,
      rotationDeg: 0,
      rotationRandomScale01: 0,
      patternOrder: "repeat",
      reverseHorizontal: false,
      reverseVertical: false,
      blendPatternByDarken: false,
      adjustFlowByInterval: true,
      atLeastOnePixel: true,
      ...overrides.tipShape,
    },
    texture: {
      enabled: false,
      density01: 0,
      scalePercent: 100,
      rotationDeg: 0,
      compositeMode: "multiply",
      reverseDensity: false,
      applyByEachPlot: false,
      brightness: 0,
      contrast: 0,
      ...overrides.texture,
    },
    colorJitter: {
      enabledPerTip: false,
      enabledPerStroke: false,
      tipHueJitterDeg: 0,
      tipSaturationJitter: 0,
      tipLuminosityJitter: 0,
      strokeHueJitterDeg: 0,
      strokeSaturationJitter: 0,
      strokeLuminosityJitter: 0,
      subColorMixRate01: 0,
      strokeSubColorMixRate01: 0,
      changeColorTarget: "tip",
      ...overrides.colorJitter,
    },
    waterColor: {
      wetMixEnabled: false,
      colorMixingMode: "standard-rgb",
      lmsLinearity01: 0,
      mixColor01: 0,
      mixAlpha01: 0,
      colorExtension01: 0,
      blurAmount: 0,
      blurKind: 0,
      waterEdgeEnabled: false,
      waterEdgeStyle: 1,
      waterEdgeRadiusPx: 2,
      waterEdgeAlphaPower01: 0.4,
      waterEdgeValuePower01: 0.35,
      waterEdgeStrength01: 0.4,
      waterEdgeVividness01: 0.5,
      waterEdgeAfterDrag: false,
      ...overrides.waterColor,
    },
    correction: {
      antiAlias: 2,
      useStabilizer: true,
      stabilizerLevel: 15,
      stabilizerBySpeed: false,
      stabilizerByViewScale: false,
      postCorrection: 0,
      postCorrectionBySpeed: false,
      sharpenCorner: false,
      useInTaper: false,
      inLengthPx: 0,
      inRatio01: 0,
      useOutTaper: false,
      outLengthPx: 0,
      outRatio01: 0,
      inOutBySpeed: false,
      snapToRuler: true,
      vectorMagnetEnabled: false,
      vectorMagnetPower: 0,
      ...overrides.correction,
    },
    dualBrush: {
      enabled: false,
      compositeMode: "multiply",
      changeRgbByDual: false,
      syncSize: true,
      antiAlias: 2,
      sizePx: 8,
      flow01: 1,
      hardness01: 0.7,
      intervalPercent: 18,
      thicknessPercent: 100,
      rotationDeg: 0,
      ribbon: false,
      useSpray: false,
      spraySizePx: 3,
      sprayDensityPercent: 30,
      sprayBias: 0,
      textureDensity01: 0,
      ...overrides.dualBrush,
    },
    vectorCorrection: {
      pointOperation: 0,
      pinchOperation: 0,
      pinchLevel: 50,
      pinchAreaPx: 40,
      addVertexByPinch: true,
      connectByPinch: false,
      wholeStroke: false,
      useSmooth: false,
      smoothLevel: 3,
      smoothCorner: false,
      useConnect: false,
      connectLevel: 3,
      lineWidthOperation: "thicken",
      lineWidthAddPx: 1,
      lineWidthSubtractPx: 1,
      lineWidthMultiply: 1.25,
      lineWidthDivide: 1.25,
      lineWidthConstantPx: 4,
      lineWidthSmoothLengthPx: 12,
    },
  };
}

export const CSP_REA_EXECUTABLE_BRUSH_PRESETS: readonly CspExecutableBrushPreset[] = Object.freeze([
  { id: "g-pen", pwId: 24, nameKo: "G펜", category: "pen", params: makeDefaultParams({ brushSizePx: 6, hardness01: 0.98, correction: { antiAlias: 2, stabilizerLevel: 18, useInTaper: true, inLengthPx: 12, useOutTaper: true, outLengthPx: 16, sharpenCorner: true } }) },
  { id: "real-g-pen", pwId: 301, nameKo: "리얼 G 펜", category: "pen", params: makeDefaultParams({ brushSizePx: 8, hardness01: 0.9, texture: { enabled: true, density01: 0.25, compositeMode: "multiply" }, correction: { stabilizerLevel: 20, useOutTaper: true, outLengthPx: 14 } }) },
  { id: "mapping-pen", pwId: 25, nameKo: "둥근 펜", category: "pen", params: makeDefaultParams({ brushSizePx: 4, hardness01: 1, correction: { stabilizerLevel: 12, useInTaper: true, inLengthPx: 8, useOutTaper: true, outLengthPx: 12 } }) },
  { id: "calligraphy-pen", pwId: 27, nameKo: "캘리그라피 펜", category: "pen", params: makeDefaultParams({ brushSizePx: 12, tipShape: { thicknessPercent: 28, rotationDeg: 35 } }) },
  { id: "dot-pen", pwId: 254, nameKo: "도트 펜 (1px 무안티)", category: "pen", params: makeDefaultParams({ brushSizePx: 2, hardness01: 1, correction: { antiAlias: 0, useStabilizer: false, stabilizerLevel: 0 } }) },
  { id: "flat-marker", pwId: 400, nameKo: "평면 마커", category: "pen", params: makeDefaultParams({ brushSizePx: 16, opacity01: 0.76, hardness01: 0.88, tipShape: { thicknessPercent: 32, rotationDeg: 45 }, waterColor: { wetMixEnabled: true, colorMixingMode: "standard-rgb", mixColor01: 0.7, colorExtension01: 0.25 } }) },
  { id: "pencil", pwId: 378, nameKo: "연필", category: "pencil-pastel", params: makeDefaultParams({ brushSizePx: 8, flow01: 0.78, hardness01: 0.65, texture: { enabled: true, density01: 0.55, compositeMode: "multiply", scalePercent: 85 } }) },
  { id: "charcoal", pwId: 380, nameKo: "목탄", category: "pencil-pastel", params: makeDefaultParams({ brushSizePx: 18, flow01: 0.72, hardness01: 0.55, texture: { enabled: true, density01: 0.7, compositeMode: "subtract", scalePercent: 120 }, dualBrush: { enabled: true, compositeMode: "multiply", hardness01: 0.4 } }) },
  { id: "pastel", pwId: 382, nameKo: "파스텔", category: "pencil-pastel", params: makeDefaultParams({ brushSizePx: 22, flow01: 0.68, hardness01: 0.42, texture: { enabled: true, density01: 0.62, compositeMode: "compare-density" } }) },
  { id: "wet-watercolor", pwId: 402, nameKo: "습식 수채", category: "watercolor", params: makeDefaultParams({ brushSizePx: 20, flow01: 0.65, hardness01: 0.45, waterColor: { wetMixEnabled: true, colorMixingMode: "perceptual-lms", lmsLinearity01: 0.85, mixColor01: 0.45, colorExtension01: 0.55, waterEdgeEnabled: true, waterEdgeStyle: 2, waterEdgeStrength01: 0.65, waterEdgeVividness01: 0.6 } }) },
  { id: "flat-watercolor", pwId: 384, nameKo: "수채 평붓", category: "watercolor", params: makeDefaultParams({ brushSizePx: 24, flow01: 0.68, hardness01: 0.52, tipShape: { thicknessPercent: 45 }, waterColor: { wetMixEnabled: true, colorMixingMode: "perceptual-lms", lmsLinearity01: 0.75, mixColor01: 0.6, colorExtension01: 0.4, waterEdgeEnabled: true, waterEdgeStyle: 1, waterEdgeStrength01: 0.45 } }) },
  { id: "rough-watercolor", pwId: 308, nameKo: "거친 수채", category: "watercolor", params: makeDefaultParams({ brushSizePx: 22, flow01: 0.72, hardness01: 0.52, texture: { enabled: true, density01: 0.5, compositeMode: "multiply" }, dualBrush: { enabled: true, compositeMode: "darken" }, waterColor: { wetMixEnabled: true, colorMixingMode: "perceptual-lms", lmsLinearity01: 0.8, mixColor01: 0.5, colorExtension01: 0.45, waterEdgeEnabled: true, waterEdgeStyle: 2, waterEdgeStrength01: 0.55, waterEdgeVividness01: 0.55 } }) },
  { id: "gouache", pwId: 386, nameKo: "구아슈", category: "thick-paint", params: makeDefaultParams({ brushSizePx: 20, flow01: 0.92, hardness01: 0.78, texture: { enabled: true, density01: 0.32, compositeMode: "height", scalePercent: 95 }, waterColor: { wetMixEnabled: true, colorMixingMode: "perceptual-lms", lmsLinearity01: 0.7, mixColor01: 0.72, colorExtension01: 0.35 } }) },
  { id: "oil-impasto-dual", pwId: 403, nameKo: "두껍게 칠하기 (유채 · 듀얼)", category: "thick-paint", params: makeDefaultParams({ brushSizePx: 24, flow01: 0.95, waterColor: { wetMixEnabled: true, colorMixingMode: "perceptual-lms", lmsLinearity01: 0.9, mixColor01: 0.65, colorExtension01: 0.5 }, dualBrush: { enabled: true, compositeMode: "height", hardness01: 0.75 } }) },
  { id: "india-ink-dry", pwId: 391, nameKo: "먹 (마른 붓질)", category: "india-ink", params: makeDefaultParams({ brushSizePx: 18, texture: { enabled: true, density01: 0.68, compositeMode: "linear-burn" }, dualBrush: { enabled: true, compositeMode: "subtract" } }) },
  { id: "brush-pen", pwId: 404, nameKo: "붓펜", category: "india-ink", params: makeDefaultParams({ brushSizePx: 14, hardness01: 0.9, correction: { useInTaper: true, inLengthPx: 14, useOutTaper: true, outLengthPx: 22 } }) },
  { id: "soft-airbrush", pwId: 340, nameKo: "에어브러시 (부드러움)", category: "airbrush", params: makeDefaultParams({ brushSizePx: 32, flow01: 0.35, hardness01: 0.12, intervalPercent: 8 }) },
  { id: "spray-scatter", pwId: 83, nameKo: "스프레이 (입자 분산)", category: "airbrush", params: makeDefaultParams({ brushSizePx: 28, flow01: 0.72, hardness01: 0.22, spray: { enabled: true, particleSizePx: 3, densityPercent: 60, bias: -25 } }) },
  { id: "tone-scrape-sand", pwId: 84, nameKo: "모래 (톤 깎기용)", category: "airbrush", params: makeDefaultParams({ brushSizePx: 24, spray: { enabled: true, particleSizePx: 2, densityPercent: 75, bias: 20 } }) },
  { id: "color-mix-blend", pwId: 96, nameKo: "색 혼합 블렌더", category: "blend", params: makeDefaultParams({ brushSizePx: 20, flow01: 0.6, hardness01: 0.5, waterColor: { wetMixEnabled: true, colorMixingMode: "perceptual-lms", lmsLinearity01: 0.85, mixColor01: 0.08, colorExtension01: 0.85 } }) },
  { id: "ribbon-lace", pwId: 361, nameKo: "레이스 리본 (데코레이션)", category: "decoration", params: makeDefaultParams({ brushSizePx: 16, ribbon: { enabled: true }, colorJitter: { enabledPerTip: true, tipHueJitterDeg: 18, tipSaturationJitter: 12, subColorMixRate01: 0.25 } }) },
  { id: "sparkle-jitter", pwId: 342, nameKo: "반짝임 (색상 지터 · 스프레이)", category: "decoration", params: makeDefaultParams({ brushSizePx: 22, spray: { enabled: true, particleSizePx: 4, densityPercent: 45, bias: 10 }, colorJitter: { enabledPerTip: true, tipHueJitterDeg: 45, tipLuminosityJitter: 20, subColorMixRate01: 0.35 } }) },
  { id: "hard-eraser", pwId: 89, nameKo: "딱딱함 지우개", category: "eraser", params: makeDefaultParams({ brushSizePx: 16, hardness01: 0.98 }) },
  { id: "kneaded-eraser", pwId: 316, nameKo: "반죽 지우개", category: "eraser", params: makeDefaultParams({ brushSizePx: 22, flow01: 0.45, hardness01: 0.35, texture: { enabled: true, density01: 0.45, compositeMode: "multiply" } }) },
]);
