import { describe, expect, it } from "vitest";

import {
  calculateTankobonSpreadSpec,
  computeVerticalScrollSlices,
  DESIGN_PLATFORM_FORMAT_PRESETS,
  executeBatchMagicSwitch,
  executeMagicSwitchResize,
  getDesignPlatformFormatPreset,
  type MagicSwitchSourceDocument,
} from "./design-platform-magic-switch";

const SAMPLE_DOC: MagicSwitchSourceDocument = {
  id: "doc-sample",
  title: "회귀자의 시계탑 대표 키비주얼",
  widthPx: 900,
  heightPx: 1200,
  primaryFocalPoint: { x: 0.5, y: 0.36 },
  layers: [
    {
      id: "bg-1",
      name: "배경 일러스트",
      role: "background",
      x: 0,
      y: 0,
      width: 900,
      height: 1200,
    },
    {
      id: "hero-1",
      name: "주인공 캐릭터",
      role: "character",
      x: 160,
      y: 180,
      width: 580,
      height: 820,
      focalPoint: { x: 0.5, y: 0.35 },
    },
    {
      id: "title-1",
      name: "타이틀 로고",
      role: "title-logo",
      x: 100,
      y: 920,
      width: 700,
      height: 160,
      fontSizePx: 54,
      text: "회귀자의 시계탑",
    },
    {
      id: "balloon-1",
      name: "하이라이트 말풍선",
      role: "speech-balloon",
      x: 140,
      y: 1420,
      width: 420,
      height: 180,
      fontSizePx: 22,
    },
  ],
};

describe("design-platform-magic-switch", () => {
  it("한국·글로벌 웹툰 및 단행본 12종 표준 규격을 정확히 조회한다", () => {
    expect(DESIGN_PLATFORM_FORMAT_PRESETS).toHaveLength(12);
    const naverSpec = getDesignPlatformFormatPreset("naver-episode-cut");
    expect(naverSpec.widthPx).toBe(690);
    expect(naverSpec.heightPx).toBe(1080);
    expect(naverSpec.dpi).toBe(72);

    const a5Spec = getDesignPlatformFormatPreset("print-a5-spread");
    expect(a5Spec.dpi).toBe(300);
    expect(a5Spec.colorSpace).toBe("CMYK");
    expect(a5Spec.bleedMm).toBe(3);
  });

  it("세로형 표지(3:4)에서 가로형 배너(16:9)로 변환할 때 생성형 확장(Outpaint) 여백과 안전 영역을 계산한다", () => {
    const result = executeMagicSwitchResize(SAMPLE_DOC, "youtube-pv-16x9");

    expect(result.targetSize.widthPx).toBe(1280);
    expect(result.targetSize.heightPx).toBe(720);
    expect(result.outpaintExpansion.required).toBe(true);
    expect(result.outpaintExpansion.leftPx + result.outpaintExpansion.rightPx).toBeGreaterThan(400);
    expect(result.safeZoneComplianceScore).toBe(100);
    expect(result.overallQualityScore).toBeGreaterThanOrEqual(85);
  });

  it("다중 플랫폼 규격에 대해 일괄 Magic Switch 리사이즈를 수행한다", () => {
    const batch = executeBatchMagicSwitch(SAMPLE_DOC, [
      "naver-square-thumb",
      "insta-cuttoon-4x5",
      "shorts-reels-9x16",
    ]);

    expect(batch).toHaveLength(3);
    expect(batch[0]?.targetSize.widthPx).toBe(480);
    expect(batch[1]?.targetSize.heightPx).toBe(1350);
    expect(batch[2]?.targetSize.heightPx).toBe(1920);
  });

  it("단행본 A5/B5 펼침면의 책등(Spine) 폭과 300DPI 픽셀 가이드를 정확히 산출한다", () => {
    const spec = calculateTankobonSpreadSpec({
      trimSize: "A5",
      pageCount: 200,
      paperStock: "white-offset-100g",
      bindingType: "perfect-softcover",
      flapWidthMm: 80,
      bleedMm: 3,
      dpi: 300,
    });

    // 200쪽 / 2 = 100장 * 0.122mm + 0.6mm = 12.8mm 책등
    expect(spec.spineWidthMm).toBe(12.8);
    expect(spec.totalSpreadWidthMm).toBe(474.8);
    expect(spec.totalSpreadHeightMm).toBe(216);
    expect(spec.totalSpreadWidthPx).toBeGreaterThan(5500);
    expect(spec.guidesPx.spineEndPx).toBeGreaterThan(spec.guidesPx.spineStartPx);
  });

  it("세로 스크롤 장편 원고를 말풍선 절단 없이 안전한 여백(Gutter)으로 스냅 분할한다", () => {
    const slices = computeVerticalScrollSlices({
      documentId: "ep-scroll-1",
      widthPx: 690,
      totalHeightPx: 3200,
      maxSliceHeightPx: 1500,
      layers: SAMPLE_DOC.layers,
      gutterSnapTolerancePx: 180,
    });

    expect(slices.length).toBeGreaterThanOrEqual(2);
    // balloon-1 (y=1420..1600)이 1500px 절단선에 걸리므로 1412px로 자동 스냅된다
    expect(slices[0]?.snappedToGutter).toBe(true);
    expect(slices[0]?.endYPx).toBe(1412);
  });
});
