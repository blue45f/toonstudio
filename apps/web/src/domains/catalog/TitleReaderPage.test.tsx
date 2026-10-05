// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Title } from "@/shared/lib/types";

import { TitleReaderPage } from "./TitleReaderPage";

import { useI18n } from "@/shared/lib/i18n-core";

const resource = vi.hoisted(() => ({
  loading: false,
  error: null as string | null,
  notFound: false,
  data: null as unknown,
}));
vi.mock("@/platform/use-api-resource", () => ({
  useApiResource: () => ({ ...resource, reload: vi.fn() }),
}));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => null,
}));
vi.mock("@/shared/components/cover-image", () => ({
  CoverImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const initialLanguage = useI18n.getState().lang;

function makeTitle(overrides: Partial<Title> = {}): Title {
  return {
    id: "title-1",
    slug: "fog-signal",
    type: "webtoon",
    title: "안개 속의 신호",
    author: "김작가",
    genres: ["미스터리"],
    tags: [],
    synopsis: "줄거리",
    cover: ["oklch(0.45 0.14 260)", "oklch(0.28 0.1 290)"],
    status: "ongoing",
    ageRating: "15",
    releaseYear: 2025,
    updateDays: ["월", "목"],
    availability: [
      { platformId: "naver-webtoon", pricing: "free", url: "https://comic.naver.com/example" },
    ],
    stats: {
      views: 1200000,
      likes: 34000,
      bookmarks: 12000,
      ratingAvg: 9.8,
      ratingCount: 4210,
      ratingDist: [1, 2, 5, 20, 72],
      rankDelta: 0,
      trendingScore: 88,
      completionRate: 86,
      bingeIndex: 92,
    },
    ...overrides,
  };
}

function renderReader(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/title/:slug/read/:episode" element={<TitleReaderPage />} />
        <Route path="/title/:slug" element={<h1>작품 상세 도착</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  window.localStorage.clear();
  Object.assign(resource, {
    loading: false,
    error: null,
    notFound: false,
    data: { title: makeTitle() },
  });
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLanguage });
});

describe("TitleReaderPage — 뷰어 셸", () => {
  it("시작 카드·컷 빈 상태·상하단 회차 동선을 그린다", () => {
    renderReader("/title/fog-signal/read/2");
    expect(screen.getByRole("heading", { level: 1, name: "2화" })).toBeTruthy();
    expect(screen.getByText("이 회차의 컷은 아직 준비되지 않았어요")).toBeTruthy();
    // 플랫폼 딥링크가 1차 동선이다
    const platform = screen.getByRole("link", { name: /에서 읽기/ });
    expect(platform.getAttribute("href")).toBe("https://comic.naver.com/example");
    // 상단 닫기 → 작품 상세, 하단 목록 → 상세의 회차 앵커
    expect(screen.getByRole("link", { name: "작품 상세로 나가기" }).getAttribute("href")).toBe(
      "/title/fog-signal",
    );
    expect(screen.getByRole("link", { name: "회차 목록" }).getAttribute("href")).toBe(
      "/title/fog-signal#episodes",
    );
    // 이전/다음 회차 (하단 바 — 끝 카드의 "다음 화 N화"와 구분해 정확히 일치로 찾는다)
    expect(screen.getByRole("link", { name: "이전 화" }).getAttribute("href")).toBe(
      "/title/fog-signal/read/1",
    );
    expect(screen.getByRole("link", { name: "다음 화" }).getAttribute("href")).toBe(
      "/title/fog-signal/read/3",
    );
    // 진도 바
    const progressbar = screen.getByRole("progressbar", { name: "읽기 진도" });
    expect(progressbar.getAttribute("aria-valuenow")).toBe("0");
  });

  it("1화에서는 이전 화가 비활성이다", () => {
    renderReader("/title/fog-signal/read/1");
    expect(screen.queryByRole("link", { name: "이전 화" })).toBeNull();
    expect(screen.getByRole("link", { name: "다음 화" }).getAttribute("href")).toBe(
      "/title/fog-signal/read/2",
    );
  });

  it("Esc를 누르면 작품 상세로 나간다", () => {
    renderReader("/title/fog-signal/read/2");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "작품 상세 도착" })).toBeTruthy();
  });

  it("읽던 위치가 있으면 이어보기 배너를 띄우고 처음부터로 닫을 수 있다", () => {
    window.localStorage.setItem(
      "toonstudio.reader-progress.v1.guest",
      JSON.stringify({ "fog-signal": { episode: 2, ratio: 0.5, updatedAt: Date.now() } }),
    );
    renderReader("/title/fog-signal/read/2");
    expect(screen.getByText("이전에 50%까지 읽었어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "처음부터" }));
    expect(screen.queryByText("이전에 50%까지 읽었어요")).toBeNull();
  });

  it("페이지를 떠나면 읽던 위치가 로컬에 저장된다", () => {
    const { unmount } = renderReader("/title/fog-signal/read/3");
    unmount();
    const raw = window.localStorage.getItem("toonstudio.reader-progress.v1.guest");
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw as string) as Record<string, { episode: number }>;
    expect(saved["fog-signal"]?.episode).toBe(3);
  });
});

describe("TitleReaderPage — 상태 구분", () => {
  it("로딩 중에는 리더 캔버스 위에 스켈레톤을 보여준다", () => {
    Object.assign(resource, { loading: true, data: null });
    renderReader("/title/fog-signal/read/1");
    expect(screen.getByRole("status", { name: "불러오는 중" })).toBeTruthy();
  });

  it("작품이 없으면 작품 없음 화면으로 구분한다", () => {
    Object.assign(resource, { notFound: true, data: null });
    renderReader("/title/missing/read/1");
    expect(screen.getByText("이 주소의 작품을 찾지 못했어요")).toBeTruthy();
  });

  it("조회 오류는 빈 상태와 구분해 재시도를 제공한다", () => {
    Object.assign(resource, { error: "네트워크 오류", data: null });
    renderReader("/title/fog-signal/read/1");
    expect(screen.getByText("작품을 불러오지 못했습니다")).toBeTruthy();
    // ErrorState의 재시도 버튼 (라벨은 셸 사전이 주입하므로 존재 자체로 확인)
    expect(within(screen.getByRole("alert")).getByRole("button")).toBeTruthy();
  });

  it("회차 번호가 숫자가 아니면 없는 회차로 안내한다", () => {
    renderReader("/title/fog-signal/read/abc");
    expect(screen.getByRole("heading", { name: "없는 회차예요" })).toBeTruthy();
  });

  it("총 회차 수를 알면 그보다 큰 회차는 없는 회차로 안내하고 마지막 화 동선을 준다", () => {
    Object.assign(resource, {
      data: {
        title: makeTitle(),
        episodes: [
          { number: 1, title: "하나" },
          { number: 2, title: "둘" },
        ],
      },
    });
    renderReader("/title/fog-signal/read/9");
    expect(screen.getByRole("heading", { name: "없는 회차예요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /마지막 화/ }).getAttribute("href")).toBe(
      "/title/fog-signal/read/2",
    );
  });

  it("공개 예정 회차는 공개 전으로 안내한다", () => {
    Object.assign(resource, {
      data: {
        title: makeTitle(),
        episodes: [{ number: 5, status: "scheduled" }],
      },
    });
    renderReader("/title/fog-signal/read/5");
    expect(screen.getByRole("heading", { name: "5화는 아직 공개 전이에요" })).toBeTruthy();
  });
});
