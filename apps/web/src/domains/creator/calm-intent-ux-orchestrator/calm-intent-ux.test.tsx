// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATELIER_THEMES,
  COLOR_VISION_MODES,
  COMPLEXITY_TIERS,
  CREATIVE_INTENT_CATALOG,
  INTENT_QUICK_CHIPS,
  MULTIMODAL_GESTURE_MATRIX,
  OVERCROWDED_UI_BASELINE,
  RADIAL_PIE_WHEEL_SLOTS,
  StudioCalmIntentUxPanel,
  WORKFLOW_STAGES,
  auditScreenCognitiveLoad,
  auditVioletSlopAcrossThemes,
  buildCalmIntentUxProfile,
  computeFittsMovementMetrics,
  computeHickDecisionMs,
  computeOklchContrastRatio,
  countForbiddenJargonInTexts,
  evaluateAtelierDesignPolish,
  exportCalmIntentUxJson,
  formatOklch,
  getAtelierTheme,
  getColorVisionMode,
  getComplexityTier,
  getGestureMatrixForHandedness,
  getRadialPieWheelSlots,
  getVisibleControlsForTierStage,
  getWorkflowStage,
  isVioletSlopHue,
  resolveCreativeIntent,
  sanitizeNonVioletHue,
  simulateColorVisionOklch,
  type AtelierThemeId,
  type ColorVisionModeId,
  type ComplexityTierId,
  type WorkflowStageId,
} from "./index";

afterEach(cleanup);

function assertZeroVioletAndRawColors(svgMarkup: string): void {
  expect(svgMarkup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(svgMarkup).not.toMatch(/\brgba?\s*\(/iu);
  expect(svgMarkup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const match of svgMarkup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isVioletSlopHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 3단 점진적 화면 압축(Zen 94% · Stage 86% · Pro 82%) & 6단계 작업 흐름", () => {
  it("COMPLEXITY_TIERS가 Zen 94%(5컨트롤) · Stage 86%(7컨트롤) · Pro 82%(9컨트롤) 규격을 정확히 제공한다", () => {
    expect(COMPLEXITY_TIERS.map((t) => `${t.id}:${t.canvasViewportPercent}:${t.visibleControlCount}`)).toEqual([
      "zen-focus:94:5",
      "stage-flow:86:7",
      "atelier-pro:82:9",
    ]);
    for (const tier of COMPLEXITY_TIERS) {
      expect(tier.canvasViewportPercent).toBeGreaterThanOrEqual(82);
      expect(tier.canvasViewportPercent + tier.chromeOccupancyPercent).toBe(100);
      expect(tier.minTouchTargetPx).toBeGreaterThanOrEqual(44);
    }
  });

  it("6단계 작업 흐름이 단계별로 정확히 7개 기본 컨트롤 + 2개 프로 서랍 컨트롤을 보유한다", () => {
    expect(WORKFLOW_STAGES).toHaveLength(6);
    expect(WORKFLOW_STAGES.map((s) => s.id)).toEqual([
      "sketch",
      "ink",
      "color-light",
      "scene-3d",
      "letter-fx",
      "publish-goods",
    ]);
    for (const stage of WORKFLOW_STAGES) {
      expect(stage.controls).toHaveLength(7);
      expect(stage.proDrawerExtras).toHaveLength(2);
    }
  });

  it("getVisibleControlsForTierStage가 Zen 5개 · Stage 7개 · Pro 9개(서랍 접힘 시 7개)를 반환한다", () => {
    for (const stage of WORKFLOW_STAGES) {
      expect(getVisibleControlsForTierStage("zen-focus", stage.id)).toHaveLength(5);
      expect(getVisibleControlsForTierStage("stage-flow", stage.id)).toHaveLength(7);
      expect(getVisibleControlsForTierStage("atelier-pro", stage.id, true)).toHaveLength(9);
      expect(getVisibleControlsForTierStage("atelier-pro", stage.id, false)).toHaveLength(7);
    }
  });

  it("6단계 전체 컨트롤과 힌트에 금지 내부 전문용어가 0건이다", () => {
    for (const stage of WORKFLOW_STAGES) {
      const texts = [...stage.controls, ...stage.proDrawerExtras].flatMap((c) => [
        c.labelKo,
        c.hintKo,
        c.labelEn,
        c.hintEn,
      ]);
      expect(countForbiddenJargonInTexts(texts)).toBe(0);
    }
  });

  it("조회 헬퍼가 미등록 ID 입력에도 안전하게 기본값으로 폴백한다", () => {
    expect(getComplexityTier("unknown" as ComplexityTierId).id).toBe("stage-flow");
    expect(getWorkflowStage("unknown" as WorkflowStageId).id).toBe("sketch");
    expect(getAtelierTheme("unknown" as AtelierThemeId).id).toBe("ink-slate-dark");
    expect(getColorVisionMode("unknown" as ColorVisionModeId).id).toBe("normal");
  });
});

describe("2. 인지 부하 정량 감사기 (Hick-Hyman · Fitts 8방향 휠 · 0% 전문용어 · 44px 터치)", () => {
  it("Hick-Hyman 법칙 선택 시간(200 + 155 * log2(n + 1))이 과밀 72개 대비 5/7/9개에서 정확히 계산된다", () => {
    expect(computeHickDecisionMs(72)).toBeCloseTo(200 + 155 * Math.log2(73), 0);
    expect(computeHickDecisionMs(7)).toBeCloseTo(200 + 155 * 3, 1);
    expect(computeHickDecisionMs(5)).toBeLessThan(computeHickDecisionMs(7));
    expect(computeHickDecisionMs(7)).toBeLessThan(computeHickDecisionMs(9));
    expect(computeHickDecisionMs(9)).toBeLessThan(computeHickDecisionMs(72));
  });

  it("Fitts's Law 계산이 8방향 파이 휠(68~76px, 폭 64px)의 이동거리·포인팅 시간 절감을 정량 증명한다", () => {
    const legacy = computeFittsMovementMetrics(
      OVERCROWDED_UI_BASELINE.fittsTravelDistancePx,
      OVERCROWDED_UI_BASELINE.fittsTargetWidthPx,
    );
    const pie = computeFittsMovementMetrics(76, 64);
    expect(pie.indexOfDifficultyBits).toBeLessThan(legacy.indexOfDifficultyBits / 3);
    expect(pie.movementMs).toBeLessThan(legacy.movementMs * 0.45);
  });

  it("auditScreenCognitiveLoad가 Zen/Stage/Pro 모두에서 과밀 UI(72개) 대비 87%+ 컨트롤 감축을 검증한다", () => {
    const zen = auditScreenCognitiveLoad("zen-focus", "sketch");
    const stage = auditScreenCognitiveLoad("stage-flow", "color-light");
    const pro = auditScreenCognitiveLoad("atelier-pro", "publish-goods");

    expect(zen.overcrowdedBaseline.visibleControlCount).toBe(72);
    expect(zen.toonStudioActive.visibleControlCount).toBe(5);
    expect(zen.controlReductionPercent).toBeGreaterThan(93);
    expect(stage.controlReductionPercent).toBeGreaterThan(90);
    expect(pro.controlReductionPercent).toBeGreaterThanOrEqual(87.5);
  });

  it("auditScreenCognitiveLoad의 Hick 단축률·Fitts 이동거리 절감률이 단조롭게 유지된다", () => {
    const zen = auditScreenCognitiveLoad("zen-focus", "ink");
    const stage = auditScreenCognitiveLoad("stage-flow", "ink");
    const pro = auditScreenCognitiveLoad("atelier-pro", "ink");

    expect(zen.hickTimeSavedPercent).toBeGreaterThan(stage.hickTimeSavedPercent);
    expect(stage.hickTimeSavedPercent).toBeGreaterThan(pro.hickTimeSavedPercent);
    expect(zen.fittsTravelSavedPercent).toBeGreaterThan(86);
    expect(stage.fittsTravelSavedPercent).toBeGreaterThan(85);
    expect(zen.fittsTimeSavedPercent).toBeGreaterThan(58);
  });

  it("모든 단계에서 전문용어 노출률 0%, 44×44px 터치 적합률 100%, 82%+ 캔버스 계약을 충족한다", () => {
    for (const tier of COMPLEXITY_TIERS) {
      const audit = auditScreenCognitiveLoad(tier.id, "scene-3d");
      expect(audit.toonStudioActive.jargonExposurePercent).toBe(0);
      expect(audit.overcrowdedBaseline.jargonExposurePercent).toBeGreaterThan(35);
      expect(audit.jargonEliminatedPercent).toBe(100);
      expect(audit.toonStudioActive.touchReadyPercent).toBe(100);
      expect(audit.overcrowdedBaseline.touchReadyPercent).toBeLessThan(50);
      expect(audit.meetsCanvas82Contract).toBe(true);
      expect(audit.meetsZeroJargonTarget).toBe(true);
      expect(audit.calmIndexScore).toBeGreaterThanOrEqual(85);
    }
  });
});

describe("3. 0-용어 의도 기반 한국어·영어 커맨드 라우터 (resolveCreativeIntent)", () => {
  it("8대 필수 한국어 의도 문장 카탈로그와 6종 원클릭 칩을 제공한다", () => {
    expect(CREATIVE_INTENT_CATALOG).toHaveLength(8);
    expect(INTENT_QUICK_CHIPS).toHaveLength(6);
  });

  it("'역광 넣어줘'를 평이한 한글 액션 카드 2개 + 고스트 프리뷰로 라우팅한다", () => {
    const res = resolveCreativeIntent("역광 넣어줘");
    expect(res.matched).toBe(true);
    expect(res.intentId).toBe("rim-backlight");
    expect(res.recommendedStage).toBe("color-light");
    expect(res.cards.length).toBeGreaterThanOrEqual(1);
    expect(res.cards.length).toBeLessThanOrEqual(2);
    expect(res.jargonFreeVerified).toBe(true);
    expect(res.cards[0].ghostPreviewKo.length).toBeGreaterThan(10);
  });

  it("'손이 어색해'를 자연스러운 손 관절 다듬기 액션 카드와 고스트 프리뷰로 라우팅한다", () => {
    const res = resolveCreativeIntent("손이 어색해");
    expect(res.matched).toBe(true);
    expect(res.intentId).toBe("hand-anatomy-fix");
    expect(res.recommendedStage).toBe("scene-3d");
    expect(res.jargonFreeVerified).toBe(true);
  });

  it("'크레용 질감'을 도화지 크레용·종이 결 액션 카드로 라우팅한다", () => {
    const res = resolveCreativeIntent("크레용 질감");
    expect(res.matched).toBe(true);
    expect(res.intentId).toBe("crayon-paper-texture");
    expect(res.recommendedStage).toBe("color-light");
    expect(res.jargonFreeVerified).toBe(true);
  });

  it("'용량 줄여줘'를 화질 유지 용량 최적화·플랫폼 규격 분할 카드로 라우팅한다", () => {
    const res = resolveCreativeIntent("용량 줄여줘");
    expect(res.matched).toBe(true);
    expect(res.intentId).toBe("episode-size-slim");
    expect(res.recommendedStage).toBe("publish-goods");
    expect(res.jargonFreeVerified).toBe(true);
  });

  it("'굿즈 칼선'을 키링·스티커 칼선 및 흰색 밑판 점검 카드로 라우팅한다", () => {
    const res = resolveCreativeIntent("굿즈 칼선");
    expect(res.matched).toBe(true);
    expect(res.intentId).toBe("goods-cutline");
    expect(res.recommendedStage).toBe("publish-goods");
    expect(res.jargonFreeVerified).toBe(true);
  });

  it("'3D 창틀'을 원근 맞춤 창틀 배치·선화 추출 카드로 라우팅한다", () => {
    const res = resolveCreativeIntent("3D 창틀");
    expect(res.matched).toBe(true);
    expect(res.intentId).toBe("scene-window-frame");
    expect(res.recommendedStage).toBe("scene-3d");
    expect(res.jargonFreeVerified).toBe(true);
  });

  it("'종이 전개도'를 A4 오려 접는 도면·0°→90° 접힘 프리뷰 카드로 라우팅한다", () => {
    const res = resolveCreativeIntent("종이 전개도");
    expect(res.matched).toBe(true);
    expect(res.intentId).toBe("papercraft-unfold");
    expect(res.recommendedStage).toBe("publish-goods");
    expect(res.jargonFreeVerified).toBe(true);
  });

  it("'저작권 증명'을 상업 소재 안전 점검표·창작 이력 확인서 카드로 라우팅한다", () => {
    const res = resolveCreativeIntent("저작권 증명");
    expect(res.matched).toBe(true);
    expect(res.intentId).toBe("copyright-proof");
    expect(res.recommendedStage).toBe("publish-goods");
    expect(res.jargonFreeVerified).toBe(true);
  });

  it("영어 의도 질의(add rim backlight / crayon texture / 3d window frame / copyright proof)도 정확히 매칭한다", () => {
    expect(resolveCreativeIntent("add rim backlight").intentId).toBe("rim-backlight");
    expect(resolveCreativeIntent("fix awkward hand").intentId).toBe("hand-anatomy-fix");
    expect(resolveCreativeIntent("crayon texture").intentId).toBe("crayon-paper-texture");
    expect(resolveCreativeIntent("reduce file size").intentId).toBe("episode-size-slim");
    expect(resolveCreativeIntent("goods cutline").intentId).toBe("goods-cutline");
    expect(resolveCreativeIntent("3d window frame").intentId).toBe("scene-window-frame");
    expect(resolveCreativeIntent("papercraft unfold").intentId).toBe("papercraft-unfold");
    expect(resolveCreativeIntent("copyright proof").intentId).toBe("copyright-proof");
  });

  it("미매칭·빈 질의에도 오류 화면 대신 현재 단계 기반 0-용어 폴백 액션 카드를 반환한다", () => {
    const emptyRes = resolveCreativeIntent("   ", "ink");
    expect(emptyRes.matched).toBe(false);
    expect(emptyRes.intentId).toBe("stage-guided-fallback");
    expect(emptyRes.recommendedStage).toBe("ink");
    expect(emptyRes.cards).toHaveLength(1);
    expect(emptyRes.jargonFreeVerified).toBe(true);
  });
});

describe("4. 8방향 근육기억 방사형 파이 휠 & 멀티모달 제스처 매트릭스", () => {
  it("RADIAL_PIE_WHEEL_SLOTS가 45° 간격 8방향(N~NW) 슬롯을 정확히 구성한다", () => {
    expect(RADIAL_PIE_WHEEL_SLOTS).toHaveLength(8);
    expect(RADIAL_PIE_WHEEL_SLOTS.map((s) => s.direction)).toEqual(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
    expect(RADIAL_PIE_WHEEL_SLOTS.map((s) => s.angleDeg)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });

  it("왼손잡이 미러링(getRadialPieWheelSlots(true))이 N/S는 고정하고 E↔W · NE↔NW · SE↔SW를 대칭 반전한다", () => {
    const mirrored = getRadialPieWheelSlots(true);
    const byId = Object.fromEntries(mirrored.map((s) => [s.id, s]));
    expect(byId["undo"].direction).toBe("N");
    expect(byId["eraser"].direction).toBe("S");
    expect(byId["brush-size"].direction).toBe("W");
    expect(byId["flip-canvas"].direction).toBe("E");
    expect(byId["redo"].direction).toBe("NW");
    expect(byId["zen-toggle"].direction).toBe("NE");
    expect(byId["layers"].direction).toBe("SW");
    expect(byId["eyedropper"].direction).toBe("SE");
    expect(byId["brush-size"].unitX).toBeCloseTo(-1, 3);
    expect(byId["flip-canvas"].unitX).toBeCloseTo(1, 3);
  });

  it("멀티모달 제스처 매트릭스가 2·3·4손가락 터치 · 펜 스퀴즈 · 배럴 롤 · 왼손잡이 스와이프를 모두 포함한다", () => {
    const ids = MULTIMODAL_GESTURE_MATRIX.map((g) => g.id);
    expect(ids).toContain("two-finger-tap");
    expect(ids).toContain("three-finger-tap");
    expect(ids).toContain("four-finger-tap");
    expect(ids).toContain("pen-squeeze");
    expect(ids).toContain("pen-barrel-roll");
    expect(ids).toContain("handed-edge-swipe");

    const rightHanded = getGestureMatrixForHandedness(false).find((g) => g.id === "handed-edge-swipe");
    const leftHanded = getGestureMatrixForHandedness(true).find((g) => g.id === "handed-edge-swipe");
    expect(rightHanded?.handednessNoteKo).toContain("오른손잡이");
    expect(leftHanded?.handednessNoteKo).toContain("왼손잡이 미러링 활성");
  });
});

describe("5. 디자인 시스템 5대 시각 고도화 감사기 (4종 테마 × 4종 색각안전 · 동심원 · 85/10/5 · 바이올렛 0%)", () => {
  it("4종 테마 × 4종 색각안전 16조합 전체가 목표 대비비를 통과하고 WCAG AAA 테마는 전 색각에서 7:1+를 달성한다", () => {
    expect(ATELIER_THEMES).toHaveLength(4);
    expect(COLOR_VISION_MODES).toHaveLength(4);

    const audit = evaluateAtelierDesignPolish("wcag-aaa-ultra", "deuteranopia");
    expect(audit.matrix16).toHaveLength(16);
    expect(audit.matrixPassCount).toBe(16);
    expect(audit.aaaThemeAllVisionPass).toBe(true);

    for (const row of audit.matrix16) {
      expect(row.meetsThemeTarget).toBe(true);
      expect(row.passesAa).toBe(true);
      if (row.themeId === "wcag-aaa-ultra") {
        expect(row.bodyContrastRatio).toBeGreaterThanOrEqual(7.0);
        expect(row.mutedContrastRatio).toBeGreaterThanOrEqual(7.0);
        expect(row.accentContrastRatio).toBeGreaterThanOrEqual(7.0);
        expect(row.buttonTextContrastRatio).toBeGreaterThanOrEqual(7.0);
        expect(row.passesAaa).toBe(true);
      }
    }
  });

  it("OKLCH 대비비와 색각안전 시뮬레이션이 실제 휘도·색도 변환으로 결정론적 값을 계산한다", () => {
    const darkBg = { l: 0.14, c: 0.01, h: 235 };
    const lightFg = { l: 0.96, c: 0.008, h: 88 };
    const ratio = computeOklchContrastRatio(lightFg, darkBg, "normal");
    expect(ratio).toBeGreaterThan(13);

    const warmRed = { l: 0.56, c: 0.18, h: 28 };
    const protan = simulateColorVisionOklch(warmRed, "protanopia");
    const tritan = simulateColorVisionOklch(warmRed, "tritanopia");
    expect(protan.h).not.toBe(warmRed.h);
    expect(isVioletSlopHue(protan.h)).toBe(false);
    expect(isVioletSlopHue(tritan.h)).toBe(false);
  });

  it("동심원 곡률(20-8=12, 12-4=8, 오차 0px) 및 85/10/5 시각 비율(합계 100%)을 검증한다", () => {
    const audit = evaluateAtelierDesignPolish("warm-alabaster-light", "normal");
    expect(audit.concentricRadius.exactConcentric).toBe(true);
    expect(audit.concentricRadius.maxDriftPx).toBe(0);
    expect(audit.concentricRadius.outerPanelRadiusPx - audit.concentricRadius.innerPaddingPx).toBe(
      audit.concentricRadius.cardRadiusPx,
    );
    expect(audit.concentricRadius.cardRadiusPx - audit.concentricRadius.cardGapPx).toBe(
      audit.concentricRadius.controlRadiusPx,
    );

    expect(audit.visualBalance).toEqual({
      neutralCanvasPercent: 85,
      secondaryChromePercent: 10,
      accentSignalPercent: 5,
      totalPercent: 100,
      passesRule: true,
    });
  });

  it("바이올렛 슬롭 휴(270~320°) 가드 및 4종 테마 전 토큰 바이올렛 0%를 검증한다", () => {
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(295)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(248)).toBe(false);
    expect(isVioletSlopHue(342)).toBe(false);
    for (let h = 270; h <= 320; h += 5) {
      expect(isVioletSlopHue(sanitizeNonVioletHue(h))).toBe(false);
    }

    const formatted = formatOklch({ l: 0.65, c: 0.16, h: 285 }, 0.45);
    expect(formatted).toBe("oklch(0.65 0.16 248 / 0.45)");
    expect(formatted).not.toMatch(/#|rgb|hsl/iu);

    const slopAudit = auditVioletSlopAcrossThemes();
    expect(slopAudit.inspectedTokenCount).toBe(48);
    expect(slopAudit.violetTokenCount).toBe(0);
    expect(slopAudit.violetSlopPercent).toBe(0);
    expect(slopAudit.passed).toBe(true);
  });

  it("exportCalmIntentUxJson이 유효한 v1 스키마 JSON과 전체 감사 필드를 출력한다", () => {
    const snap = buildCalmIntentUxProfile({
      tierId: "zen-focus",
      stageId: "sketch",
      themeId: "warm-sepia-paper",
      visionModeId: "tritanopia",
      intentQuery: "굿즈 칼선",
      leftHanded: true,
      proDrawerOpen: false,
    });
    const parsed = JSON.parse(exportCalmIntentUxJson(snap)) as {
      schemaVersion: string;
      complexityTier: { id: string; canvasViewportPercent: number };
      intentRouter: { intentId: string; jargonFreeVerified: boolean };
      radialPieWheel: { leftHandedMirrored: boolean; slots: readonly unknown[] };
      designPolish: { matrixPassCount: number; violetSlopPercent: number };
    };
    expect(parsed.schemaVersion).toBe("toonstudio.calm-intent-ux-orchestrator.v1");
    expect(parsed.complexityTier.id).toBe("zen-focus");
    expect(parsed.complexityTier.canvasViewportPercent).toBe(94);
    expect(parsed.intentRouter.intentId).toBe("goods-cutline");
    expect(parsed.intentRouter.jargonFreeVerified).toBe(true);
    expect(parsed.radialPieWheel.leftHandedMirrored).toBe(true);
    expect(parsed.radialPieWheel.slots).toHaveLength(8);
    expect(parsed.designPolish.matrixPassCount).toBe(16);
    expect(parsed.designPolish.violetSlopPercent).toBe(0);
  });
});

describe("6. StudioCalmIntentUxPanel 인터랙션 · 고스트 프리뷰 · 콜백 · 다국어", () => {
  it("기본 렌더링 시 Stage 86% · 7컨트롤 · 0% 전문용어 · 2단 시맨틱 SVG가 표시된다", () => {
    render(<StudioCalmIntentUxPanel />);
    const wheelSvg = screen.getByTestId("calm-ux-viewport-wheel-svg");
    const chartSvg = screen.getByTestId("calm-ux-metrics-chart-svg");
    expect(wheelSvg.getAttribute("data-tier-id")).toBe("stage-flow");
    expect(wheelSvg.getAttribute("data-canvas-percent")).toBe("86");
    expect(wheelSvg.getAttribute("data-control-count")).toBe("7");
    expect(chartSvg.getAttribute("data-balance-rule")).toBe("85-10-5");
    expect(screen.getByTestId("calm-ux-jargon-badge").textContent).toContain("전문용어 0%");
  });

  it("3단 압축 모드(Zen 94% / Stage 86% / Pro 82%)와 프로 서랍 1클릭 토글이 즉시 반영된다", () => {
    const onProfileChange = vi.fn();
    render(<StudioCalmIntentUxPanel onProfileChange={onProfileChange} />);

    fireEvent.click(screen.getByTestId("calm-ux-tier-zen-focus"));
    expect(screen.getByTestId("calm-ux-viewport-wheel-svg").getAttribute("data-canvas-percent")).toBe("94");
    expect(screen.getByTestId("calm-ux-viewport-wheel-svg").getAttribute("data-control-count")).toBe("5");

    fireEvent.click(screen.getByTestId("calm-ux-tier-atelier-pro"));
    expect(screen.getByTestId("calm-ux-viewport-wheel-svg").getAttribute("data-canvas-percent")).toBe("82");
    expect(screen.getByTestId("calm-ux-viewport-wheel-svg").getAttribute("data-control-count")).toBe("9");

    fireEvent.click(screen.getByTestId("calm-ux-pro-drawer-toggle"));
    expect(screen.getByTestId("calm-ux-viewport-wheel-svg").getAttribute("data-control-count")).toBe("7");
    expect(onProfileChange).toHaveBeenCalledTimes(3);
  });

  it("6단계 작업 흐름 전환 시 해당 단계의 평이한 한글 컨트롤 목록으로 갱신된다", () => {
    render(<StudioCalmIntentUxPanel />);
    fireEvent.click(screen.getByTestId("calm-ux-stage-publish-goods"));
    const controlsText = screen.getByTestId("calm-ux-visible-controls-list").textContent ?? "";
    expect(controlsText).toContain("용량 줄이기");
    expect(controlsText).toContain("굿즈 칼선");
    expect(controlsText).toContain("종이 전개도");
    expect(controlsText).toContain("저작권 확인");
  });

  it("0-용어 의도 검색창 입력 및 6종 원클릭 칩 클릭이 액션 카드와 권장 단계를 즉시 갱신한다", () => {
    render(<StudioCalmIntentUxPanel />);
    fireEvent.click(screen.getByTestId("calm-ux-chip-goods-cutline"));
    expect(screen.getByTestId("calm-ux-intent-meta").textContent).toContain("goods-cutline");

    const input = screen.getByTestId("calm-ux-intent-input");
    fireEvent.change(input, { target: { value: "저작권 증명" } });
    expect(screen.getByTestId("calm-ux-intent-meta").textContent).toContain("copyright-proof");
    expect(screen.getByTestId("calm-ux-intent-cards").textContent).toContain("상업 이용 안전 점검표");

    fireEvent.change(input, { target: { value: "3D 창틀" } });
    expect(screen.getByTestId("calm-ux-intent-meta").textContent).toContain("scene-window-frame");
  });

  it("의도 액션 카드 호버 시 고스트 프리뷰 SVG 오버레이가 갱신되고 적용 클릭 시 권장 단계로 이동한다", () => {
    render(<StudioCalmIntentUxPanel initialStage="sketch" />);
    fireEvent.click(screen.getByTestId("calm-ux-chip-hand-anatomy-fix"));

    const card = screen.getByTestId("calm-ux-action-card-hand-fix-relax");
    fireEvent.mouseEnter(card);
    expect(screen.getByTestId("calm-ux-viewport-wheel-svg").getAttribute("data-ghost-card")).toBe("hand-fix-relax");

    fireEvent.click(screen.getByTestId("calm-ux-apply-card-hand-fix-relax"));
    expect(screen.getByTestId("calm-ux-stage-scene-3d").getAttribute("aria-pressed")).toBe("true");
  });

  it("4종 테마 · 4종 색각안전 · 왼손잡이 미러링 토글이 SVG 속성과 대비비 지표를 즉시 갱신한다", () => {
    render(<StudioCalmIntentUxPanel />);
    fireEvent.click(screen.getByTestId("calm-ux-theme-wcag-aaa-ultra"));
    fireEvent.click(screen.getByTestId("calm-ux-vision-protanopia"));
    fireEvent.click(screen.getByTestId("calm-ux-left-handed-toggle"));

    const wheelSvg = screen.getByTestId("calm-ux-viewport-wheel-svg");
    expect(wheelSvg.getAttribute("data-theme-id")).toBe("wcag-aaa-ultra");
    expect(wheelSvg.getAttribute("data-vision-mode")).toBe("protanopia");
    expect(wheelSvg.getAttribute("data-left-handed")).toBe("true");
    expect(screen.getByTestId("calm-ux-contrast-badge").textContent).toContain("WCAG-AAA");
  });

  it("JSON 복사·미리보기 토글·초기화 버튼과 onExportJson 콜백이 정상 동작한다", () => {
    const onExportJson = vi.fn();
    render(<StudioCalmIntentUxPanel onExportJson={onExportJson} />);

    expect(screen.queryByTestId("calm-ux-json-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("calm-ux-export-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.calm-intent-ux-orchestrator.v1");
    expect(screen.getByTestId("calm-ux-json-preview").textContent).toContain('"visualBalance85105"');

    fireEvent.click(screen.getByTestId("calm-ux-toggle-json-btn"));
    expect(screen.queryByTestId("calm-ux-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("calm-ux-tier-zen-focus"));
    fireEvent.click(screen.getByTestId("calm-ux-reset-btn"));
    expect(screen.getByTestId("calm-ux-viewport-wheel-svg").getAttribute("data-tier-id")).toBe("stage-flow");
  });

  it("영문 로케일(locale='en') 및 선택적 초기 props(initialTier/initialStage)를 정상 렌더링한다", () => {
    render(<StudioCalmIntentUxPanel locale="en" initialTier="zen-focus" initialStage="ink" />);
    expect(screen.getByTestId("calm-intent-ux-panel").getAttribute("aria-label")).toContain("Calm Intent UX");
    expect(screen.getByTestId("calm-ux-viewport-wheel-svg").getAttribute("data-tier-id")).toBe("zen-focus");
    expect(screen.getByTestId("calm-ux-viewport-wheel-svg").getAttribute("data-canvas-percent")).toBe("94");
    expect(screen.getByTestId("calm-ux-stage-ink").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("7. 엄격 품질·하네스 계약 및 Calm Atelier 자가 검증", () => {
  it("소유 파일 4종 존재, 줄 수 상한(engine<=750, panel<=680, all<=800) 및 금지 패턴 0건을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "calm-intent-ux-engine.ts",
      "StudioCalmIntentUxPanel.tsx",
      "index.ts",
      "calm-intent-ux.test.tsx",
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
      if (file === "calm-intent-ux-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioCalmIntentUxPanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "calm-intent-ux.test.tsx") {
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

      if (file === "StudioCalmIntentUxPanel.tsx") {
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

  it("렌더된 모든 버튼이 min-h-11을 유지하고 2단 SVG 모두 원시 색·바이올렛 휴(270~320°)가 0건이다", () => {
    const { container } = render(<StudioCalmIntentUxPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(24);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(2);
    for (const svg of svgs) {
      assertZeroVioletAndRawColors(svg.outerHTML);
    }
  });
});
