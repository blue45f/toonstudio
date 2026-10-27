/**
 * research-credit-charge.test.ts — 리서치 차감 오케스트레이션 단위 테스트.
 * 가짜 지갑·게이트 스토어로 검증한다.
 */
import { describe, expect, it, vi } from "vitest";

import {
  InMemoryPaidOperationsSettingStore,
} from "../membership-wallet/paid-operations-gate";
import {
  RESEARCH_CREDIT_FEATURE,
  ResearchCreditError,
  beginResearchCreditCharge,
  researchCreditIdempotencyKey,
  settleResearchCreditCharge,
} from "./research-credit-charge";

import type { ResearchCreditWallet } from "./research-credit-charge";

function walletHarness() {
  const reserve = vi.fn(async () => ({ id: "res-1", status: "reserved" }));
  const capture = vi.fn(async () => ({}));
  const release = vi.fn(async () => ({}));
  const wallet: ResearchCreditWallet = { reserveStudioCredits: reserve, captureCreditReservation: capture, releaseCreditReservation: release };
  return { wallet, reserve, capture, release };
}

describe("research-credit-charge 예약", () => {
  it("지갑이 없으면 차감하지 않는다", async () => {
    const charge = await beginResearchCreditCharge(undefined, {
      userId: "user-1",
      estimatedUnits: 4,
      idempotencyKey: "op-1",
      operation: "brief",
    });
    expect(charge).toEqual({ charged: false });
  });

  it("게이트 OFF면 403으로 거부한다", async () => {
    const { wallet, reserve } = walletHarness();
    const store = new InMemoryPaidOperationsSettingStore(false);
    await expect(beginResearchCreditCharge(wallet, {
      userId: "user-1",
      estimatedUnits: 4,
      idempotencyKey: "op-1",
      operation: "brief",
    }, store)).rejects.toBeInstanceOf(ResearchCreditError);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("게이트 ON이면 기존 단가 키로 예약하고 멱등키에 접두사를 붙인다", async () => {
    const { wallet, reserve } = walletHarness();
    const store = new InMemoryPaidOperationsSettingStore(true);
    const charge = await beginResearchCreditCharge(wallet, {
      userId: "user-1",
      estimatedUnits: 4,
      idempotencyKey: "op-1",
      operation: "brief",
    }, store);
    expect(charge.charged).toBe(true);
    expect(charge.reservationId).toBe("res-1");
    expect(reserve).toHaveBeenCalledTimes(1);
    const input = reserve.mock.calls[0][0];
    expect(input.feature).toBe(RESEARCH_CREDIT_FEATURE);
    expect(input.units).toBe(4);
    expect(input.idempotencyKey).toBe("research-credit:op-1");
    expect(input.metadata).toMatchObject({ source: "deepseek-research" });
    expect(researchCreditIdempotencyKey("op-1")).toBe("research-credit:op-1");
  });

  it("상한 20단위를 넘는 예상량은 거부한다", async () => {
    const { wallet } = walletHarness();
    const store = new InMemoryPaidOperationsSettingStore(true);
    await expect(beginResearchCreditCharge(wallet, {
      userId: "user-1",
      estimatedUnits: 21,
      idempotencyKey: "op-1",
      operation: "trend-digest",
    }, store)).rejects.toThrow();
  });

  it("지갑 예약 실패는 402로 감싼다", async () => {
    const { wallet } = walletHarness();
    wallet.reserveStudioCredits = vi.fn(async () => {
      throw new Error("insufficient");
    });
    const store = new InMemoryPaidOperationsSettingStore(true);
    const error = await beginResearchCreditCharge(wallet, {
      userId: "user-1",
      estimatedUnits: 2,
      idempotencyKey: "op-1",
      operation: "brief",
    }, store).catch((cause: unknown) => cause);
    expect((error as ResearchCreditError).status).toBe(402);
  });
});

describe("research-credit-charge 정산", () => {
  it("성공 시 실제 사용량으로 캡처하고 실패 시 해제한다", async () => {
    const { wallet, capture, release } = walletHarness();
    await settleResearchCreditCharge(wallet, {
      charged: true,
      reservationId: "res-1",
      units: 4,
    }, "success", 3);
    expect(capture).toHaveBeenCalledWith("res-1", 3);
    await settleResearchCreditCharge(wallet, {
      charged: true,
      reservationId: "res-1",
      units: 4,
    }, "failure");
    expect(release).toHaveBeenCalledWith("res-1");
  });

  it("미차감 건은 정산 호출을 하지 않는다", async () => {
    const { wallet, capture, release } = walletHarness();
    await settleResearchCreditCharge(wallet, { charged: false }, "success", 0);
    expect(capture).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });
});
