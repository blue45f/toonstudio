/**
 * decoration-credit-wallet-adapter.ts — 꾸미기 크레딧 결제 seam의 라이브
 * 지갑 어댑터 (2단계 수익화 가동, 2026-10-25). Nest에 의존하지 않는다.
 *
 * 꾸미기 결제는 상품마다 가격이 달라 고정 단가 키 체계로 표현할 수
 * 없으므로, 정산 모듈은 `reserveDecorationCredits`라는 전용 seam을
 * 정의했다. 이 어댑터는 그 seam을 지갑 서비스의 공개 예약·확정 경로에
 * 연결한다.
 *
 * 원장 표기 한계 (명시):
 *  - 꾸미기 전용 단가 키는 core 단가표에 없다 (단가 키 추가는 제품
 *    결정 사항이라 이 단계에서 core를 건드리지 않는다).
 *  - 따라서 가변 가격 키 `market.purchase`(단위 1 = 1크레딧, 상한
 *    1,000,000)로 예약하며, 원장 metadata에
 *    `purchaseKind: "studio-decoration"`과 `decorationItemId`를 남겨
 *    마켓 구매와 구분한다. 전용 키가 생기면 이 매핑만 교체하면 된다.
 *  - 카탈로그 가격은 서버 권위이며 클라이언트 제시 가격은 받지 않는다
 *    (정산 모듈이 카탈로그에서 가격을 조회한다).
 *
 * 새 DB 테이블·마이그레이션은 없다. 구매 이후의 장착 권한 영속화
 * (구매 목록 테이블)는 별도 마이그레이션 결정이 필요한 후속 과제이며,
 * 이 어댑터는 결제 확정 식별자(purchaseId)를 반환하는 데까지만 책임진다.
 */

import type {
  DecorationCreditReservation,
  DecorationCreditWallet,
} from "./studio-decoration-credit-purchase";
import type { CreditFeatureKey } from "./credit-pricing";

/** 지갑 서비스 중 어댑터가 쓰는 공개 메서드만의 구조적 인터페이스. */
export interface DecorationSettlementWalletService {
  reserveStudioCredits(input: {
    userId: string;
    feature: CreditFeatureKey;
    units?: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<DecorationCreditReservation>;
  captureCreditReservation(
    reservationId: string,
  ): Promise<DecorationCreditReservation>;
}

export function createDecorationCreditWallet(
  wallet: DecorationSettlementWalletService,
): DecorationCreditWallet {
  return {
    reserveDecorationCredits: (input) =>
      wallet.reserveStudioCredits({
        userId: input.userId,
        feature: "market.purchase",
        units: input.priceCredits,
        idempotencyKey: input.idempotencyKey,
        metadata: {
          ...(input.metadata ?? {}),
          purchaseKind: "studio-decoration",
          decorationItemId: input.itemId,
          decorationPriceCredits: input.priceCredits,
        },
      }),
    captureDecorationReservation: (reservationId) =>
      wallet.captureCreditReservation(reservationId),
  };
}
