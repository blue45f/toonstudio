/**
 * 참 바 팝오버(참 고르기·메뉴)의 열림 상태와 위치.
 *
 * 위치는 effect 에서 상태를 맞추지 않고, 여는 순간(이벤트)과 창 크기·스크롤이 바뀔 때(이벤트 리스너)에
 * 트리거 버튼 위치를 읽어 계산한다. 바깥 클릭·Esc 닫기는 메뉴바 팝오버와 같은 훅을 쓴다(Esc 는 트리거로 포커스를 돌려보낸다).
 * 키보드로 팝오버 안에서 닫는 길(항목 실행·Tab 가장자리)도 같은 곳으로 돌려보내는 `closeToTrigger` 를 준다.
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
  /** 닫기만 한다(포커스는 건드리지 않는다). 바깥 클릭이나 다른 컨트롤로 넘어갈 때 쓴다. */
  readonly close: () => void;
  /** 닫고 포커스를 트리거 버튼으로 돌려보낸다. 팝오버 안의 키보드 조작이 끝났을 때 쓴다. */
  readonly closeToTrigger: () => void;
  readonly toggle: () => void;
}

function samePlan(left: StudioCharmPopoverPlan, right: StudioCharmPopoverPlan): boolean {
  return left.placement === right.placement
    && left.left === right.left
    && left.top === right.top
    && left.width === right.width
    && left.maxHeight === right.maxHeight;
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
  const closeToTrigger = useCallback(() => {
    setPlan(null);
    triggerRef.current?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus();
  }, []);
  const toggle = useCallback(() => setPlan((current) => (current ? null : measure())), [measure]);

  useEffect(() => {
    if (!isOpen) return;
    // 위치가 그대로면 이전 계획을 그대로 둔다: 새 객체를 넣으면 스크롤 이벤트 하나마다 바와 선택기가 다시 그려진다.
    const reposition = () => {
      const next = measure();
      setPlan((current) => (current && next && samePlan(current, next) ? current : next));
    };
    const onScroll = (event: Event) => {
      // 팝오버 안 목록을 스크롤하는 것은 트리거 위치를 바꾸지 않는다.
      if (event.target instanceof Element && event.target.closest(STUDIO_CHARM_POPOVER_SELECTOR)) return;
      reposition();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [isOpen, measure]);

  useStudioMenuPopoverDismiss({
    open: isOpen,
    triggerRef,
    panelSelector: STUDIO_CHARM_POPOVER_SELECTOR,
    onDismiss: close,
  });

  return { plan, triggerRef, open, close, closeToTrigger, toggle };
}
