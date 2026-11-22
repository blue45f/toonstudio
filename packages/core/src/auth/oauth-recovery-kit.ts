/**
 * 외부 OAuth(카카오·구글 등) 엣지 케이스·토큰 갱신 실패 표준 복구 모듈.
 *
 * 프레임워크·런타임 무관 순수 TypeScript 구현(React·DOM·Node 전용 API 비의존)으로,
 * 브라우저·Edge Worker·Node·모바일 하이브리드 앱 및 타 프로젝트에 그대로 재사용한다.
 *
 * 포함 기능:
 * 1. PKCE / state 불일치·만료·중복 콜백 감지 (상수 시간 문자열 대조)
 * 2. 팝업 차단 및 인앱 웹뷰 감지 → 리다이렉트 / 외부 브라우저 폴백 판단
 * 3. 일시적 5xx·429·네트워크 오류 지수 백오프 재시도 (Retry-After 존중)
 * 4. 동시 401 발생 시 단일 flight 토큰 갱신 큐 (중복 refresh 차단 · 무한 루프 방지)
 * 5. 카카오·구글·표준 OAuth 오류를 사용자 친화적 한글 안내로 분류
 *
 * 참고: 이 모듈은 클라이언트·게이트웨이 복구 흐름만 담당하며, 서버 JWT/액세스 토큰 TTL 정책을
 * 정의하거나 변경하지 않는다.
 */

export type OAuthProvider = "kakao" | "google" | "generic";
export type OAuthErrorCategory =
  | "security" | "popup" | "network" | "token"
  | "account-conflict" | "user-cancelled" | "configuration";
export type OAuthRecommendedAction =
  | "retry" | "redirect-fallback" | "open-external-browser" | "relogin"
  | "link-existing-account" | "reuse-existing-session" | "contact-support" | "dismiss";
export type OAuthCallbackFailureCode =
  | "provider_error" | "user_cancelled" | "missing_state" | "state_mismatch" | "state_expired"
  | "duplicate_callback" | "pkce_missing_verifier" | "pkce_invalid_verifier" | "pkce_mismatch";
export type OAuthPopupFallbackStrategy = "popup" | "redirect" | "external-browser-handoff";

export interface OAuthRecoveryClassification {
  readonly code: string;
  readonly provider: OAuthProvider;
  readonly category: OAuthErrorCategory;
  readonly retryable: boolean;
  readonly requiresReauthentication: boolean;
  readonly recommendedAction: OAuthRecommendedAction;
  readonly titleKo: string;
  readonly messageKo: string;
  readonly actionLabelKo: string;
}

export interface OAuthCallbackSecurityInput {
  readonly provider?: OAuthProvider;
  readonly receivedState?: string | null;
  readonly expectedState?: string | null;
  readonly issuedAtMs?: number | null;
  readonly nowMs?: number;
  readonly stateTtlMs?: number;
  readonly hasExistingAuthenticatedSession?: boolean;
  readonly providerError?: string | null;
  readonly providerErrorDescription?: string | null;
  readonly requirePkce?: boolean;
  readonly codeVerifier?: string | null;
  readonly expectedCodeChallenge?: string | null;
  readonly computedCodeChallenge?: string | null;
  readonly codeChallengeMethod?: "S256" | "plain";
}

export interface OAuthCallbackSecurityResult {
  readonly ok: boolean;
  readonly failureCode: OAuthCallbackFailureCode | null;
  readonly recoverable: boolean;
  readonly recommendedAction: OAuthRecommendedAction;
  readonly shouldClearStateCookie: boolean;
  readonly classification: OAuthRecoveryClassification | null;
}

export interface OAuthPopupWindowLike { readonly closed?: boolean }

export interface OAuthPopupFallbackInput {
  readonly provider?: OAuthProvider;
  readonly popupWindow?: OAuthPopupWindowLike | null;
  readonly popupError?: unknown;
  readonly userAgent?: string | null;
  readonly isStandalonePwa?: boolean;
  readonly redirectAuthorizeUrl?: string | null;
}

export interface OAuthPopupFallbackDecision {
  readonly shouldFallbackToRedirect: boolean;
  readonly strategy: OAuthPopupFallbackStrategy;
  readonly reasonCode:
    | "popup_ready" | "popup_blocked" | "coop_blocked"
    | "in_app_webview_disallowed" | "standalone_pwa_redirect" | "user_cancelled";
  readonly redirectUrl: string | null;
  readonly messageKo: string;
}

export interface OAuthRetryFailureShape {
  readonly status?: number;
  readonly code?: string;
  readonly name?: string;
  readonly message?: string;
  readonly retryAfter?: string | number | null;
}

export interface OAuthBackoffOptions {
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly jitterRatio?: number;
  readonly signal?: AbortSignal;
  readonly random?: () => number;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly isRetryable?: (error: unknown) => boolean;
  readonly onRetry?: (info: { readonly attempt: number; readonly delayMs: number; readonly error: unknown }) => void;
}

export interface OAuthBackoffResult<T> {
  readonly value: T;
  readonly attempts: number;
  readonly totalWaitMs: number;
}

export interface SingleFlightTokenRefreshRequestOptions {
  readonly force?: boolean;
  readonly reason?: string;
}

export interface SingleFlightTokenRefresherOptions<TToken> {
  readonly refresh: () => Promise<TToken>;
  /** 직전 갱신 성공 직후 도착한 지연 401을 병합하는 창(ms, 기본 1500ms). */
  readonly dedupeWindowMs?: number;
  /** 연속 실패 시 무한 재시도를 차단하는 상한(기본 3회). */
  readonly maxConsecutiveFailures?: number;
  readonly now?: () => number;
  readonly isTerminalAuthError?: (error: unknown) => boolean;
  readonly onReauthRequired?: (classification: OAuthRecoveryClassification, error: unknown) => void;
}

export interface SingleFlightTokenRefresherStats {
  readonly totalRequests: number;
  readonly executedRefreshes: number;
  readonly coalescedRequests: number;
  readonly failedRefreshes: number;
  readonly consecutiveFailures: number;
  readonly reauthRequired: boolean;
  readonly inFlight: boolean;
}

export interface SingleFlightAuthRetryOptions<TResult, TToken> {
  readonly request: (refreshedToken?: TToken) => Promise<TResult>;
  readonly isUnauthorized?: (error: unknown) => boolean;
  readonly reason?: string;
}

export interface SingleFlightTokenRefresher<TToken> {
  refresh(options?: SingleFlightTokenRefreshRequestOptions): Promise<TToken>;
  executeWithAuthRetry<TResult>(options: SingleFlightAuthRetryOptions<TResult, TToken>): Promise<TResult>;
  getStats(): SingleFlightTokenRefresherStats;
  reset(): void;
}

export class OAuthReauthRequiredError extends Error {
  readonly classification: OAuthRecoveryClassification;
  override readonly cause?: unknown;

  constructor(classification: OAuthRecoveryClassification, cause?: unknown) {
    super(classification.messageKo);
    this.name = "OAuthReauthRequiredError";
    this.classification = classification;
    this.cause = cause;
  }
}

export const DEFAULT_OAUTH_STATE_TTL_MS = 10 * 60_000;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/u;
const IN_APP_BROWSER_UA_PATTERN =
  /\b(?:KAKAOTALK|NAVER|Line\/|Instagram|FBAN|FBAV|FBIOS|WebView|DaumApps|Everytime|Band\/)\b|;\s*wv\)/iu;
const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const TERMINAL_AUTH_CODES = [
  "invalid_grant",
  "invalid_token",
  "refresh_token_expired",
  "refresh_token_revoked",
  "session_revoked",
  "koe320",
  "koe322",
] as const;

function clampNonNegativeFinite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** 브라우저·Worker·Node 전 환경에서 동작하는 상수 시간 문자열 비교. */
export function constantTimeStringEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < maxLength; i += 1) {
    diff |= (i < left.length ? left.charCodeAt(i) : 0) ^ (i < right.length ? right.charCodeAt(i) : 0);
  }
  return diff === 0;
}

/** RFC 7636 §4.1 규격(길이 43~128자, unreserved 문자셋) PKCE code_verifier 검증. */
export function isValidPkceCodeVerifier(verifier: string | null | undefined): boolean {
  return typeof verifier === "string" && PKCE_VERIFIER_PATTERN.test(verifier);
}

/** 인앱 웹뷰(카카오톡·인스타그램·네이버·안드로이드 WebView 등) User-Agent 여부 판정. */
export function isRestrictedInAppBrowserUserAgent(userAgent: string | null | undefined): boolean {
  return typeof userAgent === "string" && userAgent.trim().length > 0 && IN_APP_BROWSER_UA_PATTERN.test(userAgent);
}

function extractFailureShape(error: unknown): OAuthRetryFailureShape {
  if (error instanceof Error) {
    const rec = error as Error & {
      status?: unknown;
      statusCode?: unknown;
      code?: unknown;
      error?: unknown;
      retryAfter?: unknown;
      response?: { status?: unknown; headers?: { get?: (name: string) => string | null } };
    };
    const status = typeof rec.status === "number"
      ? rec.status
      : typeof rec.statusCode === "number"
        ? rec.statusCode
        : typeof rec.response?.status === "number"
          ? rec.response.status
          : undefined;
    const code = typeof rec.code === "string" ? rec.code : typeof rec.error === "string" ? rec.error : undefined;
    const retryAfter = typeof rec.retryAfter === "string" || typeof rec.retryAfter === "number"
      ? rec.retryAfter
      : rec.response?.headers?.get?.("retry-after") ?? null;
    return { status, code, name: rec.name, message: rec.message, retryAfter };
  }
  if (typeof error === "string") return { code: error, message: error };
  if (typeof error === "object" && error !== null) {
    const rec = error as Record<string, unknown>;
    return {
      status: typeof rec.status === "number" ? rec.status : typeof rec.statusCode === "number" ? rec.statusCode : undefined,
      code: typeof rec.code === "string" ? rec.code : typeof rec.error === "string" ? rec.error : undefined,
      name: typeof rec.name === "string" ? rec.name : undefined,
      message: typeof rec.message === "string" ? rec.message : typeof rec.error_description === "string" ? rec.error_description : undefined,
      retryAfter: typeof rec.retryAfter === "string" || typeof rec.retryAfter === "number" ? rec.retryAfter : null,
    };
  }
  return {};
}

function normalizedSignalText(shape: OAuthRetryFailureShape): string {
  return `${shape.code ?? ""} ${shape.name ?? ""} ${shape.message ?? ""}`.toLowerCase();
}

function isNetworkLikeErrorText(lowerText: string): boolean {
  return /(?:failed to fetch|networkerror|network error|fetch failed|econnreset|econnrefused|etimedout|timeout|socket hang up|offline)/u.test(
    lowerText,
  );
}

function makeClassification(
  code: string,
  provider: OAuthProvider,
  category: OAuthErrorCategory,
  recommendedAction: OAuthRecommendedAction,
  titleKo: string,
  messageKo: string,
  actionLabelKo: string,
  flags: { readonly retryable?: boolean; readonly requiresReauthentication?: boolean } = {},
): OAuthRecoveryClassification {
  return {
    code,
    provider,
    category,
    retryable: flags.retryable ?? false,
    requiresReauthentication: flags.requiresReauthentication ?? false,
    recommendedAction,
    titleKo,
    messageKo,
    actionLabelKo,
  };
}

/** 카카오·구글·표준 OAuth 및 HTTP/네트워크 오류를 사용자 친화적 한글 안내로 분류한다. */
export function classifyOAuthRecoveryError(
  error: unknown,
  provider: OAuthProvider = "generic",
): OAuthRecoveryClassification {
  const shape = extractFailureShape(error);
  const text = normalizedSignalText(shape);
  const status = shape.status;
  const label = provider === "kakao" ? "카카오" : provider === "google" ? "Google" : "소셜";

  if (text.includes("state_mismatch") || text.includes("bad_state") || text.includes("missing_state")) {
    return makeClassification(
      text.includes("missing_state") ? "missing_state" : "state_mismatch", provider, "security", "relogin",
      "로그인 보안 확인이 일치하지 않습니다",
      "다른 탭에서 로그인을 새로 시작했거나 요청이 만료되었습니다. 처음부터 다시 로그인해 주세요.",
      `${label} 다시 로그인`, { requiresReauthentication: true },
    );
  }
  if (text.includes("state_expired")) {
    return makeClassification(
      "state_expired", provider, "security", "relogin", "로그인 유효 시간이 지났습니다",
      "보안을 위해 로그인 요청은 10분 동안만 유지됩니다. 로그인 버튼을 다시 눌러 주세요.",
      `${label} 다시 로그인`, { requiresReauthentication: true },
    );
  }
  if (text.includes("pkce")) {
    return makeClassification(
      text.includes("missing") ? "pkce_missing_verifier" : "pkce_mismatch", provider, "security", "relogin",
      "보안 검증 코드(PKCE)를 확인하지 못했습니다",
      "브라우저 저장소가 초기화되었거나 잘못된 경로로 돌아왔습니다. 로그인을 처음부터 다시 진행해 주세요.",
      `${label} 다시 로그인`, { requiresReauthentication: true },
    );
  }
  if (text.includes("disallowed_useragent") || text.includes("in_app_webview_disallowed")) {
    return makeClassification(
      "in_app_webview_disallowed", provider, "popup", "open-external-browser",
      "앱 내 브라우저에서는 로그인할 수 없습니다",
      `${label} 보안 정책상 인앱 브라우저 로그인이 제한됩니다. 기본 브라우저(Safari·Chrome)에서 열어 주세요.`,
      "기본 브라우저에서 열기",
    );
  }
  if (text.includes("popup_blocked") || text.includes("coop_blocked")) {
    return makeClassification(
      text.includes("coop_blocked") ? "coop_blocked" : "popup_blocked", provider, "popup", "redirect-fallback",
      "로그인 팝업 창이 차단되었습니다",
      "팝업을 열지 못해 현재 화면에서 바로 이동하는 로그인 방식으로 전환합니다.", "현재 창에서 로그인",
    );
  }
  if (text.includes("access_denied") || text.includes("popup_closed_by_user") || text.includes("user_cancelled")) {
    return makeClassification(
      "user_cancelled", provider, "user-cancelled", "dismiss", "로그인이 취소되었습니다",
      `${label} 로그인 동의가 완료되지 않았습니다. 원하실 때 다시 시도해 주세요.`, "다시 로그인",
    );
  }
  if (text.includes("koe205")) {
    return makeClassification(
      "koe205", "kakao", "configuration", "contact-support", "카카오 동의 항목 설정을 확인해야 합니다",
      "카카오 앱에 아직 활성화되지 않은 동의 항목이 요청되었습니다. 기본 프로필 로그인으로 전환하거나 관리자에게 알려 주세요.",
      "다른 방식으로 로그인",
    );
  }
  if (text.includes("koe006") || text.includes("koe101") || text.includes("koe303")) {
    const code = text.includes("koe006") ? "koe006" : text.includes("koe101") ? "koe101" : "koe303";
    return makeClassification(
      code, "kakao", "configuration", "contact-support", "카카오 로그인 연결 설정에 문제가 있습니다",
      "Redirect URI 또는 앱 키 설정이 일치하지 않아 카카오 인증을 완료하지 못했습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요.",
      "돌아가기",
    );
  }
  if (status === 409 || text.includes("account_link_required")) {
    return makeClassification(
      "account_link_required", provider, "account-conflict", "link-existing-account",
      "같은 이메일의 기존 계정이 있습니다",
      "계정 보호를 위해 자동 병합하지 않습니다. 기존 계정으로 먼저 로그인한 뒤 설정에서 소셜 계정을 연결해 주세요.",
      "기존 계정으로 로그인",
    );
  }
  if (text.includes("email_unverified")) {
    return makeClassification(
      "email_unverified", provider, "security", "dismiss", "인증된 이메일이 필요합니다",
      `${label} 계정에서 이메일 인증을 마친 뒤 다시 로그인해 주세요.`, "확인",
    );
  }
  if (status === 401 || status === 403 || TERMINAL_AUTH_CODES.some((code) => text.includes(code))) {
    const code = text.includes("koe320") ? "koe320" : text.includes("invalid_grant") ? "invalid_grant" : "session_expired";
    return makeClassification(
      code, provider, "token", "relogin", "인증 세션이 만료되었습니다",
      "인증 토큰을 더 이상 갱신할 수 없습니다. 안전하게 다시 로그인해 주세요.", "다시 로그인",
      { requiresReauthentication: true },
    );
  }
  if (status === 429) {
    return makeClassification(
      "rate_limited", provider, "network", "retry", "로그인 요청이 잠시 몰렸습니다",
      "짧은 대기 후 자동으로 다시 시도하거나 몇 초 뒤에 눌러 주세요.", "잠시 후 다시 시도",
      { retryable: true },
    );
  }
  if ((status !== undefined && status >= 500 && status <= 599) || status === 408 || isNetworkLikeErrorText(text)) {
    return makeClassification(
      status !== undefined && status >= 500 ? `http_${status}` : "transient_network_error", provider, "network", "retry",
      "인증 서버 연결이 일시적으로 불안정합니다",
      "네트워크나 외부 인증 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.", "다시 시도",
      { retryable: true },
    );
  }
  return makeClassification(
    shape.code?.trim().toLowerCase() || "oauth_unknown_error", provider, "network", "relogin",
    `${label} 로그인을 완료하지 못했습니다`,
    "일시적인 오류로 인증이 중단되었습니다. 다시 로그인을 시도해 주세요.", "다시 시도",
  );
}

/** OAuth 콜백에서 PKCE / state 일치 여부, 만료, 중복 콜백(기존 세션 존재)을 검증한다. */
export function validateOAuthCallbackSecurity(
  input: OAuthCallbackSecurityInput,
): OAuthCallbackSecurityResult {
  const provider = input.provider ?? "generic";
  const nowMs = input.nowMs ?? Date.now();
  const stateTtlMs = clampNonNegativeFinite(input.stateTtlMs, DEFAULT_OAUTH_STATE_TTL_MS);

  const fail = (
    failureCode: OAuthCallbackFailureCode,
    shouldClearStateCookie: boolean,
    classification: OAuthRecoveryClassification,
    recoverable = false,
  ): OAuthCallbackSecurityResult => ({
    ok: false,
    failureCode,
    recoverable,
    recommendedAction: classification.recommendedAction,
    shouldClearStateCookie,
    classification,
  });

  if (input.providerError && input.providerError.trim().length > 0) {
    const rawCode = input.providerError.trim();
    const classification = classifyOAuthRecoveryError(
      { code: rawCode, message: input.providerErrorDescription ?? rawCode },
      provider,
    );
    return fail(rawCode.toLowerCase() === "access_denied" ? "user_cancelled" : "provider_error", true, classification);
  }

  const receivedState = input.receivedState?.trim() ?? "";
  const expectedState = input.expectedState?.trim() ?? "";

  if (!receivedState || !expectedState) {
    if (input.hasExistingAuthenticatedSession) {
      return fail(
        "duplicate_callback",
        false,
        makeClassification(
          "duplicate_callback",
          provider,
          "security",
          "reuse-existing-session",
          "이미 로그인이 완료되었습니다",
          "중복된 로그인 응답을 감지해 기존 인증 세션을 그대로 유지합니다.",
          "계속하기",
        ),
        true,
      );
    }
    return fail("missing_state", false, classifyOAuthRecoveryError({ code: "missing_state" }, provider));
  }

  if (!constantTimeStringEqual(receivedState, expectedState)) {
    // stale 탭이 새 탭의 정상 state 쿠키를 지우지 않도록 불일치 시 쿠키는 삭제하지 않는다.
    return fail("state_mismatch", false, classifyOAuthRecoveryError({ code: "state_mismatch" }, provider));
  }

  if (typeof input.issuedAtMs === "number" && Number.isFinite(input.issuedAtMs) && nowMs - input.issuedAtMs > stateTtlMs) {
    return fail("state_expired", true, classifyOAuthRecoveryError({ code: "state_expired" }, provider));
  }

  const shouldCheckPkce =
    input.requirePkce === true || Boolean(input.expectedCodeChallenge) || Boolean(input.codeVerifier);
  if (shouldCheckPkce) {
    const verifier = input.codeVerifier?.trim() ?? "";
    if (!verifier) {
      return fail("pkce_missing_verifier", true, classifyOAuthRecoveryError({ code: "pkce_missing_verifier" }, provider));
    }
    if (!isValidPkceCodeVerifier(verifier)) {
      return fail("pkce_invalid_verifier", true, classifyOAuthRecoveryError({ code: "pkce_invalid_verifier" }, provider));
    }
    if (input.expectedCodeChallenge) {
      const actualChallenge = (input.codeChallengeMethod ?? "S256") === "plain" ? verifier : input.computedCodeChallenge ?? "";
      if (!actualChallenge || !constantTimeStringEqual(actualChallenge, input.expectedCodeChallenge)) {
        return fail("pkce_mismatch", true, classifyOAuthRecoveryError({ code: "pkce_mismatch" }, provider));
      }
    }
  }

  return {
    ok: true,
    failureCode: null,
    recoverable: true,
    recommendedAction: "dismiss",
    shouldClearStateCookie: true,
    classification: null,
  };
}

/** 팝업 차단·COOP 격리·인앱 웹뷰·독립 PWA 환경을 감지해 리다이렉트 폴백 여부를 결정한다. */
export function resolveOAuthPopupFallback(input: OAuthPopupFallbackInput): OAuthPopupFallbackDecision {
  const provider = input.provider ?? "generic";
  const redirectUrl = input.redirectAuthorizeUrl?.trim() || null;
  const errorText = normalizedSignalText(extractFailureShape(input.popupError));

  if (provider === "google" && (isRestrictedInAppBrowserUserAgent(input.userAgent) || errorText.includes("disallowed_useragent"))) {
    return {
      shouldFallbackToRedirect: true,
      strategy: "external-browser-handoff",
      reasonCode: "in_app_webview_disallowed",
      redirectUrl,
      messageKo: "인앱 브라우저에서는 Google 보안 정책으로 팝업 로그인이 차단됩니다. 기본 브라우저(Chrome·Safari)에서 열어 로그인해 주세요.",
    };
  }
  if (errorText.includes("popup_closed_by_user") || errorText.includes("access_denied") || errorText.includes("user_cancelled")) {
    return {
      shouldFallbackToRedirect: false,
      strategy: "popup",
      reasonCode: "user_cancelled",
      redirectUrl,
      messageKo: "사용자가 로그인 창을 닫았습니다. 원하실 때 다시 시도해 주세요.",
    };
  }
  if (input.isStandalonePwa) {
    return {
      shouldFallbackToRedirect: true,
      strategy: "redirect",
      reasonCode: "standalone_pwa_redirect",
      redirectUrl,
      messageKo: "설치된 웹 앱(PWA) 환경에서는 안정적인 로그인을 위해 같은 창 리다이렉트로 이동합니다.",
    };
  }
  if (errorText.includes("cross-origin-opener-policy") || errorText.includes("coop")) {
    return {
      shouldFallbackToRedirect: true,
      strategy: "redirect",
      reasonCode: "coop_blocked",
      redirectUrl,
      messageKo: "브라우저 창 보안 정책으로 팝업 통신이 막혀 현재 창 로그인으로 전환합니다.",
    };
  }
  const popupBlocked =
    input.popupWindow === null ||
    (input.popupWindow !== undefined && input.popupWindow.closed === true) ||
    errorText.includes("popup_blocked") ||
    errorText.includes("blocked");
  if (popupBlocked) {
    return {
      shouldFallbackToRedirect: true,
      strategy: "redirect",
      reasonCode: "popup_blocked",
      redirectUrl,
      messageKo: "브라우저가 팝업을 차단했습니다. 현재 창에서 바로 로그인 페이지로 이동합니다.",
    };
  }
  return {
    shouldFallbackToRedirect: false,
    strategy: "popup",
    reasonCode: "popup_ready",
    redirectUrl,
    messageKo: "팝업 로그인 창이 정상적으로 열렸습니다.",
  };
}

/** HTTP `Retry-After` 헤더(초 또는 HTTP 날짜)를 밀리초로 해석한다. */
export function parseRetryAfterMs(retryAfter: string | number | null | undefined, nowMs = Date.now()): number | null {
  if (typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.round(retryAfter * 1000);
  }
  if (typeof retryAfter !== "string") return null;
  const trimmed = retryAfter.trim();
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?$/u.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
  }
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - nowMs) : null;
}

/** 일시적 5xx·429·408·네트워크 오류인지 판정한다(4xx 인증/권한/CSRF 오류는 즉시 실패). */
export function isRetryableOAuthFailure(error: unknown): boolean {
  const shape = extractFailureShape(error);
  if (shape.name === "AbortError") return false;
  const text = normalizedSignalText(shape);
  if (/(?:invalid_grant|access_denied|state_mismatch|pkce|account_link_required)/u.test(text)) {
    return false;
  }
  return shape.status !== undefined ? RETRYABLE_HTTP_STATUSES.has(shape.status) : isNetworkLikeErrorText(text);
}

/** 지수 백오프 + 바운디드 지터 대기 시간(ms)을 계산한다. */
export function computeOAuthRetryDelayMs(
  attempt: number,
  options: {
    readonly baseDelayMs?: number;
    readonly maxDelayMs?: number;
    readonly jitterRatio?: number;
    readonly retryAfterMs?: number | null;
    readonly random?: () => number;
  } = {},
): number {
  const baseDelayMs = clampNonNegativeFinite(options.baseDelayMs, 300);
  const maxDelayMs = Math.max(baseDelayMs, clampNonNegativeFinite(options.maxDelayMs, 8_000));
  const jitterRatio = Math.min(1, Math.max(0, clampNonNegativeFinite(options.jitterRatio, 0.25)));
  if (typeof options.retryAfterMs === "number" && Number.isFinite(options.retryAfterMs) && options.retryAfterMs >= 0) {
    return Math.min(maxDelayMs, Math.round(options.retryAfterMs));
  }
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, Math.max(0, Math.floor(attempt))));
  const sample = Math.min(1, Math.max(0, (options.random ?? Math.random)()));
  const minDelay = exponential * (1 - jitterRatio);
  return Math.round(minDelay + (exponential - minDelay) * sample);
}

function defaultAbortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 일시적 5xx·429·네트워크 오류에 대해 지수 백오프 재시도를 수행한다. */
export async function executeWithOAuthBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: OAuthBackoffOptions = {},
): Promise<OAuthBackoffResult<T>> {
  const maxRetries = Math.max(0, Math.floor(options.maxRetries ?? 3));
  const sleep = options.sleep ?? defaultAbortableSleep;
  const checkRetryable = options.isRetryable ?? isRetryableOAuthFailure;
  let totalWaitMs = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const value = await operation(attempt);
      return { value, attempts: attempt + 1, totalWaitMs };
    } catch (error) {
      if (attempt >= maxRetries || !checkRetryable(error)) throw error;
      const delayMs = computeOAuthRetryDelayMs(attempt, {
        baseDelayMs: options.baseDelayMs,
        maxDelayMs: options.maxDelayMs,
        jitterRatio: options.jitterRatio,
        retryAfterMs: parseRetryAfterMs(extractFailureShape(error).retryAfter),
        random: options.random,
      });
      options.onRetry?.({ attempt: attempt + 1, delayMs, error });
      totalWaitMs += delayMs;
      await sleep(delayMs, options.signal);
    }
  }
  throw new Error("unreachable");
}

function defaultIsUnauthorizedError(error: unknown): boolean {
  const shape = extractFailureShape(error);
  if (shape.status === 401) return true;
  const text = normalizedSignalText(shape);
  return text.includes("unauthorized") || text.includes("token_expired");
}

function defaultIsTerminalRefreshError(error: unknown): boolean {
  const shape = extractFailureShape(error);
  if (shape.status === 400 || shape.status === 401 || shape.status === 403) return true;
  const text = normalizedSignalText(shape);
  return TERMINAL_AUTH_CODES.some((code) => text.includes(code));
}

/**
 * 동시 401 발생 시 단일 flight 토큰 갱신 큐를 생성한다.
 * - 동시 401 다발 시 실제 `refresh()`는 1회만 실행하고 결과를 공유한다.
 * - 직전 성공 직후 짧은 병합 창(`dedupeWindowMs`)의 구 토큰 401도 새 토큰을 재사용한다.
 * - `invalid_grant` / 401 / 연속 실패 상한 도달 시 `OAuthReauthRequiredError`로 무한 루프를 차단한다.
 */
export function createSingleFlightTokenRefresher<TToken>(
  options: SingleFlightTokenRefresherOptions<TToken>,
): SingleFlightTokenRefresher<TToken> {
  const dedupeWindowMs = clampNonNegativeFinite(options.dedupeWindowMs, 1_500);
  const maxConsecutiveFailures = Math.max(1, Math.floor(options.maxConsecutiveFailures ?? 3));
  const now = options.now ?? (() => Date.now());
  const isTerminal = options.isTerminalAuthError ?? defaultIsTerminalRefreshError;

  let inFlightPromise: Promise<TToken> | null = null;
  let activeFlightId = 0;
  let lastSucceededToken: { readonly value: TToken; readonly atMs: number } | null = null;
  let totalRequests = 0;
  let executedRefreshes = 0;
  let coalescedRequests = 0;
  let failedRefreshes = 0;
  let consecutiveFailures = 0;
  let reauthRequired = false;

  const refresh = async (requestOptions: SingleFlightTokenRefreshRequestOptions = {}): Promise<TToken> => {
    totalRequests += 1;

    if (reauthRequired && !requestOptions.force) {
      throw new OAuthReauthRequiredError(classifyOAuthRecoveryError({ code: "invalid_grant" }));
    }
    if (inFlightPromise) {
      coalescedRequests += 1;
      return inFlightPromise;
    }
    if (
      !requestOptions.force &&
      dedupeWindowMs > 0 &&
      lastSucceededToken !== null &&
      now() - lastSucceededToken.atMs <= dedupeWindowMs
    ) {
      coalescedRequests += 1;
      return lastSucceededToken.value;
    }

    executedRefreshes += 1;
    const flightId = ++activeFlightId;
    const flight = (async () => {
      try {
        const token = await options.refresh();
        lastSucceededToken = { value: token, atMs: now() };
        consecutiveFailures = 0;
        reauthRequired = false;
        return token;
      } catch (error) {
        failedRefreshes += 1;
        consecutiveFailures += 1;
        lastSucceededToken = null;
        if (isTerminal(error) || consecutiveFailures >= maxConsecutiveFailures) {
          reauthRequired = true;
          const classification = classifyOAuthRecoveryError(error);
          const reauthError = new OAuthReauthRequiredError(
            { ...classification, requiresReauthentication: true, recommendedAction: "relogin" },
            error,
          );
          options.onReauthRequired?.(reauthError.classification, error);
          throw reauthError;
        }
        throw error;
      } finally {
        if (activeFlightId === flightId) {
          inFlightPromise = null;
        }
      }
    })();

    inFlightPromise = flight;
    return flight;
  };

  const executeWithAuthRetry = async <TResult>(
    retryOptions: SingleFlightAuthRetryOptions<TResult, TToken>,
  ): Promise<TResult> => {
    const isUnauthorized = retryOptions.isUnauthorized ?? defaultIsUnauthorizedError;
    try {
      return await retryOptions.request();
    } catch (firstError) {
      if (!isUnauthorized(firstError)) throw firstError;
      const token = await refresh({ reason: retryOptions.reason ?? "http-401" });
      return retryOptions.request(token);
    }
  };

  return {
    refresh,
    executeWithAuthRetry,
    getStats: (): SingleFlightTokenRefresherStats => ({
      totalRequests,
      executedRefreshes,
      coalescedRequests,
      failedRefreshes,
      consecutiveFailures,
      reauthRequired,
      inFlight: inFlightPromise !== null,
    }),
    reset(): void {
      activeFlightId += 1;
      inFlightPromise = null;
      lastSucceededToken = null;
      totalRequests = 0;
      executedRefreshes = 0;
      coalescedRequests = 0;
      failedRefreshes = 0;
      consecutiveFailures = 0;
      reauthRequired = false;
    },
  };
}
