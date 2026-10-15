import { describe, expect, it } from "vitest";

import {
  LAYOUT_BREAKPOINTS,
  LAYOUT_CONTENT_WIDTH_CLASS,
  LAYOUT_COVER_GRID,
  LAYOUT_DIMENSIONS,
  LAYOUT_EDITOR_EXCEPTIONS,
  LAYOUT_ROW_RAIL,
  LAYOUT_TOKENS,
  LAYOUT_TYPE_SCALE,
  PAGE_TEMPLATE_DETAIL_GRID,
  PAGE_TEMPLATE_SLOTS,
  PAGE_TEMPLATE_TONE,
  PAGE_TEMPLATE_WIDTH,
  type PageTemplateVariant,
} from "./layout-tokens";

/**
 * 레이아웃 토큰 대조 테스트 (BLUEPRINT §5.2 · §7.3 S3-1 수용 기준).
 * 폭·거터·전환 지점의 단일 선언이 서로 어긋나지 않는지 고정한다.
 * CSS 변수(--layout-*)와의 글자 단위 대조는 app/styles/layout-token-contract.contract.test.ts가
 * 맡고, 이 파일은 TS 정본 상수끼리의 내부 일치를 런타임으로 고정한다.
 */
describe("레이아웃 토큰 대조", () => {
  it("폭 4단이 §5.2(1) 값과 일치한다", () => {
    expect(LAYOUT_TOKENS.width.reading).toBe("max-w-3xl");
    expect(LAYOUT_TOKENS.width.standard).toBe("max-w-[1320px]");
    expect(LAYOUT_TOKENS.width.app).toBe("max-w-[1600px]");
    expect(LAYOUT_TOKENS.width.full).toBe("max-w-none");
  });

  it("기존 maxWidth는 width.standard와 같은 값이다 (중복 정의 해소)", () => {
    expect(LAYOUT_TOKENS.maxWidth).toBe(LAYOUT_TOKENS.width.standard);
  });

  it("거터 단계는 16/24/32px 스케일이다", () => {
    expect(LAYOUT_TOKENS.gutterSteps).toBe("px-4 sm:px-6 xl:px-8");
  });

  it("전환 지점은 표준 5개뿐이다", () => {
    expect(LAYOUT_TOKENS.breakpoints).toEqual([640, 768, 1024, 1280, 1536]);
  });

  it("list 변형 슬롯은 필터가 결과(work)보다 앞이다 (S3-2 확정)", () => {
    expect(PAGE_TEMPLATE_SLOTS.list).toEqual([
      "hero",
      "purposeHeader",
      "now",
      "filters",
      "work",
      "evidence",
      "advanced",
      "recovery",
    ]);
  });

  it("detail 변형 슬롯은 주 대상(work) 뒤에 보조 레일(rail)이 온다 (S3-2 확정)", () => {
    expect(PAGE_TEMPLATE_SLOTS.detail).toEqual([
      "hero",
      "purposeHeader",
      "now",
      "work",
      "rail",
      "evidence",
      "advanced",
      "recovery",
    ]);
    expect(PAGE_TEMPLATE_DETAIL_GRID).toContain("lg:grid-cols-[minmax(0,1fr)_20rem]");
  });

  it("steps 슬롯은 form 변형에만 있다 (회차 맥락 표면 전용)", () => {
    for (const variant of Object.keys(PAGE_TEMPLATE_SLOTS) as PageTemplateVariant[]) {
      expect(PAGE_TEMPLATE_SLOTS[variant].includes("steps")).toBe(variant === "form");
    }
  });

  it("템플릿 변형은 5개이고 reading만 본문 폭으로 좁힌다", () => {
    const variants = Object.keys(PAGE_TEMPLATE_WIDTH) as PageTemplateVariant[];
    expect(variants.sort()).toEqual(["dashboard", "detail", "form", "list", "reading"]);
    expect(PAGE_TEMPLATE_WIDTH.reading).toBe("reading");
    for (const variant of variants) {
      if (variant !== "reading") expect(PAGE_TEMPLATE_WIDTH[variant]).toBe("standard");
    }
  });

  it("전 변형의 기본 말투는 해요체다 (BLUEPRINT §3.4 — 변형↔말투 연결)", () => {
    const variants = Object.keys(PAGE_TEMPLATE_TONE) as PageTemplateVariant[];
    expect(variants.sort()).toEqual(["dashboard", "detail", "form", "list", "reading"]);
    for (const variant of variants) {
      expect(PAGE_TEMPLATE_TONE[variant]).toBe("polite");
    }
  });
});

describe("레이아웃 정본 상수 내부 일치 (L0~L6)", () => {
  const px = (value: string) => Number.parseInt(value, 10);

  it("LAYOUT_TOKENS.width는 폭 4단 클래스 정본을 그대로 쓴다", () => {
    expect(LAYOUT_TOKENS.width).toBe(LAYOUT_CONTENT_WIDTH_CLASS);
    expect(Object.keys(LAYOUT_CONTENT_WIDTH_CLASS)).toEqual(["reading", "standard", "app", "full"]);
  });

  it("본문 거터 클래스는 3단계(16/24/32px) 치수 정본과 같은 단계다", () => {
    expect(LAYOUT_TOKENS.gutter).toBe("px-4 sm:px-6 xl:px-8");
    expect(LAYOUT_TOKENS.gutterSteps).toBe(LAYOUT_TOKENS.gutter);
    expect([LAYOUT_DIMENSIONS.gutter, LAYOUT_DIMENSIONS.gutterSm, LAYOUT_DIMENSIONS.gutterXl]).toEqual([
      "1rem",
      "1.5rem",
      "2rem",
    ]);
  });

  it("헤더 높이는 전역 단일 60px이고 페이지 최소 높이 폴백이 같은 값이다", () => {
    expect(LAYOUT_DIMENSIONS.headerHeight).toBe("60px");
    expect(LAYOUT_TOKENS.page).toContain(`var(--site-header-height,${LAYOUT_DIMENSIONS.headerHeight})`);
  });

  it("표준 브레이크포인트 5개와 max-width 동반값(표준−1)이 짝을 이룬다", () => {
    const pairs = [
      ["sm", "maxSm"],
      ["md", "maxMd"],
      ["lg", "maxLg"],
      ["xl", "maxXl"],
      ["2xl", "max2xl"],
    ] as const;
    for (const [min, max] of pairs) {
      expect(px(LAYOUT_BREAKPOINTS[max]), max).toBe(px(LAYOUT_BREAKPOINTS[min]) - 1);
    }
    expect(pairs.map(([min]) => px(LAYOUT_BREAKPOINTS[min]))).toEqual([...LAYOUT_TOKENS.breakpoints]);
  });

  it("행 레일 표준은 치수 정본 railRow와 같은 폭이고 lg 경계에서 전환한다", () => {
    expect(LAYOUT_ROW_RAIL.width).toBe(LAYOUT_DIMENSIONS.railRow);
    expect(LAYOUT_ROW_RAIL.breakpoint).toBe(LAYOUT_BREAKPOINTS.lg);
    expect(LAYOUT_ROW_RAIL.columnsClass).toBe(`lg:grid-cols-[${LAYOUT_ROW_RAIL.width}_minmax(0,1fr)]`);
  });

  it("표지 그리드 표준은 2→3→4→5열이고 sm부터 gap이 12에서 16px로 넓어진다", () => {
    const tokens = LAYOUT_COVER_GRID.container.split(" ");
    expect(tokens).toEqual([
      "grid",
      "grid-cols-2",
      "gap-3",
      "sm:grid-cols-3",
      "sm:gap-4",
      "lg:grid-cols-4",
      "xl:grid-cols-5",
    ]);
    expect(LAYOUT_COVER_GRID.coverAspect).toBe("aspect-[3/4]");
  });

  it("에디터 예외값은 공용 크롬·레일 치수와 겹치지 않는다", () => {
    const shared = Object.values(LAYOUT_DIMENSIONS) as string[];
    expect(shared).not.toContain(LAYOUT_EDITOR_EXCEPTIONS.chromeHeight);
    expect(shared).not.toContain(LAYOUT_EDITOR_EXCEPTIONS.railWidth);
    expect(Object.keys(LAYOUT_DIMENSIONS).some((key) => key.toLowerCase().includes("editor"))).toBe(false);
  });

  it("디스플레이 타이포 스케일은 히어로·섹션 제목 클래스의 단계값과 같다", () => {
    // Tailwind 환산: text-2xl=1.5rem, text-3xl=1.875rem, text-4xl=2.25rem, text-6xl=3.75rem.
    const { heading, sectionTitle } = LAYOUT_TYPE_SCALE.display;
    expect(LAYOUT_TOKENS.type.heroTitle).toContain(`text-[${heading.base}]`);
    expect(LAYOUT_TOKENS.type.heroTitle).toContain("sm:text-4xl");
    expect(LAYOUT_TOKENS.type.heroTitle).toContain("lg:text-6xl");
    expect([heading.sm, heading.lg]).toEqual(["2.25rem", "3.75rem"]);
    expect(LAYOUT_TOKENS.type.sectionTitle).toContain("text-2xl");
    expect(LAYOUT_TOKENS.type.sectionTitle).toContain("sm:text-3xl");
    expect(LAYOUT_TOKENS.type.sectionTitle).toContain("lg:text-4xl");
    expect([sectionTitle.base, sectionTitle.sm, sectionTitle.lg]).toEqual(["1.5rem", "1.875rem", "2.25rem"]);
  });

  it("에디토리얼 변형 클래스는 정본 크기를 쓰는 세리프 이탤릭이다", () => {
    const size = LAYOUT_TYPE_SCALE.editorial.heading.replaceAll(" ", "");
    expect(LAYOUT_TOKENS.type.heroTitleEditorial).toContain(`text-[${size}]`);
    expect(LAYOUT_TOKENS.type.heroTitleEditorial).toContain("font-serif");
    expect(LAYOUT_TOKENS.type.heroTitleEditorial).toContain("italic");
    expect(Object.keys(LAYOUT_TYPE_SCALE)).toEqual(["display", "editorial"]);
  });
});
