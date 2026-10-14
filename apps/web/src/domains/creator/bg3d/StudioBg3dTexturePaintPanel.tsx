import { useState } from "react";
import { Brush, Download, Eraser, Redo2, Undo2 } from "lucide-react";

import {
  STUDIO_BG3D_CONTROL_BUTTON as CONTROL_BUTTON,
  studioBg3dClassNames as cx,
} from "./studio-bg3d-editor-ui";
import {
  STUDIO_BG3D_TEXTURE_PAINT_MAX_STROKES,
  StudioBg3dTexturePaintSurface,
  appendStudioBg3dTexturePaintStroke,
  countStudioBg3dTexturePaintPoints,
  removeLastStudioBg3dTexturePaintStroke,
  type StudioBg3dPaintCanvas,
  type StudioBg3dTexturePaint,
  type StudioBg3dTexturePaintStroke,
} from "./studio-bg3d-texture-paint";

import type { BgPrimitive } from "../studio-background-3d-primitives";

/** 호스트(뷰포트 포인터 핸들러)와 패널이 공유하는 브러시 상태. */
export interface StudioBg3dTexturePaintBrush {
  readonly color: string;
  /** 브러시 지름(UV 단위). */
  readonly size: number;
  readonly opacity: number;
}

export const DEFAULT_STUDIO_BG3D_TEXTURE_PAINT_BRUSH: StudioBg3dTexturePaintBrush = {
  color: "#e11d48",
  size: 0.04,
  opacity: 1,
};

const BRUSH_SWATCHES = [
  "#e11d48",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#0ea5e9",
  "#6366f1",
  "#111827",
  "#ffffff",
] as const;

export interface StudioBg3dTexturePaintPanelProps {
  readonly primitive: BgPrimitive;
  /** 그리기 모드 — 켜져 있는 동안 뷰포트 드래그는 선택/회전이 아니라 표면 페인팅이 된다. */
  readonly paintActive: boolean;
  readonly onPaintActiveChange: (active: boolean) => void;
  readonly brush: StudioBg3dTexturePaintBrush;
  readonly onBrushChange: (brush: StudioBg3dTexturePaintBrush) => void;
  /** 페인트 변경을 정본 상태(프리미티브 → 문서)에 반영하는 유일한 통로. */
  readonly onPaintChange: (id: string, paint: StudioBg3dTexturePaint | null) => void;
  readonly disabled?: boolean;
  readonly disabledReason?: string | null;
}

/**
 * 3D 표면 직접 그리기 1단계 패널 — 프리미티브 UV 텍스처 페인팅.
 * 획은 문서에 벡터로 저장되어 저장/재열기에서 유지되고, 여기서 PNG 텍스처로 내보낼 수 있다.
 */
export function StudioBg3dTexturePaintPanel({
  primitive,
  paintActive,
  onPaintActiveChange,
  brush,
  onBrushChange,
  onPaintChange,
  disabled = false,
  disabledReason = null,
}: StudioBg3dTexturePaintPanelProps) {
  const [redoStack, setRedoStack] = useState<readonly StudioBg3dTexturePaintStroke[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const paint = primitive.texturePaint ?? null;
  const strokeCount = paint?.strokes.length ?? 0;
  const pointCount = countStudioBg3dTexturePaintPoints(paint);
  const controlsDisabled = disabled || Boolean(disabledReason);

  const handleUndo = () => {
    const { paint: next, removed } = removeLastStudioBg3dTexturePaintStroke(paint);
    if (!removed) return;
    setRedoStack((stack) => [...stack, removed]);
    setNotice(null);
    onPaintChange(primitive.id, next);
  };

  const handleRedo = () => {
    const stroke = redoStack[redoStack.length - 1];
    if (!stroke) return;
    const next = appendStudioBg3dTexturePaintStroke(paint, stroke);
    if (!next) {
      setNotice("획 한도에 닿아 다시 실행할 수 없습니다.");
      return;
    }
    setRedoStack((stack) => stack.slice(0, -1));
    setNotice(null);
    onPaintChange(primitive.id, next);
  };

  const handleClear = () => {
    if (!paint) return;
    setRedoStack([]);
    setNotice("표면 그림을 모두 지웠습니다. 실행 취소로 되돌릴 수 없습니다.");
    onPaintChange(primitive.id, null);
  };

  const handleExport = () => {
    try {
      const surface = new StudioBg3dTexturePaintSurface({
        createCanvas: (width, height) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          return canvas as unknown as StudioBg3dPaintCanvas;
        },
        baseColor: primitive.color,
        paint,
      });
      const url = surface.exportPngDataUrl();
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bg3d-texture-${primitive.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
      anchor.click();
      setNotice("텍스처 PNG를 내보냈습니다.");
    } catch {
      setNotice("이 환경에서는 텍스처 내보내기가 지원되지 않습니다.");
    }
  };

  return (
    <div className="flex flex-col gap-2.5 text-xs text-fg">
      <button
        type="button"
        disabled={controlsDisabled}
        aria-pressed={paintActive}
        onClick={() => onPaintActiveChange(!paintActive)}
        className={cx(
          CONTROL_BUTTON,
          paintActive && "border-accent/50 bg-accent-soft text-accent",
        )}
      >
        <Brush size={13} aria-hidden />
        {paintActive ? "표면에 그리는 중 — 끄기" : "표면에 직접 그리기"}
      </button>
      <p className="text-[0.68rem] leading-relaxed text-fg-3">
        {disabledReason
          ?? (paintActive
            ? "상자·원기둥 같은 도형 표면을 드래그하면 그 자리에 그림이 그려집니다. 그린 획은 저장하면 다시 열어도 유지됩니다."
            : "그리기 모드를 켜면 선택한 도형 표면에 브러시로 직접 그릴 수 있습니다.")}
      </p>

      <div className="flex items-center gap-1.5" role="group" aria-label="브러시 색상">
        {BRUSH_SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            disabled={controlsDisabled}
            aria-label={`브러시 색상 ${swatch}`}
            aria-pressed={brush.color === swatch}
            onClick={() => onBrushChange({ ...brush, color: swatch })}
            className={cx(
              "h-5 w-5 rounded-full border",
              brush.color === swatch ? "border-accent ring-2 ring-accent/40" : "border-line",
            )}
            style={{ backgroundColor: swatch }}
          />
        ))}
        <input
          type="color"
          aria-label="브러시 색상 직접 선택"
          disabled={controlsDisabled}
          value={brush.color}
          onChange={(event) => onBrushChange({ ...brush, color: event.target.value })}
          className="h-5 w-8 cursor-pointer rounded border border-line bg-card"
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[0.68rem] font-bold text-fg-2">
          브러시 크기 {(brush.size * 100).toFixed(0)}%
        </span>
        <input
          type="range"
          min={0.01}
          max={0.2}
          step={0.005}
          disabled={controlsDisabled}
          value={brush.size}
          onChange={(event) => onBrushChange({ ...brush, size: Number(event.target.value) })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[0.68rem] font-bold text-fg-2">
          불투명도 {Math.round(brush.opacity * 100)}%
        </span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          disabled={controlsDisabled}
          value={brush.opacity}
          onChange={(event) => onBrushChange({ ...brush, opacity: Number(event.target.value) })}
        />
      </label>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={controlsDisabled || strokeCount === 0}
          onClick={handleUndo}
          className={CONTROL_BUTTON}
        >
          <Undo2 size={13} aria-hidden /> 실행 취소
        </button>
        <button
          type="button"
          disabled={controlsDisabled || redoStack.length === 0}
          onClick={handleRedo}
          className={CONTROL_BUTTON}
        >
          <Redo2 size={13} aria-hidden /> 다시 실행
        </button>
        <button
          type="button"
          disabled={controlsDisabled || strokeCount === 0}
          onClick={handleClear}
          className={CONTROL_BUTTON}
        >
          <Eraser size={13} aria-hidden /> 전체 지우기
        </button>
        <button
          type="button"
          disabled={controlsDisabled || strokeCount === 0}
          onClick={handleExport}
          className={CONTROL_BUTTON}
        >
          <Download size={13} aria-hidden /> 텍스처 내보내기
        </button>
      </div>

      <p className="text-[0.68rem] text-fg-3" role="status">
        획 {strokeCount}/{STUDIO_BG3D_TEXTURE_PAINT_MAX_STROKES}개 · 점 {pointCount}개
        {notice ? ` — ${notice}` : ""}
      </p>
    </div>
  );
}
