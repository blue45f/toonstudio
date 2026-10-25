/**
 * credit-purchase-intent.test.ts — 크레딧 구매 의도 단위 테스트.
 * 지갑은 스텁으로 대체한다 (DB·PG 없음). 정식 실행은 vitest(CI 확인 항목).
 *
 * 케이스: 현행 게이트 OFF(false) 확인, 게이트 OFF 거부 시 지갑·PG
 * 미호출, 팩 가격 정합(크레딧 × 10원), 게이트 on + 결제 확인 시 적립
 * (만료 null), 게이트 on에서 결제 확인 없으면 적립 거부, 미판매 팩
 * 거부, 로그인 필요. PG 호출은 어떤 케이스에서도 만들지 않는다.
 */
import { describe, expect, it, vi } from "vitest";

import {
  CREDIT_PACK_CATALOG,
  findCreditPack,
  isCreditPackCatalogConsistent,
  isCreditPackPriceConsistent,
} from "./credit-pack-catalog";
import {
  CREDIT_PURCHASES_ENABLED,
  CreditPurchaseError,
  PURCHASED_CREDIT_EXPIRY,
  creditPurchaseRequestKey,
  requestCreditPurchase,
  type CreditPurchaseWallet,
} from "./credit-purchase-intent";

function stubWallet(
  overrides: Partial<CreditPurchaseWallet> = {},
): CreditPurchaseWallet & { calls: { grant: number } } {
  const calls = { grant: 0 };
  const wallet: CreditPurchaseWallet = {
    grantPurchasedCredits: vi.fn(async () => {
      calls.grant += 1;
      return { granted: true };
    }),
    ...overrides,
  };
  return { ...wallet, calls };
}

describe("크레딧 팩 카탈로그", () => {
  it("현행 정책 게이트는 OFF이다", () => {
    expect(CREDIT_PURCHASES_ENABLED).toBe(false);
  });

  it("팩 4종의 가격이 크레딧 × 10원과 일치한다", () => {
    expect(CREDIT_PACK_CATALOG).toHaveLength(4);
    expect(isCreditPackCatalogConsistent()).toBe(true);
    for (const pack of CREDIT_PACK_CATALOG) {
      expect(findCreditPack(pack.id)).toEqual(pack);
      expect(isCreditPackPriceConsistent(pack)).toBe(true);
      expect(pack.krwPrice).toBe(pack.credits * 10);
    }
  });

  it("가격이 불일치하는 팩은 정합성 검사를 통과하지 못한다", () => {
    expect(
      isCreditPackPriceConsistent({
        id: "credit-pack-bad",
        credits: 100,
        krwPrice: 999,
      }),
    ).toBe(false);
  });
});

describe("크레딧 구매 의도", () => {
  it("게이트 OFF에서는 구매가 거부되고 지갑을 호출하지 않는다", async () => {
    const wallet = stubWallet();
    await expect(
      requestCreditPurchase(
        wallet,
        "user-1",
        { packId: "credit-pack-500", requestId: "req-buy-1" },
        false,
      ),
    ).rejects.toMatchObject({
      code: "credit_purchase_disabled",
      status: 403,
    });
    expect(wallet.calls.grant).toBe(0);
  });

  it("게이트 on + 결제 확인 시 구매 크레딧을 만료 null로 적립한다", async () => {
    const wallet = stubWallet();
    const result = await requestCreditPurchase(
      wallet,
      "user-1",
      {
        packId: "credit-pack-1000",
        requestId: "req-buy-2",
        paymentConfirmationId: "pg-confirm-1",
      },
      true,
    );
    expect(result).toEqual({
      purchaseIntentId: "credit-purchase:req-buy-2",
      packId: "credit-pack-1000",
      credits: 1000,
      krwPrice: 10000,
      granted: true,
      expiresAt: null,
    });
    expect(PURCHASED_CREDIT_EXPIRY).toBeNull();
    expect(creditPurchaseRequestKey("req-buy-2")).toBe(
      "credit-purchase:req-buy-2",
    );
    expect(wallet.calls.grant).toBe(1);
  });

  it("게이트 on이라도 결제 확인 식별자가 없으면 적립하지 않는다", async () => {
    const wallet = stubWallet();
    await expect(
      requestCreditPurchase(
        wallet,
        "user-1",
        { packId: "credit-pack-100", requestId: "req-buy-3" },
        true,
      ),
    ).rejects.toMatchObject({
      code: "credit_purchase_payment_unconfirmed",
      status: 409,
    });
    expect(wallet.calls.grant).toBe(0);
  });

  it("판매하지 않는 팩은 게이트와 무관하게 거부한다", async () => {
    const wallet = stubWallet();
    await expect(
      requestCreditPurchase(
        wallet,
        "user-1",
        { packId: "credit-pack-999", requestId: "req-buy-4" },
        false,
      ),
    ).rejects.toMatchObject({
      code: "credit_purchase_pack_not_found",
      status: 400,
    });
    expect(wallet.calls.grant).toBe(0);
  });

  it("로그인 없이 구매 의도를 만들 수 없다", async () => {
    const wallet = stubWallet();
    await expect(
      requestCreditPurchase(
        wallet,
        undefined,
        { packId: "credit-pack-100", requestId: "req-buy-5" },
        false,
      ),
    ).rejects.toBeInstanceOf(CreditPurchaseError);
    expect(wallet.calls.grant).toBe(0);
  });
});
