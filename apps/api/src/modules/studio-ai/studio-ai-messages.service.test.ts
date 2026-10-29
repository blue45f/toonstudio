import { HttpException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioAiMessagesSchema } from "./studio-ai-messages.dto";
import { InMemoryStudioAiPremiumBudgetStore } from "./studio-ai-premium-budget";
import { StudioAiService } from "./studio-ai.service";

import type { StudioAiAdmissionGate } from "./studio-ai-admission";
import type { StudioAiPremiumBudgetStore } from "./studio-ai-premium-budget";
import type { StudioAiUsageStore } from "./studio-ai-usage";

const originalEnv = { ...process.env };
const IDEMPOTENCY_KEY = "studio-ai-operation-0000000000000042";
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const dialogueInput = {
  task: "dialogue" as const,
  promptVersion: 1 as const,
  system: "웹툰 대사를 다듬어 주세요.",
  user: "주인공이 비를 맞으며 말한다",
};

function premiumMessage(text: string, extra: Record<string, unknown> = {}) {
  return {
    id: "msg_premium_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    stop_reason: "end_turn",
    content: [{ type: "thinking", thinking: "" }, { type: "text", text }],
    usage: { input_tokens: 40, output_tokens: 12 },
    ...extra,
  };
}

function freeCompletion(content: string, model = "gemini-3.8-flash") {
  return {
    id: "chatcmpl-free-1",
    model,
    choices: [{ finish_reason: "stop", message: { content } }],
    usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function createService(premiumBudget: StudioAiPremiumBudgetStore | null = new InMemoryStudioAiPremiumBudgetStore()) {
  const reserve = vi.fn().mockResolvedValue({ allowed: true, usageDay: "2026-10-29" });
  const finalize = vi.fn().mockResolvedValue(undefined);
  const store = { reserve, finalize } as unknown as StudioAiUsageStore;
  const admissionGate = {
    acquire: vi.fn().mockResolvedValue({
      status: "acquired",
      lease: { token: "lease-token-000000000000000000000001", fence: "3", expiresAt: new Date("2026-10-29T00:05:00.000Z") },
      receipt: { userKeyHash: new Uint8Array(32).fill(1), requestHash: new Uint8Array(32).fill(2), fence: "3" },
    }),
    renew: vi.fn().mockResolvedValue({ token: "lease-token-000000000000000000000001", fence: "3", expiresAt: new Date("2026-10-29T00:06:00.000Z") }),
    release: vi.fn().mockResolvedValue(true),
    markSent: vi.fn().mockResolvedValue(true),
    markSucceeded: vi.fn().mockResolvedValue(true),
    markAmbiguous: vi.fn().mockResolvedValue(true),
    abandonBeforeSend: vi.fn().mockResolvedValue(true),
    abandonSafeRejection: vi.fn().mockResolvedValue(true),
  } as unknown as StudioAiAdmissionGate;
  return {
    service: new StudioAiService(store, admissionGate, null, null, null, premiumBudget),
    reserve,
    finalize,
  };
}

function configureFreePool(): void {
  process.env.STUDIO_AI_FREE_POOL_ENABLED = "true";
  process.env.STUDIO_AI_FREE_PROVIDER_ORDER = "gemini,groq,mistral";
  process.env.STUDIO_AI_FREE_GEMINI_API_KEY = "gemini-free-test-key";
  process.env.STUDIO_AI_FREE_GEMINI_CONFIRMED = "true";
  process.env.STUDIO_AI_FREE_GROQ_API_KEY = "groq-free-test-key";
  process.env.STUDIO_AI_FREE_GROQ_CONFIRMED = "true";
  process.env.STUDIO_AI_FREE_MISTRAL_API_KEY = "mistral-free-test-key";
  process.env.STUDIO_AI_FREE_MISTRAL_CONFIRMED = "true";
}

function fetchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    headers: (init as RequestInit).headers as Record<string, string>,
    body: JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>,
  }));
}

describe("키 없는 사용자의 서버 AI: 운영 고성능 경로 → 성능 순 무료 풀", () => {
  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "test" };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("STUDIO_AI_") || key.startsWith("DEEPSEEK") || key.startsWith("ZAI_") || key.startsWith("OPENROUTER")) {
        delete process.env[key];
      }
    }
    configureFreePool();
    process.env.STUDIO_AI_ANTHROPIC_API_KEY = "premium-server-test-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("텍스트 작업은 운영 고성능 경로를 먼저 쓰고 샘플링 매개변수 없이 깊이·사고 여유분·서버 측 대체를 싣는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(premiumMessage("다듬은 대사")));
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const result = await service.complete("user-1", dialogueInput, IDEMPOTENCY_KEY);

    expect(result).toMatchObject({ content: "다듬은 대사", provider: "anthropic", model: "claude-opus-5-5" });
    const [call] = fetchCalls(fetchMock);
    expect(call?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call?.headers).toMatchObject({
      "x-api-key": "premium-server-test-key",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "server-side-fallback-2026-07-01",
    });
    expect(call?.body).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 1_200 + 4_000,
      output_config: { effort: "low" },
      fallbacks: "default",
    });
    expect(call?.body).not.toHaveProperty("temperature");
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      provider: "anthropic",
      task: "dialogue",
      status: "success",
      usage: { promptTokens: 40, completionTokens: 12, totalTokens: 52 },
    }));
  });

  it("고성능 경로가 혼잡(529)으로 추론 전에 거절하면 같은 요청을 무료 풀 1순위로 이어 보내고 출처를 남긴다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, 529))
      .mockResolvedValueOnce(jsonResponse(freeCompletion("무료 대사")));
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const result = await service.complete("user-1", dialogueInput, IDEMPOTENCY_KEY);

    expect(fetchCalls(fetchMock).map(({ url }) => url)).toEqual([
      "https://api.anthropic.com/v1/messages",
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    ]);
    expect(result).toMatchObject({
      content: "무료 대사",
      provider: "gemini",
      failover: {
        attemptedProvider: "anthropic",
        actualProvider: "gemini",
        reason: "premium_unavailable",
      },
    });
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ provider: "gemini", attemptCount: 2 }));
  });

  it("오늘 고성능 예산이 바닥났으면 운영 키를 부르지 않고 무료 풀로 바로 간다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(freeCompletion("무료 대사")));
    vi.stubGlobal("fetch", fetchMock);
    const budget = new InMemoryStudioAiPremiumBudgetStore();
    process.env.STUDIO_AI_PREMIUM_USER_DAILY_REQUEST_LIMIT = "1";
    budget.record("user-1", 10);
    const { service } = createService(budget);

    await expect(service.complete("user-1", dialogueInput, IDEMPOTENCY_KEY))
      .resolves.toMatchObject({ provider: "gemini" });
    expect(fetchCalls(fetchMock).map(({ url }) => url)).toEqual([
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    ]);
  });

  it("예산을 확인하지 못하면(저장소 오류·미주입) 운영 비용을 열지 않는다", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(freeCompletion("무료 대사")));
    vi.stubGlobal("fetch", fetchMock);
    const broken: StudioAiPremiumBudgetStore = { todayUsage: vi.fn().mockRejectedValue(new Error("db down")) };

    await expect(createService(broken).service.complete("user-1", dialogueInput, IDEMPOTENCY_KEY))
      .resolves.toMatchObject({ provider: "gemini" });
    await expect(createService(null).service.complete("user-2", dialogueInput, IDEMPOTENCY_KEY))
      .resolves.toMatchObject({ provider: "gemini" });
    expect(fetchCalls(fetchMock).every(({ url }) => !url.includes("anthropic"))).toBe(true);
  });

  it("고성능 경로의 거절 응답은 무료 풀로 넘기지 않고 안전 정책 오류로 끝낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(premiumMessage("", { stop_reason: "refusal" })));
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const error = await service.complete("user-1", dialogueInput, IDEMPOTENCY_KEY).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ provider: "anthropic", status: "content_filtered" }));
  });

  it("상태 응답은 고성능 경로를 맨 앞 순서로 알리고 운영자 부담임을 밝힌다(키는 싣지 않는다)", () => {
    const status = createService().service.status();
    expect(status).toMatchObject({
      configured: true,
      provider: "anthropic",
      operatorFunded: true,
      premium: { configured: true, automatic: true, model: "claude-opus-5-5" },
      selection: { fallbackPolicy: "premium_unavailable" },
    });
    expect(status.selection.order[0]).toBe("anthropic");
    expect(JSON.stringify(status)).not.toContain("premium-server-test-key");
  });
});

describe("보조 기능 서버 경로(/studio-ai/messages)", () => {
  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "test" };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("STUDIO_AI_")) delete process.env[key];
    }
    configureFreePool();
    process.env.STUDIO_AI_ANTHROPIC_API_KEY = "premium-server-test-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const imageRequest = StudioAiMessagesSchema.parse({
    model: "claude-sonnet-5-5",
    max_tokens: 8_000,
    system: [{ type: "text", text: "웹툰 아트 디렉터입니다.", cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: PNG_BASE64 } },
        { type: "text", text: "이 컷을 평가해 주세요." },
      ],
    }],
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] } },
    },
  });

  it("허용된 고성능 모델로 이미지·구조화 출력 요청을 보내고 Messages 형태로 돌려준다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(premiumMessage("{\"summary\":\"좋아요\"}", { model: "claude-sonnet-5-5" })));
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize, reserve } = createService();

    const result = await service.completeMessages("user-1", imageRequest, IDEMPOTENCY_KEY);

    expect(result).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      message: {
        type: "message",
        role: "assistant",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "{\"summary\":\"좋아요\"}" }],
      },
    });
    const [call] = fetchCalls(fetchMock);
    expect(call?.body).toMatchObject({ model: "claude-sonnet-5-5", output_config: imageRequest.output_config });
    expect((call?.body.system as Array<{ text: string }>)[0]?.text).toContain("ToonStudio");
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ provider: "anthropic", task: "assistant" }));
    expect(reserve.mock.calls[0]?.[0].reservedTokens).toBeGreaterThan(8_000 + 5_000);
  });

  it("허용 목록 밖의 모델을 요청하면 운영 기본 모델로 처리하고 실제 모델을 돌려준다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(premiumMessage("{\"summary\":\"좋아요\"}")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createService().service.completeMessages(
      "user-1",
      { ...imageRequest, model: "claude-fable-5-1" },
      IDEMPOTENCY_KEY,
    );
    expect(fetchCalls(fetchMock)[0]?.body.model).toBe("claude-opus-5-5");
    expect(result.model).toBe("claude-opus-5-5");
  });

  it("고성능 경로가 한도로 거절하면 이미지를 읽을 수 있는 무료 모델로 바꿔 보내고 코드 펜스를 벗겨 돌려준다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }, 429))
      .mockResolvedValueOnce(jsonResponse(freeCompletion("```json\n{\"summary\":\"무료\"}\n```")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createService().service.completeMessages("user-1", imageRequest, IDEMPOTENCY_KEY);

    const calls = fetchCalls(fetchMock);
    expect(calls[1]?.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(calls[1]?.body).toMatchObject({ model: "gemini-3.8-flash", response_format: { type: "json_object" } });
    expect(JSON.stringify(calls[1]?.body)).toContain("data:image/png;base64,");
    expect(result).toMatchObject({
      provider: "gemini",
      failover: { attemptedProvider: "anthropic", actualProvider: "gemini", reason: "premium_unavailable" },
      message: { content: [{ type: "text", text: "{\"summary\":\"무료\"}" }], stop_reason: "end_turn" },
    });
  });

  it("이미지 요청은 비전 모델이 없는 무료 제공자로 보내지 않는다", async () => {
    delete process.env.STUDIO_AI_ANTHROPIC_API_KEY;
    delete process.env.STUDIO_AI_FREE_GEMINI_API_KEY;
    delete process.env.STUDIO_AI_FREE_GROQ_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const error = await createService().service.completeMessages("user-1", imageRequest, IDEMPOTENCY_KEY)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getResponse()).toMatchObject({ code: "FREE_AI_POOL_UNAVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("무료 풀이 없을 때 고성능 경로 오늘 예산을 다 썼으면 '준비 안 됨'(503)이 아니라 한도 소진(429)으로 알린다", async () => {
    process.env.STUDIO_AI_FREE_POOL_ENABLED = "false";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const spent: StudioAiPremiumBudgetStore = {
      todayUsage: vi.fn().mockResolvedValue({ ledgerReady: true, userRequests: 30, globalRequests: 30, globalTokens: 0 }),
    };

    for (const run of [
      () => createService(spent).service.completeMessages("user-1", imageRequest, IDEMPOTENCY_KEY),
      () => createService(spent).service.complete("user-1", dialogueInput, IDEMPOTENCY_KEY),
    ]) {
      const error = await run().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).getResponse()).toMatchObject({ code: "FREE_AI_POOL_EXHAUSTED" });
    }
    expect(fetchMock).not.toHaveBeenCalled();

    // 원장이 준비되지 않아 닫은 것은 한도 소진이 아니라 그대로 "준비 안 됨"이다.
    const notReady = await createService(new InMemoryStudioAiPremiumBudgetStore(false)).service
      .completeMessages("user-1", imageRequest, IDEMPOTENCY_KEY)
      .catch((caught: unknown) => caught);
    expect((notReady as HttpException).getResponse()).toMatchObject({ code: "FREE_AI_POOL_UNAVAILABLE" });
  });

  it("무료 제공자가 안전 필터로 본문 없이 막으면 빈 응답(다시 시도)이 아니라 거절로 돌려준다", async () => {
    delete process.env.STUDIO_AI_ANTHROPIC_API_KEY;
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: "chatcmpl-filtered",
      model: "gemini-3.8-flash",
      choices: [{ finish_reason: "content_filter", message: { content: null } }],
      usage: { prompt_tokens: 30, completion_tokens: 0, total_tokens: 30 },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const result = await service.completeMessages("user-1", imageRequest, IDEMPOTENCY_KEY);
    expect(result.message.stop_reason).toBe("refusal");
    expect(result.message.content).toEqual([{ type: "text", text: "" }]);
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ provider: "gemini", status: "content_filtered" }));
  });

  it("서버 측 대체로 거절한 시도의 토큰까지 원장과 쿼터에 센다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(premiumMessage("{\"summary\":\"대체 답\"}", {
      model: "claude-opus-4-8",
      usage: {
        input_tokens: 40,
        output_tokens: 12,
        iterations: [
          { type: "message", model: "claude-opus-5-5", input_tokens: 40, output_tokens: 30 },
          { type: "fallback_message", model: "claude-opus-4-8", input_tokens: 40, output_tokens: 12 },
        ],
      },
    })));
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const result = await service.completeMessages("user-1", imageRequest, IDEMPOTENCY_KEY);
    // 브라우저에 주는 메시지는 답을 낸 시도의 사용량 그대로다.
    expect(result.message.usage).toMatchObject({ input_tokens: 40, output_tokens: 12 });
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      provider: "anthropic",
      usage: { promptTokens: 80, completionTokens: 42, totalTokens: 122 },
    }));
  });

  it("거절 응답은 Messages 형태 그대로 돌려줘 브라우저가 사유를 보여 주게 하고 원장에는 거절로 남긴다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(premiumMessage("", { stop_reason: "refusal" })));
    vi.stubGlobal("fetch", fetchMock);
    const { service, finalize } = createService();

    const result = await service.completeMessages("user-1", imageRequest, IDEMPOTENCY_KEY);
    expect(result.message.stop_reason).toBe("refusal");
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ status: "content_filtered" }));
  });
});

describe("보조 기능 요청 계약", () => {
  it("도구·샘플링 매개변수·assistant 시작·과도한 이미지는 받지 않는다", () => {
    const base = { max_tokens: 100, messages: [{ role: "user", content: "안녕" }] };
    expect(StudioAiMessagesSchema.safeParse(base).success).toBe(true);
    expect(StudioAiMessagesSchema.safeParse({ ...base, temperature: 0.5 }).success).toBe(false);
    expect(StudioAiMessagesSchema.safeParse({ ...base, tools: [] }).success).toBe(false);
    expect(StudioAiMessagesSchema.safeParse({ ...base, max_tokens: 64_000 }).success).toBe(false);
    expect(StudioAiMessagesSchema.safeParse({
      ...base,
      messages: [{ role: "assistant", content: "먼저" }, { role: "user", content: "안녕" }],
    }).success).toBe(false);
    const image = { type: "image", source: { type: "base64", media_type: "image/png", data: PNG_BASE64 } };
    expect(StudioAiMessagesSchema.safeParse({
      ...base,
      messages: [{ role: "user", content: [image, image, image, image, image] }],
    }).success).toBe(false);
    expect(StudioAiMessagesSchema.safeParse({
      ...base,
      messages: [{ role: "user", content: [{ ...image, source: { ...image.source, data: "not base64!" } }] }],
    }).success).toBe(false);
  });
});
