/**
 * 사용량 쿼터 표시 모델 테스트 — 상태 경계·정직성(없는 상한 지어내지 않기)·
 * 상한 도달 문구(초기화 시점 + 대안 행동)를 고정한다.
 */

import { describe, expect, it } from "vitest";

import type { FreeAiRuntimeBudgetSnapshot } from "./free-ai-runtime-budget";
import {
  buildUsageQuotaView,
  nextQuotaResetAt,
  usageQuotaFromFreeAiSnapshot,
} from "./usage-quota";

const NOW = Date.UTC(2026, 9, 14, 3, 0, 0); // 2026-10-14 12:00 KST

describe("buildUsageQuotaView — 상태 경계", () => {
  const base = {
    scope: "character-chat-monthly" as const,
    limit: 300,
    period: "month" as const,
    resetsAt: nextQuotaResetAt("month", NOW),
  };

  it("여유 구간은 plenty, 잔여·비율을 계산한다", () => {
    const view = buildUsageQuotaView({ ...base, used: 12 });
    expect(view.state).toBe("plenty");
    expect(view.remaining).toBe(288);
    expect(view.usedRatio).toBeCloseTo(0.04);
    expect(view.canProceed).toBe(true);
    expect(view.copy.ko.headline).toContain("12/300");
    expect(view.copy.ko.headline).toContain("288회 남음");
  });

  it("절반 이하로 남으면 low, 90% 이상이면 critical", () => {
    expect(buildUsageQuotaView({ ...base, used: 200 }).state).toBe("low");
    expect(buildUsageQuotaView({ ...base, used: 270 }).state).toBe("critical");
  });

  it("잔여 3회 이하는 비율과 무관하게 critical이다", () => {
    const view = buildUsageQuotaView({
      scope: "ai-generation-daily",
      used: 997,
      limit: 1000,
      period: "day",
      resetsAt: null,
    });
    expect(view.state).toBe("critical");
  });

  it("상한 도달·초과는 exhausted이고 진행 불가다", () => {
    const view = buildUsageQuotaView({ ...base, used: 312 });
    expect(view.state).toBe("exhausted");
    expect(view.remaining).toBe(0);
    expect(view.usedRatio).toBe(1);
    expect(view.canProceed).toBe(false);
  });

  it("blocked 플래그가 있으면 잔여가 있어도 exhausted다 (제공자 차단 우선)", () => {
    const view = buildUsageQuotaView({ ...base, used: 3, blocked: true });
    expect(view.state).toBe("exhausted");
    expect(view.canProceed).toBe(false);
  });
});

describe("buildUsageQuotaView — 정직성", () => {
  it("limit null(BYOK)은 unlimited이고 숫자를 만들지 않는다", () => {
    const view = buildUsageQuotaView({
      scope: "character-chat-monthly",
      used: 42,
      limit: null,
      period: "month",
      resetsAt: null,
    });
    expect(view.state).toBe("unlimited");
    expect(view.remaining).toBeNull();
    expect(view.usedRatio).toBeNull();
    expect(view.canProceed).toBe(true);
    expect(view.copy.ko.headline).toContain("상한 없음");
  });

  it("limit 0 이하·비유한수는 unknown이고 진행 불가다", () => {
    const view = buildUsageQuotaView({
      scope: "ai-generation-daily",
      used: 0,
      limit: 0,
      period: "day",
      resetsAt: null,
    });
    expect(view.state).toBe("unknown");
    expect(view.canProceed).toBe(false);
    expect(view.copy.ko.headline).toBe("");
  });

  it("used 음수·소수는 정규화한다", () => {
    const view = buildUsageQuotaView({
      scope: "ai-generation-daily",
      used: 3.9,
      limit: 10,
      period: "day",
      resetsAt: null,
    });
    expect(view.used).toBe(3);
    expect(view.remaining).toBe(7);
  });
});

describe("상한 도달 안내 문구", () => {
  it("캐릭터 챗: 초기화 시점 + 다른 캐릭터·BYOK 대안을 함께 말한다", () => {
    const view = buildUsageQuotaView({
      scope: "character-chat-monthly",
      used: 300,
      limit: 300,
      period: "month",
      resetsAt: nextQuotaResetAt("month", NOW),
    });
    expect(view.copy.ko.detail).toContain("상한에 도달");
    expect(view.copy.ko.detail).toContain("다른 캐릭터");
    expect(view.copy.ko.detail).toContain("BYOK");
    expect(view.copy.en.detail).toContain("other characters");
  });

  it("무료 일일: 자동 유료 전환이 없음을 명시한다 (비용 원칙)", () => {
    const view = buildUsageQuotaView({
      scope: "managed-free-daily",
      used: 25,
      limit: 25,
      period: "day",
      resetsAt: nextQuotaResetAt("day", NOW),
    });
    expect(view.copy.ko.detail).toContain("유료 모델로 자동 전환되지는 않아요");
  });
});

describe("usageQuotaFromFreeAiSnapshot", () => {
  const guarded: FreeAiRuntimeBudgetSnapshot = {
    guarded: true,
    requests: 20,
    requestLimit: 25,
    reservedTokens: 10_000,
    reservedTokenLimit: 64_000,
    remainingRequests: 5,
    remainingReservedTokens: 54_000,
    blockedReason: null,
    blockedUntil: null,
    resetsAt: nextQuotaResetAt("day", NOW),
  };

  it("guarded 스냅샷을 일일 쿼터로 잇는다", () => {
    const view = usageQuotaFromFreeAiSnapshot(guarded);
    expect(view.scope).toBe("managed-free-daily");
    expect(view.used).toBe(20);
    expect(view.remaining).toBe(5);
    expect(view.state).toBe("low");
  });

  it("차단된 스냅샷은 exhausted, unguarded는 unlimited다", () => {
    expect(
      usageQuotaFromFreeAiSnapshot({ ...guarded, blockedReason: "rate-limit" }).state,
    ).toBe("exhausted");
    const unguarded = usageQuotaFromFreeAiSnapshot({
      ...guarded,
      guarded: false,
      requestLimit: null,
      remainingRequests: null,
    });
    expect(unguarded.state).toBe("unlimited");
  });
});

describe("nextQuotaResetAt", () => {
  it("일일은 다음 UTC 자정, 월간은 다음 달 1일 UTC다", () => {
    expect(nextQuotaResetAt("day", NOW)).toBe(Date.UTC(2026, 9, 15));
    expect(nextQuotaResetAt("month", NOW)).toBe(Date.UTC(2026, 10, 1));
    expect(nextQuotaResetAt("month", Date.UTC(2026, 11, 31))).toBe(Date.UTC(2027, 0, 1));
  });
});
