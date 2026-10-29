import "./ai-assist-i18n";

import { formatNumber } from "@toonstudio/core/format";
import { useCallback } from "react";

import { useT } from "@/shared/lib/i18n";

import { isManagedAssistModelLabel } from "./assist-route";
import { formatAssistUsd } from "./assist-usage-meter";

import type { AssistTokenUsage } from "./assist-models";

export interface AssistUsageSummary {
  readonly model: string;
  readonly usage: AssistTokenUsage;
  /** 단가를 모르는 모델은 null — 숫자를 지어내지 않고 토큰만 보여 준다. */
  readonly estimatedUsd: number | null;
}

/**
 * 결과 아래에 붙이는 사용량 한 줄("모델 · 입력 · 출력 · 추정 비용"). 대화상자마다 같은 문구를 만들지 않도록 한 곳에 둔다.
 * 관리형 경로(ToonStudio AI) 결과는 사용자 비용이 없으므로 추정 비용 대신 "무료"를 붙인다.
 */
export function useAssistUsageText(): (summary: AssistUsageSummary) => string {
  const t = useT();
  return useCallback((summary) => {
    const input = formatNumber(summary.usage.inputTokens + summary.usage.cacheReadTokens + summary.usage.cacheWriteTokens);
    const output = formatNumber(summary.usage.outputTokens);
    if (isManagedAssistModelLabel(summary.model)) {
      return t("aiAssist.managed.usageLine", { model: summary.model, input, output });
    }
    return summary.estimatedUsd === null
      ? t("aiAssist.common.usageLineNoCost", { model: summary.model, input, output })
      : t("aiAssist.common.usageLine", { model: summary.model, input, output, cost: formatAssistUsd(summary.estimatedUsd) });
  }, [t]);
}
