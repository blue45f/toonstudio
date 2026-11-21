import { describe, expect, it } from "vitest";

import {
  DEFAULT_ANALYTIC_PAPER_RECIPE,
  evaluateAnalyticPaperHeight,
  NANOPIXEL_MAX_OUTPUT_EDGE,
  planNanopixelTiles,
  upscaleImageNanopixel,
  upscaleTileNanopixel,
} from "./studio-nanopixel-fractal-upscaler";

function makeTestWashImage(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      // 왼쪽 절반은 진한 수채 블루, 오른쪽 절반은 밝은 피치 + 중앙 잉크 선화
      const isInkLine = Math.abs(x - Math.floor(width / 2)) <= 1;
      if (isInkLine) {
        data[idx] = 18;
        data[idx + 1] = 20;
        data[idx + 2] = 26;
        data[idx + 3] = 255;
      } else if (x < width / 2) {
        data[idx] = 60;
        data[idx + 1] = 110;
        data[idx + 2] = 195;
        data[idx + 3] = 255;
      } else {
        data[idx] = 232;
        data[idx + 1] = 185;
        data[idx + 2] = 148;
        data[idx + 3] = 255;
      }
    }
  }
  return data;
}

describe("studio-nanopixel-fractal-upscaler", () => {
  it("타일 분할 크기와 무관하게 100% 동일한 픽셀을 출력한다(이음새 0)", () => {
    const srcW = 16;
    const srcH = 12;
    const src = makeTestWashImage(srcW, srcH);

    const singleTile = upscaleImageNanopixel(src, srcW, srcH, {
      scale: 2,
      tileSize: 64,
      edgeSharpenStrength: 0.4,
      paperReliefStrength: 0.3,
      granulationStrength: 0.35,
    });
    const multiTile = upscaleImageNanopixel(src, srcW, srcH, {
      scale: 2,
      tileSize: 10,
      edgeSharpenStrength: 0.4,
      paperReliefStrength: 0.3,
      granulationStrength: 0.35,
    });

    expect(singleTile.tileCount).toBe(1);
    expect(multiTile.tileCount).toBeGreaterThan(4);
    expect(multiTile.width).toBe(32);
    expect(multiTile.height).toBe(24);
    expect(Array.from(multiTile.rgba)).toEqual(Array.from(singleTile.rgba));
  });

  it("4x 업스케일과 스트리밍 타일 콜백 및 8K 상한 검사를 수행한다", () => {
    const src = makeTestWashImage(8, 8);
    const seenIndices: number[] = [];

    const out = upscaleImageNanopixel(
      src,
      8,
      8,
      { scale: 4, tileSize: 16 },
      (tileOut, completed, total) => {
        seenIndices.push(tileOut.tile.tileIndex);
        expect(completed).toBeLessThanOrEqual(total);
      },
    );

    expect(out.width).toBe(32);
    expect(out.height).toBe(32);
    expect(seenIndices).toEqual([0, 1, 2, 3]);

    expect(() => planNanopixelTiles(3000, 3000, 4)).toThrow(
      new RegExp(String(NANOPIXEL_MAX_OUTPUT_EDGE)),
    );
  });

  it("해석적 종이 하이트맵이 결정적이고 [0, 1] 범위와 고주파 디테일을 보존한다", () => {
    const h1 = evaluateAnalyticPaperHeight(0.37, 0.61, DEFAULT_ANALYTIC_PAPER_RECIPE, 0);
    const h2 = evaluateAnalyticPaperHeight(0.37, 0.61, DEFAULT_ANALYTIC_PAPER_RECIPE, 0);
    const hFine = evaluateAnalyticPaperHeight(0.37, 0.61, DEFAULT_ANALYTIC_PAPER_RECIPE, 2);

    expect(h1).toBe(h2);
    expect(h1).toBeGreaterThanOrEqual(0);
    expect(h1).toBeLessThanOrEqual(1);
    expect(hFine).toBeGreaterThanOrEqual(0);
    expect(hFine).toBeLessThanOrEqual(1);
    // 저주파 구조가 유지되어 2옥타브 추가 시에도 극단적으로 이탈하지 않음
    expect(Math.abs(hFine - h1)).toBeLessThan(0.2);
  });

  it("투명 픽셀은 프랙탈 과립 합성으로 오염되지 않고 알파 0을 유지하며 취소 신호에 중단된다", () => {
    const transparent = new Uint8ClampedArray(6 * 6 * 4);
    const tiles = planNanopixelTiles(6, 6, 2, 16);
    const res = upscaleTileNanopixel(transparent, 6, 6, tiles[0]!, {
      scale: 2,
      paperReliefStrength: 0.8,
      granulationStrength: 0.9,
    });
    for (let i = 0; i < res.rgba.length; i += 4) {
      expect(res.rgba[i + 3]).toBe(0);
      expect(res.rgba[i]).toBe(0);
    }

    const abortController = new AbortController();
    abortController.abort();
    expect(() =>
      upscaleImageNanopixel(transparent, 6, 6, { scale: 2, signal: abortController.signal }),
    ).toThrow(/취소/);
  });
});
