import { HTTPError, api, getApiErrorMessage, isAppApiError } from "@/platform/api";
import { completeWithUserTextKey } from "@/shared/ai/unified-ai-settings";
import {
  getUserAiSnapshot,
  userAiAutomaticExternalConnectionsForCapability,
  userAiPersonalFirstConnectionsForCapability,
} from "@/shared/ai/user-ai-store";
import { userAiRoutingSettings, type UserAiResolvedConnection } from "@/shared/ai/user-ai-types";
import { aiErrorText } from "./ai/studio-ai-error-i18n";

export type StudioServerAiTask = "assistant" | "composition" | "scenario" | "translation" | "dialogue" | "palette";
export type StudioFreePoolProvider = "gemini" | "qwen" | "groq" | "sambanova" | "zai" | "mistral" | "cloudflare" | "openrouter" | "siliconflow" | "deepseek";
/** 키 없는 사용자의 1순위인 운영 고성능 경로(운영자 비용, 사용자 비용 없음). */
export type StudioPremiumProvider = "anthropic";
export type StudioServerAiProvider = StudioPremiumProvider | StudioFreePoolProvider | "user";
export type StudioServerAiProviderPreference = "auto" | StudioPremiumProvider | StudioFreePoolProvider;
export type StudioServerAiFailoverReason = "free_quota_exhausted" | "billing_quota_exhausted" | "premium_unavailable";

/** 서버의 고성능 경로 제한 시간(120초)보다 길게 기다려, 이미 처리된 결과를 브라우저가 먼저 끊지 않게 한다. */
export const STUDIO_SERVER_AI_TIMEOUT_MS = 135_000;

const LABELS: Record<StudioServerAiProvider, string> = {
  anthropic: "ToonStudio 고성능 AI",
  gemini: "Gemini 무료",
  qwen: "Qwen 베이징 무료 할당량",
  groq: "Groq 무료",
  sambanova: "SambaNova 무료",
  zai: "Z.AI 무료 Flash",
  mistral: "Mistral 무료",
  cloudflare: "Cloudflare Workers AI 무료",
  openrouter: "OpenRouter 무료",
  siliconflow: "SiliconFlow 무료 텍스트",
  deepseek: "DeepSeek",
  user: "내 클라우드 AI",
};

export function studioServerAiProviderLabel(provider: StudioServerAiProvider): string {
  return LABELS[provider];
}


export interface StudioServerAiFailoverMetadata {
  attemptedProvider: StudioServerAiProvider;
  attemptedModel: string;
  actualProvider: StudioServerAiProvider;
  actualModel: string;
  reason: StudioServerAiFailoverReason;
}

export type StudioServerAiStatus = {
  configured: boolean;
  provider: StudioServerAiProvider | "none";
  model: string;
  providers: Array<{
    id: StudioServerAiProvider;
    label: string;
    configured: boolean;
    model: string;
  }>;
  selection: {
    default: "auto";
    order: StudioServerAiProvider[];
    fallback: boolean;
    fallbackPolicy?: StudioServerAiFailoverReason;
  };
  capabilities: string[];
  requiresAuth: boolean;
  operatorFunded?: boolean;
  freePool?: boolean;
  settingsHref?: string;
  quota?: {
    enforced: boolean;
    timezone: "UTC";
    failureMode: "closed";
    dailyRequestLimit: number;
    dailyTokenLimit: number;
    globalDailyRequestLimit?: number;
    globalDailyTokenLimit?: number;
  };
};

/**
 * 텍스트 AI가 내 키를 ToonStudio AI보다 먼저 쓰는지. 실제 경로(completeStudioServerText)와 표시가 같은 규칙을 쓴다.
 * "내가 정한 순서"에서는 맨 앞 내 키가 ToonStudio AI보다 앞에 있을 때만 먼저 쓴다.
 */
function personalRoutesRunFirst(
  routing: ReturnType<typeof userAiRoutingSettings>,
  personalFirstRoutes: readonly UserAiResolvedConnection[],
): boolean {
  return personalFirstRoutes.length > 0 && (
    routing.mode !== "priority"
    || (personalFirstRoutes[0]?.priority ?? 100) < routing.managedPoolPriority
  );
}

export function resolveActiveServerAiProviderLabel(
  preference: StudioServerAiProviderPreference,
  status: Pick<StudioServerAiStatus, "configured" | "providers"> | null,
): string {
  if (preference === "auto") {
    // 실제 순서대로 적는다(completeStudioServerText와 같은 규칙): 내 키(무료 키·먼저 쓰기로 한 유료 키)가 먼저면 앞에 적는다.
    const routing = userAiRoutingSettings(getUserAiSnapshot().configuration);
    const personalFirstRoutes = userAiPersonalFirstConnectionsForCapability("text");
    // "하나만 고정"은 고른 내 키만 쓰고 다른 경로로 넘어가지 않는다.
    if (routing.mode === "manual" && personalFirstRoutes.length > 0) return "고정: 내 키";
    const myKeysFirst = personalRoutesRunFirst(routing, personalFirstRoutes);
    const prefix = myKeysFirst ? "내 키 → " : "";
    if (status?.providers?.some((provider) => provider.id === "anthropic" && provider.configured)) {
      return `자동: ${prefix}ToonStudio 고성능 AI → 무료 AI`;
    }
    if (myKeysFirst) return status?.configured ? "자동: 내 키 → 무료 AI" : "자동: 내 키";
    return status?.configured ? "자동 무료 AI" : "자동 무료 AI → 내 무료 키";
  }
  return status?.providers?.find((provider) => provider.id === preference)?.label ?? "선택한 무료 AI";
}

export type StudioServerAiCompletion = {
  content: string;
  provider: StudioServerAiProvider;
  model: string;
  requestId?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  failover?: StudioServerAiFailoverMetadata;
};

export type StudioServerAiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code:
        | "invalid_input"
        | "network_error"
        | "http_error"
        | "parse_error"
        | "free_exhausted"
        | "login_required";
      error: string;
    };

function parseStudioServerAiStatus(value: unknown): StudioServerAiStatus {
  const source = isRecord(value) ? value : {};
  const providers = Array.isArray(source.providers)
    ? source.providers.flatMap((candidate) => {
        if (!isRecord(candidate)) return [];
        const id = provider(candidate.id);
        const label = text(candidate.label, 120);
        const model = text(candidate.model, 200);
        if (!id || !label || !model) return [];
        return [{
          id,
          label,
          configured: candidate.configured === true,
          model,
        }];
      })
    : [];
  const rawSelection = isRecord(source.selection) ? source.selection : {};
  const order = Array.isArray(rawSelection.order)
    ? rawSelection.order.flatMap((candidate) => {
        const parsed = provider(candidate);
        return parsed ? [parsed] : [];
      })
    : [];
  const selectedProvider = source.provider === "none"
    ? "none"
    : provider(source.provider) ?? "none";
  const rawCapabilities = Array.isArray(source.capabilities)
    ? source.capabilities
    : [];
  const capabilities = rawCapabilities.flatMap((candidate) => {
    const parsed = text(candidate, 80);
    return parsed ? [parsed] : [];
  });
  const rawQuota = isRecord(source.quota) ? source.quota : null;
  const quota = rawQuota
    && typeof rawQuota.enforced === "boolean"
    && rawQuota.timezone === "UTC"
    && rawQuota.failureMode === "closed"
    && count(rawQuota.dailyRequestLimit) !== undefined
    && count(rawQuota.dailyTokenLimit) !== undefined
    ? {
        enforced: rawQuota.enforced,
        timezone: "UTC" as const,
        failureMode: "closed" as const,
        dailyRequestLimit: count(rawQuota.dailyRequestLimit)!,
        dailyTokenLimit: count(rawQuota.dailyTokenLimit)!,
        ...(count(rawQuota.globalDailyRequestLimit) === undefined
          ? {}
          : { globalDailyRequestLimit: count(rawQuota.globalDailyRequestLimit) }),
        ...(count(rawQuota.globalDailyTokenLimit) === undefined
          ? {}
          : { globalDailyTokenLimit: count(rawQuota.globalDailyTokenLimit) }),
      }
    : undefined;
  return {
    configured: source.configured === true,
    provider: selectedProvider,
    model: text(source.model, 200) ?? "",
    providers,
    selection: {
      default: "auto",
      order,
      fallback: rawSelection.fallback === true,
      ...(failoverReason(rawSelection.fallbackPolicy) === undefined
        ? {}
        : { fallbackPolicy: failoverReason(rawSelection.fallbackPolicy) }),
    },
    capabilities,
    requiresAuth: source.requiresAuth !== false,
    ...(typeof source.operatorFunded === "boolean"
      ? { operatorFunded: source.operatorFunded }
      : {}),
    ...(typeof source.freePool === "boolean" ? { freePool: source.freePool } : {}),
    ...(text(source.settingsHref, 500) === undefined
      ? {}
      : { settingsHref: text(source.settingsHref, 500) }),
    ...(quota ? { quota } : {}),
  };
}

export async function getStudioServerAiStatus(signal?: AbortSignal): Promise<StudioServerAiStatus> {
  return parseStudioServerAiStatus(
    await api.get<unknown>("/studio-ai/status", { signal }),
  );
}

const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;
export function canonicalStudioServerAiOperationId(value: unknown): string | null {
  return typeof value === "string" && OPERATION_ID.test(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function provider(value: unknown): StudioServerAiProvider | undefined {
  return value === "anthropic"
    || value === "gemini"
    || value === "qwen"
    || value === "groq"
    || value === "sambanova"
    || value === "zai"
    || value === "mistral"
    || value === "cloudflare"
    || value === "openrouter"
    || value === "siliconflow"
    || value === "deepseek"
    || value === "user"
    ? value
    : undefined;
}

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= limit ? normalized : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= 2_147_483_647
    ? value
    : undefined;
}

function failoverReason(value: unknown): StudioServerAiFailoverReason | undefined {
  return value === "free_quota_exhausted" || value === "billing_quota_exhausted" || value === "premium_unavailable"
    ? value
    : undefined;
}

export function parseStudioServerAiFailoverMetadata(
  value: unknown,
  actual: Pick<StudioServerAiCompletion, "provider" | "model">,
): StudioServerAiFailoverMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const attemptedProvider = provider(value.attemptedProvider);
  const actualProvider = provider(value.actualProvider);
  const attemptedModel = text(value.attemptedModel, 200);
  const actualModel = text(value.actualModel, 200);
  const reason = failoverReason(value.reason);
  if (
    !attemptedProvider
    || !actualProvider
    || !attemptedModel
    || !actualModel
    || !reason
    || attemptedProvider === actualProvider
    || actualProvider !== actual.provider
    || actualModel !== actual.model
  ) {
    return undefined;
  }
  return { attemptedProvider, attemptedModel, actualProvider, actualModel, reason };
}

export function parseStudioServerAiCompletion(value: unknown): StudioServerAiCompletion | undefined {
  if (!isRecord(value)) return undefined;
  const content = text(value.content, 100_000);
  const actualProvider = provider(value.provider);
  const model = text(value.model, 200);
  if (!content || !actualProvider || !model) return undefined;
  const usageRecord = isRecord(value.usage) ? value.usage : {};
  const promptTokens = count(usageRecord.promptTokens);
  const completionTokens = count(usageRecord.completionTokens);
  const totalTokens = count(usageRecord.totalTokens);
  const usage = promptTokens === undefined
    && completionTokens === undefined
    && totalTokens === undefined
    ? undefined
    : {
        ...(promptTokens === undefined ? {} : { promptTokens }),
        ...(completionTokens === undefined ? {} : { completionTokens }),
        ...(totalTokens === undefined ? {} : { totalTokens }),
      };
  const failover = parseStudioServerAiFailoverMetadata(
    value.failover,
    { provider: actualProvider, model },
  );
  const requestId = text(value.requestId, 240);
  return {
    content,
    provider: actualProvider,
    model,
    ...(requestId ? { requestId } : {}),
    ...(usage ? { usage } : {}),
    ...(failover ? { failover } : {}),
  };
}

function httpErrorCode(error: unknown): string | undefined {
  if (isAppApiError(error)) return error.code ?? undefined;
  if (!(error instanceof HTTPError) || !isRecord(error.data)) return undefined;
  return typeof error.data.code === "string" ? error.data.code : undefined;
}

const PERSONAL_FALLBACK_CODES = new Set([
  "FREE_AI_POOL_EXHAUSTED",
  "FREE_AI_POOL_UNAVAILABLE",
  // 서버 고성능 경로가 추론 전에 거절됐고 이어 갈 무료 경로도 없을 때. 아직 쓰지 않은 내 키가 있으면 그쪽으로 간다.
  "PREMIUM_AI_UNAVAILABLE",
  "USER_AI_CONNECTION_REQUIRED",
]);

function loginRequiredMessage(): string {
  return aiErrorText("studio.aiError.server.loginRequired", "로그인하면 자동 무료 AI를 바로 사용할 수 있어요. 현재 입력은 그대로 유지됩니다. 로그인하지 않으려면 통합 AI 설정에서 개인 무료 API 키를 연결하세요.");
}

function exhaustedMessage(): string {
  return aiErrorText("studio.aiError.server.poolExhausted", "현재 사용할 수 있는 자동 무료 AI와 개인 무료 키의 한도가 모두 소진됐어요. 통합 AI 설정에서 다른 무료 경로를 연결하거나 한도가 갱신된 뒤 다시 시도해 주세요.");
}

interface PersonalTextAttempt {
  readonly result: StudioServerAiResult<StudioServerAiCompletion>;
  /** 모든 내 키가 인증에서 거절됐다. 추론 전 확정 거절이라 다음 경로로 넘겨도 중복 생성이 없다. */
  readonly authenticationRejected: boolean;
  /** 답이 출력 상한에 걸려 잘렸다(무료 키 안전 상한). 다음 경로가 있으면 그쪽에서 온전한 답을 받는다. */
  readonly truncated: boolean;
}

async function attemptPersonalText(
  input: { system: string; user: string },
  operationId: string,
  signal: AbortSignal | undefined,
  connections: readonly UserAiResolvedConnection[],
): Promise<PersonalTextAttempt> {
  const result = await completeWithUserTextKey(input.system, input.user, signal, { connections });
  if (!result.ok) {
    if (["not-configured", "quota-exhausted", "all-free-exhausted"].includes(result.code)) {
      return { result: { ok: false, code: "free_exhausted", error: exhaustedMessage() }, authenticationRejected: false, truncated: false };
    }
    return {
      result: { ok: false, code: "http_error", error: result.error },
      authenticationRejected: result.code === "authentication",
      // 답이 출력 상한에 걸려 비었다(추론 모델이 생각에 상한을 다 썼다). 쓸 내용이 없으니 다음 경로로 넘긴다.
      truncated: result.truncated === true,
    };
  }
  return {
    result: {
      ok: true,
      data: {
        content: result.content,
        provider: "user",
        model: result.model,
        requestId: `byok:${operationId}`.slice(0, 240),
      },
    },
    authenticationRejected: false,
    truncated: result.truncated,
  };
}

export async function completeStudioServerText(
  input: {
    task: StudioServerAiTask;
    provider?: StudioServerAiProviderPreference;
    promptVersion: 1;
    system: string;
    user: string;
    operationId?: string;
  },
  signal?: AbortSignal,
): Promise<StudioServerAiResult<StudioServerAiCompletion>> {
  const operationId = canonicalStudioServerAiOperationId(input.operationId);
  if (!operationId) {
    return { ok: false, code: "invalid_input", error: aiErrorText("studio.aiError.server.invalidOperationId", "AI 요청 식별자가 올바르지 않아요.") };
  }
  const { operationId: _operationId, ...requestInput } = input;
  const configuration = getUserAiSnapshot().configuration;
  const routing = userAiRoutingSettings(configuration);
  // 자동 경로에 쓸 수 있는 내 키 전체와, 그중 ToonStudio AI보다 먼저 쓰는 키(무료 키 + "유료 키 먼저"에 동의한 유료 키).
  const personalRoutes = userAiAutomaticExternalConnectionsForCapability("text");
  const personalFirstRoutes = userAiPersonalFirstConnectionsForCapability("text");
  const explicitServerProvider = input.provider && input.provider !== "auto";
  // 등록한 내 키가 있으면 내 키를 먼저 쓴다(자동·고정 모드). 내 키가 없거나 확정적으로 거절되면
  // ToonStudio AI(운영 고성능 → 무료 순)로 간다. "내가 정한 순서"에서는 사용자가 정한 앞뒤를 따른다.
  // "무료 경로가 끝나면 유료 키"에 동의한 유료 키는 ToonStudio AI 다음의 대체 경로로만 쓴다.
  const personalFirst = !explicitServerProvider && personalRoutesRunFirst(routing, personalFirstRoutes);
  const attemptedRouteIds = new Set<string>();
  // 자동 모드에서 내 키가 인증에서 거절됐거나 출력 상한에 걸린 빈 답을 내 ToonStudio AI로 넘겼다면, 그쪽도 쓸 수 없을 때는
  // 사용자가 손쓸 수 있는 내 키 쪽 이유를 알린다(일반 소진 문구로 덮지 않는다).
  let personalRejection: StudioServerAiResult<StudioServerAiCompletion> | null = null;
  // 내 무료 키의 답이 출력 상한에 걸려 잘렸으면 ToonStudio AI에서 온전한 답을 받고, 그쪽이 안 되면 잘린 답이라도 돌려준다.
  let truncatedPersonal: StudioServerAiResult<StudioServerAiCompletion> | null = null;
  if (personalFirst) {
    for (const route of personalFirstRoutes) attemptedRouteIds.add(route.routeId);
    const attempt = await attemptPersonalText(input, operationId, signal, personalFirstRoutes);
    if (attempt.result.ok) {
      if (!attempt.truncated || routing.mode === "manual" || signal?.aborted) return attempt.result;
      truncatedPersonal = attempt.result;
    } else {
      // 자동·"내가 정한 순서" 모두, 한도 소진·모든 키의 인증 거절(추론 전 확정 거절)·출력 상한에 걸린 빈 답이면 다음 경로로 넘긴다.
      const handOff = attempt.result.code === "free_exhausted" || attempt.authenticationRejected || attempt.truncated;
      if (routing.mode === "manual" || !handOff) return attempt.result;
      if (attempt.authenticationRejected || attempt.truncated) personalRejection = attempt.result;
    }
  }
  // 서버 경로를 쓸 수 없을 때 아직 쓰지 않은 내 키(대체 경로로 둔 유료 키 포함)로 이어 간다.
  const completeWithRemainingPersonal = async () => {
    const remaining = personalRoutes.filter((route) => !attemptedRouteIds.has(route.routeId));
    if (remaining.length === 0) return null;
    for (const route of remaining) attemptedRouteIds.add(route.routeId);
    return (await attemptPersonalText(input, operationId, signal, remaining)).result;
  };
  const request = {
    ...requestInput,
    ...(!explicitServerProvider ? { providerOrder: routing.serverProviderOrder } : {}),
  };
  try {
    const raw = await api.post<unknown>("/studio-ai/chat", request, {
      signal,
      headers: { "Idempotency-Key": operationId },
      timeout: STUDIO_SERVER_AI_TIMEOUT_MS,
      totalTimeout: STUDIO_SERVER_AI_TIMEOUT_MS + 5_000,
    });
    const data = parseStudioServerAiCompletion(raw);
    if (data) return { ok: true, data };
    return truncatedPersonal
      ?? { ok: false, code: "parse_error", error: aiErrorText("studio.aiError.server.responseFormatUnconfirmed", "자동 무료 AI 응답 형식을 확인하지 못했어요.") };
  } catch (error) {
    if (truncatedPersonal) return truncatedPersonal;
    const code = httpErrorCode(error);
    if (code === "FREE_AI_LOGIN_REQUIRED") {
      const personalResult = await completeWithRemainingPersonal();
      if (personalResult && (personalResult.ok || personalResult.code !== "free_exhausted")) return personalResult;
      if (personalRejection) return personalRejection;
      return { ok: false, code: "login_required", error: loginRequiredMessage() };
    }
    if (code && PERSONAL_FALLBACK_CODES.has(code)) {
      const personalResult = await completeWithRemainingPersonal();
      if (personalResult && (personalResult.ok || personalResult.code !== "free_exhausted")) return personalResult;
      if (personalRejection) return personalRejection;
      // 고성능 경로가 잠시 쓸 수 없을 뿐이면(한도 소진이 아니다) "잠시 후 다시 시도·내 키 연결"을 안내한다.
      // 503은 공통 오류 문구("일부 온라인 기능…")로 바뀌므로 서버 문구 대신 같은 뜻의 사전 문구를 쓴다.
      if (code === "PREMIUM_AI_UNAVAILABLE") {
        return {
          ok: false,
          code: "http_error",
          error: aiErrorText("studio.aiError.server.premiumUnavailable", "ToonStudio 고성능 AI를 지금 쓸 수 없어요. 잠시 후 다시 시도하거나 통합 AI 설정에서 내 API 키를 연결하세요."),
        };
      }
      return { ok: false, code: "free_exhausted", error: exhaustedMessage() };
    }
    if (signal?.aborted) {
      return {
        ok: false,
        code: "network_error",
        error: aiErrorText("studio.aiError.server.requestCancelledNoRetry", "AI 요청이 취소되었습니다. 같은 요청을 다른 공급자로 자동 재전송하지 않았습니다."),
      };
    }
    return {
      ok: false,
      code: code === "FREE_AI_POOL_EXHAUSTED" ? "free_exhausted" : "http_error",
      error: await getApiErrorMessage(error, aiErrorText("studio.aiError.server.requestFailed", "자동 무료 AI 요청에 실패했어요.")),
    };
  }
}

let automaticAssistantOperationSequence = 0;

function nextAutomaticAssistantOperationId(): string {
  automaticAssistantOperationSequence += 1;
  const entropy = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${automaticAssistantOperationSequence.toString(36)}`;
  return `assistant-${entropy}-${automaticAssistantOperationSequence.toString(36)}`.slice(0, 128);
}

/**
 * Site-wide text helper used outside the editor's tracked operation timeline.
 * It still follows the same shared-free -> personal-free -> unavailable chain.
 */
export function completeAutomaticFreeText(
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<StudioServerAiResult<StudioServerAiCompletion>> {
  return completeStudioServerText({
    task: "assistant",
    promptVersion: 1,
    system,
    user,
    operationId: nextAutomaticAssistantOperationId(),
  }, signal);
}
