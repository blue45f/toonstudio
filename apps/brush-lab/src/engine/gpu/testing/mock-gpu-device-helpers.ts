import {
  createMockGpu,
  type MockGpu,
} from "./mock-gpu-device";

export interface MockDraw {
  entryPoint: string;
  vertexCount: number;
  instanceCount: number;
  pass: number;
}

export interface MockIndirectDraw {
  entryPoint: string;
  kind: "indirect" | "indexed-indirect";
  indirectBuffer: string;
  indirectOffset: number;
  vertexOrIndexCount: number;
  instanceCount: number;
  pass: number;
}

export interface MockRenderBundle {
  label: string;
  draws: MockDraw[];
  indirectDraws: MockIndirectDraw[];
}

export interface MockRenderBundleEncoderContext {
  readonly encoderLabel: string;
  readonly pipelineOf: WeakMap<object, { label: string; entryPoint: string; layoutLabel: string | null }>;
  readonly renderBundles: MockRenderBundle[];
  readonly bundleOf: WeakMap<object, MockRenderBundle>;
  readonly record: (call: string) => void;
  readonly labelOf: (desc: { label?: string } | undefined, fallback: string) => string;
}

export function buildMockRenderBundleEncoder(ctx: MockRenderBundleEncoderContext): GPURenderBundleEncoder {
  let bundlePipeline: { label: string; entryPoint: string; layoutLabel: string | null } | null = null;
  const bundleDraws: MockDraw[] = [];
  const bundleIndirectDraws: MockIndirectDraw[] = [];
  const bundleEncoder = {
    label: ctx.encoderLabel,
    setPipeline(p: GPURenderPipeline): void {
      const h = ctx.pipelineOf.get(p);
      if (!h) throw new Error("mock: unknown render pipeline in bundle");
      bundlePipeline = h;
      ctx.record("bundle.setPipeline");
    },
    setBindGroup(): void {
      ctx.record("bundle.setBindGroup");
    },
    setVertexBuffer(): void {
      ctx.record("bundle.setVertexBuffer");
    },
    setIndexBuffer(): void {
      ctx.record("bundle.setIndexBuffer");
    },
    draw(vertexCount: number, instanceCount = 1): void {
      ctx.record("bundle.draw");
      if (!bundlePipeline) throw new Error("mock: bundle draw without pipeline");
      bundleDraws.push({ entryPoint: bundlePipeline.entryPoint, vertexCount, instanceCount, pass: 0 });
    },
    finish(bundleDesc?: GPURenderBundleDescriptor): GPURenderBundle {
      ctx.record("bundle.finish");
      const label = ctx.labelOf(bundleDesc, ctx.encoderLabel);
      const entry: MockRenderBundle = { label, draws: bundleDraws.slice(), indirectDraws: bundleIndirectDraws.slice() };
      ctx.renderBundles.push(entry);
      const handle = { label } as unknown as GPURenderBundle;
      ctx.bundleOf.set(handle, entry);
      return handle;
    },
  };
  return bundleEncoder as unknown as GPURenderBundleEncoder;
}

/** 가짜 GPUAdapter(probe 테스트용). */
export interface MockAdapterOptions {
  info?: Partial<GPUAdapterInfo> & { isFallbackAdapter?: boolean };
  features?: readonly string[];
  limits?: Partial<Record<string, number>>;
  /** requestDevice가 거부할 오류. */
  rejectDevice?: Error;
  gpu?: MockGpu;
  /**
   * true면 `requiredLimits`를 장치 한도에 반영하지 않는다(요청은 받아들이지만 기본 한도만 주는 호스트). 기본 false:
   * 실제 WebGPU처럼 어댑터 한도 이하의 요청은 장치 한도에 반영하고, 어댑터 한도를 넘는 요청은 거부한다.
   */
  ignoreRequiredLimits?: boolean;
}

export function createMockAdapter(options: MockAdapterOptions = {}): { adapter: GPUAdapter; gpu: MockGpu } {
  const gpu = options.gpu ?? createMockGpu({ features: options.features, limits: options.limits });
  const info = {
    vendor: options.info?.vendor ?? "mock",
    architecture: options.info?.architecture ?? "mock-arch",
    device: options.info?.device ?? "mock-device",
    description: options.info?.description ?? "mock adapter",
    isFallbackAdapter: options.info?.isFallbackAdapter ?? false,
    subgroupMinSize: 4,
    subgroupMaxSize: 64,
  };
  const adapter = {
    info,
    features: new Set<string>(options.features ?? []),
    limits: { ...(gpu.device.limits as unknown as Record<string, number>), ...options.limits },
    async requestDevice(desc?: GPUDeviceDescriptor): Promise<GPUDevice> {
      if (options.rejectDevice) throw options.rejectDevice;
      const adapterLimits = adapter.limits as Record<string, number>;
      const deviceLimits = gpu.device.limits as unknown as Record<string, number>;
      for (const [name, value] of Object.entries(desc?.requiredLimits ?? {})) {
        if (typeof value !== "number") continue;
        const have = adapterLimits[name];
        if (have !== undefined && value > have) throw new TypeError(`requiredLimits ${name} ${value} exceeds adapter limit ${have}`);
        if (!options.ignoreRequiredLimits && value > (deviceLimits[name] ?? 0)) deviceLimits[name] = value;
      }
      for (const f of desc?.requiredFeatures ?? []) {
        if (!adapter.features.has(f)) throw new TypeError(`feature ${f} unsupported`);
        (gpu.device.features as Set<string>).add(f);
      }
      return gpu.device;
    },
  };
  return { adapter: adapter as unknown as GPUAdapter, gpu };
}

/** 가짜 GPU(navigator.gpu 대응). `adapter: null`이면 requestAdapter가 null을 돌려준다. */
export function createMockGpuApi(adapter: GPUAdapter | null, preferredFormat: GPUTextureFormat = "bgra8unorm"): GPU {
  return {
    async requestAdapter(): Promise<GPUAdapter | null> {
      return adapter;
    },
    getPreferredCanvasFormat(): GPUTextureFormat {
      return preferredFormat;
    },
    wgslLanguageFeatures: new Set<string>(),
  } as unknown as GPU;
}

/** 가짜 WebGPU 캔버스(present 경로 테스트용). */
export function createMockCanvas(gpu: MockGpu, width: number, height: number): { canvas: OffscreenCanvas; configured: GPUCanvasConfiguration[] } {
  const configured: GPUCanvasConfiguration[] = [];
  const texture = gpu.device.createTexture({
    label: "mock-canvas-texture",
    size: { width, height },
    format: "bgra8unorm",
    usage: 0x10,
  });
  const ctx = {
    canvas: null,
    configure(cfg: GPUCanvasConfiguration): void {
      configured.push(cfg);
    },
    unconfigure(): void {
      configured.length = 0;
    },
    getCurrentTexture(): GPUTexture {
      return texture;
    },
    getConfiguration(): GPUCanvasConfiguration | null {
      return configured[configured.length - 1] ?? null;
    },
  };
  const canvas = {
    width,
    height,
    getContext(kind: string): unknown {
      return kind === "webgpu" ? ctx : null;
    },
  } as unknown as OffscreenCanvas;
  return { canvas, configured };
}
