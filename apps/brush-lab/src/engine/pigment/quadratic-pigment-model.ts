/**
 * 로컬 7채널 이차 안료 실험 모델.
 * 기존 Wave 36의 수식·상수·연산 순서·clamp·반올림을 그대로 분리했다.
 * 계수 원산지와 외부 구현 호환성은 미확인이다. 운영 승격 근거로 쓰지 않는다.
 * 관찰 범위와 명칭·JSON 전환은 docs/quadratic-pigment-model-2026-10-29.md에 기록한다.
 */
import type { Rgb } from "../core/types";

export const QUADRATIC_PIGMENT_MODEL = Object.freeze({
  id: "quadratic-pigment-7d-local",
  degree: 2,
  latentChannels: 7,
  coefficientOrigin: "unverified",
  maturity: "local-prototype",
  servicePromotionAllowed: false,
} as const);

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export type QuadraticPigmentLatent7 = readonly [number, number, number, number, number, number, number];

export interface QuadraticPigmentMixResult {
  readonly latentA: QuadraticPigmentLatent7;
  readonly latentB: QuadraticPigmentLatent7;
  readonly latentMixed: QuadraticPigmentLatent7;
  readonly mixedRgb01: Rgb;
  readonly endpointIdentityError: number;
}

function evalPigmentPolynomial4(c0: number, c1: number, c2: number): Rgb {
  // 황색·마젠타·청색·백색 4기저의 로컬 이차 다항식. 계수 원산지는 미확인이다.
  const c3 = Math.max(0, 1 - c0 - c1 - c2);
  const r =
    0.99 * c0 * c0 +
    0.52 * c1 * c1 +
    0.08 * c2 * c2 +
    0.98 * c3 * c3 +
    1.85 * c0 * c3 +
    1.12 * c1 * c3 +
    0.22 * c2 * c3 +
    1.62 * c0 * c1 + // 황색·마젠타 교차항
    0.18 * c0 * c2 +
    0.34 * c1 * c2;
  const g =
    0.92 * c0 * c0 +
    0.04 * c1 * c1 +
    0.12 * c2 * c2 +
    0.98 * c3 * c3 +
    1.78 * c0 * c3 +
    0.24 * c1 * c3 +
    0.42 * c2 * c3 +
    0.58 * c0 * c1 +
    1.48 * c0 * c2 + // 황색·청색 교차항
    0.06 * c1 * c2;
  const b =
    0.03 * c0 * c0 +
    0.28 * c1 * c1 +
    0.58 * c2 * c2 +
    0.98 * c3 * c3 +
    0.16 * c0 * c3 +
    0.82 * c1 * c3 +
    1.38 * c2 * c3 +
    0.05 * c0 * c1 +
    0.36 * c0 * c2 +
    0.96 * c1 * c2; // 마젠타·청색 교차항
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b) };
}

export function rgbToQuadraticPigmentLatent7(rgb: Rgb): QuadraticPigmentLatent7 {
  const r = clamp01(rgb.r);
  const g = clamp01(rgb.g);
  const b = clamp01(rgb.b);
  const white = Math.min(r, g, b);
  const yellow = Math.max(0, Math.min(r, g) - white);
  const magenta = Math.max(0, r - Math.min(r, g));
  const blue = Math.max(0, b - white);
  const sum = yellow + magenta + blue + white + 1e-6;
  const c0 = yellow / sum;
  const c1 = magenta / sum;
  const c2 = blue / sum;
  const c3 = white / sum;
  const poly = evalPigmentPolynomial4(c0, c1, c2);
  // 기존 연산 순서와 3채널 RGB 잔차를 유지한다. 복원 출력은 소수점 넷째 자리로 반올림한다.
  const dr = r - poly.r;
  const dg = g - poly.g;
  const db = b - poly.b;
  return [c0, c1, c2, c3, dr, dg, db];
}

export function quadraticPigmentLatent7ToRgb(latent: QuadraticPigmentLatent7): Rgb {
  const poly = evalPigmentPolynomial4(latent[0], latent[1], latent[2]);
  return {
    r: Number(clamp01(poly.r + latent[4]).toFixed(4)),
    g: Number(clamp01(poly.g + latent[5]).toFixed(4)),
    b: Number(clamp01(poly.b + latent[6]).toFixed(4)),
  };
}

/** 4기저 농도와 RGB 잔차를 선형 보간하는 로컬 7채널 실험 모델. */
export function evaluateQuadraticPigmentMix(
  colorA: Rgb,
  colorB: Rgb,
  t01: number,
): QuadraticPigmentMixResult {
  const t = clamp01(t01);
  const latentA = rgbToQuadraticPigmentLatent7(colorA);
  const latentB = rgbToQuadraticPigmentLatent7(colorB);
  const latentMixed: QuadraticPigmentLatent7 = [
    (1 - t) * latentA[0] + t * latentB[0],
    (1 - t) * latentA[1] + t * latentB[1],
    (1 - t) * latentA[2] + t * latentB[2],
    (1 - t) * latentA[3] + t * latentB[3],
    (1 - t) * latentA[4] + t * latentB[4],
    (1 - t) * latentA[5] + t * latentB[5],
    (1 - t) * latentA[6] + t * latentB[6],
  ];
  const mixedRgb01 = quadraticPigmentLatent7ToRgb(latentMixed);
  const recA = quadraticPigmentLatent7ToRgb(latentA);
  const recB = quadraticPigmentLatent7ToRgb(latentB);
  const endpointIdentityError = Number(
    (
      Math.abs(recA.r - clamp01(colorA.r)) +
      Math.abs(recA.g - clamp01(colorA.g)) +
      Math.abs(recA.b - clamp01(colorA.b)) +
      Math.abs(recB.r - clamp01(colorB.r)) +
      Math.abs(recB.g - clamp01(colorB.g)) +
      Math.abs(recB.b - clamp01(colorB.b))
    ).toFixed(6),
  );
  return {
    latentA,
    latentB,
    latentMixed,
    mixedRgb01,
    endpointIdentityError,
  };
}
