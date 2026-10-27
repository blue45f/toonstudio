/**
 * research-logic.ts — 검색 프로바이더 결과를 창작자용 자료로 바꾸는 순수 모듈.
 * Nest·DB에 의존하지 않으며, SearchProvider만 주입받아 테스트에서 가짜로 대체한다.
 *
 * 저작권·요약 원칙:
 *  - 검색 결과의 summary/snippet은 짧게 잘라(출처당 최대 300자) 개요에 연결하고,
 *    fetch한 원문은 그대로 반환하지 않고 최대 500자의 발췌(excerpt)까지만 싣는다.
 *    원문 전체가 필요한 경우 출처 URL로 이동해야 한다.
 *  - 존재 여부 확인 결과는 사실(검색에 걸린 공개 자료)만을 나열하고,
 *    등록 가능성·침해 여부에 대한 판단은 하지 않는다. 아래 고지 문구가
 *    모든 응답에 포함된다.
 */

import {
  normalizeSearchQuery,
  type SearchProvider,
  type SearchResult,
} from "./search-provider";

export interface ResearchSource {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly siteName: string;
  readonly relevanceScore: number;
  readonly authority: number;
}

export interface ResearchUsage {
  readonly searches: number;
  readonly fetches: number;
}

export interface ResearchBrief {
  readonly question: string;
  /** 검색 결과 요약을 연결한 개요 (출처당 최대 300자). */
  readonly overview: string;
  readonly sources: readonly ResearchSource[];
  /** fetch한 원문의 짧은 발췌 (건당 최대 500자). 원문 전체는 아니다. */
  readonly fetchedExcerpts: readonly {
    readonly title: string;
    readonly url: string;
    readonly excerpt: string;
  }[];
  readonly usage: ResearchUsage;
}

export interface ExistenceMatch {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly siteName: string;
}

/** 존재 여부 확인 응답에 항상 포함되는 고지 — 법적 의견이 아니다. */
export const EXISTENCE_CHECK_DISCLAIMER =
  "이 결과는 공개 웹 검색에 걸린 자료의 나열일 뿐이며, 상표 등록 가능성이나 " +
  "저작권 침해 여부에 대한 법적 의견이 아닙니다. 권리 판단이 필요하면 변리사·변호사에게 확인하세요.";

export interface ExistenceCheckResult {
  readonly query: string;
  readonly matches: readonly ExistenceMatch[];
  readonly disclaimer: string;
  readonly usage: ResearchUsage;
}

export interface TrendDigestSection {
  readonly query: string;
  readonly items: readonly ExistenceMatch[];
  /** fetchSources가 켜진 경우, 섹션 상위 출처의 짧은 발췌 (최대 500자). */
  readonly featuredExcerpt?: {
    readonly title: string;
    readonly url: string;
    readonly excerpt: string;
  };
}

export interface TrendDigest {
  readonly generatedAt: string;
  readonly sections: readonly TrendDigestSection[];
  readonly markdown: string;
  readonly usage: ResearchUsage;
}

const OVERVIEW_SOURCE_CHARS = 300;
const FETCH_EXCERPT_CHARS = 500;

function toSource(result: SearchResult): ResearchSource {
  return {
    title: result.title,
    url: result.url,
    snippet: result.snippet,
    siteName: result.siteName,
    relevanceScore: result.relevanceScore,
    authority: result.authority,
  };
}

function toMatch(result: SearchResult): ExistenceMatch {
  return {
    title: result.title,
    url: result.url,
    snippet: result.snippet,
    siteName: result.siteName,
  };
}

/** 관련도 순으로 정렬한다 (relevanceScore 내림차순, 동점 시 authority 내림차순). */
function byRelevance(a: SearchResult, b: SearchResult): number {
  if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
  return b.authority - a.authority;
}

function overviewFrom(results: readonly SearchResult[]): string {
  const parts: string[] = [];
  for (const result of results.slice(0, 3)) {
    const text = (result.summary || result.snippet).trim();
    if (!text) continue;
    parts.push(
      text.length > OVERVIEW_SOURCE_CHARS
        ? text.slice(0, OVERVIEW_SOURCE_CHARS) + "…"
        : text,
    );
  }
  return parts.join("\n\n");
}

export interface ResearchBriefInput {
  readonly question: string;
  /** 원문 발췌를 위해 상위 출처를 fetch할지 여부 (기본 false — 비용·토큰 절약). */
  readonly fetchSources?: boolean;
  /** fetch할 상위 출처 수 (0~3, 기본 2). */
  readonly maxFetchSources?: number;
}

/**
 * 창작 리서치 브리프: 짧은 질문으로 검색하고, 필요 시 상위 출처만 fetch한다.
 * 질문은 최대 128자로 제한되어 미공개 원고가 쿼리로 나가는 것을 막는다.
 */
export async function buildResearchBrief(
  client: SearchProvider,
  input: ResearchBriefInput,
): Promise<ResearchBrief> {
  const question = normalizeSearchQuery(input.question);
  const maxFetchSources = input.maxFetchSources === undefined
    ? 2
    : Math.min(3, Math.max(0, Math.floor(input.maxFetchSources)));
  const { results } = await client.search(question, { count: 5 });
  const sorted = [...results].sort(byRelevance);
  const fetchedExcerpts: ResearchBrief["fetchedExcerpts"] = [];
  let fetches = 0;
  if (input.fetchSources && maxFetchSources > 0) {
    for (const result of sorted.slice(0, maxFetchSources)) {
      const page = await client.fetchPage(result.url);
      fetches += 1;
      const excerpt = page.content.trim();
      fetchedExcerpts.push({
        title: page.title || result.title,
        url: result.url,
        excerpt: excerpt.length > FETCH_EXCERPT_CHARS
          ? excerpt.slice(0, FETCH_EXCERPT_CHARS) + "…"
          : excerpt,
      });
    }
  }
  return {
    question,
    overview: overviewFrom(sorted),
    sources: sorted.map(toSource),
    fetchedExcerpts,
    usage: { searches: 1, fetches },
  };
}

export interface ExistenceCheckInput {
  /** 작품 제목 또는 소재 키워드 (최대 128자). */
  readonly title: string;
  /** 검색 결과 수 (1~10, 기본 10). */
  readonly maxResults?: number;
}

/** 제목·소재 키워드의 공개 존재 여부를 검색한다. 법적 판단은 하지 않는다. */
export async function checkExistence(
  client: SearchProvider,
  input: ExistenceCheckInput,
): Promise<ExistenceCheckResult> {
  const query = normalizeSearchQuery(input.title);
  const count = input.maxResults === undefined
    ? 10
    : Math.min(10, Math.max(1, Math.floor(input.maxResults)));
  const { results } = await client.search(query, { count });
  return {
    query,
    matches: [...results].sort(byRelevance).map(toMatch),
    disclaimer: EXISTENCE_CHECK_DISCLAIMER,
    usage: { searches: 1, fetches: 0 },
  };
}

export interface TrendDigestInput {
  /**
   * 다이제스트용 질의 목록. 호출부가 정한다 — 이 모듈은 특정 주제를
   * 하드코딩하지 않는다. 각 질의는 최대 128자, 목록은 최대 10건이다.
   */
  readonly queries: readonly string[];
  /** 섹션당 상위 출처 1건을 fetch할지 여부 (기본 false). */
  readonly fetchSources?: boolean;
}

function escapeMarkdownCell(text: string): string {
  return text.replace(/[\[\]]/g, (char) => (char === "[" ? "(" : ")"));
}

export function trendDigestToMarkdown(
  generatedAt: string,
  sections: readonly TrendDigestSection[],
): string {
  const lines: string[] = [`# 트렌드 다이제스트 (${generatedAt})`, ""];
  for (const section of sections) {
    lines.push(`## ${escapeMarkdownCell(section.query)}`, "");
    if (section.featuredExcerpt) {
      lines.push(
        `> ${escapeMarkdownCell(section.featuredExcerpt.title)} — ${section.featuredExcerpt.excerpt}`,
        "",
      );
    }
    if (section.items.length === 0) {
      lines.push("- 검색 결과가 없습니다.", "");
      continue;
    }
    for (const item of section.items) {
      const title = escapeMarkdownCell(item.title || item.url);
      lines.push(`- [${title}](${item.url}) — ${item.snippet}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * 트렌드 다이제스트: 호출부가 준 질의 목록마다 검색해 섹션별 자료를 만든다.
 * 질의 목록이 비어 있거나 10건을 넘기면 거부하고, 각 질의는 128자 제한을 받는다.
 */
export async function buildTrendDigest(
  client: SearchProvider,
  input: TrendDigestInput,
  now: () => Date = () => new Date(),
): Promise<TrendDigest> {
  if (input.queries.length < 1 || input.queries.length > 10) {
    throw new Error("트렌드 다이제스트 질의는 1~10건이어야 합니다.");
  }
  const queries = input.queries.map((query) => normalizeSearchQuery(query));
  const sections: TrendDigestSection[] = [];
  let searches = 0;
  let fetches = 0;
  for (const query of queries) {
    const { results } = await client.search(query, { count: 5 });
    searches += 1;
    const sorted = [...results].sort(byRelevance);
    const items = sorted.map(toMatch);
    let featuredExcerpt: TrendDigestSection["featuredExcerpt"];
    if (input.fetchSources && sorted.length > 0) {
      // 섹션당 1건만 fetch해 비용·토큰을 bound한다.
      const page = await client.fetchPage(sorted[0].url);
      fetches += 1;
      const excerpt = page.content.trim();
      featuredExcerpt = {
        title: page.title || sorted[0].title,
        url: sorted[0].url,
        excerpt: excerpt.length > FETCH_EXCERPT_CHARS
          ? excerpt.slice(0, FETCH_EXCERPT_CHARS) + "…"
          : excerpt,
      };
    }
    sections.push({ query, items, featuredExcerpt });
  }
  const generatedAt = now().toISOString().slice(0, 10);
  return {
    generatedAt,
    sections,
    markdown: trendDigestToMarkdown(generatedAt, sections),
    usage: { searches, fetches },
  };
}
