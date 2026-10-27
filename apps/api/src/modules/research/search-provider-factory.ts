/**
 * search-provider-factory.ts — 환경변수에서 SearchProvider를 만드는 Nest 팩토리.
 * 서비스는 이 토큰으로 주입된 인터페이스에만 의존한다.
 *
 * 현재 지원하는 와이어는 POST /v1/tools/search + /v1/tools/fetch JSON 형태
 * (DeepSeek 호환 검색 API)이다. 다른 호환 API를 쓰려면 코드 변경이 아니라
 * 환경변수만 바꾸면 된다: RESEARCH_SEARCH_PROVIDER=<이름>,
 * RESEARCH_SEARCH_BASE_URL=<기본 URL>, RESEARCH_SEARCH_API_KEY=<키>.
 * 기본 프리셋("deepseek")은 하위 호환 오류 코드를 유지한다.
 */
import { HttpSearchProvider } from "./http-search-provider";
import {
  DEFAULT_SEARCH_PROVIDER,
  LEGACY_DEEPSEEK_ERROR_CODES,
  resolveSearchProviderConfig,
} from "./search-provider-config";
import {
  SEARCH_ERROR_CODES,
  type SearchFetch,
  type SearchProvider,
} from "./search-provider";

/** Nest 주입 토큰 — 프로바이더 인스턴스(미설정 시 null)를 가리킨다. */
export const RESEARCH_SEARCH_PROVIDER = Symbol("RESEARCH_SEARCH_PROVIDER");

export interface SearchProviderFactoryOverrides {
  readonly fetchImpl?: SearchFetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * 환경변수에서 프로바이더를 만든다. 키가 없거나 커스텀 프로바이더의 기본
 * URL이 없으면 null을 반환하고 호출부는 기능을 비활성화 상태로 보고한다.
 * 키 값은 절대 로그에 남기지 않는다.
 */
export function createSearchProviderFromEnv(
  env: NodeJS.ProcessEnv,
  overrides?: SearchProviderFactoryOverrides,
): SearchProvider | null {
  const config = resolveSearchProviderConfig(env);
  if (!config) return null;
  return new HttpSearchProvider({
    providerName: config.provider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    errorCodes: config.provider === DEFAULT_SEARCH_PROVIDER
      ? LEGACY_DEEPSEEK_ERROR_CODES
      : SEARCH_ERROR_CODES,
    ...overrides,
  });
}
