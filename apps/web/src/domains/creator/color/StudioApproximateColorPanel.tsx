/**
 * StudioApproximateColorPanel.tsx
 *
 * Clip Studio Paint Approximate Color Palette (근사색 팔레트).
 * Displays systematic variations around the active reference color by varying
 * Saturation, Value/Luminance, and Hue, enabling instant picking of subtle
 * highlights, midtones, and shadows without manual color wheel adjustments.
 */

import { SlidersHorizontal, Sparkles } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import {
  generateApproximateColorGrid,
  type ApproximateColorMode,
} from "./studio-approximate-color";

import { cn } from "@/shared/lib/utils";

export interface StudioApproximateColorPanelProps {
  readonly activeColor: string;
  readonly onSelectColor: (hex: string) => void;
  readonly className?: string;
}

const MODES: readonly { readonly id: ApproximateColorMode; readonly label: string }[] = [
  { id: "sat-val", label: "채도·명도 (S×V)" },
  { id: "hue-val", label: "색조·명도 (H×V)" },
  { id: "hue-sat", label: "색조·채도 (H×S)" },
  { id: "temp-val", label: "색온도·명도 (T×V)" },
  { id: "val-only", label: "명도 (V)" },
];

const DELTAS: readonly number[] = [3, 5, 8, 12];

export function StudioApproximateColorPanel({
  activeColor,
  onSelectColor,
  className,
}: StudioApproximateColorPanelProps) {
  const [mode, setMode] = useState<ApproximateColorMode>("sat-val");
  const [steps, setSteps] = useState<5 | 7>(5);
  const [deltaPercent, setDeltaPercent] = useState<number>(6);
  const [hoveredHex, setHoveredHex] = useState<string | null>(null);
  const centerIndex = Math.floor(steps / 2);
  const [focusedCoords, setFocusedCoords] = useState<{ readonly row: number; readonly col: number }>({
    row: centerIndex,
    col: centerIndex,
  });
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const grid = useMemo(
    () => generateApproximateColorGrid(activeColor, { mode, steps, deltaPercent }),
    [activeColor, mode, steps, deltaPercent],
  );

  const safeFocusedRow = Math.min(focusedCoords.row, steps - 1);
  const safeFocusedCol = Math.min(focusedCoords.col, steps - 1);

  const focusCellAt = (nextRow: number, nextCol: number) => {
    setFocusedCoords({ row: nextRow, col: nextCol });
    const targetHex = grid[nextRow]?.[nextCol];
    if (targetHex) {
      setHoveredHex(targetHex);
    }
    const btn = cellRefs.current.get(`${nextRow}-${nextCol}`);
    btn?.focus();
  };

  const handleCellKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    rowIndex: number,
    colIndex: number,
  ) => {
    let nextRow = rowIndex;
    let nextCol = colIndex;

    switch (event.key) {
      case "ArrowRight":
        nextCol = colIndex + 1;
        break;
      case "ArrowLeft":
        nextCol = colIndex - 1;
        break;
      case "ArrowDown":
        nextRow = rowIndex + 1;
        break;
      case "ArrowUp":
        nextRow = rowIndex - 1;
        break;
      case "Home":
        nextCol = 0;
        break;
      case "End":
        nextCol = steps - 1;
        break;
      default:
        return;
    }

    if (
      nextRow < 0 ||
      nextRow >= steps ||
      nextCol < 0 ||
      nextCol >= steps ||
      (nextRow === rowIndex && nextCol === colIndex)
    ) {
      return;
    }

    event.preventDefault();
    focusCellAt(nextRow, nextCol);
  };

  return (
    <div
      data-studio-approximate-color-panel="true"
      data-approximate-mode={mode}
      className={cn(
        "flex flex-col rounded-xl border border-line bg-panel/90 p-3 select-none text-fg text-xs shadow-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-line/60">
        <div className="flex items-center gap-1.5 min-w-0">
          <SlidersHorizontal size={14} className="text-good shrink-0" aria-hidden />
          <span className="font-semibold truncate text-fg">근사색 (Approximate Color)</span>
          <span className="px-1 py-0.2 text-[10px] rounded font-semibold bg-good/15 text-good border border-good/30 shrink-0">
            CSP
          </span>
        </div>

        {/* Steps Selector */}
        <div className="flex items-center gap-1 shrink-0">
          {([5, 7] as const).map((s) => {
            const nextCenter = Math.floor(s / 2);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={steps === s}
                onClick={() => {
                  setSteps(s);
                  setFocusedCoords({ row: nextCenter, col: nextCenter });
                }}
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors border",
                  steps === s
                    ? "bg-good text-white border-good font-semibold"
                    : "bg-card text-fg-2 border-line hover:text-fg hover:bg-raised",
                )}
                title={`${s}x${s} 그리드`}
                aria-label={`${s}x${s} 그리드`}
              >
                {s}x{s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode & Delta Selectors */}
      <div className="flex items-center justify-between gap-1 my-2">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap transition-colors border",
                mode === m.id
                  ? "bg-good/15 text-good border-good/40 font-semibold"
                  : "bg-card hover:bg-raised border-line text-fg-2 hover:text-fg",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Delta Step Selector */}
        <div className="flex items-center gap-0.5 shrink-0">
          <span className="text-[10px] text-fg-3 mr-0.5">±</span>
          {DELTAS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={deltaPercent === d}
              onClick={() => setDeltaPercent(d)}
              className={cn(
                "px-1 py-0.2 rounded text-[10px] font-mono transition-colors",
                deltaPercent === d
                  ? "bg-good text-white font-semibold"
                  : "text-fg-2 hover:text-fg",
              )}
            >
              {d}%
            </button>
          ))}
        </div>
      </div>

      {/* NxN Approximate Color Grid with Roving Tabindex Spatial Navigation */}
      <div
        data-studio-approximate-grid="true"
        aria-label="근사색 2D 그리드 (방향키로 이동)"
        className="grid gap-0.5 p-1 rounded-lg bg-card border border-line/70"
        style={{
          gridTemplateColumns: `repeat(${steps}, minmax(0, 1fr))`,
        }}
      >
        {grid.map((row, rowIndex) =>
          row.map((cellHex, colIndex) => {
            const isCenter = rowIndex === centerIndex && colIndex === centerIndex;
            const isFocusedCell = rowIndex === safeFocusedRow && colIndex === safeFocusedCol;
            const cellKey = `${rowIndex}-${colIndex}`;
            return (
              <button
                key={cellKey}
                ref={(el) => {
                  if (el) {
                    cellRefs.current.set(cellKey, el);
                  } else {
                    cellRefs.current.delete(cellKey);
                  }
                }}
                type="button"
                tabIndex={isFocusedCell ? 0 : -1}
                data-grid-row={rowIndex}
                data-grid-col={colIndex}
                onClick={() => {
                  setFocusedCoords({ row: rowIndex, col: colIndex });
                  onSelectColor(cellHex);
                }}
                onFocus={() => {
                  setFocusedCoords({ row: rowIndex, col: colIndex });
                  setHoveredHex(cellHex);
                }}
                onKeyDown={(e) => handleCellKeyDown(e, rowIndex, colIndex)}
                onPointerEnter={() => setHoveredHex(cellHex)}
                onPointerLeave={() => setHoveredHex(null)}
                aria-label={`${cellHex} 색상 선택`}
                title={`${cellHex}${isCenter ? " (현재 기준색)" : ""}`}
                className={cn(
                  "aspect-square rounded-sm transition-transform hover:scale-110 relative [forced-color-adjust:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-good focus-visible:z-20",
                  isCenter
                    ? "ring-2 ring-good z-10 shadow-sm"
                    : "hover:z-10",
                )}
                style={{ background: cellHex }}
              >
                {isCenter && (
                  <span className="absolute inset-0 m-auto size-1.5 rounded-full bg-white shadow mix-blend-difference pointer-events-none" />
                )}
              </button>
            );
          }),
        )}
      </div>

      {/* Hover Info Readout */}
      <div className="flex items-center justify-between mt-2 pt-1 border-t border-line/50 text-[10px] text-fg-2 font-mono">
        <div className="flex items-center gap-1">
          <Sparkles size={11} className="text-good shrink-0" aria-hidden />
          <span>선택 색상: {hoveredHex ?? activeColor}</span>
        </div>
        <span
          className="size-3 rounded border border-line [forced-color-adjust:none]"
          style={{ background: hoveredHex ?? activeColor }}
        />
      </div>
    </div>
  );
}
