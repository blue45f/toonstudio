// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WEEK_DAYS } from "@/shared/lib/taxonomy";

import { CalendarPage } from "./CalendarPage";

const resource = vi.hoisted(() => ({ read: vi.fn(), reload: vi.fn() }));
vi.mock("@/platform/use-api-resource", () => ({ useApiResource: resource.read }));

function mockResource(state: { data?: unknown; loading?: boolean; error?: string | null }) {
  resource.read.mockReturnValue({
    data: state.data ?? null,
    loading: state.loading ?? false,
    error: state.error ?? null,
    reload: resource.reload,
  });
}

function card(id: string, title: string) {
  return {
    id,
    slug: id,
    title,
    type: "webtoon",
    cover: ["#111111", "#222222"],
    stats: { ratingAvg: 4.5 },
    availability: [{ platformId: "naver-webtoon", pricing: "free" }],
  };
}

// 월요일에 생성된 스냅샷처럼 todayIdx/todayDay/todayCount 가 옛 날짜로 박제된 응답.
// 화면의 "오늘" 표시는 이 값을 따라가면 안 된다.
function staleSnapshot() {
  return {
    todayIdx: 0,
    todayDay: "월",
    todayCount: 1,
    totalScheduled: 3,
    platformCoverage: [],
    days: WEEK_DAYS.map((day, i) => ({
      day,
      items:
        i === 0
          ? [card("mon-1", "월요 연재작")]
          : i === 2
            ? [card("wed-1", "수요 연재작 1"), card("wed-2", "수요 연재작 2")]
            : [],
    })),
    generatedAt: "2026-10-05T00:00:00.000Z",
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/calendar"]}>
      <CalendarPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  resource.read.mockReset();
  resource.reload.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // 2026-10-07은 수요일이다(QA F1 재현일의 실제 요일).
  vi.setSystemTime(new Date("2026-10-07T12:00:00+09:00"));
  mockResource({ data: staleSnapshot() });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("연재 캘린더 오늘 표시", () => {
  it("데이터를 불러오지 못해도(오류) 오늘 요일은 실제 날짜를 표시한다", () => {
    mockResource({ error: "연결 실패" });
    renderPage();
    expect(screen.getByRole("alert").textContent).toContain("연재 캘린더를 불러오지 못했습니다.");
    expect(screen.getByText("수요일")).toBeTruthy();
    expect(screen.queryByText("월요일")).toBeNull();
  });

  it("불러오는 동안에도 오늘 요일은 실제 날짜를 표시한다", () => {
    mockResource({ loading: true });
    renderPage();
    expect(screen.getByText("수요일")).toBeTruthy();
    expect(screen.queryByText("월요일")).toBeNull();
  });

  it("응답에 박제된 요일을 따라가지 않고 실제 오늘 칸을 오늘로 표시한다", () => {
    renderPage();
    const lede = screen.getByText("수요일").closest("p");
    expect(lede?.textContent).toContain("오늘은");
    // 오늘 편수는 응답의 todayCount(월요일 기준 1편)가 아니라 수요일 칸(2편) 기준이다.
    expect(lede?.textContent).toContain("2편");
    // 데스크톱 그리드의 "오늘" 마커는 수요일 열에 붙는다.
    const todayColumn = screen.getByText("오늘").closest("section");
    expect(todayColumn?.textContent).toContain("수요 연재작 1");
    expect(todayColumn?.textContent).toContain("수요 연재작 2");
    expect(todayColumn?.textContent).not.toContain("월요 연재작");
  });

  it("일요일에는 월요일로 고정되지 않고 일요일을 오늘로 표시한다", () => {
    // 2026-10-11은 일요일이다.
    vi.setSystemTime(new Date("2026-10-11T12:00:00+09:00"));
    mockResource({ error: "연결 실패" });
    renderPage();
    expect(screen.getByText("일요일")).toBeTruthy();
    expect(screen.queryByText("월요일")).toBeNull();
  });
});
