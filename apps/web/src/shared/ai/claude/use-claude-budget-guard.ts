import { useCallback, useMemo, useState } from "react";

import { evaluateClaudeBudget, useClaudeBudget, type ClaudeBudgetVerdict } from "./claude-budget";
import { claudeBudgetSpentUsd, useClaudeUsage } from "./claude-usage-meter";

export interface ClaudeBudgetGuard {
  readonly limitUsd: number | null;
  /** 아직 보낼 입력(이미지·글)이 없어 이번 요청의 비용 상한을 계산할 수 없는 상태. 이때는 단가를 모르는 것과 구분해 안내한다. */
  readonly pending: boolean;
  /** 이미 쓴 것으로 보는 비용: 받은 사용량 + 진행 중인 요청의 예약 + 응답을 받지 못한 요청의 최대 비용. */
  readonly spentUsd: number;
  /** 응답(사용량)을 받지 못하고 끝난 요청 수와 그 최대 비용. 청구됐을 수도, 아닐 수도 있다. */
  readonly unconfirmedRequests: number;
  readonly unconfirmedUsd: number;
  readonly verdict: ClaudeBudgetVerdict;
  /** 예산을 넘을 수 있는데도 "이번 한 번만" 진행하겠다고 사용자가 직접 고른 상태. */
  readonly overridden: boolean;
  setOverridden(next: boolean): void;
  /** 요청을 보내도 되는가. 넘을 수 있는 요청은 사용자가 확인하기 전까지 보내지 않는다. */
  readonly allowed: boolean;
  /** 요청을 보낸 뒤 호출해 "이번 한 번만" 동의를 거둔다(다음 요청에서 다시 묻는다). */
  consumeOverride(): void;
}

/** 동의한 비용 상한(`approved`)이 지금 상한(`current`)을 덮는가. 단가를 모르는 요청(null)은 같은 종류의 동의만 덮는다. */
function approvalCovers(approved: number | null, current: number | null): boolean {
  if (approved === null) return current === null;
  return current !== null && current <= approved + 1e-9;
}

/**
 * 이번 요청의 비용 상한(`capUsd`, 단가를 모르면 null, 보낼 입력이 아직 없으면 undefined)을 세션 예산과 견줘 보낼 수 있는지 판정한다.
 * 한도가 없으면 언제나 보낼 수 있고, 넘을 수 있거나 비용을 가늠할 수 없을 때만 사용자의 확인을 요구한다.
 * 입력이 아직 없을 때(undefined)는 상한을 0으로 보고 이미 한도를 넘었는지만 가린다 — "단가를 모른다"는 경고를 미리 띄우지 않는다.
 * "이번 한 번만" 동의는 동의한 시점의 상한 이하에서만 유효하다. 모델이나 옵션을 바꿔 상한이 커지면 다시 묻는다.
 */
export function useClaudeBudgetGuard(capUsd: number | null | undefined): ClaudeBudgetGuard {
  const { limitUsd } = useClaudeBudget();
  const usage = useClaudeUsage();
  const spentUsd = claudeBudgetSpentUsd(usage);
  const pending = capUsd === undefined;
  const [approval, setApproval] = useState<{ readonly capUsd: number | null } | null>(null);
  const verdict = useMemo(
    () => evaluateClaudeBudget(limitUsd, spentUsd, capUsd === undefined ? 0 : capUsd),
    [capUsd, limitUsd, spentUsd],
  );
  const overridden = capUsd !== undefined && approval !== null && approvalCovers(approval.capUsd, capUsd);
  const setOverridden = useCallback((next: boolean) => setApproval(next && capUsd !== undefined ? { capUsd } : null), [capUsd]);
  const consumeOverride = useCallback(() => setApproval(null), []);
  return {
    limitUsd,
    pending,
    spentUsd,
    unconfirmedRequests: usage.unconfirmedRequests,
    unconfirmedUsd: usage.unconfirmedUsd,
    verdict,
    overridden,
    setOverridden,
    allowed: verdict.kind === "no-limit" || verdict.kind === "within" || overridden,
    consumeOverride,
  };
}
