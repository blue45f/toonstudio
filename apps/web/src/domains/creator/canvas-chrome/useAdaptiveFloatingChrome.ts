/**
 * 어댑티브 플로팅 패널 크롬 React 훅.
 *
 * - 캔버스 위 `pointerdown` / 활성 스트로크 신호를 감지해 비필수 플로팅 패널을 CLS 0으로 후퇴시킨다.
 * - `pointerup`/`pointercancel`, 크롬 호버, 키보드 포커스(`focusin`), 창 이탈 시 즉시 복원한다.
 * - `prefers-reduced-motion: reduce` 미디어 쿼리와 사용자 토글(`그리는 중 패널 자동 숨김`)을 존중한다.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  type CSSProperties,
  type FocusEvent,
  type RefObject,
} from "react";

import {
  ADAPTIVE_FLOATING_CHROME_TOGGLE_LABEL,
  createAdaptiveFloatingChromeState,
  evaluateAdaptiveChromeViewport,
  readAdaptiveFloatingChromeEnabled,
  reduceAdaptiveFloatingChromeState,
  resolveAdaptiveChromeSurfacePresentation,
  writeAdaptiveFloatingChromeEnabled,
  type AdaptiveChromeSurfacePresentation,
  type AdaptiveChromeSurfaceRole,
  type AdaptiveChromeViewportCheckResult,
  type AdaptiveFloatingChromeState,
} from "./studio-adaptive-floating-chrome";
import { isStudioShellDrawingSurfaceTarget } from "../studio-shell/studio-shell-drawing-auto-hide";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function detectInitialReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

function getSafeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface UseAdaptiveFloatingChromeOptions {
  readonly defaultEnabled?: boolean;
  readonly persistPreference?: boolean;
  readonly recededOpacity?: number;
  readonly essentialAlertActive?: boolean;
  readonly canvasRef?: RefObject<HTMLElement | null>;
  /** 캔버스 요소가 명시되지 않은 경우 전역 `[data-studio-canvas-viewport]`를 자동 감시한다. */
  readonly listenGlobalCanvasPointer?: boolean;
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly floatingOverlayWidthPx?: number;
}

export interface AdaptiveFloatingChromeContainerProps {
  readonly "data-adaptive-floating-chrome": "visible" | "receded";
  readonly "data-adaptive-floating-chrome-enabled": "true" | "false";
  readonly "data-adaptive-floating-chrome-reason": AdaptiveFloatingChromeState["reason"];
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
  readonly onFocus: () => void;
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
  readonly style: CSSProperties;
}

export interface UseAdaptiveFloatingChromeResult {
  readonly state: AdaptiveFloatingChromeState;
  readonly enabled: boolean;
  readonly isReceded: boolean;
  readonly reducedMotion: boolean;
  readonly toggleLabel: typeof ADAPTIVE_FLOATING_CHROME_TOGGLE_LABEL;
  readonly setEnabled: (enabled: boolean) => void;
  readonly toggleEnabled: () => void;
  readonly notifyStrokeStart: (pointerId?: number | null) => void;
  readonly notifyStrokeEnd: (pointerId?: number | null) => void;
  readonly getSurfacePresentation: (
    role?: AdaptiveChromeSurfaceRole,
  ) => AdaptiveChromeSurfacePresentation;
  readonly getSurfaceStyle: (role?: AdaptiveChromeSurfaceRole) => CSSProperties;
  readonly chromeContainerProps: AdaptiveFloatingChromeContainerProps;
  readonly viewportGuard: AdaptiveChromeViewportCheckResult;
}

export function useAdaptiveFloatingChrome(
  options: UseAdaptiveFloatingChromeOptions = {},
): UseAdaptiveFloatingChromeResult {
  const {
    defaultEnabled = true,
    persistPreference = true,
    recededOpacity,
    essentialAlertActive = false,
    canvasRef,
    listenGlobalCanvasPointer = true,
    viewportWidthPx,
    viewportHeightPx,
    floatingOverlayWidthPx = 0,
  } = options;

  const [state, dispatch] = useReducer(
    reduceAdaptiveFloatingChromeState,
    undefined,
    () =>
      createAdaptiveFloatingChromeState({
        enabled: persistPreference
          ? readAdaptiveFloatingChromeEnabled(getSafeStorage(), defaultEnabled)
          : defaultEnabled,
        reducedMotion: detectInitialReducedMotion(),
        recededOpacity,
      }),
  );

  // `prefers-reduced-motion: reduce` 변경 실시간 구독
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    dispatch({ type: "set-reduced-motion", reducedMotion: media.matches });
    const handleChange = (event: MediaQueryListEvent): void => {
      dispatch({ type: "set-reduced-motion", reducedMotion: event.matches });
    };
    media.addEventListener("change", handleChange);
    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, []);

  // 필수 안전 경고 동기화
  useEffect(() => {
    dispatch({ type: "set-essential-alert", active: essentialAlertActive });
  }, [essentialAlertActive]);

  // 문서 루트 데이터 속성 동기화(전역 보조 크롬이 동일 상태를 CLS 0으로 참조 가능)
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    root.setAttribute("data-studio-adaptive-chrome-enabled", state.enabled ? "true" : "false");
    root.setAttribute("data-studio-adaptive-chrome-phase", state.phase);
    return () => {
      root.removeAttribute("data-studio-adaptive-chrome-enabled");
      root.removeAttribute("data-studio-adaptive-chrome-phase");
    };
  }, [state.enabled, state.phase]);

  // 캔버스 포인터 획 시작/종료 감시
  useEffect(() => {
    if (typeof window === "undefined" || !state.enabled) return undefined;
    const explicitCanvas = canvasRef?.current ?? null;
    if (!explicitCanvas && !listenGlobalCanvasPointer) return undefined;

    const isDrawingTarget = (target: EventTarget | null): boolean => {
      if (explicitCanvas) {
        return target instanceof Node && explicitCanvas.contains(target);
      }
      return isStudioShellDrawingSurfaceTarget(target);
    };

    const handlePointerDown = (event: PointerEvent): void => {
      if (event.isPrimary === false || event.button !== 0) return;
      if (!isDrawingTarget(event.target)) return;
      dispatch({ type: "stroke-start", pointerId: event.pointerId });
    };

    const handlePointerEnd = (event: PointerEvent): void => {
      dispatch({ type: "stroke-end", pointerId: event.pointerId });
    };

    const handleWindowBlur = (): void => {
      dispatch({ type: "window-blur" });
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState !== "visible") {
        dispatch({ type: "window-blur" });
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointerup", handlePointerEnd, true);
    window.addEventListener("pointercancel", handlePointerEnd, true);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerEnd, true);
      window.removeEventListener("pointercancel", handlePointerEnd, true);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canvasRef, listenGlobalCanvasPointer, state.enabled]);

  const setEnabled = useCallback(
    (enabled: boolean) => {
      if (persistPreference) {
        writeAdaptiveFloatingChromeEnabled(getSafeStorage(), enabled);
      }
      dispatch({ type: "set-enabled", enabled });
    },
    [persistPreference],
  );

  const toggleEnabled = useCallback(() => {
    const next = !state.enabled;
    if (persistPreference) {
      writeAdaptiveFloatingChromeEnabled(getSafeStorage(), next);
    }
    dispatch({ type: "set-enabled", enabled: next });
  }, [persistPreference, state.enabled]);

  const notifyStrokeStart = useCallback((pointerId?: number | null) => {
    dispatch({ type: "stroke-start", pointerId });
  }, []);

  const notifyStrokeEnd = useCallback((pointerId?: number | null) => {
    dispatch({ type: "stroke-end", pointerId });
  }, []);

  const getSurfacePresentation = useCallback(
    (role: AdaptiveChromeSurfaceRole = "floating") =>
      resolveAdaptiveChromeSurfacePresentation(state, role),
    [state],
  );

  const getSurfaceStyle = useCallback(
    (role: AdaptiveChromeSurfaceRole = "floating"): CSSProperties => {
      const presentation = resolveAdaptiveChromeSurfacePresentation(state, role);
      return {
        opacity: presentation.opacity,
        transform: presentation.transform,
        pointerEvents: presentation.pointerEvents,
        transition: presentation.transition,
      };
    },
    [state],
  );

  const handlePointerEnter = useCallback(() => {
    dispatch({ type: "chrome-hover-enter" });
  }, []);

  const handlePointerLeave = useCallback(() => {
    dispatch({ type: "chrome-hover-leave" });
  }, []);

  const handleFocus = useCallback(() => {
    dispatch({ type: "chrome-focus-in" });
  }, []);

  const handleBlur = useCallback((event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    dispatch({ type: "chrome-focus-out" });
  }, []);

  const chromeContainerProps = useMemo<AdaptiveFloatingChromeContainerProps>(
    () => ({
      "data-adaptive-floating-chrome": state.phase,
      "data-adaptive-floating-chrome-enabled": state.enabled ? "true" : "false",
      "data-adaptive-floating-chrome-reason": state.reason,
      onPointerEnter: handlePointerEnter,
      onPointerLeave: handlePointerLeave,
      onFocus: handleFocus,
      onBlur: handleBlur,
      style: getSurfaceStyle("floating"),
    }),
    [
      getSurfaceStyle,
      handleBlur,
      handleFocus,
      handlePointerEnter,
      handlePointerLeave,
      state.enabled,
      state.phase,
      state.reason,
    ],
  );

  const resolvedViewportWidth =
    viewportWidthPx ?? (typeof window !== "undefined" && window.innerWidth > 0 ? window.innerWidth : 1440);
  const resolvedViewportHeight =
    viewportHeightPx ?? (typeof window !== "undefined" && window.innerHeight > 0 ? window.innerHeight : 900);

  const viewportGuard = useMemo(
    () =>
      evaluateAdaptiveChromeViewport({
        viewportWidthPx: resolvedViewportWidth,
        viewportHeightPx: resolvedViewportHeight,
        floatingOverlayWidthPx,
        phase: state.phase,
      }),
    [floatingOverlayWidthPx, resolvedViewportHeight, resolvedViewportWidth, state.phase],
  );

  return {
    state,
    enabled: state.enabled,
    isReceded: state.phase === "receded",
    reducedMotion: state.reducedMotion,
    toggleLabel: ADAPTIVE_FLOATING_CHROME_TOGGLE_LABEL,
    setEnabled,
    toggleEnabled,
    notifyStrokeStart,
    notifyStrokeEnd,
    getSurfacePresentation,
    getSurfaceStyle,
    chromeContainerProps,
    viewportGuard,
  };
}
