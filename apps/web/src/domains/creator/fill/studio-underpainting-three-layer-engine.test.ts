import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHARACTER_PALETTES,
  UNDERPAINTING_DEFAULT_TILE_OVERLAP_PX,
  compositeUnderpaintingLayers,
  planVerticalOverlapTiles,
  propagateCharacterPalettesFromFirstCut,
  runThreeLayerUnderpainting,
  type UnderpaintingCharacterPalette,
  type UnderpaintingImageLike,
} from "./studio-underpainting-three-layer-engine";

function makeLineartBoxCanvas(
  width: number,
  height: number,
  boxes: readonly { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }[],
): UnderpaintingImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255); // 흰 종이 바탕
  const drawInk = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const off = (y * width + x) * 4;
    data[off] = 16;
    data[off + 1] = 16;
    data[off + 2] = 18;
    data[off + 3] = 255;
  };
  for (const box of boxes) {
    for (let x = box.x0; x <= box.x1; x += 1) {
      drawInk(x, box.y0);
      drawInk(x, box.y1);
    }
    for (let y = box.y0; y <= box.y1; y += 1) {
      drawInk(box.x0, y);
      drawInk(box.x1, y);
    }
  }
  return { width, height, data };
}

describe("studio-underpainting-three-layer-engine", () => {
  it("원본 선화를 Multiply 잠금으로 비파괴 보존하고 A~F 마킹을 기본색/음영/하이라이트 3층 클리핑으로 분리한다", () => {
    const lineart = makeLineartBoxCanvas(80, 60, [
      { x0: 6, y0: 8, x1: 34, y1: 50 },
      { x0: 44, y0: 8, x1: 72, y1: 50 },
    ]);
    const originalSnapshot = new Uint8ClampedArray(lineart.data);

    const result = runThreeLayerUnderpainting(lineart, {
      cutId: "cut-1",
      lineartLayerId: "ink-1",
      characterPalettes: {
        A: DEFAULT_CHARACTER_PALETTES.A,
        B: DEFAULT_CHARACTER_PALETTES.B,
      },
      markingStrokes: [
        { cutId: "cut-1", label: "A", normalizedXY: [0.25, 0.5] },
        { cutId: "cut-1", label: "B", normalizedXY: [0.72, 0.5] },
      ],
      outputMode: "base_shadow_highlight",
      shadingLevel: "cel_highlight",
      propagateFromFirstCut: true,
    });

    // 원본 선화 버퍼 비파괴 검증
    expect(lineart.data).toEqual(originalSnapshot);
    expect(result.tilePlan.usedTiling).toBe(false);

    // 4개 레이어 스택: 최상단 선화 Multiply 잠금 + 하이라이트(Screen, clipping) + 음영(Multiply, clipping) + 기본색(Normal)
    expect(result.layers.map((layer) => [layer.role, layer.blendMode, layer.locked, layer.clipping])).toEqual([
      ["lineart", "multiply", true, false],
      ["highlight", "screen", false, true],
      ["shadow", "multiply", false, true],
      ["base", "normal", false, false],
    ]);

    expect(result.paintedPixelCount).toBeGreaterThan(800);
    expect(result.shadowPixelCount).toBeGreaterThan(100);
    expect(result.highlightPixelCount).toBeGreaterThan(40);

    // 좌측 영역은 A 팔레트, 우측 영역은 B 팔레트로 색이 섞이지 않음
    const baseLayer = result.layers.find((layer) => layer.role === "base")!;
    const leftPixelOff = (30 * 80 + 20) * 4;
    const rightPixelOff = (30 * 80 + 58) * 4;
    expect([
      baseLayer.imageData.data[leftPixelOff],
      baseLayer.imageData.data[leftPixelOff + 1],
      baseLayer.imageData.data[leftPixelOff + 2],
    ]).toEqual([...DEFAULT_CHARACTER_PALETTES.A.baseRgb]);
    expect([
      baseLayer.imageData.data[rightPixelOff],
      baseLayer.imageData.data[rightPixelOff + 1],
      baseLayer.imageData.data[rightPixelOff + 2],
    ]).toEqual([...DEFAULT_CHARACTER_PALETTES.B.baseRgb]);

    // 3층 합성 결과에서 원본 먹선 픽셀이 어둡게 유지된다.
    const composited = compositeUnderpaintingLayers(80, 60, result.layers);
    const inkPixelOff = (8 * 80 + 20) * 4;
    expect(composited.data[inkPixelOff]).toBeLessThan(30);
  });

  it("첫 컷 팔레트 전파(propagateFromFirstCut)가 시트 없는 후속 컷에 A~F 색상을 그대로 계승한다", () => {
    const customC: UnderpaintingCharacterPalette = {
      label: "C",
      name: "민지 교복",
      baseRgb: [44, 88, 146],
      shadowRgb: [24, 48, 92],
      highlightRgb: [160, 200, 245],
    };

    const resolved = propagateCharacterPalettesFromFirstCut(
      { C: customC },
      {
        characterPalettes: {},
        markingStrokes: [{ cutId: "cut-2", label: "C", normalizedXY: [0.5, 0.5] }],
        propagateFromFirstCut: true,
      },
    );

    expect(resolved.C).toEqual(customC);
  });

  it("세로 비율 H/W > 2.0 장편 컷에 대해 256px 오버랩 페더링 타일링 계획을 생성하고 이음매 없이 3층 분리한다", () => {
    // 1) 표준 웹툰 폭 800 x 2400 (H/W = 3.0) 타일 계획 검증
    const plan = planVerticalOverlapTiles(800, 2_400);
    expect(plan.usedTiling).toBe(true);
    expect(plan.aspectRatio).toBe(3);
    expect(plan.overlapPx).toBe(UNDERPAINTING_DEFAULT_TILE_OVERLAP_PX);
    expect(plan.tiles.length).toBeGreaterThanOrEqual(2);
    expect(plan.tiles[0]?.bottomOverlapPx).toBe(256);
    expect(plan.tiles[1]?.topOverlapPx).toBe(256);
    expect(plan.tiles[0]!.yEnd - plan.tiles[1]!.yStart).toBe(256);

    // 2) 실제 픽셀 실행: 280 x 840 (H/W = 3.0 > 2.0, 실제 256px 오버랩)
    const tallLineart = makeLineartBoxCanvas(280, 840, [
      { x0: 20, y0: 20, x1: 260, y1: 820 },
    ]);
    const tallResult = runThreeLayerUnderpainting(tallLineart, {
      cutId: "tall-cut-1",
      lineartLayerId: "tall-ink",
      characterPalettes: { A: DEFAULT_CHARACTER_PALETTES.A },
      markingStrokes: [{ cutId: "tall-cut-1", label: "A", normalizedXY: [0.5, 0.2] }],
      outputMode: "base_shadow_highlight",
      shadingLevel: "cel_highlight",
      propagateFromFirstCut: true,
    });

    expect(tallResult.tilePlan.usedTiling).toBe(true);
    expect(tallResult.tilePlan.overlapPx).toBe(256);
    expect(tallResult.layers).toHaveLength(4);

    // 오버랩 구간 중앙(y = tile1.yStart + 128)과 직전/직후 행에서 기본색이 매끄럽게 연속된다.
    const base = tallResult.layers.find((layer) => layer.role === "base")!.imageData;
    const seamY = tallResult.tilePlan.tiles[1]!.yStart + 128;
    const sampleA = (seamY * 280 + 140) * 4;
    const sampleB = ((seamY + 1) * 280 + 140) * 4;
    expect(base.data[sampleA + 3]).toBe(255);
    expect(base.data[sampleB + 3]).toBe(255);
    expect(Math.abs(base.data[sampleA]! - base.data[sampleB]!)).toBeLessThanOrEqual(1);
    expect(base.data[sampleA]).toBe(DEFAULT_CHARACTER_PALETTES.A.baseRgb[0]);
  });
});
