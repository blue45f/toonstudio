/** 치유 계산은 전용 Worker 한 개가 맡는다. 실패 뒤 main 동기 계산이나 자동 재요청은 하지 않는다. */
import {
  captureStudioCoplanarEdgeDissolveWorkerScope, createStudioCoplanarEdgeDissolveWorkerRequest,
  isStudioCoplanarEdgeDissolveWorkerResponse, restoreStudioCoplanarEdgeDissolveWorkerResult,
  type StudioCoplanarEdgeDissolveWorkerRequest, type StudioCoplanarEdgeDissolveWorkerScope,
} from "./studio-hybrid-dcc-coplanar-edge-dissolve-worker-protocol";
import { studioHybridDccPackedMeshPayloadTransfers } from "./studio-hybrid-dcc-glb-export-packed-mesh";

import type { StudioCoplanarEdgeDissolveSource, StudioCoplanarEdgeDissolveRequest, StudioCoplanarEdgeDissolveResult } from "./studio-hybrid-dcc-coplanar-edge-dissolve";

interface MessageLike { readonly data: unknown }
interface ErrorLike { preventDefault?(): void }
export interface StudioCoplanarEdgeDissolveWorkerLike {
  postMessage(message: StudioCoplanarEdgeDissolveWorkerRequest, transfer: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageLike) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: ErrorLike) => void): void;
  removeEventListener(type: "message", listener: (event: MessageLike) => void): void;
  removeEventListener(type: "error" | "messageerror", listener: (event: ErrorLike) => void): void;
  terminate(): void;
}
export interface StudioCoplanarEdgeDissolveWorkerOptions extends StudioCoplanarEdgeDissolveWorkerScope {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  /** 전송 회귀용 내부 포트다. 제품 기본값은 실제 전용 Worker다. */
  readonly workerFactory?: () => StudioCoplanarEdgeDissolveWorkerLike | null;
}
export type StudioCoplanarEdgeDissolveWorkerErrorCode = "aborted" | "timeout" | "protocol" | "invalid-input" | "worker-unavailable" | "worker-failed" | "cleanup-failed";
export class StudioCoplanarEdgeDissolveWorkerError extends Error {
  constructor(readonly code: StudioCoplanarEdgeDissolveWorkerErrorCode, readonly cleanupFailed = false) {
    super(`공유 모서리 치유 Worker 처리 실패: ${code}`);
    this.name = code === "aborted" ? "AbortError" : code === "timeout" ? "TimeoutError" : "StudioCoplanarEdgeDissolveWorkerError";
  }
}
let sequence = 0;
function workerFactory(): StudioCoplanarEdgeDissolveWorkerLike | null {
  return typeof Worker === "function" ? new Worker(new URL("./studio-hybrid-dcc-coplanar-edge-dissolve.worker.ts", import.meta.url), {
    type: "module", name: "studio-hybrid-dcc-coplanar-edge-dissolve",
  }) : null;
}
export function computeStudioHybridDccCoplanarEdgeDissolveInWorker(source: StudioCoplanarEdgeDissolveSource,
  input: StudioCoplanarEdgeDissolveRequest, options: StudioCoplanarEdgeDissolveWorkerOptions): Promise<StudioCoplanarEdgeDissolveResult> {
  if (options.signal?.aborted) return Promise.reject(new StudioCoplanarEdgeDissolveWorkerError("aborted"));
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) return Promise.reject(new StudioCoplanarEdgeDissolveWorkerError("invalid-input"));
  sequence = sequence >= Number.MAX_SAFE_INTEGER ? 1 : sequence + 1;
  const request = createStudioCoplanarEdgeDissolveWorkerRequest(source, input, options, sequence);
  if (!request) return Promise.reject(new StudioCoplanarEdgeDissolveWorkerError("invalid-input"));
  // 전송 뒤에도 caller의 가변 배열이나 private buffer를 다시 읽지 않는 개인 scope다.
  const expected = captureStudioCoplanarEdgeDissolveWorkerScope(request);
  return new Promise((resolve, reject) => {
    let worker: StudioCoplanarEdgeDissolveWorkerLike | null = null, settled = false, creating = false;
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
    const fail = (code: StudioCoplanarEdgeDissolveWorkerErrorCode): void => {
      if (settled) return; settled = true;
      reject(new StudioCoplanarEdgeDissolveWorkerError(code, !cleanup()));
    };
    // 생성 중 동기 취소는 반환된 Worker까지 정리한 뒤 한 번만 확정한다.
    const onAbort = (): void => { if (!creating) fail("aborted"); };
    const onError = (event: ErrorLike): void => { event.preventDefault?.(); fail("worker-failed"); };
    const onMessage = (event: MessageLike): void => {
      if (settled) return;
      if (!isStudioCoplanarEdgeDissolveWorkerResponse(event.data) || event.data.requestId !== expected.requestId
        || event.data.generation !== expected.generation || event.data.requestDigest !== expected.requestDigest) { fail("protocol"); return; }
      if (event.data.kind === "error") { fail(event.data.code === "protocol" ? "protocol" : "worker-failed"); return; }
      const result = restoreStudioCoplanarEdgeDissolveWorkerResult(event.data, expected);
      if (result === null) { fail("protocol"); return; }
      if (options.signal?.aborted) { fail("aborted"); return; }
      settled = true;
      if (!cleanup()) reject(new StudioCoplanarEdgeDissolveWorkerError("cleanup-failed", true)); else resolve(result);
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) { fail("aborted"); return; }
    try {
      creating = true;
      try { worker = (options.workerFactory ?? workerFactory)(); }
      finally { creating = false; }
      if (options.signal?.aborted) { fail("aborted"); return; }
      if (!worker) { fail("worker-unavailable"); return; }
      worker.addEventListener("message", onMessage); worker.addEventListener("error", onError); worker.addEventListener("messageerror", onError);
      if (options.signal?.aborted) { fail("aborted"); return; }
      timeout = setTimeout(() => fail("timeout"), timeoutMs);
      worker.postMessage(request, studioHybridDccPackedMeshPayloadTransfers([request.payload]));
    } catch { fail(options.signal?.aborted ? "aborted" : "worker-failed"); }
  });
}
