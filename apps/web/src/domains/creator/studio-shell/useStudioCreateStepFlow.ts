import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from "react";

export type StudioCreateStep = 1 | 2 | 3;
export const StudioCreateReturnContext = createContext<(() => void) | null>(null);
const HEADING_IDS = { 1: "studio-format-title", 2: "studio-project-details-title", 3: "studio-start-point-title" } as const;

/** 입력은 기존 페이지가 소유하며, 이 훅은 사용자가 선택한 단계와 DOM 초점만 관리한다. */
export function useStudioCreateStepFlow(initialStep: StudioCreateStep = 1) {
  const [step, setStep] = useState<StudioCreateStep>(initialStep);
  const pendingFocus = useRef<string | null>(null);
  const goTo = useCallback((next: StudioCreateStep, focusId: string = HEADING_IDS[next]) => {
    pendingFocus.current = focusId;
    setStep(next);
    if (next === step) {
      const target = document.getElementById(focusId);
      if (target instanceof HTMLElement) { if (!target.matches("input, button, select, textarea, a[href]")) target.tabIndex = -1; target.focus(); }
      pendingFocus.current = null;
    }
  }, [step]);
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    pendingFocus.current = null;
    if (!id) return;
    const target = document.getElementById(id);
    if (target instanceof HTMLElement) {
      if (!target.matches("input, button, select, textarea, a[href]")) target.tabIndex = -1;
      target.focus();
    }
  }, [step]);
  return { step, goTo };
}

export function useStudioCreateStepReturn() { return useContext(StudioCreateReturnContext); }
