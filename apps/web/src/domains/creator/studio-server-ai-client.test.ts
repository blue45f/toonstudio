import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MANAGED_FREE_MAX_OUTPUT_TOKENS,
  resetFreeAiRuntimeBudget,
} from "@/shared/ai/free-ai-runtime-budget";
import { setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import { EMPTY_AI_CONFIGURATION } from "@/shared/ai/user-ai-types";

import {
  canonicalStudioServerAiOperationId,
  completeAutomaticFreeText,
  completeStudioServerText,
  getStudioServerAiStatus,
  parseStudioServerAiCompletion,
  parseStudioServerAiFailoverMetadata,
} from "./studio-server-ai-client";

const OPERATION_ID = "composition-00000000-0000-4000-8000-000000000001";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function urlOf(input: RequestInfo | URL): URL {
  return new URL(input instanceof Request ? input.url : String(input));
}

function configureFreeTextConnection(): void {
  setUserAiConfiguration({
    version: 1,
    connections: [{
      id: "test-free-text",
      label: "Test free text provider",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "user-secret-key",
      imageModel: "",
      textModel: "text-model",
      imageGenerationPath: "/images/generations",
      imageEditPath: "/images/edits",
      chatCompletionsPath: "/chat/completions",
      costPolicy: "provider-free-tier",
    }],
    assignments: {
      text: "test-free-text",
      image: null,
      inference: null,
      "three-d": null,
    },
  });
}

function configurePaidTextConnection(routing: { allowPaidFallback: boolean; preferPaidKeys: boolean }): void {
  setUserAiConfiguration({
    version: 1,
    connections: [{
      id: "test-paid-text",
      label: "Test paid text provider",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "user-paid-key",
      imageModel: "",
      textModel: "paid-text-model",
      imageGenerationPath: "/images/generations",
      imageEditPath: "/images/edits",
      chatCompletionsPath: "/chat/completions",
      costPolicy: "user-funded-byok",
    }],
    assignments: {
      text: "test-paid-text",
      image: null,
      inference: null,
      "three-d": null,
    },
    routing: { mode: "automatic", ...routing, managedPoolPriority: 50, serverProviderOrder: [] },
  });
}

function input() {
  return {
    task: "composition" as const,
    promptVersion: 1 as const,
    system: "구도를 제안하세요.",
    user: "옥상 장면",
    operationId: OPERATION_ID,
  };
}

describe("studio automatic free AI client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetFreeAiRuntimeBudget();
    setUserAiConfiguration(EMPTY_AI_CONFIGURATION);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetFreeAiRuntimeBudget();
    setUserAiConfiguration(EMPTY_AI_CONFIGURATION);
  });

  it("loads the shared free-pool status", async () => {
    const fetchMock = vi.fn(async (_request: RequestInfo | URL) => json({
      configured: true,
      provider: "gemini",
      model: "gemini-3.8-flash",
      providers: [],
      selection: {
        default: "auto",
        order: ["gemini", "groq", "openrouter"],
        fallback: true,
        fallbackPolicy: "free_quota_exhausted",
      },
      capabilities: ["composition"],
      requiresAuth: true,
      operatorFunded: false,
      freePool: true,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getStudioServerAiStatus()).resolves.toMatchObject({
      configured: true,
      provider: "gemini",
      freePool: true,
    });
    expect(urlOf(fetchMock.mock.calls[0]![0]).pathname).toBe("/api/studio-ai/status");
  });

  it("normalizes a partial rolling-deployment status without exposing undefined collections", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ configured: true })));

    await expect(getStudioServerAiStatus()).resolves.toMatchObject({
      configured: true,
      provider: "none",
      model: "",
      providers: [],
      capabilities: [],
      requiresAuth: true,
      selection: {
        default: "auto",
        order: [],
        fallback: false,
      },
    });
  });

  it("accepts only canonical bounded operation identifiers", () => {
    expect(canonicalStudioServerAiOperationId(OPERATION_ID)).toBe(OPERATION_ID);
    expect(canonicalStudioServerAiOperationId(`  ${OPERATION_ID}  `)).toBeNull();
    expect(canonicalStudioServerAiOperationId("a".repeat(16))).toBe("a".repeat(16));
    expect(canonicalStudioServerAiOperationId("a".repeat(128))).toBe("a".repeat(128));
    expect(canonicalStudioServerAiOperationId("a".repeat(15))).toBeNull();
    expect(canonicalStudioServerAiOperationId("a".repeat(129))).toBeNull();
    expect(canonicalStudioServerAiOperationId("작업-0000000000000000")).toBeNull();
  });

  it("uses the keyless ToonStudio AI route when no personal key is registered", async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      expect(urlOf(request).pathname).toBe("/api/studio-ai/chat");
      const req = request as Request;
      expect(req.headers.get("Idempotency-Key")).toBe(OPERATION_ID);
      const body = await req.clone().json() as Record<string, unknown>;
      expect(body).toMatchObject({ task: "composition", promptVersion: 1 });
      return json({
        content: "공용 무료 결과",
        provider: "gemini",
        model: "gemini-3.8-flash",
        requestId: "server-request-1",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeStudioServerText(input())).resolves.toEqual({
      ok: true,
      data: {
        content: "공용 무료 결과",
        provider: "gemini",
        model: "gemini-3.8-flash",
        requestId: "server-request-1",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("routes generic site text tools through the same automatic free chain", async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      const req = request as Request;
      expect(urlOf(req).pathname).toBe("/api/studio-ai/chat");
      expect(req.headers.get("Idempotency-Key")).toMatch(/^assistant-/u);
      await expect(req.clone().json()).resolves.toMatchObject({
        task: "assistant",
        promptVersion: 1,
        system: "system",
        user: "user",
      });
      return json({
        content: "범용 무료 결과",
        provider: "groq",
        model: "openai/gpt-oss-120b",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeAutomaticFreeText("system", "user")).resolves.toMatchObject({
      ok: true,
      data: {
        content: "범용 무료 결과",
        provider: "groq",
      },
    });
  });

  it("keeps login-required distinct from free quota exhaustion", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({
      code: "FREE_AI_LOGIN_REQUIRED",
      message: "자동 무료 AI를 사용하려면 로그인하세요.",
    }, 401)));

    await expect(completeStudioServerText(input())).resolves.toMatchObject({
      ok: false,
      code: "login_required",
      error: expect.stringMatching(/로그인.*무료 AI/u),
    });
  });

  it("uses a registered personal key first, without forcing login", async () => {
    configureFreeTextConnection();
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      if (urlOf(request).pathname === "/api/studio-ai/chat") {
        return json({ code: "FREE_AI_LOGIN_REQUIRED", message: "로그인 필요" }, 401);
      }
      return json({ choices: [{ message: { content: "개인 무료 결과" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeStudioServerText(input())).resolves.toMatchObject({
      ok: true,
      data: { content: "개인 무료 결과", provider: "user" },
    });
    // 등록한 키가 먼저라 서버 경로는 부르지 않는다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hands off to ToonStudio AI when the registered key's free quota is exhausted", async () => {
    configureFreeTextConnection();
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      if (urlOf(request).pathname === "/api/studio-ai/chat") {
        return json({ content: "ToonStudio AI 결과", provider: "anthropic", model: "claude-opus-5-5" });
      }
      return json({ error: { message: "rate limit", type: "insufficient_quota" } }, 429);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeStudioServerText(input())).resolves.toMatchObject({
      ok: true,
      data: { content: "ToonStudio AI 결과", provider: "anthropic" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("hands off to ToonStudio AI when every registered key is rejected at authentication", async () => {
    configureFreeTextConnection();
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      if (urlOf(request).pathname === "/api/studio-ai/chat") {
        return json({ content: "ToonStudio AI 결과", provider: "gemini", model: "gemini-3.8-flash" });
      }
      return json({ error: "invalid key" }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeStudioServerText(input())).resolves.toMatchObject({
      ok: true,
      data: { content: "ToonStudio AI 결과", provider: "gemini" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the personal key first in its exact request shape", async () => {
    configureFreeTextConnection();
    const fetchMock = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(request);
      expect(url.toString()).toBe("https://api.groq.com/openai/v1/chat/completions");
      const req = request instanceof Request ? request : new Request(request, init);
      expect(req.headers.get("Authorization")).toBe("Bearer user-secret-key");
      const body = await req.clone().json() as Record<string, unknown>;
      expect(body).toMatchObject({
        model: "text-model",
        max_tokens: MANAGED_FREE_MAX_OUTPUT_TOKENS,
      });
      return json({ choices: [{ message: { content: "개인 무료 결과" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeStudioServerText(input())).resolves.toEqual({
      ok: true,
      data: {
        content: "개인 무료 결과",
        provider: "user",
        model: "text-model",
        requestId: `byok:${OPERATION_ID}`,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not mislabel a personal-key authentication failure as free exhaustion", async () => {
    configureFreeTextConnection();
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      const url = urlOf(request);
      if (url.pathname === "/api/studio-ai/chat") {
        return json({ code: "FREE_AI_POOL_EXHAUSTED", message: "공용 무료 제한" }, 429);
      }
      return json({ error: "invalid key" }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeStudioServerText(input())).resolves.toMatchObject({
      ok: false,
      code: "http_error",
      error: expect.stringMatching(/인증/u),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a feature-unavailable message after every free route is exhausted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({
      code: "FREE_AI_POOL_EXHAUSTED",
      message: "소진",
    }, 429)));

    await expect(completeStudioServerText(input())).resolves.toMatchObject({
      ok: false,
      code: "free_exhausted",
      error: expect.stringMatching(/무료.*한도.*소진|무료 AI.*소진/u),
    });
  });

  it("does not retry or use another provider after an ambiguous network error", async () => {
    configureFreeTextConnection();
    const fetchMock = vi.fn(async () => {
      throw new TypeError("offline");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeStudioServerText(input())).resolves.toMatchObject({
      ok: false,
      code: "http_error",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps an earlier 'paid key after free routes' consent behind ToonStudio AI", async () => {
    configurePaidTextConnection({ allowPaidFallback: true, preferPaidKeys: false });
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      if (urlOf(request).pathname === "/api/studio-ai/chat") {
        return json({ content: "ToonStudio AI 결과", provider: "anthropic", model: "claude-opus-5-5" });
      }
      return json({ choices: [{ message: { content: "유료 키 결과" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeStudioServerText(input())).resolves.toMatchObject({
      ok: true,
      data: { content: "ToonStudio AI 결과", provider: "anthropic" },
    });
    // 유료 키는 부르지 않았다(서버 경로가 먼저다).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlOf(fetchMock.mock.calls[0]![0]).pathname).toBe("/api/studio-ai/chat");
  });

  it("uses the paid key as the fallback when ToonStudio AI cannot run", async () => {
    configurePaidTextConnection({ allowPaidFallback: true, preferPaidKeys: false });
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      if (urlOf(request).pathname === "/api/studio-ai/chat") {
        return json({ code: "PREMIUM_AI_UNAVAILABLE", message: "고성능 AI 사용 불가" }, 503);
      }
      return json({ choices: [{ message: { content: "유료 키 결과" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeStudioServerText(input())).resolves.toMatchObject({
      ok: true,
      data: { content: "유료 키 결과", provider: "user" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a paid key first only after the user chose 'my paid key first'", async () => {
    configurePaidTextConnection({ allowPaidFallback: true, preferPaidKeys: true });
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      if (urlOf(request).pathname === "/api/studio-ai/chat") {
        return json({ content: "ToonStudio AI 결과", provider: "anthropic", model: "claude-opus-5-5" });
      }
      return json({ choices: [{ message: { content: "유료 키 결과" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeStudioServerText(input())).resolves.toMatchObject({
      ok: true,
      data: { content: "유료 키 결과", provider: "user" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gets a complete answer from ToonStudio AI when the free key's answer hit the output cap", async () => {
    configureFreeTextConnection();
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      if (urlOf(request).pathname === "/api/studio-ai/chat") {
        return json({ content: "온전한 ToonStudio AI 결과", provider: "anthropic", model: "claude-opus-5-5" });
      }
      return json({ choices: [{ message: { content: "잘린 개인" }, finish_reason: "length" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeStudioServerText(input())).resolves.toMatchObject({
      ok: true,
      data: { content: "온전한 ToonStudio AI 결과", provider: "anthropic" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns the cut-off free-key answer when ToonStudio AI cannot run either", async () => {
    configureFreeTextConnection();
    vi.stubGlobal("fetch", vi.fn(async (request: RequestInfo | URL) => {
      if (urlOf(request).pathname === "/api/studio-ai/chat") {
        return json({ code: "FREE_AI_LOGIN_REQUIRED", message: "로그인 필요" }, 401);
      }
      return json({ choices: [{ message: { content: "잘린 개인" }, finish_reason: "length" }] });
    }));

    await expect(completeStudioServerText(input())).resolves.toMatchObject({
      ok: true,
      data: { content: "잘린 개인", provider: "user" },
    });
  });

  it("hands off to ToonStudio AI while a rejected key is cooling down instead of failing every request", async () => {
    configureFreeTextConnection();
    let serverCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (request: RequestInfo | URL) => {
      if (urlOf(request).pathname === "/api/studio-ai/chat") {
        serverCalls += 1;
        return json({ content: "ToonStudio AI 결과", provider: "anthropic", model: "claude-opus-5-5" });
      }
      return json({ error: "invalid key" }, 401);
    }));

    await expect(completeStudioServerText(input())).resolves.toMatchObject({ ok: true, data: { provider: "anthropic" } });
    // 두 번째 요청: 키는 인증 오류로 쉬는 중이라 보내지 않고 바로 ToonStudio AI로 간다.
    await expect(completeStudioServerText({ ...input(), operationId: "composition-00000000-0000-4000-8000-000000000002" }))
      .resolves.toMatchObject({ ok: true, data: { provider: "anthropic" } });
    expect(serverCalls).toBe(2);
  });

  it("keeps free-pool failover metadata allowlisted", () => {
    expect(parseStudioServerAiFailoverMetadata({
      attemptedProvider: "gemini",
      attemptedModel: "gemini-3.8-flash",
      actualProvider: "groq",
      actualModel: "openai/gpt-oss-120b",
      reason: "free_quota_exhausted",
      rawError: "secret",
    }, { provider: "groq", model: "openai/gpt-oss-120b" })).toEqual({
      attemptedProvider: "gemini",
      attemptedModel: "gemini-3.8-flash",
      actualProvider: "groq",
      actualModel: "openai/gpt-oss-120b",
      reason: "free_quota_exhausted",
    });
    expect(parseStudioServerAiCompletion({
      content: "완료",
      provider: "groq",
      model: "openai/gpt-oss-120b",
      usage: { promptTokens: 10, totalTokens: 12 },
      rawError: "private",
    })).toEqual({
      content: "완료",
      provider: "groq",
      model: "openai/gpt-oss-120b",
      usage: { promptTokens: 10, totalTokens: 12 },
    });
  });
});
