import { describe, expect, it } from "vitest";

import { parseMarketBrowseQuery } from "./market-query";
import {
  MARKET_SENTENCE_FACETS,
  MARKET_SENTENCE_KIND_LABEL_EN,
  marketSentenceFacets,
  marketSentenceUrlPatch,
  readMarketSentence,
} from "./market-sentence";

import type { MarketSentenceFacet } from "./market-sentence";

import { CREATOR_MARKETPLACE_RESOURCE_KINDS } from "@/shared/lib/creator-marketplace-resource-contract";

const NONE: ReadonlySet<MarketSentenceFacet> = new Set();

/** 패치를 마켓 화면이 읽는 방식 그대로 URL 로 만들어 다시 읽는다. */
function roundTrip(patch: Readonly<Record<string, string | null>>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(patch)) if (value) params.set(key, value);
  return parseMarketBrowseQuery(params);
}

const SENTENCES = [
  "저작권 걱정 없는 학교 배경",
  "G펜 브러시 CC0",
  "비 오는 골목 야경",
  "3D 학교 의자",
  "템플릿 브러시",
  "비상업 CC0 팔레트",
  "연애물 고백 장면 템플릿",
  "벚꽃 배경 무료",
  "출처 표시 필터",
  "스산한 폐건물",
  "Joe Hisaishi forest",
  "x",
  "",
  "가".repeat(200),
];

describe("readMarketSentence", () => {
  it("계획기가 읽은 마켓 조건을 URL 필터 모양으로 돌려준다", () => {
    expect(readMarketSentence("저작권 걱정 없는 학교 배경").filters).toEqual({
      q: "배경", kind: "asset", license: "cc0-1.0", tag: "학교",
    });
    expect(readMarketSentence("G펜 브러시 CC0").filters).toEqual({ kind: "brush", license: "cc0-1.0" });
    expect(readMarketSentence("").filters).toEqual({});
  });

  it("사전에 없는 낱말도 마켓 검색어에 그대로 남긴다", () => {
    expect(readMarketSentence("스산한 폐건물").filters.q).toBe("스산한 폐건물");
  });

  it("마켓과 무관한 충돌(날씨·시대)은 숨기고, 종류·라이선스 충돌만 알린다", () => {
    expect(readMarketSentence("맑은 날 비 오는 골목").conflicts).toEqual([]);
    expect(readMarketSentence("템플릿 브러시").conflicts.map((conflict) => conflict.axis)).toEqual(["market-kind"]);
    expect(readMarketSentence("비상업 CC0 팔레트").conflicts.map((conflict) => conflict.axis)).toEqual(["license"]);
  });

  it("80자를 넘는 문장은 잘렸다고 알린다", () => {
    expect(readMarketSentence("가".repeat(200)).truncated).toBe(true);
    expect(readMarketSentence("학교 배경").truncated).toBe(false);
  });

  it("마켓 종류 영문 표기는 계약의 모든 종류를 덮는다", () => {
    expect(Object.keys(MARKET_SENTENCE_KIND_LABEL_EN).sort()).toEqual([...CREATOR_MARKETPLACE_RESOURCE_KINDS].sort());
  });
});

describe("marketSentenceFacets", () => {
  it("표시 순서(종류 → 태그 → 라이선스 → 검색어)로 읽은 것만 돌려준다", () => {
    const { filters } = readMarketSentence("저작권 걱정 없는 학교 배경");
    expect(MARKET_SENTENCE_FACETS).toEqual(["kind", "tag", "license", "q"]);
    expect(marketSentenceFacets(filters, NONE)).toEqual(["kind", "tag", "license", "q"]);
    expect(marketSentenceFacets(readMarketSentence("G펜 브러시 CC0").filters, NONE)).toEqual(["kind", "license"]);
    expect(marketSentenceFacets({}, NONE)).toEqual([]);
  });

  it("사용자가 뺀 조건은 빠진다", () => {
    const { filters } = readMarketSentence("저작권 걱정 없는 학교 배경");
    expect(marketSentenceFacets(filters, new Set<MarketSentenceFacet>(["license", "q"]))).toEqual(["kind", "tag"]);
  });
});

describe("marketSentenceUrlPatch", () => {
  it("읽은 조건으로 q·kind·license·tag 를 통째로 바꾼다", () => {
    const { filters } = readMarketSentence("저작권 걱정 없는 학교 배경");
    expect(marketSentenceUrlPatch(filters, NONE)).toEqual({ q: "배경", kind: "asset", license: "cc0-1.0", tag: "학교" });
  });

  it("읽지 못한 조건은 지우고, 검색어가 없으면 관련도순 정렬도 해제한다", () => {
    const { filters } = readMarketSentence("G펜 브러시 CC0");
    expect(marketSentenceUrlPatch(filters, NONE)).toEqual({ q: null, kind: "brush", license: "cc0-1.0", tag: null, sort: null });
  });

  it("검색어가 있으면 정렬을 건드리지 않는다", () => {
    const { filters } = readMarketSentence("비 오는 골목 야경");
    expect("sort" in marketSentenceUrlPatch(filters, NONE)).toBe(false);
  });

  it("뺀 조건은 URL 에서도 지운다", () => {
    const { filters } = readMarketSentence("저작권 걱정 없는 학교 배경");
    expect(marketSentenceUrlPatch(filters, new Set<MarketSentenceFacet>(["license", "kind"]))).toEqual({
      q: "배경", kind: null, license: null, tag: "학교",
    });
    expect(marketSentenceUrlPatch(filters, new Set<MarketSentenceFacet>(["q"])).sort).toBeNull();
  });

  it("어떤 문장이든 마켓이 받는 URL 형식(길이·종류·라이선스)을 벗어나지 않는다", () => {
    for (const sentence of SENTENCES) {
      const { filters } = readMarketSentence(sentence);
      const parsed = roundTrip(marketSentenceUrlPatch(filters, NONE));
      expect(parsed.issues, sentence).toEqual([]);
      expect(parsed.values.search, sentence).toBe(filters.q);
      expect(parsed.values.kind, sentence).toBe(filters.kind);
      expect(parsed.values.license, sentence).toBe(filters.license);
      expect(parsed.values.tag, sentence).toBe(filters.tag);
    }
  });

  it("마켓에 실제로 있는 2D 하위 분류(kind=asset + tag)로 이어진다", () => {
    const patch = marketSentenceUrlPatch(readMarketSentence("학교 배경").filters, NONE);
    expect(patch.kind).toBe("asset");
    expect(["학교", "배경", "소품"]).toContain(patch.tag);
  });
});
