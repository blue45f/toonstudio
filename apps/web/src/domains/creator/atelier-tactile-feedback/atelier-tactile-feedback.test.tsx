// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATELIER_SURFACE_THEMES,
  CONTEXT_BAR_HEIGHT_PX,
  EDGE_REVEAL_FADE_MS,
  EDGE_REVEAL_THRESHOLD_PX,
  EPHEMERAL_PILL_TTL_MS,
  EYEDROPPER_SAMPLE_PRESETS,
  IMMERSIVE_VIEWPORT_MODES,
  INK_RIPPLE_DURATION_MS,
  INK_RIPPLE_EASING,
  MAX_GRAIN_OPACITY,
  MIN_GRAIN_OPACITY,
  PRESS_DETENT_DEPTH_PX,
  PRODUCT_CANVAS_FLOOR_PERCENT,
  StudioImmersiveFeedbackHudPanel,
  TACTILE_SPEC_SCHEMA_VERSION,
  classifyContrastGrade,
  computeWcagContrastRatio,
  evaluateEdgeRevealState,
  evaluateTactileFeedbackState,
  exportTactileFeedbackSpecJson,
  formatOklch,
  getAtelierSurfaceTheme,
  getImmersiveViewportModeSpec,
  isVioletSlopHue,
  normalizeHue,
  oklchToRelativeLuminance,
  sanitizeNonVioletHue,
  transitionImmersiveViewportMode,
  type AtelierSurfaceId,
  type ImmersiveViewportModeId,
} from "./index";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
});

function assertZeroVioletAndRawColors(markup: string): void {
  expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(markup).not.toMatch(/\brgba?\s*\(/iu);
  expect(markup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const match of markup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isVioletSlopHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 3단계 몰입 뷰포트 상태 머신 (96% / 88% / 82%) & 가장자리 28px 근접 부상", () => {
  it("3종 몰입 뷰포트 모드가 96%·88%·82% 점유율과 PRODUCT.md 82% 하한을 모두 만족한다", () => {
    expect(IMMERSIVE_VIEWPORT_MODES.map((m) => m.id)).toEqual([
      "full-bleed-96",
      "calm-studio-88",
      "workbench-82",
    ]);
    expect(IMMERSIVE_VIEWPORT_MODES.map((m) => m.canvasOccupancyPercent)).toEqual([96, 88, 82]);
    for (const mode of IMMERSIVE_VIEWPORT_MODES) {
      expect(mode.canvasOccupancyPercent + mode.chromeOccupancyPercent).toBe(100);
      expect(mode.canvasOccupancyPercent).toBeGreaterThanOrEqual(PRODUCT_CANVAS_FLOOR_PERCENT);
      expect(mode.meetsProductFloor).toBe(true);
    }
  });

  it("full-bleed-96은 상단 바와 사이드바를 완전히 숨기고 28px/180ms 가장자리 부상 정책을 가진다", () => {
    const spec = getImmersiveViewportModeSpec("full-bleed-96");
    expect(spec.topBarVisible).toBe(false);
    expect(spec.topBarHeightPx).toBe(0);
    expect(spec.leftRailVisible).toBe(false);
    expect(spec.inspectorDocked).toBe(false);
    expect(spec.edgeRevealThresholdPx).toBe(EDGE_REVEAL_THRESHOLD_PX);
    expect(spec.edgeRevealFadeMs).toBe(EDGE_REVEAL_FADE_MS);
    expect(spec.floatingPillPolicy).toBe("edge-proximity-only");
  });

  it("calm-studio-88은 단일 44px 컨텍스트 바와 좌측 2-슬라이더만 유지하고 인스펙터를 닫는다", () => {
    const spec = getImmersiveViewportModeSpec("calm-studio-88");
    expect(spec.topBarVisible).toBe(true);
    expect(spec.topBarHeightPx).toBe(CONTEXT_BAR_HEIGHT_PX);
    expect(spec.leftRailVisible).toBe(true);
    expect(spec.leftSlidersOnly).toBe(true);
    expect(spec.inspectorDocked).toBe(false);
  });

  it("workbench-82는 44px 컨텍스트 바·전체 도구 레일·우측 인스펙터 도킹 상태에서 82%를 보장한다", () => {
    const spec = getImmersiveViewportModeSpec("workbench-82");
    expect(spec.topBarVisible).toBe(true);
    expect(spec.leftRailVisible).toBe(true);
    expect(spec.leftSlidersOnly).toBe(false);
    expect(spec.inspectorDocked).toBe(true);
    expect(spec.canvasOccupancyPercent).toBe(82);
  });

  it("full-bleed-96에서 포인터 활성 + 28px 이내에서만 플로팅 필이 180ms 페이드인된다", () => {
    const inside = evaluateEdgeRevealState({
      mode: "full-bleed-96",
      edgeDistancePx: 28,
      pointerActive: true,
      reducedMotion: false,
    });
    expect(inside.revealed).toBe(true);
    expect(inside.pillOpacity).toBeGreaterThan(0.8);
    expect(inside.fadeDurationMs).toBe(180);

    const outside = evaluateEdgeRevealState({
      mode: "full-bleed-96",
      edgeDistancePx: 29,
      pointerActive: true,
      reducedMotion: false,
    });
    expect(outside.revealed).toBe(false);
    expect(outside.pillOpacity).toBe(0);

    const inactive = evaluateEdgeRevealState({
      mode: "full-bleed-96",
      edgeDistancePx: 10,
      pointerActive: false,
      reducedMotion: false,
    });
    expect(inactive.revealed).toBe(false);
  });

  it("모션 감소(Reduced Motion) 시 가장자리 플로팅 필 전환 시간이 0ms 즉시 스냅으로 바뀐다", () => {
    const rm = evaluateEdgeRevealState({
      mode: "full-bleed-96",
      edgeDistancePx: 12,
      pointerActive: true,
      reducedMotion: true,
    });
    expect(rm.revealed).toBe(true);
    expect(rm.fadeDurationMs).toBe(0);
    expect(rm.easing).toBe("step-end");
  });

  it("transitionImmersiveViewportMode가 toggle-full-bleed·cycle-mode·set-mode 전이를 정확히 수행한다", () => {
    expect(transitionImmersiveViewportMode("full-bleed-96", { type: "toggle-full-bleed" })).toBe("calm-studio-88");
    expect(transitionImmersiveViewportMode("workbench-82", { type: "toggle-full-bleed" })).toBe("full-bleed-96");
    expect(
      transitionImmersiveViewportMode("full-bleed-96", { type: "toggle-full-bleed", fallbackMode: "workbench-82" }),
    ).toBe("workbench-82");
    expect(transitionImmersiveViewportMode("full-bleed-96", { type: "cycle-mode" })).toBe("calm-studio-88");
    expect(transitionImmersiveViewportMode("calm-studio-88", { type: "cycle-mode" })).toBe("workbench-82");
    expect(transitionImmersiveViewportMode("workbench-82", { type: "cycle-mode" })).toBe("full-bleed-96");
    expect(transitionImmersiveViewportMode("calm-studio-88", { type: "set-mode", mode: "workbench-82" })).toBe("workbench-82");
  });
});

describe("2. 피드백 #1 펜촉 헤일로 (Nib Halo) & 피드백 #2 자동 소멸 브러시 HUD 필", () => {
  it("필압(0..1)이 올라갈수록 펜촉 헤일로 반경과 잉크 채움 비율이 단조 증가한다", () => {
    const light = evaluateTactileFeedbackState({ pressure: 0.1, tiltDeg: 90, brushSizePx: 40 });
    const mid = evaluateTactileFeedbackState({ pressure: 0.55, tiltDeg: 90, brushSizePx: 40 });
    const heavy = evaluateTactileFeedbackState({ pressure: 1, tiltDeg: 90, brushSizePx: 40 });
    expect(mid.nibHalo.radiusXPx).toBeGreaterThan(light.nibHalo.radiusXPx);
    expect(heavy.nibHalo.radiusXPx).toBeGreaterThan(mid.nibHalo.radiusXPx);
    expect(heavy.nibHalo.inkFillRatio).toBeGreaterThan(light.nibHalo.inkFillRatio);
  });

  it("기울기 90°(수직)에서는 원형에 가깝고 15°(눕힘)에서는 장축이 길어진 타원 헤일로가 계산된다", () => {
    const upright = evaluateTactileFeedbackState({ pressure: 0.7, tiltDeg: 90, velocityPxPerSec: 0, brushSizePx: 48 });
    const tilted = evaluateTactileFeedbackState({ pressure: 0.7, tiltDeg: 15, velocityPxPerSec: 0, brushSizePx: 48 });
    expect(Math.abs(upright.nibHalo.radiusXPx - upright.nibHalo.radiusYPx)).toBeLessThan(0.5);
    expect(tilted.nibHalo.radiusXPx).toBeGreaterThan(tilted.nibHalo.radiusYPx * 1.8);
    expect(tilted.nibHalo.tiltAzimuthDeg).toBeGreaterThan(upright.nibHalo.tiltAzimuthDeg);
  });

  it("범위를 벗어난 필압·기울기·속도·브러시 크기를 안전하게 클램프하고 중앙 시야 방해 0%를 보장한다", () => {
    const clamped = evaluateTactileFeedbackState({
      pressure: 4.5,
      tiltDeg: -20,
      velocityPxPerSec: 9999,
      brushSizePx: 999,
    });
    expect(clamped.nibHalo.pressure).toBe(1);
    expect(clamped.nibHalo.tiltDeg).toBe(15);
    expect(clamped.nibHalo.velocityPxPerSec).toBe(2400);
    expect(clamped.nibHalo.brushSizePx).toBe(240);
    expect(clamped.nibHalo.centerGazeClearanceRatio).toBe(1);
    expect(clamped.nibHalo.sightlineObstructionPercent).toBe(0);
  });

  it("속도가 빠른 스트로크에서는 단축 반경과 잉크 채움이 미세하게 가늘어진다", () => {
    const slow = evaluateTactileFeedbackState({ pressure: 0.7, tiltDeg: 60, velocityPxPerSec: 60, brushSizePx: 50 });
    const fast = evaluateTactileFeedbackState({ pressure: 0.7, tiltDeg: 60, velocityPxPerSec: 1750, brushSizePx: 50 });
    expect(fast.nibHalo.radiusYPx).toBeLessThan(slow.nibHalo.radiusYPx);
    expect(fast.nibHalo.inkFillRatio).toBeLessThan(slow.nibHalo.inkFillRatio);
  });

  it("자동 소멸 브러시 HUD 필이 0ms 표시 -> 800ms 페이드아웃 -> 900ms 완전 소멸 스케줄을 따른다", () => {
    const s0 = evaluateTactileFeedbackState({ brushSizePx: 36, brushOpacityPercent: 75, ephemeralTriggerElapsedMs: 0 });
    expect(s0.ephemeralPill.visible).toBe(true);
    expect(s0.ephemeralPill.phase).toBe("visible");
    expect(s0.ephemeralPill.ttlMs).toBe(EPHEMERAL_PILL_TTL_MS);
    expect(s0.ephemeralPill.remainingMs).toBe(900);
    expect(s0.ephemeralPill.opacity).toBe(1);

    const sFade = evaluateTactileFeedbackState({ brushSizePx: 36, brushOpacityPercent: 75, ephemeralTriggerElapsedMs: 810 });
    expect(sFade.ephemeralPill.visible).toBe(true);
    expect(sFade.ephemeralPill.phase).toBe("fading-out");
    expect(sFade.ephemeralPill.opacity).toBeGreaterThan(0);
    expect(sFade.ephemeralPill.opacity).toBeLessThan(1);

    const sDone = evaluateTactileFeedbackState({ brushSizePx: 36, brushOpacityPercent: 75, ephemeralTriggerElapsedMs: 900 });
    expect(sDone.ephemeralPill.visible).toBe(false);
    expect(sDone.ephemeralPill.phase).toBe("dismissed");
    expect(sDone.ephemeralPill.opacity).toBe(0);
    expect(sDone.ephemeralPill.autoDismissScheduled).toBe(false);
  });

  it("모션 감소 시 자동 소멸 필이 페이드 없이 instant-snap(transitionMs=0)으로 동작하고 900ms에 즉시 사라진다", () => {
    const active = evaluateTactileFeedbackState({
      ephemeralTriggerElapsedMs: 820,
      reducedMotion: true,
    });
    expect(active.ephemeralPill.visible).toBe(true);
    expect(active.ephemeralPill.phase).toBe("instant-snap");
    expect(active.ephemeralPill.opacity).toBe(1);
    expect(active.ephemeralPill.transitionMs).toBe(0);

    const dismissed = evaluateTactileFeedbackState({
      ephemeralTriggerElapsedMs: 900,
      reducedMotion: true,
    });
    expect(dismissed.ephemeralPill.visible).toBe(false);
    expect(dismissed.ephemeralPill.transitionMs).toBe(0);
  });

  it("ephemeralTriggerElapsedMs가 null이면 자동 소멸 필이 유휴(idle) 상태로 숨겨진다", () => {
    const idle = evaluateTactileFeedbackState({ ephemeralTriggerElapsedMs: null });
    expect(idle.ephemeralPill.visible).toBe(false);
    expect(idle.ephemeralPill.phase).toBe("idle");
    expect(idle.ephemeralPill.autoDismissScheduled).toBe(false);
  });
});

describe("3. 피드백 #3 잉크 파동(150ms 감속) & OPFS 저장 상태 점 3종", () => {
  it("OPFS 저장·실행취소·스냅 동작 시 150ms cubic-bezier(0.22, 1, 0.36, 1) 물리 감속 파동을 계산한다", () => {
    for (const actionKind of ["opfs-save", "undo", "snap"] as const) {
      const early = evaluateTactileFeedbackState({ lastActionKind: actionKind, actionElapsedMs: 30 });
      const late = evaluateTactileFeedbackState({ lastActionKind: actionKind, actionElapsedMs: 120 });
      expect(early.inkRippleAndSave.active).toBe(true);
      expect(early.inkRippleAndSave.durationMs).toBe(INK_RIPPLE_DURATION_MS);
      expect(early.inkRippleAndSave.easing).toBe(INK_RIPPLE_EASING);
      expect(late.inkRippleAndSave.rippleRadiusPx).toBeGreaterThan(early.inkRippleAndSave.rippleRadiusPx);
      expect(late.inkRippleAndSave.rippleOpacity).toBeLessThan(early.inkRippleAndSave.rippleOpacity);
      assertZeroVioletAndRawColors(early.inkRippleAndSave.rippleColorOklch);
    }
  });

  it("150ms를 초과하면 잉크 파동이 완전히 정착(active=false)한다", () => {
    const settled = evaluateTactileFeedbackState({ lastActionKind: "undo", actionElapsedMs: 160 });
    expect(settled.inkRippleAndSave.active).toBe(false);
    expect(settled.inkRippleAndSave.rippleRadiusPx).toBe(0);
    expect(settled.inkRippleAndSave.rippleOpacity).toBe(0);
  });

  it("모션 감소 시 잉크 파동 시간이 0ms로 단축되고 OPFS 저장 펄스 애니메이션이 비활성화된다", () => {
    const rm = evaluateTactileFeedbackState({
      lastActionKind: "opfs-save",
      actionElapsedMs: 40,
      opfsSaveStatus: "saving-pulse",
      reducedMotion: true,
    });
    expect(rm.inkRippleAndSave.durationMs).toBe(0);
    expect(rm.inkRippleAndSave.easing).toBe("step-end");
    expect(rm.inkRippleAndSave.opfsDot.pulseActive).toBe(false);
  });

  it("3종 OPFS 상태 점(Steady Forest / Saving Pulse / Offline Amber)이 서로 다른 형태 단서와 비-바이올렛 OKLCH를 가진다", () => {
    const steady = evaluateTactileFeedbackState({ opfsSaveStatus: "steady-forest" }).inkRippleAndSave.opfsDot;
    const saving = evaluateTactileFeedbackState({ opfsSaveStatus: "saving-pulse" }).inkRippleAndSave.opfsDot;
    const offline = evaluateTactileFeedbackState({ opfsSaveStatus: "offline-amber" }).inkRippleAndSave.opfsDot;

    expect(steady.shapeCue).toBe("solid-dot");
    expect(saving.shapeCue).toBe("ring-pulse");
    expect(saving.pulseActive).toBe(true);
    expect(offline.shapeCue).toBe("diamond-amber");

    for (const dot of [steady, saving, offline]) {
      expect(dot.labelKo.length).toBeGreaterThan(3);
      expect(dot.labelEn.length).toBeGreaterThan(3);
      assertZeroVioletAndRawColors(dot.dotColorOklch);
      assertZeroVioletAndRawColors(dot.ringColorOklch);
    }
  });
});

describe("4. 피드백 #4 고대비 OKLCH 스포이드 루페 & 탈-바이올렛·색각안전 가드", () => {
  it("OKLCH 상대 휘도와 WCAG 2.1 명도비 계산이 극단 명암(>15:1)과 동일 색(1:1)을 정확히 산출한다", () => {
    const white = { l: 0.99, c: 0.002, h: 90 };
    const black = { l: 0.05, c: 0.002, h: 90 };
    expect(oklchToRelativeLuminance(white)).toBeGreaterThan(0.9);
    expect(oklchToRelativeLuminance(black)).toBeLessThan(0.02);
    expect(computeWcagContrastRatio(white, black)).toBeGreaterThan(15);
    expect(computeWcagContrastRatio(white, white)).toBe(1);
    expect(classifyContrastGrade(7.2)).toBe("AAA");
    expect(classifyContrastGrade(4.8)).toBe("AA");
    expect(classifyContrastGrade(3.2)).toBe("AA-large");
    expect(classifyContrastGrade(2.1)).toBe("fail");
  });

  it("탈-바이올렛 가드가 270~320°(음수·360° 초과 포함)를 모두 감지하고 안전 휴로 보정한다", () => {
    expect(normalizeHue(-68)).toBe(292);
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(292)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(-68)).toBe(true);
    expect(isVioletSlopHue(652)).toBe(true);
    expect(isVioletSlopHue(38)).toBe(false);
    expect(isVioletSlopHue(162)).toBe(false);
    expect(isVioletSlopHue(244)).toBe(false);

    for (let h = 270; h <= 320; h += 5) {
      expect(isVioletSlopHue(sanitizeNonVioletHue(h))).toBe(false);
    }
    const formatted = formatOklch({ l: 0.56, c: 0.16, h: 292 }, 0.9);
    assertZeroVioletAndRawColors(formatted);
  });

  it("바이올렛 292° 픽셀을 스포이드로 찍으면 자동 회피 힌트와 안전한 비-바이올렛 대체 색을 생성한다", () => {
    const state = evaluateTactileFeedbackState({
      eyedropperActive: true,
      sampledPixel: { l: 0.56, c: 0.16, h: 292 },
    });
    expect(state.eyedropperLoupe.violetSlopDetected).toBe(true);
    expect(state.eyedropperLoupe.rawHueDeg).toBe(292);
    expect(isVioletSlopHue(state.eyedropperLoupe.safeHueDeg)).toBe(false);
    expect(state.eyedropperLoupe.violetAvoidanceHintKo).toContain("자동 회피");
    assertZeroVioletAndRawColors(state.eyedropperLoupe.safeSwatchOklch);
  });

  it("바탕과 명도 차이가 부족한 픽셀은 색각안전 high-risk 경고를 발령한다", () => {
    const state = evaluateTactileFeedbackState({
      surfaceId: "warm-alabaster",
      eyedropperActive: true,
      sampledPixel: { l: 0.92, c: 0.03, h: 84 },
    });
    expect(state.eyedropperLoupe.contrastVsCanvas).toBeLessThan(3);
    expect(state.eyedropperLoupe.contrastGrade).toBe("fail");
    expect(state.eyedropperLoupe.cvdWarningLevel).toBe("high-risk");
  });

  it("적록 색각 혼동 구간(중명도 주황/녹색)은 caution 경고를 제공하고 먹선 수묵은 safe를 반환한다", () => {
    const redGreen = evaluateTactileFeedbackState({
      surfaceId: "warm-alabaster",
      eyedropperActive: true,
      sampledPixel: { l: 0.56, c: 0.15, h: 36 },
    });
    expect(redGreen.eyedropperLoupe.cvdWarningLevel).toBe("caution");

    const sumi = evaluateTactileFeedbackState({
      surfaceId: "warm-alabaster",
      eyedropperActive: true,
      sampledPixel: { l: 0.22, c: 0.016, h: 236 },
    });
    expect(sumi.eyedropperLoupe.cvdWarningLevel).toBe("safe");
    expect(sumi.eyedropperLoupe.contrastGrade).toBe("AAA");
  });

  it("스포이드 기본 5종 프리셋이 모두 안전한 비-바이올렛 OKLCH 스와치를 생성한다", () => {
    expect(EYEDROPPER_SAMPLE_PRESETS).toHaveLength(5);
    for (const preset of EYEDROPPER_SAMPLE_PRESETS) {
      const evaluated = evaluateTactileFeedbackState({ sampledPixel: preset.color, eyedropperActive: true });
      assertZeroVioletAndRawColors(evaluated.eyedropperLoupe.safeSwatchOklch);
    }
  });
});

describe("5. 피드백 #5 종이결 2% 그레인 · 1px 음각 · 4종 표면 테마 & JSON 규격 내보내기", () => {
  it("4종 아틀리에 표면 테마가 그레인 0.015~0.03, 1px 음각 깊이, AAA 대비(>=7:1), 탈-바이올렛을 충족한다", () => {
    const ids: readonly AtelierSurfaceId[] = [
      "warm-alabaster",
      "ink-obsidian",
      "hanok-sepia",
      "aaa-high-contrast",
    ];
    expect(ATELIER_SURFACE_THEMES.map((t) => t.id)).toEqual(ids);

    for (const id of ids) {
      const theme = getAtelierSurfaceTheme(id);
      const state = evaluateTactileFeedbackState({ surfaceId: id });
      expect(theme.grainOpacity).toBeGreaterThanOrEqual(MIN_GRAIN_OPACITY);
      expect(theme.grainOpacity).toBeLessThanOrEqual(MAX_GRAIN_OPACITY);
      expect(state.surfaceTactile.pressDetentDepthPx).toBe(PRESS_DETENT_DEPTH_PX);
      expect(state.surfaceTactile.canvasInkContrast).toBeGreaterThanOrEqual(7);
      for (const value of Object.values(state.surfaceTactile.cssTokens)) {
        assertZeroVioletAndRawColors(value);
      }
    }
    expect(evaluateTactileFeedbackState({ surfaceId: "aaa-high-contrast" }).surfaceTactile.canvasInkContrast).toBeGreaterThan(14);
  });

  it("모션 감소 시 1px 음각 깊이는 유지하되 수직 이동(activeTranslateYPx)과 전환 시간을 0으로 안전 전환한다", () => {
    const normal = evaluateTactileFeedbackState({ surfaceId: "hanok-sepia", reducedMotion: false });
    const reduced = evaluateTactileFeedbackState({ surfaceId: "hanok-sepia", reducedMotion: true });

    expect(normal.surfaceTactile.pressDetentDepthPx).toBe(1);
    expect(normal.surfaceTactile.activeTranslateYPx).toBe(1);
    expect(normal.surfaceTactile.detentTransitionMs).toBe(150);

    expect(reduced.surfaceTactile.pressDetentDepthPx).toBe(1);
    expect(reduced.surfaceTactile.activeTranslateYPx).toBe(0);
    expect(reduced.surfaceTactile.detentTransitionMs).toBe(0);
    expect(reduced.surfaceTactile.cssTokens["--atelier-detent-shift-y"]).toBe("0px");
    expect(reduced.surfaceTactile.cssTokens["--atelier-motion-duration"]).toBe("0ms");
  });

  it("exportTactileFeedbackSpecJson이 5종 피드백·토큰·접근성 규격을 파싱 가능한 JSON으로 직렬화한다", () => {
    const state = evaluateTactileFeedbackState({
      mode: "full-bleed-96",
      surfaceId: "ink-obsidian",
      edgeDistancePx: 14,
      edgePointerActive: true,
      ephemeralTriggerElapsedMs: 120,
      lastActionKind: "opfs-save",
      actionElapsedMs: 40,
      eyedropperActive: true,
      sampledPixel: { l: 0.56, c: 0.16, h: 292 },
    });
    const json = exportTactileFeedbackSpecJson(state);
    assertZeroVioletAndRawColors(json);

    const parsed = JSON.parse(json) as {
      schemaVersion: string;
      scopeNotice: string;
      viewport: { mode: string; canvasOccupancyPercent: number; edgePillRevealed: boolean };
      surface: { id: string; grainOpacity: number; pressDetentDepthPx: number };
      feedbackModels: {
        nibHalo: { sightlineObstructionPercent: number };
        ephemeralPill: { ttlMs: number };
        inkRippleAndSave: { easing: string };
        eyedropperLoupe: { violetSlopDetected: boolean; safeHueDeg: number };
        surfaceTactile: { reducedMotionSafe: boolean };
      };
      accessibility: { minTouchTargetPx: number; colorOnlyCueFree: boolean };
    };
    expect(parsed.schemaVersion).toBe(TACTILE_SPEC_SCHEMA_VERSION);
    expect(parsed.scopeNotice).toBe("preview-token-spec-only");
    expect(parsed.viewport.mode).toBe("full-bleed-96");
    expect(parsed.viewport.canvasOccupancyPercent).toBe(96);
    expect(parsed.viewport.edgePillRevealed).toBe(true);
    expect(parsed.surface.id).toBe("ink-obsidian");
    expect(parsed.surface.pressDetentDepthPx).toBe(1);
    expect(parsed.feedbackModels.nibHalo.sightlineObstructionPercent).toBe(0);
    expect(parsed.feedbackModels.ephemeralPill.ttlMs).toBe(900);
    expect(parsed.feedbackModels.inkRippleAndSave.easing).toBe(INK_RIPPLE_EASING);
    expect(parsed.feedbackModels.eyedropperLoupe.violetSlopDetected).toBe(true);
    expect(isVioletSlopHue(parsed.feedbackModels.eyedropperLoupe.safeHueDeg)).toBe(false);
    expect(parsed.accessibility.minTouchTargetPx).toBe(44);
    expect(parsed.accessibility.colorOnlyCueFree).toBe(true);
  });
});

describe("6. StudioImmersiveFeedbackHudPanel 라이브 인터랙션 & SVG 시각화 검증", () => {
  it("props 없이 단독 렌더링되며 기본 96% 풀블리드 모드와 라이브 SVG를 표시한다", () => {
    render(<StudioImmersiveFeedbackHudPanel />);
    const panel = screen.getByTestId("atelier-tactile-hud-panel");
    expect(panel.textContent).toContain("96% CANVAS");
    const svg = screen.getByTestId("tactile-live-canvas-svg");
    expect(svg.getAttribute("data-viewport-mode")).toBe("full-bleed-96");
    expect(svg.getAttribute("data-canvas-occupancy")).toBe("96");
    expect(screen.queryByTestId("tactile-svg-topbar")).toBeNull();
    expect(screen.queryByTestId("tactile-svg-inspector")).toBeNull();
  });

  it("locale='en'과 initialMode='workbench-82' props가 영문 UI와 82% 워크벤치 크롬을 반영한다", () => {
    render(<StudioImmersiveFeedbackHudPanel locale="en" initialMode="workbench-82" />);
    expect(screen.getByTestId("atelier-tactile-hud-panel").textContent).toContain("Atelier Immersive Mode");
    const svg = screen.getByTestId("tactile-live-canvas-svg");
    expect(svg.getAttribute("data-viewport-mode")).toBe("workbench-82");
    expect(svg.getAttribute("data-canvas-occupancy")).toBe("82");
    expect(screen.getByTestId("tactile-svg-topbar")).toBeTruthy();
    expect(screen.getByTestId("tactile-svg-left-rail")).toBeTruthy();
    expect(screen.getByTestId("tactile-svg-inspector")).toBeTruthy();
  });

  it("96% 풀블리드 토글 및 3단계 모드 버튼 클릭 시 SVG 크롬이 즉시 전환되고 onModeChange가 호출된다", () => {
    const onModeChange = vi.fn();
    render(<StudioImmersiveFeedbackHudPanel onModeChange={onModeChange} />);

    fireEvent.click(screen.getByTestId("tactile-mode-calm-studio-88"));
    expect(screen.getByTestId("tactile-live-canvas-svg").getAttribute("data-canvas-occupancy")).toBe("88");
    expect(screen.getByTestId("tactile-svg-topbar")).toBeTruthy();
    expect(screen.getByTestId("tactile-svg-left-rail")).toBeTruthy();
    expect(screen.queryByTestId("tactile-svg-inspector")).toBeNull();

    fireEvent.click(screen.getByTestId("tactile-full-bleed-toggle-btn"));
    expect(screen.getByTestId("tactile-live-canvas-svg").getAttribute("data-viewport-mode")).toBe("full-bleed-96");
    expect(onModeChange).toHaveBeenCalledTimes(2);
    expect(onModeChange.mock.calls[1]?.[0]).toBe("full-bleed-96");
  });

  it("96% 풀블리드에서 가장자리 근접 시연 버튼과 포인터 호버로 28px 플로팅 필이 부상하고 벗어날 때 숨겨진다", () => {
    render(<StudioImmersiveFeedbackHudPanel />);
    const svg = screen.getByTestId("tactile-live-canvas-svg");
    expect(svg.getAttribute("data-edge-revealed")).toBe("false");

    fireEvent.click(screen.getByTestId("tactile-edge-proximity-btn"));
    expect(svg.getAttribute("data-edge-revealed")).toBe("true");
    expect(screen.getByTestId("tactile-svg-edge-pill").getAttribute("opacity")).toBe("0.94");

    const zone = screen.getByTestId("tactile-stage-hover-zone");
    fireEvent.pointerLeave(zone);
    expect(svg.getAttribute("data-edge-revealed")).toBe("false");

    vi.spyOn(zone, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 560,
      bottom: 320,
      width: 560,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerMove(zone, { clientX: 200, clientY: 12 });
    expect(svg.getAttribute("data-edge-revealed")).toBe("true");
  });

  it("4종 아틀리에 표면 테마를 전환할 때마다 SVG 표면 속성과 종이결 수치가 갱신된다", () => {
    render(<StudioImmersiveFeedbackHudPanel />);
    const svg = screen.getByTestId("tactile-live-canvas-svg");
    for (const surface of ATELIER_SURFACE_THEMES) {
      fireEvent.click(screen.getByTestId(`tactile-surface-${surface.id}`));
      expect(svg.getAttribute("data-surface-id")).toBe(surface.id);
      assertZeroVioletAndRawColors(svg.outerHTML);
    }
  });

  it("브러시 크기·불투명도 슬라이더 조작 시 자동 소멸 HUD 필이 즉시 뜨고 900ms 후 자동 소멸한다", () => {
    vi.useFakeTimers();
    render(<StudioImmersiveFeedbackHudPanel />);
    const svg = screen.getByTestId("tactile-live-canvas-svg");
    expect(svg.getAttribute("data-ephemeral-visible")).toBe("false");

    fireEvent.change(screen.getByTestId("tactile-slider-brush-size"), { target: { value: "64" } });
    expect(svg.getAttribute("data-ephemeral-visible")).toBe("true");
    expect(screen.getByTestId("tactile-svg-ephemeral-pill")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(EPHEMERAL_PILL_TTL_MS);
    });
    expect(svg.getAttribute("data-ephemeral-visible")).toBe("false");

    fireEvent.change(screen.getByTestId("tactile-slider-brush-opacity"), { target: { value: "52" } });
    expect(svg.getAttribute("data-ephemeral-visible")).toBe("true");
    act(() => {
      vi.advanceTimersByTime(EPHEMERAL_PILL_TTL_MS);
    });
    expect(svg.getAttribute("data-ephemeral-visible")).toBe("false");
  });

  it("필압·기울기 슬라이더 변경이 펜촉 헤일로 수치를 즉시 갱신한다", () => {
    render(<StudioImmersiveFeedbackHudPanel />);
    const before = screen.getByTestId("tactile-metric-nib").textContent;
    fireEvent.change(screen.getByTestId("tactile-slider-pressure"), { target: { value: "98" } });
    fireEvent.change(screen.getByTestId("tactile-slider-tilt"), { target: { value: "18" } });
    const after = screen.getByTestId("tactile-metric-nib").textContent;
    expect(after).not.toBe(before);
  });

  it("실행취소·OPFS 저장·스냅·오프라인 앰버 버튼이 잉크 파동과 OPFS 상태 점을 정확히 전환한다", () => {
    vi.useFakeTimers();
    render(<StudioImmersiveFeedbackHudPanel />);
    const svg = screen.getByTestId("tactile-live-canvas-svg");

    fireEvent.click(screen.getByTestId("tactile-action-undo"));
    expect(svg.getAttribute("data-ripple-action")).toBe("undo");
    expect(svg.getAttribute("data-ripple-active")).toBe("true");
    expect(screen.getByTestId("tactile-svg-ink-ripple")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(INK_RIPPLE_DURATION_MS);
    });
    expect(svg.getAttribute("data-ripple-active")).toBe("false");

    fireEvent.click(screen.getByTestId("tactile-action-opfs-save"));
    expect(svg.getAttribute("data-opfs-status")).toBe("saving-pulse");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(svg.getAttribute("data-opfs-status")).toBe("steady-forest");

    fireEvent.click(screen.getByTestId("tactile-action-offline"));
    expect(svg.getAttribute("data-opfs-status")).toBe("offline-amber");

    fireEvent.click(screen.getByTestId("tactile-action-snap"));
    expect(svg.getAttribute("data-ripple-action")).toBe("snap");
  });

  it("스포이드 루페에서 바이올렛 292° 테스트 프리셋 선택 시 회피 안내가 뜨고 SVG는 탈-바이올렛을 유지한다", () => {
    render(<StudioImmersiveFeedbackHudPanel />);
    const svg = screen.getByTestId("tactile-live-canvas-svg");

    fireEvent.click(screen.getByTestId("tactile-swatch-violet-guard-probe"));
    expect(svg.getAttribute("data-loupe-active")).toBe("true");
    expect(svg.getAttribute("data-loupe-violet-detected")).toBe("true");
    expect(screen.getByTestId("tactile-loupe-guidance").textContent).toContain("자동 회피");
    assertZeroVioletAndRawColors(svg.outerHTML);

    fireEvent.click(screen.getByTestId("tactile-action-loupe"));
    expect(svg.getAttribute("data-loupe-active")).toBe("false");
    expect(screen.queryByTestId("tactile-svg-loupe")).toBeNull();
  });

  it("모션 감소 스위치가 aria-checked와 0ms 즉시 스냅 상태를 토글하고 초기화 버튼이 기본 상태를 복원한다", () => {
    render(<StudioImmersiveFeedbackHudPanel />);
    const rmSwitch = screen.getByTestId("tactile-reduced-motion-switch");
    expect(rmSwitch.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(rmSwitch);
    expect(rmSwitch.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("tactile-live-canvas-svg").getAttribute("data-reduced-motion")).toBe("true");
    expect(screen.getByTestId("tactile-metric-opfs").textContent).toBe("0ms");

    fireEvent.click(screen.getByTestId("tactile-reset-btn"));
    expect(rmSwitch.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("tactile-live-canvas-svg").getAttribute("data-viewport-mode")).toBe("full-bleed-96");
  });

  it("JSON 복사 버튼이 클립보드 기록 및 onExportJson을 호출하고 미리보기 토글이 JSON을 표시한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const onExportJson = vi.fn();

    render(<StudioImmersiveFeedbackHudPanel onExportJson={onExportJson} />);

    fireEvent.click(screen.getByTestId("tactile-copy-json-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("tactile-copy-status")).toBeTruthy();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(onExportJson).toHaveBeenCalledTimes(1);
    const copiedJson = writeText.mock.calls[0]?.[0] as string;
    expect(copiedJson).toContain(TACTILE_SPEC_SCHEMA_VERSION);

    fireEvent.click(screen.getByTestId("tactile-toggle-json-btn"));
    const preview = screen.getByTestId("tactile-json-preview");
    expect(preview.textContent).toContain("full-bleed-96");
  });

  it("클립보드 쓰기 실패 시 오류 알림(role='alert')을 표시하고 UI가 깨지지 않는다", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    render(<StudioImmersiveFeedbackHudPanel />);
    fireEvent.click(screen.getByTestId("tactile-copy-json-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("tactile-copy-error")).toBeTruthy();
    });
    expect(screen.getByTestId("tactile-copy-error").getAttribute("role")).toBe("alert");
  });
});

describe("7. 엄격 품질·하네스 계약 및 Anti-Slop 자가 검증", () => {
  it("소유 파일 4종이 정확히 존재하고 줄 수 상한(engine<=720, panel<=680, all<=800) 및 금지 패턴 0건을 지킨다", () => {
    const dir = path.resolve(import.meta.dirname);
    const expected = [
      "atelier-tactile-engine.ts",
      "StudioImmersiveFeedbackHudPanel.tsx",
      "index.ts",
      "atelier-tactile-feedback.test.tsx",
    ];
    for (const file of expected) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles).toHaveLength(4);

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "atelier-tactile-engine.ts") expect(lines).toBeLessThanOrEqual(720);
      if (file === "StudioImmersiveFeedbackHudPanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "atelier-tactile-feedback.test.tsx") {
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

      if (file === "StudioImmersiveFeedbackHudPanel.tsx") {
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("렌더된 모든 버튼이 min-h-11을 유지하고 모든 모드·테마 조합에서 SVG 원시 색·바이올렛 0건을 보장한다", () => {
    const modes: readonly ImmersiveViewportModeId[] = ["full-bleed-96", "calm-studio-88", "workbench-82"];
    for (const mode of modes) {
      const { container, unmount } = render(<StudioImmersiveFeedbackHudPanel initialMode={mode} />);
      const buttons = container.querySelectorAll("button");
      expect(buttons.length).toBeGreaterThanOrEqual(16);
      for (const btn of buttons) {
        expect(btn.className).toContain("min-h-11");
      }
      const svgs = container.querySelectorAll("svg");
      expect(svgs.length).toBeGreaterThanOrEqual(1);
      for (const svg of svgs) {
        assertZeroVioletAndRawColors(svg.outerHTML);
      }
      unmount();
    }
  });

  it("소유 4파일이 금지 도메인(vrm·bg3d·market·apps/api·apps/admin-web)을 정적으로 import하지 않는다", () => {
    const dir = path.resolve(import.meta.dirname);
    const files = [
      "atelier-tactile-engine.ts",
      "StudioImmersiveFeedbackHudPanel.tsx",
      "index.ts",
      "atelier-tactile-feedback.test.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const importLines = src.split(/\r?\n/).filter((line) => /^\s*import\b/u.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/\/(?:vrm|bg3d|market)\b/u);
        expect(line).not.toContain("apps/api");
        expect(line).not.toContain("apps/admin-web");
      }
    }
  });
});
