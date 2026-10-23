import { hashNoise2D } from "../core/rng";

import type { SamplingFilter } from "./sampling";

/**
 * 절차적 종이. 주기 fBm(격자 좌표 wrap)으로 타일러블을 보장한다.
 * GPU 규약: rgba8unorm(R = dir/2π, G = bump, B = absorb) 반복 샘플.
 */
export interface PaperSpec {
  enabled: boolean;
  /** 종이 텍셀 1개가 덮는 문서 px(1 = 1:1). */
  scale: number;
  rotationRad: number;
  /** 요철 대비 0..1. */
  roughness: number;
  /** 흡수율 스케일 0..1. */
  absorbency: number;
  /** 압력이 요철을 눌러 메우는 정도 0..1. */
  pressureInfluence: number;
  /** 2px 결(tooth) 진폭 0..1. 0이면 기존 출력과 비트 동일. */
  tooth: number;
  filter: SamplingFilter;
  seed: number;
}

export interface PaperField {
  size: number;
  /** 섬유 방향 각도 0..2π. */
  direction: Float32Array;
  /** 요철 0..1. */
  bump: Float32Array;
  /** 흡수율 0..1. */
  absorb: Float32Array;
}

export const DEFAULT_PAPER_SPEC: PaperSpec = {
  enabled: true,
  scale: 1,
  rotationRad: 0,
  roughness: 0.5,
  absorbency: 0.5,
  pressureInfluence: 0.5,
  tooth: 0,
  filter: "bilinear",
  seed: 7,
};

const f = Math.fround;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 주기 period(격자 셀 수)로 wrap하는 값 노이즈. x,y는 격자 단위. */
export function periodicValueNoise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const wrap = (i: number): number => ((i % period) + period) % period;
  const x0 = wrap(ix);
  const x1 = wrap(ix + 1);
  const y0 = wrap(iy);
  const y1 = wrap(iy + 1);
  const n00 = hashNoise2D(x0, y0, seed);
  const n10 = hashNoise2D(x1, y0, seed);
  const n01 = hashNoise2D(x0, y1, seed);
  const n11 = hashNoise2D(x1, y1, seed);
  const sx = smooth(fx);
  const sy = smooth(fy);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sy;
}

/** 주기 fBm [0,1]. u,v ∈ [0,1) 타일 좌표. basePeriod = 첫 옥타브 셀 수. */
export function periodicFbm(
  u: number,
  v: number,
  basePeriod: number,
  octaves: number,
  seed: number,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let period = basePeriod;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * periodicValueNoise(u * period, v * period, period, (seed + o * 0x1000193) >>> 0);
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

/** 종이 필드 생성. 같은 spec.seed·size면 바이트 동일. */
export function generatePaper(spec: PaperSpec, size = 256): PaperField {
  const direction = new Float32Array(size * size);
  const bump = new Float32Array(size * size);
  const absorb = new Float32Array(size * size);
  const seed = spec.seed >>> 0;
  const contrast = 0.5 + spec.roughness;
  const tooth = clamp01(spec.tooth ?? 0);
  const toothSeed = (seed ^ 0x9e3779b9) >>> 0;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const i = y * size + x;
      const b = periodicFbm(u, v, 8, 5, seed);
      const t = tooth > 0 ? periodicValueNoise(u * 128, v * 128, 128, toothSeed) : 0.5;
      bump[i] = f(clamp01(0.5 + (b - 0.5) * contrast + (t - 0.5) * tooth));
      const a = periodicFbm(u, v, 4, 3, (seed + 0x51ed270b) >>> 0);
      absorb[i] = f(clamp01((0.3 + 0.7 * a) * (0.5 + 0.5 * spec.absorbency)));
      const d = periodicFbm(u, v, 2, 2, (seed + 0x2545f491) >>> 0);
      direction[i] = f(d * Math.PI * 2);
    }
  }
  return { size, direction, bump, absorb };
}

function sampleChannel(
  data: Float32Array,
  size: number,
  tx: number,
  ty: number,
  bilinear: boolean,
): number {
  const wrap = (i: number): number => ((i % size) + size) % size;
  if (!bilinear) {
    return data[wrap(Math.floor(ty)) * size + wrap(Math.floor(tx))] ?? 0;
  }
  const fx = tx - 0.5;
  const fy = ty - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const sx = fx - x0;
  const sy = fy - y0;
  const xa = wrap(x0);
  const xb = wrap(x0 + 1);
  const ya = wrap(y0);
  const yb = wrap(y0 + 1);
  const a = data[ya * size + xa] ?? 0;
  const b = data[ya * size + xb] ?? 0;
  const c = data[yb * size + xa] ?? 0;
  const d = data[yb * size + xb] ?? 0;
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

/** 문서 좌표(px)에서 종이 샘플. 반복(wrap) 샘플, nearest/bilinear(그 외 필터는 bilinear). */
export function samplePaper(
  field: PaperField,
  x: number,
  y: number,
  spec: PaperSpec,
): { dir: number; bump: number; absorb: number } {
  const scale = spec.scale > 0 ? spec.scale : 1;
  const c = Math.cos(spec.rotationRad);
  const s = Math.sin(spec.rotationRad);
  const tx = (x * c - y * s) / scale;
  const ty = (x * s + y * c) / scale;
  const bilinear = spec.filter !== "nearest";
  // 방향은 각도라 보간하지 않고 최근접을 쓴다(2π 경계 평균 오류 방지).
  const dir = sampleChannel(field.direction, field.size, tx, ty, false) + spec.rotationRad;
  return {
    dir,
    bump: sampleChannel(field.bump, field.size, tx, ty, bilinear),
    absorb: sampleChannel(field.absorb, field.size, tx, ty, bilinear),
  };
}

export interface PaperToothContactSample {
  /** 건식·습식 매체가 종이 요철 봉우리(peak)에 걸려 묻어나는 유효 접촉 불투명도 (0..1). */
  readonly contactAlpha: number;
  /** 종이 골짜기(valley)에 침전·고이는 안료 보유량 (0..1). */
  readonly valleyRetention: number;
  /** 섬유 방향(dir)과 스트로크 진행 각도(strokeAngleRad) 간 이방성 마찰 계수 (0..1). */
  readonly anisotropicDrag: number;
}

/**
 * 종이 요철(Tooth) 물리 접촉 모델:
 * 낮은 필압에서는 종이 봉우리(bump 높은 곳)만 스치며 건식 갈필(peak-skimming) 질감을 만들고,
 * 높은 필압에서는 `pressureInfluence`에 따라 골짜기까지 메워지며(valley-filling) 농도가 포화된다.
 */
export function evaluatePaperToothContact(
  field: PaperField,
  x: number,
  y: number,
  pressure: number,
  spec: PaperSpec,
  strokeAngleRad = 0,
): PaperToothContactSample {
  if (!spec.enabled) {
    return { contactAlpha: 1, valleyRetention: 0, anisotropicDrag: 0.5 };
  }
  const sample = samplePaper(field, x, y, spec);
  const p = clamp01(pressure);
  const influence = clamp01(spec.pressureInfluence);
  // 낮은 압력일수록 문턱값(threshold)이 높아 봉우리 상단만 접촉
  const threshold = clamp01((1 - p * influence) * (0.35 + spec.roughness * 0.45));
  const rawContact = (sample.bump - threshold * 0.65) / Math.max(0.15, 1 - threshold * 0.55);
  const contactAlpha = f(clamp01(rawContact * (0.45 + 0.55 * p)));
  const valleyRetention = f(clamp01((1 - sample.bump) * sample.absorb * (0.35 + 0.65 * p)));
  const crossFiber = Math.abs(Math.sin(strokeAngleRad - sample.dir));
  const anisotropicDrag = f(clamp01(0.25 + crossFiber * 0.55 + spec.roughness * 0.2));

  return {
    contactAlpha,
    valleyRetention,
    anisotropicDrag,
  };
}
