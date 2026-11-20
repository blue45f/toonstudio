import { GripVertical } from "lucide-react";
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface StudioSplitWipeOverlayProps {
  readonly ratio: number;
  readonly onRatioChange: (next: number) => void;
  readonly leftLabel: string;
  readonly rightLabel: string;
  readonly leftContent: ReactNode;
  readonly rightContent: ReactNode;
  readonly className?: string;
  readonly ariaLabel?: string;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

/**
 * 2D·3D 또는 전·후 비교용 스플릿 와이프 오버레이.
 * GPU clip-path(inset)와 포인터 캡처·키보드 슬라이더를 사용해 레이아웃 재계산 없이 60fps로 분할한다.
 */
export function StudioSplitWipeOverlay({
  ratio,
  onRatioChange,
  leftLabel,
  rightLabel,
  leftContent,
  rightContent,
  className,
  ariaLabel,
}: StudioSplitWipeOverlayProps) {
  const bt = useBilingual("StudioSplitWipeOverlay");
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const safeRatio = clampRatio(ratio);
  const percent = Number((safeRatio * 100).toFixed(2));
  const roundedPercent = Math.round(percent);
  const rightPercent = 100 - roundedPercent;

  const commitRatioFromClientX = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const next = clampRatio((clientX - rect.left) / rect.width);
      onRatioChange(next);
    },
    [onRatioChange],
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 일부 테스트 환경(jsdom)에서는 setPointerCapture가 구현되지 않을 수 있다.
    }
    commitRatioFromClientX(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    commitRatioFromClientX(event.clientX);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // 안전 해제
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onRatioChange(clampRatio(safeRatio - step));
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onRatioChange(clampRatio(safeRatio + step));
    } else if (event.key === "Home") {
      event.preventDefault();
      onRatioChange(0);
    } else if (event.key === "End") {
      event.preventDefault();
      onRatioChange(1);
    }
  };

  const resolvedAriaLabel =
    ariaLabel ?? bt(`${leftLabel}과 ${rightLabel} 비교 분할선`, `Compare ${leftLabel} and ${rightLabel}`);

  return (
    <div
      ref={containerRef}
      data-studio-split-wipe="true"
      data-dragging={dragging ? "true" : "false"}
      className={cn(
        "relative select-none overflow-hidden rounded-[var(--atelier-radius-outer,14px)] border border-line-strong bg-canvas",
        className,
      )}
    >
      <div
        data-studio-split-wipe-right="true"
        className="relative h-full w-full"
      >
        {rightContent}
      </div>

      <div
        data-studio-split-wipe-left="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ clipPath: `inset(0 ${(100 - percent).toFixed(2)}% 0 0)` }}
      >
        {leftContent}
      </div>

      <span
        data-studio-split-wipe-label="left"
        className="pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-panel/90 px-2.5 py-1 text-xs font-semibold text-fg tabular-nums shadow-[var(--atelier-elevation-dock)]"
      >
        <span>{leftLabel}</span>
        <span className="text-fg-3">{roundedPercent}%</span>
      </span>

      <span
        data-studio-split-wipe-label="right"
        className="pointer-events-none absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-panel/90 px-2.5 py-1 text-xs font-semibold text-fg tabular-nums shadow-[var(--atelier-elevation-dock)]"
      >
        <span>{rightLabel}</span>
        <span className="text-fg-3">{rightPercent}%</span>
      </span>

      <div
        role="slider"
        tabIndex={0}
        aria-label={resolvedAriaLabel}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={roundedPercent}
        aria-valuetext={`${leftLabel} ${roundedPercent}%, ${rightLabel} ${rightPercent}%`}
        data-studio-split-wipe-handle="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={() => onRatioChange(0.5)}
        onKeyDown={handleKeyDown}
        style={{ left: `${percent}%` }}
        className={cn(
          "group absolute inset-y-0 z-20 flex w-11 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center focus-visible:outline-none",
        )}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-accent"
        />
        <span
          aria-hidden="true"
          className={cn(
            "relative grid size-11 place-items-center rounded-full border border-line-strong bg-panel text-fg shadow-[var(--atelier-elevation-dock)] transition-colors duration-150 motion-reduce:transition-none",
            "group-hover:border-accent group-hover:bg-raised group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent",
            dragging && "border-accent bg-accent-soft text-accent",
          )}
        >
          <GripVertical size={16} strokeWidth={1.75} />
        </span>
      </div>
    </div>
  );
}
