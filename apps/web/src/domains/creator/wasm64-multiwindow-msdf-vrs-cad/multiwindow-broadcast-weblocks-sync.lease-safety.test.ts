import { afterEach, describe, expect, it, vi } from "vitest";

import {
  InMemoryBroadcastHub,
  InMemoryLockManager,
  StudioMultiWindowSyncCoordinator,
} from "./multiwindow-broadcast-weblocks-sync";

afterEach(() => vi.unstubAllGlobals());

describe("여러 창의 공유 OPFS 쓰기 잠금", () => {
  it.each([false, true])("Web Locks 미지원이면 독립 메모리 잠금으로 쓰기를 허용하지 않는다 (ifAvailable=%s)", async (ifAvailable) => {
    vi.stubGlobal("navigator", {});
    const hub = new InMemoryBroadcastHub();
    const onCommit = vi.fn();
    const windows = ["window-a", "window-b"].map((windowId) => new StudioMultiWindowSyncCoordinator({
      windowId,
      role: "main-canvas",
      broadcastChannel: hub.createChannel(),
      onOpfsCommit: onCommit,
    }));
    const write = vi.fn(async () => {
      await Promise.resolve();
      return "저장";
    });
    try {
      for (const window of windows) window.start();
      const results = await Promise.all(windows.map((window) => window.withExclusiveOpfsWriteLease(
        "save-stroke", write, { ifAvailable, bytesWrittenHint: 1_024 },
      )));
      expect(results).toEqual(windows.map(() => ({
        acquired: false, value: null, fencingToken: null, walEpoch: 0, waitDurationMs: 0,
      })));
      expect(write).not.toHaveBeenCalled();
      expect(onCommit).not.toHaveBeenCalled();
      for (const window of windows) {
        expect(window.getTelemetry()).toMatchObject({
          leaseAcquisitions: 0, leaseRejectedUnavailable: 1, walEpoch: 0, lastFencingToken: 0,
        });
      }

      // 저장이 막힌 환경에서도 읽기용 창의 상태 동기화는 계속 사용할 수 있다.
      const camera = { panX: 12, panY: 34, zoom: 2, rotationRad: 0, revision: 1 };
      windows[0]?.publishCameraDelta(camera);
      expect(windows[1]?.getLatestState().camera).toEqual(camera);
    } finally {
      for (const window of windows) window.close();
    }
  });

  it.each(["browser", "injected"] as const)("공유된 %s 잠금에서는 창들의 쓰기를 직렬화하고 결과를 전파한다", async (source) => {
    const lockManager = new InMemoryLockManager();
    vi.stubGlobal("navigator", source === "browser" ? { locks: lockManager } : {});
    const hub = new InMemoryBroadcastHub();
    const windows = ["window-a", "window-b"].map((windowId) => new StudioMultiWindowSyncCoordinator({
      windowId,
      role: "main-canvas",
      broadcastChannel: hub.createChannel(),
      ...(source === "injected" ? { lockManager } : {}),
    }));
    let activeWriters = 0;
    let peakWriters = 0;
    try {
      for (const window of windows) window.start();
      const results = await Promise.all(windows.map((window) => window.withExclusiveOpfsWriteLease(
        "save-stroke", async ({ windowId }) => {
          activeWriters += 1;
          peakWriters = Math.max(peakWriters, activeWriters);
          await Promise.resolve();
          activeWriters -= 1;
          return windowId;
        },
      )));
      expect(peakWriters).toBe(1);
      expect(results.map(({ acquired }) => acquired)).toEqual([true, true]);
      expect(results.map(({ value }) => value)).toEqual(["window-a", "window-b"]);
      expect(results.map(({ fencingToken }) => fencingToken)).toEqual([1, 2]);
      expect(windows.map((window) => window.getLatestState().walEpoch)).toEqual([2, 2]);
      expect(lockManager.getStats().peakConcurrentExclusiveHolders).toBe(1);
    } finally {
      for (const window of windows) window.close();
    }
  });
});
