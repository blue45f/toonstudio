import { describe, expect, it } from "vitest";

import { compareAnchorFeatures } from "./anchor-consistency-compare";
import {
  ANCHOR_DIFFERENCE_THRESHOLDS,
  describeAnchorDifferences,
  type AnchorDifference,
  type AnchorDifferenceId,
} from "./anchor-consistency-differences";
import { extractAnchorFeatures, type AnchorImageFeatures } from "./anchor-image-features";
import {
  FIGURE_STYLE_A,
  FIGURE_STYLE_B,
  figureRaster,
  noiseRaster,
  type FigureImageOptions,
  type FigureStyle,
  type Rgb,
} from "./anchor-synthetic-raster";

function featuresOf(options: FigureImageOptions = {}): AnchorImageFeatures {
  return extractAnchorFeatures(figureRaster(options));
}

function differencesBetween(anchor: AnchorImageFeatures, candidate: AnchorImageFeatures): readonly AnchorDifference[] {
  return describeAnchorDifferences(anchor, candidate, compareAnchorFeatures(anchor, candidate));
}

function idsOf(items: readonly AnchorDifference[]): AnchorDifferenceId[] {
  return items.map((item) => item.id);
}

function scaleStyle(style: FigureStyle, factor: number): FigureStyle {
  const scale = (color: Rgb): Rgb => [Math.round(color[0] * factor), Math.round(color[1] * factor), Math.round(color[2] * factor)];
  return { skin: scale(style.skin), hair: scale(style.hair), top: scale(style.top), bottom: scale(style.bottom), bag: scale(style.bag) };
}

describe("무엇이 달랐나", () => {
  const anchor = featuresOf();

  it("같은 이미지는 거의 같은 그림(near-duplicate)이라고만 알린다", () => {
    const items = differencesBetween(anchor, anchor);
    expect(idsOf(items)).toEqual(["near-duplicate"]);
    expect(items[0]?.severity).toBe("info");
  });

  it("전체가 어두워지면 밝기 차이를 어느 쪽으로 달랐는지와 함께 알린다", () => {
    const darker = featuresOf({ style: scaleStyle(FIGURE_STYLE_A, 0.5) });
    const lightness = differencesBetween(anchor, darker).find((item) => item.id === "lightness");
    expect(lightness?.variant).toBe("darker");
    expect(lightness?.severity).toBe("major");
    expect(Number(lightness?.params.delta)).toBeGreaterThanOrEqual(ANCHOR_DIFFERENCE_THRESHOLDS.lightness.major);
    const reversed = differencesBetween(darker, anchor).find((item) => item.id === "lightness");
    expect(reversed?.variant).toBe("brighter");
  });

  it("색 계열이 다르면 팔레트에서 빠진 색과 새로 생긴 색을 짚는다", () => {
    const other = featuresOf({ style: FIGURE_STYLE_B });
    const items = differencesBetween(anchor, other);
    const missing = items.filter((item) => item.id === "palette-missing");
    const extra = items.filter((item) => item.id === "palette-extra");
    expect(missing.length).toBeGreaterThan(0);
    expect(extra.length).toBeGreaterThan(0);
    expect(missing.length).toBeLessThanOrEqual(2);
    expect(extra.length).toBeLessThanOrEqual(2);
    expect(String(missing[0]?.params.hex)).toMatch(/^#[0-9a-f]{6}$/u);
    expect(String(missing[0]?.params.nearestHex)).toMatch(/^#[0-9a-f]{6}$/u);
    expect(Number(missing[0]?.params.percent)).toBeGreaterThanOrEqual(8);
  });

  it("피사체가 작아지면 크기 차이를 정보 수준으로만 알린다", () => {
    const smaller = featuresOf({ scale: 0.6, dy: 0.1 });
    const scale = differencesBetween(anchor, smaller).find((item) => item.id === "subject-scale");
    expect(scale?.variant).toBe("smaller");
    expect(scale?.severity).toBe("info");
    expect(Number(scale?.params.ratio)).toBeGreaterThan(1);
    const larger = differencesBetween(smaller, anchor).find((item) => item.id === "subject-scale");
    expect(larger?.variant).toBe("larger");
  });

  it("가로세로 비가 달라지면 비율 차이를 알린다", () => {
    const wide = differencesBetween(anchor, featuresOf({ pose: "wide" })).find((item) => item.id === "proportion");
    expect(wide?.variant).toBe("wider");
    const side = differencesBetween(anchor, featuresOf({ pose: "side" })).find((item) => item.id === "proportion");
    expect(side?.variant).toBe("narrower");
  });

  it("피사체가 화면에서 크게 옮겨 가면 위치 차이를 알린다", () => {
    const moved = differencesBetween(anchor, featuresOf({ dx: 0.22 })).find((item) => item.id === "position");
    expect(moved?.severity).toBe("info");
    expect(Number(moved?.params.dxPercent)).toBeGreaterThanOrEqual(15);
  });

  it("조금 옮겨진 정도는 위치 차이로 알리지 않는다", () => {
    expect(idsOf(differencesBetween(anchor, featuresOf({ dx: 0.04, dy: 0.03 })))).not.toContain("position");
  });

  it("피사체를 가르지 못한 쪽이 있으면 어느 쪽인지 알린다", () => {
    const noise = extractAnchorFeatures(noiseRaster(96, 96, 4));
    const candidateSide = differencesBetween(anchor, noise).find((item) => item.id === "subject-not-separated");
    expect(candidateSide?.variant).toBe("candidate");
    const anchorSide = differencesBetween(noise, anchor).find((item) => item.id === "subject-not-separated");
    expect(anchorSide?.variant).toBe("anchor");
    const both = differencesBetween(noise, extractAnchorFeatures(noiseRaster(96, 96, 5))).find((item) => item.id === "subject-not-separated");
    expect(both?.variant).toBe("both");
  });

  it("구조가 거의 겹치지 않으면 structure 를 정보로 알리고, 이때는 near-duplicate 를 알리지 않는다", () => {
    const candidate = extractAnchorFeatures(noiseRaster(96, 96, 4));
    const comparison = compareAnchorFeatures(anchor, candidate);
    expect(comparison.similarities.structure ?? 1).toBeLessThan(ANCHOR_DIFFERENCE_THRESHOLDS.structureSimilarity);
    const items = describeAnchorDifferences(anchor, candidate, comparison);
    const structure = items.find((item) => item.id === "structure");
    expect(structure?.severity).toBe("info");
    expect(structure?.params.bits).toBe(64);
    expect(idsOf(items)).not.toContain("near-duplicate");
  });

  it("비슷한 그림에는 structure 도 near-duplicate 도 아닌 빈 목록이 나올 수 있다(포즈만 조금 바뀐 경우)", () => {
    expect(idsOf(differencesBetween(anchor, featuresOf({ pose: "arms-up" })))).toEqual([]);
  });

  it("심각도(major > notice > info) 순으로, 같은 심각도에서는 큰 차이가 먼저이고 8개를 넘지 않는다", () => {
    const items = differencesBetween(anchor, featuresOf({ style: scaleStyle(FIGURE_STYLE_B, 0.6), pose: "wide", scale: 0.55, dx: 0.2 }));
    expect(items.length).toBeGreaterThan(2);
    expect(items.length).toBeLessThanOrEqual(ANCHOR_DIFFERENCE_THRESHOLDS.maxItems);
    const rank = { major: 0, notice: 1, info: 2 } as const;
    for (let index = 1; index < items.length; index += 1) {
      const previous = items[index - 1];
      const current = items[index];
      if (!previous || !current) continue;
      expect(rank[previous.severity]).toBeLessThanOrEqual(rank[current.severity]);
      if (previous.severity === current.severity) expect(previous.magnitude).toBeGreaterThanOrEqual(current.magnitude);
    }
  });

  it("문장이 아니라 항목 종류와 값만 돌려주고, 값은 숫자와 #rrggbb 색뿐이다", () => {
    const items = differencesBetween(anchor, featuresOf({ style: FIGURE_STYLE_B, pose: "wide", dx: 0.2 }));
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      for (const value of Object.values(item.params)) {
        if (typeof value === "string") expect(value).toMatch(/^#[0-9a-f]{6}$/u);
        else expect(Number.isFinite(value)).toBe(true);
      }
      expect(Object.isFrozen(item)).toBe(true);
      expect(Object.isFrozen(item.params)).toBe(true);
    }
  });

  it("몸의 부위(머리·피부·의상)를 짚는 항목 종류가 없다", () => {
    const ids: AnchorDifferenceId[] = [
      "lightness", "chroma", "hue", "palette-missing", "palette-extra", "subject-scale", "proportion",
      "position", "silhouette", "structure", "near-duplicate", "subject-not-separated",
    ];
    for (const id of ids) expect(id).not.toMatch(/head|face|skin|hair|costume|cloth|body|얼굴|머리|피부|의상/iu);
  });

  it("같은 입력은 항상 같은 항목을 낸다", () => {
    const candidate = featuresOf({ style: FIGURE_STYLE_B, pose: "arms-up" });
    expect(differencesBetween(anchor, candidate)).toEqual(differencesBetween(anchor, candidate));
  });
});
