/**
 * 카드 절단 계획 — 여백 행을 우선해 N장으로 나누는 동적 계획법(결정적).
 *
 * 후보: 원본을 작은 블록으로 나누고 블록마다 "가장 자르기 좋은 행" 하나를 후보로 둔다. 시작(0)과 끝(높이)이 양 끝이다.
 * 비용: 절단 비용(여백 행 ≈ 0, 거의 빈 행은 중간, 내용을 가로지르는 행은 큼) + 채움 비용(카드가 덜 찰수록 조금) .
 * 조각 길이는 [최소 길이, 카드 한 장에 들어가는 원본 높이] 안에 있어야 한다. 카드 수는 직접 정하거나,
 * 최소 장수부터 최소 장수의 1.5배(적어도 +2장)까지 비용(+ 카드당 벌점)이 가장 낮은 수를 고른다 — 장면이 카드에 꽉 차지 않아도
 * 여백에서 자르는 편이 낫기 때문이다. 어떤 수도 풀리지 않으면 같은 간격으로 나눈다.
 */

import { cleanMargins, dominantCleanColor } from "./panel-card-slice-profile";
import {
  CARD_SLICE_LIMITS,
  CardSliceError,
  classifyCardCut,
  type CardCut,
  type CardGeometry,
  type CardRowProfile,
  type CardSlice,
  type CardSlicePlan,
  type CardSliceWarning,
  type ResolvedCardSliceOptions,
} from "./panel-card-slice-types";

import type { PanelDetectBudget } from "./panel-detect-runtime";

const CLEAN = CARD_SLICE_LIMITS.cleanUniformity;
const SOFT = CARD_SLICE_LIMITS.softUniformity;

/** 절단선이 지나는 두 행(y-1, y)의 측정으로 절단 비용을 낸다. */
export function cutCost(uniformity: number, margin: number): number {
  if (uniformity >= CLEAN) return 0.02 * (1 - Math.min(margin, CARD_SLICE_LIMITS.marginCap) / CARD_SLICE_LIMITS.marginCap);
  if (uniformity >= SOFT) return 0.35 + (0.65 * (CLEAN - uniformity)) / (CLEAN - SOFT);
  return 1.5 + (4 * (SOFT - uniformity)) / SOFT;
}

/** y 번째 행부터 아래 카드가 시작하는 절단선의 균일도(맞닿은 두 행 중 낮은 쪽). */
export function cutUniformity(profile: CardRowProfile, y: number): number {
  return Math.min(profile.uniformity[y - 1], profile.uniformity[y]);
}

function cutMargin(margins: Uint8Array, y: number): number {
  return Math.min(margins[y - 1], margins[y]);
}

function fillCost(length: number, cardSourceHeight: number): number {
  const shortfall = (cardSourceHeight - length) / cardSourceHeight;
  return shortfall * shortfall * 0.6;
}

interface Candidates {
  readonly rows: Int32Array;
  readonly costs: Float64Array;
  readonly count: number;
}

function buildCandidates(profile: CardRowProfile, margins: Uint8Array, geometry: CardGeometry): Candidates {
  const height = profile.height;
  const block = Math.max(2, Math.round(geometry.cardSourceHeight / 180));
  const rows: number[] = [0];
  const costs: number[] = [0];
  for (let start = 1; start < height; start += block) {
    const end = Math.min(height, start + block);
    const center = (start + end - 1) / 2;
    let bestRow = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let y = start; y < end; y += 1) {
      const cost = cutCost(cutUniformity(profile, y), cutMargin(margins, y));
      const distance = Math.abs(y - center);
      if (cost < bestCost - 1e-12 || (Math.abs(cost - bestCost) <= 1e-12 && distance < bestDistance)) {
        bestRow = y;
        bestCost = cost;
        bestDistance = distance;
      }
    }
    rows.push(bestRow);
    costs.push(bestCost);
  }
  rows.push(height);
  costs.push(0);
  return { rows: Int32Array.from(rows), costs: Float64Array.from(costs), count: rows.length };
}

interface DpTable {
  readonly best: Float64Array;
  readonly from: Int32Array;
  readonly count: number;
}

function* buildTable(
  candidates: Candidates,
  geometry: CardGeometry,
  maxCards: number,
  budget: PanelDetectBudget,
): Generator<void, DpTable, void> {
  const { rows, costs, count } = candidates;
  const best = new Float64Array((maxCards + 1) * count).fill(Number.POSITIVE_INFINITY);
  const from = new Int32Array((maxCards + 1) * count).fill(-1);
  best[0] = 0;
  const maxLength = geometry.cardSourceHeight;
  const minLength = geometry.minLength;
  for (let k = 1; k <= maxCards; k += 1) {
    const previous = (k - 1) * count;
    const current = k * count;
    let low = 0;
    let high = -1;
    for (let i = 1; i < count; i += 1) {
      const y = rows[i];
      while (low < count && rows[low] < y - maxLength) low += 1;
      while (high + 1 < i && rows[high + 1] <= y - minLength) high += 1;
      let bestValue = Number.POSITIVE_INFINITY;
      let bestFrom = -1;
      for (let j = low; j <= high; j += 1) {
        const before = best[previous + j];
        if (before === Number.POSITIVE_INFINITY) continue;
        const value = before + fillCost(y - rows[j], maxLength);
        if (value < bestValue) {
          bestValue = value;
          bestFrom = j;
        }
      }
      if (bestFrom >= 0) {
        best[current + i] = bestValue + costs[i];
        from[current + i] = bestFrom;
      }
      if (budget.consume(Math.max(1, high - low + 1))) yield;
    }
  }
  return { best, from, count };
}

function reconstruct(table: DpTable, rows: Int32Array, cards: number): number[] {
  const cuts: number[] = [];
  let index = table.count - 1;
  for (let k = cards; k >= 1; k -= 1) {
    const previous = table.from[k * table.count + index];
    if (previous < 0) return [];
    if (k > 1) cuts.push(rows[previous]);
    index = previous;
  }
  return cuts.reverse();
}

/** 카드 수의 범위: 한 장에 담을 수 있는 높이로 정해지는 최소와, 최소 조각 길이·상한으로 정해지는 최대. */
export function cardCountRange(
  sourceHeight: number,
  geometry: CardGeometry,
  options: Pick<ResolvedCardSliceOptions, "maxCards">,
): { readonly min: number; readonly max: number } {
  const min = Math.max(1, Math.ceil(sourceHeight / geometry.cardSourceHeight));
  const limit = Math.min(options.maxCards, CARD_SLICE_LIMITS.hardMaxCards);
  const longest = Math.max(min, Math.floor(sourceHeight / geometry.minLength));
  return { min, max: Math.min(limit, longest) };
}

function equalCuts(height: number, cards: number): number[] {
  const cuts: number[] = [];
  for (let k = 1; k < cards; k += 1) cuts.push(Math.round((k * height) / cards));
  return cuts;
}

/** 절단 행 목록으로 계획 전체(카드·컷·경고·바탕색)를 만든다. 사용자가 컷을 옮긴 뒤에도 같은 함수를 쓴다. */
export function assembleCardSlicePlan(
  profile: CardRowProfile,
  geometry: CardGeometry,
  options: Pick<ResolvedCardSliceOptions, "cardWidth" | "cardHeight">,
  cutRows: readonly number[],
  manualRows: ReadonlySet<number> = new Set<number>(),
): CardSlicePlan {
  const height = profile.height;
  const boundaries = [0, ...cutRows, height];
  const cards: CardSlice[] = [];
  for (let index = 0; index + 1 < boundaries.length; index += 1) {
    const y0 = boundaries[index];
    const y1 = boundaries[index + 1];
    const outputHeight = Math.min(options.cardHeight, Math.max(1, Math.round((y1 - y0) * geometry.scale)));
    cards.push({ index, y0, y1, outputHeight, fill: outputHeight / options.cardHeight });
  }
  const cuts: CardCut[] = cutRows.map((y, index) => {
    const uniformity = cutUniformity(profile, y);
    return { index, y, kind: classifyCardCut(uniformity), uniformity, manual: manualRows.has(y) };
  });
  const contentCutCount = cuts.filter((cut) => cut.kind === "content").length;
  const warnings: CardSliceWarning[] = [];
  if (contentCutCount > 0) warnings.push("content-cuts");
  if (geometry.scale > 1.0001) warnings.push("upscaled");
  if (geometry.scale < 0.9999) warnings.push("downscaled");
  if (cards.length > CARD_SLICE_LIMITS.softMaxCards) warnings.push("over-carousel-limit");
  return {
    sourceWidth: profile.width,
    sourceHeight: height,
    cardWidth: options.cardWidth,
    cardHeight: options.cardHeight,
    geometry,
    cards,
    cuts,
    contentCutCount,
    warnings,
    background: dominantCleanColor(profile),
  };
}

export function* planCardSlicesSteps(
  profile: CardRowProfile,
  geometry: CardGeometry,
  options: ResolvedCardSliceOptions,
  budget: PanelDetectBudget,
): Generator<void, CardSlicePlan, void> {
  const range = cardCountRange(profile.height, geometry, options);
  if (profile.height <= geometry.cardSourceHeight && (options.cardCount === null || options.cardCount <= 1)) {
    return assembleCardSlicePlan(profile, geometry, options, []);
  }
  const requested = options.cardCount;
  if (requested !== null && (requested < range.min || requested > range.max)) {
    throw new CardSliceError("invalid-options", `카드 수는 ${range.min}~${range.max}장이어야 해요.`);
  }
  if (range.min > CARD_SLICE_LIMITS.hardMaxCards || range.min > options.maxCards) throw new CardSliceError("too-many-cards");

  const margins = cleanMargins(profile);
  const candidates = buildCandidates(profile, margins, geometry);
  const first = requested ?? range.min;
  const last = requested ?? Math.min(range.max, Math.max(range.min + 2, Math.ceil(range.min * 1.5)));
  const table = yield* buildTable(candidates, geometry, last, budget);

  let chosen = -1;
  let chosenValue = Number.POSITIVE_INFINITY;
  for (let cards = first; cards <= last; cards += 1) {
    const value = table.best[cards * table.count + table.count - 1];
    if (value === Number.POSITIVE_INFINITY) continue;
    const total = requested === null ? value + CARD_SLICE_LIMITS.cardPenalty * cards : value;
    if (total < chosenValue - 1e-12) {
      chosen = cards;
      chosenValue = total;
    }
  }
  if (chosen >= 2) {
    const cuts = reconstruct(table, candidates.rows, chosen);
    if (cuts.length === chosen - 1) return assembleCardSlicePlan(profile, geometry, options, cuts);
  }
  // 조건을 모두 만족하는 절단 조합이 없으면(예: 높이가 아주 작음) 같은 간격으로 나눈다. 컷 품질은 그대로 계산해 경고로 남는다.
  const cards = requested ?? range.min;
  return assembleCardSlicePlan(profile, geometry, options, equalCuts(profile.height, cards));
}
