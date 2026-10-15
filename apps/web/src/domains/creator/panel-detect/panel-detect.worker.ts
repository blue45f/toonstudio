/// <reference lib="webworker" />

import { detectPanelsAsync } from "./panel-detect-core";
import {
  PANEL_DETECT_WORKER_PROTOCOL_VERSION,
  isPanelDetectWorkerRequest,
  type PanelDetectWorkerDetectRequest,
  type PanelDetectWorkerResponse,
} from "./panel-detect-worker-protocol";
import { PanelDetectError } from "./panel-detect-types";

const scope = self as DedicatedWorkerGlobalScope;
/** Worker 하나는 감지 하나만 맡는다. 클라이언트는 요청마다 새 Worker 를 만들고 끝나면 종료한다. */
let busy = false;
const cancelled = new Set<number>();

/** 매크로태스크 양보: cancel 메시지가 점검 시점 사이에 도착해 처리될 틈을 만든다(setTimeout 의 4ms 하한을 피한다). */
function yieldToMessages(): Promise<void> {
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

function post(response: PanelDetectWorkerResponse): void {
  scope.postMessage(response);
}

async function execute(request: PanelDetectWorkerDetectRequest): Promise<void> {
  try {
    const result = await detectPanelsAsync(
      { width: request.width, height: request.height, data: new Uint8ClampedArray(request.pixels) },
      { ...request.options, isCancelled: () => cancelled.has(request.requestId) },
      { yieldNow: yieldToMessages },
    );
    post({ version: PANEL_DETECT_WORKER_PROTOCOL_VERSION, kind: "result", requestId: request.requestId, result });
  } catch (error) {
    const known = error instanceof PanelDetectError ? error : null;
    post({
      version: PANEL_DETECT_WORKER_PROTOCOL_VERSION,
      kind: "error",
      requestId: request.requestId,
      code: known ? known.code : "worker-failed",
      message: known ? known.message : "컷 감지 중 알 수 없는 오류가 발생했어요.",
    });
  } finally {
    cancelled.delete(request.requestId);
    busy = false;
  }
}

scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!isPanelDetectWorkerRequest(message)) return;
  if (message.kind === "cancel") {
    cancelled.add(message.requestId);
    return;
  }
  if (busy) return;
  busy = true;
  void execute(message);
});

export {};
