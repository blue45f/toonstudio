// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_TITLE_FILTERS } from "@/shared/lib/title-filters";

import { WEEK_DAYS } from "@/shared/lib/taxonomy";

import { CalendarPage } from "./CalendarPage";

const resource = vi.hoisted(() => ({ read: vi.fn(), reload: vi.fn(), download: vi.fn() }));
vi.mock("@/shared/lib/ics", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/shared/lib/ics")>(), downloadIcs: resource.download,
}));
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
    genres: ["fantasy"], tags: [], status: "ongoing", releaseYear: 2026, ageRating: "all",
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

function LocationProbe() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="calendar-location">{pathname}{search}{hash}</output>;
}

function DetailReturnStub() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>캘린더로 돌아가기</button>;
}

function renderPage(entry = "/calendar") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LocationProbe />
      <Routes>
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/title/:slug" element={<DetailReturnStub />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  resource.download.mockReset();
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


describe("API failure must not mean zero releases", () => {
  it.each([{error:"local backend unavailable"},{loading:true}])("keeps unknown counts distinct from zero: %o", (state) => {
    mockResource(state); renderPage();
    const lede = screen.getByText("수요일").closest("p");
    expect(lede?.textContent).not.toContain("0편");
    expect(screen.queryByText("전체 연재")).toBeNull();
    expect(screen.getByRole("button", {name:/내보내기/}).hasAttribute("disabled")).toBe(true);
  });
});


describe("캘린더 시안 적용 후 기능 보존", () => {
  it("요일 화살표·Home·End 조작이 탭 선택·포커스·목록 제목을 함께 바꾼다", () => {
    renderPage();
    const tabs = screen.getAllByRole("tab");
    fireEvent.keyDown(tabs[2], { key: "Home" });
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[0]);
    expect(within(screen.getByRole("tabpanel")).getByRole("heading").textContent).toBe("월요일 연재 (1편)");
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(tabs[6].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[6], { key: "ArrowRight" });
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(tabs[6].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[6]);
  });

  it("다요일 작품을 내보낼 때는 한 일정과 여러 반복 요일로 합친다", () => {
    const snapshot = staleSnapshot();
    snapshot.days[2].items.push(card("mon-1", "월요 연재작"));
    mockResource({ data: snapshot });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /내보내기/ }));
    expect(resource.download).toHaveBeenCalledTimes(1);
    const [ics, filename] = resource.download.mock.calls[0];
    expect(filename).toBe("toonstudio-calendar.ics");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE");
  });

  it("접힌 조건줄에서도 기억한 필터가 복원되고 빈 결과 초기화가 선택 표시를 복구한다", () => {
    localStorage.setItem("toonstudio-filters-remember", "1");
    localStorage.setItem("toonstudio-filters:calendar", JSON.stringify({ ...EMPTY_TITLE_FILTERS, pricing: ["wait-free"] }));
    renderPage();
    expect(screen.getByRole("button", { name: "기다리면 무료" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /내보내기/ }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /초기화/ }));
    expect(screen.getByRole("button", { name: "전체 연재작" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /내보내기/ }).hasAttribute("disabled")).toBe(false);
    expect(JSON.parse(localStorage.getItem("toonstudio-filters:calendar") ?? "{}").pricing).toEqual([]);
  });

  it("오류에서 재시도 요청은 보존하고 정상 데이터로 복구한다", () => {
    mockResource({ error: "연결 실패" });
    const page = renderPage();
    fireEvent.click(screen.getByRole("button", { name: /다시|재시도/ }));
    expect(resource.reload).toHaveBeenCalledTimes(1);
    mockResource({ data: staleSnapshot() });
    page.rerender(<MemoryRouter><CalendarPage /></MemoryRouter>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /내보내기/ }).hasAttribute("disabled")).toBe(false);
  });
});

describe("캘린더 상세 방문 후 선택한 요일 복원", () => {
  it("URL에 있는 요일은 실제 오늘과 달라도 새로 열었을 때 같은 목록을 보여 준다", () => {
    const entry = "/calendar?utm_source=reading&day=mon&x=1&x=2#weekly";
    const first = renderPage(entry);
    expect(screen.getAllByRole("tab")[0].getAttribute("aria-selected")).toBe("true");
    expect(within(screen.getByRole("tabpanel")).getByRole("heading").textContent).toBe("월요일 연재 (1편)");
    const reloadUrl = screen.getByTestId("calendar-location").textContent ?? "";
    first.unmount();
    renderPage(reloadUrl);
    expect(screen.getAllByRole("tab")[0].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("calendar-location").textContent).toBe(entry);
    // 오늘 표시와 선택한 요일은 별개다. 응답의 옛 월요일을 오늘로 만들지 않는다.
    expect(screen.getByText("수요일").closest("p")?.textContent).toContain("오늘은");
  });

  it("요일 선택과 상세에서 뒤로 가기는 URL·기존 query·fragment와 원카드 복귀 키를 유지한다", () => {
    renderPage("/calendar?utm_source=reading&x=1&x=2#weekly");
    fireEvent.click(screen.getAllByRole("tab")[0]);
    const selectedUrl = screen.getByTestId("calendar-location").textContent ?? "";
    const parsed = new URL(selectedUrl, "http://localhost");
    expect(parsed.searchParams.get("day")).toBe("mon");
    expect(parsed.searchParams.get("utm_source")).toBe("reading");
    expect(parsed.searchParams.getAll("x")).toEqual(["1", "2"]);
    expect(parsed.hash).toBe("#weekly");
    const cardLink = within(screen.getByRole("tabpanel")).getByRole("link", { name: /월요 연재작/u });
    expect(cardLink.getAttribute("data-route-return-focus")).toBe("catalog-calendar:월:mon-1");
    fireEvent.click(cardLink);
    expect(screen.getByTestId("calendar-location").textContent).toBe("/title/mon-1");
    fireEvent.click(screen.getByRole("button", { name: "캘린더로 돌아가기" }));
    expect(screen.getByTestId("calendar-location").textContent).toBe(selectedUrl);
    expect(screen.getAllByRole("tab")[0].getAttribute("aria-selected")).toBe("true");
    expect(within(screen.getByRole("tabpanel")).getByRole("link", { name: /월요 연재작/u }).getAttribute("data-route-return-focus"))
      .toBe("catalog-calendar:월:mon-1");
  });

  it("여러 요일에 나오는 같은 작품의 복귀 키를 요일별로 구분한다", () => {
    const snapshot = staleSnapshot();
    snapshot.days[2].items.push(card("mon-1", "월요 연재작"));
    mockResource({ data: snapshot });
    renderPage("/calendar?day=mon");
    const keys = new Set(screen.getAllByRole("link").filter((link) => link.getAttribute("href") === "/title/mon-1")
      .map((link) => link.getAttribute("data-route-return-focus")));
    expect([...keys]).toEqual(["catalog-calendar:월:mon-1", "catalog-calendar:수:mon-1"]);
  });

  it("오늘 보기는 요일 query만 지우고 다른 값과 실제 오늘 기준을 보존한다", () => {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    try {
      renderPage("/calendar?day=mon&utm_source=reading&x=1&x=2#weekly");
      fireEvent.click(screen.getByRole("button", { name: "오늘 보기" }));
      const parsed = new URL(screen.getByTestId("calendar-location").textContent ?? "", "http://localhost");
      expect(parsed.searchParams.has("day")).toBe(false);
      expect(parsed.searchParams.get("utm_source")).toBe("reading");
      expect(parsed.searchParams.getAll("x")).toEqual(["1", "2"]);
      expect(parsed.hash).toBe("#weekly");
      expect(screen.getAllByRole("tab")[2].getAttribute("aria-selected")).toBe("true");
    } finally {
      if (descriptor) Object.defineProperty(Element.prototype, "scrollIntoView", descriptor);
      else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it("모르는 요일 값은 URL을 덮어쓰지 않고 실제 오늘로 표시한다", () => {
    renderPage("/calendar?day=unknown&utm_source=reading");
    expect(screen.getAllByRole("tab")[2].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("calendar-location").textContent).toBe("/calendar?day=unknown&utm_source=reading");
  });
});


it("모바일 로딩은 선택한 하루만 보여 주고 데스크톱 7일 보드 구조를 보존한다", () => {
  mockResource({ loading: true });
  const { container } = renderPage("/calendar?day=mon");
  const columns = Array.from(container.querySelectorAll<HTMLElement>("[data-calendar-loading-day]"));
  expect(columns).toHaveLength(7);
  expect(columns.filter((column) => !column.classList.contains("hidden")).map((column) => column.dataset.calendarLoadingDay)).toEqual(["월"]);
  expect(columns.filter((column) => column.classList.contains("xl:block"))).toHaveLength(6);
});
