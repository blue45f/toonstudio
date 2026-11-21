// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { PALETTE_PAGES, PALETTE_STUDIO_TOOLS, palettePagesForLocale } from "./command-palette-data";
import { matchesCommandSearch, rankPaletteStudioTools } from "./command-palette-search";
import { SITE_NAVIGATION_ITEMS } from "./site-navigation";

import { canonicalSitePath } from "@/shared/lib/site-route-authority";

vi.mock("@toonstudio/core/fx", () => ({
  getAudioState: vi.fn(),
  setBgmEnabled: vi.fn(),
  setSfxEnabled: vi.fn(),
}));

describe("메뉴와 명령 팔레트의 목적지 일치", () => {
  it("전역 메뉴의 모든 목적지를 같은 명칭·주소로 검색한다", () => {
    for (const item of Object.values(SITE_NAVIGATION_ITEMS)) {
      const pages = PALETTE_PAGES.filter((page) => page.href === item.href);
      expect(pages, item.href).toHaveLength(1);
      const page = pages[0];
      expect(page.title).toBe(item.label.ko);
      expect(page.subtitle).toBe(item.description.ko);
      expect(matchesCommandSearch(page.title, item.label.en, page.keywords, page.subtitle)).toBe(true);
    }
  });

  it("영어 페이지명·설명을 표시하면서 한국어 검색과 목적지를 유지한다", () => {
    const englishPages = palettePagesForLocale("en-US");
    expect(englishPages.map((page) => page.href)).toEqual(PALETTE_PAGES.map((page) => page.href));
    for (const page of englishPages) {
      expect(page.title).not.toMatch(/[가-힣]/u);
      expect(page.subtitle).not.toMatch(/[가-힣]/u);
    }
    const learningPage = englishPages.find((page) => page.href === "/learn");
    expect(learningPage?.title).toBe(SITE_NAVIGATION_ITEMS.learn.label.en);
    expect(learningPage && matchesCommandSearch(learningPage.title, "배우기", learningPage.keywords, learningPage.subtitle)).toBe(true);
    expect(palettePagesForLocale("ko-KR")).toBe(PALETTE_PAGES);
  });

  it("별칭을 재노출하지 않고 기존 결과의 단축키·검색어를 유지한다", () => {
    expect(new Set(PALETTE_PAGES.map((page) => page.href)).size).toBe(PALETTE_PAGES.length);
    expect(new Set(PALETTE_PAGES.map((page) => page.id)).size).toBe(PALETTE_PAGES.length);
    for (const page of PALETTE_PAGES) expect(canonicalSitePath(page.href)).toBe(page.href);
    expect(PALETTE_PAGES.find((page) => page.id === "page-studio")?.shortcut).toEqual(["G", "S"]);
  });

  it.each([
    ["내 프로젝트", "/studio"], ["배우기", "/learn"], ["리서치", "/research"],
    ["제작 관리", "/production"], ["검수", "/studio/publish"], ["갤러리", "/showcase"],
    ["팀", "/team"], ["전체 기능", "/sitemap"], ["만들기", "/create"],
    ["shaper", "/studio/assets/characters/new"], ["New work", "/create"],
  ])("%s 검색으로 %s 작업에 도달한다", (query, href) => {
    const results = PALETTE_PAGES.filter((page) => matchesCommandSearch(page.title, query, page.keywords, page.subtitle));
    expect(results.map((page) => page.href)).toContain(href);
  });
});

describe("4대 경쟁 앱 용어 → ToonStudio 기능 최상단 매칭 (AC-008)", () => {
  it.each([
    // CLIP STUDIO PAINT (CSP)
    ["퍼펫 워프", "tool-puppet-warp", "csp"],
    ["Puppet Warp", "tool-puppet-warp", "csp"],
    ["LT 변환", "tool-lt-convert", "csp"],
    ["LT Conversion", "tool-lt-convert", "csp"],
    ["벡터 지우개", "tool-vector-eraser", "csp"],
    ["Vector Eraser", "tool-vector-eraser", "csp"],
    ["톤", "tool-screentone", "csp"],
    ["Screentone", "tool-screentone", "csp"],
    ["말풍선", "tool-text", "csp"],
    ["Balloon", "tool-text", "csp"],
    ["3D 데생인형", "tool-3d-mannequin", "csp"],
    ["3D Drawing Figure", "tool-3d-mannequin", "csp"],
    ["오토액션", "tool-auto-action", "csp"],
    ["Auto Action", "tool-auto-action", "csp"],
    ["타임랩스", "tool-timelapse", "csp"],
    ["Timelapse", "tool-timelapse", "csp"],
    ["클리핑", "tool-clipping", "csp"],
    ["Clip at Layer Below", "tool-clipping", "csp"],
    ["참조 레이어", "tool-reference-layer", "csp"],
    ["Reference Layer", "tool-reference-layer", "csp"],
    // Photoshop
    ["액화", "tool-liquify", "photoshop"],
    ["유동화", "tool-liquify", "photoshop"],
    ["Liquify", "tool-liquify", "photoshop"],
    ["렌즈 블러", "tool-lens-blur", "photoshop"],
    ["Lens Blur", "tool-lens-blur", "photoshop"],
    ["조정 레이어", "tool-adjustment-layer", "photoshop"],
    ["Adjustment Layer", "tool-adjustment-layer", "photoshop"],
    ["PSD 내보내기", "tool-export-psd", "photoshop"],
    ["Export PSD", "tool-export-psd", "photoshop"],
    ["스마트 필터", "tool-smart-filter", "photoshop"],
    ["Smart Filter", "tool-smart-filter", "photoshop"],
    ["캔버스 뒤집기", "tool-flip-canvas", "photoshop"],
    ["Flip Canvas Horizontal", "tool-flip-canvas", "photoshop"],
    // SketchUp
    ["3D 배경", "tool-bg3d", "sketchup"],
    ["3D Background", "tool-bg3d", "sketchup"],
    ["단면 컷어웨이", "tool-section-cutaway", "sketchup"],
    ["Section Plane", "tool-section-cutaway", "sketchup"],
    ["씬 카메라", "tool-scene-camera", "sketchup"],
    ["Scene Camera", "tool-scene-camera", "sketchup"],
    ["SKP 가져오기", "tool-import-skp", "sketchup"],
    ["Import SKP", "tool-import-skp", "sketchup"],
    ["그림자 시간", "tool-shadow-time", "sketchup"],
    ["Shadow Settings", "tool-shadow-time", "sketchup"],
    // Procreate
    ["퀵메뉴", "tool-quick-menu", "procreate"],
    ["QuickMenu", "tool-quick-menu", "procreate"],
    ["퀵셰이프", "tool-quick-shape", "procreate"],
    ["QuickShape", "tool-quick-shape", "procreate"],
    ["컬러드롭", "tool-fill", "procreate"],
    ["ColorDrop", "tool-fill", "procreate"],
    ["알파 잠금", "tool-alpha-lock", "procreate"],
    ["Alpha Lock", "tool-alpha-lock", "procreate"],
    ["드로잉 어시스트", "tool-drawing-assist", "procreate"],
    ["Drawing Assist", "tool-drawing-assist", "procreate"],
    ["스트림라인", "tool-streamline", "procreate"],
    ["StreamLine", "tool-streamline", "procreate"],
    ["손떨림 보정", "tool-streamline", "procreate"],
  ])("'%s' 검색 시 %s(%s)가 1순위로 매칭된다", (query, expectedToolId, expectedVendor) => {
    const ranked = rankPaletteStudioTools(PALETTE_STUDIO_TOOLS, query);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]?.item.id).toBe(expectedToolId);
    expect(ranked[0]?.matchedAlias?.vendor).toBe(expectedVendor);
  });
});
