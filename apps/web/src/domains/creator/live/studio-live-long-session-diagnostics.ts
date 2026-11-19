/**
 * Long-session collaborative drawing diagnostics & adaptive save scheduler.
 *
 * Provides:
 * 1. One-click 6-metric runtime diagnostics snapshot + JSON serializer for field triage.
 * 2. Adaptive autosave scheduler that defers save barriers while local pointer input is active
 *    and executes during brief idle windows under a strict durability max-wait ceiling.
 */

export type StudioLiveLongSessionHealth = "healthy" | "degraded" | "recovering";

export interface StudioLiveLongSessionDiagnosticsInput {
  readonly activeInkStrokes: number;
  readonly settledStrokeCount?: number;
  readonly undoHistoryDepth?: number;
  readonly outboxQueueSize?: number;
  readonly p2pRelayFallbackPeers?: number;
  readonly recovering?: boolean;
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

/** 6대 장시간 협업 안정성 지표를 수집하고 현재 세션 건강 상태를 판정한다. */
export function collectStudioLiveLongSessionDiagnostics(
  input: StudioLiveLongSessionDiagnosticsInput,
): StudioLiveLongSessionDiagnostics {
  const activeInkStrokes = nonNegativeInt(input.activeInkStrokes);
  const settledStrokeCount = nonNegativeInt(input.settledStrokeCount);
  const undoHistoryDepth = nonNegativeInt(input.undoHistoryDepth);
  const outboxQueueSize = nonNegativeInt(input.outboxQueueSize);
  const p2pRelayFallbackPeers = nonNegativeInt(input.p2pRelayFallbackPeers);
  const heapUsedMb = input.heapUsedMb !== undefined ? input.heapUsedMb : readBrowserHeapUsedMb();
  const capturedAt = input.now ? input.now() : Date.now();

  let status: StudioLiveLongSessionHealth = "healthy";
  if (input.recovering) {
    status = "recovering";
  } else if (
    outboxQueueSize > 32
    || activeInkStrokes >= 8
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
