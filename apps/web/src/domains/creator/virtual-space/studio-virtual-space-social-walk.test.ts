import { describe, expect, it } from "vitest";

import type { StudioVirtualSpaceSocialAction } from "./studio-virtual-space-social";
import { isStudioSocialWalkTogether, studioSocialRequestFollowsPeer } from "./studio-virtual-space-social-walk";

const ACTIONS: readonly StudioVirtualSpaceSocialAction[] = ["talk", "follow", "lead", "review", "high-five"];

describe("함께 걷기 합의의 역할", () => {
  it("따라가기(follow)와 따라오라고 요청(lead)만 함께 걷기로 본다", () => {
    expect(ACTIONS.filter((action) => isStudioSocialWalkTogether(action))).toEqual(["follow", "lead"]);
    expect(isStudioSocialWalkTogether(undefined)).toBe(false);
  });

  it.each([
    ["follow", "outgoing", true],
    ["follow", "incoming", false],
    ["lead", "outgoing", false],
    ["lead", "incoming", true],
    ["talk", "outgoing", false],
    ["talk", "incoming", false],
    ["review", "incoming", false],
    ["high-five", "outgoing", false],
  ] as const)("%s(%s)에서 이 클라이언트가 따라가는 쪽인가: %s", (action, direction, follows) => {
    expect(studioSocialRequestFollowsPeer({ action, direction })).toBe(follows);
  });

  it("같은 합의의 두 쪽 가운데 따라가는 쪽은 정확히 하나다", () => {
    for (const action of ["follow", "lead"] as const) {
      const sides = (["outgoing", "incoming"] as const).filter((direction) => studioSocialRequestFollowsPeer({ action, direction }));
      expect(sides, action).toHaveLength(1);
    }
  });
});
