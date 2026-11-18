import { describe, expect, it } from "vitest";

import {
  applyAdjustLineWidth,
  applyBrightnessToAlpha,
  applyChangeLineColor,
  isTopologicalCorePixel,
} from "./studio-line-art-cleanup";

import type { StudioImageDataLike } from "../studio-filters";

function createCanvas(width: number, height: number): StudioImageDataLike {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function setPx(
  img: StudioImageDataLike,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): void {
  const off = (y * img.width + x) * 4;
  img.data[off] = rgba[0];
  img.data[off + 1] = rgba[1];
  img.data[off + 2] = rgba[2];
  img.data[off + 3] = rgba[3];
}

function countOpaque(img: StudioImageDataLike): number {
  let count = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i]! > 0) count += 1;
  }
  return count;
}

describe("studio-line-art-cleanup", () => {
  it("applyBrightnessToAlpha는 흰 종이를 투명하게 지우고 먹 농도를 알파로 전환하며 inkColor를 입힌다", () => {
    const img = createCanvas(3, 1);
    setPx(img, 0, 0, [255, 255, 255, 255]); // 흰 종이 -> alpha 0
    setPx(img, 1, 0, [0, 0, 0, 255]); // 순검정 선 -> alpha 255
    setPx(img, 2, 0, [128, 128, 128, 200]); // 회색 연필 -> 반투명

    const out = applyBrightnessToAlpha(img, { inkColor: "#1d4ed8" });
    expect(out.data[3]).toBe(0);
    expect([...out.data.slice(4, 8)]).toEqual([29, 78, 216, 255]);
    expect(out.data[11]).toBe(Math.round(200 * (1 - 128 / 255)));
    expect([...out.data.slice(8, 11)]).toEqual([29, 78, 216]);
  });

  it("applyChangeLineColor는 알파를 그대로 두고 선택 마스크 안쪽 RGB만 교체한다", () => {
    const img = createCanvas(2, 1);
    setPx(img, 0, 0, [20, 20, 20, 137]);
    setPx(img, 1, 0, [20, 20, 20, 219]);
    const mask = new Uint8Array([255, 0]);

    const out = applyChangeLineColor(img, {
      targetColor: "#dc2626",
      selectionMask: mask,
    });

    expect([...out.data.slice(0, 4)]).toEqual([220, 38, 38, 137]);
    expect([...out.data.slice(4, 8)]).toEqual([20, 20, 20, 219]);
  });

  it("applyAdjustLineWidth(thicken)는 가장 가까운 불투명 선 픽셀의 RGB를 전파하며 선을 넓힌다", () => {
    const img = createCanvas(9, 9);
    setPx(img, 4, 4, [210, 45, 90, 255]);

    const thickened = applyAdjustLineWidth(img, {
      mode: "thicken",
      scalePx: 2,
    });

    expect(countOpaque(thickened)).toBeGreaterThan(9);
    // 거리 2인 (6, 4)까지 원본 색 (210, 45, 90)이 전파되어야 한다.
    const neighborOff = (4 * 9 + 6) * 4;
    expect([...thickened.data.slice(neighborOff, neighborOff + 4)]).toEqual([210, 45, 90, 255]);
  });

  it("applyAdjustLineWidth(narrow)는 atLeastOnePixel 활성 시 scalePx=16에서도 1px 선을 끊지 않고 보존한다", () => {
    const img = createCanvas(15, 9);
    // 두께 3px 가로 잉크 선 (x = 2..12, y = 3..5)
    for (let y = 3; y <= 5; y += 1) {
      for (let x = 2; x <= 12; x += 1) {
        setPx(img, x, y, [15, 15, 20, 255]);
      }
    }

    // 1) atLeastOnePixel = false 면 큰 축소 폭에서 선이 완전히 사라진다.
    const erased = applyAdjustLineWidth(img, {
      mode: "narrow",
      scalePx: 6,
      atLeastOnePixel: false,
    });
    expect(countOpaque(erased)).toBe(0);

    // 2) atLeastOnePixel = true 면 scalePx = 16에서도 끊김 없는 1px 중심선이 살아남는다.
    const preserved = applyAdjustLineWidth(img, {
      mode: "narrow",
      scalePx: 16,
      atLeastOnePixel: true,
    });
    const remaining = countOpaque(preserved);
    expect(remaining).toBeGreaterThanOrEqual(9);
    expect(remaining).toBeLessThan(33);

    // 살아남은 중심선 픽셀들은 실제로 위상 핵심(isTopologicalCorePixel)이어야 한다.
    const liveMask = new Uint8Array(15 * 9);
    for (let i = 0; i < 15 * 9; i += 1) {
      liveMask[i] = preserved.data[i * 4 + 3]! > 0 ? 1 : 0;
    }
    for (let x = 3; x <= 11; x += 1) {
      let hasColumnInk = false;
      for (let y = 3; y <= 5; y += 1) {
        if (liveMask[y * 15 + x] === 1) {
          hasColumnInk = true;
          expect(isTopologicalCorePixel(liveMask, 15, 9, x, y)).toBe(true);
        }
      }
      expect(hasColumnInk).toBe(true);
    }
  });
});
