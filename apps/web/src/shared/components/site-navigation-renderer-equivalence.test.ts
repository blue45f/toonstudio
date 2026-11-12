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
 * 기존 id·href·그룹 구성·PC 순서를 고정한다. 네 핵심 목적지의 한국어 라벨은
 * 2026-11-12 공유 시안의 내 작업/작품 찾기/소재 찾기/내 정보로 갱신했다.
 * 모바일 순서가 달라져도 PC와 디렉터리는 동일한 정본 객체를 사용한다.
 * 헤더(HEADER_PRIMARY_NAVIGATION)는 이 배열들과 같은 항목 객체를
 * primaryFromNavItem으로 파생하므로, 항목 객체 동등성이 헤더 동등성을 보장한다.
 */
const EXPECTED_ITEMS: readonly (readonly [string, string, string])[] = [["workspace-home", "/home", "작업 홈"], ["workspace-team", "/team", "팀"], ["workspace-hub", "/hub", "둘러보기"], ["home", "/", "사이트 홈"], ["production", "/production", "제작 관리"], ["make", "/create", "작품 시작하기"], ["studio", "/studio", "내 작업"], ["studio-assets", "/studio/assets", "작품 재료"], ["publish", "/studio/publish", "검수·내보내기"], ["learn", "/learn", "배우기"], ["technology", "/about/technology", "제작 기술"], ["comic", "/studio/comic", "웹툰 만들기"], ["shaper", "/studio/assets/characters/new", "캐릭터 만들기"], ["virtual-studio", "/studio/space", "가상 스튜디오"], ["market", "/market", "소재 찾기"], ["gallery", "/showcase", "창작 갤러리"], ["explore", "/discover", "작품 찾기"], ["ranking", "/ranking", "랭킹"], ["calendar", "/calendar", "연재 캘린더"], ["recommend", "/recommend", "맞춤 추천"], ["now", "/now", "오늘의 영감"], ["fortune", "/fortune", "운세"], ["bg3d", "/studio/bg3d", "배경 · 3D"], ["research", "/research", "리서치 데스크"], ["opportunities", "/opportunities", "창작 기회"], ["insights", "/insights", "트렌드"], ["reviews", "/reviews", "리뷰"], ["collaborate", "/collaborate", "구인·의뢰"], ["community", "/community", "커뮤니티"], ["play", "/play", "놀이터"], ["library", "/library", "내 서재"], ["notifications", "/notifications", "알림 센터"], ["growth-lab", "/studio/growth", "성장 실험"], ["me", "/my", "내 정보"], ["settings", "/settings", "설정"], ["all-menu", "/sitemap", "전체 메뉴"], ["help", "/help", "도움말"]];

const EXPECTED_GROUPS: readonly (readonly [string, readonly string[]])[] = [["discover", ["explore", "ranking", "calendar", "recommend"]], ["create", ["studio", "make", "comic", "shaper", "bg3d", "virtual-studio", "studio-assets", "production"]], ["grow", ["research", "market", "learn", "opportunities", "insights", "technology"]], ["publish", ["publish", "growth-lab"]], ["connect", ["gallery", "reviews", "community", "collaborate", "workspace-team", "workspace-hub"]], ["rest", ["now", "fortune", "play"]], ["personal", ["workspace-home", "library", "home"]]];

describe("정본 라벨 변경 후 PC·디렉터리 모델 호환", () => {
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
