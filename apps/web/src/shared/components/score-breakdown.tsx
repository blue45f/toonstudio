import { ArrowUpRight, Sigma } from "lucide-react";
import { useEffect, useState } from "react";

import type { Title } from "@/shared/lib/types";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  RANK_AXES,
  axisMeta,
  explainScore,
  type RankAxis,
} from "@/shared/lib/ranking";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const AXIS_EN_LABEL: Readonly<Record<RankAxis, string>> = {
  popular: "Popular",
  trending: "Trending",
  favorites: "Saved",
  rating: "Top Rated",
  hidden: "Hidden Gems",
  binge: "Binge",
  completed: "Completed",
  rookie: "Rookies",
};

const FACTOR_TONE_CLASSES = [
  "bg-accent",
  "bg-cool",
  "bg-good",
  "bg-warn",
  "bg-accent-2",
] as const;

// "왜 이 순위인가" 투명성 분해 패널 — 8축 산식 기여 요인을 인라인에서 전환하며 확인.
// 데이터는 lib/ranking.explainScore 단일 출처이며, 중첩 카드 없이 헤어라인과 OKLCH 스펙트럼 바로 표현한다.
export function ScoreBreakdown({
  title,
  axis = "popular",
  allowAxisSwitch = true,
  compact = false,
  className,
}: {
  title: Title;
  axis?: RankAxis;
  allowAxisSwitch?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const bt = useBilingual("ScoreBreakdown");
  const [selectedAxis, setSelectedAxis] = useState<RankAxis>(axis);

  useEffect(() => {
    setSelectedAxis(axis);
  }, [axis]);

  const activeAxis = allowAxisSwitch ? selectedAxis : axis;
  const factors = explainScore(title, activeAxis);
  const meta = axisMeta(activeAxis);
  if (!factors.length) return null;

  return (
    <div className={className} data-testid="score-breakdown-panel" data-axis={activeAxis}>
      <div
        className={cn(
          compact
            ? "space-y-3 pt-1"
            : "rounded-2xl border border-line bg-panel/45 p-5",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Sigma size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-fg sm:text-sm break-keep">
                {bt(
                  `왜 이 순위? · ${meta.label} 산식 분해`,
                  `Why this rank · ${AXIS_EN_LABEL[activeAxis]} breakdown`,
                )}
              </p>
              <p className="text-[0.7rem] text-fg-3 break-keep">
                {bt(
                  "점수에 기여한 지표를 8개 관점별로 투명하게 공개합니다",
                  "Transparent factor breakdown across all 8 ranking perspectives",
                )}
              </p>
            </div>
          </div>
          <Link
            href="/guide"
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-[0.72rem] font-semibold text-accent hover:underline"
          >
            {bt("산정 방식", "Methodology")}
            <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </div>

        {allowAxisSwitch ? (
          <div
            role="group"
            aria-label={bt("8축 산식 관점 전환", "Switch between 8 ranking axes")}
            data-testid="score-breakdown-axis-tabs"
            className="mt-3 flex flex-wrap gap-1.5"
          >
            {RANK_AXES.map((entry) => {
              const active = entry.key === activeAxis;
              return (
                <button
                  key={entry.key}
                  type="button"
                  aria-pressed={active}
                  data-testid={`score-breakdown-axis-${entry.key}`}
                  onClick={() => setSelectedAxis(entry.key)}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-lg border px-2.5 text-xs font-semibold transition-colors duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none motion-reduce:transition-none",
                    active
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card/80 text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {bt(entry.label, AXIS_EN_LABEL[entry.key])}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* 스펙트럼 기여도 게이지 바 */}
        <div
          className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-raised"
          aria-hidden="true"
        >
          {factors.map((factor, index) => (
            <span
              key={`${activeAxis}-${factor.label}-${index}`}
              className={cn(
                "h-full flex-1 border-r border-canvas/70 transition-opacity duration-300 last:border-r-0 motion-reduce:transition-none",
                FACTOR_TONE_CLASSES[index % FACTOR_TONE_CLASSES.length],
              )}
              style={{ opacity: Math.max(0.5, 1 - index * 0.08) }}
            />
          ))}
        </div>

        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {factors.map((f, index) => (
            <div
              key={`${activeAxis}-${f.label}`}
              className="flex items-baseline justify-between gap-2 border-b border-line/60 px-2 py-2 sm:rounded-lg sm:border sm:border-line/60 sm:bg-card/45"
            >
              <dt className="flex items-center gap-1.5 text-xs text-fg-2 break-keep">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    FACTOR_TONE_CLASSES[index % FACTOR_TONE_CLASSES.length],
                  )}
                />
                {f.label}
              </dt>
              <dd className="numeral shrink-0 font-mono text-xs font-bold tabular-nums text-fg">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-2.5 font-mono text-[0.7rem] leading-relaxed text-fg-3 break-keep">
          <span className="eyebrow mr-1.5 text-[0.58rem] text-accent">
            {bt("산식", "Formula")}
          </span>
          {meta.formula}
        </p>
      </div>
    </div>
  );
}
