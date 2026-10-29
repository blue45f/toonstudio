import "./ai-assist-i18n";

import { useMemo } from "react";

import { useT } from "@/shared/lib/i18n";

import { ASSIST_TIER_DEFAULT_MODEL } from "./assist-models";

export interface AssistModelOption {
  readonly id: string;
  readonly label: string;
}

/** 등급별 기본 모델 4개. 이름은 화면 언어를 따르고 모델 ID는 `assist-models`의 값 그대로다. */
export function useAssistTierOptions(): readonly AssistModelOption[] {
  const t = useT();
  return useMemo(() => [
    { id: ASSIST_TIER_DEFAULT_MODEL.fast, label: t("aiAssist.common.tierFast") },
    { id: ASSIST_TIER_DEFAULT_MODEL.balanced, label: t("aiAssist.common.tierBalanced") },
    { id: ASSIST_TIER_DEFAULT_MODEL.best, label: t("aiAssist.common.tierBest") },
    { id: ASSIST_TIER_DEFAULT_MODEL.max, label: t("aiAssist.common.tierMax") },
  ], [t]);
}
