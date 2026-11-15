/**
 * Stroke-width & vector intersection editing controls.
 * Uses ToonStudio task language and the shared Studio visual tokens.
 */

import { Check, Edit3, RotateCcw, Scissors, Sparkles } from "lucide-react";
import { useState } from "react";

import {
  calculateAdjustedStrokeWidth,
  LINE_WIDTH_PRESETS,
  type LineWidthAction,
  type LineWidthAdjustmentOptions,
  type LineWidthSegmentTarget,
} from "./studio-line-width-adjust";
import {
  STUDIO_ERASE_TO_INTERSECTION_LABEL,
  STUDIO_ERASE_TO_INTERSECTION_TIP,
} from "../studio-vector-erase-to-intersection";

import { cn } from "@/shared/lib/utils";

export interface StudioLineWidthAdjustmentPanelProps {
  readonly currentWidth?: number;
  readonly selectedVectorStrokeWidth?: number | null;
  readonly hasSelectedVectorStroke?: boolean;
  readonly canRestoreOriginalWidth?: boolean;
  readonly onRestoreOriginalWidth?: () => void;
  readonly eraseToIntersectionActive?: boolean;
  readonly onToggleEraseToIntersection?: () => void;
  readonly onApply: (options: LineWidthAdjustmentOptions) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

const ACTION_TABS: readonly { id: LineWidthAction; label: string }[] = [
  { id: "thicken", label: "굵게" },
  { id: "narrow", label: "가늘게" },
  { id: "scale", label: "배율 (×)" },
  { id: "fix", label: "고정" },
];

const SEGMENT_TABS: readonly { id: LineWidthSegmentTarget; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "start", label: "앞부분" },
  { id: "middle", label: "중간" },
  { id: "end", label: "끝부분" },
];

export function StudioLineWidthAdjustmentPanel({
  currentWidth = 4,
  selectedVectorStrokeWidth = null,
  hasSelectedVectorStroke = false,
  canRestoreOriginalWidth = false,
  onRestoreOriginalWidth,
  eraseToIntersectionActive = false,
  onToggleEraseToIntersection,
  onApply,
  disabled = false,
  className,
}: StudioLineWidthAdjustmentPanelProps) {
  const [action, setAction] = useState<LineWidthAction>("thicken");
  const [value, setValue] = useState<number>(2);
  const [scalePressures, setScalePressures] = useState<boolean>(true);
  const [segment, setSegment] = useState<LineWidthSegmentTarget>("all");

  const effectiveBaseWidth =
    hasSelectedVectorStroke && selectedVectorStrokeWidth !== null
      ? selectedVectorStrokeWidth
      : currentWidth;

  const previewWidth = calculateAdjustedStrokeWidth(effectiveBaseWidth, {
    action,
    value,
    scalePressures,
    segment,
  });

  const handleApplyPreset = (presetOptions: LineWidthAdjustmentOptions) => {
    setAction(presetOptions.action);
    setValue(presetOptions.value);
  };

  const handleExecute = () => {
    onApply({
      action,
      value,
      scalePressures,
      ...(segment !== "all" ? { segment } : {}),
    });
  };

  return (
    <div
      data-studio-vector-ink-panel="true"
      className={cn(
        "space-y-2 rounded-xl border border-line bg-card p-3 text-xs text-fg shadow-sm select-none",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-line/60">
        <div className="flex items-center gap-1.5 min-w-0">
          <Edit3 size={14} className="shrink-0 text-accent" aria-hidden />
          <span className="truncate font-semibold">선 굵기 조절</span>
          {hasSelectedVectorStroke ? (
            <span className="rounded-full bg-accent/12 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              벡터 비파괴
            </span>
          ) : null}
        </div>
        <span className="font-mono text-[10px] text-fg-3">
          {effectiveBaseWidth}px → {previewWidth}px
        </span>
      </div>

      {/* Vector Intersection Eraser Quick Door */}
      {onToggleEraseToIntersection ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-line/70 bg-panel/70 px-2.5 py-1.5">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-fg">
              {STUDIO_ERASE_TO_INTERSECTION_LABEL}
            </div>
            <div className="truncate text-[10px] text-fg-3" title={STUDIO_ERASE_TO_INTERSECTION_TIP}>
              교차선 사이 삐져나온 벡터 선분만 깔끔히 절단
            </div>
          </div>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={eraseToIntersectionActive}
            data-studio-vector-ink-intersection-eraser="true"
            onClick={onToggleEraseToIntersection}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors disabled:opacity-50",
              eraseToIntersectionActive
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-fg",
            )}
          >
            <Scissors size={11} aria-hidden />
            <span>{eraseToIntersectionActive ? "켜짐" : "켜기"}</span>
          </button>
        </div>
      ) : null}

      {/* Preset Chips */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        <Sparkles size={11} className="shrink-0 text-accent" aria-hidden />
        {LINE_WIDTH_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => handleApplyPreset(preset.options)}
            disabled={disabled}
            className="whitespace-nowrap rounded-full border border-line bg-raised px-2 py-0.5 text-[10px] text-fg-2 transition-colors hover:border-accent/35 hover:text-fg disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Action Mode Tabs */}
      <div className="grid grid-cols-4 gap-1 rounded-lg border border-line/60 bg-panel p-0.5">
        {ACTION_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setAction(tab.id)}
            disabled={disabled}
            className={cn(
              "py-1 rounded text-[10px] text-center font-medium transition-colors",
              action === tab.id
                ? "bg-accent text-on-accent shadow-sm"
                : "text-fg-3 hover:bg-raised hover:text-fg",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Segment Range Tabs (Whole line vs Start / Middle / End non-destructive taper) */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-fg-3">
          <span>편집 구간 (벡터 정점 유지)</span>
          <span>{segment === "all" ? "선 전체" : `${SEGMENT_TABS.find((t) => t.id === segment)?.label ?? ""} 부분 변조`}</span>
        </div>
        <div
          role="group"
          aria-label="벡터 선폭 편집 구간"
          className="grid grid-cols-4 gap-1 rounded-lg border border-line/60 bg-panel p-0.5"
        >
          {SEGMENT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={segment === tab.id}
              onClick={() => setSegment(tab.id)}
              disabled={disabled}
              className={cn(
                "py-0.5 rounded text-[10px] text-center font-medium transition-colors",
                segment === tab.id
                  ? "bg-raised text-accent shadow-sm"
                  : "text-fg-3 hover:text-fg",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Value Slider & Controls */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-fg-2">
          <span>{action === "scale" ? "배율" : "변화 폭"}</span>
          <span className="font-mono text-accent">
            {action === "scale" ? `${value}x` : `${value}px`}
          </span>
        </div>
        <input
          type="range"
          min={action === "scale" ? 0.2 : 0.5}
          max={action === "scale" ? 3.0 : 30}
          step={action === "scale" ? 0.1 : 0.5}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label="선폭 조절 값"
          className="w-full cursor-pointer accent-accent"
        />
      </div>

      {/* Stylus Pressure Scaling Checkbox */}
      <label className="flex cursor-pointer items-center gap-1.5 pt-0.5 text-[11px] text-fg-2">
        <input
          type="checkbox"
          checked={scalePressures}
          disabled={disabled}
          onChange={(e) => setScalePressures(e.target.checked)}
          className="size-3.5 cursor-pointer rounded border-line bg-panel text-accent focus:ring-accent"
        />
        <span>필압 변화도 함께 조절</span>
      </label>

      {/* Apply & Non-Destructive Restore Buttons */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleExecute}
          disabled={disabled}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-xs font-medium text-on-accent shadow-sm transition-transform hover:bg-accent-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check size={13} aria-hidden />
          <span>선택한 선에 적용</span>
        </button>
        {hasSelectedVectorStroke && canRestoreOriginalWidth && onRestoreOriginalWidth ? (
          <button
            type="button"
            onClick={onRestoreOriginalWidth}
            disabled={disabled}
            aria-label="선택한 벡터 선 원본 굵기 복원"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[11px] font-medium text-fg-2 transition-colors hover:border-accent/40 hover:text-fg disabled:opacity-50"
          >
            <RotateCcw size={12} aria-hidden />
            <span>원본 굵기</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default StudioLineWidthAdjustmentPanel;
