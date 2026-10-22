import { describe, expect, it } from "vitest";

import {
  addClaudeTokenUsage,
  CLAUDE_DEFAULT_MODEL_ID,
  CLAUDE_MODEL_CATALOG,
  CLAUDE_TIER_DEFAULT_MODEL,
  claudeModelInfo,
  claudeModelSupportsEffort,
  EMPTY_CLAUDE_TOKEN_USAGE,
  estimateClaudeCostUsd,
} from "./claude-models";

describe("Claude 모델 카탈로그", () => {
  it("모든 등급 기본 모델이 카탈로그에 있고 기본 모델은 Opus 5.5다", () => {
    expect(CLAUDE_DEFAULT_MODEL_ID).toBe("claude-opus-5-5");
    for (const id of Object.values(CLAUDE_TIER_DEFAULT_MODEL)) {
      expect(claudeModelInfo(id), id).toBeDefined();
    }
    expect(new Set(CLAUDE_MODEL_CATALOG.map((model) => model.id)).size).toBe(CLAUDE_MODEL_CATALOG.length);
  });

  it("날짜 접미사 별칭을 같은 모델로 본다", () => {
    expect(claudeModelInfo("claude-haiku-4-5-20251001")?.id).toBe("claude-haiku-4-5");
    expect(claudeModelInfo("CLAUDE-OPUS-5-5")?.id).toBe("claude-opus-5-5");
    expect(claudeModelInfo("claude-unknown-9")).toBeUndefined();
  });

  it("effort는 확인된 모델에만 보낸다", () => {
    for (const id of ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", "claude-opus-4-8", "claude-sonnet-4-6"]) {
      expect(claudeModelSupportsEffort(id), id).toBe(true);
    }
    for (const id of ["claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-sonnet-4-5-20250929", "claude-opus-4-5-20251101", "claude-something-new"]) {
      expect(claudeModelSupportsEffort(id), id).toBe(false);
    }
  });
});

describe("Claude 비용 추정", () => {
  it("입력·출력 단가로 계산한다 (Opus 5.5 $4/$20)", () => {
    const cost = estimateClaudeCostUsd("claude-opus-5-5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(cost?.usd).toBeCloseTo(24, 6);
    expect(cost?.approximate).toBe(false);
  });

  it("캐시 읽기·쓰기 단가를 반영한다", () => {
    const cost = estimateClaudeCostUsd("claude-sonnet-5-5", {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    });
    // 읽기 $0.20 + 쓰기 $2×1.25
    expect(cost?.usd).toBeCloseTo(0.2 + 2.5, 6);
  });

  it("Haiku 5.5는 100K 초과 프롬프트에 상향 단가를 쓰고 캐시 단가는 근사로 표시한다", () => {
    const short = estimateClaudeCostUsd("claude-haiku-5-5", { ...EMPTY_CLAUDE_TOKEN_USAGE, inputTokens: 100_000 });
    const long = estimateClaudeCostUsd("claude-haiku-5-5", { ...EMPTY_CLAUDE_TOKEN_USAGE, inputTokens: 100_001 });
    expect(short?.usd).toBeCloseTo(0.01, 6);
    expect(long?.usd).toBeCloseTo(0.0500005, 6);
    const cached = estimateClaudeCostUsd("claude-haiku-5-5", { ...EMPTY_CLAUDE_TOKEN_USAGE, cacheReadTokens: 10 });
    expect(cached?.approximate).toBe(true);
  });

  it("모르는 모델은 추정하지 않는다", () => {
    expect(estimateClaudeCostUsd("claude-unknown-9", { ...EMPTY_CLAUDE_TOKEN_USAGE, inputTokens: 5 })).toBeNull();
  });

  it("사용량을 더한다", () => {
    expect(addClaudeTokenUsage(
      { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 },
      { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 },
    )).toEqual({ inputTokens: 11, outputTokens: 22, cacheReadTokens: 33, cacheWriteTokens: 44 });
  });
});
