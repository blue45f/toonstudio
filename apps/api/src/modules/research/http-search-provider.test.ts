/**
 * http-search-provider.test.ts — 범용 HTTP 검색 프로바이더 단위 테스트.
 * 네트워크 없이 가짜 fetch·시계·대기로 검증한다.
 */
import { describe, expect, it, vi } from "vitest";

import { HttpSearchProvider } from "./http-search-provider";
import {
  MIN_SEARCH_REQUEST_INTERVAL_MS,
  SEARCH_ERROR_CODES,
  SearchProviderError,
  normalizeSearchFetchUrl,
  normalizeSearchQuery,
} from "./search-provider";

import type { SearchFetch } from "./search-provider";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function clientHarness() {
  const calls: { url: string; init?: RequestInit }[] = [];
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const fetchImpl: SearchFetch = vi.fn(async (input, init) => {
    calls.push({ url: String(input), init });
    return jsonResponse(200, {
      results: [
        {
          title: "조선시대 시장 풍경",
          url: "https://example.com/market",
          snippet: "저잣거리 풍경 요약",
          summary: "조선시대 저잣거리의 하루를 정리한 글",
          site_name: "example",
          rerank_score: 2.5,
          authority: 3,
        },
      ],
    });
  });
  const client = new HttpSearchProvider({
    providerName: "test-provider",
    apiKey: "test-key",
    baseUrl: "https://search.example.com",
    fetchImpl,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { client, calls, sleeps, advance: (ms: number) => { clock += ms; } };
}

describe("http-search-provider 질의 검증", () => {
  it("빈 질의와 128자 초과 질의를 거부한다", () => {
    expect(() => normalizeSearchQuery("")).toThrow(SearchProviderError);
    expect(() => normalizeSearchQuery(" ".repeat(10))).toThrow(SearchProviderError);
    expect(() => normalizeSearchQuery("a".repeat(129))).toThrow(SearchProviderError);
    expect(normalizeSearchQuery("  조선시대 시장  ")).toBe("조선시대 시장");
    expect(normalizeSearchQuery("a".repeat(128)).length).toBe(128);
  });

  it("자격증명 포함·비http(s) fetch URL을 거부한다", () => {
    expect(() => normalizeSearchFetchUrl("https://user:pass@example.com/")).toThrow(
      SearchProviderError,
    );
    expect(() => normalizeSearchFetchUrl("ftp://example.com/")).toThrow(
      SearchProviderError,
    );
    expect(normalizeSearchFetchUrl("https://example.com/a")).toBe(
      "https://example.com/a",
    );
  });

  it("키가 없으면 생성자가 거부한다", () => {
    expect(() => new HttpSearchProvider({
      providerName: "test-provider",
      apiKey: "  ",
      baseUrl: "https://search.example.com",
    })).toThrow(SearchProviderError);
  });

  it("http 기본 URL을 거부한다", () => {
    expect(() => new HttpSearchProvider({
      providerName: "test-provider",
      apiKey: "test-key",
      baseUrl: "http://search.example.com",
    })).toThrow(SearchProviderError);
  });
});

describe("http-search-provider 호출", () => {
  it("검색 결과를 정규화하고 Authorization 헤더를 보낸다", async () => {
    const { client, calls } = clientHarness();
    expect(client.providerName).toBe("test-provider");
    const response = await client.search("조선시대 시장", { count: 5 });
    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({
      title: "조선시대 시장 풍경",
      url: "https://example.com/market",
      relevanceScore: 2.5,
      authority: 3,
    });
    const auth = (calls[0].init?.headers as Record<string, string>)["Authorization"];
    expect(auth).toBe("Bearer test-key");
    const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    expect(body["query"]).toBe("조선시대 시장");
    expect(body["count"]).toBe(5);
    expect(calls[0].url).toBe("https://search.example.com/v1/tools/search");
  });

  it("count를 1~50으로 clamp한다", async () => {
    const { client, calls } = clientHarness();
    await client.search("질의", { count: 999 });
    const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    expect(body["count"]).toBe(50);
  });

  it("두 번째 요청은 최소 간격만큼 기다려 속도 제한을 지킨다", async () => {
    const { client, sleeps } = clientHarness();
    await client.search("질의1");
    await client.search("질의2");
    expect(sleeps).toContain(MIN_SEARCH_REQUEST_INTERVAL_MS);
  });

  it("401은 503 인증 오류로, 429는 429로, 500은 502로 매핑한다", async () => {
    const failing = (status: number): SearchFetch =>
      (async () => jsonResponse(status, {})) as SearchFetch;
    for (const [status, code, httpStatus] of [
      [401, SEARCH_ERROR_CODES.auth, 503],
      [429, SEARCH_ERROR_CODES.rateLimited, 429],
      [500, SEARCH_ERROR_CODES.upstream, 502],
    ] as const) {
      const client = new HttpSearchProvider({
        providerName: "test-provider",
        apiKey: "test-key",
        baseUrl: "https://search.example.com",
        fetchImpl: failing(status),
        now: () => 1_000_000,
        sleep: async () => {},
      });
      const error = await client.search("질의").catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(SearchProviderError);
      expect((error as SearchProviderError).code).toBe(code);
      expect((error as SearchProviderError).status).toBe(httpStatus);
      // 오류 메시지에 키가 포함되지 않는다.
      expect((error as Error).message).not.toContain("test-key");
    }
  });

  it("fetch 결과 본문을 상한으로 자른다", async () => {
    const fetchImpl: SearchFetch = (async () =>
      jsonResponse(200, {
        title: "긴 글",
        content: "x".repeat(30_000),
      })) as SearchFetch;
    const client = new HttpSearchProvider({
      providerName: "test-provider",
      apiKey: "test-key",
      baseUrl: "https://search.example.com",
      fetchImpl,
      maxFetchChars: 100,
      now: () => 1_000_000,
      sleep: async () => {},
    });
    const page = await client.fetchPage("https://example.com/long");
    expect(page.content.length).toBe(100);
  });
});
