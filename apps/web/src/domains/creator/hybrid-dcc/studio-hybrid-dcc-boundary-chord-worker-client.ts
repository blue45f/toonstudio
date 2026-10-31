/** chord preview를 실제 전용 Worker에서 계산한다. 실패를 main 동기 계산으로 재실행하지 않는다. */
import {
  createStudioBoundaryChordWorkerRequest, isStudioBoundaryChordWorkerResponse, restoreStudioBoundaryChordWorkerResult,
  type StudioBoundaryChordWorkerInput, type StudioBoundaryChordWorkerRequest,
} from "./studio-hybrid-dcc-boundary-chord-worker-protocol";
import { studioHybridDccPackedMeshPayloadTransfers } from "./studio-hybrid-dcc-glb-export-packed-mesh";
import { studioBoundaryChordMessage } from "./studio-hybrid-dcc-boundary-chord-messages";
import type { StudioBoundaryChordUvResult } from "./studio-hybrid-dcc-boundary-chord-uv";

interface MessageLike { readonly data: unknown; }
interface ErrorLike { preventDefault?(): void; }
export interface StudioBoundaryChordWorkerLike {
  postMessage(message: StudioBoundaryChordWorkerRequest, transfer: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageLike) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: ErrorLike) => void): void;
  removeEventListener(type: "message", listener: (event: MessageLike) => void): void;
  removeEventListener(type: "error" | "messageerror", listener: (event: ErrorLike) => void): void;
  terminate(): void;
}
export interface StudioBoundaryChordWorkerOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  /** 테스트 전송 경계다. 생략하면 실제 product Worker만 선택한다. */
  readonly workerFactory?: () => StudioBoundaryChordWorkerLike | null;
}
export type StudioBoundaryChordWorkerErrorCode = "aborted" | "timeout" | "protocol" | "invalid-input" | "worker-unavailable" | "worker-failed" | "cleanup-failed";
export class StudioBoundaryChordWorkerError extends Error {
  constructor(readonly code: StudioBoundaryChordWorkerErrorCode, readonly cleanupFailed = false) {
    super(studioBoundaryChordMessage(code)); this.name = code === "aborted" ? "AbortError" : code === "timeout" ? "TimeoutError" : "StudioBoundaryChordWorkerError";
  }
}
let sequence = 0;
function workerFactory(): StudioBoundaryChordWorkerLike | null {
  return typeof Worker === "function" ? new Worker(new URL("./studio-hybrid-dcc-boundary-chord.worker.ts", import.meta.url), {
    type: "module", name: "studio-hybrid-dcc-boundary-chord",
  }) : null;
}

export function computeStudioHybridDccBoundaryChordInWorker(input: StudioBoundaryChordWorkerInput, options: StudioBoundaryChordWorkerOptions = {}): Promise<StudioBoundaryChordUvResult> {
  if (options.signal?.aborted) return Promise.reject(new StudioBoundaryChordWorkerError("aborted"));
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) return Promise.reject(new StudioBoundaryChordWorkerError("invalid-input"));
  sequence = sequence >= Number.MAX_SAFE_INTEGER ? 1 : sequence + 1;
  const requestId = sequence, request = createStudioBoundaryChordWorkerRequest(input, requestId);
  if (!request) return Promise.reject(new StudioBoundaryChordWorkerError("invalid-input"));
  return new Promise((resolve, reject) => {
    let worker: StudioBoundaryChordWorkerLike | null = null, settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const cleanup = (): boolean => {
      let failed = false;
      if (timeout !== null) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
      const current = worker; worker = null;
      if (current) {
        for (const remove of [() => current.removeEventListener("message", onMessage), () => current.removeEventListener("error", onError),
          () => current.removeEventListener("messageerror", onError), () => current.terminate()]) {
          try { remove(); } catch { failed = true; }
        }
      }
      return !failed;
    };
    const fail = (code: StudioBoundaryChordWorkerErrorCode): void => {
      if (settled) return; settled = true;
      reject(new StudioBoundaryChordWorkerError(code, !cleanup()));
    };
    const onAbort = (): void => fail("aborted");
    const onError = (event: ErrorLike): void => { event.preventDefault?.(); fail("worker-failed"); };
    const onMessage = (event: MessageLike): void => {
      if (settled) return;
      if (!isStudioBoundaryChordWorkerResponse(event.data) || event.data.requestId !== requestId || event.data.generation !== input.generation) { fail("protocol"); return; }
      if (event.data.kind === "error") { fail(event.data.code === "protocol" ? "protocol" : "worker-failed"); return; }
      const result = restoreStudioBoundaryChordWorkerResult(event.data, input, requestId);
      if (result === null) { fail("protocol"); return; }
      if (options.signal?.aborted) { fail("aborted"); return; }
      settled = true;
      if (!cleanup()) reject(new StudioBoundaryChordWorkerError("cleanup-failed", true)); else resolve(result);
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) { fail("aborted"); return; }
    try {
      worker = (options.workerFactory ?? workerFactory)();
      // 테스트 factory 또는 host의 동기 재진입이 생성 중 취소를 발행해도 방금 받은 자원을 남기지 않는다.
      if (settled) { cleanup(); return; }
      if (!worker) { fail("worker-unavailable"); return; }
      worker.addEventListener("message", onMessage); worker.addEventListener("error", onError); worker.addEventListener("messageerror", onError);
      if (options.signal?.aborted) { fail("aborted"); return; }
      timeout = setTimeout(() => fail("timeout"), timeoutMs);
      worker.postMessage(request, studioHybridDccPackedMeshPayloadTransfers([request.payload]));
    } catch { fail("worker-failed"); }
  });
}
