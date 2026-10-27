/**
 * deepseek-search-client.ts — DeepSeek Search/Fetch API의 순수 TypeScript 클라이언트.
 * Nest에 의존하지 않으며, fetch 주입으로 단위 테스트에서 네트워크 없이 검증한다.
 *
 * API (2026-10-27 확인 기준):
 *  - POST https://api.deepseek.com/v1/tools/search — query 1~128자, count 1~50,
 *    site:/lang:/after:/before: 연산자 지원. 결과는 title/url/snippet/summary와
 *    rerank_score(0~3)/authority(0~4)를 포함한다.
 *  - POST https://api.deepseek.com/v1/tools/fetch — URL 1건, 페이지를 Markdown으로 반환한다.
 *  - 요금은 성공 호출 기준 엔드포인트별 1,000건당 $0.75이며, 빈 결과·실패는 무료다.
 *  - 계정당 속도 제한은 5 QPS이므로, 이 클라이언트는 요청 시작 간격을 최소
 *    200ms로 벌리는 직렬 큐로 제한을 지킨다.
 *
 * 보안:
 *  - API 키는 환경변수(DEEPSEEK_API_KEY)에서만 읽고, 코드·로그·오류 메시지에
 *    키를 절대 포함하지 않는다. 키가 없으면 클라이언트를 만들지 않고 기능이
 *    비활성화된다 (research.module의 팩토리 참조).
 *  - 이 클라이언트는 쿼리 문자열만 전송한다. 미공개 원고 본문을 쿼리로 보내는
 *    일은 상위 계층의 길이 제한(최대 128자)이 막는다.
 */

export const DEEPSEEK_SEARCH_BASE_URL = "https://api.deepseek.com" as const;
/** DeepSeek 쿼리 길이 상한. 128자를 넘기면 원고 유입을 막기 위해 거부한다. */
export const DEEPSEEK_MAX_QUERY_LENGTH = 128;
/** 계정당 5 QPS를 지키기 위한 요청 시작 최소 간격. */
export const DEEPSEEK_MIN_REQUEST_INTERVAL_MS = 200;
/** 기본 요청 타임아웃. */
export const DEEPSEEK_DEFAULT_TIMEOUT_MS = 15_000;
/** fetch 결과 본문 상한 — 토큰 비용을 bound하기 위해 자른다. */
export const DEEPSEEK_DEFAULT_MAX_FETCH_CHARS = 20_000;

export type DeepSeekSearchFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface DeepSeekSearchClientConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxFetchChars?: number;
  readonly fetchImpl?: DeepSeekSearchFetch;
  /** 테스트용 시간·대기 주입. 미지정 시 Date.now/setTimeout을 쓴다. */
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface DeepSeekSearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly summary: string;
  readonly content: string;
  readonly siteName: string;
  readonly rerankScore: number;
  readonly authority: number;
}

export interface DeepSeekSearchResponse {
  readonly results: readonly DeepSeekSearchResult[];
}

export interface DeepSeekFetchResponse {
  readonly title: string;
  readonly content: string;
}

/** DeepSeek 호출 오류 — 코드·HTTP 상태를 함께 담는다 (repo의 provider 패턴). */
export class DeepSeekSearchError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "DeepSeekSearchError";
    this.code = code;
    this.status = status;
  }
}

export const DEEPSEEK_ERROR_CODES = {
  invalidQuery: "DEEPSEEK_INVALID_QUERY",
  invalidUrl: "DEEPSEEK_INVALID_URL",
  auth: "DEEPSEEK_AUTH_ERROR",
  rateLimited: "DEEPSEEK_RATE_LIMITED",
  timeout: "DEEPSEEK_TIMEOUT",
  upstream: "DEEPSEEK_UPSTREAM_ERROR",
} as const;

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

function sanitizeBaseUrl(value: string | undefined): string {
  const candidate = (value ?? "").trim() || DEEPSEEK_SEARCH_BASE_URL;
  const parsed = new URL(candidate);
  if (parsed.protocol !== "https:") {
    throw new DeepSeekSearchError(
      DEEPSEEK_ERROR_CODES.upstream,
      502,
      "DeepSeek API URL은 HTTPS여야 합니다.",
    );
  }
  return parsed.toString().replace(/\/+$/u, "");
}

/** 쿼리를 검증하고 정규화한다. 길이를 넘는 입력(원고 등)은 거부한다. */
export function normalizeDeepSeekQuery(query: unknown): string {
  if (typeof query !== "string") {
    throw new DeepSeekSearchError(
      DEEPSEEK_ERROR_CODES.invalidQuery,
      400,
      "검색 질의는 문자열이어야 합니다.",
    );
  }
  const trimmed = query.trim();
  if (trimmed.length < 1 || trimmed.length > DEEPSEEK_MAX_QUERY_LENGTH) {
    throw new DeepSeekSearchError(
      DEEPSEEK_ERROR_CODES.invalidQuery,
      400,
      `검색 질의는 1~${DEEPSEEK_MAX_QUERY_LENGTH}자여야 합니다. 긴 원고는 검색 질의로 보낼 수 없습니다.`,
    );
  }
  return trimmed;
}

/** fetch 대상 URL을 검증한다. http(s)만 허용하고 자격증명 포함 URL을 거부한다. */
export function normalizeDeepSeekFetchUrl(url: unknown): string {
  if (typeof url !== "string" || url.trim().length === 0 || url.length > 8192) {
    throw new DeepSeekSearchError(
      DEEPSEEK_ERROR_CODES.invalidUrl,
      400,
      "가져올 페이지 URL이 올바르지 않습니다.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new DeepSeekSearchError(
      DEEPSEEK_ERROR_CODES.invalidUrl,
      400,
      "가져올 페이지 URL이 올바르지 않습니다.",
    );
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    || parsed.username !== ""
    || parsed.password !== ""
  ) {
    throw new DeepSeekSearchError(
      DEEPSEEK_ERROR_CODES.invalidUrl,
      400,
      "가져올 페이지 URL은 자격증명 없는 http(s) URL이어야 합니다.",
    );
  }
  return parsed.toString();
}

function parseSearchResults(body: unknown): DeepSeekSearchResult[] {
  const root = recordOf(body);
  const rawResults = root ? root["results"] : undefined;
  if (!Array.isArray(rawResults)) return [];
  const results: DeepSeekSearchResult[] = [];
  for (const raw of rawResults) {
    const item = recordOf(raw);
    if (!item) continue;
    const url = boundedString(item["url"], 2048);
    if (!url) continue;
    results.push({
      title: boundedString(item["title"], 300),
      url,
      snippet: boundedString(item["snippet"], 500),
      summary: boundedString(item["summary"], 1000),
      content: boundedString(item["content"], 4000),
      siteName: boundedString(item["site_name"], 200),
      rerankScore: boundedNumber(item["rerank_score"], 0, 3),
      authority: boundedNumber(item["authority"], -1, 4),
    });
  }
  return results;
}

export class DeepSeekSearchClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxFetchChars: number;
  private readonly fetchImpl: DeepSeekSearchFetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** 요청 시작 간격을 벌리기 위한 직렬 큐. */
  private queue: Promise<void> = Promise.resolve();
  private lastStartMs = 0;

  constructor(config: DeepSeekSearchClientConfig) {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new DeepSeekSearchError(
        DEEPSEEK_ERROR_CODES.auth,
        503,
        "DeepSeek API 키가 설정되지 않았습니다.",
      );
    }
    this.apiKey = config.apiKey;
    this.baseUrl = sanitizeBaseUrl(config.baseUrl);
    this.timeoutMs = config.timeoutMs ?? DEEPSEEK_DEFAULT_TIMEOUT_MS;
    this.maxFetchChars = config.maxFetchChars ?? DEEPSEEK_DEFAULT_MAX_FETCH_CHARS;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? Date.now;
    this.sleep = config.sleep ?? ((ms) => new Promise((resolve) => {
      setTimeout(resolve, ms);
    }));
  }

  /** 5 QPS 제한을 지키기 위해 이전 요청 시작 후 최소 간격을 기다린다. */
  private async throttle(): Promise<void> {
    const run = this.queue.then(async () => {
      const elapsed = this.now() - this.lastStartMs;
      if (elapsed < DEEPSEEK_MIN_REQUEST_INTERVAL_MS) {
        await this.sleep(DEEPSEEK_MIN_REQUEST_INTERVAL_MS - elapsed);
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
        throw new DeepSeekSearchError(
          DEEPSEEK_ERROR_CODES.auth,
          503,
          "DeepSeek API 키가 유효하지 않거나 권한이 없습니다.",
        );
      }
      if (response.status === 429) {
        throw new DeepSeekSearchError(
          DEEPSEEK_ERROR_CODES.rateLimited,
          429,
          "DeepSeek API 호출 한도에 도달했습니다. 잠시 후 다시 시도하세요.",
        );
      }
      if (!response.ok) {
        throw new DeepSeekSearchError(
          DEEPSEEK_ERROR_CODES.upstream,
          502,
          `DeepSeek API 호출이 실패했습니다 (HTTP ${response.status}).`,
        );
      }
      return await response.json() as unknown;
    } catch (error) {
      if (error instanceof DeepSeekSearchError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new DeepSeekSearchError(
          DEEPSEEK_ERROR_CODES.timeout,
          504,
          "DeepSeek API 호출 시간이 초과되었습니다.",
        );
      }
      throw new DeepSeekSearchError(
        DEEPSEEK_ERROR_CODES.upstream,
        502,
        "DeepSeek API 호출 중 오류가 발생했습니다.",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** 웹 검색. count는 1~50이며 요금은 건수와 무관하게 건당 부과된다. */
  async search(
    query: string,
    options?: { count?: number; needContent?: boolean },
  ): Promise<DeepSeekSearchResponse> {
    const normalized = normalizeDeepSeekQuery(query);
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
  async fetchPage(url: string): Promise<DeepSeekFetchResponse> {
    const normalized = normalizeDeepSeekFetchUrl(url);
    const body = await this.postJson("/v1/tools/fetch", { url: normalized });
    const root = recordOf(body) ?? {};
    const content = boundedString(root["content"], this.maxFetchChars);
    return {
      title: boundedString(root["title"], 300),
      content,
    };
  }
}

/** Nest 주입 토큰 — 클라이언트 인스턴스(미설정 시 null)를 가리킨다. */
export const RESEARCH_DEEPSEEK_CLIENT = Symbol("RESEARCH_DEEPSEEK_CLIENT");

/**
 * 환경변수에서 클라이언트를 만든다. DEEPSEEK_API_KEY가 없으면 null을 반환하고
 * 호출부는 기능을 비활성화 상태로 보고한다. 키 값은 절대 로그에 남기지 않는다.
 */
export function createDeepSeekSearchClientFromEnv(
  env: NodeJS.ProcessEnv,
  overrides?: Partial<DeepSeekSearchClientConfig>,
): DeepSeekSearchClient | null {
  const apiKey = (env["DEEPSEEK_API_KEY"] ?? "").trim();
  if (!apiKey) return null;
  const timeoutRaw = Number(env["DEEPSEEK_TIMEOUT_MS"]);
  return new DeepSeekSearchClient({
    apiKey,
    baseUrl: env["DEEPSEEK_BASE_URL"],
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0
      ? timeoutRaw
      : undefined,
    ...overrides,
  });
}
