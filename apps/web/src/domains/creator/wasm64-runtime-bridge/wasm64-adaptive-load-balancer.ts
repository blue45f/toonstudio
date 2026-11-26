/**
 * 이기종 WebNN · WebGPU · Wasm Relaxed-SIMD · Wasm SIMD128 · JS 폴백 실시간 프레임 예산 로드 밸런서.
 *
 * 120Hz(`8.33ms`)/60Hz(`16.67ms`) 프레임 예산과 롤링 EMA·P95 텔레메트리를 수집해,
 * 열·메모리 압박·GPU 디바이스 유실·프레임 스파이크 시 즉시 강등하고 복귀 시 히스테리시스로 스래싱을 차단한다.
 */

export const FRAME_BUDGET_120HZ_MS = 8.33;
export const FRAME_BUDGET_60HZ_MS = 16.67;

export const ADAPTIVE_ACCELERATOR_TIERS = [
  "webnn-npu", "webgpu-compute", "wasm-relaxed-simd", "wasm-simd128", "js-fallback",
] as const;
export type AdaptiveAcceleratorTier = (typeof ADAPTIVE_ACCELERATOR_TIERS)[number];

export const ADAPTIVE_TASK_KINDS = [
  "small-tile-filter", "8k-full-filter", "3d-lt-contour", "ai-lineart-upscale", "brush-stamp",
] as const;
export type AdaptiveTaskKind = (typeof ADAPTIVE_TASK_KINDS)[number];
export type ThermalPressureLevel = "nominal" | "fair" | "serious" | "critical";
export type MemoryPressureLevel = "normal" | "moderate" | "critical";
export type AdaptiveRouteReason =
  | "optimal-affinity" | "capability-fallback" | "contention-offload" | "hysteresis-hold"
  | "thermal-downgrade" | "memory-pressure-downgrade" | "gpu-device-lost" | "frame-spike-downgrade";

export interface HardwareCapabilityProfile {
  readonly webnnNpu: boolean; readonly webgpuCompute: boolean;
  readonly wasmRelaxedSimd: boolean; readonly wasmSimd128: boolean;
  readonly gpuDeviceLost?: boolean;
}
export interface FrameTelemetrySample {
  readonly frameMs: number; readonly task?: AdaptiveTaskKind; readonly accelerator?: AdaptiveAcceleratorTier;
  readonly gpuBusyRatio?: number; readonly cpuBusyRatio?: number;
}
export interface SystemPressureUpdate {
  readonly thermal?: ThermalPressureLevel; readonly memory?: MemoryPressureLevel; readonly gpuDeviceLost?: boolean;
}
export interface AdaptiveRouteOptions { readonly contendingAccelerators?: readonly AdaptiveAcceleratorTier[]; }
export interface AdaptiveRouteDecision {
  readonly task: AdaptiveTaskKind; readonly accelerator: AdaptiveAcceleratorTier;
  readonly preferredAccelerator: AdaptiveAcceleratorTier; readonly reason: AdaptiveRouteReason;
  readonly downgraded: boolean; readonly avoidedFrameDrop: boolean;
  readonly emaFrameMs: number; readonly budgetMs: number; readonly timestampMs: number;
}
export interface AdaptiveLoadBalancerTelemetry {
  readonly routeDecisions: number; readonly thermalDowngrades: number;
  readonly p95FrameMs: number; readonly frameDropAvoidedCount: number;
  readonly emaFrameMs: number; readonly budgetMs: number; readonly sampleCount: number;
  readonly thermalState: ThermalPressureLevel; readonly memoryState: MemoryPressureLevel;
  readonly gpuDeviceLost: boolean; readonly frameSpikeActive: boolean;
  readonly routeCountsByAccelerator: Readonly<Record<AdaptiveAcceleratorTier, number>>;
  readonly routeCountsByTask: Readonly<Record<AdaptiveTaskKind, number>>;
}
export interface AdaptiveLoadBalancerConfig {
  readonly budgetMs?: number; readonly emaAlpha?: number; readonly windowSize?: number;
  readonly hysteresisUpgradeFrames?: number; readonly hysteresisCooldownMs?: number;
  readonly spikeRatio?: number; readonly emaOverloadRatio?: number; readonly emaRecoveryRatio?: number;
  readonly maxInFlightPerAccelerator?: number; readonly capabilities?: Partial<HardwareCapabilityProfile>;
  readonly thermal?: ThermalPressureLevel; readonly memory?: MemoryPressureLevel; readonly now?: () => number;
}

export const DEFAULT_HARDWARE_CAPABILITY_PROFILE: HardwareCapabilityProfile = Object.freeze({
  webnnNpu: false, webgpuCompute: false, wasmRelaxedSimd: false, wasmSimd128: true, gpuDeviceLost: false,
});

/** 작업별 최적 가속기 선호 순위(지연·전송 오버헤드·병렬 처리량 기준). */
export const TASK_ACCELERATOR_AFFINITY: Readonly<
  Record<AdaptiveTaskKind, readonly AdaptiveAcceleratorTier[]>
> = Object.freeze({
  "small-tile-filter": Object.freeze(["wasm-relaxed-simd", "wasm-simd128", "webgpu-compute", "js-fallback"] as const),
  "8k-full-filter": Object.freeze(["webgpu-compute", "wasm-relaxed-simd", "wasm-simd128", "js-fallback"] as const),
  "3d-lt-contour": Object.freeze(["webgpu-compute", "wasm-relaxed-simd", "wasm-simd128", "js-fallback"] as const),
  "ai-lineart-upscale": Object.freeze(["webnn-npu", "webgpu-compute", "wasm-relaxed-simd", "wasm-simd128", "js-fallback"] as const),
  "brush-stamp": Object.freeze(["wasm-relaxed-simd", "wasm-simd128", "webgpu-compute", "js-fallback"] as const),
});

const BUSY_THRESHOLD = 0.85;
const THERMAL_RANK: Readonly<Record<ThermalPressureLevel, number>> = { nominal: 0, fair: 1, serious: 2, critical: 3 };
const MEMORY_RANK: Readonly<Record<MemoryPressureLevel, number>> = { normal: 0, moderate: 1, critical: 2 };
const PRESSURE_REASONS = new Set<AdaptiveRouteReason>([
  "thermal-downgrade", "memory-pressure-downgrade", "gpu-device-lost", "frame-spike-downgrade",
]);

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const zeroAccelMap = (): Record<AdaptiveAcceleratorTier, number> => ({
  "webnn-npu": 0, "webgpu-compute": 0, "wasm-relaxed-simd": 0, "wasm-simd128": 0, "js-fallback": 0,
});
const zeroTaskMap = (): Record<AdaptiveTaskKind, number> => ({
  "small-tile-filter": 0, "8k-full-filter": 0, "3d-lt-contour": 0, "ai-lineart-upscale": 0, "brush-stamp": 0,
});

function createRuntimeState(windowSize: number) {
  return {
    frameWindow: new Float64Array(windowSize),
    emaFrameMs: 0, sampleCount: 0, windowWriteIndex: 0, windowFilled: 0,
    frameSpikeActive: false, consecutiveHealthyFrames: 0, lastDegradeAtMs: Number.NEGATIVE_INFINITY,
    gpuBusyRatio: 0, cpuBusyRatio: 0,
    routeDecisions: 0, thermalDowngrades: 0, frameDropAvoidedCount: 0,
    spikePenalized: new Set<AdaptiveAcceleratorTier>(),
    heldTierByTask: new Map<AdaptiveTaskKind, AdaptiveAcceleratorTier>(),
    inFlight: zeroAccelMap(), routeByAccel: zeroAccelMap(), routeByTask: zeroTaskMap(),
  };
}

export class Wasm64AdaptiveLoadBalancer {
  private readonly cfg: {
    readonly emaAlpha: number; readonly windowSize: number; readonly upgradeFrames: number;
    readonly cooldownMs: number; readonly spikeRatio: number; readonly emaOverload: number;
    readonly emaRecovery: number; readonly maxInFlight: number; readonly now: () => number;
  };
  private budgetMs: number;
  private capabilities: HardwareCapabilityProfile;
  private thermalState: ThermalPressureLevel;
  private memoryState: MemoryPressureLevel;
  private gpuDeviceLost: boolean;
  private state: ReturnType<typeof createRuntimeState>;

  constructor(config: AdaptiveLoadBalancerConfig = {}) {
    const emaOverload = clamp(config.emaOverloadRatio ?? 0.92, 0.5, 1.2);
    this.cfg = {
      emaAlpha: clamp(config.emaAlpha ?? 0.25, 0.05, 0.95),
      windowSize: Math.max(8, Math.floor(config.windowSize ?? 64)),
      upgradeFrames: Math.max(1, Math.floor(config.hysteresisUpgradeFrames ?? 8)),
      cooldownMs: Math.max(0, config.hysteresisCooldownMs ?? 600),
      spikeRatio: Math.max(1.05, config.spikeRatio ?? 1.35),
      emaOverload,
      emaRecovery: clamp(config.emaRecoveryRatio ?? 0.72, 0.2, emaOverload - 0.05),
      maxInFlight: Math.max(1, Math.floor(config.maxInFlightPerAccelerator ?? 1)),
      now: config.now ?? (() => Date.now()),
    };
    this.budgetMs = typeof config.budgetMs === "number" && Number.isFinite(config.budgetMs) && config.budgetMs > 0
      ? config.budgetMs : FRAME_BUDGET_60HZ_MS;
    this.capabilities = Object.freeze({ ...DEFAULT_HARDWARE_CAPABILITY_PROFILE, ...config.capabilities });
    this.thermalState = config.thermal ?? "nominal";
    this.memoryState = config.memory ?? "normal";
    this.gpuDeviceLost = Boolean(this.capabilities.gpuDeviceLost);
    this.state = createRuntimeState(this.cfg.windowSize);
    if (THERMAL_RANK[this.thermalState] >= 2 || MEMORY_RANK[this.memoryState] >= 2 || this.gpuDeviceLost) {
      this.state.lastDegradeAtMs = this.cfg.now();
    }
  }

  setFrameBudget(budgetMs: number): void {
    if (!Number.isFinite(budgetMs) || budgetMs <= 0) return;
    this.budgetMs = budgetMs;
    if (this.state.sampleCount > 0 && this.state.emaFrameMs > this.budgetMs * this.cfg.emaOverload) {
      this.state.frameSpikeActive = true;
      this.triggerInstantDegrade();
    }
  }

  updateCapabilities(patch: Partial<HardwareCapabilityProfile>): void {
    const nextLost = patch.gpuDeviceLost ?? this.gpuDeviceLost;
    this.capabilities = Object.freeze({ ...this.capabilities, ...patch, gpuDeviceLost: nextLost });
    if (nextLost && !this.gpuDeviceLost) this.triggerInstantDegrade();
    this.gpuDeviceLost = nextLost;
  }

  updatePressure(update: SystemPressureUpdate): void {
    let escalated = false;
    if (update.thermal !== undefined) {
      if (THERMAL_RANK[update.thermal] > THERMAL_RANK[this.thermalState] && THERMAL_RANK[update.thermal] >= 2) escalated = true;
      this.thermalState = update.thermal;
    }
    if (update.memory !== undefined) {
      if (MEMORY_RANK[update.memory] > MEMORY_RANK[this.memoryState] && MEMORY_RANK[update.memory] >= 1) escalated = true;
      this.memoryState = update.memory;
    }
    if (update.gpuDeviceLost !== undefined) {
      if (update.gpuDeviceLost && !this.gpuDeviceLost) escalated = true;
      this.gpuDeviceLost = update.gpuDeviceLost;
      this.capabilities = Object.freeze({ ...this.capabilities, gpuDeviceLost: update.gpuDeviceLost });
    }
    if (escalated) this.triggerInstantDegrade();
  }
  acquire(accelerator: AdaptiveAcceleratorTier): void { this.state.inFlight[accelerator] += 1; }
  release(accelerator: AdaptiveAcceleratorTier): void {
    this.state.inFlight[accelerator] = Math.max(0, this.state.inFlight[accelerator] - 1);
  }
  recordFrame(sampleOrMs: number | FrameTelemetrySample): void {
    const sample: FrameTelemetrySample = typeof sampleOrMs === "number" ? { frameMs: sampleOrMs } : sampleOrMs;
    if (!Number.isFinite(sample.frameMs) || sample.frameMs < 0) return;

    const s = this.state;
    s.sampleCount += 1;
    s.emaFrameMs = s.sampleCount === 1
      ? sample.frameMs : this.cfg.emaAlpha * sample.frameMs + (1 - this.cfg.emaAlpha) * s.emaFrameMs;
    s.frameWindow[s.windowWriteIndex] = sample.frameMs;
    s.windowWriteIndex = (s.windowWriteIndex + 1) % this.cfg.windowSize;
    if (s.windowFilled < this.cfg.windowSize) s.windowFilled += 1;
    if (typeof sample.gpuBusyRatio === "number" && Number.isFinite(sample.gpuBusyRatio)) {
      s.gpuBusyRatio = clamp(sample.gpuBusyRatio, 0, 1);
    }
    if (typeof sample.cpuBusyRatio === "number" && Number.isFinite(sample.cpuBusyRatio)) {
      s.cpuBusyRatio = clamp(sample.cpuBusyRatio, 0, 1);
    }

    if (sample.frameMs > this.budgetMs * this.cfg.spikeRatio || s.emaFrameMs > this.budgetMs * this.cfg.emaOverload) {
      s.frameSpikeActive = true;
      this.triggerInstantDegrade();
      if (sample.accelerator && sample.accelerator !== "js-fallback") s.spikePenalized.add(sample.accelerator);
      return;
    }
    const clear = THERMAL_RANK[this.thermalState] < 2 && MEMORY_RANK[this.memoryState] < 2 && !this.gpuDeviceLost;
    if (clear && sample.frameMs <= this.budgetMs && s.emaFrameMs <= this.budgetMs * this.cfg.emaRecovery) {
      s.consecutiveHealthyFrames += 1;
      if (this.canPromote(this.cfg.now())) { s.frameSpikeActive = false; s.spikePenalized.clear(); }
    }
  }

  route(task: AdaptiveTaskKind, options: AdaptiveRouteOptions = {}): AdaptiveRouteDecision {
    const s = this.state;
    const nowMs = this.cfg.now();
    const affinity = TASK_ACCELERATOR_AFFINITY[task];
    const preferred = affinity[0];
    const extraBusy = options.contendingAccelerators ? new Set(options.contendingAccelerators) : null;

    let selected: AdaptiveAcceleratorTier = "js-fallback";
    let reason: AdaptiveRouteReason = "capability-fallback";
    let skippedReason: AdaptiveRouteReason | null = null;
    for (const tier of affinity) {
      if (!this.isCapable(tier)) { if (tier === preferred) skippedReason ??= "capability-fallback"; continue; }
      const block = this.getBlockReason(task, tier, extraBusy);
      if (block !== null) { skippedReason ??= block; continue; }
      selected = tier;
      reason = skippedReason ?? "optimal-affinity";
      break;
    }
    if (selected === "js-fallback" && skippedReason === "contention-offload") {
      selected = this.pickLeastLoaded(task, affinity);
      reason = "contention-offload";
    }

    const heldTier = s.heldTierByTask.get(task);
    if (heldTier && selected !== heldTier && affinity.indexOf(selected) < affinity.indexOf(heldTier)) {
      if (this.isCapable(heldTier) && this.getBlockReason(task, heldTier, extraBusy) === null && !this.canPromote(nowMs)) {
        selected = heldTier;
        reason = "hysteresis-hold";
      }
    }

    const isPressureOrSpike = PRESSURE_REASONS.has(reason);
    if (isPressureOrSpike) {
      s.heldTierByTask.set(task, selected);
      if (s.lastDegradeAtMs === Number.NEGATIVE_INFINITY) s.lastDegradeAtMs = nowMs;
    } else if (reason === "optimal-affinity") {
      s.heldTierByTask.delete(task);
    }

    const downgraded = selected !== preferred && reason !== "capability-fallback";
    const avoidedFrameDrop = isPressureOrSpike || reason === "contention-offload";
    s.routeDecisions += 1;
    if (reason === "thermal-downgrade") s.thermalDowngrades += 1;
    if (avoidedFrameDrop) s.frameDropAvoidedCount += 1;
    s.routeByAccel[selected] += 1;
    s.routeByTask[task] += 1;

    return Object.freeze({
      task, accelerator: selected, preferredAccelerator: preferred, reason,
      downgraded, avoidedFrameDrop, emaFrameMs: s.emaFrameMs, budgetMs: this.budgetMs, timestampMs: nowMs,
    });
  }

  getTelemetry(): AdaptiveLoadBalancerTelemetry {
    const s = this.state;
    const sorted = s.windowFilled > 0
      ? Array.from(s.frameWindow.subarray(0, s.windowFilled)).sort((a, b) => a - b) : [];
    const p95FrameMs = sorted.length === 0 ? 0 : (sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0);
    return Object.freeze({
      routeDecisions: s.routeDecisions, thermalDowngrades: s.thermalDowngrades,
      p95FrameMs, frameDropAvoidedCount: s.frameDropAvoidedCount,
      emaFrameMs: s.emaFrameMs, budgetMs: this.budgetMs, sampleCount: s.sampleCount,
      thermalState: this.thermalState, memoryState: this.memoryState, gpuDeviceLost: this.gpuDeviceLost,
      frameSpikeActive: s.frameSpikeActive,
      routeCountsByAccelerator: Object.freeze({ ...s.routeByAccel }),
      routeCountsByTask: Object.freeze({ ...s.routeByTask }),
    });
  }

  reset(): void { this.state = createRuntimeState(this.cfg.windowSize); }
  private triggerInstantDegrade(): void { this.state.consecutiveHealthyFrames = 0; this.state.lastDegradeAtMs = this.cfg.now(); }
  private canPromote(nowMs: number): boolean {
    return this.state.consecutiveHealthyFrames >= this.cfg.upgradeFrames
      && nowMs - this.state.lastDegradeAtMs >= this.cfg.cooldownMs
      && THERMAL_RANK[this.thermalState] < 2 && MEMORY_RANK[this.memoryState] < 2 && !this.gpuDeviceLost;
  }
  private isCapable(tier: AdaptiveAcceleratorTier): boolean {
    return tier === "webnn-npu" ? this.capabilities.webnnNpu
      : tier === "webgpu-compute" ? this.capabilities.webgpuCompute
      : tier === "wasm-relaxed-simd" ? this.capabilities.wasmRelaxedSimd
      : tier === "wasm-simd128" ? this.capabilities.wasmSimd128 : true;
  }
  private getPressureBlock(task: AdaptiveTaskKind, tier: AdaptiveAcceleratorTier): AdaptiveRouteReason | null {
    if (tier === "js-fallback") return null;
    if (tier === "webgpu-compute" && this.gpuDeviceLost) return "gpu-device-lost";
    if (this.thermalState === "critical" && (tier === "webgpu-compute" || tier === "webnn-npu")) return "thermal-downgrade";
    if (this.thermalState === "serious" && tier === "webgpu-compute") return "thermal-downgrade";
    if (this.memoryState === "critical" && (tier === "webgpu-compute" || tier === "webnn-npu")) return "memory-pressure-downgrade";
    if (this.memoryState === "moderate" && task === "8k-full-filter" && tier === "webgpu-compute") return "memory-pressure-downgrade";
    return null;
  }

  private getBlockReason(
    task: AdaptiveTaskKind, tier: AdaptiveAcceleratorTier, extraBusy: ReadonlySet<AdaptiveAcceleratorTier> | null,
  ): AdaptiveRouteReason | null {
    const pressure = this.getPressureBlock(task, tier);
    if (pressure) return pressure;
    const s = this.state;
    if (s.frameSpikeActive) {
      const hasSafeAlt = TASK_ACCELERATOR_AFFINITY[task].some(
        (c) => c !== tier && c !== "js-fallback" && this.isCapable(c) && this.getPressureBlock(task, c) === null,
      );
      if (s.spikePenalized.has(tier) && hasSafeAlt) return "frame-spike-downgrade";
      if (tier === "webgpu-compute" && s.spikePenalized.size === 0) return "frame-spike-downgrade";
    }
    if (extraBusy?.has(tier) || s.inFlight[tier] >= this.cfg.maxInFlight) return "contention-offload";
    if (tier === "webgpu-compute" && s.gpuBusyRatio >= BUSY_THRESHOLD) return "contention-offload";
    if ((tier === "wasm-relaxed-simd" || tier === "wasm-simd128") && s.cpuBusyRatio >= BUSY_THRESHOLD) return "contention-offload";
    return null;
  }

  private pickLeastLoaded(task: AdaptiveTaskKind, affinity: readonly AdaptiveAcceleratorTier[]): AdaptiveAcceleratorTier {
    let best: AdaptiveAcceleratorTier = "js-fallback";
    let bestLoad = Number.POSITIVE_INFINITY;
    for (const tier of affinity) {
      if (!this.isCapable(tier) || this.getPressureBlock(task, tier) !== null) continue;
      if (this.state.inFlight[tier] < bestLoad) { best = tier; bestLoad = this.state.inFlight[tier]; }
    }
    return best;
  }
}

export function createWasm64AdaptiveLoadBalancer(config?: AdaptiveLoadBalancerConfig): Wasm64AdaptiveLoadBalancer {
  return new Wasm64AdaptiveLoadBalancer(config);
}
