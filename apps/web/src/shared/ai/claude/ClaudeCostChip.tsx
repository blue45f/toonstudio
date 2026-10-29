import "./claude-assist-i18n";

import { useT } from "@/shared/lib/i18n";

import { formatClaudeUsd } from "./claude-usage-meter";
import { useManagedAssist } from "./use-claude-route";

/**
 * 대화상자 아래쪽 실행 줄의 비용 표시. 내 키 경로는 이번 요청의 최대 비용을, 관리형 경로(ToonStudio AI)는
 * 사용자 비용이 없으므로 "무료"를 보여 준다. 비용 상한을 아직 계산할 수 없거나 단가를 모르면 그리지 않는다.
 */
export function ClaudeCostChip({ capUsd }: { readonly capUsd: number | null | undefined }) {
  const t = useT();
  const managed = useManagedAssist();
  if (managed) {
    return (
      <span className="text-xs font-semibold text-good" data-claude-footer-cap="managed">
        {t("claudeAssist.managed.capChip")}
      </span>
    );
  }
  if (typeof capUsd !== "number") return null;
  return (
    <span className="text-xs font-semibold text-fg-2" data-claude-footer-cap="true">
      {t("claudeAssist.preflight.capChip", { cost: formatClaudeUsd(capUsd) })}
    </span>
  );
}
