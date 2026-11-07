// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Title } from "@/shared/lib/types";

import { TitleDetailHero } from "./TitleDetailHero";

import { useI18n } from "@/shared/lib/i18n-core";
import { useApp } from "@/shared/lib/store";

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
    altTitles: ["Signal in the Fog"],
    author: "김작가",
    artist: "박화가",
    genres: ["미스터리", "스릴러"],
    tags: [],
    synopsis: "안개 낀 항구 도시에서 정체불명의 신호가 잡히기 시작한다.",
    cover: ["oklch(0.45 0.14 260)", "oklch(0.28 0.1 290)"],
    status: "ongoing",
    ageRating: "15",
    releaseYear: 2025,
    updateDays: ["월", "목"],
    availability: [],
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

function renderHero(title: Title, firstEpisodeHref: string | null = "/title/fog-signal/read/1") {
  return render(
    <MemoryRouter>
      <TitleDetailHero
        title={title}
        reviewAvg={9.8}
        reviewCount={4210}
        estimated={false}
        showSynopsis
        firstEpisodeHref={firstEpisodeHref}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  useApp.setState({ reads: {} });
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLanguage });
});

describe("TitleDetailHero", () => {
  it("제목·작가·평점·장르·줄거리와 주 행동을 보여준다", () => {
    renderHero(makeTitle());
    expect(screen.getByRole("heading", { level: 1, name: "안개 속의 신호" })).toBeTruthy();
    expect(screen.getByText("Signal in the Fog")).toBeTruthy();
    expect(screen.getByRole("link", { name: "김작가" }).getAttribute("href")).toBe(
      "/author/%EA%B9%80%EC%9E%91%EA%B0%80",
    );
    expect(screen.getByText("9.8")).toBeTruthy();
    expect(screen.getByText("미스터리")).toBeTruthy();
    expect(screen.getByText(/안개 낀 항구 도시에서/)).toBeTruthy();
    const readLink = screen.getByRole("link", { name: /첫 화부터 읽기/ });
    expect(readLink.getAttribute("href")).toBe("/title/fog-signal/read/1");
  });

  it("긴 공백 없는 메타데이터를 생략하지 않고 좁은 화면에서 줄바꿈하도록 한다", () => {
    const title = makeTitle({
      title: "아주긴공백없는작품제목".repeat(12),
      author: "VeryLongAuthorName".repeat(12),
      altTitles: ["UnbrokenAlternativeTitle".repeat(12)],
      synopsis: "LongSynopsis".repeat(40),
    });
    renderHero(title);
    const heading = screen.getByRole("heading", { level: 1, name: title.title });
    expect(heading.closest("[class*='overflow-wrap:anywhere']")).not.toBeNull();
    const author = screen.getByRole("link", { name: title.author });
    expect(author.getAttribute("href")).toBe(`/author/${encodeURIComponent(title.author)}`);
    expect(author.classList.contains("focus-visible:outline-white")).toBe(true);
    author.focus();
    expect(document.activeElement).toBe(author);
    expect(screen.getByText(title.altTitles?.[0] ?? "")).toBeTruthy();
    expect(screen.getByText(title.synopsis)).toBeTruthy();
  });

  it("서재에 담기는 읽기 상태를 토글하고 눌림 상태를 알린다", () => {
    renderHero(makeTitle());
    const saveButton = screen.getByRole("button", { name: /서재에 담기/ });
    expect(saveButton.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(saveButton);
    expect(useApp.getState().reads["title-1"]).toBe("want");
    const savedButton = screen.getByRole("button", { name: /서재에 담김/ });
    expect(savedButton.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(savedButton);
    expect(useApp.getState().reads["title-1"]).toBeUndefined();
  });

  it("이미 보는 중인 작품은 담김으로 표시하되 상태를 덮지 않는다", () => {
    useApp.setState({ reads: { "title-1": "reading" } });
    renderHero(makeTitle());
    const saveButton = screen.getByRole("button", { name: /서재에 담김/ });
    expect(saveButton.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(saveButton);
    expect(useApp.getState().reads["title-1"]).toBe("reading");
  });

  it("회차가 없다고 확정된 작품에서는 읽기 행동을 숨긴다", () => {
    renderHero(makeTitle(), null);
    expect(screen.queryByRole("link", { name: /첫 화부터 읽기/ })).toBeNull();
  });

  it("킬스위치가 꺼지면 줄거리를 그리지 않는다", () => {
    render(
      <MemoryRouter>
        <TitleDetailHero
          title={makeTitle()}
          reviewAvg={9.8}
          reviewCount={4210}
          estimated={false}
          showSynopsis={false}
          firstEpisodeHref="/title/fog-signal/read/1"
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/안개 낀 항구 도시에서/)).toBeNull();
  });

  it("작품 상세 섹션 바로가기 내비게이션 칩을 제공한다", () => {
    renderHero(makeTitle());
    const nav = screen.getByTestId("title-detail-section-nav");
    expect(nav.querySelector('a[href="#title-episodes-anchor"]')?.textContent).toBe("회차 목록");
    expect(nav.querySelector('a[href="#title-availability"]')?.textContent).toBe("감상 플랫폼·가격");
    expect(nav.querySelector('a[href="#title-reviews"]')?.textContent).toBe("독자 리뷰");
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(5);
    for (const link of links) {
      expect(link.classList.contains("min-h-11")).toBe(true);
      expect(link.classList.contains("focus-visible:outline-white")).toBe(true);
      link.focus();
      expect(document.activeElement).toBe(link);
    }
  });
});

describe("TitleDetailHero — 접힌 소개와 핵심 동선", () => {
  it("줄거리만 접고 제목·읽기·저장·섹션 동선은 밖에 유지한다", () => {
    renderHero(makeTitle());
    const synopsis = screen.getByText(/안개 낀 항구 도시에서/);
    const details = synopsis.closest("details");
    expect(details?.open).toBe(false);
    expect(screen.getByRole("heading", { level: 1 }).closest("details")).toBeNull();
    expect(screen.getByRole("link", { name: /첫 화부터 읽기/ }).closest("details")).toBeNull();
    expect(screen.getByRole("button", { name: /서재에 담기/ }).closest("details")).toBeNull();
    expect(screen.getByTestId("title-detail-section-nav").closest("details")).toBeNull();
    if (!details) throw new Error("줄거리 disclosure 누락");
    const summary = details.querySelector("summary");
    if (!summary) throw new Error("줄거리 summary 누락");
    for (let i = 0; i < 3; i += 1) { fireEvent.click(summary); }
    expect(synopsis.textContent).toBe(makeTitle().synopsis);
  });
});

it("저장 버튼은 전역 데스크톱 바닥보다 48px 논리 최소크기를 우선하고 작가 링크는 인라인으로 남긴다 (실측 아님)", () => {
  renderHero(makeTitle());
  const save = screen.getByRole("button", { name: /서재에 담기/ });
  expect(save.classList.contains("[min-block-size:3rem]!")).toBe(true);
  expect(screen.getByRole("link", { name: "김작가" }).classList.contains("min-h-11")).toBe(false);
});

describe("TitleDetailHero — 빈 작가·미상·다중 작가·초장문 이름 방어", () => {
  it("작가 미상·익명·빈 문자열은 깨진 작가 링크를 만들지 않고 평문으로 표시한다", () => {
    const { unmount } = renderHero(makeTitle({ author: "작가 미상", artist: "익명" }));
    expect(screen.queryByRole("link", { name: "작가 미상" })).toBeNull();
    expect(screen.queryByRole("link", { name: "익명" })).toBeNull();
    expect(screen.getByText("작가 미상")).toBeTruthy();
    unmount();

    renderHero(makeTitle({ author: "", artist: "" }));
    expect(screen.getByText("작가 미상")).toBeTruthy();
  });

  it("쉼표·슬래시로 구분된 다중 작가는 개별 작가 상세 링크로 연결하고 초장문 이름은 줄바꿈 클래스를 유지한다", () => {
    const longTitle = "초장문제목_".repeat(20) + "끝";
    renderHero(makeTitle({ title: longTitle, author: "채은, 고다고 / 미상" }));
    const heading = screen.getByRole("heading", { level: 1, name: longTitle });
    expect(heading.className).toContain("[overflow-wrap:anywhere]");
    expect(screen.getByRole("link", { name: "채은" }).getAttribute("href")).toBe(
      "/author/%EC%B1%84%EC%9D%80",
    );
    expect(screen.getByRole("link", { name: "고다고" }).getAttribute("href")).toBe(
      "/author/%EA%B3%A0%EB%8B%A4%EA%B3%A0",
    );
    expect(screen.queryByRole("link", { name: "미상" })).toBeNull();
  });
});
