/**
 * 장시간 스튜디오 작업 메모리 누수 방지 프로파일러 가드.
 *
 * 브라우저 외부 메모리(Blob ObjectURL · OffscreenCanvas/임시 Canvas · ImageBitmap)는
 * JS GC만으로 즉시 회수되지 않아 장시간 드로잉·에셋 미리보기·대형 익스포트 반복 시
 * OOM/탭 크래시의 주원인이 된다.
 *
 * 이 모듈은 외부 유료 서비스 없이 100% 로컬 메모리 내에서 리소스 생존 시간과 누적 추정
 * 바이트를 추적하고, 임계치 초과 시 경고를 반환하거나 고정되지 않은(unpinned) 만료·초과
 * 리소스를 안전하게 자동 정리한다.
 */

export type StudioTrackedResourceKind =
  | "object-url"
  | "offscreen-canvas"
  | "image-bitmap";

export type StudioResourceLeakStatus = "ok" | "warning" | "critical";

export type StudioResourceLeakWarningCode =
  | "stale-resource"
  | "byte-budget-warning"
  | "byte-budget-critical"
  | "count-threshold-exceeded";

export interface StudioOffscreenCanvasLike {
  width: number;
  height: number;
}

export interface StudioImageBitmapLike {
  readonly width: number;
  readonly height: number;
  close(): void;
}

export interface StudioResourceTrackOptions {
  readonly owner: string;
  readonly label?: string;
  readonly estimatedBytes?: number;
  readonly maxLifetimeMs?: number;
  /** true이면 자동 회수 대상에서 제외하고 임계치 초과 시 경고만 보고한다. */
  readonly pinned?: boolean;
  readonly onDispose?: () => void;
}

export interface StudioTrackedResourceSnapshot {
  readonly id: string;
  readonly kind: StudioTrackedResourceKind;
  readonly owner: string;
  readonly label: string;
  readonly estimatedBytes: number;
  readonly createdAtMs: number;
  readonly lastTouchedAtMs: number;
  readonly ageMs: number;
  readonly maxLifetimeMs: number;
  readonly pinned: boolean;
  readonly stale: boolean;
}

export interface StudioResourceKindSummary {
  readonly count: number;
  readonly estimatedBytes: number;
  readonly staleCount: number;
}

export interface StudioResourceLeakWarning {
  readonly code: StudioResourceLeakWarningCode;
  readonly severity: "warning" | "critical";
  readonly messageKo: string;
  readonly affectedIds: readonly string[];
}

export interface StudioResourceLeakReport {
  readonly capturedAtMs: number;
  readonly status: StudioResourceLeakStatus;
  readonly activeCount: number;
  readonly totalEstimatedBytes: number;
  readonly peakEstimatedBytes: number;
  readonly totalCreatedCount: number;
  readonly totalReleasedCount: number;
  readonly totalAutoReclaimedCount: number;
  readonly byKind: Readonly<Record<StudioTrackedResourceKind, StudioResourceKindSummary>>;
  readonly staleEntries: readonly StudioTrackedResourceSnapshot[];
  readonly warnings: readonly StudioResourceLeakWarning[];
}

export interface StudioResourceSweepResult {
  readonly sweptAtMs: number;
  readonly reclaimedIds: readonly string[];
  readonly reclaimedBytes: number;
  readonly disposerErrorCount: number;
  readonly report: StudioResourceLeakReport;
}

export interface StudioResourceLeakGuardConfig {
  readonly maxActiveCount?: number;
  readonly warnTotalBytes?: number;
  readonly maxTotalBytes?: number;
  readonly defaultMaxLifetimeMsByKind?: Readonly<Partial<Record<StudioTrackedResourceKind, number>>>;
  /** 등록 시 임계치를 넘기면 비고정(unpinned) 만료·최고령 항목을 즉시 정리한다. */
  readonly autoReclaimOnThreshold?: boolean;
  readonly now?: () => number;
  readonly revokeObjectUrl?: (url: string) => void;
}

export interface StudioScopedResourceTracker {
  readonly owner: string;
  trackObjectUrl(url: string, options?: Omit<StudioResourceTrackOptions, "owner">): string;
  createTrackedObjectUrl(blob: Blob, options?: Omit<StudioResourceTrackOptions, "owner">): {
    readonly id: string;
    readonly url: string;
  } | null;
  trackOffscreenCanvas(
    canvas: StudioOffscreenCanvasLike,
    options?: Omit<StudioResourceTrackOptions, "owner">,
  ): string;
  trackImageBitmap(
    bitmap: StudioImageBitmapLike,
    options?: Omit<StudioResourceTrackOptions, "owner">,
  ): string;
  release(id: string): boolean;
  disposeAll(): number;
}

const MIB = 1024 * 1024;

export const STUDIO_RESOURCE_LEAK_GUARD_DEFAULTS = Object.freeze({
  maxActiveCount: 64,
  warnTotalBytes: 64 * MIB,
  maxTotalBytes: 128 * MIB,
  defaultMaxLifetimeMsByKind: Object.freeze({
    "object-url": 120_000,
    "offscreen-canvas": 45_000,
    "image-bitmap": 60_000,
  } as const),
});

interface TrackedResourceRecord {
  readonly id: string;
  readonly kind: StudioTrackedResourceKind;
  readonly owner: string;
  readonly label: string;
  readonly url: string | null;
  readonly estimatedBytes: number;
  readonly createdAtMs: number;
  lastTouchedAtMs: number;
  readonly maxLifetimeMs: number;
  readonly pinned: boolean;
  readonly dispose: () => void;
}

function clampNonNegativeInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fallback;
  return Math.trunc(value);
}

function clampPositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.trunc(value);
}

function formatMegabytes(bytes: number): string {
  const mb = bytes / MIB;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10}MB`;
}

function estimateSurfaceRgbaBytes(width: number, height: number): number {
  const safeW = clampNonNegativeInt(width, 0);
  const safeH = clampNonNegativeInt(height, 0);
  return safeW * safeH * 4;
}

function defaultRevokeObjectUrl(url: string): void {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
}

export class StudioResourceLeakGuard {
  private readonly maxActiveCount: number;
  private readonly warnTotalBytes: number;
  private readonly maxTotalBytes: number;
  private readonly lifetimeByKind: Readonly<Record<StudioTrackedResourceKind, number>>;
  private readonly autoReclaimOnThreshold: boolean;
  private readonly now: () => number;
  private readonly revokeObjectUrl: (url: string) => void;

  private readonly entries = new Map<string, TrackedResourceRecord>();
  private readonly urlToId = new Map<string, string>();
  private sequence = 0;
  private totalEstimatedBytes = 0;
  private peakEstimatedBytes = 0;
  private totalCreatedCount = 0;
  private totalReleasedCount = 0;
  private totalAutoReclaimedCount = 0;

  constructor(config: StudioResourceLeakGuardConfig = {}) {
    this.maxActiveCount = clampPositiveInt(
      config.maxActiveCount,
      STUDIO_RESOURCE_LEAK_GUARD_DEFAULTS.maxActiveCount,
    );
    const maxBytes = clampPositiveInt(
      config.maxTotalBytes,
      STUDIO_RESOURCE_LEAK_GUARD_DEFAULTS.maxTotalBytes,
    );
    const warnBytes = clampPositiveInt(
      config.warnTotalBytes,
      Math.min(STUDIO_RESOURCE_LEAK_GUARD_DEFAULTS.warnTotalBytes, maxBytes),
    );
    this.maxTotalBytes = maxBytes;
    this.warnTotalBytes = Math.min(warnBytes, maxBytes);
    this.lifetimeByKind = Object.freeze({
      "object-url": clampPositiveInt(
        config.defaultMaxLifetimeMsByKind?.["object-url"],
        STUDIO_RESOURCE_LEAK_GUARD_DEFAULTS.defaultMaxLifetimeMsByKind["object-url"],
      ),
      "offscreen-canvas": clampPositiveInt(
        config.defaultMaxLifetimeMsByKind?.["offscreen-canvas"],
        STUDIO_RESOURCE_LEAK_GUARD_DEFAULTS.defaultMaxLifetimeMsByKind["offscreen-canvas"],
      ),
      "image-bitmap": clampPositiveInt(
        config.defaultMaxLifetimeMsByKind?.["image-bitmap"],
        STUDIO_RESOURCE_LEAK_GUARD_DEFAULTS.defaultMaxLifetimeMsByKind["image-bitmap"],
      ),
    });
    this.autoReclaimOnThreshold = config.autoReclaimOnThreshold ?? true;
    this.now = config.now ?? (() => Date.now());
    this.revokeObjectUrl = config.revokeObjectUrl ?? defaultRevokeObjectUrl;
  }

  trackObjectUrl(url: string, options: StudioResourceTrackOptions): string {
    const existingId = this.urlToId.get(url);
    if (existingId) {
      this.touch(existingId);
      return existingId;
    }
    const dispose = () => {
      options.onDispose?.();
      this.revokeObjectUrl(url);
    };
    const id = this.register({
      kind: "object-url",
      owner: options.owner,
      label: options.label ?? url,
      url,
      estimatedBytes: clampNonNegativeInt(options.estimatedBytes, 0),
      maxLifetimeMs: clampPositiveInt(options.maxLifetimeMs, this.lifetimeByKind["object-url"]),
      pinned: Boolean(options.pinned),
      dispose,
    });
    this.urlToId.set(url, id);
    return id;
  }

  createTrackedObjectUrl(
    blob: Blob,
    options: StudioResourceTrackOptions,
  ): { readonly id: string; readonly url: string } | null {
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      return null;
    }
    try {
      const url = URL.createObjectURL(blob);
      const id = this.trackObjectUrl(url, {
        ...options,
        estimatedBytes: options.estimatedBytes ?? blob.size,
      });
      return Object.freeze({ id, url });
    } catch {
      return null;
    }
  }

  trackOffscreenCanvas(
    canvas: StudioOffscreenCanvasLike,
    options: StudioResourceTrackOptions,
  ): string {
    const estimatedBytes =
      options.estimatedBytes !== undefined
        ? clampNonNegativeInt(options.estimatedBytes, 0)
        : estimateSurfaceRgbaBytes(canvas.width, canvas.height);
    const dispose = () => {
      options.onDispose?.();
      canvas.width = 0;
      canvas.height = 0;
    };
    return this.register({
      kind: "offscreen-canvas",
      owner: options.owner,
      label: options.label ?? `${canvas.width}x${canvas.height} canvas`,
      url: null,
      estimatedBytes,
      maxLifetimeMs: clampPositiveInt(
        options.maxLifetimeMs,
        this.lifetimeByKind["offscreen-canvas"],
      ),
      pinned: Boolean(options.pinned),
      dispose,
    });
  }

  trackImageBitmap(
    bitmap: StudioImageBitmapLike,
    options: StudioResourceTrackOptions,
  ): string {
    const estimatedBytes =
      options.estimatedBytes !== undefined
        ? clampNonNegativeInt(options.estimatedBytes, 0)
        : estimateSurfaceRgbaBytes(bitmap.width, bitmap.height);
    const dispose = () => {
      options.onDispose?.();
      bitmap.close();
    };
    return this.register({
      kind: "image-bitmap",
      owner: options.owner,
      label: options.label ?? `${bitmap.width}x${bitmap.height} bitmap`,
      url: null,
      estimatedBytes,
      maxLifetimeMs: clampPositiveInt(options.maxLifetimeMs, this.lifetimeByKind["image-bitmap"]),
      pinned: Boolean(options.pinned),
      dispose,
    });
  }

  touch(id: string): boolean {
    const record = this.entries.get(id);
    if (!record) return false;
    record.lastTouchedAtMs = this.now();
    return true;
  }

  release(id: string, options: { readonly invokeDisposer?: boolean } = {}): boolean {
    const record = this.entries.get(id);
    if (!record) return false;
    this.removeRecord(record);
    this.totalReleasedCount += 1;
    if (options.invokeDisposer ?? true) {
      this.safeDispose(record);
    }
    return true;
  }

  releaseByUrl(url: string, options: { readonly invokeDisposer?: boolean } = {}): boolean {
    const id = this.urlToId.get(url);
    if (!id) {
      if (options.invokeDisposer ?? true) {
        try {
          this.revokeObjectUrl(url);
        } catch {
          // 이미 해제되었거나 revoke를 지원하지 않는 환경이면 무시한다.
        }
      }
      return false;
    }
    return this.release(id, options);
  }

  releaseByOwner(owner: string, options: { readonly invokeDisposer?: boolean } = {}): number {
    const targets: TrackedResourceRecord[] = [];
    for (const record of this.entries.values()) {
      if (record.owner === owner) targets.push(record);
    }
    let released = 0;
    for (const record of targets) {
      if (this.release(record.id, options)) released += 1;
    }
    return released;
  }

  createScopedTracker(owner: string): StudioScopedResourceTracker {
    const ownedIds = new Set<string>();
    const normalizedOwner = owner.trim() || "studio:scoped";
    return {
      owner: normalizedOwner,
      trackObjectUrl: (url, options = {}) => {
        const id = this.trackObjectUrl(url, { ...options, owner: normalizedOwner });
        ownedIds.add(id);
        return id;
      },
      createTrackedObjectUrl: (blob, options = {}) => {
        const created = this.createTrackedObjectUrl(blob, { ...options, owner: normalizedOwner });
        if (created) ownedIds.add(created.id);
        return created;
      },
      trackOffscreenCanvas: (canvas, options = {}) => {
        const id = this.trackOffscreenCanvas(canvas, { ...options, owner: normalizedOwner });
        ownedIds.add(id);
        return id;
      },
      trackImageBitmap: (bitmap, options = {}) => {
        const id = this.trackImageBitmap(bitmap, { ...options, owner: normalizedOwner });
        ownedIds.add(id);
        return id;
      },
      release: (id) => {
        ownedIds.delete(id);
        return this.release(id);
      },
      disposeAll: () => {
        let count = 0;
        for (const id of [...ownedIds]) {
          ownedIds.delete(id);
          if (this.release(id)) count += 1;
        }
        return count;
      },
    };
  }

  inspect(nowMs = this.now()): StudioResourceLeakReport {
    const byKindMutable: Record<
      StudioTrackedResourceKind,
      { count: number; estimatedBytes: number; staleCount: number }
    > = {
      "object-url": { count: 0, estimatedBytes: 0, staleCount: 0 },
      "offscreen-canvas": { count: 0, estimatedBytes: 0, staleCount: 0 },
      "image-bitmap": { count: 0, estimatedBytes: 0, staleCount: 0 },
    };
    const staleEntries: StudioTrackedResourceSnapshot[] = [];

    for (const record of this.entries.values()) {
      const ageMs = Math.max(0, nowMs - record.lastTouchedAtMs);
      const stale = ageMs >= record.maxLifetimeMs;
      const bucket = byKindMutable[record.kind];
      bucket.count += 1;
      bucket.estimatedBytes += record.estimatedBytes;
      if (stale) {
        bucket.staleCount += 1;
        staleEntries.push(this.toSnapshot(record, nowMs));
      }
    }

    staleEntries.sort((left, right) => right.ageMs - left.ageMs || left.id.localeCompare(right.id));

    const warnings: StudioResourceLeakWarning[] = [];
    if (staleEntries.length > 0) {
      warnings.push(Object.freeze({
        code: "stale-resource",
        severity: staleEntries.length >= 4 ? "critical" : "warning",
        messageKo: `해제되지 않은 임시 리소스 ${staleEntries.length}건이 생존 한도를 넘겼어요. 자동 정리(sweep)를 권장합니다.`,
        affectedIds: Object.freeze(staleEntries.map((entry) => entry.id)),
      }));
    }
    if (this.totalEstimatedBytes > this.maxTotalBytes) {
      warnings.push(Object.freeze({
        code: "byte-budget-critical",
        severity: "critical",
        messageKo: `임시 리소스 누적 추정 메모리(${formatMegabytes(this.totalEstimatedBytes)})가 상한 ${formatMegabytes(this.maxTotalBytes)}를 넘겼어요.`,
        affectedIds: Object.freeze([...this.entries.keys()]),
      }));
    } else if (this.totalEstimatedBytes >= this.warnTotalBytes) {
      warnings.push(Object.freeze({
        code: "byte-budget-warning",
        severity: "warning",
        messageKo: `임시 리소스 누적 추정 메모리(${formatMegabytes(this.totalEstimatedBytes)})가 경고 기준 ${formatMegabytes(this.warnTotalBytes)}에 도달했어요.`,
        affectedIds: Object.freeze([...this.entries.keys()]),
      }));
    }
    if (this.entries.size > this.maxActiveCount) {
      warnings.push(Object.freeze({
        code: "count-threshold-exceeded",
        severity: this.entries.size >= this.maxActiveCount * 2 ? "critical" : "warning",
        messageKo: `활성 임시 리소스가 ${this.entries.size}건으로 권장 상한(${this.maxActiveCount}건)을 넘겼어요.`,
        affectedIds: Object.freeze([...this.entries.keys()]),
      }));
    }

    const status: StudioResourceLeakStatus = warnings.some((warning) => warning.severity === "critical")
      ? "critical"
      : warnings.length > 0
        ? "warning"
        : "ok";

    return Object.freeze({
      capturedAtMs: nowMs,
      status,
      activeCount: this.entries.size,
      totalEstimatedBytes: this.totalEstimatedBytes,
      peakEstimatedBytes: this.peakEstimatedBytes,
      totalCreatedCount: this.totalCreatedCount,
      totalReleasedCount: this.totalReleasedCount,
      totalAutoReclaimedCount: this.totalAutoReclaimedCount,
      byKind: Object.freeze({
        "object-url": Object.freeze({ ...byKindMutable["object-url"] }),
        "offscreen-canvas": Object.freeze({ ...byKindMutable["offscreen-canvas"] }),
        "image-bitmap": Object.freeze({ ...byKindMutable["image-bitmap"] }),
      }),
      staleEntries: Object.freeze(staleEntries),
      warnings: Object.freeze(warnings),
    });
  }

  sweep(
    options: {
      readonly nowMs?: number;
      readonly reclaimOverflow?: boolean;
      readonly excludeIds?: ReadonlySet<string>;
    } = {},
  ): StudioResourceSweepResult {
    const nowMs = options.nowMs ?? this.now();
    const reclaimOverflow = options.reclaimOverflow ?? true;
    const excludeIds = options.excludeIds;
    const reclaimedIds: string[] = [];
    let reclaimedBytes = 0;
    let disposerErrorCount = 0;

    const reclaim = (record: TrackedResourceRecord) => {
      this.removeRecord(record);
      this.totalAutoReclaimedCount += 1;
      reclaimedIds.push(record.id);
      reclaimedBytes += record.estimatedBytes;
      if (!this.safeDispose(record)) {
        disposerErrorCount += 1;
      }
    };

    // 1단계: 생존 한도를 초과한 비고정(unpinned) 만료 리소스 회수
    const staleCandidates: TrackedResourceRecord[] = [];
    for (const record of this.entries.values()) {
      if (record.pinned || excludeIds?.has(record.id)) continue;
      if (Math.max(0, nowMs - record.lastTouchedAtMs) >= record.maxLifetimeMs) {
        staleCandidates.push(record);
      }
    }
    staleCandidates.sort((left, right) => left.lastTouchedAtMs - right.lastTouchedAtMs);
    for (const candidate of staleCandidates) {
      reclaim(candidate);
    }

    // 2단계: 바이트/개수 상한을 여전히 넘으면 오래된 비고정 리소스부터 순차 회수
    if (
      reclaimOverflow
      && (this.totalEstimatedBytes > this.maxTotalBytes || this.entries.size > this.maxActiveCount)
    ) {
      const evictable = [...this.entries.values()]
        .filter((record) => !record.pinned && !excludeIds?.has(record.id))
        .sort(
          (left, right) =>
            left.lastTouchedAtMs - right.lastTouchedAtMs
            || right.estimatedBytes - left.estimatedBytes,
        );
      for (const candidate of evictable) {
        if (this.totalEstimatedBytes <= this.maxTotalBytes && this.entries.size <= this.maxActiveCount) {
          break;
        }
        reclaim(candidate);
      }
    }

    return Object.freeze({
      sweptAtMs: nowMs,
      reclaimedIds: Object.freeze(reclaimedIds),
      reclaimedBytes,
      disposerErrorCount,
      report: this.inspect(nowMs),
    });
  }

  disposeAll(): number {
    let released = 0;
    for (const record of [...this.entries.values()]) {
      if (this.release(record.id)) released += 1;
    }
    return released;
  }

  private register(input: Omit<TrackedResourceRecord, "id" | "createdAtMs" | "lastTouchedAtMs">): string {
    const nowMs = this.now();
    this.sequence += 1;
    const id = `${input.kind}:${this.sequence}`;
    const record: TrackedResourceRecord = {
      ...input,
      id,
      owner: input.owner.trim() || "studio:unknown",
      label: input.label.trim() || id,
      createdAtMs: nowMs,
      lastTouchedAtMs: nowMs,
    };
    this.entries.set(id, record);
    this.totalCreatedCount += 1;
    this.totalEstimatedBytes += record.estimatedBytes;
    if (this.totalEstimatedBytes > this.peakEstimatedBytes) {
      this.peakEstimatedBytes = this.totalEstimatedBytes;
    }

    if (
      this.autoReclaimOnThreshold
      && (this.totalEstimatedBytes > this.maxTotalBytes || this.entries.size > this.maxActiveCount)
    ) {
      this.sweep({ nowMs, reclaimOverflow: true, excludeIds: new Set([id]) });
    }
    return id;
  }

  private removeRecord(record: TrackedResourceRecord): void {
    this.entries.delete(record.id);
    if (record.url !== null && this.urlToId.get(record.url) === record.id) {
      this.urlToId.delete(record.url);
    }
    this.totalEstimatedBytes = Math.max(0, this.totalEstimatedBytes - record.estimatedBytes);
  }

  private safeDispose(record: TrackedResourceRecord): boolean {
    try {
      record.dispose();
      return true;
    } catch {
      return false;
    }
  }

  private toSnapshot(record: TrackedResourceRecord, nowMs: number): StudioTrackedResourceSnapshot {
    const ageMs = Math.max(0, nowMs - record.lastTouchedAtMs);
    return Object.freeze({
      id: record.id,
      kind: record.kind,
      owner: record.owner,
      label: record.label,
      estimatedBytes: record.estimatedBytes,
      createdAtMs: record.createdAtMs,
      lastTouchedAtMs: record.lastTouchedAtMs,
      ageMs,
      maxLifetimeMs: record.maxLifetimeMs,
      pinned: record.pinned,
      stale: ageMs >= record.maxLifetimeMs,
    });
  }
}

let sharedResourceLeakGuard: StudioResourceLeakGuard | null = null;

/** 브라우저 세션 전역에서 공유하는 스튜디오 리소스 누수 가드 싱글턴을 반환한다. */
export function getStudioResourceLeakGuard(): StudioResourceLeakGuard {
  if (sharedResourceLeakGuard === null) {
    sharedResourceLeakGuard = new StudioResourceLeakGuard();
  }
  return sharedResourceLeakGuard;
}

/** 테스트 격리를 위해 공유 리소스 누수 가드를 정리하고 초기화한다. */
export function resetStudioResourceLeakGuardForTest(
  config?: StudioResourceLeakGuardConfig,
): StudioResourceLeakGuard {
  sharedResourceLeakGuard?.disposeAll();
  sharedResourceLeakGuard = new StudioResourceLeakGuard(config);
  return sharedResourceLeakGuard;
}
