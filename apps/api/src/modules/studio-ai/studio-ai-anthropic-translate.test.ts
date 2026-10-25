import { describe, expect, it } from "vitest";

import {
  buildAnthropicMessagesRequest,
  parseAnthropicMessagesResponse,
} from "./studio-ai-anthropic-translate";

describe("studio-ai-anthropic-translate", () => {
  it("요청 본문을 만들고 토큰 상한을 지킨다", () => {
    const body = buildAnthropicMessagesRequest({
      model: "claude-haiku-5-5",
      system: "한국어로 답하라",
      messages: [{ role: "user", content: "안녕" }],
      maxTokens: 99999,
    });
    expect(body?.model).toBe("claude-haiku-5-5");
    expect(body?.max_tokens).toBe(4096);
    expect(body?.system).toBe("한국어로 답하라");
  });

  it("빈 메시지는 요청을 만들지 않는다", () => {
    expect(
      buildAnthropicMessagesRequest({
        model: "claude-haiku-5-5",
        messages: [],
        maxTokens: 100,
      }),
    ).toBeNull();
  });

  it("응답을 텍스트와 토큰 사용량으로 파싱한다", () => {
    const parsed = parseAnthropicMessagesResponse({
      content: [{ type: "text", text: "안녕" }],
      usage: { input_tokens: 12, output_tokens: 4 },
    });
    expect(parsed).toEqual({
      ok: true,
      text: "안녕",
      inputTokens: 12,
      outputTokens: 4,
    });
    expect(parseAnthropicMessagesResponse({})).toEqual({
      ok: false,
      reason: "invalid_response",
    });
  });
});
