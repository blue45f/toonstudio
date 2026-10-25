/**
 * marketplace-credit-payment.ts — 마켓 크레딧 결제 정산 순수 오케스트레이션.
 * Nest에 의존하지 않는 순수 모듈이다.
 *
 * 갈래 (서베이 §4 판정): 상거래 KRW 흐름과 라이브러리 획득(무료 보관)
 * 흐름은 분리돼 있다. 크레딧 결제는 획득 시 차감 갈래로 구현한다 —
 * 즉 이 모듈은 라이브러리 `acquire()`가 유료 상품을 획득할 때 호출하는
 * 정산을 정의한다. KRW·PG 호출은 절대 만들지 않는다.
 *
 * 가격 소스: 상거래 KRW 견적(`getMarketplaceQuote`의 amount)을
 * credit-pricing의 환산율(1크레딧 = 10원, 올림)로 크레딧으로 바꾼다.
 * 0원(무료) 상품은 차감 대상이 아니다 — 기존 무료 획득 흐름을 그대로 둔다.
 *
 * 정산 순서와 분리 기록:
 *  1. 구매자 예약 (가변 가격 키 `market.purchase`, units = 가격 크레딧)
 *  2. 구매자 확정 (capture) — 확정 실패 시 정산 실패, 판매자 적립 없음
 *  3. 판매자 적립 (판매자 몫 = 가격 − 수수료)
 *  4. 수수료 분리 기록 반환 (수수료 20% = 가격의 내림 몫, 나머지가 판매자 몫)
 *  판매자 잔액은 크레딧 잔액으로만 표현한다. 수수료는 별도 지갑 이동이
 *  아니라 분리 기록이다 (구매자 차감액 − 판매자 적립액 = 플랫폼 몫).
 *
 * ⚠ 배선 한계 (P2 실측 — 라이브 획득 연결을 보류한 이유):
 *  지갑 서비스의 공개 메서드 중 studio_credit을 타 사용자에게 적립하는
 *  비관리자 경로는 없다 (`grantActivityPoints`는 reward_point 전용,
 *  `adminApplyBenefit`은 관리자 전용). 따라서 판매자 적립 단계는 구조적
 *  지갑 인터페이스(`MarketplaceCreditWallet.grantMarketplaceSellerCredits`)
 *  의 seam으로 정의하고 스텁으로 검증한다. 라이브 획득 흐름(`acquire()`)
 *  에는 이 모듈을 연결하지 않았다 — 판매자 적립 어댑터가 없는 상태에서
 *  구매자 차감만 연결하면 구매자만 차감되고 판매자에게는 지급되지 않는
 *  불일치가 생기기 때문이다. 판매자 적립용 공개 메서드 1건이 지갑
 *  서비스에 추가되는 대로 `acquire()` 배선을 연결하는 것이 후속 과제이다
 *  (IMPLEMENTATION_P2.md 참조).
 *
 * P3 재판정 (2026-10-25, 서비스 레벨 호출 가능성 실측):
 *  `adminApplyBenefit`은 서비스 레벨 메서드라 컨트롤러 전용은 아니지만,
 *  첫 줄에서 `requireAdmin` → `isAdminUser(adminId)`를 거친다.
 *  `isAdminUser`는 DB users 행의 role이 admin/operator인 실제 활성
 *  사용자일 때만 참이다. 따라서 시스템 정산 액터
 *  (`system:marketplace-settlement`)로는 이 메서드를 호출할 수 없다 —
 *  users 행이 없는 액터는 False(안전 폴백 포함)로 거부된다.
 *  실제 관리자 사용자의 신원을 자동 정산에 빌려 쓰는 것은 감사 원장
 *  귀속을 왜곡하므로 채택하지 않는다. 결론: P3에서도 라이브 획득
 *  연결을 하지 않고 seam + 스텁 검증 상태를 유지한다. 연결 조건은
 *  지갑 서비스에 시스템 정산용 공개 적립 경로가 추가되는 것이다.
 *  단, 그 추가는 `membership-wallet.service.ts` 1,884줄 기준선과
 *  충돌하므로 래칫 기준선 조정과 함께 별도 제품 결정이 필요하다.
 *  (IMPLEMENTATION_P3.md 참조.)
 *
 * 부분 정산: 판매자 적립이 구매자 확정 이후에 실패하면 구매자 환불용
 * 공개 메서드가 없어 자동 복구가 불가능하다. 이 경우
 * `marketplace_seller_credit_failed` 오류에 확정된 구매자 결제 식별자를
 * 담아 반환하므로, 관리자 조정(`adminApplyBenefit`)으로 대조·복구한다.
 * 동일 requestId로 이미 확정된 예약을 재조회하면 판매자 적립 완료 여부를
 * 이 모듈이 알 수 없으므로 `marketplace_settlement_ambiguous`(409)로
 * 거부한다 (재시도는 새 requestId로, 대조는 관리자가 수행한다).
 */
import {
  creditsForKrwAmount,
  marketplaceFeeCredits,
  marketplaceSellerCredits,
  type CreditFeatureKey,
} from "./credit-pricing";

export const MARKETPLACE_CREDIT_FEATURE = "market.purchase" as const;
export const MARKETPLACE_CREDIT_IDEMPOTENCY_PREFIX = "marketplace-credit:";

export type MarketplaceCreditReservationStatus =
  | "reserved"
  | "captured"
  | "released"
  | "expired";

export interface MarketplaceCreditReservation {
  id: string;
  status: MarketplaceCreditReservationStatus;
  requestedAmount: number;
  capturedAmount: number;
}

/**
 * 지갑 서비스 중 마켓 정산이 사용하는 구조적 인터페이스.
 * `grantMarketplaceSellerCredits`는 P2에서 seam으로 정의한 단계이다
 * (위 배선 한계 참조 — 라이브 지갑 어댑터는 후속 과제).
 */
export interface MarketplaceCreditWallet {
  reserveStudioCredits(input: {
    userId: string;
    feature: CreditFeatureKey;
    units?: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<MarketplaceCreditReservation>;
  captureCreditReservation(
    reservationId: string,
  ): Promise<MarketplaceCreditReservation>;
  releaseCreditReservation(reservationId: string): Promise<unknown>;
  grantMarketplaceSellerCredits(input: {
    userId: string;
    amount: number;
    requestKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ granted: boolean }>;
}

export interface MarketplaceCreditPaymentInput {
  buyerId?: unknown;
  sellerId?: unknown;
  releaseId?: unknown;
  priceCredits?: unknown;
  requestId?: unknown;
}

export interface MarketplaceCreditReceipt {
  buyerPaymentId: string;
  buyerId: string;
  sellerId: string;
  releaseId: string;
  priceCredits: number;
  sellerCredits: number;
  platformFeeCredits: number;
}

export class MarketplaceCreditError extends Error {
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
    this.name = "MarketplaceCreditError";
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
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1_000_000) {
    throw new MarketplaceCreditError(
      "marketplace_invalid_input",
      400,
      `${label} 값이 올바르지 않습니다.`,
    );
  }
  return parsed;
}

/**
 * KRW 상거래 가격을 마켓 크레딧 가격으로 바꾼다.
 * 0원 이하는 null (무료 획득 흐름, 차감 없음).
 */
export function marketplacePriceCreditsFromKrw(
  krwAmount: number,
): { priceCredits: number; sellerCredits: number; platformFeeCredits: number } | null {
  const priceCredits = creditsForKrwAmount(krwAmount);
  if (priceCredits <= 0) return null;
  return {
    priceCredits,
    sellerCredits: marketplaceSellerCredits(priceCredits),
    platformFeeCredits: marketplaceFeeCredits(priceCredits),
  };
}

export function marketplaceCreditIdempotencyKey(requestId: string): string {
  return `${MARKETPLACE_CREDIT_IDEMPOTENCY_PREFIX}${requestId}`;
}

export async function settleMarketplaceCreditPayment(
  wallet: MarketplaceCreditWallet,
  body: MarketplaceCreditPaymentInput,
): Promise<MarketplaceCreditReceipt> {
  const buyerId = boundedText(body?.buyerId, 160);
  const sellerId = boundedText(body?.sellerId, 160);
  const releaseId = boundedText(body?.releaseId, 200);
  const requestId = boundedText(body?.requestId, 180);
  if (!buyerId || !sellerId || !releaseId || !requestId) {
    throw new MarketplaceCreditError(
      "marketplace_invalid_input",
      400,
      "구매자·판매자·상품·요청 식별자가 필요합니다.",
    );
  }
  if (buyerId === sellerId) {
    throw new MarketplaceCreditError(
      "marketplace_self_purchase",
      400,
      "본인 상품은 크레딧 결제로 획득할 수 없습니다.",
      { releaseId },
    );
  }
  const priceCredits = positiveInteger(body?.priceCredits, "마켓 가격");
  const sellerCredits = marketplaceSellerCredits(priceCredits);
  const platformFeeCredits = marketplaceFeeCredits(priceCredits);

  const reservation = await wallet.reserveStudioCredits({
    userId: buyerId,
    feature: MARKETPLACE_CREDIT_FEATURE,
    units: priceCredits,
    idempotencyKey: marketplaceCreditIdempotencyKey(requestId),
    metadata: { releaseId, marketplaceRequestId: requestId },
  });

  if (reservation.status === "captured") {
    // 동일 requestId로 이미 확정된 결제가 있다. 판매자 적립 완료 여부를
    // 이 모듈이 알 수 없으므로 재적립하지 않고 모호함으로 거부한다.
    throw new MarketplaceCreditError(
      "marketplace_settlement_ambiguous",
      409,
      "이미 확정된 결제 요청 식별자입니다. 대조 후 새 요청 식별자로 다시 요청하세요.",
      { buyerPaymentId: reservation.id, releaseId },
    );
  }
  if (reservation.status !== "reserved") {
    throw new MarketplaceCreditError(
      "marketplace_request_reused_after_release",
      409,
      "이미 종료된 결제 요청 식별자입니다. 새 요청 식별자로 다시 요청하세요.",
      { buyerPaymentId: reservation.id, status: reservation.status },
    );
  }

  const settled = await wallet.captureCreditReservation(reservation.id);
  if (settled.status !== "captured") {
    throw new MarketplaceCreditError(
      "marketplace_settlement_failed",
      409,
      "마켓 크레딧 결제 확정에 실패했습니다.",
      { buyerPaymentId: reservation.id },
    );
  }

  const grant = await wallet.grantMarketplaceSellerCredits({
    userId: sellerId,
    amount: sellerCredits,
    requestKey: marketplaceCreditIdempotencyKey(requestId),
    metadata: { releaseId, buyerId, priceCredits, platformFeeCredits },
  });
  if (!grant.granted) {
    // 구매자 확정 이후 실패 — 자동 환불 경로가 없으므로 대조용 오류로 반환한다.
    throw new MarketplaceCreditError(
      "marketplace_seller_credit_failed",
      409,
      "판매자 크레딧 적립에 실패했습니다. 관리자 대조가 필요합니다.",
      {
        buyerPaymentId: reservation.id,
        buyerCaptured: true,
        sellerGranted: false,
        releaseId,
      },
    );
  }

  return {
    buyerPaymentId: reservation.id,
    buyerId,
    sellerId,
    releaseId,
    priceCredits,
    sellerCredits,
    platformFeeCredits,
  };
}
