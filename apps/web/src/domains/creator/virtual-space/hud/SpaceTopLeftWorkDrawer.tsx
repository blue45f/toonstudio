import { ChevronDown, ChevronUp, PenTool, Presentation, SlidersHorizontal, StickyNote, X } from "lucide-react";
import { memo, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioAtelierPulseSnapshot } from "../studio-virtual-space-atelier-pulse";
import type { StudioVirtualWorkspacePanel } from "../studio-virtual-space-panel-scope";
import {
  studioWebtoonWorkStatusOption,
  type StudioWebtoonWorkStatusId,
} from "../studio-virtual-space-work-status";
import { SpaceWorkStatusBar } from "./SpaceWorkStatusBar";
import { SpaceZoneWorkbar } from "./SpaceZoneWorkbar";
import type { SoloBoardTab } from "./VirtualSpaceStagePopovers";
import type {
  SpaceZoneWorkItem,
  SpaceZoneWorkKind,
  ZeroWalkShortcutItem,
} from "./space-zone-workflow";

export interface SpaceTopLeftWorkDrawerProps {
  /** 좌상단 도구 행 왼쪽에 고정 배치하는 컨트롤(프로필 팝오버·마감 카운트다운). */
  readonly leadingTools?: ReactNode;
  readonly personal: boolean;
  readonly worldReady: boolean;
  readonly authoringMode: boolean;
  readonly soloBoardOpen: SoloBoardTab | null;
  readonly onToggleSoloBoard: (tab: SoloBoardTab) => void;
  readonly teamBoardOpen: boolean;
  readonly onToggleTeamBoard: () => void;
  readonly teamAnnotationOpen?: boolean;
  readonly onToggleTeamAnnotation?: () => void;
  readonly workStatusId: StudioWebtoonWorkStatusId | null;
  readonly onSelectWorkStatus: (next: StudioWebtoonWorkStatusId) => void;
  readonly focusActive: boolean;
  readonly onStartFocusSprint: () => void;
  readonly onCompleteCheckpoint: () => void;
  readonly zoneWorkKind: SpaceZoneWorkKind | null;
  readonly zoneWorkItems: readonly SpaceZoneWorkItem[];
  readonly pulse?: StudioAtelierPulseSnapshot | null;
  readonly zeroWalkShortcuts: readonly ZeroWalkShortcutItem[];
  readonly onPanel: (panel: StudioVirtualWorkspacePanel) => void;
  readonly onCowork: () => void;
  readonly onShare: () => void;
  readonly onPulseAction?: () => void;
  readonly onZeroWalkShortcut?: (shortcut: ZeroWalkShortcutItem) => void;
}

const EMPTY_ZERO_WALK: readonly ZeroWalkShortcutItem[] = [];

/**
 * 좌상단 단일 접이식 작업 도구 드로어.
 *
 * 기본 상태는 접힘(`open = false`)으로 유지해 가상 스튜디오 시야를 넓게 확보하고,
 * `작업 도구` 버튼을 펼치면 협업 보드·업무 상태 바·빠른 직행 동선을 한 패널에 정리해 노출한다.
 * 특정 협업 구역(`hasZoneItems`)에 들어가면 접힌 상태에서도 구역 안내 바만 즉시 보여 준다.
 */
export const SpaceTopLeftWorkDrawer = memo(function SpaceTopLeftWorkDrawer({
  leadingTools,
  personal,
  worldReady,
  authoringMode,
  soloBoardOpen,
  onToggleSoloBoard,
  teamBoardOpen,
  onToggleTeamBoard,
  teamAnnotationOpen = false,
  onToggleTeamAnnotation,
  workStatusId,
  onSelectWorkStatus,
  focusActive,
  onStartFocusSprint,
  onCompleteCheckpoint,
  zoneWorkKind,
  zoneWorkItems,
  pulse,
  zeroWalkShortcuts,
  onPanel,
  onCowork,
  onShare,
  onPulseAction,
  onZeroWalkShortcut,
}: SpaceTopLeftWorkDrawerProps) {
  const bt = useBilingual("SpaceTopLeftWorkDrawer");
  const drawerId = useId();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const activeWorkStatus = studioWebtoonWorkStatusOption(workStatusId);
  const activeStatusLabel = activeWorkStatus
    ? bt(activeWorkStatus.labelKo, activeWorkStatus.labelEn)
    : null;
  const showWorkStatusBar = worldReady && !authoringMode;
  const hasZoneItems = Boolean(zoneWorkKind && zoneWorkItems.length > 0);
  const hasZeroWalk = zeroWalkShortcuts.length > 0;
  const showZoneSection = hasZoneItems || hasZeroWalk;

  const closeAndFocusToggle = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        (toggleRef.current?.contains(event.target) || drawerRef.current?.contains(event.target))
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeAndFocusToggle();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, closeAndFocusToggle]);

  const handleSoloBoard = (tab: SoloBoardTab) => {
    setOpen(false);
    onToggleSoloBoard(tab);
  };

  const handleTeamBoard = () => {
    setOpen(false);
    onToggleTeamBoard();
  };

  const handleTeamAnnotation = () => {
    setOpen(false);
    onToggleTeamAnnotation?.();
  };

  const handlePanel = (panel: StudioVirtualWorkspacePanel) => {
    setOpen(false);
    onPanel(panel);
  };

  const handleCowork = () => {
    setOpen(false);
    onCowork();
  };

  const handleShare = () => {
    setOpen(false);
    onShare();
  };

  const handlePulseAction = onPulseAction
    ? () => {
        setOpen(false);
        onPulseAction();
      }
    : undefined;

  const handleZeroWalkShortcut = onZeroWalkShortcut
    ? (shortcut: ZeroWalkShortcutItem) => {
        setOpen(false);
        onZeroWalkShortcut(shortcut);
      }
    : undefined;

  const quickBtnClass = (active: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-xs font-semibold transition-colors motion-reduce:transition-none ${
      active
        ? "border-accent bg-accent-soft text-accent"
        : "border-line bg-card text-fg hover:border-accent hover:bg-raised"
    }`;

  return (
    <>
      <div className="space-top-tools-row" data-space-interactive="true">
        {leadingTools}
        <button
          ref={toggleRef}
          type="button"
          data-testid="space-work-tools-toggle"
          aria-expanded={open}
          aria-controls={drawerId}
          onClick={() => setOpen((current) => !current)}
          className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold shadow-sm backdrop-blur-md transition-colors motion-reduce:transition-none ${
            open
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-panel/95 text-fg hover:border-accent"
          }`}
        >
          <SlidersHorizontal size={14} className="shrink-0" aria-hidden />
          <span className="shrink-0 whitespace-nowrap">{bt("작업 도구", "Work tools")}</span>
          {activeStatusLabel ? (
            <>
              <span aria-hidden className={open ? "shrink-0 text-accent/70" : "shrink-0 text-fg-3"}>
                ·
              </span>
              <span
                data-testid="space-work-tools-status-badge"
                className={
                  open
                    ? "shrink-0 whitespace-nowrap rounded-full border border-accent/35 bg-panel px-2 py-0.5 text-[11px] font-semibold text-fg"
                    : "shrink-0 whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent"
                }
              >
                {activeStatusLabel}
              </span>
            </>
          ) : null}
          {open ? (
            <ChevronUp size={14} className="shrink-0" aria-hidden />
          ) : (
            <ChevronDown size={14} className="shrink-0" aria-hidden />
          )}
        </button>
      </div>

      {open ? (
        <section
          ref={drawerRef}
          id={drawerId}
          data-testid="space-work-tools-drawer"
          data-space-interactive="true"
          aria-label={bt("작업 도구 패널", "Work tools drawer")}
          className="flex w-full max-w-[min(34rem,calc(100vw-1.5rem))] flex-col gap-3 rounded-2xl border border-line bg-panel/95 p-3 text-xs text-fg shadow-xl backdrop-blur-md break-keep"
        >
          <header className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold tracking-wide text-fg-2">
              {bt("작업 도구", "Work tools")}
            </span>
            <button
              type="button"
              data-testid="space-work-tools-close"
              aria-label={bt("작업 도구 닫기", "Close work tools")}
              onClick={closeAndFocusToggle}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-fg-2 transition-colors motion-reduce:transition-none hover:border-accent hover:text-fg"
            >
              <X size={15} aria-hidden />
            </button>
          </header>

          <div
            role="group"
            aria-label={bt("협업 보드", "Collaboration boards")}
            className="flex flex-wrap items-center gap-1.5"
          >
            {personal ? (
              <>
                <button
                  type="button"
                  data-testid="space-quick-whiteboard-btn"
                  aria-pressed={soloBoardOpen === "whiteboard"}
                  onClick={() => handleSoloBoard("whiteboard")}
                  className={quickBtnClass(soloBoardOpen === "whiteboard")}
                >
                  <PenTool size={14} className="shrink-0" aria-hidden />
                  <span>{bt("화이트보드", "Board")}</span>
                </button>
                <button
                  type="button"
                  data-testid="space-quick-stickies-btn"
                  aria-pressed={soloBoardOpen === "stickies"}
                  onClick={() => handleSoloBoard("stickies")}
                  className={quickBtnClass(soloBoardOpen === "stickies")}
                >
                  <StickyNote size={14} className="shrink-0" aria-hidden />
                  <span>{bt("포스트잇", "Stickies")}</span>
                </button>
                <button
                  type="button"
                  data-testid="space-quick-annotation-btn"
                  aria-pressed={soloBoardOpen === "annotation"}
                  onClick={() => handleSoloBoard("annotation")}
                  className={quickBtnClass(soloBoardOpen === "annotation")}
                >
                  <Presentation size={14} className="shrink-0" aria-hidden />
                  <span>{bt("실시간 주석", "Annotate")}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  data-testid="space-quick-whiteboard-btn"
                  aria-pressed={teamBoardOpen}
                  onClick={handleTeamBoard}
                  className={quickBtnClass(teamBoardOpen)}
                >
                  <PenTool size={14} className="shrink-0" aria-hidden />
                  <span>{bt("화이트보드", "Board")}</span>
                </button>
                {onToggleTeamAnnotation ? (
                  <button
                    type="button"
                    data-testid="space-quick-annotation-btn"
                    aria-pressed={teamAnnotationOpen}
                    onClick={handleTeamAnnotation}
                    className={quickBtnClass(teamAnnotationOpen)}
                  >
                    <Presentation size={14} className="shrink-0" aria-hidden />
                    <span>{bt("실시간 주석", "Annotate")}</span>
                  </button>
                ) : null}
              </>
            )}
          </div>

          {showWorkStatusBar ? (
            <div className="border-t border-line pt-2.5">
              <p className="mb-1.5 text-[11px] font-semibold text-fg-2">
                {bt("업무 상태 · 집중", "Work status & focus")}
              </p>
              <div className="[&_.space-work-status-bar]:w-full [&_.space-work-status-bar]:max-w-full [&_.space-work-status-bar]:border-0 [&_.space-work-status-bar]:bg-transparent [&_.space-work-status-bar]:p-0 [&_.space-work-status-bar]:backdrop-blur-none [&_.space-work-status-bar__divider]:hidden">
                <SpaceWorkStatusBar
                  activeStatusId={workStatusId}
                  onSelectStatus={onSelectWorkStatus}
                  focusActive={focusActive}
                  onStartFocusSprint={onStartFocusSprint}
                  onCompleteCheckpoint={onCompleteCheckpoint}
                />
              </div>
            </div>
          ) : null}

          {showZoneSection ? (
            <div className="border-t border-line pt-2.5">
              <p className="mb-1.5 text-[11px] font-semibold text-fg-2">
                {bt("빠른 직행 · 구역 도구", "Quick jumps & zone tools")}
              </p>
              <div className="flex flex-col gap-2 [&_[data-testid='space-zero-walk-bar']]:border-0 [&_[data-testid='space-zero-walk-bar']]:bg-transparent [&_[data-testid='space-zero-walk-bar']]:p-0 [&_[data-testid='space-zero-walk-bar']]:shadow-none">
                <SpaceZoneWorkbar
                  kind={zoneWorkKind}
                  items={zoneWorkItems}
                  pulse={pulse}
                  zeroWalkShortcuts={zeroWalkShortcuts}
                  onPanel={handlePanel}
                  onCowork={handleCowork}
                  onShare={handleShare}
                  onPulseAction={handlePulseAction}
                  onZeroWalkShortcut={handleZeroWalkShortcut}
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!open && hasZoneItems ? (
        <SpaceZoneWorkbar
          kind={zoneWorkKind}
          items={zoneWorkItems}
          pulse={pulse}
          zeroWalkShortcuts={EMPTY_ZERO_WALK}
          onPanel={onPanel}
          onCowork={onCowork}
          onShare={onShare}
          onPulseAction={onPulseAction}
        />
      ) : null}
    </>
  );
});
