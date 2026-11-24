// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createEmptyFinalSubmissionBoard } from "@toonstudio/contracts/final-submission";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FinalSubmissionBoard } from "./FinalSubmissionBoard";
import { useFinalSubmission } from "./use-final-submission";

vi.mock("./use-final-submission", () => ({ useFinalSubmission: vi.fn() }));

function active(): ReturnType<typeof useFinalSubmission> {
  const board = createEmptyFinalSubmissionBoard(); board.documents[0]!.fileName = "private-report-candidate.docx";
  return { board, revision: 1, updatedAt: "2026-11-24T00:00:00Z", history: [], loading: false, saving: false, dirty: false, denied: false, conflict: false, error: "", notice: "", accessVerified: true, hasPendingSave: false, commit: vi.fn(() => null), importBoard: vi.fn(() => null), persist: vi.fn(async () => undefined), reload: vi.fn(async () => undefined), exportBoard: vi.fn(async () => structuredClone(board)) };
}

beforeEach(() => {
  vi.mocked(useFinalSubmission).mockReset();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  const NativeUrl = URL;
  vi.stubGlobal("URL", class extends NativeUrl { static createObjectURL = vi.fn(() => "blob:private-test"); static revokeObjectURL = vi.fn(); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("최종 제출 보드의 사용자 관찰 경계", () => {
  it("확인하지 못한 플랫폼 파일·제출을 미확인으로 보여주고 필터와 상태 보드를 제공한다", () => {
    vi.mocked(useFinalSubmission).mockReturnValue(active());
    render(<FinalSubmissionBoard userIdentity="owner-test" />);
    expect(screen.getByText(/3\/3개 문서의 실제 제출 여부가 미확인/u)).toBeTruthy();
    expect(screen.getByRole("table").textContent).not.toContain("제출 확인");
    fireEvent.change(screen.getByRole("combobox", { name: "관리 상태" }), { target: { value: "승인 대기" } });
    expect(screen.getByText("17개 중 4개 표시")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "상태 보드" }));
    expect(screen.getByRole("region", { name: "다섯 관리 상태별 점검 보드" })).toBeTruthy();
  });

  it("권한 재확인 중에는 내용과 열린 편집창을 숨기고 확인 후 입력을 이어간다", () => {
    const state = active(); vi.mocked(useFinalSubmission).mockReturnValue(state);
    const view = render(<FinalSubmissionBoard userIdentity="owner-test" />);
    fireEvent.click(screen.getByRole("button", { name: "활동보고서 기록" }));
    fireEvent.change(screen.getByLabelText("관리 버전"), { target: { value: "편집 중 버전" } });
    vi.mocked(useFinalSubmission).mockReturnValue({ ...state, loading: true, accessVerified: false });
    view.rerender(<FinalSubmissionBoard userIdentity="owner-test" />);
    expect(screen.queryByRole("table")).toBeNull(); expect(screen.queryByRole("dialog")).toBeNull();
    vi.mocked(useFinalSubmission).mockReturnValue(state);
    view.rerender(<FinalSubmissionBoard userIdentity="owner-test" />);
    expect((screen.getByLabelText("관리 버전") as HTMLInputElement).value).toBe("편집 중 버전");
  });

  it("권한이 거절된 화면에는 문서명과 편집창이 남지 않는다", () => {
    const state = active(); vi.mocked(useFinalSubmission).mockReturnValue(state);
    const view = render(<FinalSubmissionBoard userIdentity="owner-test" />);
    vi.mocked(useFinalSubmission).mockReturnValue({ ...state, denied: true, board: null, accessVerified: false, error: "권한 거절" });
    view.rerender(<FinalSubmissionBoard userIdentity="owner-test" />);
    expect(screen.getByRole("alert").textContent).toContain("권한 거절");
    expect(document.body.textContent).not.toContain("private-report-candidate.docx");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("내보내기 직전 권한 확인이 실패하면 다운로드 파일을 만들지 않는다", async () => {
    const state = active(); state.exportBoard = vi.fn(async () => null); vi.mocked(useFinalSubmission).mockReturnValue(state);
    render(<FinalSubmissionBoard userIdentity="owner-test" />);
    fireEvent.click(screen.getByRole("button", { name: "전체 기록 JSON" }));
    await waitFor(() => expect(state.exportBoard).toHaveBeenCalledOnce());
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("서버에 저장하는 동안에는 내보내기를 잠근다", () => {
    const state = { ...active(), saving: true }; vi.mocked(useFinalSubmission).mockReturnValue(state);
    render(<FinalSubmissionBoard userIdentity="owner-test" />);
    expect((screen.getByRole("button", { name: "전체 기록 JSON" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "보완 항목 CSV" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "전체 기록 JSON" }));
    expect(state.exportBoard).not.toHaveBeenCalled();
  });

  it("검토한 JSON은 일반 편집 대신 가져오기 전용 검증 경로로 반영한다", () => {
    const state = active(); vi.mocked(useFinalSubmission).mockReturnValue(state);
    render(<FinalSubmissionBoard userIdentity="owner-test" />);
    fireEvent.click(screen.getByRole("button", { name: "Sites JSON 가져오기" }));
    fireEvent.click(screen.getByText("JSON을 직접 붙여넣기"));
    fireEvent.change(screen.getByLabelText("가져올 점검 보드 JSON"), { target: { value: JSON.stringify(state.board) } });
    fireEvent.click(screen.getByRole("button", { name: "가져올 기록 검증" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /현재 화면의 전체 기록/u }));
    fireEvent.click(screen.getByRole("button", { name: "검토한 기록 반영" }));
    expect(state.importBoard).toHaveBeenCalledOnce(); expect(state.commit).not.toHaveBeenCalled();
  });

  it("서버 확인 실패를 빈 초기 보드나 저장 성공으로 표시하지 않는다", () => {
    vi.mocked(useFinalSubmission).mockReturnValue({ ...active(), board: null, revision: null, updatedAt: null, accessVerified: false, error: "저장소를 확인하지 못했습니다." });
    render(<FinalSubmissionBoard userIdentity="owner-test" />);
    expect(screen.getByRole("alert").textContent).toContain("저장소를 확인하지 못했습니다");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "서버에 저장" })).toBeNull();
  });

  it("전체 JSON 교체 없이 기준 자료를 추가하고 기존 참조를 편집한다", () => {
    const state = active(); vi.mocked(useFinalSubmission).mockReturnValue(state);
    const view = render(<FinalSubmissionBoard userIdentity="owner-test" />);
    fireEvent.click(screen.getByRole("button", { name: "기준 자료 추가" }));
    fireEvent.change(screen.getByLabelText("기준 자료 제목"), { target: { value: "새로운 확인 근거" } });
    fireEvent.change(screen.getByLabelText("기준 자료 URL"), { target: { value: "https://example.com/review" } });
    fireEvent.click(screen.getByRole("button", { name: "기준 자료 기록 반영" }));
    expect(state.commit).toHaveBeenCalledOnce(); expect(state.importBoard).not.toHaveBeenCalled();
    const candidate = vi.mocked(state.commit).mock.calls[0]![0];
    expect(candidate.sources[0]).toMatchObject({ title: "새로운 확인 근거", url: "https://example.com/review" });
    vi.mocked(useFinalSubmission).mockReturnValue({ ...state, board: candidate });
    view.rerender(<FinalSubmissionBoard userIdentity="owner-test" />);
    fireEvent.click(screen.getByRole("button", { name: "새로운 확인 근거 기준 자료 편집" }));
    expect((screen.getByLabelText("기준 자료 URL") as HTMLInputElement).value).toBe("https://example.com/review");
  });
});
