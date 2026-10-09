import { LocateFixed } from "lucide-react";
import type { MouseEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioCameraPanStore } from "../studio-virtual-space-camera-pan";
import { useSpaceCameraPan } from "./use-space-camera-pan";

/**
 * 시점 안내 칩. 카메라를 끌어서 아바타에서 떼어 놓은 동안에만 보이고, 누르거나 L 키를 누르면 내 위치로 돌아온다.
 * 마우스·터치로 누르면 키보드 초점을 월드로 돌려 바로 걸을 수 있게 하고(onPointerUse), 키보드로 활성화하면 초점을 그대로 둔다.
 */
export function SpaceCameraChip({ store, onPointerUse }: { readonly store: StudioCameraPanStore; readonly onPointerUse?: () => void }) {
  const bt = useBilingual("SpaceCameraChip");
  const { available, panned } = useSpaceCameraPan(store);
  if (!available || !panned) return null;
  const recenter = (event: MouseEvent<HTMLButtonElement>) => {
    store.recenter();
    if (event.detail > 0) onPointerUse?.();
  };
  return <button type="button" className="space-status-chip" data-space-interactive="true" data-camera-chip="true"
    aria-keyshortcuts="L" title={bt("내 위치로 돌아오기 (L)", "Back to my avatar (L)")} onClick={recenter}>
    <LocateFixed size={14} aria-hidden />{bt("시점을 옮겼어요 · 내 위치로 (L)", "Looking around · back to me (L)")}
  </button>;
}
