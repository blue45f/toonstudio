import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { invertLayerMaskAlpha } from "../layer/studio-layer-mask";
import type { AdvancedFillMaskLike } from "../studio-advanced-fill";
import { COLOR_RANGE_MAX_SAMPLES, type ColorRangeSample } from "../studio-color-range";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { El, ImageEl } from "../studio-element-model";
import { resolveHistoryBrushSource } from "../studio-history-brush";
import { isEffectivelyHidden, isEffectivelyLocked, type LayerGroup } from "../studio-layers";
import {
  encodeStudioPixelEditResultPng,
  yieldStudioPixelEditMainThread,
  type createStudioPixelEditCanvas,
  type loadStudioPixelEditImage,
} from "../studio-legacy-editor-runtime-helpers";
import { applyMagicWandRegionToSelection } from "../studio-magic-wand";
import type { StudioMagneticLassoFieldState } from "../studio-magnetic-lasso-authority";
import { loadStudioPixelEditBrushRuntime } from "../studio-page-editor-runtime-loaders";
import type { PageState } from "../studio-page-state";
import { quickSelectionToleranceFromSlider } from "../studio-quick-selection";
import {
  buildSelectionMaskPlan,
  isSelectionUsable,
  rasterizeSelectionMask,
  selectionCombineModeForOperation,
  selectionOperationBase,
  type PixelSelection,
  type SelectionFrame,
  type SelectionOperationMode, SelPoint 
} from "../studio-selection-tools";

export interface StudioQuickSelectStrokeSession {
  elId: string;
  frame: SelectionFrame;
  points: SelPoint[];
  radiusNorm: number;
  target: ImageEl & El;
  base: PixelSelection | null;
  combine: SelectionOperationMode;
  mutationTicket: StudioEditorMutationTicket;
  scanInFlight: boolean;
  scanQueued: boolean;
  finished: boolean;
}

export async function runStudioMagicWandSelectOnTarget({
  target, pos, frame, activeSurfaceReviewLockedRef, groups, wandTolerance, pixelCombine,
  pixelWandRunIdRef, pixelWandActiveRunIdRef, captureStudioMutationTicket,
  canApplyStudioMutation, activePixelSelectionElementId, commitPixelSelectionState,
  setPixelBusy, setError, pointNotFoundMessage,
}: {
  readonly target: ImageEl & El;
  readonly pos: { readonly x: number; readonly y: number };
  readonly frame: SelectionFrame;
  readonly activeSurfaceReviewLockedRef: MutableRefObject<boolean>;
  readonly groups: LayerGroup[];
  readonly wandTolerance: number;
  readonly pixelCombine: SelectionOperationMode;
  readonly pixelWandRunIdRef: MutableRefObject<number>;
  readonly pixelWandActiveRunIdRef: MutableRefObject<number | null>;
  readonly captureStudioMutationTicket: () => StudioEditorMutationTicket;
  readonly canApplyStudioMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly activePixelSelectionElementId: () => string | null;
  readonly commitPixelSelectionState: (
    next: PixelSelection | null | ((previous: PixelSelection | null) => PixelSelection | null),
    kind: "magic-wand",
  ) => void;
  readonly setPixelBusy: Dispatch<SetStateAction<boolean>>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly pointNotFoundMessage: string;
}): Promise<void> {
  if (
    activeSurfaceReviewLockedRef.current
    || isEffectivelyLocked(target, groups)
    || isEffectivelyHidden(target, groups)
  ) {
    setError("매직완드 대상 레이어의 표시·잠금 상태를 확인해 주세요.");
    return;
  }
  const mutationTicket = captureStudioMutationTicket();
  const p = { x: (pos.x - frame.x) / frame.width, y: (pos.y - frame.y) / frame.height };
  const runId = ++pixelWandRunIdRef.current;
  pixelWandActiveRunIdRef.current = runId;
  setPixelBusy(true);
  try {
    const { magicWandScanFromImage } = await loadStudioPixelEditBrushRuntime();
    const region = await magicWandScanFromImage(target.src, p.x, p.y, wandTolerance, {
      flipX: target.flipped,
      flipY: target.flippedY,
    });
    if (!canApplyStudioMutation(mutationTicket)) return;
    if (runId !== pixelWandRunIdRef.current) return;
    if (activePixelSelectionElementId() !== target.id) return;
    commitPixelSelectionState(
      (previous) => applyMagicWandRegionToSelection(
        selectionOperationBase(previous, pixelCombine),
        region,
        selectionCombineModeForOperation(pixelCombine),
      ),
      "magic-wand",
    );
  } catch (err) {
    if (runId === pixelWandRunIdRef.current) {
      setError(err instanceof Error ? err.message : pointNotFoundMessage);
    }
  } finally {
    if (pixelWandActiveRunIdRef.current === runId) {
      pixelWandActiveRunIdRef.current = null;
    }
    if (runId === pixelWandRunIdRef.current) setPixelBusy(false);
  }
}

export async function runStudioScanQuickSelectionSession({
  session, quickSelectTolerance, quickSelectRunIdRef, quickSelectActiveRunIdRef,
  quickSelectDragRef, canApplyStudioMutation, activePixelSelectionElementId,
  commitPixelSelectionState, setPixelBusy, setError, scanQuickSelectionSession,
  rubAreaNotFoundMessage,
}: {
  readonly session: StudioQuickSelectStrokeSession;
  readonly quickSelectTolerance: number;
  readonly quickSelectRunIdRef: MutableRefObject<number>;
  readonly quickSelectActiveRunIdRef: MutableRefObject<number | null>;
  readonly quickSelectDragRef: MutableRefObject<StudioQuickSelectStrokeSession | null>;
  readonly canApplyStudioMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly activePixelSelectionElementId: () => string | null;
  readonly commitPixelSelectionState: (
    next: PixelSelection | null | ((previous: PixelSelection | null) => PixelSelection | null),
    kind: "magic-wand",
    coalesceKey?: string,
  ) => void;
  readonly setPixelBusy: Dispatch<SetStateAction<boolean>>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly scanQuickSelectionSession: (session: StudioQuickSelectStrokeSession) => Promise<void>;
  readonly rubAreaNotFoundMessage: string;
}): Promise<void> {
  if (session.scanInFlight) {
    session.scanQueued = true;
    return;
  }
  session.scanInFlight = true;
  const runId = ++quickSelectRunIdRef.current;
  quickSelectActiveRunIdRef.current = runId;
  try {
    const { quickSelectionScanFromImage } = await loadStudioPixelEditBrushRuntime();
    const region = await quickSelectionScanFromImage(
      session.target.src,
      { points: session.points.slice(), radiusNorm: session.radiusNorm },
      quickSelectionToleranceFromSlider(quickSelectTolerance),
      { flipX: session.target.flipped, flipY: session.target.flippedY },
    );
    if (!canApplyStudioMutation(session.mutationTicket)) return;
    if (runId !== quickSelectRunIdRef.current) return;
    if (activePixelSelectionElementId() !== session.target.id) return;
    commitPixelSelectionState(
      () => applyMagicWandRegionToSelection(
        session.base,
        region,
        selectionCombineModeForOperation(session.combine),
      ),
      "magic-wand",
      `quick-selection:${session.target.id}`,
    );
  } catch (err) {
    if (runId === quickSelectRunIdRef.current) {
      setError(err instanceof Error ? err.message : rubAreaNotFoundMessage);
    }
  } finally {
    session.scanInFlight = false;
    if (quickSelectActiveRunIdRef.current === runId) {
      quickSelectActiveRunIdRef.current = null;
    }
    if (session.scanQueued && (quickSelectDragRef.current === session || session.finished)) {
      session.scanQueued = false;
      void scanQuickSelectionSession(session);
    } else if (session.finished) {
      setPixelBusy(false);
    }
  }
}

export async function runStudioColorRangeSample({
  selected, p, setColorRangeSamples, setError, colorPickFailedMessage,
}: {
  readonly selected: El | null;
  readonly p: { readonly x: number; readonly y: number };
  readonly setColorRangeSamples: Dispatch<SetStateAction<ColorRangeSample[]>>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly colorPickFailedMessage: string;
}): Promise<void> {
  if (selected?.type !== "image") return;
  const target = selected;
  try {
    const { sampleImageColorAt } = await import("../studio-color-range-browser");
    const sample = await sampleImageColorAt(target.src, p.x, p.y, {
      flipX: target.flipped,
      flipY: target.flippedY,
    });
    setColorRangeSamples((prev) => [...prev, sample].slice(-COLOR_RANGE_MAX_SAMPLES));
  } catch (err) {
    setError(err instanceof Error ? err.message : colorPickFailedMessage);
  }
}

export function runStudioInvertImageMask({
  kind, selected, activeSurfaceReviewLocked, groups,
  captureStudioMutationTicket, canApplyStudioMutation, isLatestLayerContentMutationLocked,
  loadSourceImage, loadMaskImage, createCanvas, patchEl,
}: {
  readonly kind: "layer" | "filter";
  readonly selected: El | null;
  readonly activeSurfaceReviewLocked: boolean;
  readonly groups: LayerGroup[];
  readonly captureStudioMutationTicket: () => StudioEditorMutationTicket;
  readonly canApplyStudioMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly isLatestLayerContentMutationLocked: (elementId: string) => boolean;
  readonly loadSourceImage: typeof loadStudioPixelEditImage;
  readonly loadMaskImage: typeof loadStudioPixelEditImage;
  readonly createCanvas: typeof createStudioPixelEditCanvas;
  readonly patchEl: (id: string, patch: Partial<El>) => boolean;
}): void {
  const existingMaskSrc = selected?.type === "image"
    ? (kind === "layer" ? selected.maskSrc : selected.filterMaskSrc)
    : undefined;
  if (
    selected?.type !== "image"
    || !existingMaskSrc
    || activeSurfaceReviewLocked
    || isEffectivelyLocked(selected, groups)
  ) return;
  const target = selected;
  const mutationTicket = captureStudioMutationTicket();
  void (async () => {
    const img = await loadSourceImage(target.src);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const maskImg = await loadMaskImage(existingMaskSrc);
    const out = invertLayerMaskAlpha(maskImg, w, h, createCanvas);
    if (!out) return;
    await yieldStudioPixelEditMainThread();
    const nextMaskSrc = await encodeStudioPixelEditResultPng(out as HTMLCanvasElement);
    if (!canApplyStudioMutation(mutationTicket)) return;
    if (isLatestLayerContentMutationLocked(target.id)) return;
    patchEl(
      target.id,
      (kind === "layer" ? { maskSrc: nextMaskSrc } : { filterMaskSrc: nextMaskSrc }) as Partial<El>,
    );
  })();
}

export function runStudioDesignateHistoryBrushSource({
  index, masterEditMode, activeSurfaceReviewLocked, selected, groups,
  pagesHistory, activePageId, setHistoryBrushSourceIndex, setHistoryBrushSourceSrc,
  setError, sourceMissingMessage,
}: {
  readonly index: number;
  readonly masterEditMode: boolean;
  readonly activeSurfaceReviewLocked: boolean;
  readonly selected: El | null;
  readonly groups: LayerGroup[];
  readonly pagesHistory: readonly (readonly PageState[])[];
  readonly activePageId: string;
  readonly setHistoryBrushSourceIndex: Dispatch<SetStateAction<number | null>>;
  readonly setHistoryBrushSourceSrc: Dispatch<SetStateAction<string | null>>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly sourceMissingMessage: string;
}): void {
  if (
    masterEditMode
    || activeSurfaceReviewLocked
    || selected?.type !== "image"
    || isEffectivelyLocked(selected, groups)
  ) return;
  const snapshot = pagesHistory[index];
  if (!snapshot) return;
  const result = resolveHistoryBrushSource(snapshot, activePageId, selected.id);
  if (!result.ok) {
    setError(sourceMissingMessage);
    return;
  }
  setHistoryBrushSourceIndex(index);
  setHistoryBrushSourceSrc(result.src);
  setError(null);
}

export function buildStudioAdvancedFillSelectionMask({
  pixelSel, target, width, height, createCanvas, maskCreateFailedMessage, maskReadFailedMessage,
}: {
  readonly pixelSel: PixelSelection | null;
  readonly target: ImageEl & El;
  readonly width: number;
  readonly height: number;
  readonly createCanvas: typeof createStudioPixelEditCanvas;
  readonly maskCreateFailedMessage: string;
  readonly maskReadFailedMessage: string;
}): AdvancedFillMaskLike | undefined {
  if (!pixelSel || !isSelectionUsable(pixelSel)) return undefined;
  const maskPlan = buildSelectionMaskPlan(pixelSel, width, height, {
    featherScale: target.width > 0 ? width / target.width : 1,
    flipX: target.flipped,
    flipY: target.flippedY,
  });
  if (!maskPlan) return undefined;
  const maskCanvas = rasterizeSelectionMask(maskPlan, createCanvas) as HTMLCanvasElement | null;
  if (!maskCanvas) throw new Error(maskCreateFailedMessage);
  try {
    const context = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error(maskReadFailedMessage);
    const rgba = context.getImageData(0, 0, width, height).data;
    const data = new Uint8Array(width * height);
    for (let position = 0; position < data.length; position++) data[position] = rgba[position * 4 + 3]!;
    return { data, width, height };
  } finally {
    maskCanvas.width = 0;
    maskCanvas.height = 0;
  }
}

export function runStudioMagneticLassoFieldEffect({
  magneticLassoFieldKey, magneticLassoFieldSrc, selectedImageElementId,
  magneticLassoFieldFlipX, magneticLassoFieldFlipY,
  pixelMagneticFieldRunIdRef, pixelMagneticFieldStateRef, fieldLoadFailedMessage,
}: {
  readonly magneticLassoFieldKey: string | null;
  readonly magneticLassoFieldSrc: string | null;
  readonly selectedImageElementId: string | null;
  readonly magneticLassoFieldFlipX: boolean;
  readonly magneticLassoFieldFlipY: boolean;
  readonly pixelMagneticFieldRunIdRef: MutableRefObject<number>;
  readonly pixelMagneticFieldStateRef: MutableRefObject<StudioMagneticLassoFieldState>;
  readonly fieldLoadFailedMessage: () => string;
}): void {
  if (!magneticLassoFieldKey || !magneticLassoFieldSrc || !selectedImageElementId) {
    pixelMagneticFieldRunIdRef.current += 1;
    pixelMagneticFieldStateRef.current = { status: "disabled" };
    return;
  }
  const cached = pixelMagneticFieldStateRef.current;
  if (cached.status === "ready" && cached.key === magneticLassoFieldKey) return;
  const runId = ++pixelMagneticFieldRunIdRef.current;
  pixelMagneticFieldStateRef.current = { status: "loading", key: magneticLassoFieldKey };
  void (async () => {
    try {
      const { sampleImageLuminanceField } = await loadStudioPixelEditBrushRuntime();
      const field = await sampleImageLuminanceField(magneticLassoFieldSrc, {
        flipX: magneticLassoFieldFlipX,
        flipY: magneticLassoFieldFlipY,
      });
      if (runId !== pixelMagneticFieldRunIdRef.current) return;
      pixelMagneticFieldStateRef.current = { status: "ready", key: magneticLassoFieldKey, field };
    } catch (error) {
      if (runId !== pixelMagneticFieldRunIdRef.current) return;
      const reason = error instanceof Error && error.message.trim()
        ? error.message.trim()
        : fieldLoadFailedMessage();
      pixelMagneticFieldStateRef.current = { status: "unavailable", key: magneticLassoFieldKey, reason };
    }
  })();
}
