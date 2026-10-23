/**
 * Mixbox(CC BY-NC) 호환 혼색 수식 개념 재구현(원본 코드 미참조).
 * 우리 KM mixer(km-mix.ts의 kmMixRgb, kubelka-munk.ts)를 기반으로 mixboxLerp를 제공한다.
 *
 * 라이선스 정책상 mixbox 패키지 자체는 import·번들 금지(license-policy.md 4.5절,
 * BANNED_PACKAGES); 개념·수식 아이디어만 사용한다. 새로운 컬러 믹서는 만들지 않는다.
 *
 * 모든 연산은 Math.fround로 f32 정확도를 유지한다(km-mix.ts 관례).
 */

import { SumiError } from "../core/errors";

import {
  kmMixRgb,
  ksRatioToReflectance,
  mixKs,
  reflectanceToKsRatio,
  type KS,
} from "./kubelka-munk";

/** 선형 sRGB 0..1 straight RGBA. */
export type RGBA = readonly [number, number, number, number];

/**
 * 7채널 잠재 안료 표현(개념 재구현):
 * [0..3]: 4원색 기저 안료 농도(White, Hansa Yellow, Phthalo Blue, Quinacridone Magenta), 합 = 1
 * [4..6]: 3채널 선형 RGB 잔차(residual R, G, B) — 왕복 무손실 복원 보장
 */
export type MixboxLatentVector = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface WeightedPigmentEntry {
  readonly color: RGBA;
  readonly weight: number;
}

const f32 = Math.fround;

const isValidAlpha = (alpha: number): boolean =>
  Number.isFinite(alpha) && alpha >= 0 && alpha <= 1;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * 4원색 기저 안료의 Kubelka-Munk 흡수(K)·산란(S) 스펙트럼 프록시(3채널 선형 RGB).
 * 자체 물리 모델 상수이며 외부 라이브러리 테이블을 포함하지 않는다.
 */
const PRIMARY_PIGMENTS_KS: readonly [KS, KS, KS, KS] = [
  // Titanium White: 낮은 흡수, 높은 산란
  { k: [0.008, 0.008, 0.01], s: [1.0, 1.0, 0.98] },
  // Hansa Yellow: R·G 고반사, B 강흡수(청색과 혼합 시 녹색 대역 보존)
  { k: [0.015, 0.028, 1.85], s: [0.62, 0.58, 0.08] },
  // Phthalo Blue: R 강흡수, G 중저흡수(청록 투과창), B 저흡수
  { k: [1.95, 0.24, 0.04], s: [0.06, 0.38, 0.65] },
  // Quinacridone Magenta: G 강흡수, R·B 반사
  { k: [0.045, 1.75, 0.22], s: [0.55, 0.07, 0.42] },
] as const;

/**
 * Saunderson 표면 반사 보정(공기-도막 굴절 계면).
 * R_meas = k1 + ((1 - k1) * (1 - k2) * R_int) / (1 - k2 * R_int)
 */
export function saundersonCorrect(
  internalReflectance: number,
  k1 = 0.035,
  k2 = 0.42,
): number {
  const r = clamp01(internalReflectance);
  const c1 = clamp01(k1);
  const c2 = Math.min(0.95, clamp01(k2));
  const denom = Math.max(1e-6, 1 - c2 * r);
  return f32(clamp01(c1 + ((1 - c1) * (1 - c2) * r) / denom));
}

/**
 * 역 Saunderson 보정: 측정 반사율 R_meas에서 도막 내부 반사율 R_int를 역산한다.
 */
export function saundersonInverse(
  measuredReflectance: number,
  k1 = 0.035,
  k2 = 0.42,
): number {
  const rm = clamp01(measuredReflectance);
  const c1 = clamp01(k1);
  const c2 = Math.min(0.95, clamp01(k2));
  const num = Math.max(0, rm - c1);
  const denom = Math.max(1e-6, (1 - c1) * (1 - c2) + c2 * num);
  return f32(clamp01(num / denom));
}

/**
 * 4원색 농도(c0..c3)로부터 KM 혼합 반사율 RGB를 합성한다.
 */
function evaluatePrimaryMixRgb(
  c0: number,
  c1: number,
  c2: number,
  c3: number,
): [number, number, number] {
  const w01 = c0 + c1;
  const ks01 =
    w01 > 1e-6
      ? mixKs(PRIMARY_PIGMENTS_KS[0], PRIMARY_PIGMENTS_KS[1], c0, c1)
      : PRIMARY_PIGMENTS_KS[0];
  const w23 = c2 + c3;
  const ks23 =
    w23 > 1e-6
      ? mixKs(PRIMARY_PIGMENTS_KS[2], PRIMARY_PIGMENTS_KS[3], c2, c3)
      : PRIMARY_PIGMENTS_KS[2];
  const ks = mixKs(ks01, ks23, w01, w23);
  const r0 = ksRatioToReflectance(ks.s[0] > 0 ? ks.k[0] / ks.s[0] : 1e6);
  const r1 = ksRatioToReflectance(ks.s[1] > 0 ? ks.k[1] / ks.s[1] : 1e6);
  const r2 = ksRatioToReflectance(ks.s[2] > 0 ? ks.k[2] / ks.s[2] : 1e6);
  return [r0, r1, r2];
}

/**
 * 선형 RGBA 색상을 7채널 잠재 안료 벡터(4 안료 농도 + 3 잔차)로 분해한다.
 */
export function rgbToMixboxLatent(color: RGBA): MixboxLatentVector {
  if (!isValidAlpha(color[3])) {
    throw new SumiError("md-invalid-alpha", "알파는 [0, 1]이어야 한다", {
      alpha: color[3],
    });
  }
  const r = clamp01(color[0]);
  const g = clamp01(color[1]);
  const b = clamp01(color[2]);

  // K/S 비율 공간에서 백색·황색·청색·마젠타 기여도를 추정한다.
  const qr = reflectanceToKsRatio(Math.max(1e-3, r));
  const qg = reflectanceToKsRatio(Math.max(1e-3, g));
  const qb = reflectanceToKsRatio(Math.max(1e-3, b));

  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // 황색은 청색 흡수(qb)가 크고 적·녹 반사가 높을 때 증가
  const rawYellow = Math.max(0, Math.min(r, g) * (1 - b) * 1.45 + 0.08 * Math.log1p(qb));
  // 청색은 적색 흡수(qr)가 크고 청·녹 반사가 남을 때 증가
  const rawBlue = Math.max(0, (1 - r) * Math.max(b, g * 0.75) * 1.45 + 0.08 * Math.log1p(qr));
  // 마젠타는 녹색 흡수(qg)가 크고 적색 반사가 높을 때 증가
  const rawMagenta = Math.max(0, (1 - g) * Math.max(r, b * 0.65) * 1.35 + 0.08 * Math.log1p(qg));
  // 백색은 명도와 최소 채널 반사율에 비례
  const rawWhite = Math.max(0.02, lum * 0.85 + Math.min(r, g, b) * 0.65);

  const sum = rawWhite + rawYellow + rawBlue + rawMagenta;
  const c0 = f32(rawWhite / sum);
  const c1 = f32(rawYellow / sum);
  const c2 = f32(rawBlue / sum);
  const c3 = f32(Math.max(0, 1 - c0 - c1 - c2));

  const [baseR, baseG, baseB] = evaluatePrimaryMixRgb(c0, c1, c2, c3);
  const resR = f32(r - baseR);
  const resG = f32(g - baseG);
  const resB = f32(b - baseB);

  return [c0, c1, c2, c3, resR, resG, resB];
}

/**
 * 7채널 잠재 안료 벡터를 선형 RGBA로 복원한다.
 */
export function mixboxLatentToRgb(latent: MixboxLatentVector, alpha = 1): RGBA {
  if (!isValidAlpha(alpha)) {
    throw new SumiError("md-invalid-alpha", "알파는 [0, 1]이어야 한다", { alpha });
  }
  const c0 = Math.max(0, latent[0]);
  const c1 = Math.max(0, latent[1]);
  const c2 = Math.max(0, latent[2]);
  const c3 = Math.max(0, latent[3]);
  const sum = c0 + c1 + c2 + c3;
  const n0 = sum > 1e-6 ? c0 / sum : 0.25;
  const n1 = sum > 1e-6 ? c1 / sum : 0.25;
  const n2 = sum > 1e-6 ? c2 / sum : 0.25;
  const n3 = sum > 1e-6 ? c3 / sum : 0.25;

  const [baseR, baseG, baseB] = evaluatePrimaryMixRgb(n0, n1, n2, n3);
  return [
    f32(clamp01(baseR + latent[4])),
    f32(clamp01(baseG + latent[5])),
    f32(clamp01(baseB + latent[6])),
    f32(alpha),
  ];
}

/**
 * Mixbox 호환 래프 컬러 보간.
 * 색상은 KM mixer(kmMixRgb, K/S 공간)를 거쳐 혼합되고, 알파는 선형 보간된다.
 * t는 [0, 1]로 클램프된다. 알파가 [0, 1]을 벗어나면 SumiError("md-invalid-alpha")를 던진다.
 */
export function mixboxLerp(colorA: RGBA, colorB: RGBA, t: number): RGBA {
  if (!isValidAlpha(colorA[3]) || !isValidAlpha(colorB[3])) {
    throw new SumiError("md-invalid-alpha", "알파는 [0, 1]이어야 한다", {
      alphaA: colorA[3],
      alphaB: colorB[3],
    });
  }
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  const [r, g, b] = kmMixRgb(
    [colorA[0], colorA[1], colorA[2]],
    [colorB[0], colorB[1], colorB[2]],
    tt,
  );
  return [
    f32(r),
    f32(g),
    f32(b),
    f32(colorA[3] + (colorB[3] - colorA[3]) * tt),
  ];
}

/**
 * 7채널 잠재 안료 공간 기반 채도 보존 보간(Chroma-preserving latent pigment lerp).
 * 양 끝점(t=0, t=1)과 동일색(colorA=colorB)에서는 입력 색상을 정확히 보존하며,
 * 중간 혼합(예: 청색 + 황색 → 에메랄드/녹색)에서 KM 스펙트럼 투과창과 잠재 안료를 결합해
 * 무채색 탁화 현상 없이 높은 채도를 유지한다.
 */
export function mixboxLerpLatent(
  colorA: RGBA,
  colorB: RGBA,
  t: number,
  chromaRetention = 0.35,
): RGBA {
  if (!isValidAlpha(colorA[3]) || !isValidAlpha(colorB[3])) {
    throw new SumiError("md-invalid-alpha", "알파는 [0, 1]이어야 한다", {
      alphaA: colorA[3],
      alphaB: colorB[3],
    });
  }
  const tt = clamp01(t);
  const alpha = f32(colorA[3] + (colorB[3] - colorA[3]) * tt);
  if (tt === 0) {
    return [f32(colorA[0]), f32(colorA[1]), f32(colorA[2]), alpha];
  }
  if (tt === 1) {
    return [f32(colorB[0]), f32(colorB[1]), f32(colorB[2]), alpha];
  }
  if (
    colorA[0] === colorB[0] &&
    colorA[1] === colorB[1] &&
    colorA[2] === colorB[2]
  ) {
    return [f32(colorA[0]), f32(colorA[1]), f32(colorA[2]), alpha];
  }

  const latA = rgbToMixboxLatent(colorA);
  const latB = rgbToMixboxLatent(colorB);
  const wa = 1 - tt;
  const wb = tt;

  // 중간 구간에서 잔차의 선형 상쇄로 인한 탁화를 줄이고 안료 기저의 순색 투과창을 강조한다.
  const boost = clamp01(chromaRetention);
  const midEnvelope = 4 * wa * wb; // t=0.5에서 1, 양끝에서 0
  const residualAtten = 1 - boost * 0.5 * midEnvelope;

  const mixedLatent: MixboxLatentVector = [
    f32(latA[0] * wa + latB[0] * wb),
    f32(latA[1] * wa + latB[1] * wb),
    f32(latA[2] * wa + latB[2] * wb),
    f32(latA[3] * wa + latB[3] * wb),
    f32((latA[4] * wa + latB[4] * wb) * residualAtten),
    f32((latA[5] * wa + latB[5] * wb) * residualAtten),
    f32((latA[6] * wa + latB[6] * wb) * residualAtten),
  ];

  const latentRgb = mixboxLatentToRgb(mixedLatent, alpha);
  const kmRgb = mixboxLerp(colorA, colorB, tt);

  // 청색+황색 교차량(complementary pigment cross-term)이 클수록 녹색 투과 대역을 보강
  const yellowBlueCross =
    (latA[1] * latB[2] + latA[2] * latB[1]) * midEnvelope * boost;

  const r = clamp01(kmRgb[0] * (1 - boost) + latentRgb[0] * boost - yellowBlueCross * 0.12);
  const g = clamp01(kmRgb[1] * (1 - boost) + latentRgb[1] * boost + yellowBlueCross * 0.42);
  const b = clamp01(kmRgb[2] * (1 - boost) + latentRgb[2] * boost - yellowBlueCross * 0.12);

  return [f32(r), f32(g), f32(b), alpha];
}

/**
 * 다중 안료 가중 혼합(Multi-pigment weighted Kubelka-Munk + latent mixing).
 * 팔레트 나이프·브러시 스머지·다중 레이어 웨트 블렌딩에서 N개의 색상을 물리적으로 일관되게 혼합한다.
 */
export function mixboxMultiMix(entries: readonly WeightedPigmentEntry[]): RGBA {
  if (entries.length === 0) {
    throw new SumiError("md-invalid-input", "최소 1개 이상의 안료 항목이 필요하다", {});
  }
  let totalWeight = 0;
  for (const entry of entries) {
    if (!isValidAlpha(entry.color[3])) {
      throw new SumiError("md-invalid-alpha", "알파는 [0, 1]이어야 한다", {
        alpha: entry.color[3],
      });
    }
    if (Number.isFinite(entry.weight) && entry.weight > 0) {
      totalWeight += entry.weight;
    }
  }
  if (totalWeight <= 0) {
    const first = entries[0].color;
    return [f32(first[0]), f32(first[1]), f32(first[2]), f32(first[3])];
  }

  let qR = 0;
  let qG = 0;
  let qB = 0;
  let alpha = 0;
  for (const entry of entries) {
    const w = Number.isFinite(entry.weight) && entry.weight > 0 ? entry.weight / totalWeight : 0;
    if (w <= 0) continue;
    qR += reflectanceToKsRatio(entry.color[0]) * w;
    qG += reflectanceToKsRatio(entry.color[1]) * w;
    qB += reflectanceToKsRatio(entry.color[2]) * w;
    alpha += entry.color[3] * w;
  }

  return [
    ksRatioToReflectance(f32(qR)),
    ksRatioToReflectance(f32(qG)),
    ksRatioToReflectance(f32(qB)),
    f32(clamp01(alpha)),
  ];
}

