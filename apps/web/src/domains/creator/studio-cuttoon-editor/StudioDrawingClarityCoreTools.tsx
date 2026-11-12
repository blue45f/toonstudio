import { Eraser, Layers, Pencil, Redo2, Undo2 } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

export type StudioDrawingClarityCoreSession = Pick<StudioCuttoonEditorViewSession,
  "activeSurfaceReviewLocked" | "pageEditLocked" | "canvasInteractionBlocked" | "scopedCanvasDrawingAvailable"
  | "tool" | "drawMode" | "activatePrimaryCanvasTool" | "colorWheelOpen" | "setColorWheelOpen" | "color"
  | "menuEditUndoDisabled" | "menuEditRedoDisabled">
  & { readonly studioMenubarContentHandlers: Pick<StudioCuttoonEditorViewSession["studioMenubarContentHandlers"], "undo" | "redo"> };

/** 펜·지우개·색상과 같은 위치의 더보기만 먼저 보여 준다. */
export function StudioDrawingClarityCoreTools({ session: s, onOpenLayers }: {
  readonly session: StudioDrawingClarityCoreSession;
  readonly onOpenLayers?: (trigger: HTMLElement) => void;
}) {
  const bt = useBilingual("studio.drawingClarity");
  const blocked = s.activeSurfaceReviewLocked || s.pageEditLocked || (s.canvasInteractionBlocked && s.scopedCanvasDrawingAvailable !== true);
  return <div className="studio-drawing-clarity-tools" role="toolbar" aria-label={bt("그리기 도구", "Drawing tools")}>
        <button type="button" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={s.tool === "draw" && s.drawMode !== "eraser"}
          onClick={() => s.activatePrimaryCanvasTool("draw", "pen")} title={bt("펜 · B", "Pen · B")}><Pencil size={19} aria-hidden /><span>{bt("펜", "Pen")}</span></button>
        <button type="button" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={s.tool === "draw" && s.drawMode === "eraser"}
          onClick={() => s.activatePrimaryCanvasTool("draw", "eraser")} title={bt("지우개 · E", "Eraser · E")}><Eraser size={19} aria-hidden /><span>{bt("지우개", "Eraser")}</span></button>
        <button type="button" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={s.colorWheelOpen}
          onClick={() => s.setColorWheelOpen((value) => !value)}><span className="studio-drawing-clarity-swatch" style={{ backgroundColor: s.color }} aria-hidden /><span>{bt("색상", "Color")}</span></button>
        {onOpenLayers ? <button type="button" className="studio-drawing-clarity-button" onClick={(event) => onOpenLayers(event.currentTarget)}><Layers size={19} aria-hidden /><span>{bt("레이어", "Layers")}</span></button> : null}
        <span id="studio-drawing-clarity-desktop-more-slot" className="studio-drawing-clarity-more-slot" />
      </div>;
}

/** PC 기록 명령은 기존 메뉴 권위를 사용하고 모바일은 원래 도크 버튼을 옮겨 쓴다. */
export function StudioDrawingClarityHistory({ session: s }: { readonly session: StudioDrawingClarityCoreSession }) {
  const bt = useBilingual("studio.drawingClarity");
  const undoCaption = bt("되돌리기", "Undo"), undoPurpose = bt("실행취소", "Undo");
  const redoCaption = bt("다시", "Redo"), redoPurpose = bt("다시실행", "Redo");
  return <div className="studio-drawing-clarity-history" role="toolbar" aria-label={bt("편집 기록", "Edit history")}>
    <button type="button" className="studio-drawing-clarity-button" disabled={s.menuEditUndoDisabled} onClick={s.studioMenubarContentHandlers.undo}
          aria-label={undoCaption === undoPurpose ? undoCaption : `${undoCaption} · ${undoPurpose}`} title={`${undoCaption} · Ctrl/⌘ Z`}><Undo2 size={19} aria-hidden /><span>{undoCaption}</span></button>
        <button type="button" className="studio-drawing-clarity-button" disabled={s.menuEditRedoDisabled} onClick={s.studioMenubarContentHandlers.redo}
          aria-label={redoCaption === redoPurpose ? redoCaption : `${redoCaption} · ${redoPurpose}`}><Redo2 size={19} aria-hidden /><span>{redoCaption}</span></button>
      </div>;
}
