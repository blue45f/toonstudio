import type { MagicWandRegion } from "./studio-magic-wand";
import { quickSelectionRegionFromRaster } from "./studio-quick-selection";
import {
  STUDIO_QUICK_SELECTION_WORKER_PROTOCOL_VERSION,
  studioQuickSelectionRequestTransfers,
  type StudioQuickSelectionWorkerResponseMessage,
  type StudioQuickSelectionWorkerRunMessage,
  type StudioQuickSelectionWorkerRunRequest,
} from "./studio-quick-selection-worker-protocol";

export interface StudioQuickSelectionWorkerLike {
  onmessage: ((event: MessageEvent<StudioQuickSelectionWorkerResponseMessage>) => void) | null;
  onerror:
    | ((event: {
        readonly error?: unknown;
        readonly message?: string;
        preventDefault?(): void;
      }) => void)
    | null;
  postMessage(message: StudioQuickSelectionWorkerRunMessage, transfer: Transferable[]): void;
  terminate(): void;
}

export type StudioQuickSelectionWorkerFactory = () => StudioQuickSelectionWorkerLike | null;
export type StudioQuickSelectionExecutionMode = "worker" | "direct";

export interface StudioQuickSelectionWorkerClientOptions {
  signal?: AbortSignal;
  /** Execution authority is selected before the operation starts and never changes afterward. */
  executionMode?: StudioQuickSelectionExecutionMode;
  /** Test/integration seam for Worker mode. `null` means unavailable, not direct execution. */
  workerFactory?: StudioQuickSelectionWorkerFactory | null;
}

export interface StudioQuickSelectionWorkerClientResult {
  execution: "worker" | "direct";
  region: MagicWandRegion;
  selectedCount: number;
  bounds: { x: number; y: number; width: number; height: number } | null;
}

/** Vite statically discovers this exact URL pattern and emits an isolated module-worker chunk. */
export function createStudioQuickSelectionModuleWorker(): StudioQuickSelectionWorkerLike | null {
  if (typeof Worker !== "function") return null;
  return new Worker(new URL("./studio-quick-selection.worker.ts", import.meta.url), {
    type: "module",
    name: "toonstudio-quick-selection",
  }) as unknown as StudioQuickSelectionWorkerLike;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("빠른 선택 계산을 취소했습니다.", "AbortError");
  }
  const error = new Error("빠른 선택 계산을 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError();
}

function createWorkerUnavailableError(message: string, cause?: unknown): Error {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.name = "StudioQuickSelectionWorkerUnavailableError";
  return error;
}

function runQuickSelectionDirect(
  request: StudioQuickSelectionWorkerRunRequest,
  signal: AbortSignal | undefined,
): StudioQuickSelectionWorkerClientResult {
  throwIfAborted(signal);
  const { region, selectedCount, bounds } = quickSelectionRegionFromRaster(
    { width: request.w, height: request.h, data: request.data },
    request.seeds,
    { tolerance: request.tolerance },
  );
  return { execution: "direct", region, selectedCount, bounds };
}

function deserializeWorkerError(response: Extract<
  StudioQuickSelectionWorkerResponseMessage,
  { type: "studio-quick-selection/failure" }
>): Error {
  const error = new Error(response.error.message);
  error.name = response.error.name || "Error";
  return error;
}

function runQuickSelectionWithWorker(
  worker: StudioQuickSelectionWorkerLike,
  request: StudioQuickSelectionWorkerRunRequest,
  signal: AbortSignal | undefined,
): Promise<StudioQuickSelectionWorkerClientResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let requestPosted = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    const message: StudioQuickSelectionWorkerRunMessage = {
      type: "studio-quick-selection/run",
      version: STUDIO_QUICK_SELECTION_WORKER_PROTOCOL_VERSION,
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
      if (response.version !== STUDIO_QUICK_SELECTION_WORKER_PROTOCOL_VERSION) {
        finish(() => reject(new Error("빠른 선택 Worker가 알 수 없는 응답을 반환했습니다.")));
        return;
      }
      if (response.type === "studio-quick-selection/ready") {
        if (requestPosted) return;
        if (readyTimer !== null) {
          clearTimeout(readyTimer);
          readyTimer = null;
        }
        try {
          worker.postMessage(message, studioQuickSelectionRequestTransfers(message));
          requestPosted = true;
        } catch (error) {
          rejectWorkerUnavailable("빠른 선택 Worker에 요청을 전달하지 못했습니다.", error);
        }
        return;
      }
      if (!requestPosted) {
        finish(() => reject(new Error("빠른 선택 Worker가 준비 전에 결과를 반환했습니다.")));
        return;
      }
      if (response.type === "studio-quick-selection/failure") {
        finish(() => reject(deserializeWorkerError(response)));
        return;
      }
      finish(() => resolve({
        execution: "worker",
        region: response.region,
        selectedCount: response.selectedCount,
        bounds: response.bounds,
      }));
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      if (!requestPosted) {
        rejectWorkerUnavailable(
          "빠른 선택 Worker가 준비되기 전에 사용할 수 없게 되었습니다.",
          event.error ?? event.message,
        );
        return;
      }
      // 픽셀 버퍼가 이미 전송(detach)돼 직접 실행으로 되돌릴 데이터가 없다.
      const error =
        event.error instanceof Error
          ? event.error
          : new Error(event.message || "빠른 선택 Worker 실행 중 오류가 발생했습니다.");
      finish(() => reject(error));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    readyTimer = setTimeout(
      () => rejectWorkerUnavailable("빠른 선택 Worker 준비 시간이 초과되었습니다."),
      3_000,
    );
  });
}

/**
 * 빠른 선택의 영역 성장+윤곽 추적을 한 번의 모듈 Worker 호출로 실행한다. ArrayBuffer 기반 픽셀
 * 데이터는 소유권이 이전(detach)되어 전송된다. 선택한 Worker를 사용할 수 없거나 실행이 실패하면
 * 같은 요청을 메인 스레드에서 다시 실행하지 않고 unavailable/reject로 종료한다.
 */
export async function runStudioQuickSelectionWorker(
  request: StudioQuickSelectionWorkerRunRequest,
  options: StudioQuickSelectionWorkerClientOptions = {},
): Promise<StudioQuickSelectionWorkerClientResult> {
  throwIfAborted(options.signal);
  const executionMode = options.executionMode ?? "worker";
  if (executionMode === "direct") return runQuickSelectionDirect(request, options.signal);
  const factory =
    options.workerFactory === undefined ? createStudioQuickSelectionModuleWorker : options.workerFactory;
  if (!factory) throw createWorkerUnavailableError("빠른 선택 Worker를 만들 수 없습니다.");

  let worker: StudioQuickSelectionWorkerLike | null;
  try {
    worker = factory();
  } catch (error) {
    throw createWorkerUnavailableError("빠른 선택 Worker를 만들 수 없습니다.", error);
  }
  if (!worker) throw createWorkerUnavailableError("빠른 선택 Worker를 만들 수 없습니다.");
  return runQuickSelectionWithWorker(worker, request, options.signal);
}
