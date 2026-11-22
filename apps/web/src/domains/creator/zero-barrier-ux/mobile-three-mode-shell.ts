/**
 * 모바일 전용 3-모드 초집중 셸 순수 컨트롤러 (`#051–#055`).
 *
 * 설계 계약:
 * - `스케치 · 대사 식자 · 컷 검수` 3개 초집중 모드로 전환한다.
 * - `390×844` 기준 `>= 82%` 캔버스 점유(기본 `88.2%`로 모바일 v2 88% 기준 동시 충족)를 보장한다.
 * - 하단 엄지 반경 독은 모드당 정확히 5개 핵심 버튼(`>= 44×44px`)만 노출한다.
 * - 저전력 배터리 절약 `30fps` 캡 토글 상태 계약과 프레임 게이트를 제공한다.
 * - iOS Safari 가상 키보드 `visualViewport.height` + `offsetTop` 기반 하단 툴바 오프셋 보정기(`#055`)를
 *   GPU `translate3d` 전용(CLS 0)으로 계산한다.
 * - `localStorage`/`sessionStorage`/`indexedDB` 직접 호출 없이 순수 메모리 상태와 콜백으로 동작한다.
 */

import { evaluateCanvasViewportRatio } from "../chrome/studio-ui-v2-chrome-contract";

export type MobileFocusModeId = "sketch" | "lettering" | "review";

export type MobileThumbDockActionId =
  | "pen"
  | "eraser"
  | "undo"
  | "layer"
  | "quick-save"
  | "bubble"
  | "dialogue-edit"
  | "sfx"
  | "prev-cut"
  | "next-cut"
  | "flag-issue"
  | "scroll-preview"
  | "approve-cut";

export interface MobileThumbDockActionSpec {
  readonly id: MobileThumbDockActionId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly ariaHintKo: string;
  readonly kind: "tool" | "history" | "editor" | "navigation" | "commit";
}

export interface MobileFocusModeProfile {
  readonly id: MobileFocusModeId;
  readonly order: 1 | 2 | 3;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly dockActions: readonly [
    MobileThumbDockActionSpec,
    MobileThumbDockActionSpec,
    MobileThumbDockActionSpec,
    MobileThumbDockActionSpec,
    MobileThumbDockActionSpec,
  ];
}

export interface MobileBatterySaverContract {
  readonly enabled: boolean;
  readonly targetFps: 30 | 60;
  readonly frameIntervalMs: number;
  readonly reduceEffects: boolean;
  readonly throttleLivePreview: boolean;
  readonly labelKo: string;
  readonly statusHintKo: string;
}

export interface VisualViewportKeyboardInput {
  readonly layoutViewportHeightPx: number;
  readonly visualViewportHeightPx?: number | null;
  readonly visualViewportOffsetTopPx?: number | null;
  readonly safeAreaBottomPx?: number;
}

export interface VisualViewportKeyboardOffsetResult {
  readonly keyboardOpen: boolean;
  readonly layoutViewportHeightPx: number;
  readonly visualViewportHeightPx: number;
  readonly visualViewportOffsetTopPx: number;
  readonly keyboardHeightPx: number;
  readonly toolbarBottomOffsetPx: number;
  readonly bottomSafePaddingPx: number;
  readonly dockTransform: string;
  readonly layoutShiftRisk: "zero";
}

export interface VisualViewportLike {
  readonly height: number;
  readonly offsetTop: number;
  readonly width?: number;
  readonly addEventListener?: (type: "resize" | "scroll", listener: () => void) => void;
  readonly removeEventListener?: (type: "resize" | "scroll", listener: () => void) => void;
}

export interface VisualViewportWindowLike {
  readonly innerWidth?: number;
  readonly innerHeight: number;
  readonly visualViewport?: VisualViewportLike | null;
  readonly addEventListener?: (type: "resize", listener: () => void) => void;
  readonly removeEventListener?: (type: "resize", listener: () => void) => void;
}

export interface MobileThreeModeViewportCheck {
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly topBarHeightPx: number;
  readonly bottomDockHeightPx: number;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly chromeHeightPx: number;
  readonly ratio: number;
  readonly percent: number;
  readonly minRequired: number;
  readonly strictMobileV2MinRequired: number;
  readonly passed: boolean;
  readonly strictMobileV2Passed: boolean;
}

export interface MobileThreeModeShellState {
  readonly activeMode: MobileFocusModeId;
  readonly batterySaver: MobileBatterySaverContract;
  readonly reducedMotion: boolean;
  readonly viewportCheck: MobileThreeModeViewportCheck;
  readonly keyboardOffset: VisualViewportKeyboardOffsetResult;
  readonly activeToolId: MobileThumbDockActionId;
  readonly dialogueComposerOpen: boolean;
  readonly dialogueDraft: string;
  readonly reviewNoteOpen: boolean;
  readonly reviewNoteDraft: string;
  readonly scrollPreviewActive: boolean;
  readonly activeCutIndex: number;
  readonly totalCuts: number;
  readonly approvedCuts: readonly number[];
  readonly savedCount: number;
  readonly lastActionLabelKo: string;
}

export type MobileThreeModeShellAction =
  | { readonly type: "set-mode"; readonly mode: MobileFocusModeId }
  | { readonly type: "toggle-battery-saver" }
  | { readonly type: "set-battery-saver"; readonly enabled: boolean }
  | { readonly type: "set-reduced-motion"; readonly reducedMotion: boolean }
  | {
      readonly type: "update-viewport";
      readonly viewportWidthPx: number;
      readonly viewportHeightPx: number;
      readonly visualViewportHeightPx?: number | null;
      readonly visualViewportOffsetTopPx?: number | null;
      readonly safeAreaBottomPx?: number;
    }
  | { readonly type: "set-total-cuts"; readonly totalCuts: number }
  | { readonly type: "trigger-dock-action"; readonly actionId: MobileThumbDockActionId }
  | { readonly type: "set-dialogue-draft"; readonly value: string }
  | { readonly type: "close-inline-composer" }
  | { readonly type: "commit-dialogue" }
  | { readonly type: "set-review-note-draft"; readonly value: string }
  | { readonly type: "commit-review-note" };

export interface MobileThreeModeShellInitOptions {
  readonly initialMode?: MobileFocusModeId;
  readonly batterySaverEnabled?: boolean;
  readonly reducedMotion?: boolean;
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly visualViewportHeightPx?: number | null;
  readonly visualViewportOffsetTopPx?: number | null;
  readonly totalCuts?: number;
  readonly initialDialogue?: string;
}

export const MOBILE_THREE_MODE_REFERENCE_VIEWPORT = Object.freeze({
  widthPx: 390,
  heightPx: 844,
});

export const MOBILE_THREE_MODE_CHROME_SLOTS = Object.freeze({
  topModeBarHeightPx: 44,
  bottomThumbDockHeightPx: 56,
  minTouchTargetPx: 44,
  thumbDockButtonCount: 5,
  minCanvasAreaRatio: 0.82,
  strictMobileV2MinCanvasAreaRatio: 0.88,
});

export const MOBILE_FPS_CAP_STANDARD = 60 as const;
export const MOBILE_FPS_CAP_POWER_SAVER = 30 as const;
export const MOBILE_FRAME_INTERVAL_STANDARD_MS = Number((1000 / 60).toFixed(2));
export const MOBILE_FRAME_INTERVAL_POWER_SAVER_MS = Number((1000 / 30).toFixed(2));
export const IOS_KEYBOARD_OPEN_THRESHOLD_PX = 120 as const;

export const MOBILE_THREE_MODE_PROFILES: readonly MobileFocusModeProfile[] = Object.freeze([
  Object.freeze({
    id: "sketch",
    order: 1,
    labelKo: "스케치",
    labelEn: "Sketch",
    summaryKo: "한 손 엄지 조작으로 밑그림과 펜선을 빠르게 그립니다.",
    summaryEn: "Draft clean sketches with thumb-reach controls.",
    dockActions: Object.freeze([
      { id: "pen", labelKo: "펜", labelEn: "Pen", ariaHintKo: "스케치 펜 선택", kind: "tool" },
      { id: "eraser", labelKo: "지우개", labelEn: "Eraser", ariaHintKo: "선 지우개 선택", kind: "tool" },
      { id: "undo", labelKo: "되돌리기", labelEn: "Undo", ariaHintKo: "방금 그린 선 취소", kind: "history" },
      { id: "layer", labelKo: "레이어", labelEn: "Layer", ariaHintKo: "밑그림과 선화 레이어 전환", kind: "tool" },
      { id: "quick-save", labelKo: "저장", labelEn: "Save", ariaHintKo: "현재 스케치 저장", kind: "commit" },
    ]) as MobileFocusModeProfile["dockActions"],
  }),
  Object.freeze({
    id: "lettering",
    order: 2,
    labelKo: "대사 식자",
    labelEn: "Lettering",
    summaryKo: "가상 키보드가 열려도 하단 도구가 가리지 않게 대사를 입력합니다.",
    summaryEn: "Type dialogue with keyboard-safe bottom controls.",
    dockActions: Object.freeze([
      { id: "bubble", labelKo: "말풍선", labelEn: "Bubble", ariaHintKo: "새 말풍선 추가", kind: "tool" },
      { id: "dialogue-edit", labelKo: "대사 입력", labelEn: "Dialogue", ariaHintKo: "대사 입력창 열기", kind: "editor" },
      { id: "sfx", labelKo: "효과음", labelEn: "SFX", ariaHintKo: "장면 효과음 넣기", kind: "tool" },
      { id: "undo", labelKo: "되돌리기", labelEn: "Undo", ariaHintKo: "직전 식자 취소", kind: "history" },
      { id: "quick-save", labelKo: "저장", labelEn: "Save", ariaHintKo: "대사 변경 저장", kind: "commit" },
    ]) as MobileFocusModeProfile["dockActions"],
  }),
  Object.freeze({
    id: "review",
    order: 3,
    labelKo: "컷 검수",
    labelEn: "Review",
    summaryKo: "모바일 세로 스크롤 화면 그대로 컷 흐름과 오타를 검수합니다.",
    summaryEn: "Inspect vertical scroll pacing and cut quality.",
    dockActions: Object.freeze([
      { id: "prev-cut", labelKo: "이전 컷", labelEn: "Prev cut", ariaHintKo: "이전 컷으로 이동", kind: "navigation" },
      { id: "next-cut", labelKo: "다음 컷", labelEn: "Next cut", ariaHintKo: "다음 컷으로 이동", kind: "navigation" },
      { id: "flag-issue", labelKo: "수정 메모", labelEn: "Note", ariaHintKo: "검수 메모 작성 열기", kind: "editor" },
      { id: "scroll-preview", labelKo: "세로 보기", labelEn: "Scroll", ariaHintKo: "세로 스크롤 미리보기 전환", kind: "tool" },
      { id: "approve-cut", labelKo: "검수 완료", labelEn: "Approve", ariaHintKo: "현재 컷 검수 통과 표시", kind: "commit" },
    ]) as MobileFocusModeProfile["dockActions"],
  }),
]);

export function getMobileFocusModeProfile(mode: MobileFocusModeId): MobileFocusModeProfile {
  return (
    MOBILE_THREE_MODE_PROFILES.find((profile) => profile.id === mode) ??
    MOBILE_THREE_MODE_PROFILES[0]!
  );
}

/**
 * 저전력 배터리 절약 FPS 캡(`30fps` vs `60fps`) 상태 계약.
 */
export function resolveMobileBatterySaverContract(enabled: boolean): MobileBatterySaverContract {
  if (enabled) {
    return Object.freeze({
      enabled: true,
      targetFps: MOBILE_FPS_CAP_POWER_SAVER,
      frameIntervalMs: MOBILE_FRAME_INTERVAL_POWER_SAVER_MS,
      reduceEffects: true,
      throttleLivePreview: true,
      labelKo: "절전 30fps",
      statusHintKo: "배터리 절약을 위해 초당 30프레임으로 제한합니다.",
    });
  }
  return Object.freeze({
    enabled: false,
    targetFps: MOBILE_FPS_CAP_STANDARD,
    frameIntervalMs: MOBILE_FRAME_INTERVAL_STANDARD_MS,
    reduceEffects: false,
    throttleLivePreview: false,
    labelKo: "표준 60fps",
    statusHintKo: "기본 초당 60프레임으로 화면을 갱신합니다.",
  });
}

/**
 * 배터리 절약 FPS 캡에 따라 이번 프레임 렌더 여부를 결정하는 순수 게이트.
 */
export function shouldRenderMobileFrame(
  lastRenderTimestampMs: number | null,
  nowMs: number,
  contract: MobileBatterySaverContract,
): boolean {
  if (lastRenderTimestampMs === null || !Number.isFinite(lastRenderTimestampMs)) {
    return true;
  }
  if (!Number.isFinite(nowMs)) return false;
  const elapsed = nowMs - lastRenderTimestampMs;
  if (elapsed < 0) return true;
  return elapsed >= contract.frameIntervalMs - 0.5;
}

function finiteOrFallback(value: number | null | undefined, fallback: number): number {
  if (value === undefined || value === null || !Number.isFinite(value)) return fallback;
  return value;
}

/**
 * iOS Safari 가상 키보드 `visualViewport.height` + `offsetTop` 하단 툴바 오프셋 보정기 (`#055`).
 *
 * iOS Safari에서는 가상 키보드가 열릴 때 `window.innerHeight`(레이아웃 뷰포트)는 그대로 둔 채
 * `visualViewport.height`가 줄고, 입력칸으로 스크롤되면 `visualViewport.offsetTop`이 커진다.
 * 하단 툴바가 키보드 바로 위에 정확히 밀착되도록 `layoutHeight - (visualHeight + offsetTop)`을
 * 산출해 GPU `translate3d` 오프셋(CLS 0)으로 변환한다.
 */
export function computeIosSafariKeyboardToolbarOffset(
  input: VisualViewportKeyboardInput,
): VisualViewportKeyboardOffsetResult {
  const layoutViewportHeightPx = Math.max(
    1,
    Math.round(finiteOrFallback(input.layoutViewportHeightPx, MOBILE_THREE_MODE_REFERENCE_VIEWPORT.heightPx)),
  );
  const rawVisualHeight = finiteOrFallback(input.visualViewportHeightPx, layoutViewportHeightPx);
  const visualViewportHeightPx = Math.min(
    layoutViewportHeightPx,
    Math.max(1, Math.round(rawVisualHeight)),
  );
  const visualViewportOffsetTopPx = Math.max(
    0,
    Math.round(finiteOrFallback(input.visualViewportOffsetTopPx, 0)),
  );
  const safeAreaBottomPx = Math.max(0, Math.round(finiteOrFallback(input.safeAreaBottomPx, 0)));

  const keyboardHeightPx = Math.max(0, layoutViewportHeightPx - visualViewportHeightPx);
  const keyboardOpen = keyboardHeightPx >= IOS_KEYBOARD_OPEN_THRESHOLD_PX;
  const rawBottomInset = Math.max(
    0,
    layoutViewportHeightPx - (visualViewportHeightPx + visualViewportOffsetTopPx),
  );
  const toolbarBottomOffsetPx = keyboardOpen ? rawBottomInset : 0;
  const bottomSafePaddingPx = keyboardOpen ? 0 : safeAreaBottomPx;
  const dockTransform =
    toolbarBottomOffsetPx > 0 ? `translate3d(0, -${toolbarBottomOffsetPx}px, 0)` : "none";

  return Object.freeze({
    keyboardOpen,
    layoutViewportHeightPx,
    visualViewportHeightPx,
    visualViewportOffsetTopPx,
    keyboardHeightPx,
    toolbarBottomOffsetPx,
    bottomSafePaddingPx,
    dockTransform,
    layoutShiftRisk: "zero",
  });
}

export function readVisualViewportKeyboardOffset(
  win: VisualViewportWindowLike | null | undefined,
  fallbackLayoutHeightPx = MOBILE_THREE_MODE_REFERENCE_VIEWPORT.heightPx,
): VisualViewportKeyboardOffsetResult {
  if (!win) {
    return computeIosSafariKeyboardToolbarOffset({
      layoutViewportHeightPx: fallbackLayoutHeightPx,
    });
  }
  const layoutHeight = win.innerHeight > 0 ? win.innerHeight : fallbackLayoutHeightPx;
  const vv = win.visualViewport;
  return computeIosSafariKeyboardToolbarOffset({
    layoutViewportHeightPx: layoutHeight,
    visualViewportHeightPx: vv?.height ?? layoutHeight,
    visualViewportOffsetTopPx: vv?.offsetTop ?? 0,
  });
}

/**
 * `visualViewport`의 `resize`·`scroll` 및 `window` `resize` 이벤트를 구독해
 * iOS Safari 가상 키보드 하단 툴바 오프셋을 실시간 전달한다.
 */
export function subscribeVisualViewportKeyboardOffset(
  win: VisualViewportWindowLike | null | undefined,
  onChange: (offset: VisualViewportKeyboardOffsetResult) => void,
  fallbackLayoutHeightPx = MOBILE_THREE_MODE_REFERENCE_VIEWPORT.heightPx,
): () => void {
  if (!win) return () => {};
  const emit = () => {
    onChange(readVisualViewportKeyboardOffset(win, fallbackLayoutHeightPx));
  };
  win.visualViewport?.addEventListener?.("resize", emit);
  win.visualViewport?.addEventListener?.("scroll", emit);
  win.addEventListener?.("resize", emit);
  emit();

  return () => {
    win.visualViewport?.removeEventListener?.("resize", emit);
    win.visualViewport?.removeEventListener?.("scroll", emit);
    win.removeEventListener?.("resize", emit);
  };
}

/**
 * 모바일 3-모드 셸의 캔버스 점유율(`390×844` 기준 `>= 82%` 보장)을 실측 계산한다.
 */
export function evaluateMobileThreeModeViewport(input?: {
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly topBarHeightPx?: number;
  readonly bottomDockHeightPx?: number;
}): MobileThreeModeViewportCheck {
  const viewportWidthPx = Math.max(
    1,
    Math.round(finiteOrFallback(input?.viewportWidthPx, MOBILE_THREE_MODE_REFERENCE_VIEWPORT.widthPx)),
  );
  const viewportHeightPx = Math.max(
    1,
    Math.round(finiteOrFallback(input?.viewportHeightPx, MOBILE_THREE_MODE_REFERENCE_VIEWPORT.heightPx)),
  );
  const topBarHeightPx = Math.max(
    0,
    Math.round(finiteOrFallback(input?.topBarHeightPx, MOBILE_THREE_MODE_CHROME_SLOTS.topModeBarHeightPx)),
  );
  const bottomDockHeightPx = Math.max(
    0,
    Math.round(
      finiteOrFallback(input?.bottomDockHeightPx, MOBILE_THREE_MODE_CHROME_SLOTS.bottomThumbDockHeightPx),
    ),
  );

  const v2Check = evaluateCanvasViewportRatio({
    viewportWidthPx,
    viewportHeightPx,
    topBarHeightPx,
    leftRailWidthPx: 0,
    rightPanelWidthPx: 0,
    bottomDockHeightPx,
  });

  const chromeHeightPx = topBarHeightPx + bottomDockHeightPx;
  const canvasHeightPx = Math.max(0, viewportHeightPx - chromeHeightPx);
  const minRequired = MOBILE_THREE_MODE_CHROME_SLOTS.minCanvasAreaRatio;
  const strictMobileV2MinRequired = MOBILE_THREE_MODE_CHROME_SLOTS.strictMobileV2MinCanvasAreaRatio;

  return Object.freeze({
    viewportWidthPx,
    viewportHeightPx,
    topBarHeightPx,
    bottomDockHeightPx,
    canvasWidthPx: viewportWidthPx,
    canvasHeightPx,
    chromeHeightPx,
    ratio: v2Check.ratio,
    percent: Number((v2Check.ratio * 100).toFixed(1)),
    minRequired,
    strictMobileV2MinRequired,
    passed: v2Check.ratio >= minRequired,
    strictMobileV2Passed: v2Check.ratio >= strictMobileV2MinRequired,
  });
}

export function createMobileThreeModeShellState(
  options: MobileThreeModeShellInitOptions = {},
): MobileThreeModeShellState {
  const activeMode = options.initialMode ?? "sketch";
  const profile = getMobileFocusModeProfile(activeMode);
  const viewportWidthPx = options.viewportWidthPx ?? MOBILE_THREE_MODE_REFERENCE_VIEWPORT.widthPx;
  const viewportHeightPx = options.viewportHeightPx ?? MOBILE_THREE_MODE_REFERENCE_VIEWPORT.heightPx;
  const totalCuts = Math.max(1, Math.round(options.totalCuts ?? 4));

  return Object.freeze({
    activeMode,
    batterySaver: resolveMobileBatterySaverContract(options.batterySaverEnabled ?? false),
    reducedMotion: options.reducedMotion ?? false,
    viewportCheck: evaluateMobileThreeModeViewport({ viewportWidthPx, viewportHeightPx }),
    keyboardOffset: computeIosSafariKeyboardToolbarOffset({
      layoutViewportHeightPx: viewportHeightPx,
      visualViewportHeightPx: options.visualViewportHeightPx,
      visualViewportOffsetTopPx: options.visualViewportOffsetTopPx,
    }),
    activeToolId: profile.dockActions[0].id,
    dialogueComposerOpen: false,
    dialogueDraft: options.initialDialogue ?? "",
    reviewNoteOpen: false,
    reviewNoteDraft: "",
    scrollPreviewActive: false,
    activeCutIndex: 0,
    totalCuts,
    approvedCuts: Object.freeze([]),
    savedCount: 0,
    lastActionLabelKo: `${profile.labelKo} 모드로 준비됨`,
  });
}

export function reduceMobileThreeModeShellState(
  state: MobileThreeModeShellState,
  action: MobileThreeModeShellAction,
): MobileThreeModeShellState {
  switch (action.type) {
    case "set-mode": {
      const profile = getMobileFocusModeProfile(action.mode);
      return Object.freeze({
        ...state,
        activeMode: profile.id,
        activeToolId: profile.dockActions[0].id,
        dialogueComposerOpen: false,
        reviewNoteOpen: false,
        lastActionLabelKo: `${profile.labelKo} 모드로 전환`,
      });
    }
    case "toggle-battery-saver": {
      const next = resolveMobileBatterySaverContract(!state.batterySaver.enabled);
      return Object.freeze({
        ...state,
        batterySaver: next,
        lastActionLabelKo: next.enabled ? "절전 30fps 적용" : "표준 60fps 복귀",
      });
    }
    case "set-battery-saver": {
      const next = resolveMobileBatterySaverContract(action.enabled);
      return Object.freeze({
        ...state,
        batterySaver: next,
        lastActionLabelKo: next.enabled ? "절전 30fps 적용" : "표준 60fps 복귀",
      });
    }
    case "set-reduced-motion":
      return Object.freeze({ ...state, reducedMotion: action.reducedMotion });
    case "update-viewport": {
      const viewportCheck = evaluateMobileThreeModeViewport({
        viewportWidthPx: action.viewportWidthPx,
        viewportHeightPx: action.viewportHeightPx,
      });
      const keyboardOffset = computeIosSafariKeyboardToolbarOffset({
        layoutViewportHeightPx: action.viewportHeightPx,
        visualViewportHeightPx: action.visualViewportHeightPx,
        visualViewportOffsetTopPx: action.visualViewportOffsetTopPx,
        safeAreaBottomPx: action.safeAreaBottomPx,
      });
      return Object.freeze({
        ...state,
        viewportCheck,
        keyboardOffset,
      });
    }
    case "set-total-cuts": {
      const totalCuts = Math.max(1, Math.round(action.totalCuts));
      return Object.freeze({
        ...state,
        totalCuts,
        activeCutIndex: Math.min(state.activeCutIndex, totalCuts - 1),
      });
    }
    case "trigger-dock-action": {
      const profile = getMobileFocusModeProfile(state.activeMode);
      const spec = profile.dockActions.find((item) => item.id === action.actionId);
      const label = spec?.labelKo ?? "도구 실행";

      if (action.actionId === "dialogue-edit") {
        return Object.freeze({
          ...state,
          activeToolId: action.actionId,
          dialogueComposerOpen: !state.dialogueComposerOpen,
          reviewNoteOpen: false,
          lastActionLabelKo: state.dialogueComposerOpen ? "대사 입력 닫음" : "대사 입력 열림",
        });
      }
      if (action.actionId === "flag-issue") {
        return Object.freeze({
          ...state,
          activeToolId: action.actionId,
          reviewNoteOpen: !state.reviewNoteOpen,
          dialogueComposerOpen: false,
          lastActionLabelKo: state.reviewNoteOpen ? "수정 메모 닫음" : "수정 메모 열림",
        });
      }
      if (action.actionId === "prev-cut") {
        const prevIndex = Math.max(0, state.activeCutIndex - 1);
        return Object.freeze({
          ...state,
          activeCutIndex: prevIndex,
          lastActionLabelKo: `${prevIndex + 1}컷으로 이동`,
        });
      }
      if (action.actionId === "next-cut") {
        const nextIndex = Math.min(state.totalCuts - 1, state.activeCutIndex + 1);
        return Object.freeze({
          ...state,
          activeCutIndex: nextIndex,
          lastActionLabelKo: `${nextIndex + 1}컷으로 이동`,
        });
      }
      if (action.actionId === "scroll-preview") {
        const nextPreview = !state.scrollPreviewActive;
        return Object.freeze({
          ...state,
          scrollPreviewActive: nextPreview,
          lastActionLabelKo: nextPreview ? "세로 스크롤 보기 켜짐" : "단일 컷 보기 복귀",
        });
      }
      if (action.actionId === "approve-cut") {
        const exists = state.approvedCuts.includes(state.activeCutIndex);
        const approvedCuts = exists
          ? state.approvedCuts.filter((idx) => idx !== state.activeCutIndex)
          : [...state.approvedCuts, state.activeCutIndex];
        return Object.freeze({
          ...state,
          approvedCuts: Object.freeze(approvedCuts),
          lastActionLabelKo: exists
            ? `${state.activeCutIndex + 1}컷 검수 해제`
            : `${state.activeCutIndex + 1}컷 검수 통과`,
        });
      }
      if (action.actionId === "quick-save") {
        return Object.freeze({
          ...state,
          savedCount: state.savedCount + 1,
          lastActionLabelKo: `저장 완료 (${state.savedCount + 1}회)`,
        });
      }
      return Object.freeze({
        ...state,
        activeToolId: action.actionId,
        lastActionLabelKo: `${label} 선택`,
      });
    }
    case "set-dialogue-draft":
      return Object.freeze({ ...state, dialogueDraft: action.value });
    case "commit-dialogue":
      return Object.freeze({
        ...state,
        dialogueComposerOpen: false,
        lastActionLabelKo: state.dialogueDraft.trim()
          ? `대사 반영: "${state.dialogueDraft.trim()}"`
          : "대사 입력 닫음",
      });
    case "set-review-note-draft":
      return Object.freeze({ ...state, reviewNoteDraft: action.value });
    case "commit-review-note":
      return Object.freeze({
        ...state,
        reviewNoteOpen: false,
        lastActionLabelKo: state.reviewNoteDraft.trim()
          ? `${state.activeCutIndex + 1}컷 수정 메모 저장`
          : "수정 메모 닫음",
      });
    case "close-inline-composer":
      return Object.freeze({
        ...state,
        dialogueComposerOpen: false,
        reviewNoteOpen: false,
      });
  }
}
