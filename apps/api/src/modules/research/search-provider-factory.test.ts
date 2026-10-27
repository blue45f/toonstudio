/**
 * search-provider-factory.test.ts — 검색 프로바이더 팩토리 단위 테스트.
 * 설정 매핑과 프리셋별 오류 코드 선택만 검증한다 (실제 호출 없음).
 */
import { describe, expect, it, vi } from "vitest";

import { createSearchProviderFromEnv } from "./search-provider-factory";
import { LEGACY_DEEPSEEK_ERROR_CODES } from "./search-provider-config";
import {
  SEARCH_ERROR_CODES,
  SearchProviderError,
} from "./search-provider";

import type { SearchFetch } from "./search-provider";

function jsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

describe("search-provider-factory", () => {
  it("키가 없으면 null을 반환한다", () => {
    expect(createSearchProviderFromEnv({})).toBeNull();
  });

  it("기본 프리셋은 하위 호환 오류 코드를 쓴다", async () => {
    const fetchImpl: SearchFetch = vi.fn(
      async () => jsonResponse(401),
    ) as unknown as SearchFetch;
    const provider = createSearchProviderFromEnv(
      { RESEARCH_SEARCH_API_KEY: "k" },
      { fetchImpl, now: () => 1_000_000, sleep: async () => {} },
    );
    expect(provider?.providerName).toBe("deepseek");
    const error = await provider!.search("질의").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(SearchProviderError);
    expect((error as SearchProviderError).code).toBe(
      LEGACY_DEEPSEEK_ERROR_CODES.auth,
    );
    expect((error as SearchProviderError).status).toBe(503);
  });

  it("커스텀 프로바이더는 범용 오류 코드와 지정한 이름을 쓴다", async () => {
    const fetchImpl: SearchFetch = vi.fn(
      async () => jsonResponse(429),
    ) as unknown as SearchFetch;
    const provider = createSearchProviderFromEnv(
      {
        RESEARCH_SEARCH_API_KEY: "k",
        RESEARCH_SEARCH_PROVIDER: "acme",
        RESEARCH_SEARCH_BASE_URL: "https://acme.example.com",
      },
      { fetchImpl, now: () => 1_000_000, sleep: async () => {} },
    );
    expect(provider?.providerName).toBe("acme");
    const error = await provider!.search("질의").catch((cause: unknown) => cause);
    expect((error as SearchProviderError).code).toBe(
      SEARCH_ERROR_CODES.rateLimited,
    );
    expect((error as SearchProviderError).status).toBe(429);
  });

  it("커스텀 프로바이더에 기본 URL이 없으면 null이다", () => {
    expect(createSearchProviderFromEnv({
      RESEARCH_SEARCH_API_KEY: "k",
      RESEARCH_SEARCH_PROVIDER: "acme",
    })).toBeNull();
  });
});
