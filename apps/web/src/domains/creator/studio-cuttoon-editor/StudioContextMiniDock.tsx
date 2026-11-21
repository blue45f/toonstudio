import {
  Box,
  Columns2,
  Compass,
  FlipHorizontal2,
  Layers,
  MessageCircle,
  PenTool,
  SlidersHorizontal,
} from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export type StudioContextMiniDockMode = "pen" | "eraser" | "select" | "bubble" | "bg3d";

export interface StudioContextMiniDockProps {
  readonly mode: StudioContextMiniDockMode;
  readonly strokeWidth: number;
  readonly onStrokeWidthChange: (next: number) => void;
  readonly opacityPercent?: number;
  readonly onOpacityPercentChange?: (next: number) => void;
  readonly stabilizer?: number;
  readonly onCycleStabilizer?: () => void;
  readonly color?: string;
  readonly symmetryActive?: boolean;
  readonly onToggleSymmetry?: () => void;
  readonly flipActive?: boolean;
  readonly onToggleFlip?: () => void;
  readonly disabled?: boolean;
  readonly onOpenQuickWheel?: () => void;
  readonly onReturnToPen?: () => void;
  readonly onOpenLayers?: () => void;
  readonly onOpenBubblePicker?: () => void;
  readonly onToggleBg3d?: () => void;
  readonly className?: string;
}

interface ScrubberProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly unit: string;
  readonly pxPerStep?: number;
  readonly disabled?: boolean;
  readonly dotColor?: string;
  readonly onChange: (next: number) => void;
  readonly testAttr: string;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** 좌우 포인터 드래그 및 키보드로 수치를 조절하는 44px 스크러버. */
function StudioNumericScrubber({
  label,
  value,
  min,
  max,
  unit,
  pxPerStep = 4,
  disabled = false,
  dotColor,
  onChange,
  testAttr,
}: ScrubberProps) {
  const dragOriginRef = useRef<{ startX: number; startValue: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const safeValue = clampInt(value, min, max);
  const ratio = max > min ? (safeValue - min) / (max - min) : 0;

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    dragOriginRef.current = { startX: event.clientX, startValue: safeValue };
    setScrubbing(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // jsdom 등 캡처 미지원 환경 폴백
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const origin = dragOriginRef.current;
    if (!origin || disabled) return;
    const multiplier = event.shiftKey ? 5 : event.altKey ? 0.5 : 1;
    const deltaSteps = Math.round(((event.clientX - origin.startX) / pxPerStep) * multiplier);
    const next = clampInt(origin.startValue + deltaSteps, min, max);
    if (next !== safeValue) {
      onChange(next);
    }
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragOriginRef.current) return;
    dragOriginRef.current = null;
    setScrubbing(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // 안전 해제
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onChange(clampInt(safeValue + step, min, max));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onChange(clampInt(safeValue - step, min, max));
    } else if (event.key === "Home") {
      event.preventDefault();
      onChange(min);
    } else if (event.key === "End") {
      event.preventDefault();
      onChange(max);
    }
  };

  const previewDiameter = Math.max(4, Math.min(12, Math.round(4 + ratio * 8)));

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={safeValue}
      aria-valuetext={`${safeValue}${unit}`}
      aria-disabled={disabled || undefined}
      data-studio-mini-scrubber={testAttr}
      data-scrubbing={scrubbing ? "true" : "false"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
      title={`${label} ${safeValue}${unit} — 좌우로 드래그해 조절`}
      className={cn(
        "relative inline-flex min-h-11 min-w-[5.75rem] select-none items-center justify-between gap-2 overflow-hidden rounded-[var(--atelier-radius-inner,10px)] border border-line bg-card px-2.5 text-xs font-medium text-fg tabular-nums touch-none transition-colors duration-150 motion-reduce:transition-none",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-ew-resize hover:border-line-strong hover:bg-raised",
        scrubbing && "border-accent bg-accent-soft",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 bg-accent-soft/60"
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
      <span className="relative z-10 inline-flex items-center gap-1.5 text-fg-2">
        {dotColor ? (
          <span
            aria-hidden="true"
            className="shrink-0 rounded-full border border-line-strong"
            style={{
              width: `${previewDiameter}px`,
              height: `${previewDiameter}px`,
              backgroundColor: dotColor,
            }}
          />
        ) : null}
        <span>{label}</span>
      </span>
      <span className="relative z-10 font-semibold text-fg">
        {safeValue}
        {unit}
      </span>
    </div>
  );
}

/**
 * 선택된 작업 모드(펜·지우개·선택·말풍선·3D 배경)에 맞춰 5~7개 핵심 컨트롤만 노출하는
 * 44px 상황 인식 플로팅 캡슐 독.
 */
export function StudioContextMiniDock({
  mode,
  strokeWidth,
  onStrokeWidthChange,
  opacityPercent = 100,
  onOpacityPercentChange,
  stabilizer = 0,
  onCycleStabilizer,
  color = "var(--color-fg)",
  symmetryActive = false,
  onToggleSymmetry,
  flipActive = false,
  onToggleFlip,
  disabled = false,
  onOpenQuickWheel,
  onReturnToPen,
  onOpenLayers,
  onOpenBubblePicker,
  onToggleBg3d,
  className,
}: StudioContextMiniDockProps) {
  const bt = useBilingual("StudioContextMiniDock");

  const chipClass =
    "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-[var(--atelier-radius-inner,10px)] border border-transparent px-2.5 text-xs font-medium text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";

  return (
    <div
      role="toolbar"
      aria-label={bt("상황 인식 미니 도구 독", "Context-aware mini tool dock")}
      data-studio-context-mini-dock="true"
      data-studio-context-mode={mode}
      className={cn(
        "inline-flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-[var(--atelier-radius-outer,14px)] border border-line-strong bg-panel/95 p-1 text-fg shadow-[var(--atelier-elevation-dock)]",
        className,
      )}
    >
      {(mode === "pen" || mode === "eraser") && (
        <>
          <StudioNumericScrubber
            label={bt("두께", "Size")}
            value={strokeWidth}
            min={1}
            max={200}
            unit="px"
            pxPerStep={3}
            disabled={disabled}
            dotColor={mode === "eraser" ? "var(--color-fg-3)" : color}
            onChange={onStrokeWidthChange}
            testAttr="size"
          />
          {onOpacityPercentChange ? (
            <StudioNumericScrubber
              label={mode === "eraser" ? bt("강도", "Strength") : bt("농도", "Opacity")}
              value={opacityPercent}
              min={1}
              max={100}
              unit="%"
              pxPerStep={2}
              disabled={disabled}
              onChange={onOpacityPercentChange}
              testAttr="opacity"
            />
          ) : null}
          {mode === "pen" && onCycleStabilizer ? (
            <button
              type="button"
              disabled={disabled}
              aria-pressed={stabilizer > 0}
              onClick={onCycleStabilizer}
              className={cn(
                chipClass,
                stabilizer > 0 && "border-accent/40 bg-accent-soft text-fg font-semibold",
              )}
            >
              <SlidersHorizontal size={14} strokeWidth={1.65} aria-hidden="true" />
              <span className="tabular-nums">
                {bt("보정", "Stab")} {Math.max(0, Math.min(3, Math.round(stabilizer)))}
              </span>
            </button>
          ) : null}
          {mode === "pen" && onToggleSymmetry ? (
            <button
              type="button"
              disabled={disabled}
              aria-pressed={symmetryActive}
              onClick={onToggleSymmetry}
              className={cn(
                chipClass,
                symmetryActive && "border-accent/40 bg-accent-soft text-fg font-semibold",
              )}
            >
              <Columns2 size={14} strokeWidth={1.65} aria-hidden="true" />
              <span>{bt("대칭", "Symmetry")}</span>
            </button>
          ) : null}
          {mode === "eraser" && onReturnToPen ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onReturnToPen}
              className={chipClass}
            >
              <PenTool size={14} strokeWidth={1.65} aria-hidden="true" />
              <span>{bt("펜으로 복귀", "Back to pen")}</span>
            </button>
          ) : null}
        </>
      )}

      {mode === "select" && (
        <>
          {onToggleFlip ? (
            <button
              type="button"
              aria-pressed={flipActive}
              onClick={onToggleFlip}
              className={cn(
                chipClass,
                flipActive && "border-accent/40 bg-accent-soft text-fg font-semibold",
              )}
            >
              <FlipHorizontal2 size={14} strokeWidth={1.65} aria-hidden="true" />
              <span>{bt("좌우 반전", "Flip view")}</span>
            </button>
          ) : null}
          {onOpenLayers ? (
            <button type="button" onClick={onOpenLayers} className={chipClass}>
              <Layers size={14} strokeWidth={1.65} aria-hidden="true" />
              <span>{bt("레이어", "Layers")}</span>
            </button>
          ) : null}
          {onReturnToPen ? (
            <button type="button" disabled={disabled} onClick={onReturnToPen} className={chipClass}>
              <PenTool size={14} strokeWidth={1.65} aria-hidden="true" />
              <span>{bt("펜 전환", "Pen")}</span>
            </button>
          ) : null}
        </>
      )}

      {mode === "bubble" && (
        <>
          {onOpenBubblePicker ? (
            <button
              type="button"
              onClick={onOpenBubblePicker}
              className={cn(chipClass, "border-accent/40 bg-accent-soft text-fg font-semibold")}
            >
              <MessageCircle size={14} strokeWidth={1.65} aria-hidden="true" />
              <span>{bt("말풍선 스타일", "Bubble styles")}</span>
            </button>
          ) : null}
          {onReturnToPen ? (
            <button type="button" disabled={disabled} onClick={onReturnToPen} className={chipClass}>
              <PenTool size={14} strokeWidth={1.65} aria-hidden="true" />
              <span>{bt("작화로 복귀", "Draw")}</span>
            </button>
          ) : null}
        </>
      )}

      {mode === "bg3d" && (
        <>
          {onToggleBg3d ? (
            <button
              type="button"
              aria-pressed
              onClick={onToggleBg3d}
              className={cn(chipClass, "border-accent/40 bg-accent-soft text-fg font-semibold")}
            >
              <Box size={14} strokeWidth={1.65} aria-hidden="true" />
              <span>{bt("3D 스테이지", "3D Stage")}</span>
            </button>
          ) : null}
          {onToggleFlip ? (
            <button
              type="button"
              aria-pressed={flipActive}
              onClick={onToggleFlip}
              className={chipClass}
            >
              <FlipHorizontal2 size={14} strokeWidth={1.65} aria-hidden="true" />
              <span>{bt("구도 반전", "Flip angle")}</span>
            </button>
          ) : null}
        </>
      )}

      {onOpenQuickWheel ? (
        <button
          type="button"
          onClick={onOpenQuickWheel}
          aria-keyshortcuts="Q"
          data-studio-open-quick-wheel="true"
          className={cn(chipClass, "border-line bg-card text-fg")}
          title={bt("방사형 퀵 휠 열기 (Q)", "Open radial quick wheel (Q)")}
        >
          <Compass size={14} strokeWidth={1.65} aria-hidden="true" />
          <span>{bt("퀵 휠", "Wheel")}</span>
          <kbd className="rounded border border-line bg-panel px-1 text-xs font-semibold text-fg-2">
            Q
          </kbd>
        </button>
      ) : null}
    </div>
  );
}
