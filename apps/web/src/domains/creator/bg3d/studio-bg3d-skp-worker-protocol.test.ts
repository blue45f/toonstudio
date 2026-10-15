import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION as VERSION,
  isStudioBg3dSkpWorkerRequest,
  isStudioBg3dSkpWorkerResponse,
} from "./studio-bg3d-skp-worker-protocol";

const request = { version: VERSION, kind: "convert", requestId: 1, bytes: new ArrayBuffer(8), maxBytes: 1024 };

describe("isStudioBg3dSkpWorkerRequest", () => {
  it("accepts a well-formed convert request", () => {
    expect(isStudioBg3dSkpWorkerRequest(request)).toBe(true);
  });

  it("rejects wrong versions, kinds, ids, payload types and limits", () => {
    expect(isStudioBg3dSkpWorkerRequest({ ...request, version: 2 })).toBe(false);
    expect(isStudioBg3dSkpWorkerRequest({ ...request, kind: "cancel" })).toBe(false);
    expect(isStudioBg3dSkpWorkerRequest({ ...request, requestId: 0 })).toBe(false);
    expect(isStudioBg3dSkpWorkerRequest({ ...request, requestId: 1.5 })).toBe(false);
    expect(isStudioBg3dSkpWorkerRequest({ ...request, bytes: new Uint8Array(8) })).toBe(false);
    expect(isStudioBg3dSkpWorkerRequest({ ...request, maxBytes: 0 })).toBe(false);
    expect(isStudioBg3dSkpWorkerRequest({ ...request, maxBytes: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isStudioBg3dSkpWorkerRequest(null)).toBe(false);
    expect(isStudioBg3dSkpWorkerRequest([request])).toBe(false);
  });
});

describe("isStudioBg3dSkpWorkerResponse", () => {
  const progress = { version: VERSION, kind: "progress", requestId: 1, stage: "building-scene", fraction: 0.5 };
  const result = { version: VERSION, kind: "result", requestId: 1, glb: new ArrayBuffer(4), report: {} };
  const failure = {
    version: VERSION,
    kind: "error",
    requestId: 1,
    code: "skp-empty-scene",
    message: "비어 있음",
    reason: "no-geometry",
    detail: { count: 0 },
    report: null,
  };

  it("accepts progress, result and error responses", () => {
    expect(isStudioBg3dSkpWorkerResponse(progress)).toBe(true);
    expect(isStudioBg3dSkpWorkerResponse({ ...progress, fraction: null })).toBe(true);
    expect(isStudioBg3dSkpWorkerResponse(result)).toBe(true);
    expect(isStudioBg3dSkpWorkerResponse(failure)).toBe(true);
    expect(isStudioBg3dSkpWorkerResponse({ ...failure, reason: null, detail: null })).toBe(true);
  });

  it("rejects unknown stages, out-of-range fractions and empty results", () => {
    expect(isStudioBg3dSkpWorkerResponse({ ...progress, stage: "teleporting" })).toBe(false);
    expect(isStudioBg3dSkpWorkerResponse({ ...progress, fraction: 1.5 })).toBe(false);
    expect(isStudioBg3dSkpWorkerResponse({ ...progress, fraction: -0.1 })).toBe(false);
    expect(isStudioBg3dSkpWorkerResponse({ ...result, glb: new ArrayBuffer(0) })).toBe(false);
    expect(isStudioBg3dSkpWorkerResponse({ ...result, glb: new Uint8Array(4) })).toBe(false);
  });

  it("rejects unknown failure codes and malformed detail", () => {
    expect(isStudioBg3dSkpWorkerResponse({ ...failure, code: "skp-exploded" })).toBe(false);
    expect(isStudioBg3dSkpWorkerResponse({ ...failure, message: 7 })).toBe(false);
    expect(isStudioBg3dSkpWorkerResponse({ ...failure, detail: { nested: { a: 1 } } })).toBe(false);
    expect(isStudioBg3dSkpWorkerResponse({ ...failure, detail: { count: Number.NaN } })).toBe(false);
  });

  it("rejects other protocol versions, kinds and request ids", () => {
    expect(isStudioBg3dSkpWorkerResponse({ ...progress, version: 99 })).toBe(false);
    expect(isStudioBg3dSkpWorkerResponse({ ...progress, kind: "log" })).toBe(false);
    expect(isStudioBg3dSkpWorkerResponse({ ...progress, requestId: -1 })).toBe(false);
    expect(isStudioBg3dSkpWorkerResponse("hello")).toBe(false);
  });
});
