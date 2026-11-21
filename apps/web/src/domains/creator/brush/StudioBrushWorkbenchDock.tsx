import "./studio-brush-workbench.css";
import { PanelLeftClose, SlidersHorizontal, SquareArrowOutUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  StudioBrushLibrarySheet,
  type StudioBrushLibrarySheetProps,
} from "./StudioBrushLibrarySheet";
import { useStudioBrushDockLayout } from "./useStudioBrushDockLayout";

import { cn } from "@/shared/lib/utils";

export interface StudioBrushWorkbenchDockProps
  extends Pick<
    StudioBrushLibrarySheetProps,
    | "activeBrushId"
    | "operation"
    | "favoriteIds"
    | "recentIds"
    | "restoredView"
    | "onViewStateChange"
    | "onSelectionLifecycle"
    | "onSelect"
    | "onToggleFavorite"
  > {
  width?: number;
  onWidthChange?: (width: number) => void;
  sizeLocked?: boolean;
  opacityLocked?: boolean;
  onToggleSizeLock?: () => void;
  onToggleOpacityLock?: () => void;
  modifiedCount?: number;
  onRestoreDefaults?: () => void;
  expanded?: boolean;
  onCollapse: () => void;
  onOpenBrushStudio: () => void;
  onExpandCatalog: (trigger: HTMLButtonElement) => void;
}

export function StudioBrushWorkbenchDock({
  expanded = false,
  width = 240,
  onWidthChange,
  sizeLocked = false,
  opacityLocked = false,
  onToggleSizeLock,
  onToggleOpacityLock,
  modifiedCount = 0,
  onRestoreDefaults,
  onCollapse,
  onOpenBrushStudio,
  onExpandCatalog,
  ...catalog
}: StudioBrushWorkbenchDockProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [draftWidth, setDraftWidth] = useState(width);
  const draftWidthRef = useRef(width);
  const { overlay, left } = useStudioBrushDockLayout(rootRef, width);

  useEffect(() => {
    setDraftWidth(width);
    draftWidthRef.current = width;
  }, [width]);

  const commitWidth = () => {
    if (draftWidthRef.current !== width) onWidthChange?.(draftWidthRef.current);
  };

  return (
    <aside
      ref={rootRef}
      id="studio-brush-workbench"
      aria-label="브러시 작업 패널"
      data-studio-brush-workbench-dock="true"
      data-studio-brush-panel-presentation={overlay ? "overlay" : "docked"}
      className="hidden h-full min-h-0 shrink-0 flex-col border-r border-line bg-panel lg:flex"
      style={{
        width,
        ...(overlay ? { position: "absolute", left, top: 0, bottom: 0, zIndex: 50 } : {}),
      }}
    >
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <h2 className="text-sm font-semibold text-fg">
          {catalog.operation === "erase" ? "지우개 라이브러리" : "브러시 라이브러리"}
        </h2>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="브러시 패널 접기"
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-raised hover:text-fg",
            STUDIO_FOCUS_RING,
          )}
        >
          <PanelLeftClose size={17} aria-hidden />
        </button>
      </header>

      <details className="studio-brush-dock-settings shrink-0 border-b border-line text-xs text-fg-2">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer items-center justify-between px-3 font-medium text-fg-2 hover:bg-raised/60",
            STUDIO_FOCUS_RING,
          )}
        >
          <span>브러시 교체·패널 설정</span>
          {modifiedCount > 0 ? (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-accent">
              {modifiedCount}
            </span>
          ) : null}
        </summary>
        <div className="space-y-1.5 px-3 pb-2.5" aria-label="브러시 교체 정책">
          <p className="leading-relaxed text-fg-3">브러시를 바꿔도 현재 주 색상은 유지됩니다.</p>
          {onToggleSizeLock ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-fg-2">
              <input
                type="checkbox"
                checked={sizeLocked}
                onChange={onToggleSizeLock}
                className={cn("size-4 accent-accent", STUDIO_FOCUS_RING)}
              />
              현재 크기 유지
            </label>
          ) : null}
          {onToggleOpacityLock ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-fg-2">
              <input
                type="checkbox"
                checked={opacityLocked}
                disabled={catalog.operation === "erase"}
                onChange={onToggleOpacityLock}
                className={cn("size-4 accent-accent disabled:opacity-45", STUDIO_FOCUS_RING)}
              />
              현재 불투명도 유지
            </label>
          ) : null}
          {catalog.operation === "erase" ? (
            <p className="leading-relaxed text-fg-3">지우기 강도는 지우개 프리셋을 따릅니다.</p>
          ) : null}
          {modifiedCount > 0 ? (
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="tabular-nums text-fg-2">수정됨 · {modifiedCount}개 설정</span>
              <button
                type="button"
                className={cn(
                  "min-h-11 rounded-lg border border-accent/40 bg-accent-soft px-2.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20",
                  STUDIO_FOCUS_RING,
                )}
                onClick={onRestoreDefaults}
              >
                프리셋 복원
              </button>
            </div>
          ) : null}
          {overlay ? (
            <p role="status" className="leading-relaxed text-fg-3">
              캔버스 작업 영역을 확보하기 위해 겹쳐 보기로 열렸습니다.
            </p>
          ) : null}
        </div>
        {onWidthChange ? (
          <details className="shrink-0 border-t border-line px-3 py-1 text-xs text-fg-2">
            <summary className={cn("flex min-h-11 cursor-pointer items-center justify-between tabular-nums", STUDIO_FOCUS_RING)}>
              <span>패널 너비</span>
              <span className="font-semibold text-fg">{draftWidth}px</span>
            </summary>
            <input
              type="range"
              aria-label="브러시 패널 너비"
              min={200}
              max={360}
              step={8}
              value={draftWidth}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                draftWidthRef.current = next;
                setDraftWidth(next);
              }}
              onPointerUp={commitWidth}
              onKeyUp={commitWidth}
              onBlur={commitWidth}
              className={cn("min-h-11 w-full cursor-pointer accent-accent", STUDIO_FOCUS_RING)}
            />
          </details>
        ) : null}
      </details>

      <div className="min-h-0 flex-1">
        {expanded ? (
          <p className="p-3 text-sm leading-relaxed text-fg-2">
            확장 보기에서 브러시를 고르고 있습니다. 닫으면 이 패널로 돌아옵니다.
          </p>
        ) : (
          <StudioBrushLibrarySheet
            {...catalog}
            open
            embedded
            workbench
            autoFocusSearch={false}
            dismissOnEscape={false}
            closeOnSelection={false}
            dismissOnOutsidePointer={false}
            onClose={onCollapse}
          />
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap gap-1.5 border-t border-line p-2">
        <button
          type="button"
          onClick={onOpenBrushStudio}
          className={cn(
            "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg",
            STUDIO_FOCUS_RING,
          )}
        >
          <SlidersHorizontal size={14} aria-hidden />
          브러시 편집
        </button>
        <button
          type="button"
          onClick={(event) => onExpandCatalog(event.currentTarget)}
          className={cn(
            "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg",
            STUDIO_FOCUS_RING,
          )}
        >
          <SquareArrowOutUpRight size={14} aria-hidden />
          {expanded ? "도킹 보기" : "확장 보기"}
        </button>
      </footer>
    </aside>
  );
}
