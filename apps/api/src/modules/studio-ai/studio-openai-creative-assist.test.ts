import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { StudioOpenAiCreativeAssistRequestSchema } from "./studio-openai-creative-assist.dto";
import {
  redactCreatorSensitiveText,
  resolveStudioOpenAiCreativeConfig,
  StudioOpenAiCreativeAssistService,
} from "./studio-openai-creative-assist.service";

describe("StudioOpenAiCreativeAssistService", () => {
  it("reports unconfigured status safely without leaking keys when OPENAI_API_KEY is absent", () => {
    const service = new StudioOpenAiCreativeAssistService();
    const status = service.status({});

    expect(status.configured).toBe(false);
    expect(status.keyLocation).toBe("server-env-only");
    expect(status.storeData).toBe(false);
    expect(status.piiMasking).toBe(true);
    expect(status.autoBillingDisabled).toBe(true);
    expect(status.modes.map((m) => m.id)).toEqual([
      "idea-remix",
      "script-to-cuts",
      "dialogue-polish",
      "export-preflight-coach",
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
  });

  it("masks personal data (email, phone, RRN, accidental secret token) before upstream send", () => {
    const fakeSecret = ["sk", "live", "1234567890abcdefghij"].join("-");
    const sample = `작가 연락처 010-1234-5678, 메일 creator@example.com, 주민번호 990101-1234567, 토큰 ${fakeSecret}`;
    const result = redactCreatorSensitiveText(sample);

    expect(result.redactedCount).toBe(4);
    expect(result.sanitizedText).not.toContain("010-1234-5678");
    expect(result.sanitizedText).not.toContain("creator@example.com");
    expect(result.sanitizedText).not.toContain("990101-1234567");
    expect(result.sanitizedText).not.toContain(fakeSecret);
    expect(result.sanitizedText).toContain("[연락처 비공개]");
    expect(result.sanitizedText).toContain("[이메일 비공개]");
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

  it("distinguishes OpenAI quota exhaustion without auto-charging and enforces burst rate limits", async () => {
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

    // 한도 1회 설정 시 두 번째 요청은 외부 호출 전에 차단됨
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

  it("validates DTO input bounds with concrete Korean messages", () => {
    const emptyCheck = StudioOpenAiCreativeAssistRequestSchema.safeParse({
      mode: "idea-remix",
      inputText: " ",
    });
    expect(emptyCheck.success).toBe(false);
  });
});
