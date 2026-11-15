import { Crosshair, History, LocateFixed, RotateCcw } from "lucide-react";
import { useCallback, useSyncExternalStore, type MouseEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioCameraPanStore } from "../studio-virtual-space-camera-pan";
import { EMPTY_CAMERA_RECOVERY_SNAPSHOT } from "../studio-virtual-space-camera-recovery";
import { useSpaceCameraPan } from "./use-space-camera-pan";

/**
 * 시점 안내·카메라 복구 칩 묶음.
 * - 카메라를 끌어서 옮긴 동안: 내 위치로 돌아오기(L)
 * - 시야 밖 이탈 시: 시야 이탈 즉시 복구(감속 없이 즉시 스냅)
 * - 선택 물체 존재 시: 선택 물체에 초점
 * - 시점 이동 기록 존재 시: 이전 시점 복원
 */
export function SpaceCameraChip({ store, onPointerUse }: { readonly store: StudioCameraPanStore; readonly onPointerUse?: () => void }) {
  const bt = useBilingual("SpaceCameraChip");
  const { available, panned } = useSpaceCameraPan(store);
  const subscribeRecovery = useCallback((listener: () => void) => store.subscribeRecovery(listener), [store]);
  const getRecovery = useCallback(() => store.getRecoverySnapshot(), [store]);
  const recovery = useSyncExternalStore(subscribeRecovery, getRecovery, () => EMPTY_CAMERA_RECOVERY_SNAPSHOT);

  if (!available || (!panned && !recovery.outOfSight && !recovery.canUndoView && !recovery.focusTarget)) {
    return null;
  }

  const withPointerReturn = (action: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
    action();
    if (event.detail > 0) onPointerUse?.();
  };

  return (
    <>
      {recovery.outOfSight ? (
        <button
          type="button"
          className="space-status-chip space-status-chip--warn"
          data-space-interactive="true"
          data-camera-instant-recover="true"
          title={bt("아바타가 화면 밖으로 벗어났어요 · 즉시 시야 복구", "Avatar left the viewport · Recover camera immediately")}
          onClick={withPointerReturn(() => store.recoverOutOfSightNow())}
        >
          <RotateCcw size={14} aria-hidden />
          {bt("시야 이탈 즉시 복구", "Recover view now")}
        </button>
      ) : null}
      {panned ? (
        <button
          type="button"
          className="space-status-chip"
          data-space-interactive="true"
          data-camera-chip="true"
          aria-keyshortcuts="L"
          title={bt("내 위치로 돌아오기 (L)", "Back to my avatar (L)")}
          onClick={withPointerReturn(() => store.recenter())}
        >
          <LocateFixed size={14} aria-hidden />
          {bt("시점을 옮겼어요 · 내 위치로 (L)", "Looking around · back to me (L)")}
        </button>
      ) : null}
      {recovery.focusTarget ? (
        <button
          type="button"
          className="space-status-chip"
          data-space-interactive="true"
          data-camera-focus-object="true"
          title={bt(
            `선택 물체(${recovery.focusTarget.labelKo})에 카메라 초점 맞추기`,
            `Focus camera on ${recovery.focusTarget.labelEn}`,
          )}
          onClick={withPointerReturn(() => {
            store.focusSelectedTarget();
          })}
        >
          <Crosshair size={14} aria-hidden />
          {bt(`선택 물체에 초점 · ${recovery.focusTarget.labelKo}`, `Focus · ${recovery.focusTarget.labelEn}`)}
        </button>
      ) : null}
      {recovery.canUndoView ? (
        <button
          type="button"
          className="space-status-chip"
          data-space-interactive="true"
          data-camera-prev-view="true"
          title={bt("방금 전 카메라 시점으로 되돌리기", "Return to previous camera view")}
          onClick={withPointerReturn(() => {
            store.restorePreviousView();
          })}
        >
          <History size={14} aria-hidden />
          {bt("이전 시점", "Previous view")}
        </button>
      ) : null}
    </>
  );
}
