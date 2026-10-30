import { useCallback, useRef } from "react";

import type { VoiceViewSnapshot } from "./review-voice-commentary-model";
import type { VoiceCompareController } from "./voice-compare-view";

/** 탭 전환으로 뷰어가 아직 없는 동안에는 마지막 재생 위치를 보관한다. */
export function useVoiceCompareBridge() {
  const controllerRef = useRef<VoiceCompareController | null>(null);
  const pendingRef = useRef<{ view: VoiceViewSnapshot; pins: readonly string[] } | null>(null);
  const register = useCallback((controller: VoiceCompareController | null) => {
    controllerRef.current = controller;
    const pending = pendingRef.current;
    if (controller && pending && controller.apply(pending.view, pending.pins)) pendingRef.current = null;
  }, []);
  const capture = useCallback(() => controllerRef.current?.capture() ?? null, []);
  const apply = useCallback((view: VoiceViewSnapshot, pins: readonly string[]) => {
    if (view.surface !== "compare") { pendingRef.current = null; return; }
    pendingRef.current = { view, pins };
    if (controllerRef.current?.apply(view, pins)) pendingRef.current = null;
  }, []);
  return { register, capture, apply };
}
