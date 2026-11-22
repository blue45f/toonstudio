/**
 * 가변 프레임 버제팅(Dynamic Resolution Scaling) & 메모리 압력 단계별 LRU 타일 회수 스케줄러.
 *
 * - 프레임 시간(EMA ms)과 메모리 압력(nominal/moderate/critical)에 따라 고속 패닝·줌 중
 *   렌더 해상도 스케일을 단계적으로 완화(1.0 → 0.85 → 0.75 → 0.625 → 0.5)해 60/120fps를 사수한다.
 * - 사용자 조작이 멈추는 즉시(`isInteracting === false` 또는 `markInteractionStopped()`)
 *   지연 없이 1.0x 정해상도로 복귀한다.
 * - 화면 밖(off-screen) 타일은 LRU 순서로 단계 회수하며, 현재 뷰포트(+프리페치 마진)와
 *   고정(pinned) 타일은 보호해 패닝 중 깜빡임을 막는다.
 */

export type GpuMemoryPressureLevel = "nominal" | "moderate" | "critical";

export type FrameInteractionMode = "idle" | "panning" | "zooming" | "painting";

export interface AdaptiveFrameBudgetOptions {
  /** 목표 프레임 시간(ms). 60Hz=16.67, 120Hz=8.33(기본 16.67ms). */
  readonly targetFrameMs?: number;
  /** EMA 평활 계수 (0 < alpha <= 1, 기본 0.25). */
  readonly emaAlpha?: number;
  /** 스케일 단계 목록(내림차순, 첫 원소 1.0). */
  readonly scaleLadder?: readonly number[];
  /** 스케일 하향 전 연속 과부하 프레임 수(히스테리시스, 기본 2). */
  readonly degradeConsecutiveFrames?: number;
  /** 조작 중 스케일 상향 전 연속 여유 프레임 수(히스테리시스, 기본 6). */
  readonly recoverConsecutiveFrames?: number;
}

export interface FrameBudgetSampleInput {
  readonly frameDurationMs: number;
  readonly interactionMode: FrameInteractionMode;
  readonly memoryPressure?: GpuMemoryPressureLevel;
}

export interface AdaptiveFrameBudgetDecision {
  readonly resolutionScale: number;
  readonly emaFrameMs: number;
  readonly targetFrameMs: number;
  readonly interactionMode: FrameInteractionMode;
  readonly memoryPressure: GpuMemoryPressureLevel;
  readonly degraded: boolean;
  readonly snappedBackToFull: boolean;
  readonly reason:
    | "idle-full-res"
    | "snap-back-on-stop"
    | "frame-time-degrade"
    | "memory-pressure-degrade"
    | "gradual-recover"
    | "steady";
}

export interface AdaptiveFrameBudgetSnapshot {
  readonly currentScale: number;
  readonly emaFrameMs: number;
  readonly targetFrameMs: number;
  readonly sampleCount: number;
  readonly slowFrameCount: number;
  readonly slowFrameRatio: number;
  readonly degradeCount: number;
  readonly immediateSnapBackCount: number;
  readonly lastInteractionMode: FrameInteractionMode;
  readonly lastMemoryPressure: GpuMemoryPressureLevel;
}

const DEFAULT_SCALE_LADDER: readonly number[] = Object.freeze([1.0, 0.85, 0.75, 0.625, 0.5]);

function normalizeScaleLadder(ladder?: readonly number[]): readonly number[] {
  if (!ladder || ladder.length === 0) return DEFAULT_SCALE_LADDER;
  const filtered = ladder
    .filter((value) => Number.isFinite(value) && value >= 0.25 && value <= 1.0)
    .sort((left, right) => right - left);
  if (filtered.length === 0) return DEFAULT_SCALE_LADDER;
  if (filtered[0] !== 1.0) filtered.unshift(1.0);
  return Object.freeze([...new Set(filtered)]);
}

function isDynamicScaleEligible(mode: FrameInteractionMode): boolean {
  return mode === "panning" || mode === "zooming";
}

export class AdaptiveFrameBudgetController {
  private readonly targetFrameMs: number;
  private readonly emaAlpha: number;
  private readonly scaleLadder: readonly number[];
  private readonly degradeConsecutiveFrames: number;
  private readonly recoverConsecutiveFrames: number;

  private scaleIndex = 0;
  private emaFrameMs = 0;
  private sampleCount = 0;
  private slowFrameCount = 0;
  private consecutiveOverBudget = 0;
  private consecutiveUnderBudget = 0;
  private degradeCount = 0;
  private immediateSnapBackCount = 0;
  private lastInteractionMode: FrameInteractionMode = "idle";
  private lastMemoryPressure: GpuMemoryPressureLevel = "nominal";

  constructor(options: AdaptiveFrameBudgetOptions = {}) {
    this.targetFrameMs =
      options.targetFrameMs !== undefined && Number.isFinite(options.targetFrameMs) && options.targetFrameMs > 1
        ? options.targetFrameMs
        : 1000 / 60;
    this.emaAlpha =
      options.emaAlpha !== undefined && Number.isFinite(options.emaAlpha) && options.emaAlpha > 0 && options.emaAlpha <= 1
        ? options.emaAlpha
        : 0.25;
    this.scaleLadder = normalizeScaleLadder(options.scaleLadder);
    this.degradeConsecutiveFrames = Math.max(1, Math.floor(options.degradeConsecutiveFrames ?? 2));
    this.recoverConsecutiveFrames = Math.max(1, Math.floor(options.recoverConsecutiveFrames ?? 6));
  }

  /** 프레임 시간과 조작 상태·메모리 압력을 반영해 현재 프레임 해상도 스케일을 결정한다. */
  recordFrame(input: FrameBudgetSampleInput): AdaptiveFrameBudgetDecision {
    const pressure: GpuMemoryPressureLevel = input.memoryPressure ?? "nominal";
    const mode = input.interactionMode;
    this.lastMemoryPressure = pressure;

    const validDuration =
      Number.isFinite(input.frameDurationMs) && input.frameDurationMs > 0 && input.frameDurationMs <= 1000;

    if (validDuration) {
      this.sampleCount += 1;
      if (this.sampleCount === 1) {
        this.emaFrameMs = input.frameDurationMs;
      } else {
        this.emaFrameMs =
          this.emaAlpha * input.frameDurationMs + (1 - this.emaAlpha) * this.emaFrameMs;
      }
      if (input.frameDurationMs > this.targetFrameMs * 1.08) {
        this.slowFrameCount += 1;
      }
    }

    const wasDegraded = this.scaleIndex > 0;
    this.lastInteractionMode = mode;

    // 고속 패닝·줌이 멈추거나 정밀 페인팅/유휴 상태가 되면 즉시 1.0x 정해상도로 복귀한다.
    if (!isDynamicScaleEligible(mode)) {
      this.consecutiveOverBudget = 0;
      this.consecutiveUnderBudget = 0;
      if (wasDegraded) {
        this.scaleIndex = 0;
        this.immediateSnapBackCount += 1;
        return this.makeDecision(mode, pressure, true, "snap-back-on-stop");
      }
      return this.makeDecision(mode, pressure, false, "idle-full-res");
    }

    // 고속 패닝/줌 중 메모리 압력이 critical이면 즉시 안전 하향 단계로 완화한다.
    if (pressure === "critical") {
      const targetIndex = Math.min(this.scaleLadder.length - 1, Math.max(this.scaleIndex + 1, 2));
      if (targetIndex > this.scaleIndex) {
        this.scaleIndex = targetIndex;
        this.degradeCount += 1;
        this.consecutiveOverBudget = 0;
        this.consecutiveUnderBudget = 0;
        return this.makeDecision(mode, pressure, false, "memory-pressure-degrade");
      }
      return this.makeDecision(mode, pressure, false, "steady");
    }

    // 과부하 판정: moderate 압력일 때는 프레임 임계치를 더 민감하게 적용한다.
    const degradeThresholdMs =
      pressure === "moderate" ? this.targetFrameMs * 0.95 : this.targetFrameMs * 1.12;
    const recoverThresholdMs = this.targetFrameMs * 0.78;

    if (this.emaFrameMs > degradeThresholdMs) {
      this.consecutiveOverBudget += 1;
      this.consecutiveUnderBudget = 0;
      if (
        this.consecutiveOverBudget >= this.degradeConsecutiveFrames &&
        this.scaleIndex < this.scaleLadder.length - 1
      ) {
        this.scaleIndex += 1;
        this.degradeCount += 1;
        this.consecutiveOverBudget = 0;
        return this.makeDecision(
          mode,
          pressure,
          false,
          pressure === "moderate" ? "memory-pressure-degrade" : "frame-time-degrade",
        );
      }
    } else if (this.emaFrameMs > 0 && this.emaFrameMs < recoverThresholdMs && pressure === "nominal") {
      this.consecutiveUnderBudget += 1;
      this.consecutiveOverBudget = 0;
      if (this.consecutiveUnderBudget >= this.recoverConsecutiveFrames && this.scaleIndex > 0) {
        this.scaleIndex -= 1;
        this.consecutiveUnderBudget = 0;
        return this.makeDecision(mode, pressure, false, "gradual-recover");
      }
    } else {
      this.consecutiveOverBudget = 0;
      this.consecutiveUnderBudget = 0;
    }

    return this.makeDecision(mode, pressure, false, "steady");
  }

  /** 패닝/줌 종료 이벤트 시 다음 프레임 대기 없이 즉시 1.0x 해상도로 복귀한다. */
  markInteractionStopped(): AdaptiveFrameBudgetDecision {
    this.consecutiveOverBudget = 0;
    this.consecutiveUnderBudget = 0;
    this.lastInteractionMode = "idle";
    if (this.scaleIndex > 0) {
      this.scaleIndex = 0;
      this.immediateSnapBackCount += 1;
      return this.makeDecision("idle", this.lastMemoryPressure, true, "snap-back-on-stop");
    }
    return this.makeDecision("idle", this.lastMemoryPressure, false, "idle-full-res");
  }

  getSnapshot(): AdaptiveFrameBudgetSnapshot {
    const currentScale = this.scaleLadder[this.scaleIndex] ?? 1.0;
    return Object.freeze({
      currentScale,
      emaFrameMs: this.emaFrameMs,
      targetFrameMs: this.targetFrameMs,
      sampleCount: this.sampleCount,
      slowFrameCount: this.slowFrameCount,
      slowFrameRatio: this.sampleCount > 0 ? this.slowFrameCount / this.sampleCount : 0,
      degradeCount: this.degradeCount,
      immediateSnapBackCount: this.immediateSnapBackCount,
      lastInteractionMode: this.lastInteractionMode,
      lastMemoryPressure: this.lastMemoryPressure,
    });
  }

  private makeDecision(
    mode: FrameInteractionMode,
    pressure: GpuMemoryPressureLevel,
    snappedBackToFull: boolean,
    reason: AdaptiveFrameBudgetDecision["reason"],
  ): AdaptiveFrameBudgetDecision {
    const resolutionScale = this.scaleLadder[this.scaleIndex] ?? 1.0;
    return Object.freeze({
      resolutionScale,
      emaFrameMs: this.emaFrameMs,
      targetFrameMs: this.targetFrameMs,
      interactionMode: mode,
      memoryPressure: pressure,
      degraded: resolutionScale < 1.0,
      snappedBackToFull,
      reason,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* 화면 밖(off-screen) 메모리 압력 단계별 LRU 타일 회수 스케줄러                  */
/* -------------------------------------------------------------------------- */

export interface TileBounds2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface ResidentTileRegistration {
  readonly tileId: string;
  readonly byteSize: number;
  readonly bounds: TileBounds2D;
  readonly pinned?: boolean;
  readonly onEvict?: (tileId: string) => void;
}

export interface LruTileEvictionOptions {
  /** 타일 VRAM/캐시 총 상한 바이트(기본 128 MiB). */
  readonly memoryBudgetBytes?: number;
  /** moderate 압력 시작 비율(기본 0.75). */
  readonly moderatePressureRatio?: number;
  /** critical 압력 시작 비율(기본 0.90). */
  readonly criticalPressureRatio?: number;
  /** 회수 후 목표 점유율(기본 0.68). */
  readonly targetAfterEvictRatio?: number;
  /** moderate 단계에서 프레임당 최대 회수 타일 수(기본 6 — 파괴 스파이크 방지). */
  readonly maxModerateEvictionsPerFrame?: number;
  /** 뷰포트 바깥 프리페치 보호 마진(px, 기본 256). */
  readonly prefetchMarginPx?: number;
}

export interface LruTileEvictionPlanResult {
  readonly pressure: GpuMemoryPressureLevel;
  readonly evictedTileIds: readonly string[];
  readonly freedBytes: number;
  readonly remainingResidentBytes: number;
  readonly residentTileCount: number;
  readonly protectedVisibleCount: number;
}

export interface LruTileSchedulerSnapshot {
  readonly residentTileCount: number;
  readonly residentBytes: number;
  readonly memoryBudgetBytes: number;
  readonly usageRatio: number;
  readonly pressure: GpuMemoryPressureLevel;
  readonly totalEvictedTiles: number;
  readonly totalFreedBytes: number;
}

interface ResidentTileRecord {
  readonly tileId: string;
  byteSize: number;
  bounds: TileBounds2D;
  pinned: boolean;
  lastAccessTick: number;
  evicted: boolean;
  onEvict?: (tileId: string) => void;
}

function rectsIntersect(a: TileBounds2D, b: TileBounds2D): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function tileDistanceSqToViewportCenter(tile: TileBounds2D, viewport: TileBounds2D): number {
  const tx = (tile.minX + tile.maxX) * 0.5;
  const ty = (tile.minY + tile.maxY) * 0.5;
  const vx = (viewport.minX + viewport.maxX) * 0.5;
  const vy = (viewport.minY + viewport.maxY) * 0.5;
  const dx = tx - vx;
  const dy = ty - vy;
  return dx * dx + dy * dy;
}

export class LruTileResidencyEvictionScheduler {
  private readonly memoryBudgetBytes: number;
  private readonly moderatePressureRatio: number;
  private readonly criticalPressureRatio: number;
  private readonly targetAfterEvictRatio: number;
  private readonly maxModerateEvictionsPerFrame: number;
  private readonly prefetchMarginPx: number;

  private readonly tiles = new Map<string, ResidentTileRecord>();
  private accessTick = 0;
  private residentBytes = 0;
  private totalEvictedTiles = 0;
  private totalFreedBytes = 0;

  constructor(options: LruTileEvictionOptions = {}) {
    this.memoryBudgetBytes = Math.max(
      256,
      Math.floor(options.memoryBudgetBytes ?? 128 * 1024 * 1024),
    );
    this.moderatePressureRatio = Math.min(0.95, Math.max(0.2, options.moderatePressureRatio ?? 0.75));
    this.criticalPressureRatio = Math.min(
      0.99,
      Math.max(this.moderatePressureRatio + 0.05, options.criticalPressureRatio ?? 0.9),
    );
    this.targetAfterEvictRatio = Math.min(
      this.moderatePressureRatio,
      Math.max(0.1, options.targetAfterEvictRatio ?? 0.68),
    );
    this.maxModerateEvictionsPerFrame = Math.max(
      1,
      Math.floor(options.maxModerateEvictionsPerFrame ?? 6),
    );
    this.prefetchMarginPx = Math.max(0, options.prefetchMarginPx ?? 256);
  }

  /** 타일을 상주 목록에 등록하거나 갱신하고 최근 사용 시각을 기록한다. */
  touchTile(registration: ResidentTileRegistration): void {
    const safeBytes = Math.max(0, Math.floor(registration.byteSize));
    this.accessTick += 1;
    const existing = this.tiles.get(registration.tileId);
    if (existing) {
      this.residentBytes += safeBytes - existing.byteSize;
      existing.byteSize = safeBytes;
      existing.bounds = registration.bounds;
      existing.pinned = registration.pinned ?? existing.pinned;
      existing.lastAccessTick = this.accessTick;
      if (registration.onEvict) {
        existing.onEvict = registration.onEvict;
      }
      return;
    }

    this.tiles.set(registration.tileId, {
      tileId: registration.tileId,
      byteSize: safeBytes,
      bounds: registration.bounds,
      pinned: registration.pinned ?? false,
      lastAccessTick: this.accessTick,
      evicted: false,
      onEvict: registration.onEvict,
    });
    this.residentBytes += safeBytes;
  }

  setTilePinned(tileId: string, pinned: boolean): boolean {
    const record = this.tiles.get(tileId);
    if (!record) return false;
    record.pinned = pinned;
    return true;
  }

  hasTile(tileId: string): boolean {
    return this.tiles.has(tileId);
  }

  classifyPressure(overridePressure?: GpuMemoryPressureLevel): GpuMemoryPressureLevel {
    if (overridePressure === "critical") return "critical";
    const ratio = this.residentBytes / this.memoryBudgetBytes;
    if (ratio >= this.criticalPressureRatio) return "critical";
    if (overridePressure === "moderate" || ratio >= this.moderatePressureRatio) {
      return "moderate";
    }
    return "nominal";
  }

  /**
   * 현재 뷰포트(+프리페치 마진)와 메모리 압력 단계에 따라 화면 밖 LRU 타일을 단계 회수한다.
   * 가시 타일과 `pinned` 타일은 절대 회수하지 않는다.
   */
  evictOffscreenTiles(
    viewport: TileBounds2D,
    overridePressure?: GpuMemoryPressureLevel,
  ): LruTileEvictionPlanResult {
    const pressure = this.classifyPressure(overridePressure);
    const expandedViewport: TileBounds2D = {
      minX: viewport.minX - this.prefetchMarginPx,
      minY: viewport.minY - this.prefetchMarginPx,
      maxX: viewport.maxX + this.prefetchMarginPx,
      maxY: viewport.maxY + this.prefetchMarginPx,
    };

    const offscreenCandidates: ResidentTileRecord[] = [];
    let protectedVisibleCount = 0;

    for (const record of this.tiles.values()) {
      if (record.pinned || rectsIntersect(record.bounds, expandedViewport)) {
        protectedVisibleCount += 1;
      } else {
        offscreenCandidates.push(record);
      }
    }

    if (pressure === "nominal" || offscreenCandidates.length === 0) {
      return Object.freeze({
        pressure,
        evictedTileIds: Object.freeze([]),
        freedBytes: 0,
        remainingResidentBytes: this.residentBytes,
        residentTileCount: this.tiles.size,
        protectedVisibleCount,
      });
    }

    // 가장 오래 미사용된 타일 우선, 동일 틱이면 뷰포트에서 더 먼 타일부터 회수한다.
    offscreenCandidates.sort((left, right) => {
      if (left.lastAccessTick !== right.lastAccessTick) {
        return left.lastAccessTick - right.lastAccessTick;
      }
      return (
        tileDistanceSqToViewportCenter(right.bounds, viewport) -
        tileDistanceSqToViewportCenter(left.bounds, viewport)
      );
    });

    const targetBytes = Math.floor(this.memoryBudgetBytes * this.targetAfterEvictRatio);
    const maxCount =
      pressure === "critical" ? offscreenCandidates.length : this.maxModerateEvictionsPerFrame;

    const evictedTileIds: string[] = [];
    let freedBytes = 0;

    for (const candidate of offscreenCandidates) {
      if (evictedTileIds.length >= maxCount) break;
      if (this.residentBytes <= targetBytes && overridePressure === undefined) break;

      this.evictRecord(candidate);
      evictedTileIds.push(candidate.tileId);
      freedBytes += candidate.byteSize;
    }

    return Object.freeze({
      pressure: this.classifyPressure(),
      evictedTileIds: Object.freeze(evictedTileIds),
      freedBytes,
      remainingResidentBytes: this.residentBytes,
      residentTileCount: this.tiles.size,
      protectedVisibleCount,
    });
  }

  /** 모든 상주 타일의 회수 콜백을 정확히 1회씩 호출하고 상태를 비운다. */
  dispose(): void {
    for (const record of [...this.tiles.values()]) {
      this.evictRecord(record);
    }
    this.tiles.clear();
    this.residentBytes = 0;
  }

  getSnapshot(): LruTileSchedulerSnapshot {
    return Object.freeze({
      residentTileCount: this.tiles.size,
      residentBytes: this.residentBytes,
      memoryBudgetBytes: this.memoryBudgetBytes,
      usageRatio: this.residentBytes / this.memoryBudgetBytes,
      pressure: this.classifyPressure(),
      totalEvictedTiles: this.totalEvictedTiles,
      totalFreedBytes: this.totalFreedBytes,
    });
  }

  private evictRecord(record: ResidentTileRecord): void {
    if (record.evicted) return;
    record.evicted = true;
    this.tiles.delete(record.tileId);
    this.residentBytes = Math.max(0, this.residentBytes - record.byteSize);
    this.totalEvictedTiles += 1;
    this.totalFreedBytes += record.byteSize;
    try {
      record.onEvict?.(record.tileId);
    } catch {
      // 개별 타일 해제 오류가 전체 회수 루프를 중단시키지 않도록 격리한다.
    }
  }
}
