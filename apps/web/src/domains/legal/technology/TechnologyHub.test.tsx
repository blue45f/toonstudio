// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AboutSectionNav } from "../AboutSectionNav";
import { TechnologyPage } from "../TechnologyPage";
import { ENGINEERING_PAGES, ENGINEERING_PAGE_GROUPS, ENGINEERING_PATH_PAGES } from "./engineering-tech-pages";

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

