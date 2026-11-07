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

  it("handles KST midnight (+09:00), month-end/year-end transitions, and rejects invalid calendar dates", () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const demo = createProductionDemoProject();
    const boundaryFixtures = [
      { title: "9월말 자정 마감 작업", dueAt: "2026-09-30T00:00:00+09:00", expectedDate: "2026-09-30" },
      { title: "10월초 자정 마감 작업", dueAt: "2026-10-01T00:00:00+09:00", expectedDate: "2026-10-01" },
      { title: "연말 자정 마감 콘티 검수", dueAt: "2026-12-31T00:00:00+09:00", expectedDate: "2026-12-31" },
      { title: "연말 막바지 마감 배경 검수", dueAt: "2026-12-31T23:59:59+09:00", expectedDate: "2026-12-31" },
      { title: "신년 자정 오픈 식자 검수", dueAt: "2027-01-01T00:00:00+09:00", expectedDate: "2027-01-01" },
    ];
    const aggregate = {
      ...demo,
      tasks: demo.tasks.map((task, idx) =>
        boundaryFixtures[idx]
          ? { ...task, title: boundaryFixtures[idx]!.title, dueAt: boundaryFixtures[idx]!.dueAt }
          : task,
      ),
    };

    render(<ProductionScheduleWorkspace aggregate={aggregate} execute={execute} canEdit />);

    for (const item of boundaryFixtures) {
      const input = screen.getByLabelText(`${item.title} 마감일`) as HTMLInputElement;
      expect(input.value).toBe(item.expectedDate);
    }

    fireEvent.change(screen.getByLabelText("구간 시작일 선택"), {
      target: { value: "2026-12-25" },
    });
    expect(screen.getByText(/표시 구간: 2026-12-25 – 2027-01-07/u)).toBeTruthy();

    // Invalid calendar date (2026-02-30) is ignored without corrupting windowStart
    fireEvent.change(screen.getByLabelText("구간 시작일 선택"), {
      target: { value: "2026-02-30" },
    });
    expect(screen.getByText(/표시 구간: 2026-12-25 – 2027-01-07/u)).toBeTruthy();

    // Shifting 2026-09-30 by +1 day crosses month-end to 2026-10-01 in KST
    fireEvent.click(screen.getByRole("button", { name: "9월말 자정 마감 작업 마감 1일 늦추기" }));
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-task",
        task: expect.objectContaining({
          dueAt: new Date("2026-10-01T09:00:00+09:00").toISOString(),
        }),
      }),
      "9월말 자정 마감 작업 마감일을 +1일 조정했습니다.",
    );

    // Shifting 2026-12-31 by +1 day crosses year-end to 2027-01-01 in KST
    fireEvent.click(screen.getByRole("button", { name: "연말 자정 마감 콘티 검수 마감 1일 늦추기" }));
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-task",
        task: expect.objectContaining({
          dueAt: new Date("2027-01-01T09:00:00+09:00").toISOString(),
        }),
      }),
      "연말 자정 마감 콘티 검수 마감일을 +1일 조정했습니다.",
    );
  });

  it("caps 20 same-day tasks in calendar cells, preserves selectedDate and filters across calendar/list/edit cancel/save, and manages focus", () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const demo = createProductionDemoProject();
    const baseTask = demo.tasks[0]!;
    const twentySameDayTasks = Array.from({ length: 20 }, (_, index) => {
      const num = String(index + 1).padStart(2, "0");
      return {
        ...baseTask,
        id: `task-yearend-${num}`,
        title: `연말특집_${num}화_초장문_클라이맥스_전투씬_콘티_선화_배경_식자_통합_검수_작업_LONG_TOKEN_${num}`,
        dueAt: index % 2 === 0 ? "2026-12-31T00:00:00+09:00" : "2026-12-31T18:30:00+09:00",
        status: (index === 0 ? "blocked" : "in-progress") as typeof baseTask.status,
        estimateHours: { optimistic: 4, likely: 10 + index, pessimistic: 24 + index },
      };
    });
    const extraNewYearTask = {
      ...baseTask,
      id: "task-newyear-01",
      title: "신년특집_01화_오프닝_컬러_보정",
      dueAt: "2027-01-01T00:00:00+09:00",
      status: "in-progress" as const,
    };

    render(
      <ProductionScheduleWorkspace
        aggregate={{ ...demo, tasks: [...twentySameDayTasks, extraNewYearTask] }}
        execute={execute}
        canEdit
      />,
    );

    // Filter and sort before entering Calendar view
    const searchInput = screen.getByLabelText("작업 검색") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "특집" } });
    const sortSelect = screen.getByLabelText("작업 정렬") as HTMLSelectElement;
    fireEvent.change(sortSelect, { target: { value: "hours-desc" } });

    const viewGroup = screen.getByRole("group", { name: "일정 보기 방식" });
    fireEvent.click(within(viewGroup).getByRole("button", { name: "캘린더" }));

    // Verify 2026-12-31 cell has >=44px button class and caps inline task articles at 2 before selection
    const dec31Button = screen.getByRole("button", { name: "2026-12-31 날짜 선택 (20건)" });
    expect(dec31Button.className).toContain("production-schedule-calendar-day-button");
    expect(dec31Button.className).toContain("min-h-11");
    expect(dec31Button.className).toContain("min-w-11");
    expect(dec31Button.getAttribute("aria-pressed")).toBe("false");

    const dec31Cell = dec31Button.closest("[data-calendar-day-cell=\"2026-12-31\"]") as HTMLElement;
    expect(within(dec31Cell).getAllByRole("article").length).toBe(2);

    // Click "+18건 더보기" to select 2026-12-31 and open the 20-task detail panel
    fireEvent.click(within(dec31Cell).getByRole("button", { name: "2026-12-31 외 18건 더보기" }));
    expect(dec31Button.getAttribute("aria-pressed")).toBe("true");

    const selectedPanel = screen.getByRole("region", { name: "선택 날짜 일정 상세 (2026-12-31)" });
    expect(within(selectedPanel).getAllByRole("article").length).toBe(20);

    // Switch Calendar -> List: selectedDate (2026-12-31) and filters (query="특집", sort="hours-desc") remain preserved
    fireEvent.click(within(viewGroup).getByRole("button", { name: "목록" }));
    expect(screen.getByRole("heading", { name: "일정 상세 목록 (20)" })).toBeTruthy();
    expect(screen.getByText("선택 날짜: 2026-12-31 (20건)")).toBeTruthy();
    expect(screen.queryByText("신년특집_01화_오프닝_컬러_보정")).toBeNull();
    expect(searchInput.value).toBe("특집");
    expect(sortSelect.value).toBe("hours-desc");

    // Open inline detail editor on the first task (highest hours = task 20) and verify focus moves to title input
    const targetTitle = twentySameDayTasks[19]!.title;
    const editTrigger = screen.getByRole("button", { name: `${targetTitle} 상세 편집` });
    fireEvent.click(editTrigger);

    const titleInput = screen.getByLabelText(`${targetTitle} 제목 편집`) as HTMLInputElement;
    expect(document.activeElement).toBe(titleInput);

    // Cancel editing: focus returns to trigger button, selectedDate and filters remain intact
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(document.activeElement).toBe(editTrigger);
    expect(screen.getByText("선택 날짜: 2026-12-31 (20건)")).toBeTruthy();

    // Re-open and press Escape: focus returns to trigger button
    fireEvent.click(editTrigger);
    const reopenedTitleInput = screen.getByLabelText(`${targetTitle} 제목 편집`);
    fireEvent.keyDown(reopenedTitleInput, { key: "Escape" });
    expect(document.activeElement).toBe(editTrigger);

    // Re-open, edit and Save: focus returns to trigger button, selectedDate and filters remain preserved
    fireEvent.click(editTrigger);
    const hoursInput = screen.getByLabelText(`${targetTitle} 예상 공수 편집`) as HTMLInputElement;
    fireEvent.change(hoursInput, { target: { value: "45" } });
    fireEvent.submit(screen.getByRole("form", { name: `${targetTitle} 상세 편집 폼` }));

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-task",
        task: expect.objectContaining({
          id: "task-yearend-20",
          estimateHours: expect.objectContaining({ likely: 45 }),
        }),
      }),
      `${targetTitle} 세부 일정을 저장했습니다.`,
    );
    expect(document.activeElement).toBe(editTrigger);
    expect(screen.getByText("선택 날짜: 2026-12-31 (20건)")).toBeTruthy();

    // Switch back List -> Calendar: selectedDate (2026-12-31) and filters are still preserved
    fireEvent.click(within(viewGroup).getByRole("button", { name: "캘린더" }));
    expect(screen.getByRole("button", { name: "2026-12-31 날짜 선택 (20건)" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("region", { name: "선택 날짜 일정 상세 (2026-12-31)" })).toBeTruthy();
    expect(searchInput.value).toBe("특집");
    expect(sortSelect.value).toBe("hours-desc");
  });
});
