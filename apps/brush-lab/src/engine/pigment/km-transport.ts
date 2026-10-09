/**
 * 입자 농도 t → 색: 입자 솔버가 수송하는 스칼라 농도(`Mpm2D.conc`, 0 = 색 a, 1 = 색 b)를 KM 혼색(`km-mix`)으로 색으로 바꾸는 얇은 층.
 *
 * 입자는 색을 들고 다니지 않고 농도 t만 들고 다닌다(격자에서 평균 내는 확산 항으로 섞인다). 색은 저장소의 KM 혼색기가 정하므로
 * 노랑(t = 0)과 파랑(t = 1)이 만나는 중간(t ≈ 0.5)은 sRGB 쌍별 교환의 회청색이 아니라 **초록**이 된다(SP-B 측정).
 *
 * 색 규약은 `km-mix`와 같다: 선형 sRGB 0..1 straight. 감마·알파는 호출자가 경계에서 처리한다.
 * 입자마다 혼합기를 부르면 느리므로 t = 0..1 균등 램프(`buildRamp`)를 한 번 만들고 입자는 램프를 조회한다.
 * 램프 크기만큼 t가 양자화된다(기본 64단 → 인접 단 색차는 8비트 양자화 수준).
 *
 * 외부 의존 0, 사칙과 `Math.round`만 쓴다. 믹서 인스턴스는 재진입이 안 되므로(`km-mix` 규약) 램프는 만든 뒤 읽기 전용으로 공유한다.
 */
import type { BandMixer, Rgb3 } from "./km-mix";

/** 기본 램프 단수. */
export const KM_TRANSPORT_RAMP_SIZE = 64;

/** 농도 → 색 변환표. `ramp`는 크기×3 선형 sRGB straight다. */
export interface ConcentrationRamp {
  readonly a: Rgb3;
  readonly b: Rgb3;
  readonly size: number;
  readonly ramp: Float32Array;
}

/**
 * 두 색 a(t = 0)·b(t = 1) 사이의 KM 램프를 만든다. 첫 칸은 a, 마지막 칸은 b와 정확히 같다.
 * 크기가 2 미만이면 `buildRamp`가 던지지 않도록 2로 올린다(농도 두 점은 최소한 필요하다).
 */
export function buildConcentrationRamp(
  mixer: BandMixer,
  a: Rgb3,
  b: Rgb3,
  size: number = KM_TRANSPORT_RAMP_SIZE,
): ConcentrationRamp {
  const n = Math.max(2, Math.floor(size));
  return { a, b, size: n, ramp: mixer.buildRamp(a, b, n) };
}

/** 농도 t(0..1, 범위 밖은 클램프, NaN은 0)에 가장 가까운 램프 칸 번호. */
export function rampIndex(size: number, t: number): number {
  const c = t > 0 ? (t < 1 ? t : 1) : 0;
  return Math.round(c * (size - 1));
}

/** 램프를 조회해 `out[o..o+2]`에 선형 sRGB straight 색을 쓴다. */
export function sampleConcentration(r: ConcentrationRamp, t: number, out: Float32Array | Float64Array | number[], o = 0): void {
  const i = rampIndex(r.size, t) * 3;
  out[o] = r.ramp[i];
  out[o + 1] = r.ramp[i + 1];
  out[o + 2] = r.ramp[i + 2];
}

/**
 * 입자 `count`개의 농도 → 색을 한 번에 채운다(`rgb`는 입자마다 3칸). 스플랫 입력용이다.
 * `conc`는 `Mpm2D.conc`처럼 길이가 `count` 이상인 배열이다.
 */
export function fillParticleColors(
  r: ConcentrationRamp,
  conc: ArrayLike<number>,
  count: number,
  rgb: Float32Array | Float64Array,
): void {
  if (rgb.length < count * 3) throw new RangeError(`fillParticleColors: rgb 버퍼가 짧다(${rgb.length} < ${count * 3})`);
  for (let p = 0; p < count; p += 1) {
    const i = rampIndex(r.size, conc[p]) * 3;
    rgb[p * 3] = r.ramp[i];
    rgb[p * 3 + 1] = r.ramp[i + 1];
    rgb[p * 3 + 2] = r.ramp[i + 2];
  }
}

/** 단일 변환(램프 없이 믹서로 바로): 테스트·소량 호출용. `t`는 `km-mix`의 클램프 정책을 따른다. */
export function concentrationToColor(
  mixer: BandMixer,
  a: Rgb3,
  b: Rgb3,
  t: number,
  out: Float32Array | Float64Array | number[],
  o = 0,
): void {
  mixer.mix(a, b, t, out, o);
}
