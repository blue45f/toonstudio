import {
  DEFAULT_FREE_SAFETY_CUTOFF_RATIO,
  isGeminiFreeTierModel,
  isOpenAiFreeShareModel,
  isOpenAiRetiredModel,
  type EnvLike,
} from "./studio-openai-guardrails";

export const ZERO_BILL_FREE_PROVIDER_ORDER = [
  "openai-free-share",
  "gemini-free",
  "github-models-free",
  "cloudflare-workers-ai-free",
  "mistral-free",
  "sambanova-free",
  "groq-free",
  "openrouter-free",
  "local-zero-cost-fallback",
] as const;

export type ZeroBillFreeProviderId = (typeof ZERO_BILL_FREE_PROVIDER_ORDER)[number];

export type ZeroBillBlockReason =
  | "http_402_payment_required"
  | "http_429_rate_limit"
  | "insufficient_quota"
  | "billing_hard_limit"
  | "safety_cutoff_90pct"
  | "paid_model_blocked"
  | "retired_model_blocked"
  | "auth_failed"
  | "free_billing_unconfirmed";

export interface ZeroBillProviderResolution {
  readonly id: ZeroBillFreeProviderId;
  readonly labelKo: string;
  readonly priority: number;
  readonly tier: "cloud-free" | "local-fallback";
  readonly configured: boolean;
  readonly freeBillingConfirmed: boolean;
  readonly endpoint: string;
  readonly apiKey: string;
  readonly model: string;
  readonly modelAllowed: boolean;
  readonly modelBlockReason: "paid_model_blocked" | "retired_model_blocked" | null;
  readonly supportsStrictJsonSchema: boolean;
  readonly dailyRequestCap: number;
  readonly dailyTokenCap: number;
  readonly timeoutMs: number;
  readonly extraHeaders?: Readonly<Record<string, string>>;
}

export interface ZeroBillProviderQuotaStatus {
  readonly id: ZeroBillFreeProviderId;
  readonly labelKo: string;
  readonly priority: number;
  readonly tier: "cloud-free" | "local-fallback";
  readonly configured: boolean;
  readonly model: string;
  readonly modelAllowed: boolean;
  readonly modelBlockReason: "paid_model_blocked" | "retired_model_blocked" | null;
  readonly blocked: boolean;
  readonly blockReason: ZeroBillBlockReason | null;
  readonly blockedUntilUtc: string | null;
  readonly dailyRequestCap: number;
  readonly safeRequestCutoff: number;
  readonly usedRequests: number;
  readonly remainingSafeRequests: number;
  readonly dailyTokenCap: number;
  readonly safeTokenCutoff: number;
  readonly usedTokens: number;
  readonly remainingSafeTokens: number;
  readonly utilizationPct: number;
  readonly costUsdGuaranteed: "$0.00";
}

export interface ZeroBillFreeQuotaStatusReport {
  /** 이 서비스는 공급자 계정의 청구 명세를 조회하지 않는다. */
  readonly providerBilledUsd: null;
  readonly guaranteedZeroCostUsd: 0;
  readonly guaranteedZeroCostLabel: "$0.00";
  readonly guaranteedZeroCostKrwLabel: "₩0";
  readonly paidBillingBlocked: true;
  readonly failClosedOnCutoff: true;
  readonly safetyCutoffRatio: number;
  readonly utcDay: string;
  readonly nextResetUtcIso: string;
  readonly summary: {
    readonly totalProviders: number;
    readonly configuredCloudCount: number;
    readonly activeCloudCount: number;
    readonly blockedCloudCount: number;
    readonly localFallbackReady: true;
    readonly activePriorityOrder: readonly ZeroBillFreeProviderId[];
  };
  readonly providers: readonly ZeroBillProviderQuotaStatus[];
}

export interface ZeroBillCascadeAttempt {
  readonly providerId: ZeroBillFreeProviderId;
  readonly model: string;
  readonly outcome: "succeeded" | "skipped" | "failed-over";
  readonly reason: string;
  readonly httpStatus: number | null;
}

export interface ZeroBillCascadeRequest {
  readonly systemInstruction: string;
  readonly userPrompt: string;
  readonly jsonSchema?: {
    readonly name: string;
    readonly schema: Record<string, unknown>;
  };
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly preferredProviders?: readonly ZeroBillFreeProviderId[];
  readonly localOnly?: boolean;
  readonly allowLocalDeterministicFallback?: boolean;
  readonly localDeterministicOutput?: () => string;
}

export interface ZeroBillCascadeResult {
  readonly ok: boolean;
  readonly providerId: ZeroBillFreeProviderId;
  readonly providerTier: "cloud-free" | "local-fallback";
  readonly model: string;
  readonly content: string;
  readonly costGuaranteedZeroUsd: 0;
  readonly paidBillingBlocked: true;
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
  readonly attempts: readonly ZeroBillCascadeAttempt[];
  readonly errorCode?: string;
  readonly errorMessageKo?: string;
}

const MAX_ERROR_BODY_BYTES = 8_192;
const CLOUDFLARE_ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/u;
const ORG_ID_PATTERN = /^org-[A-Za-z0-9_-]{4,80}$/u;
const PROJECT_ID_PATTERN = /^proj_[A-Za-z0-9_-]{4,80}$/u;

const GITHUB_FREE_MODELS = new Set([
  "openai/gpt-4o-mini",
  "openai/gpt-4.1-mini",
  "meta/llama-3.3-70b-instruct",
  "deepseek/deepseek-v3-0324",
  "mistral-ai/mistral-small-2503",
]);
const CLOUDFLARE_FREE_MODELS = new Set([
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/zai-org/glm-4.7-flash",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.1-8b-instruct-fast",
]);
const MISTRAL_FREE_MODELS = new Set([
  "mistral-small-latest",
  "open-mistral-nemo",
  "ministral-8b-latest",
  "pixtral-12b-2409",
]);
const SAMBANOVA_FREE_MODELS = new Set([
  "deepseek-v3.1",
  "deepseek-v3-0324",
  "meta-llama-3.3-70b-instruct",
  "qwen3-32b",
]);
const GROQ_FREE_MODELS = new Set([
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "qwen/qwen3-32b",
]);

const QUOTA_ERROR_PATTERN =
  /insufficient_quota|billing_hard_limit|credit_balance_exhausted|spend_limit_exceeded|quota_exceeded|resource_exhausted|payment_required/iu;

function readFirstEnv(env: EnvLike, keys: readonly string[]): string {
  for (const key of keys) {
    const val = env[key]?.trim();
    if (val) return val;
  }
  return "";
}

// 무료 자격과 추가 유료 청구 차단을 해당 키의 계정에서 확인한 운영 설정만 허용한다.
function freeBillingConfirmed(env: EnvLike, vendor: string): boolean {
  const name = `STUDIO_AI_FREE_${vendor}_CONFIRMED`;
  return readFirstEnv(env, [name, `ONPOD_API_ENV_${name}`]).toLowerCase() === "true";
}

function parseClampedInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw || !raw.trim()) return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function parseSafetyCutoffRatio(env: EnvLike): number {
  const raw = env.STUDIO_FREE_AI_SAFETY_CUTOFF_RATIO?.trim();
  if (!raw) return DEFAULT_FREE_SAFETY_CUTOFF_RATIO;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_FREE_SAFETY_CUTOFF_RATIO;
  return Math.min(0.95, Math.max(0.5, parsed));
}

export function utcDayString(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function nextUtcMidnightMs(nowMs: number): number {
  const date = new Date(nowMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

export function classifyUpstreamFailure(status: number, bodyText: string): ZeroBillBlockReason | null {
  if (status === 402) return "http_402_payment_required";
  const truncated = bodyText.slice(0, MAX_ERROR_BODY_BYTES);
  if (/billing_hard_limit|spend_limit_exceeded|credit_balance_exhausted/iu.test(truncated)) {
    return "billing_hard_limit";
  }
  if (/insufficient_quota|quota_exceeded|resource_exhausted/iu.test(truncated)) {
    return "insufficient_quota";
  }
  if (status === 429) return "http_429_rate_limit";
  if (status === 401 || status === 403) return "auth_failed";
  if (QUOTA_ERROR_PATTERN.test(truncated)) return "insufficient_quota";
  return null;
}

export function isFreeModelWhitelisted(
  providerId: ZeroBillFreeProviderId,
  rawModel: string,
): { readonly allowed: boolean; readonly blockReason: "paid_model_blocked" | "retired_model_blocked" | null } {
  const normalized = rawModel.trim().toLowerCase();
  if (!normalized) return { allowed: false, blockReason: "paid_model_blocked" };

  switch (providerId) {
    case "openai-free-share":
      if (isOpenAiRetiredModel(normalized)) {
        return { allowed: false, blockReason: "retired_model_blocked" };
      }
      return isOpenAiFreeShareModel(normalized)
        ? { allowed: true, blockReason: null }
        : { allowed: false, blockReason: "paid_model_blocked" };
    case "gemini-free":
      return isGeminiFreeTierModel(normalized)
        ? { allowed: true, blockReason: null }
        : { allowed: false, blockReason: "paid_model_blocked" };
    case "github-models-free":
      return GITHUB_FREE_MODELS.has(normalized)
        ? { allowed: true, blockReason: null }
        : { allowed: false, blockReason: "paid_model_blocked" };
    case "cloudflare-workers-ai-free":
      return CLOUDFLARE_FREE_MODELS.has(normalized)
        ? { allowed: true, blockReason: null }
        : { allowed: false, blockReason: "paid_model_blocked" };
    case "mistral-free":
      return MISTRAL_FREE_MODELS.has(normalized)
        ? { allowed: true, blockReason: null }
        : { allowed: false, blockReason: "paid_model_blocked" };
    case "sambanova-free":
      return SAMBANOVA_FREE_MODELS.has(normalized)
        ? { allowed: true, blockReason: null }
        : { allowed: false, blockReason: "paid_model_blocked" };
    case "groq-free":
      return GROQ_FREE_MODELS.has(normalized)
        ? { allowed: true, blockReason: null }
        : { allowed: false, blockReason: "paid_model_blocked" };
    case "openrouter-free":
      return normalized === "openrouter/free" || normalized.endsWith(":free")
        ? { allowed: true, blockReason: null }
        : { allowed: false, blockReason: "paid_model_blocked" };
    case "local-zero-cost-fallback":
      return { allowed: true, blockReason: null };
  }
}

export function resolveZeroBillFreeProviders(
  env: EnvLike = process.env,
): readonly ZeroBillProviderResolution[] {
  const openaiKey = readFirstEnv(env, ["OPENAI_API_KEY"]);
  const openaiModel = readFirstEnv(env, ["OPENAI_MODEL"]) || "gpt-4o-mini";
  const openaiCheck = isFreeModelWhitelisted("openai-free-share", openaiModel);
  const openaiDefaultTokens = openaiModel.toLowerCase() === "gpt-4o" ? 250_000 : 2_500_000;
  const openaiHeaders: Record<string, string> = {};
  const rawOrg = readFirstEnv(env, ["OPENAI_ORG_ID"]);
  const rawProject = readFirstEnv(env, ["OPENAI_PROJECT_ID"]);
  if (ORG_ID_PATTERN.test(rawOrg)) openaiHeaders["OpenAI-Organization"] = rawOrg;
  if (PROJECT_ID_PATTERN.test(rawProject)) openaiHeaders["OpenAI-Project"] = rawProject;

  const geminiKey = readFirstEnv(env, [
    "STUDIO_AI_FREE_GEMINI_API_KEY",
    "ONPOD_API_ENV_STUDIO_AI_FREE_GEMINI_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_AI_API_KEY",
  ]);
  const geminiModel =
    readFirstEnv(env, [
      "STUDIO_AI_FREE_GEMINI_MODEL",
      "ONPOD_API_ENV_STUDIO_AI_FREE_GEMINI_MODEL",
      "STUDIO_FREE_AI_GEMINI_MODEL",
      "GEMINI_MODEL",
    ]) || "gemini-2.5-flash";
  const geminiCheck = isFreeModelWhitelisted("gemini-free", geminiModel);

  const githubKey = readFirstEnv(env, [
    "STUDIO_AI_FREE_GITHUB_MODELS_API_KEY",
    "ONPOD_API_ENV_STUDIO_AI_FREE_GITHUB_MODELS_API_KEY",
    "GITHUB_MODELS_API_KEY",
  ]);
  const githubModel =
    readFirstEnv(env, ["STUDIO_AI_FREE_GITHUB_MODELS_MODEL", "ONPOD_API_ENV_STUDIO_AI_FREE_GITHUB_MODELS_MODEL", "GITHUB_MODELS_MODEL"]) ||
    "openai/gpt-4o-mini";
  const githubCheck = isFreeModelWhitelisted("github-models-free", githubModel);

  const cfToken = readFirstEnv(env, [
    "STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN",
    "ONPOD_API_ENV_STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_WORKERS_AI_API_TOKEN",
  ]);
  const cfAccount = readFirstEnv(env, [
    "STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID",
    "ONPOD_API_ENV_STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_ACCOUNT_ID",
  ]).toLowerCase();
  const cfModel =
    readFirstEnv(env, [
      "STUDIO_AI_FREE_CLOUDFLARE_MODEL",
      "ONPOD_API_ENV_STUDIO_AI_FREE_CLOUDFLARE_MODEL",
    ]) || "@cf/google/gemma-4-26b-a4b-it";
  const cfCheck = isFreeModelWhitelisted("cloudflare-workers-ai-free", cfModel);
  const cfAccountValid = CLOUDFLARE_ACCOUNT_ID_PATTERN.test(cfAccount);

  const mistralKey = readFirstEnv(env, [
    "STUDIO_AI_FREE_MISTRAL_API_KEY",
    "ONPOD_API_ENV_STUDIO_AI_FREE_MISTRAL_API_KEY",
  ]);
  const mistralModel =
    readFirstEnv(env, [
      "STUDIO_AI_FREE_MISTRAL_MODEL",
      "ONPOD_API_ENV_STUDIO_AI_FREE_MISTRAL_MODEL",
    ]) || "mistral-small-latest";
  const mistralCheck = isFreeModelWhitelisted("mistral-free", mistralModel);

  const sambanovaKey = readFirstEnv(env, [
    "STUDIO_AI_FREE_SAMBANOVA_API_KEY",
    "ONPOD_API_ENV_STUDIO_AI_FREE_SAMBANOVA_API_KEY",
  ]);
  const sambanovaModel =
    readFirstEnv(env, [
      "STUDIO_AI_FREE_SAMBANOVA_MODEL",
      "ONPOD_API_ENV_STUDIO_AI_FREE_SAMBANOVA_MODEL",
    ]) || "DeepSeek-V3.1";
  const sambanovaCheck = isFreeModelWhitelisted("sambanova-free", sambanovaModel);

  const groqKey = readFirstEnv(env, [
    "STUDIO_AI_FREE_GROQ_API_KEY",
    "ONPOD_API_ENV_STUDIO_AI_FREE_GROQ_API_KEY",
  ]);
  const groqModel =
    readFirstEnv(env, [
      "STUDIO_AI_FREE_GROQ_MODEL",
      "ONPOD_API_ENV_STUDIO_AI_FREE_GROQ_MODEL",
    ]) || "llama-3.3-70b-versatile";
  const groqCheck = isFreeModelWhitelisted("groq-free", groqModel);

  const openrouterKey = readFirstEnv(env, [
    "STUDIO_AI_FREE_OPENROUTER_API_KEY",
    "ONPOD_API_ENV_STUDIO_AI_FREE_OPENROUTER_API_KEY",
    "OPENROUTER_API_KEY",
  ]);
  const openrouterModel =
    readFirstEnv(env, [
      "STUDIO_AI_FREE_OPENROUTER_MODEL",
      "ONPOD_API_ENV_STUDIO_AI_FREE_OPENROUTER_MODEL",
    ]) || "openrouter/free";
  const openrouterCheck = isFreeModelWhitelisted("openrouter-free", openrouterModel);

  return [
    {
      id: "openai-free-share",
      labelKo: "OpenAI 무료 데이터 공유 토큰",
      priority: 1,
      tier: "cloud-free",
      freeBillingConfirmed: freeBillingConfirmed(env, "OPENAI"),
      configured: openaiKey.length > 0,
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: openaiKey,
      model: openaiModel,
      modelAllowed: openaiCheck.allowed,
      modelBlockReason: openaiCheck.blockReason,
      supportsStrictJsonSchema: true,
      dailyRequestCap: parseClampedInt(env.STUDIO_FREE_AI_OPENAI_DAILY_REQUEST_CAP, 300, 1, 10_000),
      dailyTokenCap: parseClampedInt(
        env.STUDIO_FREE_AI_OPENAI_DAILY_TOKEN_CAP,
        openaiDefaultTokens,
        1_000,
        10_000_000,
      ),
      timeoutMs: parseClampedInt(env.STUDIO_OPENAI_TIMEOUT_MS, 25_000, 3_000, 60_000),
      extraHeaders: openaiHeaders,
    },
    {
      id: "gemini-free",
      labelKo: "Gemini 무료 티어",
      priority: 2,
      tier: "cloud-free",
      freeBillingConfirmed: freeBillingConfirmed(env, "GEMINI"),
      configured: geminiKey.length > 0,
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: geminiKey,
      model: geminiModel,
      modelAllowed: geminiCheck.allowed,
      modelBlockReason: geminiCheck.blockReason,
      supportsStrictJsonSchema: false,
      dailyRequestCap: parseClampedInt(env.STUDIO_FREE_AI_GEMINI_DAILY_REQUEST_CAP, 250, 1, 5_000),
      dailyTokenCap: parseClampedInt(env.STUDIO_FREE_AI_GEMINI_DAILY_TOKEN_CAP, 250_000, 1_000, 5_000_000),
      timeoutMs: parseClampedInt(env.STUDIO_AI_FREE_GEMINI_TIMEOUT_MS, 25_000, 3_000, 60_000),
    },
    {
      id: "github-models-free",
      labelKo: "GitHub Models 무료",
      priority: 3,
      tier: "cloud-free",
      freeBillingConfirmed: freeBillingConfirmed(env, "GITHUB_MODELS"),
      configured: githubKey.length > 0,
      endpoint: "https://models.github.ai/inference/chat/completions",
      apiKey: githubKey,
      model: githubModel,
      modelAllowed: githubCheck.allowed,
      modelBlockReason: githubCheck.blockReason,
      supportsStrictJsonSchema: true,
      dailyRequestCap: parseClampedInt(env.STUDIO_FREE_AI_GITHUB_DAILY_REQUEST_CAP, 150, 1, 2_000),
      dailyTokenCap: parseClampedInt(env.STUDIO_FREE_AI_GITHUB_DAILY_TOKEN_CAP, 120_000, 1_000, 2_000_000),
      timeoutMs: 25_000,
    },
    {
      id: "cloudflare-workers-ai-free",
      labelKo: "Cloudflare Workers AI 무료",
      priority: 4,
      tier: "cloud-free",
      freeBillingConfirmed: freeBillingConfirmed(env, "CLOUDFLARE"),
      configured: cfToken.length > 0 && cfAccountValid,
      endpoint: cfAccountValid
        ? `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/v1/chat/completions`
        : "",
      apiKey: cfToken,
      model: cfModel,
      modelAllowed: cfCheck.allowed,
      modelBlockReason: cfCheck.blockReason,
      supportsStrictJsonSchema: false,
      dailyRequestCap: parseClampedInt(env.STUDIO_FREE_AI_CLOUDFLARE_DAILY_REQUEST_CAP, 200, 1, 2_000),
      dailyTokenCap: parseClampedInt(env.STUDIO_FREE_AI_CLOUDFLARE_DAILY_TOKEN_CAP, 100_000, 1_000, 1_000_000),
      timeoutMs: parseClampedInt(env.STUDIO_AI_FREE_CLOUDFLARE_TIMEOUT_MS, 25_000, 3_000, 60_000),
    },
    {
      id: "mistral-free",
      labelKo: "Mistral 무료 티어",
      priority: 5,
      tier: "cloud-free",
      freeBillingConfirmed: freeBillingConfirmed(env, "MISTRAL"),
      configured: mistralKey.length > 0,
      endpoint: "https://api.mistral.ai/v1/chat/completions",
      apiKey: mistralKey,
      model: mistralModel,
      modelAllowed: mistralCheck.allowed,
      modelBlockReason: mistralCheck.blockReason,
      supportsStrictJsonSchema: false,
      dailyRequestCap: 150,
      dailyTokenCap: 180_000,
      timeoutMs: parseClampedInt(env.STUDIO_AI_FREE_MISTRAL_TIMEOUT_MS, 25_000, 3_000, 60_000),
    },
    {
      id: "sambanova-free",
      labelKo: "SambaNova 무료 티어",
      priority: 6,
      tier: "cloud-free",
      freeBillingConfirmed: freeBillingConfirmed(env, "SAMBANOVA"),
      configured: sambanovaKey.length > 0,
      endpoint: "https://api.sambanova.ai/v1/chat/completions",
      apiKey: sambanovaKey,
      model: sambanovaModel,
      modelAllowed: sambanovaCheck.allowed,
      modelBlockReason: sambanovaCheck.blockReason,
      supportsStrictJsonSchema: false,
      dailyRequestCap: 120,
      dailyTokenCap: 150_000,
      timeoutMs: parseClampedInt(env.STUDIO_AI_FREE_SAMBANOVA_TIMEOUT_MS, 25_000, 3_000, 60_000),
    },
    {
      id: "groq-free",
      labelKo: "Groq 무료 플랜",
      priority: 7,
      tier: "cloud-free",
      freeBillingConfirmed: freeBillingConfirmed(env, "GROQ"),
      configured: groqKey.length > 0,
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: groqKey,
      model: groqModel,
      modelAllowed: groqCheck.allowed,
      modelBlockReason: groqCheck.blockReason,
      supportsStrictJsonSchema: false,
      dailyRequestCap: 200,
      dailyTokenCap: 200_000,
      timeoutMs: parseClampedInt(env.STUDIO_AI_FREE_GROQ_TIMEOUT_MS, 25_000, 3_000, 60_000),
    },
    {
      id: "openrouter-free",
      labelKo: "OpenRouter 무료(:free 전용)",
      priority: 8,
      tier: "cloud-free",
      freeBillingConfirmed: true,
      configured: openrouterKey.length > 0,
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: openrouterKey,
      model: openrouterModel,
      modelAllowed: openrouterCheck.allowed,
      modelBlockReason: openrouterCheck.blockReason,
      supportsStrictJsonSchema: false,
      dailyRequestCap: 100,
      dailyTokenCap: 120_000,
      timeoutMs: parseClampedInt(env.STUDIO_AI_FREE_OPENROUTER_TIMEOUT_MS, 25_000, 3_000, 60_000),
    },
    {
      id: "local-zero-cost-fallback",
      labelKo: "로컬 무과금 코치",
      priority: 9,
      tier: "local-fallback",
      freeBillingConfirmed: true,
      configured: true,
      endpoint: "local://toonstudio-deterministic-coach",
      apiKey: "",
      model: "toonstudio-deterministic-coach-v2",
      modelAllowed: true,
      modelBlockReason: null,
      supportsStrictJsonSchema: true,
      dailyRequestCap: 100_000,
      dailyTokenCap: 100_000_000,
      timeoutMs: 10_000,
    },
  ];
}
