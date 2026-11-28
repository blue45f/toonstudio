import { EventEmitter } from "node:events";

import { HttpException, UnauthorizedException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isOpenAiFreeShareModel,
  StudioOpenAiRateLimiter,
} from "./openai-assist/studio-openai-guardrails";
import {
  buildModeSystemInstruction,
  MODE_JSON_SCHEMAS,
} from "./openai-assist/studio-openai-prompt-catalog";
import { StudioFreeAiZeroBillRouter } from "./studio-free-ai-zero-bill-router";
import {
  StudioFreeAiController,
  StudioOpenAiCreativeAssistController,
} from "./studio-openai-creative-assist.controller";
import {
  StudioOpenAiCreativeAssistRequestSchema,
  validateAssistModeStructuredOutput,
} from "./studio-openai-creative-assist.dto";
import {
  redactCreatorSensitiveText,
  resolveStudioOpenAiCreativeConfig,
  StudioOpenAiCreativeAssistService,
} from "./studio-openai-creative-assist.service";

import type { StudioOpenAiCreativeAssistDto } from "./studio-openai-creative-assist.dto";
import type { Request, Response } from "express";

function createRequestResponseHarness(headers: Record<string, string> = {}) {
  const request = new EventEmitter() as EventEmitter & {
    aborted: boolean;
    complete: boolean;
    destroyed: boolean;
    headers: Record<string, string>;
    socket: { remoteAddress: string };
    header: (name: string) => string | undefined;
  };
  request.aborted = false;
  request.complete = true;
  request.destroyed = false;
  request.headers = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  request.socket = { remoteAddress: "203.0.113.10" };
  request.header = (name: string) => request.headers[name.toLowerCase()];

  const response = new EventEmitter() as EventEmitter & {
    writableEnded: boolean;
    destroyed: boolean;
  };
  response.writableEnded = false;
  response.destroyed = false;

  return {
    request: request as unknown as Request,
    response: response as unknown as Response,
    requestEmitter: request,
    responseEmitter: response,
  };
}

function createDialogueResponse(): Response {
  return new Response(JSON.stringify({
    choices: [{
      finish_reason: "stop",
      message: {
        content: JSON.stringify({
          readabilityNote: "의미와 말투를 유지한 짧은 대안입니다.",
          balloons: [
            { toneLabel: "구어체", line: "많이 기다렸지?", subBubble: "", reason: "상대 반응을 묻습니다." },
            { toneLabel: "핵심형", line: "늦어서 미안해.", subBubble: "", reason: "사과를 먼저 전합니다." },
          ],
        }),
      },
    }],
  }), { status: 200 });
}

function createStalledBodyFetch(status: number) {
  return vi.fn<typeof fetch>(async (_url, init) => {
    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        const abortBody = () => stream.error(new Error("모의 응답 본문 중단"));
        if (signal?.aborted) abortBody();
        else signal?.addEventListener("abort", abortBody, { once: true });
      },
    });
    return new Response(body, { status });
  });
}

describe("StudioOpenAiCreativeAssistService & Controller", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reports unconfigured status safely without leaking keys when OPENAI_API_KEY is absent", () => {
    const service = new StudioOpenAiCreativeAssistService();
    const status = service.status({});

    expect(status.configured).toBe(false);
    expect(status.keyLocation).toBe("server-env-only");
    expect(status.storeData).toBe(false);
    expect(status.piiMasking).toBe(true);
    expect(status.autoBillingDisabled).toBeNull();
    expect(status.modelConfigurationError).toBeNull();
    expect(status.modes.map((m) => m.id)).toEqual([
      "idea-remix",
      "script-to-cuts",
      "dialogue-polish",
      "export-preflight-coach",
      "character-bible-forge",
      "continuity-plot-audit",
      "bg3d-camera-blocking",
      "color-mood-director",
      "sfx-onomatopoeia-lab",
      "photoshop-fx-recipe",
      "scroll-pacing-auditor",
      "thumbnail-hook-optimizer",
      "localization-glossary-check",
      "mcp-workflow-macro",
    ]);
    expect(JSON.stringify(status)).not.toContain("sk-");
  });

  it("never exposes OPENAI_API_KEY or organization IDs in status even when configured", () => {
    const fakeKey = ["sk", "proj", "unitTestOnlyFakeValue123456"].join("-");
    const service = new StudioOpenAiCreativeAssistService();
    const status = service.status({
      OPENAI_API_KEY: fakeKey,
      OPENAI_MODEL: "gpt-4.1-mini",
      OPENAI_ORG_ID: "org-unitTestOrg99",
      OPENAI_PROJECT_ID: "proj_unitTestProj88",
    });

    expect(status.configured).toBe(true);
    expect(status.model).toBe("gpt-4.1-mini");
    expect(status.autoBillingDisabled).toBeNull();
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(fakeKey);
    expect(serialized).not.toContain("org-unitTestOrg99");
    expect(serialized).not.toContain("proj_unitTestProj88");
  });

  it("falls back to default model if an unapproved model string is supplied", () => {
    const config = resolveStudioOpenAiCreativeConfig({
      OPENAI_API_KEY: "test-placeholder",
      OPENAI_MODEL: "gpt-expensive-unlisted",
    });
    expect(config.model).toBe("gpt-4o-mini");
    expect(config.modelConfigurationError).toBeNull();
  });

  it.each(["gpt-4.1-nano", "gpt-4.1-nano-2025-04-14", " GPT-4.1-NANO "])(
    "종료 모델 %s는 기본 모델로 바꾸지 않고 호출과 쿼터 소비 전에 차단한다",
    async (model) => {
      const service = new StudioOpenAiCreativeAssistService();
      const env = {
        OPENAI_API_KEY: "test-placeholder",
        OPENAI_MODEL: model,
        STUDIO_OPENAI_DAILY_REQUEST_LIMIT: "1",
      };
      const status = service.status(env);
      expect(status.configured).toBe(true);
      expect(status.model).toBe(model.trim().toLowerCase());
      expect(status.modelConfigurationError).toBe("retired");
      expect(status.setupNoticeKo).toContain("서비스가 종료");

      const fetchMock = vi.fn<typeof fetch>(async () => createDialogueResponse());
      const input = { mode: "dialogue-polish", inputText: "늦어서 미안해. 많이 기다렸지?" } as const;
      await expect(service.assist("user:retired-model", input, { env, fetchImpl: fetchMock }))
        .rejects.toMatchObject({ status: 503, response: { code: "OPENAI_MODEL_RETIRED" } });
      expect(fetchMock).not.toHaveBeenCalled();

      const result = await service.assist("user:retired-model", input, {
        env: { ...env, OPENAI_MODEL: "gpt-4o-mini" },
        fetchImpl: fetchMock,
      });
      expect(result.quota.remainingDaily).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("masks personal data (email, phone, +82 phone, foreign RRN, unspaced card, tokens) before upstream send", () => {
    const fakeSecret = ["sk", "live", "1234567890abcdefghij"].join("-");
    const fakeGhToken = ["ghp", "1234567890abcdefghijklmnop"].join("_");
    const sample = [
      "연락처 010-1234-5678",
      "국제 +82-10-9876-5432",
      "메일 creator@example.com",
      "외국인번호 010203-5123456",
      "카드 1234567812345678",
      `토큰 ${fakeSecret}`,
      `깃허브 ${fakeGhToken}`,
    ].join(", ");
    const result = redactCreatorSensitiveText(sample);

    expect(result.redactedCount).toBe(7);
    expect(result.sanitizedText).not.toContain("010-1234-5678");
    expect(result.sanitizedText).not.toContain("9876-5432");
    expect(result.sanitizedText).not.toContain("creator@example.com");
    expect(result.sanitizedText).not.toContain("010203-5123456");
    expect(result.sanitizedText).not.toContain("1234567812345678");
    expect(result.sanitizedText).not.toContain(fakeSecret);
    expect(result.sanitizedText).not.toContain(fakeGhToken);
    expect(result.sanitizedText).toContain("[연락처 비공개]");
    expect(result.sanitizedText).toContain("[이메일 비공개]");
    expect(result.sanitizedText).toContain("[카드번호 비공개]");
  });

  it("returns 503 with clear Korean guidance when OPENAI_API_KEY is missing", async () => {
    const service = new StudioOpenAiCreativeAssistService();
    await expect(
      service.assist(
        "user:creator-1",
        {
          mode: "idea-remix",
          inputText: "비 오는 날 편의점에서 마주친 전학 온 친구",
        },
        { env: {} },
      ),
    ).rejects.toMatchObject({
      status: 503,
    });
  });

  it("sends store:false and strict JSON schema to OpenAI and parses script-to-cuts output", async () => {
    const service = new StudioOpenAiCreativeAssistService();
    const fakeKey = ["test", "key", "not", "real"].join("-");
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, unknown> = {};

    const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          model: "gpt-4o-mini-2026",
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  episodeGoal: "주인공이 우산을 건네며 첫 대화를 여는 도입 장면",
                  pacingTip: "1컷과 2컷 사이에 빗소리 여백을 넓혀 정적을 강조하세요.",
                  cuts: [
                    {
                      cutNumber: 1,
                      beatKind: "setup",
                      shotType: "익스트림 롱샷 · 처마 아래 시점",
                      visualAction: "편의점 처마 밑에서 빗줄기를 바라보는 주인공의 뒷모습",
                      dialogue: "오늘도 우산을 안 챙겼네.",
                      scrollGapHint: "중간 여백(240px)으로 시선 멈춤 유도",
                    },
                    {
                      cutNumber: 2,
                      beatKind: "reveal",
                      shotType: "미디엄 클로즈업 · 측면",
                      visualAction: "옆에서 노란 우산이 쑥 들어오며 시선이 마주친다",
                      dialogue: "이거 같이 쓸래?",
                      scrollGapHint: "넓은 여백(420px)으로 반전 호흡 강조",
                    },
                  ],
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 180,
            completion_tokens: 210,
            total_tokens: 390,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const response = await service.assist(
      "user:creator-2",
      {
        mode: "script-to-cuts",
        inputText: "비 오는 편의점 앞(문의: test@studio.kr)에서 우산을 같이 쓰는 첫 만남",
        projectTitle: "장마철 첫인사",
        targetPlatform: "vertical-webtoon",
      },
      {
        env: { OPENAI_API_KEY: fakeKey },
        fetchImpl: mockFetch,
      },
    );

    expect(capturedUrl).toBe("https://api.openai.com/v1/chat/completions");
    expect(capturedHeaders.Authorization).toBe(`Bearer ${fakeKey}`);
    expect(capturedBody.store).toBe(false);
    expect(capturedBody.max_completion_tokens).toBe(1_400);
    expect(capturedBody.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "toonstudio_script_to_cuts", strict: true },
    });
    expect(JSON.stringify(capturedBody)).not.toContain("test@studio.kr");
    expect(JSON.stringify(capturedBody)).toContain("[이메일 비공개]");

    expect(response.provider).toBe("openai");
    expect(response.privacy.piiRedactedCount).toBe(1);
    expect(response.result.mode).toBe("script-to-cuts");
    if (response.result.mode === "script-to-cuts") {
      expect(response.result.data.cuts).toHaveLength(2);
      expect(response.result.data.cuts[0]?.dialogue).toBe("오늘도 우산을 안 챙겼네.");
    }
  });

  it("distinguishes OpenAI quota exhaustion without auto-charging and enforces daily caps", async () => {
    const service = new StudioOpenAiCreativeAssistService();
    const quotaFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: { code: "insufficient_quota", message: "Quota exceeded" },
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    try {
      await service.assist(
        "user:quota-test",
        { mode: "dialogue-polish", inputText: "내가 오늘 왜 늦었냐면 버스를 놓쳐서 그래." },
        { env: { OPENAI_API_KEY: "placeholder-key" }, fetchImpl: quotaFetch },
      );
      expect.unreachable("should throw 429");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(429);
      expect(JSON.stringify(httpError.getResponse())).toContain("유료 충전을 진행하지 않았습니다");
    }

    let upstreamCalls = 0;
    const okFetch = vi.fn(async () => {
      upstreamCalls += 1;
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  readabilityNote: "한 줄 호흡으로 줄였습니다.",
                  balloons: [
                    {
                      toneLabel: "구어체",
                      line: "미안, 눈앞에서 버스를 놓쳤어.",
                      subBubble: "",
                      reason: "말풍선 두 줄 이내로 압축",
                    },
                    {
                      toneLabel: "핵심형",
                      line: "버스 놓쳤어. 많이 기다렸지?",
                      subBubble: "",
                      reason: "상대 반응을 바로 이끄는 대사",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    await service.assist(
      "user:daily-cap",
      { mode: "dialogue-polish", inputText: "내가 오늘 왜 늦었냐면 버스를 놓쳐서 그래." },
      {
        env: {
          OPENAI_API_KEY: "placeholder-key",
          STUDIO_OPENAI_DAILY_REQUEST_LIMIT: "1",
        },
        fetchImpl: okFetch,
      },
    );
    await expect(
      service.assist(
        "user:daily-cap",
        { mode: "dialogue-polish", inputText: "두 번째 요청" },
        {
          env: {
            OPENAI_API_KEY: "placeholder-key",
            STUDIO_OPENAI_DAILY_REQUEST_LIMIT: "1",
          },
          fetchImpl: okFetch,
        },
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(upstreamCalls).toBe(1);
  });

  it.each([
    ["credit_balance_exhausted", "OPENAI_QUOTA_EXHAUSTED"],
    ["insufficient_quota", "OPENAI_QUOTA_EXHAUSTED"],
    ["billing_hard_limit_reached", "OPENAI_QUOTA_EXHAUSTED"],
    ["project_spend_limit_exceeded", "OPENAI_SPEND_LIMIT_REACHED"],
    ["organization_spend_limit_exceeded", "OPENAI_SPEND_LIMIT_REACHED"],
    ["rate_limit_exceeded", "OPENAI_UPSTREAM_RATE_LIMITED"],
  ])("OpenAI 429 %s를 %s로 구분하고 재호출하지 않는다", async (upstreamCode, expectedCode) => {
    const service = new StudioOpenAiCreativeAssistService();
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: { code: upstreamCode } }),
      { status: 429 },
    ));
    await expect(service.assist("user:billing-code", {
      mode: "dialogue-polish",
      inputText: "잠깐 이야기할 수 있을까?",
    }, { env: { OPENAI_API_KEY: "test-placeholder" }, fetchImpl: fetchMock }))
      .rejects.toMatchObject({ status: 429, response: { code: expectedCode } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([200, 429])("HTTP %s 헤더 수신 뒤 본문이 지연되어도 timeout을 유지한다", async (status) => {
    vi.useFakeTimers();
    const service = new StudioOpenAiCreativeAssistService();
    const fetchMock = createStalledBodyFetch(status);
    const signal = new AbortController().signal;
    const removeListener = vi.spyOn(signal, "removeEventListener");
    const pending = service.assist("user:body-timeout", {
      mode: "dialogue-polish",
      inputText: "오늘은 나랑 같이 가자.",
    }, {
      env: { OPENAI_API_KEY: "test-placeholder", STUDIO_OPENAI_TIMEOUT_MS: "5000" },
      fetchImpl: fetchMock,
      signal,
    });
    const assertion = expect(pending).rejects.toMatchObject({
      status: 504,
      response: { code: "OPENAI_TIMEOUT" },
    });
    await vi.advanceTimersByTimeAsync(5_001);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([200, 429])("HTTP %s 본문을 읽는 중 사용자 취소를 499로 보존한다", async (status) => {
    vi.useFakeTimers();
    const service = new StudioOpenAiCreativeAssistService();
    const fetchMock = createStalledBodyFetch(status);
    const controller = new AbortController();
    const pending = service.assist("user:body-abort", {
      mode: "dialogue-polish",
      inputText: "오늘은 나랑 같이 가자.",
    }, {
      env: { OPENAI_API_KEY: "test-placeholder" },
      fetchImpl: fetchMock,
      signal: controller.signal,
    });
    const assertion = expect(pending).rejects.toMatchObject({
      status: 499,
      response: { code: "CLIENT_ABORTED" },
    });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["not-json", "OPENAI_INVALID_JSON", 502],
    ["null", "OPENAI_INVALID_JSON", 502],
    [JSON.stringify({ choices: [{ message: { refusal: "정책상 거절" } }] }), "OPENAI_SAFETY_REFUSAL", 422],
    [JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "{" } }] }), "OPENAI_OUTPUT_TRUNCATED", 502],
    [JSON.stringify({ choices: [] }), "OPENAI_EMPTY_RESPONSE", 502],
    [JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), "OPENAI_MALFORMED_STRUCTURED_JSON", 502],
    [JSON.stringify({ choices: [{ message: { content: "{}" } }] }), "OPENAI_SCHEMA_MISMATCH", 502],
  ] as const)("완료된 응답 %s의 오류를 %s로 보존한다", async (body, code, status) => {
    vi.useFakeTimers();
    const service = new StudioOpenAiCreativeAssistService();
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(body, { status: 200 }));
    await expect(service.assist("user:response-errors", {
      mode: "dialogue-polish",
      inputText: "여기서 잠깐 기다릴게.",
    }, { env: { OPENAI_API_KEY: "test-placeholder" }, fetchImpl: fetchMock }))
      .rejects.toMatchObject({ status, response: { code } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases rate-limiter slot when request is aborted or fails with transient error so retries succeed", async () => {
    const service = new StudioOpenAiCreativeAssistService();
    const env = {
      OPENAI_API_KEY: "placeholder-key",
      STUDIO_OPENAI_DAILY_REQUEST_LIMIT: "1",
    };

    const failingFetch = vi.fn(async () => {
      throw new Error("socket hang up");
    }) as unknown as typeof fetch;

    await expect(
      service.assist(
        "user:retry-safe",
        { mode: "export-preflight-coach", inputText: "1화 마감 점검 문구 테스트" },
        { env, fetchImpl: failingFetch },
      ),
    ).rejects.toMatchObject({ status: 502 });

    const successFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  readinessSummary: "출고 준비가 안정적입니다.",
                  episodeBlurbSuggestion: "빗속 정류장, 노란 우산 하나가 바꾼 첫 만남.",
                  checks: [
                    { category: "말풍선 밀도", severity: "pass", detail: "두 줄 이내로 안정적입니다." },
                    { category: "도입 훅", severity: "tip", detail: "첫 컷 여백을 조금 넓혀 보세요." },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const retried = await service.assist(
      "user:retry-safe",
      { mode: "export-preflight-coach", inputText: "1화 마감 점검 문구 테스트" },
      { env, fetchImpl: successFetch },
    );
    expect(retried.result.mode).toBe("export-preflight-coach");
    expect(retried.quota.remainingDaily).toBe(0);
  });

  it("validates DTO input bounds with concrete Korean messages", () => {
    const emptyCheck = StudioOpenAiCreativeAssistRequestSchema.safeParse({
      mode: "idea-remix",
      inputText: " ",
    });
    expect(emptyCheck.success).toBe(false);
  });

  it("bounds rate-limiter memory with LRU eviction and sweeps expired UTC day buckets", () => {
    const limiter = new StudioOpenAiRateLimiter(4);
    const limits = {
      burstPerMinute: 5,
      hourlyRequests: 20,
      dailyRequests: 5,
      globalDailyRequests: 100,
    };
    const dayOne = Date.parse("2026-11-10T10:00:00.000Z");

    for (let i = 0; i < 6; i += 1) {
      limiter.consume(`user:actor-${i}`, limits, dayOne);
    }
    expect(limiter.trackedActorCount).toBe(4);

    const dayTwo = Date.parse("2026-11-11T00:05:00.000Z");
    limiter.consume("user:fresh-day", limits, dayTwo);
    expect(limiter.trackedActorCount).toBe(1);
  });

  it("requires authenticated user in controller and propagates client disconnect abort", async () => {
    const assistSpy = vi.fn(
      async (_actor: string, _body: StudioOpenAiCreativeAssistDto, opts?: { signal?: AbortSignal }) => {
        return { abortedOnStart: Boolean(opts?.signal?.aborted) };
      },
    );
    const mockService = {
      status: vi.fn(() => ({ configured: false })),
      assist: assistSpy,
    } as unknown as StudioOpenAiCreativeAssistService;

    const controller = new StudioOpenAiCreativeAssistController(mockService);
    const spoofedHarness = createRequestResponseHarness({
      "x-toonstudio-client-ip": "198.51.100.99",
    });
    const body: StudioOpenAiCreativeAssistDto = {
      mode: "idea-remix",
      inputText: "지하철 미스터리 웹툰 소재",
    };

    await expect(
      controller.assist(undefined, body, spoofedHarness.request, spoofedHarness.response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(assistSpy).not.toHaveBeenCalled();

    const abortedHarness = createRequestResponseHarness();
    abortedHarness.requestEmitter.aborted = true;
    const result = await controller.assist(
      "creator-77",
      body,
      abortedHarness.request,
      abortedHarness.response,
    );
    expect(assistSpy).toHaveBeenCalledTimes(1);
    expect(assistSpy.mock.calls[0]?.[0]).toBe("user:creator-77");
    expect(result).toEqual({ abortedOnStart: true });
    expect(abortedHarness.requestEmitter.listenerCount("aborted")).toBe(0);
    expect(abortedHarness.responseEmitter.listenerCount("close")).toBe(0);

    // Node 18+/24 body-parser가 POST 본문을 끝까지 읽으면 request.complete=true, request.destroyed=true가 되며
    // 이는 정상 요청이므로 AbortSignal이 중단되면 안 된다.
    const parsedPostHarness = createRequestResponseHarness();
    parsedPostHarness.requestEmitter.complete = true;
    parsedPostHarness.requestEmitter.destroyed = true;
    const parsedPostResult = await controller.assist(
      "creator-77",
      body,
      parsedPostHarness.request,
      parsedPostHarness.response,
    );
    expect(parsedPostResult).toEqual({ abortedOnStart: false });

    // 응답 소켓이 전송 완료 전에 파기되면 즉시 중단한다.
    const responseDestroyedHarness = createRequestResponseHarness();
    responseDestroyedHarness.responseEmitter.destroyed = true;
    const responseDestroyedResult = await controller.assist(
      "creator-77",
      body,
      responseDestroyedHarness.request,
      responseDestroyedHarness.response,
    );
    expect(responseDestroyedResult).toEqual({ abortedOnStart: true });
  });

  it("exposes GET /api/studio/ai/free-quota-status, modes(14), and zero-bill cascade creative-assist safely", async () => {
    const service = new StudioOpenAiCreativeAssistService();
    const freeController = new StudioFreeAiController(service);

    const quotaStatus = freeController.freeQuotaStatus();
    expect(quotaStatus.guaranteedZeroCostUsd).toBe(0);
    expect(quotaStatus.providerBilledUsd).toBeNull();
    expect(quotaStatus.guaranteedZeroCostLabel).toBe("$0.00");
    expect(quotaStatus.paidBillingBlocked).toBe(true);
    expect(quotaStatus.summary.localFallbackReady).toBe(true);

    const modesPayload = freeController.modes();
    expect(modesPayload.totalModes).toBe(14);
    expect(modesPayload.costUsdGuaranteed).toBe("$0.00");

    const outbound = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("외부 호출 차단"));
    for (const { id: mode } of modesPayload.modes) {
      const body = StudioOpenAiCreativeAssistRequestSchema.parse({
        mode,
        projectTitle: "옥상 우산",
        genreOrTone: "잔잔한 일상",
        inputText: mode === "mcp-workflow-macro"
          ? "담당자 writer@example.test\n새 캔버스 920×1440px를 만들고 출고 점검"
          : "담당자 writer@example.test\n1컷. 서리가 옥상 문을 연다.\n2컷. 민서: 우산은 여기 두고 갈게.",
      });
      const { request, response } = createRequestResponseHarness();
      const guestResult = await freeController.creativeAssist(undefined, body, request, response);
      const { result } = guestResult;
      expect(guestResult.provider).toBe("local-zero-cost-fallback");
      expect(guestResult.costGuaranteedZeroUsd).toBe(0);
      expect(guestResult.usage.totalTokens).toBe(0);
      expect(guestResult.privacy.piiRedactedCount).toBe(1);
      expect(JSON.stringify(result)).not.toContain("writer@example.test");
      expect(result.mode).toBe(mode);
      expect(validateAssistModeStructuredOutput(mode, result.data)).toEqual(result);
      if (result.mode === "export-preflight-coach") {
        expect(result.data.readinessSummary).toContain("체크리스트");
        expect(result.data.checks.every((check) => check.severity === "tip")).toBe(true);
      }
      if (result.mode === "mcp-workflow-macro") {
        expect(result.data.zeroCostSafe).toBe(true);
        expect(result.data.steps.length).toBeGreaterThanOrEqual(2);
      }
    }
    expect(outbound).not.toHaveBeenCalled();
  });

  it("출력 검증에서 실패해도 공유 모델에서 보고한 토큰만 해당 할당량에 반영한다", async () => {
    const service = new StudioOpenAiCreativeAssistService();
    const response = () => Response.json({
      choices: [{ finish_reason: "length", message: { content: "{" } }],
      usage: { total_tokens: 100 },
    });
    for (const model of ["gpt-4o-mini", "gpt-5.5"]) {
      await expect(service.assist("user:usage", { mode: "dialogue-polish", inputText: "대사를 정리해 주세요." },
        { env: { OPENAI_API_KEY: "test-openai", OPENAI_MODEL: model }, fetchImpl: async () => response() },
      )).rejects.toThrow();
    }
    expect(service.freeQuotaStatus({}).providers[0]).toMatchObject({ usedRequests: 1, usedTokens: 100 });
  });

  it("마스킹으로 최대 길이 제목과 장르가 늘어나도 14개 로컬 모드 모두 결과를 반환한다", async () => {
    const service = new StudioOpenAiCreativeAssistService();
    for (const { id: mode } of service.listModes().modes) {
      const input = StudioOpenAiCreativeAssistRequestSchema.parse({
        mode, inputText: "서리가 옥상 문을 연다.", projectTitle: "@abc ".repeat(24), genreOrTone: "@abc ".repeat(16),
      });
      const result = await service.assistWithZeroBillCascade(null, input, { env: {} });
      expect(result.result.mode).toBe(mode);
      expect(result.privacy.piiRedactedCount).toBe(40);
    }
  });

  it("로컬 코치도 원고·제목·분위기의 마스킹 결과를 사용한다", async () => {
    const service = new StudioOpenAiCreativeAssistService();
    const contacts = ["source@example.com", "title@example.com", "tone@example.com"];
    const fetchMock = vi.fn<typeof fetch>();
    const result = await service.assistWithZeroBillCascade(null, {
      mode: "idea-remix",
      inputText: `주인공이 ${contacts[0]}에 편지를 보낸다.`,
      projectTitle: contacts[1],
      genreOrTone: contacts[2],
    }, { env: {}, fetchImpl: fetchMock });
    expect(result.provider).toBe("local-zero-cost-fallback");
    expect(result.privacy.piiRedactedCount).toBe(3);
    expect(result.result.mode).toBe("idea-remix");
    for (const contact of contacts) expect(JSON.stringify(result.result)).not.toContain(contact);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registers optional NestJS DI metadata for StudioFreeAiZeroBillRouter without parameter decorator syntax", () => {
    const declared = Reflect.getMetadata(
      "self:paramtypes",
      StudioOpenAiCreativeAssistService,
    ) as Array<{ index: number; param: unknown }>;
    const optional = Reflect.getMetadata(
      "optional:paramtypes",
      StudioOpenAiCreativeAssistService,
    ) as number[];

    expect(declared).toEqual([{ index: 0, param: StudioFreeAiZeroBillRouter }]);
    expect(optional).toEqual([0]);

    const injectedRouter = new StudioFreeAiZeroBillRouter();
    const quotaSpy = vi.spyOn(injectedRouter, "getFreeQuotaStatus");
    const service = new StudioOpenAiCreativeAssistService(injectedRouter);
    service.freeQuotaStatus({}, 1_700_000_000_000);
    expect(quotaSpy).toHaveBeenCalledTimes(1);
    expect(quotaSpy).toHaveBeenCalledWith({}, 1_700_000_000_000);
  });

  it("permits explicitly configured flagship OpenAI models while keeping OPENAI_FREE_DATA_SHARE_MODELS strictly unchanged", () => {
    for (const flagship of ["gpt-4.1", "gpt-5.4-mini", "gpt-5.5", "gpt-6.2-astra", "gpt-6.2-sol"]) {
      const config = resolveStudioOpenAiCreativeConfig({
        OPENAI_API_KEY: "test-placeholder",
        OPENAI_MODEL: flagship,
      });
      expect(config.model).toBe(flagship);
      expect(config.modelConfigurationError).toBeNull();
      expect(isOpenAiFreeShareModel(flagship)).toBe(false);
    }
    expect(isOpenAiFreeShareModel("gpt-4o-mini")).toBe(true);
    expect(isOpenAiFreeShareModel("gpt-4.1-mini")).toBe(true);
    expect(isOpenAiFreeShareModel("gpt-4o")).toBe(true);
  });

  it("omits temperature and increases max_completion_tokens headroom for GPT-5/GPT-6 reasoning models", async () => {
    const service = new StudioOpenAiCreativeAssistService();
    const capturedBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      capturedBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return createDialogueResponse();
    });

    await service.assist(
      "user:reasoning-1",
      { mode: "dialogue-polish", inputText: "늦어서 미안해. 많이 기다렸지?" },
      { env: { OPENAI_API_KEY: "test-placeholder", OPENAI_MODEL: "gpt-5.5" }, fetchImpl: fetchMock },
    );
    await service.assist(
      "user:reasoning-2",
      { mode: "dialogue-polish", inputText: "늦어서 미안해. 많이 기다렸지?" },
      { env: { OPENAI_API_KEY: "test-placeholder", OPENAI_MODEL: "gpt-6.2-astra" }, fetchImpl: fetchMock },
    );
    await service.assist(
      "user:standard-41",
      { mode: "dialogue-polish", inputText: "늦어서 미안해. 많이 기다렸지?" },
      { env: { OPENAI_API_KEY: "test-placeholder", OPENAI_MODEL: "gpt-4.1" }, fetchImpl: fetchMock },
    );

    expect(capturedBodies[0]?.model).toBe("gpt-5.5");
    expect(capturedBodies[0]?.temperature).toBeUndefined();
    expect(Number(capturedBodies[0]?.max_completion_tokens)).toBeGreaterThanOrEqual(3_200);

    expect(capturedBodies[1]?.model).toBe("gpt-6.2-astra");
    expect(capturedBodies[1]?.temperature).toBeUndefined();
    expect(Number(capturedBodies[1]?.max_completion_tokens)).toBeGreaterThanOrEqual(3_200);

    expect(capturedBodies[2]?.model).toBe("gpt-4.1");
    expect(capturedBodies[2]?.temperature).toBe(0.65);
    expect(capturedBodies[2]?.max_completion_tokens).toBe(1_400);
  });

  it("validates relaxed scroll-pacing-auditor (16px floor) and localization-glossary-check (up to 16 entries) schemas", () => {
    expect(buildModeSystemInstruction("scroll-pacing-auditor")).toContain("16~480px");

    const tightPacing = validateAssistModeStructuredOutput("scroll-pacing-auditor", {
      rhythmVerdict: "연속 타격 구간을 20px로 좁히고 반전 컷 직전에 360px 여백을 두어 몰입감을 살립니다.",
      averageGapPx: 16,
      cliffhangerScore: 88,
      cliffhangerTip: "마지막 컷 대사 직전 검은 여백을 320px로 늘려 시선을 멈추게 하세요.",
      beatPacing: [
        { section: "1~3컷 추격", pacing: "tight", recommendedGapPx: 16, readerRetentionNote: "빠른 스크롤 가속 구간" },
        { section: "4컷 반전", pacing: "drop", recommendedGapPx: 360, readerRetentionNote: "정적 연출로 감정 낙차 강조" },
      ],
    });
    expect(tightPacing).not.toBeNull();

    const tooSmallPacing = validateAssistModeStructuredOutput("scroll-pacing-auditor", {
      rhythmVerdict: "테스트",
      averageGapPx: 15,
      cliffhangerScore: 50,
      cliffhangerTip: "테스트",
      beatPacing: [
        { section: "1컷", pacing: "tight", recommendedGapPx: 16, readerRetentionNote: "메모" },
        { section: "2컷", pacing: "steady", recommendedGapPx: 80, readerRetentionNote: "메모" },
      ],
    });
    expect(tooSmallPacing).toBeNull();

    const largeGlossary = validateAssistModeStructuredOutput("localization-glossary-check", {
      targetLocales: ["en", "ja"],
      glossary: Array.from({ length: 12 }, (_, idx) => ({
        termKo: `세계관 용어 ${idx + 1}`,
        en: "A".repeat(150),
        ja: "あ".repeat(150),
        ruleNote: "규".repeat(280),
      })),
      culturalNotes: Array.from({ length: 7 }, (_, idx) => ({
        severity: idx % 2 === 0 ? "info" : "warn",
        topic: `문화 주의 ${idx + 1}`,
        adaptationTip: "팁".repeat(320),
      })),
    });
    expect(largeGlossary).not.toBeNull();
  });

  it("masks Korean road-name and lot-number addresses before upstream send without false positives on webtoon prose", async () => {
    const addresses = [
      "서울시 강남구 테헤란로 123",
      "경기도 성남시 분당구 판교역로 235 101동 202호",
      "서울특별시 송파구 방이동 127-10",
    ];
    const sample =
      `1컷: 거주지는 ${addresses[0]}으로 확인됐고, 본사는 ${addresses[1]}, 창고는 ${addresses[2]}이다.`;
    const redacted = redactCreatorSensitiveText(sample);

    expect(redacted.redactedCount).toBe(3);
    for (const addr of addresses) {
      expect(redacted.sanitizedText).not.toContain(addr);
    }
    expect(redacted.sanitizedText).not.toContain("테헤란로");
    expect(redacted.sanitizedText).not.toContain("판교역로");
    expect(redacted.sanitizedText).not.toContain("101동 202호");
    expect(redacted.sanitizedText).not.toContain("방이동 127-10");
    expect(redacted.sanitizedText.match(/\[주소 비공개\]/gu)).toHaveLength(3);

    const safeProseCases = [
      "강남역에서 만났다.",
      "서울 하늘이 노을로 물들었다.",
      "서울 중구 을지로 3가역 4번 출구에서 기다릴게.",
      "서울 중구 종로 3가에서 만나자.",
      "서울 친구 집으로 3분 걸렸다.",
      "서울시 강남구 카페에서 콘티를 짰다.",
    ];
    for (const prose of safeProseCases) {
      const check = redactCreatorSensitiveText(prose);
      expect(check.redactedCount).toBe(0);
      expect(check.sanitizedText).toBe(prose);
    }

    const service = new StudioOpenAiCreativeAssistService();
    let capturedBodyText = "";
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      capturedBodyText = String(init?.body ?? "");
      return createDialogueResponse();
    });

    const res = await service.assist(
      "user:pii-address-outbound",
      {
        mode: "dialogue-polish",
        inputText:
          "형사: 연락처 010-9876-5432, 메일 writer@example.com, 주민번호 900101-1234567, 주소는 서울시 강남구 테헤란로 123 빌딩 로비와 서울시 강남구 테헤란로 123으로 확인됐습니다.",
      },
      { env: { OPENAI_API_KEY: "test-placeholder" }, fetchImpl: fetchMock },
    );

    expect(capturedBodyText).not.toContain("010-9876-5432");
    expect(capturedBodyText).not.toContain("writer@example.com");
    expect(capturedBodyText).not.toContain("900101-1234567");
    expect(capturedBodyText).not.toContain("서울시 강남구 테헤란로 123");
    expect(capturedBodyText).toContain("[주소 비공개]");
    expect(res.privacy.piiRedactedCount).toBe(5);
  });

  it("accepts up to 12 balloons in dialogue-polish and allows safe refusal empty fields in export/character modes", () => {
    const twelveBalloons = Array.from({ length: 12 }, (_, idx) => ({
      toneLabel: `안 ${idx + 1}`,
      line: `핵심 대사 ${idx + 1}입니다.`,
      subBubble: idx % 2 === 0 ? "보조 호흡 대사" : "",
      reason: `호흡과 강조점 ${idx + 1} 설명입니다.`,
    }));
    const validTwelve = validateAssistModeStructuredOutput("dialogue-polish", {
      readabilityNote: "다중 대사 씬을 12개 말풍선 이내로 정리했습니다.",
      balloons: twelveBalloons,
    });
    expect(validTwelve).not.toBeNull();
    if (validTwelve?.mode === "dialogue-polish") {
      expect(validTwelve.data.balloons).toHaveLength(12);
    }

    const invalidThirteen = validateAssistModeStructuredOutput("dialogue-polish", {
      readabilityNote: "초과 테스트",
      balloons: [...twelveBalloons, twelveBalloons[0]],
    });
    expect(invalidThirteen).toBeNull();

    const refusalExport = validateAssistModeStructuredOutput("export-preflight-coach", {
      readinessSummary: "   ",
      episodeBlurbSuggestion: "   ",
      checks: [
        { category: "원고 입력 안내", severity: "tip", detail: "컷별 대사와 장면 메모를 입력해 주세요." },
        { category: "회차 소개 초안", severity: "tip", detail: "핵심 갈등 한 줄을 함께 적으면 소개글을 다듬어 드립니다." },
      ],
    });
    expect(refusalExport).not.toBeNull();
    if (refusalExport?.mode === "export-preflight-coach") {
      expect(refusalExport.data.readinessSummary).toBe("");
      expect(refusalExport.data.episodeBlurbSuggestion).toBe("");
    }

    const refusalCharacter = validateAssistModeStructuredOutput("character-bible-forge", {
      characterName: "미정",
      archetypeKo: "미정",
      speechTone: "캐릭터 대사 예시나 성격을 알려 주시면 말투를 정리해 드립니다.",
      appearancePalette: "머리색, 의상, 시그니처 소품을 입력해 주세요.",
      coreMotivation: "인물의 목표와 결핍을 한 줄로 적어 주세요.",
      forbiddenLines: [],
      relationshipHooks: [],
      visualConsistencyCue: "반복해 그릴 고정 외형 포인트를 입력해 주세요.",
    });
    expect(refusalCharacter).not.toBeNull();
    if (refusalCharacter?.mode === "character-bible-forge") {
      expect(refusalCharacter.data.forbiddenLines).toEqual([]);
      expect(refusalCharacter.data.relationshipHooks).toEqual([]);
    }
  });

  it("allocates reasoning_effort=low and 6000 max_completion_tokens for mcp-workflow-macro on reasoning models and syncs schema descriptions", async () => {
    const service = new StudioOpenAiCreativeAssistService();
    const capturedBodies: Array<Record<string, unknown>> = [];
    const macroResponse = () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  macroTitle: "무협 봄비 장면 매크로",
                  summary: "3D 카메라부터 프리플라이트까지 무과금 툴로 실행합니다.",
                  zeroCostSafe: true,
                  steps: [
                    {
                      stepOrder: 1,
                      toolName: "studio.bg3d.compose_scene",
                      reasonKo: "3D 대청마루 카메라를 설정합니다.",
                      argumentsJson: "{\"lensMm\":35,\"timeOfDay\":\"spring-rain\"}",
                    },
                    {
                      stepOrder: 2,
                      toolName: "studio.export.preflight_check",
                      reasonKo: "내보내기 전 최소 폭과 Rights BOM을 점검합니다.",
                      argumentsJson: "{\"platform\":\"naver-webtoon\",\"requireCleanRightsBom\":true,\"rightsBomClean\":false}",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );

    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      capturedBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return macroResponse();
    });

    for (const model of ["gpt-5.5", "gpt-6.2-astra", "gpt-4.1"] as const) {
      await service.assist(
        `user:macro-${model}`,
        { mode: "mcp-workflow-macro", inputText: "3D 배경 세팅 후 봄비 보정과 프리플라이트를 실행해 줘." },
        { env: { OPENAI_API_KEY: "test-placeholder", OPENAI_MODEL: model }, fetchImpl: fetchMock },
      );
    }

    expect(capturedBodies[0]?.model).toBe("gpt-5.5");
    expect(capturedBodies[0]?.reasoning_effort).toBe("low");
    expect(capturedBodies[0]?.temperature).toBeUndefined();
    expect(capturedBodies[0]?.max_completion_tokens).toBe(6_000);

    expect(capturedBodies[1]?.model).toBe("gpt-6.2-astra");
    expect(capturedBodies[1]?.reasoning_effort).toBe("low");
    expect(capturedBodies[1]?.temperature).toBeUndefined();
    expect(capturedBodies[1]?.max_completion_tokens).toBe(6_000);

    expect(capturedBodies[2]?.model).toBe("gpt-4.1");
    expect(capturedBodies[2]?.reasoning_effort).toBeUndefined();
    expect(capturedBodies[2]?.temperature).toBe(0.65);
    expect(capturedBodies[2]?.max_completion_tokens).toBe(1_400);

    // 14개 전 모드 스키마에 배열 상한 description 동기화 및 핵심 프롬프트 가드 포함 확인
    expect(Object.keys(MODE_JSON_SCHEMAS)).toHaveLength(14);
    for (const spec of Object.values(MODE_JSON_SCHEMAS)) {
      const props = (spec.schema.properties ?? {}) as Record<string, { type?: string; description?: string }>;
      for (const prop of Object.values(props)) {
        if (prop.type === "array") {
          expect(typeof prop.description).toBe("string");
          expect((prop.description ?? "").length).toBeGreaterThan(5);
        }
      }
    }
    const dialogueInstruction = buildModeSystemInstruction("dialogue-polish");
    expect(dialogueInstruction).toContain("총 3개");
    expect(dialogueInstruction).toContain("각각 한 번씩");
    expect(dialogueInstruction).toContain("숫자나 끝자리를 지어내지");
    const cutsInstruction = buildModeSystemInstruction("script-to-cuts");
    expect(cutsInstruction).toContain("단서가 처음 공개되는 컷");
    expect(cutsInstruction).toContain("서로 맞지 않는 실측값");
    expect(cutsInstruction).toContain("발화가 없는 컷");
    expect(buildModeSystemInstruction("mcp-workflow-macro")).toContain("240자 이내");
    expect(buildModeSystemInstruction("export-preflight-coach")).toContain("연속성 fix");
    expect(buildModeSystemInstruction("idea-remix")).toContain("메타 식별자");
    expect(buildModeSystemInstruction("character-bible-forge")).toContain("공격 문구");
  });

  it("uses 60s default timeout for reasoning models, expands non-reasoning output cap for long scripts, releases quota on truncation, and syncs scroll-pacing averageGapPx", async () => {
    expect(
      resolveStudioOpenAiCreativeConfig({ OPENAI_API_KEY: "test", OPENAI_MODEL: "gpt-6.2-astra" }).timeoutMs,
    ).toBe(60_000);
    expect(
      resolveStudioOpenAiCreativeConfig({ OPENAI_API_KEY: "test", OPENAI_MODEL: "gpt-5.5" }).timeoutMs,
    ).toBe(60_000);
    expect(
      resolveStudioOpenAiCreativeConfig({ OPENAI_API_KEY: "test", OPENAI_MODEL: "gpt-4.1" }).timeoutMs,
    ).toBe(30_000);
    expect(
      resolveStudioOpenAiCreativeConfig({
        OPENAI_API_KEY: "test",
        OPENAI_MODEL: "gpt-6.2-astra",
        STUDIO_OPENAI_TIMEOUT_MS: "85000",
      }).timeoutMs,
    ).toBe(85_000);

    // continuity-plot-audit & script-to-cuts 안전 거절(빈 배열) 스키마 허용 검증
    expect(
      validateAssistModeStructuredOutput("continuity-plot-audit", {
        overallConsistencyScore: 0,
        summary: "점검할 대본이나 콘티 메모를 입력해 주세요.",
        issues: [],
      }),
    ).not.toBeNull();
    expect(
      validateAssistModeStructuredOutput("script-to-cuts", {
        episodeGoal: "분할할 장면 대본을 입력해 주세요.",
        pacingTip: "등장인물과 장면 흐름을 2문장 이상 적어 주시면 컷을 구성해 드립니다.",
        cuts: [],
      }),
    ).not.toBeNull();

    const service = new StudioOpenAiCreativeAssistService();
    let capturedLongBody: Record<string, unknown> = {};
    const longScript = "1화 장면 대본입니다. 비 오는 종로 도서관에서 별빛 사서가 싸운다.\n".repeat(40);
    await service.assist(
      "user:long-41",
      { mode: "script-to-cuts", inputText: longScript },
      {
        env: { OPENAI_API_KEY: "test-placeholder", OPENAI_MODEL: "gpt-4.1" },
        fetchImpl: vi.fn<typeof fetch>(async (_url, init) => {
          capturedLongBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
          return new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: JSON.stringify({
                      episodeGoal: "도서관 격돌",
                      pacingTip: "긴박한 호흡",
                      cuts: [
                        {
                          cutNumber: 1,
                          beatKind: "setup",
                          shotType: "와이드샷",
                          visualAction: "도서관 전경",
                          dialogue: "",
                          scrollGapHint: "180px",
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          );
        }),
      },
    );
    expect(capturedLongBody.max_completion_tokens).toBe(3_200);

    // finish_reason === "length" 시 일일 한도 슬롯을 복원해 재시도가 차단되지 않아야 한다
    const retryEnv = {
      OPENAI_API_KEY: "test-placeholder",
      STUDIO_OPENAI_DAILY_REQUEST_LIMIT: "1",
    };
    await expect(
      service.assist(
        "user:trunc-release",
        { mode: "dialogue-polish", inputText: "긴 대사를 다듬어 주세요." },
        {
          env: retryEnv,
          fetchImpl: vi.fn<typeof fetch>(async () =>
            new Response(
              JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "{" } }] }),
              { status: 200 },
            ),
          ),
        },
      ),
    ).rejects.toMatchObject({ status: 502, response: { code: "OPENAI_OUTPUT_TRUNCATED" } });

    const retryOk = await service.assist(
      "user:trunc-release",
      { mode: "dialogue-polish", inputText: "긴 대사를 다듬어 주세요." },
      { env: retryEnv, fetchImpl: vi.fn<typeof fetch>(async () => createDialogueResponse()) },
    );
    expect(retryOk.result.mode).toBe("dialogue-polish");

    // scroll-pacing-auditor averageGapPx 산술평균 자동 정규화 확인
    const pacingRes = await service.assist(
      "user:pacing-sync",
      { mode: "scroll-pacing-auditor", inputText: "1컷 도입 후 2컷 반전으로 여백을 크게 줍니다." },
      {
        env: { OPENAI_API_KEY: "test-placeholder" },
        fetchImpl: vi.fn<typeof fetch>(async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: JSON.stringify({
                      rhythmVerdict: "초반은 빠르게, 엔딩은 여백을 넓힙니다.",
                      averageGapPx: 150,
                      cliffhangerScore: 88,
                      cliffhangerTip: "엔딩 직전 360px 여백을 유지하세요.",
                      beatPacing: [
                        { section: "도입", pacing: "tight", recommendedGapPx: 100, readerRetentionNote: "빠른 전개" },
                        { section: "반전", pacing: "drop", recommendedGapPx: 320, readerRetentionNote: "시선 정지" },
                      ],
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          ),
        ),
      },
    );
    expect(pacingRes.result.mode).toBe("scroll-pacing-auditor");
    if (pacingRes.result.mode === "scroll-pacing-auditor") {
      expect(pacingRes.result.data.averageGapPx).toBe(210);
    }
  });
});
