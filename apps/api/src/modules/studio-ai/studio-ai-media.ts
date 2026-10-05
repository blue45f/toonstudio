import {
  classifyStudioAiProviderFailure,
  type StudioAiProviderFailureClassification,
} from "./studio-ai-provider";
import {
  resolveStudioAiCapabilityProviders,
  type StudioAiCapabilityConfig,
  type StudioAiCapabilityKind,
} from "./studio-ai-capabilities";

/** 테스트에서 주입할 수 있는 fetch 최소 계약. 실제 호출은 기본값(global fetch)만 쓴다. */
export type StudioAiMediaFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * 능력 어댑터가 던지는 제공자 실패.
 * classification은 기존 풀의 전환 규칙(classifyStudioAiProviderFailure)을 그대로 따르며,
 * billingFailoverEligible이 true인 "추론 수락 전 확정 거절"에서만 다음 후보로 넘어간다.
 * 네트워크 오류처럼 수락 여부를 알 수 없는 실패는 eligible=false로 고정해
 * 같은 요청이 몰래 재전송·중복 과금되지 않게 한다.
 */
export class StudioAiCapabilityProviderError extends Error {
  readonly provider: StudioAiCapabilityConfig["provider"];
  readonly capability: StudioAiCapabilityKind;
  readonly httpStatus?: number;
  readonly classification: StudioAiProviderFailureClassification;

  constructor(
    config: StudioAiCapabilityConfig,
    classification: StudioAiProviderFailureClassification,
    httpStatus?: number,
  ) {
    super(
      `무료 풀 ${config.capability} 호출이 거절됐어요 (${config.provider}/${classification.kind})`,
    );
    this.name = "StudioAiCapabilityProviderError";
    this.provider = config.provider;
    this.capability = config.capability;
    this.classification = classification;
    if (httpStatus !== undefined) this.httpStatus = httpStatus;
  }
}

export class StudioAiCapabilityUnavailableError extends Error {
  readonly capability: StudioAiCapabilityKind;

  constructor(capability: StudioAiCapabilityKind) {
    super(`무료 풀에 활성화된 ${capability} 제공자가 없어요`);
    this.name = "StudioAiCapabilityUnavailableError";
    this.capability = capability;
  }
}

/** 입력 검증 실패처럼 제공자에 닿기 전에 확정할 수 있는 거절. */
export class StudioAiCapabilityInputError extends Error {
  readonly capability: StudioAiCapabilityKind;

  constructor(capability: StudioAiCapabilityKind, message: string) {
    super(message);
    this.name = "StudioAiCapabilityInputError";
    this.capability = capability;
  }
}

export function ensureCapabilityConfigured(
  config: StudioAiCapabilityConfig,
): asserts config is StudioAiCapabilityConfig & { endpoint: string; apiKey: string } {
  if (!config.configured || !config.endpoint || !config.apiKey) {
    throw new StudioAiCapabilityUnavailableError(config.capability);
  }
}

async function safeJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** 비정상 응답을 기존 분류기로 해석해 typed error로 던진다. 제공자 오류 원문은 메시지에 싣지 않는다. */
export async function throwForProviderErrorResponse(
  config: StudioAiCapabilityConfig,
  response: Response,
): Promise<never> {
  const payload = await safeJsonPayload(response);
  const classification = classifyStudioAiProviderFailure(
    config.provider,
    response.status,
    payload,
  );
  throw new StudioAiCapabilityProviderError(config, classification, response.status);
}

export function providerNetworkError(
  config: StudioAiCapabilityConfig,
): StudioAiCapabilityProviderError {
  return new StudioAiCapabilityProviderError(config, {
    kind: "provider_unavailable",
    billingFailoverEligible: false,
  });
}

export interface StudioAiCapabilityRun<T> {
  result: T;
  provider: StudioAiCapabilityConfig["provider"];
  model: string;
  failover?: {
    from: StudioAiCapabilityConfig["provider"];
    reason: string;
  };
}

/**
 * 풀 순서대로 후보를 시도하는 공통 실행기.
 * 다음 후보로 넘어가는 경우는 기존 풀과 동일하게 "추론 수락 전 확정 거절"뿐이며,
 * 전환이 일어나면 결과에 failover 출처를 남겨 조용한 경로 전환이 되지 않게 한다.
 */
export async function runStudioAiCapability<T>(
  capability: StudioAiCapabilityKind,
  env: Partial<Record<string, string | undefined>>,
  execute: (config: StudioAiCapabilityConfig) => Promise<T>,
): Promise<StudioAiCapabilityRun<T>> {
  const candidates = resolveStudioAiCapabilityProviders(capability, env);
  if (candidates.length === 0) throw new StudioAiCapabilityUnavailableError(capability);
  let failover: StudioAiCapabilityRun<T>["failover"];
  let lastError: unknown;
  for (const [index, config] of candidates.entries()) {
    try {
      const result = await execute(config);
      return {
        result,
        provider: config.provider,
        model: config.model,
        ...(failover ? { failover } : {}),
      };
    } catch (error) {
      lastError = error;
      const canAdvance = error instanceof StudioAiCapabilityProviderError
        && error.classification.billingFailoverEligible
        && index < candidates.length - 1;
      if (!canAdvance) throw error;
      failover = {
        from: config.provider,
        reason: error.classification.failoverReason ?? error.classification.kind,
      };
    }
  }
  throw lastError;
}
