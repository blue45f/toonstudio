import { describe, expect, it } from "vitest";

import { CLAUDE_PRESET_IDS, resolveClaudePreset } from "./claude-effort-presets";

const CHOICE = { customModel: "", customDepth: "medium" } as const;

describe("Claude 방식 프리셋", () => {
  it("빠른 점검은 가장 빠른 등급 모델과 얕은 깊이로 푼다", () => {
    expect(resolveClaudePreset("quick", "claude-opus-5-5", CHOICE)).toEqual({ model: "claude-haiku-5-5", depth: "low" });
  });

  it("기본과 정밀은 연결에 정한 모델을 그대로 쓰고 깊이만 다르다", () => {
    expect(resolveClaudePreset("default", "claude-sonnet-5-5", CHOICE)).toEqual({ model: "claude-sonnet-5-5", depth: "medium" });
    expect(resolveClaudePreset("precise", "claude-sonnet-5-5", CHOICE)).toEqual({ model: "claude-sonnet-5-5", depth: "high" });
  });

  it("직접 고르기는 고른 모델과 깊이를 쓰고, 모델을 비우면 연결 기본 모델로 돌아간다", () => {
    expect(resolveClaudePreset("custom", "claude-opus-5-5", { customModel: "claude-fable-5-1", customDepth: "high" }))
      .toEqual({ model: "claude-fable-5-1", depth: "high" });
    expect(resolveClaudePreset("custom", "claude-opus-5-5", { customModel: "", customDepth: "low" }))
      .toEqual({ model: "claude-opus-5-5", depth: "low" });
  });

  it("화면에는 빠른 것부터 직접 고르기까지 네 가지를 이 순서로 보인다", () => {
    expect(CLAUDE_PRESET_IDS).toEqual(["quick", "default", "precise", "custom"]);
  });
});
