/**
 * research-credit-meter.test.ts — 리서치 크레딧 환산·집계 단위 테스트.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_RESEARCH_CREDIT_PRICING,
  InMemoryResearchCreditLedger,
  researchCreditsForUsage,
  resolveResearchCreditPricing,
} from "./research-credit-meter";

describe("research-credit-meter 단가", () => {
  it("기본 단가는 검색·fetch 각 1크레딧이다", () => {
    expect(DEFAULT_RESEARCH_CREDIT_PRICING).toEqual({
      creditsPerSearch: 1,
      creditsPerFetch: 1,
    });
    expect(researchCreditsForUsage({ searches: 3, fetches: 2 })).toBe(5);
    expect(researchCreditsForUsage({ searches: 0, fetches: 0 })).toBe(0);
  });

  it("환경변수로 단가를 조정하고 잘못된 값은 기본값으로 되돌린다", () => {
    expect(resolveResearchCreditPricing({
      DEEPSEEK_RESEARCH_CREDITS_PER_SEARCH: "2",
      DEEPSEEK_RESEARCH_CREDITS_PER_FETCH: "3",
    })).toEqual({ creditsPerSearch: 2, creditsPerFetch: 3 });
    expect(resolveResearchCreditPricing({
      DEEPSEEK_RESEARCH_CREDITS_PER_SEARCH: "0",
      DEEPSEEK_RESEARCH_CREDITS_PER_FETCH: "abc",
    })).toEqual({ creditsPerSearch: 1, creditsPerFetch: 1 });
  });

  it("장부는 사용자별 사용량을 누적한다", () => {
    const ledger = new InMemoryResearchCreditLedger();
    ledger.record("user-1", { searches: 1, fetches: 1 });
    const entry = ledger.record("user-1", { searches: 2, fetches: 0 });
    expect(entry).toEqual({ searches: 3, fetches: 1, credits: 4, calls: 2 });
    expect(ledger.get("user-2")).toBeUndefined();
  });
});
