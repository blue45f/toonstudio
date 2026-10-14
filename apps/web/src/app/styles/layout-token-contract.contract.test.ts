import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sitewide = readFileSync(new URL("./sitewide-visual-ux.css", import.meta.url), "utf8");
const unified = readFileSync(new URL("./unified-theme-contract.css", import.meta.url), "utf8");
const layoutTokens = readFileSync(
  new URL("../../shared/components/layout/layout-tokens.ts", import.meta.url),
  "utf8",
);
const publicShell = readFileSync(
  new URL("../../shared/components/public-site-shell.css", import.meta.url),
  "utf8",
);
const referenceVisual = readFileSync(new URL("./reference-visual-system.css", import.meta.url), "utf8");
const container = readFileSync(new URL("../../shared/components/container.tsx", import.meta.url), "utf8");
const workspaceBase = readFileSync(
  new URL("../../shared/components/workspace/workspace.css", import.meta.url),
  "utf8",
);
const workspaceRedesign = readFileSync(
  new URL("../../shared/components/workspace/workspace-redesign.css", import.meta.url),
  "utf8",
);
const workspaceV3 = readFileSync(
  new URL("../../shared/components/workspace/workspace-visual-v3.css", import.meta.url),
  "utf8",
);
const workspaceTaskFrame = readFileSync(
  new URL("../../shared/components/workspace/workspace-task-frame.css", import.meta.url),
  "utf8",
);
const productionHubPage = readFileSync(
  new URL("../../domains/creator/production-hub/ProductionHubPage.tsx", import.meta.url),
  "utf8",
);
const explorePage = readFileSync(
  new URL("../../domains/catalog/ExplorePage.tsx", import.meta.url),
  "utf8",
);
const libraryView = readFileSync(
  new URL("../../shared/components/library-view.tsx", import.meta.url),
  "utf8",
);
const titlePoster = readFileSync(
  new URL("../../shared/components/title-poster.tsx", import.meta.url),
  "utf8",
);
const marketCloudLibraryPage = readFileSync(
  new URL("../../domains/market/pages/MarketCloudLibraryPage.tsx", import.meta.url),
  "utf8",
);
const marketAtelier = readFileSync(
  new URL("../../domains/market/components/market-atelier.css", import.meta.url),
  "utf8",
);
const marketLibraryExperience = readFileSync(
  new URL("../../domains/market/components/market-library-experience.css", import.meta.url),
  "utf8",
);
const learnSectionShell = readFileSync(
  new URL("../../domains/learn/LearnSectionShell.tsx", import.meta.url),
  "utf8",
);
const settingsPage = readFileSync(
  new URL("../../domains/account/SettingsPage.tsx", import.meta.url),
  "utf8",
);
const sectionNav = readFileSync(
  new URL("../../shared/components/section-nav.tsx", import.meta.url),
  "utf8",
);
const studioManualCss = readFileSync(
  new URL("../../domains/creator/manual/studio-manual.css", import.meta.url),
  "utf8",
);
const studioManualPage = readFileSync(
  new URL("../../domains/creator/manual/StudioManualPage.tsx", import.meta.url),
  "utf8",
);
const homeDashboardCss = readFileSync(
  new URL("../../domains/marketing/reference-creator-dashboard.css", import.meta.url),
  "utf8",
);
const globalsCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const learningHubCss = readFileSync(
  new URL("../../domains/learn/learning-hub.css", import.meta.url),
  "utf8",
);

/** CSS에서 커스텀 프로퍼티 할당값만 순서대로 뽑는다 (var() 소비처는 제외). */
function assignments(css: string, name: string): string[] {
  const pattern = new RegExp(`${name}\\s*:\\s*([^;]+);`, "gu");
  return [...css.matchAll(pattern)].map((match) => match[1].trim());
}

/** layout-tokens.ts의 문자열 상수 필드값을 뽑는다. */
function tsField(source: string, field: string): string | undefined {
  return new RegExp(`${field}:\\s*"([^"]+)"`, "u").exec(source)?.[1];
}

/** export const 블록 하나만 잘라낸다 — 기존 LAYOUT_TOKENS.gutter 같은 동명 필드와 섞이지 않게. */
function tsBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const end = source.indexOf("} as const;", start);
  return source.slice(start, end < 0 ? undefined : end);
}

const dimensionsBlock = tsBlock(layoutTokens, "export const LAYOUT_DIMENSIONS");
const widthClassBlock = tsBlock(layoutTokens, "export const LAYOUT_CONTENT_WIDTH_CLASS");

/**
 * 레이아웃 치수 단일화 계약 (BLUEPRINT §5.2 (1)·(2)·(7), §5.3 L0·L1).
 * 폭·거터 리터럴은 sitewide의 --layout-* 한 곳에서만 정의하고, --site-*는 별칭으로만 존재하며,
 * layout-tokens.ts의 LAYOUT_DIMENSIONS가 같은 값을 들고 있어야 한다.
 * 폭: 전역 기본값은 app 폭(100rem), [data-site-experience] 범위는 standard 폭(82.5rem)으로 좁혀진다.
 * 거터(L1): --layout-gutter 단일 변수의 3단계(16/24/32px)만 존재하고 범위·화면별 변형은 없다.
 * 헤더(L1): 전역 헤더 단일 높이 60px, --site-header-height 폴백도 60px으로 일치한다.
 */
const LAYOUT_CSS_TOKENS = [
  ["--layout-content-reading", "48rem"],
  ["--layout-content-standard", "82.5rem"],
  ["--layout-content-app", "100rem"],
  ["--layout-content-full", "none"],
] as const;

const TS_FIELD_BY_TOKEN: Record<string, string> = {
  "--layout-content-reading": "contentReading",
  "--layout-content-standard": "contentStandard",
  "--layout-content-app": "contentApp",
  "--layout-content-full": "contentFull",
};

describe("레이아웃 토큰 단일화 계약 (L0)", () => {
  it("--layout-* 리터럴은 sitewide 한 곳에서만, 토큰마다 정확히 한 번 정의된다", () => {
    for (const [token, literal] of LAYOUT_CSS_TOKENS) {
      expect(assignments(sitewide, token), token).toEqual([literal]);
      expect(assignments(unified, token), token).toEqual([]);
    }
  });

  it("--site-content-max·--site-page-gutter·--site-reading-max는 리터럴을 직접 갖지 않는다 (이중 정의 0)", () => {
    for (const alias of ["--site-content-max", "--site-page-gutter", "--site-reading-max"]) {
      for (const value of [...assignments(sitewide, alias), ...assignments(unified, alias)]) {
        expect(value, `${alias}: ${value}`).toMatch(/^var\(--layout-[a-z-]+\)$/u);
      }
    }
  });

  it("별칭 배선이 폭 의미를 그대로 가리킨다 (전역 app 폭 / 경험 범위 standard 폭, 거터는 단일 변수)", () => {
    expect(assignments(sitewide, "--site-content-max")).toEqual(["var(--layout-content-app)"]);
    expect(assignments(unified, "--site-content-max")).toEqual(["var(--layout-content-standard)"]);
    expect(assignments(sitewide, "--site-page-gutter")).toEqual(["var(--layout-gutter)"]);
    expect(assignments(unified, "--site-page-gutter")).toEqual(["var(--layout-gutter)"]);
    expect(assignments(unified, "--site-reading-max")).toEqual(["var(--layout-content-reading)"]);
  });

  it("layout-tokens.ts의 LAYOUT_DIMENSIONS가 CSS --layout-* 리터럴과 글자 단위로 같다", () => {
    expect(dimensionsBlock).not.toBe("");
    for (const [token, literal] of LAYOUT_CSS_TOKENS) {
      expect(tsField(dimensionsBlock, TS_FIELD_BY_TOKEN[token]), token).toBe(literal);
    }
  });

  it("폭 4단 클래스의 standard 단은 기존 LAYOUT_TOKENS.maxWidth와 같다", () => {
    expect(widthClassBlock).not.toBe("");
    expect(tsField(widthClassBlock, "standard")).toBe("max-w-[1320px]");
    expect(tsField(layoutTokens, "maxWidth")).toBe(tsField(widthClassBlock, "standard"));
    expect(tsField(widthClassBlock, "app")).toBe("max-w-[1600px]");
    expect(tsField(widthClassBlock, "reading")).toBe("max-w-3xl");
    expect(tsField(widthClassBlock, "full")).toBe("max-w-none");
  });
});

describe("전역 셸 단일화 계약 (L1)", () => {
  it("--layout-gutter는 16/24/32px 3단계 값만 순서대로 갖는다", () => {
    expect(assignments(sitewide, "--layout-gutter")).toEqual(["1rem", "1.5rem", "2rem"]);
    expect(assignments(unified, "--layout-gutter")).toEqual([]);
    expect(tsField(dimensionsBlock, "gutter")).toBe("1rem");
    expect(tsField(dimensionsBlock, "gutterSm")).toBe("1.5rem");
    expect(tsField(dimensionsBlock, "gutterXl")).toBe("2rem");
  });

  it("범위 전용·좁은 화면 전용 거터 변형은 존재하지 않는다", () => {
    for (const removedVar of ["--layout-gutter-experience", "--layout-gutter-narrow"]) {
      expect(sitewide, removedVar).not.toContain(removedVar);
      expect(unified, removedVar).not.toContain(removedVar);
    }
    expect(dimensionsBlock).not.toContain("gutterExperience");
    expect(dimensionsBlock).not.toContain("gutterNarrow");
  });

  it("본문 거터 클래스(Container·LAYOUT_TOKENS)가 CSS 단계와 같은 16/24/32px이다", () => {
    const tokensBlock = tsBlock(layoutTokens, "export const LAYOUT_TOKENS");
    expect(tsField(tokensBlock, "gutter")).toBe("px-4 sm:px-6 xl:px-8");
    expect(container).toContain('"mx-auto w-full px-4 sm:px-6 xl:px-8"');
    // 헤더는 같은 변수를 읽어 본문과 정렬선이 일치한다.
    expect(publicShell).toContain("padding-inline: var(--site-page-gutter, var(--layout-gutter, 1rem))");
  });

  it("전역 헤더는 60px 단일 높이이고 --site-header-height 폴백도 60px으로 일치한다", () => {
    expect(tsField(dimensionsBlock, "headerHeight")).toBe("60px");
    expect(publicShell).toContain("var(--site-header-height, 60px)");
    expect(layoutTokens).toContain("var(--site-header-height,60px)");
    expect(publicShell).not.toContain("4.25rem");
    expect(layoutTokens).not.toContain("4.25rem");
    // 데스크톱 56px 잔재가 본 셸에도, starlight 테마 오버라이드에도 없다.
    expect(publicShell).not.toContain("min-height: 56px");
    expect(referenceVisual).not.toContain("min-height: 56px");
    expect(publicShell).toContain("min-height: 60px");
  });

  it("Container 폭 4단과 레거시 별칭이 같은 클래스를 낸다", () => {
    expect(container).toContain('(size === "wide" || size === "standard") && "max-w-[1320px]"');
    expect(container).toContain('(size === "prose" || size === "reading") && "max-w-3xl"');
    expect(container).toContain('size === "app" && "max-w-[1600px]"');
    expect(container).toContain('size === "full" && "max-w-none"');
  });
});

/**
 * 작업공간+프로젝트 레이아웃 계약 (BLUEPRINT §5.2 (3)·(4), §5.3 L2, §5.4 스냅샷 고정).
 * computed style 스냅샷의 기준값: 레일 폭(아이콘 96px / 행 216px), 상단바 64px, 본문 패딩 24/32/40px.
 * workspace CSS 겹들은 이 치수를 리터럴로 다시 정의하지 않고 --layout-* 토큰만 참조한다.
 * 레일 전환: 행 레일은 ≥1280px 상시, 1024~1280px는 아이콘 레일 (구 1181px 변신 지점 폐지).
 */
describe("작업공간+프로젝트 레이아웃 계약 (L2)", () => {
  const RAIL_TOKENS = [
    ["--layout-rail-icon", "96px", "railIcon"],
    ["--layout-rail-row", "13.5rem", "railRow"],
    ["--layout-workspace-topbar", "64px", "workspaceTopbar"],
    ["--layout-workspace-main-padding-block", "24px", "workspaceMainPaddingBlock"],
    ["--layout-workspace-main-padding-inline", "32px", "workspaceMainPaddingInline"],
    ["--layout-workspace-main-padding-block-end", "40px", "workspaceMainPaddingBlockEnd"],
  ] as const;

  it("레일·상단바·본문 패딩 토큰은 sitewide 한 곳에서만 정의되고 TS와 글자 단위로 같다", () => {
    for (const [token, literal, field] of RAIL_TOKENS) {
      expect(assignments(sitewide, token), token).toEqual([literal]);
      expect(assignments(unified, token), token).toEqual([]);
      expect(tsField(dimensionsBlock, field), token).toBe(literal);
    }
  });

  it("스냅샷: 모든 셸 겹의 레일 열·상단바 행이 토큰을 참조한다 (88/96/108px·72px 리터럴 부재)", () => {
    for (const css of [workspaceBase, workspaceRedesign, workspaceV3]) {
      expect(css).toContain(
        "grid-template-columns:var(--layout-rail-icon) minmax(0,1fr);grid-template-rows:var(--layout-workspace-topbar) minmax(0,1fr) auto",
      );
      expect(css).not.toMatch(/grid-template-columns:(88|96|108|216)px/u);
      expect(css).not.toMatch(/grid-template-rows:(64|72)px/u);
    }
    expect(workspaceRedesign).toContain("grid-template-columns:var(--layout-rail-icon) minmax(0,1fr)}");
    expect(workspaceTaskFrame).toContain("minmax(var(--layout-workspace-topbar),auto)");
    expect(workspaceTaskFrame).toContain(".workspace-task-shell .workspace-topbar{min-height:var(--layout-workspace-topbar)}");
    expect(workspaceTaskFrame).not.toContain("68px");
  });

  it("스냅샷: 상단바 높이는 64px 토큰으로 고정된다 (v3의 72px 상향 되돌림)", () => {
    expect(workspaceV3).toContain(".workspace-topbar{min-height:var(--layout-workspace-topbar)");
    expect(workspaceV3).not.toContain("min-height:72px");
    expect(workspaceV3).toContain(".workspace-focused-topbar{min-height:var(--layout-workspace-topbar)}");
    expect(workspaceV3).toContain("height:calc(100dvh - var(--layout-workspace-topbar))");
  });

  it("스냅샷: 본문 패딩은 전 겹이 24/32/40px 토큰 3종을 참조한다", () => {
    const padding =
      "padding:var(--layout-workspace-main-padding-block) var(--layout-workspace-main-padding-inline) var(--layout-workspace-main-padding-block-end)";
    expect(workspaceBase).toContain(padding);
    expect(workspaceRedesign).toContain(padding);
    expect(workspaceV3).toContain(padding);
    expect(workspaceV3).not.toContain("padding:24px 30px 40px");
  });

  it("레일 전환은 1280px로 표준화되고 행 레일은 216px 토큰이다 (구 1181px 지점 부재)", () => {
    expect(workspaceV3).not.toContain("1181px");
    expect(workspaceV3.match(/@media \(min-width:1280px\)/gu)).toHaveLength(3);
    expect(workspaceV3).toContain(".workspace-shell{grid-template-columns:var(--layout-rail-row) minmax(0,1fr)}");
    expect(workspaceV3).not.toContain("grid-template-columns:216px");
  });

  it("프로젝트(ProductionHubPage) 레일은 240px(15rem)에서 216px(13.5rem)으로 통일된다", () => {
    expect(productionHubPage).toContain("lg:grid-cols-[13.5rem_minmax(0,1fr)]");
    expect(productionHubPage).not.toContain("lg:grid-cols-[15rem_minmax(0,1fr)]");
    // 루트 폭은 폭 4단의 app(100rem) 선언 표면이라 그대로 유지한다.
    expect(productionHubPage).toContain("max-w-[100rem]");
  });
});

/**
 * 카탈로그·마켓 표지 그리드 계약 (BLUEPRINT §5.2 (5), §5.3 L3).
 * 탐색·마켓·서재 세 표면의 표지 그리드는 열 규칙(2→640:3→1024:4→1280:5)·
 * gap(12/16px)·표지 비율(3:4)이 동일해야 한다. 표준 문자열의 정본은
 * layout-tokens.ts의 LAYOUT_COVER_GRID이고, Tailwind 표면은 같은 리터럴을,
 * CSS 표면(마켓 결과 목록)은 같은 수치의 미디어 쿼리 규칙을 쓴다.
 * 마켓 소재 카드 내부 미리보기(16:9)는 §6.3 변형이라 이 계약의 대상이 아니다.
 */
describe("카탈로그·마켓 표지 그리드 계약 (L3)", () => {
  const COVER_GRID =
    "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5";
  const coverGridBlock = tsBlock(layoutTokens, "export const LAYOUT_COVER_GRID");
  const occurrences = (source: string, needle: string) => source.split(needle).length - 1;

  it("표준은 layout-tokens의 LAYOUT_COVER_GRID 한 곳에만 선언된다", () => {
    expect(tsField(coverGridBlock, "container")).toBe(COVER_GRID);
    expect(tsField(coverGridBlock, "coverAspect")).toBe("aspect-[3/4]");
  });

  it("탐색(ExplorePage) 결과·스켈레톤 그리드가 표준과 글자 단위로 같다", () => {
    expect(occurrences(explorePage, COVER_GRID)).toBe(2);
    expect(explorePage).not.toContain("gap-4 gap-y-8");
  });

  it("서재(LibraryView) 표지 그리드 4곳이 모두 표준이다 (구 lg 5열·6열·sm 4열 부재)", () => {
    expect(occurrences(libraryView, COVER_GRID)).toBe(4);
    expect(libraryView).not.toContain("lg:grid-cols-5");
    expect(libraryView).not.toContain("lg:grid-cols-6");
    expect(libraryView).not.toContain("sm:grid-cols-4");
    expect(libraryView).not.toContain("gap-x-4 gap-y-8");
  });

  it("표지 비율은 TitlePoster가 3:4로 고정한다", () => {
    expect(titlePoster).toContain("aspect-[3/4]");
    expect(tsField(coverGridBlock, "coverAspect")).toBe("aspect-[3/4]");
  });

  it("마켓 소장 목록 스켈레톤도 표준 열 규칙을 쓴다", () => {
    expect(occurrences(marketCloudLibraryPage, COVER_GRID)).toBe(1);
    expect(marketCloudLibraryPage).not.toContain("xl:grid-cols-4");
  });

  it("마켓 결과 그리드 CSS가 표준 열·전환·gap과 같은 수치다 (grid 레이아웃만)", () => {
    // 정의 위치는 MarketViewToggle가 import하는 market-library-experience.css 한 곳뿐이다.
    for (const selector of [".market-browse-results--grid", ".market-library-results--grid"]) {
      expect(marketLibraryExperience).toContain(selector);
      expect(marketAtelier).not.toContain(selector);
    }
    expect(marketLibraryExperience).toContain(
      ".market-browse-results { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem;",
    );
    expect(marketLibraryExperience).toContain(
      ".market-library-results { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem;",
    );
    expect(marketLibraryExperience).toContain(
      ".market-browse-results--grid, .market-library-results--grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }",
    );
    expect(marketLibraryExperience).toContain(
      ".market-browse-results--grid, .market-library-results--grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }",
    );
    expect(marketLibraryExperience).toContain(
      ".market-browse-results--grid, .market-library-results--grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }",
    );
    expect(marketLibraryExperience).not.toContain("repeat(auto-fill");
    // list 레이아웃은 열 규칙에서 제외하고 기존 gap 1rem을 유지한다.
    expect(marketLibraryExperience).toContain(
      ".market-browse-results--list { grid-template-columns: minmax(0, 1fr); gap: 1rem; }",
    );
    expect(marketLibraryExperience).toContain(
      ".market-library-results--list { grid-template-columns: minmax(0, 1fr); gap: 1rem; }",
    );
  });
});

/**
 * 학습·설정·매뉴얼 행 레일 계약 (BLUEPRINT §5.2 (4), §5.3 L4).
 * 세 표면의 행 레일은 폭 216px(13.5rem)·전환 1024px로 동일해야 하고,
 * <1024px 변형은 허용 패턴 2종(가로 스크롤 칩 / `<details>` 목차)만 쓴다.
 * 학습·설정은 공용 SectionNav(칩 패턴), 매뉴얼은 <details> 목차 패턴이다.
 * 매뉴얼 히어로 아트 숨김(900px)·단계 그리드(1100px) 같은 레일 무관 전환은
 * 이 계약의 대상이 아니다 — 레일 접기 지점만 고정한다.
 */
describe("학습·설정·매뉴얼 행 레일 계약 (L4)", () => {
  const rowRailBlock = tsBlock(layoutTokens, "export const LAYOUT_ROW_RAIL");
  const RAIL_COLUMNS = "lg:grid-cols-[13.5rem_minmax(0,1fr)]";

  it("행 레일 표준은 layout-tokens의 LAYOUT_ROW_RAIL 한 곳에만 선언되고 railRow와 같다", () => {
    expect(rowRailBlock).not.toBe("");
    expect(tsField(rowRailBlock, "width")).toBe("13.5rem");
    expect(tsField(rowRailBlock, "width")).toBe(tsField(dimensionsBlock, "railRow"));
    expect(tsField(rowRailBlock, "columnsClass")).toBe(RAIL_COLUMNS);
    expect(tsField(rowRailBlock, "breakpoint")).toBe("1024px");
  });

  it("학습(LearnSectionShell) 레일은 216px·lg(1024px) 전환이다", () => {
    expect(learnSectionShell).toContain(RAIL_COLUMNS);
    expect(learnSectionShell).not.toContain("15rem_minmax");
    expect(learnSectionShell).not.toContain("250px");
    // 레일은 ≥1024px(lg)에서만 그리드로 생긴다 — md 이하 전용 레일 열이 없다.
    expect(learnSectionShell).not.toMatch(/(?:sm|md):grid-cols-\[13\.5rem/u);
  });

  it("설정(SettingsPage) 레일은 216px·lg(1024px) 전환으로 학습과 동일하다", () => {
    expect(settingsPage).toContain(RAIL_COLUMNS);
    expect(settingsPage).toContain("lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-6");
    expect(settingsPage).not.toContain("15rem_minmax");
    expect(settingsPage).not.toContain("250px");
  });

  it("매뉴얼(studio-manual.css) 레일은 250px가 아니라 행 레일 토큰 216px다", () => {
    expect(studioManualCss).toContain(
      "grid-template-columns: var(--layout-rail-row) minmax(0, 1fr);",
    );
    expect(studioManualCss).not.toContain("250px");
    expect(studioManualCss).not.toContain("grid-template-columns: 216px");
  });

  it("매뉴얼 레일 접기 전환은 900px가 아니라 1024px 경계(max-width: 1023px)다", () => {
    expect(studioManualCss).toContain("@media (max-width: 1023px) {\n  .manual-layout { display: block;");
    expect(studioManualCss).toContain(".manual-sidebar { display: none; }");
    expect(studioManualCss).not.toContain("@media (max-width: 900px) {\n  .manual-layout");
    expect(studioManualCss).not.toMatch(/@media \(max-width: 900px\) \{\s*\.manual-sidebar/u);
  });

  it("변형 패턴은 2종만이다: 학습·설정은 SectionNav 가로 스크롤 칩, 매뉴얼은 <details> 목차", () => {
    // 패턴 1 — 가로 스크롤 칩: SectionNav가 <lg에서 overflow-x-auto 칩 줄, ≥lg에서 레일로 바뀐다.
    expect(sectionNav).toContain("overflow-x-auto");
    expect(sectionNav).toContain("lg:grid");
    expect(learnSectionShell).toContain('<SectionNav mode="links"');
    expect(settingsPage).toContain('mode="tabs"');
    // 패턴 2 — <details> 목차: 매뉴얼 모바일 목차가 details/summary 구조다.
    expect(studioManualPage).toContain('<details ref={contentsRef} className="manual-mobile-contents manual-no-print">');
    expect(studioManualCss).toContain(".manual-mobile-contents { display: none; }");
    expect(studioManualCss).toContain(".manual-mobile-contents { display: block;");
    // 제3 패턴 금지: 학습·설정 셸이 자체 접기(details) 내비나 숨김 레일을 만들지 않는다.
    expect(learnSectionShell).not.toContain("<details");
    expect(learnSectionShell).not.toContain("manual-mobile-contents");
  });
});

/**
 * 홈 치수 토큰화 계약 (BLUEPRINT §5.2 (7), §5.3 L5 — S3-8 합본).
 * 표면 전용 토큰은 색이 아니라 치수부터 공용 토큰 참조로 바꾼다: 홈 폭은 폭 4단의
 * app 토큰을, 조작 최소 크기는 --site-control-size를 참조하고, 홈에 반복되는 섹션
 * 리듬(44px)·밴드 리듬(36px)은 sitewide 단일 선언(--layout-home-*)으로만 존재한다.
 * --rd-* 색 토큰은 §6 몫이라 이 계약의 변경 대상이 아니다.
 */
describe("홈 치수 토큰화 계약 (L5)", () => {
  it("홈 리듬 토큰은 sitewide 한 곳에서만 선언되고 layout-tokens와 글자 단위로 같다", () => {
    expect(assignments(sitewide, "--layout-home-section-gap")).toEqual(["44px"]);
    expect(assignments(sitewide, "--layout-home-band-gap")).toEqual(["36px"]);
    expect(tsField(dimensionsBlock, "homeSectionGap")).toBe("44px");
    expect(tsField(dimensionsBlock, "homeBandGap")).toBe("36px");
    // 홈 CSS는 토큰을 참조만 하고 다시 정의하지 않는다.
    expect(assignments(homeDashboardCss, "--layout-home-section-gap")).toEqual([]);
    expect(assignments(homeDashboardCss, "--layout-home-band-gap")).toEqual([]);
  });

  it("홈 폭은 전용 1600px가 아니라 폭 4단의 app 토큰 참조다", () => {
    expect(homeDashboardCss).toContain("max-width: var(--layout-content-app);");
    expect(homeDashboardCss).not.toContain("1600px");
  });

  it("홈 섹션 리듬은 토큰 참조 5곳·밴드 리듬 2곳이고 구 리터럴이 없다", () => {
    expect(homeDashboardCss.match(/margin-top: var\(--layout-home-section-gap\);/gu)).toHaveLength(5);
    expect(homeDashboardCss.match(/margin-top: var\(--layout-home-band-gap\);/gu)).toHaveLength(2);
    expect(homeDashboardCss).not.toContain("margin-top: 44px");
    expect(homeDashboardCss).not.toContain("margin-top: 36px");
  });

  it("조작 최소 크기는 --site-control-size 참조이고 헤더 폴백은 60px 단일 높이와 일치한다", () => {
    expect(homeDashboardCss).toContain(
      "min-height: var(--site-control-size); min-width: var(--site-control-size);",
    );
    expect(homeDashboardCss).toContain("min-height: var(--site-control-size); padding: 10px 0;");
    expect(homeDashboardCss).not.toContain("min-height: 44px; min-width: 44px");
    expect(assignments(sitewide, "--site-control-size")).toEqual(["44px"]);
    expect(homeDashboardCss).toContain("scroll-margin-top: calc(var(--site-header-height, 60px) + 12px);");
    expect(homeDashboardCss).not.toContain("72px");
  });

  it("--rd-* 색 토큰은 치수 토큰화의 대상이 아니라 그대로 유지된다", () => {
    expect(homeDashboardCss).toContain("--rd-surface: var(--color-canvas);");
    expect(homeDashboardCss).toContain("--rd-accent: var(--color-accent);");
    expect(homeDashboardCss).toContain("--rd-cyan: var(--color-accent-2, var(--color-accent));");
  });
});

/**
 * 에디터 예외 선언 계약 (BLUEPRINT §5.1 (3)·§5.2 (3), §5.3 L6).
 * 에디터 크롬 44px·도구 레일 48px은 공용 치수 체계로 수렴하지 않는 도메인 고유값이다.
 * 판정은 문서화다: 예외 목록이 layout-tokens.ts에 명시되고, 목록의 값이 선언처
 * (globals.css의 [data-studio-editor="true"] 범위)와 글자 단위로 일치하며,
 * 공용 토큰 체계(sitewide --layout-*·LAYOUT_DIMENSIONS)에는 이 값들이 섞여 들어가지 않는다.
 */
describe("에디터 예외 선언 계약 (L6)", () => {
  const exceptionsBlock = tsBlock(layoutTokens, "export const LAYOUT_EDITOR_EXCEPTIONS");
  /** globals.css에서 [data-studio-editor="true"] 선언 블록 하나만 잘라낸다. */
  const editorScope = (() => {
    const start = globalsCss.indexOf('[data-studio-editor="true"] {');
    if (start < 0) return "";
    const end = globalsCss.indexOf("\n}", start);
    return globalsCss.slice(start, end < 0 ? undefined : end);
  })();

  it("예외 목록이 토큰 파일에 명시되고 선언처 CSS 값과 글자 단위로 같다", () => {
    expect(tsField(exceptionsBlock, "chromeHeight")).toBe("2.75rem");
    expect(tsField(exceptionsBlock, "railWidth")).toBe("3rem");
    expect(assignments(editorScope, "--studio-chrome-h")).toEqual(["2.75rem"]);
    expect(assignments(editorScope, "--studio-rail-w")).toEqual(["3rem"]);
  });

  it("에디터 크롬 변수는 에디터 범위에서만 선언되고 공용 선언처에는 없다", () => {
    // 선언은 globals.css 전체에서도 에디터 범위 블록의 각 1회뿐이다.
    expect(assignments(globalsCss, "--studio-chrome-h")).toEqual(["2.75rem"]);
    expect(assignments(globalsCss, "--studio-rail-w")).toEqual(["3rem"]);
    // 공용 치수 선언처(sitewide)와 공용 토큰 목록에는 에디터 고유값이 들어가지 않는다.
    expect(assignments(sitewide, "--studio-chrome-h")).toEqual([]);
    expect(assignments(sitewide, "--studio-rail-w")).toEqual([]);
    expect(layoutTokens).not.toContain("--layout-editor");
    expect(sitewide).not.toContain("--layout-editor");
  });

  it("예외값은 공용 크롬·레일 값과 실제로 달라 수렴 대상이 아님을 고정한다", () => {
    const chromeHeight = tsField(exceptionsBlock, "chromeHeight");
    const railWidth = tsField(exceptionsBlock, "railWidth");
    // 전역 헤더 60px·작업공간 상단바 64px와 다르고, 공용 레일 96px·216px와도 다르다.
    expect(chromeHeight).not.toBe(tsField(dimensionsBlock, "headerHeight"));
    expect(chromeHeight).not.toBe(tsField(dimensionsBlock, "workspaceTopbar"));
    expect(railWidth).not.toBe(tsField(dimensionsBlock, "railIcon"));
    expect(railWidth).not.toBe(tsField(dimensionsBlock, "railRow"));
    // 44px·48px이라는 도메인 고유값 자체를 고정한다 (16px 기준 환산).
    expect(chromeHeight).toBe("2.75rem");
    expect(railWidth).toBe("3rem");
  });

  it("예외 선언 주석이 근거와 관계를 문서화한다", () => {
    const commentStart = layoutTokens.indexOf("에디터 예외 선언 (BLUEPRINT");
    expect(commentStart).toBeGreaterThanOrEqual(0);
    const comment = layoutTokens.slice(commentStart, layoutTokens.indexOf("export const LAYOUT_EDITOR_EXCEPTIONS"));
    expect(comment).toContain("캔버스 면적 우선");
    expect(comment).toContain("--studio-chrome-h");
    expect(comment).toContain('[data-studio-editor="true"]');
  });
});

/**
 * 브레이크포인트 경계 계약 (BLUEPRINT §5.1 (6)·§5.2 (6)).
 * 표준 5개(640/768/1024/1280/1536)와 그 max-width 동반값(표준−1)만 허용한다.
 * 아직 소진되지 않은 전용 지점은 파일별 잔존 목록으로 고정한다: 목록에 없는
 * 지점이 새로 들어오거나 같은 지점의 개수가 늘면 실패하고, 소진으로 개수가
 * 주는 것은 허용한다(목록은 감소 방향으로만 갱신한다). 너비가 아닌 미디어
 * 특성(높이·호버·포인터·모션·색 강제)은 대상이 아니다.
 */
const BREAKPOINT_STANDARDS = [640, 768, 1024, 1280, 1536] as const;

function isStandardBreakpoint(value: number): boolean {
  // rem 환산(63.999rem = 1023.984px)의 오차를 허용해 동반값(표준−1)도 표준으로 본다.
  return BREAKPOINT_STANDARDS.some(
    (standard) => Math.abs(value - standard) < 0.01 || Math.abs(value - (standard - 1)) < 1.01,
  );
}

/** @media 서문에서 너비 특성의 값만 px로 환산해 뽑는다 (높이 특성은 제외). */
function mediaWidthValues(css: string): number[] {
  const values: number[] = [];
  for (const media of css.matchAll(/@media([^{]*)\{/gu)) {
    for (const feature of media[1].matchAll(/\(([^)]*)\)/gu)) {
      if (!feature[1].includes("width") || feature[1].includes("height")) continue;
      for (const num of feature[1].matchAll(/(\d+(?:\.\d+)?)(px|rem)/gu)) {
        values.push(Number.parseFloat(num[1]) * (num[2] === "rem" ? 16 : 1));
      }
    }
  }
  return values;
}

function nonStandardWidthValues(css: string): number[] {
  return mediaWidthValues(css).filter((value) => !isStandardBreakpoint(value)).sort((a, b) => a - b);
}

describe("브레이크포인트 표준 경계 계약 (BP)", () => {
  const breakpointsBlock = tsBlock(layoutTokens, "export const LAYOUT_BREAKPOINTS");
  const scanned = {
    "sitewide-visual-ux.css": sitewide,
    "unified-theme-contract.css": unified,
    "reference-visual-system.css": referenceVisual,
    "public-site-shell.css": publicShell,
    "globals.css": globalsCss,
    "workspace.css": workspaceBase,
    "workspace-redesign.css": workspaceRedesign,
    "workspace-visual-v3.css": workspaceV3,
    "workspace-task-frame.css": workspaceTaskFrame,
    "studio-manual.css": studioManualCss,
    "learning-hub.css": learningHubCss,
    "reference-creator-dashboard.css": homeDashboardCss,
    "market-library-experience.css": marketLibraryExperience,
  } as const;

  /** 파일별 잔존 전용 지점 (2026-10-13 실측·수렴 후). 감소 방향으로만 갱신한다. */
  const RESIDUAL_BREAKPOINTS: Record<keyof typeof scanned, number[]> = {
    "sitewide-visual-ux.css": [390],
    "unified-theme-contract.css": [],
    "reference-visual-system.css": [],
    "public-site-shell.css": [400, 1180, 1600, 1600],
    "globals.css": [],
    "workspace.css": [380],
    "workspace-redesign.css": [960, 1700],
    "workspace-visual-v3.css": [1100],
    "workspace-task-frame.css": [600],
    "studio-manual.css": [1100],
    "learning-hub.css": [],
    "reference-creator-dashboard.css": [599, 899, 1199, 1200],
    "market-library-experience.css": [700, 1150],
  };

  it("토큰 파일의 표준 5개와 max-width 동반값이 고정된다", () => {
    expect(tsField(breakpointsBlock, "sm")).toBe("640px");
    expect(tsField(breakpointsBlock, "md")).toBe("768px");
    expect(tsField(breakpointsBlock, "lg")).toBe("1024px");
    expect(tsField(breakpointsBlock, "xl")).toBe("1280px");
    expect(tsField(breakpointsBlock, "maxSm")).toBe("639px");
    expect(tsField(breakpointsBlock, "maxMd")).toBe("767px");
    expect(tsField(breakpointsBlock, "maxLg")).toBe("1023px");
    expect(tsField(breakpointsBlock, "maxXl")).toBe("1279px");
    expect(tsField(breakpointsBlock, "max2xl")).toBe("1535px");
  });

  it("허용 외 미디어 쿼리 지점은 파일별 잔존 목록을 넘어 새로 들어올 수 없다", () => {
    for (const [name, css] of Object.entries(scanned)) {
      const residual = RESIDUAL_BREAKPOINTS[name as keyof typeof scanned];
      const counts = new Map<number, number>();
      for (const value of residual) counts.set(value, (counts.get(value) ?? 0) + 1);
      for (const value of nonStandardWidthValues(css)) {
        const allowed = counts.get(value) ?? 0;
        expect(allowed, `${name}: 잔존 목록에 없는 전용 지점 ${value}px`).toBeGreaterThan(0);
        counts.set(value, allowed - 1);
      }
    }
  });

  it("수렴한 전용 지점(760·761 태블릿 경계)은 전 표면에서 사라졌다", () => {
    for (const [name, css] of Object.entries(scanned)) {
      const widths = mediaWidthValues(css);
      expect(widths, `${name}: 760px 잔존`).not.toContain(760);
      expect(widths, `${name}: 761px 잔존`).not.toContain(761);
    }
    // 태블릿 경계는 표준 768/767 쌍으로만 존재한다.
    expect(mediaWidthValues(workspaceBase)).toContain(768);
    expect(mediaWidthValues(workspaceBase)).toContain(767);
    expect(mediaWidthValues(learningHubCss)).toContain(767);
  });

  it("1000px 그리드 경계는 학습·작업공간에서 1024 표준으로 수렴했다", () => {
    expect(mediaWidthValues(learningHubCss)).not.toContain(1000);
    expect(mediaWidthValues(workspaceBase)).not.toContain(1000);
    expect(mediaWidthValues(learningHubCss)).toContain(1023);
    expect(mediaWidthValues(workspaceBase)).toContain(1023);
  });

  it("헤더 1차 내비 전환은 전용 1180이 아니라 표준 1024에서 일어난다", () => {
    expect(publicShell).toContain("@media (width >= 1024px)");
    expect(publicShell).not.toContain("@media (width >= 1180px)");
    // 검색 축소 구간의 상한 1180은 잔존 목록에 고정된 채로만 남는다.
    expect(nonStandardWidthValues(publicShell)).toContain(1180);
  });

  it("매뉴얼 히어로 숨김은 레일 접기와 같은 1024 경계로 수렴했다", () => {
    expect(mediaWidthValues(studioManualCss)).not.toContain(900);
    expect(mediaWidthValues(studioManualCss).filter((value) => value === 1023).length).toBeGreaterThanOrEqual(2);
  });
});
