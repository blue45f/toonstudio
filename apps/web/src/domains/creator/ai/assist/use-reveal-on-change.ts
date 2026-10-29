import { useEffect, useRef } from "react";

/**
 * 새 결과가 나오면 결과 영역의 시작이 보이도록 스크롤한다. 좁은 화면에서는 입력·설정·실행 전 확인 아래에 결과가 있어,
 * 실행 단추를 누른 사용자가 아무 일도 없었다고 오해하지 않게 한다. `key`가 바뀔 때마다(다시 실행해도) 한 번 움직이고,
 * 움직임을 줄이는 설정이면 부드러운 스크롤 없이 바로 옮긴다.
 */
export function useRevealOnChange<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!key || !node || typeof node.scrollIntoView !== "function") return;
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  }, [key]);
  return ref;
}
