import { describe, expect, it } from "vitest";

import {
  PRIMARY_SITE_NAVIGATION,
  SITE_NAVIGATION_GROUPS,
  SITE_NAVIGATION_ITEMS,
  SITE_UTILITY_NAVIGATION,
  TOONSPECTRUM_MOBILE_TABS,
  TOONSPECTRUM_NAVIGATION_GROUPS,
  TOONSPECTRUM_PRIMARY_NAVIGATION,
  TOONSTUDIO_MOBILE_TABS,
  TOONSTUDIO_NAVIGATION_GROUPS,
  TOONSTUDIO_PRIMARY_NAVIGATION,
  mobileSiteTabsForPath,
  primarySiteNavigationForPath,
  siteNavigationContextForPath,
  siteNavigationGroupForPath,
  siteNavigationGroupsForPath,
  siteNavigationJourneyForPath,
  siteNavigationLocale,
  siteNavigationText,
} from "./site-navigation";

describe("site navigation information architecture", () => {
  it("separates creation and discovery into distinct product navigation", () => {
    expect(TOONSTUDIO_PRIMARY_NAVIGATION.map((item) => item.id)).toEqual([
      "workspace-home",
      "studio",
      "explore",
      "community",
      "all-menu",
    ]);
    expect(TOONSPECTRUM_PRIMARY_NAVIGATION.map((item) => item.id)).toEqual([
      "home",
      "studio",
      "explore",
      "community",
      "all-menu",
    ]);
    expect(SITE_NAVIGATION_ITEMS.workspaceHome.href).toBe("/home");
    expect(SITE_NAVIGATION_ITEMS.home.href).toBe("/");

    expect(SITE_NAVIGATION_ITEMS.studio.href).toBe("/studio");
    expect(SITE_NAVIGATION_ITEMS.make.href).toBe("/create");
    expect(SITE_NAVIGATION_ITEMS.studioAssets.href).toBe("/studio/assets");
    expect(SITE_NAVIGATION_ITEMS.learn.href).toBe("/learn");
    expect(SITE_NAVIGATION_ITEMS.studioAssets.label.ko).toBe("작품 재료");
    expect(SITE_NAVIGATION_ITEMS.production.href).toBe("/production");
    expect(SITE_NAVIGATION_ITEMS.publish.href).toBe("/studio/publish");
    expect(SITE_NAVIGATION_ITEMS.technology.href).toBe("/about/technology");
    expect(SITE_NAVIGATION_ITEMS.technology.label.ko).toBe("제작 기술");
    expect(SITE_NAVIGATION_ITEMS.research.label.ko).toBe("리서치 데스크");
    expect(SITE_NAVIGATION_ITEMS.market.label.ko).toBe("소재 마켓");
  });

  it("학습과 작업 자료를 먼저 제공하고 운세 기능도 성장 메뉴에 유지한다", () => {
    const growItems = SITE_NAVIGATION_GROUPS.find(
      (group) => group.id === "grow",
    )?.items;

    expect(growItems?.map((item) => item.id)).toEqual([
      "research",
      "market",
      "learn",
      "opportunities",
      "insights",
      "now",
      "fortune",
      "technology",
    ]);
    expect(SITE_NAVIGATION_ITEMS.fortune.href).toBe("/fortune");
    // 목적지 이름은 하나다: 내비 정본 라벨은 "운세"이고 상세는 설명이 맡는다.
    expect(SITE_NAVIGATION_ITEMS.fortune.label.ko).toBe("운세");
    expect(SITE_NAVIGATION_ITEMS.fortune.description.ko).toContain("타로");
    expect(siteNavigationContextForPath("/fortune")).toBe("spectrum");
  });

  it("exposes the engineering story from the single map", () => {
    const growth = SITE_NAVIGATION_GROUPS.find(
      (group) => group.id === "grow",
    )?.items;

    expect(growth).toContain(SITE_NAVIGATION_ITEMS.technology);
  });

  it("keeps compatibility exports attached to the single map", () => {
    expect(PRIMARY_SITE_NAVIGATION).toBe(TOONSPECTRUM_PRIMARY_NAVIGATION);
    expect(SITE_NAVIGATION_GROUPS).toBe(TOONSPECTRUM_NAVIGATION_GROUPS);
    expect(SITE_NAVIGATION_GROUPS).toBe(TOONSTUDIO_NAVIGATION_GROUPS);
  });

  it("지도는 하나뿐이며 여정 순서(시작 → 제작 → 연재 → 협업)로 구간이 이어진다", () => {
    expect(SITE_NAVIGATION_GROUPS.map((group) => group.id)).toEqual([
      "discover",
      "create",
      "grow",
      "publish",
      "connect",
      "personal",
    ]);
    expect(SITE_NAVIGATION_GROUPS.map((group) => group.journey)).toEqual([
      "start",
      "create",
      "create",
      "publish",
      "collaborate",
      "start",
    ]);
    const create = SITE_NAVIGATION_GROUPS.find((group) => group.id === "create");
    expect(create?.items.map((item) => item.href)).toEqual([
      "/studio",
      "/create",
      "/studio/comic",
      "/studio/assets/characters/new",
      "/studio/bg3d",
      "/studio/space",
      "/studio/assets",
      "/production",
    ]);
    expect(SITE_NAVIGATION_ITEMS.virtualStudio.href).toBe("/studio/space");
  });

  it("구 이중 지도의 목적지를 하나도 잃지 않고 중복 없이 담는다", () => {
    const hrefs = SITE_NAVIGATION_GROUPS.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
    // 구 ToonStudio 지도(15)에만 있던 목적지
    for (const href of ["/studio/growth", "/studio/assets", "/studio/publish", "/team", "/hub"]) {
      expect(hrefs, href).toContain(href);
    }
    // 구 ToonSpectrum 지도(25)에만 있던 목적지
    for (const href of [
      "/create", "/studio/comic", "/studio/assets/characters/new", "/discover",
      "/ranking", "/calendar", "/recommend", "/opportunities", "/insights", "/now",
      "/fortune", "/reviews", "/play", "/library", "/",
    ]) {
      expect(hrefs, href).toContain(href);
    }
    // 두 지도 공통 목적지
    for (const href of [
      "/home", "/studio/space", "/production", "/research", "/market", "/learn",
      "/about/technology", "/showcase", "/community", "/collaborate",
    ]) {
      expect(hrefs, href).toContain(href);
    }
  });

  it("현재 경로가 속한 여정 구간을 지도 자체에서 판정한다", () => {
    expect(siteNavigationGroupForPath("/")?.id).toBe("personal");
    expect(siteNavigationJourneyForPath("/")).toBe("start");
    expect(siteNavigationGroupForPath("/home")?.id).toBe("personal");
    expect(siteNavigationGroupForPath("/ranking")?.id).toBe("discover");
    expect(siteNavigationGroupForPath("/studio/assets/characters/new")?.id).toBe("create");
    expect(siteNavigationGroupForPath("/studio/canvas")?.id).toBe("create");
    expect(siteNavigationJourneyForPath("/market")).toBe("create");
    expect(siteNavigationGroupForPath("/studio/publish")?.id).toBe("publish");
    expect(siteNavigationJourneyForPath("/studio/growth")).toBe("publish");
    // 학습 하위 경로는 전부 자료·성장(grow) 구간 — 전역 내비의 현재 여정 강조가 학습을 가리킨다.
    expect(siteNavigationGroupForPath("/learn")?.id).toBe("grow");
    expect(siteNavigationGroupForPath("/learn/classroom")?.id).toBe("grow");
    expect(siteNavigationGroupForPath("/learn/paths/first-three-panels")?.id).toBe("grow");
    expect(siteNavigationGroupForPath("/learn/recipes")?.id).toBe("grow");
    expect(siteNavigationJourneyForPath("/learn")).toBe("create");
    expect(siteNavigationGroupForPath("/team/people")?.id).toBe("connect");
    expect(siteNavigationJourneyForPath("/collaborate")).toBe("collaborate");
    expect(siteNavigationGroupForPath("/settings")).toBeNull();
    expect(siteNavigationJourneyForPath("/settings")).toBeNull();
  });

  it("switches desktop and mobile navigation from the current audience context", () => {
    for (const pathname of [
      "/", "/brand-film", "/about/technology", "/about/technology/story",
      "/help", "/market", "/showcase", "/collaborate", "/now", "/references",
      "/discover", "/community", "/fortune",
    ]) {
      expect(siteNavigationContextForPath(pathname), pathname).toBe("spectrum");
    }
    for (const pathname of [
      "/home", "/studio", "/production", "/production/projects/sample-project/overview",
      "/studio/canvas", "/studio/assets/brushes/new", "/learn/webtoon", "/help/getting-started",
      "/make", "/publishing", "/shaper", "/music", "/brush-lab",
    ]) {
      expect(siteNavigationContextForPath(pathname), pathname).toBe("studio");
    }

    expect(primarySiteNavigationForPath("/")).toBe(TOONSPECTRUM_PRIMARY_NAVIGATION);
    expect(primarySiteNavigationForPath("/discover")).toBe(TOONSPECTRUM_PRIMARY_NAVIGATION);
    expect(primarySiteNavigationForPath("/help")).toBe(TOONSPECTRUM_PRIMARY_NAVIGATION);
    expect(primarySiteNavigationForPath("/home")).toBe(TOONSTUDIO_PRIMARY_NAVIGATION);
    expect(primarySiteNavigationForPath("/studio")).toBe(TOONSTUDIO_PRIMARY_NAVIGATION);
    // 그룹 지도는 컨텍스트가 달라도 같은 단일 지도다. 바뀌는 것은 강조뿐이다.
    for (const pathname of ["/", "/about/technology", "/home", "/studio", "/fortune", "/team"]) {
      expect(siteNavigationGroupsForPath(pathname), pathname).toBe(SITE_NAVIGATION_GROUPS);
    }
    expect(mobileSiteTabsForPath("/")).toBe(TOONSPECTRUM_MOBILE_TABS);
    expect(mobileSiteTabsForPath("/discover")).toBe(TOONSPECTRUM_MOBILE_TABS);
    expect(mobileSiteTabsForPath("/home")).toBe(TOONSTUDIO_MOBILE_TABS);
    expect(mobileSiteTabsForPath("/studio")).toBe(TOONSTUDIO_MOBILE_TABS);
  });

  it("keeps the same purposes while giving public and personal home distinct URLs", () => {
    expect(TOONSTUDIO_MOBILE_TABS.map((item) => item.id)).toEqual([
      "workspace-home", "studio", "explore", "community", "all-menu",
    ]);
    expect(TOONSPECTRUM_MOBILE_TABS.map((item) => item.id)).toEqual([
      "home", "studio", "explore", "community", "all-menu",
    ]);
  });

  it("keeps notifications, Help, Settings and account destinations available from the utility area", () => {
    expect(SITE_UTILITY_NAVIGATION).toEqual([
      SITE_NAVIGATION_ITEMS.notifications,
      SITE_NAVIGATION_ITEMS.help,
      SITE_NAVIGATION_ITEMS.settings,
      SITE_NAVIGATION_ITEMS.me,
    ]);
  });

  it("provides complete Korean and English labels for every destination", () => {
    for (const item of Object.values(SITE_NAVIGATION_ITEMS)) {
      expect(item.href).toMatch(/^\//u);
      expect(siteNavigationText(item.label, "ko-KR").length).toBeGreaterThan(0);
      expect(siteNavigationText(item.label, "en-US").length).toBeGreaterThan(0);
      expect(siteNavigationText(item.description, "ko").length).toBeGreaterThan(0);
      expect(siteNavigationText(item.description, "en").length).toBeGreaterThan(0);
    }
    expect(siteNavigationLocale("KO_kr")).toBe("ko");
    expect(siteNavigationLocale("ja-JP")).toBe("en");
  });
});
