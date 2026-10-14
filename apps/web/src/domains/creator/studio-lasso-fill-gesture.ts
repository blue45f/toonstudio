/** Pointer-drag lasso recognizer for Surround (Lasso) Fill, isolated from Konva/React for deterministic tests. */

import type { StudioLassoFillPoint } from "./studio-lasso-fill";

/** 이 거리(px)보다 짧게 움직인 move는 경로 점으로 추가하지 않는다 — 손떨림·중복 점 방지. */
export const STUDIO_LASSO_FILL_MIN_POINT_DISTANCE_PX = 2;
/** 둘러싸기가 성립하는 최소 점 수(삼각형). */
export const STUDIO_LASSO_FILL_MIN_POINTS = 3;
/** 경로 바운딩 박스의 가로·세로 최소 크기(px). 직선 드래그는 면적이 없어 둘러싸기가 아니다. */
export const STUDIO_LASSO_FILL_MIN_ENCLOSED_SIZE_PX = 2;

/** 드래그가 시작된 대상 프레임(SelectionFrame과 구조 호환 — 모듈 간 결합을 타입 구조로만 건다). */
export interface StudioLassoFillDragFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation?: number;
}

/** 호스트가 ref에 보관하는 드래그 세션: 제스처 상태 + 시작 시점에 고정한 프레임. */
export interface StudioLassoFillDragSession {
  readonly gesture: StudioLassoFillDragGesture;
  readonly frame: StudioLassoFillDragFrame;
}

export type StudioLassoFillDragGesture = {
  primaryPointerId: number;
  activePointerIds: readonly number[];
  points: readonly StudioLassoFillPoint[];
  blocked: boolean;
};

export type StudioLassoFillPointerStart = {
  pointerId: number;
  point: StudioLassoFillPoint;
  button?: number;
  isPrimary?: boolean;
};

export function beginStudioLassoFillDrag(
  current: StudioLassoFillDragGesture | null,
  pointer: StudioLassoFillPointerStart,
): StudioLassoFillDragGesture {
  if (!current) {
    return {
      primaryPointerId: pointer.pointerId,
      activePointerIds: [pointer.pointerId],
      points: [pointer.point],
      blocked: pointer.button !== undefined && pointer.button !== 0 || pointer.isPrimary === false,
    };
  }
  if (current.activePointerIds.includes(pointer.pointerId)) return current;
  return {
    ...current,
    activePointerIds: [...current.activePointerIds, pointer.pointerId],
    blocked: true,
  };
}

export function moveStudioLassoFillDrag(
  current: StudioLassoFillDragGesture,
  pointerId: number,
  point: StudioLassoFillPoint,
): StudioLassoFillDragGesture {
  if (current.blocked || pointerId !== current.primaryPointerId) return current;
  const last = current.points[current.points.length - 1];
  if (last) {
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    if (dx * dx + dy * dy < STUDIO_LASSO_FILL_MIN_POINT_DISTANCE_PX ** 2) return current;
  }
  return { ...current, points: [...current.points, point] };
}

/** 경로가 둘러싸기로 성립하는지: 점 수와 바운딩 박스 면적 조건. */
export function isStudioLassoFillPathEnclosing(
  points: readonly StudioLassoFillPoint[],
): boolean {
  if (points.length < STUDIO_LASSO_FILL_MIN_POINTS) return false;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return (
    maxX - minX >= STUDIO_LASSO_FILL_MIN_ENCLOSED_SIZE_PX &&
    maxY - minY >= STUDIO_LASSO_FILL_MIN_ENCLOSED_SIZE_PX
  );
}

export function endStudioLassoFillDrag(
  current: StudioLassoFillDragGesture,
  pointerId: number,
  point?: StudioLassoFillPoint,
  cancelled = false,
): { gesture: StudioLassoFillDragGesture | null; path: readonly StudioLassoFillPoint[] | null } {
  const wasOnlyPointer = current.activePointerIds.length === 1 && current.activePointerIds[0] === pointerId;
  let finished: StudioLassoFillDragGesture = current;
  if (point && !cancelled && !current.blocked && pointerId === current.primaryPointerId) {
    finished = moveStudioLassoFillDrag(current, pointerId, point);
  }
  const path =
    !cancelled && !finished.blocked && pointerId === finished.primaryPointerId && wasOnlyPointer &&
    isStudioLassoFillPathEnclosing(finished.points)
      ? finished.points
      : null;
  const activePointerIds = current.activePointerIds.filter((id) => id !== pointerId);
  if (activePointerIds.length === 0) return { gesture: null, path };
  return {
    gesture: { ...finished, activePointerIds, blocked: true },
    path: null,
  };
}
