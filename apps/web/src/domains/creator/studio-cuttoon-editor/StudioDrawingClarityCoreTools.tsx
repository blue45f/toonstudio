import { Eraser, Pencil, Redo2, Search, Undo2 } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

export type StudioDrawingClarityCoreSession = Pick<StudioCuttoonEditorViewSession,
  "activeSurfaceReviewLocked" | "pageEditLocked" | "canvasInteractionBlocked" | "scopedCanvasDrawingAvailable"
  | "tool" | "drawMode" | "activatePrimaryCanvasTool" | "colorWheelOpen" | "setColorWheelOpen" | "color"
  | "menuEditUndoDisabled" | "menuEditRedoDisabled">
  & { readonly studioMenubarContentHandlers: Pick<StudioCuttoonEditorViewSession["studioMenubarContentHandlers"], "undo" | "redo"> };

/** 기존 도구 전환과 통합 편집 기록의 명령만 호출한다. */
export function StudioDrawingClarityCoreTools({ session: s, onSearch }: {
  readonly session: StudioDrawingClarityCoreSession;
  readonly onSearch: (trigger: HTMLElement) => void;
}) {
  const bt = useBilingual("studio.drawingClarity");
  const undoCaption = bt("되돌리기", "Undo"), undoPurpose = bt("실행취소", "Undo");
  const redoCaption = bt("다시", "Redo"), redoPurpose = bt("다시실행", "Redo");
  const blocked = s.activeSurfaceReviewLocked || s.pageEditLocked || (s.canvasInteractionBlocked && s.scopedCanvasDrawingAvailable !== true);
  return <div className="studio-drawing-clarity-tools" role="toolbar" aria-label={bt("그리기 도구", "Drawing tools")}>
        <button type="button" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={s.tool === "draw" && s.drawMode !== "eraser"}
          onClick={() => s.activatePrimaryCanvasTool("draw", "pen")} title={bt("펜 · B", "Pen · B")}><Pencil size={19} aria-hidden /><span>{bt("펜", "Pen")}</span></button>
        <button type="button" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={s.tool === "draw" && s.drawMode === "eraser"}
          onClick={() => s.activatePrimaryCanvasTool("draw", "eraser")} title={bt("지우개 · E", "Eraser · E")}><Eraser size={19} aria-hidden /><span>{bt("지우개", "Eraser")}</span></button>
        <button type="button" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={s.colorWheelOpen}
          onClick={() => s.setColorWheelOpen((value) => !value)}><span className="studio-drawing-clarity-swatch" style={{ backgroundColor: s.color }} aria-hidden /><span>{bt("색상", "Color")}</span></button>
        <button type="button" className="studio-drawing-clarity-button" disabled={s.menuEditUndoDisabled} onClick={s.studioMenubarContentHandlers.undo}
          aria-label={undoCaption === undoPurpose ? undoCaption : `${undoCaption} · ${undoPurpose}`} title={`${undoCaption} · Ctrl/⌘ Z`}><Undo2 size={19} aria-hidden /><span>{undoCaption}</span></button>
        <button type="button" className="studio-drawing-clarity-button" disabled={s.menuEditRedoDisabled} onClick={s.studioMenubarContentHandlers.redo}
          aria-label={redoCaption === redoPurpose ? redoCaption : `${redoCaption} · ${redoPurpose}`}><Redo2 size={19} aria-hidden /><span>{redoCaption}</span></button>
        <button type="button" data-studio-clarity-find-tools="true" className="studio-drawing-clarity-button" onClick={(event) => onSearch(event.currentTarget)}><Search size={19} aria-hidden /><span>{bt("도구 찾기", "Find tools")}</span></button>
      </div>;
}
