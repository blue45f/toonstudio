const MODULE_ERROR = /failed to load module script|failed to fetch dynamically imported module|importing a module script failed|chunkloaderror|loading chunk .+ failed|(?:text\/html|application\/xhtml\+xml).*(?:mime|javascript|module)|(?:mime|javascript|module).*(?:text\/html|application\/xhtml\+xml)/iu;
const HTML_MIME = /^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/iu;
const LOADING_TEXT = /^(?:(?:불러오는 중|로딩 중|loading|잠시만 기다(?:려 주세요)?)[.\s…]*)+$/iu;
const DIAGNOSTIC_KEYS = ["pageErrors", "consoleErrors", "scriptResponses", "requestFailures"];

export function snapshotQaDiagnostics(current = {}, offsets = {}) {
  return Object.fromEntries(DIAGNOSTIC_KEYS.map((key) => [key, (current[key] ?? []).slice(offsets[key] ?? 0)]));
}

// 응답 본문을 내려받지 않고 JavaScript 요청의 잘못된 배포 응답을 보존한다.
export function recordQaScriptResponse(response, responses) {
  const request = response.request();
  if (request.resourceType() !== "script") return;
  responses.push({
    url: response.url(),
    status: response.status(),
    contentType: response.headers()["content-type"] ?? "",
    fromServiceWorker: response.fromServiceWorker(),
  });
}

export function qaModuleFailures({ consoleErrors = [], scriptResponses = [] } = {}) {
  const failures = consoleErrors.filter((error) => MODULE_ERROR.test(error));
  for (const response of scriptResponses) {
    // 리다이렉트의 중간 HTML 본문은 JavaScript로 실행되지 않는다. 최종 응답은 따로 검사한다.
    if (response.status >= 300 && response.status < 400) continue;
    if (response.status >= 400 || HTML_MIME.test(response.contentType)) {
      failures.push(`JavaScript response: HTTP ${response.status}, ${response.contentType || "unknown MIME"}, ${response.url}`);
    }
  }
  return [...new Set(failures)];
}

export function classifyQaPageState({ dom, ready = dom?.ready, pageErrors = [], ...diagnostics }) {
  if (pageErrors.length > 0 || qaModuleFailures(diagnostics).length > 0) return "runtime-error";
  if (!dom || dom.inspectError) return "inspection-error";
  const empty = dom.bodyTextLength === 0 && (dom.visualCount ?? dom.visualSurfaceCount) === 0;
  const loadingTextOnly = LOADING_TEXT.test(dom.bodyPreview?.trim() ?? "");
  if (dom.routeLoading) return "loading";
  if (dom.loadingLike && (empty || dom.loadingOnly || loadingTextOnly)) return "loading";
  if (empty) return "blank";
  return ready ? "ready" : "not-ready";
}

// DOM과 오류를 같은 측정 시점에 묶는다. 검사 예외를 빈 화면 수치로 바꾸지 않는다.
export async function settleQaPage({
  inspect,
  diagnostics = () => ({}),
  timeoutMs = 8_000,
  intervalMs = 200,
  now = Date.now,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error("QA 대기 시간은 0 이상의 timeout과 양수 interval이어야 합니다.");
  }
  const started = now();
  let attempts = 0;
  let lastDom = null;
  const measurement = (dom, inspectError = null, inspectionTimedOut = false) => {
    const observed = snapshotQaDiagnostics(diagnostics());
    const state = inspectError ? "inspection-error" : classifyQaPageState({ dom, ...observed });
    const elapsedMs = now() - started;
    const timedOut = inspectionTimedOut || elapsedMs >= timeoutMs;
    return {
      state: state === "loading" && timedOut ? "loading-timeout" : state,
      ready: dom?.ready === true,
      dom,
      inspectError,
      diagnostics: observed,
      attempts,
      elapsedMs,
      timedOut,
    };
  };
  while (true) {
    // 예산이 끝나면 정상적으로 읽은 마지막 DOM을 사용한다. 0ms짜리 검사를 새로 시작하지 않는다.
    if (attempts > 0 && now() - started >= timeoutMs) return measurement(lastDom);
    attempts += 1;
    let dom = null;
    let inspectError = null;
    let inspectionTimer;
    let inspectionTimedOut = false;
    try {
      const remainingMs = Math.max(0, timeoutMs - (now() - started));
      dom = await Promise.race([
        Promise.resolve().then(inspect),
        new Promise((_resolve, reject) => {
          inspectionTimer = setTimer(() => {
            inspectionTimedOut = true;
            reject(new Error(`DOM 검사 제한 시간 ${timeoutMs}ms 초과`));
          }, remainingMs);
        }),
      ]);
    } catch (error) {
      inspectError = String(error?.stack ?? error).slice(0, 2_000);
    } finally {
      if (inspectionTimer !== undefined) clearTimer(inspectionTimer);
    }
    lastDom = dom;
    const result = measurement(dom, inspectError, inspectionTimedOut);
    if (["ready", "runtime-error", "inspection-error"].includes(result.state) || result.timedOut) return result;
    if (timeoutMs - result.elapsedMs <= intervalMs) {
      // 마지막 poll 간격은 종료 대기다. 타이머가 조금 일찍 깨어나도 새 DOM 검사를 예약하지 않는다.
      while (now() - started < timeoutMs) await wait(timeoutMs - (now() - started));
      return measurement(lastDom);
    }
    await wait(intervalMs);
  }
}
