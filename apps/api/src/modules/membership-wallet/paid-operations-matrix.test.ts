/**
 * paid-operations-matrix.test.ts — 게이트 ON/OFF × 유료/무료 매트릭스
 * 스텁 단언 (2단계 수익화 가동, 2026-10-25). 지갑·판정은 스텁이다 (DB 없음).
 * 정식 실행은 vitest(CI 확인 항목).
 *
 * 고정하는 매트릭스:
 *  - 게이트 OFF → 모든 유료 실행은 PAID_OPERATIONS_DISABLED(403)이며
 *    지갑을 호출하지 않는다 (spend·마켓 정산·마켓 체크아웃·꾸미기 결제·
 *    서버 AI 운영자 부담·서버 3D 운영자 부담·크레딧 구매 의도).
 *  - 게이트 OFF → 무료 경로는 게이트를 받지 않는다 (서버 AI 무료 풀만,
 *    3D BYOK, 꾸미기 카탈로그 외 무료 아이템).
 *  - 게이트 ON → 유료 실행은 스텁 지갑으로 성공한다 (spend·마켓 정산·
 *    꾸미기 결제). 크레딧 구매 의도는 마스터 ON만으로 열리지 않는다
 *    (레거시 플래그 false → credit_purchase_disabled, 결제 확인 식별자
 *    없으면 payment_unconfirmed) — 실제 과금 활성화가 아님을 고정한다.
 */
import { describe, expect, it, vi } from "vitest";

import { spendStudioCredits } from "./credit-spend";
import { requestCreditPurchase } from "./credit-purchase-intent";
import {
  settleMarketplaceCreditPayment,
  type MarketplaceCreditWallet,
} from "./marketplace-credit-payment";
import {
  checkoutMarketplaceWithCredits,
  type MarketplaceCreditCheckoutDeps,
} from "./marketplace-credit-checkout";
import {
  InMemoryPaidOperationsSettingStore,
  PAID_OPERATIONS_DISABLED,
} from "./paid-operations-gate";
import { purchaseDecorationCredits } from "./studio-decoration-credit-purchase";
import { beginStudioAiCreditCharge } from "../studio-ai/studio-ai-credit-charge";
import { beginStudio3dCreditCharge } from "../studio-ai/studio-3d-credit-charge";

const GATE_ON = new InMemoryPaidOperationsSettingStore(true);
const GATE_OFF = new InMemoryPaidOperationsSettingStore(false);

function spendWallet() {
  const calls = { estimate: 0, reserve: 0, capture: 0 };
  return {
    calls,
    wallet: {
      estimateCredits: vi.fn(async () => {
        calls.estimate += 1;
        return { feature: "ai.text.generate" as const, credits: 1, policy: {} };
      }),
      reserveStudioCredits: vi.fn(async () => {
        calls.reserve += 1;
        return {
          id: "res-spend-1",
          status: "reserved" as const,
          requestedAmount: 1,
          capturedAmount: 0,
        };
      }),
      captureCreditReservation: vi.fn(async () => {
        calls.capture += 1;
        return {
          id: "res-spend-1",
          status: "captured" as const,
          requestedAmount: 1,
          capturedAmount: 1,
        };
      }),
      getOverview: vi.fn(async () => ({
        wallet: {
          studioCredits: {
            available: 99,
            reserved: 0,
            lifetimeGranted: 100,
            lifetimeSpent: 1,
            bySource: {},
          },
        },
      })),
    },
  };
}

function marketWallet() {
  const calls = { reserve: 0, grant: 0 };
  const wallet: MarketplaceCreditWallet = {
    reserveStudioCredits: vi.fn(async () => {
      calls.reserve += 1;
      return {
        id: "res-market-1",
        status: "reserved" as const,
        requestedAmount: 100,
        capturedAmount: 0,
      };
    }),
    captureCreditReservation: vi.fn(async () => ({
      id: "res-market-1",
      status: "captured" as const,
      requestedAmount: 100,
      capturedAmount: 100,
    })),
    releaseCreditReservation: vi.fn(async () => ({})),
    grantMarketplaceSellerCredits: vi.fn(async () => {
      calls.grant += 1;
      return { granted: true };
    }),
  };
  return { calls, wallet };
}

function checkoutDeps(): {
  deps: MarketplaceCreditCheckoutDeps;
  calls: { decision: number; grant: number };
} {
  const calls = { decision: 0, grant: 0 };
  return {
    calls,
    deps: {
      resolveDecision: vi.fn(async () => {
        calls.decision += 1;
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
      }),
      settle: vi.fn(async (wallet, input, store) =>
        settleMarketplaceCreditPayment(wallet, input, store),
      ),
      grantEntitlement: vi.fn(async () => {
        calls.grant += 1;
        return { granted: true };
      }),
    },
  };
}

function decorationWallet() {
  const calls = { reserve: 0 };
  return {
    calls,
    wallet: {
      reserveDecorationCredits: vi.fn(async () => {
        calls.reserve += 1;
        return {
          id: "res-dec-1",
          status: "reserved" as const,
          requestedAmount: 50,
          capturedAmount: 0,
        };
      }),
      captureDecorationReservation: vi.fn(async () => ({
        id: "res-dec-1",
        status: "captured" as const,
        requestedAmount: 50,
        capturedAmount: 50,
      })),
    },
  };
}

describe("게이트 OFF × 유료 경로", () => {
  it("spend는 지갑을 호출하지 않고 거부한다", async () => {
    const { calls, wallet } = spendWallet();
    await expect(
      spendStudioCredits(
        wallet,
        "user-1",
        { resourceId: "ai.text.generate", pointPrice: 1, requestId: "req-1" },
        GATE_OFF,
      ),
    ).rejects.toMatchObject({ code: PAID_OPERATIONS_DISABLED, status: 403 });
    expect(calls.estimate).toBe(0);
    expect(calls.reserve).toBe(0);
  });

  it("마켓 정산은 지갑을 호출하지 않고 거부한다", async () => {
    const { calls, wallet } = marketWallet();
    await expect(
      settleMarketplaceCreditPayment(
        wallet,
        {
          buyerId: "buyer-1",
          sellerId: "seller-1",
          releaseId: "release-1",
          priceCredits: 100,
          requestId: "req-1",
        },
        GATE_OFF,
      ),
    ).rejects.toMatchObject({ code: PAID_OPERATIONS_DISABLED, status: 403 });
    expect(calls.reserve).toBe(0);
  });

  it("마켓 체크아웃은 판정을 호출하지 않고 거부한다", async () => {
    const { deps, calls } = checkoutDeps();
    const { wallet } = marketWallet();
    await expect(
      checkoutMarketplaceWithCredits(
        deps,
        wallet,
        { userId: "buyer-1", releaseId: "release-1", requestId: "req-1" },
        GATE_OFF,
      ),
    ).rejects.toMatchObject({ code: PAID_OPERATIONS_DISABLED, status: 403 });
    expect(calls.decision).toBe(0);
  });

  it("꾸미기 결제는 지갑을 호출하지 않고 거부한다", async () => {
    const { calls, wallet } = decorationWallet();
    await expect(
      purchaseDecorationCredits(
        wallet,
        "user-1",
        { itemId: "decoration.sample.potted-plant", requestId: "req-1" },
        GATE_OFF,
      ),
    ).rejects.toMatchObject({ code: PAID_OPERATIONS_DISABLED, status: 403 });
    expect(calls.reserve).toBe(0);
  });

  it("서버 AI 운영자 부담 차감은 예약하지 않고 거부한다", async () => {
    const wallet = {
      reserveStudioCredits: vi.fn(),
      captureCreditReservation: vi.fn(),
      releaseCreditReservation: vi.fn(),
    };
    await expect(
      beginStudioAiCreditCharge(
        wallet,
        {
          userId: "user-1",
          task: "assistant",
          idempotencyKey: "ai-1",
          providers: [{ freePool: false }],
        },
        GATE_OFF,
      ),
    ).rejects.toMatchObject({ code: PAID_OPERATIONS_DISABLED, status: 403 });
    expect(wallet.reserveStudioCredits).not.toHaveBeenCalled();
  });

  it("서버 3D 운영자 부담 차감은 예약하지 않고 거부한다", async () => {
    const wallet = {
      reserveStudioCredits: vi.fn(),
      captureCreditReservation: vi.fn(),
      releaseCreditReservation: vi.fn(),
    };
    await expect(
      beginStudio3dCreditCharge(
        wallet,
        {
          userId: "user-1",
          requestId: "req-3d-1",
          mode: "text",
          operatorFunded: true,
        },
        GATE_OFF,
      ),
    ).rejects.toMatchObject({ code: PAID_OPERATIONS_DISABLED, status: 403 });
    expect(wallet.reserveStudioCredits).not.toHaveBeenCalled();
  });

  it("크레딧 구매 의도는 레거시 플래그와 무관하게 거부한다", async () => {
    const wallet = { grantPurchasedCredits: vi.fn() };
    await expect(
      requestCreditPurchase(
        wallet,
        "user-1",
        { packId: "credit-pack-500", requestId: "req-1" },
        true,
        GATE_OFF,
      ),
    ).rejects.toMatchObject({ code: PAID_OPERATIONS_DISABLED, status: 403 });
    expect(wallet.grantPurchasedCredits).not.toHaveBeenCalled();
  });
});

describe("게이트 OFF × 무료 경로", () => {
  it("서버 AI 무료 풀만이면 게이트 없이 차감 없음으로 통과한다", async () => {
    const wallet = {
      reserveStudioCredits: vi.fn(),
      captureCreditReservation: vi.fn(),
      releaseCreditReservation: vi.fn(),
    };
    const result = await beginStudioAiCreditCharge(
      wallet,
      {
        userId: "user-1",
        task: "assistant",
        idempotencyKey: "ai-1",
        providers: [{ freePool: true }],
      },
      GATE_OFF,
    );
    expect(result).toEqual({ charged: false });
    expect(wallet.reserveStudioCredits).not.toHaveBeenCalled();
  });

  it("서버 3D BYOK이면 게이트 없이 차감 없음으로 통과한다", async () => {
    const wallet = {
      reserveStudioCredits: vi.fn(),
      captureCreditReservation: vi.fn(),
      releaseCreditReservation: vi.fn(),
    };
    const result = await beginStudio3dCreditCharge(
      wallet,
      {
        userId: "user-1",
        requestId: "req-3d-1",
        mode: "text",
        providerApiKey: "user-key",
        operatorFunded: true,
      },
      GATE_OFF,
    );
    expect(result).toEqual({ charged: false });
    expect(wallet.reserveStudioCredits).not.toHaveBeenCalled();
  });

  it("꾸미기 카탈로그 외 아이템은 게이트와 무관하게 무료 경로로 거부된다", async () => {
    const { calls, wallet } = decorationWallet();
    await expect(
      purchaseDecorationCredits(
        wallet,
        "user-1",
        { itemId: "free-chair", requestId: "req-1" },
        GATE_OFF,
      ),
    ).rejects.toMatchObject({ code: "decoration_free_item" });
    expect(calls.reserve).toBe(0);
  });
});

describe("게이트 ON × 유료 경로", () => {
  it("spend가 성공한다", async () => {
    const { wallet } = spendWallet();
    const result = await spendStudioCredits(
      wallet,
      "user-1",
      { resourceId: "ai.text.generate", pointPrice: 1, requestId: "req-1" },
      GATE_ON,
    );
    expect(result.spendEventId).toBe("res-spend-1");
    expect(result.balance.available).toBe(99);
  });

  it("마켓 체크아웃이 정산·이용권 부여까지 성공한다", async () => {
    const { deps } = checkoutDeps();
    const { wallet } = marketWallet();
    const result = await checkoutMarketplaceWithCredits(
      deps,
      wallet,
      { userId: "buyer-1", releaseId: "release-1", requestId: "req-1" },
      GATE_ON,
    );
    expect(result.entitled).toBe(true);
    expect(result.sellerCredits).toBe(80);
    expect(result.platformFeeCredits).toBe(20);
  });

  it("꾸미기 결제가 성공한다", async () => {
    const { wallet } = decorationWallet();
    const result = await purchaseDecorationCredits(
      wallet,
      "user-1",
      { itemId: "decoration.sample.potted-plant", requestId: "req-1" },
      GATE_ON,
    );
    expect(result).toEqual({
      purchaseId: "res-dec-1",
      itemId: "decoration.sample.potted-plant",
      priceCredits: 50,
      charged: true,
    });
  });

  it("크레딧 구매 의도는 마스터 ON만으로 열리지 않는다", async () => {
    const wallet = { grantPurchasedCredits: vi.fn() };
    await expect(
      requestCreditPurchase(
        wallet,
        "user-1",
        { packId: "credit-pack-500", requestId: "req-1" },
        false,
        GATE_ON,
      ),
    ).rejects.toMatchObject({ code: "credit_purchase_disabled" });
    expect(wallet.grantPurchasedCredits).not.toHaveBeenCalled();
  });
});
