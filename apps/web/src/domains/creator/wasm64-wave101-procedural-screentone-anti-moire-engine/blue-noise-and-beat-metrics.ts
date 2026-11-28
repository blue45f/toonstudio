/**
 * Wave 101 — 결정론적 16x16 Ulichney Void-and-Cluster 블루노이즈 행렬 & 2D 이항 저역통과 모아레 맥놀이 계측기.
 */

import { clampNumber } from "./nyquist-moire-frequency-analyzer";

const BLUE_NOISE_DIM = 16;
const BLUE_NOISE_CELLS = BLUE_NOISE_DIM * BLUE_NOISE_DIM;
const BLUE_NOISE_SIGMA = 1.5;

let cachedBlueNoiseMatrix: Float32Array | null = null;

export interface MoireBeatMetricSummary {
  readonly pixelVariance: number;
  readonly lowFreqBeatVariance: number;
  readonly rowColBeatVariance: number;
  readonly beatVariance: number;
  readonly moireEnergyRatio: number;
}

function buildToroidalGaussianKernel(): Float64Array {
  const kernel = new Float64Array(BLUE_NOISE_CELLS);
  const twoSigmaSq = 2 * BLUE_NOISE_SIGMA * BLUE_NOISE_SIGMA;
  for (let dy = 0; dy < BLUE_NOISE_DIM; dy += 1) {
    const wdy = Math.min(dy, BLUE_NOISE_DIM - dy);
    for (let dx = 0; dx < BLUE_NOISE_DIM; dx += 1) {
      const wdx = Math.min(dx, BLUE_NOISE_DIM - dx);
      kernel[dy * BLUE_NOISE_DIM + dx] = Math.exp(-(wdx * wdx + wdy * wdy) / twoSigmaSq);
    }
  }
  return kernel;
}

function addToroidalEnergy(
  energy: Float64Array,
  kernel: Float64Array,
  centerIndex: number,
  sign: number,
): void {
  const cx = centerIndex % BLUE_NOISE_DIM;
  const cy = (centerIndex - cx) / BLUE_NOISE_DIM;
  const mask = BLUE_NOISE_DIM - 1;
  for (let y = 0; y < BLUE_NOISE_DIM; y += 1) {
    const kRow = ((y - cy + BLUE_NOISE_DIM) & mask) * BLUE_NOISE_DIM;
    const eRow = y * BLUE_NOISE_DIM;
    for (let x = 0; x < BLUE_NOISE_DIM; x += 1) {
      energy[eRow + x] += sign * kernel[kRow + ((x - cx + BLUE_NOISE_DIM) & mask)];
    }
  }
}

function findExtremumIndex(
  binary: Uint8Array,
  energy: Float64Array,
  targetBit: 0 | 1,
  findMax: boolean,
): number {
  let bestIdx = -1;
  let bestVal = findMax ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (let i = 0; i < BLUE_NOISE_CELLS; i += 1) {
    if (binary[i] !== targetBit) continue;
    const val = energy[i];
    if (findMax ? val > bestVal : val < bestVal) {
      bestVal = val;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * 결정론적 16x16 Ulichney Void-and-Cluster 블루노이즈 임계값 행렬을 생성한다.
 * - 0..255의 모든 랭크가 정확히 1회씩 등장해 16x16 블록 평균 명도 오차가 0에 수렴한다.
 */
export function getDeterministicBlueNoiseMatrix(): Float32Array {
  if (cachedBlueNoiseMatrix !== null) return cachedBlueNoiseMatrix;

  const kernel = buildToroidalGaussianKernel();
  const prototype = new Uint8Array(BLUE_NOISE_CELLS);
  const energy = new Float64Array(BLUE_NOISE_CELLS);

  const initialCount = 32;
  let placed = 0;
  for (let step = 1; placed < initialCount && step < 4096; step += 1) {
    const px = Math.floor(((step * 0.7548776662466927) % 1) * BLUE_NOISE_DIM);
    const py = Math.floor(((step * 0.5698402909980532) % 1) * BLUE_NOISE_DIM);
    const idx = py * BLUE_NOISE_DIM + px;
    if (prototype[idx] === 0) {
      prototype[idx] = 1;
      addToroidalEnergy(energy, kernel, idx, 1);
      placed += 1;
    }
  }

  for (let iter = 0; iter < 64; iter += 1) {
    const tightest = findExtremumIndex(prototype, energy, 1, true);
    if (tightest < 0) break;
    prototype[tightest] = 0;
    addToroidalEnergy(energy, kernel, tightest, -1);
    const largestVoid = findExtremumIndex(prototype, energy, 0, false);
    if (largestVoid < 0 || largestVoid === tightest) {
      prototype[tightest] = 1;
      addToroidalEnergy(energy, kernel, tightest, 1);
      break;
    }
    prototype[largestVoid] = 1;
    addToroidalEnergy(energy, kernel, largestVoid, 1);
  }

  const ranks = new Int32Array(BLUE_NOISE_CELLS).fill(-1);
  const work1 = new Uint8Array(prototype);
  const energy1 = new Float64Array(energy);
  for (let rank = initialCount - 1; rank >= 0; rank -= 1) {
    const idx = findExtremumIndex(work1, energy1, 1, true);
    ranks[idx] = rank;
    work1[idx] = 0;
    addToroidalEnergy(energy1, kernel, idx, -1);
  }

  const work2 = new Uint8Array(prototype);
  const energy2 = new Float64Array(energy);
  const halfCells = BLUE_NOISE_CELLS / 2;
  for (let rank = initialCount; rank < halfCells; rank += 1) {
    const idx = findExtremumIndex(work2, energy2, 0, false);
    ranks[idx] = rank;
    work2[idx] = 1;
    addToroidalEnergy(energy2, kernel, idx, 1);
  }

  const inv = new Uint8Array(BLUE_NOISE_CELLS);
  const energy3 = new Float64Array(BLUE_NOISE_CELLS);
  for (let i = 0; i < BLUE_NOISE_CELLS; i += 1) {
    if (work2[i] === 0) {
      inv[i] = 1;
      addToroidalEnergy(energy3, kernel, i, 1);
    }
  }
  for (let rank = halfCells; rank < BLUE_NOISE_CELLS; rank += 1) {
    const idx = findExtremumIndex(inv, energy3, 1, true);
    ranks[idx] = rank;
    inv[idx] = 0;
    addToroidalEnergy(energy3, kernel, idx, -1);
  }

  const matrix = new Float32Array(BLUE_NOISE_CELLS);
  for (let i = 0; i < BLUE_NOISE_CELLS; i += 1) {
    matrix[i] = (ranks[i] + 0.5) / BLUE_NOISE_CELLS;
  }
  cachedBlueNoiseMatrix = matrix;
  return matrix;
}

export function sampleBlueNoiseAt(x: number, y: number, seed: number): number {
  const matrix = getDeterministicBlueNoiseMatrix();
  const s = seed | 0;
  const mask = BLUE_NOISE_DIM - 1;
  const shiftX = ((s * 73) ^ (s >>> 3)) & mask;
  const shiftY = ((s * 151) ^ (s >>> 5)) & mask;
  return matrix[((y + shiftY) & mask) * BLUE_NOISE_DIM + ((x + shiftX) & mask)];
}

/**
 * 분리형 3x3 이항 저역통과 필터([1, 2, 1] / 4, 전달함수 cos^2(pi*f))로 나이퀴스트 반송파를
 * 감쇠시키고 0~0.35 cyc/px 가시 저주파 모아레 맥놀이(Beat) 에너지를 정밀 계측한다.
 */
export function computeMoireBeatMetrics(
  luminance: Float32Array,
  width: number,
  height: number,
  meanLuminance: number,
): MoireBeatMetricSummary {
  const count = width * height;
  if (count <= 0) {
    return {
      pixelVariance: 0,
      lowFreqBeatVariance: 0,
      rowColBeatVariance: 0,
      beatVariance: 0,
      moireEnergyRatio: 0,
    };
  }

  let rawVarSum = 0;
  const rowMeans = new Float64Array(height);
  const colMeans = new Float64Array(width);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    let rSum = 0;
    for (let x = 0; x < width; x += 1) {
      const val = luminance[rowOffset + x];
      const diff = val - meanLuminance;
      rawVarSum += diff * diff;
      rSum += val;
      colMeans[x] += val;
    }
    rowMeans[y] = rSum / width;
  }

  const pixelVariance = rawVarSum / count;
  let rowVarSum = 0;
  for (let y = 0; y < height; y += 1) {
    const d = rowMeans[y] - meanLuminance;
    rowVarSum += d * d;
  }
  let colVarSum = 0;
  for (let x = 0; x < width; x += 1) {
    const d = colMeans[x] / height - meanLuminance;
    colVarSum += d * d;
  }
  const rowColBeatVariance = 0.5 * (rowVarSum / height + colVarSum / width);

  const horiz = new Float32Array(count);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const xm = x > 0 ? x - 1 : 0;
      const xp = x + 1 < width ? x + 1 : width - 1;
      horiz[rowOffset + x] =
        0.25 * luminance[rowOffset + xm] +
        0.5 * luminance[rowOffset + x] +
        0.25 * luminance[rowOffset + xp];
    }
  }

  const blurred = new Float32Array(count);
  let blurSum = 0;
  for (let y = 0; y < height; y += 1) {
    const ym = y > 0 ? y - 1 : 0;
    const yp = y + 1 < height ? y + 1 : height - 1;
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const val =
        0.25 * horiz[ym * width + x] + 0.5 * horiz[rowOffset + x] + 0.25 * horiz[yp * width + x];
      blurred[rowOffset + x] = val;
      blurSum += val;
    }
  }

  const blurMean = blurSum / count;
  let blurVarSum = 0;
  for (let i = 0; i < count; i += 1) {
    const d = blurred[i] - blurMean;
    blurVarSum += d * d;
  }
  const lowFreqBeatVariance = blurVarSum / count;
  const beatVariance = lowFreqBeatVariance + 0.5 * rowColBeatVariance;
  const moireEnergyRatio =
    pixelVariance > 1e-7 ? clampNumber(lowFreqBeatVariance / pixelVariance, 0, 1) : 0;

  return {
    pixelVariance,
    lowFreqBeatVariance,
    rowColBeatVariance,
    beatVariance,
    moireEnergyRatio,
  };
}
