/**
 * studio-ai-credit-charge.test.ts — 서버 AI 크레딧 차감 오케스트레이션 단위 테스트.
 * 지갑은 스텁으로 대체한다 (DB 없음). 정식 실행은 vitest(CI 확인 항목).
 *
 * 케이스: 작업별 단가 키 매핑, 무료 풀 제외, 운영자 부담 경로 예약,
 * 성공 시 캡처 / 실패 시 해제 / 무료 풀 성공 시 해제, 지갑 미주입 시 건너뜀.
 */
import { describe, expect, it, vi } from "vitest";

import {
  beginStudioAiCreditCharge,
  settleStudioAiCreditCharge,
  shouldChargeStudioAiCredits,
  studioAiCreditFeatureForTask,
  studioAiCreditIdempotencyKey,
  type StudioAiCreditWallet,
} from "./studio-ai-credit-charge";

function stubWallet() {
  const calls = { reserve: 0, capture: 0, release: 0 };
  const wallet: StudioAiCreditWallet = {
    reserveStudioCredits: vi.fn(async () => {
      calls.reserve += 1;
      return { id: "credit-reservation-1", status: "reserved" };
    }),
    captureCreditReservation: vi.fn(async () => {
      calls.capture += 1;
      return { status: "captured" };
    }),
    releaseCreditReservation: vi.fn(async () => {
      calls.release += 1;
      return { status: "released" };
    }),
  };
  return { wallet, calls };
}

describe("studioAiCreditFeatureForTask", () => {
  it("translation은 ai.translation, 그 외 채팅 작업은 ai.text.generate를 쓴다 (새 단가 키 없음)", () => {
    expect(studioAiCreditFeatureForTask("translation")).toBe("ai.translation");
    for (const task of ["assistant", "composition", "scenario", "dialogue", "palette"]) {
      expect(studioAiCreditFeatureForTask(task)).toBe("ai.text.generate");
    }
  });

  it("멱등키는 지갑 상한(200자) 안에 든다", () => {
    const key = studioAiCreditIdempotencyKey("a".repeat(128));
    expect(key.startsWith("studio-ai-credit:")).toBe(true);
    expect(key.length).toBeLessThanOrEqual(200);
  });
});

describe("shouldChargeStudioAiCredits", () => {
  it("무료 풀만 있으면 차감 대상이 아니다", () => {
    expect(shouldChargeStudioAiCredits([{ freePool: true }])).toBe(false);
    expect(shouldChargeStudioAiCredits([])).toBe(false);
  });

  it("후보에 운영자 부담 제공자가 있으면 차감 대상이다", () => {
    expect(
      shouldChargeStudioAiCredits([{ freePool: true }, { freePool: false }]),
    ).toBe(true);
  });
});

describe("begin/settleStudioAiCreditCharge", () => {
  it("운영자 부담 경로에서 예약하고 성공 시 캡처한다", async () => {
    const { wallet, calls } = stubWallet();
    const charge = await beginStudioAiCreditCharge(wallet, {
      userId: "user-1",
      task: "composition",
      idempotencyKey: "studio-ai-operation-0000000000000001",
      providers: [{ freePool: false }],
    });
    expect(charge).toEqual({
      charged: true,
      reservationId: "credit-reservation-1",
      feature: "ai.text.generate",
    });
    expect(wallet.reserveStudioCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey:
          "studio-ai-credit:studio-ai-operation-0000000000000001",
      }),
    );
    await settleStudioAiCreditCharge(wallet, charge, {
      succeeded: true,
      providerFreePool: false,
    });
    expect(calls.capture).toBe(1);
    expect(calls.release).toBe(0);
  });

  it("실패 시 예약을 해제한다 (해제 케이스)", async () => {
    const { wallet, calls } = stubWallet();
    const charge = await beginStudioAiCreditCharge(wallet, {
      userId: "user-1",
      task: "composition",
      idempotencyKey: "studio-ai-operation-0000000000000001",
      providers: [{ freePool: false }],
    });
    await settleStudioAiCreditCharge(wallet, charge, {
      succeeded: false,
      providerFreePool: false,
    });
    expect(calls.release).toBe(1);
    expect(calls.capture).toBe(0);
  });

  it("무료 풀 제공자로 성공했으면 예약했던 크레딧을 해제한다", async () => {
    const { wallet, calls } = stubWallet();
    const charge = await beginStudioAiCreditCharge(wallet, {
      userId: "user-1",
      task: "translation",
      idempotencyKey: "studio-ai-operation-0000000000000001",
      providers: [{ freePool: true }, { freePool: false }],
    });
    expect(charge.feature).toBe("ai.translation");
    await settleStudioAiCreditCharge(wallet, charge, {
      succeeded: true,
      providerFreePool: true,
    });
    expect(calls.release).toBe(1);
    expect(calls.capture).toBe(0);
  });

  it("무료 풀만 있으면 예약을 잡지 않는다", async () => {
    const { wallet, calls } = stubWallet();
    const charge = await beginStudioAiCreditCharge(wallet, {
      userId: "user-1",
      task: "composition",
      idempotencyKey: "studio-ai-operation-0000000000000001",
      providers: [{ freePool: true }],
    });
    expect(charge).toEqual({ charged: false });
    expect(calls.reserve).toBe(0);
    await settleStudioAiCreditCharge(wallet, charge, {
      succeeded: true,
      providerFreePool: true,
    });
    expect(calls.capture).toBe(0);
    expect(calls.release).toBe(0);
  });

  it("지갑이 주입되지 않았으면 차감을 건너뛴다", async () => {
    const charge = await beginStudioAiCreditCharge(null, {
      userId: "user-1",
      task: "composition",
      idempotencyKey: "studio-ai-operation-0000000000000001",
      providers: [{ freePool: false }],
    });
    expect(charge).toEqual({ charged: false });
    await expect(
      settleStudioAiCreditCharge(null, charge, {
        succeeded: true,
        providerFreePool: false,
      }),
    ).resolves.toBeUndefined();
  });
});
