// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APCA_BODY_MIN_LC,
  APCA_UI_MIN_LC,
  EDITORIAL_MOODBOARD_PRESETS,
  EDITORIAL_MOODBOARD_PRESET_IDS,
  PIGMENT_ROLE_IDS,
  StudioEditorialMoodboardPanel,
  TARGET_CHROMATIC_RATIO,
  VIOLET_SLOP_HUE_MAX,
  VIOLET_SLOP_HUE_MIN,
  WCAG_AA_MIN_CONTRAST,
  auditChromaticBalance,
  autoRepairPaletteContrast,
  buildCspSwatchBytes,
  buildEditorialPosterSvg,
  clampOklch,
  classifyWcagGrade,
  computeApcaContrast,
  computeRelativeLuminance,
  computeWcagContrastRatio,
  exportPaletteCspSwatch,
  exportPaletteCssVariables,
  exportPaletteOklchJson,
  formatOklch,
  formatOklchCompact,
  getEditorialMoodboardPreset,
  isHueInVioletExclusionZone,
  isVioletSlopColor,
  normalizeHue,
  oklchToLinearSrgb,
  oklchToSrgb255,
  rebalanceRatioTriple,
  suggestSafeEditorialHue,
} from "./index";

afterEach(cleanup);

describe("1. 8대 탈-바이올렛 에디토리얼 아틀리에 프리셋 전수 무결성", () => {
  it("8대 프리셋 ID가 명세 순서대로 정확히 등록되며 라이트 4종·다크 4종으로 균형을 이룬다", () => {
    expect(EDITORIAL_MOODBOARD_PRESET_IDS).toEqual([
      "seoul-vermilion-ink",
      "kyoto-lacquer-gold",
      "youth-cobalt-citrus",
      "rofan-emerald-champagne",
      "noir-obsidian-amber",
      "slice-terracotta-mint",
      "fantasy-viridian-copper",
      "hanok-dancheong-hanji",
    ]);
    expect(EDITORIAL_MOODBOARD_PRESETS).toHaveLength(8);

    const lightCount = EDITORIAL_MOODBOARD_PRESETS.filter((p) => p.polarity === "light").length;
    const darkCount = EDITORIAL_MOODBOARD_PRESETS.filter((p) => p.polarity === "dark").length;
    expect(lightCount).toBe(4);
    expect(darkCount).toBe(4);
  });

  it("8대 프리셋의 40개 안료와 8개 onAccent 색상이 단 하나도 270~320도 바이올렛 구간에 걸치지 않는다", () => {
    for (const preset of EDITORIAL_MOODBOARD_PRESETS) {
      for (const role of PIGMENT_ROLE_IDS) {
        const pigment = preset.pigments[role];
        expect(isHueInVioletExclusionZone(pigment.color.h)).toBe(false);
        expect(isVioletSlopColor(pigment.color)).toBe(false);
      }
      expect(isHueInVioletExclusionZone(preset.onAccent.h)).toBe(false);
      expect(isVioletSlopColor(preset.onAccent)).toBe(false);
    }
  });

  it("8대 프리셋 모두 기본 85/10/5 감사에서 바이올렛 0%·WCAG 4.5:1+·APCA 통과·100점을 달성한다", () => {
    for (const presetId of EDITORIAL_MOODBOARD_PRESET_IDS) {
      const report = auditChromaticBalance({ presetId });
      expect(report.isVioletFree).toBe(true);
      expect(report.violetSlopPct).toBe(0);
      expect(report.violetViolations).toHaveLength(0);
      expect(report.allPairsPassWcagAa).toBe(true);
      expect(report.minWcagRatio).toBeGreaterThanOrEqual(WCAG_AA_MIN_CONTRAST);
      expect(report.allPairsPassApca).toBe(true);
      expect(report.minApcaAbsLc).toBeGreaterThanOrEqual(APCA_UI_MIN_LC);
      expect(report.warnings).toHaveLength(0);
      expect(report.overallScore).toBe(100);
    }
  });

  it("8대 프리셋의 모든 본문 먹/바탕 쌍은 WCAG AAA(7.0:1+) 및 APCA 본문 기준(Lc 60+)을 충족한다", () => {
    for (const presetId of EDITORIAL_MOODBOARD_PRESET_IDS) {
      const report = auditChromaticBalance({ presetId });
      const bodyPair = report.contrastPairs.find((p) => p.pairId === "ink-on-ground");
      expect(bodyPair).toBeDefined();
      expect(bodyPair?.wcagRatio).toBeGreaterThanOrEqual(7.0);
      expect(bodyPair?.wcagGrade).toBe("AAA");
      expect(bodyPair?.apcaAbsLc).toBeGreaterThanOrEqual(APCA_BODY_MIN_LC);
    }
  });

  it("8대 프리셋의 5안료가 모두 유효한 0..255 sRGB 채널로 변환되고 sRGB 색역 경계 안에 있다", () => {
    for (const preset of EDITORIAL_MOODBOARD_PRESETS) {
      for (const role of PIGMENT_ROLE_IDS) {
        const srgb = oklchToSrgb255(preset.pigments[role].color);
        expect(srgb.inGamut).toBe(true);
        expect(srgb.r).toBeGreaterThanOrEqual(0);
        expect(srgb.r).toBeLessThanOrEqual(255);
        expect(srgb.g).toBeGreaterThanOrEqual(0);
        expect(srgb.g).toBeLessThanOrEqual(255);
        expect(srgb.b).toBeGreaterThanOrEqual(0);
        expect(srgb.b).toBeLessThanOrEqual(255);
      }
    }
  });

  it("getEditorialMoodboardPreset은 각 프리셋 ID를 정확히 조회한다", () => {
    const hanok = getEditorialMoodboardPreset("hanok-dancheong-hanji");
    expect(hanok.code).toBe("ATELIER-08");
    expect(hanok.nameKo).toContain("단청");
    const kyoto = getEditorialMoodboardPreset("kyoto-lacquer-gold");
    expect(kyoto.polarity).toBe("dark");
    expect(kyoto.pigments.accent.nameKo).toContain("금박");
  });
});

describe("2. OKLCH 색채 수학 · WCAG 2.1 · APCA W3 · 바이올렛 배제 경계", () => {
  it("normalizeHue, clampOklch, formatOklch, formatOklchCompact가 경계와 알파를 정규화한다", () => {
    expect(normalizeHue(-30)).toBe(330);
    expect(normalizeHue(405)).toBe(45);
    expect(clampOklch({ l: 1.5, c: -0.2, h: 740 })).toEqual({ l: 1, c: 0, h: 20 });
    expect(formatOklch({ l: 0.515, c: 0.195, h: 29 })).toBe("oklch(0.515 0.195 29)");
    expect(formatOklch({ l: 0.515, c: 0.195, h: 29, alpha: 0.25 })).toBe("oklch(0.515 0.195 29 / 0.25)");
    expect(formatOklchCompact({ l: 0.515, c: 0.195, h: 29.4 })).toBe("L0.52 C0.20 H29°");
  });

  it("WCAG 2.1 상대휘도와 명암비가 흑/백 21:1, 동일색 1:1 및 등급 경계를 정확히 계산한다", () => {
    const black = { l: 0, c: 0, h: 0 };
    const white = { l: 1, c: 0, h: 0 };
    expect(computeRelativeLuminance(black)).toBeCloseTo(0, 4);
    expect(computeRelativeLuminance(white)).toBeCloseTo(1, 4);
    expect(computeWcagContrastRatio(black, white)).toBe(21);
    expect(computeWcagContrastRatio(white, white)).toBe(1);
    expect(classifyWcagGrade(7.2)).toBe("AAA");
    expect(classifyWcagGrade(4.5)).toBe("AA");
    expect(classifyWcagGrade(3.1)).toBe("AA-Large");
    expect(classifyWcagGrade(2.4)).toBe("Fail");
  });

  it("APCA W3 지각 대비(Lc)가 라이트 바탕 양수 극성과 다크 바탕 음수 극성을 정확히 구분한다", () => {
    const darkInk = { l: 0.15, c: 0.01, h: 70 };
    const lightPaper = { l: 0.97, c: 0.01, h: 85 };
    const lcNormal = computeApcaContrast(darkInk, lightPaper);
    const lcReverse = computeApcaContrast(lightPaper, darkInk);
    expect(lcNormal).toBeGreaterThan(95);
    expect(lcReverse).toBeLessThan(-95);
    expect(computeApcaContrast(darkInk, darkInk)).toBe(0);
  });

  it("바이올렛 배제 구간(270~320도) 경계와 무채색 예외를 정확히 판정한다", () => {
    expect(VIOLET_SLOP_HUE_MIN).toBe(270);
    expect(VIOLET_SLOP_HUE_MAX).toBe(320);
    expect(isHueInVioletExclusionZone(269.9)).toBe(false);
    expect(isHueInVioletExclusionZone(270)).toBe(true);
    expect(isHueInVioletExclusionZone(295)).toBe(true);
    expect(isHueInVioletExclusionZone(320)).toBe(true);
    expect(isHueInVioletExclusionZone(320.1)).toBe(false);

    expect(isVioletSlopColor({ l: 0.6, c: 0, h: 290 })).toBe(false);
    expect(isVioletSlopColor({ l: 0.6, c: 0.015, h: 290 })).toBe(true);
    expect(isVioletSlopColor({ l: 0.55, c: 0.18, h: 254 })).toBe(false);
  });

  it("suggestSafeEditorialHue는 바이올렛 각도를 안전한 비-바이올렛 에디토리얼 앵커로 치환한다", () => {
    expect(isHueInVioletExclusionZone(suggestSafeEditorialHue(280))).toBe(false);
    expect(isHueInVioletExclusionZone(suggestSafeEditorialHue(312))).toBe(false);
    expect(suggestSafeEditorialHue(290, 29)).toBe(29);
  });

  it("oklchToLinearSrgb가 초고채도 색상의 sRGB 색역 초과를 감지하고 채널을 [0,1]로 클램프한다", () => {
    const outOfGamut = oklchToLinearSrgb({ l: 0.85, c: 0.35, h: 145 });
    expect(outOfGamut.inGamut).toBe(false);
    expect(outOfGamut.r).toBeGreaterThanOrEqual(0);
    expect(outOfGamut.g).toBeLessThanOrEqual(1);
    expect(outOfGamut.b).toBeGreaterThanOrEqual(0);
  });
});

describe("3. 85/10/5 색채 비율 감사기 · 바이올렛 슬롭 탐지 · 자동 보정 엔진", () => {
  it("85/10/5에서 크게 벗어난 비율(60/25/15)은 neutral-field-crowded, accent-overused 경고를 발생시킨다", () => {
    const report = auditChromaticBalance({
      presetId: "seoul-vermilion-ink",
      ratio: { neutralPct: 60, domainPct: 25, accentPct: 15 },
    });
    expect(report.ratio.status).toBe("imbalanced");
    expect(report.ratio.totalDeviationPct).toBe(25);
    expect(report.warnings.some((w) => w.code === "neutral-field-crowded")).toBe(true);
    expect(report.warnings.some((w) => w.code === "accent-overused")).toBe(true);
    expect(report.warnings.some((w) => w.code === "domain-imbalanced")).toBe(true);
    expect(report.overallScore).toBeLessThan(80);
  });

  it("합계가 100%가 아닌 입력 비율은 자동 정규화하고 ratio-sum-mismatch 안내를 기록한다", () => {
    const report = auditChromaticBalance({
      presetId: "noir-obsidian-amber",
      ratio: { neutralPct: 170, domainPct: 20, accentPct: 10 },
    });
    expect(report.ratio.rawSumPct).toBe(130);
    expect(report.warnings.some((w) => w.code === "ratio-sum-mismatch")).toBe(true);
    const normSum =
      report.ratio.normalized.neutralPct +
      report.ratio.normalized.domainPct +
      report.ratio.normalized.accentPct;
    expect(normSum).toBeCloseTo(100, 1);
  });

  it("rebalanceRatioTriple은 어느 슬라이더를 움직여도 합계 100%를 유지한다", () => {
    const afterNeutral = rebalanceRatioTriple("neutral", 76, TARGET_CHROMATIC_RATIO);
    expect(afterNeutral.neutralPct + afterNeutral.domainPct + afterNeutral.accentPct).toBe(100);
    const afterDomain = rebalanceRatioTriple("domain", 18, afterNeutral);
    expect(afterDomain.neutralPct + afterDomain.domainPct + afterDomain.accentPct).toBe(100);
    const afterAccent = rebalanceRatioTriple("accent", 12, afterDomain);
    expect(afterAccent.neutralPct + afterAccent.domainPct + afterAccent.accentPct).toBe(100);
  });

  it("안료 또는 extraSamples에 바이올렛(270~320도)이 유입되면 즉시 탐지하고 점수를 감점한다", () => {
    const report = auditChromaticBalance({
      presetId: "youth-cobalt-citrus",
      pigmentOverrides: { accent: { l: 0.55, c: 0.22, h: 292 } },
      extraSamples: [{ id: "extra-glow", labelKo: "보라 글로우", labelEn: "Violet Glow", color: { l: 0.62, c: 0.2, h: 305 } }],
    });
    expect(report.isVioletFree).toBe(false);
    expect(report.violetViolations).toHaveLength(2);
    expect(report.violetSlopPct).toBeGreaterThan(25);
    expect(report.warnings.some((w) => w.code === "violet-slop-detected")).toBe(true);
    expect(report.overallScore).toBeLessThan(60);
  });

  it("autoRepairPaletteContrast가 바이올렛 슬롭과 저대비 5안료를 라이트·다크 프리셋 모두에서 WCAG 4.5:1+로 복구한다", () => {
    const lightFix = autoRepairPaletteContrast(
      {
        presetId: "seoul-vermilion-ink",
        pigmentOverrides: {
          ink: { l: 0.72, c: 0.02, h: 70 },
          domain: { l: 0.82, c: 0.14, h: 285 },
          accent: { l: 0.78, c: 0.19, h: 300 },
        },
        ratio: { neutralPct: 62, domainPct: 24, accentPct: 14 },
      },
      { repairVioletSlop: true, rebalanceRatio: true },
    );
    expect(lightFix.beforeAudit.isVioletFree).toBe(false);
    expect(lightFix.beforeAudit.allPairsPassWcagAa).toBe(false);
    expect(lightFix.fullyRepaired).toBe(true);
    expect(lightFix.afterAudit.isVioletFree).toBe(true);
    expect(lightFix.afterAudit.allPairsPassWcagAa).toBe(true);
    expect(lightFix.afterAudit.minWcagRatio).toBeGreaterThanOrEqual(WCAG_AA_MIN_CONTRAST);
    expect(lightFix.afterAudit.ratio.normalized).toEqual(TARGET_CHROMATIC_RATIO);
    expect(lightFix.fixes.length).toBeGreaterThanOrEqual(4);

    const darkFix = autoRepairPaletteContrast(
      {
        presetId: "rofan-emerald-champagne",
        pigmentOverrides: {
          ground: { l: 0.52, c: 0.04, h: 168 },
          ink: { l: 0.44, c: 0.02, h: 88 },
          accent: { l: 0.42, c: 0.18, h: 288 },
        },
      },
      { repairVioletSlop: true },
    );
    expect(darkFix.fullyRepaired).toBe(true);
    expect(darkFix.afterAudit.isVioletFree).toBe(true);
    expect(darkFix.afterAudit.allPairsPassWcagAa).toBe(true);
    expect(darkFix.afterAudit.overallScore).toBeGreaterThan(darkFix.beforeAudit.overallScore);
  });

  it("이미 완벽한 기본 프리셋에 autoRepairPaletteContrast를 호출하면 불필요한 수정 0건으로 멱등 동작한다", () => {
    const result = autoRepairPaletteContrast({ presetId: "kyoto-lacquer-gold" });
    expect(result.fixes).toHaveLength(0);
    expect(result.fullyRepaired).toBe(true);
    expect(result.afterAudit.overallScore).toBe(100);
  });
});

describe("4. 순수 시맨틱 SVG 매거진 포스터 · CSS / OKLCH JSON / CSP Swatch 내보내기", () => {
  it("buildEditorialPosterSvg는 8대 프리셋 전체에서 원시 16진수·RGB·HSL 없이 oklch()와 currentColor만 사용한다", () => {
    for (const presetId of EDITORIAL_MOODBOARD_PRESET_IDS) {
      const report = auditChromaticBalance({ presetId });
      const svg = buildEditorialPosterSvg(report);
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain(`data-preset="${presetId}"`);
      expect(svg).toContain('data-violet-free="true"');
      expect(svg).toContain("oklch(");
      expect(svg).toContain("currentColor");
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(svg).not.toMatch(/\brgba?\s*\(/iu);
      expect(svg).not.toMatch(/\bhsla?\s*\(/iu);
    }
  });

  it("buildEditorialPosterSvg가 사용자 표제어의 XML 특수문자를 안전하게 이스케이프한다", () => {
    const report = auditChromaticBalance({ presetId: "seoul-vermilion-ink" });
    const svg = buildEditorialPosterSvg(report, { headline: '<먹선 & "인주">' });
    expect(svg).toContain("&lt;먹선 &amp; &quot;인주&quot;&gt;");
    expect(svg).not.toContain('<먹선');
  });

  it("exportPaletteCssVariables는 oklch 전용 CSS 변수와 85/10/5 비율 토큰을 생성한다", () => {
    const report = auditChromaticBalance({ presetId: "fantasy-viridian-copper" });
    const css = exportPaletteCssVariables(report);
    expect(css).toContain(':root[data-editorial-moodboard="fantasy-viridian-copper"]');
    expect(css).toContain("--moodboard-ground: oklch(");
    expect(css).toContain("--moodboard-accent: oklch(");
    expect(css).toContain("--moodboard-ratio-neutral: 85%;");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/\brgba?\s*\(/iu);
    expect(css).not.toMatch(/\bhsla?\s*\(/iu);
  });

  it("exportPaletteOklchJson은 5안료·바이올렛 배제·WCAG/APCA 결과를 정형 JSON으로 직렬화한다", () => {
    const report = auditChromaticBalance({ presetId: "slice-terracotta-mint" });
    const parsed = JSON.parse(exportPaletteOklchJson(report)) as {
      schemaVersion: string;
      pigments: { role: string; oklch: string }[];
      violetExclusion: { isVioletFree: boolean; excludedHueRangeDeg: number[] };
      contrast: { allPairsPassWcagAa: boolean; pairs: unknown[] };
    };
    expect(parsed.schemaVersion).toBe("toonstudio.editorial-moodboard-palette.v1");
    expect(parsed.pigments).toHaveLength(5);
    expect(parsed.pigments.every((p) => p.oklch.startsWith("oklch("))).toBe(true);
    expect(parsed.violetExclusion.isVioletFree).toBe(true);
    expect(parsed.violetExclusion.excludedHueRangeDeg).toEqual([270, 320]);
    expect(parsed.contrast.allPairsPassWcagAa).toBe(true);
    expect(parsed.contrast.pairs).toHaveLength(5);
  });

  it("exportPaletteCspSwatch와 buildCspSwatchBytes가 CSP SLCC 헤더 및 6개 스와치를 정확히 생성한다", () => {
    const report = auditChromaticBalance({ presetId: "hanok-dancheong-hanji" });
    const cspText = exportPaletteCspSwatch(report);
    const parsed = JSON.parse(cspText) as {
      schemaVersion: string;
      swatchCount: number;
      swatches: { role: string; channels255: { r: number; g: number; b: number; a: number } }[];
    };
    expect(parsed.schemaVersion).toBe("toonstudio.csp-swatch-set.v1");
    expect(parsed.swatchCount).toBe(6);
    expect(parsed.swatches).toHaveLength(6);

    const bytes = buildCspSwatchBytes(report);
    expect(bytes.byteLength).toBeGreaterThan(40);
    expect(Array.from(bytes.slice(0, 4))).toEqual([83, 76, 67, 67]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(6, false)).toBe(6);
  });
});

describe("5. StudioEditorialMoodboardPanel UI 통합 및 인터랙션", () => {
  it("Props 없이 단독 렌더되며 8종 프리셋 카드·바이올렛 0%·대비 4.5:1 배지·포스터 SVG를 표시한다", () => {
    render(<StudioEditorialMoodboardPanel />);

    expect(screen.getByTestId("studio-editorial-moodboard-panel")).toBeTruthy();
    for (const presetId of EDITORIAL_MOODBOARD_PRESET_IDS) {
      expect(screen.getByTestId(`moodboard-preset-${presetId}`)).toBeTruthy();
    }
    expect(screen.getByTestId("moodboard-violet-badge").getAttribute("data-violet-free")).toBe("true");
    expect(screen.getByTestId("moodboard-violet-badge").textContent).toContain("바이올렛 0%");
    expect(screen.getByTestId("moodboard-contrast-badge").getAttribute("data-wcag-pass")).toBe("true");
    expect(screen.getByTestId("moodboard-contrast-badge").textContent).toContain("4.5:1");
    expect(screen.getByTestId("moodboard-poster-svg").getAttribute("data-preset")).toBe("seoul-vermilion-ink");
  });

  it("8종 프리셋 카드 클릭 시 활성 프리셋·포스터 SVG·상태 배너가 즉시 전환된다", () => {
    render(<StudioEditorialMoodboardPanel />);

    fireEvent.click(screen.getByTestId("moodboard-preset-kyoto-lacquer-gold"));
    expect(screen.getByTestId("moodboard-preset-kyoto-lacquer-gold").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("moodboard-poster-svg").getAttribute("data-preset")).toBe("kyoto-lacquer-gold");
    expect(screen.getByTestId("moodboard-status-banner").textContent).toContain("옻칠");

    fireEvent.click(screen.getByTestId("moodboard-preset-hanok-dancheong-hanji"));
    expect(screen.getByTestId("moodboard-poster-svg").getAttribute("data-preset")).toBe("hanok-dancheong-hanji");
  });

  it("85/10/5 비율 슬라이더 조작과 황금비 복원 버튼이 비율 지표와 경고를 정확히 갱신한다", () => {
    render(<StudioEditorialMoodboardPanel />);

    fireEvent.change(screen.getByTestId("moodboard-slider-accent"), { target: { value: "18" } });
    expect(screen.getByTestId("moodboard-accent-readout").textContent).toBe("18%");
    expect(screen.getByTestId("moodboard-warning-accent-overused")).toBeTruthy();

    fireEvent.click(screen.getByTestId("moodboard-restore-ratio-btn"));
    expect(screen.getByTestId("moodboard-kpi-ratio").textContent).toBe("85 / 10 / 5%");
    expect(screen.queryByTestId("moodboard-warning-accent-overused")).toBeNull();
  });

  it("슬롭 주입 테스트 버튼과 자동 보정 버튼이 바이올렛 배지·대비 배지·보정 요약을 왕복 검증한다", () => {
    render(<StudioEditorialMoodboardPanel />);

    fireEvent.click(screen.getByTestId("moodboard-inject-slop-btn"));
    expect(screen.getByTestId("moodboard-violet-badge").getAttribute("data-violet-free")).toBe("false");
    expect(screen.getByTestId("moodboard-warning-violet-slop-detected")).toBeTruthy();
    expect(screen.getByTestId("moodboard-contrast-badge").getAttribute("data-wcag-pass")).toBe("false");

    fireEvent.click(screen.getByTestId("moodboard-autorepair-btn"));
    expect(screen.getByTestId("moodboard-violet-badge").getAttribute("data-violet-free")).toBe("true");
    expect(screen.getByTestId("moodboard-contrast-badge").getAttribute("data-wcag-pass")).toBe("true");
    expect(screen.getByTestId("moodboard-repair-summary")).toBeTruthy();
    expect(screen.queryByTestId("moodboard-warning-violet-slop-detected")).toBeNull();
  });

  it("5안료 색상환(H) 슬라이더를 295도로 이동하면 실시간 바이올렛 경고가 뜨고 초기화로 복원된다", () => {
    render(<StudioEditorialMoodboardPanel />);

    fireEvent.click(screen.getByTestId("moodboard-pigment-tab-domain"));
    fireEvent.change(screen.getByTestId("moodboard-pigment-h-slider"), { target: { value: "295" } });
    expect(screen.getByTestId("moodboard-violet-badge").getAttribute("data-violet-free")).toBe("false");

    fireEvent.click(screen.getByTestId("moodboard-reset-btn"));
    expect(screen.getByTestId("moodboard-violet-badge").getAttribute("data-violet-free")).toBe("true");
    expect(screen.getByTestId("moodboard-status-banner").textContent).toContain("초기 상태");
  });

  it("포스터 표제어 편집 입력이 실시간 SVG 포스터에 반영된다", () => {
    render(<StudioEditorialMoodboardPanel />);

    fireEvent.change(screen.getByTestId("moodboard-headline-input"), { target: { value: "화실 특별호" } });
    expect(screen.getByTestId("moodboard-poster-svg").textContent).toContain("화실 특별호");
  });

  it("CSS·JSON·CSP·SVG 복사 버튼과 내보내기 탭 전환이 콜백과 프리뷰를 정확히 구동한다", () => {
    const onAuditChange = vi.fn();
    const onExportCss = vi.fn();
    const onExportJson = vi.fn();
    const onExportCsp = vi.fn();
    const onExportSvg = vi.fn();

    render(
      <StudioEditorialMoodboardPanel
        onAuditChange={onAuditChange}
        onExportCss={onExportCss}
        onExportJson={onExportJson}
        onExportCsp={onExportCsp}
        onExportSvg={onExportSvg}
      />,
    );

    expect(onAuditChange).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("moodboard-copy-css-btn"));
    expect(onExportCss).toHaveBeenCalledTimes(1);
    expect(onExportCss.mock.calls[0]?.[0]).toContain("--moodboard-accent: oklch(");
    expect(screen.getByTestId("moodboard-export-preview").textContent).toContain("--moodboard-ground:");

    fireEvent.click(screen.getByTestId("moodboard-copy-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.editorial-moodboard-palette.v1");

    fireEvent.click(screen.getByTestId("moodboard-copy-csp-btn"));
    expect(onExportCsp).toHaveBeenCalledTimes(1);
    expect(onExportCsp.mock.calls[0]?.[0]).toContain("toonstudio.csp-swatch-set.v1");

    fireEvent.click(screen.getByTestId("moodboard-copy-svg-btn"));
    expect(onExportSvg).toHaveBeenCalledTimes(1);
    expect(onExportSvg.mock.calls[0]?.[0]).toContain('<svg xmlns="http://www.w3.org/2000/svg"');

    fireEvent.click(screen.getByTestId("moodboard-export-tab-hidden"));
    expect(screen.queryByTestId("moodboard-export-preview")).toBeNull();
  });

  it("영문 로케일(locale='en')과 초기 프리셋 prop을 정확히 렌더링한다", () => {
    render(<StudioEditorialMoodboardPanel locale="en" initialPresetId="noir-obsidian-amber" />);

    expect(screen.getByTestId("moodboard-violet-badge").textContent).toContain("Violet 0%");
    expect(screen.getByTestId("moodboard-copy-css-btn").textContent).toContain("Copy CSS");
    expect(screen.getByTestId("moodboard-poster-svg").getAttribute("data-preset")).toBe("noir-obsidian-amber");
    expect(screen.getByTestId("moodboard-poster-svg").textContent).toContain("NOIR AMBER");
  });
});

describe("6. 코드 위생 자가 검증 (파일 줄수 <= 800 · Calm Atelier · 금지 패턴 0건)", () => {
  it("4개 모듈 파일이 모두 800줄 이하이며 금지 패턴이 0건이고 필수 UX 클래스를 포함한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "editorial-moodboard-engine.ts",
      "StudioEditorialMoodboardPanel.tsx",
      "index.ts",
      "editorial-moodboard-palette.test.tsx",
    ];

    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles).toHaveLength(4);

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lineCount = src.split(/\r?\n/).length;
      expect(lineCount).toBeLessThanOrEqual(800);
      expect(src).not.toMatch(/:\s*any\b/u);
      expect(src).not.toMatch(/\bas\s+any\b/u);

      if (file !== "editorial-moodboard-palette.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      }

      if (file === "StudioEditorialMoodboardPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
