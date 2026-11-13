// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { PLATFORM_LIST } from "@/shared/lib/platforms";
import { getInsightsData } from "@/shared/lib/server/insights";

import { InsightsPage } from "./InsightsPage";

const resource = vi.hoisted(() => ({ read: vi.fn(), reload: vi.fn() }));
vi.mock("@/platform/use-api-resource", () => ({ useApiResource: resource.read }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("카탈로그 집계 차트를 장르 스펙트럼·설명보다 먼저 보여 주고 추정값 경계를 유지한다", async () => {
  const empty = await getInsightsData();
  const genre = { genre: "판타지", count: 1, rating: 4 };
  const platform = PLATFORM_LIST[0];
  if (!platform) throw new Error("플랫폼 정본 누락");
  const platformRow = { id: platform.id, p: platform, count: 1 };
  const year = { label: 2026, value: 1 };
  const data = { ...empty, total: 1, genreRows: [genre], topGenre: genre, bestRatedGenre: genre, platformRows: [platformRow], topPlatform: platformRow, platformTotal: 1, yearPoints: [year], peakYear: year };
  resource.read.mockReturnValue({ data, loading: false, error: null, reload: resource.reload });
  render(<MemoryRouter initialEntries={["/insights"]}><InsightsPage /></MemoryRouter>);
  const chart = screen.getByRole("heading", { name: "장르 분포 & 평균 평점" });
  const summary = screen.getByText("데이터 안내 · 장르 스펙트럼", { selector: "summary strong" }).closest("summary");
  if (!summary) throw new Error("인사이트 보조 정보 누락");
  expect(chart.closest("details")).toBeNull();
  expect(chart.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(summary.closest("details")?.open).toBe(false);
  expect(screen.getByText(/트렌드·완독률·몰입 지수는 추정값/)).toBeTruthy();
  fireEvent.click(summary);
  expect(summary.closest("details")?.open).toBe(true);
});

it("집계 실패를 0건 차트로 보이지 않고 오류·재시도를 제공한다", () => {
  resource.read.mockReturnValue({ data: null, loading: false, error: "연결 실패", reload: resource.reload });
  render(<MemoryRouter initialEntries={["/insights"]}><InsightsPage /></MemoryRouter>);
  expect(screen.getByRole("heading", { level: 1, name: "이야기의 지형을 읽다" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "장르 분포 & 평균 평점" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /다시|재시도/ }));
  expect(resource.reload).toHaveBeenCalledOnce();
});


it("유효한 빈 집계는 오류나 허구의 0건 차트 대신 빈 상태·재시도를 제공한다", async () => {
  resource.read.mockReturnValue({ data: await getInsightsData(), loading: false, error: null, reload: resource.reload });
  render(<MemoryRouter initialEntries={["/insights"]}><InsightsPage /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "아직 집계할 작품이 없어요" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "장르 분포 & 평균 평점" })).toBeNull();
  expect(screen.getByRole("link", { name: "작품 탐색" }).getAttribute("href")).toBe("/discover");
  fireEvent.click(screen.getByRole("button", { name: "집계 다시 불러오기" }));
  expect(resource.reload).toHaveBeenCalledOnce();
});
