import { describe, expect, it, vi } from "vitest";

import type { StudioAiCapabilityConfig } from "./studio-ai-capabilities";
import {
  analyzeImageWithGroq,
  analyzeImageWithFreePool,
  transcribeWithFreePool,
  transcribeWithGroq,
  STUDIO_AI_GROQ_TRANSCRIPTION_MAX_BYTES,
} from "./studio-ai-groq-media";
import {
  StudioAiCapabilityInputError,
  StudioAiCapabilityProviderError,
  StudioAiCapabilityUnavailableError,
  type StudioAiMediaFetch,
} from "./studio-ai-media";

const groqEnv = {
  NODE_ENV: "production",
  STUDIO_AI_FREE_POOL_ENABLED: "true",
  STUDIO_AI_FREE_GROQ_API_KEY: "groq-media-key",
  STUDIO_AI_FREE_GROQ_CONFIRMED: "true",
};

function groqConfig(
  capability: "transcription" | "vision",
  overrides: Partial<StudioAiCapabilityConfig> = {},
): StudioAiCapabilityConfig {
  return {
    provider: "groq",
    capability,
    model: capability === "transcription" ? "whisper-large-v3" : "qwen/qwen3.8-27b",
    configured: true,
    endpoint: capability === "transcription"
      ? "https://api.groq.com/openai/v1/audio/transcriptions"
      : "https://api.groq.com/openai/v1/chat/completions",
    apiKey: "groq-media-key",
    dataTerms: { dataUsage: "no-training", dataTermsLabel: "test" },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Groq Whisper 전사 어댑터", () => {
  it("verbose_json + segment·word 타임스탬프로 요청하고 자막 계약으로 정규화한다", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchFn: StudioAiMediaFetch = async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse({
        text: " 두 번째 대사 첫 번째 대사 ",
        language: "KO",
        duration: 12.5,
        segments: [
          { start: 6.5, end: 12.5, text: " 두 번째 대사 " },
          { start: 0, end: 6.5, text: " 첫 번째 대사 " },
          { start: 3, end: 2, text: "깨진 구간" },
          { start: 1, end: 2, text: "   " },
        ],
        words: [
          { word: " 대사", start: 1.2, end: 1.8 },
          { word: "첫", start: 0.1, end: 0.5 },
        ],
      });
    };

    const result = await transcribeWithGroq(groqConfig("transcription"), {
      audio: { bytes: new Uint8Array([1, 2, 3]), filename: "scene.mp3", contentType: "audio/mpeg" },
      language: "ko",
    }, fetchFn);

    expect(capturedUrl).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    const form = capturedInit?.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.getAll("timestamp_granularities[]")).toEqual(["segment", "word"]);
    expect(form.get("language")).toBe("ko");
    expect((capturedInit?.headers as Record<string, string>).Authorization)
      .toBe("Bearer groq-media-key");

    // 자막 큐 순서로 정렬되고 깨진·빈 구간은 버려진다.
    expect(result.segments).toEqual([
      { index: 0, startSeconds: 0, endSeconds: 6.5, text: "첫 번째 대사" },
      { index: 1, startSeconds: 6.5, endSeconds: 12.5, text: "두 번째 대사" },
    ]);
    expect(result.words.map(({ word }) => word)).toEqual(["첫", "대사"]);
    expect(result.language).toBe("ko");
    expect(result.durationSeconds).toBe(12.5);
    expect(result.text).toBe("두 번째 대사 첫 번째 대사");
  });

  it("파일과 URL을 함께 지정하거나 무료 상한을 넘기면 호출 전에 거절한다", async () => {
    const fetchFn = vi.fn<StudioAiMediaFetch>();
    await expect(transcribeWithGroq(groqConfig("transcription"), {
      audio: { bytes: new Uint8Array([1]), filename: "a.mp3", contentType: "audio/mpeg" },
      audioUrl: "https://example.com/a.mp3",
    }, fetchFn)).rejects.toBeInstanceOf(StudioAiCapabilityInputError);
    await expect(transcribeWithGroq(groqConfig("transcription"), {
      audio: {
        bytes: new Uint8Array(STUDIO_AI_GROQ_TRANSCRIPTION_MAX_BYTES + 1),
        filename: "big.wav",
        contentType: "audio/wav",
      },
    }, fetchFn)).rejects.toBeInstanceOf(StudioAiCapabilityInputError);
    await expect(transcribeWithGroq(groqConfig("transcription"), {
      audioUrl: "https://example.com/a.mp3",
      language: "korean",
    }, fetchFn)).rejects.toBeInstanceOf(StudioAiCapabilityInputError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("429는 무료 쿼터 소진으로 분류해 전환 가능으로 표시하고 5xx·네트워크는 전환하지 않는다", async () => {
    const audio = {
      audio: { bytes: new Uint8Array([1]), filename: "a.mp3", contentType: "audio/mpeg" },
    };
    const quotaError = await transcribeWithGroq(
      groqConfig("transcription"), audio,
      async () => jsonResponse({ error: { message: "rate limited" } }, 429),
    ).catch((error: unknown) => error);
    expect(quotaError).toBeInstanceOf(StudioAiCapabilityProviderError);
    expect((quotaError as StudioAiCapabilityProviderError).classification).toMatchObject({
      kind: "free_quota_exhausted",
      billingFailoverEligible: true,
    });

    const serverError = await transcribeWithGroq(
      groqConfig("transcription"), audio,
      async () => jsonResponse({}, 503),
    ).catch((error: unknown) => error);
    expect((serverError as StudioAiCapabilityProviderError).classification).toMatchObject({
      kind: "provider_unavailable",
      billingFailoverEligible: false,
    });

    const networkError = await transcribeWithGroq(
      groqConfig("transcription"), audio,
      async () => { throw new Error("socket reset"); },
    ).catch((error: unknown) => error);
    expect((networkError as StudioAiCapabilityProviderError).classification).toMatchObject({
      kind: "provider_unavailable",
      billingFailoverEligible: false,
    });
  });

  it("풀 경유 호출은 미구성 환경에서 unavailable로 확정한다", async () => {
    await expect(transcribeWithFreePool(
      { audioUrl: "https://example.com/a.mp3" },
      { NODE_ENV: "production" },
      async () => jsonResponse({}),
    )).rejects.toBeInstanceOf(StudioAiCapabilityUnavailableError);

    const run = await transcribeWithFreePool(
      { audioUrl: "https://example.com/a.mp3" },
      groqEnv,
      async () => jsonResponse({ text: "안녕", language: "ko", segments: [] }),
    );
    expect(run).toMatchObject({ provider: "groq", model: "whisper-large-v3" });
    expect(run.result.text).toBe("안녕");
  });
});

describe("Groq 비전 어댑터", () => {
  it("chat completions에 텍스트+이미지 파트로 요청하고 usage를 돌려준다", async () => {
    let capturedBody = "";
    const fetchFn: StudioAiMediaFetch = async (_url, init) => {
      capturedBody = String(init.body);
      return jsonResponse({
        choices: [{ message: { content: " 밤 거리 배경, 네온 간판이 보인다 " } }],
        usage: { prompt_tokens: 2048, completion_tokens: 24, total_tokens: 2072 },
      });
    };
    const result = await analyzeImageWithGroq(groqConfig("vision"), {
      prompt: "이 컷을 한 문장으로 설명해줘",
      imageUrl: "https://cdn.example.com/cut-01.png",
    }, fetchFn);

    const body = JSON.parse(capturedBody) as {
      model: string;
      messages: Array<{ content: Array<Record<string, unknown>> }>;
    };
    expect(body.model).toBe("qwen/qwen3.8-27b");
    expect(body.messages[0]?.content[0]).toEqual({
      type: "text",
      text: "이 컷을 한 문장으로 설명해줘",
    });
    expect(body.messages[0]?.content[1]).toEqual({
      type: "image_url",
      image_url: { url: "https://cdn.example.com/cut-01.png" },
    });
    expect(result.text).toBe("밤 거리 배경, 네온 간판이 보인다");
    expect(result.usage).toEqual({ promptTokens: 2048, completionTokens: 24, totalTokens: 2072 });
  });

  it("사설·로컬 이미지 URL과 잘못된 데이터 URL은 호출 전에 거절한다", async () => {
    const fetchFn = vi.fn<StudioAiMediaFetch>();
    for (const imageUrl of [
      "http://cdn.example.com/cut.png",
      "https://localhost/cut.png",
      "https://192.168.0.10/cut.png",
      "https://10.0.0.5/cut.png",
    ]) {
      await expect(analyzeImageWithGroq(groqConfig("vision"), {
        prompt: "설명",
        imageUrl,
      }, fetchFn)).rejects.toBeInstanceOf(StudioAiCapabilityInputError);
    }
    await expect(analyzeImageWithGroq(groqConfig("vision"), {
      prompt: "설명",
      imageDataUrl: "data:text/html;base64,AAAA",
    }, fetchFn)).rejects.toBeInstanceOf(StudioAiCapabilityInputError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("풀 경유 비전 호출이 제공자·모델을 결과에 남긴다", async () => {
    const run = await analyzeImageWithFreePool({
      prompt: "설명",
      imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    }, groqEnv, async () => jsonResponse({ choices: [{ message: { content: "설명 결과" } }] }));
    expect(run.provider).toBe("groq");
    expect(run.result.text).toBe("설명 결과");
  });
});
