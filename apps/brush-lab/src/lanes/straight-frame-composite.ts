import { srgbToLinear } from "../engine/core/color";
import { compositeTile } from "../engine/raster/composite";
import { TILE_SIZE } from "../engine/raster/tile-binning";

import type { BlendMode } from "../engine/raster/composite";

/**
 * 외부 엔진이 돌려준 획 레이어(sRGB straight RGBA8, 투명 = 0)를 레인의 선형 premultiplied f32 문서에 합성한다.
 * 합성식은 Sumi의 `compositeTile`(normal·multiply·erase·max, 획 불투명도 곱)을 그대로 재사용한다 — 외부 엔진 레인과
 * Sumi 레인이 같은 합성 규약으로 비교되게 하기 위해서다. 16×16 타일 단위로 알파가 있는 타일만 변환·합성한다.
 *
 * 정밀도: 입력이 8비트라 선형 값도 8비트에서 유도된다(`readbackLinear`는 8비트 정밀 선형 값).
 */

const SRGB_TO_LINEAR_LUT: Float32Array = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) lut[i] = srgbToLinear(i / 255);
  return lut;
})();

/** 합성한 비어 있지 않은 타일 수를 돌려준다. */
export function compositeStraightFrame(
  doc: Float32Array,
  frame: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  opacity: number,
  mode: BlendMode,
): number {
  if (frame.length !== width * height * 4) {
    throw new RangeError(`compositeStraightFrame: 프레임 ${frame.length} B ≠ ${width}×${height}×4`);
  }
  if (doc.length < width * height * 4) {
    throw new RangeError(`compositeStraightFrame: 문서 버퍼가 작다(${doc.length} < ${width * height * 4})`);
  }
  const tilesX = Math.ceil(width / TILE_SIZE);
  const tilesY = Math.ceil(height / TILE_SIZE);
  const tile = new Float32Array(TILE_SIZE * TILE_SIZE * 4);
  let touched = 0;
  for (let ty = 0; ty < tilesY; ty += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      const x0 = tx * TILE_SIZE;
      const y0 = ty * TILE_SIZE;
      const lyEnd = Math.min(TILE_SIZE, height - y0);
      const lxEnd = Math.min(TILE_SIZE, width - x0);
      let any = false;
      tile.fill(0);
      for (let ly = 0; ly < lyEnd; ly += 1) {
        let src = ((y0 + ly) * width + x0) * 4;
        let dst = ly * TILE_SIZE * 4;
        for (let lx = 0; lx < lxEnd; lx += 1) {
          const a8 = frame[src + 3] ?? 0;
          if (a8 !== 0) {
            any = true;
            const a = a8 / 255;
            tile[dst] = Math.fround((SRGB_TO_LINEAR_LUT[frame[src] ?? 0] ?? 0) * a);
            tile[dst + 1] = Math.fround((SRGB_TO_LINEAR_LUT[frame[src + 1] ?? 0] ?? 0) * a);
            tile[dst + 2] = Math.fround((SRGB_TO_LINEAR_LUT[frame[src + 2] ?? 0] ?? 0) * a);
            tile[dst + 3] = Math.fround(a);
          }
          src += 4;
          dst += 4;
        }
      }
      if (!any) continue;
      compositeTile(doc, 0, tile, opacity, mode, width, height, tx, ty);
      touched += 1;
    }
  }
  return touched;
}
