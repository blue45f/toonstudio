import { AlertTriangle, EyeOff, LockKeyhole, ShieldCheck, Star } from "lucide-react";

import type { ReaderEcosystemIndex } from "@/shared/lib/reader-trust-ecosystem";
import type { ReviewTrustSummary } from "@/shared/lib/review-trust-engine";
import { cn } from "@/shared/lib/utils";

export interface ReviewTrustCardProps {
  readonly summary: ReviewTrustSummary;
  readonly ecosystemIndex?: ReaderEcosystemIndex;
  readonly loading?: boolean;
  readonly className?: string;
}

const ECOSYSTEM_TIER_META: Readonly<
  Record<
    ReaderEcosystemIndex["trustTier"],
    { readonly labelKo: string; readonly pillClass: string }
  >
> = {
  "platinum-clean-ip": {
    labelKo: "플래티넘 클린 IP",
    pillClass: "border-good/45 bg-good/15 text-good",
  },
  "gold-verified": {
    labelKo: "골드 검증",
    pillClass: "border-accent/45 bg-accent-soft text-accent",
  },
  standard: {
    labelKo: "기본 검증",
    pillClass: "border-line-strong bg-raised text-fg-2",
  },
};

/**
 * 베이즈 리뷰 신뢰 카드 + 독자 신뢰 생태계 지표 (AC-013 / DIFFERENTIATION.md F06).
 * 단순 평균 대신 검증 독자 가중·베이즈 보정 평점, 1~5점 분포 스펙트럼 바,
 * 평점 테러/표본 부족 경고와 `reader-trust-ecosystem` 클린 IP 신뢰 지수를 중첩 카드 없이 표시한다.
 */
export function ReviewTrustCard({
  summary,
  ecosystemIndex,
  loading = false,
  className,
}: ReviewTrustCardProps) {
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
  const tierMeta = ecosystemIndex ? ECOSYSTEM_TIER_META[ecosystemIndex.trustTier] : null;

  return (
    <section
      aria-label="베이즈 리뷰 신뢰 지표"
      data-testid="review-trust-card"
      className={cn("rounded-2xl border border-line bg-panel/45 p-4 text-fg", className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={15} className="shrink-0 text-good" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-fg break-keep">
            신뢰 보정 평점
          </h3>
        </div>
        <span className="font-display text-xs tabular-nums text-fg-3">
          총 {summary.totalCount.toLocaleString("ko-KR")}명 · 검증 독자 {verifiedShare}%
        </span>
      </header>

      <div className="mt-3 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-baseline gap-1.5">
            <Star size={18} className="shrink-0 fill-current text-accent" aria-hidden="true" />
            <span className="font-display text-3xl font-bold leading-none tabular-nums text-fg">
              {summary.bayesianTrustScore.toFixed(2)}
            </span>
            <span className="text-xs text-fg-3">/ 5.0</span>
          </div>
          <p className="text-[0.7rem] tabular-nums text-fg-3">
            단순 평균 {summary.totalCount > 0 ? summary.rawAverage.toFixed(2) : "—"} · 사전 보정 C=
            {summary.priorMean.toFixed(1)}, m={summary.priorWeight}
          </p>
        </div>

        <ul className="space-y-1.5" aria-label="별점 분포">
          {summary.distribution.map((bucket) => (
            <li key={bucket.star} className="grid grid-cols-[2rem_1fr_2.5rem] items-center gap-2 text-xs">
              <span className="font-display tabular-nums text-fg-2">{bucket.star}점</span>
              <div className="h-2 overflow-hidden rounded-full bg-raised">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none",
                    bucket.star >= 4 ? "bg-good" : bucket.star === 3 ? "bg-cool" : "bg-warn",
                  )}
                  style={{ width: `${Math.max(bucket.sharePercent, bucket.count > 0 ? 4 : 0)}%` }}
                />
              </div>
              <span className="text-right font-display text-[0.7rem] tabular-nums text-fg-3">
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
          <span className="leading-relaxed break-keep">{summary.anomalyReasonKo}</span>
        </div>
      )}

      {/* 독자 신뢰 생태계 종합 지표 (reader-trust-ecosystem 실연결) */}
      {ecosystemIndex && tierMeta ? (
        <div
          data-testid="review-trust-ecosystem-strip"
          className="mt-3 space-y-2 border-t border-line/60 pt-3 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
              <LockKeyhole size={13} className="text-cool" aria-hidden="true" />
              독자 신뢰 생태계
            </span>
            <div className="flex items-center gap-2">
              <span
                data-testid="review-trust-ecosystem-tier"
                className={cn("rounded-full border px-2 py-0.5 text-[0.65rem] font-bold", tierMeta.pillClass)}
              >
                {tierMeta.labelKo}
              </span>
              <span className="font-mono text-xs font-bold tabular-nums text-fg">
                {ecosystemIndex.trustScore}/100
              </span>
            </div>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised" aria-hidden="true">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-accent),var(--color-cool),var(--color-good))] transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${Math.min(100, Math.max(8, ecosystemIndex.trustScore))}%` }}
            />
          </div>

          <div className="flex flex-wrap gap-1.5 text-[0.68rem] text-fg-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-0.5">
              <EyeOff size={11} className="text-cool" aria-hidden="true" />
              스포일러 가림 보호
            </span>
            {ecosystemIndex.accessibilityCompliant ? (
              <span className="rounded-md bg-good/12 px-2 py-0.5 font-medium text-good">
                가독성·콘텐츠 태그 고지 충족
              </span>
            ) : null}
            {ecosystemIndex.tdmRepHeaderEnforced ? (
              <span className="rounded-md bg-raised px-2 py-0.5 text-fg-2">
                무단 수집 차단 정책 적용
              </span>
            ) : null}
            {ecosystemIndex.piracyMatchDetected ? (
              <span className="rounded-md bg-bad/15 px-2 py-0.5 font-semibold text-bad">
                유출 의심 컷 감지됨
              </span>
            ) : (
              <span className="rounded-md bg-good/12 px-2 py-0.5 font-medium text-good">
                불법유출 감시 정상
              </span>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
