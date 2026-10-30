import { PMREMGenerator, RenderTarget, REVISION, type Texture, type WebGLRenderer } from "three";
import type { WebGPURenderer } from "three/webgpu";

export type StudioBg3dHdriRenderer = WebGLRenderer | WebGPURenderer;
export interface StudioBg3dHdriPmremOptions {
  readonly isCurrent?: () => boolean;
  readonly signal?: AbortSignal;
}
export interface StudioBg3dHdriPmrem {
  readonly target: RenderTarget;
  /** target·입력 texture는 해제하지 않는다. 실패를 포함해 호출 시도는 한 번뿐이다. */
  disposeGenerator(): void;
}
export class StudioBg3dHdriPmremError extends Error {
  constructor(readonly code: "aborted" | "superseded" | "unsupported-renderer" | "backend-unavailable"
    | "unsupported-three-revision" | "allocator-unavailable" | "unobserved-output" | "context-lost", cause?: unknown) {
    super(`HDRI PMREM: ${code}`, cause === undefined ? undefined : { cause });
    this.name = "StudioBg3dHdriPmremError";
  }
}

interface Generator {
  compileEquirectangularShader(): void | Promise<void>;
  fromEquirectangular(texture: Texture): RenderTarget;
  dispose(): void;
}
interface LegacyAllocator { _allocateTargets(): unknown }
interface CommonAllocator { _allocateTarget(depthBuffer: boolean): unknown }
interface RendererStateAccess<TTarget, TMapping> {
  getRenderTarget(): TTarget;
  setRenderTarget(target: TTarget, cubeFace?: number, mipLevel?: number): void;
  getActiveCubeFace(): number;
  getActiveMipmapLevel(): number;
  autoClear: boolean;
  toneMapping: TMapping;
}

function legacyAllocator(value: object): value is LegacyAllocator {
  return "_allocateTargets" in value && typeof value._allocateTargets === "function" && value._allocateTargets.length === 0;
}
function commonAllocator(value: object): value is CommonAllocator {
  return "_allocateTarget" in value && typeof value._allocateTarget === "function" && value._allocateTarget.length === 1;
}
function failures(errors: readonly unknown[], message: string): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message, { cause: errors[0] });
}

/**
 * 고정된 Three r186의 개인 generator에서 output 반환만 관찰한다. 원래 allocator의
 * 내부 초기화는 생략하지 않는다. allocator가 반환하기 전 OOM으로 잃은 자원은 관찰할 수 없다.
 */
function observeOutput(generator: Generator, kind: "legacy" | "common", outputs: Set<RenderTarget>): () => void {
  if (REVISION !== "186") throw new StudioBg3dHdriPmremError("unsupported-three-revision");
  if (!Object.isExtensible(generator)) throw new StudioBg3dHdriPmremError("allocator-unavailable");
  const record = (value: unknown): RenderTarget => {
    if (!(value instanceof RenderTarget)) throw new StudioBg3dHdriPmremError("allocator-unavailable");
    outputs.add(value); return value;
  };
  if (kind === "legacy" && legacyAllocator(generator)) {
    const allocate = generator._allocateTargets;
    generator._allocateTargets = () => record(allocate.call(generator));
    return () => { generator._allocateTargets = allocate; };
  }
  if (kind === "common" && commonAllocator(generator)) {
    const allocate = generator._allocateTarget;
    generator._allocateTarget = (depthBuffer: boolean) => record(allocate.call(generator, depthBuffer));
    return () => { generator._allocateTarget = allocate; };
  }
  throw new StudioBg3dHdriPmremError("allocator-unavailable");
}

function rendererSnapshot<TTarget, TMapping>(renderer: RendererStateAccess<TTarget, TMapping>, xr?: { enabled: boolean }): () => unknown[] {
  const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
  const autoClear = renderer.autoClear, toneMapping = renderer.toneMapping, xrEnabled = xr?.enabled;
  return () => {
    const errors: unknown[] = [];
    const restore = (action: () => void) => { try { action(); } catch (error) { errors.push(error); } };
    restore(() => renderer.setRenderTarget(target, face, mip));
    restore(() => { renderer.autoClear = autoClear; });
    restore(() => { renderer.toneMapping = toneMapping; });
    if (xr && xrEnabled !== undefined) restore(() => { xr.enabled = xrEnabled; });
    return errors;
  };
}

function convert<TTarget, TMapping>(renderer: RendererStateAccess<TTarget, TMapping>, generator: Generator,
  texture: Texture, errors: unknown[], contextCheck?: () => void, xr?: { enabled: boolean }): RenderTarget | null {
  const restore = rendererSnapshot(renderer, xr);
  let output: RenderTarget | null = null;
  try {
    contextCheck?.();
    output = generator.fromEquirectangular(texture);
    contextCheck?.();
  } catch (error) { errors.push(error); }
  finally {
    // queue 대기 전 동기적으로 복원한다. 대기 중 새 frame의 상태를 이전 snapshot으로 덮지 않는다.
    errors.push(...restore());
  }
  return output;
}

function webglContext(renderer: WebGLRenderer): void {
  if (renderer.getContext().isContextLost()) throw new StudioBg3dHdriPmremError("context-lost");
}
function active(options: StudioBg3dHdriPmremOptions): void {
  if (options.signal?.aborted) throw new StudioBg3dHdriPmremError("aborted", options.signal.reason);
  if (options.isCurrent && !options.isCurrent()) throw new StudioBg3dHdriPmremError("superseded");
}
function webgpu(value: unknown): value is WebGPURenderer {
  return value !== null && typeof value === "object" && "isWebGPURenderer" in value && value.isWebGPURenderer === true;
}
function webgl(value: unknown): value is WebGLRenderer {
  return value !== null && typeof value === "object" && "isWebGLRenderer" in value && value.isWebGLRenderer === true;
}
function hasQueue(value: object): value is { device: { queue: { onSubmittedWorkDone(): Promise<unknown> } } } {
  if (!("device" in value) || value.device === null || typeof value.device !== "object") return false;
  const device = value.device;
  if (!("queue" in device) || device.queue === null || typeof device.queue !== "object") return false;
  return "onSubmittedWorkDone" in device.queue && typeof device.queue.onSubmittedWorkDone === "function";
}

/**
 * 실제 renderer의 backend에 맞는 PMREM만 사용한다. 입력 HDR은 caller가 소유한다.
 * WebGPU compile·submission이 실제 종료될 때까지 기다리며 abort race로 자원을 조기 해제하지 않는다.
 */
export async function createStudioBg3dHdriPmrem(renderer: StudioBg3dHdriRenderer, texture: Texture,
  options: StudioBg3dHdriPmremOptions = {}): Promise<StudioBg3dHdriPmrem> {
  let generator: Generator | null = null;
  let target: RenderTarget | null;
  let stopObserving: (() => void) | null = null;
  const outputs = new Set<RenderTarget>();
  const disposeOutputs = (retained: RenderTarget | null = null) => {
    const errors: unknown[] = [];
    for (const output of outputs) {
      if (output === retained) continue;
      outputs.delete(output);
      try { output.dispose(); } catch (error) { errors.push(error); }
    }
    failures(errors, "HDRI output 정리 오류");
  };
  const disposeGenerator = () => {
    const owned = generator, restore = stopObserving; generator = null; stopObserving = null;
    const errors: unknown[] = [];
    try { restore?.(); } catch (error) { errors.push(error); }
    try { owned?.dispose(); } catch (error) { errors.push(error); }
    failures(errors, "HDRI generator 정리 오류");
  };
  try {
    active(options);
    if (webgpu(renderer)) {
      const runtime = await import("three/webgpu");
      active(options);
      if (!renderer.hasInitialized()) await renderer.init();
      active(options);
      const backend = renderer.backend;
      if (!(backend instanceof runtime.WebGPUBackend) || !hasQueue(backend)) {
        throw new StudioBg3dHdriPmremError("backend-unavailable");
      }
      generator = new runtime.PMREMGenerator(renderer);
      stopObserving = observeOutput(generator, "common", outputs);
      await generator.compileEquirectangularShader();
      active(options);
      if (renderer.backend !== backend) throw new StudioBg3dHdriPmremError("backend-unavailable");
      const conversionErrors: unknown[] = [];
      target = convert(renderer, generator, texture, conversionErrors);
      // 변환이 중간에 throw해도 앞선 submission이 끝난 뒤 candidate와 입력을 정리해야 한다.
      try { await backend.device.queue.onSubmittedWorkDone(); } catch (error) { conversionErrors.push(error); }
      failures(conversionErrors, "HDRI 변환·상태 복원·GPU 대기 실패");
      if (renderer.backend !== backend) throw new StudioBg3dHdriPmremError("backend-unavailable");
      active(options);
    } else if (webgl(renderer)) {
      generator = new PMREMGenerator(renderer);
      stopObserving = observeOutput(generator, "legacy", outputs);
      webglContext(renderer);
      await generator.compileEquirectangularShader();
      active(options);
      webglContext(renderer);
      const conversionErrors: unknown[] = [];
      target = convert(renderer, generator, texture, conversionErrors, () => webglContext(renderer), renderer.xr);
      failures(conversionErrors, "HDRI 변환·상태 복원 실패");
      active(options);
    } else {
      throw new StudioBg3dHdriPmremError("unsupported-renderer");
    }
    if (!target || !outputs.has(target)) throw new StudioBg3dHdriPmremError("unobserved-output");
    disposeOutputs(target);
    outputs.delete(target);
    return Object.freeze({ target, disposeGenerator });
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    try { disposeOutputs(); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
    try { disposeGenerator(); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
    if (cleanupErrors.length > 0) throw new AggregateError([error, ...cleanupErrors], "HDRI 변환 실패와 candidate 정리 오류", { cause: error });
    throw error;
  }
}
