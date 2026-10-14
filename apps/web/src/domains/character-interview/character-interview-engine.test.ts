import { describe, expect, it, vi } from "vitest";

import type { CharacterChatEngine } from "../character-chat/character-chat-engine";
import type { CharacterChatProfile } from "../character-chat/character-chat-types";

import type { CharacterInterviewMessage } from "./character-interview";
import {
  createCharacterInterviewEngine,
  toCharacterChatHistory,
} from "./character-interview-engine";

const profile = { id: "interview-char-1", characterName: "서연" } as CharacterChatProfile;

const history: readonly CharacterInterviewMessage[] = [
  { id: "a", role: "author", text: "질문", createdAt: "2026-10-14T00:00:00.000Z" },
  { id: "b", role: "character", text: "답변", createdAt: "2026-10-14T00:01:00.000Z" },
];

describe("toCharacterChatHistory", () => {
  it("author→fan으로 바꾸고 id·text·시각은 보존한다", () => {
    const converted = toCharacterChatHistory(history);
    expect(converted.map((message) => message.role)).toEqual(["fan", "character"]);
    expect(converted[0]).toMatchObject({ id: "a", text: "질문" });
  });
});

describe("createCharacterInterviewEngine — character-chat 엔진 재사용", () => {
  it("주입된 엔진에 프로필·변환된 기록·신호를 그대로 위임한다", async () => {
    const inner: CharacterChatEngine = {
      id: "byok-user-ai",
      generateReply: vi.fn(async () => ({ ok: true as const, text: "답입니다." })),
    };
    const engine = createCharacterInterviewEngine(inner);
    expect(engine.id).toBe("interview:byok-user-ai");
    const signal = new AbortController().signal;
    const result = await engine.generateReply({
      profile,
      history,
      userText: "새 질문",
      signal,
    });
    expect(result).toEqual({ ok: true, text: "답입니다." });
    const call = vi.mocked(inner.generateReply).mock.calls[0]![0];
    expect(call.profile).toBe(profile);
    expect(call.userText).toBe("새 질문");
    expect(call.signal).toBe(signal);
    expect(call.history.map((message) => message.role)).toEqual(["fan", "character"]);
  });

  it("에러 결과도 변환 없이 통과시킨다", async () => {
    const inner: CharacterChatEngine = {
      id: "unavailable",
      generateReply: async () => ({
        ok: false as const,
        code: "not_configured" as const,
        error: "AI 연결이 아직 설정되지 않았어요.",
      }),
    };
    const engine = createCharacterInterviewEngine(inner);
    const result = await engine.generateReply({ profile, history: [], userText: "질문" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_configured");
  });
});
