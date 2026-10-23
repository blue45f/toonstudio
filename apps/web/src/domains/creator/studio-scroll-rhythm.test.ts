import { describe, expect, it } from "vitest";

import {
  analyzeStudioScrollRhythm,
  isStudioScrollRhythmSfxElement,
  planStudioAutoScrollStep,
  STUDIO_SCROLL_RHYTHM_LIMITS,
  type StudioScrollRhythmPageLike,
} from "./studio-scroll-rhythm";

function page(
  id: string,
  canvasH: number,
  elements: StudioScrollRhythmPageLike["elements"]
): StudioScrollRhythmPageLike {
  return { id, canvasH, elements };
}

describe("analyzeStudioScrollRhythm", () => {
  it("returns a deterministic empty-document result", () => {
    expect(analyzeStudioScrollRhythm([])).toEqual({
      score: 0,
      grade: "D",
      pages: [],
      totalHeightPx: 0,
      totalScreenCount: 0,
      densePageCount: 0,
      totalSfxCount: 0,
      sfxDensePageCount: 0,
      longestSfxGapScreens: 0,
      sfxCategoryCounts: [],
      breathingPageCount: 0,
      flatRhythmPageCount: 0,
      ending: {
        mode: "none",
        trailingWhitespacePx: 0,
        trailingWhitespaceScreens: 0,
      },
      insights: [],
      truncated: false,
    });
  });

  it("measures panels, dialogue load, visible bounds, and page gaps", () => {
    const result = analyzeStudioScrollRhythm(
      [
        page("p1", 1_280, [
          { type: "frame", y: 80, height: 500 },
          { type: "bubble", y: 160, height: 120, text: "안녕하세요" },
        ]),
        page("p2", 2_560, [{ type: "image", y: 200, height: 800 }]),
      ],
      { pageGapPx: 24 }
    );

    expect(result.totalHeightPx).toBe(3_864);
    expect(result.totalScreenCount).toBe(3.02);
    expect(result.pages[0]).toMatchObject({
      pageId: "p1",
      screenCount: 1,
      visibleElementCount: 2,
      panelCount: 1,
      dialogueCount: 1,
      dialogueCharacters: 5,
      beatCount: 2,
    });
  });

  it("ignores hidden and zero-opacity elements", () => {
    const result = analyzeStudioScrollRhythm([
      page("p1", 1_280, [
        { type: "frame", y: 0, height: 600, hidden: true },
        { type: "bubble", y: 50, height: 100, opacity: 0, text: "숨김" },
        { type: "image", y: 100, height: 400 },
      ]),
    ]);

    expect(result.pages[0]?.visibleElementCount).toBe(1);
    expect(result.pages[0]?.dialogueCount).toBe(0);
  });

  it("uses draw points when width and height bounds are unavailable", () => {
    const result = analyzeStudioScrollRhythm([
      page("p1", 1_280, [
        { type: "draw", points: [20, 100, 30, 300, 50, 500] },
      ]),
    ]);

    expect(result.pages[0]).toMatchObject({
      occupiedRatio: 0.31,
      longestGapPx: 780,
    });
  });

  it("flags pages with excessive weighted information density", () => {
    const elements = Array.from({ length: 15 }, (_, index) => ({
      type: "frame",
      y: index * 75,
      height: 70,
    }));
    const result = analyzeStudioScrollRhythm([page("dense", 1_280, elements)]);

    expect(result.densePageCount).toBe(1);
    expect(result.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DENSE_PAGE",
          pageId: "dense",
          severity: "critical",
        }),
      ])
    );
  });

  it("flags dialogue load independently from visual density", () => {
    const result = analyzeStudioScrollRhythm([
      page("talk", 1_280, [
        { type: "bubble", y: 200, height: 300, text: "가".repeat(420) },
      ]),
    ]);

    expect(result.pages[0]?.dialogueCharactersPerScreen).toBe(420);
    expect(result.insights.some((insight) => insight.code === "DIALOGUE_LOAD")).toBe(
      true
    );
  });

  it("detects monotonous beat spacing without treating two beats as evidence", () => {
    const flat = analyzeStudioScrollRhythm([
      page(
        "flat",
        2_000,
        [100, 500, 900, 1_300, 1_700].map((y) => ({
          type: "frame",
          y,
          height: 100,
        }))
      ),
    ]);
    const sparse = analyzeStudioScrollRhythm([
      page("sparse", 2_000, [
        { type: "frame", y: 100, height: 100 },
        { type: "frame", y: 1_000, height: 100 },
      ]),
    ]);

    expect(flat.pages[0]?.beatIntervalVariation).toBe(0);
    expect(flat.flatRhythmPageCount).toBe(1);
    expect(
      flat.insights.some((insight) => insight.code === "FLAT_BEAT_INTERVALS")
    ).toBe(true);
    expect(sparse.pages[0]?.beatIntervalVariation).toBeNull();
  });

  it.each([
    { y: 1_150, height: 100, expected: "tight" },
    { y: 900, height: 100, expected: "balanced" },
    { y: 300, height: 100, expected: "reveal" },
  ] as const)(
    "classifies ending whitespace as $expected",
    ({ y, height, expected }) => {
      const result = analyzeStudioScrollRhythm([
        page("ending", 1_280, [{ type: "frame", y, height }]),
      ]);
      expect(result.ending.mode).toBe(expected);
    }
  );

  it("reports an excessively empty ending and applies an overall penalty", () => {
    const result = analyzeStudioScrollRhythm([
      page("ending", 3_000, [{ type: "frame", y: 0, height: 400 }]),
    ]);

    expect(result.ending.mode).toBe("empty");
    expect(result.insights.some((insight) => insight.code === "EMPTY_ENDING")).toBe(
      true
    );
    expect(result.score).toBeLessThan(result.pages[0]?.score ?? 0);
  });

  it("uses hard page and element budgets and exposes truncation", () => {
    const firstPageElements = Array.from(
      { length: STUDIO_SCROLL_RHYTHM_LIMITS.maxElementsPerPage + 1 },
      () => ({ type: "frame", y: 0, height: 10 })
    );
    const pages = Array.from(
      { length: STUDIO_SCROLL_RHYTHM_LIMITS.maxPages + 1 },
      (_, index) =>
        page(
          `p${index}`,
          1_280,
          index === 0 ? firstPageElements : []
        )
    );
    const result = analyzeStudioScrollRhythm(pages);

    expect(result.pages).toHaveLength(STUDIO_SCROLL_RHYTHM_LIMITS.maxPages);
    expect(result.pages[0]?.visibleElementCount).toBe(
      STUDIO_SCROLL_RHYTHM_LIMITS.maxElementsPerPage
    );
    expect(result.truncated).toBe(true);
    expect(
      result.insights.some((insight) => insight.code === "ANALYSIS_TRUNCATED")
    ).toBe(true);
  });

  it("never mutates source pages or element order", () => {
    const source = [
      page("p1", 1_280, [
        { id: "b", type: "frame", y: 700, height: 100 },
        { id: "a", type: "frame", y: 100, height: 100 },
      ]),
    ];
    const before = JSON.stringify(source);

    analyzeStudioScrollRhythm(source);

    expect(JSON.stringify(source)).toBe(before);
  });
});

describe("analyzeStudioScrollRhythm — SFX rhythm (L-4)", () => {
  const sfxText = (name: string, y: number, extra: object = {}) => ({
    type: "text",
    name,
    y,
    height: 90,
    text: "쾅!",
    ...extra,
  });

  it("classifies SFX with the animatic cue rule and never as dialogue", () => {
    expect(isStudioScrollRhythmSfxElement({ type: "text", animaticCueKind: "sfx" })).toBe(true);
    expect(isStudioScrollRhythmSfxElement({ type: "text", name: "SFX 쾅" })).toBe(true);
    expect(isStudioScrollRhythmSfxElement({ type: "text", name: "효과음 1" })).toBe(true);
    expect(isStudioScrollRhythmSfxElement({ type: "sfx" })).toBe(true);
    expect(isStudioScrollRhythmSfxElement({ type: "text", name: "제목" })).toBe(false);
    expect(isStudioScrollRhythmSfxElement({ type: "text", animaticCueKind: "dialogue", name: "sfx" })).toBe(false);
    expect(isStudioScrollRhythmSfxElement({ type: "bubble", name: "sfx" })).toBe(false);

    const result = analyzeStudioScrollRhythm([
      page("p1", 1_280, [
        { type: "frame", y: 0, height: 600 },
        sfxText("효과음", 100),
        { type: "bubble", y: 700, height: 120, text: "대사" },
      ]),
    ]);
    expect(result.pages[0]).toMatchObject({
      sfxCount: 1,
      sfxPerPanel: 1,
      dialogueCount: 1,
      dialogueCharacters: 2,
    });
    expect(result.totalSfxCount).toBe(1);
  });

  it("flags a page where SFX lettering is crowded per screen", () => {
    const elements = [0, 180, 430, 760, 1_100].map((y, index) =>
      sfxText(`효과음 ${index}`, y)
    );
    const result = analyzeStudioScrollRhythm([page("dense-sfx", 1_280, elements)]);

    expect(result.pages[0]?.sfxCount).toBe(5);
    expect(result.pages[0]?.sfxPerScreen).toBe(5);
    expect(result.pages[0]?.sfxPerPanel).toBeNull();
    expect(result.sfxDensePageCount).toBe(1);
    expect(result.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SFX_DENSE", pageId: "dense-sfx", severity: "warning" }),
      ])
    );
    // 밀집 페널티 2점: (5 - 4) * 2
    expect(result.pages[0]?.score).toBe(98);
  });

  it("surfaces the longest SFX-free stretch only when the episode uses SFX", () => {
    const withSfx = analyzeStudioScrollRhythm([
      page("gap", 5_120, [sfxText("효과음", 0)]),
      page("full", 1_280, [sfxText("효과음", 100)]),
    ]);
    expect(withSfx.longestSfxGapScreens).toBe(3.93);
    expect(
      withSfx.insights.some(
        (insight) => insight.code === "SFX_LONG_GAP" && insight.pageId === "gap"
      )
    ).toBe(true);
    expect(
      withSfx.insights.some(
        (insight) => insight.code === "SFX_LONG_GAP" && insight.pageId === "full"
      )
    ).toBe(false);

    const noSfx = analyzeStudioScrollRhythm([
      page("plain", 5_120, [{ type: "frame", y: 0, height: 500 }]),
    ]);
    expect(noSfx.totalSfxCount).toBe(0);
    expect(noSfx.longestSfxGapScreens).toBe(0);
    expect(noSfx.insights.some((insight) => insight.code === "SFX_LONG_GAP")).toBe(false);
  });

  it("aggregates SFX categories in count order and ignores hidden SFX", () => {
    const result = analyzeStudioScrollRhythm([
      page("p1", 2_560, [
        sfxText("효과음", 0, { sfxCategory: "impact" }),
        sfxText("효과음", 300, { sfxCategory: "impact" }),
        sfxText("효과음", 600, { sfxCategory: "motion" }),
        sfxText("효과음", 900, { hidden: true, sfxCategory: "impact" }),
        { type: "sfx", y: 1_200, height: 80, text: "휙", sfxCategory: "motion" },
      ]),
    ]);
    expect(result.totalSfxCount).toBe(4);
    expect(result.sfxCategoryCounts).toEqual([
      { category: "impact", count: 2 },
      { category: "motion", count: 2 },
    ]);
  });
});

describe("planStudioAutoScrollStep", () => {
  it("advances by reader speed and elapsed frame time", () => {
    expect(
      planStudioAutoScrollStep({
        scrollTop: 100,
        scrollHeight: 2_000,
        viewportHeight: 500,
        speedPxPerSecond: 240,
        elapsedMs: 50,
      })
    ).toEqual({
      nextScrollTop: 112,
      maxScrollTop: 1_500,
      reachedEnd: false,
    });
  });

  it("caps background-tab frame gaps at 100ms", () => {
    expect(
      planStudioAutoScrollStep({
        scrollTop: 100,
        scrollHeight: 2_000,
        viewportHeight: 500,
        speedPxPerSecond: 420,
        elapsedMs: 5_000,
      }).nextScrollTop
    ).toBe(142);
  });

  it("clamps to the end and reports completion", () => {
    expect(
      planStudioAutoScrollStep({
        scrollTop: 1_490,
        scrollHeight: 2_000,
        viewportHeight: 500,
        speedPxPerSecond: 240,
        elapsedMs: 100,
      })
    ).toEqual({
      nextScrollTop: 1_500,
      maxScrollTop: 1_500,
      reachedEnd: true,
    });
  });

  it("fails closed for invalid dimensions, speed, and elapsed time", () => {
    expect(
      planStudioAutoScrollStep({
        scrollTop: Number.NaN,
        scrollHeight: Number.NaN,
        viewportHeight: -1,
        speedPxPerSecond: Number.POSITIVE_INFINITY,
        elapsedMs: -50,
      })
    ).toEqual({
      nextScrollTop: 0,
      maxScrollTop: 0,
      reachedEnd: true,
    });
  });
});
