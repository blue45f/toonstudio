// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { castFanVote, createFanVotePoll, type FanVotePoll } from "../fan-vote";
import { FanVoteAuthorSummary } from "./fan-vote-author-summary";
import { FanVoteCard } from "./fan-vote-card";

afterEach(() => {
  cleanup();
});

function makePoll(): FanVotePoll {
  const result = createFanVotePoll({
    id: "fv-1",
    workId: "work-1",
    authorId: "author-1",
    topic: "cover-concept",
    question: "어느 표지 시안이 좋나요?",
    options: [{ label: "시안 1" }, { label: "시안 2" }],
    nowMs: 1_000,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.poll;
}

describe("FanVoteCard (독자)", () => {
  it("본편 비개입 고지와 선택지를 보여주고 득표·비율은 보여주지 않는다", () => {
    render(<FanVoteCard poll={makePoll()} readerId="reader-1" onVote={() => undefined} />);

    expect(screen.getByText("이 투표는 본편 이야기 전개와 무관해요. 결과는 작가에게만 집계로 전달됩니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /시안 1/ })).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/표 ·/)).toBeNull();
  });

  it("선택지를 누르면 onVote가 호출되고 내 선택이 표시된다", () => {
    const poll = makePoll();
    const onVote = vi.fn();
    const { rerender } = render(<FanVoteCard poll={poll} readerId="reader-1" onVote={onVote} />);

    fireEvent.click(screen.getByRole("button", { name: /시안 2/ }));
    expect(onVote).toHaveBeenCalledWith(poll.options[1].id);

    const cast = castFanVote(poll, "reader-1", poll.options[1].id);
    if (!cast.ok) throw new Error(cast.reason);
    rerender(<FanVoteCard poll={cast.poll} readerId="reader-1" onVote={onVote} />);
    expect(screen.getByRole("button", { name: /시안 2/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("투표했어요. 마감 전까지 선택을 바꿀 수 있어요.")).toBeTruthy();
  });
});

describe("FanVoteAuthorSummary (작가 전용)", () => {
  it("선택지별 득표와 비율을 집계로 보여준다", () => {
    let poll = makePoll();
    for (const [reader, optionIndex] of [["r1", 0], ["r2", 0], ["r3", 1]] as const) {
      const cast = castFanVote(poll, reader, poll.options[optionIndex].id);
      if (!cast.ok) throw new Error(cast.reason);
      poll = cast.poll;
    }
    render(<FanVoteAuthorSummary poll={poll} />);

    expect(screen.getByText("투표 집계 (작가 전용)")).toBeTruthy();
    expect(screen.getByText("2표 · 66.7%")).toBeTruthy();
    expect(screen.getByText("1표 · 33.3%")).toBeTruthy();
  });
});
