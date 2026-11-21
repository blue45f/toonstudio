import {
  applyPinchMergeLayers,
  applySlideLayerOpacity,
  applySwipeLayerRow,
  toggleLayerTrioFlag,
  type LayerGestureResult,
  type LayerTrioState,
  type LayerTrioToggleKind,
} from "../drawing/studio-layer-trio-gestures";

export interface LayerRowTouchPoint {
  readonly identifier: number;
  readonly clientX: number;
  readonly clientY: number;
}

export interface LayerRowTouchGestureSession {
  readonly mode: "single" | "two-finger";
  readonly startX: number;
  readonly startY: number;
  readonly startDistance: number;
  readonly baseOpacity: number;
  lastOpacity: number | null;
  pinchMerged: boolean;
  consumed: boolean;
}

const SWIPE_THRESHOLD_PX = 44;
const PINCH_MERGE_DELTA_PX = 28;
const TWO_FINGER_SLIDE_MIN_DX = 10;

function touchDistance(a: LayerRowTouchPoint, b: LayerRowTouchPoint): number {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

function toLayerTrioSnapshot(input: {
  readonly id: string;
  readonly label: string;
  readonly hidden?: boolean;
  readonly locked: boolean;
  readonly selected: boolean;
  readonly opacity: number;
  readonly clipBelow?: boolean;
  readonly alphaLocked?: boolean;
  readonly fillReference?: boolean;
}): LayerTrioState {
  return {
    id: input.id,
    name: input.label,
    visible: input.hidden !== true,
    locked: input.locked,
    selected: input.selected,
    opacity: Math.max(0, Math.min(1, input.opacity)),
    clippingMask: input.clipBelow === true,
    alphaLock: input.alphaLocked === true,
    reference: input.fillReference === true,
  };
}

/**
 * 단일 행 기준으로 `toggleLayerTrioFlag` 규칙(잠금 시 무시, 최하단 클리핑 금지)을 적용해 다음 플래그 값을 계산한다.
 */
export function evaluateLayerRowTrioToggle(input: {
  readonly id: string;
  readonly label: string;
  readonly locked: boolean;
  readonly selected: boolean;
  readonly opacity: number;
  readonly clipBelow?: boolean;
  readonly alphaLocked?: boolean;
  readonly fillReference?: boolean;
  readonly canClipBelow: boolean;
  readonly flag: LayerTrioToggleKind;
}): boolean | null {
  const rowState = toLayerTrioSnapshot(input);
  const stack: readonly LayerTrioState[] = input.canClipBelow
    ? [
        {
          id: "__below-anchor__",
          name: "base",
          visible: true,
          locked: false,
          selected: false,
          opacity: 1,
          clippingMask: false,
          alphaLock: false,
          reference: false,
        },
        rowState,
      ]
    : [rowState];
  const next = toggleLayerTrioFlag(stack, input.id, input.flag);
  const updated = next.find((layer) => layer.id === input.id);
  if (!updated || updated[input.flag] === rowState[input.flag]) {
    return null;
  }
  return updated[input.flag];
}

export function startLayerRowTouchGesture(
  touches: readonly LayerRowTouchPoint[],
  baseOpacity: number,
): LayerRowTouchGestureSession | null {
  if (touches.length === 1) {
    const first = touches[0]!;
    return {
      mode: "single",
      startX: first.clientX,
      startY: first.clientY,
      startDistance: 0,
      baseOpacity,
      lastOpacity: null,
      pinchMerged: false,
      consumed: false,
    };
  }
  if (touches.length >= 2) {
    const a = touches[0]!;
    const b = touches[1]!;
    return {
      mode: "two-finger",
      startX: (a.clientX + b.clientX) * 0.5,
      startY: (a.clientY + b.clientY) * 0.5,
      startDistance: touchDistance(a, b),
      baseOpacity,
      lastOpacity: null,
      pinchMerged: false,
      consumed: false,
    };
  }
  return null;
}

export function stepLayerRowTouchMove(
  session: LayerRowTouchGestureSession,
  touches: readonly LayerRowTouchPoint[],
  rowInput: {
    readonly id: string;
    readonly label: string;
    readonly locked: boolean;
    readonly selected: boolean;
    readonly canMergeDown: boolean;
  },
): LayerGestureResult {
  const baseRow = toLayerTrioSnapshot({
    id: rowInput.id,
    label: rowInput.label,
    locked: rowInput.locked,
    selected: rowInput.selected,
    opacity: session.baseOpacity,
  });

  if (session.mode === "two-finger" && touches.length >= 2) {
    const a = touches[0]!;
    const b = touches[1]!;
    const currentDistance = touchDistance(a, b);
    const distanceDelta = currentDistance - session.startDistance;

    if (!session.pinchMerged && distanceDelta <= -PINCH_MERGE_DELTA_PX && rowInput.canMergeDown) {
      const pair: readonly LayerTrioState[] = [
        {
          id: "__below-target__",
          name: "below",
          visible: true,
          locked: false,
          selected: false,
          opacity: 1,
          clippingMask: false,
          alphaLock: false,
          reference: false,
        },
        baseRow,
      ];
      const merged = applyPinchMergeLayers(pair, 0, 1);
      if (merged.kind === "merged") {
        session.pinchMerged = true;
        session.consumed = true;
        return merged;
      }
    }

    const avgX = (a.clientX + b.clientX) * 0.5;
    const dx = avgX - session.startX;
    if (!session.pinchMerged && Math.abs(dx) >= TWO_FINGER_SLIDE_MIN_DX) {
      const slid = applySlideLayerOpacity([baseRow], rowInput.id, dx, 200);
      if (slid.kind === "opacity-changed") {
        session.lastOpacity = slid.opacity;
        session.consumed = true;
        return slid;
      }
    }
  }

  return { kind: "noop", layers: [baseRow] };
}

export function finishLayerRowTouchEnd(
  session: LayerRowTouchGestureSession,
  changedTouch: LayerRowTouchPoint | undefined,
  rowInput: {
    readonly id: string;
    readonly label: string;
    readonly locked: boolean;
    readonly selected: boolean;
  },
): LayerGestureResult {
  const baseRow = toLayerTrioSnapshot({
    id: rowInput.id,
    label: rowInput.label,
    locked: rowInput.locked,
    selected: rowInput.selected,
    opacity: session.lastOpacity ?? session.baseOpacity,
  });

  if (session.mode === "two-finger") {
    if (!session.pinchMerged && session.lastOpacity !== null) {
      return {
        kind: "opacity-changed",
        targetLayerId: rowInput.id,
        opacity: session.lastOpacity,
        layers: [baseRow],
      };
    }
    return { kind: "noop", layers: [baseRow] };
  }

  if (!changedTouch || session.consumed) {
    return { kind: "noop", layers: [baseRow] };
  }
  const dx = changedTouch.clientX - session.startX;
  const dy = changedTouch.clientY - session.startY;
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy) * 1.4) {
    return { kind: "noop", layers: [baseRow] };
  }
  return applySwipeLayerRow([baseRow], rowInput.id, dx < 0 ? "left-lock" : "right-select");
}
