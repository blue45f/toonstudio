/** 주소 시험의 RN 산술·독립 BigInt oracle·결정적 표본. 제품 혼색 모델은 실행하지 않는다. */
import { latentPigmentPackedAtlasLayout } from "../latent-pigment-float32-atlas";

export type AddressPoint = readonly [number, number, number];
export type Address = readonly [number, number];

const BIGINT_ONE = BigInt(1);
const BIGINT_TWO = BigInt(2);
const BIGINT_FOUR = BigInt(4);

function roundToNearestEven(value: number, fractionBits: number): number {
  if (!Number.isFinite(value)) throw new Error("주소 모델은 유한값만 허용한다.");
  if (value === 0) return 0;
  const magnitude = Math.abs(value);
  const step = 2 ** (Math.floor(Math.log2(magnitude)) - fractionBits);
  const scaled = magnitude / step, lower = Math.floor(scaled), tail = scaled - lower;
  const rounded = tail > 0.5 || (tail === 0.5 && lower % 2 === 1) ? lower + 1 : lower;
  return Math.sign(value) * rounded * step;
}

/** 정수 피연산자의 유리수에서 RN tie를 결정해 host double 나눗셈의 tie 오차를 피한다. */
function divideToNearestEven(numerator: number, denominator: number, fractionBits: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0 || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error("주소 모델 나눗셈에는 음이 아닌 정수와 양의 정수 분모가 필요하다.");
  }
  if (!numerator) return 0;
  const a = BigInt(numerator), b = BigInt(denominator);
  let exponent = Math.floor(Math.log2(numerator / denominator));
  const lessThanPower = (e: number) => e >= 0 ? a < (b << BigInt(e)) : (a << BigInt(-e)) < b;
  while (lessThanPower(exponent)) exponent -= 1;
  while (!lessThanPower(exponent + 1)) exponent += 1;
  const shift = fractionBits - exponent;
  const top = shift >= 0 ? a << BigInt(shift) : a;
  const bottom = shift >= 0 ? b : b << BigInt(-shift);
  let quotient = top / bottom;
  const remainder = top % bottom;
  if (remainder * BIGINT_TWO > bottom || (remainder * BIGINT_TWO === bottom && (quotient & BIGINT_ONE) === BIGINT_ONE)) quotient += BIGINT_ONE;
  return Number(quotient) * 2 ** (exponent - fractionBits);
}

export function createAddressArithmetic(fractionBits: 16 | 23 = 16) {
  let maximum = 0;
  const observe = (raw: number, rounded: number) => {
    maximum = Math.max(maximum, Math.abs(raw), Math.abs(rounded));
    return rounded;
  };
  const rounded = (raw: number) => observe(raw, roundToNearestEven(raw, fractionBits));
  return {
    value: rounded,
    add: (a: number, b: number) => rounded(a + b),
    sub: (a: number, b: number) => rounded(a - b),
    mul: (a: number, b: number) => rounded(a * b),
    div: (a: number, b: number) => observe(a / b, divideToNearestEven(a, b, fractionBits)),
    maximum: () => maximum,
  };
}

/** GPU 생성식이나 carry 수식을 재사용하지 않는 정확한 정수 주소다. */
export function integerAddressOracle(size: number, [r, g, b]: AddressPoint, component: number, width: number): Address {
  const index = ((BigInt(b) * BigInt(size) + BigInt(g)) * BigInt(size) + BigInt(r)) * BIGINT_FOUR + BigInt(component);
  return [Number(index % BigInt(width)), Number(index / BigInt(width))];
}

export function addressPoints(size: number): AddressPoint[] {
  const count = size ** 3;
  if (size === 33 || count <= 512) {
    return Array.from({ length: count }, (_, i): AddressPoint => [i % size, Math.floor(i / size) % size, Math.floor(i / (size * size))]);
  }
  const selected = new Set<number>();
  const add = (i: number) => { if (Number.isSafeInteger(i) && i >= 0 && i < count) selected.add(i); };
  const edges = [...new Set([0, 1, Math.floor(size / 2), size - 2, size - 1])];
  for (const b of edges) for (const g of edges) for (const r of edges) add((b * size + g) * size + r);
  const { width, height } = latentPigmentPackedAtlasLayout(size);
  for (const exponent of [15, 16, 17, 18, 19, 20]) for (let d = -8; d <= 8; d++) add(Math.floor((2 ** exponent + d) / 4));
  for (const row of [0, 1, 2, Math.floor(height / 2), height - 2, height - 1]) {
    for (let d = -8; d <= 8; d++) add(Math.floor((row * width + d) / 4));
  }
  // column=W-1인 Horner 단계에 다음 axis=N-1을 붙이는 최대 분자를 포함한다.
  add((width - 1) * size + size - 1);
  let state = (0x20261106 ^ size) >>> 0;
  for (let i = 0; i < 256; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    add(state % count);
  }
  return [...selected].sort((a, b) => a - b)
    .map((i): AddressPoint => [i % size, Math.floor(i / size) % size, Math.floor(i / (size * size))]);
}
