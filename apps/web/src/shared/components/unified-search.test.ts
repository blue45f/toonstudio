import { describe, expect, it } from "vitest";

import type { Title } from "@/shared/lib/types";

import {
  assembleUnifiedSections,
  assetsLinkSection,
  assetsSectionFromResources,
  buildUnifiedSearchResult,
  emptyUnifiedSection,
  UNIFIED_SEARCH_SECTION_LABELS,
  UNIFIED_SEARCH_SECTION_ORDER,
  unifiedSectionOf,
  worksSectionFromTitles,
  type UnifiedSearchSection,
} from "./unified-search";
import {
  searchUnifiedCourses,
  searchUnifiedHelp,
  searchUnifiedHelpSections,
  searchUnifiedLocal,
  searchUnifiedPages,
} from "./unified-search-providers";

const titleFixture = (id: string, slug: string, title: string, author: string): Title =>
  ({ id, slug, title, author }) as unknown as Title;

describe("unified-search core", () => {
  it("keeps the canonical section order works → assets → courses → help → pages", () => {
    expect(UNIFIED_SEARCH_SECTION_ORDER).toEqual(["works", "assets", "courses", "help", "pages"]);
    for (const kind of UNIFIED_SEARCH_SECTION_ORDER) {
      expect(UNIFIED_SEARCH_SECTION_LABELS[kind][0]).toBeTruthy();
      expect(UNIFIED_SEARCH_SECTION_LABELS[kind][1]).toBeTruthy();
    }
  });

  it("builds the works section from server titles with /title/<slug> hrefs", () => {
    const titles = [
      titleFixture("t1", "moon-knight", "달의 기사", "작가甲"),
      titleFixture("t2", "sun-mage", "태양의 마법사", "작가乙"),
      titleFixture("t3", "star-chef", "별의 요리사", "작가丙"),
    ];
    const section = worksSectionFromTitles(titles, "기사", 2, 42);
    expect(section.kind).toBe("works");
    expect(section.total).toBe(42);
    expect(section.items.map((item) => item.href)).toEqual(["/title/moon-knight", "/title/sun-mage"]);
    expect(section.items[0]).toMatchObject({ title: "달의 기사", description: "작가甲" });
    expect(section.moreHref).toBe("/search?q=%EA%B8%B0%EC%82%AC");
  });

  it("builds the assets section from market resources with /market/resource/<id> hrefs", () => {
    const section = assetsSectionFromResources(
      [
        { id: "res 1", name: "빗방울 브러시", kind: "brush" },
        { id: "res2", name: "교실 배경", kind: "background" },
      ],
      "브러시",
    );
    expect(section.items.map((item) => item.href)).toEqual(["/market/resource/res%201", "/market/resource/res2"]);
    expect(section.items[0]).toMatchObject({ title: "빗방울 브러시", description: "brush" });
    expect(section.moreHref).toBe("/market/browse?q=%EB%B8%8C%EB%9F%AC%EC%8B%9C");
  });

  it("keeps a link-only assets section so one header search can still reach the market", () => {
    expect(assetsLinkSection("  ")).toEqual(emptyUnifiedSection("assets"));
    const link = assetsLinkSection("브러시");
    expect(link.items).toHaveLength(0);
    expect(link.moreHref).toBe("/market/browse?q=%EB%B8%8C%EB%9F%AC%EC%8B%9C");
    const assembled = assembleUnifiedSections([link, emptyUnifiedSection("courses")]);
    expect(assembled.map((section) => section.kind)).toEqual(["assets"]);
  });

  it("assembles sections in canonical order, drops empties and dedupes kinds", () => {
    const pages: UnifiedSearchSection = {
      kind: "pages",
      items: [{ kind: "pages", id: "/help", title: "도움말", href: "/help" }],
      total: 1,
    };
    const works: UnifiedSearchSection = {
      kind: "works",
      items: [{ kind: "works", id: "t1", title: "작품", href: "/title/t1" }],
      total: 1,
      moreHref: "/search?q=x",
    };
    const result = buildUnifiedSearchResult("x", [pages, emptyUnifiedSection("help"), works, pages]);
    expect(result.sections.map((section) => section.kind)).toEqual(["works", "pages"]);
    expect(result.totalCount).toBe(2);
    expect(unifiedSectionOf(result, "help")).toBeUndefined();
  });
});

describe("unified-search local providers (existing modules reused)", () => {
  it("finds courses through the /learn matcher (matchesSearch)", () => {
    const section = searchUnifiedCourses("콘티");
    expect(section.items.map((item) => item.href)).toContain("/learn/lessons/story-board");
    expect(section.total).toBeGreaterThanOrEqual(section.items.length);
    expect(section.moreHref).toBe("/learn?q=%EC%BD%98%ED%8B%B0");
    expect(searchUnifiedCourses("   ").items).toHaveLength(0);
  });

  it("folds manual articles into help search (searchManual + help tokens)", () => {
    const fill = searchUnifiedHelp("밑색");
    expect(fill.items.map((item) => item.href)).toContain("/studio/manual/selection-fill");
    expect(fill.moreHref).toBe("/help");

    // 문제형 문장도 도움말 토큰을 거쳐 매뉴얼 문서에 닿는다.
    const save = searchUnifiedHelp("저장이 안 돼요");
    expect(save.items.map((item) => item.href)).toContain("/studio/manual/save-recovery");

    // 의미 있는 낱말이 없으면 빈 섹션.
    expect(searchUnifiedHelp("안 돼요").items).toHaveLength(0);
  });

  it("ranks site pages through the help related-screen ranker", () => {
    const section = searchUnifiedPages("서비스 상태");
    expect(section.items.map((item) => item.href)).toContain("/status");
  });

  it("returns manual + courses together for the help surface", () => {
    const { manual, courses } = searchUnifiedHelpSections("콘티");
    expect(manual.kind).toBe("help");
    expect(courses.kind).toBe("courses");
    expect(courses.items.map((item) => item.href)).toContain("/learn/lessons/story-board");
  });

  it("aggregates local sections in canonical order for one query", () => {
    const result = searchUnifiedLocal("콘티");
    const kinds = result.sections.map((section) => section.kind);
    expect(kinds).toContain("assets");
    expect(kinds).toContain("courses");
    expect(kinds.indexOf("assets")).toBeLessThan(kinds.indexOf("courses"));
    expect(result.totalCount).toBeGreaterThan(0);

    const empty = searchUnifiedLocal("");
    expect(empty.sections).toHaveLength(0);
    expect(empty.totalCount).toBe(0);
  });
});
