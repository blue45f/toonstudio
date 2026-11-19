import { useMemo } from "react";
import type { StudioDrawingCommandPresentation } from "./StudioDrawingClarityCommands";
import { useStudioDrawingClarity } from "./StudioDrawingClarityContext";
import type { StudioDrawingClarityMobileSession } from "./StudioDrawingClarityMobileBar";

export function useStudioDrawingCommandPresentation(
  session: Pick<StudioDrawingClarityMobileSession, "setMobileSheet" | "studioMobileEditingDockHandlers">,
  mobile: boolean,
): StudioDrawingCommandPresentation | null {
  const clarity = useStudioDrawingClarity();
  const { close, reveal, showSavedLayout } = clarity ?? {};
  const { setMobileSheet, studioMobileEditingDockHandlers } = session;
  return useMemo(() => {
    if (!close || !reveal || !showSavedLayout) return null;
    const openPanel = (panel: "layers" | "pages") => {
      if (mobile) {
        close();
        if (panel === "pages") setMobileSheet("pages");
        else studioMobileEditingDockHandlers.openInspectorRoute({ primary: "layers" }, "props");
      } else {
        const anchor = document.querySelector<HTMLElement>("[data-studio-clarity-more-trigger]") ?? document.body;
        reveal(panel, anchor);
      }
    };
    return {
      showSavedLayout,
      openInspector: () => openPanel("layers"),
      openPages: () => openPanel("pages"),
      closePanels: () => { close(); if (mobile) setMobileSheet(null); },
    };
  }, [close, reveal, showSavedLayout, mobile, setMobileSheet, studioMobileEditingDockHandlers]);
}
