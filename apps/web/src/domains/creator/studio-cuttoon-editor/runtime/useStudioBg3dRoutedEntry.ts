import { useEffect, useEffectEvent, useRef } from "react";

interface UseStudioBg3dRoutedEntryOptions {
  readonly routedSurface: string;
  readonly workHydrated: boolean;
  readonly sourceHydrationPending: boolean;
  readonly remoteSource: boolean;
  readonly autosaveChecked: boolean;
  readonly hasAutosave: boolean;
  readonly wasOpen: () => boolean;
  readonly resetColdSource: () => void;
  readonly openEntry: () => void;
}

/** 냉시작은 원고 복구 결정 뒤에 열고, UI로 이미 연 장면과 seed는 그대로 보존한다. */
export function useStudioBg3dRoutedEntry({
  routedSurface,
  workHydrated,
  sourceHydrationPending,
  remoteSource,
  autosaveChecked,
  hasAutosave,
  wasOpen,
  resetColdSource,
  openEntry,
}: UseStudioBg3dRoutedEntryOptions): void {
  const enteredRef = useRef(false);
  const wasOpenEvent = useEffectEvent(wasOpen);
  const resetColdSourceEvent = useEffectEvent(resetColdSource);
  const openEntryEvent = useEffectEvent(openEntry);
  const sourceReady = workHydrated && !sourceHydrationPending
    && (remoteSource || (autosaveChecked && !hasAutosave));

  useEffect(() => {
    if (routedSurface !== "bg3d") {
      enteredRef.current = false;
      return;
    }
    if (enteredRef.current) return;
    const warmEntry = wasOpenEvent();
    if (!warmEntry && !sourceReady) return;
    enteredRef.current = true;
    if (!warmEntry) resetColdSourceEvent();
    // 콜백 identity나 준비 상태가 다시 바뀌어도 같은 route의 열림을 재실행하지 않는다.
    openEntryEvent();
  }, [routedSurface, sourceReady]);
}
