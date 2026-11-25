// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EXTERNAL_NAME_DETECTION_RULES,
  auditProprietaryBrandNaming,
} from "../atelier-brand-registry";

import {
  ATELIER_JEWEL_PIGMENTS,
  ATELIER_VIVID_PALETTES,
  ATELIER_VIVID_SCHEMA_VERSION,
  INK_RIPPLE_DURATION_MS,
  MAX_TILT_DEG,
  MIN_HIT_AREA_PX,
  PRIMARY_PRESS_SCALE,
  SPRING_PRESS_DURATION_MS,
  StudioAtelierVibrantUiPanel,
  TACTILE_BUTTON_VARIANTS,
  VIOLET_HUE_MAX,
  VIOLET_HUE_MIN,
  WCAG_AA_MIN_RATIO,
  auditAllVividPalettesContrast,
  auditPaletteContrast,
  buildAtelierVividSnapshot,
  buildDynamicMeshGradientCss,
  collectPaletteOklchTokens,
  computeApcaContrastLc,
  computeInkRippleDecay,
  computeMicroTheaterKinematics,
  computeRelativeLuminanceY,
  computeWcagContrastRatio,
  evaluateTactileButtonSpec,
  exportAtelierVividCssVariables,
  exportAtelierVividManifestJson,
  formatOklch,
  getAtelierVividPalette,
  isForbiddenVioletHue,
  normalizeHue,
  oklchToLinearSrgb,
  sanitizeNonVioletHue,
  verifyZeroVioletSlop,
  type AtelierVividPaletteId,
  type TactileInteractionState,
} from "./index";

afterEach(cleanup);

function assertZeroRawColorsAndZeroViolet(text: string): void {
  expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(text).not.toMatch(/\brgba?\s*\(/iu);
  expect(text).not.toMatch(/\bhsla?\s*\(/iu);
  for (const match of text.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isForbiddenVioletHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 화방 5원색 주얼 안료 · 5대 다이나믹 팔레트 & 바이올렛 0% 불변식", () => {
  it("ATELIER_JEWEL_PIGMENTS가 정본 5원색 안료와 휴 각도(158° · 236° · 24° · 76° · 86°)를 제공한다", () => {
    expect(ATELIER_JEWEL_PIGMENTS.map((p) => p.id)).toEqual([
      "emerald-botanical",
      "cobalt-ultramarine",
      "crimson-vermilion",
      "amber-ochre-gold",
      "porcelain-ivory",
    ]);
    expect(ATELIER_JEWEL_PIGMENTS.map((p) => p.hueDeg)).toEqual([158, 236, 24, 76, 86]);
  });

  it("ATELIER_VIVID_PALETTES가 5대 창작 컨텍스트와 극성을 순서대로 정의한다", () => {
    expect(ATELIER_VIVID_PALETTES.map((p) => p.id)).toEqual([
      "ink-atelier",
      "pigment-splash",
      "stage-cinema",
      "story-editorial",
      "night-studio-glow",
    ]);
    expect(ATELIER_VIVID_PALETTES.map((p) => p.polarity)).toEqual([
      "light",
      "light",
      "dark",
      "light",
      "dark",
    ]);
  });

  it("verifyZeroVioletSlop()이 전 팔레트·안료·메쉬·리본 토큰에서 바이올렛(265°~325°) 0%를 검증한다", () => {
    const audit = verifyZeroVioletSlop();
    expect(audit.minForbiddenHue).toBe(265);
    expect(audit.maxForbiddenHue).toBe(325);
    expect(audit.inspectedCount).toBeGreaterThanOrEqual(120);
    expect(audit.violetViolationCount).toBe(0);
    expect(audit.violetPercent).toBe(0);
    expect(audit.offendingTokens).toEqual([]);
    expect(audit.passed).toBe(true);
  });

  it("verifyZeroVioletSlop(customTokens)가 265°~325° 바이올렛 토큰 유입을 정확히 차단한다", () => {
    const audit = verifyZeroVioletSlop([
      { name: "safe-emerald", color: { l: 0.45, c: 0.14, h: 158 } },
      { name: "bad-low-edge", color: { l: 0.55, c: 0.18, h: 265 } },
      { name: "bad-mid-violet", color: { l: 0.58, c: 0.21, h: 292 } },
      { name: "bad-high-edge", color: { l: 0.6, c: 0.18, h: 325 } },
    ]);
    expect(audit.inspectedCount).toBe(4);
    expect(audit.violetViolationCount).toBe(3);
    expect(audit.violetPercent).toBe(75);
    expect(audit.passed).toBe(false);
    expect(audit.offendingTokens.map((t) => t.name)).toEqual([
      "bad-low-edge",
      "bad-mid-violet",
      "bad-high-edge",
    ]);
  });

  it("normalizeHue · isForbiddenVioletHue · sanitizeNonVioletHue가 경계값과 비유한 수치를 안전 처리한다", () => {
    expect(VIOLET_HUE_MIN).toBe(265);
    expect(VIOLET_HUE_MAX).toBe(325);
    expect(normalizeHue(-24)).toBe(336);
    expect(normalizeHue(518)).toBe(158);
    expect(normalizeHue(Number.NaN)).toBe(0);
    expect(isForbiddenVioletHue(264.9)).toBe(false);
    expect(isForbiddenVioletHue(265)).toBe(true);
    expect(isForbiddenVioletHue(295)).toBe(true);
    expect(isForbiddenVioletHue(325)).toBe(true);
    expect(isForbiddenVioletHue(325.1)).toBe(false);
    expect(isForbiddenVioletHue(sanitizeNonVioletHue(275))).toBe(false);
    expect(isForbiddenVioletHue(sanitizeNonVioletHue(318))).toBe(false);
  });

  it("formatOklch가 바이올렛 입력을 정화하고 알파 포맷 및 범위 클램프를 결정론적으로 처리한다", () => {
    expect(formatOklch({ l: 0.45, c: 0.145, h: 158 })).toBe("oklch(0.45 0.145 158)");
    expect(formatOklch({ l: 0.52, c: 0.16, h: 280 }, 0.35)).toBe("oklch(0.52 0.16 236 / 0.35)");
    expect(formatOklch({ l: 1.5, c: -0.1, h: Number.POSITIVE_INFINITY })).toBe("oklch(1 0 0)");
  });

  it("getAtelierVividPalette가 미등록 ID 입력에 기본 팔레트로 안전 폴백한다", () => {
    expect(getAtelierVividPalette("unknown-mood" as AtelierVividPaletteId).id).toBe("ink-atelier");
    expect(getAtelierVividPalette("stage-cinema").polarity).toBe("dark");
  });

  it("collectPaletteOklchTokens가 5원색 안료(15개) + 5대 팔레트(110개) = 125개 토큰을 전수 수집한다", () => {
    const tokens = collectPaletteOklchTokens();
    expect(tokens).toHaveLength(5 * 3 + 5 * 22);
  });
});

describe("2. 전 팔레트 텍스트·버튼 조합 WCAG 2.2 AA(>= 4.5:1) & APCA 자동 감사", () => {
  it("oklchToLinearSrgb와 computeRelativeLuminanceY가 흑(0)·백(1)·단조성을 만족한다", () => {
    const black = { l: 0, c: 0, h: 86 };
    const mid = { l: 0.56, c: 0, h: 86 };
    const white = { l: 1, c: 0, h: 86 };
    expect(oklchToLinearSrgb(black)).toEqual([0, 0, 0]);
    expect(computeRelativeLuminanceY(black)).toBe(0);
    expect(computeRelativeLuminanceY(white)).toBe(1);
    expect(computeRelativeLuminanceY(mid)).toBeGreaterThan(0.12);
    expect(computeRelativeLuminanceY(mid)).toBeLessThan(0.38);
  });

  it("computeWcagContrastRatio가 흑백 21:1 · 동일색 1:1 · 대칭성을 정확히 만족한다", () => {
    const black = { l: 0, c: 0, h: 86 };
    const white = { l: 1, c: 0, h: 86 };
    const cobalt = { l: 0.44, c: 0.168, h: 236 };
    expect(computeWcagContrastRatio(black, white)).toBe(21);
    expect(computeWcagContrastRatio(cobalt, cobalt)).toBe(1);
    expect(computeWcagContrastRatio(cobalt, white)).toBe(computeWcagContrastRatio(white, cobalt));
  });

  it("computeApcaContrastLc가 밝은 배경(양수)·어두운 배경(음수)·동일색(0)을 구분한다", () => {
    const black = { l: 0, c: 0, h: 86 };
    const white = { l: 1, c: 0, h: 86 };
    expect(computeApcaContrastLc(black, white)).toBeGreaterThan(100);
    expect(computeApcaContrastLc(white, black)).toBeLessThan(-100);
    expect(computeApcaContrastLc(white, white)).toBe(0);
  });

  it("ink-atelier · pigment-splash 라이트 팔레트 6개 역할 전부가 WCAG 2.2 AA(>= 4.5:1)를 통과한다", () => {
    for (const id of ["ink-atelier", "pigment-splash"] as const) {
      const audit = auditPaletteContrast(id);
      expect(audit.rows).toHaveLength(6);
      expect(audit.allPassAa).toBe(true);
      expect(audit.worstWcagRatio).toBeGreaterThanOrEqual(WCAG_AA_MIN_RATIO);
    }
  });

  it("stage-cinema · night-studio-glow 다크 팔레트가 전 항목 WCAG AA 및 음수 APCA 극성을 만족한다", () => {
    for (const id of ["stage-cinema", "night-studio-glow"] as const) {
      const audit = auditPaletteContrast(id);
      expect(audit.allPassAa).toBe(true);
      expect(audit.worstWcagRatio).toBeGreaterThanOrEqual(WCAG_AA_MIN_RATIO);
      const body = audit.rows.find((r) => r.roleId === "body-on-canvas");
      expect(body?.apcaLc).toBeLessThan(-80);
    }
  });

  it("story-editorial 에디토리얼 팔레트가 주홍 CTA·에메랄드 배지 포함 전 항목 AA 통과한다", () => {
    const audit = auditPaletteContrast("story-editorial");
    expect(audit.allPassAa).toBe(true);
    expect(audit.worstWcagRatio).toBeGreaterThanOrEqual(WCAG_AA_MIN_RATIO);
    const cta = audit.rows.find((r) => r.roleId === "primary-enamel");
    expect(cta?.wcagRatio).toBeGreaterThanOrEqual(WCAG_AA_MIN_RATIO);
  });

  it("auditAllVividPalettesContrast()가 5대 팔레트 30개 조합 전원의 AA 통과를 보장한다", () => {
    const audits = auditAllVividPalettesContrast();
    expect(audits).toHaveLength(5);
    expect(audits.every((a) => a.allPassAa && a.worstWcagRatio >= WCAG_AA_MIN_RATIO)).toBe(true);
  });
});

describe("3. 입체 에나멜 버튼 & 도구 배지 4단계 상태 물리 모델", () => {
  it("primary-enamel active 상태가 1px 스펙큘러·2단 섀도우·scale(0.97)·150ms 프레스를 반환한다", () => {
    const spec = evaluateTactileButtonSpec({
      variant: "primary-enamel",
      state: "active",
      paletteId: "ink-atelier",
    });
    expect(spec.topSpecularPx).toBe(1);
    expect(spec.innerBevelBorderPx).toBe(1);
    expect(spec.shadowLayerCount).toBe(2);
    expect(spec.scale).toBe(PRIMARY_PRESS_SCALE);
    expect(spec.durationMs).toBe(SPRING_PRESS_DURATION_MS);
    expect(spec.transformCss).toContain("scale(0.97)");
    expect(spec.boxShadowCss).toContain("inset 0 1px 0 oklch(");
    expect(spec.passesWcagAa).toBe(true);
  });

  it("secondary-ceramic focus 상태가 이중 포커스 링 섀도우와 AA 대비를 포함한다", () => {
    const spec = evaluateTactileButtonSpec({
      variant: "secondary-ceramic",
      state: "focus",
      paletteId: "pigment-splash",
    });
    expect(spec.scale).toBe(1);
    expect(spec.boxShadowCss).toContain("0 0 0 4px oklch(");
    expect(spec.passesWcagAa).toBe(true);
  });

  it("tool-jewel-badge 호버·프레스 상태가 보석 배지 물리(1.02 / 0.96)를 정확히 계산한다", () => {
    const hover = evaluateTactileButtonSpec({
      variant: "tool-jewel-badge",
      state: "hover",
      paletteId: "story-editorial",
    });
    const active = evaluateTactileButtonSpec({
      variant: "tool-jewel-badge",
      state: "active",
      paletteId: "story-editorial",
    });
    expect(hover.scale).toBe(1.02);
    expect(hover.translateYPx).toBe(-1.5);
    expect(active.scale).toBe(0.96);
    expect(active.translateYPx).toBe(1);
  });

  it("ghost-ink-pill이 호버·프레스 시 표면 워시 배경으로 전환되고 경량 섀도우를 유지한다", () => {
    const rest = evaluateTactileButtonSpec({
      variant: "ghost-ink-pill",
      state: "rest",
      paletteId: "stage-cinema",
    });
    const hover = evaluateTactileButtonSpec({
      variant: "ghost-ink-pill",
      state: "hover",
      paletteId: "stage-cinema",
    });
    expect(rest.topSpecularPx).toBe(0);
    expect(rest.shadowLayerCount).toBe(1);
    expect(hover.backgroundOklch).not.toEqual(rest.backgroundOklch);
    expect(hover.passesWcagAa).toBe(true);
  });

  it("5대 팔레트 × 4종 버튼 × 4단계 상태(80개 전 조합)가 WCAG AA·44px 터치·transition-all 0건을 충족한다", () => {
    const states: readonly TactileInteractionState[] = ["rest", "hover", "active", "focus"];
    let checked = 0;
    for (const p of ATELIER_VIVID_PALETTES) {
      for (const variant of TACTILE_BUTTON_VARIANTS) {
        for (const state of states) {
          const spec = evaluateTactileButtonSpec({ variant, state, paletteId: p.id });
          expect(spec.passesWcagAa).toBe(true);
          expect(spec.wcagContrastRatio).toBeGreaterThanOrEqual(WCAG_AA_MIN_RATIO);
          expect(spec.minHitAreaPx).toBe(MIN_HIT_AREA_PX);
          expect(spec.transitionProperty).not.toContain("all");
          checked += 1;
        }
      }
    }
    expect(checked).toBe(80);
  });

  it("prefers-reduced-motion: true 시 모든 버튼 변형의 스케일(1)·이동(0)·시간(0ms)·트랜지션(none)이 즉시 스냅된다", () => {
    for (const variant of TACTILE_BUTTON_VARIANTS) {
      const spec = evaluateTactileButtonSpec({
        variant,
        state: "active",
        paletteId: "night-studio-glow",
        reducedMotion: true,
      });
      expect(spec.scale).toBe(1);
      expect(spec.translateYPx).toBe(0);
      expect(spec.durationMs).toBe(0);
      expect(spec.transformCss).toBe("none");
      expect(spec.transitionProperty).toBe("none");
    }
  });

  it("모든 버튼 boxShadowCss가 순수 OKLCH만 포함하고 원시 색 및 바이올렛이 0건이다", () => {
    for (const p of ATELIER_VIVID_PALETTES) {
      for (const variant of TACTILE_BUTTON_VARIANTS) {
        const spec = evaluateTactileButtonSpec({ variant, state: "focus", paletteId: p.id });
        assertZeroRawColorsAndZeroViolet(spec.boxShadowCss);
      }
    }
  });
});

describe("4. 마이크로-시어터 역동성 계산기 & CSS 변수 / JSON 생성기", () => {
  it("극단 포인터 입력에도 3D 틸트가 ±4.5°(MAX_TILT_DEG) 이내로 엄격 클램프된다", () => {
    const extremePos = computeMicroTheaterKinematics({ pointerX: 9, pointerY: -12, paletteId: "pigment-splash" });
    const extremeNeg = computeMicroTheaterKinematics({ pointerX: -6, pointerY: 8, paletteId: "stage-cinema" });
    expect(extremePos.rotateYDeg).toBe(MAX_TILT_DEG);
    expect(extremePos.rotateXDeg).toBe(MAX_TILT_DEG);
    expect(extremePos.tiltMagnitudeDeg).toBeLessThanOrEqual(MAX_TILT_DEG);
    expect(extremeNeg.rotateYDeg).toBe(-MAX_TILT_DEG);
    expect(extremeNeg.rotateXDeg).toBe(-MAX_TILT_DEG);
    expect(extremeNeg.motionSafe).toBe(true);
  });

  it("reducedMotion: true 시 틸트·3단 리본 시차·잉크 물결이 즉시 0으로 스냅된다", () => {
    const k = computeMicroTheaterKinematics({
      pointerX: 0.9,
      pointerY: -0.8,
      scrollProgress: 0.95,
      rippleAgeMs: 120,
      rippleActive: true,
      reducedMotion: true,
      paletteId: "ink-atelier",
    });
    expect(k.rotateXDeg).toBe(0);
    expect(k.rotateYDeg).toBe(0);
    expect(k.tiltMagnitudeDeg).toBe(0);
    expect(k.specularShiftXPct).toBe(50);
    expect(k.specularShiftYPct).toBe(50);
    expect(k.cardTransformCss).toBe("none");
    expect(k.inkRipple).toEqual({ active: false, ageMs: 0, progress: 0, radiusPct: 0, opacity: 0 });
    for (const r of k.ribbonFrames) {
      expect(r.offsetXPx).toBe(0);
      expect(r.offsetYPx).toBe(0);
      expect(r.scrollShiftYPx).toBe(0);
    }
  });

  it("다층 안료 리본 3단(back/mid/front) 시차 오프셋이 깊이 순으로 증가하고 스크롤에 반응한다", () => {
    const top = computeMicroTheaterKinematics({ pointerX: 0.8, pointerY: 0.5, scrollProgress: 0 });
    const bottom = computeMicroTheaterKinematics({ pointerX: 0.8, pointerY: 0.5, scrollProgress: 1 });
    const [b, m, f] = top.ribbonFrames;
    expect(b.depth).toBe("back");
    expect(m.depth).toBe("mid");
    expect(f.depth).toBe("front");
    expect(Math.abs(b.offsetXPx)).toBeLessThan(Math.abs(m.offsetXPx));
    expect(Math.abs(m.offsetXPx)).toBeLessThan(Math.abs(f.offsetXPx));
    expect(top.ribbonFrames[2].scrollShiftYPx).not.toBe(bottom.ribbonFrames[2].scrollShiftYPx);
  });

  it("computeInkRippleDecay가 반지름 확장·투명도 감쇠·종료 시 0 스냅 및 reducedMotion 차단을 정확히 계산한다", () => {
    const early = computeInkRippleDecay(80, true, false);
    const late = computeInkRippleDecay(320, true, false);
    const done = computeInkRippleDecay(INK_RIPPLE_DURATION_MS + 100, true, false);
    const reduced = computeInkRippleDecay(120, true, true);
    expect(early.active).toBe(true);
    expect(late.radiusPct).toBeGreaterThan(early.radiusPct);
    expect(late.opacity).toBeLessThan(early.opacity);
    expect(done.active).toBe(false);
    expect(done.opacity).toBe(0);
    expect(reduced.active).toBe(false);
    expect(reduced.radiusPct).toBe(0);
  });

  it("buildDynamicMeshGradientCss가 순수 OKLCH 다중 메쉬를 생성하고 원시 색·바이올렛이 0건이다", () => {
    for (const p of ATELIER_VIVID_PALETTES) {
      const css = buildDynamicMeshGradientCss(p, 0.4, -0.3, 0.5, false);
      expect(css).toContain("radial-gradient(");
      expect(css).toContain("linear-gradient(");
      assertZeroRawColorsAndZeroViolet(css);
    }
  });

  it("exportAtelierVividCssVariables가 CSS 변수·메쉬·±4.5deg·prefers-reduced-motion 블록을 정확히 출력한다", () => {
    const css = exportAtelierVividCssVariables("story-editorial");
    expect(css).toContain(':root[data-atelier-vivid="story-editorial"]');
    expect(css).toContain("--atelier-vivid-mesh-bg:");
    expect(css).toContain("--atelier-vivid-btn-press-scale: 0.97;");
    expect(css).toContain("--atelier-vivid-btn-press-ms: 150ms;");
    expect(css).toContain("--atelier-vivid-max-tilt-deg: 4.5deg;");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).not.toContain("transition-all");
    assertZeroRawColorsAndZeroViolet(css);
  });

  it("exportAtelierVividCssVariables(reducedMotion=true)가 press scale 1 · 0ms · 0deg로 즉시 고정한다", () => {
    const css = exportAtelierVividCssVariables("stage-cinema", { reducedMotion: true });
    expect(css).toContain("--atelier-vivid-btn-press-scale: 1;");
    expect(css).toContain("--atelier-vivid-btn-press-ms: 0ms;");
    expect(css).toContain("--atelier-vivid-max-tilt-deg: 0deg;");
  });

  it("buildAtelierVividSnapshot과 exportAtelierVividManifestJson이 정본 스키마와 100점을 반환한다", () => {
    const snap = buildAtelierVividSnapshot({ paletteId: "night-studio-glow", pointerX: 0.5, pointerY: -0.4 });
    expect(snap.schemaVersion).toBe(ATELIER_VIVID_SCHEMA_VERSION);
    expect(snap.craftScore).toBe(100);
    expect(snap.buttonSpecs).toHaveLength(4);
    const parsed = JSON.parse(exportAtelierVividManifestJson(snap)) as {
      schemaVersion: string;
      paletteId: string;
      craftScore: number;
      violetAudit: { violetViolationCount: number };
    };
    expect(parsed.schemaVersion).toBe(ATELIER_VIVID_SCHEMA_VERSION);
    expect(parsed.paletteId).toBe("night-studio-glow");
    expect(parsed.craftScore).toBe(100);
    expect(parsed.violetAudit.violetViolationCount).toBe(0);
  });
});

describe("5. StudioAtelierVibrantUiPanel 라이브 UI 렌더링 및 인터랙션 검증", () => {
  it("props 없이 기본 렌더링 시 5대 무드·5원색 안료·비교 SVG·마이크로-시어터·4종 버튼·WCAG 표가 표시된다", () => {
    render(<StudioAtelierVibrantUiPanel />);
    expect(screen.getByTestId("atelier-vibrant-ui-panel").getAttribute("data-palette-id")).toBe("pigment-splash");
    expect(screen.getByTestId("atelier-vivid-comparison-svg")).toBeTruthy();
    expect(screen.getByTestId("atelier-vivid-microtheater-svg")).toBeTruthy();
    expect(screen.getByTestId("atelier-vivid-button-lab")).toBeTruthy();
    expect(screen.getByTestId("atelier-vivid-contrast-table")).toBeTruthy();
    expect(screen.getByTestId("atelier-vivid-pigment-strip").children).toHaveLength(5);
  });

  it("5대 주얼-톤 무드 스위처 클릭 시 팔레트·SVG·상태 배너·onPaletteChange 콜백이 갱신된다", () => {
    const onPaletteChange = vi.fn();
    render(<StudioAtelierVibrantUiPanel onPaletteChange={onPaletteChange} />);
    fireEvent.click(screen.getByTestId("atelier-vivid-palette-stage-cinema"));
    expect(screen.getByTestId("atelier-vivid-palette-stage-cinema").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("atelier-vivid-microtheater-svg").getAttribute("data-palette-id")).toBe("stage-cinema");
    expect(screen.getByTestId("atelier-vivid-comparison-svg").getAttribute("data-palette-id")).toBe("stage-cinema");
    expect(screen.getByTestId("atelier-vivid-status-banner").textContent).toContain("스테이지 시네마");
    expect(onPaletteChange).toHaveBeenCalledTimes(1);
    expect(onPaletteChange.mock.calls[0]?.[0]?.palette.id).toBe("stage-cinema");
  });

  it("포인터 프리셋 버튼 및 스크롤 슬라이더 조작 시 틸트 각도와 시차 표시가 실시간 반영된다", () => {
    render(<StudioAtelierVibrantUiPanel />);
    fireEvent.click(screen.getByTestId("atelier-vivid-probe-top-left"));
    const svg = screen.getByTestId("atelier-vivid-microtheater-svg");
    expect(Number(svg.getAttribute("data-tilt-y"))).toBeLessThan(0);
    expect(Number(svg.getAttribute("data-tilt-x"))).toBeGreaterThan(0);
    expect(Math.abs(Number(svg.getAttribute("data-tilt-x")))).toBeLessThanOrEqual(MAX_TILT_DEG);

    fireEvent.click(screen.getByTestId("atelier-vivid-probe-center"));
    expect(svg.getAttribute("data-tilt-x")).toBe("0");
    expect(svg.getAttribute("data-tilt-y")).toBe("0");

    fireEvent.change(screen.getByTestId("atelier-vivid-scroll-slider"), { target: { value: "85" } });
    expect((screen.getByTestId("atelier-vivid-scroll-slider") as HTMLInputElement).value).toBe("85");
  });

  it("잉크 물결 파동 버튼 클릭 시 SVG 내 잉크 물결 감쇠 링이 표시된다", () => {
    render(<StudioAtelierVibrantUiPanel />);
    expect(screen.queryByTestId("atelier-vivid-ink-ripple")).toBeNull();
    fireEvent.click(screen.getByTestId("atelier-vivid-ripple-btn"));
    expect(screen.getByTestId("atelier-vivid-ink-ripple")).toBeTruthy();
  });

  it("모션 감소 안전 토글 클릭 시 틸트(0°/0°)·잉크 물결 비활성·reduced-motion 상태가 즉시 스냅된다", () => {
    render(<StudioAtelierVibrantUiPanel />);
    fireEvent.click(screen.getByTestId("atelier-vivid-probe-bottom-right"));
    fireEvent.click(screen.getByTestId("atelier-vivid-ripple-btn"));
    expect(screen.getByTestId("atelier-vivid-ink-ripple")).toBeTruthy();

    fireEvent.click(screen.getByTestId("atelier-vivid-reduced-motion-toggle"));
    expect(screen.getByTestId("atelier-vivid-reduced-motion-toggle").getAttribute("aria-pressed")).toBe("true");
    const svg = screen.getByTestId("atelier-vivid-microtheater-svg");
    expect(svg.getAttribute("data-reduced-motion")).toBe("true");
    expect(svg.getAttribute("data-tilt-x")).toBe("0");
    expect(svg.getAttribute("data-tilt-y")).toBe("0");
    expect(screen.queryByTestId("atelier-vivid-ink-ripple")).toBeNull();
  });

  it("4종 에나멜 버튼 클릭 및 4단계 물리 상태 전환 시 클릭 카운터와 스타일이 정상 동작한다", () => {
    render(<StudioAtelierVibrantUiPanel />);
    fireEvent.click(screen.getByTestId("atelier-vivid-state-active"));
    expect(screen.getByTestId("atelier-vivid-state-active").getAttribute("aria-pressed")).toBe("true");
    const primaryBtn = screen.getByTestId("atelier-vivid-tactile-primary-enamel");
    expect(primaryBtn.style.transform).toContain("scale(0.97)");
    fireEvent.click(primaryBtn);
    fireEvent.click(primaryBtn);
    expect(screen.getByTestId("atelier-vivid-press-count-primary-enamel").textContent).toContain("2");
  });

  it("CSS·JSON 복사, 미리보기 탭 전환·접기·초기화 및 콜백이 정상 실행된다", async () => {
    const onExportCss = vi.fn();
    const onExportJson = vi.fn();
    render(<StudioAtelierVibrantUiPanel onExportCss={onExportCss} onExportJson={onExportJson} />);

    expect(screen.queryByTestId("atelier-vivid-export-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("atelier-vivid-copy-css-btn"));
    await waitFor(() => expect(onExportCss).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("atelier-vivid-export-preview").getAttribute("data-format")).toBe("css");
    expect(screen.getByTestId("atelier-vivid-export-preview").textContent).toContain("--atelier-vivid-mesh-bg:");

    fireEvent.click(screen.getByTestId("atelier-vivid-copy-json-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("atelier-vivid-export-preview").getAttribute("data-format")).toBe("json");
    expect(screen.getByTestId("atelier-vivid-export-preview").textContent).toContain(ATELIER_VIVID_SCHEMA_VERSION);

    fireEvent.click(screen.getByTestId("atelier-vivid-toggle-drawer-btn"));
    expect(screen.queryByTestId("atelier-vivid-export-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("atelier-vivid-palette-ink-atelier"));
    fireEvent.click(screen.getByTestId("atelier-vivid-reset-btn"));
    expect(screen.getByTestId("atelier-vivid-microtheater-svg").getAttribute("data-palette-id")).toBe("pigment-splash");
  });

  it("영문 로케일(locale='en') · initialPaletteId · initialReducedMotion · className 선택 props를 반영한다", () => {
    render(
      <StudioAtelierVibrantUiPanel
        locale="en"
        initialPaletteId="story-editorial"
        initialReducedMotion
        className="custom-vivid-shell"
      />,
    );
    const panel = screen.getByTestId("atelier-vibrant-ui-panel");
    expect(panel.getAttribute("aria-label")).toContain("AtelierVivid Jewel-Tone");
    expect(panel.className).toContain("custom-vivid-shell");
    expect(panel.getAttribute("data-palette-id")).toBe("story-editorial");
    expect(panel.getAttribute("data-reduced-motion")).toBe("true");
  });
});

describe("6. 엄격 디자인 계약 · 파일 크기 상한 · 고유 브랜드 청정 자가 검증", () => {
  it("모든 버튼이 min-h-11을 충족하고 5대 팔레트 전수 전환 시 SVG에 원시 색·바이올렛(265°~325°)이 0건이다", () => {
    const { container } = render(<StudioAtelierVibrantUiPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(20);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }

    for (const p of ATELIER_VIVID_PALETTES) {
      fireEvent.click(screen.getByTestId(`atelier-vivid-palette-${p.id}`));
      assertZeroRawColorsAndZeroViolet(screen.getByTestId("atelier-vivid-comparison-svg").outerHTML);
      assertZeroRawColorsAndZeroViolet(screen.getByTestId("atelier-vivid-microtheater-svg").outerHTML);
    }
  });

  it("소유 파일 4종 존재 및 줄 수 상한(engine<=700, panel<=680, index<=80, test<=720)을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const expected = [
      "atelier-vibrant-engine.ts",
      "StudioAtelierVibrantUiPanel.tsx",
      "index.ts",
      "atelier-vibrant-ui.test.tsx",
    ];
    for (const file of expected) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }
    const tsFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(tsFiles.sort()).toEqual([...expected].sort());

    const limits: Readonly<Record<string, number>> = {
      "atelier-vibrant-engine.ts": 700,
      "StudioAtelierVibrantUiPanel.tsx": 680,
      "index.ts": 80,
      "atelier-vibrant-ui.test.tsx": 720,
    };
    for (const file of expected) {
      const lineCount = readFileSync(path.join(dir, file), "utf8").split(/\r?\n/).length;
      expect(lineCount).toBeLessThanOrEqual(limits[file] ?? 800);
    }
  });

  it("금지 패턴 0건 및 필수 디자인 토큰·접근성 클래스를 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const prodFiles = ["atelier-vibrant-engine.ts", "StudioAtelierVibrantUiPanel.tsx", "index.ts"];
    for (const file of prodFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toMatch(/\blocalStorage\b/u);
      expect(src).not.toMatch(/\bsessionStorage\b/u);
      expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
      expect(src).not.toMatch(/\b\d+n\b/u);
      expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src).not.toMatch(/\brgba?\s*\(/iu);
      expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      expect(src).not.toContain("transition-all");
      expect(src).not.toContain("Sparkles");
      expect(src).not.toContain("가능하게 합니다");
      expect(src).not.toContain("직관적인 경험을 제공");
      expect(src).not.toContain("원활한 워크플로우를 보장");
    }

    const panelSrc = readFileSync(path.join(dir, "StudioAtelierVibrantUiPanel.tsx"), "utf8");
    expect(panelSrc).not.toMatch(/Props\s*=\s*\{\}/u);
    expect(panelSrc).not.toMatch(/\)\s*=\s*\{\}/u);
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("motion-reduce:transition-none");
  });

  it("디렉터리·파일·export 심볼·전체 소스에서 외부 브랜드명 혼입이 0건이다", () => {
    const dir = path.resolve(import.meta.dirname);
    expect(auditProprietaryBrandNaming(path.basename(dir)).verdict).toBe("clean");

    const forbiddenTokens = EXTERNAL_NAME_DETECTION_RULES.flatMap((r) => r.tokens);
    const forbiddenRe = new RegExp(`\\b(?:${forbiddenTokens.join("|")})\\b`, "iu");

    for (const file of readdirSync(dir)) {
      expect(auditProprietaryBrandNaming(file).verdict).toBe("clean");
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toMatch(forbiddenRe);
      for (const m of src.matchAll(/export\s+(?:const|function|type|interface)\s+([A-Za-z0-9_]+)/gu)) {
        expect(auditProprietaryBrandNaming(m[1]).verdict).toBe("clean");
      }
    }
  });
});
