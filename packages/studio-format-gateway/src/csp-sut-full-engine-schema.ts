/**
 * Clip Studio Paint 5.1.5 `EditImageTool.todb` (507 `Variant` 컬럼 · 255 `Node` 서브툴)
 * 전체 브러시·벡터·채우기·선택·컷·말풍선·자·유동화 엔진 파라미터 스키마 및 추출기.
 *
 * REA `inspect_sqlite_database` 증거:
 * - `ev_f396cfb603d02902906ad872140302dd4ce4da78a87179a7fe3e3d902e00c68d` (SHA-256: `6ae39ec4f956ebfb2cfd0cd7794438918ca370f0424300609c2f95a6d405f1b1`)
 * - `ev_827c4cdbc223b01e71ce349043d34cac6c5dde0e7c14c19fa31f98a31734dbb0` (255 `Node` 행)
 */

import type { CspSqliteValue } from "./csp-sut-sqlite-inspect";

export type CspAntiAliasLevel = 0 | 1 | 2 | 3;

export type CspPatternOrderMode =
  | "repeat"
  | "reverse"
  | "random"
  | "once-per-stroke"
  | "no-repeat";

export type CspTextureCompositeMode =
  | "normal"
  | "multiply"
  | "subtract"
  | "compare-density"
  | "linear-burn"
  | "height"
  | "overlay"
  | "outline";

export type CspDualBrushBlendMode =
  | "normal"
  | "multiply"
  | "darken"
  | "color-burn"
  | "linear-burn"
  | "subtract"
  | "height"
  | "linear-height"
  | "lighten"
  | "screen";

export type CspVectorLineWidthOp =
  | "thicken"
  | "narrow"
  | "scale-up"
  | "scale-down"
  | "fix-width";

export interface CspFullRibbonParams {
  readonly enabled: boolean;
  readonly dualEnabled: boolean;
}

export interface CspFullSprayParams {
  readonly enabled: boolean;
  readonly particleSizePx: number;
  readonly syncWithBrushSize: boolean;
  readonly densityPercent: number;
  /** -100(중심 밀집) ~ +100(외곽 밀집) */
  readonly bias: number;
  readonly rotationDeg: number;
  readonly rotationRandomScale01: number;
}

export interface CspFullTipShapeParams {
  readonly thicknessPercent: number;
  readonly verticalThickness: boolean;
  readonly rotationDeg: number;
  readonly rotationRandomScale01: number;
  readonly patternOrder: CspPatternOrderMode;
  readonly reverseHorizontal: boolean;
  readonly reverseVertical: boolean;
  readonly blendPatternByDarken: boolean;
  readonly adjustFlowByInterval: boolean;
  readonly atLeastOnePixel: boolean;
}

export interface CspFullTextureParams {
  readonly enabled: boolean;
  readonly density01: number;
  readonly scalePercent: number;
  readonly rotationDeg: number;
  readonly compositeMode: CspTextureCompositeMode;
  readonly reverseDensity: boolean;
  readonly applyByEachPlot: boolean;
  readonly brightness: number;
  readonly contrast: number;
}

export interface CspFullColorJitterParams {
  readonly enabledPerTip: boolean;
  readonly enabledPerStroke: boolean;
  readonly tipHueJitterDeg: number;
  readonly tipSaturationJitter: number;
  readonly tipLuminosityJitter: number;
  readonly strokeHueJitterDeg: number;
  readonly strokeSaturationJitter: number;
  readonly strokeLuminosityJitter: number;
  readonly subColorMixRate01: number;
  readonly strokeSubColorMixRate01: number;
  readonly changeColorTarget: "tip" | "stroke";
}

export interface CspFullWaterColorAndEdgeParams {
  readonly wetMixEnabled: boolean;
  readonly colorMixingMode: "standard-rgb" | "perceptual-lms";
  readonly lmsLinearity01: number;
  readonly mixColor01: number;
  readonly mixAlpha01: number;
  readonly colorExtension01: number;
  readonly blurAmount: number;
  readonly blurKind: number;
  readonly waterEdgeEnabled: boolean;
  readonly waterEdgeStyle: 1 | 2;
  readonly waterEdgeRadiusPx: number;
  readonly waterEdgeAlphaPower01: number;
  readonly waterEdgeValuePower01: number;
  readonly waterEdgeStrength01: number;
  readonly waterEdgeVividness01: number;
  readonly waterEdgeAfterDrag: boolean;
}

export interface CspFullCorrectionParams {
  readonly antiAlias: CspAntiAliasLevel;
  readonly useStabilizer: boolean;
  readonly stabilizerLevel: number;
  readonly stabilizerBySpeed: boolean;
  readonly stabilizerByViewScale: boolean;
  readonly postCorrection: number;
  readonly postCorrectionBySpeed: boolean;
  readonly sharpenCorner: boolean;
  readonly useInTaper: boolean;
  readonly inLengthPx: number;
  readonly inRatio01: number;
  readonly useOutTaper: boolean;
  readonly outLengthPx: number;
  readonly outRatio01: number;
  readonly inOutBySpeed: boolean;
  readonly snapToRuler: boolean;
  readonly vectorMagnetEnabled: boolean;
  readonly vectorMagnetPower: number;
}

export interface CspFullDualBrushParams {
  readonly enabled: boolean;
  readonly compositeMode: CspDualBrushBlendMode;
  readonly changeRgbByDual: boolean;
  readonly syncSize: boolean;
  readonly antiAlias: CspAntiAliasLevel;
  readonly sizePx: number;
  readonly flow01: number;
  readonly hardness01: number;
  readonly intervalPercent: number;
  readonly thicknessPercent: number;
  readonly rotationDeg: number;
  readonly ribbon: boolean;
  readonly useSpray: boolean;
  readonly spraySizePx: number;
  readonly sprayDensityPercent: number;
  readonly sprayBias: number;
  readonly textureDensity01: number;
}

export interface CspFullVectorCorrectionParams {
  readonly pointOperation: number;
  readonly pinchOperation: number;
  readonly pinchLevel: number;
  readonly pinchAreaPx: number;
  readonly addVertexByPinch: boolean;
  readonly connectByPinch: boolean;
  readonly wholeStroke: boolean;
  readonly useSmooth: boolean;
  readonly smoothLevel: number;
  readonly smoothCorner: boolean;
  readonly useConnect: boolean;
  readonly connectLevel: number;
  readonly lineWidthOperation: CspVectorLineWidthOp;
  readonly lineWidthAddPx: number;
  readonly lineWidthSubtractPx: number;
  readonly lineWidthMultiply: number;
  readonly lineWidthDivide: number;
  readonly lineWidthConstantPx: number;
  readonly lineWidthSmoothLengthPx: number;
}

export interface CspFullEngineVariantParameters {
  readonly brushSizePx: number;
  readonly opacity01: number;
  readonly flow01: number;
  readonly hardness01: number;
  readonly intervalPercent: number;
  readonly ribbon: CspFullRibbonParams;
  readonly spray: CspFullSprayParams;
  readonly tipShape: CspFullTipShapeParams;
  readonly texture: CspFullTextureParams;
  readonly colorJitter: CspFullColorJitterParams;
  readonly waterColor: CspFullWaterColorAndEdgeParams;
  readonly correction: CspFullCorrectionParams;
  readonly dualBrush: CspFullDualBrushParams;
  readonly vectorCorrection: CspFullVectorCorrectionParams;
}

const PATTERN_ORDER_BY_CODE: readonly CspPatternOrderMode[] = [
  "repeat",
  "reverse",
  "random",
  "once-per-stroke",
  "no-repeat",
];

const TEXTURE_COMPOSITE_BY_CODE: readonly CspTextureCompositeMode[] = [
  "normal",
  "multiply",
  "subtract",
  "compare-density",
  "linear-burn",
  "height",
  "overlay",
  "outline",
];

const DUAL_BLEND_BY_CODE: readonly CspDualBrushBlendMode[] = [
  "normal",
  "multiply",
  "darken",
  "color-burn",
  "linear-burn",
  "subtract",
  "height",
  "linear-height",
  "lighten",
  "screen",
];

const LINE_WIDTH_OP_BY_CODE: readonly CspVectorLineWidthOp[] = [
  "thicken",
  "narrow",
  "scale-up",
  "scale-down",
  "fix-width",
];

function normalizeKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[_\s.-]+/gu, "");
}

function buildNormalizedRowMap(
  row: Readonly<Record<string, CspSqliteValue>>,
): ReadonlyMap<string, CspSqliteValue> {
  const map = new Map<string, CspSqliteValue>();
  for (const [key, value] of Object.entries(row)) {
    map.set(normalizeKey(key), value);
  }
  return map;
}

function readNum(
  map: ReadonlyMap<string, CspSqliteValue>,
  keys: readonly string[],
  fallback: number,
): number {
  for (const k of keys) {
    const val = map.get(k);
    if (typeof val === "number" && Number.isFinite(val)) return val;
    if (typeof val === "bigint") return Number(val);
  }
  return fallback;
}

function readBool(
  map: ReadonlyMap<string, CspSqliteValue>,
  keys: readonly string[],
  fallback = false,
): boolean {
  for (const k of keys) {
    const val = map.get(k);
    if (typeof val === "number" && Number.isFinite(val)) return val !== 0;
    if (typeof val === "bigint") return val !== BigInt(0);
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function toFraction01(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw <= 1) return raw;
  return clamp(raw / 100, 0, 1);
}

/**
 * CSP 5.1.5 `EditImageTool.todb` / `.sut` `Variant` 행에서 전체 브러시·벡터·혼색·이중브러시·리본·스프레이·색상지터·텍스처 파라미터를 추출한다.
 */
export function extractCspFullEngineParameters(
  row: Readonly<Record<string, CspSqliteValue>>,
): CspFullEngineVariantParameters {
  const map = buildNormalizedRowMap(row);

  const brushSizePx = clamp(readNum(map, ["brushsize", "brushdiameter", "diameter"], 12), 0.5, 2000);
  const opacity01 = toFraction01(readNum(map, ["opacity", "brushopacity"], 100));
  const flow01 = toFraction01(readNum(map, ["brushflow", "flow"], 100));
  const hardness01 = toFraction01(readNum(map, ["brushhardness", "hardness"], 85));
  const intervalPercent = clamp(readNum(map, ["brushinterval", "brushspacing", "spacing"], 10), 1, 500);

  const ribbon: CspFullRibbonParams = {
    enabled: readBool(map, ["brushribbon"], false),
    dualEnabled: readBool(map, ["dualribbon"], false),
  };

  const spray: CspFullSprayParams = {
    enabled: readBool(map, ["brushusespray"], false),
    particleSizePx: clamp(readNum(map, ["brushspraysize"], brushSizePx * 0.35), 0.5, 500),
    syncWithBrushSize: readBool(map, ["brushspraysizesyncbrushsize"], true),
    densityPercent: clamp(readNum(map, ["brushspraydensity"], 35), 1, 100),
    bias: clamp(readNum(map, ["brushspraybias"], 0), -100, 100),
    rotationDeg: readNum(map, ["brushrotationinspray"], 0),
    rotationRandomScale01: toFraction01(readNum(map, ["brushrotationrandominspray"], 0)),
  };

  const patternOrderCode = Math.trunc(
    readNum(map, ["brushpatternordertype2", "brushpatternordertype"], 0),
  );
  const tipShape: CspFullTipShapeParams = {
    thicknessPercent: clamp(readNum(map, ["brushthickness"], 100), 1, 200),
    verticalThickness: readBool(map, ["brushverticalthicknes", "brushverticalthickness"], false),
    rotationDeg: readNum(map, ["brushrotation", "brushangle"], 0),
    rotationRandomScale01: toFraction01(readNum(map, ["brushrotationrandomscale"], 0)),
    patternOrder: PATTERN_ORDER_BY_CODE[patternOrderCode] ?? "repeat",
    reverseHorizontal: readBool(map, ["brushpatternreversehorizontal"], false),
    reverseVertical: readBool(map, ["brushpatternreversevertical"], false),
    blendPatternByDarken: readBool(map, ["brushblendpatternbydarken"], false),
    adjustFlowByInterval: readBool(map, ["brushadjustflowbyinterval"], true),
    atLeastOnePixel: readBool(map, ["brushatleast1pixel"], true),
  };

  const texDensityRaw = readNum(map, ["texturedensity"], 0);
  const texModeCode = Math.trunc(readNum(map, ["texturecompositemode"], 1));
  const texture: CspFullTextureParams = {
    enabled: readBool(map, ["brushusepatternimage"], false) || texDensityRaw > 0,
    density01: toFraction01(texDensityRaw),
    scalePercent: clamp(readNum(map, ["texturescale2", "texturescale"], 100), 5, 500),
    rotationDeg: readNum(map, ["texturerotation", "texturerotate"], 0),
    compositeMode: TEXTURE_COMPOSITE_BY_CODE[texModeCode] ?? "multiply",
    reverseDensity: readBool(map, ["texturereversedensity"], false),
    applyByEachPlot: readBool(map, ["textureforplot"], false),
    brightness: clamp(readNum(map, ["texturebrightness"], 0), -100, 100),
    contrast: clamp(readNum(map, ["texturecontrast"], 0), -100, 100),
  };

  const colorJitter: CspFullColorJitterParams = {
    enabledPerTip: readBool(map, ["brushchangepatterncolor"], false),
    enabledPerStroke: readBool(map, ["brushchangestrokecolor"], false),
    tipHueJitterDeg: clamp(readNum(map, ["brushhuechange"], 0), 0, 180),
    tipSaturationJitter: clamp(readNum(map, ["brushsaturationchange"], 0), 0, 100),
    tipLuminosityJitter: clamp(readNum(map, ["brushvaluechange"], 0), 0, 100),
    strokeHueJitterDeg: clamp(readNum(map, ["brushstrokehuechange"], 0), 0, 180),
    strokeSaturationJitter: clamp(readNum(map, ["brushstrokesaturationchange"], 0), 0, 100),
    strokeLuminosityJitter: clamp(readNum(map, ["brushstrokevaluechange"], 0), 0, 100),
    subColorMixRate01: toFraction01(readNum(map, ["brushsubcolor"], 0)),
    strokeSubColorMixRate01: toFraction01(readNum(map, ["brushstrokesubcolor"], 0)),
    changeColorTarget: Math.trunc(readNum(map, ["brushchangecolortarget"], 0)) === 1 ? "stroke" : "tip",
  };

  const useWater = readBool(map, ["brushusewatercolor", "brushusewatercolor2"], false);
  const mixingCode = Math.trunc(readNum(map, ["brushcolormixingmode"], 0));
  const waterEdgeStyleCode = Math.trunc(readNum(map, ["brushwateredgestyle"], 1));
  const waterColor: CspFullWaterColorAndEdgeParams = {
    wetMixEnabled: useWater,
    colorMixingMode: mixingCode === 1 ? "perceptual-lms" : "standard-rgb",
    lmsLinearity01: toFraction01(readNum(map, ["brushlmslinearity"], mixingCode === 1 ? 80 : 0)),
    mixColor01: toFraction01(readNum(map, ["brushmixcolor"], useWater ? 60 : 0)),
    mixAlpha01: toFraction01(readNum(map, ["brushmixalpha"], useWater ? 50 : 0)),
    colorExtension01: toFraction01(readNum(map, ["brushmixcolorextension"], useWater ? 35 : 0)),
    blurAmount: clamp(readNum(map, ["brushblur"], 0), 0, 100),
    blurKind: Math.trunc(readNum(map, ["brushblurkind"], 0)),
    waterEdgeEnabled: readBool(map, ["brushusewateredge"], false),
    waterEdgeStyle: waterEdgeStyleCode === 2 ? 2 : 1,
    waterEdgeRadiusPx: clamp(readNum(map, ["brushwateredgeradius"], 2), 1, 24),
    waterEdgeAlphaPower01: toFraction01(readNum(map, ["brushwateredgealphapower"], 40)),
    waterEdgeValuePower01: toFraction01(readNum(map, ["brushwateredgevaluepower"], 35)),
    waterEdgeStrength01: toFraction01(readNum(map, ["brushwateredgestrength"], 40)),
    waterEdgeVividness01: toFraction01(readNum(map, ["brushwateredgevividness"], 50)),
    waterEdgeAfterDrag: readBool(map, ["brushwateredgeafterdrag"], false),
  };

  const aaRaw = clamp(Math.trunc(readNum(map, ["antialias"], 2)), 0, 3) as CspAntiAliasLevel;
  const correction: CspFullCorrectionParams = {
    antiAlias: aaRaw,
    useStabilizer: readBool(map, ["brushuserevision"], true),
    stabilizerLevel: clamp(readNum(map, ["brushrevision", "stabilization"], 15), 0, 100),
    stabilizerBySpeed: readBool(map, ["brushrevisionbyspeed"], false),
    stabilizerByViewScale: readBool(map, ["brushrevisionbyviewscale"], false),
    postCorrection: clamp(readNum(map, ["flickerreduction"], 0), 0, 100),
    postCorrectionBySpeed: readBool(map, ["flickerreductionbyspeed"], false),
    sharpenCorner: readBool(map, ["brushsharpencorner"], false),
    useInTaper: readBool(map, ["brushusein"], false),
    inLengthPx: clamp(readNum(map, ["brushinlength"], 0), 0, 400),
    inRatio01: toFraction01(readNum(map, ["brushinratio"], 0)),
    useOutTaper: readBool(map, ["brushuseout"], false),
    outLengthPx: clamp(readNum(map, ["brushoutlength"], 0), 0, 400),
    outRatio01: toFraction01(readNum(map, ["brushoutratio"], 0)),
    inOutBySpeed: readBool(map, ["brushinoutbyspeed"], false),
    snapToRuler: readBool(map, ["brushenablesnap"], true),
    vectorMagnetEnabled: readBool(map, ["brushusevectormagnet"], false),
    vectorMagnetPower: clamp(readNum(map, ["brushvectormagnetpower"], 0), 0, 100),
  };

  const dualBlendCode = Math.trunc(readNum(map, ["dualbrushcompositemode", "dual2compositemode"], 1));
  const dualAa = clamp(Math.trunc(readNum(map, ["dualantialias"], aaRaw)), 0, 3) as CspAntiAliasLevel;
  const dualBrush: CspFullDualBrushParams = {
    enabled: readBool(map, ["usedualbrush"], false),
    compositeMode: DUAL_BLEND_BY_CODE[dualBlendCode] ?? "multiply",
    changeRgbByDual: readBool(map, ["changergbbydual"], false),
    syncSize: readBool(map, ["syncdualbrushsize"], true),
    antiAlias: dualAa,
    sizePx: clamp(readNum(map, ["dualsize", "dual2brushsize"], brushSizePx * 0.7), 0.5, 2000),
    flow01: toFraction01(readNum(map, ["dualflow"], 100)),
    hardness01: toFraction01(readNum(map, ["dualhardness", "dual2brushhardness"], 70)),
    intervalPercent: clamp(readNum(map, ["dualinterval", "dual2brushinterval"], 18), 1, 500),
    thicknessPercent: clamp(readNum(map, ["dualthickness"], 100), 1, 200),
    rotationDeg: readNum(map, ["dualrotation"], 0),
    ribbon: readBool(map, ["dualribbon"], false),
    useSpray: readBool(map, ["dualusespray"], false),
    spraySizePx: clamp(readNum(map, ["dualspraysize"], brushSizePx * 0.3), 0.5, 500),
    sprayDensityPercent: clamp(readNum(map, ["dualspraydensity"], 30), 1, 100),
    sprayBias: clamp(readNum(map, ["dualspraybias"], 0), -100, 100),
    textureDensity01: toFraction01(readNum(map, ["dualtexturedensity"], 0)),
  };

  const lwOpCode = Math.trunc(readNum(map, ["linewidthoperation"], 0));
  const vectorCorrection: CspFullVectorCorrectionParams = {
    pointOperation: Math.trunc(readNum(map, ["vectorpointoperation"], 0)),
    pinchOperation: Math.trunc(readNum(map, ["vectorpinchoperation"], 0)),
    pinchLevel: clamp(readNum(map, ["vectorpinchlevel"], 50), 0, 100),
    pinchAreaPx: clamp(readNum(map, ["vectorpincharea"], 40), 2, 500),
    addVertexByPinch: readBool(map, ["vectoraddveretexbypinch", "vectoraddvertexbypinch"], true),
    connectByPinch: readBool(map, ["vectorconnectbypinch"], false),
    wholeStroke: readBool(map, ["vectorwhole"], false),
    useSmooth: readBool(map, ["vectorusesmooth"], false),
    smoothLevel: clamp(readNum(map, ["vectorsmoothlevel"], 3), 0, 20),
    smoothCorner: readBool(map, ["vectorsmoothcorner"], false),
    useConnect: readBool(map, ["vectoruseconnect"], false),
    connectLevel: clamp(readNum(map, ["vectorconnectlevel"], 3), 0, 20),
    lineWidthOperation: LINE_WIDTH_OP_BY_CODE[lwOpCode] ?? "thicken",
    lineWidthAddPx: clamp(readNum(map, ["linewidthaddvalue"], 1), 0, 200),
    lineWidthSubtractPx: clamp(readNum(map, ["linewidthsubtractvalue"], 1), 0, 200),
    lineWidthMultiply: clamp(readNum(map, ["linewidthmultiplyvalue"], 1.25), 0.1, 10),
    lineWidthDivide: clamp(readNum(map, ["linewidthdividevalue"], 1.25), 0.1, 10),
    lineWidthConstantPx: clamp(readNum(map, ["linewidthconstantvalue"], 4), 0.25, 200),
    lineWidthSmoothLengthPx: clamp(readNum(map, ["linewidthsmoothlengthvalue"], 12), 0, 200),
  };

  return {
    brushSizePx,
    opacity01,
    flow01,
    hardness01,
    intervalPercent,
    ribbon,
    spray,
    tipShape,
    texture,
    colorJitter,
    waterColor,
    correction,
    dualBrush,
    vectorCorrection,
  };
}

/**
 * REA `ev_827c4cdbc223b01e71ce349043d34cac6c5dde0e7c14c19fa31f98a31734dbb0`로 추출한
 * CSP 5.1.5 `EditImageTool.todb` 전체 18개 서브툴 카테고리 분류표(총 255개 `Node` 행).
 */
export interface CspSubToolCategorySpec {
  readonly categoryId: string;
  readonly labelKo: string;
  readonly representativePwIds: readonly number[];
  readonly subToolNamesKo: readonly string[];
  readonly variantColumnGroups: readonly string[];
}

export const CSP_EDIT_IMAGE_TOOL_18_CATEGORIES: readonly CspSubToolCategorySpec[] = [
  {
    categoryId: "pen",
    labelKo: "펜 · 마커 (Pen & Marker)",
    representativePwIds: [24, 25, 26, 27, 31, 254, 301, 322, 323, 400, 411],
    subToolNamesKo: ["G펜", "둥근 펜", "스푼펜", "캘리그라피", "밀리펜", "도트 펜", "리얼 G 펜", "거친 펜", "사인펜", "평면 마커", "거칠고 딱딱한 펜"],
    variantColumnGroups: ["BrushSize*", "BrushInOut*", "AntiAlias", "BrushRevision*", "BrushSharpenCorner"],
  },
  {
    categoryId: "pencil-pastel",
    labelKo: "연필 · 파스텔 (Pencil & Pastel)",
    representativePwIds: [378, 379, 380, 381, 382, 383],
    subToolNamesKo: ["연필", "샤프펜슬", "목탄", "크레용", "파스텔", "초크"],
    variantColumnGroups: ["TextureDensity*", "TextureCompositeMode", "TextureScale", "BrushThickness*", "BrushRotation*"],
  },
  {
    categoryId: "watercolor-paint",
    labelKo: "붓 · 수채 · 유화 · 먹 (Brush & Ink)",
    representativePwIds: [62, 307, 308, 310, 312, 313, 315, 331, 332, 339, 384, 386, 387, 391, 401, 402, 403, 404],
    subToolNamesKo: ["채색&융합", "수채 번짐", "거친 수채", "물붓", "드라이 구아슈", "구아슈 가는 붓", "구아슈 섞기", "스플래시 수채", "혼색 원 브러시", "먹(번짐)", "수채 평붓", "구아슈", "유채", "먹(마른붓질)", "수채 둥근 붓", "습식 수채", "두껍게 칠하기(유채)", "붓펜"],
    variantColumnGroups: ["BrushUseWaterColor*", "BrushColorMixingMode", "BrushLMSLinearity", "BrushWaterEdge*", "UseDualBrush", "Dual*"],
  },
  {
    categoryId: "airbrush",
    labelKo: "에어브러시 · 스프레이 (Airbrush)",
    representativePwIds: [83, 84, 85, 86, 340],
    subToolNamesKo: ["부드러움", "스프레이", "모래(톤 깎기용)", "번짐 스프레이", "물보라"],
    variantColumnGroups: ["BrushUseSpray", "BrushSpraySize*", "BrushSprayDensity*", "BrushSprayBias", "BrushHardness"],
  },
  {
    categoryId: "decoration",
    labelKo: "데코레이션 · 패턴 · 괘선 (Decoration)",
    representativePwIds: [160, 168, 169, 173, 174, 175, 187, 191, 217, 221, 235, 236, 237, 238, 239, 342, 343, 346, 349, 361, 364, 377],
    subToolNamesKo: ["뭉실 원", "거즈", "구름 거즈", "그물망(톤 깎기용)", "별", "멜로디", "초원", "균열", "물결선", "들쭉날쭉", "요철", "파선", "점선", "반짝임", "핏자국", "깃털", "벚꽃", "레이스", "체인", "지퍼"],
    variantColumnGroups: ["BrushRibbon", "BrushPatternImageArray", "BrushPatternOrderType*", "BrushChangePatternColor", "BrushHueChange*", "BrushSubColor*"],
  },
  {
    categoryId: "eraser",
    labelKo: "지우개 (Eraser)",
    representativePwIds: [89, 90, 91, 92, 93, 289, 316, 416],
    subToolNamesKo: ["딱딱함", "부드러움", "러프", "벡터용", "레이어 관통", "스냅 지우개", "반죽 지우개", "속도 조절 지우개"],
    variantColumnGroups: ["BrushUseVectorEraser", "BrushVectorEraserType", "BrushEraseAllLayer", "BrushAdjustVelocity"],
  },
  {
    categoryId: "blend-liquify",
    labelKo: "색 혼합 · 픽셀 유동화 (Blend & Liquify)",
    representativePwIds: [96, 97, 98, 99, 252, 309, 341, 406],
    subToolNamesKo: ["색 혼합", "흐리기", "손끝", "부드러운 수채 번짐", "복제 도장", "질감이 남게 섞기", "붓(섞기)", "픽셀 유동화"],
    variantColumnGroups: ["BrushMixColor*", "BrushMixAlpha*", "BrushBlur*", "LiquifyOperation", "LiquifyStrength*", "LiquifyDensity"],
  },
  {
    categoryId: "vector-correct",
    labelKo: "선 수정 · 벡터 보정 (Correct Line)",
    representativePwIds: [37, 38, 39, 40, 41, 255, 256],
    subToolNamesKo: ["제어점", "벡터선 잡기", "벡터선 단순화", "벡터선 연결", "선폭 수정", "벡터선 다시 그리기", "벡터선폭 다시 그리기"],
    variantColumnGroups: ["VectorPointOperation", "VectorPinch*", "VectorSmooth*", "VectorConnect*", "LineWidth*"],
  },
  {
    categoryId: "fill",
    labelKo: "채우기 · 틈새 메우기 (Fill)",
    representativePwIds: [103, 104, 105, 106, 250, 282],
    subToolNamesKo: ["편집 레이어만 참조", "다른 레이어 참조", "에워싸고 칠하기", "틈 채색펜", "덜 칠한 부분 메우기", "등고선 채색"],
    variantColumnGroups: ["FillReferMultiLayer", "FillUseCloseGap", "FillCloseGap", "FillUseExpand", "FillExpandLength", "FillColorMargin", "ContourFill*"],
  },
  {
    categoryId: "gradient",
    labelKo: "그라데이션 (Gradient)",
    representativePwIds: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 261, 287],
    subToolNamesKo: ["그리기색에서 투명색", "그리기색에서 배경색", "스트라이프", "광구", "푸른 하늘", "낮 하늘", "저녁 노을", "밤 하늘", "무지개", "지우기 그라데이션", "만화용 그라데이션"],
    variantColumnGroups: ["GradationData", "GradationShapeKind", "GradationRepeatType", "GradationDither"],
  },
  {
    categoryId: "selection",
    labelKo: "선택 범위 · 자동 선택 (Selection)",
    representativePwIds: [109, 110, 111, 114, 115, 116, 117, 118, 119, 120, 251, 414],
    subToolNamesKo: ["편집 레이어만 참조 선택", "다른 레이어 참조 선택", "참조 레이어용 선택", "직사각형 선택", "타원 선택", "올가미 선택", "꺾은선 선택", "선택 펜", "선택 지우기", "슈링크 선택", "잡티 선택", "선화를 따라 선택"],
    variantColumnGroups: ["SelectCreateType", "SelectUseSnap", "SelectOperationMethod", "FillColorMargin"],
  },
  {
    categoryId: "figure-effect-line",
    labelKo: "도형 · 유선 · 집중선 · 플래시 (Figure & Effect Lines)",
    representativePwIds: [123, 124, 125, 126, 127, 128, 129, 257, 264, 265, 267, 269, 270, 271, 273, 276, 278, 321],
    subToolNamesKo: ["직선", "곡선", "꺾은선", "연속 곡선", "올가미 채색", "직사각형", "타원", "다각형", "성긴 유선", "진한 유선", "비", "성긴 집중선", "진한 집중선", "빽빽한 집중선", "파열", "플래시", "성게 플래시", "베지에 곡선"],
    variantColumnGroups: ["FixedShape*", "Polyline*", "ConcentrateStream*", "StreamUseJag*"],
  },
  {
    categoryId: "comic-frame",
    labelKo: "컷 테두리 · 분할 (Frame Border)",
    representativePwIds: [131, 132, 258, 259, 260, 413],
    subToolNamesKo: ["직사각형 컷", "꺾은선 컷", "컷 테두리 펜", "컷 폴더 분할", "컷선 분할", "직사각형 컷(거친 테두리)"],
    variantColumnGroups: ["CutFrameCurveKind", "CutFrameCutFolderType", "CutFrameHorizontalGap", "CutFrameVerticalGap", "ComicFrame*"],
  },
  {
    categoryId: "balloon",
    labelKo: "말풍선 · 꼬리 (Speech Balloon)",
    representativePwIds: [243, 244, 245, 246, 247, 317, 409, 412],
    subToolNamesKo: ["타원 말풍선", "곡선 말풍선", "말풍선 펜", "말풍선 꼬리", "말풍선 둥근 꼬리", "모서리가 둥근 말풍선", "직사각형 말풍선", "거친 테두리 말풍선"],
    variantColumnGroups: ["BalloonInsertType", "BalloonTailType", "BalloonTailWidth", "BalloonUniteText"],
  },
  {
    categoryId: "ruler",
    labelKo: "자 · 퍼스자 · 대칭자 (Rulers)",
    representativePwIds: [134, 135, 136, 137, 138, 139, 253, 262],
    subToolNamesKo: ["직선자", "곡선자", "도형자", "자 펜", "특수 자", "가이드", "퍼스자", "대칭자"],
    variantColumnGroups: ["SpecialRuler*", "RulerUseGraduation", "RulerGraduationType", "RulerGraduationNumber"],
  },
  {
    categoryId: "text",
    labelKo: "텍스트 · 원형 텍스트 (Text)",
    representativePwIds: [242, 410],
    subToolNamesKo: ["텍스트", "원형 텍스트"],
    variantColumnGroups: ["TextFont*", "TextVertical", "TextTateChuYoko", "TextRubySize", "TextEdge*", "TextLayoutCircular*"],
  },
  {
    categoryId: "animation-timeline",
    labelKo: "애니메이션 · 라이트 테이블 (Animation)",
    representativePwIds: [285, 286],
    subToolNamesKo: ["라이트 테이블", "타임라인 편집"],
    variantColumnGroups: ["LightTableTouchOperation", "LightTableDragOperation", "TimeLineNext", "TimeLineDragType"],
  },
  {
    categoryId: "operation-nav-eyedropper",
    labelKo: "조작 · 이동 · 스포이트 · 잡티 (Operation & Utility)",
    representativePwIds: [4, 5, 20, 21, 142, 143, 146, 149, 150, 249, 290, 291],
    subToolNamesKo: ["줌 인", "줌 아웃", "손바닥", "회전", "오브젝트", "레이어 선택", "레이어 이동", "표시색 추출", "레이어에서 색 추출", "잡티 지우기", "톤 무늬 이동", "그리드 이동"],
    variantColumnGroups: ["Zoom*", "Rotate*", "Object*", "LayerMove*", "Spuit*"],
  },
] as const;

export const CSP_VARIANT_507_COLUMN_AUDIT_SUMMARY = {
  evidenceId: "ev_f396cfb603d02902906ad872140302dd4ce4da78a87179a7fe3e3d902e00c68d",
  nodesEvidenceId: "ev_827c4cdbc223b01e71ce349043d34cac6c5dde0e7c14c19fa31f98a31734dbb0",
  totalVariantColumns: 507,
  totalToolNodes: 255,
  totalToolCategories: CSP_EDIT_IMAGE_TOOL_18_CATEGORIES.length,
  mappedEngineDomainCount: 10,
} as const;
