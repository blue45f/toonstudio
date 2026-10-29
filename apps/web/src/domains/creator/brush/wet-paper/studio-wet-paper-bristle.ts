/**
 * 갈필(마르는 붓) 강모 마스크 — Chu & Tai, "Real-Time Painting with an Expressive Virtual Chinese Brush"
 * (IEEE CG&A 2004)의 dry-brush 개념.
 *
 * 강모 지도 생성(`buildWetPaperBristleField`)과 마스크 문턱 수식(`wetPaperDryBrushMask`)은 Sumi
 * (https://github.com/Aureliaar/sumi, `public/sumi.js`의 `buildBristleTexture`·`equalize`·`FS_DAB`, MIT,
 * 커밋 89b8c443)에서 이식했다. 라이선스 원문과 출처는 `third_party/sumi/`에 있다. 이식하면서 바꾼 점:
 * - 크기 320×2048·강모 160가닥 → 128×512·64가닥(제품 베이크 격자 해상도에 맞춤),
 * - `Math.sin`·`Math.exp` → 결정적 다항식(`detSin`·`detExp`)으로 엔진 간 비트 일치,
 * - WebGL 텍스처 대신 Float32Array와 쌍선형 샘플러, 시드 고정 mulberry32(원본과 같은 알고리즘).
 *
 * 지도의 R 채널(강모 높이)과 G 채널(다발 묶음)은 히스토그램 평활화돼 있어 문턱 t가 면적의 약 (1 − t)를
 * 남긴다. 붓이 마를수록 문턱이 오르고, 누르면 내려가며, 가장자리 강모가 먼저 마르고, 다발이 갈라진다.
 */

import {
  clamp01,
  clampNumber,
  createWetPaperMulberry32,
  detExp,
  detSin,
  smoothstep,
} from "./studio-wet-paper-math";

/** 붓 폭 방향 해상도. */
export const WET_PAPER_BRISTLE_WIDTH = 128;
/** 획 방향 해상도(주기적). */
export const WET_PAPER_BRISTLE_HEIGHT = 512;
const BRISTLE_COUNT = 64;
const TUFT_COUNT = 6;
const BRISTLE_SEED = 20_260_926;

export interface WetPaperBristleField {
  readonly width: number;
  readonly height: number;
  /** 강모 높이(dry map), 평활화 0..1. */
  readonly bristle: Float32Array;
  /** 다발 묶음(split map), 평활화 0..1. */
  readonly tuft: Float32Array;
}

/** 히스토그램 평활화(Sumi `equalize`): 문턱 t 위로 면적 약 (1 − t)가 남게 값을 CDF로 바꾼다. */
function equalizeInPlace(values: Float32Array): void {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const bins = 4096;
  const histogram = new Uint32Array(bins);
  const scale = (bins - 1) / ((max - min) || 1);
  for (let index = 0; index < values.length; index += 1) {
    const bin = Math.floor(((values[index] ?? 0) - min) * scale);
    histogram[bin] = (histogram[bin] ?? 0) + 1;
  }
  const cdf = new Float32Array(bins);
  let accumulated = 0;
  for (let bin = 0; bin < bins; bin += 1) {
    const count = histogram[bin] ?? 0;
    cdf[bin] = (accumulated + count * 0.5) / values.length;
    accumulated += count;
  }
  for (let index = 0; index < values.length; index += 1) {
    values[index] = cdf[Math.floor(((values[index] ?? 0) - min) * scale)] ?? 0;
  }
}

/** 주기 1D 값 노이즈(Sumi `pnoise`): cells개 난수 사이를 smoothstep으로 잇는다. */
function periodicNoise(random: () => number, cells: number, length: number): Float32Array {
  const knots = new Float32Array(cells);
  for (let index = 0; index < cells; index += 1) knots[index] = random();
  const out = new Float32Array(length);
  for (let y = 0; y < length; y += 1) {
    const t = (y / length) * cells;
    const cell = Math.floor(t);
    const f = t - cell;
    const s = f * f * (3 - 2 * f);
    const a = knots[cell % cells] ?? 0;
    const b = knots[(cell + 1) % cells] ?? 0;
    out[y] = a + (b - a) * s;
  }
  return out;
}

interface Tuft {
  readonly center: number;
  readonly width: number;
  readonly drift: Float32Array;
}

function buildBristleField(): WetPaperBristleField {
  const width = WET_PAPER_BRISTLE_WIDTH;
  const height = WET_PAPER_BRISTLE_HEIGHT;
  const random = createWetPaperMulberry32(BRISTLE_SEED);
  const gauss = (): number => {
    let sum = 0;
    for (let index = 0; index < 4; index += 1) sum += random();
    return (sum - 2) / 0.577;
  };
  const tufts: Tuft[] = [];
  for (let k = 0; k < TUFT_COUNT; k += 1) {
    const driftNoise = periodicNoise(random, 3 + Math.floor(random() * 4), height);
    const amplitude = (3 + random() * 7) * (width / 320);
    const drift = new Float32Array(height);
    for (let y = 0; y < height; y += 1) drift[y] = ((driftNoise[y] ?? 0.5) - 0.5) * 2 * amplitude;
    tufts.push({
      center: ((k + 0.5) / TUFT_COUNT) * width + (random() - 0.5) * (width / TUFT_COUNT) * 0.5,
      width: (width / TUFT_COUNT) * (0.3 + random() * 0.25),
      drift,
    });
  }
  const bristle = new Float32Array(width * height);
  const tuft = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let k = 0; k < TUFT_COUNT; k += 1) {
        const clump = tufts[k] as Tuft;
        const d = x - (clump.center + (clump.drift[y] ?? 0));
        sum += detExp((-d * d) / (2 * clump.width * clump.width));
      }
      tuft[row + x] = sum;
    }
  }
  const twoPi = 6.2831853;
  for (let n = 0; n < BRISTLE_COUNT; n += 1) {
    const clump = tufts[Math.floor(random() * TUFT_COUNT)] as Tuft;
    const x0 = clampNumber(clump.center + gauss() * clump.width * 0.75, 1, width - 2);
    const xn = (x0 / width) * 2 - 1;
    const cap = (0.45 + 0.55 * random()) * (1 - 0.5 * xn * xn);
    const f1 = 1 + Math.floor(random() * 3);
    const f2 = 4 + Math.floor(random() * 5);
    const scale = width / 320;
    const a1 = (0.5 + random() * 2.5) * scale;
    const a2 = (0.3 + random() * 1.2) * scale;
    const p1 = random() * twoPi;
    const p2 = random() * twoPi;
    const breaks = periodicNoise(random, 8 + Math.floor(random() * 48), height);
    const fineBreaks = periodicNoise(random, 60 + Math.floor(random() * 140), height);
    const sigma = (0.6 + random() * 0.8) * Math.max(0.6, scale * 1.6);
    const reach = Math.ceil(sigma * 3);
    const inv = 1 / (2 * sigma * sigma);
    for (let y = 0; y < height; y += 1) {
      const t = (y / height) * twoPi;
      const x = x0 + (clump.drift[y] ?? 0) + a1 * detSin(f1 * t + p1) + a2 * detSin(f2 * t + p2);
      const value = cap * (0.3 + 0.7 * (breaks[y] ?? 0)) * (0.8 + 0.2 * (fineBreaks[y] ?? 0));
      const xa = Math.max(0, Math.floor(x - reach));
      const xb = Math.min(width - 1, Math.ceil(x + reach));
      const row = y * width;
      for (let xi = xa; xi <= xb; xi += 1) {
        const d = xi - x;
        const contribution = value * detExp(-d * d * inv);
        if (contribution > (bristle[row + xi] ?? 0)) bristle[row + xi] = contribution;
      }
    }
  }
  for (let index = 0; index < bristle.length; index += 1) {
    bristle[index] = Math.max(bristle[index] ?? 0, random() * 0.05);
  }
  equalizeInPlace(bristle);
  equalizeInPlace(tuft);
  return Object.freeze({ width, height, bristle, tuft });
}

let bristleFieldMemo: WetPaperBristleField | null = null;

/** 강모 지도(모듈당 한 번, 결정적). */
export function wetPaperBristleField(): WetPaperBristleField {
  bristleFieldMemo ??= buildBristleField();
  return bristleFieldMemo;
}

export interface WetPaperBristleSample {
  bristle: number;
  tuft: number;
}

/**
 * u ∈ [−1, 1](붓 폭 가로), t(획 방향, 주기 1)에서 쌍선형 샘플.
 */
export function sampleWetPaperBristle(
  field: WetPaperBristleField,
  u: number,
  t: number,
  out: WetPaperBristleSample,
): void {
  const x = clampNumber((u * 0.5 + 0.5) * (field.width - 1), 0, field.width - 1);
  const wrapped = t - Math.floor(t);
  const y = wrapped * field.height;
  const x0 = Math.min(field.width - 2, Math.floor(x));
  const fx = x - x0;
  const yi = Math.floor(y);
  const fy = y - yi;
  const y0 = yi % field.height;
  const y1 = (yi + 1) % field.height;
  const i00 = y0 * field.width + x0;
  const i01 = y1 * field.width + x0;
  const b00 = field.bristle[i00] ?? 0;
  const b10 = field.bristle[i00 + 1] ?? 0;
  const b01 = field.bristle[i01] ?? 0;
  const b11 = field.bristle[i01 + 1] ?? 0;
  const g00 = field.tuft[i00] ?? 0;
  const g10 = field.tuft[i00 + 1] ?? 0;
  const g01 = field.tuft[i01] ?? 0;
  const g11 = field.tuft[i01 + 1] ?? 0;
  const bTop = b00 + (b10 - b00) * fx;
  const bBottom = b01 + (b11 - b01) * fx;
  const gTop = g00 + (g10 - g00) * fx;
  const gBottom = g01 + (g11 - g01) * fx;
  out.bristle = bTop + (bBottom - bTop) * fy;
  out.tuft = gTop + (gBottom - gTop) * fy;
}

/**
 * Sumi `FS_DAB` 본체 마스크의 문턱 수식(MIT 이식):
 *   thr   = −0.15 + 1.05·smoothstep(0.12, 0.95, dryness) − clamp(press − 0.85, −0.45, 0.8)·0.4·(0.4 + dryness)
 *           + smoothstep(0.55, 1, |u|)·dryness·0.35      (가장자리 강모가 먼저 마른다)
 *   streak = smoothstep(thr − 0.05, thr + 0.05, 강모 높이)
 *   split  = smoothstep(sThr − 0.1, sThr + 0.1, 다발), sThr = dryness·0.5 + max(press − 1.1, 0)·0.3 − 0.12
 *   tooth  = smoothstep(gThr − 0.12, gThr + 0.04, 종이 요철), gThr = smoothstep(0.35, 1, dryness)·clamp(1.35 − 0.6·press, 0.15, 1)
 * 반환값 = streak·split·tooth ∈ [0, 1].
 */
export function wetPaperDryBrushMask(
  sample: WetPaperBristleSample,
  load: number,
  pressure: number,
  u: number,
  paperHeight: number,
): number {
  const dryness = clamp01(1 - load);
  const press = pressure;
  let threshold = -0.15 + 1.05 * smoothstep(0.12, 0.95, dryness);
  threshold -= clampNumber(press - 0.85, -0.45, 0.8) * 0.4 * (0.4 + dryness);
  threshold += smoothstep(0.55, 1, Math.abs(u)) * dryness * 0.35;
  const streak = smoothstep(threshold - 0.05, threshold + 0.05, sample.bristle);
  const splitThreshold = dryness * 0.5 + Math.max(press - 1.1, 0) * 0.3 - 0.12;
  const split = smoothstep(splitThreshold - 0.1, splitThreshold + 0.1, sample.tuft);
  const grainThreshold = smoothstep(0.35, 1, dryness) * clampNumber(1.35 - 0.6 * press, 0.15, 1);
  const tooth = smoothstep(grainThreshold - 0.12, grainThreshold + 0.04, paperHeight);
  return streak * split * tooth;
}
