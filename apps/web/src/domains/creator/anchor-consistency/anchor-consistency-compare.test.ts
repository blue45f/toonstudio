import { describe, expect, it } from "vitest";

import {
  ANCHOR_FEATURE_IDS,
  ANCHOR_SCORE_BANDS,
  ANCHOR_SCORE_WEIGHTS,
  ANCHOR_TINY_SUBJECT_COVERAGE,
  anchorScoreBand,
  compareAnchorFeatures,
} from "./anchor-consistency-compare";
import { extractAnchorFeatures, type AnchorImageFeatures } from "./anchor-image-features";
import {
  FIGURE_STYLE_B,
  figureRaster,
  flipRasterHorizontally,
  noiseRaster,
  renderSynthetic,
  type FigureImageOptions,
} from "./anchor-synthetic-raster";

// 아래 시험은 합성 도형 그림으로 "점수가 기대한 방향으로 움직이는가"만 본다.
// 실제 작품에서의 정확도나 같은 캐릭터 판정의 근거가 아니다.

function featuresOf(options: FigureImageOptions = {}): AnchorImageFeatures {
  return extractAnchorFeatures(figureRaster(options));
}

describe("점수 구성", () => {
  it("특징 가중치 합은 1 이고 모든 특징이 있다", () => {
    const total = ANCHOR_FEATURE_IDS.reduce((sum, id) => sum + ANCHOR_SCORE_WEIGHTS[id], 0);
    expect(total).toBeCloseTo(1, 10);
    expect([...ANCHOR_FEATURE_IDS].sort()).toEqual(["color", "palette", "silhouette", "structure"]);
  });

  it("구간 경계는 높음 > 보통 순서이고 경계값은 윗 구간에 속한다", () => {
    expect(ANCHOR_SCORE_BANDS.high).toBeGreaterThan(ANCHOR_SCORE_BANDS.medium);
    expect(anchorScoreBand(ANCHOR_SCORE_BANDS.high)).toBe("high");
    expect(anchorScoreBand(ANCHOR_SCORE_BANDS.high - 0.001)).toBe("medium");
    expect(anchorScoreBand(ANCHOR_SCORE_BANDS.medium)).toBe("medium");
    expect(anchorScoreBand(ANCHOR_SCORE_BANDS.medium - 0.001)).toBe("low");
    expect(anchorScoreBand(0)).toBe("low");
    expect(anchorScoreBand(1)).toBe("high");
  });
});

describe("앵커와 후보 비교", () => {
  const anchor = featuresOf();

  it("같은 이미지끼리는 모든 특징이 1 이고 점수는 1, 높음이다", () => {
    const result = compareAnchorFeatures(anchor, anchor);
    expect(result.score).toBeCloseTo(1, 10);
    expect(result.band).toBe("high");
    for (const id of ANCHOR_FEATURE_IDS) expect(result.similarities[id]).toBeCloseTo(1, 10);
    expect(result.limits).toEqual([]);
  });

  it("쓴 가중치는 합이 1 이고 기본 가중치 비율을 따른다", () => {
    const result = compareAnchorFeatures(anchor, featuresOf({ pose: "arms-up" }));
    const total = ANCHOR_FEATURE_IDS.reduce((sum, id) => sum + result.weights[id], 0);
    expect(total).toBeCloseTo(1, 10);
    for (const id of ANCHOR_FEATURE_IDS) expect(result.weights[id]).toBeCloseTo(ANCHOR_SCORE_WEIGHTS[id], 10);
  });

  it("점수는 방향성 순서를 지킨다: 같음 > 배경만 다름 > 크기·위치 변화 > 포즈 변화 > 색 계열 다름 > 무관한 잡음", () => {
    const sameWithOtherBackground = compareAnchorFeatures(anchor, featuresOf({ background: [60, 120, 90] })).score;
    const shifted = compareAnchorFeatures(anchor, featuresOf({ dx: 0.04, dy: 0.03 })).score;
    const armsUp = compareAnchorFeatures(anchor, featuresOf({ pose: "arms-up" })).score;
    const side = compareAnchorFeatures(anchor, featuresOf({ pose: "side" })).score;
    const otherPalette = compareAnchorFeatures(anchor, featuresOf({ style: FIGURE_STYLE_B })).score;
    const unrelated = compareAnchorFeatures(anchor, extractAnchorFeatures(noiseRaster(128, 192, 5))).score;
    expect(sameWithOtherBackground).toBeGreaterThan(0.9);
    expect(shifted).toBeGreaterThan(0.9);
    expect(sameWithOtherBackground).toBeGreaterThan(armsUp);
    expect(armsUp).toBeGreaterThan(side);
    expect(side).toBeGreaterThan(otherPalette);
    expect(otherPalette).toBeGreaterThan(unrelated);
    expect(otherPalette).toBeLessThan(0.55);
    expect(unrelated).toBeLessThan(0.55);
  });

  it("배경색이 달라도 피사체가 같으면 높은 점수를 유지한다", () => {
    const result = compareAnchorFeatures(anchor, featuresOf({ background: [250, 250, 250] }));
    expect(result.band).toBe("high");
  });

  it("좌우를 뒤집은 같은 그림은 높은 점수이고 실루엣은 좌우 반전으로 읽는다", () => {
    const flipped = extractAnchorFeatures(flipRasterHorizontally(figureRaster()));
    const result = compareAnchorFeatures(anchor, flipped);
    expect(result.band).toBe("high");
    expect(result.detail.silhouette?.mirrored).toBe(true);
  });

  it("색 계열이 다르면 색·팔레트 유사도가 실루엣 유사도보다 크게 떨어진다", () => {
    const result = compareAnchorFeatures(anchor, featuresOf({ style: FIGURE_STYLE_B }));
    expect(result.similarities.silhouette).toBeGreaterThan(0.9);
    expect(result.similarities.color ?? 1).toBeLessThan(0.5);
    expect(result.similarities.palette ?? 1).toBeLessThan(0.3);
  });

  it("점수는 0~1 범위이고 결과 객체는 얼려 있다", () => {
    const result = compareAnchorFeatures(anchor, extractAnchorFeatures(noiseRaster(64, 64, 1)));
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.similarities)).toBe(true);
  });
});

describe("쓸 수 없는 특징과 제약 알림", () => {
  const anchor = featuresOf();

  it("후보의 피사체를 못 가르면 실루엣을 빼고 나머지 가중치를 다시 정규화한다", () => {
    const noise = extractAnchorFeatures(noiseRaster(96, 96, 21));
    const result = compareAnchorFeatures(anchor, noise);
    expect(result.similarities.silhouette).toBeNull();
    expect(result.weights.silhouette).toBe(0);
    const total = ANCHOR_FEATURE_IDS.reduce((sum, id) => sum + result.weights[id], 0);
    expect(total).toBeCloseTo(1, 10);
    expect(result.weights.color).toBeCloseTo(ANCHOR_SCORE_WEIGHTS.color / (1 - ANCHOR_SCORE_WEIGHTS.silhouette), 10);
    expect(result.limits).toContain("candidate-not-separated");
    expect(result.limits).not.toContain("anchor-not-separated");
  });

  it("앵커 쪽을 못 가르면 anchor-not-separated 를 알린다", () => {
    const noise = extractAnchorFeatures(noiseRaster(96, 96, 21));
    const result = compareAnchorFeatures(noise, anchor);
    expect(result.limits).toContain("anchor-not-separated");
    expect(result.similarities.silhouette).toBeNull();
  });

  it("거의 단색인 이미지는 낮은 대비 제약을 알린다", () => {
    const flat = extractAnchorFeatures(renderSynthetic({ width: 48, height: 48, background: [120, 120, 120], shapes: [] }));
    expect(compareAnchorFeatures(anchor, flat).limits).toContain("candidate-low-contrast");
    expect(compareAnchorFeatures(flat, anchor).limits).toContain("anchor-low-contrast");
  });

  it("피사체가 아주 작으면 tiny-subject 를 알린다", () => {
    // 점유율 3% 미만이면서도 분리에는 성공하는 좁은 구간(분리 하한은 2%)의 크기다.
    const tinyFigure = featuresOf({ scale: 0.3, dy: 0.2, width: 256, height: 384 });
    expect(tinyFigure.subject.mode).toBe("background");
    expect(tinyFigure.subject.coverage).toBeLessThan(ANCHOR_TINY_SUBJECT_COVERAGE);
    expect(compareAnchorFeatures(anchor, tinyFigure).limits).toContain("tiny-subject");
    expect(compareAnchorFeatures(tinyFigure, anchor).limits).toContain("tiny-subject");
  });

  it("너무 작아 분리하지 못한 피사체는 tiny-subject 가 아니라 not-separated 로 알린다", () => {
    const vanished = featuresOf({ scale: 0.2, dy: 0.2, width: 256, height: 384 });
    expect(vanished.subject.mode).toBe("whole-image");
    const limits = compareAnchorFeatures(anchor, vanished).limits;
    expect(limits).toContain("candidate-not-separated");
    expect(limits).not.toContain("tiny-subject");
  });
});
