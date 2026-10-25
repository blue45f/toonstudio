/**
 * studio-ai-credit-charge.ts — 서버 AI 1곳(StudioAiService.completeAdmitted)의
 * 크레딧 차감 오케스트레이션. Nest에 의존하지 않는 순수 모듈이다.
 *
 * 판정 (설계서 CREDIT_SYSTEM_DESIGN.md §1.2/§1.5, 조사 §4.2):
 *  - 차감 대상은 운영자 부담 경로뿐이다. 제공자 freePool=true(무료 풀)인
 *    호출은 쿼터로만 관리하고 차감하지 않는다.
 *  - BYOK 자동 채색 경로에는 차감을 붙이지 않는다. 이 모듈은 서버 AI
 *    (studio-ai chat) 경로 전용이며, 웹 BYOK 채색과는 무관하다.
 *  - 단가 키는 기존 10종 중 해당 작업에 맞는 것만 쓴다. 새 단가 키를
 *    만들지 않는다: translation 작업 -> ai.translation, 그 외 채팅 작업 ->
 *    ai.text.generate (1단위/요청).
 *  - 예약 멱등키는 studio-ai 멱등키(최대 128자)에 접두사를 붙인
 *    `studio-ai-credit:<key>`(최대 145자 < 지갑 멱등키 상한 200자)이다.
 *    동일 AI 요청의 재시도는 admission 게이트가 이미 차단하므로, 이 키는
 *    동일 AI 요청에 대한 중복 차감을 막는 두 번째 방어선이다.
 *  - 성공 시 capture / 그 외(실패·중단·모호함) 시 release가 원칙이다.
 *    단, 최종 제공자가 무료 풀일 때는 예약 자체를 해제한다 (무료 풀
 *    성공에 과금하지 않기 위해, 예약 시점에는 후보에 운영자 부담
 *    제공자가 포함돼 있으면 예약을 잡아 두었다가 최종 제공자로 판정한다).
 *    모호함(ambiguous) 결과에 capture하지 않는 것은 불확실한 결과에
 *    과금하지 않기 위한 선택이며, 운영자 부담 리스크로 기록에 남긴다.
 *
 * 지갑이 주입되지 않은 경우(null — 기존 단위 테스트 구성 등) 차감은
 * 건너뛴다. 운영 배선(StudioAiModule이 MembershipWalletModule을 import)
 * 에서는 지갑이 항상 제공되므로, null 경로는 테스트용 폴백이다.
 */
import type { CreditFeatureKey } from "../membership-wallet/credit-pricing";

export const STUDIO_AI_CREDIT_WALLET = Symbol("STUDIO_AI_CREDIT_WALLET");

export const STUDIO_AI_CREDIT_IDEMPOTENCY_PREFIX = "studio-ai-credit:";

export type StudioAiCreditTask =
  | "assistant"
  | "composition"
  | "scenario"
  | "translation"
  | "dialogue"
  | "palette";

export interface StudioAiCreditProviderLike {
  freePool: boolean;
}

export interface StudioAiCreditWallet {
  reserveStudioCredits(input: {
    userId: string;
    feature: CreditFeatureKey;
    units?: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; status: string }>;
  captureCreditReservation(reservationId: string): Promise<unknown>;
  releaseCreditReservation(reservationId: string): Promise<unknown>;
}

export interface StudioAiCreditCharge {
  charged: boolean;
  reservationId?: string;
  feature?: CreditFeatureKey;
}

export function studioAiCreditFeatureForTask(
  task: string,
): CreditFeatureKey {
  return task === "translation" ? "ai.translation" : "ai.text.generate";
}

/** 후보 중 운영자 부담 제공자가 하나라도 있으면 예약 대상이다. */
export function shouldChargeStudioAiCredits(
  providers: readonly StudioAiCreditProviderLike[],
): boolean {
  return providers.some((provider) => !provider.freePool);
}

export function studioAiCreditIdempotencyKey(
  studioAiIdempotencyKey: string,
): string {
  return `${STUDIO_AI_CREDIT_IDEMPOTENCY_PREFIX}${studioAiIdempotencyKey}`;
}

export async function beginStudioAiCreditCharge(
  wallet: StudioAiCreditWallet | null | undefined,
  input: {
    userId: string;
    task: string;
    idempotencyKey: string;
    providers: readonly StudioAiCreditProviderLike[];
  },
): Promise<StudioAiCreditCharge> {
  if (!wallet || !shouldChargeStudioAiCredits(input.providers)) {
    return { charged: false };
  }
  const feature = studioAiCreditFeatureForTask(input.task);
  const reservation = await wallet.reserveStudioCredits({
    userId: input.userId,
    feature,
    units: 1,
    idempotencyKey: studioAiCreditIdempotencyKey(input.idempotencyKey),
    metadata: {
      task: input.task,
      studioAiIdempotencyKey: input.idempotencyKey,
    },
  });
  return { charged: true, reservationId: reservation.id, feature };
}

export async function settleStudioAiCreditCharge(
  wallet: StudioAiCreditWallet | null | undefined,
  charge: StudioAiCreditCharge,
  outcome: { succeeded: boolean; providerFreePool: boolean },
): Promise<void> {
  if (!wallet || !charge.charged || !charge.reservationId) return;
  if (outcome.succeeded && !outcome.providerFreePool) {
    await wallet.captureCreditReservation(charge.reservationId);
  } else {
    await wallet.releaseCreditReservation(charge.reservationId);
  }
}
