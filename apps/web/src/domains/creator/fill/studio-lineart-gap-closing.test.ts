import { describe, expect, it } from "vitest";

import {
  applyAdvancedFillPostExpansion,
  closeLineartGapsWithDetailGuard,
  detectMicroDetailProtectionMask,
  estimateLineartGapCloseRadius,
  floodFillWithGapClosing,
  runGapClosedAdvancedFill,
} from "./studio-advanced-fill-expansion";
import {
  generateSingleLightCelShadowMask,
  resolveCelLightPinVector,
} from "./studio-cel-shading-propagation";
import {
  DEFAULT_CHARACTER_PALETTES,
  runThreeLayerUnderpainting,
  type UnderpaintingImageLike,
} from "./studio-underpainting-three-layer-engine";

function makeWhiteCanvas(width: number, height: number): UnderpaintingImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  return { width, height, data };
}

function drawInkPixel(img: UnderpaintingImageLike, x: number, y: number): void {
  if (x < 0 || x >= img.width || y < 0 || y >= img.height) return;
  const off = (y * img.width + x) * 4;
  img.data[off] = 14;
  img.data[off + 1] = 14;
  img.data[off + 2] = 16;
  img.data[off + 3] = 255;
}

function drawBoxWithRightWallGap(
  img: UnderpaintingImageLike,
  box: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number },
  gapWidthPx: number,
): void {
  for (let x = box.x0; x <= box.x1; x += 1) {
    drawInkPixel(img, x, box.y0);
    drawInkPixel(img, x, box.y1);
  }
  const midY = Math.floor((box.y0 + box.y1) / 2);
  const gapStartY = midY - Math.floor(gapWidthPx / 2);
  const gapEndY = gapStartY + gapWidthPx - 1;
  for (let y = box.y0; y <= box.y1; y += 1) {
    drawInkPixel(img, box.x0, y);
    if (gapWidthPx > 0 && y >= gapStartY && y <= gapEndY) continue;
    drawInkPixel(img, box.x1, y);
  }
}

describe("선화 틈새 닫힘 + 미세 디테일 보호(< 24px²) + 팔레트 전파 + 단일 광원 셀 셰이딩 (#136–#140)", () => {
  it("1px~8px 선화 틈새 전 구간에서 자동 반경 추정 및 갭 클로징 누출 0건을 보장한다", () => {
    const box = { x0: 14, y0: 14, x1: 66, y1: 66 };

    // 0px(완전 폐곡선)은 자동 추정 반경 0
    const closedImg = makeWhiteCanvas(80, 80);
    drawBoxWithRightWallGap(closedImg, box, 0);
    expect(estimateLineartGapCloseRadius(closedImg)).toBe(0);

    // 1px ~ 8px 틈새 전 구간 검증: 외곽 누출 픽셀 0건!
    for (const gapWidth of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const img = makeWhiteCanvas(80, 80);
      drawBoxWithRightWallGap(img, box, gapWidth);

      const estimated = estimateLineartGapCloseRadius(img);
      expect(estimated).toBeGreaterThanOrEqual(1);
      expect(estimated).toBeLessThanOrEqual(12);

      const filled = floodFillWithGapClosing(img, { x: 40, y: 40 }, { gapCloseRadiusPx: "auto" });
      expect(filled.leakedToBorder).toBe(false);
      expect(filled.filledPixelCount).toBeGreaterThan(2_000);

      // 박스 외부(x > box.x1 + 1 또는 외곽 경계)로 새어 나간 픽셀이 단 1개도 없어야 한다.
      let leakedPixels = 0;
      for (let y = 0; y < img.height; y += 1) {
        for (let x = 0; x < img.width; x += 1) {
          const outside = x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1;
          if (outside && filled.mask[y * img.width + x]! > 0) {
            leakedPixels += 1;
          }
        }
      }
      expect(leakedPixels).toBe(0);

      // studio-advanced-fill-expansion.ts 통합 경로(runGapClosedAdvancedFill)에서도 동일하게 누출 0건
      const expanded = runGapClosedAdvancedFill({
        target: img,
        referenceImage: img,
        seed: { x: 40, y: 40 },
        fill: [120, 180, 240, 255],
        gapCloseRadiusPx: "auto",
      });
      expect(expanded.blockedByNotStartColor).toBe(false);
      expect(expanded.leakedToBorder).toBe(false);
      expect(expanded.appliedGapCloseRadiusPx).toBeGreaterThanOrEqual(1);
      expect(expanded.mask[2 * img.width + 2]).toBe(0);
    }
  });

  it("미세 디테일 보호 마스크(#140, < 24px²)가 눈동자 하이라이트·머리카락 미세 폐곡선을 틈새 닫힘에서 100% 보호한다", () => {
    const img = makeWhiteCanvas(90, 90);
    // 외곽 6px 틈새가 있는 큰 눈/머리 영역
    drawBoxWithRightWallGap(img, { x0: 10, y0: 10, x1: 78, y1: 78 }, 6);

    // 내부 미세 폐곡선 1: 눈동자 하이라이트 3×4 = 12px² (< 24px²) — 테두리 (24..28, 24..29)
    drawBoxWithRightWallGap(img, { x0: 24, y0: 24, x1: 28, y1: 29 }, 0);
    // 내부 미세 폐곡선 2: 머리카락 미세 틈 4×4 = 16px² (< 24px²) — 테두리 (46..51, 24..29)
    drawBoxWithRightWallGap(img, { x0: 46, y0: 24, x1: 51, y1: 29 }, 0);
    // 비교용 일반 소형 영역: 6×6 = 36px² (>= 24px²) — 보호 대상 아님
    drawBoxWithRightWallGap(img, { x0: 24, y0: 48, x1: 31, y1: 55 }, 0);

    const closed = closeLineartGapsWithDetailGuard(img, {
      gapCloseRadiusPx: 6,
      protectMicroDetailAreaPx: 24,
    });

    expect(closed.microDetailProtection.protectedRegionCount).toBe(2);
    expect(closed.microDetailProtection.protectedPixelCount).toBe(12 + 16);

    // 눈동자 하이라이트(25..27, 25..28)의 모든 픽셀은 틈새 닫힘 장벽(1)에 뭉개지지 않고 열림(0) 유지
    for (let y = 25; y <= 28; y += 1) {
      for (let x = 25; x <= 27; x += 1) {
        const idx = y * img.width + x;
        expect(closed.microDetailProtection.mask[idx]).toBe(255);
        expect(closed.closedBarrier[idx]).toBe(0);
      }
    }

    // 36px² 일반 영역은 < 24px² 보호 마스크에 포함되지 않는다.
    expect(closed.microDetailProtection.mask[51 * img.width + 27]).toBe(0);

    // 주변 영역을 채우고 확장(expandPx=2)해도 눈동자 하이라이트 픽셀은 덮어쓰이지 않고 보호된다.
    const fillResult = applyAdvancedFillPostExpansion({
      mask: new Uint8Array(img.width * img.height),
      target: img,
      referenceImage: img,
      seed: { x: 16, y: 16 },
      fill: [64, 96, 180, 255],
      gapCloseRadiusPx: "auto",
      expandPx: 2,
      expandType: "expand-to-darkest-pixel",
      protectMicroDetailAreaPx: 24,
    });
    expect(fillResult.leakedToBorder).toBe(false);
    expect(fillResult.protectedMicroDetailPixelCount).toBe(28);
    expect(fillResult.mask[26 * img.width + 26]).toBe(0);

    // detectMicroDetailProtectionMask 단독 호출 검증
    const directGuard = detectMicroDetailProtectionMask(closed.originalInkBarrier, 90, 90, 24);
    expect(directGuard.protectedRegionCount).toBe(2);
  });

  it("이전 컷 캐릭터 팔레트 영역 시드를 자동 전파해 마킹 없는 후속 컷(틈새 포함)을 자동 채색한다", () => {
    // 1컷: 왼쪽 인물 A + 오른쪽 인물 B
    const cut1Img = makeWhiteCanvas(100, 70);
    drawBoxWithRightWallGap(cut1Img, { x0: 8, y0: 10, x1: 42, y1: 58 }, 0);
    drawBoxWithRightWallGap(cut1Img, { x0: 56, y0: 10, x1: 90, y1: 58 }, 0);

    const cut1Result = runThreeLayerUnderpainting(cut1Img, {
      cutId: "cut-1",
      lineartLayerId: "ink-1",
      characterPalettes: {
        A: DEFAULT_CHARACTER_PALETTES.A,
        B: DEFAULT_CHARACTER_PALETTES.B,
      },
      markingStrokes: [
        { cutId: "cut-1", label: "A", normalizedXY: [0.25, 0.5] },
        { cutId: "cut-1", label: "B", normalizedXY: [0.73, 0.5] },
      ],
      outputMode: "base_shadow_highlight",
      shadingLevel: "cel_1",
      propagateFromFirstCut: true,
    });

    expect(cut1Result.regionDescriptors).toHaveLength(2);

    // 2컷: 위치가 약간 이동하고 인물 A 선화에 6px 틈새가 있으며 수동 마킹이 0건
    const cut2Img = makeWhiteCanvas(100, 70);
    drawBoxWithRightWallGap(cut2Img, { x0: 10, y0: 12, x1: 44, y1: 60 }, 6);
    drawBoxWithRightWallGap(cut2Img, { x0: 54, y0: 12, x1: 88, y1: 60 }, 4);

    const cut2Result = runThreeLayerUnderpainting(
      cut2Img,
      {
        cutId: "cut-2",
        lineartLayerId: "ink-2",
        characterPalettes: {},
        markingStrokes: [],
        outputMode: "base_shadow_highlight",
        shadingLevel: "cel_1",
        propagateFromFirstCut: true,
        gapCloseRadiusPx: "auto",
        previousCutRegions: cut1Result.regionDescriptors,
        lightPin: { preset: "top-left-45", hardEdge: true },
      },
      cut1Result.resolvedPalettes,
    );

    expect(cut2Result.propagatedSeedCount).toBe(2);
    expect(cut2Result.appliedGapCloseRadiusPx).toBeGreaterThanOrEqual(3);

    const base2 = cut2Result.layers.find((l) => l.role === "base")!.imageData;
    const leftSampleOff = (35 * 100 + 26) * 4;
    const rightSampleOff = (35 * 100 + 70) * 4;
    const outsideOff = (2 * 100 + 2) * 4;

    expect([base2.data[leftSampleOff], base2.data[leftSampleOff + 1], base2.data[leftSampleOff + 2]]).toEqual([
      ...DEFAULT_CHARACTER_PALETTES.A.baseRgb,
    ]);
    expect([base2.data[rightSampleOff], base2.data[rightSampleOff + 1], base2.data[rightSampleOff + 2]]).toEqual([
      ...DEFAULT_CHARACTER_PALETTES.B.baseRgb,
    ]);
    // 6px·4px 틈새 밖 배경으로 누출 0건!
    expect(base2.data[outsideOff + 3]).toBe(0);
  });

  it("단일 광원 방향 핀(좌상단 45° vs 우상단 45°)이 1차 셀 그림자 마스크를 정확한 반대 사분면에 생성한다", () => {
    const topLeftPin = resolveCelLightPinVector({ preset: "top-left-45" });
    expect(topLeftPin.angleDeg).toBe(135);
    expect(topLeftPin.lightSourceVector[0]).toBeCloseTo(-Math.SQRT1_2, 3);
    expect(topLeftPin.lightSourceVector[1]).toBeCloseTo(-Math.SQRT1_2, 3);
    expect(topLeftPin.shadowCastVector[0]).toBeCloseTo(Math.SQRT1_2, 3);
    expect(topLeftPin.shadowCastVector[1]).toBeCloseTo(Math.SQRT1_2, 3);

    // 반지름 24px 원형 캐릭터 실루엣 마스크
    const w = 80;
    const h = 80;
    const fillMask = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (Math.hypot(x - 40, y - 40) <= 24) {
          fillMask[y * w + x] = 255;
        }
      }
    }

    const celTopLeft = generateSingleLightCelShadowMask({
      fillMask,
      width: w,
      height: h,
      pin: { preset: "top-left-45", shadowCoverage: 0.36, hardEdge: true },
    });
    expect(celTopLeft.shadowPixelCount).toBeGreaterThan(200);
    // 좌상단 광원 → 좌상단 표면(28, 28)은 밝음(0), 우하단 표면(54, 54)은 하드 셀 그림자(255)
    expect(celTopLeft.shadowMask[28 * w + 28]).toBe(0);
    expect(celTopLeft.shadowMask[54 * w + 54]).toBe(255);

    const celTopRight = generateSingleLightCelShadowMask({
      fillMask,
      width: w,
      height: h,
      pin: { preset: "top-right-45", shadowCoverage: 0.36, hardEdge: true },
    });
    // 우상단 광원 → 우상단 표면(52, 28)은 밝음(0), 좌하단 표면(26, 54)은 하드 셀 그림자(255)
    expect(celTopRight.shadowMask[28 * w + 52]).toBe(0);
    expect(celTopRight.shadowMask[54 * w + 26]).toBe(255);
  });
});
