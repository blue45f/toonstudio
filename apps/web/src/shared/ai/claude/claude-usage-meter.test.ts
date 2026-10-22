import { afterEach, describe, expect, it, vi } from "vitest";

import {
  beginClaudeRequest,
  claudeBudgetSpentUsd,
  getClaudeUsageSnapshot,
  recordClaudeUsage,
  resetClaudeUsage,
  subscribeClaudeUsage,
} from "./claude-usage-meter";

afterEach(() => {
  resetClaudeUsage();
});

const usage = { input_tokens: 1_000_000, output_tokens: 0 };

describe("진행 중 요청 예약", () => {
  it("보내기 전에 비용 상한을 예약하고 정산하면 거둔다", () => {
    const ticket = beginClaudeRequest(0.25);
    expect(getClaudeUsageSnapshot()).toMatchObject({ pendingRequests: 1, pendingUsd: 0.25 });

    ticket.release();

    expect(getClaudeUsageSnapshot()).toMatchObject({ pendingRequests: 0, pendingUsd: 0, unconfirmedRequests: 0, unconfirmedUsd: 0 });
  });

  it("동시에 나간 요청들의 상한을 모두 예약한다", () => {
    const first = beginClaudeRequest(0.1);
    const second = beginClaudeRequest(0.2);
    expect(getClaudeUsageSnapshot()).toMatchObject({ pendingRequests: 2 });
    expect(getClaudeUsageSnapshot().pendingUsd).toBeCloseTo(0.3, 10);

    first.release();
    expect(getClaudeUsageSnapshot().pendingUsd).toBeCloseTo(0.2, 10);
    second.release();
    expect(getClaudeUsageSnapshot().pendingUsd).toBe(0);
  });

  it("단가를 모르는 요청(상한 null)도 건수는 세고 금액은 더하지 않는다", () => {
    const ticket = beginClaudeRequest(null);
    expect(getClaudeUsageSnapshot()).toMatchObject({ pendingRequests: 1, pendingUsd: 0 });
    ticket.release();
  });

  it("비정상 상한(NaN·음수)은 0으로 본다", () => {
    const nan = beginClaudeRequest(Number.NaN);
    const negative = beginClaudeRequest(-3);
    expect(getClaudeUsageSnapshot().pendingUsd).toBe(0);
    nan.release();
    negative.release();
  });

  it("정산은 한 번만 반영된다", () => {
    const ticket = beginClaudeRequest(0.5);
    ticket.release();
    ticket.release();
    ticket.markUnconfirmed();
    expect(getClaudeUsageSnapshot()).toMatchObject({ pendingRequests: 0, pendingUsd: 0, unconfirmedRequests: 0, unconfirmedUsd: 0 });
  });
});

describe("확인되지 않은 요청", () => {
  it("사용량을 받지 못한 요청은 예약을 거두고 건수와 최대 비용으로 센다", () => {
    beginClaudeRequest(0.4).markUnconfirmed();
    beginClaudeRequest(0.1).markUnconfirmed();

    const snapshot = getClaudeUsageSnapshot();
    expect(snapshot).toMatchObject({ pendingRequests: 0, pendingUsd: 0, unconfirmedRequests: 2 });
    expect(snapshot.unconfirmedUsd).toBeCloseTo(0.5, 10);
    // 표시용 추정 비용에는 넣지 않는다(청구됐는지 모르기 때문이다).
    expect(snapshot.estimatedUsd).toBe(0);
  });

  it("예산 판정에는 받은 사용량 + 진행 중 예약 + 확인되지 않은 최대 비용을 모두 더한다", () => {
    recordClaudeUsage("claude-opus-5-5", usage); // $4
    beginClaudeRequest(0.5).markUnconfirmed();
    beginClaudeRequest(0.25);

    expect(claudeBudgetSpentUsd(getClaudeUsageSnapshot())).toBeCloseTo(4 + 0.5 + 0.25, 10);
  });
});

describe("미터 비우기", () => {
  it("비운 뒤에는 이전에 시작한 요청의 정산이 새 집계를 흔들지 않는다", () => {
    const stale = beginClaudeRequest(0.5);
    resetClaudeUsage();
    const fresh = beginClaudeRequest(0.2);

    stale.markUnconfirmed();

    expect(getClaudeUsageSnapshot()).toMatchObject({ pendingRequests: 1, pendingUsd: 0.2, unconfirmedRequests: 0, unconfirmedUsd: 0 });
    fresh.release();
  });

  it("구독자에게 변화를 알린다", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeClaudeUsage(listener);

    const ticket = beginClaudeRequest(0.1);
    ticket.release();
    recordClaudeUsage("claude-haiku-5-5", usage);

    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});

describe("recordClaudeUsage", () => {
  it("예약·확인되지 않은 집계를 건드리지 않고 사용량만 더한다", () => {
    beginClaudeRequest(0.3);
    // Haiku 5.5: 입력 $0.1/M(10만 토큰 이하) → 5만 토큰은 $0.005.
    recordClaudeUsage("claude-haiku-5-5", { input_tokens: 50_000, output_tokens: 0 });

    expect(getClaudeUsageSnapshot()).toMatchObject({ requests: 1, pendingRequests: 1, pendingUsd: 0.3 });
    expect(getClaudeUsageSnapshot().estimatedUsd).toBeCloseTo(0.005, 10);
  });
});
