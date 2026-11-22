#!/usr/bin/env node
/**
 * 운영 배포 직후 자동 스모크 검증 + 안전한 원클릭 롤백 안내 가드.
 *
 * 검증 항목:
 * 1) Core API 원점(`/api/health/live`, `/api/health/ready`) HTTP 200 및 JSON 상태 계약
 * 2) 핵심 SPA 경로(`/`, `/studio`, `/production`, `/studio/character`) HTTP 200
 * 3) Studio 교차 출처 격리 경로(`/studio`, `/studio/character`)의 COOP/COEP 헤더
 *    (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: credentialless|require-corp`)
 *
 * 1건이라도 실패하면 종료 코드 1과 함께 즉시 실행 가능한 안전한 복구 명령만 출력한다.
 * (비밀값 출력 금지 · DB 비밀번호 회전이나 환경 전체 교체를 일으키는 명령은 출력하지 않음)
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ONPOD_CANONICAL_APP, ONPOD_CANONICAL_ORIGIN, redactSensitiveText } from "./lib/deploy-auth-env.mjs";

const MODULE_PATH = realpathSync(fileURLToPath(import.meta.url));

export const DEFAULT_WEB_URL = "https://www.toonstudio.cloud";
export const DEFAULT_API_URL = ONPOD_CANONICAL_ORIGIN;
export const DEFAULT_WORKER_NAME = "toonspectrum-web";
export const DEFAULT_ONPOD_APP_NAME = ONPOD_CANONICAL_APP;
export const DEFAULT_API_IMAGE_REPO = "ghcr.io/blue45f/toonspectrum-core-api";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAXIMUM_JSON_BYTES = 65_536;
const RETRYABLE_HTTP_STATUSES = new Set([502, 503, 504]);
const RETIRED_HOST_SUFFIXES = Object.freeze(["onrender.com", "vercel.app", "neon.tech"]);
const PRE_CUTOVER_WORKER_PREFIX = "70517470";
const WORKER_VERSION_PATTERN = /^[0-9a-f][0-9a-f-]{7,63}(?:@(?:100|[1-9]\d?))?$/iu;
const SHA40_PATTERN = /^[0-9a-f]{40}$/u;
const ACCEPTED_COEP_VALUES = new Set(["credentialless", "require-corp"]);
const FORBIDDEN_ROLLBACK_PATTERN = /(?:\bonpod\s+app\s+rollback\b|--attach-db\b|--env(?:-file)?\b)/iu;

export const CORE_API_HEALTH_CHECKS = Object.freeze([
  Object.freeze({ path: "/api/health/live", expectedStatus: "ok" }),
  Object.freeze({ path: "/api/health/ready", expectedStatus: "ready" }),
]);

/**
 * apps/web/public/_headers 및 studio-cross-origin-isolation.ts 계약에 따라
 * Studio 경로(`/studio`, `/studio/*`)에 COOP/COEP 교차 출처 격리 헤더를 필수로 요구한다.
 */
export const CORE_SPA_ROUTES = Object.freeze([
  Object.freeze({ path: "/", requireCoopCoep: false }),
  Object.freeze({ path: "/studio", requireCoopCoep: true }),
  Object.freeze({ path: "/production", requireCoopCoep: false }),
  Object.freeze({ path: "/studio/character", requireCoopCoep: true }),
]);

export class SmokeUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "SmokeUsageError";
  }
}

export function validateHttpsOrigin(raw, label) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new SmokeUsageError(`${label} 값이 비어 있습니다. HTTPS 원점 주소를 지정하세요.`);
  }
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new SmokeUsageError(`${label} 값이 유효한 URL 형식이 아닙니다.`);
  }
  if (
    parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== ""
    || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== ""
  ) {
    throw new SmokeUsageError(
      `${label}은 자격증명·경로·쿼리·해시가 없는 HTTPS 원점(예: https://www.toonstudio.cloud)이어야 합니다.`,
    );
  }
  const hostname = parsed.hostname.toLowerCase();
  if (RETIRED_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
    throw new SmokeUsageError(`${label}에 퇴역 호스트(${hostname})를 지정할 수 없습니다.`);
  }
  return parsed.origin;
}

export function validatePreviousWorkerVersion(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") throw new SmokeUsageError("--prev-worker-version 값이 문자열이 아닙니다.");
  const trimmed = raw.trim();
  if (!WORKER_VERSION_PATTERN.test(trimmed)) {
    throw new SmokeUsageError("--prev-worker-version은 유효한 Cloudflare Worker 버전 ID(선택적 @100 포함)여야 합니다.");
  }
  if (trimmed.toLowerCase().startsWith(PRE_CUTOVER_WORKER_PREFIX)) {
    throw new SmokeUsageError("--prev-worker-version에 컷오버 이전(Render 가리킴) 버전은 롤백 대상으로 지정할 수 없습니다.");
  }
  return trimmed;
}

export function validatePreviousApiSha(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") throw new SmokeUsageError("--prev-api-sha 값이 문자열이 아닙니다.");
  const trimmed = raw.trim();
  if (!SHA40_PATTERN.test(trimmed)) {
    throw new SmokeUsageError("--prev-api-sha는 소문자 40자리 16진수 Git SHA여야 합니다.");
  }
  return trimmed;
}

function parseIntegerOption(raw, label, min, max) {
  const text = String(raw ?? "").trim();
  const parsed = /^\d+$/u.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new SmokeUsageError(`${label}은 ${min}~${max} 범위의 정수여야 합니다.`);
  }
  return parsed;
}

export function parsePostDeploySmokeArgs(argv) {
  const options = {
    webUrl: DEFAULT_WEB_URL,
    apiUrl: DEFAULT_API_URL,
    prevWorkerVersion: null,
    prevApiSha: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retries: 0,
    retryDelayMs: 2_000,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (arg === "--json") { options.json = true; continue; }

    const eqIndex = arg.indexOf("=");
    const flag = eqIndex >= 0 ? arg.slice(0, eqIndex) : arg;
    const takeValue = () => {
      if (eqIndex >= 0) {
        const inline = arg.slice(eqIndex + 1);
        if (!inline) throw new SmokeUsageError(`${flag} 옵션 값이 비어 있습니다.`);
        return inline;
      }
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) throw new SmokeUsageError(`${flag} 옵션에는 값이 필요합니다.`);
      index += 1;
      return next;
    };

    if (flag === "--web-url") options.webUrl = validateHttpsOrigin(takeValue(), "--web-url");
    else if (flag === "--api-url") options.apiUrl = validateHttpsOrigin(takeValue(), "--api-url");
    else if (flag === "--prev-worker-version") options.prevWorkerVersion = validatePreviousWorkerVersion(takeValue());
    else if (flag === "--prev-api-sha") options.prevApiSha = validatePreviousApiSha(takeValue());
    else if (flag === "--timeout-ms") options.timeoutMs = parseIntegerOption(takeValue(), "--timeout-ms", 1_000, 120_000);
    else if (flag === "--retries") options.retries = parseIntegerOption(takeValue(), "--retries", 0, 12);
    else if (flag === "--retry-delay-ms") options.retryDelayMs = parseIntegerOption(takeValue(), "--retry-delay-ms", 0, 30_000);
    else throw new SmokeUsageError("지원하지 않는 옵션입니다(--help로 사용법을 확인하세요).");
  }
  return options;
}

/**
 * 장애 시 즉시 실행 가능한 안전한 복구 명령만 생성한다.
 * Cloudflare는 직전 Worker 버전 재배포, 서울 onpod는 이미지 지정 교체만 허용한다.
 */
export function buildSafeRollbackGuidance({
  prevWorkerVersion = null,
  prevApiSha = null,
  workerName = DEFAULT_WORKER_NAME,
  apiAppName = DEFAULT_ONPOD_APP_NAME,
  imageRepository = DEFAULT_API_IMAGE_REPO,
} = {}) {
  const safeVersion = validatePreviousWorkerVersion(prevWorkerVersion);
  const safeApiSha = validatePreviousApiSha(prevApiSha);
  const versionSpec = safeVersion
    ? (safeVersion.includes("@") ? safeVersion : `${safeVersion}@100`)
    : "<prev-version-id>@100";
  const workerCommand = `wrangler versions deploy ${versionSpec} --name ${workerName} --yes`;
  const apiCommand = `onpod app update ${apiAppName} --image ${imageRepository}:${safeApiSha ?? "<prev-sha>"}`;

  if (FORBIDDEN_ROLLBACK_PATTERN.test(workerCommand) || FORBIDDEN_ROLLBACK_PATTERN.test(apiCommand)) {
    throw new Error("허용되지 않은 복구 명령 조합이 감지되어 생성을 중단했습니다.");
  }

  const notes = ["서울 onpod는 기존 DB 비밀번호와 런타임 환경변수를 보존하는 이미지 지정 교체만 사용합니다."];
  if (!safeVersion) notes.push("`--prev-worker-version`이 미지정되어 자리표시자를 출력했습니다. 컷오버 이후 정상 Worker 버전 ID로 치환해 실행하세요.");
  if (!safeApiSha) notes.push("`--prev-api-sha`가 미지정되어 자리표시자를 출력했습니다. 직전 정상 40자리 Git SHA로 치환해 실행하세요.");

  return Object.freeze({
    workerCommand,
    apiCommand,
    hasExactWorkerVersion: Boolean(safeVersion),
    hasExactApiSha: Boolean(safeApiSha),
    notes: Object.freeze(notes),
  });
}

function getHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const lower = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === lower);
  return typeof entry?.[1] === "string" ? entry[1] : null;
}

async function cancelBodySafely(response) {
  try {
    await response?.body?.cancel?.();
  } catch {
    // 본문 정리 오류가 스모크 판정을 덮어쓰지 않도록 무시한다.
  }
}

async function readBoundedJsonBody(response, signal) {
  if (response?.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    const cancel = () => { void reader.cancel().catch(() => undefined); };
    signal?.addEventListener("abort", cancel, { once: true });
    let complete = false;
    try {
      while (!complete) {
        if (signal?.aborted) return { ok: false, errorCode: "REQUEST_TIMEOUT", message: "응답 본문 수신 제한 시간을 초과했습니다." };
        const { done, value } = await reader.read();
        complete = done;
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : Buffer.from(value);
        totalBytes += chunk.byteLength;
        if (totalBytes > MAXIMUM_JSON_BYTES) {
          return { ok: false, errorCode: "RESPONSE_TOO_LARGE", message: `JSON 응답이 ${MAXIMUM_JSON_BYTES}바이트를 초과했습니다.` };
        }
        chunks.push(chunk);
      }
    } finally {
      signal?.removeEventListener("abort", cancel);
      if (!complete) cancel();
      reader.releaseLock();
    }
    try {
      return { ok: true, value: JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))) };
    } catch {
      return { ok: false, errorCode: "INVALID_JSON", message: "응답 본문이 유효한 JSON이 아닙니다." };
    }
  }
  if (typeof response?.text === "function") {
    const rawText = await response.text();
    if (Buffer.byteLength(rawText, "utf8") > MAXIMUM_JSON_BYTES) {
      return { ok: false, errorCode: "RESPONSE_TOO_LARGE", message: `JSON 응답이 ${MAXIMUM_JSON_BYTES}바이트를 초과했습니다.` };
    }
    try { return { ok: true, value: JSON.parse(rawText) }; }
    catch { return { ok: false, errorCode: "INVALID_JSON", message: "응답 본문이 유효한 JSON이 아닙니다." }; }
  }
  if (typeof response?.json === "function") {
    try { return { ok: true, value: await response.json() }; }
    catch { return { ok: false, errorCode: "INVALID_JSON", message: "응답 본문이 유효한 JSON이 아닙니다." }; }
  }
  return { ok: false, errorCode: "INVALID_JSON", message: "응답에서 JSON 본문을 읽을 수 없습니다." };
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("REQUEST_TIMEOUT");
      error.code = "REQUEST_TIMEOUT";
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([fetchImpl(url, { ...init, signal: controller.signal }), timeoutPromise]);
    return { response, controller };
  } finally {
    clearTimeout(timer);
  }
}

function healthResult(target, path, expectedStatus, overrides) {
  return {
    kind: "api-health",
    target,
    path,
    ok: false,
    status: null,
    expectedStatus,
    actualHealthStatus: null,
    errorCode: null,
    retryable: false,
    message: "",
    ...overrides,
  };
}

async function probeApiHealthOnce({ apiUrl, path, expectedStatus, fetchImpl, timeoutMs }) {
  const url = `${apiUrl}${path}`;
  let controller = null;
  try {
    const fetched = await fetchWithTimeout(
      fetchImpl,
      url,
      { method: "GET", redirect: "manual", headers: { accept: "application/json", "user-agent": "toonstudio-post-deploy-smoke/1" } },
      timeoutMs,
    );
    controller = fetched.controller;
    const { response } = fetched;
    if (!Number.isInteger(response?.status)) {
      return healthResult(url, path, expectedStatus, { errorCode: "INVALID_RESPONSE", message: `${path} HTTP 응답 형식이 올바르지 않습니다.` });
    }
    if (response.status >= 300 && response.status < 400) {
      await cancelBodySafely(response);
      return healthResult(url, path, expectedStatus, { status: response.status, errorCode: "REDIRECT_NOT_ALLOWED", message: `${path} 응답이 리다이렉트(HTTP ${response.status})입니다.` });
    }
    if (getHeader(response.headers, "x-vercel-id") !== null) {
      await cancelBodySafely(response);
      return healthResult(url, path, expectedStatus, { status: response.status, errorCode: "RETIRED_VERCEL_ORIGIN", message: `${path} 응답이 퇴역한 Vercel 헤더(x-vercel-id)를 포함합니다.` });
    }
    if (response.status !== 200) {
      await cancelBodySafely(response);
      return healthResult(url, path, expectedStatus, {
        status: response.status,
        errorCode: `HTTP_${response.status}`,
        retryable: RETRYABLE_HTTP_STATUSES.has(response.status),
        message: `${path} HTTP ${response.status} 응답을 받았습니다(예상 200).`,
      });
    }
    const parsedBody = await readBoundedJsonBody(response, controller.signal);
    if (!parsedBody.ok) {
      return healthResult(url, path, expectedStatus, {
        status: response.status,
        errorCode: parsedBody.errorCode,
        retryable: parsedBody.errorCode === "REQUEST_TIMEOUT",
        message: `${path} ${parsedBody.message}`,
      });
    }
    const body = parsedBody.value;
    const actualHealthStatus = body && typeof body === "object" && !Array.isArray(body) && typeof body.status === "string" ? body.status : null;
    if (actualHealthStatus !== expectedStatus) {
      return healthResult(url, path, expectedStatus, {
        status: response.status,
        actualHealthStatus,
        errorCode: "UNEXPECTED_HEALTH_PAYLOAD",
        message: `${path} JSON status 불일치 (기대=${expectedStatus}, 실제=${actualHealthStatus ?? "없음"}).`,
      });
    }
    return healthResult(url, path, expectedStatus, {
      ok: true,
      status: response.status,
      actualHealthStatus,
      message: `${path} HTTP 200 (status=${actualHealthStatus})`,
    });
  } catch (error) {
    const isTimeout = error?.code === "REQUEST_TIMEOUT";
    return healthResult(url, path, expectedStatus, {
      errorCode: isTimeout ? "REQUEST_TIMEOUT" : "REQUEST_FAILED",
      retryable: true,
      message: isTimeout ? `${path} 요청 제한 시간(${timeoutMs}ms)을 초과했습니다.` : `${path} 네트워크 요청에 실패했습니다(원문 미출력).`,
    });
  } finally {
    controller?.abort();
  }
}

async function probeApiHealthWithRetries(params) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const result = await probeApiHealthOnce(params);
    if (result.ok || !result.retryable || attempt > params.retries) return { ...result, attempts: attempt };
    if (params.retryDelayMs > 0) await params.sleepImpl(params.retryDelayMs);
  }
}

function spaResult(target, path, requireCoopCoep, overrides) {
  return {
    kind: "spa-route",
    target,
    path,
    ok: false,
    status: null,
    requireCoopCoep,
    coop: null,
    coep: null,
    errorCode: null,
    message: "",
    ...overrides,
  };
}

async function probeSpaRoute({ webUrl, path, requireCoopCoep, fetchImpl, timeoutMs }) {
  const url = `${webUrl}${path}`;
  let controller = null;
  try {
    const fetched = await fetchWithTimeout(
      fetchImpl,
      url,
      { method: "GET", redirect: "manual", headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8", "user-agent": "toonstudio-post-deploy-smoke/1" } },
      timeoutMs,
    );
    controller = fetched.controller;
    const { response } = fetched;
    await cancelBodySafely(response);

    if (!Number.isInteger(response?.status)) {
      return spaResult(url, path, requireCoopCoep, { errorCode: "INVALID_RESPONSE", message: `${path} HTTP 응답 형식이 올바르지 않습니다.` });
    }
    const coop = getHeader(response.headers, "cross-origin-opener-policy")?.trim().toLowerCase() || null;
    const coep = getHeader(response.headers, "cross-origin-embedder-policy")?.trim().toLowerCase() || null;

    if (response.status >= 300 && response.status < 400) {
      return spaResult(url, path, requireCoopCoep, { status: response.status, coop, coep, errorCode: "REDIRECT_NOT_ALLOWED", message: `${path} SPA 경로가 리다이렉트(HTTP ${response.status})를 반환했습니다.` });
    }
    if (getHeader(response.headers, "x-vercel-id") !== null) {
      return spaResult(url, path, requireCoopCoep, { status: response.status, coop, coep, errorCode: "RETIRED_VERCEL_ORIGIN", message: `${path} 응답이 퇴역한 Vercel 헤더(x-vercel-id)를 포함합니다.` });
    }
    if (response.status !== 200) {
      return spaResult(url, path, requireCoopCoep, { status: response.status, coop, coep, errorCode: `HTTP_${response.status}`, message: `${path} SPA 경로가 HTTP ${response.status}을 반환했습니다(예상 200).` });
    }
    if (requireCoopCoep) {
      const mismatches = [];
      if (coop !== "same-origin") mismatches.push(`Cross-Origin-Opener-Policy=${coop ?? "없음"} (기대 same-origin)`);
      if (!coep || !ACCEPTED_COEP_VALUES.has(coep)) {
        mismatches.push(`Cross-Origin-Embedder-Policy=${coep ?? "없음"} (기대 credentialless 또는 require-corp)`);
      }
      if (mismatches.length > 0) {
        return spaResult(url, path, requireCoopCoep, {
          status: response.status,
          coop,
          coep,
          errorCode: "COOP_COEP_HEADER_MISMATCH",
          message: `${path} 교차 출처 격리 헤더 누락/불일치: ${mismatches.join(", ")}`,
        });
      }
    }
    return spaResult(url, path, requireCoopCoep, {
      ok: true,
      status: response.status,
      coop,
      coep,
      message: requireCoopCoep ? `${path} HTTP 200 (COOP=${coop}, COEP=${coep})` : `${path} HTTP 200`,
    });
  } catch (error) {
    const isTimeout = error?.code === "REQUEST_TIMEOUT";
    return spaResult(url, path, requireCoopCoep, {
      errorCode: isTimeout ? "REQUEST_TIMEOUT" : "REQUEST_FAILED",
      message: isTimeout ? `${path} 요청 제한 시간(${timeoutMs}ms)을 초과했습니다.` : `${path} 네트워크 요청에 실패했습니다(원문 미출력).`,
    });
  } finally {
    controller?.abort();
  }
}

/**
 * 운영 배포 직후 API 헬스(`/api/health/live`, `/api/health/ready`)와
 * 핵심 SPA 경로(`/`, `/studio`, `/production`, `/studio/character`) 및 COOP/COEP 헤더를 전수 점검한다.
 */
export async function runProductionPostDeploySmoke({
  webUrl = DEFAULT_WEB_URL,
  apiUrl = DEFAULT_API_URL,
  prevWorkerVersion = null,
  prevApiSha = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = 0,
  retryDelayMs = 2_000,
  sleepImpl = (delayMs) => new Promise((done) => setTimeout(done, delayMs)),
  spaRoutes = CORE_SPA_ROUTES,
} = {}) {
  const normalizedWebUrl = validateHttpsOrigin(webUrl, "--web-url");
  const normalizedApiUrl = validateHttpsOrigin(apiUrl, "--api-url");
  const rollback = buildSafeRollbackGuidance({ prevWorkerVersion, prevApiSha });
  if (typeof fetchImpl !== "function") throw new SmokeUsageError("fetchImpl은 함수여야 합니다.");

  const checks = [];
  for (const spec of CORE_API_HEALTH_CHECKS) {
    checks.push(await probeApiHealthWithRetries({
      apiUrl: normalizedApiUrl,
      path: spec.path,
      expectedStatus: spec.expectedStatus,
      fetchImpl,
      timeoutMs,
      retries,
      retryDelayMs,
      sleepImpl,
    }));
  }
  for (const route of spaRoutes) {
    checks.push(await probeSpaRoute({
      webUrl: normalizedWebUrl,
      path: route.path,
      requireCoopCoep: Boolean(route.requireCoopCoep),
      fetchImpl,
      timeoutMs,
    }));
  }

  const failures = checks.filter((entry) => !entry.ok);
  const ok = failures.length === 0;
  return {
    ok,
    webUrl: normalizedWebUrl,
    apiUrl: normalizedApiUrl,
    totalChecks: checks.length,
    passedCount: checks.length - failures.length,
    failedCount: failures.length,
    checks,
    failures,
    rollback: ok ? null : rollback,
  };
}

export function formatPostDeploySmokeReport(report) {
  const lines = [
    `[post-deploy-smoke] 결과: ${report.ok ? "통과" : "실패"} (${report.passedCount}/${report.totalChecks})`,
    `- 웹 URL: ${report.webUrl}`,
    `- API URL: ${report.apiUrl}`,
    "점검 상세:",
    ...report.checks.map((check) => `  - [${check.ok ? "PASS" : "FAIL"}] ${redactSensitiveText(check.message)}`),
  ];

  if (!report.ok && report.rollback) {
    lines.push(
      "",
      "즉시 실행 가능한 안전한 롤백 명령:",
      "  1) Cloudflare Worker 이전 버전 재배포:",
      `     ${report.rollback.workerCommand}`,
      "  2) 서울 onpod Core API 이전 이미지 교체:",
      `     ${report.rollback.apiCommand}`,
      ...report.rollback.notes.map((note) => `  * ${note}`),
    );
  }
  return lines.join("\n");
}

const USAGE_TEXT = [
  "사용법: node scripts/verify-production-post-deploy-smoke.mjs [옵션]",
  `  --web-url <https-origin>              운영 웹 원점 (기본: ${DEFAULT_WEB_URL})`,
  `  --api-url <https-origin>              운영 API 원점 (기본: ${DEFAULT_API_URL})`,
  "  --prev-worker-version <version-id>    직전 정상 Cloudflare Worker 버전 ID",
  "  --prev-api-sha <40-hex-sha>           직전 정상 Core API 40자리 Git SHA",
  "  --timeout-ms <ms>                     요청별 제한 시간(1000~120000, 기본 15000)",
  "  --retries <n>                         API 502/503/504 재시도 횟수(0~12, 기본 0)",
  "  --retry-delay-ms <ms>                 재시도 대기 시간(0~30000, 기본 2000)",
  "  --json                                JSON 리포트 출력",
].join("\n");

export async function executePostDeploySmokeCli(
  argv = process.argv.slice(2),
  {
    fetchImpl = globalThis.fetch,
    sleepImpl = (delayMs) => new Promise((done) => setTimeout(done, delayMs)),
    log = (line) => console.log(line),
    errorLog = (line) => console.error(line),
  } = {},
) {
  let options;
  try {
    options = parsePostDeploySmokeArgs(argv);
  } catch (error) {
    errorLog(`[post-deploy-smoke] 입력 오류: ${error instanceof Error ? redactSensitiveText(error.message) : "입력 오류"}`);
    errorLog(USAGE_TEXT);
    return 2;
  }
  if (options.help) {
    log(USAGE_TEXT);
    return 0;
  }
  const report = await runProductionPostDeploySmoke({ ...options, fetchImpl, sleepImpl });
  log(options.json ? JSON.stringify(report, null, 2) : formatPostDeploySmokeReport(report));
  return report.ok ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === MODULE_PATH) {
  executePostDeploySmokeCli()
    .then((exitCode) => { process.exitCode = exitCode; })
    .catch((error) => {
      console.error(`[post-deploy-smoke] 실행 오류: ${redactSensitiveText(error instanceof Error ? error.message : "알 수 없는 오류")}`);
      process.exitCode = 1;
    });
}
