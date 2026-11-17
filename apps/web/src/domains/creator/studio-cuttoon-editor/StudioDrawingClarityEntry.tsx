import { Pencil } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useStudioDrawingClarity } from "./StudioDrawingClarityContext";

import "./StudioDrawingClarity.css";

export function StudioDrawingClarityEntry() {
  const clarity = useStudioDrawingClarity(), bt = useBilingual("studio.drawingClarity");
  if (!clarity?.available || clarity.active) return null;
  return (
    <button
      type="button"
      data-studio-clarity-entry="true"
      className="studio-drawing-clarity-button shrink-0"
      onClick={clarity.chooseSimple}
    >
      <Pencil size={18} aria-hidden />
      {bt("간단한 그리기", "Simple drawing")}
    </button>
  );
}

export function StudioDrawingClarityBarFallback({ title }: { readonly title: string }) {
  const bt = useBilingual("studio.drawingClarity");
  const resolvedTitle = title.trim() || bt("제목 없는 원고", "Untitled draft");
  return (
    <>
      <header
        id="studio-menubar"
        role="region"
        aria-label={bt("드로잉 도구와 저장", "Drawing tools and save")}
        data-studio-app-menubar="true"
        data-studio-drawing-clarity-header="true"
        data-studio-menubar-loading="true"
        className="studio-drawing-clarity-header"
      >
        <div className="studio-drawing-clarity-title">
          <h1 title={title}>{resolvedTitle}</h1>
          <div id="studio-document-chrome-slot" data-studio-document-chrome-slot="true" />
        </div>
      </header>
      <div aria-hidden="true" className="studio-drawing-clarity-context-row" />
    </>
  );
}
