import { describe, expect, it } from "vitest";

import {
  CLAUDE_IMAGE_TOKEN_BOUND,
  claudeImageTokenBound,
  estimateClaudeInputTokenBound,
  estimateClaudeRequestCostCapUsd,
  utf8Length,
} from "./claude-cost-cap";

import type Anthropic from "@anthropic-ai/sdk";

function params(overrides: Partial<Anthropic.MessageCreateParamsNonStreaming> = {}): Anthropic.MessageCreateParamsNonStreaming {
  return { model: "claude-opus-5-5", max_tokens: 1_000, messages: [{ role: "user", content: "x".repeat(300) }], ...overrides };
}

describe("utf8Length", () => {
  it("UTF-8 바이트 수를 센다", () => {
    expect(utf8Length("abc")).toBe(3);
    expect(utf8Length("가나")).toBe(6);
    expect(utf8Length("é")).toBe(2);
    expect(utf8Length("😀")).toBe(4);
    expect(utf8Length("a가😀")).toBe(8);
    expect(utf8Length("")).toBe(0);
  });
});

describe("claudeImageTokenBound", () => {
  it("공식식(가로×세로÷750)보다 크고 최대값을 넘지 않는다", () => {
    expect(claudeImageTokenBound(800, 1_000)).toBeGreaterThan(Math.ceil((800 * 1_000) / 750));
    expect(claudeImageTokenBound(800, 1_000)).toBeLessThan(CLAUDE_IMAGE_TOKEN_BOUND);
    // 2026-10-22 실측: 1568×1568 → 3,139토큰.
    expect(claudeImageTokenBound(1_568, 1_568)).toBeGreaterThanOrEqual(3_139);
    expect(claudeImageTokenBound(1_568, 1_568)).toBeLessThanOrEqual(CLAUDE_IMAGE_TOKEN_BOUND);
    expect(claudeImageTokenBound(10_000, 10_000)).toBe(CLAUDE_IMAGE_TOKEN_BOUND);
  });

  it("크기가 이상하면 최대값으로 본다", () => {
    expect(claudeImageTokenBound(0, 100)).toBe(CLAUDE_IMAGE_TOKEN_BOUND);
    expect(claudeImageTokenBound(Number.NaN, 100)).toBe(CLAUDE_IMAGE_TOKEN_BOUND);
    expect(claudeImageTokenBound(Number.POSITIVE_INFINITY, 100)).toBe(CLAUDE_IMAGE_TOKEN_BOUND);
  });
});

describe("estimateClaudeInputTokenBound", () => {
  it("글은 UTF-8 바이트 수로 세고, 한글은 글자당 3토큰까지 넉넉히 본다", () => {
    const { plainTokens, cachedTokens } = estimateClaudeInputTokenBound(params({ messages: [{ role: "user", content: "가".repeat(100) }] }));
    expect(cachedTokens).toBe(0);
    expect(plainTokens).toBe(300 + 100);
    // 실측 한글 약 1.4~1.6토큰/글자보다 크다.
    expect(plainTokens - 100).toBeGreaterThan(100 * 1.6);
  });

  it("cache_control이 붙은 블록까지는 캐시 대상으로 나눠 센다", () => {
    const { plainTokens, cachedTokens } = estimateClaudeInputTokenBound(params({
      system: [{ type: "text", text: "s".repeat(1_000), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "u".repeat(300) }],
    }));
    expect(cachedTokens).toBe(1_000);
    expect(plainTokens).toBe(300 + 100);
  });

  it("사용자 메시지의 블록에 cache_control이 있으면 그 앞의 시스템 블록도 캐시 대상이다", () => {
    const { plainTokens, cachedTokens } = estimateClaudeInputTokenBound(params({
      system: [{ type: "text", text: "s".repeat(500) }],
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "c".repeat(2_000), cache_control: { type: "ephemeral" } },
          { type: "text", text: "q".repeat(40) },
        ],
      }],
    }));
    expect(cachedTokens).toBe(500 + 2_000);
    expect(plainTokens).toBe(40 + 100);
  });

  it("이미지는 순서대로 준 토큰을 쓰고, 모자라면 최대값으로 본다", () => {
    const content: Anthropic.ContentBlockParam[] = [
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
      { type: "text", text: "t" },
    ];
    const { plainTokens } = estimateClaudeInputTokenBound(params({ messages: [{ role: "user", content }] }), { imageTokens: [1_000] });
    expect(plainTokens).toBe(1_000 + CLAUDE_IMAGE_TOKEN_BOUND + 1 + 100);
  });

  it("base64 이미지 본문의 길이는 글 토큰으로 세지 않는다", () => {
    const content: Anthropic.ContentBlockParam[] = [
      { type: "image", source: { type: "base64", media_type: "image/png", data: "A".repeat(5_000_000) } },
    ];
    const { plainTokens } = estimateClaudeInputTokenBound(params({ messages: [{ role: "user", content }] }), { imageTokens: [1_200] });
    expect(plainTokens).toBe(1_200 + 100);
  });

  it("구조화 출력 스키마와 추가 토큰을 입력에 더한다", () => {
    const schema = { type: "object", properties: { a: { type: "string" } } };
    const { plainTokens } = estimateClaudeInputTokenBound(
      params({ output_config: { format: { type: "json_schema", schema } } }),
      { extraInputTokens: 50 },
    );
    expect(plainTokens).toBe(300 + 100 + utf8Length(JSON.stringify(schema)) + 50);
  });
});

describe("estimateClaudeRequestCostCapUsd", () => {
  it("일반 입력·캐시 쓰기(1.25배)·출력 상한을 합친다", () => {
    const cap = estimateClaudeRequestCostCapUsd("claude-opus-5-5", params({
      max_tokens: 1_000,
      system: [{ type: "text", text: "s".repeat(1_000), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "u".repeat(300) }],
    }));
    // Opus 5.5: 입력 $4/M, 출력 $20/M. 일반 400토큰 + 캐시 쓰기 1,000토큰×1.25 + 출력 1,000토큰.
    expect(cap).toBeCloseTo((400 * 4 + 1_000 * 4 * 1.25 + 1_000 * 20) / 1_000_000, 8);
  });

  it("한글 50줄×240자 같은 큰 입력도 실측 토큰보다 작게 가늠하지 않는다", () => {
    const text = "가나다라 마바사 ".repeat(1_500).slice(0, 12_000);
    const cap = estimateClaudeRequestCostCapUsd("claude-opus-5-5", params({ max_tokens: 10_000, messages: [{ role: "user", content: text }] }));
    const realisticTokens = Math.ceil(12_000 * 1.65);
    const realisticUsd = (realisticTokens * 4 + 10_000 * 20) / 1_000_000;
    expect(cap).not.toBeNull();
    expect(cap as number).toBeGreaterThanOrEqual(realisticUsd);
  });

  it("단가를 모르는 모델이나 비정상 max_tokens는 null이다", () => {
    expect(estimateClaudeRequestCostCapUsd("claude-unknown-9", params())).toBeNull();
    expect(estimateClaudeRequestCostCapUsd("claude-opus-5-5", params({ max_tokens: Number.NaN }))).toBeNull();
    expect(estimateClaudeRequestCostCapUsd("claude-opus-5-5", params({ max_tokens: 0 }))).toBeNull();
  });
});
