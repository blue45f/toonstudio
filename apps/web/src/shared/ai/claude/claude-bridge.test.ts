import { describe, expect, it } from "vitest";

import {
  claudeMessageText,
  claudeMessageToOpenAiChat,
  claudeStopToFinishReason,
  ClaudeBridgeError,
  openAiChatToClaudeRequest,
} from "./claude-bridge";

import type Anthropic from "@anthropic-ai/sdk";

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

function message(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: "안녕", citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    container: null,
    diagnostics: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
    },
    ...overrides,
  } as Anthropic.Message;
}

describe("OpenAI → Claude 요청 번역", () => {
  it("시스템 메시지를 system으로 모으고 사용자·어시스턴트를 그대로 옮긴다", () => {
    const { params } = openAiChatToClaudeRequest({
      messages: [
        { role: "system", content: "당신은 웹툰 작가 보조입니다." },
        { role: "developer", content: "한국어로 답하세요." },
        { role: "user", content: "대사를 써줘" },
        { role: "assistant", content: "알겠어요" },
        { role: "user", content: "더 짧게" },
      ],
      max_tokens: 1_200,
    }, { model: "claude-opus-5-5" });
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.system).toBe("당신은 웹툰 작가 보조입니다.\n\n한국어로 답하세요.");
    expect(params.messages).toEqual([
      { role: "user", content: "대사를 써줘" },
      { role: "assistant", content: "알겠어요" },
      { role: "user", content: "더 짧게" },
    ]);
  });

  it("제거된 샘플링 파라미터를 보내지 않고 사유를 기록한다", () => {
    const { params, droppedParameters } = openAiChatToClaudeRequest({
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.2,
      top_p: 0.9,
      top_k: 40,
      user: "someone",
      seed: 7,
    }, { model: "claude-opus-5-5" });
    for (const name of ["temperature", "top_p", "top_k", "user"]) {
      expect(params as unknown as Record<string, unknown>).not.toHaveProperty(name);
    }
    expect(droppedParameters).toEqual(expect.arrayContaining(["temperature", "top_p", "top_k", "user", "seed"]));
  });

  it("사고 여유분을 더해 출력 상한을 정하고 범위를 제한한다", () => {
    const base = { messages: [{ role: "user", content: "x" }] };
    expect(openAiChatToClaudeRequest({ ...base, max_tokens: 1_200 }, { model: "claude-opus-5-5" }).params.max_tokens).toBe(1_200 + 2_048);
    expect(openAiChatToClaudeRequest(base, { model: "claude-opus-5-5" }).params.max_tokens).toBe(4_096 + 2_048);
    expect(openAiChatToClaudeRequest({ ...base, max_tokens: 10_000_000 }, { model: "claude-opus-5-5" }).params.max_tokens).toBe(16_000 + 2_048);
    expect(openAiChatToClaudeRequest({ ...base, max_completion_tokens: 3 }, { model: "claude-opus-5-5" }).params.max_tokens).toBe(16 + 2_048);
    expect(openAiChatToClaudeRequest({ ...base, max_tokens: 500 }, { model: "claude-opus-5-5", thinkingHeadroomTokens: 0 }).params.max_tokens).toBe(500);
  });

  it("effort는 지원하는 모델에만 보내고 기본은 medium이다", () => {
    const body = { messages: [{ role: "user", content: "x" }] };
    expect(openAiChatToClaudeRequest(body, { model: "claude-opus-5-5" }).params.output_config).toEqual({ effort: "medium" });
    expect(openAiChatToClaudeRequest(body, { model: "claude-haiku-5-5", effort: "low" }).params.output_config).toEqual({ effort: "low" });
    expect(openAiChatToClaudeRequest(body, { model: "claude-haiku-4-5" }).params.output_config).toBeUndefined();
  });

  it("JSON 모드는 시스템 지시로, json_schema는 구조화 출력으로 옮긴다", () => {
    const jsonMode = openAiChatToClaudeRequest({
      messages: [{ role: "system", content: "팔레트를 만들어요" }, { role: "user", content: "x" }],
      response_format: { type: "json_object" },
    }, { model: "claude-opus-5-5" });
    expect(jsonMode.params.system).toMatch(/^팔레트를 만들어요\n\n응답은 설명·머리말·코드 펜스 없이 유효한 JSON 하나만 출력하세요\.$/u);
    expect(jsonMode.params.output_config).toEqual({ effort: "medium" });

    const schema = { type: "object", properties: { a: { type: "string" } }, required: ["a"], additionalProperties: false };
    const structured = openAiChatToClaudeRequest({
      messages: [{ role: "user", content: "x" }],
      response_format: { type: "json_schema", json_schema: { name: "a", schema } },
    }, { model: "claude-opus-5-5" });
    expect(structured.params.output_config).toEqual({ effort: "medium", format: { type: "json_schema", schema } });
    expect(structured.params.system).toBeUndefined();

    expect(() => openAiChatToClaudeRequest({
      messages: [{ role: "user", content: "x" }],
      response_format: { type: "json_schema", json_schema: {} },
    }, { model: "claude-opus-5-5" })).toThrow(ClaudeBridgeError);
  });

  it("이미지 데이터 URL을 base64 이미지 블록으로 옮긴다", () => {
    const { params } = openAiChatToClaudeRequest({
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "이 컷을 평가해줘" },
          { type: "image_url", image_url: { url: PNG_DATA_URL } },
        ],
      }],
    }, { model: "claude-opus-5-5" });
    expect(params.messages[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "이 컷을 평가해줘" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
      ],
    });
  });

  it.each([
    ["외부 이미지 주소", { type: "image_url", image_url: { url: "https://example.com/a.png" } }],
    ["SVG 데이터 URL", { type: "image_url", image_url: { url: "data:image/svg+xml;base64,AAAA" } }],
    ["오디오 입력", { type: "input_audio", input_audio: { data: "x", format: "wav" } }],
  ])("지원하지 않는 입력은 보내지 않는다: %s", (_name, part) => {
    expect(() => openAiChatToClaudeRequest({
      messages: [{ role: "user", content: [part] }],
    }, { model: "claude-opus-5-5" })).toThrow(ClaudeBridgeError);
  });

  it("너무 큰 이미지는 거절한다", () => {
    const huge = `data:image/png;base64,${"A".repeat(7_000_001)}`;
    expect(() => openAiChatToClaudeRequest({
      messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: huge } }] }],
    }, { model: "claude-opus-5-5" })).toThrow(/너무 커요/u);
  });

  it.each([
    ["메시지 없음", {}],
    ["빈 메시지", { messages: [] }],
    ["스트리밍", { messages: [{ role: "user", content: "x" }], stream: true }],
    ["n>1", { messages: [{ role: "user", content: "x" }], n: 2 }],
    ["도구", { messages: [{ role: "user", content: "x" }], tools: [{}] }],
    ["도구 선택", { messages: [{ role: "user", content: "x" }], tool_choice: "auto" }],
    ["도구 역할", { messages: [{ role: "user", content: "x" }, { role: "tool", content: "y" }] }],
    ["어시스턴트가 첫 메시지", { messages: [{ role: "assistant", content: "x" }] }],
    ["시스템만", { messages: [{ role: "system", content: "x" }] }],
  ])("옮길 수 없는 요청은 오류다: %s", (_name, body) => {
    expect(() => openAiChatToClaudeRequest(body, { model: "claude-opus-5-5" })).toThrow(ClaudeBridgeError);
  });

  it("stop 시퀀스를 옮기고 개수를 제한한다", () => {
    const { params } = openAiChatToClaudeRequest({
      messages: [{ role: "user", content: "x" }],
      stop: Array.from({ length: 12 }, (_value, index) => `s${index}`),
    }, { model: "claude-opus-5-5" });
    expect(params.stop_sequences).toHaveLength(8);
    expect(openAiChatToClaudeRequest({
      messages: [{ role: "user", content: "x" }],
      stop: "###",
    }, { model: "claude-opus-5-5" }).params.stop_sequences).toEqual(["###"]);
  });
});

describe("Claude → OpenAI 응답 번역", () => {
  it("텍스트 블록만 이어 붙이고 사고 블록은 제외한다", () => {
    const result = message({
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: "첫째 ", citations: null },
        { type: "text", text: "둘째", citations: null },
      ] as Anthropic.Message["content"],
    });
    expect(claudeMessageText(result)).toBe("첫째 둘째");
    expect(claudeMessageToOpenAiChat(result).choices[0]?.message.content).toBe("첫째 둘째");
  });

  it("사용량에 캐시 토큰을 포함해 합산한다", () => {
    const result = message({
      usage: {
        ...message().usage,
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 100,
        cache_creation_input_tokens: 20,
      },
    });
    expect(claudeMessageToOpenAiChat(result).usage).toEqual({
      prompt_tokens: 130,
      completion_tokens: 5,
      total_tokens: 135,
      cache_read_input_tokens: 100,
      cache_creation_input_tokens: 20,
    });
  });

  it("종료 사유를 OpenAI finish_reason으로 옮긴다", () => {
    expect(claudeStopToFinishReason("end_turn")).toBe("stop");
    expect(claudeStopToFinishReason("stop_sequence")).toBe("stop");
    expect(claudeStopToFinishReason("max_tokens")).toBe("length");
    expect(claudeStopToFinishReason("model_context_window_exceeded")).toBe("length");
    expect(claudeStopToFinishReason("pause_turn")).toBe("length");
    expect(claudeStopToFinishReason("refusal")).toBe("content_filter");
    expect(claudeStopToFinishReason("tool_use")).toBe("tool_calls");
    expect(claudeStopToFinishReason(null)).toBe("stop");
  });

  it("모델·요청 ID를 보존한다", () => {
    const withRequestId = Object.assign(message(), { _request_id: "req_abc" });
    const converted = claudeMessageToOpenAiChat(withRequestId);
    expect(converted.model).toBe("claude-sonnet-5-5");
    expect(converted.requestId).toBe("req_abc");
    expect(converted.object).toBe("chat.completion");
  });
});
