// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
const heroStyleText = readFileSync(resolve(process.cwd(), "apps/web/src/domains/catalog/title-detail-purpose-layout.css"), "utf8");

function mountHeroStyles() {
  const style = document.createElement("style");
  style.dataset.titleHeroTestStyle = "true";
  style.textContent = heroStyleText;
  document.head.append(style);
}


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

function renderHero(title: Title, firstEpisodeHref: string | null = "/title/fog-signal/read/1", showAvailability = true) {
  return render(
    <MemoryRouter initialEntries={[`/title/${title.slug}?source=library&source=discover`]}>
      <TitleDetailHero
        title={title}
        reviewAvg={9.8}
        reviewCount={4210}
        estimated={false}
        showSynopsis
        showAvailability={showAvailability}
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
  document.querySelectorAll("style[data-title-hero-test-style]").forEach((style) => style.remove());
  useI18n.setState({ lang: initialLanguage });
});

describe("TitleDetailHero", () => {
  it.each([
    ["ko", "네이버 웹툰에서 보기 (새 탭)"],
    ["en", "Read on 네이버 웹툰 (new tab)"],
  ])("%s: 회차 목록이 없으면 검증된 공식 감상 게이트웨이를 새 탭으로 연결한다", (language, label) => {
    useI18n.setState({ lang: language });
    renderHero(makeTitle({ availability: [
      { platformId: "ridi", pricing: "paid", url: "https://ridibooks.com/books/1" },
      { platformId: "naver-webtoon", pricing: "free", url: "https://comic.naver.com/webtoon/list?titleId=1" },
    ] }), null);
    const official = screen.getByRole("link", { name: label });
    expect(official.getAttribute("href")).toBe("/api/go/naver-webtoon?to=https%3A%2F%2Fcomic.naver.com%2Fwebtoon%2Flist%3FtitleId%3D1");
    expect(official.getAttribute("target")).toBe("_blank");
    expect(official.getAttribute("rel")).toBe("noopener noreferrer");
    expect(official.closest("details")).toBeNull();
    expect(screen.queryByRole("link", { name: /회차 안내 보기|View episode guide/u })).toBeNull();
  });

  it("없는 URL·안전하지 않은 URL을 공식 감상 링크로 만들지 않는다", () => {
    renderHero(makeTitle({ availability: [
      { platformId: "naver-webtoon", pricing: "free" },
      { platformId: "ridi", pricing: "paid", url: "http://ridibooks.com/books/1" },
    ] }), null);
    expect(screen.queryByTestId("title-official-read-link")).toBeNull();
    expect(screen.getByText(/공식 감상 링크가 아직 연결되지 않았어요/u)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "회차 안내 보기" })).toBeNull();
  });

  it("플랫폼 노출을 끄면 공식 링크를 숨기되 확인된 내부 회차 안내는 유지한다", () => {
    renderHero(makeTitle({ availability: [{ platformId: "naver-webtoon", pricing: "free", url: "https://comic.naver.com/webtoon/list?titleId=1" }] }), "/title/fog-signal/read/4", false);
    expect(screen.queryByTestId("title-official-read-link")).toBeNull();
    expect(screen.getByRole("link", { name: "회차 안내 보기" }).getAttribute("href")).toBe("/title/fog-signal/read/4");
    expect(screen.queryByText(/공식 감상 링크/u)).toBeNull();
  });

  it("제목·작가·평점·짧은 소개와 실제 읽기 행동을 보여준다", () => {
    renderHero(makeTitle());
    expect(screen.getByRole("heading", { level: 1, name: "안개 속의 신호" })).toBeTruthy();
    const introduction = screen.getByRole("link", { name: "소개 더 보기" });
    const introductionUrl = new URL(introduction.getAttribute("href") ?? "", "https://example.test");
    expect(introductionUrl.hash).toBe("#title-introduction");
    expect(introductionUrl.searchParams.getAll("source")).toEqual(["library", "discover"]);
    expect(screen.getByRole("link", { name: "김작가" }).getAttribute("href")).toBe(
      "/author/%EA%B9%80%EC%9E%91%EA%B0%80",
    );
    expect(screen.getByText("9.8")).toBeTruthy();
    expect(screen.getAllByText(/안개 낀 항구 도시에서/)).toHaveLength(1);
    const readLink = screen.getByRole("link", { name: /회차 안내 보기/ });
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
    expect(author.classList.contains("focus-visible:outline-accent")).toBe(true);
    author.focus();
    expect(document.activeElement).toBe(author);
    expect(screen.getByRole("link", { name: "소개 더 보기" }).getAttribute("href")).toContain("#title-introduction");
    expect(screen.getAllByText(title.synopsis)).toHaveLength(1);
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
    expect(screen.queryByRole("link", { name: /회차 안내 보기/ })).toBeNull();
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

  it("회차·소개·리뷰·더 보기의 네 목적을 구분하고 기존 query를 유지한다", () => {
    renderHero(makeTitle());
    const nav = screen.getByTestId("title-detail-section-nav");
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(links.map((link) => link.textContent)).toEqual(["회차", "작품 소개", "리뷰", "더 보기"]);
    expect(links.map((link) => new URL(link.getAttribute("href") ?? "", "https://example.test").hash)).toEqual(["#title-episodes-anchor", "#title-introduction", "#title-reviews", "#title-detail-secondary-tools"]);
    for (const link of links) {
      const url = new URL(link.getAttribute("href") ?? "", "https://example.test");
      expect(url.pathname).toBe("/title/fog-signal");
      expect(url.searchParams.getAll("source")).toEqual(["library", "discover"]);
      expect(link.classList.contains("min-h-12")).toBe(true);
      link.focus();
      expect(document.activeElement).toBe(link);
    }
    fireEvent.click(within(nav).getByRole("link", { name: "작품 소개" }));
    expect(within(nav).getByRole("link", { name: "작품 소개" }).getAttribute("aria-current")).toBe("location");
  });

});

describe("TitleDetailHero — 소개와 읽기 목적 분리", () => {
  it("소개는 목적 링크로 연결하고 읽기·저장·제목을 별도로 유지한다", () => {
    renderHero(makeTitle());
    const preview = screen.getByText(makeTitle().synopsis);
    expect(preview.getAttribute("aria-hidden")).toBe("true");
    expect(preview.closest("details")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).closest("details")).toBeNull();
    expect(screen.getByRole("link", { name: /회차 안내 보기/ }).closest("details")).toBeNull();
    const save = screen.getByRole("button", { name: /서재에 담기/ });
    expect(save.closest("details")).toBeNull();
    fireEvent.click(save);
    fireEvent.click(screen.getByRole("link", { name: "소개 더 보기" }));
    expect(screen.getByRole("button", { name: /서재에 담김/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: /회차 안내 보기/ }).getAttribute("href")).toBe("/title/fog-signal/read/1");
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
    mountHeroStyles();
    // 전용 CSS로 옮긴 줄바꿈 규칙을 확인한다. 실제 좁은 화면의 크기는 브라우저에서 측정한다.
    expect(getComputedStyle(heading).overflowWrap).toBe("anywhere");
    expect(getComputedStyle(heading).wordBreak).toBe("keep-all");
    expect(heading.textContent).toBe(longTitle);
    expect(getComputedStyle(heading).textOverflow).not.toBe("ellipsis");
    expect(screen.getByRole("link", { name: "채은" }).getAttribute("href")).toBe(
      "/author/%EC%B1%84%EC%9D%80",
    );
    expect(screen.getByRole("link", { name: "고다고" }).getAttribute("href")).toBe(
      "/author/%EA%B3%A0%EB%8B%A4%EA%B3%A0",
    );
    expect(screen.queryByRole("link", { name: "미상" })).toBeNull();
  });
});


it("공식 읽기는 전체 행, 보조 행동은 같은 트랙이며 목적 메뉴는 표지 무대 밖에 둔다 (실측 아님)", () => {
  mountHeroStyles();
  renderHero(makeTitle({ availability: [{ platformId: "naver-webtoon", pricing: "free", url: "https://comic.naver.com/webtoon/list?titleId=1" }] }));
  const nav = screen.getByTestId("title-detail-section-nav");
  const actions = screen.getByRole("link", { name: /회차 안내 보기/ }).parentElement;
  const official = screen.getByTestId("title-official-read-link");
  if (!actions) throw new Error("읽기 행동 영역이 없습니다.");
  expect(nav.closest(".title-detail-hero-stage")).toBeNull();
  expect(nav.parentElement).toBe(actions.closest(".title-detail-hero"));
  expect(getComputedStyle(nav).display).toBe("flex");
  expect(getComputedStyle(nav).overflowX).toBe("auto");
  expect(getComputedStyle(actions).display).toBe("grid");
  expect(getComputedStyle(actions).gridTemplateColumns.replace(/\s/gu, "")).toBe("repeat(2,minmax(0,1fr))");
  expect(getComputedStyle(official).gridColumn.replace(/\s/gu, "")).toBe("1/-1");
  expect(within(actions).getAllByRole("link")).toHaveLength(2);
  expect(within(actions).getByRole("button", { name: /서재에 담기/ })).toBeTruthy();
  for (const target of [...within(actions).getAllByRole("link"), within(actions).getByRole("button")]) {
    expect(getComputedStyle(target).minHeight).toBe("3rem");
    target.focus();
    expect(document.activeElement).toBe(target);
  }
  expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["회차", "작품 소개", "리뷰", "더 보기"]);
  expect(screen.getByText(makeTitle().synopsis, { selector: "p" }).getAttribute("aria-hidden")).toBe("true");
});
