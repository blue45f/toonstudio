import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import Color from "colorjs.io";
import { describe, expect, it } from "vitest";

import {
  SPECTRUM_CHROMATIC_DISCIPLINE,
  SPECTRUM_DOMAIN_IDS,
  SPECTRUM_DOMAIN_PIGMENTS,
  SPECTRUM_EDITORIAL_PALETTES,
  SPECTRUM_PALETTE_IDS,
  VIOLET_SLOP_HUE_RANGE,
  WCAG_AA_BOUNDARY_MIN_CONTRAST,
  WCAG_AA_TEXT_MIN_CONTRAST,
  auditSpectrumPaletteContrast,
  auditZeroVioletSlop,
  buildSpectrumHairlineGradient,
  getSpectrumDomainPigment,
  getSpectrumPaletteSpec,
  isVioletSlopHue,
  meetsWcagContrast,
  normalizeHueDegrees,
  oklchContrastRatio,
  oklchRelativeLuminance,
  parseOklchColor,
  resolveSpectrumDomainCssVars,
} from "./spectrum-editorial-tokens";

const CSS_PATH = fileURLToPath(
  new URL("../../app/styles/spectrum-editorial-theme.css", import.meta.url),
);
const MAIN_PATH = fileURLToPath(new URL("../../app/main.tsx", import.meta.url));

function extractScopeBlock(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`CSS 블록을 찾지 못했습니다: ${selector}`);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

describe("스펙트럼 에디토리얼 85/10/5 색채 규율 및 갤러리 표면", () => {
  it("85 / 10 / 5 색채 비율 합계가 정확히 1.0이다", () => {
    const total =
      SPECTRUM_CHROMATIC_DISCIPLINE.neutralSurfaceRatio
      + SPECTRUM_CHROMATIC_DISCIPLINE.domainPigmentRatio
      + SPECTRUM_CHROMATIC_DISCIPLINE.editorialDetailRatio;
    expect(SPECTRUM_CHROMATIC_DISCIPLINE.neutralSurfaceRatio).toBe(0.85);
    expect(SPECTRUM_CHROMATIC_DISCIPLINE.domainPigmentRatio).toBe(0.1);
    expect(SPECTRUM_CHROMATIC_DISCIPLINE.editorialDetailRatio).toBe(0.05);
    expect(total).toBeCloseTo(1, 6);
  });

  it("다크 갤러리 흑단(editorial-vivid) 표면은 oklch(0.145 0.005 65) 기준이며 퍼플·네이비 틴트가 0%다", () => {
    const vivid = getSpectrumPaletteSpec("editorial-vivid");
    expect(vivid.mode).toBe("dark");
    expect(vivid.surfaces.canvas).toBe("oklch(0.145 0.005 65)");
    for (const [name, value] of Object.entries(vivid.surfaces)) {
      const parsed = parseOklchColor(value);
      expect(parsed, `vivid.${name}`).not.toBeNull();
      expect(parsed?.c, `vivid.${name} chroma`).toBeLessThanOrEqual(0.01);
      expect(parsed?.h, `vivid.${name} warm hue`).toBeGreaterThanOrEqual(60);
      expect(parsed?.h, `vivid.${name} warm hue`).toBeLessThanOrEqual(90);
    }
  });

  it("라이트 한지 아카이브(editorial-paper) 표면은 oklch(0.98 0.006 85) 기준이며 퍼플·네이비 틴트가 0%다", () => {
    const paper = getSpectrumPaletteSpec("editorial-paper");
    expect(paper.mode).toBe("light");
    expect(paper.surfaces.canvas).toBe("oklch(0.98 0.006 85)");
    for (const [name, value] of Object.entries(paper.surfaces)) {
      const parsed = parseOklchColor(value);
      expect(parsed, `paper.${name}`).not.toBeNull();
      expect(parsed?.c, `paper.${name} chroma`).toBeLessThanOrEqual(0.01);
      expect(parsed?.h, `paper.${name} warm hue`).toBeGreaterThanOrEqual(75);
      expect(parsed?.h, `paper.${name} warm hue`).toBeLessThanOrEqual(90);
    }
  });
});

describe("5대 도메인 아티스트 안료 시그니처", () => {
  it("5대 도메인 식별자와 CSS 변수명이 정본 규약과 일치한다", () => {
    expect(SPECTRUM_DOMAIN_IDS).toEqual(["draw", "3d", "character", "market", "collab"]);
    for (const id of SPECTRUM_DOMAIN_IDS) {
      const pigment = getSpectrumDomainPigment(id);
      expect(pigment.id).toBe(id);
      expect(pigment.cssVar).toBe(`--spectrum-pigment-${id}`);
      expect(pigment.nameKo.length).toBeGreaterThan(0);
      expect(pigment.roleKo.length).toBeGreaterThan(0);
    }
  });

  it("5대 도메인 안료의 휴(hue)가 버밀리온 28 · 코발트 245 · 마리골드 72 · 비리디안 158 · 세룰리안 198로 고정된다", () => {
    const expectedHues = {
      draw: 28,
      "3d": 245,
      character: 72,
      market: 158,
      collab: 198,
    } as const;

    for (const id of SPECTRUM_DOMAIN_IDS) {
      const pigment = SPECTRUM_DOMAIN_PIGMENTS[id];
      expect(pigment.hue, `${id}.hue`).toBe(expectedHues[id]);
      for (const variant of [pigment.vivid, pigment.paper]) {
        for (const key of ["ink", "soft", "border"] as const) {
          const parsed = parseOklchColor(variant[key]);
          expect(parsed, `${id}.${key}`).not.toBeNull();
          expect(parsed?.h, `${id}.${key} hue`).toBe(expectedHues[id]);
          expect(isVioletSlopHue(parsed?.h ?? 0, parsed?.c ?? 0)).toBe(false);
        }
      }
    }
  });

  it("5대 안료 간 색상환 최소 각도 간격이 30도 이상으로 시각적 구분이 또렷하다", () => {
    const hues = SPECTRUM_DOMAIN_IDS.map((id) => SPECTRUM_DOMAIN_PIGMENTS[id].hue);
    for (let i = 0; i < hues.length; i += 1) {
      for (let j = i + 1; j < hues.length; j += 1) {
        const rawDiff = Math.abs((hues[i] ?? 0) - (hues[j] ?? 0));
        const circularDiff = Math.min(rawDiff, 360 - rawDiff);
        expect(circularDiff, `hue pair ${hues[i]} vs ${hues[j]}`).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it("resolveSpectrumDomainCssVars는 다크·라이트 팔레트별 4종 도메인 변수를 반환한다", () => {
    const drawVivid = resolveSpectrumDomainCssVars("draw", "editorial-vivid");
    expect(drawVivid["--spectrum-domain-pigment"]).toBe(SPECTRUM_DOMAIN_PIGMENTS.draw.vivid.ink);
    expect(drawVivid["--spectrum-domain-pigment-soft"]).toBe(SPECTRUM_DOMAIN_PIGMENTS.draw.vivid.soft);
    expect(drawVivid["--spectrum-domain-pigment-border"]).toBe(SPECTRUM_DOMAIN_PIGMENTS.draw.vivid.border);
    expect(drawVivid["--spectrum-domain-pigment-on"]).toBe(SPECTRUM_DOMAIN_PIGMENTS.draw.vivid.onPigment);

    const threePaper = resolveSpectrumDomainCssVars("3d", "editorial-paper");
    expect(threePaper["--spectrum-domain-pigment"]).toBe(SPECTRUM_DOMAIN_PIGMENTS["3d"].paper.ink);
    expect(threePaper["--spectrum-domain-pigment-on"]).toBe(SPECTRUM_DOMAIN_PIGMENTS["3d"].paper.onPigment);
  });

  it("buildSpectrumHairlineGradient는 5대 안료 전부를 포함하고 바이올렛 0%를 유지한다", () => {
    for (const paletteId of SPECTRUM_PALETTE_IDS) {
      const gradient = buildSpectrumHairlineGradient(paletteId);
      expect(gradient.startsWith("linear-gradient(90deg,")).toBe(true);
      expect(gradient).toContain("0%");
      expect(gradient).toContain("25%");
      expect(gradient).toContain("50%");
      expect(gradient).toContain("75%");
      expect(gradient).toContain("100%");
      const audit = auditZeroVioletSlop(gradient);
      expect(audit.ok).toBe(true);
      expect(audit.inspectedCount).toBe(5);
    }
  });
});

describe("바이올렛 슬롭(270~320deg) 0% 자가 감사", () => {
  it("isVioletSlopHue는 270~320deg 경계·내부·래핑 각도를 정확히 차단하고 무채색은 허용한다", () => {
    expect(VIOLET_SLOP_HUE_RANGE).toEqual({ min: 270, max: 320 });
    expect(isVioletSlopHue(270, 0.12)).toBe(true);
    expect(isVioletSlopHue(293.7, 0.14)).toBe(true);
    expect(isVioletSlopHue(320, 0.08)).toBe(true);
    expect(isVioletSlopHue(-60, 0.12)).toBe(true); // 300deg
    expect(isVioletSlopHue(650, 0.12)).toBe(true); // 290deg
    expect(isVioletSlopHue(269.9, 0.15)).toBe(false);
    expect(isVioletSlopHue(320.1, 0.15)).toBe(false);
    expect(isVioletSlopHue(245, 0.14)).toBe(false);
    expect(isVioletSlopHue(290, 0)).toBe(false);
    expect(normalizeHueDegrees(-30)).toBe(330);
  });

  it("SPECTRUM_DOMAIN_PIGMENTS와 SPECTRUM_EDITORIAL_PALETTES 전체 토큰이 바이올렛 0% 감사를 통과한다", () => {
    const tokenMap: Record<string, string> = {};
    for (const domainId of SPECTRUM_DOMAIN_IDS) {
      const pigment = SPECTRUM_DOMAIN_PIGMENTS[domainId];
      for (const mode of ["vivid", "paper"] as const) {
        for (const [k, v] of Object.entries(pigment[mode])) {
          tokenMap[`${domainId}.${mode}.${k}`] = v;
        }
      }
    }
    for (const paletteId of SPECTRUM_PALETTE_IDS) {
      const palette = SPECTRUM_EDITORIAL_PALETTES[paletteId];
      for (const [groupName, group] of [
        ["surfaces", palette.surfaces],
        ["lines", palette.lines],
        ["ink", palette.ink],
        ["semantic", palette.semantic],
      ] as const) {
        for (const [k, v] of Object.entries(group)) {
          tokenMap[`${paletteId}.${groupName}.${k}`] = v;
        }
      }
    }
    const report = auditZeroVioletSlop(tokenMap);
    expect(report.ok).toBe(true);
    expect(report.violetViolations).toEqual([]);
    expect(report.rawColorViolations).toEqual([]);
    expect(report.inspectedCount).toBeGreaterThanOrEqual(70);
  });

  it("auditZeroVioletSlop는 토큰 맵에 섞인 바이올렛 강조색과 은은한 퍼플 표면 틴트를 모두 적발한다", () => {
    const report = auditZeroVioletSlop({
      "--safe-draw": "oklch(0.715 0.165 28)",
      "--slop-accent": "oklch(0.75 0.142 293.7)",
      "--slop-wash": "oklch(0.16 0.018 275 / 0.25)",
    });
    expect(report.ok).toBe(false);
    expect(report.violetViolations).toHaveLength(2);
    expect(report.violetViolations.map((v) => v.token)).toEqual(["--slop-accent", "--slop-wash"]);
  });

  it("auditZeroVioletSlop는 CSS 주석 안의 설명 문구는 무시하고 실제 선언의 바이올렛만 잡는다", () => {
    const cleanCss = `
      /* 바이올렛 금지 대역: oklch(0.75 0.15 290) 사용 금지 */
      :root { --spectrum-ok: oklch(0.715 0.165 28); }
    `;
    expect(auditZeroVioletSlop(cleanCss).ok).toBe(true);

    const dirtyCss = `
      :root {
        --spectrum-bad-violet: oklch(0.68 0.18 285);
      }
    `;
    const dirtyReport = auditZeroVioletSlop(dirtyCss);
    expect(dirtyReport.ok).toBe(false);
    expect(dirtyReport.violetViolations).toHaveLength(1);
    expect(dirtyReport.violetViolations[0]?.token).toBe("--spectrum-bad-violet");
  });

  it("auditZeroVioletSlop는 원시 hex · rgb · rgba · hsl · hsla 리터럴을 차단한다", () => {
    const hexSample = ["#", "7c3aed"].join("");
    const cssWithRaw = `
      :root {
        --raw-hex: ${hexSample};
        --raw-rgb: rgb(124, 58, 237);
        --raw-hsl: hsla(270, 80%, 60%, 0.5);
      }
    `;
    const report = auditZeroVioletSlop(cssWithRaw);
    expect(report.ok).toBe(false);
    expect(report.rawColorViolations).toHaveLength(3);
  });

  it("실제 spectrum-editorial-theme.css 파일 전체가 바이올렛 0% · 원시 색상 0건 감사를 통과한다", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    const report = auditZeroVioletSlop(css);
    expect(report.ok).toBe(true);
    expect(report.violetViolations).toEqual([]);
    expect(report.rawColorViolations).toEqual([]);
    expect(report.inspectedCount).toBeGreaterThanOrEqual(50);
  });
});

describe("OKLCH 파싱 및 WCAG 2.1 대비 수학 검증", () => {
  it("parseOklchColor는 표준·퍼센트·deg·음수 각도·알파 구문을 파싱하고 잘못된 입력을 거부한다", () => {
    expect(parseOklchColor("oklch(0.145 0.005 65)")).toEqual({ l: 0.145, c: 0.005, h: 65, alpha: 1 });
    expect(parseOklchColor("oklch(98% 0.006 85deg / 50%)")).toEqual({ l: 0.98, c: 0.006, h: 85, alpha: 0.5 });
    expect(parseOklchColor("oklch(0.715 0.165 -332 / 0.14)")).toEqual({ l: 0.715, c: 0.165, h: 28, alpha: 0.14 });
    expect(parseOklchColor("oklch(1.5 0.1 28)")).toBeNull();
    expect(parseOklchColor("oklch(0.5 0.1 28 / 1.5)")).toBeNull();
    expect(parseOklchColor("not-a-color")).toBeNull();
  });

  it("oklchContrastRatio는 흑백 극단(21:1) · 동일색(1:1)을 만족하고 colorjs.io WCAG21과 0.05 이내로 일치한다", () => {
    expect(oklchContrastRatio("oklch(1 0 0)", "oklch(0 0 0)")).toBeCloseTo(21, 2);
    expect(oklchContrastRatio("oklch(0.5 0.1 28)", "oklch(0.5 0.1 28)")).toBeCloseTo(1, 4);
    expect(oklchRelativeLuminance("oklch(0 0 0)")).toBeCloseTo(0, 5);
    expect(oklchRelativeLuminance("oklch(1 0 0)")).toBeCloseTo(1, 5);

    const vividRaised = SPECTRUM_EDITORIAL_PALETTES["editorial-vivid"].surfaces.raised;
    const paperRaised = SPECTRUM_EDITORIAL_PALETTES["editorial-paper"].surfaces.raised;
    for (const domainId of SPECTRUM_DOMAIN_IDS) {
      const vividInk = SPECTRUM_DOMAIN_PIGMENTS[domainId].vivid.ink;
      const paperInk = SPECTRUM_DOMAIN_PIGMENTS[domainId].paper.ink;
      const calcDark = oklchContrastRatio(vividInk, vividRaised);
      const refDark = new Color(vividInk).contrast(new Color(vividRaised), "WCAG21");
      expect(Math.abs(calcDark - refDark), `dark ${domainId}`).toBeLessThan(0.05);

      const calcLight = oklchContrastRatio(paperInk, paperRaised);
      const refLight = new Color(paperInk).contrast(new Color(paperRaised), "WCAG21");
      expect(Math.abs(calcLight - refLight), `light ${domainId}`).toBeLessThan(0.05);
    }
  });

  it("oklchContrastRatio는 반투명 전경 합성을 지원하고 반투명 배경·잘못된 문자열은 예외를 던진다", () => {
    const ratio = oklchContrastRatio("oklch(0.962 0.006 82 / 0.85)", "oklch(0.145 0.005 65)");
    expect(ratio).toBeGreaterThan(10);
    expect(() => oklchContrastRatio("oklch(0.962 0.006 82)", "oklch(0.145 0.005 65 / 0.5)")).toThrow();
    expect(() => oklchContrastRatio("invalid", "oklch(0.145 0.005 65)")).toThrow();
  });

  it("editorial-vivid 팔레트의 모든 텍스트·안료·자체 틴트 조합이 WCAG AA 4.5:1, 경계선이 3:1을 충족한다", () => {
    const report = auditSpectrumPaletteContrast("editorial-vivid");
    expect(report.ok, JSON.stringify(report.violations)).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.minTextRatio).toBeGreaterThanOrEqual(WCAG_AA_TEXT_MIN_CONTRAST);
    expect(report.minBoundaryRatio).toBeGreaterThanOrEqual(WCAG_AA_BOUNDARY_MIN_CONTRAST);
    expect(report.checkedPairs).toBeGreaterThanOrEqual(80);
  });

  it("editorial-paper 팔레트의 모든 텍스트·안료·자체 틴트 조합이 WCAG AA 4.5:1, 경계선이 3:1을 충족한다", () => {
    const report = auditSpectrumPaletteContrast("editorial-paper");
    expect(report.ok, JSON.stringify(report.violations)).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.minTextRatio).toBeGreaterThanOrEqual(WCAG_AA_TEXT_MIN_CONTRAST);
    expect(report.minBoundaryRatio).toBeGreaterThanOrEqual(WCAG_AA_BOUNDARY_MIN_CONTRAST);
    expect(report.checkedPairs).toBeGreaterThanOrEqual(80);
  });

  it("meetsWcagContrast는 4.5:1 텍스트 기준과 3.0:1 경계선 기준을 정확히 판정한다", () => {
    expect(meetsWcagContrast("oklch(0.962 0.006 82)", "oklch(0.145 0.005 65)")).toBe(true);
    expect(meetsWcagContrast("oklch(0.325 0.008 68)", "oklch(0.245 0.007 68)")).toBe(false);
    expect(
      meetsWcagContrast(
        SPECTRUM_EDITORIAL_PALETTES["editorial-vivid"].lines.strong,
        SPECTRUM_EDITORIAL_PALETTES["editorial-vivid"].surfaces.raised,
        WCAG_AA_BOUNDARY_MIN_CONTRAST,
      ),
    ).toBe(true);
  });
});

describe("spectrum-editorial-theme.css 실존 · 진입점 연결 · 정합성 · 접근성 가드", () => {
  it("CSS 파일이 실존하고 apps/web/src/app/main.tsx에서 unified-theme-contract.css 이후에 연결된다", () => {
    expect(existsSync(CSS_PATH)).toBe(true);
    const mainSource = readFileSync(MAIN_PATH, "utf8");
    expect(mainSource).toContain('import "./styles/spectrum-editorial-theme.css";');
    expect(mainSource.indexOf("unified-theme-contract.css")).toBeLessThan(
      mainSource.indexOf("spectrum-editorial-theme.css"),
    );
  });

  it("두 에디토리얼 팔레트 스코프와 5대 도메인 스코프 바인딩이 CSS에 모두 선언되어 있다", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    expect(css).toContain('[data-spectrum-palette="editorial-vivid"]');
    expect(css).toContain('[data-spectrum-palette="editorial-paper"]');
    for (const domainId of SPECTRUM_DOMAIN_IDS) {
      expect(css).toContain(`[data-spectrum-domain="${domainId}"]`);
      expect(css).toContain(`--spectrum-pigment-${domainId}:`);
    }
  });

  it("1.5px 멀티 안료 헤어라인(.spectrum-editorial-hairline)과 갤러리 액자(.spectrum-gallery-frame)가 금지 슬롭 없이 정의된다", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    expect(css).toContain(".spectrum-editorial-hairline");
    expect(css).toContain("--spectrum-hairline-thickness: 1.5px;");
    expect(css).toContain(".spectrum-gallery-frame");
    expect(css).not.toMatch(/transition\s*:\s*all\b/iu);
    expect(css).not.toMatch(/@keyframes\s+spin\b/iu);
  });

  it("CSS 팔레트 블록의 OKLCH 표면·안료 값이 TypeScript 정본 토큰과 1:1 일치한다", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    for (const paletteId of SPECTRUM_PALETTE_IDS) {
      const spec = SPECTRUM_EDITORIAL_PALETTES[paletteId];
      const block = extractScopeBlock(css, `[data-spectrum-palette="${paletteId}"]`);
      expect(block).toContain(`--spectrum-surface-canvas: ${spec.surfaces.canvas};`);
      expect(block).toContain(`--spectrum-surface-panel: ${spec.surfaces.panel};`);
      expect(block).toContain(`--spectrum-surface-card: ${spec.surfaces.card};`);
      expect(block).toContain(`--spectrum-surface-raised: ${spec.surfaces.raised};`);
      expect(block).toContain(`--spectrum-line-strong: ${spec.lines.strong};`);
      expect(block).toContain(`--spectrum-fg: ${spec.ink.fg};`);
      expect(block).toContain(`--spectrum-fg-2: ${spec.ink.fg2};`);
      expect(block).toContain(`--spectrum-fg-3: ${spec.ink.fg3};`);
      expect(block).toContain(`--spectrum-on-accent: ${spec.ink.onAccent};`);

      const variantKey = spec.mode === "dark" ? "vivid" : "paper";
      for (const domainId of SPECTRUM_DOMAIN_IDS) {
        const pigment = SPECTRUM_DOMAIN_PIGMENTS[domainId][variantKey];
        expect(block).toContain(`--spectrum-pigment-${domainId}: ${pigment.ink};`);
        expect(block).toContain(`--spectrum-pigment-${domainId}-soft: ${pigment.soft};`);
        expect(block).toContain(`--spectrum-pigment-${domainId}-border: ${pigment.border};`);
        expect(block).toContain(`--spectrum-pigment-${domainId}-on: ${pigment.onPigment};`);
      }
    }
  });

  it("prefers-reduced-motion · prefers-contrast · forced-colors · contrast 테마 가드가 모두 존재한다", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("transition: none !important;");
    expect(css).toContain("@media (prefers-contrast: more)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("background-color: Canvas;");
    expect(css).toContain("color: CanvasText;");
    expect(css).toContain(':root[data-design-theme="contrast"]');
  });

  it("기존 9개 data-design-theme 계약과 디스플레이 헤딩 크기 토큰을 덮어쓰지 않는다", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    for (const legacyTheme of [
      "aurora",
      "blossom",
      "starlight",
      "dark",
      "light",
      "graphite",
      "midnight",
      "sepia",
    ]) {
      expect(css).not.toContain(`data-design-theme="${legacyTheme}"`);
    }
    expect(css).not.toContain("--site-heading-size");
    expect(css).not.toContain("--site-section-title-size");
    expect(css).not.toContain("--ui-palette-");
  });
});
