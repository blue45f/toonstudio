import { describe, expect, it } from "vitest";

import {
  createMyStorySession,
  myStoryAnsweredCount,
  myStoryAnswerFor,
  myStoryHasProgress,
  myStoryInterviewReducer,
  myStoryProgress,
  myStoryQuestionAt,
  normalizeMyStorySession,
  type MyStoryAction,
  type MyStorySession,
} from "./my-story-interview";
import { FIXTURE_AT } from "./my-story-test-fixture";

const at = FIXTURE_AT;

function run(session: MyStorySession, ...actions: readonly MyStoryAction[]): MyStorySession {
  return actions.reduce(myStoryInterviewReducer, session);
}

const started = run(createMyStorySession(at), { type: "start", templateId: "retrospective", at });

describe("인터뷰 리듀서", () => {
  it("주제를 고르면 첫 질문에서 시작하고 컷 수·톤은 템플릿 기본값을 쓴다", () => {
    expect(started.stage).toBe("ask");
    expect(started.templateId).toBe("retrospective");
    expect(started.step).toBe(0);
    expect(started.cutCount).toBe(8);
    expect(started.toneId).toBe("warm-memory");
    expect(myStoryQuestionAt(started)?.slot).toBe("when");
    expect(myStoryProgress(started)).toEqual({ index: 1, total: 8, answered: 0, percent: 0 });
  });

  it("답변을 적고 다음·이전으로 오간다. 처음 질문에서 이전은 제자리다", () => {
    let session = run(started, { type: "answer", slot: "when", text: "열두 살 여름", at });
    expect(myStoryAnswerFor(session, "when")).toBe("열두 살 여름");
    session = run(session, { type: "next", at });
    expect(session.step).toBe(1);
    session = run(session, { type: "prev", at }, { type: "prev", at });
    expect(session.step).toBe(0);
  });

  it("건너뛴 칸(빈 답변)은 그대로 비어 있고, 마지막 질문 다음은 검토 단계다", () => {
    let session = started;
    for (let index = 0; index < 8; index += 1) session = run(session, { type: "next", at });
    expect(session.stage).toBe("review");
    expect(myStoryAnsweredCount(session)).toBe(0);
    expect(myStoryHasProgress(session)).toBe(false);
  });

  it("검토에서 이전은 마지막 질문으로, goto는 원하는 질문으로 돌아간다", () => {
    const review = run(started, { type: "review", at });
    const back = run(review, { type: "prev", at });
    expect(back.stage).toBe("ask");
    expect(back.step).toBe(7);
    const jump = run(review, { type: "goto", step: 2, at });
    expect(jump.stage).toBe("ask");
    expect(jump.step).toBe(2);
    expect(run(review, { type: "goto", step: 99, at }).step).toBe(7);
    expect(run(review, { type: "goto", step: -3, at }).step).toBe(0);
  });

  it("공백뿐인 답변은 지워지고, 길이는 한도로 잘리며, 템플릿에 없는 칸은 무시한다", () => {
    let session = run(started, { type: "answer", slot: "when", text: "여름", at });
    session = run(session, { type: "answer", slot: "when", text: "   ", at });
    expect(session.answers.when).toBeUndefined();
    session = run(session, { type: "answer", slot: "where", text: "가".repeat(500), at });
    expect(Array.from(session.answers.where ?? "")).toHaveLength(300);
    const safety = run(createMyStorySession(at), { type: "start", templateId: "safety", at });
    const ignored = run(safety, { type: "answer", slot: "when", text: "언제", at });
    expect(ignored).toBe(safety);
  });

  it("답변을 바꾸면 그 칸에서 채택한 AI 나레이션이 풀린다", () => {
    let session = run(started, { type: "answer", slot: "when", text: "열두 살 여름", at });
    session = run(session, { type: "adopt-narration", slot: "when", text: "열두 살, 여름", at });
    expect(session.narrationOverrides.when).toBe("열두 살, 여름");
    session = run(session, { type: "answer", slot: "when", text: "열세 살 여름", at });
    expect(session.narrationOverrides.when).toBeUndefined();
  });

  it("답이 없는 칸에는 AI 문장을 채택할 수 없고, 채택은 직접 풀 수 있다", () => {
    const rejected = run(started, { type: "adopt-narration", slot: "when", text: "새 문장", at });
    expect(rejected.narrationOverrides).toEqual({});
    let session = run(started, { type: "answer", slot: "when", text: "여름", at });
    session = run(session, { type: "adopt-narration", slot: "when", text: "여름 한때", at });
    session = run(session, { type: "clear-narration", slot: "when", at });
    expect(session.narrationOverrides).toEqual({});
  });

  it("지원하지 않는 컷 수·톤은 기본값으로 돌린다", () => {
    const neighborhood = run(createMyStorySession(at), { type: "start", templateId: "neighborhood", at });
    expect(run(neighborhood, { type: "set-cut-count", cutCount: 8, at }).cutCount).toBe(4);
    expect(run(started, { type: "set-cut-count", cutCount: 4, at }).cutCount).toBe(4);
    expect(run(started, { type: "set-tone", toneId: "clear-guide", at }).toneId).toBe("warm-memory");
    expect(run(started, { type: "set-tone", toneId: "steady-record", at }).toneId).toBe("steady-record");
  });

  it("제목은 한도로 자르고, 다른 주제로 시작하면 이전 답변을 버린다", () => {
    expect(Array.from(run(started, { type: "set-title", title: "가".repeat(200), at }).title)).toHaveLength(80);
    const answered = run(started, { type: "answer", slot: "when", text: "여름", at });
    const other = run(answered, { type: "start", templateId: "family", at });
    expect(other.templateId).toBe("family");
    expect(other.answers).toEqual({});
  });

  it("back-to-pick은 주제 선택 단계로 돌리고 reset은 처음으로 되돌린다", () => {
    const answered = run(started, { type: "answer", slot: "when", text: "여름", at });
    const back = run(answered, { type: "back-to-pick", at });
    expect(back.stage).toBe("pick");
    expect(back.answers.when).toBe("여름");
    const reset = run(answered, { type: "reset", at });
    expect(reset).toEqual(createMyStorySession(at));
  });

  it("진행률은 몇 번째 질문이 아니라 얼마나 답했는지를 보여 준다", () => {
    let session = run(started, { type: "answer", slot: "when", text: "여름", at });
    session = run(session, { type: "answer", slot: "where", text: "마당", at }, { type: "next", at }, { type: "next", at });
    expect(myStoryProgress(session)).toEqual({ index: 3, total: 8, answered: 2, percent: 25 });
    expect(myStoryHasProgress(session)).toBe(true);
  });

  it("상태 변경마다 updatedAt이 갱신되고 입력 객체는 바뀌지 않는다", () => {
    const later = "2026-10-15T10:00:00.000Z";
    const next = myStoryInterviewReducer(started, { type: "answer", slot: "when", text: "여름", at: later });
    expect(next.updatedAt).toBe(later);
    expect(started.answers).toEqual({});
    expect(Object.isFrozen(next)).toBe(true);
  });
});

describe("normalizeMyStorySession", () => {
  it("템플릿에 없는 칸·범위를 벗어난 값을 정리하고 답이 없는 칸의 채택본을 버린다", () => {
    const messy: MyStorySession = {
      ...started,
      stage: "ask",
      step: 99,
      cutCount: 8,
      toneId: "clear-guide",
      answers: { when: "여름", message: "한 줄", ...{ not_a_slot: "x" } },
      narrationOverrides: { when: "여름 한때", where: "답이 없는 칸" },
    };
    const normalized = normalizeMyStorySession(messy);
    expect(normalized.step).toBe(7);
    expect(normalized.toneId).toBe("warm-memory");
    expect(normalized.answers).toEqual({ when: "여름", message: "한 줄" });
    expect(normalized.narrationOverrides).toEqual({ when: "여름 한때" });
  });

  it("주제가 없으면 처음 상태로 돌린다", () => {
    const normalized = normalizeMyStorySession({ ...started, templateId: null });
    expect(normalized.stage).toBe("pick");
    expect(normalized.templateId).toBeNull();
  });
});
