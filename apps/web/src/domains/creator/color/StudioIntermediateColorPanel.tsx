/**
 * StudioIntermediateColorPanel.tsx
 *
 * Clip Studio Paint Intermediate Color Palette (중간색 팔레트).
 * Computes an interactive 2D bilinear interpolation grid between
 * 4 user-selected corner colors (Highlight, Base, Shadow 1, Deep Shadow 2)
 * for seamless webtoon shading and midtone selection.
 */

import { Grid, Sparkles } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import {
  computeColorRelativeLuminance,
  DEFAULT_INTERMEDIATE_CORNERS,
  generateIntermediateColorGrid,
  STUDIO_INTERMEDIATE_COLOR_PRESETS,
  type StudioIntermediateColorCorners,
  type StudioIntermediateGridSize,
  type StudioIntermediateInterpolationSpace,
} from "./studio-intermediate-color";

import { cn } from "@/shared/lib/utils";

export interface StudioIntermediateColorPanelProps {
  readonly activeColor?: string;
  readonly onSelectColor: (hex: string) => void;
  readonly className?: string;
}

export function StudioIntermediateColorPanel({
  activeColor = "#fcd5b5",
  onSelectColor,
  className,
}: StudioIntermediateColorPanelProps) {
  const [corners, setCorners] = useState<StudioIntermediateColorCorners>(DEFAULT_INTERMEDIATE_CORNERS);
  const [gridSize, setGridSize] = useState<StudioIntermediateGridSize>(6);
  const [interpolationSpace, setInterpolationSpace] =
    useState<StudioIntermediateInterpolationSpace>("oklab");
  const [hoveredCellColor, setHoveredCellColor] = useState<string | null>(null);
  const [focusedCoords, setFocusedCoords] = useState<{ readonly row: number; readonly col: number }>({
    row: 0,
    col: 0,
  });
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const grid = useMemo(
    () => generateIntermediateColorGrid(corners, gridSize, interpolationSpace),
    [corners, gridSize, interpolationSpace],
  );

  const safeFocusedRow = Math.min(focusedCoords.row, gridSize - 1);
  const safeFocusedCol = Math.min(focusedCoords.col, gridSize - 1);

  const handleApplyPreset = (presetCorners: StudioIntermediateColorCorners) => {
    setCorners(presetCorners);
  };

  const handleUpdateCorner = (cornerKey: keyof StudioIntermediateColorCorners, color: string) => {
    setCorners((prev) => ({ ...prev, [cornerKey]: color }));
  };

  const handleSetCornerToActive = (cornerKey: keyof StudioIntermediateColorCorners) => {
    if (activeColor) {
      setCorners((prev) => ({ ...prev, [cornerKey]: activeColor }));
    }
  };

  const focusCellAt = (nextRow: number, nextCol: number) => {
    setFocusedCoords({ row: nextRow, col: nextCol });
    const targetHex = grid[nextRow]?.[nextCol];
    if (targetHex) {
      setHoveredCellColor(targetHex);
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
        nextCol = gridSize - 1;
        break;
      default:
        return;
    }

    if (
      nextRow < 0 ||
      nextRow >= gridSize ||
      nextCol < 0 ||
      nextCol >= gridSize ||
      (nextRow === rowIndex && nextCol === colIndex)
    ) {
      // Do not preventDefault at grid boundaries so spatial navigation can bubble naturally
      return;
    }

    event.preventDefault();
    focusCellAt(nextRow, nextCol);
  };

  const readoutHex = hoveredCellColor ?? activeColor;
  const readoutLuminancePct = Math.round(computeColorRelativeLuminance(readoutHex) * 100);

  return (
    <div
      data-studio-intermediate-color-panel="true"
      data-interpolation-space={interpolationSpace}
      className={cn(
        "flex flex-col rounded-xl border border-line bg-panel/90 p-3 select-none text-fg text-xs shadow-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-line/60">
        <div className="flex items-center gap-1.5 min-w-0">
          <Grid size={14} className="text-accent shrink-0" aria-hidden />
          <span className="font-semibold truncate text-fg">중간색 (Intermediate Color)</span>
          <span className="px-1 py-0.2 text-[10px] rounded font-semibold bg-accent/15 text-accent border border-accent/30 shrink-0">
            CSP
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Color Space Toggle (OKLab vs sRGB) */}
          <div
            className="inline-flex items-center rounded border border-line bg-card p-0.5"
            role="group"
            aria-label="보간 색공간 선택"
          >
            {(["oklab", "srgb"] as const).map((space) => (
              <button
                key={space}
                type="button"
                data-testid={`intermediate-space-${space}`}
                aria-pressed={interpolationSpace === space}
                onClick={() => setInterpolationSpace(space)}
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors",
                  interpolationSpace === space
                    ? "bg-accent text-white font-semibold"
                    : "text-fg-3 hover:text-fg",
                )}
                title={
                  space === "oklab"
                    ? "지각 균일 OKLab 양선형 보간 (채도 탁해짐 방지)"
                    : "표준 sRGB 선형 보간"
                }
              >
                {space === "oklab" ? "OKLab" : "sRGB"}
              </button>
            ))}
          </div>

          {/* Grid Size Selector */}
          {([4, 6, 8] as const).map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setGridSize(size)}
              aria-pressed={gridSize === size}
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors border",
                gridSize === size
                  ? "bg-accent text-white border-accent font-semibold"
                  : "bg-card text-fg-2 border-line hover:text-fg hover:bg-raised",
              )}
              title={`${size}x${size} 그리드`}
              aria-label={`${size}x${size} 그리드`}
            >
              {size}x{size}
            </button>
          ))}
        </div>
      </div>

      {/* Preset Chips */}
      <div className="flex items-center gap-1 my-2 overflow-x-auto no-scrollbar">
        <Sparkles size={12} className="text-amber-500 shrink-0" aria-hidden />
        {STUDIO_INTERMEDIATE_COLOR_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => handleApplyPreset(preset.corners)}
            className="px-2 py-0.5 rounded-full text-[10px] bg-card hover:bg-raised border border-line text-fg-2 hover:text-fg whitespace-nowrap transition-colors"
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* 4 Corner Anchors Control Bar */}
      <div className="grid grid-cols-2 gap-2 mb-2 p-2 rounded-lg bg-card border border-line/70 text-[11px]">
        {/* Top-Left */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1">
            <label className="relative size-4 rounded cursor-pointer border border-line overflow-hidden shrink-0 [forced-color-adjust:none]">
              <input
                type="color"
                value={corners.c00}
                onChange={(e) => handleUpdateCorner("c00", e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer size-full"
                aria-label="좌상단 코너 색상"
              />
              <span className="block size-full [forced-color-adjust:none]" style={{ background: corners.c00 }} />
            </label>
            <span className="text-fg-2 text-[10px]">좌상 (C00)</span>
          </div>
          <button
            type="button"
            onClick={() => handleSetCornerToActive("c00")}
            className="text-[9px] text-accent hover:text-fg px-1.5 py-0.5 rounded border border-accent/25 bg-accent/10 hover:bg-accent/20 font-medium"
            title="현재 선택된 색으로 좌상단 코너 설정"
          >
            현재색
          </button>
        </div>

        {/* Top-Right */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1">
            <label className="relative size-4 rounded cursor-pointer border border-line overflow-hidden shrink-0 [forced-color-adjust:none]">
              <input
                type="color"
                value={corners.c10}
                onChange={(e) => handleUpdateCorner("c10", e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer size-full"
                aria-label="우상단 코너 색상"
              />
              <span className="block size-full [forced-color-adjust:none]" style={{ background: corners.c10 }} />
            </label>
            <span className="text-fg-2 text-[10px]">우상 (C10)</span>
          </div>
          <button
            type="button"
            onClick={() => handleSetCornerToActive("c10")}
            className="text-[9px] text-accent hover:text-fg px-1.5 py-0.5 rounded border border-accent/25 bg-accent/10 hover:bg-accent/20 font-medium"
            title="현재 선택된 색으로 우상단 코너 설정"
          >
            현재색
          </button>
        </div>

        {/* Bottom-Left */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1">
            <label className="relative size-4 rounded cursor-pointer border border-line overflow-hidden shrink-0 [forced-color-adjust:none]">
              <input
                type="color"
                value={corners.c01}
                onChange={(e) => handleUpdateCorner("c01", e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer size-full"
                aria-label="좌하단 코너 색상"
              />
              <span className="block size-full [forced-color-adjust:none]" style={{ background: corners.c01 }} />
            </label>
            <span className="text-fg-2 text-[10px]">좌하 (C01)</span>
          </div>
          <button
            type="button"
            onClick={() => handleSetCornerToActive("c01")}
            className="text-[9px] text-accent hover:text-fg px-1.5 py-0.5 rounded border border-accent/25 bg-accent/10 hover:bg-accent/20 font-medium"
            title="현재 선택된 색으로 좌하단 코너 설정"
          >
            현재색
          </button>
        </div>

        {/* Bottom-Right */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1">
            <label className="relative size-4 rounded cursor-pointer border border-line overflow-hidden shrink-0 [forced-color-adjust:none]">
              <input
                type="color"
                value={corners.c11}
                onChange={(e) => handleUpdateCorner("c11", e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer size-full"
                aria-label="우하단 코너 색상"
              />
              <span className="block size-full [forced-color-adjust:none]" style={{ background: corners.c11 }} />
            </label>
            <span className="text-fg-2 text-[10px]">우하 (C11)</span>
          </div>
          <button
            type="button"
            onClick={() => handleSetCornerToActive("c11")}
            className="text-[9px] text-accent hover:text-fg px-1.5 py-0.5 rounded border border-accent/25 bg-accent/10 hover:bg-accent/20 font-medium"
            title="현재 선택된 색으로 우하단 코너 설정"
          >
            현재색
          </button>
        </div>
      </div>

      {/* 2D Interpolated Swatch Grid with Roving Tabindex Spatial Navigation */}
      <div
        data-studio-intermediate-grid="true"
        aria-label="중간색 2D 보간 그리드 (방향키로 이동)"
        className="grid gap-0.5 p-1 rounded-lg bg-card border border-line/70"
        style={{
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
        }}
      >
        {grid.map((row, rowIndex) =>
          row.map((cellHex, colIndex) => {
            const isMatch = activeColor.toLowerCase() === cellHex.toLowerCase();
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
                  setHoveredCellColor(cellHex);
                }}
                onKeyDown={(e) => handleCellKeyDown(e, rowIndex, colIndex)}
                onPointerEnter={() => setHoveredCellColor(cellHex)}
                onPointerLeave={() => setHoveredCellColor(null)}
                aria-label={`${cellHex} 색상 선택`}
                title={`${cellHex} (${rowIndex + 1}행 ${colIndex + 1}열)`}
                className={cn(
                  "aspect-square rounded-sm transition-transform hover:scale-110 relative [forced-color-adjust:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:z-20",
                  isMatch ? "ring-2 ring-accent z-10" : "hover:z-10",
                )}
                style={{ background: cellHex }}
              />
            );
          }),
        )}
      </div>

      {/* Hover Info Readout */}
      <div className="flex items-center justify-between mt-2 pt-1 border-t border-line/50 text-[10px] text-fg-2 font-mono">
        <span>
          선택 색상: {readoutHex} · 명도 {readoutLuminancePct}%
        </span>
        <span
          className="size-3 rounded border border-line [forced-color-adjust:none]"
          style={{ background: readoutHex }}
        />
      </div>
    </div>
  );
}
