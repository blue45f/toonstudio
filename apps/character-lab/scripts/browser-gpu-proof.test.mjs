import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

import {
  classifyGpuConsoleDiagnostic,
  closeBrowserAndStopPreview,
  installGpuProofRecorder,
  validateGpuProofSnapshot,
  withGpuProofDeadline,
} from "./browser-gpu-proof.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("GPU 증거 수집 제한 시간", () => {
  it("영구 대기하는 수집은 제한 시간에 실패하고 타이머를 남기지 않는다", async () => {
    vi.useFakeTimers();
    try {
      const proof = withGpuProofDeadline(() => new Promise(() => {}), 25);
      const rejected = expect(proof).rejects.toThrow("GPU proof collection timed out");
      await vi.advanceTimersByTimeAsync(24);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("정상 수집 결과를 그대로 반환하고 타이머를 제거한다", async () => {
    vi.useFakeTimers();
    try {
      const snapshot = { errors: [], pendingObservations: 0 };
      await expect(withGpuProofDeadline(() => Promise.resolve(snapshot), 25)).resolves.toBe(snapshot);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("수집 Promise의 실패를 그대로 전달하고 타이머를 제거한다", async () => {
    vi.useFakeTimers();
    try {
      const failure = new Error("GPU evidence read failed");
      await expect(withGpuProofDeadline(() => Promise.reject(failure), 25)).rejects.toBe(failure);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("수집 함수의 동기 예외도 reject로 전달하고 타이머를 제거한다", async () => {
    vi.useFakeTimers();
    try {
      const failure = new Error("GPU evidence read threw");
      await expect(withGpuProofDeadline(() => { throw failure; }, 25)).rejects.toBe(failure);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("명확한 GPU 콘솔 오류 분류", () => {
  it.each([
    ["warn", "GPUValidationError: binding mismatch", "gpu-error-class"],
    ["warning", "GPUOutOfMemoryError: allocation failed", "gpu-error-class"],
    ["error", "GPUInternalError: device operation failed", "gpu-error-class"],
    ["warning", "WebGPU: uncaptured error: invalid buffer usage", "webgpu-error"],
    ["warn", "WebGPU validation error: invalid texture", "webgpu-error"],
    ["error", "WebGPU: internal error during draw", "webgpu-error"],
    ["error", "WebGPU: error: invalid command", "webgpu-error"],
    ["error", "WebGPU error during command submission", "webgpu-error"],
    ["warning", "WebGPU device was lost", "webgpu-error"],
    ["warn", "WebGPU: out-of-memory", "webgpu-error"],
    ["error", "GL_INVALID_OPERATION: glDrawElements: invalid range", "webgl-error-token"],
    ["warning", "WebGL: OUT_OF_MEMORY: texImage2D", "webgl-error-token"],
    ["warn", "WebGL2: CONTEXT_LOST_WEBGL: context was lost", "webgl-error-token"],
    ["error", "GL_OUT_OF_MEMORY: allocation failed", "webgl-error-token"],
    ["warning", "Vertex shader compilation failed: syntax error", "shader-compilation-failure"],
    ["error", "Fragment shader compilation error: syntax error", "shader-compilation-failure"],
    ["error", "Failed to compile fragment shader", "shader-compilation-failure"],
    ["warn", "Error while compiling the compute shader", "shader-compilation-failure"],
    ["error", "Error compiling vertex shader", "shader-compilation-failure"],
    ["error", "THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false", "shader-compilation-failure"],
  ])("%s의 오류 토큰을 분류한다: %s", (type, message, code) => {
    expect(classifyGpuConsoleDiagnostic(type, message)).toEqual({
      kind: "gpu-console-diagnostic", type: type === "error" ? "error" : "warning", code, message,
    });
  });

  it.each([
    ["warning", "WebGPU is an experimental feature"],
    ["warn", "WebGPU: this feature is deprecated"],
    ["warning", "WebGPU performance warning: Slow GPU message"],
    ["warning", "[WebGL]GL Driver Message: GPU stall due to ReadPixels"],
    ["warn", "WebGPU validation checks are disabled for performance"],
    ["warning", "WebGPU error reporting is experimental"],
    ["error", "Network error while loading GPU presets"],
    ["error", "WebGPU preset download failed: network error: offline"],
    ["error", "OUT_OF_MEMORY while processing a document"],
    ["warning", "Shader compilation took 100 ms"],
    ["info", "GPUValidationError: informational fixture"],
    ["debug", "WebGPU: uncaptured error: debug fixture"],
    ["log", "GL_INVALID_OPERATION: log fixture"],
  ])("오류 증거가 아닌 %s 메시지는 거절한다: %s", (type, message) => {
    expect(classifyGpuConsoleDiagnostic(type, message)).toBeNull();
  });
});

describe("브라우저 종료와 preview 정리", () => {
  it("브라우저 종료가 영구 대기해도 deadline 뒤 preview를 한 번 정리한다", async () => {
    vi.useFakeTimers();
    try {
      const stopPreview = vi.fn();
      const closing = closeBrowserAndStopPreview(() => new Promise(() => {}), stopPreview, 25);
      const rejected = expect(closing).rejects.toThrow("GPU proof collection timed out");
      await vi.advanceTimersByTimeAsync(24);
      expect(stopPreview).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(stopPreview).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("브라우저 종료의 동기 실패를 전달하고 preview를 한 번 정리한다", async () => {
    vi.useFakeTimers();
    try {
      const failure = new Error("browser close failed");
      const stopPreview = vi.fn();
      await expect(closeBrowserAndStopPreview(() => { throw failure; }, stopPreview, 25)).rejects.toBe(failure);
      expect(stopPreview).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("브라우저 종료 Promise의 실패도 전달하고 preview를 한 번 정리한다", async () => {
    vi.useFakeTimers();
    try {
      const failure = new Error("browser close rejected");
      const stopPreview = vi.fn();
      await expect(closeBrowserAndStopPreview(() => Promise.reject(failure), stopPreview, 25)).rejects.toBe(failure);
      expect(stopPreview).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("브라우저 종료가 성공한 뒤 preview를 한 번 정리한다", async () => {
    vi.useFakeTimers();
    try {
      const closeBrowser = vi.fn().mockResolvedValue("closed");
      const stopPreview = vi.fn();
      await expect(closeBrowserAndStopPreview(closeBrowser, stopPreview, 25)).resolves.toBe("closed");
      expect(closeBrowser).toHaveBeenCalledTimes(1);
      expect(stopPreview).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

function fixture(config = { lane: "native" }, install = true) {
  const hardwareInfo = { vendor: "apple", architecture: "metal-3", device: "M2", description: "Apple Metal", isFallbackAdapter: false };
  const softwareInfo = { vendor: "google", architecture: "swiftshader", device: "Subzero", description: "SwiftShader Device", isFallbackAdapter: true };
  const calls = { adapters: [], devices: [], contexts: [] };
  class Device {
    constructor() {
      this.features = new Set(["shader-f16"]);
      this.limits = { maxTextureDimension2D: 8192, maxBufferSize: 4294967292 };
      this.loss = deferred();
      this.lost = this.loss.promise;
      this.listeners = new Map();
      this.popValue = null;
      this.destroyReason = "destroyed";
      this.destroyCalls = 0;
      this.queue = {
        next: null,
        calls: 0,
        onSubmittedWorkDone() {
          this.calls += 1;
          this.lastPromise = this.next?.promise ?? Promise.resolve();
          return this.lastPromise;
        },
      };
    }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    emitError(error) { this.listeners.get("uncapturederror")?.({ error }); }
    popErrorScope() { this.lastPopPromise = Promise.resolve(this.popValue); return this.lastPopPromise; }
    destroy() { this.destroyCalls += 1; this.loss.resolve({ reason: this.destroyReason, message: "device ended" }); }
  }
  class Adapter {
    constructor(info) { this.info = { ...info }; this.nextDevice = new Device(); }
    requestDevice(options) {
      calls.devices.push({ adapter: this, options });
      this.lastPromise = Promise.resolve(this.nextDevice);
      return this.lastPromise;
    }
  }
  class CanvasContext {
    constructor() { this.result = {}; }
    configure(options) { this.lastOptions = options; return this.result; }
    unconfigure() { this.unconfigured = true; }
  }
  class Webgl {
    constructor(renderer = "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max)") { this.renderer = renderer; }
    getExtension(name) { return name === "WEBGL_debug_renderer_info" ? { UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 } : null; }
    getParameter(key) { return key === 1 ? "Google Inc. (Apple)" : this.renderer; }
  }
  function canvasClass() {
    return class Canvas {
      constructor() { this.webgpu = new CanvasContext(); this.webgl2 = new Webgl(); }
      getContext(kind, options) {
        calls.contexts.push({ canvas: this, kind, options });
        return this[kind] ?? null;
      }
    };
  }
  const hardware = new Adapter(hardwareInfo);
  const software = new Adapter(softwareInfo);
  const gpu = {
    nextAdapter: null,
    requestAdapter(options) {
      calls.adapters.push(options);
      this.lastPromise = Promise.resolve(this.nextAdapter ?? (options?.forceFallbackAdapter ? software : hardware));
      return this.lastPromise;
    },
  };
  const scope = { navigator: { gpu }, HTMLCanvasElement: canvasClass(), OffscreenCanvas: canvasClass(),
    location: { origin: "http://127.0.0.1:4176" }, isSecureContext: true, console: { warn: vi.fn() } };
  const api = install ? installGpuProofRecorder(config, scope) : null;
  return { scope, api, calls, hardware, software, hardwareInfo, Device, Adapter };
}

async function configure(f, adapterOptions, deviceOptions, Canvas = f.scope.HTMLCanvasElement) {
  const adapter = await f.scope.navigator.gpu.requestAdapter(adapterOptions);
  const device = await adapter.requestDevice(deviceOptions);
  const canvas = new Canvas();
  const context = canvas.getContext("webgpu");
  context.configure({ device, format: "bgra8unorm" });
  return { adapter, device, canvas, context };
}

describe("실제 GPU 사용 증거 관찰기", () => {
  it("snapshot 오류가 없어도 명확한 콘솔 GPU 진단을 validator 실패에 합친다", async () => {
    const f = fixture();
    await configure(f);
    const snapshot = await f.api.settle();
    expect(snapshot.errors).toEqual([]);
    expect(validateGpuProofSnapshot(snapshot, "webgpu").ok).toBe(true);
    const diagnostics = [classifyGpuConsoleDiagnostic("warning", "WebGPU: uncaptured error: invalid buffer usage")].filter(Boolean);
    const result = validateGpuProofSnapshot(snapshot, "webgpu", diagnostics);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(["gpu-console-diagnostic (webgpu-error): WebGPU: uncaptured error: invalid buffer usage"]);
  });

  it("일반 경고를 null 필터한 콘솔 배열은 정상 GPU 증거를 실패시키지 않는다", async () => {
    const f = fixture();
    await configure(f);
    const snapshot = await f.api.settle();
    expect(snapshot.errors).toEqual([]);
    const diagnostics = [classifyGpuConsoleDiagnostic("warning", "WebGPU performance warning: Slow GPU message")].filter(Boolean);
    expect(diagnostics).toEqual([]);
    expect(validateGpuProofSnapshot(snapshot, "webgpu", diagnostics).ok).toBe(true);
  });

  it("외부 closure 없이 init-script 직렬화본만으로 설치한다", async () => {
    const f = fixture({ lane: "native" }, false);
    f.api = runInNewContext(`(${installGpuProofRecorder.toString()})(config, scope)`, { config: { lane: "native" }, scope: f.scope });
    await configure(f);
    const snapshot = await f.api.settle();
    expect(snapshot.schema).toBe("toonstudio.character-lab-gpu-proof/1");
    expect(validateGpuProofSnapshot(snapshot, "webgpu").ok).toBe(true);
  });

  it("옵션과 adapter/device/context 및 원래 Promise·native 반환 identity를 유지한다", async () => {
    const f = fixture();
    const adapterOptions = Object.freeze({ powerPreference: "high-performance" });
    const requestedAdapter = f.scope.navigator.gpu.requestAdapter(adapterOptions);
    expect(requestedAdapter).toBe(f.scope.navigator.gpu.lastPromise);
    const adapter = await requestedAdapter;
    expect(adapter).toBe(f.hardware);
    const deviceOptions = Object.freeze({ requiredFeatures: ["shader-f16"] });
    const requestedDevice = adapter.requestDevice(deviceOptions);
    expect(requestedDevice).toBe(adapter.lastPromise);
    const device = await requestedDevice;
    expect(device).toBe(adapter.nextDevice);
    const canvas = new f.scope.HTMLCanvasElement();
    const contextOptions = Object.freeze({ alpha: true });
    const context = canvas.getContext("webgpu", contextOptions);
    expect(context).toBe(canvas.webgpu);
    const configureOptions = Object.freeze({ device, format: "bgra8unorm" });
    expect(context.configure(configureOptions)).toBe(context.result);
    expect(context.lastOptions).toBe(configureOptions);
    expect(f.calls.adapters[0]).toBe(adapterOptions);
    expect(f.calls.devices[0].options).toBe(deviceOptions);
    expect(f.calls.contexts[0].options).toBe(contextOptions);
    const pop = device.popErrorScope();
    expect(pop).toBe(device.lastPopPromise);
    const work = device.queue.onSubmittedWorkDone();
    expect(work).toBe(device.queue.lastPromise);
    expect(validateGpuProofSnapshot(await f.api.settle(), "webgpu").ok).toBe(true);
  });

  it("default hardware 관측으로 실제 forced-software device를 덮어 통과하지 않는다", async () => {
    const f = fixture();
    await f.scope.navigator.gpu.requestAdapter();
    const actual = await configure(f, { forceFallbackAdapter: true });
    expect(actual.adapter).toBe(f.software);
    expect(() => actual.context.configure({ device: actual.device })).not.toThrow();
    const result = validateGpuProofSnapshot(await f.api.settle(), "webgpu");
    expect(result.ok).toBe(false);
    expect(result.fingerprints[0].architecture).toBe("swiftshader");
    expect(result.problems.join(" ")).toMatch(/software\/fallback/u);
  });

  it("capability adapter만 있거나 configure device의 adapter 연결이 없으면 strict 실패한다", async () => {
    const f = fixture();
    await f.scope.navigator.gpu.requestAdapter();
    expect(validateGpuProofSnapshot(await f.api.settle(), "webgpu").ok).toBe(false);
    const canvas = new f.scope.HTMLCanvasElement();
    const context = canvas.getContext("webgpu");
    const unknownDevice = new f.Device();
    expect(() => context.configure({ device: unknownDevice })).not.toThrow();
    const result = validateGpuProofSnapshot(await f.api.settle(), "webgpu");
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/device→adapter/u);
  });

  it("동일 context의 나중 hardware configure가 앞선 software 사용을 숨기지 않는다", async () => {
    const f = fixture();
    const actual = await configure(f, { forceFallbackAdapter: true });
    const adapter = await f.scope.navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();
    actual.context.configure({ device });
    const result = validateGpuProofSnapshot(await f.api.settle(), "webgpu");
    expect(result.fingerprints).toHaveLength(2);
    expect(result.ok).toBe(false);
  });

  it.each([0, 1, 27])("실제 device feature 수 %i를 고정 기준 없이 허용한다", async (count) => {
    const f = fixture({ lane: "native", expectedVendor: "APPLE", expectedArchitecture: "^metal-" });
    f.hardware.nextDevice.features = new Set(Array.from({ length: count }, (_, i) => `feature-${i}`));
    await configure(f);
    const result = validateGpuProofSnapshot(await f.api.settle(), "webgpu");
    expect(result.ok).toBe(true);
    expect(result.fingerprints[0].features).toHaveLength(count);
  });

  it("fallback flag나 actual limits가 빠진 strict 증거는 hardware 이름만으로 통과하지 않는다", async () => {
    const f = fixture();
    delete f.hardware.info.isFallbackAdapter;
    f.hardware.nextDevice.limits = null;
    await configure(f);
    const result = validateGpuProofSnapshot(await f.api.settle(), "webgpu");
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/isFallbackAdapter/u);
    expect(result.problems.join(" ")).toMatch(/features\/limits/u);
  });

  it.each(["uncaptured", "scope", "lost"])("실제 device %s 오류는 실패한다", async (kind) => {
    const f = fixture();
    const { device } = await configure(f);
    if (kind === "uncaptured") device.emitError({ name: "GPUValidationError", message: "bad binding" });
    if (kind === "scope") { device.popValue = { name: "GPUOutOfMemoryError", message: "allocation" }; await device.popErrorScope(); }
    if (kind === "lost") device.loss.resolve({ reason: "unknown", message: "unexpected reset" });
    expect(validateGpuProofSnapshot(await f.api.settle(), "webgpu").ok).toBe(false);
  });

  it("명시 표식→destroy→destroyed loss와 그 queue 거부만 정상 종료로 구분한다", async () => {
    const f = fixture();
    const { device } = await configure(f);
    const queueWait = deferred();
    device.queue.next = queueWait;
    const original = device.queue.onSubmittedWorkDone();
    expect(original).toBe(queueWait.promise);
    f.api.expectCurrentDeviceShutdown("backend-switch");
    device.destroy();
    queueWait.reject(new Error("queue destroyed"));
    const snapshot = await f.api.settle();
    expect(snapshot.expectedLosses).toHaveLength(1);
    expect(snapshot.expectedQueueErrors).toHaveLength(1);
    expect(validateGpuProofSnapshot(snapshot, "webgpu").ok).toBe(true);
    expect(device.destroyCalls).toBe(1);
    expect(device.queue.calls).toBe(1);
  });

  it("configure 전 초기화 거부의 explicit destroy cleanup도 observe에서 정상 종료로 남긴다", async () => {
    const f = fixture({ lane: "observe" });
    const adapter = await f.scope.navigator.gpu.requestAdapter({ forceFallbackAdapter: true });
    const device = await adapter.requestDevice();
    const queueWait = deferred();
    device.queue.next = queueWait;
    device.queue.onSubmittedWorkDone();
    device.destroy();
    queueWait.reject(new Error("initialization cleanup"));
    const snapshot = await f.api.settle();
    expect(snapshot.webgpuContexts).toHaveLength(0);
    expect(snapshot.expectedLosses[0].shutdownReason).toBe("explicit-destroy");
    expect(snapshot.expectedQueueErrors).toHaveLength(1);
    expect(validateGpuProofSnapshot(snapshot, "webgpu").ok).toBe(true);
    expect(validateGpuProofSnapshot({ ...snapshot, config: { lane: "native" } }, "webgpu").ok).toBe(false);
  });

  it.each(["unknown", "new-device", "loss-without-destroy"])("shutdown 표식이 %s 소실을 숨기지 않는다", async (kind) => {
    const f = fixture();
    let { device } = await configure(f);
    f.api.expectCurrentDeviceShutdown("cleanup");
    if (kind === "new-device") {
      f.scope.navigator.gpu.nextAdapter = new f.Adapter(f.hardwareInfo);
      ({ device } = await configure(f));
      device.loss.resolve({ reason: "unknown", message: "new device reset" });
    } else if (kind === "loss-without-destroy") {
      device.loss.resolve({ reason: "destroyed", message: "no observed destroy call" });
    } else {
      device.destroyReason = "unknown";
      device.destroy();
    }
    expect(validateGpuProofSnapshot(await f.api.settle(), "webgpu").ok).toBe(false);
  });

  it("관측 getter 실패도 native Promise/객체/configure 반환을 바꾸지 않는다", async () => {
    const f = fixture();
    Object.defineProperty(f.hardware.nextDevice, "features", { get() { throw new Error("unreadable proof"); } });
    const adapter = await f.scope.navigator.gpu.requestAdapter();
    const promise = adapter.requestDevice();
    expect(promise).toBe(adapter.lastPromise);
    const device = await promise;
    expect(device).toBe(f.hardware.nextDevice);
    const context = new f.scope.HTMLCanvasElement().getContext("webgpu");
    expect(context.configure({ device })).toBe(context.result);
    const result = validateGpuProofSnapshot(await f.api.settle(), "webgpu");
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/instrumentation/u);
  });

  it("device가 살아 있는 동안의 queue 거부와 일반 warning을 구분한다", async () => {
    const f = fixture();
    const { device } = await configure(f);
    f.scope.console.warn("non-fatal browser warning");
    expect(validateGpuProofSnapshot(await f.api.settle(), "webgpu").ok).toBe(true);
    device.queue.next = { promise: Promise.reject(new Error("submission failed")) };
    expect(validateGpuProofSnapshot(await f.api.settle(), "webgpu").ok).toBe(false);
    f.api.expectCurrentDeviceShutdown("later-cleanup");
    device.destroy();
    expect(validateGpuProofSnapshot(await f.api.settle(), "webgpu").ok).toBe(false);
  });

  it.each(["HTMLCanvasElement", "OffscreenCanvas"])("%s의 actual WebGL2 unmasked Metal을 읽는다", async (canvasType) => {
    const f = fixture({ lane: "native", expectedWebglRenderer: "Apple|Metal" });
    const canvas = new f.scope[canvasType]();
    const gl = canvas.getContext("webgl2");
    expect(gl).toBe(canvas.webgl2);
    const result = validateGpuProofSnapshot(await f.api.settle(), "webgl2");
    expect(result.ok).toBe(true);
    expect(result.fingerprints[0].renderer).toContain("Metal");
  });

  it("Metal regex가 맞아도 SwiftShader 혼합 renderer는 native에서 거부한다", async () => {
    const f = fixture({ lane: "native", expectedWebglRenderer: "Metal" });
    const canvas = new f.scope.HTMLCanvasElement();
    canvas.webgl2.renderer = "ANGLE Metal SwiftShader";
    canvas.getContext("webgl2");
    expect(validateGpuProofSnapshot(await f.api.settle(), "webgl2").ok).toBe(false);
  });

  it("software 의도 lane에서는 actual SwiftShader 두 backend를 식별한다", async () => {
    const f = fixture({ lane: "software" });
    await configure(f, { forceFallbackAdapter: true });
    const canvas = new f.scope.OffscreenCanvas();
    canvas.webgl2.renderer = "ANGLE (Google, Vulkan SwiftShader Device (Subzero))";
    canvas.getContext("webgl2");
    const snapshot = await f.api.settle();
    expect(validateGpuProofSnapshot(snapshot, "webgpu").ok).toBe(true);
    expect(validateGpuProofSnapshot(snapshot, "webgl2").ok).toBe(true);
  });

  it("actual renderer나 secure origin이 없는 strict 증거는 실패하고 observe는 수집만 한다", async () => {
    const strict = fixture();
    expect(validateGpuProofSnapshot(await strict.api.settle(), "webgl2").ok).toBe(false);
    const canvas = new strict.scope.HTMLCanvasElement();
    canvas.getContext("webgl2");
    strict.scope.location.origin = "null";
    strict.scope.isSecureContext = false;
    expect(validateGpuProofSnapshot(await strict.api.settle(), "webgl2").ok).toBe(false);
    const observed = fixture({ lane: "observe" });
    expect(validateGpuProofSnapshot(await observed.api.settle(), "webgpu").ok).toBe(true);
  });
});
