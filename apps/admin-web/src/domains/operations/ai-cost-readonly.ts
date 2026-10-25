/**
 * ai-cost-readonly.ts — AI 원가 추적의 어드민 읽기 전용 표시 장치
 * (6단계 지속 운영, 2026-10-25).
 *
 * 이 모듈은 표시만 한다. 변경·삭제·결제·청구 API를 일절 노출하지
 * 않으며, API 원장(`studio-ai-cost-ledger.ts`)의 application source를
 * import하지 않는다 — 어드민은 API 소스를 직접 import하지 않는
 * 경계를 지키기 위해, 원장 합계와 동일한 구조(structural) 타입만
 * 받아 표시 형태로 바꾼다. 실제 조회 배선(어드민 API 클라이언트)은
 * 조립 단계에서 이 표시 타입에 맞춘다.
 *
 * 모든 행은 추정치로만 표시한다. 금액 옆에 추정치 고지를 항상
 * 함께 두는 것이 이 모듈의 계약이다.
 */

/** 원가 조회 결과에 항상 붙는 추정치 고지 (API 원장과 동일 문구). */
export const AI_COST_READONLY_DISCLAIMER =
  "표시 금액은 추정치이며 실제 청구·결제 금액이 아닙니다." as const;

/** API 원장 합계 행과 구조가 같은 어드민 표시 입력. */
export interface AiCostAdminSummaryRow {
  readonly provider: string;
  readonly model: string;
  readonly dayKey: string;
  readonly calls: number;
  readonly totalTokens: number;
  readonly callsWithTokens: number;
  readonly estimatedCostAmount: number;
  readonly estimatedCostCurrency: string;
  readonly isEstimate: true;
}

export interface AiCostAdminDisplayRow {
  readonly provider: string;
  readonly model: string;
  readonly dayKey: string;
  readonly callsLabel: string;
  readonly tokensLabel: string;
  readonly estimatedCostLabel: string;
  readonly estimateNote: typeof AI_COST_READONLY_DISCLAIMER;
}

function formatAmount(amount: number, currency: string): string {
  if (!Number.isFinite(amount) || amount < 0) return `0 ${currency}`;
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${currency}`;
}

/**
 * 합계 행을 어드민 표시 행으로 바꾼다. 입력이 추정치가 아니면
 * (isEstimate가 true가 아니면) 표시하지 않고 거부한다 — 실제
 * 청구 금액이 추정치 행에 섞이는 것을 구조적으로 막는다.
 */
export function formatAiCostAdminRows(
  rows: readonly AiCostAdminSummaryRow[],
): AiCostAdminDisplayRow[] {
  return rows
    .filter((row) => row.isEstimate === true)
    .map((row) => ({
      provider: row.provider,
      model: row.model,
      dayKey: row.dayKey,
      callsLabel: `${row.calls}건`,
      tokensLabel:
        row.callsWithTokens === row.calls
          ? `${row.totalTokens.toLocaleString("en-US")} 토큰`
          : `${row.totalTokens.toLocaleString("en-US")} 토큰 (${row.callsWithTokens}/${row.calls}건 보고)`,
      estimatedCostLabel: formatAmount(
        row.estimatedCostAmount,
        row.estimatedCostCurrency,
      ),
      estimateNote: AI_COST_READONLY_DISCLAIMER,
    }));
}
