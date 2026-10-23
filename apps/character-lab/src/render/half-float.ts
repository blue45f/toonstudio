/**
 * float32 → IEEE 754 binary16(half float) 비트 변환(순수). 절차 스카이 IBL 큐브를 rgba16float로 올릴 때 쓴다(F-02):
 * WebGPU 코어에서 rgba32float는 필터링 샘플러로 읽을 수 없고(`float32-filterable`이 없으면 UnfilterableFloat) 밉도 만들 수 없어,
 * HDR 프리필터가 검증 오류 수백 건을 냈다. rgba16float는 WebGPU 코어·WebGL2 모두 필터·밉·렌더가 된다.
 * 반올림은 가장 가까운 짝수(round-half-to-even), 범위를 넘으면 ±Infinity, 아주 작은 값은 비정규수, NaN은 quiet NaN.
 */

const scratch = new DataView(new ArrayBuffer(4));

/** float32 한 값 → binary16 비트(0~65535) */
export function toHalfFloatBits(value: number): number {
  scratch.setFloat32(0, value);
  const bits = scratch.getUint32(0);
  const sign = (bits >>> 16) & 0x8000;
  const exponent = (bits >>> 23) & 0xff;
  const mantissa = bits & 0x7fffff;
  if (exponent === 0xff) return sign | 0x7c00 | (mantissa !== 0 ? 0x200 : 0);
  // 지수 재편향(127 → 15)
  const halfExponent = exponent - 127 + 15;
  if (halfExponent >= 0x1f) return sign | 0x7c00;
  if (halfExponent <= 0) {
    // 비정규수(또는 0): 숨은 1을 붙여 오른쪽으로 민다
    if (halfExponent < -10) return sign;
    const full = mantissa | 0x800000;
    const shift = 14 - halfExponent;
    let half = full >>> shift;
    const remainder = full & ((1 << shift) - 1);
    const halfway = 1 << (shift - 1);
    if (remainder > halfway || (remainder === halfway && (half & 1) === 1)) half += 1;
    return sign | half;
  }
  let half = (halfExponent << 10) | (mantissa >>> 13);
  const remainder = mantissa & 0x1fff;
  if (remainder > 0x1000 || (remainder === 0x1000 && (half & 1) === 1)) half += 1;
  // 반올림이 지수를 넘기면 자연스럽게 다음 지수(또는 Infinity 0x7c00)가 된다
  return sign | half;
}

/** float32 배열 → binary16 비트 배열 */
export function toHalfFloatArray(values: Float32Array): Uint16Array {
  const out = new Uint16Array(values.length);
  for (let i = 0; i < values.length; i += 1) out[i] = toHalfFloatBits(values[i] ?? 0);
  return out;
}
