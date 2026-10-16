/**
 * 캐릭터 챗 프롬프트 컴파일러 테스트 — 캐논 주입과 전사 형식.
 */

import { describe, expect, it } from "vitest";

import { buildCharacterChatProfile } from "./character-chat-profile";
import {
  buildCharacterChatSystemPrompt,
  buildCharacterChatUserPrompt,
  CHARACTER_CHAT_HISTORY_TURNS,
  CHARACTER_CHAT_READ_ALOUD_RULE,
} from "./character-chat-prompt";
import type { CharacterChatMessage } from "./character-chat-types";

const profile = buildCharacterChatProfile(
  {
    characterName: "레이나",
    workTitle: "달 그림자 기사단",
    workSlug: "",
    authorName: "작가김",
    description: "떠돌이 검사",
    personality: "겉은 차갑지만 약자를 못 지나친다.",
    speechStyle: "짧은 반말",
    worldview: "달이 두 개 뜨는 왕국 아르테미아.",
    greeting: "",
    forbiddenTopics: ["왕의 죽음"],
    appearanceHint: "은발, 왼쪽 눈 밑 흉터",
    avatarUrl: "",
    canonSheetId: "",
    chatEnabled: true,
  },
  { id: "p1" },
);

function message(role: "fan" | "character", text: string, index: number): CharacterChatMessage {
  return {
    id: `m${index}`,
    role,
    text,
    createdAt: `2026-10-02T00:0${index}:00.000Z`,
  };
}

describe("buildCharacterChatSystemPrompt", () => {
  it("성격·말투·세계관을 모두 싣는다", () => {
    const prompt = buildCharacterChatSystemPrompt(profile);
    expect(prompt).toContain("레이나");
    expect(prompt).toContain("달 그림자 기사단");
    expect(prompt).toContain("겉은 차갑지만 약자를 못 지나친다.");
    expect(prompt).toContain("짧은 반말");
    expect(prompt).toContain("아르테미아");
    expect(prompt).toContain("은발, 왼쪽 눈 밑 흉터");
  });

  it("금지 주제를 모델 지시로도 명시한다", () => {
    expect(buildCharacterChatSystemPrompt(profile)).toContain("왕의 죽음");
  });

  it("캐릭터 붕괴 방지 규칙이 들어간다", () => {
    const prompt = buildCharacterChatSystemPrompt(profile);
    expect(prompt).toContain("AI");
    expect(prompt).toContain("언급하지 않는다");
  });

  it("낭독 옵션이 꺼져 있으면 프롬프트는 옵션이 생기기 전과 같다", () => {
    const base = buildCharacterChatSystemPrompt(profile);
    expect(base).not.toContain(CHARACTER_CHAT_READ_ALOUD_RULE);
    expect(buildCharacterChatSystemPrompt(profile, {})).toBe(base);
    expect(buildCharacterChatSystemPrompt(profile, { readAloud: false })).toBe(base);
  });

  it("낭독 옵션을 켜면 대화 규칙 안에 읽기 좋은 대사 규칙을 더하고 금지 주제는 그대로 둔다", () => {
    const prompt = buildCharacterChatSystemPrompt(profile, { readAloud: true });
    expect(prompt).toContain(CHARACTER_CHAT_READ_ALOUD_RULE);
    // 규칙은 [대화 규칙] 목록 안에 놓여 금지 주제 지시보다 앞선다.
    expect(prompt.indexOf("[대화 규칙]")).toBeLessThan(prompt.indexOf(CHARACTER_CHAT_READ_ALOUD_RULE));
    expect(prompt.indexOf(CHARACTER_CHAT_READ_ALOUD_RULE)).toBeLessThan(prompt.indexOf("왕의 죽음"));
    expect(prompt).toContain("왕의 죽음");
  });
});

describe("buildCharacterChatUserPrompt", () => {
  it("대화 전사와 새 메시지를 화자 태그로 싣는다", () => {
    const history = [message("character", "…누구지.", 0), message("fan", "안녕!", 1)];
    const prompt = buildCharacterChatUserPrompt(profile, history, "월광검 얘기 해줘");
    expect(prompt).toContain("레이나: …누구지.");
    expect(prompt).toContain("독자: 안녕!");
    expect(prompt).toContain("독자: 월광검 얘기 해줘");
  });

  it("최근 대화 상한까지만 싣는다", () => {
    const history = Array.from({ length: CHARACTER_CHAT_HISTORY_TURNS + 5 }, (_, i) =>
      message(i % 2 === 0 ? "fan" : "character", `메시지${i}`, 0),
    );
    const prompt = buildCharacterChatUserPrompt(profile, history, "새 질문");
    expect(prompt).not.toContain("메시지0");
    expect(prompt).toContain(`메시지${CHARACTER_CHAT_HISTORY_TURNS + 4}`);
  });

  it("긴 메시지는 잘라서 싣는다", () => {
    const prompt = buildCharacterChatUserPrompt(profile, [], "가".repeat(2000));
    expect(prompt.length).toBeLessThan(1200);
  });
});
