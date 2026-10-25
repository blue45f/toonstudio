/**
 * credit-spend.ts — 범용 크레딧 지출(spend) 순수 오케스트레이션.
 *
 * 계약: POST /membership/wallet/spend
 *   { resourceId, pointPrice, requestId } -> { spendEventId, balance }
 * 이 계약은 asset-points-api.ts 머리 주석의 제안 계약과 동일하다.
 *
 * P1 범위 판정 (설계서 CREDIT_SYSTEM_DESIGN.md §3.2/§3.3):
 *  - 서버가 가격을 정한다. P1에서 resourceId는 기존 단가 키 10종 중 하나
 *    (CreditFeatureKey)여야 하며, pointPrice는 해당 기능의 1단위 추정치와
 *    정확히 일치해야 한다. 클라이언트가 임의 가격을 제시해 차감하는 경로는
 *    만들지 않는다. 마켓 리소스 등 단가 키가 없는 대상의 지출은 가격 소스·
 *    환산 정책이 결정되는 P2/P3 과제이며, 여기서는 spend_resource_not_priced로
 *    거부한다 (마켓 크레딧 결제는 P1 범위 밖).
 *  - 차감은 기존 지갑 서비스의 공개 reserve -> capture 경로만으로 수행한다.
 *    새 원장 테이블을 만들지 않으며, 이 파일은 DB에 직접 접근하지 않는다.
 *  - requestId는 예약 멱등키로 매핑한다. 동일 requestId 재호출 시:
 *    이미 캡처된 예약이면 재차감 없이 동일 spendEventId를 반환하고,
 *    해제·만료된 예약이면 새 예약을 만들 수 없으므로 충돌로 거부한다.
 *    (예약 멱등키는 (userId, idempotencyKey) UNIQUE이며, 해제된 예약을
 *    캡처로 되돌릴 수 없기 때문이다.)
 *  - 잔액 한도·롯 만료·예약 TTL(10분)은 기존 지갑 서비스가 집행한다.
 *
 * 이 파일은 Nest에 의존하지 않아 bun 스텁으로 직접 검증할 수 있다.
 * Nest 예외 매핑은 credit-spend.service.ts(얇은 래퍼)가 담당한다.
 */
import {
  isCreditFeatureKey,
  type CreditFeatureKey,
} from "./credit-pricing";

export const CREDIT_SPEND_FEATURE_UNITS = 1;

export type CreditSpendReservationStatus =
  | "reserved"
  | "captured"
  | "released"
  | "expired";

export interface CreditSpendReservation {
  id: string;
  status: CreditSpendReservationStatus;
  requestedAmount: number;
  capturedAmount: number;
}

export interface CreditSpendBalance {
  available: number;
  reserved: number;
  lifetimeGranted: number;
  lifetimeSpent: number;
  bySource: Record<string, number>;
}

/** 지갑 서비스 중 spend가 사용하는 공개 메서드만의 구조적 인터페이스. */
export interface CreditSpendWallet {
  estimateCredits(
    feature: CreditFeatureKey,
    units?: number,
  ): Promise<{ feature: CreditFeatureKey; credits: number; policy: unknown }>;
  reserveStudioCredits(input: {
    userId: string;
    feature: CreditFeatureKey;
    units?: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<CreditSpendReservation>;
  captureCreditReservation(
    reservationId: string,
  ): Promise<CreditSpendReservation>;
  getOverview(userId: string): Promise<{
    wallet: { studioCredits: CreditSpendBalance };
  }>;
}

export interface CreditSpendInput {
  resourceId?: unknown;
  pointPrice?: unknown;
  requestId?: unknown;
}

export interface CreditSpendResult {
  spendEventId: string;
  balance: CreditSpendBalance;
}

export class CreditSpendError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CreditSpendError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1_000_000_000) {
    throw new CreditSpendError(
      "spend_invalid_input",
      400,
      `${label} 값이 올바르지 않습니다.`,
    );
  }
  return parsed;
}

/** P1에서 지출 가능한 대상은 기존 단가 키뿐이다. 그 외는 가격 미정으로 거부한다. */
export function resolveCreditSpendFeature(
  resourceId: unknown,
): CreditFeatureKey | null {
  const resource = boundedText(resourceId, 200);
  if (!resource || !isCreditFeatureKey(resource)) return null;
  return resource;
}

export async function spendStudioCredits(
  wallet: CreditSpendWallet,
  userIdValue: string | undefined,
  body: CreditSpendInput,
): Promise<CreditSpendResult> {
  const userId = userIdValue?.trim();
  if (!userId) {
    throw new CreditSpendError(
      "spend_login_required",
      403,
      "로그인이 필요해요.",
    );
  }
  const resourceId = boundedText(body?.resourceId, 200);
  if (!resourceId) {
    throw new CreditSpendError(
      "spend_invalid_input",
      400,
      "지출 대상 식별자가 필요합니다.",
    );
  }
  const pointPrice = positiveInteger(body?.pointPrice, "지출 가격");
  const requestId = boundedText(body?.requestId, 200);
  if (!requestId) {
    throw new CreditSpendError(
      "spend_invalid_input",
      400,
      "지출 요청 식별자가 필요합니다.",
    );
  }

  const feature = resolveCreditSpendFeature(resourceId);
  if (!feature) {
    throw new CreditSpendError(
      "spend_resource_not_priced",
      400,
      "아직 크레딧 단가가 정해지지 않은 지출 대상입니다.",
      { resourceId },
    );
  }

  // 서버 가격 권위: 클라이언트 제시 가격이 서버 추정치와 다르면 차감하지 않는다.
  const estimate = await wallet.estimateCredits(
    feature,
    CREDIT_SPEND_FEATURE_UNITS,
  );
  if (estimate.credits !== pointPrice) {
    throw new CreditSpendError(
      "spend_price_mismatch",
      400,
      "지출 가격이 서버 단가와 일치하지 않습니다.",
      { resourceId, expected: estimate.credits, requested: pointPrice },
    );
  }

  const reservation = await wallet.reserveStudioCredits({
    userId,
    feature,
    units: CREDIT_SPEND_FEATURE_UNITS,
    idempotencyKey: requestId,
    metadata: { resourceId, spendRequestId: requestId },
  });

  let settled: CreditSpendReservation;
  if (reservation.status === "captured") {
    // 동일 requestId 재호출: 이미 확정된 지출이다. 재차감하지 않는다.
    settled = reservation;
  } else if (reservation.status === "reserved") {
    settled = await wallet.captureCreditReservation(reservation.id);
    if (settled.status !== "captured") {
      throw new CreditSpendError(
        "spend_settlement_failed",
        409,
        "크레딧 지출 확정에 실패했습니다.",
        { spendEventId: reservation.id },
      );
    }
  } else {
    // released / expired: 동일 멱등키로는 새 예약을 만들 수 없다.
    // 호출부는 새 requestId로 다시 요청해야 한다.
    throw new CreditSpendError(
      "spend_request_reused_after_release",
      409,
      "이미 종료된 지출 요청 식별자입니다. 새 요청 식별자로 다시 요청하세요.",
      { spendEventId: reservation.id, status: reservation.status },
    );
  }

  const overview = await wallet.getOverview(userId);
  return {
    spendEventId: settled.id,
    balance: overview.wallet.studioCredits,
  };
}
