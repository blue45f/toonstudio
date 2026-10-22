/* Extracted stage pointer handlers from StudioCuttoonEditor.
 * Closures keep the original editor typing envelope via an `any` host bag. */
// @ts-nocheck
"use no memo";
// React Compiler 옵트아웃: 가변 호스트 백(h) 을 렌더마다 재대입해 공유하는 추출 패턴이라,
// 컴파일러가 h 참조 동일성만 보고 JSX/계산을 캐시하면 첫 렌더에서 UI 가 영구 동결된다
// (탭 전환 등 커밋된 상태 변경이 화면에 반영되지 않음).
import { flushSync } from "react-dom";
import { cancelStudioNodeEditPointer, ownsStudioNodeEditPointer } from "../vector/studio-node-edit-pointer-session";

import { resolveStudioCapturedBrushDynamicsPresetId } from "../brush/studio-brush-dynamics";
import {
  advanceStudioBrushVelocityPressure,
  initializeStudioBrushVelocityPressure,
  resolveStudioBrushReleasePressure,
} from "../brush/studio-brush-velocity-pressure";
import { isCompleteStudioDrawOp } from "../brush/studio-draw-completion";
import { studioLiveRetainedMediaOverlaySupportsElement } from "../live/studio-live-retained-media-overlay";
import { planStudioDrawPointerRelease } from "../brush/studio-draw-pointer-release-plan";
import { planStudioDrawPointerStart } from "../brush/studio-draw-pointer-start-plan";
import {
  executeStudioDraftPreviewBackdropBoundary,
  planStudioDraftPreviewBackdropBoundary,
  studioLiveBrushEffectiveDiameter,
  studioLiveBrushPressure,
  studioLiveBrushPressureSamples,
} from "../brush/studio-draw-rendering";
import { requireStudioDrawingPointerTransport } from "../brush/studio-drawing-pointer-transport";
import {
  studioInkFallbackPressure,
} from "../brush/studio-ink-pressure-model";
import { isStudioBrushCursorMode, shouldShowStudioBrushCursor } from "../canvas/studio-canvas-cursor";
import { bubbleShapeCanvasPointToLocal, hasCustomBubbleShape, moveBubbleShapePoint } from "../lettering/studio-bubble-custom-shape";
import { beginStudioAdvancedFillTap, endStudioAdvancedFillTap, moveStudioAdvancedFillTap } from "../studio-advanced-fill-tap";
import { colorDropGestureView, endColorDropSession } from "../studio-colordrop-gesture";
import { resolveActiveStudioAdvancedRuler, type StudioAdvancedRuler } from "../studio-advanced-ruler-document";
import { snapStudioAdvancedRulerStrokePoint } from "../studio-advanced-ruler-snap";
import { CANVAS_W } from "../studio-assets";
import {
  mapStudioDocumentPointToAutoColorSeed,
  sampleStudioAutoColorStrokeSeeds,
  shouldKeepStudioAutoColorStrokeSample,
  STUDIO_AUTO_COLOR_STROKE_MIN_DISTANCE_DOC_DEFAULT,
} from "../studio-auto-color-hints-canvas-seed";
import { normalizeCalligraphyStylusInput, strokeSampleDistanceForScale } from "../studio-brush";
import {
  hasStudioCanonicalVNextQualityShadowRuntime,
  submitStudioCanonicalVNextQualityShadowFinalParity,
} from "../studio-canonical-vnext-quality-shadow";
import { studioElementIdOf } from "../canvas/studio-canvas-shared-runtime";
import { shouldAppendStudioCausalInkSample } from "../studio-causal-ink";
import { shouldOwnStudioCoalescedBatchDraft } from "../studio-coalesced-batch-mutation";
import { COLOR_WHEEL_LONG_PRESS_MS, shouldCancelLongPress } from "../studio-color-wheel";
import {
  studioDrawElementSampleSlice,
  studioDrawElementToCrdtStroke,
} from "../live/studio-crdt-draw-bridge";
import {
  beginCropDrag,
  cropAspectRatio,
  cropHitTolerance,
  hitTestCropHandle,
  updateCropDrag,
} from "../studio-crop";
import { NODE_SMOOTH_DRAG_RANGE_PX, smoothPointsAroundIndex, updateSmoothStrengthDrag } from "../studio-curve-smoothing";
import { planStudioDeferredStrokePostprocess } from "../studio-deferred-stroke-postprocess";
import { containingPanel, elBounds } from "../studio-element-geometry";
import { attachStudioFilterMaskSurfaceAcrossHistory } from "../filter/studio-filter-mask-surface-admission";
import {
  createFixedRateStrokeFilter,
  quantizeFixedRateStrokeSample,
  transitionFixedRateStrokeFilter,
  type FixedRateStrokeFilteredSample,
} from "../studio-fixed-rate-stroke-filter";
import {
  advanceFixedRateStrokeFrameClock,
  advanceFixedRateStrokeSampleClockFloor,
  normalizeFixedRateStrokeSampleTimeStamps,
} from "../studio-fixed-rate-stroke-frame-pump";
import {
  expandSelectionIdsToGroupUnits,
  planAtomicSelectionTranslation,
  selectionShapeForIds,
} from "../studio-group-selection";
import { computeHealCloneSourceOffset, healCloneSourcePoint } from "../studio-heal-clone";
import type { StudioHokusaiLiveCanonicalResult } from "../render/studio-hokusai-live-brush-runtime";
import {
  createStudioHokusaiLiveCanonicalTransaction,
} from "../render/studio-hokusai-live-brush-transaction";
import {
  studioHokusaiSourceRevision,
} from "../render/studio-hokusai-natural-media-contract";
import { uid } from "../studio-id";
import {
  resolveIsometricAxisRay,
  shouldSnapStrokeToIsometricAxis,
  snapStrokePointToIsometricGrid,
} from "../studio-isometric-grid";
import { studioKonvaRuntime as KonvaRuntime } from "../render/studio-konva-runtime";
import { isEffectivelyHidden, isEffectivelyLocked } from "../studio-layers";
import {
  createStudioPixelEditCanvas,
  loadStudioPixelEditImage,
  studioInkGestureTimeOrigin,
} from "../studio-legacy-editor-runtime-helpers";
import { studioLinked3dPassDestructiveEditReason } from "../studio-linked-3d-raster-edit-policy";
import { createStudioLinked3dCorrectionProvenance } from "../studio-linked-3d-render-document";
import {
  appendStudioLiquifyPointerPoint,
  beginStudioLiquifyPointerSession,
  isStudioLiquifyPointerOwner,
} from "../studio-liquify-pointer";
import { studioLiquifyDragMinDistance } from "../studio-liquify-stroke-sampling";
import { resolveStudioLivePublishedCursorTool } from "../live/studio-live-canvas-overlay-model";
import {
  createStudioLivingInkCanonicalTransaction,
  studioLivingInkReceiptReplayToken,
  type StudioLivingInkCanonicalResult,
} from "../studio-living-ink-document";
import { studioLivingInkCoverageIntersectsStroke } from "../studio-living-ink-overlay";
import { studioLivingInkFailureDisposition } from "../studio-living-ink-product-admission";
import type { StudioLivingInkFinishedWork } from "../studio-living-ink-studio-coordinator";
import {
  beginNodeDrag,
  hitTestNodeHandle,
  NODE_EDIT_WIDTH_DRAG_RANGE_PX,
  updateNodeDragMove,
  updateNodeDragWidth,
  withPointMoved,
  withPressureEdited,
} from "../studio-node-edit";
import { snapStudioObjectDragPosition } from "../studio-object-drag-snap";
import { STUDIO_POINTER_PREDICTION_ENABLED } from "../studio-page-shell-runtime";
import { beginPanelSplitDrag, planPanelSplit, previewPanelSplit, type PanelSplitLine } from "../studio-panel-split";
import { normalizeStudioPersistedPointerChannels } from "../studio-persisted-pointer-channels";
import { resolvePerspectiveRay, snapStrokePointToPerspective } from "../studio-perspective-guide";
import {
  isStudioPixelPencilRenderMode,
  shouldAppendStudioPixelPencilSample,
} from "../studio-pixel-pencil";
import {
  beginStudioStrokePointerSession,
  collectStudioStrokePointerBatch,
  isStudioStrokePointerEvent,
  shouldCommitStudioStrokeOnPointerCancel,
  shouldEndStudioStrokeForReleasedContact,
  shouldCancelStudioFingerStrokeForAdditionalContact,
} from "../canvas/studio-pointer-input";
import { canCollectStudioPointerPredictionsForActiveTail } from "../canvas/studio-pointer-prediction-capability";
import {
  planStudioPointerReleaseEndpoint,
  type StudioPointerReleaseEndpointSample,
} from "../canvas/studio-pointer-release-endpoint-plan";
import { planStudioPredictedInkSuffixDraft } from "../studio-predicted-ink-tail";
import { addPuppetPin } from "../studio-puppet-warp";
import { applyMaskStrokeDabs } from "../studio-quick-mask";
import { canPublishStudioRasterLayer } from "../render/studio-raster-layer-write-guard";
import { STUDIO_AUTOMATIC_RASTER_PUBLICATION_ENABLED } from "../render/studio-raster-publication-feature";
import {
  appendStudioRasterRetouchDragPoint,
  thinStudioRasterRetouchPointsForApply,
} from "../render/studio-raster-retouch-stroke-sampling";
import { QUICKSHAPE_KIND_LABELS } from "../studio-quickshape-labels";
import { replaceStudioRawPenInkPreview, syncStudioRawPenInkPreviewAuthority } from "../studio-raw-pen-ink-preview";
import { appendStudioPendingRasterRetouchGesturePoint } from "../studio-retouch-raster-gesture";
import { normalizeMarqueeRect, selectIdsByMarquee } from "../studio-selection";
import {
  appendBrushPointInPlace,
  appendPolyLassoVertex,
  beginPolyLassoSession,
  beginSelectionDrag,
  canvasPointToNormalized,
  isSelectionUsable,
  normalizedPointToCanvas,
  pointInSelection,
  polyLassoCloseToStart,
  resolveSelectionCombineOverride,
  selectionCombineModeForOperation,
  shouldMoveSelectionMarquee,
  snapLassoPointToEdge,
  translateSelection,
  updateSelectionDrag,
  type SelectionFrame,
  type SelPoint,
} from "../studio-selection-tools";
import {
  EMPTY_FREEHAND_OBJECT_SNAP_LATCH,
  EMPTY_SMART_GUIDE_OVERLAY,
  SMART_GUIDE_EPSILON,
  SMART_SNAP_THRESHOLD,
  buildPointObjectSnapOverlay,
  buildSmartGuideOverlay,
  buildSmartGuideOverlayPreview,
  computeSmartSnap,
  planFreehandObjectSnapPoint,
  shouldApplyStrokeObjectSnap,
  shouldMutateStrokeWithObjectSnap,
  snapPointToObjectGuides,
  type GuideBox,
} from "../studio-smart-guides";
import {
  shouldSynchronizeStudioStagePointerPosition,
  snapshotStudioStagePointerBatchMapper,
  type StudioStagePointerBatchMapper,
} from "../canvas/studio-stage-pointer-coordinate";
import { resolveShiftFreehandTransition } from "../brush/studio-stroke-constrain";
import {
  normalizeStudioStrokeGuideScale,
  shouldShowStudioStrokeGuide,
} from "../brush/studio-stroke-guide";
import { resolveStudioStrokeObjectSnapTargets } from "../brush/studio-stroke-object-snap-cache";
import {
  createStudioPointerVelocityState,
  createStudioStrokeStabilizerBridge,
  createStudioStrokeStabilizerState,
  flushStudioStrokeStabilizerEndpoint,
  sampleStudioPointerVelocity,
  stabilizeStudioStrokeSample,
} from "../brush/studio-stroke-stabilizer";
import { claimStudioStrokeSurfaceLifecycle } from "../brush/studio-stroke-surface-route";
import {
  createStudioThinLineInkInputState,
  filterStudioThinLineInkInput,
  flushStudioThinLineInkInput,
  shouldFilterStudioThinLineInkInput,
} from "../studio-thin-line-ink-input-v1";
import { mergeStudioPendingStrokeElements } from "../studio-pending-stroke-durability";
import { studioWorkAssetDestructiveEditReason } from "../studio-work-asset-edit-guard";
import type { StudioCrdtSceneGraphRuntime } from "../live/StudioLiveCollaborationProvider";

import type { StudioCrdtDocument } from "../live/studio-crdt-document";
import type { StudioBackground3DMagicFilterMask } from "../scene-3d/studio-3d-insert-contract";
import type { DrawEl, El, FrameEl, ImageEl } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import type Konva from "konva";

import { isStudioInkInputContractV2 } from "@/shared/lib/studio-ink-input-contract";

import { createStudioCuttoonStagePointerFinishHandler } from "./studio-cuttoon-stage-pointers-finish-handler";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";

export function bindStudioCuttoonStagePointersFinish(
  h: StudioCuttoonStagePointersHost,
  api: StudioCuttoonStagePointersApi,
) {
  const {
    advancedFillTapGestureRef,
    advancedFillColorDropRef,
    setAdvancedFillColorDropView,
    cancelAdvancedFillColorDropPreview,
    advancedFillTapPayloadRef,
    advancedFillTouchPanRef,
    advancedRulerSnapRef,
    announceDrawingShortcut,
    bubbleShapeDragRef,
    bubbleShapeRafRef,
    cancelCanvasSelectionResize,
    causalPostCorrectionStateRef,
    collaborationAccessRef,
    commit,
    expandDeferredStrokeCommitHistory,
    companionRuntimeRef,
    discardDrawingPointerSession,
    draftPreviewStoreRef,
    drawingCrdtStrokeActiveRef,
    drawingGesturePreviewPublisherRef,
    drawingInputSettingsRef,
    drawingPointerTransportRef,
    drawingRef,
    endLiveResourceEdit,
    finalizeLiveStrokeBackendAudit,
    finishLiquifyPointerSession,
    finishPendingRasterRetouchGesture,
    finishPixelSelectionPointerSession,
    flushPendingStrokeCommitsRef,
    freehandObjectSnapLatchRef,
    gpuLiveInkPinnedRef,
    groupResizeRef,
    hokusaiLiveStrokeRef,
    inkMeshLivePreviewRuntimeRef,
    isometricAxisRayRef,
    liquifyDragRef,
    liquifyHandledNativeEndEventsRef,
    liveDraftDirectRef,
    liveDraftVisualRef,
    liveDynamicBrushDraftDirectRef,
    liveDynamicBrushOverlayRendererRef,
    liveRetainedMediaDraftDirectRef,
    liveRetainedMediaOverlayRendererRef,
    liveInkOverlayRendererRef,
    liveStampOverlayRendererRef,
    liveWetInkDraftDirectRef,
    liveWetInkOverlayRendererRef,
    livingInkStrokeRef,
    livingInkWaterNoopStrokeIdsRef,
    masterEditMode,
    noteQuickShapePointerMoved,
    pendingBubbleShapeDraftRef,
    pendingRasterRetouchGestureRef,
    pendingStrokeCommitsRef,
    persistImmediateStrokeEmergencyAutosave,
    perspectiveRayRef,
    pixelDragRef,
    pixelSelectionHandledNativeEndEventsRef,
    postCorrection,
    preserveCorners,
    queueCommittedStrokeSurfaceHandoff,
    queueDeferredStrokeCommit,
    queueDeferredStrokePostprocess,
    quickShapeActive,
    releaseBubbleShapePointerCapture,
    releaseDrawingPointerSession,
    restorePendingStrokeCommits,
    setBubbleShapeDraft,
    setError,
    snapshotQuickShapeTracking,
    stopFixedRateStrokePump,
    stopQuickShapeTracking,
    strokeObjectSnapCacheRef,
    studioCrdtDocumentRef,
    studioCrdtSceneRuntimeRef,
    takePendingStrokeCommits,
    activePage,
    applySmartGuides,
    authorizedWorkAssetScopeId,
    canvasH,
    clearDraftPreview,
    DEFERRED_STROKE_COMMIT_IDLE_MS,
    elements,
    liveBrushPressureSamplesFor,
    liveInkStyleFor,
    scheduleLiveDrawPressure,
    salvageRejectedStroke,
    settleGpuLiveStroke,
    studioAuthUserId,
    studioCrdtOperationSyncReady,
  } = h;
  const cancelCanvasGroupDrag = (...args) => api.cancelCanvasGroupDrag(...args);
  const completeStudioLivingInkRejectedNoop = (...args) =>
    api.completeStudioLivingInkRejectedNoop(...args);
  const finishStudioSpecialistStroke = (...args) => api.finishStudioSpecialistStroke(...args);
  const hideBrushCursor = (...args) => api.hideBrushCursor(...args);
  const queueStudioRasterDrawPromotion = (...args) => api.queueStudioRasterDrawPromotion(...args);
  const finishDrawingPointer = createStudioCuttoonStagePointerFinishHandler(h, api);
  function onStagePointerCancel(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const pointerEvent = e.evt as PointerEvent;
    if (h.nodeEditDragRef.current) {
      if (ownsStudioNodeEditPointer(h.nodeEditDragRef.current, pointerEvent)) cancelStudioNodeEditPointer(h);
      return;
    }
    hideBrushCursor();
    if (groupResizeRef.current) {
      cancelCanvasSelectionResize();
      return;
    }
    if (liquifyHandledNativeEndEventsRef.current.delete(pointerEvent)) return;
    if (pixelSelectionHandledNativeEndEventsRef.current.delete(pointerEvent)) return;
    if (requireStudioDrawingPointerTransport(drawingPointerTransportRef).consumeHandledNativeEnd(pointerEvent)) return;
    if (pendingRasterRetouchGestureRef.current) {
      if (!finishPendingRasterRetouchGesture(pointerEvent, true, e.target.getStage())) return;
      return;
    }
    const pointerId = Number.isFinite(pointerEvent.pointerId) ? pointerEvent.pointerId : 1;
    // Drawing owns its matching cancel before any stale tool session can early-return. A foreign
    // pointer (typically a palm) cannot cancel the pen that opened the stroke.
    const drawingPointerSession = requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
    if (drawingRef.current || drawingPointerSession) {
      if (drawingPointerSession && !isStudioStrokePointerEvent(drawingPointerSession, pointerEvent)) {
        return;
      }
      if (
        drawingPointerSession
        && shouldCommitStudioStrokeOnPointerCancel(drawingPointerSession, pointerEvent)
      ) {
        finishDrawingPointer(e.target.getStage(), pointerEvent, { consumeReleaseSample: false });
      } else {
        discardDrawingPointerSession();
      }
      return;
    }
    if (liquifyDragRef.current) {
      if (!isStudioLiquifyPointerOwner(liquifyDragRef.current, pointerEvent)) return;
      finishLiquifyPointerSession(pointerEvent, true, e.target.getStage());
      return;
    }
    if (pixelDragRef.current) {
      if (!finishPixelSelectionPointerSession(pointerEvent, true)) return;
      return;
    }
    if (bubbleShapeDragRef.current) {
      if (bubbleShapeDragRef.current.pointerId !== pointerId) return;
      releaseBubbleShapePointerCapture(bubbleShapeDragRef.current);
      bubbleShapeDragRef.current = null;
      pendingBubbleShapeDraftRef.current = null;
      if (bubbleShapeRafRef.current !== null) {
        globalThis.cancelAnimationFrame(bubbleShapeRafRef.current);
        bubbleShapeRafRef.current = null;
      }
      setBubbleShapeDraft(null);
      return;
    }
    const current = advancedFillTapGestureRef.current;
    if (current) {
      const outcome = endStudioAdvancedFillTap(current, pointerId, true);
      advancedFillTapGestureRef.current = outcome.gesture;
      if (advancedFillTouchPanRef.current?.pointerId === pointerId) {
        advancedFillTouchPanRef.current = null;
      }
      if (!outcome.gesture) advancedFillTapPayloadRef.current = null;
      if (advancedFillColorDropRef.current) {
        const dropEnd = endColorDropSession(advancedFillColorDropRef.current, pointerId, true);
        advancedFillColorDropRef.current = dropEnd.session;
        setAdvancedFillColorDropView(colorDropGestureView(dropEnd.session));
        if (dropEnd.outcome.type === "restore") {
          // 취소 복원 — 드래그 미리보기를 폐기하고 시작 허용 오차 그대로 둔다.
          cancelAdvancedFillColorDropPreview();
        }
      }
      return;
    }
    if (cancelCanvasGroupDrag()) return;
  }
  api.finishDrawingPointer = finishDrawingPointer;
  api.onStagePointerCancel = onStagePointerCancel;
}
