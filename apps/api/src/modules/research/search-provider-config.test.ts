/**
 * search-provider-config.test.ts — 검색 프로바이더 설정 해석 단위 테스트.
 * 기본 프리셋·범용 변수·하위 호환 폴백의 매핑만 검증한다 (실제 호출 없음).
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_SEARCH_PROVIDER,
  LEGACY_DEEPSEEK_ERROR_CODES,
  resolveSearchProviderConfig,
  resolveSearchProviderName,
} from "./search-provider-config";

describe("search-provider-config 프로바이더 이름", () => {
  it("미지정 시 기본 프리셋 이름을 반환한다", () => {
    expect(resolveSearchProviderName({})).toBe(DEFAULT_SEARCH_PROVIDER);
    expect(resolveSearchProviderName({ RESEARCH_SEARCH_PROVIDER: "  " })).toBe(
      DEFAULT_SEARCH_PROVIDER,
    );
    expect(resolveSearchProviderName({ RESEARCH_SEARCH_PROVIDER: "acme" })).toBe(
      "acme",
    );
  });
});

describe("search-provider-config 해석", () => {
  it("범용 변수가 하위 호환 폴백보다 우선한다", () => {
    const config = resolveSearchProviderConfig({
      RESEARCH_SEARCH_API_KEY: "generic-key",
      RESEARCH_SEARCH_BASE_URL: "https://generic.example.com",
      DEEPSEEK_API_KEY: "legacy-key",
      DEEPSEEK_BASE_URL: "https://legacy.example.com",
    });
    expect(config).toMatchObject({
      provider: "deepseek",
      apiKey: "generic-key",
      baseUrl: "https://generic.example.com",
    });
  });

  it("키가 없으면 null을 반환한다", () => {
    expect(resolveSearchProviderConfig({})).toBeNull();
    expect(resolveSearchProviderConfig({ RESEARCH_SEARCH_API_KEY: "  " })).toBeNull();
    expect(resolveSearchProviderConfig({ DEEPSEEK_API_KEY: "  " })).toBeNull();
  });

  it("기본 프리셋은 키만으로 기본 URL·타임아웃을 채운다", () => {
    const config = resolveSearchProviderConfig({ DEEPSEEK_API_KEY: "k" });
    expect(config).toMatchObject({
      provider: "deepseek",
      apiKey: "k",
      baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
      timeoutMs: 15_000,
    });
  });

  it("하위 호환 폴백으로 기본 URL·타임아웃을 읽는다", () => {
    const config = resolveSearchProviderConfig({
      RESEARCH_SEARCH_API_KEY: "k",
      DEEPSEEK_BASE_URL: "https://legacy.example.com",
      DEEPSEEK_TIMEOUT_MS: "3000",
    });
    expect(config).toMatchObject({
      baseUrl: "https://legacy.example.com",
      timeoutMs: 3000,
    });
  });

  it("커스텀 프로바이더는 기본 URL이 없으면 null이다", () => {
    expect(resolveSearchProviderConfig({
      RESEARCH_SEARCH_API_KEY: "k",
      RESEARCH_SEARCH_PROVIDER: "acme",
    })).toBeNull();
    const config = resolveSearchProviderConfig({
      RESEARCH_SEARCH_API_KEY: "k",
      RESEARCH_SEARCH_PROVIDER: "acme",
      RESEARCH_SEARCH_BASE_URL: "https://acme.example.com",
    });
    expect(config).toMatchObject({
      provider: "acme",
      baseUrl: "https://acme.example.com",
    });
  });

  it("잘못된 타임아웃은 기본값으로 되돌린다", () => {
    const config = resolveSearchProviderConfig({
      RESEARCH_SEARCH_API_KEY: "k",
      RESEARCH_SEARCH_TIMEOUT_MS: "abc",
    });
    expect(config?.timeoutMs).toBe(15_000);
    const zero = resolveSearchProviderConfig({
      RESEARCH_SEARCH_API_KEY: "k",
      RESEARCH_SEARCH_TIMEOUT_MS: "0",
    });
    expect(zero?.timeoutMs).toBe(15_000);
  });

  it("기본 프리셋의 하위 호환 오류 코드를 정의한다", () => {
    expect(LEGACY_DEEPSEEK_ERROR_CODES.auth).toBe("DEEPSEEK_AUTH_ERROR");
    expect(LEGACY_DEEPSEEK_ERROR_CODES.rateLimited).toBe("DEEPSEEK_RATE_LIMITED");
  });
});
