import { describe, expect, it } from "vitest";
import { SITE_NAVIGATION_ITEMS, TOONSTUDIO_MOBILE_TABS, TOONSTUDIO_PRIMARY_NAVIGATION } from "../site-navigation";
import { supportsRoutePurposeScene } from "../site-experience/site-experience-policy";
import { workspaceNavigationActiveId, workspaceNavigationContext, workspaceNavigationHref } from "./workspace-navigation-model";

describe("studio-first navigation contract", () => {
  it.each([
    ["/", "workspace-home"], ["/home?scope=personal", "workspace-home"], ["/studio/space", "workspace-home"],
    ["/studio/p/a%2Fb/space/", "workspace-home"], ["/studio/p/a/review?view=inbox", "studio"],
    ["/production/projects/a", "studio"], ["/collaborate/new", "community"],
    ["/team?project=a", "community"], ["/market/resources", "explore"],
    ["/ranking", "explore"], ["/settings", "all-menu"],
    ["/make?from=home", "studio"], ["/shaper", "studio"], ["/music", "studio"],
    ["/brush-lab", "studio"], ["/publishing", "studio"], ["/creator-hub", "studio"],
    ["/create", "studio"], ["/create/work/a", "community"], ["/challenges", "community"],
    ["/pencafe/artist", "community"], ["/references", "explore"], ["/compare", "explore"],
    ["/story-lab", "studio"], ["/my", "all-menu"], ["/notifications", "all-menu"],
  ])("keeps %s in the right global destination", (path, id) => {
    expect(workspaceNavigationActiveId(path!)).toBe(id);
  });
  it("작업실 다섯 목적지와 모바일의 홈·만들기·내 작업이 같은 정본 목적지를 사용한다", () => {
    expect(TOONSTUDIO_PRIMARY_NAVIGATION.map((item) => item.id)).toEqual(["workspace-home", "studio", "explore", "community", "all-menu"]);
    expect(TOONSTUDIO_PRIMARY_NAVIGATION.map((item) => item.href)).toEqual(["/home", "/studio", "/discover", "/community", "/sitemap"]);
    expect(TOONSTUDIO_PRIMARY_NAVIGATION.map((item) => item.label.ko)).toEqual(["작업 홈", "내 작업", "작품 찾기", "커뮤니티", "전체 메뉴"]);
    expect(TOONSTUDIO_MOBILE_TABS).toEqual([
      SITE_NAVIGATION_ITEMS.home, SITE_NAVIGATION_ITEMS.make, SITE_NAVIGATION_ITEMS.studio,
    ]);
    expect(TOONSTUDIO_MOBILE_TABS.map((item) => item.href)).toEqual(["/", "/create", "/studio"]);
    expect(TOONSTUDIO_MOBILE_TABS.map((item) => [item.id, item.label.ko, item.href])).toEqual([
      ["home", "사이트 홈", "/"],
      ["make", "작품 시작하기", "/create"],
      ["studio", "내 작업", "/studio"],
    ]);
    expect(TOONSTUDIO_MOBILE_TABS.map((item) => item.label.ko)).toEqual(["사이트 홈", "작품 시작하기", "내 작업"]);
    expect(TOONSTUDIO_MOBILE_TABS.map((item) => item.label.en)).toEqual(["Site home", "Start a work", "My work"]);
    expect(TOONSTUDIO_MOBILE_TABS[0]).toBe(SITE_NAVIGATION_ITEMS.home);
    expect(TOONSTUDIO_MOBILE_TABS[1]).toBe(SITE_NAVIGATION_ITEMS.make);
    expect(TOONSTUDIO_MOBILE_TABS[2]).toBe(TOONSTUDIO_PRIMARY_NAVIGATION[1]);
    // 네 번째 행동인 더보기는 하단 UI가 별도로 추가하며, 사이트맵 경로와 메뉴 접근성을 함께 제공한다.
    expect([...TOONSTUDIO_MOBILE_TABS, SITE_NAVIGATION_ITEMS.allMenu].map((item) => item.href))
      .toEqual(["/", "/create", "/studio", "/sitemap"]);
  });
  it.each(["/", "/home", "/team", "/hub"])("does not duplicate workspace chrome with a promotional scene on %s", (path) => {
    expect(supportsRoutePurposeScene(path)).toBe(false);
  });
});

describe("workspace identity continuity", () => {
  it.each(["/home", "/team", "/hub"])("carries only project identity into %s", (href) => {
    const context = workspaceNavigationContext("/home", "?project=old+work&panel=work&tab=members&private=never-copy");
    expect(workspaceNavigationHref(href, context)).toBe(`${href}?project=old+work`);
  });
  it("retains personal scope instead of falling back to the most recent work", () => {
    const context = workspaceNavigationContext("/team", "?scope=personal&project=not-selected");
    expect(workspaceNavigationHref("/home", context)).toBe("/home?scope=personal");
  });
  it("uses the live route identity rather than a conflicting query", () => {
    const context = workspaceNavigationContext("/studio/p/a%2Fb/space", "?project=other&scope=personal");
    expect(workspaceNavigationHref("/hub", context)).toBe("/hub?project=a%2Fb");
  });
  it("encodes identities without creating new query parameters or outside links", () => {
    const href = workspaceNavigationHref("/team", { projectId: "a&panel=work#outside" });
    expect(new URLSearchParams(href.split("?")[1]).get("project")).toBe("a&panel=work#outside");
    expect(new URLSearchParams(href.split("?")[1]).has("panel")).toBe(false);
  });
  it("keeps malformed encoded live identities explicit and never throws", () => {
    expect(workspaceNavigationContext("/studio/p/%E0%A4/space", "")).toEqual({ projectId: "%E0%A4" });
  });
  it.each(["/studio", "/collaborate", "/market", "https://outside.example/home"])("does not propagate private identity to %s", (href) => {
    expect(workspaceNavigationHref(href, { projectId: "private-work" })).toBe(href);
  });
});
