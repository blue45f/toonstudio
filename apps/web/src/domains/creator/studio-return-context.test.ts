import { describe, expect, it } from "vitest";

import {
  marketReturnContext,
  resolveStudioReturnContext,
} from "./studio-marketplace-deep-link";

const LEGACY = "?assetMarket=community&installMarketResource=r-1&marketReturn=%2Fmarket%2Fresource%2Fr-1";

describe("resolveStudioReturnContext", () => {
  it("레거시 marketReturn을 일반 계약 형태로 변환한다", () => {
    expect(resolveStudioReturnContext(LEGACY)).toEqual({
      returnTo: "/market/resource/r-1",
      intent: "apply-market-resource",
    });
    expect(marketReturnContext(LEGACY)?.returnTo).toBe("/market/resource/r-1");
  });

  it("명시 계약이 있으면 레거시보다 우선한다", () => {
    const search = `${LEGACY}&returnTo=%2Flearn%2Fstory-board&intent=lesson-practice`;
    expect(resolveStudioReturnContext(search)).toEqual({
      returnTo: "/learn/story-board",
      intent: "lesson-practice",
    });
  });

  it("안전하지 않은 marketReturn은 맥락으로 변환하지 않는다", () => {
    expect(resolveStudioReturnContext("?marketReturn=https%3A%2F%2Fevil.test%2Fmarket%2Fresource%2Fx")).toBeNull();
    expect(resolveStudioReturnContext("?marketReturn=%2Ffortune")).toBeNull();
    expect(resolveStudioReturnContext("")).toBeNull();
  });
});
