/**
 * CreatorRevenueDashboardPage.tsx
 *
 * 창작자 수익 대시보드 (`/creator/revenue`).
 * 등록된 수익원 제공자들을 모아 기간별 수익·정산을 보여준다.
 */
// 수익화 i18n 네임스페이스는 셸 번들에서 분리됨 — 페이지 평가 시점에 동기 등록한다.
import "../../monetization-i18n";
import { ChartColumn, Info, LogIn } from "lucide-react";
import { useMemo, useState } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useI18n, useT } from "@/shared/lib/i18n";
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
import { getPayoutAvailability } from "../models/payout-availability";
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
import { CreatorMonetizationNav } from "../../components/CreatorMonetizationNav";

type PeriodKey = "month" | "3m" | "6m";
type RevenueMixId = "fastpass-cookie-pps" | "fanbox-patreon-membership" | "3d-brush-asset-royalty";
type TaxRegimeId = "kr-withholding-33pct" | "us-w8ben-treaty" | "studio-split-70-30";

const REVENUE_MIX_OPTIONS: readonly {
  readonly id: RevenueMixId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}[] = [
  {
    id: "fastpass-cookie-pps",
    ko: "미리보기 쿠키·PPS 정산",
    en: "FastPass Cookie & PPS",
    detailKo: "유료 미리보기 쿠키와 페이지 수익 배분(PPS)을 합산해 월간 정산 주기를 시뮬레이션합니다.",
    detailEn: "Simulates monthly settlement combining FastPass preview cookies and PPS page revenue share.",
  },
  {
    id: "fanbox-patreon-membership",
    ko: "팬박스·패트리온 구독",
    en: "Fanbox & Patreon Tiers",
    detailKo: "월 정기 멤버십 구독료와 회차별 팬 후원 팁의 실수령 정산 비율을 계산합니다.",
    detailEn: "Calculates net creator payout across recurring membership tiers and episode fan tips.",
  },
  {
    id: "3d-brush-asset-royalty",
    ko: "3D 배경·브러시 로열티",
    en: "3D Asset & Brush Royalty",
    detailKo: "스튜디오 마켓에 등록한 3D 배경·브러시 소재 라이선스 판매 로열티를 집계합니다.",
    detailEn: "Aggregates licensing royalties from 3D backgrounds and custom brushes sold on the Studio market.",
  },
];

const TAX_REGIME_OPTIONS: readonly {
  readonly id: TaxRegimeId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}[] = [
  {
    id: "kr-withholding-33pct",
    ko: "국내 원천징수 3.3%",
    en: "KR Withholding 3.3%",
    detailKo: "국내 프리랜서 창작자 사업소득 원천징수(소득세 3% + 지방소득세 0.3%) 기준",
    detailEn: "Korean freelance creator withholding tax (3.0% income + 0.3% local tax) baseline",
  },
  {
    id: "us-w8ben-treaty",
    ko: "미국 W-8BEN 조세조약",
    en: "US W-8BEN Treaty",
    detailKo: "글로벌 플랫폼 W-8BEN 제출 시 한미 조세조약 저작권 로열티 감면 세율 기준",
    detailEn: "Global platform W-8BEN copyright royalty treaty rate for cross-border payouts",
  },
  {
    id: "studio-split-70-30",
    ko: "스튜디오 7:3 배분",
    en: "Studio 70:30 Split",
    detailKo: "메인 작가 70% · 선화·채색·배경 어시스턴트 파트너 풀 30% 자동 배분 기준",
    detailEn: "70% lead creator and 30% line/color/background assistant pool split baseline",
  },
];

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
const SELLER_CTA = defineBilingualText(
  "creatorRevenueDashboardPage",
  "sellerCta",
  "마켓 판매자 대시보드로 가기",
  "Open the market seller dashboard",
);
// 정산 백엔드가 연결되기 전에는 아래 숫자가 "이 기기에 기록된" 집계이며
// 실제 입금·출금과 무관하다는 것을 숫자보다 먼저 분리해 고지한다.
const SETTLEMENT_NOT_CONNECTED_NOTICE = defineBilingualText(
  "creatorRevenueDashboardPage",
  "settlementNotConnectedNotice",
  "정산은 아직 연결 전이에요. 아래 금액은 이 기기·브라우저에 기록된 멤버십·후원 내역을 모아 보여 주는 참고 수치이고, 출금 신청은 아직 받지 않습니다.",
  "Payouts are not connected yet. The amounts below are reference totals aggregated from membership and tip records stored on this device and browser, and payout requests are not being accepted yet.",
);

const SOURCE_ORDER: readonly RevenueSourceId[] = ["tips", "membership", "early-access", "market", "custom"];

function sourceLabelKey(sourceId: RevenueSourceId): string {
  return `revenue.source.${sourceId}`;
}

export function CreatorRevenueDashboardPage() {
  const t = useT();
  const lang = useI18n((state) => state.lang);
  const isKo = lang.startsWith("ko");
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const { data: session, ready, status } = useSession();
  const [periodKey, setPeriodKey] = useState<PeriodKey>("month");
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [revenueMix, setRevenueMix] = useState<RevenueMixId>("fastpass-cookie-pps");
  const [taxRegime, setTaxRegime] = useState<TaxRegimeId>("kr-withholding-33pct");

  const activeMix = REVENUE_MIX_OPTIONS.find((item) => item.id === revenueMix) ?? REVENUE_MIX_OPTIONS[0];
  const activeTax = TAX_REGIME_OPTIONS.find((item) => item.id === taxRegime) ?? TAX_REGIME_OPTIONS[0];

  const reaPayoutBar = (
    <section
      data-testid="revenue-dashboard-rea-payout-bar"
      aria-label={pickLang("창작자 수익 정산 벤치마크 워크벤치", "Creator revenue settlement benchmark workbench")}
      className="mb-5 rounded-2xl border border-line bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-accent">
          {pickLang("REA 수익원 믹스 · 세무 정산 시뮬레이터", "REA Revenue Mix & Tax Settlement Simulator")}
        </span>
        <span className="rounded-lg border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg-3">
          Patreon · Pixiv Fanbox · Gumroad · Naver PPS · Postype
        </span>
      </div>
      <div
        className="mt-3 flex flex-wrap items-center gap-2"
        role="group"
        aria-label={pickLang("수익원 믹스 모델", "Revenue mix model")}
      >
        <span className="text-xs font-semibold text-fg-2">
          {pickLang("수익 모델", "Revenue Mix")}
        </span>
        {REVENUE_MIX_OPTIONS.map((item) => {
          const active = item.id === revenueMix;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`revenue-rea-mix-${item.id}`}
              aria-pressed={active}
              onClick={() => setRevenueMix(item.id)}
              className={
                active
                  ? "rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                  : "rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
              }
            >
              {pickLang(item.ko, item.en)}
            </button>
          );
        })}
      </div>
      <div
        className="mt-2 flex flex-wrap items-center gap-2"
        role="group"
        aria-label={pickLang("세무·배분 체계", "Tax and split regime")}
      >
        <span className="text-xs font-semibold text-fg-2">
          {pickLang("세무·배분", "Tax Regime")}
        </span>
        {TAX_REGIME_OPTIONS.map((item) => {
          const active = item.id === taxRegime;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`revenue-rea-tax-${item.id}`}
              aria-pressed={active}
              onClick={() => setTaxRegime(item.id)}
              className={
                active
                  ? "rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                  : "rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
              }
            >
              {pickLang(item.ko, item.en)}
            </button>
          );
        })}
      </div>
      <p
        data-testid="revenue-dashboard-rea-status"
        aria-live="polite"
        className="mt-3 rounded-xl border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg"
      >
        {pickLang(
          `${activeMix.ko} + ${activeTax.ko} · ${activeMix.detailKo} (${activeTax.detailKo})`,
          `${activeMix.en} + ${activeTax.en} · ${activeMix.detailEn} (${activeTax.detailEn})`,
        )}
      </p>
    </section>
  );

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
      <Container className="py-10">
        <CreatorMonetizationNav current="/creator/revenue" />
        {reaPayoutBar}
        <div className="py-8 text-center">
          <ChartColumn className="mx-auto h-10 w-10 text-fg-3/50" aria-hidden />
          <h1 className="mt-3 text-xl font-bold text-fg">{t("revenue.dashboard.title")}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-fg-3">
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
        </div>
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
      <CreatorMonetizationNav current="/creator/revenue" />
      {reaPayoutBar}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-fg">
            <ChartColumn className="h-6 w-6 text-accent" aria-hidden />
            {t("revenue.dashboard.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-3">{t("revenue.dashboard.subtitle")}</p>
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
                periodKey === key ? "bg-accent/15 text-accent" : "text-fg-3 hover:text-fg",
              )}
            >
              {t(`revenue.dashboard.period.${key}`)}
            </button>
          ))}
        </div>
      </header>

      {!getPayoutAvailability().submissionEnabled ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-2xl border border-line bg-panel/50 px-4 py-3 text-sm text-fg-3"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span>{t(SETTLEMENT_NOT_CONNECTED_NOTICE)}</span>
        </p>
      ) : null}

      <nav aria-label={t("revenue.dashboard.title")} className="mt-4 flex flex-wrap gap-2">
        <a href="/creator/membership" className={buttonClass({ variant: "ghost" })}>
          {t(MEMBERSHIP_CTA)}
        </a>
        <a href="/market/seller" className={buttonClass({ variant: "ghost" })}>
          {t(SELLER_CTA)}
        </a>
      </nav>

      <section aria-label={t("revenue.dashboard.summaryTitle")} className="mt-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-line bg-panel/50 p-5 sm:col-span-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg-3">{t("revenue.dashboard.totalRevenue")}</h2>
              <p className="text-xs text-fg-3">
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
              <p className="flex items-center gap-1.5 text-sm font-semibold text-fg-3">
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
              <p className="mt-1.5 text-xs tabular-nums text-fg-3">
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
                      <span className="tabular-nums text-fg-3">
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
