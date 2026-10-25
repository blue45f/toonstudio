/**
 * studio-decoration-credit-purchase.test.ts — 꾸미기 유료 아이템 결제 단위 테스트.
 * 지갑은 스텁으로 대체한다 (DB 없음). 정식 실행은 vitest(CI 확인 항목).
 *
 * 케이스: 카탈로그 가격 권위(샘플 3종), 카탈로그 외 아이템 거부(무료 경로),
 * 성공 구매(예약→확정, 멱등키 접두), 동일 requestId 재호출 재차감 없음,
 * 해제·만료 재사용 거부, 확정 실패 시 부분 결제 오류, 로그인 필요.
 */
import { describe, expect, it, vi } from "vitest";

import {
  DECORATION_CREDIT_CATALOG,
  decorationCreditPrice,
  findDecorationCreditItem,
} from "./studio-decoration-credit-catalog";
import {
  DecorationCreditError,
  decorationCreditIdempotencyKey,
  purchaseDecorationCredits,
  type DecorationCreditReservation,
  type DecorationCreditWallet,
} from "./studio-decoration-credit-purchase";

function stubWallet(
  overrides: Partial<DecorationCreditWallet> = {},
): DecorationCreditWallet & {
  calls: { reserve: number; capture: number };
  reserved: { priceCredits: number; idempotencyKey: string }[];
} {
  const calls = { reserve: 0, capture: 0 };
  const reserved: { priceCredits: number; idempotencyKey: string }[] = [];
  const wallet: DecorationCreditWallet = {
    reserveDecorationCredits: vi.fn(async (input) => {
      calls.reserve += 1;
      reserved.push({
        priceCredits: input.priceCredits,
        idempotencyKey: input.idempotencyKey,
      });
      return {
        id: "res-decor-1",
        status: "reserved" as const,
        requestedAmount: input.priceCredits,
        capturedAmount: 0,
      };
    }),
    captureDecorationReservation: vi.fn(async () => {
      calls.capture += 1;
      return {
        id: "res-decor-1",
        status: "captured" as const,
        requestedAmount: 50,
        capturedAmount: 50,
      };
    }),
    ...overrides,
  };
  return { ...wallet, calls, reserved };
}

describe("꾸미기 카탈로그", () => {
  it("샘플 3종이 구조 정의만으로 카탈로그에 있고 가격이 양수이다", () => {
    expect(DECORATION_CREDIT_CATALOG).toHaveLength(3);
    for (const item of DECORATION_CREDIT_CATALOG) {
      expect(item.priceCredits).toBeGreaterThan(0);
      expect(findDecorationCreditItem(item.id)?.id).toBe(item.id);
    }
  });

  it("카탈로그 외 아이템 가격은 null이다 (무료 배치 경로 신호)", () => {
    expect(decorationCreditPrice("decoration.unknown")).toBeNull();
    expect(decorationCreditPrice("")).toBeNull();
    expect(decorationCreditPrice(undefined)).toBeNull();
  });
});

describe("꾸미기 유료 아이템 결제", () => {
  it("카탈로그 가격으로 예약하고 확정한다 (서버 가격 권위)", async () => {
    const wallet = stubWallet();
    const result = await purchaseDecorationCredits(wallet, "user-1", {
      itemId: "decoration.sample.potted-plant",
      requestId: "req-decor-1",
    });
    expect(result).toEqual({
      purchaseId: "res-decor-1",
      itemId: "decoration.sample.potted-plant",
      priceCredits: 50,
      charged: true,
    });
    expect(wallet.calls).toEqual({ reserve: 1, capture: 1 });
    expect(wallet.reserved[0]).toEqual({
      priceCredits: 50,
      idempotencyKey: "decoration-credit:req-decor-1",
    });
    expect(decorationCreditIdempotencyKey("req-decor-1")).toBe(
      "decoration-credit:req-decor-1",
    );
  });

  it("카탈로그 외 아이템은 무료 경로로 거부하고 지갑을 호출하지 않는다", async () => {
    const wallet = stubWallet();
    await expect(
      purchaseDecorationCredits(wallet, "user-1", {
        itemId: "decoration.free-chair",
        requestId: "req-decor-free",
      }),
    ).rejects.toMatchObject({ code: "decoration_free_item", status: 400 });
    expect(wallet.calls).toEqual({ reserve: 0, capture: 0 });
  });

  it("동일 requestId 재호출(확정済 예약)은 재차감 없이 반환한다", async () => {
    const captured: DecorationCreditReservation = {
      id: "res-decor-1",
      status: "captured",
      requestedAmount: 120,
      capturedAmount: 120,
    };
    const wallet = stubWallet({
      reserveDecorationCredits: vi.fn(async () => captured),
    });
    const result = await purchaseDecorationCredits(wallet, "user-1", {
      itemId: "decoration.sample.neon-sign",
      requestId: "req-decor-2",
    });
    expect(result.priceCredits).toBe(120);
    expect(wallet.calls.capture).toBe(0);
  });

  it("해제된 예약의 멱등키 재사용은 409로 거부한다", async () => {
    const wallet = stubWallet({
      reserveDecorationCredits: vi.fn(async () => ({
        id: "res-decor-1",
        status: "released" as const,
        requestedAmount: 80,
        capturedAmount: 0,
      })),
    });
    await expect(
      purchaseDecorationCredits(wallet, "user-1", {
        itemId: "decoration.sample.floor-rug",
        requestId: "req-decor-3",
      }),
    ).rejects.toMatchObject({
      code: "decoration_request_reused_after_release",
      status: 409,
    });
  });

  it("확정 실패 시 부분 결제 오류를 반환한다", async () => {
    const wallet = stubWallet({
      captureDecorationReservation: vi.fn(async () => ({
        id: "res-decor-1",
        status: "released" as const,
        requestedAmount: 50,
        capturedAmount: 0,
      })),
    });
    await expect(
      purchaseDecorationCredits(wallet, "user-1", {
        itemId: "decoration.sample.potted-plant",
        requestId: "req-decor-4",
      }),
    ).rejects.toMatchObject({
      code: "decoration_settlement_failed",
      status: 409,
    });
  });

  it("로그인 없이 구매할 수 없다", async () => {
    const wallet = stubWallet();
    await expect(
      purchaseDecorationCredits(wallet, undefined, {
        itemId: "decoration.sample.potted-plant",
        requestId: "req-decor-5",
      }),
    ).rejects.toBeInstanceOf(DecorationCreditError);
    expect(wallet.calls.reserve).toBe(0);
  });
});
