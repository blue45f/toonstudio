/**
 * membership-eager-topup.test.ts — 등급 변경 즉시 지급 훅 단위 테스트.
 * 지갑은 스텁으로 대체한다 (DB 없음). 정식 실행은 vitest(CI 확인 항목).
 *
 * 케이스: 미적용 시 getOverview 미호출, 적용 시 즉시 지급 보고(해결 등급·
 * 월 포함량·잔액), 해결 등급이 요청 등급과 다르면 해결 등급 보고,
 * getOverview 실패 시 예외 없이 toppedUp false 반환.
 */
import { describe, expect, it, vi } from "vitest";

import {
  applyMembershipEagerTopUp,
  type MembershipEagerTopUpWallet,
} from "./membership-eager-topup";

function stubWallet(overrides: Partial<MembershipEagerTopUpWallet> = {}) {
  const calls = { overview: 0 };
  const wallet: MembershipEagerTopUpWallet = {
    getOverview: vi.fn(async () => {
      calls.overview += 1;
      return {
        membership: { planId: "pro" },
        creditCycle: { monthlyIncluded: 5_000 },
        wallet: { studioCredits: { available: 5_000 } },
      };
    }),
    ...overrides,
  };
  return { wallet, calls };
}

describe("membership-eager-topup", () => {
  it("부여가 적용되지 않았으면 getOverview를 호출하지 않는다", async () => {
    const { wallet, calls } = stubWallet();
    const result = await applyMembershipEagerTopUp(wallet, {
      userId: "user-1",
      applied: false,
      requestedPlanId: "pro",
    });
    expect(result.toppedUp).toBe(false);
    expect(calls.overview).toBe(0);
  });

  it("부여 직후 getOverview로 즉시 지급을 보고한다", async () => {
    const { wallet, calls } = stubWallet();
    const result = await applyMembershipEagerTopUp(wallet, {
      userId: "user-1",
      applied: true,
      requestedPlanId: "pro",
    });
    expect(result).toEqual({
      toppedUp: true,
      requestedPlanId: "pro",
      resolvedPlanId: "pro",
      monthlyIncluded: 5_000,
      availableCredits: 5_000,
    });
    expect(calls.overview).toBe(1);
  });

  it("해결 등급이 요청 등급과 다르면 해결 등급을 그대로 보고한다", async () => {
    const { wallet } = stubWallet({
      getOverview: async () => ({
        membership: { planId: "creator" },
        creditCycle: { monthlyIncluded: 2_000 },
        wallet: { studioCredits: { available: 2_000 } },
      }),
    });
    const result = await applyMembershipEagerTopUp(wallet, {
      userId: "user-1",
      applied: true,
      requestedPlanId: "pro",
    });
    expect(result.toppedUp).toBe(true);
    expect(result.resolvedPlanId).toBe("creator");
    expect(result.monthlyIncluded).toBe(2_000);
  });

  it("getOverview 실패 시 예외 없이 toppedUp false를 반환한다", async () => {
    const { wallet } = stubWallet({
      getOverview: async () => {
        throw new Error("overview unavailable");
      },
    });
    const result = await applyMembershipEagerTopUp(wallet, {
      userId: "user-1",
      applied: true,
      requestedPlanId: "pro",
    });
    expect(result.toppedUp).toBe(false);
    expect(result.error).toBe("overview unavailable");
  });

  it("지갑 미주입 시 건너뛴다", async () => {
    const result = await applyMembershipEagerTopUp(null, {
      userId: "user-1",
      applied: true,
      requestedPlanId: "pro",
    });
    expect(result.toppedUp).toBe(false);
  });
});
