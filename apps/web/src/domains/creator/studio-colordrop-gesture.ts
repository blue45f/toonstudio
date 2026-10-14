/**
 * ColorDrop drag-threshold gesture for Advanced Fill (Procreate-style).
 *
 * The fill engine (studio-advanced-fill) and its settings contract stay untouched: this module is
 * the gesture layer only. Pressing a fill point starts a preview at the current tolerance; dragging
 * sideways converts horizontal movement into a threshold percent, the preview follows in real
 * time, releasing commits the fill at the final tolerance (and remembers it as the new setting),
 * and cancelling restores the tolerance that was in effect when the press started.
 *
 * Percent is the gesture-facing unit because that is what the artist reads on canvas; the engine
 * keeps consuming tolerance 0..255. Conversions are the single bridge between the two.
 */

import {
  STUDIO_ADVANCED_FILL_TAP_MAX_MOVEMENT_PX,
  type StudioAdvancedFillPointerStart,
  type StudioAdvancedFillTapPoint,
} from "./studio-advanced-fill-tap";

export type ColorDropPhase = "idle" | "pressing" | "dragging" | "committed" | "cancelled";

export interface ColorDropState {
  readonly phase: ColorDropPhase;
  readonly anchorX: number;
  readonly anchorY: number;
  /** Threshold percent when the press started; cancel restores exactly this value. */
  readonly startPercent: number;
  readonly percent: number;
}

/** Drag sensitivity: 200px of horizontal drag spans the full 0..100% range. */
export const COLORDROP_PERCENT_PER_PX = 0.5;

export const COLORDROP_PERCENT_RANGE = { min: 0, max: 100 } as const;

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return COLORDROP_PERCENT_RANGE.min;
  return Math.max(COLORDROP_PERCENT_RANGE.min, Math.min(COLORDROP_PERCENT_RANGE.max, percent));
}

function clampTolerance(tolerance: number): number {
  if (!Number.isFinite(tolerance)) return 0;
  return Math.max(0, Math.min(255, tolerance));
}

export function percentToTolerance(percent: number): number {
  return Math.round((clampPercent(percent) / 100) * 255);
}

export function toleranceToPercent(tolerance: number): number {
  return Math.round((clampTolerance(tolerance) / 255) * 100);
}

export function beginColorDrop(x: number, y: number, startPercent: number): ColorDropState {
  const start = clampPercent(startPercent);
  return { phase: "pressing", anchorX: x, anchorY: y, startPercent: start, percent: start };
}

export function moveColorDrop(
  state: ColorDropState,
  x: number,
): { state: ColorDropState; crossedTicks: readonly number[] } {
  if (state.phase !== "pressing" && state.phase !== "dragging") {
    return { state, crossedTicks: [] };
  }
  if (!Number.isFinite(x)) return { state, crossedTicks: [] };
  const percent = clampPercent(state.startPercent + (x - state.anchorX) * COLORDROP_PERCENT_PER_PX);
  const prevTick = Math.floor(state.percent / 10);
  const nextTick = Math.floor(percent / 10);
  const crossedTicks: number[] = [];
  if (nextTick !== prevTick) {
    const step = nextTick > prevTick ? 1 : -1;
    for (let t = prevTick + step; step > 0 ? t <= nextTick : t >= nextTick; t += step) {
      crossedTicks.push(t * 10);
    }
  }
  return { state: { ...state, phase: "dragging", percent }, crossedTicks };
}

export function endColorDrop(state: ColorDropState, commit: boolean): ColorDropState {
  if (state.phase !== "pressing" && state.phase !== "dragging") return state;
  return {
    ...state,
    phase: commit ? "committed" : "cancelled",
    // Cancel restores the press-start value so an aborted gesture never touches fill settings.
    percent: commit ? state.percent : state.startPercent,
  };
}

/** Engine input for the current gesture state. Before commit this is preview-only. */
export function colorDropFillInput(state: ColorDropState): {
  readonly tolerance: number;
  readonly preview: boolean;
} {
  return {
    tolerance: percentToTolerance(state.percent),
    preview: state.phase === "pressing" || state.phase === "dragging",
  };
}

/* ------------------------------------------------------------------ session */

/**
 * Pointer-session wrapper the canvas host drives, mirroring the tap recognizer's safety rules
 * (primary pointer only, secondary buttons and multi-touch never fill) while letting horizontal
 * movement past the tap threshold become a threshold drag instead of a cancelled tap.
 *
 * Outcomes on release:
 * - "tap": released while still pressing → run the existing tap fill at the current settings.
 * - "commit": released after dragging → run the fill at `tolerance` and persist it as the new
 *   setting (the panel slider follows because it renders the same settings object).
 * - "restore": cancelled (pointercancel, second finger, secondary button) → apply nothing and
 *   restore `restoreTolerance` as the live preview/setting value.
 */
export interface ColorDropSession {
  readonly primaryPointerId: number;
  readonly activePointerIds: readonly number[];
  readonly blocked: boolean;
  readonly drop: ColorDropState;
  /**
   * Exact engine tolerance at press start. Percent is a rounded display unit (32 → 13% → 33),
   * so cancel must restore this stored value, never a percent round-trip.
   */
  readonly startTolerance: number;
}

export type ColorDropEndOutcome =
  | { readonly type: "tap" }
  | { readonly type: "commit"; readonly tolerance: number; readonly percent: number }
  | { readonly type: "restore"; readonly restoreTolerance: number }
  | { readonly type: "none" };

export function beginColorDropSession(
  current: ColorDropSession | null,
  pointer: StudioAdvancedFillPointerStart,
  /** Required only when starting a fresh session; ignored for additional pointers. */
  startTolerance?: number,
): ColorDropSession {
  if (!current) {
    const start = startTolerance ?? 0;
    return {
      primaryPointerId: pointer.pointerId,
      activePointerIds: [pointer.pointerId],
      blocked:
        (pointer.button !== undefined && pointer.button !== 0) || pointer.isPrimary === false,
      drop: beginColorDrop(pointer.point.x, pointer.point.y, toleranceToPercent(start)),
      startTolerance: clampTolerance(start),
    };
  }
  if (current.activePointerIds.includes(pointer.pointerId)) return current;
  // A second finger turns the gesture into a pinch/scroll: block it like the tap recognizer does.
  return {
    ...current,
    activePointerIds: [...current.activePointerIds, pointer.pointerId],
    blocked: true,
  };
}

export function moveColorDropSession(
  session: ColorDropSession,
  pointerId: number,
  point: StudioAdvancedFillTapPoint,
): { session: ColorDropSession; crossedTicks: readonly number[]; previewTolerance: number | null } {
  if (session.blocked || pointerId !== session.primaryPointerId) {
    return { session, crossedTicks: [], previewTolerance: null };
  }
  // Inside the tap threshold the press is still a candidate tap: no threshold change, no preview
  // churn. Past it, horizontal movement drives the percent and the preview tolerance follows.
  if (
    session.drop.phase === "pressing" &&
    Math.abs(point.x - session.drop.anchorX) <= STUDIO_ADVANCED_FILL_TAP_MAX_MOVEMENT_PX
  ) {
    return { session, crossedTicks: [], previewTolerance: null };
  }
  const moved = moveColorDrop(session.drop, point.x);
  if (moved.state === session.drop) {
    return { session, crossedTicks: [], previewTolerance: null };
  }
  return {
    session: { ...session, drop: moved.state },
    crossedTicks: moved.crossedTicks,
    previewTolerance: percentToTolerance(moved.state.percent),
  };
}

export function endColorDropSession(
  session: ColorDropSession,
  pointerId: number,
  cancelled = false,
): { session: ColorDropSession | null; outcome: ColorDropEndOutcome } {
  const wasOnlyPointer =
    session.activePointerIds.length === 1 && session.activePointerIds[0] === pointerId;
  const activePointerIds = session.activePointerIds.filter((id) => id !== pointerId);
  const remaining: ColorDropSession | null =
    activePointerIds.length === 0 ? null : { ...session, activePointerIds, blocked: true };

  if (!wasOnlyPointer || pointerId !== session.primaryPointerId) {
    return { session: remaining, outcome: { type: "none" } };
  }
  if (cancelled || session.blocked) {
    return {
      session: null,
      outcome:
        session.drop.phase === "dragging"
          ? { type: "restore", restoreTolerance: session.startTolerance }
          : { type: "none" },
    };
  }
  if (session.drop.phase === "dragging") {
    const committed = endColorDrop(session.drop, true);
    return {
      session: null,
      outcome: {
        type: "commit",
        tolerance: percentToTolerance(committed.percent),
        percent: committed.percent,
      },
    };
  }
  return { session: null, outcome: { type: "tap" } };
}

/** Live gesture snapshot the panel renders while a ColorDrop drag is in progress. */
export interface ColorDropGestureView {
  readonly percent: number;
  readonly startPercent: number;
}

export function colorDropGestureView(session: ColorDropSession | null): ColorDropGestureView | null {
  if (!session || session.blocked) return null;
  if (session.drop.phase !== "pressing" && session.drop.phase !== "dragging") return null;
  return { percent: session.drop.percent, startPercent: session.drop.startPercent };
}
