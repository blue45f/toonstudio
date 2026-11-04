import { useEffect, useState, type RefObject } from "react";

/** SVG meet 표시 비율과 실제 DPR을 추적한다. 확대·모니터 이동도 원본 필요 화소로 다시 계산한다. */
export function useStudioThumbnailPixelScale(rootRef: RefObject<HTMLDivElement | null>, viewWidth: number, viewHeight: number): number | null {
  const [scale, setScale] = useState<number | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let query: MediaQueryList | null = null;
    const measure = () => {
      const bounds = root.getBoundingClientRect();
      const dpr = Number.isFinite(globalThis.devicePixelRatio) && globalThis.devicePixelRatio > 0 ? globalThis.devicePixelRatio : 1;
      const next = Math.min(bounds.width / viewWidth, bounds.height / viewHeight) * dpr;
      setScale(Number.isFinite(next) && next > 0 ? next : null);
    };
    const watchDpr = () => {
      query?.removeEventListener("change", watchDpr);
      query = typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`) : null;
      query?.addEventListener("change", watchDpr); measure();
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(root); globalThis.addEventListener?.("resize", measure); watchDpr();
    return () => { observer?.disconnect(); query?.removeEventListener("change", watchDpr); globalThis.removeEventListener?.("resize", measure); };
  }, [rootRef, viewWidth, viewHeight]);
  return scale;
}
