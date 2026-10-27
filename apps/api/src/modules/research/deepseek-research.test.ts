/**
 * deepseek-research.test.ts — 리서치 순수 로직 단위 테스트.
 * 가짜 클라이언트로 네트워크 없이 검증한다.
 */
import { describe, expect, it, vi } from "vitest";

import {
  EXISTENCE_CHECK_DISCLAIMER,
  buildResearchBrief,
  buildTrendDigest,
  checkExistence,
  trendDigestToMarkdown,
} from "./deepseek-research";

import type { DeepSeekSearchClient } from "./deepseek-search-client";
import type { DeepSeekSearchResult } from "./deepseek-search-client";

function result(overrides: Partial<DeepSeekSearchResult>): DeepSeekSearchResult {
  return {
    title: "제목",
    url: "https://example.com/1",
    snippet: "짧은 요약",
    summary: "긴 요약문",
    content: "",
    siteName: "example",
    rerankScore: 1,
    authority: 1,
    ...overrides,
  };
}

function fakeClient(
  searchResults: DeepSeekSearchResult[][] = [],
  fetchPages: Record<string, { title: string; content: string }> = {},
): DeepSeekSearchClient {
  const search = vi.fn(async () => ({
    results: searchResults.shift() ?? [],
  }));
  const fetchPage = vi.fn(async (url: string) => fetchPages[url] ?? {
    title: "가져온 글",
    content: "가져온 본문",
  });
  return { search, fetchPage } as unknown as DeepSeekSearchClient;
}

describe("deepseek-research 브리프", () => {
  it("질문 128자 제한을 넘기면 거부한다", async () => {
    const client = fakeClient();
    await expect(buildResearchBrief(client, {
      question: "a".repeat(129),
    })).rejects.toThrow();
  });

  it("개요는 출처 요약을 연결하고 발췌는 500자로 자른다", async () => {
    const client = fakeClient([
      [
        result({ title: "첫째", url: "https://example.com/1", summary: "첫째 요약" }),
        result({ title: "둘째", url: "https://example.com/2", summary: "둘째 요약" }),
      ],
    ], {
      "https://example.com/1": { title: "첫째 원문", content: "y".repeat(900) },
    });
    const brief = await buildResearchBrief(client, {
      question: "조선시대 시장",
      fetchSources: true,
      maxFetchSources: 1,
    });
    expect(brief.question).toBe("조선시대 시장");
    expect(brief.overview).toContain("첫째 요약");
    expect(brief.sources).toHaveLength(2);
    expect(brief.fetchedExcerpts).toHaveLength(1);
    expect(brief.fetchedExcerpts[0].excerpt.length).toBeLessThanOrEqual(501);
    expect(brief.usage).toEqual({ searches: 1, fetches: 1 });
  });

  it("fetchSources가 꺼지면 fetch를 호출하지 않는다", async () => {
    const client = fakeClient([[result({})]]);
    const brief = await buildResearchBrief(client, { question: "질의" });
    expect(brief.usage).toEqual({ searches: 1, fetches: 0 });
    expect(brief.fetchedExcerpts).toHaveLength(0);
  });
});

describe("deepseek-research 존재 여부 확인", () => {
  it("일치 목록과 법적 의견 아님 고지를 함께 반환한다", async () => {
    const client = fakeClient([[
      result({ title: "기존 작품", url: "https://example.com/work" }),
    ]]);
    const checked = await checkExistence(client, { title: "내 작품 제목" });
    expect(checked.matches).toHaveLength(1);
    expect(checked.matches[0].title).toBe("기존 작품");
    expect(checked.disclaimer).toBe(EXISTENCE_CHECK_DISCLAIMER);
    expect(checked.disclaimer).toContain("법적 의견이 아닙니다");
  });
});

describe("deepseek-research 트렌드 다이제스트", () => {
  it("질의 목록마다 섹션을 만들고 마크다운을 생성한다", async () => {
    const client = fakeClient([
      [result({ title: "유행1", url: "https://example.com/a" })],
      [],
    ]);
    const digest = await buildTrendDigest(client, {
      queries: ["판타지", "로맨스"],
    }, () => new Date("2026-10-27T00:00:00.000Z"));
    expect(digest.sections).toHaveLength(2);
    expect(digest.sections[0].query).toBe("판타지");
    expect(digest.sections[1].items).toHaveLength(0);
    expect(digest.markdown).toContain("## 판타지");
    expect(digest.markdown).toContain("https://example.com/a");
    expect(digest.usage).toEqual({ searches: 2, fetches: 0 });
  });

  it("질의가 0건이거나 11건이면 거부한다", async () => {
    const client = fakeClient();
    await expect(buildTrendDigest(client, { queries: [] })).rejects.toThrow();
    await expect(buildTrendDigest(client, {
      queries: Array.from({ length: 11 }, (_, i) => `질의${i}`),
    })).rejects.toThrow();
  });

  it("마크다운 제목의 대괄호를 이스케이프한다", () => {
    const markdown = trendDigestToMarkdown("2026-10-27", [
      { query: "장르[테스트]", items: [] },
    ]);
    expect(markdown).toContain("## 장르(테스트)");
  });
});
