/**
 * 모바일 전용 3-모드 초집중 셸 (`#051–#055`).
 *
 * - `스케치 · 대사 식자 · 컷 검수` 3개 초집중 모드를 44px 단일 상단바로 전환한다.
 * - `390×844` 기준 `>= 82%` 캔버스 점유(기본 `88.2%`)를 유지한다.
 * - 하단 엄지 반경 독에 모드별 핵심 5버튼(`min-h-11 min-w-11`, 한국어 평문 라벨, `[word-break:keep-all]`)을 배치한다.
 * - 저전력 배터리 절약 `30fps` 캡 토글 및 iOS Safari `visualViewport.height` + `offsetTop`
 *   가상 키보드 하단 툴바 오프셋 보정(`translate3d`, CLS 0)을 실시간 적용한다.
 */

import { BatteryCharging, Check, Smartphone } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  type KeyboardEvent,
} from "react";

import {
  MOBILE_THREE_MODE_CHROME_SLOTS,
  MOBILE_THREE_MODE_PROFILES,
  MOBILE_THREE_MODE_REFERENCE_VIEWPORT,
  computeIosSafariKeyboardToolbarOffset,
  createMobileThreeModeShellState,
  getMobileFocusModeProfile,
  reduceMobileThreeModeShellState,
  resolveMobileBatterySaverContract,
  type MobileBatterySaverContract,
  type MobileFocusModeId,
  type MobileThumbDockActionId,
  type VisualViewportWindowLike,
} from "./mobile-three-mode-shell";
import type { StarterPanelItem } from "./zero-barrier-catalog";

export interface StudioMobileThreeModeShellProps {
  readonly panels?: readonly StarterPanelItem[];
  readonly initialMode?: MobileFocusModeId;
  readonly initialBatterySaver?: boolean;
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly onModeChange?: (mode: MobileFocusModeId) => void;
  readonly onBatterySaverChange?: (contract: MobileBatterySaverContract) => void;
  readonly onDockAction?: (
    actionId: MobileThumbDockActionId,
    mode: MobileFocusModeId,
    payload?: { readonly dialogueText?: string; readonly reviewNote?: string },
  ) => void;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function detectReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

export function StudioMobileThreeModeShell({
  panels = [],
  initialMode = "sketch",
  initialBatterySaver = false,
  viewportWidthPx = MOBILE_THREE_MODE_REFERENCE_VIEWPORT.widthPx,
  viewportHeightPx = MOBILE_THREE_MODE_REFERENCE_VIEWPORT.heightPx,
  onModeChange,
  onBatterySaverChange,
  onDockAction,
}: StudioMobileThreeModeShellProps) {
  const titleId = useId();
  const dialogueInputId = useId();
  const reviewNoteInputId = useId();

  const modeTabRefs = useRef<Partial<Record<MobileFocusModeId, HTMLButtonElement | null>>>({});
  const dockBtnRefs = useRef<Partial<Record<MobileThumbDockActionId, HTMLButtonElement | null>>>({});
  const dialogueInputRef = useRef<HTMLInputElement | null>(null);
  const reviewNoteInputRef = useRef<HTMLInputElement | null>(null);

  const [state, dispatch] = useReducer(
    reduceMobileThreeModeShellState,
    undefined,
    () =>
      createMobileThreeModeShellState({
        initialMode,
        batterySaverEnabled: initialBatterySaver,
        reducedMotion: detectReducedMotion(),
        viewportWidthPx,
        viewportHeightPx,
        totalCuts: Math.max(1, panels.length || 4),
        initialDialogue: panels[0]?.dialogueKo ?? "",
      }),
  );

  // 패널 수 변동 동기화
  useEffect(() => {
    dispatch({ type: "set-total-cuts", totalCuts: Math.max(1, panels.length || 4) });
  }, [panels.length]);

  // `prefers-reduced-motion: reduce` 실시간 구독
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    dispatch({ type: "set-reduced-motion", reducedMotion: media.matches });
    const onChange = (event: MediaQueryListEvent): void => {
      dispatch({ type: "set-reduced-motion", reducedMotion: event.matches });
    };
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  // iOS Safari 가상 키보드 `visualViewport.height` + `offsetTop` 하단 툴바 보정 실시간 구독 (#055)
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const win = window as unknown as VisualViewportWindowLike;
    const vv = win.visualViewport;
    if (!vv) return undefined;

    const syncFromVisualViewport = (): void => {
      const currentVv = (window as unknown as VisualViewportWindowLike).visualViewport;
      if (!currentVv) return;
      const layoutHeight =
        window.innerHeight > 0 && window.innerHeight <= 1024 ? window.innerHeight : viewportHeightPx;
      const layoutWidth =
        window.innerWidth > 0 && window.innerWidth <= 500 ? window.innerWidth : viewportWidthPx;
      dispatch({
        type: "update-viewport",
        viewportWidthPx: layoutWidth,
        viewportHeightPx: layoutHeight,
        visualViewportHeightPx: currentVv.height,
        visualViewportOffsetTopPx: currentVv.offsetTop,
      });
    };

    vv.addEventListener?.("resize", syncFromVisualViewport);
    vv.addEventListener?.("scroll", syncFromVisualViewport);
    window.addEventListener("resize", syncFromVisualViewport);
    syncFromVisualViewport();

    return () => {
      vv.removeEventListener?.("resize", syncFromVisualViewport);
      vv.removeEventListener?.("scroll", syncFromVisualViewport);
      window.removeEventListener("resize", syncFromVisualViewport);
    };
  }, [viewportHeightPx, viewportWidthPx]);

  // 인라인 입력창 열림 시 자동 포커스
  useEffect(() => {
    if (state.dialogueComposerOpen) {
      dialogueInputRef.current?.focus();
    } else if (state.reviewNoteOpen) {
      reviewNoteInputRef.current?.focus();
    }
  }, [state.dialogueComposerOpen, state.reviewNoteOpen]);

  const activeProfile = getMobileFocusModeProfile(state.activeMode);
  const activePanel = panels[state.activeCutIndex] ?? null;
  const activeCutApproved = state.approvedCuts.includes(state.activeCutIndex);

  const handleSelectMode = useCallback(
    (mode: MobileFocusModeId) => {
      dispatch({ type: "set-mode", mode });
      onModeChange?.(mode);
    },
    [onModeChange],
  );

  const handleToggleBatterySaver = useCallback(() => {
    const nextEnabled = !state.batterySaver.enabled;
    dispatch({ type: "set-battery-saver", enabled: nextEnabled });
    onBatterySaverChange?.(resolveMobileBatterySaverContract(nextEnabled));
  }, [onBatterySaverChange, state.batterySaver.enabled]);

  const handleModeTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const count = MOBILE_THREE_MODE_PROFILES.length;
      let targetIndex: number | null = null;
      if (event.key === "ArrowRight") targetIndex = (index + 1) % count;
      else if (event.key === "ArrowLeft") targetIndex = (index - 1 + count) % count;
      else if (event.key === "Home") targetIndex = 0;
      else if (event.key === "End") targetIndex = count - 1;
      if (targetIndex === null) return;
      event.preventDefault();
      const target = MOBILE_THREE_MODE_PROFILES[targetIndex];
      if (!target) return;
      handleSelectMode(target.id);
      modeTabRefs.current[target.id]?.focus();
    },
    [handleSelectMode],
  );

  const handleDockButtonClick = useCallback(
    (actionId: MobileThumbDockActionId) => {
      dispatch({ type: "trigger-dock-action", actionId });
      onDockAction?.(actionId, state.activeMode);
    },
    [onDockAction, state.activeMode],
  );

  const handleInlineEscape = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, returnActionId: MobileThumbDockActionId) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: "close-inline-composer" });
      dockBtnRefs.current[returnActionId]?.focus();
    },
    [],
  );

  // 현재 상태에 맞는 키보드 보정 안전 값 재확인
  const keyboardOffset = computeIosSafariKeyboardToolbarOffset({
    layoutViewportHeightPx: state.keyboardOffset.layoutViewportHeightPx,
    visualViewportHeightPx: state.keyboardOffset.visualViewportHeightPx,
    visualViewportOffsetTopPx: state.keyboardOffset.visualViewportOffsetTopPx,
  });

  return (
    <section
      aria-labelledby={titleId}
      data-testid="studio-mobile-three-mode-shell"
      data-mobile-mode={state.activeMode}
      data-fps-cap={state.batterySaver.targetFps}
      data-battery-saver={state.batterySaver.enabled ? "true" : "false"}
      data-canvas-ratio={state.viewportCheck.ratio}
      data-keyboard-open={keyboardOffset.keyboardOpen ? "true" : "false"}
      data-keyboard-offset-px={keyboardOffset.toolbarBottomOffsetPx}
      className="mx-auto w-full max-w-[390px] overflow-hidden rounded-2xl border border-line bg-card text-fg"
    >
      {/* 상단 44px 초집중 3-모드 전환 바 + 30fps 절전 토글 */}
      <header
        style={{ minHeight: `${MOBILE_THREE_MODE_CHROME_SLOTS.topModeBarHeightPx}px` }}
        className="flex items-center justify-between gap-1 border-b border-line bg-panel px-1.5"
      >
        <h3 id={titleId} className="sr-only">
          모바일 3-모드 초집중 셸
        </h3>
        <div
          role="tablist"
          aria-label="모바일 초집중 모드"
          className="grid flex-1 grid-cols-3 gap-1"
        >
          {MOBILE_THREE_MODE_PROFILES.map((profile, index) => {
            const selected = profile.id === state.activeMode;
            return (
              <button
                key={profile.id}
                ref={(node) => {
                  modeTabRefs.current[profile.id] = node;
                }}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                data-testid={`mobile-mode-tab-${profile.id}`}
                onClick={() => handleSelectMode(profile.id)}
                onKeyDown={(event) => handleModeTabKeyDown(event, index)}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-1.5 text-xs font-bold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [word-break:keep-all] ${
                  selected
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-transparent bg-transparent text-fg-2 hover:bg-raised hover:text-fg"
                }`}
              >
                {profile.labelKo}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-pressed={state.batterySaver.enabled}
          aria-label={
            state.batterySaver.enabled ? "배터리 절전 30fps 끄기" : "배터리 절전 30fps 켜기"
          }
          data-testid="mobile-battery-saver-toggle"
          onClick={handleToggleBatterySaver}
          className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg border px-2 text-[11px] font-bold tabular-nums transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [word-break:keep-all] ${
            state.batterySaver.enabled
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
          }`}
        >
          <BatteryCharging size={14} aria-hidden="true" />
          <span>{state.batterySaver.targetFps}fps</span>
        </button>
      </header>

      {/* >= 82% 점유 캔버스 스테이지 (390×844 기준 744px / 88.2%) */}
      <div
        data-testid="mobile-three-mode-canvas"
        data-studio-canvas-viewport="true"
        data-canvas-height-px={state.viewportCheck.canvasHeightPx}
        className="relative flex min-h-[280px] flex-col justify-between bg-canvas p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
          <span
            data-testid="mobile-canvas-occupancy-badge"
            className="inline-flex items-center gap-1 rounded-md border border-line bg-card px-2 py-1 font-semibold tabular-nums text-fg [word-break:keep-all]"
          >
            <Smartphone size={13} aria-hidden="true" />
            <span>
              390×844 캔버스 {state.viewportCheck.percent}%
            </span>
          </span>
          <span
            data-testid="mobile-fps-status-badge"
            className="inline-flex items-center rounded-md border border-line bg-card px-2 py-1 font-semibold tabular-nums text-fg-2 [word-break:keep-all]"
          >
            {state.batterySaver.labelKo}
          </span>
        </div>

        <div className="my-3 rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-xs font-bold tabular-nums text-fg [word-break:keep-all]">
              {state.activeCutIndex + 1} / {state.totalCuts}컷 · {activeProfile.labelKo}
            </strong>
            {activeCutApproved ? (
              <span
                data-testid="mobile-cut-approved-badge"
                className="inline-flex items-center gap-1 rounded-md border border-line bg-panel px-2 py-0.5 text-[11px] font-semibold text-fg [word-break:keep-all]"
              >
                <Check size={12} aria-hidden="true" />
                검수 통과
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-fg-2 [word-break:keep-all]">
            {activePanel ? `${activePanel.framingKo} — ${activeProfile.summaryKo}` : activeProfile.summaryKo}
          </p>
          <p
            role="status"
            aria-live="polite"
            data-testid="mobile-shell-status"
            className="mt-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-fg [word-break:keep-all]"
          >
            {state.lastActionLabelKo}
            {keyboardOffset.keyboardOpen
              ? ` · 키보드 보정 +${keyboardOffset.toolbarBottomOffsetPx}px`
              : ""}
          </p>
        </div>

        {/* 대사 식자 인라인 입력(iOS 가상 키보드 오프셋 연동) */}
        {state.dialogueComposerOpen ? (
          <form
            data-testid="mobile-dialogue-composer"
            onSubmit={(event) => {
              event.preventDefault();
              dispatch({ type: "commit-dialogue" });
              onDockAction?.("dialogue-edit", state.activeMode, {
                dialogueText: state.dialogueDraft,
              });
              dockBtnRefs.current["dialogue-edit"]?.focus();
            }}
            className="flex items-center gap-1.5 rounded-xl border border-line bg-panel p-2"
          >
            <label htmlFor={dialogueInputId} className="sr-only">
              말풍선 대사 입력
            </label>
            <input
              ref={dialogueInputRef}
              id={dialogueInputId}
              type="text"
              data-testid="mobile-dialogue-input"
              value={state.dialogueDraft}
              onChange={(event) =>
                dispatch({ type: "set-dialogue-draft", value: event.target.value })
              }
              onKeyDown={(event) => handleInlineEscape(event, "dialogue-edit")}
              placeholder="말풍선에 넣을 대사를 입력하세요"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <button
              type="submit"
              data-testid="mobile-dialogue-apply"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-accent bg-accent-soft px-3 text-xs font-bold text-accent motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [word-break:keep-all]"
            >
              적용
            </button>
          </form>
        ) : null}

        {/* 컷 검수 수정 메모 인라인 입력 */}
        {state.reviewNoteOpen ? (
          <form
            data-testid="mobile-review-note-composer"
            onSubmit={(event) => {
              event.preventDefault();
              dispatch({ type: "commit-review-note" });
              onDockAction?.("flag-issue", state.activeMode, {
                reviewNote: state.reviewNoteDraft,
              });
              dockBtnRefs.current["flag-issue"]?.focus();
            }}
            className="flex items-center gap-1.5 rounded-xl border border-line bg-panel p-2"
          >
            <label htmlFor={reviewNoteInputId} className="sr-only">
              컷 수정 메모 입력
            </label>
            <input
              ref={reviewNoteInputRef}
              id={reviewNoteInputId}
              type="text"
              data-testid="mobile-review-note-input"
              value={state.reviewNoteDraft}
              onChange={(event) =>
                dispatch({ type: "set-review-note-draft", value: event.target.value })
              }
              onKeyDown={(event) => handleInlineEscape(event, "flag-issue")}
              placeholder="수정이 필요한 부분을 짧게 적어 주세요"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <button
              type="submit"
              data-testid="mobile-review-note-apply"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-accent bg-accent-soft px-3 text-xs font-bold text-accent motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [word-break:keep-all]"
            >
              기록
            </button>
          </form>
        ) : null}
      </div>

      {/* 엄지 반경 하단 독: 정확히 5개 핵심 버튼 (44×44px · 한국어 평문 · iOS 키보드 보정) */}
      <div
        role="toolbar"
        aria-label="엄지 반경 핵심 도구"
        data-testid="mobile-thumb-dock"
        data-dock-button-count={activeProfile.dockActions.length}
        data-keyboard-open={keyboardOffset.keyboardOpen ? "true" : "false"}
        data-keyboard-offset-px={keyboardOffset.toolbarBottomOffsetPx}
        style={{
          minHeight: `${MOBILE_THREE_MODE_CHROME_SLOTS.bottomThumbDockHeightPx}px`,
          transform: keyboardOffset.dockTransform,
          transition: state.reducedMotion ? "none" : "transform 160ms ease-out",
        }}
        className="grid grid-cols-5 gap-1 border-t border-line bg-panel p-1.5 motion-reduce:transition-none"
      >
        {activeProfile.dockActions.map((action) => {
          const isActive =
            state.activeToolId === action.id ||
            (action.id === "scroll-preview" && state.scrollPreviewActive) ||
            (action.id === "approve-cut" && activeCutApproved);
          return (
            <button
              key={action.id}
              ref={(node) => {
                dockBtnRefs.current[action.id] = node;
              }}
              type="button"
              aria-label={action.ariaHintKo}
              aria-pressed={isActive}
              data-testid={`mobile-dock-btn-${action.id}`}
              onClick={() => handleDockButtonClick(action.id)}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-1 text-[11px] font-bold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [word-break:keep-all] ${
                isActive
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg hover:bg-raised"
              }`}
            >
              {action.labelKo}
            </button>
          );
        })}
      </div>
    </section>
  );
}
