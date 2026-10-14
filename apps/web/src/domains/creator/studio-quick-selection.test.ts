import { describe, expect, it } from "vitest";

import {
  growQuickSelection,
  quickSelectionRegionFromRaster,
  quickSelectionToleranceFromSlider,
  QUICK_SELECTION_TOLERANCE_DEFAULT,
  type QuickSelectionRaster,
} from "./studio-quick-selection";

/** 좌/우 절반이 다른 색인 래스터 — 경계에서 성장이 멈추는지 검증하는 기본 픽스처. */
function twoToneRaster(w = 10, h = 6): QuickSelectionRaster {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const offset = (y * w + x) * 4;
      const left = x < w / 2;
      data[offset] = left ? 200 : 30;
      data[offset + 1] = left ? 40 : 200;
      data[offset + 2] = left ? 40 : 40;
      data[offset + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

describe("growQuickSelection", () => {
  it("grows from the seed disc up to the color boundary and stops there", () => {
    const raster = twoToneRaster();
    const result = growQuickSelection(raster, [{ x: 2, y: 3, radius: 1 }], { tolerance: 0.18 });
    // 왼쪽 절반(5열 × 6행)만 선택되어야 한다.
    expect(result.selectedCount).toBe(30);
    expect(result.bounds).toEqual({ x: 0, y: 0, width: 5, height: 6 });
  });

  it("always includes the seed disc itself even with zero tolerance", () => {
    // 모든 픽셀 색이 서로 먼 체커보드 — 이웃으로 자랄 수 없으니 디스크만 남아야 한다.
    const w = 3;
    const h = 3;
    const data = new Uint8ClampedArray(w * h * 4);
    const palette: [number, number, number][] = [
      [255, 0, 0], [0, 255, 0], [0, 0, 255],
      [255, 255, 0], [10, 10, 10], [0, 255, 255],
      [255, 0, 255], [120, 60, 200], [240, 240, 240],
    ];
    for (let index = 0; index < w * h; index += 1) {
      const [r, g, b] = palette[index]!;
      data[index * 4] = r;
      data[index * 4 + 1] = g;
      data[index * 4 + 2] = b;
      data[index * 4 + 3] = 255;
    }
    const result = growQuickSelection({ width: w, height: h, data }, [{ x: 1, y: 1, radius: 0 }], { tolerance: 0 });
    expect(result.selectedCount).toBe(1);
    expect(result.mask[1 * w + 1]).toBe(255);
  });

  it("with zero tolerance still fills a perfectly uniform region (wand semantics)", () => {
    const raster = twoToneRaster();
    const result = growQuickSelection(raster, [{ x: 7, y: 3, radius: 0 }], { tolerance: 0 });
    expect(result.selectedCount).toBe(30);
    expect(result.bounds).toEqual({ x: 5, y: 0, width: 5, height: 6 });
  });

  it("does not grow through fully transparent pixels", () => {
    const raster = twoToneRaster();
    const data = new Uint8ClampedArray(raster.data);
    // 시드와 같은 색이지만 알파 0인 픽셀은 성장 대상에서 제외된다.
    const offset = (3 * 10 + 4) * 4;
    data[offset + 3] = 0;
    const result = growQuickSelection({ ...raster, data }, [{ x: 2, y: 3, radius: 1 }], { tolerance: 0.18 });
    expect(result.mask[3 * 10 + 4]).toBe(0);
  });

  it("throws when the raster exceeds the pixel budget", () => {
    const raster = twoToneRaster();
    expect(() => growQuickSelection(raster, [{ x: 0, y: 0, radius: 0 }], { maxPixels: 10 })).toThrow(RangeError);
  });

  it("returns null bounds when nothing is seeded", () => {
    const raster = twoToneRaster();
    const result = growQuickSelection(raster, [], { tolerance: 0.18 });
    expect(result.selectedCount).toBe(0);
    expect(result.bounds).toBeNull();
  });
});

describe("quickSelectionRegionFromRaster", () => {
  it("traces the grown mask into a normalized polygon region", () => {
    const raster = twoToneRaster();
    const { region, selectedCount } = quickSelectionRegionFromRaster(
      raster,
      [{ x: 2, y: 3, radius: 1 }],
      { tolerance: 0.18 },
    );
    expect(selectedCount).toBe(30);
    expect(region.outer.length).toBeGreaterThanOrEqual(4);
    for (const point of region.outer) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(0.5);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    }
    expect(region.holes).toEqual([]);
  });

  it("returns an empty region when there are no seeds", () => {
    const raster = twoToneRaster();
    const { region } = quickSelectionRegionFromRaster(raster, [], { tolerance: 0.18 });
    expect(region.outer).toEqual([]);
  });
});

describe("quickSelectionToleranceFromSlider", () => {
  it("maps the default slider value to the normalized default tolerance", () => {
    expect(quickSelectionToleranceFromSlider(QUICK_SELECTION_TOLERANCE_DEFAULT)).toBeCloseTo(0.18);
  });

  it("clamps out-of-range slider values", () => {
    expect(quickSelectionToleranceFromSlider(-5)).toBe(0);
    expect(quickSelectionToleranceFromSlider(999)).toBeCloseTo(0.6);
  });
});
