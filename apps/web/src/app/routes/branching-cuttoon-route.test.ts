import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { creatorRoutes } from "./groups/creator.routes";
import { resolveRouteStageDesign } from "./route-stage-design";

import {
  SITEMAP_CORE_DESTINATION_GROUPS,
  SITEMAP_EXTENDED_DESTINATION_GROUPS,
} from "@/domains/legal/site-directory-data";
import {
  SITE_NAVIGATION_GROUPS,
  SITE_NAVIGATION_ITEMS,
  TOONSTUDIO_PRIMARY_NAVIGATION,
  TOONSPECTRUM_PRIMARY_NAVIGATION,
} from "@/shared/components/site-navigation";
import { resolveSeoRoutePolicy } from "@/shared/lib/seo-route-policy";
import {
  resolveSiteRouteAuthority,
  SITE_PRIMARY_ROUTE_IDS,
  SITE_ROUTE_AUTHORITIES,
} from "@/shared/lib/site-route-authority";
import { resolveSiteRouteMetadata } from "@/shared/lib/site-route-metadata";
import { campusBinding } from "@/shared/lib/spatial-campus/campus-bindings";

/**
 * 분기형 컷툰은 Labs(experimental) 경로 하나로만 노출한다. 핵심 제작 여정과 같은 위계(주 내비게이션·핵심 계층)로 올라가지 않고,
 * 검색에 색인되지 않으며, 경로 이름 문구가 ko/en 에 있어야 한다. 라우트 계약을 한곳에서 고정한다.
 */
const PATH = "/studio/branching-cuttoon";

describe("분기형 컷툰 Labs 경로 계약", () => {
  it("라우트 권위에 experimental 성숙도와 labs 계층으로 등록돼 있다", () => {
    const authority = SITE_ROUTE_AUTHORITIES.find((definition) => definition.id === "studio-branching-cuttoon");
    expect(authority).toMatchObject({
      pattern: PATH,
      canonicalPath: PATH,
      titleKey: "route.branchingCuttoon",
      maturity: "experimental",
      tier: "labs",
      access: "public",
      purpose: "create",
    });
    expect(resolveSiteRouteAuthority(PATH)?.id).toBe("studio-branching-cuttoon");
  });

  it("메타 정책도 같은 답을 낸다(하위 경로 포함)", () => {
    for (const pathname of [PATH, `${PATH}/anything`]) {
      expect(resolveSiteRouteMetadata(pathname), pathname).toMatchObject({ maturity: "experimental", tier: "labs" });
    }
  });

  it("주 내비게이션과 핵심 계층에 오르지 않는다", () => {
    expect(SITE_PRIMARY_ROUTE_IDS as readonly string[]).not.toContain("studio-branching-cuttoon");
    const primaryHrefs = [...TOONSTUDIO_PRIMARY_NAVIGATION, ...TOONSPECTRUM_PRIMARY_NAVIGATION].map((item) => item.href);
    expect(primaryHrefs).not.toContain(PATH);
    const allHrefs = [
      ...Object.values(SITE_NAVIGATION_ITEMS).map((item) => item.href),
      ...SITE_NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.href)),
    ];
    expect(allHrefs.some((href) => href.startsWith(PATH))).toBe(false);
    expect(resolveSiteRouteMetadata(PATH).tier).not.toBe("core");
  });

  it("사이트맵의 확장 묶음에는 있고 핵심 묶음에는 없다", () => {
    const hrefsOf = (groups: readonly { readonly items: readonly { readonly href: string }[] }[]): string[] => (
      groups.flatMap((group) => group.items.map((item) => item.href))
    );
    expect(hrefsOf(SITEMAP_EXTENDED_DESTINATION_GROUPS)).toContain(PATH);
    expect(hrefsOf(SITEMAP_CORE_DESTINATION_GROUPS)).not.toContain(PATH);
  });

  it("라우터가 /studio/* 와일드카드보다 먼저 이 경로를 맡는다", () => {
    const paths = creatorRoutes.map((route) => route.path);
    const own = paths.indexOf(PATH);
    const wildcard = paths.indexOf("/studio/*");
    expect(own).toBeGreaterThanOrEqual(0);
    expect(wildcard).toBeGreaterThan(own);
    expect(paths.filter((path) => path === PATH)).toHaveLength(1);
  });

  it("공간 캠퍼스 분류에 등록돼 있다(작업실 구역, 개인 경로)", () => {
    expect(campusBinding("creator-studio-branching-cuttoon", PATH)).toMatchObject({ districtId: "atelier", private: true });
  });

  it("스튜디오 영역이라 검색에 색인되지 않는다", () => {
    expect(resolveSeoRoutePolicy(PATH)).toMatchObject({ indexable: false });
  });

  it("시각 분류는 이야기(story) 계열이다", () => {
    expect(resolveRouteStageDesign(PATH)).toMatchObject({ domain: "story", matchedBy: "site-family" });
  });

  it("경로 이름 문구(route.branchingCuttoon)가 한국어와 영어에 있다", () => {
    for (const locale of ["ko", "en"]) {
      const dictionary = JSON.parse(readFileSync(`apps/web/public/i18n/app/route/${locale}.json`, "utf8")) as Record<string, unknown>;
      const value = dictionary["route.branchingCuttoon"];
      expect(typeof value, locale).toBe("string");
      expect(String(value).trim(), locale).not.toBe("");
    }
  });
});
