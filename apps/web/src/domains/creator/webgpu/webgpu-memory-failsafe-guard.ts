/**
 * WebGPU VRAM 메모리 압박 Fail-Safe 가드레일.
 *
 * - GPU 텍스처·버퍼 할당 바이트를 실시간 추적하고 `GPUDevice.lost` 및
 *   `pushErrorScope("out-of-memory")` / `popErrorScope()` 오류를 감시한다.
 * - 3단계 임계치 정책:
 *   1. 75% 소프트 임계치: 미고정 LRU 타일 캐시를 선제 정리해 VRAM 여유를 확보한다.
 *   2. 88% 경고 임계치: 프리뷰 렌더 스케일을 안전하게 축소하고 사용자 안내 이벤트를 발행한다.
 *   3. 95% 치명 임계치 또는 `device.lost` / OOM 오류: 진행 중인 스트로크 좌표를
 *      무손실 보존한 채 2D/CPU 안전 대체 렌더러(`canvas2d-cpu-safe`)로 즉시 전환하고
 *      복구 가능 상태를 보고한다.
 */

export const WEBGPU_VRAM_DEFAULT_BUDGET_BYTES = 512 * 1024 * 1024;
export const WEBGPU_VRAM_SOFT_THRESHOLD = 0.75 as const;
export const WEBGPU_VRAM_WARNING_THRESHOLD = 0.88 as const;
export const WEBGPU_VRAM_CRITICAL_THRESHOLD = 0.95 as const;
export const WEBGPU_VRAM_SOFT_EVICT_TARGET = 0.62 as const;
export const WEBGPU_VRAM_RECOVERY_THRESHOLD = 0.68 as const;

export type WebGpuResourceKind = "texture" | "buffer";

export type WebGpuVramPressureTier =
  | "nominal"
  | "soft-evict"
  | "warning-scale-down"
  | "critical-fallback";

export type WebGpuActiveRendererMode = "webgpu" | "canvas2d-cpu-safe";

export type WebGpuRecoveryStatus =
  | "active-webgpu"
  | "recoverable-after-cleanup"
  | "recoverable-device-recreate"
  | "permanent-cpu-safe";

export interface WebGpuTrackedAllocationInput {
  readonly id: string;
  readonly kind: WebGpuResourceKind;
  readonly bytes: number;
  readonly label?: string;
  /** 타일 캐시처럼 LRU 회수가 가능한 자원인지 여부(기본: texture는 true, buffer는 false). */
  readonly evictableTile?: boolean;
  /** 현재 뷰포트·활성 스트로크에 묶여 즉시 회수하면 안 되는 자원. */
  readonly pinned?: boolean;
  readonly lastUsedAtMs?: number;
}

export interface WebGpuTrackedAllocation {
  readonly id: string;
  readonly kind: WebGpuResourceKind;
  readonly bytes: number;
  readonly label: string;
  readonly evictableTile: boolean;
  readonly pinned: boolean;
  readonly lastUsedAtMs: number;
}

export interface WebGpuActiveStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly timestampMs: number;
}

export interface WebGpuActiveStrokeStartInput {
  readonly strokeId: string;
  readonly toolId: string;
  readonly colorHex: string;
  readonly brushSizePx: number;
  readonly opacity: number;
  readonly points?: readonly WebGpuActiveStrokePoint[];
}

export interface WebGpuPreservedStrokeHandoff {
  readonly strokeId: string;
  readonly toolId: string;
  readonly colorHex: string;
  readonly brushSizePx: number;
  readonly opacity: number;
  readonly points: readonly WebGpuActiveStrokePoint[];
  readonly capturedAtMs: number;
  readonly reason: "vram-critical" | "device-lost" | "out-of-memory";
}

export type WebGpuFailSafeEventKind =
  | "lru-cache-evicted"
  | "preview-scale-reduced"
  | "fallback-to-cpu-safe"
  | "device-lost"
  | "out-of-memory"
  | "recovered-webgpu";

export interface WebGpuMemoryFailSafeEvent {
  readonly kind: WebGpuFailSafeEventKind;
  readonly tier: WebGpuVramPressureTier;
  readonly activeRenderer: WebGpuActiveRendererMode;
  readonly utilizationRatio: number;
  readonly previewRenderScale: number;
  readonly evictedCount: number;
  readonly evictedBytes: number;
  readonly preservedStroke: WebGpuPreservedStrokeHandoff | null;
  readonly canRecoverWebGpu: boolean;
  readonly recoveryStatus: WebGpuRecoveryStatus;
  readonly userNoticeKo: string | null;
  readonly detail: string;
  readonly timestampMs: number;
}

export interface WebGpuDeviceLostInfoLike {
  readonly reason?: string;
  readonly message?: string;
}

export interface WebGpuErrorLike {
  readonly message?: string;
}

export interface WebGpuWatchableDevice {
  readonly lost: Promise<WebGpuDeviceLostInfoLike>;
  pushErrorScope?(filter: "out-of-memory" | "validation" | "internal"): void;
  popErrorScope?(): Promise<WebGpuErrorLike | null>;
}

export interface WebGpuMemoryFailSafeSnapshot {
  readonly usedBytes: number;
  readonly textureBytes: number;
  readonly bufferBytes: number;
  readonly pinnedBytes: number;
  readonly evictableTileBytes: number;
  readonly budgetBytes: number;
  readonly utilizationRatio: number;
  readonly resourceCount: number;
  readonly tier: WebGpuVramPressureTier;
  readonly activeRenderer: WebGpuActiveRendererMode;
  readonly previewRenderScale: number;
  readonly hasActiveStroke: boolean;
  readonly lastPreservedStroke: WebGpuPreservedStrokeHandoff | null;
  readonly canRecoverWebGpu: boolean;
  readonly recoveryStatus: WebGpuRecoveryStatus;
  readonly totalEvictedTiles: number;
  readonly totalEvictedBytes: number;
  readonly fallbackCount: number;
  readonly lastUserNoticeKo: string | null;
  readonly lastEvent: WebGpuMemoryFailSafeEvent | null;
}

export interface WebGpuMemoryFailSafeOptions {
  readonly budgetBytes?: number;
  readonly softThreshold?: number;
  readonly warningThreshold?: number;
  readonly criticalThreshold?: number;
  readonly softEvictTargetRatio?: number;
  readonly warningPreviewScale?: number;
  readonly minPreviewScale?: number;
  readonly now?: () => number;
  readonly onEvictTile?: (allocation: WebGpuTrackedAllocation) => void;
  readonly onPreviewScaleChange?: (scale: number, userNoticeKo: string) => void;
  readonly onFallbackToSafeRenderer?: (event: WebGpuMemoryFailSafeEvent) => void;
  readonly onEvent?: (event: WebGpuMemoryFailSafeEvent) => void;
}

export interface WebGpuEvictionResult {
  readonly evictedIds: readonly string[];
  readonly evictedBytes: number;
  readonly remainingBytes: number;
  readonly utilizationRatio: number;
}

export interface WebGpuRecoveryResult {
  readonly recovered: boolean;
  readonly activeRenderer: WebGpuActiveRendererMode;
  readonly recoveryStatus: WebGpuRecoveryStatus;
  readonly utilizationRatio: number;
  readonly messageKo: string;
}

interface MutableAllocationRecord {
  readonly id: string;
  readonly kind: WebGpuResourceKind;
  readonly bytes: number;
  readonly label: string;
  readonly evictableTile: boolean;
  pinned: boolean;
  lastUsedAtMs: number;
}

interface MutableActiveStroke {
  readonly strokeId: string;
  readonly toolId: string;
  readonly colorHex: string;
  readonly brushSizePx: number;
  readonly opacity: number;
  readonly points: WebGpuActiveStrokePoint[];
}

function sanitizePositiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampUnitRatio(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(0.99, Math.max(0.1, value));
}

function freezeAllocation(record: MutableAllocationRecord): WebGpuTrackedAllocation {
  return Object.freeze({
    id: record.id,
    kind: record.kind,
    bytes: record.bytes,
    label: record.label,
    evictableTile: record.evictableTile,
    pinned: record.pinned,
    lastUsedAtMs: record.lastUsedAtMs,
  });
}

export class WebGpuMemoryFailSafeGuard {
  private readonly budgetBytes: number;
  private readonly softThreshold: number;
  private readonly warningThreshold: number;
  private readonly criticalThreshold: number;
  private readonly softEvictTargetRatio: number;
  private readonly warningPreviewScale: number;
  private readonly minPreviewScale: number;
  private readonly now: () => number;
  private readonly onEvictTile?: (allocation: WebGpuTrackedAllocation) => void;
  private readonly onPreviewScaleChange?: (scale: number, userNoticeKo: string) => void;
  private readonly onFallbackToSafeRenderer?: (event: WebGpuMemoryFailSafeEvent) => void;
  private readonly listeners = new Set<(event: WebGpuMemoryFailSafeEvent) => void>();

  private readonly allocations = new Map<string, MutableAllocationRecord>();
  private usedBytes = 0;
  private textureBytes = 0;
  private bufferBytes = 0;
  private tier: WebGpuVramPressureTier = "nominal";
  private activeRenderer: WebGpuActiveRendererMode = "webgpu";
  private previewRenderScale = 1.0;
  private canRecoverWebGpu = true;
  private recoveryStatus: WebGpuRecoveryStatus = "active-webgpu";
  private activeStroke: MutableActiveStroke | null = null;
  private lastPreservedStroke: WebGpuPreservedStrokeHandoff | null = null;
  private lastUserNoticeKo: string | null = null;
  private lastEvent: WebGpuMemoryFailSafeEvent | null = null;
  private totalEvictedTiles = 0;
  private totalEvictedBytes = 0;
  private fallbackCount = 0;
  private device: WebGpuWatchableDevice | null = null;
  private deviceGeneration = 0;
  private warningNotified = false;

  constructor(options: WebGpuMemoryFailSafeOptions = {}) {
    this.budgetBytes = Math.round(
      sanitizePositiveNumber(options.budgetBytes, WEBGPU_VRAM_DEFAULT_BUDGET_BYTES),
    );
    const soft = clampUnitRatio(options.softThreshold, WEBGPU_VRAM_SOFT_THRESHOLD);
    const warning = Math.max(
      soft + 0.02,
      clampUnitRatio(options.warningThreshold, WEBGPU_VRAM_WARNING_THRESHOLD),
    );
    const critical = Math.max(
      warning + 0.02,
      clampUnitRatio(options.criticalThreshold, WEBGPU_VRAM_CRITICAL_THRESHOLD),
    );
    this.softThreshold = soft;
    this.warningThreshold = warning;
    this.criticalThreshold = critical;
    this.softEvictTargetRatio = Math.min(
      soft - 0.05,
      clampUnitRatio(options.softEvictTargetRatio, WEBGPU_VRAM_SOFT_EVICT_TARGET),
    );
    this.warningPreviewScale = Math.min(
      0.95,
      Math.max(0.5, sanitizePositiveNumber(options.warningPreviewScale, 0.75)),
    );
    this.minPreviewScale = Math.min(
      this.warningPreviewScale,
      Math.max(0.25, sanitizePositiveNumber(options.minPreviewScale, 0.5)),
    );
    this.now = options.now ?? (() => Date.now());
    this.onEvictTile = options.onEvictTile;
    this.onPreviewScaleChange = options.onPreviewScaleChange;
    this.onFallbackToSafeRenderer = options.onFallbackToSafeRenderer;
    if (options.onEvent) {
      this.listeners.add(options.onEvent);
    }
  }

  subscribe(listener: (event: WebGpuMemoryFailSafeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** `GPUDevice.lost` 프로미스를 감시하도록 디바이스를 연결한다. */
  attachDevice(device: WebGpuWatchableDevice | null): void {
    this.deviceGeneration += 1;
    const generation = this.deviceGeneration;
    this.device = device;
    if (!device) return;

    void device.lost.then((info) => {
      if (this.deviceGeneration !== generation) return;
      this.handleDeviceLost(info);
    });
  }

  /** 텍스처 또는 버퍼 할당 바이트를 등록하고 임계치별 Fail-Safe를 즉시 평가한다. */
  trackAllocation(input: WebGpuTrackedAllocationInput): WebGpuMemoryFailSafeSnapshot {
    const id = input.id.trim();
    if (!id) {
      return this.getSnapshot();
    }
    const bytes = Math.max(0, Math.round(Number.isFinite(input.bytes) ? input.bytes : 0));
    const existing = this.allocations.get(id);
    if (existing) {
      this.subtractBytes(existing);
    }

    const record: MutableAllocationRecord = {
      id,
      kind: input.kind,
      bytes,
      label: input.label?.trim() || id,
      evictableTile: input.evictableTile ?? input.kind === "texture",
      pinned: input.pinned === true,
      lastUsedAtMs:
        input.lastUsedAtMs !== undefined && Number.isFinite(input.lastUsedAtMs)
          ? input.lastUsedAtMs
          : this.now(),
    };
    this.allocations.set(id, record);
    this.addBytes(record);
    this.evaluatePressure();
    return this.getSnapshot();
  }

  /** LRU 사용 시각을 갱신해 최근 접근 타일이 먼저 정리되지 않게 보호한다. */
  touchAllocation(id: string, atMs?: number): boolean {
    const record = this.allocations.get(id);
    if (!record) return false;
    record.lastUsedAtMs = atMs !== undefined && Number.isFinite(atMs) ? atMs : this.now();
    return true;
  }

  setAllocationPinned(id: string, pinned: boolean): boolean {
    const record = this.allocations.get(id);
    if (!record) return false;
    record.pinned = pinned;
    return true;
  }

  releaseAllocation(id: string): boolean {
    const record = this.allocations.get(id);
    if (!record) return false;
    this.allocations.delete(id);
    this.subtractBytes(record);
    this.recheckNominalRecovery();
    return true;
  }

  /** 진행 중인 스트로크의 메타데이터·초기 포인트를 등록해 비상 전환 시 손실을 막는다. */
  beginActiveStroke(input: WebGpuActiveStrokeStartInput): void {
    this.activeStroke = {
      strokeId: input.strokeId,
      toolId: input.toolId,
      colorHex: input.colorHex,
      brushSizePx: input.brushSizePx,
      opacity: input.opacity,
      points: input.points ? [...input.points] : [],
    };
  }

  appendActiveStrokePoint(point: WebGpuActiveStrokePoint): void {
    if (!this.activeStroke) return;
    this.activeStroke.points.push({ ...point });
  }

  commitActiveStroke(): void {
    this.activeStroke = null;
  }

  cancelActiveStroke(): void {
    this.activeStroke = null;
  }

  /** 미고정 타일 캐시를 LRU(오래된 사용 시각 우선) 순서로 목표 바이트 이하까지 선제 회수한다. */
  evictLruTiles(targetRatio: number = this.softEvictTargetRatio): WebGpuEvictionResult {
    const targetBytes = Math.max(0, Math.floor(this.budgetBytes * Math.max(0, targetRatio)));
    if (this.usedBytes <= targetBytes) {
      return {
        evictedIds: [],
        evictedBytes: 0,
        remainingBytes: this.usedBytes,
        utilizationRatio: this.utilizationRatio(),
      };
    }

    const candidates = [...this.allocations.values()]
      .filter((entry) => entry.evictableTile && !entry.pinned)
      .sort((left, right) => left.lastUsedAtMs - right.lastUsedAtMs || right.bytes - left.bytes);

    const evictedIds: string[] = [];
    let evictedBytes = 0;

    for (const candidate of candidates) {
      if (this.usedBytes <= targetBytes) break;
      this.allocations.delete(candidate.id);
      this.subtractBytes(candidate);
      evictedIds.push(candidate.id);
      evictedBytes += candidate.bytes;
      this.totalEvictedTiles += 1;
      this.totalEvictedBytes += candidate.bytes;
      this.onEvictTile?.(freezeAllocation(candidate));
    }

    if (evictedIds.length > 0) {
      this.emitEvent({
        kind: "lru-cache-evicted",
        evictedCount: evictedIds.length,
        evictedBytes,
        preservedStroke: null,
        userNoticeKo: null,
        detail: `LRU 타일 캐시 ${evictedIds.length}건(${Math.round(evictedBytes / (1024 * 1024))}MiB) 선제 정리`,
      });
    }

    this.recheckNominalRecovery();

    return {
      evictedIds,
      evictedBytes,
      remainingBytes: this.usedBytes,
      utilizationRatio: this.utilizationRatio(),
    };
  }

  /**
   * `device.pushErrorScope("out-of-memory")` / `popErrorScope()`로 GPU 작업을 감싸
   * OOM 발생 시 즉시 안전 대체 렌더러로 전환하고 진행 중인 스트로크를 보존한다.
   */
  async runWithOomGuard<T>(
    operation: () => Promise<T> | T,
    contextLabel = "gpu-operation",
  ): Promise<{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly fallbackEvent: WebGpuMemoryFailSafeEvent }> {
    const device = this.device;
    const canScope = Boolean(device?.pushErrorScope && device?.popErrorScope);
    if (canScope) {
      device!.pushErrorScope!("out-of-memory");
    }

    let operationValue: T | undefined;
    let thrownError: unknown = null;
    let didThrow = false;

    try {
      operationValue = await operation();
    } catch (error) {
      didThrow = true;
      thrownError = error;
    }

    let scopedOomError: WebGpuErrorLike | null = null;
    if (canScope) {
      try {
        scopedOomError = await device!.popErrorScope!();
      } catch (scopeError) {
        scopedOomError = {
          message: scopeError instanceof Error ? scopeError.message : String(scopeError),
        };
      }
    }

    if (scopedOomError !== null) {
      const event = this.handleOutOfMemoryError(
        `${contextLabel}: ${scopedOomError.message || "WebGPU out-of-memory"}`,
      );
      return { ok: false, fallbackEvent: event };
    }

    if (didThrow) {
      const message = thrownError instanceof Error ? thrownError.message : String(thrownError);
      if (/out[-_\s]?of[-_\s]?memory|oom|allocation failed/iu.test(message)) {
        const event = this.handleOutOfMemoryError(`${contextLabel}: ${message}`);
        return { ok: false, fallbackEvent: event };
      }
      throw thrownError;
    }

    return { ok: true, value: operationValue as T };
  }

  /** `GPUDevice.lost` 수신 시 호출되어 스트로크 손실 없이 2D/CPU 안전 렌더러로 즉시 전환한다. */
  handleDeviceLost(info: WebGpuDeviceLostInfoLike = {}): WebGpuMemoryFailSafeEvent {
    const reason = info.reason ?? "unknown";
    const permanentlyDestroyed = reason === "destroyed";
    return this.triggerCriticalFallback({
      kind: "device-lost",
      strokeReason: "device-lost",
      canRecover: !permanentlyDestroyed,
      recoveryStatus: permanentlyDestroyed
        ? "permanent-cpu-safe"
        : "recoverable-device-recreate",
      userNoticeKo:
        "그래픽 장치 연결이 일시 중단되어 2D 안전 모드로 전환했습니다. 그리던 획은 그대로 유지됩니다.",
      detail: `GPUDevice.lost (${reason})${info.message ? `: ${info.message}` : ""}`,
    });
  }

  /** `popErrorScope('out-of-memory')` 검출 시 캐시를 비우고 2D/CPU 안전 모드로 전환한다. */
  handleOutOfMemoryError(detail = "WebGPU out-of-memory error scope"): WebGpuMemoryFailSafeEvent {
    // 1차로 미고정 타일을 모두 회수해 브라우저 VRAM 압박을 즉시 낮춘다.
    this.evictLruTiles(0);
    return this.triggerCriticalFallback({
      kind: "out-of-memory",
      strokeReason: "out-of-memory",
      canRecover: true,
      recoveryStatus: "recoverable-after-cleanup",
      userNoticeKo:
        "그래픽 메모리가 부족해 2D 안전 모드로 전환했습니다. 현재 작업과 그리던 획은 손실 없이 유지됩니다.",
      detail,
    });
  }

  /** VRAM 여유가 확보되었거나 새 `GPUDevice`가 준비되었을 때 WebGPU 모드 복귀를 시도한다. */
  attemptWebGpuRecovery(nextDevice?: WebGpuWatchableDevice | null): WebGpuRecoveryResult {
    if (!this.canRecoverWebGpu) {
      return {
        recovered: false,
        activeRenderer: this.activeRenderer,
        recoveryStatus: this.recoveryStatus,
        utilizationRatio: this.utilizationRatio(),
        messageKo: "현재 장치는 영구 해제 상태라 2D 안전 모드를 유지합니다.",
      };
    }

    if (this.utilizationRatio() >= this.warningThreshold) {
      this.evictLruTiles(this.softEvictTargetRatio);
    }

    if (this.utilizationRatio() >= this.warningThreshold) {
      return {
        recovered: false,
        activeRenderer: this.activeRenderer,
        recoveryStatus: "recoverable-after-cleanup",
        utilizationRatio: this.utilizationRatio(),
        messageKo: "VRAM 점유율이 아직 높아 2D 안전 모드를 유지합니다. 일부 레이어/캐시를 정리한 뒤 다시 시도해 주세요.",
      };
    }

    if (nextDevice !== undefined) {
      this.attachDevice(nextDevice);
    }

    this.activeRenderer = "webgpu";
    this.previewRenderScale = 1.0;
    this.warningNotified = false;
    this.tier = this.utilizationRatio() >= this.softThreshold ? "soft-evict" : "nominal";
    this.recoveryStatus = "active-webgpu";
    this.lastUserNoticeKo = "그래픽 메모리 여유가 확보되어 WebGPU 가속 모드로 복구했습니다.";

    this.emitEvent({
      kind: "recovered-webgpu",
      evictedCount: 0,
      evictedBytes: 0,
      preservedStroke: null,
      userNoticeKo: this.lastUserNoticeKo,
      detail: `WebGPU 복구 완료 (점유율 ${Math.round(this.utilizationRatio() * 100)}%)`,
    });

    return {
      recovered: true,
      activeRenderer: this.activeRenderer,
      recoveryStatus: this.recoveryStatus,
      utilizationRatio: this.utilizationRatio(),
      messageKo: this.lastUserNoticeKo,
    };
  }

  getSnapshot(): WebGpuMemoryFailSafeSnapshot {
    let pinnedBytes = 0;
    let evictableTileBytes = 0;
    for (const entry of this.allocations.values()) {
      if (entry.pinned) pinnedBytes += entry.bytes;
      else if (entry.evictableTile) evictableTileBytes += entry.bytes;
    }

    return Object.freeze({
      usedBytes: this.usedBytes,
      textureBytes: this.textureBytes,
      bufferBytes: this.bufferBytes,
      pinnedBytes,
      evictableTileBytes,
      budgetBytes: this.budgetBytes,
      utilizationRatio: this.utilizationRatio(),
      resourceCount: this.allocations.size,
      tier: this.tier,
      activeRenderer: this.activeRenderer,
      previewRenderScale: this.previewRenderScale,
      hasActiveStroke: this.activeStroke !== null,
      lastPreservedStroke: this.lastPreservedStroke,
      canRecoverWebGpu: this.canRecoverWebGpu,
      recoveryStatus: this.recoveryStatus,
      totalEvictedTiles: this.totalEvictedTiles,
      totalEvictedBytes: this.totalEvictedBytes,
      fallbackCount: this.fallbackCount,
      lastUserNoticeKo: this.lastUserNoticeKo,
      lastEvent: this.lastEvent,
    });
  }

  dispose(): void {
    this.deviceGeneration += 1;
    this.device = null;
    this.allocations.clear();
    this.usedBytes = 0;
    this.textureBytes = 0;
    this.bufferBytes = 0;
    this.activeStroke = null;
    this.listeners.clear();
  }

  private utilizationRatio(): number {
    return Number((this.usedBytes / this.budgetBytes).toFixed(4));
  }

  private addBytes(record: MutableAllocationRecord): void {
    this.usedBytes += record.bytes;
    if (record.kind === "texture") this.textureBytes += record.bytes;
    else this.bufferBytes += record.bytes;
  }

  private subtractBytes(record: MutableAllocationRecord): void {
    this.usedBytes = Math.max(0, this.usedBytes - record.bytes);
    if (record.kind === "texture") {
      this.textureBytes = Math.max(0, this.textureBytes - record.bytes);
    } else {
      this.bufferBytes = Math.max(0, this.bufferBytes - record.bytes);
    }
  }

  private evaluatePressure(): void {
    if (this.activeRenderer === "canvas2d-cpu-safe") return;

    let ratio = this.utilizationRatio();

    // 1단계 (75% 소프트 임계치): 미고정 LRU 타일 캐시 선제 정리
    if (ratio >= this.softThreshold) {
      this.tier = "soft-evict";
      this.evictLruTiles(this.softEvictTargetRatio);
      ratio = this.utilizationRatio();
    }

    // 3단계 (95% 치명 임계치): 선제 정리 후에도 95% 이상이면 즉시 2D/CPU 안전 모드 전환
    if (ratio >= this.criticalThreshold) {
      this.triggerCriticalFallback({
        kind: "fallback-to-cpu-safe",
        strokeReason: "vram-critical",
        canRecover: true,
        recoveryStatus: "recoverable-after-cleanup",
        userNoticeKo:
          "VRAM 사용량이 95%를 넘어 2D 안전 모드로 즉시 전환했습니다. 그리던 획은 손실 없이 보존됩니다.",
        detail: `VRAM 임계치 초과 (${Math.round(ratio * 100)}%)`,
      });
      return;
    }

    // 2단계 (88% 경고 임계치): 프리뷰 렌더 스케일 안전 축소 + 사용자 안내 이벤트
    if (ratio >= this.warningThreshold) {
      this.tier = "warning-scale-down";
      const nextScale =
        ratio >= (this.warningThreshold + this.criticalThreshold) / 2
          ? this.minPreviewScale
          : this.warningPreviewScale;
      const scaleChanged = nextScale < this.previewRenderScale;
      if (scaleChanged) {
        this.previewRenderScale = nextScale;
      }
      if (scaleChanged || !this.warningNotified) {
        this.warningNotified = true;
        const scalePct = Math.round(this.previewRenderScale * 100);
        const notice = `VRAM 사용량이 높아 프리뷰 해상도를 ${scalePct}%로 안전 축소했습니다.`;
        this.lastUserNoticeKo = notice;
        this.onPreviewScaleChange?.(this.previewRenderScale, notice);
        this.emitEvent({
          kind: "preview-scale-reduced",
          evictedCount: 0,
          evictedBytes: 0,
          preservedStroke: null,
          userNoticeKo: notice,
          detail: `VRAM 경고 (${Math.round(ratio * 100)}%) → 프리뷰 스케일 ${scalePct}%`,
        });
      }
      return;
    }

    if (ratio >= this.softThreshold) {
      this.tier = "soft-evict";
      return;
    }

    this.recheckNominalRecovery();
  }

  private recheckNominalRecovery(): void {
    if (this.activeRenderer !== "webgpu") return;
    if (this.utilizationRatio() <= WEBGPU_VRAM_RECOVERY_THRESHOLD) {
      this.tier = "nominal";
      this.previewRenderScale = 1.0;
      this.warningNotified = false;
    }
  }

  private capturePreservedStroke(
    reason: WebGpuPreservedStrokeHandoff["reason"],
  ): WebGpuPreservedStrokeHandoff | null {
    if (!this.activeStroke) return null;
    const handoff: WebGpuPreservedStrokeHandoff = Object.freeze({
      strokeId: this.activeStroke.strokeId,
      toolId: this.activeStroke.toolId,
      colorHex: this.activeStroke.colorHex,
      brushSizePx: this.activeStroke.brushSizePx,
      opacity: this.activeStroke.opacity,
      points: Object.freeze(this.activeStroke.points.map((point) => Object.freeze({ ...point }))),
      capturedAtMs: this.now(),
      reason,
    });
    this.lastPreservedStroke = handoff;
    return handoff;
  }

  private triggerCriticalFallback(input: {
    readonly kind: "fallback-to-cpu-safe" | "device-lost" | "out-of-memory";
    readonly strokeReason: WebGpuPreservedStrokeHandoff["reason"];
    readonly canRecover: boolean;
    readonly recoveryStatus: WebGpuRecoveryStatus;
    readonly userNoticeKo: string;
    readonly detail: string;
  }): WebGpuMemoryFailSafeEvent {
    this.tier = "critical-fallback";
    this.activeRenderer = "canvas2d-cpu-safe";
    this.previewRenderScale = 1.0;
    this.canRecoverWebGpu = input.canRecover;
    this.recoveryStatus = input.recoveryStatus;
    this.lastUserNoticeKo = input.userNoticeKo;
    this.fallbackCount += 1;

    const preservedStroke = this.capturePreservedStroke(input.strokeReason);
    const event = this.emitEvent({
      kind: input.kind,
      evictedCount: 0,
      evictedBytes: 0,
      preservedStroke,
      userNoticeKo: input.userNoticeKo,
      detail: input.detail,
    });
    this.onFallbackToSafeRenderer?.(event);
    return event;
  }

  private emitEvent(input: {
    readonly kind: WebGpuFailSafeEventKind;
    readonly evictedCount: number;
    readonly evictedBytes: number;
    readonly preservedStroke: WebGpuPreservedStrokeHandoff | null;
    readonly userNoticeKo: string | null;
    readonly detail: string;
  }): WebGpuMemoryFailSafeEvent {
    const event: WebGpuMemoryFailSafeEvent = Object.freeze({
      kind: input.kind,
      tier: this.tier,
      activeRenderer: this.activeRenderer,
      utilizationRatio: this.utilizationRatio(),
      previewRenderScale: this.previewRenderScale,
      evictedCount: input.evictedCount,
      evictedBytes: input.evictedBytes,
      preservedStroke: input.preservedStroke,
      canRecoverWebGpu: this.canRecoverWebGpu,
      recoveryStatus: this.recoveryStatus,
      userNoticeKo: input.userNoticeKo,
      detail: input.detail,
      timestampMs: this.now(),
    });
    this.lastEvent = event;
    for (const listener of this.listeners) {
      listener(event);
    }
    return event;
  }
}
