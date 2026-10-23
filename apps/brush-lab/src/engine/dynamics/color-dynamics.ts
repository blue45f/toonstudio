import { premultiply, srgbToLinear } from "../core/color";
import { kmMixRgb } from "../pigment/kubelka-munk";

import type { Pcg32 } from "../core/rng";
import type { Rgba } from "../core/types";

export interface ColorDynamicsSpec {
  /** 색상 지터(0..1, 1 = ±180°). */
  hueJitter: number;
  satJitter: number;
  valJitter: number;
  /** true면 dab마다, false면 획당 1회. */
  perDab: boolean;
  /** 합성 시 KM 혼색 사용(베타). */
  kmMixing: boolean;
}

export const NO_COLOR_DYNAMICS: ColorDynamicsSpec = {
  hueJitter: 0,
  satJitter: 0,
  valJitter: 0,
  perDab: false,
  kmMixing: false,
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** sRGB → HSV(h 0..1). */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-9) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  const s = max > 1e-9 ? d / max : 0;
  return [h, s, max];
}

/** HSV(h 0..1) → sRGB. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = ((h % 1) + 1) % 1;
  const i = Math.floor(hh * 6);
  const f = hh * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

/**
 * dab 색. 입력은 sRGB straight, 출력은 선형 premultiplied.
 * 지터 값과 무관하게 항상 난수 3개를 소비한다(수열 위치 고정).
 */
export function dabColor(
  base: Rgba,
  spec: ColorDynamicsSpec,
  rng: Pcg32,
): [number, number, number, number] {
  const u1 = rng.nextF32();
  const u2 = rng.nextF32();
  const u3 = rng.nextF32();
  let [r, g, b] = [base[0], base[1], base[2]];
  if (spec.hueJitter > 0 || spec.satJitter > 0 || spec.valJitter > 0) {
    const [h, s, v] = rgbToHsv(r, g, b);
    const h2 = h + (u1 * 2 - 1) * spec.hueJitter * 0.5;
    const s2 = clamp01(s + (u2 * 2 - 1) * spec.satJitter);
    const v2 = clamp01(v + (u3 * 2 - 1) * spec.valJitter);
    [r, g, b] = hsvToRgb(h2, s2, v2);
  }
  return premultiply([srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), clamp01(base[3])]);
}

export interface PigmentColorDynamicsOptions {
  /** 필압 기반 색온도 이동 (-1: 한색 울트라마린, +1: 난색 카드뮴 옐로). */
  readonly temperatureShift?: number;
  /** 보조 안료 색상 (sRGB 0..1). 지정 시 잠재 안료 공간에서 혼합. */
  readonly secondaryPigment?: readonly [number, number, number];
  /** 보조 안료 혼합 비중 (0..1). */
  readonly secondaryMix?: number;
  /** 티타늄 화이트 명도 리프트 (0..1). */
  readonly titaniumLift?: number;
}

const WARM_CADMIUM_ANCHOR: readonly [number, number, number] = [0.98, 0.82, 0.06];
const COOL_ULTRAMARINE_ANCHOR: readonly [number, number, number] = [0.06, 0.24, 0.88];
const TITANIUM_WHITE_ANCHOR: readonly [number, number, number] = [0.99, 0.99, 0.98];

function mixPigmentChromaPreserving(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): readonly [number, number, number] {
  const ratio = clamp01(t);
  const km = kmMixRgb(a, b, ratio);
  const yellowA = Math.max(0, Math.min(a[0], a[1]) - a[2]);
  const yellowB = Math.max(0, Math.min(b[0], b[1]) - b[2]);
  const blueA = Math.max(0, a[2] - a[0] * 0.65);
  const blueB = Math.max(0, b[2] - b[0] * 0.65);
  const cross = (yellowA * blueB + yellowB * blueA) * 4 * ratio * (1 - ratio);
  return [
    clamp01(km[0] * (1 - cross * 0.42)),
    clamp01(km[1] + cross * 0.34),
    clamp01(km[2] * (1 - cross * 0.36)),
  ];
}

/**
 * Kubelka-Munk 감산 혼색 및 보색 파장 보존 기반 다이나믹스 변조.
 * 일반 RGB/HSV 보간 시 발생하는 채도 죽음(회색 탁색화) 없이,
 * 난색·한색 온도 이동 및 보조 안료 혼합을 물리적 감산 혼색 궤적으로 계산한다.
 */
export function applyPigmentColorDynamics(
  baseRgb: readonly [number, number, number],
  options: PigmentColorDynamicsOptions,
): readonly [number, number, number] {
  let current: readonly [number, number, number] = [
    clamp01(baseRgb[0]),
    clamp01(baseRgb[1]),
    clamp01(baseRgb[2]),
  ];

  const secondaryMix = clamp01(options.secondaryMix ?? 0);
  if (options.secondaryPigment && secondaryMix > 0) {
    current = mixPigmentChromaPreserving(current, options.secondaryPigment, secondaryMix);
  }

  const temp = Math.max(-1, Math.min(1, options.temperatureShift ?? 0));
  if (Math.abs(temp) > 1e-4) {
    const anchor = temp > 0 ? WARM_CADMIUM_ANCHOR : COOL_ULTRAMARINE_ANCHOR;
    current = mixPigmentChromaPreserving(current, anchor, Math.abs(temp) * 0.45);
  }

  const lift = clamp01(options.titaniumLift ?? 0);
  if (lift > 1e-4) {
    current = kmMixRgb(current, TITANIUM_WHITE_ANCHOR, lift * 0.65);
  }

  return current;
}
