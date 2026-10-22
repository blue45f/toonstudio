/**
 * 앵커 특징 분석 클라이언트 — Worker 로 보내고, 취소·시간 상한을 강제하고, 응답 구조를 검증한다.
 *
 * 실행 위치 규칙은 컷 감지 클라이언트와 같다: 요청마다 새 Worker 를 만들고 끝나면 종료한다. Worker 시작·실행에 실패하면
 * 그 요청은 실패로 끝나며 메인 스레드로 몰래 다시 시도하지 않는다. Worker 생성자가 없는 환경에서만 메인 스레드(direct)
 * 실행을 기본으로 쓴다. 분석 래스터는 긴 변 256px 로 제한되어 실행 시간이 짧고 유한하다.
 *
 * 이미지 바이트는 외부로 나가지 않는다 — Worker 는 같은 브라우저 안의 별도 스레드이며 네트워크를 쓰지 않는다.
 */

import {
  ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION,
  isAnchorFeatureWorkerResponse,
  parseAnchorImageFeatures,
  type AnchorFeatureWorkerRequest,
} from "./anchor-consistency-worker-protocol";
import { extractAnchorFeatures, type AnchorImageFeatures } from "./anchor-image-features";
import { AnchorFeatureError, assertAnchorRaster, type AnchorRaster } from "./anchor-raster";

export type AnchorFeatureBackend = "worker" | "direct";

interface WorkerMessageEventLike {
  readonly data: unknown;
}

export interface AnchorFeatureWorkerLike {
  postMessage(message: AnchorFeatureWorkerRequest, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: WorkerMessageEventLike) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: { preventDefault?(): void }) => void): void;
  removeEventListener(type: "message", listener: (event: WorkerMessageEventLike) => void): void;
  removeEventListener(type: "error" | "messageerror", listener: (event: { preventDefault?(): void }) => void): void;
  terminate(): void;
}

export interface AnchorFeatureClientOptions {
  readonly signal?: AbortSignal;
  /** 한 번 선택한 뒤 바꾸지 않는다. 생략하면 Worker 가 있으면 worker, 없으면 direct. */
  readonly executionBackend?: AnchorFeatureBackend;
  readonly maxEdge?: number;
  /** Worker 가 응답하지 않을 때 기다리는 최대 시간(ms). */
  readonly timeoutMs?: number;
  /** 테스트 주입점. */
  readonly workerFactory?: () => AnchorFeatureWorkerLike;
  readonly isWorkerAvailable?: () => boolean;
}

export const ANCHOR_FEATURE_TIMEOUT_MS = 15_000;

function browserWorkerFactory(): AnchorFeatureWorkerLike {
  return new Worker(new URL("./anchor-consistency.worker.ts", import.meta.url), {
    name: "toonstudio-anchor-consistency",
    type: "module",
  });
}

function defaultWorkerAvailable(): boolean {
  return typeof Worker === "function";
}

/** 호출자의 버퍼를 건드리지 않도록 복사본을 전송한다. */
function copyPixels(raster: AnchorRaster): ArrayBuffer {
  const copy = new Uint8Array(raster.data.byteLength);
  copy.set(raster.data);
  return copy.buffer;
}

function extractInWorker(raster: AnchorRaster, options: AnchorFeatureClientOptions): Promise<AnchorImageFeatures> {
  const signal = options.signal;
  const pixels = copyPixels(raster);
  return new Promise<AnchorImageFeatures>((resolve, reject) => {
    const requestId = 1;
    let worker: AnchorFeatureWorkerLike;
    try {
      worker = (options.workerFactory ?? browserWorkerFactory)();
    } catch (cause) {
      reject(new AnchorFeatureError("worker-unavailable", { cause }));
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
    const fail = (error: AnchorFeatureError): void => finish(() => { reject(error); });

    function onAbort(): void {
      fail(new AnchorFeatureError("cancelled"));
    }
    function onWorkerFailure(event: { preventDefault?(): void }): void {
      event.preventDefault?.();
      fail(new AnchorFeatureError("worker-failed"));
    }
    function onProtocolFailure(): void {
      fail(new AnchorFeatureError("worker-protocol"));
    }
    function onMessage(event: WorkerMessageEventLike): void {
      const response = event.data;
      if (!isAnchorFeatureWorkerResponse(response) || response.requestId !== requestId) {
        onProtocolFailure();
        return;
      }
      if (response.kind === "error") {
        fail(new AnchorFeatureError(response.code));
        return;
      }
      const parsed = parseAnchorImageFeatures(response.features);
      if (!parsed) {
        onProtocolFailure();
        return;
      }
      finish(() => { resolve(parsed); });
    }

    timer = setTimeout(() => fail(new AnchorFeatureError("timeout")), options.timeoutMs ?? ANCHOR_FEATURE_TIMEOUT_MS);
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onWorkerFailure);
    worker.addEventListener("messageerror", onProtocolFailure);
    signal?.addEventListener("abort", onAbort, { once: true });
    const request: AnchorFeatureWorkerRequest = {
      version: ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION,
      kind: "extract",
      requestId,
      width: raster.width,
      height: raster.height,
      pixels,
      ...(options.maxEdge === undefined ? {} : { maxEdge: options.maxEdge }),
    };
    try {
      worker.postMessage(request, [pixels]);
    } catch (cause) {
      fail(new AnchorFeatureError("worker-failed", { cause }));
    }
  });
}

/** 특징 분석을 백그라운드에서 실행한다. 모든 실패는 AnchorFeatureError 로 끝난다. */
export async function extractAnchorFeaturesInBackground(
  raster: AnchorRaster,
  options: AnchorFeatureClientOptions = {},
): Promise<AnchorImageFeatures> {
  assertAnchorRaster(raster);
  const signal = options.signal;
  if (signal?.aborted) throw new AnchorFeatureError("cancelled");
  const backend = options.executionBackend ?? ((options.isWorkerAvailable ?? defaultWorkerAvailable)() ? "worker" : "direct");
  if (backend === "direct") {
    return extractAnchorFeatures(raster, {
      isCancelled: () => signal?.aborted === true,
      ...(options.maxEdge === undefined ? {} : { maxEdge: options.maxEdge }),
    });
  }
  return extractInWorker(raster, options);
}
