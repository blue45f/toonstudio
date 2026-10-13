import { useSyncExternalStore } from "react";

import { studioEmoteKeymapStore, type StudioEmoteKeymap, type StudioEmoteKeymapStore } from "../studio-virtual-space-emote-keymap";

/** 이모트 단축키 배정을 구독한다. 스냅샷은 바뀔 때만 새 객체라 필요할 때만 다시 그린다. */
export function useSpaceEmoteKeymap(store: StudioEmoteKeymapStore = studioEmoteKeymapStore): StudioEmoteKeymap {
  return useSyncExternalStore((onChange) => store.subscribe(onChange), () => store.getSnapshot(), () => store.getSnapshot());
}
