/**
 * Wave 65 WebGPU 셰이더 파이프라인(PSO) 사전 컴파일 프리워머 및 네이티브/WebGPU 런타임 디스패처.
 *
 * - 브러시 첫 선택 시 발생하는 ~300ms 파이프라인 컴파일 끊김(hitch)을 유휴 시간대 우선순위
 *   사전 컴파일(PSO Prewarming)과 진성 LRU 캐시로 0ms로 제거한다.
 * - `StudioGpuNpuBridgeRuntime`은 6대 벤더 네이티브 브릿지 협상, 바이너리 IPC 송수신,
 *   3회 연속 실패 서킷브레이커 및 무중단 WebGPU WGSL 자동 폴백을 단일 런타임으로 통합한다.
 */

import {
  IPC_FLAGS,
  NativeBridgeIpcClient,
  computeCrc32Ieee,
  type CircuitBreakerState,
  type NativeBridgeIpcDiagnostics,
  type NativeBridgeTransport,
  type SharedMemoryHandleMeta,
} from "./native-bridge-ipc-protocol";
import {
  negotiateNativeBridgeSession,
  type HostHardwareProbe,
  type NativeBridgeSessionPlan,
} from "./vendor-session-negotiator";

export type PsoPipelineKind = "render" | "compute";
export type PsoPrewarmPriority = "critical" | "high" | "normal" | "low";

export interface WebGpuShaderModuleLike {
  readonly label?: string;
}

export interface WebGpuPipelineLike {
  readonly label?: string;
}

/** 표준 브라우저 `GPUDevice` 및 테스트용 경량 모형과 구조적으로 호환되는 WebGPU 장치 인터페이스. */
export interface WebGpuDeviceLike {
  createShaderModule(descriptor: { readonly label?: string; readonly code: string }): WebGpuShaderModuleLike;
  createRenderPipelineAsync?(descriptor: {
    readonly label?: string;
    readonly layout: "auto";
    readonly vertex: { readonly module: WebGpuShaderModuleLike; readonly entryPoint: string };
    readonly fragment: {
      readonly module: WebGpuShaderModuleLike;
      readonly entryPoint: string;
      readonly targets: readonly { readonly format: string }[];
    };
  }): Promise<WebGpuPipelineLike>;
  createComputePipelineAsync?(descriptor: {
    readonly label?: string;
    readonly layout: "auto";
    readonly compute: { readonly module: WebGpuShaderModuleLike; readonly entryPoint: string };
  }): Promise<WebGpuPipelineLike>;
  createRenderPipeline?(descriptor: {
    readonly label?: string;
    readonly layout: "auto";
    readonly vertex: { readonly module: WebGpuShaderModuleLike; readonly entryPoint: string };
    readonly fragment: {
      readonly module: WebGpuShaderModuleLike;
      readonly entryPoint: string;
      readonly targets: readonly { readonly format: string }[];
    };
  }): WebGpuPipelineLike;
  createComputePipeline?(descriptor: {
    readonly label?: string;
    readonly layout: "auto";
    readonly compute: { readonly module: WebGpuShaderModuleLike; readonly entryPoint: string };
  }): WebGpuPipelineLike;
}

export interface PsoShaderDescriptor {
  readonly shaderId: string;
  readonly pipelineKind: PsoPipelineKind;
  readonly wgslSource: string;
  readonly entryPoint: string;
  readonly vertexEntryPoint?: string;
  readonly targetFormat?: string;
  readonly priority: PsoPrewarmPriority;
  readonly brushCategory: string;
  readonly estimatedColdCompileMs: number;
  readonly variantTag?: string;
}

export interface CompiledPsoEntry {
  readonly cacheKey: string;
  readonly shaderId: string;
  readonly pipelineKind: PsoPipelineKind;
  readonly pipeline: WebGpuPipelineLike;
  readonly compiledAtMs: number;
  readonly compileDurationMs: number;
  readonly sourceCrc32: number;
  readonly prewarmed: boolean;
}

export interface PsoAcquireResult {
  readonly entry: CompiledPsoEntry;
  readonly cacheHit: boolean;
  readonly hitchMs: number;
  readonly avoidedHitchMs: number;
}

export interface PsoPrewarmBatchReport {
  readonly compiledShaderIds: readonly string[];
  readonly skippedAlreadyCached: number;
  readonly remainingQueueSize: number;
  readonly elapsedMs: number;
}

export interface PsoPrewarmerStats {
  readonly cacheSize: number;
  readonly maxCacheSize: number;
  readonly pendingQueueSize: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly prewarmedCount: number;
  readonly inflightDedupCount: number;
  readonly hitRate: number;
  readonly totalAvoidedHitchMs: number;
}

export interface WebGpuShaderPsoPrewarmerOptions {
  readonly device: WebGpuDeviceLike;
  readonly maxCacheSize?: number;
  readonly defaultTargetFormat?: string;
  readonly nowMs?: () => number;
  readonly onEvict?: (entry: CompiledPsoEntry) => void;
}

const PRIORITY_RANK: Readonly<Record<PsoPrewarmPriority, number>> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const ZERO_BIGINT = BigInt(0);

function encodeUtf8Bytes(input: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(input);
  }
  const bytes = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    bytes[i] = input.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/** 셰이더 ID·엔트리포인트·WGSL 소스 CRC32를 결합해 결정론적 PSO 캐시 키를 생성한다. */
export function computePsoCacheKey(
  descriptor: PsoShaderDescriptor,
  defaultTargetFormat = "bgra8unorm",
): string {
  const sourceCrc = computeCrc32Ieee(encodeUtf8Bytes(descriptor.wgslSource));
  const format = descriptor.pipelineKind === "render" ? (descriptor.targetFormat ?? defaultTargetFormat) : "compute";
  const vertex = descriptor.vertexEntryPoint ?? "vs_main";
  const variant = descriptor.variantTag ?? "default";
  return `${descriptor.shaderId}:${descriptor.pipelineKind}:${vertex}:${descriptor.entryPoint}:${format}:${variant}:${sourceCrc.toString(16)}`;
}

/** 스튜디오 핵심 브러시 및 네이티브 폴백 업스케일러·NPU WGSL 내장 셰이더 카탈로그. */
export const BUILTIN_STUDIO_BRUSH_SHADERS: readonly PsoShaderDescriptor[] = [
  {
    shaderId: "brush-ink-sdf-aa",
    pipelineKind: "render",
    vertexEntryPoint: "vs_quad",
    entryPoint: "fs_ink_sdf_aa",
    targetFormat: "bgra8unorm",
    priority: "critical",
    brushCategory: "inking",
    estimatedColdCompileMs: 310,
    wgslSource: [
      "@vertex fn vs_quad(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4<f32> {",
      "  let x = f32((idx & 1u) * 2u) - 1.0;",
      "  let y = f32(((idx >> 1u) & 1u) * 2u) - 1.0;",
      "  return vec4<f32>(x, y, 0.0, 1.0);",
      "}",
      "@fragment fn fs_ink_sdf_aa(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {",
      "  let dist = length(fract(pos.xy * 0.0625) - vec2<f32>(0.5, 0.5));",
      "  let cov = clamp(1.0 - smoothstep(0.32, 0.48, dist), 0.0, 1.0);",
      "  return vec4<f32>(0.08, 0.09, 0.11, cov);",
      "}",
    ].join("\n"),
  },
  {
    shaderId: "brush-wet-impasto-km",
    pipelineKind: "compute",
    entryPoint: "cs_impasto_km_mix",
    priority: "critical",
    brushCategory: "painting",
    estimatedColdCompileMs: 340,
    wgslSource: [
      "@group(0) @binding(0) var<storage, read_write> pigment: array<vec4<f32>>;",
      "@compute @workgroup_size(64) fn cs_impasto_km_mix(@builtin(global_invocation_id) gid: vec3<u32>) {",
      "  let i = gid.x;",
      "  if (i < arrayLength(&pigment)) {",
      "    pigment[i] = clamp(pigment[i] * 0.96 + vec4<f32>(0.02, 0.015, 0.01, 0.04), vec4<f32>(0.0), vec4<f32>(1.0));",
      "  }",
      "}",
    ].join("\n"),
  },
  {
    shaderId: "brush-watercolor-granulation",
    pipelineKind: "compute",
    entryPoint: "cs_granulation_flow",
    priority: "high",
    brushCategory: "watercolor",
    estimatedColdCompileMs: 295,
    wgslSource: [
      "@group(0) @binding(0) var<storage, read_write> wet_field: array<f32>;",
      "@compute @workgroup_size(64) fn cs_granulation_flow(@builtin(global_invocation_id) gid: vec3<u32>) {",
      "  let i = gid.x;",
      "  if (i < arrayLength(&wet_field)) { wet_field[i] = wet_field[i] * 0.985; }",
      "}",
    ].join("\n"),
  },
  {
    shaderId: "brush-screentone-halftone",
    pipelineKind: "render",
    vertexEntryPoint: "vs_tone",
    entryPoint: "fs_halftone_dot",
    targetFormat: "bgra8unorm",
    priority: "high",
    brushCategory: "comic-tone",
    estimatedColdCompileMs: 280,
    wgslSource: [
      "@vertex fn vs_tone(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4<f32> {",
      "  return vec4<f32>(f32(idx & 1u), f32((idx >> 1u) & 1u), 0.0, 1.0);",
      "}",
      "@fragment fn fs_halftone_dot(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {",
      "  let dot_val = step(0.35, length(fract(pos.xy * 0.125) - vec2<f32>(0.5, 0.5)));",
      "  return vec4<f32>(dot_val, dot_val, dot_val, 1.0);",
      "}",
    ].join("\n"),
  },
  {
    shaderId: "postfx-wgsl-upscaler-cas",
    pipelineKind: "compute",
    entryPoint: "cs_upscale_bicubic_cas",
    priority: "critical",
    brushCategory: "fallback-upscaler",
    estimatedColdCompileMs: 300,
    wgslSource: [
      "@group(0) @binding(0) var<storage, read_write> frame_rgba: array<vec4<f32>>;",
      "@compute @workgroup_size(64) fn cs_upscale_bicubic_cas(@builtin(global_invocation_id) gid: vec3<u32>) {",
      "  let i = gid.x;",
      "  if (i < arrayLength(&frame_rgba)) { frame_rgba[i] = clamp(frame_rgba[i], vec4<f32>(0.0), vec4<f32>(1.0)); }",
      "}",
    ].join("\n"),
  },
  {
    shaderId: "npu-wgsl-lineart-extract",
    pipelineKind: "compute",
    entryPoint: "cs_lineart_sobel_npu_fallback",
    priority: "normal",
    brushCategory: "fallback-npu",
    estimatedColdCompileMs: 320,
    wgslSource: [
      "@group(0) @binding(0) var<storage, read_write> luma_edge: array<f32>;",
      "@compute @workgroup_size(64) fn cs_lineart_sobel_npu_fallback(@builtin(global_invocation_id) gid: vec3<u32>) {",
      "  let i = gid.x;",
      "  if (i < arrayLength(&luma_edge)) { luma_edge[i] = clamp(abs(luma_edge[i]), 0.0, 1.0); }",
      "}",
    ].join("\n"),
  },
];

/**
 * 우선순위 유휴 스케줄러·진성 LRU 캐시·인플라이트 중복제거를 갖춘 WebGPU PSO 프리워머.
 */
export class WebGpuShaderPsoPrewarmer {
  private readonly device: WebGpuDeviceLike;
  private readonly maxCacheSize: number;
  private readonly defaultTargetFormat: string;
  private readonly nowMs: () => number;
  private readonly onEvict?: (entry: CompiledPsoEntry) => void;

  private readonly cache = new Map<string, CompiledPsoEntry>();
  private readonly inflight = new Map<string, Promise<CompiledPsoEntry>>();
  private readonly queue: PsoShaderDescriptor[] = [];
  private readonly queuedKeys = new Set<string>();

  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private prewarmedCount = 0;
  private inflightDedupCount = 0;
  private totalAvoidedHitchMs = 0;

  constructor(options: WebGpuShaderPsoPrewarmerOptions) {
    this.device = options.device;
    this.maxCacheSize = Math.max(1, options.maxCacheSize ?? 64);
    this.defaultTargetFormat = options.defaultTargetFormat ?? "bgra8unorm";
    this.nowMs = options.nowMs ?? (() => performance.now());
    this.onEvict = options.onEvict;
  }

  /** 프리워밍 대기열에 셰이더 서술자를 등록하고 우선순위(`critical`→`low`) 순으로 정렬한다. */
  enqueue(descriptors: readonly PsoShaderDescriptor[]): number {
    let added = 0;
    for (const descriptor of descriptors) {
      const key = computePsoCacheKey(descriptor, this.defaultTargetFormat);
      if (this.cache.has(key) || this.queuedKeys.has(key)) {
        continue;
      }
      this.queuedKeys.add(key);
      this.queue.push(descriptor);
      added += 1;
    }
    this.queue.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    return added;
  }

  /** 유휴 프레임 시간 예산(`budgetMs`)과 최대 개수 안에서 큐에 쌓인 PSO를 사전 컴파일한다. */
  async prewarmBatch(options?: { readonly budgetMs?: number; readonly maxCount?: number }): Promise<PsoPrewarmBatchReport> {
    const budgetMs = options?.budgetMs ?? Number.POSITIVE_INFINITY;
    const maxCount = options?.maxCount ?? Number.POSITIVE_INFINITY;
    const startedMs = this.nowMs();
    const compiledShaderIds: string[] = [];
    let skippedAlreadyCached = 0;

    while (this.queue.length > 0 && compiledShaderIds.length < maxCount) {
      if (compiledShaderIds.length > 0 && this.nowMs() - startedMs >= budgetMs) {
        break;
      }
      const next = this.queue.shift();
      if (!next) break;
      const key = computePsoCacheKey(next, this.defaultTargetFormat);
      this.queuedKeys.delete(key);

      if (this.cache.has(key)) {
        skippedAlreadyCached += 1;
        continue;
      }
      await this.compileOrJoin(next, key, true);
      compiledShaderIds.push(next.shaderId);
    }

    return {
      compiledShaderIds,
      skippedAlreadyCached,
      remainingQueueSize: this.queue.length,
      elapsedMs: Math.max(0, this.nowMs() - startedMs),
    };
  }

  /** 등록된 모든 대기 PSO를 끝까지 사전 컴파일한다. */
  async prewarmAll(): Promise<PsoPrewarmBatchReport> {
    return this.prewarmBatch({ budgetMs: Number.POSITIVE_INFINITY, maxCount: Number.POSITIVE_INFINITY });
  }

  /** 캐시에 준비된 PSO를 즉시 반환(0ms hitch)하거나 미스 시 컴파일 후 LRU에 적재한다. */
  async acquirePipeline(descriptor: PsoShaderDescriptor): Promise<PsoAcquireResult> {
    const key = computePsoCacheKey(descriptor, this.defaultTargetFormat);
    const cached = this.touchLru(key);
    if (cached) {
      this.hits += 1;
      const avoided = Math.max(0, descriptor.estimatedColdCompileMs);
      this.totalAvoidedHitchMs += avoided;
      return {
        entry: cached,
        cacheHit: true,
        hitchMs: 0,
        avoidedHitchMs: avoided,
      };
    }

    this.misses += 1;
    const startedMs = this.nowMs();
    const entry = await this.compileOrJoin(descriptor, key, false);
    const waitMs = Math.max(0, this.nowMs() - startedMs);
    return {
      entry,
      cacheHit: false,
      hitchMs: waitMs,
      avoidedHitchMs: 0,
    };
  }

  hasCached(descriptor: PsoShaderDescriptor): boolean {
    return this.cache.has(computePsoCacheKey(descriptor, this.defaultTargetFormat));
  }

  getCachedKeysInLruOrder(): readonly string[] {
    return Array.from(this.cache.keys());
  }

  getStats(): PsoPrewarmerStats {
    const totalLookups = this.hits + this.misses;
    return {
      cacheSize: this.cache.size,
      maxCacheSize: this.maxCacheSize,
      pendingQueueSize: this.queue.length,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      prewarmedCount: this.prewarmedCount,
      inflightDedupCount: this.inflightDedupCount,
      hitRate: totalLookups === 0 ? 1 : this.hits / totalLookups,
      totalAvoidedHitchMs: this.totalAvoidedHitchMs,
    };
  }

  private touchLru(key: string): CompiledPsoEntry | undefined {
    const existing = this.cache.get(key);
    if (!existing) return undefined;
    this.cache.delete(key);
    this.cache.set(key, existing);
    return existing;
  }

  private insertLru(key: string, entry: CompiledPsoEntry): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, entry);
    while (this.cache.size > this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      const evicted = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      this.evictions += 1;
      if (evicted && this.onEvict) {
        this.onEvict(evicted);
      }
    }
  }

  private compileOrJoin(
    descriptor: PsoShaderDescriptor,
    cacheKey: string,
    isPrewarm: boolean,
  ): Promise<CompiledPsoEntry> {
    const running = this.inflight.get(cacheKey);
    if (running) {
      this.inflightDedupCount += 1;
      return running;
    }

    const promise = this.compileSingle(descriptor, cacheKey, isPrewarm).finally(() => {
      this.inflight.delete(cacheKey);
    });
    this.inflight.set(cacheKey, promise);
    return promise;
  }

  private async compileSingle(
    descriptor: PsoShaderDescriptor,
    cacheKey: string,
    isPrewarm: boolean,
  ): Promise<CompiledPsoEntry> {
    const startedMs = this.nowMs();
    const shaderModule = this.device.createShaderModule({
      label: `toonstudio:${descriptor.shaderId}`,
      code: descriptor.wgslSource,
    });

    let pipeline: WebGpuPipelineLike;
    if (descriptor.pipelineKind === "render") {
      const renderDesc = {
        label: `toonstudio:pso:render:${descriptor.shaderId}`,
        layout: "auto" as const,
        vertex: {
          module: shaderModule,
          entryPoint: descriptor.vertexEntryPoint ?? "vs_main",
        },
        fragment: {
          module: shaderModule,
          entryPoint: descriptor.entryPoint,
          targets: [{ format: descriptor.targetFormat ?? this.defaultTargetFormat }],
        },
      };
      if (this.device.createRenderPipelineAsync) {
        pipeline = await this.device.createRenderPipelineAsync(renderDesc);
      } else if (this.device.createRenderPipeline) {
        pipeline = this.device.createRenderPipeline(renderDesc);
      } else {
        throw new Error("WebGPU 장치가 렌더 파이프라인 생성을 지원하지 않습니다.");
      }
    } else {
      const computeDesc = {
        label: `toonstudio:pso:compute:${descriptor.shaderId}`,
        layout: "auto" as const,
        compute: {
          module: shaderModule,
          entryPoint: descriptor.entryPoint,
        },
      };
      if (this.device.createComputePipelineAsync) {
        pipeline = await this.device.createComputePipelineAsync(computeDesc);
      } else if (this.device.createComputePipeline) {
        pipeline = this.device.createComputePipeline(computeDesc);
      } else {
        throw new Error("WebGPU 장치가 컴퓨트 파이프라인 생성을 지원하지 않습니다.");
      }
    }

    const compiledAtMs = this.nowMs();
    const entry: CompiledPsoEntry = {
      cacheKey,
      shaderId: descriptor.shaderId,
      pipelineKind: descriptor.pipelineKind,
      pipeline,
      compiledAtMs,
      compileDurationMs: Math.max(0, compiledAtMs - startedMs),
      sourceCrc32: computeCrc32Ieee(encodeUtf8Bytes(descriptor.wgslSource)),
      prewarmed: isPrewarm,
    };

    this.insertLru(cacheKey, entry);
    if (isPrewarm) {
      this.prewarmedCount += 1;
    }
    return entry;
  }
}

export interface StudioGpuNpuBridgeRuntimeOptions {
  readonly device: WebGpuDeviceLike;
  readonly transport?: NativeBridgeTransport;
  readonly timeoutMs?: number;
  readonly failureThreshold?: number;
  readonly cooldownMs?: number;
  readonly psoCacheCapacity?: number;
  readonly customShaders?: readonly PsoShaderDescriptor[];
  readonly nowMs?: () => number;
}

export interface StudioFrameDispatchRequest {
  readonly brushShaderId: string;
  readonly shm?: SharedMemoryHandleMeta;
  readonly payload?: Uint8Array;
  readonly requireNpuAssist?: boolean;
}

export interface StudioFrameDispatchResult {
  readonly executionPath: "native-bridge" | "webgpu-wgsl-fallback";
  readonly brushPipeline: PsoAcquireResult;
  readonly fallbackUpscalerPipeline?: PsoAcquireResult;
  readonly nativeLatencyUs?: number;
  readonly fallbackReason?: string;
  readonly circuitState: CircuitBreakerState;
}

export interface StudioBridgeRuntimeTelemetry {
  readonly sessionPlan: NativeBridgeSessionPlan | null;
  readonly activeExecutionPath: "native-bridge" | "webgpu-wgsl-fallback";
  readonly nativeFramesDispatched: number;
  readonly fallbackFramesDispatched: number;
  readonly ipcDiagnostics: NativeBridgeIpcDiagnostics | null;
  readonly psoStats: PsoPrewarmerStats;
}

/**
 * 데스크톱 네이티브 GPU/NPU 브릿지와 WebGPU WGSL PSO 런타임을 무중단으로 결합하는 실행기.
 */
export class StudioGpuNpuBridgeRuntime {
  readonly prewarmer: WebGpuShaderPsoPrewarmer;
  readonly ipcClient: NativeBridgeIpcClient | null;

  private readonly shaderCatalog = new Map<string, PsoShaderDescriptor>();
  private sessionPlan: NativeBridgeSessionPlan | null = null;
  private nativeFramesDispatched = 0;
  private fallbackFramesDispatched = 0;

  constructor(options: StudioGpuNpuBridgeRuntimeOptions) {
    this.prewarmer = new WebGpuShaderPsoPrewarmer({
      device: options.device,
      maxCacheSize: options.psoCacheCapacity ?? 64,
      nowMs: options.nowMs,
    });
    this.ipcClient = options.transport
      ? new NativeBridgeIpcClient({
          transport: options.transport,
          timeoutMs: options.timeoutMs,
          failureThreshold: options.failureThreshold,
          cooldownMs: options.cooldownMs,
          nowMs: options.nowMs,
        })
      : null;

    for (const shader of BUILTIN_STUDIO_BRUSH_SHADERS) {
      this.shaderCatalog.set(shader.shaderId, shader);
    }
    for (const shader of options.customShaders ?? []) {
      this.shaderCatalog.set(shader.shaderId, shader);
    }
  }

  /** 하드웨어 프로브를 협상하고 필요 시 스튜디오 핵심 브러시·폴백 PSO를 즉시 사전 컴파일한다. */
  async initialize(
    probe: HostHardwareProbe,
    options?: { readonly prewarmAllShaders?: boolean },
  ): Promise<NativeBridgeSessionPlan> {
    this.sessionPlan = negotiateNativeBridgeSession(probe);
    const allShaders = Array.from(this.shaderCatalog.values());
    this.prewarmer.enqueue(allShaders);
    if (options?.prewarmAllShaders !== false) {
      await this.prewarmer.prewarmAll();
    }
    return this.sessionPlan;
  }

  /** 브러시 선택 시 프리워밍된 PSO를 즉시 획득한다(사전 컴파일 완료 시 0ms hitch). */
  async selectBrushPipeline(shaderId: string): Promise<PsoAcquireResult> {
    const descriptor = this.shaderCatalog.get(shaderId);
    if (!descriptor) {
      throw new Error(`등록되지 않은 스튜디오 브러시 셰이더 ID입니다: ${shaderId}`);
    }
    return this.prewarmer.acquirePipeline(descriptor);
  }

  /**
   * 프레임을 네이티브 GPU/NPU 브릿지로 디스패치하고, 브라우저 샌드박스·IPC 장애·서킷 오픈 시
   * 사전 컴파일된 WebGPU WGSL 업스케일러 파이프라인으로 무중단 전환한다.
   */
  async dispatchFrame(request: StudioFrameDispatchRequest): Promise<StudioFrameDispatchResult> {
    const brushPipeline = await this.selectBrushPipeline(request.brushShaderId);
    const plan = this.sessionPlan;

    const canAttemptNative =
      plan !== null &&
      plan.isNativeAccelerated &&
      this.ipcClient !== null &&
      this.ipcClient.getCircuitState() !== "open";

    if (canAttemptNative && plan && this.ipcClient) {
      const shm: SharedMemoryHandleMeta = request.shm ?? {
        handleId: plan.zeroCopyEnabled ? BigInt(1) : ZERO_BIGINT,
        byteOffset: 0,
        byteLength: plan.zeroCopyEnabled ? 4096 : 0,
      };
      let flags = plan.recommendedFlags;
      if (!plan.zeroCopyEnabled || shm.handleId === ZERO_BIGINT || shm.byteLength === 0) {
        flags &= ~IPC_FLAGS.ZERO_COPY_SHM;
      }
      if (request.requireNpuAssist && plan.npuBackend !== "webgpu-compute-fallback") {
        flags |= IPC_FLAGS.NPU_ASSISTED;
      }

      const result = await this.ipcClient.sendPacket({
        kind: "frame-submit",
        vendor: plan.vendor,
        shm,
        flags,
        frameBudgetUs: plan.frameBudgetUs,
        actualLatencyUs: 0,
        payload: request.payload ?? new Uint8Array(0),
      });

      if (result.ok) {
        this.nativeFramesDispatched += 1;
        return {
          executionPath: "native-bridge",
          brushPipeline,
          nativeLatencyUs: result.response.actualLatencyUs,
          circuitState: result.circuitState,
        };
      }

      this.fallbackFramesDispatched += 1;
      const fallbackUpscalerPipeline = await this.selectBrushPipeline("postfx-wgsl-upscaler-cas");
      return {
        executionPath: "webgpu-wgsl-fallback",
        brushPipeline,
        fallbackUpscalerPipeline,
        fallbackReason: `${result.reason}: ${result.detail}`,
        circuitState: result.circuitState,
      };
    }

    this.fallbackFramesDispatched += 1;
    const fallbackUpscalerPipeline = await this.selectBrushPipeline("postfx-wgsl-upscaler-cas");
    const circuitState = this.ipcClient ? this.ipcClient.getCircuitState() : "closed";
    const fallbackReason =
      plan?.fallbackReason ??
      (circuitState === "open"
        ? "circuit-open-webgpu-wgsl-fallback"
        : "no-native-transport-webgpu-wgsl-fallback");

    return {
      executionPath: "webgpu-wgsl-fallback",
      brushPipeline,
      fallbackUpscalerPipeline,
      fallbackReason,
      circuitState,
    };
  }

  getRuntimeTelemetry(): StudioBridgeRuntimeTelemetry {
    const ipcDiagnostics = this.ipcClient ? this.ipcClient.getDiagnostics() : null;
    const isNativeLive =
      this.sessionPlan !== null &&
      this.sessionPlan.isNativeAccelerated &&
      ipcDiagnostics !== null &&
      ipcDiagnostics.circuitState !== "open";

    return {
      sessionPlan: this.sessionPlan,
      activeExecutionPath: isNativeLive ? "native-bridge" : "webgpu-wgsl-fallback",
      nativeFramesDispatched: this.nativeFramesDispatched,
      fallbackFramesDispatched: this.fallbackFramesDispatched,
      ipcDiagnostics,
      psoStats: this.prewarmer.getStats(),
    };
  }
}
