// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { blankCheck, blankTask, emptyBoard } from "@toonstudio/contracts/admin-cloud-workboard";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CloudWorkBoard } from "./CloudWorkBoard";
import { CloudWorkViews } from "./CloudWorkViews";

import type { Board } from "@toonstudio/contracts/admin-cloud-workboard";

const mocks = vi.hoisted(() => ({ state: vi.fn() }));
vi.mock("./use-cloud-workboard", () => ({ useCloudWorkboard: mocks.state }));
afterEach(cleanup);

function boardWithHistory(): Board {
  return {
    ...emptyBoard(),
    tasks: [{ ...blankTask(), id: "task-a", title: "선택한 작업" }, { ...blankTask(), id: "task-b", title: "다른 작업" }],
    audit: [
      { id: "server-save", at: "", taskId: "cloud-workboard-v1", title: "개인 작업 보드 저장", detail: "작업 2개를 저장했습니다." },
      { id: "legacy-a", at: "", taskId: "task-a", title: "선택한 작업의 과거 이력", detail: "기존 작업 단위 기록" },
      { id: "legacy-b", at: "", taskId: "task-b", title: "다른 작업의 과거 이력", detail: "기존 작업 단위 기록" },
    ],
  };
}

describe("서버 보드 전체 저장 이력", () => {
  it("서버 계약의 보드 전체 이력을 표시하면서 기존 작업별 필터를 보존한다", () => {
    const board = boardWithHistory();
    render(<CloudWorkViews board={board} tasks={[board.tasks[0]]} now={Date.now()} view="activity" layout="table" onEdit={vi.fn()} />);
    expect(screen.getByText("개인 작업 보드 저장")).toBeTruthy();
    expect(screen.getByText("선택한 작업의 과거 이력")).toBeTruthy();
    expect(screen.queryByText("다른 작업의 과거 이력")).toBeNull();
    expect(screen.getByText("보드 전체 저장 기록은 작업 필터와 관계없이 표시됩니다.")).toBeTruthy();
  });

  it("검색·프로젝트 필터 결과가 없어도 보드 전체 저장 이력은 숨기지 않는다", () => {
    render(<CloudWorkViews board={boardWithHistory()} tasks={[]} now={Date.now()} view="activity" layout="table" onEdit={vi.fn()} />);
    expect(screen.getByText("개인 작업 보드 저장")).toBeTruthy();
    expect(screen.queryByText("선택한 작업의 과거 이력")).toBeNull();
    expect(screen.queryByText("변경 이력이 없습니다")).toBeNull();
  });

  it("작업이 0개인 서버 보드에서도 활동 보기를 열 수 있다", () => {
    const history = boardWithHistory();
    mocks.state.mockReturnValue({
      board: { ...emptyBoard(), audit: [history.audit[0]] }, revision: 1, storedAt: null,
      loading: false, saving: false, loadError: "", saveError: "", conflict: false, reload: vi.fn(), commit: vi.fn(),
    });
    render(<CloudWorkBoard onAccessDenied={vi.fn()} />);
    expect(screen.getByText("아직 저장된 작업이 없습니다")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("complementary", { name: "보드 탐색" })).getByRole("button", { name: "활동 기록" }));
    expect(screen.getByText("개인 작업 보드 저장")).toBeTruthy();
    expect(screen.queryByText("아직 저장된 작업이 없습니다")).toBeNull();
  });

  it("가져온 보드 전체 출처 이력을 서버 감사 기록과 구분하여 표시한다", () => {
    const board = { ...emptyBoard(), sourceHistory: [{ id: "import-audit", at: "", taskId: "", title: "Sites 원본 기록", detail: "직접 관측되지 않은 이전 기록" }] };
    render(<CloudWorkViews board={board} tasks={[]} now={Date.now()} view="activity" layout="table" onEdit={vi.fn()} />);
    expect(screen.getByText("Sites 원본 기록")).toBeTruthy();
    expect(screen.getByRole("region", { name: "가져온 출처 이력" })).toBeTruthy();
    expect(screen.queryByText("서버 저장 이력")).toBeNull();
    expect(screen.getByText(/이 서버에서 실행하거나 검증한 이력이 아닙니다/u)).toBeTruthy();
  });

  it("대상 SHA가 바뀐 검증 통과는 단계 표에서 미확인으로 표시한다", () => {
    const now = Date.parse("2026-11-24T00:00:00Z");
    const task = { ...blankTask(), title: "변경된 소스 검증", remoteSha: "b".repeat(40), verificationChecks: [{ ...blankCheck("pre"), label: "단위 검사", state: "통과" as const, subjectSha: "a".repeat(40), observedAt: "2026-11-23T23:00:00Z", evidenceUrl: "https://example.com/check", reason: "이전 SHA에서 통과" }] };
    render(<CloudWorkViews board={{ ...emptyBoard(), tasks: [task] }} tasks={[task]} now={now} view="verification" layout="table" onEdit={vi.fn()} />);
    const phase = screen.getByRole("button", { name: "변경된 소스 검증 병합 전 테스트 기록 편집" });
    expect(within(phase).getByText("미확인")).toBeTruthy();
    expect(within(phase).getByText("0/1 증빙 유효")).toBeTruthy();
    expect(within(phase).queryByText("통과")).toBeNull();
  });
});
