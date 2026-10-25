/**
 * marketplace-credit-wallet-adapter.ts — 마켓 크레딧 정산 seam의 라이브
 * 지갑 어댑터 (2단계 수익화 가동, 2026-10-25). Nest에 의존하지 않는다.
 *
 * P2/P3에서 seam으로만 남아 있던 판매자 적립 단계를 닫는 지점이다.
 * 지갑 서비스의 공개 예약·확정·해제 경로에, 기존 공개 적립 경로
 * (`grantAsset`, studio_credit)를 연결한다. `grantAsset`은 관리자 전용
 * `adminApplyBenefit`의 내부 적립과 같은 원장 경로를 쓰되, 이 어댑터는
 * 관리자 신원을 빌리지 않는다 — 호출 주체는 정산 모듈이며, 원장에는
 * source `marketplace`와 정산 요청 키가 그대로 남는다.
 *
 * 적립 원장:
 *  - 자산: studio_credit (판매자 잔액은 크레딧 잔액으로만 표현).
 *  - source: `marketplace`, sourceKey/sourceRef: 정산 요청 키
 *    (`marketplace-credit:<requestId>`) — 동일 요청 키 재적립은
 *    원장의 (accountId, sourceKey) UNIQUE로 멱등하게 막힌다.
 *  - 만료: 없음 (구매 크레딧과 동일하게 null — 보상 90일과 차등).
 *  - 수수료는 별도 이동이 아니라 분리 기록이다 (구매자 차감액 −
 *    판매자 적립액 = 플랫폼 몫, 정산 모듈 머리 주석 참조).
 *
 * 새 DB 테이블·마이그레이션은 없다. 기존 wallet_lot·wallet_ledger_entry만 쓴다.
 */

import type {
  MarketplaceCreditReservation,
  MarketplaceCreditWallet,
} from "./marketplace-credit-payment";
import type { CreditFeatureKey } from "./credit-pricing";

/** 지갑 서비스 중 어댑터가 쓰는 공개 메서드만의 구조적 인터페이스. */
export interface MarketplaceSettlementWalletService {
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
  grantAsset(input: {
    userId: string;
    asset: "studio_credit";
    amount: number;
    source: string;
    sourceKey: string;
    sourceRef?: string | null;
    expiresAt?: Date | null;
    reason: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ granted: boolean }>;
}

export function createMarketplaceCreditWallet(
  wallet: MarketplaceSettlementWalletService,
): MarketplaceCreditWallet {
  return {
    reserveStudioCredits: (input) => wallet.reserveStudioCredits(input),
    captureCreditReservation: (reservationId) =>
      wallet.captureCreditReservation(reservationId),
    releaseCreditReservation: (reservationId) =>
      wallet.releaseCreditReservation(reservationId),
    grantMarketplaceSellerCredits: async (input) => {
      const granted = await wallet.grantAsset({
        userId: input.userId,
        asset: "studio_credit",
        amount: input.amount,
        source: "marketplace",
        sourceKey: input.requestKey,
        sourceRef: input.requestKey,
        expiresAt: null,
        reason: "마켓 크레딧 판매자 정산",
        metadata: input.metadata ?? {},
      });
      return { granted: granted.granted };
    },
  };
}
