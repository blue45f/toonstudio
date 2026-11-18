import { Download, History, Link2, MessageCircle, Search, X } from "lucide-react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { StudioEditorReturnButton } from "../StudioEditorReturnButton";
import { returnFromStudioEditorInBrowser } from "../studio-editor-return-navigation";
import { StudioDocumentChromeSlot } from "../studio-shell/StudioDocumentChromeSlot";
import { installStudioCommandExecutionBindings } from "../studio-command-execution-registry";
import { createStudioDrawingClarityCommandBindings } from "./StudioDrawingClarityCommands";
import { openStudioHelpCenter, requestStudioCommandSearch } from "../studio-help-center-channel";
import { requestStudioAllTools } from "../studio-toolbar-channel";
import { preloadStudioAssetToolPopoverBody } from "../studio-tool-belt-lazy-ui";
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

export { StudioDrawingClarityEntry } from "./StudioDrawingClarityEntry";

/** 메뉴와 같은 명령 바인딩과 저장 책임을 쓰는 기본 드로잉 화면이다. */
export function StudioDrawingClarityBar({ session: s }: { readonly session: StudioCuttoonEditorViewSession }) {
  const outputRef = useRef<HTMLElement | null>(null);
  const shareTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const clarity = useStudioDrawingClarity();
  const openShare = (trigger: HTMLButtonElement) => {
    shareTriggerRef.current = trigger;
    setShareOpen(true);
  };
  const openComments = () => {
    clarity?.showSavedLayout();
    if (s.openStudioCommentInbox) {
      s.openStudioCommentInbox();
      return;
    }
    s.setCommentsOpen?.(true);
  };
  return <>
    {s.isMobile
      ? <StudioDrawingClarityMobileBar session={s} onOpenShare={openShare} />
      : <StudioDrawingClarityDesktopBar session={s} onOpenShare={openShare} onOpenComments={openComments} />}
    {s.exportMenuOpen ? <Suspense fallback={null}><LazyStudioDrawingClarityExport session={s} triggerRef={outputRef} /></Suspense> : null}
    {shareOpen ? (
      <Suspense fallback={null}>
        <LazyStudioShareAndInviteDialog
          documentTitle={s.title ?? ""}
          openCommentCount={s.openStudioCommentCount ?? 0}
          returnFocus={() => shareTriggerRef.current}
          onClose={() => setShareOpen(false)}
          onOpenTeamPanel={() => { clarity?.showSavedLayout(); s.setTeamPanelOpen(true); }}
          onOpenComments={openComments}
          onOpenExport={() => s.setExportMenuOpen(true)}
        />
      </Suspense>
    ) : null}
  </>;
}

function StudioDrawingClarityDesktopBar({
  session: s,
  onOpenShare,
  onOpenComments,
}: {
  readonly session: StudioCuttoonEditorViewSession;
  readonly onOpenShare: (trigger: HTMLButtonElement) => void;
  readonly onOpenComments: () => void;
}) {
  const clarity = useStudioDrawingClarity(), bt = useBilingual("studio.drawingClarity");
  const [notice, setNotice] = useState("");
  const moreRef = useRef<HTMLElement>(null);
  const reveal = clarity?.reveal, showSavedLayout = clarity?.showSavedLayout;
  const openInspector = useCallback(() => {
    const trigger = document.querySelector<HTMLElement>("[data-studio-clarity-find-tools]");
    if (trigger) reveal?.("layers", trigger);
  }, [reveal]);
  useEffect(() => {
    if (!showSavedLayout) return;
    return installStudioCommandExecutionBindings(createStudioDrawingClarityCommandBindings(s.studioMainMenuGroups, { showSavedLayout, openInspector }));
  }, [s.studioMainMenuGroups, showSavedLayout, openInspector]);
  if (!clarity) return null;
  const openSearch = (trigger: HTMLElement) => {
    clarity.reveal("layers", trigger);
    setNotice(requestStudioCommandSearch({ scope: "all" }) ? "" : bt("검색을 준비하고 있어요. 다시 눌러 주세요.", "Search is getting ready. Please try again."));
  };
  const openHistory = () => {
    clarity.showSavedLayout();
    s.setHistoryPanelOpen?.(true);
  };
  const commentCount = s.openStudioCommentCount ?? 0;
  return <>
    <header id="studio-menubar" role="region" tabIndex={-1} aria-label={bt("드로잉 도구와 저장", "Drawing tools and save")}
      data-studio-app-menubar="true" data-studio-drawing-clarity-header="true" className="studio-drawing-clarity-header">
      <StudioEditorReturnButton variant="lane" onReturn={returnFromStudioEditorInBrowser} />
      <div className="studio-drawing-clarity-title"><h1 title={s.title}>{s.title.trim() || bt("제목 없는 원고", "Untitled draft")}</h1><StudioDocumentChromeSlot /></div>
      <nav className="studio-drawing-classic-menubar" aria-label={bt("원고 빠른 메뉴", "Quick document menu")}>
        <button type="button" className="studio-drawing-classic-menu-item" onClick={() => s.setExportMenuOpen(true)}>{bt("파일", "File")}</button>
        <button type="button" className="studio-drawing-classic-menu-item" onClick={openHistory}>{bt("편집", "Edit")}</button>
        <button type="button" className="studio-drawing-classic-menu-item" onClick={(event) => clarity.open("pages", event.currentTarget)}>{bt("컷·원고", "Cuts")}</button>
        <button type="button" className="studio-drawing-classic-menu-item" onClick={(event) => { clarity.open("layers", event.currentTarget); s.studioMobileEditingDockHandlers.openInspectorRoute({ primary: "layers" }); }}>{bt("레이어", "Layers")}</button>
        <button type="button" className="studio-drawing-classic-menu-item" onClick={(event) => clarity.open("brush", event.currentTarget)}>{bt("브러시·필터", "Brushes")}</button>
        <button type="button" className="studio-drawing-classic-menu-item" onClick={() => s.setBg3dOpen?.((open) => !open)}>{bt("3D·캐릭터", "3D")}</button>
        <button type="button" className="studio-drawing-classic-menu-item" onClick={() => { clarity.showSavedLayout(); s.setTeamPanelOpen(true); }}>{bt("협업·검수", "Collab")}</button>
      </nav>
      <button type="button" data-studio-clarity-omnibox="true" className="studio-drawing-omnibox" onClick={(event) => openSearch(event.currentTarget)}>
        <Search size={15} aria-hidden /><span>{bt("기능·도구 검색", "Search tools & actions")}</span><kbd aria-hidden="true">⌘K</kbd>
      </button>
      <button type="button" data-studio-clarity-history-btn="true" className="studio-drawing-clarity-button studio-drawing-clarity-compact-btn" onClick={openHistory} title={bt("수정 이력과 스냅샷 복원 열기", "Open revision history")}>
        <History size={16} aria-hidden /><span>{bt("수정이력", "History")}</span>
      </button>
      <StudioDrawingClaritySaveButton session={s} />
      <button type="button" data-studio-clarity-comments-btn="true" className="studio-drawing-clarity-button studio-drawing-clarity-compact-btn" onClick={onOpenComments} title={bt("원고 좌표 핀 댓글과 검수 열기", "Open pinned review comments")}>
        <MessageCircle size={16} aria-hidden /><span>{bt("댓글", "Comments")}{commentCount > 0 ? ` ${commentCount}` : ""}</span>
      </button>
      <button type="button" data-studio-clarity-export-btn="true" className="studio-drawing-clarity-button studio-drawing-clarity-compact-btn" onClick={() => s.setExportMenuOpen(true)} title={bt("세로 스크롤 분할 PNG·PSD 출고", "Export draft")}>
        <Download size={16} aria-hidden /><span>{bt("출고", "Export")}</span>
      </button>
      <button type="button" data-studio-share-invite-trigger="true" className="studio-drawing-clarity-button studio-drawing-clarity-share" onClick={(event) => onOpenShare(event.currentTarget)}>
        <Link2 size={16} aria-hidden /><span>{bt("공유·초대", "Share & Invite")}</span>
      </button>
      <StudioDrawingClarityMore id="studio-drawing-clarity-more-menu" hostId="studio-drawing-clarity-desktop-more-slot" purpose={bt("작업 설정과 도움말", "Work settings and help")} presentation="tasks" triggerRef={moreRef} panel={clarity.panel} actions={[
        { id: "layers", label: bt("레이어·속성 보기", "View layers and properties"), run: (trigger) => { clarity.open("layers", trigger); s.studioMobileEditingDockHandlers.openInspectorRoute({ primary: "layers" }); } },
        { id: "brush", label: bt("펜·브러시 설정", "Pen and brush settings"), run: (trigger) => clarity.open("brush", trigger) },
        { id: "pages", label: bt("페이지 보기", "View pages"), run: (trigger) => clarity.open("pages", trigger) },
        { id: "assets", label: bt("소재 찾기", "Find assets"), run: () => { clarity.close(); preloadStudioAssetToolPopoverBody(); s.setMenu("asset"); } },
        { id: "export", label: bt("원고 내보내기", "Export draft"), run: () => { clarity.close(); s.setExportMenuOpen(true); } },
        { id: "team", label: bt("함께 작업", "Work together"), run: () => { clarity.showSavedLayout(); s.setTeamPanelOpen(true); } },
        { id: "all", label: bt("전체 도구", "All tools"), run: (trigger) => { openInspector(); requestStudioAllTools(trigger); } },
        { id: "search", label: bt("도구·기능 검색", "Search tools and features"), run: (trigger) => openSearch(trigger) },
        { id: "windows", label: bt("프로젝트·창 도구 보기", "Show project and window tools"), run: clarity.showSavedLayout },
        { id: "help", label: bt("사용 방법", "How to use"), run: () => openStudioHelpCenter({ section: "current-tool" }) },
        { id: "view", label: bt("화면과 작업 환경", "Display and workspace"), run: requestStudioShellFloatingLayoutManagerOpen },
        { id: "status", label: bt("저장·화면 문제 해결", "Save and display troubleshooting"), run: requestStudioDrawingReliability },
      ]} />
    </header>
    <div tabIndex={-1} className="studio-drawing-clarity-context-row"><button type="button" className="studio-drawing-page-position" onClick={(event) => clarity.open("pages", event.currentTarget)}>{s.studioMenubarActivePageLabel.trim() && s.studioMenubarActivePageLabel.trim() !== s.title.trim() ? s.studioMenubarActivePageLabel : `${bt("페이지", "Page")} ${s.activePageIndex + 1}`}<span aria-hidden>⌄</span></button><Suspense fallback={null}><LazyStudioDrawingQuickErgonomicsBar session={s} /></Suspense><div className="studio-drawing-clarity-context-actions"><StudioDrawingClarityHistory session={s} /><button type="button" data-studio-clarity-find-tools="true" className="studio-drawing-clarity-button" onClick={(event) => openSearch(event.currentTarget)}><Search size={18} aria-hidden /><span>{bt("도구 찾기", "Find tools")}</span></button></div></div>
    {notice ? <p role="status" className="px-3 py-1 text-xs text-fg-2">{notice}</p> : null}
  </>;
}

export function StudioDrawingClarityPaneHeading({ panel }: { readonly panel: StudioDrawingClarityPanel }) {
  const clarity = useStudioDrawingClarity(), bt = useBilingual("studio.drawingClarity");
  const title = panel === "layers" ? bt("레이어·속성", "Layers and properties") : panel === "brush" ? bt("펜·브러시", "Pens and brushes") : bt("페이지", "Pages");
  return <header className="studio-drawing-clarity-pane-heading"><h2 tabIndex={-1} data-clarity-pane-heading>{title}</h2><button type="button" className="studio-drawing-clarity-button" onClick={clarity?.close} aria-label={`${title} · ${bt("닫기", "Close")}`}><X size={18} aria-hidden /></button></header>;
}

export function StudioDrawingClarityRail({ session: s }: { readonly session: StudioCuttoonEditorViewSession }) {
  const clarity = useStudioDrawingClarity(), bt = useBilingual("studio.drawingClarity");
  if (!clarity?.active || s.isMobile) return null;
  const openLayers = (trigger: HTMLElement) => {
    clarity.open("layers", trigger);
    s.studioMobileEditingDockHandlers.openInspectorRoute({ primary: "layers" });
  };
  return <nav tabIndex={-1} className="studio-drawing-clarity-rail" data-app-tooltip-preferred-side="right" aria-label={bt("기본 그리기", "Basic drawing")}>
    <span className="studio-drawing-rail-brand" aria-hidden><img src="/brand/luminous-atelier-20261114/icon-studio-pen-ink.webp" alt="" width={34} height={34} /></span>
    <StudioDrawingClarityCoreTools
      session={{ ...s, clarityPanel: clarity.panel }}
      onOpenLayers={openLayers}
      v4Actions={{
        onSelectTool: () => s.activatePrimaryCanvasTool?.("select"),
        onOpenFill: (trigger) => {
          clarity.reveal("layers", trigger);
          s.studioMobileEditingDockHandlers.openInspectorRoute({ primary: "properties", image: "fill" });
        },
        onOpenCutSplit: (trigger) => clarity.open("pages", trigger),
        onOpenBubble: () => {
          clarity.showSavedLayout();
          requestStudioCommandSearch({ scope: "all" });
        },
        onToggleBg3d: () => s.setBg3dOpen?.((open) => !open),
        onPlacePinComment: () => {
          if (s.startStudioCommentPlacementSession) {
            s.startStudioCommentPlacementSession();
            return;
          }
          clarity.showSavedLayout();
          s.setCommentsOpen?.(true);
        },
        onOpenAllTools: (trigger) => {
          clarity.reveal("layers", trigger);
          requestStudioAllTools(trigger);
        },
      }}
    />
  </nav>;
}
