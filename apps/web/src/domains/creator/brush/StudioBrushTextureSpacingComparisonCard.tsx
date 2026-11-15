import { useMemo, useState, type ReactElement } from "react";

import { resolveStudioStampBrushKind } from "./studio-brush-stamp-engine";
import {
  evaluateBrushTextureLongStrokeComparison,
  STUDIO_BRUSH_SPACING_PRESETS,
  type BrushTextureComparisonSampleStrip,
} from "./studio-brush-texture-spacing-parity";

import { cx } from "@/shared/lib/cx";

export interface StudioBrushTextureSpacingComparisonCardProps {
  readonly brushId: string;
  readonly strokeWidth: number;
  readonly color: string;
  readonly spacingRatio: number | null | undefined;
  readonly grainAmount?: number;
  readonly onSpacingRatioChange?: (nextRatio: number) => void;
  readonly className?: string;
}

export function StudioBrushTextureSpacingComparisonCard({
  brushId,
  strokeWidth,
  color,
  spacingRatio,
  grainAmount = 0.32,
  onSpacingRatioChange,
  className,
}: StudioBrushTextureSpacingComparisonCardProps): ReactElement {
  const [selectedStripId, setSelectedStripId] =
    useState<BrushTextureComparisonSampleStrip["id"]>("zoom-100");
  const resolvedKind = resolveStudioStampBrushKind(brushId) ?? "charcoal";
  const comparison = useMemo(
    () =>
      evaluateBrushTextureLongStrokeComparison({
        kind: resolvedKind,
        brushSizeDocumentPx: Math.max(6, Math.min(28, strokeWidth)),
        spacingRatio,
        grainAmount,
      }),
    [grainAmount, resolvedKind, spacingRatio, strokeWidth],
  );
  const activeStrip =
    comparison.strips.find((strip) => strip.id === selectedStripId)
    ?? comparison.strips[0]!;
  const effectivePct = Math.round(comparison.spacing.effectiveSpacingRatio * 100);

  return (
    <section
      aria-label="브러시 텍스처·간격 비교 샘플"
      data-studio-brush-texture-comparison="true"
      className={cx(
        "space-y-2 rounded-xl border border-line/70 bg-card/55 p-2.5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.7rem] font-semibold text-fg-2">
          브러시 텍스처·간격 일관성
        </span>
        <span className="rounded-full border border-good/35 bg-good/10 px-2 py-0.5 text-[0.56rem] font-bold tabular-nums text-good">
          확대 오차 {comparison.zoomDriftMaxDocPx.toFixed(1)}px · 간격 {effectivePct}%
        </span>
      </div>

      {comparison.spacing.clampedForTextureContinuity ? (
        <p className="rounded-md border border-warn/35 bg-warn/10 px-2 py-1 text-[0.58rem] text-warn">
          질감 구슬 끊김을 막기 위해 문서 간격을 28% 상한으로 자동 보정했습니다.
        </p>
      ) : null}

      {onSpacingRatioChange ? (
        <div
          role="group"
          aria-label="브러시 간격 프리셋"
          className="grid grid-cols-3 gap-1"
        >
          {STUDIO_BRUSH_SPACING_PRESETS.map((preset) => {
            const active =
              Math.abs(comparison.spacing.effectiveSpacingRatio - preset.spacingRatio) < 0.015;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                data-studio-brush-spacing-preset={preset.id}
                onClick={() => onSpacingRatioChange(preset.spacingRatio)}
                title={preset.description}
                className={cx(
                  "min-h-7 rounded-lg border px-1.5 text-[0.6rem] font-semibold transition-colors",
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:border-accent/45 hover:bg-raised",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="텍스처·간격 비교 샘플 배율"
        className="grid grid-cols-3 gap-1"
      >
        {comparison.strips.map((strip) => {
          const selected = strip.id === activeStrip.id;
          return (
            <button
              key={strip.id}
              type="button"
              role="tab"
              aria-selected={selected}
              data-studio-texture-strip-tab={strip.id}
              onClick={() => setSelectedStripId(strip.id)}
              className={cx(
                "min-h-7 rounded-md border px-1.5 text-[0.58rem] font-semibold transition-colors",
                selected
                  ? "border-accent/55 bg-accent-soft/45 text-fg"
                  : "border-line/70 bg-raised/45 text-fg-3 hover:text-fg-2",
              )}
            >
              {strip.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-line/65 bg-card/95 px-2 py-1.5 text-fg">
        <div className="mb-1 flex items-center justify-between gap-2 text-[0.56rem] text-fg-2">
          <span>{activeStrip.subtitle}</span>
          <span className="tabular-nums">
            샘플 {activeStrip.dabs.length}개 · 문서 간격 {comparison.spacing.spacingDocumentPx.toFixed(1)}px
          </span>
        </div>
        <svg
          viewBox={activeStrip.zoomScale > 1 ? "40 6 76 36" : "0 0 184 48"}
          className="h-11 w-full rounded"
          role="img"
          aria-label={`${activeStrip.label} 브러시 질감 비교 샘플`}
        >
          {activeStrip.dabs.map((dab) => (
            <circle
              key={dab.index}
              cx={dab.x}
              cy={dab.y}
              r={Math.max(1.2, Math.min(9, dab.radius * 0.72))}
              fill={color || "#1e293b"}
              fillOpacity={Math.max(0.14, Math.min(0.92, dab.alpha))}
            />
          ))}
        </svg>
      </div>
    </section>
  );
}
