import "./ai-assist-i18n";

import { useT } from "@/shared/lib/i18n";

import { ASSIST_INPUT } from "./assist-ui";
import { useAssistTierOptions } from "./use-assist-tier-options";

export interface AssistModelSelectProps {
  readonly id: string;
  /** 빈 문자열이면 연결의 기본 모델을 쓴다. */
  readonly value: string;
  readonly onChange: (modelId: string) => void;
  /** 연결의 기본 모델 ID(첫 항목에 보여 준다). */
  readonly defaultModel: string;
  readonly disabled?: boolean;
}

/** 한 번의 요청에 쓸 모델 선택. 앱은 이 선택을 비용 때문에 몰래 바꾸지 않는다. */
export function AssistModelSelect({ id, value, onChange, defaultModel, disabled }: AssistModelSelectProps) {
  const t = useT();
  const tiers = useAssistTierOptions();
  return (
    <select
      id={id}
      className={ASSIST_INPUT}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{t("aiAssist.common.modelDefault", { model: defaultModel })}</option>
      {tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.label}</option>)}
    </select>
  );
}
