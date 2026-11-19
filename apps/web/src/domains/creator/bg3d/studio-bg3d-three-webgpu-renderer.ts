/**
 * Production Three WebGPU renderer factory for the Studio 3D background editor.
 *
 * This is the next-generation counterpart to the editor's long-standing `THREE.WebGLRenderer`
 * path. Callers reach it only through `studio-bg3d-three-webgpu-entry`, which is imported
 * dynamically after {@link probeStudioBg3dWebGpuCapability} admits the host and the
 * engine-selection policy chooses `webgpu`. The `three/webgpu` import is therefore static on
 * purpose: it belongs to that lazy entry's closure, where the bundle audit can prove the WebGL
 * editor never downloads it, and a nested dynamic import would only add a round trip.
 *
 * Three's `WebGPURenderer` silently installs a WebGL2 fallback when device creation fails. That is
 * the wrong behaviour for an editor that reports its selected engine to the artist: a renderer
 * advertised as WebGPU must either be WebGPU or fail. The factory therefore removes the fallback
 * hook, bounds `init()`, asserts the backend brand, and tears down any partially constructed device
 * before rethrowing.
 */

import { WebGPURenderer } from "three/webgpu";
import { GPUFeatureName as ThreeGpuFeatures } from "three/src/renderers/webgpu/utils/WebGPUConstants.js";
import { disposeStudioScene3dResourceOwner } from "../scene3d/studio-scene3d-resource-owner";

import {
  STUDIO_BG3D_WEBGPU_MIN_BUFFER_SIZE,
  STUDIO_BG3D_WEBGPU_MIN_STORAGE_BINDING_SIZE,
  STUDIO_BG3D_WEBGPU_RENDERER_INIT_TIMEOUT_MS,
  takeStudioBg3dWebGpuAdapter,
  type StudioBg3dWebGpuProbeResult,
} from "./studio-bg3d-webgpu-capability";

export type StudioBg3dWebGpuRendererErrorCode =
  | "invalid-canvas"
  | "version-contract-unsupported"
  | "initialization-failed"
  | "backend-unavailable";

export { STUDIO_BG3D_WEBGPU_RENDERER_INIT_TIMEOUT_MS };
const STUDIO_BG3D_WEBGPU_RENDERER_INIT_TIMEOUT_MAX_MS = 60_000;

export class StudioBg3dWebGpuRendererError extends Error {
  readonly code: StudioBg3dWebGpuRendererErrorCode;

  constructor(code: StudioBg3dWebGpuRendererErrorCode, cause?: unknown) {
    super(`Studio BG3D WebGPU renderer failed: ${code}`, cause === undefined ? undefined : { cause });
    this.name = "StudioBg3dWebGpuRendererError";
    this.code = code;
  }
}

export type StudioBg3dWebGpuDeviceLossReason = "destroyed" | "unknown";

export interface StudioBg3dWebGpuDeviceLoss {
  readonly reason: StudioBg3dWebGpuDeviceLossReason;
  readonly message: string;
}

export interface CreateStudioBg3dThreeWebGpuRendererOptions {
  readonly admission?: StudioBg3dWebGpuProbeResult;
  readonly antialias?: boolean;
  readonly alpha?: boolean;
  /** Testable upper bound for Three's adapter/device initialization. */
  readonly initializationTimeoutMs?: number;
  /**
   * Called once if the GPU device is lost while the renderer is alive. The editor uses this to
   * mark the selected WebGPU engine failed without waiting for the next frame to throw.
   * A device destroyed by our own `dispose()` never reports.
   */
  readonly onDeviceLost?: (loss: StudioBg3dWebGpuDeviceLoss) => void;
  /** 화면에 귀속된 첫 프레임 예외 또는 장치가 거절한 명령을 편집기의 복구 화면으로 전달한다. */
  readonly onRenderError?: (message: string) => void;
  /** 실제 화면을 대상으로 장면의 첫 draw를 제출했을 때 한 번만 알린다. */
  readonly onFirstSceneFrame?: () => void;
}

export interface StudioBg3dThreeWebGpuRuntime {
  readonly renderer: WebGPURenderer;
  dispose(): Promise<void>;
}

interface ThreeWebGpuBackendLifecycle {
  readonly isWebGPUBackend?: unknown;
  readonly parameters?: { readonly device?: unknown };
  readonly device?: {
    destroy?: () => void;
    readonly lost?: PromiseLike<{ readonly reason?: unknown; readonly message?: unknown }>;
  } | null;
  dispose?: () => void | Promise<void>;
}

interface ThreeWebGpuRendererLifecycle {
  /** Three r184's WebGPURenderer installs a WebGL fallback internally. Production forbids it. */
  _getFallback: null | ((error: unknown) => unknown);
  readonly backend: ThreeWebGpuBackendLifecycle;
}

async function disposeRejectedThreeWebGpuInitialization(backend: ThreeWebGpuBackendLifecycle): Promise<void> {
  try {
    await backend.dispose?.();
  } catch {
    // Three's public Renderer.dispose() calls async setAnimationLoop(), which retries a rejected
    // init promise when initialization never completed. Tear the owned backend down directly.
    if (backend.parameters?.device === undefined) {
      try {
        backend.device?.destroy?.();
      } catch {
        // Best-effort cleanup must not replace the original initialization error.
      }
    }
  }
}

function normalizeDeviceLoss(info: {
  readonly reason?: unknown;
  readonly message?: unknown;
}): StudioBg3dWebGpuDeviceLoss {
  const reason: StudioBg3dWebGpuDeviceLossReason = info?.reason === "destroyed" ? "destroyed" : "unknown";
  const message = typeof info?.message === "string" && info.message.length > 0
    ? info.message.slice(0, 240)
    : "WebGPU 디바이스 연결이 끊어졌습니다.";
  return Object.freeze({ reason, message });
}

function normalizeInitializationTimeoutMs(value: number | undefined): number {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return STUDIO_BG3D_WEBGPU_RENDERER_INIT_TIMEOUT_MS;
  }
  return Math.min(
    STUDIO_BG3D_WEBGPU_RENDERER_INIT_TIMEOUT_MAX_MS,
    Math.floor(value ?? STUDIO_BG3D_WEBGPU_RENDERER_INIT_TIMEOUT_MS),
  );
}

async function awaitInitialization<T>(
  initialization: Promise<T>,
  timeoutMs: number,
  cleanupLate: (result?: T) => unknown,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutError = new Error(`WebGPU renderer initialization timed out after ${timeoutMs}ms.`);
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(timeoutError);
    }, timeoutMs);
  });
  try {
    return await Promise.race([initialization, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // A timed-out init can still settle after its partial backend was torn down. Clean up again at
    // that boundary so a late-created device cannot survive outside the editor's ownership.
    if (timedOut) {
      void initialization.then(
        cleanupLate,
        () => cleanupLate(),
      );
    }
  }
}

/**
 * Observes `GPUDevice.lost` without letting a rejected or never-settling promise leak. `lost`
 * resolves (it does not reject) on every conforming implementation, but the editor must not depend
 * on that for correctness.
 */
function observeDeviceLoss(
  backend: ThreeWebGpuBackendLifecycle,
  isDisposed: () => boolean,
  onDeviceLost: (loss: StudioBg3dWebGpuDeviceLoss) => void,
): void {
  const lost = backend.device?.lost;
  if (!lost || typeof lost.then !== "function") return;
  void Promise.resolve(lost).then(
    (info) => {
      if (isDisposed()) return;
      onDeviceLost(normalizeDeviceLoss(info ?? {}));
    },
    () => {
      if (isDisposed()) return;
      onDeviceLost(normalizeDeviceLoss({}));
    },
  );
}

const canvasRuntimes = new WeakMap<HTMLCanvasElement, Promise<StudioBg3dThreeWebGpuRuntime>>();

/**
 * Own one initialized renderer per canvas, including while init is pending. R3F 9.6.1 may invoke
 * an async gl factory again before its first configure call stores state.gl (upstream #3782).
 * Two renderers then configure the same GPUCanvasContext with different devices; only one receives
 * resize updates and the other's depth buffer remains 300x150. Sharing just the final renderer is
 * too late: publish the promise before construction/import side effects can re-enter the factory.
 *
 * The first invocation owns options and device-loss reporting until disposal. Failed targets stay
 * failed: a timed-out native init can still touch that canvas later. Explicit retry remounts a new
 * Canvas in useStudioBg3dEngineRuntime, never races a replacement device on the failed DOM node.
 */
export function createStudioBg3dThreeWebGpuRenderer(
  canvas: HTMLCanvasElement,
  options: CreateStudioBg3dThreeWebGpuRendererOptions = {},
): Promise<StudioBg3dThreeWebGpuRuntime> {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return Promise.reject(new StudioBg3dWebGpuRendererError("invalid-canvas"));
  }
  const existing = canvasRuntimes.get(canvas);
  if (existing) return existing;
  const initialOptions = { ...options };
  const pending = Promise.resolve().then(() => initializeStudioBg3dThreeWebGpuRenderer(
    canvas,
    initialOptions,
    () => {
      if (canvasRuntimes.get(canvas) === pending) canvasRuntimes.delete(canvas);
    },
  ));
  canvasRuntimes.set(canvas, pending);
  return pending;
}

/** Callers probe first. Initialization does not re-probe or permit Three's hidden WebGL fallback. */
async function initializeStudioBg3dThreeWebGpuRenderer(
  canvas: HTMLCanvasElement,
  options: CreateStudioBg3dThreeWebGpuRendererOptions,
  releaseCanvas: () => void,
): Promise<StudioBg3dThreeWebGpuRuntime> {
  const timeoutMs = normalizeInitializationTimeoutMs(options.initializationTimeoutMs);
  const deadline = performance.now() + timeoutMs;
  const adapter = takeStudioBg3dWebGpuAdapter(options.admission);
  const requiredLimits = {
    maxBufferSize: STUDIO_BG3D_WEBGPU_MIN_BUFFER_SIZE,
    maxStorageBufferBindingSize: STUDIO_BG3D_WEBGPU_MIN_STORAGE_BINDING_SIZE,
  };
  let device: GPUDevice | undefined;
  let renderer: WebGPURenderer;
  const destroyOwnedDevice = () => {
    const owned = device;
    device = undefined;
    owned?.destroy();
  };
  try {
    if (adapter) {
      const rendererFeatures = new Set<string>(Object.values(ThreeGpuFeatures));
      // 브라우저가 실제 보고한 기능 중 설치된 Three가 사용하는 이름만 장치에 요청한다.
      const requiredFeatures = Array.from(adapter.features ?? [])
        .filter((feature): feature is GPUFeatureName => rendererFeatures.has(feature));
      device = await awaitInitialization(adapter.requestDevice({ requiredFeatures, requiredLimits }),
        timeoutMs, (late) => late?.destroy());
    }
    renderer = new WebGPURenderer({
      canvas,
      antialias: options.antialias ?? true,
      alpha: options.alpha ?? true,
      powerPreference: "high-performance",
      requiredLimits,
      device,
    });
  } catch (error) {
    destroyOwnedDevice();
    throw new StudioBg3dWebGpuRendererError("initialization-failed", error);
  }
  const lifecycle = renderer as unknown as ThreeWebGpuRendererLifecycle;
  const initializationBackend = lifecycle.backend;
  if (typeof lifecycle._getFallback !== "function") {
    void disposeRejectedThreeWebGpuInitialization(initializationBackend).finally(destroyOwnedDevice);
    throw new StudioBg3dWebGpuRendererError("version-contract-unsupported");
  }
  lifecycle._getFallback = null;
  try {
    await awaitInitialization(
      Promise.resolve(renderer.init()),
      device ? Math.max(1, Math.ceil(deadline - performance.now())) : timeoutMs,
      () => disposeRejectedThreeWebGpuInitialization(initializationBackend),
    );
  } catch (error) {
    void disposeRejectedThreeWebGpuInitialization(initializationBackend).finally(destroyOwnedDevice);
    throw new StudioBg3dWebGpuRendererError("initialization-failed", error);
  }
  if (lifecycle.backend.isWebGPUBackend !== true) {
    try { await renderer.dispose(); } finally { destroyOwnedDevice(); }
    throw new StudioBg3dWebGpuRendererError("backend-unavailable");
  }
  let disposed = false;
  if (options.onRenderError || options.onFirstSceneFrame) {
    const notify = options.onRenderError;
    let onFirstSceneFrame = options.onFirstSceneFrame;
    let failed = false;
    const report = (cause: unknown) => {
      if (disposed || failed) return;
      failed = true;
      const detail = typeof cause === "object" && cause !== null && "message" in cause ? cause.message : cause;
      const message = typeof detail === "string" ? detail.replace(/\s+/gu, " ").slice(0, 220).trim() : "";
      const type = typeof cause === "object" && cause !== null && "type" in cause ? cause.type : null;
      const label = type === "GPUValidationError" ? "WebGPU 장면의 렌더 명령을 처리하지 못했습니다"
        : type === "GPUOutOfMemoryError" ? "WebGPU 장면에 필요한 그래픽 메모리가 부족합니다"
        : "WebGPU 장면을 그리지 못했습니다";
      notify?.(message ? `${label} (${message})` : label);
    };
    // R3F의 프레임 콜백과 비동기 GPU 오류는 React의 자식 렌더 경계로 전파되지 않는다.
    const renderFrame = renderer.render.bind(renderer);
    renderer.render = (scene, camera) => {
      if (failed || disposed) return;
      try {
        renderFrame(scene, camera);
        if (onFirstSceneFrame && renderer.getRenderTarget() === null && renderer.info.render.drawCalls > 0) {
          const notifyFrame = onFirstSceneFrame;
          onFirstSceneFrame = undefined;
          notifyFrame();
        }
      } catch (error) {
        if (!notify) throw error;
        report(error);
      }
    };
    const onBackendError = renderer.onError.bind(renderer);
    renderer.onError = (error) => {
      if (disposed || failed) return;
      try { onBackendError(error); } finally { if (notify) report(error); }
    };
  }
  // R3F 9.6.1은 Canvas를 닫을 때 forceContextLoss()를 부른다. WebGPU에는 이 메서드가
  // 없어 앱이 소유한 device를 명시적으로 해제해야 한다. 직접 해제와 같은 수명을 공유한다.
  const rendererDispose = renderer.dispose.bind(renderer);
  Object.defineProperty(renderer, "dispose", {
    configurable: true,
    writable: true,
    value: (): unknown => {
      if (disposed) return;
      disposed = true;
      disposeStudioScene3dResourceOwner(renderer);
      try {
        return device ? Promise.resolve(rendererDispose()).finally(destroyOwnedDevice) : rendererDispose();
      } catch (error) {
        destroyOwnedDevice();
        throw error;
      } finally {
        releaseCanvas();
      }
    },
  });
  Object.defineProperty(renderer, "forceContextLoss", { value: () => renderer.dispose() });
  observeDeviceLoss(lifecycle.backend, () => disposed, (loss) => {
    disposeStudioScene3dResourceOwner(renderer);
    options.onDeviceLost?.(loss);
  });
  return Object.freeze({
    renderer,
    async dispose() {
      if (disposed) return;
      await renderer.dispose();
    },
  });
}
