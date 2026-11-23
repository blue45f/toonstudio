/**
 * `StudioComputeWorkerPool` 공개 계약 타입, 오류 클래스, 풀 크기 계산 및
 * `OffscreenCanvas` 제어권 이전(`transferControlToOffscreen`) 헬퍼.
 */

import type {
  StudioComputeJobInput,
  StudioWorkerInboundMessage,
  StudioWorkerOutboundMessage,
} from "./compute-job-executor";
import type { ComputeBackendTier } from "./wasm-simd-pixel-kernel";

export const MAX_STUDIO_COMPUTE_WORKERS = 4;

export type StudioWorkerPoolErrorCode =
  | "aborted"
  | "timeout"
  | "worker-crashed"
  | "execution-failed"
  | "disposed";

export class StudioWorkerPoolError extends Error {
  readonly code: StudioWorkerPoolErrorCode;

  constructor(code: StudioWorkerPoolErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = code === "aborted" ? "AbortError" : "StudioWorkerPoolError";
  }
}

export interface WorkerLike {
  onmessage: ((event: MessageEvent<StudioWorkerOutboundMessage>) => void) | null;
  onerror: ((event: Event | ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: StudioWorkerInboundMessage, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface TransferControlCapableCanvas {
  transferControlToOffscreen?: () => OffscreenCanvas;
}

export type OffscreenCanvasTransferResult =
  | { readonly ok: true; readonly offscreenCanvas: OffscreenCanvas }
  | {
      readonly ok: false;
      readonly reason: "unsupported-runtime" | "unsupported-canvas" | "transfer-failed";
      readonly message: string;
    };

export interface OffscreenCanvasAttachResult {
  readonly ok: boolean;
  readonly surfaceId: string;
  readonly targetSlotIndex: number | null;
  readonly usedWorkerTransfer: boolean;
  readonly reason?: string;
}

export interface StudioComputeWorkerPoolOptions {
  /** 최대 병렬 워커 수 (기본값 `min(4, max(1, hardwareConcurrency - 1))`, 상한 4) */
  readonly maxWorkers?: number;
  /** 기본 작업 타임아웃 워치독 (ms, 기본값 15000) */
  readonly jobTimeoutMs?: number;
  /** 슬롯당 자동 재기동 최대 허용 횟수 (기본값 3) */
  readonly maxRespawnsPerSlot?: number;
  /** 워커 생성 팩토리 (미지정 시 브라우저 `Worker` 자동 사용) */
  readonly workerFactory?: (slotIndex: number) => WorkerLike;
  /** 강제로 비동기 마이크로태스크 폴백 모드 사용 여부 */
  readonly forceInlineFallback?: boolean;
  /** 하드웨어 동시성 오버라이드 (테스트·진단용) */
  readonly hardwareConcurrency?: number;
}

export interface StudioComputeJobOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  /** 기본값 `true`: `ArrayBuffer`를 `Transferable` 제로-카피 전송한다 */
  readonly transferInput?: boolean;
}

export interface StudioComputeWorkerPoolTelemetry {
  readonly maxWorkers: number;
  readonly activeWorkers: number;
  readonly idleWorkers: number;
  readonly spawnedWorkers: number;
  readonly crashedWorkerCount: number;
  readonly respawnedWorkerCount: number;
  readonly queuedJobs: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
  readonly cancelledJobs: number;
  readonly timedOutJobs: number;
  readonly avgJobMs: number;
  readonly totalJobMs: number;
  readonly zeroCopyBytesTransferred: number;
  readonly backendTier: ComputeBackendTier;
  readonly wasmSimd128: boolean;
  readonly offscreenCanvasSupported: boolean;
}

/**
 * `min(4, max(1, hardwareConcurrency - 1))` 규칙으로 기본 워커 풀 크기를 산출한다.
 */
export function computeDefaultPoolSize(hardwareConcurrency?: number): number {
  const raw =
    hardwareConcurrency !== undefined
      ? hardwareConcurrency
      : typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number"
        ? navigator.hardwareConcurrency
        : 4;
  const safeCores = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 4;
  return Math.min(MAX_STUDIO_COMPUTE_WORKERS, Math.max(1, safeCores - 1));
}

/**
 * HTMLCanvasElement의 렌더링 제어권을 `OffscreenCanvas`로 안전하게 이전한다.
 * 미지원 환경(JSDOM/SSR/구형 브라우저)이나 이미 이전된 캔버스에서는 예외를 던지지 않고 실패 사유를 반환한다.
 */
export function transferCanvasControlToOffscreen(
  canvas: TransferControlCapableCanvas | null | undefined,
): OffscreenCanvasTransferResult {
  if (typeof OffscreenCanvas !== "function") {
    return {
      ok: false,
      reason: "unsupported-runtime",
      message: "현재 런타임은 OffscreenCanvas를 지원하지 않습니다.",
    };
  }
  if (!canvas || typeof canvas.transferControlToOffscreen !== "function") {
    return {
      ok: false,
      reason: "unsupported-canvas",
      message: "전달된 캔버스 객체가 transferControlToOffscreen()을 제공하지 않습니다.",
    };
  }
  try {
    const offscreenCanvas = canvas.transferControlToOffscreen();
    return { ok: true, offscreenCanvas };
  } catch (error: unknown) {
    return {
      ok: false,
      reason: "transfer-failed",
      message: error instanceof Error
        ? error.message
        : "OffscreenCanvas 제어권 이전에 실패했습니다.",
    };
  }
}

export function cloneJobInputForNonTransfer(input: StudioComputeJobInput): StudioComputeJobInput {
  if (input.type === "offscreen-stroke-raster") {
    return {
      ...input,
      ...(input.baseRgba instanceof ArrayBuffer
        ? { baseRgba: input.baseRgba.slice(0) }
        : {}),
    };
  }
  return {
    ...input,
    rgba: input.rgba.slice(0),
  };
}

export function createDefaultModuleWorker(slotIndex: number): WorkerLike {
  const worker = new Worker(
    new URL("./studio-offload-compute.worker.ts", import.meta.url),
    {
      type: "module",
      name: `studio-offload-compute-${slotIndex}`,
    },
  );
  return worker as unknown as WorkerLike;
}
