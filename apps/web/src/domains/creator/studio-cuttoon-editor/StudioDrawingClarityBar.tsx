import { Pencil, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
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
import { StudioDrawingClarityExport } from "./StudioDrawingClarityExport";
import { StudioDrawingClarityCoreTools, StudioDrawingClarityHistory } from "./StudioDrawingClarityCoreTools";
import { StudioDrawingClarityMore } from "./StudioDrawingClarityMore";
import { StudioDrawingClarityReceipt } from "./StudioDrawingClarityReceipt";
import { useStudioDrawingClarity, type StudioDrawingClarityPanel } from "./StudioDrawingClarityContext";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

import "./StudioDrawingClarity.css";

export function StudioDrawingClarityEntry() {
  const clarity = useStudioDrawingClarity(), bt = useBilingual("studio.drawingClarity");
  if (!clarity?.available || clarity.active) return null;
  return <button type="button" data-studio-clarity-entry="true" className="studio-drawing-clarity-button shrink-0" onClick={clarity.chooseSimple}>
    <Pencil size={18} aria-hidden />{bt("간단한 그리기", "Simple drawing")}
  </button>;
}

/** 메뉴와 같은 명령 바인딩과 저장 책임을 쓰는 기본 드로잉 화면이다. */
export function StudioDrawingClarityBar({ session: s }: { readonly session: StudioCuttoonEditorViewSession }) {
  const outputRef = useRef<HTMLElement | null>(null);
  return <>{s.isMobile ? <StudioDrawingClarityMobileBar session={s} /> : <StudioDrawingClarityDesktopBar session={s} />}
    {s.exportMenuOpen ? <StudioDrawingClarityExport session={s} triggerRef={outputRef} /> : null}</>;
}

function StudioDrawingClarityDesktopBar({ session: s }: { readonly session: StudioCuttoonEditorViewSession }) {
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
  return <>
    <header id="studio-menubar" role="region" tabIndex={-1} aria-label={bt("드로잉 도구와 저장", "Drawing tools and save")}
      data-studio-app-menubar="true" data-studio-drawing-clarity-header="true" className="studio-drawing-clarity-header">
      <StudioEditorReturnButton variant="lane" onReturn={returnFromStudioEditorInBrowser} />
      <div className="studio-drawing-clarity-title"><h1 title={s.title}>{s.title.trim() || bt("제목 없는 원고", "Untitled draft")}</h1><StudioDrawingClarityReceipt store={s.saveSyncStore} /></div>
      <StudioDrawingClaritySaveButton session={s} />
      <StudioDrawingClarityMore id="studio-drawing-clarity-more-menu" hostId="studio-drawing-clarity-desktop-more-slot" purpose={bt("작업 설정과 도움말", "Work settings and help")} triggerRef={moreRef} panel={clarity.panel} actions={[
        { id: "layers", label: bt("레이어·속성 보기", "View layers and properties"), run: (trigger) => { clarity.open("layers", trigger); s.studioMobileEditingDockHandlers.openInspectorRoute({ primary: "layers" }); } },
        { id: "brush", label: bt("펜·브러시 설정", "Pen and brush settings"), run: (trigger) => clarity.open("brush", trigger) },
        { id: "pages", label: bt("페이지 보기", "View pages"), run: (trigger) => clarity.open("pages", trigger) },
        { id: "assets", label: bt("소재 찾기", "Find assets"), run: () => { clarity.close(); preloadStudioAssetToolPopoverBody(); s.setMenu("asset"); } },
        { id: "export", label: bt("원고 내보내기", "Export draft"), run: () => { clarity.close(); s.setExportMenuOpen(true); } },
        { id: "all", label: bt("전체 도구", "All tools"), run: (trigger) => { openInspector(); requestStudioAllTools(trigger); } },
        { id: "windows", label: bt("프로젝트·창 도구 보기", "Show project and window tools"), run: clarity.showSavedLayout },
        { id: "help", label: bt("사용 방법", "How to use"), run: () => openStudioHelpCenter({ section: "current-tool" }) },
      ]} />
      <StudioDocumentChromeSlot />
      <div className="studio-drawing-clarity-context-row"><p>{s.studioMenubarActivePageLabel}</p><div className="studio-drawing-clarity-context-actions"><StudioDrawingClarityHistory session={s} /><button type="button" data-studio-clarity-find-tools="true" className="studio-drawing-clarity-button" onClick={(event) => openSearch(event.currentTarget)}><Search size={18} aria-hidden /><span>{bt("도구 찾기", "Find tools")}</span></button></div></div>
    </header>
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
  return <nav className="studio-drawing-clarity-rail" aria-label={bt("기본 그리기", "Basic drawing")}>
    <StudioDrawingClarityCoreTools session={s} />
  </nav>;
}
