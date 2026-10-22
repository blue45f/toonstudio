import { describe, expect, it } from "vitest";

import { ANCHOR_COLOR_BINS, ANCHOR_COLOR_WEIGHTS, compareAnchorColorStats, computeAnchorColorStats, hellingerDistance } from "./anchor-color-stats";
import { extractAnchorFeatures } from "./anchor-image-features";
import { toAnchorLabImage } from "./anchor-subject-mask";
import { figureRaster, FIGURE_STYLE_B, renderSynthetic } from "./anchor-synthetic-raster";

function statsOf(raster: Parameters<typeof toAnchorLabImage>[0]) {
  const image = toAnchorLabImage(raster);
  return computeAnchorColorStats(image, new Uint8Array(image.alpha.length).fill(1));
}

function statsOfAll(raster: Parameters<typeof toAnchorLabImage>[0]) {
  const stats = statsOf(raster);
  if (!stats) throw new Error("통계를 만들 수 없어요");
  return stats;
}

describe("색 분포 통계", () => {
  it("히스토그램은 합이 1 이고 길이가 규약과 같다", () => {
    const stats = statsOf(figureRaster());
    expect(stats?.lHist).toHaveLength(ANCHOR_COLOR_BINS.lightnessBins);
    expect(stats?.abHist).toHaveLength(ANCHOR_COLOR_BINS.chromaBins ** 2);
    expect(stats?.lHist.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 3);
    expect(stats?.abHist.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 3);
  });

  it("단색 이미지는 평균이 그 색이고 L* 표준편차가 0 이다", () => {
    const stats = statsOf(renderSynthetic({ width: 32, height: 32, background: [128, 128, 128], shapes: [] }));
    expect(stats?.meanL).toBeCloseTo(53.59, 1);
    expect(stats?.stdL).toBe(0);
    expect(stats?.meanChroma).toBeLessThan(0.01);
  });

  it("포함된 픽셀이 없으면 null 이다", () => {
    const image = toAnchorLabImage(figureRaster());
    expect(computeAnchorColorStats(image, new Uint8Array(image.alpha.length))).toBeNull();
  });

  it("같은 분포는 유사도 1, 색 계열이 다르면 낮다", () => {
    // 배경 회색이 분포를 지배하지 않도록 분리된 피사체의 통계로 비교한다.
    const base = extractAnchorFeatures(figureRaster()).color;
    const other = extractAnchorFeatures(figureRaster({ style: FIGURE_STYLE_B })).color;
    expect(compareAnchorColorStats(base, base).similarity).toBe(1);
    expect(compareAnchorColorStats(base, other).similarity).toBeLessThan(0.3);
    // 배경까지 섞인 전체 통계는 배경 회색이 서로 같아 훨씬 비슷해 보인다 — 피사체 분리가 필요한 이유다.
    expect(compareAnchorColorStats(statsOfAll(figureRaster()), statsOfAll(figureRaster({ style: FIGURE_STYLE_B }))).similarity).toBeGreaterThan(0.5);
  });

  it("밝기만 조금 바뀐 이미지는 색 계열이 바뀐 이미지보다 훨씬 비슷하다", () => {
    const base = extractAnchorFeatures(figureRaster()).color;
    const dimmer = extractAnchorFeatures(figureRaster({ style: { skin: [226, 186, 160], hair: [50, 30, 24], top: [190, 35, 45], bottom: [35, 62, 140], bag: [230, 190, 35] } })).color;
    const hueChanged = extractAnchorFeatures(figureRaster({ style: FIGURE_STYLE_B })).color;
    const near = compareAnchorColorStats(base, dimmer).similarity;
    const far = compareAnchorColorStats(base, hueChanged).similarity;
    expect(near).toBeGreaterThan(far + 0.3);
  });
});

describe("Hellinger 거리", () => {
  it("같으면 0, 겹치지 않으면 1, 대칭이다", () => {
    expect(hellingerDistance([0.5, 0.5, 0], [0.5, 0.5, 0])).toBe(0);
    expect(hellingerDistance([1, 0], [0, 1])).toBe(1);
    expect(hellingerDistance([0.7, 0.3], [0.4, 0.6])).toBeCloseTo(hellingerDistance([0.4, 0.6], [0.7, 0.3]), 12);
  });

  it("길이가 다르거나 비어 있으면 가장 먼 값이다", () => {
    expect(hellingerDistance([1], [0.5, 0.5])).toBe(1);
    expect(hellingerDistance([], [])).toBe(1);
  });

  it("가중치 합은 1 이다", () => {
    expect(ANCHOR_COLOR_WEIGHTS.chroma + ANCHOR_COLOR_WEIGHTS.lightness).toBeCloseTo(1, 10);
  });
});
