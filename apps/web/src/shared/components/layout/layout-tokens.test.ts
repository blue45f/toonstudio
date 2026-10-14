import { describe, expect, it } from "vitest";

import {
  LAYOUT_TOKENS,
  PAGE_TEMPLATE_DETAIL_GRID,
  PAGE_TEMPLATE_SLOTS,
  PAGE_TEMPLATE_TONE,
  PAGE_TEMPLATE_WIDTH,
  type PageTemplateVariant,
} from "./layout-tokens";

/**
 * 레이아웃 토큰 대조 테스트 (BLUEPRINT §5.2 · §7.3 S3-1 수용 기준).
 * 폭·거터·전환 지점의 단일 선언이 서로 어긋나지 않는지 고정한다.
 * CSS 변수(--layout-*)와의 대조는 CSS 소유 파일 이관(L0/L1) 때 같은 파일에 추가한다.
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
