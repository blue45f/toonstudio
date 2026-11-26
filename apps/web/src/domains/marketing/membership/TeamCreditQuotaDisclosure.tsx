import { RotateCcw, Users, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import {
  allocateTeamAssistantQuota,
  listTeamAssistantQuotas,
  revokeTeamAssistantQuota,
  type TeamAssistantQuotaView,
} from "@/platform/membership-wallet-client";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";

export function TeamCreditQuotaDisclosure({
  formatter,
}: {
  readonly formatter: Intl.NumberFormat;
}) {
  const bi = useBilingual("TeamCreditQuotaDisclosure");
  const userId = useApp((state) => state.userId);
  const [quotas, setQuotas] = useState<readonly TeamAssistantQuotaView[]>([]);
  const [assistantId, setAssistantId] = useState("");
  const [roleKo, setRoleKo] = useState("선화·채색 어시스턴트");
  const [limitCredits, setLimitCredits] = useState(300);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void listTeamAssistantQuotas()
      .then((res) => {
        if (active && Array.isArray(res?.items)) {
          setQuotas(res.items);
        }
      })
      .catch(() => {
        // 오프라인·비로그인 환경에서는 로컬 배정 목록을 빈 배열로 유지한다.
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const activeCount = quotas.filter((q) => q.status === "active").length;

  const handleAllocate = async () => {
    if (!userId) {
      requestAuthModalOpen({
        reason: "protected-action",
        source: "team-quota-allocate",
        mode: "login",
      });
      return;
    }
    const cleanTarget = assistantId.trim();
    if (cleanTarget.length < 2) return;
    setBusy(true);
    setNotice("");
    setErrorMsg("");
    try {
      const created = await allocateTeamAssistantQuota({
        workspaceId: "ep-review-room",
        assistantUserId: cleanTarget,
        assistantNickname: cleanTarget,
        roleKo,
        limitCredits,
      });
      setQuotas((prev) => [created, ...prev]);
      setAssistantId("");
      setNotice(
        bi(
          `[${created.assistantNickname}] 어시스턴트에게 이번 회차 한도 ${formatter.format(created.limitCredits)} C를 배정했습니다.`,
          `Allocated ${formatter.format(created.limitCredits)} C to ${created.assistantNickname} for this episode.`,
        ),
      );
    } catch {
      setErrorMsg(
        bi(
          "팀 작업 한도를 배정하지 못했습니다. 어시스턴트 ID와 수량(10~20,000 C)을 확인해 주세요.",
          "Could not allocate team credit quota. Check assistant ID and credit range.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (allocationId: string, nickname: string) => {
    setBusy(true);
    setNotice("");
    setErrorMsg("");
    try {
      const res = await revokeTeamAssistantQuota(allocationId);
      setQuotas((prev) =>
        prev.map((q) => (q.allocationId === allocationId ? res : q)),
      );
      setNotice(
        bi(
          `[${nickname}] 납품 완료 처리 · 미사용 한도 ${formatter.format(res.releasedCredits)} C를 팀 공용 지갑으로 즉시 회수했습니다.`,
          `Revoked remaining ${formatter.format(res.releasedCredits)} C from ${nickname} back to the team pool.`,
        ),
      );
    } catch {
      setErrorMsg(
        bi(
          "한도 회수 중 오류가 발생했습니다.",
          "Failed to revoke assistant credit quota.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <details
      data-testid="team-credit-quota-disclosure"
      className="mt-4 rounded-xl border border-line bg-panel p-3.5 sm:p-4"
    >
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-xs font-bold text-fg">
        <span className="inline-flex items-center gap-1.5">
          <Wallet size={14} className="text-accent" aria-hidden />
          {bi(
            "팀 공용 크레딧 지갑 · 외주 어시별 작업 한도 배정 및 납품 후 즉시 회수",
            "Team Shared Credit Pool · Per-Assistant Quota & Instant Revocation",
          )}
        </span>
        <span className="rounded-md border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-fg-2">
          {bi(`활성 배정 ${activeCount}건`, `${activeCount} active`)}
        </span>
      </summary>

      <div className="mt-3 border-t border-line pt-3 text-xs">
        <p className="text-[11px] leading-[1.5] text-fg-3 [word-break:keep-all]">
          {bi(
            "스튜디오 대표·PD의 팀 크레딧 안에서 이번 회차 합류 어시스턴트에게 백업·검수·선택형 AI 사용 한도만 열어 주고, 원고 납품 승인이 끝나면 버튼 하나로 잔여 한도와 열람 권한을 함께 회수합니다.",
            "Grant bounded workspace credit quotas to freelance assistants without transferring cash or permanent credits, and revoke unspent limits on approval.",
          )}
        </p>

        <div className="mt-2.5 grid gap-2 sm:grid-cols-4">
          <input
            type="text"
            value={assistantId}
            onChange={(e) => setAssistantId(e.target.value)}
            aria-label={bi("외주 어시스턴트 ID", "Assistant user ID")}
            placeholder={bi("어시스턴트 ID (예: assist-luna)", "Assistant ID")}
            className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs text-fg sm:min-h-9"
          />
          <input
            type="text"
            value={roleKo}
            onChange={(e) => setRoleKo(e.target.value)}
            aria-label={bi("담당 직무", "Assigned role")}
            className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs text-fg sm:min-h-9"
          />
          <input
            type="number"
            min={10}
            max={20000}
            step={50}
            value={limitCredits}
            onChange={(e) => setLimitCredits(Number(e.target.value) || 0)}
            aria-label={bi("배정 크레딧 한도(C)", "Credit quota limit")}
            className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs tabular-nums text-fg sm:min-h-9"
          />
          <button
            type="button"
            disabled={busy || assistantId.trim().length < 2}
            data-testid="allocate-team-quota-btn"
            onClick={() => void handleAllocate()}
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: "min-h-11 text-xs sm:min-h-9",
            })}
          >
            <Users size={13} className="mr-1" aria-hidden />
            {bi("회차 한도 배정", "Allocate Quota")}
          </button>
        </div>

        {quotas.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {quotas.slice(0, 5).map((q) => (
              <li
                key={q.allocationId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2"
              >
                <div>
                  <span className="font-semibold text-fg">
                    {q.assistantNickname}
                  </span>{" "}
                  <span className="text-[11px] text-fg-3">({q.roleKo})</span>
                  <p className="text-[11px] tabular-nums text-fg-2">
                    {bi(
                      `배정 ${formatter.format(q.limitCredits)} C · 잔여 ${formatter.format(q.remainingCredits)} C`,
                      `Limit ${formatter.format(q.limitCredits)} C · Left ${formatter.format(q.remainingCredits)} C`,
                    )}
                  </p>
                </div>
                {q.status === "active" ? (
                  <button
                    type="button"
                    disabled={busy}
                    data-testid={`revoke-quota-${q.allocationId}`}
                    onClick={() =>
                      void handleRevoke(q.allocationId, q.assistantNickname)
                    }
                    className={buttonClass({
                      variant: "outline",
                      size: "sm",
                      className: "min-h-11 text-xs sm:min-h-8",
                    })}
                  >
                    <RotateCcw size={12} className="mr-1" aria-hidden />
                    {bi("납품 완료 · 한도 회수", "Revoke Quota")}
                  </button>
                ) : (
                  <span className="rounded bg-panel px-2 py-0.5 text-[11px] text-fg-3">
                    {bi("회수 완료", "Revoked")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {notice ? (
          <p role="status" className="mt-2 text-xs font-semibold text-good">
            {notice}
          </p>
        ) : null}
        {errorMsg ? (
          <p role="alert" className="mt-2 text-xs font-semibold text-bad">
            {errorMsg}
          </p>
        ) : null}
      </div>
    </details>
  );
}
