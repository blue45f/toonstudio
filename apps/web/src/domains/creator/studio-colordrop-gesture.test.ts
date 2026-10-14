import { describe, expect, it } from "vitest";

import {
  beginColorDrop,
  beginColorDropSession,
  colorDropFillInput,
  colorDropGestureView,
  endColorDrop,
  endColorDropSession,
  moveColorDrop,
  moveColorDropSession,
  percentToTolerance,
  toleranceToPercent,
} from "./studio-colordrop-gesture";

describe("ColorDrop percent/tolerance conversion", () => {
  it("maps the full percent range onto tolerance 0..255 and back", () => {
    expect(percentToTolerance(0)).toBe(0);
    expect(percentToTolerance(100)).toBe(255);
    expect(percentToTolerance(50)).toBe(128);
    expect(toleranceToPercent(0)).toBe(0);
    expect(toleranceToPercent(255)).toBe(100);
    expect(toleranceToPercent(32)).toBe(13);
  });

  it("clamps out-of-range and non-finite inputs instead of leaking them to the engine", () => {
    expect(percentToTolerance(140)).toBe(255);
    expect(percentToTolerance(-20)).toBe(0);
    expect(percentToTolerance(Number.NaN)).toBe(0);
    expect(toleranceToPercent(999)).toBe(100);
    expect(toleranceToPercent(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("ColorDrop drag state machine", () => {
  it("raises the percent while dragging sideways and reports crossed 10% ticks", () => {
    const started = beginColorDrop(100, 50, 10);
    const moved = moveColorDrop(started, 160);

    expect(moved.state.phase).toBe("dragging");
    expect(moved.state.percent).toBe(40);
    expect(moved.crossedTicks).toEqual([20, 30, 40]);
    expect(colorDropFillInput(moved.state)).toEqual({ tolerance: 102, preview: true });
  });

  it("restores the starting percent on cancel and keeps it on commit", () => {
    const started = beginColorDrop(100, 50, 10);
    const dragged = moveColorDrop(started, 200).state;

    const cancelled = endColorDrop(dragged, false);
    expect(cancelled.phase).toBe("cancelled");
    expect(cancelled.percent).toBe(10);

    const committed = endColorDrop(dragged, true);
    expect(committed.phase).toBe("committed");
    expect(committed.percent).toBe(60);
    expect(colorDropFillInput(committed).preview).toBe(false);
  });

  it("ignores moves outside an active press", () => {
    const started = beginColorDrop(0, 0, 25);
    const committed = endColorDrop(started, true);
    expect(moveColorDrop(committed, 300).state).toBe(committed);
  });
});

describe("ColorDrop pointer session", () => {
  const press = { pointerId: 1, point: { x: 100, y: 50 }, button: 0, isPrimary: true };

  it("keeps a plain tap a tap: no threshold change inside the tap threshold", () => {
    const session = beginColorDropSession(null, press, 32);
    const moved = moveColorDropSession(session, 1, { x: 106, y: 52 });

    expect(moved.previewTolerance).toBeNull();
    expect(moved.session.drop.phase).toBe("pressing");
    expect(endColorDropSession(moved.session, 1).outcome).toEqual({ type: "tap" });
  });

  it("commits the dragged tolerance on release so the fill widens with the drag", () => {
    const session = beginColorDropSession(null, press, 32);
    const moved = moveColorDropSession(session, 1, { x: 220, y: 50 });

    expect(moved.session.drop.phase).toBe("dragging");
    // start 13% (tolerance 32) + 120px * 0.5 = 73% -> tolerance 186.
    expect(moved.previewTolerance).toBe(186);
    expect(moved.crossedTicks).toEqual([20, 30, 40, 50, 60, 70]);
    expect(endColorDropSession(moved.session, 1).outcome).toEqual({
      type: "commit",
      tolerance: 186,
      percent: 73,
    });
  });

  it("restores the original tolerance when the drag is cancelled", () => {
    const session = beginColorDropSession(null, press, 32);
    const moved = moveColorDropSession(session, 1, { x: 220, y: 50 });

    expect(endColorDropSession(moved.session, 1, true).outcome).toEqual({
      type: "restore",
      restoreTolerance: 32,
    });
  });

  it("blocks a second finger and secondary buttons like the tap recognizer", () => {
    const session = beginColorDropSession(null, press, 32);
    const pinched = beginColorDropSession(session, {
      pointerId: 2,
      point: { x: 200, y: 50 },
      button: 0,
      isPrimary: false,
    });
    expect(pinched.blocked).toBe(true);
    expect(moveColorDropSession(pinched, 1, { x: 300, y: 50 }).previewTolerance).toBeNull();

    const secondary = beginColorDropSession(null, { ...press, pointerId: 3, button: 2 }, 32);
    expect(secondary.blocked).toBe(true);
    expect(endColorDropSession(secondary, 3).outcome).toEqual({ type: "none" });
  });

  it("exposes a panel view only while a gesture is live", () => {
    const session = beginColorDropSession(null, press, 32);
    expect(colorDropGestureView(session)).toEqual({ percent: 13, startPercent: 13 });

    const moved = moveColorDropSession(session, 1, { x: 140, y: 50 }).session;
    expect(colorDropGestureView(moved)).toEqual({ percent: 33, startPercent: 13 });
    expect(colorDropGestureView(null)).toBeNull();
  });
});
