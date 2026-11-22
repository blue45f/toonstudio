import { useLayoutEffect, useRef, type RefObject } from "react";

interface StudioCanvasAutoScaleOptions {
  readonly wrapRef: RefObject<HTMLDivElement | null>;
  readonly documentWidth: number;
  readonly maximumScale: number;
  readonly setScale: (scale: number) => void;
}

/** 실제 뷰포트의 표시 수명에서만 유효한 폭을 원고 배율에 반영한다. */
export function useStudioCanvasAutoScale({
  wrapRef,
  documentWidth,
  maximumScale,
  setScale,
}: StudioCanvasAutoScaleOptions): void {
  const documentWidthRef = useRef(documentWidth);
  useLayoutEffect(() => {
    documentWidthRef.current = documentWidth;
  }, [documentWidth]);

  useLayoutEffect(() => {
    const node = wrapRef.current;
    if (!node) return undefined;
    let active = true;
    const measure = (): void => {
      if (!active || !node.isConnected || wrapRef.current !== node) return;
      const width = node.clientWidth;
      const currentDocumentWidth = documentWidthRef.current;
      // Suspense 가림이나 아직 배치되지 않은 0폭으로 정상 배율을 덮어쓰지 않는다.
      if (!Number.isFinite(width) || width <= 0
        || !Number.isFinite(currentDocumentWidth) || currentDocumentWidth <= 0) return;
      setScale(Math.min(maximumScale, Math.max(0.1, width / currentDocumentWidth)));
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    globalThis.addEventListener("resize", measure);
    return () => {
      active = false;
      observer?.disconnect();
      globalThis.removeEventListener("resize", measure);
    };
  }, [maximumScale, setScale, wrapRef]);
}
