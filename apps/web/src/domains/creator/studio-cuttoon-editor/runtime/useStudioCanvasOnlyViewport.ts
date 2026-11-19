import { useLayoutEffect, useRef } from "react";

export function useStudioCanvasOnlyViewport({
  isMobile, mobileImmersive, maximized, canvasOnlyMode, setMaximized, setCanvasOnlyMode,
}: { isMobile: boolean; mobileImmersive: boolean; maximized: boolean; canvasOnlyMode: boolean;
  setMaximized: (active: boolean) => void; setCanvasOnlyMode: (active: boolean) => void;
}) {
  const wasMobile = useRef(isMobile);
  useLayoutEffect(() => {
    const enteredMobile = isMobile && !wasMobile.current;
    wasMobile.current = isMobile;
    if (isMobile && maximized) setMaximized(false);
    // 데스크톱 편집 중 휴대폰 크기로 바뀌면 원래 모바일 배치를 보여 준다.
    // 이미 휴대폰에서 사용자가 연 캔버스는 복원 버튼을 누를 때까지 유지한다.
    if (enteredMobile && canvasOnlyMode) setCanvasOnlyMode(false);
  }, [isMobile, maximized, canvasOnlyMode, setMaximized, setCanvasOnlyMode]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-studio-app", "true");
    if (mobileImmersive) root.setAttribute("data-studio-mobile-immersive", "true");
    else root.removeAttribute("data-studio-mobile-immersive");
    if (canvasOnlyMode) root.setAttribute("data-studio-canvas-only", "true");
    else root.removeAttribute("data-studio-canvas-only");
    return () => {
      root.removeAttribute("data-studio-app");
      root.removeAttribute("data-studio-mobile-immersive");
      root.removeAttribute("data-studio-canvas-only");
    };
  }, [mobileImmersive, canvasOnlyMode]);
}
