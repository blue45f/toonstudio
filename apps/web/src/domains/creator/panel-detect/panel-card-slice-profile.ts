/**
 * 카드 절단 위치 판정용 행 측정 — 원본의 모든 행이 "한 가지 색으로 비어 있는지"를 잰다.
 *
 * 말풍선·얼굴·효과음이 걸친 행은 한 가지 색이 아니므로 비율이 낮게 나온다. 컷 사이 여백(흰·검정·임의 단색·투명)과
 * 하늘 같은 넓은 단색 면은 모두 높게 나온다. 그래서 별도의 컷 감지 없이도 "자르면 안 되는 행"을 가려낼 수 있다.
 */

import { CARD_SLICE_LIMITS, type CardRowProfile } from "./panel-card-slice-types";

import type { PanelDetectBudget } from "./panel-detect-runtime";
import type { PanelDetectRaster } from "./panel-detect-types";

const SAMPLE_COLUMNS = 9;

/** 표본 아홉 칸 중 서로 가장 많이 어울리는 색을 행의 기준색으로 삼는다(예: 행이 거의 여백이면 여백색). */
function referenceColor(
  data: ArrayLike<number>,
  rowStart: number,
  width: number,
  tolerance: number,
  out: Uint8Array,
  outOffset: number,
): void {
  const alpha = CARD_SLICE_LIMITS.transparentAlpha;
  const r = new Int16Array(SAMPLE_COLUMNS);
  const g = new Int16Array(SAMPLE_COLUMNS);
  const b = new Int16Array(SAMPLE_COLUMNS);
  const transparent = new Uint8Array(SAMPLE_COLUMNS);
  for (let s = 0; s < SAMPLE_COLUMNS; s += 1) {
    const x = Math.min(width - 1, Math.floor(((s + 0.5) * width) / SAMPLE_COLUMNS));
    const p = rowStart + x * 4;
    r[s] = data[p];
    g[s] = data[p + 1];
    b[s] = data[p + 2];
    transparent[s] = data[p + 3] <= alpha ? 1 : 0;
  }
  let bestSample = 0;
  let bestAgree = -1;
  for (let s = 0; s < SAMPLE_COLUMNS; s += 1) {
    let agree = 0;
    for (let t = 0; t < SAMPLE_COLUMNS; t += 1) {
      if (transparent[s] !== transparent[t]) continue;
      if (transparent[s] === 1 || (Math.abs(r[s] - r[t]) <= tolerance && Math.abs(g[s] - g[t]) <= tolerance && Math.abs(b[s] - b[t]) <= tolerance)) {
        agree += 1;
      }
    }
    if (agree > bestAgree) {
      bestAgree = agree;
      bestSample = s;
    }
  }
  if (transparent[bestSample] === 1) {
    out[outOffset] = 0;
    out[outOffset + 1] = 0;
    out[outOffset + 2] = 0;
    out[outOffset + 3] = 0;
    return;
  }
  // 기준색과 어울리는 표본의 평균을 쓴다(잡티가 한 표본에 몰려도 기준이 한쪽으로 쏠리지 않는다).
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (let t = 0; t < SAMPLE_COLUMNS; t += 1) {
    if (transparent[t] === 1) continue;
    if (Math.abs(r[bestSample] - r[t]) <= tolerance && Math.abs(g[bestSample] - g[t]) <= tolerance && Math.abs(b[bestSample] - b[t]) <= tolerance) {
      sumR += r[t];
      sumG += g[t];
      sumB += b[t];
      count += 1;
    }
  }
  out[outOffset] = Math.round(sumR / count);
  out[outOffset + 1] = Math.round(sumG / count);
  out[outOffset + 2] = Math.round(sumB / count);
  out[outOffset + 3] = 255;
}

export function* analyzeCardRows(
  raster: PanelDetectRaster,
  budget: PanelDetectBudget,
  tolerance: number = CARD_SLICE_LIMITS.colorTolerance,
): Generator<void, CardRowProfile, void> {
  const { width, height, data } = raster;
  const alpha = CARD_SLICE_LIMITS.transparentAlpha;
  const uniformity = new Float32Array(height);
  const colors = new Uint8Array(height * 4);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width * 4;
    referenceColor(data, rowStart, width, tolerance, colors, y * 4);
    const rr = colors[y * 4];
    const gg = colors[y * 4 + 1];
    const bb = colors[y * 4 + 2];
    const referenceTransparent = colors[y * 4 + 3] === 0;
    let match = 0;
    let p = rowStart;
    if (referenceTransparent) {
      for (let x = 0; x < width; x += 1, p += 4) if (data[p + 3] <= alpha) match += 1;
    } else {
      for (let x = 0; x < width; x += 1, p += 4) {
        if (data[p + 3] > alpha && Math.abs(data[p] - rr) <= tolerance && Math.abs(data[p + 1] - gg) <= tolerance && Math.abs(data[p + 2] - bb) <= tolerance) {
          match += 1;
        }
      }
    }
    uniformity[y] = match / width;
    if (budget.consume(width)) yield;
  }
  return { width, height, uniformity, colors };
}

/** 행마다 가장 가까운 "비어 있지 않은 행"까지의 거리(최대 cap). 이미지 위아래 밖은 비어 있는 것으로 본다. */
export function cleanMargins(profile: CardRowProfile, cap: number = CARD_SLICE_LIMITS.marginCap): Uint8Array {
  const { height, uniformity } = profile;
  const clean = CARD_SLICE_LIMITS.cleanUniformity;
  const margin = new Uint8Array(height);
  let run = cap;
  for (let y = 0; y < height; y += 1) {
    run = uniformity[y] >= clean ? Math.min(cap, run + 1) : 0;
    margin[y] = run;
  }
  run = cap;
  for (let y = height - 1; y >= 0; y -= 1) {
    run = uniformity[y] >= clean ? Math.min(cap, run + 1) : 0;
    if (run < margin[y]) margin[y] = run;
  }
  return margin;
}

function hex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

/** 여백 행에서 가장 많이 나온 색(#rrggbb). 여백 행이 거의 없거나 투명이 많으면 흰색. */
export function dominantCleanColor(profile: CardRowProfile): string {
  const clean = CARD_SLICE_LIMITS.cleanUniformity;
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  let cleanRows = 0;
  for (let y = 0; y < profile.height; y += 1) {
    if (profile.uniformity[y] < clean || profile.colors[y * 4 + 3] === 0) continue;
    cleanRows += 1;
    const r = profile.colors[y * 4];
    const g = profile.colors[y * 4 + 1];
    const b = profile.colors[y * 4 + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bin = bins.get(key);
    if (bin) {
      bin.count += 1;
      bin.r += r;
      bin.g += g;
      bin.b += b;
    } else {
      bins.set(key, { count: 1, r, g, b });
    }
  }
  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const bin of bins.values()) if (best === null || bin.count > best.count) best = bin;
  if (best === null || cleanRows < Math.max(2, profile.height * 0.005)) return "#ffffff";
  return `#${hex(best.r / best.count)}${hex(best.g / best.count)}${hex(best.b / best.count)}`;
}
