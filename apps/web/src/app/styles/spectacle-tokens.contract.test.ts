import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const unified = readFileSync(new URL("./unified-theme-contract.css", import.meta.url), "utf8");
const spectacleCss = readFileSync(
  new URL("../../shared/components/spectacle.css", import.meta.url),
  "utf8",
);
const dashboardCss = readFileSync(
  new URL("../../domains/marketing/reference-creator-dashboard.css", import.meta.url),
  "utf8",
);

/** CSS에서 커스텀 프로퍼티 할당값만 순서대로 뽑는다 (var() 소비처는 제외). */
function assignments(css: string, name: string): string[] {
  const pattern = new RegExp(`${name}\\s*:\\s*([^;]+);`, "gu");
  return [...css.matchAll(pattern)].map((match) => match[1].trim());
}

const THEMES = [
  "aurora",
  "blossom",
  "starlight",
  "dark",
  "light",
  "graphite",
  "midnight",
  "sepia",
  "contrast",
] as const;

/**
 * 표현 토큰 층 계약 (BLUEPRINT §6.2 (1)·§6.4 경계 5, S3-15).
 * 새 팔레트를 만들지 않는다: 표현 토큰은 전 테마 공통 블록에서 --unified-*로만
 * 도출되고, 테마별 블록은 --spectacle-* 리터럴을 직접 갖지 않는다. 그래서
 * 9개 테마 전수에서 토큰이 성립하는지를 파일 수준에서 고정한다.
 */
describe("표현 토큰 층 계약 (S3-15)", () => {
  it("9개 테마 블록이 모두 존재하고 --unified-accent/-2를 제공한다", () => {
    for (const theme of THEMES) {
      const start = unified.indexOf(`:root[data-design-theme="${theme}"]`);
      expect(start, theme).toBeGreaterThanOrEqual(0);
      const block = unified.slice(start, unified.indexOf("}", start));
      expect(block, theme).toContain("--unified-accent:");
      expect(block, theme).toContain("--unified-accent-2:");
      // 테마 블록이 표현 토큰을 직접 재정의하면 테마마다 인상이 갈라진다 — 금지.
      expect(block, theme).not.toContain("--spectacle-");
      expect(block, theme).not.toContain("--domain-tint:");
      expect(block, theme).not.toContain("--elevation-");
    }
  });

  it("표현 토큰은 공통 블록에서 정확히 한 번씩, unified 별칭으로만 정의된다", () => {
    expect(assignments(unified, "--spectacle-1")).toEqual(["var(--unified-accent)"]);
    expect(assignments(unified, "--spectacle-2")).toEqual(["var(--unified-accent-2)"]);
    expect(assignments(unified, "--spectacle-3")).toEqual([
      "var(--color-cool, var(--unified-accent-2))",
    ]);
    expect(assignments(unified, "--domain-tint")).toEqual(["var(--spectacle-1)"]);
    // 두 번째 값은 forced-colors 블록의 시스템 색 접기다.
    expect(assignments(unified, "--surface-glass")).toEqual(["var(--unified-glass)", "Canvas"]);
    expect(assignments(unified, "--elevation-1")).toEqual(["var(--unified-shadow-soft)", "none"]);
    expect(assignments(unified, "--elevation-2")).toEqual(["var(--unified-shadow)", "none"]);
  });

  it("스펙트럼 그라디언트·글로우·스크림이 토큰으로 존재한다", () => {
    const gradient = assignments(unified, "--spectacle-gradient");
    expect(gradient).toHaveLength(2); // 공통 정의 + forced-colors의 none
    expect(gradient[0]).toContain("var(--spectacle-1)");
    expect(gradient[0]).toContain("var(--spectacle-2)");
    expect(gradient[0]).toContain("var(--spectacle-3)");
    expect(assignments(unified, "--spectacle-glow")[0]).toContain("var(--spectacle-1)");
    expect(assignments(unified, "--art-scrim")[0]).toContain("linear-gradient");
    expect(assignments(unified, "--art-on")).toEqual([
      "oklch(0.97 0.012 285)",
      "CanvasText", // forced-colors에서 시스템 색으로 접힌다
    ]);
  });

  it("forced-colors에서 그라디언트·글로우·elevation이 전부 제거된다 (§6.4 경계 1)", () => {
    expect(assignments(unified, "--spectacle-gradient")).toContain("none");
    expect(assignments(unified, "--spectacle-glow")).toEqual([
      "0 0 32px color-mix(in oklch, var(--spectacle-1) 26%, transparent)",
      "none",
    ]);
    for (const token of ["--elevation-1", "--elevation-2", "--elevation-3"]) {
      expect(assignments(unified, token), token).toContain("none");
    }
  });

  it("부품 CSS는 표현 토큰만 소비하고 테마 리터럴 색을 갖지 않는다", () => {
    expect(spectacleCss).toContain("var(--spectacle-gradient)");
    expect(spectacleCss).toContain("var(--art-scrim)");
    expect(spectacleCss).toContain("var(--elevation-1)");
    expect(spectacleCss).toContain("var(--elevation-2)");
    // oklch/hex 리터럴이 부품 CSS에 있으면 테마 정합이 깨진다.
    expect(spectacleCss).not.toMatch(/oklch\(|#[0-9a-fA-F]{3,8}\b/u);
  });

  it("홈 RD 토큰은 표현 토큰의 별칭으로 축소됐다 (§6.2 (1))", () => {
    // 두 번째 값은 강제 색상 블록의 기존 재정의다.
    expect(assignments(dashboardCss, "--rd-accent")).toEqual([
      "var(--spectacle-1, var(--color-accent))",
      "LinkText",
    ]);
    expect(assignments(dashboardCss, "--rd-cyan")).toEqual([
      "var(--spectacle-2, var(--color-accent-2, var(--color-accent)))",
      "Highlight",
    ]);
    expect(assignments(dashboardCss, "--rd-on-art")).toEqual([
      "var(--art-on, oklch(0.97 0.012 285))",
      "CanvasText", // 강제 색상 블록의 기존 재정의
    ]);
  });
});
