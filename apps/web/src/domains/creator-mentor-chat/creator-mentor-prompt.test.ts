import { describe, expect, it } from "vitest";

import { getMentorPersona, MENTOR_PERSONAS } from "./creator-mentor-personas";
import {
  buildMentorSystemPrompt,
  buildMentorUserPrompt,
  CREATIVITY_DIRECTIVES,
  DIFFICULTY_DIRECTIVES,
  LENGTH_DIRECTIVES,
} from "./creator-mentor-prompt";
import { DEFAULT_MENTOR_CONTROLS } from "./creator-mentor-types";

describe("멘토 카탈로그 무결성", () => {
  it("페르소나는 5종이고 id가 중복되지 않는다", () => {
    expect(MENTOR_PERSONAS).toHaveLength(5);
    expect(new Set(MENTOR_PERSONAS.map((p) => p.id)).size).toBe(5);
  });

  it("모든 페르소나에 인사·칩·준비된 안내·금지 주제가 비어 있지 않다", () => {
    for (const persona of MENTOR_PERSONAS) {
      expect(persona.greeting.length).toBeGreaterThan(0);
      expect(persona.questionChips.length).toBeGreaterThanOrEqual(3);
      expect(persona.starterTopics.length).toBeGreaterThanOrEqual(3);
      expect(persona.forbiddenTopics.length).toBeGreaterThanOrEqual(1);
      expect(getMentorPersona(persona.id)).toBe(persona);
    }
  });
});

describe("답변 조절 → 프롬프트 지시 변환", () => {
  const persona = getMentorPersona("story-mentor");

  it("기본 조절값이 세 지시를 모두 포함한다", () => {
    const prompt = buildMentorSystemPrompt(persona, DEFAULT_MENTOR_CONTROLS);
    expect(prompt).toContain(DIFFICULTY_DIRECTIVES.standard);
    expect(prompt).toContain(LENGTH_DIRECTIVES.standard);
    expect(prompt).toContain(CREATIVITY_DIRECTIVES.balanced);
    expect(prompt).toContain(persona.expertise[0]);
    expect(prompt).toContain(persona.forbiddenTopics[0]);
  });

  it("조절값을 바꾸면 지시가 실제로 바뀐다 (장식이 아니다)", () => {
    const easy = buildMentorSystemPrompt(persona, {
      difficulty: "easy",
      length: "short",
      creativity: "grounded",
    });
    const deep = buildMentorSystemPrompt(persona, {
      difficulty: "deep",
      length: "detailed",
      creativity: "free",
    });
    expect(easy).toContain(DIFFICULTY_DIRECTIVES.easy);
    expect(easy).toContain(LENGTH_DIRECTIVES.short);
    expect(deep).toContain(DIFFICULTY_DIRECTIVES.deep);
    expect(deep).toContain(CREATIVITY_DIRECTIVES.free);
    expect(easy).not.toBe(deep);
  });
});

describe("대화 기록 프롬프트", () => {
  it("기록이 없으면 사용자 문장만, 있으면 최근 12턴까지만 붙인다", () => {
    expect(buildMentorUserPrompt([], "질문")).toBe("질문");
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? "creator" : "mentor") as "creator" | "mentor",
      text: `턴 ${i}`,
    }));
    const prompt = buildMentorUserPrompt(history, "새 질문");
    expect(prompt).toContain("턴 19");
    expect(prompt).not.toContain("턴 7:");
    expect(prompt.endsWith("창작자: 새 질문")).toBe(true);
  });
});
