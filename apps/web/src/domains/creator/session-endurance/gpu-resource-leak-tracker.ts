/**
 * 10시간+ 연속 작화 세션 무누수 GPU·미디어 리소스 추적기.
 *
 * - `GPUTexture`·`GPUBuffer`·`THREE.Texture`·`ImageBitmap`·`ObjectURL` 5종 자원의
 *   할당·해제를 단일 원장으로 추적한다.
 * - 500스트로크·50컷 전환 소크 기준 활성 리소스 증가율(`<= 5%`)을 실시간 감시한다.
 * - `GPUDevice.lost` 발생 시 유실 GPU 자원을 정리하고 지수 백오프로 디바이스를 자동 복구하며,
 *   복구 한도 초과 시 CPU 안전 대체 상태로 전환한다.
 * - HUD 칩에서 1클릭으로 미사용(비고정) GPU 캐시를 일괄 회수할 수 있다.
 */

import { formatStudioOpfsBytes } from "../studio-opfs-filesystem";
import {
  computeFpsMetrics,
  createEmptyKindRecord,
  createInitialKindCounters,
  SESSION_ENDURANCE_DEFAULT_FPS_WINDOW,
  SESSION_ENDURANCE_DEFAULT_MAX_RECOVERY_ATTEMPTS,
  SESSION_ENDURANCE_DEFAULT_VRAM_BUDGET_BYTES,
  SESSION_ENDURANCE_MAX_LEAK_GROWTH_RATIO,
  SESSION_ENDURANCE_VRAM_CRITICAL_RATIO,
  SESSION_ENDURANCE_VRAM_WARNING_RATIO,
  worstEnduranceStatus,
  type ClosableImageBitmapLike,
  type DestroyableGpuResourceLike,
  type DisposableThreeTextureLike,
  type EnduranceHealthStatus,
  type GpuCacheReclaimResult,
  type GpuDeviceLostInfoLike,
  type GpuDeviceRecoveryAttachOptions,
  type GpuDeviceRecoveryState,
  type GpuEnduranceSnapshot,
  type GpuKindUsageBreakdown,
  type GpuResourceLeakTracker,
  type GpuResourceLeakTrackerOptions,
  type GpuResourceScope,
  type GpuSoakDiagnosticsReport,
  type GpuTrackedResourceKind,
  type TrackGpuResourceInput,
  type WatchableGpuDeviceLike,
} from "./gpu-resource-leak-types";

export * from "./gpu-resource-leak-types";

interface TrackedEntry {
  readonly id: string;
  readonly kind: GpuTrackedResourceKind;
  readonly bytes: number;
  readonly label: string;
  readonly scope: GpuResourceScope;
  readonly cutId: string | null;
  readonly pinned: boolean;
  readonly reclaimable: boolean;
  readonly allocatedAtMs: number;
  lastUsedAtMs: number;
  readonly dispose: () => void;
}

function defaultNow(): number {
  return Date.now();
}

function defaultRevokeObjectUrl(url: string): void {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
}

function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sanitizeBytes(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

function clampRatio(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value > 1 ? 1 : value;
}

function isGpuDeviceBoundKind(kind: GpuTrackedResourceKind): boolean {
  return kind === "gpu-texture" || kind === "gpu-buffer";
}

export function createGpuResourceLeakTracker(
  options: GpuResourceLeakTrackerOptions = {},
): GpuResourceLeakTracker {
  const vramBudgetBytes = Math.max(
    1024 * 1024,
    sanitizeBytes(options.vramBudgetBytes ?? SESSION_ENDURANCE_DEFAULT_VRAM_BUDGET_BYTES),
  );
  const maxLeakGrowthRatio = clampRatio(
    options.maxLeakGrowthRatio ?? SESSION_ENDURANCE_MAX_LEAK_GROWTH_RATIO,
    SESSION_ENDURANCE_MAX_LEAK_GROWTH_RATIO,
  );
  const fpsWindowSize = Math.max(
    8,
    Math.min(240, Math.floor(options.fpsWindowSize ?? SESSION_ENDURANCE_DEFAULT_FPS_WINDOW)),
  );
  const now = options.now ?? defaultNow;
  const revokeObjectUrl = options.revokeObjectUrl ?? defaultRevokeObjectUrl;
  const sleep = options.sleep ?? defaultSleep;

  const active = new Map<string, TrackedEntry>();
  const kindCounters = createInitialKindCounters();
  const listeners = new Set<() => void>();

  let activeBytes = 0;
  let peakActiveCount = 0;
  let peakActiveBytes = 0;
  let totalAllocated = 0;
  let totalReleased = 0;
  let totalAllocatedBytes = 0;
  let disposalErrorCount = 0;

  let strokeCount = 0;
  let cutSwitchCount = 0;
  let baselineCaptured = false;
  let baselineActiveCount = 0;
  let baselineActiveBytes = 0;
  let lastReclaim: GpuCacheReclaimResult | null = null;

  const frameRing = new Float64Array(fpsWindowSize);
  let frameHead = 0;
  let frameSampleCount = 0;

  let deviceEpoch = 0;
  let deviceRecovery: GpuDeviceRecoveryState = Object.freeze({
    status: "idle",
    lossCount: 0,
    recoverySuccessCount: 0,
    recoveryFailureCount: 0,
    currentAttempt: 0,
    lastLostReason: null,
    lastNoticeKo: null,
    lastEventAtMs: null,
  });

  let cachedSnapshot: GpuEnduranceSnapshot | null = null;

  const emit = (): void => {
    cachedSnapshot = null;
    for (const listener of listeners) listener();
  };

  const buildDisposer = <K extends GpuTrackedResourceKind>(
    input: TrackGpuResourceInput<K>,
  ): (() => void) => {
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      try {
        switch (input.kind) {
          case "gpu-texture":
          case "gpu-buffer":
            (input.handle as DestroyableGpuResourceLike).destroy();
            break;
          case "three-texture":
            (input.handle as DisposableThreeTextureLike).dispose();
            break;
          case "image-bitmap":
            (input.handle as ClosableImageBitmapLike).close();
            break;
          case "object-url":
            revokeObjectUrl(input.handle as string);
            break;
        }
      } catch {
        disposalErrorCount += 1;
      }
      if (input.onRelease) {
        try {
          input.onRelease();
        } catch {
          disposalErrorCount += 1;
        }
      }
    };
  };

  const releaseEntryInternal = (id: string): TrackedEntry | null => {
    const entry = active.get(id);
    if (!entry) return null;
    active.delete(id);
    activeBytes = Math.max(0, activeBytes - entry.bytes);
    totalReleased += 1;
    const counter = kindCounters[entry.kind];
    counter.activeCount = Math.max(0, counter.activeCount - 1);
    counter.activeBytes = Math.max(0, counter.activeBytes - entry.bytes);
    counter.totalReleased += 1;
    entry.dispose();
    return entry;
  };

  const releaseMatchingIds = (predicate: (entry: TrackedEntry) => boolean): number => {
    const ids: string[] = [];
    for (const entry of active.values()) {
      if (predicate(entry)) ids.push(entry.id);
    }
    let released = 0;
    for (const id of ids) {
      if (releaseEntryInternal(id) !== null) released += 1;
    }
    return released;
  };

  const buildSoakReport = (): GpuSoakDiagnosticsReport => {
    const activeCount = active.size;
    const baseCount = baselineCaptured ? baselineActiveCount : 0;
    const baseBytes = baselineCaptured ? baselineActiveBytes : 0;

    const countGrowthRatio =
      baseCount > 0
        ? Math.max(0, (activeCount - baseCount) / baseCount)
        : activeCount > 0
          ? activeCount / Math.max(1, totalAllocated)
          : 0;
    const byteGrowthRatio =
      baseBytes > 0
        ? Math.max(0, (activeBytes - baseBytes) / baseBytes)
        : activeBytes > 0
          ? activeBytes / Math.max(1, totalAllocatedBytes)
          : 0;

    const leakGrowthRatio = Math.max(countGrowthRatio, byteGrowthRatio);
    const withinBudget = leakGrowthRatio <= maxLeakGrowthRatio;
    const status: EnduranceHealthStatus = !withinBudget
      ? "critical"
      : leakGrowthRatio > maxLeakGrowthRatio * 0.6
        ? "warning"
        : "healthy";

    const perKind: Record<GpuTrackedResourceKind, GpuKindUsageBreakdown> = {
      "gpu-texture": Object.freeze({ ...kindCounters["gpu-texture"] }),
      "gpu-buffer": Object.freeze({ ...kindCounters["gpu-buffer"] }),
      "three-texture": Object.freeze({ ...kindCounters["three-texture"] }),
      "image-bitmap": Object.freeze({ ...kindCounters["image-bitmap"] }),
      "object-url": Object.freeze({ ...kindCounters["object-url"] }),
    };

    return Object.freeze({
      strokeCount,
      cutSwitchCount,
      baselineCaptured,
      baselineActiveCount,
      baselineActiveBytes,
      activeCount,
      activeBytes,
      peakActiveCount,
      peakActiveBytes,
      countGrowthRatio,
      byteGrowthRatio,
      leakGrowthRatio,
      maxLeakGrowthRatio,
      withinBudget,
      status,
      perKind: Object.freeze(perKind),
    });
  };

  const buildSnapshot = (): GpuEnduranceSnapshot => {
    let reclaimableCount = 0;
    let reclaimableBytes = 0;
    for (const entry of active.values()) {
      if (!entry.pinned && entry.reclaimable) {
        reclaimableCount += 1;
        reclaimableBytes += entry.bytes;
      }
    }
    const vramUtilizationRatio = Math.min(1, activeBytes / vramBudgetBytes);
    const vramStatus: EnduranceHealthStatus =
      vramUtilizationRatio >= SESSION_ENDURANCE_VRAM_CRITICAL_RATIO
        ? "critical"
        : vramUtilizationRatio >= SESSION_ENDURANCE_VRAM_WARNING_RATIO
          ? "warning"
          : "healthy";
    const { fps, p95FrameMs, fpsStatus } = computeFpsMetrics(frameRing, frameSampleCount);
    const soak = buildSoakReport();
    const deviceStatus: EnduranceHealthStatus =
      deviceRecovery.status === "cpu-fallback"
        ? "critical"
        : deviceRecovery.status === "recovering"
          ? "warning"
          : "healthy";

    return Object.freeze({
      activeCount: active.size,
      activeBytes,
      peakActiveCount,
      peakActiveBytes,
      totalAllocated,
      totalReleased,
      reclaimableCount,
      reclaimableBytes,
      vramBudgetBytes,
      vramUtilizationRatio,
      vramStatus,
      fps,
      p95FrameMs,
      frameSampleCount,
      fpsStatus,
      soak,
      deviceRecovery,
      disposalErrorCount,
      lastReclaim,
      overallStatus: worstEnduranceStatus([vramStatus, fpsStatus, soak.status, deviceStatus]),
    });
  };

  const watchDeviceLoop = (
    device: WatchableGpuDeviceLike,
    attachOptions: GpuDeviceRecoveryAttachOptions,
    epoch: number,
  ): void => {
    const maxAttempts = Math.max(
      1,
      Math.floor(attachOptions.maxAttempts ?? SESSION_ENDURANCE_DEFAULT_MAX_RECOVERY_ATTEMPTS),
    );
    const baseRetryDelayMs = Math.max(0, attachOptions.baseRetryDelayMs ?? 120);

    void device.lost.then(async (rawInfo) => {
      if (epoch !== deviceEpoch) return;
      const info: GpuDeviceLostInfoLike = rawInfo ?? {};
      const reason = typeof info.reason === "string" && info.reason.trim()
        ? info.reason.trim()
        : "unknown";
      const releasedCount = releaseMatchingIds((entry) => isGpuDeviceBoundKind(entry.kind));

      if (reason === "destroyed") {
        deviceRecovery = Object.freeze({
          ...deviceRecovery,
          status: "idle",
          lastLostReason: reason,
          lastNoticeKo: "GPU 디바이스를 정상 종료했습니다.",
          lastEventAtMs: now(),
        });
        emit();
        return;
      }

      deviceRecovery = Object.freeze({
        ...deviceRecovery,
        status: "recovering",
        lossCount: deviceRecovery.lossCount + 1,
        currentAttempt: 0,
        lastLostReason: reason,
        lastNoticeKo: `GPU 컨텍스트가 중단돼 자동 복구를 시도합니다(유실 자원 ${releasedCount}건 정리).`,
        lastEventAtMs: now(),
      });
      emit();
      attachOptions.onDeviceLost?.(info, releasedCount);

      let lastError: unknown = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (epoch !== deviceEpoch) return;
        deviceRecovery = Object.freeze({
          ...deviceRecovery,
          status: "recovering",
          currentAttempt: attempt,
          lastNoticeKo: `GPU 디바이스 재연결 중(${attempt}/${maxAttempts})…`,
          lastEventAtMs: now(),
        });
        emit();

        if (attempt > 1 && baseRetryDelayMs > 0) {
          await sleep(baseRetryDelayMs * 2 ** (attempt - 2));
          if (epoch !== deviceEpoch) return;
        }

        try {
          const nextDevice = await attachOptions.requestDevice(attempt, info);
          if (epoch !== deviceEpoch) return;
          if (nextDevice) {
            deviceRecovery = Object.freeze({
              ...deviceRecovery,
              status: "recovered",
              recoverySuccessCount: deviceRecovery.recoverySuccessCount + 1,
              currentAttempt: attempt,
              lastNoticeKo: `GPU 컨텍스트를 ${attempt}회 만에 자동 복구했습니다.`,
              lastEventAtMs: now(),
            });
            emit();
            attachOptions.onDeviceRecovered?.(nextDevice, attempt);
            watchDeviceLoop(nextDevice, attachOptions, epoch);
            return;
          }
          lastError = new Error("GPU 디바이스를 다시 받지 못했습니다.");
        } catch (error) {
          lastError = error;
        }
      }

      if (epoch !== deviceEpoch) return;
      deviceRecovery = Object.freeze({
        ...deviceRecovery,
        status: "cpu-fallback",
        recoveryFailureCount: deviceRecovery.recoveryFailureCount + 1,
        lastNoticeKo: "GPU 복구 한도를 초과해 안전한 CPU 캔버스 모드로 전환했습니다.",
        lastEventAtMs: now(),
      });
      emit();
      attachOptions.onFallbackToCpuSafe?.(info, lastError);
    });
  };

  const tracker: GpuResourceLeakTracker = {
    track(input) {
      const id = input.id.trim();
      if (!id) throw new Error("GPU 추적 리소스 ID가 비어 있습니다.");
      if (active.has(id)) releaseEntryInternal(id);

      const timestamp = now();
      const scope: GpuResourceScope = input.scope ?? "cache";
      const bytes = sanitizeBytes(input.bytes);
      const entry: TrackedEntry = {
        id,
        kind: input.kind,
        bytes,
        label: input.label?.trim() || id,
        scope,
        cutId: input.cutId ?? null,
        pinned: input.pinned ?? scope === "persistent",
        reclaimable: input.reclaimable ?? scope !== "persistent",
        allocatedAtMs: timestamp,
        lastUsedAtMs: timestamp,
        dispose: buildDisposer(input),
      };

      active.set(id, entry);
      activeBytes += bytes;
      totalAllocated += 1;
      totalAllocatedBytes += bytes;
      const counter = kindCounters[entry.kind];
      counter.activeCount += 1;
      counter.activeBytes += bytes;
      counter.totalAllocated += 1;
      if (active.size > peakActiveCount) peakActiveCount = active.size;
      if (activeBytes > peakActiveBytes) peakActiveBytes = activeBytes;
      emit();

      return () => tracker.release(id);
    },

    touch(id) {
      const entry = active.get(id);
      if (!entry) return false;
      entry.lastUsedAtMs = now();
      return true;
    },

    release(id) {
      if (releaseEntryInternal(id) === null) return false;
      emit();
      return true;
    },

    has(id) {
      return active.has(id);
    },

    releaseByCut(cutId, releaseOptions = {}) {
      const includePinned = releaseOptions.includePinned ?? false;
      const released = releaseMatchingIds(
        (entry) => entry.cutId === cutId && (includePinned || !entry.pinned),
      );
      if (released > 0) emit();
      return released;
    },

    releaseByScope(scope, releaseOptions = {}) {
      const includePinned = releaseOptions.includePinned ?? false;
      const released = releaseMatchingIds(
        (entry) => entry.scope === scope && (includePinned || !entry.pinned),
      );
      if (released > 0) emit();
      return released;
    },

    reclaimUnusedCaches(reclaimOptions = {}) {
      const timestamp = now();
      const minIdleMs = Math.max(0, reclaimOptions.minIdleMs ?? 0);
      const includeStrokeAndCut = reclaimOptions.includeStrokeAndCut ?? true;
      const reclaimedByKind = createEmptyKindRecord();
      const candidateIds: string[] = [];

      for (const entry of active.values()) {
        if (entry.pinned || !entry.reclaimable) continue;
        if (!includeStrokeAndCut && entry.scope !== "cache") continue;
        if (timestamp - entry.lastUsedAtMs < minIdleMs) continue;
        candidateIds.push(entry.id);
      }

      let reclaimedCount = 0;
      let reclaimedBytes = 0;
      for (const id of candidateIds) {
        const entry = releaseEntryInternal(id);
        if (!entry) continue;
        reclaimedCount += 1;
        reclaimedBytes += entry.bytes;
        reclaimedByKind[entry.kind] += 1;
      }

      const result: GpuCacheReclaimResult = Object.freeze({
        reclaimedCount,
        reclaimedBytes,
        reclaimedByKind: Object.freeze(reclaimedByKind),
        remainingActiveCount: active.size,
        remainingActiveBytes: activeBytes,
        completedAtMs: timestamp,
        summaryKo:
          reclaimedCount > 0
            ? `미사용 GPU 캐시 ${reclaimedCount.toLocaleString("ko-KR")}건(${formatStudioOpfsBytes(reclaimedBytes)})을 회수했습니다.`
            : "정리할 미사용 GPU 캐시가 없습니다.",
      });
      lastReclaim = result;
      emit();
      return result;
    },

    captureBaseline() {
      baselineCaptured = true;
      baselineActiveCount = active.size;
      baselineActiveBytes = activeBytes;
      emit();
    },

    recordStrokeCycle(cycleOptions = {}) {
      if (!baselineCaptured && strokeCount === 0) {
        baselineCaptured = true;
        baselineActiveCount = active.size;
        baselineActiveBytes = activeBytes;
      }
      strokeCount += 1;
      if (cycleOptions.releaseStrokeResources !== false) {
        releaseMatchingIds(
          (entry) =>
            entry.scope === "stroke"
            && !entry.pinned
            && (!cycleOptions.cutId || entry.cutId === cycleOptions.cutId),
        );
      }
      emit();
    },

    recordCutSwitch(fromCutId, _toCutId, switchOptions = {}) {
      if (!baselineCaptured && cutSwitchCount === 0) {
        baselineCaptured = true;
        baselineActiveCount = active.size;
        baselineActiveBytes = activeBytes;
      }
      cutSwitchCount += 1;
      if (fromCutId && switchOptions.releasePreviousCut !== false) {
        releaseMatchingIds((entry) => entry.cutId === fromCutId && !entry.pinned);
      }
      emit();
    },

    recordFrameSample(frameDurationMs) {
      if (!Number.isFinite(frameDurationMs) || frameDurationMs <= 0) return;
      frameRing[frameHead] = Math.max(1, Math.min(1000, frameDurationMs));
      frameHead = (frameHead + 1) % fpsWindowSize;
      if (frameSampleCount < fpsWindowSize) frameSampleCount += 1;
      emit();
    },

    attachGpuDevice(device, attachOptions) {
      deviceEpoch += 1;
      const epoch = deviceEpoch;
      deviceRecovery = Object.freeze({
        ...deviceRecovery,
        status: "active",
        currentAttempt: 0,
        lastNoticeKo: "WebGPU 디바이스 상태를 감시 중입니다.",
        lastEventAtMs: now(),
      });
      emit();
      watchDeviceLoop(device, attachOptions, epoch);

      return () => {
        if (deviceEpoch === epoch) {
          deviceEpoch += 1;
          deviceRecovery = Object.freeze({
            ...deviceRecovery,
            status: "idle",
            lastEventAtMs: now(),
          });
          emit();
        }
      };
    },

    getSoakReport() {
      return tracker.getSnapshot().soak;
    },

    getSnapshot() {
      cachedSnapshot ??= buildSnapshot();
      return cachedSnapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    disposeAll() {
      const count = releaseMatchingIds(() => true);
      deviceEpoch += 1;
      emit();
      return count;
    },
  };

  return tracker;
}

let sharedTracker: GpuResourceLeakTracker | null = null;

/** 스튜디오 전역 자가 진단 HUD·엔진이 공유하는 기본 GPU 리소스 누수 추적기. */
export function getSharedGpuResourceLeakTracker(): GpuResourceLeakTracker {
  sharedTracker ??= createGpuResourceLeakTracker();
  return sharedTracker;
}

/** 테스트 격리용 공유 추적기 초기화. */
export function resetSharedGpuResourceLeakTracker(): void {
  if (sharedTracker) {
    sharedTracker.disposeAll();
    sharedTracker = null;
  }
}
