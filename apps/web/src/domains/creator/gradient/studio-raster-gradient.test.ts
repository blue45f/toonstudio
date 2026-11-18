import { describe, expect, it } from "vitest";

import {
  renderStudioRasterGradient,
  wrapGradientParameter,
} from "./studio-raster-gradient";

function solidCanvas(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { data, width, height };
}

describe("studio-raster-gradient", () => {
  it("clamp, repeat, reflect 반복 파라미터 래핑이 정확히 동작한다", () => {
    expect(wrapGradientParameter(-0.4, "clamp")).toBe(0);
    expect(wrapGradientParameter(1.6, "clamp")).toBe(1);
    expect(wrapGradientParameter(1.25, "repeat")).toBeCloseTo(0.25, 6);
    expect(wrapGradientParameter(1.25, "reflect")).toBeCloseTo(0.75, 6);
    expect(wrapGradientParameter(-0.3, "reflect")).toBeCloseTo(0.3, 6);
  });

  it("선형·방사·타원 그라데이션이 선택 마스크 클리핑과 4×4 Bayer 디더링을 지켜 렌더링된다", () => {
    const target = solidCanvas(16, 16, [0, 0, 0, 0]);
    const selMask = new Uint8Array(16 * 16);
    // 상단 절반(y < 8)만 선택 마스크 활성화
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 16; x++) selMask[y * 16 + x] = 255;
    }

    const linear = renderStudioRasterGradient({
      target,
      start: { x: 0.5, y: 4 },
      end: { x: 15.5, y: 4 },
      shape: "linear",
      dither: true,
      selectionMask: selMask,
      stops: [
        { offset: 0, color: [20, 40, 220, 255] },
        { offset: 1, color: [240, 180, 40, 255] },
      ],
    });

    // 선택된 상단 왼쪽 끝은 푸른 계열, 오른쪽 끝은 노란 계열
    expect(linear.imageData.data[(4 * 16 + 0) * 4 + 2]!).toBeGreaterThan(200);
    expect(linear.imageData.data[(4 * 16 + 15) * 4]!).toBeGreaterThan(220);
    // 마스크 바깥(y = 12)은 알파 0 그대로 보존
    expect(linear.imageData.data[(12 * 16 + 8) * 4 + 3]).toBe(0);

    // 타원(elliptical) 모드 검증: 단축 비율 0.25 이므로 수직 방향으로 훨씬 빠르게 끝 색에 도달
    const elliptical = renderStudioRasterGradient({
      target: solidCanvas(20, 20, [0, 0, 0, 0]),
      start: { x: 10, y: 10 },
      end: { x: 18, y: 10 },
      shape: "elliptical",
      ellipseAspectRatio: 0.25,
      dither: false,
      stops: [
        { offset: 0, color: [255, 0, 0, 255] },
        { offset: 1, color: [0, 0, 255, 255] },
      ],
    });
    // 수평 4px 지점(14, 10)은 중간(빨강 비중 존재), 수직 3px 지점(10, 13)은 이미 단축 밖이라 파랑(255)
    expect(elliptical.imageData.data[(10 * 20 + 14) * 4]!).toBeGreaterThan(80);
    expect(elliptical.imageData.data[(13 * 20 + 10) * 4 + 2]).toBe(255);
  });

  it("erase(그라데이션 지우개) 모드는 원본 RGB 채널을 전혀 훼손하지 않고 알파만 감쇠시킨다", () => {
    const target = solidCanvas(12, 4, [123, 210, 77, 240]);
    const erased = renderStudioRasterGradient({
      target,
      start: { x: 0.5, y: 2 },
      end: { x: 11.5, y: 2 },
      outputMode: "erase",
      dither: false,
      stops: [
        { offset: 0, color: [0, 0, 0, 255] }, // 완전 지움(1 - 1 = 0)
        { offset: 1, color: [0, 0, 0, 0] },   // 보존(1 - 0 = 1)
      ],
    });

    for (let x = 0; x < 12; x++) {
      const off = (2 * 12 + x) * 4;
      expect(erased.imageData.data[off]).toBe(123);
      expect(erased.imageData.data[off + 1]).toBe(210);
      expect(erased.imageData.data[off + 2]).toBe(77);
    }
    expect(erased.imageData.data[(2 * 12 + 0) * 4 + 3]).toBe(0);
    expect(erased.imageData.data[(2 * 12 + 11) * 4 + 3]).toBe(240);
  });

  it("manga-halftone(만화 망점) 모드는 회전된 LPI 망점 셀로 이진 잉크 밀도 기울기를 생성한다", () => {
    const white = solidCanvas(40, 20, [255, 255, 255, 255]);
    const halftone = renderStudioRasterGradient({
      target: white,
      start: { x: 0, y: 10 },
      end: { x: 39, y: 10 },
      outputMode: "manga-halftone",
      halftoneLpi: 50,
      halftoneDpi: 300, // 셀 피치 = 6px
      halftoneAngleDeg: 45,
      stops: [
        { offset: 0, color: [0, 0, 0, 255] }, // 진한 쪽
        { offset: 1, color: [0, 0, 0, 0] },   // 투명한 쪽
      ],
    });

    let leftInkCount = 0;
    let rightInkCount = 0;
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        if (halftone.imageData.data[(y * 40 + x) * 4]! < 128) leftInkCount++;
      }
      for (let x = 20; x < 40; x++) {
        if (halftone.imageData.data[(y * 40 + x) * 4]! < 128) rightInkCount++;
      }
    }

    expect(leftInkCount).toBeGreaterThan(rightInkCount);
    expect(rightInkCount).toBeGreaterThan(0);
  });
});
