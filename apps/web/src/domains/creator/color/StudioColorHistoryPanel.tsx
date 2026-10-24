/**
 * StudioColorHistoryPanel.tsx
 *
 * Clip Studio Paint Color History Palette (컬러 히스토리 팔레트).
 * Keeps a continuous, deduplicated log of every color selected and painted with
 * in the studio, allowing rapid one-click re-selection and manual registration.
 */

import { History, Plus, Trash2 } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import {
  addColorToHistory,
  clearColorHistory,
  INITIAL_COLOR_HISTORY,
} from "./studio-color-history";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import "../studio-brush-canvas-status-i18n";

export interface StudioColorHistoryPanelProps {
  readonly activeColor: string;
  readonly onSelectColor: (hex: string) => void;
  readonly initialHistory?: readonly string[];
  readonly history?: readonly string[];
  readonly onRegisterCurrent?: () => void;
  readonly onClearHistory?: () => void;
  readonly className?: string;
}

const HISTORY_GRID_COLS = 8;

export function StudioColorHistoryPanel({
  activeColor,
  onSelectColor,
  initialHistory = INITIAL_COLOR_HISTORY,
  history: controlledHistory,
  onRegisterCurrent,
  onClearHistory,
  className,
}: StudioColorHistoryPanelProps) {
  const t = useT();
  const [localHistory, setHistory] = useState<readonly string[]>(initialHistory);
  const history = controlledHistory ?? localHistory;
  const [hoveredHex, setHoveredHex] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const cellRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const safeFocusedIndex =
    history.length > 0 ? Math.min(Math.max(0, focusedIndex), history.length - 1) : 0;

  const handleRegisterCurrent = () => {
    if (controlledHistory) {
      onRegisterCurrent?.();
      return;
    }
    setHistory((prev) => addColorToHistory(prev, activeColor));
  };

  const handleClearHistory = () => {
    if (controlledHistory) {
      onClearHistory?.();
      return;
    }
    setHistory(clearColorHistory());
  };

  const handleSwatchKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = index + 1;
        break;
      case "ArrowLeft":
        nextIndex = index - 1;
        break;
      case "ArrowDown":
        nextIndex = index + HISTORY_GRID_COLS;
        break;
      case "ArrowUp":
        nextIndex = index - HISTORY_GRID_COLS;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = history.length - 1;
        break;
      default:
        return;
    }

    if (nextIndex < 0 || nextIndex >= history.length || nextIndex === index) {
      return;
    }

    event.preventDefault();
    setFocusedIndex(nextIndex);
    const targetHex = history[nextIndex];
    if (targetHex) {
      setHoveredHex(targetHex);
    }
    cellRefs.current.get(nextIndex)?.focus();
  };

  return (
    <div
      data-studio-color-history-panel="true"
      className={cn(
        "flex flex-col rounded-xl border border-line bg-panel/90 p-3 select-none text-fg text-xs shadow-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-line/60">
        <div className="flex items-center gap-1.5 min-w-0">
          <History size={14} className="text-accent shrink-0" aria-hidden />
          <span className="font-semibold truncate text-fg">컬러 히스토리 (Color History)</span>
          <span className="px-1 py-0.2 text-[10px] rounded font-semibold bg-accent/15 text-accent border border-accent/30 shrink-0">
            CSP
          </span>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleRegisterCurrent}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-card hover:bg-raised text-fg-2 hover:text-fg transition-colors border border-line font-medium"
            title="현재 선택된 색상을 히스토리에 추가"
          >
            <Plus size={11} aria-hidden />
            <span>등록</span>
          </button>
          <button
            type="button"
            onClick={handleClearHistory}
            className="p-1 rounded text-fg-3 hover:text-bad hover:bg-bad/10 transition-colors"
            title="히스토리 전체 지우기"
            aria-label="히스토리 전체 지우기"
          >
            <Trash2 size={12} aria-hidden />
          </button>
        </div>
      </div>

      {/* History Swatches Grid */}
      <div className="mt-2 min-h-16">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 text-fg-3 text-[11px] gap-1">
            <span>{t("studio.brushCanvasStatus.color.historyEmpty", "기록된 색상이 없습니다.")}</span>
            <span className="text-[10px] text-fg-3">작업한 색상이 자동으로 저장됩니다.</span>
          </div>
        ) : (
          <div
            data-studio-color-history-grid="true"
            aria-label="컬러 히스토리 2D 스와치 그리드 (방향키로 이동)"
            className="grid grid-cols-8 gap-1 p-1 rounded-lg bg-card border border-line/70"
          >
            {history.map((colorHex, index) => {
              const isMatch = activeColor.toLowerCase() === colorHex.toLowerCase();
              const isFocused = index === safeFocusedIndex;
              return (
                <button
                  key={`${colorHex}-${index}`}
                  ref={(el) => {
                    if (el) {
                      cellRefs.current.set(index, el);
                    } else {
                      cellRefs.current.delete(index);
                    }
                  }}
                  type="button"
                  tabIndex={isFocused ? 0 : -1}
                  data-history-index={index}
                  onClick={() => {
                    setFocusedIndex(index);
                    onSelectColor(colorHex);
                  }}
                  onFocus={() => {
                    setFocusedIndex(index);
                    setHoveredHex(colorHex);
                  }}
                  onKeyDown={(e) => handleSwatchKeyDown(e, index)}
                  onPointerEnter={() => setHoveredHex(colorHex)}
                  onPointerLeave={() => setHoveredHex(null)}
                  aria-label={`${colorHex} 색상 선택`}
                  title={colorHex}
                  className={cn(
                    "aspect-square rounded transition-transform hover:scale-110 relative [forced-color-adjust:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:z-20",
                    isMatch ? "ring-2 ring-accent z-10 shadow-sm" : "hover:z-10",
                  )}
                  style={{ background: colorHex }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Info Readout */}
      <div className="flex items-center justify-between mt-2 pt-1 border-t border-line/50 text-[10px] text-fg-2 font-mono">
        <span>선택 색상: {hoveredHex ?? activeColor}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-fg-3">({history.length}색 기록됨)</span>
          <span
            className="size-3 rounded border border-line [forced-color-adjust:none]"
            style={{ background: hoveredHex ?? activeColor }}
          />
        </div>
      </div>
    </div>
  );
}
