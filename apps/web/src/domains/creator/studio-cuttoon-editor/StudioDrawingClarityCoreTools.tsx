import { Redo2, Undo2 } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { ComponentProps } from "react";
import { StudioToolArtwork } from "../studio-tool-art/StudioToolArtwork";
import { drawingCommandShortcut, type DrawingCommandSettings } from "./studio-drawing-command-shortcut";
import type { StudioDrawingClarityPanel } from "./StudioDrawingClarityContext";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

export type StudioDrawingClarityCoreSession = Pick<StudioCuttoonEditorViewSession,
  "activeSurfaceReviewLocked" | "pageEditLocked" | "canvasInteractionBlocked" | "scopedCanvasDrawingAvailable"
  | "tool" | "drawMode" | "activatePrimaryCanvasTool" | "colorWheelOpen" | "setColorWheelOpen" | "color"
  | "menuEditUndoDisabled" | "menuEditRedoDisabled">
  & {
    readonly appSettings?: DrawingCommandSettings;
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

function RailCommand({ shortcut, children, ...button }: ComponentProps<"button"> & {
  readonly shortcut: ReturnType<typeof drawingCommandShortcut>;
}) {
  const { keycap, ...description } = shortcut;
  return <button {...button} {...description}>{children}{keycap ? <kbd className="studio-drawing-rail-kbd" aria-hidden>{keycap}</kbd> : null}</button>;
}

/** 펜·지우개·색상 정본 계약과 웹툰 핵심 작업 레일(선택·채우기·컷·말풍선·3D·핀 댓글·전체 도구)을 연결한다. */
export function StudioDrawingClarityCoreTools({ session: s, onOpenLayers, v4Actions, pinnedHostRef }: {
  readonly session: StudioDrawingClarityCoreSession;
  readonly onOpenLayers?: (trigger: HTMLElement) => void;
  readonly v4Actions?: StudioDrawingClarityV4RailActions;
  readonly pinnedHostRef?: (host: HTMLDivElement | null) => void;
}) {
  const bt = useBilingual("studio.drawingClarity");
  const blocked = s.activeSurfaceReviewLocked || s.pageEditLocked || (s.canvasInteractionBlocked && s.scopedCanvasDrawingAvailable !== true);
  const placingPin = Boolean(s.commentPinArmed || s.commentPlacementActive);
  const filling = !placingPin && Boolean(s.advancedFillArmed);
  const primaryToolActive = !placingPin && !filling;
  return <div className="studio-drawing-clarity-tools" role="toolbar" aria-orientation="vertical" aria-label={bt("그리기 도구", "Drawing tools")}>
        {v4Actions ? <RailCommand type="button" data-studio-rail-tool-id="select" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={primaryToolActive && s.tool === "select"}
          onClick={v4Actions.onSelectTool} shortcut={drawingCommandShortcut(s.appSettings, "tool-select", bt("선택", "Select"))}><StudioToolArtwork tool="select" /><span>{bt("선택", "Select")}</span></RailCommand> : null}
        <RailCommand type="button" data-studio-rail-tool-id="pen" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={primaryToolActive && s.tool === "draw" && s.drawMode === "pen"}
          onClick={() => s.activatePrimaryCanvasTool("draw", "pen")} shortcut={drawingCommandShortcut(s.appSettings, "tool-pen", bt("펜", "Pen"))}><StudioToolArtwork tool="pen" /><span>{bt("펜", "Pen")}</span></RailCommand>
        <RailCommand type="button" data-studio-rail-tool-id="eraser" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={primaryToolActive && s.tool === "draw" && s.drawMode === "eraser"}
          onClick={() => s.activatePrimaryCanvasTool("draw", "eraser")} shortcut={drawingCommandShortcut(s.appSettings, "tool-eraser", bt("지우개", "Eraser"))}><StudioToolArtwork tool="eraser" /><span>{bt("지우개", "Eraser")}</span></RailCommand>
        <button type="button" className="studio-drawing-clarity-button" disabled={blocked} aria-expanded={s.colorWheelOpen}
          onClick={() => s.setColorWheelOpen((value) => !value)}><span className="studio-drawing-color-tool"><StudioToolArtwork tool="color" /><span className="studio-drawing-clarity-swatch" style={{ backgroundColor: s.color }} aria-hidden /></span><span>{bt("색상", "Color")}</span></button>
        {onOpenLayers ? <button type="button" className="studio-drawing-clarity-button" aria-expanded={s.clarityPanel === "layers"} onClick={(event) => onOpenLayers(event.currentTarget)}><StudioToolArtwork tool="layers" /><span>{bt("레이어", "Layers")}</span></button> : null}
        {v4Actions ? <RailCommand type="button" data-studio-rail-tool-id="fill" className="studio-drawing-clarity-button" disabled={blocked} aria-pressed={filling}
          onClick={(event) => v4Actions.onOpenFill(event.currentTarget)} shortcut={drawingCommandShortcut(s.appSettings, "tool-fill", bt("채우기·틈 닫기", "Fill"))}><StudioToolArtwork tool="fill" /><span>{bt("채우기", "Fill")}</span></RailCommand> : null}
        {v4Actions ? <>
          <button type="button" data-studio-rail-tool-id="cut-split" className="studio-drawing-clarity-button" disabled={blocked} aria-expanded={s.clarityPanel === "pages"}
            onClick={(event) => v4Actions.onOpenCutSplit(event.currentTarget)} title={bt("컷 분할·프레임", "Cut frame")}><StudioToolArtwork tool="frame" /><span>{bt("컷 분할", "Cuts")}</span></button>
          <button type="button" data-studio-rail-tool-id="bubble" className="studio-drawing-clarity-button" disabled={blocked} aria-haspopup="dialog"
            onClick={(event) => v4Actions.onOpenBubble(event.currentTarget)} title={bt("말풍선·대사", "Speech bubble")}><StudioToolArtwork tool="bubble" /><span>{bt("말풍선", "Bubble")}</span></button>
          <button type="button" data-studio-rail-tool-id="bg3d" className="studio-drawing-clarity-button" aria-expanded={Boolean(s.bg3dOpen)}
            onClick={v4Actions.onToggleBg3d} title={bt("3D 배경·캐릭터 배치", "3D stage")}><StudioToolArtwork tool="bg3d" /><span>{bt("3D 배경", "3D")}</span></button>
          <RailCommand type="button" data-studio-rail-tool-id="pin-comment" className="studio-drawing-clarity-button" aria-pressed={placingPin}
            onClick={v4Actions.onPlacePinComment} shortcut={drawingCommandShortcut(s.appSettings, "tool-comment", bt("좌표 핀 댓글", "Pin comment"))}><StudioToolArtwork tool="pin" /><span>{bt("핀 댓글", "Pin")}</span></RailCommand>
        </> : null}
        {pinnedHostRef ? <div ref={pinnedHostRef} role="group" className="studio-drawing-pinned-tools" aria-label={bt("고정한 도구", "Pinned tools")} /> : null}
        {v4Actions ? <button type="button" data-studio-rail-all-tools="true" className="studio-drawing-clarity-button studio-drawing-clarity-all-tools-btn" aria-haspopup="dialog"
          onClick={(event) => v4Actions.onOpenAllTools(event.currentTarget)} title={bt("전체 도구 35종 한눈에 열기", "Open all 35 tools")}><StudioToolArtwork tool="tools" /><span>{bt("전체 도구", "All tools")}</span></button> : null}
        <span id="studio-drawing-clarity-desktop-more-slot" className="studio-drawing-clarity-more-slot" />
      </div>;
}

/** PC 기록 명령은 기존 메뉴 권위를 사용하고 모바일은 원래 도크 버튼을 옮겨 쓴다. */
export function StudioDrawingClarityHistory({ session: s }: { readonly session: StudioDrawingClarityCoreSession }) {
  const bt = useBilingual("studio.drawingClarity");
  const undoCaption = bt("되돌리기", "Undo"), undoPurpose = bt("실행취소", "Undo");
  const redoCaption = bt("다시", "Redo"), redoPurpose = bt("다시실행", "Redo");
  const { title: undoTitle, "aria-keyshortcuts": undoKeys } = drawingCommandShortcut(s.appSettings, "undo", undoCaption);
  const { title: redoTitle, "aria-keyshortcuts": redoKeys } = drawingCommandShortcut(s.appSettings, "redo", redoCaption);
  return <div className="studio-drawing-clarity-history" role="toolbar" aria-label={bt("편집 기록", "Edit history")}>
    <button type="button" className="studio-drawing-clarity-button" disabled={s.menuEditUndoDisabled} onClick={s.studioMenubarContentHandlers.undo}
          aria-label={undoCaption === undoPurpose ? undoCaption : `${undoCaption} · ${undoPurpose}`} title={undoTitle} aria-keyshortcuts={undoKeys}><Undo2 size={19} aria-hidden /><span>{undoCaption}</span></button>
        <button type="button" className="studio-drawing-clarity-button" disabled={s.menuEditRedoDisabled} onClick={s.studioMenubarContentHandlers.redo}
          title={redoTitle} aria-keyshortcuts={redoKeys} aria-label={redoCaption === redoPurpose ? redoCaption : `${redoCaption} · ${redoPurpose}`}><Redo2 size={19} aria-hidden /><span>{redoCaption}</span></button>
      </div>;
}
