import { readFileSync } from "node:fs";

import { inGamut, interpolate, parse, wcagContrast } from "culori";
import { describe, expect, it } from "vitest";

const SPECTRUM_CSS_SHEETS = {
  "workspace-visual-v3.css": readFileSync(new URL("./workspace-visual-v3.css", import.meta.url), "utf8"),
  "workspace-redesign.css": readFileSync(new URL("./workspace-redesign.css", import.meta.url), "utf8"),
  "site-menu.css": readFileSync(new URL("../site-menu.css", import.meta.url), "utf8"),
  "mobile-first-shell.css": readFileSync(new URL("../../../app/styles/mobile-first-shell.css", import.meta.url), "utf8"),
} as const;

const SPECTRUM_TOKENS = [
  "--ts-spectrum-creation",
  "--ts-spectrum-3d",
  "--ts-spectrum-collab",
  "--ts-spectrum-market",
  "--ts-spectrum-support",
] as const;

const DARK_SURFACES = [
  "oklch(0.155 0.008 70)",
  "oklch(0.185 0.009 68)",
  "oklch(0.247 0.011 64)",
  "oklch(0.253 0.038 264.4)",
  "oklch(0.295 0.032 260)",
  "oklch(0.315 0 0)",
] as const;

const LIGHT_SURFACES = [
  "oklch(0.972 0.008 85)",
  "oklch(0.992 0.006 85)",
  "oklch(0.945 0.009 82)",
  "oklch(0.925 0.035 270)",
  "oklch(0.925 0.038 28)",
  "oklch(0.905 0.028 82)",
] as const;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//gu, "");
}

function extractBlock(css: string, selectorNeedle: string): string {
  const start = css.indexOf(selectorNeedle);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  if (open < 0) return "";
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  return "";
}

function extractTokenOklch(block: string, token: string): string {
  const match = new RegExp(`${token}\\s*:\\s*(oklch\\([^)]+\\))`, "u").exec(block);
  return match?.[1] ?? "";
}

describe("멀티디바이스 OKLCH 스펙트럼 비주얼 · UI/UX 계약 (Wave 14B)", () => {
  it("전역 셸과 작업공간 시트에 5색 OKLCH 스펙트럼 시맨틱 변수가 라이트·다크·고대비 모드로 정의된다", () => {
    for (const sheetName of ["mobile-first-shell.css", "workspace-visual-v3.css"] as const) {
      const css = stripComments(SPECTRUM_CSS_SHEETS[sheetName]);
      const darkBlock = extractBlock(css, ":root {");
      const lightBlock = extractBlock(css, ':root[data-theme="light"]');
      const contrastBlock = extractBlock(css, ':root[data-design-theme="contrast"]');

      expect(darkBlock, `${sheetName} dark :root`).not.toBe("");
      expect(lightBlock, `${sheetName} light :root`).not.toBe("");
      expect(contrastBlock, `${sheetName} contrast :root`).not.toBe("");

      const isSrgb = inGamut("rgb");
      const darkHues: number[] = [];
      const lightHues: number[] = [];

      for (const token of SPECTRUM_TOKENS) {
        const darkValue = extractTokenOklch(darkBlock, token);
        const lightValue = extractTokenOklch(lightBlock, token);
        const contrastValue = extractTokenOklch(contrastBlock, token);

        expect(darkValue, `${sheetName} dark ${token}`).toMatch(/^oklch\(/u);
        expect(lightValue, `${sheetName} light ${token}`).toMatch(/^oklch\(/u);
        expect(contrastValue, `${sheetName} contrast ${token}`).toMatch(/^oklch\(/u);

        const parsedDark = parse(darkValue);
        const parsedLight = parse(lightValue);
        expect(parsedDark && isSrgb(parsedDark), `${sheetName} dark ${token} sRGB`).toBe(true);
        expect(parsedLight && isSrgb(parsedLight), `${sheetName} light ${token} sRGB`).toBe(true);

        if (parsedDark && "h" in parsedDark && typeof parsedDark.h === "number") darkHues.push(parsedDark.h);
        if (parsedLight && "h" in parsedLight && typeof parsedLight.h === "number") lightHues.push(parsedLight.h);

        for (const surface of DARK_SURFACES) {
          expect(wcagContrast(darkValue, surface), `${sheetName} dark ${token} vs ${surface}`).toBeGreaterThanOrEqual(4.5);
          const softPill = interpolate([surface, darkValue], "oklch")(0.14);
          expect(wcagContrast(darkValue, softPill), `${sheetName} dark ${token} on 14% soft pill`).toBeGreaterThanOrEqual(4.5);
        }

        for (const surface of LIGHT_SURFACES) {
          expect(wcagContrast(lightValue, surface), `${sheetName} light ${token} vs ${surface}`).toBeGreaterThanOrEqual(4.5);
          const softPill = interpolate([surface, lightValue], "oklch")(0.14);
          expect(wcagContrast(lightValue, softPill), `${sheetName} light ${token} on 14% soft pill`).toBeGreaterThanOrEqual(4.5);
        }
      }

      // 5색 스펙트럼 각 축은 OKLCH 색상환에서 최소 15도 이상 분리되어 역할 구분이 명확하다.
      for (const hues of [darkHues, lightHues]) {
        expect(hues).toHaveLength(5);
        for (let i = 0; i < hues.length; i += 1) {
          for (let j = i + 1; j < hues.length; j += 1) {
            const rawDiff = Math.abs(hues[i]! - hues[j]!);
            const angularDiff = Math.min(rawDiff, 360 - rawDiff);
            expect(angularDiff, `${sheetName} hue separation`).toBeGreaterThanOrEqual(15);
          }
        }
      }
    }
  });

  it("대상 4개 CSS 파일 모두 원시 HEX 색상이 0건이고 transition: all 이 0건이다", () => {
    for (const [name, rawCss] of Object.entries(SPECTRUM_CSS_SHEETS)) {
      const css = stripComments(rawCss);
      expect(css.match(/#[0-9a-fA-F]{3,8}\b/gu) ?? [], `${name} raw HEX`).toEqual([]);
      expect(css.match(/transition(?:-property)?\s*:\s*[^;]*\ball\b/gu) ?? [], `${name} transition: all`).toEqual([]);
    }
  });

  it("PC(>=1280px) · 태블릿(768px~1279px) · 모바일(<=767px) 3단 반응형과 44px 터치 영역을 보장한다", () => {
    for (const [name, rawCss] of Object.entries(SPECTRUM_CSS_SHEETS)) {
      const css = stripComments(rawCss);
      expect(css, `${name} mobile <=767px`).toMatch(/@media\s*\(\s*max-width\s*:\s*767px\s*\)/u);
      expect(css, `${name} tablet 768px~1279px`).toMatch(
        /@media\s*\(\s*min-width\s*:\s*768px\s*\)\s*and\s*\(\s*max-width\s*:\s*1279px\s*\)/u,
      );
      expect(css, `${name} desktop >=1280px`).toMatch(/@media\s*\(\s*min-width\s*:\s*1280px\s*\)/u);
      expect(css, `${name} min-height 44px`).toMatch(/min-height\s*:\s*44px/u);
      expect(css, `${name} overflow-x: clip`).toMatch(/overflow-x\s*:\s*clip/u);
      expect(css, `${name} overscroll-behavior: contain`).toMatch(/overscroll-behavior\s*:\s*contain/u);
      expect(css, `${name} safe-area-inset-bottom`).toContain("env(safe-area-inset-bottom)");
    }

    // 페이지 역할·다음 동선 바 스타일링과 5색 톤 바인딩이 전역·작업공간에 함께 제공된다.
    expect(SPECTRUM_CSS_SHEETS["mobile-first-shell.css"]).toContain("[data-role-journey-bar]");
    expect(SPECTRUM_CSS_SHEETS["mobile-first-shell.css"]).toContain('[data-accent-tone="creation"]');
    expect(SPECTRUM_CSS_SHEETS["mobile-first-shell.css"]).toContain('[data-accent-tone="three-d"]');
    expect(SPECTRUM_CSS_SHEETS["mobile-first-shell.css"]).toContain('[data-accent-tone="collab"]');
    expect(SPECTRUM_CSS_SHEETS["mobile-first-shell.css"]).toContain('[data-accent-tone="market"]');
    expect(SPECTRUM_CSS_SHEETS["mobile-first-shell.css"]).toContain('[data-accent-tone="support"]');
    expect(SPECTRUM_CSS_SHEETS["workspace-visual-v3.css"]).toContain("[data-role-journey-bar]");
  });

  it("차세대 CSS 모던 기술(@supports animation-timeline: view(), @starting-style)과 backdrop-filter 접두사 페어링, 모션 축소 가드를 갖춘다", () => {
    for (const [name, rawCss] of Object.entries(SPECTRUM_CSS_SHEETS)) {
      const css = stripComments(rawCss);
      expect(css, `${name} animation-timeline: view()`).toMatch(/@supports\s*\(\s*animation-timeline\s*:\s*view\(\)\s*\)/u);
      expect(css, `${name} @starting-style`).toContain("@starting-style");
      expect(css, `${name} prefers-reduced-motion: reduce`).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/u);

      // 모든 backdrop-filter 선언은 -webkit-backdrop-filter와 1:1 페어링된다.
      const standardBackdropCount = (css.match(/(?<![-\w])backdrop-filter\s*:/gu) ?? []).length;
      const webkitBackdropCount = (css.match(/-webkit-backdrop-filter\s*:/gu) ?? []).length;
      expect(standardBackdropCount, `${name} backdrop-filter count`).toBeGreaterThan(0);
      expect(webkitBackdropCount, `${name} -webkit-backdrop-filter pairing`).toBe(standardBackdropCount);

      // 소스 파일 크기 가드(800줄 이하)를 지킨다.
      expect(rawCss.split("\n").length, `${name} line limit <= 800`).toBeLessThanOrEqual(800);
    }
  });
});
