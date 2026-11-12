import { Brush, Download, HelpCircle, Layers3, MoreHorizontal, PanelRight, Pencil, Search, X } from "lucide-react";
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
import { StudioDrawingClarityCoreTools } from "./StudioDrawingClarityCoreTools";
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
  const [moreOpen, setMoreOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
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
  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const escape = (event: KeyboardEvent) => {
      if (!details.open || event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault(); event.stopPropagation(); setMoreOpen(false); moreRef.current?.focus();
    };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !details.contains(event.target)) setMoreOpen(false); };
    details.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => { details.removeEventListener("keydown", escape); document.removeEventListener("pointerdown", outside); };
  }, []);
  if (!clarity) return null;
  const closeMore = () => { setMoreOpen(false); moreRef.current?.focus({ preventScroll: true }); };
  const openSearch = (trigger: HTMLElement) => {
    clarity.reveal("layers", trigger);
    setNotice(requestStudioCommandSearch({ scope: "all" }) ? "" : bt("검색을 준비하고 있어요. 다시 눌러 주세요.", "Search is getting ready. Please try again."));
  };
  return <>
    <header id="studio-menubar" role="region" tabIndex={-1} aria-label={bt("드로잉 도구와 저장", "Drawing tools and save")}
      data-studio-app-menubar="true" data-studio-drawing-clarity-header="true" className="studio-drawing-clarity-header">
      <StudioEditorReturnButton variant="lane" onReturn={returnFromStudioEditorInBrowser} />
      <div className="studio-drawing-clarity-title"><h1 title={s.title}>{s.title.trim() || bt("제목 없는 원고", "Untitled draft")}</h1><p>{s.studioMenubarActivePageLabel}</p></div>
      <StudioDrawingClarityCoreTools session={s} onSearch={openSearch} />
      <StudioDocumentChromeSlot />
      <StudioDrawingClaritySaveButton session={s} />
      <details ref={detailsRef} open={moreOpen} className="studio-drawing-clarity-more" onToggle={(event) => setMoreOpen(event.currentTarget.open)}><summary ref={moreRef} aria-expanded={moreOpen} aria-controls="studio-drawing-clarity-more-menu" aria-label={bt("작업 설정과 도움말", "Work settings and help")} onClick={(event) => { event.preventDefault(); setMoreOpen((open) => !open); }}><MoreHorizontal size={21} aria-hidden /></summary>
        <div id="studio-drawing-clarity-more-menu" hidden={!moreOpen} className="studio-drawing-clarity-menu">
          <button type="button" onClick={() => { closeMore(); openStudioHelpCenter({ section: "recovery" }); }}>{bt("저장·복구 확인", "Check save and recovery")}</button>
          <button type="button" onClick={(event) => { closeMore(); openInspector(); requestStudioAllTools(moreRef.current ?? event.currentTarget); }}>{bt("전체 도구", "All tools")}</button>
          <button type="button" onClick={clarity.showSavedLayout}>{bt("내 작업 배치 보기", "Show my workspace")}</button>
          <button type="button" onClick={() => { closeMore(); openStudioHelpCenter({ section: "current-tool" }); }}>{bt("사용 방법", "How to use")}</button>
        </div>
      </details>
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
  return <nav className="studio-drawing-clarity-rail" aria-label={bt("작업 도구함", "Work panels")}>
    <button type="button" data-studio-clarity-open="layers" aria-expanded={clarity.panel === "layers"} aria-controls="studio-drawing-clarity-panel-layers" onClick={(event) => { clarity.open("layers", event.currentTarget); s.studioMobileEditingDockHandlers.openInspectorRoute({ primary: "layers" }); }}><Layers3 size={22} aria-hidden /><span>{bt("레이어", "Layers")}</span></button>
    <button type="button" data-studio-clarity-open="brush" aria-expanded={clarity.panel === "brush"} aria-controls="studio-drawing-clarity-panel-brush" onClick={(event) => clarity.open("brush", event.currentTarget)}><Brush size={22} aria-hidden /><span>{bt("브러시", "Brushes")}</span></button>
    <button type="button" data-studio-clarity-open="pages" aria-expanded={clarity.panel === "pages"} aria-controls="studio-drawing-clarity-panel-pages" onClick={(event) => clarity.open("pages", event.currentTarget)}><PanelRight size={22} aria-hidden /><span>{bt("페이지", "Pages")}</span></button>
    <button type="button" aria-haspopup="dialog" onClick={() => { clarity.close(); preloadStudioAssetToolPopoverBody(); s.setMenu("asset"); }}><Search size={22} aria-hidden /><span>{bt("소재", "Assets")}</span></button>
    <button type="button" data-studio-clarity-export-trigger="true" aria-haspopup="dialog" aria-expanded={s.exportMenuOpen} onClick={() => { clarity.close(); s.setExportMenuOpen((open) => !open); }}><Download size={22} aria-hidden /><span>{bt("출력", "Export")}</span></button>
    <button type="button" className="mt-auto" onClick={() => openStudioHelpCenter({ section: "current-tool" })}><HelpCircle size={22} aria-hidden /><span>{bt("사용 방법", "Help")}</span></button>
  </nav>;
}
