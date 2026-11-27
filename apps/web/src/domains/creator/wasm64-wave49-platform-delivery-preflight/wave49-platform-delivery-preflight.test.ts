import { describe, expect, it } from "vitest";

import {
  auditMobileReadabilityAndCutSeams,
  computeEffectiveMobileFontPx,
  computeWcagContrastRatio,
  detectWhiteSpecsAndBleedHoles,
  getPlatformDeliveryPreset,
  healWhiteSpecs,
  listPlatformDeliveryPresets,
  mmToPixelsAtDpi,
  planSafeSliceSeams,
  validateDeliveryAgainstSpec,
  type PanelCutFrame,
  type RgbaImageBuffer,
  type SpeechBubbleAuditTarget,
} from "./index";

function createRgba(w: number, h: number, r: number, g: number, b: number, a = 255): RgbaImageBuffer {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a;
  }
  return { width: w, height: h, data };
}

function paintRect(
  img: RgbaImageBuffer, x: number, y: number, w: number, h: number,
  r: number, g: number, b: number, a = 255,
): void {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
      const o = (py * img.width + px) * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a;
    }
  }
}

function pixelAt(img: RgbaImageBuffer, x: number, y: number): [number, number, number, number] {
  const o = (y * img.width + x) * 4;
  return [img.data[o] ?? 0, img.data[o + 1] ?? 0, img.data[o + 2] ?? 0, img.data[o + 3] ?? 0];
}

function makePanel(cutId: string, y: number, height = 500, width = 740): PanelCutFrame {
  return { cutId, bounds: { x: 30, y, width, height } };
}

function makeBubble(
  bubbleId: string,
  overrides: Partial<SpeechBubbleAuditTarget> = {},
): SpeechBubbleAuditTarget {
  return {
    bubbleId, cutId: "cut-1", textPreview: "지금 당장 출발하자!", fontSizePx: 28,
    bounds: { x: 100, y: 120, width: 220, height: 110 },
    textColor: { r: 20, g: 22, b: 26 }, backgroundColor: { r: 255, g: 255, b: 255 },
    ...overrides,
  };
}

describe("wasm64-wave49-platform-delivery-preflight", () => {
  describe("1. 연재 플랫폼 출고 규격 및 안전 슬라이스 절단선 플래너", () => {
    it("1. 네이버 웹툰 기본(690px)·고해상도(800px) 정상 출고를 통과시키고 규격 초과를 차단한다", () => {
      expect(listPlatformDeliveryPresets().length).toBeGreaterThanOrEqual(6);
      const naver = getPlatformDeliveryPreset("naver-webtoon-standard");
      expect(naver.allowedWidthsPx).toEqual([690, 800]);
      expect(naver.maxSliceHeightPx).toBe(1600);

      const ok = validateDeliveryAgainstSpec({
        presetId: "naver-webtoon-standard", canvasWidthPx: 690, canvasHeightPx: 3840,
        format: "jpeg", sliceHeightsPx: [1280, 1280, 1280], sliceByteSizes: [650_000, 720_000, 580_000],
      });
      expect(ok.passed).toBe(true);
      expect(ok.errorCount).toBe(0);

      const bad = validateDeliveryAgainstSpec({
        presetId: "naver-webtoon-hd", canvasWidthPx: 920, canvasHeightPx: 4000, format: "jpeg",
        sliceHeightsPx: [1750, 1200, 1050], estimatedTotalBytes: 25 * 1024 * 1024,
      });
      expect(bad.passed).toBe(false);
      const codes = bad.issues.map((i) => i.code);
      expect(codes).toContain("width-mismatch");
      expect(codes).toContain("slice-height-exceeded");
      expect(codes).toContain("total-episode-size-exceeded");
    });

    it("2. 카카오페이지(720px)·카카오웹툰(1080px) 규격과 단일 파일 용량 상한을 검증한다", () => {
      const ok = validateDeliveryAgainstSpec({
        presetId: "kakao-webtoon-hd", canvasWidthPx: 1080, canvasHeightPx: 2880,
        format: "png", sliceHeightsPx: [1440, 1440], sliceByteSizes: [1_800_000, 2_100_000],
      });
      expect(ok.passed).toBe(true);

      const heavy = validateDeliveryAgainstSpec({
        presetId: "kakao-page-standard", canvasWidthPx: 720, canvasHeightPx: 2560,
        format: "jpeg", sliceHeightsPx: [1280, 1280], sliceByteSizes: [2_600_000, 900_000],
      });
      expect(heavy.passed).toBe(false);
      expect(heavy.issues.some((i) => i.code === "single-file-size-exceeded")).toBe(true);
    });

    it("3. 글로벌 세로 스크롤(800px)에서 영문 대사 여백 부족 경고와 미지원 포맷 차단을 구분한다", () => {
      const warn = validateDeliveryAgainstSpec({
        presetId: "global-vertical-scroll", canvasWidthPx: 800, canvasHeightPx: 2560,
        format: "jpeg", sliceHeightsPx: [1280, 1280], englishBubblePaddingPx: 8,
      });
      expect(warn.passed).toBe(true);
      expect(warn.warningCount).toBe(1);
      expect(warn.issues[0]?.code).toBe("english-bubble-margin-tight");

      const unsupported = validateDeliveryAgainstSpec({
        presetId: "global-vertical-scroll", canvasWidthPx: 800, canvasHeightPx: 1280, format: "webp",
      });
      expect(unsupported.passed).toBe(false);
      expect(unsupported.issues.some((i) => i.code === "format-unsupported")).toBe(true);
    });

    it("4. 단행본 인쇄(300 DPI·재단 3mm·CMYK) 규격과 밀리미터-픽셀 환산 정확도를 검증한다", () => {
      expect(mmToPixelsAtDpi(3, 300)).toBe(36);
      const fail = validateDeliveryAgainstSpec({
        presetId: "print-tankobon-300dpi", canvasWidthPx: 1748, canvasHeightPx: 2480,
        format: "pdf", dpi: 150, bleedMm: 1.5, colorSpace: "srgb",
      });
      expect(fail.passed).toBe(false);
      expect(fail.requiredBleedPx).toBe(36);
      expect(fail.issues.map((i) => i.code)).toEqual(
        expect.arrayContaining(["dpi-too-low", "bleed-margin-short", "color-space-mismatch"]),
      );

      const pass = validateDeliveryAgainstSpec({
        presetId: "print-tankobon-300dpi", canvasWidthPx: 1748, canvasHeightPx: 2480,
        format: "pdf", dpi: 300, bleedMm: 3, colorSpace: "cmyk",
      });
      expect(pass.passed).toBe(true);
    });

    it("5. 안전 슬라이스 플래너는 기본 절단선(1280px)에 걸린 얼굴·대사 보호 영역을 피해 분할한다", () => {
      const plan = planSafeSliceSeams({
        presetId: "naver-webtoon-hd", canvasHeightPx: 2600,
        protectedZones: [
          { id: "face-1", kind: "face", topY: 1220, bottomY: 1340, labelKo: "주인공 얼굴" },
          { id: "dlg-1", kind: "dialogue", topY: 1350, bottomY: 1430, labelKo: "핵심 대사" },
        ],
      });
      expect(plan.allSeamsSafe).toBe(true);
      expect(plan.seams).toHaveLength(1);
      expect(plan.seams[0]?.avoidedZoneIds).toContain("face-1");
      const seamY = plan.seams[0]?.y ?? 0;
      expect(seamY <= 1206 || seamY >= 1440).toBe(true);
    });

    it("6. 안전 슬라이스 플래너는 보호 영역 근처에 컷 사이 여백(Gutter)이 있으면 여백 중앙을 우선 선택한다", () => {
      const plan = planSafeSliceSeams({
        presetId: "naver-webtoon-standard", canvasHeightPx: 2560,
        protectedZones: [{ id: "dlg-mid", kind: "dialogue", topY: 1230, bottomY: 1330 }],
        gutterBands: [{ topY: 1140, bottomY: 1200 }],
      });
      expect(plan.allSeamsSafe).toBe(true);
      expect(plan.seams[0]?.insideGutter).toBe(true);
      expect(plan.seams[0]?.y).toBe(1170);
    });

    it("7. 장편 원고(4200px) 다중 분할 시 모든 슬라이스가 플랫폼 상한을 넘지 않고 연속 이어진다", () => {
      const plan = planSafeSliceSeams({
        presetId: "kakao-page-standard", canvasHeightPx: 4200,
        protectedZones: [
          { id: "f1", kind: "face", topY: 1240, bottomY: 1330 },
          { id: "d2", kind: "dialogue", topY: 2500, bottomY: 2620 },
        ],
      });
      expect(plan.allSeamsSafe).toBe(true);
      expect(plan.sliceCount).toBeGreaterThanOrEqual(3);
      expect(plan.slices.every((s) => !s.exceedsMaxHeight && s.heightPx <= 1500)).toBe(true);
      expect(plan.slices.reduce((acc, s) => acc + s.heightPx, 0)).toBe(4200);
      expect(plan.slices[0]?.startY).toBe(0);
      expect(plan.slices[plan.slices.length - 1]?.endY).toBe(4200);
    });

    it("8. 인쇄 프리셋이나 상한 이하 단편 원고는 불필요한 슬라이스를 만들지 않는다", () => {
      const printPlan = planSafeSliceSeams({
        presetId: "print-tankobon-300dpi", canvasHeightPx: 2480, protectedZones: [],
      });
      const shortPlan = planSafeSliceSeams({
        presetId: "naver-webtoon-standard", canvasHeightPx: 1400, protectedZones: [],
      });
      expect(printPlan.cutYPositions).toEqual([]);
      expect(shortPlan.cutYPositions).toEqual([]);
      expect(printPlan.sliceCount).toBe(1);
      expect(shortPlan.sliceCount).toBe(1);
    });
  });

  describe("2. 375px 모바일 가독성·WCAG 대비·절단선 충돌 감사기", () => {
    it("9. 800px 원고 기준 375px 축소 시 11.5px 미만 경고·9.5px 미만 차단 및 권장 폰트 크기를 산출한다", () => {
      const report = auditMobileReadabilityAndCutSeams({
        canvasWidthPx: 800, canvasHeightPx: 1200,
        panelFrames: [makePanel("cut-1", 40, 1000)], sliceYPositions: [],
        bubbles: [
          makeBubble("ok-bubble", { fontSizePx: 26 }),
          makeBubble("warn-bubble", { fontSizePx: 22 }),
          makeBubble("block-bubble", { fontSizePx: 18 }),
        ],
      });
      expect(report.canShip).toBe(false);
      expect(report.blockCount).toBe(1);
      expect(report.warningCount).toBe(1);
      expect(report.bubbleMetrics.find((m) => m.bubbleId === "ok-bubble")?.fontStatus).toBe("pass");
      expect(report.bubbleMetrics.find((m) => m.bubbleId === "warn-bubble")?.fontStatus).toBe("warn");
      const blocked = report.bubbleMetrics.find((m) => m.bubbleId === "block-bubble");
      expect(blocked?.fontStatus).toBe("block");
      expect(blocked?.suggestedFontPx).toBe(26);
      expect(computeEffectiveMobileFontPx(26, 800, 375)).toBeGreaterThanOrEqual(11.5);
    });

    it("10. 고해상도 1080px 원고에서는 축소 배율(0.347x)을 반영해 더 큰 권장 폰트 크기를 제안한다", () => {
      const report = auditMobileReadabilityAndCutSeams({
        canvasWidthPx: 1080, canvasHeightPx: 1440,
        panelFrames: [makePanel("cut-1", 40, 1200, 1000)], sliceYPositions: [],
        bubbles: [makeBubble("hd-bubble", { fontSizePx: 28 })],
      });
      const metric = report.bubbleMetrics[0];
      expect(metric?.fontStatus).toBe("warn");
      expect(metric?.effectiveMobilePx).toBeCloseTo(9.72, 1);
      expect(metric?.suggestedFontPx).toBe(35);
      expect(computeEffectiveMobileFontPx(35, 1080, 375)).toBeGreaterThanOrEqual(12);
    });

    it("11. 말풍선-컷 경계 침범 시 대사 본문 이탈은 차단, 외곽선 이탈은 경고, 돌출 허용은 면제한다", () => {
      const report = auditMobileReadabilityAndCutSeams({
        canvasWidthPx: 800, canvasHeightPx: 1000,
        panelFrames: [makePanel("cut-1", 100, 400, 700)], sliceYPositions: [],
        bubbles: [
          makeBubble("text-spill", {
            bounds: { x: 650, y: 150, width: 120, height: 90 },
            textBounds: { x: 660, y: 160, width: 95, height: 60 },
          }),
          makeBubble("outer-only-spill", {
            bounds: { x: 620, y: 260, width: 120, height: 80 },
            textBounds: { x: 630, y: 270, width: 90, height: 55 },
          }),
          makeBubble("intentional-bleed", {
            bounds: { x: 660, y: 360, width: 120, height: 80 }, allowPanelBleed: true,
          }),
        ],
      });
      expect(report.issues.find((i) => i.bubbleId === "text-spill")?.severity).toBe("block");
      expect(report.issues.find((i) => i.bubbleId === "outer-only-spill")?.severity).toBe("warn");
      expect(report.issues.find((i) => i.bubbleId === "intentional-bleed")).toBeUndefined();
    });

    it("12. WCAG 2.1 명도 대비(>= 4.5:1) 미달 대사를 차단하고 고대비 권장 색상을 제시한다", () => {
      expect(computeWcagContrastRatio({ r: 170, g: 170, b: 170 }, { r: 255, g: 255, b: 255 }))
        .toBeLessThan(4.5);
      const report = auditMobileReadabilityAndCutSeams({
        canvasWidthPx: 800, canvasHeightPx: 900,
        panelFrames: [makePanel("cut-1", 40, 800)], sliceYPositions: [],
        bubbles: [
          makeBubble("light-low", {
            textColor: { r: 175, g: 175, b: 175 }, backgroundColor: { r: 255, g: 255, b: 255 },
          }),
          makeBubble("dark-low", {
            textColor: { r: 58, g: 60, b: 70 }, backgroundColor: { r: 22, g: 24, b: 30 },
          }),
        ],
      });
      expect(report.canShip).toBe(false);
      for (const m of report.bubbleMetrics) {
        expect(m.wcagPass).toBe(false);
        expect(m.suggestedTextColor).not.toBeNull();
        if (m.suggestedTextColor) {
          const bg = m.bubbleId === "light-low" ? { r: 255, g: 255, b: 255 } : { r: 22, g: 24, b: 30 };
          expect(computeWcagContrastRatio(m.suggestedTextColor, bg)).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it("13. 슬라이스 절단선이 말풍선을 자르면 차단하고 안전한 safeSliceY로 보정 재감사 시 통과한다", () => {
      const bubbles = [makeBubble("cut-target", { bounds: { x: 120, y: 1240, width: 240, height: 100 }, cutId: "cut-2" })];
      const panels = [makePanel("cut-2", 900, 700)];
      const initial = auditMobileReadabilityAndCutSeams({
        canvasWidthPx: 800, canvasHeightPx: 2560, panelFrames: panels, bubbles,
        sliceYPositions: [1280], maxSliceHeightPx: 1600,
      });
      expect(initial.canShip).toBe(false);
      const safeY = initial.seamFixes[0]?.safeSliceY;
      expect(safeY !== null && safeY !== undefined && (safeY <= 1232 || safeY >= 1348)).toBe(true);

      const reaudited = auditMobileReadabilityAndCutSeams({
        canvasWidthPx: 800, canvasHeightPx: 2560, panelFrames: panels, bubbles,
        sliceYPositions: safeY !== null && safeY !== undefined ? [safeY] : [],
      });
      expect(reaudited.canShip).toBe(true);
      expect(reaudited.seamFixes).toHaveLength(0);
    });

    it("14. 안전 슬라이스 플래너 출력 절단선을 감사기에 연계하면 절단선 충돌 0건으로 통과한다", () => {
      const bubble = makeBubble("linked-bubble", { bounds: { x: 140, y: 1230, width: 220, height: 110 } });
      const plan = planSafeSliceSeams({
        presetId: "naver-webtoon-hd", canvasHeightPx: 2560,
        protectedZones: [{ id: bubble.bubbleId, kind: "dialogue", topY: 1230, bottomY: 1340 }],
      });
      const audit = auditMobileReadabilityAndCutSeams({
        canvasWidthPx: 800, canvasHeightPx: 2560,
        panelFrames: [makePanel("cut-1", 100, 2300)], bubbles: [bubble], sliceYPositions: plan.cutYPositions,
      });
      expect(audit.canShip).toBe(true);
      expect(audit.seamFixes).toHaveLength(0);
    });

    it("15. 복합 결함(초소형 글꼴·저대비·경계 이탈·절단선 걸림)을 한 번에 빠짐없이 보고한다", () => {
      const report = auditMobileReadabilityAndCutSeams({
        canvasWidthPx: 800, canvasHeightPx: 2560,
        panelFrames: [makePanel("cut-1", 100, 1300, 650)], sliceYPositions: [1280],
        bubbles: [makeBubble("multi-fail", {
          fontSizePx: 16, bounds: { x: 610, y: 1230, width: 150, height: 100 },
          textColor: { r: 200, g: 200, b: 200 }, backgroundColor: { r: 255, g: 255, b: 255 },
        })],
      });
      expect(report.canShip).toBe(false);
      expect(report.blockCount).toBe(4);
      expect(report.issues.map((i) => i.code)).toEqual(expect.arrayContaining([
        "mobile-font-blocked", "dialogue-contrast-low",
        "bubble-cut-boundary-intrusion", "slice-seam-cuts-bubble",
      ]));
    });
  });

  describe("3. 미봉합 미세 흰 점·투명 구멍 탐지 및 1클릭 자동 메우기", () => {
    it("16. 선화 경계 안쪽 모서리의 미세 흰 점(1~36px²)을 탐지하고 선화가 아닌 채색 최빈값을 선택한다", () => {
      const img = createRgba(32, 32, 255, 255, 255);
      paintRect(img, 6, 6, 20, 20, 12, 12, 14);
      paintRect(img, 8, 8, 16, 16, 80, 160, 230);
      paintRect(img, 8, 8, 2, 2, 255, 255, 255);

      const report = detectWhiteSpecsAndBleedHoles(img);
      expect(report.specs).toHaveLength(1);
      expect(report.specs[0]?.kind).toBe("white-spec");
      expect(report.specs[0]?.areaPx).toBe(4);
      expect(report.specs[0]?.touchesLineart).toBe(true);
      expect(report.specs[0]?.suggestedFillRgba).toEqual({ r: 80, g: 160, b: 230, a: 255 });
    });

    it("17. 채색 내부의 투명 구멍(alpha=0)과 흰 점+투명 혼합 구멍을 정확히 구분·탐지한다", () => {
      const img = createRgba(36, 36, 210, 120, 95);
      paintRect(img, 8, 10, 3, 1, 0, 0, 0, 0);
      paintRect(img, 20, 20, 1, 2, 252, 252, 252, 255);
      paintRect(img, 21, 20, 1, 2, 0, 0, 0, 0);

      const report = detectWhiteSpecsAndBleedHoles(img);
      expect(report.specs).toHaveLength(2);
      expect(report.specs.map((s) => s.kind).sort()).toEqual(["mixed", "transparent-hole"]);
      expect(report.totalSpecPixelCount).toBe(7);
      expect(report.specs.every((s) => s.suggestedFillRgba.r === 210)).toBe(true);
    });

    it("18. 캔버스 외곽과 이어진 흰 배경 여백·컷 거터는 오탐 없이 제외한다", () => {
      const img = createRgba(32, 32, 255, 255, 255);
      paintRect(img, 8, 8, 16, 16, 40, 130, 90);
      paintRect(img, 0, 14, 10, 2, 255, 255, 255);

      const report = detectWhiteSpecsAndBleedHoles(img);
      expect(report.specs).toHaveLength(0);
      expect(report.ignoredBorderComponentCount).toBeGreaterThanOrEqual(1);
    });

    it("19. 36px² 초과 대형 흰 영역(말풍선·흰 옷)과 excludeRects 지정 구간은 오탐을 차단한다", () => {
      const img = createRgba(48, 48, 70, 95, 165);
      paintRect(img, 6, 6, 8, 8, 255, 255, 255);
      paintRect(img, 30, 30, 2, 2, 255, 255, 255);

      const report = detectWhiteSpecsAndBleedHoles(img, {
        excludeRects: [{ x: 28, y: 28, width: 6, height: 6 }],
      });
      expect(report.specs).toHaveLength(0);
      expect(report.ignoredOversizedComponentCount).toBe(1);
      expect(report.ignoredExcludedRectCount).toBe(1);
    });

    it("20. 순수 흑색 잉크 내부의 눈동자 하이라이트는 기본 보존하고 옵션 활성화 시에만 탐지한다", () => {
      const img = createRgba(24, 24, 240, 200, 180);
      paintRect(img, 7, 7, 10, 10, 10, 10, 12);
      paintRect(img, 10, 10, 2, 2, 255, 255, 255);

      const def = detectWhiteSpecsAndBleedHoles(img);
      expect(def.specs).toHaveLength(0);
      expect(def.ignoredNoFillNeighborCount).toBe(1);

      const strict = detectWhiteSpecsAndBleedHoles(img, { allowPureLineartEnclosure: true });
      expect(strict.specs).toHaveLength(1);
    });

    it("21. healWhiteSpecs 1클릭 복원은 원본을 보존한 채 최빈 채색 색으로 메워 재탐지 0건을 달성한다", () => {
      const img = createRgba(32, 32, 255, 255, 255);
      paintRect(img, 4, 4, 24, 24, 15, 15, 18);
      paintRect(img, 6, 6, 20, 20, 235, 185, 155);
      paintRect(img, 6, 6, 3, 1, 254, 254, 254);
      paintRect(img, 18, 16, 2, 1, 0, 0, 0, 0);

      const detected = detectWhiteSpecsAndBleedHoles(img);
      expect(detected.specs).toHaveLength(2);
      const healed = healWhiteSpecs(img, detected.specs);
      expect(healed.healedSpecCount).toBe(2);
      expect(healed.healedPixelCount).toBe(5);
      expect(pixelAt(img, 6, 6)).toEqual([254, 254, 254, 255]);

      const healedImg: RgbaImageBuffer = { width: healed.width, height: healed.height, data: healed.data };
      expect(pixelAt(healedImg, 6, 6)).toEqual([235, 185, 155, 255]);
      expect(pixelAt(healedImg, 18, 16)).toEqual([235, 185, 155, 255]);
      expect(detectWhiteSpecsAndBleedHoles(healedImg).specs).toHaveLength(0);
    });

    it("22. healWhiteSpecs 부분 선택(specIds)과 손상된 RGBA 버퍼 예외 처리를 검증한다", () => {
      const img = createRgba(24, 24, 95, 150, 210);
      paintRect(img, 5, 5, 2, 1, 255, 255, 255);
      paintRect(img, 15, 15, 2, 1, 0, 0, 0, 0);

      const detected = detectWhiteSpecsAndBleedHoles(img);
      expect(detected.specs).toHaveLength(2);
      const partial = healWhiteSpecs(img, detected.specs, {
        specIds: [detected.specs[0]?.specId ?? 1],
      });
      expect(partial.healedSpecCount).toBe(1);
      expect(partial.skippedSpecCount).toBe(1);

      expect(() =>
        detectWhiteSpecsAndBleedHoles({ width: 10, height: 10, data: new Uint8ClampedArray(16) }),
      ).toThrow(RangeError);
    });
  });
});
