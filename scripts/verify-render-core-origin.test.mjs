import { afterEach, describe, expect, it, vi } from "vitest";

import { parseRenderCoreOrigin, verifyRenderCoreOrigin } from "./verify-render-core-origin.mjs";

const ORIGIN = "https://api.example.test";
const START_TIME = Date.parse("2026-11-18T00:00:00.000Z");

function response(body, options = {}) {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json",
      server: options.server ?? "onpod",
      ...(options.headers ?? {}),
    },
  });
}

function healthyResponse(url) {
  return response({ status: new URL(String(url)).pathname.endsWith("/live") ? "ok" : "ready" });
}

function clock() {
  let elapsed = 0;
  const advance = (ms) => { elapsed += ms; };
  return {
    nowImpl: () => elapsed,
    wallNowImpl: () => START_TIME + elapsed,
    sleepImpl: vi.fn(async (ms) => { advance(ms); }),
    advance,
  };
}

async function failureOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("실패해야 하는 검증이 성공했습니다.");
}

afterEach(() => { vi.useRealTimers(); });

describe("Core API 원점의 제한 시간 내 상태 검증", () => {
  it("정상 원점의 live와 ready를 읽기 요청으로 확인하고 시도 증거를 남긴다", async () => {
    const fetchImpl = vi.fn(healthyResponse);
    const time = clock();
    const onAttempt = vi.fn();
    const result = await verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, ...time, onAttempt });

    expect(result).toMatchObject({
      origin: ORIGIN,
      liveness: { path: "/api/health/live", status: 200, server: "onpod" },
      readiness: { path: "/api/health/ready", status: 200, server: "onpod" },
      attempts: [
        { path: "/api/health/live", attempt: 1, status: 200, elapsedMs: 0, errorCode: null },
        { path: "/api/health/ready", attempt: 2, status: 200, elapsedMs: 0, errorCode: null },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options).toMatchObject({ method: "GET", redirect: "manual", headers: { accept: "application/json" } });
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
    expect(time.sleepImpl).not.toHaveBeenCalled();
    expect(onAttempt.mock.calls.map(([entry]) => entry)).toEqual(result.attempts);
    expect(Object.isFrozen(result.attempts)).toBe(true);
    expect(result.attempts.every(Object.isFrozen)).toBe(true);
  });

  it("시작 직후 live와 ready의 일시적인 503이 각각 회복되면 성공한다", async () => {
    const time = clock();
    const calls = new Map();
    const fetchImpl = vi.fn((url) => {
      const path = new URL(String(url)).pathname;
      const seen = calls.get(path) ?? 0;
      calls.set(path, seen + 1);
      return seen === 0 ? response({ status: "starting" }, { status: 503 }) : healthyResponse(url);
    });
    const result = await verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, ...time });

    expect(result.attempts.map((entry) => [entry.path, entry.status, entry.elapsedMs])).toEqual([
      ["/api/health/live", 503, 0], ["/api/health/live", 200, 2_000],
      ["/api/health/ready", 503, 2_000], ["/api/health/ready", 200, 4_000],
    ]);
    expect(time.sleepImpl.mock.calls).toEqual([[2_000], [2_000]]);
  });

  it.each([502, 503, 504])("HTTP %i가 계속되면 제한된 간격으로만 재시도하고 실패한다", async (status) => {
    const time = clock();
    const fetchImpl = vi.fn(() => response({ status: "starting" }, { status }));
    const error = await failureOf(verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, timeoutMs: 60_000, ...time }));

    expect(error.code).toBe("DEADLINE_EXCEEDED");
    expect(error.attempts.map((entry) => entry.elapsedMs)).toEqual([0, 2_000, 6_000, 14_000, 29_000, 44_000, 59_000]);
    expect(error.attempts.every((entry) => entry.status === status && entry.path === "/api/health/live")).toBe(true);
    expect(time.sleepImpl.mock.calls).toEqual([[2_000], [4_000], [8_000], [15_000], [15_000], [15_000]]);
    expect(fetchImpl).toHaveBeenCalledTimes(7);
  });

  it("readiness는 liveness에서 사용한 전체 제한 시간을 다시 부여받지 않는다", async () => {
    const time = clock();
    const fetchImpl = vi.fn()
      .mockImplementationOnce(() => response({}, { status: 503 }))
      .mockImplementationOnce(healthyResponse)
      .mockImplementation(() => response({ status: "not_ready" }, { status: 503 }));
    const error = await failureOf(verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, timeoutMs: 4_000, ...time }));

    expect(error).toMatchObject({ code: "DEADLINE_EXCEEDED", status: 503 });
    expect(error.attempts.map((entry) => [entry.path, entry.status])).toEqual([
      ["/api/health/live", 503], ["/api/health/live", 200], ["/api/health/ready", 503],
    ]);
    expect(time.sleepImpl.mock.calls).toEqual([[2_000]]);
  });

  it("응답 또는 대기가 전체 기한을 넘겼다면 다음 요청이나 성공 판정을 하지 않는다", async () => {
    const time = clock();
    const fetchImpl = vi.fn((url) => { time.advance(1_001); return healthyResponse(url); });
    const late = await failureOf(verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, timeoutMs: 1_000, ...time }));
    expect(late).toMatchObject({ code: "DEADLINE_EXCEEDED", attempts: [{ status: 200, errorCode: "DEADLINE_EXCEEDED" }] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const delayed = clock();
    delayed.sleepImpl.mockImplementation(async () => { delayed.advance(5_001); });
    const unavailable = vi.fn(() => response({}, { status: 503 }));
    const overslept = await failureOf(verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl: unavailable, timeoutMs: 5_000, ...delayed }));
    expect(overslept.code).toBe("DEADLINE_EXCEEDED");
    expect(unavailable).toHaveBeenCalledTimes(1);
  });

  it("개별 요청이 멎어도 abort 후 남은 기한 안에서 회복할 수 있다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const time = clock();
    let firstSignal;
    const fetchImpl = vi.fn().mockImplementationOnce((_, options) => {
      firstSignal = options.signal;
      return new Promise(() => {});
    }).mockImplementation(healthyResponse);
    const pending = verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, timeoutMs: 5_000, requestTimeoutMs: 1_000, ...time });

    time.advance(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await pending;
    expect(firstSignal.aborted).toBe(true);
    expect(result.attempts.map((entry) => entry.errorCode)).toEqual(["REQUEST_TIMEOUT", null, null]);
    expect(result.attempts.at(-1).elapsedMs).toBe(3_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("개별 제한 시간이 더 길어도 fetch가 전체 남은 시간을 넘기지 못한다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const time = clock();
    const fetchImpl = vi.fn(() => new Promise(() => {}));
    const pending = failureOf(verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, timeoutMs: 1_500, requestTimeoutMs: 10_000, ...time }));
    time.advance(1_500);
    await vi.advanceTimersByTimeAsync(1_500);
    const error = await pending;

    expect(error).toMatchObject({ code: "DEADLINE_EXCEEDED", attempts: [{ errorCode: "REQUEST_TIMEOUT", elapsedMs: 1_500 }] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(time.sleepImpl).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("200 헤더 뒤 본문이 멎어도 동일 요청 제한 시간에 읽기를 취소한다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const time = clock();
    const cancel = vi.fn();
    const fetchImpl = vi.fn(() => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("{")); },
      cancel,
    }), { status: 200 }));
    const pending = failureOf(verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, timeoutMs: 1_500, requestTimeoutMs: 1_000, ...time }));
    time.advance(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    const error = await pending;

    expect(error.attempts).toMatchObject([{ status: 200, errorCode: "REQUEST_TIMEOUT", elapsedMs: 1_000 }]);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["7", 7_000, 7_000],
    [new Date(START_TIME + 12_000).toUTCString(), 12_000, 12_000],
    [new Date(START_TIME - 10_000).toUTCString(), 2_000, 0],
    ["0", 2_000, 0], ["invalid", 2_000, null], ["1.5", 2_000, null], ["-1", 2_000, null],
  ])("Retry-After %s를 해석하고 서버가 지정한 시각 전에 재요청하지 않는다", async (retryAfter, delay, parsed) => {
    const time = clock();
    const fetchImpl = vi.fn()
      .mockImplementationOnce(() => response({}, { status: 503, headers: { "retry-after": retryAfter } }))
      .mockImplementation(healthyResponse);
    const result = await verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, ...time });

    expect(time.sleepImpl.mock.calls).toEqual([[delay]]);
    expect(result.attempts[0].retryAfterMs).toBe(parsed);
    expect(result.attempts[1].elapsedMs).toBe(delay);
  });

  it.each(["60", new Date(START_TIME + 60_000).toUTCString(), "9".repeat(400)])("Retry-After가 기한보다 길면 값을 잘라 조기 재시도하지 않는다: %s", async (retryAfter) => {
    const time = clock();
    const fetchImpl = vi.fn(() => response({}, { status: 503, headers: { "retry-after": retryAfter } }));
    const error = await failureOf(verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, timeoutMs: 10_000, ...time }));

    expect(error.code).toBe("DEADLINE_EXCEEDED");
    expect(Number.isSafeInteger(error.attempts[0].retryAfterMs)).toBe(true);
    expect(error.attempts[0].retryAfterMs).toBeGreaterThan(10_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(time.sleepImpl).not.toHaveBeenCalled();
  });

  it.each(["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET"])("일시적인 네트워크 오류 %s는 재시도한다", async (code) => {
    const time = clock();
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError("민감한 원문", {
      cause: Object.assign(new Error("민감한 내부 원문"), { code }),
    })).mockImplementation(healthyResponse);
    const result = await verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, ...time });
    expect(result.attempts[0]).toMatchObject({ status: null, errorCode: code });
    expect(time.sleepImpl.mock.calls).toEqual([[2_000]]);
  });

  it.each(["ENOTFOUND", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID", undefined])("허용하지 않은 네트워크·인증서 오류 %s는 즉시 실패한다", async (code) => {
    const time = clock();
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("노출하면 안 되는 원문", { cause: { code } }));
    const error = await failureOf(verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, ...time }));
    expect(error.code).toBe("REQUEST_FAILED");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(time.sleepImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["리다이렉트", () => response({}, { status: 302 }), "REDIRECT_NOT_ALLOWED"],
    ...[401, 403, 404, 429, 500].map((status) => ["HTTP " + status, () => response({}, { status, headers: { "retry-after": "2" } }), "HTTP_" + status]),
    ["Vercel 200", () => response({ status: "ok" }, { headers: { "x-vercel-id": "fixture" } }), "VERCEL_ORIGIN"],
    ["Vercel 503", () => response({}, { status: 503, headers: { "x-vercel-id": "fixture" } }), "VERCEL_ORIGIN"],
    ["잘못된 JSON", () => new Response("invalid-json"), "INVALID_JSON"],
    ["다른 응답 계약", () => response({ status: "ready" }), "UNEXPECTED_CONTRACT"],
    ["추가 필드", () => response({ status: "ok", extra: true }), "UNEXPECTED_CONTRACT"],
    ["과도한 본문", () => new Response("x".repeat(16_385)), "RESPONSE_TOO_LARGE"],
  ])("영구 실패인 %s는 재시도로 숨기지 않는다", async (_, makeResponse, code) => {
    const time = clock();
    const fetchImpl = vi.fn(makeResponse);
    const error = await failureOf(verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, ...time }));
    expect(error.code).toBe(code);
    expect(error.attempts).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(time.sleepImpl).not.toHaveBeenCalled();
  });

  it("실패 증거에는 응답 본문·헤더·원문 예외 대신 허용한 상태 정보만 기록한다", async () => {
    const time = clock();
    const marker = "synthetic-sensitive-marker";
    const onAttempt = vi.fn();
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error(marker), { code: "ECONNRESET" }))
      .mockImplementationOnce(() => response({ marker }, { status: 503, headers: { "x-internal": marker, "retry-after": marker } }))
      .mockImplementation(() => response({ marker }, { status: 403 }));
    const error = await failureOf(verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, ...time, onAttempt }));

    expect(error.message + JSON.stringify(error)).not.toContain(marker);
    expect(onAttempt.mock.calls.map(([entry]) => entry)).toEqual(error.attempts);
    expect(Object.keys(error.attempts[0]).sort()).toEqual([
      "attempt", "elapsedMs", "errorCode", "path", "retryAfterMs", "status", "timestamp",
    ]);
    expect(error.attempts.map((entry) => entry.errorCode)).toEqual(["ECONNRESET", "HTTP_503", "HTTP_403"]);
    expect(error.attempts[0].timestamp).toBe("2026-11-18T00:00:00.000Z");
  });

  it.each([
    "", "http://api.example.test",
    // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- synthetic unsafe-origin rejection fixture
    "https://user:pass@api.example.test",
    "https://api.example.test/path", "https://api.example.test?query=1", "https://api.example.test#fragment",
  ])("안전하지 않은 문자열 원점을 거부한다: %s", (origin) => {
    expect(() => parseRenderCoreOrigin(origin)).toThrow();
  });

  it.each(["http://api.example.test", "https://api.example.test/path", "https://api.example.test?query=1"])("URL 객체도 검증을 우회할 수 없다: %s", async (raw) => {
    const fetchImpl = vi.fn(healthyResponse);
    const error = await failureOf(verifyRenderCoreOrigin({ origin: new URL(raw), fetchImpl }));
    expect(error).toMatchObject({ code: "UNSAFE_ORIGIN", attempts: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    { timeoutMs: 999 }, { timeoutMs: 300_001 }, { timeoutMs: Number.NaN },
    { requestTimeoutMs: 0 }, { requestTimeoutMs: 300_001 },
    { onAttempt: true }, { nowImpl: 1 }, { wallNowImpl: 1 }, { sleepImpl: 1 },
  ])("잘못된 제한 시간·주입 옵션을 요청 전에 거부한다: %j", async (options) => {
    const fetchImpl = vi.fn(healthyResponse);
    const error = await failureOf(verifyRenderCoreOrigin({ origin: ORIGIN, fetchImpl, ...options }));
    expect(error).toMatchObject({ code: "INVALID_OPTIONS", attempts: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
