/**
 * .skp 변환 클라이언트 — Worker 로 보내고, 취소·시간 초과를 강제하고, 진행 단계를 전달한다.
 *
 * 실행 위치 규칙(기존 OBJ·GLB 검증 클라이언트와 같은 "선택은 한 번, 실패는 그대로" 원칙)
 * - 기본(worker): 요청마다 새 Worker 를 만들고 끝나면 종료한다. openskp 는 힙을 크게 쓰므로 변환이 끝난
 *   Worker 를 살려 두지 않는다. Worker 가 시작·실행에 실패하면 그 요청은 실패로 끝나며(skp-converter-unavailable)
 *   메인 스레드로 몰래 다시 시도하지 않는다.
 * - Worker 생성자가 없는 환경에서만 메인 스레드 폴백을 쓴다. 원본 크기를 STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES
 *   이하로 제한하고, 보고서(conversion.execution = "main-thread")와 경고(main-thread-fallback)에 그대로 남긴다.
 * - direct: 호출자가 명시적으로 고른 메인 스레드 실행. 같은 소형 파일 상한이 적용된다.
 *
 * 취소(AbortSignal)와 시간 초과는 buildScene() 이 동기 함수라 메시지로 알릴 수 없으므로 Worker 종료로 강제한다.
 *
 * Worker 를 만들기 전에 크기·시그니처·버전·압축 해제 모델 데이터 크기를 메인 스레드에서 먼저 확인한다(앞 4KB 와 파일 끝
 * 중앙 디렉터리만 읽는 순수 검사). 시그니처가 다른 파일, 2013 이전 파일, 상한을 넘는 파일은 Worker 생성·전송 비용 없이
 * 즉시 실패한다. Worker 안에서도 같은 검사를 다시 한다.
 */

import {
  STUDIO_BG3D_SKP_CONVERSION_TIMEOUT_MS,
  STUDIO_BG3D_SKP_MAX_SOURCE_BYTES,
  StudioBg3dSkpConversionError,
  StudioBg3dSkpConverterUnavailableError,
  createStudioBg3dSkpConversionError,
  isStudioBg3dSkpFailureReason,
  type StudioBg3dSkpExecution,
  type StudioBg3dSkpStageProgress,
} from "./studio-bg3d-skp-contract";
import { parseStudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";
import { preflightStudioBg3dSkpSource } from "./studio-bg3d-skp-preflight";
import {
  STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION,
  isStudioBg3dSkpWorkerResponse,
  type StudioBg3dSkpWorkerRequest,
} from "./studio-bg3d-skp-worker-protocol";

import type { OpenSkpModuleLoader, StudioBg3dSkpConversionOutput } from "./studio-bg3d-skp-conversion-core";

export type StudioBg3dSkpExecutionBackend = "worker" | "direct";

interface WorkerMessageEventLike {
  readonly data: unknown;
}

interface WorkerErrorEventLike {
  preventDefault?(): void;
}

export interface StudioBg3dSkpWorkerLike {
  postMessage(message: StudioBg3dSkpWorkerRequest, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: WorkerMessageEventLike) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: WorkerErrorEventLike) => void): void;
  removeEventListener(type: "message", listener: (event: WorkerMessageEventLike) => void): void;
  removeEventListener(type: "error" | "messageerror", listener: (event: WorkerErrorEventLike) => void): void;
  terminate(): void;
}

export interface StudioBg3dSkpConvertOptions {
  readonly signal?: AbortSignal;
  /** 한 번 선택한 뒤 바꾸지 않는다. 생략하면 제품 기본인 Worker. */
  readonly executionBackend?: StudioBg3dSkpExecutionBackend;
  /** 프로필이 정한 원본 상한. 생략하면 데스크톱 상한. */
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  readonly onStage?: (progress: StudioBg3dSkpStageProgress) => void;
  /** true 면 입력 ArrayBuffer 를 Worker 로 전송(이 쪽에서는 쓸 수 없게 됨)해 복사를 피한다. */
  readonly transferInput?: boolean;
  /** 테스트 주입점. */
  readonly workerFactory?: () => StudioBg3dSkpWorkerLike;
  readonly isWorkerAvailable?: () => boolean;
  readonly loadModule?: OpenSkpModuleLoader;
}

function cancelled(): StudioBg3dSkpConversionError {
  return new StudioBg3dSkpConversionError("skp-cancelled", "SketchUp 변환이 취소되었습니다.", { reason: "aborted" });
}

function unavailable(
  message: string,
  reason: "worker-failed" | "worker-protocol",
  cause?: unknown,
): StudioBg3dSkpConverterUnavailableError {
  return new StudioBg3dSkpConverterUnavailableError(message, {
    reason,
    ...(cause === undefined ? {} : { cause }),
  });
}

function browserWorkerFactory(): StudioBg3dSkpWorkerLike {
  return new Worker(
    new URL("./studio-bg3d-skp.worker.ts", import.meta.url),
    { name: "toonstudio-bg3d-skp-converter", type: "module" },
  );
}

function defaultWorkerAvailable(): boolean {
  return typeof Worker === "function";
}

/** 변환 위치와 무관하게 먼저 거는 사전 검사. 실패는 모두 StudioBg3dSkpConversionError 다. */
function preflightInput(
  input: ArrayBuffer | Uint8Array,
  maxBytes: number,
  execution: StudioBg3dSkpExecution,
): void {
  const view = input instanceof Uint8Array ? input : new Uint8Array(input);
  preflightStudioBg3dSkpSource(view, { maxBytes, mainThread: execution === "main-thread" });
}

function copyToOwnedBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  const source = input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return Uint8Array.from(source).buffer;
}

async function convertOnMainThread(
  input: ArrayBuffer | Uint8Array,
  maxBytes: number,
  options: StudioBg3dSkpConvertOptions,
): Promise<StudioBg3dSkpConversionOutput> {
  const signal = options.signal;
  if (signal?.aborted) throw cancelled();
  // 폴백 경로에서만 런타임(= 변환 코어)을 불러온다. Worker 경로는 메인 번들에 코어를 싣지 않는다.
  const runtime = await import("./studio-bg3d-skp-worker-runtime");
  if (signal?.aborted) throw cancelled();
  const output = await runtime.runStudioBg3dSkpConversion(input, {
    execution: "main-thread",
    maxBytes,
    timeoutMs: options.timeoutMs ?? STUDIO_BG3D_SKP_CONVERSION_TIMEOUT_MS,
    ...(options.loadModule ? { loadModule: options.loadModule } : {}),
    hooks: {
      ...(options.onStage ? { onStage: options.onStage } : {}),
      isCancelled: () => signal?.aborted === true,
      // 단계 사이마다 한 번 양보해 진행 표시와 입력이 멈추지 않게 한다.
      yieldToEventLoop: () => new Promise<void>((resolve) => { setTimeout(resolve, 0); }),
    },
  });
  // 동기 구간 중에 들어온 취소도 성공으로 돌려보내지 않는다.
  if (signal?.aborted) throw cancelled();
  return output;
}

function convertInWorker(
  input: ArrayBuffer | Uint8Array,
  maxBytes: number,
  options: StudioBg3dSkpConvertOptions,
): Promise<StudioBg3dSkpConversionOutput> {
  const signal = options.signal;
  const timeoutMs = Math.max(1, options.timeoutMs ?? STUDIO_BG3D_SKP_CONVERSION_TIMEOUT_MS);
  const bytes = options.transferInput && input instanceof ArrayBuffer ? input : copyToOwnedBuffer(input);
  return new Promise<StudioBg3dSkpConversionOutput>((resolve, reject) => {
    const requestId = 1;
    let worker: StudioBg3dSkpWorkerLike;
    try {
      worker = (options.workerFactory ?? browserWorkerFactory)();
    } catch (error) {
      reject(unavailable("SketchUp 변환 Worker 를 만들지 못했습니다.", "worker-failed", error));
      return;
    }

    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const cleanup = (): void => {
      if (timeout !== null) clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onWorkerFailure);
      worker.removeEventListener("messageerror", onProtocolFailure);
      // 변환이 끝났든 실패했든 Worker 의 힙을 바로 돌려준다.
      worker.terminate();
    };
    const finish = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      settle();
    };
    const fail = (error: StudioBg3dSkpConversionError): void => finish(() => { reject(error); });

    function onAbort(): void {
      fail(cancelled());
    }
    function onWorkerFailure(event: WorkerErrorEventLike): void {
      event.preventDefault?.();
      fail(unavailable("SketchUp 변환 Worker 가 중단되었습니다.", "worker-failed"));
    }
    function onProtocolFailure(): void {
      fail(unavailable("SketchUp 변환 Worker 응답을 읽지 못했습니다.", "worker-protocol"));
    }
    function onMessage(event: WorkerMessageEventLike): void {
      const response = event.data;
      if (!isStudioBg3dSkpWorkerResponse(response) || response.requestId !== requestId) {
        onProtocolFailure();
        return;
      }
      if (response.kind === "progress") {
        options.onStage?.({ stage: response.stage, fraction: response.fraction, execution: "worker" });
        return;
      }
      if (response.kind === "error") {
        const report = parseStudioBg3dSkpImportReport(response.report);
        fail(createStudioBg3dSkpConversionError(response.code, response.message, {
          ...(report ? { report } : {}),
          ...(response.detail ? { detail: response.detail } : {}),
          ...(isStudioBg3dSkpFailureReason(response.reason) ? { reason: response.reason } : {}),
        }));
        return;
      }
      const report = parseStudioBg3dSkpImportReport(response.report);
      if (!report) {
        onProtocolFailure();
        return;
      }
      finish(() => { resolve({ glb: new Uint8Array(response.glb), report }); });
    }

    if (signal?.aborted) {
      fail(cancelled());
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onWorkerFailure);
    worker.addEventListener("messageerror", onProtocolFailure);
    timeout = setTimeout(() => {
      fail(new StudioBg3dSkpConversionError(
        "skp-timeout",
        "SketchUp 변환이 제한 시간을 넘어 중단되었습니다.",
        { reason: "timeout", detail: { timeoutMs } },
      ));
    }, timeoutMs);

    const request: StudioBg3dSkpWorkerRequest = {
      version: STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION,
      kind: "convert",
      requestId,
      bytes,
      maxBytes,
    };
    try {
      worker.postMessage(request, [bytes]);
    } catch (error) {
      fail(unavailable("SketchUp 변환 Worker 로 파일을 보내지 못했습니다.", "worker-failed", error));
    }
  });
}

/**
 * .skp 바이트를 GLB 와 보고서로 바꾼다. 실패는 모두 StudioBg3dSkpConversionError(code = 가져오기 오류 코드)다.
 * 실행 위치는 호출 시점에 한 번 정해진다.
 */
export async function convertStudioBg3dSkp(
  input: ArrayBuffer | Uint8Array,
  options: StudioBg3dSkpConvertOptions = {},
): Promise<StudioBg3dSkpConversionOutput> {
  const backend: StudioBg3dSkpExecutionBackend = options.executionBackend ?? "worker";
  if (backend !== "worker" && backend !== "direct") {
    throw new TypeError("studio-bg3d-skp:invalid-execution-backend");
  }
  if (options.signal?.aborted) throw cancelled();
  const maxBytes = options.maxBytes ?? STUDIO_BG3D_SKP_MAX_SOURCE_BYTES;
  const execution: StudioBg3dSkpExecution = backend === "worker" && (options.isWorkerAvailable ?? defaultWorkerAvailable)()
    ? "worker"
    : "main-thread";
  preflightInput(input, maxBytes, execution);
  return execution === "worker"
    ? convertInWorker(input, maxBytes, options)
    : convertOnMainThread(input, maxBytes, options);
}
