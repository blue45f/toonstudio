// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { blankTask, emptyBoard } from "@toonstudio/contracts/admin-cloud-workboard";
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
});
