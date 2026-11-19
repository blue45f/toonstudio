import { createContext, useContext, useLayoutEffect, useMemo, useRef } from "react";
import type { ImageEl } from "../studio-element-model";

export interface StudioAppliedFilterIntent {
  scope: string;
  elementId: string;
  src: string;
  program: string;
  mask: string | undefined;
}

export interface WatchedFilter {
  intent: StudioAppliedFilterIntent;
  start(): () => void;
}

export const ApplyContext = createContext<((image: ImageEl) => void) | null>(null);
export const WatchContext = createContext<WatchedFilter | null>(null);
export const useStudioAppliedFilterIntent = () => useContext(ApplyContext);

/** 사용자가 적용한 원고 레이어만 추적한다. 미리보기와 뒤늦은 이전 요청은 현재 안내를 끝낼 수 없다. */
export function useStudioAppliedFilterDraw(image: ImageEl, program: string, requestKey: string, eligible: boolean) {
  const watching = useContext(WatchContext);
  const target = eligible && watching?.intent.elementId === image.id && watching.intent.src === image.src
    && watching.intent.program === program && watching.intent.mask === image.filterMaskSrc ? watching : null;
  const holder = useRef<{ target: WatchedFilter; requestKey: string; finish: () => void } | null>(null);
  useLayoutEffect(() => {
    if (!target) return;
    const drawing = { target, requestKey, finish: target.start() };
    holder.current = drawing;
    return () => {
      if (holder.current !== drawing) return;
      holder.current = null;
      drawing.finish();
    };
  }, [target, requestKey]);
  return useMemo(() => target ? () => {
    const drawing = holder.current;
    if (drawing?.target !== target || drawing.requestKey !== requestKey) return;
    holder.current = null;
    drawing.finish();
  } : undefined, [target, requestKey]);
}
