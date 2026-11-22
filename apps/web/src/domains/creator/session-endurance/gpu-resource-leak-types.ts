/**
 * 10시간+ 연속 작화 세션 GPU 리소스 추적기 공유 상수·타입·순수 진단 계산기.
 */

export const SESSION_ENDURANCE_DEFAULT_VRAM_BUDGET_BYTES = 512 * 1024 * 1024;
export const SESSION_ENDURANCE_MAX_LEAK_GROWTH_RATIO = 0.05;
export const SESSION_ENDURANCE_VRAM_WARNING_RATIO = 0.75;
export const SESSION_ENDURANCE_VRAM_CRITICAL_RATIO = 0.9;
export const SESSION_ENDURANCE_FPS_WARNING_THRESHOLD = 45;
export const SESSION_ENDURANCE_FPS_CRITICAL_THRESHOLD = 30;
export const SESSION_ENDURANCE_DEFAULT_FPS_WINDOW = 60;
export const SESSION_ENDURANCE_DEFAULT_MAX_RECOVERY_ATTEMPTS = 3;

export const GPU_TRACKED_RESOURCE_KINDS = [
  "gpu-texture",
  "gpu-buffer",
  "three-texture",
  "image-bitmap",
  "object-url",
] as const;

export type GpuTrackedResourceKind = (typeof GPU_TRACKED_RESOURCE_KINDS)[number];
export type GpuResourceScope = "stroke" | "cut" | "cache" | "persistent";
export type EnduranceHealthStatus = "healthy" | "warning" | "critical";
export type GpuDeviceRecoveryStatus =
  | "idle"
  | "active"
  | "recovering"
  | "recovered"
  | "cpu-fallback";

/** `GPUTexture` / `GPUBuffer`와 구조적으로 호환되는 최소 핸들. */
export interface DestroyableGpuResourceLike {
  destroy(): void;
}

/** `THREE.Texture`와 구조적으로 호환되는 최소 핸들(`three` 정적 import 회피). */
export interface DisposableThreeTextureLike {
  dispose(): void;
}

/** `ImageBitmap`과 구조적으로 호환되는 최소 핸들. */
export interface ClosableImageBitmapLike {
  close(): void;
}

export interface GpuDeviceLostInfoLike {
  readonly reason?: string;
  readonly message?: string;
}

export interface WatchableGpuDeviceLike {
  readonly lost: Promise<GpuDeviceLostInfoLike>;
  destroy?(): void;
}

export type GpuResourceHandleByKind = {
  readonly "gpu-texture": DestroyableGpuResourceLike;
  readonly "gpu-buffer": DestroyableGpuResourceLike;
  readonly "three-texture": DisposableThreeTextureLike;
  readonly "image-bitmap": ClosableImageBitmapLike;
  readonly "object-url": string;
};

export interface TrackGpuResourceInput<K extends GpuTrackedResourceKind = GpuTrackedResourceKind> {
  readonly id: string;
  readonly kind: K;
  readonly handle: GpuResourceHandleByKind[K];
  readonly bytes: number;
  readonly label?: string;
  readonly scope?: GpuResourceScope;
  readonly cutId?: string | null;
  readonly pinned?: boolean;
  readonly reclaimable?: boolean;
  readonly onRelease?: () => void;
}

export interface GpuKindUsageBreakdown {
  readonly activeCount: number;
  readonly activeBytes: number;
  readonly totalAllocated: number;
  readonly totalReleased: number;
}

export interface GpuSoakDiagnosticsReport {
  readonly strokeCount: number;
  readonly cutSwitchCount: number;
  readonly baselineCaptured: boolean;
  readonly baselineActiveCount: number;
  readonly baselineActiveBytes: number;
  readonly activeCount: number;
  readonly activeBytes: number;
  readonly peakActiveCount: number;
  readonly peakActiveBytes: number;
  readonly countGrowthRatio: number;
  readonly byteGrowthRatio: number;
  readonly leakGrowthRatio: number;
  readonly maxLeakGrowthRatio: number;
  readonly withinBudget: boolean;
  readonly status: EnduranceHealthStatus;
  readonly perKind: Readonly<Record<GpuTrackedResourceKind, GpuKindUsageBreakdown>>;
}

export interface GpuCacheReclaimOptions {
  readonly minIdleMs?: number;
  readonly includeStrokeAndCut?: boolean;
}

export interface GpuCacheReclaimResult {
  readonly reclaimedCount: number;
  readonly reclaimedBytes: number;
  readonly reclaimedByKind: Readonly<Record<GpuTrackedResourceKind, number>>;
  readonly remainingActiveCount: number;
  readonly remainingActiveBytes: number;
  readonly completedAtMs: number;
  readonly summaryKo: string;
}

export interface GpuDeviceRecoveryAttachOptions {
  readonly requestDevice: (
    attempt: number,
    info: GpuDeviceLostInfoLike,
  ) => Promise<WatchableGpuDeviceLike | null>;
  readonly maxAttempts?: number;
  readonly baseRetryDelayMs?: number;
  readonly onDeviceLost?: (info: GpuDeviceLostInfoLike, releasedGpuResources: number) => void;
  readonly onDeviceRecovered?: (device: WatchableGpuDeviceLike, attempt: number) => void;
  readonly onFallbackToCpuSafe?: (info: GpuDeviceLostInfoLike, lastError: unknown) => void;
}

export interface GpuDeviceRecoveryState {
  readonly status: GpuDeviceRecoveryStatus;
  readonly lossCount: number;
  readonly recoverySuccessCount: number;
  readonly recoveryFailureCount: number;
  readonly currentAttempt: number;
  readonly lastLostReason: string | null;
  readonly lastNoticeKo: string | null;
  readonly lastEventAtMs: number | null;
}

export interface GpuEnduranceSnapshot {
  readonly activeCount: number;
  readonly activeBytes: number;
  readonly peakActiveCount: number;
  readonly peakActiveBytes: number;
  readonly totalAllocated: number;
  readonly totalReleased: number;
  readonly reclaimableCount: number;
  readonly reclaimableBytes: number;
  readonly vramBudgetBytes: number;
  readonly vramUtilizationRatio: number;
  readonly vramStatus: EnduranceHealthStatus;
  readonly fps: number;
  readonly p95FrameMs: number;
  readonly frameSampleCount: number;
  readonly fpsStatus: EnduranceHealthStatus;
  readonly soak: GpuSoakDiagnosticsReport;
  readonly deviceRecovery: GpuDeviceRecoveryState;
  readonly disposalErrorCount: number;
  readonly lastReclaim: GpuCacheReclaimResult | null;
  readonly overallStatus: EnduranceHealthStatus;
}

export interface GpuResourceLeakTrackerOptions {
  readonly vramBudgetBytes?: number;
  readonly maxLeakGrowthRatio?: number;
  readonly fpsWindowSize?: number;
  readonly now?: () => number;
  readonly revokeObjectUrl?: (url: string) => void;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface GpuResourceLeakTracker {
  track<K extends GpuTrackedResourceKind>(input: TrackGpuResourceInput<K>): () => boolean;
  touch(id: string): boolean;
  release(id: string): boolean;
  has(id: string): boolean;
  releaseByCut(cutId: string, options?: { readonly includePinned?: boolean }): number;
  releaseByScope(scope: GpuResourceScope, options?: { readonly includePinned?: boolean }): number;
  reclaimUnusedCaches(options?: GpuCacheReclaimOptions): GpuCacheReclaimResult;
  captureBaseline(): void;
  recordStrokeCycle(options?: { readonly cutId?: string | null; readonly releaseStrokeResources?: boolean }): void;
  recordCutSwitch(fromCutId: string | null, toCutId: string, options?: { readonly releasePreviousCut?: boolean }): void;
  recordFrameSample(frameDurationMs: number): void;
  attachGpuDevice(device: WatchableGpuDeviceLike, options: GpuDeviceRecoveryAttachOptions): () => void;
  getSoakReport(): GpuSoakDiagnosticsReport;
  getSnapshot(): GpuEnduranceSnapshot;
  subscribe(listener: () => void): () => void;
  disposeAll(): number;
}

export interface MutableKindCounter {
  activeCount: number;
  activeBytes: number;
  totalAllocated: number;
  totalReleased: number;
}

export function createEmptyKindRecord(): Record<GpuTrackedResourceKind, number> {
  return {
    "gpu-texture": 0,
    "gpu-buffer": 0,
    "three-texture": 0,
    "image-bitmap": 0,
    "object-url": 0,
  };
}

export function createInitialKindCounters(): Record<GpuTrackedResourceKind, MutableKindCounter> {
  return {
    "gpu-texture": { activeCount: 0, activeBytes: 0, totalAllocated: 0, totalReleased: 0 },
    "gpu-buffer": { activeCount: 0, activeBytes: 0, totalAllocated: 0, totalReleased: 0 },
    "three-texture": { activeCount: 0, activeBytes: 0, totalAllocated: 0, totalReleased: 0 },
    "image-bitmap": { activeCount: 0, activeBytes: 0, totalAllocated: 0, totalReleased: 0 },
    "object-url": { activeCount: 0, activeBytes: 0, totalAllocated: 0, totalReleased: 0 },
  };
}

export function worstEnduranceStatus(
  statuses: readonly EnduranceHealthStatus[],
): EnduranceHealthStatus {
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning")) return "warning";
  return "healthy";
}

export function computeFpsMetrics(
  frameRing: Float64Array,
  sampleCount: number,
): { readonly fps: number; readonly p95FrameMs: number; readonly fpsStatus: EnduranceHealthStatus } {
  if (sampleCount <= 0) {
    return { fps: 60, p95FrameMs: 16.7, fpsStatus: "healthy" };
  }
  const samples: number[] = [];
  let sum = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const value = frameRing[i] ?? 16.67;
    samples.push(value);
    sum += value;
  }
  samples.sort((a, b) => a - b);
  const avgMs = Math.max(1, sum / sampleCount);
  const fps = Math.min(240, Math.round(1000 / avgMs));
  const p95Index = Math.min(samples.length - 1, Math.floor(samples.length * 0.95));
  const p95FrameMs = Math.round((samples[p95Index] ?? avgMs) * 10) / 10;
  const fpsStatus: EnduranceHealthStatus =
    fps < SESSION_ENDURANCE_FPS_CRITICAL_THRESHOLD
      ? "critical"
      : fps < SESSION_ENDURANCE_FPS_WARNING_THRESHOLD
        ? "warning"
        : "healthy";
  return { fps, p95FrameMs, fpsStatus };
}
