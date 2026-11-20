import { X } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioMainMenu } from "../StudioMainMenu";
import { isStudioWorkMode, STUDIO_WORK_MODES, STUDIO_WORK_MODE_META } from "../studio-work-mode";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";
import { studioDrawingCommandDestination } from "./StudioDrawingClarityCommands";
import { useStudioDrawingClarity } from "./StudioDrawingClarityContext";
import { useStudioDrawingCommandPresentation } from "./useStudioDrawingCommandPresentation";
import "./StudioDrawingProjectTools.css";

export function StudioDrawingProjectTools({ session: s, children }: {
  readonly session: StudioCuttoonEditorViewSession;
  readonly children?: ReactNode;
}) {
  const bt = useBilingual("studio.drawingClarity");
  const stackViewTools = useMediaQuery("(width < 48rem)");
  const close = useStudioDrawingClarity()?.close;
  const presentation = useStudioDrawingCommandPresentation(s, s.isMobile);
  const groups = useMemo(() => s.studioMainMenuGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      if (!presentation || item.disabled || item.keepOpenOnSelect) return item;
      const reveal = studioDrawingCommandDestination(item.commandId, presentation);
      return { ...item, onSelect: () => { (reveal ?? close)?.(); item.onSelect(); } };
    }),
  })), [s.studioMainMenuGroups, presentation, close]);
  return (
    <section id="studio-drawing-clarity-panel-commands" data-studio-drawing-project-tools="true"
      data-studio-shortcut-boundary="true" aria-labelledby="studio-project-tools-heading" className="studio-drawing-project-tools">
      <header className="studio-drawing-clarity-pane-heading">
        <h2 id="studio-project-tools-heading" tabIndex={-1} data-clarity-pane-heading>{bt("프로젝트·창 도구", "Project and window tools")}</h2>
        <button type="button" aria-label={bt("프로젝트 도구 닫기", "Close project tools")} onClick={close}><X size={18} aria-hidden /></button>
      </header>
      {stackViewTools && <div id="studio-project-view-tools-slot" />}
      <label className="studio-project-tools-stage">
        {bt("작업 단계", "Production stage")}
        <select value={s.workMode ?? "all"} onChange={(event) => { if (isStudioWorkMode(event.target.value)) s.setWorkMode(event.target.value); }}>
          {STUDIO_WORK_MODES.map((mode) => <option key={mode} value={mode}>{bt(STUDIO_WORK_MODE_META[mode].labelKo, STUDIO_WORK_MODE_META[mode].labelEn)}</option>)}
        </select>
      </label>
      <StudioMainMenu groups={groups} presentation="panel" className="studio-project-tools-menus" ariaLabel={bt("프로젝트 메뉴", "Project menus")} />
      {children}
    </section>
  );
}
