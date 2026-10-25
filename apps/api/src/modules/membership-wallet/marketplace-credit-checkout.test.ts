/**
 * marketplace-credit-checkout.test.ts — 마켓 크레딧 결제 체크아웃 단위 테스트.
 * 판정·정산·이용권 부여는 스텁으로 대체한다 (DB 없음).
 * 정식 실행은 vitest(CI 확인 항목).
 *
 * 케이스: 게이트 OFF면 판정·정산·부여를 호출하지 않고
 * PAID_OPERATIONS_DISABLED로 거부, 게이트 ON+유료 상품이면 서버 판정
 * 가격·판매자로 정산하고 이용권을 부여해 영수증을 반환, 이미 이용권
 * 있음·무료 상품이면 정산 없이 거부, 이용권 부여 실패 시 대조용 오류.
 */
import { describe, expect, it, vi } from "vitest";

import {
  checkoutMarketplaceWithCredits,
  MarketplaceCreditCheckoutError,
  type MarketplaceCreditCheckoutDeps,
} from "./marketplace-credit-checkout";
import type { MarketplaceCreditWallet } from "./marketplace-credit-payment";
import {
  InMemoryPaidOperationsSettingStore,
  PAID_OPERATIONS_DISABLED,
} from "./paid-operations-gate";

const GATE_ON = new InMemoryPaidOperationsSettingStore(true);
const GATE_OFF = new InMemoryPaidOperationsSettingStore(false);

function paidDecision() {
  return {
    product: {
      resourceId: "release-1",
      publisherId: "seller-1",
      productId: "seller-1/pack-1",
      productName: "팩 1",
    },
    amount: 1_000,
    operationMode: "paid" as const,
    alreadyEntitled: false,
    checkoutRequired: true,
  };
}

function stubDeps(overrides: Partial<MarketplaceCreditCheckoutDeps> = {}) {
  const calls = { decision: 0, settle: 0, grant: 0 };
  const settledInputs: Array<Record<string, unknown>> = [];
  const wallet: MarketplaceCreditWallet = {
    reserveStudioCredits: vi.fn(async () => ({
      id: "res-1",
      status: "reserved" as const,
      requestedAmount: 100,
      capturedAmount: 0,
    })),
    captureCreditReservation: vi.fn(async () => ({
      id: "res-1",
      status: "captured" as const,
      requestedAmount: 100,
      capturedAmount: 100,
    })),
    releaseCreditReservation: vi.fn(async () => ({})),
    grantMarketplaceSellerCredits: vi.fn(async () => ({ granted: true })),
  };
  const deps: MarketplaceCreditCheckoutDeps = {
    resolveDecision: vi.fn(async () => {
      calls.decision += 1;
      return paidDecision();
    }),
    settle: vi.fn(async (_wallet, input) => {
      calls.settle += 1;
      settledInputs.push(input as Record<string, unknown>);
      return {
        buyerPaymentId: "res-1",
        buyerId: "buyer-1",
        sellerId: "seller-1",
        releaseId: "release-1",
        priceCredits: 100,
        sellerCredits: 80,
        platformFeeCredits: 20,
      };
    }),
    grantEntitlement: vi.fn(async () => {
      calls.grant += 1;
      return { granted: true };
    }),
    ...overrides,
  };
  return { deps, wallet, calls, settledInputs };
}

const BASE = { userId: "buyer-1", releaseId: "release-1", requestId: "req-1" };

describe("marketplace-credit-checkout 게이트·판정", () => {
  it("게이트 OFF면 판정·정산·부여를 호출하지 않고 거부한다", async () => {
    const { deps, wallet, calls } = stubDeps();
    await expect(
      checkoutMarketplaceWithCredits(deps, wallet, BASE, GATE_OFF),
    ).rejects.toMatchObject({
      code: PAID_OPERATIONS_DISABLED,
      status: 403,
    });
    expect(calls).toEqual({ decision: 0, settle: 0, grant: 0 });
  });

  it("게이트 ON+유료 상품이면 서버 판정 가격·판매자로 정산하고 이용권을 부여한다", async () => {
    const { deps, wallet, calls, settledInputs } = stubDeps();
    const result = await checkoutMarketplaceWithCredits(
      deps,
      wallet,
      BASE,
      GATE_ON,
    );
    expect(result).toMatchObject({
      buyerPaymentId: "res-1",
      priceCredits: 100,
      sellerCredits: 80,
      platformFeeCredits: 20,
      entitled: true,
      productId: "seller-1/pack-1",
      krwAmount: 1_000,
    });
    expect(settledInputs[0]).toMatchObject({
      buyerId: "buyer-1",
      sellerId: "seller-1",
      priceCredits: 100,
    });
    expect(calls).toEqual({ decision: 1, settle: 1, grant: 1 });
  });

  it("이미 이용권이 있으면 정산하지 않고 거부한다", async () => {
    const { deps, wallet, calls } = stubDeps({
      resolveDecision: vi.fn(async () => ({
        ...paidDecision(),
        alreadyEntitled: true,
      })),
    });
    await expect(
      checkoutMarketplaceWithCredits(deps, wallet, BASE, GATE_ON),
    ).rejects.toMatchObject({ code: "marketplace_already_entitled" });
    expect(calls.settle).toBe(0);
    expect(calls.grant).toBe(0);
  });

  it("무료 상품이면 정산하지 않고 무료 획득 경로로 거부한다", async () => {
    const { deps, wallet, calls } = stubDeps({
      resolveDecision: vi.fn(async () => ({
        ...paidDecision(),
        amount: 0,
        operationMode: "free" as const,
        checkoutRequired: false,
      })),
    });
    await expect(
      checkoutMarketplaceWithCredits(deps, wallet, BASE, GATE_ON),
    ).rejects.toMatchObject({ code: "marketplace_free_item" });
    expect(calls.settle).toBe(0);
  });

  it("이용권 부여 실패 시 구매자 결제 식별자를 담은 대조용 오류를 반환한다", async () => {
    const { deps, wallet } = stubDeps({
      grantEntitlement: vi.fn(async () => ({ granted: false })),
    });
    const error = await checkoutMarketplaceWithCredits(
      deps,
      wallet,
      BASE,
      GATE_ON,
    ).catch((caught: unknown) => caught as MarketplaceCreditCheckoutError);
    expect(error.code).toBe("marketplace_entitlement_failed");
    expect(error.details).toMatchObject({
      buyerPaymentId: "res-1",
      buyerCaptured: true,
    });
  });

  it("식별자 누락 시 지갑·판정을 호출하지 않고 거부한다", async () => {
    const { deps, wallet, calls } = stubDeps();
    await expect(
      checkoutMarketplaceWithCredits(deps, wallet, { releaseId: "r" }, GATE_ON),
    ).rejects.toMatchObject({ code: "marketplace_checkout_invalid_input" });
    expect(calls.decision).toBe(0);
  });
});
