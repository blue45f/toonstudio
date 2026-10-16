/**
 * 컷 감지 클라이언트 — Worker 로 보내고, 취소·시간 상한을 강제하고, 응답 구조를 검증한다.
 *
 * 실행 위치 규칙(.skp 변환 클라이언트와 같은 "선택은 한 번, 실패는 그대로" 원칙)
 * - 기본(worker): 요청마다 새 Worker 를 만들고 끝나면 종료한다. 시작·실행에 실패하면 그 요청은 실패로 끝나며
 *   메인 스레드로 몰래 다시 시도하지 않는다.
 * - Worker 생성자가 없는 환경에서만 메인 스레드(direct) 실행을 기본으로 쓴다. 분석 래스터는 이미 maxAnalysisPixels 로
 *   제한되므로 실행 시간이 유한하고, 비동기 드라이버가 주기적으로 양보한다.
 * - direct: 호출자가 명시적으로 고른 메인 스레드 실행.
 *
 * 취소(AbortSignal)와 시간 초과는 Worker 종료로 강제한다. 종료 전에 cancel 메시지를 한 번 보내 협력적 정지를 시도한다.
 * 이미지 바이트는 외부로 나가지 않는다 — Worker 는 같은 브라우저 안의 별도 스레드이며 네트워크를 쓰지 않는다.
 */

import { detectPanelsAsync } from "./panel-detect-core";
import {
  PANEL_DETECT_WORKER_PROTOCOL_VERSION,
  isPanelDetectWorkerResponse,
  parsePanelDetectResult,
  toWorkerOptions,
  type PanelDetectWorkerRequest,
} from "./panel-detect-worker-protocol";
import { assertPanelDetectRaster } from "./panel-detect-raster";
import { PANEL_DETECT_LIMITS, PanelDetectError } from "./panel-detect-types";

import type { PanelDetectOptions, PanelDetectRaster, PanelDetectResult } from "./panel-detect-types";

export type PanelDetectExecutionBackend = "worker" | "direct";

interface WorkerMessageEventLike {
  readonly data: unknown;
}

export interface PanelDetectWorkerLike {
  postMessage(message: PanelDetectWorkerRequest, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: WorkerMessageEventLike) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: { preventDefault?(): void }) => void): void;
  removeEventListener(type: "message", listener: (event: WorkerMessageEventLike) => void): void;
  removeEventListener(type: "error" | "messageerror", listener: (event: { preventDefault?(): void }) => void): void;
  terminate(): void;
}

export interface PanelDetectClientOptions extends Omit<PanelDetectOptions, "now" | "isCancelled"> {
  readonly signal?: AbortSignal;
  /** 한 번 선택한 뒤 바꾸지 않는다. 생략하면 Worker 가 있으면 worker, 없으면 direct. */
  readonly executionBackend?: PanelDetectExecutionBackend;
  /** true 면 raster.data 의 ArrayBuffer 를 Worker 로 전송한다(호출한 쪽은 더 쓸 수 없다). 복사를 피한다. */
  readonly transferInput?: boolean;
  /** 테스트 주입점. */
  readonly workerFactory?: () => PanelDetectWorkerLike;
  readonly isWorkerAvailable?: () => boolean;
}

/** Worker 가 정상 종료 응답을 못 줄 때를 대비한 바깥 타이머 여유(ms). */
const OUTER_TIMEOUT_SLACK_MS = 2_000;

function browserWorkerFactory(): PanelDetectWorkerLike {
  return new Worker(new URL("./panel-detect.worker.ts", import.meta.url), {
    name: "toonstudio-panel-detect",
    type: "module",
  });
}

function defaultWorkerAvailable(): boolean {
  return typeof Worker === "function";
}

function ownedBuffer(raster: PanelDetectRaster, transferInput: boolean): ArrayBuffer {
  const data = raster.data;
  if (data instanceof Uint8ClampedArray || data instanceof Uint8Array) {
    const exact = data.byteOffset === 0
      && data.byteLength === data.buffer.byteLength
      && data.buffer instanceof ArrayBuffer;
    if (transferInput && exact && data.buffer instanceof ArrayBuffer) return data.buffer;
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
  }
  const copy = new Uint8Array(raster.width * raster.height * 4);
  for (let index = 0; index < copy.length; index += 1) copy[index] = data[index];
  return copy.buffer;
}

function detectInWorker(raster: PanelDetectRaster, options: PanelDetectClientOptions): Promise<PanelDetectResult> {
  const signal = options.signal;
  const timeoutMs = (options.timeLimitMs ?? PANEL_DETECT_LIMITS.defaultTimeLimitMs) + OUTER_TIMEOUT_SLACK_MS;
  const pixels = ownedBuffer(raster, options.transferInput === true);
  return new Promise<PanelDetectResult>((resolve, reject) => {
    const requestId = 1;
    let worker: PanelDetectWorkerLike;
    try {
      worker = (options.workerFactory ?? browserWorkerFactory)();
    } catch (error) {
      reject(new PanelDetectError("worker-unavailable", undefined, { cause: error }));
      return;
    }
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = (): void => {
      if (timer !== null) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onWorkerFailure);
      worker.removeEventListener("messageerror", onProtocolFailure);
      worker.terminate();
    };
    const finish = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      settle();
    };
    const fail = (error: PanelDetectError): void => finish(() => { reject(error); });

    function onAbort(): void {
      try {
        worker.postMessage({ version: PANEL_DETECT_WORKER_PROTOCOL_VERSION, kind: "cancel", requestId });
      } catch {
        // 종료가 어차피 강제하므로 협력적 취소 전달 실패는 무시한다.
      }
      fail(new PanelDetectError("cancelled"));
    }
    function onWorkerFailure(event: { preventDefault?(): void }): void {
      event.preventDefault?.();
      fail(new PanelDetectError("worker-failed"));
    }
    function onProtocolFailure(): void {
      fail(new PanelDetectError("worker-protocol"));
    }
    function onMessage(event: WorkerMessageEventLike): void {
      const response = event.data;
      if (!isPanelDetectWorkerResponse(response) || response.requestId !== requestId) {
        onProtocolFailure();
        return;
      }
      if (response.kind === "error") {
        fail(new PanelDetectError(response.code, response.message));
        return;
      }
      const parsed = parsePanelDetectResult(response.result, { width: raster.width, height: raster.height });
      if (!parsed) {
        onProtocolFailure();
        return;
      }
      finish(() => { resolve(parsed); });
    }

    timer = setTimeout(() => fail(new PanelDetectError("timeout")), timeoutMs);
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onWorkerFailure);
    worker.addEventListener("messageerror", onProtocolFailure);
    signal?.addEventListener("abort", onAbort, { once: true });
    const request: PanelDetectWorkerRequest = {
      version: PANEL_DETECT_WORKER_PROTOCOL_VERSION,
      kind: "detect",
      requestId,
      width: raster.width,
      height: raster.height,
      pixels,
      options: toWorkerOptions(options),
    };
    try {
      worker.postMessage(request, [pixels]);
    } catch (error) {
      finish(() => { reject(new PanelDetectError("worker-failed", undefined, { cause: error })); });
    }
  });
}

/** 컷 감지를 백그라운드에서 실행한다. 모든 실패는 PanelDetectError 로 끝난다. */
export async function detectPanelsInBackground(
  raster: PanelDetectRaster,
  options: PanelDetectClientOptions = {},
): Promise<PanelDetectResult> {
  assertPanelDetectRaster(raster);
  const signal = options.signal;
  if (signal?.aborted) throw new PanelDetectError("cancelled");
  const backend = options.executionBackend
    ?? ((options.isWorkerAvailable ?? defaultWorkerAvailable)() ? "worker" : "direct");
  if (backend !== "worker" && backend !== "direct") {
    throw new PanelDetectError("invalid-options", "컷 감지 실행 위치 값이 올바르지 않아요.");
  }
  if (backend === "direct") {
    return detectPanelsAsync(raster, { ...options, isCancelled: () => signal?.aborted === true });
  }
  return detectInWorker(raster, options);
}
