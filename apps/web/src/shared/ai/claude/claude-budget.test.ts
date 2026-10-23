// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLAUDE_BUDGET_MAX_USD,
  claudeBudgetPercent,
  CLAUDE_BUDGET_STORAGE_KEY,
  evaluateClaudeBudget,
  getClaudeBudget,
  normalizeClaudeBudgetLimit,
  resetClaudeBudgetForTests,
  setClaudeBudgetLimit,
  subscribeClaudeBudget,
} from "./claude-budget";

describe("normalizeClaudeBudgetLimit", () => {
  it("센트 단위로 반올림하고 정상 범위만 받는다", () => {
    expect(normalizeClaudeBudgetLimit(1)).toBe(1);
    expect(normalizeClaudeBudgetLimit(0.125)).toBe(0.13);
    expect(normalizeClaudeBudgetLimit(CLAUDE_BUDGET_MAX_USD)).toBe(CLAUDE_BUDGET_MAX_USD);
  });

  it("0 이하·비정상·상한 초과는 받지 않는다", () => {
    for (const value of [0, -1, 0.004, CLAUDE_BUDGET_MAX_USD + 1, Number.NaN, Number.POSITIVE_INFINITY, "5", null, undefined]) {
      expect(normalizeClaudeBudgetLimit(value)).toBeNull();
    }
  });
});

describe("evaluateClaudeBudget", () => {
  it("한도가 없으면 항상 통과한다", () => {
    expect(evaluateClaudeBudget(null, 12, 3)).toEqual({ kind: "no-limit" });
  });

  it("쓴 금액과 이번 요청의 상한을 더해도 한도 안이면 남은 금액을 알려 준다", () => {
    expect(evaluateClaudeBudget(1, 0.4, 0.17)).toEqual({ kind: "within", remainingUsd: 0.6 });
  });

  it("딱 한도에 닿는 요청은 통과하고 한 푼이라도 넘으면 넘을 수 있다고 알린다", () => {
    expect(evaluateClaudeBudget(1, 0.83, 0.17)).toEqual({ kind: "within", remainingUsd: 0.17 });
    expect(evaluateClaudeBudget(1, 0.83, 0.18)).toEqual({ kind: "exceeds", remainingUsd: 0.17, capUsd: 0.18 });
  });

  it("부동소수 누적 오차로 경계가 뒤집히지 않는다", () => {
    // 0.1 + 0.2 = 0.30000000000000004
    expect(evaluateClaudeBudget(0.5, 0.1 + 0.2, 0.2)).toMatchObject({ kind: "within" });
    expect(evaluateClaudeBudget(0.5, 0.1 + 0.2, 0.21)).toMatchObject({ kind: "exceeds" });
  });

  it("이미 한도를 넘겼으면 남은 금액은 0이고 어떤 요청이든 넘을 수 있다", () => {
    expect(evaluateClaudeBudget(1, 1.5, 0.01)).toEqual({ kind: "exceeds", remainingUsd: 0, capUsd: 0.01 });
  });

  it("한도는 있는데 단가를 모르는 모델이면 비용을 가늠할 수 없다고 알린다", () => {
    expect(evaluateClaudeBudget(2, 0.5, null)).toEqual({ kind: "unknown-cost", remainingUsd: 1.5 });
  });

  it("상한이 NaN·무한대·음수이면 통과시키지 않고 확인을 요구한다", () => {
    for (const cap of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -5]) {
      expect(evaluateClaudeBudget(10, 9.99, cap)).toEqual({ kind: "unknown-cost", remainingUsd: 0.01 });
    }
  });

  it("쓴 금액이나 한도 자체가 비정상이어도 통과시키지 않는다", () => {
    expect(evaluateClaudeBudget(10, Number.NaN, 0.1)).toEqual({ kind: "unknown-cost", remainingUsd: 0 });
    expect(evaluateClaudeBudget(10, Number.POSITIVE_INFINITY, 0.1)).toEqual({ kind: "unknown-cost", remainingUsd: 0 });
    expect(evaluateClaudeBudget(Number.NaN, 1, 0.1)).toEqual({ kind: "unknown-cost", remainingUsd: 0 });
    expect(evaluateClaudeBudget(0, 0, 0.1)).toEqual({ kind: "unknown-cost", remainingUsd: 0 });
    expect(evaluateClaudeBudget(-1, 0, 0.1)).toEqual({ kind: "unknown-cost", remainingUsd: 0 });
  });
});

describe("claudeBudgetPercent", () => {
  it("쓴 금액을 한도에 대한 정수 백분율로 바꾸고 0~100으로 묶는다", () => {
    expect(claudeBudgetPercent(2, 0.5)).toBe(25);
    expect(claudeBudgetPercent(2, 0)).toBe(0);
    expect(claudeBudgetPercent(2, 5)).toBe(100);
    expect(claudeBudgetPercent(2, -1)).toBe(0);
  });

  it("한도가 없거나 비정상이면 null", () => {
    expect(claudeBudgetPercent(null, 1)).toBeNull();
    expect(claudeBudgetPercent(0, 1)).toBeNull();
  });
});

describe("예산 저장소", () => {
  beforeEach(() => {
    localStorage.clear();
    resetClaudeBudgetForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetClaudeBudgetForTests();
  });

  it("한도를 정하면 구독자에게 알리고 이 브라우저에만 값을 저장한다", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeClaudeBudget(listener);

    expect(setClaudeBudgetLimit(2.5)).toBe(true);

    expect(getClaudeBudget().limitUsd).toBe(2.5);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(CLAUDE_BUDGET_STORAGE_KEY) ?? "null")).toEqual({ limitUsd: 2.5 });
    unsubscribe();
  });

  it("정상 범위 밖의 값은 거절하고 기존 한도를 그대로 둔다", () => {
    setClaudeBudgetLimit(1);

    expect(setClaudeBudgetLimit(-3)).toBe(false);
    expect(setClaudeBudgetLimit(Number.NaN)).toBe(false);

    expect(getClaudeBudget().limitUsd).toBe(1);
  });

  it("null로 한도를 지우면 저장값도 지운다", () => {
    setClaudeBudgetLimit(1);
    expect(setClaudeBudgetLimit(null)).toBe(true);
    expect(getClaudeBudget().limitUsd).toBeNull();
    expect(localStorage.getItem(CLAUDE_BUDGET_STORAGE_KEY)).toBeNull();
  });

  it("저장소가 막혀 있어도 이번 세션의 한도는 메모리에서 유효하다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(setClaudeBudgetLimit(3)).toBe(true);
    expect(getClaudeBudget().limitUsd).toBe(3);
  });

  describe("다른 탭의 변경 따라가기(storage 이벤트)", () => {
    function fire(key: string | null, newValue: string | null) {
      window.dispatchEvent(new StorageEvent("storage", { key, newValue, storageArea: localStorage }));
    }

    it("다른 탭이 한도를 정하면 이 탭도 따라가고 구독자에게 알린다", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeClaudeBudget(listener);

      fire(CLAUDE_BUDGET_STORAGE_KEY, JSON.stringify({ limitUsd: 4 }));

      expect(getClaudeBudget().limitUsd).toBe(4);
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it("다른 탭이 한도를 지우면(키 삭제·저장소 비우기) 한도 없음이 된다", () => {
      setClaudeBudgetLimit(2);

      fire(CLAUDE_BUDGET_STORAGE_KEY, null);
      expect(getClaudeBudget().limitUsd).toBeNull();

      setClaudeBudgetLimit(2);
      fire(null, null);
      expect(getClaudeBudget().limitUsd).toBeNull();
    });

    it("읽을 수 없거나 범위 밖인 값이 오면 이전 한도를 그대로 둔다", () => {
      setClaudeBudgetLimit(2);

      for (const broken of ["not json", JSON.stringify({ limitUsd: -4 }), JSON.stringify({ limitUsd: "x" }), JSON.stringify([1])]) {
        fire(CLAUDE_BUDGET_STORAGE_KEY, broken);
        expect(getClaudeBudget().limitUsd).toBe(2);
      }
    });

    it("관계없는 키나 다른 저장소(sessionStorage)의 이벤트는 무시한다", () => {
      setClaudeBudgetLimit(2);

      fire("other-key", JSON.stringify({ limitUsd: 9 }));
      window.dispatchEvent(new StorageEvent("storage", {
        key: CLAUDE_BUDGET_STORAGE_KEY,
        newValue: JSON.stringify({ limitUsd: 9 }),
        storageArea: sessionStorage,
      }));

      expect(getClaudeBudget().limitUsd).toBe(2);
    });
  });
});
