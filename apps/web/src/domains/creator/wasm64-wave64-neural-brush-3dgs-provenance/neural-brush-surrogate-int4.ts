/**
 * Wave 64 — 오프라인 물리 유체·붓모 시뮬레이션을 온디바이스 1ms 미만으로 근사하는
 * INT4 대칭 블록 양자화 Neural Operator 브러시 대리 모델 커널.
 *
 * 가중치는 4비트 부호 있는 대칭 양자화(`[-7, +7]`)로 2요소당 1바이트 패킹하며,
 * SiLU 잔차 블록 2계층과 방향성 붓모·냉압 종이 요철 디코더로
 * `colorRgba`, `impastoHeightF32`, `granulationMaskF32`를 결정론적으로 산출한다.
 */

export type NeuralBrushPresetId =
  | "watercolor-granulation"
  | "oil-impasto-hog"
  | "sumi-ink-fude"
  | "gouache-dry-tooth";

export type RgbaNormalized = readonly [number, number, number, number];

export interface PackedInt4WeightMatrix {
  readonly rows: number;
  readonly cols: number;
  readonly blockSize: number;
  readonly packedNibbles: Uint8Array;
  readonly blockScales: Float32Array;
  readonly totalElements: number;
  readonly compressionRatio: number;
  readonly maxQuantizationError: number;
  readonly rmse: number;
}

export interface NeuralBrushPresetProfile {
  readonly baseImpastoGain: number;
  readonly baseGranulationGain: number;
  readonly baseWetPickupGain: number;
  readonly baseEdgePoolingGain: number;
  readonly bristleFrequency: number;
  readonly bristleGrooveDepth: number;
  readonly drySkipSensitivity: number;
  readonly baseAnisotropy: number;
}

export interface NeuralBrushSurrogateModel {
  readonly presetId: NeuralBrushPresetId;
  readonly seed: number;
  readonly inputDim: number;
  readonly hiddenDim: number;
  readonly latentDim: number;
  readonly layer1Weights: PackedInt4WeightMatrix;
  readonly layer1Bias: Float32Array;
  readonly residualWeights: PackedInt4WeightMatrix;
  readonly residualBias: Float32Array;
  readonly headWeights: PackedInt4WeightMatrix;
  readonly headBias: Float32Array;
  readonly spatialWeights: PackedInt4WeightMatrix;
  readonly spatialBias: Float32Array;
  readonly presetProfile: NeuralBrushPresetProfile;
  readonly totalPackedBytes: number;
  readonly overallCompressionRatio: number;
}

export interface NeuralBrushStrokeInput {
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly velocity: number;
  readonly paperTooth: number;
  readonly wetness: number;
  readonly pickupColor: RgbaNormalized;
  readonly paintColor: RgbaNormalized;
  readonly pigmentLoad?: number;
  readonly patchSize?: number;
  readonly seed?: number;
  readonly presetId?: NeuralBrushPresetId;
}

export interface NeuralBrushLatentState {
  readonly impastoGain: number;
  readonly edgePooling: number;
  readonly granulationAffinity: number;
  readonly drySkipRate: number;
  readonly bristleSplitDepth: number;
  readonly pickupMix: number;
  readonly anisotropyStrength: number;
  readonly flowSpread: number;
}

export interface NeuralBrushSurrogatePatchMetrics {
  readonly inferenceMs: number;
  readonly meanImpasto: number;
  readonly maxImpasto: number;
  readonly meanGranulation: number;
  readonly granulationVariance: number;
  readonly activePixelCount: number;
  readonly weightMemoryBytes: number;
  readonly compressionRatio: number;
  readonly latent: NeuralBrushLatentState;
}

export interface NeuralBrushSurrogatePatchResult {
  readonly presetId: NeuralBrushPresetId;
  readonly patchSize: number;
  readonly colorRgba: Uint8ClampedArray;
  readonly impastoHeightF32: Float32Array;
  readonly granulationMaskF32: Float32Array;
  readonly alphaCoverageF32: Float32Array;
  readonly metrics: NeuralBrushSurrogatePatchMetrics;
}

export const NEURAL_BRUSH_PRESET_PROFILES: Readonly<
  Record<NeuralBrushPresetId, NeuralBrushPresetProfile>
> = {
  "watercolor-granulation": {
    baseImpastoGain: 0.16,
    baseGranulationGain: 0.92,
    baseWetPickupGain: 0.72,
    baseEdgePoolingGain: 0.85,
    bristleFrequency: 5.5,
    bristleGrooveDepth: 0.18,
    drySkipSensitivity: 0.35,
    baseAnisotropy: 1.15,
  },
  "oil-impasto-hog": {
    baseImpastoGain: 0.96,
    baseGranulationGain: 0.22,
    baseWetPickupGain: 0.54,
    baseEdgePoolingGain: 0.28,
    bristleFrequency: 9.0,
    bristleGrooveDepth: 0.68,
    drySkipSensitivity: 0.62,
    baseAnisotropy: 1.45,
  },
  "sumi-ink-fude": {
    baseImpastoGain: 0.32,
    baseGranulationGain: 0.48,
    baseWetPickupGain: 0.36,
    baseEdgePoolingGain: 0.64,
    bristleFrequency: 7.5,
    bristleGrooveDepth: 0.52,
    drySkipSensitivity: 0.82,
    baseAnisotropy: 1.55,
  },
  "gouache-dry-tooth": {
    baseImpastoGain: 0.62,
    baseGranulationGain: 0.64,
    baseWetPickupGain: 0.42,
    baseEdgePoolingGain: 0.34,
    bristleFrequency: 6.5,
    bristleGrooveDepth: 0.44,
    drySkipSensitivity: 0.74,
    baseAnisotropy: 1.28,
  },
};

const INT4_SYMMETRIC_MAX = 7;
const INT4_NIBBLE_BIAS = 8;
const INPUT_DIM = 8;
const HIDDEN_DIM = 16;
const LATENT_DIM = 8;
const SPATIAL_IN_DIM = 8;
const SPATIAL_OUT_DIM = 4;

const LAYER1_ANCHORS: readonly (readonly [number, number, number])[] = [
  [0, 0, 1.15], [1, 0, 0.85], [1, 7, 0.65], [2, 1, 1.05], [3, 2, 1.05],
  [4, 3, 1.15], [5, 4, 1.25], [6, 5, 1.2], [7, 4, 0.75], [7, 5, 0.85],
  [8, 6, 0.9], [9, 0, 0.7], [9, 3, -0.85], [10, 5, 0.75], [10, 0, -0.35],
];

const HEAD_ANCHORS: readonly (readonly [number, number, number])[] = [
  [0, 0, 1.25], [0, 1, 0.85], [0, 4, -0.95], [0, 9, 0.9],
  [1, 6, 1.15], [1, 7, 0.65], [1, 10, 0.7],
  [2, 5, 1.55], [2, 7, 1.1], [2, 6, 0.45],
  [3, 4, 1.35], [3, 5, 0.55], [3, 6, -0.95], [3, 0, -0.75],
  [4, 0, 0.7], [4, 4, 0.65],
  [5, 6, 1.45], [5, 8, 0.35],
  [6, 2, 0.55], [6, 3, 0.55],
  [7, 0, 1.1], [7, 6, 0.6],
];

const SPATIAL_ANCHORS: readonly (readonly [number, number, number])[] = [
  [0, 0, 1.4], [0, 1, 0.35], [0, 2, 0.25], [0, 4, 0.55], [0, 7, -1.1],
  [1, 0, 0.9], [1, 1, 0.45], [1, 2, 0.85], [1, 4, 0.75], [1, 7, -0.8],
  [2, 0, 0.45], [2, 3, 1.45], [2, 5, 1.15], [2, 6, 0.55],
  [3, 1, 0.95], [3, 3, 0.65], [3, 6, 0.5],
];

const DEFAULT_MODEL_CACHE: Partial<Record<NeuralBrushPresetId, NeuralBrushSurrogateModel>> = {};

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** SiLU(Swish) 활성화 함수: `x * sigmoid(x)`. */
export function silu(x: number): number {
  if (x >= 20) return x;
  if (x <= -20) return 0;
  return x / (1 + Math.exp(-x));
}

function sigmoid(x: number): number {
  if (x >= 20) return 1;
  if (x <= -20) return 0;
  return 1 / (1 + Math.exp(-x));
}

function createDeterministicRng(seed: number): () => number {
  let state = (seed | 0) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2d(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothValueNoise2d(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const nx0 = hash2d(ix, iy, seed) + (hash2d(ix + 1, iy, seed) - hash2d(ix, iy, seed)) * ux;
  const nx1 = hash2d(ix, iy + 1, seed) + (hash2d(ix + 1, iy + 1, seed) - hash2d(ix, iy + 1, seed)) * ux;
  return nx0 + (nx1 - nx0) * uy;
}

function samplePaperToothHeight(u: number, v: number, seed: number): number {
  return (
    smoothValueNoise2d(u * 4.5 + 11.3, v * 4.5 + 7.9, seed) * 0.62 +
    smoothValueNoise2d(u * 11.0 + 3.1, v * 11.0 + 19.7, seed + 97) * 0.38
  );
}

/** FP32 행렬을 블록 단위 대칭 INT4(`[-7, +7]`)로 양자화하고 2요소당 1바이트로 패킹한다. */
export function packInt4WeightMatrix(
  weights: Float32Array | readonly number[],
  rows: number,
  cols: number,
  blockSize = 8,
): PackedInt4WeightMatrix {
  if (!Number.isInteger(rows) || rows <= 0 || !Number.isInteger(cols) || cols <= 0) {
    throw new RangeError("rows와 cols는 1 이상의 정수여야 합니다.");
  }
  if (!Number.isInteger(blockSize) || blockSize < 2) {
    throw new RangeError("blockSize는 2 이상의 정수여야 합니다.");
  }
  const totalElements = rows * cols;
  if (weights.length !== totalElements) {
    throw new RangeError(`가중치 길이(${weights.length})가 행렬 크기(${totalElements})와 불일치합니다.`);
  }

  const numBlocks = Math.ceil(totalElements / blockSize);
  const blockScales = new Float32Array(numBlocks);
  const packedNibbles = new Uint8Array(Math.ceil(totalElements / 2));
  let maxError = 0;
  let sumSqError = 0;

  for (let b = 0; b < numBlocks; b++) {
    const start = b * blockSize;
    const end = Math.min(start + blockSize, totalElements);
    let maxAbs = 0;
    for (let i = start; i < end; i++) {
      const a = Math.abs(weights[i]);
      if (a > maxAbs) maxAbs = a;
    }

    const scale = maxAbs > 1e-12 ? maxAbs / INT4_SYMMETRIC_MAX : 0;
    blockScales[b] = scale;
    const invScale = scale > 0 ? 1 / scale : 0;

    for (let i = start; i < end; i++) {
      const raw = weights[i];
      const q = scale > 0 ? clamp(Math.round(raw * invScale), -INT4_SYMMETRIC_MAX, INT4_SYMMETRIC_MAX) : 0;
      const nibble = (q + INT4_NIBBLE_BIAS) & 0x0f;
      const byteIdx = i >>> 1;
      packedNibbles[byteIdx] =
        (i & 1) === 0
          ? (packedNibbles[byteIdx] & 0xf0) | nibble
          : (packedNibbles[byteIdx] & 0x0f) | (nibble << 4);
      const err = Math.abs(raw - q * scale);
      if (err > maxError) maxError = err;
      sumSqError += err * err;
    }
  }

  const packedBytes = packedNibbles.byteLength + blockScales.byteLength;
  return {
    rows,
    cols,
    blockSize,
    packedNibbles,
    blockScales,
    totalElements,
    compressionRatio: (totalElements * 4) / Math.max(1, packedBytes),
    maxQuantizationError: maxError,
    rmse: Math.sqrt(sumSqError / totalElements),
  };
}

/** 패킹된 INT4 가중치 행렬을 FP32 `Float32Array`로 복원한다. */
export function unpackInt4WeightMatrix(matrix: PackedInt4WeightMatrix): Float32Array {
  const { totalElements, blockSize, packedNibbles, blockScales } = matrix;
  const output = new Float32Array(totalElements);
  for (let i = 0; i < totalElements; i++) {
    const byteVal = packedNibbles[i >>> 1];
    const nibble = (i & 1) === 0 ? byteVal & 0x0f : (byteVal >>> 4) & 0x0f;
    output[i] = (nibble - INT4_NIBBLE_BIAS) * blockScales[Math.floor(i / blockSize)];
  }
  return output;
}

/** INT4 패킹 가중치의 스트리밍 니블 디코딩으로 `out = W * input + bias`를 계산한다. */
export function int4MatVecMulAdd(
  matrix: PackedInt4WeightMatrix,
  input: Float32Array,
  bias: Float32Array,
  out?: Float32Array,
): Float32Array {
  const { rows, cols, blockSize, packedNibbles, blockScales } = matrix;
  if (input.length !== cols || bias.length !== rows) {
    throw new RangeError("입력 또는 편향 벡터 길이가 행렬 차원과 일치하지 않습니다.");
  }
  const result = out && out.length === rows ? out : new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    let acc = bias[r];
    const rowBase = r * cols;
    for (let c = 0; c < cols; c++) {
      const idx = rowBase + c;
      const byteVal = packedNibbles[idx >>> 1];
      const nibble = (idx & 1) === 0 ? byteVal & 0x0f : (byteVal >>> 4) & 0x0f;
      acc += (nibble - INT4_NIBBLE_BIAS) * blockScales[Math.floor(idx / blockSize)] * input[c];
    }
    result[r] = acc;
  }
  return result;
}

function applyAnchors(
  target: Float32Array,
  cols: number,
  anchors: readonly (readonly [number, number, number])[],
): void {
  for (let i = 0; i < anchors.length; i++) {
    const [r, c, val] = anchors[i];
    target[r * cols + c] = val;
  }
}

/** 지정된 프리셋의 INT4 양자화 Neural Operator 브러시 대리 모델을 생성한다. */
export function createNeuralBrushSurrogateModel(
  presetId: NeuralBrushPresetId = "watercolor-granulation",
  seed = 20261127,
): NeuralBrushSurrogateModel {
  const profile = NEURAL_BRUSH_PRESET_PROFILES[presetId];
  const salt =
    presetId === "watercolor-granulation" ? 101 : presetId === "oil-impasto-hog" ? 211 : presetId === "sumi-ink-fude" ? 307 : 409;
  const rng = createDeterministicRng(seed ^ salt);

  const layer1W = new Float32Array(HIDDEN_DIM * INPUT_DIM);
  const layer1B = new Float32Array(HIDDEN_DIM);
  for (let i = 0; i < layer1W.length; i++) layer1W[i] = (rng() - 0.5) * 0.24;
  for (let i = 0; i < layer1B.length; i++) layer1B[i] = (rng() - 0.5) * 0.08;
  applyAnchors(layer1W, INPUT_DIM, LAYER1_ANCHORS);

  const resW = new Float32Array(HIDDEN_DIM * HIDDEN_DIM);
  const resB = new Float32Array(HIDDEN_DIM);
  for (let r = 0; r < HIDDEN_DIM; r++) {
    for (let c = 0; c < HIDDEN_DIM; c++) {
      resW[r * HIDDEN_DIM + c] = (rng() - 0.5) * 0.14 + (r === c ? 0.18 : 0);
    }
    resB[r] = (rng() - 0.5) * 0.04;
  }

  const headW = new Float32Array(LATENT_DIM * HIDDEN_DIM);
  for (let i = 0; i < headW.length; i++) headW[i] = (rng() - 0.5) * 0.12;
  applyAnchors(headW, HIDDEN_DIM, HEAD_ANCHORS);
  const headB = new Float32Array([
    (profile.baseImpastoGain - 0.5) * 2.1,
    (profile.baseEdgePoolingGain - 0.5) * 1.9,
    (profile.baseGranulationGain - 0.5) * 2.2,
    (profile.drySkipSensitivity - 0.5) * 1.5,
    (profile.bristleGrooveDepth - 0.5) * 1.8,
    (profile.baseWetPickupGain - 0.5) * 1.8,
    (profile.baseAnisotropy - 1.25) * 1.2,
    0.1,
  ]);

  const spatialW = new Float32Array(SPATIAL_OUT_DIM * SPATIAL_IN_DIM);
  applyAnchors(spatialW, SPATIAL_IN_DIM, SPATIAL_ANCHORS);
  const spatialB = new Float32Array([-0.15, -0.25, -0.65, -0.35]);

  const layer1Weights = packInt4WeightMatrix(layer1W, HIDDEN_DIM, INPUT_DIM, 8);
  const residualWeights = packInt4WeightMatrix(resW, HIDDEN_DIM, HIDDEN_DIM, 8);
  const headWeights = packInt4WeightMatrix(headW, LATENT_DIM, HIDDEN_DIM, 8);
  const spatialWeights = packInt4WeightMatrix(spatialW, SPATIAL_OUT_DIM, SPATIAL_IN_DIM, 8);

  const mats = [layer1Weights, residualWeights, headWeights, spatialWeights];
  let totalPackedBytes = 0;
  let totalFp32Bytes = 0;
  for (const m of mats) {
    totalPackedBytes += m.packedNibbles.byteLength + m.blockScales.byteLength;
    totalFp32Bytes += m.totalElements * 4;
  }

  return {
    presetId,
    seed,
    inputDim: INPUT_DIM,
    hiddenDim: HIDDEN_DIM,
    latentDim: LATENT_DIM,
    layer1Weights,
    layer1Bias: layer1B,
    residualWeights,
    residualBias: resB,
    headWeights,
    headBias: headB,
    spatialWeights,
    spatialBias: spatialB,
    presetProfile: profile,
    totalPackedBytes,
    overallCompressionRatio: totalFp32Bytes / Math.max(1, totalPackedBytes),
  };
}

function getDefaultModel(presetId: NeuralBrushPresetId): NeuralBrushSurrogateModel {
  const cached = DEFAULT_MODEL_CACHE[presetId];
  if (cached) return cached;
  const created = createNeuralBrushSurrogateModel(presetId);
  DEFAULT_MODEL_CACHE[presetId] = created;
  return created;
}

/**
 * INT4 Neural Operator 대리 모델로 단일 붓자국 패치(`colorRgba`, `impastoHeightF32`,
 * `granulationMaskF32`, `alphaCoverageF32`)를 결정론적으로 생성한다.
 */
export function evaluateNeuralBrushSurrogatePatch(
  input: NeuralBrushStrokeInput,
  customModel?: NeuralBrushSurrogateModel,
): NeuralBrushSurrogatePatchResult {
  const patchSize = input.patchSize ?? 24;
  if (!Number.isInteger(patchSize) || patchSize < 8 || patchSize > 64) {
    throw new RangeError("patchSize는 8 이상 64 이하의 정수여야 합니다.");
  }

  const presetId = customModel ? customModel.presetId : (input.presetId ?? "watercolor-granulation");
  const model = customModel ?? getDefaultModel(presetId);
  const profile = model.presetProfile;
  const t0 = nowMs();

  const pressure = clamp01(input.pressure);
  const tiltX = clamp(input.tiltX, -1, 1);
  const tiltY = clamp(input.tiltY, -1, 1);
  const velocity = clamp(input.velocity, 0, 4);
  const paperTooth = clamp01(input.paperTooth);
  const wetness = clamp01(input.wetness);
  const pigmentLoad = clamp01(input.pigmentLoad ?? 0.85);
  const seed = (input.seed ?? 1337) | 0;

  const [paintR, paintG, paintB, paintA] = [
    clamp01(input.paintColor[0]), clamp01(input.paintColor[1]),
    clamp01(input.paintColor[2]), clamp01(input.paintColor[3]),
  ];
  const [pickR, pickG, pickB, pickA] = [
    clamp01(input.pickupColor[0]), clamp01(input.pickupColor[1]),
    clamp01(input.pickupColor[2]), clamp01(input.pickupColor[3]),
  ];
  const pickupLuma = 0.2126 * pickR + 0.7152 * pickG + 0.0722 * pickB;

  const features = new Float32Array([
    pressure, Math.abs(tiltX), Math.abs(tiltY), clamp01(velocity * 0.45),
    paperTooth, wetness, pickupLuma, pigmentLoad,
  ]);
  const h1 = int4MatVecMulAdd(model.layer1Weights, features, model.layer1Bias);
  for (let i = 0; i < h1.length; i++) h1[i] = silu(h1[i]);
  const resDelta = int4MatVecMulAdd(model.residualWeights, h1, model.residualBias);
  const h2 = new Float32Array(HIDDEN_DIM);
  for (let i = 0; i < HIDDEN_DIM; i++) h2[i] = silu(h1[i] + resDelta[i]);
  const rawLatent = int4MatVecMulAdd(model.headWeights, h2, model.headBias);

  const latent: NeuralBrushLatentState = {
    impastoGain: clamp01(sigmoid(rawLatent[0]) * (0.45 + 0.85 * profile.baseImpastoGain)),
    edgePooling: clamp01(sigmoid(rawLatent[1]) * (0.35 + 0.85 * profile.baseEdgePoolingGain)),
    granulationAffinity: clamp01(sigmoid(rawLatent[2]) * (0.25 + 0.95 * profile.baseGranulationGain)),
    drySkipRate: clamp01(sigmoid(rawLatent[3]) * (0.25 + 0.85 * profile.drySkipSensitivity)),
    bristleSplitDepth: clamp01(sigmoid(rawLatent[4]) * (0.35 + 0.85 * profile.bristleGrooveDepth)),
    pickupMix: clamp01(sigmoid(rawLatent[5]) * wetness * pickA * 0.88),
    anisotropyStrength: clamp(1.0 + sigmoid(rawLatent[6]) * 0.85, 1.0, 2.2),
    flowSpread: clamp(0.32 + pressure * 0.56 + sigmoid(rawLatent[7]) * 0.14, 0.28, 0.98),
  };

  const tiltMag = Math.hypot(tiltX, tiltY);
  const angle = tiltMag > 1e-4 ? Math.atan2(tiltY, tiltX) : 0;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const stretchMajor = 1 + tiltMag * (latent.anisotropyStrength - 0.55) * 0.95;
  const stretchMinor = 1 / Math.sqrt(stretchMajor);

  const pixelCount = patchSize * patchSize;
  const colorRgba = new Uint8ClampedArray(pixelCount * 4);
  const impastoHeightF32 = new Float32Array(pixelCount);
  const granulationMaskF32 = new Float32Array(pixelCount);
  const alphaCoverageF32 = new Float32Array(pixelCount);
  const spatialIn = new Float32Array(SPATIAL_IN_DIM);
  const spatialOut = new Float32Array(SPATIAL_OUT_DIM);

  const invHalf = 2 / Math.max(1, patchSize - 1);
  let activePixelCount = 0;
  let sumImpasto = 0;
  let maxImpasto = 0;
  let sumGran = 0;
  let sumGranSq = 0;

  for (let py = 0; py < patchSize; py++) {
    const ny = py * invHalf - 1;
    for (let px = 0; px < patchSize; px++) {
      const nx = px * invHalf - 1;
      const idx = py * patchSize + px;
      const lx = (nx * cosA + ny * sinA) / (latent.flowSpread * stretchMajor);
      const ly = (-nx * sinA + ny * cosA) / (latent.flowSpread * stretchMinor);
      const radius = Math.hypot(lx, ly);
      if (radius >= 1.18) continue;

      const radialFalloff = clamp01(1 - radius * radius);
      const edgeRing = Math.exp(-Math.pow((radius - 0.84) / 0.16, 2));
      const paperHeight = samplePaperToothHeight(nx, ny, seed);
      const paperValley = clamp01(1 - paperHeight);
      const bristleWave = 0.5 + 0.5 * Math.cos(ly * profile.bristleFrequency * Math.PI + (seed & 15) * 0.37);
      const bristleRidge = (1 - latent.bristleSplitDepth) * 0.5 + latent.bristleSplitDepth * bristleWave;
      const dryThreshold = latent.drySkipRate * (0.28 + 0.55 * velocity * 0.25);
      const dryMask = clamp01((dryThreshold - paperHeight * 0.9 - radialFalloff * 0.35) * 1.9);

      spatialIn[0] = radialFalloff;
      spatialIn[1] = edgeRing;
      spatialIn[2] = bristleRidge;
      spatialIn[3] = paperValley;
      spatialIn[4] = pressure;
      spatialIn[5] = paperTooth;
      spatialIn[6] = wetness;
      spatialIn[7] = dryMask;
      int4MatVecMulAdd(model.spatialWeights, spatialIn, model.spatialBias, spatialOut);

      const alphaBase = sigmoid(spatialOut[0] * 2.2) * Math.pow(radialFalloff, 0.55);
      const alpha = clamp01((alphaBase + edgeRing * latent.edgePooling * wetness * 0.32) * paintA * (0.35 + 0.65 * pigmentLoad));
      if (alpha < 0.015) continue;

      activePixelCount++;
      alphaCoverageF32[idx] = alpha;

      const impasto = clamp(
        sigmoid(spatialOut[1] * 2.0) * latent.impastoGain * (0.3 + 0.7 * pressure) *
          (1 - 0.45 * clamp01(velocity * 0.3)) * (0.55 + 0.65 * bristleRidge) * alpha,
        0,
        1.5,
      );
      impastoHeightF32[idx] = impasto;
      sumImpasto += impasto;
      if (impasto > maxImpasto) maxImpasto = impasto;

      const granulation = clamp01(
        sigmoid(spatialOut[2] * 2.4) * latent.granulationAffinity * (0.08 + 0.92 * paperTooth) *
          (0.35 + 0.65 * paperValley) * (0.4 + 0.6 * wetness) * alpha,
      );
      granulationMaskF32[idx] = granulation;
      sumGran += granulation;
      sumGranSq += granulation * granulation;

      const pigmentDarken = clamp01(sigmoid(spatialOut[3] * 1.8) * (0.22 * latent.edgePooling + 0.34 * granulation));
      const mixPickup = latent.pickupMix * (0.55 + 0.45 * radialFalloff);
      const toneScale = 1 - pigmentDarken * 0.28 + impasto * 0.06;
      const o = idx * 4;
      colorRgba[o] = Math.round(clamp01((paintR * (1 - mixPickup) + pickR * mixPickup) * toneScale) * 255);
      colorRgba[o + 1] = Math.round(clamp01((paintG * (1 - mixPickup) + pickG * mixPickup) * toneScale) * 255);
      colorRgba[o + 2] = Math.round(clamp01((paintB * (1 - mixPickup) + pickB * mixPickup) * toneScale) * 255);
      colorRgba[o + 3] = Math.round(alpha * 255);
    }
  }

  const denom = Math.max(1, activePixelCount);
  const meanGranulation = sumGran / denom;
  return {
    presetId,
    patchSize,
    colorRgba,
    impastoHeightF32,
    granulationMaskF32,
    alphaCoverageF32,
    metrics: {
      inferenceMs: Math.max(0, nowMs() - t0),
      meanImpasto: sumImpasto / denom,
      maxImpasto,
      meanGranulation,
      granulationVariance: Math.max(0, sumGranSq / denom - meanGranulation * meanGranulation),
      activePixelCount,
      weightMemoryBytes: model.totalPackedBytes,
      compressionRatio: model.overallCompressionRatio,
      latent,
    },
  };
}
