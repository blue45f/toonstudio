import { describe, expect, it } from "vitest";

import { REPRESENTATIVE_ROUTES, SWEEP_VIEWPORTS } from "./browser-sweep-targets.mjs";
import {
  REPRESENTATIVE_ROUTES as publicRoutes,
  SWEEP_VIEWPORTS as publicViewports,
} from "./browser-accessibility-sweep.mjs";

describe("브라우저 접근성 감사 대상 모듈", () => {
  it("기존 실행 모듈의 공개 export가 분리한 정본을 그대로 참조한다", () => {
    expect(publicRoutes).toBe(REPRESENTATIVE_ROUTES);
    expect(publicViewports).toBe(SWEEP_VIEWPORTS);
  });

  it("모바일·태블릿·PC·200% 확대·모션 감소의 여섯 조건을 유지한다", () => {
    expect(SWEEP_VIEWPORTS.map(({ id, label, width, height, isMobile, zoom, reducedMotion }) =>
      [id, label, width, height, isMobile, zoom, reducedMotion],
    )).toEqual([
      ["mobile-320", "모바일 320×844", 320, 844, true, 1, "no-preference"],
      ["mobile-390", "모바일 390×844", 390, 844, true, 1, "no-preference"],
      ["tablet-768", "태블릿 768×1024", 768, 1024, false, 1, "no-preference"],
      ["pc-1440", "PC 1440×900", 1440, 900, false, 1, "no-preference"],
      ["pc-1440-zoom-200", "PC 1440×900 (200% 확대)", 1440, 900, false, 2, "no-preference"],
      ["pc-1440-reduced-motion", "PC 1440×900 (reduced-motion: reduce)", 1440, 900, false, 1, "reduce"],
    ]);
    expect(new Set(SWEEP_VIEWPORTS.map(({ id }) => id)).size).toBe(6);
  });

  it("여덟 대표 경로의 순서·도메인·표시명을 유지한다", () => {
    expect(REPRESENTATIVE_ROUTES.map(({ path, domain, label }) => [path, domain, label])).toEqual([
      ["/", "home", "홈 대시보드"],
      ["/discover", "discover", "작품 탐색"],
      ["/community", "community", "커뮤니티 광장"],
      ["/learn", "learn", "배우기 허브"],
      ["/accessibility", "legal", "접근성 안내 및 조율실"],
      ["/settings", "account", "계정 및 화면 설정"],
      ["/studio", "studio-hub", "스튜디오 워크스페이스"],
      ["/admin/overview", "admin", "관리자 개요(게스트 가드)"],
    ]);
    expect(new Set(REPRESENTATIVE_ROUTES.map(({ path }) => path)).size).toBe(8);
  });
});
