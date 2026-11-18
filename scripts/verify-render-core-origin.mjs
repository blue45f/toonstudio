#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAXIMUM_RESPONSE_BYTES = 16_384;
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000];
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET",
]);

class OriginVerificationError extends Error {
  constructor(message, { code, retryable = false, status = null, retryAfterMs = null } = {}) {
    super(message);
    this.name = "OriginVerificationError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function verificationError(path, code, message, details = {}) {
  return new OriginVerificationError(`${path} ${message}`, { code, ...details });
}

export function parseRenderCoreOrigin(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw verificationError("RENDER_CORE_API_ORIGIN", "UNSAFE_ORIGIN", "HTTPS 원점이 필요합니다.");
  }
  let origin;
  try {
    origin = new URL(raw.trim());
  } catch {
    throw verificationError("RENDER_CORE_API_ORIGIN", "UNSAFE_ORIGIN", "절대 HTTPS 원점이어야 합니다.");
  }
  if (
    origin.protocol !== "https:"
    || origin.username !== ""
    || origin.password !== ""
    || origin.pathname !== "/"
    || origin.search !== ""
    || origin.hash !== ""
  ) {
    throw verificationError(
      "RENDER_CORE_API_ORIGIN", "UNSAFE_ORIGIN", "자격증명·경로·쿼리·fragment 없는 HTTPS 원점이어야 합니다.",
    );
  }
  return origin;
}

async function readBoundedJson(response, path, signal) {
  const chunks = [];
  let bytes = 0;
  const reader = response.body?.getReader();
  if (reader) {
    // 실제 fetch와 테스트 스트림 모두 요청 제한 시간에 본문 읽기를 중단한다.
    const cancel = () => {
      // 본문 취소 실패로 원래 HTTP/검증 오류를 덮어쓰지 않는다.
      void reader.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", cancel, { once: true });
    let complete = false;
    try {
      while (!complete) {
        if (signal.aborted) throw signal.reason;
        const { done, value } = await reader.read();
        if (signal.aborted) throw signal.reason;
        complete = done;
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAXIMUM_RESPONSE_BYTES) {
          throw verificationError(path, "RESPONSE_TOO_LARGE", `응답이 ${MAXIMUM_RESPONSE_BYTES}바이트를 초과했습니다.`);
        }
        chunks.push(value);
      }
    } finally {
      signal.removeEventListener("abort", cancel);
      if (!complete) cancel();
      reader.releaseLock();
    }
  }
  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    throw verificationError(path, "INVALID_JSON", "응답이 유효한 JSON이 아닙니다.");
  }
}

function retryAfterMilliseconds(raw, wallNowMs) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = raw.trim();
  if (/^\d+$/u.test(value)) {
    return Math.min(Number(value) * 1_000, Number.MAX_SAFE_INTEGER);
  }
  // 소수·음수 초를 Date.parse가 날짜로 오해하지 않도록 숫자 형식은 제외한다.
  if (!/[a-z]/iu.test(value)) return null;
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - wallNowMs) : null;
}

function transientNetworkCode(error, depth = 0) {
  if (!error || typeof error !== "object" || depth > 3) return null;
  if (RETRYABLE_NETWORK_CODES.has(error.code)) return error.code;
  if (Array.isArray(error.errors) && error.errors.length > 0) {
    const codes = error.errors.map((entry) => transientNetworkCode(entry, depth + 1));
    if (codes.every(Boolean)) return codes[0];
  }
  return transientNetworkCode(error.cause, depth + 1);
}

async function probe({ fetchImpl, origin, path, expectedBody, requestTimeoutMs, wallNowImpl }) {
  const controller = new AbortController();
  let status = null;
  let timeout;
  const timeoutError = verificationError(path, "REQUEST_TIMEOUT", "개별 요청 제한 시간을 초과했습니다.", { retryable: true });
  const timedOut = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, requestTimeoutMs);
  });
  const request = async () => {
    const response = await fetchImpl(new URL(path, origin), {
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "application/json",
        "user-agent": "toonstudio-render-core-verifier/1",
      },
      signal: controller.signal,
    });
    if (!Number.isInteger(response?.status) || response.status < 0 || response.status > 599) {
      throw verificationError(path, "INVALID_RESPONSE", "HTTP 응답 형식이 올바르지 않습니다.");
    }
    status = response.status;
    if (status >= 300 && status < 400) {
      throw verificationError(path, "REDIRECT_NOT_ALLOWED", "리다이렉트 응답을 허용하지 않습니다.");
    }
    if (response.headers.has("x-vercel-id")) {
      throw verificationError(path, "VERCEL_ORIGIN", "응답이 퇴역한 Vercel을 경유합니다.");
    }
    if (status !== 200) {
      throw verificationError(path, `HTTP_${status}`, `HTTP ${status} 응답을 받았습니다(예상 200).`, {
        retryable: RETRYABLE_STATUSES.has(status),
        retryAfterMs: RETRYABLE_STATUSES.has(status)
          ? retryAfterMilliseconds(response.headers.get("retry-after"), wallNowImpl())
          : null,
      });
    }
    const body = await readBoundedJson(response, path, controller.signal);
    if (JSON.stringify(body) !== JSON.stringify(expectedBody)) {
      throw verificationError(path, "UNEXPECTED_CONTRACT", "응답이 예상한 상태 계약과 다릅니다.");
    }
    return Object.freeze({ path, status, server: response.headers.get("server") });
  };
  try {
    // signal을 무시하는 구현도 fetch와 본문 읽기의 공통 제한 시간을 넘기지 못한다.
    return await Promise.race([request(), timedOut]);
  } catch (error) {
    const failure = error instanceof OriginVerificationError ? error : verificationError(
      path,
      transientNetworkCode(error) ?? "REQUEST_FAILED",
      "HTTP 요청 또는 본문 수신에 실패했습니다(원문 미출력).",
      { retryable: transientNetworkCode(error) !== null },
    );
    failure.status = status;
    throw failure;
  } finally {
    clearTimeout(timeout);
    // 재시도·실패 응답의 읽지 않은 본문도 연결에 남겨 두지 않는다.
    controller.abort();
  }
}

export async function verifyRenderCoreOrigin({
  origin,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  onAttempt,
  nowImpl = () => performance.now(),
  wallNowImpl = Date.now,
  sleepImpl = (delayMs) => new Promise((done) => setTimeout(done, delayMs)),
} = {}) {
  const attempts = [];
  try {
    const parsed = parseRenderCoreOrigin(origin instanceof URL ? origin.href : origin);
    if (typeof fetchImpl !== "function" || typeof nowImpl !== "function"
      || typeof wallNowImpl !== "function" || typeof sleepImpl !== "function"
      || (onAttempt !== undefined && typeof onAttempt !== "function")) {
      throw verificationError("원점 검증", "INVALID_OPTIONS", "요청·시계·대기·기록 구현은 함수여야 합니다.");
    }
    for (const [name, value] of [["timeoutMs", timeoutMs], ["requestTimeoutMs", requestTimeoutMs]]) {
      if (!Number.isSafeInteger(value) || value < 1_000 || value > 300_000) {
        throw verificationError(name, "INVALID_OPTIONS", "1000~300000 사이의 정수여야 합니다.");
      }
    }
    const startedAt = nowImpl();
    const deadline = startedAt + timeoutMs;
    const elapsedMs = () => Math.max(0, Math.round(nowImpl() - startedAt));
    const verifyPath = async (path, expectedBody) => {
      let retries = 0;
      while (true) {
        const remainingMs = Math.floor(deadline - nowImpl());
        if (remainingMs < 1) {
          throw verificationError(path, "DEADLINE_EXCEEDED", `전체 검증 제한 시간 ${timeoutMs}ms를 소진했습니다.`);
        }
        let result;
        let failure;
        try {
          result = await probe({
            fetchImpl, origin: parsed, path, expectedBody,
            requestTimeoutMs: Math.min(requestTimeoutMs, remainingMs), wallNowImpl,
          });
          if (nowImpl() >= deadline) {
            throw verificationError(path, "DEADLINE_EXCEEDED", `전체 검증 제한 시간 ${timeoutMs}ms를 소진했습니다.`, { status: result.status });
          }
        } catch (error) {
          failure = error;
        }
        const diagnostic = Object.freeze({
          timestamp: new Date(wallNowImpl()).toISOString(),
          path,
          status: failure?.status ?? result?.status ?? null,
          attempt: attempts.length + 1,
          elapsedMs: elapsedMs(),
          retryAfterMs: failure?.retryAfterMs ?? null,
          errorCode: failure?.code ?? null,
        });
        attempts.push(diagnostic);
        onAttempt?.(diagnostic);
        if (!failure) return result;
        if (!failure.retryable) throw failure;
        const waitMs = Math.max(
          RETRY_DELAYS_MS[Math.min(retries, RETRY_DELAYS_MS.length - 1)],
          failure.retryAfterMs ?? 0,
        );
        // Retry-After를 상한으로 잘라 서버가 허용한 시각보다 먼저 재요청하지 않는다.
        if (waitMs >= deadline - nowImpl()) {
          throw verificationError(path, "DEADLINE_EXCEEDED", `전체 검증 제한 시간 ${timeoutMs}ms 안에 다음 재시도를 할 수 없습니다.`, {
            status: failure.status, retryAfterMs: failure.retryAfterMs,
          });
        }
        await sleepImpl(waitMs);
        retries += 1;
      }
    };
    const liveness = await verifyPath("/api/health/live", { status: "ok" });
    const readiness = await verifyPath("/api/health/ready", { status: "ready" });
    return Object.freeze({ origin: parsed.origin, liveness, readiness, attempts: Object.freeze([...attempts]) });
  } catch (error) {
    const failure = error instanceof OriginVerificationError ? error : verificationError(
      "원점 검증", "VERIFICATION_FAILED", "검증 처리에 실패했습니다(원문 미출력).",
    );
    failure.attempts = Object.freeze([...attempts]);
    throw failure;
  }
}

async function main() {
  const originArgument = process.argv.find((argument) => argument.startsWith("--origin="));
  const origin = originArgument?.slice("--origin=".length)
    ?? process.env.RENDER_CORE_API_ORIGIN;
  const result = await verifyRenderCoreOrigin({
    origin,
    onAttempt: (attempt) => console.log(`[core-origin] 상태 확인 ${JSON.stringify(attempt)}`),
  });
  console.log(
    `Core API 원점 검증 완료: ${result.origin} (live=${result.liveness.status}, ready=${result.readiness.status}, 요청 ${result.attempts.length}회, Vercel 헤더 없음)`,
  );
}

const invoked = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
