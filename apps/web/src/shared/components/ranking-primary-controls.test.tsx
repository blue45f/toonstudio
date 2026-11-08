// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RankAxis, RankPeriod } from "@/shared/lib/ranking";
import type { PlatformId } from "@/shared/lib/types";
import { RankingPrimaryControls } from "./ranking-primary-controls";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
  translateCurrentStaticSourceText: (_scope: string, _locale: string, value: string) => value,
}));
afterEach(cleanup);

function Controls({ initialAxis = "popular" }: { initialAxis?: RankAxis }) {
  const [axis, setAxis] = useState<RankAxis>(initialAxis);
  const [period, setPeriod] = useState<RankPeriod>("weekly");
  const [platform, setPlatform] = useState<PlatformId | "all">("all");
  const [open, setOpen] = useState(false);
  return <RankingPrimaryControls axis={axis} onAxisChange={setAxis} period={period} onPeriodChange={setPeriod}
    platform={platform} onPlatformChange={setPlatform} platforms={[{ value: "all", label: "전체 플랫폼" }, { value: "naver-webtoon", label: "네이버" }]}
    filtersOpen={open} filterCount={platform === "all" ? 0 : 1} onToggleFilters={() => setOpen((value) => !value)} />;
}

describe("랭킹 1차 조건줄", () => {
  it("주요 네 기준을 바로 선택하고 여덟 기준을 모바일 선택기에 보존한다", () => {
    render(<Controls />);
    const axes = screen.getByRole("group", { name: "주요 랭킹 기준" });
    expect(within(axes).getAllByRole("button")).toHaveLength(4);
    const select = screen.getByRole("combobox", { name: "랭킹 산식 축" });
    expect(within(select).getAllByRole("option")).toHaveLength(8);
    fireEvent.click(within(axes).getByRole("button", { name: "평점 명작" }));
    expect(select.getAttribute("value") ?? (select instanceof HTMLSelectElement ? select.value : "")).toBe("rating");
    expect(within(axes).getByRole("button", { name: "평점 명작" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("추가 기준과 모바일 선택기가 서로 동기화되고 모든 기준이 도달 가능하다", () => {
    render(<Controls initialAxis="completed" />);
    const more = screen.getByRole("combobox", { name: "더 많은 랭킹 기준" });
    const mobile = screen.getByRole("combobox", { name: "랭킹 산식 축" });
    expect(more.getAttribute("data-active")).toBe("true");
    fireEvent.change(more, { target: { value: "hidden" } });
    expect(mobile instanceof HTMLSelectElement && mobile.value).toBe("hidden");
    fireEvent.change(mobile, { target: { value: "trending" } });
    expect(more instanceof HTMLSelectElement && more.value).toBe("");
    expect(screen.getByRole("button", { name: "급상승" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("기간·플랫폼 선택과 필터 반복 토글이 다른 선택을 보존한다", () => {
    render(<Controls />);
    const period = screen.getByRole("combobox", { name: "랭킹 기간" });
    const platform = screen.getByRole("combobox", { name: "랭킹 플랫폼" });
    fireEvent.change(period, { target: { value: "monthly" } });
    fireEvent.change(platform, { target: { value: "naver-webtoon" } });
    const filter = screen.getByRole("button", { name: /필터/ });
    expect(filter.textContent).toContain("1");
    expect(filter.getAttribute("aria-controls")).toBe("ranking-client-filters");
    for (let index = 0; index < 3; index += 1) {
      fireEvent.click(filter); expect(filter.getAttribute("aria-expanded")).toBe("true");
      fireEvent.click(filter); expect(filter.getAttribute("aria-expanded")).toBe("false");
    }
    expect(period instanceof HTMLSelectElement && period.value).toBe("monthly");
    expect(platform instanceof HTMLSelectElement && platform.value).toBe("naver-webtoon");
  });
});
