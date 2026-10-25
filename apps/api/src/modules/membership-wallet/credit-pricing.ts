/**
 * credit-pricing.ts — 크레딧 단가·등급·환산 정책의 API 측 단일 창구.
 * Nest에 의존하지 않는 순수 모듈이다.
 *
 * 값의 원천과 이중화 방지:
 *  - 단가 키·단가표·등급별 제공량·일 한도의 숫자 원천은
 *    `packages/core/src/membership-wallet.ts`이다 (웹 가격 페이지도 같은
 *    원천을 import한다). 이 모듈은 숫자를 복사하지 않고 재노출한다.
 *    단가를 바꾸려면 원천 한 곳만 바꾸면 되며, 이 파일의 숫자는
 *    P2에서 새로 정한 정책(수수료율·환산율)뿐이다.
 *  - spend API(credit-spend.ts)와 서버 AI 차감(studio-ai-credit-charge.ts)은
 *    단가 키·타입을 core에서 직접 import하지 않고 이 모듈을 경유한다.
 *
 * P2 에이전트 결정 (사용자 확정 대기 — 설계서 CREDIT_SYSTEM_DESIGN.md 참조):
 *  - 등급 3단계: free / creator / pro. core의 team 상수는 건드리지 않고
 *    매핑에서만 제외한다 (B2B 후속 단계로 유예).
 *  - 월 정기 제공량·일 한도: core 상수를 그대로 재사용한다
 *    (free 500/150, creator 2,000/500, pro 5,000/1,500).
 *  - 마켓 수수료율 20%: 단일 상수(분자/분모)로 분리한다. 수수료는
 *    내림(floor)으로 계산하고 판매자 몫은 나머지로 정해 합이 가격과
 *    정확히 일치한다 (수수료 + 판매자 몫 = 가격).
 *  - KRW↔크레딧 환산: 1크레딧 = 10원. KRW→크레딧은 올림(ceil)으로
 *    환산해 원화 가격보다 적게 받는 경우를 만들지 않는다.
 *  - 정책 플래그(`creditPurchasesEnabled: false`)는 이 단계에서 변경하지
 *    않는다. 이 모듈의 환산율은 마켓 크레딧 가격 표시·정산용이며,
 *    크레딧 구매(충전) 경로를 여는 것이 아니다.
 */
import {
  CREDIT_COST_POLICIES,
  CREDIT_FEATURE_KEYS,
  MEMBERSHIP_PLAN_POLICIES,
  estimateCreditCost,
  isCreditFeatureKey,
  type CreditFeatureKey,
  type CreditCostPolicy,
  type MembershipPlanId,
} from "../../../../../packages/core/src/membership-wallet";

export {
  CREDIT_COST_POLICIES,
  CREDIT_FEATURE_KEYS,
  estimateCreditCost,
  isCreditFeatureKey,
  type CreditCostPolicy,
  type CreditFeatureKey,
  type MembershipPlanId,
};

/** P2 등급 3단계. core의 team은 이 매핑에서 제외한다 (상수 무변경). */
export const CREDIT_TIER_PLAN_IDS = ["free", "creator", "pro"] as const;
export type CreditTierPlanId = (typeof CREDIT_TIER_PLAN_IDS)[number];

export function isCreditTierPlanId(
  value: unknown,
): value is CreditTierPlanId {
  return typeof value === "string"
    && (CREDIT_TIER_PLAN_IDS as readonly string[]).includes(value);
}

/** 등급별 월 정기 제공량 (core 상수 재사용, 확정 아님). */
export function creditMonthlyIncluded(planId: CreditTierPlanId): number {
  return Number(
    MEMBERSHIP_PLAN_POLICIES[planId].entitlements["credit.monthlyIncluded"],
  );
}

/** 등급별 일 한도 (core 상수 재사용, 확정 아님). */
export function creditDailyLimit(planId: CreditTierPlanId): number {
  return Number(
    MEMBERSHIP_PLAN_POLICIES[planId].entitlements["credit.dailyLimit"],
  );
}

/** 마켓 플랫폼 수수료율 20% (단일 상수, 분자/분모 분리). */
export const MARKETPLACE_FEE_RATE_NUMERATOR = 20;
export const MARKETPLACE_FEE_RATE_DENOMINATOR = 100;

/** 마켓 가격(크레딧) 중 플랫폼 수수료 몫. 내림으로 계산한다. */
export function marketplaceFeeCredits(priceCredits: number): number {
  if (!Number.isSafeInteger(priceCredits) || priceCredits <= 0) return 0;
  return Math.floor(
    (priceCredits * MARKETPLACE_FEE_RATE_NUMERATOR)
      / MARKETPLACE_FEE_RATE_DENOMINATOR,
  );
}

/** 마켓 가격(크레딧) 중 판매자 몫. 수수료 + 판매자 몫 = 가격을 보장한다. */
export function marketplaceSellerCredits(priceCredits: number): number {
  if (!Number.isSafeInteger(priceCredits) || priceCredits <= 0) return 0;
  return priceCredits - marketplaceFeeCredits(priceCredits);
}

/** KRW↔크레딧 환산율: 1크레딧 = 10원. */
export const KRW_PER_CREDIT = 10;

/** KRW 가격을 크레딧으로 환산한다. 0 이하·비유한 값은 0, 나머지는 올림. */
export function creditsForKrwAmount(krwAmount: number): number {
  if (!Number.isFinite(krwAmount) || krwAmount <= 0) return 0;
  return Math.ceil(krwAmount / KRW_PER_CREDIT);
}

/** 크레딧을 KRW 상당액으로 환산한다 (표시·대조용, 결제 호출 아님). */
export function krwForCredits(credits: number): number {
  if (!Number.isSafeInteger(credits) || credits <= 0) return 0;
  return credits * KRW_PER_CREDIT;
}
