// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createEmptyFinalSubmissionBoard, FINAL_SUBMISSION_IMPORT_MAX_BYTES, FINAL_SUBMISSION_MAX_BYTES } from "@toonstudio/contracts/final-submission";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FinalSubmissionImport } from "./FinalSubmissionImport";

afterEach(cleanup);

describe("큰 JSON 백업의 파일·붙여넣기 가져오기", () => {
  it.each(["file", "paste"])("%s 입력에서 정상 보드와 이력이 합쳐진 2MiB 초과 백업을 검토한다", async (input) => {
    const current = createEmptyFinalSubmissionBoard();
    const board = createEmptyFinalSubmissionBoard();
    board.sources = Array.from({ length: 170 }, (_, index) => ({ id: `proof-${index}`, title: "검토 근거", url: "", type: "검토", observedAt: "", note: "가".repeat(4000) }));
    const history = Array.from({ length: 100 }, (_, index) => ({ id: `change-${index}`, revision: index + 1, changedAt: "2026-11-25T02:00:00+09:00", summary: "기록".repeat(250) }));
    const text = JSON.stringify({ board, history, exportedAt: "2026-11-25T02:00:00+09:00" }, null, 2);
    const size = new TextEncoder().encode(text).byteLength;
    expect(size).toBeGreaterThan(FINAL_SUBMISSION_MAX_BYTES);
    expect(size).toBeLessThan(FINAL_SUBMISSION_IMPORT_MAX_BYTES);
    const commit = vi.fn(() => null);
    render(<FinalSubmissionImport board={current} onCommit={commit} onClose={vi.fn()} disabled={false} />);
    if (input === "file") {
      fireEvent.change(screen.getByLabelText("Sites 또는 어드민 JSON 파일 선택"), { target: { files: [{ name: "board-backup.json", size, text: async () => text }] } });
    } else {
      fireEvent.click(screen.getByText("JSON을 직접 붙여넣기"));
      fireEvent.change(screen.getByLabelText("가져올 점검 보드 JSON"), { target: { value: text } });
      fireEvent.click(screen.getByRole("button", { name: "가져올 기록 검증" }));
    }
    expect(await screen.findByRole("heading", { name: "가져오기 검토" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(commit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /현재 화면의 전체 기록/u }));
    fireEvent.click(screen.getByRole("button", { name: "검토한 기록 반영" }));
    expect(commit).toHaveBeenCalledWith(board, "검증한 JSON으로 최종 제출 점검 기록 가져오기");
  });

  it("8MiB 초과 파일은 내용을 읽기 전에 거절한다", () => {
    const read = vi.fn();
    const commit = vi.fn();
    render(<FinalSubmissionImport board={createEmptyFinalSubmissionBoard()} onCommit={commit} onClose={vi.fn()} disabled={false} />);
    fireEvent.change(screen.getByLabelText("Sites 또는 어드민 JSON 파일 선택"), { target: { files: [{ name: "too-large.json", size: FINAL_SUBMISSION_IMPORT_MAX_BYTES + 1, text: read }] } });
    expect(screen.getByRole("alert").textContent).toContain("8MB");
    expect(read).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "가져오기 검토" })).toBeNull();
  });
});
