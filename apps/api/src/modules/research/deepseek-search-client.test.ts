/**
 * deepseek-search-client.test.ts — DeepSeek 클라이언트 단위 테스트.
 * 네트워크 없이 가짜 fetch·시계·대기로 검증한다.
 */
import { describe, expect, it, vi } from "vitest";

import {
  DEEPSEEK_MIN_REQUEST_INTERVAL_MS,
  DeepSeekSearchClient,
  DeepSeekSearchError,
  createDeepSeekSearchClientFromEnv,
  normalizeDeepSeekFetchUrl,
  normalizeDeepSeekQuery,
} from "./deepseek-search-client";

import type { DeepSeekSearchFetch } from "./deepseek-search-client";

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
  const fetchImpl: DeepSeekSearchFetch = vi.fn(async (input, init) => {
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
  const client = new DeepSeekSearchClient({
    apiKey: "test-key",
    fetchImpl,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { client, calls, sleeps, advance: (ms: number) => { clock += ms; } };
}

describe("deepseek-search-client 질의 검증", () => {
  it("빈 질의와 128자 초과 질의를 거부한다", () => {
    expect(() => normalizeDeepSeekQuery("")).toThrow(DeepSeekSearchError);
    expect(() => normalizeDeepSeekQuery(" ".repeat(10))).toThrow(DeepSeekSearchError);
    expect(() => normalizeDeepSeekQuery("a".repeat(129))).toThrow(DeepSeekSearchError);
    expect(normalizeDeepSeekQuery("  조선시대 시장  ")).toBe("조선시대 시장");
    expect(normalizeDeepSeekQuery("a".repeat(128)).length).toBe(128);
  });

  it("자격증명 포함·비http(s) fetch URL을 거부한다", () => {
    expect(() => normalizeDeepSeekFetchUrl("https://user:pass@example.com/")).toThrow(
      DeepSeekSearchError,
    );
    expect(() => normalizeDeepSeekFetchUrl("ftp://example.com/")).toThrow(
      DeepSeekSearchError,
    );
    expect(normalizeDeepSeekFetchUrl("https://example.com/a")).toBe(
      "https://example.com/a",
    );
  });

  it("키가 없으면 환경 팩토리가 null을 반환한다", () => {
    expect(createDeepSeekSearchClientFromEnv({})).toBeNull();
    expect(createDeepSeekSearchClientFromEnv({ DEEPSEEK_API_KEY: "  " })).toBeNull();
    expect(createDeepSeekSearchClientFromEnv({ DEEPSEEK_API_KEY: "k" })).not.toBeNull();
  });
});

describe("deepseek-search-client 호출", () => {
  it("검색 결과를 정규화하고 Authorization 헤더를 보낸다", async () => {
    const { client, calls } = clientHarness();
    const response = await client.search("조선시대 시장", { count: 5 });
    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({
      title: "조선시대 시장 풍경",
      url: "https://example.com/market",
      rerankScore: 2.5,
      authority: 3,
    });
    const auth = (calls[0].init?.headers as Record<string, string>)["Authorization"];
    expect(auth).toBe("Bearer test-key");
    const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    expect(body["query"]).toBe("조선시대 시장");
    expect(body["count"]).toBe(5);
  });

  it("count를 1~50으로 clamp한다", async () => {
    const { client, calls } = clientHarness();
    await client.search("질의", { count: 999 });
    const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    expect(body["count"]).toBe(50);
  });

  it("두 번째 요청은 최소 간격만큼 기다려 5 QPS를 지킨다", async () => {
    const { client, sleeps } = clientHarness();
    await client.search("질의1");
    await client.search("질의2");
    expect(sleeps).toContain(DEEPSEEK_MIN_REQUEST_INTERVAL_MS);
  });

  it("401은 503 인증 오류로, 429는 429로, 500은 502로 매핑한다", async () => {
    const failing = (status: number): DeepSeekSearchFetch =>
      (async () => jsonResponse(status, {})) as DeepSeekSearchFetch;
    for (const [status, code, httpStatus] of [
      [401, "DEEPSEEK_AUTH_ERROR", 503],
      [429, "DEEPSEEK_RATE_LIMITED", 429],
      [500, "DEEPSEEK_UPSTREAM_ERROR", 502],
    ] as const) {
      const client = new DeepSeekSearchClient({
        apiKey: "test-key",
        fetchImpl: failing(status),
        now: () => 1_000_000,
        sleep: async () => {},
      });
      const error = await client.search("질의").catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(DeepSeekSearchError);
      expect((error as DeepSeekSearchError).code).toBe(code);
      expect((error as DeepSeekSearchError).status).toBe(httpStatus);
      // 오류 메시지에 키가 포함되지 않는다.
      expect((error as Error).message).not.toContain("test-key");
    }
  });

  it("fetch 결과 본문을 상한으로 자른다", async () => {
    const fetchImpl: DeepSeekSearchFetch = (async () =>
      jsonResponse(200, {
        title: "긴 글",
        content: "x".repeat(30_000),
      })) as DeepSeekSearchFetch;
    const client = new DeepSeekSearchClient({
      apiKey: "test-key",
      fetchImpl,
      maxFetchChars: 100,
      now: () => 1_000_000,
      sleep: async () => {},
    });
    const page = await client.fetchPage("https://example.com/long");
    expect(page.content.length).toBe(100);
  });
});
