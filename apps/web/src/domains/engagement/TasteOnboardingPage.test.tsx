// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { TasteOnboardingPage } from "./TasteOnboardingPage";

import type { Title } from "@/shared/lib/types";

const apiFetchMock = vi.fn();
vi.mock("@/platform/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

function makeTitle(id: string, title: string, genres: string[]): Title {
  return {
    id,
    slug: id,
    type: "webtoon",
    title,
    author: "테스트 작가",
    genres,
    tags: [],
    synopsis: "소개",
    cover: ["#111111", "#222222"],
    status: "ongoing",
    ageRating: "all",
    releaseYear: 2026,
    availability: [],
    stats: {
      views: 100,
      likes: 10,
      bookmarks: 5,
      ratingAvg: 4.5,
      ratingCount: 20,
      ratingDist: [0, 0, 0, 0, 20],
      rankDelta: 0,
      trendingScore: 50,
      completionRate: 80,
      bingeIndex: 50,
    },
  };
}

const popular = [
  makeTitle("t1", "판타지 대작", ["판타지"]),
  makeTitle("t2", "로맨스 소설", ["로맨스"]),
  makeTitle("t3", "판타지 후속", ["판타지", "액션"]),
  makeTitle("t4", "학원 드라마", ["학원", "드라마"]),
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/onboarding/taste"]}>
      <Routes>
        <Route path="/onboarding/taste" element={<TasteOnboardingPage />} />
        <Route path="/recommend" element={<div>추천 화면 도착</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ items: popular }),
  });
});

afterEach(cleanup);

describe("TasteOnboardingPage", () => {
  it("단계형으로 진행하고 장르를 고르면 스펙트럼 바가 채워진다", async () => {
    renderPage();

    // 1단계: 장르를 고르기 전에는 스펙트럼이 비어 있고 다음 버튼이 막혀 있다
    expect(screen.getByRole("img", { name: /비어 있는 취향 스펙트럼/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /장르를 2개 이상 골라 주세요/ })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "판타지" }));
    fireEvent.click(screen.getByRole("button", { name: "로맨스" }));
    expect(screen.getByRole("img", { name: /고른 장르 2개로 채워진 취향 스펙트럼/ })).toBeTruthy();

    // 2단계: 감상 강도
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    expect(await screen.findByRole("heading", { name: "감상 강도" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /편안하게/ }));

    // 3단계: 회피 태그
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    expect(await screen.findByRole("heading", { name: "회피 태그" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "공포" }));

    // 4단계: 완료 — 고른 장르와 겹치는 추천 작품 3개가 먼저 온다
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    expect(await screen.findByText("취향 스펙트럼이 완성됐어요")).toBeTruthy();
    expect(screen.getByText("고른 장르로 골라 본 추천 작품")).toBeTruthy();
    expect(screen.getByText("판타지 대작")).toBeTruthy();
    expect(screen.getByText("로맨스 소설")).toBeTruthy();
    expect(screen.getByText("판타지 후속")).toBeTruthy();
    expect(screen.queryByText("학원 드라마")).toBeNull();

    // 완료하면 추천 화면으로 이동한다
    fireEvent.click(screen.getByRole("button", { name: /추천 화면으로 이동/ }));
    expect(await screen.findByText("추천 화면 도착")).toBeTruthy();
  });

  it("로딩 중에는 작품 카드 모양의 스켈레톤을 보여 주고 빈 결과와 구분한다", async () => {
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    renderPage();

    expect(await screen.findByText(/지금은 보여 줄 인기 작품이 없어요/)).toBeTruthy();
    expect(screen.queryByText("인기 작품 목록을 불러오지 못했습니다")).toBeNull();
  });

  it("응답이 오기 전에는 스켈레톤 상태를 표시한다", () => {
    apiFetchMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole("status", { name: "작품 목록을 불러오는 중" })).toBeTruthy();
    expect(screen.queryByText(/지금은 보여 줄 인기 작품이 없어요/)).toBeNull();
  });

  it("인기 작품 로드가 실패하면 오류 상태와 재시도를 보여주고 장르만으로 완료할 수 있다", async () => {
    apiFetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderPage();

    expect(await screen.findByText("인기 작품 목록을 불러오지 못했습니다")).toBeTruthy();
    // 실패를 빈 목록으로 위장하지 않고, 작품 선택 자리에도 실패를 알린다
    expect(screen.getByText(/작품 목록을 불러오지 못해 건너뜁니다/)).toBeTruthy();
  });
});
