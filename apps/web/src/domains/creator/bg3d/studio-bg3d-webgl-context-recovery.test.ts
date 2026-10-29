// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  getStudioBg3dWebglRecoverySnapshot,
  installStudioBg3dWebglContextRecovery,
  type StudioBg3dWebglRecoveryController,
  type StudioBg3dWebglRecoverySnapshot,
} from "./studio-bg3d-webgl-context-recovery";

describe("installStudioBg3dWebglContextRecovery", () => {
  it("렌더러 초기화 실패를 성공으로 표시하지 않고 명시적 재시도에서만 복구한다", async () => {
    const canvas = document.createElement("canvas");
    const invalidate = vi.fn();
    const scheduleFrame = vi.fn(() => 1);
    const resetRenderer = vi.fn().mockImplementationOnce(() => {
      throw new Error("렌더러 캐시 초기화 실패");
    });
    const onStateChange = vi.fn();
    const controller = installStudioBg3dWebglContextRecovery(canvas, {
      invalidate, scheduleFrame, resetRenderer, onStateChange,
    });
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(controller.retry()).toBe(false);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    await Promise.resolve();
    expect(controller.snapshot().phase).toBe("failed");
    expect(onStateChange.mock.calls.map(([state]) => state.phase)).toEqual(["lost", "failed"]);
    expect(invalidate).not.toHaveBeenCalled();
    expect(scheduleFrame).not.toHaveBeenCalled();
    expect(controller.retry()).toBe(true);
    await Promise.resolve();
    expect(controller.snapshot().phase).toBe("restored");
    expect(resetRenderer).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledOnce();
    controller.dispose();
    expect(controller.retry()).toBe(false);
  });

  it("복구 실패 뒤 새 context loss가 발생하면 이전 실패의 재시도를 막는다", () => {
    const canvas = document.createElement("canvas");
    const resetRenderer = vi.fn(() => { throw new Error("복구 실패"); });
    const controller = installStudioBg3dWebglContextRecovery(canvas, {
      invalidate: vi.fn(), resetRenderer,
    });
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(controller.snapshot().phase).toBe("failed");
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(controller.retry()).toBe(false);
    expect(resetRenderer).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it("keeps browser restoration available and redraws two recovery frames", async () => {
    const canvas = document.createElement("canvas");
    const invalidate = vi.fn();
    const resetRenderer = vi.fn();
    const snapshots: StudioBg3dWebglRecoverySnapshot[] = [];
    let scheduled: FrameRequestCallback = () => {
      throw new Error("redraw frame was not scheduled");
    };
    let now = 1_000;

    const controller = installStudioBg3dWebglContextRecovery(canvas, {
      invalidate,
      now: () => now,
      onStateChange: (snapshot) => snapshots.push(snapshot),
      resetRenderer,
      scheduleFrame: (callback) => {
        scheduled = callback;
        return 7;
      },
    });

    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);

    expect(lost.defaultPrevented).toBe(true);
    expect(controller.snapshot()).toMatchObject({
      degraded: false,
      lossCount: 1,
      phase: "lost",
    });

    now = 2_000;
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    await Promise.resolve();

    expect(resetRenderer).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    scheduled(2_016);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(snapshots.at(-1)).toMatchObject({
      degraded: false,
      phase: "restored",
    });
  });

  it("degrades only after repeated losses inside the rolling window", () => {
    const canvas = document.createElement("canvas");
    let now = 0;
    const controller = installStudioBg3dWebglContextRecovery(canvas, {
      invalidate: vi.fn(),
      now: () => now,
      resetRenderer: vi.fn(),
      scheduleFrame: () => 1,
    });

    for (const timestamp of [1_000, 5_000, 10_000]) {
      now = timestamp;
      canvas.dispatchEvent(
        new Event("webglcontextlost", { cancelable: true }),
      );
    }

    expect(controller.snapshot()).toMatchObject({
      degraded: true,
      lossCount: 3,
      phase: "degraded",
    });

    now = 50_000;
    canvas.dispatchEvent(
      new Event("webglcontextlost", { cancelable: true }),
    );
    expect(controller.snapshot()).toMatchObject({
      degraded: false,
      lossCount: 1,
      phase: "lost",
    });
  });

  it("cancels stale redraw work and detaches event ownership on dispose", async () => {
    const canvas = document.createElement("canvas");
    const invalidate = vi.fn();
    const cancelFrame = vi.fn();
    let scheduled: FrameRequestCallback = () => {
      throw new Error("redraw frame was not scheduled");
    };
    const controller = installStudioBg3dWebglContextRecovery(canvas, {
      cancelFrame,
      invalidate,
      resetRenderer: vi.fn(),
      scheduleFrame: (callback) => {
        scheduled = callback;
        return 99;
      },
    });

    canvas.dispatchEvent(new Event("webglcontextrestored"));
    controller.dispose();
    controller.dispose();
    await Promise.resolve();
    scheduled(1_000);
    canvas.dispatchEvent(
      new Event("webglcontextlost", { cancelable: true }),
    );

    expect(cancelFrame).toHaveBeenCalledWith(99);
    expect(invalidate).not.toHaveBeenCalled();
    expect(controller.snapshot().lossCount).toBe(0);
  });

  it.each(["dispose-first", "install-first"])("%s 재설치는 failed를 승계하며 이전 owner가 새 상태를 지우지 못한다", async (order) => {
    const canvas = document.createElement("canvas");
    const oldInvalidate = vi.fn();
    const first = installStudioBg3dWebglContextRecovery(canvas, {
      invalidate: oldInvalidate, now: () => 100,
      resetRenderer: () => { throw new Error("복구 실패"); }, scheduleFrame: () => 1,
    });
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    const failed = first.snapshot();
    expect(getStudioBg3dWebglRecoverySnapshot(canvas)).toBe(failed);
    if (order === "dispose-first") first.dispose();
    expect(getStudioBg3dWebglRecoverySnapshot(canvas)).toBe(failed);
    const resetRenderer = vi.fn();
    const invalidate = vi.fn();
    const second = installStudioBg3dWebglContextRecovery(canvas, {
      invalidate, resetRenderer, now: () => 200, scheduleFrame: () => 2,
    });
    first.dispose();
    expect(second.snapshot()).toBe(failed);
    expect(getStudioBg3dWebglRecoverySnapshot(canvas)).toBe(failed);
    expect(resetRenderer).not.toHaveBeenCalled();
    expect(first.retry()).toBe(false);
    expect(second.retry()).toBe(true);
    await Promise.resolve();
    expect(getStudioBg3dWebglRecoverySnapshot(canvas)).toMatchObject({ phase: "restored", timestamp: 200 });
    expect(invalidate).toHaveBeenCalledOnce();
    expect(oldInvalidate).not.toHaveBeenCalled();
    second.dispose();
    first.dispose();
    expect(getStudioBg3dWebglRecoverySnapshot(canvas)).toBeNull();
  });

  it("같은 canvas의 새 lease는 이전에 예약된 redraw와 늦은 dispose의 영향을 받지 않는다", async () => {
    const canvas = document.createElement("canvas");
    const invalidate = vi.fn();
    const cancelFrame = vi.fn();
    let redraw: FrameRequestCallback = () => { throw new Error("예약한 redraw가 필요합니다."); };
    const first = installStudioBg3dWebglContextRecovery(canvas, {
      invalidate, cancelFrame, resetRenderer: vi.fn(),
      scheduleFrame: (callback) => { redraw = callback; return 9; },
    });
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    const second = installStudioBg3dWebglContextRecovery(canvas, {
      invalidate: vi.fn(), resetRenderer: vi.fn(), scheduleFrame: () => 10,
    });
    const current = second.snapshot();
    first.dispose();
    await Promise.resolve();
    redraw(1_000);
    expect(cancelFrame).toHaveBeenCalledWith(9);
    expect(invalidate).not.toHaveBeenCalled();
    expect(getStudioBg3dWebglRecoverySnapshot(canvas)).toBe(current);
    second.dispose();
  });

  it("resetRenderer 중 owner가 교체되어도 이전 복구를 성공으로 발행하지 않는다", () => {
    const canvas = document.createElement("canvas");
    let replacement: StudioBg3dWebglRecoveryController | undefined;
    const onStateChange = vi.fn();
    const invalidate = vi.fn();
    const scheduleFrame = vi.fn(() => 1);
    const secondReset = vi.fn();
    const first = installStudioBg3dWebglContextRecovery(canvas, {
      invalidate, scheduleFrame, onStateChange,
      resetRenderer: () => {
        replacement = installStudioBg3dWebglContextRecovery(canvas, {
          invalidate: vi.fn(), resetRenderer: secondReset, scheduleFrame: () => 2,
        });
      },
    });
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(onStateChange.mock.calls.map(([state]) => state.phase)).toEqual(["lost"]);
    expect(scheduleFrame).not.toHaveBeenCalled();
    expect(getStudioBg3dWebglRecoverySnapshot(canvas)?.phase).toBe("lost");
    first.dispose();
    if (!replacement) throw new Error("새 controller 설치가 필요합니다.");
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(secondReset).toHaveBeenCalledOnce();
    expect(getStudioBg3dWebglRecoverySnapshot(canvas)?.phase).toBe("restored");
    replacement.dispose();
  });

  it("서로 다른 canvas의 미복구 상태와 timestamp·loss window는 섞이지 않는다", () => {
    const firstCanvas = document.createElement("canvas");
    const secondCanvas = document.createElement("canvas");
    expect(getStudioBg3dWebglRecoverySnapshot(firstCanvas)).toBeNull();
    let now = 1_000;
    const first = installStudioBg3dWebglContextRecovery(firstCanvas, {
      invalidate: vi.fn(), resetRenderer: vi.fn(), now: () => now, scheduleFrame: () => 1,
    });
    const second = installStudioBg3dWebglContextRecovery(secondCanvas, {
      invalidate: vi.fn(), resetRenderer: vi.fn(), now: () => 500, scheduleFrame: () => 2,
    });
    for (const value of [1_000, 2_000, 3_000]) {
      now = value;
      firstCanvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    }
    const degraded = first.snapshot();
    first.dispose();
    const replacement = installStudioBg3dWebglContextRecovery(firstCanvas, {
      invalidate: vi.fn(), resetRenderer: vi.fn(), now: () => now, scheduleFrame: () => 3,
    });
    expect(replacement.snapshot()).toBe(degraded);
    expect(getStudioBg3dWebglRecoverySnapshot(secondCanvas)).toBe(second.snapshot());
    expect(second.snapshot()).toMatchObject({ phase: "healthy", lossCount: 0, timestamp: 500 });
    now = 4_000;
    firstCanvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(replacement.snapshot()).toMatchObject({ phase: "degraded", lossCount: 4, timestamp: 4_000 });
    replacement.dispose();
    second.dispose();
    expect(getStudioBg3dWebglRecoverySnapshot(firstCanvas)?.phase).toBe("degraded");
    expect(getStudioBg3dWebglRecoverySnapshot(secondCanvas)).toBeNull();
  });
});
