import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** 공개 경로의 장식 모션만 다시 시작하며 스크롤·초점·본문 표시를 소유하지 않는다. */
export function RouteEnterMotion({ enabled }: { readonly enabled: boolean }) {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!enabled) return;
    const content = document.getElementById("main-content");
    if (!content) return;
    let nextFrame = 0;
    // 두 프레임 사이에 표식을 제거해 같은 DOM을 재사용하는 경로에서도 재생한다.
    // 표식이 없어도 콘텐츠는 항상 보이며 CSS의 reduced-motion 정책을 따른다.
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => {
        content.dataset.inkRouteActive = "true";
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(nextFrame);
      delete content.dataset.inkRouteActive;
    };
  }, [enabled, pathname]);

  return null;
}
