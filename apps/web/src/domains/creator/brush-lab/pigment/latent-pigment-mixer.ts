/**
 * 잠재 안료 혼합기(toonstudio-latent-pigment-v1) — 순수 TypeScript, 결정적, 난수·네트워크 없음.
 *
 * 구조
 *  - 잠재 색 = 안료 4종의 농도(음수가 아니고 합이 1) + 3채널 잔차. 숫자 7개다.
 *  - 농도 → 색: 채널마다 네 변수 3차 동차 다항식 20항(계수는 latent-pigment-model.generated.ts).
 *    계수는 합성 기준 안료 4종을 저장소의 Kubelka–Munk 31밴드 파이프라인으로 섞은 표본에 최소제곱으로
 *    적합한 것이다. 원본 Mixbox의 코드·계수·격자표·안료 상수는 쓰지 않았다.
 *  - 색 → 농도: 다항식이 만드는 색이 입력 색에 가장 가까워지는 농도를 단체(simplex) 위에서 반복 풀이로 구한다.
 *    첫 사용 때 작은 시작점 표를 만들고(데이터 파일 없음), 가까운 시작점 몇 개에서 활성 집합 Levenberg–Marquardt를
 *    돌려 가장 좋은 해를 고른다.
 *  - 잔차 = 입력 색 − (0~1로 자른 다항식 색). 입력 색을 다항식이 만들 수 없는 경우(안료 색역 밖)에도
 *    왕복이 무손실이도록 담는 값이며 자르지 않는다.
 *  - 혼합 = 농도와 잔차의 가중 평균(선형 보간) 뒤 `자른 다항식 색 + 잔차`를 0~1로 자른다.
 *
 * 입출력 색은 감마 인코딩된 sRGB(0~1)다. 선형 RGB가 필요하면 호출자가 변환한다.
 * 알려진 한계(색역·겹침 영역·어두운 색)는 docs/features/latent-pigment-mixing.md 에 적었다.
 */
import {
  LATENT_PIGMENT_BASIS_ID,
  LATENT_PIGMENT_CHANNEL_COUNT,
  LATENT_PIGMENT_COUNT,
  LATENT_PIGMENT_TERMS,
  LATENT_PIGMENT_TERM_COUNT,
} from "./latent-pigment-basis";
import {
  LATENT_PIGMENT_COEFFICIENTS,
  LATENT_PIGMENT_MODEL_BASIS_ID,
} from "./latent-pigment-model.generated";

export type LatentPigmentRgb = readonly [red: number, green: number, blue: number];
export type LatentPigmentConcentrations = readonly [number, number, number, number];

export interface LatentPigment {
  /** 기준 안료 4종의 농도(흰색, 노랑, 파랑, 자홍 순). 0 이상이고 합이 1이다. */
  readonly concentrations: LatentPigmentConcentrations;
  /** 입력 색 − 자른 다항식 색. 자르지 않는다. */
  readonly residual: LatentPigmentRgb;
}

export interface WeightedLatentPigment {
  readonly latent: LatentPigment;
  readonly weight: number;
}

export interface WeightedRgbPigment {
  readonly rgb: LatentPigmentRgb;
  readonly weight: number;
}

// import한 상수를 핫 루프에서 매번 읽으면 번들·변환 방식에 따라 getter 호출이 되므로 모듈 지역 상수로 복사한다.
const VARIABLES = LATENT_PIGMENT_COUNT;
const CHANNELS = LATENT_PIGMENT_CHANNEL_COUNT;
const TERMS = LATENT_PIGMENT_TERM_COUNT;

/** 시작점 표의 격자 분할 수(분할 10이면 286점). */
const START_GRID_DIVISIONS = 10;
/**
 * 시작점 후보 수. 다항식 상(像)이 접힌 곳이 있어 가까운 시작점들이 같은 국소 최소로 몰리므로 하나로는
 * 부족하다(실측: 색역 안 색 2만 개 중 시작점 1개는 160개, 서로 비슷한 2개는 23개를 놓침).
 */
const START_CANDIDATES = 2;
/**
 * 두 번째 이후 후보는 앞선 후보와 농도 공간(L∞)에서 이만큼 이상 떨어진 시작점 중 색이 가장 가까운 것을 고른다.
 * 같은 분지로 가는 이웃을 중복해서 풀지 않고 다른 접힌 면을 시도한다(같은 조건에서 놓침 1개, 최대 오차 5e-4).
 */
const START_SEPARATION = 0.3;
const MAXIMUM_ITERATIONS = 40;
/** 가중 목적함수가 이 값보다 작으면 수렴한 것으로 본다(색 오차 약 1e-7). */
const OBJECTIVE_TOLERANCE = 1e-14;
/** 걸음의 최대 변화가 이 값보다 작으면 멈춘다(농도 정밀도 1e-6이면 색 오차는 1e-5 이하). */
const STEP_TOLERANCE = 1e-6;
/** 목적함수의 상대 감소가 이 값 이하면 멈춘다. 색역 밖 색에서 평평한 골짜기를 끝없이 따라가지 않기 위해서다. */
const RELATIVE_DECREASE_TOLERANCE = 1e-9;
/** 농도가 이 값 이하면 경계(0)에 있는 것으로 본다. */
const BOUND_TOLERANCE = 1e-12;
const RELEASE_TOLERANCE = 1e-10;
/** 0~1 밖의 다항식 값을 목적함수에서 줄이는 비율. 경계 근처에서 해가 연속이도록 완전히 평평하게 두지 않는다. */
const LEAK = 0.1;
/**
 * 목적함수에서 명도(무채색 축) 성분 오차의 가중치. 색도 성분은 1이다. 안료 색역 밖의 색(순검정 등)은 정확히
 * 맞출 수 없는데, 이때 명도를 양보하고 색도를 지키도록 해서 검정이 청록빛 어두운 색으로 풀리는 것을 막는다.
 * 색역 안의 색은 해가 정확히 존재하므로 이 값과 무관하다.
 */
const LUMINANCE_WEIGHT = 0.25;
/** 가중 변환 r' = r + shift * mean(r) 의 shift = sqrt(w) - 1. */
const LUMINANCE_SHIFT = Math.sqrt(LUMINANCE_WEIGHT) - 1;
/** 잠재 색 검증에서 농도 합이 1에서 벗어나도 되는 허용치. */
const SUM_TOLERANCE = 1e-6;
const NEGATIVE_TOLERANCE = 1e-9;

interface Scratch {
  readonly terms: Float64Array;
  readonly polynomial: Float64Array;
  readonly trialPolynomial: Float64Array;
  readonly jacobian: Float64Array;
  readonly residualVector: Float64Array;
  readonly gradient: Float64Array;
  readonly delta: Float64Array;
  readonly trial: Float64Array;
  readonly free: Int32Array;
  readonly reduced: Float64Array;
  readonly normal: Float64Array;
  readonly rhs: Float64Array;
  readonly solution: Float64Array;
  readonly target: Float64Array;
  readonly trialResidual: Float64Array;
  readonly current: Float64Array;
  readonly best: Float64Array;
  readonly startOrder: Int32Array;
}

interface Runtime {
  /** 채널 우선 평탄 배열: coefficients[channel * 20 + term]. */
  readonly coefficients: Float64Array;
  /** termIndex[term * 3 + position]. */
  readonly termIndex: Int32Array;
  readonly startCount: number;
  readonly startConcentrations: Float64Array;
  /** 시작점의 목적함수용 색(자르기 전 값을 leak 적용한 값). */
  readonly startColors: Float64Array;
  readonly scratch: Scratch;
}

let runtime: Runtime | null = null;

/** 진단용: 첫 사용 전에는 false다(모듈을 불러오는 것만으로는 초기화하지 않는다). */
export function isLatentPigmentMixerInitialized(): boolean {
  return runtime !== null;
}

function leaky(value: number): number {
  if (value < 0) return LEAK * value;
  if (value > 1) return 1 + LEAK * (value - 1);
  return value;
}

function leakySlope(value: number): number {
  return value < 0 || value > 1 ? LEAK : 1;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** 농도 4개에서 다항식 값(자르기 전) 3채널을 `out`에 채운다. */
function evaluatePolynomial(model: Runtime, concentrations: Float64Array, out: Float64Array): void {
  const { termIndex, coefficients } = model;
  const { terms } = model.scratch;
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

/** 다항식 값의 농도 편미분을 jacobian[channel * 4 + variable]에 채운다(leak 기울기 포함). */
function evaluateJacobian(model: Runtime, concentrations: Float64Array, polynomial: Float64Array): void {
  const { termIndex, coefficients } = model;
  const { jacobian } = model.scratch;
  jacobian.fill(0);
  for (let term = 0; term < TERMS; term += 1) {
    const first = termIndex[term * 3];
    const second = termIndex[term * 3 + 1];
    const third = termIndex[term * 3 + 2];
    const a = concentrations[first];
    const b = concentrations[second];
    const c = concentrations[third];
    const dFirst = b * c;
    const dSecond = a * c;
    const dThird = a * b;
    for (let channel = 0; channel < CHANNELS; channel += 1) {
      const coefficient = coefficients[channel * TERMS + term];
      const row = channel * VARIABLES;
      jacobian[row + first] += coefficient * dFirst;
      jacobian[row + second] += coefficient * dSecond;
      jacobian[row + third] += coefficient * dThird;
    }
  }
  for (let channel = 0; channel < CHANNELS; channel += 1) {
    const slope = leakySlope(polynomial[channel]);
    for (let variable = 0; variable < VARIABLES; variable += 1) jacobian[channel * VARIABLES + variable] *= slope;
  }
  // 목적함수와 같은 가중 변환을 열(변수)마다 적용한다.
  for (let variable = 0; variable < VARIABLES; variable += 1) {
    const shift = LUMINANCE_SHIFT * ((jacobian[variable] + jacobian[VARIABLES + variable] + jacobian[2 * VARIABLES + variable]) / 3);
    jacobian[variable] += shift;
    jacobian[VARIABLES + variable] += shift;
    jacobian[2 * VARIABLES + variable] += shift;
  }
}

/**
 * 가중 목적함수 f = ‖W (leak(P) − t)‖². W는 명도 성분에만 sqrt(LUMINANCE_WEIGHT)를 곱하는 변환이다.
 * 변환된 채널 잔차는 residualVector에 채운다.
 */
function objective(polynomial: Float64Array, target: Float64Array, residualVector: Float64Array): number {
  const red = leaky(polynomial[0]) - target[0];
  const green = leaky(polynomial[1]) - target[1];
  const blue = leaky(polynomial[2]) - target[2];
  const shift = LUMINANCE_SHIFT * ((red + green + blue) / 3);
  residualVector[0] = red + shift;
  residualVector[1] = green + shift;
  residualVector[2] = blue + shift;
  return residualVector[0] * residualVector[0] + residualVector[1] * residualVector[1] + residualVector[2] * residualVector[2];
}

/** 작은 대칭 양의 정부호 시스템(n<=3)을 Cholesky로 푼다. 실패하면 false. */
function solveSmallSpd(matrix: Float64Array, rhs: Float64Array, size: number, solution: Float64Array): boolean {
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let sum = matrix[row * size + column];
      for (let k = 0; k < column; k += 1) sum -= matrix[row * size + k] * matrix[column * size + k];
      if (row === column) {
        if (!(sum > 1e-300)) return false;
        matrix[row * size + row] = Math.sqrt(sum);
      } else {
        matrix[row * size + column] = sum / matrix[column * size + column];
      }
    }
  }
  for (let row = 0; row < size; row += 1) {
    let sum = rhs[row];
    for (let k = 0; k < row; k += 1) sum -= matrix[row * size + k] * solution[k];
    solution[row] = sum / matrix[row * size + row];
  }
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = solution[row];
    for (let k = row + 1; k < size; k += 1) sum -= matrix[k * size + row] * solution[k];
    solution[row] = sum / matrix[row * size + row];
  }
  return true;
}

/**
 * 합이 1인 등식 제약 아래 자유 변수 집합 `free`에서 Levenberg–Marquardt 걸음 delta를 계산한다.
 * 자유 변수 n개를 n-1개의 차분 좌표로 줄여 푼다. 풀 수 없으면 false.
 */
function computeStep(model: Runtime, freeCount: number, damping: number): boolean {
  const { jacobian, residualVector, free, reduced, normal, rhs, solution, delta } = model.scratch;
  const size = freeCount - 1;
  const anchor = free[freeCount - 1];
  for (let column = 0; column < size; column += 1) {
    for (let channel = 0; channel < CHANNELS; channel += 1) {
      reduced[channel * size + column] = jacobian[channel * VARIABLES + free[column]]
        - jacobian[channel * VARIABLES + anchor];
    }
  }
  for (let row = 0; row < size; row += 1) {
    let right = 0;
    for (let channel = 0; channel < CHANNELS; channel += 1) right -= reduced[channel * size + row] * residualVector[channel];
    rhs[row] = right;
    for (let column = 0; column < size; column += 1) {
      let sum = row === column ? damping : 0;
      for (let channel = 0; channel < CHANNELS; channel += 1) sum += reduced[channel * size + row] * reduced[channel * size + column];
      normal[row * size + column] = sum;
    }
  }
  if (!solveSmallSpd(normal, rhs, size, solution)) return false;
  delta.fill(0);
  let total = 0;
  for (let column = 0; column < size; column += 1) {
    delta[free[column]] = solution[column];
    total += solution[column];
  }
  delta[anchor] = -total;
  return true;
}

/**
 * `concentrations`에서 시작해 단체 위 최소제곱 해로 다듬는다(제자리 갱신). 최종 목적함수 값을 돌려준다.
 * 경계(농도 0)에 있는 변수는 라그랑주 승수가 풀어 줄 때만 자유 변수로 되돌린다.
 */
function refine(model: Runtime, concentrations: Float64Array): number {
  const scratch = model.scratch;
  const { polynomial, trialPolynomial, residualVector, trialResidual, gradient, free, delta, trial, jacobian, target } = scratch;
  let damping = 1e-3;
  evaluatePolynomial(model, concentrations, polynomial);
  let current = objective(polynomial, target, residualVector);
  for (let iteration = 0; iteration < MAXIMUM_ITERATIONS && current > OBJECTIVE_TOLERANCE; iteration += 1) {
    const previousObjective = current;
    evaluateJacobian(model, concentrations, polynomial);
    for (let variable = 0; variable < VARIABLES; variable += 1) {
      let sum = 0;
      for (let channel = 0; channel < CHANNELS; channel += 1) {
        sum += jacobian[channel * VARIABLES + variable] * residualVector[channel];
      }
      gradient[variable] = sum;
    }
    let interiorCount = 0;
    let interiorSum = 0;
    for (let variable = 0; variable < VARIABLES; variable += 1) {
      if (concentrations[variable] > BOUND_TOLERANCE) {
        interiorCount += 1;
        interiorSum += gradient[variable];
      }
    }
    if (interiorCount === 0) break;
    const multiplier = interiorSum / interiorCount;
    let freeCount = 0;
    for (let variable = 0; variable < VARIABLES; variable += 1) {
      if (concentrations[variable] > BOUND_TOLERANCE || gradient[variable] - multiplier < -RELEASE_TOLERANCE) {
        free[freeCount] = variable;
        freeCount += 1;
      }
    }
    let accepted = false;
    let stepSize = 0;
    for (let attempt = 0; attempt < 14 && freeCount >= 2; attempt += 1) {
      if (!computeStep(model, freeCount, damping)) {
        damping *= 10;
        continue;
      }
      let shrunk = false;
      for (let position = 0; position < freeCount; position += 1) {
        const variable = free[position];
        if (concentrations[variable] <= BOUND_TOLERANCE && delta[variable] < 0) {
          for (let shift = position; shift < freeCount - 1; shift += 1) free[shift] = free[shift + 1];
          freeCount -= 1;
          shrunk = true;
          break;
        }
      }
      if (shrunk) continue;
      let alpha = 1;
      let blocking = -1;
      for (let position = 0; position < freeCount; position += 1) {
        const variable = free[position];
        if (delta[variable] < 0) {
          const limit = concentrations[variable] / -delta[variable];
          if (limit < alpha) {
            alpha = limit;
            blocking = variable;
          }
        }
      }
      let total = 0;
      for (let variable = 0; variable < VARIABLES; variable += 1) {
        const next = concentrations[variable] + alpha * delta[variable];
        trial[variable] = next > BOUND_TOLERANCE && variable !== blocking ? next : 0;
        total += trial[variable];
      }
      if (!(total > 0)) {
        damping *= 10;
        continue;
      }
      for (let variable = 0; variable < VARIABLES; variable += 1) trial[variable] /= total;
      evaluatePolynomial(model, trial, trialPolynomial);
      const candidate = objective(trialPolynomial, target, trialResidual);
      if (candidate < current) {
        stepSize = 0;
        for (let variable = 0; variable < VARIABLES; variable += 1) {
          stepSize = Math.max(stepSize, Math.abs(trial[variable] - concentrations[variable]));
          concentrations[variable] = trial[variable];
        }
        polynomial.set(trialPolynomial);
        residualVector.set(trialResidual);
        current = candidate;
        accepted = true;
        break;
      }
      damping *= 10;
    }
    if (!accepted) break;
    damping = Math.max(damping * 0.25, 1e-12);
    if (stepSize < STEP_TOLERANCE || previousObjective - current <= RELATIVE_DECREASE_TOLERANCE * previousObjective) break;
  }
  return current;
}

/** 입력 색에 가장 가까운 농도를 구한다. 결과는 `scratch.best`(길이 4)에 담긴다. */
function solveConcentrations(model: Runtime, rgb: LatentPigmentRgb): void {
  const scratch = model.scratch;
  const { target, startOrder, current, best } = scratch;
  target[0] = rgb[0];
  target[1] = rgb[1];
  target[2] = rgb[2];
  startOrder.fill(-1);
  const { startColors, startConcentrations, startCount } = model;
  for (let rank = 0; rank < START_CANDIDATES; rank += 1) {
    let bestStart = -1;
    let bestDistance = Infinity;
    for (let start = 0; start < startCount; start += 1) {
      let separated = true;
      for (let chosen = 0; chosen < rank && separated; chosen += 1) {
        let apart = 0;
        for (let variable = 0; variable < VARIABLES; variable += 1) {
          apart = Math.max(apart, Math.abs(startConcentrations[start * VARIABLES + variable] - startConcentrations[startOrder[chosen] * VARIABLES + variable]));
        }
        separated = apart >= START_SEPARATION;
      }
      if (!separated) continue;
      const dr = startColors[start * 3] - target[0];
      const dg = startColors[start * 3 + 1] - target[1];
      const db = startColors[start * 3 + 2] - target[2];
      const offset = LUMINANCE_SHIFT * ((dr + dg + db) / 3);
      const distance = (dr + offset) * (dr + offset) + (dg + offset) * (dg + offset) + (db + offset) * (db + offset);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestStart = start;
      }
    }
    if (bestStart < 0) break;
    startOrder[rank] = bestStart;
  }
  let bestObjective = Infinity;
  for (let candidate = 0; candidate < START_CANDIDATES; candidate += 1) {
    const start = startOrder[candidate];
    if (start < 0) break;
    for (let variable = 0; variable < VARIABLES; variable += 1) {
      current[variable] = model.startConcentrations[start * VARIABLES + variable];
    }
    const value = refine(model, current);
    const finite = current.every(Number.isFinite);
    if (finite && value < bestObjective) {
      bestObjective = value;
      best.set(current);
    }
    if (bestObjective <= OBJECTIVE_TOLERANCE) break;
  }
  if (!Number.isFinite(bestObjective)) {
    // 수치가 깨졌을 때도 결정적인 값을 돌려준다(가장 가까운 시작점).
    const start = startOrder[0] >= 0 ? startOrder[0] : 0;
    for (let variable = 0; variable < VARIABLES; variable += 1) {
      best[variable] = model.startConcentrations[start * VARIABLES + variable];
    }
  }
  let total = 0;
  for (let variable = 0; variable < VARIABLES; variable += 1) {
    best[variable] = best[variable] > 0 ? best[variable] : 0;
    total += best[variable];
  }
  for (let variable = 0; variable < VARIABLES; variable += 1) best[variable] /= total;
}

function createRuntime(): Runtime {
  if (LATENT_PIGMENT_MODEL_BASIS_ID !== LATENT_PIGMENT_BASIS_ID) {
    throw new Error("잠재 안료 모델 상수가 현재 다항식 기저와 맞지 않습니다. 모델을 다시 생성하세요.");
  }
  if (
    LATENT_PIGMENT_COEFFICIENTS.length !== CHANNELS
    || LATENT_PIGMENT_COEFFICIENTS.some((channel) => channel.length !== TERMS)
  ) {
    throw new Error("잠재 안료 모델 계수의 모양이 맞지 않습니다. 모델을 다시 생성하세요.");
  }
  const coefficients = new Float64Array(CHANNELS * TERMS);
  LATENT_PIGMENT_COEFFICIENTS.forEach((channel, channelIndex) => {
    coefficients.set(channel, channelIndex * TERMS);
  });
  const termIndex = new Int32Array(TERMS * 3);
  LATENT_PIGMENT_TERMS.forEach((term, index) => termIndex.set(term, index * 3));
  const pointCount = ((START_GRID_DIVISIONS + 1) * (START_GRID_DIVISIONS + 2) * (START_GRID_DIVISIONS + 3)) / 6;
  const startConcentrations = new Float64Array(pointCount * VARIABLES);
  const startColors = new Float64Array(pointCount * CHANNELS);
  const scratch: Scratch = {
    terms: new Float64Array(TERMS),
    polynomial: new Float64Array(CHANNELS),
    trialPolynomial: new Float64Array(CHANNELS),
    jacobian: new Float64Array(CHANNELS * VARIABLES),
    residualVector: new Float64Array(CHANNELS),
    gradient: new Float64Array(VARIABLES),
    delta: new Float64Array(VARIABLES),
    trial: new Float64Array(VARIABLES),
    free: new Int32Array(VARIABLES),
    reduced: new Float64Array(CHANNELS * (VARIABLES - 1)),
    normal: new Float64Array((VARIABLES - 1) * (VARIABLES - 1)),
    rhs: new Float64Array(VARIABLES - 1),
    solution: new Float64Array(VARIABLES - 1),
    target: new Float64Array(CHANNELS),
    trialResidual: new Float64Array(CHANNELS),
    current: new Float64Array(VARIABLES),
    best: new Float64Array(VARIABLES),
    startOrder: new Int32Array(START_CANDIDATES),
  };
  const model: Runtime = {
    coefficients,
    termIndex,
    startCount: pointCount,
    startConcentrations,
    startColors,
    scratch,
  };
  const point = new Float64Array(VARIABLES);
  const color = new Float64Array(CHANNELS);
  let index = 0;
  for (let a = 0; a <= START_GRID_DIVISIONS; a += 1) {
    for (let b = 0; a + b <= START_GRID_DIVISIONS; b += 1) {
      for (let c = 0; a + b + c <= START_GRID_DIVISIONS; c += 1) {
        point[0] = a / START_GRID_DIVISIONS;
        point[1] = b / START_GRID_DIVISIONS;
        point[2] = c / START_GRID_DIVISIONS;
        point[3] = (START_GRID_DIVISIONS - a - b - c) / START_GRID_DIVISIONS;
        evaluatePolynomial(model, point, color);
        startConcentrations.set(point, index * VARIABLES);
        for (let channel = 0; channel < CHANNELS; channel += 1) {
          startColors[index * CHANNELS + channel] = leaky(color[channel]);
        }
        index += 1;
      }
    }
  }
  return model;
}

function getRuntime(): Runtime {
  if (runtime === null) runtime = createRuntime();
  return runtime;
}

function isList(value: unknown, length: number): value is ArrayLike<unknown> {
  return typeof value === "object" && value !== null && "length" in value && value.length === length;
}

/** 길이와 각 원소를 검증해 숫자 배열로 복사한다. 유한한 수가 아니거나 `rule`을 어기면 `requirement`를 담아 거부한다. */
function readNumbers(
  value: unknown,
  length: number,
  label: string,
  rule: (item: number) => boolean,
  requirement: string,
): number[] {
  if (!isList(value, length)) throw new TypeError(`${label}은 길이 ${length}의 숫자 배열이어야 합니다.`);
  const result: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const item = value[index];
    if (typeof item !== "number" || !Number.isFinite(item) || !rule(item)) {
      throw new RangeError(`${label}의 ${index}번째 값은 ${requirement}(받은 값: ${String(item)}).`);
    }
    result.push(item);
  }
  return result;
}

function readRgb(value: unknown, label: string): LatentPigmentRgb {
  const [red, green, blue] = readNumbers(value, 3, label, (item) => item >= 0 && item <= 1, "0~1 사이의 유한한 수여야 합니다");
  return [red, green, blue];
}

function readLatent(value: unknown, label: string): LatentPigment {
  if (typeof value !== "object" || value === null || !("concentrations" in value) || !("residual" in value)) {
    throw new TypeError(`${label}에는 concentrations와 residual이 필요합니다.`);
  }
  const concentrations = readNumbers(
    value.concentrations,
    VARIABLES,
    `${label}.concentrations`,
    (item) => item >= -NEGATIVE_TOLERANCE,
    "0 이상의 유한한 수여야 합니다",
  );
  const total = concentrations.reduce((sum, item) => sum + item, 0);
  if (!(Math.abs(total - 1) <= SUM_TOLERANCE)) {
    throw new RangeError(`${label}의 농도 합은 1이어야 합니다(받은 합: ${String(total)}).`);
  }
  const [red, green, blue] = readNumbers(value.residual, 3, `${label}.residual`, () => true, "유한한 수여야 합니다");
  return {
    concentrations: [concentrations[0], concentrations[1], concentrations[2], concentrations[3]],
    residual: [red, green, blue],
  };
}

function readLatentEntry(entry: unknown, index: number): WeightedLatentPigment {
  if (typeof entry !== "object" || entry === null || !("latent" in entry) || !("weight" in entry)) {
    throw new TypeError(`entries[${index}]에는 latent와 weight가 필요합니다.`);
  }
  return { latent: readLatent(entry.latent, `entries[${index}].latent`), weight: readWeight(entry.weight, `entries[${index}]`) };
}

function readRgbEntry(entry: unknown, index: number): WeightedRgbPigment {
  if (typeof entry !== "object" || entry === null || !("rgb" in entry) || !("weight" in entry)) {
    throw new TypeError(`entries[${index}]에는 rgb와 weight가 필요합니다.`);
  }
  return { rgb: readRgb(entry.rgb, `entries[${index}].rgb`), weight: readWeight(entry.weight, `entries[${index}]`) };
}

function readWeight(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label}의 가중치는 0 이상의 유한한 수여야 합니다(받은 값: ${String(value)}).`);
  }
  return value;
}

/** 가중치를 합 1로 정규화한다. 가장 큰 값으로 먼저 나눠 합이 넘치거나 사라지는 일을 막는다. */
function normalizeWeights(weights: readonly number[]): readonly number[] {
  if (weights.length === 0) throw new RangeError("섞을 색이 하나 이상 필요합니다.");
  const largest = weights.reduce((a, b) => Math.max(a, b), 0);
  if (!(largest > 0)) throw new RangeError("가중치 합이 0보다 커야 합니다.");
  const scaled = weights.map((weight) => weight / largest);
  const total = scaled.reduce((sum, weight) => sum + weight, 0);
  return scaled.map((weight) => weight / total);
}

function tuple3(a: number, b: number, c: number): LatentPigmentRgb {
  return Object.freeze([a, b, c] as const);
}

/** 가중치가 0이라 혼합에 기여하지 않는 항목이 풀이 없이 쓰는 자리 표시용 잠재 색. */
const NEUTRAL_LATENT: LatentPigment = Object.freeze({
  concentrations: Object.freeze([1, 0, 0, 0] as const),
  residual: tuple3(0, 0, 0),
});

const LATENT_CACHE_CAPACITY = 2048;
const latentExactCache = new Map<string, LatentPigment>();
let latentCacheHits = 0;
let latentCacheMisses = 0;

function makeExactRgbCacheKey(rgb: LatentPigmentRgb): string {
  return `${rgb[0]},${rgb[1]},${rgb[2]}`;
}

export interface LatentPigmentCacheStats {
  readonly size: number;
  readonly capacity: number;
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
}

/** 잠재 안료 역변환 캐시 통계를 반환한다(초기화 상태를 바꾸지 않는다). */
export function getLatentPigmentCacheStats(): LatentPigmentCacheStats {
  const total = latentCacheHits + latentCacheMisses;
  return {
    size: latentExactCache.size,
    capacity: LATENT_CACHE_CAPACITY,
    hits: latentCacheHits,
    misses: latentCacheMisses,
    hitRate: total > 0 ? latentCacheHits / total : 0,
  };
}

/** 잠재 안료 역변환 캐시를 비운다. */
export function clearLatentPigmentCache(): void {
  latentExactCache.clear();
  latentCacheHits = 0;
  latentCacheMisses = 0;
}

/**
 * RGB(감마 인코딩 sRGB, 0~1)를 잠재 색으로 바꾼다. 같은 입력은 항상 같은 결과를 낸다.
 * NaN·무한대·범위 밖 값은 거부한다.
 */
export function rgbToLatentPigment(rgb01: LatentPigmentRgb): LatentPigment {
  const rgb = readRgb(rgb01, "RGB");
  const model = getRuntime();
  const key = makeExactRgbCacheKey(rgb);
  const cached = latentExactCache.get(key);
  if (cached !== undefined) {
    latentCacheHits += 1;
    return cached;
  }
  latentCacheMisses += 1;
  solveConcentrations(model, rgb);
  const { best, polynomial } = model.scratch;
  evaluatePolynomial(model, best, polynomial);
  const result: LatentPigment = Object.freeze({
    concentrations: Object.freeze([best[0], best[1], best[2], best[3]] as const),
    residual: tuple3(
      rgb[0] - clamp01(polynomial[0]),
      rgb[1] - clamp01(polynomial[1]),
      rgb[2] - clamp01(polynomial[2]),
    ),
  });
  if (latentExactCache.size >= LATENT_CACHE_CAPACITY) {
    const oldestKey = latentExactCache.keys().next().value;
    if (oldestKey !== undefined) {
      latentExactCache.delete(oldestKey);
    }
  }
  latentExactCache.set(key, result);
  return result;
}

/** 잠재 색을 RGB(감마 인코딩 sRGB, 0~1)로 바꾼다. `자른 다항식 색 + 잔차`를 0~1로 자른다. */
export function latentPigmentToRgb(latent: LatentPigment): LatentPigmentRgb {
  const checked = readLatent(latent, "잠재 색");
  const model = getRuntime();
  const { current, polynomial } = model.scratch;
  for (let index = 0; index < VARIABLES; index += 1) current[index] = Math.max(0, checked.concentrations[index]);
  evaluatePolynomial(model, current, polynomial);
  return tuple3(
    clamp01(clamp01(polynomial[0]) + checked.residual[0]),
    clamp01(clamp01(polynomial[1]) + checked.residual[1]),
    clamp01(clamp01(polynomial[2]) + checked.residual[2]),
  );
}

/** 잠재 색들의 가중 평균. 가중치는 합 1로 정규화한다. 음수·NaN 가중치와 빈 목록은 거부한다. */
export function mixLatentPigments(entries: readonly WeightedLatentPigment[]): LatentPigment {
  const list: unknown = entries;
  if (!Array.isArray(list)) throw new TypeError("entries는 배열이어야 합니다.");
  const checked = list.map(readLatentEntry);
  const weights = normalizeWeights(checked.map((entry) => entry.weight));
  const concentrations = [0, 0, 0, 0];
  const residual = [0, 0, 0];
  checked.forEach(({ latent }, index) => {
    const weight = weights[index];
    if (weight === 0) return;
    for (let variable = 0; variable < VARIABLES; variable += 1) concentrations[variable] += weight * latent.concentrations[variable];
    for (let channel = 0; channel < 3; channel += 1) residual[channel] += weight * latent.residual[channel];
  });
  return Object.freeze({
    concentrations: Object.freeze([concentrations[0], concentrations[1], concentrations[2], concentrations[3]] as const),
    residual: tuple3(residual[0], residual[1], residual[2]),
  });
}

/** RGB 색들을 잠재 공간에서 섞어 RGB로 돌려준다. 가중치가 0인 색은 풀이하지 않는다. */
export function mixRgbPigments(entries: readonly WeightedRgbPigment[]): LatentPigmentRgb {
  const list: unknown = entries;
  if (!Array.isArray(list)) throw new TypeError("entries는 배열이어야 합니다.");
  const checked = list.map(readRgbEntry);
  const weights = normalizeWeights(checked.map((entry) => entry.weight));
  const mixed = mixLatentPigments(checked.map(({ rgb }, index) => ({
    latent: weights[index] === 0 ? NEUTRAL_LATENT : rgbToLatentPigment(rgb),
    weight: weights[index],
  })));
  return latentPigmentToRgb(mixed);
}

/**
 * 채도 보존 잠재 안료 혼합(Chroma-preserving latent pigment mix).
 * 단일 색(w=1)이나 동일 색 혼합에서는 입력 색을 무손실로 복원하며, 서로 다른 색의 중간 혼합에서
 * 선형 잔차 상쇄로 인한 탁화를 억제해 Kubelka-Munk 3차 다항식 기저의 순색 투과창을 극대화한다.
 */
export function mixRgbPigmentsChromaPreserving(
  entries: readonly WeightedRgbPigment[],
  chromaRetention = 0.45,
): LatentPigmentRgb {
  const list: unknown = entries;
  if (!Array.isArray(list)) throw new TypeError("entries는 배열이어야 합니다.");
  const checked = list.map(readRgbEntry);
  const weights = normalizeWeights(checked.map((entry) => entry.weight));
  const retention = clamp01(Number.isFinite(chromaRetention) ? chromaRetention : 0.45);

  const solved = checked.map(({ rgb }, index) => ({
    rgb,
    latent: weights[index] === 0 ? NEUTRAL_LATENT : rgbToLatentPigment(rgb),
    weight: weights[index],
  }));

  const concentrations = [0, 0, 0, 0];
  const linearResidual = [0, 0, 0];
  let puritySumSq = 0;

  for (const item of solved) {
    if (item.weight === 0) continue;
    puritySumSq += item.weight * item.weight;
    for (let variable = 0; variable < VARIABLES; variable += 1) {
      concentrations[variable] += item.weight * item.latent.concentrations[variable];
    }
    for (let channel = 0; channel < 3; channel += 1) {
      linearResidual[channel] += item.weight * item.latent.residual[channel];
    }
  }

  // 모든 유효 항목이 같은 색이면 감쇠 없이 100% 보존한다.
  const firstActive = solved.find((item) => item.weight > 0);
  const allSameColor =
    firstActive !== undefined &&
    solved.every(
      (item) =>
        item.weight === 0 ||
        (item.rgb[0] === firstActive.rgb[0] &&
          item.rgb[1] === firstActive.rgb[1] &&
          item.rgb[2] === firstActive.rgb[2]),
    );

  // puritySumSq는 단일 색에서 1, 2색 균등 혼합에서 0.5.
  const residualScale = allSameColor ? 1 : 1 - retention * (1 - puritySumSq);
  const mixedLatent: LatentPigment = Object.freeze({
    concentrations: Object.freeze([
      concentrations[0],
      concentrations[1],
      concentrations[2],
      concentrations[3],
    ] as const),
    residual: tuple3(
      linearResidual[0] * residualScale,
      linearResidual[1] * residualScale,
      linearResidual[2] * residualScale,
    ),
  });
  return latentPigmentToRgb(mixedLatent);
}

