import {
  computeStudioImageTraceGridJob,
  type StudioImageTraceLuminanceGrid,
} from "./studio-image-trace-grid";
import type { StudioImageTraceLayer } from "./studio-image-trace";
import {
  STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION,
  studioImageTraceRequestTransfers,
  type StudioImageTraceWorkerResponseMessage,
  type StudioImageTraceWorkerRunMessage,
  type StudioImageTraceWorkerRunRequest,
} from "./studio-image-trace-worker-protocol";

export interface StudioImageTraceWorkerLike {
  onmessage: ((event: MessageEvent<StudioImageTraceWorkerResponseMessage>) => void) | null;
  onerror:
    | ((event: {
        readonly error?: unknown;
        readonly message?: string;
        preventDefault?(): void;
      }) => void)
    | null;
  postMessage(message: StudioImageTraceWorkerRunMessage, transfer: Transferable[]): void;
  terminate(): void;
}

export type StudioImageTraceWorkerFactory = () => StudioImageTraceWorkerLike | null;
export type StudioImageTraceExecutionMode = "worker" | "direct";

export interface StudioImageTraceWorkerClientOptions {
  signal?: AbortSignal;
  /** Execution authority is selected before the operation starts and never changes afterward. */
  executionMode?: StudioImageTraceExecutionMode;
  /** Test/integration seam for Worker mode. `null` means unavailable, not direct execution. */
  workerFactory?: StudioImageTraceWorkerFactory | null;
}

export interface StudioImageTraceWorkerClientResult {
  execution: "worker" | "direct";
  grid: StudioImageTraceLuminanceGrid;
  layers: readonly StudioImageTraceLayer[];
}

/** Vite statically discovers this exact URL pattern and emits an isolated module-worker chunk. */
export function createStudioImageTraceModuleWorker(): StudioImageTraceWorkerLike | null {
  if (typeof Worker !== "function") return null;
  return new Worker(new URL("./studio-image-trace.worker.ts", import.meta.url), {
    type: "module",
    name: "toonstudio-image-trace",
  }) as unknown as StudioImageTraceWorkerLike;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("이미지 트레이스 계산을 취소했습니다.", "AbortError");
  }
  const error = new Error("이미지 트레이스 계산을 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError();
}

function createWorkerUnavailableError(message: string, cause?: unknown): Error {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.name = "StudioImageTraceWorkerUnavailableError";
  return error;
}

export function isStudioImageTraceWorkerUnavailableError(error: unknown): boolean {
  return error instanceof Error && error.name === "StudioImageTraceWorkerUnavailableError";
}

function runImageTraceDirect(
  request: StudioImageTraceWorkerRunRequest,
  signal: AbortSignal | undefined,
): StudioImageTraceWorkerClientResult {
  throwIfAborted(signal);
  const job = computeStudioImageTraceGridJob(
    request.data,
    request.width,
    request.height,
    request.preset,
  );
  if (!job) throw new Error("트레이싱할 픽셀 격자를 만들지 못했습니다.");
  return { execution: "direct", grid: job.grid, layers: job.layers };
}

function deserializeWorkerError(response: Extract<
  StudioImageTraceWorkerResponseMessage,
  { type: "studio-image-trace/failure" }
>): Error {
  const error = new Error(response.error.message);
  error.name = response.error.name || "Error";
  return error;
}

function runImageTraceWithWorker(
  worker: StudioImageTraceWorkerLike,
  request: StudioImageTraceWorkerRunRequest,
  signal: AbortSignal | undefined,
): Promise<StudioImageTraceWorkerClientResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let requestPosted = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    const message: StudioImageTraceWorkerRunMessage = {
      type: "studio-image-trace/run",
      version: STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION,
      request,
    };

    const cleanup = () => {
      if (readyTimer !== null) clearTimeout(readyTimer);
      signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => finish(() => reject(createAbortError()));
    const rejectWorkerUnavailable = (message: string, cause?: unknown) => finish(() => reject(
      createWorkerUnavailableError(message, cause),
    ));

    worker.onmessage = (event) => {
      const response = event.data;
      if (response.version !== STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION) {
        finish(() => reject(new Error("이미지 트레이스 Worker가 알 수 없는 응답을 반환했습니다.")));
        return;
      }
      if (response.type === "studio-image-trace/ready") {
        if (requestPosted) return;
        if (readyTimer !== null) {
          clearTimeout(readyTimer);
          readyTimer = null;
        }
        try {
          worker.postMessage(message, studioImageTraceRequestTransfers(message));
          requestPosted = true;
        } catch (error) {
          rejectWorkerUnavailable("이미지 트레이스 Worker에 요청을 전달하지 못했습니다.", error);
        }
        return;
      }
      if (!requestPosted) {
        finish(() => reject(new Error("이미지 트레이스 Worker가 준비 전에 결과를 반환했습니다.")));
        return;
      }
      if (response.type === "studio-image-trace/failure") {
        finish(() => reject(deserializeWorkerError(response)));
        return;
      }
      finish(() => resolve({ execution: "worker", grid: response.grid, layers: response.layers }));
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      if (!requestPosted) {
        rejectWorkerUnavailable(
          "이미지 트레이스 Worker가 준비되기 전에 사용할 수 없게 되었습니다.",
          event.error ?? event.message,
        );
        return;
      }
      // 픽셀 버퍼가 이미 전송(detach)돼 직접 실행으로 되돌릴 데이터가 없다.
      const error =
        event.error instanceof Error
          ? event.error
          : new Error(event.message || "이미지 트레이스 Worker 실행 중 오류가 발생했습니다.");
      finish(() => reject(error));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    readyTimer = setTimeout(
      () => rejectWorkerUnavailable("이미지 트레이스 Worker 준비 시간이 초과되었습니다."),
      3_000,
    );
  });
}

/**
 * 래스터 → 명도 격자 변환 + 색상 레이어 분리를 한 번의 모듈 Worker 호출로 실행한다.
 * ArrayBuffer 기반 픽셀 데이터는 소유권이 이전(detach)되어 전송된다. 선택한 Worker를
 * 사용할 수 없으면 unavailable 로 종료하고, 실행이 실패하면 같은 요청을 메인 스레드에서
 * 다시 실행하지 않는다(매직 완드 Worker 와 같은 계약). direct 모드는 호출부가 실행
 * 권한을 처음부터 메인 스레드로 고정한 경우에만 쓴다.
 */
export async function runStudioImageTraceWorker(
  request: StudioImageTraceWorkerRunRequest,
  options: StudioImageTraceWorkerClientOptions = {},
): Promise<StudioImageTraceWorkerClientResult> {
  throwIfAborted(options.signal);
  const executionMode = options.executionMode ?? "worker";
  if (executionMode === "direct") return runImageTraceDirect(request, options.signal);
  const factory =
    options.workerFactory === undefined ? createStudioImageTraceModuleWorker : options.workerFactory;
  if (!factory) throw createWorkerUnavailableError("이미지 트레이스 Worker를 만들 수 없습니다.");

  let worker: StudioImageTraceWorkerLike | null;
  try {
    worker = factory();
  } catch (error) {
    throw createWorkerUnavailableError("이미지 트레이스 Worker를 만들 수 없습니다.", error);
  }
  if (!worker) throw createWorkerUnavailableError("이미지 트레이스 Worker를 만들 수 없습니다.");
  return runImageTraceWithWorker(worker, request, options.signal);
}
