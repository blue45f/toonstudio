import { rejectUnavailableServerAi, sharedFreeAiPoolEnabled } from "../../config/user-funded-ai-policy";
import { studioAiCapabilityStatuses } from "./studio-ai-capabilities";

import {
  BadRequestException,
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Optional,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";

import {
  BackendCapabilityGatewayDispatcher,
  type BackendCapabilityGatewayDispatchResult,
} from "../../platform/adapters/backend-capabilities/backend-capability-gateway-dispatcher";

import {
  buildStudioAiChatExchange,
  buildStudioAiMessagesExchange,
  recordedTokenCount,
  studioAiMessagesCandidates,
  TASK_SPECS,
  type ProviderPayload,
  type StudioAiCompletionResult,
  type StudioAiExchange,
} from "./studio-ai-exchange";
import {
  STUDIO_AI_ADMISSION_GATE,
  STUDIO_AI_LEASE_GRACE_MS,
  STUDIO_AI_RATE_LIMIT_REQUESTS,
  STUDIO_AI_RATE_LIMIT_WINDOW_MS,
} from "./studio-ai-admission";
import {
  parseStudioAiIdempotencyKey,
  studioAiCanonicalMessagesRequestHash,
  studioAiCanonicalRequestHash,
  studioAiUserIdempotencyKeyHash,
} from "./studio-ai-idempotency";
import {
  STUDIO_AI_PREMIUM_BUDGET_STORE,
  studioAiPremiumBudgetAllows,
  type StudioAiPremiumBudgetStore,
} from "./studio-ai-premium-budget";
import { resolveStudioAiPremiumConfig } from "./studio-ai-premium-config";
import { studioAiPremiumBudgetFailure } from "./studio-ai-premium-failure";
import {
  classifyStudioAiProviderFailure,
  resolveStudioAiProviderCandidates,
  resolveStudioAiProviders,
  resolveStudioAiProviderOrder,
  resolveStudioAiTimeoutMs,
  STUDIO_AI_BILLING_FAILOVER_REASON,
  STUDIO_AI_FREE_QUOTA_FAILOVER_REASON,
  STUDIO_AI_PREMIUM_FAILOVER_REASON,
  STUDIO_AI_PREMIUM_PROVIDER_ID,
  studioAiPremiumErrorType,
  studioAiProviderRequestId,
  studioAiProviderStatuses,
} from "./studio-ai-provider";
import {
  studioAiMessagesHasImages,
  type StudioAiMessagesRequest,
} from "./studio-ai-messages.dto";
import {
  resolveStudioAiQuotaLimits,
  STUDIO_AI_USAGE_STORE,
} from "./studio-ai-usage";
import { beginStudioAiCreditCharge, settleStudioAiCreditCharge, STUDIO_AI_CREDIT_WALLET, PAID_OPERATIONS_SETTING_STORE, type StudioAiCreditCharge, type StudioAiCreditWallet, type PaidOperationsSettingStore } from "./studio-ai-credit-charge";

import type {
  StudioAiAdmissionGate,
  StudioAiAdmissionLease,
  StudioAiAdmissionReceipt,
  StudioAiIdempotencyConflictReason,
  StudioAiReceiptMutationInput,
} from "./studio-ai-admission";
import type {
  StudioAiFailoverReason,
  StudioAiProviderConfig,
  StudioAiProviderId,
} from "./studio-ai-provider";
import type {
  StudioAiTokenUsage,
  StudioAiUsageStatus,
  StudioAiUsageStore,
} from "./studio-ai-usage";
import type { StudioAiChatDto } from "./studio-ai.dto";

const CLIENT_CLOSED_REQUEST_STATUS = 499;
const STUDIO_AI_GATEWAY_WORKLOAD = "webhook" as const;
const STUDIO_AI_GATEWAY_CAPABILITY = "async-job" as const;

function toGatewayTenantId(userKeyHash: Uint8Array): string {
  return Buffer.from(userKeyHash).toString("hex");
}

function fallbackSafeGatewayDispatch(
  dispatchResult: BackendCapabilityGatewayDispatchResult
): boolean {
  if (dispatchResult.ok) {
    return dispatchResult.outcome !== "completed" && dispatchResult.outcome !== "duplicate";
  }
  if (dispatchResult.reason === "aborted" || dispatchResult.reason === "delivery-unknown") {
    return false;
  }
  if (
    dispatchResult.attempts.length > 0 &&
    dispatchResult.attempts.some((attempt) => attempt.outcome !== "request-rejected")
  ) {
    return false;
  }
  return true;
}

function normalizeGatewayUsage(usage: unknown): StudioAiTokenUsage {
  if (!usage || typeof usage !== "object") {
    return {};
  }
  const value = usage as Record<string, unknown>;
  const promptTokens = recordedTokenCount(value.promptTokens);
  const completionTokens = recordedTokenCount(value.completionTokens);
  const totalTokens = recordedTokenCount(value.totalTokens);
  if (
    promptTokens !== undefined ||
    completionTokens !== undefined ||
    totalTokens !== undefined
  ) {
    return {
      promptTokens,
      completionTokens,
      totalTokens,
    };
  }
  const legacyPromptTokens = recordedTokenCount(value.prompt_tokens);
  const legacyCompletionTokens = recordedTokenCount(value.completion_tokens);
  const legacyTotalTokens = recordedTokenCount(value.total_tokens);
  return {
    ...(legacyPromptTokens !== undefined ? { promptTokens: legacyPromptTokens } : {}),
    ...(legacyCompletionTokens !== undefined
      ? { completionTokens: legacyCompletionTokens }
      : {}),
    ...(legacyTotalTokens !== undefined ? { totalTokens: legacyTotalTokens } : {}),
  };
}

function normalizeGatewayResult(
  payload: unknown,
  fallbackProvider: StudioAiProviderConfig
): StudioAiCompletionResult | null {
  if (!payload || typeof payload !== "object") return null;
  const object = payload as Record<string, unknown>;
  const content = typeof object.content === "string" && object.content.trim().length > 0
    ? object.content.trim()
    : "";
  if (!content) return null;
  const providerValue = typeof object.provider === "string" ? object.provider : undefined;
  const modelValue = typeof object.model === "string" ? object.model : "";
  const requestId = typeof object.requestId === "string" && object.requestId.trim()
    ? object.requestId.trim().slice(0, 240)
    : typeof object.request_id === "string" && object.request_id.trim()
      ? object.request_id.trim().slice(0, 240)
      : undefined;
  const rawFailover = object.failover;
  const failover = isStudioAiDistributedFailover(rawFailover)
    ? {
        attemptedProvider: rawFailover.attemptedProvider,
        attemptedModel: rawFailover.attemptedModel,
        actualProvider: rawFailover.actualProvider,
        actualModel: rawFailover.actualModel,
        reason: rawFailover.reason as StudioAiFailoverReason,
      }
    : undefined;
  const normalizedProvider: StudioAiProviderId = isStudioAiProviderId(providerValue)
    ? providerValue
    : fallbackProvider.id;
  const model = modelValue || fallbackProvider.model;
  return {
    content,
    provider: normalizedProvider,
    model: model.slice(0, 200),
    ...(requestId ? { requestId } : {}),
    usage: normalizeGatewayUsage(object.usage),
    ...(failover ? { failover } : {}),
  };
}

function isStudioAiDistributedFailover(
  value: unknown
): value is {
  attemptedProvider: StudioAiProviderId;
  attemptedModel: string;
  actualProvider: StudioAiProviderId;
  actualModel: string;
  reason: string;
} {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.attemptedProvider === "string" &&
    isStudioAiProviderId(raw.attemptedProvider) &&
    typeof raw.attemptedModel === "string" &&
    typeof raw.actualProvider === "string" &&
    isStudioAiProviderId(raw.actualProvider) &&
    typeof raw.actualModel === "string" &&
    (raw.reason === STUDIO_AI_FREE_QUOTA_FAILOVER_REASON
      || raw.reason === STUDIO_AI_BILLING_FAILOVER_REASON
      || raw.reason === STUDIO_AI_PREMIUM_FAILOVER_REASON)
  );
}

function isStudioAiProviderId(value: string | undefined): value is StudioAiProviderId {
  return value === "gemini"
    || value === "qwen"
    || value === "groq"
    || value === "sambanova"
    || value === "zai"
    || value === "mistral"
    || value === "cloudflare"
    || value === "openrouter"
    || value === "siliconflow"
    || value === "deepseek"
    || value === "anthropic";
}

function providerFailure(
  provider: StudioAiProviderConfig,
  responseStatus: number,
  payload?: unknown
): {
  status: StudioAiUsageStatus;
  exception: HttpException;
  billingFailoverEligible: boolean;
  failoverReason?: StudioAiFailoverReason;
  freeQuotaExhausted: boolean;
  definitivelyRejectedBeforeInference: boolean;
} {
  const classification = classifyStudioAiProviderFailure(
    provider.id,
    responseStatus,
    payload,
    provider.freePool,
  );
  if (classification.kind === "premium_budget_exhausted") {
    return studioAiPremiumBudgetFailure();
  }
  if (classification.kind === STUDIO_AI_PREMIUM_FAILOVER_REASON) {
    return {
      status: "provider_rate_limited",
      exception: new ServiceUnavailableException({
        code: "PREMIUM_AI_UNAVAILABLE",
        message: "ToonStudio 고성능 AI를 지금 쓸 수 없어요. 잠시 후 다시 시도하거나 통합 AI 설정에서 내 API 키를 연결하세요.",
        settingsHref: "/settings/ai",
      }),
      billingFailoverEligible: true,
      failoverReason: STUDIO_AI_PREMIUM_FAILOVER_REASON,
      freeQuotaExhausted: false,
      definitivelyRejectedBeforeInference: true,
    };
  }
  if (
    classification.kind === STUDIO_AI_FREE_QUOTA_FAILOVER_REASON
    || classification.kind === STUDIO_AI_BILLING_FAILOVER_REASON
  ) {
    return {
      status: "provider_rate_limited",
      exception: new HttpException(
        {
          code: classification.kind === STUDIO_AI_FREE_QUOTA_FAILOVER_REASON
            ? "FREE_AI_PROVIDER_QUOTA_EXHAUSTED"
            : "AI_BILLING_QUOTA_EXHAUSTED",
          message: classification.kind === STUDIO_AI_FREE_QUOTA_FAILOVER_REASON
            ? "이 무료 AI 제공자의 사용량이 소진됐습니다. 다음 무료 제공자를 확인합니다."
            : "AI 제공자의 잔액 또는 패키지 사용 한도가 소진됐어요.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
      billingFailoverEligible: true,
      failoverReason: classification.failoverReason,
      freeQuotaExhausted: classification.kind === STUDIO_AI_FREE_QUOTA_FAILOVER_REASON,
      definitivelyRejectedBeforeInference: true,
    };
  }
  if (classification.kind === "rate_limited") {
    return {
      status: "provider_rate_limited",
      exception: new HttpException(
        "AI 제공자의 동시 호출 또는 요청 속도 한도에 도달했어요. 잠시 후 다시 시도해 주세요.",
        HttpStatus.TOO_MANY_REQUESTS
      ),
      billingFailoverEligible: false,
      freeQuotaExhausted: false,
      definitivelyRejectedBeforeInference: true,
    };
  }
  if (classification.kind === "authentication" || responseStatus === 402) {
    return {
      status: "provider_error",
      exception: new ServiceUnavailableException(
        "서버 AI 인증 또는 결제 설정을 확인하고 있어요. 내 API 키 연동을 이용해 주세요."
      ),
      billingFailoverEligible: false,
      freeQuotaExhausted: false,
      definitivelyRejectedBeforeInference: true,
    };
  }
  if (classification.kind === "provider_unavailable") {
    return {
      status: "provider_error",
      exception: new ServiceUnavailableException(
        "AI 제공자가 일시적으로 응답하지 않아요. 잠시 후 다시 시도해 주세요."
      ),
      billingFailoverEligible: false,
      freeQuotaExhausted: false,
      definitivelyRejectedBeforeInference: false,
    };
  }
  return {
    status: "provider_error",
    exception: new BadGatewayException(
      "AI 제공자가 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
    ),
    billingFailoverEligible: false,
    freeQuotaExhausted: false,
    definitivelyRejectedBeforeInference: responseStatus < 500,
  };
}

const PREMIUM_REJECTION_WARN_INTERVAL_MS = 10 * 60_000;
const premiumRejectionWarnedAt = new Map<string, number>();

/**
 * 운영 프리미엄 경로가 추론 전에 거절돼 무료 풀로 넘어갔음을 운영자가 알 수 있게 남긴다(워크스페이스 지정 누락·권한·
 * 모델 없음·한도 등). 사용자는 무료 풀 결과를 받으므로 조용히 묻히기 쉽다. 같은 원인은 10분에 한 번만 남기고,
 * 키·요청·응답 본문은 남기지 않는다.
 */
function warnPremiumRejectedBeforeInference(status: number, payload: unknown, now = Date.now()): void {
  const errorType = studioAiPremiumErrorType(payload) ?? "unknown";
  const key = `${status}:${errorType}`;
  const last = premiumRejectionWarnedAt.get(key);
  if (last !== undefined && now - last < PREMIUM_REJECTION_WARN_INTERVAL_MS) return;
  premiumRejectionWarnedAt.set(key, now);
  console.warn("[studio-ai] premium route rejected before inference; continuing with the free pool", { status, errorType });
}

const MAX_PROVIDER_ERROR_BODY_LENGTH = 16_384;

async function safeProviderErrorPayload(response: Response): Promise<unknown> {
  try {
    const body = await response.text();
    if (body.length === 0 || body.length > MAX_PROVIDER_ERROR_BODY_LENGTH) return undefined;
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

type RequestAbortSource = "client" | "timeout";

function clientClosedRequestException(): HttpException {
  return new HttpException("AI 요청 연결이 종료됐어요.", CLIENT_CLOSED_REQUEST_STATUS);
}

function timeoutException(): GatewayTimeoutException {
  return new GatewayTimeoutException("AI 응답 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.");
}

function usageLedgerUnavailableException(): ServiceUnavailableException {
  return new ServiceUnavailableException("서버 AI 사용량 확인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.");
}

function dailyQuotaExceededException(): HttpException {
  return new HttpException(
    {
      code: "FREE_AI_POOL_EXHAUSTED",
      message: "오늘의 자동 무료 AI 사용량이 모두 소진되었습니다. 개인 무료 API 키를 입력하거나 UTC 자정 이후 다시 시도하세요.",
      settingsHref: "/settings/ai",
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

function admissionUnavailableException(): ServiceUnavailableException {
  return new ServiceUnavailableException(
    "서버 AI 요청 보호 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
  );
}

function admissionRateLimitException(): HttpException {
  return new HttpException(
    "AI 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
    HttpStatus.TOO_MANY_REQUESTS
  );
}

function admissionBusyException(): HttpException {
  return new HttpException(
    "이미 처리 중인 서버 AI 요청이 있어요. 완료된 뒤 다시 시도해 주세요.",
    HttpStatus.TOO_MANY_REQUESTS
  );
}

function invalidIdempotencyKeyException(): BadRequestException {
  return new BadRequestException(
    "AI 작업 식별자가 없거나 올바르지 않아요. 페이지를 새로고침한 뒤 다시 시도해 주세요."
  );
}

function idempotencyConflictException(reason: StudioAiIdempotencyConflictReason): HttpException {
  if (reason === "request_admitted" || reason === "request_sent") {
    return new HttpException(
      "같은 AI 작업이 이미 처리 중이에요. 완료 상태를 확인한 뒤 다시 시도해 주세요.",
      425
    );
  }
  if (reason === "key_reused_with_different_request") {
    return new HttpException(
      "같은 AI 작업 식별자를 다른 요청에 재사용할 수 없어요.",
      HttpStatus.CONFLICT
    );
  }
  if (reason === "request_ambiguous") {
    return new HttpException(
      "이 AI 작업은 공급자 처리 여부를 확인 중이라 재전송하지 않았어요. 새 과금 방지를 위해 잠시 후 작업 기록을 확인해 주세요.",
      HttpStatus.CONFLICT
    );
  }
  return new HttpException(
    "이 AI 작업은 이미 공급자에서 완료되어 재전송하지 않았어요.",
    HttpStatus.CONFLICT
  );
}

type StudioAiReceiptOutcome = "not_sent" | "safe_rejection" | "ambiguous" | "succeeded";

@Injectable()
export class StudioAiService {
  constructor(
    @Inject(STUDIO_AI_USAGE_STORE)
    private readonly usageStore: StudioAiUsageStore,
    @Inject(STUDIO_AI_ADMISSION_GATE)
    private readonly admissionGate: StudioAiAdmissionGate,
    @Optional() @Inject(BackendCapabilityGatewayDispatcher) private readonly capabilityDispatcher: BackendCapabilityGatewayDispatcher | null = null,
    @Optional() @Inject(STUDIO_AI_CREDIT_WALLET) private readonly creditWallet: StudioAiCreditWallet | null = null,
    @Optional() @Inject(PAID_OPERATIONS_SETTING_STORE) private readonly paidOperationsStore: PaidOperationsSettingStore | null = null,
    @Optional() @Inject(STUDIO_AI_PREMIUM_BUDGET_STORE) private readonly premiumBudget: StudioAiPremiumBudgetStore | null = null
  ) {}

  status() {
    const premium = resolveStudioAiPremiumConfig();
    const premiumStatus = {
      configured: premium.configured,
      automatic: premium.automatic,
      model: premium.configured ? premium.model : "",
      userDailyRequestLimit: premium.limits.userDailyRequests,
    };
    if (!sharedFreeAiPoolEnabled() && !premium.configured) return {
      configured: false, provider: "none" as const, model: "", providers: [],
      selection: { default: "auto" as const, order: [], fallback: false },
      capabilities: [], poolCapabilities: [], requiresAuth: true, operatorFunded: false, freePool: true, settingsHref: "/settings/ai",
      premium: premiumStatus,
    };
    const limits = resolveStudioAiQuotaLimits();
    const providers = studioAiProviderStatuses();
    const configuredProviders = resolveStudioAiProviders("auto");
    const preferred = configuredProviders[0];
    return {
      configured: configuredProviders.length > 0,
      provider: preferred?.id ?? "none",
      model: preferred?.model ?? "",
      providers,
      selection: {
        default: "auto" as const,
        order: [...(premium.automatic ? [STUDIO_AI_PREMIUM_PROVIDER_ID] : []), ...resolveStudioAiProviderOrder()],
        fallback: configuredProviders.length > 1,
        fallbackPolicy: preferred?.sponsored
          ? STUDIO_AI_PREMIUM_FAILOVER_REASON
          : preferred && !preferred.freePool
            ? STUDIO_AI_BILLING_FAILOVER_REASON
            : STUDIO_AI_FREE_QUOTA_FAILOVER_REASON,
        explicitPreferenceFallback: true,
      },
      capabilities: Object.keys(TASK_SPECS),
      poolCapabilities: studioAiCapabilityStatuses(),
      requiresAuth: true,
      // 운영 프리미엄 경로가 자동 1순위면 운영자가 비용을 낸다(사용자 크레딧 차감 없음).
      operatorFunded: premium.automatic,
      freePool: preferred ? preferred.freePool : true,
      premium: premiumStatus,
      quota: {
        enforced: true,
        timezone: "UTC" as const,
        failureMode: "closed" as const,
        dailyRequestLimit: limits.dailyRequests,
        dailyTokenLimit: limits.dailyTokens,
        globalDailyRequestLimit: limits.globalDailyRequests,
        globalDailyTokenLimit: limits.globalDailyTokens,
      },
    };
  }

  /**
   * 운영 프리미엄 경로를 이번 요청의 후보에 넣어도 되는지. 키·자동 설정·일일 예산·원장 준비를 모두 확인하고,
   * 예산을 확인하지 못하면 운영 비용을 열지 않고(fail-closed) 무료 풀로 진행한다. budgetExhausted는 오늘 예산을
   * 다 써서 닫았을 때만 참이라, 남은 후보가 없을 때 "준비 안 됨" 대신 "오늘 한도 소진"으로 알리는 데 쓴다.
   */
  private async premiumDecision(
    userId: string,
    preference: StudioAiChatDto["provider"] | "auto",
  ): Promise<{ readonly allowed: boolean; readonly budgetExhausted: boolean }> {
    const closed = { allowed: false, budgetExhausted: false };
    const premium = resolveStudioAiPremiumConfig();
    if (!premium.configured) return closed;
    const wanted = preference === STUDIO_AI_PREMIUM_PROVIDER_ID
      || ((preference ?? "auto") === "auto" && premium.automatic);
    if (!wanted || !this.premiumBudget) return closed;
    try {
      const usage = await this.premiumBudget.todayUsage(userId);
      const allowed = studioAiPremiumBudgetAllows(usage, premium.limits);
      // 원장이 아직 준비되지 않아 닫은 것은 한도 소진이 아니다(운영 설정 문제라 "준비 안 됨"으로 둔다).
      return { allowed, budgetExhausted: !allowed && usage.ledgerReady };
    } catch {
      return closed;
    }
  }

  async complete(
    userId: string,
    input: StudioAiChatDto,
    idempotencyKeyInput: string | undefined,
    clientSignal?: AbortSignal
  ) {
    rejectUnavailableServerAi(resolveStudioAiPremiumConfig().configured);
    let idempotencyKey: string;
    try {
      idempotencyKey = parseStudioAiIdempotencyKey(idempotencyKeyInput);
    } catch {
      throw invalidIdempotencyKeyException();
    }
    const identity = {
      userKeyHash: studioAiUserIdempotencyKeyHash(userId, idempotencyKey),
      requestHash: studioAiCanonicalRequestHash(input),
    };
    const providerPreference = input.provider ?? "auto";
    const premiumDecision = await this.premiumDecision(userId, providerPreference);
    const providers = resolveStudioAiProviderCandidates(
      providerPreference,
      process.env,
      input.providerOrder ?? [],
      { premiumAllowed: premiumDecision.allowed },
    );
    if (providers.length === 0) {
      if (premiumDecision.budgetExhausted) throw dailyQuotaExceededException();
      throw new ServiceUnavailableException({
        code: "FREE_AI_POOL_UNAVAILABLE",
        message: providerPreference === "auto"
          ? "자동 무료 AI가 아직 연결되지 않았습니다. 개인 무료 API 키를 입력하면 계속 사용할 수 있습니다."
          : "선택한 무료 AI 제공자가 준비되지 않았습니다. 자동 선택이나 개인 무료 API 키를 이용하세요.",
        settingsHref: "/settings/ai",
      });
    }
    const exchange = buildStudioAiChatExchange(userId, input, providers, (provider, call) => this.completeViaCapabilityBoundary(
      input, provider, call.reservedTokens, call.spec, call.anonymousUserId, idempotencyKey, call.tenantId, call.timeoutMs, call.clientSignal
    ));
    return this.runAdmitted(userId, identity, idempotencyKey, exchange, providers, clientSignal);
  }

  /**
   * 키 없이 쓰는 보조 기능 요청(이미지·구조화 출력 포함). 운영 프리미엄 경로를 먼저 쓰고, 추론 전에
   * 거절되거나 예산이 바닥나면 같은 요청을 처리할 수 있는 무료 제공자(이미지면 비전 모델)로 이어 간다.
   */
  async completeMessages(
    userId: string,
    input: StudioAiMessagesRequest,
    idempotencyKeyInput: string | undefined,
    clientSignal?: AbortSignal
  ) {
    rejectUnavailableServerAi(resolveStudioAiPremiumConfig().configured);
    let idempotencyKey: string;
    try {
      idempotencyKey = parseStudioAiIdempotencyKey(idempotencyKeyInput);
    } catch {
      throw invalidIdempotencyKeyException();
    }
    const identity = {
      userKeyHash: studioAiUserIdempotencyKeyHash(userId, idempotencyKey),
      requestHash: studioAiCanonicalMessagesRequestHash(input, idempotencyKey),
    };
    const premiumDecision = await this.premiumDecision(userId, "auto");
    const providers = studioAiMessagesCandidates(input, premiumDecision.allowed);
    if (providers.length === 0) {
      if (premiumDecision.budgetExhausted) throw dailyQuotaExceededException();
      throw new ServiceUnavailableException({
        code: "FREE_AI_POOL_UNAVAILABLE",
        message: studioAiMessagesHasImages(input)
          ? "이미지를 읽을 수 있는 자동 AI가 아직 준비되지 않았어요. 통합 AI 설정에서 내 API 키를 연결하면 바로 사용할 수 있어요."
          : "자동 AI가 아직 준비되지 않았어요. 통합 AI 설정에서 내 API 키를 연결하면 바로 사용할 수 있어요.",
        settingsHref: "/settings/ai",
      });
    }
    const exchange = buildStudioAiMessagesExchange(input, providers);
    const result = await this.runAdmitted(userId, identity, idempotencyKey, exchange, providers, clientSignal);
    if (!result.message) throw new BadGatewayException("AI 응답을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.");
    return {
      message: result.message,
      provider: result.provider,
      model: result.model,
      ...(result.requestId ? { requestId: result.requestId } : {}),
      ...(result.failover ? { failover: result.failover } : {}),
    };
  }

  /** admission 획득 → 처리 → lease 해제. 어떤 실패도 이미 낸 결과·원래 오류를 가리지 않는다. */
  private async runAdmitted(
    userId: string,
    identity: { userKeyHash: Uint8Array<ArrayBuffer>; requestHash: Uint8Array<ArrayBuffer> },
    idempotencyKey: string,
    exchange: StudioAiExchange,
    providers: readonly StudioAiProviderConfig[],
    clientSignal?: AbortSignal
  ): Promise<StudioAiCompletionResult> {
    const providerTimeoutMs = resolveStudioAiTimeoutMs(providers[0]?.id);
    const leaseMs = providerTimeoutMs + STUDIO_AI_LEASE_GRACE_MS;
    let admission: Awaited<ReturnType<StudioAiAdmissionGate["acquire"]>>;
    try {
      admission = await this.admissionGate.acquire({ userId, identity, requestLimit: STUDIO_AI_RATE_LIMIT_REQUESTS, windowMs: STUDIO_AI_RATE_LIMIT_WINDOW_MS, leaseMs });
    } catch {
      throw admissionUnavailableException();
    }
    if (admission.status === "rate_limited") throw admissionRateLimitException();
    if (admission.status === "busy") throw admissionBusyException();
    if (admission.status === "idempotency_conflict") {
      throw idempotencyConflictException(admission.reason);
    }

    let result: StudioAiCompletionResult | undefined;
    let failure: unknown;
    let failed = false;
    try {
      result = await this.completeAdmitted(
        userId,
        idempotencyKey,
        exchange,
        providers,
        admission.lease,
        admission.receipt,
        providerTimeoutMs,
        leaseMs,
        clientSignal
      );
    } catch (error) {
      failed = true;
      failure = error;
    } finally {
      try {
        await this.admissionGate.release({ userId, token: admission.lease.token, fence: admission.lease.fence });
      } catch {
        // Do not hide an already-paid result or original provider failure: a retry could duplicate
        // billing. The exact hash/fence cannot clear a newer lease, and this lease expires in DB.
      }
    }
    if (failed) throw failure;
    if (!result) throw new BadGatewayException("AI 응답을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.");
    return result;
  }

  private async completeViaCapabilityBoundary(
    input: StudioAiChatDto,
    provider: StudioAiProviderConfig,
    reservedTokens: number,
    spec: {
      temperature: number;
      maxTokens: number;
      responseFormat: "json" | "text";
    },
    anonymousUserId: string | undefined,
    idempotencyKey: string,
    tenantId: string,
    providerTimeoutMs: number,
    clientSignal?: AbortSignal
  ): Promise<StudioAiCompletionResult | null> {
    if (!this.capabilityDispatcher) return null;

    const payload = {
      operation: "studio-ai-chat",
      capability: "studio-ai-chat",
      tenant: tenantId,
      provider: provider.id,
      modelHint: provider.model,
      temperature: spec.temperature,
      maxTokens: spec.maxTokens,
      responseFormat: spec.responseFormat,
      task: input.task,
      system: input.system,
      user: input.user,
      anonymousUserId: anonymousUserId ?? null,
      requestKey: idempotencyKey,
    };
    const dispatchResult = await this.capabilityDispatcher.dispatch(
      {
        tenantId,
        capability: STUDIO_AI_GATEWAY_CAPABILITY,
        workload: STUDIO_AI_GATEWAY_WORKLOAD,
        estimatedCostUnits: Math.max(1, reservedTokens),
        estimatedDurationMs: providerTimeoutMs,
        durability: "best-effort",
        idempotencyKey,
        idempotent: true,
        payload,
      },
      { signal: clientSignal }
    );
    if (dispatchResult.ok) {
      if (
        dispatchResult.outcome !== "completed" &&
        dispatchResult.outcome !== "duplicate"
      ) {
        throw new ServiceUnavailableException(
          "AI 분산 호출이 즉시 완료 응답을 반환하지 않았어요. 잠시 후 다시 시도해 주세요."
        );
      }
      if (dispatchResult.result === null) {
        throw new BadGatewayException("AI 분산 경로 응답을 해석할 수 없었어요.");
      }
      const result = normalizeGatewayResult(dispatchResult.result, provider);
      if (!result) {
        throw new BadGatewayException("AI 분산 경로 응답을 해석할 수 없었어요.");
      }
      return result;
    }

    if (fallbackSafeGatewayDispatch(dispatchResult)) return null;

    if (dispatchResult.reason === "delivery-unknown") {
      throw new ServiceUnavailableException(
        "AI 분산 경로에서 처리 불일치가 발생했어요. 잠시 후 다시 시도해 주세요."
      );
    }
    if (dispatchResult.reason === "aborted") {
      throw clientClosedRequestException();
    }
    throw new ServiceUnavailableException(
      "AI 분산 경로 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요."
    );
  }

  private async completeAdmitted(
    userId: string,
    idempotencyKey: string,
    exchange: StudioAiExchange,
    providers: readonly StudioAiProviderConfig[],
    admissionLease: StudioAiAdmissionLease,
    admissionReceipt: StudioAiAdmissionReceipt,
    providerTimeoutMs: number,
    leaseMs: number,
    clientSignal?: AbortSignal
  ) {
    const receiptMutation: StudioAiReceiptMutationInput = {
      userId,
      ...admissionReceipt,
    };
    const abandonBeforeSend = async () => {
      try {
        await this.admissionGate.abandonBeforeSend(receiptMutation);
      } catch {
        // The short admitted expiry remains a conservative replay block if cleanup storage fails.
      }
    };
    const startedAt = new Date();
    const reservedTokens = exchange.reservedTokens;
    let reservation: Awaited<ReturnType<StudioAiUsageStore["reserve"]>>;
    try {
      reservation = await this.usageStore.reserve({ userId, reservedTokens, limits: resolveStudioAiQuotaLimits() });
    } catch {
      await abandonBeforeSend();
      throw usageLedgerUnavailableException();
    }
    if (!reservation.allowed) {
      await abandonBeforeSend();
      throw dailyQuotaExceededException();
    }

    // Quota reservation may wait on the service-wide daily row. Reset the fenced lease only after
    // that wait, immediately before the upstream timeout begins, so admission time cannot consume
    // the paid-call concurrency budget. The exact identity permits an expired-but-unreplaced lease
    // to recover, while a newer fence fails closed without sending the prompt.
    let renewedLease: StudioAiAdmissionLease | null = null;
    try {
      renewedLease = await this.admissionGate.renew({ userId, token: admissionLease.token, fence: admissionLease.fence, leaseMs });
    } catch {
      // Normalize storage failures below after releasing the already-reserved token budget.
    }
    if (!renewedLease) {
      const finishedAt = new Date(Math.max(Date.now(), startedAt.getTime()));
      let ledgerFailed = false;
      try {
        await this.usageStore.finalize({
          userId,
          usageDay: reservation.usageDay,
          reservedTokens,
          task: exchange.task,
          provider: providers[0].id,
          model: providers[0].model,
          attemptCount: 1,
          status: "network_error",
          // No provider request was sent. Make the zero charge explicit so conservative fallback
          // accounting does not consume the full token reservation during fenced admission loss.
          usage: { totalTokens: 0 },
          startedAt,
          finishedAt,
        });
      } catch {
        ledgerFailed = true;
      }
      await abandonBeforeSend();
      if (ledgerFailed) throw usageLedgerUnavailableException();
      throw admissionUnavailableException();
    }

    // 운영자 부담 제공자가 후보에 있을 때만 크레딧을 예약한다. 무료 풀만이면
    // 예약 없이 진행하고, 예약 실패(잔액·한도)는 AI 호출 전에 차단한다.
    let creditCharge: StudioAiCreditCharge;
    try {
      creditCharge = await beginStudioAiCreditCharge(this.creditWallet, { userId, task: exchange.task, idempotencyKey, providers }, this.paidOperationsStore ?? undefined);
    } catch (error) {
      await abandonBeforeSend();
      throw error;
    }

    const upstreamController = new AbortController();
    let abortSource: RequestAbortSource | undefined;
    let outcomeStatus: StudioAiUsageStatus = "network_error";
    let usage: StudioAiTokenUsage = {};
    let result: StudioAiCompletionResult | undefined;
    let failure: unknown;
    let failed = false;
    let ledgerProvider: StudioAiProviderConfig = providers[0];
    let attemptCount = 0;
    let failoverSource: StudioAiProviderConfig | undefined;
    let failoverReason: StudioAiFailoverReason | undefined;
    let receiptOutcome: StudioAiReceiptOutcome = "not_sent";

    const abortFromClient = () => {
      if (upstreamController.signal.aborted) return;
      abortSource = "client";
      upstreamController.abort();
    };
    const abortFromTimeout = () => {
      if (upstreamController.signal.aborted) return;
      abortSource = "timeout";
      upstreamController.abort();
    };
    const cancellation = (): { exception: HttpException; status: StudioAiUsageStatus } | undefined => {
      if (abortSource === "timeout") return { exception: timeoutException(), status: "timeout" };
      if (abortSource === "client" || clientSignal?.aborted) {
        return { exception: clientClosedRequestException(), status: "client_aborted" };
      }
      return undefined;
    };
    const throwIfCancelled = () => {
      const cancellationResult = cancellation();
      if (!cancellationResult) return;
      outcomeStatus = cancellationResult.status;
      throw cancellationResult.exception;
    };

    clientSignal?.addEventListener("abort", abortFromClient, { once: true });
    if (clientSignal?.aborted) abortFromClient();
    const timer = setTimeout(abortFromTimeout, providerTimeoutMs);

    try {
      throwIfCancelled();
      let lastProviderFailure: HttpException | undefined;
      for (let index = 0; index < providers.length; index += 1) {
        throwIfCancelled();
        const provider = providers[index];
        ledgerProvider = provider;
        attemptCount = index + 1;
        usage = {};
        const hasFallback = index < providers.length - 1;

        let sent = false;
        try {
          sent = await this.admissionGate.markSent(receiptMutation);
        } catch {
          // Storage authority is required before every provider attempt.
        }
        if (!sent) throw admissionUnavailableException();
        // From this exact point onward, any non-definitive outcome may already have been billed.
        receiptOutcome = "ambiguous";

        // 고성능 경로(Messages API)와 보조 기능 요청은 분산 게이트웨이가 그 페이로드를 이해하는지
        // 확인되지 않았다. 교환 방식이 게이트웨이를 주지 않으면 직접 fetch 경로만 쓴다.
        const tenantId = toGatewayTenantId(admissionReceipt.userKeyHash);
        let distributedResult: StudioAiCompletionResult | null | undefined;
        try {
          distributedResult = exchange.viaGateway && provider.id !== STUDIO_AI_PREMIUM_PROVIDER_ID
            ? await exchange.viaGateway(provider, { tenantId, clientSignal })
            : null;
        } catch (error) {
          outcomeStatus = error instanceof HttpException
            ? error.getStatus() === CLIENT_CLOSED_REQUEST_STATUS
              ? "client_aborted"
              : error.getStatus() === 502
                ? "network_error"
                : "provider_error"
            : "provider_error";
          throw error;
        }
        if (distributedResult) {
          receiptOutcome = "succeeded";
          outcomeStatus = "success";
          usage = distributedResult.usage ?? {};
          result = {
            content: distributedResult.content,
            provider: distributedResult.provider,
            model: distributedResult.model,
            ...(distributedResult.requestId ? { requestId: distributedResult.requestId } : {}),
            usage: distributedResult.usage ?? {},
            ...(distributedResult.failover ? { failover: distributedResult.failover } : {}),
          };
          break;
        }

        // 제공자 형식(Messages API·OpenAI 호환)에 맞춘 본문은 교환 방식이 만든다. 키는 헤더에만 싣는다.
        const prepared = exchange.request(provider);
        if (!prepared) {
          outcomeStatus = "provider_error";
          throw new BadGatewayException("AI 요청 형식을 만들지 못했어요.");
        }

        let response: Response;
        try {
          response = await fetch(provider.endpoint, {
            method: "POST",
            headers: prepared.headers,
            body: JSON.stringify(prepared.body),
            signal: upstreamController.signal,
          });
        } catch {
          const cancellationResult = cancellation();
          if (cancellationResult) {
            outcomeStatus = cancellationResult.status;
            throw cancellationResult.exception;
          }
          // A network failure can happen after a provider accepted the request. Do not
          // automatically send the same paid prompt elsewhere and risk double charging.
          outcomeStatus = "network_error";
          throw new BadGatewayException("AI 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
        }

        throwIfCancelled();

        if (!response.ok) {
          const errorPayload = await safeProviderErrorPayload(response);
          throwIfCancelled();
          const providerError = providerFailure(provider, response.status, errorPayload);
          if (providerError.failoverReason === STUDIO_AI_PREMIUM_FAILOVER_REASON) {
            warnPremiumRejectedBeforeInference(response.status, errorPayload);
          }
          outcomeStatus = providerError.status;
          lastProviderFailure = providerError.exception;
          if (providerError.definitivelyRejectedBeforeInference) {
            receiptOutcome = "safe_rejection";
          }
          // 운영 경로의 확정 거절은 무료 제공자로만 넘긴다. 예산 부족을 다른 유료 결제로 우회하지 않는다.
          const nextProviderIsAllowed = provider.id !== STUDIO_AI_PREMIUM_PROVIDER_ID
            || providers[index + 1]?.freePool === true;
          if (hasFallback && providerError.billingFailoverEligible && nextProviderIsAllowed) {
            failoverSource = provider;
            failoverReason = providerError.failoverReason;
            continue;
          }
          if (providerError.freeQuotaExhausted) {
            throw new HttpException(
              {
                code: "FREE_AI_POOL_EXHAUSTED",
                message: "연결된 자동 무료 AI 제공자가 모두 무료 한도 또는 요청 제한 상태입니다. 개인 무료 API 키를 입력하거나 제한 해제 후 다시 시도하세요.",
                settingsHref: "/settings/ai",
              },
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }
          throw providerError.exception;
        }

        let payload: ProviderPayload;
        try {
          payload = (await response.json()) as ProviderPayload;
        } catch {
          const cancellationResult = cancellation();
          if (cancellationResult) {
            outcomeStatus = cancellationResult.status;
            throw cancellationResult.exception;
          }
          outcomeStatus = "provider_error";
          throw new BadGatewayException("AI 응답 형식을 해석하지 못했어요.");
        }
        throwIfCancelled();

        const parsed = exchange.parse(provider, payload);
        // 실패로 끝나도 이미 처리된 호출의 사용량은 원장에 남긴다.
        usage = parsed.usage;
        if (!parsed.ok) {
          outcomeStatus = parsed.status;
          throw parsed.exception;
        }

        outcomeStatus = parsed.ledgerStatus ?? "success";
        // 거절·잘림도 이미 과금됐을 수 있어 영수증을 해제하지 않는다. 기존 ambiguous 상태로 재실행을 막고,
        // Messages 본문과 stop_reason은 그대로 반환해 클라이언트가 완료 여부를 판정하게 한다.
        receiptOutcome = outcomeStatus === "success" ? "succeeded" : "ambiguous";
        const responseModel = parsed.model
          ?? (typeof payload.model === "string" && payload.model.trim()
            ? payload.model.trim().slice(0, 200)
            : provider.model);
        const requestId = studioAiProviderRequestId(payload);
        result = {
          content: parsed.content.trim(),
          provider: provider.id,
          model: responseModel,
          ...(requestId ? { requestId } : {}),
          ...(parsed.message ? { message: parsed.message } : {}),
          usage,
          ...(failoverSource
            ? {
                failover: {
                  attemptedProvider: failoverSource.id,
                  attemptedModel: failoverSource.model,
                  actualProvider: provider.id,
                  actualModel: responseModel,
                  reason: failoverReason ?? STUDIO_AI_BILLING_FAILOVER_REASON,
                },
              }
            : {}),
        };
        break;
      }
      if (!result) {
        throw lastProviderFailure ?? new BadGatewayException(
          "AI 응답을 완료하지 못했어요. 잠시 후 다시 시도해 주세요."
        );
      }
    } catch (error) {
      failed = true;
      failure = error;
    } finally {
      clearTimeout(timer);
      clientSignal?.removeEventListener("abort", abortFromClient);
    }

    try {
      if (receiptOutcome === "succeeded") {
        await this.admissionGate.markSucceeded(receiptMutation);
      } else if (receiptOutcome === "ambiguous") {
        await this.admissionGate.markAmbiguous(receiptMutation);
      } else if (receiptOutcome === "safe_rejection") {
        await this.admissionGate.abandonSafeRejection(receiptMutation);
      } else {
        await this.admissionGate.abandonBeforeSend(receiptMutation);
      }
    } catch {
      // A pre-call `sent` write is already durable. Never replace a paid success/provider error
      // with a storage error that would encourage a second request; sent remains replay-blocking.
      console.error("[studio-ai] receipt finalization failed", {
        outcome: receiptOutcome,
        attemptCount: Math.max(0, attemptCount),
      });
    }

    // 최종 제공자·결과로 판정한다. 정산 실패는 성공 결과를 가리지 않는다.
    try {
      await settleStudioAiCreditCharge(this.creditWallet, creditCharge, { succeeded: receiptOutcome === "succeeded", providerFreePool: ledgerProvider.freePool || ledgerProvider.sponsored === true });
    } catch {
      console.error("[studio-ai] credit settlement failed", { provider: ledgerProvider.id });
    }

    const finishedAt = new Date(Math.max(Date.now(), startedAt.getTime()));
    try {
      await this.usageStore.finalize({
        userId,
        usageDay: reservation.usageDay,
        reservedTokens,
        task: exchange.task,
        provider: ledgerProvider.id,
        model: ledgerProvider.model,
        attemptCount: Math.max(1, attemptCount),
        status: outcomeStatus,
        usage,
        startedAt,
        finishedAt,
      });
    } catch {
      if (!failed && result) {
        // 이미 처리된 응답은 잘림·거절까지 그대로 돌려줘 503이 새 호출을 유도하지 않게 한다.
        // 최대 토큰 예약과 sent/ambiguous 영수증은 유지되므로 한도나 중복 실행이 열리지 않는다.
        // 나중에 원장을 정합화할 수 있도록 운영 메타데이터만 남긴다(입력·키·본문·사용자 식별자 제외).
        console.error("[studio-ai] usage finalization failed after paid success", {
          provider: ledgerProvider.id,
          model: ledgerProvider.model,
          attemptCount: Math.max(1, attemptCount),
        });
      } else {
        throw usageLedgerUnavailableException();
      }
    }

    if (failed) throw failure;
    if (!result) throw new BadGatewayException("AI 응답을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.");
    return result;
  }
}
