import "./claude-assist-i18n";

import { useT } from "@/shared/lib/i18n";

import { CLAUDE_INPUT } from "./claude-ui";
import { useClaudeTierOptions } from "./use-claude-tier-options";

export interface ClaudeModelSelectProps {
  readonly id: string;
  /** 빈 문자열이면 연결의 기본 모델을 쓴다. */
  readonly value: string;
  readonly onChange: (modelId: string) => void;
  /** 연결의 기본 모델 ID(첫 항목에 보여 준다). */
  readonly defaultModel: string;
  readonly disabled?: boolean;
}

/** 한 번의 요청에 쓸 모델 선택. 앱은 이 선택을 비용 때문에 몰래 바꾸지 않는다. */
export function ClaudeModelSelect({ id, value, onChange, defaultModel, disabled }: ClaudeModelSelectProps) {
  const t = useT();
  const tiers = useClaudeTierOptions();
  return (
    <select
      id={id}
      className={CLAUDE_INPUT}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{t("claudeAssist.common.modelDefault", { model: defaultModel })}</option>
      {tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.label}</option>)}
    </select>
  );
}
