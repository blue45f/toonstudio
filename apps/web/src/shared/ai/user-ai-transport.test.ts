import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MANAGED_FREE_MAX_RESPONSE_BYTES,
  resetFreeAiRuntimeBudget,
} from "./free-ai-runtime-budget";
import { lockUserAi, setUserAiConfiguration } from "./user-ai-store";
import { completeUserAiTextDetailed, UserAiEmptyTruncatedError, userAiFetch } from "./user-ai-transport";
import type { UserAiConnection } from "./user-ai-types";

const managedConnection: UserAiConnection = {
  id: "openrouter-user",
  label: "OpenRouter free",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "user-key",
  textModel: "openrouter/free",
  imageModel: "",
  imageGenerationPath: "/images/generations",
  imageEditPath: "/images/edits",
  chatCompletionsPath: "/chat/completions",
  costPolicy: "openrouter-free",
};

beforeEach(() => {
  resetFreeAiRuntimeBudget();
  setUserAiConfiguration({
    version: 1,
    connections: [managedConnection],
    assignments: {
      text: managedConnection.id,
      image: null,
      inference: null,
      "three-d": null,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  lockUserAi(false);
  resetFreeAiRuntimeBudget();
});

describe("managed cloud AI transport", () => {
  it.each([200, 500])(
    "rejects an oversized %i response without retrying",
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(
        new Uint8Array(MANAGED_FREE_MAX_RESPONSE_BYTES + 1),
        { status },
      ));
      vi.stubGlobal("fetch", fetchMock);

      await expect(userAiFetch(
        "text",
        "/chat/completions",
        { messages: [{ role: "user", content: "hello" }] },
      )).rejects.toThrow(/응답 용량/u);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("sends the guarded free model and output limit to the provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ choices: [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await userAiFetch(
      "text",
      "/chat/completions",
      {
        model: "vendor/paid-model",
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 50_000,
        n: 9,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "openrouter/free",
      max_tokens: 1_024,
      n: 1,
    });
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("error");
  });

  it("reports a missing cloud route without sending a request", async () => {
    setUserAiConfiguration({
      version: 1,
      connections: [],
      assignments: { text: null, image: null, inference: null, "three-d": null },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeUserAiTextDetailed("system", "user")).rejects.toMatchObject({
      code: "not-configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps user-funded BYOK out of automatic fallback until explicitly enabled", async () => {
    const paid: UserAiConnection = {
      ...managedConnection,
      id: "paid-user",
      label: "Paid cloud",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "paid-key",
      textModel: "gpt-4.1-mini",
      costPolicy: "user-funded-byok",
      priority: 1,
    };
    const groq: UserAiConnection = {
      ...managedConnection,
      id: "groq-user",
      label: "Groq free",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "groq-user-key",
      textModel: "groq-free-model",
      costPolicy: "provider-free-tier",
      priority: 100,
    };
    setUserAiConfiguration({
      version: 1,
      connections: [paid, groq],
      assignments: { text: paid.id, image: null, inference: null, "three-d": null },
      routing: {
        mode: "automatic",
        allowPaidFallback: false,
        managedPoolPriority: 50,
        serverProviderOrder: ["gemini", "groq"],
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "Free route" } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeUserAiTextDetailed("system", "user")).resolves.toMatchObject({
      content: "Free route",
      connection: { id: "groq-user" },
      attemptedConnectionIds: ["groq-user"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("api.groq.com");
  });

  it("does not invoke a paid-only route when paid fallback is disabled", async () => {
    setUserAiConfiguration({
      version: 1,
      connections: [{
        ...managedConnection,
        id: "paid-only",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "paid-key",
        textModel: "gpt-4.1-mini",
        costPolicy: "user-funded-byok",
      }],
      assignments: { text: "paid-only", image: null, inference: null, "three-d": null },
      routing: {
        mode: "automatic",
        allowPaidFallback: false,
        managedPoolPriority: 50,
        serverProviderOrder: ["gemini", "groq"],
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeUserAiTextDetailed("system", "user")).rejects.toMatchObject({
      code: "not-configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses multiple keys and models in explicit priority order after safe authentication failure", async () => {
    setUserAiConfiguration({
      version: 1,
      connections: [{
        ...managedConnection,
        id: "groq-multi",
        label: "Groq multi route",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: "legacy-key",
        textModel: "legacy-model",
        costPolicy: "provider-free-tier",
        priority: 10,
        apiKeys: [
          { id: "backup", label: "Backup", apiKey: "key-b", enabled: true, priority: 20 },
          { id: "primary", label: "Primary", apiKey: "key-a", enabled: true, priority: 10 },
        ],
        models: [
          { id: "quality", label: "Quality", model: "model-quality", capability: "text", enabled: true, priority: 20 },
          { id: "fast", label: "Fast", model: "model-fast", capability: "text", enabled: true, priority: 10 },
        ],
      }],
      assignments: { text: "groq-multi", image: null, inference: null, "three-d": null },
      routing: {
        mode: "priority",
        allowPaidFallback: false,
        managedPoolPriority: 100,
        serverProviderOrder: ["groq", "gemini"],
      },
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("authorization");
      if (authorization === "Bearer key-a") {
        return new Response(JSON.stringify({ error: "invalid key" }), { status: 401 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Backup key result" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeUserAiTextDetailed("system", "user")).resolves.toMatchObject({
      content: "Backup key result",
      connection: {
        id: "groq-multi",
        apiKeyProfileId: "backup",
        modelProfileId: "fast",
      },
      attemptedRouteIds: [
        "groq-multi:fast:primary",
        "groq-multi:fast:backup",
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a revoked key that the provider answers with HTTP 400 (API_KEY_INVALID) as an authentication failure and moves on", async () => {
    setUserAiConfiguration({
      version: 1,
      connections: [{
        ...managedConnection,
        id: "gemini-multi",
        label: "Gemini multi key",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        apiKey: "legacy-key",
        textModel: "gemini-3.8-flash",
        costPolicy: "provider-free-tier",
        priority: 10,
        apiKeys: [
          { id: "revoked", label: "Revoked", apiKey: "key-revoked", enabled: true, priority: 10 },
          { id: "valid", label: "Valid", apiKey: "key-valid", enabled: true, priority: 20 },
        ],
      }],
      assignments: { text: "gemini-multi", image: null, inference: null, "three-d": null },
    });
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (new Headers(init?.headers).get("authorization") === "Bearer key-revoked") {
        return new Response(JSON.stringify([{
          error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] },
        }]), { status: 400 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: "valid key result" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    await expect(completeUserAiTextDetailed("system", "user")).resolves.toMatchObject({
      content: "valid key result",
      connection: { apiKeyProfileId: "valid" },
    });
  });

  it("keeps an ordinary HTTP 400 as a request error and reports an empty answer cut at the output cap separately", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400 })));
    await expect(completeUserAiTextDetailed("system", "user")).rejects.toMatchObject({ code: "http-error", status: 400 });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "" }, finish_reason: "length" }],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(completeUserAiTextDetailed("system", "user")).rejects.toBeInstanceOf(UserAiEmptyTruncatedError);
  });

  it("falls through free providers by quality only after quota exhaustion", async () => {
    const gemini: UserAiConnection = {
      ...managedConnection,
      id: "gemini-user",
      label: "Gemini free",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "gemini-user-key",
      textModel: "gemini-free-model",
      costPolicy: "provider-free-tier",
    };
    const groq: UserAiConnection = {
      ...managedConnection,
      id: "groq-user",
      label: "Groq free",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "groq-user-key",
      textModel: "groq-free-model",
      costPolicy: "provider-free-tier",
    };
    setUserAiConfiguration({
      version: 1,
      connections: [groq, gemini],
      assignments: { text: groq.id, image: null, inference: null, "three-d": null },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requestUrl = new URL(String(input));
      if (
        requestUrl.protocol === "https:"
        && requestUrl.hostname === "generativelanguage.googleapis.com"
      ) {
        return new Response(JSON.stringify({ error: "quota" }), { status: 429 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Groq fallback" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeUserAiTextDetailed("system", "user")).resolves.toMatchObject({
      content: "Groq fallback",
      connection: { id: "groq-user" },
      attemptedConnectionIds: ["gemini-user", "groq-user"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an ambiguous provider failure on another key or model", async () => {
    setUserAiConfiguration({
      version: 1,
      connections: [{
        ...managedConnection,
        apiKeys: [
          { id: "primary", label: "Primary", apiKey: "key-a", enabled: true, priority: 10 },
          { id: "backup", label: "Backup", apiKey: "key-b", enabled: true, priority: 20 },
        ],
        models: [
          { id: "fast", label: "Fast", model: "openrouter/free", capability: "text", enabled: true, priority: 10 },
        ],
      }],
      assignments: { text: managedConnection.id, image: null, inference: null, "three-d": null },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "provider unavailable" }),
      { status: 500, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeUserAiTextDetailed("system", "user")).rejects.toMatchObject({
      code: "http-error",
      status: 500,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("empty answers cut at the output cap", () => {
    const KEY_IDS = ["first", "second", "third"] as const;
    const geminiKeys = (count = 2): void => {
      setUserAiConfiguration({
        version: 1,
        connections: [{
          ...managedConnection,
          id: "gemini-multi",
          label: "Gemini multi key",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
          apiKey: "legacy-key",
          textModel: "gemini-3.8-flash",
          costPolicy: "provider-free-tier",
          apiKeys: KEY_IDS.slice(0, count).map((id, index) => ({
            id,
            label: id,
            apiKey: `key-${id}`,
            enabled: true,
            priority: (index + 1) * 10,
          })),
        }],
        assignments: { text: "gemini-multi", image: null, inference: null, "three-d": null },
      });
    };
    const answer = (content: string, finishReason = "stop") => new Response(
      JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    const failure = (status: number) => new Response(
      JSON.stringify({ error: { message: status === 413 ? "Request too large for model on tokens per minute (TPM)" : "unavailable" } }),
      { status, headers: { "content-type": "application/json" } },
    );
    const bearer = (init?: RequestInit) => new Headers(init?.headers).get("authorization");

    it("tries my next free key when one free key's answer came back empty at the output cap", async () => {
      geminiKeys();
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
        bearer(init) === "Bearer key-first" ? answer("", "length") : answer("second key result")
      ));
      vi.stubGlobal("fetch", fetchMock);

      await expect(completeUserAiTextDetailed("system", "user")).resolves.toMatchObject({
        content: "second key result",
        connection: { apiKeyProfileId: "second" },
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("reports the empty cut-off answer only after every free key was tried", async () => {
      geminiKeys();
      const fetchMock = vi.fn(async () => answer("", "length"));
      vi.stubGlobal("fetch", fetchMock);

      await expect(completeUserAiTextDetailed("system", "user")).rejects.toBeInstanceOf(UserAiEmptyTruncatedError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("keeps going when a later key rejects the request before inference with a 4xx (e.g. 413 over the per-minute token cap)", async () => {
      geminiKeys(3);
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const key = bearer(init);
        return key === "Bearer key-first" ? answer("", "length") : key === "Bearer key-second" ? failure(413) : answer("third key result");
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(completeUserAiTextDetailed("system", "user")).resolves.toMatchObject({
        content: "third key result",
        connection: { apiKeyProfileId: "third" },
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("still reports the empty cut-off answer (so the caller hands off) when every later key rejects the request with a 4xx", async () => {
      geminiKeys();
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
        bearer(init) === "Bearer key-first" ? answer("", "length") : failure(413)
      ));
      vi.stubGlobal("fetch", fetchMock);

      await expect(completeUserAiTextDetailed("system", "user")).rejects.toBeInstanceOf(UserAiEmptyTruncatedError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each([503, 408, 409])(
      "stops at HTTP %i after an empty answer, because the provider may already have received or run the request",
      async (status) => {
        geminiKeys(3);
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
          bearer(init) === "Bearer key-first" ? answer("", "length") : failure(status)
        ));
        vi.stubGlobal("fetch", fetchMock);

        await expect(completeUserAiTextDetailed("system", "user")).rejects.toMatchObject({ code: "http-error", status });
        expect(fetchMock).toHaveBeenCalledTimes(2);
      },
    );

    it("never sends the same request to a second paid key after a paid key already billed an empty answer, but still tries free keys", async () => {
      const paid = (id: string, priority: number, key: string): UserAiConnection => ({
        ...managedConnection,
        id,
        label: id,
        baseUrl: "https://api.openai.com/v1",
        apiKey: key,
        textModel: "paid-model",
        costPolicy: "user-funded-byok",
        paidAutoUse: true,
        priority,
      });
      setUserAiConfiguration({
        version: 1,
        connections: [
          paid("paid-a", 10, "key-paid-a"),
          paid("paid-b", 20, "key-paid-b"),
          { ...managedConnection, id: "free-c", baseUrl: "https://api.groq.com/openai/v1", apiKey: "key-free-c", costPolicy: "provider-free-tier", priority: 30 },
        ],
        assignments: { text: "paid-a", image: null, inference: null, "three-d": null },
        routing: { mode: "priority", allowPaidFallback: true, preferPaidKeys: true, managedPoolPriority: 50, serverProviderOrder: [] },
      });
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
        bearer(init) === "Bearer key-paid-a" ? answer("", "length") : answer(`answer from ${bearer(init) === "Bearer key-free-c" ? "free C" : "paid B"}`)
      ));
      vi.stubGlobal("fetch", fetchMock);

      await expect(completeUserAiTextDetailed("system", "user")).resolves.toMatchObject({
        content: "answer from free C",
        connection: { id: "free-c" },
      });
      const keysCalled = fetchMock.mock.calls.map(([, init]) => bearer(init));
      expect(keysCalled).toEqual(["Bearer key-paid-a", "Bearer key-free-c"]);
    });
  });

  it("pauses a revoked key answered with HTTP 400 for the same time as a 401, so it is not called on every request", async () => {
    setUserAiConfiguration({
      version: 1,
      connections: [{
        ...managedConnection,
        id: "gemini-revoked",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        apiKey: "key-revoked",
        textModel: "gemini-3.8-flash",
        costPolicy: "provider-free-tier",
      }],
      assignments: { text: "gemini-revoked", image: null, inference: null, "three-d": null },
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{
      error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] },
    }]), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeUserAiTextDetailed("system", "user")).rejects.toMatchObject({ code: "authentication" });
    // 두 번째 요청은 인증 대기 중이라 제공자에 보내지 않고 같은 인증 오류로 끝난다(다음 경로로 넘길 수 있다).
    await expect(completeUserAiTextDetailed("system", "user")).rejects.toMatchObject({ code: "authentication" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
