import { X } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { StudioToolArtwork } from "../studio-tool-art/StudioToolArtwork";
import { StudioMainMenu } from "../StudioMainMenu";
import { StudioEditorReturnButton } from "../StudioEditorReturnButton";
import { returnFromStudioEditorInBrowser } from "../studio-editor-return-navigation";
import { StudioDocumentChromeSlot } from "../studio-shell/StudioDocumentChromeSlot";
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
      : <StudioDrawingClarityDesktopBar session={s} onOpenShare={openShare} onOpenComments={openComments} onExportTrigger={rememberExportTrigger} />}
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
  onOpenComments,
  onExportTrigger,
}: {
  readonly session: StudioCuttoonEditorViewSession;
  readonly onOpenShare: (trigger: HTMLButtonElement) => void;
  readonly onOpenComments: () => void;
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
  const quickGroups = useMemo(() => s.studioMainMenuGroups.filter(group => ["file", "edit", "filter"].includes(group.id)).map(group => ({
    ...group,
    items: group.items.map(item => {
      const reveal = commandPresentation && studioDrawingCommandDestination(item.commandId, commandPresentation);
      return reveal && !item.disabled ? { ...item, onSelect: () => { reveal(); item.onSelect(); } } : item;
    }),
  })), [s.studioMainMenuGroups, commandPresentation]);
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
  const commentCount = s.openStudioCommentCount ?? 0;
  const filterGroup = quickGroups.find(group => group.id === "filter");
  const filterMenu = filterGroup && (
    <StudioMainMenu presentation="quick" surface="action" ariaLabel={bt("필터", "Filters")} groups={[{ ...filterGroup, label: bt("필터", "Filters") }]} />
  );
  const stageGroup = s.studioMainMenuGroups.find((group) => group.id === "3d");
  return <>
    <header id="studio-menubar" role="region" tabIndex={-1} aria-label={bt("드로잉 도구와 저장", "Drawing tools and save")}
      data-studio-app-menubar="true" data-studio-drawing-clarity-header="true" className="studio-drawing-clarity-header">
      <StudioEditorReturnButton variant="lane" onReturn={returnFromStudioEditorInBrowser} />
      <div className="studio-drawing-clarity-title"><h1 title={s.title}>{s.title.trim() || bt("제목 없는 원고", "Untitled draft")}</h1><StudioDocumentChromeSlot /></div>
      <nav className="studio-drawing-classic-menubar" onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement && event.target.dataset.studioMainMenuTrigger === "file") onExportTrigger(event.target);
      }} aria-label={bt("원고 빠른 메뉴", "Quick document menu")}>
        <StudioMainMenu groups={quickGroups.filter(group => group.id !== "filter")} presentation="quick" surface="action" ariaLabel={bt("파일과 편집", "File and edit")} />
        <button type="button" className="studio-drawing-classic-menu-item" onClick={(event) => clarity.open("pages", event.currentTarget)}>{bt("컷·원고", "Cuts")}</button>
        <button type="button" className="studio-drawing-classic-menu-item" onClick={(event) => { clarity.open("layers", event.currentTarget); s.studioMobileEditingDockHandlers.openInspectorRoute({ primary: "layers" }); }}>{bt("레이어", "Layers")}</button>
        {filterMenu}
        {stageGroup && <StudioMainMenu groups={[{ ...stageGroup, label: bt("3D·캐릭터", "3D & characters") }]} presentation="quick" surface="action" ariaLabel={bt("3D 도구", "3D tools")} />}
        <button type="button" className="studio-drawing-classic-menu-item" onClick={() => s.setTeamPanelOpen(true)}>{bt("협업·검수", "Collab")}</button>
      </nav>
      <button type="button" data-studio-clarity-omnibox="true" className="studio-drawing-omnibox" onClick={(event) => openSearch(event.currentTarget)}>
        <StudioToolArtwork tool="search" /><span>{bt("기능·도구 검색", "Search tools & actions")}</span><kbd aria-hidden="true">⌘K</kbd>
      </button>
      <button type="button" data-studio-clarity-history-btn="true" className="studio-drawing-clarity-button studio-drawing-clarity-compact-btn" onClick={openHistory} title={bt("수정 이력과 스냅샷 복원 열기", "Open revision history")}>
        <StudioToolArtwork tool="history" /><span>{bt("수정이력", "History")}</span>
      </button>
      <StudioDrawingClaritySaveButton session={s} />
      <button type="button" data-studio-clarity-comments-btn="true" className="studio-drawing-clarity-button studio-drawing-clarity-compact-btn" onClick={onOpenComments} title={bt("원고 좌표 핀 댓글과 검수 열기", "Open pinned review comments")}>
        <StudioToolArtwork tool="bubble" /><span>{bt("댓글", "Comments")}{commentCount > 0 ? ` ${commentCount}` : ""}</span>
      </button>
      <button type="button" data-studio-clarity-export-btn="true" className="studio-drawing-clarity-button studio-drawing-clarity-compact-btn" onClick={(event) => { onExportTrigger(event.currentTarget); s.setExportMenuOpen(true); }} title={bt("세로 스크롤 분할 PNG·PSD 출고", "Export draft")}>
        <StudioToolArtwork tool="export" /><span>{bt("출고", "Export")}</span>
      </button>
      <button type="button" data-studio-share-invite-trigger="true" className="studio-drawing-clarity-button studio-drawing-clarity-share" onClick={(event) => onOpenShare(event.currentTarget)}>
        <StudioToolArtwork tool="share" /><span>{bt("공유·초대", "Share & Invite")}</span>
      </button>
      <StudioDrawingClarityMore id="studio-drawing-clarity-more-menu" hostId="studio-drawing-clarity-desktop-more-slot" purpose={bt("작업 설정과 도움말", "Work settings and help")} presentation="tasks" triggerRef={moreRef} filterItems={filterGroup?.items} panel={clarity.panel} actions={[
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
    </header>
    <div tabIndex={-1} className="studio-drawing-clarity-context-row">
      <button type="button" className="studio-drawing-page-position" onClick={(event) => clarity.open("pages", event.currentTarget)}>
        {s.studioMenubarActivePageLabel.trim() && s.studioMenubarActivePageLabel.trim() !== s.title.trim()
          ? s.studioMenubarActivePageLabel : `${bt("페이지", "Page")} ${s.activePageIndex + 1}`}<span aria-hidden>⌄</span>
      </button>
      <span id="studio-document-quick-mode-slot" className="shrink-0 empty:hidden" />
      <div className="studio-drawing-selected-tools">
        <button type="button" className="studio-drawing-ergonomics-chip" onClick={event => clarity.open("brush", event.currentTarget)}>
          <StudioToolArtwork tool="brush" /><span>{bt("브러시", "Brushes")}</span>
        </button>
        <div className="studio-drawing-compact-filter-menu">{filterMenu}</div>
      </div>
      <div ref={clarity.setSelectionHost} className="studio-drawing-selection-slot" />
      <Suspense fallback={null}><LazyStudioDrawingQuickErgonomicsBar session={s} compactFilter={filterMenu} /></Suspense>
      <div className="studio-drawing-clarity-context-actions">
        <StudioDrawingClarityHistory session={s} />
        <button type="button" data-studio-clarity-find-tools="true" className="studio-drawing-clarity-button" onClick={(event) => openSearch(event.currentTarget)}>
          <StudioToolArtwork tool="search" /><span>{bt("도구 찾기", "Find tools")}</span>
        </button>
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
  return <nav tabIndex={-1} className="studio-drawing-clarity-rail" aria-label={bt("기본 그리기", "Basic drawing")}>
    <span className="studio-drawing-rail-brand" aria-hidden><img src="/brand/luminous-atelier-20261114/icon-studio-pen-ink.webp" alt="" width={34} height={34} /></span>
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
