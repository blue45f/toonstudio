import "./claude-assist-i18n";

import { useMemo } from "react";

import { useT } from "@/shared/lib/i18n";

import { CLAUDE_TIER_DEFAULT_MODEL } from "./claude-models";

export interface ClaudeModelOption {
  readonly id: string;
  readonly label: string;
}

/** 등급별 기본 모델 4개. 이름은 화면 언어를 따르고 모델 ID는 `claude-models`의 값 그대로다. */
export function useClaudeTierOptions(): readonly ClaudeModelOption[] {
  const t = useT();
  return useMemo(() => [
    { id: CLAUDE_TIER_DEFAULT_MODEL.fast, label: t("claudeAssist.common.tierFast") },
    { id: CLAUDE_TIER_DEFAULT_MODEL.balanced, label: t("claudeAssist.common.tierBalanced") },
    { id: CLAUDE_TIER_DEFAULT_MODEL.best, label: t("claudeAssist.common.tierBest") },
    { id: CLAUDE_TIER_DEFAULT_MODEL.max, label: t("claudeAssist.common.tierMax") },
  ], [t]);
}
