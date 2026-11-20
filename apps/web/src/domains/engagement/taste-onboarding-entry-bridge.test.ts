import { describe, expect, it } from "vitest";

import {
  shouldPromptTasteOnboarding,
  type TasteOnboardingEntryDecision,
  type TasteOnboardingEntryInput,
} from "./public/taste-onboarding-entry-bridge";
import { buildTasteFeedRedirectHref } from "./taste-onboarding-entry-bridge";

describe("taste-onboarding-entry-bridge (AC-011)", () => {
  it("콜드스타트 사용자에게만 온보딩을 노출하고, 완료·평가3건 이상·최근 거절 시 노출하지 않는다", () => {
    const now = 1_763_600_000_000;
    const entry: TasteOnboardingEntryInput = { ratedTitleCount: 0, nowMs: now };
    const decision: TasteOnboardingEntryDecision = shouldPromptTasteOnboarding(entry);
    expect(decision).toEqual({
      shouldPrompt: true,
      reason: "cold-start",
    });
    expect(shouldPromptTasteOnboarding({ ratedTitleCount: 3, nowMs: now }).shouldPrompt).toBe(false);
    expect(shouldPromptTasteOnboarding({ completedAtMs: now - 1000, ratedTitleCount: 0, nowMs: now }).shouldPrompt).toBe(false);
    expect(shouldPromptTasteOnboarding({ dismissedAtMs: now - 3600_000, ratedTitleCount: 0, nowMs: now }).shouldPrompt).toBe(false);
  });

  it("5문항 응답을 중복 제거된 /discover 추천 피드 URL로 변환한다", () => {
    const href = buildTasteFeedRedirectHref({
      favoriteGenres: ["판타지", "액션", "판타지"],
      preferredTags: ["회귀", "성장"],
      pacing: "fast",
      mood: "serious",
      format: "webtoon",
    });
    expect(href).toContain("/discover?");
    expect(href).toContain("tasteReady=1");
    expect(href).toContain("type=webtoon");
    expect(href).toContain("pacing=fast");
  });
});
