// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MySpaceHubPage } from "./MySpaceHubPage";

import type { PropsWithChildren } from "react";

const fixtures = vi.hoisted(() => ({
  continuity: {
    version: 1 as const,
    recent: [] as Array<{ id: "studio" | "ranking"; href: string; visitedAt: number }>,
    plan: null,
  },
  app: {
    reads: {} as Record<string, string>,
    ratings: {} as Record<string, number>,
    collections: [] as unknown[],
  },
}));

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  translateBilingualValueForActiveLocale: (_scope: string, ko: unknown) => ko,
  translateCurrentStaticSourceText: (_scope: string, _locale: string, value: string) => value,
  useBilingualI18nRevision: () => undefined,
}));

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }),
}));

const continuityMocks = vi.hoisted(() => ({
  label: (): string => "창작 스튜디오",
  description: (): string => "마지막 문서와 작업 위치로 돌아가기",
}));

vi.mock("@/shared/lib/creator-continuity", () => ({
  subscribeCreatorContinuity: () => () => undefined,
  getCreatorContinuitySnapshot: () => fixtures.continuity,
  getCreatorContinuityServerSnapshot: () => fixtures.continuity,
  creatorDestinationLabel: () => continuityMocks.label(),
  creatorRecentDestinationDescription: () => continuityMocks.description(),
}));

vi.mock("@/shared/lib/store", () => ({
  useHydrated: () => true,
  useApp: (selector: (state: typeof fixtures.app) => unknown) => selector(fixtures.app),
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ status: "unauthenticated" }),
}));

vi.mock("@/shared/components/section", () => ({
  Container: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("@/shared/components/purpose-experience-stage", () => ({
  PurposeExperienceStage: () => <div data-testid="purpose-stage" />,
  FriendlyQuickGuide: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

function renderPage(initialEntry = "/my") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MySpaceHubPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fixtures.continuity.recent = [];
  fixtures.app.reads = {};
  fixtures.app.ratings = {};
  fixtures.app.collections = [];
  continuityMocks.label = () => "창작 스튜디오";
  continuityMocks.description = () => "마지막 문서와 작업 위치로 돌아가기";
});

afterEach(cleanup);

describe("MySpaceHubPage next-action center", () => {
  it("starts a new user from create, import or the isolated sample without foregrounding zero stats", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "아직 이어갈 Studio 작업이 없습니다" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "새 작품 만들기" }).getAttribute("href")).toBe("/studio/new");
    expect(screen.getByRole("link", { name: "기존 파일 가져오기" }).getAttribute("href")).toBe("/studio/import");
    expect(screen.getByRole("link", { name: "10분 샘플로 보기" }).getAttribute("href")).toBe("/production/projects/sample-project/overview");
    expect(screen.queryByText("읽기 상태")).toBeNull();
    expect(screen.getAllByRole("link", { name: /알림/ }).some((link) => link.getAttribute("href") === "/notifications")).toBe(true);
  });

  it("resumes the most recent Studio location and shows activity only when it exists", () => {
    fixtures.continuity.recent = [{
      id: "studio",
      href: "/studio/p/project-1/d/document-1?resume=latest",
      visitedAt: Date.parse("2026-09-26T01:00:00.000Z"),
    }];
    fixtures.app.reads = { work: "reading" };
    fixtures.app.ratings = { work: 4.5 };
    fixtures.app.collections = [{ id: "favorites" }];

    renderPage();

    expect(screen.getByRole("heading", { name: "가장 최근 작업부터 이어가세요" })).toBeTruthy();
    expect(screen.getByText("마지막 문서와 작업 위치로 돌아가기")).toBeTruthy();
    expect(screen.getByRole("link", { name: /이어서 작업/ }).getAttribute("href")).toBe(
      "/studio/p/project-1/d/document-1?resume=latest",
    );
    expect(screen.getByText("읽기 상태")).toBeTruthy();
    expect(screen.getAllByText("1")).toHaveLength(3);
  });

  it("does not call a browsing destination 'work' when no Studio visit exists", () => {
    fixtures.continuity.recent = [{ id: "ranking", href: "/ranking", visitedAt: Date.parse("2026-09-26T01:00:00.000Z") }];

    renderPage();

    expect(screen.getByRole("heading", { name: "최근에 보던 곳으로 돌아가기" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "가장 최근 작업부터 이어가세요" })).toBeNull();
    expect(screen.getByRole("link", { name: /이어서 보기/ }).getAttribute("href")).toBe("/ranking");
  });

  it("exposes role-based filter buttons with 44px touch target classes, preserves selection state, and links to AI settings and asset points", () => {
    renderPage();
    const filterGroup = screen.getByRole("group", { name: "내 공간 역할별 보기" });
    const filterButtons = within(filterGroup).getAllByRole("button");
    expect(filterButtons).toHaveLength(4);
    for (const button of filterButtons) {
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("min-w-11");
      expect(button.className).toContain("h-auto");
      expect(button.className).toContain("focus-visible:ring-2");
      expect(button.className).not.toContain("min-h-9");
      expect(button.className).not.toContain("h-8");
    }

    expect(screen.getByTestId("my-space-role-filter-all").getAttribute("aria-pressed")).toBe("true");
    // 정상 기본 상태에서는 상시 검색창·보조 건수 문구·오류 배너를 노출하지 않는다
    expect(screen.queryByTestId("my-space-destination-search")).toBeNull();
    expect(screen.queryByTestId("my-space-filter-status")).toBeNull();
    expect(screen.queryByTestId("my-space-cover-fallback")).toBeNull();
    expect(screen.queryByTestId("my-space-filter-empty")).toBeNull();
    expect(screen.getByRole("link", { name: /AI 연결 설정/ }).getAttribute("href")).toBe("/settings/ai");
    expect(screen.getByRole("link", { name: /에셋 포인트·정산/ }).getAttribute("href")).toBe("/asset-points");

    // 역할 필터 선택 시에만 현재 필터 건수가 나타나고 aria-pressed와 표시 카드가 보존된다
    fireEvent.click(screen.getByTestId("my-space-role-filter-account"));
    expect(screen.getByTestId("my-space-role-filter-account").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("my-space-role-filter-all").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("my-space-filter-status").textContent).toContain("4 / 14");
    expect(screen.queryByTestId("my-space-destination-search")).toBeNull();
    expect(screen.getByRole("link", { name: /AI 연결 설정/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /에셋 포인트·정산/ })).toBeNull();

    fireEvent.click(screen.getByTestId("my-space-role-filter-creator"));
    expect(screen.getByTestId("my-space-role-filter-creator").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("my-space-role-filter-account").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("my-space-filter-status").textContent).toContain("6 / 14");
    expect(screen.getByRole("link", { name: /에셋 포인트·정산/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /AI 연결 설정/ })).toBeNull();

    fireEvent.click(screen.getByTestId("my-space-role-filter-all"));
    expect(screen.getByTestId("my-space-role-filter-all").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("my-space-filter-status")).toBeNull();
    expect(screen.getByRole("link", { name: /AI 연결 설정/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /에셋 포인트·정산/ })).toBeTruthy();
  });

  it("handles empty/corrupted continuity timestamps, blank labels, and invalid href entries without crashing", () => {
    fixtures.continuity.recent = [
      { id: "studio", href: "", visitedAt: Number.NaN },
      { id: "studio", href: "/studio/p/recovered-project", visitedAt: Number.NaN },
    ];
    continuityMocks.label = () => "   ";
    continuityMocks.description = () => "";

    renderPage();

    expect(screen.getByTestId("my-space-recent-title").textContent).toBe("최근 작업 공간");
    expect(screen.getByTestId("my-space-recent-description").textContent).toBe("이전에 열었던 화면으로 바로 이어서 이동합니다.");
    expect(screen.getByText("방금 전")).toBeTruthy();
    expect(screen.getByRole("link", { name: /이어서 작업/ }).getAttribute("href")).toBe("/studio/p/recovered-project");
  });

  it("recovers gracefully when a cover/spotlight image fails to load and preserves long Korean/English titles without truncation", () => {
    const longBilingualTitle =
      "초장편 판타지 스튜디오 프로젝트 · UltraLongWebtoonEpisodeProductionWorkflowWithBilingualDirectorCutEdition2026_Chapter99_FinalRevision";
    const longBilingualDescription =
      "마지막 편집 캔버스와 컷 레이어 복원 지점 · /studio/p/ultra-long-bilingual-project-2026/d/episode-99-director-cut-storyboard";
    fixtures.continuity.recent = [
      { id: "studio", href: "/studio/p/long-title", visitedAt: Date.parse("2026-10-01T12:00:00.000Z") },
    ];
    continuityMocks.label = () => longBilingualTitle;
    continuityMocks.description = () => longBilingualDescription;

    renderPage();

    const titleEl = screen.getByTestId("my-space-recent-title");
    const descEl = screen.getByTestId("my-space-recent-description");
    expect(titleEl.textContent).toBe(longBilingualTitle);
    expect(titleEl.className).toContain("break-words");
    expect(titleEl.className).not.toContain("truncate");
    expect(descEl.textContent).toBe(longBilingualDescription);
    expect(descEl.className).toContain("break-words");
    expect(screen.queryByTestId("my-space-cover-fallback")).toBeNull();

    const root = screen.getByTestId("my-space-hub-root");
    const firstImg = root.querySelector("img");
    expect(firstImg).toBeTruthy();
    if (firstImg) {
      fireEvent.error(firstImg);
    }
    expect(screen.getByTestId("my-space-cover-fallback").textContent).toContain(
      "일부 표지 이미지를 불러오지 못해 원본 표지 대신 텍스트 안내 카드로 대체 표시합니다.",
    );
    expect(firstImg?.getAttribute("alt")).toContain("원본 표지 대신 텍스트 안내 카드로 대체 표시");
    expect(root.getAttribute("data-broken-image-recovered")).toBe("true");
  });

  it("shows a 0-result filter state with a 44px reset button and reveals search only on demand ('/' or URL query) with Escape recovery", async () => {
    renderPage("/my?role=unknown-category");

    // 잘못된 URL role 파라미터로 0건이 되었을 때만 빈 상태와 검색/복원 버튼을 표시한다
    const emptyState = screen.getByTestId("my-space-filter-empty");
    expect(emptyState.textContent).toContain("선택한 조건에 맞는 바로가기가 없습니다 (0건)");
    const resetButton = screen.getByTestId("my-space-filter-reset");
    expect(resetButton.className).toContain("min-h-11");
    expect(resetButton.className).toContain("min-w-11");

    fireEvent.click(resetButton);
    expect(screen.queryByTestId("my-space-filter-empty")).toBeNull();
    expect(screen.queryByTestId("my-space-destination-search")).toBeNull();
    expect(screen.queryByTestId("my-space-filter-status")).toBeNull();
    expect(screen.getByTestId("my-space-role-filter-all").getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(screen.getByTestId("my-space-role-filter-all"));

    // 필요할 때('/') 검색 입력을 드러내고 0건 안내 및 Escape 복원 검증
    fireEvent.keyDown(screen.getByTestId("my-space-role-filter-all"), { key: "/" });
    const searchInput = await screen.findByTestId("my-space-destination-search");
    await waitFor(() => expect(document.activeElement).toBe(searchInput));
    fireEvent.change(searchInput, { target: { value: "존재하지않는바로가기키워드999" } });
    expect(screen.getByTestId("my-space-filter-empty")).toBeTruthy();
    expect(screen.getByTestId("my-space-filter-status").textContent).toContain("0 / 14");

    fireEvent.keyDown(searchInput, { key: "Escape" });
    expect(screen.queryByTestId("my-space-filter-empty")).toBeNull();
    expect(screen.queryByTestId("my-space-destination-search")).toBeNull();
    expect(screen.queryByTestId("my-space-filter-status")).toBeNull();

    // 역할 필터 버튼 내 키보드 화살표·Home·End·Escape 탐색 복원성 검증
    fireEvent.keyDown(screen.getByTestId("my-space-role-filter-all"), { key: "ArrowRight" });
    expect(screen.getByTestId("my-space-role-filter-reader").getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(screen.getByTestId("my-space-role-filter-reader"));

    fireEvent.keyDown(screen.getByTestId("my-space-role-filter-reader"), { key: "End" });
    expect(screen.getByTestId("my-space-role-filter-account").getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(screen.getByTestId("my-space-role-filter-account"));

    fireEvent.keyDown(screen.getByTestId("my-space-role-filter-account"), { key: "ArrowLeft" });
    expect(screen.getByTestId("my-space-role-filter-creator").getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(screen.getByTestId("my-space-role-filter-creator"));

    fireEvent.keyDown(screen.getByTestId("my-space-role-filter-creator"), { key: "Escape" });
    expect(screen.getByTestId("my-space-role-filter-all").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("my-space-filter-status")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("my-space-role-filter-all"));
  });

  it("provides a 44px touch-discoverable search toggle and places primary action and destinations ahead of progressive disclosure guides", async () => {
    fixtures.continuity.recent = [
      { id: "studio", href: "/studio/p/project-1/d/document-1?resume=latest", visitedAt: Date.parse("2026-10-01T12:00:00.000Z") },
    ];
    renderPage("/my");

    const root = screen.getByTestId("my-space-hub-root");
    const nextAction = root.querySelector("[data-my-space-next-action='true']");
    const destinations = root.querySelector("#my-space-destinations")?.closest("section");
    const moreDetails = screen.getByTestId("my-space-more-details");
    expect(nextAction).toBeTruthy();
    expect(destinations).toBeTruthy();
    expect(moreDetails.hasAttribute("open")).toBe(false);
    if (nextAction && destinations) {
      expect(Boolean(nextAction.compareDocumentPosition(destinations) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
      expect(Boolean(destinations.compareDocumentPosition(moreDetails) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    }

    const searchToggle = screen.getByTestId("my-space-search-toggle");
    expect(searchToggle.className).toContain("min-h-11");
    expect(searchToggle.className).toContain("min-w-11");
    expect(searchToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("my-space-destination-search")).toBeNull();

    // 터치/클릭 1회로 검색 입력이 열리고 포커스가 이동한다
    fireEvent.click(searchToggle);
    expect(searchToggle.getAttribute("aria-expanded")).toBe("true");
    const searchInput = await screen.findByTestId("my-space-destination-search");
    await waitFor(() => expect(document.activeElement).toBe(searchInput));

    fireEvent.change(searchInput, { target: { value: "서재" } });
    expect(screen.getByTestId("my-space-filter-status").textContent).toContain("1 / 14");

    // 다시 터치 토글을 누르면 검색어가 초기화되고 입력창이 닫힌다
    fireEvent.click(searchToggle);
    expect(searchToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("my-space-destination-search")).toBeNull();
    expect(screen.queryByTestId("my-space-filter-status")).toBeNull();
  });
});

