/**
 * 실시간 온디바이스 신경망 가중치 증류 엔진 (Wave 70).
 *
 * FP32 교사 모델(브러시 동역학·화풍 전이·셀 셰이딩·선화 정리용 선형 레이어)을
 * 저랭크 SVD(전력 반복 + 수정 그람-슈미트 직교 소거) 분해, 채널별 대칭 INT8/INT4
 * 니블 비트 패킹 양자화, 온도 스케일 KL 발산 매칭 캘리브레이션으로 압축·검증한다.
 */

export type DistillationDomain = "brush-dynamics" | "style-transfer" | "cel-shading" | "line-cleanup";
export type QuantizationBitWidth = 4 | 8;
export type DecompositionMode = "low-rank-svd" | "direct-per-channel";

export interface TeacherLinearLayer {
  readonly layerId: string;
  readonly domain: DistillationDomain;
  readonly inputDim: number;
  readonly outputDim: number;
  readonly weights: Float32Array;
  readonly bias: Float32Array;
}

export interface DistillationOptions {
  readonly quantizationBits?: QuantizationBitWidth;
  readonly targetRank?: number;
  readonly decompositionPreference?: "auto" | DecompositionMode;
  readonly minEnergyRetention?: number;
  readonly powerIterations?: number;
  readonly temperature?: number;
  readonly calibrationInputs?: readonly Float32Array[];
  readonly syntheticProbeCount?: number;
  readonly calibrationSteps?: number;
  readonly seed?: number;
}

export interface QuantizedMatrixBlock {
  readonly rows: number;
  readonly cols: number;
  readonly bits: QuantizationBitWidth;
  readonly data: Int8Array | Uint8Array;
  readonly channelScales: Float32Array;
}

export interface DistillationVerificationMetrics {
  readonly teacherWeightBytes: number;
  readonly studentWeightBytes: number;
  readonly teacherTotalBytes: number;
  readonly studentTotalBytes: number;
  readonly compressionRatio: number;
  readonly totalCompressionRatio: number;
  readonly weightFrobeniusError: number;
  readonly relativeFrobeniusError: number;
  readonly explainedEnergyRatio: number;
  readonly meanOutputCosineSimilarity: number;
  readonly minOutputCosineSimilarity: number;
  readonly outputMse: number;
  readonly outputRmse: number;
  readonly klDivergenceBeforeCalibration: number;
  readonly klDivergenceAfterCalibration: number;
  readonly distillationTemperature: number;
  readonly calibrationStepsRun: number;
}

export interface DistilledStudentLayer {
  readonly schemaVersion: "wave70.distilled-layer.v1";
  readonly layerId: string;
  readonly domain: DistillationDomain;
  readonly inputDim: number;
  readonly outputDim: number;
  readonly quantizationBits: QuantizationBitWidth;
  readonly decompositionMode: DecompositionMode;
  readonly rank: number;
  readonly singularValues: Float32Array;
  readonly leftFactor: QuantizedMatrixBlock | null;
  readonly rightFactor: QuantizedMatrixBlock | null;
  readonly directWeights: QuantizedMatrixBlock | null;
  readonly bias: Float32Array;
  readonly metrics: DistillationVerificationMetrics;
}

export interface StudentInferenceResult {
  readonly output: Float32Array;
  readonly estimatedFlops: number;
  readonly denseTeacherFlops: number;
  readonly flopSpeedupRatio: number;
}

interface TruncatedSvdResult {
  readonly rank: number;
  readonly singularValues: Float64Array;
  readonly leftU: Float64Array;
  readonly rightSigmaVt: Float64Array;
  readonly explainedEnergyRatio: number;
}

const DEFAULT_SEED = 0x57617637;
const EPSILON = 1e-12;

function createDeterministicRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertFiniteFloat32(values: Float32Array, label: string): void {
  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) {
      throw new Error(`${label}[${i}]에 유한하지 않은 부동소수점 값이 포함되어 있습니다.`);
    }
  }
}

function validateTeacherLayer(teacher: TeacherLinearLayer): void {
  if (!teacher.layerId || teacher.layerId.trim().length === 0) throw new Error("teacher.layerId는 비어 있을 수 없습니다.");
  if (!Number.isInteger(teacher.inputDim) || teacher.inputDim <= 0) throw new Error("teacher.inputDim은 양의 정수여야 합니다.");
  if (!Number.isInteger(teacher.outputDim) || teacher.outputDim <= 0) throw new Error("teacher.outputDim은 양의 정수여야 합니다.");
  if (teacher.weights.length !== teacher.outputDim * teacher.inputDim) {
    throw new Error(`teacher.weights 길이(${teacher.weights.length})가 outputDim*inputDim과 일치하지 않습니다.`);
  }
  if (teacher.bias.length !== teacher.outputDim) {
    throw new Error(`teacher.bias 길이(${teacher.bias.length})가 outputDim과 일치하지 않습니다.`);
  }
  assertFiniteFloat32(teacher.weights, "teacher.weights");
  assertFiniteFloat32(teacher.bias, "teacher.bias");
}

/** 부호 있는 INT4 값([-7, 7])을 바이트당 2개 니블로 패킹한다(오프셋 +8 인코딩). */
export function packInt4Values(values: readonly number[] | Int8Array): Uint8Array {
  const packed = new Uint8Array(Math.ceil(values.length / 2));
  for (let i = 0; i < values.length; i += 2) {
    const hi = (Math.max(-7, Math.min(7, Math.round(values[i] ?? 0))) + 8) & 0x0f;
    const lo = (Math.max(-7, Math.min(7, Math.round(i + 1 < values.length ? (values[i + 1] ?? 0) : 0))) + 8) & 0x0f;
    packed[i >> 1] = (hi << 4) | lo;
  }
  return packed;
}

/** 니블 패킹된 INT4 버퍼를 부호 있는 Int8Array([-7, 7])로 무손실 복원한다. */
export function unpackInt4Values(packed: Uint8Array, elementCount: number): Int8Array {
  if (!Number.isInteger(elementCount) || elementCount < 0) throw new Error("elementCount는 0 이상의 정수여야 합니다.");
  const requiredBytes = Math.ceil(elementCount / 2);
  if (packed.length < requiredBytes) {
    throw new Error(`INT4 패킹 버퍼 길이(${packed.length})가 필요한 바이트(${requiredBytes})보다 작습니다.`);
  }
  const out = new Int8Array(elementCount);
  for (let i = 0; i < elementCount; i += 1) {
    const byteVal = packed[i >> 1] ?? 0;
    out[i] = ((i & 1) === 0 ? (byteVal >>> 4) & 0x0f : byteVal & 0x0f) - 8;
  }
  return out;
}

function quantizeMatrixPerChannel(
  matrix: Float64Array | Float32Array,
  rows: number,
  cols: number,
  bits: QuantizationBitWidth,
): QuantizedMatrixBlock {
  const qmax = bits === 4 ? 7 : 127;
  const channelScales = new Float32Array(rows);
  const rawSigned = new Int8Array(rows * cols);
  for (let r = 0; r < rows; r += 1) {
    const off = r * cols;
    let maxAbs = 0;
    for (let c = 0; c < cols; c += 1) {
      const a = Math.abs(matrix[off + c] ?? 0);
      if (a > maxAbs) maxAbs = a;
    }
    const scale = maxAbs > EPSILON ? maxAbs / qmax : 0;
    channelScales[r] = scale;
    if (scale > 0) {
      const inv = 1 / scale;
      for (let c = 0; c < cols; c += 1) {
        rawSigned[off + c] = Math.max(-qmax, Math.min(qmax, Math.round((matrix[off + c] ?? 0) * inv)));
      }
    }
  }
  return { rows, cols, bits, data: bits === 4 ? packInt4Values(rawSigned) : rawSigned, channelScales };
}

function dequantizeMatrixBlock(block: QuantizedMatrixBlock): Float64Array {
  const total = block.rows * block.cols;
  const signed = block.bits === 4 ? unpackInt4Values(block.data as Uint8Array, total) : (block.data as Int8Array);
  const out = new Float64Array(total);
  for (let r = 0; r < block.rows; r += 1) {
    const scale = block.channelScales[r] ?? 0;
    const off = r * block.cols;
    for (let c = 0; c < block.cols; c += 1) out[off + c] = (signed[off + c] ?? 0) * scale;
  }
  return out;
}

function multiplyQuantizedBlockVec(block: QuantizedMatrixBlock, input: ArrayLike<number>): Float64Array {
  const out = new Float64Array(block.rows);
  const cols = block.cols;
  if (block.bits === 8) {
    const data = block.data as Int8Array;
    for (let r = 0; r < block.rows; r += 1) {
      const scale = block.channelScales[r] ?? 0;
      if (scale === 0) continue;
      const off = r * cols;
      let acc = 0;
      for (let c = 0; c < cols; c += 1) acc += (data[off + c] ?? 0) * (input[c] ?? 0);
      out[r] = acc * scale;
    }
    return out;
  }
  const packed = block.data as Uint8Array;
  for (let r = 0; r < block.rows; r += 1) {
    const scale = block.channelScales[r] ?? 0;
    if (scale === 0) continue;
    const off = r * cols;
    let acc = 0;
    for (let c = 0; c < cols; c += 1) {
      const idx = off + c;
      const byteVal = packed[idx >> 1] ?? 0;
      const q = ((idx & 1) === 0 ? (byteVal >>> 4) & 0x0f : byteVal & 0x0f) - 8;
      acc += q * (input[c] ?? 0);
    }
    out[r] = acc * scale;
  }
  return out;
}

function l2Norm(vec: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < vec.length; i += 1) { const v = vec[i] ?? 0; sum += v * v; }
  return Math.sqrt(sum);
}

function orthogonalizeInPlace(vec: Float64Array, basis: readonly Float64Array[]): void {
  for (const ref of basis) {
    let dot = 0;
    for (let i = 0; i < vec.length; i += 1) dot += (vec[i] ?? 0) * (ref[i] ?? 0);
    for (let i = 0; i < vec.length; i += 1) vec[i] = (vec[i] ?? 0) - dot * (ref[i] ?? 0);
  }
}

function matVecMultiply(mat: Float64Array, rows: number, cols: number, vec: Float64Array, out: Float64Array): void {
  for (let i = 0; i < rows; i += 1) {
    const off = i * cols;
    let sum = 0;
    for (let j = 0; j < cols; j += 1) sum += (mat[off + j] ?? 0) * (vec[j] ?? 0);
    out[i] = sum;
  }
}

function matTransposeVecMultiply(mat: Float64Array, rows: number, cols: number, vec: Float64Array): Float64Array {
  const out = new Float64Array(cols);
  for (let i = 0; i < rows; i += 1) {
    const ui = vec[i] ?? 0;
    if (ui === 0) continue;
    const off = i * cols;
    for (let j = 0; j < cols; j += 1) out[j] = (out[j] ?? 0) + (mat[off + j] ?? 0) * ui;
  }
  return out;
}

/** 전력 반복 + 수정 그람-슈미트 직교 소거로 저랭크 SVD(U, Sigma*V^T)를 계산한다. */
function computeTruncatedSvdPowerIteration(
  weights: Float32Array,
  rows: number,
  cols: number,
  maxRank: number,
  minEnergyRetention: number,
  powerIterations: number,
  seed: number,
  allowEarlyEnergyStop: boolean,
): TruncatedSvdResult {
  const residual = new Float64Array(rows * cols);
  let totalFrobSq = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const w = weights[i] ?? 0;
    residual[i] = w;
    totalFrobSq += w * w;
  }

  const rng = createDeterministicRng(seed);
  const uBasis: Float64Array[] = [];
  const vBasis: Float64Array[] = [];
  const sigmas: number[] = [];
  let capturedEnergy = 0;

  if (totalFrobSq > EPSILON) {
    const rankLimit = Math.min(maxRank, rows, cols);
    for (let k = 0; k < rankLimit; k += 1) {
      let v = new Float64Array(cols);
      for (let j = 0; j < cols; j += 1) v[j] = rng() * 2 - 1;
      orthogonalizeInPlace(v, vBasis);
      let vNorm = l2Norm(v);
      if (vNorm < EPSILON) {
        v = new Float64Array(cols);
        v[k % cols] = 1;
        orthogonalizeInPlace(v, vBasis);
        vNorm = l2Norm(v);
      }
      if (vNorm < EPSILON) break;
      for (let j = 0; j < cols; j += 1) v[j] = (v[j] ?? 0) / vNorm;

      const u = new Float64Array(rows);
      for (let iter = 0; iter < powerIterations; iter += 1) {
        matVecMultiply(residual, rows, cols, v, u);
        orthogonalizeInPlace(u, uBasis);
        const iterSigma = l2Norm(u);
        if (iterSigma < EPSILON) break;
        for (let i = 0; i < rows; i += 1) u[i] = (u[i] ?? 0) / iterSigma;

        const vNext = matTransposeVecMultiply(residual, rows, cols, u);
        orthogonalizeInPlace(vNext, vBasis);
        const nextNorm = l2Norm(vNext);
        if (nextNorm < EPSILON) break;
        for (let j = 0; j < cols; j += 1) v[j] = (vNext[j] ?? 0) / nextNorm;
      }

      matVecMultiply(residual, rows, cols, v, u);
      orthogonalizeInPlace(u, uBasis);
      const sigma = l2Norm(u);
      if (sigma < EPSILON) break;
      for (let i = 0; i < rows; i += 1) u[i] = (u[i] ?? 0) / sigma;

      uBasis.push(new Float64Array(u));
      vBasis.push(new Float64Array(v));
      sigmas.push(sigma);
      capturedEnergy += sigma * sigma;

      for (let i = 0; i < rows; i += 1) {
        const sUi = sigma * (u[i] ?? 0);
        const off = i * cols;
        for (let j = 0; j < cols; j += 1) residual[off + j] = (residual[off + j] ?? 0) - sUi * (v[j] ?? 0);
      }
      if (allowEarlyEnergyStop && capturedEnergy / totalFrobSq >= minEnergyRetention) break;
    }
  }

  const actualRank = Math.max(1, sigmas.length);
  const singularValues = new Float64Array(actualRank);
  const leftU = new Float64Array(rows * actualRank);
  const rightSigmaVt = new Float64Array(actualRank * cols);
  for (let k = 0; k < sigmas.length; k += 1) {
    const s = sigmas[k] ?? 0;
    const uk = uBasis[k];
    const vk = vBasis[k];
    singularValues[k] = s;
    if (uk) for (let i = 0; i < rows; i += 1) leftU[i * actualRank + k] = uk[i] ?? 0;
    if (vk) for (let j = 0; j < cols; j += 1) rightSigmaVt[k * cols + j] = s * (vk[j] ?? 0);
  }

  return {
    rank: actualRank,
    singularValues,
    leftU,
    rightSigmaVt,
    explainedEnergyRatio: totalFrobSq > EPSILON ? Math.min(1, capturedEnergy / totalFrobSq) : 1,
  };
}

/** 두 벡터 간 코사인 유사도를 계산한다(두 벡터 모두 영벡터이면 1). */
export function computeCosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error(`코사인 유사도 차원 불일치: ${a.length} !== ${b.length}`);
  let dot = 0; let normASq = 0; let normBSq = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0; const bv = b[i] ?? 0;
    dot += av * bv; normASq += av * av; normBSq += bv * bv;
  }
  if (normASq <= EPSILON && normBSq <= EPSILON) return 1;
  if (normASq <= EPSILON || normBSq <= EPSILON) return 0;
  return Math.max(-1, Math.min(1, dot / Math.sqrt(normASq * normBSq)));
}

function computeTemperatureSoftmax(logits: ArrayLike<number>, temperature: number): Float64Array {
  const n = logits.length;
  const probs = new Float64Array(n);
  if (n === 0) return probs;
  let maxScaled = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const scaled = (logits[i] ?? 0) / temperature;
    if (scaled > maxScaled) maxScaled = scaled;
  }
  let sumExp = 0;
  for (let i = 0; i < n; i += 1) {
    const ex = Math.exp((logits[i] ?? 0) / temperature - maxScaled);
    probs[i] = ex;
    sumExp += ex;
  }
  const invSum = sumExp > EPSILON ? 1 / sumExp : 1 / n;
  for (let i = 0; i < n; i += 1) probs[i] = (probs[i] ?? 0) * invSum;
  return probs;
}

/** 온도 T로 스케일된 교사/학생 로짓 분포 간 순방향 KL 발산 D_KL(P_T || P_S)를 계산한다. */
export function computeTemperatureScaledKlDivergence(
  teacherLogits: ArrayLike<number>,
  studentLogits: ArrayLike<number>,
  temperature = 2.0,
): number {
  if (teacherLogits.length !== studentLogits.length) throw new Error("KL 발산 대상 로짓 차원이 일치하지 않습니다.");
  if (!Number.isFinite(temperature) || temperature <= 0) throw new Error("temperature는 0보다 큰 유한 실수여야 합니다.");
  const pT = computeTemperatureSoftmax(teacherLogits, temperature);
  const pS = computeTemperatureSoftmax(studentLogits, temperature);
  let kl = 0;
  for (let i = 0; i < pT.length; i += 1) {
    const pt = Math.max(EPSILON, pT[i] ?? 0);
    const ps = Math.max(EPSILON, pS[i] ?? 0);
    kl += pt * Math.log(pt / ps);
  }
  return Math.max(0, kl);
}

function generateSyntheticCalibrationProbes(inputDim: number, count: number, seed: number): Float32Array[] {
  const rng = createDeterministicRng(seed ^ 0x9e3779b9);
  const probes: Float32Array[] = [];
  for (let s = 0; s < count; s += 1) {
    const vec = new Float32Array(inputDim);
    for (let j = 0; j < inputDim; j += 1) {
      vec[j] = (rng() + rng() + rng() - 1.5) * 0.7 + 0.35 * Math.cos(((s + 1) * (j + 0.5) * Math.PI) / inputDim);
    }
    probes.push(vec);
  }
  return probes;
}

function forwardTeacher(teacher: TeacherLinearLayer, input: Float32Array): Float64Array {
  const out = new Float64Array(teacher.outputDim);
  for (let r = 0; r < teacher.outputDim; r += 1) {
    const off = r * teacher.inputDim;
    let acc = teacher.bias[r] ?? 0;
    for (let c = 0; c < teacher.inputDim; c += 1) acc += (teacher.weights[off + c] ?? 0) * (input[c] ?? 0);
    out[r] = acc;
  }
  return out;
}

function forwardStudentLinearOnly(
  mode: DecompositionMode,
  left: QuantizedMatrixBlock | null,
  right: QuantizedMatrixBlock | null,
  direct: QuantizedMatrixBlock | null,
  input: ArrayLike<number>,
): Float64Array {
  if (mode === "low-rank-svd" && left && right) return multiplyQuantizedBlockVec(left, multiplyQuantizedBlockVec(right, input));
  if (direct) return multiplyQuantizedBlockVec(direct, input);
  throw new Error("학생 레이어 가중치 블록이 비어 있습니다.");
}

/** 증류된 학생 레이어의 유효 FP32 등가 가중치 행렬 [outputDim x inputDim]을 복원한다. */
export function dequantizeStudentWeightMatrix(student: DistilledStudentLayer): Float32Array {
  const { outputDim: rows, inputDim: cols } = student;
  const result = new Float32Array(rows * cols);
  if (student.decompositionMode === "direct-per-channel" && student.directWeights) {
    const mat = dequantizeMatrixBlock(student.directWeights);
    for (let i = 0; i < mat.length; i += 1) result[i] = mat[i] ?? 0;
    return result;
  }
  if (student.leftFactor && student.rightFactor) {
    const left = dequantizeMatrixBlock(student.leftFactor);
    const right = dequantizeMatrixBlock(student.rightFactor);
    const r = student.rank;
    for (let i = 0; i < rows; i += 1) {
      const leftOff = i * r;
      const outOff = i * cols;
      for (let j = 0; j < cols; j += 1) {
        let sum = 0;
        for (let k = 0; k < r; k += 1) sum += (left[leftOff + k] ?? 0) * (right[k * cols + j] ?? 0);
        result[outOff + j] = sum;
      }
    }
  }
  return result;
}

/** FP32 교사 레이어를 저랭크 SVD + INT8/INT4 채널별 양자화 + 온도 KL 캘리브레이션으로 증류한다. */
export function distillTeacherToStudentWeights(
  teacher: TeacherLinearLayer,
  options: DistillationOptions = {},
): DistilledStudentLayer {
  validateTeacherLayer(teacher);
  const bits: QuantizationBitWidth = options.quantizationBits ?? 4;
  if (bits !== 4 && bits !== 8) throw new Error("quantizationBits는 4 또는 8이어야 합니다.");
  const temperature = options.temperature ?? 2.0;
  if (!Number.isFinite(temperature) || temperature <= 0) throw new Error("temperature는 0보다 큰 유한 실수여야 합니다.");

  const minEnergyRetention = Math.max(0.5, Math.min(0.9999, options.minEnergyRetention ?? 0.985));
  const powerIterations = Math.max(6, Math.min(128, Math.round(options.powerIterations ?? 28)));
  const calibrationSteps = Math.max(0, Math.min(64, Math.round(options.calibrationSteps ?? 14)));
  const seed = options.seed ?? DEFAULT_SEED;
  const { outputDim, inputDim } = teacher;
  const maxPossibleRank = Math.min(outputDim, inputDim);
  const breakEvenRank = Math.floor((outputDim * inputDim) / (outputDim + inputDim));

  if (options.targetRank !== undefined) {
    if (!Number.isInteger(options.targetRank) || options.targetRank <= 0 || options.targetRank > maxPossibleRank) {
      throw new Error(`targetRank는 1..${maxPossibleRank} 범위의 정수여야 합니다.`);
    }
  }

  const preference = options.decompositionPreference ?? "auto";
  const requestedRank = options.targetRank ?? Math.max(1, Math.min(maxPossibleRank, Math.max(1, breakEvenRank - 1)));
  const useLowRank = preference === "low-rank-svd" || (preference === "auto" && requestedRank < breakEvenRank && maxPossibleRank >= 4);

  const decompositionMode: DecompositionMode = useLowRank ? "low-rank-svd" : "direct-per-channel";
  let rank = maxPossibleRank;
  let singularValues = new Float32Array(0);
  let explainedEnergyRatio = 1;
  let leftFactor: QuantizedMatrixBlock | null = null;
  let rightFactor: QuantizedMatrixBlock | null = null;
  let directWeights: QuantizedMatrixBlock | null = null;

  if (useLowRank) {
    const svd = computeTruncatedSvdPowerIteration(
      teacher.weights, outputDim, inputDim, requestedRank,
      minEnergyRetention, powerIterations, seed, options.targetRank === undefined,
    );
    rank = svd.rank;
    singularValues = Float32Array.from(svd.singularValues);
    explainedEnergyRatio = svd.explainedEnergyRatio;
    leftFactor = quantizeMatrixPerChannel(svd.leftU, outputDim, rank, bits);
    rightFactor = quantizeMatrixPerChannel(svd.rightSigmaVt, rank, inputDim, bits);
  } else {
    directWeights = quantizeMatrixPerChannel(teacher.weights, outputDim, inputDim, bits);
  }

  const probes = options.calibrationInputs && options.calibrationInputs.length > 0
    ? options.calibrationInputs
    : generateSyntheticCalibrationProbes(inputDim, options.syntheticProbeCount ?? 24, seed);
  for (let p = 0; p < probes.length; p += 1) {
    const probe = probes[p];
    if (!probe || probe.length !== inputDim) throw new Error(`calibrationInputs[${p}] 길이가 inputDim(${inputDim})과 일치하지 않습니다.`);
    assertFiniteFloat32(probe, `calibrationInputs[${p}]`);
  }

  const teacherOutputs = probes.map((x) => forwardTeacher(teacher, x));
  const rawStudentLinear = probes.map((x) => forwardStudentLinearOnly(decompositionMode, leftFactor, rightFactor, directWeights, x));
  const sampleCount = Math.max(1, probes.length);

  const evalCalibrationState = (gains: Float64Array, biases: Float32Array): { kl: number; mse: number; loss: number } => {
    let klSum = 0; let mseSum = 0;
    for (let m = 0; m < probes.length; m += 1) {
      const tOut = teacherOutputs[m]; const sLin = rawStudentLinear[m];
      if (!tOut || !sLin) continue;
      const sLogits = new Float64Array(outputDim);
      for (let i = 0; i < outputDim; i += 1) {
        const val = (gains[i] ?? 1) * (sLin[i] ?? 0) + (biases[i] ?? 0);
        sLogits[i] = val;
        const diff = val - (tOut[i] ?? 0);
        mseSum += diff * diff;
      }
      klSum += computeTemperatureScaledKlDivergence(tOut, sLogits, temperature);
    }
    const meanKl = klSum / sampleCount;
    const meanMse = mseSum / (sampleCount * outputDim);
    return { kl: meanKl, mse: meanMse, loss: temperature * temperature * meanKl + 0.5 * meanMse };
  };

  let bestGain = new Float64Array(outputDim).fill(1);
  let bestBias = new Float32Array(teacher.bias);
  const initialEval = evalCalibrationState(bestGain, bestBias);
  let bestEval = initialEval;
  let stepsRun = 0;

  for (let step = 0; step < calibrationSteps; step += 1) {
    const gradGain = new Float64Array(outputDim);
    const gradBias = new Float64Array(outputDim);
    for (let m = 0; m < probes.length; m += 1) {
      const tOut = teacherOutputs[m]; const sLin = rawStudentLinear[m];
      if (!tOut || !sLin) continue;
      const sLogits = new Float64Array(outputDim);
      for (let i = 0; i < outputDim; i += 1) sLogits[i] = (bestGain[i] ?? 1) * (sLin[i] ?? 0) + (bestBias[i] ?? 0);
      const pT = computeTemperatureSoftmax(tOut, temperature);
      const pS = computeTemperatureSoftmax(sLogits, temperature);
      for (let i = 0; i < outputDim; i += 1) {
        const gTotal = (temperature * ((pS[i] ?? 0) - (pT[i] ?? 0)) + ((sLogits[i] ?? 0) - (tOut[i] ?? 0)) / outputDim) / sampleCount;
        gradGain[i] = (gradGain[i] ?? 0) + gTotal * (sLin[i] ?? 0);
        gradBias[i] = (gradBias[i] ?? 0) + gTotal;
      }
    }
    const candGain = new Float64Array(outputDim);
    const candBias = new Float32Array(outputDim);
    for (let i = 0; i < outputDim; i += 1) {
      candGain[i] = Math.max(0.65, Math.min(1.45, (bestGain[i] ?? 1) - 0.08 * (gradGain[i] ?? 0)));
      candBias[i] = (bestBias[i] ?? 0) - 0.12 * (gradBias[i] ?? 0);
    }
    const candEval = evalCalibrationState(candGain, candBias);
    stepsRun += 1;
    if (candEval.loss <= bestEval.loss && candEval.kl <= bestEval.kl + 1e-9) {
      bestEval = candEval; bestGain = candGain; bestBias = candBias;
    } else {
      break;
    }
  }

  // 채널 게인을 출력 채널 양자화 스케일에 접어 추가 메모리 0B 유지
  const scaleTarget = decompositionMode === "low-rank-svd" ? leftFactor : directWeights;
  if (scaleTarget) {
    for (let i = 0; i < outputDim; i += 1) scaleTarget.channelScales[i] = (scaleTarget.channelScales[i] ?? 0) * (bestGain[i] ?? 1);
  }

  let cosineSum = 0; let minCosine = 1; let mseAccum = 0; let finalKlAccum = 0;
  for (let m = 0; m < probes.length; m += 1) {
    const probe = probes[m]; const tOut = teacherOutputs[m];
    if (!probe || !tOut) continue;
    const sLin = forwardStudentLinearOnly(decompositionMode, leftFactor, rightFactor, directWeights, probe);
    const sOut = new Float64Array(outputDim);
    for (let i = 0; i < outputDim; i += 1) {
      sOut[i] = (sLin[i] ?? 0) + (bestBias[i] ?? 0);
      const diff = (sOut[i] ?? 0) - (tOut[i] ?? 0);
      mseAccum += diff * diff;
    }
    const cos = computeCosineSimilarity(tOut, sOut);
    cosineSum += cos;
    if (cos < minCosine) minCosine = cos;
    finalKlAccum += computeTemperatureScaledKlDivergence(tOut, sOut, temperature);
  }

  const teacherWeightBytes = teacher.weights.byteLength;
  const teacherTotalBytes = teacherWeightBytes + teacher.bias.byteLength;
  const studentWeightBytes =
    decompositionMode === "low-rank-svd" && leftFactor && rightFactor
      ? leftFactor.data.byteLength + leftFactor.channelScales.byteLength + rightFactor.data.byteLength + rightFactor.channelScales.byteLength
      : (directWeights?.data.byteLength ?? 0) + (directWeights?.channelScales.byteLength ?? 0);
  const studentTotalBytes = studentWeightBytes + bestBias.byteLength;

  const provisional: DistilledStudentLayer = {
    schemaVersion: "wave70.distilled-layer.v1",
    layerId: teacher.layerId, domain: teacher.domain, inputDim, outputDim,
    quantizationBits: bits, decompositionMode, rank, singularValues,
    leftFactor, rightFactor, directWeights, bias: bestBias,
    metrics: {
      teacherWeightBytes, studentWeightBytes, teacherTotalBytes, studentTotalBytes,
      compressionRatio: studentWeightBytes > 0 ? teacherWeightBytes / studentWeightBytes : 1,
      totalCompressionRatio: studentTotalBytes > 0 ? teacherTotalBytes / studentTotalBytes : 1,
      weightFrobeniusError: 0, relativeFrobeniusError: 0, explainedEnergyRatio,
      meanOutputCosineSimilarity: cosineSum / sampleCount,
      minOutputCosineSimilarity: minCosine,
      outputMse: mseAccum / (sampleCount * outputDim),
      outputRmse: Math.sqrt(mseAccum / (sampleCount * outputDim)),
      klDivergenceBeforeCalibration: initialEval.kl,
      klDivergenceAfterCalibration: finalKlAccum / sampleCount,
      distillationTemperature: temperature,
      calibrationStepsRun: stepsRun,
    },
  };

  const approxW = dequantizeStudentWeightMatrix(provisional);
  let frobErrSq = 0; let teacherFrobSq = 0;
  for (let i = 0; i < teacher.weights.length; i += 1) {
    const tw = teacher.weights[i] ?? 0;
    const diff = tw - (approxW[i] ?? 0);
    frobErrSq += diff * diff;
    teacherFrobSq += tw * tw;
  }
  const weightFrobeniusError = Math.sqrt(frobErrSq);
  return {
    ...provisional,
    metrics: {
      ...provisional.metrics,
      weightFrobeniusError,
      relativeFrobeniusError: teacherFrobSq > EPSILON ? weightFrobeniusError / Math.sqrt(teacherFrobSq) : 0,
    },
  };
}

/** 증류된 온디바이스 학생 레이어를 양자화 표현에서 직접 추론한다. */
export function evaluateDistilledStudentLayer(
  student: DistilledStudentLayer,
  input: Float32Array,
): StudentInferenceResult {
  if (input.length !== student.inputDim) {
    throw new Error(`입력 벡터 차원(${input.length})이 student.inputDim(${student.inputDim})과 일치하지 않습니다.`);
  }
  assertFiniteFloat32(input, "student.input");
  const linear = forwardStudentLinearOnly(student.decompositionMode, student.leftFactor, student.rightFactor, student.directWeights, input);
  const output = new Float32Array(student.outputDim);
  for (let i = 0; i < student.outputDim; i += 1) output[i] = (linear[i] ?? 0) + (student.bias[i] ?? 0);

  const denseTeacherFlops = 2 * student.outputDim * student.inputDim;
  const estimatedFlops = student.decompositionMode === "low-rank-svd"
    ? 2 * student.rank * (student.inputDim + student.outputDim)
    : denseTeacherFlops;
  return { output, estimatedFlops, denseTeacherFlops, flopSpeedupRatio: estimatedFlops > 0 ? denseTeacherFlops / estimatedFlops : 1 };
}
