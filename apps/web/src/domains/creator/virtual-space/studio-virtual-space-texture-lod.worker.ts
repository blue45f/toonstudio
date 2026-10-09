/// <reference lib="webworker" />

import {
  STUDIO_TEXTURE_LOD_WORKER_PROTOCOL_VERSION,
  isStudioTextureLodWorkerRequest,
  studioTextureLodWorkerRespond,
  type StudioTextureLodWorkerResponse,
} from "./studio-virtual-space-texture-lod-worker-protocol";

const scope = self as DedicatedWorkerGlobalScope;

function requestIdOf(value: unknown): number {
  const id = typeof value === "object" && value !== null ? Reflect.get(value, "requestId") : undefined;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : 1;
}

function fail(requestId: number, message: string): void {
  const response: StudioTextureLodWorkerResponse = { version: STUDIO_TEXTURE_LOD_WORKER_PROTOCOL_VERSION, kind: "error", requestId, message };
  scope.postMessage(response);
}

scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!isStudioTextureLodWorkerRequest(request)) {
    fail(requestIdOf(request), "invalid-request");
    return;
  }
  try {
    const response = studioTextureLodWorkerRespond(request);
    scope.postMessage(response, response.kind === "result" ? [response.data] : []);
  } catch (error) {
    fail(request.requestId, error instanceof Error ? error.message : "lod-failed");
  }
});
