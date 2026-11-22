/**
 * Studio Colorize Mask Host — `studio-colorize-mask.ts` + `studio-smart-gap-fill.ts`(8방향 대각선 갭 밀폐)
 * 호스트 커맨드 브리지 및 지연 로드 인스펙터 섹션.
 *
 * 선화 레이어의 비파괴 메타데이터(`el.colorizeMask`)를 유지하면서,
 * 1) 8방향 직교·대각선 갭 밀폐(`enableDiagonalGapSeal`) + 내부 미세 구멍 흡수(`fillIsolatedPinholesMaxArea`)
 *    + 선화 장벽 보호 확장(`stopAtLineBarrier`)을 힌트 채색 굽기에 결합하고,
 * 2) 호스트 커맨드(`patchEl`, `commit`, `setSelectedId`)와 캔버스 힌트 획 입력을 연결해
 *    원본 선화를 손상시키지 않고 새 채색 레이어를 생성한다.
 */
import { createElement, useEffect, useMemo, useRef, useState } from "react";

import {
  colorizeLineartWithWatershed,
  type WatershedColorHint,
  type WatershedColorizeOptions,
} from "../imaging-pro/studio-watershed-lineart-colorizer";
import {
  encodeStudioAutoColorHintImageToPngDataUrl,
  loadStudioAutoColorHintImageFromSrc,
} from "../studio-auto-color-hints-image-source";
import {
  appendColorizeHintStroke,
  applyStudioColorizeMask,
  colorizeHexToRgba,
  colorizeMaskRevision,
  createColorizeMaskState,
  dilateColorizeBoundaryInk,
  isColorizeMaskStale,
  isValidColorizeHex,
  markColorizeMaskBaked,
  normalizeColorizeParams,
  removeColorizeHintStroke,
  withColorizeMaskParams,
  type ColorizeHintStroke,
  type ColorizeMaskParams,
  type StudioColorizeMaskState,
} from "../studio-colorize-mask";
import { uid } from "../studio-id";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  computeStudioSmartGapFillMask,
  dilateOrErodeSmartFillMask,
} from "../studio-smart-gap-fill";
import { StudioColorizeMaskPanel } from "../StudioColorizeMaskPanel";

import type { AdvancedFillImageDataLike } from "../studio-advanced-fill";
import type { El } from "../studio-element-model";
import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export type StudioColorizeImageEl = Extract<El, { type: "image" }>;

export interface StudioColorizeSmartGapOptions {
  /** 8방향 직교·대각선(45°/135°) 터진 선 갭 밀폐 활성화 여부. */
  readonly enableDiagonalGapSeal: boolean;
  /** 내부 고립 미세 구멍(pinhole) 자동 흡수 최대 면적(0..64px). */
  readonly fillIsolatedPinholesMaxArea: number;
  /** 선화 안쪽 1~4px 확장(선화 장벽 보호). */
  readonly expandPx: number;
  /** 선화 윤곽선 임계값(0..255). */
  readonly lineThreshold: number;
  /** 영역 내 허용 색상 오차(0..255). */
  readonly colorTolerance: number;
}

export const DEFAULT_COLORIZE_SMART_GAP_OPTIONS: StudioColorizeSmartGapOptions = {
  enableDiagonalGapSeal: true,
  fillIsolatedPinholesMaxArea: 12,
  expandPx: 1,
  lineThreshold: 32,
  colorTolerance: 32,
};

export type StudioColorizeSmartGapBakeResult =
  | {
      readonly ok: true;
      readonly imageData: AdvancedFillImageDataLike;
      readonly paintedPixelCount: number;
      readonly paintedRegionCount: number;
      readonly sealedGapCount: number;
      readonly absorbedPinholeCount: number;
      readonly nextMaskState: StudioColorizeMaskState;
    }
  | { readonly ok: false; readonly reason: string };

export interface StudioColorizeMaskHostDeps {
  readonly selected: StudioColorizeImageEl;
  readonly elements: readonly El[];
  readonly patchEl: (id: string, patch: Partial<El>) => void;
  readonly commit: (nextElements: El[]) => boolean;
  readonly setSelectedId: (id: string | null) => void;
  readonly createId?: () => string;
  readonly decodeSource?: (src: string) => Promise<AdvancedFillImageDataLike>;
  readonly encodePng?: (image: AdvancedFillImageDataLike) => string;
}

export interface StudioColorizeCanvasSeedPoint {
  readonly x: number;
  readonly y: number;
  readonly nonce: number;
}

const TRANSITION_CLASS =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none";

function buildDefaultHintHex(): string {
  return `${String.fromCharCode(35)}e06c4b`;
}

export function normalizeHintColorHex(raw: string | undefined): string {
  if (raw && isValidColorizeHex(raw)) return raw.toLowerCase();
  if (raw && /^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `${raw[0]}${raw[1]!}${raw[1]!}${raw[2]!}${raw[2]!}${raw[3]!}${raw[3]!}`.toLowerCase();
  }
  return buildDefaultHintHex();
}

function isSmartGapBoundaryPixel(data: Uint8ClampedArray, pixelIndex: number, lineThreshold: number): boolean {
  const offset = pixelIndex * 4;
  const r = data[offset] ?? 0;
  const g = data[offset + 1] ?? 0;
  const b = data[offset + 2] ?? 0;
  const a = data[offset + 3] ?? 0;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return a > 128 && brightness < 255 - lineThreshold;
}

function buildBoundaryMask(
  lineArt: AdvancedFillImageDataLike,
  lineThreshold: number,
  edgeDetectionPx: number,
): Uint8Array {
  const effective = edgeDetectionPx > 0 ? dilateColorizeBoundaryInk(lineArt, edgeDetectionPx) : lineArt;
  const total = effective.width * effective.height;
  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    if (isSmartGapBoundaryPixel(effective.data, i, lineThreshold)) mask[i] = 1;
  }
  return mask;
}

function sampleStrokeSeedPoints(
  stroke: ColorizeHintStroke,
  width: number,
  height: number,
  boundary: Uint8Array,
): { readonly x: number; readonly y: number }[] {
  const collected: { readonly x: number; readonly y: number }[] = [];
  const seen = new Set<number>();

  const pushPoint = (rawX: number, rawY: number): void => {
    const x = Math.max(0, Math.min(width - 1, Math.round(rawX)));
    const y = Math.max(0, Math.min(height - 1, Math.round(rawY)));
    const pos = y * width + x;
    if (boundary[pos] === 1 || seen.has(pos)) return;
    seen.add(pos);
    collected.push({ x, y });
  };

  for (let i = 0; i < stroke.points.length; i += 1) {
    const pt = stroke.points[i]!;
    pushPoint(pt.x, pt.y);
    if (i + 1 < stroke.points.length) {
      const next = stroke.points[i + 1]!;
      const dist = Math.hypot(next.x - pt.x, next.y - pt.y);
      const stride = Math.max(1, Math.ceil(dist / Math.max(4, stroke.radiusPx * 2)));
      for (let s = 1; s < stride; s += 1) {
        pushPoint(pt.x + ((next.x - pt.x) * s) / stride, pt.y + ((next.y - pt.y) * s) / stride);
      }
    }
  }
  return collected;
}

/**
 * 8방향 대각선 갭 밀폐(`studio-smart-gap-fill.ts`)와 `studio-colorize-mask.ts` 힌트 채색을 결합해 굽는다.
 * 입력 `lineArt`는 절대 수정하지 않으며, 투명 페인트 버퍼를 새로 만들어 반환한다.
 */
export function bakeStudioColorizeMaskWithSmartGap(input: {
  readonly lineArt: AdvancedFillImageDataLike;
  readonly state: StudioColorizeMaskState;
  readonly smartGap?: Partial<StudioColorizeSmartGapOptions>;
}): StudioColorizeSmartGapBakeResult {
  const { lineArt, state } = input;
  const normalized = normalizeColorizeParams(state.params);
  if (!normalized.ok) return { ok: false, reason: normalized.reason };
  if (state.hints.length === 0) {
    return { ok: false, reason: "힌트 획이 없어요. 선화 위에 색 힌트를 먼저 그어 주세요." };
  }
  for (const hint of state.hints) {
    if (!hint.transparent && !isValidColorizeHex(hint.colorHex)) {
      return { ok: false, reason: `힌트 색 형식이 올바르지 않아요: ${hint.colorHex}` };
    }
    if (hint.points.length === 0) return { ok: false, reason: "점이 없는 힌트 획이 있어요." };
  }

  const params = normalized.params;
  const smartGap: StudioColorizeSmartGapOptions = { ...DEFAULT_COLORIZE_SMART_GAP_OPTIONS, ...input.smartGap };
  const { width, height } = lineArt;
  const totalPixels = width * height;
  const nextRevision = colorizeMaskRevision({ ...state, params });
  const nextMaskState = markColorizeMaskBaked({ ...state, params }, nextRevision);

  if (!smartGap.enableDiagonalGapSeal || params.gapCloseHintPx <= 0) {
    const base = applyStudioColorizeMask({ lineArt, state: { ...state, params } });
    if (!base.ok) return { ok: false, reason: base.reason };
    return {
      ok: true,
      imageData: base.imageData,
      paintedPixelCount: base.paintedPixelCount,
      paintedRegionCount: base.paintedRegionCount,
      sealedGapCount: 0,
      absorbedPinholeCount: 0,
      nextMaskState,
    };
  }

  const edgeDetectionPx = Math.floor(params.edgeDetectionPx);
  const analysisLineArt = edgeDetectionPx > 0 ? dilateColorizeBoundaryInk(lineArt, edgeDetectionPx) : lineArt;
  const boundaryMask = buildBoundaryMask(lineArt, smartGap.lineThreshold, edgeDetectionPx);
  const gapRadius = Math.max(1, Math.min(16, Math.round(params.gapCloseHintPx)));
  const outData = new Uint8ClampedArray(totalPixels * 4);
  const ownerRegion = new Int32Array(totalPixels).fill(-1);

  let maxSealedGapCount = 0;
  let totalAbsorbedPinholes = 0;
  let nextRegionToken = 1;
  let unseededHintExists = false;

  for (const hint of state.hints) {
    const seeds = sampleStrokeSeedPoints(hint, width, height, boundaryMask);
    if (seeds.length === 0) {
      unseededHintExists = true;
      continue;
    }

    const rgba = hint.transparent ? null : colorizeHexToRgba(hint.colorHex);
    const strokeVisited = new Uint8Array(totalPixels);

    for (const seed of seeds) {
      const seedPos = seed.y * width + seed.x;
      if (strokeVisited[seedPos] === 1) continue;

      const fillResult = computeStudioSmartGapFillMask(analysisLineArt.data, width, height, seed.x, seed.y, {
        gapRadius,
        enableDiagonalGapSeal: true,
        expandPx: 0,
        lineThreshold: smartGap.lineThreshold,
        colorTolerance: smartGap.colorTolerance,
        fillIsolatedPinholesMaxArea: smartGap.fillIsolatedPinholesMaxArea,
        stopAtLineBarrier: true,
      });

      if (fillResult.sealedGapCount > maxSealedGapCount) maxSealedGapCount = fillResult.sealedGapCount;
      totalAbsorbedPinholes += fillResult.absorbedPinholeCount;
      if (fillResult.filledPixelCount === 0) continue;

      const finalMask =
        smartGap.expandPx !== 0
          ? dilateOrErodeSmartFillMask(fillResult.mask, width, height, smartGap.expandPx, boundaryMask, true)
          : fillResult.mask;

      const regionToken = nextRegionToken++;
      for (let pos = 0; pos < totalPixels; pos += 1) {
        if (finalMask[pos] !== 255) continue;
        strokeVisited[pos] = 1;
        if (smartGap.expandPx === 0 && boundaryMask[pos] === 1) continue;
        const off = pos * 4;
        if (hint.transparent || !rgba) {
          outData[off] = 0;
          outData[off + 1] = 0;
          outData[off + 2] = 0;
          outData[off + 3] = 0;
          ownerRegion[pos] = -1;
        } else {
          outData[off] = rgba[0];
          outData[off + 1] = rgba[1];
          outData[off + 2] = rgba[2];
          outData[off + 3] = rgba[3];
          ownerRegion[pos] = regionToken;
        }
      }
    }
  }

  if (params.cleanupPercent >= 60 || unseededHintExists) {
    const fallback = applyStudioColorizeMask({ lineArt: analysisLineArt, state: { ...state, params } });
    if (fallback.ok) {
      const fallbackToken = nextRegionToken;
      for (let pos = 0; pos < totalPixels; pos += 1) {
        if (ownerRegion[pos] !== -1 || boundaryMask[pos] === 1) continue;
        const off = pos * 4;
        if (fallback.imageData.data[off + 3]! === 0) continue;
        outData[off] = fallback.imageData.data[off]!;
        outData[off + 1] = fallback.imageData.data[off + 1]!;
        outData[off + 2] = fallback.imageData.data[off + 2]!;
        outData[off + 3] = fallback.imageData.data[off + 3]!;
        ownerRegion[pos] = fallbackToken;
      }
    }
  }

  let paintedPixelCount = 0;
  const paintedRegions = new Set<number>();
  for (let pos = 0; pos < totalPixels; pos += 1) {
    if (outData[pos * 4 + 3]! > 0) {
      paintedPixelCount += 1;
      if (ownerRegion[pos]! >= 0) paintedRegions.add(ownerRegion[pos]!);
    }
  }

  return {
    ok: true,
    imageData: { width, height, data: outData },
    paintedPixelCount,
    paintedRegionCount: paintedRegions.size,
    sealedGapCount: maxSealedGapCount,
    absorbedPinholeCount: totalAbsorbedPinholes,
    nextMaskState,
  };
}

/**
 * G'MIC/Krita 식 우선순위 큐 Watershed 선화 자동 플랫 채색 엔진으로 힌트 마스크를 굽는다.
 * 입력 `lineArt`는 절대 수정하지 않으며, 경계 침범을 최소화하고 안티앨리어싱 팽창으로 밑색을 생성한다.
 */
export function bakeStudioColorizeMaskWithWatershed(input: {
  readonly lineArt: AdvancedFillImageDataLike;
  readonly state: StudioColorizeMaskState;
  readonly watershed?: WatershedColorizeOptions;
}): StudioColorizeSmartGapBakeResult {
  const { lineArt, state } = input;
  const normalized = normalizeColorizeParams(state.params);
  if (!normalized.ok) return { ok: false, reason: normalized.reason };
  if (state.hints.length === 0) {
    return { ok: false, reason: "힌트 획이 없어요. 선화 위에 색 힌트를 먼저 그어 주세요." };
  }
  const hints: WatershedColorHint[] = [];
  for (const stroke of state.hints) {
    if (!stroke.transparent && !isValidColorizeHex(stroke.colorHex)) {
      return { ok: false, reason: `힌트 색 형식이 올바르지 않아요: ${stroke.colorHex}` };
    }
    if (stroke.points.length === 0) return { ok: false, reason: "점이 없는 힌트 획이 있어요." };
    const rgba = stroke.transparent ? ([0, 0, 0, 0] as const) : colorizeHexToRgba(stroke.colorHex);
    if (!rgba) return { ok: false, reason: `힌트 색을 해석할 수 없어요: ${stroke.colorHex}` };
    for (let idx = 0; idx < stroke.points.length; idx += 1) {
      const pt = stroke.points[idx]!;
      hints.push({
        id: `${stroke.id}#${idx}`,
        x: pt.x,
        y: pt.y,
        r: rgba[0],
        g: rgba[1],
        b: rgba[2],
        a: rgba[3],
        radiusPx: Math.min(4, Math.max(0, Math.round(stroke.radiusPx * 0.5))),
        transparent: stroke.transparent,
      });
    }
  }
  const params = normalized.params;
  const nextRevision = colorizeMaskRevision({ ...state, params });
  const nextMaskState = markColorizeMaskBaked({ ...state, params }, nextRevision);
  const res = colorizeLineartWithWatershed(lineArt, hints, {
    gapSealRadiusPx: params.gapCloseHintPx > 0 ? Math.min(4, Math.ceil(params.gapCloseHintPx * 0.25)) : 0,
    antiAliasExpandPx: 1,
    ...input.watershed,
  });
  const paintedRegionCount = Object.values(res.stats.regionPixelCounts).filter((count) => count > 0).length;
  return {
    ok: true,
    imageData: res.imageData,
    paintedPixelCount: res.stats.coloredPixelCount,
    paintedRegionCount,
    sealedGapCount: 0,
    absorbedPinholeCount: 0,
    nextMaskState,
  };
}

export function createColorizeHintStrokeFromPoints(
  points: readonly { readonly x: number; readonly y: number }[],
  options: { readonly id?: string; readonly colorHex: string; readonly transparent?: boolean; readonly radiusPx?: number },
): ColorizeHintStroke | null {
  const validPoints = points.filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y));
  if (validPoints.length === 0) return null;
  return {
    id: options.id ?? uid(),
    colorHex: normalizeHintColorHex(options.colorHex),
    transparent: options.transparent === true ? true : undefined,
    points: validPoints.map((pt) => ({ x: pt.x, y: pt.y })),
    radiusPx: Math.max(1, Math.min(48, Math.round(options.radiusPx ?? 4))),
  };
}

export interface StudioColorizeMaskHostCommands {
  readonly addMask: () => StudioColorizeMaskState;
  readonly deleteMask: () => void;
  readonly toggleEnabled: () => boolean;
  readonly updateParams: (
    patch: Partial<ColorizeMaskParams>,
  ) => { ok: true; state: StudioColorizeMaskState } | { ok: false; reason: string };
  readonly appendHintStroke: (stroke: ColorizeHintStroke) => StudioColorizeMaskState;
  readonly removeHintStroke: (strokeId: string) => StudioColorizeMaskState | null;
  readonly bakeMask: (
    imageSrc: string,
    smartGap?: Partial<StudioColorizeSmartGapOptions>,
  ) => Promise<
    | {
        readonly ok: true;
        readonly paintedRegionCount: number;
        readonly paintedPixelCount: number;
        readonly sealedGapCount: number;
        readonly absorbedPinholeCount: number;
        readonly createdElementId: string;
      }
    | { readonly ok: false; readonly reason: string }
  >;
}

/** 호스트 문서 커맨드(`patchEl`, `commit`, `setSelectedId`)와 힌트 채색 + 8방향 갭 밀폐를 연결한다. */
export function createStudioColorizeMaskHostCommands(deps: StudioColorizeMaskHostDeps): StudioColorizeMaskHostCommands {
  const createId = deps.createId ?? uid;
  const decodeSource = deps.decodeSource ?? loadStudioAutoColorHintImageFromSrc;
  const encodePng = deps.encodePng ?? encodeStudioAutoColorHintImageToPngDataUrl;
  const currentMaskState = (): StudioColorizeMaskState => deps.selected.colorizeMask ?? createColorizeMaskState();

  return {
    addMask(): StudioColorizeMaskState {
      const next = deps.selected.colorizeMask ?? createColorizeMaskState();
      deps.patchEl(deps.selected.id, { colorizeMask: next, colorizeMaskEnabled: true } as Partial<El>);
      return next;
    },
    deleteMask(): void {
      deps.patchEl(deps.selected.id, { colorizeMask: undefined, colorizeMaskEnabled: undefined } as Partial<El>);
    },
    toggleEnabled(): boolean {
      const nextEnabled = deps.selected.colorizeMaskEnabled === false;
      deps.patchEl(deps.selected.id, { colorizeMaskEnabled: nextEnabled } as Partial<El>);
      return nextEnabled;
    },
    updateParams(patch: Partial<ColorizeMaskParams>) {
      const result = withColorizeMaskParams(currentMaskState(), patch);
      if (!result.ok) return result;
      deps.patchEl(deps.selected.id, { colorizeMask: result.state } as Partial<El>);
      return result;
    },
    appendHintStroke(stroke: ColorizeHintStroke): StudioColorizeMaskState {
      const next = appendColorizeHintStroke(currentMaskState(), stroke);
      deps.patchEl(deps.selected.id, { colorizeMask: next, colorizeMaskEnabled: true } as Partial<El>);
      return next;
    },
    removeHintStroke(strokeId: string): StudioColorizeMaskState | null {
      if (!deps.selected.colorizeMask) return null;
      const next = removeColorizeHintStroke(deps.selected.colorizeMask, strokeId);
      deps.patchEl(deps.selected.id, { colorizeMask: next } as Partial<El>);
      return next;
    },
    async bakeMask(imageSrc, smartGap) {
      const state = deps.selected.colorizeMask;
      if (!state) return { ok: false, reason: "먼저 힌트 채색 마스크를 추가해 주세요." };
      if (deps.selected.colorizeMaskEnabled === false) {
        return { ok: false, reason: "마스크가 꺼져 있어요. 켠 뒤 다시 채색해 주세요." };
      }
      let lineArt: AdvancedFillImageDataLike;
      try {
        lineArt = await decodeSource(imageSrc);
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : "선화 이미지를 읽지 못했어요." };
      }
      const baked = bakeStudioColorizeMaskWithSmartGap({ lineArt, state, smartGap });
      if (!baked.ok) return baked;

      let dataUrl: string;
      try {
        dataUrl = encodePng(baked.imageData);
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : "채색 결과를 이미지로 인코딩하지 못했어요." };
      }

      const selectedIndex = deps.elements.findIndex((el) => el.id === deps.selected.id);
      if (selectedIndex < 0) return { ok: false, reason: "선택한 선화 레이어를 문서에서 찾지 못했어요." };

      const createdElementId = createId();
      const baseName = deps.selected.name?.trim() ? deps.selected.name.trim() : "선화";
      const paintEl: El = {
        id: createdElementId,
        type: "image",
        src: dataUrl,
        x: deps.selected.x,
        y: deps.selected.y,
        width: deps.selected.width,
        height: deps.selected.height,
        rotation: deps.selected.rotation ?? 0,
        opacity: 1,
        name: `${baseName} 채색 마스크`,
        groupId: deps.selected.groupId,
        frameClipId: deps.selected.frameClipId,
      };

      const nextElements = deps.elements.slice();
      nextElements[selectedIndex] = { ...deps.selected, colorizeMask: baked.nextMaskState };
      nextElements.splice(selectedIndex + 1, 0, paintEl);
      if (!deps.commit(nextElements)) return { ok: false, reason: "채색 레이어를 문서에 기록하지 못했어요." };
      deps.setSelectedId(createdElementId);

      return {
        ok: true,
        paintedRegionCount: baked.paintedRegionCount,
        paintedPixelCount: baked.paintedPixelCount,
        sealedGapCount: baked.sealedGapCount,
        absorbedPinholeCount: baked.absorbedPinholeCount,
        createdElementId,
      };
    },
  };
}

export interface StudioColorizeMaskHostSectionProps {
  readonly selected: StudioColorizeImageEl;
  readonly imageSrc: string;
  readonly activeColor: string;
  readonly elements: readonly El[];
  readonly patchEl: (id: string, patch: Partial<El>) => void;
  readonly commit: (nextElements: El[]) => boolean;
  readonly setSelectedId: (id: string | null) => void;
  readonly canvasArmed?: boolean;
  readonly onArmCanvasHints?: (armed: boolean) => void;
  readonly canvasSeedHit?: StudioColorizeCanvasSeedPoint | null;
  readonly canvasSeedHits?: readonly StudioColorizeCanvasSeedPoint[] | null;
  readonly onCanvasSeedHitConsumed?: () => void;
  readonly onPlanImageSize?: (size: { width: number; height: number } | null) => void;
  readonly decodeSource?: (src: string) => Promise<AdvancedFillImageDataLike>;
  readonly encodePng?: (image: AdvancedFillImageDataLike) => string;
}

/** `StudioInspectorImageToolsSection`의 `fill` 탭에 지연 마운트되는 힌트 채색 마스크 호스트 섹션. */
export function StudioColorizeMaskHostSection({
  selected,
  imageSrc,
  activeColor,
  elements,
  patchEl,
  commit,
  setSelectedId,
  canvasArmed = false,
  onArmCanvasHints,
  canvasSeedHit,
  canvasSeedHits,
  onCanvasSeedHitConsumed,
  onPlanImageSize,
  decodeSource,
  encodePng,
}: StudioColorizeMaskHostSectionProps): ReactElement {
  const [hintColorHex, setHintColorHex] = useState<string>(() => normalizeHintColorHex(activeColor));
  const [transparentMode, setTransparentMode] = useState<boolean>(false);
  const [localPaintArmed, setLocalPaintArmed] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [smartGap, setSmartGap] = useState<StudioColorizeSmartGapOptions>(DEFAULT_COLORIZE_SMART_GAP_OPTIONS);
  const [lastBakeSummary, setLastBakeSummary] = useState<{
    readonly paintedRegionCount: number;
    readonly paintedPixelCount: number;
    readonly sealedGapCount: number;
    readonly absorbedPinholeCount: number;
  } | null>(null);
  const [hostMessage, setHostMessage] = useState<string | null>(null);
  const lastConsumedNonceRef = useRef<number>(-1);
  const prevCanvasArmedRef = useRef<boolean>(canvasArmed);

  const commands = useMemo(
    () =>
      createStudioColorizeMaskHostCommands({
        selected,
        elements,
        patchEl,
        commit,
        setSelectedId,
        decodeSource,
        encodePng,
      }),
    [selected, elements, patchEl, commit, setSelectedId, decodeSource, encodePng],
  );

  const hasMask = Boolean(selected.colorizeMask);
  const maskState = selected.colorizeMask ?? null;
  const enabled = selected.colorizeMaskEnabled !== false;
  const stale = maskState ? isColorizeMaskStale(maskState) : false;
  const paintActive = localPaintArmed && (onArmCanvasHints ? canvasArmed : true);

  useEffect(() => {
    setHintColorHex(normalizeHintColorHex(activeColor));
  }, [activeColor]);

  // 외부 도구 전환으로 canvasArmed가 true→false로 내려갈 때만 로컬 힌트 무장을 해제한다.
  useEffect(() => {
    if (onArmCanvasHints && prevCanvasArmedRef.current && !canvasArmed && localPaintArmed) {
      setLocalPaintArmed(false);
    }
    prevCanvasArmedRef.current = canvasArmed;
  }, [canvasArmed, localPaintArmed, onArmCanvasHints]);

  useEffect(() => {
    if (!paintActive || !hasMask || !enabled) return;
    const batch = canvasSeedHits && canvasSeedHits.length > 0 ? canvasSeedHits : canvasSeedHit ? [canvasSeedHit] : null;
    if (!batch || batch.length === 0) return;

    const latestNonce = batch[batch.length - 1]!.nonce;
    if (latestNonce === lastConsumedNonceRef.current) return;
    lastConsumedNonceRef.current = latestNonce;

    const stroke = createColorizeHintStrokeFromPoints(batch, {
      colorHex: hintColorHex,
      transparent: transparentMode,
      radiusPx: 4,
    });
    if (stroke) {
      commands.appendHintStroke(stroke);
      setHostMessage(transparentMode ? "투명 힌트 획을 추가했어요." : `힌트 획 ${batch.length}점을 마스크에 기록했어요.`);
    }
    onCanvasSeedHitConsumed?.();
  }, [paintActive, hasMask, enabled, canvasSeedHit, canvasSeedHits, hintColorHex, transparentMode, commands, onCanvasSeedHitConsumed]);

  const handleTogglePaintActive = (): void => {
    const next = !localPaintArmed;
    setLocalPaintArmed(next);
    if (next && onPlanImageSize && selected.width > 0 && selected.height > 0) {
      onPlanImageSize({ width: Math.round(selected.width), height: Math.round(selected.height) });
    }
    onArmCanvasHints?.(next);
  };

  const handleBake = async (): Promise<void> => {
    setBusy(true);
    setHostMessage(null);
    try {
      const result = await commands.bakeMask(imageSrc, smartGap);
      if (!result.ok) {
        setHostMessage(result.reason);
        return;
      }
      setLastBakeSummary({
        paintedRegionCount: result.paintedRegionCount,
        paintedPixelCount: result.paintedPixelCount,
        sealedGapCount: result.sealedGapCount,
        absorbedPinholeCount: result.absorbedPinholeCount,
      });
      setHostMessage(
        `새 채색 레이어를 만들었어요 (영역 ${result.paintedRegionCount}곳 · 밀폐 갭 ${result.sealedGapCount}개 · 흡수 구멍 ${result.absorbedPinholeCount}px).`,
      );
    } finally {
      setBusy(false);
    }
  };

  return createElement(
    "div",
    { "data-testid": "studio-colorize-mask-host-section", className: "space-y-2 [word-break:keep-all]" },
    createElement(StudioColorizeMaskPanel, {
      hasMask,
      state: maskState,
      enabled,
      paintActive,
      activeColorHex: hintColorHex,
      transparentMode,
      stale,
      lastBakeSummary,
      busy,
      onAddMask: () => {
        commands.addMask();
        setHostMessage("힌트 채색 마스크를 추가했어요. 힌트를 그은 뒤 채색을 실행하세요.");
      },
      onDeleteMask: () => {
        if (localPaintArmed) {
          setLocalPaintArmed(false);
          onArmCanvasHints?.(false);
        }
        commands.deleteMask();
        setLastBakeSummary(null);
        setHostMessage("힌트 채색 마스크를 삭제했어요. 선화 원본은 그대로 유지됩니다.");
      },
      onToggleEnabled: () => {
        const nextEnabled = commands.toggleEnabled();
        if (!nextEnabled && localPaintArmed) {
          setLocalPaintArmed(false);
          onArmCanvasHints?.(false);
        }
      },
      onTogglePaintActive: handleTogglePaintActive,
      onActiveColorChange: (hex) => setHintColorHex(normalizeHintColorHex(hex)),
      onTransparentModeChange: setTransparentMode,
      onParamsChange: (patch) => {
        const updated = commands.updateParams(patch);
        if (!updated.ok) setHostMessage(updated.reason);
      },
      onRemoveHintStroke: (strokeId) => commands.removeHintStroke(strokeId),
      onBake: () => void handleBake(),
    }),
    hasMask
      ? createElement(
          "details",
          { className: "rounded-xl border border-line/75 bg-card/55 p-2 text-xs text-fg" },
          createElement(
            "summary",
            {
              className: cn(
                "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 font-semibold text-fg hover:bg-raised/60",
                TRANSITION_CLASS,
                STUDIO_FOCUS_RING,
              ),
            },
            createElement("span", null, "8방향 갭 밀폐 · 미세 구멍 보정"),
            createElement(
              "span",
              { className: "tabular-nums text-[0.7rem] text-fg-3" },
              smartGap.enableDiagonalGapSeal ? "8방향 활성" : "기본",
            ),
          ),
          createElement(
            "div",
            { className: "mt-2 flex flex-col gap-2 px-1" },
            createElement(
              "label",
              { className: "flex min-h-11 cursor-pointer items-center gap-2 text-[0.72rem] text-fg-2" },
              createElement("input", {
                type: "checkbox",
                checked: smartGap.enableDiagonalGapSeal,
                disabled: busy || !enabled,
                onChange: (event: { target: { checked: boolean } }) =>
                  setSmartGap((prev) => ({ ...prev, enableDiagonalGapSeal: event.target.checked })),
                className: "size-4 accent-accent",
              }),
              createElement("span", null, "45° 대각선 터진 선 갭까지 밀폐"),
            ),
            createElement(
              "label",
              { className: "flex flex-col gap-0.5 text-[0.72rem] text-fg-2" },
              createElement(
                "span",
                { className: "flex justify-between tabular-nums" },
                createElement("span", null, "미세 구멍 자동 흡수"),
                createElement("span", { className: "font-semibold text-fg" }, `${smartGap.fillIsolatedPinholesMaxArea}px`),
              ),
              createElement("input", {
                type: "range",
                "aria-label": "미세 구멍 자동 흡수 면적",
                min: 0,
                max: 48,
                step: 2,
                disabled: busy || !enabled,
                value: smartGap.fillIsolatedPinholesMaxArea,
                onChange: (event: { target: { value: string } }) =>
                  setSmartGap((prev) => ({ ...prev, fillIsolatedPinholesMaxArea: Number(event.target.value) })),
                className: "min-h-11 w-full cursor-pointer accent-accent",
              }),
            ),
            createElement(
              "label",
              { className: "flex flex-col gap-0.5 text-[0.72rem] text-fg-2" },
              createElement(
                "span",
                { className: "flex justify-between tabular-nums" },
                createElement("span", null, "선화 안쪽 확장(장벽 보호)"),
                createElement("span", { className: "font-semibold text-fg" }, `${smartGap.expandPx}px`),
              ),
              createElement("input", {
                type: "range",
                "aria-label": "선화 안쪽 확장 폭",
                min: 0,
                max: 4,
                step: 1,
                disabled: busy || !enabled,
                value: smartGap.expandPx,
                onChange: (event: { target: { value: string } }) =>
                  setSmartGap((prev) => ({ ...prev, expandPx: Number(event.target.value) })),
                className: "min-h-11 w-full cursor-pointer accent-accent",
              }),
            ),
          ),
        )
      : null,
    hostMessage
      ? createElement(
          "p",
          {
            role: "status",
            "aria-live": "polite",
            className: "rounded-lg border border-accent/35 bg-accent-soft px-2.5 py-1.5 text-[0.7rem] text-fg",
          },
          hostMessage,
        )
      : null,
  );
}
