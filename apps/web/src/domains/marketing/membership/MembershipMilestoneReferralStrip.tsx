import { Gift, ShieldAlert, UsersRound } from "lucide-react";
import { useState } from "react";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import {
  claimReferralBonusCredits,
  type MilestoneStudioCreditRewardView,
} from "@/platform/membership-wallet-client";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";

const DEFAULT_MILESTONE_REWARDS: readonly MilestoneStudioCreditRewardView[] = [
  {
    id: "welcome",
    labelKo: "신규 가입 첫 시작 보너스",
    labelEn: "Welcome starter bonus",
    amountCredits: 50,
    capRuleKo: "계정당 1회",
    capRuleEn: "Once per account",
    expiryDays: 90,
  },
  {
    id: "first-public-work",
    labelKo: "첫 작품·회차 공개 달성",
    labelEn: "First public release milestone",
    amountCredits: 100,
    capRuleKo: "계정당 1회",
    capRuleEn: "Once per account",
    expiryDays: 90,
  },
  {
    id: "referral-invite",
    labelKo: "동료 작가·어시 초대 합류 (양방향)",
    labelEn: "Teammate referral bonus (both sides)",
    amountCredits: 100,
    capRuleKo: "피초대 계정당 1회",
    capRuleEn: "Once per invited account",
    expiryDays: 90,
  },
  {
    id: "beta-feedback-accepted",
    labelKo: "베타 안정성·검수 피드백 채택",
    labelEn: "Accepted stability feedback reward",
    amountCredits: 100,
    capRuleKo: "운영 검토 채택 건별",
    capRuleEn: "Per accepted feedback",
    expiryDays: 90,
  },
];

export function MembershipMilestoneReferralStrip({
  formatter,
  milestones = DEFAULT_MILESTONE_REWARDS,
}: {
  readonly formatter: Intl.NumberFormat;
  readonly milestones?: readonly MilestoneStudioCreditRewardView[];
}) {
  const bi = useBilingual("MembershipMilestoneReferralStrip");
  const userId = useApp((state) => state.userId);
  const [inviterCode, setInviterCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const myShareCode = userId ? `TS-${userId}` : "";

  const handleClaimReferral = async () => {
    if (!userId) {
      requestAuthModalOpen({
        reason: "protected-action",
        source: "credit-referral",
        mode: "login",
      });
      return;
    }
    const clean = inviterCode.trim();
    if (clean.length < 2) return;
    setBusy(true);
    setStatusMsg("");
    setErrorMsg("");
    try {
      const res = await claimReferralBonusCredits(clean);
      setInviterCode("");
      setStatusMsg(
        bi(
          `동료 초대 보너스 +${formatter.format(res.inviteeCredits)} C가 적립되었습니다. 초대하신 동료에게도 +${formatter.format(res.inviterCredits)} C가 함께 지급됩니다.`,
          `+${formatter.format(res.inviteeCredits)} C added to your wallet and +${formatter.format(res.inviterCredits)} C sent to your teammate.`,
        ),
      );
    } catch {
      setErrorMsg(
        bi(
          "이미 초대 보너스를 받았거나 유효하지 않은 초대 코드입니다.",
          "Referral bonus was already claimed or the invite code is invalid.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="milestone-referral-strip"
      className="mt-4 rounded-xl border border-line bg-panel p-3.5 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
          <Gift size={14} className="text-accent" aria-hidden />
          {bi(
            "첫 시작 · 동료 초대 · 안정성 검증 참여 보너스 크레딧",
            "Starter, Teammate Referral & Stability Test Bonus Credits",
          )}
        </p>
        <span className="inline-flex items-center gap-1 text-[11px] text-fg-3">
          <ShieldAlert size={12} aria-hidden />
          {bi(
            "90일 유효 · 무상 리워드(현금 환급 제외)",
            "Valid 90d · non-cash promotional credits",
          )}
        </span>
      </div>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {milestones.slice(0, 4).map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-line bg-card px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-bold tabular-nums text-accent">
                +{formatter.format(item.amountCredits)} C
              </span>
              <span className="text-[11px] text-fg-3">
                {bi(item.capRuleKo, item.capRuleEn)}
              </span>
            </div>
            <p className="mt-1 text-xs font-medium text-fg [word-break:keep-all]">
              {bi(item.labelKo, item.labelEn)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <UsersRound size={13} className="text-fg-2" aria-hidden />
            {bi(
              "동료 작가·어시스턴트 초대 코드 등록 (초대자·합류자 모두 +100 C)",
              "Redeem Teammate Invite Code (+100 C for both sides)",
            )}
          </p>
          {myShareCode ? (
            <p className="mt-0.5 text-[11px] tabular-nums text-fg-3">
              {bi(`내 초대 코드: ${myShareCode}`, `Your invite code: ${myShareCode}`)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={inviterCode}
            onChange={(e) => setInviterCode(e.target.value)}
            aria-label={bi("동료 초대 코드 입력", "Enter teammate invite code")}
            placeholder={bi("초대 코드 입력 (예: TS-creator1)", "Invite code (e.g. TS-creator1)")}
            className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg sm:min-h-9"
          />
          <button
            type="button"
            disabled={busy || inviterCode.trim().length < 2}
            data-testid="claim-referral-btn"
            onClick={() => void handleClaimReferral()}
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: "min-h-11 text-xs sm:min-h-9",
            })}
          >
            {bi("초대 보너스 받기", "Claim +100 C")}
          </button>
        </div>
      </div>

      {statusMsg ? (
        <p role="status" className="mt-2 text-xs font-semibold text-good">
          {statusMsg}
        </p>
      ) : null}
      {errorMsg ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-bad">
          {errorMsg}
        </p>
      ) : null}
    </div>
  );
}
