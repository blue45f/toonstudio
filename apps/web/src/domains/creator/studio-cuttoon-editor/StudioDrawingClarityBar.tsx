import { X } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { StudioToolArtwork } from "../studio-tool-art/StudioToolArtwork";
import { StudioMainMenu } from "../StudioMainMenu";
import { projectStudioMainMenuToSevenStandardGroups } from "../studio-main-menu-group-spec";
import { StudioEditorReturnButton } from "../StudioEditorReturnButton";
import { returnFromStudioEditorInBrowser } from "../studio-editor-return-navigation";
import { StudioDocumentChromeSlot } from "../studio-shell/StudioDocumentChromeSlot";
import { StudioMenubarStatusSlots } from "../studio-shell/StudioMenubarStatusSlots";
import { installStudioCommandExecutionBindings } from "../studio-command-execution-registry";
import { useStudioDrawingCommandPresentation } from "./useStudioDrawingCommandPresentation";
import { createStudioDrawingClarityCommandBindings, studioDrawingCommandDestination } from "./StudioDrawingClarityCommands";
import { hasStudioCommandSearchHost, openStudioHelpCenter, requestStudioCommandSearch, subscribeStudioCommandSearchHostReadiness } from "../studio-help-center-channel";
import { requestStudioAllTools } from "../studio-toolbar-channel";
import { preloadStudioAssetToolPopoverBody, preloadStudioBubbleToolPopoverBody } from "../studio-tool-belt-lazy-ui";
import { StudioDrawingClaritySaveButton } from "./StudioDrawingClaritySaveButton";
import { StudioDrawingClarityMobileBar } from "./StudioDrawingClarityMobileBar";
import { StudioDrawingClarityCoreTools, StudioDrawingClarityHistory } from "./StudioDrawingClarityCoreTools";
import { StudioDrawingClarityMore } from "./StudioDrawingClarityMore";
import { requestStudioDrawingReliability } from "./studio-drawing-assistance-channel";
import { requestStudioShellFloatingLayoutManagerOpen } from "../studio-shell/studio-shell-floating-layout-events";
import { useStudioDrawingClarity, type StudioDrawingClarityPanel } from "./StudioDrawingClarityContext";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

import "./StudioDrawingClarity.css";
import "./StudioDrawingJewelChrome.css";

const LazyStudioDrawingClarityExport = lazyRetry(
  () => import("./StudioDrawingClarityExport").then((module) => ({ default: module.StudioDrawingClarityExport })),
  "StudioDrawingClarityExport",
);
const LazyStudioDrawingQuickErgonomicsBar = lazyRetry(
  () => import("./StudioDrawingQuickErgonomicsBar").then((module) => ({ default: module.StudioDrawingQuickErgonomicsBar })),
  "StudioDrawingQuickErgonomicsBar",
);

const LazyStudioShareAndInviteDialog = lazyRetry(
  () => import("./StudioShareAndInviteDialog"),
  "StudioShareAndInviteDialog",
);

const LazyStudioDrawingProjectTools = lazyRetry(
  () => import("./StudioDrawingProjectTools").then((module) => ({ default: module.StudioDrawingProjectTools })),
  "StudioDrawingProjectTools",
);

/** reduced-motion을 존중하며 5단계 제작 공정 전환에 View Transitions API를 적용한다. */
function runStageViewTransition(action: () => void): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    action();
    return;
  }
  const prefersReduced =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const docWithTransition = document as Document & {
    startViewTransition?: (callback: () => void) => unknown;
  };
  if (prefersReduced || typeof docWithTransition.startViewTransition !== "function") {
    action();
    return;
  }
  try {
    docWithTransition.startViewTransition(() => {
      action();
    });
  } catch {
    action();
  }
}

/** 메뉴와 같은 명령 바인딩과 저장 책임을 쓰는 기본 드로잉 화면이다. */
export function StudioDrawingClarityBar({ session: s, projectUtilities }: { readonly session: StudioCuttoonEditorViewSession; readonly projectUtilities?: ReactNode }) {
  const clarity = useStudioDrawingClarity();
  const outputRef = useRef<HTMLElement | null>(null);
  const shareTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const rememberExportTrigger = (trigger: HTMLElement | null) => { outputRef.current = trigger; };
  const openShare = (trigger: HTMLButtonElement) => {
    shareTriggerRef.current = trigger;
    setShareOpen(true);
  };
  const openComments = () => {
    if (s.openStudioCommentInbox) {
      s.openStudioCommentInbox();
      return;
    }
    s.setCommentsOpen?.(true);
  };
  return <>
    {s.isMobile
      ? <StudioDrawingClarityMobileBar session={s} onOpenShare={openShare} onExportTrigger={rememberExportTrigger} />
      : <StudioDrawingClarityDesktopBar session={s} onOpenShare={openShare} onExportTrigger={rememberExportTrigger} />}
    {clarity?.panel === "commands" ? (
      <Suspense fallback={null}><LazyStudioDrawingProjectTools session={s}>{projectUtilities}</LazyStudioDrawingProjectTools></Suspense>
    ) : s.projectActionsOpen ? <Suspense fallback={null}><div hidden>{projectUtilities}</div></Suspense> : null}
    {s.exportMenuOpen ? <Suspense fallback={null}><LazyStudioDrawingClarityExport session={s} triggerRef={outputRef} /></Suspense> : null}
    {shareOpen ? (
      <Suspense fallback={null}>
        <LazyStudioShareAndInviteDialog
          documentTitle={s.title ?? ""}
          openCommentCount={s.openStudioCommentCount ?? 0}
          returnFocus={() => shareTriggerRef.current}
          onClose={() => setShareOpen(false)}
          onOpenTeamPanel={() => s.setTeamPanelOpen(true)}
          onOpenComments={openComments}
          onOpenExport={() => { rememberExportTrigger(shareTriggerRef.current); s.setExportMenuOpen(true); }}
        />
      </Suspense>
    ) : null}
  </>;
}

function StudioDrawingClarityDesktopBar({
  session: s,
  onOpenShare,
  onExportTrigger,
}: {
  readonly session: StudioCuttoonEditorViewSession;
  readonly onOpenShare: (trigger: HTMLButtonElement) => void;
  readonly onExportTrigger: (trigger: HTMLElement | null) => void;
}) {
  const clarity = useStudioDrawingClarity(), bt = useBilingual("studio.drawingClarity");
  const searchReady = useSyncExternalStore(subscribeStudioCommandSearchHostReadiness, hasStudioCommandSearchHost, () => false);
  const [searchOrigin, setSearchOrigin] = useState<string | null>(null);
  const documentScope = JSON.stringify([s.currentWorkspaceOwnerScope, s.location.pathname, s.workId, s.remixId]);
  const inspectorVisible = clarity?.active && clarity.panel === "layers";
  useEffect(() => {
    if (searchOrigin === null) return;
    if (!inspectorVisible || searchOrigin !== documentScope) setSearchOrigin(null);
    else if (searchReady && requestStudioCommandSearch({ scope: "all" })) setSearchOrigin(null);
  }, [documentScope, inspectorVisible, searchOrigin, searchReady]);
  const moreRef = useRef<HTMLElement>(null);
  const commandPresentation = useStudioDrawingCommandPresentation(s, false);
  const langCode = bt("ko", "en") === "en" ? "en" : "ko";
  const standardSevenGroups = useMemo(() => {
    const revealed = s.studioMainMenuGroups.map((group) => ({
      ...group,
      items: group.items.map((item) => {
        const reveal = commandPresentation && studioDrawingCommandDestination(item.commandId, commandPresentation);
        return reveal && !item.disabled ? { ...item, onSelect: () => { reveal(); item.onSelect(); } } : item;
      }),
    }));
    return projectStudioMainMenuToSevenStandardGroups(revealed, { lang: langCode });
  }, [s.studioMainMenuGroups, commandPresentation, langCode]);
  const filterItems = useMemo(() => {
    const filterGroup = s.studioMainMenuGroups.find((group) => group.id === "filter");
    if (!filterGroup) return undefined;
    return filterGroup.items.map((item) => {
      const reveal = commandPresentation && studioDrawingCommandDestination(item.commandId, commandPresentation);
      return reveal && !item.disabled ? { ...item, onSelect: () => { reveal(); item.onSelect(); } } : item;
    });
  }, [s.studioMainMenuGroups, commandPresentation]);
  useEffect(() => {
    if (!commandPresentation) return;
    return installStudioCommandExecutionBindings(createStudioDrawingClarityCommandBindings(s.studioMainMenuGroups, commandPresentation));
  }, [s.studioMainMenuGroups, commandPresentation]);
  if (!clarity) return null;
  const openSearch = (trigger: HTMLElement) => {
    clarity.reveal("layers", trigger);
    setSearchOrigin(documentScope);
  };
  const openHistory = () => {
    s.setHistoryPanelOpen?.(true);
  };
  const drawingBlocked = s.activeSurfaceReviewLocked || s.pageEditLocked || (s.canvasInteractionBlocked && s.scopedCanvasDrawingAvailable !== true);
  return <>
    <div id="studio-menubar" role="region" tabIndex={-1} aria-label={bt("드로잉 도구와 저장", "Drawing tools and save")}
      data-studio-app-menubar="true" data-studio-drawing-clarity-header="true" data-studio-single-bar-height="44" className="studio-drawing-clarity-header">
      <StudioEditorReturnButton variant="lane" onReturn={returnFromStudioEditorInBrowser} />
      <div className="studio-drawing-clarity-title"><h1 title={s.title}>{s.title.trim() || bt("제목 없는 원고", "Untitled draft")}</h1><StudioDocumentChromeSlot /></div>
      <nav className="studio-drawing-classic-menubar" data-studio-standard-seven-menu="true" onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement && event.target.dataset.studioMainMenuTrigger === "file") onExportTrigger(event.target);
      }} aria-label={bt("표준 7대 메뉴", "Standard 7 menus")}>
        <StudioMainMenu groups={standardSevenGroups} presentation="quick" surface="action" ariaLabel={bt("표준 7대 메뉴", "Standard 7 menus")} />
      </nav>
      <div className="studio-drawing-workflow-switcher" role="group" data-studio-workflow-switcher="true" aria-label={bt("5단계 제작 공정", "5-stage production workflow")}>
        <button type="button" data-studio-workflow-stage="story" data-studio-allow-press-feedback="true" className="studio-drawing-workflow-step" aria-pressed={clarity.panel === "pages"} onClick={(event) => {
          const trigger = event.currentTarget;
          runStageViewTransition(() => clarity.open("pages", trigger));
        }}>
          <span>{bt("1 콘티", "1 Story")}</span>
        </button>
        <button type="button" data-studio-workflow-stage="bg3d" data-studio-allow-press-feedback="true" className="studio-drawing-workflow-step" aria-pressed={Boolean(s.bg3dOpen)} onClick={() => runStageViewTransition(() => s.studioLeftToolRailHandlers?.toggleBg3dEditor?.())}>
          <span>{bt("2 3D/배경", "2 3D")}</span>
        </button>
        <button type="button" data-studio-workflow-stage="draw" data-studio-allow-press-feedback="true" className="studio-drawing-workflow-step" disabled={drawingBlocked} aria-pressed={s.tool === "draw"} onClick={() => runStageViewTransition(() => s.activatePrimaryCanvasTool?.("draw", "pen"))}
          data-unavailable-reason={drawingBlocked ? bt("현재 편집 권한이 잠겨 있어 작화 모드로 전환할 수 없습니다", "Drawing mode is locked") : undefined}
          title={drawingBlocked ? bt("현재 편집 권한이 잠겨 있어 작화 모드로 전환할 수 없습니다", "Drawing mode is locked") : bt("작화·채색 도구로 전환", "Switch to drawing and coloring")}>
          <span>{bt("3 작화/채색", "3 Draw")}</span>
        </button>
        <button type="button" data-studio-workflow-stage="lettering" data-studio-allow-press-feedback="true" className="studio-drawing-workflow-step" aria-pressed={s.menu === "bubble"} onClick={() => runStageViewTransition(() => { preloadStudioBubbleToolPopoverBody(); s.setMenu("bubble"); })}>
          <span>{bt("4 식자", "4 Text")}</span>
        </button>
        <button type="button" data-studio-workflow-stage="export" data-studio-allow-press-feedback="true" className="studio-drawing-workflow-step" aria-pressed={Boolean(s.exportMenuOpen)} onClick={(event) => {
          const trigger = event.currentTarget;
          runStageViewTransition(() => { onExportTrigger(trigger); s.setExportMenuOpen(true); });
        }}>
          <span>{bt("5 검수/출고", "5 Export")}</span>
        </button>
      </div>
      <button type="button" data-studio-clarity-omnibox="true" data-studio-clarity-find-tools="true" className="studio-drawing-omnibox" onClick={(event) => openSearch(event.currentTarget)} title={bt("기능·도구 통합 검색 (⌘K)", "Search tools and commands (⌘K)")}>
        <StudioToolArtwork tool="search" /><span>{bt("검색", "Search")}</span><kbd aria-hidden="true">⌘K</kbd>
      </button>
      <button type="button" data-studio-clarity-history-btn="true" className="studio-drawing-clarity-button studio-drawing-clarity-compact-btn" onClick={openHistory} title={bt("저장 기록과 스냅샷 복원 열기", "Open save history and restore snapshots")}>
        <StudioToolArtwork tool="history" /><span>{bt("수정이력", "History")}</span>
      </button>
      <StudioDrawingClaritySaveButton session={s} />
      <StudioMenubarStatusSlots ids={["endurance"]} />
      <button type="button" data-studio-share-invite-trigger="true" className="studio-drawing-clarity-button studio-drawing-clarity-share" onClick={(event) => onOpenShare(event.currentTarget)}>
        <StudioToolArtwork tool="share" /><span>{bt("공유·초대", "Share & Invite")}</span>
      </button>
      <button type="button" data-studio-clarity-export-btn="true" className="studio-drawing-clarity-button studio-drawing-clarity-export" onClick={(event) => { onExportTrigger(event.currentTarget); s.setExportMenuOpen(true); }} title={bt("세로 스크롤 분할 PNG·PSD 출고", "Export draft")}>
        <StudioToolArtwork tool="export" /><span>{bt("출고", "Export")}</span>
      </button>
      <StudioDrawingClarityMore id="studio-drawing-clarity-more-menu" hostId="studio-drawing-clarity-desktop-more-slot" purpose={bt("작업 설정과 도움말", "Work settings and help")} presentation="tasks" triggerRef={moreRef} filterItems={filterItems} panel={clarity.panel} actions={[
        { id: "layers", label: bt("레이어·속성 보기", "View layers and properties"), run: (trigger) => { clarity.open("layers", trigger); s.studioMobileEditingDockHandlers.openInspectorRoute({ primary: "layers" }); } },
        { id: "brush", label: bt("펜·브러시 설정", "Pen and brush settings"), run: (trigger) => clarity.open("brush", trigger) },
        { id: "pages", label: bt("페이지 보기", "View pages"), run: (trigger) => clarity.open("pages", trigger) },
        { id: "assets", label: bt("소재 찾기", "Find assets"), run: () => { clarity.close(); preloadStudioAssetToolPopoverBody(); s.setMenu("asset"); } },
        { id: "export", label: bt("원고 내보내기", "Export draft"), run: (trigger) => { clarity.close(); onExportTrigger(trigger); s.setExportMenuOpen(true); } },
        { id: "team", label: bt("함께 작업", "Work together"), run: () => s.setTeamPanelOpen(true) },
        { id: "all", label: bt("전체 도구", "All tools"), run: requestStudioAllTools },
        { id: "search", label: bt("도구·기능 검색", "Search tools and features"), run: (trigger) => openSearch(trigger) },
        { id: "windows", label: bt("프로젝트·창 도구", "Project and window tools"), run: (trigger) => clarity.reveal("commands", trigger) },
        { id: "help", label: bt("사용 방법", "How to use"), run: () => openStudioHelpCenter({ section: "current-tool" }) },
        { id: "view", label: bt("화면과 작업 환경", "Display and workspace"), run: requestStudioShellFloatingLayoutManagerOpen },
        { id: "status", label: bt("저장·화면 문제 해결", "Save and display troubleshooting"), run: requestStudioDrawingReliability },
      ]} />
    </div>
    <div tabIndex={-1} className="studio-drawing-clarity-context-row" data-studio-floating-context-strip="true">
      <button type="button" className="studio-drawing-page-position" onClick={(event) => clarity.open("pages", event.currentTarget)}>
        {s.studioMenubarActivePageLabel.trim() && s.studioMenubarActivePageLabel.trim() !== s.title.trim()
          ? s.studioMenubarActivePageLabel : `${bt("페이지", "Page")} ${s.activePageIndex + 1}`}<span aria-hidden>⌄</span>
      </button>
      <span id="studio-document-quick-mode-slot" className="shrink-0 empty:hidden" />
      <div className="studio-drawing-selected-tools">
        <button type="button" className="studio-drawing-ergonomics-chip" onClick={event => clarity.open("brush", event.currentTarget)}>
          <StudioToolArtwork tool="brush" /><span>{bt("브러시", "Brushes")}</span>
        </button>
      </div>
      <div ref={clarity.setSelectionHost} className="studio-drawing-selection-slot" />
      <Suspense fallback={null}><LazyStudioDrawingQuickErgonomicsBar session={s} /></Suspense>
      <div className="studio-drawing-clarity-context-actions">
        <StudioDrawingClarityHistory session={s} />
      </div>
    </div>
    {searchOrigin === documentScope && inspectorVisible ? <p role="status" className="px-3 py-1 text-xs text-fg-2">{bt("검색을 여는 중", "Opening search")}</p> : null}
  </>;
}

export function StudioDrawingClarityPaneHeading({ panel }: { readonly panel: StudioDrawingClarityPanel }) {
  const clarity = useStudioDrawingClarity(), bt = useBilingual("studio.drawingClarity");
  const title = panel === "layers" ? bt("레이어·속성", "Layers and properties") : panel === "brush" ? bt("펜·브러시", "Pens and brushes") : bt("페이지", "Pages");
  return <header className="studio-drawing-clarity-pane-heading"><h2 tabIndex={-1} data-clarity-pane-heading>{title}</h2><button type="button" className="studio-drawing-clarity-button" onClick={clarity?.close} aria-label={`${title} · ${bt("닫기", "Close")}`}><X size={18} aria-hidden /></button></header>;
}

export function StudioDrawingClarityRail({ session: s, pinnedHostRef }: { readonly session: StudioCuttoonEditorViewSession; readonly pinnedHostRef?: (host: HTMLDivElement | null) => void }) {
  const clarity = useStudioDrawingClarity(), bt = useBilingual("studio.drawingClarity");
  if (!clarity?.active || s.isMobile) return null;
  const openLayers = (trigger: HTMLElement) => {
    clarity.open("layers", trigger);
    s.studioMobileEditingDockHandlers.openInspectorRoute({ primary: "layers" });
  };
  return <nav tabIndex={-1} className="studio-drawing-clarity-rail" data-studio-rail-width="48" aria-label={bt("기본 그리기", "Basic drawing")}>
    <StudioDrawingClarityCoreTools
      session={{ ...s, clarityPanel: clarity.panel }} pinnedHostRef={pinnedHostRef}
      onOpenLayers={openLayers}
      v4Actions={{
        onSelectTool: () => s.activatePrimaryCanvasTool?.("select"),
        onOpenFill: (trigger) => {
          clarity.reveal("layers", trigger);
          s.studioMobileEditingDockHandlers.openInspectorRoute({ primary: "properties", image: "fill" });
          s.studioLeftToolRailHandlers.toggleAdvancedFill();
        },
        onOpenCutSplit: (trigger) => clarity.open("pages", trigger),
        onOpenBubble: () => {
          preloadStudioBubbleToolPopoverBody();
          s.setMenu("bubble");
        },
        onToggleBg3d: () => s.studioLeftToolRailHandlers.toggleBg3dEditor(),
        onPlacePinComment: () => {
          if (s.startStudioCommentPlacementSession) {
            s.startStudioCommentPlacementSession();
            return;
          }
          s.setCommentsOpen?.(true);
        },
        onOpenAllTools: requestStudioAllTools,
      }}
    />
  </nav>;
}
