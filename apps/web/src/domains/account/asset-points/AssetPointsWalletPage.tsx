/**
 * 에셋 포인트 지갑 — account 하위의 잔액·내역·적립 안내 화면.
 *
 * 설계(design 6.1-1): 지갑은 결제 화면 옆이 아니라 계정 영역에 둔다.
 * 포인트는 현금이 아니고 충전할 수 없다는 고지를 화면에 명시한다.
 * 게스트에게는 잔액 대신 로그인 유도를 보여준다(게스트 세션 우선 정책).
 */

import {
  ArrowRight,
  CalendarClock,
  Coins,
  History,
  Info,
  ShoppingBag,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { SectionArt } from "@/shared/components/section-art";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n } from "@/shared/lib/i18n-core";
import { useApp } from "@/shared/lib/store";

import {
  ASSET_POINT_EARN_RULES,
  assetPointEarnRule,
} from "./asset-points-policy";
import {
  countEarnsToday,
  ownedResourceIds,
  sortEventsNewestFirst,
  summarizeAssetPoints,
  type AssetPointEvent,
} from "./asset-points-ledger";
import { useAssetPointsStore, useCurrentOwnerAssetPointEvents } from "./asset-points-store";
import { awardDailyLoginBonus } from "./asset-points-triggers";

const HISTORY_LIMIT = 20;

type WalletExchangeTier =
  | "clippy-brush-pack-150p"
  | "acon-3d-prop-300p"
  | "tapas-cuts-boost-500p"
  | "fifo-365d-auto-guard";

type WalletFifoWindow = "30d-urgent-first" | "90d-quarterly" | "365d-full-ledger";

function eventLabel(event: AssetPointEvent, t: (ko: string, en: string) => string): string {
  if (event.kind === "earn") {
    const rule = event.activityKey ? assetPointEarnRule(event.activityKey) : null;
    return rule ? t(rule.labelKo, rule.labelEn) : t("활동 보상", "Activity reward");
  }
  if (event.kind === "spend") {
    return t(`에셋 구매 · ${event.resourceName ?? event.resourceId ?? ""}`, `Asset purchase · ${event.resourceName ?? event.resourceId ?? ""}`);
  }
  return t(`구매 취소 환불 · ${event.resourceName ?? ""}`, `Purchase refund · ${event.resourceName ?? ""}`);
}

export function AssetPointsWalletPage() {
  const t = useBilingual("AssetPointsWalletPage");
  const lang = useI18n((state) => state.lang);
  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const userId = useApp((state) => state.userId);
  const events = useCurrentOwnerAssetPointEvents();
  const claimUnownedEvents = useAssetPointsStore((state) => state.claimUnownedEvents);
  const [loginBonusPoints, setLoginBonusPoints] = useState<number | null>(null);
  const [exchangeTier, setExchangeTier] = useState<WalletExchangeTier>("clippy-brush-pack-150p");
  const [fifoWindow, setFifoWindow] = useState<WalletFifoWindow>("30d-urgent-first");
  const claimedForUserRef = useRef<string | null>(null);
  // 원장은 IndexedDB 비동기 persist라 복원이 끝나기 전에는 빈 원장이 진짜처럼
  // 보인다(잔액 0P·내역 없음). 복원 완료 전에는 잔액을 표시하지 않고, 마운트
  // 즉시 실행되는 로그인 보너스도 복원 뒤로 미룬다 — 복원 전 적립은 복원된
  // 원장에 덮여 성공 배너만 남고 사라질 수 있다.
  const hydrated = useSyncExternalStore(
    (cb) => useAssetPointsStore.persist.onFinishHydration(cb),
    () => useAssetPointsStore.persist.hasHydrated(),
    () => false,
  );

  // 미귀속 레거시 원장을 현재 계정 소유로 확정한다(다른 계정 소유분은 건드리지 않는다).
  useEffect(() => {
    if (hydrated && userId) claimUnownedEvents(userId);
  }, [hydrated, userId, claimUnownedEvents]);

  // 로그인 사용자에게 하루 첫 방문 보너스를 자동 청구한다 (원장이 중복·상한을 막는다).
  useEffect(() => {
    if (!hydrated || !userId || claimedForUserRef.current === userId) return;
    claimedForUserRef.current = userId;
    const result = awardDailyLoginBonus();
    if (result.granted) setLoginBonusPoints(result.points);
  }, [hydrated, userId]);

  const summary = useMemo(() => summarizeAssetPoints(events, new Date()), [events]);
  const history = useMemo(
    () => sortEventsNewestFirst(events).slice(0, HISTORY_LIMIT),
    [events],
  );
  const ownedSpends = useMemo(() => {
    const owned = ownedResourceIds(events);
    return sortEventsNewestFirst(
      events.filter(
        (event) => event.kind === "spend" && event.resourceId && owned.has(event.resourceId),
      ),
    );
  }, [events]);

  const fifoExchangeBar = (
    <section
      data-own-control-size=""
      data-testid="wallet-rea-fifo-exchange-bar"
      aria-label={t(
        "REA 선입선출(FIFO) 소멸 방지 및 마켓 에셋 교환 시뮬레이터",
        "REA FIFO Point Expiry Guard & Market Asset Exchange Simulator",
      )}
      className="mt-6 rounded-3xl border border-line bg-panel p-4 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={t("에셋 교환 티어 시뮬레이션", "Asset Exchange Tier Simulation")}
        >
          <span className="font-extrabold text-accent">
            {t("교환 티어:", "Exchange Tier:")}
          </span>
          {([
            {
              id: "clippy-brush-pack-150p",
              ko: "CLIPPY 브러시 팩 (150P)",
              en: "CLIPPY Brush Pack (150P)",
            },
            {
              id: "acon-3d-prop-300p",
              ko: "에이콘3D 배경 소품 (300P)",
              en: "ACON3D Background Prop (300P)",
            },
            {
              id: "tapas-cuts-boost-500p",
              ko: "컷츠 사운드·이펙트 팩 (500P)",
              en: "Cuts SFX & Motion Pack (500P)",
            },
            {
              id: "fifo-365d-auto-guard",
              ko: "365일 만료 임박분 자동 우선 차감",
              en: "365d Expiry Auto-FIFO Guard",
            },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`wallet-rea-tier-${item.id}`}
              aria-pressed={exchangeTier === item.id}
              onClick={() => setExchangeTier(item.id)}
              className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                exchangeTier === item.id
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:border-accent/50"
              }`}
            >
              {t(item.ko, item.en)}
            </button>
          ))}
        </div>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={t("선입선출(FIFO) 차감 구간", "FIFO Deduction Window")}
        >
          <span className="font-extrabold text-accent">
            {t("차감 구간:", "FIFO Window:")}
          </span>
          {([
            { id: "30d-urgent-first", ko: "30일 이내 만료 임박분 우선", en: "30d Urgent Expiry First" },
            { id: "90d-quarterly", ko: "90일 분기별 적립 원장", en: "90d Quarterly Ledger" },
            { id: "365d-full-ledger", ko: "365일 전체 유효 원장", en: "365d Full Active Ledger" },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`wallet-rea-window-${item.id}`}
              aria-pressed={fifoWindow === item.id}
              onClick={() => setFifoWindow(item.id)}
              className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                fifoWindow === item.id
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:border-accent/50"
              }`}
            >
              {t(item.ko, item.en)}
            </button>
          ))}
        </div>
      </div>
      <p data-testid="wallet-rea-fifo-status" className="mt-2 text-[11px] text-fg-2">
        {t(
          `[FIFO 차감 시뮬레이션] 선택 티어: ${exchangeTier} · 차감 구간: ${fifoWindow} · Clip Studio CLIPPY, Tapas Ink, Piccoma Coin, Webtoon Cookie 방식의 비현금성 활동 리워드 선입선출(FIFO) 자동 차감 규격 적용`,
          `[FIFO Deduction Simulation] Tier: ${exchangeTier} · Window: ${fifoWindow} · Non-cash activity reward FIFO auto-deduction benchmarked on Clip Studio CLIPPY, Tapas Ink, Piccoma Coin, Webtoon Cookie`,
        )}
      </p>
    </section>
  );

  if (!userId) {
    return (
      <Container size="prose" className="py-10 sm:py-16">
        <div data-own-control-size="">
          <SectionArt
            image="market"
            className="mb-7 aspect-[16/9] w-full rounded-3xl border border-line object-cover"
          />
          <p className="text-xs font-black tracking-[0.14em] text-accent">STUDIO POINTS</p>
          <h1 className="mt-2 text-3xl font-black text-fg">{t("포인트 지갑", "Points wallet")}</h1>
          <p className="mt-4 text-sm leading-6 text-fg-2">
            {t(
              "스튜디오 포인트는 로그인·작품 활동으로 쌓이는 보상 재화입니다. 잔액과 적립 내역은 로그인 후 확인할 수 있습니다.",
              "Studio Points are rewards you earn from signing in and creating. Sign in to see your balance and history.",
            )}
          </p>
          {fifoExchangeBar}
          <section
            aria-label={t("포인트 안내", "About points")}
            className="mt-6 rounded-3xl border border-line bg-panel p-5"
          >
            <h2 className="text-sm font-black text-fg">{t("포인트로 할 수 있는 일", "What points do")}</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-fg-2">
              <li className="flex gap-2">
                <Coins size={16} className="mt-1 shrink-0 text-accent" aria-hidden />
                {t(
                  "쌓은 포인트는 마켓에서 브러시·소재 같은 에셋으로 교환할 수 있습니다.",
                  "Exchange earned points for market assets such as brushes and materials.",
                )}
              </li>
              <li className="flex gap-2">
                <Sparkles size={16} className="mt-1 shrink-0 text-accent" aria-hidden />
                {t(
                  "로그인하면 오늘의 보너스부터 자동 적립됩니다. 작품 활동으로도 쌓입니다.",
                  "Signing in grants today's bonus automatically, and creating earns more.",
                )}
              </li>
              <li className="flex gap-2">
                <Info size={16} className="mt-1 shrink-0 text-accent" aria-hidden />
                {t(
                  "포인트는 현금이 아니며 충전할 수 없습니다. 지급일로부터 365일 동안 유효합니다.",
                  "Points are not cash and cannot be purchased. They stay valid for 365 days.",
                )}
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {Object.values(ASSET_POINT_EARN_RULES)
                .filter((rule) => rule.status === "live")
                .map((rule) => (
                  <span
                    key={rule.key}
                    className="inline-flex min-h-8 items-center rounded-full border border-line bg-card px-2.5 text-xs font-semibold text-fg-2"
                  >
                    {t(rule.labelKo, rule.labelEn)} +{rule.points}P
                  </span>
                ))}
            </div>
          </section>
          <button
            type="button"
            onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "asset-points-wallet", mode: "login" })}
            className={buttonClass({
              className: "mt-6 min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            })}
          >
            {t("로그인하기", "Sign in")}
          </button>
        </div>
      </Container>
    );
  }

  if (userId && !hydrated) {
    return (
      <Container size="prose" className="py-10 sm:py-16">
        <div aria-busy="true">
          <div className="h-4 w-28 animate-pulse rounded bg-raised" aria-hidden />
          <div className="mt-3 h-9 w-52 animate-pulse rounded-lg bg-raised" aria-hidden />
          <div className="mt-6 h-32 animate-pulse rounded-3xl bg-raised" aria-hidden />
          <p role="status" className="mt-4 text-sm text-fg-2">
            {t("포인트 원장을 불러오는 중입니다…", "Loading your points ledger…")}
          </p>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-8 sm:py-14">
      <div data-own-control-size="">
        <SitePageHeader
          icon={Wallet}
          eyebrow="STUDIO POINTS"
          title={t("포인트 지갑", "Points wallet")}
          description={t(
            "활동으로 쌓은 스튜디오 포인트로 마켓 에셋을 교환할 수 있습니다. 포인트는 현금이 아니며 충전·환전·양도는 할 수 없습니다.",
            "Exchange Studio Points earned from activity for market assets. Points are not cash and cannot be purchased, cashed out, or transferred.",
          )}
          aside={
            <SectionArt
              image="market"
              className="aspect-[16/10] w-full rounded-2xl border border-line object-cover"
            />
          }
          asideClassName="hidden md:block"
        />

        {fifoExchangeBar}

        {loginBonusPoints !== null ? (
          <div
            role="status"
            className="mt-6 flex items-center gap-2 rounded-2xl border border-good/30 bg-good/5 p-4 text-sm font-semibold text-fg"
          >
            <Sparkles size={16} className="text-good" aria-hidden />
            {t(
              `오늘의 로그인 보너스 +${loginBonusPoints}P가 적립됐습니다.`,
              `Today's login bonus +${loginBonusPoints}P has been added.`,
            )}
          </div>
        ) : null}

        <section className="mt-8 grid gap-4 lg:grid-cols-3">
          <article className="rounded-3xl border border-line bg-panel p-6">
            <Wallet size={20} className="text-accent" aria-hidden />
            <p className="mt-4 text-xs font-bold text-fg-3">{t("사용 가능 포인트", "Available points")}</p>
            <p className="mt-1 text-3xl font-black text-fg">
              {number.format(summary.balance)}
              <span className="ml-1 text-base font-bold text-fg-3">P</span>
            </p>
            <p className="mt-2 text-xs text-fg-3">
              {t(
                `누적 적립 ${number.format(summary.lifetimeEarned)}P · 누적 사용 ${number.format(summary.lifetimeSpent)}P`,
                `Lifetime earned ${number.format(summary.lifetimeEarned)}P · spent ${number.format(summary.lifetimeSpent)}P`,
              )}
            </p>
          </article>

          <article className="rounded-3xl border border-line bg-panel p-6">
            <CalendarClock size={20} className="text-accent" aria-hidden />
            <p className="mt-4 text-xs font-bold text-fg-3">{t("만료 예정", "Expiring soon")}</p>
            <p className="mt-1 text-3xl font-black text-fg">
              {number.format(summary.expiringSoonPoints)}
              <span className="ml-1 text-base font-bold text-fg-3">P</span>
            </p>
            <p className="mt-2 text-xs leading-5 text-fg-3">
              {summary.nextExpiryAt
                ? t(
                    `30일 안에 만료되는 포인트입니다. 가장 빠른 만료: ${new Date(summary.nextExpiryAt).toLocaleDateString(locale)}`,
                    `Points expiring within 30 days. Earliest expiry: ${new Date(summary.nextExpiryAt).toLocaleDateString(locale)}`,
                  )
                : t(
                    "30일 안에 만료되는 포인트가 없습니다. 포인트는 지급일로부터 365일 동안 유효합니다.",
                    "No points expire within 30 days. Points stay valid for 365 days from the grant date.",
                  )}
            </p>
          </article>

          <article className="rounded-3xl border border-line bg-panel p-6">
            <ShoppingBag size={20} className="text-accent" aria-hidden />
            <p className="mt-4 text-xs font-bold text-fg-3">{t("포인트로 산 에셋", "Assets bought with points")}</p>
            <p className="mt-1 text-3xl font-black text-fg">
              {number.format(ownedSpends.length)}
              <span className="ml-1 text-base font-bold text-fg-3">{t("개", "")}</span>
            </p>
            <Link
              to="/market/library"
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {t("내 에셋 관리", "My assets")}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </article>
        </section>

        <section
          aria-label={t("다음 행동", "Next step")}
          className={`mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border p-5 ${
            summary.expiringSoonPoints > 0
              ? "border-warn/40 bg-warn/5"
              : "border-accent/30 bg-accent-soft/40"
          }`}
        >
          <div className="min-w-0">
            <h2 className="text-base font-black text-fg">
              {summary.expiringSoonPoints > 0
                ? t(
                    `만료 예정 ${number.format(summary.expiringSoonPoints)}P부터 사용하세요`,
                    `Spend the ${number.format(summary.expiringSoonPoints)}P that expire soon first`,
                  )
                : summary.balance > 0
                  ? t(
                      `지금 ${number.format(summary.balance)}P로 에셋을 교환할 수 있어요`,
                      `You can exchange ${number.format(summary.balance)}P for assets now`,
                    )
                  : t("아직 쓸 포인트가 없어요", "No points to spend yet")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-fg-2">
              {summary.expiringSoonPoints > 0
                ? t(
                    "포인트는 만료가 가까운 순서대로 차감됩니다. 만료 전에 마켓 에셋으로 교환하세요.",
                    "Points closest to expiry are spent first. Exchange them for market assets before they lapse.",
                  )
                : summary.balance > 0
                  ? t(
                      "마켓에서 포인트로 살 수 있는 에셋을 확인하고, 산 에셋은 내 에셋에서 관리하세요.",
                      "Browse assets you can buy with points in the market, and manage purchases under My assets.",
                    )
                  : t(
                      "오늘의 로그인 보너스와 작품 활동으로 첫 포인트를 쌓을 수 있어요. 아래 적립 방법을 확인하세요.",
                      "Earn your first points with today's login bonus and creative activity. See how to earn below.",
                    )}
            </p>
          </div>
          {summary.balance > 0 ? (
            <Link
              to="/market"
              className={buttonClass({
                className: "min-h-11 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              })}
            >
              {t("포인트로 살 에셋 보기", "Browse assets to buy with points")}
              <ArrowRight size={15} aria-hidden />
            </Link>
          ) : (
            <a
              href="#points-earn"
              className={buttonClass({
                className: "min-h-11 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              })}
            >
              {t("포인트 쌓는 법 보기", "See how to earn")}
              <ArrowRight size={15} aria-hidden />
            </a>
          )}
        </section>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_1fr]">
          <section id="points-earn" aria-labelledby="points-earn-title" className="scroll-mt-24 rounded-3xl border border-line bg-panel p-6">
            <div className="flex items-center gap-2">
              <Coins size={18} className="text-accent" aria-hidden />
              <h2 id="points-earn-title" className="text-xl font-black text-fg">{t("포인트 쌓는 법", "How to earn")}</h2>
            </div>
            <div className="mt-5 space-y-3">
              {Object.values(ASSET_POINT_EARN_RULES).map((rule) => {
                const usedToday = countEarnsToday(events, rule.key, new Date());
                const remaining = Math.max(0, rule.dailyLimit - usedToday);
                return (
                  <div key={rule.key} className="rounded-2xl border border-line bg-card/45 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-fg">{t(rule.labelKo, rule.labelEn)}</span>
                      <span className="text-xs font-black text-accent">+{rule.points}P</span>
                    </div>
                    <p className="mt-1 text-xs text-fg-3">
                      {rule.status === "live"
                        ? t(
                            `하루 ${rule.dailyLimit}회까지 · 오늘 ${remaining}회 남음`,
                            `Up to ${rule.dailyLimit} a day · ${remaining} left today`,
                          )
                        : t("연결 준비 중입니다.", "Coming soon.")}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-xs leading-5 text-fg-3">
              {t(
                "작품 공개·댓글 같은 활동 포인트는 서버 멤버십 지갑에 따로 쌓입니다.",
                "Activity points for publishing and comments are tracked separately in the server membership wallet.",
              )}{" "}
              <Link
                to="/membership/usage"
                className="inline-flex min-h-11 items-center rounded-lg px-1.5 font-bold text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {t("멤버십 이용 내역에서 보기", "See membership usage")}
              </Link>
            </p>
          </section>

          <section aria-labelledby="points-history-title" className="rounded-3xl border border-line bg-panel p-6">
            <div className="flex items-center gap-2">
              <History size={18} className="text-accent" aria-hidden />
              <h2 id="points-history-title" className="text-xl font-black text-fg">{t("적립·사용 내역", "History")}</h2>
            </div>
            {history.length === 0 ? (
              <ActionableEmptyState
                art="none"
                icon={Coins}
                className="mt-5 p-4 sm:p-5"
                title={t("아직 내역이 없습니다", "No history yet")}
                description={t(
                  "오늘의 로그인 보너스부터 시작해 보세요. 쌓은 포인트는 마켓 에셋으로 교환할 수 있습니다.",
                  "Your daily login bonus is a good start. Earned points can be exchanged for market assets.",
                )}
                primary={{ href: "/market", label: t("포인트로 살 에셋 보기", "Browse assets to buy with points") }}
              />
            ) : (
              <ul className="mt-5 space-y-2">
                {history.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card/45 p-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-fg">{eventLabel(event, t)}</p>
                      <p className="mt-0.5 text-xs text-fg-3">
                        {new Date(event.occurredAt).toLocaleString(locale)}
                      </p>
                    </div>
                    <span
                      className={
                        event.kind === "spend"
                          ? "shrink-0 text-sm font-black text-fg-2"
                          : "shrink-0 text-sm font-black text-good"
                      }
                    >
                      {event.kind === "spend" ? "−" : "+"}
                      {number.format(event.amount)}P
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="mt-8 flex items-start gap-3 rounded-3xl border border-line bg-panel p-5">
          <Info className="mt-0.5 shrink-0 text-fg-3" size={18} aria-hidden />
          <p className="text-xs leading-6 text-fg-2">
            {t(
              "스튜디오 포인트는 현금성 재화가 아닙니다. 충전·환전·양도·환불 대상이 아니며, 지급일로부터 365일이 지나면 만료됩니다. 사용할 때는 만료가 가까운 포인트부터 먼저 차감됩니다.",
              "Studio Points are not a cash equivalent. They cannot be purchased, cashed out, transferred, or refunded, and they expire 365 days after they are granted. Points closest to expiry are spent first.",
            )}
          </p>
        </section>
      </div>
    </Container>
  );
}

export default AssetPointsWalletPage;
