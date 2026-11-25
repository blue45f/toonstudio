// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CANVAS_USABLE_AREA_TARGET_PCT,
  HALF_SHEET_HEIGHT_RATIO,
  MIN_TOUCH_TARGET_PX,
  MOBILE_STUDIO_VIEWPORTS,
  SHEET_DRAG_HANDLE_HEIGHT_PX,
  SHEET_OVERSCROLL_BEHAVIOR,
  StudioMobileThumbzonePanel,
  THUMBZONE_SVG_PALETTE,
  THUMB_ARC_ACTIONS,
  computeHorizontalOverflowPx,
  countControlOverlaps,
  countSafeAreaCollisions,
  evaluateThumbZoneErgonomics,
  exportMobileThumbzoneSpecJson,
  formatOklch,
  getMobileViewportPreset,
  isVioletSlopHue,
  rectsOverlap,
  sanitizeNonVioletHue,
  verifyHandednessMirrorParity,
  type BottomSheetState,
  type Handedness,
} from "./index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

describe("1. 5종 실전 뷰포트 프리셋 및 OKLCH 비바이올렛 색상 가드", () => {
  it("5종 필수 모바일·태블릿 뷰포트 프리셋의 해상도와 실사 Safe-Area 규격을 정확히 제공한다", () => {
    expect(MOBILE_STUDIO_VIEWPORTS).toHaveLength(5);
    expect(
      MOBILE_STUDIO_VIEWPORTS.map((v) => `${v.id}:${v.widthPx}x${v.heightPx}`),
    ).toEqual([
      "iphone-compact-375:375x812",
      "galaxy-narrow-360:360x800",
      "galaxy-fold-inner-712:712x840",
      "ipad-mini-744:744x1133",
      "ipad-pro-1024:1024x1366",
    ]);

    for (const vp of MOBILE_STUDIO_VIEWPORTS) {
      expect(vp.safeAreaInsets.topPx).toBeGreaterThanOrEqual(24);
      expect(vp.safeAreaInsets.bottomPx).toBeGreaterThanOrEqual(20);
      expect(vp.buttonSizePx).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
      expect(vp.homeIndicator.widthPx).toBeGreaterThan(80);
      expect(vp.hardwareCutout.widthPx).toBeGreaterThan(0);
    }
  });

  it("getMobileViewportPreset가 유효 ID를 반환하고 미지정 시 iphone-compact-375로 안전 폴백한다", () => {
    expect(getMobileViewportPreset("ipad-pro-1024").widthPx).toBe(1024);
    expect(getMobileViewportPreset("galaxy-narrow-360").widthPx).toBe(360);
    expect(getMobileViewportPreset(undefined).id).toBe("iphone-compact-375");
  });

  it("THUMB_ARC_ACTIONS가 하단 38% 엄지 아크 핵심 5버튼을 오름차순 각도로 정의한다", () => {
    expect(THUMB_ARC_ACTIONS).toHaveLength(5);
    expect(THUMB_ARC_ACTIONS.map((a) => a.id)).toEqual([
      "undo",
      "brush-eraser",
      "eyedropper",
      "lasso-select",
      "tool-sheet",
    ]);
    for (let i = 1; i < THUMB_ARC_ACTIONS.length; i += 1) {
      expect(THUMB_ARC_ACTIONS[i].arcAngleDeg).toBeGreaterThan(THUMB_ARC_ACTIONS[i - 1].arcAngleDeg);
    }
  });

  it("THUMBZONE_SVG_PALETTE의 모든 색상이 바이올렛 구간(270~320°)과 원시 색을 0% 배제한다", () => {
    for (const color of Object.values(THUMBZONE_SVG_PALETTE)) {
      expect(isVioletSlopHue(color.h)).toBe(false);
      assertZeroVioletAndRawColors(formatOklch(color));
      assertZeroVioletAndRawColors(formatOklch(color, 0.45));
    }
  });

  it("isVioletSlopHue와 sanitizeNonVioletHue가 음수·360° 초과 각도까지 바이올렛 휴를 차단한다", () => {
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(295)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(650)).toBe(true);
    expect(isVioletSlopHue(-70)).toBe(true);
    expect(isVioletSlopHue(152)).toBe(false);
    expect(isVioletSlopHue(42)).toBe(false);
    for (let deg = 270; deg <= 320; deg += 5) {
      expect(isVioletSlopHue(sanitizeNonVioletHue(deg))).toBe(false);
    }
  });

  it("formatOklch가 명도·채도·알파를 안전 클램핑하고 OKLCH 문자열을 반환한다", () => {
    expect(formatOklch({ l: 0.72, c: 0.14, h: 152 })).toBe("oklch(0.72 0.14 152)");
    const clamped = formatOklch({ l: 1.8, c: 0.9, h: 290 }, 0.6);
    expect(clamped).toBe("oklch(1 0.37 248 / 0.60)");
    assertZeroVioletAndRawColors(clamped);
  });
});

describe("2. 엄지 도달 호 · 좌우 완전 미러 · 손바닥 오터치 회피 수학 검증", () => {
  it("오른손잡이 기본값은 좌측 수직 2-슬라이더와 우측 하단 38% 엄지 아크 5버튼을 배치한다", () => {
    const res = evaluateThumbZoneErgonomics({ viewportId: "iphone-compact-375", handedness: "right" });
    expect(res.sliderSide).toBe("left");
    expect(res.thumbArcSide).toBe("right");
    expect(res.verticalSliders.sizeSlider.rect.x).toBeLessThan(res.viewport.widthPx / 4);
    expect(res.verticalSliders.opacitySlider.rect.x).toBeLessThan(res.viewport.widthPx / 4);
    for (const btn of res.thumbArcButtons) {
      expect(btn.center.x).toBeGreaterThan(res.viewport.widthPx * 0.45);
      expect(btn.inLower38Band).toBe(true);
    }
  });

  it("왼손잡이 완전 미러링은 우측 수직 2-슬라이더와 좌측 하단 38% 엄지 아크로 정확히 대칭 이동한다", () => {
    const right = evaluateThumbZoneErgonomics({ viewportId: "iphone-compact-375", handedness: "right" });
    const left = evaluateThumbZoneErgonomics({ viewportId: "iphone-compact-375", handedness: "left" });
    const w = right.viewport.widthPx;

    expect(left.sliderSide).toBe("right");
    expect(left.thumbArcSide).toBe("left");
    expect(left.verticalSliders.sizeSlider.rect.x + left.verticalSliders.sizeSlider.rect.width).toBe(
      w - right.verticalSliders.sizeSlider.rect.x,
    );
    expect(
      left.verticalSliders.opacitySlider.rect.x + left.verticalSliders.opacitySlider.rect.width,
    ).toBe(w - right.verticalSliders.opacitySlider.rect.x);
    expect(left.thumbPivot.x).toBe(w - right.thumbPivot.x);
    expect(left.thumbPivot.y).toBe(right.thumbPivot.y);
  });

  it("5종 기기 × 3단계 시트 × 몰입 2상태(총 30조합) 모두 좌우 완전 미러 오차 0px와 지표 동등성을 달성한다", () => {
    const sheetStates: readonly BottomSheetState[] = ["closed", "half", "expanded"];
    for (const vp of MOBILE_STUDIO_VIEWPORTS) {
      for (const sheet of sheetStates) {
        for (const immersive of [false, true]) {
          const parity = verifyHandednessMirrorParity(vp.id, sheet, immersive);
          expect(parity.exactHorizontalMirror).toBe(true);
          expect(parity.maxMirrorDriftPx).toBe(0);
          expect(parity.canvasAreaDeltaPct).toBe(0);
          expect(parity.easyReachDeltaPct).toBe(0);
          expect(parity.touchComplianceDeltaPct).toBe(0);
          expect(parity.safeAreaCollisionsBothZero).toBe(true);
          expect(parity.horizontalOverflowBothZero).toBe(true);
        }
      }
    }
  });

  it("5종 기기 닫힘 상태의 82% 목표는 전체 화면 기준이며 엄지 적중률과 하단 배치는 100%다", () => {
    const hands: readonly Handedness[] = ["right", "left"];
    for (const vp of MOBILE_STUDIO_VIEWPORTS) {
      for (const handedness of hands) {
        const res = evaluateThumbZoneErgonomics({
          viewportId: vp.id,
          handedness,
          bottomSheetState: "closed",
        });
        expect(res.metrics.canvasUsableAreaPct).toBeGreaterThanOrEqual(CANVAS_USABLE_AREA_TARGET_PCT);
        expect(res.metrics.meetsCanvas82Gate).toBe(
          res.metrics.canvasUsableAreaPx2 * 100 >= res.metrics.totalViewportAreaPx2 * CANVAS_USABLE_AREA_TARGET_PCT,
        );
        expect(res.metrics.easyReachHitRatePct).toBe(100);
        expect(res.metrics.lower38CompliancePct).toBe(100);
      }
    }
  });

  it("iPhone 375의 안전 영역 비율이 82%를 넘겨도 전체 화면이 77.7%이면 목표 미달이다", () => {
    const res = evaluateThumbZoneErgonomics({ viewportId: "iphone-compact-375", bottomSheetState: "closed" });
    expect(res.metrics.canvasUsableAreaPct).toBe(86.3);
    expect(res.metrics.canvasGrossViewportPct).toBe(77.7);
    expect(res.metrics.meetsCanvas82Gate).toBe(false);
  });

  it("5종 기기 × 3시트 × 2손 × 2몰입(60조합) 전수에서 44px 준수율 100%, Safe 충돌 0건, 겹침 0건, 오버플로우 0px를 유지한다", () => {
    const sheetStates: readonly BottomSheetState[] = ["closed", "half", "expanded"];
    const hands: readonly Handedness[] = ["right", "left"];
    for (const vp of MOBILE_STUDIO_VIEWPORTS) {
      for (const handedness of hands) {
        for (const bottomSheetState of sheetStates) {
          for (const immersiveMode of [false, true]) {
            const res = evaluateThumbZoneErgonomics({
              viewportId: vp.id,
              handedness,
              bottomSheetState,
              immersiveMode,
            });
            expect(res.metrics.touchTarget44CompliancePct).toBe(100);
            expect(res.metrics.minTouchTargetPx).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
            expect(res.metrics.safeAreaCollisionCount).toBe(0);
            expect(res.metrics.controlOverlapCount).toBe(0);
            expect(res.metrics.horizontalOverflowPx).toBe(0);
            expect(res.metrics.easyReachHitRatePct).toBe(100);
          }
        }
      }
    }
  });

  it("갤럭시 폴드 내부 712px는 오른손/왼손 모두 중앙 힌지 접힘선을 침범하지 않고 충분한 여유 거리를 확보한다", () => {
    for (const handedness of ["right", "left"] as const) {
      const closed = evaluateThumbZoneErgonomics({
        viewportId: "galaxy-fold-inner-712",
        handedness,
        bottomSheetState: "closed",
      });
      const half = evaluateThumbZoneErgonomics({
        viewportId: "galaxy-fold-inner-712",
        handedness,
        bottomSheetState: "half",
      });
      expect(closed.palmGuard.foldHingeClearancePx).not.toBeNull();
      expect(closed.palmGuard.foldHingeClearancePx ?? 0).toBeGreaterThanOrEqual(40);
      expect(half.palmGuard.foldHingeClearancePx ?? 0).toBeGreaterThanOrEqual(40);
    }
  });

  it("손바닥 오터치 회피 가드가 주 사용 손 하단 모서리에 배치되고 반대편 슬라이더와 200px 이상 이격된다", () => {
    for (const vp of MOBILE_STUDIO_VIEWPORTS) {
      const res = evaluateThumbZoneErgonomics({ viewportId: vp.id, handedness: "right" });
      expect(res.palmGuard.drawingHandSide).toBe("right");
      expect(res.palmGuard.sliderEdge).toBe("left");
      expect(res.palmGuard.slidersOppositeToDrawingHand).toBe(true);
      expect(res.palmGuard.sliderPalmClearancePx).toBeGreaterThanOrEqual(200);
      expect(res.palmGuard.palmRejectionScorePct).toBeGreaterThanOrEqual(90);
    }
  });

  it("반높이 바텀 시트는 44% 높이·44px 드래그 핸들·overscroll-behavior: contain을 보장하며 가용 면적이 단조 감소한다", () => {
    for (const vp of MOBILE_STUDIO_VIEWPORTS) {
      const immersive = evaluateThumbZoneErgonomics({ viewportId: vp.id, immersiveMode: true });
      const closed = evaluateThumbZoneErgonomics({ viewportId: vp.id, bottomSheetState: "closed" });
      const half = evaluateThumbZoneErgonomics({ viewportId: vp.id, bottomSheetState: "half" });
      const expanded = evaluateThumbZoneErgonomics({ viewportId: vp.id, bottomSheetState: "expanded" });

      expect(half.bottomSheet.visible).toBe(true);
      expect(half.bottomSheet.heightRatio).toBe(HALF_SHEET_HEIGHT_RATIO);
      expect(half.bottomSheet.heightPx).toBe(Math.round(vp.heightPx * 0.44));
      expect(half.bottomSheet.dragHandleHeightPx).toBe(SHEET_DRAG_HANDLE_HEIGHT_PX);
      expect(half.bottomSheet.dragHandleRect.height).toBe(44);
      expect(half.bottomSheet.overscrollBehavior).toBe(SHEET_OVERSCROLL_BEHAVIOR);

      expect(immersive.metrics.canvasUsableAreaPct).toBeGreaterThan(closed.metrics.canvasUsableAreaPct);
      expect(closed.metrics.canvasUsableAreaPct).toBeGreaterThan(half.metrics.canvasUsableAreaPct);
      expect(half.metrics.canvasUsableAreaPct).toBeGreaterThan(expanded.metrics.canvasUsableAreaPct);
      expect(expanded.metrics.canvasUsableAreaPct).toBeGreaterThan(15);
    }
  });

  it("몰입 모드는 상단바·슬라이더·시트를 접고 복귀 버튼만 남겨 캔버스 실가용 면적을 98% 이상으로 확장한다", () => {
    const res = evaluateThumbZoneErgonomics({
      viewportId: "ipad-mini-744",
      bottomSheetState: "half",
      immersiveMode: true,
    });
    expect(res.topBar.visible).toBe(false);
    expect(res.verticalSliders.visible).toBe(false);
    expect(res.bottomSheet.visible).toBe(false);
    expect(res.bottomSheet.effectiveState).toBe("closed");
    expect(res.immersiveRestoreButton.visible).toBe(true);
    expect(res.immersiveRestoreButton.meetsTouchTarget44).toBe(true);
    expect(res.immersiveRestoreButton.reachZone).toBe("easy");
    expect(res.metrics.canvasUsableAreaPct).toBeGreaterThanOrEqual(98);
  });

  it("충돌·겹침·오버플로우 수학 검증기가 의도적 위반 사각형을 실제로 탐지한다", () => {
    const vp = getMobileViewportPreset("iphone-compact-375");
    expect(rectsOverlap({ x: 0, y: 0, width: 50, height: 50 }, { x: 40, y: 40, width: 50, height: 50 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, width: 44, height: 44 }, { x: 44, y: 0, width: 44, height: 44 })).toBe(false);
    expect(
      countSafeAreaCollisions(
        [
          { x: 10, y: 10, width: 44, height: 44 }, // 상단 노치(47px) 침범
          { x: 10, y: 760, width: 44, height: 44 }, // 하단 홈바(34px) 침범
        ],
        vp,
      ),
    ).toBe(2);
    expect(computeHorizontalOverflowPx([{ x: 350, y: 100, width: 44, height: 44 }], vp.widthPx)).toBe(19);
    expect(
      countControlOverlaps([
        { x: 10, y: 100, width: 44, height: 44 },
        { x: 30, y: 110, width: 44, height: 44 },
      ]),
    ).toBe(1);
  });
});

describe("3. 브러시 입력 클램핑 · CSS 변수 · JSON 규격 직렬화", () => {
  it("범위를 벗어난 브러시 크기와 불투명도를 안전 구간으로 클램핑한다", () => {
    const low = evaluateThumbZoneErgonomics({ brushSizePx: -50, brushOpacityPct: -10 });
    const high = evaluateThumbZoneErgonomics({ brushSizePx: 999, brushOpacityPct: 240 });
    expect(low.brushSizePx).toBe(1);
    expect(low.brushOpacityPct).toBe(5);
    expect(low.verticalSliders.sizeSlider.normalized01).toBe(0);
    expect(low.verticalSliders.opacitySlider.normalized01).toBe(0);
    expect(high.brushSizePx).toBe(200);
    expect(high.brushOpacityPct).toBe(100);
    expect(high.verticalSliders.sizeSlider.normalized01).toBe(1);
    expect(high.verticalSliders.opacitySlider.normalized01).toBe(1);
  });

  it("CSS 커스텀 프로퍼티 맵이 Safe-Area·미러 측면·반높이 시트·overscroll 규격을 정확히 포함한다", () => {
    const res = evaluateThumbZoneErgonomics({
      viewportId: "galaxy-narrow-360",
      handedness: "left",
      bottomSheetState: "half",
    });
    expect(res.cssVariables["--studio-viewport-width"]).toBe("360px");
    expect(res.cssVariables["--studio-safe-top"]).toBe("32px");
    expect(res.cssVariables["--studio-safe-bottom"]).toBe("24px");
    expect(res.cssVariables["--studio-slider-side"]).toBe("right");
    expect(res.cssVariables["--studio-thumb-dock-side"]).toBe("left");
    expect(res.cssVariables["--studio-half-sheet-height"]).toBe("44%");
    expect(res.cssVariables["--studio-sheet-drag-handle"]).toBe("44px");
    expect(res.cssVariables["--studio-sheet-overscroll"]).toBe("contain");
  });

  it("exportMobileThumbzoneSpecJson이 결정론적이고 파싱 가능한 v1 스키마 JSON을 반환한다", () => {
    const res = evaluateThumbZoneErgonomics({ viewportId: "ipad-pro-1024", handedness: "right" });
    const jsonA = exportMobileThumbzoneSpecJson(res);
    const jsonB = exportMobileThumbzoneSpecJson(res);
    expect(jsonA).toBe(jsonB);
    const parsed = JSON.parse(jsonA) as {
      schema: string;
      viewport: { id: string; widthPx: number };
      thumbArcButtons: unknown[];
      metrics: { touchTarget44CompliancePct: number; safeAreaCollisionCount: number };
    };
    expect(parsed.schema).toBe("toonstudio.mobile-thumbzone.v1");
    expect(parsed.viewport.id).toBe("ipad-pro-1024");
    expect(parsed.viewport.widthPx).toBe(1024);
    expect(parsed.thumbArcButtons).toHaveLength(5);
    expect(parsed.metrics.touchTarget44CompliancePct).toBe(100);
    expect(parsed.metrics.safeAreaCollisionCount).toBe(0);
  });

  it("내보낸 JSON이 반높이 시트 44%·44px 핸들·overscroll contain과 왼손 미러 상태를 정확히 기록한다", () => {
    const res = evaluateThumbZoneErgonomics({
      viewportId: "iphone-compact-375",
      handedness: "left",
      bottomSheetState: "half",
    });
    const parsed = JSON.parse(exportMobileThumbzoneSpecJson(res)) as {
      ergonomics: { handedness: string; sliderSide: string; thumbArcSide: string; mirrorParity: { exactHorizontalMirror: boolean } };
      bottomSheet: { effectiveState: string; heightRatio: number; dragHandleHeightPx: number; overscrollBehavior: string };
    };
    expect(parsed.ergonomics.handedness).toBe("left");
    expect(parsed.ergonomics.sliderSide).toBe("right");
    expect(parsed.ergonomics.thumbArcSide).toBe("left");
    expect(parsed.ergonomics.mirrorParity.exactHorizontalMirror).toBe(true);
    expect(parsed.bottomSheet.effectiveState).toBe("half");
    expect(parsed.bottomSheet.heightRatio).toBe(0.44);
    expect(parsed.bottomSheet.dragHandleHeightPx).toBe(44);
    expect(parsed.bottomSheet.overscrollBehavior).toBe("contain");
  });

  it("내보낸 JSON 규격에 원시 hex/rgb/hsl 및 바이올렛(270~320°) OKLCH 색상이 0건이다", () => {
    const json = exportMobileThumbzoneSpecJson(evaluateThumbZoneErgonomics({ viewportId: "galaxy-fold-inner-712" }));
    assertZeroVioletAndRawColors(json);
  });
});

describe("4. StudioMobileThumbzonePanel 라이브 시뮬레이터 UI 인터랙션", () => {
  it("필수 props 없이 단독 렌더링되며 기본 기기(iphone-compact-375)·오른손잡이·닫힘 시트로 초기화된다", () => {
    render(<StudioMobileThumbzonePanel />);
    const svg = screen.getByTestId("thumbzone-device-svg");
    expect(svg.getAttribute("data-viewport-id")).toBe("iphone-compact-375");
    expect(svg.getAttribute("data-handedness")).toBe("right");
    expect(svg.getAttribute("data-slider-side")).toBe("left");
    expect(svg.getAttribute("data-thumb-arc-side")).toBe("right");
    expect(svg.getAttribute("data-sheet-state")).toBe("closed");
    expect(svg.getAttribute("data-safe-collisions")).toBe("0");
    expect(svg.getAttribute("data-horizontal-overflow")).toBe("0");
  });

  it("선택 props(initialViewportId, initialHandedness, locale='en', className)를 정확히 반영한다", () => {
    render(
      <StudioMobileThumbzonePanel
        initialViewportId="ipad-pro-1024"
        initialHandedness="left"
        locale="en"
        className="custom-wave59d-panel"
      />,
    );
    const panel = screen.getByTestId("mobile-thumbzone-panel");
    expect(panel.className).toContain("custom-wave59d-panel");
    expect(panel.getAttribute("aria-label")).toContain("Thumb-Zone Drawing Chrome");
    const svg = screen.getByTestId("thumbzone-device-svg");
    expect(svg.getAttribute("data-viewport-id")).toBe("ipad-pro-1024");
    expect(svg.getAttribute("data-handedness")).toBe("left");
    expect(svg.getAttribute("data-slider-side")).toBe("right");
  });

  it("5종 기기 뷰포트 스위치가 정상 전환되고 갤럭시 폴드 712 선택 시 중앙 힌지 레이어를 렌더링한다", () => {
    const onLayoutChange = vi.fn();
    render(<StudioMobileThumbzonePanel onLayoutChange={onLayoutChange} />);

    for (const vp of MOBILE_STUDIO_VIEWPORTS) {
      fireEvent.click(screen.getByTestId(`thumbzone-viewport-${vp.id}`));
      expect(screen.getByTestId("thumbzone-device-svg").getAttribute("data-viewport-id")).toBe(vp.id);
      if (vp.id === "galaxy-fold-inner-712") {
        expect(screen.getByTestId("thumbzone-fold-hinge-layer")).toBeTruthy();
      } else {
        expect(screen.queryByTestId("thumbzone-fold-hinge-layer")).toBeNull();
      }
    }
    expect(onLayoutChange).toHaveBeenCalledTimes(5);
  });

  it("오른손/왼손 완전 미러 토글이 슬라이더·엄지 아크 레이어 측면과 aria-pressed를 즉시 반전한다", () => {
    render(<StudioMobileThumbzonePanel />);
    const leftBtn = screen.getByTestId("thumbzone-hand-left");
    const rightBtn = screen.getByTestId("thumbzone-hand-right");

    fireEvent.click(leftBtn);
    expect(leftBtn.getAttribute("aria-pressed")).toBe("true");
    expect(rightBtn.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("thumbzone-vertical-sliders-layer").getAttribute("data-side")).toBe("right");
    expect(screen.getByTestId("thumbzone-arc-buttons-layer").getAttribute("data-side")).toBe("left");

    fireEvent.click(rightBtn);
    expect(rightBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("thumbzone-vertical-sliders-layer").getAttribute("data-side")).toBe("left");
    expect(screen.getByTestId("thumbzone-arc-buttons-layer").getAttribute("data-side")).toBe("right");
  });

  it("바텀 시트 3단계(닫힘/반높이 44%/확장 64%) 전환 시 SVG 시트 레이어와 캔버스 면적 KPI가 연동된다", () => {
    render(<StudioMobileThumbzonePanel />);
    const closedCanvas = Number.parseFloat(screen.getByTestId("thumbzone-metric-canvas").textContent ?? "0");
    expect(screen.queryByTestId("thumbzone-bottom-sheet-layer")).toBeNull();

    fireEvent.click(screen.getByTestId("thumbzone-sheet-half"));
    expect(screen.getByTestId("thumbzone-bottom-sheet-layer")).toBeTruthy();
    expect(screen.getByTestId("thumbzone-device-svg").textContent).toContain("44% SHEET · 44px HANDLE · overscroll: contain");
    const halfCanvas = Number.parseFloat(screen.getByTestId("thumbzone-metric-canvas").textContent ?? "0");

    fireEvent.click(screen.getByTestId("thumbzone-sheet-expanded"));
    const expandedCanvas = Number.parseFloat(screen.getByTestId("thumbzone-metric-canvas").textContent ?? "0");

    expect(closedCanvas).toBeGreaterThan(halfCanvas);
    expect(halfCanvas).toBeGreaterThan(expandedCanvas);
  });

  it("몰입 모드가 도구를 숨기고 복귀 버튼과 전체 화면 기준 캔버스 비율을 표시한다", () => {
    render(<StudioMobileThumbzonePanel />);
    const toggle = screen.getByTestId("thumbzone-immersive-toggle");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("thumbzone-topbar-layer")).toBeNull();
    expect(screen.queryByTestId("thumbzone-vertical-sliders-layer")).toBeNull();
    expect(screen.getByTestId("thumbzone-immersive-restore-layer")).toBeTruthy();
    const immersive = evaluateThumbZoneErgonomics({ viewportId: "iphone-compact-375", immersiveMode: true });
    expect(screen.getByTestId("thumbzone-metric-canvas").textContent).toBe(`${immersive.metrics.canvasGrossViewportPct}%`);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("thumbzone-topbar-layer")).toBeTruthy();
  });

  it("몰입 모드가 켜진 상태에서 반높이 시트를 선택하면 몰입 모드를 자동 해제하고 시트를 연다", () => {
    render(<StudioMobileThumbzonePanel />);
    fireEvent.click(screen.getByTestId("thumbzone-immersive-toggle"));
    expect(screen.getByTestId("thumbzone-device-svg").getAttribute("data-immersive")).toBe("true");

    fireEvent.click(screen.getByTestId("thumbzone-sheet-half"));
    expect(screen.getByTestId("thumbzone-device-svg").getAttribute("data-immersive")).toBe("false");
    expect(screen.getByTestId("thumbzone-bottom-sheet-layer")).toBeTruthy();
  });

  it("브러시 크기 및 불투명도 슬라이더 조작이 실시간 수치와 SVG 표시를 갱신하고 onLayoutChange를 호출한다", () => {
    const onLayoutChange = vi.fn();
    render(<StudioMobileThumbzonePanel onLayoutChange={onLayoutChange} />);

    fireEvent.change(screen.getByTestId("thumbzone-brush-size-slider"), { target: { value: "96" } });
    fireEvent.change(screen.getByTestId("thumbzone-brush-opacity-slider"), { target: { value: "40" } });

    expect(screen.getByTestId("thumbzone-brush-size-value").textContent).toBe("96px");
    expect(screen.getByTestId("thumbzone-brush-opacity-value").textContent).toBe("40%");
    expect(screen.getByTestId("thumbzone-device-svg").textContent).toContain("96px");
    expect(screen.getByTestId("thumbzone-device-svg").textContent).toContain("40%");
    expect(onLayoutChange).toHaveBeenCalledTimes(2);
  });

  it("빠른 브러시 프리셋 버튼이 크기와 불투명도를 한 번에 적용한다", () => {
    render(<StudioMobileThumbzonePanel />);
    fireEvent.click(screen.getByTestId("thumbzone-brush-preset-wash"));
    expect(screen.getByTestId("thumbzone-brush-size-value").textContent).toBe("64px");
    expect(screen.getByTestId("thumbzone-brush-opacity-value").textContent).toBe("45%");
    expect(screen.getByTestId("thumbzone-status-banner").textContent).toContain("64px");
  });

  it("엄지 아크 핵심 5버튼 인터랙션이 동작하며 '도구 시트' 클릭 시 반높이 시트를 토글한다", () => {
    render(<StudioMobileThumbzonePanel />);
    const eyedropper = screen.getByTestId("thumbzone-action-eyedropper");
    fireEvent.click(eyedropper);
    expect(eyedropper.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("thumbzone-status-banner").textContent).toContain("스포이드");

    const sheetAction = screen.getByTestId("thumbzone-action-tool-sheet");
    fireEvent.click(sheetAction);
    expect(screen.getByTestId("thumbzone-device-svg").getAttribute("data-sheet-state")).toBe("half");
    fireEvent.click(sheetAction);
    expect(screen.getByTestId("thumbzone-device-svg").getAttribute("data-sheet-state")).toBe("closed");
  });

  it("JSON 복사 버튼이 클립보드 쓰기와 onExportJson 콜백을 실행하고 JSON 미리보기를 연다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onExportJson = vi.fn();

    render(<StudioMobileThumbzonePanel onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("thumbzone-export-json-btn"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(onExportJson).toHaveBeenCalledTimes(1);
    const preview = screen.getByTestId("thumbzone-json-preview");
    expect(preview.textContent).toContain("toonstudio.mobile-thumbzone.v1");
    expect(screen.getByTestId("thumbzone-status-banner").textContent).toContain("클립보드에 복사");
  });

  it("클립보드 쓰기 실패 시에도 예외 없이 JSON 미리보기와 안내 메시지를 안전하게 유지한다", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<StudioMobileThumbzonePanel />);
    fireEvent.click(screen.getByTestId("thumbzone-export-json-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("thumbzone-status-banner").textContent).toContain("직접 복사");
    });
    expect(screen.getByTestId("thumbzone-json-preview")).toBeTruthy();
  });

  it("JSON 미리보기 토글 버튼이 aria-expanded와 프리뷰 표시를 정확히 전환한다", () => {
    render(<StudioMobileThumbzonePanel />);
    const toggleBtn = screen.getByTestId("thumbzone-toggle-json-btn");
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("thumbzone-json-preview")).toBeNull();

    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("thumbzone-json-preview")).toBeTruthy();

    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("thumbzone-json-preview")).toBeNull();
  });

  it("초기화 버튼이 기기·주 사용 손·시트·몰입·브러시 수치를 초기값으로 복구한다", () => {
    render(<StudioMobileThumbzonePanel initialViewportId="galaxy-narrow-360" initialHandedness="left" />);
    fireEvent.click(screen.getByTestId("thumbzone-viewport-ipad-pro-1024"));
    fireEvent.click(screen.getByTestId("thumbzone-hand-right"));
    fireEvent.click(screen.getByTestId("thumbzone-sheet-half"));
    fireEvent.change(screen.getByTestId("thumbzone-brush-size-slider"), { target: { value: "120" } });

    fireEvent.click(screen.getByTestId("thumbzone-reset-btn"));
    const svg = screen.getByTestId("thumbzone-device-svg");
    expect(svg.getAttribute("data-viewport-id")).toBe("galaxy-narrow-360");
    expect(svg.getAttribute("data-handedness")).toBe("left");
    expect(svg.getAttribute("data-sheet-state")).toBe("closed");
    expect(screen.getByTestId("thumbzone-brush-size-value").textContent).toBe("18px");
    expect(screen.getByTestId("thumbzone-brush-opacity-value").textContent).toBe("85%");
  });
});

describe("5. 엄격 품질·하네스 계약 · 접근성 · Calm Atelier 자가 검증", () => {
  it("소유 파일 4종이 모두 존재하고 줄 수 상한(engine<=720, panel<=680, all<=800)과 금지 패턴 0건을 지킨다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "mobile-thumbzone-engine.ts",
      "StudioMobileThumbzonePanel.tsx",
      "index.ts",
      "mobile-thumbzone.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles.sort()).toEqual([...required].sort());

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "mobile-thumbzone-engine.ts") expect(lines).toBeLessThanOrEqual(720);
      if (file === "StudioMobileThumbzonePanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "mobile-thumbzone.test.tsx") {
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

      if (file === "StudioMobileThumbzonePanel.tsx") {
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

  it("렌더된 모든 버튼이 min-h-11을 유지하고 숫자 지표에 tabular-nums가 적용된다", () => {
    const { container } = render(<StudioMobileThumbzonePanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(20);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
    expect(screen.getByTestId("thumbzone-metric-canvas").className).toContain("tabular-nums");
    expect(screen.getByTestId("thumbzone-metric-easy-reach").className).toContain("tabular-nums");
    expect(screen.getByTestId("thumbzone-metric-touch44").className).toContain("tabular-nums");
    expect(screen.getByTestId("thumbzone-metric-palm").className).toContain("tabular-nums");
  });

  it("5종 기기 × 시트/미러 상태의 모든 렌더 SVG에 원시 색과 바이올렛(270~320°)이 0건이다", () => {
    const { container } = render(<StudioMobileThumbzonePanel />);
    for (const vp of MOBILE_STUDIO_VIEWPORTS) {
      fireEvent.click(screen.getByTestId(`thumbzone-viewport-${vp.id}`));
      fireEvent.click(screen.getByTestId("thumbzone-hand-left"));
      fireEvent.click(screen.getByTestId("thumbzone-sheet-half"));
      const svgs = container.querySelectorAll("svg");
      expect(svgs.length).toBeGreaterThanOrEqual(1);
      for (const svg of svgs) {
        assertZeroVioletAndRawColors(svg.outerHTML);
      }
    }
  });

  it("접근성 랜드마크(role=img, role=status, label-input 연결, aria-pressed)를 모두 충족한다", () => {
    render(<StudioMobileThumbzonePanel />);
    const svg = screen.getByTestId("thumbzone-device-svg");
    expect(svg.getAttribute("role")).toBe("img");
    expect((svg.getAttribute("aria-label") ?? "").length).toBeGreaterThan(10);

    const status = screen.getByTestId("thumbzone-status-banner");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");

    expect(screen.getByLabelText(/브러시 크기/u)).toBe(screen.getByTestId("thumbzone-brush-size-slider"));
    expect(screen.getByLabelText(/불투명도/u)).toBe(screen.getByTestId("thumbzone-brush-opacity-slider"));
  });

  it("4개 소유 파일이 금지 도메인(vrm·bg3d·market·apps/api·apps/admin-web)을 정적으로 import하지 않는다", () => {
    const dir = path.resolve(import.meta.dirname);
    const files = [
      "mobile-thumbzone-engine.ts",
      "StudioMobileThumbzonePanel.tsx",
      "index.ts",
      "mobile-thumbzone.test.tsx",
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
