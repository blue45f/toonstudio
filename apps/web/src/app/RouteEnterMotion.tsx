import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const ROUTE_ENTER_KEYFRAMES: Keyframe[] = [
  { opacity: 0.001, transform: "translateY(10px) scale(0.996)" },
  { opacity: 1, transform: "none" },
];

const ROUTE_ENTER_TIMING: KeyframeAnimationOptions = {
  duration: 300,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

const INK_RIBBON_KEYFRAMES: Keyframe[] = [
  { opacity: 0.95, transform: "scaleX(0)" },
  { opacity: 0.95, transform: "scaleX(0.86)", offset: 0.58 },
  { opacity: 0, transform: "scaleX(1)" },
];

const INK_RIBBON_TIMING: KeyframeAnimationOptions = {
  duration: 380,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 클라이언트 라우트 이동 때 본문(#main-content) 깊이 전환과 상단 2px 잉크 도착 헤어라인을 재생한다.
 *
 * - 첫 문서 로드에는 돌지 않는다(첫 페인트·LCP를 늦추지 않는다).
 * - 같은 경로에서 검색어·해시만 바뀌면 돌지 않는다(필터·탭 조작이 깜빡이지 않게).
 * - Web Animations API로 GPU 합성 속성만 1회 재생하고 fill을 남기지 않아, 고정 위치 자식 기준이 바뀌지 않는다.
 * - 동작 줄이기·고대비·편집기 같은 작업 화면에서는 재생하지 않는다(enabled=false).
 */
export function RouteEnterMotion({ enabled }: { readonly enabled: boolean }) {
  const { pathname } = useLocation();
  const previousPathname = useRef<string | null>(null);
  const inkRibbonRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const previous = previousPathname.current;
    previousPathname.current = pathname;
    if (previous === null || previous === pathname || !enabled) return undefined;
    if (prefersReducedMotion()) return undefined;
    if (document.documentElement.dataset.designTheme === "contrast") return undefined;

    const activeAnimations: Animation[] = [];
    const main = document.getElementById("main-content");
    if (main && typeof main.animate === "function") {
      activeAnimations.push(main.animate(ROUTE_ENTER_KEYFRAMES, ROUTE_ENTER_TIMING));
    }
    const ribbon = inkRibbonRef.current;
    if (ribbon && typeof ribbon.animate === "function") {
      activeAnimations.push(ribbon.animate(INK_RIBBON_KEYFRAMES, INK_RIBBON_TIMING));
    }
    return () => {
      for (const animation of activeAnimations) {
        animation.cancel();
      }
    };
  }, [pathname, enabled]);

  if (!enabled) return null;

  return (
    <span
      ref={inkRibbonRef}
      aria-hidden="true"
      data-route-arrival-ink="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[240] h-[2px] origin-left bg-accent opacity-0"
    />
  );
}
