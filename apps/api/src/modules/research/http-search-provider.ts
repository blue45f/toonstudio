/**
 * http-search-provider.ts — SearchProvider의 HTTP 구현 (순수 모듈, Nest 무의존).
 * fetch 주입으로 단위 테스트에서 네트워크 없이 검증한다.
 *
 * 와이어 형태 (DeepSeek 호환 검색 API 기준, 2026-10-27 확인):
 *  - POST {baseUrl}/v1/tools/search — query 1~128자, count 1~50,
 *    site:/lang:/after:/before: 연산자 지원. 결과는 title/url/snippet/summary와
 *    rerank_score(0~3)/authority(0~4)를 포함한다.
 *  - POST {baseUrl}/v1/tools/fetch — URL 1건, 페이지를 Markdown으로 반환한다.
 *  - 요금은 성공 호출 기준 엔드포인트별 1,000건당 $0.75이며, 빈 결과·실패는 무료다.
 *
 * 이 클라이언트는 baseUrl·키·오류 코드만 주입받는다. 따라서 같은 와이어를
 * 말하는 다른 호환 검색 API도 코드 변경 없이 baseUrl과 키만 바꿔 쓸 수 있다.
 * 속도 제한은 프로바이더마다 다르므로, 요청 시작 간격 최소 200ms(5 QPS 상당)의
 * 보수적 직렬 큐로 지킨다.
 *
 * 보안:
 *  - API 키는 환경변수에서만 읽고(팩토리 참조), 코드·로그·오류 메시지에
 *    키를 절대 포함하지 않는다. 키가 없으면 팩토리가 null을 반환해 기능이
 *    비활성화된다.
 *  - 이 클라이언트는 쿼리 문자열만 전송한다. 미공개 원고 본문을 쿼리로 보내는
 *    일은 상위 계층의 길이 제한(최대 128자)이 막는다.
 */

import {
  DEFAULT_MAX_FETCH_CHARS,
  DEFAULT_SEARCH_TIMEOUT_MS,
  MIN_SEARCH_REQUEST_INTERVAL_MS,
  SEARCH_ERROR_CODES,
  SearchProviderError,
  normalizeSearchFetchUrl,
  normalizeSearchQuery,
  type FetchResponse,
  type SearchErrorCodes,
  type SearchFetch,
  type SearchProvider,
  type SearchResponse,
  type SearchResult,
} from "./search-provider";

export interface HttpSearchProviderConfig {
  readonly providerName: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly maxFetchChars?: number;
  readonly fetchImpl?: SearchFetch;
  /** 오류 코드 집합. 미지정 시 범용 코드(SEARCH_*)를 쓴다. */
  readonly errorCodes?: SearchErrorCodes;
  /** 테스트용 시간·대기 주입. 미지정 시 Date.now/setTimeout을 쓴다. */
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

type JsonRecord = Record<string, unknown>;

function recordOf(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function boundedString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function boundedNumber(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function parseSearchResults(body: unknown): SearchResult[] {
  const root = recordOf(body);
  const rawResults = root ? root["results"] : undefined;
  if (!Array.isArray(rawResults)) return [];
  const results: SearchResult[] = [];
  for (const raw of rawResults) {
    const item = recordOf(raw);
    if (!item) continue;
    const url = boundedString(item["url"], 2048);
    if (!url) continue;
    const relevance = item["rerank_score"] ?? item["relevance_score"];
    results.push({
      title: boundedString(item["title"], 300),
      url,
      snippet: boundedString(item["snippet"], 500),
      summary: boundedString(item["summary"], 1000),
      content: boundedString(item["content"], 4000),
      siteName: boundedString(
        item["site_name"] ?? item["siteName"] ?? item["site"],
        200,
      ),
      relevanceScore: boundedNumber(relevance, 0, 3),
      authority: boundedNumber(item["authority"], -1, 4),
    });
  }
  return results;
}

export class HttpSearchProvider implements SearchProvider {
  readonly providerName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxFetchChars: number;
  private readonly fetchImpl: SearchFetch;
  private readonly errorCodes: SearchErrorCodes;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** 요청 시작 간격을 벌리기 위한 직렬 큐. */
  private queue: Promise<void> = Promise.resolve();
  private lastStartMs = 0;

  constructor(config: HttpSearchProviderConfig) {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new SearchProviderError(
        (config.errorCodes ?? SEARCH_ERROR_CODES).auth,
        503,
        "검색 API 키가 설정되지 않았습니다.",
      );
    }
    this.providerName = config.providerName;
    this.apiKey = config.apiKey;
    this.baseUrl = HttpSearchProvider.sanitizeBaseUrl(
      config.baseUrl,
      config.errorCodes ?? SEARCH_ERROR_CODES,
    );
    this.timeoutMs = config.timeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS;
    this.maxFetchChars = config.maxFetchChars ?? DEFAULT_MAX_FETCH_CHARS;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.errorCodes = config.errorCodes ?? SEARCH_ERROR_CODES;
    this.now = config.now ?? Date.now;
    this.sleep = config.sleep ?? ((ms) => new Promise((resolve) => {
      setTimeout(resolve, ms);
    }));
  }

  private static sanitizeBaseUrl(value: string, codes: SearchErrorCodes): string {
    const candidate = (value ?? "").trim();
    if (!candidate) {
      throw new SearchProviderError(
        codes.upstream,
        502,
        "검색 API 기본 URL이 설정되지 않았습니다.",
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new SearchProviderError(
        codes.upstream,
        502,
        "검색 API 기본 URL이 올바르지 않습니다.",
      );
    }
    if (parsed.protocol !== "https:") {
      throw new SearchProviderError(
        codes.upstream,
        502,
        "검색 API URL은 HTTPS여야 합니다.",
      );
    }
    return parsed.toString().replace(/\/+$/u, "");
  }

  /** 속도 제한을 지키기 위해 이전 요청 시작 후 최소 간격을 기다린다. */
  private async throttle(): Promise<void> {
    const run = this.queue.then(async () => {
      const elapsed = this.now() - this.lastStartMs;
      if (elapsed < MIN_SEARCH_REQUEST_INTERVAL_MS) {
        await this.sleep(MIN_SEARCH_REQUEST_INTERVAL_MS - elapsed);
      }
      this.lastStartMs = this.now();
    });
    // 큐가 실패로 끊기지 않게 흡수한다. 호출부는 run의 결과를 기다린다.
    this.queue = run.catch(() => {});
    await run;
  }

  private async postJson(path: string, payload: JsonRecord): Promise<unknown> {
    await this.throttle();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        throw new SearchProviderError(
          this.errorCodes.auth,
          503,
          "검색 API 키가 유효하지 않거나 권한이 없습니다.",
        );
      }
      if (response.status === 429) {
        throw new SearchProviderError(
          this.errorCodes.rateLimited,
          429,
          "검색 API 호출 한도에 도달했습니다. 잠시 후 다시 시도하세요.",
        );
      }
      if (!response.ok) {
        throw new SearchProviderError(
          this.errorCodes.upstream,
          502,
          `검색 API 호출이 실패했습니다 (HTTP ${response.status}).`,
        );
      }
      return await response.json() as unknown;
    } catch (error) {
      if (error instanceof SearchProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new SearchProviderError(
          this.errorCodes.timeout,
          504,
          "검색 API 호출 시간이 초과되었습니다.",
        );
      }
      throw new SearchProviderError(
        this.errorCodes.upstream,
        502,
        "검색 API 호출 중 오류가 발생했습니다.",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** 웹 검색. count는 1~50이며 요금은 건수와 무관하게 건당 부과된다. */
  async search(
    query: string,
    options?: { count?: number; needContent?: boolean },
  ): Promise<SearchResponse> {
    const normalized = normalizeSearchQuery(query);
    const count = options?.count === undefined
      ? 10
      : Math.min(50, Math.max(1, Math.floor(options.count)));
    const body = await this.postJson("/v1/tools/search", {
      query: normalized,
      count,
      need_content: options?.needContent ?? false,
    });
    return { results: parseSearchResults(body) };
  }

  /** 페이지 1건을 Markdown으로 가져온다. 본문은 상한으로 자른다. */
  async fetchPage(url: string): Promise<FetchResponse> {
    const normalized = normalizeSearchFetchUrl(url);
    const body = await this.postJson("/v1/tools/fetch", { url: normalized });
    const root = recordOf(body) ?? {};
    const content = boundedString(root["content"], this.maxFetchChars);
    return {
      title: boundedString(root["title"], 300),
      content,
    };
  }
}
