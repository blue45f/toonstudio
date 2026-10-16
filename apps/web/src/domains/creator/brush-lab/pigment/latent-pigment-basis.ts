/**
 * 잠재 안료 혼합기의 다항식 기저.
 *
 * 농도 4개(c0..c3, 합 1)에서 sRGB 채널 하나를 만드는 식은 네 변수 3차 동차 단항식 20개의 가중합이다.
 * 네 변수 3차 동차 단항식은 정확히 20개(세제곱 4개, 제곱×1차 12개, 서로 다른 셋의 곱 4개)이고,
 * 농도 합이 1이라는 제약 때문에 세 변수 3차 다항식 전체를 표현한다.
 *
 * 단항식 순서는 "중복을 허용한 인덱스 조합 i<=j<=k"를 사전순으로 나열한 것이다. 계수 배열의 k번째 값은
 * 이 표의 k번째 단항식 c[i]*c[j]*c[k]의 계수다. 모델 생성 스크립트와 혼합기가 이 파일의 표를 함께
 * 쓰므로, 계수가 어느 항의 것인지가 두 곳에서 어긋날 수 없다.
 */

/** 계수 배열 의미(항 순서)를 식별한다. 생성 파일이 같은 값을 기록하고 혼합기가 초기화 때 대조한다. */
export const LATENT_PIGMENT_BASIS_ID = "homogeneous-cubic-4var-v1";
/** 기준 안료 개수 = 농도 변수 개수. */
export const LATENT_PIGMENT_COUNT = 4;
/** 출력 채널 수(R, G, B). */
export const LATENT_PIGMENT_CHANNEL_COUNT = 3;
/** 4변수 3차 동차 단항식 개수. */
export const LATENT_PIGMENT_TERM_COUNT = 20;

/** 단항식 하나를 이루는 농도 인덱스 셋(같은 인덱스가 반복될 수 있다). */
export type LatentPigmentTerm = readonly [first: number, second: number, third: number];

function buildTerms(): readonly LatentPigmentTerm[] {
  const terms: LatentPigmentTerm[] = [];
  for (let first = 0; first < LATENT_PIGMENT_COUNT; first += 1) {
    for (let second = first; second < LATENT_PIGMENT_COUNT; second += 1) {
      for (let third = second; third < LATENT_PIGMENT_COUNT; third += 1) {
        terms.push(Object.freeze([first, second, third] as const));
      }
    }
  }
  return Object.freeze(terms);
}

/** 단항식 인덱스 표. 길이는 항상 `LATENT_PIGMENT_TERM_COUNT`다. */
export const LATENT_PIGMENT_TERMS: readonly LatentPigmentTerm[] = buildTerms();

/** 농도 길이 4 배열에서 단항식 20개의 값을 `out`에 채운다. */
export function evaluateLatentPigmentTerms(
  concentrations: ArrayLike<number>,
  out: Float64Array,
): void {
  for (let index = 0; index < LATENT_PIGMENT_TERM_COUNT; index += 1) {
    const [first, second, third] = LATENT_PIGMENT_TERMS[index];
    out[index] = concentrations[first] * concentrations[second] * concentrations[third];
  }
}
