import {
  ArrowDownToLine,
  ArrowUpToLine,
  Boxes,
  ChevronDown,
  ChevronUp,
  Copy,
  FlipHorizontal2,
  ImagePlus,
  Lock,
  LockOpen,
  Maximize2,
  MessageCircle,
  Pencil,
  Plus,
  Redo2,
  Shapes,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  Undo2,
} from "lucide-react";

import {
  STUDIO_ICON_SIZE,
  STUDIO_ICON_STROKE,
  studioChromeIconClass,
} from "../studio-chrome-ui";

export type StudioCanvasLayerReorder = "front" | "forward" | "backward" | "back";

export interface StudioCanvasContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  hasElement: boolean;
  locked: boolean;
  onEditVrm?: () => void;
  onEditBackground3d?: () => void;
  onPreloadBackground3d: () => void;
  onSaveAsEmeres: () => void;
  onDuplicate: () => void;
  onReorder: (direction: StudioCanvasLayerReorder) => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onSelectPen: () => void;
  onAddSpeechBubble: () => void;
  onAddText: () => void;
  onAddPage: () => void;
  onEnableQuickShape: () => void;
  onOpenQuickAccess?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onFlipHorizontal?: () => void;
  onZoomReset?: () => void;
  onClose: () => void;
}

function runAndClose(action: () => void, onClose: () => void): void {
  action();
  onClose();
}

export function StudioCanvasContextMenu({
  open,
  x,
  y,
  hasElement,
  locked,
  onEditVrm,
  onEditBackground3d,
  onPreloadBackground3d,
  onSaveAsEmeres,
  onDuplicate,
  onReorder,
  onToggleLock,
  onDelete,
  onSelectPen,
  onAddSpeechBubble,
  onAddText,
  onAddPage,
  onEnableQuickShape,
  onOpenQuickAccess,
  onUndo,
  onRedo,
  onFlipHorizontal,
  onZoomReset,
  onClose,
}: StudioCanvasContextMenuProps) {
  if (!open) return null;

  const hasQuickStrip = Boolean(onUndo || onRedo || onFlipHorizontal || onZoomReset);

  return (
    // The click only prevents the global outside-click closer. All commands remain real buttons.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      // 터치 표준: 모든 항목이 최소 44px(min-h-11) 높이를 가진다 — 태블릿에서 요소 편집의 주 경로이기 때문이다.
      data-studio-canvas-context-menu="true"
      style={{ top: y, left: x }}
      className="fixed z-50 min-w-[180px] rounded-lg border border-line bg-panel p-1 shadow-xl motion-safe:animate-fade-in"
      onClick={(event) => event.stopPropagation()}
    >
      {hasQuickStrip ? (
        <div
          role="group"
          aria-label="빠른 캔버스 제어"
          data-testid="canvas-context-quick-strip"
          className="mb-1 flex items-center justify-between gap-1 rounded-md border border-line/70 bg-card/75 p-1"
        >
          {onUndo ? (
            <button
              type="button"
              title="실행 취소 (⌘Z)"
              aria-label="실행 취소 (⌘Z)"
              onClick={() => runAndClose(onUndo, onClose)}
              className="flex min-h-9 flex-1 items-center justify-center rounded px-2 py-1 text-xs font-semibold text-fg hover:bg-raised"
            >
              <Undo2 size={14} aria-hidden />
            </button>
          ) : null}
          {onRedo ? (
            <button
              type="button"
              title="다시 실행 (⇧⌘Z)"
              aria-label="다시 실행 (⇧⌘Z)"
              onClick={() => runAndClose(onRedo, onClose)}
              className="flex min-h-9 flex-1 items-center justify-center rounded px-2 py-1 text-xs font-semibold text-fg hover:bg-raised"
            >
              <Redo2 size={14} aria-hidden />
            </button>
          ) : null}
          {onFlipHorizontal ? (
            <button
              type="button"
              title="좌우 반전 데생 점검"
              aria-label="좌우 반전 데생 점검"
              onClick={() => runAndClose(onFlipHorizontal, onClose)}
              className="flex min-h-9 flex-1 items-center justify-center rounded px-2 py-1 text-xs font-semibold text-fg hover:bg-raised"
            >
              <FlipHorizontal2 size={14} aria-hidden />
            </button>
          ) : null}
          {onZoomReset ? (
            <button
              type="button"
              title="화면 맞춤 (100%)"
              aria-label="화면 맞춤 (100%)"
              onClick={() => runAndClose(onZoomReset, onClose)}
              className="flex min-h-9 flex-1 items-center justify-center rounded px-2 py-1 text-xs font-semibold text-fg hover:bg-raised"
            >
              <Maximize2 size={14} aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
      {onOpenQuickAccess ? <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-fg hover:bg-raised"
        onClick={() => runAndClose(onOpenQuickAccess, onClose)}><Sparkles size={18} aria-hidden />커서 근처 빠른 실행</button> : null}
      {hasElement ? (
        <>
          {onEditVrm && (
            <>
              <button
                type="button"
                onClick={() => runAndClose(onEditVrm, onClose)}
                className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-semibold text-accent hover:bg-raised"
              >
                <Sparkles
                  size={STUDIO_ICON_SIZE.contextMenu}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioChromeIconClass({ tone: "accent" })}
                />
                3D 캐릭터 편집
              </button>
              <div className="my-1 h-px bg-line" />
            </>
          )}
          {onEditBackground3d && (
            <>
              <button
                type="button"
                onClick={() => runAndClose(onEditBackground3d, onClose)}
                onPointerEnter={onPreloadBackground3d}
                onPointerDown={onPreloadBackground3d}
                onFocus={onPreloadBackground3d}
                className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-semibold text-accent hover:bg-raised"
              >
                <Boxes
                  size={STUDIO_ICON_SIZE.contextMenu}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioChromeIconClass({ tone: "accent" })}
                />
                3D 배경 편집
              </button>
              <div className="my-1 h-px bg-line" />
            </>
          )}
          <button
            type="button"
            onClick={onSaveAsEmeres}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
          >
            <ImagePlus
              size={STUDIO_ICON_SIZE.contextMenu}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "default" })}
            />
            이메레스로 저장
          </button>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            onClick={() => runAndClose(onDuplicate, onClose)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
          >
            <Copy
              size={STUDIO_ICON_SIZE.contextMenu}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "default" })}
            />
            복제하기 (⌘J)
          </button>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            onClick={() => runAndClose(() => onReorder("front"), onClose)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
          >
            <ArrowUpToLine
              size={STUDIO_ICON_SIZE.contextMenu}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "default" })}
            />
            맨 앞으로
          </button>
          <button
            type="button"
            onClick={() => runAndClose(() => onReorder("forward"), onClose)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
          >
            <ChevronUp
              size={STUDIO_ICON_SIZE.contextMenu}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "default" })}
            />
            한 단계 앞으로
          </button>
          <button
            type="button"
            onClick={() => runAndClose(() => onReorder("backward"), onClose)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
          >
            <ChevronDown
              size={STUDIO_ICON_SIZE.contextMenu}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "default" })}
            />
            한 단계 뒤로
          </button>
          <button
            type="button"
            onClick={() => runAndClose(() => onReorder("back"), onClose)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
          >
            <ArrowDownToLine
              size={STUDIO_ICON_SIZE.contextMenu}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "default" })}
            />
            맨 뒤로
          </button>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            onClick={() => runAndClose(onToggleLock, onClose)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
          >
            {locked ? (
              <LockOpen
                size={STUDIO_ICON_SIZE.contextMenu}
                strokeWidth={STUDIO_ICON_STROKE}
                aria-hidden
                className={studioChromeIconClass({ tone: "default" })}
              />
            ) : (
              <Lock
                size={STUDIO_ICON_SIZE.contextMenu}
                strokeWidth={STUDIO_ICON_STROKE}
                aria-hidden
                className={studioChromeIconClass({ tone: "default" })}
              />
            )}
            {locked ? "잠금 해제" : "위치 잠금"}
          </button>
          <button
            type="button"
            onClick={() => runAndClose(onDelete, onClose)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-bad hover:bg-bad-soft/30"
          >
            <Trash2
              size={STUDIO_ICON_SIZE.contextMenu}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "danger" })}
            />
            삭제하기
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => runAndClose(onSelectPen, onClose)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-semibold text-fg hover:bg-raised"
          >
            <Pencil
              size={STUDIO_ICON_SIZE.contextMenu}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "default" })}
            />
            펜으로 그리기
          </button>
          <button
            type="button"
            onClick={() => runAndClose(onAddSpeechBubble, onClose)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
          >
            <MessageCircle
              size={STUDIO_ICON_SIZE.contextMenu}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "default" })}
            />
            말풍선 추가
          </button>
          <button
            type="button"
            onClick={() => runAndClose(onAddText, onClose)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
          >
            <TypeIcon
              size={STUDIO_ICON_SIZE.contextMenu}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "default" })}
            />
            텍스트 추가
          </button>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            onClick={() => runAndClose(onAddPage, onClose)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
          >
            <Plus
              size={STUDIO_ICON_SIZE.contextMenu}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "default" })}
            />
            새 페이지 추가
          </button>
          <button
            type="button"
            onClick={() => runAndClose(onEnableQuickShape, onClose)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-accent hover:bg-raised"
          >
            <Shapes
              size={STUDIO_ICON_SIZE.contextMenu}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "accent" })}
            />
            스마트 도형 켜기
          </button>
        </>
      )}
    </div>
  );
}
