/**
 * 8방향 제스처 퀵 다이얼(Radial Quick Dial) 순수 기하·히스테리시스·슬롯 매핑 엔진.
 *
 * - 포인터 시작점과 이동 벡터(각도·기본 18px 데드존·±5° 경계 히스테리시스)로 8방위 섹터를 떨림 없이 판정한다.
 * - 키보드 탐색(1~8·방향키·Home/End·Enter·Esc), SVG 쐐기 기하, 뷰포트 안전 배치를 순수 함수로 제공한다.
 */

import {
  clampStudioQuickActionsCenter,
  type StudioQuickActionsPoint,
  type StudioQuickActionsViewport,
} from "../studio-quick-actions";
import {
  DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS,
  getRadialDialActionMeta,
  isRadialDialActionId,
  type RadialDialActionDefinition,
  type RadialDialActionId,
  type RadialDialContextId,
} from "./studio-radial-quick-dial-presets";

export {
  DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS,
  RADIAL_DIAL_ACTION_CATALOG,
  RADIAL_DIAL_CONTEXT_IDS,
  RADIAL_DIAL_CONTEXT_META,
  cloneDefaultRadialDialContextSlots,
  getRadialDialActionMeta,
  inferRadialDialContext,
  isRadialDialActionId,
  isRadialDialContextId,
  type RadialDialActionDefinition,
  type RadialDialActionIconKey,
  type RadialDialActionId,
  type RadialDialContextId,
  type RadialDialContextMeta,
  type RadialDialContextSignals,
} from "./studio-radial-quick-dial-presets";

export const RADIAL_DIAL_DIRECTIONS = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
] as const;

export type RadialDialDirection = (typeof RADIAL_DIAL_DIRECTIONS)[number];
export type RadialDialSectorIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const RADIAL_DIAL_SECTOR_COUNT = 8 as const;
export const RADIAL_DIAL_SECTOR_SPAN_DEG = 45 as const;
export const RADIAL_DIAL_SECTOR_HALF_SPAN_DEG = 22.5 as const;
export const RADIAL_DIAL_DEFAULT_DEADZONE_PX = 18 as const;
export const RADIAL_DIAL_DEFAULT_EXIT_DEADZONE_PX = 14 as const;
export const RADIAL_DIAL_DEFAULT_HYSTERESIS_DEG = 5 as const;
export const RADIAL_DIAL_MIN_TARGET_PX = 44 as const;

export const RADIAL_DIAL_DIRECTION_LABELS_KO: Readonly<Record<RadialDialDirection, string>> =
  Object.freeze({
    N: "12시 · 위",
    NE: "1시 · 오른쪽 위",
    E: "3시 · 오른쪽",
    SE: "4시 · 오른쪽 아래",
    S: "6시 · 아래",
    SW: "7시 · 왼쪽 아래",
    W: "9시 · 왼쪽",
    NW: "10시 · 왼쪽 위",
  });

export interface RadialDialSlot {
  readonly index: RadialDialSectorIndex;
  readonly direction: RadialDialDirection;
  readonly directionLabelKo: string;
  readonly shortcutKey: string;
  readonly action: RadialDialActionDefinition;
}

export interface RadialDialGestureOptions {
  /** 섹터 진입에 필요한 최소 반경(px). 기본 18px. */
  readonly deadzonePx?: number;
  /** 이미 선택된 섹터에서 중앙 취소 영역으로 복귀할 반경(px). 기본 max(10, deadzonePx - 4). */
  readonly exitDeadzonePx?: number;
  /** 경계선(±22.5°)에서 섹터 전환 시 떨림을 막는 추가 여유 각도(deg). 기본 5°. */
  readonly angularHysteresisDeg?: number;
  /** 직전 활성 섹터(히스테리시스 기준). */
  readonly previousIndex?: RadialDialSectorIndex | null;
}

export interface RadialDialGestureResolution {
  readonly activeIndex: RadialDialSectorIndex | null;
  readonly direction: RadialDialDirection | null;
  readonly distancePx: number;
  readonly angleDeg: number | null;
  readonly inDeadzone: boolean;
  readonly stabilizedByHysteresis: boolean;
}

export interface RadialDialGestureSessionState {
  readonly open: boolean;
  readonly dragging: boolean;
  readonly origin: StudioQuickActionsPoint | null;
  readonly pointer: StudioQuickActionsPoint | null;
  readonly activeIndex: RadialDialSectorIndex | null;
  readonly stabilizedByHysteresis: boolean;
  readonly committedIndex: RadialDialSectorIndex | null;
}

export type RadialDialGestureEvent =
  | { readonly type: "start"; readonly origin: StudioQuickActionsPoint }
  | { readonly type: "move"; readonly pointer: StudioQuickActionsPoint }
  | { readonly type: "commit"; readonly pointer?: StudioQuickActionsPoint }
  | { readonly type: "cancel" };

export type RadialDialKeyboardAction =
  | { readonly kind: "highlight"; readonly index: RadialDialSectorIndex }
  | { readonly kind: "select"; readonly index: RadialDialSectorIndex }
  | { readonly kind: "close" }
  | { readonly kind: "noop" };

/** 0..360° 시계방향 각도 사이의 최단 각도 차이를 계산한다. */
export function shortestAngleDiffDeg(angleA: number, angleB: number): number {
  const raw = Math.abs(angleA - angleB) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/**
 * 포인터 시작점과 현재 좌표의 이동 벡터로 8방위 섹터(0..7)를 떨림 없이 판정한다.
 */
export function resolveRadialDialSector(
  origin: StudioQuickActionsPoint,
  pointer: StudioQuickActionsPoint,
  options: RadialDialGestureOptions = {},
): RadialDialGestureResolution {
  const deadzonePx =
    typeof options.deadzonePx === "number" && Number.isFinite(options.deadzonePx)
      ? Math.max(8, Math.min(64, options.deadzonePx))
      : RADIAL_DIAL_DEFAULT_DEADZONE_PX;
  const exitDeadzonePx =
    typeof options.exitDeadzonePx === "number" && Number.isFinite(options.exitDeadzonePx)
      ? Math.max(4, Math.min(deadzonePx, options.exitDeadzonePx))
      : Math.max(10, deadzonePx - 4);
  const hysteresisDeg =
    typeof options.angularHysteresisDeg === "number" && Number.isFinite(options.angularHysteresisDeg)
      ? Math.max(0, Math.min(12, options.angularHysteresisDeg))
      : RADIAL_DIAL_DEFAULT_HYSTERESIS_DEG;
  const previousIndex = options.previousIndex ?? null;

  if (
    !Number.isFinite(origin.x) ||
    !Number.isFinite(origin.y) ||
    !Number.isFinite(pointer.x) ||
    !Number.isFinite(pointer.y)
  ) {
    return {
      activeIndex: null,
      direction: null,
      distancePx: 0,
      angleDeg: null,
      inDeadzone: true,
      stabilizedByHysteresis: false,
    };
  }

  const dx = pointer.x - origin.x;
  const dy = pointer.y - origin.y;
  const distancePx = Math.hypot(dx, dy);
  const effectiveDeadzone = previousIndex !== null ? exitDeadzonePx : deadzonePx;

  if (!Number.isFinite(distancePx) || distancePx < effectiveDeadzone) {
    return {
      activeIndex: null,
      direction: null,
      distancePx: Number.isFinite(distancePx) ? Number(distancePx.toFixed(2)) : 0,
      angleDeg: null,
      inDeadzone: true,
      stabilizedByHysteresis: false,
    };
  }

  const rawDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const angleDeg = ((rawDeg % 360) + 360) % 360;
  const rawIndex = (Math.floor(
    ((angleDeg + RADIAL_DIAL_SECTOR_HALF_SPAN_DEG + 1e-9) % 360) / RADIAL_DIAL_SECTOR_SPAN_DEG,
  ) % RADIAL_DIAL_SECTOR_COUNT) as RadialDialSectorIndex;

  let activeIndex: RadialDialSectorIndex = rawIndex;
  let stabilizedByHysteresis = false;

  if (previousIndex !== null && previousIndex !== rawIndex) {
    const previousCenterDeg = previousIndex * RADIAL_DIAL_SECTOR_SPAN_DEG;
    const diffFromPrevious = shortestAngleDiffDeg(angleDeg, previousCenterDeg);
    if (diffFromPrevious <= RADIAL_DIAL_SECTOR_HALF_SPAN_DEG + hysteresisDeg) {
      activeIndex = previousIndex;
      stabilizedByHysteresis = true;
    }
  }

  const direction = RADIAL_DIAL_DIRECTIONS[activeIndex];
  return {
    activeIndex,
    direction,
    distancePx: Number(distancePx.toFixed(2)),
    angleDeg: Number(angleDeg.toFixed(2)),
    inDeadzone: false,
    stabilizedByHysteresis,
  };
}

export function createInitialRadialDialGestureState(): RadialDialGestureSessionState {
  return {
    open: false,
    dragging: false,
    origin: null,
    pointer: null,
    activeIndex: null,
    stabilizedByHysteresis: false,
    committedIndex: null,
  };
}

export function reduceRadialDialGesture(
  state: RadialDialGestureSessionState,
  event: RadialDialGestureEvent,
  options: Omit<RadialDialGestureOptions, "previousIndex"> = {},
): RadialDialGestureSessionState {
  if (event.type === "start") {
    return {
      open: true,
      dragging: true,
      origin: event.origin,
      pointer: event.origin,
      activeIndex: null,
      stabilizedByHysteresis: false,
      committedIndex: null,
    };
  }
  if (event.type === "cancel") {
    return createInitialRadialDialGestureState();
  }
  if (!state.origin) {
    return state;
  }
  if (event.type === "move") {
    const resolved = resolveRadialDialSector(state.origin, event.pointer, {
      ...options,
      previousIndex: state.activeIndex,
    });
    return {
      ...state,
      pointer: event.pointer,
      activeIndex: resolved.activeIndex,
      stabilizedByHysteresis: resolved.stabilizedByHysteresis,
    };
  }
  const finalPointer = event.pointer ?? state.pointer ?? state.origin;
  const resolved = resolveRadialDialSector(state.origin, finalPointer, {
    ...options,
    previousIndex: state.activeIndex,
  });
  return {
    open: false,
    dragging: false,
    origin: state.origin,
    pointer: finalPointer,
    activeIndex: resolved.activeIndex,
    stabilizedByHysteresis: resolved.stabilizedByHysteresis,
    committedIndex: resolved.activeIndex,
  };
}

/** 8방향 퀵 다이얼 키보드 탐색을 순수 함수로 해석한다. */
export function stepRadialDialKeyboardSelection(
  currentIndex: RadialDialSectorIndex | null,
  key: string,
): RadialDialKeyboardAction {
  if (key === "Escape") {
    return { kind: "close" };
  }
  if (/^[1-8]$/u.test(key)) {
    return { kind: "select", index: (Number(key) - 1) as RadialDialSectorIndex };
  }
  if (key === "ArrowRight" || key === "ArrowDown") {
    const next =
      currentIndex === null
        ? 0
        : (((currentIndex + 1) % RADIAL_DIAL_SECTOR_COUNT) as RadialDialSectorIndex);
    return { kind: "highlight", index: next };
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    const next =
      currentIndex === null
        ? 7
        : (((currentIndex - 1 + RADIAL_DIAL_SECTOR_COUNT) % RADIAL_DIAL_SECTOR_COUNT) as RadialDialSectorIndex);
    return { kind: "highlight", index: next };
  }
  if (key === "Home") {
    return { kind: "highlight", index: 0 };
  }
  if (key === "End") {
    return { kind: "highlight", index: 7 };
  }
  if ((key === "Enter" || key === " ") && currentIndex !== null) {
    return { kind: "select", index: currentIndex };
  }
  return { kind: "noop" };
}

/** 섹터 인덱스(0..7)의 버튼 중심 좌표를 계산한다(12시 방향 0번 기준 시계방향). */
export function computeRadialDialSectorPoint(
  index: RadialDialSectorIndex,
  center: StudioQuickActionsPoint,
  radiusPx: number,
): StudioQuickActionsPoint {
  const rad = ((index * RADIAL_DIAL_SECTOR_SPAN_DEG - 90) * Math.PI) / 180;
  return {
    x: Number((center.x + Math.cos(rad) * radiusPx).toFixed(2)),
    y: Number((center.y + Math.sin(rad) * radiusPx).toFixed(2)),
  };
}

/** 8방위 섹터 쐐기(SVG path)를 생성한다. */
export function buildRadialDialWedgePath(
  index: RadialDialSectorIndex,
  center: StudioQuickActionsPoint,
  innerRadiusPx: number,
  outerRadiusPx: number,
): string {
  const startDeg = index * RADIAL_DIAL_SECTOR_SPAN_DEG - 90 - RADIAL_DIAL_SECTOR_HALF_SPAN_DEG;
  const endDeg = startDeg + RADIAL_DIAL_SECTOR_SPAN_DEG;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = center.x + outerRadiusPx * Math.cos(toRad(startDeg));
  const y1 = center.y + outerRadiusPx * Math.sin(toRad(startDeg));
  const x2 = center.x + outerRadiusPx * Math.cos(toRad(endDeg));
  const y2 = center.y + outerRadiusPx * Math.sin(toRad(endDeg));
  const x3 = center.x + innerRadiusPx * Math.cos(toRad(endDeg));
  const y3 = center.y + innerRadiusPx * Math.sin(toRad(endDeg));
  const x4 = center.x + innerRadiusPx * Math.cos(toRad(startDeg));
  const y4 = center.y + innerRadiusPx * Math.sin(toRad(startDeg));
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${outerRadiusPx} ${outerRadiusPx} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${x3.toFixed(1)} ${y3.toFixed(1)} A ${innerRadiusPx} ${innerRadiusPx} 0 0 0 ${x4.toFixed(1)} ${y4.toFixed(1)} Z`;
}

/** 8방향 다이얼 중심을 현재 뷰포트 안에 안전하게 배치하고 초소형 화면 배율을 계산한다. */
export function clampRadialDialCenter(
  anchor: StudioQuickActionsPoint | null | undefined,
  viewport: StudioQuickActionsViewport,
  dialDiameterPx = 256,
  marginPx = 16,
): { readonly x: number; readonly y: number; readonly scale: number } {
  const safeWidth = Number.isFinite(viewport.width) && viewport.width > 0 ? viewport.width : 1280;
  const safeHeight = Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : 800;
  const rawScale = (safeWidth - 32) / (dialDiameterPx + 64);
  const scale = safeWidth < 360 ? Math.min(1, Math.max(0.82, Number(rawScale.toFixed(3)))) : 1;
  const radius = Math.ceil((dialDiameterPx * scale) / 2);
  const rawAnchor: StudioQuickActionsPoint =
    anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)
      ? anchor
      : { x: Math.round(safeWidth / 2), y: Math.round(safeHeight / 2) };
  const clamped = clampStudioQuickActionsCenter(
    rawAnchor,
    { width: safeWidth, height: safeHeight },
    { radius, margin: marginPx, bottomInset: 72 },
  );
  return {
    x: Math.round(clamped.x),
    y: Math.round(clamped.y),
    scale,
  };
}

/** 특정 컨텍스트의 8방향 슬롯 배열을 불변 `RadialDialSlot[8]`으로 구성한다. */
export function buildRadialDialSlotsForContext(
  contextId: RadialDialContextId,
  customActionIds?: readonly RadialDialActionId[],
): readonly RadialDialSlot[] {
  const defaults = DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS[contextId];
  const slots: RadialDialSlot[] = [];
  for (let i = 0; i < RADIAL_DIAL_SECTOR_COUNT; i += 1) {
    const index = i as RadialDialSectorIndex;
    const candidate = customActionIds?.[i];
    const actionId =
      candidate && isRadialDialActionId(candidate)
        ? candidate
        : defaults[i] ?? "undo";
    const direction = RADIAL_DIAL_DIRECTIONS[index];
    slots.push(
      Object.freeze({
        index,
        direction,
        directionLabelKo: RADIAL_DIAL_DIRECTION_LABELS_KO[direction],
        shortcutKey: String(i + 1),
        action: getRadialDialActionMeta(actionId),
      }),
    );
  }
  return Object.freeze(slots);
}

/** 특정 컨텍스트의 한 섹터 액션만 교체한 새 컨텍스트 슬롯 맵을 반환한다. */
export function assignRadialDialContextSlot(
  contextSlots: Readonly<Record<RadialDialContextId, readonly RadialDialActionId[]>>,
  contextId: RadialDialContextId,
  sectorIndex: RadialDialSectorIndex,
  actionId: RadialDialActionId,
): Record<RadialDialContextId, readonly RadialDialActionId[]> {
  const current = contextSlots[contextId] ?? DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS[contextId];
  const nextForContext = DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS[contextId].map((fallback, idx) => {
    if (idx === sectorIndex) return actionId;
    const existing = current[idx];
    return existing && isRadialDialActionId(existing) ? existing : fallback;
  });
  return {
    drawing: contextId === "drawing" ? Object.freeze(nextForContext) : [...contextSlots.drawing],
    inking: contextId === "inking" ? Object.freeze(nextForContext) : [...contextSlots.inking],
    bg3d: contextId === "bg3d" ? Object.freeze(nextForContext) : [...contextSlots.bg3d],
    lettering: contextId === "lettering" ? Object.freeze(nextForContext) : [...contextSlots.lettering],
    review: contextId === "review" ? Object.freeze(nextForContext) : [...contextSlots.review],
  };
}
