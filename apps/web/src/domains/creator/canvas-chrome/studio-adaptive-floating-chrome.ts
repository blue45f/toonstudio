/**
 * 어댑티브 플로팅 패널 크롬 순수 상태머신 (`>= 82%` 캔버스 뷰포트 보장 · CLS 0).
 *
 * 설계 원칙:
 * - 사용자가 캔버스에서 브러시 획을 시작(`stroke-start`)하면 비필수 플로팅 패널·보조 크롬만
 *   레이아웃 이동 없이(opacity / optional GPU translate만 사용, width·height·display 미변경 → CLS 0)
 *   부드럽게 반투명·후퇴시킨다.
 * - 획 종료(`stroke-end`), 크롬 위 호버(`chrome-hover-enter`), 키보드 포커스(`chrome-focus-in`),
 *   필수 안전 경고(`essential-alert`) 또는 창 이탈(`window-blur`) 시 지연 없이 즉시 복원한다.
 * - `prefers-reduced-motion: reduce` 활성 시 모든 이동·트랜지션을 비활성화하고 즉시 전환한다.
 * - 최소 터치 타깃 44×44px, 자연스러운 한글 토글 레이블(`그리는 중 패널 자동 숨김`)을 고정한다.
 */

import {
  STUDIO_UI_V2_CHROME_CONSTANTS,
  evaluateCanvasViewportRatio,
  type CanvasViewportRatioCheck,
} from "../chrome/studio-ui-v2-chrome-contract";
import {
  DEFAULT_STUDIO_ADAPTIVE_MODE,
  getStudioAdaptiveModeProfile,
  measureAdaptiveModeCanvasOccupancy,
  measureAdaptiveModeSwitchCls,
  resolveFloatingPanelEdgeSnap,
  type AdaptiveModeCanvasOccupancy,
  type AdaptiveModeSwitchClsReport,
  type FloatingPanelDockSide,
  type FloatingPanelEdgeSnapResult,
  type StudioAdaptiveModeId,
} from "./studio-adaptive-mode-profiles";

export {
  ADAPTIVE_MODE_PRIMARY_TOOL_BUDGET,
  ADAPTIVE_MODE_SHELL_FIXED_SLOTS,
  CENTER_CANVAS_PROTECTED_RATIO,
  DEFAULT_STUDIO_ADAPTIVE_MODE,
  LAPTOP_REFERENCE_WIDTH_PX,
  STUDIO_ADAPTIVE_MODE_PROFILES,
  ULTRAWIDE_REFERENCE_WIDTH_PX,
  ULTRAWIDE_VIEWPORT_MIN_WIDTH_PX,
  getStudioAdaptiveModeProfile,
  isWithinAdaptiveToolBudget,
  measureAdaptiveModeCanvasOccupancy,
  measureAdaptiveModeSwitchCls,
  resolveAdaptiveViewportTier,
  resolveFloatingPanelEdgeSnap,
  type AdaptiveCanvasRect,
  type AdaptiveModeCanvasOccupancy,
  type AdaptiveModeCanvasOccupancyInput,
  type AdaptiveModeSwitchClsReport,
  type AdaptiveModeToolItem,
  type AdaptiveViewportTier,
  type FloatingPanelDockSide,
  type FloatingPanelEdgeSnapInput,
  type FloatingPanelEdgeSnapResult,
  type ResizeTransitionKind,
  type StudioAdaptiveModeId,
  type StudioAdaptiveModeProfile,
} from "./studio-adaptive-mode-profiles";

export const ADAPTIVE_FLOATING_CHROME_TOGGLE_LABEL = "그리는 중 패널 자동 숨김" as const;
export const ADAPTIVE_FLOATING_CHROME_STORAGE_KEY =
  "toonstudio:studio:adaptive-floating-chrome:v1" as const;
export const ADAPTIVE_FLOATING_CHROME_MIN_TOUCH_TARGET_PX =
  STUDIO_UI_V2_CHROME_CONSTANTS.minTouchTargetPx;
export const ADAPTIVE_FLOATING_CHROME_DEFAULT_RECEDED_OPACITY = 0.14 as const;
export const ADAPTIVE_FLOATING_CHROME_TRANSITION_MS = 180 as const;

export type AdaptiveFloatingChromePhase = "visible" | "receded";

export type AdaptiveFloatingChromeReason =
  | "idle"
  | "active-stroke"
  | "chrome-hover"
  | "chrome-focus"
  | "disabled"
  | "essential-alert"
  | "window-blur";

export type AdaptiveChromeSurfaceRole = "essential" | "floating" | "auxiliary";

export interface AdaptiveFloatingChromeState {
  readonly enabled: boolean;
  readonly reducedMotion: boolean;
  readonly strokeActive: boolean;
  readonly activePointerId: number | null;
  readonly chromeHovered: boolean;
  readonly chromeFocused: boolean;
  readonly essentialAlertActive: boolean;
  readonly recededOpacity: number;
  readonly activeMode: StudioAdaptiveModeId;
  readonly lastModeSwitchCls: AdaptiveModeSwitchClsReport;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly floatingPanelSnap: FloatingPanelEdgeSnapResult;
  readonly phase: AdaptiveFloatingChromePhase;
  readonly reason: AdaptiveFloatingChromeReason;
}

export type AdaptiveFloatingChromeAction =
  | { readonly type: "stroke-start"; readonly pointerId?: number | null }
  | { readonly type: "stroke-end"; readonly pointerId?: number | null }
  | { readonly type: "chrome-hover-enter" }
  | { readonly type: "chrome-hover-leave" }
  | { readonly type: "chrome-focus-in" }
  | { readonly type: "chrome-focus-out" }
  | { readonly type: "set-enabled"; readonly enabled: boolean }
  | { readonly type: "toggle-enabled" }
  | { readonly type: "set-reduced-motion"; readonly reducedMotion: boolean }
  | { readonly type: "set-essential-alert"; readonly active: boolean }
  | { readonly type: "set-mode"; readonly mode: StudioAdaptiveModeId }
  | {
      readonly type: "resize-viewport";
      readonly viewportWidthPx: number;
      readonly viewportHeightPx: number;
      readonly panelWidthPx?: number;
      readonly panelHeightPx?: number;
    }
  | {
      readonly type: "snap-floating-panel";
      readonly currentX: number;
      readonly currentY?: number;
      readonly panelWidthPx?: number;
      readonly panelHeightPx?: number;
      readonly preferredDockSide?: FloatingPanelDockSide;
    }
  | { readonly type: "window-blur" };

export interface AdaptiveFloatingChromeInitOptions {
  readonly enabled?: boolean;
  readonly reducedMotion?: boolean;
  readonly recededOpacity?: number;
  readonly initialMode?: StudioAdaptiveModeId;
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly floatingPanelWidthPx?: number;
  readonly floatingPanelHeightPx?: number;
  readonly floatingPanelX?: number;
  readonly floatingPanelY?: number;
  readonly preferredDockSide?: FloatingPanelDockSide;
}

export interface AdaptiveChromeSurfacePresentation {
  readonly opacity: number;
  readonly transform: string;
  readonly pointerEvents: "auto" | "none";
  readonly transition: string;
  /** CLS 0 불변식: 레이아웃 속성(width/height/display/margin/padding)을 절대 변경하지 않는다. */
  readonly layoutShiftRisk: "zero";
  readonly ariaHidden: boolean;
}

export interface AdaptiveChromeViewportCheckInput {
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly topBarHeightPx?: number;
  readonly leftRailWidthPx?: number;
  readonly rightPanelWidthPx?: number;
  readonly bottomDockHeightPx?: number;
  readonly floatingOverlayWidthPx?: number;
  readonly phase: AdaptiveFloatingChromePhase;
}

export interface AdaptiveChromeViewportCheckResult extends CanvasViewportRatioCheck {
  readonly effectiveRightOcclusionPx: number;
}

function clampRecededOpacity(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return ADAPTIVE_FLOATING_CHROME_DEFAULT_RECEDED_OPACITY;
  }
  return Number(Math.min(0.45, Math.max(0.05, value)).toFixed(3));
}

function derivePhaseAndReason(
  draft: Omit<AdaptiveFloatingChromeState, "phase" | "reason">,
  blurTriggered = false,
): {
  readonly phase: AdaptiveFloatingChromePhase;
  readonly reason: AdaptiveFloatingChromeReason;
} {
  if (!draft.enabled) {
    return { phase: "visible", reason: "disabled" };
  }
  if (draft.essentialAlertActive) {
    return { phase: "visible", reason: "essential-alert" };
  }
  if (blurTriggered) {
    return { phase: "visible", reason: "window-blur" };
  }
  if (draft.chromeFocused) {
    return { phase: "visible", reason: "chrome-focus" };
  }
  if (draft.chromeHovered) {
    return { phase: "visible", reason: "chrome-hover" };
  }
  if (draft.strokeActive) {
    return { phase: "receded", reason: "active-stroke" };
  }
  return { phase: "visible", reason: "idle" };
}

function finalizeState(
  draft: Omit<AdaptiveFloatingChromeState, "phase" | "reason">,
  blurTriggered = false,
): AdaptiveFloatingChromeState {
  const { phase, reason } = derivePhaseAndReason(draft, blurTriggered);
  return Object.freeze({
    ...draft,
    phase,
    reason,
  });
}

export function createAdaptiveFloatingChromeState(
  options: AdaptiveFloatingChromeInitOptions = {},
): AdaptiveFloatingChromeState {
  const activeMode = options.initialMode ?? DEFAULT_STUDIO_ADAPTIVE_MODE;
  const profile = getStudioAdaptiveModeProfile(activeMode);
  const viewportWidthPx =
    options.viewportWidthPx !== undefined && Number.isFinite(options.viewportWidthPx)
      ? Math.max(320, options.viewportWidthPx)
      : 1440;
  const viewportHeightPx =
    options.viewportHeightPx !== undefined && Number.isFinite(options.viewportHeightPx)
      ? Math.max(320, options.viewportHeightPx)
      : 900;
  const panelWidthPx = options.floatingPanelWidthPx ?? profile.recommendedDockWidthPx;
  const preferredDockSide = options.preferredDockSide ?? profile.defaultDockSide;
  const defaultPanelX =
    preferredDockSide === "left"
      ? STUDIO_UI_V2_CHROME_CONSTANTS.desktopLeftToolRailWidthPx + 12
      : Math.max(0, viewportWidthPx - panelWidthPx - 12);

  const floatingPanelSnap = resolveFloatingPanelEdgeSnap({
    panelWidthPx,
    panelHeightPx: options.floatingPanelHeightPx,
    currentX: options.floatingPanelX ?? defaultPanelX,
    currentY: options.floatingPanelY,
    preferredDockSide,
    viewportWidthPx,
    viewportHeightPx,
    mode: activeMode,
  });

  return finalizeState({
    enabled: options.enabled ?? true,
    reducedMotion: options.reducedMotion ?? false,
    strokeActive: false,
    activePointerId: null,
    chromeHovered: false,
    chromeFocused: false,
    essentialAlertActive: false,
    recededOpacity: clampRecededOpacity(options.recededOpacity),
    activeMode,
    lastModeSwitchCls: measureAdaptiveModeSwitchCls(activeMode, activeMode, {
      widthPx: viewportWidthPx,
      heightPx: viewportHeightPx,
    }),
    viewportWidthPx,
    viewportHeightPx,
    floatingPanelSnap,
  });
}

/**
 * 어댑티브 플로팅 크롬 상태 전이 순수 리듀서.
 */
export function reduceAdaptiveFloatingChromeState(
  state: AdaptiveFloatingChromeState,
  action: AdaptiveFloatingChromeAction,
): AdaptiveFloatingChromeState {
  switch (action.type) {
    case "stroke-start": {
      const pointerId = action.pointerId ?? state.activePointerId ?? null;
      return finalizeState({
        ...state,
        strokeActive: true,
        activePointerId: pointerId,
      });
    }
    case "stroke-end": {
      if (
        action.pointerId !== undefined &&
        action.pointerId !== null &&
        state.activePointerId !== null &&
        action.pointerId !== state.activePointerId
      ) {
        return state;
      }
      return finalizeState({
        ...state,
        strokeActive: false,
        activePointerId: null,
      });
    }
    case "chrome-hover-enter":
      return finalizeState({ ...state, chromeHovered: true });
    case "chrome-hover-leave":
      return finalizeState({ ...state, chromeHovered: false });
    case "chrome-focus-in":
      return finalizeState({ ...state, chromeFocused: true });
    case "chrome-focus-out":
      return finalizeState({ ...state, chromeFocused: false });
    case "set-enabled":
      return finalizeState({
        ...state,
        enabled: action.enabled,
        strokeActive: action.enabled ? state.strokeActive : false,
        activePointerId: action.enabled ? state.activePointerId : null,
      });
    case "toggle-enabled": {
      const nextEnabled = !state.enabled;
      return finalizeState({
        ...state,
        enabled: nextEnabled,
        strokeActive: nextEnabled ? state.strokeActive : false,
        activePointerId: nextEnabled ? state.activePointerId : null,
      });
    }
    case "set-reduced-motion":
      return finalizeState({ ...state, reducedMotion: action.reducedMotion });
    case "set-essential-alert":
      return finalizeState({ ...state, essentialAlertActive: action.active });
    case "set-mode": {
      const nextProfile = getStudioAdaptiveModeProfile(action.mode);
      const lastModeSwitchCls = measureAdaptiveModeSwitchCls(state.activeMode, nextProfile.id, {
        widthPx: state.viewportWidthPx,
        heightPx: state.viewportHeightPx,
      });
      const floatingPanelSnap = resolveFloatingPanelEdgeSnap({
        panelWidthPx: state.floatingPanelSnap.requestedPanelWidthPx,
        currentX: state.floatingPanelSnap.snappedX,
        currentY: state.floatingPanelSnap.snappedY,
        preferredDockSide: state.floatingPanelSnap.dockSide,
        viewportWidthPx: state.viewportWidthPx,
        viewportHeightPx: state.viewportHeightPx,
        mode: nextProfile.id,
      });
      return finalizeState({
        ...state,
        activeMode: nextProfile.id,
        lastModeSwitchCls,
        floatingPanelSnap,
      });
    }
    case "resize-viewport": {
      const nextWidth = Math.max(320, action.viewportWidthPx);
      const nextHeight = Math.max(320, action.viewportHeightPx);
      const floatingPanelSnap = resolveFloatingPanelEdgeSnap({
        panelWidthPx: action.panelWidthPx ?? state.floatingPanelSnap.requestedPanelWidthPx,
        panelHeightPx: action.panelHeightPx,
        currentX: state.floatingPanelSnap.snappedX,
        currentY: state.floatingPanelSnap.snappedY,
        preferredDockSide: state.floatingPanelSnap.dockSide,
        viewportWidthPx: nextWidth,
        viewportHeightPx: nextHeight,
        previousViewportWidthPx: state.viewportWidthPx,
        mode: state.activeMode,
      });
      return finalizeState({
        ...state,
        viewportWidthPx: nextWidth,
        viewportHeightPx: nextHeight,
        floatingPanelSnap,
      });
    }
    case "snap-floating-panel": {
      const floatingPanelSnap = resolveFloatingPanelEdgeSnap({
        panelWidthPx: action.panelWidthPx ?? state.floatingPanelSnap.requestedPanelWidthPx,
        panelHeightPx: action.panelHeightPx,
        currentX: action.currentX,
        currentY: action.currentY ?? state.floatingPanelSnap.snappedY,
        preferredDockSide: action.preferredDockSide,
        viewportWidthPx: state.viewportWidthPx,
        viewportHeightPx: state.viewportHeightPx,
        mode: state.activeMode,
      });
      return finalizeState({
        ...state,
        floatingPanelSnap,
      });
    }
    case "window-blur":
      return finalizeState(
        {
          ...state,
          strokeActive: false,
          activePointerId: null,
          chromeHovered: false,
        },
        true,
      );
  }
}

export function evaluateAdaptiveModeOccupancyForState(
  state: AdaptiveFloatingChromeState,
): AdaptiveModeCanvasOccupancy {
  return measureAdaptiveModeCanvasOccupancy({
    mode: state.activeMode,
    viewportWidthPx: state.viewportWidthPx,
    viewportHeightPx: state.viewportHeightPx,
    chromePhase: state.phase,
    dockedPanelWidthPx: state.floatingPanelSnap.effectivePanelWidthPx,
  });
}

/**
 * CLS 0(레이아웃 속성 미변경)을 보장하는 표면별 시각 프레젠테이션 계산.
 * - `essential` 표면은 어떤 상황에서도 숨기거나 클릭을 막지 않는다.
 * - `floating` / `auxiliary` 표면은 활성 획 중에만 opacity(및 reducedMotion 해제 시 미세 GPU translate)로 후퇴한다.
 */
export function resolveAdaptiveChromeSurfacePresentation(
  state: AdaptiveFloatingChromeState,
  role: AdaptiveChromeSurfaceRole = "floating",
): AdaptiveChromeSurfacePresentation {
  const transition = state.reducedMotion
    ? "none"
    : `opacity ${ADAPTIVE_FLOATING_CHROME_TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1), transform ${ADAPTIVE_FLOATING_CHROME_TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;

  if (role === "essential" || state.phase === "visible") {
    return Object.freeze({
      opacity: 1,
      transform: "none",
      pointerEvents: "auto",
      transition,
      layoutShiftRisk: "zero",
      ariaHidden: false,
    });
  }

  const opacity = role === "auxiliary" ? Math.max(0.08, state.recededOpacity - 0.04) : state.recededOpacity;
  const transform = state.reducedMotion ? "none" : "translate3d(0, 4px, 0) scale(0.985)";

  return Object.freeze({
    opacity: Number(opacity.toFixed(3)),
    transform,
    pointerEvents: "none",
    transition,
    layoutShiftRisk: "zero",
    ariaHidden: true,
  });
}

/**
 * 현재 뷰포트 크기와 플로팅 크롬 상태(`visible` vs `receded`)를 반영해
 * UI/UX v2 캔버스 시야 계약(데스크톱 >= 82%, 모바일 >= 88%) 충족 여부를 평가한다.
 */
export function evaluateAdaptiveChromeViewport(
  input: AdaptiveChromeViewportCheckInput,
): AdaptiveChromeViewportCheckResult {
  const isMobile = input.viewportWidthPx < 768;
  const topBarHeightPx =
    input.topBarHeightPx ?? (isMobile ? 0 : STUDIO_UI_V2_CHROME_CONSTANTS.desktopTopBarHeightPx);
  const leftRailWidthPx =
    input.leftRailWidthPx ?? (isMobile ? 0 : STUDIO_UI_V2_CHROME_CONSTANTS.desktopLeftToolRailWidthPx);
  const dockedRightWidthPx = Math.max(0, input.rightPanelWidthPx ?? 0);
  const floatingWidthPx = Math.max(0, input.floatingOverlayWidthPx ?? 0);
  const effectiveRightOcclusionPx =
    input.phase === "receded" ? dockedRightWidthPx : dockedRightWidthPx + floatingWidthPx;
  const bottomDockHeightPx =
    input.bottomDockHeightPx ?? (isMobile ? 64 : 0);

  const check = evaluateCanvasViewportRatio({
    viewportWidthPx: input.viewportWidthPx,
    viewportHeightPx: input.viewportHeightPx,
    topBarHeightPx,
    leftRailWidthPx,
    rightPanelWidthPx: effectiveRightOcclusionPx,
    bottomDockHeightPx,
  });

  return Object.freeze({
    ...check,
    effectiveRightOcclusionPx,
  });
}

export function readAdaptiveFloatingChromeEnabled(
  storage: Pick<Storage, "getItem"> | null | undefined,
  fallback = true,
): boolean {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(ADAPTIVE_FLOATING_CHROME_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeAdaptiveFloatingChromeEnabled(
  storage: Pick<Storage, "setItem"> | null | undefined,
  enabled: boolean,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(ADAPTIVE_FLOATING_CHROME_STORAGE_KEY, enabled ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}
