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

  it("긴 규칙을 건너뛰고 남은 자리에 다음 캐릭터 규칙·금지 사항·힌트를 담는다", () => {
    const basePrompt = "가".repeat(220);
    const note = mergeContextNote(createContextNote("w1", 1), {
      characterRules: ["가".repeat(120), "민서의 빨간 스카프"],
      prohibitions: ["눈 색 변경"],
    });
    const options = { basePrompt, note, hintFragments: ["나".repeat(150), "밤 장면"] };
    const prompt = composeColorizeContextPrompt(options);
    expect(prompt).toBe(`${basePrompt}, 캐릭터 규칙: 민서의 빨간 스카프, 금지: 눈 색 변경, 밤 장면`);
    expect(composeColorizeContextPrompt({ ...options, basePrompt: prompt })).toBe(prompt);
  });

  it("묶음 전체가 들어가면 기존 작품 노트 서식을 유지한다", () => {
    const note = mergeContextNote(createContextNote("w1", 1), {
      characterRules: ["검정 머리", "왼쪽 눈 밑 점"],
      palette: ["노랑", "초록"],
    });
    expect(composeColorizeContextPrompt({ basePrompt: "", note }))
      .toBe("캐릭터 규칙: 검정 머리; 왼쪽 눈 밑 점, 팔레트: 노랑, 초록");
  });

  it("300자 경계에서 맞는 항목은 그대로 담고 넘치는 항목은 자르지 않는다", () => {
    const basePrompt = "밤".repeat(295);
    const prompt = composeColorizeContextPrompt({
      basePrompt,
      hintFragments: ["따뜻한 조명"],
      palettePhrase: "파스텔",
    });
    expect(prompt).toBe(`${basePrompt}, 파스텔`);
    expect(prompt).toHaveLength(300);
  });
});
