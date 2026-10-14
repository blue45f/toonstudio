import { useCallback, useRef, useState } from "react";

import {
  COMPARE_VIEWPORT_IDENTITY,
  panCompareViewport,
  zoomCompareViewport,
  type SharedCompareViewport,
} from "./compare-review-model";

/**
 * 비교 검수 뷰포트 상태: 공유 뷰포트(동기화 켜짐) + 페인별 개별 뷰포트(잠금 해제 시).
 * 확대·이동 수학은 전부 compare-review-model의 순수 함수가 맡고, 이 훅은 상태와
 * 포인터 제스처(휠 확대·드래그 이동)의 연결만 소유한다.
 */
export interface CompareReviewViewport {
  readonly shared: SharedCompareViewport;
  readonly locals: Readonly<Record<number, SharedCompareViewport>>;
  readonly localFor: (paneIndex: number) => SharedCompareViewport;
  readonly zoomAt: (paneIndex: number, syncView: boolean, factor: number, center: { x: number; y: number }) => void;
  readonly setScale: (paneIndex: number, syncView: boolean, nextScale: number) => void;
  readonly panBy: (paneIndex: number, syncView: boolean, delta: { dx: number; dy: number }) => void;
  readonly reset: () => void;
  /** 드래그 이동 제스처 핸들러 묶음. pin/스포이드 모드에서는 호출 측이 붙이지 않는다. */
  readonly panHandlers: (paneIndex: number, syncView: boolean) => {
    readonly onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    readonly onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    readonly onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    readonly onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  };
}

export function useCompareReviewViewport(): CompareReviewViewport {
  const [shared, setShared] = useState<SharedCompareViewport>(COMPARE_VIEWPORT_IDENTITY);
  const [locals, setLocals] = useState<Readonly<Record<number, SharedCompareViewport>>>({});
  const dragRef = useRef<{ paneIndex: number; lastX: number; lastY: number; width: number; height: number } | null>(null);

  const localFor = useCallback(
    (paneIndex: number) => locals[paneIndex] ?? COMPARE_VIEWPORT_IDENTITY,
    [locals],
  );

  const applyTo = useCallback(
    (paneIndex: number, syncView: boolean, update: (viewport: SharedCompareViewport) => SharedCompareViewport) => {
      if (syncView) {
        setShared((current) => update(current));
      } else {
        setLocals((current) => ({
          ...current,
          [paneIndex]: update(current[paneIndex] ?? COMPARE_VIEWPORT_IDENTITY),
        }));
      }
    },
    [],
  );

  const zoomAt = useCallback(
    (paneIndex: number, syncView: boolean, factor: number, center: { x: number; y: number }) => {
      applyTo(paneIndex, syncView, (viewport) => zoomCompareViewport(viewport, viewport.scale * factor, center));
    },
    [applyTo],
  );

  const setScale = useCallback(
    (paneIndex: number, syncView: boolean, nextScale: number) => {
      applyTo(paneIndex, syncView, (viewport) => zoomCompareViewport(viewport, nextScale, { x: 0.5, y: 0.5 }));
    },
    [applyTo],
  );

  const panBy = useCallback(
    (paneIndex: number, syncView: boolean, delta: { dx: number; dy: number }) => {
      applyTo(paneIndex, syncView, (viewport) => panCompareViewport(viewport, delta));
    },
    [applyTo],
  );

  const reset = useCallback(() => {
    setShared(COMPARE_VIEWPORT_IDENTITY);
    setLocals({});
  }, []);

  const panHandlers = useCallback(
    (paneIndex: number, syncView: boolean) => ({
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        dragRef.current = {
          paneIndex,
          lastX: event.clientX,
          lastY: event.clientY,
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
        };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* 포인터 캡처 미지원 환경에서는 move/up 리스너만으로 동작한다 */
        }
      },
      onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.paneIndex !== paneIndex) return;
        const dx = (event.clientX - drag.lastX) / drag.width;
        const dy = (event.clientY - drag.lastY) / drag.height;
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
        if (dx !== 0 || dy !== 0) panBy(paneIndex, syncView, { dx, dy });
      },
      onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
        if (dragRef.current?.paneIndex === paneIndex) dragRef.current = null;
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          /* noop */
        }
      },
      onPointerCancel: () => {
        if (dragRef.current?.paneIndex === paneIndex) dragRef.current = null;
      },
    }),
    [panBy],
  );

  return { shared, locals, localFor, zoomAt, setScale, panBy, reset, panHandlers };
}
