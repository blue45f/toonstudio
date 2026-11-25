// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATELIER_BRUSH_GRAIN_SWATCHES,
  ATELIER_SURFACE_THEMES,
  DEFAULT_DETENT_STEP_DEG,
  RHYTHM_BASE_UNIT_PX,
  StudioAtelierVisualSignaturePanel,
  VIOLET_HUE_MAX,
  VIOLET_HUE_MIN,
  auditAllThemesContrast,
  auditConcentricGeometry,
  auditThemeTypographyContrast,
  auditVioletZeroPolicy,
  buildAtelierVisualSignatureSnapshot,
  computeApcaPerceptualContrastLc,
  computeRelativeLuminanceY,
  computeWcagContrastRatio,
  evaluateRotaryDialDetent,
  exportAtelierDesignTokensCss,
  exportVisualSignatureJson,
  formatOklch,
  getAtelierSurfaceTheme,
  getBrushGrainSwatch,
  isForbiddenVioletHue,
  normalizeHue,
  oklchToLinearSrgb,
  sanitizeNonVioletHue,
  type AtelierSurfaceThemeId,
  type BrushGrainSwatchId,
} from "./index";

afterEach(cleanup);

function assertZeroRawColorsAndZeroViolet(markup: string): void {
  expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(markup).not.toMatch(/\brgba?\s*\(/iu);
  expect(markup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const match of markup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isForbiddenVioletHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 4종 정본 아틀리에 3단 표면 사다리 & OKLCH 무바이올렛 정책", () => {
  it("ATELIER_SURFACE_THEMES가 정본 4종 테마를 순서대로 제공한다", () => {
    expect(ATELIER_SURFACE_THEMES.map((t) => t.id)).toEqual([
      "warm-alabaster",
      "ink-obsidian",
      "hanok-sepia",
      "wcag-aaa-ultra",
    ]);
  });

  it("4종 테마의 포인트 휴 각도가 명세(158° · 72° · 42° · 78°)와 일치하고 바이올렛을 배제한다", () => {
    expect(ATELIER_SURFACE_THEMES.map((t) => t.accentHueDeg)).toEqual([158, 72, 42, 78]);
    for (const theme of ATELIER_SURFACE_THEMES) {
      expect(theme.accent.h).toBe(theme.accentHueDeg);
      expect(isForbiddenVioletHue(theme.accent.h)).toBe(false);
    }
  });

  it("3단 표면 사다리 명도가 라이트(린넨<종이<인스트루먼트)·다크(바탕<패널<인스트루먼트) 계층을 유지한다", () => {
    for (const theme of ATELIER_SURFACE_THEMES) {
      expect(theme.ladder).toHaveLength(3);
      if (theme.polarity === "light") {
        expect(theme.panel.l).toBeLessThan(theme.canvas.l);
        expect(theme.canvas.l).toBeLessThan(theme.instrument.l);
      } else {
        expect(theme.canvas.l).toBeLessThan(theme.panel.l);
        expect(theme.panel.l).toBeLessThan(theme.instrument.l);
      }
    }
    expect(getAtelierSurfaceTheme("ink-obsidian").glareReductionPercent).toBe(100);
    expect(getAtelierSurfaceTheme("hanok-sepia").blueLightAttenuationPercent).toBeGreaterThanOrEqual(65);
  });

  it("auditVioletZeroPolicy가 4종 테마와 5종 브러시 스와치 전 토큰에서 바이올렛 0건을 검증한다", () => {
    const audit = auditVioletZeroPolicy();
    expect(audit.inspectedTokenCount).toBe(4 * 13 + 5 * 3);
    expect(audit.violetTokenCount).toBe(0);
    expect(audit.violetPercent).toBe(0);
    expect(audit.passed).toBe(true);
  });

  it("normalizeHue · isForbiddenVioletHue · sanitizeNonVioletHue가 경계값과 비유한 수치를 안전 처리한다", () => {
    expect(VIOLET_HUE_MIN).toBe(270);
    expect(VIOLET_HUE_MAX).toBe(320);
    expect(normalizeHue(-30)).toBe(330);
    expect(normalizeHue(402)).toBe(42);
    expect(normalizeHue(Number.NaN)).toBe(0);
    expect(isForbiddenVioletHue(270)).toBe(true);
    expect(isForbiddenVioletHue(295)).toBe(true);
    expect(isForbiddenVioletHue(320)).toBe(true);
    expect(isForbiddenVioletHue(269.9)).toBe(false);
    expect(isForbiddenVioletHue(320.1)).toBe(false);
    expect(isForbiddenVioletHue(sanitizeNonVioletHue(280))).toBe(false);
    expect(isForbiddenVioletHue(sanitizeNonVioletHue(315))).toBe(false);
  });

  it("formatOklch가 바이올렛 입력을 자동 정화하고 알파 포맷을 결정론적으로 생성한다", () => {
    expect(formatOklch({ l: 0.979, c: 0.008, h: 92 })).toBe("oklch(0.979 0.008 92)");
    expect(formatOklch({ l: 0.5, c: 0.14, h: 290 }, 0.25)).toBe("oklch(0.5 0.14 245 / 0.25)");
    expect(formatOklch({ l: 1.4, c: -0.2, h: Number.POSITIVE_INFINITY })).toBe("oklch(1 0 0)");
  });

  it("조회 헬퍼가 미등록 테마·스와치 ID 입력에 기본값으로 안전 폴백한다", () => {
    expect(getAtelierSurfaceTheme("unknown-theme" as AtelierSurfaceThemeId).id).toBe("warm-alabaster");
    expect(getBrushGrainSwatch("unknown-swatch" as BrushGrainSwatchId).id).toBe("hanji-mulberry");
    expect(ATELIER_BRUSH_GRAIN_SWATCHES).toHaveLength(5);
  });
});

describe("2. WCAG 2.2 상대 휘도 대비비 & APCA(Lc) 지각 대비 수학 검증", () => {
  it("oklchToLinearSrgb와 computeRelativeLuminanceY가 흑(0)·백(1) 및 단조 증가를 만족한다", () => {
    const black = { l: 0, c: 0, h: 90 };
    const mid = { l: 0.55, c: 0, h: 90 };
    const white = { l: 1, c: 0, h: 90 };
    expect(oklchToLinearSrgb(black)).toEqual([0, 0, 0]);
    expect(computeRelativeLuminanceY(black)).toBe(0);
    expect(computeRelativeLuminanceY(white)).toBe(1);
    expect(computeRelativeLuminanceY(mid)).toBeGreaterThan(0.1);
    expect(computeRelativeLuminanceY(mid)).toBeLessThan(0.4);
  });

  it("computeWcagContrastRatio가 흑백 21:1 · 동일색 1:1 · 대칭성을 정확히 만족한다", () => {
    const black = { l: 0, c: 0, h: 90 };
    const white = { l: 1, c: 0, h: 90 };
    const forest = { l: 0.41, c: 0.112, h: 158 };
    expect(computeWcagContrastRatio(black, white)).toBe(21);
    expect(computeWcagContrastRatio(forest, forest)).toBe(1);
    expect(computeWcagContrastRatio(forest, white)).toBe(computeWcagContrastRatio(white, forest));
  });

  it("computeApcaPerceptualContrastLc가 밝은 배경(양수)·어두운 배경(음수)·동일색(0) 극성을 정확히 구분한다", () => {
    const black = { l: 0, c: 0, h: 90 };
    const white = { l: 1, c: 0, h: 90 };
    expect(computeApcaPerceptualContrastLc(black, white)).toBeGreaterThan(100);
    expect(computeApcaPerceptualContrastLc(white, black)).toBeLessThan(-100);
    expect(computeApcaPerceptualContrastLc(white, white)).toBe(0);
  });

  it("warm-alabaster 전 역할(본문·캡션·버튼·포커스 링·포인트)이 WCAG AA 및 APCA 목표를 통과한다", () => {
    const audit = auditThemeTypographyContrast("warm-alabaster");
    expect(audit.rows).toHaveLength(5);
    expect(audit.allPassAa).toBe(true);
    expect(audit.allMeetThemeTarget).toBe(true);
    expect(audit.worstWcagRatio).toBeGreaterThanOrEqual(4.5);
    expect(audit.worstApcaAbsLc).toBeGreaterThanOrEqual(60);
  });

  it("ink-obsidian 야간 테마가 전 항목 WCAG AA 및 어두운 배경 음수 APCA 극성을 충족한다", () => {
    const audit = auditThemeTypographyContrast("ink-obsidian");
    expect(audit.allPassAa).toBe(true);
    expect(audit.allMeetThemeTarget).toBe(true);
    const body = audit.rows.find((r) => r.roleId === "body");
    expect(body?.apcaLc).toBeLessThan(-85);
    expect(body?.wcagContrastRatio).toBeGreaterThanOrEqual(15);
  });

  it("hanok-sepia 한지 세피아 테마가 전 항목 WCAG AA 및 APCA 기준을 통과한다", () => {
    const audit = auditThemeTypographyContrast("hanok-sepia");
    expect(audit.allPassAa).toBe(true);
    expect(audit.allMeetThemeTarget).toBe(true);
    expect(audit.worstWcagRatio).toBeGreaterThanOrEqual(7.0);
  });

  it("wcag-aaa-ultra 초고대비 테마가 전 항목 WCAG AAA(>=7:1)와 APCA |Lc|>=75를 동시 달성한다", () => {
    const audit = auditThemeTypographyContrast("wcag-aaa-ultra");
    expect(audit.contrastStandard).toBe("WCAG-AAA");
    expect(audit.allPassAaa).toBe(true);
    expect(audit.allMeetThemeTarget).toBe(true);
    expect(audit.worstWcagRatio).toBeGreaterThanOrEqual(7.0);
    expect(audit.worstApcaAbsLc).toBeGreaterThanOrEqual(75);
    for (const row of audit.rows) {
      expect(row.grade).toBe("AAA");
      expect(row.passesAaa).toBe(true);
      expect(row.passesApcaTarget).toBe(true);
    }
  });

  it("auditAllThemesContrast가 4종 테마 전체의 목표 통과율 100%를 반환한다", () => {
    const audits = auditAllThemesContrast();
    expect(audits).toHaveLength(4);
    expect(audits.every((a) => a.allMeetThemeTarget)).toBe(true);
  });
});

describe("3. 동심원 곡률(R_out = R_in + P) · 8pt 리듬 · 85/10/5 시각 위계 감사", () => {
  it("기본 표준 규격(inner=12, padding=8)이 외곽 R20 · 오차 0px · 8pt 리듬 일치를 반환한다", () => {
    const audit = auditConcentricGeometry({ innerRadiusPx: 12, paddingPx: 8 });
    expect(audit.outerRadiusPx).toBe(20);
    expect(audit.errorPx).toBe(0);
    expect(audit.isConcentricExact).toBe(true);
    expect(audit.is8ptRhythmAligned).toBe(true);
    expect(audit.rhythmUnitPx).toBe(RHYTHM_BASE_UNIT_PX);
    expect(audit.controlRadiusPx).toBe(8);
    expect(audit.geometryScore).toBe(100);
  });

  it("다양한 (innerRadiusPx, paddingPx) 조합에서 자동 유도 외곽 곡률 오차가 항상 0px이다", () => {
    for (const [inner, pad] of [
      [8, 8],
      [12, 16],
      [16, 8],
      [20, 16],
    ] as const) {
      const audit = auditConcentricGeometry({ innerRadiusPx: inner, paddingPx: pad });
      expect(audit.outerRadiusPx).toBe(inner + pad);
      expect(audit.errorPx).toBe(0);
      expect(audit.isConcentricExact).toBe(true);
    }
  });

  it("외곽 곡률이 어긋난 입력을 주면 정확한 오차(errorPx)와 권장 외곽 곡률을 산출한다", () => {
    const audit = auditConcentricGeometry({ innerRadiusPx: 12, paddingPx: 8, outerRadiusPx: 25 });
    expect(audit.isConcentricExact).toBe(false);
    expect(audit.errorPx).toBe(5);
    expect(audit.recommendedOuterRadiusPx).toBe(20);
    expect(audit.geometryScore).toBeLessThan(70);
  });

  it("8pt 그리드를 벗어난 패딩(7px)을 감지하고 권장 8pt 패딩을 제시한다", () => {
    const audit = auditConcentricGeometry({ innerRadiusPx: 12, paddingPx: 7 });
    expect(audit.isPaddingOn4ptGrid).toBe(false);
    expect(audit.isPaddingOn8ptGrid).toBe(false);
    expect(audit.is8ptRhythmAligned).toBe(false);
    expect(audit.recommended8ptPaddingPx).toBe(8);
  });

  it("4pt 반박 패딩(12px)은 4pt 통과 · 8pt 미일치로 세분화 판정한다", () => {
    const audit = auditConcentricGeometry({ innerRadiusPx: 8, paddingPx: 12 });
    expect(audit.isPaddingOn4ptGrid).toBe(true);
    expect(audit.isPaddingOn8ptGrid).toBe(false);
    expect(audit.is8ptRhythmAligned).toBe(false);
    expect(audit.errorPx).toBe(0);
  });

  it("85/10/5 시각 면적 균형 기본값은 통과하고 과잉 포인트(20%) 배치는 실패를 보고한다", () => {
    const okAudit = auditConcentricGeometry({ innerRadiusPx: 12, paddingPx: 8 });
    expect(okAudit.visualBalance.passesBalanceRule).toBe(true);
    expect(okAudit.visualBalance.totalPercent).toBe(100);

    const badAudit = auditConcentricGeometry({
      innerRadiusPx: 12,
      paddingPx: 8,
      neutralSurfacePercent: 60,
      inkChromePercent: 20,
      accentSignalPercent: 20,
    });
    expect(badAudit.visualBalance.passesBalanceRule).toBe(false);
    expect(badAudit.visualBalance.neutralDeficitPercent).toBe(25);
    expect(badAudit.visualBalance.accentExcessPercent).toBe(15);
  });

  it("비유한·음수 기하 입력을 안전하게 클램프해 예외 없이 감사를 완료한다", () => {
    const audit = auditConcentricGeometry({
      innerRadiusPx: Number.NaN,
      paddingPx: -10,
      controlGapPx: Number.POSITIVE_INFINITY,
    });
    expect(audit.innerRadiusPx).toBe(2);
    expect(audit.paddingPx).toBe(0);
    expect(audit.outerRadiusPx).toBe(2);
    expect(audit.errorPx).toBe(0);
  });
});

describe("4. 카메라 렌즈형 15° 로터리 다이얼 디텐트 & 관성 스냅 물리 모델", () => {
  it("기본 15° 디텐트가 24개 눈금과 4개 90° 주각(cardinal)을 정확히 생성한다", () => {
    const dial = evaluateRotaryDialDetent({ rawAngleDeg: 0 });
    expect(dial.detentStepDeg).toBe(DEFAULT_DETENT_STEP_DEG);
    expect(dial.tickMarks).toHaveLength(24);
    expect(dial.tickMarks.filter((t) => t.kind === "cardinal").map((t) => t.angleDeg)).toEqual([
      0, 90, 180, 270,
    ]);
  });

  it("스냅 창(6°) 이내 각도는 가장 가까운 15° 디텐트로 자석 스냅된다", () => {
    const near15 = evaluateRotaryDialDetent({ rawAngleDeg: 18, snapEnabled: true });
    expect(near15.snappedAngleDeg).toBe(15);
    expect(near15.detentEngaged).toBe(true);
    expect(near15.hapticPulseStrength).toBeGreaterThan(0);

    const freeMid = evaluateRotaryDialDetent({ rawAngleDeg: 22, snapEnabled: false });
    expect(freeMid.snappedAngleDeg).toBe(22);
    expect(freeMid.detentEngaged).toBe(false);
    expect(freeMid.hapticPulseStrength).toBe(0);
  });

  it("각속도 관성 플릭(120°/s · 360°/s)이 감쇠 시정수(65ms)로 다음 15° 디텐트에 안착한다", () => {
    const lightTick = evaluateRotaryDialDetent({ rawAngleDeg: 10, angularVelocityDegPerSec: 120 });
    expect(lightTick.projectedAngleDeg).toBeCloseTo(17.8, 1);
    expect(lightTick.snappedAngleDeg).toBe(15);
    expect(lightTick.detentEngaged).toBe(true);

    const fastFlick = evaluateRotaryDialDetent({ rawAngleDeg: 10, angularVelocityDegPerSec: 360 });
    expect(fastFlick.projectedAngleDeg).toBeCloseTo(33.4, 1);
    expect(fastFlick.snappedAngleDeg).toBe(30);
    expect(fastFlick.detentEngaged).toBe(true);
  });

  it("90° 주각(0° · 90° · 180° · -90°)에서 최대 틱 강도(1.0)와 isCardinal90을 보고한다", () => {
    for (const deg of [0, 90, 180, -90]) {
      const dial = evaluateRotaryDialDetent({ rawAngleDeg: deg });
      expect(dial.isCardinal90).toBe(true);
      expect(dial.hapticPulseStrength).toBe(1);
    }
    const nonCardinal = evaluateRotaryDialDetent({ rawAngleDeg: 15 });
    expect(nonCardinal.isCardinal90).toBe(false);
    expect(nonCardinal.hapticPulseStrength).toBeLessThan(1);
  });

  it("줌 배율 곡선이 -180°(25%) → 0°(100%) → +180°(800%)로 단조 증가하고 tabular 리드아웃을 포맷한다", () => {
    const minZoom = evaluateRotaryDialDetent({ rawAngleDeg: -180 });
    const homeZoom = evaluateRotaryDialDetent({ rawAngleDeg: 0 });
    const maxZoom = evaluateRotaryDialDetent({ rawAngleDeg: 180 });
    expect(minZoom.zoomPercent).toBe(25);
    expect(homeZoom.zoomPercent).toBe(100);
    expect(maxZoom.zoomPercent).toBe(800);
    expect(evaluateRotaryDialDetent({ rawAngleDeg: 45 }).readoutAngleText).toBe("+045.0°");
    expect(evaluateRotaryDialDetent({ rawAngleDeg: -30 }).readoutAngleText).toBe("-030.0°");
  });

  it("비유한 각도 입력(NaN/Infinity)에서도 0° / 100%로 안전하게 폴백한다", () => {
    const dial = evaluateRotaryDialDetent({
      rawAngleDeg: Number.NaN,
      angularVelocityDegPerSec: Number.POSITIVE_INFINITY,
    });
    expect(dial.rawAngleDeg).toBe(0);
    expect(dial.snappedAngleDeg).toBe(0);
    expect(dial.zoomPercent).toBe(100);
  });
});

describe("5. CSS 디자인 토큰 & JSON 내보내기 계약", () => {
  it("exportAtelierDesignTokensCss가 순수 OKLCH 변수와 3단 사다리·동심원·다이얼 토큰을 생성한다", () => {
    const snap = buildAtelierVisualSignatureSnapshot({
      themeId: "warm-alabaster",
      innerRadiusPx: 12,
      paddingPx: 8,
      rawAngleDeg: 30,
    });
    const css = exportAtelierDesignTokensCss(snap);
    expect(css).toContain(':root[data-atelier-theme="warm-alabaster"]');
    expect(css).toContain("--atelier-surface-canvas: oklch(");
    expect(css).toContain("--atelier-surface-panel: oklch(");
    expect(css).toContain("--atelier-surface-instrument: oklch(");
    expect(css).toContain("--atelier-radius-outer: 20px;");
    expect(css).toContain("--atelier-dial-angle: 30deg;");
    assertZeroRawColorsAndZeroViolet(css);
  });

  it("테마 전환 시 CSS 토큰의 포인트 휴(158 · 72 · 42 · 78)가 테마별로 정확히 바뀐다", () => {
    const expectedHues: readonly [AtelierSurfaceThemeId, number][] = [
      ["warm-alabaster", 158],
      ["ink-obsidian", 72],
      ["hanok-sepia", 42],
      ["wcag-aaa-ultra", 78],
    ];
    for (const [themeId, hue] of expectedHues) {
      const snap = buildAtelierVisualSignatureSnapshot({
        themeId,
        innerRadiusPx: 12,
        paddingPx: 8,
        rawAngleDeg: 0,
      });
      const css = exportAtelierDesignTokensCss(snap);
      expect(css).toMatch(new RegExp(`--atelier-accent: oklch\\([\\d.]+ [\\d.]+ ${hue}\\);`, "u"));
      assertZeroRawColorsAndZeroViolet(css);
    }
  });

  it("exportVisualSignatureJson이 스키마 버전·대비 감사·동심원·다이얼·바이올렛 0건을 구조화해 직렬화한다", () => {
    const snap = buildAtelierVisualSignatureSnapshot({
      themeId: "wcag-aaa-ultra",
      innerRadiusPx: 16,
      paddingPx: 16,
      rawAngleDeg: 45,
      brushSwatchId: "watercolor-rough",
    });
    const parsed = JSON.parse(exportVisualSignatureJson(snap)) as {
      schemaVersion: string;
      theme: { id: string; surfaceLadder: unknown[] };
      contrastAudit: { allPassAaa: boolean; worstWcagRatio: number; worstApcaAbsLc: number };
      concentricGeometry: { outerRadiusPx: number; errorPx: number; isConcentricExact: boolean };
      rotaryDial: { snappedAngleDeg: number; detentEngaged: boolean };
      activeBrushSwatch: { id: string; paperWeightGsm: number };
      violetZeroAudit: { violetTokenCount: number; passed: boolean };
    };
    expect(parsed.schemaVersion).toBe("toonstudio.atelier-visual-signature.v1");
    expect(parsed.theme.id).toBe("wcag-aaa-ultra");
    expect(parsed.theme.surfaceLadder).toHaveLength(3);
    expect(parsed.contrastAudit.allPassAaa).toBe(true);
    expect(parsed.contrastAudit.worstWcagRatio).toBeGreaterThanOrEqual(7);
    expect(parsed.contrastAudit.worstApcaAbsLc).toBeGreaterThanOrEqual(75);
    expect(parsed.concentricGeometry.outerRadiusPx).toBe(32);
    expect(parsed.concentricGeometry.errorPx).toBe(0);
    expect(parsed.rotaryDial.snappedAngleDeg).toBe(45);
    expect(parsed.activeBrushSwatch.id).toBe("watercolor-rough");
    expect(parsed.violetZeroAudit.violetTokenCount).toBe(0);
  });

  it("buildAtelierVisualSignatureSnapshot이 유효한 종합 점수와 무바이올렛 감사를 합성한다", () => {
    const snap = buildAtelierVisualSignatureSnapshot({
      themeId: "hanok-sepia",
      innerRadiusPx: 12,
      paddingPx: 8,
      rawAngleDeg: 90,
    });
    expect(snap.overallSignatureScore).toBe(100);
    expect(snap.violetAudit.passed).toBe(true);
    expect(snap.rotaryDial.isCardinal90).toBe(true);
  });
});

describe("6. StudioAtelierVisualSignaturePanel 라이브 UI 인터랙션 & 접근성 검증", () => {
  it("props 없이 기본 한글 로케일로 정상 렌더링되고 4종 테마·대비 표·2단 SVG를 표시한다", () => {
    render(<StudioAtelierVisualSignaturePanel />);
    expect(screen.getByTestId("atelier-visual-signature-panel")).toBeTruthy();
    expect(screen.getByTestId("atelier-sig-theme-warm-alabaster").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("atelier-sig-ladder-concentric-svg")).toBeTruthy();
    expect(screen.getByTestId("atelier-sig-dial-balance-svg")).toBeTruthy();
    expect(screen.getByTestId("atelier-sig-contrast-table").querySelectorAll("tbody tr")).toHaveLength(5);
  });

  it("4종 테마 카드 클릭 시 SVG 속성과 대비 배지가 즉시 바뀌고 onThemeChange 콜백이 호출된다", () => {
    const onThemeChange = vi.fn();
    render(<StudioAtelierVisualSignaturePanel onThemeChange={onThemeChange} />);

    fireEvent.click(screen.getByTestId("atelier-sig-theme-wcag-aaa-ultra"));
    expect(screen.getByTestId("atelier-sig-ladder-concentric-svg").getAttribute("data-theme-id")).toBe("wcag-aaa-ultra");
    expect(screen.getByTestId("atelier-sig-contrast-badge").textContent).toContain("WCAG-AAA");
    expect(onThemeChange).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("atelier-sig-theme-hanok-sepia"));
    expect(screen.getByTestId("atelier-sig-dial-balance-svg").getAttribute("data-theme-id")).toBe("hanok-sepia");
    expect(onThemeChange).toHaveBeenCalledTimes(2);
  });

  it("로터리 다이얼 스텝 버튼·슬라이더·관성 플릭·모드 전환이 각도와 스냅 상태를 실시간 갱신한다", () => {
    render(<StudioAtelierVisualSignaturePanel />);
    const dialSvg = screen.getByTestId("atelier-sig-dial-balance-svg");
    expect(dialSvg.getAttribute("data-snapped-angle")).toBe("15");

    fireEvent.click(screen.getByTestId("atelier-sig-dial-step-plus"));
    expect(dialSvg.getAttribute("data-snapped-angle")).toBe("30");

    fireEvent.click(screen.getByTestId("atelier-sig-dial-step-zero"));
    expect(dialSvg.getAttribute("data-snapped-angle")).toBe("0");

    fireEvent.change(screen.getByTestId("atelier-sig-dial-slider"), { target: { value: "44" } });
    expect(dialSvg.getAttribute("data-snapped-angle")).toBe("45");

    fireEvent.click(screen.getByTestId("atelier-sig-dial-mode-brush-angle"));
    expect(dialSvg.getAttribute("data-dial-mode")).toBe("brush-angle");

    fireEvent.click(screen.getByTestId("atelier-sig-flick-flick"));
    expect(Number(dialSvg.getAttribute("data-snapped-angle"))).toBeGreaterThan(45);
  });

  it("동심원 곡률 패딩·내부 곡률 슬라이더 및 프리셋 클릭이 외곽 곡률을 오차 0px로 동기화한다", () => {
    render(<StudioAtelierVisualSignaturePanel />);
    const ladderSvg = screen.getByTestId("atelier-sig-ladder-concentric-svg");
    expect(ladderSvg.getAttribute("data-outer-radius")).toBe("20");
    expect(ladderSvg.getAttribute("data-concentric-error")).toBe("0");

    fireEvent.click(screen.getByTestId("atelier-sig-preset-atelier"));
    expect(ladderSvg.getAttribute("data-inner-radius")).toBe("16");
    expect(ladderSvg.getAttribute("data-padding-px")).toBe("16");
    expect(ladderSvg.getAttribute("data-outer-radius")).toBe("32");
    expect(ladderSvg.getAttribute("data-concentric-error")).toBe("0");

    fireEvent.change(screen.getByTestId("atelier-sig-padding-slider"), { target: { value: "12" } });
    expect(ladderSvg.getAttribute("data-outer-radius")).toBe("28");
    expect(ladderSvg.getAttribute("data-concentric-error")).toBe("0");
  });

  it("5종 브러시 그레인 스와치 선택 시 활성 질감 메타와 상태 안내가 갱신된다", () => {
    render(<StudioAtelierVisualSignaturePanel />);
    fireEvent.click(screen.getByTestId("atelier-sig-swatch-charcoal-laid"));
    expect(screen.getByTestId("atelier-sig-swatch-charcoal-laid").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("atelier-sig-active-swatch-meta").textContent).toContain("260gsm");
    expect(screen.getByTestId("atelier-sig-status-banner").textContent).toContain("목탄 레이드지");
  });

  it("CSS 토큰 복사·JSON 탭 전환·미리보기 접기·초기화와 onExportCss 콜백이 정상 동작한다", () => {
    const onExportCss = vi.fn();
    render(<StudioAtelierVisualSignaturePanel onExportCss={onExportCss} />);

    expect(screen.queryByTestId("atelier-sig-token-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("atelier-sig-export-css-btn"));
    expect(onExportCss).toHaveBeenCalledTimes(1);
    expect(onExportCss.mock.calls[0]?.[0]).toContain("--atelier-surface-canvas: oklch(");
    expect(screen.getByTestId("atelier-sig-token-preview").getAttribute("data-format")).toBe("css");

    fireEvent.click(screen.getByTestId("atelier-sig-tab-json"));
    expect(screen.getByTestId("atelier-sig-token-preview").getAttribute("data-format")).toBe("json");
    expect(screen.getByTestId("atelier-sig-token-preview").textContent).toContain(
      "toonstudio.atelier-visual-signature.v1",
    );

    fireEvent.click(screen.getByTestId("atelier-sig-toggle-drawer-btn"));
    expect(screen.queryByTestId("atelier-sig-token-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("atelier-sig-theme-ink-obsidian"));
    fireEvent.click(screen.getByTestId("atelier-sig-reset-btn"));
    expect(screen.getByTestId("atelier-sig-ladder-concentric-svg").getAttribute("data-theme-id")).toBe("warm-alabaster");
  });

  it("영문 로케일(locale='en') · initialThemeId · className 선택 props를 정확히 반영한다", () => {
    render(
      <StudioAtelierVisualSignaturePanel
        locale="en"
        initialThemeId="ink-obsidian"
        className="custom-atelier-shell"
      />,
    );
    const panel = screen.getByTestId("atelier-visual-signature-panel");
    expect(panel.getAttribute("aria-label")).toContain("Atelier Hardware Visual Signature");
    expect(panel.className).toContain("custom-atelier-shell");
    expect(screen.getByTestId("atelier-sig-ladder-concentric-svg").getAttribute("data-theme-id")).toBe("ink-obsidian");
  });

  it("렌더된 모든 버튼이 min-h-11을 충족하고 2단 SVG에 원시 색·바이올렛(270~320°)이 0건이다", () => {
    const { container } = render(<StudioAtelierVisualSignaturePanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(20);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(2);
    for (const svg of svgs) {
      assertZeroRawColorsAndZeroViolet(svg.outerHTML);
    }
  });
});

describe("7. 엄격 품질·하네스 자가 검증 계약", () => {
  it("소유 파일 4종 존재, 줄 수 상한(engine<=720, panel<=680, all<=800) 및 금지 패턴 0건을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "atelier-visual-signature-engine.ts",
      "StudioAtelierVisualSignaturePanel.tsx",
      "index.ts",
      "atelier-visual-signature.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles).toHaveLength(4);

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "atelier-visual-signature-engine.ts") expect(lines).toBeLessThanOrEqual(720);
      if (file === "StudioAtelierVisualSignaturePanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "atelier-visual-signature.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공");
        expect(src).not.toContain("원활한 워크플로우를 보장");
      }

      if (file === "StudioAtelierVisualSignaturePanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("4종 테마 전환 후에도 SVG 출력에 원시 색상 및 바이올렛 휴(270~320°)가 0건이다", () => {
    const { container } = render(<StudioAtelierVisualSignaturePanel />);
    for (const theme of ATELIER_SURFACE_THEMES) {
      fireEvent.click(screen.getByTestId(`atelier-sig-theme-${theme.id}`));
      const ladderSvg = screen.getByTestId("atelier-sig-ladder-concentric-svg");
      const dialSvg = screen.getByTestId("atelier-sig-dial-balance-svg");
      assertZeroRawColorsAndZeroViolet(ladderSvg.outerHTML);
      assertZeroRawColorsAndZeroViolet(dialSvg.outerHTML);
    }
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2);
  });
});
