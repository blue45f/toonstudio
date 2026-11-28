import { describe, expect, it } from "vitest";

import {
  buildGapClosingFlatFillWgsl,
  closeLineartGapsDeterministically,
  compareNaiveVsGapClosedFloodFill,
  packGapClosingFlatFillUniforms,
  renderGapClosingFlatFillAuditSvg,
  runGapClosingFloodFill,
  summarizeGapClosingFlatFillKo,
  synthesizeAntiHaloUnderbleedFlats,
  validateGapClosingFlatFillWgsl,
  type LineartAlphaField,
  type UnderbleedRegionSeed,
} from "./index";

function createField(width: number, height: number): LineartAlphaField {
  return { width, height, inkAlpha: new Float32Array(width * height) };
}

function setPixel(field: LineartAlphaField, x: number, y: number, alpha: number): void {
  if (x < 0 || x >= field.width || y < 0 || y >= field.height) return;
  const idx = y * field.width + x;
  if (alpha > field.inkAlpha[idx]) field.inkAlpha[idx] = alpha;
}

function drawRectOutline(field: LineartAlphaField, x0: number, y0: number, x1: number, y1: number, alpha = 1.0): void {
  for (let x = x0; x <= x1; x += 1) { setPixel(field, x, y0, alpha); setPixel(field, x, y1, alpha); }
  for (let y = y0; y <= y1; y += 1) { setPixel(field, x0, y, alpha); setPixel(field, x1, y, alpha); }
}

function clearHorizontalGap(field: LineartAlphaField, y: number, startX: number, gapWidth: number): void {
  for (let dx = 0; dx < gapWidth; dx += 1) {
    const x = startX + dx;
    if (x >= 0 && x < field.width && y >= 0 && y < field.height) field.inkAlpha[y * field.width + x] = 0;
  }
}

function clearVerticalGap(field: LineartAlphaField, x: number, startY: number, gapHeight: number): void {
  for (let dy = 0; dy < gapHeight; dy += 1) {
    const y = startY + dy;
    if (x >= 0 && x < field.width && y >= 0 && y < field.height) field.inkAlpha[y * field.width + x] = 0;
  }
}

function makeExpectedBoxInterior(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (let y = y0 + 1; y < y1; y += 1) {
    for (let x = x0 + 1; x < x1; x += 1) mask[y * w + x] = 1;
  }
  return mask;
}

/** 피부·머리카락·옷깃 3개 구역이 2px 안티앨리어싱 먹선으로 맞닿은 웹툰 원고 픽스처. */
function buildThreeRegionAntiAliasedPanel(openOuterHairGapPx = 0): {
  readonly field: LineartAlphaField;
  readonly seeds: readonly UnderbleedRegionSeed[];
} {
  const field = createField(64, 64);
  drawRectOutline(field, 8, 8, 55, 55, 0.65);
  drawRectOutline(field, 9, 9, 54, 54, 0.72);
  for (let x = 10; x <= 53; x += 1) { setPixel(field, x, 24, 0.68); setPixel(field, x, 25, 0.72); }
  for (let y = 26; y <= 53; y += 1) { setPixel(field, 31, y, 0.7); setPixel(field, 32, y, 0.66); }
  if (openOuterHairGapPx > 0) {
    clearHorizontalGap(field, 8, 28, openOuterHairGapPx);
    clearHorizontalGap(field, 9, 28, openOuterHairGapPx);
  }
  const seeds: readonly UnderbleedRegionSeed[] = [
    { regionId: "hair", labelKo: "머리카락", seedX: 30, seedY: 16, oklch: { l: 0.34, c: 0.08, h: 270 } },
    { regionId: "skin", labelKo: "피부", seedX: 20, seedY: 40, oklch: { l: 0.87, c: 0.06, h: 62 } },
    { regionId: "collar", labelKo: "옷깃", seedX: 44, seedY: 40, oklch: { l: 0.56, c: 0.14, h: 242 } },
  ];
  return { field, seeds };
}

describe("Wave 119 — Gap-Closing Flat Fill & Anti-Halo Underbleed Solver", () => {
  describe("1. 선화 틈새 자동 밀봉 및 4/8-연결 버킷 채색", () => {
    it("1) 2px 수평 선화 틈새를 정확히 밀봉하고 경계 누출 0건을 달성한다", () => {
      const field = createField(48, 48);
      drawRectOutline(field, 10, 10, 38, 38, 1.0);
      clearHorizontalGap(field, 10, 22, 2);
      const cmp = compareNaiveVsGapClosedFloodFill(field, { seedX: 24, seedY: 24, maxGapWidthPx: 2 });
      expect(cmp.ok).toBe(true);
      expect(cmp.naiveLeakedToBorder).toBe(true);
      expect(cmp.gapClosedLeakedToBorder).toBe(false);
      expect(cmp.leakedPixels).toBe(0);
      expect(cmp.bridgePixelCount).toBe(2);
      expect(cmp.gapClosedFilledPixelCount).toBe(27 * 27);
    });

    it("2) 4px 수평 틈새에서 Naive는 외곽 누출하고 Gap-Closed는 누출 0건을 실측 증명한다", () => {
      const field = createField(56, 56);
      drawRectOutline(field, 12, 12, 44, 44, 1.0);
      clearHorizontalGap(field, 12, 26, 4);
      const expected = makeExpectedBoxInterior(56, 56, 12, 12, 44, 44);
      const cmp = compareNaiveVsGapClosedFloodFill(field, {
        seedX: 28, seedY: 28, maxGapWidthPx: 4, expectedInteriorMask: expected,
      });
      expect(cmp.naiveLeakedToBorder).toBe(true);
      expect(cmp.naiveLeakedPixels).toBeGreaterThan(1000);
      expect(cmp.gapClosedLeakedToBorder).toBe(false);
      expect(cmp.leakedPixels).toBe(0);
      expect(cmp.preventedLeakPixelCount).toBeGreaterThan(1000);
      expect(cmp.sealEffective).toBe(true);
      expect(cmp.gapClosed.touchedBridgePixelCount).toBe(4);
    });

    it("3) 6px 수직 틈새를 maxGapWidthPx=6으로 완벽히 밀봉한다", () => {
      const field = createField(56, 56);
      drawRectOutline(field, 10, 10, 44, 44, 1.0);
      clearVerticalGap(field, 44, 24, 6);
      const cmp = compareNaiveVsGapClosedFloodFill(field, { seedX: 26, seedY: 26, maxGapWidthPx: 6 });
      expect(cmp.naiveLeakedToBorder).toBe(true);
      expect(cmp.gapClosedLeakedToBorder).toBe(false);
      expect(cmp.leakedPixels).toBe(0);
      expect(cmp.bridgePixelCount).toBe(6);
      expect(cmp.gapClosed.barrier.detectedGapSegments[0]?.orientation).toBe("vertical");
    });

    it("4) 6px 틈새는 maxGapWidthPx=4 예산에서 임의로 초과 밀봉하지 않는다", () => {
      const field = createField(50, 50);
      drawRectOutline(field, 10, 10, 40, 40, 1.0);
      clearHorizontalGap(field, 10, 22, 6);
      const res = runGapClosingFloodFill(field, { seedX: 25, seedY: 25, maxGapWidthPx: 4 });
      expect(res.ok).toBe(true);
      expect(res.bridgePixelCount).toBe(0);
      expect(res.leakedToBorder).toBe(true);
    });

    it("5) 14px 넓은 통로(문)는 maxGapWidthPx=6·8에서도 잘못 막지 않고 정상 관통한다", () => {
      const field = createField(64, 48);
      drawRectOutline(field, 6, 8, 58, 38, 1.0);
      for (let y = 9; y <= 37; y += 1) {
        if (y >= 16 && y <= 29) continue; // 14px 넓은 문
        setPixel(field, 30, y, 1.0);
      }
      const res = runGapClosingFloodFill(field, { seedX: 16, seedY: 22, maxGapWidthPx: 8 });
      expect(res.ok).toBe(true);
      expect(res.bridgePixelCount).toBe(0);
      expect(res.leakedToBorder).toBe(false);
      expect(res.filledMask[22 * 64 + 44]).toBe(1);
    });

    it("6) 닫힌 직각 모서리 내부를 둥글게 깎지 않고 정확한 내부 픽셀 수를 보존한다", () => {
      const field = createField(40, 40);
      drawRectOutline(field, 8, 8, 32, 32, 1.0);
      const barrier = closeLineartGapsDeterministically(field, { maxGapWidthPx: 6 });
      const fill = runGapClosingFloodFill(field, { seedX: 20, seedY: 20, maxGapWidthPx: 6 });
      expect(barrier.ok).toBe(true);
      expect(barrier.closedGapPixelCount).toBe(0);
      expect(fill.filledPixelCount).toBe(23 * 23);
      expect(fill.filledMask[9 * 40 + 9]).toBe(1);
      expect(fill.filledMask[9 * 40 + 31]).toBe(1);
      expect(fill.filledMask[31 * 40 + 9]).toBe(1);
      expect(fill.filledMask[31 * 40 + 31]).toBe(1);
    });

    it("7) 45도 대각선 마름모 선화의 대각 틈새를 4-연결·8-연결 모두 수밀 밀봉한다", () => {
      const field = createField(56, 56);
      const cx = 28; const cy = 28; const radius = 16;
      for (let y = 0; y < 56; y += 1) {
        for (let x = 0; x < 56; x += 1) {
          const m = Math.abs(x - cx) + Math.abs(y - cy);
          if (m === radius || m === radius + 1) setPixel(field, x, y, 1.0);
        }
      }
      for (let t = 7; t <= 8; t += 1) {
        const gx = cx + t; const gy = cy - (radius - t);
        field.inkAlpha[gy * 56 + gx] = 0;
        field.inkAlpha[(gy - 1) * 56 + gx] = 0;
        field.inkAlpha[gy * 56 + (gx + 1)] = 0;
      }
      const cmp4 = compareNaiveVsGapClosedFloodFill(field, { seedX: cx, seedY: cy, maxGapWidthPx: 5, connectivity: 4 });
      const cmp8 = compareNaiveVsGapClosedFloodFill(field, { seedX: cx, seedY: cy, maxGapWidthPx: 5, connectivity: 8 });
      expect(cmp4.naiveLeakedToBorder).toBe(true);
      expect(cmp4.gapClosedLeakedToBorder).toBe(false);
      expect(cmp4.leakedPixels).toBe(0);
      expect(cmp8.naiveLeakedToBorder).toBe(true);
      expect(cmp8.gapClosedLeakedToBorder).toBe(false);
      expect(cmp8.leakedPixels).toBe(0);
    });

    it("8) 서로 떨어진 두 선분 컴포넌트 사이의 3px 틈새도 즉시 밀봉한다", () => {
      const field = createField(48, 48);
      for (let x = 10; x <= 34; x += 1) setPixel(field, x, 10, 1.0);
      for (let y = 10; y <= 34; y += 1) setPixel(field, 10, y, 1.0);
      for (let x = 14; x <= 38; x += 1) setPixel(field, x, 38, 1.0);
      for (let y = 14; y <= 38; y += 1) setPixel(field, 38, y, 1.0);
      const cmp = compareNaiveVsGapClosedFloodFill(field, { seedX: 24, seedY: 24, maxGapWidthPx: 6 });
      expect(cmp.naiveLeakedToBorder).toBe(true);
      expect(cmp.gapClosedLeakedToBorder).toBe(false);
      expect(cmp.detectedGapCount).toBeGreaterThanOrEqual(2);
    });

    it("9) 2px 두께 안티앨리어싱 벽의 4px 틈새를 과도한 팽창 없이 최소 브리지로 밀봉한다", () => {
      const field = createField(52, 52);
      drawRectOutline(field, 10, 10, 42, 42, 0.72);
      drawRectOutline(field, 11, 11, 41, 41, 0.95);
      clearHorizontalGap(field, 10, 24, 4);
      clearHorizontalGap(field, 11, 24, 4);
      const cmp = compareNaiveVsGapClosedFloodFill(field, { seedX: 26, seedY: 26, maxGapWidthPx: 4 });
      expect(cmp.naiveLeakedToBorder).toBe(true);
      expect(cmp.gapClosedLeakedToBorder).toBe(false);
      expect(cmp.bridgePixelCount).toBeLessThanOrEqual(8);
    });

    it("10) 4-연결 vs 8-연결 버킷 채색 차이를 1px 대각 장벽에서 정확히 구분한다", () => {
      const field = createField(24, 24);
      for (let i = 0; i < 24; i += 1) setPixel(field, i, i, 1.0);
      const fill4 = runGapClosingFloodFill(field, { seedX: 4, seedY: 16, connectivity: 4, maxGapWidthPx: 0 });
      const fill8 = runGapClosingFloodFill(field, { seedX: 4, seedY: 16, connectivity: 8, maxGapWidthPx: 0 });
      expect(fill4.filledMask[4 * 24 + 16]).toBe(0);
      expect(fill8.filledMask[4 * 24 + 16]).toBe(1);
    });

    it("11) maxGapWidthPx=0이면 브리지를 생성하지 않고 일반 채색과 동일한 결과를 반환한다", () => {
      const field = createField(40, 40);
      drawRectOutline(field, 10, 10, 30, 30, 1.0);
      clearHorizontalGap(field, 10, 18, 3);
      const cmp = compareNaiveVsGapClosedFloodFill(field, { seedX: 20, seedY: 20, maxGapWidthPx: 0 });
      expect(cmp.bridgePixelCount).toBe(0);
      expect(cmp.naiveFilledPixelCount).toBe(cmp.gapClosedFilledPixelCount);
      expect(cmp.preventedLeakPixelCount).toBe(0);
    });

    it("12) 닫힌 정상 선화에서는 Naive와 Gap-Closed 모두 누출 0건이며 브리지도 0px다", () => {
      const field = createField(44, 44);
      drawRectOutline(field, 10, 10, 34, 34, 1.0);
      const cmp = compareNaiveVsGapClosedFloodFill(field, { seedX: 22, seedY: 22, maxGapWidthPx: 6 });
      expect(cmp.ok).toBe(true);
      expect(cmp.naiveLeakedToBorder).toBe(false);
      expect(cmp.gapClosedLeakedToBorder).toBe(false);
      expect(cmp.bridgePixelCount).toBe(0);
      expect(cmp.leakedPixels).toBe(0);
    });

    it("13) 동일 입력에 대해 100% 결정론적으로 비트 단위 동일 결과를 반환한다", () => {
      const field = createField(48, 48);
      drawRectOutline(field, 10, 10, 38, 38, 0.85);
      clearHorizontalGap(field, 10, 22, 4);
      const first = compareNaiveVsGapClosedFloodFill(field, { seedX: 24, seedY: 24, maxGapWidthPx: 4 });
      const second = compareNaiveVsGapClosedFloodFill(field, { seedX: 24, seedY: 24, maxGapWidthPx: 4 });
      expect(Array.from(first.gapClosed.filledMask)).toEqual(Array.from(second.gapClosed.filledMask));
      expect(Array.from(first.gapClosed.barrier.bridgeMask)).toEqual(Array.from(second.gapClosed.barrier.bridgeMask));
      expect(first.gapClosed.barrier.detectedGapSegments).toEqual(second.gapClosed.barrier.detectedGapSegments);
    });
  });

  describe("2. 잘못된 시드·범위 밖 좌표·오염 입력 Fail-Closed 방어", () => {
    it("14) 음수 시드 좌표를 fail-closed(rejected-out-of-bounds)로 거부한다", () => {
      const res = runGapClosingFloodFill(createField(24, 24), { seedX: -1, seedY: 10 });
      expect(res.ok).toBe(false);
      expect(res.status).toBe("rejected-out-of-bounds");
      expect(res.filledPixelCount).toBe(0);
    });

    it("15) 캔버스 너비/높이 이상의 범위 밖 시드 좌표를 fail-closed로 거부한다", () => {
      const res = runGapClosingFloodFill(createField(24, 24), { seedX: 24, seedY: 12 });
      expect(res.ok).toBe(false);
      expect(res.status).toBe("rejected-out-of-bounds");
      expect(res.filledPixelCount).toBe(0);
    });

    it("16) NaN·Infinity 비유한 시드 좌표를 fail-closed(rejected-non-finite-seed)로 거부한다", () => {
      const field = createField(24, 24);
      const resNaN = runGapClosingFloodFill(field, { seedX: Number.NaN, seedY: 8 });
      const resInf = runGapClosingFloodFill(field, { seedX: 8, seedY: Number.POSITIVE_INFINITY });
      expect(resNaN.ok).toBe(false);
      expect(resNaN.status).toBe("rejected-non-finite-seed");
      expect(resInf.ok).toBe(false);
      expect(resInf.status).toBe("rejected-non-finite-seed");
    });

    it("17) 먹선 픽셀 위를 찍은 시드는 fail-closed(rejected-seed-on-ink)로 거부한다", () => {
      const field = createField(32, 32);
      drawRectOutline(field, 8, 8, 24, 24, 1.0);
      const res = runGapClosingFloodFill(field, { seedX: 8, seedY: 12 });
      expect(res.ok).toBe(false);
      expect(res.status).toBe("rejected-seed-on-ink");
      expect(res.filledPixelCount).toBe(0);
    });

    it("18) 잘못된 해상도 또는 버퍼 길이 불일치를 fail-closed(rejected-invalid-field)로 거부한다", () => {
      const badDim = closeLineartGapsDeterministically({ width: 0, height: 16, inkAlpha: new Float32Array(0) });
      const badLen = closeLineartGapsDeterministically({ width: 16, height: 16, inkAlpha: new Float32Array(10) });
      expect(badDim.ok).toBe(false);
      expect(badDim.failureCode).toBe("rejected-invalid-field");
      expect(badLen.ok).toBe(false);
      expect(badLen.failureCode).toBe("rejected-invalid-field");
    });

    it("19) inkAlpha 내부에 NaN·Infinity가 섞이면 fail-closed(rejected-non-finite-alpha)로 중단한다", () => {
      const field = createField(16, 16);
      field.inkAlpha[20] = Number.NaN;
      const barrier = closeLineartGapsDeterministically(field);
      expect(barrier.ok).toBe(false);
      expect(barrier.failureCode).toBe("rejected-non-finite-alpha");
    });

    it("20) 범위를 벗어난 maxGapWidthPx·inkThreshold 옵션을 fail-closed로 거부한다", () => {
      const field = createField(20, 20);
      const badGap = closeLineartGapsDeterministically(field, { maxGapWidthPx: 12 });
      const badThresh = closeLineartGapsDeterministically(field, { inkThreshold: 0 });
      expect(badGap.ok).toBe(false);
      expect(badGap.failureCode).toBe("rejected-invalid-options");
      expect(badThresh.ok).toBe(false);
      expect(badThresh.failureCode).toBe("rejected-invalid-options");
    });
  });

  describe("3. 안티-할로(Anti-Halo) 다중 구역 보로노이 언더블리드 트래핑", () => {
    it("21) 피부·머리카락·옷깃 2px 안티앨리어싱 먹선에서 흰 할로 0px + 이웃 교차 침범 0px을 동시 달성한다", () => {
      const { field, seeds } = buildThreeRegionAntiAliasedPanel(0);
      const report = synthesizeAntiHaloUnderbleedFlats(field, seeds, { maxGapWidthPx: 4, maxUnderbleedRadiusPx: 4 });
      expect(report.ok).toBe(true);
      expect(report.regions.every((r) => r.ok)).toBe(true);
      expect(report.naiveWhiteHaloPixelCount).toBeGreaterThan(100);
      expect(report.remainingWhiteHaloPixelCount).toBe(0);
      expect(report.haloRemovalRate).toBe(1);
      expect(report.neighborCrossBleedPixelCount).toBe(0);
      expect(report.voronoiHalfPlaneViolationCount).toBe(0);
      expect(report.sharedBorderPixelCount).toBeGreaterThan(40);
      expect(report.trappedOwnerMap[24 * 64 + 20]).toBe(1);
      expect(report.trappedOwnerMap[25 * 64 + 20]).toBe(2);
      expect(report.trappedOwnerMap[24 * 64 + 44]).toBe(1);
      expect(report.trappedOwnerMap[25 * 64 + 44]).toBe(3);
      expect(report.trappedOwnerMap[40 * 64 + 31]).toBe(2);
      expect(report.trappedOwnerMap[40 * 64 + 32]).toBe(3);
    });

    it("22) 3px 안티앨리어싱 먹선([0.55, 1.0, 0.55])에서도 양쪽 반투명 가장자리와 중심선까지 할로 0px로 메운다", () => {
      const field = createField(48, 36);
      drawRectOutline(field, 4, 4, 43, 31, 1.0);
      for (let y = 5; y <= 30; y += 1) {
        setPixel(field, 22, y, 0.55); setPixel(field, 23, y, 1.0); setPixel(field, 24, y, 0.55);
      }
      const report = synthesizeAntiHaloUnderbleedFlats(field, [
        { regionId: "left", labelKo: "왼쪽 피부", seedX: 12, seedY: 18, oklch: { l: 0.86, c: 0.06, h: 65 } },
        { regionId: "right", labelKo: "오른쪽 옷", seedX: 34, seedY: 18, oklch: { l: 0.48, c: 0.12, h: 240 } },
      ]);
      expect(report.ok).toBe(true);
      expect(report.naiveWhiteHaloPixelCount).toBeGreaterThanOrEqual(52);
      expect(report.remainingWhiteHaloPixelCount).toBe(0);
      expect(report.neighborCrossBleedPixelCount).toBe(0);
      expect(report.trappedOwnerMap[18 * 48 + 22]).toBe(1);
      expect(report.trappedOwnerMap[18 * 48 + 24]).toBe(2);
    });

    it("23) 외곽 실루엣 2px 먹선에서 안쪽 흰 할로는 0px로 메우고 바깥 여백 쪽으로는 번지지 않는다", () => {
      const field = createField(40, 40);
      drawRectOutline(field, 10, 10, 30, 30, 0.65);
      drawRectOutline(field, 11, 11, 29, 29, 0.65);
      const report = synthesizeAntiHaloUnderbleedFlats(field, [
        { regionId: "face", labelKo: "얼굴", seedX: 20, seedY: 20, oklch: { l: 0.88, c: 0.05, h: 60 } },
      ]);
      expect(report.ok).toBe(true);
      expect(report.remainingWhiteHaloPixelCount).toBe(0);
      expect(report.neighborCrossBleedPixelCount).toBe(0);
      expect(report.trappedOwnerMap[20 * 40 + 11]).toBe(1);
      expect(report.trappedOwnerMap[20 * 40 + 10]).toBe(0);
      expect(report.trappedOwnerMap[20 * 40 + 9]).toBe(0);
    });

    it("24) 열린 4px 외곽 틈새가 있는 다중 구역 원고에서도 틈새 밀봉 + 안티-할로가 함께 성공한다", () => {
      const { field, seeds } = buildThreeRegionAntiAliasedPanel(4);
      const report = synthesizeAntiHaloUnderbleedFlats(field, seeds, { maxGapWidthPx: 4, maxUnderbleedRadiusPx: 4 });
      expect(report.ok).toBe(true);
      expect(report.barrier.closedGapPixelCount).toBeGreaterThan(0);
      expect(report.regions.every((r) => r.ok && !r.leakedToBorder)).toBe(true);
      expect(report.remainingWhiteHaloPixelCount).toBe(0);
      expect(report.neighborCrossBleedPixelCount).toBe(0);
    });

    it("25) 일부 시드가 잘못되어도 거부 목록에 기록하고 나머지 정상 구역은 안전하게 합성한다", () => {
      const { field, seeds } = buildThreeRegionAntiAliasedPanel(0);
      const mixedSeeds: readonly UnderbleedRegionSeed[] = [
        ...seeds,
        { regionId: "bad-oob", labelKo: "범위밖", seedX: 999, seedY: 10, oklch: { l: 0.5, c: 0.1, h: 10 } },
        { regionId: "bad-ink", labelKo: "먹선위", seedX: 31, seedY: 40, oklch: { l: 0.5, c: 0.1, h: 90 } },
      ];
      const report = synthesizeAntiHaloUnderbleedFlats(field, mixedSeeds);
      expect(report.ok).toBe(true);
      expect(report.rejectedRegionIds).toEqual(["bad-oob", "bad-ink"]);
      expect(report.remainingWhiteHaloPixelCount).toBe(0);
      expect(report.neighborCrossBleedPixelCount).toBe(0);
    });

    it("26) 같은 내부 공간에 중복 시드를 넣으면 첫 시드가 소유하고 두 번째는 중복 거부된다", () => {
      const { field, seeds } = buildThreeRegionAntiAliasedPanel(0);
      const report = synthesizeAntiHaloUnderbleedFlats(field, [
        seeds[0],
        { regionId: "hair-dup", labelKo: "머리카락 중복", seedX: 35, seedY: 16, oklch: { l: 0.4, c: 0.1, h: 120 } },
      ]);
      expect(report.ok).toBe(true);
      expect(report.rejectedRegionIds).toEqual(["hair-dup"]);
      expect(report.regions[1]?.status).toBe("rejected-duplicate-region");
      expect(report.neighborCrossBleedPixelCount).toBe(0);
    });

    it("27) 유효하지 않은 언더블리드 임계값·반경 옵션은 fail-closed로 거부한다", () => {
      const { field, seeds } = buildThreeRegionAntiAliasedPanel(0);
      expect(synthesizeAntiHaloUnderbleedFlats(field, seeds, { inkThreshold: 0.5, inkSolidThreshold: 0.4 }).ok).toBe(false);
      expect(synthesizeAntiHaloUnderbleedFlats(field, seeds, { maxUnderbleedRadiusPx: 0 }).ok).toBe(false);
    });

    it("28) 다중 구역 보로노이 언더블리드 합성이 반복 호출 시 완벽히 결정론적이다", () => {
      const { field, seeds } = buildThreeRegionAntiAliasedPanel(4);
      const r1 = synthesizeAntiHaloUnderbleedFlats(field, seeds, { maxGapWidthPx: 4 });
      const r2 = synthesizeAntiHaloUnderbleedFlats(field, seeds, { maxGapWidthPx: 4 });
      expect(Array.from(r1.trappedOwnerMap)).toEqual(Array.from(r2.trappedOwnerMap));
      expect(Array.from(r1.underbleedAddedMask)).toEqual(Array.from(r2.underbleedAddedMask));
      expect(r1.naiveWhiteHaloPixelCount).toBe(r2.naiveWhiteHaloPixelCount);
      expect(r1.remainingWhiteHaloPixelCount).toBe(r2.remainingWhiteHaloPixelCount);
    });
  });

  describe("4. WebGPU WGSL 셰이더 생성·유니폼 16B 정렬 및 정적 검증", () => {
    it("29) packGapClosingFlatFillUniforms가 64바이트(16B 정렬) 버퍼를 생성하고 비유한 값을 안전 정규화한다", () => {
      const buf = packGapClosingFlatFillUniforms({
        width: 1024, height: 2048, maxGapWidthPx: 6, inkThreshold: Number.NaN, connectivity: 8,
      });
      expect(buf.byteLength).toBe(64);
      expect(buf.byteLength % 16).toBe(0);
      expect(buf[0]).toBe(1024);
      expect(buf[1]).toBe(2048);
      expect(buf[2]).toBe(6);
      expect(buf[3]).toBe(0);
      expect(buf[7]).toBe(8);
      expect(Array.from(buf).every((v) => Number.isFinite(v))).toBe(true);
    });

    it("30) 기본 및 사용자 워크그룹 크기의 WGSL 번들이 정렬·바인딩·GLSL 금지 검사를 통과한다", () => {
      const defaultBundle = buildGapClosingFlatFillWgsl();
      const customBundle = buildGapClosingFlatFillWgsl({
        workgroupSizeX: 16, workgroupSizeY: 4, maxGapWidthPx: 6, maxUnderbleedRadiusPx: 5,
      });
      const v1 = validateGapClosingFlatFillWgsl(defaultBundle);
      const v2 = validateGapClosingFlatFillWgsl(customBundle);
      expect(v1.valid).toBe(true);
      expect(v1.errors).toEqual([]);
      expect(v1.isUniform16ByteAligned).toBe(true);
      expect(v1.forbiddenGlslTokensFound).toEqual([]);
      expect(v1.computeEntryPoints).toContain("cs_gap_closing_barrier");
      expect(v1.fragmentEntryPoints).toContain("fs_underbleed_composite");
      expect(v2.valid).toBe(true);
      expect(customBundle.workgroupSize).toEqual([16, 4, 1]);
    });

    it("31) GLSL 금지 토큰(gl_FragColor·texture2D·vec4(·float)이 섞인 오염 셰이더를 거부한다", () => {
      const bundle = buildGapClosingFlatFillWgsl();
      const validation = validateGapClosingFlatFillWgsl({
        ...bundle,
        underbleedCompositeFragmentWgsl: `${bundle.underbleedCompositeFragmentWgsl}\nfloat leak = 1.0;\ngl_FragColor = vec4(1.0);`,
      });
      expect(validation.valid).toBe(false);
      expect(validation.forbiddenGlslTokensFound).toContain("gl_FragColor");
      expect(validation.forbiddenGlslTokensFound).toContain("glsl-vec-ctor");
      expect(validation.forbiddenGlslTokensFound).toContain("glsl-float-decl");
    });

    it("32) 괄호 불균형·바인딩 누락·진입점 삭제·16바이트 미정렬 유니폼을 모두 거부한다", () => {
      const bundle = buildGapClosingFlatFillWgsl();
      const validation = validateGapClosingFlatFillWgsl({
        uniformByteLength: 40,
        gapClosingComputeWgsl: bundle.gapClosingComputeWgsl
          .replace("@binding(2)", "@binding(9)")
          .replace("cs_gap_closing_barrier", "broken_entry")
          .concat("{"),
        underbleedCompositeFragmentWgsl: bundle.underbleedCompositeFragmentWgsl.replace("@binding(3)", "@binding(1)"),
      });
      expect(validation.valid).toBe(false);
      expect(validation.isUniform16ByteAligned).toBe(false);
      expect(validation.errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("5. 순수 OKLCH 비교 검수 SVG 및 번역투 없는 한국어 QA 브리프", () => {
    it("33) renderGapClosingFlatFillAuditSvg가 100% oklch 색공간과 유한 좌표만 출력한다", () => {
      const gapField = createField(48, 48);
      drawRectOutline(gapField, 10, 10, 38, 38, 0.9);
      clearHorizontalGap(gapField, 10, 22, 4);
      const cmp = compareNaiveVsGapClosedFloodFill(gapField, { seedX: 24, seedY: 24, maxGapWidthPx: 4 });
      const { field: trapField, seeds } = buildThreeRegionAntiAliasedPanel(4);
      const trap = synthesizeAntiHaloUnderbleedFlats(trapField, seeds, { maxGapWidthPx: 4 });
      const svgResult = renderGapClosingFlatFillAuditSvg(cmp, trap);
      expect(svgResult.panelCount).toBe(3);
      expect(svgResult.renderedRunRectCount).toBeGreaterThan(20);
      expect(svgResult.usesPureOklchOnly).toBe(true);
      expect(svgResult.hasFiniteCoordinatesOnly).toBe(true);
      expect(svgResult.svg).toContain("oklch(");
      expect(svgResult.svg).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(svgResult.svg).not.toMatch(/\b(?:rgba?|hsla?)\s*\(/i);
      expect(svgResult.svg).not.toMatch(/(?:NaN|Infinity|undefined)/);
    });

    it("34) SVG 제목·부제·구역 이름의 XML 특수문자(<>&\"')를 안전하게 이스케이프한다", () => {
      const gapField = createField(32, 32);
      drawRectOutline(gapField, 6, 6, 25, 25, 1.0);
      const cmp = compareNaiveVsGapClosedFloodFill(gapField, { seedX: 15, seedY: 15 });
      const { field: trapField, seeds } = buildThreeRegionAntiAliasedPanel(0);
      const xssSeeds: readonly UnderbleedRegionSeed[] = [
        { ...seeds[0], labelKo: "<script>alert('x')</script> & \"머리\"" },
        seeds[1], seeds[2],
      ];
      const trap = synthesizeAntiHaloUnderbleedFlats(trapField, xssSeeds);
      const svgResult = renderGapClosingFlatFillAuditSvg(cmp, trap, {
        title: "검수 <script> & \"따옴표\" '단일'",
        subtitle: "A < B && C > D",
      });
      expect(svgResult.svg).not.toContain("<script>");
      expect(svgResult.svg).toContain("&lt;script&gt;");
      expect(svgResult.svg).toContain("&amp;");
      expect(svgResult.svg).toContain("&quot;");
      expect(svgResult.svg).toContain("&apos;");
      expect(svgResult.usesPureOklchOnly).toBe(true);
    });

    it("35) summarizeGapClosingFlatFillKo가 번역투 없이 정확한 통과 판정과 수치를 보고한다", () => {
      const gapField = createField(48, 48);
      drawRectOutline(gapField, 10, 10, 38, 38, 1.0);
      clearHorizontalGap(gapField, 10, 22, 4);
      const cmp = compareNaiveVsGapClosedFloodFill(gapField, { seedX: 24, seedY: 24, maxGapWidthPx: 4 });
      const { field: trapField, seeds } = buildThreeRegionAntiAliasedPanel(4);
      const trap = synthesizeAntiHaloUnderbleedFlats(trapField, seeds, { maxGapWidthPx: 4 });
      const report = summarizeGapClosingFlatFillKo(cmp, trap);
      expect(report.verdict).toBe("pass");
      expect(report.checklistKo.every((item) => item.passed)).toBe(true);
      expect(report.fullReportKo).toContain("누출 0px");
      expect(report.fullReportKo).toContain("잔여 할로 0px");
      expect(report.fullReportKo).toContain("교차 침범");
      for (const phrase of ["가능하게 합니다", "경험을 제공합니다", "워크플로우를 보장합니다", "직관적인 경험", "원활한 워크플로우"]) {
        expect(report.fullReportKo).not.toContain(phrase);
      }
    });

    it("36) 누출이 남았거나 잘못된 시드로 중단된 경우 attention/blocked 판정을 정확히 구분한다", () => {
      const openField = createField(40, 40);
      drawRectOutline(openField, 8, 8, 32, 32, 1.0);
      clearHorizontalGap(openField, 8, 16, 8);
      const leakyCmp = compareNaiveVsGapClosedFloodFill(openField, { seedX: 20, seedY: 20, maxGapWidthPx: 2 });
      const { field: trapField, seeds } = buildThreeRegionAntiAliasedPanel(0);
      const trapOk = synthesizeAntiHaloUnderbleedFlats(trapField, seeds);
      expect(summarizeGapClosingFlatFillKo(leakyCmp, trapOk).verdict).toBe("attention");
      const blockedCmp = compareNaiveVsGapClosedFloodFill(openField, { seedX: -5, seedY: 20 });
      expect(summarizeGapClosingFlatFillKo(blockedCmp, trapOk).verdict).toBe("blocked");
    });
  });
});
