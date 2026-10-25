import { describe, expect, it } from "vitest";

import {
  buildN7DialoguePrompt,
  buildN7SplitPrompt,
  parseN7DialogueResult,
  parseN7SplitResult,
} from "./studio-ai-n7-orchestration";

describe("studio-ai-n7-orchestration", () => {
  it("분할 프롬프트에 스크립트와 JSON 형식을 담는다", () => {
    const prompt = buildN7SplitPrompt("비가 오는 날 우체통 앞에서 만난 두 사람");
    expect(prompt).toContain("JSON으로만 답하라");
    expect(prompt).toContain("비가 오는 날");
  });

  it("분할 결과를 검증하고 형식이 아니면 null을 돌려준다", () => {
    const ok = parseN7SplitResult(
      JSON.stringify({ cuts: [{ id: "cut-1", summary: "만남" }] }),
    );
    expect(ok).toHaveLength(1);
    expect(parseN7SplitResult("JSON이 아님")).toBeNull();
    expect(
      parseN7SplitResult(JSON.stringify({ cuts: [{ id: "cut-1" }] })),
    ).toBeNull();
  });

  it("대사 배치 프롬프트와 결과를 검증한다", () => {
    const prompt = buildN7DialoguePrompt(
      [{ id: "cut-1", summary: "만남" }],
      ["민지"],
    );
    expect(prompt).toContain("민지");
    const parsed = parseN7DialogueResult(
      JSON.stringify({ dialogues: [{ cutId: "cut-1", lines: ["안녕"] }] }),
    );
    expect(parsed?.[0]?.lines).toEqual(["안녕"]);
  });
});
