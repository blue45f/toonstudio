/**
 * 잠재 안료 표 고속 경로 — toonstudio-latent-pigment-v1 의 RGB → 농도 역변환을 미리 구운 격자표로 근사한다.
 *
 * 구조
 *  - 굽기: 이 저장소의 반복 풀이(`latent-pigment-mixer.ts` 의 활성 집합 Levenberg–Marquardt)를 sRGB 격자
 *    N×N×N 점에서 그대로 실행해 농도 4개를 Float32 로 담는다. 데이터 파일은 커밋하지 않고, 모듈을 불러올 때가
 *    아니라 첫 사용 때 한 번 굽는다(Worker 안에서 굽기에 알맞다). 같은 N 이면 결과는 비트 단위로 같다.
 *  - 조회: 입력 색의 농도를 표에서 삼선형 보간한다. 잔차는 근사하지 않고 `입력 − 0~1로 자른 다항식(조회 농도)`로
 *    정확히 다시 계산하므로 같은 농도로 돌아가면 입력 색이 그대로 나온다(무손실 왕복).
 *  - 혼합: 반복 풀이 경로와 같은 식이다. 농도와 잔차를 가중 평균한 뒤 `0~1로 자른 다항식 + 잔차`를 0~1로 자른다.
 *
 * 표 배치(GPU 업로드와 같은 배치): concentrations[((b·N + g)·N + r)·4 + k]. R 이 가장 빠른 축이므로 그대로
 * rgba32float 3D 텍스처(x=R, y=G, z=B)로 올릴 수 있다. 보간 식은 WGSL/GLSL `mix(a, b, t) = a·(1−t) + b·t` 와 같다.
 *
 * 반복 풀이와의 차이: 격자점 사이에서는 농도를 보간하므로 반복 풀이가 고르는 해와 다를 수 있다(다항식 상이 접힌
 * 곳에서 특히). 대신 입력 색에 대해 연속이다. 일치 범위와 측정값은 docs/features/latent-pigment-mixing.md 에 있다.
 * 입출력 색은 감마 인코딩된 sRGB(0~1)다.
 */
import {
  LATENT_PIGMENT_CHANNEL_COUNT,
  LATENT_PIGMENT_COUNT,
  LATENT_PIGMENT_TERMS,
  LATENT_PIGMENT_TERM_COUNT,
} from "./latent-pigment-basis";
import {
  solveLatentPigmentConcentrationsInto,
  type LatentPigment,
  type LatentPigmentRgb,
  type WeightedRgbPigment,
} from "./latent-pigment-mixer";
import { LATENT_PIGMENT_COEFFICIENTS } from "./latent-pigment-model.generated";

/** 표 배치·굽기 규칙의 식별 번호. 셰이더와 캐시가 같은 표를 쓰는지 확인할 때 쓴다. */
export const LATENT_PIGMENT_TABLE_REVISION = 1 as const;
/** 기본 축당 격자점 수(33³ = 35,937점). 굽기 시간과 근사 품질의 균형점이다(문서 GPU·표 절). */
export const LATENT_PIGMENT_TABLE_DEFAULT_SIZE = 33;
export const LATENT_PIGMENT_TABLE_MIN_SIZE = 2;
export const LATENT_PIGMENT_TABLE_MAX_SIZE = 65;
/** 격자점 하나의 성분 수(농도 4개 = RGBA 텍셀 하나). */
export const LATENT_PIGMENT_TABLE_COMPONENTS = 4;

export interface LatentPigmentTable {
  readonly revision: typeof LATENT_PIGMENT_TABLE_REVISION;
  /** 축당 격자점 수 N. 격자 좌표 i 는 채널 값 i/(N−1) 이다. */
  readonly size: number;
  /**
   * 길이 N³·4. 공유 표이므로 고치지 않는다(TypedArray 는 동결할 수 없다).
   * GPU 로 올릴 때는 읽기만 하는 API(writeTexture·texImage3D)에 그대로 넘긴다.
   */
  readonly concentrations: Float32Array;
}

const VARIABLES = LATENT_PIGMENT_COUNT;
const CHANNELS = LATENT_PIGMENT_CHANNEL_COUNT;
const TERMS = LATENT_PIGMENT_TERM_COUNT;

interface Kernel {
  /** 채널 우선 평탄 배열: coefficients[channel * 20 + term]. */
  readonly coefficients: Float64Array;
  /** termIndex[term * 3 + position]. */
  readonly termIndex: Int32Array;
  readonly terms: Float64Array;
  readonly polynomial: Float64Array;
  readonly first: Float64Array;
  readonly second: Float64Array;
  readonly mixed: Float64Array;
  readonly firstResidual: Float64Array;
  readonly secondResidual: Float64Array;
}

let kernel: Kernel | null = null;
let defaultTable: LatentPigmentTable | null = null;

function getKernel(): Kernel {
  if (kernel !== null) return kernel;
  if (LATENT_PIGMENT_COEFFICIENTS.length !== CHANNELS || LATENT_PIGMENT_COEFFICIENTS.some((row) => row.length !== TERMS)) {
    throw new Error("잠재 안료 모델 계수의 모양이 맞지 않습니다. 모델을 다시 생성하세요.");
  }
  const coefficients = new Float64Array(CHANNELS * TERMS);
  LATENT_PIGMENT_COEFFICIENTS.forEach((row, channel) => coefficients.set(row, channel * TERMS));
  const termIndex = new Int32Array(TERMS * 3);
  LATENT_PIGMENT_TERMS.forEach((term, index) => termIndex.set(term, index * 3));
  kernel = {
    coefficients,
    termIndex,
    terms: new Float64Array(TERMS),
    polynomial: new Float64Array(CHANNELS),
    first: new Float64Array(VARIABLES),
    second: new Float64Array(VARIABLES),
    mixed: new Float64Array(VARIABLES),
    firstResidual: new Float64Array(CHANNELS),
    secondResidual: new Float64Array(CHANNELS),
  };
  return kernel;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** NaN·무한대는 0으로, 나머지는 0~1로 자른다(고속 경로의 입력 위생). */
function sanitizeUnit(value: number): number {
  return Number.isFinite(value) ? clamp01(value) : 0;
}

/**
 * 농도 4개에서 다항식 값(자르기 전) 3채널을 `out` 에 채운다. 반복 풀이 모듈의 평가와 항 순서·연산 순서가 같아
 * 같은 농도에서 비트 단위로 같은 값을 낸다(시험이 확인).
 */
function evaluatePolynomial(model: Kernel, concentrations: Float64Array, out: Float64Array): void {
  const { termIndex, coefficients, terms } = model;
  for (let term = 0; term < TERMS; term += 1) {
    terms[term] = concentrations[termIndex[term * 3]]
      * concentrations[termIndex[term * 3 + 1]]
      * concentrations[termIndex[term * 3 + 2]];
  }
  for (let channel = 0; channel < CHANNELS; channel += 1) {
    let sum = 0;
    const offset = channel * TERMS;
    for (let term = 0; term < TERMS; term += 1) sum += coefficients[offset + term] * terms[term];
    out[channel] = sum;
  }
}

function validateSize(size: number): number {
  if (!Number.isSafeInteger(size) || size < LATENT_PIGMENT_TABLE_MIN_SIZE || size > LATENT_PIGMENT_TABLE_MAX_SIZE) {
    throw new RangeError(
      `잠재 안료 표 크기는 ${LATENT_PIGMENT_TABLE_MIN_SIZE}~${LATENT_PIGMENT_TABLE_MAX_SIZE} 사이의 정수여야 합니다(받은 값: ${String(size)}).`,
    );
  }
  return size;
}

/**
 * 표를 굽는다. 격자점마다 반복 풀이를 한 번씩 실행하므로 비용은 N³ 번의 풀이다(N=33 에서 수백 ms~1초대,
 * 문서의 측정값 참고). 결과는 결정적이다. 보통은 `getLatentPigmentTable()` 의 지연 단일 표를 쓴다.
 */
export function bakeLatentPigmentTable(size: number = LATENT_PIGMENT_TABLE_DEFAULT_SIZE): LatentPigmentTable {
  const axis = validateSize(size);
  const last = axis - 1;
  const concentrations = new Float32Array(axis * axis * axis * LATENT_PIGMENT_TABLE_COMPONENTS);
  const rgb: [number, number, number] = [0, 0, 0];
  const solved = new Float64Array(VARIABLES);
  let offset = 0;
  for (let blue = 0; blue < axis; blue += 1) {
    rgb[2] = blue / last;
    for (let green = 0; green < axis; green += 1) {
      rgb[1] = green / last;
      for (let red = 0; red < axis; red += 1) {
        rgb[0] = red / last;
        solveLatentPigmentConcentrationsInto(rgb, solved);
        concentrations[offset] = solved[0];
        concentrations[offset + 1] = solved[1];
        concentrations[offset + 2] = solved[2];
        concentrations[offset + 3] = solved[3];
        offset += LATENT_PIGMENT_TABLE_COMPONENTS;
      }
    }
  }
  return Object.freeze({ revision: LATENT_PIGMENT_TABLE_REVISION, size: axis, concentrations });
}

/** 기본 크기 표. 첫 호출 때 한 번 굽고 이후에는 같은 객체를 돌려준다. */
export function getLatentPigmentTable(): LatentPigmentTable {
  if (defaultTable === null) defaultTable = bakeLatentPigmentTable(LATENT_PIGMENT_TABLE_DEFAULT_SIZE);
  return defaultTable;
}

/** 진단용: 기본 표를 이미 구웠는지. 모듈을 불러오는 것만으로는 굽지 않는다. */
export function isLatentPigmentTableBaked(): boolean {
  return defaultTable !== null;
}

export function assertLatentPigmentTable(table: LatentPigmentTable): LatentPigmentTable {
  const size = table?.size;
  if (
    typeof table !== "object"
    || table === null
    || table.revision !== LATENT_PIGMENT_TABLE_REVISION
    || !Number.isSafeInteger(size)
    || size < LATENT_PIGMENT_TABLE_MIN_SIZE
    || size > LATENT_PIGMENT_TABLE_MAX_SIZE
    || !(table.concentrations instanceof Float32Array)
    || table.concentrations.length !== size * size * size * LATENT_PIGMENT_TABLE_COMPONENTS
  ) {
    throw new TypeError("잠재 안료 표의 모양이 올바르지 않습니다.");
  }
  return table;
}

/**
 * 표에서 농도 4개를 삼선형 보간해 `out` 에 쓴다. 채널 값은 0~1 로 이미 잘려 있어야 한다.
 * 격자 칸은 floor(x·(N−1)) 를 N−2 로 묶어 정하므로 채널 값 1 은 마지막 칸의 끝점(분율 1)이 된다.
 */
function lookupInto(table: LatentPigmentTable, red: number, green: number, blue: number, out: Float64Array): void {
  const { size, concentrations: data } = table;
  const last = size - 1;
  const x = red * last;
  const y = green * last;
  const z = blue * last;
  const ix = Math.min(Math.floor(x), last - 1);
  const iy = Math.min(Math.floor(y), last - 1);
  const iz = Math.min(Math.floor(z), last - 1);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const gx = 1 - fx;
  const gy = 1 - fy;
  const gz = 1 - fz;
  const strideX = LATENT_PIGMENT_TABLE_COMPONENTS;
  const strideY = size * LATENT_PIGMENT_TABLE_COMPONENTS;
  const strideZ = size * strideY;
  const base = ix * strideX + iy * strideY + iz * strideZ;
  for (let component = 0; component < VARIABLES; component += 1) {
    const p = base + component;
    const x00 = data[p] * gx + data[p + strideX] * fx;
    const x10 = data[p + strideY] * gx + data[p + strideY + strideX] * fx;
    const x01 = data[p + strideZ] * gx + data[p + strideZ + strideX] * fx;
    const x11 = data[p + strideZ + strideY] * gx + data[p + strideZ + strideY + strideX] * fx;
    const y0 = x00 * gy + x10 * fy;
    const y1 = x01 * gy + x11 * fy;
    out[component] = y0 * gz + y1 * fz;
  }
}

/** 표 조회 농도와 정확한 잔차를 `concentrations`(4)·`residual`(3)에 채운다. 입력은 0~1. */
function latentInto(
  model: Kernel,
  table: LatentPigmentTable,
  red: number,
  green: number,
  blue: number,
  concentrations: Float64Array,
  residual: Float64Array,
): void {
  lookupInto(table, red, green, blue, concentrations);
  evaluatePolynomial(model, concentrations, model.polynomial);
  residual[0] = red - clamp01(model.polynomial[0]);
  residual[1] = green - clamp01(model.polynomial[1]);
  residual[2] = blue - clamp01(model.polynomial[2]);
}

/** `clamp01(clamp01(다항식(농도)) + 잔차)` 를 `out`(3)에 쓴다. 반복 풀이 경로의 latentPigmentToRgb 와 같은 식이다. */
function toRgbInto(model: Kernel, concentrations: Float64Array, residual: Float64Array, out: Float64Array): void {
  evaluatePolynomial(model, concentrations, model.polynomial);
  out[0] = clamp01(clamp01(model.polynomial[0]) + residual[0]);
  out[1] = clamp01(clamp01(model.polynomial[1]) + residual[1]);
  out[2] = clamp01(clamp01(model.polynomial[2]) + residual[2]);
}

function readUnitRgb(value: unknown, label: string): LatentPigmentRgb {
  if (typeof value !== "object" || value === null || !("length" in value) || value.length !== 3) {
    throw new TypeError(`${label}은 길이 3의 숫자 배열이어야 합니다.`);
  }
  const list = value as ArrayLike<unknown>;
  const result: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const item = list[index];
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 1) {
      throw new RangeError(`${label}의 ${index}번째 값은 0~1 사이의 유한한 수여야 합니다(받은 값: ${String(item)}).`);
    }
    result.push(item);
  }
  return [result[0], result[1], result[2]];
}

function readWeight(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label}의 가중치는 0 이상의 유한한 수여야 합니다(받은 값: ${String(value)}).`);
  }
  return value;
}

function frozenRgb(values: Float64Array): LatentPigmentRgb {
  return Object.freeze([values[0], values[1], values[2]] as const);
}

/**
 * RGB(감마 인코딩 sRGB, 0~1)를 표 근사 잠재 색으로 바꾼다. 범위 밖·NaN 은 거부한다.
 * `latentPigmentToRgb`(반복 풀이 모듈)에 넘기면 입력 색이 그대로 돌아온다.
 */
export function latentPigmentFromRgbTable(
  rgb01: LatentPigmentRgb,
  table: LatentPigmentTable = getLatentPigmentTable(),
): LatentPigment {
  const [red, green, blue] = readUnitRgb(rgb01, "RGB");
  const model = getKernel();
  const concentrations = new Float64Array(VARIABLES);
  const residual = new Float64Array(CHANNELS);
  latentInto(model, assertLatentPigmentTable(table), red, green, blue, concentrations, residual);
  return Object.freeze({
    concentrations: Object.freeze([concentrations[0], concentrations[1], concentrations[2], concentrations[3]] as const),
    residual: frozenRgb(residual),
  });
}

/**
 * 두 색을 표 근사 잠재 공간에서 `t`(0=첫 색, 1=둘째 색) 비율로 섞는다. t 는 0~1 로 자른다.
 * 입력 검증을 하고 동결된 결과를 돌려준다. 핫 루프에는 `mixSrgb8LatentPigmentTableInto` 를 쓴다.
 */
export function mixRgbLatentPigmentTable(
  first: LatentPigmentRgb,
  second: LatentPigmentRgb,
  t: number,
  table: LatentPigmentTable = getLatentPigmentTable(),
): LatentPigmentRgb {
  const a = readUnitRgb(first, "첫 색");
  const b = readUnitRgb(second, "둘째 색");
  if (typeof t !== "number" || !Number.isFinite(t)) throw new RangeError(`혼합 비율은 유한한 수여야 합니다(받은 값: ${String(t)}).`);
  const out = new Float64Array(CHANNELS);
  mixUnitInto(assertLatentPigmentTable(table), a[0], a[1], a[2], b[0], b[1], b[2], clamp01(t), out);
  return frozenRgb(out);
}

function mixUnitInto(
  table: LatentPigmentTable,
  r0: number,
  g0: number,
  b0: number,
  r1: number,
  g1: number,
  b1: number,
  t: number,
  out: Float64Array,
): void {
  const model = getKernel();
  const { first, second, mixed, firstResidual, secondResidual } = model;
  latentInto(model, table, r0, g0, b0, first, firstResidual);
  latentInto(model, table, r1, g1, b1, second, secondResidual);
  const keep = 1 - t;
  for (let variable = 0; variable < VARIABLES; variable += 1) mixed[variable] = first[variable] * keep + second[variable] * t;
  for (let channel = 0; channel < CHANNELS; channel += 1) {
    firstResidual[channel] = firstResidual[channel] * keep + secondResidual[channel] * t;
  }
  toRgbInto(model, mixed, firstResidual, out);
}

/**
 * 고속 경로(할당 없음): 0~255 채널 두 색을 섞어 0~255 실수 채널을 `out`(길이 3 이상)에 쓴다.
 * 혼색 브러시 Worker 의 도장마다 부른다. NaN·범위 밖 값은 예외 대신 0~255 로 자른다(혼색 코어의 위생 규칙과 같다).
 */
export function mixSrgb8LatentPigmentTableInto(
  red0: number,
  green0: number,
  blue0: number,
  red1: number,
  green1: number,
  blue1: number,
  t: number,
  out: Float64Array,
  table: LatentPigmentTable = getLatentPigmentTable(),
): void {
  const scale = 1 / 255;
  mixUnitInto(
    table,
    sanitizeUnit(red0 * scale),
    sanitizeUnit(green0 * scale),
    sanitizeUnit(blue0 * scale),
    sanitizeUnit(red1 * scale),
    sanitizeUnit(green1 * scale),
    sanitizeUnit(blue1 * scale),
    sanitizeUnit(t),
    out,
  );
  out[0] *= 255;
  out[1] *= 255;
  out[2] *= 255;
}

/**
 * 여러 색의 가중 혼합(표 근사). 가중치 규칙은 반복 풀이 경로의 mixRgbPigments 와 같다:
 * 최댓값으로 먼저 나눈 뒤 합 1로 정규화하고, 음수·NaN·무한대 가중치와 빈 목록, 합 0을 거부한다.
 */
export function mixRgbLatentPigmentsTable(
  entries: readonly WeightedRgbPigment[],
  table: LatentPigmentTable = getLatentPigmentTable(),
): LatentPigmentRgb {
  const list: unknown = entries;
  if (!Array.isArray(list)) throw new TypeError("entries는 배열이어야 합니다.");
  const checked = list.map((entry: unknown, index) => {
    if (typeof entry !== "object" || entry === null || !("rgb" in entry) || !("weight" in entry)) {
      throw new TypeError(`entries[${index}]에는 rgb와 weight가 필요합니다.`);
    }
    return { rgb: readUnitRgb(entry.rgb, `entries[${index}].rgb`), weight: readWeight(entry.weight, `entries[${index}]`) };
  });
  if (checked.length === 0) throw new RangeError("섞을 색이 하나 이상 필요합니다.");
  const largest = checked.reduce((maximum, entry) => Math.max(maximum, entry.weight), 0);
  if (!(largest > 0)) throw new RangeError("가중치 합이 0보다 커야 합니다.");
  const scaled = checked.map((entry) => entry.weight / largest);
  const total = scaled.reduce((sum, weight) => sum + weight, 0);
  const verified = assertLatentPigmentTable(table);
  const model = getKernel();
  const concentrations = new Float64Array(VARIABLES);
  const residual = new Float64Array(CHANNELS);
  const { first, firstResidual } = model;
  checked.forEach((entry, index) => {
    const weight = scaled[index] / total;
    if (weight === 0) return;
    latentInto(model, verified, entry.rgb[0], entry.rgb[1], entry.rgb[2], first, firstResidual);
    for (let variable = 0; variable < VARIABLES; variable += 1) concentrations[variable] += weight * first[variable];
    for (let channel = 0; channel < CHANNELS; channel += 1) residual[channel] += weight * firstResidual[channel];
  });
  const out = new Float64Array(CHANNELS);
  toRgbInto(model, concentrations, residual, out);
  return frozenRgb(out);
}

/**
 * 2D 아틀라스 배치(GLSL 2D 텍스처 경로용): 너비 N·N, 높이 N 의 RGBA 텍셀. 텍셀 (r + b·N, g) 가
 * 3D 표의 (r, g, b) 와 같은 값이다.
 */
export function packLatentPigmentTableAtlas2d(table: LatentPigmentTable = getLatentPigmentTable()): Float32Array {
  const { size, concentrations } = assertLatentPigmentTable(table);
  const width = size * size;
  const atlas = new Float32Array(width * size * LATENT_PIGMENT_TABLE_COMPONENTS);
  for (let blue = 0; blue < size; blue += 1) {
    for (let green = 0; green < size; green += 1) {
      for (let red = 0; red < size; red += 1) {
        const source = ((blue * size + green) * size + red) * LATENT_PIGMENT_TABLE_COMPONENTS;
        const target = (green * width + blue * size + red) * LATENT_PIGMENT_TABLE_COMPONENTS;
        atlas.set(concentrations.subarray(source, source + LATENT_PIGMENT_TABLE_COMPONENTS), target);
      }
    }
  }
  return atlas;
}
