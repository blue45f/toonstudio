import { describe, expect, it } from "vitest";

import {
  contextNoteToPromptContext,
  createContextNote,
  mergeContextNote,
  sanitizeContextNoteItems,
} from "./studio-ai-context-note";

describe("studio-ai-context-note", () => {
  it("공백·빈 항목·중복을 정리한다", () => {
    expect(
      sanitizeContextNoteItems(["  빨강  ", "", "빨강", "파랑"]),
    ).toEqual(["빨강", "파랑"]);
  });

  it("병합하면 바뀐 목록만 교체하고 시각이 갱신된다", () => {
    const prev = createContextNote("work-1", 100);
    const next = mergeContextNote(
      prev,
      { characterRules: ["주인공은 단발"], prohibitions: ["빨강 금지"] },
      200,
    );
    expect(next.characterRules).toEqual(["주인공은 단발"]);
    expect(next.prohibitions).toEqual(["빨강 금지"]);
    expect(next.palette).toEqual([]);
    expect(next.updatedAt).toBe(200);
  });

  it("빈 섹션은 빼고 프롬프트 컨텍스트 블록을 만든다", () => {
    const note = mergeContextNote(createContextNote("work-1", 100), {
      palette: ["파스텔"],
      prohibitions: ["빨강 금지"],
    });
    expect(contextNoteToPromptContext(note)).toBe(
      "팔레트: 파스텔\n금지: 빨강 금지",
    );
    expect(contextNoteToPromptContext(createContextNote("work-2", 100))).toBe(
      "",
    );
  });
});
