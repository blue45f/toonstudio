// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioDraftSaveCenter } from "../StudioDraftSaveCenter";
import { createStudioOpfsMemoryFileSystem, isStudioOpfsError } from "../studio-opfs-filesystem";
import { resetStudioReliabilityStatus } from "../studio-reliability-status-store";
import {
  createDefaultHistoryOpfsSpillStore,
  createGpuResourceLeakTracker,
  createHistoryOpfsSpillStore,
  resetSharedGpuResourceLeakTracker,
  resetSharedHistoryOpfsSpillStore,
  SESSION_ENDURANCE_MAX_LEAK_GROWTH_RATIO,
  StudioEnduranceGuardChip,
  type GpuDeviceLostInfoLike,
  type HistorySpillStateRecord,
  type WatchableGpuDeviceLike,
} from "./index";

function createDeferredDevice(): {
  readonly device: WatchableGpuDeviceLike;
  readonly triggerLost: (info: GpuDeviceLostInfoLike) => void;
} {
  let resolveLost: ((info: GpuDeviceLostInfoLike) => void) | null = null;
  const lost = new Promise<GpuDeviceLostInfoLike>((resolve) => {
    resolveLost = resolve;
  });
  return {
    device: { lost, destroy: vi.fn() },
    triggerLost: (info) => {
      resolveLost?.(info);
    },
  };
}

function cloneRecord(record: HistorySpillStateRecord): HistorySpillStateRecord {
  return JSON.parse(JSON.stringify(record)) as HistorySpillStateRecord;
}

afterEach(() => {
  cleanup();
  resetSharedGpuResourceLeakTracker();
  resetSharedHistoryOpfsSpillStore();
  resetStudioReliabilityStatus();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("gpu-resource-leak-tracker", () => {
  it("500스트로크·50컷 전환 소크에서 5종 리소스 해제와 활성 증가율 <= 5%를 보장한다", () => {
    const revokedUrls: string[] = [];
    const tracker = createGpuResourceLeakTracker({
      vramBudgetBytes: 256 * 1024 * 1024,
      revokeObjectUrl: (url) => {
        revokedUrls.push(url);
      },
    });

    const gpuTextureDestroy = vi.fn();
    const gpuBufferDestroy = vi.fn();
    const threeTextureDispose = vi.fn();
    const bitmapClose = vi.fn();

    // 기준선(persistent 캔버스 기반 자원 10건: 5종 각 2건) 등록
    for (let i = 0; i < 2; i += 1) {
      tracker.track({ id: `base-tex-${i}`, kind: "gpu-texture", handle: { destroy: gpuTextureDestroy }, bytes: 2 * 1024 * 1024, scope: "persistent", pinned: true });
      tracker.track({ id: `base-buf-${i}`, kind: "gpu-buffer", handle: { destroy: gpuBufferDestroy }, bytes: 512 * 1024, scope: "persistent", pinned: true });
      tracker.track({ id: `base-three-${i}`, kind: "three-texture", handle: { dispose: threeTextureDispose }, bytes: 1024 * 1024, scope: "persistent", pinned: true });
      tracker.track({ id: `base-bmp-${i}`, kind: "image-bitmap", handle: { close: bitmapClose }, bytes: 256 * 1024, scope: "persistent", pinned: true });
      tracker.track({ id: `base-url-${i}`, kind: "object-url", handle: `blob:base-${i}`, bytes: 64 * 1024, scope: "persistent", pinned: true });
    }
    tracker.captureBaseline();

    let currentCutId = "cut-0";
    // 50컷 전환 × 컷당 10스트로크 = 500스트로크 + 50컷 전환
    for (let cut = 1; cut <= 50; cut += 1) {
      const nextCutId = `cut-${cut}`;
      tracker.recordCutSwitch(currentCutId, nextCutId);
      currentCutId = nextCutId;

      tracker.track({ id: `cut-three-${cut}`, kind: "three-texture", handle: { dispose: threeTextureDispose }, bytes: 512 * 1024, scope: "cut", cutId: currentCutId });
      tracker.track({ id: `cut-bmp-${cut}`, kind: "image-bitmap", handle: { close: bitmapClose }, bytes: 128 * 1024, scope: "cut", cutId: currentCutId });
      tracker.track({ id: `cut-url-${cut}`, kind: "object-url", handle: `blob:cut-${cut}`, bytes: 32 * 1024, scope: "cut", cutId: currentCutId });

      for (let stroke = 0; stroke < 10; stroke += 1) {
        const strokeIndex = (cut - 1) * 10 + stroke;
        tracker.track({ id: `s-tex-${strokeIndex}`, kind: "gpu-texture", handle: { destroy: gpuTextureDestroy }, bytes: 256 * 1024, scope: "stroke", cutId: currentCutId });
        tracker.track({ id: `s-buf-${strokeIndex}`, kind: "gpu-buffer", handle: { destroy: gpuBufferDestroy }, bytes: 64 * 1024, scope: "stroke", cutId: currentCutId });
        tracker.track({ id: `s-url-${strokeIndex}`, kind: "object-url", handle: `blob:stroke-${strokeIndex}`, bytes: 8 * 1024, scope: "stroke", cutId: currentCutId });
        tracker.recordStrokeCycle({ cutId: currentCutId });
      }
    }
    // 마지막 컷(cut-50) 정리
    tracker.releaseByCut(currentCutId);

    const report = tracker.getSoakReport();
    expect(report.strokeCount).toBe(500);
    expect(report.cutSwitchCount).toBe(50);
    expect(report.activeCount).toBe(10);
    expect(report.leakGrowthRatio).toBeLessThanOrEqual(SESSION_ENDURANCE_MAX_LEAK_GROWTH_RATIO);
    expect(report.withinBudget).toBe(true);
    expect(report.status).toBe("healthy");

    // 5종 리소스 해제기 실호출 검증
    expect(gpuTextureDestroy).toHaveBeenCalledTimes(500);
    expect(gpuBufferDestroy).toHaveBeenCalledTimes(500);
    expect(threeTextureDispose).toHaveBeenCalledTimes(50);
    expect(bitmapClose).toHaveBeenCalledTimes(50);
    expect(revokedUrls).toHaveLength(550);
  });

  it("5% 초과 누수를 탐지하고 1클릭 미사용 GPU 캐시 회수로 정상화한다", () => {
    const revokedUrls: string[] = [];
    const tracker = createGpuResourceLeakTracker({
      revokeObjectUrl: (url) => {
        revokedUrls.push(url);
      },
    });
    const disposeStub = vi.fn();

    for (let i = 0; i < 20; i += 1) {
      tracker.track({ id: `pin-${i}`, kind: "gpu-texture", handle: { destroy: disposeStub }, bytes: 1024 * 1024, scope: "persistent", pinned: true });
    }
    tracker.captureBaseline();

    // 비고정 캐시 4건(+20% > 5%) 누적
    tracker.track({ id: "cache-tex", kind: "gpu-texture", handle: { destroy: disposeStub }, bytes: 4 * 1024 * 1024, scope: "cache" });
    tracker.track({ id: "cache-buf", kind: "gpu-buffer", handle: { destroy: disposeStub }, bytes: 2 * 1024 * 1024, scope: "cache" });
    tracker.track({ id: "cache-three", kind: "three-texture", handle: { dispose: disposeStub }, bytes: 3 * 1024 * 1024, scope: "cache" });
    tracker.track({ id: "cache-url", kind: "object-url", handle: "blob:cache-preview", bytes: 1024 * 1024, scope: "cache" });

    expect(tracker.getSoakReport().withinBudget).toBe(false);
    expect(tracker.getSoakReport().leakGrowthRatio).toBeGreaterThan(SESSION_ENDURANCE_MAX_LEAK_GROWTH_RATIO);
    expect(tracker.getSoakReport().status).toBe("critical");

    const reclaimed = tracker.reclaimUnusedCaches();
    expect(reclaimed.reclaimedCount).toBe(4);
    expect(reclaimed.reclaimedBytes).toBe(10 * 1024 * 1024);
    expect(reclaimed.remainingActiveCount).toBe(20);
    expect(reclaimed.summaryKo).toContain("4건");
    expect(disposeStub).toHaveBeenCalledTimes(3);
    expect(revokedUrls).toEqual(["blob:cache-preview"]);
    expect(tracker.getSoakReport().withinBudget).toBe(true);
    expect(tracker.getSoakReport().status).toBe("healthy");
  });

  it("device.lost 발생 시 유실 GPU 자원을 정리하고 재시도 후 자동 복구한다", async () => {
    const tracker = createGpuResourceLeakTracker({
      sleep: async () => undefined,
    });
    const first = createDeferredDevice();
    const second = createDeferredDevice();
    const third = createDeferredDevice();

    const texDestroy = vi.fn();
    const bufDestroy = vi.fn();
    const bmpClose = vi.fn();

    tracker.track({ id: "lost-tex", kind: "gpu-texture", handle: { destroy: texDestroy }, bytes: 4 * 1024 * 1024, scope: "persistent", pinned: true });
    tracker.track({ id: "lost-buf", kind: "gpu-buffer", handle: { destroy: bufDestroy }, bytes: 1024 * 1024, scope: "cache" });
    tracker.track({ id: "keep-bmp", kind: "image-bitmap", handle: { close: bmpClose }, bytes: 512 * 1024, scope: "persistent", pinned: true });

    const onDeviceLost = vi.fn();
    const onDeviceRecovered = vi.fn();
    const requestDevice = vi.fn(async (attempt: number) => {
      if (attempt === 1) throw new Error("임시 GPU 어댑터 대기");
      return second.device;
    });

    tracker.attachGpuDevice(first.device, {
      requestDevice,
      maxAttempts: 3,
      baseRetryDelayMs: 10,
      onDeviceLost,
      onDeviceRecovered,
    });

    first.triggerLost({ reason: "unknown", message: "driver timeout" });
    await vi.waitFor(() => {
      expect(tracker.getSnapshot().deviceRecovery.status).toBe("recovered");
    });

    expect(onDeviceLost).toHaveBeenCalledTimes(1);
    expect(onDeviceLost).toHaveBeenCalledWith({ reason: "unknown", message: "driver timeout" }, 2);
    expect(requestDevice).toHaveBeenCalledTimes(2);
    expect(onDeviceRecovered).toHaveBeenCalledWith(second.device, 2);
    expect(texDestroy).toHaveBeenCalledTimes(1);
    expect(bufDestroy).toHaveBeenCalledTimes(1);
    // GPU 디바이스에 종속되지 않은 ImageBitmap은 유지된다.
    expect(bmpClose).not.toHaveBeenCalled();
    expect(tracker.has("keep-bmp")).toBe(true);

    // 복구된 두 번째 디바이스의 연쇄 유실도 계속 감시한다.
    requestDevice.mockResolvedValueOnce(third.device);
    second.triggerLost({ reason: "unknown", message: "second reset" });
    await vi.waitFor(() => {
      expect(tracker.getSnapshot().deviceRecovery.recoverySuccessCount).toBe(2);
    });

    // 의도적 destroyed 종료는 불필요한 재복구를 수행하지 않는다.
    third.triggerLost({ reason: "destroyed", message: "clean shutdown" });
    await vi.waitFor(() => {
      expect(tracker.getSnapshot().deviceRecovery.status).toBe("idle");
    });
    expect(tracker.getSnapshot().deviceRecovery.lossCount).toBe(2);
  });

  it("device.lost 복구가 모두 실패하면 CPU 안전 대체 상태로 전환한다", async () => {
    const tracker = createGpuResourceLeakTracker({
      sleep: async () => undefined,
    });
    const first = createDeferredDevice();
    const onFallbackToCpuSafe = vi.fn();
    const requestDevice = vi.fn(async () => null);

    tracker.attachGpuDevice(first.device, {
      requestDevice,
      maxAttempts: 2,
      baseRetryDelayMs: 5,
      onFallbackToCpuSafe,
    });

    first.triggerLost({ reason: "unknown", message: "adapter removed" });
    await vi.waitFor(() => {
      expect(tracker.getSnapshot().deviceRecovery.status).toBe("cpu-fallback");
    });

    expect(requestDevice).toHaveBeenCalledTimes(2);
    expect(onFallbackToCpuSafe).toHaveBeenCalledTimes(1);
    expect(tracker.getSnapshot().overallStatus).toBe("critical");
  });
});

describe("history-opfs-spill-store", () => {
  it("2,000-step 델타 압축·OPFS 자동 스필 후 강제 새로고침에서 0손실 복원 및 전 구간 Undo/Redo를 보장한다", async () => {
    const opfs = createStudioOpfsMemoryFileSystem();
    const initialState: HistorySpillStateRecord = {
      cut: 0,
      activeLayer: "ink",
      palette: "#111111",
      strokesCount: 0,
    };
    const store = createHistoryOpfsSpillStore({
      sessionId: "soak-2000-episode-1",
      initialState,
      fs: opfs,
      durability: "durable",
      maxRamBytes: 48 * 1024,
      spillBatchSize: 32,
      minHotSteps: 8,
    });

    const checkpoints = new Map<number, HistorySpillStateRecord>([[0, cloneRecord(initialState)]]);
    const sampleIndices = new Set([1, 250, 500, 1000, 1500, 1999, 2000]);

    let working: Record<string, string | number | boolean | null> = {
      cut: 0,
      activeLayer: "ink",
      palette: "#111111",
      strokesCount: 0,
    };

    for (let step = 1; step <= 2000; step += 1) {
      const cut = Math.floor((step - 1) / 40);
      working = {
        ...working,
        cut,
        strokesCount: step,
        [`layer_${cut % 6}`]: `path-${step}-pts-${(step * 17) % 997}-${"x".repeat(48)}`,
      };
      if (step % 25 === 0) {
        working.tempDraft = `draft-${step}`;
      } else if (step % 25 === 5) {
        delete working.tempDraft;
      }
      await store.pushStep({
        label: `획 #${step}`,
        cutId: `cut-${cut}`,
        nextState: working,
        timestampMs: 1_700_000_000_000 + step * 100,
      });

      if (sampleIndices.has(step)) {
        checkpoints.set(step, cloneRecord(working));
      }
    }

    const beforeReload = store.getSnapshot();
    expect(beforeReload.totalStepCount).toBe(2000);
    expect(beforeReload.cursorSequence).toBe(2000);
    expect(beforeReload.ramBytes).toBeLessThanOrEqual(beforeReload.ramBudgetBytes);
    expect(beforeReload.spillCount).toBeGreaterThanOrEqual(20);
    expect(beforeReload.spilledStepCount).toBeGreaterThanOrEqual(1800);
    expect(beforeReload.segmentCount).toBeGreaterThanOrEqual(20);

    // 강제 새로고침 시뮬레이션: 메모리 힙을 완전히 비우고 OPFS 파일만 보존한 새 인스턴스로 복원
    opfs.restart();
    const restored = createHistoryOpfsSpillStore({
      sessionId: "soak-2000-episode-1",
      initialState: {},
      fs: opfs,
      durability: "durable",
      maxRamBytes: 48 * 1024,
      spillBatchSize: 32,
      minHotSteps: 8,
    });

    const restoreResult = await restored.restoreFromCheckpoint();
    expect(restoreResult.restored).toBe(true);
    expect(restoreResult.restoredSteps).toBe(2000);
    expect(restoreResult.cursorSequence).toBe(2000);
    expect(restoreResult.spilledSteps).toBe(beforeReload.spilledStepCount);
    expect(restored.getCurrentState()).toEqual(checkpoints.get(2000));

    // 2,000 → 0 전 구간 Undo: 스필된 세그먼트들을 OPFS에서 온디맨드 복원하면서도 RAM 상한 준수
    let hydratedFromOpfsCount = 0;
    for (let target = 1999; target >= 0; target -= 1) {
      const nav = await restored.undo();
      expect(nav.moved).toBe(true);
      expect(nav.sequence).toBe(target);
      if (nav.hydratedFromOpfs) hydratedFromOpfsCount += 1;
      if (sampleIndices.has(target) || target === 0) {
        expect(nav.state).toEqual(checkpoints.get(target));
        expect(restored.getSnapshot().ramBytes).toBeLessThanOrEqual(restored.getSnapshot().ramBudgetBytes);
      }
    }
    expect(hydratedFromOpfsCount).toBeGreaterThanOrEqual(20);
    expect((await restored.undo()).moved).toBe(false);

    // 0 → 2,000 전 구간 Redo: 최종 상태 100% 일치
    for (let target = 1; target <= 2000; target += 1) {
      const nav = await restored.redo();
      expect(nav.moved).toBe(true);
      expect(nav.sequence).toBe(target);
      if (sampleIndices.has(target)) {
        expect(nav.state).toEqual(checkpoints.get(target));
      }
    }
    expect(restored.getCurrentState()).toEqual(checkpoints.get(2000));
  });

  it("콜드 스필 구간으로 Undo 뒤 새 분기를 기록하면 미래 세그먼트를 정리하고 재시작 후에도 정확히 복원한다", async () => {
    const opfs = createStudioOpfsMemoryFileSystem();
    const store = createHistoryOpfsSpillStore({
      sessionId: "branch-truncate-case",
      initialState: { v: 0 },
      fs: opfs,
      durability: "durable",
      maxRamBytes: 12 * 1024,
      spillBatchSize: 10,
      minHotSteps: 4,
    });

    for (let i = 1; i <= 120; i += 1) {
      await store.pushStep({
        label: `단계 ${i}`,
        nextState: { v: i, blob: `payload-${i}-${"a".repeat(120)}` },
      });
    }
    expect(store.getSnapshot().spilledStepCount).toBeGreaterThan(60);

    // 스필된 콜드 영역(45단계)까지 되돌린 뒤 새 분기 기록
    for (let i = 0; i < 75; i += 1) {
      await store.undo();
    }
    expect(store.getSnapshot().cursorSequence).toBe(45);

    await store.pushStep({
      label: "새 분기 단계",
      nextState: { v: 999, branch: "alt" },
    });
    expect(store.getSnapshot().cursorSequence).toBe(46);
    expect(store.getSnapshot().totalStepCount).toBe(46);
    expect(store.getSnapshot().canRedo).toBe(false);

    opfs.restart();
    const reopened = createHistoryOpfsSpillStore({
      sessionId: "branch-truncate-case",
      fs: opfs,
      durability: "durable",
      maxRamBytes: 12 * 1024,
      spillBatchSize: 10,
      minHotSteps: 4,
    });
    const restored = await reopened.restoreFromCheckpoint();
    expect(restored.restored).toBe(true);
    expect(restored.cursorSequence).toBe(46);
    expect(restored.state).toEqual({ v: 999, branch: "alt" });
  });

  it("손상된 OPFS 스필 세그먼트를 CRC-32로 탐지하고 OPFS 미지원 환경에서는 메모리 전용을 명시한다", async () => {
    const opfs = createStudioOpfsMemoryFileSystem();
    const store = createHistoryOpfsSpillStore({
      sessionId: "crc-integrity-case",
      initialState: { step: 0 },
      fs: opfs,
      durability: "durable",
      maxRamBytes: 8 * 1024,
      spillBatchSize: 8,
      minHotSteps: 2,
    });

    for (let i = 1; i <= 60; i += 1) {
      await store.pushStep({
        label: `step-${i}`,
        nextState: { step: i, detail: `stroke-${i}-${"z".repeat(140)}` },
      });
    }

    const segmentFiles = (await opfs.list("h/")).filter((path) => path.includes("/seg-"));
    expect(segmentFiles.length).toBeGreaterThan(0);
    const lastSegPath = segmentFiles[segmentFiles.length - 1]!;
    const bytes = await opfs.read(lastSegPath);
    expect(bytes).not.toBeNull();
    bytes![0] = (bytes![0]! ^ 0xff) & 0xff;
    await opfs.write(lastSegPath, bytes!);

    // 핫 테일을 모두 되돌린 뒤 손상된 세그먼트 경계에 진입하면 INTEGRITY_FAILED 오류를 던진다.
    const hotCount = store.getSnapshot().hotStepCount;
    for (let i = 0; i < hotCount; i += 1) {
      await store.undo();
    }
    let caught: unknown = null;
    try {
      await store.undo();
    } catch (error) {
      caught = error;
    }
    expect(isStudioOpfsError(caught)).toBe(true);
    if (isStudioOpfsError(caught)) {
      expect(caught.code).toBe("INTEGRITY_FAILED");
    }

    const fallbackStore = await createDefaultHistoryOpfsSpillStore(
      { sessionId: "no-opfs-env" },
      { navigator: {} },
    );
    expect(fallbackStore.getSnapshot().durability).toBe("memory-only");
  });
});

describe("StudioEnduranceGuardChip", () => {
  it("기본 접힘 상태를 유지하고 토글·임계치 표시·1클릭 GPU 캐시 정리·Escape 닫기를 검증한다", async () => {
    const tracker = createGpuResourceLeakTracker({
      vramBudgetBytes: 100 * 1024 * 1024,
    });
    const opfs = createStudioOpfsMemoryFileSystem();
    const historyStore = createHistoryOpfsSpillStore({
      sessionId: "hud-chip-test",
      fs: opfs,
      durability: "durable",
      maxRamBytes: 16 * 1024,
      spillBatchSize: 6,
      minHotSteps: 2,
    });

    const destroyStub = vi.fn();
    tracker.track({ id: "pin-canvas", kind: "gpu-texture", handle: { destroy: destroyStub }, bytes: 20 * 1024 * 1024, scope: "persistent", pinned: true });
    tracker.captureBaseline();
    tracker.track({ id: "idle-cache-1", kind: "gpu-texture", handle: { destroy: destroyStub }, bytes: 40 * 1024 * 1024, scope: "cache" });
    tracker.track({ id: "idle-cache-2", kind: "three-texture", handle: { dispose: destroyStub }, bytes: 20 * 1024 * 1024, scope: "cache" });
    tracker.recordFrameSample(26); // ~38 fps (warning)

    for (let i = 1; i <= 30; i += 1) {
      await historyStore.pushStep({
        label: `히스토리 ${i}`,
        nextState: { i, stroke: `line-${i}-${"m".repeat(120)}` },
      });
    }

    const onReclaimGpuCache = vi.fn();
    render(
      <StudioEnduranceGuardChip
        tracker={tracker}
        historyStore={historyStore}
        onReclaimGpuCache={onReclaimGpuCache}
      />,
    );

    // 기본 접힘 상태: 대화상자 미표시, >= 44px 터치 영역(min-h-11) 보장
    const trigger = screen.getByRole("button", { name: /^세션 자가 진단:/u });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.className).toContain("min-h-11");
    expect(screen.queryByRole("dialog", { name: "장시간 세션 자가 진단" })).toBeNull();

    // 토글 열기
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "장시간 세션 자가 진단" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(dialog.className).toContain("[word-break:keep-all]");
    expect(within(dialog).getByText("VRAM · GPU 자원")).not.toBeNull();
    expect(within(dialog).getByText("히스토리 · OPFS 스필")).not.toBeNull();
    expect(within(dialog).getByText("프레임 속도 (FPS)")).not.toBeNull();
    expect(dialog.querySelectorAll(".tabular-nums").length).toBeGreaterThan(3);

    // 1클릭 GPU 캐시 정리 실행
    const reclaimBtn = within(dialog).getByRole("button", { name: /미사용 GPU 캐시 정리/u });
    expect(reclaimBtn.className).toContain("min-h-11");
    fireEvent.click(reclaimBtn);

    expect(onReclaimGpuCache).toHaveBeenCalledTimes(1);
    expect(destroyStub).toHaveBeenCalledTimes(2);
    expect(tracker.getSnapshot().activeCount).toBe(1);
    expect(within(dialog).getByRole("status").textContent).toContain("2건");

    // 60fps 복구 시 FPS 임계치 상태가 즉시 안정으로 전환
    act(() => {
      for (let i = 0; i < 60; i += 1) {
        tracker.recordFrameSample(16.6);
      }
    });
    expect(dialog.querySelector('[data-studio-endurance-metric="fps"]')?.getAttribute("data-metric-status")).toBe("healthy");

    // Escape 키로 닫고 토글 버튼으로 초점 복귀
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "장시간 세션 자가 진단" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("canvasOnlyMode 정상 상태에서는 최소 아이콘 칩(w-11)으로 축소하고 StudioDraftSaveCenter와 충돌 없이 마운트된다", () => {
    render(
      <StudioDraftSaveCenter
        saving={false}
        workId="work-endurance-1"
        workHydrated
        workHydrationFailed={false}
        loadedWork={{ id: "work-endurance-1", revision: 3 }}
        localCheckpointCount={2}
        serverCurrentRevision={3}
        canvasOnlyMode
        onSaveDraft={() => Promise.resolve()}
        onOpenVersions={() => undefined}
        onExportBackup={() => Promise.resolve()}
      />,
    );

    const trigger = screen.getByRole("button", { name: /^세션 자가 진단:/u });
    expect(trigger.getAttribute("data-endurance-compact")).toBe("true");
    expect(trigger.className).toContain("w-11");
    expect(trigger.className).toContain("min-h-11");
    // 기존 저장 상태 칩도 정상 동작한다.
    expect(screen.getByRole("button", { name: /^저장 상태:/u })).not.toBeNull();
  });
});
