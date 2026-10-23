/**
 * 전체 주요색 팔레트 — Lab 공간의 결정적 k-means 로 이미지 전체(또는 분리된 피사체 전체)의 주요 색 몇 개를 뽑는다.
 *
 * 머리·피부·의상 같은 구간을 가정하지 않는다. 어떤 색이 얼마나(비율) 있는지만 보고, 어디에 있는지는 보지 않는다.
 * 같은 입력은 항상 같은 팔레트를 만든다(난수 없음: 평균에 가장 가까운 점에서 시작해 가장 먼 점을 차례로 더한다).
 */

import { deltaE76, labToHex, type LabColor } from "./anchor-color-lab";

import type { AnchorLabImage } from "./anchor-subject-mask";

export const ANCHOR_PALETTE = Object.freeze({
  k: 5,
  maxSamples: 3000,
  maxIterations: 12,
  /** 이 비율보다 작은 색은 팔레트에서 뺀다. */
  minShare: 0.03,
  /** 이 ΔE 보다 가까운 두 색은 하나로 합친다. */
  mergeDeltaE: 6,
  /** 팔레트 거리를 0~1 점수로 바꿀 때 "완전히 다른 팔레트"로 보는 ΔE. 휴리스틱. */
  distanceScale: 40,
  /** "이 색이 상대에 없다"고 말하는 최소 ΔE 와 최소 비율. 휴리스틱. */
  missingDeltaE: 22,
  missingMinShare: 0.08,
});

export interface AnchorPaletteEntry {
  readonly lab: LabColor;
  readonly hex: string;
  /** 포함된 픽셀 중 이 색에 속한 비율(합 1). */
  readonly share: number;
}

function sampleIndices(include: Uint8Array): number[] {
  const all: number[] = [];
  for (let index = 0; index < include.length; index += 1) if (include[index] === 1) all.push(index);
  if (all.length <= ANCHOR_PALETTE.maxSamples) return all;
  const stride = all.length / ANCHOR_PALETTE.maxSamples;
  const picked: number[] = [];
  for (let step = 0; step < ANCHOR_PALETTE.maxSamples; step += 1) picked.push(all[Math.floor(step * stride)] ?? 0);
  return picked;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 포함된 픽셀이 없으면 빈 배열. share 내림차순(같으면 L* 내림차순)으로 정렬한다. */
export function extractAnchorPalette(image: AnchorLabImage, include: Uint8Array): readonly AnchorPaletteEntry[] {
  const indices = sampleIndices(include);
  const n = indices.length;
  if (n === 0) return Object.freeze([]);
  const sl = new Float64Array(n);
  const sa = new Float64Array(n);
  const sb = new Float64Array(n);
  let meanL = 0;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i += 1) {
    const pixel = indices[i] ?? 0;
    sl[i] = image.lightness[pixel] ?? 0;
    sa[i] = image.a[pixel] ?? 0;
    sb[i] = image.b[pixel] ?? 0;
    meanL += sl[i] ?? 0;
    meanA += sa[i] ?? 0;
    meanB += sb[i] ?? 0;
  }
  meanL /= n;
  meanA /= n;
  meanB /= n;

  const square = (i: number, l: number, a: number, b: number): number => {
    const dl = (sl[i] ?? 0) - l;
    const da = (sa[i] ?? 0) - a;
    const db = (sb[i] ?? 0) - b;
    return dl * dl + da * da + db * db;
  };

  // 결정적 초기화: 평균에 가장 가까운 점, 이후 기존 중심에서 가장 먼 점.
  const centers: Array<[number, number, number]> = [];
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i += 1) {
    const distance = square(i, meanL, meanA, meanB);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = i;
    }
  }
  centers.push([sl[nearest] ?? 0, sa[nearest] ?? 0, sb[nearest] ?? 0]);
  const minDistance = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  while (centers.length < ANCHOR_PALETTE.k) {
    const last = centers[centers.length - 1];
    if (!last) break;
    let farthest = -1;
    let farthestDistance = 0;
    for (let i = 0; i < n; i += 1) {
      const distance = Math.min(minDistance[i] ?? 0, square(i, last[0], last[1], last[2]));
      minDistance[i] = distance;
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = i;
      }
    }
    // 남은 점이 모두 기존 중심의 ΔE 2 안이면 더 나눌 색이 없다.
    if (farthest < 0 || farthestDistance < 4) break;
    centers.push([sl[farthest] ?? 0, sa[farthest] ?? 0, sb[farthest] ?? 0]);
  }

  const assignment = new Int32Array(n).fill(-1);
  for (let iteration = 0; iteration < ANCHOR_PALETTE.maxIterations; iteration += 1) {
    let changed = false;
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i += 1) {
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centers.length; c += 1) {
        const center = centers[c];
        if (!center) continue;
        const distance = square(i, center[0], center[1], center[2]);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = c;
        }
      }
      if (assignment[i] !== best) {
        assignment[i] = best;
        changed = true;
      }
      const sum = sums[best];
      if (sum) {
        sum[0] = (sum[0] ?? 0) + (sl[i] ?? 0);
        sum[1] = (sum[1] ?? 0) + (sa[i] ?? 0);
        sum[2] = (sum[2] ?? 0) + (sb[i] ?? 0);
        sum[3] = (sum[3] ?? 0) + 1;
      }
    }
    for (let c = 0; c < centers.length; c += 1) {
      const sum = sums[c];
      if (sum && (sum[3] ?? 0) > 0) centers[c] = [(sum[0] ?? 0) / (sum[3] ?? 1), (sum[1] ?? 0) / (sum[3] ?? 1), (sum[2] ?? 0) / (sum[3] ?? 1)];
    }
    if (!changed) break;
  }

  const counts = new Float64Array(centers.length);
  for (let i = 0; i < n; i += 1) counts[assignment[i] ?? 0] = (counts[assignment[i] ?? 0] ?? 0) + 1;
  let entries: Array<{ lab: LabColor; share: number }> = centers.map((center, c) => ({ lab: center, share: (counts[c] ?? 0) / n }));
  entries = entries.filter((entry) => entry.share >= ANCHOR_PALETTE.minShare);
  entries = mergeCloseColors(entries);
  const total = entries.reduce((sum, entry) => sum + entry.share, 0) || 1;
  return Object.freeze(
    entries
      .map((entry) => ({
        lab: Object.freeze([round2(entry.lab[0]), round2(entry.lab[1]), round2(entry.lab[2])] as const),
        hex: labToHex(entry.lab[0], entry.lab[1], entry.lab[2]),
        share: Math.round((entry.share / total) * 10_000) / 10_000,
      }))
      .sort((left, right) => right.share - left.share || right.lab[0] - left.lab[0])
      .map((entry) => Object.freeze(entry)),
  );
}

function mergeCloseColors(entries: ReadonlyArray<{ lab: LabColor; share: number }>): Array<{ lab: LabColor; share: number }> {
  const merged: Array<{ lab: LabColor; share: number }> = [];
  for (const entry of [...entries].sort((left, right) => right.share - left.share)) {
    const near = merged.find((other) => deltaE76(other.lab, entry.lab) < ANCHOR_PALETTE.mergeDeltaE);
    if (!near) {
      merged.push({ lab: entry.lab, share: entry.share });
      continue;
    }
    const total = near.share + entry.share;
    near.lab = [
      (near.lab[0] * near.share + entry.lab[0] * entry.share) / total,
      (near.lab[1] * near.share + entry.lab[1] * entry.share) / total,
      (near.lab[2] * near.share + entry.lab[2] * entry.share) / total,
    ];
    near.share = total;
  }
  return merged;
}

export interface AnchorPaletteGap {
  readonly hex: string;
  readonly share: number;
  /** 상대 팔레트에서 가장 가까운 색까지의 ΔE. */
  readonly deltaE: number;
  readonly nearestHex: string;
}

export interface AnchorPaletteComparison {
  /** 두 팔레트의 점유율 가중 최근접 ΔE 를 양방향 평균한 값. */
  readonly distance: number;
  /** 0~1. 1 − distance/40 (40 은 휴리스틱). */
  readonly similarity: number;
  /** 왼쪽 팔레트의 색 중 오른쪽에 비슷한 색이 없는 것(점유율 큰 순). */
  readonly missingInRight: readonly AnchorPaletteGap[];
  /** 오른쪽 팔레트의 색 중 왼쪽에 비슷한 색이 없는 것. */
  readonly missingInLeft: readonly AnchorPaletteGap[];
}

function directional(
  from: readonly AnchorPaletteEntry[],
  to: readonly AnchorPaletteEntry[],
): { weighted: number; gaps: AnchorPaletteGap[] } {
  let weighted = 0;
  const gaps: AnchorPaletteGap[] = [];
  for (const entry of from) {
    let best = Number.POSITIVE_INFINITY;
    let nearestHex = "";
    for (const other of to) {
      const distance = deltaE76(entry.lab, other.lab);
      if (distance < best) {
        best = distance;
        nearestHex = other.hex;
      }
    }
    weighted += entry.share * best;
    if (best >= ANCHOR_PALETTE.missingDeltaE && entry.share >= ANCHOR_PALETTE.missingMinShare) {
      gaps.push({ hex: entry.hex, share: entry.share, deltaE: round2(best), nearestHex });
    }
  }
  return { weighted, gaps: gaps.sort((left, right) => right.share - left.share) };
}

export function compareAnchorPalettes(
  left: readonly AnchorPaletteEntry[],
  right: readonly AnchorPaletteEntry[],
): AnchorPaletteComparison {
  if (left.length === 0 || right.length === 0) {
    return Object.freeze({ distance: ANCHOR_PALETTE.distanceScale, similarity: 0, missingInRight: Object.freeze([]), missingInLeft: Object.freeze([]) });
  }
  const forward = directional(left, right);
  const backward = directional(right, left);
  const distance = (forward.weighted + backward.weighted) / 2;
  return Object.freeze({
    distance: round2(distance),
    similarity: Math.min(1, Math.max(0, 1 - distance / ANCHOR_PALETTE.distanceScale)),
    missingInRight: Object.freeze(forward.gaps),
    missingInLeft: Object.freeze(backward.gaps),
  });
}
