import type { MutableRefObject } from "react";
import type { StudioLayerLike, StudioReadonlyRef } from "../canvas/studio-stage-handle-types";
import type { StudioInkMeshLivePreviewRuntime } from "../brush/studio-ink-mesh-live-preview-loader";
import type { StudioCrdtDocument } from "../live/studio-crdt-document";
import type { StudioCrdtLiveStrokePublisher } from "../live/studio-crdt-live-stroke-publisher";
import type { StudioLiveDynamicBrushOverlayRenderer } from "../live/studio-live-dynamic-brush-overlay";
import type { StudioLiveGesturePreviewPublisher } from "../live/studio-live-gesture-preview-publisher";
import type { StudioLiveInkOverlayRenderer } from "../live/studio-live-ink-overlay";
import type { StudioLiveRetainedMediaOverlayRenderer } from "../live/studio-live-retained-media-overlay";
import type { StudioLiveStampOverlayRenderer } from "../live/studio-live-stamp-overlay";
import type { StudioLiveWetInkOverlayRenderer } from "../live/studio-live-wet-ink-overlay";
import type { StudioLivePressureStore } from "../live/StudioLiveInkHosts";
import type { StudioPendingStrokeAdmissionQueue } from "../live/studio-pending-stroke-admission";
import type { StudioGpuLiveSourceJournalState } from "../render/studio-webgpu-live-source-journal";
import type { StudioGpuPendingDrawAuthority } from "../render/studio-webgpu-pending-authority";
import type { StudioGpuPinReceiptWatchdog } from "../render/studio-webgpu-pin-receipt-watchdog";
import type { StudioGpuStroke } from "../render/studio-webgpu-stroke";
import type { StudioCommittedInkSurfaceHandoff } from "../studio-committed-ink-handoff-coordinator";
import type { StudioCommittedInkRetainedRetryState } from "../studio-committed-ink-release-retry";
import type { StudioDraftPreviewStore } from "../studio-draft-preview-store";
import type { DrawEl } from "../studio-element-model";
import type { StudioWebGpuCanvasHandle } from "../StudioWebGpuCanvas";
import { runStudioResetTransientInkForHistoryTransition } from "./studio-host-wave2-live-ink-helpers";

export function runStudioResetTransientInkForHistoryTransitionRefs({
  liveInkOverlayClearGenRef, liveInkOverlayRendererRef, liveRetainedMediaOverlayRendererRef,
  liveDynamicBrushOverlayRendererRef, liveWetInkOverlayRendererRef, draftPreviewStoreRef,
  liveDraftPendingRef, liveDraftVisualRef, liveDraftDirectRef, pendingStrokeAdmissionRef,
  cancelAllLiveStrokeBackendAudits, gpuLiveSourceJournalRef, gpuLiveSourceJournalFirstStrokeIndexRef,
  gpuLiveOperationOrderKeyRef, pendingGpuStrokesRef, pendingGpuDrawAuthoritiesRef,
  gpuFinalReceiptRequestIdsRef, gpuFinalCrdtPublishedRequestIdsRef, gpuLiveInkPinnedRef,
  gpuLiveAcceptedRequestIdRef, gpuFinalReceiptStrokeRef, gpuFinalReceiptRequestIdRef,
  gpuPinReceiptWatchdogRef, cancelGpuPinnedRequestWatchdog, committedInkSurfaceHandoffsRef,
  committedInkRetainedRetryRef, clearSkiaCommittedInkRuntime, committedInkSurfaceHandoffRafRef,
  webGpuCanvasHandleRef, liveDraftLayerRef, mainLayerRef,
}: {
  readonly liveInkOverlayClearGenRef: MutableRefObject<number>;
  readonly liveInkOverlayRendererRef: MutableRefObject<StudioLiveInkOverlayRenderer>;
  readonly liveRetainedMediaOverlayRendererRef: MutableRefObject<StudioLiveRetainedMediaOverlayRenderer>;
  readonly liveDynamicBrushOverlayRendererRef: MutableRefObject<StudioLiveDynamicBrushOverlayRenderer>;
  readonly liveWetInkOverlayRendererRef: MutableRefObject<StudioLiveWetInkOverlayRenderer>;
  readonly draftPreviewStoreRef: MutableRefObject<StudioDraftPreviewStore>;
  readonly liveDraftPendingRef: MutableRefObject<DrawEl | null>;
  readonly liveDraftVisualRef: MutableRefObject<DrawEl | null>;
  readonly liveDraftDirectRef: MutableRefObject<boolean>;
  readonly pendingStrokeAdmissionRef: MutableRefObject<StudioPendingStrokeAdmissionQueue | null>;
  readonly cancelAllLiveStrokeBackendAudits: () => void;
  readonly gpuLiveSourceJournalRef: MutableRefObject<StudioGpuLiveSourceJournalState | null>;
  readonly gpuLiveSourceJournalFirstStrokeIndexRef: MutableRefObject<number>;
  readonly gpuLiveOperationOrderKeyRef: MutableRefObject<string | null>;
  readonly pendingGpuStrokesRef: MutableRefObject<StudioGpuStroke[]>;
  readonly pendingGpuDrawAuthoritiesRef: MutableRefObject<StudioGpuPendingDrawAuthority[]>;
  readonly gpuFinalReceiptRequestIdsRef: MutableRefObject<Map<string, string>>;
  readonly gpuFinalCrdtPublishedRequestIdsRef: MutableRefObject<Map<string, string>>;
  readonly gpuLiveInkPinnedRef: MutableRefObject<boolean>;
  readonly gpuLiveAcceptedRequestIdRef: MutableRefObject<string | null>;
  readonly gpuFinalReceiptStrokeRef: MutableRefObject<DrawEl | null>;
  readonly gpuFinalReceiptRequestIdRef: MutableRefObject<string | null>;
  readonly gpuPinReceiptWatchdogRef: MutableRefObject<StudioGpuPinReceiptWatchdog | null>;
  readonly cancelGpuPinnedRequestWatchdog: () => void;
  readonly committedInkSurfaceHandoffsRef: MutableRefObject<StudioCommittedInkSurfaceHandoff[]>;
  readonly committedInkRetainedRetryRef: MutableRefObject<StudioCommittedInkRetainedRetryState | null>;
  readonly clearSkiaCommittedInkRuntime: () => void;
  readonly committedInkSurfaceHandoffRafRef: MutableRefObject<number>;
  readonly webGpuCanvasHandleRef: MutableRefObject<StudioWebGpuCanvasHandle | null>;
  readonly liveDraftLayerRef: StudioReadonlyRef<StudioLayerLike | null>;
  readonly mainLayerRef: StudioReadonlyRef<StudioLayerLike | null>;
}): void {
  runStudioResetTransientInkForHistoryTransition({
    clearLiveOverlays: () => {
      liveInkOverlayClearGenRef.current += 1;
      liveInkOverlayRendererRef.current.clear();
      liveRetainedMediaOverlayRendererRef.current.clear();
      liveDynamicBrushOverlayRendererRef.current.clear();
      liveWetInkOverlayRendererRef.current.clear();
      draftPreviewStoreRef.current.clearSettled();
      liveDraftPendingRef.current = null;
      liveDraftVisualRef.current = null;
      liveDraftDirectRef.current = false;
    },
    cancelAdmissionAndAudits: () => {
      pendingStrokeAdmissionRef.current?.cancelAll("히스토리 전환으로 이전 획 입력 대기를 종료하고 원본을 복구합니다.");
      cancelAllLiveStrokeBackendAudits();
    },
    resetGpuRefs: () => {
      gpuLiveSourceJournalRef.current = null;
      gpuLiveSourceJournalFirstStrokeIndexRef.current = 0;
      gpuLiveOperationOrderKeyRef.current = null;
      pendingGpuStrokesRef.current = [];
      pendingGpuDrawAuthoritiesRef.current = [];
      gpuFinalReceiptRequestIdsRef.current.clear();
      gpuFinalCrdtPublishedRequestIdsRef.current.clear();
      gpuLiveInkPinnedRef.current = false;
      gpuLiveAcceptedRequestIdRef.current = null;
      gpuFinalReceiptStrokeRef.current = null;
      gpuFinalReceiptRequestIdRef.current = null;
      gpuPinReceiptWatchdogRef.current = null;
      cancelGpuPinnedRequestWatchdog();
    },
    clearCommittedHandoffs: () => {
      committedInkSurfaceHandoffsRef.current = [];
      committedInkRetainedRetryRef.current = null;
      clearSkiaCommittedInkRuntime();
      if (committedInkSurfaceHandoffRafRef.current) {
        globalThis.cancelAnimationFrame(committedInkSurfaceHandoffRafRef.current);
        committedInkSurfaceHandoffRafRef.current = 0;
      }
    },
    webGpuCanvasHandle: webGpuCanvasHandleRef.current,
    batchDrawLayers: () => {
      liveDraftLayerRef.current?.batchDraw();
      mainLayerRef.current?.batchDraw();
    },
  });
}

export function runStudioDrawingUnmountCleanup({
  drawingRef, discardStudioLivingInkStroke, discardStudioHokusaiLiveStroke,
  inkMeshLivePreviewRuntimeRef, cancelAllLiveStrokeBackendAudits,
  drawingCrdtPublisherRef, drawingGesturePreviewPublisherRef, studioCrdtDocumentRef,
  perspectiveRayRef, perspectiveGuideSnapRef, isometricAxisRayRef, advancedRulerSnapRef,
  stopQuickShapeTracking, releaseDrawingPointerSession, pendingDraftRef,
  liveDraftPendingRef, liveDraftVisualRef, liveDraftRafRef, cancelGpuPinnedRequestWatchdog,
  gpuLingerRafRef, resetLiveDraftDirectFlags, gpuLiveInkPinnedRef,
  gpuLiveSourceJournalRef, gpuLiveSourceJournalFirstStrokeIndexRef,
  gpuLiveOperationOrderKeyRef, gpuLiveAcceptedRequestIdRef,
  gpuFinalReceiptStrokeRef, gpuFinalReceiptRequestIdRef,
  gpuFinalReceiptRequestIdsRef, gpuFinalCrdtPublishedRequestIdsRef,
  liveInkOverlayRendererRef, liveStampOverlayRendererRef,
  liveDynamicBrushOverlayRendererRef, liveRetainedMediaOverlayRendererRef,
  liveWetInkOverlayRendererRef, endPredictedInkTail, liveDrawPressureRafRef,
  liveDrawPressureRef, liveDrawPressureStoreRef, endLiveResourceEdit,
}: {
  readonly drawingRef: MutableRefObject<DrawEl | null>;
  readonly discardStudioLivingInkStroke: (strokeId?: string) => void;
  readonly discardStudioHokusaiLiveStroke: (strokeId?: string) => void;
  readonly inkMeshLivePreviewRuntimeRef: MutableRefObject<StudioInkMeshLivePreviewRuntime | null>;
  readonly cancelAllLiveStrokeBackendAudits: () => void;
  readonly drawingCrdtPublisherRef: MutableRefObject<StudioCrdtLiveStrokePublisher<DrawEl>>;
  readonly drawingGesturePreviewPublisherRef: MutableRefObject<StudioLiveGesturePreviewPublisher>;
  readonly studioCrdtDocumentRef: MutableRefObject<StudioCrdtDocument | null>;
  readonly perspectiveRayRef: MutableRefObject<unknown>;
  readonly perspectiveGuideSnapRef: MutableRefObject<unknown>;
  readonly isometricAxisRayRef: MutableRefObject<unknown>;
  readonly advancedRulerSnapRef: MutableRefObject<unknown>;
  readonly stopQuickShapeTracking: () => void;
  readonly releaseDrawingPointerSession: () => void;
  readonly pendingDraftRef: MutableRefObject<DrawEl | null>;
  readonly liveDraftPendingRef: MutableRefObject<DrawEl | null>;
  readonly liveDraftVisualRef: MutableRefObject<DrawEl | null>;
  readonly liveDraftRafRef: MutableRefObject<number | null>;
  readonly cancelGpuPinnedRequestWatchdog: () => void;
  readonly gpuLingerRafRef: MutableRefObject<number>;
  readonly resetLiveDraftDirectFlags: () => void;
  readonly gpuLiveInkPinnedRef: MutableRefObject<boolean>;
  readonly gpuLiveSourceJournalRef: MutableRefObject<StudioGpuLiveSourceJournalState | null>;
  readonly gpuLiveSourceJournalFirstStrokeIndexRef: MutableRefObject<number>;
  readonly gpuLiveOperationOrderKeyRef: MutableRefObject<string | null>;
  readonly gpuLiveAcceptedRequestIdRef: MutableRefObject<string | null>;
  readonly gpuFinalReceiptStrokeRef: MutableRefObject<DrawEl | null>;
  readonly gpuFinalReceiptRequestIdRef: MutableRefObject<string | null>;
  readonly gpuFinalReceiptRequestIdsRef: MutableRefObject<Map<string, string>>;
  readonly gpuFinalCrdtPublishedRequestIdsRef: MutableRefObject<Map<string, string>>;
  readonly liveInkOverlayRendererRef: MutableRefObject<StudioLiveInkOverlayRenderer>;
  readonly liveStampOverlayRendererRef: MutableRefObject<StudioLiveStampOverlayRenderer>;
  readonly liveDynamicBrushOverlayRendererRef: MutableRefObject<StudioLiveDynamicBrushOverlayRenderer>;
  readonly liveRetainedMediaOverlayRendererRef: MutableRefObject<StudioLiveRetainedMediaOverlayRenderer>;
  readonly liveWetInkOverlayRendererRef: MutableRefObject<StudioLiveWetInkOverlayRenderer>;
  readonly endPredictedInkTail: () => void;
  readonly liveDrawPressureRafRef: MutableRefObject<number>;
  readonly liveDrawPressureRef: MutableRefObject<number | null>;
  readonly liveDrawPressureStoreRef: MutableRefObject<StudioLivePressureStore>;
  readonly endLiveResourceEdit: () => void;
}): void {
  const discardedId = drawingRef.current?.id;
  discardStudioLivingInkStroke(discardedId);
  discardStudioHokusaiLiveStroke(discardedId);
  inkMeshLivePreviewRuntimeRef.current?.cancel();
  cancelAllLiveStrokeBackendAudits();
  drawingCrdtPublisherRef.current.cancel(discardedId);
  drawingGesturePreviewPublisherRef.current.cancel();
  if (discardedId) {
    try {
      studioCrdtDocumentRef.current?.deleteStroke(discardedId);
    } catch {
      // 룸 종료 경합 중이어도 로컬 ref·임대 정리는 결정적으로 마무리한다.
    }
  }
  drawingRef.current = null;
  perspectiveRayRef.current = null;
  perspectiveGuideSnapRef.current = null;
  isometricAxisRayRef.current = null;
  advancedRulerSnapRef.current = null;
  stopQuickShapeTracking();
  releaseDrawingPointerSession();
  pendingDraftRef.current = null;
  liveDraftPendingRef.current = null;
  liveDraftVisualRef.current = null;
  if (liveDraftRafRef.current !== null) {
    globalThis.cancelAnimationFrame(liveDraftRafRef.current);
    liveDraftRafRef.current = null;
  }
  cancelGpuPinnedRequestWatchdog();
  if (gpuLingerRafRef.current) {
    globalThis.cancelAnimationFrame(gpuLingerRafRef.current);
    gpuLingerRafRef.current = 0;
  }
  resetLiveDraftDirectFlags();
  gpuLiveInkPinnedRef.current = false;
  gpuLiveSourceJournalRef.current = null;
  gpuLiveSourceJournalFirstStrokeIndexRef.current = 0;
  gpuLiveOperationOrderKeyRef.current = null;
  gpuLiveAcceptedRequestIdRef.current = null;
  gpuFinalReceiptStrokeRef.current = null;
  gpuFinalReceiptRequestIdRef.current = null;
  gpuFinalReceiptRequestIdsRef.current.clear();
  gpuFinalCrdtPublishedRequestIdsRef.current.clear();
  liveInkOverlayRendererRef.current.resetActive();
  liveStampOverlayRendererRef.current.resetActive();
  liveDynamicBrushOverlayRendererRef.current.resetActive();
  liveRetainedMediaOverlayRendererRef.current.resetActive();
  liveWetInkOverlayRendererRef.current.resetActive();
  endPredictedInkTail();
  if (liveDrawPressureRafRef.current) {
    globalThis.cancelAnimationFrame(liveDrawPressureRafRef.current);
    liveDrawPressureRafRef.current = 0;
  }
  liveDrawPressureRef.current = null;
  liveDrawPressureStoreRef.current.value = null;
  endLiveResourceEdit();
}
