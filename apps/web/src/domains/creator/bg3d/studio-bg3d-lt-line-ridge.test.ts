import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_LT_TAN_22_5_DEGREES,
  extractStudioBg3dLtRidgeField,
  relocateStudioBg3dLtOccludedRidges,
} from "./studio-bg3d-lt-line-ridge";

function opaque(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) rgba[index * 4 + 3] = 255;
  return rgba;
}

function field(
  width: number,
  height: number,
  sample: (x: number, y: number) => number
): Float32Array {
  return Float32Array.from({ length: width * height }, (_, index) =>
    sample(index % width, Math.floor(index / width))
  );
}

function ridgeColumns(ridge: Uint8Array, width: number, row: number): number[] {
  const columns: number[] = [];
  for (let x = 0; x < width; x += 1) if (ridge[row * width + x]) columns.push(x);
  return columns;
}

describe("extractStudioBg3dLtRidgeField", () => {
  it("thins a hard vertical step to exactly one pixel (ties go to the next pixel)", () => {
    const width = 12;
    const height = 7;
    for (const [dark, light] of [[0, 1], [1, 0]] as const) {
      const result = extractStudioBg3dLtRidgeField({
        width,
        height,
        field: field(width, height, (x) => (x < 6 ? dark : light)),
        rgba: opaque(width, height),
        floor: 0.05,
      });
      // 계단형 경계의 Sobel 크기는 5·6 열이 같다. 동점은 다음(오른쪽) 픽셀이 가져가 극성과 무관하게 6 열이다.
      for (let y = 0; y < height; y += 1) {
        expect(ridgeColumns(result.ridge, width, y)).toEqual([6]);
        expect(result.magnitude[y * width + 5]).toBe(result.magnitude[y * width + 6]);
        expect(result.magnitude[y * width + 6]).toBeCloseTo(1, 6);
      }
    }
  });

  it("thins a hard horizontal step to one row", () => {
    const width = 7;
    const height = 12;
    const result = extractStudioBg3dLtRidgeField({
      width,
      height,
      field: field(width, height, (_x, y) => (y < 6 ? 0 : 1)),
      rgba: opaque(width, height),
      floor: 0.05,
    });
    for (let x = 0; x < width; x += 1) {
      const rows: number[] = [];
      for (let y = 0; y < height; y += 1) if (result.ridge[y * width + x]) rows.push(y);
      expect(rows).toEqual([6]);
    }
  });

  it("keeps a blurred ramp's single strongest pixel instead of a wide band", () => {
    const width = 11;
    const height = 5;
    const ramp = [0, 0, 0, 0.1, 0.4, 0.8, 1, 1, 1, 1, 1];
    const result = extractStudioBg3dLtRidgeField({
      width,
      height,
      field: field(width, height, (x) => ramp[x]!),
      rgba: opaque(width, height),
      floor: 0.02,
    });
    // 기울기 크기는 4 열(0.7)·5 열(0.6) 중 4 열이 가장 크다.
    expect(ridgeColumns(result.ridge, width, 2)).toEqual([4]);
  });

  it("keeps a 45 degree step as a thin staircase of at most two pixels per row", () => {
    const size = 16;
    const result = extractStudioBg3dLtRidgeField({
      width: size,
      height: size,
      field: field(size, size, (x, y) => (x + y >= size ? 1 : 0)),
      rgba: opaque(size, size),
      floor: 0.05,
    });
    for (let y = 2; y < size - 2; y += 1) {
      const columns = ridgeColumns(result.ridge, size, y);
      // 대각 경계가 격자 대각선 사이에 정확히 놓이면 4-연결 계단(행당 2픽셀)이 된다. 3픽셀 이상이면 얇아지지 않은 것이다.
      expect(columns.length).toBeGreaterThanOrEqual(1);
      expect(columns.length).toBeLessThanOrEqual(2);
      for (const column of columns) expect(Math.abs(column + y - size)).toBeLessThanOrEqual(1);
    }
  });

  it("excludes pixels at or below the floor", () => {
    const width = 8;
    const height = 3;
    const faint = field(width, height, (x) => (x < 4 ? 0 : 0.05));
    const none = extractStudioBg3dLtRidgeField({
      width,
      height,
      field: faint,
      rgba: opaque(width, height),
      floor: 0.1,
    });
    const some = extractStudioBg3dLtRidgeField({
      width,
      height,
      field: faint,
      rgba: opaque(width, height),
      floor: 0,
    });
    expect(none.ridge.every((value) => value === 0)).toBe(true);
    expect(ridgeColumns(some.ridge, width, 1)).toEqual([4]);
  });

  it("never lets a transparent pixel take the ridge from the opaque pixel beside it", () => {
    const width = 10;
    const height = 5;
    const rgba = opaque(width, height);
    // 오른쪽 절반을 투명으로 만들고(알파 0), 휘도 경계도 같은 자리에 둔다.
    for (let y = 0; y < height; y += 1) {
      for (let x = 5; x < width; x += 1) rgba[(y * width + x) * 4 + 3] = 0;
    }
    const result = extractStudioBg3dLtRidgeField({
      width,
      height,
      field: field(width, height, (x) => (x < 5 ? 1 : 0)),
      rgba,
      floor: 0.05,
    });
    for (let y = 0; y < height; y += 1) {
      expect(result.magnitude[y * width + 5]).toBe(0);
      expect(ridgeColumns(result.ridge, width, y)).toEqual([4]);
    }
  });

  it("is deterministic, allocates fresh arrays, and does not touch its inputs", () => {
    const width = 9;
    const height = 6;
    const source = field(width, height, (x, y) => ((x * 7 + y * 3) % 5) / 5);
    const rgba = opaque(width, height);
    const sourceBefore = source.slice();
    const rgbaBefore = rgba.slice();
    const first = extractStudioBg3dLtRidgeField({ width, height, field: source, rgba, floor: 0.1 });
    const second = extractStudioBg3dLtRidgeField({ width, height, field: source, rgba, floor: 0.1 });
    expect(first.ridge).toEqual(second.ridge);
    expect(first.magnitude).toEqual(second.magnitude);
    expect(first.ridge).not.toBe(second.ridge);
    expect(source).toEqual(sourceBefore);
    expect(rgba).toEqual(rgbaBefore);
  });

  it("rejects mismatched lengths", () => {
    expect(() =>
      extractStudioBg3dLtRidgeField({
        width: 4,
        height: 4,
        field: new Float32Array(15),
        rgba: new Uint8ClampedArray(64),
        floor: 0,
      })
    ).toThrow(RangeError);
    expect(() =>
      extractStudioBg3dLtRidgeField({
        width: 4,
        height: 4,
        field: new Float32Array(16),
        rgba: new Uint8ClampedArray(60),
        floor: 0,
      })
    ).toThrow(RangeError);
  });
});

describe("relocateStudioBg3dLtOccludedRidges", () => {
  const width = 9;
  const height = 5;
  /** 열 0..4 는 가깝고(0.2) 5..8 은 멀다(0.8). 휘도 경계도 4/5 사이에 있다. */
  function occlusionScene() {
    const depth = field(width, height, (x) => (x < 5 ? 0.2 : 0.8));
    const luminance = field(width, height, (x) => (x < 5 ? 0 : 1));
    const ridgeField = extractStudioBg3dLtRidgeField({
      width,
      height,
      field: luminance,
      rgba: opaque(width, height),
      floor: 0.05,
    });
    const occluded = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y += 1) occluded[y * width + 5] = 255;
    const visibilityByByte = Float32Array.from({ length: 256 }, (_, byte) => 1 - byte / 255);
    return { depth, ridgeField, occluded, visibilityByByte };
  }

  it("starts with the far-side pixel (column 5) holding the ridge", () => {
    const { ridgeField } = occlusionScene();
    for (let y = 0; y < height; y += 1) expect(ridgeColumns(ridgeField.ridge, width, y)).toEqual([5]);
  });

  it("moves a fully hidden ridge to the nearer neighbor and leaves nothing behind", () => {
    const { depth, ridgeField, occluded, visibilityByByte } = occlusionScene();
    const before = ridgeField.magnitude.slice();
    relocateStudioBg3dLtOccludedRidges(ridgeField, { width, height, depth, occluded, visibilityByByte });
    for (let y = 0; y < height; y += 1) {
      // 같은 행의 왼쪽 이웃(축 방향)이 대각 이웃보다 먼저라 선이 한 칸 위·아래로 밀리지 않는다.
      expect(ridgeColumns(ridgeField.ridge, width, y)).toEqual([4]);
      expect(ridgeField.magnitude[y * width + 4]).toBeCloseTo(before[y * width + 5]!, 6);
      expect(ridgeField.magnitude[y * width + 5]).toBe(0);
    }
  });

  it("moves only the hidden share of a partially hidden ridge", () => {
    const { depth, ridgeField, occluded, visibilityByByte } = occlusionScene();
    occluded.fill(0);
    for (let y = 0; y < height; y += 1) occluded[y * width + 5] = 128;
    const before = ridgeField.magnitude[2 * width + 5]!;
    relocateStudioBg3dLtOccludedRidges(ridgeField, { width, height, depth, occluded, visibilityByByte });
    const visible = visibilityByByte[128]!;
    expect(ridgeField.magnitude[2 * width + 5]).toBeCloseTo(before * visible, 6);
    expect(ridgeField.magnitude[2 * width + 4]).toBeCloseTo(before * (1 - visible), 6);
    expect(ridgeField.ridge[2 * width + 4]).toBe(1);
    expect(ridgeField.ridge[2 * width + 5]).toBe(1);
  });

  it("keeps the stronger of an existing ridge and the moved share (no summing)", () => {
    const { depth, ridgeField, occluded, visibilityByByte } = occlusionScene();
    ridgeField.ridge[2 * width + 4] = 1;
    ridgeField.magnitude[2 * width + 4] = 3;
    relocateStudioBg3dLtOccludedRidges(ridgeField, { width, height, depth, occluded, visibilityByByte });
    expect(ridgeField.magnitude[2 * width + 4]).toBe(3);
  });

  it("does nothing without a nearer neighbor or when nothing is occluded", () => {
    const { depth, ridgeField, occluded, visibilityByByte } = occlusionScene();
    const flatDepth = new Float32Array(width * height).fill(0.5);
    const magnitudeBefore = ridgeField.magnitude.slice();
    const ridgeBefore = ridgeField.ridge.slice();
    relocateStudioBg3dLtOccludedRidges(ridgeField, {
      width,
      height,
      depth: flatDepth,
      occluded,
      visibilityByByte,
    });
    expect(ridgeField.magnitude).toEqual(magnitudeBefore);
    expect(ridgeField.ridge).toEqual(ridgeBefore);
    relocateStudioBg3dLtOccludedRidges(ridgeField, {
      width,
      height,
      depth,
      occluded: new Uint8ClampedArray(width * height),
      visibilityByByte,
    });
    expect(ridgeField.magnitude).toEqual(magnitudeBefore);
  });

  it("rejects mismatched lengths", () => {
    const { depth, ridgeField, occluded, visibilityByByte } = occlusionScene();
    expect(() =>
      relocateStudioBg3dLtOccludedRidges(ridgeField, {
        width,
        height,
        depth: depth.subarray(1),
        occluded,
        visibilityByByte,
      })
    ).toThrow(RangeError);
    expect(() =>
      relocateStudioBg3dLtOccludedRidges(ridgeField, {
        width,
        height,
        depth,
        occluded,
        visibilityByByte: new Float32Array(255),
      })
    ).toThrow(RangeError);
  });
});

describe("방향 구간 경계 상수", () => {
  it("is tan(22.5°) written as a literal (the module must not call Math.tan at top level)", () => {
    // 모듈 최상위 호출은 번들러가 부수효과로 보아 선화를 쓰지 않는 번들(PNG 워커)에도 남긴다. 값은 여기서 식과 대조한다.
    expect(STUDIO_BG3D_LT_TAN_22_5_DEGREES).toBe(Math.tan(Math.PI / 8));
  });
});
