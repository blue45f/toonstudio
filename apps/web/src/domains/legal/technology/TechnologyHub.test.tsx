// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AboutSectionNav } from "../AboutSectionNav";
import { TechnologyPage } from "../TechnologyPage";
import { ENGINEERING_STATUS_META } from "./engineering-story-content";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";
import { ENGINEERING_STORY_GROUPS } from "./engineering-story-groups";
import { ENGINEERING_READING_FLOW_DIAGRAM } from "./engineering-reading-flow-diagram";
import {
  ENGINEERING_READING_ROUTES,
  ENGINEERING_START_PAGES,
  readingRouteTime,
  readingStepHref,
} from "./engineering-reading-routes";
import { ENGINEERING_PAGES, ENGINEERING_PAGE_GROUPS, ENGINEERING_PATH_PAGES, findEngineeringPage } from "./engineering-tech-pages";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

const capabilityMocks = vi.hoisted(() => ({
  state: {
    status: "unknown",
    checking: false,
    report: null,
    lastError: null,
    nextProbeAt: null,
    recoveredAt: null,
  } as Record<string, unknown>,
}));

vi.mock("@/platform/service-capability-state", () => ({
  useServiceCapabilityState: () => capabilityMocks.state,
}));

afterEach(cleanup);

describe("기술 허브", () => {
  it("발표 동선 다섯 단계를 목적 한 줄과 읽기·발표 시간으로 안내한다", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology"]}>
        <TechnologyPage />
      </MemoryRouter>,
    );

    const pathSection = screen.getByRole("heading", { level: 2, name: /발표 동선|Talk path/u }).closest("section");
    if (!pathSection) throw new Error("talk path section is missing");
    const cards = within(pathSection).getAllByRole("link");
    expect(cards.map((card) => card.getAttribute("href"))).toEqual(ENGINEERING_PATH_PAGES.map((page) => page.href));
    ENGINEERING_PATH_PAGES.forEach((page, index) => {
      const card = cards[index];
      if (!card) throw new Error(`missing card for ${page.id}`);
      expect(card.textContent).toContain(page.purpose.ko);
      expect(card.textContent).toContain(page.readingMinutes ? `읽기 약 ${String(page.readingMinutes)}분` : `발표 ${String(page.talkMinutes ?? 0)}분`);
    });

    const techNav = screen.getByRole("navigation", { name: /기술 문서 메뉴|Engineering documents/u });
    expect(within(techNav).getAllByRole("link")).toHaveLength(ENGINEERING_PAGES.length);
    for (const group of ENGINEERING_PAGE_GROUPS) {
      const links = within(within(techNav).getByRole("group", { name: group.label.ko })).getAllByRole("link");
      expect(links.map((link) => link.getAttribute("href"))).toEqual(
        ENGINEERING_PAGES.filter((page) => page.group === group.id).map((page) => page.href),
      );
    }
    expect(within(techNav).queryByRole("link", { current: "page" })).toBeNull();
    expect(screen.getByRole("link", { name: /발표 모드 열기|Open presentation mode/u }).getAttribute("href")).toBe("/about/technology/deck");
  });
});

/** 시간 표기 규칙(허브와 같다): 60분 미만은 "약 N분", 이상은 "약 H시간 M분". */
function expectedApproximateTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `약 ${String(rest)}분`;
  return rest === 0 ? `약 ${String(hours)}시간` : `약 ${String(hours)}시간 ${String(rest)}분`;
}

describe("기술 허브 읽는 길", () => {
  it("첫 구역에서 구조(아키텍처 해설)와 재료(라이브러리 해설)를 질문과 함께 시작점으로 보여준다", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology"]}>
        <TechnologyPage />
      </MemoryRouter>,
    );

    const start = screen.getByRole("heading", { level: 2, name: /여기서 시작|Start with the structure/u }).closest("section");
    if (!start) throw new Error("start section is missing");
    const cards = within(start).getAllByRole("link");
    expect(cards.map((card) => card.getAttribute("href"))).toEqual(ENGINEERING_START_PAGES.map((entry) => findEngineeringPage(entry.pageId).href));
    ENGINEERING_START_PAGES.forEach((entry, index) => {
      const page = findEngineeringPage(entry.pageId);
      expect(cards[index]?.textContent, entry.pageId).toContain(entry.title.ko);
      expect(cards[index]?.textContent, entry.pageId).toContain(entry.role.ko);
      expect(cards[index]?.textContent, entry.pageId).toContain(page.question?.ko ?? "질문 없음");
    });

    // 시작점은 첫 두 화면 안, 즉 소개 메뉴 바로 뒤에 온다(챕터 도서관·상태 띠보다 앞).
    const hero = screen.getByRole("heading", { level: 1 });
    expect(hero.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("읽는 길 세 가지를 대상·단계·시간과 함께 보여주고 시간은 레지스트리에서 더한다", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology"]}>
        <TechnologyPage />
      </MemoryRouter>,
    );

    const routes = screen.getByRole("heading", { level: 2, name: /길을 고르세요|Pick the route/u }).closest("section");
    if (!routes) throw new Error("routes section is missing");
    const articles = within(routes).getAllByRole("article");
    expect(articles).toHaveLength(ENGINEERING_READING_ROUTES.length);

    ENGINEERING_READING_ROUTES.forEach((route, index) => {
      const article = articles[index];
      if (!article) throw new Error(`missing route card ${route.id}`);
      const scope = within(article);
      expect(scope.getByRole("heading", { level: 3 }).textContent).toBe(route.title.ko);
      expect(article.textContent).toContain(route.audience.ko);

      // 단계 링크는 길이 정의한 순서·주소와 같고, 마지막 하나는 첫 필수 단계로 시작하는 단추다.
      const first = route.steps.find((step) => !step.optional) ?? route.steps[0];
      if (!first) throw new Error(`route without steps ${route.id}`);
      expect(scope.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
        ...route.steps.map((step) => readingStepHref(step)),
        readingStepHref(first),
      ]);

      // 시간은 단계 시간의 합. 시간이 모자라 합계를 못 내는 길에는 합계를 쓰지 않는다.
      const time = readingRouteTime(route);
      if (time.complete) expect(scope.getByText(expectedApproximateTime(time.minutes)), route.id).toBeTruthy();
      else expect(scope.queryByText(/^약 \d+(시간|분)/u), route.id).toBeNull();
    });

    // 선택 단계는 "필요할 때" 표시가 붙고 시간을 더하지 않는다.
    const optionalCount = ENGINEERING_READING_ROUTES.flatMap((route) => route.steps).filter((step) => step.optional).length;
    expect(within(routes).getAllByText(/필요할 때|As needed/u)).toHaveLength(optionalCount);
  });

  it("한 장 흐름 도식을 그리고 단계 번호가 발표 동선 카드와 같다", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/about/technology"]}>
        <TechnologyPage />
      </MemoryRouter>,
    );

    const figure = container.querySelector(`figure[data-diagram="${ENGINEERING_READING_FLOW_DIAGRAM.id}"]`);
    expect(figure).toBeTruthy();
    expect(figure?.textContent).toContain(ENGINEERING_READING_FLOW_DIAGRAM.alt.ko);
    // 도식의 "N · 이름" 단계가 발표 동선 다섯 단계와 같은 번호·이름이다.
    for (const page of ENGINEERING_PATH_PAGES) expect(figure?.textContent, page.id).toContain(`${String(page.step)} · ${page.label.ko}`);
    // 도식을 크게 볼 수 있다.
    expect(screen.getByRole("button", { name: /크게 보기|Enlarge/u })).toBeTruthy();
  });

  it("찾아보기 구역은 도감과 지도, 그리고 자료 묶음의 나머지 페이지와 영상을 빠짐없이 연다", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology"]}>
        <TechnologyPage />
      </MemoryRouter>,
    );

    const lookup = screen.getByRole("heading", { level: 2, name: /기술 도감|tech atlas/iu }).closest("section");
    if (!lookup) throw new Error("look-up section is missing");
    const hrefs = within(lookup).getAllByRole("link").map((link) => link.getAttribute("href"));
    const expected = ENGINEERING_PAGES.filter((page) => (page.group === "resources" && page.id !== "atlas") || page.id === "videos").map((page) => page.href);
    expect(expected.length).toBeGreaterThan(0);
    for (const href of [findEngineeringPage("atlas").href, ...expected]) expect(hrefs, href).toContain(href);
    // 용어집이 가장 먼저: 낯선 말은 용어집에서 먼저 찾는다.
    expect(hrefs.indexOf(findEngineeringPage("glossary").href)).toBeLessThan(hrefs.indexOf(findEngineeringPage("references").href));
  });

  it("아키텍처 지도 띠에서 아키텍처 해설로 더 자세히 이어진다", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology"]}>
        <TechnologyPage />
      </MemoryRouter>,
    );

    const section = screen.getByRole("heading", { level: 2, name: /원본은 기기에|Sources on the device/u }).closest("section");
    if (!section) throw new Error("architecture map section is missing");
    const more = within(section).getByRole("link", { name: /아키텍처 해설로 더 자세히|architecture guide/iu });
    expect(more.getAttribute("href")).toBe(findEngineeringPage("architecture").href);
  });

  it("발표 동선 설명의 발표 시간은 레지스트리 값을 쓴다", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology"]}>
        <TechnologyPage />
      </MemoryRouter>,
    );

    const pathSection = screen.getByRole("heading", { level: 2, name: /발표 동선|Talk path/u }).closest("section");
    expect(pathSection?.textContent).toContain(`세미나 ${String(findEngineeringPage("deck").talkMinutes)}분`);
  });
});

describe("기술 허브 문서 도서관", () => {
  it("모든 챕터를 상태 배지·읽기 시간과 함께 카드로 보여주고 본문 앵커로 연결한다", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology"]}>
        <TechnologyPage />
      </MemoryRouter>,
    );

    const librarySection = screen.getByRole("heading", { level: 2, name: /기술 문서 도서관|engineering library/iu }).closest("section");
    if (!librarySection) throw new Error("library section is missing");

    // 주제 묶음 여덟 개가 소제목으로 먼저 보인다.
    const groupHeadings = within(librarySection).getAllByRole("heading", { level: 3 });
    expect(groupHeadings.map((heading) => heading.textContent)).toEqual(
      ENGINEERING_STORY_GROUPS.map((group) => group.title.ko),
    );

    // 카드 수는 공개 챕터 수와 같고, 전부 제작 스토리의 해당 챕터 본문으로 이어진다.
    const cards = within(librarySection).getAllByRole("link");
    expect(cards).toHaveLength(PUBLISHED_ENGINEERING_CHAPTERS.length);
    expect(cards.map((card) => card.getAttribute("href"))).toEqual(
      ENGINEERING_STORY_GROUPS.flatMap((group) => group.chapterIds.map((id) => `/about/technology/story#${id}`)),
    );

    // 카드마다 제목·논지·상태 배지(실제 상태 라벨)·읽기 시간이 정직하게 붙는다.
    const chapterById = new Map<string, (typeof PUBLISHED_ENGINEERING_CHAPTERS)[number]>(
      PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => [chapter.id, chapter]),
    );
    for (const card of cards) {
      const id = card.getAttribute("href")?.split("#")[1] ?? "";
      const chapter = chapterById.get(id);
      if (!chapter) throw new Error(`unknown chapter card: ${id}`);
      expect(card.textContent).toContain(chapter.title.ko);
      expect(card.textContent).toContain(chapter.thesis.ko);
      expect(card.textContent).toContain(ENGINEERING_STATUS_META[chapter.status].label.ko);
      expect(card.textContent).toMatch(/읽기 약 \d+분/u);
    }

    // 도서관은 카드가 길게 이어지므로 시작점·읽는 길·읽는 순서·발표 동선·찾아보기 뒤에 둔다. 길이 먼저 보여야 길게 헤매지 않는다.
    const libraryHeading = within(librarySection).getByRole("heading", { level: 2 });
    for (const earlier of [/여기서 시작|Start with the structure/u, /길을 고르세요|Pick the route/u, /읽는 순서|reading order/iu, /발표 동선|Talk path/u, /기술 도감|tech atlas/iu]) {
      const heading = screen.getByRole("heading", { level: 2, name: earlier });
      expect(heading.compareDocumentPosition(libraryHeading) & Node.DOCUMENT_POSITION_FOLLOWING, String(earlier)).toBeTruthy();
    }

    // 전 챕터 그리드로 대체된 여섯 개 추천 섹션은 더 이상 중복으로 남지 않는다.
    expect(screen.queryByRole("heading", { name: /가장 많이 묻는 여섯 가지 결정/u })).toBeNull();
  });
});

describe("소개 메뉴", () => {
  it("현재 페이지는 page, 기술 하위 페이지에서는 기술 탭을 location으로 표시한다", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/about/technology"]}>
        <AboutSectionNav />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /기술과 신뢰|Technology & trust/u }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /서비스 소개|Service/u }).getAttribute("aria-current")).toBeNull();
    unmount();

    render(
      <MemoryRouter initialEntries={["/about/technology/deck"]}>
        <AboutSectionNav variant="compact" />
      </MemoryRouter>,
    );
    const technology = screen.getByRole("link", { name: /기술과 신뢰|Technology & trust/u });
    expect(technology.getAttribute("aria-current")).toBe("location");
    // 간결형은 한 줄 이름만 보여준다(설명 문구 없음).
    expect(technology.textContent).toBe("기술과 신뢰");
  });
});

const ALL_CAPABILITIES = {
  publicCatalog: "available",
  authSession: "available",
  communityRead: "available",
  communityWrite: "available",
  marketplaceRead: "available",
  studioLocalEditing: "available",
  studioProjectRead: "available",
  studioCloudSave: "available",
  realtimeCollaboration: "available",
  publishing: "available",
  serverAi: "available",
} as const;

function renderHub() {
  return render(
    <MemoryRouter initialEntries={["/about/technology"]}>
      <TechnologyPage />
    </MemoryRouter>,
  );
}

describe("기술 허브 상태 스트립", () => {
  it("확인된 보고서가 없으면 정상이라고 말하지 않고 상태 페이지로 안내한다", () => {
    capabilityMocks.state = {
      status: "unknown",
      checking: false,
      report: null,
      lastError: null,
      nextProbeAt: null,
      recoveredAt: null,
    };
    renderHub();

    const strip = screen.getByRole("region", { name: /서비스 상태 요약|Service status summary/u });
    expect(within(strip).getByText(/아직 확인하지 못했습니다|has not been checked yet/u)).toBeTruthy();
    expect(within(strip).queryByText(/전체 서비스 정상|All services operational/u)).toBeNull();
    expect(within(strip).getByRole("link", { name: /상태 자세히 보기|View status details/u }).getAttribute("href")).toBe("/status");
  });

  it("보고서가 정상이면 기능 수와 최근 확인 시각을 실제 값으로 보여준다", () => {
    capabilityMocks.state = {
      status: "available",
      checking: false,
      report: {
        status: "available",
        incidentId: null,
        retryAfterSeconds: null,
        checkedAt: "2026-09-25T20:00:00.000Z",
        capabilities: ALL_CAPABILITIES,
      },
      lastError: null,
      nextProbeAt: null,
      recoveredAt: null,
    };
    renderHub();

    const strip = screen.getByRole("region", { name: /서비스 상태 요약|Service status summary/u });
    expect(within(strip).getByText(/전체 서비스 정상|All services operational/u)).toBeTruthy();
    expect(within(strip).getByText(/11개 기능 모두 사용 가능|All 11 capabilities are available/u)).toBeTruthy();
    const checked = within(strip).getByText(/최근 확인|Last checked/u).querySelector("time");
    expect(checked?.getAttribute("dateTime")).toBe("2026-09-25T20:00:00.000Z");
    expect(checked?.textContent?.length).toBeGreaterThan(0);
  });

  it("일부 기능이 제한되면 제한 개수와 장애 ID를 보여준다", () => {
    capabilityMocks.state = {
      status: "degraded",
      checking: false,
      report: {
        status: "degraded",
        incidentId: "inc_status",
        retryAfterSeconds: 30,
        checkedAt: "2026-09-25T20:00:00.000Z",
        capabilities: { ...ALL_CAPABILITIES, authSession: "degraded", studioCloudSave: "unavailable" },
      },
      lastError: null,
      nextProbeAt: null,
      recoveredAt: null,
    };
    renderHub();

    const strip = screen.getByRole("region", { name: /서비스 상태 요약|Service status summary/u });
    expect(within(strip).getByText(/일부 온라인 기능 제한 중|Some online capabilities are limited/u)).toBeTruthy();
    expect(within(strip).getByText(/11개 중 2개 기능 제한 중|2 of 11 capabilities are limited/u)).toBeTruthy();
    expect(within(strip).getByText(/inc_status/u)).toBeTruthy();
  });
});

