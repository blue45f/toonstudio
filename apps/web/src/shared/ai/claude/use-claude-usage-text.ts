import "./claude-assist-i18n";

import { formatNumber } from "@toonstudio/core/format";
import { useCallback } from "react";

import { useT } from "@/shared/lib/i18n";

import { formatClaudeUsd } from "./claude-usage-meter";

import type { ClaudeTokenUsage } from "./claude-models";

export interface ClaudeUsageSummary {
  readonly model: string;
  readonly usage: ClaudeTokenUsage;
  /** 단가를 모르는 모델은 null — 숫자를 지어내지 않고 토큰만 보여 준다. */
  readonly estimatedUsd: number | null;
}

/** 결과 아래에 붙이는 사용량 한 줄("모델 · 입력 · 출력 · 추정 비용"). 대화상자마다 같은 문구를 만들지 않도록 한 곳에 둔다. */
export function useClaudeUsageText(): (summary: ClaudeUsageSummary) => string {
  const t = useT();
  return useCallback((summary) => {
    const input = formatNumber(summary.usage.inputTokens + summary.usage.cacheReadTokens + summary.usage.cacheWriteTokens);
    const output = formatNumber(summary.usage.outputTokens);
    return summary.estimatedUsd === null
      ? t("claudeAssist.common.usageLineNoCost", { model: summary.model, input, output })
      : t("claudeAssist.common.usageLine", { model: summary.model, input, output, cost: formatClaudeUsd(summary.estimatedUsd) });
  }, [t]);
}
