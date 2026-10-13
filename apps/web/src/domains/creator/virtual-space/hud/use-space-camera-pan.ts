import { useSyncExternalStore } from "react";

import type { StudioCameraPanSnapshot, StudioCameraPanStore } from "../studio-virtual-space-camera-pan";

/** 카메라 둘러보기 저장소를 구독한다. 스냅샷은 값이 바뀔 때만 새 객체라 필요할 때만 다시 그린다. */
export function useSpaceCameraPan(store: StudioCameraPanStore): StudioCameraPanSnapshot {
  return useSyncExternalStore((onChange) => store.subscribe(onChange), () => store.getSnapshot(), () => store.getSnapshot());
}
