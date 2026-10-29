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
    COUNT(*) FILTER (WHERE ledger."userId" = $1)::integer AS "userRequests",
    COUNT(*)::integer AS "globalRequests",
    COALESCE(SUM(COALESCE(
      ledger."totalTokens",
      COALESCE(ledger."promptTokens", 0) + COALESCE(ledger."completionTokens", 0)
    )), 0)::bigint AS "globalTokens"
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
