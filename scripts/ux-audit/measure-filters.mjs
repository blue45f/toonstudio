/**
 * 콘솔 메시지·네트워크 이벤트 분류(순수 함수).
 *
 * 점수에는 사용자에게 실제로 닿는 오류만 센다. 측정 환경 때문에 생기는 항목은 점수에서 빼되 개수와 표본을 보고서에 남긴다.
 * - 취소된 요청(ERR_ABORTED): 화면이 스스로 취소한 요청이라 실패가 아니다.
 * - 외부 origin 요청 실패: 샌드박스는 외부 네트워크가 없어 폰트·CDN 요청이 실패한다. 앱 결함이 아니다.
 * - sparse 체크아웃 누락 자산: git 이 추적하지만 작업트리에 내려받지 않은 public 파일의 404 다.
 * - 개발 서버 한정 경고: React StrictMode 이중 마운트가 만드는 경고. 운영 빌드에는 없다.
 * - "Failed to load resource": 같은 사건을 네트워크 이벤트로 이미 세므로 콘솔 오류에서는 뺀다(이중 감점 방지).
 */

/** 개발 서버(StrictMode 이중 마운트)에서만 나는 것으로 확인된 경고의 시작 문자열. */
export const DEV_ONLY_CONSOLE_PATTERNS = Object.freeze([
  /^\[LEASE_BUSY\]/u,
]);

const NETWORK_ECHO = /^Failed to load resource/u;

/**
 * @param {{ type: string, text: string }} message Playwright 콘솔 메시지(type: error | warning | pageerror ...)
 * @param {{ devServer: boolean }} context
 * @returns {"error" | "warning" | "network-echo" | "dev-only" | "ignored"}
 */
export function classifyConsoleMessage(message, context) {
  if (message.type === "pageerror") return "error";
  if (message.type === "error") return NETWORK_ECHO.test(message.text) ? "network-echo" : "error";
  if (message.type === "warning" || message.type === "warn") {
    if (context.devServer && DEV_ONLY_CONSOLE_PATTERNS.some((pattern) => pattern.test(message.text))) return "dev-only";
    return "warning";
  }
  return "ignored";
}

function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** 보고용으로 origin 을 떼고 경로와 짧은 쿼리만 남긴다. */
export function shortenUrl(url, limit = 120) {
  const parsed = parseUrl(url);
  if (!parsed) return url.slice(0, limit);
  const text = `${parsed.pathname}${parsed.search}`;
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/**
 * HTTP 응답 분류.
 * @param {{ status: number, url: string }} response
 * @param {{ origin: string, isSparseMissing: (pathname: string) => boolean }} context
 * @returns {"ok" | "failure" | "external" | "environment-missing"}
 */
export function classifyResponse(response, context) {
  if (response.status < 400) return "ok";
  const parsed = parseUrl(response.url);
  if (!parsed) return "failure";
  if (parsed.origin !== context.origin) return "external";
  if (response.status === 404 && context.isSparseMissing(parsed.pathname)) return "environment-missing";
  return "failure";
}

/**
 * 네트워크 수준 실패 분류.
 * @param {{ url: string, errorText: string }} failure
 * @param {{ origin: string }} context
 * @returns {"aborted" | "failure" | "external"}
 */
export function classifyRequestFailure(failure, context) {
  if (/ERR_ABORTED|NS_BINDING_ABORTED|cancel/iu.test(failure.errorText)) return "aborted";
  const parsed = parseUrl(failure.url);
  if (parsed && parsed.origin !== context.origin) return "external";
  return "failure";
}

/**
 * 한 화면의 성능 사실을 점수 입력 형식으로 정리한다.
 * @param {{
 *   console: ReadonlyArray<{ type: string, text: string }>,
 *   responses: ReadonlyArray<{ status: number, url: string, method?: string }>,
 *   failures: ReadonlyArray<{ url: string, errorText: string, method?: string }>,
 *   metrics: { cls: number | null, lcpMs: number | null, interactiveMs: number | null, longTaskMs?: number | null } | null,
 *   routeState: string | null,
 * }} input
 * @param {{ origin: string, devServer: boolean, isSparseMissing: (pathname: string) => boolean }} context
 */
export function buildPerformanceFacts(input, context) {
  const counts = { error: 0, warning: 0, networkEcho: 0, devOnly: 0 };
  const errorSamples = [];
  const warningSamples = [];
  for (const message of input.console) {
    const kind = classifyConsoleMessage(message, context);
    if (kind === "error") {
      counts.error += 1;
      if (errorSamples.length < 8) errorSamples.push(message.text.slice(0, 200));
    } else if (kind === "warning") {
      counts.warning += 1;
      if (warningSamples.length < 8) warningSamples.push(message.text.slice(0, 200));
    } else if (kind === "network-echo") counts.networkEcho += 1;
    else if (kind === "dev-only") counts.devOnly += 1;
  }
  const failed = [];
  const ignored = { external: 0, environmentMissing: 0, aborted: 0 };
  const seen = new Set();
  for (const response of input.responses) {
    const kind = classifyResponse(response, context);
    const key = `${response.method ?? "GET"} ${shortenUrl(response.url)} ${response.status}`;
    if (kind === "failure") {
      if (!seen.has(key)) {
        seen.add(key);
        failed.push({ method: response.method ?? "GET", url: shortenUrl(response.url), status: response.status });
      }
    } else if (kind === "external") ignored.external += 1;
    else if (kind === "environment-missing") ignored.environmentMissing += 1;
  }
  for (const failure of input.failures) {
    const kind = classifyRequestFailure(failure, context);
    const key = `${failure.method ?? "GET"} ${shortenUrl(failure.url)} ${failure.errorText}`;
    if (kind === "aborted") ignored.aborted += 1;
    else if (kind === "external") ignored.external += 1;
    else if (!seen.has(key)) {
      seen.add(key);
      failed.push({ method: failure.method ?? "GET", url: shortenUrl(failure.url), status: failure.errorText });
    }
  }
  return {
    measured: input.metrics !== null,
    consoleErrors: counts.error,
    consoleWarnings: counts.warning,
    failedRequests: failed.length,
    cls: input.metrics?.cls ?? null,
    lcpMs: input.metrics?.lcpMs ?? null,
    interactiveMs: input.metrics?.interactiveMs ?? null,
    longTaskMs: input.metrics?.longTaskMs ?? null,
    routeState: input.routeState,
    details: {
      errorSamples,
      warningSamples,
      failedSamples: failed.slice(0, 12),
      ignored: {
        networkEchoConsoleErrors: counts.networkEcho,
        devOnlyConsoleWarnings: counts.devOnly,
        externalOriginFailures: ignored.external,
        sparseMissingAssets: ignored.environmentMissing,
        abortedRequests: ignored.aborted,
      },
    },
  };
}
