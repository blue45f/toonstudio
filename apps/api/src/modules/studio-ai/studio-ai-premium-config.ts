/**
 * 운영 프리미엄 경로(키 없는 사용자의 1순위 고성능 AI) 설정 해석.
 *
 * 서버 환경변수로만 읽고 브라우저·응답·로그로 내보내지 않는다. 일일 예산은 원장(provider = 프리미엄 제공자)을
 * UTC 하루 단위로 세어 서비스가 지킨다(`studio-ai-premium-budget`).
 */
type EnvLike = Partial<Record<string, string | undefined>>;

/** 운영 프리미엄 경로의 일일 예산. 원장(provider = 프리미엄 제공자)을 UTC 하루 단위로 센다. */
export interface StudioAiPremiumLimits {
  userDailyRequests: number;
  globalDailyRequests: number;
  globalDailyTokens: number;
}

export interface StudioAiPremiumConfig {
  /** 서버에 운영 키가 있다. */
  configured: boolean;
  /** 키가 있고 운영자가 자동 1순위를 끄지 않았다. */
  automatic: boolean;
  model: string;
  /** 보조 기능 요청이 고를 수 있는 모델. 기본 모델은 항상 포함된다. */
  allowedModels: readonly string[];
  limits: StudioAiPremiumLimits;
  /**
   * 워크스페이스에 묶이지 않은 키(조직 전체 키)가 요청마다 지정해야 하는 워크스페이스 ID(`anthropic-workspace-id`).
   * 워크스페이스 안에서 만든 키는 필요 없다. 형식이 맞지 않으면 보내지 않는다.
   */
  workspaceId: string | null;
}

export const DEFAULT_STUDIO_AI_PREMIUM_MODEL = "claude-opus-5-5";
const DEFAULT_STUDIO_AI_PREMIUM_ALLOWED_MODELS = Object.freeze([
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
]);
export const DEFAULT_STUDIO_AI_PREMIUM_LIMITS: StudioAiPremiumLimits = Object.freeze({
  userDailyRequests: 30,
  globalDailyRequests: 400,
  globalDailyTokens: 3_000_000,
});
const PREMIUM_MODEL_ID_PATTERN = /^claude-[a-z0-9][a-z0-9.-]{1,78}$/u;
const PREMIUM_WORKSPACE_ID_PATTERN = /^wrkspc_[A-Za-z0-9]{6,64}$/u;

function boundedLimit(raw: string | undefined, fallback: number, maximum: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}

export function isStudioAiPremiumModelId(model: string): boolean {
  return PREMIUM_MODEL_ID_PATTERN.test(model.trim());
}

export function resolveStudioAiPremiumConfig(env: EnvLike = process.env): StudioAiPremiumConfig {
  const configured = (env.STUDIO_AI_ANTHROPIC_API_KEY?.trim() ?? "").length > 0;
  const requestedModel = env.STUDIO_AI_ANTHROPIC_MODEL?.trim().toLowerCase() ?? "";
  const model = isStudioAiPremiumModelId(requestedModel)
    ? requestedModel
    : DEFAULT_STUDIO_AI_PREMIUM_MODEL;
  const listed = (env.STUDIO_AI_PREMIUM_ALLOWED_MODELS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(isStudioAiPremiumModelId);
  const allowedModels = [...new Set([model, ...(listed.length > 0 ? listed : DEFAULT_STUDIO_AI_PREMIUM_ALLOWED_MODELS)])];
  const workspaceId = env.STUDIO_AI_ANTHROPIC_WORKSPACE_ID?.trim() ?? "";
  return {
    configured,
    automatic: configured && env.STUDIO_AI_PREMIUM_AUTO?.trim().toLowerCase() !== "false",
    model,
    allowedModels: Object.freeze(allowedModels),
    limits: {
      userDailyRequests: boundedLimit(
        env.STUDIO_AI_PREMIUM_USER_DAILY_REQUEST_LIMIT,
        DEFAULT_STUDIO_AI_PREMIUM_LIMITS.userDailyRequests,
        10_000,
      ),
      globalDailyRequests: boundedLimit(
        env.STUDIO_AI_PREMIUM_GLOBAL_DAILY_REQUEST_LIMIT,
        DEFAULT_STUDIO_AI_PREMIUM_LIMITS.globalDailyRequests,
        1_000_000,
      ),
      globalDailyTokens: boundedLimit(
        env.STUDIO_AI_PREMIUM_GLOBAL_DAILY_TOKEN_LIMIT,
        DEFAULT_STUDIO_AI_PREMIUM_LIMITS.globalDailyTokens,
        1_000_000_000,
      ),
    },
    workspaceId: PREMIUM_WORKSPACE_ID_PATTERN.test(workspaceId) ? workspaceId : null,
  };
}
