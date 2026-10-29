import { dbPool } from "../../platform/database";

import { STUDIO_AI_PREMIUM_PROVIDER_ID } from "./studio-ai-provider";

import type {
  StudioAiPremiumBudgetStore,
  StudioAiPremiumBudgetUsage,
} from "./studio-ai-premium-budget";

interface PremiumBudgetRow extends Record<string, unknown> {
  ledgerReady: boolean | null;
  userRequests: number | string | null;
  globalRequests: number | string | null;
  globalTokens: number | string | null;
}

export interface StudioAiPremiumBudgetPool {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
}

/**
 * 사용량을 모르는 프리미엄 호출(시간 초과·연결 끊김·취소처럼 응답을 못 받았지만 처리됐을 수 있는 경우)을 토큰 예산에서
 * 셀 때 쓰는 보수적인 추정치. 0으로 세면 예산이 실제보다 남은 것으로 보여 운영 비용 상한이 열린다(fail-open).
 * 출력 상한(16,000)에 사고 여유와 입력을 더한 값이다.
 */
export const STUDIO_AI_PREMIUM_UNKNOWN_USAGE_TOKENS = 24_000;

/**
 * 원장 제약이 프리미엄 제공자를 허용하는지와 오늘(UTC, DB 시계) 프리미엄 사용량을 한 번에 읽는다.
 * 짧은 읽기 질의이고 외부 AI 호출 중에는 트랜잭션을 열어 두지 않는다. 같은 사용자의 동시 요청은
 * admission lease가 하나로 묶으므로, 서비스 전체 상한은 동시에 진행 중인 요청 수만큼만 넘칠 수 있다.
 */
const PREMIUM_BUDGET_SQL = `
WITH day_start AS (
  SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)::timestamp AT TIME ZONE 'UTC' AS "startedAt"
), readiness AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = to_regclass('public.studio_ai_usage_ledger')
      AND constraint_record.conname = 'studio_ai_usage_provider_check'
      AND constraint_record.contype = 'c'
      AND constraint_record.convalidated
      AND position($2 IN pg_catalog.pg_get_constraintdef(constraint_record.oid, true)) > 0
  ) AS "ledgerReady"
), usage AS (
  SELECT
    -- 추론 전에 거절돼 비용이 나가지 않은 호출(provider_rate_limited)은 요청 예산에서도 세지 않는다.
    COUNT(*) FILTER (WHERE ledger."userId" = $1 AND ledger.status <> 'provider_rate_limited')::integer AS "userRequests",
    COUNT(*) FILTER (WHERE ledger.status <> 'provider_rate_limited')::integer AS "globalRequests",
    COALESCE(SUM(CASE
      WHEN ledger."totalTokens" IS NOT NULL THEN ledger."totalTokens"
      WHEN ledger."promptTokens" IS NOT NULL OR ledger."completionTokens" IS NOT NULL
        THEN COALESCE(ledger."promptTokens", 0) + COALESCE(ledger."completionTokens", 0)
      -- 추론 전에 거절된 호출(provider_rate_limited)만 0이다. 나머지는 처리됐을 수 있어 추정치로 센다.
      WHEN ledger.status = 'provider_rate_limited' THEN 0
      ELSE $4::integer
    END), 0)::bigint AS "globalTokens"
  FROM studio_ai_usage_ledger AS ledger, day_start
  WHERE ledger.provider = $3
    AND ledger."startedAt" >= day_start."startedAt"
)
SELECT readiness."ledgerReady", usage."userRequests", usage."globalRequests", usage."globalTokens"
FROM readiness, usage
`;

function count(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export class PostgresStudioAiPremiumBudgetStore implements StudioAiPremiumBudgetStore {
  constructor(
    private readonly pool: StudioAiPremiumBudgetPool = dbPool as unknown as StudioAiPremiumBudgetPool,
  ) {}

  async todayUsage(userId: string): Promise<StudioAiPremiumBudgetUsage> {
    const result = await this.pool.query<PremiumBudgetRow>(PREMIUM_BUDGET_SQL, [
      userId,
      `'${STUDIO_AI_PREMIUM_PROVIDER_ID}'`,
      STUDIO_AI_PREMIUM_PROVIDER_ID,
      STUDIO_AI_PREMIUM_UNKNOWN_USAGE_TOKENS,
    ]);
    const row = result.rows[0];
    return {
      ledgerReady: row?.ledgerReady === true,
      userRequests: count(row?.userRequests),
      globalRequests: count(row?.globalRequests),
      globalTokens: count(row?.globalTokens),
    };
  }
}
