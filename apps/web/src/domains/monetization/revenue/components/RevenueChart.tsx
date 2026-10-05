/**
 * RevenueChart.tsx
 *
 * 월별 수익 막대 차트 (SVG, 라이브러리 미사용).
 * 막대는 테마 액센트 그라디언트로 채우고 가장 최근 달을 가장 진하게 강조한다.
 */
import { useId, useMemo } from "react";

import { useT } from "@/shared/lib/i18n";

import type { MonthlyRevenue } from "../models/revenue-model";

interface RevenueChartProps {
  readonly data: readonly MonthlyRevenue[];
  readonly className?: string;
}

const BAR_WIDTH = 44;
const BAR_GAP = 18;
const CHART_HEIGHT = 184;
const LABEL_HEIGHT = 24;

function formatShort(amount: number): string {
  if (amount >= 10_000) return `${Math.round(amount / 10_000)}만`;
  if (amount >= 1_000) return `${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}천`;
  return `${amount}`;
}

export function RevenueChart({ data, className }: RevenueChartProps) {
  const t = useT();
  const gradientId = `rev-bar-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const width = data.length * (BAR_WIDTH + BAR_GAP) + BAR_GAP;

  const bars = useMemo(() => {
    const max = Math.max(1, ...data.map((point) => point.amount));
    return data.map((point, index) => {
      const height = Math.max(4, Math.round((point.amount / max) * (CHART_HEIGHT - 8)));
      return {
        ...point,
        x: BAR_GAP + index * (BAR_WIDTH + BAR_GAP),
        y: CHART_HEIGHT - height,
        height,
        label: point.month.slice(5),
      };
    });
  }, [data]);

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">{t("revenue.chart.empty")}</p>
    );
  }

  return (
    <div className={className} role="img" aria-label={t("revenue.chart.ariaLabel")}>
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT + LABEL_HEIGHT}`}
        className="h-auto w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--color-accent-2)" }} />
            <stop offset="100%" style={{ stopColor: "var(--color-accent)" }} />
          </linearGradient>
        </defs>
        <line
          x1={0}
          x2={width}
          y1={CHART_HEIGHT}
          y2={CHART_HEIGHT}
          strokeWidth={1}
          className="stroke-line"
        />
        {bars.map((bar, index) => (
          <g key={bar.month}>
            <rect
              x={bar.x}
              y={bar.y}
              width={BAR_WIDTH}
              height={bar.height}
              rx={6}
              fill={`url(#${gradientId})`}
              opacity={index === bars.length - 1 ? 1 : 0.45}
            />
            <text
              x={bar.x + BAR_WIDTH / 2}
              y={CHART_HEIGHT + 16}
              textAnchor="middle"
              className="fill-muted text-[11px]"
            >
              {bar.label}월
            </text>
            {bar.amount > 0 && (
              <text
                x={bar.x + BAR_WIDTH / 2}
                y={Math.max(12, bar.y - 6)}
                textAnchor="middle"
                className="fill-fg text-[11px] font-semibold"
              >
                {formatShort(bar.amount)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
