import { describe, expect, it, vi } from "vitest";

import { shouldChargeStudioAiCredits } from "./studio-ai-credit-charge";
import {
  InMemoryStudioAiPremiumBudgetStore,
  studioAiPremiumBudgetAllows,
} from "./studio-ai-premium-budget";
import {
  PostgresStudioAiPremiumBudgetStore,
  STUDIO_AI_PREMIUM_UNKNOWN_USAGE_FALLBACK_TOKENS,
} from "./studio-ai-premium-budget.repository";
import { DEFAULT_STUDIO_AI_PREMIUM_LIMITS, resolveStudioAiPremiumConfig } from "./studio-ai-premium-config";
import {
  classifyStudioAiProviderFailure,
  resolveStudioAiProviderCandidates,
  resolveStudioAiProviders,
  resolveStudioAiTimeoutMs,
  STUDIO_AI_MAX_PROVIDER_ATTEMPTS,
  STUDIO_AI_PREMIUM_FAILOVER_REASON,
  studioAiPremiumErrorType,
  studioAiProviderStatuses,
} from "./studio-ai-provider";

const FREE_POOL_ENV = {
  NODE_ENV: "production",
  STUDIO_AI_FREE_POOL_ENABLED: "true",
  STUDIO_AI_FREE_GEMINI_API_KEY: "gemini-free-key",
  STUDIO_AI_FREE_GEMINI_CONFIRMED: "true",
  STUDIO_AI_FREE_QWEN_WORKSPACE_ID: "workspace_123456",
  STUDIO_AI_FREE_QWEN_API_KEY: "qwen-free-key",
  STUDIO_AI_FREE_QWEN_CONFIRMED: "true",
  STUDIO_AI_FREE_GROQ_API_KEY: "groq-free-key",
  STUDIO_AI_FREE_GROQ_CONFIRMED: "true",
  STUDIO_AI_FREE_SAMBANOVA_API_KEY: "sambanova-free-key",
  STUDIO_AI_FREE_SAMBANOVA_CONFIRMED: "true",
  STUDIO_AI_FREE_ZAI_API_KEY: "zai-free-key",
  STUDIO_AI_FREE_ZAI_CONFIRMED: "true",
  STUDIO_AI_FREE_MISTRAL_API_KEY: "mistral-free-key",
  STUDIO_AI_FREE_MISTRAL_CONFIRMED: "true",
  STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID: "00000000000000000000000000000000",
  STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN: "cloudflare-free-token",
  STUDIO_AI_FREE_CLOUDFLARE_CONFIRMED: "true",
  STUDIO_AI_FREE_OPENROUTER_API_KEY: "openrouter-free-key",
  STUDIO_AI_FREE_OPENROUTER_CONFIRMED: "true",
  STUDIO_AI_FREE_SILICONFLOW_API_KEY: "siliconflow-free-key",
  STUDIO_AI_FREE_SILICONFLOW_CONFIRMED: "true",
};

const PREMIUM_ENV = {
  ...FREE_POOL_ENV,
  STUDIO_AI_ANTHROPIC_API_KEY: "premium-server-key",
};

describe("운영 고성능 경로(키 없는 사용자의 1순위)", () => {
  it("키가 있으면 자동 경로 맨 앞에 두고, 시도 횟수 계약(최대 9곳) 안에서 성능 순 무료 풀을 잇는다", () => {
    const ids = resolveStudioAiProviders("auto", PREMIUM_ENV).map(({ id }) => id);
    expect(ids).toEqual([
      "anthropic", "gemini", "qwen", "groq", "sambanova", "zai", "mistral", "cloudflare", "openrouter",
    ]);
    expect(ids).toHaveLength(STUDIO_AI_MAX_PROVIDER_ATTEMPTS);
    const [premium] = resolveStudioAiProviders("auto", PREMIUM_ENV);
    expect(premium).toMatchObject({ model: "claude-opus-5-5", freePool: false, sponsored: true });
  });

  it("예산·원장 확인을 통과하지 못하면 고성능 경로를 빼고 무료 풀 아홉 곳을 그대로 쓴다", () => {
    expect(resolveStudioAiProviderCandidates("auto", PREMIUM_ENV, [], { premiumAllowed: false })
      .map(({ id }) => id)).toEqual([
      "gemini", "qwen", "groq", "sambanova", "zai", "mistral", "cloudflare", "openrouter", "siliconflow",
    ]);
  });

  it("운영자가 자동 1순위를 끄면 키가 있어도 자동 경로에 넣지 않는다", () => {
    const env = { ...PREMIUM_ENV, STUDIO_AI_PREMIUM_AUTO: "false" };
    expect(resolveStudioAiPremiumConfig(env)).toMatchObject({ configured: true, automatic: false });
    expect(resolveStudioAiProviders("auto", env).map(({ id }) => id)[0]).toBe("gemini");
  });

  it("고성능 경로를 명시 선택했는데 예산이 바닥나면 거절 대신 무료 풀로 이어 간다", () => {
    expect(resolveStudioAiProviderCandidates("anthropic", PREMIUM_ENV, [], { premiumAllowed: false })
      .map(({ id }) => id)[0]).toBe("gemini");
    expect(resolveStudioAiProviderCandidates("anthropic", FREE_POOL_ENV)).toEqual([]);
  });

  it("무료 풀이 꺼져 있어도 고성능 키만으로 자동 경로를 연다", () => {
    const env = { NODE_ENV: "production", STUDIO_AI_ANTHROPIC_API_KEY: "premium-server-key" };
    expect(resolveStudioAiProviders("auto", env).map(({ id }) => id)).toEqual(["anthropic"]);
  });

  it("모델·허용 목록·일일 예산을 환경변수로 조정하고 잘못된 값은 기본값으로 둔다", () => {
    expect(resolveStudioAiPremiumConfig({})).toMatchObject({
      configured: false,
      automatic: false,
      model: "claude-opus-5-5",
      limits: DEFAULT_STUDIO_AI_PREMIUM_LIMITS,
    });
    const tuned = resolveStudioAiPremiumConfig({
      STUDIO_AI_ANTHROPIC_API_KEY: "k",
      STUDIO_AI_ANTHROPIC_MODEL: "claude-sonnet-5-5",
      STUDIO_AI_PREMIUM_ALLOWED_MODELS: "claude-haiku-5-5, not a model, claude-opus-5-5",
      STUDIO_AI_PREMIUM_USER_DAILY_REQUEST_LIMIT: "5",
      STUDIO_AI_PREMIUM_GLOBAL_DAILY_REQUEST_LIMIT: "-3",
      STUDIO_AI_PREMIUM_GLOBAL_DAILY_TOKEN_LIMIT: "12.5",
    });
    expect(tuned.model).toBe("claude-sonnet-5-5");
    expect(tuned.allowedModels).toEqual(["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"]);
    expect(tuned.limits).toEqual({
      userDailyRequests: 5,
      globalDailyRequests: DEFAULT_STUDIO_AI_PREMIUM_LIMITS.globalDailyRequests,
      globalDailyTokens: DEFAULT_STUDIO_AI_PREMIUM_LIMITS.globalDailyTokens,
    });
    expect(resolveStudioAiPremiumConfig({ STUDIO_AI_ANTHROPIC_MODEL: "gpt-5" }).model).toBe("claude-opus-5-5");
  });

  it("워크스페이스에 묶이지 않은 운영 키는 형식이 맞는 워크스페이스 ID를 요청 헤더로 함께 보낸다", () => {
    expect(resolveStudioAiPremiumConfig({ STUDIO_AI_ANTHROPIC_API_KEY: "k" }).workspaceId).toBeNull();
    expect(resolveStudioAiPremiumConfig({
      STUDIO_AI_ANTHROPIC_API_KEY: "k",
      STUDIO_AI_ANTHROPIC_WORKSPACE_ID: " wrkspc_01ABCdef234 ",
    }).workspaceId).toBe("wrkspc_01ABCdef234");
    // 헤더에 실을 수 없는 값은 버린다(잘못 넣은 키·공백·다른 형식).
    for (const value of ["default", "wrkspc_", "sk-ant-api03-x", "wrkspc_01 bad", "wrkspc_01\nX-Evil: 1"]) {
      expect(resolveStudioAiPremiumConfig({ STUDIO_AI_ANTHROPIC_API_KEY: "k", STUDIO_AI_ANTHROPIC_WORKSPACE_ID: value }).workspaceId).toBeNull();
    }
    const [premium] = resolveStudioAiProviders("auto", {
      NODE_ENV: "production",
      STUDIO_AI_ANTHROPIC_API_KEY: "premium-server-key",
      STUDIO_AI_ANTHROPIC_WORKSPACE_ID: "wrkspc_01ABCdef234",
    });
    expect(premium).toMatchObject({ id: "anthropic", workspaceId: "wrkspc_01ABCdef234" });
    expect(resolveStudioAiProviders("auto", { NODE_ENV: "production", STUDIO_AI_ANTHROPIC_API_KEY: "premium-server-key" })[0])
      .not.toHaveProperty("workspaceId");
  });

  it("추론 전 거절(한도·혼잡·결제·인증·모델 없음·설정·형식)은 무료 풀로 넘기고 5xx는 넘기지 않는다", () => {
    for (const status of [429, 529, 402, 400, 401, 403, 404, 413]) {
      expect(classifyStudioAiProviderFailure("anthropic", status)).toMatchObject({
        kind: STUDIO_AI_PREMIUM_FAILOVER_REASON,
        billingFailoverEligible: true,
        failoverReason: STUDIO_AI_PREMIUM_FAILOVER_REASON,
      });
    }
    expect(classifyStudioAiProviderFailure("anthropic", 400, {
      type: "error",
      error: { type: "billing_error", message: "redacted" },
    })).toMatchObject({ kind: STUDIO_AI_PREMIUM_FAILOVER_REASON, billingFailoverEligible: true });
    // 워크스페이스에 묶이지 않은 운영 키(워크스페이스 지정 누락)나 지원하지 않는 스키마도 추론 전 거절이라 비용 없이 이어 간다.
    expect(classifyStudioAiProviderFailure("anthropic", 400, {
      type: "error",
      error: { type: "invalid_request_error", message: "redacted" },
    })).toMatchObject({ kind: STUDIO_AI_PREMIUM_FAILOVER_REASON, billingFailoverEligible: true });
    expect(classifyStudioAiProviderFailure("anthropic", 500)).toMatchObject({
      kind: "provider_unavailable",
      billingFailoverEligible: false,
    });
    expect(studioAiPremiumErrorType({ error: { type: "overloaded_error" } })).toBe("overloaded_error");
    expect(studioAiPremiumErrorType({ error: { type: "<script>" } })).toBeUndefined();
  });

  it.each([
    [429, { error: { type: "rate_limit_error", details: { error_code: "enforced_spend_limit_reached" } } }],
    [400, { error: { type: "invalid_request_error", message: "You have reached your specified API usage limits. Try again next month." } }],
    [400, { error: { type: "invalid_request_error", message: "You have reached your specified workspace API usage limits. Try again next month." } }],
    [400, { error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please add funds." } }],
  ])("운영 지출한도·크레딧 부족 HTTP %s를 일반 속도 제한과 구분한다", (status, payload) => {
    expect(classifyStudioAiProviderFailure("anthropic", status, payload)).toEqual({
      kind: "premium_budget_exhausted",
      billingFailoverEligible: true,
      failoverReason: STUDIO_AI_PREMIUM_FAILOVER_REASON,
    });
  });

  it("일반 429·다른 400과 다른 제공자의 오류를 운영 예산 소진으로 오인하지 않는다", () => {
    expect(classifyStudioAiProviderFailure("anthropic", 429, {
      error: { type: "rate_limit_error", message: "Too many requests", details: { error_code: "other" } },
    }).kind).toBe(STUDIO_AI_PREMIUM_FAILOVER_REASON);
    expect(classifyStudioAiProviderFailure("anthropic", 400, {
      error: { type: "invalid_request_error", message: "Schema is unsupported" },
    }).kind).toBe(STUDIO_AI_PREMIUM_FAILOVER_REASON);
    expect(classifyStudioAiProviderFailure("gemini", 429, {
      error: { type: "rate_limit_error", details: { error_code: "enforced_spend_limit_reached" } },
    }).kind).not.toBe("premium_budget_exhausted");
  });

  it("고성능 모델은 긴 사고 시간을 위해 전용 제한 시간을 쓴다", () => {
    expect(resolveStudioAiTimeoutMs("anthropic", {})).toBe(120_000);
    expect(resolveStudioAiTimeoutMs("anthropic", { STUDIO_AI_TIMEOUT_MS: "45000" })).toBe(45_000);
    expect(resolveStudioAiTimeoutMs("anthropic", {
      STUDIO_AI_TIMEOUT_MS: "45000",
      STUDIO_AI_ANTHROPIC_TIMEOUT_MS: "90000",
    })).toBe(90_000);
    expect(resolveStudioAiTimeoutMs("anthropic", { STUDIO_AI_ANTHROPIC_TIMEOUT_MS: "999999" })).toBe(120_000);
  });

  it("상태에는 고성능 경로의 구성 여부·모델·데이터 약관만 싣고 키는 싣지 않는다", () => {
    const statuses = studioAiProviderStatuses(PREMIUM_ENV);
    expect(statuses[0]).toMatchObject({
      id: "anthropic",
      configured: true,
      model: "claude-opus-5-5",
      dataUsage: "no-training",
    });
    expect(JSON.stringify(statuses)).not.toContain("premium-server-key");
    expect(studioAiProviderStatuses(FREE_POOL_ENV).some(({ id }) => id === "anthropic")).toBe(false);
  });

  it("운영자가 비용을 내는 경로는 사용자 크레딧을 예약하지 않는다", () => {
    const providers = resolveStudioAiProviders("auto", PREMIUM_ENV);
    expect(shouldChargeStudioAiCredits(providers)).toBe(false);
    expect(shouldChargeStudioAiCredits([{ freePool: false }])).toBe(true);
  });
});

describe("운영 고성능 경로 일일 예산", () => {
  const limits = { userDailyRequests: 2, globalDailyRequests: 3, globalDailyTokens: 1_000 };

  it("사용자·서비스 전체 요청 수와 토큰 수가 모두 한도 안이고 원장이 준비됐을 때만 허용한다", async () => {
    const store = new InMemoryStudioAiPremiumBudgetStore();
    expect(studioAiPremiumBudgetAllows(await store.todayUsage("u1"), limits)).toBe(true);
    store.record("u1", 100);
    store.record("u1", 100);
    expect(studioAiPremiumBudgetAllows(await store.todayUsage("u1"), limits)).toBe(false);
    expect(studioAiPremiumBudgetAllows(await store.todayUsage("u2"), limits)).toBe(true);
    store.record("u2", 900);
    expect(studioAiPremiumBudgetAllows(await store.todayUsage("u3"), limits)).toBe(false);
    const notReady = new InMemoryStudioAiPremiumBudgetStore(false);
    expect(studioAiPremiumBudgetAllows(await notReady.todayUsage("u1"), limits)).toBe(false);
  });

  it("Postgres 구현은 원장 제약 준비 여부와 오늘 사용량을 한 질의로 읽는다", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ ledgerReady: true, userRequests: "2", globalRequests: 7, globalTokens: "12345" }],
    });
    const store = new PostgresStudioAiPremiumBudgetStore({ query });
    await expect(store.todayUsage("user-1")).resolves.toEqual({
      ledgerReady: true,
      userRequests: 2,
      globalRequests: 7,
      globalTokens: 12_345,
    });
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("studio_ai_usage_provider_check");
    expect(sql).toContain("ledger.provider = $3");
    expect(values).toEqual(["user-1", "'anthropic'", "anthropic", STUDIO_AI_PREMIUM_UNKNOWN_USAGE_FALLBACK_TOKENS]);
    // 사용량을 모르는 호출은 0이 아니라 그 호출의 예약량으로 센다(추론 전 거절만 0). 예약량이 없는 옛 행은
    // 가장 큰 예약량으로 센다. 예약량 열은 열이 없는 DB에서도 질의가 실패하지 않게 행 JSON으로 읽는다.
    expect(sql).toContain("WHEN ledger.status = 'provider_rate_limited' THEN 0");
    expect(sql).toContain(`ELSE COALESCE((to_jsonb(ledger) ->> 'reservedTokens')::bigint, $4::bigint)`);
    expect(STUDIO_AI_PREMIUM_UNKNOWN_USAGE_FALLBACK_TOKENS).toBe(250_000);
    // 예약량 열(0115)이 있어야 준비된 것으로 본다.
    expect(sql).toContain("column_record.attname = 'reservedTokens'");
    expect(sql).toContain("NOT column_record.attisdropped");
  });

  it("행이 없거나 값이 이상하면 원장이 준비되지 않은 것으로 본다", async () => {
    const store = new PostgresStudioAiPremiumBudgetStore({ query: vi.fn().mockResolvedValue({ rows: [] }) });
    await expect(store.todayUsage("user-1")).resolves.toEqual({
      ledgerReady: false,
      userRequests: 0,
      globalRequests: 0,
      globalTokens: 0,
    });
  });
});
