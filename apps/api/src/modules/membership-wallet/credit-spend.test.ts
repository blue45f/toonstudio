/**
 * credit-spend.test.ts — spend 순수 로직(credit-spend.ts) 단위 테스트.
 * 지갑 서비스는 스텁으로 대체한다 (DB 없음). 정식 실행은 vitest(CI 확인 항목).
 *
 * 케이스: 예약->캡처 성공, 멱등 재호출, 해제·만료된 예약 재사용 거부,
 * 가격 불일치, 단가 미정 대상, 잔액 부족·일 한도 전파(캡처 미호출).
 */
import { describe, expect, it, vi } from "vitest";

import {
  CreditSpendError,
  resolveCreditSpendFeature,
  spendStudioCredits,
  type CreditSpendWallet,
} from "./credit-spend";
import { InMemoryPaidOperationsSettingStore } from "./paid-operations-gate";

/** 기존 성공 경로용 마스터 ON 스토어 (토글 테스트는 별도 인스턴스 사용). */
const GATE_ON = new InMemoryPaidOperationsSettingStore(true);

const BALANCE = {
  available: 490,
  reserved: 0,
  lifetimeGranted: 500,
  lifetimeSpent: 10,
  bySource: { membership: 490 },
};

function stubWallet(overrides: Partial<CreditSpendWallet> = {}) {
  const calls = { reserve: 0, capture: 0, estimate: 0, overview: 0 };
  const wallet: CreditSpendWallet = {
    estimateCredits: vi.fn(async () => {
      calls.estimate += 1;
      return { feature: "ai.text.generate" as const, credits: 1, policy: {} };
    }),
    reserveStudioCredits: vi.fn(async () => {
      calls.reserve += 1;
      return { id: "reservation-1", status: "reserved" as const, requestedAmount: 1, capturedAmount: 0 };
    }),
    captureCreditReservation: vi.fn(async (id: string) => {
      calls.capture += 1;
      return { id, status: "captured" as const, requestedAmount: 1, capturedAmount: 1 };
    }),
    getOverview: vi.fn(async () => {
      calls.overview += 1;
      return { wallet: { studioCredits: BALANCE } };
    }),
    ...overrides,
  } as CreditSpendWallet;
  return { wallet, calls };
}

describe("resolveCreditSpendFeature", () => {
  it("기존 단가 키만 지출 대상으로 인정한다", () => {
    expect(resolveCreditSpendFeature("ai.text.generate")).toBe("ai.text.generate");
    expect(resolveCreditSpendFeature("ai.translation")).toBe("ai.translation");
    expect(resolveCreditSpendFeature("market-resource-123")).toBeNull();
    expect(resolveCreditSpendFeature("")).toBeNull();
    // 가변 가격 키는 spend API에서 제외하고 전용 정산 모듈에서만 처리한다.
    expect(resolveCreditSpendFeature("market.purchase")).toBeNull();
  });
});

describe("spendStudioCredits", () => {
  it("예약 후 캡처하고 spendEventId와 차감 후 잔액을 반환한다", async () => {
    const { wallet, calls } = stubWallet();
    const result = await spendStudioCredits(wallet, "user-1", {
      resourceId: "ai.text.generate",
      pointPrice: 1,
      requestId: "req-1",
    }, GATE_ON);
    expect(result.spendEventId).toBe("reservation-1");
    expect(result.balance).toEqual(BALANCE);
    expect(calls).toEqual({ reserve: 1, capture: 1, estimate: 1, overview: 1 });
    expect(wallet.reserveStudioCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", idempotencyKey: "req-1" }),
    );
  });

  it("동일 requestId로 이미 캡처된 예약이면 재차감 없이 동일 spendEventId를 반환한다 (멱등)", async () => {
    const { wallet, calls } = stubWallet({
      reserveStudioCredits: vi.fn(async () => ({
        id: "reservation-1",
        status: "captured" as const,
        requestedAmount: 1,
        capturedAmount: 1,
      })),
    });
    const result = await spendStudioCredits(wallet, "user-1", {
      resourceId: "ai.text.generate",
      pointPrice: 1,
      requestId: "req-1",
    }, GATE_ON);
    expect(result.spendEventId).toBe("reservation-1");
    expect(calls.capture).toBe(0);
  });

  it("해제된 예약의 requestId 재사용은 충돌로 거부한다", async () => {
    const { wallet } = stubWallet({
      reserveStudioCredits: vi.fn(async () => ({
        id: "reservation-1",
        status: "released" as const,
        requestedAmount: 1,
        capturedAmount: 0,
      })),
    });
    await expect(
      spendStudioCredits(wallet, "user-1", {
        resourceId: "ai.text.generate",
        pointPrice: 1,
        requestId: "req-1",
      }, GATE_ON),
    ).rejects.toMatchObject({ code: "spend_request_reused_after_release" });
    expect(wallet.captureCreditReservation).not.toHaveBeenCalled();
  });

  it("만료된 예약의 requestId 재사용은 충돌로 거부한다 (만료 케이스)", async () => {
    const { wallet } = stubWallet({
      reserveStudioCredits: vi.fn(async () => ({
        id: "reservation-1",
        status: "expired" as const,
        requestedAmount: 1,
        capturedAmount: 0,
      })),
    });
    await expect(
      spendStudioCredits(wallet, "user-1", {
        resourceId: "ai.text.generate",
        pointPrice: 1,
        requestId: "req-1",
      }, GATE_ON),
    ).rejects.toMatchObject({ code: "spend_request_reused_after_release" });
  });

  it("서버 단가와 다른 pointPrice는 예약을 잡기 전에 거부한다", async () => {
    const { wallet, calls } = stubWallet();
    await expect(
      spendStudioCredits(wallet, "user-1", {
        resourceId: "ai.text.generate",
        pointPrice: 999,
        requestId: "req-1",
      }, GATE_ON),
    ).rejects.toMatchObject({ code: "spend_price_mismatch" });
    expect(calls.reserve).toBe(0);
  });

  it("단가 키가 없는 대상은 가격 미정으로 거부한다", async () => {
    const { wallet, calls } = stubWallet();
    await expect(
      spendStudioCredits(wallet, "user-1", {
        resourceId: "market-resource-123",
        pointPrice: 10,
        requestId: "req-1",
      }, GATE_ON),
    ).rejects.toMatchObject({ code: "spend_resource_not_priced" });
    expect(calls.reserve).toBe(0);
  });

  it("잔액 부족 시 예약 실패가 전파되고 캡처는 호출되지 않는다 (한도 케이스)", async () => {
    const failure = Object.assign(new Error("사용 가능한 잔액이 부족합니다."), {
      code: "wallet_balance_insufficient",
    });
    const { wallet, calls } = stubWallet({
      reserveStudioCredits: vi.fn(async () => {
        calls.reserve += 1;
        throw failure;
      }),
    });
    await expect(
      spendStudioCredits(wallet, "user-1", {
        resourceId: "ai.text.generate",
        pointPrice: 1,
        requestId: "req-1",
      }, GATE_ON),
    ).rejects.toBe(failure);
    expect(calls.capture).toBe(0);
  });

  it("일 한도 초과 시 예약 실패가 전파되고 캡처는 호출되지 않는다", async () => {
    const failure = Object.assign(new Error("오늘 사용할 수 있는 Studio Credit 한도를 초과했습니다."), {
      code: "studio_credit_daily_limit_exceeded",
    });
    const { wallet, calls } = stubWallet({
      reserveStudioCredits: vi.fn(async () => {
        throw failure;
      }),
    });
    await expect(
      spendStudioCredits(wallet, "user-1", {
        resourceId: "ai.text.generate",
        pointPrice: 1,
        requestId: "req-1",
      }, GATE_ON),
    ).rejects.toBe(failure);
    expect(calls.capture).toBe(0);
    expect(wallet.getOverview).not.toHaveBeenCalled();
  });

  it("로그인 사용자가 없으면 403으로 거부한다", async () => {
    const { wallet } = stubWallet();
    const error = await spendStudioCredits(wallet, undefined, {
      resourceId: "ai.text.generate",
      pointPrice: 1,
      requestId: "req-1",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CreditSpendError);
    expect((error as CreditSpendError).status).toBe(403);
  });
});

describe("spend 유료 운영 게이트", () => {
  it("스토어 미주입(기본 OFF)에서는 지출이 거부되고 지갑을 호출하지 않는다", async () => {
    const { wallet, calls } = stubWallet();
    const error = await spendStudioCredits(wallet, "user-1", {
      resourceId: "ai.text.generate",
      pointPrice: 1,
      requestId: "req-gate-off",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CreditSpendError);
    expect(error).toMatchObject({
      code: "PAID_OPERATIONS_DISABLED",
      status: 403,
    });
    expect(calls).toEqual({ reserve: 0, capture: 0, estimate: 0, overview: 0 });
  });

  it("마스터 OFF 스토어에서는 지출이 거부되고 지갑을 호출하지 않는다", async () => {
    const { wallet, calls } = stubWallet();
    const gateOff = new InMemoryPaidOperationsSettingStore(false);
    await expect(
      spendStudioCredits(
        wallet,
        "user-1",
        {
          resourceId: "ai.text.generate",
          pointPrice: 1,
          requestId: "req-gate-off-2",
        },
        gateOff,
      ),
    ).rejects.toMatchObject({
      code: "PAID_OPERATIONS_DISABLED",
      status: 403,
    });
    expect(calls.reserve).toBe(0);
  });

  it("토글 ON→OFF→ON 변경이 호출마다 즉시 반영된다 (캐시 없음)", async () => {
    const { wallet } = stubWallet();
    const store = new InMemoryPaidOperationsSettingStore(false);
    const body = {
      resourceId: "ai.text.generate",
      pointPrice: 1,
      requestId: "req-gate-toggle",
    };
    await expect(spendStudioCredits(wallet, "user-1", body, store)).rejects
      .toMatchObject({ code: "PAID_OPERATIONS_DISABLED" });
    await store.setPaidOperationsEnabled(true);
    const result = await spendStudioCredits(wallet, "user-1", body, store);
    expect(result.spendEventId).toBe("reservation-1");
    await store.setPaidOperationsEnabled(false);
    await expect(spendStudioCredits(wallet, "user-1", body, store)).rejects
      .toMatchObject({ code: "PAID_OPERATIONS_DISABLED" });
  });
});
