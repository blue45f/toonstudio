import { useState } from "react";
import { Brush, Download, Eraser, Redo2, Undo2 } from "lucide-react";

import {
  STUDIO_BG3D_CONTROL_BUTTON as CONTROL_BUTTON,
  studioBg3dClassNames as cx,
} from "./studio-bg3d-editor-ui";
import {
  appendStudioBg3dTexturePaintStroke,
  countStudioBg3dTexturePaintPoints,
  removeLastStudioBg3dTexturePaintStroke,
  type StudioBg3dTexturePaint,
  type StudioBg3dTexturePaintBrush,
  type StudioBg3dTexturePaintStroke,
} from "./studio-bg3d-texture-paint";
import {
  STUDIO_BG3D_TEXTURE_PAINT_MAX_STROKES,
} from "./studio-bg3d-texture-paint";
import {
  StudioBg3dGlbTexturePaintSurface,
  getStudioBg3dModelTexturePaintForTarget,
  resolveStudioBg3dGlbTexturePaintSize,
  resolveStudioBg3dSeamPaddingPasses,
  upsertStudioBg3dModelTexturePaintTarget,
  type StudioBg3dGlbPaintability,
  type StudioBg3dGlbPaintCanvas,
  type StudioBg3dModelTexturePaint,
} from "./studio-bg3d-glb-texture-paint";

import type { BgCustomModelInstance } from "../studio-background-3d-model";

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

export interface StudioBg3dGlbTexturePaintPanelProps {
  readonly instance: BgCustomModelInstance;
  /**
   * GLB 구조 판정(analyzeStudioBg3dGlbPaintability 결과). null이면 아직 확인 중 —
   * 그릴 수 있는 것처럼 보이지 않게 로딩 안내를 띄운다.
   */
  readonly paintability: StudioBg3dGlbPaintability | null;
  readonly paintActive: boolean;
  readonly onPaintActiveChange: (active: boolean) => void;
  readonly brush: StudioBg3dTexturePaintBrush;
  readonly onBrushChange: (brush: StudioBg3dTexturePaintBrush) => void;
  readonly activeTargetKey: string | null;
  readonly onActiveTargetChange: (targetKey: string) => void;
  /** 페인트 변경을 정본 상태(모델 인스턴스 → 문서)에 반영하는 유일한 통로. */
  readonly onPaintChange: (id: string, paint: StudioBg3dModelTexturePaint | null) => void;
  /**
   * 내보내기 합성에 쓸 원본 텍스처 이미지(호스트가 로드한 텍스처에서 제공).
   * 없으면 내보내기는 정직하게 비활성 안내로 떨어진다.
   */
  readonly baseImageSource?: unknown | null;
  readonly baseImageSize?: { readonly width: number; readonly height: number } | null;
  readonly disabled?: boolean;
}

/**
 * 3D 표면 직접 그리기 2단계 패널 — GLB 모델 텍스처 페인팅.
 * 칠할 수 없는 모델(외부 텍스처 참조·텍스처 없음·UV 없음)에서는 컨트롤을 여는 대신
 * 이유와 대안을 안내한다. 캐릭터 스킨 대상은 심 보정 적용을 배지로 명시한다.
 */
export function StudioBg3dGlbTexturePaintPanel({
  instance,
  paintability,
  paintActive,
  onPaintActiveChange,
  brush,
  onBrushChange,
  activeTargetKey,
  onActiveTargetChange,
  onPaintChange,
  baseImageSource = null,
  baseImageSize = null,
  disabled = false,
}: StudioBg3dGlbTexturePaintPanelProps) {
  const [redoStack, setRedoStack] = useState<readonly StudioBg3dTexturePaintStroke[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const paint = instance.modelTexturePaint ?? null;
  const paintable = paintability?.status === "paintable";
  const targets = paintability?.targets ?? [];
  const activeTarget = targets.find((target) => target.targetKey === activeTargetKey)
    ?? targets[0]
    ?? null;
  const targetPaint = activeTarget
    ? getStudioBg3dModelTexturePaintForTarget(paint, activeTarget.targetKey)
    : null;
  const strokeCount = targetPaint?.strokes.length ?? 0;
  const pointCount = countStudioBg3dTexturePaintPoints(targetPaint);
  const controlsDisabled = disabled || !paintable;
  const seamPasses = activeTarget
    ? resolveStudioBg3dSeamPaddingPasses({
        skinned: activeTarget.skinned,
        width: baseImageSize?.width ?? 512,
        height: baseImageSize?.height ?? 512,
      })
    : 0;

  const commitTargetPaint = (next: StudioBg3dTexturePaint | null) => {
    if (!activeTarget) return;
    onPaintChange(instance.id, upsertStudioBg3dModelTexturePaintTarget(paint, activeTarget.targetKey, next));
  };

  const handleUndo = () => {
    const { paint: next, removed } = removeLastStudioBg3dTexturePaintStroke(targetPaint);
    if (!removed) return;
    setRedoStack((stack) => [...stack, removed]);
    setNotice(null);
    commitTargetPaint(next);
  };

  const handleRedo = () => {
    const stroke = redoStack[redoStack.length - 1];
    if (!stroke) return;
    const next = appendStudioBg3dTexturePaintStroke(targetPaint, stroke);
    if (!next) {
      setNotice("획 한도에 닿아 다시 실행할 수 없습니다.");
      return;
    }
    setRedoStack((stack) => stack.slice(0, -1));
    setNotice(null);
    commitTargetPaint(next);
  };

  const handleClear = () => {
    if (!targetPaint) return;
    setRedoStack([]);
    setNotice("이 텍스처의 그림을 모두 지웠습니다. 실행 취소로 되돌릴 수 없습니다.");
    commitTargetPaint(null);
  };

  const handleExport = () => {
    if (!activeTarget || !targetPaint) return;
    if (!baseImageSource || !baseImageSize) {
      setNotice("원본 텍스처 이미지를 불러오지 못해 내보낼 수 없습니다. 모델이 화면에 표시된 뒤 다시 시도해 주세요.");
      return;
    }
    try {
      const size = resolveStudioBg3dGlbTexturePaintSize(baseImageSize.width, baseImageSize.height);
      const surface = new StudioBg3dGlbTexturePaintSurface({
        createCanvas: (width, height) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          return canvas as unknown as StudioBg3dGlbPaintCanvas;
        },
        width: size.width,
        height: size.height,
        drawBase: (context, width, height) => {
          context.drawImage(baseImageSource, 0, 0, width, height);
        },
        paint: targetPaint,
        seamPasses,
        wrapU: activeTarget.wrapRepeat,
        wrapV: activeTarget.wrapRepeat,
      });
      const url = surface.exportPngDataUrl();
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bg3d-glb-texture-${instance.id.replace(/[^a-zA-Z0-9_-]/g, "_")}-${activeTarget.targetKey.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
      anchor.click();
      setNotice(
        size.capped
          ? "텍스처 PNG를 내보냈습니다. 원본이 2048px보다 커서 페인트 해상도는 2048px로 맞췄습니다."
          : "텍스처 PNG를 내보냈습니다.",
      );
    } catch {
      setNotice("이 환경에서는 텍스처 내보내기가 지원되지 않습니다.");
    }
  };

  if (!paintability) {
    return (
      <div className="flex flex-col gap-2.5 text-xs text-fg">
        <p className="text-[0.68rem] leading-relaxed text-fg-3" role="status">
          모델의 텍스처 구조를 확인하는 중입니다. 확인할 때까지 표면 그리기를 시작할 수 없습니다.
        </p>
      </div>
    );
  }

  if (!paintable) {
    return (
      <div className="flex flex-col gap-2.5 text-xs text-fg">
        <div
          role="status"
          className="rounded-md border border-line bg-card px-2.5 py-2 text-[0.68rem] leading-relaxed text-fg-2"
        >
          <span className="mb-1 flex items-center gap-1.5 font-bold text-fg">
            <Brush size={13} aria-hidden /> 이 모델은 표면에 그릴 수 없습니다
          </span>
          {paintability.message}
        </div>
      </div>
    );
  }

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
        {paintActive ? "모델 표면에 그리는 중 — 끄기" : "모델 표면에 직접 그리기"}
      </button>
      <p className="text-[0.68rem] leading-relaxed text-fg-3">
        {paintActive
          ? "모델 표면을 드래그하면 그 자리의 텍스처에 그림이 그려집니다. 그린 획은 저장하면 다시 열어도 유지됩니다."
          : "그리기 모드를 켜면 선택한 모델의 텍스처에 브러시로 직접 그릴 수 있습니다."}
      </p>

      {targets.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="페인트할 텍스처">
          {targets.map((target, index) => (
            <button
              key={target.targetKey}
              type="button"
              disabled={controlsDisabled}
              aria-pressed={activeTarget?.targetKey === target.targetKey}
              onClick={() => {
                setRedoStack([]);
                setNotice(null);
                onActiveTargetChange(target.targetKey);
              }}
              className={cx(
                CONTROL_BUTTON,
                activeTarget?.targetKey === target.targetKey
                  && "border-accent/50 bg-accent-soft text-accent",
              )}
            >
              텍스처 {index + 1}
              {target.skinned ? " · 캐릭터 스킨" : ""}
            </button>
          ))}
        </div>
      ) : activeTarget?.skinned ? (
        <p className="text-[0.68rem] font-bold text-fg-2">캐릭터 스킨 텍스처 — 심 보정이 적용됩니다.</p>
      ) : null}

      <p className="text-[0.68rem] leading-relaxed text-fg-3">
        심 보정: UV 경계를 넘는 획은 반대편에 이어 그리고, 아일랜드 경계는 {seamPasses}텍셀
        블리드로 메웁니다. 아일랜드를 건너는 드래그는 자동으로 끊어 번짐을 막습니다.
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
