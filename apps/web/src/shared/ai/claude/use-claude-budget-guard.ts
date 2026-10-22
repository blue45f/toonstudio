import { useCallback, useMemo, useState } from "react";

import { evaluateClaudeBudget, useClaudeBudget, type ClaudeBudgetVerdict } from "./claude-budget";
import { useClaudeUsage } from "./claude-usage-meter";

export interface ClaudeBudgetGuard {
  readonly limitUsd: number | null;
  readonly spentUsd: number;
  readonly verdict: ClaudeBudgetVerdict;
  /** 예산을 넘을 수 있는데도 "이번 한 번만" 진행하겠다고 사용자가 직접 고른 상태. */
  readonly overridden: boolean;
  setOverridden(next: boolean): void;
  /** 요청을 보내도 되는가. 넘을 수 있는 요청은 사용자가 확인하기 전까지 보내지 않는다. */
  readonly allowed: boolean;
  /** 요청을 보낸 뒤 호출해 "이번 한 번만" 동의를 거둔다(다음 요청에서 다시 묻는다). */
  consumeOverride(): void;
}

/**
 * 이번 요청의 비용 상한(`capUsd`, 단가를 모르면 null)을 세션 예산과 견줘 보낼 수 있는지 판정한다.
 * 한도가 없으면 언제나 보낼 수 있고, 넘을 수 있거나 비용을 가늠할 수 없을 때만 사용자의 확인을 요구한다.
 */
export function useClaudeBudgetGuard(capUsd: number | null): ClaudeBudgetGuard {
  const { limitUsd } = useClaudeBudget();
  const usage = useClaudeUsage();
  const [overridden, setOverridden] = useState(false);
  const verdict = useMemo(
    () => evaluateClaudeBudget(limitUsd, usage.estimatedUsd, capUsd),
    [capUsd, limitUsd, usage.estimatedUsd],
  );
  const consumeOverride = useCallback(() => setOverridden(false), []);
  return {
    limitUsd,
    spentUsd: usage.estimatedUsd,
    verdict,
    overridden,
    setOverridden,
    allowed: verdict.kind === "no-limit" || verdict.kind === "within" || overridden,
    consumeOverride,
  };
}
