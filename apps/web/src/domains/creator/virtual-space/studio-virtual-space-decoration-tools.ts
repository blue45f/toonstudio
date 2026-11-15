/**
 * 꾸미기 도구 (Track 4 · 에디터 강화)
 *
 * 가구 배치의 진입장벽을 낮추는 스냅·복제·회전·nudge 헬퍼.
 * 전부 `editStudioVirtualDecoration`/`addStudioVirtualDecorationSafely`
 * (studio-virtual-space-decoration-layout)를 경유하므로 충돌·경계·접근성
 * 규칙이 항상 적용된다.
 */

import {
  addStudioVirtualDecorationSafely,
  duplicateStudioVirtualDecorationBatchSafely,
  editStudioVirtualDecoration,
  editStudioVirtualDecorationGroup,
  studioVirtualDecorationStateForWorld,
  type StudioDecorationLayoutResult,
} from "./studio-virtual-space-decoration-layout";
import {
  parseStudioVirtualDecorationState,
  type StudioVirtualDecorationState,
  type StudioVirtualDecorPlacement,
} from "./studio-virtual-space-customization";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

/** 기본 격자 간격(px). */
export const STUDIO_DECOR_GRID = 16;

/** 점을 격자에 스냅한다. */
export function snapStudioVirtualDecorPointToGrid(
  point: StudioVirtualSpacePoint,
  grid: number = STUDIO_DECOR_GRID,
): StudioVirtualSpacePoint {
  const step = Number.isFinite(grid) && grid > 0 ? grid : STUDIO_DECOR_GRID;
  return { x: Math.round(point.x / step) * step, y: Math.round(point.y / step) * step };
}

/** 선택한 가구를 격자에 맞춘다. */
export function alignStudioVirtualDecorationToGrid(
  current: StudioVirtualDecorationState,
  id: string,
  world: StudioVirtualSpaceWorldManifest,
  self?: StudioVirtualSpacePoint,
  grid: number = STUDIO_DECOR_GRID,
): StudioDecorationLayoutResult {
  const item = current.placements.find((entry) => entry.id === id);
  if (!item) return { ok: false, reason: "invalid" };
  const snapped = snapStudioVirtualDecorPointToGrid(item, grid);
  if (snapped.x === item.x && snapped.y === item.y) return { ok: true, state: current };
  return editStudioVirtualDecoration(current, id, { x: snapped.x, y: snapped.y }, world, self);
}

const DUPLICATE_OFFSET = { x: 32, y: 32 };

/** 선택한 가구를 옆에 복제한다. 회전·크기를 그대로 유지한다. */
export function duplicateStudioVirtualDecoration(
  current: StudioVirtualDecorationState,
  id: string,
  world: StudioVirtualSpaceWorldManifest,
  self?: StudioVirtualSpacePoint,
): StudioDecorationLayoutResult {
  const item = current.placements.find((entry) => entry.id === id);
  if (!item) return { ok: false, reason: "invalid" };
  const added = addStudioVirtualDecorationSafely(
    current,
    item.type,
    { x: item.x + DUPLICATE_OFFSET.x, y: item.y + DUPLICATE_OFFSET.y },
    world,
    item.type === "custom" ? item.assetId : undefined,
  );
  if (!added.ok) return added;
  const last = added.state.placements.at(-1);
  if (!last || (last.rotation === item.rotation && last.scale === item.scale)) return added;
  return editStudioVirtualDecoration(
    added.state,
    last.id,
    { rotation: item.rotation, scale: item.scale },
    world,
    self,
  );
}

/** 선택한 가구를 시계 방향 90° 회전한다. */
export function rotateStudioVirtualDecoration(
  current: StudioVirtualDecorationState,
  id: string,
  world: StudioVirtualSpaceWorldManifest,
  self?: StudioVirtualSpacePoint,
): StudioDecorationLayoutResult {
  const item = current.placements.find((entry) => entry.id === id);
  if (!item) return { ok: false, reason: "invalid" };
  const rotation = ((item.rotation + 90) % 360) as StudioVirtualDecorPlacement["rotation"];
  return editStudioVirtualDecoration(current, id, { rotation }, world, self);
}

/** 선택한 가구를 미세 이동(nudge)한다. */
export function nudgeStudioVirtualDecoration(
  current: StudioVirtualDecorationState,
  id: string,
  dx: number,
  dy: number,
  world: StudioVirtualSpaceWorldManifest,
  self?: StudioVirtualSpacePoint,
): StudioDecorationLayoutResult {
  const item = current.placements.find((entry) => entry.id === id);
  if (!item) return { ok: false, reason: "invalid" };
  return editStudioVirtualDecoration(current, id, { x: item.x + dx, y: item.y + dy }, world, self);
}

/** 다중 선택된 가구 묶음을 상대 간격과 회전을 유지한 채 한 번의 이력 단위로 함께 이동한다. */
export function moveStudioVirtualDecorationGroup(
  current: StudioVirtualDecorationState,
  ids: readonly string[],
  dx: number,
  dy: number,
  world: StudioVirtualSpaceWorldManifest,
  self?: StudioVirtualSpacePoint,
): StudioDecorationLayoutResult {
  const state = studioVirtualDecorationStateForWorld(current, world);
  const patches = new Map<string, Partial<Pick<StudioVirtualDecorPlacement, "x" | "y">>>();
  for (const id of ids) {
    const item = state.placements.find((entry) => entry.id === id);
    if (!item) return { ok: false, reason: "invalid" };
    patches.set(id, { x: item.x + dx, y: item.y + dy });
  }
  return editStudioVirtualDecorationGroup(state, patches, world, self);
}

/**
 * 다중 선택된 가구 묶음을 기준 가구(첫 선택 항목) 주위로 90°/270° 강체 회전한다.
 * 오프셋 벡터와 개별 회전이 함께 회전하므로 묶음 내부 상대 거리·각도가 정확히 보존된다.
 */
export function rotateStudioVirtualDecorationGroup(
  current: StudioVirtualDecorationState,
  ids: readonly string[],
  deltaDeg: 90 | 270,
  world: StudioVirtualSpaceWorldManifest,
  self?: StudioVirtualSpacePoint,
): StudioDecorationLayoutResult {
  if (ids.length === 0) return { ok: false, reason: "invalid" };
  const state = studioVirtualDecorationStateForWorld(current, world);
  const anchor = state.placements.find((entry) => entry.id === ids[0]);
  if (!anchor) return { ok: false, reason: "invalid" };
  const patches = new Map<
    string,
    Partial<Pick<StudioVirtualDecorPlacement, "x" | "y" | "rotation">>
  >();
  for (const id of ids) {
    const item = state.placements.find((entry) => entry.id === id);
    if (!item) return { ok: false, reason: "invalid" };
    const relX = item.x - anchor.x;
    const relY = item.y - anchor.y;
    const rotatedOffset =
      deltaDeg === 90 ? { x: -relY, y: relX } : { x: relY, y: -relX };
    patches.set(id, {
      x: Math.round(anchor.x + rotatedOffset.x),
      y: Math.round(anchor.y + rotatedOffset.y),
      rotation: ((item.rotation + deltaDeg) % 360) as StudioVirtualDecorPlacement["rotation"],
    });
  }
  return editStudioVirtualDecorationGroup(state, patches, world, self);
}

/** 다중 선택된 가구 묶음의 크기를 한 번의 이력 단위로 함께 조절한다. */
export function scaleStudioVirtualDecorationGroup(
  current: StudioVirtualDecorationState,
  ids: readonly string[],
  deltaScale: number,
  world: StudioVirtualSpaceWorldManifest,
  self?: StudioVirtualSpacePoint,
): StudioDecorationLayoutResult {
  const state = studioVirtualDecorationStateForWorld(current, world);
  const patches = new Map<string, Partial<Pick<StudioVirtualDecorPlacement, "scale">>>();
  for (const id of ids) {
    const item = state.placements.find((entry) => entry.id === id);
    if (!item) return { ok: false, reason: "invalid" };
    const nextScale = Math.min(1.35, Math.max(0.65, Math.round((item.scale + deltaScale) * 100) / 100));
    patches.set(id, { scale: nextScale });
  }
  return editStudioVirtualDecorationGroup(state, patches, world, self);
}

/** 기준 가구를 격자에 맞추고 나머지 선택 가구도 동일한 변위로 이동해 상대 간격을 지킨다. */
export function alignStudioVirtualDecorationGroupToGrid(
  current: StudioVirtualDecorationState,
  ids: readonly string[],
  world: StudioVirtualSpaceWorldManifest,
  self?: StudioVirtualSpacePoint,
  grid: number = STUDIO_DECOR_GRID,
): StudioDecorationLayoutResult {
  if (ids.length === 0) return { ok: false, reason: "invalid" };
  if (ids.length === 1) {
    return alignStudioVirtualDecorationToGrid(current, ids[0]!, world, self, grid);
  }
  const state = studioVirtualDecorationStateForWorld(current, world);
  const anchor = state.placements.find((entry) => entry.id === ids[0]);
  if (!anchor) return { ok: false, reason: "invalid" };
  const snapped = snapStudioVirtualDecorPointToGrid(anchor, grid);
  const dx = snapped.x - anchor.x;
  const dy = snapped.y - anchor.y;
  if (dx === 0 && dy === 0) return { ok: true, state };
  return moveStudioVirtualDecorationGroup(state, ids, dx, dy, world, self);
}

/** 다중 선택된 가구 묶음을 상대 간격·회전·크기·커스텀 자산 참조까지 보존해 한 번에 복제한다. */
export function duplicateStudioVirtualDecorationGroup(
  current: StudioVirtualDecorationState,
  ids: readonly string[],
  world: StudioVirtualSpaceWorldManifest,
  self?: StudioVirtualSpacePoint,
): { readonly result: StudioDecorationLayoutResult; readonly clonedIds: readonly string[] } {
  if (ids.length === 1) {
    const single = duplicateStudioVirtualDecoration(current, ids[0]!, world, self);
    const clonedId = single.ok ? single.state.placements.at(-1)?.id : undefined;
    return {
      result: single,
      clonedIds: clonedId ? [clonedId] : [],
    };
  }
  return duplicateStudioVirtualDecorationBatchSafely(current, ids, world, self);
}

/** 다중 선택된 가구 묶음을 한 번의 이력 단위로 일괄 삭제한다. */
export function removeStudioVirtualDecorationGroup(
  current: StudioVirtualDecorationState,
  ids: readonly string[],
): StudioDecorationLayoutResult {
  const targetSet = new Set(ids);
  if (targetSet.size === 0) return { ok: false, reason: "invalid" };
  const nextPlacements = current.placements.filter((entry) => !targetSet.has(entry.id));
  if (nextPlacements.length === current.placements.length) {
    return { ok: false, reason: "invalid" };
  }
  const next: StudioVirtualDecorationState = {
    ...current,
    revision: current.revision + 1,
    placements: nextPlacements,
  };
  return parseStudioVirtualDecorationState(next)
    ? { ok: true, state: next }
    : { ok: false, reason: "invalid" };
}
