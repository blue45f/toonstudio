import { describe, expect, it } from "vitest";

import { detectPanels } from "./panel-detect-core";
import { BLACK, FixtureImage, PASTEL, WHITE, mulberry32, rectIou, type Rgb } from "./panel-detect-fixtures";

import type { PanelRect } from "./panel-detect-types";

/**
 * 무작위 단두대(guillotine) 배치 정확도 측정.
 *
 * 컷 사이 여백이 축에 평행한 배치(행/열로 재귀 분할되는 배치)를 시드 고정 난수로 만들어, 감지가 컷 개수와 경계를
 * 얼마나 정확히 되찾는지 센다. 기울어진 컷·겹침은 여기서 다루지 않는다(panel-detect-core.test.ts 의 검출 불가 시험).
 * 합성 이미지이므로 실제 스캔본 정확도를 보장하는 수치가 아니다 — docs/features/panel-detect-reflow.md 에 한계를 적었다.
 */

interface Layout {
  readonly image: FixtureImage;
  readonly expected: readonly PanelRect[];
  readonly gutter: "white" | "black" | "solid" | "transparent";
}

const GUTTERS: readonly { readonly kind: Layout["gutter"]; readonly color: Rgb | null; readonly border: Rgb }[] = [
  { kind: "white", color: WHITE, border: [20, 20, 24] },
  { kind: "black", color: BLACK, border: [235, 235, 235] },
  { kind: "solid", color: PASTEL, border: [20, 20, 24] },
  { kind: "transparent", color: null, border: [20, 20, 24] },
];

function buildLayout(seed: number): Layout {
  const random = mulberry32(seed * 7919 + 13);
  const pick = (min: number, max: number): number => min + Math.floor(random() * (max - min + 1));
  const gutter = GUTTERS[seed % GUTTERS.length];
  const portrait = random() < 0.7;
  const width = portrait ? pick(700, 1100) : pick(1000, 1400);
  const height = portrait ? pick(1000, 1800) : pick(700, 1000);
  const image = new FixtureImage(width, height, gutter.color);
  const margin = pick(24, 80);
  const expected: PanelRect[] = [];
  let artSeed = seed;

  const split = (x: number, y: number, w: number, h: number, depth: number): void => {
    const canSplitRows = h >= 2 * 150 + 40 && depth < 4;
    const canSplitCols = w >= 2 * 150 + 40 && depth < 4;
    const wantSplit = depth === 0 || random() < 0.7;
    if (!wantSplit || (!canSplitRows && !canSplitCols)) {
      const border = random() < 0.5 ? 0 : 3;
      artSeed += 1;
      expected.push(image.art(x, y, w, h, { seed: artSeed, border, borderColor: gutter.border }));
      return;
    }
    const gap = pick(14, 56);
    const rows = canSplitRows && (!canSplitCols || random() < 0.5);
    if (rows) {
      const first = pick(150, h - gap - 150);
      split(x, y, w, first, depth + 1);
      split(x, y + first + gap, w, h - first - gap, depth + 1);
    } else {
      const first = pick(150, w - gap - 150);
      split(x, y, first, h, depth + 1);
      split(x + first + gap, y, w - first - gap, h, depth + 1);
    }
  };
  split(margin, margin, width - 2 * margin, height - 2 * margin, 0);
  if (seed % 3 === 0) image.noise(8, seed);
  return { image, expected, gutter: gutter.kind };
}

interface Match {
  readonly found: number;
  readonly matched: number;
  readonly maxEdgeError: number;
}

function matchPanels(found: readonly PanelRect[], expected: readonly PanelRect[]): Match {
  const used = new Set<number>();
  let matched = 0;
  let maxEdgeError = 0;
  for (const rect of expected) {
    let best = -1;
    let bestIou = 0;
    found.forEach((candidate, index) => {
      if (used.has(index)) return;
      const iou = rectIou(candidate, rect);
      if (iou > bestIou) {
        bestIou = iou;
        best = index;
      }
    });
    if (best >= 0 && bestIou >= 0.98) {
      used.add(best);
      matched += 1;
      const actual = found[best];
      maxEdgeError = Math.max(
        maxEdgeError,
        Math.abs(actual.x - rect.x),
        Math.abs(actual.y - rect.y),
        Math.abs(actual.x + actual.width - (rect.x + rect.width)),
        Math.abs(actual.y + actual.height - (rect.y + rect.height)),
      );
    }
  }
  return { found: found.length, matched, maxEdgeError };
}

describe("컷 감지 정확도 — 무작위 단두대 배치 48종", () => {
  it("모든 배치에서 컷 개수와 경계를 되찾는다(재현율·정밀도 100%, 경계 오차 ≤ 1px)", () => {
    let expectedTotal = 0;
    let foundTotal = 0;
    let matchedTotal = 0;
    let worstEdge = 0;
    const misses: string[] = [];
    for (let seed = 1; seed <= 48; seed += 1) {
      const layout = buildLayout(seed);
      const result = detectPanels(layout.image.raster(), { readingOrder: "comic" });
      const match = matchPanels(result.panels, layout.expected);
      expectedTotal += layout.expected.length;
      foundTotal += match.found;
      matchedTotal += match.matched;
      worstEdge = Math.max(worstEdge, match.maxEdgeError);
      if (match.matched !== layout.expected.length || match.found !== layout.expected.length) {
        misses.push(`seed ${seed} (${layout.gutter}): 기대 ${layout.expected.length} / 발견 ${match.found} / 일치 ${match.matched}`);
      }
      expect(result.undetectable, `seed ${seed} 검출 불가 영역`).toEqual([]);
    }
    expect(misses).toEqual([]);
    expect(matchedTotal).toBe(expectedTotal);
    expect(foundTotal).toBe(expectedTotal);
    expect(worstEdge).toBeLessThanOrEqual(1);
  });

  it("같은 배치를 4배 축소 분석해도 컷 개수는 유지하고 경계 오차는 4px 이내다", () => {
    let checked = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const layout = buildLayout(seed);
      const result = detectPanels(layout.image.raster(), { readingOrder: "comic", maxAnalysisPixels: 90_000 });
      expect(result.analysis.step).toBeGreaterThanOrEqual(3);
      const match = matchPanels(result.panels, layout.expected);
      expect(match.found, `seed ${seed}`).toBe(layout.expected.length);
      expect(match.matched, `seed ${seed}`).toBe(layout.expected.length);
      expect(match.maxEdgeError, `seed ${seed}`).toBeLessThanOrEqual(4);
      checked += 1;
    }
    expect(checked).toBe(12);
  });
});
