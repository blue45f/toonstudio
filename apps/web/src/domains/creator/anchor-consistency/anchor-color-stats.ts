/**
 * 색 분포 특징 — 포함된 픽셀의 Lab 평균과 L* 히스토그램(16칸), a*b* 히스토그램(12×12칸).
 *
 * 히스토그램은 이웃 칸으로 값을 나눠 담는(soft binning) 방식이라 칸 경계에서 값이 조금 흔들려도 거리가 급변하지 않는다.
 * 두 분포의 거리는 Hellinger 거리(0~1)로 잰다. 머리·피부·의상 같은 영역을 가정하지 않고 이미지 전체(또는 분리된
 * 피사체 전체)의 분포만 본다.
 */

import type { AnchorLabImage } from "./anchor-subject-mask";

export const ANCHOR_COLOR_BINS = Object.freeze({
  lightnessBins: 16,
  /** a*, b* 각 축의 범위와 칸 수. 범위 밖은 가장자리 칸으로 모은다. */
  chromaMin: -96,
  chromaMax: 96,
  chromaBins: 12,
});

/** L* 와 a*b* 히스토그램을 합칠 때의 가중치(조명 변화에 덜 민감하도록 색상 쪽을 더 크게). 휴리스틱이다. */
export const ANCHOR_COLOR_WEIGHTS = Object.freeze({ chroma: 0.7, lightness: 0.3 });

export interface AnchorColorStats {
  readonly meanL: number;
  readonly meanA: number;
  readonly meanB: number;
  readonly meanChroma: number;
  /** L* 의 표준편차. 거의 단색인 이미지를 걸러 내는 데 쓴다. */
  readonly stdL: number;
  readonly lHist: readonly number[];
  readonly abHist: readonly number[];
}

function softBin(value: number, min: number, max: number, bins: number): readonly [number, number, number, number] {
  const width = (max - min) / bins;
  const position = (value - min) / width - 0.5;
  const base = Math.floor(position);
  const fraction = position - base;
  const clamp = (index: number): number => Math.min(bins - 1, Math.max(0, index));
  return [clamp(base), 1 - fraction, clamp(base + 1), fraction];
}

function normalize(values: Float64Array): number[] {
  let total = 0;
  for (const value of values) total += value;
  const out: number[] = [];
  for (const value of values) out.push(total === 0 ? 0 : Math.round((value / total) * 100_000) / 100_000);
  return out;
}

/** `include[i] === 1` 인 픽셀의 색 분포를 계산한다. 포함된 픽셀이 없으면 null. */
export function computeAnchorColorStats(image: AnchorLabImage, include: Uint8Array): AnchorColorStats | null {
  const { lightnessBins, chromaMin, chromaMax, chromaBins } = ANCHOR_COLOR_BINS;
  const lHist = new Float64Array(lightnessBins);
  const abHist = new Float64Array(chromaBins * chromaBins);
  let count = 0;
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  let sumChroma = 0;
  let sumLSquare = 0;
  for (let index = 0; index < include.length; index += 1) {
    if (include[index] !== 1) continue;
    const l = image.lightness[index] ?? 0;
    const a = image.a[index] ?? 0;
    const b = image.b[index] ?? 0;
    count += 1;
    sumL += l;
    sumA += a;
    sumB += b;
    sumChroma += Math.hypot(a, b);
    sumLSquare += l * l;
    const [l0, lw0, l1, lw1] = softBin(l, 0, 100, lightnessBins);
    lHist[l0] = (lHist[l0] ?? 0) + lw0;
    lHist[l1] = (lHist[l1] ?? 0) + lw1;
    const [a0, aw0, a1, aw1] = softBin(a, chromaMin, chromaMax, chromaBins);
    const [b0, bw0, b1, bw1] = softBin(b, chromaMin, chromaMax, chromaBins);
    abHist[a0 * chromaBins + b0] = (abHist[a0 * chromaBins + b0] ?? 0) + aw0 * bw0;
    abHist[a0 * chromaBins + b1] = (abHist[a0 * chromaBins + b1] ?? 0) + aw0 * bw1;
    abHist[a1 * chromaBins + b0] = (abHist[a1 * chromaBins + b0] ?? 0) + aw1 * bw0;
    abHist[a1 * chromaBins + b1] = (abHist[a1 * chromaBins + b1] ?? 0) + aw1 * bw1;
  }
  if (count === 0) return null;
  const meanL = sumL / count;
  const variance = Math.max(0, sumLSquare / count - meanL * meanL);
  const round2 = (value: number): number => Math.round(value * 100) / 100;
  return Object.freeze({
    meanL: round2(meanL),
    meanA: round2(sumA / count),
    meanB: round2(sumB / count),
    meanChroma: round2(sumChroma / count),
    stdL: round2(Math.sqrt(variance)),
    lHist: Object.freeze(normalize(lHist)),
    abHist: Object.freeze(normalize(abHist)),
  });
}

/** 두 정규화 히스토그램의 Hellinger 거리(0~1). 길이가 다르면 가장 먼 값 1. */
export function hellingerDistance(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) return 1;
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const diff = Math.sqrt(left[index] ?? 0) - Math.sqrt(right[index] ?? 0);
    sum += diff * diff;
  }
  return Math.min(1, Math.sqrt(sum / 2));
}

export interface AnchorColorComparison {
  /** 0~1. 1 − 가중 Hellinger 거리. */
  readonly similarity: number;
  readonly chromaDistance: number;
  readonly lightnessDistance: number;
}

export function compareAnchorColorStats(left: AnchorColorStats, right: AnchorColorStats): AnchorColorComparison {
  const chromaDistance = hellingerDistance(left.abHist, right.abHist);
  const lightnessDistance = hellingerDistance(left.lHist, right.lHist);
  const similarity = 1 - (ANCHOR_COLOR_WEIGHTS.chroma * chromaDistance + ANCHOR_COLOR_WEIGHTS.lightness * lightnessDistance);
  return Object.freeze({ similarity: Math.min(1, Math.max(0, similarity)), chromaDistance, lightnessDistance });
}
