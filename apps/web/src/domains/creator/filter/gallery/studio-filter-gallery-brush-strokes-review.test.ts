/**
 * 필터 갤러리 · 붓 터치 적대적 리뷰 결함 회귀 시험.
 *   - 잉크 윤곽선: 가우시안 차(DoG)의 두 흐림이 거의 같아(반지름 1 → 상자 1, 반지름 2.5 → 상자 1.44) 윤곽 항이
 *     작았고, 중간 대비 경계의 어두운 쪽에는 빗금만 남았다.
 *   - 가장자리 강조: 가장자리 폭을 대칭 반지름 floor((폭 − 1) / 2) 로 줄여 짝수 칸이 바로 아래 홀수 칸과 같은 결과를 냈다.
 */
import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_BRUSH_STROKES_EFFECTS } from "./studio-filter-gallery-brush-strokes";

import type { StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParams } from "./studio-filter-gallery-types";

function find(id: string): StudioFilterGalleryEffectDef {
  const effect = STUDIO_FILTER_GALLERY_BRUSH_STROKES_EFFECTS.find((candidate) => candidate.id === id);
  if (!effect) throw new Error(`효과 없음: ${id}`);
  return effect;
}

function image(width: number, height: number, pixel: (x: number, y: number) => readonly number[]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

function run(effect: StudioFilterGalleryEffectDef, source: StudioFilterGalleryImage, params: StudioFilterGalleryParams = {}): StudioFilterGalleryImage {
  const out = { width: source.width, height: source.height, data: source.data.slice() };
  effect.apply(out, params, { seed: 1234, scale: 1 });
  return out;
}

/** 열 x 의 모든 행 R 평균. 빗금은 행마다 흩어지므로 긴 열에서 평균하면 윤곽선만 남는다. */
function columnMean(target: StudioFilterGalleryImage, x: number): number {
  let sum = 0;
  for (let y = 0; y < target.height; y += 1) sum += target.data[(y * target.width + x) * 4];
  return sum / target.height;
}

/** 열 범위 [from, to) 의 RGBA 바이트. */
function columnBytes(target: StudioFilterGalleryImage, from: number, to: number): number[] {
  const bytes: number[] = [];
  for (let y = 0; y < target.height; y += 1) {
    for (let x = from; x < to; x += 1) bytes.push(...target.data.subarray((y * target.width + x) * 4, (y * target.width + x) * 4 + 4));
  }
  return bytes;
}

describe("필터 갤러리 · 붓 터치 리뷰 결함 회귀", () => {
  it("잉크 윤곽선은 중간 대비(190|245) 경계의 어두운 쪽에만 빗금보다 짙은 윤곽선을 긋는다", () => {
    const ink = find("brush-strokes.ink-outlines");
    const width = 64, height = 128;
    const step = run(ink, image(width, height, (x) => (x < 32 ? [190, 190, 190, 255] : [245, 245, 245, 255])));
    const darkFlat = run(ink, image(width, height, () => [190, 190, 190, 255]));
    const lightFlat = run(ink, image(width, height, () => [245, 245, 245, 255]));
    // 경계에서 먼 어두운 면과 밝은 쪽 전체는 같은 톤의 평평한 그림과 바이트까지 같다(빗금·밝힘만 있고 윤곽선은 없다).
    expect(columnBytes(step, 0, 20)).toEqual(columnBytes(darkFlat, 0, 20));
    expect(columnBytes(step, 32, width)).toEqual(columnBytes(lightFlat, 32, width));
    // 경계 바로 옆 어두운 쪽 열은 빗금만 있는 면보다 뚜렷이 어둡다(윤곽 항이 작던 판은 9 남짓 차이에 그쳤다).
    let flat = 0;
    for (let x = 4; x < 20; x += 1) flat += columnMean(step, x) / 16;
    let darkest = Number.POSITIVE_INFINITY;
    for (let x = 26; x < 32; x += 1) darkest = Math.min(darkest, columnMean(step, x));
    expect(darkest).toBeLessThan(flat - 25);
  });

  it("가장자리 강조는 가장자리 폭 한 칸마다 강조 띠가 가로·세로 모두 한 픽셀씩 넓어지고 이웃 칸 결과가 모두 다르다", () => {
    const accented = find("brush-strokes.accented-edges");
    // 세로 경계(가로 팽창)와 가로 경계(세로 팽창)를 함께 본다. 가운데 줄에서 원본보다 20 넘게 밝아진 픽셀 수가 띠 폭이다.
    const cases = [
      { source: image(48, 32, (x) => (x < 24 ? [40, 40, 40, 255] : [210, 210, 210, 255])), at: (k: number) => (16 * 48 + k) * 4, span: 48 },
      { source: image(32, 48, (_x, y) => (y < 24 ? [40, 40, 40, 255] : [210, 210, 210, 255])), at: (k: number) => (k * 32 + 16) * 4, span: 48 },
    ];
    for (const { source, at, span } of cases) {
      const bands: number[] = [], changed: number[] = [];
      let previous: Uint8ClampedArray | null = null;
      for (let edgeWidth = 1; edgeWidth <= 14; edgeWidth += 1) {
        const out = run(accented, source, { edgeWidth, edgeBrightness: 50 });
        let lit = 0;
        for (let k = 0; k < span; k += 1) if (out.data[at(k)] - source.data[at(k)] > 20) lit += 1;
        bands.push(lit);
        const before = previous;
        if (before) changed.push(out.data.reduce((count, value, offset) => count + (value === before[offset] ? 0 : 1), 0));
        previous = out.data;
      }
      expect(bands).toEqual(bands.map((_, index) => bands[0] + index));
      // 이웃한 두 칸(1→2, 2→3, …, 13→14)은 모두 결과 바이트가 다르다.
      expect(changed.filter((count) => count === 0)).toEqual([]);
    }
  });
});
