// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { useUi } from "@/shared/lib/ui-store";

import { CommandPaletteHost } from "../command-palette-host";
import { SiteMenuDestinations } from "../SiteMenuDestinations";
import { PageRoleAndJourneyNavigator } from "./PageRoleAndJourneyNavigator";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import { WorkspaceTaskFrame } from "./WorkspaceTaskFrame";
import {
  CORE_SURFACE_QUICK_LINKS,
  CREATOR_JOURNEY_STAGES,
  PAGE_ROLE_JOURNEY_ENTRIES,
  journeyStageForNavigationGroupId,
  journeyStageForNumber,
  resolvePageRoleJourney,
} from "./page-role-journey-map";
import { resolveShellJourneySummary } from "./page-role-journey-shell-lite";
import { workspaceTaskRoute } from "./workspace-task-route";

vi.mock("@/shared/components/open-search-button", () => ({
  OpenSearchButton: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    "aria-label"?: string;
    className?: string;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ data: null, ready: true }),
}));

beforeEach(() => {
  useI18n.getState().setLang("ko");
  useUi.setState({ commandPaletteOpen: false });
});

afterEach(() => {
  cleanup();
});

describe("페이지 역할 · 5단계 창작 여정 단일 지도", () => {
  it("5단계 창작 여정 순서와 정본 메타데이터를 빠짐없이 정의한다", () => {
    expect(CREATOR_JOURNEY_STAGES).toHaveLength(5);
    expect(CREATOR_JOURNEY_STAGES.map((stage) => stage.stageNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(CREATOR_JOURNEY_STAGES.map((stage) => stage.stepCode)).toEqual(["01", "02", "03", "04", "05"]);
    expect(CREATOR_JOURNEY_STAGES.map((stage) => stage.primaryHref)).toEqual([
      "/home",
      "/studio",
      "/production",
      "/market",
      "/studio/support",
    ]);
    for (const stage of CREATOR_JOURNEY_STAGES) {
      expect(journeyStageForNumber(stage.stageNumber)).toBe(stage);
      expect(stage.badgeKo.length).toBeGreaterThan(0);
      expect(stage.badgeEn.length).toBeGreaterThan(0);
    }
  });

  it("핵심 표면 4종(/studio · /production · /market · /support·/creator-support)의 역할을 혼동 없이 분리한다", () => {
    const studio = resolvePageRoleJourney("/studio");
    const production = resolvePageRoleJourney("/production");
    const market = resolvePageRoleJourney("/market");
    const support = resolvePageRoleJourney("/support");
    const studioSupport = resolvePageRoleJourney("/studio/support");
    const creatorSupport = resolvePageRoleJourney("/creator-support");

    expect(studio.stageNumber).toBe(2);
    expect(studio.accentTone).toBe("creation");
    expect(studio.roleHeadlineKo).toContain("원고를 직접 그리고");

    expect(production.stageNumber).toBe(3);
    expect(production.accentTone).toBe("collab");
    expect(production.roleHeadlineKo).toContain("분업");

    expect(market.stageNumber).toBe(4);
    expect(market.accentTone).toBe("market");
    expect(market.roleHeadlineKo).toContain("에셋 마켓");

    expect(support.stageNumber).toBe(5);
    expect(support.accentTone).toBe("support");
    expect(support.roleHeadlineKo).toContain("AI 채팅상담");

    expect(studioSupport.stageNumber).toBe(5);
    expect(studioSupport.accentTone).toBe("support");
    expect(studioSupport.roleHeadlineKo).toContain("1:1 실시간 AI 채팅상담");

    expect(creatorSupport.stageNumber).toBe(5);
    expect(creatorSupport.accentTone).toBe("support");

    const headlines = new Set([
      studio.roleHeadlineKo,
      production.roleHeadlineKo,
      market.roleHeadlineKo,
      support.roleHeadlineKo,
    ]);
    expect(headlines.size).toBe(4);
  });

  it("하위 경로·프로젝트 경로·미지정 경로를 일관되게 해석하고 2~3개의 다음 동선을 제공한다", () => {
    expect(resolvePageRoleJourney("/production/projects/demo/overview").stageNumber).toBe(3);
    expect(resolvePageRoleJourney("/market/resource/brush-pack").stageNumber).toBe(4);
    expect(resolvePageRoleJourney("/studio/bg3d/scene-1").accentTone).toBe("three-d");
    expect(resolvePageRoleJourney("/studio/p/project-1/overview").stageNumber).toBe(2);
    expect(resolvePageRoleJourney("/studio/p/project-1/space").stageNumber).toBe(3);
    expect(resolvePageRoleJourney("/studio/work/w-1/review").stageNumber).toBe(3);
    expect(resolvePageRoleJourney("/studio/work/w-1/versions").stageNumber).toBe(5);
    expect(resolvePageRoleJourney("/unknown-future-route").stageNumber).toBe(1);

    for (const entry of PAGE_ROLE_JOURNEY_ENTRIES) {
      expect(entry.recommendedNextSteps.length, entry.pathPattern).toBeGreaterThanOrEqual(2);
      expect(entry.recommendedNextSteps.length, entry.pathPattern).toBeLessThanOrEqual(3);
      for (const next of entry.recommendedNextSteps) {
        expect(next.href.startsWith("/"), `${entry.pathPattern}->${next.href}`).toBe(true);
        expect(next.reasonKo.length).toBeGreaterThan(0);
        expect(next.reasonEn.length).toBeGreaterThan(0);
      }
    }

    expect(journeyStageForNavigationGroupId("personal").stageNumber).toBe(1);
    expect(journeyStageForNavigationGroupId("create").stageNumber).toBe(2);
    expect(journeyStageForNavigationGroupId("connect").stageNumber).toBe(3);
    expect(journeyStageForNavigationGroupId("discover").stageNumber).toBe(4);
    expect(CORE_SURFACE_QUICK_LINKS.map((item) => item.href)).toEqual([
      "/research/materials",
      "/studio/bg3d",
      "/production",
      "/market",
      "/studio/support",
      "/creator-support",
    ]);
    expect(resolvePageRoleJourney("/research/materials").stageNumber).toBe(4);
    expect(resolvePageRoleJourney("/research/materials").accentTone).toBe("market");
  });

  it("/studio/ai-lab을 Stage 2 AI 창작 실험실(three-d)로 정확히 분류하고 사이트 홈으로 오분류하지 않는다", () => {
    const aiLab = resolvePageRoleJourney("/studio/ai-lab");
    expect(aiLab.stageNumber).toBe(2);
    expect(aiLab.stageBadgeKo).toContain("작품 제작");
    expect(aiLab.accentTone).toBe("three-d");
    expect(aiLab.pageLabelKo).toBe("AI 창작 실험실");
    expect(aiLab.pageLabelEn).toBe("AI Creative Lab");
    expect(aiLab.roleHeadlineKo).toBe("루나 AI 디렉터·생성 실험실·로컬 추론으로 장면을 구상하는 공간");
    expect(aiLab.clearDistinctionKo).toBe("비용·데이터·라이선스 조건을 먼저 확인하고 내 컷에 선택 적용하는 실험실입니다");
    expect(aiLab.recommendedNextSteps.map((step) => step.href)).toEqual([
      "/studio/canvas",
      "/studio/bg3d",
      "/studio/character",
    ]);

    expect(resolvePageRoleJourney("/studio/ai-lab/director").pageLabelKo).toBe("AI 창작 실험실");
    expect(resolveShellJourneySummary("/studio/ai-lab")).toMatchObject({
      stageNumber: 2,
      accentTone: "three-d",
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/studio/ai-lab"]}>
        <PageRoleAndJourneyNavigator pathname="/studio/ai-lab" />
      </MemoryRouter>,
    );
    const bar = container.querySelector('[data-role-journey-bar="true"]');
    expect(bar?.getAttribute("data-journey-stage")).toBe("2");
    expect(bar?.getAttribute("data-accent-tone")).toBe("three-d");
    expect(bar?.textContent).toContain("AI 창작 실험실");
    expect(bar?.textContent).not.toContain("공개 첫 화면입니다");
  });
});

describe("PageRoleAndJourneyNavigator 컴포넌트", () => {
  it.each(["ko", "en"] as const)("%s에서 현재 단계·이 페이지 역할·다음 추천 동선 칩을 정확히 렌더링한다", (locale) => {
    useI18n.getState().setLang(locale);
    const { container } = render(
      <MemoryRouter initialEntries={["/production"]}>
        <PageRoleAndJourneyNavigator
          pathname="/production"
          context={{ projectId: "alpha" }}
        />
      </MemoryRouter>,
    );

    const bar = container.querySelector('[data-role-journey-bar="true"]');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute("data-journey-stage")).toBe("3");
    expect(bar?.getAttribute("data-accent-tone")).toBe("collab");

    const stepList = screen.getByRole("list", {
      name: locale === "ko" ? "5단계 창작 여정" : "5-stage creation journey",
    });
    const steps = within(stepList).getAllByRole("link");
    expect(steps).toHaveLength(5);
    expect(stepList.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(stepList.querySelector('[aria-current="step"]')?.getAttribute("data-journey-stage")).toBe("3");
    expect(steps[0]?.getAttribute("data-stage-state")).toBe("completed");
    expect(steps[1]?.getAttribute("data-stage-state")).toBe("completed");
    expect(steps[2]?.getAttribute("data-stage-state")).toBe("current");
    expect(steps[3]?.getAttribute("data-stage-state")).toBe("upcoming");
    expect(steps[4]?.getAttribute("data-stage-state")).toBe("upcoming");
    // 프로젝트 맥락이 /home · /team 이동에도 보존된다.
    expect(steps[0]?.getAttribute("href")).toBe("/home?project=alpha");

    const nextNav = screen.getByRole("navigation", {
      name: locale === "ko" ? "다음 추천 동선" : "Recommended next steps",
    });
    const nextLinks = within(nextNav).getAllByRole("link");
    expect(nextLinks).toHaveLength(3);
    expect(nextLinks[0]?.getAttribute("href")).toBe("/team?project=alpha");
    expect(nextLinks[0]?.className).toContain("min-h-11");
  });

  it("WorkspaceTaskFrame 작업 화면에서 지연 마운트되고 집중 셸에서는 노출하지 않는다", async () => {
    const taskView = render(
      <MemoryRouter initialEntries={["/market"]}>
        <WorkspaceTaskFrame route={workspaceTaskRoute("/market")}>
          <div>Market content</div>
        </WorkspaceTaskFrame>
      </MemoryRouter>,
    );

    await waitFor(() => {
      const bar = taskView.container.querySelector('[data-role-journey-bar="true"]');
      expect(bar).not.toBeNull();
      expect(bar?.getAttribute("data-journey-stage")).toBe("4");
      expect(bar?.getAttribute("data-accent-tone")).toBe("market");
    });

    taskView.unmount();

    const focusedView = render(
      <MemoryRouter initialEntries={["/studio/new"]}>
        <WorkspaceTaskFrame route={workspaceTaskRoute("/studio/new")}>
          <div>New project</div>
        </WorkspaceTaskFrame>
      </MemoryRouter>,
    );
    expect(focusedView.container.querySelector('[data-role-journey-bar="true"]')).toBeNull();
  });

  it("전체 메뉴·LNB·역할 동선 바가 동일한 5단계 순서와 신규 핵심 표면을 1클릭으로 연결한다", () => {
    const menuView = render(
      <MemoryRouter initialEntries={["/market"]}>
        <SiteMenuDestinations
          locale="ko"
          currentGroupId="grow"
          currentPathname="/market"
          isActive={(href) => href === "/market"}
          menuId="parity-menu"
        />
      </MemoryRouter>,
    );
    const menuJourney = menuView.container.querySelector(".site-menu-journey__grid");
    const menuStageHrefs = Array.from(menuJourney?.querySelectorAll("a") ?? []).map(
      (link) => link.getAttribute("href"),
    );
    expect(menuStageHrefs).toEqual(["/home", "/studio", "/production", "/market", "/studio/support"]);
    expect(menuView.container.querySelector('a[href="/creator-support"]')).not.toBeNull();
    expect(menuView.container.querySelector('a[href="/studio/support"]')).not.toBeNull();
    expect(menuView.container.querySelector('a[href="/production"]')).not.toBeNull();
    menuView.unmount();

    const lnbView = render(
      <MemoryRouter initialEntries={["/production"]}>
        <WorkspaceNavigation />
      </MemoryRouter>,
    );
    const hub = lnbView.container.querySelector('[data-workspace-journey-hub="true"]');
    const lnbStageHrefs = Array.from(hub?.querySelectorAll("ol a") ?? []).map(
      (link) => link.getAttribute("href"),
    );
    expect(lnbStageHrefs).toEqual(menuStageHrefs);
    expect(hub?.querySelector('a[href="/creator-support"]')).not.toBeNull();
    expect(hub?.querySelector('[data-current-stage="true"]')?.getAttribute("data-journey-stage")).toBe("3");
  });

  it("원시 HEX·transition-all·any 없이 시맨틱 OKLCH 토큰과 모션 감소 가드를 준수한다", () => {
    const baseDir = path.resolve(process.cwd(), "apps/web/src/shared/components/workspace");
    const mapSource = readFileSync(path.join(baseDir, "page-role-journey-map.ts"), "utf8");
    const shellLiteSource = readFileSync(path.join(baseDir, "page-role-journey-shell-lite.ts"), "utf8");
    const navSource = readFileSync(path.join(baseDir, "PageRoleAndJourneyNavigator.tsx"), "utf8");
    for (const source of [mapSource, shellLiteSource, navSource]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(source).not.toContain("transition-all");
      expect(source).not.toMatch(/:\s*any\b|as\s+any\b/u);
    }
    expect(shellLiteSource).toContain("motion-reduce:transition-none");
    expect(navSource).toContain("overscroll-x-contain");
    expect(navSource).toContain("min-h-11");

    const { container } = render(
      <MemoryRouter initialEntries={["/studio"]}>
        <PageRoleAndJourneyNavigator pathname="/studio" />
      </MemoryRouter>,
    );
    const chipLinks = Array.from(container.querySelectorAll("a"));
    expect(chipLinks.length).toBeGreaterThanOrEqual(7);
    for (const link of chipLinks) {
      expect(link.className).toContain("motion-reduce:transition-none");
      expect(link.className).toContain("min-h-11");
    }
  });

  it("소재 검색 (⌘⇧K) 런처 버튼 클릭 및 Ctrl/Cmd+Shift+K 단축키로 전역 소재 검색 팔레트를 단독 지연 마운트하고 ⌘K·/와 충돌하지 않는다", async () => {
    window.history.replaceState({}, "", "/production");
    render(
      <MemoryRouter initialEntries={["/production"]}>
        <CommandPaletteHost />
        <PageRoleAndJourneyNavigator pathname="/production" />
      </MemoryRouter>,
    );

    const launcher = screen.getByTestId("journey-asset-search-launcher");
    expect(launcher.textContent).toContain("소재 검색 (⌘⇧K)");
    expect(launcher.className).toContain("min-h-11");
    expect(screen.queryByTestId("global-asset-search-dialog")).toBeNull();

    // 전역 Cmd+K와 /는 CommandPaletteHost만 열고 소재 검색 팔레트를 중복 오픈하지 않는다.
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(useUi.getState().commandPaletteOpen).toBe(true);
    expect(screen.queryByTestId("global-asset-search-dialog")).toBeNull();

    // Cmd+Shift+K는 전역 커맨드 팔레트를 닫고 소재 검색 팔레트만 단독 오픈한다.
    fireEvent.keyDown(window, { key: "k", metaKey: true, shiftKey: true });
    expect(useUi.getState().commandPaletteOpen).toBe(false);
    await waitFor(() => {
      expect(screen.getByTestId("global-asset-search-dialog")).not.toBeNull();
    });

    // Ctrl+Shift+K로 닫기 토글
    fireEvent.keyDown(window, { key: "k", ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(screen.queryByTestId("global-asset-search-dialog")).toBeNull();
    });

    // '/'는 소재 검색 팔레트를 가로채지 않는다.
    fireEvent.keyDown(document.body, { key: "/" });
    expect(useUi.getState().commandPaletteOpen).toBe(true);
    expect(screen.queryByTestId("global-asset-search-dialog")).toBeNull();

    // 런처 버튼 클릭 시 기존 전역 커맨드 팔레트를 닫고 소재 검색 팔레트만 단독 오픈한다.
    fireEvent.click(launcher);
    expect(useUi.getState().commandPaletteOpen).toBe(false);
    await waitFor(() => {
      expect(screen.getByTestId("global-asset-search-dialog")).not.toBeNull();
    });

    // 소재 검색 팔레트가 열린 상태에서 Ctrl+K를 누르면 소재 검색 팔레트를 닫아 이중 모달을 방지한다.
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await waitFor(() => {
      expect(screen.queryByTestId("global-asset-search-dialog")).toBeNull();
    });
    expect(useUi.getState().commandPaletteOpen).toBe(true);
  });

  it("영문 로케일에서는 소재 검색 런처 라벨이 Assets (⌘⇧K)로 표시된다", () => {
    useI18n.getState().setLang("en");
    render(
      <MemoryRouter initialEntries={["/production"]}>
        <PageRoleAndJourneyNavigator pathname="/production" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("journey-asset-search-launcher").textContent).toContain("Assets (⌘⇧K)");
  });
});
