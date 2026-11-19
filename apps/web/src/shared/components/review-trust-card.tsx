import { AlertTriangle, ShieldCheck, Star } from "lucide-react";

import type { ReviewTrustSummary } from "@/shared/lib/review-trust-engine";
import { cn } from "@/shared/lib/utils";

export interface ReviewTrustCardProps {
  readonly summary: ReviewTrustSummary;
  readonly loading?: boolean;
  readonly className?: string;
}

/**
 * 베이즈 리뷰 신뢰 카드 (AC-015 / DIFFERENTIATION.md F06).
 * 단순 평균 대신 검증 독자 가중·베이즈 보정 평점, 1~5점 분포 스펙트럼 바,
 * 평점 테러/표본 부족 경고를 중첩 카드 없이 투명하게 표시한다.
 */
export function ReviewTrustCard({ summary, loading = false, className }: ReviewTrustCardProps) {
  if (loading) {
    return (
      <section
        aria-busy="true"
        aria-label="리뷰 신뢰 지표 불러오는 중"
        className={cn("rounded-2xl border border-line bg-panel/45 p-4", className)}
      >
        <div className="space-y-2.5 motion-safe:animate-pulse">
          <div className="h-5 w-40 rounded bg-raised" />
          <div className="h-20 rounded-xl bg-raised/70" />
        </div>
      </section>
    );
  }

  const verifiedShare =
    summary.totalCount > 0 ? Math.round((summary.verifiedCount / summary.totalCount) * 100) : 0;

  return (
    <section
      aria-label="베이즈 리뷰 신뢰 지표"
      data-testid="review-trust-card"
      className={cn("rounded-2xl border border-line bg-panel/45 p-4 text-fg", className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={15} className="shrink-0 text-good" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-fg [word-break:keep-all]">
            신뢰 보정 평점
          </h3>
        </div>
        <span className="font-display text-xs text-fg-3 tnum">
          총 {summary.totalCount.toLocaleString("ko-KR")}명 · 검증 독자 {verifiedShare}%
        </span>
      </header>

      <div className="mt-3 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-baseline gap-1.5">
            <Star size={18} className="shrink-0 fill-current text-accent" aria-hidden="true" />
            <span className="font-display text-3xl font-bold leading-none text-fg tnum">
              {summary.bayesianTrustScore.toFixed(2)}
            </span>
            <span className="text-xs text-fg-3">/ 5.0</span>
          </div>
          <p className="text-[0.7rem] text-fg-3 tnum">
            단순 평균 {summary.totalCount > 0 ? summary.rawAverage.toFixed(2) : "—"} · 사전 보정 C=
            {summary.priorMean.toFixed(1)}, m={summary.priorWeight}
          </p>
        </div>

        <ul className="space-y-1.5" aria-label="별점 분포">
          {summary.distribution.map((bucket) => (
            <li key={bucket.star} className="grid grid-cols-[2rem_1fr_2.5rem] items-center gap-2 text-xs">
              <span className="font-display text-fg-2 tnum">{bucket.star}점</span>
              <div className="h-2 overflow-hidden rounded-full bg-raised">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none",
                    bucket.star >= 4 ? "bg-good" : bucket.star === 3 ? "bg-cool" : "bg-warn",
                  )}
                  style={{ width: `${Math.max(bucket.sharePercent, bucket.count > 0 ? 4 : 0)}%` }}
                />
              </div>
              <span className="text-right font-display text-[0.7rem] text-fg-3 tnum">
                {bucket.sharePercent}%
              </span>
            </li>
          ))}
        </ul>
      </div>

      {summary.anomalyFlag !== "none" && summary.anomalyReasonKo && (
        <div
          role="status"
          className={cn(
            "mt-3 flex items-start gap-2 rounded-xl bg-raised px-3 py-2 text-xs",
            summary.anomalyFlag === "possible-bombing" ? "text-warn" : "text-fg-2",
          )}
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="leading-relaxed [word-break:keep-all]">{summary.anomalyReasonKo}</span>
        </div>
      )}
    </section>
  );
}
