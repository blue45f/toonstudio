import { describe, expect, it } from "vitest";

import {
  SITE_NAVIGATION_GROUPS,
  SITE_NAVIGATION_ITEMS,
  SITE_UTILITY_NAVIGATION,
  TOONSPECTRUM_PRIMARY_NAVIGATION,
  TOONSTUDIO_PRIMARY_NAVIGATION,
} from "./site-navigation";

/**
 * 렌더러 동등성 스냅샷 (S1-1, BLUEPRINT §7.1).
 * 아래 기대값은 정책 스키마 도입 전 main의 site-navigation.ts에서 실측한
 * 렌더러 가시 데이터(id·href·한국어 라벨·그룹 구성·순서)다. 정책 필드는
 * 렌더링을 바꾸지 않으므로, 이 스냅샷이 그대로 유지돼야 한다.
 * 헤더(HEADER_PRIMARY_NAVIGATION)는 이 배열들과 같은 항목 객체를
 * primaryFromNavItem으로 파생하므로, 항목 객체 동등성이 헤더 동등성을 보장한다.
 */
const EXPECTED_ITEMS: readonly (readonly [string, string, string])[] = [["workspace-home", "/home", "내 홈"], ["workspace-team", "/team", "팀"], ["workspace-hub", "/hub", "둘러보기"], ["home", "/", "홈"], ["production", "/production", "제작 관리"], ["make", "/create", "작품 시작하기"], ["studio", "/studio", "제작"], ["studio-assets", "/studio/assets", "작품 재료"], ["publish", "/studio/publish", "검수·내보내기"], ["learn", "/learn", "배우기"], ["technology", "/about/technology", "제작 기술"], ["comic", "/studio/comic", "웹툰 만들기"], ["shaper", "/studio/assets/characters/new", "캐릭터 만들기"], ["virtual-studio", "/studio/space", "가상 스튜디오"], ["market", "/market", "소재 마켓"], ["gallery", "/showcase", "창작 갤러리"], ["explore", "/discover", "탐색"], ["ranking", "/ranking", "랭킹"], ["calendar", "/calendar", "연재 캘린더"], ["recommend", "/recommend", "맞춤 추천"], ["now", "/now", "오늘의 영감"], ["fortune", "/fortune", "운세"], ["bg3d", "/studio/bg3d", "배경 · 3D"], ["research", "/research", "리서치 데스크"], ["opportunities", "/opportunities", "창작 기회"], ["insights", "/insights", "트렌드"], ["reviews", "/reviews", "리뷰"], ["collaborate", "/collaborate", "구인·의뢰"], ["community", "/community", "커뮤니티"], ["play", "/play", "놀이터"], ["library", "/library", "내 서재"], ["notifications", "/notifications", "알림 센터"], ["growth-lab", "/studio/growth", "성장 실험"], ["me", "/my", "내 공간"], ["settings", "/settings", "설정"], ["all-menu", "/sitemap", "전체 메뉴"], ["help", "/help", "도움말"]];

const EXPECTED_GROUPS: readonly (readonly [string, readonly string[]])[] = [["discover", ["explore", "ranking", "calendar", "recommend"]], ["create", ["studio", "make", "comic", "shaper", "bg3d", "virtual-studio", "studio-assets", "production"]], ["grow", ["research", "market", "learn", "opportunities", "insights", "technology"]], ["publish", ["publish", "growth-lab"]], ["connect", ["gallery", "reviews", "community", "collaborate", "workspace-team", "workspace-hub"]], ["rest", ["now", "fortune", "play"]], ["personal", ["workspace-home", "library", "home"]]];

describe("renderer equivalence snapshot before/after navigation policy schema (S1-1)", () => {
  it("keeps every item's id, href and Korean label identical", () => {
    const actual = Object.values(SITE_NAVIGATION_ITEMS).map(
      (item) => [item.id, item.href, item.label.ko] as const,
    );
    expect(actual).toEqual(EXPECTED_ITEMS);
  });

  it("keeps primary navigation sets and order identical", () => {
    expect(TOONSTUDIO_PRIMARY_NAVIGATION.map((item) => item.id)).toEqual([
      "workspace-home", "studio", "explore", "community", "all-menu",
    ]);
    expect(TOONSPECTRUM_PRIMARY_NAVIGATION.map((item) => item.id)).toEqual([
      "home", "studio", "explore", "community", "all-menu",
    ]);
  });

  it("keeps group composition and order identical", () => {
    const actual = SITE_NAVIGATION_GROUPS.map(
      (group) => [group.id, group.items.map((item) => item.id)] as const,
    );
    expect(actual).toEqual(EXPECTED_GROUPS);
  });

  it("keeps utility navigation identical", () => {
    expect(SITE_UTILITY_NAVIGATION.map((item) => item.id)).toEqual([
      "notifications", "help", "settings", "me",
    ]);
  });
});
