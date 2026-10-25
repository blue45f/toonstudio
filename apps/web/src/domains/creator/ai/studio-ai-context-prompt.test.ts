import { describe, expect, it } from "vitest";

import { composeColorizeContextPrompt } from "./studio-ai-context-prompt";
import { createContextNote, mergeContextNote } from "./studio-ai-context-note";

describe("studio-ai-context-prompt", () => {
  it("맥락·힌트·팔레트를 기본 프롬프트 뒤에 합성한다", () => {
    const note = mergeContextNote(createContextNote("w1", 1), {
      characterRules: ["빨간 머리는 유지"],
      palette: ["파스텔"],
    });
    const prompt = composeColorizeContextPrompt({
      basePrompt: "밝게 채색",
      note,
      hintFragments: ["머리색 검정"],
      palettePhrase: "파스텔 톤",
    });
    expect(prompt).toContain("밝게 채색");
    expect(prompt).toContain("빨간 머리는 유지");
    expect(prompt).toContain("머리색 검정");
    expect(prompt).toContain("파스텔 톤");
    expect(prompt.length).toBeLessThanOrEqual(300);
  });

  it("이미 들어 있는 문장은 중복 추가하지 않는다", () => {
    const prompt = composeColorizeContextPrompt({
      basePrompt: "머리색 검정, 밝게 채색",
      hintFragments: ["머리색 검정"],
    });
    expect(prompt.match(/머리색 검정/g)?.length).toBe(1);
  });
});
