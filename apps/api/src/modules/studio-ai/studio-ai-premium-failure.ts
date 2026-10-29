import { HttpException, HttpStatus } from "@nestjs/common";

/** 운영 프리미엄 경로가 추론 전에 한도·결제·혼잡·인증·설정·요청 형식으로 거절돼 무료 풀로 이어 간 경우. */
export const STUDIO_AI_PREMIUM_FAILOVER_REASON = "premium_unavailable" as const;

/** 운영 지출한도·크레딧 부족을 일시적인 요청 속도 제한과 구분한다. 원문 메시지는 저장·반환하지 않는다. */
export function studioAiPremiumBudgetExhausted(responseStatus: number, payload: unknown): boolean {
  if (responseStatus !== 400 && responseStatus !== 429) return false;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const error = (payload as Record<string, unknown>).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return false;
  const record = error as Record<string, unknown>;
  if (responseStatus === 429 && record.type === "rate_limit_error") {
    const details = record.details;
    return typeof details === "object" && details !== null && !Array.isArray(details)
      && (details as Record<string, unknown>).error_code === "enforced_spend_limit_reached";
  }
  if (responseStatus !== 400 || record.type !== "invalid_request_error" || typeof record.message !== "string") {
    return false;
  }
  return record.message.startsWith("You have reached your specified API usage limits")
    || record.message.startsWith("You have reached your specified workspace API usage limits")
    || record.message.startsWith("Your credit balance is too low to access the Anthropic API.");
}

/** 무료 후보가 없는 운영 예산 소진을 알린다. 추론 전 거절이므로 사용량·유료 전환으로 처리하지 않는다. */
export function studioAiPremiumBudgetFailure() {
  return {
    status: "provider_rate_limited" as const,
    exception: new HttpException({
      code: "PREMIUM_AI_BUDGET_EXHAUSTED",
      message: "ToonStudio 고성능 AI의 사용 예산이 소진됐어요. 한도가 갱신된 뒤 다시 이용해 주세요.",
      settingsHref: "/settings/ai",
    }, HttpStatus.TOO_MANY_REQUESTS),
    billingFailoverEligible: true,
    failoverReason: STUDIO_AI_PREMIUM_FAILOVER_REASON,
    freeQuotaExhausted: false,
    definitivelyRejectedBeforeInference: true,
  };
}
