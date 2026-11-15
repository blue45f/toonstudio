import { Box, Eraser, Grid2x2, Layers, MessageSquarePlus, MessageSquareText, MousePointer2, PaintBucket, Pencil, Redo2, ScissorsSquare, Undo2 } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioDrawingClarityPanel } from "./StudioDrawingClarityContext";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

export type StudioDrawingClarityCoreSession = Pick<StudioCuttoonEditorViewSession,
  "activeSurfaceReviewLocked" | "pageEditLocked" | "canvasInteractionBlocked" | "scopedCanvasDrawingAvailable"
  | "tool" | "drawMode" | "activatePrimaryCanvasTool" | "colorWheelOpen" | "setColorWheelOpen" | "color"
  | "menuEditUndoDisabled" | "menuEditRedoDisabled">
  & {
    readonly bg3dOpen?: boolean;
    readonly advancedFillActive?: boolean;
    readonly advancedFillArmed?: boolean;
    readonly commentPinArmed?: boolean;
    readonly commentPlacementActive?: boolean;
    readonly clarityPanel?: StudioDrawingClarityPanel | null;
    readonly studioMenubarContentHandlers: Pick<StudioCuttoonEditorViewSession["studioMenubarContentHandlers"], "undo" | "redo">;
  };

export interface StudioDrawingClarityV4RailActions {
  readonly onSelectTool: () => void;
  readonly onOpenFill: (trigger: HTMLElement) => void;
  readonly onOpenCutSplit: (trigger: HTMLElement) => void;
  readonly onOpenBubble: (trigger: HTMLElement) => void;
  readonly onToggleBg3d: () => void;
  readonly onPlacePinComment: () => void;
  readonly onOpenAllTools: (trigger: HTMLElement) => void;
}

/** 펜·지우개·색상 정본 계약과 웹툰 핵심 작업 레일(선택·채우기·컷·말풍선·3D·핀 댓글·전체 도구)을 연결한다. */
export function StudioDrawingClarityCoreTools({ session: s, onOpenLayers, v4Actions }: {
  readonly session: StudioDrawingClarityCoreSession;
  readonly onOpenLayers?: (trigger: HTMLElement) => void;
  readonly v4Actions?: StudioDrawingClarityV4RailActions;
}) {
  const bt = useBilingual("studio.drawingClarity");
  const blocked = s.activeSurfaceReviewLocked || s.pageEditLocked || (s.canvasInteractionBlocked && s.scopedCanvasDrawingAvailable !== true);
  return <div className="studio-drawing-clarity-tools" role="toolbar" aria-label={bt("그리기 도구", "Drawing tools")}>
        {v4Actions ? <button type="button" data-studio-rail-tool-id="select" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={s.tool === "select"}
          onClick={v4Actions.onSelectTool} title={bt("선택 · V", "Select · V")}><MousePointer2 size={18} aria-hidden /><span>{bt("선택", "Select")}</span><kbd className="studio-drawing-rail-kbd" aria-hidden="true">V</kbd></button> : null}
        <button type="button" data-studio-rail-tool-id="pen" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={s.tool === "draw" && s.drawMode !== "eraser"}
          onClick={() => s.activatePrimaryCanvasTool("draw", "pen")} title={bt("펜 · B", "Pen · B")}><Pencil size={18} aria-hidden /><span>{bt("펜", "Pen")}</span>{v4Actions ? <kbd className="studio-drawing-rail-kbd" aria-hidden="true">B</kbd> : null}</button>
        {v4Actions ? <button type="button" data-studio-rail-tool-id="fill" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={Boolean(s.advancedFillActive || s.advancedFillArmed)}
          onClick={(event) => v4Actions.onOpenFill(event.currentTarget)} title={bt("채우기·틈 닫기 · G", "Fill · G")}><PaintBucket size={18} aria-hidden /><span>{bt("채우기", "Fill")}</span><kbd className="studio-drawing-rail-kbd" aria-hidden="true">G</kbd></button> : null}
        <button type="button" data-studio-rail-tool-id="eraser" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={s.tool === "draw" && s.drawMode === "eraser"}
          onClick={() => s.activatePrimaryCanvasTool("draw", "eraser")} title={bt("지우개 · E", "Eraser · E")}><Eraser size={18} aria-hidden /><span>{bt("지우개", "Eraser")}</span>{v4Actions ? <kbd className="studio-drawing-rail-kbd" aria-hidden="true">E</kbd> : null}</button>
        <button type="button" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={s.colorWheelOpen}
          onClick={() => s.setColorWheelOpen((value) => !value)}><span className="studio-drawing-clarity-swatch" style={{ backgroundColor: s.color }} aria-hidden /><span>{bt("색상", "Color")}</span></button>
        {v4Actions ? <>
          <button type="button" data-studio-rail-tool-id="cut-split" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={s.clarityPanel === "pages"}
            onClick={(event) => v4Actions.onOpenCutSplit(event.currentTarget)} title={bt("컷 분할·프레임 · C", "Cut frame · C")}><ScissorsSquare size={18} aria-hidden /><span>{bt("컷 분할", "Cuts")}</span><kbd className="studio-drawing-rail-kbd" aria-hidden="true">C</kbd></button>
          <button type="button" data-studio-rail-tool-id="bubble" className="studio-drawing-clarity-button" disabled={blocked} aria-haspopup="dialog"
            onClick={(event) => v4Actions.onOpenBubble(event.currentTarget)} title={bt("말풍선·대사 · T", "Speech bubble · T")}><MessageSquareText size={18} aria-hidden /><span>{bt("말풍선", "Bubble")}</span><kbd className="studio-drawing-rail-kbd" aria-hidden="true">T</kbd></button>
          <button type="button" className="studio-drawing-clarity-button" aria-pressed={Boolean(s.bg3dOpen)}
            onClick={v4Actions.onToggleBg3d} title={bt("3D 배경·캐릭터 배치 · 3", "3D stage · 3")}><Box size={18} aria-hidden /><span>{bt("3D 배경", "3D")}</span><kbd className="studio-drawing-rail-kbd" aria-hidden="true">3</kbd></button>
          <button type="button" data-studio-rail-tool-id="pin-comment" className="studio-drawing-clarity-button" aria-pressed={Boolean(s.commentPinArmed || s.commentPlacementActive)}
            onClick={v4Actions.onPlacePinComment} title={bt("좌표 핀 댓글 · M", "Pin comment · M")}><MessageSquarePlus size={18} aria-hidden /><span>{bt("핀 댓글", "Pin")}</span><kbd className="studio-drawing-rail-kbd" aria-hidden="true">M</kbd></button>
        </> : null}
        {onOpenLayers ? <button type="button" className="studio-drawing-clarity-button" aria-pressed={s.clarityPanel === "layers"} onClick={(event) => onOpenLayers(event.currentTarget)}><Layers size={18} aria-hidden /><span>{bt("레이어", "Layers")}</span></button> : null}
        {v4Actions ? <button type="button" data-studio-rail-all-tools="true" className="studio-drawing-clarity-button studio-drawing-clarity-all-tools-btn" aria-haspopup="dialog"
          onClick={(event) => v4Actions.onOpenAllTools(event.currentTarget)} title={bt("전체 도구 35종 한눈에 열기", "Open all 35 tools")}><Grid2x2 size={18} aria-hidden /><span>{bt("전체 도구", "All tools")}</span></button> : null}
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
