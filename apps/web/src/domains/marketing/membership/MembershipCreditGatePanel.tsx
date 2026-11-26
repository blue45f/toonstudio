import { CheckCircle2, Coins, Lock, Sparkles, Unlock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  getMembershipBillingMode,
  purchaseCreditPackWithGate,
  registerCreditWaitlistIntent,
  type MembershipBillingModeView,
} from "@/platform/membership-wallet-client";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";
import { MembershipMilestoneReferralStrip } from "./MembershipMilestoneReferralStrip";

const FALLBACK_BILLING_MODE: MembershipBillingModeView = {
  paidOperationsEnabled: false,
  mode: "free-activity-beta",
  subscriptionsEnabled: false,
  creditPurchasesEnabled: false,
  krwPerCredit: 10,
  activityRewardExpiryDays: 90,
  monthlyActivityCreditPoolCap: 50_000,
  creditPacks: [
    { id: "credit-pack-100", credits: 100, krwPrice: 1_000 },
    { id: "credit-pack-500", credits: 500, krwPrice: 5_000 },
    { id: "credit-pack-1000", credits: 1_000, krwPrice: 10_000 },
    { id: "credit-pack-5000", credits: 5_000, krwPrice: 50_000 },
  ],
  subscriptionPlans: [
    {
      planId: "creator",
      label: "Creator",
      monthlyIncludedCredits: 2_000,
      monthlyPriceKrw: 9_900,
      targetRoleKo: "개인 연재·일러스트 창작자",
    },
    {
      planId: "pro",
      label: "Pro",
      monthlyIncludedCredits: 5_000,
      monthlyPriceKrw: 19_900,
      targetRoleKo: "전문 작가·고해상도 원고 제작",
    },
    {
      planId: "team",
      label: "Team",
      monthlyIncludedCredits: 20_000,
      monthlyPriceKrw: 29_000,
      targetRoleKo: "소규모 웹툰 제작팀(PD 결재·비교 검수·승인본 인계)",
    },
  ],
  activityCreditRewards: [
    {
      id: "webtoon",
      category: "serialization",
      activityKey: "creator.work.published",
      labelKo: "웹툰 작품·회차 공개 업로드",
      labelEn: "Publish a webtoon episode or short",
      amountCredits: 50,
      dailyCapPerAccount: 1,
      expiryDays: 90,
    },
    {
      id: "illustration",
      category: "serialization",
      activityKey: "creator.work.published",
      labelKo: "그림·일러스트·작화 업로드",
      labelEn: "Upload an illustration or artwork",
      amountCredits: 30,
      dailyCapPerAccount: 1,
      expiryDays: 90,
    },
    {
      id: "workspace",
      category: "serialization",
      activityKey: "creator.work.created",
      labelKo: "새 공유 검수·파티 작업방 개설",
      labelEn: "Create a shared review or party workspace",
      amountCredits: 20,
      dailyCapPerAccount: 1,
      expiryDays: 90,
    },
    {
      id: "post",
      category: "contribution",
      activityKey: "community.post.created",
      labelKo: "커뮤니티 창작글·작업기 게시",
      labelEn: "Publish a community creative post",
      amountCredits: 10,
      dailyCapPerAccount: 1,
      expiryDays: 90,
    },
    {
      id: "comment",
      category: "contribution",
      activityKey: "community.comment.created",
      labelKo: "작품 감상·피드백 댓글 작성",
      labelEn: "Leave a constructive comment",
      amountCredits: 5,
      dailyCapPerAccount: 1,
      expiryDays: 90,
    },
  ],
};

export function MembershipCreditGatePanel({
  formatter,
}: {
  readonly formatter: Intl.NumberFormat;
}) {
  const bi = useBilingual("MembershipCreditGatePanel");
  const userId = useApp((state) => state.userId);
  const [state, setState] = useState<MembershipBillingModeView>(
    FALLBACK_BILLING_MODE,
  );
  const [selectedWaitlistPlan, setSelectedWaitlistPlan] = useState<
    "creator" | "pro" | "team"
  >("team");
  const [feedback, setFeedback] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadMode = useCallback(async () => {
    try {
      const next = await getMembershipBillingMode();
      setState(next);
    } catch {
      // 오프라인·네트워크 실패 시 사업자등록 전 안전한 무료·활동 모드로 폴백한다.
      setState(FALLBACK_BILLING_MODE);
    }
  }, []);

  useEffect(() => {
    void loadMode();
  }, [loadMode]);

  const handleWaitlist = async () => {
    if (!userId) {
      requestAuthModalOpen({
        reason: "protected-action",
        source: "credit-waitlist",
        mode: "login",
      });
      return;
    }
    setBusyKey("waitlist");
    setFeedback("");
    setErrorMsg("");
    try {
      const res = await registerCreditWaitlistIntent("plan", selectedWaitlistPlan);
      setFeedback(
        res.alreadyRegistered
          ? bi(
              `이미 ${selectedWaitlistPlan.toUpperCase()} 출시 알림(결제 0원)이 등록되어 있습니다.`,
              `You are already on the ${selectedWaitlistPlan.toUpperCase()} launch waitlist (0 KRW).`,
            )
          : bi(
              `${selectedWaitlistPlan.toUpperCase()} 출시 알림 사전예약(결제 0원)이 기록되었습니다.`,
              `Registered for ${selectedWaitlistPlan.toUpperCase()} launch notification (0 KRW charged).`,
            ),
      );
    } catch {
      setErrorMsg(
        bi(
          "사전예약 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          "Could not save your waitlist request. Please try again shortly.",
        ),
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handlePaidPackClick = async (packId: string) => {
    if (!userId) {
      requestAuthModalOpen({
        reason: "protected-action",
        source: "credit-pack-purchase",
        mode: "login",
      });
      return;
    }
    setBusyKey(packId);
    setFeedback("");
    setErrorMsg("");
    try {
      await purchaseCreditPackWithGate(packId, crypto.randomUUID());
      setFeedback(
        bi("크레딧 충전이 완료되었습니다.", "Credits have been added to your wallet."),
      );
    } catch {
      setErrorMsg(
        bi(
          "결제 확인 정보가 필요하거나 PG 심사 연동 전입니다.",
          "Payment confirmation is required before credits can be granted.",
        ),
      );
    } finally {
      setBusyKey(null);
    }
  };

  const paidOn = state.paidOperationsEnabled;

  return (
    <section
      aria-labelledby="credit-billing-gate-heading"
      data-testid="membership-credit-gate-panel"
      data-billing-mode={state.mode}
      className="mt-5 rounded-2xl border border-line bg-card p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black tracking-[0.12em] text-accent">
            {paidOn ? "CREDIT SUBSCRIPTION & TOP-UP" : "ACTIVITY CREDIT REWARDS"}
          </p>
          <h2
            id="credit-billing-gate-heading"
            className="mt-1 text-lg font-black text-fg sm:text-xl [word-break:keep-all]"
          >
            {paidOn
              ? bi(
                  "크레딧 정기구독 · 추가 크레딧 충전",
                  "Credit Subscriptions & Top-Up Packs",
                )
              : bi(
                  "활동으로 크레딧 적립하기 (베타 기간 현금 결제 없음)",
                  "Earn Studio Credits Through Activity (No Cash Billing in Beta)",
                )}
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-2 [word-break:keep-all]">
            {paidOn
              ? bi(
                  "월 정기 크레딧 플랜을 구독하거나 필요한 만큼 크레딧을 단건 충전할 수 있으며, 창작·댓글 활동 보너스 크레딧도 계속 적립됩니다.",
                  "Subscribe to a monthly credit plan or top up credit packs as needed, while continuing to earn bonus credits from creative activity.",
                )
              : bi(
                  "현재는 정식 유료 전환 전 공개 검증 단계로 현금 결제·구독 결제를 받지 않습니다. 웹툰·그림 업로드와 댓글 활동만으로 보너스 크레딧을 적립해 기능을 이용할 수 있습니다.",
                  "Cash payments and paid subscriptions are off during open validation. Upload webtoons or illustrations and leave comments to earn bonus credits free.",
                )}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
            paidOn
              ? "border-accent/40 bg-accent-soft text-accent"
              : "border-good/40 bg-good/10 text-good"
          }`}
        >
          {paidOn ? <Unlock size={13} aria-hidden /> : <Lock size={13} aria-hidden />}
          {paidOn
            ? bi("유료 구독·충전 열림", "Paid Billing Active")
            : bi("무결제 활동 적립 모드", "Free Activity-Only Mode")}
        </span>
      </div>

      {/* 항상 제공되는 창작·커뮤니티 활동 보상 크레딧 규칙 */}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {state.activityCreditRewards.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-line bg-panel px-3.5 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-accent">
                <Coins size={13} aria-hidden />+{formatter.format(item.amountCredits)} C
              </span>
              <span className="text-[11px] text-fg-3">
                {bi(`일 ${item.dailyCapPerAccount}회`, `${item.dailyCapPerAccount}/day`)}
              </span>
            </div>
            <p className="mt-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              {bi(item.labelKo, item.labelEn)}
            </p>
            <p className="mt-0.5 text-[11px] text-fg-3">
              {bi(
                `${item.expiryDays}일 유효 · 선입선출 우선 차감`,
                `Valid ${item.expiryDays}d · spent first`,
              )}
            </p>
          </div>
        ))}
      </div>

      <MembershipMilestoneReferralStrip
        formatter={formatter}
        milestones={state.milestoneCreditRewards}
      />

      {paidOn ? (
        <div
          data-testid="paid-credit-controls"
          className="mt-5 grid gap-4 border-t border-line pt-5 lg:grid-cols-2"
        >
          <div className="rounded-xl border border-line bg-panel p-4">
            <h3 className="text-sm font-bold text-fg">
              {bi("월 정기 크레딧 구독", "Monthly Credit Subscriptions")}
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {state.subscriptionPlans.map((plan) => (
                <div
                  key={plan.planId}
                  className="flex flex-col justify-between rounded-lg border border-line bg-card p-3"
                >
                  <div>
                    <p className="text-xs font-black uppercase text-accent">
                      {plan.label}
                    </p>
                    <p className="mt-1 text-sm font-extrabold tabular-nums text-fg">
                      {formatter.format(plan.monthlyPriceKrw)}
                      {bi("원/월", " KRW/mo")}
                    </p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-fg-2">
                      {bi(
                        `월 ${formatter.format(plan.monthlyIncludedCredits)} C 포함`,
                        `${formatter.format(plan.monthlyIncludedCredits)} C/mo`,
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid={`subscribe-plan-${plan.planId}`}
                    onClick={() => {
                      setSelectedWaitlistPlan(plan.planId);
                      void handleWaitlist();
                    }}
                    className={buttonClass({
                      size: "sm",
                      className: "mt-3 min-h-11 w-full text-xs",
                    })}
                  >
                    {bi(`${plan.label} 구독 신청`, `Subscribe ${plan.label}`)}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-panel p-4">
            <h3 className="text-sm font-bold text-fg">
              {bi("단건 추가 크레딧 구매", "Top-Up Credit Packs")}
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {state.creditPacks.map((pack) => (
                <div
                  key={pack.id}
                  className="flex flex-col justify-between rounded-lg border border-line bg-card p-3"
                >
                  <div>
                    <p className="text-sm font-black tabular-nums text-fg">
                      {formatter.format(pack.credits)} C
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-fg-3">
                      {formatter.format(pack.krwPrice)}
                      {bi("원", " KRW")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyKey === pack.id}
                    data-testid={`buy-credit-pack-${pack.id}`}
                    onClick={() => void handlePaidPackClick(pack.id)}
                    className={buttonClass({
                      variant: "outline",
                      size: "sm",
                      className: "mt-3 min-h-11 w-full text-xs",
                    })}
                  >
                    {bi("크레딧 구매", "Buy Credits")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div
          data-testid="free-waitlist-controls"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3.5"
        >
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Sparkles size={14} className="text-accent" aria-hidden />
              {bi(
                "정식 출시 알림 · 크레딧 플랜 사전예약 (결제 0원 · 비용 청구 없음)",
                "Official Launch Alert · Pre-Register Credit Plan (0 KRW)",
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-fg-3 [word-break:keep-all]">
              {bi(
                "활동 보너스 크레딧은 현금 환전·환불 대상이 아닌 무상 리워드이며, 정식 유료 전환 시 사전 안내 후 선택하신 플랜 알림을 보내 드립니다.",
                "Activity credits are non-cash promotional rewards. Get notified when your chosen plan opens.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="waitlist-plan-select">
              {bi("알림 받을 플랜 선택", "Choose plan for launch alert")}
            </label>
            <select
              id="waitlist-plan-select"
              value={selectedWaitlistPlan}
              onChange={(event) =>
                setSelectedWaitlistPlan(
                  event.target.value as "creator" | "pro" | "team",
                )
              }
              className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg"
            >
              {state.subscriptionPlans.map((plan) => (
                <option key={plan.planId} value={plan.planId}>
                  {plan.label} ({formatter.format(plan.monthlyIncludedCredits)} C)
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busyKey === "waitlist"}
              data-testid="register-waitlist-btn"
              onClick={() => void handleWaitlist()}
              className={buttonClass({
                variant: "outline",
                size: "sm",
                className: "min-h-11 text-xs",
              })}
            >
              {bi("출시 알림 신청 (무료)", "Notify Me (Free)")}
            </button>
          </div>
        </div>
      )}

      {feedback ? (
        <p
          role="status"
          className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-good"
        >
          <CheckCircle2 size={14} aria-hidden />
          {feedback}
        </p>
      ) : null}
      {errorMsg ? (
        <p role="alert" className="mt-3 text-xs font-semibold text-bad">
          {errorMsg}
        </p>
      ) : null}
    </section>
  );
}
