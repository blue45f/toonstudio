import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_AI_CONFIGURATION,
} from "../user-ai-types";
import { getUserAiSnapshot, lockUserAi, setUserAiConfiguration } from "../user-ai-store";

import { ClaudeGuardError, createClaudeGuardedFetch } from "./claude-guarded-fetch";

const URL_MESSAGES = "https://api.anthropic.com/v1/messages";
const TEST_KEY = "test-anthropic-key-0000";

function ok(body: BodyInit | null = "{}", init: ResponseInit = { status: 200 }): Response {
  return new Response(body, init);
}

beforeEach(() => {
  setUserAiConfiguration(structuredClone(EMPTY_AI_CONFIGURATION));
});

afterEach(() => {
  lockUserAi(false);
});

describe("Claude 가드 fetch", () => {
  it("공식 origin이 아니면 전송하지 않는다", async () => {
    const fetchImpl = vi.fn();
    const guarded = createClaudeGuardedFetch({ apiKey: TEST_KEY, revision: getUserAiSnapshot().revision, fetchImpl });
    for (const target of [
      "https://evil.example/v1/messages",
      "http://api.anthropic.com/v1/messages",
      "https://api.anthropic.com:8443/v1/messages",
    ]) {
      await expect(guarded(target, { method: "POST", body: "{}" })).rejects.toBeInstanceOf(ClaudeGuardError);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("쿠키·사이트 헤더를 제거하고 안전한 요청 옵션을 강제한다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok());
    const guarded = createClaudeGuardedFetch({ apiKey: TEST_KEY, revision: getUserAiSnapshot().revision, fetchImpl });
    await guarded(URL_MESSAGES, {
      method: "POST",
      body: "{}",
      credentials: "include",
      redirect: "follow",
      headers: {
        Cookie: "session=1",
        "X-User-Id": "user-1",
        Authorization: `Bearer ${TEST_KEY}`,
        "anthropic-version": "2026-10-21",
      },
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe(URL_MESSAGES);
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("x-user-id")).toBe(false);
    expect(headers.get("authorization")).toBe(`Bearer ${TEST_KEY}`);
    expect(headers.get("anthropic-version")).toBe("2026-10-21");
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("error");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(init.cache).toBe("no-store");
  });

  it("구버전 SDK의 x-api-key 헤더도 같은 키일 때만 통과한다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok());
    const guarded = createClaudeGuardedFetch({ apiKey: TEST_KEY, revision: getUserAiSnapshot().revision, fetchImpl });
    await guarded(URL_MESSAGES, { method: "POST", body: "{}", headers: { "x-api-key": TEST_KEY } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["다른 Bearer 토큰", { Authorization: "Bearer someone-elses-secret" }],
    ["다른 x-api-key", { "x-api-key": "someone-elses-secret" }],
    ["스킴이 다른 Authorization", { Authorization: `Basic ${TEST_KEY}` }],
  ])("연결된 키와 다른 자격 증명은 전송하지 않는다: %s", async (_name, headers) => {
    const fetchImpl = vi.fn();
    const guarded = createClaudeGuardedFetch({ apiKey: TEST_KEY, revision: getUserAiSnapshot().revision, fetchImpl });
    await expect(guarded(URL_MESSAGES, { method: "POST", body: "{}", headers })).rejects.toBeInstanceOf(ClaudeGuardError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("키가 비어 있으면 전송하지 않는다", async () => {
    const fetchImpl = vi.fn();
    const guarded = createClaudeGuardedFetch({ apiKey: "", revision: getUserAiSnapshot().revision, fetchImpl });
    await expect(guarded(URL_MESSAGES, { method: "POST", body: "{}" })).rejects.toBeInstanceOf(ClaudeGuardError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("전송 전에 연결 리비전이 달라졌으면 보내지 않는다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok());
    const guarded = createClaudeGuardedFetch({ apiKey: TEST_KEY, revision: getUserAiSnapshot().revision, fetchImpl });
    setUserAiConfiguration(structuredClone(EMPTY_AI_CONFIGURATION));
    await expect(guarded(URL_MESSAGES, { method: "POST", body: "{}" })).rejects.toThrow(/연결이 변경/u);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("응답을 받는 동안 설정이 바뀌면 결과를 쓰지 않는다", async () => {
    const fetchImpl = vi.fn(async () => {
      setUserAiConfiguration(structuredClone(EMPTY_AI_CONFIGURATION));
      return ok();
    });
    const guarded = createClaudeGuardedFetch({ apiKey: TEST_KEY, revision: getUserAiSnapshot().revision, fetchImpl });
    await expect(guarded(URL_MESSAGES, { method: "POST", body: "{}" })).rejects.toThrow();
  });

  it("응답이 상한을 넘으면 거절한다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(new Uint8Array(33)));
    const guarded = createClaudeGuardedFetch({
      apiKey: TEST_KEY,
      revision: getUserAiSnapshot().revision,
      fetchImpl,
      maxResponseBytes: 32,
    });
    await expect(guarded(URL_MESSAGES, { method: "POST", body: "{}" })).rejects.toThrow(/응답 용량/u);
  });

  it("보관함 잠금은 진행 중인 요청을 취소한다", async () => {
    const fetchImpl = vi.fn((_target: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    const guarded = createClaudeGuardedFetch({ apiKey: TEST_KEY, revision: getUserAiSnapshot().revision, fetchImpl });
    const pending = guarded(URL_MESSAGES, { method: "POST", body: "{}" });
    lockUserAi(false);
    await expect(pending).rejects.toThrow();
  });

  it("시간 제한을 넘기면 취소한다", async () => {
    const fetchImpl = vi.fn((_target: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError")), { once: true });
    }));
    const guarded = createClaudeGuardedFetch({
      apiKey: TEST_KEY,
      revision: getUserAiSnapshot().revision,
      fetchImpl,
      timeoutMs: 25,
    });
    await expect(guarded(URL_MESSAGES, { method: "POST", body: "{}" })).rejects.toThrow();
  });

  it("호출자의 취소 신호도 따른다", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    const guarded = createClaudeGuardedFetch({
      apiKey: TEST_KEY,
      revision: getUserAiSnapshot().revision,
      fetchImpl,
      signal: controller.signal,
    });
    await expect(guarded(URL_MESSAGES, { method: "POST", body: "{}" })).rejects.toThrow(/취소/u);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
