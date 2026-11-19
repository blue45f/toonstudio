/**
 * Long-session collaborative drawing diagnostics, adaptive save scheduler,
 * auto-degrade evaluator, storage quota guard, and background heartbeat jitter guard.
 *
 * Provides:
 * 1. One-click runtime diagnostics snapshot + JSON serializer for field triage.
 * 2. Adaptive autosave scheduler that defers save barriers while local pointer input is active
 *    and executes during brief idle windows under a strict durability max-wait ceiling.
 * 3. Auto-degrade policy that temporarily suppresses remote stroke trails when active peers
 *    exceed 6 or average frame time exceeds 12ms.
 * 4. OPFS/IndexedDB storage quota probe (`navigator.storage.estimate()`) with 85%/95% guards.
 * 5. Background timer throttling & NTP clock-jump guard for presence heartbeats.
 */

export type StudioLiveLongSessionHealth = "healthy" | "degraded" | "recovering";

export const STUDIO_LIVE_AUTO_DEGRADE_PEER_THRESHOLD = 6;
export const STUDIO_LIVE_AUTO_DEGRADE_FRAME_MS_THRESHOLD = 12;

export const STUDIO_STORAGE_QUOTA_WARN_RATIO = 0.85;
export const STUDIO_STORAGE_QUOTA_CRITICAL_RATIO = 0.95;

export const STUDIO_HEARTBEAT_EXPECTED_INTERVAL_MS = 15_000;
export const STUDIO_HEARTBEAT_THROTTLE_THRESHOLD_MS = 45_000;

export type StudioLiveAutoDegradeReason = "none" | "peer-count" | "frame-budget";

export interface StudioLiveAutoDegradeInput {
  readonly peerCount: number;
  readonly avgFrameMs?: number | null;
  readonly autoDegradeEnabled?: boolean;
  readonly userTrailsPreference: boolean;
}

export interface StudioLiveAutoDegradeDecision {
  readonly effectiveShowTrails: boolean;
  readonly degraded: boolean;
  readonly reason: StudioLiveAutoDegradeReason;
}

/**
 * 피어 수가 6명을 초과하거나 평균 프레임 예산이 12ms를 넘으면 원격 획 트레일만 단계적으로 꺼서
 * 로컬 펜 입력 반응성을 보호한다. 부하가 해소되면 사용자의 원래 트레일 설정으로 복원된다.
 */
export function evaluateStudioLiveAutoDegrade(
  input: StudioLiveAutoDegradeInput,
): StudioLiveAutoDegradeDecision {
  const enabled = input.autoDegradeEnabled ?? true;
  const peerCount = nonNegativeInt(input.peerCount);
  const avgFrameMs =
    typeof input.avgFrameMs === "number" && Number.isFinite(input.avgFrameMs) && input.avgFrameMs >= 0
      ? input.avgFrameMs
      : 0;

  if (!enabled || !input.userTrailsPreference) {
    return Object.freeze({
      effectiveShowTrails: input.userTrailsPreference,
      degraded: false,
      reason: "none",
    });
  }

  if (peerCount > STUDIO_LIVE_AUTO_DEGRADE_PEER_THRESHOLD) {
    return Object.freeze({
      effectiveShowTrails: false,
      degraded: true,
      reason: "peer-count",
    });
  }

  if (avgFrameMs > STUDIO_LIVE_AUTO_DEGRADE_FRAME_MS_THRESHOLD) {
    return Object.freeze({
      effectiveShowTrails: false,
      degraded: true,
      reason: "frame-budget",
    });
  }

  return Object.freeze({
    effectiveShowTrails: true,
    degraded: false,
    reason: "none",
  });
}

export type StudioStorageQuotaStatus = "ok" | "warning" | "critical" | "unknown";

export interface StudioStorageQuotaSnapshot {
  readonly status: StudioStorageQuotaStatus;
  readonly usageBytes: number | null;
  readonly quotaBytes: number | null;
  readonly usageRatio: number | null;
  readonly remainingMb: number | null;
}

export function evaluateStudioStorageQuota(input: {
  readonly usageBytes?: number | null;
  readonly quotaBytes?: number | null;
}): StudioStorageQuotaSnapshot {
  const usage = input.usageBytes;
  const quota = input.quotaBytes;
  if (
    typeof usage !== "number"
    || !Number.isFinite(usage)
    || usage < 0
    || typeof quota !== "number"
    || !Number.isFinite(quota)
    || quota <= 0
  ) {
    return Object.freeze({
      status: "unknown",
      usageBytes: null,
      quotaBytes: null,
      usageRatio: null,
      remainingMb: null,
    });
  }

  const usageRatio = Math.min(1, Math.round((usage / quota) * 10_000) / 10_000);
  const remainingBytes = Math.max(0, quota - usage);
  const remainingMb = Math.round((remainingBytes / (1024 * 1024)) * 100) / 100;
  const status: StudioStorageQuotaStatus =
    usageRatio >= STUDIO_STORAGE_QUOTA_CRITICAL_RATIO
      ? "critical"
      : usageRatio >= STUDIO_STORAGE_QUOTA_WARN_RATIO
        ? "warning"
        : "ok";

  return Object.freeze({
    status,
    usageBytes: Math.trunc(usage),
    quotaBytes: Math.trunc(quota),
    usageRatio,
    remainingMb,
  });
}

/**
 * IndexedDB/OPFS 스토리지 할당량 포화 위험을 안전하게 조회한다.
 * 임베디드 웹뷰나 사생활 보호 모드에서 `navigator.storage.estimate`가 거부되어도 예외를 던지지 않는다.
 */
export async function probeStudioStorageQuota(
  estimateFn?: () => Promise<{ readonly usage?: number; readonly quota?: number }>,
): Promise<StudioStorageQuotaSnapshot> {
  try {
    const fn =
      estimateFn
      ?? (typeof navigator !== "undefined" && typeof navigator.storage?.estimate === "function"
        ? () => navigator.storage.estimate()
        : null);
    if (!fn) return evaluateStudioStorageQuota({});
    const estimate = await fn();
    return evaluateStudioStorageQuota({
      usageBytes: estimate.usage,
      quotaBytes: estimate.quota,
    });
  } catch {
    return evaluateStudioStorageQuota({});
  }
}

export interface StudioLiveHeartbeatTickResult {
  readonly throttled: boolean;
  readonly jitterMs: number;
  readonly consecutiveThrottledTicks: number;
  readonly recommendedAction: "none" | "resync-presence";
}

/**
 * 백그라운드 탭 타이머 스로틀링(예: 1분 이상 지연)과 OS NTP 역행 클럭 점프를 구분해
 * 프레즌스 재동기화 시점을 판정하는 하트비트 지터 가드.
 */
export class StudioLiveHeartbeatJitterGuard {
  private readonly expectedIntervalMs: number;
  private readonly throttleThresholdMs: number;
  private lastTickAt: number | null = null;
  private consecutiveThrottled = 0;

  constructor(options?: {
    readonly expectedIntervalMs?: number;
    readonly throttleThresholdMs?: number;
  }) {
    this.expectedIntervalMs = Math.max(
      1_000,
      Math.trunc(options?.expectedIntervalMs ?? STUDIO_HEARTBEAT_EXPECTED_INTERVAL_MS),
    );
    this.throttleThresholdMs = Math.max(
      this.expectedIntervalMs,
      Math.trunc(options?.throttleThresholdMs ?? STUDIO_HEARTBEAT_THROTTLE_THRESHOLD_MS),
    );
  }

  recordTick(now = Date.now()): StudioLiveHeartbeatTickResult {
    if (this.lastTickAt === null) {
      this.lastTickAt = now;
      return Object.freeze({
        throttled: false,
        jitterMs: 0,
        consecutiveThrottledTicks: 0,
        recommendedAction: "none",
      });
    }

    // NTP 역행 클럭 점프는 스로틀링으로 오판하지 않고 기준 시각만 보정한다.
    if (now < this.lastTickAt) {
      this.lastTickAt = now;
      this.consecutiveThrottled = 0;
      return Object.freeze({
        throttled: false,
        jitterMs: 0,
        consecutiveThrottledTicks: 0,
        recommendedAction: "none",
      });
    }

    const elapsedMs = now - this.lastTickAt;
    this.lastTickAt = now;
    const jitterMs = Math.max(0, elapsedMs - this.expectedIntervalMs);
    const throttled = elapsedMs >= this.throttleThresholdMs;
    this.consecutiveThrottled = throttled ? this.consecutiveThrottled + 1 : 0;

    return Object.freeze({
      throttled,
      jitterMs,
      consecutiveThrottledTicks: this.consecutiveThrottled,
      recommendedAction: throttled ? "resync-presence" : "none",
    });
  }

  reset(): void {
    this.lastTickAt = null;
    this.consecutiveThrottled = 0;
  }
}

export interface StudioLiveLongSessionDiagnosticsInput {
  readonly activeInkStrokes: number;
  readonly settledStrokeCount?: number;
  readonly undoHistoryDepth?: number;
  readonly outboxQueueSize?: number;
  readonly p2pRelayFallbackPeers?: number;
  readonly recovering?: boolean;
  readonly autoDegradedTrails?: boolean;
  readonly storageQuotaStatus?: StudioStorageQuotaStatus;
  readonly now?: () => number;
  readonly heapUsedMb?: number | null;
}

export interface StudioLiveLongSessionDiagnostics {
  readonly capturedAt: number;
  readonly status: StudioLiveLongSessionHealth;
  readonly activeInkStrokes: number;
  readonly settledStrokeCount: number;
  readonly undoHistoryDepth: number;
  readonly outboxQueueSize: number;
  readonly p2pRelayFallbackPeers: number;
  readonly autoDegradedTrails: boolean;
  readonly storageQuotaStatus: StudioStorageQuotaStatus;
  readonly heapUsedMb: number | null;
}

function readBrowserHeapUsedMb(): number | null {
  const perf = globalThis.performance as (Performance & {
    memory?: { readonly usedJSHeapSize?: number };
  }) | undefined;
  const bytes = perf?.memory?.usedJSHeapSize;
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return null;
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

function nonNegativeInt(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.trunc(value);
}

/** 장시간 협업 안정성 지표를 수집하고 현재 세션 건강 상태를 판정한다. */
export function collectStudioLiveLongSessionDiagnostics(
  input: StudioLiveLongSessionDiagnosticsInput,
): StudioLiveLongSessionDiagnostics {
  const activeInkStrokes = nonNegativeInt(input.activeInkStrokes);
  const settledStrokeCount = nonNegativeInt(input.settledStrokeCount);
  const undoHistoryDepth = nonNegativeInt(input.undoHistoryDepth);
  const outboxQueueSize = nonNegativeInt(input.outboxQueueSize);
  const p2pRelayFallbackPeers = nonNegativeInt(input.p2pRelayFallbackPeers);
  const autoDegradedTrails = Boolean(input.autoDegradedTrails);
  const storageQuotaStatus: StudioStorageQuotaStatus = input.storageQuotaStatus ?? "unknown";
  const heapUsedMb = input.heapUsedMb !== undefined ? input.heapUsedMb : readBrowserHeapUsedMb();
  const capturedAt = input.now ? input.now() : Date.now();

  let status: StudioLiveLongSessionHealth = "healthy";
  if (input.recovering) {
    status = "recovering";
  } else if (
    outboxQueueSize > 32
    || activeInkStrokes >= 8
    || storageQuotaStatus === "critical"
    || (heapUsedMb !== null && heapUsedMb > 768)
  ) {
    status = "degraded";
  }

  return Object.freeze({
    capturedAt,
    status,
    activeInkStrokes,
    settledStrokeCount,
    undoHistoryDepth,
    outboxQueueSize,
    p2pRelayFallbackPeers,
    autoDegradedTrails,
    storageQuotaStatus,
    heapUsedMb,
  });
}

/** 1클릭 클립보드 복사·버그 리포트 첨부용 정규화 JSON 문자열을 생성한다. */
export function serializeStudioLiveDiagnosticsJson(
  snapshot: StudioLiveLongSessionDiagnostics,
): string {
  return JSON.stringify(snapshot, null, 2);
}

export interface StudioAdaptiveSaveSchedulerOptions {
  /** 로컬 포인터 입력이 멈춘 뒤 자동 저장을 실행하기까지의 유휴 대기 시간(ms). */
  readonly idleDelayMs?: number;
  /** 연속 드로잉 중에도 내구성을 보장하기 위해 저장을 강제하는 최대 지연 상한(ms). */
  readonly maxWaitMs?: number;
  readonly onSave: () => void | Promise<void>;
  readonly now?: () => number;
  readonly setTimeout?: (fn: () => void, delayMs: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
}

/**
 * 다중 협업 마감 구간에서 로컬 드로잉 입력 중 저장 배리어 경합을 피하면서도
 * 최대 대기 상한(maxWaitMs) 내에는 반드시 저장을 실행하는 적응형 자동 저장 스케줄러.
 */
export class StudioAdaptiveSaveScheduler {
  private readonly idleDelayMs: number;
  private readonly maxWaitMs: number;
  private readonly onSave: () => void | Promise<void>;
  private readonly now: () => number;
  private readonly scheduleTimer: (fn: () => void, delayMs: number) => unknown;
  private readonly cancelTimer: (handle: unknown) => void;

  private localInputActive = false;
  private dirty = false;
  private firstDirtyAt: number | null = null;
  private idleTimer: unknown = null;
  private maxWaitTimer: unknown = null;
  private disposed = false;

  constructor(options: StudioAdaptiveSaveSchedulerOptions) {
    this.idleDelayMs = Math.max(100, Math.trunc(options.idleDelayMs ?? 1_500));
    this.maxWaitMs = Math.max(this.idleDelayMs, Math.trunc(options.maxWaitMs ?? 12_000));
    this.onSave = options.onSave;
    this.now = options.now ?? (() => Date.now());
    this.scheduleTimer = options.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.cancelTimer = options.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  get hasPendingSave(): boolean {
    return this.dirty;
  }

  markDirty(): void {
    if (this.disposed) return;
    const now = this.now();
    this.dirty = true;
    if (this.firstDirtyAt === null) {
      this.firstDirtyAt = now;
      this.maxWaitTimer = this.scheduleTimer(() => {
        this.maxWaitTimer = null;
        this.flushNow();
      }, this.maxWaitMs);
    }
    if (!this.localInputActive) {
      this.armIdleTimer();
    }
  }

  markLocalInputActive(active: boolean): void {
    if (this.disposed || this.localInputActive === active) return;
    this.localInputActive = active;
    if (active) {
      this.clearIdleTimer();
      return;
    }
    if (!this.dirty) return;
    const elapsed = this.firstDirtyAt !== null ? this.now() - this.firstDirtyAt : 0;
    if (elapsed >= this.maxWaitMs) {
      this.flushNow();
    } else {
      this.armIdleTimer();
    }
  }

  flushNow(): void {
    if (this.disposed || !this.dirty) return;
    this.dirty = false;
    this.firstDirtyAt = null;
    this.clearIdleTimer();
    this.clearMaxWaitTimer();
    void this.onSave();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.dirty = false;
    this.firstDirtyAt = null;
    this.clearIdleTimer();
    this.clearMaxWaitTimer();
  }

  private armIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = this.scheduleTimer(() => {
      this.idleTimer = null;
      if (!this.localInputActive) this.flushNow();
    }, this.idleDelayMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer === null) return;
    this.cancelTimer(this.idleTimer);
    this.idleTimer = null;
  }

  private clearMaxWaitTimer(): void {
    if (this.maxWaitTimer === null) return;
    this.cancelTimer(this.maxWaitTimer);
    this.maxWaitTimer = null;
  }
}

export const STUDIO_IDLE_SOFT_RECYCLE_DELAY_MS = 30_000;

export interface StudioIdleSoftRecycleOptions {
  /** 로컬 드로잉이 멈춘 뒤 비파괴 캐시·오프스크린 버퍼 정리를 실행할 유휴 대기 시간(ms). */
  readonly idleDelayMs?: number;
  readonly onRecycle: () => void;
  readonly setTimeout?: (fn: () => void, delayMs: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
}

/**
 * 3시간 이상 연속 작업 중 자연스러운 휴지 구간(기본 30초)마다
 * 비파괴 오프스크린 버퍼·임시 캐시를 소프트 리사이클해 힙/VRAM 파편화를 줄이는 스케줄러.
 */
export class StudioIdleSoftRecycleScheduler {
  private readonly idleDelayMs: number;
  private readonly onRecycle: () => void;
  private readonly scheduleTimer: (fn: () => void, delayMs: number) => unknown;
  private readonly cancelTimer: (handle: unknown) => void;
  private timer: unknown = null;
  private disposed = false;

  constructor(options: StudioIdleSoftRecycleOptions) {
    this.idleDelayMs = Math.max(1_000, Math.trunc(options.idleDelayMs ?? STUDIO_IDLE_SOFT_RECYCLE_DELAY_MS));
    this.onRecycle = options.onRecycle;
    this.scheduleTimer = options.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.cancelTimer = options.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  noteActivity(): void {
    if (this.disposed) return;
    this.clearTimer();
    this.timer = this.scheduleTimer(() => {
      this.timer = null;
      if (!this.disposed) this.onRecycle();
    }, this.idleDelayMs);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    this.cancelTimer(this.timer);
    this.timer = null;
  }
}
