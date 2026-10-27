/**
 * search-provider-config.ts — 검색 프로바이더 설정 해석 (순수 모듈).
 *
 * 프로바이더별 세부 사항(기본 프리셋·기본 URL·하위 호환 폴백)은 이 파일에만
 * 있다. 서비스·컨트롤러·DTO·크레딧 코드는 이 파일의 결과(프로바이더 이름·
 * 키·기본 URL)만 쓰며, 특정 프로바이더 이름을 직접 언급하지 않는다.
 *
 * 환경변수 (범용 이름이 우선, 없으면 하위 호환 폴백을 쓴다):
 *  - RESEARCH_SEARCH_API_KEY (필수; 폴백 DEEPSEEK_API_KEY)
 *  - RESEARCH_SEARCH_PROVIDER (기본값 "deepseek"; status.provider에 표시)
 *  - RESEARCH_SEARCH_BASE_URL (deepseek 기본값 https://api.deepseek.com;
 *    다른 프로바이더를 쓸 때는 필수. 폴백 DEEPSEEK_BASE_URL)
 *  - RESEARCH_SEARCH_TIMEOUT_MS (기본값 15000; 폴백 DEEPSEEK_TIMEOUT_MS)
 *
 * 키가 없거나, deepseek가 아닌 프로바이더인데 기본 URL이 없으면 설정은
 * null이 되어 기능이 비활성화된다 (status.configured=false, 요청 시 503).
 */

import type { SearchErrorCodes } from "./search-provider";

export const DEFAULT_SEARCH_PROVIDER = "deepseek";
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_SEARCH_TIMEOUT_MS = 15_000;

/**
 * 기본 프리셋의 하위 호환 오류 코드. 기존 배포의 응답 코드·상태를 그대로
 * 유지하기 위해 기본 프리셋에만 적용한다. 다른 프로바이더는 범용 코드를 쓴다.
 */
export const LEGACY_DEEPSEEK_ERROR_CODES: SearchErrorCodes = {
  invalidQuery: "DEEPSEEK_INVALID_QUERY",
  invalidUrl: "DEEPSEEK_INVALID_URL",
  auth: "DEEPSEEK_AUTH_ERROR",
  rateLimited: "DEEPSEEK_RATE_LIMITED",
  timeout: "DEEPSEEK_TIMEOUT",
  upstream: "DEEPSEEK_UPSTREAM_ERROR",
} as const;

export interface ResolvedSearchProviderConfig {
  readonly provider: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

/** Nest 주입 토큰 — 환경변수에서 해석한 프로바이더 이름. */
export const RESEARCH_SEARCH_PROVIDER_NAME = Symbol(
  "RESEARCH_SEARCH_PROVIDER_NAME",
);

/** 설정된 프로바이더 이름만 해석한다 (키가 없어도 기본값을 반환한다). */
export function resolveSearchProviderName(env: NodeJS.ProcessEnv): string {
  return (env["RESEARCH_SEARCH_PROVIDER"] ?? "").trim() || DEFAULT_SEARCH_PROVIDER;
}

function parsePositiveTimeout(
  raw: string | undefined,
  fallback: number,
): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const floored = Math.floor(value);
  return floored > 0 ? floored : fallback;
}

/**
 * 환경변수에서 프로바이더 설정을 만든다. 키가 없으면 null을 반환하고
 * 호출부는 기능을 비활성화 상태로 보고한다. 키 값은 절대 로그에 남기지 않는다.
 */
export function resolveSearchProviderConfig(
  env: NodeJS.ProcessEnv,
): ResolvedSearchProviderConfig | null {
  const apiKey = (
    env["RESEARCH_SEARCH_API_KEY"] ?? env["DEEPSEEK_API_KEY"] ?? ""
  ).trim();
  if (!apiKey) return null;
  const provider = resolveSearchProviderName(env);
  const baseUrl = (
    env["RESEARCH_SEARCH_BASE_URL"] ?? env["DEEPSEEK_BASE_URL"] ?? ""
  ).trim()
    || (provider === DEFAULT_SEARCH_PROVIDER ? DEFAULT_DEEPSEEK_BASE_URL : "");
  if (!baseUrl) return null;
  const timeoutMs = parsePositiveTimeout(
    env["RESEARCH_SEARCH_TIMEOUT_MS"] ?? env["DEEPSEEK_TIMEOUT_MS"],
    DEFAULT_SEARCH_TIMEOUT_MS,
  );
  return { provider, apiKey, baseUrl, timeoutMs };
}
