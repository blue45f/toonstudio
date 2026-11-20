import { describe, expect, it } from "vitest";

import {
  DISCOVER_TAG_FINDER_CHIPS,
  buildTagTriggerExploreHref,
  filterTitlesByTagTriggerFinder,
  parseTagTriggerSearchParams,
  toggleTagTriggerFilterChip,
} from "./discover-tag-trigger-finder";

describe("discover-tag-trigger-finder (AC-015 / F06)", () => {
  it("toggles include tags and exclude trigger-warning chips, round-trips URL params, and filters titles", () => {
    let state = { includeTagIds: [] as readonly string[], excludeTriggerIds: [] as readonly string[] };
    expect(buildTagTriggerExploreHref(state)).toBe("/explore");

    const regression = DISCOVER_TAG_FINDER_CHIPS.find((c) => c.id === "regression")!;
    const noGore = DISCOVER_TAG_FINDER_CHIPS.find((c) => c.id === "tw-gore")!;

    state = toggleTagTriggerFilterChip(state, regression);
    state = toggleTagTriggerFilterChip(state, noGore);
    const href = buildTagTriggerExploreHref(state);
    expect(href).toBe("/explore?finderTags=regression&excludeTriggers=tw-gore");

    const parsed = parseTagTriggerSearchParams(new URL(href, "https://toonstudio.test").searchParams);
    expect(parsed).toEqual({
      includeTagIds: ["regression"],
      excludeTriggerIds: ["tw-gore"],
    });

    const filtered = filterTitlesByTagTriggerFinder(
      [
        { title: "회귀한 공작가의 막내", tags: ["회귀", "판타지"], synopsis: "통쾌한 성장기" },
        { title: "회귀했지만 잔혹한 미궁", tags: ["회귀", "고어"], synopsis: "유혈 액션" },
        { title: "평범한 학원 로맨스", tags: ["학교", "일상"], synopsis: "따뜻한 이야기" },
      ],
      parsed,
    );
    expect(filtered.map((t) => t.title)).toEqual(["회귀한 공작가의 막내"]);
  });
});
