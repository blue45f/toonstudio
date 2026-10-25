import { describe, expect, it } from "vitest";

import {
  buildDialogueSuggestPrompt,
  parseDialogueSuggestions,
} from "./studio-ai-dialogue-suggest";

describe("studio-ai-dialogue-suggest", () => {
  it("컷 맥락과 말투 메모를 담은 프롬프트를 만든다", () => {
    const prompt = buildDialogueSuggestPrompt({
      cutSummary: "재회 장면",
      character: "민지",
      voiceNotes: "밝고 직설적",
      existingLines: [],
    });
    expect(prompt).toContain("재회 장면");
    expect(prompt).toContain("밝고 직설적");
  });

  it("대사 후보 결과를 검증한다", () => {
    expect(
      parseDialogueSuggestions(JSON.stringify({ lines: ["안녕", "오랜만이야"] })),
    ).toEqual(["안녕", "오랜만이야"]);
    expect(parseDialogueSuggestions("아님")).toBeNull();
  });

  it("코드 펜스로 감싼 JSON도 파싱한다", () => {
    expect(
      parseDialogueSuggestions(
        "```json\n" + JSON.stringify({ lines: ["안녕", "오랜만이야"] }) + "\n```",
      ),
    ).toEqual(["안녕", "오랜만이야"]);
  });
});
