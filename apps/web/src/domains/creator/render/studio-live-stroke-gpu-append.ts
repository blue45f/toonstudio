import { STUDIO_GPU_TERMINAL_RECEIPT_TIMEOUT_MS } from "../studio-page-shell-runtime";

import { studioLiveSourceJournalFailureReason } from "./studio-live-stroke-gpu-audit";
import {
  advanceStudioGpuLiveSourceJournal,
  sameStudioGpuLiveSourceJournalIdentity,
} from "./studio-webgpu-live-source-journal";

import type { StudioLiveStrokeGpuFailureReason } from "../live/studio-live-stroke-render-backend";
import type { DrawEl } from "../studio-element-model";
import type { StudioWebGpuCanvasHandle } from "../StudioWebGpuCanvas";
import type { StudioLiveStrokeGpuAudit, StudioLiveStrokeGpuAuditContext } from "./studio-live-stroke-gpu-audit";
import type { StudioGpuLiveSourceJournalIdentity, StudioGpuLiveSourceJournalState } from "./studio-webgpu-live-source-journal";
import type { MutableRefObject } from "react";

interface StudioLiveStrokeGpuAppendContext extends Pick<StudioLiveStrokeGpuAuditContext,
  | "gpuLiveAcceptedRequestIdRef" | "gpuLiveInkPinnedRef"
  | "liveStrokeBackendAuditActiveIdRef" | "liveStrokeBackendAuditSessionsRef"
>, Pick<StudioLiveStrokeGpuAudit,
  | "prepareLiveStrokeGpuSubmission" | "registerLiveStrokeGpuRequest"
  | "armGpuPinnedRequestWatchdog" | "applyLiveStrokeBackendPresentationEffects"
  | "gpuPinReceiptWatchdog"
> {
  readonly gpuLiveSourceJournalRef: MutableRefObject<StudioGpuLiveSourceJournalState | null>;
  readonly gpuLiveSourceJournalFirstStrokeIndexRef: MutableRefObject<number>;
  readonly liveDraftVisualRef: MutableRefObject<DrawEl | null>;
  readonly webGpuCanvasHandleRef: MutableRefObject<Pick<StudioWebGpuCanvasHandle,
    "appendPinnedJournalSuffixBatch"
  > | null>;
  readonly gpuLiveSourceJournalIdentityFor: (
    el: DrawEl, epoch: number, variations: StudioGpuLiveSourceJournalIdentity["variations"],
  ) => StudioGpuLiveSourceJournalIdentity;
  readonly failSelectedGpuLiveInk: (reason: StudioLiveStrokeGpuFailureReason, strokeId: string) => void;
}

/** 원본 점은 기존 DrawEl에 보존하고, 표시 요청은 정확한 영수증 한 건씩만 발급한다. */
export function createStudioLiveStrokeGpuAppend(context: StudioLiveStrokeGpuAppendContext) {
  const {
    gpuLiveSourceJournalRef, gpuLiveSourceJournalFirstStrokeIndexRef, liveDraftVisualRef,
    gpuLiveAcceptedRequestIdRef, gpuLiveInkPinnedRef, webGpuCanvasHandleRef,
    liveStrokeBackendAuditActiveIdRef, liveStrokeBackendAuditSessionsRef,
    gpuLiveSourceJournalIdentityFor, failSelectedGpuLiveInk,
    prepareLiveStrokeGpuSubmission, registerLiveStrokeGpuRequest,
    armGpuPinnedRequestWatchdog, applyLiveStrokeBackendPresentationEffects,
    gpuPinReceiptWatchdog,
  } = context;

  function appendGpuLiveSourceJournalSuffix(
    el: DrawEl,
    sealEndpoint = false,
  ): "advanced" | "retained" | "rejected" {
    const journal = gpuLiveSourceJournalRef.current;
    const handle = webGpuCanvasHandleRef.current;
    if (!journal || !handle) {
      failSelectedGpuLiveInk("surface-lost", el.id);
      return "rejected";
    }
    const identity = gpuLiveSourceJournalIdentityFor(el, journal.identity.epoch, journal.identity.variations);
    const session = liveStrokeBackendAuditSessionsRef.current.get(el.id);
    const snapshot = session?.coordinator.getSnapshot();
    if (
      !sealEndpoint && !journal.sealed
      && gpuLiveInkPinnedRef.current && liveStrokeBackendAuditActiveIdRef.current === el.id
      && snapshot?.phase === "drawing" && snapshot.pinnedBackend === "webgpu"
      && snapshot.unavailableReason === null && session?.gpuRequest
      && sameStudioGpuLiveSourceJournalIdentity(journal.identity, identity)
    ) {
      // 새 입력은 liveDraftVisualRef에 이미 누적되어 있다. cursor와 표시 요청을 유지해야
      // 진행 중인 정상 fence가 다음 16ms 입력 때문에 계속 폐기되지 않는다.
      return "retained";
    }
    const advanced = advanceStudioGpuLiveSourceJournal(journal, {
      identity, points: el.points, pressures: el.pressures, sealEndpoint,
    });
    if (advanced.status === "rejected") {
      failSelectedGpuLiveInk(studioLiveSourceJournalFailureReason(advanced.reason), el.id);
      return "rejected";
    }
    if (advanced.status === "retained") {
      gpuLiveSourceJournalRef.current = advanced.state;
      // 마지막 점이 이미 제출됐다면 새 명령은 없어도 진행 중인 exact 요청의 역할은
      // terminal로 바뀐다. live 300ms deadline을 완료 영수증 예산으로 교체한다.
      const pendingRequestId = session?.gpuRequest?.requestId;
      if (sealEndpoint && pendingRequestId && pendingRequestId === gpuLiveAcceptedRequestIdRef.current) {
        armGpuPinnedRequestWatchdog(pendingRequestId, STUDIO_GPU_TERMINAL_RECEIPT_TIMEOUT_MS);
      }
      return "retained";
    }
    const firstStrokeIndex = gpuLiveSourceJournalFirstStrokeIndexRef.current;
    if (!prepareLiveStrokeGpuSubmission(el.id, "append")) {
      failSelectedGpuLiveInk("request-failed", el.id);
      return "rejected";
    }
    const outcome = handle.appendPinnedJournalSuffixBatch({
      patches: advanced.suffixes.map((suffix, variationIndex) => ({
        strokeIndex: firstStrokeIndex + variationIndex,
        previousPointCount: suffix.previousRenderedPointCount,
        suffixPoints: suffix.points,
        suffixPressures: suffix.pressures,
      })),
    });
    if (outcome.status === "rejected") {
      failSelectedGpuLiveInk("request-failed", el.id);
      return "rejected";
    }
    gpuLiveSourceJournalRef.current = advanced.state;
    if (!registerLiveStrokeGpuRequest(el.id, outcome.requestId, "append")) {
      failSelectedGpuLiveInk("surface-lost", el.id);
      return "rejected";
    }
    gpuLiveAcceptedRequestIdRef.current = outcome.requestId;
    armGpuPinnedRequestWatchdog(
      outcome.requestId,
      sealEndpoint ? STUDIO_GPU_TERMINAL_RECEIPT_TIMEOUT_MS : undefined,
    );
    applyLiveStrokeBackendPresentationEffects();
    return "advanced";
  }

  function flushGpuLiveSourceJournalAfterReceipt(strokeId: string, requestId: string): void {
    const journal = gpuLiveSourceJournalRef.current;
    const latest = liveDraftVisualRef.current;
    const session = liveStrokeBackendAuditSessionsRef.current.get(strokeId);
    const snapshot = session?.coordinator.getSnapshot();
    if (
      !gpuLiveInkPinnedRef.current || liveStrokeBackendAuditActiveIdRef.current !== strokeId
      || !journal || journal.sealed || journal.identity.strokeId !== strokeId
      || !latest || latest.id !== strokeId || !session || session.gpuRequest !== null
      || snapshot?.phase !== "drawing" || snapshot.pinnedBackend !== "webgpu"
      || snapshot.unavailableReason !== null
      || snapshot.acceptedGpuRequest?.requestId !== requestId
      || gpuLiveAcceptedRequestIdRef.current !== requestId
      || !gpuPinReceiptWatchdog().hasExactReceipt(requestId)
    ) return;
    // 승인된 cursor 뒤의 모든 원본 점을 한 번에 읽는다. terminal은 이 경로를 우회하며
    // 최종 원고의 전체 입력을 포함한 별도 exact receipt를 계속 요구한다.
    appendGpuLiveSourceJournalSuffix(latest);
  }

  return { appendGpuLiveSourceJournalSuffix, flushGpuLiveSourceJournalAfterReceipt };
}
