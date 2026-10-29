/**
 * 젖은 종이 베이크의 결정적 수학 도구.
 *
 * `Math.exp`·`Math.log`·`Math.sin`·`Math.cos`·`Math.pow`·`Math.hypot`은 ECMAScript가 정확한 반올림을
 * 요구하지 않아 엔진(V8·SpiderMonkey·JavaScriptCore)마다 마지막 비트가 달라질 수 있다. 베이크 결과는
 * Canvas와 SVG 내보내기가 같은 바이트를 그려야 하고(같은 브라우저 안), 시드 해시 테스트는 Node에서 돈다.
 * 그래서 결과로 흘러드는 경로는 IEEE-754가 정확한 반올림을 보장하는 사칙연산·`Math.sqrt`·`Math.floor`·
 * `Math.imul`·`Math.fround`만 쓰는 이 파일의 근사 함수를 쓴다. 근사 오차는 각 함수 주석에 적었다.
 */

const LN2 = 0.6931471805599453;
const INV_LN2 = 1.4426950408889634;
const TWO_PI = 6.283185307179586;
const PI = 3.141592653589793;
const HALF_PI = 1.5707963267948966;

/** 2^k (정수 k, |k| ≤ 1074). 곱셈만 쓰므로 모든 엔진에서 같은 값이다. */
function detPow2(k: number): number {
  let result = 1;
  if (k >= 0) {
    for (let index = 0; index < k; index += 1) result *= 2;
    return result;
  }
  for (let index = 0; index < -k; index += 1) result *= 0.5;
  return result;
}

/**
 * 결정적 e^x. x를 k·ln2 + r(|r| ≤ ln2/2)로 나누고 e^r을 13차 테일러로 계산한다(상대 오차 < 2e-15).
 * x < −700은 0, x > 700은 +∞ 대신 상한 값을 돌려준다(베이크 경로는 |x| < 50만 쓴다).
 */
export function detExp(x: number): number {
  if (!(x > -700)) return 0;
  if (x > 700) return 1.0142320547350045e304;
  const k = Math.floor(x * INV_LN2 + 0.5);
  const r = x - k * LN2;
  // Horner 형태의 13차 테일러 급수.
  let term = 1 / 6227020800;
  term = term * r + 1 / 479001600;
  term = term * r + 1 / 39916800;
  term = term * r + 1 / 3628800;
  term = term * r + 1 / 362880;
  term = term * r + 1 / 40320;
  term = term * r + 1 / 5040;
  term = term * r + 1 / 720;
  term = term * r + 1 / 120;
  term = term * r + 1 / 24;
  term = term * r + 1 / 6;
  term = term * r + 0.5;
  term = term * r + 1;
  term = term * r + 1;
  return term * detPow2(k);
}

/**
 * 결정적 자연로그(x > 0). x = m·2^e(m ∈ [1/√2, √2))로 나눈 뒤 ln m = 2·atanh((m−1)/(m+1))을
 * 홀수 급수 12항으로 계산한다(|z| ≤ 0.172, 상대 오차 < 1e-15). x ≤ 0이면 −∞를 돌려준다.
 */
export function detLn(x: number): number {
  if (!(x > 0)) return Number.NEGATIVE_INFINITY;
  if (x === Number.POSITIVE_INFINITY) return x;
  let mantissa = x;
  let exponent = 0;
  while (mantissa >= 1.4142135623730951) {
    mantissa *= 0.5;
    exponent += 1;
  }
  while (mantissa < 0.7071067811865476) {
    mantissa *= 2;
    exponent -= 1;
  }
  const z = (mantissa - 1) / (mantissa + 1);
  const z2 = z * z;
  let series = 1 / 23;
  series = series * z2 + 1 / 21;
  series = series * z2 + 1 / 19;
  series = series * z2 + 1 / 17;
  series = series * z2 + 1 / 15;
  series = series * z2 + 1 / 13;
  series = series * z2 + 1 / 11;
  series = series * z2 + 1 / 9;
  series = series * z2 + 1 / 7;
  series = series * z2 + 1 / 5;
  series = series * z2 + 1 / 3;
  series = series * z2 + 1;
  return 2 * z * series + exponent * LN2;
}

/** 결정적 sin(범위 축소 + [−π/2, π/2] 11차 테일러, 최대 오차 < 1e-7). */
export function detSin(x: number): number {
  let t = x - TWO_PI * Math.floor(x / TWO_PI + 0.5);
  if (t > HALF_PI) t = PI - t;
  else if (t < -HALF_PI) t = -PI - t;
  const t2 = t * t;
  return t * (1 + t2 * (-1 / 6 + t2 * (1 / 120 + t2 * (-1 / 5040
    + t2 * (1 / 362880 + t2 * (-1 / 39916800))))));
}

/** 결정적 cos = sin(x + π/2). */
export function detCos(x: number): number {
  return detSin(x + HALF_PI);
}

export function clampNumber(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

/** GLSL smoothstep과 같은 3차 에르미트 보간. edge0 === edge1이면 계단 함수. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * 32비트 정수 해시 → [0, 1). 레포 표준 `studioOssUnitHash`와 같은 혼합 상수를 쓰는 3입력 버전이다
 * (`studio-oss-brush-kernels.ts`를 핫 루프에 끌어오지 않으려고 같은 수식을 지역 함수로 둔다).
 */
export function wetPaperHash01(seed: number, a: number, b: number): number {
  let h =
    (Math.imul((seed | 0) + 1, 374761393)
      + Math.imul((a | 0) + 1, 668265263)
      + Math.imul((b | 0) + 1, 0x27d4_eb2d))
    | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 격자 값 노이즈(C2 보간). 결과 [0, 1). */
export function wetPaperValueNoise(x: number, y: number, seed: number): number {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const fx = x - cellX;
  const fy = y - cellY;
  const tx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const ty = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const n00 = wetPaperHash01(seed, cellX, cellY);
  const n10 = wetPaperHash01(seed, cellX + 1, cellY);
  const n01 = wetPaperHash01(seed, cellX, cellY + 1);
  const n11 = wetPaperHash01(seed, cellX + 1, cellY + 1);
  const top = n00 + (n10 - n00) * tx;
  const bottom = n01 + (n11 - n01) * tx;
  return top + (bottom - top) * ty;
}

/**
 * mulberry32 의사 난수 생성기(정수 연산만 사용). Sumi(MIT)의 `rng(seed)`와 같은 알고리즘이며
 * 드라이 브러시 강모 지도를 시드 고정으로 만들 때만 쓴다(`Math.random` 대체가 아니다).
 */
export function createWetPaperMulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b_79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
