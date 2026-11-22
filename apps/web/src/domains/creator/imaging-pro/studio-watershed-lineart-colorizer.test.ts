import { describe, expect, it } from "vitest";

import { bakeStudioColorizeMaskWithWatershed } from "../fill/studio-colorize-mask-host";
import { COLORIZE_MASK_DEFAULT_PARAMS, createColorizeMaskState } from "../studio-colorize-mask";

import {
  colorizeLineartWithWatershed,
  computeLineartGradientElevation,
  type WatershedColorHint,
  type WatershedImageDataLike,
} from "./studio-watershed-lineart-colorizer";

function createBlankLineart(width: number, height: number, bg: readonly [number, number, number, number] = [255, 255, 255, 255]): WatershedImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const off = i * 4;
    data[off] = bg[0];
    data[off + 1] = bg[1];
    data[off + 2] = bg[2];
    data[off + 3] = bg[3];
  }
  return { width, height, data };
}

function drawPixel(img: WatershedImageDataLike, x: number, y: number, gray: number, alpha = 255): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const off = (y * img.width + x) * 4;
  img.data[off] = gray;
  img.data[off + 1] = gray;
  img.data[off + 2] = gray;
  img.data[off + 3] = alpha;
}

function readRgba(img: WatershedImageDataLike, x: number, y: number): readonly [number, number, number, number] {
  const off = (y * img.width + x) * 4;
  return [img.data[off]!, img.data[off + 1]!, img.data[off + 2]!, img.data[off + 3]!];
}

function makeFourQuadrantLineart(size = 40, gapWidth = 0): WatershedImageDataLike {
  const img = createBlankLineart(size, size);
  const mid = Math.floor(size / 2);
  // 외곽 테두리 + 십자 분리선 (굵기 2px)
  for (let i = 0; i < size; i += 1) {
    drawPixel(img, i, 0, 0);
    drawPixel(img, i, size - 1, 0);
    drawPixel(img, 0, i, 0);
    drawPixel(img, size - 1, i, 0);
    // 세로 중심선 (gapWidth > 0이면 y=10..10+gapWidth-1에 미세 틈 생성)
    if (gapWidth === 0 || i < 10 || i >= 10 + gapWidth) {
      drawPixel(img, mid, i, 0);
      drawPixel(img, mid + 1, i, 0);
    }
    // 가로 중심선
    drawPixel(img, i, mid, 0);
    drawPixel(img, i, mid + 1, 0);
  }
  return img;
}

describe("studio-watershed-lineart-colorizer (G'MIC/Krita 식 Watershed 자동 플랫 채색)", () => {
  it("4분할 선화에서 각 영역당 단일 힌트 포인트만으로 100% 정확 분할·경계 침범 0을 달성한다", () => {
    const lineArt = makeFourQuadrantLineart(40);
    const snapshotBefore = new Uint8ClampedArray(lineArt.data);
    const hints: readonly WatershedColorHint[] = [
      { id: "q1", x: 10, y: 10, r: 230, g: 70, b: 60 },
      { id: "q2", x: 30, y: 10, r: 60, g: 130, b: 235 },
      { id: "q3", x: 10, y: 30, r: 70, g: 195, b: 110 },
      { id: "q4", x: 30, y: 30, r: 245, g: 205, b: 65 },
    ];

    const res = colorizeLineartWithWatershed(lineArt, hints, { antiAliasExpandPx: 0 });
    // 원본 선화 불변성 검증
    expect(Array.from(lineArt.data)).toEqual(Array.from(snapshotBefore));

    // 내부 종이 픽셀 전수 정확도 검증 (경계선 x=0,20,21,39 및 y=0,20,21,39 제외)
    let interiorTotal = 0;
    let interiorCorrect = 0;
    for (let y = 1; y < 39; y += 1) {
      if (y === 20 || y === 21) continue;
      for (let x = 1; x < 39; x += 1) {
        if (x === 20 || x === 21) continue;
        interiorTotal += 1;
        const expectedLabel = (y < 20 ? 0 : 2) + (x < 20 ? 0 : 1);
        if (res.labelMap[y * 40 + x] === expectedLabel) interiorCorrect += 1;
      }
    }
    expect(interiorCorrect / interiorTotal).toBe(1);
    expect(readRgba(res.imageData, 5, 5)).toEqual([230, 70, 60, 255]);
    expect(readRgba(res.imageData, 35, 5)).toEqual([60, 130, 235, 255]);
    expect(readRgba(res.imageData, 5, 35)).toEqual([70, 195, 110, 255]);
    expect(readRgba(res.imageData, 35, 35)).toEqual([245, 205, 65, 255]);
    expect(res.stats.expandedEdgePixelCount).toBe(0);
  });

  it("안티앨리어싱 팽창(antiAliasExpandPx)이 선화 하부 흰 테두리를 제거하면서 반대 영역 침범을 막는다", () => {
    // 굵기 4px 안티앨리어싱 선화(회색 경계 + 검정 심지)로 좌/우 분리
    const img = createBlankLineart(32, 24);
    for (let y = 0; y < 24; y += 1) {
      drawPixel(img, 14, y, 140); // 왼쪽 AA 경계
      drawPixel(img, 15, y, 10);  // 중앙 좌심
      drawPixel(img, 16, y, 10);  // 중앙 우심
      drawPixel(img, 17, y, 140); // 오른쪽 AA 경계
    }

    const hints: readonly WatershedColorHint[] = [
      { id: "left-red", x: 5, y: 12, r: 220, g: 40, b: 40 },
      { id: "right-blue", x: 26, y: 12, r: 40, g: 90, b: 220 },
    ];

    const noExpand = colorizeLineartWithWatershed(img, hints, { antiAliasExpandPx: 0 });
    const withExpand = colorizeLineartWithWatershed(img, hints, { antiAliasExpandPx: 1 });

    // 팽창 0이면 AA 경계(x=14, 17)가 투명하게 남고, 팽창 1이면 자기 쪽 색으로 정확히 채워진다.
    expect(readRgba(noExpand.imageData, 14, 12)[3]).toBe(0);
    expect(readRgba(noExpand.imageData, 17, 12)[3]).toBe(0);

    expect(readRgba(withExpand.imageData, 14, 12)).toEqual([220, 40, 40, 255]);
    expect(readRgba(withExpand.imageData, 17, 12)).toEqual([40, 90, 220, 255]);
    // 중앙 심지 안쪽까지 과잉 침범하지 않는다(expand=1)
    expect(readRgba(withExpand.imageData, 15, 12)[3]).toBe(0);
    expect(readRgba(withExpand.imageData, 16, 12)[3]).toBe(0);
    expect(withExpand.stats.expandedEdgePixelCount).toBeGreaterThan(0);
  });

  it("투명 배경 선화·투명 마커·Sobel 기울기 고도맵·미세 틈새 봉합(gapSealRadiusPx)을 정확히 처리한다", () => {
    // 1) 투명 배경 위 검은 선화(원형 폐곡선) + 외부 투명 마커
    const transparentLine = createBlankLineart(32, 32, [0, 0, 0, 0]);
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const d = Math.hypot(x - 16, y - 16);
        if (Math.abs(d - 9) <= 0.8) drawPixel(transparentLine, x, y, 0, 255);
      }
    }
    const elev = computeLineartGradientElevation(transparentLine);
    expect(elev.ridgePixelCount).toBeGreaterThan(30);
    // 1px 대칭 선화 심지(x=7)에서는 고도 능선이 최대이고, 바로 인접 경계(x=6, x=8)에서 Sobel 기울기가 급증한다.
    expect(elev.elevationMap[16 * 32 + 7]!).toBeGreaterThanOrEqual(512);
    expect(elev.gradientMap[16 * 32 + 6]!).toBeGreaterThan(20);
    expect(elev.gradientMap[16 * 32 + 8]!).toBeGreaterThan(20);

    const resCircle = colorizeLineartWithWatershed(transparentLine, [
      { id: "bg", x: 2, y: 2, r: 0, g: 0, b: 0, transparent: true },
      { id: "skin", x: 16, y: 16, r: 250, g: 215, b: 190 },
    ]);
    expect(readRgba(resCircle.imageData, 16, 16)).toEqual([250, 215, 190, 255]);
    expect(readRgba(resCircle.imageData, 2, 2)[3]).toBe(0);

    // 2) 2px 틈이 있는 4분할 선화에서 gapSealRadiusPx=2로 누수 없이 분리 채색
    const gapped = makeFourQuadrantLineart(40, 2);
    const sealedRes = colorizeLineartWithWatershed(
      gapped,
      [
        { id: "left", x: 8, y: 10, r: 240, g: 60, b: 60 },
        { id: "right", x: 32, y: 10, r: 50, g: 120, b: 240 },
        { id: "bot-l", x: 8, y: 32, r: 60, g: 200, b: 80 },
        { id: "bot-r", x: 32, y: 32, r: 240, g: 200, b: 50 },
      ],
      { gapSealRadiusPx: 2, antiAliasExpandPx: 0 },
    );
    // 틈 바로 양옆에서도 빨강·파랑이 서로 침범하지 않는다
    expect(readRgba(sealedRes.imageData, 17, 10)).toEqual([240, 60, 60, 255]);
    expect(readRgba(sealedRes.imageData, 24, 10)).toEqual([50, 120, 240, 255]);
  });

  it("기존 studio-colorize-mask-host의 bakeStudioColorizeMaskWithWatershed 진입점과 정상 연동된다", () => {
    const lineArt = makeFourQuadrantLineart(32);
    const state = createColorizeMaskState(
      [
        { id: "h1", colorHex: "#e05040", points: [{ x: 8, y: 8 }], radiusPx: 2 },
        { id: "h2", colorHex: "#3080e0", points: [{ x: 24, y: 8 }], radiusPx: 2 },
        { id: "h3", colorHex: "#40b060", points: [{ x: 8, y: 24 }], radiusPx: 2 },
        { id: "h4", colorHex: "#e0c030", points: [{ x: 24, y: 24 }], radiusPx: 2 },
      ],
      { ...COLORIZE_MASK_DEFAULT_PARAMS, gapCloseHintPx: 0 },
    );
    const baked = bakeStudioColorizeMaskWithWatershed({ lineArt, state });
    expect(baked.ok).toBe(true);
    if (!baked.ok) return;
    expect(baked.paintedRegionCount).toBe(4);
    expect(baked.paintedPixelCount).toBeGreaterThan(600);
    expect(readRgba(baked.imageData, 6, 6)).toEqual([0xe0, 0x50, 0x40, 255]);
    expect(readRgba(baked.imageData, 26, 26)).toEqual([0xe0, 0xc0, 0x30, 255]);
  });
});
