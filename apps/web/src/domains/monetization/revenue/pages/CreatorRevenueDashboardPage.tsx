/**
 * CreatorRevenueDashboardPage.tsx
 *
 * 창작자 수익 대시보드 (`/creator/revenue`).
 * 등록된 수익원 제공자들을 모아 기간별 수익·정산을 보여준다.
 */
import { ChartColumn, LogIn } from "lucide-react";
import { useMemo, useState } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useT } from "@/shared/lib/i18n";
import { defineBilingualText } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { LoadingState } from "@/shared/components/LoadingState";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { Container } from "@/shared/components/section";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

// 제공자 등록을 위해 트랙 index를 로드한다 (side-effect import).
import "@/domains/monetization/tipping";
import "@/domains/monetization/membership";

import {
  lastNMonths,
  monthRange,
  previousPeriod,
  type MonthlyRevenue,
  type RevenueSourceId,
} from "../models/revenue-model";
import { aggregateCreatorRevenue, computeSettlementBreakdown, formatKrw } from "../revenue-aggregator";
import { RevenueChart } from "../components/RevenueChart";
import { CountUp } from "@/shared/components/count-up";
import { PeriodDeltaBadge } from "../components/PeriodDeltaBadge";
import { RevenueSpectrumBar } from "../components/RevenueSpectrumBar";
import {
  revenueSourceColor,
  sharePercent,
} from "../components/revenue-source-presentation";
import { SettlementCard } from "../components/SettlementCard";
import { PayoutDialog } from "../components/PayoutDialog";
import { EpisodeTipRanking } from "@/domains/monetization/tipping/components/EpisodeTipRanking";

type PeriodKey = "month" | "3m" | "6m";

const EMPTY_BODY = defineBilingualText(
  "creatorRevenueDashboardPage",
  "emptyBody",
  "선택한 기간에 기록된 수익원이 없습니다. 멤버십이나 후원이 시작되면 이곳에 바로 집계됩니다.",
  "No revenue sources were recorded for the selected period. Memberships and tips appear here as soon as they start.",
);
const MEMBERSHIP_CTA = defineBilingualText(
  "creatorRevenueDashboardPage",
  "membershipCta",
  "멤버십 관리로 가기",
  "Open membership settings",
);

const SOURCE_ORDER: readonly RevenueSourceId[] = ["tips", "membership", "early-access", "market", "custom"];

function sourceLabelKey(sourceId: RevenueSourceId): string {
  return `revenue.source.${sourceId}`;
}

export function CreatorRevenueDashboardPage() {
  const t = useT();
  const { data: session, ready, status } = useSession();
  const [periodKey, setPeriodKey] = useState<PeriodKey>("month");
  const [payoutOpen, setPayoutOpen] = useState(false);

  const creatorId = session?.user.id ?? null;
  const authenticated = ready && status === "authenticated" && Boolean(creatorId);

  useDocumentTitle(t("revenue.dashboard.documentTitle"));

  const months = useMemo(() => lastNMonths(6), []);
  const period = useMemo(() => {
    const current = months[months.length - 1] ?? "2026-10";
    if (periodKey === "month") return monthRange(current);
    const span = periodKey === "3m" ? 3 : 6;
    const start = months[months.length - span] ?? current;
    const { from } = monthRange(start);
    const { to } = monthRange(current);
    return { from, to };
  }, [periodKey, months]);

  const summary = useMemo(() => {
    if (!creatorId) return null;
    return aggregateCreatorRevenue({ creatorId, period });
  }, [creatorId, period]);

  // 전월 대비는 같은 길이의 직전 기간을 실제로 다시 집계해 비교한다.
  const prevSummary = useMemo(() => {
    if (!creatorId) return null;
    return aggregateCreatorRevenue({ creatorId, period: previousPeriod(period) });
  }, [creatorId, period]);

  const chartData: readonly MonthlyRevenue[] = useMemo(() => {
    if (!creatorId) return [];
    return months.map((month) => {
      const monthSummary = aggregateCreatorRevenue({
        creatorId,
        period: monthRange(month),
      });
      return { month, amount: monthSummary.totalAmount };
    });
  }, [creatorId, months]);

  if (!ready) {
    return (
      <Container className="py-16">
        <LoadingState label={t("revenue.dashboard.loading")} />
      </Container>
    );
  }

  if (!authenticated || !summary) {
    return (
      <Container className="py-16 text-center">
        <ChartColumn className="mx-auto h-10 w-10 text-muted/50" aria-hidden />
        <h1 className="mt-3 text-xl font-bold text-fg">{t("revenue.dashboard.title")}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          {t("revenue.dashboard.loginRequired")}
        </p>
        <button
          type="button"
          onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "creator-revenue", mode: "login" })}
          className={cn(buttonClass({ variant: "solid" }), "mt-4 gap-1.5")}
        >
          <LogIn className="h-4 w-4" aria-hidden />
          {t("revenue.dashboard.login")}
        </button>
      </Container>
    );
  }

  const netKrw = computeSettlementBreakdown(summary.totalAmount).netCreatorPayoutKrw;
  const sortedSources = [...summary.bySource].sort(
    (a, b) => SOURCE_ORDER.indexOf(a.sourceId) - SOURCE_ORDER.indexOf(b.sourceId),
  );
  const deltaLabel =
    periodKey === "month"
      ? t("revenue.dashboard.vsPrevMonth")
      : t("revenue.dashboard.vsPrevPeriod");

  return (
    <Container className="py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-fg">
            <ChartColumn className="h-6 w-6 text-accent" aria-hidden />
            {t("revenue.dashboard.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t("revenue.dashboard.subtitle")}</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-line p-1" role="group" aria-label={t("revenue.dashboard.periodLabel")}>
          {(["month", "3m", "6m"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriodKey(key)}
              aria-pressed={periodKey === key}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                periodKey === key ? "bg-accent/15 text-accent" : "text-muted hover:text-fg",
              )}
            >
              {t(`revenue.dashboard.period.${key}`)}
            </button>
          ))}
        </div>
      </header>

      <section aria-label={t("revenue.dashboard.summaryTitle")} className="mt-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-line bg-panel/50 p-5 sm:col-span-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-muted">{t("revenue.dashboard.totalRevenue")}</h2>
              <p className="text-xs text-muted">
                {t(`revenue.dashboard.period.${periodKey}`)}
                {" · "}
                {t("revenue.dashboard.entryCount", { count: summary.entryCount })}
              </p>
            </div>
            <p className="mt-2">
              <CountUp
                value={summary.totalAmount}
                separator
                suffix="원"
                duration={0.9}
                className="text-5xl font-bold tracking-tight tabular-nums text-fg"
              />
            </p>
            <div className="mt-3">
              {prevSummary ? (
                <PeriodDeltaBadge
                  current={summary.totalAmount}
                  previous={prevSummary.totalAmount}
                  label={deltaLabel}
                  noPreviousLabel={t("revenue.dashboard.noPrevData")}
                />
              ) : null}
            </div>
          </div>

          {sortedSources.map((bucket) => (
            <div key={bucket.sourceId} className="rounded-2xl border border-line bg-panel/50 p-5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-muted">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: revenueSourceColor(bucket.sourceId) }}
                  aria-hidden
                />
                {t(sourceLabelKey(bucket.sourceId))}
              </p>
              <p className="mt-2">
                <CountUp
                  value={bucket.amount}
                  separator
                  suffix="원"
                  duration={0.9}
                  className="text-3xl font-bold tracking-tight tabular-nums text-fg"
                />
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fg/10" role="presentation">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, sharePercent(bucket.amount, summary.totalAmount))}%`,
                    backgroundColor: revenueSourceColor(bucket.sourceId),
                  }}
                />
              </div>
              <p className="mt-1.5 text-xs tabular-nums text-muted">
                {sharePercent(bucket.amount, summary.totalAmount)}%
                {" · "}
                {t("revenue.dashboard.entryCount", { count: bucket.count })}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section aria-label={t("revenue.dashboard.monthlyTrend")} className="rounded-2xl border border-line bg-panel/50 p-4 sm:p-6">
            <h2 className="text-base font-bold text-fg">{t("revenue.dashboard.monthlyTrend")}</h2>
            <RevenueChart data={chartData} className="mt-4" />
          </section>

          <section aria-label={t("revenue.dashboard.sourceBreakdown")} className="rounded-2xl border border-line bg-panel/50 p-4 sm:p-6">
            <h2 className="text-base font-bold text-fg">{t("revenue.dashboard.sourceBreakdown")}</h2>
            {summary.bySource.length === 0 ? (
              <ActionableEmptyState
                art="none"
                className="mt-4"
                icon={ChartColumn}
                title={t("revenue.dashboard.empty")}
                description={t(EMPTY_BODY)}
                primary={{ href: "/creator/membership", label: t(MEMBERSHIP_CTA) }}
              />
            ) : (
              <>
                <div className="mt-4">
                  <RevenueSpectrumBar
                    bySource={sortedSources}
                    total={summary.totalAmount}
                    sourceLabel={(sourceId) => t(sourceLabelKey(sourceId))}
                  />
                </div>
                <ul className="mt-5 space-y-3">
                  {sortedSources.map((bucket) => (
                    <li key={bucket.sourceId} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 font-semibold text-fg">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: revenueSourceColor(bucket.sourceId) }}
                          aria-hidden
                        />
                        {t(sourceLabelKey(bucket.sourceId))}
                      </span>
                      <span className="tabular-nums text-muted">
                        {formatKrw(bucket.amount)}
                        {" · "}
                        {t("revenue.dashboard.entryCount", { count: bucket.count })}
                        {" · "}
                        {sharePercent(bucket.amount, summary.totalAmount)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {creatorId ? <EpisodeTipRanking creatorId={creatorId} /> : null}
        </div>

        <div className="space-y-6">
          <SettlementCard
            grossKrw={summary.totalAmount}
            onPayoutClick={() => setPayoutOpen(true)}
          />
        </div>
      </div>

      <PayoutDialog open={payoutOpen} netKrw={netKrw} onClose={() => setPayoutOpen(false)} />
    </Container>
  );
}
