import { MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioEditorReturnButton } from "../StudioEditorReturnButton";
import { returnFromStudioEditorInBrowser } from "../studio-editor-return-navigation";
import { StudioDocumentChromeSlot } from "../studio-shell/StudioDocumentChromeSlot";
import { installStudioCommandExecutionBindings } from "../studio-command-execution-registry";
import { requestStudioAllTools } from "../studio-toolbar-channel";
import { preloadStudioAssetToolPopoverBody } from "../studio-tool-belt-lazy-ui";
import { createStudioDrawingClarityCommandBindings } from "./StudioDrawingClarityCommands";
import { StudioDrawingClaritySaveButton, type StudioDrawingClaritySaveSession } from "./StudioDrawingClaritySaveButton";
import { StudioDrawingClarityMobileHelp } from "./StudioDrawingClarityMobileHelp";
import { useStudioDrawingClarity } from "./StudioDrawingClarityContext";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

export type StudioDrawingClarityMobileSession = StudioDrawingClaritySaveSession & Pick<StudioCuttoonEditorViewSession,
  "title" | "studioMenubarActivePageLabel" | "studioMainMenuGroups" | "setMobileSheet" | "setMenu"
  | "setExportMenuOpen" | "setTeamPanelOpen" | "setTutorialHubOpen" | "appSettings">
  & { readonly studioMobileEditingDockHandlers: Pick<StudioCuttoonEditorViewSession["studioMobileEditingDockHandlers"], "openInspectorRoute"> };

/** 하단 도구·모바일 시트는 그대로 두고 문서와 실제 저장 상태만 먼저 표시한다. */
export function StudioDrawingClarityMobileBar({ session: s }: { readonly session: StudioDrawingClarityMobileSession }) {
  const clarity = useStudioDrawingClarity(), bt = useBilingual("studio.drawingClarity");
  const detailsRef = useRef<HTMLDetailsElement>(null), moreRef = useRef<HTMLElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const showSavedLayout = clarity?.showSavedLayout;
  const openInspector = useCallback(() => s.studioMobileEditingDockHandlers.openInspectorRoute({ primary: "layers" }, "props"), [s.studioMobileEditingDockHandlers]);
  useEffect(() => {
    if (!showSavedLayout) return;
    return installStudioCommandExecutionBindings(createStudioDrawingClarityCommandBindings(s.studioMainMenuGroups, { showSavedLayout, openInspector }));
  }, [s.studioMainMenuGroups, showSavedLayout, openInspector]);
  const closeMore = () => { setMoreOpen(false); moreRef.current?.focus({ preventScroll: true }); };
  const closeHelp = () => { setHelpOpen(false); moreRef.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !details.open) return;
      event.preventDefault(); event.stopPropagation(); setMoreOpen(false); moreRef.current?.focus({ preventScroll: true });
    };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !details.contains(event.target)) setMoreOpen(false); };
    details.addEventListener("keydown", escape); document.addEventListener("pointerdown", outside);
    return () => { details.removeEventListener("keydown", escape); document.removeEventListener("pointerdown", outside); };
  }, []);
  if (!clarity) return null;
  return <>
    <header id="studio-menubar" role="region" tabIndex={-1} aria-label={bt("원고와 저장", "Draft and save")}
      data-studio-app-menubar="true" data-studio-drawing-clarity-header="true" data-studio-drawing-clarity-mobile-header="true"
      className="studio-drawing-clarity-header studio-drawing-clarity-mobile-header">
      <StudioEditorReturnButton variant="lane" onReturn={returnFromStudioEditorInBrowser} />
      <div className="studio-drawing-clarity-title"><h1 title={s.title}>{s.title.trim() || bt("제목 없는 원고", "Untitled draft")}</h1><p>{s.studioMenubarActivePageLabel}</p></div>
      <StudioDrawingClaritySaveButton session={s} />
      <details ref={detailsRef} open={moreOpen} className="studio-drawing-clarity-more" onToggle={(event) => setMoreOpen(event.currentTarget.open)}><summary ref={moreRef} data-studio-clarity-export-trigger="true" aria-expanded={moreOpen} aria-controls="studio-drawing-clarity-mobile-menu" aria-label={bt("도구와 도움말", "Tools and help")} onClick={(event) => { event.preventDefault(); setMoreOpen((open) => !open); }}><MoreHorizontal size={21} aria-hidden /></summary>
        <div id="studio-drawing-clarity-mobile-menu" hidden={!moreOpen} className="studio-drawing-clarity-menu">
          <button type="button" onClick={() => { closeMore(); s.setMobileSheet("pages"); }}>{bt("페이지 보기", "View pages")}</button>
          <button type="button" onClick={() => { closeMore(); openInspector(); }}>{bt("레이어·속성 보기", "View layers and properties")}</button>
          <button type="button" onClick={() => { closeMore(); s.setMobileSheet(null); preloadStudioAssetToolPopoverBody(); s.setMenu("asset"); }}>{bt("소재 찾기", "Find assets")}</button>
          <button type="button" onClick={() => { closeMore(); s.setMobileSheet(null); s.setExportMenuOpen(true); }}>{bt("원고 내보내기", "Export draft")}</button>
          <button type="button" onClick={(event) => { closeMore(); s.setMobileSheet(null); requestStudioAllTools(moreRef.current ?? event.currentTarget); }}>{bt("전체 도구", "All tools")}</button>
          <button type="button" onClick={() => { closeMore(); clarity.showSavedLayout(); s.setTeamPanelOpen(true); }}>{bt("함께 작업", "Work together")}</button>
          <button type="button" onClick={() => { closeMore(); clarity.showSavedLayout(); }}>{bt("프로젝트·창 도구 보기", "Show project and window tools")}</button>
          <button type="button" onClick={() => { closeMore(); setHelpOpen(true); }}>{bt("그리기·손가락 안내", "Drawing and touch guide")}</button>
        </div>
      </details>
      <StudioDocumentChromeSlot />
    </header>
    {helpOpen ? <StudioDrawingClarityMobileHelp touch={s.appSettings.touch} onClose={closeHelp} onTutorial={() => { setHelpOpen(false); s.setTutorialHubOpen(true); }} /> : null}
  </>;
}
