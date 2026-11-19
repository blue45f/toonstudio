import { useEffect, useState } from "react";

export interface StudioVisualViewportMetrics {
  readonly innerHeight: number;
  readonly viewportHeight: number;
  readonly viewportOffsetTop?: number;
}

/**
 * 모바일 Safari/Chrome에서 가상 키보드가 올라왔을 때 가려지는 하단 높이(px)를 계산한다.
 * 주소창 축소·확대 같은 미세 변화(< 80px)는 키보드로 오판하지 않도록 무시한다.
 */
export function computeStudioMobileKeyboardOffset(
  metrics: StudioVisualViewportMetrics,
  minKeyboardHeightPx = 80,
): number {
  if (
    !Number.isFinite(metrics.innerHeight)
    || !Number.isFinite(metrics.viewportHeight)
    || metrics.innerHeight <= 0
    || metrics.viewportHeight <= 0
  ) {
    return 0;
  }
  const offsetTop =
    typeof metrics.viewportOffsetTop === "number" && Number.isFinite(metrics.viewportOffsetTop)
      ? Math.max(0, metrics.viewportOffsetTop)
      : 0;
  const occluded = Math.round(metrics.innerHeight - metrics.viewportHeight - offsetTop);
  return occluded >= minKeyboardHeightPx ? occluded : 0;
}

/**
 * 활성 입력(커서 채팅·모바일 하단 폼)이 열려 있을 때 `window.visualViewport` 변화를 추적해
 * 하단 오프셋(px)을 반환한다. 비활성 상태에서는 리스너를 붙이지 않는다.
 */
export function useStudioMobileKeyboardOffset(active: boolean): number {
  const [offsetPx, setOffsetPx] = useState(0);

  useEffect(() => {
    if (!active || typeof window === "undefined") {
      setOffsetPx(0);
      return undefined;
    }
    const viewport = window.visualViewport;
    if (!viewport) {
      setOffsetPx(0);
      return undefined;
    }

    const sync = () => {
      setOffsetPx(
        computeStudioMobileKeyboardOffset({
          innerHeight: window.innerHeight,
          viewportHeight: viewport.height,
          viewportOffsetTop: viewport.offsetTop,
        }),
      );
    };

    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      setOffsetPx(0);
    };
  }, [active]);

  return offsetPx;
}
