import { useEffect, useRef, type RefObject } from "react";

import { productTourSpaceToggle } from "./product-tour-playback";

/** 영상 화면이 뷰포트에 이 비율 이상 보여야 Space를 토글로 받는다. 덜 보이면 페이지 스크롤에 양보한다. */
const MIN_VISIBLE_RATIO = 0.35;

function isTourScreenInView(section: HTMLElement): boolean {
  if (document.fullscreenElement && section.contains(document.fullscreenElement)) return true;
  const screen = section.querySelector(".product-tour-player__screen") ?? section;
  const rect = screen.getBoundingClientRect();
  if (rect.height <= 0) return false;
  const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
  return visible >= rect.height * MIN_VISIBLE_RATIO;
}

/**
 * 제품 투어 재생기의 Space 재생·정지 토글.
 *
 * 전역 키 입력은 재생기 영역과 한 번이라도 상호작용했거나(클릭·포커스) 재생이 시작된
 * 뒤에만 받는다. 그 전에는 Space가 페이지 스크롤 같은 기본 동작을 유지한다.
 * 토글 대상 판정은 productTourSpaceToggle이 맡고, 여기서는 활성화 조건과
 * 영상 화면의 노출 조건만 확인한 뒤 재생기 자체 토글에 위임한다.
 */
export function useProductTourSpaceToggle(options: {
  readonly sectionRef: RefObject<HTMLElement | null>;
  /** 재생 중이면 정지, 멈춰 있으면 재생한다. 시작 전이면 시작 동작으로 연결한다. */
  readonly togglePlayPause: () => void;
  /** 재생(또는 호환 재생 마운트)이 시작됐는지. 시작 자체를 상호작용으로 간주한다. */
  readonly active: boolean;
}): void {
  const { sectionRef } = options;
  const toggleRef = useRef(options.togglePlayPause);
  const activeRef = useRef(options.active);
  const interactedRef = useRef(false);

  useEffect(() => {
    toggleRef.current = options.togglePlayPause;
    activeRef.current = options.active;
  });

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const markInteracted = () => {
      interactedRef.current = true;
    };
    section.addEventListener("pointerdown", markInteracted);
    section.addEventListener("focusin", markInteracted);
    return () => {
      section.removeEventListener("pointerdown", markInteracted);
      section.removeEventListener("focusin", markInteracted);
    };
  }, [sectionRef]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!productTourSpaceToggle(event)) return;
      const section = sectionRef.current;
      if (!section) return;
      if (!interactedRef.current && !activeRef.current) return;
      if (!isTourScreenInView(section)) return;
      event.preventDefault();
      toggleRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sectionRef]);
}
