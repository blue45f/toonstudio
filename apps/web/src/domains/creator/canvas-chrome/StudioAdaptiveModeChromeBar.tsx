/**
 * Calm Atelier 5-모드 적응형 에디터 크롬 바 (`콘티 · 선화 · 채색 · 식자 · 3D`).
 *
 * - 모드별 5~9개 핵심 도구만 전면 노출하고 나머지 보조 도구는 `<details>` 서랍으로 수납한다.
 * - 모드 전환 시 고정 슬롯 높이로 캔버스 레이아웃 점프 `CLS = 0`을 유지한다.
 * - `2560px` 울트라와이드 ↔ `1280px` 노트북 리사이즈 시 좌·우 도크 자동 스냅 상태를 반영한다.
 * - `Tab` 순차 탐색과 `Escape` 포커스 복귀, `min-h-11 min-w-11`, `[word-break:keep-all]`,
 *   `motion-reduce:transition-none`을 기본 보장한다.
 */

import { ChevronDown, Eye, EyeOff, PanelLeft, PanelRight } from "lucide-react";
import {
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

import type { StudioAdaptiveModeId } from "./studio-adaptive-mode-profiles";
import { useAdaptiveFloatingChrome } from "./useAdaptiveFloatingChrome";

export interface StudioAdaptiveModeChromeBarProps {
  readonly initialMode?: StudioAdaptiveModeId;
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly floatingPanelWidthPx?: number;
  readonly canvasRef?: RefObject<HTMLElement | null>;
  readonly onModeChange?: (mode: StudioAdaptiveModeId) => void;
  readonly onSelectTool?: (toolId: string, labelKo: string, mode: StudioAdaptiveModeId) => void;
  readonly onReturnCanvasFocus?: () => void;
}

export function StudioAdaptiveModeChromeBar({
  initialMode = "lineart",
  viewportWidthPx,
  viewportHeightPx,
  floatingPanelWidthPx = 260,
  canvasRef,
  onModeChange,
  onSelectTool,
  onReturnCanvasFocus,
}: StudioAdaptiveModeChromeBarProps) {
  const headingId = useId();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const summaryRef = useRef<HTMLElement | null>(null);
  const modeTabRefs = useRef<Partial<Record<StudioAdaptiveModeId, HTMLButtonElement | null>>>({});

  const chrome = useAdaptiveFloatingChrome({
    initialMode,
    persistPreference: false,
    viewportWidthPx,
    viewportHeightPx,
    floatingPanelWidthPx,
    canvasRef,
    onModeChange,
  });

  const [selectedToolId, setSelectedToolId] = useState<string>(
    () => chrome.activeModeProfile.primaryTools[0]?.id ?? "g-pen",
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeProfile = chrome.activeModeProfile;
  const effectiveSelectedToolId =
    activeProfile.primaryTools.some((tool) => tool.id === selectedToolId) ||
    activeProfile.auxiliaryTools.some((tool) => tool.id === selectedToolId)
      ? selectedToolId
      : (activeProfile.primaryTools[0]?.id ?? "");

  const handleModeSwitch = useCallback(
    (nextMode: StudioAdaptiveModeId) => {
      chrome.setMode(nextMode);
      const nextProfile = chrome.modes.find((item) => item.id === nextMode);
      if (nextProfile?.primaryTools[0]) {
        setSelectedToolId(nextProfile.primaryTools[0].id);
      }
      if (detailsRef.current) {
        detailsRef.current.open = false;
      }
      setDrawerOpen(false);
    },
    [chrome],
  );

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      const count = chrome.modes.length;
      if (count === 0) return;
      let targetIndex: number | null = null;
      if (event.key === "ArrowRight") targetIndex = (currentIndex + 1) % count;
      else if (event.key === "ArrowLeft") targetIndex = (currentIndex - 1 + count) % count;
      else if (event.key === "Home") targetIndex = 0;
      else if (event.key === "End") targetIndex = count - 1;

      if (targetIndex === null) return;
      event.preventDefault();
      const targetMode = chrome.modes[targetIndex];
      if (!targetMode) return;
      handleModeSwitch(targetMode.id);
      modeTabRefs.current[targetMode.id]?.focus();
    },
    [chrome.modes, handleModeSwitch],
  );

  const handleEscapeKey = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Escape") return;

      // 1단계: 보조 도구 <details> 서랍이 열려 있으면 닫고 summary 트리거로 포커스 복귀
      if (detailsRef.current?.open) {
        event.preventDefault();
        event.stopPropagation();
        detailsRef.current.open = false;
        setDrawerOpen(false);
        summaryRef.current?.focus();
        return;
      }

      // 2단계: 플로팅 크롬 내부에서 Escape 입력 시 캔버스 또는 활성 모드 탭으로 포커스 복귀
      event.preventDefault();
      if (onReturnCanvasFocus) {
        onReturnCanvasFocus();
        return;
      }
      if (canvasRef?.current && typeof canvasRef.current.focus === "function") {
        canvasRef.current.focus();
        return;
      }
      modeTabRefs.current[chrome.activeMode]?.focus();
    },
    [canvasRef, chrome.activeMode, onReturnCanvasFocus],
  );

  const handlePickTool = useCallback(
    (toolId: string, labelKo: string) => {
      setSelectedToolId(toolId);
      onSelectTool?.(toolId, labelKo, chrome.activeMode);
    },
    [chrome.activeMode, onSelectTool],
  );

  const dockSideLabelKo =
    chrome.floatingPanelSnap.dockSide === "left" ? "좌측 도크 스냅" : "우측 도크 스냅";

  return (
    <section
      aria-labelledby={headingId}
      data-testid="studio-adaptive-mode-chrome-bar"
      data-active-mode={chrome.activeMode}
      data-cls-score={chrome.lastModeSwitchCls.clsScore}
      data-dock-side={chrome.floatingPanelSnap.dockSide}
      data-viewport-tier={chrome.floatingPanelSnap.viewportTier}
      data-overlaps-center={chrome.floatingPanelSnap.overlapsCanvasCenterAfter ? "true" : "false"}
      className="rounded-xl border border-line bg-card p-3 text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
        <div className="min-w-0">
          <h3 id={headingId} className="text-sm font-bold text-fg [word-break:keep-all]">
            작업 모드별 집중 크롬 (5-모드)
          </h3>
          <p className="mt-0.5 text-xs text-fg-2 [word-break:keep-all]">
            {activeProfile.summaryKo}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span
            data-testid="adaptive-chrome-occupancy"
            data-occupancy-passed={chrome.modeViewportOccupancy.passed ? "true" : "false"}
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-2.5 font-semibold tabular-nums text-fg [word-break:keep-all]"
          >
            캔버스 점유 {chrome.modeViewportOccupancy.percent}%
          </span>
          <span
            data-testid="adaptive-chrome-cls"
            data-cls-zero={chrome.lastModeSwitchCls.isClsZero ? "true" : "false"}
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-2.5 font-semibold tabular-nums text-fg-2 [word-break:keep-all]"
          >
            CLS {chrome.lastModeSwitchCls.clsScore} 고정
          </span>
          <span
            data-testid="adaptive-chrome-dock-status"
            data-dock-side={chrome.floatingPanelSnap.dockSide}
            data-compact-docked={chrome.floatingPanelSnap.compactDocked ? "true" : "false"}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 font-medium tabular-nums text-fg-2 [word-break:keep-all]"
          >
            {chrome.floatingPanelSnap.dockSide === "left" ? (
              <PanelLeft size={14} aria-hidden="true" />
            ) : (
              <PanelRight size={14} aria-hidden="true" />
            )}
            <span>
              {dockSideLabelKo} ({chrome.floatingPanelSnap.effectivePanelWidthPx}px)
            </span>
          </span>
        </div>
      </div>

      {/* 5-모드 고정 슬롯 탭 바 (콘티 · 선화 · 채색 · 식자 · 3D) */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="작업 모드 선택"
          className="flex flex-wrap items-center gap-1.5"
        >
          {chrome.modes.map((modeItem, index) => {
            const selected = modeItem.id === chrome.activeMode;
            return (
              <button
                key={modeItem.id}
                ref={(node) => {
                  modeTabRefs.current[modeItem.id] = node;
                }}
                type="button"
                role="tab"
                id={`adaptive-mode-tab-${modeItem.id}`}
                aria-selected={selected}
                aria-controls="adaptive-mode-primary-panel"
                tabIndex={selected ? 0 : -1}
                data-testid={`adaptive-mode-tab-${modeItem.id}`}
                onClick={() => handleModeSwitch(modeItem.id)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    handleEscapeKey(event);
                    return;
                  }
                  handleTabKeyDown(event, index);
                }}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [word-break:keep-all] ${
                  selected
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg"
                }`}
              >
                {modeItem.labelKo}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-label={chrome.toggleLabel}
          aria-pressed={chrome.enabled}
          data-testid="adaptive-chrome-autohide-toggle"
          onClick={chrome.toggleEnabled}
          onKeyDown={handleEscapeKey}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [word-break:keep-all] ${
            chrome.enabled
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg"
          }`}
        >
          {chrome.enabled ? (
            <EyeOff size={15} aria-hidden="true" />
          ) : (
            <Eye size={15} aria-hidden="true" />
          )}
          <span>{chrome.toggleLabel}</span>
        </button>
      </div>

      {/* 플로팅 핵심 도구 영역: 5~9개 핵심 도구만 전면 노출 + CLS 0 고정 슬롯 */}
      <div
        id="adaptive-mode-primary-panel"
        role="tabpanel"
        aria-labelledby={`adaptive-mode-tab-${chrome.activeMode}`}
        data-testid="adaptive-chrome-floating-surface"
        {...chrome.chromeContainerProps}
        className="mt-2.5 rounded-lg border border-line bg-panel p-2 motion-reduce:transition-none"
      >
        <div
          data-testid="adaptive-chrome-primary-tools"
          data-tool-count={activeProfile.primaryTools.length}
          className="flex min-h-[52px] flex-wrap items-center gap-1.5"
        >
          {activeProfile.primaryTools.map((tool) => {
            const active = tool.id === effectiveSelectedToolId;
            return (
              <button
                key={tool.id}
                type="button"
                aria-pressed={active}
                data-testid={`adaptive-primary-tool-${tool.id}`}
                onClick={() => handlePickTool(tool.id, tool.labelKo)}
                onKeyDown={handleEscapeKey}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [word-break:keep-all] ${
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg hover:bg-raised"
                }`}
              >
                <span>{tool.labelKo}</span>
                {tool.shortcutHint ? (
                  <kbd className="rounded border border-line bg-panel px-1 py-0.5 font-mono text-[10px] text-fg-2">
                    {tool.shortcutHint}
                  </kbd>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* 보조 도구는 <details> 접힘 서랍으로 수납 */}
        <details
          ref={detailsRef}
          data-testid="adaptive-chrome-aux-details"
          onToggle={(event) => {
            setDrawerOpen(event.currentTarget.open);
          }}
          className="mt-2 rounded-lg border border-line bg-card"
        >
          <summary
            ref={summaryRef}
            data-testid="adaptive-chrome-aux-summary"
            onKeyDown={handleEscapeKey}
            className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 text-xs font-semibold text-fg-2 transition-colors motion-reduce:transition-none hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [word-break:keep-all]"
          >
            <span>
              {activeProfile.auxiliaryDrawerLabelKo} ({activeProfile.auxiliaryTools.length})
            </span>
            <ChevronDown
              size={15}
              aria-hidden="true"
              className={`shrink-0 transition-transform motion-reduce:transition-none ${
                drawerOpen ? "rotate-180" : ""
              }`}
            />
          </summary>

          <div
            data-testid="adaptive-chrome-aux-tools"
            className="flex flex-wrap items-center gap-1.5 border-t border-line p-2"
          >
            {activeProfile.auxiliaryTools.map((tool) => {
              const active = tool.id === effectiveSelectedToolId;
              return (
                <button
                  key={tool.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`adaptive-aux-tool-${tool.id}`}
                  onClick={() => handlePickTool(tool.id, tool.labelKo)}
                  onKeyDown={handleEscapeKey}
                  className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-xs font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [word-break:keep-all] ${
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg"
                  }`}
                >
                  {tool.labelKo}
                </button>
              );
            })}
          </div>
        </details>
      </div>
    </section>
  );
}
