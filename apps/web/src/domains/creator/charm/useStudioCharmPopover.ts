/**
 * 참 바 팝오버(참 고르기·메뉴)의 열림 상태와 위치.
 *
 * 위치는 effect 에서 상태를 맞추지 않고, 여는 순간(이벤트)과 창 크기·스크롤이 바뀔 때(이벤트 리스너)에
 * 트리거 버튼 위치를 읽어 계산한다. 바깥 클릭·Esc 닫기는 메뉴바 팝오버와 같은 훅을 쓴다.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { useStudioMenuPopoverDismiss } from "../studio-cuttoon-editor/runtime/useStudioMenuPopoverDismiss";
import { planStudioCharmPopover, type StudioCharmPopoverPlan } from "./studio-charm-popover-layout";

export const STUDIO_CHARM_POPOVER_SELECTOR = "[data-studio-charm-popover]";

export interface StudioCharmPopoverController {
  readonly plan: StudioCharmPopoverPlan | null;
  /** 트리거 버튼을 감싼 요소. 바깥 클릭 판정과 Esc 뒤 포커스 복귀에 쓴다. */
  readonly triggerRef: RefObject<HTMLDivElement | null>;
  readonly open: () => void;
  readonly close: () => void;
  readonly toggle: () => void;
}

export function useStudioCharmPopover(width?: number): StudioCharmPopoverController {
  const [plan, setPlan] = useState<StudioCharmPopoverPlan | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const isOpen = plan !== null;

  const measure = useCallback((): StudioCharmPopoverPlan | null => {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    return planStudioCharmPopover(
      trigger.getBoundingClientRect(),
      { width: window.innerWidth, height: window.innerHeight },
      { width },
    );
  }, [width]);

  const open = useCallback(() => setPlan(measure()), [measure]);
  const close = useCallback(() => setPlan(null), []);
  const toggle = useCallback(() => setPlan((current) => (current ? null : measure())), [measure]);

  useEffect(() => {
    if (!isOpen) return;
    const reposition = () => setPlan(measure());
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen, measure]);

  useStudioMenuPopoverDismiss({
    open: isOpen,
    triggerRef,
    panelSelector: STUDIO_CHARM_POPOVER_SELECTOR,
    onDismiss: close,
  });

  return { plan, triggerRef, open, close, toggle };
}
