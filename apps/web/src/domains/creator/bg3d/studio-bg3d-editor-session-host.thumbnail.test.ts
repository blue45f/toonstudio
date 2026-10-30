import { deflateSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1 } from "./studio-bg3d-capture-adapter";
import { attachStudioBg3dEditorSessionHost } from "./studio-bg3d-editor-session-host";
import { StudioBg3dModalOperationCoordinator } from "./studio-bg3d-modal-operation-coordinator";
import { createStudioBg3dCacheTestEntry, createStudioBg3dCacheTestRecord } from "./studio-bg3d-model-cache.test-fixture";
import { studioBg3dModelCacheKey } from "./studio-bg3d-model-material-variant";
import { StudioBg3dModelThumbnailCaptureController } from "./studio-bg3d-model-thumbnail-capture";
import type { ModelThumbnailGpuLease, StudioBg3dModelThumbnailRuntime } from "./StudioBackground3DTypes";
import type { StudioBg3dCapturedRaster } from "./studio-bg3d-capture-adapter";
import type { StudioBg3dModalSession } from "./studio-bg3d-modal-operation-coordinator";
import type { Bg3dVerifiedStoredRecord } from "./studio-bg3d-model-library-loader";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { StudioBg3dModelThumbnailCaptureControllerOptions, StudioBg3dModelThumbnailCaptureInput } from "./studio-bg3d-model-thumbnail-capture";
import type { StudioBg3dModelThumbnailThreeCaptureHandle } from "./studio-bg3d-model-thumbnail-three-capture";

// 대형 UI barrel 대신 실제 variant 조회만 제공하고 binder 본문은 그대로 실행한다.
vi.mock("./studio-bg3d-editor-runtime-bindings", async () => ({ ...await import("./studio-bg3d-model-material-variant") }));

function deferred<Value>() {
  let resolve: (value: Value) => void = () => { throw new Error("대기 작업이 아직 준비되지 않았습니다."); };
  const promise = new Promise<Value>((complete) => { resolve = complete; });
  return { promise, resolve };
}

/** GPU/이미지 Worker 대신 CPU로 만든 실제 PNG를 controller의 저장 전 검사에 전달한다. */
function pngBytes(): Uint8Array<ArrayBuffer> {
  const chunk = (name: string, bytes: Uint8Array) => {
    const result = Buffer.alloc(bytes.length + 12);
    result.writeUInt32BE(bytes.length, 0); result.write(name, 4); result.set(bytes, 8);
    let crc = 0xffff_ffff;
    for (const byte of result.subarray(4, result.length - 4)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb8_8320 : 0);
    }
    result.writeUInt32BE((crc ^ 0xffff_ffff) >>> 0, result.length - 4);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(320, 0); header.writeUInt32BE(180, 4); header[8] = 8; header[9] = 6;
  return Uint8Array.from(Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(new Uint8Array((320 * 4 + 1) * 180))), chunk("IEND", new Uint8Array()),
  ]));
}

interface ThumbnailHost extends Record<string, unknown> {
  startModelThumbnailCaptureBatch?: (records: readonly Bg3dVerifiedStoredRecord[], session: StudioBg3dModalSession) => void;
  isMaterialBackendCurrent?: () => boolean;
}

function harness() {
  const record = createStudioBg3dCacheTestRecord("thumbnail-model");
  const webgl = createStudioBg3dCacheTestEntry(record, "webgl");
  const webgpu = createStudioBg3dCacheTestEntry(record, "webgpu");
  const cache = new Map<string, StudioBg3dModelRootCacheEntry>([
    [studioBg3dModelCacheKey(record.id, "webgl"), webgl],
    [studioBg3dModelCacheKey(record.id, "webgpu"), webgpu],
  ]);
  const coordinator = new StudioBg3dModalOperationCoordinator(), session = coordinator.beginSession();
  const componentActiveRef = { current: true }, modelRendererRef = { current: {} };
  const abortRef = { current: null as AbortController | null }, epochRef = { current: 0 };
  const controllerRef = { current: null as StudioBg3dModelThumbnailCaptureController | null };
  const gpuLeaseRef = { current: null as ModelThumbnailGpuLease | null }, captureInFlightRef = { current: false };
  const captureInputs: StudioBg3dModelThumbnailCaptureInput[] = [];
  const raster: StudioBg3dCapturedRaster = { width: 320, height: 180, rgba: new Uint8ClampedArray(320 * 180 * 4) };
  const rasterGate = deferred<StudioBg3dCapturedRaster>();
  let createGate = Promise.resolve(), backendCurrent = true, disposed = false;
  const originalCallback = vi.fn(() => backendCurrent), replacementCallback = vi.fn(() => true);
  const png = pngBytes(), dataUrl = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  const persisted = new Map<string, string>(), persist = vi.fn(async (id: string, data: string) => {
    persisted.set(id, data); return true;
  });
  const encode = vi.fn(async () => new Blob([png], { type: "image/png" }));
  class CaptureController extends StudioBg3dModelThumbnailCaptureController {
    constructor(options: StudioBg3dModelThumbnailCaptureControllerOptions = {}) {
      super({ ...options, dependencies: {
        verify: async () => undefined, toDataUrl: async () => dataUrl, persist, revisionFactory: () => 1,
        ...options.dependencies,
      } });
    }
    override captureAndStore(input: StudioBg3dModelThumbnailCaptureInput) {
      captureInputs.push(input); return super.captureAndStore(input);
    }
  }
  const capture = vi.fn(async () => rasterGate.promise);
  const dispose = vi.fn(() => { disposed = true; });
  const handle: StudioBg3dModelThumbnailThreeCaptureHandle = {
    adapter: {
      backend: "three-webgpu", engineId: "three", engineVersion: "0.186.1", graphicsApi: "webgpu",
      implementationRevision: "thumbnail-binder-test-v1", profileId: STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
      getSourceSize: () => ({ width: 320, height: 180 }), capture,
    },
    framing: {
      width: 320, height: 180, aspect: 16 / 9, fovDegrees: 32, near: 0.1, far: 100,
      cameraPosition: [0, 0, 2], target: [0, 0, 0], worldBoundsMin: [-0.5, -0.5, -0.5], worldBoundsMax: [0.5, 0.5, 0.5],
    },
    get disposed() { return disposed; }, dispose,
  };
  const createThreeCapture = vi.fn<StudioBg3dModelThumbnailRuntime["createThreeCapture"]>(async () => {
    await createGate; return handle;
  });
  const runtime: StudioBg3dModelThumbnailRuntime = { CaptureController, createThreeCapture };
  const loadRuntime = vi.fn(async () => runtime), setModelLibrary = vi.fn(), setModelLibraryStatus = vi.fn();
  const listLibrary = vi.fn(async () => [{ ...record, thumbnail: persisted.get(record.id) ?? null }]);
  const invalidate = vi.fn(() => {
    epochRef.current += 1; abortRef.current?.abort(); abortRef.current = null;
    controllerRef.current?.invalidate(); gpuLeaseRef.current?.release();
  });
  const h: ThumbnailHost = {
    materialBackend: "webgpu", engineRuntime: { plan: { backend: "webgpu" } }, isMaterialBackendCurrent: originalCallback,
    componentActiveRef, modelRendererRef, studioBg3dModalOperationCoordinator: coordinator,
    modelThumbnailCaptureAbortRef: abortRef, modelThumbnailCaptureEpochRef: epochRef,
    modelThumbnailCaptureControllerRef: controllerRef, modelThumbnailGpuLeaseRef: gpuLeaseRef, captureInFlightRef,
    modelRootCacheRef: { current: cache }, loadStudioBg3dModelThumbnailRuntime: loadRuntime,
    encodeStudioBg3dModelThumbnailPng: encode, listBg3dModelLibraryEntries: listLibrary,
    setModelLibrary, setModelLibraryStatus, invalidateModelThumbnailCaptures: invalidate,
  };
  attachStudioBg3dEditorSessionHost(h);
  return {
    h, record, webgl, webgpu, cache, session, coordinator, componentActiveRef, modelRendererRef, abortRef, captureInFlightRef, gpuLeaseRef,
    captureInputs, capture, encode, persist, persisted, createThreeCapture, loadRuntime, dispose, handle,
    setModelLibrary, setModelLibraryStatus, listLibrary, originalCallback, replacementCallback,
    start() {
      if (!h.startModelThumbnailCaptureBatch) throw new Error("실제 썸네일 binder 함수가 없습니다.");
      h.startModelThumbnailCaptureBatch([record], session);
    },
    currentInput() {
      const input = captureInputs[0];
      if (!input) throw new Error("실제 captureAndStore 입력이 아직 없습니다.");
      return input;
    },
    holdCreate() { const gate = deferred<void>(); createGate = gate.promise; return () => gate.resolve(); },
    releaseRaster() { rasterGate.resolve(raster); },
    changeBackend() {
      backendCurrent = false; h.materialBackend = "webgl";
      h.engineRuntime = { plan: { backend: "webgl" } }; h.isMaterialBackendCurrent = replacementCallback;
    },
    async finish() { await vi.waitFor(() => { expect(abortRef.current).toBeNull(); }); },
    cleanup() { invalidate(); controllerRef.current?.dispose(); rasterGate.resolve(raster); },
  };
}

describe("실제 썸네일 session binder의 material·cache 소유권", () => {
  it("선택한 variant만 캡처하고 실제 controller가 저장·카드 갱신한 뒤 private handle만 정리한다", async () => {
    const value = harness();
    try {
      value.start(); await vi.waitFor(() => { expect(value.capture).toHaveBeenCalledOnce(); });
      expect(value.createThreeCapture.mock.calls[0]?.[0].cachedRoot).toBe(value.webgpu.root);
      expect(value.createThreeCapture.mock.calls[0]?.[0].renderer).toBe(value.modelRendererRef.current);
      expect(value.currentInput().isCurrent?.()).toBe(true); expect(value.captureInFlightRef.current).toBe(true);
      value.releaseRaster(); await value.finish();
      expect(value.persist).toHaveBeenCalledOnce(); expect(value.persisted.has(value.record.id)).toBe(true);
      expect(value.setModelLibrary).toHaveBeenCalledWith([expect.objectContaining({ thumbnail: expect.stringMatching(/^data:image\/png;base64,/u) })]);
      expect(value.setModelLibraryStatus).toHaveBeenCalledWith("ready");
      expect(value.dispose).toHaveBeenCalledOnce(); expect(value.handle.disposed).toBe(true);
      expect(value.captureInFlightRef.current).toBe(false);
      expect(value.webgpu.dispose).not.toHaveBeenCalled(); expect(value.webgl.dispose).not.toHaveBeenCalled();
      expect(value.webgpu.root.parent).toBeNull(); expect(value.webgl.root.parent).toBeNull();
    } finally { value.cleanup(); }
  });

  it("같은 storage ID·hash·byteSize라도 entry 객체가 바뀌면 이전 raster를 저장하지 않는다", async () => {
    const value = harness();
    try {
      value.start(); await vi.waitFor(() => { expect(value.capture).toHaveBeenCalledOnce(); });
      const replacement = createStudioBg3dCacheTestEntry(value.record, "webgpu");
      value.cache.set(studioBg3dModelCacheKey(value.record.id, "webgpu"), replacement);
      expect(replacement.record.contentHash).toBe(value.webgpu.record.contentHash);
      expect(value.currentInput().isCurrent?.()).toBe(false);
      value.releaseRaster(); await value.finish();
      expect(value.encode).not.toHaveBeenCalled(); expect(value.persist).not.toHaveBeenCalled();
      expect(value.listLibrary).not.toHaveBeenCalled(); expect(value.setModelLibrary).not.toHaveBeenCalled();
      expect(value.dispose).toHaveBeenCalledOnce(); expect(replacement.dispose).not.toHaveBeenCalled();
      expect(value.cache.get(studioBg3dModelCacheKey(value.record.id, "webgl"))).toBe(value.webgl);
      expect(value.cache.get(studioBg3dModelCacheKey(value.record.id, "webgpu"))).toBe(replacement);
    } finally { value.cleanup(); }
  });

  it("요청 중 backend가 바뀌면 renderer가 그대로여도 새 callback으로 이전 캡처를 되살리지 못한다", async () => {
    const value = harness(), renderer = value.modelRendererRef.current;
    try {
      value.start(); await vi.waitFor(() => { expect(value.capture).toHaveBeenCalledOnce(); });
      value.changeBackend();
      expect(value.modelRendererRef.current).toBe(renderer); expect(value.webgl.record.contentHash).toBe(value.webgpu.record.contentHash);
      expect(value.currentInput().isCurrent?.()).toBe(false);
      expect(value.createThreeCapture.mock.calls[0]?.[0].isCurrent?.()).toBe(false);
      value.releaseRaster(); await value.finish();
      expect(value.replacementCallback).not.toHaveBeenCalled(); expect(value.originalCallback).toHaveBeenCalled();
      expect(value.persist).not.toHaveBeenCalled(); expect(value.setModelLibrary).not.toHaveBeenCalled();
      expect(value.dispose).toHaveBeenCalledOnce(); expect(value.captureInFlightRef.current).toBe(false);
    } finally { value.cleanup(); }
  });

  it("isolated handle 준비 중 lease가 바뀌면 반환된 이전 preview를 바로 폐기한다", async () => {
    const value = harness(), releaseCreate = value.holdCreate();
    try {
      value.start(); await vi.waitFor(() => { expect(value.createThreeCapture).toHaveBeenCalledOnce(); });
      value.changeBackend(); releaseCreate(); await value.finish();
      expect(value.captureInputs).toEqual([]); expect(value.capture).not.toHaveBeenCalled();
      expect(value.persist).not.toHaveBeenCalled(); expect(value.dispose).toHaveBeenCalledOnce();
      expect(value.replacementCallback).not.toHaveBeenCalled();
    } finally { releaseCreate(); value.cleanup(); }
  });

  it("A의 지연된 handle finally가 캡처 중인 B의 GPU lease를 해제하지 않는다", async () => {
    const value = harness(), firstHandle = deferred<StudioBg3dModelThumbnailThreeCaptureHandle>();
    const disposeB = vi.fn(), handleB = { ...value.handle, dispose: disposeB };
    value.createThreeCapture.mockImplementationOnce(() => firstHandle.promise).mockResolvedValueOnce(handleB);
    try {
      value.start(); await vi.waitFor(() => { expect(value.createThreeCapture).toHaveBeenCalledOnce(); });
      value.start(); await vi.waitFor(() => { expect(value.capture).toHaveBeenCalledOnce(); });
      const leaseB = value.gpuLeaseRef.current;
      expect(leaseB).not.toBeNull(); expect(value.captureInFlightRef.current).toBe(true);
      firstHandle.resolve(value.handle);
      await vi.waitFor(() => { expect(value.dispose).toHaveBeenCalledOnce(); });
      expect(value.gpuLeaseRef.current).toBe(leaseB); expect(value.captureInFlightRef.current).toBe(true);
      expect(disposeB).not.toHaveBeenCalled(); expect(value.persist).not.toHaveBeenCalled();
      value.releaseRaster(); await value.finish();
      expect(disposeB).toHaveBeenCalledOnce(); expect(value.gpuLeaseRef.current).toBeNull();
      expect(value.captureInFlightRef.current).toBe(false); expect(value.persist).toHaveBeenCalledOnce();
    } finally { firstHandle.resolve(value.handle); value.cleanup(); }
  });

  it("A의 캡처가 늦게 끝나도 자기 lease만 반납하고 B의 새 lease는 보존한다", async () => {
    const value = harness(), secondRaster = deferred<StudioBg3dCapturedRaster>(), disposeB = vi.fn();
    const raster: StudioBg3dCapturedRaster = { width: 320, height: 180, rgba: new Uint8ClampedArray(320 * 180 * 4) };
    const captureB = vi.fn(async () => secondRaster.promise);
    value.createThreeCapture.mockResolvedValueOnce(value.handle).mockResolvedValueOnce({
      ...value.handle, adapter: { ...value.handle.adapter, capture: captureB }, dispose: disposeB,
    });
    try {
      value.start(); await vi.waitFor(() => { expect(value.capture).toHaveBeenCalledOnce(); });
      const leaseA = value.gpuLeaseRef.current;
      if (!leaseA) throw new Error("A의 실제 GPU lease가 없습니다.");
      const releaseA = vi.spyOn(leaseA, "release");
      value.start(); await vi.waitFor(() => { expect(captureB).toHaveBeenCalledOnce(); });
      const leaseB = value.gpuLeaseRef.current;
      expect(leaseA).not.toBeNull(); expect(leaseB).not.toBeNull(); expect(leaseB).not.toBe(leaseA);
      await leaseA.released; expect(releaseA).toHaveBeenCalledOnce();
      value.releaseRaster();
      await vi.waitFor(() => { expect(releaseA).toHaveBeenCalledTimes(2); });
      expect(value.dispose).toHaveBeenCalledOnce();
      expect(value.gpuLeaseRef.current).toBe(leaseB); expect(value.captureInFlightRef.current).toBe(true);
      expect(disposeB).not.toHaveBeenCalled();
      secondRaster.resolve(raster); await value.finish();
      expect(value.gpuLeaseRef.current).toBeNull(); expect(value.captureInFlightRef.current).toBe(false);
      expect(disposeB).toHaveBeenCalledOnce(); expect(value.persist).toHaveBeenCalledOnce();
    } finally { secondRaster.resolve(raster); value.cleanup(); }
  });

  it.each(["missing", "false"] as const)("시작 시 %s backend lease는 runtime도 로드하지 않는다", async (kind) => {
    const value = harness();
    try {
      if (kind === "missing") delete value.h.isMaterialBackendCurrent;
      else value.h.isMaterialBackendCurrent = () => false;
      value.start(); await value.finish();
      expect(value.loadRuntime).not.toHaveBeenCalled(); expect(value.createThreeCapture).not.toHaveBeenCalled();
      expect(value.persist).not.toHaveBeenCalled();
    } finally { value.cleanup(); }
  });

  it.each(["session", "unmount", "renderer"] as const)("%s 소유권이 바뀌면 이전 결과 저장과 카드 갱신을 막는다", async (kind) => {
    const value = harness();
    try {
      value.start(); await vi.waitFor(() => { expect(value.capture).toHaveBeenCalledOnce(); });
      if (kind === "session") value.coordinator.beginSession();
      else if (kind === "unmount") value.componentActiveRef.current = false;
      else value.modelRendererRef.current = {};
      expect(value.currentInput().isCurrent?.()).toBe(false);
      value.releaseRaster(); await value.finish();
      expect(value.persist).not.toHaveBeenCalled(); expect(value.setModelLibrary).not.toHaveBeenCalled();
      expect(value.dispose).toHaveBeenCalledOnce(); expect(value.captureInFlightRef.current).toBe(false);
    } finally { value.cleanup(); }
  });
});
