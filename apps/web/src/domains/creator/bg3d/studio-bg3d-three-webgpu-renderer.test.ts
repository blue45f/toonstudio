import { PerspectiveCamera, Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerStudioScene3dResourceOwner } from "../scene3d/studio-scene3d-resource-owner";
import { probeStudioBg3dWebGpuCapability } from "./studio-bg3d-webgpu-capability";

import {
  createStudioBg3dThreeWebGpuRenderer,
  StudioBg3dWebGpuRendererError,
} from "./studio-bg3d-three-webgpu-renderer";

const rendererMock = vi.hoisted(() => ({
  backendIsWebGpu: true,
  initError: null as Error | null,
  initPromise: null as Promise<void> | null,
  render: vi.fn(),
  renderTarget: vi.fn(),
  info: { render: { drawCalls: 0 } },
  error: vi.fn(),
  dispose: vi.fn(),
  backendDispose: vi.fn(),
  fallbackAtInit: undefined as unknown,
  rendererParameters: null as Record<string, unknown> | null,
  deviceLost: undefined as PromiseLike<unknown> | undefined,
  omitFallbackHook: false,
}));

vi.mock("three/webgpu", () => ({
  WebGPURenderer: class WebGPURendererMock {
    _getFallback: null | (() => void) | undefined = rendererMock.omitFallbackHook
      ? undefined
      : vi.fn();

    render = rendererMock.render;
    getRenderTarget = rendererMock.renderTarget;
    info = rendererMock.info;
    onError = rendererMock.error;

    readonly backend = {
      ...(rendererMock.backendIsWebGpu ? { isWebGPUBackend: true } : {}),
      dispose: rendererMock.backendDispose,
      device: { lost: rendererMock.deviceLost },
    };

    constructor(parameters: Record<string, unknown>) {
      rendererMock.rendererParameters = parameters;
    }

    async init() {
      rendererMock.fallbackAtInit = this._getFallback;
      if (rendererMock.initError) throw rendererMock.initError;
      if (rendererMock.initPromise) await rendererMock.initPromise;
    }

    dispose() {
      rendererMock.dispose();
    }
  },
}));

class CanvasMock {}

function stubCanvas(): HTMLCanvasElement {
  vi.stubGlobal("HTMLCanvasElement", CanvasMock);
  return new CanvasMock() as HTMLCanvasElement;
}

function admitDevice(requestDevice: (descriptor: GPUDeviceDescriptor) => Promise<GPUDevice>) {
  return probeStudioBg3dWebGpuCapability({
    secureContext: true,
    gpu: { requestAdapter: async () => ({
      features: new Set(["timestamp-query", "unrelated-experimental-feature"]),
      limits: { maxBufferSize: 256 << 20, maxStorageBufferBindingSize: 64 << 20 },
      requestDevice,
    }) },
  });
}

describe("Studio BG3D Three WebGPU renderer", () => {
  afterEach(() => {
    rendererMock.backendIsWebGpu = true;
    rendererMock.initError = null;
    rendererMock.initPromise = null;
    rendererMock.render.mockReset();
    rendererMock.renderTarget.mockReset();
    rendererMock.info.render.drawCalls = 0;
    rendererMock.error.mockReset();
    rendererMock.dispose.mockReset();
    rendererMock.backendDispose.mockReset();
    rendererMock.fallbackAtInit = undefined;
    rendererMock.rendererParameters = null;
    rendererMock.deviceLost = undefined;
    rendererMock.omitFallbackHook = false;
    vi.unstubAllGlobals();
  });

  it("프레임 예외를 한 번만 알리고 다른 캔버스에는 전파하지 않는다", async () => {
    const failed = vi.fn();
    const nextFailure = vi.fn();
    const first = await createStudioBg3dThreeWebGpuRenderer(stubCanvas(), { onRenderError: failed });
    const next = await createStudioBg3dThreeWebGpuRenderer(stubCanvas(), { onRenderError: nextFailure });
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    rendererMock.render.mockImplementationOnce(() => { throw new Error("frame unavailable"); });
    first.renderer.render(scene, camera);
    first.renderer.render(scene, camera);
    next.renderer.render(scene, camera);
    expect(rendererMock.render).toHaveBeenCalledTimes(2);
    expect(failed).toHaveBeenCalledOnce();
    expect(failed).toHaveBeenCalledWith(expect.stringContaining("frame unavailable"));
    expect(nextFailure).not.toHaveBeenCalled();
    await first.dispose();
    await next.dispose();
  });

  it("실제 화면 draw가 있는 첫 프레임만 준비 완료로 보고한다", async () => {
    const ready = vi.fn();
    const runtime = await createStudioBg3dThreeWebGpuRenderer(stubCanvas(), { onFirstSceneFrame: ready });
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    rendererMock.renderTarget.mockReturnValue(null);
    runtime.renderer.render(scene, camera);
    rendererMock.info.render.drawCalls = 2;
    rendererMock.renderTarget.mockReturnValue({});
    runtime.renderer.render(scene, camera);
    expect(ready).not.toHaveBeenCalled();
    rendererMock.renderTarget.mockReturnValue(null);
    runtime.renderer.render(scene, camera);
    runtime.renderer.render(scene, camera);
    expect(ready).toHaveBeenCalledOnce();
    await runtime.dispose();
  });

  it("장치 명령 오류는 첫 원인을 유지하며 폐기한 렌더러의 늦은 오류를 무시한다", async () => {
    const failed = vi.fn();
    const runtime = await createStudioBg3dThreeWebGpuRenderer(stubCanvas(), { onRenderError: failed });
    // Three는 장치 오류를 타입 선언의 string 대신 실제 구조화된 이벤트로 전달한다.
    Reflect.apply(runtime.renderer.onError, runtime.renderer, [{
      api: "WebGPU", type: "GPUValidationError", message: "command encoder rejected",
    }]);
    runtime.renderer.onError("follow-up frame");
    await runtime.dispose();
    runtime.renderer.onError("expired");
    expect(rendererMock.error).toHaveBeenCalledOnce();
    expect(failed).toHaveBeenCalledOnce();
    expect(failed).toHaveBeenCalledWith("WebGPU 장면의 렌더 명령을 처리하지 못했습니다 (command encoder rejected)");
  });

  it("refuses a target that is not a canvas before importing the WebGPU graph", async () => {
    vi.stubGlobal("HTMLCanvasElement", CanvasMock);
    await expect(createStudioBg3dThreeWebGpuRenderer({} as HTMLCanvasElement))
      .rejects.toMatchObject({ code: "invalid-canvas" });
    expect(rendererMock.rendererParameters).toBeNull();
  });

  it("removes Three's silent WebGL fallback and requests the editor's minimum limits", async () => {
    const canvas = stubCanvas();
    const runtime = await createStudioBg3dThreeWebGpuRenderer(canvas);

    expect(rendererMock.fallbackAtInit).toBeNull();
    expect(rendererMock.rendererParameters).toMatchObject({
      powerPreference: "high-performance",
      requiredLimits: {
        maxBufferSize: 128 * 1024 * 1024,
        maxStorageBufferBindingSize: 32 * 1024 * 1024,
      },
    });

    await runtime.dispose();
    await runtime.dispose();
    expect(rendererMock.dispose).toHaveBeenCalledOnce();
    expect(rendererMock.backendDispose).not.toHaveBeenCalled();
  });

  it("refuses a Three version that no longer exposes the fallback contract", async () => {
    rendererMock.omitFallbackHook = true;
    const canvas = stubCanvas();
    await expect(createStudioBg3dThreeWebGpuRenderer(canvas))
      .rejects.toMatchObject({ code: "version-contract-unsupported" });
    expect(rendererMock.backendDispose).toHaveBeenCalledOnce();
  });

  it("admits only a real WebGPU backend", async () => {
    rendererMock.backendIsWebGpu = false;
    const canvas = stubCanvas();

    await expect(createStudioBg3dThreeWebGpuRenderer(canvas))
      .rejects.toMatchObject({ code: "backend-unavailable" });
    expect(rendererMock.dispose).toHaveBeenCalledOnce();
    expect(rendererMock.backendDispose).not.toHaveBeenCalled();
  });

  it("disposes a partially initialized renderer and keeps the initialization cause", async () => {
    const cause = new Error("device-lost-during-init");
    rendererMock.initError = cause;
    const canvas = stubCanvas();

    const rejection = await createStudioBg3dThreeWebGpuRenderer(canvas).catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(StudioBg3dWebGpuRendererError);
    expect(rejection).toMatchObject({ code: "initialization-failed", cause });
    expect(rendererMock.dispose).not.toHaveBeenCalled();
    expect(rendererMock.backendDispose).toHaveBeenCalledOnce();
  });

  it("뷰포트 준비 기한 안에 도착한 느린 장치를 그대로 사용한다", async () => {
    vi.useFakeTimers();
    try {
      rendererMock.initPromise = new Promise<void>((resolve) => setTimeout(resolve, 12_000));
      const opened = expect(createStudioBg3dThreeWebGpuRenderer(stubCanvas()))
        .resolves.toHaveProperty("renderer");
      await vi.advanceTimersByTimeAsync(12_000);
      await opened;
      expect(rendererMock.backendDispose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("승인한 어댑터에 캔버스당 한 번만 장치를 요청하고 외부 주입 장치도 해제한다", async () => {
    const device = { destroy: vi.fn() };
    const requestDevice = vi.fn(async () => device as unknown as GPUDevice);
    const admission = await admitDevice(requestDevice);
    const canvas = stubCanvas();
    const [first, second] = await Promise.all([
      createStudioBg3dThreeWebGpuRenderer(canvas, { admission }),
      createStudioBg3dThreeWebGpuRenderer(canvas, { admission }),
    ]);
    expect(first).toBe(second);
    expect(requestDevice).toHaveBeenCalledExactlyOnceWith({
      requiredFeatures: ["timestamp-query"],
      requiredLimits: { maxBufferSize: 128 << 20, maxStorageBufferBindingSize: 32 << 20 },
    });
    expect(rendererMock.rendererParameters?.device).toBe(device);
    await first.dispose();
    await second.dispose();
    expect(device.destroy).toHaveBeenCalledOnce();
    const next = await createStudioBg3dThreeWebGpuRenderer(stubCanvas(), { admission });
    expect(rendererMock.rendererParameters?.device).toBeUndefined();
    expect(requestDevice).toHaveBeenCalledOnce();
    await next.dispose();
  });

  it("준비 기한 뒤 도착한 장치를 폐기하고 캔버스에 연결하지 않는다", async () => {
    vi.useFakeTimers();
    try {
      const deferred = Promise.withResolvers<GPUDevice>();
      const admission = await admitDevice(() => deferred.promise);
      const result = expect(createStudioBg3dThreeWebGpuRenderer(stubCanvas(), {
        admission, initializationTimeoutMs: 25,
      })).rejects.toMatchObject({ code: "initialization-failed" });
      await vi.advanceTimersByTimeAsync(25);
      await result;
      const destroy = vi.fn();
      deferred.resolve({ destroy } as unknown as GPUDevice);
      await vi.advanceTimersByTimeAsync(0);
      expect(destroy).toHaveBeenCalledOnce();
      expect(rendererMock.rendererParameters).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it("bounds a WebGPU initialization that never settles", async () => {
    vi.useFakeTimers();
    try {
      rendererMock.initPromise = new Promise<void>(() => undefined);
      const canvas = stubCanvas();
      const pending = createStudioBg3dThreeWebGpuRenderer(canvas, {
        initializationTimeoutMs: 25,
      });
      const rejection = expect(pending).rejects.toMatchObject({
        code: "initialization-failed",
      });

      await vi.advanceTimersByTimeAsync(25);
      await rejection;
      expect(rendererMock.backendDispose).toHaveBeenCalledOnce();
      expect(rendererMock.dispose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a device loss once and stays silent after the editor disposes the renderer", async () => {
    let resolveLost: (value: { reason?: string; message?: string }) => void = () => undefined;
    rendererMock.deviceLost = new Promise<{ reason?: string; message?: string }>((resolve) => {
      resolveLost = resolve;
    });
    const canvas = stubCanvas();
    const onDeviceLost = vi.fn();
    const runtime = await createStudioBg3dThreeWebGpuRenderer(canvas, { onDeviceLost });

    resolveLost({ reason: "destroyed", message: "adapter reset" });
    await Promise.resolve();
    await Promise.resolve();
    expect(onDeviceLost).toHaveBeenCalledWith({ reason: "destroyed", message: "adapter reset" });

    await runtime.dispose();
    expect(onDeviceLost).toHaveBeenCalledOnce();
  });

  it("cleans capture resources on device loss even without a UI loss callback", async () => {
    let resolveLost!: (value: { reason: string }) => void;
    rendererMock.deviceLost = new Promise<{ reason: string }>((resolve) => { resolveLost = resolve; });
    const runtime = await createStudioBg3dThreeWebGpuRenderer(stubCanvas());
    const dispose = vi.fn();
    registerStudioScene3dResourceOwner(runtime.renderer, dispose);
    resolveLost({ reason: "unknown" }); await Promise.resolve(); await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    await runtime.dispose(); expect(dispose).toHaveBeenCalledOnce();
  });

  it("cleans capture resources when R3F directly disposes the renderer", async () => {
    const runtime = await createStudioBg3dThreeWebGpuRenderer(stubCanvas());
    const dispose = vi.fn();
    registerStudioScene3dResourceOwner(runtime.renderer, dispose);
    runtime.renderer.dispose(); await runtime.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("does not report a device loss that only settles after disposal", async () => {
    let resolveLost: (value: { reason?: string }) => void = () => undefined;
    rendererMock.deviceLost = new Promise<{ reason?: string }>((resolve) => {
      resolveLost = resolve;
    });
    const canvas = stubCanvas();
    const onDeviceLost = vi.fn();
    const runtime = await createStudioBg3dThreeWebGpuRenderer(canvas, { onDeviceLost });

    await runtime.dispose();
    resolveLost({ reason: "destroyed" });
    await Promise.resolve();
    await Promise.resolve();
    expect(onDeviceLost).not.toHaveBeenCalled();
  });

  it("treats disposal by the host renderer as teardown, not as a device loss", async () => {
    let resolveLost: (value: { reason?: string }) => void = () => undefined;
    rendererMock.deviceLost = new Promise<{ reason?: string }>((resolve) => {
      resolveLost = resolve;
    });
    const canvas = stubCanvas();
    const onDeviceLost = vi.fn();
    const runtime = await createStudioBg3dThreeWebGpuRenderer(canvas, { onDeviceLost });

    // React Three Fiber disposes the renderer directly on unmount, not through our runtime handle.
    (runtime.renderer as unknown as { dispose: () => unknown }).dispose();
    resolveLost({ reason: "destroyed" });
    await Promise.resolve();
    await Promise.resolve();

    expect(onDeviceLost).not.toHaveBeenCalled();
    expect(rendererMock.dispose).toHaveBeenCalledOnce();
    // The runtime handle stays idempotent after a host disposal.
    await runtime.dispose();
    expect(rendererMock.dispose).toHaveBeenCalledOnce();
  });
});
