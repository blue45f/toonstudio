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

import { kmMixRgb } from "./kubelka-munk";

/** 선형 sRGB 0..1 straight RGBA. */
export type RGBA = readonly [number, number, number, number];

const isValidAlpha = (alpha: number): boolean =>
  Number.isFinite(alpha) && alpha >= 0 && alpha <= 1;

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
  return [Math.fround(r), Math.fround(g), Math.fround(b), Math.fround(colorA[3] + (colorB[3] - colorA[3]) * tt)];
}
