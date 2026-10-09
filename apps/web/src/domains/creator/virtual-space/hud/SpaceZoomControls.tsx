import { Minus, Plus } from "lucide-react";
import type { MouseEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { STUDIO_USER_ZOOM_MAX, STUDIO_USER_ZOOM_MIN, type StudioUserZoomAction, type StudioUserZoomStore } from "../studio-virtual-space-user-zoom";
import { useSpaceUserZoom } from "./use-space-user-zoom";

/**
 * 화면 크기(줌) 버튼: 확대·현재 배율(누르면 원래 크기)·축소. 마우스 휠, + - 0 키와 같은 저장소를 쓰며,
 * 줌을 받지 않는 카메라(고정 프레임 장소)에서는 그리지 않는다. 끝 배율에서는 해당 버튼이 aria-disabled가 된다.
 * 마우스·터치로 눌렀을 때만 onPointerUse(키보드 초점을 월드로 돌려 바로 WASD로 걷게 한다)를 부르고,
 * 키보드(Enter·Space)로 활성화하면 초점을 그대로 둬 Tab 순서가 끊기지 않는다.
 */
export function SpaceZoomControls({ store, onPointerUse }: { readonly store: StudioUserZoomStore; readonly onPointerUse?: () => void }) {
  const bt = useBilingual("SpaceZoomControls");
  const { level, available } = useSpaceUserZoom(store);
  if (!available) return null;
  const percent = `${Math.round(level * 100)}%`;
  const atMax = level >= STUDIO_USER_ZOOM_MAX;
  const atMin = level <= STUDIO_USER_ZOOM_MIN;
  const press = (action: StudioUserZoomAction) => (event: MouseEvent<HTMLButtonElement>) => {
    store.apply(action);
    if (event.detail > 0) onPointerUse?.();
  };
  return <div className="space-zoom" role="group" aria-label={bt("화면 크기", "View size")} data-space-interactive="true">
    <button type="button" className="space-icon-button" aria-disabled={atMax || undefined} title={bt("확대 (+)", "Zoom in (+)")}
      aria-label={bt("화면 확대", "Zoom in")} onClick={press("in")}><Plus size={18} aria-hidden /></button>
    <button type="button" className="space-zoom__level" title={bt("원래 크기로 (0)", "Reset size (0)")}
      aria-label={bt(`화면 크기 ${percent} · 눌러서 원래 크기로`, `View size ${percent} · press to reset`)} onClick={press("reset")}>{percent}</button>
    <button type="button" className="space-icon-button" aria-disabled={atMin || undefined} title={bt("축소 (-)", "Zoom out (-)")}
      aria-label={bt("화면 축소", "Zoom out")} onClick={press("out")}><Minus size={18} aria-hidden /></button>
  </div>;
}
