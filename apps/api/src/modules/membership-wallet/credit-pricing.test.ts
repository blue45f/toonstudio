/**
 * credit-pricing.test.ts — 단가 중앙화 모듈 단위 테스트.
 * 지갑·DB 없이 순수 정책만 검증한다 (DB 없음). 정식 실행은 vitest(CI 확인 항목).
 *
 * 케이스: 등급 3단계 매핑(team 제외), 월 제공량·일 한도(core 상수 재사용),
 * 마켓 수수료 20% 분리(합 = 가격), KRW↔크레딧 환산(올림), 기존 단가 키 10종 유지.
 */
import { describe, expect, it } from "vitest";

import {
  CREDIT_FEATURE_KEYS,
  KRW_PER_CREDIT,
  MARKETPLACE_FEE_RATE_DENOMINATOR,
  MARKETPLACE_FEE_RATE_NUMERATOR,
  creditDailyLimit,
  creditMonthlyIncluded,
  creditsForKrwAmount,
  isCreditTierPlanId,
  krwForCredits,
  marketplaceFeeCredits,
  marketplaceSellerCredits,
} from "./credit-pricing";

describe("credit-pricing 등급 3단계", () => {
  it("free/creator/pro만 등급으로 인정하고 team은 제외한다", () => {
    expect(isCreditTierPlanId("free")).toBe(true);
    expect(isCreditTierPlanId("creator")).toBe(true);
    expect(isCreditTierPlanId("pro")).toBe(true);
    expect(isCreditTierPlanId("team")).toBe(false);
    expect(isCreditTierPlanId("unknown")).toBe(false);
  });

  it("월 제공량·일 한도는 core 상수를 재사용한다", () => {
    expect(creditMonthlyIncluded("free")).toBe(500);
    expect(creditMonthlyIncluded("creator")).toBe(2_000);
    expect(creditMonthlyIncluded("pro")).toBe(5_000);
    expect(creditDailyLimit("free")).toBe(150);
    expect(creditDailyLimit("creator")).toBe(500);
    expect(creditDailyLimit("pro")).toBe(1_500);
  });
});

describe("credit-pricing 마켓 수수료 20%", () => {
  it("수수료율은 단일 상수 20/100이다", () => {
    expect(MARKETPLACE_FEE_RATE_NUMERATOR).toBe(20);
    expect(MARKETPLACE_FEE_RATE_DENOMINATOR).toBe(100);
  });

  it("수수료 + 판매자 몫 = 가격을 항상 만족한다", () => {
    for (const price of [0, 1, 99, 100, 101, 1_000, 12_345]) {
      expect(
        marketplaceFeeCredits(price) + marketplaceSellerCredits(price),
      ).toBe(price < 0 ? 0 : price);
    }
    expect(marketplaceFeeCredits(100)).toBe(20);
    expect(marketplaceSellerCredits(100)).toBe(80);
    expect(marketplaceFeeCredits(101)).toBe(20);
    expect(marketplaceSellerCredits(101)).toBe(81);
    expect(marketplaceFeeCredits(0)).toBe(0);
    expect(marketplaceSellerCredits(0)).toBe(0);
  });
});

describe("credit-pricing KRW↔크레딧 환산", () => {
  it("1크레딧 = 10원이다", () => {
    expect(KRW_PER_CREDIT).toBe(10);
  });

  it("KRW→크레딧은 올림으로 환산한다", () => {
    expect(creditsForKrwAmount(0)).toBe(0);
    expect(creditsForKrwAmount(-100)).toBe(0);
    expect(creditsForKrwAmount(1_000)).toBe(100);
    expect(creditsForKrwAmount(10_005)).toBe(1_001);
    expect(creditsForKrwAmount(Number.NaN)).toBe(0);
  });

  it("크레딧→KRW는 10원 단위 상당액이다", () => {
    expect(krwForCredits(100)).toBe(1_000);
    expect(krwForCredits(0)).toBe(0);
  });
});

describe("credit-pricing 단가 키", () => {
  it("기존 단가 키 10종을 그대로 재노출한다", () => {
    expect(CREDIT_FEATURE_KEYS).toContain("ai.text.generate");
    expect(CREDIT_FEATURE_KEYS).toContain("ai.translation");
    expect(CREDIT_FEATURE_KEYS).toContain("ai.image.analyze");
    expect(CREDIT_FEATURE_KEYS).toContain("ai.image.removeBackground");
    expect(CREDIT_FEATURE_KEYS).toContain("ai.image.upscale");
    expect(CREDIT_FEATURE_KEYS).toContain("ai.image.generate");
    expect(CREDIT_FEATURE_KEYS).toContain("ai.storyboard.generate");
    expect(CREDIT_FEATURE_KEYS).toContain("ai.voice.generate");
    expect(CREDIT_FEATURE_KEYS).toContain("ai.video.generate");
    expect(CREDIT_FEATURE_KEYS).toContain("render.server");
  });
});
