/**
 * search-provider.ts — 검색 프로바이더 추상화 (순수 모듈, Nest·DB 무의존).
 *
 * 리서치 서비스·브리프·존재 확인·다이제스트·크레딧 코드는 이 인터페이스에만
 * 의존한다. 특정 검색 API의 이름·기본 URL·응답 필드명은 이 파일에 없다.
 * 프로바이더별 세부 사항은 http-search-provider.ts(호환 와이어 구현)와
 * search-provider-config.ts(기본값·폴백)에만 있다.
 *
 * 정규화된 결과 필드:
 *  - relevanceScore: 검색 엔진의 관련도 점수 (DeepSeek 호환 API의 rerank_score,
 *    0~3). 다른 호환 API가 relevance_score를 보내면 그것도 읽는다.
 *  - authority: 출처 권위 등급 (0~4, -1은 알 수 없음).
 */

export const MAX_SEARCH_QUERY_LENGTH = 128;
/** 프로바이더 속도 제한을 보수적으로 지키기 위한 요청 시작 최소 간격. */
export const MIN_SEARCH_REQUEST_INTERVAL_MS = 200;
/** 기본 요청 타임아웃. */
export const DEFAULT_SEARCH_TIMEOUT_MS = 15_000;
/** fetch 결과 본문 상한 — 토큰 비용을 bound하기 위해 자른다. */
export const DEFAULT_MAX_FETCH_CHARS = 20_000;

export type SearchFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly summary: string;
  readonly content: string;
  readonly siteName: string;
  readonly relevanceScore: number;
  readonly authority: number;
}

export interface SearchResponse {
  readonly results: readonly SearchResult[];
}

export interface FetchResponse {
  readonly title: string;
  readonly content: string;
}

export interface SearchProvider {
  /** status 응답에 표시되는 프로바이더 이름 (설정의 provider 값). */
  readonly providerName: string;
  search(
    query: string,
    options?: { count?: number; needContent?: boolean },
  ): Promise<SearchResponse>;
  fetchPage(url: string): Promise<FetchResponse>;
}

export interface SearchErrorCodes {
  readonly invalidQuery: string;
  readonly invalidUrl: string;
  readonly auth: string;
  readonly rateLimited: string;
  readonly timeout: string;
  readonly upstream: string;
}

/** 범용 프로바이더용 오류 코드. 기본 프리셋은 하위 호환을 위해 별도 코드를 쓴다. */
export const SEARCH_ERROR_CODES: SearchErrorCodes = {
  invalidQuery: "SEARCH_INVALID_QUERY",
  invalidUrl: "SEARCH_INVALID_URL",
  auth: "SEARCH_AUTH_ERROR",
  rateLimited: "SEARCH_RATE_LIMITED",
  timeout: "SEARCH_TIMEOUT",
  upstream: "SEARCH_UPSTREAM_ERROR",
} as const;

/** 검색 프로바이더 호출 오류 — 코드·HTTP 상태를 함께 담는다. */
export class SearchProviderError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "SearchProviderError";
    this.code = code;
    this.status = status;
  }
}

/** 쿼리를 검증하고 정규화한다. 길이를 넘는 입력(원고 등)은 거부한다. */
export function normalizeSearchQuery(query: unknown): string {
  if (typeof query !== "string") {
    throw new SearchProviderError(
      SEARCH_ERROR_CODES.invalidQuery,
      400,
      "검색 질의는 문자열이어야 합니다.",
    );
  }
  const trimmed = query.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_SEARCH_QUERY_LENGTH) {
    throw new SearchProviderError(
      SEARCH_ERROR_CODES.invalidQuery,
      400,
      `검색 질의는 1~${MAX_SEARCH_QUERY_LENGTH}자여야 합니다. 긴 원고는 검색 질의로 보낼 수 없습니다.`,
    );
  }
  return trimmed;
}

/** fetch 대상 URL을 검증한다. http(s)만 허용하고 자격증명 포함 URL을 거부한다. */
export function normalizeSearchFetchUrl(url: unknown): string {
  if (typeof url !== "string" || url.trim().length === 0 || url.length > 8192) {
    throw new SearchProviderError(
      SEARCH_ERROR_CODES.invalidUrl,
      400,
      "가져올 페이지 URL이 올바르지 않습니다.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new SearchProviderError(
      SEARCH_ERROR_CODES.invalidUrl,
      400,
      "가져올 페이지 URL이 올바르지 않습니다.",
    );
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    || parsed.username !== ""
    || parsed.password !== ""
  ) {
    throw new SearchProviderError(
      SEARCH_ERROR_CODES.invalidUrl,
      400,
      "가져올 페이지 URL은 자격증명 없는 http(s) URL이어야 합니다.",
    );
  }
  return parsed.toString();
}
