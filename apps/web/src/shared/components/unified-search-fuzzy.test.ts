import { describe, expect, it } from "vitest";

import { fuzzyRankUnifiedItems, fuzzyUnifiedSection } from "./unified-search-fuzzy";
import { searchUnifiedCourses, searchUnifiedHelp } from "./unified-search-providers";
import type { UnifiedSearchItem } from "./unified-search";

const workItem = (id: string, title: string, description?: string): UnifiedSearchItem => ({
  kind: "works",
  id,
  title,
  description,
  href: `/title/${id}`,
});

const assetItem = (id: string, title: string, kind: string): UnifiedSearchItem => ({
  kind: "assets",
  id,
  title,
  description: kind,
  href: `/market/resource/${id}`,
});

describe("unified-search-fuzzy (집계층 퍼지 어댑터)", () => {
  it("작품 풀에서 한 글자 오타로 작품을 찾는다", () => {
    const pool = [workItem("w1", "스튜디오 대시보드", "김작가"), workItem("w2", "학원 액션 연대기", "박작가")];
    const section = fuzzyUnifiedSection("works", pool, "스튜지오");
    expect(section.kind).toBe("works");
    expect(section.items.map((item) => item.id)).toEqual(["w1"]);
    expect(section.total).toBe(1);
    expect(section.moreHref).toBe("/search?q=%EC%8A%A4%ED%8A%9C%EC%A7%80%EC%98%A4");
  });

  it("소재 풀에서 오타로 소재를 찾고 마켓 moreHref 를 단다", () => {
    const pool = [assetItem("a1", "브러시 세트", "brush"), assetItem("a2", "교실 배경", "background")];
    const section = fuzzyUnifiedSection("assets", pool, "브너시 세트");
    expect(section.items.map((item) => item.id)).toEqual(["a1"]);
    expect(section.moreHref).toBe("/market/browse?q=%EB%B8%8C%EB%84%88%EC%8B%9C%20%EC%84%B8%ED%8A%B8");
  });

  it("정확 결과가 퍼지 결과보다 앞에 온다", () => {
    const pool = [workItem("w1", "스튜지오 라이프"), workItem("w2", "스튜디오 홈")];
    const ranked = fuzzyRankUnifiedItems(pool, "스튜디오");
    expect(ranked.map((entry) => entry.item.id)).toEqual(["w2", "w1"]);
    expect(ranked.map((entry) => entry.exact)).toEqual([true, false]);
  });

  it("빈 질의는 빈 섹션, 무관한 질의는 아이템 없는 섹션이다", () => {
    const pool = [workItem("w1", "스튜디오 대시보드")];
    expect(fuzzyUnifiedSection("works", pool, "   ").items).toHaveLength(0);
    expect(fuzzyUnifiedSection("works", pool, "없는작품").items).toHaveLength(0);
    expect(fuzzyUnifiedSection("works", pool, "없는작품").total).toBe(0);
  });
});

describe("unified-search providers + fuzzy (실데이터)", () => {
  it("강좌: 띄어쓰기·오타가 섞인 질의로도 강좌에 닿는다", () => {
    // 정확 패스(matchesSearch)는 "분니"에서 실패한다 — 퍼지 패스가 잇는 케이스.
    const section = searchUnifiedCourses("클리핑을 분니해서");
    expect(section.items.map((item) => item.href)).toContain("/learn/lessons/color-layers");
    expect(searchUnifiedCourses("없는강좌주제").items).toHaveLength(0);
  });

  it("도움말: 매뉴얼 키워드의 영문 오타로 문서에 닿는다", () => {
    // searchManual 은 토큰 완전 일치만 보므로 "buket"/"lassoo" 는 정확 패스에서 빈다.
    expect(searchUnifiedHelp("buket").items.map((item) => item.href)).toContain("/studio/manual/selection-fill");
    expect(searchUnifiedHelp("lassoo").items.map((item) => item.href)).toContain("/studio/manual/selection-fill");
    expect(searchUnifiedHelp("없는도움말주제").items).toHaveLength(0);
  });
});
