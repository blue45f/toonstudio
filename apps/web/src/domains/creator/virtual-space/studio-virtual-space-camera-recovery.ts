export interface StudioCameraFocusTarget {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly x: number;
  readonly y: number;
}

export interface StudioCameraRecoverySnapshot {
  /** 아바타가 현재 카메라 시야(뷰포트) 바깥이나 가장자리 너머로 벗어났는지 여부. */
  readonly outOfSight: boolean;
  /** 되돌릴 수 있는 이전 시점 기록이 있는지 여부. */
  readonly canUndoView: boolean;
  /** 초점을 맞출 수 있는 선택 물체(가구·작업대 등). */
  readonly focusTarget: StudioCameraFocusTarget | null;
}

export interface StudioCameraViewHistoryEntry {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly zoomLevel: number | null;
}

export const EMPTY_CAMERA_RECOVERY_SNAPSHOT: StudioCameraRecoverySnapshot = Object.freeze({
  outOfSight: false,
  canUndoView: false,
  focusTarget: null,
});

/**
 * 시점 이동량(shift)이 현재 월드 기준 뷰포트 반폭·반높이의 44%를 넘으면
 * 아바타가 시야 가장자리 밖으로 이탈한 상태로 판정한다.
 */
export function isStudioCameraOutOfSight(
  shift: { readonly x: number; readonly y: number },
  view: { readonly width: number; readonly height: number },
): boolean {
  if (!(view.width > 0) || !(view.height > 0)) return false;
  if (!Number.isFinite(shift.x) || !Number.isFinite(shift.y)) return false;
  return Math.abs(shift.x) > view.width * 0.44 || Math.abs(shift.y) > view.height * 0.44;
}

let selectedDecorationTarget: StudioCameraFocusTarget | null = null;
const selectedTargetListeners = new Set<(target: StudioCameraFocusTarget | null) => void>();

export function publishStudioSpaceSelectedObjectTarget(target: StudioCameraFocusTarget | null): void {
  selectedDecorationTarget = target;
  for (const listener of selectedTargetListeners) listener(target);
}

export function getStudioSpaceSelectedObjectTarget(): StudioCameraFocusTarget | null {
  return selectedDecorationTarget;
}

export function subscribeStudioSpaceSelectedObjectTarget(
  listener: (target: StudioCameraFocusTarget | null) => void,
): () => void {
  selectedTargetListeners.add(listener);
  return () => {
    selectedTargetListeners.delete(listener);
  };
}
