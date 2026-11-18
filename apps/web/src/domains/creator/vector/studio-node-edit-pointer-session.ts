import { snapStrokeWithVectorMagnet } from "./studio-vector-magnet-snap";

import type { DrawEl } from "../studio-element-model";
import type { NodeDragSession } from "../studio-node-edit";
import type { VectorMagnetSettings, VectorMagnetSpatialGrid } from "./studio-vector-magnet-snap";

export interface StudioNodeEditPointerSession {
  readonly elId: string;
  readonly session: NodeDragSession;
  readonly pointerId: number;
  readonly captureTarget: Element | null;
  readonly sourcePoints: readonly number[];
  readonly sourcePressures: readonly number[];
  readonly magnetGrid?: VectorMagnetSpatialGrid;
  readonly magnetSettings?: VectorMagnetSettings;
}

export function studioNodeEditPointerId(event: { readonly pointerId?: number }): number {
  return Number.isFinite(event.pointerId) ? event.pointerId! : 1;
}

export function ownsStudioNodeEditPointer(
  drag: StudioNodeEditPointerSession,
  event: { readonly pointerId?: number },
): boolean {
  return drag.pointerId === studioNodeEditPointerId(event);
}

export function captureStudioNodeEditPointer(
  source: DrawEl,
  session: NodeDragSession,
  event: PointerEvent,
): StudioNodeEditPointerSession {
  const pointerId = studioNodeEditPointerId(event);
  const captureTarget = typeof Element !== "undefined" && event.target instanceof Element
    ? event.target : null;
  try { captureTarget?.setPointerCapture(pointerId); }
  catch { /* Detached targets and legacy mouse events still use the owner/end-event guard. */ }
  return {
    elId: source.id, session, pointerId, captureTarget,
    sourcePoints: [...source.points], sourcePressures: [...(source.pressures ?? [])],
  };
}

export function releaseStudioNodeEditPointer(drag: StudioNodeEditPointerSession | null): void {
  try { drag?.captureTarget?.releasePointerCapture(drag.pointerId); }
  catch { /* The browser may already have released capture on cancel or lost capture. */ }
}

/** A remote edit or undo after the last preview must not be replaced by this older draft. */
export function studioNodeEditSourceMatches(drag: StudioNodeEditPointerSession, current: DrawEl): boolean {
  const pressures = current.pressures ?? [];
  return current.id === drag.elId
    && current.points.length === drag.sourcePoints.length
    && current.points.every((value, index) => value === drag.sourcePoints[index])
    && pressures.length === drag.sourcePressures.length
    && pressures.every((value, index) => value === drag.sourcePressures[index]);
}

export interface StudioNodeEditPointerState {
  readonly nodeEditDragRef: { current: StudioNodeEditPointerSession | null };
  readonly pendingNodeEditDraftRef: { current: { elId: string; points: number[]; pressures: number[] } | null };
  readonly nodeEditRafRef: { current: number | null };
  readonly setNodeEditDraft: (draft: null) => void;
}

export function cancelStudioNodeEditPointer(state: StudioNodeEditPointerState): void {
  const drag = state.nodeEditDragRef.current;
  state.nodeEditDragRef.current = null;
  state.pendingNodeEditDraftRef.current = null;
  if (state.nodeEditRafRef.current !== null) {
    globalThis.cancelAnimationFrame(state.nodeEditRafRef.current);
    state.nodeEditRafRef.current = null;
  }
  state.setNodeEditDraft(null);
  releaseStudioNodeEditPointer(drag);
}

/**
 * 노드 드래그 중 끝점 핸들(0 또는 마지막 정점)을 이동할 때 벡터 자석 격자가 연결되어 있으면
 * Hermite 감쇠 자석 스냅을 적용한 초안 좌표를 반환한다.
 * (근거: ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68)
 */
export function applyStudioNodeEditMagnetDraft(
  drag: StudioNodeEditPointerSession,
  source: DrawEl,
  draftPoints: readonly number[],
): number[] {
  if (!drag.magnetGrid || !drag.magnetSettings?.useVectorMagnet) {
    return [...draftPoints];
  }
  const n = Math.floor(draftPoints.length / 2);
  if (n < 2 || (drag.session.pointIndex !== 0 && drag.session.pointIndex !== n - 1)) {
    return [...draftPoints];
  }
  const snapped = snapStrokeWithVectorMagnet(
    { ...source, points: [...draftPoints] },
    drag.magnetGrid,
    drag.magnetSettings,
  );
  return snapped.stroke.points;
}
