/**
 * research-credit-charge.ts — 리서치 크레딧 차감 오케스트레이션 (순수 모듈).
 * studio-ai-credit-charge.ts의 패턴을 따른다: 예약 → 성공 시 캡처 / 실패 시 해제.
 *
 * 단가 키 선택:
 *  - core 단가표에 전용 `ai.research` 키를 새로 만들지 않는다. 단가 키 추가는
 *    가격 페이지·단가 테스트와 함께 검토해야 하는 정책 변경이기 때문이다.
 *  - 대신 기존 `ai.text.generate`(기본 1크레딧/단위, 예약 상한 20)를 재사용하고,
 *    metadata.source="deepseek-research"로 리서치 차감을 구분한다.
 *  - 리서치 1요청의 최대 예상 사용량은 트렌드 다이제스트(질의 10건 + 섹션당
 *    fetch 1건 = 20단위)까지로, 예약 상한 20 안에 들어간다. 상한을 넘는
 *    요청은 서비스 계층에서 거부한다.
 *  - 유료 운영 게이트(paid-operations-gate)가 OFF면 차감을 수행하지 않는다
 *    (fail-closed). 이 경우 서비스는 미터링만 기록하고 요청은 계속 처리한다 —
 *    게이트 OFF가 기능 자체를 막지는 않으며, 그 사실은 PR 문서에 명시한다.
 */

import {
  PAID_OPERATIONS_DISABLED,
  resolvePaidOperationsEnabled,
  type PaidOperationsSettingStore,
} from "../membership-wallet/paid-operations-gate";
import type { CreditFeatureKey } from "../membership-wallet/credit-pricing";

export { PAID_OPERATIONS_SETTING_STORE, type PaidOperationsSettingStore }
  from "../membership-wallet/paid-operations-gate";

/** 리서치 차감이 재사용하는 기존 단가 키. 전용 키 신설은 후속 정책 과제로 남긴다. */
export const RESEARCH_CREDIT_FEATURE: CreditFeatureKey = "ai.text.generate";
/** 지갑 예약 1건의 단위 상한 (ai.text.generate 정책의 maximumCredits). */
export const RESEARCH_CREDIT_RESERVATION_MAX_UNITS = 20;
export const RESEARCH_CREDIT_IDEMPOTENCY_PREFIX = "research-credit:";

export interface ResearchCreditWallet {
  reserveStudioCredits(input: {
    userId: string;
    feature: CreditFeatureKey;
    units?: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; status: string }>;
  captureCreditReservation(
    reservationId: string,
    actualAmount?: number,
  ): Promise<unknown>;
  releaseCreditReservation(reservationId: string): Promise<unknown>;
}

export interface ResearchCreditCharge {
  readonly charged: boolean;
  readonly reservationId?: string;
  readonly units?: number;
}

/** 리서치 크레딧 차감 오류 — 코드·HTTP 상태를 함께 담는다. */
export class ResearchCreditError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "ResearchCreditError";
    this.code = code;
    this.status = status;
  }
}

export function researchCreditIdempotencyKey(
  idempotencyKey: string,
): string {
  return `${RESEARCH_CREDIT_IDEMPOTENCY_PREFIX}${idempotencyKey}`;
}

/**
 * 예상 사용량만큼 예약한다. 지갑 미주입·게이트 OFF면 차감하지 않고
 * { charged: false }를 반환한다. 상한(20단위)을 넘는 예상량은 거부한다.
 */
export async function beginResearchCreditCharge(
  wallet: ResearchCreditWallet | null | undefined,
  input: {
    userId: string;
    estimatedUnits: number;
    idempotencyKey: string;
    operation: string;
  },
  paidOperations?: PaidOperationsSettingStore,
): Promise<ResearchCreditCharge> {
  if (!wallet) return { charged: false };
  if (!(await resolvePaidOperationsEnabled(paidOperations))) {
    throw new ResearchCreditError(
      PAID_OPERATIONS_DISABLED,
      403,
      "유료 운영이 비활성화되어 있어 리서치 크레딧 차감을 실행할 수 없습니다.",
    );
  }
  const units = Math.floor(input.estimatedUnits);
  if (!Number.isSafeInteger(units) || units < 0) {
    throw new ResearchCreditError(
      "RESEARCH_CHARGE_INVALID",
      400,
      "리서치 차감 단위가 올바르지 않습니다.",
    );
  }
  if (units > RESEARCH_CREDIT_RESERVATION_MAX_UNITS) {
    throw new ResearchCreditError(
      "RESEARCH_CHARGE_TOO_LARGE",
      400,
      `리서치 1요청의 차감 상한(${RESEARCH_CREDIT_RESERVATION_MAX_UNITS}단위)을 넘었습니다.`,
    );
  }
  if (units === 0) return { charged: false };
  try {
    const reservation = await wallet.reserveStudioCredits({
      userId: input.userId,
      feature: RESEARCH_CREDIT_FEATURE,
      units,
      idempotencyKey: researchCreditIdempotencyKey(input.idempotencyKey),
      metadata: {
        source: "deepseek-research",
        operation: input.operation,
      },
    });
    return { charged: true, reservationId: reservation.id, units };
  } catch {
    throw new ResearchCreditError(
      "RESEARCH_CHARGE_FAILED",
      402,
      "리서치 크레딧 예약에 실패했습니다. 잔액을 확인하세요.",
    );
  }
}

/**
 * 결과에 따라 예약을 정산한다. 성공 시 실제 사용량으로 캡처하고,
 * 실패·중단·모호함 시 해제한다 (불확실한 결과에 과금하지 않는다).
 */
export async function settleResearchCreditCharge(
  wallet: ResearchCreditWallet | null | undefined,
  charge: ResearchCreditCharge,
  outcome: "success" | "failure",
  actualUnits?: number,
): Promise<void> {
  if (!wallet || !charge.charged || !charge.reservationId) return;
  if (outcome === "success") {
    const actual = actualUnits === undefined
      ? charge.units
      : Math.min(charge.units ?? 0, Math.max(0, Math.floor(actualUnits)));
    await wallet.captureCreditReservation(charge.reservationId, actual);
    return;
  }
  await wallet.releaseCreditReservation(charge.reservationId);
}
