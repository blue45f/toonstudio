/**
 * marketplace-credit-payment.test.ts — 마켓 크레딧 결제 정산 단위 테스트.
 * 지갑은 스텁으로 대체한다 (DB 없음). 정식 실행은 vitest(CI 확인 항목).
 *
 * 케이스: KRW→크레딧 가격 변환(무료 null), 수수료 20% 분리,
 * 성공 정산(구매자 확정 + 판매자 적립 + 영수증), 본인 구매 거부,
 * 해제·만료 재사용 거부, 확정済 재호출 모호함 거부, 캡처 실패 시
 * 판매자 적립 미호출, 판매자 적립 실패 시 부분 정산 오류.
 */
import { describe, expect, it, vi } from "vitest";

import {
  MARKETPLACE_CREDIT_FEATURE,
  MarketplaceCreditError,
  marketplaceCreditIdempotencyKey,
  marketplacePriceCreditsFromKrw,
  settleMarketplaceCreditPayment,
  type MarketplaceCreditWallet,
} from "./marketplace-credit-payment";

function stubWallet(overrides: Partial<MarketplaceCreditWallet> = {}) {
  const calls = { reserve: 0, capture: 0, release: 0, grant: 0 };
  const grantedAmounts: number[] = [];
  const wallet: MarketplaceCreditWallet = {
    reserveStudioCredits: vi.fn(async (input) => {
      calls.reserve += 1;
      return {
        id: "res-market-1",
        status: "reserved" as const,
        requestedAmount: input.units ?? 0,
        capturedAmount: 0,
      };
    }),
    captureCreditReservation: vi.fn(async () => {
      calls.capture += 1;
      return {
        id: "res-market-1",
        status: "captured" as const,
        requestedAmount: 100,
        capturedAmount: 100,
      };
    }),
    releaseCreditReservation: vi.fn(async () => {
      calls.release += 1;
      return { id: "res-market-1", status: "released" as const };
    }),
    grantMarketplaceSellerCredits: vi.fn(async (input) => {
      calls.grant += 1;
      grantedAmounts.push(input.amount);
      return { granted: true };
    }),
    ...overrides,
  };
  return { wallet, calls, grantedAmounts };
}

const BASE = {
  buyerId: "buyer-1",
  sellerId: "seller-1",
  releaseId: "release-1",
  priceCredits: 100,
  requestId: "req-market-1",
};

describe("marketplace-credit-payment 가격·분리", () => {
  it("가변 가격 키는 market.purchase이다", () => {
    expect(MARKETPLACE_CREDIT_FEATURE).toBe("market.purchase");
  });

  it("KRW 가격을 크레딧으로 바꾸고 수수료 20%를 분리한다", () => {
    expect(marketplacePriceCreditsFromKrw(1_000)).toEqual({
      priceCredits: 100,
      sellerCredits: 80,
      platformFeeCredits: 20,
    });
    expect(marketplacePriceCreditsFromKrw(10_005)).toEqual({
      priceCredits: 1_001,
      sellerCredits: 801,
      platformFeeCredits: 200,
    });
  });

  it("0원 이하는 무료로 null을 반환한다", () => {
    expect(marketplacePriceCreditsFromKrw(0)).toBeNull();
    expect(marketplacePriceCreditsFromKrw(-500)).toBeNull();
  });

  it("멱등키는 접두사 + 요청 식별자이다", () => {
    expect(marketplaceCreditIdempotencyKey("req-1")).toBe(
      "marketplace-credit:req-1",
    );
  });
});

describe("marketplace-credit-payment 정산", () => {
  it("성공 시 구매자 확정 + 판매자 적립 + 분리 영수증을 반환한다", async () => {
    const { wallet, calls, grantedAmounts } = stubWallet();
    const receipt = await settleMarketplaceCreditPayment(wallet, BASE);
    expect(receipt).toEqual({
      buyerPaymentId: "res-market-1",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      releaseId: "release-1",
      priceCredits: 100,
      sellerCredits: 80,
      platformFeeCredits: 20,
    });
    expect(calls.reserve).toBe(1);
    expect(calls.capture).toBe(1);
    expect(calls.grant).toBe(1);
    expect(grantedAmounts).toEqual([80]);
  });

  it("본인 상품 크레딧 결제를 거부한다", async () => {
    const { wallet, calls } = stubWallet();
    await expect(
      settleMarketplaceCreditPayment(wallet, {
        ...BASE,
        sellerId: "buyer-1",
      }),
    ).rejects.toMatchObject({ code: "marketplace_self_purchase" });
    expect(calls.reserve).toBe(0);
  });

  it("해제된 예약의 requestId 재사용을 거부한다", async () => {
    const { wallet } = stubWallet({
      reserveStudioCredits: async () => ({
        id: "res-market-1",
        status: "released" as const,
        requestedAmount: 100,
        capturedAmount: 0,
      }),
    });
    await expect(
      settleMarketplaceCreditPayment(wallet, BASE),
    ).rejects.toMatchObject({
      code: "marketplace_request_reused_after_release",
    });
  });

  it("이미 확정된 예약의 재호출은 모호함으로 거부한다 (판매자 이중 적립 방지)", async () => {
    const { wallet, calls } = stubWallet({
      reserveStudioCredits: async () => ({
        id: "res-market-1",
        status: "captured" as const,
        requestedAmount: 100,
        capturedAmount: 100,
      }),
    });
    await expect(
      settleMarketplaceCreditPayment(wallet, BASE),
    ).rejects.toMatchObject({
      code: "marketplace_settlement_ambiguous",
    });
    expect(calls.grant).toBe(0);
  });

  it("캡처 실패 시 판매자 적립을 호출하지 않는다", async () => {
    const { wallet, calls } = stubWallet({
      captureCreditReservation: async () => ({
        id: "res-market-1",
        status: "released" as const,
        requestedAmount: 100,
        capturedAmount: 0,
      }),
    });
    await expect(
      settleMarketplaceCreditPayment(wallet, BASE),
    ).rejects.toMatchObject({ code: "marketplace_settlement_failed" });
    expect(calls.grant).toBe(0);
  });

  it("판매자 적립 실패 시 부분 정산 오류에 구매자 확정 상태를 담는다", async () => {
    const { wallet, calls } = stubWallet({
      grantMarketplaceSellerCredits: async () => ({ granted: false }),
    });
    let caught: unknown;
    try {
      await settleMarketplaceCreditPayment(wallet, BASE);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MarketplaceCreditError);
    expect(caught).toMatchObject({
      code: "marketplace_seller_credit_failed",
      details: { buyerCaptured: true, sellerGranted: false },
    });
    expect(calls.capture).toBe(1);
  });
});
