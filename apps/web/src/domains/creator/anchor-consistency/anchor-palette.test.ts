import { describe, expect, it } from "vitest";

import { deltaE76, srgbToLab } from "./anchor-color-lab";
import { extractAnchorFeatures } from "./anchor-image-features";
import { ANCHOR_PALETTE, compareAnchorPalettes, extractAnchorPalette, type AnchorPaletteEntry } from "./anchor-palette";
import { toAnchorLabImage } from "./anchor-subject-mask";
import { figureRaster, FIGURE_STYLE_B, renderSynthetic, type Rgb } from "./anchor-synthetic-raster";

function stripes(colors: ReadonlyArray<{ readonly color: Rgb; readonly width: number }>, height = 40) {
  const total = colors.reduce((sum, item) => sum + item.width, 0);
  let x = 0;
  const shapes = colors.map((item) => {
    const shape = { kind: "rect" as const, x, y: 0, w: item.width, h: height, color: item.color };
    x += item.width;
    return shape;
  });
  return renderSynthetic({ width: total, height, background: [0, 0, 0], shapes });
}

function paletteOf(raster: Parameters<typeof toAnchorLabImage>[0]): readonly AnchorPaletteEntry[] {
  const image = toAnchorLabImage(raster);
  return extractAnchorPalette(image, new Uint8Array(image.alpha.length).fill(1));
}

describe("전체 주요색 팔레트", () => {
  it("한 가지 색 이미지는 점유율 1 인 색 하나다", () => {
    const palette = paletteOf(stripes([{ color: [200, 40, 50], width: 40 }]));
    expect(palette).toHaveLength(1);
    expect(palette[0]?.share).toBe(1);
    expect(palette[0]?.hex).toBe("#c82832");
  });

  it("두 색은 면적 비율대로 점유율을 갖고 큰 쪽이 먼저다", () => {
    const palette = paletteOf(stripes([{ color: [40, 70, 150], width: 28 }, { color: [200, 40, 50], width: 12 }]));
    expect(palette.map((entry) => entry.hex)).toEqual(["#284696", "#c82832"]);
    expect(palette[0]?.share).toBeCloseTo(0.7, 2);
    expect(palette[1]?.share).toBeCloseTo(0.3, 2);
    expect(palette.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1, 3);
  });

  it("거의 같은 색은 하나로 합친다", () => {
    const palette = paletteOf(stripes([{ color: [200, 40, 50], width: 20 }, { color: [203, 42, 52], width: 20 }]));
    expect(palette).toHaveLength(1);
  });

  it("색이 많아도 상한(5)을 넘지 않는다", () => {
    const colors: Rgb[] = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255], [20, 20, 20], [240, 240, 240]];
    const palette = paletteOf(stripes(colors.map((color) => ({ color, width: 10 }))));
    expect(palette.length).toBeLessThanOrEqual(ANCHOR_PALETTE.k);
    expect(palette.length).toBeGreaterThanOrEqual(3);
  });

  it("같은 입력은 항상 같은 팔레트를 만든다(난수 없음)", () => {
    const raster = figureRaster({ noise: { amount: 5, seed: 7 } });
    expect(paletteOf(raster)).toEqual(paletteOf(raster));
  });

  it("포함된 픽셀이 없으면 빈 팔레트다", () => {
    const image = toAnchorLabImage(figureRaster());
    expect(extractAnchorPalette(image, new Uint8Array(image.alpha.length))).toEqual([]);
  });

  it("피사체만 분리하면 배경 회색 대신 그림의 색이 팔레트를 채운다", () => {
    const hexes = extractAnchorFeatures(figureRaster()).palette.map((entry) => entry.hex);
    expect(hexes).toContain("#c82832");
    expect(hexes).toContain("#284696");
    // 피사체만 분리한 팔레트에는 배경 회색에 가까운 색이 없다.
    const background = srgbToLab(191, 191, 191);
    const nearBackground = extractAnchorFeatures(figureRaster()).palette.filter((entry) => deltaE76(entry.lab, background) < 6);
    expect(nearBackground).toEqual([]);
    // 이미지 전체로 뽑으면 가장 큰 색이 배경 회색(에 가까운 색)이다.
    const whole = paletteOf(figureRaster());
    expect(whole[0] ? deltaE76(whole[0].lab, background) : 99).toBeLessThan(6);
  });
});

describe("팔레트 비교", () => {
  // 배경 회색이 팔레트를 지배하지 않도록 피사체만 분리한 팔레트로 비교한다.
  const subjectPalette = (raster: Parameters<typeof extractAnchorFeatures>[0]) => extractAnchorFeatures(raster).palette;
  const a = subjectPalette(figureRaster());

  it("같은 팔레트는 거리 0, 유사도 1 이다", () => {
    const result = compareAnchorPalettes(a, a);
    expect(result.distance).toBe(0);
    expect(result.similarity).toBe(1);
    expect(result.missingInRight).toEqual([]);
    expect(result.missingInLeft).toEqual([]);
  });

  it("색 계열이 다른 팔레트는 유사도가 낮고, 어느 쪽에 없는 색인지 알려 준다", () => {
    const b = subjectPalette(figureRaster({ style: FIGURE_STYLE_B }));
    const result = compareAnchorPalettes(a, b);
    expect(result.similarity).toBeLessThan(0.3);
    expect(result.missingInRight.length).toBeGreaterThan(0);
    expect(result.missingInLeft.length).toBeGreaterThan(0);
    expect(result.missingInRight[0]?.deltaE).toBeGreaterThanOrEqual(ANCHOR_PALETTE.missingDeltaE);
    expect(result.missingInRight[0]?.share).toBeGreaterThanOrEqual(ANCHOR_PALETTE.missingMinShare);
    expect(result.missingInRight[0]?.nearestHex).toMatch(/^#[0-9a-f]{6}$/u);
  });

  it("비교는 양방향 평균이라 순서를 바꿔도 같은 거리다", () => {
    const b = subjectPalette(figureRaster({ style: FIGURE_STYLE_B }));
    expect(compareAnchorPalettes(a, b).distance).toBe(compareAnchorPalettes(b, a).distance);
  });

  it("한쪽이 비어 있으면 유사도 0 이다", () => {
    expect(compareAnchorPalettes(a, []).similarity).toBe(0);
    expect(compareAnchorPalettes([], a).similarity).toBe(0);
  });
});
