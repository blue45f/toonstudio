import { describe, expect, it } from "vitest";

import {
  buildReviewInterpretPrompt,
  parseReviewInterpretation,
} from "./studio-ai-review-llm";

describe("studio-ai-review-llm", () => {
  it("코멘트를 구조화 프롬프트로 만든다", () => {
    const prompt = buildReviewInterpretPrompt("3컷 배경 채도를 낮춰줘");
    expect(prompt).toContain("3컷 배경 채도를 낮춰줘");
    expect(prompt).toContain("JSON으로만 답하라");
  });

  it("해석 결과를 검증하고 형식이 아니면 null을 돌려준다", () => {
    const parsed = parseReviewInterpretation(
      JSON.stringify({
        items: [{ targetCut: "cut-3", area: "배경", task: "채도 낮추기" }],
      }),
    );
    expect(parsed).toHaveLength(1);
    expect(parseReviewInterpretation("그냥 문장")).toBeNull();
  });
});
