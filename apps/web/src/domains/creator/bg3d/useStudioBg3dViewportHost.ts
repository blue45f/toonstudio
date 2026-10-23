import { useEffect, useState, useSyncExternalStore } from "react";

import { collectDeviceSignals } from "./studio-bg3d-editor-derivations";

import type { BrowserNavigatorCapabilities } from "./studio-bg3d-editor-derivations";
import type { StudioBg3dDeviceSignals } from "./studio-bg3d-device-quality";
import type { Dispatch, RefObject, SetStateAction } from "react";

/**
 * 뷰포트 호스트 div 의 ref. 장면 도우미(간편)와 정밀 편집은 같은 `StudioBg3dEditorViewport` 를 서로 다른
 * 부모 아래에 다시 마운트하므로, 모드를 바꾸면 React 가 `current` 를 null 로 비운 뒤 새 요소로 채운다.
 * 마운트 시점에 `current` 를 한 번 읽어 관찰자를 거는 이펙트는 사라진 요소를 계속 보게 되므로,
 * 그 바뀜을 구독할 수 있게 한다.
 */
export interface StudioBg3dViewportHostRef extends RefObject<HTMLDivElement | null> {
  /** `current` 가 바뀔 때마다 동기로 호출된다(React 의 ref 연결·해제 시점). */
  subscribe(listener: () => void): () => void;
}

export function createStudioBg3dViewportHostRef(): StudioBg3dViewportHostRef {
  let element: HTMLDivElement | null = null;
  const listeners = new Set<() => void>();
  return {
    get current() {
      return element;
    },
    set current(next: HTMLDivElement | null) {
      if (next === element) return;
      element = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useStudioBg3dViewportHostRef(): StudioBg3dViewportHostRef {
  const [ref] = useState(createStudioBg3dViewportHostRef);
  return ref;
}

/** 지금 마운트된 호스트 요소(없으면 null). 요소가 바뀌면 다시 그려 이펙트가 새 요소를 따라가게 한다. */
export function useStudioBg3dViewportHost(ref: StudioBg3dViewportHostRef): HTMLDivElement | null {
  return useSyncExternalStore(ref.subscribe, () => ref.current, () => null);
}

export interface StudioBg3dViewportBoxSize {
  readonly width: number;
  readonly height: number;
}

/**
 * 오버레이(`absolute inset-0`)와 캔버스가 실제로 차지하는 칸은 호스트의 border 안쪽(padding box)이다.
 * `getBoundingClientRect()` 의 border box 를 그대로 쓰면 안내선·세이프 프레임이 가로·세로 border 두께만큼
 * 어긋나 9:16 이 정확한 9:16 이 되지 못한다(작은 뷰포트일수록 더 크게).
 */
function readViewportBox(host: HTMLElement): StudioBg3dViewportBoxSize | null {
  const rect = host.getBoundingClientRect();
  const style = getComputedStyle(host);
  const border = (...sides: string[]) => sides.reduce((sum, side) => sum + (Number.parseFloat(side) || 0), 0);
  const width = rect.width - border(style.borderLeftWidth, style.borderRightWidth);
  const height = rect.height - border(style.borderTopWidth, style.borderBottomWidth);
  return width > 0 && height > 0 ? { width, height } : null;
}

interface StudioBg3dViewportHostObserverInput {
  readonly open: boolean;
  readonly viewportHostRef: StudioBg3dViewportHostRef;
  readonly setViewportBoxSize: Dispatch<SetStateAction<StudioBg3dViewportBoxSize | null>>;
  readonly setDeviceSignals: Dispatch<SetStateAction<StudioBg3dDeviceSignals>>;
}

/**
 * 호스트의 칸 크기(세이프 프레임·9:16 안내선)와 기기 신호(해상도·화질 판단)를 지금 마운트된 호스트에서 잰다.
 * 호스트가 바뀌면 이전 요소의 관찰을 끊고 새 요소를 바로 다시 잰다.
 */
export function useStudioBg3dViewportHostObservers({
  open,
  viewportHostRef,
  setViewportBoxSize,
  setDeviceSignals,
}: StudioBg3dViewportHostObserverInput): void {
  const viewportHost = useStudioBg3dViewportHost(viewportHostRef);

  useEffect(() => {
    if (!open || !viewportHost || typeof ResizeObserver === "undefined") {
      setViewportBoxSize(null);
      return;
    }
    const sync = () => {
      const box = readViewportBox(viewportHost);
      if (!box) return;
      setViewportBoxSize((previous) => (
        previous &&
          Math.abs(previous.width - box.width) < 0.5 &&
          Math.abs(previous.height - box.height) < 0.5
          ? previous
          : box
      ));
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(viewportHost);
    return () => observer.disconnect();
  }, [open, setViewportBoxSize, viewportHost]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const browserNavigator = navigator as BrowserNavigatorCapabilities;
    const coarse = window.matchMedia?.("(pointer: coarse)");
    const fine = window.matchMedia?.("(pointer: fine)");
    const refresh = () => setDeviceSignals(collectDeviceSignals(viewportHost));
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(refresh) : null;
    if (viewportHost) observer?.observe(viewportHost);
    window.addEventListener("resize", refresh, { passive: true });
    coarse?.addEventListener?.("change", refresh);
    fine?.addEventListener?.("change", refresh);
    browserNavigator.connection?.addEventListener?.("change", refresh);
    refresh();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", refresh);
      coarse?.removeEventListener?.("change", refresh);
      fine?.removeEventListener?.("change", refresh);
      browserNavigator.connection?.removeEventListener?.("change", refresh);
    };
  }, [open, setDeviceSignals, viewportHost]);
}
