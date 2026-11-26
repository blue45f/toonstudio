import type { MutableRefObject } from "react";
import type { StudioLineNodeLike, StudioReadonlyRef } from "../canvas/studio-stage-handle-types";

import {
  normalizeStudioDrawingAssistDocument,
  type StudioDrawingAssistDocument,
} from "../brush/studio-drawing-assist-document";
import { CANVAS_W } from "../studio-assets";
import type { El, ImageEl } from "../studio-element-model";
import {
  createFixedRateStrokeFramePump,
  type FixedRateStrokeFramePump,
} from "../studio-fixed-rate-stroke-frame-pump";
import {
  isEffectivelyHidden,
  isEffectivelyLocked,
  type LayerGroup,
} from "../studio-layers";
import { studioLinked3dPassDestructiveEditReason } from "../studio-linked-3d-raster-edit-policy";
import type { StudioLiquifyMode } from "../studio-liquify-contract";
import {
  resolveStudioMagneticLassoGesture,
  studioMagneticLassoFieldKey,
  type StudioMagneticLassoFieldState,
  type StudioMagneticLassoGestureResolution,
} from "../studio-magnetic-lasso-authority";
import type { PixelSelectionHistory } from "../studio-pixel-selection-history";
import {
  bindPixelSelectionHistory,
  commitPixelSelectionHistory,
  type PixelSelectionHistoryOperation,
} from "../studio-pixel-selection-session-history";
import {
  buildQuickMaskTintPixels,
  quickMaskRasterSize,
  selectionToMask,
} from "../studio-quick-mask";
import {
  beginStudioPendingRasterRetouchGesture,
  canApplyStudioPendingRasterRetouchGesture,
  normalizeStudioPendingRasterRetouchGesture,
  type StudioPendingRasterRetouchGesture,
  type StudioRasterRetouchGestureTool,
  type StudioRasterRetouchNormalizedPoint,
} from "../studio-retouch-raster-gesture";
import {
  canvasPointToNormalized,
  selectionOperationBase,
  type PixelSelection,
  type SelectionFrame,
  type SelectionOperationMode,
  type SelectionToolKind,
  type SelPoint,
} from "../studio-selection-tools";
import { studioWorkAssetDestructiveEditReason } from "../studio-work-asset-edit-guard";

export interface StudioPaintRetouchStrokePreviewSession {
  readonly frame: SelectionFrame;
  readonly radiusNorm: number;
  readonly points: SelPoint[];
}

export interface StudioQueuedRasterRetouchReplay {
  readonly liquifyMode: StudioLiquifyMode;
  readonly pageId: string;
  readonly points: readonly StudioRasterRetouchNormalizedPoint[];
  readonly targetId: string;
  readonly tool: StudioRasterRetouchGestureTool;
}

export interface StudioQuickMaskSession {
  elId: string;
  maskW: number;
  maskH: number;
  featherScale: number;
  mask: Uint8ClampedArray;
}

export type StudioPixelSelectionActivationKind =
  | SelectionToolKind
  | "circle"
  | "wand"
  | "quick-select"
  | "color-range";

export function runStudioSchedulePaintRetouchStrokePreview(input: {
  readonly session: StudioPaintRetouchStrokePreviewSession;
  readonly pendingRef: MutableRefObject<StudioPaintRetouchStrokePreviewSession | null>;
  readonly rafRef: MutableRefObject<number | null>;
  readonly lineRef: StudioReadonlyRef<StudioLineNodeLike | null>;
}): void {
  input.pendingRef.current = input.session;
  if (input.rafRef.current !== null) return;
  input.rafRef.current = globalThis.requestAnimationFrame(() => {
    input.rafRef.current = null;
    const pending = input.pendingRef.current;
    const line = input.lineRef.current;
    if (!pending || !line) return;
    const tailStart = Math.max(0, pending.points.length - 64);
    const flat: number[] = [];
    for (let index = tailStart; index < pending.points.length; index += 1) {
      const point = pending.points[index]!;
      flat.push(
        pending.frame.x + point.x * pending.frame.width,
        pending.frame.y + point.y * pending.frame.height,
      );
    }
    if (flat.length === 2) flat.push(flat[0]!, flat[1]!);
    line.points(flat);
    line.strokeWidth(2 * pending.radiusNorm * pending.frame.width);
    line.visible(flat.length > 0);
    line.getLayer()?.batchDraw();
  });
}

export function runStudioCommitPixelSelectionState(input: {
  readonly update: PixelSelection | null | ((current: PixelSelection | null) => PixelSelection | null);
  readonly operation: PixelSelectionHistoryOperation;
  readonly coalesceKey?: string;
  readonly ownerElementId: string | null;
  readonly historyRef: MutableRefObject<PixelSelectionHistory>;
  readonly selectionRef: MutableRefObject<PixelSelection | null>;
  readonly publishHistory: (history: PixelSelectionHistory, selection: PixelSelection | null) => void;
}): boolean {
  const bound = bindPixelSelectionHistory(
    input.historyRef.current,
    input.ownerElementId,
    input.selectionRef.current,
  );
  const current = input.selectionRef.current;
  const next = typeof input.update === "function" ? input.update(current) : input.update;
  const transition = commitPixelSelectionHistory(bound, input.ownerElementId, next, {
    operation: input.operation,
    ...(input.coalesceKey ? { coalesceKey: input.coalesceKey } : {}),
  });
  if (!transition.applied) {
    if (bound !== input.historyRef.current) input.publishHistory(bound, current);
    return false;
  }
  input.publishHistory(transition.history, transition.selection);
  return true;
}

export function runStudioQueuePendingRasterRetouchGesture(input: {
  readonly gesture: StudioPendingRasterRetouchGesture;
  readonly target: { frame: SelectionFrame; id: string };
  readonly pendingGestureRef: MutableRefObject<StudioPendingRasterRetouchGesture | null>;
  readonly pendingTargetRef: MutableRefObject<{ frame: SelectionFrame; id: string } | null>;
  readonly queuedReplayRef: MutableRefObject<StudioQueuedRasterRetouchReplay | null>;
  readonly releaseCapture: (gesture: StudioPendingRasterRetouchGesture) => void;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly requestReplay: () => void;
}): void {
  const points = normalizeStudioPendingRasterRetouchGesture(input.gesture, input.target.frame);
  input.pendingGestureRef.current = null;
  input.pendingTargetRef.current = null;
  input.releaseCapture(input.gesture);
  if (!canApplyStudioPendingRasterRetouchGesture(input.gesture, points)) {
    input.announceDrawingShortcut(
      input.gesture.cancelled
        ? "편집용 복사본은 준비했지만 취소한 리터치 제스처는 적용하지 않았어요"
        : "리터치 횟을 적용하려면 캔버스 위를 조금 더 드래그해 주세요",
    );
    return;
  }
  input.queuedReplayRef.current = {
    liquifyMode: input.gesture.liquifyMode,
    pageId: input.gesture.pageId,
    points,
    targetId: input.target.id,
    tool: input.gesture.tool,
  };
  input.requestReplay();
}

export function runStudioAttachPendingRasterRetouchTarget(input: {
  readonly runId: number;
  readonly target: { frame: SelectionFrame; id: string };
  readonly pendingGestureRef: MutableRefObject<StudioPendingRasterRetouchGesture | null>;
  readonly pendingTargetRef: MutableRefObject<{ frame: SelectionFrame; id: string } | null>;
  readonly clearPendingGesture: () => void;
  readonly queuePendingGesture: (
    gesture: StudioPendingRasterRetouchGesture,
    target: { frame: SelectionFrame; id: string },
  ) => void;
  readonly announceDrawingShortcut: (message: string) => void;
}): void {
  const gesture = input.pendingGestureRef.current;
  if (!gesture || gesture.runId !== input.runId || gesture.cancelled) {
    if (gesture?.runId === input.runId) input.clearPendingGesture();
    return;
  }
  input.pendingTargetRef.current = input.target;
  if (gesture.released) {
    input.queuePendingGesture(gesture, input.target);
  } else {
    input.announceDrawingShortcut("편집용 복사본을 준비했어요 · 진행 중인 첫 리터치 횟을 계속 이어갑니다");
  }
}

export function resolveStudioCurrentMagneticLassoField(input: {
  readonly target: ImageEl;
  readonly pixelMagneticLasso: boolean;
  readonly pixelTool: SelectionToolKind | "wand" | "quick-select" | null;
  readonly fieldState: StudioMagneticLassoFieldState;
}): StudioMagneticLassoGestureResolution {
  const selectedKey = input.pixelMagneticLasso
    && (input.pixelTool === "lasso" || input.pixelTool === "poly-lasso")
    ? studioMagneticLassoFieldKey(
        input.target.id,
        input.target.src,
        Boolean(input.target.flipped),
        Boolean(input.target.flippedY),
      )
    : null;
  return resolveStudioMagneticLassoGesture(selectedKey, input.fieldState);
}

export function runStudioPreviewDrawingAssistDocument(input: {
  readonly update: (current: StudioDrawingAssistDocument) => StudioDrawingAssistDocument;
  readonly blocked: boolean;
  readonly current: {
    readonly page: { readonly id: string; readonly canvasH: number; readonly drawingAssist?: StudioDrawingAssistDocument };
    readonly document: StudioDrawingAssistDocument;
  } | null;
  readonly setPreview: (preview: {
    pageId: string;
    source: StudioDrawingAssistDocument | undefined;
    document: StudioDrawingAssistDocument;
  } | null) => void;
}): void {
  if (input.blocked) {
    input.setPreview(null);
    return;
  }
  if (!input.current) return;
  const next = normalizeStudioDrawingAssistDocument(input.update(input.current.document), {
    canvasWidth: CANVAS_W,
    canvasHeight: input.current.page.canvasH,
  });
  input.setPreview({
    pageId: input.current.page.id,
    source: input.current.page.drawingAssist,
    document: next,
  });
}

export async function runStudioQuickSelectionStrokeStart<TTicket, TSession extends {
  elId: string;
  frame: SelectionFrame;
  points: SelPoint[];
  radiusNorm: number;
  target: ImageEl & El;
  base: PixelSelection | null;
  combine: SelectionOperationMode;
  mutationTicket: TTicket;
  scanInFlight: boolean;
  scanQueued: boolean;
  finished: boolean;
}>(input: {
  readonly target: ImageEl & El;
  readonly pos: { x: number; y: number };
  readonly frame: SelectionFrame;
  readonly immediate: boolean;
  readonly reviewLocked: boolean;
  readonly groups: LayerGroup[];
  readonly pixelBrushRadius: number;
  readonly currentSelection: PixelSelection | null;
  readonly pixelCombine: SelectionOperationMode;
  readonly quickSelectDragRef: MutableRefObject<TSession | null>;
  readonly captureMutationTicket: () => TTicket;
  readonly setError: (message: string) => void;
  readonly setPixelBusy: (busy: boolean) => void;
  readonly finishSession: (session: TSession) => Promise<void>;
  readonly scanSession: (session: TSession) => Promise<void>;
}): Promise<void> {
  if (
    input.reviewLocked
    || isEffectivelyLocked(input.target, input.groups)
    || isEffectivelyHidden(input.target, input.groups)
  ) {
    input.setError("빠른 선택 대상 레이어의 표시·잠금 상태를 확인해 주세요.");
    return;
  }
  const start = canvasPointToNormalized(input.pos.x, input.pos.y, input.frame);
  const session = {
    elId: input.target.id,
    frame: input.frame,
    points: [start],
    radiusNorm: input.pixelBrushRadius / Math.max(1, input.frame.width),
    target: input.target,
    base: selectionOperationBase(input.currentSelection, input.pixelCombine),
    combine: input.pixelCombine,
    mutationTicket: input.captureMutationTicket(),
    scanInFlight: false,
    scanQueued: false,
    finished: false,
  } as TSession;
  if (input.immediate) {
    await input.finishSession(session);
    return;
  }
  input.quickSelectDragRef.current = session;
  input.setPixelBusy(true);
  await input.scanSession(session);
}

export function runStudioRefreshQuickMaskTint(input: {
  readonly session: StudioQuickMaskSession | null;
  readonly color: string;
  readonly opacity: number;
  readonly setTintCanvas: (canvas: HTMLCanvasElement | null) => void;
}): void {
  if (!input.session) {
    input.setTintCanvas(null);
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = input.session.maskW;
  canvas.height = input.session.maskH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(input.session.maskW, input.session.maskH);
  image.data.set(
    buildQuickMaskTintPixels(input.session.mask, input.session.maskW, input.session.maskH, {
      color: input.color,
      opacity: input.opacity,
    }),
  );
  ctx.putImageData(image, 0, 0);
  input.setTintCanvas(canvas);
}

export function runStudioEnterQuickMask(input: {
  readonly selected: El | null;
  readonly selectedImageMutationLocked: boolean;
  readonly currentSelection: PixelSelection | null;
  readonly quickMaskSessionRef: MutableRefObject<StudioQuickMaskSession | null>;
  readonly disarmAllPixelTools: () => void;
  readonly setQuickMaskActive: (active: boolean) => void;
  readonly refreshQuickMaskTint: () => void;
  readonly announceDrawingShortcut: (message: string) => void;
}): void {
  if (input.selected?.type !== "image" || input.selectedImageMutationLocked) return;
  input.disarmAllPixelTools();
  const { width: maskW, height: maskH } = quickMaskRasterSize(
    input.selected.width,
    input.selected.height,
  );
  const featherScale = input.selected.width > 0 ? maskW / input.selected.width : 1;
  input.quickMaskSessionRef.current = {
    elId: input.selected.id,
    maskW,
    maskH,
    featherScale,
    mask: selectionToMask(input.currentSelection, maskW, maskH, { featherScale }),
  };
  input.setQuickMaskActive(true);
  input.refreshQuickMaskTint();
  input.announceDrawingShortcut("퀵 마스크 · 브러시로 선택 영역을 칠하세요 (Q로 완료)");
}

export function acquireStudioFixedRateStrokePump(input: {
  readonly pumpRef: MutableRefObject<FixedRateStrokeFramePump | null>;
  readonly frameCallbackRef: MutableRefObject<(frameTimeStamp: number) => boolean>;
  readonly onErrorFallback: () => void;
}): FixedRateStrokeFramePump {
  input.pumpRef.current ??= createFixedRateStrokeFramePump({
    requestFrame: (callback) => globalThis.requestAnimationFrame(callback),
    cancelFrame: (handle) => globalThis.cancelAnimationFrame(handle),
    onFrame: (frameTimeStamp) => input.frameCallbackRef.current(frameTimeStamp),
    onError: input.onErrorFallback,
  });
  return input.pumpRef.current;
}

export function runStudioJournalPendingRasterRetouchGesture(input: {
  readonly preparation: { readonly runId: number; readonly tool: StudioRasterRetouchGestureTool } | null;
  readonly pendingGestureRef: MutableRefObject<StudioPendingRasterRetouchGesture | null>;
  readonly captureTargetRef: MutableRefObject<Element | null>;
  readonly liquifyMode: StudioLiquifyMode;
  readonly currentPageId: string;
  readonly position: { x: number; y: number };
  readonly event: PointerEvent;
  readonly captureFallback: Element | null;
  readonly announceDrawingShortcut: (message: string) => void;
}): boolean {
  if (!input.preparation || input.pendingGestureRef.current) return false;
  const gesture = beginStudioPendingRasterRetouchGesture({
    liquifyMode: input.liquifyMode,
    pageId: input.currentPageId,
    point: input.position,
    pointer: input.event,
    runId: input.preparation.runId,
    tool: input.preparation.tool,
  });
  if (!gesture) return false;
  const captureTarget = input.event.target instanceof Element
    ? input.event.target
    : input.captureFallback;
  input.pendingGestureRef.current = gesture;
  input.captureTargetRef.current = captureTarget;
  try {
    captureTarget?.setPointerCapture(gesture.pointerId);
  } catch {
    // 전역 capture pointerup 리스너가 안전망 역할을 유지한다.
  }
  input.announceDrawingShortcut("편집용 복사본을 준비하는 동안 첫 리터치 횟을 안전하게 이어갈게요");
  return true;
}

export function countStudioEditableRasterTargets(
  elements: readonly El[],
  groups: LayerGroup[],
): number {
  return elements.filter(
    (element) =>
      element.type === "image"
      && !isEffectivelyHidden(element, groups)
      && !isEffectivelyLocked(element, groups)
      && !studioWorkAssetDestructiveEditReason(element)
      && !studioLinked3dPassDestructiveEditReason(element)
      && !element.isAnimatedGif
      && (element.frames?.length ?? 0) <= 1,
  ).length;
}

export function resolveStudioEnsurePixelToolTarget(input: {
  readonly toolLabel: string;
  readonly activeSurfaceReviewLocked: boolean;
  readonly selected: El | null;
  readonly selectedImageMutationLocked: boolean;
  readonly elements: readonly El[];
  readonly groups: LayerGroup[];
  readonly setMarqueeIds: (ids: string[]) => void;
  readonly setSelectedId: (id: string | null) => void;
  readonly setError: (message: string | null) => void;
}): ImageEl | null {
  if (input.activeSurfaceReviewLocked) {
    input.setError("현재 작업면의 검토 잠금을 먼저 해제하세요.");
    return null;
  }
  if (input.selected?.type === "image") {
    if (input.selectedImageMutationLocked) {
      input.setError("선택한 이미지 레이어의 편집 잠금을 먼저 해제하세요.");
      return null;
    }
    return input.selected;
  }
  const candidates = input.elements.filter(
    (el): el is ImageEl =>
      el.type === "image"
      && !isEffectivelyHidden(el, input.groups)
      && !isEffectivelyLocked(el, input.groups)
      && !studioLinked3dPassDestructiveEditReason(el)
      && !studioWorkAssetDestructiveEditReason(el),
  );
  if (candidates.length === 1) {
    input.setMarqueeIds([]);
    input.setSelectedId(candidates[0]!.id);
    input.setError(null);
    return candidates[0]!;
  }
  input.setError(
    candidates.length === 0
      ? `${input.toolLabel}은(는) 이미지 레이어에 적용해요. 이미지를 먼저 추가하세요.`
      : `${input.toolLabel} 대상을 먼저 고르세요 — 편집 가능한 이미지가 ${candidates.length}장 있어요.`,
  );
  return null;
}
