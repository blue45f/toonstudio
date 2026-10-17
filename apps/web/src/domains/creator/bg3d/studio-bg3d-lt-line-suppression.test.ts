import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_LT_OUTLINE_BAND_PX,
  STUDIO_BG3D_LT_OUTLINE_BAND_WEIGHTS,
  buildStudioBg3dLtOutlineProximity,
  studioBg3dLtInteriorLineFactor,
} from "./studio-bg3d-lt-line-suppression";

/** 문서에 적은 번짐 가중치: 거리 k 에서 256 × (1 - k / 4). */
const BAND_WEIGHT = [256, 192, 128, 64] as const;
const spread = (value: number, distance: number): number =>
  (value * BAND_WEIGHT[distance]! + 128) >> 8;

function evidenceAt(
  width: number,
  height: number,
  points: readonly (readonly [x: number, y: number, value: number])[]
): Uint8ClampedArray {
  const evidence = new Uint8ClampedArray(width * height);
  for (const [x, y, value] of points) evidence[y * width + x] = value;
  return evidence;
}

describe("buildStudioBg3dLtOutlineProximity", () => {
  it("uses a three pixel band", () => {
    expect(STUDIO_BG3D_LT_OUTLINE_BAND_PX).toBe(3);
  });

  it("spreads a single outline pixel with separable linear falloff and pins the values", () => {
    const size = 11;
    const proximity = buildStudioBg3dLtOutlineProximity(evidenceAt(size, size, [[5, 5, 255]]), size, size);
    const at = (x: number, y: number) => proximity[y * size + x]!;
    // 같은 행·열에서 거리 0..3 → 255, 191, 128, 64, 그 밖은 0
    expect([0, 1, 2, 3, 4].map((distance) => at(5 + distance, 5))).toEqual([255, 191, 128, 64, 0]);
    expect([0, 1, 2, 3, 4].map((distance) => at(5, 5 - distance))).toEqual([255, 191, 128, 64, 0]);
    expect(at(5 - 3, 5)).toBe(64);
    // 대각은 가로·세로 가중치의 곱이다.
    expect(at(6, 6)).toBe(spread(spread(255, 1), 1));
    expect(at(6, 6)).toBe(143);
    expect(at(7, 7)).toBe(spread(spread(255, 2), 2));
    expect(at(7, 7)).toBe(64);
    expect(at(8, 8)).toBe(spread(spread(255, 3), 3));
    expect(at(8, 8)).toBe(16);
    expect(at(9, 5)).toBe(0);
    expect(at(5, 9)).toBe(0);
  });

  it("scales with the evidence strength and merges neighbours by maximum", () => {
    const size = 13;
    const proximity = buildStudioBg3dLtOutlineProximity(
      evidenceAt(size, size, [
        [4, 6, 255],
        [8, 6, 100],
      ]),
      size,
      size
    );
    const at = (x: number) => proximity[6 * size + x]!;
    expect(at(4)).toBe(255);
    expect(at(8)).toBe(100);
    // 6 열은 왼쪽 윤곽(거리 2)과 오른쪽 약한 윤곽(거리 2) 중 큰 값을 쓴다.
    expect(at(6)).toBe(Math.max(spread(255, 2), spread(100, 2)));
    expect(at(6)).toBe(128);
    // 두 번의 번짐이 합산되지 않는다(합이면 128 + 50 = 178).
    expect(at(6)).toBeLessThan(178);
  });

  it("clips at the image border without wrapping", () => {
    const size = 8;
    const proximity = buildStudioBg3dLtOutlineProximity(evidenceAt(size, size, [[0, 0, 255]]), size, size);
    expect(proximity[0]).toBe(255);
    expect(proximity[3]).toBe(64);
    expect(proximity[4]).toBe(0);
    expect(proximity[size - 1]).toBe(0);
    expect(proximity[(size - 1) * size]).toBe(0);
  });

  it("returns zeros for an empty evidence map and never touches its input", () => {
    const evidence = new Uint8ClampedArray(30);
    const before = evidence.slice();
    const proximity = buildStudioBg3dLtOutlineProximity(evidence, 6, 5);
    expect(proximity.every((value) => value === 0)).toBe(true);
    expect(evidence).toEqual(before);
    expect(proximity).not.toBe(evidence);
  });

  it("rejects a length that does not match the dimensions", () => {
    expect(() => buildStudioBg3dLtOutlineProximity(new Uint8ClampedArray(10), 3, 4)).toThrow(RangeError);
  });
});

describe("studioBg3dLtInteriorLineFactor", () => {
  it("keeps outlines untouched and scales far interior lines by one minus the strength", () => {
    expect(studioBg3dLtInteriorLineFactor(255, 1)).toBe(1);
    expect(studioBg3dLtInteriorLineFactor(255, 0.6)).toBe(1);
    expect(studioBg3dLtInteriorLineFactor(0, 0.6)).toBeCloseTo(0.4, 12);
    expect(studioBg3dLtInteriorLineFactor(0, 1)).toBe(0);
    expect(studioBg3dLtInteriorLineFactor(0, 0)).toBe(1);
  });

  it("interpolates linearly with proximity", () => {
    expect(studioBg3dLtInteriorLineFactor(128, 1)).toBeCloseTo(128 / 255, 12);
    expect(studioBg3dLtInteriorLineFactor(64, 0.5)).toBeCloseTo(1 - 0.5 * (1 - 64 / 255), 12);
  });
});

describe("번짐 가중치 표", () => {
  it("equals 256 × (1 - k / (band + 1)) written as literals (no top-level calls in the module)", () => {
    // 모듈 최상위의 계산 호출은 번들러가 부수효과로 보아 선화를 쓰지 않는 번들(PNG 워커)에도 남긴다. 값은 여기서 식과 대조한다.
    const derived = Array.from(
      { length: STUDIO_BG3D_LT_OUTLINE_BAND_PX + 1 },
      (_, offset) => Math.round(256 * (1 - offset / (STUDIO_BG3D_LT_OUTLINE_BAND_PX + 1)))
    );
    expect([...STUDIO_BG3D_LT_OUTLINE_BAND_WEIGHTS]).toEqual(derived);
    expect([...STUDIO_BG3D_LT_OUTLINE_BAND_WEIGHTS]).toEqual([...BAND_WEIGHT]);
  });
});
