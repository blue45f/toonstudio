import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioCommentsDocument } from "../studio-comments";
import { COMPARE_VIEWPORT_IDENTITY, type CompareSession } from "./compare-review-model";
import { captureVoiceCompareView, voiceCompareSessionForReplay, type VoiceCompareController } from "./voice-compare-view";
import type { CompareReviewViewport } from "./use-compare-review-viewport";
import type { ProcessCompareSliderDrag } from "./use-process-compare-slider-drag";
import type { ProcessCompareBlink } from "./use-process-compare-blink";

interface VoiceCompareRuntime {
  readonly session: CompareSession;
  readonly onSessionChange: (next: CompareSession) => void;
  readonly viewport: CompareReviewViewport;
  readonly slider: ProcessCompareSliderDrag;
  readonly blink: ProcessCompareBlink;
  readonly blinkMs: number;
  readonly blinkOn: boolean;
  readonly setBlinkMs: (next: number) => void;
  readonly setBlinkOn: (next: boolean) => void;
  readonly focusedPane: number;
  readonly setFocusedPane: (next: number) => void;
  readonly selectedPinId: string | null;
  readonly setSelectedPinId: (next: string | null) => void;
  readonly comments: StudioCommentsDocument;
  readonly announce: (message: string) => void;
  readonly onControllerChange?: (controller: VoiceCompareController | null) => void;
}

/** 뷰어의 실제 상태를 읽고 같은 authority의 setter로 복원한다. 별도 세션 사본을 소유하지 않는다. */
export function useVoiceCompareController(runtime: VoiceCompareRuntime): string | null {
  const bt = useBilingual("CompareReview");
  const [replayError, setReplayError] = useState<string | null>(null);
  const currentRef = useRef<VoiceCompareRuntime | null>(null);
  const unavailableRef = useRef("");
  const unavailable = bt("해설이 가리키는 비교 소스를 현재 풀에서 찾지 못했습니다. 해당 버전을 불러온 뒤 다시 재생해 주세요.",
    "The comparison source in this commentary is unavailable. Load that version and play again.");
  useLayoutEffect(() => { currentRef.current = runtime; unavailableRef.current = unavailable; });
  useLayoutEffect(() => () => { currentRef.current = null; }, []);
  const controller = useMemo<VoiceCompareController>(() => ({
    capture() {
      const current = currentRef.current;
      if (!current) return null;
      const view = captureVoiceCompareView(current.session, {
        shared: current.viewport.shared,
        locals: current.session.panes.map((_, index) => current.viewport.localFor(index)),
        sliderPosition: current.slider.position,
        blink: { enabled: current.blinkOn, intervalMs: current.blinkMs, phase: current.blink.phase },
        focusedPane: current.focusedPane,
      });
      const pin = current.comments.threads.find((thread) => thread.id === current.selectedPinId);
      return view ? { view, pinThreadIds: pin ? [pin.id] : [] } : null;
    },
    apply(view, pinThreadIds) {
      const current = currentRef.current;
      if (!current) return false;
      const next = voiceCompareSessionForReplay(current.session, view);
      if (!next) {
        setReplayError(unavailableRef.current);
        current.announce(unavailableRef.current);
        return false;
      }
      setReplayError(null);
      current.onSessionChange(next);
      const compare = view.compare;
      current.viewport.restore(compare?.shared ?? { scale: view.scale, tx: view.tx, ty: view.ty },
        compare?.locals ?? next.panes.map(() => COMPARE_VIEWPORT_IDENTITY));
      if (compare) {
        current.slider.setPosition(compare.sliderPosition);
        current.setBlinkMs(compare.blink.intervalMs);
        current.setBlinkOn(compare.blink.enabled);
        current.blink.setPhase(compare.blink.phase);
        current.setFocusedPane(compare.focusedPane);
      }
      current.setSelectedPinId(pinThreadIds.find((id) => current.comments.threads.some((thread) => thread.id === id)) ?? null);
      return true;
    },
  }), []);
  const onControllerChange = runtime.onControllerChange;
  const sourcePool = runtime.session.pool;
  useLayoutEffect(() => {
    onControllerChange?.(controller);
    return () => { onControllerChange?.(null); };
  }, [onControllerChange, sourcePool, controller]);
  return replayError;
}
