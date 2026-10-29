import "./ai-assist-i18n";

import { formatNumber } from "@toonstudio/core/format";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { assistBudgetPercent, useAssistBudget } from "./assist-budget";
import { formatAssistUsd, useAssistUsage } from "./assist-usage-meter";

/**
 * 이번 세션의 추정 사용액과 예산 진행 막대. 설정 카드와 스튜디오 허브가 같은 모양으로 쓴다.
 * 한도가 없으면 사용량 줄만 보이고, 한도가 있으면 막대와 퍼센트가 붙는다(`showUsage={false}`면 사용량 줄은 뺀다). 색만으로 상태를 전하지 않고 문장도 함께 쓴다.
 */
export function AssistBudgetMeter({ className, showUsage = true }: { readonly className?: string; readonly showUsage?: boolean }) {
  const t = useT();
  const { limitUsd } = useAssistBudget();
  const usage = useAssistUsage();
  const percent = assistBudgetPercent(limitUsd, usage.estimatedUsd);
  const high = percent !== null && percent >= 80;

  return (
    <div className={cn("space-y-1.5", className)} data-claude-budget-meter="true">
      {showUsage ? (
        <p className="text-xs text-fg-2">
          {usage.requests === 0
            ? t("aiAssist.card.usageEmpty")
            : t("aiAssist.hub.usageLine", { cost: formatAssistUsd(usage.estimatedUsd), requests: formatNumber(usage.requests) })}
        </p>
      ) : null}
      {usage.unconfirmedRequests > 0 ? (
        <p className="text-[0.6875rem] text-fg-3" data-claude-unconfirmed="true">
          {t("aiAssist.budget.unconfirmed", { count: usage.unconfirmedRequests, cost: formatAssistUsd(usage.unconfirmedUsd) })}
        </p>
      ) : null}
      {limitUsd === null || percent === null ? (
        <p className="text-[0.6875rem] text-fg-3">{t("aiAssist.budget.none")}</p>
      ) : (
        <>
          <div
            role="progressbar"
            aria-label={t("aiAssist.budget.title")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={t("aiAssist.budget.progress", { limit: formatAssistUsd(limitUsd), percent, spent: formatAssistUsd(usage.estimatedUsd) })}
            className="h-2 overflow-hidden rounded-full bg-line"
          >
            <div className={cn("h-full rounded-full transition-[width] motion-reduce:transition-none", high ? "bg-warn" : "bg-accent")} style={{ width: `${percent}%` }} />
          </div>
          <p className={cn("text-[0.6875rem]", high ? "font-semibold text-warn" : "text-fg-3")}>
            {t("aiAssist.budget.progress", { limit: formatAssistUsd(limitUsd), percent, spent: formatAssistUsd(usage.estimatedUsd) })}
          </p>
        </>
      )}
    </div>
  );
}
