/// <reference lib="webworker" />

import { extractAnchorFeatures } from "./anchor-image-features";
import {
  ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION,
  isAnchorFeatureWorkerRequest,
  type AnchorFeatureWorkerResponse,
} from "./anchor-consistency-worker-protocol";
import { AnchorFeatureError } from "./anchor-raster";

const scope = self as DedicatedWorkerGlobalScope;
/** Worker 하나는 요청 하나만 맡는다. 클라이언트는 요청마다 새 Worker 를 만들고 끝나면 종료한다. */
let busy = false;

function post(response: AnchorFeatureWorkerResponse): void {
  scope.postMessage(response);
}

scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!isAnchorFeatureWorkerRequest(message) || busy) return;
  busy = true;
  try {
    const features = extractAnchorFeatures(
      { width: message.width, height: message.height, data: new Uint8ClampedArray(message.pixels) },
      message.maxEdge === undefined ? {} : { maxEdge: message.maxEdge },
    );
    post({ version: ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION, kind: "result", requestId: message.requestId, features });
  } catch (error) {
    post({
      version: ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION,
      kind: "error",
      requestId: message.requestId,
      code: error instanceof AnchorFeatureError ? error.code : "worker-failed",
    });
  } finally {
    busy = false;
  }
});

export {};
