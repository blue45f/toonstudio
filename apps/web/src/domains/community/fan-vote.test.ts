import { describe, expect, it } from "vitest";

import {
  castFanVote,
  closeFanVotePoll,
  createFanVotePoll,
  readerFanVoteView,
  tallyFanVote,
  type FanVotePoll,
  type FanVoteTopic,
} from "./fan-vote";

function makePoll(overrides: Partial<Parameters<typeof createFanVotePoll>[0]> = {}): FanVotePoll {
  const result = createFanVotePoll({
    id: "fv-1",
    workId: "work-1",
    authorId: "author-1",
    topic: "special-episode-lead",
    question: "다음 특별편의 주인공은 누구로 할까요?",
    options: [{ label: "조연 A" }, { label: "조연 B" }],
    nowMs: 1_000,
    ...overrides,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.poll;
}

describe("createFanVotePoll — 본편 비개입 강제", () => {
  it("허용목록 밖 주제(본편 전개)는 타입을 우회해도 거부한다", () => {
    const result = createFanVotePoll({
      id: "fv-x",
      workId: "work-1",
      authorId: "author-1",
      topic: "main-story-direction" as FanVoteTopic,
      question: "다음 전개를 골라 주세요",
      options: [{ label: "A" }, { label: "B" }],
    });
    expect(result).toEqual({ ok: false, reason: "topic-not-allowed" });
  });

  it("허용 주제라도 질문이 본편 전개를 물으면 거부한다", () => {
    const result = createFanVotePoll({
      id: "fv-x",
      workId: "work-1",
      authorId: "author-1",
      topic: "bonus-content",
      question: "본편 전개에서 보고 싶은 장면은?",
      options: [{ label: "A" }, { label: "B" }],
    });
    expect(result).toEqual({ ok: false, reason: "main-story-question" });
  });

  it("표지 시안 투표는 refId를 보존하며 생성된다", () => {
    const poll = makePoll({
      topic: "cover-concept",
      question: "어느 표지 시안이 좋나요?",
      options: [
        { label: "시안 1", refId: "cover-a" },
        { label: "시안 2", refId: "cover-b" },
      ],
    });
    expect(poll.options.map((option) => option.refId)).toEqual(["cover-a", "cover-b"]);
  });

  it("선택지 1개·중복 선택지는 거부한다", () => {
    expect(
      createFanVotePoll({
        id: "fv-x",
        workId: "w",
        authorId: "a",
        topic: "bonus-content",
        question: "q",
        options: [{ label: "하나" }],
      }),
    ).toEqual({ ok: false, reason: "too-few-options" });
    expect(
      createFanVotePoll({
        id: "fv-x",
        workId: "w",
        authorId: "a",
        topic: "bonus-content",
        question: "q",
        options: [{ label: "같은" }, { label: "같은" }],
      }),
    ).toEqual({ ok: false, reason: "duplicate-options" });
  });
});

describe("castFanVote / tallyFanVote", () => {
  it("1인 1표이며 진행 중에는 교체할 수 있고 집계는 작가 전용 함수로만 나온다", () => {
    let poll = makePoll();
    const first = castFanVote(poll, "reader-1", poll.options[0].id);
    if (!first.ok) throw new Error(first.reason);
    poll = first.poll;
    const second = castFanVote(poll, "reader-2", poll.options[0].id);
    if (!second.ok) throw new Error(second.reason);
    poll = second.poll;
    const changed = castFanVote(poll, "reader-1", poll.options[1].id);
    if (!changed.ok) throw new Error(changed.reason);
    poll = changed.poll;

    const tally = tallyFanVote(poll);
    expect(tally.totalVoters).toBe(2);
    expect(tally.entries.map((entry) => entry.count).sort()).toEqual([1, 1]);
    expect(tally.isTie).toBe(true);
  });

  it("마감 후·기간 종료 후 투표는 거부한다", () => {
    const poll = makePoll();
    const closed = closeFanVotePoll(poll);
    expect(castFanVote(closed, "reader-1", poll.options[0].id)).toEqual({
      ok: false,
      reason: "poll-closed",
    });
    const timed = makePoll({ closesInMs: 500 });
    expect(castFanVote(timed, "reader-1", timed.options[0].id, 2_000)).toEqual({
      ok: false,
      reason: "poll-expired",
    });
  });
});

describe("readerFanVoteView — 독자 뷰에는 집계가 없다", () => {
  it("내 선택과 총 참여 인원만 있고 선택지별 득표 필드가 존재하지 않는다", () => {
    let poll = makePoll();
    const cast = castFanVote(poll, "reader-1", poll.options[0].id);
    if (!cast.ok) throw new Error(cast.reason);
    poll = cast.poll;

    const view = readerFanVoteView(poll, "reader-1");
    expect(view.myOptionId).toBe(poll.options[0].id);
    expect(view.totalVoters).toBe(1);
    expect(Object.keys(view).sort()).toEqual(
      ["myOptionId", "options", "pollId", "question", "status", "topic", "totalVoters"].sort(),
    );
    expect(JSON.stringify(view)).not.toContain("count");
    expect(JSON.stringify(view)).not.toContain("percent");
    expect(readerFanVoteView(poll, "reader-9").myOptionId).toBeNull();
  });
});
