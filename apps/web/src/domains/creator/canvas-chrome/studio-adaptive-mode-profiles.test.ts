import { describe, expect, it } from "vitest";

import {
  ADAPTIVE_MODE_PRIMARY_TOOL_BUDGET,
  LAPTOP_REFERENCE_WIDTH_PX,
  STUDIO_ADAPTIVE_MODE_PROFILES,
  ULTRAWIDE_REFERENCE_WIDTH_PX,
  getStudioAdaptiveModeProfile,
  isWithinAdaptiveToolBudget,
  measureAdaptiveModeCanvasOccupancy,
  measureAdaptiveModeSwitchCls,
  resolveAdaptiveViewportTier,
  resolveFloatingPanelEdgeSnap,
} from "./studio-adaptive-mode-profiles";

const BANNED_TRANSLATIONESE =
  /(하는 것을 가능하게 합니다|직관적인 경험을 제공합니다|원활한 워크플로우를 보장)/u;

describe("Calm Atelier 5-모드 적응형 에디터 크롬 프로파일 (#081–#085)", () => {
  it("콘티 · 선화 · 채색 · 식자 · 3D 5개 모드가 각 5~9개 핵심 도구와 접힘 서랍 보조 도구를 선언한다", () => {
    expect(STUDIO_ADAPTIVE_MODE_PROFILES).toHaveLength(5);
    expect(STUDIO_ADAPTIVE_MODE_PROFILES.map((profile) => profile.labelKo)).toEqual([
      "콘티",
      "선화",
      "채색",
      "식자",
      "3D",
    ]);

    for (const profile of STUDIO_ADAPTIVE_MODE_PROFILES) {
      expect(profile.primaryTools.length).toBeGreaterThanOrEqual(
        ADAPTIVE_MODE_PRIMARY_TOOL_BUDGET.min,
      );
      expect(profile.primaryTools.length).toBeLessThanOrEqual(
        ADAPTIVE_MODE_PRIMARY_TOOL_BUDGET.max,
      );
      expect(isWithinAdaptiveToolBudget(profile.primaryTools.length)).toBe(true);
      expect(profile.auxiliaryTools.length).toBeGreaterThanOrEqual(3);

      // 번역투 없이 자연스러운 한국어 평문 라벨 검증
      expect(BANNED_TRANSLATIONESE.test(profile.summaryKo)).toBe(false);
      for (const tool of [...profile.primaryTools, ...profile.auxiliaryTools]) {
        expect(tool.labelKo.trim().length).toBeGreaterThan(0);
        expect(BANNED_TRANSLATIONESE.test(tool.labelKo)).toBe(false);
      }

      // 모드 내 도구 ID 중복 없음
      const allIds = [...profile.primaryTools, ...profile.auxiliaryTools].map((tool) => tool.id);
      expect(new Set(allIds).size).toBe(allIds.length);
    }

    expect(isWithinAdaptiveToolBudget(4)).toBe(false);
    expect(isWithinAdaptiveToolBudget(10)).toBe(false);
    expect(getStudioAdaptiveModeProfile("three-d").labelKo).toBe("3D");
  });

  it("5개 모드 간 모든 전환 쌍(25건)에서 캔버스 레이아웃 점프가 CLS = 0으로 고정된다", () => {
    for (const from of STUDIO_ADAPTIVE_MODE_PROFILES) {
      for (const to of STUDIO_ADAPTIVE_MODE_PROFILES) {
        const report = measureAdaptiveModeSwitchCls(from.id, to.id, {
          widthPx: 1440,
          heightPx: 900,
        });
        expect(report.clsScore).toBe(0);
        expect(report.isClsZero).toBe(true);
        expect(report.deltaX).toBe(0);
        expect(report.deltaY).toBe(0);
        expect(report.deltaWidth).toBe(0);
        expect(report.deltaHeight).toBe(0);
        expect(report.beforeCanvasRect).toEqual(report.afterCanvasRect);
      }
    }
  });

  it("데스크톱 1280×720 · 1440×900 · 2560×1440에서 >= 82% 캔버스 점유율을 실측 계산한다", () => {
    const viewports = [
      { w: 1280, h: 720, docked: 114 },
      { w: 1440, h: 900, docked: 148 },
      { w: 2560, h: 1440, docked: 260 },
    ];
    for (const vp of viewports) {
      const occupancy = measureAdaptiveModeCanvasOccupancy({
        mode: "coloring",
        viewportWidthPx: vp.w,
        viewportHeightPx: vp.h,
        chromePhase: "visible",
        dockedPanelWidthPx: vp.docked,
      });
      expect(occupancy.passed).toBe(true);
      expect(occupancy.ratio).toBeGreaterThanOrEqual(0.82);
      expect(occupancy.percent).toBeGreaterThanOrEqual(82);
      expect(occupancy.visibleCanvasAreaPx2 + occupancy.chromeOccludedAreaPx2).toBe(
        occupancy.totalViewportAreaPx2,
      );
    }

    // 1440×900에서 160px 초과 도크는 82% 미만(81.4%)으로 정확히 미달 판정한다.
    const overBudget = measureAdaptiveModeCanvasOccupancy({
      mode: "coloring",
      viewportWidthPx: 1440,
      viewportHeightPx: 900,
      chromePhase: "visible",
      dockedPanelWidthPx: 160,
    });
    expect(overBudget.passed).toBe(false);
    expect(overBudget.ratio).toBeLessThan(0.82);

    // 후퇴(receded) 상태에서는 도크 점유가 0이 되어 캔버스 시야가 극대화된다.
    const receded = measureAdaptiveModeCanvasOccupancy({
      mode: "lineart",
      viewportWidthPx: 1280,
      viewportHeightPx: 720,
      chromePhase: "receded",
      dockedPanelWidthPx: 260,
    });
    expect(receded.effectiveDockedWidthPx).toBe(0);
    expect(receded.passed).toBe(true);
    expect(receded.ratio).toBeGreaterThan(0.9);
  });

  it("2560px 울트라와이드 ↔ 1280px 노트북 리사이즈 시 중앙 캔버스를 가리지 않고 좌·우 도크에 자동 스냅한다 (#085)", () => {
    expect(resolveAdaptiveViewportTier(ULTRAWIDE_REFERENCE_WIDTH_PX)).toBe("ultrawide");
    expect(resolveAdaptiveViewportTier(LAPTOP_REFERENCE_WIDTH_PX)).toBe("desktop");

    // 1) 2560px 울트라와이드 우측 가장자리에 260px 패널 배치
    const ultrawideSnap = resolveFloatingPanelEdgeSnap({
      panelWidthPx: 260,
      panelHeightPx: 420,
      currentX: 2288,
      currentY: 64,
      preferredDockSide: "right",
      viewportWidthPx: ULTRAWIDE_REFERENCE_WIDTH_PX,
      viewportHeightPx: 1440,
      mode: "lineart",
    });
    expect(ultrawideSnap.dockSide).toBe("right");
    expect(ultrawideSnap.effectivePanelWidthPx).toBe(260);
    expect(ultrawideSnap.compactDocked).toBe(false);
    expect(ultrawideSnap.overlapsCanvasCenterAfter).toBe(false);
    expect(ultrawideSnap.canvasOccupancy.passed).toBe(true);

    // 2) 2560px → 1280px 노트북 리사이즈: 우측 도크 자동 스냅 + 비침범 폭 압축 + >= 82% 보장
    const laptopSnap = resolveFloatingPanelEdgeSnap({
      panelWidthPx: ultrawideSnap.requestedPanelWidthPx,
      panelHeightPx: 420,
      currentX: ultrawideSnap.snappedX,
      currentY: ultrawideSnap.snappedY,
      preferredDockSide: ultrawideSnap.dockSide,
      viewportWidthPx: LAPTOP_REFERENCE_WIDTH_PX,
      viewportHeightPx: 720,
      previousViewportWidthPx: ULTRAWIDE_REFERENCE_WIDTH_PX,
      mode: "lineart",
    });
    expect(laptopSnap.resizeTransitionKind).toBe("ultrawide-to-laptop");
    expect(laptopSnap.dockSide).toBe("right");
    expect(laptopSnap.snapped).toBe(true);
    expect(laptopSnap.compactDocked).toBe(true);
    expect(laptopSnap.overlapsCanvasCenterAfter).toBe(false);
    expect(laptopSnap.snappedX + laptopSnap.effectivePanelWidthPx).toBeLessThanOrEqual(
      LAPTOP_REFERENCE_WIDTH_PX,
    );
    expect(laptopSnap.canvasOccupancy.passed).toBe(true);
    expect(laptopSnap.canvasOccupancy.ratio).toBeGreaterThanOrEqual(0.82);

    // 3) 1280px → 2560px 복귀 시 우측 도크를 유지한 채 원래 260px 폭으로 복원
    const restoredUltrawide = resolveFloatingPanelEdgeSnap({
      panelWidthPx: laptopSnap.requestedPanelWidthPx,
      panelHeightPx: 420,
      currentX: laptopSnap.snappedX,
      currentY: laptopSnap.snappedY,
      preferredDockSide: laptopSnap.dockSide,
      viewportWidthPx: ULTRAWIDE_REFERENCE_WIDTH_PX,
      viewportHeightPx: 1440,
      previousViewportWidthPx: LAPTOP_REFERENCE_WIDTH_PX,
      mode: "lineart",
    });
    expect(restoredUltrawide.resizeTransitionKind).toBe("laptop-to-ultrawide");
    expect(restoredUltrawide.dockSide).toBe("right");
    expect(restoredUltrawide.effectivePanelWidthPx).toBe(260);
    expect(restoredUltrawide.compactDocked).toBe(false);
    expect(restoredUltrawide.overlapsCanvasCenterAfter).toBe(false);
    expect(restoredUltrawide.canvasOccupancy.passed).toBe(true);
  });

  it("캔버스 중앙 위에 놓인 플로팅 패널은 가까운 좌/우 도크로 자동 스냅해 중앙을 비운다", () => {
    const leftBiased = resolveFloatingPanelEdgeSnap({
      panelWidthPx: 260,
      currentX: 460,
      viewportWidthPx: 1280,
      viewportHeightPx: 720,
    });
    expect(leftBiased.overlapsCanvasCenterBefore).toBe(true);
    expect(leftBiased.dockSide).toBe("left");
    expect(leftBiased.overlapsCanvasCenterAfter).toBe(false);
    expect(leftBiased.canvasOccupancy.passed).toBe(true);

    const rightBiased = resolveFloatingPanelEdgeSnap({
      panelWidthPx: 260,
      currentX: 620,
      viewportWidthPx: 1280,
      viewportHeightPx: 720,
    });
    expect(rightBiased.overlapsCanvasCenterBefore).toBe(true);
    expect(rightBiased.dockSide).toBe("right");
    expect(rightBiased.overlapsCanvasCenterAfter).toBe(false);
    expect(rightBiased.canvasOccupancy.passed).toBe(true);
  });
});
