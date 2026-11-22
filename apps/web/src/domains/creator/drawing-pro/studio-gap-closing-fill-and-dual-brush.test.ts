import { describe, expect, it } from "vitest";

import {
  DUAL_BRUSH_TIP_COMPOSITE_MODES,
  blendDualBrushTipCoverage,
  compositeDualBrushTipMasks,
  extractLineartInkStrength,
  generateProceduralGrainTipMask,
  generateRadialBrushTipMask,
  morphologicalCloseBinaryMask,
  runGapClosingFloodFill,
  type BrushTipMaskBuffer,
} from "./studio-gap-closing-fill-and-dual-brush";
import { computeStudioMorphologicalCloseAndFill } from "../studio-smart-gap-fill";
import { compositeStudioDualBrushTipMasks } from "../drawing/studio-dual-brush";

function createCanvasRgba(
  width: number,
  height: number,
  bg: readonly [number, number, number, number],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    buf[i * 4] = bg[0];
    buf[i * 4 + 1] = bg[1];
    buf[i * 4 + 2] = bg[2];
    buf[i * 4 + 3] = bg[3];
  }
  return buf;
}

function setPixel(
  buf: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): void {
  const off = (y * width + x) * 4;
  buf[off] = rgba[0];
  buf[off + 1] = rgba[1];
  buf[off + 2] = rgba[2];
  buf[off + 3] = rgba[3];
}

function drawBoxWithRightGap(
  width: number,
  height: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  gapYStart: number,
  gapYEnd: number,
  bg: readonly [number, number, number, number] = [255, 255, 255, 255],
  ink: readonly [number, number, number, number] = [0, 0, 0, 255],
): Uint8ClampedArray {
  const buf = createCanvasRgba(width, height, bg);
  for (let x = left; x <= right; x += 1) {
    setPixel(buf, width, x, top, ink);
    setPixel(buf, width, x, bottom, ink);
  }
  for (let y = top; y <= bottom; y += 1) {
    setPixel(buf, width, left, y, ink);
    if (y < gapYStart || y > gapYEnd) {
      setPixel(buf, width, right, y, ink);
    }
  }
  return buf;
}

describe("studio-gap-closing-fill-and-dual-brush", () => {
  describe("형태학적 틈새 닫기 채우기(Close & Fill) + 1~2px 안티앨리어싱 팽창 채우기", () => {
    it("열린 6px 선화 틈새를 gapRadius=4 형태학적 닫힘으로 누수 0으로 봉합하고 내부 코너를 100% 보존한다", () => {
      const w = 64;
      const h = 64;
      // [12..44]×[12..44] 박스, 오른쪽 벽 y=25..30 (6px 열린 틈)
      const rgba = drawBoxWithRightGap(w, h, 12, 12, 44, 44, 25, 30);

      // 틈새 닫기 비활성 시 외부로 누수 확인
      const leaked = runGapClosingFloodFill(rgba, w, h, 28, 28, [230, 60, 40, 255], {
        gapRadiusPx: 0,
        aaExpandPx: 0,
      });
      expect(leaked.fillMask[0]).toBe(255);

      // gapRadius=4 적용 시 외부 누수 0, 틈새 봉합 성공
      const sealed = runGapClosingFloodFill(rgba, w, h, 28, 28, [230, 60, 40, 255], {
        gapRadiusPx: 4,
        aaExpandPx: 1,
      });
      expect(sealed.appliedGapRadiusPx).toBe(4);
      expect(sealed.sealedGapPixelCount).toBeGreaterThanOrEqual(6);

      // 박스 외부 픽셀 누수 전수 검사 (0이어야 함)
      let leakedOutsideCount = 0;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (x < 12 || x > 44 || y < 12 || y > 44) {
            if (sealed.fillMask[y * w + x]! > 0) leakedOutsideCount += 1;
          }
        }
      }
      expect(leakedOutsideCount).toBe(0);

      // 내부 4개 90° 모서리 픽셀이 깎이지 않고 100% 채워져야 한다.
      expect(sealed.fillMask[13 * w + 13]).toBe(255);
      expect(sealed.fillMask[13 * w + 43]).toBe(255);
      expect(sealed.fillMask[43 * w + 13]).toBe(255);
      expect(sealed.fillMask[43 * w + 43]).toBe(255);
    });

    it("gapRadius 1..12px 상한·하한을 준수하며 큰 12px 틈새도 gapRadius=8로 누수 없이 봉합한다", () => {
      const w = 80;
      const h = 80;
      // 오른쪽 벽 y=34..45 (12px 큰 틈)
      const rgba = drawBoxWithRightGap(w, h, 10, 10, 66, 66, 34, 45);

      const smallRadius = runGapClosingFloodFill(rgba, w, h, 38, 38, [40, 120, 240, 255], {
        gapRadiusPx: 2,
        aaExpandPx: 0,
      });
      expect(smallRadius.fillMask[0]).toBe(255); // 반경이 작으면 열림 유지

      const largeRadius = runGapClosingFloodFill(rgba, w, h, 38, 38, [40, 120, 240, 255], {
        gapRadiusPx: 8,
        aaExpandPx: 1,
      });
      expect(largeRadius.fillMask[0]).toBe(0);
      expect(largeRadius.fillMask[38 * w + 75]).toBe(0);
      expect(largeRadius.coreFilledPixelCount).toBeGreaterThan(2500);

      // 12px 초과 입력은 12px로 클램프
      const clamped = runGapClosingFloodFill(rgba, w, h, 38, 38, [40, 120, 240, 255], {
        gapRadiusPx: 30,
        aaExpandPx: 5,
      });
      expect(clamped.appliedGapRadiusPx).toBe(12);
      expect(clamped.appliedAaExpandPx).toBe(2);
    });

    it("45° 대각선 다이아몬드의 열린 대각선 틈새를 형태학적 대각선 닫힘으로 누수 0 봉합한다", () => {
      const w = 64;
      const h = 64;
      const cx = 32;
      const cy = 32;
      const rad = 18;
      const rgba = createCanvasRgba(w, h, [0, 0, 0, 0]);

      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const manhattan = Math.abs(x - cx) + Math.abs(y - cy);
          if (manhattan === rad) {
            // 우상단 45° 변에 4px 대각선 틈새 생성
            const isGap = x > cx + 6 && x < cx + 11 && y < cy;
            if (!isGap) setPixel(rgba, w, x, y, [0, 0, 0, 255]);
          }
        }
      }

      const res = runGapClosingFloodFill(rgba, w, h, cx, cy, [50, 200, 120, 255], {
        gapRadiusPx: 4,
        aaExpandPx: 1,
        enableDiagonalClosing: true,
      });
      expect(res.fillMask[0]).toBe(0);
      expect(res.fillMask[cy * w + cx]).toBe(255);
      expect(res.sealedGapPixelCount).toBeGreaterThan(0);
    });

    it("1~2px 안티앨리어싱 팽창 채우기로 백지 선화·투명 선화 모두 흰 테두리(white halo)를 0으로 제거한다", () => {
      const w = 48;
      const h = 48;
      // 백지 위 검정 박스 + 내부 1px 회색 안티앨리어싱 경계(rgb=185)
      const paperRgba = drawBoxWithRightGap(w, h, 8, 8, 39, 39, 99, 99);
      for (let x = 9; x <= 38; x += 1) {
        setPixel(paperRgba, w, x, 9, [185, 185, 185, 255]);
        setPixel(paperRgba, w, x, 38, [185, 185, 185, 255]);
      }
      for (let y = 9; y <= 38; y += 1) {
        setPixel(paperRgba, w, 9, y, [185, 185, 185, 255]);
        setPixel(paperRgba, w, 38, y, [185, 185, 185, 255]);
      }

      const filled = runGapClosingFloodFill(paperRgba, w, h, 24, 24, [240, 40, 40, 255], {
        gapRadiusPx: 2,
        colorTolerance: 16,
        aaExpandPx: 2,
      });
      expect(filled.aaExpandedPixelCount).toBeGreaterThan(0);

      // 회색 AA 경계 픽셀 (9, 20)이 흰/회색 테두리로 남지 않고 붉은 톤(R >> G, B)으로 자연스럽게 물들어야 한다.
      const aaOff = (20 * w + 9) * 4;
      expect(filled.compositedRgba[aaOff]!).toBeGreaterThan(160);
      expect(filled.compositedRgba[aaOff + 1]!).toBeLessThan(40);
      expect(filled.compositedRgba[aaOff + 2]!).toBeLessThan(40);

      // 검정 실선 코어 (8, 20)은 검정 유지, 외부 (7, 20)은 흰색 그대로(번짐 0)
      const lineOff = (20 * w + 8) * 4;
      expect(filled.compositedRgba[lineOff]).toBe(0);
      const outOff = (20 * w + 7) * 4;
      expect(filled.compositedRgba[outOff]).toBe(255);
      expect(filled.compositedRgba[outOff + 1]).toBe(255);
      expect(filled.fillMask[20 * w + 7]).toBe(0);

      // 투명 선화 레이어에서 반투명 AA 픽셀(0,0,0,128) 아래로 채우기(dst-over) 검증
      const transRgba = drawBoxWithRightGap(
        w,
        h,
        8,
        8,
        39,
        39,
        99,
        99,
        [0, 0, 0, 0],
        [0, 0, 0, 255],
      );
      setPixel(transRgba, w, 9, 20, [0, 0, 0, 128]);
      const transFilled = computeStudioMorphologicalCloseAndFill(
        transRgba,
        w,
        h,
        24,
        24,
        [255, 0, 0, 255],
        { gapRadiusPx: 2, aaExpandPx: 1 },
      );
      expect(transFilled.compositedRgba[aaOff + 3]).toBe(255);
      expect(transFilled.compositedRgba[aaOff]!).toBeGreaterThan(110);
      expect(transFilled.compositedRgba[aaOff]!).toBeLessThan(145);
      expect(extractLineartInkStrength(transRgba, w, h)[20 * w + 8]).toBeCloseTo(1, 5);
    });

    it("형태학적 닫힘 헬퍼가 수평 4px 틈을 1px 두께 유지하며 정확히 닫는다", () => {
      const w = 24;
      const h = 15;
      const mask = new Uint8Array(w * h);
      for (let x = 2; x <= 9; x += 1) mask[7 * w + x] = 1;
      for (let x = 14; x <= 21; x += 1) mask[7 * w + x] = 1;

      const closed = morphologicalCloseBinaryMask(mask, w, h, 3, false);
      for (let x = 2; x <= 21; x += 1) {
        expect(closed[7 * w + x]).toBe(1);
      }
      // 선 위아래로 불필요하게 두꺼워지지 않아야 한다.
      expect(closed[6 * w + 11]).toBe(0);
      expect(closed[8 * w + 11]).toBe(0);
    });
  });

  describe("듀얼 브러시 팁 마스크 합성 (multiply / subtract / darken / overlay)", () => {
    it("4종 합성 모드의 수학적 공식과 primary===0 실루엣 보존 불변식을 정확히 만족한다", () => {
      expect(DUAL_BRUSH_TIP_COMPOSITE_MODES).toEqual([
        "multiply",
        "subtract",
        "darken",
        "overlay",
      ]);

      // multiply: a * b
      expect(blendDualBrushTipCoverage(0.8, 0.5, "multiply")).toBeCloseTo(0.4, 6);
      // subtract: max(0, a - b)
      expect(blendDualBrushTipCoverage(0.8, 0.5, "subtract")).toBeCloseTo(0.3, 6);
      expect(blendDualBrushTipCoverage(0.3, 0.7, "subtract")).toBeCloseTo(0, 6);
      // darken: min(a, b)
      expect(blendDualBrushTipCoverage(0.8, 0.5, "darken")).toBeCloseTo(0.5, 6);
      expect(blendDualBrushTipCoverage(0.3, 0.7, "darken")).toBeCloseTo(0.3, 6);
      // overlay: a < 0.5 ? 2ab : 1 - 2(1-a)(1-b)
      expect(blendDualBrushTipCoverage(0.25, 0.6, "overlay")).toBeCloseTo(0.3, 6);
      expect(blendDualBrushTipCoverage(0.75, 0.6, "overlay")).toBeCloseTo(0.8, 6);

      // strength=0이면 주 팁 그대로
      for (const mode of DUAL_BRUSH_TIP_COMPOSITE_MODES) {
        expect(blendDualBrushTipCoverage(0.7, 0.2, mode, 0)).toBeCloseTo(0.7, 6);
        // primary=0이면 어떤 보조 팁과 모드에서도 바깥 번짐 0
        expect(blendDualBrushTipCoverage(0, 1, mode, 1)).toBe(0);
      }
    });

    it("주/보조 브러시 팁 마스크 합성 및 스케일·회전·타일링·반전·진입점 연결이 결정적으로 동작한다", () => {
      const primary = generateRadialBrushTipMask(32, 0.6);
      const secondary = generateProceduralGrainTipMask(32, 42, 0.45);

      const mul = compositeDualBrushTipMasks(primary, secondary, { mode: "multiply", strength01: 1 });
      const sub = compositeDualBrushTipMasks(primary, secondary, { mode: "subtract", strength01: 1 });
      const drk = compositeDualBrushTipMasks(primary, secondary, { mode: "darken", strength01: 1 });
      const ovl = compositeDualBrushTipMasks(primary, secondary, { mode: "overlay", strength01: 1 });

      // 바깥 모서리(0,0)는 원형 주 팁이 0이므로 모든 모드에서 0 유지
      expect(mul.coverage[0]).toBe(0);
      expect(sub.coverage[0]).toBe(0);
      expect(drk.coverage[0]).toBe(0);
      expect(ovl.coverage[0]).toBe(0);

      // multiply <= darken <= primary 및 subtract <= primary 불변식 검증
      for (let i = 0; i < mul.coverage.length; i += 1) {
        const pCov = primary.data[i]!;
        expect(mul.coverage[i]!).toBeLessThanOrEqual(drk.coverage[i]! + 1e-5);
        expect(drk.coverage[i]!).toBeLessThanOrEqual(pCov + 1e-5);
        expect(sub.coverage[i]!).toBeLessThanOrEqual(pCov + 1e-5);
      }
      // overlay는 고밀도 중심부에서 multiply보다 더 높은 평균 커버리지를 낸다.
      expect(ovl.meanCoverage).toBeGreaterThan(mul.meanCoverage);

      // Uint8Array 버퍼와 변환 옵션 + studio-dual-brush 진입점 연결 검증
      const u8Secondary: BrushTipMaskBuffer = {
        width: 16,
        height: 16,
        data: new Uint8Array(256).fill(128),
      };
      const viaEntry = compositeStudioDualBrushTipMasks(primary, u8Secondary, "multiply", {
        secondaryScale: 0.75,
        secondaryRotationRad: Math.PI / 6,
        tileSecondary: true,
        invertSecondary: false,
      });
      const centerIdx = 16 * 32 + 16;
      expect(viaEntry.coverage[centerIdx]!).toBeCloseTo(128 / 255, 2);
      expect(viaEntry.activePixelCount).toBeGreaterThan(0);
    });
  });
});
