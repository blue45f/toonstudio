import { describe, expect, it } from "vitest";

import {
  buildStoryboardPlanPrompt,
  parseStoryboardPlan,
} from "./studio-ai-storyboard-llm";

describe("studio-ai-storyboard-llm", () => {
  it("전제와 컷 수를 담은 프롬프트를 만든다", () => {
    const prompt = buildStoryboardPlanPrompt({
      premise: "우체통 앞에서 재회",
      characters: ["민지", "준호"],
      styleNotes: "수채화",
      cutCount: 4,
    });
    expect(prompt).toContain("컷 수: 4장");
    expect(prompt).toContain("수채화");
  });

  it("컷 계획 결과를 검증한다", () => {
    const parsed = parseStoryboardPlan(
      JSON.stringify({
        cuts: [
          { id: "cut-1", summary: "재회", camera: "클로즈업", dialogues: ["안녕"] },
        ],
      }),
    );
    expect(parsed).toHaveLength(1);
    expect(parseStoryboardPlan("아님")).toBeNull();
  });
});
