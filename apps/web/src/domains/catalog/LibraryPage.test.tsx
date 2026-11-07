// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryPage } from "./LibraryPage";
import type { LibraryView } from "@/shared/components/library-view";

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  locale: "ko",
  diaryEntries: [{ titleId: "saved-diary-title" }],
  library: vi.fn(),
  diary: vi.fn(),
  translate: vi.fn((_scope: string, _sourceLocale: string, source: string) => source),
}));

vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: { userId: string | null }) => unknown) =>
    selector({ userId: mocks.userId }),
}));
vi.mock("@/domains/engagement/public/engagement-store", () => ({
  useEngagement: (selector: (state: { diaryEntries: { titleId: string }[] }) => unknown) =>
    selector({ diaryEntries: mocks.diaryEntries }),
}));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingualI18nRevision: () => undefined,
  useBilingual: () => (ko: string, en: string) => mocks.locale === "en" ? en : ko,
  translateCurrentStaticSourceText: mocks.translate,
}));
vi.mock("@/shared/components/library-view", () => ({
  LibraryView: (props: ComponentProps<typeof LibraryView>) => {
    mocks.library(props);
    return <section aria-label="기존 서재 콘텐츠">{props.renderDiaryTab?.({})}</section>;
  },
}));
vi.mock("@/domains/engagement/public/LibraryDiaryTab", () => ({
  LibraryDiaryTab: (props: { titlesById: unknown }) => { mocks.diary(props); return null; },
}));
vi.mock("@/shared/components/section", () => ({
  Container: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/shared/components/my-space-module-chrome", () => ({
  MySpaceModuleChrome: () => <nav aria-label="내 공간 복귀"><a href="/my">내 공간</a></nav>,
}));
vi.mock("@/shared/components/site-contextual-subnav", () => ({
  SiteContextualSubNav: ({ pathnameOverride }: { pathnameOverride: string }) =>
    <nav aria-label="관련 탐색" data-path={pathnameOverride} />,
}));
vi.mock("@/shared/components/site-experience/SiteArtSurfaceSpotlight", () => ({
  SiteArtSurfaceSpotlight: ({ cardId }: { cardId: string }) => <aside data-testid="spotlight" data-card-id={cardId} />,
}));
vi.mock("@/shared/navigation/router-link", () => ({
  default: ({ href, children, ...props }: ComponentProps<"a">) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/shared/navigation/webtoon-platform-router-ux-model", () => ({
  LIBRARY_PILLAR_CARDS: ["purchases", "view", "likes", "collections"].map((id) => ({
    id, label: id, badge: id, description: id,
  })),
}));

function renderPage(tab?: string) {
  return render(<MemoryRouter initialEntries={[tab === undefined ? "/library" : `/library?tab=${tab}`]}><LibraryPage /></MemoryRouter>);
}

beforeEach(() => { vi.clearAllMocks(); mocks.userId = null; mocks.locale = "ko"; });
afterEach(cleanup);

describe("콘텐츠 우선 개인 서재", () => {
  it("한 개의 짧은 제목과 저장 범위 다음에 기존 콘텐츠를 놓고 안내는 기본 닫는다", () => {
    renderPage();
    const heading = screen.getByRole("heading", { level: 1, name: "내 서재" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const content = screen.getByRole("region", { name: "기존 서재 콘텐츠" });
    const summary = screen.getByText("서재 사용법");
    const details = summary.closest("details");
    expect(details?.open).toBe(false);
    expect(content.closest("details")).toBeNull();
    expect(heading.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(content.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/비로그인 상태에서는 서재와 감상 기록이 이 브라우저에 저장/).closest("details")).toBeNull();
    expect(mocks.translate).toHaveBeenCalledWith("domains.catalog.LibraryPage", "ko", "내 서재");
  });

  it("사용법을 반복해서 펼쳐도 탐색·추천·4허브와 기존 콘텐츠 인스턴스를 유지한다", () => {
    renderPage("taste");
    const content = screen.getByRole("region", { name: "기존 서재 콘텐츠" });
    const summary = screen.getByText("서재 사용법");
    const details = summary.closest("details");
    fireEvent.click(summary);
    expect(details?.open).toBe(true);
    expect(screen.getByRole("navigation", { name: "내 공간 복귀" }).closest("details")).toBe(details);
    expect(screen.getByRole("navigation", { name: "관련 탐색" }).getAttribute("data-path")).toBe("/library");
    const journey = screen.getByRole("list", { name: "서재에서 추천까지 3단계" });
    expect(journey.closest("details")).toBe(details);
    expect(within(journey).getByRole("link", { name: /취향 분석/ }).getAttribute("aria-current")).toBe("step");
    expect(within(journey).getByRole("link", { name: /맞춤 추천/ }).getAttribute("href")).toBe("/recommend");
    expect(screen.getByTestId("spotlight").closest("details")).toBe(details);
    expect(screen.getByTestId("spotlight").getAttribute("data-card-id")).toBe("nb-library-archive");
    const pillars = screen.getByTestId("library-rea-pillar-cards");
    expect(pillars.closest("details")).toBe(details);
    expect(within(pillars).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/library", "/library?tab=diary", "/library?tab=rated", "/library?tab=collections",
    ]);
    for (const open of [false, true, false]) {
      fireEvent.click(summary);
      expect(details?.open).toBe(open);
      expect(screen.getByRole("region", { name: "기존 서재 콘텐츠" })).toBe(content);
    }
    expect(mocks.library).toHaveBeenCalledTimes(1);
  });

  it("로그인·로그아웃 뒤에도 계정과 브라우저 저장 범위를 구분한다", () => {
    mocks.userId = "member";
    const view = renderPage();
    expect(screen.getByText("서재·평가·컬렉션은 계정에 동기화됩니다. 감상 일기와 이 기기 관찰 이력은 현재 브라우저에 저장됩니다.")).toBeTruthy();
    mocks.userId = null;
    view.rerender(<MemoryRouter><LibraryPage /></MemoryRouter>);
    expect(screen.getByText(/비로그인 상태에서는/)).toBeTruthy();
    expect(screen.queryByText(/^서재·평가·컬렉션은 계정에 동기화됩니다/)).toBeNull();
  });

  it.each(["shelf", "rated", "diary", "alerts", "taste", "collections"])("%s 쿼리와 감상 일기 연결을 기존 LibraryView에 그대로 전달한다", (tab) => {
    renderPage(tab);
    expect(mocks.library.mock.calls[0]?.[0]).toMatchObject({ initialTab: tab, diaryEntries: mocks.diaryEntries });
    expect(mocks.library.mock.calls[0]?.[0].diaryEntries).toBe(mocks.diaryEntries);
    expect(mocks.diary.mock.calls[0]?.[0]).toEqual({ titlesById: {} });
  });

  it.each([undefined, "invalid", ""])("유효하지 않거나 없는 쿼리 %s는 기본 서재를 유지한다", (tab) => {
    renderPage(tab);
    expect(mocks.library.mock.calls[0]?.[0].initialTab).toBe("shelf");
  });

  it("새 안내 문구는 기존 bilingual 경로의 영어 기본값을 사용한다", () => {
    mocks.locale = "en";
    renderPage();
    expect(screen.getByText("Library guide")).toBeTruthy();
    fireEvent.click(screen.getByText("Library guide"));
    expect(screen.getByText("Collect favorites and ratings, and ToonStudio analyzes your taste spectrum to recommend what to read next.")).toBeTruthy();
  });
});
