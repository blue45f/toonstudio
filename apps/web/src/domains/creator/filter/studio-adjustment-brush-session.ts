/**
 * studio-adjustment-brush-session.ts
 *
 * Photoshop 원스텝 **조정 브러시(Adjustment Brush)** 비파괴 세션 엔진.
 *
 * - 사용자가 노출·명암·채도·색온도·선명도·부분 색조 브러시를 선택해 캔버스에 긋는 순간,
 *   1급 비파괴 조정 레이어(`AdjustmentElement`)와 **완전 반전(검정=0 숨김) 마스크**를 자동 생성하고
 *   획이 지나간 자리에만 부드러운 원형 댑으로 마스크 커버리지(0..255)를 칠한다.
 * - 기존 `layer/studio-adjustment-layer-elements.ts`와 `layer/studio-adjustment-composite-executor.ts`
 *   (내부적으로 `filter/studio-adjustment-executor.ts` 위임)를 그대로 재사용해
 *   중복 픽셀 파이프라인 없이 100% 비파괴 미리보기·사후 강도/파라미터 재조정을 지원한다.
 */
import {
  compositeAdjustmentPixels,
  type AdjustmentMaskCoverage,
} from "../layer/studio-adjustment-composite-executor";
import {
  createAdjustmentEl,
  isAdjustmentEl,
  type AdjustmentElement,
  type AdjustmentParameters,
} from "../layer/studio-adjustment-layer-elements";
import type { StudioImageDataLike } from "../studio-filters";

import type { StudioAdjustmentKind } from "./studio-adjustment-effect-graph";

export type AdjustmentBrushPresetId =
  | "exposure-brighten"
  | "exposure-darken"
  | "contrast-punch"
  | "vibrance-boost"
  | "temperature-warm"
  | "temperature-cool"
  | "clarity-curve"
  | "hsl-accent";

export interface AdjustmentBrushPreset {
  readonly id: AdjustmentBrushPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly adjustmentKind: StudioAdjustmentKind;
  readonly defaultParameters: AdjustmentParameters;
  readonly defaultLayerName: string;
}

export interface AdjustmentBrushPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure01?: number;
}

export type AdjustmentBrushPaintMode = "add" | "subtract";

export interface AdjustmentBrushTipConfig {
  readonly radiusPx: number;
  /** 경도 0..1 (1=선명한 경계, 0=부드러운 방사형 페더). */
  readonly hardness01: number;
  /** 스트로크 흐름/강도 0..1. */
  readonly flow01: number;
  /** 댑 간격 비율(반경 대비, 기본 0.25). */
  readonly spacingRatio: number;
  readonly mode: AdjustmentBrushPaintMode;
}

export interface AdjustmentBrushDirtyRect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface StudioAdjustmentBrushSession {
  readonly presetId: AdjustmentBrushPresetId;
  readonly phase: "active" | "committed";
  /** 첫 획 시작 시 자동 생성된 1급 비파괴 조정 레이어 요소. */
  readonly adjustmentElement: AdjustmentElement;
  /**
   * 초기 상태가 전부 0(반전 숨김)으로 생성되는 비파괴 조정 마스크.
   * 브러시가 칠한 영역만 0..255로 상승해 부분 조정이 적용된다.
   */
  readonly mask: AdjustmentMaskCoverage;
  readonly tip: AdjustmentBrushTipConfig;
  readonly lastPoint: AdjustmentBrushPoint | null;
  readonly strokeCount: number;
  readonly dabCount: number;
  readonly dirtyRect: AdjustmentBrushDirtyRect | null;
  readonly autoCreatedMaskInverted: true;
}

export interface BeginAdjustmentBrushInput {
  readonly presetId: AdjustmentBrushPresetId;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly startPoint: AdjustmentBrushPoint;
  readonly tip?: Partial<AdjustmentBrushTipConfig>;
  readonly clipToBelow?: boolean;
  readonly layerId?: string;
  readonly existingSession?: StudioAdjustmentBrushSession | null;
  /** true면 기존 세션이 있어도 새 조정 레이어 + 새 반전 마스크를 만든다. */
  readonly forceNewLayer?: boolean;
}

export const STUDIO_ADJUSTMENT_BRUSH_PRESETS: readonly AdjustmentBrushPreset[] =
  Object.freeze<AdjustmentBrushPreset[]>([
  {
    id: "exposure-brighten",
    labelKo: "부분 밝히기(노출+)",
    descriptionKo: "역광이나 인물 얼굴에 부드럽게 빛을 얹습니다.",
    adjustmentKind: "exposure",
    defaultParameters: { exposure: 0.75, offset: 0, gamma: 1.05 },
    defaultLayerName: "조정 브러시 · 밝기(노출+)",
  },
  {
    id: "exposure-darken",
    labelKo: "부분 어둡히기(노출-)",
    descriptionKo: "배경 가장자리나 그림자를 비파괴로 깊게 눌러줍니다.",
    adjustmentKind: "exposure",
    defaultParameters: { exposure: -0.75, offset: 0, gamma: 0.95 },
    defaultLayerName: "조정 브러시 · 음영(노출-)",
  },
  {
    id: "contrast-punch",
    labelKo: "명암 대비 강조",
    descriptionKo: "초점이 모여야 할 인물·소품의 대비만 또렷하게 끌어올립니다.",
    adjustmentKind: "brightness-contrast",
    defaultParameters: { brightness: 10, contrast: 28, useLegacy: false },
    defaultLayerName: "조정 브러시 · 명암 대비",
  },
  {
    id: "vibrance-boost",
    labelKo: "채도·생기 강조",
    descriptionKo: "피부톤을 과포화시키지 않고 눈동자·소품 색감을 살립니다.",
    adjustmentKind: "vibrance",
    defaultParameters: { vibrance: 45, saturation: 12 },
    defaultLayerName: "조정 브러시 · 채도 강조",
  },
  {
    id: "temperature-warm",
    labelKo: "따뜻한 색온도",
    descriptionKo: "노을빛·실내등이 닿는 부위를 따뜻한 색온도로 물들입니다.",
    adjustmentKind: "color-balance",
    defaultParameters: {
      shadowsCyanRed: 8,
      shadowsMagentaGreen: 2,
      shadowsYellowBlue: -12,
      midtonesCyanRed: 20,
      midtonesMagentaGreen: 4,
      midtonesYellowBlue: -26,
      highlightsCyanRed: 14,
      highlightsMagentaGreen: 2,
      highlightsYellowBlue: -18,
      preserveLuminosity: true,
    },
    defaultLayerName: "조정 브러시 · 따뜻한 색온도",
  },
  {
    id: "temperature-cool",
    labelKo: "차가운 색온도",
    descriptionKo: "그림자·야간 역광 부위에 시원한 한색 기운을 입힙니다.",
    adjustmentKind: "color-balance",
    defaultParameters: {
      shadowsCyanRed: -14,
      shadowsMagentaGreen: -2,
      shadowsYellowBlue: 20,
      midtonesCyanRed: -18,
      midtonesMagentaGreen: 0,
      midtonesYellowBlue: 24,
      highlightsCyanRed: -8,
      highlightsMagentaGreen: 0,
      highlightsYellowBlue: 12,
      preserveLuminosity: true,
    },
    defaultLayerName: "조정 브러시 · 차가운 색온도",
  },
  {
    id: "clarity-curve",
    labelKo: "선명도 톤 커브",
    descriptionKo: "S-커브 톤 보정으로 국소 입체감과 선명도를 높입니다.",
    adjustmentKind: "curves",
    defaultParameters: { rgbPoints: [0, 0, 64, 48, 192, 210, 255, 255] },
    defaultLayerName: "조정 브러시 · 선명도 톤",
  },
  {
    id: "hsl-accent",
    labelKo: "부분 색조·채도",
    descriptionKo: "칠한 영역의 색조·채도·명도를 비파괴로 재조정합니다.",
    adjustmentKind: "hsl",
    defaultParameters: { hue: 0, saturation: 28, lightness: 6 },
    defaultLayerName: "조정 브러시 · 색조/채도",
  },
]);

export const DEFAULT_ADJUSTMENT_BRUSH_TIP: AdjustmentBrushTipConfig = Object.freeze({
  radiusPx: 32,
  hardness01: 0.45,
  flow01: 0.85,
  spacingRatio: 0.25,
  mode: "add",
});

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge0 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function getAdjustmentBrushPreset(
  id: AdjustmentBrushPresetId,
): AdjustmentBrushPreset {
  return (
    STUDIO_ADJUSTMENT_BRUSH_PRESETS.find((p) => p.id === id) ??
    STUDIO_ADJUSTMENT_BRUSH_PRESETS[0]!
  );
}

function normalizeTip(partial?: Partial<AdjustmentBrushTipConfig>): AdjustmentBrushTipConfig {
  return {
    radiusPx: clamp(partial?.radiusPx ?? DEFAULT_ADJUSTMENT_BRUSH_TIP.radiusPx, 1, 400),
    hardness01: clamp01(partial?.hardness01 ?? DEFAULT_ADJUSTMENT_BRUSH_TIP.hardness01),
    flow01: clamp01(partial?.flow01 ?? DEFAULT_ADJUSTMENT_BRUSH_TIP.flow01),
    spacingRatio: clamp(partial?.spacingRatio ?? DEFAULT_ADJUSTMENT_BRUSH_TIP.spacingRatio, 0.05, 1),
    mode: partial?.mode === "subtract" ? "subtract" : "add",
  };
}

function mergeDirtyRect(
  existing: AdjustmentBrushDirtyRect | null,
  next: AdjustmentBrushDirtyRect,
): AdjustmentBrushDirtyRect {
  if (!existing) return next;
  return {
    minX: Math.min(existing.minX, next.minX),
    minY: Math.min(existing.minY, next.minY),
    maxX: Math.max(existing.maxX, next.maxX),
    maxY: Math.max(existing.maxY, next.maxY),
  };
}

/** 부드러운 원형 댑 1개를 마스크 커버리지 버퍼(복사본)에 칠한다. */
function paintMaskDabIntoBuffer(
  maskData: Uint8ClampedArray,
  width: number,
  height: number,
  point: AdjustmentBrushPoint,
  tip: AdjustmentBrushTipConfig,
): AdjustmentBrushDirtyRect | null {
  const pressure = clamp(point.pressure01 ?? 1, 0.1, 1);
  const radius = Math.max(1, tip.radiusPx * (0.45 + 0.55 * pressure));
  const strength = clamp01(tip.flow01 * pressure);
  if (strength <= 0) return null;

  const minX = Math.max(0, Math.floor(point.x - radius));
  const maxX = Math.min(width - 1, Math.ceil(point.x + radius));
  const minY = Math.max(0, Math.floor(point.y - radius));
  const maxY = Math.min(height - 1, Math.ceil(point.y + radius));
  if (minX > maxX || minY > maxY) return null;

  const innerRadius = radius * tip.hardness01;
  const rSq = radius * radius;

  for (let y = minY; y <= maxY; y += 1) {
    const dy = y + 0.5 - point.y;
    const row = y * width;
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - point.x;
      const distSq = dx * dx + dy * dy;
      if (distSq > rSq) continue;
      const dist = Math.sqrt(distSq);
      const falloff =
        dist <= innerRadius ? 1 : 1 - smoothstep(innerRadius, radius, dist);
      const alpha = falloff * strength;
      if (alpha <= 1e-4) continue;

      const idx = row + x;
      const prev = (maskData[idx] ?? 0) / 255;
      const next =
        tip.mode === "add"
          ? prev + (1 - prev) * alpha
          : prev * (1 - alpha);
      maskData[idx] = Math.round(clamp01(next) * 255);
    }
  }

  return { minX, minY, maxX, maxY };
}

/**
 * 원스텝 조정 브러시 스트로크 시작.
 *
 * 기존 세션이 없거나 프리셋이 바뀌었으면 즉시:
 *  1) 1급 비파괴 조정 레이어(`AdjustmentElement`)를 자동 생성하고,
 *  2) 전체 0(완전 반전 숨김) 마스크를 생성한 뒤 첫 댑을 페인트한다.
 */
export function beginAdjustmentBrushStroke(
  input: BeginAdjustmentBrushInput,
): StudioAdjustmentBrushSession {
  const safeW = Math.max(1, Math.round(input.canvasWidth));
  const safeH = Math.max(1, Math.round(input.canvasHeight));
  const tip = normalizeTip(input.tip);
  const preset = getAdjustmentBrushPreset(input.presetId);

  const canReuse =
    !input.forceNewLayer &&
    input.existingSession != null &&
    input.existingSession.presetId === input.presetId &&
    input.existingSession.mask.width === safeW &&
    input.existingSession.mask.height === safeH;

  let adjustmentElement: AdjustmentElement;
  let maskData: Uint8ClampedArray;
  let baseStrokeCount = 0;
  let baseDabCount = 0;
  let baseDirty: AdjustmentBrushDirtyRect | null = null;

  if (canReuse && input.existingSession) {
    adjustmentElement = input.existingSession.adjustmentElement;
    maskData = new Uint8ClampedArray(input.existingSession.mask.data);
    baseStrokeCount = input.existingSession.strokeCount;
    baseDabCount = input.existingSession.dabCount;
    baseDirty = input.existingSession.dirtyRect;
  } else {
    const rawEl = createAdjustmentEl({
      id: input.layerId ?? `adj-brush-${preset.id}`,
      kind: preset.adjustmentKind,
      pageWidth: safeW,
      pageHeight: safeH,
      name: preset.defaultLayerName,
      parameters: { ...preset.defaultParameters },
      clipToBelow: input.clipToBelow ?? false,
    });
    if (!isAdjustmentEl(rawEl)) {
      throw new Error("조정 브러시용 조정 레이어 생성에 실패했습니다.");
    }
    adjustmentElement = rawEl;
    // 핵심: 생성 직후 전부 0(반전/숨김) 마스크로 시작해 긋는 영역만 조정 노출
    maskData = new Uint8ClampedArray(safeW * safeH);
  }

  const dabDirty = paintMaskDabIntoBuffer(maskData, safeW, safeH, input.startPoint, tip);
  return {
    presetId: input.presetId,
    phase: "active",
    adjustmentElement,
    mask: { width: safeW, height: safeH, data: maskData },
    tip,
    lastPoint: input.startPoint,
    strokeCount: baseStrokeCount + 1,
    dabCount: baseDabCount + (dabDirty ? 1 : 0),
    dirtyRect: dabDirty ? mergeDirtyRect(baseDirty, dabDirty) : baseDirty,
    autoCreatedMaskInverted: true,
  };
}

/**
 * 조정 브러시 드래그 이동: 이전 점에서 현재 점까지 균일 간격으로 댑을 보간 페인트한다.
 */
export function moveAdjustmentBrushStroke(
  session: StudioAdjustmentBrushSession,
  nextPoint: AdjustmentBrushPoint,
): StudioAdjustmentBrushSession {
  if (session.phase !== "active") return session;
  const prev = session.lastPoint ?? nextPoint;
  const dx = nextPoint.x - prev.x;
  const dy = nextPoint.y - prev.y;
  const dist = Math.hypot(dx, dy);
  const stepPx = Math.max(1, session.tip.radiusPx * session.tip.spacingRatio);

  if (dist < stepPx * 0.35) return session;

  const maskData = new Uint8ClampedArray(session.mask.data);
  const steps = Math.max(1, Math.ceil(dist / stepPx));
  let dirty = session.dirtyRect;
  let addedDabs = 0;

  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const sample: AdjustmentBrushPoint = {
      x: prev.x + dx * t,
      y: prev.y + dy * t,
      pressure01:
        (prev.pressure01 ?? 1) + ((nextPoint.pressure01 ?? 1) - (prev.pressure01 ?? 1)) * t,
    };
    const dabDirty = paintMaskDabIntoBuffer(
      maskData,
      session.mask.width,
      session.mask.height,
      sample,
      session.tip,
    );
    if (dabDirty) {
      dirty = mergeDirtyRect(dirty, dabDirty);
      addedDabs += 1;
    }
  }

  return {
    ...session,
    mask: { ...session.mask, data: maskData },
    lastPoint: nextPoint,
    dabCount: session.dabCount + addedDabs,
    dirtyRect: dirty,
  };
}

export function commitAdjustmentBrushStroke(
  session: StudioAdjustmentBrushSession,
): StudioAdjustmentBrushSession {
  return { ...session, phase: "committed", lastPoint: null };
}

/** 스트로크 이후에도 비파괴 조정 레이어 파라미터를 즉시 재조정한다(마스크 유지). */
export function updateAdjustmentBrushParameters(
  session: StudioAdjustmentBrushSession,
  parametersPatch: AdjustmentParameters,
): StudioAdjustmentBrushSession {
  return {
    ...session,
    adjustmentElement: {
      ...session.adjustmentElement,
      parameters: {
        ...session.adjustmentElement.parameters,
        ...parametersPatch,
      },
    },
  };
}

/** 조정 레이어 전체 불투명도(0..1)를 비파괴로 변경한다. */
export function updateAdjustmentBrushOpacity(
  session: StudioAdjustmentBrushSession,
  opacity01: number,
): StudioAdjustmentBrushSession {
  return {
    ...session,
    adjustmentElement: {
      ...session.adjustmentElement,
      opacity: clamp01(opacity01),
    },
  };
}

/** 마스크 반전(255 - alpha)을 비파괴 새 버퍼로 반환한다. */
export function invertAdjustmentBrushMask(
  session: StudioAdjustmentBrushSession,
): StudioAdjustmentBrushSession {
  const inverted = new Uint8ClampedArray(session.mask.data.length);
  for (let i = 0; i < inverted.length; i += 1) {
    inverted[i] = 255 - (session.mask.data[i] ?? 0);
  }
  return {
    ...session,
    mask: { ...session.mask, data: inverted },
  };
}

/**
 * 기존 `compositeAdjustmentPixels`(`studio-adjustment-executor.ts` 위임)를 재사용해
 * 조정 브러시 마스크가 칠해진 영역만 비파괴로 합성한 미리보기 RGBA 버퍼를 반환한다.
 */
export function evaluateAdjustmentBrushPreview(
  source: StudioImageDataLike,
  session: StudioAdjustmentBrushSession,
): { readonly imageData: StudioImageDataLike; readonly applied: boolean } {
  return compositeAdjustmentPixels(source, session.adjustmentElement, session.mask);
}
