/**
 * 메인 스레드와 완전히 격리된 전용 Web Worker 엔트리 (`self.onmessage`).
 *
 * - `master-filter-rgba`, `die-cut-alpha`, `lighting-extract`,
 *   `wasm-alpha-threshold`, `offscreen-stroke-raster` 작업을 백그라운드 스레드에서 실행하고
 *   결과 `ArrayBuffer`를 `Transferable` 제로-카피로 반환한다.
 * - `OffscreenCanvas` 제어권을 이전받아(`attach-offscreen-canvas`) 워커 내부에서 직접
 *   래스터화할 수 있으며, `cancel-job` 메시지로 비행 중 작업을 조기 중단한다.
 */

import {
  STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION,
  collectOutputTransferables,
  executeStudioComputeJob,
  measureTransferableBytes,
  type StudioWorkerInboundMessage,
  type StudioWorkerOutboundMessage,
} from "./compute-job-executor";
import { probeWasmSimdAndWorkerSupport } from "./wasm-simd-pixel-kernel";

export interface StudioOffloadWorkerScope {
  onmessage: ((event: MessageEvent<StudioWorkerInboundMessage>) => void) | null;
  postMessage(message: StudioWorkerOutboundMessage, transfer?: Transferable[]): void;
}

function isProtocolMessage(value: unknown): value is StudioWorkerInboundMessage {
  if (typeof value !== "object" || value === null) return false;
  const record = value as { readonly version?: unknown; readonly kind?: unknown };
  return (
    record.version === STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION
    && typeof record.kind === "string"
  );
}

function formatWorkerErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "워커 백그라운드 연산 실행 중 알 수 없는 오류가 발생했습니다.";
}

/**
 * 지정된 Worker 전역 스코프에 `onmessage` 핸들러를 바인딩하고 `ready` 신호를 송출한다.
 * 반환된 cleanup 함수를 호출하면 리스너와 보관 중인 OffscreenCanvas 참조를 해제한다.
 */
export function bindStudioOffloadComputeWorkerScope(
  workerScope: StudioOffloadWorkerScope,
): () => void {
  const cancelledJobIds = new Set<number>();
  const offscreenSurfaces = new Map<string, OffscreenCanvas>();

  const post = (
    message: StudioWorkerOutboundMessage,
    transfers: Transferable[] = [],
  ): void => {
    workerScope.postMessage(message, transfers);
  };

  workerScope.onmessage = (event: MessageEvent<StudioWorkerInboundMessage>) => {
    const message = event.data;
    if (!isProtocolMessage(message)) return;

    if (message.kind === "ping") {
      post({
        version: STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION,
        kind: "pong",
        requestId: message.requestId,
        capabilities: probeWasmSimdAndWorkerSupport(),
      });
      return;
    }

    if (message.kind === "cancel-job") {
      cancelledJobIds.add(message.jobId);
      return;
    }

    if (message.kind === "attach-offscreen-canvas") {
      try {
        offscreenSurfaces.set(message.surfaceId, message.canvas);
        post({
          version: STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION,
          kind: "canvas-attached",
          surfaceId: message.surfaceId,
          ok: true,
        });
      } catch {
        post({
          version: STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION,
          kind: "canvas-attached",
          surfaceId: message.surfaceId,
          ok: false,
        });
      }
      return;
    }

    const { jobId, input } = message;
    if (cancelledJobIds.has(jobId)) {
      cancelledJobIds.delete(jobId);
      post({
        version: STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION,
        kind: "job-error",
        jobId,
        code: "cancelled",
        message: "작업이 시작 전 취소되었습니다.",
      });
      return;
    }

    void executeStudioComputeJob(input, {
      isCancelled: () => cancelledJobIds.has(jobId),
      offscreenSurfaces,
    })
      .then((output) => {
        if (cancelledJobIds.has(jobId)) {
          cancelledJobIds.delete(jobId);
          post({
            version: STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION,
            kind: "job-error",
            jobId,
            code: "cancelled",
            message: "작업이 완료 직전 취소되었습니다.",
          });
          return;
        }
        const transfers = collectOutputTransferables(output);
        const transferBytes = measureTransferableBytes(transfers);
        post(
          {
            version: STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION,
            kind: "job-result",
            jobId,
            output,
            transferBytes,
          },
          transfers,
        );
      })
      .catch((error: unknown) => {
        const wasCancelled = cancelledJobIds.has(jobId);
        cancelledJobIds.delete(jobId);
        post({
          version: STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION,
          kind: "job-error",
          jobId,
          code: wasCancelled ? "cancelled" : "execution-failed",
          message: formatWorkerErrorMessage(error),
        });
      });
  };

  post({
    version: STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION,
    kind: "ready",
    capabilities: probeWasmSimdAndWorkerSupport(),
  });

  return () => {
    workerScope.onmessage = null;
    cancelledJobIds.clear();
    offscreenSurfaces.clear();
  };
}

function isDedicatedWorkerRuntime(): boolean {
  const scope = globalThis as Record<string, unknown>;
  return (
    typeof scope.document === "undefined"
    && typeof scope.window === "undefined"
    && typeof scope.postMessage === "function"
    && "onmessage" in scope
  );
}

if (isDedicatedWorkerRuntime()) {
  bindStudioOffloadComputeWorkerScope(
    globalThis as unknown as StudioOffloadWorkerScope,
  );
}
