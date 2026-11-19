import { describe, expect, it } from "vitest";

import { StudioTouchGestureGuard } from "./studio-touch-gesture-guard";

describe("StudioTouchGestureGuard (T1 Undo/Redo + T5 Palm Rejection)", () => {
  it("T5: 스타일러스 활성 중, 펜 리프트 쿨다운(350ms) 내, 넓은 접촉 면적(>=28px) 터치를 차단한다", () => {
    const guard = new StudioTouchGestureGuard();

    expect(guard.onPointerDown({ pointerId: 1, pointerType: "pen", x: 100, y: 100, timestampMs: 1000 }).rejected).toBe(false);
    expect(guard.onPointerDown({ pointerId: 2, pointerType: "touch", x: 140, y: 180, width: 12, height: 12, timestampMs: 1020 })).toEqual({
      rejected: true,
      reason: "pen-active",
    });

    guard.onPointerUp({ pointerId: 1, pointerType: "pen", x: 110, y: 110, timestampMs: 1200 });
    expect(guard.onPointerDown({ pointerId: 3, pointerType: "touch", x: 140, y: 180, width: 12, height: 12, timestampMs: 1400 })).toEqual({
      rejected: true,
      reason: "pen-cooldown",
    });

    expect(guard.onPointerDown({ pointerId: 4, pointerType: "touch", x: 140, y: 180, width: 34, height: 30, timestampMs: 1700 })).toEqual({
      rejected: true,
      reason: "palm-contact-area",
    });

    expect(guard.onPointerDown({ pointerId: 5, pointerType: "touch", x: 140, y: 180, width: 10, height: 10, timestampMs: 1750 })).toEqual({
      rejected: false,
      reason: "accepted",
    });
  });

  it("T1: 두 손가락 탭은 undo, 세 손가락 탭은 redo를 발행한다", () => {
    const guard = new StudioTouchGestureGuard();

    // 2-finger tap -> undo
    guard.onPointerDown({ pointerId: 10, pointerType: "touch", x: 100, y: 100, timestampMs: 2000 });
    guard.onPointerDown({ pointerId: 11, pointerType: "touch", x: 150, y: 100, timestampMs: 2015 });
    expect(guard.onPointerUp({ pointerId: 10, pointerType: "touch", x: 101, y: 100, timestampMs: 2110 })).toEqual({ type: "none" });
    expect(guard.onPointerUp({ pointerId: 11, pointerType: "touch", x: 151, y: 101, timestampMs: 2120 })).toEqual({
      type: "undo",
      source: "tap",
    });

    // 3-finger tap -> redo
    guard.onPointerDown({ pointerId: 20, pointerType: "touch", x: 100, y: 100, timestampMs: 3000 });
    guard.onPointerDown({ pointerId: 21, pointerType: "touch", x: 140, y: 100, timestampMs: 3010 });
    guard.onPointerDown({ pointerId: 22, pointerType: "touch", x: 180, y: 100, timestampMs: 3020 });
    guard.onPointerUp({ pointerId: 20, pointerType: "touch", x: 100, y: 100, timestampMs: 3100 });
    guard.onPointerUp({ pointerId: 21, pointerType: "touch", x: 140, y: 100, timestampMs: 3110 });
    expect(guard.onPointerUp({ pointerId: 22, pointerType: "touch", x: 180, y: 100, timestampMs: 3120 })).toEqual({
      type: "redo",
      source: "tap",
    });
  });

  it("T1: 14px 초과 이동(핀치/팬)은 취소되고, 500ms 이상 홀드 시 연속 스크럽을 발행한다", () => {
    const guard = new StudioTouchGestureGuard();

    // Drag/pinch cancels tap
    guard.onPointerDown({ pointerId: 30, pointerType: "touch", x: 100, y: 100, timestampMs: 4000 });
    guard.onPointerDown({ pointerId: 31, pointerType: "touch", x: 150, y: 100, timestampMs: 4010 });
    guard.onPointerMove({ pointerId: 30, pointerType: "touch", x: 130, y: 100, timestampMs: 4050 });
    guard.onPointerUp({ pointerId: 30, pointerType: "touch", x: 130, y: 100, timestampMs: 4100 });
    expect(guard.onPointerUp({ pointerId: 31, pointerType: "touch", x: 150, y: 100, timestampMs: 4110 })).toEqual({
      type: "none",
    });

    // 2-finger hold scrub
    guard.onPointerDown({ pointerId: 40, pointerType: "touch", x: 100, y: 100, timestampMs: 5000 });
    guard.onPointerDown({ pointerId: 41, pointerType: "touch", x: 150, y: 100, timestampMs: 5010 });
    expect(guard.pollHoldScrub(5400)).toEqual({ type: "none" });
    expect(guard.pollHoldScrub(5520)).toEqual({ type: "undo", source: "scrub" });
    expect(guard.pollHoldScrub(5580)).toEqual({ type: "none" });
    expect(guard.pollHoldScrub(5650)).toEqual({ type: "undo", source: "scrub" });
    // After scrub, lifting fingers must not fire an extra tap undo
    guard.onPointerUp({ pointerId: 40, pointerType: "touch", x: 100, y: 100, timestampMs: 5700 });
    expect(guard.onPointerUp({ pointerId: 41, pointerType: "touch", x: 150, y: 100, timestampMs: 5710 })).toEqual({
      type: "none",
    });
  });
});
