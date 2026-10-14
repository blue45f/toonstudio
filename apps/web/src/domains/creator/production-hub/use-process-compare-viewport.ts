import { useCallback, useRef, useState } from "react";

import {
  panProcessCompareViewport,
  PROCESS_COMPARE_VIEWPORT_IDENTITY,
  zoomProcessCompareViewportAt,
  type ProcessCompareViewport,
} from "./process-compare-model";

/**
 * 비교 뷰어 뷰포트 상태 (2단계, FLAGSHIP §5.1).
 *
 * 잠금이 켜져 있으면 공유 뷰포트 하나만 바뀌어 전 페인이 같은 배율·같은
 * 상대 위치로 움직이고, 잠금을 풀면 페인별 개별 뷰포트로 독립 조작한다.
 * 확대·이동 수학은 전부 process-compare-model의 순수 함수가 맡고,
 * 이 훅은 상태와 포인터 제스처(휠 확대·드래그 이동)의 연결만 소유한다.
 */
export interface ProcessCompareViewportControls {
  readonly shared: ProcessCompareViewport;
  readonly locals: Readonly<Record<number, ProcessCompareViewport>>;
  readonly localFor: (paneIndex: number) => ProcessCompareViewport;
  readonly viewportFor: (paneIndex: number, syncView: boolean) => ProcessCompareViewport;
  readonly zoomAt: (paneIndex: number, syncView: boolean, factor: number, center: { x: number; y: number }) => void;
  readonly setScale: (paneIndex: number, syncView: boolean, nextScale: number) => void;
  readonly panBy: (paneIndex: number, syncView: boolean, delta: { dx: number; dy: number }) => void;
  readonly reset: () => void;
  /** 드래그 이동 + 휠 확대 제스처 핸들러 묶음. */
  readonly gestureHandlers: (paneIndex: number, syncView: boolean) => {
    readonly onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    readonly onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    readonly onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    readonly onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
    readonly onWheel: (event: React.WheelEvent<HTMLElement>) => void;
  };
}

export function useProcessCompareViewport(): ProcessCompareViewportControls {
  const [shared, setShared] = useState<ProcessCompareViewport>(PROCESS_COMPARE_VIEWPORT_IDENTITY);
  const [locals, setLocals] = useState<Readonly<Record<number, ProcessCompareViewport>>>({});
  const dragRef = useRef<{ paneIndex: number; lastX: number; lastY: number; width: number; height: number } | null>(null);

  const localFor = useCallback(
    (paneIndex: number) => locals[paneIndex] ?? PROCESS_COMPARE_VIEWPORT_IDENTITY,
    [locals],
  );

  const viewportFor = useCallback(
    (paneIndex: number, syncView: boolean) => (syncView ? shared : localFor(paneIndex)),
    [shared, localFor],
  );

  const applyTo = useCallback(
    (paneIndex: number, syncView: boolean, update: (viewport: ProcessCompareViewport) => ProcessCompareViewport) => {
      if (syncView) {
        setShared((current) => update(current));
      } else {
        setLocals((current) => ({
          ...current,
          [paneIndex]: update(current[paneIndex] ?? PROCESS_COMPARE_VIEWPORT_IDENTITY),
        }));
      }
    },
    [],
  );

  const zoomAt = useCallback(
    (paneIndex: number, syncView: boolean, factor: number, center: { x: number; y: number }) => {
      if (!Number.isFinite(factor) || factor <= 0) return;
      applyTo(paneIndex, syncView, (viewport) =>
        zoomProcessCompareViewportAt(viewport, viewport.scale * factor, center));
    },
    [applyTo],
  );

  const setScale = useCallback(
    (paneIndex: number, syncView: boolean, nextScale: number) => {
      applyTo(paneIndex, syncView, (viewport) =>
        zoomProcessCompareViewportAt(viewport, nextScale, { x: 0.5, y: 0.5 }));
    },
    [applyTo],
  );

  const panBy = useCallback(
    (paneIndex: number, syncView: boolean, delta: { dx: number; dy: number }) => {
      applyTo(paneIndex, syncView, (viewport) => panProcessCompareViewport(viewport, delta));
    },
    [applyTo],
  );

  const reset = useCallback(() => {
    setShared(PROCESS_COMPARE_VIEWPORT_IDENTITY);
    setLocals({});
  }, []);

  const gestureHandlers = useCallback(
    (paneIndex: number, syncView: boolean) => ({
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        // 슬라이더 핸들·버튼 등 자식 컨트롤의 드래그와 충돌하지 않게, 컨트롤에서 난 이벤트는 건드리지 않는다.
        if ((event.target as HTMLElement).closest("button, select, input, a, [role='slider']")) return;
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
      onWheel: (event: React.WheelEvent<HTMLElement>) => {
        // Ctrl/⌘+휠(트랙패드 핀치 포함)만 확대한다. 일반 휠은 기존 스크롤(동기 스크롤 포함)을 유지한다.
        if (!event.ctrlKey && !event.metaKey) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const center = {
          x: rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5,
          y: rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5,
        };
        zoomAt(paneIndex, syncView, event.deltaY < 0 ? 1.1 : 1 / 1.1, center);
      },
    }),
    [panBy, zoomAt],
  );

  return { shared, locals, localFor, viewportFor, zoomAt, setScale, panBy, reset, gestureHandlers };
}
