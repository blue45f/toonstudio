import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const readLocal = (relativeUrl: string): string =>
  readFileSync(new URL(relativeUrl, import.meta.url), "utf8");

/**
 * Character Lab Unslop 회귀 봉쇄 계약 (T-UX-07 / T-UX-13).
 *
 * apps/web 계약 테스트와 경계를 분리해(crossAppTestOutsideIntegration: 0/0)
 * apps/character-lab 내부의 Starlight OKLCH 토큰·Calm TopBar·금지 용어 규칙을 영구 고정한다.
 */
describe("Character Lab Unslop 크롬 계약 (T-UX-13)", () => {
  const themeCss = readLocal("./shaper-studio-theme.css");
  const labCss = readLocal("./character-lab.css");
  const topBarTsx = readLocal("../shell/TopBar.tsx");

  it("shaper-studio-theme.css와 character-lab.css에서 #ffff00·금지 모션·scale(0.98) 슬롭이 0건이다", () => {
    for (const [name, css] of [
      ["shaper-studio-theme.css", themeCss],
      ["character-lab.css", labCss],
    ] as const) {
      expect(css, name).not.toMatch(/#ffff00/iu);
      expect(css, name).not.toMatch(/\bstudio-v2-pulse\b|\bgpt25-bg-|\btransition-all\b/u);
      expect(css, name).not.toMatch(/scale\(0\.98\)/u);
      expect(css, name).not.toMatch(/text-transform:\s*uppercase/u);
    }
    expect(themeCss).toContain("oklch(");
  });

  it("TopBar.tsx에서 내부 개발 용어·실험 앱 문구·PBR 노출 및 원시 색·금지 모션이 0건이다", () => {
    for (const forbidden of [
      /실험 앱 · 배포 대상 아님/u,
      /PBR 셰이딩/u,
      /PBR 스튜디오/u,
      /\brev \{/u,
      /\bVARCO 3D\b/u,
      /\bWorld Anvil\b/u,
      /\bPlottr\b/u,
    ]) {
      expect(topBarTsx, forbidden.source).not.toMatch(forbidden);
    }
    expect(topBarTsx).not.toMatch(
      /\b(?:bg|text|border)-(?:white|black|slate|amber|rose|sky|emerald|violet|fuchsia)(?:-[0-9]{2,3})?(?:\/[0-9]+)?|\b(?:bg|text|border)-\[#[0-9a-fA-F]{3,8}\]/u,
    );
    expect(topBarTsx).not.toMatch(/\b(?:transition-all|hover:scale-|animate-pulse|font-black)\b/u);
    expect(topBarTsx).not.toMatch(/text-\[(?:9px|10px|0\.6rem|0\.625rem)\]/u);
  });
});
