import { Bell, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";

import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../studio-panel-ui";

import { useCreatorGovernanceAlerts } from "./use-creator-governance-alerts";

import { cn } from "@/shared/lib/utils";

/**
 * 창작자 스튜디오 내 실시간 정산 보류·배지 재발급 복구 알림 배너.
 * 실제 `/api/ip-governance/titles/:slug/creator-alerts` 응답을 표시한다.
 */
export function StudioCreatorGovernanceAlertsBanner({
  titleSlug,
}: {
  readonly titleSlug: string;
}) {
  const { alerts, loading, refresh } = useCreatorGovernanceAlerts(titleSlug);
  const holdCount = alerts.filter((item) => item.kind === "revocation-hold").length;

  return (
    <section
      data-testid="studio-creator-governance-alerts-banner"
      aria-label="창작자 정산 보류 및 복구 알림"
      className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3 text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold">
          <Bell className="size-4 text-accent" aria-hidden />
          <span>실시간 정산 보류 · 트러스트 배지 복구 알림</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            data-testid="creator-alerts-count-badge"
            className={cn(
              "rounded px-2 py-0.5 font-mono text-[0.62rem] font-bold tabular-nums",
              holdCount > 0 ? "bg-warn/10 text-warn" : "bg-good/10 text-good",
            )}
          >
            {holdCount > 0 ? `보류 알림 ${holdCount}건` : `정상 · 알림 ${alerts.length}건`}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            aria-label="창작자 알림 새로고침"
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border border-line bg-raised px-2 text-[0.62rem] font-bold text-fg hover:bg-card disabled:opacity-50",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
              STUDIO_TOUCH_TARGET,
            )}
          >
            <RefreshCw className="size-3" aria-hidden />
            <span>{loading ? "동기화 중" : "새로고침"}</span>
          </button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <p className="text-[0.64rem] text-fg-3">
          현재 정산 보류나 권리 철회 알림이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="creator-alerts-list">
          {alerts.map((alert) => {
            const isHold = alert.kind === "revocation-hold";
            return (
              <li
                key={alert.alertId}
                className={cn(
                  "flex flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-[0.65rem]",
                  isHold
                    ? "border-warn/40 bg-warn/10 text-warn"
                    : "border-good/40 bg-good/10 text-good",
                )}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  {isHold ? (
                    <ShieldAlert className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                  )}
                  <span>{alert.title}</span>
                </div>
                <p className="text-fg-2">{alert.remediationGuide}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
