import { useLayoutEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { getStudioVrmQualityTier, isStudioVrmLowEndHardwareDevice } from "./studio-vrm-gpu-capability";
import { resolveStudioVrmDisplayDpr } from "./studio-vrm-render-policy";

function subscribeVisibility(notify: () => void): () => void {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
}
function visibleSnapshot(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function resolveInitialStudioVrmDisplayDpr(): number {
  if (typeof window === "undefined") return 1;
  const deviceDpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
    ? window.devicePixelRatio
    : 1;
  const coarse = typeof matchMedia === "function" ? matchMedia("(pointer: coarse)").matches : true;
  if (coarse && isStudioVrmLowEndHardwareDevice()) return Math.min(deviceDpr, 1);
  return Math.min(deviceDpr, 2);
}

/** 표시 예산만 조정하고 내보내기 중에는 기존 작업면 배율을 유지한다. */
export function useStudioVrmViewportBudget(ref: RefObject<HTMLElement | null> | undefined, captureActive: boolean) {
  const [dpr, setDpr] = useState(resolveInitialStudioVrmDisplayDpr);
  const visible = useSyncExternalStore(subscribeVisibility, visibleSnapshot, () => true);
  useLayoutEffect(() => {
    const element = ref?.current;
    if (!element || captureActive) return;
    const query = typeof matchMedia === "function" ? matchMedia("(pointer: coarse)") : null;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const coarse = query?.matches ?? true;
      const next = resolveStudioVrmDisplayDpr({ width: rect.width, height: rect.height,
        devicePixelRatio: window.devicePixelRatio, coarse,
        tier: getStudioVrmQualityTier(), lowEndMobile: coarse && isStudioVrmLowEndHardwareDevice() });
      setDpr(next);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(element);
    query?.addEventListener("change", schedule);
    window.addEventListener("resize", schedule);
    const visualViewport = window.visualViewport ?? null;
    visualViewport?.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      query?.removeEventListener("change", schedule);
      window.removeEventListener("resize", schedule);
      visualViewport?.removeEventListener("resize", schedule);
    };
  }, [captureActive, ref]);
  return { dpr, visible };
}
