import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const unified = readFileSync(new URL("./unified-theme-contract.css", import.meta.url), "utf8");
const reference = readFileSync(new URL("./reference-visual-system.css", import.meta.url), "utf8");
const layoutTokens = readFileSync(
  new URL("../../shared/components/layout/layout-tokens.ts", import.meta.url),
  "utf8",
);

/** CSS에서 커스텀 프로퍼티 할당값만 순서대로 뽑는다 (var() 소비처는 제외). */
function assignments(css: string, name: string): string[] {
  const pattern = new RegExp(`${name}\\s*:\\s*([^;]+);`, "gu");
  return [...css.matchAll(pattern)].map((match) => match[1].trim());
}

/** export const 블록 하나만 잘라낸다 — 동명 필드와 섞이지 않게. */
function tsBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const end = source.indexOf("} as const;", start);
  return source.slice(start, end < 0 ? undefined : end);
}

const scaleBlock = tsBlock(layoutTokens, "export const LAYOUT_TYPE_SCALE");
const tokensBlock = tsBlock(layoutTokens, "export const LAYOUT_TOKENS");

/**
 * 디스플레이 타이포 스케일 단일화 계약 (BLUEPRINT §6.1 (6)·§6.2 (5)).
 * 정본은 layout-tokens.ts의 display 단계값이고, unified 계약은 같은 값을 CSS 변수로 미러링하며,
 * 테마 전용 시트(reference, starlight)는 헤딩 크기를 재정의할 수 없다.
 * Tailwind 환산: text-2xl=1.5rem, text-3xl=1.875rem, text-4xl=2.25rem, text-6xl=3.75rem,
 * 단계 지점은 sm=640px, lg=1024px. 허용 변형은 display·editorial 2종뿐이다.
 */
describe("디스플레이 타이포 스케일 단일화 계약", () => {
  it("unified의 헤딩 크기 할당은 layout-tokens display 단계값(base·sm·lg)뿐이다", () => {
    expect(assignments(unified, "--site-heading-size")).toEqual(["2rem", "2.25rem", "3.75rem"]);
    expect(assignments(unified, "--site-section-title-size")).toEqual(["1.5rem", "1.875rem", "2.25rem"]);
  });

  it("단계 지점은 Tailwind sm·lg와 같은 640px·1024px 미디어 쿼리로 선언된다", () => {
    expect(unified).toMatch(
      /@media \(min-width: 640px\) \{\s*\[data-site-experience\] \{\s*--site-heading-size: 2\.25rem;\s*--site-section-title-size: 1\.875rem;/u,
    );
    expect(unified).toMatch(
      /@media \(min-width: 1024px\) \{\s*\[data-site-experience\] \{\s*--site-heading-size: 3\.75rem;\s*--site-section-title-size: 2\.25rem;/u,
    );
  });

  it("테마 전용 시트(reference/starlight)는 헤딩 크기와 헤딩 여백을 재정의하지 않는다", () => {
    expect(assignments(reference, "--site-heading-size")).toEqual([]);
    expect(assignments(reference, "--site-section-title-size")).toEqual([]);
    expect(assignments(reference, "--site-heading-space")).toEqual([]);
  });

  it("layout-tokens 수치 정본(LAYOUT_TYPE_SCALE)이 CSS 미러와 글자 단위로 일치한다", () => {
    expect(scaleBlock).toContain('heading: { base: "2rem", sm: "2.25rem", lg: "3.75rem" }');
    expect(scaleBlock).toContain('sectionTitle: { base: "1.5rem", sm: "1.875rem", lg: "2.25rem" }');
    expect(scaleBlock).toContain('heading: "clamp(2.25rem, 3.4vw, 3.375rem)"');
  });

  it("display 변형 클래스 문자열은 기존 단계값을 그대로 유지한다 (회귀 고정)", () => {
    expect(tokensBlock).toContain(
      'heroTitle: "font-display text-[2rem] leading-[1.18] font-black tracking-[-0.04em] text-fg break-keep text-balance sm:text-4xl sm:leading-[1.12] lg:text-6xl"',
    );
    expect(tokensBlock).toContain(
      'sectionTitle: "font-display text-2xl leading-snug font-black tracking-tight text-fg break-keep text-balance sm:text-3xl lg:text-4xl"',
    );
  });

  it("허용 변형은 display·editorial 2종뿐이고 editorial은 세리프 이탤릭 명시 변형이다", () => {
    // LAYOUT_TYPE_SCALE의 최상위 키가 정확히 두 개뿐인지 블록 구조로 고정한다.
    expect(scaleBlock).toMatch(/display: \{\s*heading:/u);
    expect(scaleBlock).toMatch(/editorial: \{\s*heading:/u);
    expect(scaleBlock).not.toMatch(/\n {2}(?!display|editorial)[a-z]+: \{/u);
    expect(tokensBlock).toContain("font-serif text-[clamp(2.25rem,3.4vw,3.375rem)]");
    expect(tokensBlock).toContain("italic");
    // unified의 editorial 규칙도 같은 크기를 쓴다 (opt-in 속성으로만 발동).
    expect(unified).toMatch(
      /h1\[data-type-variant="editorial"\] \{\s*font-family: var\(--font-serif\), serif;\s*font-size: clamp\(2\.25rem, 3\.4vw, 3\.375rem\);\s*font-style: italic;/u,
    );
  });
});
