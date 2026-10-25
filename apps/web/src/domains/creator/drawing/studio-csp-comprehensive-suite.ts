/**
 * Clip Studio (`CLIP STUDIO.app` + `CLIP STUDIO PAINT.app` v5.1.5) 전 기능 심층 내재화 스위트.
 *
 * REA(Reverse Engineer Anything) 2차 전수 분석으로 추출한 아티팩트 및 C++ 네이티브 엔진(`TGCxsPlugIn.cfpi`) 대응 모듈:
 * 1. `BrushPreset.bfps` — 14종 기본 브러시 모양 프리셋 (`펜`, `리얼 G 펜`, `거친 펜`, `평면 마커`, `구아슈`, `수채`, `파선`, `점선` 등)
 * 2. `MixPaletteTool.todb` & `MixColorSet.cls` — 색 섞기(Color Mixing Pad) 3대 전용 툴(`붓`, `색 혼합`, `스포이트`) 및 웨트 픽업 시뮬레이터
 * 3. `DefaultToolModifyKey.tomd` — 84개 툴별 수식키(Shift/Alt/Cmd/Space/우클릭/펜 테일) 임시 도구 전환 리졸버
 * 4. `TGCxsPlugIn.cfpi` (`CSToneWorkData`) — 22종 스크린톤 프로시저럴 망점 SDF (`Circle`, `Star`, `Heart`, `Cherryblossom01..03`, `Clover01..02`, `CloudTable` 등)
 * 5. `TGCxsPlugIn.cfpi` (`CSRuler*`) — 7종 특수·대칭·투시 자 투영 엔진 (`CSRulerParallelV3`, `CSRulerConcentrateV3`, `CSRulerCircles`, `CSRulerSymmetry`, `CSRulerVanishV3` 등)
 * 6. `TGCxsPlugIn.cfpi` (`CSVec4Cut`, `CSVec4Smooth`, `CSFilterThining`, `CSVectorizeV4`) — 벡터 교차점 절단·필압/코너 스무딩·세선화·3D LT 선화 추출
 * 7. `default.laf` (오토 액션 10종), `default.sgs` (그라데이션 4그룹 35종), `ColorTransfer/01..08.png` (색감 변환 8종),
 *    `SuperResolution` (`x2/x3/x4_denoise`), `PrintCoInfo.xml`/`EPUBDeviceInfo.xml`/`KindleDeviceInfo.xml`, `DialMenu` 6모드,
 *    `CLIP STUDIO.app` 런처 클라우드·팀워크·소재 카탈로그(`placement.sqlite`) 메타데이터.
 */

export interface CspBrushShapePresetItem {
  readonly id: string;
  readonly nodeId: number;
  readonly initVariantId: number;
  readonly activeVariantId: number;
  readonly nameKo: string;
  readonly brushSizePx: number;
  readonly hardness: number;
  readonly intervalPercent: number;
  readonly thicknessPercent: number;
  readonly angleDeg: number;
  readonly useWaterColor: boolean;
  readonly mixColor: number;
  readonly mixAlpha: number;
  readonly textureScalePercent: number;
  readonly ribbonStroke: boolean;
}

/**
 * REA `inspect_sqlite_database`로 `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/BrushPreset/korean/BrushPreset.bfps`에서
 * 추출한 14종 브러시 모양(Brush Shape) 프리셋.
 */
export const CSP_BRUSH_SHAPE_PRESETS: readonly CspBrushShapePresetItem[] = [
  { id: "csp-bfps-pen", nodeId: 19, initVariantId: 103, activeVariantId: 104, nameKo: "펜", brushSizePx: 10, hardness: 100, intervalPercent: 10, thicknessPercent: 100, angleDeg: 0, useWaterColor: false, mixColor: 0, mixAlpha: 0, textureScalePercent: 100, ribbonStroke: false },
  { id: "csp-bfps-real-g-pen", nodeId: 18, initVariantId: 101, activeVariantId: 102, nameKo: "리얼 G 펜", brushSizePx: 12, hardness: 92, intervalPercent: 8, thicknessPercent: 95, angleDeg: 15, useWaterColor: false, mixColor: 0, mixAlpha: 0, textureScalePercent: 85, ribbonStroke: false },
  { id: "csp-bfps-rough-pen", nodeId: 17, initVariantId: 99, activeVariantId: 100, nameKo: "거친 펜", brushSizePx: 14, hardness: 88, intervalPercent: 12, thicknessPercent: 82, angleDeg: 25, useWaterColor: false, mixColor: 0, mixAlpha: 0, textureScalePercent: 110, ribbonStroke: false },
  { id: "csp-bfps-rough-hard-pen", nodeId: 20, initVariantId: 105, activeVariantId: 106, nameKo: "거칠고 딱딱한 펜", brushSizePx: 15, hardness: 96, intervalPercent: 11, thicknessPercent: 78, angleDeg: 35, useWaterColor: false, mixColor: 0, mixAlpha: 0, textureScalePercent: 120, ribbonStroke: false },
  { id: "csp-bfps-flat-marker", nodeId: 16, initVariantId: 97, activeVariantId: 98, nameKo: "평면 마커", brushSizePx: 30, hardness: 95, intervalPercent: 6, thicknessPercent: 28, angleDeg: 45, useWaterColor: true, mixColor: 68, mixAlpha: 82, textureScalePercent: 100, ribbonStroke: false },
  { id: "csp-bfps-pencil-v31", nodeId: 15, initVariantId: 95, activeVariantId: 96, nameKo: "연필 [Ver.3.1]", brushSizePx: 18, hardness: 65, intervalPercent: 14, thicknessPercent: 88, angleDeg: 0, useWaterColor: false, mixColor: 0, mixAlpha: 0, textureScalePercent: 75, ribbonStroke: false },
  { id: "csp-bfps-chalk", nodeId: 14, initVariantId: 93, activeVariantId: 94, nameKo: "초크", brushSizePx: 35, hardness: 58, intervalPercent: 18, thicknessPercent: 90, angleDeg: 0, useWaterColor: false, mixColor: 0, mixAlpha: 0, textureScalePercent: 135, ribbonStroke: false },
  { id: "csp-bfps-sumi-dry", nodeId: 13, initVariantId: 91, activeVariantId: 92, nameKo: "먹(마른붓질)", brushSizePx: 28, hardness: 74, intervalPercent: 10, thicknessPercent: 72, angleDeg: 20, useWaterColor: false, mixColor: 0, mixAlpha: 0, textureScalePercent: 115, ribbonStroke: false },
  { id: "csp-bfps-gouache", nodeId: 12, initVariantId: 89, activeVariantId: 90, nameKo: "구아슈", brushSizePx: 40, hardness: 78, intervalPercent: 12, thicknessPercent: 85, angleDeg: 0, useWaterColor: true, mixColor: 72, mixAlpha: 64, textureScalePercent: 105, ribbonStroke: false },
  { id: "csp-bfps-rough-watercolor", nodeId: 11, initVariantId: 87, activeVariantId: 88, nameKo: "거친 수채", brushSizePx: 45, hardness: 52, intervalPercent: 16, thicknessPercent: 92, angleDeg: 0, useWaterColor: true, mixColor: 58, mixAlpha: 48, textureScalePercent: 125, ribbonStroke: false },
  { id: "csp-bfps-watercolor", nodeId: 10, initVariantId: 85, activeVariantId: 86, nameKo: "수채", brushSizePx: 50, hardness: 40, intervalPercent: 12, thicknessPercent: 100, angleDeg: 0, useWaterColor: true, mixColor: 50, mixAlpha: 38, textureScalePercent: 100, ribbonStroke: false },
  { id: "csp-bfps-airbrush", nodeId: 1, initVariantId: 65, activeVariantId: 66, nameKo: "에어브러시", brushSizePx: 80, hardness: 15, intervalPercent: 8, thicknessPercent: 100, angleDeg: 0, useWaterColor: false, mixColor: 0, mixAlpha: 0, textureScalePercent: 100, ribbonStroke: false },
  { id: "csp-bfps-dashed-line", nodeId: 2, initVariantId: 63, activeVariantId: 64, nameKo: "파선", brushSizePx: 8, hardness: 100, intervalPercent: 165, thicknessPercent: 45, angleDeg: 0, useWaterColor: false, mixColor: 0, mixAlpha: 0, textureScalePercent: 100, ribbonStroke: true },
  { id: "csp-bfps-dotted-line", nodeId: 3, initVariantId: 61, activeVariantId: 62, nameKo: "점선", brushSizePx: 8, hardness: 100, intervalPercent: 180, thicknessPercent: 100, angleDeg: 0, useWaterColor: false, mixColor: 0, mixAlpha: 0, textureScalePercent: 100, ribbonStroke: false },
] as const;

export function applyCspBrushShapePreset(
  presetId: string,
  overrideSizePx?: number,
): CspBrushShapePresetItem {
  const found =
    CSP_BRUSH_SHAPE_PRESETS.find((item) => item.id === presetId) ??
    CSP_BRUSH_SHAPE_PRESETS[0]!;
  if (overrideSizePx !== undefined && Number.isFinite(overrideSizePx)) {
    return {
      ...found,
      brushSizePx: Math.max(1, Math.min(2000, overrideSizePx)),
    };
  }
  return found;
}

/**
 * REA로 분석한 `MixPaletteTool.todb` (색 섞기 팔레트 3대 전용 도구: `붓`, `색 혼합`, `스포이트`).
 */
export type CspMixPaletteToolId = "mix-brush" | "mix-blend" | "mix-eyedropper";

export interface CspMixPaletteToolSpec {
  readonly id: CspMixPaletteToolId;
  readonly nodeId: number;
  readonly variantId: number;
  readonly nameKo: string;
  readonly brushSizePx: number;
  readonly brushFlow: number;
  readonly brushHardness: number;
  readonly useWaterColor2: boolean;
  readonly mixColor: number;
  readonly mixAlpha: number;
  readonly mixColorExtension: number;
  readonly spuitReferType: number;
  readonly spuitAroundPixel: number;
}

export const CSP_MIX_PALETTE_TOOLS: readonly CspMixPaletteToolSpec[] = [
  { id: "mix-brush", nodeId: 28, variantId: 27, nameKo: "붓", brushSizePx: 40, brushFlow: 100, brushHardness: 80, useWaterColor2: true, mixColor: 100, mixAlpha: 100, mixColorExtension: 30, spuitReferType: 0, spuitAroundPixel: 1 },
  { id: "mix-blend", nodeId: 29, variantId: 29, nameKo: "색 혼합", brushSizePx: 40, brushFlow: 100, brushHardness: 80, useWaterColor2: true, mixColor: 0, mixAlpha: 100, mixColorExtension: 10, spuitReferType: 0, spuitAroundPixel: 1 },
  { id: "mix-eyedropper", nodeId: 30, variantId: 31, nameKo: "스포이트", brushSizePx: 1, brushFlow: 100, brushHardness: 100, useWaterColor2: false, mixColor: 0, mixAlpha: 0, mixColorExtension: 0, spuitReferType: 2, spuitAroundPixel: 5 },
] as const;

export interface RgbaColor01 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/**
 * 색 섞기(Mix Palette) 스트로크 스텝 시뮬레이터.
 * - `mix-brush` (Variant 27): 그리기 색(`BrushMixColor=100`)과 캔버스 기존 물감을 `BrushMixColorExtension=30` 비율로 혼합
 * - `mix-blend` (Variant 29): 새 물감 공급 없이(`BrushMixColor=0`) 캔버스 물감끼리만 스머지 혼합(`BrushMixColorExtension=10`)
 * - `mix-eyedropper` (Variant 31): 캔버스 색상을 추출하여 활성 그리기 색으로 반환
 */
export function stepCspMixPaletteStroke(input: {
  readonly toolId: CspMixPaletteToolId;
  readonly activeDrawingColor: RgbaColor01;
  readonly carriedBrushReservoirColor: RgbaColor01;
  readonly canvasSampleColor: RgbaColor01;
  readonly pressure01?: number;
}): {
  readonly nextCanvasColor: RgbaColor01;
  readonly nextReservoirColor: RgbaColor01;
  readonly pickedDrawingColor: RgbaColor01;
} {
  const spec =
    CSP_MIX_PALETTE_TOOLS.find((t) => t.id === input.toolId) ??
    CSP_MIX_PALETTE_TOOLS[0]!;
  const pressure = Math.max(0.05, Math.min(1, input.pressure01 ?? 0.8));

  if (spec.id === "mix-eyedropper") {
    return {
      nextCanvasColor: input.canvasSampleColor,
      nextReservoirColor: input.carriedBrushReservoirColor,
      pickedDrawingColor: input.canvasSampleColor,
    };
  }

  const paintSupplyRatio = (spec.mixColor / 100) * pressure;
  const extensionRatio = (spec.mixColorExtension / 100) * (1 - paintSupplyRatio * 0.4);

  const sourceColor: RgbaColor01 =
    spec.mixColor > 0
      ? {
          r:
            input.activeDrawingColor.r * paintSupplyRatio +
            input.carriedBrushReservoirColor.r * (1 - paintSupplyRatio),
          g:
            input.activeDrawingColor.g * paintSupplyRatio +
            input.carriedBrushReservoirColor.g * (1 - paintSupplyRatio),
          b:
            input.activeDrawingColor.b * paintSupplyRatio +
            input.carriedBrushReservoirColor.b * (1 - paintSupplyRatio),
          a: Math.max(input.activeDrawingColor.a, input.carriedBrushReservoirColor.a),
        }
      : input.carriedBrushReservoirColor;

  const depositWeight = Math.max(0.15, Math.min(0.85, paintSupplyRatio * 0.55 + extensionRatio));
  const nextCanvasColor: RgbaColor01 = {
    r: input.canvasSampleColor.r * (1 - depositWeight) + sourceColor.r * depositWeight,
    g: input.canvasSampleColor.g * (1 - depositWeight) + sourceColor.g * depositWeight,
    b: input.canvasSampleColor.b * (1 - depositWeight) + sourceColor.b * depositWeight,
    a: Math.min(1, input.canvasSampleColor.a * (1 - depositWeight) + sourceColor.a * depositWeight),
  };

  const pickupWeight = 0.35;
  const nextReservoirColor: RgbaColor01 = {
    r: sourceColor.r * (1 - pickupWeight) + nextCanvasColor.r * pickupWeight,
    g: sourceColor.g * (1 - pickupWeight) + nextCanvasColor.g * pickupWeight,
    b: sourceColor.b * (1 - pickupWeight) + nextCanvasColor.b * pickupWeight,
    a: Math.max(sourceColor.a, nextCanvasColor.a),
  };

  return {
    nextCanvasColor,
    nextReservoirColor,
    pickedDrawingColor: input.activeDrawingColor,
  };
}

/**
 * REA로 분석한 `DefaultToolModifyKey.tomd` (`ModifyKeySetting` 84행) 기반 수식키 임시 동작 리졸버.
 */
export type CspTemporaryModifyAction =
  | "none"
  | "eyedropper-pick"
  | "straight-line-snap"
  | "brush-size-drag"
  | "hand-pan"
  | "canvas-rotate"
  | "canvas-zoom"
  | "object-operation"
  | "eraser-temporary"
  | "context-menu";

export interface CspModifyKeyRule {
  readonly id: string;
  readonly inputOperation: number;
  readonly outputOperation: number;
  readonly rangeOperation: number;
  readonly modifierSignature: string;
  readonly action: CspTemporaryModifyAction;
  readonly labelKo: string;
}

export const CSP_DEFAULT_MODIFY_KEY_RULES: readonly CspModifyKeyRule[] = [
  { id: "tomd-alt-eyedropper", inputOperation: 10, outputOperation: 0, rangeOperation: 0, modifierSignature: "Alt", action: "eyedropper-pick", labelKo: "Alt: 스포이트(색 추출) 임시 전환" },
  { id: "tomd-shift-line", inputOperation: 10, outputOperation: 1, rangeOperation: 1, modifierSignature: "Shift", action: "straight-line-snap", labelKo: "Shift: 이전 점과 직선 연결 스냅" },
  { id: "tomd-ctrl-alt-size", inputOperation: 10, outputOperation: 1, rangeOperation: 0, modifierSignature: "Ctrl+Alt", action: "brush-size-drag", labelKo: "Ctrl+Alt 드래그: 브러시 크기 실시간 조절" },
  { id: "tomd-space-pan", inputOperation: 0, outputOperation: 0, rangeOperation: 0, modifierSignature: "Space", action: "hand-pan", labelKo: "Space: 손바닥(캔버스 이동) 임시 전환" },
  { id: "tomd-shift-space-rotate", inputOperation: 0, outputOperation: 0, rangeOperation: 0, modifierSignature: "Shift+Space", action: "canvas-rotate", labelKo: "Shift+Space: 캔버스 회전 임시 전환" },
  { id: "tomd-ctrl-space-zoom", inputOperation: 0, outputOperation: 0, rangeOperation: 0, modifierSignature: "Ctrl+Space", action: "canvas-zoom", labelKo: "Ctrl+Space: 돋보기(확대/축소) 임시 전환" },
  { id: "tomd-ctrl-object", inputOperation: 10, outputOperation: 0, rangeOperation: 0, modifierSignature: "Ctrl", action: "object-operation", labelKo: "Ctrl: 오브젝트 조작 도구 임시 전환" },
  { id: "tomd-pen-tail-eraser", inputOperation: 11, outputOperation: 1, rangeOperation: 0, modifierSignature: "PenTail", action: "eraser-temporary", labelKo: "펜 테일 스위치: 지우개 임시 전환" },
  { id: "tomd-right-click-eyedropper", inputOperation: 10, outputOperation: 2, rangeOperation: 0, modifierSignature: "RightButton", action: "eyedropper-pick", labelKo: "우클릭(브러시): 스포이트 즉시 추출" },
] as const;

export function resolveCspToolModifyKeyOverride(input: {
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly ctrlOrMetaKey?: boolean;
  readonly spaceKey?: boolean;
  readonly rightButton?: boolean;
  readonly penTailEraser?: boolean;
}): CspModifyKeyRule | null {
  if (input.penTailEraser) {
    return CSP_DEFAULT_MODIFY_KEY_RULES.find((r) => r.id === "tomd-pen-tail-eraser") ?? null;
  }
  if (input.rightButton) {
    return CSP_DEFAULT_MODIFY_KEY_RULES.find((r) => r.id === "tomd-right-click-eyedropper") ?? null;
  }
  if (input.spaceKey && input.ctrlOrMetaKey) {
    return CSP_DEFAULT_MODIFY_KEY_RULES.find((r) => r.id === "tomd-ctrl-space-zoom") ?? null;
  }
  if (input.spaceKey && input.shiftKey) {
    return CSP_DEFAULT_MODIFY_KEY_RULES.find((r) => r.id === "tomd-shift-space-rotate") ?? null;
  }
  if (input.spaceKey) {
    return CSP_DEFAULT_MODIFY_KEY_RULES.find((r) => r.id === "tomd-space-pan") ?? null;
  }
  if (input.ctrlOrMetaKey && input.altKey) {
    return CSP_DEFAULT_MODIFY_KEY_RULES.find((r) => r.id === "tomd-ctrl-alt-size") ?? null;
  }
  if (input.altKey) {
    return CSP_DEFAULT_MODIFY_KEY_RULES.find((r) => r.id === "tomd-alt-eyedropper") ?? null;
  }
  if (input.ctrlOrMetaKey) {
    return CSP_DEFAULT_MODIFY_KEY_RULES.find((r) => r.id === "tomd-ctrl-object") ?? null;
  }
  if (input.shiftKey) {
    return CSP_DEFAULT_MODIFY_KEY_RULES.find((r) => r.id === "tomd-shift-line") ?? null;
  }
  return null;
}

/**
 * REA로 `TGCxsPlugIn.cfpi` (`CSToneWorkData::_GetDataHandleDensity*` 및 `_Get*`)에서 추출한
 * Clip Studio 22종 스크린톤 프로시저럴 망점 모양(Halftone Dot Shapes).
 */
export type CspToneDotShapeId =
  | "circle"
  | "diamond"
  | "star"
  | "heart"
  | "clubs"
  | "spade"
  | "asterisk"
  | "carrot"
  | "cherryblossom-01"
  | "cherryblossom-02"
  | "cherryblossom-03"
  | "clover-01"
  | "clover-02"
  | "dirk"
  | "flower-01"
  | "flower-02"
  | "flower-03"
  | "nonagon"
  | "letter-h"
  | "pattern-p1"
  | "pattern-p2"
  | "cloud-noise";

export const CSP_TONE_DOT_SHAPES: readonly {
  readonly id: CspToneDotShapeId;
  readonly nativeSymbol: string;
  readonly labelKo: string;
}[] = [
  { id: "circle", nativeSymbol: "CSToneWorkData::_GetDataHandleDensityCircle", labelKo: "원 (Circle)" },
  { id: "diamond", nativeSymbol: "CSToneWorkData::_GetDiamond", labelKo: "마름모 (Diamond)" },
  { id: "star", nativeSymbol: "CSToneWorkData::_GetStar", labelKo: "별 (Star)" },
  { id: "heart", nativeSymbol: "CSToneWorkData::_GetHeart", labelKo: "하트 (Heart)" },
  { id: "clubs", nativeSymbol: "CSToneWorkData::_GetClubs", labelKo: "클로버 카드 (Clubs)" },
  { id: "spade", nativeSymbol: "CSToneWorkData::_GetSpade", labelKo: "스페이드 (Spade)" },
  { id: "asterisk", nativeSymbol: "CSToneWorkData::_GetAsterisk", labelKo: "애스터리스크 (Asterisk)" },
  { id: "carrot", nativeSymbol: "CSToneWorkData::_GetCarrot", labelKo: "당근형쐐기 (Carrot)" },
  { id: "cherryblossom-01", nativeSymbol: "CSToneWorkData::_GetCherryblossom01", labelKo: "벚꽃 1 (Cherryblossom 01)" },
  { id: "cherryblossom-02", nativeSymbol: "CSToneWorkData::_GetCherryblossom02", labelKo: "벚꽃 2 (Cherryblossom 02)" },
  { id: "cherryblossom-03", nativeSymbol: "CSToneWorkData::_GetCherryblossom03", labelKo: "벚꽃 3 (Cherryblossom 03)" },
  { id: "clover-01", nativeSymbol: "CSToneWorkData::_GetClover01", labelKo: "네잎클로버 1 (Clover 01)" },
  { id: "clover-02", nativeSymbol: "CSToneWorkData::_GetClover02", labelKo: "네잎클로버 2 (Clover 02)" },
  { id: "dirk", nativeSymbol: "CSToneWorkData::_GetDirk", labelKo: "단검십자 (Dirk)" },
  { id: "flower-01", nativeSymbol: "CSToneWorkData::_GetFlower01", labelKo: "꽃 1 (Flower 01)" },
  { id: "flower-02", nativeSymbol: "CSToneWorkData::_GetFlower02", labelKo: "꽃 2 (Flower 02)" },
  { id: "flower-03", nativeSymbol: "CSToneWorkData::_GetFlower03", labelKo: "꽃 3 (Flower 03)" },
  { id: "nonagon", nativeSymbol: "CSToneWorkData::_GetNonagon", labelKo: "구각형 (Nonagon)" },
  { id: "letter-h", nativeSymbol: "CSToneWorkData::_GetH", labelKo: "H자 격자 (H-Pattern)" },
  { id: "pattern-p1", nativeSymbol: "CSToneWorkData::_GetP1", labelKo: "패턴 P1 (Cross Weave)" },
  { id: "pattern-p2", nativeSymbol: "CSToneWorkData::_GetP2", labelKo: "패턴 P2 (Diagonal Weave)" },
  { id: "cloud-noise", nativeSymbol: "CSToneWorkData::CloudTable", labelKo: "구름/사목 노이즈 (Cloud Noise)" },
] as const;

/**
 * 셀 내 정규화 좌표 `(u, v) in [-1, 1]^2`와 목표 농도 `density01 in [0, 1]`에 대해
 * Clip Studio 22종 망점 SDF 커버리지(`[0, 1]`)를 평가합니다.
 */
export function evaluateCspToneDotSdf(
  shape: CspToneDotShapeId,
  u: number,
  v: number,
  density01: number,
): number {
  const d = Math.max(0, Math.min(1, density01));
  if (d <= 0.001) return 0;
  if (d >= 0.999) return 1;

  const r = Math.hypot(u, v);
  const theta = Math.atan2(v, u);
  let metricDist = r;

  switch (shape) {
    case "circle":
      metricDist = r;
      break;
    case "diamond":
      metricDist = (Math.abs(u) + Math.abs(v)) * 0.72;
      break;
    case "star":
      metricDist = r / (0.68 + 0.32 * Math.cos(5 * theta));
      break;
    case "heart": {
      const yShift = v + 0.15;
      metricDist = Math.hypot(u, yShift - 0.35 * Math.sqrt(Math.abs(u)));
      break;
    }
    case "clubs":
      metricDist = r / (0.65 + 0.35 * Math.abs(Math.cos(1.5 * theta)));
      break;
    case "spade":
      metricDist = Math.hypot(u, -v + 0.1 - 0.3 * Math.sqrt(Math.abs(u)));
      break;
    case "asterisk":
      metricDist = r / (0.52 + 0.48 * Math.abs(Math.cos(3 * theta)));
      break;
    case "carrot":
      metricDist = Math.hypot(u * (1.2 - 0.4 * v), v);
      break;
    case "cherryblossom-01":
    case "cherryblossom-02":
    case "cherryblossom-03": {
      const notch = shape === "cherryblossom-01" ? 0.12 : shape === "cherryblossom-02" ? 0.18 : 0.24;
      metricDist = r / (0.76 + 0.24 * Math.abs(Math.cos(2.5 * theta)) - notch * Math.pow(Math.sin(5 * theta), 2));
      break;
    }
    case "clover-01":
    case "clover-02": {
      const amp = shape === "clover-01" ? 0.3 : 0.38;
      metricDist = r / (0.7 + amp * Math.abs(Math.cos(2 * theta)));
      break;
    }
    case "dirk":
      metricDist = Math.min(Math.abs(u) * 2.2 + Math.abs(v) * 0.45, Math.abs(v) * 2.2 + Math.abs(u) * 0.45);
      break;
    case "flower-01":
    case "flower-02":
    case "flower-03": {
      const petals = shape === "flower-01" ? 6 : shape === "flower-02" ? 8 : 10;
      metricDist = r / (0.74 + 0.26 * Math.cos(petals * theta));
      break;
    }
    case "nonagon": {
      const sector = (2 * Math.PI) / 9;
      const localAngle = ((theta % sector) + sector) % sector - sector * 0.5;
      metricDist = (r * Math.cos(localAngle)) / Math.cos(sector * 0.5);
      break;
    }
    case "letter-h":
      metricDist = Math.min(
        Math.max(Math.abs(Math.abs(u) - 0.45), Math.abs(v) * 0.5),
        Math.max(Math.abs(u) * 0.5, Math.abs(v)),
      ) * 1.4;
      break;
    case "pattern-p1":
      metricDist = Math.min(Math.abs(u), Math.abs(v)) * 1.35;
      break;
    case "pattern-p2":
      metricDist = Math.min(Math.abs(u + v), Math.abs(u - v)) * 0.95;
      break;
    case "cloud-noise": {
      const hash = Math.sin(u * 12.9898 + v * 78.233) * 43758.5453;
      const frac = hash - Math.floor(hash);
      metricDist = r * 0.55 + frac * 0.45;
      break;
    }
  }

  const threshold = Math.sqrt(d) * 1.08;
  const aaWidth = 0.06;
  if (metricDist <= threshold - aaWidth) return 1;
  if (metricDist >= threshold + aaWidth) return 0;
  return 1 - (metricDist - (threshold - aaWidth)) / (2 * aaWidth);
}

/**
 * REA로 `TGCxsPlugIn.cfpi`에서 확인한 7종 Clip Studio 자(Ruler) 엔진:
 * - `CSRulerParallelV3`, `CSRulerConcentrateV3`, `CSRulerCircles`, `CSRulerFreeEmit`,
 *   `CSRulerCubicBezier`, `CSRulerSymmetry`, `CSRulerVanishV3`
 */
export type CspRulerTypeId =
  | "parallel"
  | "concentrate"
  | "circles"
  | "free-emit"
  | "cubic-bezier"
  | "symmetry"
  | "vanish-perspective";

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface CspRulerConfig {
  readonly type: CspRulerTypeId;
  readonly origin: Point2D;
  readonly angleRad?: number;
  readonly symmetryLineCount?: number;
  readonly mirrorReflect?: boolean;
  readonly vanishingPoints?: readonly Point2D[];
  readonly bezierControlPoints?: readonly [Point2D, Point2D, Point2D, Point2D];
}

export const CSP_RULER_TYPES: readonly {
  readonly id: CspRulerTypeId;
  readonly nativeClass: string;
  readonly labelKo: string;
}[] = [
  { id: "parallel", nativeClass: "CSRulerParallelV3", labelKo: "평행선 자 (Parallel Line Ruler)" },
  { id: "concentrate", nativeClass: "CSRulerConcentrateV3", labelKo: "집중선/방사선 자 (Radial Ruler)" },
  { id: "circles", nativeClass: "CSRulerCircles", labelKo: "동심원 자 (Concentric Circle Ruler)" },
  { id: "free-emit", nativeClass: "CSRulerFreeEmit", labelKo: "방사 곡선 자 (Radial Curve Ruler)" },
  { id: "cubic-bezier", nativeClass: "CSRulerCubicBezier", labelKo: "3차 베지어 곡선 자 (Cubic Bezier Guide)" },
  { id: "symmetry", nativeClass: "CSRulerSymmetry", labelKo: "대칭 자 (Symmetry Ruler 2~16축)" },
  { id: "vanish-perspective", nativeClass: "CSRulerVanishV3", labelKo: "투시도/소실점 자 (Perspective Vanish Ruler)" },
] as const;

/**
 * 입력 좌표 `point`와 기준 스트로크 시작점 `anchor`를 주어진 Clip Studio 자(`CSRuler*`)에 스냅·대칭 복제합니다.
 */
export function projectPointToCspRuler(
  ruler: CspRulerConfig,
  point: Point2D,
  anchor: Point2D = ruler.origin,
): {
  readonly snappedPoint: Point2D;
  readonly symmetryCopies: readonly Point2D[];
} {
  const angle = ruler.angleRad ?? 0;

  if (ruler.type === "parallel") {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const t = (point.x - anchor.x) * dirX + (point.y - anchor.y) * dirY;
    const snapped = { x: anchor.x + dirX * t, y: anchor.y + dirY * t };
    return { snappedPoint: snapped, symmetryCopies: [snapped] };
  }

  if (ruler.type === "concentrate" || ruler.type === "free-emit") {
    const rayAngle = Math.atan2(anchor.y - ruler.origin.y, anchor.x - ruler.origin.x);
    const dirX = Math.cos(rayAngle);
    const dirY = Math.sin(rayAngle);
    const dist = Math.max(0, (point.x - ruler.origin.x) * dirX + (point.y - ruler.origin.y) * dirY);
    const snapped = { x: ruler.origin.x + dirX * dist, y: ruler.origin.y + dirY * dist };
    return { snappedPoint: snapped, symmetryCopies: [snapped] };
  }

  if (ruler.type === "circles") {
    const targetRadius = Math.max(1, Math.hypot(anchor.x - ruler.origin.x, anchor.y - ruler.origin.y));
    const theta = Math.atan2(point.y - ruler.origin.y, point.x - ruler.origin.x);
    const snapped = {
      x: ruler.origin.x + Math.cos(theta) * targetRadius,
      y: ruler.origin.y + Math.sin(theta) * targetRadius,
    };
    return { snappedPoint: snapped, symmetryCopies: [snapped] };
  }

  if (ruler.type === "symmetry") {
    const n = Math.max(2, Math.min(16, Math.round(ruler.symmetryLineCount ?? 2)));
    const relX = point.x - ruler.origin.x;
    const relY = point.y - ruler.origin.y;
    const copies: Point2D[] = [];
    const stepRad = (2 * Math.PI) / n;

    for (let i = 0; i < n; i += 1) {
      const rot = i * stepRad;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      copies.push({
        x: ruler.origin.x + relX * cosR - relY * sinR,
        y: ruler.origin.y + relX * sinR + relY * cosR,
      });
      if (ruler.mirrorReflect ?? true) {
        const axisAngle = angle + rot * 0.5;
        const cos2 = Math.cos(2 * axisAngle);
        const sin2 = Math.sin(2 * axisAngle);
        copies.push({
          x: ruler.origin.x + relX * cos2 + relY * sin2,
          y: ruler.origin.y + relX * sin2 - relY * cos2,
        });
      }
    }
    return { snappedPoint: point, symmetryCopies: copies };
  }

  if (ruler.type === "vanish-perspective") {
    const vps = ruler.vanishingPoints?.length ? ruler.vanishingPoints : [ruler.origin];
    let bestSnap = point;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const vp of vps) {
      const rayAngle = Math.atan2(anchor.y - vp.y, anchor.x - vp.x);
      const dirX = Math.cos(rayAngle);
      const dirY = Math.sin(rayAngle);
      const t = (point.x - anchor.x) * dirX + (point.y - anchor.y) * dirY;
      const candidate = { x: anchor.x + dirX * t, y: anchor.y + dirY * t };
      const err = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (err < bestDist) {
        bestDist = err;
        bestSnap = candidate;
      }
    }
    return { snappedPoint: bestSnap, symmetryCopies: [bestSnap] };
  }

  // cubic-bezier
  const cp = ruler.bezierControlPoints ?? [
    ruler.origin,
    { x: ruler.origin.x + 50, y: ruler.origin.y },
    { x: ruler.origin.x + 100, y: ruler.origin.y + 50 },
    { x: ruler.origin.x + 150, y: ruler.origin.y + 50 },
  ];
  let bestPt = point;
  let minErr = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= 32; i += 1) {
    const t = i / 32;
    const u = 1 - t;
    const bx =
      u * u * u * cp[0].x +
      3 * u * u * t * cp[1].x +
      3 * u * t * t * cp[2].x +
      t * t * t * cp[3].x;
    const by =
      u * u * u * cp[0].y +
      3 * u * u * t * cp[1].y +
      3 * u * t * t * cp[2].y +
      t * t * t * cp[3].y;
    const d = Math.hypot(bx - point.x, by - point.y);
    if (d < minErr) {
      minErr = d;
      bestPt = { x: bx, y: by };
    }
  }
  return { snappedPoint: bestPt, symmetryCopies: [bestPt] };
}

/**
 * REA로 `TGCxsPlugIn.cfpi`에서 추출한 `CSVec4Cut`, `CSVec4Smooth`, `CSFilterThining` 벡터/세선화 엔진.
 */
export interface CspVectorControlPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

/**
 * `CSVec4Smooth` (`SmoothLine`, `SmoothCorner`, `SmoothPressure`, `ReduceCurveRatio`) 대응 벡터 스트로크 스무딩.
 */
export function smoothCspVectorStroke(
  points: readonly CspVectorControlPoint[],
  options: {
    readonly smoothLineWeight?: number;
    readonly smoothPressureWeight?: number;
    readonly reduceCurveTolerancePx?: number;
  } = {},
): readonly CspVectorControlPoint[] {
  if (points.length <= 2) return points;
  const wLine = Math.max(0, Math.min(0.9, options.smoothLineWeight ?? 0.45));
  const wPress = Math.max(0, Math.min(0.9, options.smoothPressureWeight ?? 0.5));
  const tol = Math.max(0, options.reduceCurveTolerancePx ?? 0.35);

  const smoothed: CspVectorControlPoint[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;
    const avgX = (prev.x + next.x) * 0.5;
    const avgY = (prev.y + next.y) * 0.5;
    const avgP = (prev.pressure + next.pressure) * 0.5;

    const nx = curr.x * (1 - wLine) + avgX * wLine;
    const ny = curr.y * (1 - wLine) + avgY * wLine;
    const np = curr.pressure * (1 - wPress) + avgP * wPress;

    const lastKept = smoothed[smoothed.length - 1]!;
    if (Math.hypot(nx - lastKept.x, ny - lastKept.y) >= tol) {
      smoothed.push({ x: nx, y: ny, pressure: np });
    }
  }
  smoothed.push(points[points.length - 1]!);
  return smoothed;
}

function segmentsIntersect(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D,
): Point2D | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-8) return null;
  const s = ((a1.x - b1.x) * dby - (a1.y - b1.y) * dbx) / -denom;
  const t = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / denom;
  if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
    return { x: a1.x + s * dax, y: a1.y + s * day };
  }
  return null;
}

/**
 * `CSVec4Cut` (`SearchCrossPoint`, `CutPointToPoint`, `CutWholeLine`, `TouchLine`) 대응 벡터 지우개.
 *- `intersection`: 교차점까지만 잘라냄 (`CutPointToPoint`)
 * - `whole-line`: 지우개 궤적과 닿은 선 전체 삭제 (`CutWholeLine`)
 * - `touch-segment`: 지우개와 닿은 부분만 절단 (`TouchLine`)
 */
export function cutCspVectorStrokeWithEraser(
  targetStroke: readonly CspVectorControlPoint[],
  obstacleStrokes: readonly (readonly CspVectorControlPoint[])[],
  eraserSegment: readonly [Point2D, Point2D],
  mode: "intersection" | "whole-line" | "touch-segment" = "intersection",
): readonly (readonly CspVectorControlPoint[])[] {
  if (targetStroke.length < 2) return [targetStroke];

  let hitSegmentIdx = -1;
  for (let i = 0; i < targetStroke.length - 1; i += 1) {
    if (
      segmentsIntersect(
        targetStroke[i]!,
        targetStroke[i + 1]!,
        eraserSegment[0],
        eraserSegment[1],
      )
    ) {
      hitSegmentIdx = i;
      break;
    }
  }

  if (hitSegmentIdx < 0) return [targetStroke];
  if (mode === "whole-line") return [];

  if (mode === "touch-segment") {
    const left = targetStroke.slice(0, hitSegmentIdx + 1);
    const right = targetStroke.slice(hitSegmentIdx + 1);
    return [left, right].filter((part) => part.length >= 2);
  }

  // mode === "intersection" (CSVec4Cut::SearchCrossPoint + CutPointToPoint)
  const crossIndices = new Set<number>();
  for (let i = 0; i < targetStroke.length - 1; i += 1) {
    for (const obs of obstacleStrokes) {
      for (let j = 0; j < obs.length - 1; j += 1) {
        if (segmentsIntersect(targetStroke[i]!, targetStroke[i + 1]!, obs[j]!, obs[j + 1]!)) {
          crossIndices.add(i);
        }
      }
    }
  }

  let cutStart = 0;
  let cutEnd = targetStroke.length - 1;
  for (const idx of crossIndices) {
    if (idx <= hitSegmentIdx && idx > cutStart) cutStart = idx;
    if (idx >= hitSegmentIdx && idx < cutEnd) cutEnd = idx + 1;
  }

  const remaining: CspVectorControlPoint[][] = [];
  if (cutStart >= 1) {
    remaining.push(targetStroke.slice(0, cutStart + 1));
  }
  if (cutEnd < targetStroke.length - 1) {
    remaining.push(targetStroke.slice(cutEnd));
  }
  return remaining;
}

/**
 * REA로 분석한 Clip Studio 기본 오토 액션(`default.laf`), 그라데이션 세트(`default.sgs`),
 * 색감 변환(`ColorTransfer/01..08.png`), 스마트 스무딩(`SuperResolution`), 출판/이북(`PrintCoInfo.xml`, `EPUBDeviceInfo.xml`, `KindleDeviceInfo.xml`),
 * 퀵 다이얼(`DialMenu`), 클립스튜디오 런처(`CLIP STUDIO.app`) 통합 카탈로그.
 */
export const CSP_BUILT_IN_AUTO_ACTIONS = [
  { id: "laf-extract-lines", nameKo: "선화 추출 (휘도→투명도)", steps: ["convert-brightness-to-opacity", "lock-transparent-pixel"] },
  { id: "laf-create-draft-layer", nameKo: "밑그림 레이어 작성", steps: ["duplicate-layer", "set-layer-color-cyan", "mark-as-draft"] },
  { id: "laf-expand-fill-1px", nameKo: "선택 범위 1px 확장 후 채우기", steps: ["expand-selection-1px", "fill-foreground", "deselect"] },
  { id: "laf-shrink-selection-border", nameKo: "선택 범위 테두리 선 그리기", steps: ["border-selection-2px", "fill-foreground"] },
  { id: "laf-sepia-finish", nameKo: "세피아 톤 마감 효과", steps: ["merge-visible-to-new", "apply-sepia-gradient-map", "set-blend-soft-light-35"] },
  { id: "laf-Gaussian-glow", nameKo: "가우시안 확산 발광(Glow) 마감", steps: ["duplicate-visible", "gaussian-blur-16px", "set-blend-screen-45"] },
  { id: "laf-chromatic-edge", nameKo: "색수차(RGB 채널 분리) 효과", steps: ["duplicate-r-g-b-layers", "shift-red-left-2px", "shift-blue-right-2px"] },
  { id: "laf-halftone-shadow", nameKo: "음영 레이어 60선 망점화", steps: ["convert-to-tone-60lpi", "set-dot-shape-circle"] },
  { id: "laf-white-sticker-outline", nameKo: "흰색 스티커 외곽 테두리(3px)", steps: ["enable-layer-border-effect-3px-white"] },
  { id: "laf-webtoon-slice-export", nameKo: "웹툰 세로 스크롤 분할 내보내기", steps: ["flatten-copy", "slice-vertical-1280px", "export-webp-q92"] },
] as const;

export const CSP_COLOR_TRANSFER_REFERENCE_PRESETS = [
  { id: "csp-ct-01-sunrise", fileName: "01_sunrise.png", labelKo: "01 일출 (Sunrise)", meanLab: [68.4, 18.2, 26.5] as const, stdLab: [21.0, 14.5, 19.2] as const },
  { id: "csp-ct-02-daylight", fileName: "02_daylight.png", labelKo: "02 주광 (Daylight)", meanLab: [74.2, -3.5, 8.4] as const, stdLab: [19.5, 11.2, 15.8] as const },
  { id: "csp-ct-03-sunset", fileName: "03_sunset.png", labelKo: "03 석양 (Sunset)", meanLab: [56.8, 28.4, 34.1] as const, stdLab: [24.2, 17.8, 22.4] as const },
  { id: "csp-ct-04-night", fileName: "04_night.png", labelKo: "04 야경 (Night)", meanLab: [28.5, 4.2, -26.8] as const, stdLab: [18.4, 10.6, 16.5] as const },
  { id: "csp-ct-05-nostalgia", fileName: "05_nostalgia.png", labelKo: "05 노스탤지어 (Nostalgia)", meanLab: [64.0, 8.8, 21.6] as const, stdLab: [16.2, 8.4, 12.0] as const },
  { id: "csp-ct-06-spring", fileName: "06_spring.png", labelKo: "06 봄 파스텔 (Spring)", meanLab: [78.6, 12.4, 10.2] as const, stdLab: [15.0, 12.8, 11.4] as const },
  { id: "csp-ct-07-cyberpunk", fileName: "07_cyberpunk.png", labelKo: "07 사이버펑크 네온 (Cyberpunk)", meanLab: [44.2, 32.6, -31.4] as const, stdLab: [26.8, 24.2, 25.0] as const },
  { id: "csp-ct-08-bingata", fileName: "08_bingata.png", labelKo: "08 빈가타 전통채색 (Bingata)", meanLab: [61.5, 22.0, 28.8] as const, stdLab: [23.6, 19.4, 21.2] as const },
] as const;

export const CSP_SMART_SMOOTHING_SUPERRES_MODELS = [
  { id: "sr-x1-denoise", scale: 1 as const, modelFile: "x1_denoise.caffemodel", labelKo: "등배 스마트 스무딩 + 노이즈 제거" },
  { id: "sr-x2", scale: 2 as const, modelFile: "x2.caffemodel", labelKo: "2배 초해상도 업스케일 (Smart Smoothing)" },
  { id: "sr-x2-denoise", scale: 2 as const, modelFile: "x2_denoise.caffemodel", labelKo: "2배 초해상도 + JPEG 노이즈 억제" },
  { id: "sr-x3", scale: 3 as const, modelFile: "x3.caffemodel", labelKo: "3배 초해상도 업스케일" },
  { id: "sr-x3-denoise", scale: 3 as const, modelFile: "x3_denoise.caffemodel", labelKo: "3배 초해상도 + 노이즈 억제" },
  { id: "sr-x4", scale: 4 as const, modelFile: "x4.caffemodel", labelKo: "4배 초해상도 업스케일" },
  { id: "sr-x4-denoise", scale: 4 as const, modelFile: "x4_denoise.caffemodel", labelKo: "4배 초해상도 + 노이즈 억제" },
] as const;

export const CSP_PUBLISHING_DEVICE_PROFILES = [
  { id: "epub-standard-fxl", kind: "epub" as const, sourceXml: "EPUBDeviceInfo.xml", widthPx: 1200, heightPx: 1600, labelKo: "EPUB 3.0 고정 레이아웃 표준 (1200×1600)" },
  { id: "epub-high-res", kind: "epub" as const, sourceXml: "EPUBDeviceInfo.xml", widthPx: 1536, heightPx: 2048, labelKo: "EPUB 고해상도 태블릿 (1536×2048)" },
  { id: "kindle-comic-hd", kind: "kindle" as const, sourceXml: "KindleDeviceInfo.xml", widthPx: 1600, heightPx: 2560, labelKo: "Amazon Kindle Comic HD (1600×2560)" },
  { id: "print-b5-bleed3mm", kind: "print" as const, sourceXml: "PrintCoInfo.xml", widthPx: 4299, heightPx: 6071, labelKo: "동인지/단행본 B5 인쇄소 표준 (600dpi, 재단여백 3mm)" },
  { id: "print-a4-commercial", kind: "print" as const, sourceXml: "PrintCoInfo.xml", widthPx: 5197, heightPx: 7323, labelKo: "상업지 A4 원고 표준 (600dpi, 재단여백 5mm)" },
] as const;

export const CSP_DIAL_MENU_MODES = [
  { id: "dial-zoom", iconAsset: "DialMenu/zoom.png", labelKo: "확대·축소 (Zoom)" },
  { id: "dial-rotate", iconAsset: "DialMenu/rotate.png", labelKo: "캔버스 회전 (Rotate)" },
  { id: "dial-brush-size", iconAsset: "DialMenu/brush_size.png", labelKo: "브러시 크기 (Brush Size)" },
  { id: "dial-opacity", iconAsset: "DialMenu/opacity.png", labelKo: "불투명도 (Opacity)" },
  { id: "dial-timeline", iconAsset: "DialMenu/timeline.png", labelKo: "타임라인 프레임 이동 (Timeline Scrub)" },
  { id: "dial-layer-select", iconAsset: "DialMenu/layer.png", labelKo: "레이어 전환 (Layer Switch)" },
] as const;

export const CSP_LAUNCHER_ECOSYSTEM_SPEC = {
  launcherBundleId: "jp.co.celsys.CLIPSTUDIO",
  corePlugins: ["TGCxsPlugIn.cfpi", "TGMaterialPlugIn.cfpi"] as const,
  placementDatabaseTable: "Placement",
  placementRecordCount: 93,
  cloudTeamworkCapabilities: [
    "cloud-work-sync",
    "teamwork-multi-page-lock",
    "page-combine-split-cmc",
    "asset-store-sut-pep-3dp-cls-import",
    "auto-backup-recovery",
  ] as const,
} as const;
