import { describe, expect, it } from "vitest";

import { buildMyStoryDraft, composeMyStoryScript } from "./my-story-draft";
import { myStoryInterviewReducer } from "./my-story-interview";
import { createMyStoryLaunchSession } from "./my-story-launch";
import { MY_STORY_ANSWER_MAX_LENGTH } from "./my-story-model";
import { readMyStorySession, writeMyStorySession } from "./my-story-session-store";
import { createMemoryStorage, FIXTURE_AT } from "./my-story-test-fixture";

describe("홈 아이디어에서 질문 흐름 시작", () => {
  it("입력한 상상 이야기를 제목이나 실제 경험으로 바꾸지 않고 첫 답변과 대본에 보존한다", () => {
    const idea = "달에서 길 잃은 로봇이 별빛 서점을 발견한다";
    const session = createMyStoryLaunchSession(null, idea, FIXTURE_AT);
    expect(session.templateId).toBe("free-story");
    expect(session.stage).toBe("ask");
    expect(session.step).toBe(0);
    expect(session.answers).toEqual({ event: idea });
    expect(session.title).toBe("");
    const draft = buildMyStoryDraft(session, "ko");
    expect(draft?.cuts).toHaveLength(4);
    expect(draft && composeMyStoryScript(draft, "ko")).toContain(idea);
    expect(draft?.cuts.some((cut) => cut.blank)).toBe(true);
  });

  it("아이디어를 수정하고 저장한 뒤 다시 읽어도 수정한 내용이 유지된다", () => {
    const storage = createMemoryStorage();
    const initial = createMyStoryLaunchSession(null, "처음 아이디어", FIXTURE_AT);
    const edited = myStoryInterviewReducer(initial, { type: "answer", slot: "event", text: "고쳐 쓴 아이디어", at: FIXTURE_AT });
    expect(writeMyStorySession(storage, edited)).toBe(true);
    expect(readMyStorySession(storage)?.answers.event).toBe("고쳐 쓴 아이디어");
    expect(readMyStorySession(storage)?.templateId).toBe("free-story");
  });

  it("빈 입력은 주제 선택 또는 명시한 기존 주제로 시작하고, 긴 입력에는 기존 답변 한도를 적용한다", () => {
    expect(createMyStoryLaunchSession(null, "  ", FIXTURE_AT).stage).toBe("pick");
    const family = createMyStoryLaunchSession("family", "", FIXTURE_AT);
    expect(family.templateId).toBe("family");
    expect(family.answers).toEqual({});
    expect(createMyStoryLaunchSession(null, "가".repeat(500), FIXTURE_AT).answers.event).toHaveLength(MY_STORY_ANSWER_MAX_LENGTH);
  });
});
