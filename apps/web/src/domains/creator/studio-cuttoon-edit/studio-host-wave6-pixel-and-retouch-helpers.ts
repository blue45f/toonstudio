import type Konva from "konva";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { StudioAdvancedFillPreview } from "../studio-advanced-fill-preview";
import type { StudioAdvancedFillSettings } from "../studio-advanced-fill-settings";
import type { ColorRangeSample } from "../studio-color-range";
import type { ColorDropSession } from "../studio-colordrop-gesture";
import { bindStudioAdvancedFillRun } from "../studio-cuttoon-editor/studio-cuttoon-advanced-fill-run";
import type { El } from "../studio-element-model";
import { isEffectivelyHidden, isEffectivelyLocked, type LayerGroup } from "../studio-layers";
import { studioLinked3dPassDestructiveEditReason } from "../studio-linked-3d-raster-edit-policy";
import { acquireProductStudioUiPreferencesRepository } from "../studio-legacy-editor-runtime-helpers";
import type { StudioLiquifyMode } from "../studio-liquify-contract";
import {
  bindPixelSelectionHistory,
  createPixelSelectionHistory,
  type PixelSelectionHistoryOperation,
} from "../studio-pixel-selection-session-history";
import type {
  StudioPendingRasterRetouchGesture,
  StudioRasterRetouchGestureTool,
  StudioRasterRetouchNormalizedPoint,
} from "../studio-retouch-raster-gesture";
import {
  commitPolyLassoSession,
  selectionOperationBase,
  type PixelSelection,
  type PolyLassoSession,
  type SelectionFrame,
  type SelectionOperationMode,
  type SelectionToolKind,
} from "../studio-selection-tools";
import { studioWorkAssetDestructiveEditReason } from "../studio-work-asset-edit-guard";
import type {
  StudioPendingPixelSelectionRasterGesture,
  StudioPixelDragSession,
} from "./studio-host-liquify-and-selection-pointer-helpers";

type StudioPixelSelectionHistory = ReturnType<typeof createPixelSelectionHistory>;
type StudioAdvancedFillRunHostInput = Parameters<typeof bindStudioAdvancedFillRun>[0];
interface StudioQueuedRasterRetouchReplayItem {
  readonly liquifyMode: StudioLiquifyMode;
  readonly pageId: string;
  readonly points: readonly StudioRasterRetouchNormalizedPoint[];
  readonly targetId: string;
  readonly tool: StudioRasterRetouchGestureTool;
}

export function runStudioSelectionOwnerResetEffect({
  pixelSelectionAutoTargetRef, selectedImageElementId, cancelLiquifyPointerSession,
  cancelPixelSelectionPointerSession, clearPendingPixelSelectionRasterGesture,
  clearPolyLassoDraft, pixelSelectionDocumentHistoryOwnsLatestEditRef,
  pixelSelectionHistoryRef, pixelSelRef, setPixelSelectionHistory, setPixelSel,
  setPixelBusy, pixelWandRunIdRef, pixelWandActiveRunIdRef, quickSelectRunIdRef,
  quickSelectActiveRunIdRef, quickSelectDragRef, colorRangeRunIdRef,
  colorRangeAbortRef, colorRangeActiveRunIdRef, setColorRangeSamples,
}: {
  readonly pixelSelectionAutoTargetRef: MutableRefObject<string | null>;
  readonly selectedImageElementId: string | null;
  readonly cancelLiquifyPointerSession: () => void;
  readonly cancelPixelSelectionPointerSession: () => void;
  readonly clearPendingPixelSelectionRasterGesture: () => void;
  readonly clearPolyLassoDraft: () => void;
  readonly pixelSelectionDocumentHistoryOwnsLatestEditRef: MutableRefObject<boolean>;
  readonly pixelSelectionHistoryRef: MutableRefObject<StudioPixelSelectionHistory>;
  readonly pixelSelRef: MutableRefObject<PixelSelection | null>;
  readonly setPixelSelectionHistory: Dispatch<SetStateAction<StudioPixelSelectionHistory>>;
  readonly setPixelSel: Dispatch<SetStateAction<PixelSelection | null>>;
  readonly setPixelBusy: Dispatch<SetStateAction<boolean>>;
  readonly pixelWandRunIdRef: MutableRefObject<number>;
  readonly pixelWandActiveRunIdRef: MutableRefObject<number | null>;
  readonly quickSelectRunIdRef: MutableRefObject<number>;
  readonly quickSelectActiveRunIdRef: MutableRefObject<number | null>;
  readonly quickSelectDragRef: MutableRefObject<unknown>;
  readonly colorRangeRunIdRef: MutableRefObject<number>;
  readonly colorRangeAbortRef: MutableRefObject<AbortController | null>;
  readonly colorRangeActiveRunIdRef: MutableRefObject<number | null>;
  readonly setColorRangeSamples: Dispatch<SetStateAction<ColorRangeSample[]>>;
}): void {
  const autoTargetId = pixelSelectionAutoTargetRef.current;
  pixelSelectionAutoTargetRef.current = null;
  const keepAutoTargetGesture = autoTargetId !== null && autoTargetId === selectedImageElementId;
  cancelLiquifyPointerSession();
  if (!keepAutoTargetGesture) {
    cancelPixelSelectionPointerSession();
    clearPendingPixelSelectionRasterGesture();
    clearPolyLassoDraft();
  }
  pixelSelectionDocumentHistoryOwnsLatestEditRef.current = false;
  const history = keepAutoTargetGesture
    ? bindPixelSelectionHistory(
        pixelSelectionHistoryRef.current,
        selectedImageElementId,
        pixelSelRef.current,
      )
    : createPixelSelectionHistory(
        selectedImageElementId,
        null,
        pixelSelectionHistoryRef.current.limits,
      );
  const nextSelection = keepAutoTargetGesture
    ? history.present?.selection ?? pixelSelRef.current
    : null;
  pixelSelectionHistoryRef.current = history;
  pixelSelRef.current = nextSelection;
  setPixelSelectionHistory(history);
  setPixelSel(nextSelection);
  if (!keepAutoTargetGesture) {
    setPixelBusy(false);
    pixelWandRunIdRef.current += 1;
    pixelWandActiveRunIdRef.current = null;
    quickSelectRunIdRef.current += 1;
    quickSelectActiveRunIdRef.current = null;
    quickSelectDragRef.current = null;
  }
  colorRangeRunIdRef.current += 1;
  colorRangeAbortRef.current?.abort();
  colorRangeAbortRef.current = null;
  colorRangeActiveRunIdRef.current = null;
  setColorRangeSamples([]);
}

export function runStudioPixelSelectionGlobalEndEffect({
  pixelSelectionPointerGlobalEndRef, pixelSelectionHandledNativeEndEventsRef,
  pixelDragRef, releasePixelSelectionPointerCapture, pendingPixelDragRef, pixelDragRafRef,
}: {
  readonly pixelSelectionPointerGlobalEndRef: MutableRefObject<(event: PointerEvent, cancelled: boolean) => boolean>;
  readonly pixelSelectionHandledNativeEndEventsRef: MutableRefObject<WeakSet<Event>>;
  readonly pixelDragRef: MutableRefObject<StudioPixelDragSession | null>;
  readonly releasePixelSelectionPointerCapture: (session?: StudioPixelDragSession | null) => void;
  readonly pendingPixelDragRef: MutableRefObject<unknown>;
  readonly pixelDragRafRef: MutableRefObject<number | null>;
}): () => void {
  const onPointerUp = (event: PointerEvent) => {
    if (!pixelSelectionPointerGlobalEndRef.current(event, false)) return;
    pixelSelectionHandledNativeEndEventsRef.current.add(event);
  };
  const onPointerCancel = (event: PointerEvent) => {
    if (!pixelSelectionPointerGlobalEndRef.current(event, true)) return;
    pixelSelectionHandledNativeEndEventsRef.current.add(event);
  };
  globalThis.addEventListener("pointerup", onPointerUp, true);
  globalThis.addEventListener("pointercancel", onPointerCancel, true);
  globalThis.addEventListener("lostpointercapture", onPointerCancel, true);
  return () => {
    globalThis.removeEventListener("pointerup", onPointerUp, true);
    globalThis.removeEventListener("pointercancel", onPointerCancel, true);
    globalThis.removeEventListener("lostpointercapture", onPointerCancel, true);
    const session = pixelDragRef.current;
    pixelDragRef.current = null;
    releasePixelSelectionPointerCapture(session);
    pendingPixelDragRef.current = null;
    if (pixelDragRafRef.current !== null) {
      globalThis.cancelAnimationFrame(pixelDragRafRef.current);
      pixelDragRafRef.current = null;
    }
  };
}

export function runStudioLiquifyGlobalEndEffect({
  liquifyPointerGlobalEndRef, liquifyHandledNativeEndEventsRef, cancelLiquifyPointerSession,
}: {
  readonly liquifyPointerGlobalEndRef: MutableRefObject<(event: PointerEvent, cancelled: boolean) => boolean>;
  readonly liquifyHandledNativeEndEventsRef: MutableRefObject<WeakSet<Event>>;
  readonly cancelLiquifyPointerSession: () => void;
}): () => void {
  const onPointerUp = (event: PointerEvent) => {
    if (!liquifyPointerGlobalEndRef.current(event, false)) return;
    liquifyHandledNativeEndEventsRef.current.add(event);
  };
  const onPointerCancel = (event: PointerEvent) => {
    if (!liquifyPointerGlobalEndRef.current(event, true)) return;
    liquifyHandledNativeEndEventsRef.current.add(event);
  };
  globalThis.addEventListener("pointerup", onPointerUp, true);
  globalThis.addEventListener("pointercancel", onPointerCancel, true);
  globalThis.addEventListener("lostpointercapture", onPointerCancel, true);
  return () => {
    globalThis.removeEventListener("pointerup", onPointerUp, true);
    globalThis.removeEventListener("pointercancel", onPointerCancel, true);
    globalThis.removeEventListener("lostpointercapture", onPointerCancel, true);
    cancelLiquifyPointerSession();
  };
}

export function runStudioRasterPrepUnmountCleanup({
  studioFilterPreparationRunIdRef, studioFilterPreparationAbortRef,
  pixelMarqueeRasterPreparationRunIdRef, pixelMarqueeRasterPreparationAbortRef,
  pixelMarqueeRasterPreparationActivationRef, setPixelBusy,
  studioRasterRetouchPreparationRef, pendingRasterRetouchGestureRef,
  pendingRasterRetouchTargetRef, queuedRasterRetouchReplayRef,
  pendingRasterRetouchCaptureTargetRef, pendingPixelSelectionRasterGestureRef,
}: {
  readonly studioFilterPreparationRunIdRef: MutableRefObject<number>;
  readonly studioFilterPreparationAbortRef: MutableRefObject<AbortController | null>;
  readonly pixelMarqueeRasterPreparationRunIdRef: MutableRefObject<number>;
  readonly pixelMarqueeRasterPreparationAbortRef: MutableRefObject<AbortController | null>;
  readonly pixelMarqueeRasterPreparationActivationRef: MutableRefObject<{
    forceCircle: boolean;
    runId: number;
    tool: SelectionToolKind | "wand" | "quick-select";
  } | null>;
  readonly setPixelBusy: Dispatch<SetStateAction<boolean>>;
  readonly studioRasterRetouchPreparationRef: MutableRefObject<{ runId: number; tool: StudioRasterRetouchGestureTool } | null>;
  readonly pendingRasterRetouchGestureRef: MutableRefObject<StudioPendingRasterRetouchGesture | null>;
  readonly pendingRasterRetouchTargetRef: MutableRefObject<{ frame: SelectionFrame; id: string } | null>;
  readonly queuedRasterRetouchReplayRef: MutableRefObject<StudioQueuedRasterRetouchReplayItem | null>;
  readonly pendingRasterRetouchCaptureTargetRef: MutableRefObject<Element | null>;
  readonly pendingPixelSelectionRasterGestureRef: MutableRefObject<StudioPendingPixelSelectionRasterGesture | null>;
}): () => void {
  return () => {
    studioFilterPreparationRunIdRef.current += 1;
    studioFilterPreparationAbortRef.current?.abort();
    studioFilterPreparationAbortRef.current = null;
    pixelMarqueeRasterPreparationRunIdRef.current += 1;
    pixelMarqueeRasterPreparationAbortRef.current?.abort();
    pixelMarqueeRasterPreparationAbortRef.current = null;
    pixelMarqueeRasterPreparationActivationRef.current = null;
    setPixelBusy(false);
    studioRasterRetouchPreparationRef.current = null;
    const retouchPending = pendingRasterRetouchGestureRef.current;
    pendingRasterRetouchGestureRef.current = null;
    pendingRasterRetouchTargetRef.current = null;
    queuedRasterRetouchReplayRef.current = null;
    const retouchCaptureTarget = pendingRasterRetouchCaptureTargetRef.current;
    pendingRasterRetouchCaptureTargetRef.current = null;
    if (retouchCaptureTarget) {
      try {
        const pointerId = (retouchPending as { pointerId?: number } | null)?.pointerId;
        if (pointerId !== undefined && retouchCaptureTarget.hasPointerCapture(pointerId)) {
          retouchCaptureTarget.releasePointerCapture(pointerId);
        }
      } catch {
        // 라우트 종료 중 브라우저가 이미 포인터 캡처를 해제했을 수 있다.
      }
    }
    const pending = pendingPixelSelectionRasterGestureRef.current;
    pendingPixelSelectionRasterGestureRef.current = null;
    if (pending?.captureTarget) {
      try {
        if (pending.captureTarget.hasPointerCapture(pending.pointerId)) {
          pending.captureTarget.releasePointerCapture(pending.pointerId);
        }
      } catch {
        // 라우트 종료 중 브라우저가 이미 포인터 캡처를 해제했을 수 있다.
      }
    }
  };
}

export function runStudioQueuedRasterRetouchReplayEffect({
  queuedRasterRetouchReplayRef, currentPageIdRef, activeElementsRef,
  setError, applyQueuedRasterRetouchReplayRef,
}: {
  readonly queuedRasterRetouchReplayRef: MutableRefObject<StudioQueuedRasterRetouchReplayItem | null>;
  readonly currentPageIdRef: MutableRefObject<string>;
  readonly activeElementsRef: MutableRefObject<readonly El[]>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly applyQueuedRasterRetouchReplayRef: MutableRefObject<(input: {
    liquifyMode: StudioLiquifyMode;
    points: readonly StudioRasterRetouchNormalizedPoint[];
    targetId: string;
    tool: StudioRasterRetouchGestureTool;
  }) => void>;
}): void {
  const queued = queuedRasterRetouchReplayRef.current;
  queuedRasterRetouchReplayRef.current = null;
  if (!queued) return;
  if (
    queued.pageId !== currentPageIdRef.current
    || !activeElementsRef.current.some(
      (element) => element.id === queued.targetId && element.type === "image",
    )
  ) {
    setError("편집용 래스터 복사본이 바뀌어 첫 리터치 제스처를 적용하지 않았습니다.");
    return;
  }
  applyQueuedRasterRetouchReplayRef.current(queued);
}

export function runStudioAdvancedFillColorDropCommit({
  payload, tolerance, advancedFillColorDropPreviewBusyRef,
  advancedFillColorDropPreviewPendingRef, advancedFillColorDropPreviewToleranceRef,
  advancedFillRunIdRef, advancedFillAbortRef, setAdvancedFillBusy,
  advancedFillSettingsRef, advancedFillUserRevisionRef, setAdvancedFillSettingsState,
  setAppSettingsPersistenceState, studioAdvancedFillRunHost,
}: {
  readonly payload: { position: { x: number; y: number }; frame: SelectionFrame };
  readonly tolerance: number;
  readonly advancedFillColorDropPreviewBusyRef: MutableRefObject<boolean>;
  readonly advancedFillColorDropPreviewPendingRef: MutableRefObject<{
    payload: { position: { x: number; y: number }; frame: SelectionFrame };
    tolerance: number;
  } | null>;
  readonly advancedFillColorDropPreviewToleranceRef: MutableRefObject<number | null>;
  readonly advancedFillRunIdRef: MutableRefObject<number>;
  readonly advancedFillAbortRef: MutableRefObject<AbortController | null>;
  readonly setAdvancedFillBusy: Dispatch<SetStateAction<boolean>>;
  readonly advancedFillSettingsRef: MutableRefObject<StudioAdvancedFillSettings>;
  readonly advancedFillUserRevisionRef: MutableRefObject<number>;
  readonly setAdvancedFillSettingsState: Dispatch<SetStateAction<StudioAdvancedFillSettings>>;
  readonly setAppSettingsPersistenceState: (state: "session-only") => void;
  readonly studioAdvancedFillRunHost: StudioAdvancedFillRunHostInput;
}): Promise<void> {
  const supersededPreview = advancedFillColorDropPreviewBusyRef.current;
  if (supersededPreview) {
    advancedFillColorDropPreviewBusyRef.current = false;
    advancedFillColorDropPreviewPendingRef.current = null;
    advancedFillColorDropPreviewToleranceRef.current = null;
    advancedFillRunIdRef.current += 1;
    advancedFillAbortRef.current?.abort();
    advancedFillAbortRef.current = null;
    setAdvancedFillBusy(false);
  }
  const next: StudioAdvancedFillSettings = {
    ...advancedFillSettingsRef.current,
    tolerance,
  };
  advancedFillUserRevisionRef.current += 1;
  advancedFillSettingsRef.current = next;
  setAdvancedFillSettingsState(next);
  void acquireProductStudioUiPreferencesRepository()
    .then((repository) => repository.saveAdvancedFillSettings(next))
    .catch(() => setAppSettingsPersistenceState("session-only"));
  return bindStudioAdvancedFillRun({
    ...studioAdvancedFillRunHost,
    ...(supersededPreview ? { advancedFillBusy: false } : null),
    advancedFillPreview: null,
    advancedFillSettings: next,
  })(payload.position, payload.frame);
}

export function runStudioPreviewAdvancedFillColorDrop({
  payload, tolerance, advancedFillColorDropPreviewToleranceRef,
  advancedFillColorDropPreviewBusyRef, advancedFillColorDropPreviewPendingRef,
  studioAdvancedFillRunHost, advancedFillSettingsRef, advancedFillColorDropRef,
  retryPreview,
}: {
  readonly payload: { position: { x: number; y: number }; frame: SelectionFrame };
  readonly tolerance: number;
  readonly advancedFillColorDropPreviewToleranceRef: MutableRefObject<number | null>;
  readonly advancedFillColorDropPreviewBusyRef: MutableRefObject<boolean>;
  readonly advancedFillColorDropPreviewPendingRef: MutableRefObject<{
    payload: { position: { x: number; y: number }; frame: SelectionFrame };
    tolerance: number;
  } | null>;
  readonly studioAdvancedFillRunHost: StudioAdvancedFillRunHostInput;
  readonly advancedFillSettingsRef: MutableRefObject<StudioAdvancedFillSettings>;
  readonly advancedFillColorDropRef: MutableRefObject<ColorDropSession | null>;
  readonly retryPreview: (
    payload: { position: { x: number; y: number }; frame: SelectionFrame },
    tolerance: number,
  ) => void;
}): void {
  if (advancedFillColorDropPreviewToleranceRef.current === tolerance) return;
  if (advancedFillColorDropPreviewBusyRef.current) {
    advancedFillColorDropPreviewPendingRef.current = { payload, tolerance };
    return;
  }
  advancedFillColorDropPreviewBusyRef.current = true;
  advancedFillColorDropPreviewToleranceRef.current = tolerance;
  void bindStudioAdvancedFillRun({
    ...studioAdvancedFillRunHost,
    advancedFillBusy: false,
    advancedFillPreview: null,
    advancedFillKeepArmed: true,
    advancedFillSettings: { ...advancedFillSettingsRef.current, tolerance },
  })(payload.position, payload.frame).finally(() => {
    advancedFillColorDropPreviewBusyRef.current = false;
    const pending = advancedFillColorDropPreviewPendingRef.current;
    advancedFillColorDropPreviewPendingRef.current = null;
    if (pending && advancedFillColorDropRef.current?.drop.phase === "dragging") {
      retryPreview(pending.payload, pending.tolerance);
    }
  });
}

export function runStudioCancelAdvancedFillColorDropPreview({
  advancedFillColorDropPreviewPendingRef, advancedFillColorDropPreviewBusyRef,
  advancedFillColorDropPreviewToleranceRef, advancedFillRunIdRef,
  advancedFillAbortRef, setAdvancedFillBusy, setAdvancedFillPreview, setAdvancedFillStatus,
}: {
  readonly advancedFillColorDropPreviewPendingRef: MutableRefObject<unknown>;
  readonly advancedFillColorDropPreviewBusyRef: MutableRefObject<boolean>;
  readonly advancedFillColorDropPreviewToleranceRef: MutableRefObject<number | null>;
  readonly advancedFillRunIdRef: MutableRefObject<number>;
  readonly advancedFillAbortRef: MutableRefObject<AbortController | null>;
  readonly setAdvancedFillBusy: Dispatch<SetStateAction<boolean>>;
  readonly setAdvancedFillPreview: Dispatch<SetStateAction<StudioAdvancedFillPreview | null>>;
  readonly setAdvancedFillStatus: Dispatch<SetStateAction<string | null>>;
}): void {
  advancedFillColorDropPreviewPendingRef.current = null;
  const hadPreviewWork =
    advancedFillColorDropPreviewBusyRef.current
    || advancedFillColorDropPreviewToleranceRef.current !== null;
  if (advancedFillColorDropPreviewBusyRef.current) {
    advancedFillColorDropPreviewBusyRef.current = false;
    advancedFillRunIdRef.current += 1;
    advancedFillAbortRef.current?.abort();
    advancedFillAbortRef.current = null;
    setAdvancedFillBusy(false);
  }
  advancedFillColorDropPreviewToleranceRef.current = null;
  if (hadPreviewWork) {
    setAdvancedFillPreview(null);
    setAdvancedFillStatus("드래그가 취소되어 원래 허용 오차로 돌아갔습니다.");
  }
}

export function runStudioFinishPolyLassoSession({
  polyLassoSessionRef, polyLassoOperationRef, clearPolyLassoDraft, commitPixelSelectionState,
}: {
  readonly polyLassoSessionRef: MutableRefObject<PolyLassoSession | null>;
  readonly polyLassoOperationRef: MutableRefObject<SelectionOperationMode>;
  readonly clearPolyLassoDraft: () => void;
  readonly commitPixelSelectionState: (
    next: PixelSelection | null | ((previous: PixelSelection | null) => PixelSelection | null),
    operation: PixelSelectionHistoryOperation,
  ) => void;
}): void {
  const session = polyLassoSessionRef.current;
  const operation = polyLassoOperationRef.current;
  if (!session) return;
  clearPolyLassoDraft();
  if (session.points.length < 3) return;
  commitPixelSelectionState(
    (previous) => (
      commitPolyLassoSession(
        selectionOperationBase(previous, operation),
        session,
      ) ?? previous
    ),
    "poly-lasso",
  );
}

export function resolveStudioPixelToolTargetAvailability({
  activeSurfaceReviewLocked, studioFilterPreparationBusy, selected,
  selectedImageMutationLocked, elements, groups, localHiddenElementIds,
}: {
  readonly activeSurfaceReviewLocked: boolean;
  readonly studioFilterPreparationBusy: boolean;
  readonly selected: El | null | undefined;
  readonly selectedImageMutationLocked: boolean;
  readonly elements: readonly El[];
  readonly groups: LayerGroup[];
  readonly localHiddenElementIds: ReadonlySet<string>;
}): {
  readonly pixelToolTargetAvailable: boolean;
  readonly rasterRetouchTargetAvailable: boolean;
} {
  const pixelToolTargetAvailable =
    !activeSurfaceReviewLocked
    && (
      (selected?.type === "image" && !selectedImageMutationLocked)
      || (selected?.type !== "image"
        && elements.filter(
          (el) => el.type === "image"
            && !isEffectivelyHidden(el, groups)
            && !isEffectivelyLocked(el, groups)
            && !studioLinked3dPassDestructiveEditReason(el)
            && !studioWorkAssetDestructiveEditReason(el),
        ).length === 1)
    );
  const rasterRetouchTargetAvailable =
    !activeSurfaceReviewLocked
    && !studioFilterPreparationBusy
    && (
      pixelToolTargetAvailable
      || (
        selected?.type !== "image"
        && elements.some(
          (element) =>
            !localHiddenElementIds.has(element.id)
            && !isEffectivelyHidden(element, groups),
        )
      )
    );
  return { pixelToolTargetAvailable, rasterRetouchTargetAvailable };
}

export function runStudioClearMarqueePreview({
  pendingMarqueeRectRef, marqueeRafRef, setMarqueeActive, marqueeRectNodeRef,
}: {
  readonly pendingMarqueeRectRef: MutableRefObject<unknown>;
  readonly marqueeRafRef: MutableRefObject<number | null>;
  readonly setMarqueeActive: Dispatch<SetStateAction<boolean>>;
  readonly marqueeRectNodeRef: MutableRefObject<Konva.Rect | null>;
}): void {
  pendingMarqueeRectRef.current = null;
  if (marqueeRafRef.current !== null) {
    globalThis.cancelAnimationFrame(marqueeRafRef.current);
    marqueeRafRef.current = null;
  }
  setMarqueeActive(false);
  const node = marqueeRectNodeRef.current;
  if (node && node.visible()) {
    node.visible(false);
    node.getLayer()?.batchDraw();
  }
}

export function runStudioClearPaintRetouchStrokePreview({
  pendingPaintRetouchStrokePreviewRef, paintRetouchStrokeRafRef, paintRetouchStrokeLineRef,
}: {
  readonly pendingPaintRetouchStrokePreviewRef: MutableRefObject<unknown>;
  readonly paintRetouchStrokeRafRef: MutableRefObject<number | null>;
  readonly paintRetouchStrokeLineRef: MutableRefObject<Konva.Line | null>;
}): void {
  pendingPaintRetouchStrokePreviewRef.current = null;
  if (paintRetouchStrokeRafRef.current !== null) {
    globalThis.cancelAnimationFrame(paintRetouchStrokeRafRef.current);
    paintRetouchStrokeRafRef.current = null;
  }
  const line = paintRetouchStrokeLineRef.current;
  if (line) {
    line.points([]);
    line.visible(false);
    line.getLayer()?.batchDraw();
  }
}

export function runStudioReleasePendingPixelGestureCapture(
  pending: StudioPendingPixelSelectionRasterGesture | null | undefined,
): void {
  if (!pending?.captureTarget) return;
  try {
    if (pending.captureTarget.hasPointerCapture(pending.pointerId)) {
      pending.captureTarget.releasePointerCapture(pending.pointerId);
    }
  } catch {
    // Capture can already be gone after an outside pointerup or browser cancel.
  }
}

export function runStudioReleasePendingRetouchGestureCapture(
  gesture: { readonly pointerId: number } | null | undefined,
  captureTargetRef: MutableRefObject<Element | null>,
): void {
  const target = captureTargetRef.current;
  captureTargetRef.current = null;
  if (!gesture || !target) return;
  try {
    if (target.hasPointerCapture(gesture.pointerId)) {
      target.releasePointerCapture(gesture.pointerId);
    }
  } catch {
    // Capture can already be gone after an outside pointerup or browser cancel.
  }
}

export function runStudioDeselectForEdit({
  pixelTool, pixelSel, setPixelTool, commitPixelSelectionState, clearPolyLassoDraft,
  setSelectedId, setMarqueeIds, setEyedropperActive, announceDrawingShortcut,
}: {
  readonly pixelTool: unknown;
  readonly pixelSel: PixelSelection | null;
  readonly setPixelTool: (next: null) => void;
  readonly commitPixelSelectionState: (next: null, operation: "clear") => void;
  readonly clearPolyLassoDraft: () => void;
  readonly setSelectedId: Dispatch<SetStateAction<string | null>>;
  readonly setMarqueeIds: Dispatch<SetStateAction<string[]>>;
  readonly setEyedropperActive: Dispatch<SetStateAction<boolean>>;
  readonly announceDrawingShortcut: (message: string) => void;
}): void {
  if (pixelTool || pixelSel) {
    setPixelTool(null);
    commitPixelSelectionState(null, "clear");
    clearPolyLassoDraft();
    announceDrawingShortcut("픽셀 선택 해제");
    return;
  }
  setSelectedId(null);
  setMarqueeIds([]);
  setEyedropperActive(false);
  announceDrawingShortcut("선택 해제");
}

export function runStudioToggleSelectedClippingMask({
  selected, setError, patchEl, lockedMessage, announceDrawingShortcut,
}: {
  readonly selected: El | null | undefined;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly patchEl: (id: string, patch: Partial<El>) => boolean;
  readonly lockedMessage: string;
  readonly announceDrawingShortcut: (message: string) => void;
}): void {
  if (!selected || selected.type === "frame") {
    setError("클리핑할 레이어를 먼저 선택하세요.");
    return;
  }
  const clipped = selected.clipBelow === true;
  if (!patchEl(selected.id, { clipBelow: !clipped } as Partial<El>)) {
    setError(lockedMessage);
    return;
  }
  setError(null);
  announceDrawingShortcut(clipped ? "아래 레이어 클리핑 해제" : "아래 레이어에 클리핑");
}
