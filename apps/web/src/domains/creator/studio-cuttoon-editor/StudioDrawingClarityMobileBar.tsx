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
import { StudioDrawingClarityMore } from "./StudioDrawingClarityMore";
import { StudioDrawingClarityReceipt } from "./StudioDrawingClarityReceipt";
import { useStudioDrawingClarity } from "./StudioDrawingClarityContext";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

export type StudioDrawingClarityMobileSession = StudioDrawingClaritySaveSession & Pick<StudioCuttoonEditorViewSession,
  "title" | "studioMenubarActivePageLabel" | "studioMainMenuGroups" | "setMobileSheet" | "setMenu"
  | "setExportMenuOpen" | "setTeamPanelOpen" | "setTutorialHubOpen" | "appSettings" | "saveSyncStore">
  & { readonly studioMobileEditingDockHandlers: Pick<StudioCuttoonEditorViewSession["studioMobileEditingDockHandlers"], "openInspectorRoute"> };

/** 하단 도구·모바일 시트는 그대로 두고 문서와 실제 저장 상태만 먼저 표시한다. */
export function StudioDrawingClarityMobileBar({ session: s }: { readonly session: StudioDrawingClarityMobileSession }) {
  const clarity = useStudioDrawingClarity(), bt = useBilingual("studio.drawingClarity");
  const moreRef = useRef<HTMLElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const showSavedLayout = clarity?.showSavedLayout;
  const openInspector = useCallback(() => s.studioMobileEditingDockHandlers.openInspectorRoute({ primary: "layers" }, "props"), [s.studioMobileEditingDockHandlers]);
  useEffect(() => {
    if (!showSavedLayout) return;
    return installStudioCommandExecutionBindings(createStudioDrawingClarityCommandBindings(s.studioMainMenuGroups, { showSavedLayout, openInspector }));
  }, [s.studioMainMenuGroups, showSavedLayout, openInspector]);
  const closeHelp = () => { setHelpOpen(false); moreRef.current?.focus({ preventScroll: true }); };
  if (!clarity) return null;
  return <>
    <header id="studio-menubar" role="region" tabIndex={-1} aria-label={bt("원고와 저장", "Draft and save")}
      data-studio-app-menubar="true" data-studio-drawing-clarity-header="true" data-studio-drawing-clarity-mobile-header="true"
      className="studio-drawing-clarity-header studio-drawing-clarity-mobile-header">
      <StudioEditorReturnButton variant="lane" onReturn={returnFromStudioEditorInBrowser} />
      <div className="studio-drawing-clarity-title"><h1 title={s.title}>{s.title.trim() || bt("제목 없는 원고", "Untitled draft")}</h1><StudioDrawingClarityReceipt store={s.saveSyncStore} /></div>
      <StudioDrawingClaritySaveButton session={s} />
      <StudioDrawingClarityMore id="studio-drawing-clarity-mobile-menu" hostId="studio-drawing-clarity-mobile-more-slot" purpose={bt("도구와 도움말", "Tools and help")} triggerRef={moreRef} actions={[
        { id: "pages", label: bt("페이지 보기", "View pages"), run: () => s.setMobileSheet("pages") },
        { id: "layers", label: bt("레이어·속성 보기", "View layers and properties"), run: openInspector },
        { id: "assets", label: bt("소재 찾기", "Find assets"), run: () => { s.setMobileSheet(null); preloadStudioAssetToolPopoverBody(); s.setMenu("asset"); } },
        { id: "export", label: bt("원고 내보내기", "Export draft"), run: () => { s.setMobileSheet(null); s.setExportMenuOpen(true); } },
        { id: "all", label: bt("전체 도구", "All tools"), run: (trigger) => { s.setMobileSheet(null); requestStudioAllTools(trigger); } },
        { id: "team", label: bt("함께 작업", "Work together"), run: () => { clarity.showSavedLayout(); s.setTeamPanelOpen(true); } },
        { id: "windows", label: bt("프로젝트·창 도구 보기", "Show project and window tools"), run: clarity.showSavedLayout },
        { id: "help", label: bt("그리기·손가락 안내", "Drawing and touch guide"), run: () => setHelpOpen(true) },
      ]} />
      <StudioDocumentChromeSlot />
      <div className="studio-drawing-clarity-context-row"><p>{s.studioMenubarActivePageLabel}</p><div id="studio-drawing-clarity-history-slot" className="studio-drawing-clarity-history" role="toolbar" aria-label={bt("편집 기록", "Edit history")} /></div>
    </header>
    {helpOpen ? <StudioDrawingClarityMobileHelp touch={s.appSettings.touch} onClose={closeHelp} onTutorial={() => { setHelpOpen(false); s.setTutorialHubOpen(true); }} /> : null}
  </>;
}
