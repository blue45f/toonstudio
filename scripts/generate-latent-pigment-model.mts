/**
 * 잠재 안료 혼합기의 순방향 모델(농도 4개 → sRGB 3차 다항식 계수)을 생성한다. 개발 전용이며 결정적이다.
 *
 * 무엇을 하는가
 *  1. 합성 기준 안료 4종(흰색·노랑·파랑·자홍 계열)의 31밴드(400~700nm, 10nm) 반사율 곡선을 정의한다.
 *     실측 도료 데이터가 아니라 이 프로젝트가 직접 작성한 매끄러운 곡선이다(출처·선택 이유는 문서).
 *  2. 농도 단체(simplex) 격자의 각 점을 저장소의 Kubelka–Munk 31밴드 파이프라인
 *     (studio-spectral-pigment-mixing-provider)으로 섞어 scene-linear sRGB(무제한)를 얻고,
 *     부호를 보존한 sRGB 전달함수로 인코딩해 표본을 만든다.
 *  3. 채널마다 네 변수 3차 동차 단항식 20항 다항식을 최소제곱(Householder QR)으로 적합한다.
 *     sRGB 색역 밖 표본은 "다항식이 같은 쪽(<=0 또는 >=1)이면 오차 0"인 검열(censored) 반복 가중 적합으로
 *     처리한다. 표시값은 0~1로 자르기 때문에, 잘려 나가는 값을 따라가려고 색역 안쪽 정확도를 해치지 않기 위해서다.
 *  4. 계수와 적합 오차를 brush-lab/pigment/latent-pigment-model.generated.ts 로 쓴다.
 *
 * 원본 Mixbox의 코드·계수·격자표·안료 상수는 보지도 쓰지도 않았다(clean-room). 입력은 이 파일의 곡선과
 * 저장소의 KM 구현뿐이다.
 *
 * 사용법
 *   pnpm run generate:latent-pigment-model            # 생성 파일을 쓴다(내용이 같으면 건드리지 않는다)
 *   pnpm run verify:latent-pigment-model              # --check: 최신이 아니면 종료 코드 1
 *   pnpm exec tsx scripts/generate-latent-pigment-model.mts --report   # 모델 요약(파일을 쓰지 않는다)
 *   pnpm exec tsx scripts/generate-latent-pigment-model.mts --sweep    # 설계 변수 비교표(파일을 쓰지 않는다)
 *
 * 종료 코드: 0 정상 / 1 생성 파일이 최신이 아님 / 2 사용법 오류.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  LATENT_PIGMENT_BASIS_ID,
  LATENT_PIGMENT_CHANNEL_COUNT,
  LATENT_PIGMENT_COUNT,
  LATENT_PIGMENT_TERM_COUNT,
  evaluateLatentPigmentTerms,
} from "../apps/web/src/domains/creator/brush-lab/pigment/latent-pigment-basis";
import {
  STUDIO_SPECTRAL_PIGMENT_MIN_WAVELENGTH_NM,
  STUDIO_SPECTRAL_PIGMENT_SAMPLE_COUNT,
  STUDIO_SPECTRAL_PIGMENT_WAVELENGTH_STEP_NM,
  createStudioSpectralPigmentRecipe,
  mixStudioSpectralPigmentRecipe,
} from "../apps/web/src/domains/creator/studio-spectral-pigment-mixing-provider";

import type { StudioSpectralPigmentInput } from "../apps/web/src/domains/creator/studio-spectral-pigment-mixing-provider";

const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
export const GENERATED_MODEL_RELATIVE_PATH =
  "apps/web/src/domains/creator/brush-lab/pigment/latent-pigment-model.generated.ts";

/** 1/255 단위로 오차를 보고하기 위한 배율. */
const EIGHT_BIT = 255;
/** 반사율이 0이면 K/S가 무한대가 되므로 곡선의 하한을 둔다(파이프라인의 하한 1/65536보다 훨씬 크다). */
const MINIMUM_REFLECTANCE = 0.003;
/** `--check`가 생성 파일의 숫자를 비교할 때 허용하는 절대 오차(수학 라이브러리 구현 차이 흡수용). */
const CHECK_ABSOLUTE_TOLERANCE = 1e-6;

export interface LatentPigmentGeneratorSettings {
  /** 모델 개정 번호. 생성 파일에 기록한다. */
  readonly modelRevision: number;
  /** 적합 표본 격자의 분할 수. 20이면 단체 격자 점이 1771개다. */
  readonly fitGridDivisions: number;
  /** 검증 표본 격자의 분할 수. 적합에 쓰지 않은 점이 대부분이다. */
  readonly validationGridDivisions: number;
  /** 농도 c를 KM 혼합의 착색 가중치 c^p로 바꾸는 지수. 1이면 선형이다. */
  readonly concentrationExponent: number;
  /** 순수 안료 꼭짓점 표본에 주는 가중치. 순수 안료 색을 정확히 재현하도록 앵커로 쓴다. */
  readonly vertexWeight: number;
  /** true면 색역 밖 표본을 검열 적합으로 처리한다. */
  readonly censored: boolean;
  /** 검열 적합의 반복 상한. */
  readonly maximumCensoredIterations: number;
  /** 기준 안료의 반사율 하한을 키우는 배율. 1이 채택안이다(탐색용 변수). */
  readonly reflectanceFloorScale: number;
}

export const DEFAULT_GENERATOR_SETTINGS: LatentPigmentGeneratorSettings = Object.freeze({
  modelRevision: 1,
  fitGridDivisions: 20,
  validationGridDivisions: 30,
  concentrationExponent: 1.75,
  vertexWeight: 50,
  censored: true,
  maximumCensoredIterations: 60,
  reflectanceFloorScale: 1,
});

export interface ReferencePigment {
  readonly id: string;
  readonly label: string;
  /** 파장에 무관한 상대 산란 세기. 흰색이 크면 같은 농도에서 착색력이 약해진다. */
  readonly scattering: number;
  /** 31밴드 반사율(무한 두께 한계). */
  readonly reflectance: readonly number[];
}

const logistic = (x: number): number => 1 / (1 + Math.exp(-x));
const gaussian = (x: number, center: number, sigma: number): number =>
  Math.exp(-0.5 * ((x - center) / sigma) ** 2);
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function spectrum(shape: (wavelengthNm: number) => number): readonly number[] {
  return Object.freeze(Array.from({ length: STUDIO_SPECTRAL_PIGMENT_SAMPLE_COUNT }, (_, band) => {
    const wavelength = STUDIO_SPECTRAL_PIGMENT_MIN_WAVELENGTH_NM
      + band * STUDIO_SPECTRAL_PIGMENT_WAVELENGTH_STEP_NM;
    return Math.min(1, Math.max(MINIMUM_REFLECTANCE, shape(wavelength)));
  }));
}

/**
 * 합성 기준 안료 4종. 농도 순서(c0..c3)는 흰색, 노랑, 파랑, 자홍이다.
 * `floorScale`은 흡수 대역의 반사율 하한을 키우는 탐색용 배율이며 채택안은 1이다.
 */
export function createReferencePigments(floorScale = 1): readonly ReferencePigment[] {
  const yellowFloor = 0.02 * floorScale;
  const blueFloor = 0.015 * floorScale;
  const magentaFloor = 0.015 * floorScale;
  return Object.freeze([
    {
      id: "white",
      label: "백색 계열(티타늄 화이트 모양)",
      scattering: 4,
      reflectance: spectrum((nm) => 0.97 - 0.12 * logistic((425 - nm) / 8)),
    },
    {
      id: "yellow",
      label: "노랑 계열(카드뮴·한자 옐로 모양)",
      scattering: 1,
      reflectance: spectrum((nm) => yellowFloor + (0.9 - yellowFloor) * logistic((nm - 506) / 9)),
    },
    {
      id: "blue",
      label: "파랑 계열(프탈로 블루 모양)",
      scattering: 1,
      reflectance: spectrum((nm) => blueFloor
        + 0.36 * gaussian(nm, 472, nm < 472 ? 34 : 30)
        + 0.06 * logistic((nm - 640) / 15)),
    },
    {
      id: "magenta",
      label: "자홍 계열(퀴나크리돈 마젠타 모양)",
      scattering: 1,
      reflectance: spectrum((nm) => magentaFloor
        + 0.6 * logistic((nm - 596) / 14)
        + 0.25 * logistic((450 - nm) / 26)),
    },
  ]);
}

export const REFERENCE_PIGMENTS: readonly ReferencePigment[] = createReferencePigments(1);

/** 선형 값을 부호를 보존해 sRGB로 인코딩한다(IEC 61966-2-1 전달함수). 색역 밖 값도 매끄럽게 이어진다. */
export function encodeSrgbSigned(linear: number): number {
  const magnitude = Math.abs(linear);
  const encoded = magnitude <= 0.0031308
    ? 12.92 * magnitude
    : 1.055 * magnitude ** (1 / 2.4) - 0.055;
  return linear < 0 ? -encoded : encoded;
}

export type Concentrations = readonly [number, number, number, number];
export type EncodedColor = readonly [number, number, number];

/**
 * 농도 4개를 KM 파이프라인으로 섞어 인코딩된 sRGB(무제한)를 돌려준다.
 * 농도 0인 안료는 레시피에서 뺀다(파이프라인이 0 농도를 거부한다).
 */
export function sampleEncodedColor(
  pigments: readonly ReferencePigment[],
  concentrations: Concentrations,
  exponent: number,
): EncodedColor {
  const inputs: StudioSpectralPigmentInput[] = [];
  pigments.forEach((pigment, index) => {
    const concentration = concentrations[index];
    if (concentration > 0) {
      inputs.push({
        id: pigment.id,
        reflectance: pigment.reflectance,
        weight: pigment.scattering,
        concentration: concentration ** exponent,
      });
    }
  });
  const created = createStudioSpectralPigmentRecipe({ pigments: inputs });
  if (created.status !== "ready") {
    throw new Error(`KM 레시피가 거부되었습니다: ${created.path}`);
  }
  const { artifact } = mixStudioSpectralPigmentRecipe(created.recipe);
  const [red, green, blue] = artifact.sceneLinearRgb;
  return [encodeSrgbSigned(red), encodeSrgbSigned(green), encodeSrgbSigned(blue)];
}

/** 합이 1인 비음수 농도 격자(분할 수 n이면 C(n+3,3)개 점)를 사전순으로 만든다. */
export function buildSimplexGrid(divisions: number): readonly Concentrations[] {
  if (!Number.isInteger(divisions) || divisions < 1) throw new RangeError("격자 분할 수는 1 이상의 정수여야 합니다.");
  const points: Concentrations[] = [];
  for (let first = 0; first <= divisions; first += 1) {
    for (let second = 0; first + second <= divisions; second += 1) {
      for (let third = 0; first + second + third <= divisions; third += 1) {
        const fourth = divisions - first - second - third;
        points.push([first / divisions, second / divisions, third / divisions, fourth / divisions]);
      }
    }
  }
  return points;
}

function isVertex(point: Concentrations): boolean {
  return point.some((value) => value === 1);
}

function buildDesignMatrix(grid: readonly Concentrations[]): Float64Array {
  const design = new Float64Array(grid.length * LATENT_PIGMENT_TERM_COUNT);
  const terms = new Float64Array(LATENT_PIGMENT_TERM_COUNT);
  grid.forEach((point, row) => {
    evaluateLatentPigmentTerms(point, terms);
    design.set(terms, row * LATENT_PIGMENT_TERM_COUNT);
  });
  return design;
}

export interface LeastSquaresResult {
  readonly solution: Float64Array;
  /** Householder QR의 R 대각 원소 크기의 최소/최대 비. 조건수의 거친 지표다(1에 가까울수록 좋다). */
  readonly diagonalRatio: number;
}

/**
 * 가중 최소제곱 min ||sqrt(W)(A x - b)||². Householder QR이라 정규방정식보다 조건수에 덜 민감하다.
 * `design`은 행 우선 rows x columns 행렬이다.
 */
export function solveWeightedLeastSquares(
  design: Float64Array,
  rows: number,
  columns: number,
  rhs: Float64Array,
  weights: Float64Array,
): LeastSquaresResult {
  const matrix = new Float64Array(design.length);
  const vector = new Float64Array(rows);
  for (let row = 0; row < rows; row += 1) {
    const scale = Math.sqrt(weights[row]);
    for (let column = 0; column < columns; column += 1) {
      matrix[row * columns + column] = design[row * columns + column] * scale;
    }
    vector[row] = rhs[row] * scale;
  }
  const reflector = new Float64Array(rows);
  let smallestDiagonal = Infinity;
  let largestDiagonal = 0;
  for (let k = 0; k < columns; k += 1) {
    let norm = 0;
    for (let row = k; row < rows; row += 1) norm += matrix[row * columns + k] ** 2;
    norm = Math.sqrt(norm);
    if (!(norm > 1e-12)) throw new Error("설계 행렬의 계수가 부족합니다(최소제곱을 풀 수 없음).");
    const alpha = matrix[k * columns + k] > 0 ? -norm : norm;
    let reflectorNorm = 0;
    for (let row = k; row < rows; row += 1) reflector[row] = matrix[row * columns + k];
    reflector[k] -= alpha;
    for (let row = k; row < rows; row += 1) reflectorNorm += reflector[row] ** 2;
    if (reflectorNorm > 0) {
      for (let column = k; column < columns; column += 1) {
        let dot = 0;
        for (let row = k; row < rows; row += 1) dot += reflector[row] * matrix[row * columns + column];
        const factor = (2 * dot) / reflectorNorm;
        for (let row = k; row < rows; row += 1) matrix[row * columns + column] -= factor * reflector[row];
      }
      let dot = 0;
      for (let row = k; row < rows; row += 1) dot += reflector[row] * vector[row];
      const factor = (2 * dot) / reflectorNorm;
      for (let row = k; row < rows; row += 1) vector[row] -= factor * reflector[row];
    }
    const diagonal = Math.abs(matrix[k * columns + k]);
    smallestDiagonal = Math.min(smallestDiagonal, diagonal);
    largestDiagonal = Math.max(largestDiagonal, diagonal);
  }
  const solution = new Float64Array(columns);
  for (let k = columns - 1; k >= 0; k -= 1) {
    let sum = vector[k];
    for (let column = k + 1; column < columns; column += 1) sum -= matrix[k * columns + column] * solution[column];
    solution[k] = sum / matrix[k * columns + k];
  }
  return { solution, diagonalRatio: smallestDiagonal / largestDiagonal };
}

function dotRow(design: Float64Array, row: number, solution: Float64Array): number {
  let sum = 0;
  for (let column = 0; column < LATENT_PIGMENT_TERM_COUNT; column += 1) {
    sum += design[row * LATENT_PIGMENT_TERM_COUNT + column] * solution[column];
  }
  return sum;
}

/**
 * 채널 하나를 적합한다. `censored`가 true면 목표를 0~1로 자른 값으로 삼고, 색역 밖 표본(원래 값이 <=0 또는
 * >=1)에서 다항식이 같은 쪽에 있으면 그 표본의 가중치를 0으로 둔다. 가중치 집합이 변하지 않을 때까지
 * (상한까지) 반복하며, 순서가 고정이라 결과는 결정적이다.
 */
export function fitChannel(
  design: Float64Array,
  rows: number,
  targets: Float64Array,
  baseWeights: Float64Array,
  censored: boolean,
  maximumIterations: number,
): LeastSquaresResult {
  if (!censored) {
    return solveWeightedLeastSquares(design, rows, LATENT_PIGMENT_TERM_COUNT, targets, baseWeights);
  }
  const clamped = Float64Array.from(targets, clamp01);
  let weights = Float64Array.from(baseWeights);
  let result = solveWeightedLeastSquares(design, rows, LATENT_PIGMENT_TERM_COUNT, clamped, weights);
  for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
    const next = Float64Array.from(baseWeights);
    for (let row = 0; row < rows; row += 1) {
      const predicted = dotRow(design, row, result.solution);
      if ((targets[row] <= 0 && predicted <= 0) || (targets[row] >= 1 && predicted >= 1)) next[row] = 0;
    }
    if (next.every((value, index) => value === weights[index])) break;
    weights = next;
    result = solveWeightedLeastSquares(design, rows, LATENT_PIGMENT_TERM_COUNT, clamped, weights);
  }
  return result;
}

/** 표시값(0~1로 자른 값) 기준 오차를 1/255 단위로 요약한다. */
export interface FitErrorStats {
  readonly sampleCount: number;
  readonly meanEightBit: number;
  readonly p99EightBit: number;
  readonly maxEightBit: number;
}

export function describeFitError(
  coefficients: readonly Float64Array[],
  grid: readonly Concentrations[],
  samples: readonly EncodedColor[],
): FitErrorStats {
  const terms = new Float64Array(LATENT_PIGMENT_TERM_COUNT);
  const errors = new Float64Array(grid.length * LATENT_PIGMENT_CHANNEL_COUNT);
  let sum = 0;
  grid.forEach((point, index) => {
    evaluateLatentPigmentTerms(point, terms);
    for (let channel = 0; channel < LATENT_PIGMENT_CHANNEL_COUNT; channel += 1) {
      let predicted = 0;
      for (let term = 0; term < LATENT_PIGMENT_TERM_COUNT; term += 1) {
        predicted += coefficients[channel][term] * terms[term];
      }
      const error = Math.abs(clamp01(predicted) - clamp01(samples[index][channel])) * EIGHT_BIT;
      errors[index * LATENT_PIGMENT_CHANNEL_COUNT + channel] = error;
      sum += error;
    }
  });
  const sorted = Float64Array.from(errors).sort();
  return {
    sampleCount: grid.length,
    meanEightBit: sum / errors.length,
    p99EightBit: sorted[Math.floor((sorted.length - 1) * 0.99)],
    maxEightBit: sorted[sorted.length - 1],
  };
}

export interface WorstFitPoint {
  readonly point: Concentrations;
  readonly channel: number;
  readonly errorEightBit: number;
}

/** 표시값 오차가 가장 큰 격자 점과 채널. 보고용이며 생성 파일에는 쓰지 않는다. */
export function findWorstFitPoint(
  coefficients: readonly Float64Array[],
  grid: readonly Concentrations[],
  samples: readonly EncodedColor[],
): WorstFitPoint {
  const terms = new Float64Array(LATENT_PIGMENT_TERM_COUNT);
  let worst: WorstFitPoint = { point: grid[0], channel: 0, errorEightBit: -1 };
  grid.forEach((point, index) => {
    evaluateLatentPigmentTerms(point, terms);
    for (let channel = 0; channel < LATENT_PIGMENT_CHANNEL_COUNT; channel += 1) {
      let predicted = 0;
      for (let term = 0; term < LATENT_PIGMENT_TERM_COUNT; term += 1) predicted += coefficients[channel][term] * terms[term];
      const error = Math.abs(clamp01(predicted) - clamp01(samples[index][channel])) * EIGHT_BIT;
      if (error > worst.errorEightBit) worst = { point, channel, errorEightBit: error };
    }
  });
  return worst;
}

/** 실사용 색 27개(피부·머리·하늘·잎·빨강 계열 등)와 sRGB 원색 6개. 포괄도 평가 입력이다. */
export const COVERAGE_TYPICAL_COLORS: readonly string[] = Object.freeze([
  "f5d0b0", "d9a577", "8d5524", "202020", "5b3a29", "e6c27a", "87ceeb", "2a6fdb", "1f2a68",
  "4caf50", "2e7d32", "9ccc3c", "26a69a", "e53935", "b71c1c", "fb8c00", "ff7f6b", "fdd835",
  "f9a825", "8e24aa", "6a4fc4", "d81b60", "f48fb1", "6d4c41", "9e9e9e", "ffffff", "000000",
]);
export const COVERAGE_PRIMARY_COLORS: readonly string[] = Object.freeze([
  "ff0000", "00ff00", "0000ff", "ffff00", "ff00ff", "00ffff",
]);

export interface CoverageStats {
  readonly typicalMeanEightBit: number;
  readonly typicalMaxEightBit: number;
  readonly primariesMeanEightBit: number;
}

/**
 * 다항식이 만드는 색(0~1로 자른 값) 집합에서 각 색까지의 최근접 거리를 1/255 단위로 잰다.
 * 거리가 작을수록 그 색이 잔차 없이(안료다운 혼합으로) 표현된다. 근사값이다(분할 40 격자의 최근접).
 */
export function measureCoverage(coefficients: readonly Float64Array[]): CoverageStats {
  const grid = buildSimplexGrid(40);
  const terms = new Float64Array(LATENT_PIGMENT_TERM_COUNT);
  const image = grid.map((point) => {
    evaluateLatentPigmentTerms(point, terms);
    return [0, 1, 2].map((channel) => {
      let predicted = 0;
      for (let term = 0; term < LATENT_PIGMENT_TERM_COUNT; term += 1) predicted += coefficients[channel][term] * terms[term];
      return clamp01(predicted);
    });
  });
  const distanceTo = (hex: string): number => {
    const target = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / EIGHT_BIT);
    let best = Infinity;
    for (const color of image) {
      best = Math.min(best, Math.hypot(color[0] - target[0], color[1] - target[1], color[2] - target[2]));
    }
    return best * EIGHT_BIT;
  };
  const typical = COVERAGE_TYPICAL_COLORS.map(distanceTo);
  const primaries = COVERAGE_PRIMARY_COLORS.map(distanceTo);
  const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    typicalMeanEightBit: mean(typical),
    typicalMaxEightBit: typical.reduce((largest, value) => Math.max(largest, value), 0),
    primariesMeanEightBit: mean(primaries),
  };
}

export interface LatentPigmentModel {
  readonly settings: LatentPigmentGeneratorSettings;
  readonly pigments: readonly ReferencePigment[];
  /** 채널(R,G,B)별 20개 계수. 순서는 latent-pigment-basis 의 단항식 표를 따른다. */
  readonly coefficients: readonly Float64Array[];
  /** 순수 안료 꼭짓점의 표시색(0~255 정수, 0~255로 자름). */
  readonly vertexEightBit: readonly (readonly number[])[];
  readonly training: FitErrorStats;
  /** 적합에 쓰지 않은 점이 대부분인 더 촘촘한 격자에서의 오차. `null`이면 계산하지 않았다. */
  readonly validation: FitErrorStats | null;
  readonly diagonalRatio: number;
}

/** 모델을 만든다. 같은 설정이면 같은 결과가 나온다. `includeValidation`이 false면 검증 격자를 건너뛴다. */
export function buildLatentPigmentModel(
  settings: LatentPigmentGeneratorSettings = DEFAULT_GENERATOR_SETTINGS,
  includeValidation = true,
): LatentPigmentModel {
  const pigments = createReferencePigments(settings.reflectanceFloorScale);
  const grid = buildSimplexGrid(settings.fitGridDivisions);
  const samples = grid.map((point) => sampleEncodedColor(pigments, point, settings.concentrationExponent));
  const design = buildDesignMatrix(grid);
  const baseWeights = Float64Array.from(grid, (point) => (isVertex(point) ? settings.vertexWeight : 1));
  let diagonalRatio = 1;
  const coefficients = Array.from({ length: LATENT_PIGMENT_CHANNEL_COUNT }, (_, channel) => {
    const targets = Float64Array.from(samples, (sample) => sample[channel]);
    const result = fitChannel(design, grid.length, targets, baseWeights, settings.censored, settings.maximumCensoredIterations);
    diagonalRatio = Math.min(diagonalRatio, result.diagonalRatio);
    return result.solution;
  });
  const vertexEightBit = pigments.map((_, index) => {
    const row = grid.findIndex((point) => point[index] === 1);
    return samples[row].map((value) => Math.round(clamp01(value) * EIGHT_BIT));
  });
  const training = describeFitError(coefficients, grid, samples);
  let validation: FitErrorStats | null = null;
  if (includeValidation) {
    const validationGrid = buildSimplexGrid(settings.validationGridDivisions);
    const validationSamples = validationGrid.map((point) => sampleEncodedColor(pigments, point, settings.concentrationExponent));
    validation = describeFitError(coefficients, validationGrid, validationSamples);
  }
  return { settings, pigments, coefficients, vertexEightBit, training, validation, diagonalRatio };
}

/** 숫자를 유효숫자 12자리로 줄여 안정적으로 출력한다(-0은 0으로). */
export function formatGeneratedNumber(value: number): string {
  const rounded = Number(value.toPrecision(12));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function renderNumberRows(values: ArrayLike<number>, indent: string, perLine: number): string[] {
  const rows: string[] = [];
  for (let start = 0; start < values.length; start += perLine) {
    const items = Array.from({ length: Math.min(perLine, values.length - start) }, (_, offset) => formatGeneratedNumber(values[start + offset]));
    rows.push(`${indent}${items.join(", ")},`);
  }
  return rows;
}

function renderStats(name: string, stats: FitErrorStats): string[] {
  return [
    `  ${name}: {`,
    `    sampleCount: ${stats.sampleCount},`,
    `    meanEightBit: ${formatGeneratedNumber(stats.meanEightBit)},`,
    `    p99EightBit: ${formatGeneratedNumber(stats.p99EightBit)},`,
    `    maxEightBit: ${formatGeneratedNumber(stats.maxEightBit)},`,
    "  },",
  ];
}

/** 생성 파일의 전체 텍스트. 시각·경로·환경 정보를 넣지 않아 같은 모델이면 같은 텍스트다. */
export function renderLatentPigmentModelModule(model: LatentPigmentModel): string {
  if (model.validation === null) throw new Error("생성 파일에는 검증 오차가 필요합니다.");
  const { settings } = model;
  const channelNames = ["적색(R)", "녹색(G)", "청색(B)"];
  const lines: string[] = [
    "/**",
    " * 잠재 안료 혼합기 순방향 모델 상수 — 생성 파일이다. 직접 고치지 않는다.",
    " *",
    " * 생성기: scripts/generate-latent-pigment-model.mts (개발 전용, 결정적)",
    " * 재생성: pnpm run generate:latent-pigment-model",
    " * 최신 여부 검증: pnpm run verify:latent-pigment-model",
    " *",
    " * 입력: 합성 기준 안료 4종(흰색·노랑·파랑·자홍 계열)의 31밴드(400~700nm, 10nm) 반사율 곡선을",
    " *       저장소의 Kubelka–Munk 31밴드 파이프라인에 넣어 만든 농도 단체 격자 표본.",
    " * 출력: 농도 4개 → sRGB(감마 인코딩, 0~1) 채널별 4변수 3차 동차 다항식 계수 20개.",
    " * 근거와 한계: docs/features/latent-pigment-mixing.md",
    " */",
    "",
    `export const LATENT_PIGMENT_MODEL_REVISION = ${settings.modelRevision};`,
    `export const LATENT_PIGMENT_MODEL_BASIS_ID = ${JSON.stringify(LATENT_PIGMENT_BASIS_ID)};`,
    "/** 농도 변수 순서. 꼭짓점 배열의 안료 순서와 같다. */",
    `export const LATENT_PIGMENT_MODEL_PIGMENT_IDS: readonly string[] = [${model.pigments.map((pigment) => JSON.stringify(pigment.id)).join(", ")}];`,
    "",
    "/** 채널(R,G,B)별 20개 계수. 항 순서는 latent-pigment-basis.ts 의 단항식 표를 따른다. */",
    "export const LATENT_PIGMENT_COEFFICIENTS: readonly (readonly number[])[] = [",
  ];
  model.coefficients.forEach((channel, index) => {
    lines.push(`  // ${channelNames[index]}`, "  [", ...renderNumberRows(channel, "    ", 4), "  ],");
  });
  lines.push(
    "];",
    "",
    "/** 순수 안료 꼭짓점의 표시색(0~255 정수). 모델 입력 곡선에서 계산한 KM 결과이며 실측값이 아니다. */",
    "export const LATENT_PIGMENT_REFERENCE_VERTEX_EIGHT_BIT: readonly (readonly number[])[] = [",
    ...model.vertexEightBit.map((color) => `  [${color.join(", ")}],`),
    "];",
    "",
    "/**",
    ` * 적합 오차(표시값=0~1로 자른 값 기준, 1/255 단위). training 은 적합에 쓴 ${model.training.sampleCount}점(격자 ${settings.fitGridDivisions}분할),`,
    ` * validation 은 ${model.validation.sampleCount}점(격자 ${settings.validationGridDivisions}분할, 적합에 쓰지 않은 점 포함)이다.`,
    ` * 농도 지수 ${formatGeneratedNumber(settings.concentrationExponent)}, 꼭짓점 가중치 ${formatGeneratedNumber(settings.vertexWeight)}, 검열 적합 ${settings.censored ? "사용" : "미사용"}.`,
    " */",
    "export const LATENT_PIGMENT_FIT_ERROR = {",
    ...renderStats("training", model.training),
    ...renderStats("validation", model.validation),
    "} as const;",
    "",
  );
  return lines.join("\n");
}

const NUMBER_PATTERN = /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/giu;

export interface CheckResult {
  readonly upToDate: boolean;
  readonly detail: string;
}

/** 두 생성 텍스트가 같은지 비교한다. 숫자 외 부분은 같아야 하고 숫자는 절대 오차 안에서 같으면 된다. */
export function compareGeneratedText(actual: string, expected: string): CheckResult {
  if (actual === expected) return { upToDate: true, detail: "텍스트가 일치합니다." };
  const actualNumbers = actual.match(NUMBER_PATTERN) ?? [];
  const expectedNumbers = expected.match(NUMBER_PATTERN) ?? [];
  const actualSkeleton = actual.replace(NUMBER_PATTERN, "#");
  const expectedSkeleton = expected.replace(NUMBER_PATTERN, "#");
  if (actualSkeleton !== expectedSkeleton || actualNumbers.length !== expectedNumbers.length) {
    const actualLines = actualSkeleton.split("\n");
    const expectedLines = expectedSkeleton.split("\n");
    const index = actualLines.findIndex((line, lineIndex) => line !== expectedLines[lineIndex]);
    const line = index < 0 ? Math.min(actualLines.length, expectedLines.length) : index;
    return {
      upToDate: false,
      detail: `구조가 다릅니다(첫 차이: ${line + 1}번째 줄) 디스크: ${JSON.stringify(actualLines[line] ?? "<없음>")} 기대: ${JSON.stringify(expectedLines[line] ?? "<없음>")}`,
    };
  }
  for (let index = 0; index < expectedNumbers.length; index += 1) {
    const difference = Math.abs(Number(actualNumbers[index]) - Number(expectedNumbers[index]));
    if (!(difference <= CHECK_ABSOLUTE_TOLERANCE)) {
      return {
        upToDate: false,
        detail: `${index + 1}번째 숫자가 다릅니다: 디스크 ${actualNumbers[index]}, 기대 ${expectedNumbers[index]} (허용 오차 ${CHECK_ABSOLUTE_TOLERANCE})`,
      };
    }
  }
  return { upToDate: true, detail: `숫자 ${expectedNumbers.length}개가 허용 오차 ${CHECK_ABSOLUTE_TOLERANCE} 안에서 일치합니다.` };
}

/** 생성 파일이 현재 생성기 출력과 같은지 확인한다. */
export function checkGeneratedModel(root: string = REPO_ROOT): CheckResult {
  const target = path.join(root, GENERATED_MODEL_RELATIVE_PATH);
  if (!existsSync(target)) return { upToDate: false, detail: `${GENERATED_MODEL_RELATIVE_PATH} 가 없습니다.` };
  return compareGeneratedText(readFileSync(target, "utf8"), renderLatentPigmentModelModule(buildLatentPigmentModel()));
}

function formatStats(stats: FitErrorStats): string {
  return `평균 ${stats.meanEightBit.toFixed(2)} · p99 ${stats.p99EightBit.toFixed(2)} · 최대 ${stats.maxEightBit.toFixed(2)} (/255, ${stats.sampleCount}점)`;
}

function printReport(): void {
  const model = buildLatentPigmentModel();
  const { settings } = model;
  const coverage = measureCoverage(model.coefficients);
  console.log("잠재 안료 모델 요약");
  console.log(`  기저 ${LATENT_PIGMENT_BASIS_ID} · 개정 ${settings.modelRevision} · 농도 지수 ${settings.concentrationExponent} · 꼭짓점 가중치 ${settings.vertexWeight} · 검열 적합 ${settings.censored}`);
  console.log(`  QR 대각 비(최소/최대): ${model.diagonalRatio.toExponential(2)} — 릿지 없이 풀었다`);
  console.log(`  적합 표본 ${formatStats(model.training)}`);
  if (model.validation) console.log(`  검증 표본 ${formatStats(model.validation)}`);
  const fitGrid = buildSimplexGrid(settings.fitGridDivisions);
  const worst = findWorstFitPoint(
    model.coefficients,
    fitGrid,
    fitGrid.map((point) => sampleEncodedColor(model.pigments, point, settings.concentrationExponent)),
  );
  console.log(`  적합 표본의 최대 오차 위치: 농도 (${worst.point.map((value) => value.toFixed(2)).join(", ")}) · ${["R", "G", "B"][worst.channel]} 채널 · ${worst.errorEightBit.toFixed(2)}/255`);
  console.log(`  실사용 색 27개까지의 최근접 거리: 평균 ${coverage.typicalMeanEightBit.toFixed(1)} · 최대 ${coverage.typicalMaxEightBit.toFixed(1)} (/255), sRGB 원색 6개 평균 ${coverage.primariesMeanEightBit.toFixed(1)}`);
  console.log("  순수 안료 꼭짓점(0~255):");
  model.pigments.forEach((pigment, index) => {
    console.log(`    ${pigment.id.padEnd(8)} 산란 ${pigment.scattering} -> ${model.vertexEightBit[index].join(", ")}  ${pigment.label}`);
  });
  const names = model.pigments.map((pigment) => pigment.id);
  const hex = (color: EncodedColor): string => `#${color.map((value) => Math.round(clamp01(value) * EIGHT_BIT).toString(16).padStart(2, "0")).join("")}`;
  console.log("  KM 결과, 흰색+노랑=파랑=자홍 등량 혼합축(중립에 가까워야 한다; R,G,B 와 채널 편차):");
  for (const colorant of [0.05, 0.1, 0.2, 1 / 3]) {
    const axisPoint: Concentrations = [1 - 3 * colorant, colorant, colorant, colorant];
    const axisColor = sampleEncodedColor(model.pigments, axisPoint, settings.concentrationExponent).map((value) => Math.round(clamp01(value) * EIGHT_BIT));
    console.log(`    안료 각 ${colorant.toFixed(3)} (흰색 ${axisPoint[0].toFixed(3)}) -> ${axisColor.join(", ")}  편차 ${Math.max(...axisColor) - Math.min(...axisColor)}`);
  }
  console.log("  KM 결과(참고, 농도 균등 혼합):");
  for (let first = 0; first < LATENT_PIGMENT_COUNT; first += 1) {
    for (let second = first + 1; second < LATENT_PIGMENT_COUNT; second += 1) {
      const point = pairMidpoint(first, second);
      console.log(`    ${names[first]}+${names[second]}`.padEnd(22) + hex(sampleEncodedColor(model.pigments, point, settings.concentrationExponent)));
    }
  }
}

/** 안료 두 개를 반반 섞은 농도. */
function pairMidpoint(first: number, second: number): Concentrations {
  const values: [number, number, number, number] = [0, 0, 0, 0];
  values[first] = 0.5;
  values[second] = 0.5;
  return values;
}

function printSweep(): void {
  console.log("설계 변수 비교(적합 표본 기준, 검증 격자 생략). 채택안은 지수 1.75 · 검열 사용 · 하한 배율 1.");
  console.log("지수 | 검열 | 하한 배율 | 적합 평균 | p99 | 최대 | 실사용 색 평균 거리 | 최대 거리");
  const variants: readonly Partial<LatentPigmentGeneratorSettings>[] = [
    { concentrationExponent: 1, censored: false, reflectanceFloorScale: 4 },
    { concentrationExponent: 1.5, censored: false, reflectanceFloorScale: 4 },
    { concentrationExponent: 1, censored: true, reflectanceFloorScale: 1 },
    { concentrationExponent: 1.5, censored: true, reflectanceFloorScale: 1 },
    { concentrationExponent: 1.75, censored: true, reflectanceFloorScale: 1 },
    { concentrationExponent: 2, censored: true, reflectanceFloorScale: 1 },
    { concentrationExponent: 1.75, censored: false, reflectanceFloorScale: 1 },
    { concentrationExponent: 1.75, censored: true, reflectanceFloorScale: 4 },
  ];
  for (const variant of variants) {
    const model = buildLatentPigmentModel({ ...DEFAULT_GENERATOR_SETTINGS, ...variant }, false);
    const coverage = measureCoverage(model.coefficients);
    console.log([
      String(model.settings.concentrationExponent).padStart(4),
      (model.settings.censored ? "예" : "아니오").padStart(5),
      String(model.settings.reflectanceFloorScale).padStart(9),
      model.training.meanEightBit.toFixed(2).padStart(9),
      model.training.p99EightBit.toFixed(2).padStart(6),
      model.training.maxEightBit.toFixed(2).padStart(6),
      coverage.typicalMeanEightBit.toFixed(1).padStart(8),
      coverage.typicalMaxEightBit.toFixed(1).padStart(8),
    ].join(" | "));
  }
}

const USAGE = [
  "사용법: tsx scripts/generate-latent-pigment-model.mts [--check | --report | --sweep]",
  "  (인자 없음) 생성 파일을 쓴다",
  "  --check     생성 파일이 최신인지 검증한다(최신이 아니면 종료 코드 1)",
  "  --report    모델 요약을 출력한다(파일을 쓰지 않는다)",
  "  --sweep     설계 변수 비교표를 출력한다(파일을 쓰지 않는다)",
].join("\n");

function main(argv: readonly string[]): void {
  const flags = new Set(argv);
  const known = ["--check", "--report", "--sweep"];
  if (argv.length > 1 || argv.some((argument) => !known.includes(argument))) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  if (flags.has("--report")) {
    printReport();
    return;
  }
  if (flags.has("--sweep")) {
    printSweep();
    return;
  }
  if (flags.has("--check")) {
    const result = checkGeneratedModel();
    if (!result.upToDate) {
      console.error(`${GENERATED_MODEL_RELATIVE_PATH} 가 최신이 아닙니다.`);
      console.error(result.detail);
      console.error("다음 명령으로 다시 생성하세요: pnpm run generate:latent-pigment-model");
      process.exitCode = 1;
      return;
    }
    console.log(`${GENERATED_MODEL_RELATIVE_PATH} 는 최신입니다. ${result.detail}`);
    return;
  }
  const text = renderLatentPigmentModelModule(buildLatentPigmentModel());
  const target = path.join(REPO_ROOT, GENERATED_MODEL_RELATIVE_PATH);
  if (existsSync(target) && readFileSync(target, "utf8") === text) {
    console.log(`${GENERATED_MODEL_RELATIVE_PATH} 는 이미 최신이라 쓰지 않았습니다.`);
    return;
  }
  writeFileSync(target, text);
  console.log(`${GENERATED_MODEL_RELATIVE_PATH} 를 썼습니다.`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
