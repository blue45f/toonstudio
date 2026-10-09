import { useSyncExternalStore } from "react";

import type { StudioUserZoomSnapshot, StudioUserZoomStore } from "../studio-virtual-space-user-zoom";

/** 사용자 줌 저장소를 구독한다. 스냅샷은 값이 바뀔 때만 새 객체라 필요할 때만 다시 그린다. */
export function useSpaceUserZoom(store: StudioUserZoomStore): StudioUserZoomSnapshot {
  return useSyncExternalStore((onChange) => store.subscribe(onChange), () => store.getSnapshot(), () => store.getSnapshot());
}
