// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import { ProductionScheduleWorkspace } from "./ProductionScheduleWorkspace";

const NOW = new Date("2026-09-17T00:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ProductionScheduleWorkspace predictive risk & schedule UX", () => {
  it("uses the shared prediction model for summary, task badges and filtering", () => {
    render(
      <ProductionScheduleWorkspace
        aggregate={createProductionDemoProject()}
        execute={vi.fn().mockResolvedValue(undefined)}
        canEdit
      />,
    );

    expect(screen.getByRole("heading", { name: "일정·용량 작업실" })).toBeTruthy();
    expect(screen.getAllByText("예측 위험").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/현재 작업이 차단되어|마감보다 약|선행 작업/u).length).toBeGreaterThan(0);

    const filter = screen.getByLabelText("위험 필터") as HTMLSelectElement;
    fireEvent.change(filter, { target: { value: "predicted" } });
    expect(filter.value).toBe("predicted");
    expect(screen.getAllByText("예측 위험").length).toBeGreaterThan(1);
    expect(screen.queryByText("현재 필터에 맞는 작업이 없습니다.")).toBeNull();
  });

  it("navigates 2-week windows, jumps to out-of-window tasks, and shifts due dates inline", () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    render(
      <ProductionScheduleWorkspace
        aggregate={createProductionDemoProject()}
        execute={execute}
        canEdit
      />,
    );

    expect(screen.getByText(/표시 구간: 2026-09-15 – 2026-09-28/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다음 2주" }));
    expect(screen.getByText(/표시 구간: 2026-09-29 – 2026-10-12/u)).toBeTruthy();

    const jumpButtons = screen.getAllByRole("button", { name: "마감 구간으로 이동" });
    expect(jumpButtons.length).toBeGreaterThan(0);
    fireEvent.click(jumpButtons[0]!);
    expect(screen.getByText(/표시 구간: 2026-09-15 – 2026-09-28/u)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("구간 시작일 선택"), {
      target: { value: "2026-10-01" },
    });
    expect(screen.getByText(/표시 구간: 2026-10-01 – 2026-10-14/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "오늘 기준" }));
    expect(screen.getByText(/표시 구간: 2026-09-15 – 2026-09-28/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "12화 콘티와 세로 리듬 마감 1일 늦추기" }));
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-task",
        task: expect.objectContaining({
          id: "task-episode-12-thumbnail",
        }),
      }),
      "12화 콘티와 세로 리듬 마감일을 +1일 조정했습니다.",
    );
  });

  it("filters by localized process, assignee, status, sort order, and recovers from empty states", () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    render(
      <ProductionScheduleWorkspace
        aggregate={createProductionDemoProject()}
        execute={execute}
        canEdit
      />,
    );

    const searchInput = screen.getByLabelText("작업 검색") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "선화" } });
    expect(screen.getByText("12화 캐릭터 선화 42컷")).toBeTruthy();
    expect(screen.queryByText("13화 대본 2차 초안")).toBeNull();

    fireEvent.change(searchInput, { target: { value: "존재하지않는일정검색어" } });
    expect(screen.getByText("현재 필터에 맞는 작업이 없습니다.")).toBeTruthy();

    const resetButtons = screen.getAllByRole("button", { name: "필터 초기화" });
    fireEvent.click(resetButtons[0]!);
    expect(searchInput.value).toBe("");
    expect(screen.getByText("13화 대본 2차 초안")).toBeTruthy();

    const statusSelect = screen.getByLabelText("상태 필터") as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: "blocked" } });
    expect(screen.getByText("12화 야간 배경 12컷 외주")).toBeTruthy();
    expect(screen.queryByText("12화 콘티와 세로 리듬")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    const sortSelect = screen.getByLabelText("작업 정렬") as HTMLSelectElement;
    fireEvent.change(sortSelect, { target: { value: "hours-desc" } });
    const headings = screen.getAllByRole("heading", { level: 3 }).map((el) => el.textContent);
    expect(headings[0]).toBe("12화 캐릭터 선화 42컷");
  });

  it("renders long titles safely with title attributes and supports inline task detail editing", () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const demo = createProductionDemoProject();
    const longTitle =
      "12화 초장문 하이라이트 액션 씬 콘티 및 세로 스크롤 카메라 워킹·말풍선 리듬 정밀 검수 작업 SUPER_LONG_UNBROKEN_TOKEN_20261107";
    const aggregate = {
      ...demo,
      tasks: demo.tasks.map((task, index) =>
        index === 0 ? { ...task, title: longTitle } : task,
      ),
    };

    render(
      <ProductionScheduleWorkspace
        aggregate={aggregate}
        execute={execute}
        canEdit
      />,
    );

    const heading = screen.getByRole("heading", { name: longTitle });
    expect(heading.getAttribute("title")).toBe(longTitle);
    expect(heading.className).toContain("production-schedule-task-title");

    fireEvent.click(screen.getByRole("button", { name: `${longTitle} 상세 편집` }));
    const editForm = screen.getByRole("form", { name: `${longTitle} 상세 편집 폼` });
    const titleInput = within(editForm).getByLabelText(`${longTitle} 제목 편집`) as HTMLInputElement;
    const hoursInput = within(editForm).getByLabelText(`${longTitle} 예상 공수 편집`) as HTMLInputElement;

    fireEvent.change(titleInput, { target: { value: "12화 콘티 리듬 압축본" } });
    fireEvent.change(hoursInput, { target: { value: "22" } });
    fireEvent.submit(editForm);

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-task",
        task: expect.objectContaining({
          id: "task-episode-12-thumbnail",
          title: "12화 콘티 리듬 압축본",
          estimateHours: expect.objectContaining({ likely: 22 }),
        }),
      }),
      "12화 콘티 리듬 압축본 세부 일정을 저장했습니다.",
    );
  });

  it("preserves filters and allows status/date editing across timeline, calendar, list, and workload views", () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    render(
      <ProductionScheduleWorkspace
        aggregate={createProductionDemoProject()}
        execute={execute}
        canEdit
      />,
    );

    const searchInput = screen.getByLabelText("작업 검색") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "12화 콘티와 세로 리듬" } });

    const viewGroup = screen.getByRole("group", { name: "일정 보기 방식" });
    fireEvent.click(within(viewGroup).getByRole("button", { name: "캘린더" }));
    expect(screen.getByText("2주 마감 캘린더")).toBeTruthy();
    expect(screen.getByText("12화 콘티와 세로 리듬")).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: "12화 콘티와 세로 리듬 상태" }), {
      target: { value: "approved" },
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-task",
        task: expect.objectContaining({
          id: "task-episode-12-thumbnail",
          status: "approved",
        }),
      }),
      "12화 콘티와 세로 리듬 상태를 변경했습니다.",
    );

    fireEvent.click(within(viewGroup).getByRole("button", { name: "목록" }));
    expect(screen.getByText(/일정 상세 목록/u)).toBeTruthy();
    expect(screen.getByText("12화 콘티와 세로 리듬")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("담당자 필터"), {
      target: { value: "unassigned" },
    });
    fireEvent.click(within(viewGroup).getByRole("button", { name: "워크로드" }));
    expect(screen.getByText("표시할 워크로드가 없습니다")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "목록 보기에서 작업 확인" }));
    expect(screen.getByText("현재 필터에 맞는 작업이 없습니다.")).toBeTruthy();
  });
});
