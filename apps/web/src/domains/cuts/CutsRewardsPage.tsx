/**
 * 컷츠 리워드 펀드 정산 대시보드 (`/cuts/rewards`).
 *
 * 작가가 자기 몫을 확인하는 화면이다. 진행 중인 달은 예상 정산액,
 * 지난 달은 확정액으로 보여주고, 어떤 클립의 어떤 조회가 얼마가 됐는지
 * 클립별 내역까지 펼친다. 팬 리믹스가 번 조회에서 원작자에게 돌아온
 * 30%도 같은 내역에 구분돼 찍힌다.
 *
 * 데이터는 cuts-rewards의 CutsRewardsApi 계약으로만 들어온다.
 * 지금은 로컬 어댑터(데모 원장 + 이 브라우저의 실제 시청 이벤트)가
 * 붙어 있고, 서버 정산이 열리면 어댑터만 교체된다.
 */

import { ArrowLeft, Clapperboard, Coins, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import Link from "@/shared/navigation/router-link";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { LoadingState } from "@/shared/components/LoadingState";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useAuthActorId } from "@/domains/auth/public/session/use-auth-actor-id";

import {
  createLocalCutsRewardsApi,
  formatKrw,
  formatSharePercent,
  selectRecipientSettlement,
  type RewardClipBreakdown,
  type RewardPeriod,
  type RewardSettlement,
} from "./cuts-rewards";
import { buildSeedClips } from "./cuts-seed";
import { formatCutsCount, useCutsStore } from "./cuts-store";

import "./cuts.css";

type LoadState = "loading" | "ready" | "error";

function periodLabel(period: RewardPeriod, t: (ko: string, en: string) => string): string {
  const [year, month] = period.id.split("-");
  return t(`${year}년 ${Number(month)}월`, `${year}-${month}`);
}

function roleLabel(role: RewardClipBreakdown["role"], t: (ko: string, en: string) => string): string {
  if (role === "remix-original") return t("팬 리믹스의 원작", "Original of a fan remix");
  if (role === "remix-creator") return t("내가 만든 리믹스", "My fan remix");
  return t("내 작품", "My title");
}

export function CutsRewardsPage() {
  const t = useBilingual("cuts");
  const clips = useCutsStore((state) => state.clips);
  const viewEvents = useCutsStore((state) => state.viewEvents);
  const publishClip = useCutsStore((state) => state.publishClip);
  const actorId = useAuthActorId();

  const api = useMemo(
    () => createLocalCutsRewardsApi({ clips, userEvents: viewEvents }),
    [clips, viewEvents],
  );

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [periods, setPeriods] = useState<readonly RewardPeriod[]>([]);
  const [settlements, setSettlements] = useState<ReadonlyMap<string, RewardSettlement>>(new Map());
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [recipientChoice, setRecipientChoice] = useState<string | null>(null);
  const [payoutModel, setPayoutModel] = useState<"toonstudio-70-30" | "tiktok-creator-rewards" | "youtube-shorts-rpm" | "webtoon-superlike">("toonstudio-70-30");
  const [retentionTier, setRetentionTier] = useState<"qualified-50" | "completion-75" | "loop-100">("qualified-50");

  // 피드를 거치지 않고 바로 들어와도 데모 작품으로 정산이 보이게 시드를 채운다.
  // publishClip은 앞에 붙이므로, 시드 순서를 유지하려면 뒤집어 넣어야 한다.
  // 단, 스토어 복원이 끝나기 전에 빈 목록을 보고 시드를 넣으면 복원된 본인
  // 클립과 경쟁한다 — 피드와 같은 하이드레이션 게이트 뒤에서만 넣는다.
  useEffect(() => {
    const ensureSeeded = () => {
      if (useCutsStore.getState().clips.length === 0) {
        [...buildSeedClips()].reverse().forEach((clip) => publishClip(clip));
      }
    };
    if (useCutsStore.persist.hasHydrated()) {
      ensureSeeded();
      return undefined;
    }
    return useCutsStore.persist.onFinishHydration(ensureSeeded);
  }, [publishClip]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.listPeriods();
        const results = await Promise.all(list.map((period) => api.getSettlement(period.id)));
        if (cancelled) return;
        const byPeriod = new Map(results.map((settlement) => [settlement.period.id, settlement]));
        setPeriods(list);
        setSettlements(byPeriod);
        setPeriodId((previous) => previous ?? list[0]?.id ?? null);
        setRefreshFailed(false);
        setLoadState("ready");
      } catch {
        if (!cancelled) {
          // 이미 보여줄 정산이 있으면 유지하되, 낡은 숫자를 신선한 것처럼 두지 않는다.
          setLoadState((previous) => {
            if (previous === "ready") {
              setRefreshFailed(true);
              return previous;
            }
            return "error";
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, reloadTick]);

  // 수령자 목록 — 전 기간 합산 금액 큰 순.
  const recipients = useMemo(() => {
    const totals = new Map<string, { displayName: string; amountKrw: number }>();
    for (const settlement of settlements.values()) {
      for (const entry of settlement.entries) {
        const current = totals.get(entry.recipientKey);
        totals.set(entry.recipientKey, {
          displayName: entry.displayName,
          amountKrw: (current?.amountKrw ?? 0) + entry.amountKrw,
        });
      }
    }
    return [...totals.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.amountKrw - a.amountKrw);
  }, [settlements]);

  const selectedPeriod = periods.find((period) => period.id === periodId) ?? null;
  const selectedSettlement = periodId ? settlements.get(periodId) ?? null : null;
  // 수령자 기본값은 최고액 수령자가 아니라 "내 정산"이다 — 사용자가 직접 고르기
  // 전까지는 로그인 계정의 수령자 항목을, 없으면 첫 항목을 파생값으로 쓴다.
  // (상태로 굳히면 로그인 판정이 늦게 도착했을 때 기본값이 남의 정산으로 남는다.)
  const firstSettlement = periods[0] ? settlements.get(periods[0].id) ?? null : null;
  const autoRecipientKey =
    (actorId
      ? firstSettlement?.entries.find((entry) => entry.recipientKey === `creator:${actorId}`)
      : undefined)?.recipientKey ??
    firstSettlement?.entries[0]?.recipientKey ??
    null;
  const recipientKey = recipientChoice ?? autoRecipientKey;
  const mySettlement =
    selectedSettlement && recipientKey
      ? selectRecipientSettlement(selectedSettlement, recipientKey)
      : null;

  return (
    <div className="cuts-rewards">
      <SiteContextualSubNav pathnameOverride="/cuts/rewards" className="mb-4" />
      <nav className="flex flex-wrap items-center gap-2" aria-label={t("컷츠 및 정산 이동", "Cuts and settlement navigation")}>
        <Link href="/cuts" className="cuts-button cuts-button--ghost">
          <ArrowLeft size={16} aria-hidden="true" /> {t("피드로 돌아가기", "Back to feed")}
        </Link>
        <Link href="/cuts/studio" className="cuts-button cuts-button--ghost">
          <Clapperboard size={16} aria-hidden="true" /> {t("클립 만들기", "Create a clip")}
        </Link>
        <Link href="/creator/revenue" className="cuts-button cuts-button--ghost">
          {t("창작자 수익·정산 대시보드", "Creator revenue dashboard")}
        </Link>
      </nav>
      <h1>
        <Coins size={24} aria-hidden="true" /> {t("리워드 펀드 정산", "Reward fund settlement")}
      </h1>
      <p className="cuts-rewards__intro">
        {t(
          "컷츠 조회가 쌓이면 월간 펀드가 조회 비율대로 나뉘어 작가에게 돌아가요. 절반 이상 본 조회만 세고, 팬 리믹스의 조회는 만든 팬 70%·원작자 30%로 갈라요.",
          "Monthly fund payouts follow qualified views on your Cuts. Only views past the halfway mark count, and fan remix views split 70% to the fan and 30% to the original creator.",
        )}
      </p>

      <section
        aria-label={t("REA 숏폼 멀티플랫폼 RPM 및 팬 리믹스 정산 시뮬레이터", "REA Short-Form Multi-Platform RPM & Remix Split Simulator")}
        data-testid="cuts-rewards-rea-rpm-simulator"
        className="mb-5 rounded-2xl border border-line bg-card/85 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-extrabold text-fg">
            {t("ToonStudio 70:30 · TikTok Creator Rewards · YouTube Shorts · Super Like 정산 시뮬레이터", "ToonStudio 70:30 / TikTok Creator Rewards / YouTube Shorts / Super Like Payout Simulator")}
          </span>
          <span data-testid="cuts-rewards-rea-rpm-status" className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-accent">
            {payoutModel === "toonstudio-70-30"
              ? t(`팬 리믹스 70% · 원작자 30% 자동 귀속 (${retentionTier === "qualified-50" ? "50%+ 적격 조회 ×1.0" : retentionTier === "completion-75" ? "75%+ 완주 부스트 ×1.35" : "100% 루프 리플레이 ×1.60"})`, `Fan 70% · Original 30% split (${retentionTier})`)
              : payoutModel === "tiktok-creator-rewards"
                ? t(`TikTok Creator Rewards 60초+ 고보존율 RPM 가중치 (${retentionTier})`, `TikTok Creator Rewards 60s+ retention RPM (${retentionTier})`)
                : payoutModel === "youtube-shorts-rpm"
                  ? t(`YouTube Shorts 크리에이터 풀 + 음원/더빙 라이선스 분배 (${retentionTier})`, `YouTube Shorts Creator Pool + Audio Split (${retentionTier})`)
                  : t(`Webtoon Super Like 후원 + 본편 미리보기 전환 보너스 +28% (${retentionTier})`, `Webtoon Super Like + Fast-Pass Conversion Bonus +28% (${retentionTier})`)}
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("정산 모델 프리셋", "Payout model presets")}>
            {([
              ["toonstudio-70-30", t("ToonStudio 70:30 리믹스 표준", "ToonStudio 70:30 Remix")],
              ["tiktok-creator-rewards", t("TikTok Creator Rewards RPM", "TikTok Creator Rewards RPM")],
              ["youtube-shorts-rpm", t("YouTube Shorts 음원 풀 정산", "YouTube Shorts Audio Pool")],
              ["webtoon-superlike", t("Super Like · 본편 전환 보너스", "Super Like · Episode Bonus")],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-testid={`cuts-rewards-rea-model-${id}`}
                aria-pressed={payoutModel === id}
                onClick={() => setPayoutModel(id)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${payoutModel === id ? "border-accent bg-accent text-on-accent" : "border-line bg-panel text-fg-2 hover:border-accent/50"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5" role="group" aria-label={t("시청 유지율 구간", "View retention tier")}>
            {([
              ["qualified-50", t("50%+ 적격", "50%+ Qualified")],
              ["completion-75", t("75%+ 완주(×1.35)", "75%+ Complete (×1.35)")],
              ["loop-100", t("100% 루프(×1.6)", "100% Loop (×1.6)")],
            ] as const).map(([tierId, tierLabel]) => (
              <button
                key={tierId}
                type="button"
                data-testid={`cuts-rewards-rea-tier-${tierId}`}
                aria-pressed={retentionTier === tierId}
                onClick={() => setRetentionTier(tierId)}
                className={`rounded-lg border px-2 py-1 text-xs font-bold transition-colors ${retentionTier === tierId ? "border-accent bg-accent/15 text-accent" : "border-line bg-panel text-fg-3"}`}
              >
                {tierLabel}
              </button>
            ))}
          </div>
        </div>
      </section>

      {!actorId ? (
        <div className="cuts-studio__notice cuts-rewards__guest" role="note">
          <p>
            {t(
              "지금은 게스트로 데모 정산을 보는 중이에요. 로그인하면 내 작품 정산으로 이어서 볼 수 있어요.",
              "You're viewing a demo settlement as a guest. Sign in to see this connected to your own titles.",
            )}
          </p>
          <button
            type="button"
            className="cuts-button cuts-button--primary"
            onClick={() =>
              requestAuthModalOpen({ reason: "protected-action", source: "cuts-rewards" })
            }
          >
            {t("로그인하기", "Sign in")}
          </button>
        </div>
      ) : null}

      {loadState === "loading" ? (
        <div className="cuts-rewards__loading">
          <LoadingState
            variant="cards"
            cardCount={3}
            label={t("정산을 계산하는 중이에요…", "Calculating your settlement…")}
          />
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="cuts-studio__notice" role="alert">
          <p>{t("정산을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.", "Couldn't load the settlement. Please try again in a moment.")}</p>
          <button
            type="button"
            className="cuts-button cuts-button--primary"
            onClick={() => {
              setLoadState("loading");
              setReloadTick((tick) => tick + 1);
            }}
          >
            <RefreshCw size={16} aria-hidden="true" /> {t("다시 시도", "Retry")}
          </button>
        </div>
      ) : null}

      {loadState === "ready" && refreshFailed ? (
        <div className="cuts-studio__notice" role="alert">
          <p>{t("새 정산을 불러오지 못해 이전에 계산한 정산을 그대로 보여주고 있어요.", "Couldn't refresh — showing the settlement calculated earlier.")}</p>
          <button
            type="button"
            className="cuts-button cuts-button--primary"
            onClick={() => setReloadTick((tick) => tick + 1)}
          >
            <RefreshCw size={16} aria-hidden="true" /> {t("다시 시도", "Retry")}
          </button>
        </div>
      ) : null}

      {loadState === "ready" && periods.length === 0 ? (
        <ActionableEmptyState
          icon={Coins}
          title={t("아직 정산 기간이 열리지 않았어요", "No settlement period has opened yet")}
          description={t(
            "첫 기간이 열리면 여기에 정산이 쌓여요. 그동안 피드에서 클립 반응을 확인해 보세요.",
            "Once the first period opens, your settlement will build up here. Until then, check clip reactions in the feed.",
          )}
          primary={{ href: "/cuts", label: t("피드 보러 가기", "Go to feed") }}
        />
      ) : null}

      {loadState === "ready" && selectedPeriod && selectedSettlement ? (
        <>
          <div className="cuts-rewards__controls">
            <label>
              {t("정산 기간", "Period")}
              <select
                value={selectedPeriod.id}
                onChange={(event) => setPeriodId(event.target.value)}
              >
                {periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {periodLabel(period, t)} ·{" "}
                    {period.status === "open" ? t("진행 중", "In progress") : t("마감", "Closed")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("받는 사람", "Recipient")}
              <select
                value={recipientKey ?? ""}
                onChange={(event) => setRecipientChoice(event.target.value)}
              >
                {recipients.map((recipient) => (
                  <option key={recipient.key} value={recipient.key}>
                    {recipient.key.startsWith("creator:")
                      ? `${t("팬", "Fan")} ${recipient.displayName}`
                      : recipient.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <section
            className="cuts-rewards__summary"
            aria-label={t("정산 요약", "Settlement summary")}
          >
            <div className="cuts-rewards__card">
              <span>
                {selectedPeriod.status === "open"
                  ? t("예상 정산액", "Estimated payout")
                  : t("확정 정산액", "Final payout")}
              </span>
              <strong>{mySettlement ? formatKrw(mySettlement.amountKrw) : "—"}</strong>
              <span>
                {periodLabel(selectedPeriod, t)} ·{" "}
                {!mySettlement
                  ? t("이 기간에는 정산 내역이 없어요", "No settlement for this period")
                  : selectedPeriod.status === "open"
                    ? t("기간이 끝나면 확정돼요", "Finalized when the period closes")
                    : t("정산 마감됨", "Period closed")}
              </span>
            </div>
            <div className="cuts-rewards__card">
              <span>{t("내 유효 조회", "My qualified views")}</span>
              <strong>{mySettlement ? formatCutsCount(mySettlement.qualifiedViews) : "—"}</strong>
              <span>
                {t("전체 {{total}} 중 {{share}}", "{{share}} of {{total}} total")
                  .replace("{{total}}", formatCutsCount(selectedSettlement.totalQualifiedViews))
                  .replace("{{share}}", formatSharePercent(mySettlement?.shareRatio ?? 0))}
              </span>
            </div>
            <div className="cuts-rewards__card">
              <span>{t("이 기간 펀드 총액", "Fund pool this period")}</span>
              <strong>{formatKrw(selectedPeriod.poolKrw)}</strong>
              <span>
                {selectedSettlement.unallocatedKrw > 0
                  ? t("미배분 {{amount}}", "{{amount}} unallocated").replace(
                      "{{amount}}",
                      formatKrw(selectedSettlement.unallocatedKrw),
                    )
                  : t("전액 배분됨", "Fully allocated")}
              </span>
            </div>
          </section>

          {mySettlement ? (
            <section aria-label={t("클립별 내역", "Per-clip breakdown")}>
              <h2>{t("클립별 내역", "Per-clip breakdown")}</h2>
              <div className="cuts-rewards__table-wrap">
                <table className="cuts-rewards__table">
                  <thead>
                    <tr>
                      <th scope="col">{t("작품", "Title")}</th>
                      <th scope="col">{t("구분", "Kind")}</th>
                      <th scope="col">{t("유효 조회", "Qualified views")}</th>
                      <th scope="col">{t("금액", "Amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mySettlement.clips.map((row) => (
                      <tr key={`${row.clipId}-${row.role}`}>
                        <td>
                          {row.title} {t(`${row.episodeNumber}화`, `Ep. ${row.episodeNumber}`)}
                        </td>
                        <td>{roleLabel(row.role, t)}</td>
                        <td>{formatCutsCount(row.qualifiedViews)}</td>
                        <td>{formatKrw(row.amountKrw)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <ActionableEmptyState
              icon={Clapperboard}
              title={t("아직 집계된 유효 조회가 없어요", "No qualified views yet")}
              description={t(
                "이 기간에는 아직 집계된 유효 조회가 없어요. 클립이 절반 이상 시청되면 여기에 정산이 쌓여요.",
                "No qualified views yet this period. Once clips are watched past the halfway mark, settlement builds up here.",
              )}
              primary={{ href: "/cuts/studio", label: t("클립 만들기", "Create a clip") }}
            />
          )}

          <section aria-label={t("기간별 내역", "History by period")}>
            <h2>{t("기간별 내역", "History by period")}</h2>
            <ul className="cuts-rewards__history">
              {periods.map((period) => {
                const settlement = settlements.get(period.id);
                const mine = settlement && recipientKey
                  ? selectRecipientSettlement(settlement, recipientKey)
                  : null;
                return (
                  <li key={period.id}>
                    <button
                      type="button"
                      className={
                        `cuts-rewards__history-row` +
                        (period.id === periodId ? " cuts-rewards__history-row--current" : "")
                      }
                      aria-current={period.id === periodId ? "true" : undefined}
                      onClick={() => setPeriodId(period.id)}
                    >
                      <span>
                        {periodLabel(period, t)} ·{" "}
                        {period.status === "open" ? t("진행 중", "In progress") : t("마감", "Closed")}
                      </span>
                      <span>
                        {t("유효 조회 {{views}}", "{{views}} qualified views").replace(
                          "{{views}}",
                          formatCutsCount(mine?.qualifiedViews ?? 0),
                        )}
                      </span>
                      <strong>{formatKrw(mine?.amountKrw ?? 0)}</strong>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <p className="cuts-rewards__footnote">
            {t(
              "리워드 펀드는 파일럿 운영 중이라 위 금액은 데모 원장으로 계산한 예시예요. 서버 정산이 열리면 같은 화면에서 실제 정산으로 이어집니다. 실제 지급은 정산 정책 확정 뒤에 시작돼요.",
              "The reward fund is in pilot: amounts above are computed from a demo ledger. When server settlement opens, this same screen carries the real numbers. Actual payouts begin after the settlement policy is finalized.",
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
