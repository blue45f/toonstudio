import { describe, expect, it } from "vitest";

import { resolveSiteRouteMetadata } from "@/shared/lib/site-route-metadata";

import { SITE_NAVIGATION_ITEMS, TOONSTUDIO_MOBILE_TABS } from "./site-navigation";
import { siteMobilePurposeHref } from "./site-mobile-purpose";

describe("모바일 네 목적지의 현재 위치", () => {
  it.each([
    "/studio", "/studio/canvas", "/studio/p/manuscript-a/space", "/home", "/create",
    "/production", "/production/projects/manuscript-a/overview", "/publish", "/team", "/team/recruiting",
    "/new?lane=blank#start", "/canvas/", "/publishing?projectId=manuscript-a#files", "/research/story",
  ])("작업 경로 %s는 내 작업으로 돌아간다", (path) => {
    expect(siteMobilePurposeHref(path)).toBe("/studio");
  });

  it.each([
    "/market", "/market/browse", "/market/library", "/market/resource/resource-a",
    "/research", "/research/assets", "/research/open-data/ambientcg", "/research/open-data/nasa",
    "/marketplace?q=배경#results", "/creator-hub/references",
  ])("자료 경로 %s는 소재 찾기로 돌아간다", (path) => {
    expect(siteMobilePurposeHref(path)).toBe("/market");
  });

  it.each([
    "/discover", "/search?q=달&genres=판타지", "/library?tab=shelf&libraryRead=reading",
    "/title/story-a", "/title/story-a/read/1", "/read/spatial", "/showcase", "/showcase/work/work-a",
    "/showcase/series/series-a", "/create/work-a", "/create/series/series-a", "/create/challenges",
    "/lists/collection-a", "/authors", "/ranking",
  ])("읽기 경로 %s는 작품 찾기로 돌아간다", (path) => {
    expect(siteMobilePurposeHref(path)).toBe("/discover");
  });

  it.each([
    "/my", "/me", "/account/points", "/settings", "/settings/integrations", "/settings/api-keys",
    "/notifications", "/messages/thread-a", "/membership/usage", "/asset-points?from=menu",
  ])("개인 경로 %s는 내 정보로 돌아간다", (path) => {
    expect(siteMobilePurposeHref(path)).toBe("/my");
  });

  it.each([
    "/", "/about", "/about/studio", "/about/technology/atlas", "/terms", "/privacy", "/help", "/legal",
    "/marketish", "/productionish", "/researcher", "/studioish", "/discoveries", "/myth", "/providers",
  ])("목적 밖 또는 거짓 접두사 %s는 선택을 강제하지 않는다", (path) => {
    expect(siteMobilePurposeHref(path)).toBeNull();
  });

  it("모바일 정본 객체와 양언어 라벨·권한 메타데이터를 수정하지 않는다", () => {
    const before = JSON.stringify(TOONSTUDIO_MOBILE_TABS);
    const restricted = resolveSiteRouteMetadata("/production/projects/manuscript-a/overview");
    expect(restricted.access).toBe("project");
    expect(siteMobilePurposeHref("/production/projects/manuscript-a/overview?role=admin")).toBe(SITE_NAVIGATION_ITEMS.studio.href);
    expect(resolveSiteRouteMetadata("/production/projects/manuscript-a/overview")).toEqual(restricted);
    expect(TOONSTUDIO_MOBILE_TABS.map((item) => item.href)).toEqual(["/studio", "/discover", "/market", "/my"]);
    expect(TOONSTUDIO_MOBILE_TABS.map((item) => item.label)).toEqual([
      { ko: "내 작업", en: "My work" }, { ko: "작품 찾기", en: "Discover" },
      { ko: "소재 찾기", en: "Assets" }, { ko: "내 정보", en: "My account" },
    ]);
    expect(JSON.stringify(TOONSTUDIO_MOBILE_TABS)).toBe(before);
  });
});
