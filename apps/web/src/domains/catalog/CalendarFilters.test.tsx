// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EMPTY_TITLE_FILTERS, type TitleFilterState } from "@/shared/lib/title-filters";

import { CalendarFilters } from "./CalendarFilters";

afterEach(cleanup);

function props(filters: TitleFilterState = EMPTY_TITLE_FILTERS) {
  return {
    filters, onChange: vi.fn(), onPreset: vi.fn(),
    platforms: [
      { id: "naver-webtoon" as const, label: "네이버웹툰", color: "#00aa55", count: 12 },
      { id: "kakao-page" as const, label: "카카오페이지", color: "#ffcc00", count: 8 },
    ],
    savedCount: 3, remember: false, onToggleRemember: vi.fn(), actions: <button>일정 내보내기</button>,
  };
}

function togglePanel() {
  fireEvent.click(screen.getByRole("button", { name: /플랫폼·상세 필터/ }));
}

describe("시안 기반 캘린더 조건줄", () => {
  it("세 가지 빠른 조건과 추가 조건을 유지하고 상세 조건은 접어서 시작한다", () => {
    const input = props();
    render(<CalendarFilters {...input} />);
    const quick = screen.getByRole("group", { name: "이용권·연재 방식 빠른 필터" });
    expect(within(quick).getAllByRole("button")).toHaveLength(3);
    expect(within(quick).getByRole("button", { name: "전체 연재작" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("region", { name: "연재 조건과 플랫폼" })).toBeNull();
    expect(screen.getByRole("button", { name: "일정 내보내기" })).toBeTruthy();
    fireEvent.click(within(quick).getByRole("button", { name: "기다리면 무료" }));
    expect(input.onPreset).toHaveBeenCalledWith("wait-free");
    fireEvent.change(screen.getByRole("combobox", { name: "추가 연재 조건" }), { target: { value: "completed" } });
    expect(input.onPreset).toHaveBeenCalledWith("completed");
  });

  it("기억한 조건·수동 혼합 조건·초기화에 따라 선택 표시도 함께 바뀐다", () => {
    const input = props({ ...EMPTY_TITLE_FILTERS, pricing: ["wait-free"], platforms: ["naver-webtoon"] });
    const { rerender } = render(<CalendarFilters {...input} />);
    expect(screen.getByRole("button", { name: "기다리면 무료" }).getAttribute("aria-pressed")).toBe("true");
    rerender(<CalendarFilters {...input} filters={{ ...input.filters, pricing: ["free", "wait-free"] }} />);
    expect(screen.getAllByRole("button").filter((button) => button.getAttribute("aria-pressed") === "true")).toHaveLength(0);
    rerender(<CalendarFilters {...input} filters={EMPTY_TITLE_FILTERS} />);
    expect(screen.getByRole("button", { name: "전체 연재작" }).getAttribute("aria-pressed")).toBe("true");
  });

  it.each([
    { filters: { ...EMPTY_TITLE_FILTERS, status: ["completed" as const] }, value: "completed" },
    { filters: { ...EMPTY_TITLE_FILTERS, status: ["ongoing" as const], yearRange: [2025, 2026] as [number, number] }, value: "new" },
  ])("추가 프리셋의 실제 값을 복원한다: $value", ({ filters, value }) => {
    render(<CalendarFilters {...props(filters)} />);
    expect(screen.getByRole("combobox", { name: "추가 연재 조건" }).getAttribute("aria-label")).toBe("추가 연재 조건");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(value);
    expect(screen.getByRole("option", { name: "2025·2026 신작" })).toBeTruthy();
  });

  it("모바일 패널에도 다섯 프리셋을 제공하며 플랫폼 변경은 다른 조건을 보존한다", () => {
    const input = props({ ...EMPTY_TITLE_FILTERS, pricing: ["free"], genres: ["fantasy"], platforms: ["naver-webtoon"] });
    render(<CalendarFilters {...input} />);
    togglePanel();
    const panel = screen.getByRole("region", { name: "연재 조건과 플랫폼" });
    expect(screen.getByRole("button", { name: /플랫폼·상세 필터/ }).getAttribute("aria-expanded")).toBe("true");
    const mobile = within(panel).getByRole("group", { name: "모바일 이용권·연재 방식" });
    expect(within(mobile).getAllByRole("button")).toHaveLength(5);
    fireEvent.click(within(mobile).getByRole("button", { name: "2025·2026 신작" }));
    expect(input.onPreset).toHaveBeenCalledWith("new");
    fireEvent.click(within(panel).getByRole("button", { name: /카카오페이지/ }));
    expect(input.onChange).toHaveBeenLastCalledWith({ ...input.filters, platforms: ["naver-webtoon", "kakao-page"] });
    fireEvent.click(within(panel).getByRole("button", { name: /네이버웹툰/ }));
    expect(input.onChange).toHaveBeenLastCalledWith({ ...input.filters, platforms: [] });
    fireEvent.click(within(panel).getByRole("button", { name: "전체 보기" }));
    expect(input.onChange).toHaveBeenLastCalledWith({ ...input.filters, platforms: [] });
    togglePanel();
    expect(screen.queryByRole("region", { name: "연재 조건과 플랫폼" })).toBeNull();
  });
});
