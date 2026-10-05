// @vitest-environment jsdom
/**
 * S4-09 위키미디어 관심 신호 대시보드 컴포넌트 테스트.
 *
 * 계약: 대시보드는 dailyViews 실측 시계열이 있을 때만 존재하고, 지표는 전부
 * 그 시계열에서 계산한 값이다. 시계열이 없으면 아무것도 그리지 않는다(null).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WikimediaInterestDashboard } from "./WikimediaInterestDashboard";

import type { CreatorResource } from "@/shared/lib/creator-resources";

afterEach(cleanup);

function item(extra: Partial<CreatorResource> = {}): CreatorResource {
  return {
    id: "wikimedia:%EA%B2%BD%EB%B3%B5%EA%B6%81",
    provider: "wikimedia",
    title: "경복궁 · 최근 30일 백과 조회",
    creator: "",
    description: "총 700회",
    sourceUrl: "https://ko.wikipedia.org/wiki/%EA%B2%BD%EB%B3%B5%EA%B6%81",
    license: "metadata-only",
    licenseUrl: "",
    credit: "Wikimedia Pageviews API · ko.wikipedia",
    fetchedAt: "2026-10-05T00:00:00.000Z",
    dateLabel: "2026-09-01–2026-09-04",
    dailyViews: [
      { date: "2026-09-01", views: 100 },
      { date: "2026-09-02", views: 200 },
      { date: "2026-09-03", views: 150 },
      { date: "2026-09-04", views: 250 },
    ],
    ...extra,
  };
}

describe("WikimediaInterestDashboard", () => {
  it("시계열에서 계산한 총합·최고일·추이 바를 대시보드로 보여준다", () => {
    render(<WikimediaInterestDashboard item={item()} saved={false} disabled={false} onToggle={() => {}} />);
    expect(screen.getByText("700")).toBeTruthy();
    expect(screen.getByRole("img", { name: /일별 조회수 추이/u })).toBeTruthy();
    const chart = screen.getByRole("img", { name: /일별 조회수 추이/u });
    expect(chart.children).toHaveLength(4);
    expect(screen.getAllByText(/9월 4일/u).length).toBeGreaterThan(0);
    expect(screen.getByText(/조회 기간 고정 · 최근 4일/u)).toBeTruthy();
    // 전반 2일 300 vs 후반 2일 400 → +33%
    expect(screen.getByText(/33%/u)).toBeTruthy();
  });

  it("일별 시계열이 없는 항목이면 대시보드를 만들지 않는다", () => {
    const { container } = render(
      <WikimediaInterestDashboard item={item({ dailyViews: undefined })} saved={false} disabled={false} onToggle={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("이전 기간이 전부 0이면 증감률을 지어내지 않는다", () => {
    render(
      <WikimediaInterestDashboard
        item={item({
          dailyViews: [
            { date: "2026-09-01", views: 0 },
            { date: "2026-09-02", views: 0 },
            { date: "2026-09-03", views: 120 },
            { date: "2026-09-04", views: 180 },
          ],
        })}
        saved={false}
        disabled={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText(/비교할 이전 기간 기록이 없습니다/u)).toBeTruthy();
  });

  it("보드에 저장 버튼이 기존 토글 동선을 그대로 호출한다", () => {
    const onToggle = vi.fn();
    render(<WikimediaInterestDashboard item={item()} saved={false} disabled={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "보드에 저장" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
