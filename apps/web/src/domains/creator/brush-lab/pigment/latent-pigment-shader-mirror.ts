/**
 * 잠재 안료 셰이더 산술의 TS 재현(shader mirror).
 *
 * `latent-pigment-shaders.ts` 가 만드는 WGSL/GLSL 함수와 같은 순서로 f32 연산을 한다. 모든 중간값을
 * `Math.fround` 로 f32 로 반올림하고, 내장 함수는 WGSL 명세의 정의식을 따른다.
 *  - mix(a, b, t) = a·(1−t) + b·t, clamp(x, lo, hi) = min(max(x, lo), hi), select 는 조건 분기.
 *  - pow 는 Math.pow 를 f32 로 반올림한다(GPU 의 pow 는 근사이므로 시험은 허용치를 둔다).
 * 실제 GPU 는 곱셈·덧셈을 FMA 로 합치거나 pow 를 근사할 수 있어 이 재현과 비트 단위로 같다고 보장하지 않는다.
 * 실기기 GPU 픽셀은 검증하지 않았다. 이 모듈은 시험과 진단용이며 제품 런타임 경로에서 부르지 않는다.
 */
import { LATENT_PIGMENT_TERMS } from "./latent-pigment-basis";
import { LATENT_PIGMENT_COEFFICIENTS } from "./latent-pigment-model.generated";
import { LATENT_PIGMENT_TABLE_COMPONENTS, type LatentPigmentTable } from "./latent-pigment-table";

const f32 = Math.fround;

export interface LatentPigmentShaderMirrorLatent {
  readonly concentrations: Float32Array;
  readonly residual: Float32Array;
}

/** 셰이더의 vec3f(계수) 상수 — 리터럴을 f32 로 변환한 값. */
function coefficientF32(channel: number, term: number): number {
  return f32(LATENT_PIGMENT_COEFFICIENTS[channel][term]);
}

function clampF32(value: number, minimum: number, maximum: number): number {
  return f32(Math.min(Math.max(value, minimum), maximum));
}

function mixF32(a: number, b: number, t: number): number {
  return f32(f32(a * f32(1 - t)) + f32(b * t));
}

/** `latent_pigment_polynomial(c)`: rgb = rgb + coeff * (c.i * c.j * c.l) 를 항 순서대로 f32 로 누적한다. */
export function mirrorLatentPigmentPolynomial(concentrations: ArrayLike<number>, out: Float32Array = new Float32Array(3)): Float32Array {
  let red = 0;
  let green = 0;
  let blue = 0;
  LATENT_PIGMENT_TERMS.forEach(([first, second, third], term) => {
    const monomial = f32(f32(f32(concentrations[first]) * f32(concentrations[second])) * f32(concentrations[third]));
    red = f32(red + f32(coefficientF32(0, term) * monomial));
    green = f32(green + f32(coefficientF32(1, term) * monomial));
    blue = f32(blue + f32(coefficientF32(2, term) * monomial));
  });
  out[0] = red;
  out[1] = green;
  out[2] = blue;
  return out;
}

/** 3D 텍스처 `textureLoad(table, vec3i(x, y, z), 0)` 와 같은 텍셀을 읽는다(x=R, y=G, z=B). */
function loadTexel(table: LatentPigmentTable, x: number, y: number, z: number, component: number): number {
  const { size } = table;
  return table.concentrations[((z * size + y) * size + x) * LATENT_PIGMENT_TABLE_COMPONENTS + component];
}

/** `latent_pigment_table_concentrations(rgb)`: 8텍셀 수동 삼선형 보간(x→y→z). */
export function mirrorLatentPigmentTableConcentrations(
  table: LatentPigmentTable,
  rgb: ArrayLike<number>,
  out: Float32Array = new Float32Array(4),
): Float32Array {
  const last = f32(table.size - 1);
  const position = [0, 1, 2].map((axis) => f32(clampF32(f32(rgb[axis]), 0, 1) * last));
  const cell = position.map((value) => f32(Math.min(Math.floor(value), f32(last - 1))));
  const fraction = position.map((value, axis) => f32(value - cell[axis]));
  const [ix, iy, iz] = cell.map((value) => Math.trunc(value));
  for (let component = 0; component < LATENT_PIGMENT_TABLE_COMPONENTS; component += 1) {
    const texel = (dx: number, dy: number, dz: number): number => loadTexel(table, ix + dx, iy + dy, iz + dz, component);
    const x00 = mixF32(texel(0, 0, 0), texel(1, 0, 0), fraction[0]);
    const x10 = mixF32(texel(0, 1, 0), texel(1, 1, 0), fraction[0]);
    const x01 = mixF32(texel(0, 0, 1), texel(1, 0, 1), fraction[0]);
    const x11 = mixF32(texel(0, 1, 1), texel(1, 1, 1), fraction[0]);
    const y0 = mixF32(x00, x10, fraction[1]);
    const y1 = mixF32(x01, x11, fraction[1]);
    out[component] = mixF32(y0, y1, fraction[2]);
  }
  return out;
}

/** `latent_pigment_from_rgb(rgb)`: 표 농도와 `color − clamp(polynomial)` 잔차. */
export function mirrorLatentPigmentFromRgb(table: LatentPigmentTable, rgb: ArrayLike<number>): LatentPigmentShaderMirrorLatent {
  const color = [0, 1, 2].map((axis) => clampF32(f32(rgb[axis]), 0, 1));
  const concentrations = mirrorLatentPigmentTableConcentrations(table, color);
  const polynomial = mirrorLatentPigmentPolynomial(concentrations);
  const residual = new Float32Array(3);
  for (let channel = 0; channel < 3; channel += 1) residual[channel] = f32(color[channel] - clampF32(polynomial[channel], 0, 1));
  return { concentrations, residual };
}

/** `latent_pigment_to_rgb(latent)`: clamp(clamp(polynomial) + residual). */
export function mirrorLatentPigmentToRgb(latent: LatentPigmentShaderMirrorLatent): Float32Array {
  const polynomial = mirrorLatentPigmentPolynomial(latent.concentrations);
  const out = new Float32Array(3);
  for (let channel = 0; channel < 3; channel += 1) {
    out[channel] = clampF32(f32(clampF32(polynomial[channel], 0, 1) + latent.residual[channel]), 0, 1);
  }
  return out;
}

/** `latent_pigment_mix_latent(a, b, t)`: 농도·잔차를 mix 로 보간한다(t 는 0~1 로 자른다). */
export function mirrorLatentPigmentMixLatent(
  a: LatentPigmentShaderMirrorLatent,
  b: LatentPigmentShaderMirrorLatent,
  t: number,
): LatentPigmentShaderMirrorLatent {
  const w = clampF32(f32(t), 0, 1);
  const concentrations = new Float32Array(4);
  const residual = new Float32Array(3);
  for (let index = 0; index < 4; index += 1) concentrations[index] = mixF32(a.concentrations[index], b.concentrations[index], w);
  for (let index = 0; index < 3; index += 1) residual[index] = mixF32(a.residual[index], b.residual[index], w);
  return { concentrations, residual };
}

/** `latent_pigment_mix(a, b, t)`: 감마 인코딩 sRGB 두 색의 혼합. */
export function mirrorLatentPigmentMix(table: LatentPigmentTable, a: ArrayLike<number>, b: ArrayLike<number>, t: number): Float32Array {
  return mirrorLatentPigmentToRgb(
    mirrorLatentPigmentMixLatent(mirrorLatentPigmentFromRgb(table, a), mirrorLatentPigmentFromRgb(table, b), t),
  );
}

/** `latent_pigment_mix_rgba(a, b, t)`: 직선 알파. 색 비율은 알파로 가중하고 알파는 선형 보간한다. */
export function mirrorLatentPigmentMixRgba(table: LatentPigmentTable, a: ArrayLike<number>, b: ArrayLike<number>, t: number): Float32Array {
  const w = clampF32(f32(t), 0, 1);
  const first = f32(f32(a[3]) * f32(1 - w));
  const second = f32(f32(b[3]) * w);
  const coverage = f32(first + second);
  const colorT = coverage > 0 ? f32(second / coverage) : w;
  const rgb = mirrorLatentPigmentMix(table, [a[0], a[1], a[2]], [b[0], b[1], b[2]], colorT);
  return Float32Array.of(rgb[0], rgb[1], rgb[2], coverage);
}

/** `latent_pigment_srgb_to_linear(c)` 의 채널별 재현. */
export function mirrorLatentPigmentSrgbToLinear(rgb: ArrayLike<number>): Float32Array {
  const out = new Float32Array(3);
  for (let channel = 0; channel < 3; channel += 1) {
    const x = clampF32(f32(rgb[channel]), 0, 1);
    out[channel] = x <= f32(0.04045) ? f32(x / f32(12.92)) : f32(Math.pow(f32(f32(x + f32(0.055)) / f32(1.055)), f32(2.4)));
  }
  return out;
}

/** `latent_pigment_linear_to_srgb(c)` 의 채널별 재현. */
export function mirrorLatentPigmentLinearToSrgb(rgb: ArrayLike<number>): Float32Array {
  const out = new Float32Array(3);
  for (let channel = 0; channel < 3; channel += 1) {
    const x = clampF32(f32(rgb[channel]), 0, 1);
    out[channel] = x <= f32(0.0031308)
      ? f32(x * f32(12.92))
      : f32(f32(f32(1.055) * f32(Math.pow(x, f32(1 / 2.4)))) - f32(0.055));
  }
  return out;
}

/** `latent_pigment_mix_linear(a, b, t)`: 선형 sRGB 입력을 감마 인코딩해 섞고 다시 선형으로 돌린다. */
export function mirrorLatentPigmentMixLinear(table: LatentPigmentTable, a: ArrayLike<number>, b: ArrayLike<number>, t: number): Float32Array {
  return mirrorLatentPigmentSrgbToLinear(
    mirrorLatentPigmentMix(table, mirrorLatentPigmentLinearToSrgb(a), mirrorLatentPigmentLinearToSrgb(b), t),
  );
}
