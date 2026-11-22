/**
 * 어댑티브 플로팅 패널 크롬 & Calm Atelier 5-모드 React 훅.
 *
 * - 캔버스 위 `pointerdown` / 활성 스트로크 신호를 감지해 비필수 플로팅 패널을 CLS 0으로 후퇴시킨다.
 * - `pointerup`/`pointercancel`, 크롬 호버, 키보드 포커스(`focusin`), 창 이탈 시 즉시 복원한다.
 * - `콘티 · 선화 · 채색 · 식자 · 3D` 5개 작업 모드를 CLS 0으로 전환하고,
 *   `2560px` 울트라와이드 ↔ `1280px` 노트북 리사이즈 시 플로팅 패널을 좌·우 도크로 자동 스냅한다.
 * - 브라우저 저장소(`localStorage`/`sessionStorage`/`indexedDB`)를 직접 호출하지 않으며,
 *   메모리 상태를 기본으로 하되 필요 시 외부 storage 어댑터나 콜백을 주입받아 동기화한다.
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
  STUDIO_ADAPTIVE_MODE_PROFILES,
  createAdaptiveFloatingChromeState,
  evaluateAdaptiveChromeViewport,
  evaluateAdaptiveModeOccupancyForState,
  getStudioAdaptiveModeProfile,
  readAdaptiveFloatingChromeEnabled,
  reduceAdaptiveFloatingChromeState,
  resolveAdaptiveChromeSurfacePresentation,
  writeAdaptiveFloatingChromeEnabled,
  type AdaptiveChromeSurfacePresentation,
  type AdaptiveChromeSurfaceRole,
  type AdaptiveChromeViewportCheckResult,
  type AdaptiveFloatingChromeState,
  type AdaptiveModeCanvasOccupancy,
  type AdaptiveModeSwitchClsReport,
  type FloatingPanelDockSide,
  type FloatingPanelEdgeSnapResult,
  type StudioAdaptiveModeId,
  type StudioAdaptiveModeProfile,
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

function readWindowViewportWidth(fallback: number): number {
  if (typeof window !== "undefined" && window.innerWidth > 0) {
    return window.innerWidth;
  }
  return fallback;
}

function readWindowViewportHeight(fallback: number): number {
  if (typeof window !== "undefined" && window.innerHeight > 0) {
    return window.innerHeight;
  }
  return fallback;
}

export interface AdaptiveChromePreferenceStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

export interface UseAdaptiveFloatingChromeOptions {
  readonly defaultEnabled?: boolean;
  readonly persistPreference?: boolean;
  /** 외부 저장소 어댑터 주입(미지정 시 순수 메모리 상태로 동작). */
  readonly storage?: AdaptiveChromePreferenceStorage | null;
  readonly onEnabledChange?: (enabled: boolean) => void;
  readonly initialMode?: StudioAdaptiveModeId;
  readonly onModeChange?: (mode: StudioAdaptiveModeId) => void;
  readonly recededOpacity?: number;
  readonly essentialAlertActive?: boolean;
  readonly canvasRef?: RefObject<HTMLElement | null>;
  /** 캔버스 요소가 명시되지 않은 경우 전역 `[data-studio-canvas-viewport]`를 자동 감시한다. */
  readonly listenGlobalCanvasPointer?: boolean;
  /** 창 리사이즈(`2560px ↔ 1280px`) 시 좌·우 도크 자동 스냅을 갱신한다. */
  readonly listenWindowResize?: boolean;
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly floatingOverlayWidthPx?: number;
  readonly floatingPanelWidthPx?: number;
  readonly floatingPanelHeightPx?: number;
  readonly floatingPanelX?: number;
  readonly floatingPanelY?: number;
  readonly preferredDockSide?: FloatingPanelDockSide;
}

export interface AdaptiveFloatingChromeContainerProps {
  readonly "data-adaptive-floating-chrome": "visible" | "receded";
  readonly "data-adaptive-floating-chrome-enabled": "true" | "false";
  readonly "data-adaptive-floating-chrome-reason": AdaptiveFloatingChromeState["reason"];
  readonly "data-adaptive-mode": StudioAdaptiveModeId;
  readonly "data-adaptive-dock-side": FloatingPanelDockSide;
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
  readonly onFocus: () => void;
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
  readonly style: CSSProperties;
}

export interface SnapFloatingPanelInput {
  readonly currentX: number;
  readonly currentY?: number;
  readonly panelWidthPx?: number;
  readonly panelHeightPx?: number;
  readonly preferredDockSide?: FloatingPanelDockSide;
}

export interface UseAdaptiveFloatingChromeResult {
  readonly state: AdaptiveFloatingChromeState;
  readonly enabled: boolean;
  readonly isReceded: boolean;
  readonly reducedMotion: boolean;
  readonly toggleLabel: typeof ADAPTIVE_FLOATING_CHROME_TOGGLE_LABEL;
  readonly activeMode: StudioAdaptiveModeId;
  readonly activeModeProfile: StudioAdaptiveModeProfile;
  readonly modes: readonly StudioAdaptiveModeProfile[];
  readonly lastModeSwitchCls: AdaptiveModeSwitchClsReport;
  readonly floatingPanelSnap: FloatingPanelEdgeSnapResult;
  readonly modeViewportOccupancy: AdaptiveModeCanvasOccupancy;
  readonly setEnabled: (enabled: boolean) => void;
  readonly toggleEnabled: () => void;
  readonly setMode: (mode: StudioAdaptiveModeId) => void;
  readonly snapFloatingPanel: (input: SnapFloatingPanelInput) => void;
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
    storage = null,
    onEnabledChange,
    initialMode,
    onModeChange,
    recededOpacity,
    essentialAlertActive = false,
    canvasRef,
    listenGlobalCanvasPointer = true,
    listenWindowResize = true,
    viewportWidthPx,
    viewportHeightPx,
    floatingOverlayWidthPx = 0,
    floatingPanelWidthPx,
    floatingPanelHeightPx,
    floatingPanelX,
    floatingPanelY,
    preferredDockSide,
  } = options;

  const [state, dispatch] = useReducer(
    reduceAdaptiveFloatingChromeState,
    undefined,
    () =>
      createAdaptiveFloatingChromeState({
        enabled:
          persistPreference && storage
            ? readAdaptiveFloatingChromeEnabled(storage, defaultEnabled)
            : defaultEnabled,
        reducedMotion: detectInitialReducedMotion(),
        recededOpacity,
        initialMode,
        viewportWidthPx: viewportWidthPx ?? readWindowViewportWidth(1440),
        viewportHeightPx: viewportHeightPx ?? readWindowViewportHeight(900),
        floatingPanelWidthPx:
          floatingPanelWidthPx ?? (floatingOverlayWidthPx > 0 ? floatingOverlayWidthPx : undefined),
        floatingPanelHeightPx,
        floatingPanelX,
        floatingPanelY,
        preferredDockSide,
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

  // 외부에서 명시 뷰포트 크기를 변경할 때 자동 도크 스냅 동기화
  useEffect(() => {
    if (viewportWidthPx === undefined && viewportHeightPx === undefined) return;
    dispatch({
      type: "resize-viewport",
      viewportWidthPx: viewportWidthPx ?? state.viewportWidthPx,
      viewportHeightPx: viewportHeightPx ?? state.viewportHeightPx,
      panelWidthPx: floatingPanelWidthPx,
      panelHeightPx: floatingPanelHeightPx,
    });
  }, [
    floatingPanelHeightPx,
    floatingPanelWidthPx,
    state.viewportHeightPx,
    state.viewportWidthPx,
    viewportHeightPx,
    viewportWidthPx,
  ]);

  // 창 리사이즈(`2560px ↔ 1280px`) 시 플로팅 패널 좌·우 도크 자동 스냅
  useEffect(() => {
    if (typeof window === "undefined" || !listenWindowResize) return undefined;
    if (viewportWidthPx !== undefined && viewportHeightPx !== undefined) return undefined;
    const handleResize = (): void => {
      dispatch({
        type: "resize-viewport",
        viewportWidthPx: readWindowViewportWidth(1440),
        viewportHeightPx: readWindowViewportHeight(900),
        panelWidthPx: floatingPanelWidthPx,
        panelHeightPx: floatingPanelHeightPx,
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [
    floatingPanelHeightPx,
    floatingPanelWidthPx,
    listenWindowResize,
    viewportHeightPx,
    viewportWidthPx,
  ]);

  // 문서 루트 데이터 속성 동기화(전역 보조 크롬이 동일 상태를 CLS 0으로 참조 가능)
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    root.setAttribute("data-studio-adaptive-chrome-enabled", state.enabled ? "true" : "false");
    root.setAttribute("data-studio-adaptive-chrome-phase", state.phase);
    root.setAttribute("data-studio-adaptive-mode", state.activeMode);
    root.setAttribute("data-studio-adaptive-dock-side", state.floatingPanelSnap.dockSide);
    return () => {
      root.removeAttribute("data-studio-adaptive-chrome-enabled");
      root.removeAttribute("data-studio-adaptive-chrome-phase");
      root.removeAttribute("data-studio-adaptive-mode");
      root.removeAttribute("data-studio-adaptive-dock-side");
    };
  }, [state.activeMode, state.enabled, state.floatingPanelSnap.dockSide, state.phase]);

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
      if (persistPreference && storage) {
        writeAdaptiveFloatingChromeEnabled(storage, enabled);
      }
      onEnabledChange?.(enabled);
      dispatch({ type: "set-enabled", enabled });
    },
    [onEnabledChange, persistPreference, storage],
  );

  const toggleEnabled = useCallback(() => {
    const next = !state.enabled;
    if (persistPreference && storage) {
      writeAdaptiveFloatingChromeEnabled(storage, next);
    }
    onEnabledChange?.(next);
    dispatch({ type: "set-enabled", enabled: next });
  }, [onEnabledChange, persistPreference, state.enabled, storage]);

  const setMode = useCallback(
    (mode: StudioAdaptiveModeId) => {
      dispatch({ type: "set-mode", mode });
      onModeChange?.(mode);
    },
    [onModeChange],
  );

  const snapFloatingPanel = useCallback((input: SnapFloatingPanelInput) => {
    dispatch({
      type: "snap-floating-panel",
      currentX: input.currentX,
      currentY: input.currentY,
      panelWidthPx: input.panelWidthPx,
      panelHeightPx: input.panelHeightPx,
      preferredDockSide: input.preferredDockSide,
    });
  }, []);

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
      "data-adaptive-mode": state.activeMode,
      "data-adaptive-dock-side": state.floatingPanelSnap.dockSide,
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
      state.activeMode,
      state.enabled,
      state.floatingPanelSnap.dockSide,
      state.phase,
      state.reason,
    ],
  );

  const viewportGuard = useMemo(
    () =>
      evaluateAdaptiveChromeViewport({
        viewportWidthPx: state.viewportWidthPx,
        viewportHeightPx: state.viewportHeightPx,
        floatingOverlayWidthPx,
        phase: state.phase,
      }),
    [floatingOverlayWidthPx, state.phase, state.viewportHeightPx, state.viewportWidthPx],
  );

  const activeModeProfile = useMemo(
    () => getStudioAdaptiveModeProfile(state.activeMode),
    [state.activeMode],
  );

  const modeViewportOccupancy = useMemo(
    () => evaluateAdaptiveModeOccupancyForState(state),
    [state],
  );

  return {
    state,
    enabled: state.enabled,
    isReceded: state.phase === "receded",
    reducedMotion: state.reducedMotion,
    toggleLabel: ADAPTIVE_FLOATING_CHROME_TOGGLE_LABEL,
    activeMode: state.activeMode,
    activeModeProfile,
    modes: STUDIO_ADAPTIVE_MODE_PROFILES,
    lastModeSwitchCls: state.lastModeSwitchCls,
    floatingPanelSnap: state.floatingPanelSnap,
    modeViewportOccupancy,
    setEnabled,
    toggleEnabled,
    setMode,
    snapFloatingPanel,
    notifyStrokeStart,
    notifyStrokeEnd,
    getSurfacePresentation,
    getSurfaceStyle,
    chromeContainerProps,
    viewportGuard,
  };
}
