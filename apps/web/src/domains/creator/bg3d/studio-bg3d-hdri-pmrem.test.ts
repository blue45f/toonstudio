import { ACESFilmicToneMapping, DataTexture, NoToneMapping, WebGLRenderer, WebGLRenderTarget, type RenderTarget, type Texture } from "three";
import { WebGPUBackend, WebGPURenderer } from "three/webgpu";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioBg3dHdriPmrem } from "./studio-bg3d-hdri-pmrem";

const ports = vi.hoisted(() => {
  class RendererState {
    target: import("three").RenderTarget | null = null;
    face = 0; mip = 0; autoClear = true; toneMapping = 0;
    getRenderTarget() { return this.target; }
    getActiveCubeFace() { return this.face; }
    getActiveMipmapLevel() { return this.mip; }
    setRenderTarget(target: import("three").RenderTarget | null, face = 0, mip = 0) {
      this.target = target; this.face = face; this.mip = mip;
    }
  }
  return {
  RendererState,
  legacyCreated: vi.fn<() => void>(), legacyCompile: vi.fn<() => void>(), legacyDispose: vi.fn<() => void>(),
  legacyConvert: vi.fn<(texture: Texture) => RenderTarget>(),
  nativeCreated: vi.fn<() => void>(), nativeCompile: vi.fn<() => Promise<void>>(), nativeDispose: vi.fn<() => void>(),
  nativeConvert: vi.fn<(texture: Texture) => RenderTarget>(),
  legacyAllocate: vi.fn<() => RenderTarget>(), nativeAllocate: vi.fn<(depthBuffer: boolean) => RenderTarget>(),
  init: vi.fn<() => Promise<void>>(), queue: vi.fn<() => Promise<void>>(),
  initialized: false, fallback: false, contextLost: false, missingAllocator: false, skipAllocation: false,
}; });
vi.mock("three", async (importOriginal) => ({
  ...await importOriginal<typeof import("three")>(),
  WebGLRenderer: class extends ports.RendererState {
    readonly isWebGLRenderer = true; readonly xr = { enabled: true };
    getContext() { return { isContextLost: () => ports.contextLost }; }
  },
  PMREMGenerator: class {
    constructor() {
      ports.legacyCreated();
      if (ports.missingAllocator) Object.defineProperty(this, "_allocateTargets", { value: undefined });
    }
    _allocateTargets() { return ports.legacyAllocate(); }
    compileEquirectangularShader() { ports.legacyCompile(); }
    fromEquirectangular(texture: Texture) { if (!ports.skipAllocation) this._allocateTargets(); return ports.legacyConvert(texture); }
    dispose() { ports.legacyDispose(); }
  },
}));
vi.mock("three/webgpu", () => {
  class Backend { readonly device = { queue: { onSubmittedWorkDone: () => ports.queue() } }; }
  return {
    WebGPUBackend: Backend,
    WebGPURenderer: class extends ports.RendererState {
      readonly isWebGPURenderer = true;
      backend = ports.fallback ? {} : new Backend();
      initialized = ports.initialized;
      hasInitialized() { return this.initialized; }
      async init() { await ports.init(); this.initialized = true; return this; }
    },
    PMREMGenerator: class {
      constructor() {
        ports.nativeCreated();
        if (ports.missingAllocator) Object.defineProperty(this, "_allocateTarget", { value: undefined });
      }
      _allocateTarget(depthBuffer: boolean) { return ports.nativeAllocate(depthBuffer); }
      compileEquirectangularShader() { return ports.nativeCompile(); }
      fromEquirectangular(texture: Texture) { if (!ports.skipAllocation) this._allocateTarget(false); return ports.nativeConvert(texture); }
      dispose() { ports.nativeDispose(); }
    },
  };
});

const resources: { dispose(): void }[] = [];
beforeEach(() => {
  ports.legacyCreated.mockReset(); ports.legacyCompile.mockReset(); ports.legacyDispose.mockReset(); ports.legacyConvert.mockReset();
  ports.nativeCreated.mockReset(); ports.nativeCompile.mockReset(); ports.nativeDispose.mockReset(); ports.nativeConvert.mockReset();
  ports.init.mockReset().mockResolvedValue(undefined); ports.queue.mockReset().mockResolvedValue(undefined);
  ports.legacyAllocate.mockReset(); ports.nativeAllocate.mockReset();
  ports.nativeCompile.mockResolvedValue(undefined); ports.initialized = false; ports.fallback = false;
  ports.contextLost = false; ports.missingAllocator = false; ports.skipAllocation = false;
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const resource of resources.splice(0).reverse()) resource.dispose();
});
function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}
function fixture() {
  const texture = new DataTexture(new Uint8Array([13, 79, 151, 255]), 1, 1), target = new WebGLRenderTarget(2, 1);
  resources.push(texture, target);
  ports.legacyConvert.mockReturnValue(target); ports.nativeConvert.mockReturnValue(target);
  ports.legacyAllocate.mockReturnValue(target); ports.nativeAllocate.mockReturnValue(target);
  return { texture, target, sourceDispose: vi.spyOn(texture, "dispose"), targetDispose: vi.spyOn(target, "dispose") };
}

describe("실제 backend별 HDRI PMREM 준비·submission 수명", () => {
  it("WebGL은 legacy 경로만 쓰고 입력과 target의 소유권을 반환한다", async () => {
    const f = fixture(), version = f.texture.version, data = f.texture.image.data;
    if (!(data instanceof Uint8Array)) throw new Error("회귀용 원본 RGBA8 데이터가 필요합니다.");
    const bytes = Array.from(data);
    const result = await createStudioBg3dHdriPmrem(new WebGLRenderer(), f.texture);
    expect(result.target).toBe(f.target);
    expect(ports.legacyCreated).toHaveBeenCalledOnce(); expect(ports.legacyCompile).toHaveBeenCalledOnce();
    expect(ports.legacyConvert).toHaveBeenCalledWith(f.texture); expect(ports.nativeCreated).not.toHaveBeenCalled();
    expect(f.sourceDispose).not.toHaveBeenCalled(); expect(f.targetDispose).not.toHaveBeenCalled();
    expect(f.texture.version).toBe(version); expect(f.texture.image.data).toBe(data); expect(Array.from(data)).toEqual(bytes);
    result.disposeGenerator(); result.disposeGenerator();
    expect(ports.legacyDispose).toHaveBeenCalledOnce(); expect(f.targetDispose).not.toHaveBeenCalled();
  });

  it("WebGPU init·compile·실제 queue 순서가 끝나기 전에는 반환하거나 자원을 해제하지 않는다", async () => {
    const f = fixture(), init = deferred(), compile = deferred(), queue = deferred();
    ports.init.mockReturnValue(init.promise); ports.nativeCompile.mockReturnValue(compile.promise); ports.queue.mockReturnValue(queue.promise);
    const pending = createStudioBg3dHdriPmrem(new WebGPURenderer(), f.texture);
    let returned = false; void pending.then(() => { returned = true; });
    await vi.waitFor(() => expect(ports.init).toHaveBeenCalledOnce());
    expect(ports.nativeCreated).not.toHaveBeenCalled();
    init.resolve(); await vi.waitFor(() => expect(ports.nativeCompile).toHaveBeenCalledOnce());
    expect(ports.nativeConvert).not.toHaveBeenCalled();
    compile.resolve(); await vi.waitFor(() => expect(ports.queue).toHaveBeenCalledOnce());
    expect(returned).toBe(false); expect(f.sourceDispose).not.toHaveBeenCalled(); expect(f.targetDispose).not.toHaveBeenCalled();
    queue.resolve(); const result = await pending;
    expect(result.target).toBe(f.target); expect(ports.legacyCreated).not.toHaveBeenCalled();
    result.disposeGenerator(); expect(ports.nativeDispose).toHaveBeenCalledOnce();
  });

  it("queue 대기 중 superseded면 실제 종료 뒤 자기 target과 generator만 정리한다", async () => {
    const f = fixture(), queue = deferred(); let current = true;
    ports.initialized = true; ports.queue.mockReturnValue(queue.promise);
    const pending = createStudioBg3dHdriPmrem(new WebGPURenderer(), f.texture, { isCurrent: () => current });
    const rejected = expect(pending).rejects.toMatchObject({ code: "superseded" });
    await vi.waitFor(() => expect(ports.queue).toHaveBeenCalledOnce()); current = false;
    expect(f.targetDispose).not.toHaveBeenCalled(); queue.resolve(); await rejected;
    expect(f.targetDispose).toHaveBeenCalledOnce(); expect(ports.nativeDispose).toHaveBeenCalledOnce();
    expect(f.sourceDispose).not.toHaveBeenCalled(); expect(ports.init).not.toHaveBeenCalled();
  });

  it("compile 중 abort도 실제 compile 종료까지 기다리고 변환을 시작하지 않는다", async () => {
    const f = fixture(), compile = deferred(), abort = new AbortController();
    ports.initialized = true; ports.nativeCompile.mockReturnValue(compile.promise);
    const pending = createStudioBg3dHdriPmrem(new WebGPURenderer(), f.texture, { signal: abort.signal });
    const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
    await vi.waitFor(() => expect(ports.nativeCompile).toHaveBeenCalledOnce()); abort.abort();
    expect(ports.nativeDispose).not.toHaveBeenCalled(); compile.resolve(); await rejected;
    expect(ports.nativeConvert).not.toHaveBeenCalled(); expect(ports.nativeDispose).toHaveBeenCalledOnce();
    expect(f.sourceDispose).not.toHaveBeenCalled();
  });

  it("변환이 throw해도 이미 제출했을 수 있는 GPU 작업을 기다린 뒤 정리한다", async () => {
    const f = fixture(), queue = deferred(), failure = new Error("변환 중 오류");
    ports.initialized = true; ports.nativeConvert.mockImplementation(() => { throw failure; }); ports.queue.mockReturnValue(queue.promise);
    const pending = createStudioBg3dHdriPmrem(new WebGPURenderer(), f.texture);
    const rejected = expect(pending).rejects.toBe(failure);
    await vi.waitFor(() => expect(ports.queue).toHaveBeenCalledOnce());
    expect(ports.nativeDispose).not.toHaveBeenCalled(); queue.resolve(); await rejected;
    expect(ports.nativeDispose).toHaveBeenCalledOnce(); expect(f.sourceDispose).not.toHaveBeenCalled();
  });

  it("변환·GPU 대기 둘 다 실패하면 원래 두 오류를 유지한다", async () => {
    const f = fixture(), convertError = new Error("변환 오류"), queueError = new Error("GPU 오류");
    ports.initialized = true; ports.nativeConvert.mockImplementation(() => { throw convertError; }); ports.queue.mockRejectedValue(queueError);
    await expect(createStudioBg3dHdriPmrem(new WebGPURenderer(), f.texture)).rejects.toMatchObject({
      cause: convertError, errors: [convertError, queueError],
    });
    expect(ports.nativeDispose).toHaveBeenCalledOnce();
  });

  it("target 정리가 throw해도 generator 정리를 시도하고 모든 오류를 보존한다", async () => {
    const f = fixture(), queueError = new Error("GPU 오류"), targetError = new Error("target 오류"), generatorError = new Error("generator 오류");
    ports.initialized = true; ports.queue.mockRejectedValue(queueError);
    f.targetDispose.mockImplementationOnce(() => { throw targetError; }); ports.nativeDispose.mockImplementationOnce(() => { throw generatorError; });
    await expect(createStudioBg3dHdriPmrem(new WebGPURenderer(), f.texture)).rejects.toMatchObject({
      cause: queueError, errors: [queueError, targetError, generatorError],
    });
    expect(f.targetDispose).toHaveBeenCalledOnce(); expect(ports.nativeDispose).toHaveBeenCalledOnce();
    expect(f.sourceDispose).not.toHaveBeenCalled();
  });

  it("WebGPU가 다른 backend로 바뀌어 있으면 WebGL 변환으로 대신하지 않는다", async () => {
    const f = fixture(); ports.initialized = true; ports.fallback = true;
    await expect(createStudioBg3dHdriPmrem(new WebGPURenderer(), f.texture)).rejects.toMatchObject({ code: "backend-unavailable" });
    expect(ports.nativeCreated).not.toHaveBeenCalled(); expect(ports.legacyCreated).not.toHaveBeenCalled();
    expect(f.sourceDispose).not.toHaveBeenCalled();
  });

  it("compile 중 renderer backend가 교체되면 이전 요청을 변환하지 않는다", async () => {
    const f = fixture(), compile = deferred(), renderer = new WebGPURenderer();
    ports.nativeCompile.mockReturnValue(compile.promise);
    const pending = createStudioBg3dHdriPmrem(renderer, f.texture);
    const rejected = expect(pending).rejects.toMatchObject({ code: "backend-unavailable" });
    await vi.waitFor(() => expect(ports.nativeCompile).toHaveBeenCalledOnce());
    renderer.backend = new WebGPUBackend(); compile.resolve(); await rejected;
    expect(ports.nativeConvert).not.toHaveBeenCalled(); expect(ports.nativeDispose).toHaveBeenCalledOnce();
  });

  it("init 실패는 원래 오류로 끝나고 generator나 다른 backend를 만들지 않는다", async () => {
    const f = fixture(), failure = new Error("init 오류"); ports.init.mockRejectedValue(failure);
    await expect(createStudioBg3dHdriPmrem(new WebGPURenderer(), f.texture)).rejects.toBe(failure);
    expect(ports.nativeCreated).not.toHaveBeenCalled(); expect(ports.legacyCreated).not.toHaveBeenCalled();
  });

  it("WebGL compile 오류에서도 generator는 한 번 정리하고 입력은 보존한다", async () => {
    const f = fixture(), failure = new Error("compile 오류"); ports.legacyCompile.mockImplementation(() => { throw failure; });
    await expect(createStudioBg3dHdriPmrem(new WebGLRenderer(), f.texture)).rejects.toBe(failure);
    expect(ports.legacyDispose).toHaveBeenCalledOnce(); expect(f.sourceDispose).not.toHaveBeenCalled();
  });

  it("반환한 generator 정리 오류는 target을 폐기하지 않고 재호출은 중복 정리하지 않는다", async () => {
    const f = fixture(), failure = new Error("generator 오류");
    const result = await createStudioBg3dHdriPmrem(new WebGLRenderer(), f.texture);
    ports.legacyDispose.mockImplementationOnce(() => { throw failure; });
    expect(result.disposeGenerator).toThrow(failure); expect(result.disposeGenerator).not.toThrow();
    expect(ports.legacyDispose).toHaveBeenCalledOnce(); expect(f.targetDispose).not.toHaveBeenCalled();
  });

  // private allocator와 public renderer 상태를 가진 fake다. 실제 GPU 성공 증거가 아니다.
  it.each(["webgl", "webgpu"])("%s: 내부 render throw에도 미반환 output을 정리하고 renderer 상태를 복원한다", async (engine) => {
    const f = fixture(), original = new WebGLRenderTarget(3, 2), error = Error("중간 render 오류"); resources.push(original);
    const renderer = engine === "webgl" ? new WebGLRenderer() : new WebGPURenderer();
    renderer.setRenderTarget(original, 2, 3); renderer.autoClear = false; renderer.toneMapping = ACESFilmicToneMapping;
    const fail = () => {
      renderer.setRenderTarget(f.target, 4, 1); renderer.autoClear = true; renderer.toneMapping = NoToneMapping;
      if (renderer instanceof WebGLRenderer) renderer.xr.enabled = false;
      throw error;
    };
    if (engine === "webgl") ports.legacyConvert.mockImplementation(fail);
    else ports.nativeConvert.mockImplementation(fail);
    await expect(createStudioBg3dHdriPmrem(renderer, f.texture)).rejects.toBe(error);
    expect(renderer.getRenderTarget()).toBe(original); expect(renderer.getActiveCubeFace()).toBe(2); expect(renderer.getActiveMipmapLevel()).toBe(3);
    expect(renderer.autoClear).toBe(false); expect(renderer.toneMapping).toBe(ACESFilmicToneMapping);
    if (renderer instanceof WebGLRenderer) expect(renderer.xr.enabled).toBe(true);
    expect(f.targetDispose).toHaveBeenCalledOnce(); expect(f.sourceDispose).not.toHaveBeenCalled();
    expect(engine === "webgl" ? ports.legacyDispose : ports.nativeDispose).toHaveBeenCalledOnce();
  });

  it("WebGPU 내부 throw 뒤 queue가 끝나기 전에는 미반환 output을 폐기하지 않는다", async () => {
    const f = fixture(), renderer = new WebGPURenderer(), queue = deferred(), error = Error("내부 render 오류");
    ports.initialized = true; ports.queue.mockReturnValue(queue.promise); ports.nativeConvert.mockImplementation(() => { throw error; });
    const pending = createStudioBg3dHdriPmrem(renderer, f.texture), rejected = expect(pending).rejects.toBe(error);
    await vi.waitFor(() => expect(ports.queue).toHaveBeenCalledOnce());
    expect(f.targetDispose).not.toHaveBeenCalled(); expect(ports.nativeDispose).not.toHaveBeenCalled();
    queue.resolve(); await rejected; expect(f.targetDispose).toHaveBeenCalledOnce(); expect(ports.nativeDispose).toHaveBeenCalledOnce();
  });

  it("WebGPU 상태는 queue 대기 전에 복원하며 대기 중 새 frame의 상태를 다시 덮지 않는다", async () => {
    const f = fixture(), renderer = new WebGPURenderer(), queue = deferred(), before = new WebGLRenderTarget(1, 1), newer = new WebGLRenderTarget(2, 2);
    resources.push(before, newer); renderer.setRenderTarget(before, 1, 2); ports.queue.mockReturnValue(queue.promise);
    ports.nativeConvert.mockImplementation(() => { renderer.setRenderTarget(f.target, 3, 0); return f.target; });
    const pending = createStudioBg3dHdriPmrem(renderer, f.texture);
    await vi.waitFor(() => expect(ports.queue).toHaveBeenCalledOnce()); expect(renderer.getRenderTarget()).toBe(before);
    renderer.setRenderTarget(newer, 5, 4); renderer.autoClear = false; renderer.toneMapping = ACESFilmicToneMapping;
    queue.resolve(); const result = await pending;
    expect(renderer.getRenderTarget()).toBe(newer); expect(renderer.getActiveCubeFace()).toBe(5); expect(renderer.getActiveMipmapLevel()).toBe(4);
    expect(renderer.autoClear).toBe(false); expect(renderer.toneMapping).toBe(ACESFilmicToneMapping); result.disposeGenerator();
  });

  it("상태 복원 일부가 throw해도 나머지 속성을 복원하고 원래 오류를 보존한다", async () => {
    const f = fixture(), renderer = new WebGLRenderer(), original = new WebGLRenderTarget(1, 1); resources.push(original);
    const convertError = Error("변환 오류"), targetError = Error("target 복원 오류"), clearError = Error("autoClear 복원 오류");
    renderer.setRenderTarget(original); renderer.toneMapping = ACESFilmicToneMapping;
    const setTarget = vi.spyOn(renderer, "setRenderTarget"), restoreClear = vi.fn(() => { throw clearError; });
    ports.legacyConvert.mockImplementation(() => {
      renderer.setRenderTarget(f.target); renderer.toneMapping = NoToneMapping; renderer.xr.enabled = false;
      setTarget.mockImplementationOnce(() => { throw targetError; });
      Object.defineProperty(renderer, "autoClear", { configurable: true, get: () => false, set: restoreClear });
      throw convertError;
    });
    await expect(createStudioBg3dHdriPmrem(renderer, f.texture)).rejects.toMatchObject({ cause: convertError, errors: [convertError, targetError, clearError] });
    expect(restoreClear).toHaveBeenCalledOnce(); expect(renderer.toneMapping).toBe(ACESFilmicToneMapping); expect(renderer.xr.enabled).toBe(true);
    expect(f.targetDispose).toHaveBeenCalledOnce(); expect(ports.legacyDispose).toHaveBeenCalledOnce();
  });

  it.each(["before-compile", "after-compile", "after-convert"])("%s context loss는 조용한 적용 성공으로 반환하지 않는다", async (stage) => {
    const f = fixture();
    if (stage === "before-compile") ports.contextLost = true;
    if (stage === "after-compile") ports.legacyCompile.mockImplementation(() => { ports.contextLost = true; });
    if (stage === "after-convert") ports.legacyConvert.mockImplementation(() => { ports.contextLost = true; return f.target; });
    await expect(createStudioBg3dHdriPmrem(new WebGLRenderer(), f.texture)).rejects.toMatchObject({ code: "context-lost" });
    expect(ports.legacyCompile).toHaveBeenCalledTimes(stage === "before-compile" ? 0 : 1);
    expect(ports.legacyConvert).toHaveBeenCalledTimes(stage === "after-convert" ? 1 : 0);
    expect(f.targetDispose).toHaveBeenCalledTimes(stage === "after-convert" ? 1 : 0);
    expect(ports.legacyDispose).toHaveBeenCalledOnce(); expect(f.sourceDispose).not.toHaveBeenCalled();
  });

  it.each(["webgl", "webgpu"])("%s private allocator shape가 다르면 변환 전에 명시적으로 거부한다", async (engine) => {
    const f = fixture(); ports.missingAllocator = true;
    const renderer = engine === "webgl" ? new WebGLRenderer() : new WebGPURenderer();
    await expect(createStudioBg3dHdriPmrem(renderer, f.texture)).rejects.toMatchObject({ code: "allocator-unavailable" });
    expect(ports.legacyConvert).not.toHaveBeenCalled(); expect(ports.nativeConvert).not.toHaveBeenCalled(); expect(f.sourceDispose).not.toHaveBeenCalled();
  });

  it("관측하지 못한 output을 성공으로 반환하거나 외부 자원처럼 임의 폐기하지 않는다", async () => {
    const f = fixture(); ports.skipAllocation = true;
    await expect(createStudioBg3dHdriPmrem(new WebGLRenderer(), f.texture)).rejects.toMatchObject({ code: "unobserved-output" });
    expect(f.targetDispose).not.toHaveBeenCalled(); expect(ports.legacyDispose).toHaveBeenCalledOnce();
  });
});
