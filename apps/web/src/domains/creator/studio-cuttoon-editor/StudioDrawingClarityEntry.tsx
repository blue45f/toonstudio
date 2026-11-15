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
