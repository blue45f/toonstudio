import type { StudioAiProviderPreference } from "./studio-ai.dto";
import { STUDIO_AI_PREMIUM_MESSAGES_URL } from "./studio-ai-messages-translate";
import { resolveStudioAiPremiumConfig } from "./studio-ai-premium-config";

export const STUDIO_AI_FREE_PROVIDER_IDS = [
  "gemini",
  "qwen",
  "groq",
  "sambanova",
  "zai",
  "mistral",
  "cloudflare",
  "openrouter",
  "siliconflow",
] as const;
export const STUDIO_AI_MAX_PROVIDER_ATTEMPTS = STUDIO_AI_FREE_PROVIDER_IDS.length;
const STUDIO_AI_LEGACY_TEST_PROVIDER_IDS = ["deepseek"] as const;
/**
 * 운영 프리미엄 제공자(운영자 키). 사용자가 개인 키를 등록하지 않았을 때 자동 경로의 1순위이고,
 * 한도·결제·혼잡·인증으로 추론 전에 거절되면 성능 순 무료 풀로 이어 간다. 사용자 크레딧은 차감하지
 * 않으며 운영 일일 예산(요청·토큰)은 서비스가 사용량 원장으로 지킨다.
 */
export const STUDIO_AI_PREMIUM_PROVIDER_ID = "anthropic" as const;
const STUDIO_AI_PREMIUM_PROVIDER_IDS = [STUDIO_AI_PREMIUM_PROVIDER_ID] as const;
export const STUDIO_AI_PROVIDER_IDS = [
  ...STUDIO_AI_FREE_PROVIDER_IDS,
  ...STUDIO_AI_LEGACY_TEST_PROVIDER_IDS,
  ...STUDIO_AI_PREMIUM_PROVIDER_IDS,
] as const;

export type StudioAiProviderId = (typeof STUDIO_AI_PROVIDER_IDS)[number];
export type StudioAiFreeProviderId = (typeof STUDIO_AI_FREE_PROVIDER_IDS)[number];

/**
 * 무료 티어에서 사용자가 보낸 데이터가 제공자 쪽에서 어떻게 쓰이는지에 대한 고지.
 * 제공자별 데이터 약관 차이를 풀 메타데이터에 배지로 남기기 위한 분류이며,
 * 확인 근거는 2026-10-06 공식 문서 검토(free-ai-onnx-review) 기준이다.
 * - "training": 무료 티어 콘텐츠가 제품 개선·학습에 사용될 수 있음이 공식 문서에 명시됨
 * - "no-training": 무료 플랜이 데이터를 학습에 쓰지 않는 것으로 확인됨
 * - "varies": 하위 제공자·설정에 따라 달라짐
 * - "unconfirmed": 공식 문서로 확인하지 못함 (안전하다고 단정하지 않는다)
 */
export type StudioAiDataUsage = "training" | "no-training" | "varies" | "unconfirmed";

export interface StudioAiProviderDataTerms {
  dataUsage: StudioAiDataUsage;
  dataTermsLabel: string;
}

export const STUDIO_AI_PROVIDER_DATA_TERMS: Record<
  StudioAiFreeProviderId,
  StudioAiProviderDataTerms
> = {
  gemini: {
    dataUsage: "training",
    dataTermsLabel: "무료 티어 콘텐츠는 Google 제품 개선에 사용될 수 있어요",
  },
  qwen: {
    dataUsage: "unconfirmed",
    dataTermsLabel: "중국 베이징 리전에서 처리돼요 · 학습 사용 여부는 공식 확인이 안 됐어요",
  },
  groq: {
    dataUsage: "no-training",
    dataTermsLabel: "무료 플랜은 데이터를 학습에 사용하지 않아요",
  },
  sambanova: {
    dataUsage: "unconfirmed",
    dataTermsLabel: "무료 티어 데이터 정책이 공식으로 확인되지 않았어요",
  },
  zai: {
    dataUsage: "unconfirmed",
    dataTermsLabel: "무료 모델 데이터 정책이 공식으로 확인되지 않았어요",
  },
  mistral: {
    dataUsage: "training",
    dataTermsLabel: "무료 모드는 데이터 학습 동의가 조건일 수 있어요",
  },
  cloudflare: {
    dataUsage: "unconfirmed",
    dataTermsLabel: "무료 할당 데이터 정책이 공식으로 확인되지 않았어요",
  },
  openrouter: {
    dataUsage: "varies",
    dataTermsLabel: "무료 모델 제공자마다 데이터 학습 여부가 달라요",
  },
  siliconflow: {
    dataUsage: "unconfirmed",
    dataTermsLabel: "무료 모델 데이터 정책이 공식으로 확인되지 않았어요",
  },
};

const STUDIO_AI_LEGACY_DATA_TERMS: StudioAiProviderDataTerms = {
  dataUsage: "unconfirmed",
  dataTermsLabel: "데이터 정책이 공식으로 확인되지 않았어요",
};

/** 운영 프리미엄 경로는 상용 API 약관상 입력·출력을 모델 학습에 쓰지 않는다. */
const STUDIO_AI_PREMIUM_DATA_TERMS: StudioAiProviderDataTerms = {
  dataUsage: "no-training",
  dataTermsLabel: "상용 API 약관상 입력·출력을 모델 학습에 쓰지 않아요",
};

export function studioAiProviderDataTerms(id: StudioAiProviderId): StudioAiProviderDataTerms {
  if (id === STUDIO_AI_PREMIUM_PROVIDER_ID) return STUDIO_AI_PREMIUM_DATA_TERMS;
  return (STUDIO_AI_PROVIDER_DATA_TERMS as Partial<Record<StudioAiProviderId, StudioAiProviderDataTerms>>)[id]
    ?? STUDIO_AI_LEGACY_DATA_TERMS;
}

export interface StudioAiProviderConfig {
  id: StudioAiProviderId;
  label: string;
  configured: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
  freePool: boolean;
  /** 운영 프리미엄 경로처럼 운영자가 비용을 내고 사용자 크레딧을 차감하지 않는 제공자. */
  sponsored?: boolean;
  /** 운영 프리미엄 키가 워크스페이스에 묶이지 않았을 때 요청마다 보낼 워크스페이스 ID. */
  workspaceId?: string;
}

export const STUDIO_AI_FREE_QUOTA_FAILOVER_REASON = "free_quota_exhausted" as const;
/** Kept for historical receipts produced by the retired paid-provider test path. */
export const STUDIO_AI_BILLING_FAILOVER_REASON = "billing_quota_exhausted" as const;
/** 운영 프리미엄 경로가 추론 전에 한도·결제·혼잡·인증·설정·요청 형식으로 거절돼 무료 풀로 이어 간 경우. */
export const STUDIO_AI_PREMIUM_FAILOVER_REASON = "premium_unavailable" as const;
export type StudioAiFailoverReason =
  | typeof STUDIO_AI_FREE_QUOTA_FAILOVER_REASON
  | typeof STUDIO_AI_BILLING_FAILOVER_REASON
  | typeof STUDIO_AI_PREMIUM_FAILOVER_REASON;

export type StudioAiProviderFailureKind =
  | StudioAiFailoverReason
  | "rate_limited"
  | "authentication"
  | "provider_unavailable"
  | "request_rejected";

export interface StudioAiProviderFailureClassification {
  kind: StudioAiProviderFailureKind;
  /** The provider rejected before inference, so the same prompt may safely use the next free route. */
  billingFailoverEligible: boolean;
  failoverReason?: StudioAiFailoverReason;
  businessCode?: string;
}

type EnvLike = Partial<Record<string, string | undefined>>;

const DEFAULT_FREE_PROVIDER_ORDER: readonly StudioAiFreeProviderId[] = [
  "gemini",
  "qwen",
  "groq",
  "sambanova",
  "zai",
  "mistral",
  "cloudflare",
  "openrouter",
  "siliconflow",
];
const DEFAULT_LEGACY_PROVIDER_ORDER: readonly StudioAiProviderId[] = [
  "zai",
  "deepseek",
  "openrouter",
];
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_PREMIUM_TIMEOUT_MS = 120_000;

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function studioAiFreePoolEnabled(env: EnvLike = process.env): boolean {
  return enabled(env.STUDIO_AI_FREE_POOL_ENABLED);
}

function legacyTestMode(env: EnvLike): boolean {
  return !studioAiFreePoolEnabled(env)
    && (env.NODE_ENV ?? process.env.NODE_ENV) === "test";
}

function boundedText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function isOpenRouterFreeModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized === "openrouter/free" || normalized.endsWith(":free");
}

const CLOUDFLARE_WORKERS_AI_FREE_MODELS = new Set([
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/zai-org/glm-4.7-flash",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/nvidia/nemotron-3-120b-a12b",
]);

export function isCloudflareWorkersAiFreeModel(model: string): boolean {
  return CLOUDFLARE_WORKERS_AI_FREE_MODELS.has(model.trim().toLowerCase());
}

const QWEN_BEIJING_FREE_QUOTA_MODELS = new Set([
  "qwen3.8-max",
  "qwen3.8-max-0902",
  "qwen3.8-flash",
  "qwen3.7-max",
  "qwen3.7-max-2026-06-08",
  "qwen3.7-max-2026-05-20",
  "qwen3.7-max-preview",
  "qwen3.7-plus",
  "qwen3.7-plus-2026-05-26",
  "qwen3.6-plus",
  "qwen3.6-plus-2026-04-02",
  "qwen3.7-flash",
  "qwen3.7-flash-2026-07-15",
  "qwen3.6-flash",
  "qwen3.6-flash-2026-04-16",
  "qwen-turbo",
]);

export function isQwenBeijingFreeQuotaModel(model: string): boolean {
  return QWEN_BEIJING_FREE_QUOTA_MODELS.has(model.trim().toLowerCase());
}

const ZAI_FREE_MODELS = new Set(["glm-4.7-flash", "glm-4.5-flash"]);

export function isZaiFreeModel(model: string): boolean {
  return ZAI_FREE_MODELS.has(model.trim().toLowerCase());
}

const SILICONFLOW_FREE_TEXT_MODELS = new Set(["thudm/glm-z1-9b-0414"]);

export function isSiliconFlowFreeTextModel(model: string): boolean {
  return SILICONFLOW_FREE_TEXT_MODELS.has(model.trim().toLowerCase());
}

function validQwenWorkspaceId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{5,127}$/iu.test(value);
}

function validCloudflareAccountId(value: string): boolean {
  return /^[0-9a-f]{32}$/u.test(value);
}

function freeProviderConfig(
  id: StudioAiFreeProviderId,
  env: EnvLike,
): StudioAiProviderConfig {
  const poolEnabled = studioAiFreePoolEnabled(env);
  if (id === "gemini") {
    const apiKey = env.STUDIO_AI_FREE_GEMINI_API_KEY?.trim() ?? "";
    return {
      id,
      label: "Gemini 무료",
      configured: poolEnabled && enabled(env.STUDIO_AI_FREE_GEMINI_CONFIRMED) && apiKey.length > 0,
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey,
      model: boundedText(env.STUDIO_AI_FREE_GEMINI_MODEL, "gemini-3.8-flash", 200),
      freePool: true,
    };
  }
  if (id === "qwen") {
    const workspaceId = env.STUDIO_AI_FREE_QWEN_WORKSPACE_ID?.trim() ?? "";
    const apiKey = env.STUDIO_AI_FREE_QWEN_API_KEY?.trim() ?? "";
    const model = boundedText(env.STUDIO_AI_FREE_QWEN_MODEL, "qwen3.7-plus", 200);
    return {
      id,
      label: "Qwen 베이징 무료 할당량",
      configured: poolEnabled
        && enabled(env.STUDIO_AI_FREE_QWEN_CONFIRMED)
        && validQwenWorkspaceId(workspaceId)
        && apiKey.length > 0
        && isQwenBeijingFreeQuotaModel(model),
      endpoint: validQwenWorkspaceId(workspaceId)
        ? `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions`
        : "",
      apiKey,
      model,
      freePool: true,
    };
  }
  if (id === "groq") {
    const apiKey = env.STUDIO_AI_FREE_GROQ_API_KEY?.trim() ?? "";
    return {
      id,
      label: "Groq 무료",
      configured: poolEnabled && enabled(env.STUDIO_AI_FREE_GROQ_CONFIRMED) && apiKey.length > 0,
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKey,
      model: boundedText(env.STUDIO_AI_FREE_GROQ_MODEL, "openai/gpt-oss-120b", 200),
      freePool: true,
    };
  }
  if (id === "sambanova") {
    const apiKey = env.STUDIO_AI_FREE_SAMBANOVA_API_KEY?.trim() ?? "";
    return {
      id,
      label: "SambaNova 무료",
      configured: poolEnabled
        && enabled(env.STUDIO_AI_FREE_SAMBANOVA_CONFIRMED)
        && apiKey.length > 0,
      endpoint: "https://api.sambanova.ai/v1/chat/completions",
      apiKey,
      model: boundedText(env.STUDIO_AI_FREE_SAMBANOVA_MODEL, "DeepSeek-V3.1", 200),
      freePool: true,
    };
  }
  if (id === "zai") {
    const apiKey = env.STUDIO_AI_FREE_ZAI_API_KEY?.trim()
      || env.ZAI_API_KEY?.trim()
      || "";
    const model = boundedText(env.STUDIO_AI_FREE_ZAI_MODEL, "glm-4.7-flash", 200);
    return {
      id,
      label: "Z.AI 무료 Flash",
      configured: poolEnabled
        && enabled(env.STUDIO_AI_FREE_ZAI_CONFIRMED)
        && apiKey.length > 0
        && isZaiFreeModel(model),
      endpoint: "https://api.z.ai/api/paas/v4/chat/completions",
      apiKey,
      model,
      freePool: true,
    };
  }
  if (id === "mistral") {
    const apiKey = env.STUDIO_AI_FREE_MISTRAL_API_KEY?.trim() ?? "";
    return {
      id,
      label: "Mistral 무료",
      configured: poolEnabled
        && enabled(env.STUDIO_AI_FREE_MISTRAL_CONFIRMED)
        && apiKey.length > 0,
      endpoint: "https://api.mistral.ai/v1/chat/completions",
      apiKey,
      model: boundedText(env.STUDIO_AI_FREE_MISTRAL_MODEL, "mistral-small-latest", 200),
      freePool: true,
    };
  }
  if (id === "cloudflare") {
    const accountId = env.STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID?.trim().toLowerCase() ?? "";
    const apiKey = env.STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN?.trim() ?? "";
    const model = boundedText(
      env.STUDIO_AI_FREE_CLOUDFLARE_MODEL,
      "@cf/qwen/qwen3-30b-a3b-fp8",
      200,
    );
    return {
      id,
      label: "Cloudflare Workers AI 무료",
      configured: poolEnabled
        && enabled(env.STUDIO_AI_FREE_CLOUDFLARE_CONFIRMED)
        && validCloudflareAccountId(accountId)
        && apiKey.length > 0
        && isCloudflareWorkersAiFreeModel(model),
      endpoint: validCloudflareAccountId(accountId)
        ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`
        : "",
      apiKey,
      model,
      freePool: true,
    };
  }
  if (id === "siliconflow") {
    const apiKey = env.STUDIO_AI_FREE_SILICONFLOW_API_KEY?.trim() ?? "";
    const model = boundedText(
      env.STUDIO_AI_FREE_SILICONFLOW_MODEL,
      "THUDM/GLM-Z1-9B-0414",
      200,
    );
    return {
      id,
      label: "SiliconFlow 무료 텍스트",
      configured: poolEnabled
        && enabled(env.STUDIO_AI_FREE_SILICONFLOW_CONFIRMED)
        && apiKey.length > 0
        && isSiliconFlowFreeTextModel(model),
      endpoint: "https://api.siliconflow.cn/v1/chat/completions",
      apiKey,
      model,
      freePool: true,
    };
  }
  const apiKey = env.STUDIO_AI_FREE_OPENROUTER_API_KEY?.trim()
    || env.OPENROUTER_API_KEY?.trim()
    || "";
  const model = boundedText(env.STUDIO_AI_FREE_OPENROUTER_MODEL, "openrouter/free", 200);
  return {
    id,
    label: "OpenRouter 무료",
    configured: poolEnabled
      && enabled(env.STUDIO_AI_FREE_OPENROUTER_CONFIRMED)
      && apiKey.length > 0
      && isOpenRouterFreeModel(model),
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    apiKey,
    model,
    freePool: true,
  };
}

function legacyTestProviderConfig(
  id: "zai" | "deepseek" | "openrouter",
  env: EnvLike,
): StudioAiProviderConfig {
  if (id === "zai") {
    const apiKey = env.ZAI_API_KEY?.trim() ?? "";
    return {
      id,
      label: "Z.ai",
      configured: legacyTestMode(env) && apiKey.length > 0,
      endpoint: "https://api.z.ai/api/paas/v4/chat/completions",
      apiKey,
      model: boundedText(env.ZAI_MODEL, "glm-5.1", 200),
      freePool: false,
    };
  }
  if (id === "deepseek") {
    const apiKey = env.DEEPSEEK_API_KEY?.trim() ?? "";
    return {
      id,
      label: "DeepSeek",
      configured: legacyTestMode(env) && apiKey.length > 0,
      endpoint: "https://api.deepseek.com/chat/completions",
      apiKey,
      model: boundedText(env.DEEPSEEK_MODEL, "deepseek-v4-flash", 200),
      freePool: false,
    };
  }
  const apiKey = env.OPENROUTER_API_KEY?.trim() ?? "";
  return {
    id,
    label: "OpenRouter",
    configured: legacyTestMode(env) && apiKey.length > 0,
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    apiKey,
    model: boundedText(env.OPENROUTER_MODEL, "stealth/ox-alpha", 200),
    freePool: false,
  };
}

function providerConfig(id: StudioAiProviderId, env: EnvLike): StudioAiProviderConfig {
  if (id === STUDIO_AI_PREMIUM_PROVIDER_ID) {
    // 서버 환경변수로만 키를 읽는다. 브라우저 번들·응답·로그로 내보내는 경로는 없다.
    // 운영자가 비용을 내므로 사용자 크레딧은 차감하지 않고(sponsored), 일일 예산은 서비스가 원장으로 지킨다.
    const premium = resolveStudioAiPremiumConfig(env);
    return {
      id,
      label: "ToonStudio 고성능 AI",
      configured: premium.configured,
      endpoint: STUDIO_AI_PREMIUM_MESSAGES_URL,
      apiKey: env.STUDIO_AI_ANTHROPIC_API_KEY?.trim() ?? "",
      model: premium.model,
      freePool: false,
      sponsored: true,
      ...(premium.workspaceId ? { workspaceId: premium.workspaceId } : {}),
    };
  }
  if (id === "zai") {
    return studioAiFreePoolEnabled(env)
      ? freeProviderConfig(id, env)
      : legacyTestProviderConfig(id, env);
  }
  if (
    id === "gemini"
    || id === "qwen"
    || id === "groq"
    || id === "sambanova"
    || id === "mistral"
    || id === "cloudflare"
    || id === "siliconflow"
  ) {
    return freeProviderConfig(id, env);
  }
  if (id === "openrouter") {
    return studioAiFreePoolEnabled(env)
      ? freeProviderConfig(id, env)
      : legacyTestProviderConfig(id, env);
  }
  return legacyTestProviderConfig(id, env);
}

function providerUniverse(env: EnvLike): readonly StudioAiProviderId[] {
  return studioAiFreePoolEnabled(env)
    ? STUDIO_AI_FREE_PROVIDER_IDS
    : legacyTestMode(env)
      ? DEFAULT_LEGACY_PROVIDER_ORDER
      : STUDIO_AI_FREE_PROVIDER_IDS;
}

export function resolveStudioAiProviderOrder(
  env: EnvLike = process.env,
  userOrder: readonly StudioAiFreeProviderId[] = [],
): StudioAiProviderId[] {
  const freeMode = studioAiFreePoolEnabled(env);
  const universe = providerUniverse(env);
  const configuredOrder = (freeMode
    ? env.STUDIO_AI_FREE_PROVIDER_ORDER
    : env.STUDIO_AI_PROVIDER_ORDER)?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is StudioAiProviderId =>
      universe.includes(value as StudioAiProviderId)
    ) ?? [];
  const requested = freeMode
    ? userOrder.filter((id) => universe.includes(id))
    : [];
  const defaults = freeMode ? DEFAULT_FREE_PROVIDER_ORDER : DEFAULT_LEGACY_PROVIDER_ORDER;
  return [...new Set([...requested, ...configuredOrder, ...defaults])]
    .filter((id) => universe.includes(id));
}

export interface StudioAiCandidateOptions {
  /**
   * 운영 프리미엄 경로를 후보에 넣어도 되는지(일일 예산·원장 준비가 확인됐는지). 기본 true.
   * 서비스는 예산 판정 결과를 넘기고, 상태 응답은 구성 여부만 보여 준다.
   */
  premiumAllowed?: boolean;
}

function premiumCandidate(env: EnvLike, options: StudioAiCandidateOptions): StudioAiProviderConfig[] {
  if (options.premiumAllowed === false) return [];
  const premium = providerConfig(STUDIO_AI_PREMIUM_PROVIDER_ID, env);
  return premium.configured ? [premium] : [];
}

export function resolveStudioAiProviders(
  preference: StudioAiProviderPreference = "auto",
  env: EnvLike = process.env,
  userOrder: readonly StudioAiFreeProviderId[] = [],
  options: StudioAiCandidateOptions = {},
): StudioAiProviderConfig[] {
  if (preference === STUDIO_AI_PREMIUM_PROVIDER_ID) return premiumCandidate(env, options);
  const ids = preference === "auto"
    ? resolveStudioAiProviderOrder(env, userOrder)
    : [preference];
  const providers = ids.map((id) => providerConfig(id, env)).filter((provider) => provider.configured);
  if (preference !== "auto" || !resolveStudioAiPremiumConfig(env).automatic) return providers;
  // 키가 없는 사용자의 자동 경로: 운영 프리미엄 → 성능 순 무료 풀. 시도 횟수 계약(최대 9)을 지킨다.
  return [...premiumCandidate(env, options), ...providers].slice(0, STUDIO_AI_MAX_PROVIDER_ATTEMPTS);
}

/** Explicit preference remains first; only a definitive pre-inference quota rejection advances. */
export function resolveStudioAiProviderCandidates(
  preference: StudioAiProviderPreference = "auto",
  env: EnvLike = process.env,
  userOrder: readonly StudioAiFreeProviderId[] = [],
  options: StudioAiCandidateOptions = {},
): StudioAiProviderConfig[] {
  if (preference === "auto") return resolveStudioAiProviders("auto", env, userOrder, options);
  const preferred = preference === STUDIO_AI_PREMIUM_PROVIDER_ID
    ? premiumCandidate(env, options)[0]
    : providerConfig(preference, env);
  // 예산이 바닥난 프리미엄을 명시 선택했으면 거절 대신 무료 풀로 이어 간다(추론 전 한도 거절과 같은 규칙).
  if (preference === STUDIO_AI_PREMIUM_PROVIDER_ID && !preferred) {
    return providerConfig(STUDIO_AI_PREMIUM_PROVIDER_ID, env).configured
      ? resolveStudioAiProviders("auto", env, userOrder, { premiumAllowed: false })
      : [];
  }
  if (!preferred?.configured) return [];
  const remaining = resolveStudioAiProviderOrder(env, userOrder)
    .filter((id) => id !== preference)
    .map((id) => providerConfig(id, env))
    .filter((provider) => provider.configured);
  return [preferred, ...remaining].slice(0, STUDIO_AI_MAX_PROVIDER_ATTEMPTS);
}

export function studioAiProviderStatuses(env: EnvLike = process.env) {
  const premium = providerConfig(STUDIO_AI_PREMIUM_PROVIDER_ID, env);
  const premiumStatus = premium.configured
    ? [{
        id: premium.id,
        label: premium.label,
        configured: true,
        model: premium.model,
        ...studioAiProviderDataTerms(premium.id),
      }]
    : [];
  return [...premiumStatus, ...providerUniverse(env).map((id) => {
    const provider = providerConfig(id, env);
    const dataTerms = studioAiProviderDataTerms(provider.id);
    return {
      id: provider.id,
      label: provider.label,
      configured: provider.configured,
      model: provider.model,
      dataUsage: dataTerms.dataUsage,
      dataTermsLabel: dataTerms.dataTermsLabel,
    };
  })];
}

export function resolveStudioAiTimeoutMs(
  firstProvider: StudioAiProviderId | undefined,
  env: EnvLike = process.env,
): number {
  const freeTimeouts: Partial<Record<StudioAiFreeProviderId, string | undefined>> = {
    gemini: env.STUDIO_AI_FREE_GEMINI_TIMEOUT_MS,
    qwen: env.STUDIO_AI_FREE_QWEN_TIMEOUT_MS,
    groq: env.STUDIO_AI_FREE_GROQ_TIMEOUT_MS,
    sambanova: env.STUDIO_AI_FREE_SAMBANOVA_TIMEOUT_MS,
    zai: env.STUDIO_AI_FREE_ZAI_TIMEOUT_MS,
    mistral: env.STUDIO_AI_FREE_MISTRAL_TIMEOUT_MS,
    cloudflare: env.STUDIO_AI_FREE_CLOUDFLARE_TIMEOUT_MS,
    openrouter: env.STUDIO_AI_FREE_OPENROUTER_TIMEOUT_MS,
    siliconflow: env.STUDIO_AI_FREE_SILICONFLOW_TIMEOUT_MS,
  };
  if (firstProvider === STUDIO_AI_PREMIUM_PROVIDER_ID) {
    // 고성능 모델은 사고 시간이 길어 무료 풀 기본값(45초)으로는 긴 답이 끊긴다. 전용 값이 공통 값보다 우선한다.
    const premiumParsed = Number(
      env.STUDIO_AI_ANTHROPIC_TIMEOUT_MS ?? env.STUDIO_AI_TIMEOUT_MS ?? DEFAULT_PREMIUM_TIMEOUT_MS,
    );
    return Number.isFinite(premiumParsed) && premiumParsed >= 5_000 && premiumParsed <= 120_000
      ? Math.round(premiumParsed)
      : DEFAULT_PREMIUM_TIMEOUT_MS;
  }
  const providerTimeout = studioAiFreePoolEnabled(env) && firstProvider
    ? freeTimeouts[firstProvider as StudioAiFreeProviderId]
    : firstProvider === "zai"
      ? env.ZAI_TIMEOUT_MS
      : firstProvider === "openrouter"
        ? env.OPENROUTER_TIMEOUT_MS
        : env.DEEPSEEK_TIMEOUT_MS;
  const parsed = Number(env.STUDIO_AI_TIMEOUT_MS ?? providerTimeout);
  return Number.isFinite(parsed) && parsed >= 5_000 && parsed <= 120_000
    ? Math.round(parsed)
    : DEFAULT_TIMEOUT_MS;
}

export function studioAiProviderRequestId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const value = record.request_id ?? record.id;
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 240)
    : undefined;
}

const ZAI_BILLING_OR_PACKAGE_EXHAUSTED_CODES = new Set([
  "1113", "1304", "1308", "1309", "1310",
]);

function boundedBusinessCode(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const code = String(value).trim();
  return /^[A-Za-z0-9]+(?:\.[A-Za-z0-9]+){0,7}$/u.test(code) ? code : undefined;
}

export function studioAiProviderBusinessCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const record = payload as Record<string, unknown>;
  const directCode = boundedBusinessCode(record.code ?? record.error_code);
  if (directCode) return directCode;
  if (Array.isArray(record.errors)) {
    for (const candidate of record.errors) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const error = candidate as Record<string, unknown>;
      const arrayCode = boundedBusinessCode(error.code ?? error.error_code);
      if (arrayCode) return arrayCode;
    }
  }
  if (!record.error || typeof record.error !== "object" || Array.isArray(record.error)) {
    return undefined;
  }
  const error = record.error as Record<string, unknown>;
  return boundedBusinessCode(error.code ?? error.error_code);
}

/** Messages API 오류 본문의 `error.type`(예: `overloaded_error`, `billing_error`). 형식이 다르면 undefined. */
export function studioAiPremiumErrorType(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const error = (payload as Record<string, unknown>).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return undefined;
  const type = (error as Record<string, unknown>).type;
  return typeof type === "string" && /^[a-z_]{1,64}$/u.test(type) ? type : undefined;
}

/**
 * 운영 프리미엄 경로가 추론을 시작하기 전에 거절한 경우. 운영 키의 한도(429)·혼잡(529)·결제(402)·인증/권한(401/403)·
 * 모델 없음(404)·요청 크기(413)와 400(결제 오류, 워크스페이스 지정 누락 같은 운영 키 설정 오류, 구조화 출력 스키마 미지원 같은
 * 형식 거절)은 처리되지 않았으므로 같은 요청을 무료 풀로 이어 보내도 중복 과금이 없다. 설정·형식 문제로 키 없는 사용자의
 * 요청까지 실패시키지 않는다. 추론 뒤일 수 있는 5xx는 넘기지 않는다.
 */
function premiumRejectedBeforeInference(responseStatus: number): boolean {
  return responseStatus === 429
    || responseStatus === 529
    || responseStatus === 402
    || responseStatus === 400
    || responseStatus === 401
    || responseStatus === 403
    || responseStatus === 404
    || responseStatus === 413;
}

export function classifyStudioAiProviderFailure(
  provider: StudioAiProviderId,
  responseStatus: number,
  payload?: unknown,
  freePool = STUDIO_AI_FREE_PROVIDER_IDS.includes(provider as StudioAiFreeProviderId),
): StudioAiProviderFailureClassification {
  if (provider === STUDIO_AI_PREMIUM_PROVIDER_ID && premiumRejectedBeforeInference(responseStatus)) {
    return {
      kind: STUDIO_AI_PREMIUM_FAILOVER_REASON,
      billingFailoverEligible: true,
      failoverReason: STUDIO_AI_PREMIUM_FAILOVER_REASON,
    };
  }
  const businessCode = studioAiProviderBusinessCode(payload);
  const freeProvider = freePool;
  const cloudflarePaidPlanRequired = provider === "cloudflare"
    && responseStatus === 403
    && businessCode === "5035";
  const qwenFreeQuotaOnlyExhausted = provider === "qwen"
    && responseStatus === 403
    && businessCode === "AllocationQuota.FreeTierOnly";
  if (
    freeProvider
    && (
      responseStatus === 402
      || responseStatus === 429
      || cloudflarePaidPlanRequired
      || qwenFreeQuotaOnlyExhausted
    )
  ) {
    return {
      kind: STUDIO_AI_FREE_QUOTA_FAILOVER_REASON,
      billingFailoverEligible: true,
      failoverReason: STUDIO_AI_FREE_QUOTA_FAILOVER_REASON,
      ...(businessCode ? { businessCode } : {}),
    };
  }

  const legacyBillingRejection =
    ((provider === "deepseek" || provider === "openrouter") && responseStatus === 402)
    || (provider === "zai"
      && responseStatus === 429
      && businessCode !== undefined
      && ZAI_BILLING_OR_PACKAGE_EXHAUSTED_CODES.has(businessCode));
  if (legacyBillingRejection) {
    return {
      kind: STUDIO_AI_BILLING_FAILOVER_REASON,
      billingFailoverEligible: true,
      failoverReason: STUDIO_AI_BILLING_FAILOVER_REASON,
      ...(businessCode ? { businessCode } : {}),
    };
  }
  if (responseStatus === 429) {
    return {
      kind: "rate_limited",
      billingFailoverEligible: false,
      ...(businessCode ? { businessCode } : {}),
    };
  }
  if (responseStatus === 401 || responseStatus === 403) {
    return {
      kind: "authentication",
      billingFailoverEligible: false,
      ...(businessCode ? { businessCode } : {}),
    };
  }
  if (responseStatus >= 500) {
    return {
      kind: "provider_unavailable",
      billingFailoverEligible: false,
      ...(businessCode ? { businessCode } : {}),
    };
  }
  return {
    kind: "request_rejected",
    billingFailoverEligible: false,
    ...(businessCode ? { businessCode } : {}),
  };
}
