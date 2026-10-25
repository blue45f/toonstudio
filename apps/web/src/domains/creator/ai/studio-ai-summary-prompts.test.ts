import { describe, expect, it } from "vitest";

import {
  buildPlotSummaryPrompt,
  buildSynopsisDraftPrompt,
} from "./studio-ai-summary-prompts";

describe("studio-ai-summary-prompts", () => {
  it("줄거리 요약 프롬프트에 문장 수와 원고를 담는다", () => {
    const prompt = buildPlotSummaryPrompt(["1컷: 만남", "2컷: 이별"], 3);
    expect(prompt).toContain("3문장 이내");
    expect(prompt).toContain("1컷: 만남");
  });

  it("시놉시스 초안 프롬프트에 구성을 담는다", () => {
    const prompt = buildSynopsisDraftPrompt({
      premise: "우체통의 편지",
      characters: ["민지"],
      tone: "따뜻함",
    });
    expect(prompt).toContain("로그라인 1문장");
    expect(prompt).toContain("따뜻함");
  });
});
