import { describe, expect, it, vi } from "vitest";

import {
  WEBGPU_VRAM_CRITICAL_THRESHOLD,
  WEBGPU_VRAM_SOFT_THRESHOLD,
  WEBGPU_VRAM_WARNING_THRESHOLD,
  WebGpuMemoryFailSafeGuard,
  type WebGpuDeviceLostInfoLike,
  type WebGpuMemoryFailSafeEvent,
  type WebGpuWatchableDevice,
} from "./index";

const MB = 1024 * 1024;

describe("WebGPU VRAM 메모리 압박 Fail-Safe 가드레일", () => {
  it("75% 소프트 임계치 도달 시 미고정 LRU 타일 캐시를 오래된 순으로 선제 정리한다", () => {
    const evictedIds: string[] = [];
    const guard = new WebGpuMemoryFailSafeGuard({
      budgetBytes: 100 * MB,
      onEvictTile: (allocation) => evictedIds.push(allocation.id),
    });

    expect(WEBGPU_VRAM_SOFT_THRESHOLD).toBe(0.75);
    expect(WEBGPU_VRAM_WARNING_THRESHOLD).toBe(0.88);
    expect(WEBGPU_VRAM_CRITICAL_THRESHOLD).toBe(0.95);

    guard.trackAllocation({ id: "tile-oldest", kind: "texture", bytes: 25 * MB, lastUsedAtMs: 100 });
    guard.trackAllocation({ id: "tile-mid", kind: "texture", bytes: 25 * MB, lastUsedAtMs: 200 });
    guard.trackAllocation({ id: "tile-pinned", kind: "texture", bytes: 20 * MB, pinned: true, lastUsedAtMs: 50 });
    // 합계 70MB (70%) → 아직 nominal
    expect(guard.getSnapshot().tier).toBe("nominal");
    expect(evictedIds).toEqual([]);

    // +10MB → 80% 도달 → 75% 소프트 임계치 발동, pinned 제외 가장 오래된 tile-oldest(25MB) 정리 → 55MB
    const after = guard.trackAllocation({ id: "tile-new", kind: "texture", bytes: 10 * MB, lastUsedAtMs: 300 });
    expect(evictedIds).toEqual(["tile-oldest"]);
    expect(after.usedBytes).toBe(55 * MB);
    expect(after.activeRenderer).toBe("webgpu");
    expect(after.tier).toBe("nominal");
    expect(after.totalEvictedTiles).toBe(1);
  });

  it("88% 경고 임계치 초과 시 프리뷰 렌더 스케일을 안전 축소하고 사용자 안내 이벤트를 발행한다", () => {
    const events: WebGpuMemoryFailSafeEvent[] = [];
    const onScaleChange = vi.fn();
    const guard = new WebGpuMemoryFailSafeGuard({
      budgetBytes: 100 * MB,
      warningPreviewScale: 0.75,
      minPreviewScale: 0.5,
      onPreviewScaleChange: onScaleChange,
      onEvent: (event) => events.push(event),
    });

    // 회수 불가능한 고정 버퍼/텍스처로 90% 점유 유도
    guard.trackAllocation({ id: "pinned-layer-a", kind: "texture", bytes: 50 * MB, pinned: true });
    const snap = guard.trackAllocation({ id: "pinned-buffer-b", kind: "buffer", bytes: 40 * MB, pinned: true });

    expect(snap.tier).toBe("warning-scale-down");
    expect(snap.activeRenderer).toBe("webgpu");
    expect(snap.previewRenderScale).toBe(0.75);
    expect(snap.lastUserNoticeKo).toContain("프리뷰 해상도");
    expect(onScaleChange).toHaveBeenCalledWith(0.75, expect.stringContaining("75%"));
    expect(events.some((event) => event.kind === "preview-scale-reduced")).toBe(true);
  });

  it("95% 임계치 도달 시 진행 중인 스트로크 손실 없이 2D/CPU 안전 모드로 즉시 전환하고 복구 가능 상태를 보고한다", () => {
    const onFallback = vi.fn();
    const guard = new WebGpuMemoryFailSafeGuard({
      budgetBytes: 100 * MB,
      onFallbackToSafeRenderer: onFallback,
    });

    guard.beginActiveStroke({
      strokeId: "stroke-42",
      toolId: "ink-gpen",
      colorHex: "#1f4435",
      brushSizePx: 14,
      opacity: 0.92,
      points: [{ x: 10, y: 20, pressure: 0.5, timestampMs: 1000 }],
    });
    guard.appendActiveStrokePoint({ x: 18, y: 26, pressure: 0.72, timestampMs: 1016 });

    guard.trackAllocation({ id: "pinned-a", kind: "texture", bytes: 60 * MB, pinned: true });
    const criticalSnap = guard.trackAllocation({ id: "pinned-b", kind: "buffer", bytes: 36 * MB, pinned: true });

    expect(criticalSnap.tier).toBe("critical-fallback");
    expect(criticalSnap.activeRenderer).toBe("canvas2d-cpu-safe");
    expect(criticalSnap.canRecoverWebGpu).toBe(true);
    expect(criticalSnap.recoveryStatus).toBe("recoverable-after-cleanup");
    expect(criticalSnap.lastPreservedStroke).not.toBeNull();
    expect(criticalSnap.lastPreservedStroke?.strokeId).toBe("stroke-42");
    expect(criticalSnap.lastPreservedStroke?.points).toHaveLength(2);
    expect(onFallback).toHaveBeenCalledTimes(1);

    // 메모리 해제 전 복구 시도는 안전하게 거부
    expect(guard.attemptWebGpuRecovery().recovered).toBe(false);

    // 메모리 정리 후 복구 성공
    guard.releaseAllocation("pinned-b");
    const recovered = guard.attemptWebGpuRecovery();
    expect(recovered.recovered).toBe(true);
    expect(recovered.activeRenderer).toBe("webgpu");
    expect(guard.getSnapshot().tier).toBe("nominal");
  });

  it("GPUDevice.lost와 popErrorScope('out-of-memory') 감시기가 스트로크 보존 및 안전한 대체 렌더러 전환을 수행한다", async () => {
    let resolveLost!: (info: WebGpuDeviceLostInfoLike) => void;
    const lostPromise = new Promise<WebGpuDeviceLostInfoLike>((resolve) => {
      resolveLost = resolve;
    });
    const pushErrorScope = vi.fn();
    const popErrorScope = vi
      .fn<() => Promise<{ readonly message?: string } | null>>()
      .mockResolvedValueOnce({ message: "Failed to allocate GPUTexture: out of memory" });

    const mockDevice: WebGpuWatchableDevice = {
      lost: lostPromise,
      pushErrorScope,
      popErrorScope,
    };

    const guard = new WebGpuMemoryFailSafeGuard({ budgetBytes: 100 * MB });
    guard.attachDevice(mockDevice);
    guard.trackAllocation({ id: "tile-cache-1", kind: "texture", bytes: 30 * MB, lastUsedAtMs: 10 });
    guard.beginActiveStroke({
      strokeId: "stroke-oom",
      toolId: "watercolor-wet",
      colorHex: "#0f47a6",
      brushSizePx: 24,
      opacity: 0.8,
      points: [{ x: 100, y: 120, pressure: 0.65, timestampMs: 2000 }],
    });

    const outcome = await guard.runWithOomGuard(() => "allocated", "tile-upload");
    expect(pushErrorScope).toHaveBeenCalledWith("out-of-memory");
    expect(popErrorScope).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.fallbackEvent.kind).toBe("out-of-memory");
      expect(outcome.fallbackEvent.activeRenderer).toBe("canvas2d-cpu-safe");
      expect(outcome.fallbackEvent.preservedStroke?.strokeId).toBe("stroke-oom");
      expect(outcome.fallbackEvent.canRecoverWebGpu).toBe(true);
    }
    // OOM 시 미고정 타일 캐시가 선제 비워졌는지 확인
    expect(guard.getSnapshot().usedBytes).toBe(0);

    // 복구 후 device.lost 수신 테스트
    expect(guard.attemptWebGpuRecovery().recovered).toBe(true);
    resolveLost({ reason: "destroyed", message: "Adapter revoked" });
    await Promise.resolve();
    await Promise.resolve();

    const lostSnap = guard.getSnapshot();
    expect(lostSnap.activeRenderer).toBe("canvas2d-cpu-safe");
    expect(lostSnap.canRecoverWebGpu).toBe(false);
    expect(lostSnap.recoveryStatus).toBe("permanent-cpu-safe");
  });
});
