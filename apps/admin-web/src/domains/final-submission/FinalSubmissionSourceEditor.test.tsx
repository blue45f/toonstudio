// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createEmptyFinalSubmissionBoard, validateBoard } from "@toonstudio/contracts/final-submission";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FinalSubmissionSourceEditor } from "./FinalSubmissionSourceEditor";

import type { BoardState, Source } from "@toonstudio/contracts/final-submission";

const original: Source = { id: "source-keep-id", title: "검토 기준", url: "https://example.com/source", type: "검토본", observedAt: "2026-11-24T13:00:00+09:00", note: "반영 범위 확인" };
afterEach(cleanup);

describe("기준 자료 참조 편집", () => {
  it("안전하지 않은 URL을 거절하고 수정 후에도 자료 ID와 원본 문서 기록을 유지한다", () => {
    const board = createEmptyFinalSubmissionBoard(); board.sources = [structuredClone(original)];
    const close = vi.fn(); const commit = vi.fn((candidate: BoardState) => validateBoard(candidate, board).join(" · ") || null);
    render(<FinalSubmissionSourceEditor initial={original} board={board} onCommit={commit} onClose={close} disabled={false} />);
    fireEvent.change(screen.getByLabelText("기준 자료 URL"), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "기준 자료 기록 반영" }));
    expect(screen.getByRole("alert").textContent).toContain("http"); expect(close).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("기준 자료 URL"), { target: { value: "https://example.com/updated" } });
    fireEvent.change(screen.getByLabelText("확인 범위·메모"), { target: { value: "최종 반영 위치를 확인" } });
    fireEvent.click(screen.getByRole("button", { name: "기준 자료 기록 반영" }));
    const candidate = commit.mock.calls.at(-1)![0];
    expect(candidate.sources).toEqual([{ ...original, url: "https://example.com/updated", note: "최종 반영 위치를 확인" }]);
    expect(candidate.documents).toEqual(board.documents); expect(candidate.tasks).toEqual(board.tasks);
    expect(close).toHaveBeenCalledOnce();
  });

  it("권한 확인 대기 또는 새로운 서버 버전에서는 오래된 참조를 반영하지 않는다", () => {
    const board = createEmptyFinalSubmissionBoard(); board.sources = [structuredClone(original)]; const commit = vi.fn();
    const view = render(<FinalSubmissionSourceEditor initial={original} board={board} onCommit={commit} onClose={vi.fn()} disabled />);
    expect((screen.getByLabelText("기준 자료 제목") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "기준 자료 기록 반영" }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<FinalSubmissionSourceEditor initial={original} board={board} onCommit={commit} onClose={vi.fn()} disabled={false} />);
    fireEvent.change(screen.getByLabelText("확인 범위·메모"), { target: { value: "아직 반영하지 않은 메모" } });
    view.rerender(<FinalSubmissionSourceEditor initial={original} board={{ ...board, revision: 1 }} onCommit={commit} onClose={vi.fn()} disabled={false} />);
    expect(screen.getByRole("alert").textContent).toContain("서버 저장 버전이 바뀌었습니다");
    expect((screen.getByLabelText("확인 범위·메모") as HTMLTextAreaElement).value).toBe("아직 반영하지 않은 메모");
    expect((screen.getByRole("button", { name: "기준 자료 기록 반영" }) as HTMLButtonElement).disabled).toBe(true);
    expect(commit).not.toHaveBeenCalled();
  });
});
