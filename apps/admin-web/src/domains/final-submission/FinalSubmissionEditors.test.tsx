// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createEmptyFinalSubmissionBoard, validateBoard } from "@toonstudio/contracts/final-submission";
import { afterEach, describe, expect, it, vi } from "vitest";

import { submissionCsv } from "./final-submission-ui";
import { FinalSubmissionDocumentEditor } from "./FinalSubmissionDocumentEditor";
import { FinalSubmissionImport } from "./FinalSubmissionImport";
import { FinalSubmissionTaskEditor } from "./FinalSubmissionTaskEditor";

import type { BoardState } from "@toonstudio/contracts/final-submission";

afterEach(cleanup);

describe("최종 제출 편집·가져오기 안전 경계", () => {
  it("실행 승인 항목의 상태를 잠그고 다음 조치만 기록한다", () => {
    const board = createEmptyFinalSubmissionBoard(); const task = board.tasks.find((item) => item.id === "ACTION-03")!;
    const commit = vi.fn((_candidate: BoardState) => null);
    render(<FinalSubmissionTaskEditor initial={task} board={board} onCommit={commit} onClose={vi.fn()} disabled={false} />);
    expect((screen.getByRole("combobox", { name: "관리 상태" }) as HTMLSelectElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("다음 조치"), { target: { value: "확인 화면 근거를 먼저 기록" } });
    fireEvent.click(screen.getByRole("button", { name: "점검 기록 반영" }));
    const saved = commit.mock.calls[0]?.[0] as unknown as BoardState;
    expect(saved.tasks.find((item) => item.id === task.id)).toMatchObject({ status: "승인 대기", approvalRequired: true, unresolved: true, nextAction: "확인 화면 근거를 먼저 기록" });
    expect(screen.queryByRole("button", { name: "실제 제출" })).toBeNull();
  });

  it("근거가 없는 최종 확인은 반영 실패와 함께 입력을 유지한다", () => {
    const board = createEmptyFinalSubmissionBoard(); const task = board.tasks.find((item) => item.id === "CHECK-01")!;
    const close = vi.fn();
    const commit = vi.fn((candidate: BoardState) => validateBoard(candidate, board).join(" · ") || null);
    render(<FinalSubmissionTaskEditor initial={task} board={board} onCommit={commit} onClose={close} disabled={false} />);
    fireEvent.change(screen.getByRole("combobox", { name: "관리 상태" }), { target: { value: "최종 확인" } });
    fireEvent.click(screen.getByRole("button", { name: "점검 기록 반영" }));
    expect(screen.getByRole("alert").textContent).toContain("근거");
    expect(close).not.toHaveBeenCalled();
    expect((screen.getByRole("combobox", { name: "관리 상태" }) as HTMLSelectElement).value).toBe("최종 확인");
  });

  it("관리 파일의 버전을 바꾸면 기존 최종본·첨부 일치와 연결 점검을 다시 확인하게 한다", () => {
    const board = createEmptyFinalSubmissionBoard(); const document = board.documents[0]!;
    Object.assign(document, { fileName: "report-r1.docx", version: "r1", sourceUrl: "https://example.com/report", availability: "내용 확인", candidateState: "최종본 확정", candidateEvidence: "https://example.com/review", finalizedAt: "2026-11-24T09:00:00+09:00", lastConfirmedAt: "2026-11-24T09:00:00+09:00", formatStatus: "적합 확인", notes: "파일을 열어 형식 확인" });
    Object.assign(document.platform, { status: "제출 확인", fileName: "report-r1.docx", evidenceUrl: "https://example.com/receipt", observedAt: "2026-11-24T09:00:00+09:00", comparison: "일치 확인", comparisonNote: "관찰한 파일과 대조" });
    Object.assign(board.tasks[0]!, { status: "최종 확인", unresolved: false, confirmedBy: "검토자", confirmationNote: "확정 근거 대조", lastConfirmedAt: "2026-11-24T09:00:00+09:00", evidenceLinks: [{ label: "확정 근거", url: "https://example.com/review" }] });
    const commit = vi.fn((_candidate: BoardState) => null);
    render(<FinalSubmissionDocumentEditor initial={document} board={board} onCommit={commit} onClose={vi.fn()} disabled={false} />);
    fireEvent.change(screen.getByLabelText("관리 버전"), { target: { value: "r2" } });
    fireEvent.click(screen.getByRole("button", { name: "비교 기록 반영" }));
    const saved = commit.mock.calls[0]![0];
    expect(saved.documents[0]).toMatchObject({ version: "r2", candidateState: "검토 후보", candidateEvidence: "", finalizedAt: "", formatStatus: "미확인", platform: { comparison: "미확인", status: "제출 확인" } });
    expect(saved.tasks[0]).toMatchObject({ status: "검토 필요", unresolved: true, lastConfirmedAt: "" });
  });

  it("플랫폼 첨부 버전이 바뀌면 비교 확인을 잠그고 관리 파일 확정 상태는 유지한다", () => {
    const board = createEmptyFinalSubmissionBoard(); const document = board.documents[0]!;
    Object.assign(document, { fileName: "report.docx", candidateState: "최종본 확정", candidateEvidence: "https://example.com/review", finalizedAt: "2026-11-24T09:00:00+09:00" });
    Object.assign(document.platform, { fileName: "report.docx", version: "r1", status: "제출 확인", evidenceUrl: "https://example.com/receipt", observedAt: "2026-11-24T09:00:00+09:00", comparison: "일치 확인", comparisonNote: "첨부 대조 완료" });
    const commit = vi.fn((_candidate: BoardState) => null);
    render(<FinalSubmissionDocumentEditor initial={document} board={board} onCommit={commit} onClose={vi.fn()} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "플랫폼 관찰" }));
    fireEvent.change(screen.getByLabelText("플랫폼에서 확인한 버전"), { target: { value: "r2" } });
    const comparison = screen.getByRole("combobox", { name: "플랫폼 첨부와 비교" }) as HTMLSelectElement;
    expect(comparison.disabled).toBe(true); expect(comparison.value).toBe("미확인");
    fireEvent.click(screen.getByRole("button", { name: "비교 기록 반영" }));
    expect(commit.mock.calls[0]?.[0].documents[0]).toMatchObject({ candidateState: "최종본 확정", platform: { version: "r2", comparison: "미확인" } });
  });

  it("Sites JSON은 검토·교체 확인 전에는 반영하지 않고 현재 서버 버전을 이어간다", () => {
    const board = createEmptyFinalSubmissionBoard(); board.revision = 7;
    const imported = createEmptyFinalSubmissionBoard(); imported.revision = 92; imported.tasks[0]!.nextAction = "가져온 기록의 다음 조치";
    const commit = vi.fn((_candidate: BoardState) => null);
    render(<FinalSubmissionImport board={board} onCommit={commit} onClose={vi.fn()} disabled={false} />);
    fireEvent.click(screen.getByText("JSON을 직접 붙여넣기"));
    fireEvent.change(screen.getByLabelText("가져올 점검 보드 JSON"), { target: { value: JSON.stringify({ board: imported, history: [], exportedAt: "2026-11-24T00:00:00Z" }) } });
    fireEvent.click(screen.getByRole("button", { name: "가져올 기록 검증" }));
    expect(screen.getByRole("heading", { name: "가져오기 검토" })).toBeTruthy();
    expect(screen.getByText(/가져온 원본 저장 버전 92/u)).toBeTruthy();
    expect((screen.getByRole("button", { name: "검토한 기록 반영" }) as HTMLButtonElement).disabled).toBe(true);
    expect(commit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /현재 화면의 전체 기록/u }));
    fireEvent.click(screen.getByRole("button", { name: "검토한 기록 반영" }));
    expect(commit.mock.calls[0]?.[0]).toMatchObject({ revision: 7 });
    expect(commit.mock.calls[0]?.[0].tasks[0]?.nextAction).toBe("가져온 기록의 다음 조치");
  });

  it("승인 항목을 제거한 JSON은 검토 단계에서 거절한다", () => {
    const board = createEmptyFinalSubmissionBoard(); const imported = structuredClone(board); imported.tasks = imported.tasks.filter((task) => task.id !== "ACTION-01");
    const commit = vi.fn();
    render(<FinalSubmissionImport board={board} onCommit={commit} onClose={vi.fn()} disabled={false} />);
    fireEvent.click(screen.getByText("JSON을 직접 붙여넣기"));
    fireEvent.change(screen.getByLabelText("가져올 점검 보드 JSON"), { target: { value: JSON.stringify(imported) } });
    fireEvent.click(screen.getByRole("button", { name: "가져올 기록 검증" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toContain("승인");
    expect(commit).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "검토한 기록 반영" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("첫 어드민 가져오기는 근거가 있는 원본 최종 확인을 보존한다", () => {
    const board = createEmptyFinalSubmissionBoard(); const imported = createEmptyFinalSubmissionBoard();
    Object.assign(imported.documents[0]!, { fileName: "checked-report.docx", candidateState: "최종본 확정", candidateEvidence: "https://example.com/review", finalizedAt: "2026-11-24T09:00:00+09:00" });
    Object.assign(imported.tasks[0]!, { status: "최종 확인", unresolved: false, confirmedBy: "검토자", confirmationNote: "확정 근거 대조", lastConfirmedAt: "2026-11-24T09:00:00+09:00", evidenceLinks: [{ label: "확정 근거", url: "https://example.com/review" }] });
    const commit = vi.fn((_candidate: BoardState) => null);
    render(<FinalSubmissionImport board={board} onCommit={commit} onClose={vi.fn()} disabled={false} />);
    fireEvent.click(screen.getByText("JSON을 직접 붙여넣기"));
    fireEvent.change(screen.getByLabelText("가져올 점검 보드 JSON"), { target: { value: JSON.stringify({ board: imported }) } });
    fireEvent.click(screen.getByRole("button", { name: "가져올 기록 검증" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /현재 화면의 전체 기록/u }));
    fireEvent.click(screen.getByRole("button", { name: "검토한 기록 반영" }));
    expect(commit.mock.calls[0]?.[0].tasks[0]?.status).toBe("최종 확인");
    expect(commit.mock.calls[0]?.[0].documents[0]?.candidateState).toBe("최종본 확정");
  });

  it("열린 편집창 뒤에서 서버 버전이 바뀌면 오래된 입력을 최신 기록에 반영하지 않는다", () => {
    const board = createEmptyFinalSubmissionBoard(); const task = board.tasks[0]!; const commit = vi.fn();
    const view = render(<FinalSubmissionTaskEditor initial={task} board={board} onCommit={commit} onClose={vi.fn()} disabled={false} />);
    fireEvent.change(screen.getByLabelText("다음 조치"), { target: { value: "이전 버전에서 작성한 조치" } });
    view.rerender(<FinalSubmissionTaskEditor initial={task} board={{ ...board, revision: 1 }} onCommit={commit} onClose={vi.fn()} disabled={false} />);
    expect(screen.getByRole("alert").textContent).toContain("서버 저장 버전이 바뀌었습니다");
    expect((screen.getByRole("button", { name: "점검 기록 반영" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("다음 조치") as HTMLTextAreaElement).value).toBe("이전 버전에서 작성한 조치");
    expect(commit).not.toHaveBeenCalled();
  });

  it("가져오기 검토 이후 서버 버전이 바뀌면 미리보기와 교체 확인을 다시 요구한다", () => {
    const board = createEmptyFinalSubmissionBoard(); const commit = vi.fn();
    const view = render(<FinalSubmissionImport board={board} onCommit={commit} onClose={vi.fn()} disabled={false} />);
    fireEvent.click(screen.getByText("JSON을 직접 붙여넣기"));
    fireEvent.change(screen.getByLabelText("가져올 점검 보드 JSON"), { target: { value: JSON.stringify(board) } });
    fireEvent.click(screen.getByRole("button", { name: "가져올 기록 검증" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /현재 화면의 전체 기록/u }));
    view.rerender(<FinalSubmissionImport board={{ ...board, revision: 1 }} onCommit={commit} onClose={vi.fn()} disabled={false} />);
    expect((screen.getByRole("button", { name: "검토한 기록 반영" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "현재 저장 버전으로 다시 검토" }));
    expect((screen.getByRole("checkbox", { name: /현재 화면의 전체 기록/u }) as HTMLInputElement).checked).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it("CSV의 파일명·조치에 수식 실행 접두사를 남기지 않는다", () => {
    const board = createEmptyFinalSubmissionBoard(); board.tasks[0]!.fileName = "=FORMULA()"; board.tasks[0]!.nextAction = "+123";
    const csv = submissionCsv(board);
    expect(csv).toContain('"\'=FORMULA()"'); expect(csv).toContain('"\'+123"');
    board.tasks[0]!.fileName = " \t=FORMULA()"; board.tasks[0]!.nextAction = "\n=FORMULA()";
    const spaced = submissionCsv(board);
    expect(spaced).toContain('"\' \t=FORMULA()"'); expect(spaced).toContain('"\'\n=FORMULA()"');
  });
});
