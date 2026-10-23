import { describe, expect, it } from "vitest";

import { freeAiConnectionPolicyIssue } from "../free-ai-policy";

import {
  anthropicBaseUrlIssue,
  anthropicConnectionIssue,
  isAnthropicBaseUrl,
  isClaudeModelId,
  userAiWireProtocol,
} from "./claude-protocol";

const connection = {
  baseUrl: "https://api.anthropic.com",
  apiKey: "test-anthropic-key-0000",
  textModel: "claude-sonnet-5-5",
  imageModel: "",
  costPolicy: "user-funded-byok" as const,
};

describe("Claude 연결 식별", () => {
  it("공식 호스트만 Messages 프로토콜로 본다", () => {
    expect(isAnthropicBaseUrl("https://api.anthropic.com")).toBe(true);
    expect(isAnthropicBaseUrl("https://API.Anthropic.com/v1/")).toBe(true);
    expect(userAiWireProtocol({ baseUrl: "https://api.anthropic.com" })).toBe("anthropic-messages");
    expect(userAiWireProtocol({ baseUrl: "https://openrouter.ai/api/v1" })).toBe("openai-compatible");
  });

  it.each([
    "http://api.anthropic.com",
    "https://api.anthropic.com.evil.example",
    "https://evil.example/api.anthropic.com",
    "https://api.anthropic.com@evil.example",
    "https://anthropic.com",
    "https://sub.api.anthropic.com",
    "not a url",
  ])("호스트를 흉내 낸 주소는 거절한다: %s", (baseUrl) => {
    expect(isAnthropicBaseUrl(baseUrl)).toBe(false);
  });

  it("기준 주소는 origin 또는 /v1만 허용한다", () => {
    expect(anthropicBaseUrlIssue("https://api.anthropic.com")).toBeNull();
    expect(anthropicBaseUrlIssue("https://api.anthropic.com/v1")).toBeNull();
    expect(anthropicBaseUrlIssue("https://api.anthropic.com/v1/")).toBeNull();
    for (const bad of [
      "https://api.anthropic.com/v1/messages",
      "https://api.anthropic.com:8443",
      // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- synthetic URL-userinfo rejection fixture
      "https://user:pass@api.anthropic.com",
      "https://api.anthropic.com/?x=1",
      "https://api.anthropic.com/#frag",
      "https://api.anthropic.com/other",
    ]) {
      expect(anthropicBaseUrlIssue(bad), bad).not.toBeNull();
    }
  });

  it("모델 ID 형태를 확인한다", () => {
    expect(isClaudeModelId("claude-opus-5-5")).toBe(true);
    expect(isClaudeModelId("claude-haiku-4-5-20251001")).toBe(true);
    expect(isClaudeModelId("gpt-5")).toBe(false);
    expect(isClaudeModelId("claude-")).toBe(false);
    expect(isClaudeModelId("claude-opus 5")).toBe(false);
  });
});

describe("Claude 연결 정책", () => {
  it("사용자 결제 BYOK 텍스트 연결은 통과한다", () => {
    expect(anthropicConnectionIssue(connection, "text")).toBeNull();
    expect(freeAiConnectionPolicyIssue(connection, "text")).toBeNull();
  });

  it("무료 티어로 표기할 수 없다", () => {
    for (const costPolicy of ["provider-free-tier", "openrouter-free"] as const) {
      expect(freeAiConnectionPolicyIssue({ ...connection, costPolicy }, "text")).toMatch(/무료 티어가 없어요/u);
    }
    expect(freeAiConnectionPolicyIssue({ ...connection, costPolicy: "unverified" }, "text")).toMatch(/비용 정책/u);
  });

  it("텍스트 외 기능·이미지 모델·잘못된 모델 ID는 거절한다", () => {
    expect(freeAiConnectionPolicyIssue(connection, "image")).toMatch(/텍스트 기능/u);
    expect(freeAiConnectionPolicyIssue(connection, "three-d")).toMatch(/텍스트 기능/u);
    expect(freeAiConnectionPolicyIssue({ ...connection, imageModel: "img-1" }, "text")).toMatch(/이미지 생성 모델/u);
    expect(freeAiConnectionPolicyIssue({ ...connection, textModel: "gpt-5" }, "text")).toMatch(/Claude 모델 ID/u);
    expect(freeAiConnectionPolicyIssue({ ...connection, textModel: "" }, "text")).toMatch(/Claude 모델 ID/u);
  });

  it("API 키가 없으면 기존 규칙대로 거절한다", () => {
    expect(freeAiConnectionPolicyIssue({ ...connection, apiKey: " " }, "text")).toMatch(/API 키가 필요/u);
  });

  it("공식 주소 밖의 호스트는 Claude 규칙을 적용받지 않는다", () => {
    expect(freeAiConnectionPolicyIssue({
      ...connection,
      baseUrl: "https://api.example.com/v1",
      textModel: "any-model",
    }, "text")).toBeNull();
  });
});
