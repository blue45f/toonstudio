// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import { useLinkedCutCapture } from "./use-linked-cut-capture";

const load = vi.hoisted(() => vi.fn());
vi.mock("../character-platform/document/character-document-v3-repository", () => ({
  getCharacterDocumentV3Repository: () => ({ load }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  load.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function fixture() {
  const scene = { ...createDefaultStudioVrmSceneDocument(), characterDocumentId: "actor" };
  const actor = { documentId: "actor", revision: 4, model: { assetId: "sample" }, surfaceInk: { layers: [] } };
  const root = { id: 9 };
  const h = {
    vrm: { scene: root }, status: "ready", error: "",
    captureRef: { current: { gl: {}, camera: {}, scene: { getObjectById: () => root } } },
    viewportApiRef: { current: { readCamera: () => scene.camera } },
    pendingCameraRestoreFrameRef: { current: null as number | null }, handleLinkedCutInsert: vi.fn(),
    vrmPropItems: [{ uid: "p1", propId: "glasses" }], wardrobeState: { hair: { itemId: "hair:short" } },
  };
  const controller = {
    authoring: { hydrated: true, authority: { getSnapshot: () => ({ document: actor }) }, snapshot: {} },
    binding: { busyReason: null }, hostRuntime: { unsupported: [] }, poseRuntime: {},
  };
  const request = { documentId: "actor", revision: 4, onFailure: vi.fn() };
  const props = { request, documentId: "actor", scene, src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAEA", h, controller };
  load.mockResolvedValue(actor);
  const view = renderHook(() => useLinkedCutCapture(props as unknown as Parameters<typeof useLinkedCutCapture>[0]));
  function mountAttachments() {
    view.result.current.onLinkedCutPropStatus("p1", "glasses", "ready");
    view.result.current.onLinkedCutWardrobeStatus("hair", "hair:short", "ready");
  }
  return { view, h, actor, scene, request, mountAttachments };
}

describe("mounted sequential linked-cut capture", () => {
  it("waits for the restored camera and both attachment receipts before dispatching the real capture", async () => {
    const { view, h, scene, mountAttachments } = fixture();
    act(() => { vi.advanceTimersByTime(64); });
    expect(h.handleLinkedCutInsert).not.toHaveBeenCalled();
    h.pendingCameraRestoreFrameRef.current = 8;
    mountAttachments();
    act(() => { vi.advanceTimersByTime(64); });
    expect(h.handleLinkedCutInsert).not.toHaveBeenCalled();
    h.pendingCameraRestoreFrameRef.current = null;
    act(() => { vi.advanceTimersByTime(32); });
    expect(h.handleLinkedCutInsert).toHaveBeenCalledTimes(1);
    expect(h.handleLinkedCutInsert).toHaveBeenCalledWith({ source: scene, pixels: { width: 512, height: 256 } });
    expect(await view.result.current.admitOutput()).toBe(true);
    view.result.current.onLinkedCutPropStatus("p1", "glasses", "detached");
    expect(await view.result.current.admitOutput()).toBe(false);
  });
  it("rejects an edit during PNG encoding or a job unmounted during repository validation", async () => {
    const { view, actor, request, mountAttachments } = fixture();
    mountAttachments();
    act(() => { vi.advanceTimersByTime(32); });
    load.mockResolvedValueOnce({ ...actor, revision: 5 });
    expect(await view.result.current.admitOutput()).toBe(false);
    let finish!: (value: typeof actor) => void;
    load.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const late = view.result.current.admitOutput();
    view.unmount();
    finish(actor);
    expect(await late).toBe(false);
    expect(request.onFailure).not.toHaveBeenCalled();
  });
  it("waits through a temporarily unavailable one-point glasses attachment and admits its applied frame", async () => {
    const { view, h, mountAttachments, request } = fixture();
    mountAttachments();
    view.result.current.onLinkedCutPropStatus("p1", "glasses", "unavailable");
    act(() => { vi.advanceTimersByTime(64); });
    expect(h.handleLinkedCutInsert).not.toHaveBeenCalled();
    view.result.current.onLinkedCutPropStatus("p1", "glasses", "ready");
    act(() => { vi.advanceTimersByTime(32); });
    expect(h.handleLinkedCutInsert).toHaveBeenCalledTimes(1);
    expect(await view.result.current.admitOutput()).toBe(true);
    expect(request.onFailure).not.toHaveBeenCalled();
  });
  it("preserves pixels when an expected GLB cannot load and names the failed instance", async () => {
    const { view, h, request } = fixture();
    view.result.current.onLinkedCutPropStatus("p1", "glasses", "unavailable", "asset-load-failed");
    act(() => { vi.advanceTimersByTime(64); });
    expect(request.onFailure).toHaveBeenCalledTimes(1);
    expect(request.onFailure).toHaveBeenCalledWith("소품 glasses (p1) 3D 파일을 불러오지 못해 기존 컷을 보존했습니다.");
    expect(h.handleLinkedCutInsert).not.toHaveBeenCalled();
    expect(await view.result.current.admitOutput()).toBe(false);
  });
  it("keeps a cut with missing attachments and reports failure only once", () => {
    const { h, request } = fixture();
    act(() => { vi.advanceTimersByTime(60_016); });
    expect(h.handleLinkedCutInsert).not.toHaveBeenCalled();
    expect(request.onFailure).toHaveBeenCalledTimes(1);
    expect(request.onFailure).toHaveBeenCalledWith(expect.stringContaining("소품 glasses (p1) 장착 확인 대기"));
  });
});
