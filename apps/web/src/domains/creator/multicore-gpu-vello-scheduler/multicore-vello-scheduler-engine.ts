/**
 * Wave 53C — CPU 멀티코어(Work-Stealing SAB) · GPU 멀티스레드(Vello 6단계 Compute) ·
 * WebNN NPU · 최신 Chrome Preview 차세대 웹 플랫폼 통합 스케줄러 엔진.
 *
 * - 현재 구현(Current): 결정론적 워커 풀 분할, Vello 6단계 GPU 파이프라인 플래너,
 *   10종 웹 플랫폼 호환성 판별, 이기종 프레임 타임라인 시뮬레이터 및 JSON 매니페스트 생성.
 * - 목표 런타임(Target): `crates/studio-engine-vello`·`crates/studio-wasm64-drawing-core`와
 *   결합한 COOP/COEP SAB 링버퍼 및 Chrome Preview WebGPU·WebNN 실기 가속.
 */

export const SCHEDULER_MANIFEST_SCHEMA_VERSION = "toonstudio.multicore-vello-scheduler-plan.v1" as const;
export const MIN_HARDWARE_CONCURRENCY = 2 as const;
export const MAX_HARDWARE_CONCURRENCY = 32 as const;
export const DEFAULT_HARDWARE_CONCURRENCY = 8 as const;
export const CORE_COUNT_PRESETS = [4, 8, 12, 16, 24] as const;
export const COMPUTE_PRESSURE_STATES = ["nominal", "fair", "serious", "critical"] as const;
export const WEBGPU_BASELINE_STORAGE_BINDINGS_LIMIT = 8 as const;
export const LOCK_FREE_RING_SLOT_COUNT = 256 as const;
export const LOCK_FREE_CACHE_LINE_BYTES = 64 as const;
export const MIN_WASM_STEAL_WORKERS = 1 as const;
export const MAX_WASM_STEAL_WORKERS = 12 as const;

export type ComputePressureState = (typeof COMPUTE_PRESSURE_STATES)[number];
export type TaskSchedulerPriority = "user-blocking" | "user-visible" | "background";
export type WebPlatformSupportStatus = "stable" | "preview-origin-trial" | "fallback";
export type ProbeRuntimeState = "active-stable" | "active-preview" | "fallback-active";
export type QueueTransportKind = "sab-atomics-wait-async-ring" | "message-channel-transferable-ring";
export type WorkStealingStrategy = "chase-lev-atomics-wait-async" | "message-channel-transferable-fallback";
export type NpuInferenceWorkload = "none" | "line-assist" | "pigment-denoise" | "full-realtime";
export type NpuExecutionBackend = "webnn-npu-coreml-directml-nnapi" | "webgpu-compute-fallback" | "wasm-simd-cpu-fallback";
export type TimelineSegmentTone = "main" | "audio" | "wasm" | "gpu" | "npu" | "alert";

export type NextGenWebPlatformProbeId =
  | "webgpu-subgroups" | "webgpu-shader-f16" | "webgpu-multi-draw-indirect" | "webgpu-timestamp-query"
  | "webnn-npu" | "wasm-memory64" | "wasm-relaxed-simd" | "sab-atomics-wait-async"
  | "compute-pressure-api" | "prioritized-task-scheduling";

export type VelloStageId =
  | "path-encode" | "flatten-cubic" | "subgroup-coarse-bin"
  | "prefix-sum-alloc" | "fine-sparse-raster" | "indirect-composite";

export type ExecutionLaneKind =
  | "main-ui" | "audio-worklet" | "render-worker" | "wasm-simd-pool" | "vello-gpu" | "webnn-npu";

export interface NextGenWebPlatformProbeSpec {
  readonly id: NextGenWebPlatformProbeId;
  readonly domain: "gpu" | "npu" | "wasm" | "cpu-sync" | "scheduling";
  readonly apiName: string; readonly titleKo: string; readonly titleEn: string;
  readonly chromeStatus: WebPlatformSupportStatus;
  readonly requiresCoopCoep: boolean; readonly requiresChromePreview: boolean;
  readonly browserSupportNoteKo: string; readonly browserSupportNoteEn: string;
  readonly accelerationRoleKo: string; readonly accelerationRoleEn: string;
  readonly fallbackPathKo: string; readonly fallbackPathEn: string;
}

export interface SchedulerEnvironmentInput {
  readonly hardwareConcurrency?: number; readonly pressureState?: ComputePressureState;
  readonly coopCoepIsolated?: boolean; readonly chromePreviewEnabled?: boolean;
  readonly activePaths?: number; readonly dirtyTiles?: number;
  readonly targetFrameRateHz?: 60 | 120; readonly npuInferenceWorkload?: NpuInferenceWorkload;
  readonly featureOverrides?: Readonly<Partial<Record<NextGenWebPlatformProbeId, boolean>>>;
}

export interface NormalizedSchedulerEnvironment {
  readonly hardwareConcurrency: number; readonly pressureState: ComputePressureState;
  readonly coopCoepIsolated: boolean; readonly chromePreviewEnabled: boolean;
  readonly activePaths: number; readonly dirtyTiles: number;
  readonly targetFrameRateHz: 60 | 120; readonly npuInferenceWorkload: NpuInferenceWorkload;
  readonly featureOverrides: Readonly<Partial<Record<NextGenWebPlatformProbeId, boolean>>>;
}

export interface EvaluatedWebPlatformProbe {
  readonly spec: NextGenWebPlatformProbeSpec; readonly runtimeState: ProbeRuntimeState;
  readonly active: boolean; readonly statusReasonKo: string; readonly statusReasonEn: string;
}

export interface NextGenPlatformMatrixReport {
  readonly probes: readonly EvaluatedWebPlatformProbe[]; readonly totalProbes: number;
  readonly activeStableCount: number; readonly activePreviewCount: number; readonly fallbackCount: number;
  readonly activeById: Readonly<Record<NextGenWebPlatformProbeId, boolean>>;
}

export interface CpuWorkerRoleAllocation {
  readonly id: "main-ui" | "audio-worklet" | "webgpu-render-worker" | "wasm-simd-steal-pool";
  readonly titleKo: string; readonly titleEn: string;
  readonly threadCount: number; readonly parkedCount: number;
  readonly schedulerPriority: TaskSchedulerPriority;
  readonly responsibilitiesKo: readonly string[]; readonly responsibilitiesEn: readonly string[];
  readonly backingCrateOrApi: string;
}

export interface CpuMulticoreWorkerPoolPlan {
  readonly hardwareConcurrency: number; readonly pressureState: ComputePressureState;
  readonly pressureThrottleFactor: number; readonly mainThreadBlockingBudgetPct: 0;
  readonly dedicatedAudioWorkletCount: 1; readonly dedicatedRenderWorkerCount: 1;
  readonly rawWasmSimdWorkerCount: number; readonly activeWasmSimdWorkerCount: number;
  readonly parkedWasmWorkerCount: number; readonly totalActiveWorkerThreads: number;
  readonly oversubscribedLogicalCores: boolean;
  readonly queueTransport: QueueTransportKind; readonly workStealingStrategy: WorkStealingStrategy;
  readonly ringSlotCount: number; readonly cacheLinePaddingBytes: number;
  readonly zeroCopyTransferCount: 0; readonly estimatedDispatchOverheadUs: number;
  readonly wasmMemoryAddressBits: 64 | 32; readonly wasmSimdTier: "relaxed-simd" | "simd128";
  readonly postTaskNativeActive: boolean; readonly effectiveTargetFrameRateHz: 60 | 120;
  readonly fallbackReasonKo: string | null; readonly fallbackReasonEn: string | null;
  readonly pressureActionKo: string; readonly pressureActionEn: string;
  readonly roles: readonly CpuWorkerRoleAllocation[];
}

export interface VelloWarpOccupancyConstraint {
  readonly targetSubgroupSize: 32 | 64; readonly estimatedSharedMemBytes: number;
  readonly maxActiveWorkgroupsPerSm: number; readonly estimatedOccupancyPct: number;
  readonly bottleneckNoteKo: string; readonly bottleneckNoteEn: string;
}

export interface VelloAsyncPrecompileSpec {
  readonly api: "createComputePipelineAsync"; readonly priority: TaskSchedulerPriority;
  readonly parallelWave: 1 | 2; readonly estimatedCompileMs: number; readonly cacheKey: string;
}

export interface VelloComputeStagePlan {
  readonly order: 1 | 2 | 3 | 4 | 5 | 6; readonly id: VelloStageId;
  readonly nameKo: string; readonly nameEn: string;
  readonly roleKo: string; readonly roleEn: string;
  readonly workgroupSize: readonly [number, number, number];
  readonly dispatchWorkgroups: readonly [number, number, number];
  readonly storageBindingCount: number; readonly uniformBindingCount: number; readonly totalBindings: number;
  readonly warpOccupancy: VelloWarpOccupancyConstraint;
  readonly wgslDirectives: readonly string[];
  readonly activeFeatureTag: string; readonly fallbackActive: boolean;
  readonly fallbackNoteKo: string; readonly fallbackNoteEn: string;
  readonly asyncPrecompile: VelloAsyncPrecompileSpec;
  readonly estimatedGpuMs: number;
}

export interface VelloComputeStageGraphPlan {
  readonly stages: readonly VelloComputeStagePlan[]; readonly totalStages: 6;
  readonly maxStorageBindingsUsed: number; readonly withinBaselineBindingLimit: boolean;
  readonly subgroupsActive: boolean; readonly shaderF16Active: boolean;
  readonly multiDrawIndirectActive: boolean; readonly timestampQueryActive: boolean;
  readonly pressureGpuClockScale: number; readonly totalEstimatedGpuMs: number;
  readonly sequentialPrecompileMs: number; readonly parallelAsyncPrecompileMs: number;
  readonly precompileSpeedupRatio: number;
  readonly timingSourceLabelKo: string; readonly timingSourceLabelEn: string;
}

export interface TimelineGanttSegment {
  readonly id: string; readonly lane: ExecutionLaneKind;
  readonly labelKo: string; readonly labelEn: string;
  readonly startMs: number; readonly durationMs: number; readonly endMs: number;
  readonly tone: TimelineSegmentTone; readonly stageId?: VelloStageId; readonly isFallback: boolean;
}

export interface HeterogeneousFrameTimeline {
  readonly targetFrameRateHz: 60 | 120; readonly effectiveFrameRateHz: 60 | 120;
  readonly frameBudgetMs: number; readonly mainThreadBusyMs: number; readonly mainThreadBlockingPct: 0;
  readonly audioQuantumMs: number; readonly renderWorkerSubmitMs: number;
  readonly wasmPoolWallMs: number; readonly velloGpuWallMs: number;
  readonly npuTaskWallMs: number; readonly npuExecutionBackend: NpuExecutionBackend;
  readonly serialTotalMs: number; readonly totalFrameWallMs: number;
  readonly parallelOverlapGainPct: number; readonly meetsFrameBudget: boolean;
  readonly estimatedAchievableFps: number;
  readonly segments: readonly TimelineGanttSegment[];
}

export interface HonestScopeDisclosure {
  readonly currentImplementationKo: string; readonly currentImplementationEn: string;
  readonly targetRuntimeKo: string; readonly targetRuntimeEn: string;
}

export interface MulticoreVelloSchedulerPlan {
  readonly schemaVersion: typeof SCHEDULER_MANIFEST_SCHEMA_VERSION;
  readonly environment: NormalizedSchedulerEnvironment;
  readonly platformMatrix: NextGenPlatformMatrixReport;
  readonly cpuWorkerPool: CpuMulticoreWorkerPoolPlan;
  readonly velloComputeGraph: VelloComputeStageGraphPlan;
  readonly frameTimeline: HeterogeneousFrameTimeline;
  readonly honestScopeDisclosure: HonestScopeDisclosure;
}

export interface RuntimeCapabilityProbeSnapshot {
  readonly detectedHardwareConcurrency: number; readonly crossOriginIsolated: boolean;
  readonly sharedArrayBufferAvailable: boolean; readonly atomicsWaitAsyncAvailable: boolean;
  readonly webGpuAvailable: boolean; readonly webNnAvailable: boolean;
  readonly pressureObserverAvailable: boolean; readonly schedulerPostTaskAvailable: boolean;
}

function makeProbe(
  id: NextGenWebPlatformProbeId,
  domain: NextGenWebPlatformProbeSpec["domain"],
  apiName: string,
  title: readonly [string, string],
  chromeStatus: WebPlatformSupportStatus,
  flags: readonly [boolean, boolean],
  support: readonly [string, string],
  role: readonly [string, string],
  fallback: readonly [string, string],
): NextGenWebPlatformProbeSpec {
  return {
    id, domain, apiName, titleKo: title[0], titleEn: title[1], chromeStatus,
    requiresCoopCoep: flags[0], requiresChromePreview: flags[1],
    browserSupportNoteKo: support[0], browserSupportNoteEn: support[1],
    accelerationRoleKo: role[0], accelerationRoleEn: role[1],
    fallbackPathKo: fallback[0], fallbackPathEn: fallback[1],
  };
}

/** 최신 브라우저 및 Chrome Preview 차세대 웹 플랫폼 기능 10종 정본 매트릭스. */
export const NEXTGEN_WEB_PLATFORM_PROBES: readonly NextGenWebPlatformProbeSpec[] = [
  makeProbe(
    "webgpu-subgroups", "gpu", "WebGPU subgroups + subgroup-size-control",
    ["WebGPU 서브그룹 · 워프 폭 제어", "WebGPU Subgroups & Size Control"], "preview-origin-trial", [false, true],
    ["subgroups는 Chrome 134+ 안정화, subgroup-size-control은 Chrome Preview·실험 플래그(Safari·Firefox 미지원)", "subgroups shipped in Chrome 134+; subgroup-size-control requires Chrome Preview flags (absent on Safari/Firefox)"],
    ["Vello 3단계 타일 빈 집계와 프리픽스 합산을 레지스터 셔플로 병렬 처리", "Accelerates Vello stage-3 coarse tile binning and prefix scans via warp shuffles"],
    ["workgroupBarrier() 기반 공유 메모리 트리 리덕션 컴퓨트 패스로 안전 전환", "Falls back to workgroupBarrier() shared-memory tree reduction compute pass"],
  ),
  makeProbe(
    "webgpu-shader-f16", "gpu", "WebGPU shader-f16",
    ["WebGPU 반정밀도 셰이더 (f16)", "WebGPU Half-Precision (shader-f16)"], "stable", [false, false],
    ["Chrome 120+·Apple Silicon·최신 GPU 안정 지원(구형 내장 GPU에서는 비활성화)", "Stable in Chrome 120+ and Apple Silicon GPUs (disabled on legacy iGPUs)"],
    ["Vello 5단계 희소 스트립 래스터·혼색 레지스터 사용량 절감으로 워프 점유율 상승", "Cuts register pressure in Vello stage-5 sparse-strip rasterization to raise warp occupancy"],
    ["표준 f32 정밀도 래스터 셰이더 파이프라인으로 자동 컴파일", "Compiles standard f32 rasterization pipeline without precision loss"],
  ),
  makeProbe(
    "webgpu-multi-draw-indirect", "gpu", "WebGPU multi-draw-indirect",
    ["WebGPU 다중 간접 드로우 (MDI)", "WebGPU Multi-Draw Indirect"], "preview-origin-trial", [false, true],
    ["Chromium 확장·Chrome Preview 트랙(표준 코어 편입 대기, 미지원 드라이버 다수)", "Chrome Preview / experimental Chromium feature awaiting core standardization"],
    ["Vello 6단계 합성·프레젠트에서 GPU가 직접 생성한 드로우 리스트를 단일 호출로 제출", "Submits GPU-generated tile draw lists in one call during Vello stage-6 composite"],
    ["고정 버킷 drawIndirect 또는 컴퓨트 타일 합성 패스로 폴백", "Falls back to bucketed drawIndirect or direct compute tile composite pass"],
  ),
  makeProbe(
    "webgpu-timestamp-query", "gpu", "WebGPU timestamp-query",
    ["WebGPU GPU 타임스탬프 계측", "WebGPU Timestamp Query"], "stable", [false, false],
    ["Chrome 안정 지원(지문 방지용 양자화 적용, 일부 모바일 드라이버 제한)", "Stable in Chrome with anti-fingerprinting quantization (restricted on some mobile GPUs)"],
    ["Vello 6단계 패스별 실측 GPU 실행 시간(ns→ms)을 계측해 자동 LOD·스로틀 기준 제공", "Measures per-stage GPU pass durations to drive adaptive LOD and throttling"],
    ["Render Worker의 onSubmittedWorkDone() + performance.now() 펜스 추정으로 폴백", "Falls back to Render Worker onSubmittedWorkDone() + performance.now() fence timing"],
  ),
  makeProbe(
    "webnn-npu", "npu", "WebNN API (navigator.ml)",
    ["WebNN NPU 추론 (CoreML·DirectML·NNAPI)", "WebNN NPU (CoreML / DirectML / NNAPI)"], "preview-origin-trial", [false, true],
    ["Chrome Preview·Origin Trial 단계(--enable-features 플래그 필요, Safari·Firefox 미지원)", "Chrome Preview / Origin Trial (requires flag; not shipped in Safari or Firefox)"],
    ["선화 보정·안료 노이즈 제거 추론을 NPU에 오프로드해 GPU Vello 래스터와 병렬 실행", "Offloads line assist and pigment denoise onto NPU concurrently with Vello GPU raster"],
    ["WebGPU 컴퓨트 셰이더 추론 → 미지원 시 Rust WASM SIMD CPU 추론 순으로 폴백", "Falls back to WebGPU compute inference, then Rust WASM SIMD CPU inference"],
  ),
  makeProbe(
    "wasm-memory64", "wasm", "WebAssembly memory64",
    ["WASM64 64비트 선형 메모리", "WebAssembly memory64"], "stable", [false, false],
    ["Chrome 133+·Firefox 134+ 안정 지원(iOS Safari WebKit 미지원)", "Stable in Chrome 133+ and Firefox 134+ (unsupported on iOS Safari WebKit)"],
    ["8K 120레이어 대용량 256px 희소 타일·PSD 워킹셋의 4GB 주소 경계 돌파", "Unlocks >4GB sparse 256px tile and PSD working sets for 8K 120-layer canvases"],
    ["WASM32 4GB 이하 선형 아레나 + OPFS LRU 스필 타일 페이징으로 안전 유지", "Uses WASM32 arena under 4GB paired with OPFS LRU tile spill paging"],
  ),
  makeProbe(
    "wasm-relaxed-simd", "wasm", "WebAssembly relaxed-simd",
    ["WASM Relaxed SIMD 벡터 연산", "WebAssembly relaxed-simd"], "stable", [false, false],
    ["Chrome 114+·Firefox 안정 지원(Safari는 표준 SIMD128만 지원)", "Stable in Chrome 114+ and Firefox (Safari supports baseline SIMD128 only)"],
    ["FMA·내적 명령으로 Rust 타일 블렌드·Flat-BVH 교차·Kubelka-Munk 혼색 가속", "Speeds up Rust tile blending, Flat-BVH traversal, and pigment mix via FMA instructions"],
    ["표준 WASM SIMD128 커널(studio-wasm64-drawing-core)로 자동 분기", "Routes automatically to baseline WASM SIMD128 kernels in studio-wasm64-drawing-core"],
  ),
  makeProbe(
    "sab-atomics-wait-async", "cpu-sync", "SharedArrayBuffer + Atomics.waitAsync",
    ["SharedArrayBuffer + 비동기 원자 대기", "SharedArrayBuffer + Atomics.waitAsync"], "stable", [true, false],
    ["Cross-Origin Isolation(COOP/COEP) 응답 헤더 필수(미설정 시 브라우저가 차단)", "Requires Cross-Origin Isolation (COOP/COEP headers); blocked without isolation"],
    ["워커 풀 Chase-Lev Lock-Free 링버퍼 작업 훔치기와 메인 스레드 비차단 기상 처리", "Powers lock-free Chase-Lev work-stealing ring queues with non-blocking wakeups"],
    ["MessageChannel 전용 포트 + Transferable ArrayBuffer 소유권 이전 큐로 폴백", "Falls back to MessageChannel ports with Transferable ArrayBuffer ownership handoff"],
  ),
  makeProbe(
    "compute-pressure-api", "scheduling", "Compute Pressure API (PressureObserver)",
    ["Compute Pressure 열·부하 감지기", "Compute Pressure API (PressureObserver)"], "stable", [false, false],
    ["Chrome 125+ 데스크톱 안정 지원(모바일·Safari·Firefox 미지원)", "Stable on Chrome 125+ desktop (absent on mobile browsers, Safari, and Firefox)"],
    ["nominal/fair/serious/critical 단계에 맞춰 워커 수·GPU LOD·주사율을 자동 감속", "Automatically throttles workers, GPU LOD, and frame rate across thermal pressure states"],
    ["프레임 드롭률과 장시간 태스크 EMA 기반 소프트웨어 열 추정기로 폴백", "Falls back to software frame-drop EMA and long-task thermal pressure estimator"],
  ),
  makeProbe(
    "prioritized-task-scheduling", "scheduling", "Prioritized Task Scheduling (scheduler.postTask)",
    ["우선순위 태스크 스케줄러 (postTask)", "Prioritized Task Scheduling (postTask)"], "stable", [false, false],
    ["Chrome 94+·Firefox 142+ 지원(Safari 미지원 시 폴백 필요)", "Supported in Chrome 94+ and Firefox 142+ (requires fallback on Safari)"],
    ["포인터 입력(user-blocking)·뷰포트 갱신(user-visible)·PSD 저장(background) 엄격 분리", "Separates pointer input (user-blocking), viewport (user-visible), and PSD I/O (background)"],
    ["MessageChannel 매크로태스크 + requestIdleCallback 기반 3단 우선순위 큐로 폴백", "Falls back to MessageChannel macrotask + requestIdleCallback 3-tier queue"],
  ),
];

const PRESSURE_PROFILES: Readonly<Record<ComputePressureState, {
  readonly workerScale: number; readonly gpuClockScale: number; readonly capTo60Hz: boolean;
  readonly actionKo: string; readonly actionEn: string;
}>> = {
  nominal: { workerScale: 1, gpuClockScale: 1, capTo60Hz: false, actionKo: "정상 열 여유 — 전체 WASM Work-Stealing 워커와 120Hz Vello·NPU 병렬 실행 유지", actionEn: "Nominal headroom — full WASM work-stealing pool and 120Hz Vello + NPU concurrency" },
  fair: { workerScale: 0.75, gpuClockScale: 0.92, capTo60Hz: false, actionKo: "보통 열 부하 — WASM 워커 75% 운용, PSD·백업 태스크를 postTask(background)로 지연", actionEn: "Fair pressure — 75% WASM pool active; PSD/backup work deferred to postTask(background)" },
  serious: { workerScale: 0.5, gpuClockScale: 0.78, capTo60Hz: false, actionKo: "심각 열 부하 — WASM 워커 50% 파킹, 비핵심 프리페치 중지 및 NPU 추론 경량화", actionEn: "Serious pressure — 50% WASM workers parked; prefetch paused and NPU denoise trimmed" },
  critical: { workerScale: 0.25, gpuClockScale: 0.62, capTo60Hz: true, actionKo: "임계 열 보호 — WASM 워커 1개 최소 유지, 60Hz 안전 상한 및 백그라운드 작업 일시 정지", actionEn: "Critical thermal guard — 1 WASM worker floor, 60Hz cap, background tasks suspended" },
};

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isPressureState(value: unknown): value is ComputePressureState {
  return value === "nominal" || value === "fair" || value === "serious" || value === "critical";
}

/** 외부 입력을 안전 범위로 정규화한다. */
export function normalizeSchedulerEnvironmentInput(input?: SchedulerEnvironmentInput): NormalizedSchedulerEnvironment {
  return {
    hardwareConcurrency: clampInt(input?.hardwareConcurrency, MIN_HARDWARE_CONCURRENCY, MAX_HARDWARE_CONCURRENCY, DEFAULT_HARDWARE_CONCURRENCY),
    pressureState: isPressureState(input?.pressureState) ? input.pressureState : "nominal",
    coopCoepIsolated: input?.coopCoepIsolated ?? true,
    chromePreviewEnabled: input?.chromePreviewEnabled ?? true,
    activePaths: clampInt(input?.activePaths, 64, 250_000, 12_000),
    dirtyTiles: clampInt(input?.dirtyTiles, 16, 8_192, 320),
    targetFrameRateHz: input?.targetFrameRateHz === 60 ? 60 : 120,
    npuInferenceWorkload: input?.npuInferenceWorkload ?? "pigment-denoise",
    featureOverrides: input?.featureOverrides ? { ...input.featureOverrides } : {},
  };
}

/** 현재 JS/브라우저 런타임의 실제 API 존재 여부를 예외 없이 점검한다. */
export function probeBrowserRuntimeCapabilities(): RuntimeCapabilityProbeSnapshot {
  const g = globalThis as Record<string, unknown>;
  const nav = typeof navigator !== "undefined" ? (navigator as unknown as Record<string, unknown>) : null;
  const hw = nav && typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : DEFAULT_HARDWARE_CONCURRENCY;
  const sched = g.scheduler as Record<string, unknown> | undefined;
  const atomicsObj = typeof Atomics !== "undefined" ? (Atomics as unknown as Record<string, unknown>) : null;
  return {
    detectedHardwareConcurrency: clampInt(hw, MIN_HARDWARE_CONCURRENCY, MAX_HARDWARE_CONCURRENCY, DEFAULT_HARDWARE_CONCURRENCY),
    crossOriginIsolated: Boolean(g.crossOriginIsolated),
    sharedArrayBufferAvailable: typeof SharedArrayBuffer === "function",
    atomicsWaitAsyncAvailable: Boolean(atomicsObj && typeof atomicsObj.waitAsync === "function"),
    webGpuAvailable: Boolean(nav && "gpu" in nav && nav.gpu),
    webNnAvailable: Boolean(nav && "ml" in nav && nav.ml),
    pressureObserverAvailable: typeof g.PressureObserver === "function",
    schedulerPostTaskAvailable: Boolean(sched && typeof sched.postTask === "function"),
  };
}

/** 10종 최신 브라우저·Chrome Preview 기능의 현재 활성/폴백 상태를 정직하게 평가한다. */
export function evaluateNextGenPlatformMatrix(
  input?: SchedulerEnvironmentInput | NormalizedSchedulerEnvironment,
): NextGenPlatformMatrixReport {
  const env = normalizeSchedulerEnvironmentInput(input);
  const activeMap: Record<NextGenWebPlatformProbeId, boolean> = {
    "webgpu-subgroups": false, "webgpu-shader-f16": false, "webgpu-multi-draw-indirect": false,
    "webgpu-timestamp-query": false, "webnn-npu": false, "wasm-memory64": false,
    "wasm-relaxed-simd": false, "sab-atomics-wait-async": false,
    "compute-pressure-api": false, "prioritized-task-scheduling": false,
  };
  let activeStableCount = 0;
  let activePreviewCount = 0;
  let fallbackCount = 0;

  const probes: EvaluatedWebPlatformProbe[] = NEXTGEN_WEB_PLATFORM_PROBES.map((spec) => {
    const override = env.featureOverrides[spec.id];
    const active = typeof override === "boolean"
      ? override
      : spec.requiresCoopCoep ? env.coopCoepIsolated : spec.requiresChromePreview ? env.chromePreviewEnabled : true;
    activeMap[spec.id] = active;
    if (!active) {
      fallbackCount += 1;
      const statusReasonKo = spec.requiresCoopCoep && !env.coopCoepIsolated
        ? "COOP/COEP 격리 헤더 미활성 — 안전 폴백 경로 가동"
        : spec.requiresChromePreview && !env.chromePreviewEnabled
          ? "Chrome Preview 플래그 비활성 — 호환 폴백 경로 가동"
          : "기능 비활성/미지원 — 안전 폴백 경로 가동";
      const statusReasonEn = spec.requiresCoopCoep && !env.coopCoepIsolated
        ? "COOP/COEP isolation off — running safe fallback"
        : spec.requiresChromePreview && !env.chromePreviewEnabled
          ? "Chrome Preview disabled — running compatible fallback"
          : "Feature unavailable — running safe fallback";
      return { spec, runtimeState: "fallback-active", active: false, statusReasonKo, statusReasonEn };
    }
    if (spec.chromeStatus === "preview-origin-trial") {
      activePreviewCount += 1;
      return { spec, runtimeState: "active-preview", active: true, statusReasonKo: "Chrome Preview / Origin Trial 트랙 활성", statusReasonEn: "Active on Chrome Preview / Origin Trial track" };
    }
    activeStableCount += 1;
    return { spec, runtimeState: "active-stable", active: true, statusReasonKo: "최신 브라우저 안정(Stable) API 활성", statusReasonEn: "Active on modern stable browser API" };
  });

  return { probes, totalProbes: probes.length, activeStableCount, activePreviewCount, fallbackCount, activeById: activeMap };
}

/** CPU 멀티코어 Work-Stealing 워커 풀 플래너(메인 차단 0% · SAB 락프리 ↔ MessageChannel 폴백). */
export function planCpuMulticoreWorkerPool(
  input?: SchedulerEnvironmentInput | NormalizedSchedulerEnvironment,
): CpuMulticoreWorkerPoolPlan {
  const env = normalizeSchedulerEnvironmentInput(input);
  const matrix = evaluateNextGenPlatformMatrix(env);
  const pressure = PRESSURE_PROFILES[env.pressureState];

  const rawWasmWorkers = clampInt(env.hardwareConcurrency - 2, MIN_WASM_STEAL_WORKERS, MAX_WASM_STEAL_WORKERS, MIN_WASM_STEAL_WORKERS);
  const activeWasmWorkers = env.pressureState === "critical"
    ? 1
    : env.pressureState === "serious"
      ? Math.max(1, Math.floor(rawWasmWorkers * pressure.workerScale))
      : Math.max(1, Math.round(rawWasmWorkers * pressure.workerScale));
  const parkedWasmWorkers = Math.max(0, rawWasmWorkers - activeWasmWorkers);

  const sabActive = env.coopCoepIsolated && matrix.activeById["sab-atomics-wait-async"];
  const queueTransport: QueueTransportKind = sabActive ? "sab-atomics-wait-async-ring" : "message-channel-transferable-ring";
  const workStealingStrategy: WorkStealingStrategy = sabActive ? "chase-lev-atomics-wait-async" : "message-channel-transferable-fallback";
  const effectiveTargetFrameRateHz: 60 | 120 = pressure.capTo60Hz ? 60 : env.targetFrameRateHz;
  const wasmMemoryAddressBits: 64 | 32 = matrix.activeById["wasm-memory64"] ? 64 : 32;
  const wasmSimdTier: "relaxed-simd" | "simd128" = matrix.activeById["wasm-relaxed-simd"] ? "relaxed-simd" : "simd128";
  const postTaskNativeActive = matrix.activeById["prioritized-task-scheduling"];

  const roles: readonly CpuWorkerRoleAllocation[] = [
    {
      id: "main-ui", titleKo: "메인 UI 스레드 (연산 차단 0%)", titleEn: "Main UI Thread (0% Compute Blocking)",
      threadCount: 1, parkedCount: 0, schedulerPriority: "user-blocking",
      responsibilitiesKo: [
        "Coalesced PointerEvent 수집 및 스타일러스 필압 배치 전달",
        "한글 IME DOM 조합 경계 및 WCAG 키보드 포커스 관리",
        postTaskNativeActive ? "scheduler.postTask(user-blocking/user-visible/background) 디스패치" : "MessageChannel + requestIdleCallback 3단 우선순위 폴백 디스패치",
      ],
      responsibilitiesEn: [
        "Coalesced PointerEvent capture and stylus pressure batching",
        "Korean IME DOM composition boundary and WCAG focus control",
        postTaskNativeActive ? "Native scheduler.postTask(user-blocking/user-visible/background) dispatch" : "MessageChannel + requestIdleCallback 3-tier fallback dispatch",
      ],
      backingCrateOrApi: postTaskNativeActive ? "scheduler.postTask" : "MessageChannel + rIC",
    },
    {
      id: "audio-worklet", titleKo: "전용 AudioWorklet (실시간 음향 합성)", titleEn: "Dedicated AudioWorklet (Acoustic Foley)",
      threadCount: 1, parkedCount: 0, schedulerPriority: "user-blocking",
      responsibilitiesKo: ["연필·크레용·종이 마찰 음향(Foley) 128-샘플 오디오 퀀텀 실시간 합성", "메인 스레드 GC·DOM 레이아웃 지터로부터 완전 격리"],
      responsibilitiesEn: ["128-sample real-time dry-media friction foley DSP synthesis", "Fully isolated from main-thread GC pauses and DOM layout jitter"],
      backingCrateOrApi: "AudioWorkletGlobalScope",
    },
    {
      id: "webgpu-render-worker", titleKo: "전용 WebGPU · OffscreenCanvas 렌더 워커", titleEn: "Dedicated WebGPU / OffscreenCanvas Render Worker",
      threadCount: 1, parkedCount: 0, schedulerPriority: "user-visible",
      responsibilitiesKo: ["OffscreenCanvas 스왑체인 소유 및 Vello 6단계 GPU 명령 버퍼 제출", "createComputePipelineAsync 비동기 사전 컴파일 및 timestamp-query 수집"],
      responsibilitiesEn: ["Owns OffscreenCanvas swap chain and submits Vello 6-stage GPU command buffers", "Runs createComputePipelineAsync precompilation and timestamp-query readback"],
      backingCrateOrApi: "crates/studio-engine-vello",
    },
    {
      id: "wasm-simd-steal-pool",
      titleKo: `Rust WASM ${wasmSimdTier === "relaxed-simd" ? "Relaxed-SIMD" : "SIMD128"} Work-Stealing 워커 풀`,
      titleEn: `Rust WASM ${wasmSimdTier === "relaxed-simd" ? "Relaxed-SIMD" : "SIMD128"} Work-Stealing Pool`,
      threadCount: activeWasmWorkers, parkedCount: parkedWasmWorkers,
      schedulerPriority: env.pressureState === "nominal" ? "user-visible" : "background",
      responsibilitiesKo: [
        "256px 희소 타일 XOR 델타·Flat-BVH 공간 분할·PSD/코덱 병렬 디코드",
        sabActive ? "Chase-Lev SharedArrayBuffer + Atomics.waitAsync 락프리 작업 훔치기" : "MessageChannel 전용 포트 + Transferable ArrayBuffer 제로복사 분배",
      ],
      responsibilitiesEn: [
        "Parallel 256px sparse tile XOR delta, Flat-BVH spatial partition, PSD decode",
        sabActive ? "Lock-free Chase-Lev SharedArrayBuffer + Atomics.waitAsync work stealing" : "MessageChannel ports + Transferable ArrayBuffer zero-copy handoff",
      ],
      backingCrateOrApi: `crates/studio-wasm64-drawing-core (wasm${wasmMemoryAddressBits})`,
    },
  ];

  return {
    hardwareConcurrency: env.hardwareConcurrency, pressureState: env.pressureState,
    pressureThrottleFactor: pressure.workerScale, mainThreadBlockingBudgetPct: 0,
    dedicatedAudioWorkletCount: 1, dedicatedRenderWorkerCount: 1,
    rawWasmSimdWorkerCount: rawWasmWorkers, activeWasmSimdWorkerCount: activeWasmWorkers,
    parkedWasmWorkerCount: parkedWasmWorkers, totalActiveWorkerThreads: 2 + activeWasmWorkers,
    oversubscribedLogicalCores: env.hardwareConcurrency < 3, queueTransport, workStealingStrategy,
    ringSlotCount: LOCK_FREE_RING_SLOT_COUNT, cacheLinePaddingBytes: LOCK_FREE_CACHE_LINE_BYTES,
    zeroCopyTransferCount: 0, estimatedDispatchOverheadUs: sabActive ? 14 : 138,
    wasmMemoryAddressBits, wasmSimdTier, postTaskNativeActive, effectiveTargetFrameRateHz,
    fallbackReasonKo: sabActive ? null : "COOP(same-origin)·COEP(require-corp) 헤더 미적용으로 SharedArrayBuffer 차단 — MessageChannel Transferable 링으로 안전 폴백",
    fallbackReasonEn: sabActive ? null : "SharedArrayBuffer unavailable without COOP/COEP headers — safely falling back to MessageChannel Transferable ring",
    pressureActionKo: pressure.actionKo, pressureActionEn: pressure.actionEn, roles,
  };
}

/** Vello 6단계 GPU 멀티스레드 컴퓨트 파이프라인 플래너(Workgroup·바인딩·워프·비동기 사전컴파일). */
export function planVelloComputeStageGraph(
  input?: SchedulerEnvironmentInput | NormalizedSchedulerEnvironment,
): VelloComputeStageGraphPlan {
  const env = normalizeSchedulerEnvironmentInput(input);
  const matrix = evaluateNextGenPlatformMatrix(env);
  const pressure = PRESSURE_PROFILES[env.pressureState];

  const subgroupsActive = matrix.activeById["webgpu-subgroups"];
  const shaderF16Active = matrix.activeById["webgpu-shader-f16"];
  const multiDrawIndirectActive = matrix.activeById["webgpu-multi-draw-indirect"];
  const timestampQueryActive = matrix.activeById["webgpu-timestamp-query"];

  const pathLoad = env.activePaths / 12_000;
  const tileLoad = env.dirtyTiles / 320;
  const invClock = 1 / pressure.gpuClockScale;
  const wg256 = (items: number): number => Math.max(1, Math.ceil(items / 256));
  const segCount = env.activePaths * 6;
  const tileX = Math.max(1, Math.ceil(Math.sqrt(env.dirtyTiles)));
  const tileY = Math.max(1, Math.ceil(env.dirtyTiles / tileX));

  const stages: readonly VelloComputeStagePlan[] = [
    {
      order: 1, id: "path-encode", nameKo: "① Path Encode (경로 스트림 인코딩)", nameEn: "1. Path Encode",
      roleKo: "변환 행렬·브러시 스트로크 태그 스트림을 GPU 스토리지 버퍼로 압축 인코딩", roleEn: "Packs transform matrices and stroke tag streams into GPU storage buffers",
      workgroupSize: [256, 1, 1], dispatchWorkgroups: [wg256(env.activePaths), 1, 1], storageBindingCount: 4, uniformBindingCount: 1, totalBindings: 5,
      warpOccupancy: { targetSubgroupSize: 32, estimatedSharedMemBytes: 2048, maxActiveWorkgroupsPerSm: 8, estimatedOccupancyPct: 88, bottleneckNoteKo: "스트림 쓰기 대역폭 중심 — 256B 스토리지 정렬로 병합 쓰기 유지", bottleneckNoteEn: "Memory-write bound — 256B storage alignment preserves coalesced writes" },
      wgslDirectives: ["// core WGSL compute"], activeFeatureTag: "core-wgsl", fallbackActive: false,
      fallbackNoteKo: "표준 WebGPU 컴퓨트 코어 경로(별도 확장 불필요)", fallbackNoteEn: "Standard WebGPU core compute path (no optional extension required)",
      asyncPrecompile: { api: "createComputePipelineAsync", priority: "user-blocking", parallelWave: 1, estimatedCompileMs: 6.4, cacheKey: "vello.stage1.path_encode.v1" },
      estimatedGpuMs: round2(0.42 * pathLoad * invClock),
    },
    {
      order: 2, id: "flatten-cubic", nameKo: "② Flatten (Kubelka·Cubic→선분 평탄화)", nameEn: "2. Flatten (Kubelka/Cubic→Line)",
      roleKo: "3차 베지어·Wang 공식 기반 곡률 분할과 안료 두께 파라미터를 선분 세그먼트로 평탄화", roleEn: "Flattens cubic Beziers and pigment stroke profiles into line segments",
      workgroupSize: [256, 1, 1], dispatchWorkgroups: [wg256(segCount), 1, 1], storageBindingCount: 5, uniformBindingCount: 1, totalBindings: 6,
      warpOccupancy: { targetSubgroupSize: 32, estimatedSharedMemBytes: 4096, maxActiveWorkgroupsPerSm: 6, estimatedOccupancyPct: 82, bottleneckNoteKo: "곡률 분기 최소화 — 고정 스텝 Wang 추정으로 워프 발산 억제", bottleneckNoteEn: "Minimizes warp divergence using closed-form Wang subdivision counts" },
      wgslDirectives: shaderF16Active ? ["enable f16;"] : ["// fallback: f32 curve eval"], activeFeatureTag: shaderF16Active ? "shader-f16" : "f32-fallback", fallbackActive: !shaderF16Active,
      fallbackNoteKo: shaderF16Active ? "f16 보조 계수로 레지스터 절감 활성" : "shader-f16 미지원 — f32 정밀도 곡선 평탄화 폴백", fallbackNoteEn: shaderF16Active ? "Using f16 auxiliary weights to reduce registers" : "No shader-f16 — using f32 curve flattening",
      asyncPrecompile: { api: "createComputePipelineAsync", priority: "user-blocking", parallelWave: 1, estimatedCompileMs: 8.8, cacheKey: shaderF16Active ? "vello.stage2.flatten_f16.v1" : "vello.stage2.flatten_f32.v1" },
      estimatedGpuMs: round2((shaderF16Active ? 0.68 : 0.84) * pathLoad * invClock),
    },
    {
      order: 3, id: "subgroup-coarse-bin", nameKo: "③ Subgroup Coarse Tile Binning", nameEn: "3. Subgroup Coarse Tile Binning",
      roleKo: "선분 바운딩 박스를 16×16·256px 희소 타일 빈으로 병렬 분류하고 히스토그램 집계", roleEn: "Bins flattened line segments into coarse 16x16 / 256px sparse tile queues",
      workgroupSize: subgroupsActive ? [256, 1, 1] : [128, 1, 1], dispatchWorkgroups: [wg256(segCount), 1, 1], storageBindingCount: 6, uniformBindingCount: 1, totalBindings: 7,
      warpOccupancy: { targetSubgroupSize: subgroupsActive ? 32 : 64, estimatedSharedMemBytes: subgroupsActive ? 4096 : 12288, maxActiveWorkgroupsPerSm: subgroupsActive ? 6 : 3, estimatedOccupancyPct: subgroupsActive ? 86 : 58, bottleneckNoteKo: subgroupsActive ? "subgroupAdd/subgroupBallot 레지스터 셔플로 공유 메모리 경합 66% 축소" : "workgroupBarrier() 공유 메모리 트리 리덕션 폴백(점유율 제약 주의)", bottleneckNoteEn: subgroupsActive ? "subgroupAdd/Ballot warp shuffles cut shared-memory traffic by 66%" : "Shared-memory workgroupBarrier() fallback limits SM occupancy" },
      wgslDirectives: subgroupsActive ? ["enable subgroups;", "// subgroup-size-control target=32"] : ["// fallback: workgroupBarrier() shared reduction"], activeFeatureTag: subgroupsActive ? "enable subgroups;" : "shared-mem-fallback", fallbackActive: !subgroupsActive,
      fallbackNoteKo: subgroupsActive ? "WebGPU subgroups + subgroup-size-control 활성" : "subgroups 미지원 — workgroupBarrier() 공유 메모리 빈 집계로 폴백", fallbackNoteEn: subgroupsActive ? "WebGPU subgroups + subgroup-size-control active" : "No subgroups — falling back to shared-memory workgroupBarrier() binning",
      asyncPrecompile: { api: "createComputePipelineAsync", priority: "user-blocking", parallelWave: 1, estimatedCompileMs: subgroupsActive ? 11.2 : 9.4, cacheKey: subgroupsActive ? "vello.stage3.bin_subgroups.v1" : "vello.stage3.bin_shared.v1" },
      estimatedGpuMs: round2((subgroupsActive ? 0.56 : 1.08) * Math.max(pathLoad, tileLoad) * invClock),
    },
    {
      order: 4, id: "prefix-sum-alloc", nameKo: "④ Prefix-Sum Path Allocation", nameEn: "4. Prefix-Sum Path Allocation",
      roleKo: "계층적 프리픽스 합산으로 경로·타일 명령 목록(PTCL)의 동적 버퍼 오프셋을 결정론적 할당", roleEn: "Computes hierarchical prefix sums to allocate deterministic PTCL tile offsets",
      workgroupSize: [256, 1, 1], dispatchWorkgroups: [wg256(env.dirtyTiles * 16), 1, 1], storageBindingCount: 5, uniformBindingCount: 1, totalBindings: 6,
      warpOccupancy: { targetSubgroupSize: 32, estimatedSharedMemBytes: subgroupsActive ? 3072 : 8192, maxActiveWorkgroupsPerSm: subgroupsActive ? 7 : 4, estimatedOccupancyPct: subgroupsActive ? 84 : 64, bottleneckNoteKo: subgroupsActive ? "subgroupExclusiveAdd() 1-패스 워프 스캔으로 배리어 대기 최소화" : "2-패스 Blelloch workgroup 스캔 폴백 적용", bottleneckNoteEn: subgroupsActive ? "Single-pass subgroupExclusiveAdd() minimizes barrier stalls" : "Using 2-pass Blelloch workgroup scan fallback" },
      wgslDirectives: subgroupsActive ? ["enable subgroups;"] : ["// fallback: two-pass Blelloch prefix sum"], activeFeatureTag: subgroupsActive ? "subgroup-prefix-sum" : "blelloch-fallback", fallbackActive: !subgroupsActive,
      fallbackNoteKo: subgroupsActive ? "서브그룹 독점 스캔(subgroupExclusiveAdd) 가속 활성" : "서브그룹 미지원 — 2-패스 Blelloch 공유 메모리 프리픽스 스캔 폴백", fallbackNoteEn: subgroupsActive ? "Subgroup exclusive scan acceleration active" : "Fallback to 2-pass Blelloch shared-memory prefix scan",
      asyncPrecompile: { api: "createComputePipelineAsync", priority: "user-visible", parallelWave: 2, estimatedCompileMs: 7.5, cacheKey: subgroupsActive ? "vello.stage4.scan_subgroups.v1" : "vello.stage4.scan_blelloch.v1" },
      estimatedGpuMs: round2((subgroupsActive ? 0.34 : 0.62) * tileLoad * invClock),
    },
    {
      order: 5, id: "fine-sparse-raster", nameKo: "⑤ Fine Compute Rasterization (Sparse Strips + f16)", nameEn: "5. Fine Compute Rasterization (Sparse Strips + f16)",
      roleKo: "희소 스트립 기반 안티앨리어싱 알파 커버리지·Kubelka-Munk 혼색·임파스토 타일 래스터화", roleEn: "Rasterizes sparse strips with analytic anti-aliasing, pigment mix, and impasto tiles",
      workgroupSize: [16, 16, 1], dispatchWorkgroups: [tileX, tileY, 1], storageBindingCount: 7, uniformBindingCount: 1, totalBindings: 8,
      warpOccupancy: { targetSubgroupSize: 32, estimatedSharedMemBytes: shaderF16Active ? 8192 : 16384, maxActiveWorkgroupsPerSm: shaderF16Active ? 4 : 2, estimatedOccupancyPct: shaderF16Active ? 78 : 52, bottleneckNoteKo: shaderF16Active ? "enable f16; 반정밀도 컬러 누산으로 VGPR 레지스터 스필 방지" : "f32 컬러 누산 폴백 — 레지스터 점유량 증가로 SM당 활성 워크그룹 축소", bottleneckNoteEn: shaderF16Active ? "enable f16; half-precision accumulation prevents VGPR register spills" : "f32 accumulation fallback doubles register footprint and lowers SM occupancy" },
      wgslDirectives: shaderF16Active ? ["enable f16;", "// sparse-strip analytic coverage"] : ["// fallback: f32 sparse-strip raster"], activeFeatureTag: shaderF16Active ? "enable f16;" : "f32-raster-fallback", fallbackActive: !shaderF16Active,
      fallbackNoteKo: shaderF16Active ? "Sparse Strips + enable f16; 반정밀도 컴퓨트 래스터 활성" : "shader-f16 미지원 — f32 정밀도 희소 스트립 래스터로 폴백", fallbackNoteEn: shaderF16Active ? "Sparse Strips + enable f16; half-precision compute raster active" : "No shader-f16 — falling back to f32 sparse-strip compute raster",
      asyncPrecompile: { api: "createComputePipelineAsync", priority: "user-blocking", parallelWave: 2, estimatedCompileMs: shaderF16Active ? 14.6 : 12.8, cacheKey: shaderF16Active ? "vello.stage5.fine_f16.v1" : "vello.stage5.fine_f32.v1" },
      estimatedGpuMs: round2((shaderF16Active ? 1.48 : 2.16) * tileLoad * invClock),
    },
    {
      order: 6, id: "indirect-composite", nameKo: "⑥ Indirect Composite / Present (multi-draw-indirect)", nameEn: "6. Indirect Composite / Present (MDI)",
      roleKo: "가시 타일 버퍼를 GPU 간접 드로우 명령으로 단일 제출해 OffscreenCanvas에 최종 합성·표시", roleEn: "Submits visible tile batches via GPU indirect draws to composite onto OffscreenCanvas",
      workgroupSize: [16, 16, 1], dispatchWorkgroups: [tileX, tileY, 1], storageBindingCount: 4, uniformBindingCount: 1, totalBindings: 5,
      warpOccupancy: { targetSubgroupSize: 32, estimatedSharedMemBytes: 2048, maxActiveWorkgroupsPerSm: 8, estimatedOccupancyPct: 90, bottleneckNoteKo: multiDrawIndirectActive ? "multi-draw-indirect 단일 제출로 CPU-GPU 리드백·드로우콜 오버헤드 제거" : "고정 버킷 drawIndirect 폴백(CPU 커맨드 버퍼 인코딩 소폭 증가)", bottleneckNoteEn: multiDrawIndirectActive ? "Single multi-draw-indirect call removes CPU-GPU readback and draw overhead" : "Bucketed drawIndirect fallback adds minor Render Worker command encoding" },
      wgslDirectives: multiDrawIndirectActive ? ["// indirect command buffer: multi-draw-indirect"] : ["// fallback: bucketed single-pass dispatchIndirect"], activeFeatureTag: multiDrawIndirectActive ? "multi-draw-indirect" : "single-dispatch-fallback", fallbackActive: !multiDrawIndirectActive,
      fallbackNoteKo: multiDrawIndirectActive ? "multi-draw-indirect GPU 간접 합성·프레젠트 활성" : "multi-draw-indirect 미지원 — 버킷별 단일 컴퓨트 합성 패스로 폴백", fallbackNoteEn: multiDrawIndirectActive ? "multi-draw-indirect GPU composite/present active" : "No multi-draw-indirect — falling back to bucketed compute composite pass",
      asyncPrecompile: { api: "createComputePipelineAsync", priority: "user-visible", parallelWave: 2, estimatedCompileMs: 6.1, cacheKey: multiDrawIndirectActive ? "vello.stage6.mdi_present.v1" : "vello.stage6.bucket_present.v1" },
      estimatedGpuMs: round2((multiDrawIndirectActive ? 0.44 : 0.78) * tileLoad * invClock),
    },
  ];

  const maxStorageBindingsUsed = Math.max(...stages.map((s) => s.storageBindingCount));
  const totalEstimatedGpuMs = round2(stages.reduce((acc, s) => acc + s.estimatedGpuMs, 0));
  const sequentialPrecompileMs = round2(stages.reduce((acc, s) => acc + s.asyncPrecompile.estimatedCompileMs, 0));
  const wave1Max = Math.max(...stages.filter((s) => s.asyncPrecompile.parallelWave === 1).map((s) => s.asyncPrecompile.estimatedCompileMs));
  const wave2Max = Math.max(...stages.filter((s) => s.asyncPrecompile.parallelWave === 2).map((s) => s.asyncPrecompile.estimatedCompileMs));
  const parallelAsyncPrecompileMs = round2(wave1Max + wave2Max);

  return {
    stages, totalStages: 6, maxStorageBindingsUsed,
    withinBaselineBindingLimit: maxStorageBindingsUsed <= WEBGPU_BASELINE_STORAGE_BINDINGS_LIMIT,
    subgroupsActive, shaderF16Active, multiDrawIndirectActive, timestampQueryActive,
    pressureGpuClockScale: pressure.gpuClockScale, totalEstimatedGpuMs, sequentialPrecompileMs, parallelAsyncPrecompileMs,
    precompileSpeedupRatio: round2(sequentialPrecompileMs / Math.max(0.1, parallelAsyncPrecompileMs)),
    timingSourceLabelKo: timestampQueryActive ? "WebGPU timestamp-query 하드웨어 패스 계측" : "Render Worker onSubmittedWorkDone() 소프트웨어 펜스 추정",
    timingSourceLabelEn: timestampQueryActive ? "WebGPU timestamp-query hardware pass profiling" : "Render Worker onSubmittedWorkDone() software fence timing",
  };
}

/** CPU 멀티코어 · Vello 6단계 GPU · WebNN NPU 동시 실행 1프레임 타임라인 시뮬레이터. */
export function simulateHeterogeneousFrameTimeline(
  input?: SchedulerEnvironmentInput | NormalizedSchedulerEnvironment,
): HeterogeneousFrameTimeline {
  const env = normalizeSchedulerEnvironmentInput(input);
  const matrix = evaluateNextGenPlatformMatrix(env);
  const cpuPool = planCpuMulticoreWorkerPool(env);
  const vello = planVelloComputeStageGraph(env);

  const effectiveFrameRateHz = cpuPool.effectiveTargetFrameRateHz;
  const frameBudgetMs = effectiveFrameRateHz === 120 ? 8.33 : 16.67;
  const mainThreadBusyMs = round2(cpuPool.postTaskNativeActive ? 0.52 : 0.74);
  const audioQuantumMs = 0.62;
  const tileLoad = env.dirtyTiles / 320;
  const simdFactor = cpuPool.wasmSimdTier === "relaxed-simd" ? 0.82 : 1.0;
  const dispatchMs = cpuPool.estimatedDispatchOverheadUs / 1000;
  const wasmPoolWallMs = round2((8.4 * tileLoad * simdFactor) / Math.pow(cpuPool.activeWasmSimdWorkerCount, 0.78) + dispatchMs * 2);
  const renderWorkerStartMs = round2(mainThreadBusyMs * 0.7);
  const renderWorkerSubmitMs = round2((vello.multiDrawIndirectActive ? 0.68 : 1.12) + dispatchMs);

  const webnnActive = matrix.activeById["webnn-npu"];
  const npuBaseMs = env.npuInferenceWorkload === "none" ? 0 : env.npuInferenceWorkload === "line-assist" ? 1.15 : env.npuInferenceWorkload === "full-realtime" ? 2.85 : 1.75;
  const npuPressureTrim = env.pressureState === "critical" ? 0.55 : env.pressureState === "serious" ? 0.75 : 1.0;
  const npuExecutionBackend: NpuExecutionBackend = webnnActive ? "webnn-npu-coreml-directml-nnapi" : env.chromePreviewEnabled ? "webgpu-compute-fallback" : "wasm-simd-cpu-fallback";
  const npuTaskWallMs = round2(npuBaseMs * npuPressureTrim * (webnnActive ? 1.0 : npuExecutionBackend === "webgpu-compute-fallback" ? 1.42 : 1.95));

  const isSab = cpuPool.queueTransport === "sab-atomics-wait-async-ring";
  const segments: TimelineGanttSegment[] = [
    { id: "seg-main-ui", lane: "main-ui", labelKo: "포인터 수집 · IME · postTask", labelEn: "Pointer · IME · postTask", startMs: 0, durationMs: mainThreadBusyMs, endMs: mainThreadBusyMs, tone: "main", isFallback: !cpuPool.postTaskNativeActive },
    { id: "seg-audio-foley", lane: "audio-worklet", labelKo: "AudioWorklet 128-샘플 음향 합성", labelEn: "AudioWorklet 128-Sample Foley", startMs: 0.15, durationMs: audioQuantumMs, endMs: round2(0.15 + audioQuantumMs), tone: "audio", isFallback: false },
    {
      id: "seg-render-worker", lane: "render-worker",
      labelKo: vello.multiDrawIndirectActive ? "Render Worker GPU 명령 제출 (MDI)" : "Render Worker 버킷 명령 제출",
      labelEn: vello.multiDrawIndirectActive ? "Render Worker Submit (MDI)" : "Render Worker Bucket Submit",
      startMs: renderWorkerStartMs, durationMs: renderWorkerSubmitMs, endMs: round2(renderWorkerStartMs + renderWorkerSubmitMs), tone: "gpu", isFallback: !vello.multiDrawIndirectActive,
    },
    {
      id: "seg-wasm-pool", lane: "wasm-simd-pool",
      labelKo: `WASM ${cpuPool.wasmSimdTier === "relaxed-simd" ? "Relaxed-SIMD" : "SIMD128"} ×${cpuPool.activeWasmSimdWorkerCount} (${isSab ? "SAB 락프리" : "MsgChannel"})`,
      labelEn: `WASM ${cpuPool.wasmSimdTier} ×${cpuPool.activeWasmSimdWorkerCount} (${isSab ? "SAB Lock-Free" : "MsgChannel"})`,
      startMs: round2(mainThreadBusyMs + dispatchMs), durationMs: wasmPoolWallMs, endMs: round2(mainThreadBusyMs + dispatchMs + wasmPoolWallMs), tone: "wasm", isFallback: !isSab,
    },
  ];

  let gpuCursor = round2(renderWorkerStartMs + renderWorkerSubmitMs * 0.65);
  for (const stage of vello.stages) {
    const startMs = round2(gpuCursor);
    const endMs = round2(startMs + stage.estimatedGpuMs);
    segments.push({ id: `seg-vello-${stage.id}`, lane: "vello-gpu", labelKo: `${stage.order}. ${stage.id}`, labelEn: `${stage.order}. ${stage.id}`, startMs, durationMs: stage.estimatedGpuMs, endMs, tone: stage.fallbackActive ? "alert" : "gpu", stageId: stage.id, isFallback: stage.fallbackActive });
    gpuCursor = endMs;
  }

  if (npuTaskWallMs > 0) {
    const npuStartMs = webnnActive ? round2(mainThreadBusyMs + 0.12) : round2(renderWorkerStartMs + renderWorkerSubmitMs + 0.35);
    segments.push({
      id: "seg-webnn-npu", lane: "webnn-npu",
      labelKo: webnnActive ? "WebNN NPU 추론 (CoreML·DirectML·NNAPI)" : npuExecutionBackend === "webgpu-compute-fallback" ? "WebNN 미지원 → WebGPU 추론 폴백" : "WebNN 미지원 → WASM SIMD 추론 폴백",
      labelEn: webnnActive ? "WebNN NPU (CoreML/DirectML/NNAPI)" : npuExecutionBackend === "webgpu-compute-fallback" ? "WebNN Fallback → WebGPU Compute" : "WebNN Fallback → WASM SIMD CPU",
      startMs: npuStartMs, durationMs: npuTaskWallMs, endMs: round2(npuStartMs + npuTaskWallMs), tone: webnnActive ? "npu" : "alert", isFallback: !webnnActive,
    });
  }

  const totalFrameWallMs = round2(Math.max(...segments.map((seg) => seg.endMs)));
  const serialTotalMs = round2(mainThreadBusyMs + audioQuantumMs + renderWorkerSubmitMs + wasmPoolWallMs + vello.totalEstimatedGpuMs + npuTaskWallMs);
  const parallelOverlapGainPct = serialTotalMs > 0 ? round2(Math.max(0, ((serialTotalMs - totalFrameWallMs) / serialTotalMs) * 100)) : 0;
  const estimatedAchievableFps = Math.min(effectiveFrameRateHz, Math.max(1, Math.floor(1000 / Math.max(0.1, totalFrameWallMs))));

  return {
    targetFrameRateHz: env.targetFrameRateHz, effectiveFrameRateHz, frameBudgetMs,
    mainThreadBusyMs, mainThreadBlockingPct: 0, audioQuantumMs, renderWorkerSubmitMs,
    wasmPoolWallMs, velloGpuWallMs: vello.totalEstimatedGpuMs, npuTaskWallMs, npuExecutionBackend,
    serialTotalMs, totalFrameWallMs, parallelOverlapGainPct, meetsFrameBudget: totalFrameWallMs <= frameBudgetMs,
    estimatedAchievableFps, segments,
  };
}

/** 이기종 멀티코어·Vello·NPU 통합 스케줄러 계획을 한 번에 생성한다. */
export function buildMulticoreVelloPlan(input?: SchedulerEnvironmentInput): MulticoreVelloSchedulerPlan {
  const environment = normalizeSchedulerEnvironmentInput(input);
  return {
    schemaVersion: SCHEDULER_MANIFEST_SCHEMA_VERSION, environment,
    platformMatrix: evaluateNextGenPlatformMatrix(environment),
    cpuWorkerPool: planCpuMulticoreWorkerPool(environment),
    velloComputeGraph: planVelloComputeStageGraph(environment),
    frameTimeline: simulateHeterogeneousFrameTimeline(environment),
    honestScopeDisclosure: {
      currentImplementationKo: "현재 구현: 결정론적 CPU 워커 풀 분할·Vello 6단계 GPU 파이프라인 플래너·10종 웹 플랫폼 호환성 판별·프레임 타임라인 시뮬레이터 및 JSON 매니페스트 내보내기(추정 시간 모델).",
      currentImplementationEn: "Current: deterministic CPU worker-pool planner, Vello 6-stage GPU graph planner, 10-probe web platform matrix, modeled frame timeline simulator, and JSON manifest export.",
      targetRuntimeKo: "목표 런타임: COOP/COEP 배포 헤더 하의 실기 SharedArrayBuffer 워커 풀 + crates/studio-engine-vello GPU 컴퓨트 패스 + Chrome Preview subgroups·MDI·WebNN NPU 연동 및 실측 timestamp-query 수집.",
      targetRuntimeEn: "Target: live COOP/COEP SharedArrayBuffer worker pool + crates/studio-engine-vello GPU compute passes + Chrome Preview subgroups/MDI/WebNN NPU execution with hardware timestamp-query telemetry.",
    },
  };
}

/** 통합 스케줄러 계획을 정형 JSON 매니페스트 문자열로 직렬화한다. */
export function exportMulticoreVelloPlanJson(
  input?: SchedulerEnvironmentInput,
): { readonly plan: MulticoreVelloSchedulerPlan; readonly json: string } {
  const plan = buildMulticoreVelloPlan(input);
  return { plan, json: JSON.stringify(plan, null, 2) };
}
