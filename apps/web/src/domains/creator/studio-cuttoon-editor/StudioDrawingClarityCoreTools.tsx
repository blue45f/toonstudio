import { Redo2, Undo2 } from "lucide-react";
import { useId, type ComponentProps } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
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

function disabledTooltip(baseTitle: string | undefined, disabledReason: string | undefined): string | undefined {
  if (!disabledReason) return baseTitle;
  return baseTitle ? `${baseTitle} — ${disabledReason}` : disabledReason;
}

function RailCommand({
  shortcut,
  disabledReason,
  disabledReasonId,
  children,
  ...button
}: ComponentProps<"button"> & {
  readonly shortcut: ReturnType<typeof drawingCommandShortcut>;
  readonly disabledReason?: string;
  readonly disabledReasonId?: string;
}) {
  const { keycap, title, ...description } = shortcut;
  const resolvedTitle = button.disabled ? disabledTooltip(title, disabledReason) : title;
  return (
    <button
      {...button}
      {...description}
      title={resolvedTitle}
      aria-describedby={button.disabled && disabledReasonId ? disabledReasonId : button["aria-describedby"]}
      data-studio-disabled-reason={button.disabled && disabledReason ? disabledReason : undefined}
    >
      {children}
      {keycap ? <kbd className="studio-drawing-rail-kbd" aria-hidden>{keycap}</kbd> : null}
    </button>
  );
}

/** 9개 핵심 도구 그룹(선택·펜·지우개·색상·레이어·채우기·컷 분할·말풍선·3D 배경)과 검수·전체 도구 하단 레일을 연결한다. */
export function StudioDrawingClarityCoreTools({ session: s, onOpenLayers, v4Actions, pinnedHostRef }: {
  readonly session: StudioDrawingClarityCoreSession;
  readonly onOpenLayers?: (trigger: HTMLElement) => void;
  readonly v4Actions?: StudioDrawingClarityV4RailActions;
  readonly pinnedHostRef?: (host: HTMLDivElement | null) => void;
}) {
  const bt = useBilingual("studio.drawingClarity");
  const blockedReasonId = useId();
  const blocked = s.activeSurfaceReviewLocked || s.pageEditLocked || (s.canvasInteractionBlocked && s.scopedCanvasDrawingAvailable !== true);
  const blockedReason = s.activeSurfaceReviewLocked
    ? bt("검수 잠금 상태에서는 캔버스 도구를 사용할 수 없습니다", "Canvas tools are locked during review")
    : s.pageEditLocked
      ? bt("현재 페이지 편집이 잠겨 있어 도구를 사용할 수 없습니다", "Page editing is locked")
      : s.canvasInteractionBlocked && s.scopedCanvasDrawingAvailable !== true
        ? bt("현재 편집 권한이 잠겨 있어 캔버스 도구를 사용할 수 없습니다", "Canvas editing is currently locked")
        : undefined;
  const placingPin = Boolean(s.commentPinArmed || s.commentPlacementActive);
  const filling = !placingPin && Boolean(s.advancedFillArmed);
  const primaryToolActive = !placingPin && !filling;
  const colorTitle = bt("색상 선택", "Color picker");
  const cutTitle = bt("컷 분할·프레임", "Cut frame");
  const bubbleTitle = bt("말풍선·대사", "Speech bubble");

  return (
    <div
      className="studio-drawing-clarity-tools"
      role="toolbar"
      aria-orientation="vertical"
      aria-label={bt("그리기 도구", "Drawing tools")}
      data-studio-rail-group-count="9"
    >
      {v4Actions ? (
        <RailCommand
          type="button"
          data-studio-rail-tool-id="select"
          data-studio-rail-core-group="true"
          className="studio-drawing-clarity-button"
          disabled={blocked}
          disabledReason={blockedReason}
          disabledReasonId={blockedReasonId}
          aria-pressed={primaryToolActive && s.tool === "select"}
          onClick={v4Actions.onSelectTool}
          shortcut={drawingCommandShortcut(s.appSettings, "tool-select", bt("선택", "Select"))}
        >
          <StudioToolArtwork tool="select" />
          <span className="studio-drawing-rail-label">{bt("선택", "Select")}</span>
        </RailCommand>
      ) : null}
      <RailCommand
        type="button"
        data-studio-rail-tool-id="pen"
        data-studio-rail-core-group="true"
        className="studio-drawing-clarity-button"
        disabled={blocked}
        disabledReason={blockedReason}
        disabledReasonId={blockedReasonId}
        aria-pressed={primaryToolActive && s.tool === "draw" && s.drawMode === "pen"}
        onClick={() => s.activatePrimaryCanvasTool("draw", "pen")}
        shortcut={drawingCommandShortcut(s.appSettings, "tool-pen", bt("펜", "Pen"))}
      >
        <StudioToolArtwork tool="pen" />
        <span className="studio-drawing-rail-label">{bt("펜", "Pen")}</span>
      </RailCommand>
      <RailCommand
        type="button"
        data-studio-rail-tool-id="eraser"
        data-studio-rail-core-group="true"
        className="studio-drawing-clarity-button"
        disabled={blocked}
        disabledReason={blockedReason}
        disabledReasonId={blockedReasonId}
        aria-pressed={primaryToolActive && s.tool === "draw" && s.drawMode === "eraser"}
        onClick={() => s.activatePrimaryCanvasTool("draw", "eraser")}
        shortcut={drawingCommandShortcut(s.appSettings, "tool-eraser", bt("지우개", "Eraser"))}
      >
        <StudioToolArtwork tool="eraser" />
        <span className="studio-drawing-rail-label">{bt("지우개", "Eraser")}</span>
      </RailCommand>
      <button
        type="button"
        data-studio-rail-tool-id="color"
        data-studio-rail-core-group="true"
        className="studio-drawing-clarity-button"
        disabled={blocked}
        aria-expanded={s.colorWheelOpen}
        aria-describedby={blocked && blockedReason ? blockedReasonId : undefined}
        data-studio-disabled-reason={blocked && blockedReason ? blockedReason : undefined}
        title={blocked ? disabledTooltip(colorTitle, blockedReason) : colorTitle}
        onClick={() => s.setColorWheelOpen((value) => !value)}
      >
        <span className="studio-drawing-color-tool">
          <StudioToolArtwork tool="color" />
          <span className="studio-drawing-clarity-swatch" style={{ backgroundColor: s.color }} aria-hidden />
        </span>
        <span className="studio-drawing-rail-label">{bt("색상", "Color")}</span>
      </button>
      {onOpenLayers ? (
        <button
          type="button"
          data-studio-rail-tool-id="layers"
          data-studio-rail-core-group="true"
          className="studio-drawing-clarity-button"
          aria-expanded={s.clarityPanel === "layers"}
          title={bt("레이어·속성 패널 열기", "Open layers and properties")}
          onClick={(event) => onOpenLayers(event.currentTarget)}
        >
          <StudioToolArtwork tool="layers" />
          <span className="studio-drawing-rail-label">{bt("레이어", "Layers")}</span>
        </button>
      ) : null}
      {v4Actions ? (
        <RailCommand
          type="button"
          data-studio-rail-tool-id="fill"
          data-studio-rail-core-group="true"
          className="studio-drawing-clarity-button"
          disabled={blocked}
          disabledReason={blockedReason}
          disabledReasonId={blockedReasonId}
          aria-pressed={filling}
          onClick={(event) => v4Actions.onOpenFill(event.currentTarget)}
          shortcut={drawingCommandShortcut(s.appSettings, "tool-fill", bt("채우기·틈 닫기", "Fill"))}
        >
          <StudioToolArtwork tool="fill" />
          <span className="studio-drawing-rail-label">{bt("채우기", "Fill")}</span>
        </RailCommand>
      ) : null}
      {v4Actions ? (
        <>
          <button
            type="button"
            data-studio-rail-tool-id="cut-split"
            data-studio-rail-core-group="true"
            className="studio-drawing-clarity-button"
            disabled={blocked}
            aria-expanded={s.clarityPanel === "pages"}
            aria-describedby={blocked && blockedReason ? blockedReasonId : undefined}
            data-studio-disabled-reason={blocked && blockedReason ? blockedReason : undefined}
            onClick={(event) => v4Actions.onOpenCutSplit(event.currentTarget)}
            title={blocked ? disabledTooltip(cutTitle, blockedReason) : cutTitle}
          >
            <StudioToolArtwork tool="frame" />
            <span className="studio-drawing-rail-label">{bt("컷 분할", "Cuts")}</span>
          </button>
          <button
            type="button"
            data-studio-rail-tool-id="bubble"
            data-studio-rail-core-group="true"
            className="studio-drawing-clarity-button"
            disabled={blocked}
            aria-haspopup="dialog"
            aria-describedby={blocked && blockedReason ? blockedReasonId : undefined}
            data-studio-disabled-reason={blocked && blockedReason ? blockedReason : undefined}
            onClick={(event) => v4Actions.onOpenBubble(event.currentTarget)}
            title={blocked ? disabledTooltip(bubbleTitle, blockedReason) : bubbleTitle}
          >
            <StudioToolArtwork tool="bubble" />
            <span className="studio-drawing-rail-label">{bt("말풍선", "Bubble")}</span>
          </button>
          <button
            type="button"
            data-studio-rail-tool-id="bg3d"
            data-studio-rail-core-group="true"
            className="studio-drawing-clarity-button"
            aria-expanded={Boolean(s.bg3dOpen)}
            onClick={v4Actions.onToggleBg3d}
            title={bt("3D 배경·캐릭터 배치", "3D stage")}
          >
            <StudioToolArtwork tool="bg3d" />
            <span className="studio-drawing-rail-label">{bt("3D 배경", "3D")}</span>
          </button>
          <span role="separator" aria-orientation="horizontal" className="studio-drawing-rail-divider" />
          <RailCommand
            type="button"
            data-studio-rail-tool-id="pin-comment"
            className="studio-drawing-clarity-button"
            aria-pressed={placingPin}
            onClick={v4Actions.onPlacePinComment}
            shortcut={drawingCommandShortcut(s.appSettings, "tool-comment", bt("좌표 핀 댓글", "Pin comment"))}
          >
            <StudioToolArtwork tool="pin" />
            <span className="studio-drawing-rail-label">{bt("핀 댓글", "Pin")}</span>
          </RailCommand>
        </>
      ) : null}
      {pinnedHostRef ? <div ref={pinnedHostRef} role="group" className="studio-drawing-pinned-tools" aria-label={bt("고정한 도구", "Pinned tools")} /> : null}
      {v4Actions ? (
        <button
          type="button"
          data-studio-rail-all-tools="true"
          className="studio-drawing-clarity-button studio-drawing-clarity-all-tools-btn"
          aria-haspopup="dialog"
          onClick={(event) => v4Actions.onOpenAllTools(event.currentTarget)}
          title={bt("전체 도구 35종 한눈에 열기", "Open all 35 tools")}
        >
          <StudioToolArtwork tool="tools" />
          <span className="studio-drawing-rail-label">{bt("전체 도구", "All tools")}</span>
        </button>
      ) : null}
      <span id="studio-drawing-clarity-desktop-more-slot" className="studio-drawing-clarity-more-slot" />
      {blocked && blockedReason ? (
        <span id={blockedReasonId} className="sr-only" data-studio-disabled-reason-text="true">
          {blockedReason}
        </span>
      ) : null}
    </div>
  );
}

/** PC 기록 명령은 기존 메뉴 권위를 사용하고 모바일은 원래 도크 버튼을 옮겨 쓴다. */
export function StudioDrawingClarityHistory({ session: s }: { readonly session: StudioDrawingClarityCoreSession }) {
  const bt = useBilingual("studio.drawingClarity");
  const undoReasonId = useId();
  const redoReasonId = useId();
  const undoCaption = bt("되돌리기", "Undo"), undoPurpose = bt("실행취소", "Undo");
  const redoCaption = bt("다시", "Redo"), redoPurpose = bt("다시실행", "Redo");
  const { title: undoTitle, "aria-keyshortcuts": undoKeys } = drawingCommandShortcut(s.appSettings, "undo", undoCaption);
  const { title: redoTitle, "aria-keyshortcuts": redoKeys } = drawingCommandShortcut(s.appSettings, "redo", redoCaption);
  const undoDisabledReason = s.menuEditUndoDisabled ? bt("되돌릴 작업 이력이 없습니다", "Nothing to undo") : undefined;
  const redoDisabledReason = s.menuEditRedoDisabled ? bt("다시 실행할 작업 이력이 없습니다", "Nothing to redo") : undefined;

  return (
    <div className="studio-drawing-clarity-history" role="toolbar" aria-label={bt("편집 기록", "Edit history")}>
      <button
        type="button"
        className="studio-drawing-clarity-button"
        disabled={s.menuEditUndoDisabled}
        onClick={s.studioMenubarContentHandlers.undo}
        aria-label={undoCaption === undoPurpose ? undoCaption : `${undoCaption} · ${undoPurpose}`}
        aria-describedby={undoDisabledReason ? undoReasonId : undefined}
        data-studio-disabled-reason={undoDisabledReason}
        title={s.menuEditUndoDisabled ? disabledTooltip(undoTitle, undoDisabledReason) : undoTitle}
        aria-keyshortcuts={undoKeys}
      >
        <Undo2 size={18} aria-hidden />
        <span>{undoCaption}</span>
      </button>
      <button
        type="button"
        className="studio-drawing-clarity-button"
        disabled={s.menuEditRedoDisabled}
        onClick={s.studioMenubarContentHandlers.redo}
        aria-label={redoCaption === redoPurpose ? redoCaption : `${redoCaption} · ${redoPurpose}`}
        aria-describedby={redoDisabledReason ? redoReasonId : undefined}
        data-studio-disabled-reason={redoDisabledReason}
        title={s.menuEditRedoDisabled ? disabledTooltip(redoTitle, redoDisabledReason) : redoTitle}
        aria-keyshortcuts={redoKeys}
      >
        <Redo2 size={18} aria-hidden />
        <span>{redoCaption}</span>
      </button>
      {undoDisabledReason ? <span id={undoReasonId} className="sr-only">{undoDisabledReason}</span> : null}
      {redoDisabledReason ? <span id={redoReasonId} className="sr-only">{redoDisabledReason}</span> : null}
    </div>
  );
}
