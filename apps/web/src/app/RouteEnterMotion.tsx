import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const ROUTE_ENTER_KEYFRAMES: Keyframe[] = [
  { opacity: 0.001, transform: "translateY(12px)" },
  { opacity: 1, transform: "none" },
];

const ROUTE_ENTER_TIMING: KeyframeAnimationOptions = {
  duration: 360,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 클라이언트 라우트 이동 때 본문(#main-content)만 짧게 내려앉히는 전환.
 *
 * - 첫 문서 로드에는 돌지 않는다(첫 페인트·LCP를 늦추지 않는다).
 * - 같은 경로에서 검색어·해시만 바뀌면 돌지 않는다(필터·탭 조작이 깜빡이지 않게).
 * - Web Animations API로 한 번 재생하고 채움(fill)을 남기지 않아, 끝난 뒤 본문에 transform이
 *   남아 고정 위치 자식의 기준이 바뀌는 일이 없다.
 * - 동작 줄이기·고대비·편집기 같은 작업 화면에서는 재생하지 않는다(enabled=false).
 */
export function RouteEnterMotion({ enabled }: { readonly enabled: boolean }) {
  const { pathname } = useLocation();
  const previousPathname = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousPathname.current;
    previousPathname.current = pathname;
    if (previous === null || previous === pathname || !enabled) return undefined;
    if (prefersReducedMotion()) return undefined;
    if (document.documentElement.dataset.designTheme === "contrast") return undefined;
    const main = document.getElementById("main-content");
    if (!main || typeof main.animate !== "function") return undefined;
    const animation = main.animate(ROUTE_ENTER_KEYFRAMES, ROUTE_ENTER_TIMING);
    return () => animation.cancel();
  }, [pathname, enabled]);

  return null;
}
