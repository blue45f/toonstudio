import { describe, expect, it } from "vitest";

import { StudioAiMessagesSchema } from "./studio-ai-messages.dto";
import {
  buildPremiumChatRequest,
  buildPremiumMessagesRequest,
  freeFinishReasonToStopReason,
  normalizedPremiumMessage,
  parsePremiumMessagesResponse,
  premiumMessagesToFreeChatBody,
  STUDIO_AI_PREMIUM_SERVER_FALLBACK_BETA,
  stripJsonCodeFence,
  studioAiPremiumModelSupportsEffort,
  studioAiPremiumModelSupportsServerFallback,
  studioAiPremiumRequestHeaders,
} from "./studio-ai-messages-translate";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("studio-ai-messages-translate", () => {
  it("텍스트 작업 요청을 만들고 고성능 출력 상한·깊이·서버 측 대체를 싣는다", () => {
    const body = buildPremiumChatRequest({
      model: "claude-opus-5-5",
      system: "한국어로 답하라",
      messages: [{ role: "user", content: "안녕" }],
      maxTokens: 99_999,
      effort: "low",
    });
    expect(body?.model).toBe("claude-opus-5-5");
    expect(body?.max_tokens).toBe(16_000);
    expect(body?.system).toBe("한국어로 답하라");
    expect(body?.output_config).toEqual({ effort: "low" });
    expect(body?.fallbacks).toBe("default");
    expect(body).not.toHaveProperty("temperature");
  });

  it("서버 측 대체가 없는 모델에는 대체 매개변수와 베타 헤더를 싣지 않는다", () => {
    const body = buildPremiumChatRequest({
      model: "claude-haiku-5-5",
      messages: [{ role: "user", content: "안녕" }],
      maxTokens: 1_000,
      effort: "medium",
    });
    expect(body).not.toHaveProperty("fallbacks");
    expect(studioAiPremiumRequestHeaders("server-key", body!)).not.toHaveProperty("anthropic-beta");
    expect(studioAiPremiumRequestHeaders("server-key", { fallbacks: "default" })).toMatchObject({
      "x-api-key": "server-key",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": STUDIO_AI_PREMIUM_SERVER_FALLBACK_BETA,
    });
  });

  it("빈 메시지는 요청을 만들지 않는다", () => {
    expect(
      buildPremiumChatRequest({
        model: "claude-haiku-5-5",
        messages: [],
        maxTokens: 100,
      }),
    ).toBeNull();
  });

  it("깊이·서버 측 대체를 받는 모델만 구분한다", () => {
    expect(studioAiPremiumModelSupportsEffort("claude-opus-5-5")).toBe(true);
    expect(studioAiPremiumModelSupportsEffort("claude-haiku-5-5")).toBe(true);
    expect(studioAiPremiumModelSupportsEffort("claude-haiku-4-5")).toBe(false);
    expect(studioAiPremiumModelSupportsServerFallback("claude-sonnet-5-5")).toBe(true);
    expect(studioAiPremiumModelSupportsServerFallback("claude-haiku-5-5")).toBe(false);
  });

  it("응답을 텍스트·멈춤 사유·캐시 포함 토큰 사용량으로 파싱한다", () => {
    const parsed = parsePremiumMessagesResponse({
      model: "claude-opus-5-5",
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: "안녕" },
      ],
      usage: { input_tokens: 12, output_tokens: 4, cache_read_input_tokens: 3 },
    });
    expect(parsed).toEqual({
      ok: true,
      text: "안녕",
      model: "claude-opus-5-5",
      stopReason: "end_turn",
      inputTokens: 12,
      outputTokens: 4,
      cacheReadTokens: 3,
      cacheWriteTokens: 0,
    });
    expect(parsePremiumMessagesResponse({})).toEqual({
      ok: false,
      reason: "invalid_response",
    });
    expect(parsePremiumMessagesResponse({ content: [], usage: { input_tokens: -1, output_tokens: 1 } }))
      .toEqual({ ok: false, reason: "invalid_response" });
  });

  it("보조 기능 요청은 범위 지시를 시스템 맨 앞에 두고 블록·구조화 출력 형식을 그대로 싣는다", () => {
    const request = StudioAiMessagesSchema.parse({
      max_tokens: 8_000,
      system: [{ type: "text", text: "아트 디렉터 지시", cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: PNG_BASE64 } },
          { type: "text", text: "평가해 주세요" },
        ],
      }],
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: { type: "object", properties: { summary: { type: "string" } } } },
      },
    });
    const body = buildPremiumMessagesRequest(request, { model: "claude-opus-5-5", scope: "범위" });
    expect(body.system).toEqual([
      { type: "text", text: "범위" },
      { type: "text", text: "아트 디렉터 지시", cache_control: { type: "ephemeral" } },
    ]);
    expect(body.output_config).toEqual({
      effort: "medium",
      format: { type: "json_schema", schema: { type: "object", properties: { summary: { type: "string" } } } },
    });
    expect(body.messages).toEqual(request.messages);
  });

  it("무료 풀로 넘길 때 이미지를 data URL 블록으로 옮기고 스키마는 지시문과 JSON 모드로 바꾼다", () => {
    const request = StudioAiMessagesSchema.parse({
      max_tokens: 12_000,
      system: "대체 텍스트를 만드세요",
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: PNG_BASE64 } },
          { type: "text", text: "설명" },
        ],
      }],
      output_config: { format: { type: "json_schema", schema: { type: "object" } } },
    });
    const body = premiumMessagesToFreeChatBody(request, { model: "gemini-3.8-flash", scope: "범위" });
    expect(body.max_tokens).toBe(8_192);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0]).toMatchObject({ role: "system" });
    expect(String(body.messages[0]?.content)).toContain("<json_schema>");
    expect(body.messages[1]).toEqual({
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/png;base64,${PNG_BASE64}` } },
        { type: "text", text: "설명" },
      ],
    });
  });

  it("코드 펜스를 벗기고 무료 풀 종료 사유를 멈춤 사유로 옮긴다", () => {
    expect(stripJsonCodeFence("```json\n{\"a\":1}\n```")).toBe("{\"a\":1}");
    expect(stripJsonCodeFence("{\"a\":1}")).toBe("{\"a\":1}");
    expect(freeFinishReasonToStopReason("stop")).toBe("end_turn");
    expect(freeFinishReasonToStopReason(null)).toBe("end_turn");
    expect(freeFinishReasonToStopReason("length")).toBe("max_tokens");
    expect(freeFinishReasonToStopReason("content_filter")).toBe("refusal");
    expect(freeFinishReasonToStopReason("tool_calls")).toBe("other");
  });

  it("브라우저가 경로와 무관하게 같은 형태로 받는 메시지를 만든다", () => {
    expect(normalizedPremiumMessage({
      id: "msg_1",
      model: "gemini-3.8-flash",
      text: "{}",
      stopReason: "end_turn",
      inputTokens: 5,
      outputTokens: 2,
    })).toEqual({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "gemini-3.8-flash",
      content: [{ type: "text", text: "{}" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 5,
        output_tokens: 2,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });
  });
});
