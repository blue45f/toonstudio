/**
 * SIGGRAPH 2025/2026 `neural.slang` 패러다임 기반 웹툰 촉각 브러시·재질 인라인 뉴럴 셰이더 컴파일러 및 CPU 참조 실행기.
 *
 * 초소형 2계층 인라인 MLP(FP16/INT8 양자화 가중치)를 유효한 Slang 셰이더 소스(`SLANG_INLINE_TACTILE_BRUSH_SHADER`)와
 * WebGPU WGSL 컴퓨트 셰이더 소스로 결정론적 트랜스파일하고, 패킹된 GPU 가중치 버퍼의 비트-정확 디코딩 경로와
 * CPU 참조 순전파 결과 사이의 최대 오차가 `< 1e-4` 이내임을 검증한다.
 */

import {
  buildSlangInlineShaderSource,
  buildWgslInlineShaderSource,
  createDefaultWebtoonTactileBrushSpec,
  SLANG_INLINE_TACTILE_BRUSH_SHADER,
  TACTILE_BRUSH_HIDDEN_DIM,
  TACTILE_BRUSH_INPUT_DIM,
  TACTILE_BRUSH_OUTPUT_DIM,
  validateTranspiledWgslContract,
} from "./slang-inline-neural-shader-codegen";

export {
  createDefaultWebtoonTactileBrushSpec,
  SLANG_INLINE_TACTILE_BRUSH_SHADER,
  TACTILE_BRUSH_HIDDEN_DIM,
  TACTILE_BRUSH_INPUT_DIM,
  TACTILE_BRUSH_OUTPUT_DIM,
  validateTranspiledWgslContract,
};

export type InlineNeuralQuantization = "fp16" | "int8";
export type InlineNeuralHiddenActivation = "relu" | "leaky_relu" | "tanh" | "silu";
export type InlineNeuralOutputActivation = "sigmoid" | "clamp01" | "linear";

export interface InlineNeuralMlpSpec {
  readonly shaderId: string;
  readonly inputDim: number;
  readonly hiddenDim: number;
  readonly outputDim: number;
  readonly weightsLayer1: ReadonlyArray<number> | Float32Array;
  readonly biasLayer1: ReadonlyArray<number> | Float32Array;
  readonly weightsLayer2: ReadonlyArray<number> | Float32Array;
  readonly biasLayer2: ReadonlyArray<number> | Float32Array;
  readonly hiddenActivation: InlineNeuralHiddenActivation;
  readonly outputActivation: InlineNeuralOutputActivation;
  readonly quantization: InlineNeuralQuantization;
  readonly entryPoint?: string;
  readonly workgroupSize?: readonly [number, number, number];
}

export interface TactileBrushFeatureSample {
  readonly u: number;
  readonly v: number;
  readonly pressure: number;
  readonly tiltSin: number;
  readonly velocity: number;
  readonly paperGrain: number;
  readonly wetness: number;
  readonly radialDist: number;
}

export interface TactileBrushShaderEvaluation {
  readonly inkDensity: number;
  readonly dryBrushMask: number;
  readonly impastoHeight: number;
  readonly granulation: number;
  readonly rawOutputs: Float32Array;
}

export interface InlineNeuralBindingSpec {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage";
  readonly access: "read" | "read_write";
  readonly wgslType: string;
}

export interface QuantizedWeightBufferLayout {
  readonly quantization: InlineNeuralQuantization;
  readonly w1WordOffset: number;
  readonly w1ElementCount: number;
  readonly b1WordOffset: number;
  readonly b1ElementCount: number;
  readonly w2WordOffset: number;
  readonly w2ElementCount: number;
  readonly b2WordOffset: number;
  readonly b2ElementCount: number;
  readonly w1Scale: number;
  readonly b1Scale: number;
  readonly w2Scale: number;
  readonly b2Scale: number;
  readonly totalU32Words: number;
  readonly byteLength: number;
}

export interface DequantizedMlpWeights {
  readonly w1: Float32Array;
  readonly b1: Float32Array;
  readonly w2: Float32Array;
  readonly b2: Float32Array;
}

export interface CompiledInlineNeuralShaderArtifact {
  readonly shaderId: string;
  readonly inputDim: number;
  readonly hiddenDim: number;
  readonly outputDim: number;
  readonly hiddenActivation: InlineNeuralHiddenActivation;
  readonly outputActivation: InlineNeuralOutputActivation;
  readonly quantization: InlineNeuralQuantization;
  readonly entryPoint: string;
  readonly workgroupSize: readonly [number, number, number];
  readonly slangSource: string;
  readonly wgslSource: string;
  readonly packedWeightsU32: Uint32Array;
  readonly weightLayout: QuantizedWeightBufferLayout;
  readonly dequantizedWeights: DequantizedMlpWeights;
  readonly bindings: ReadonlyArray<InlineNeuralBindingSpec>;
  readonly fingerprint: string;
}

export interface WgslSyntaxContractReport {
  readonly hasComputeStage: boolean;
  readonly hasWorkgroupSize: boolean;
  readonly hasAllRequiredBindings: boolean;
  readonly hasEvalFunction: boolean;
  readonly hasQuantizationUnpacker: boolean;
  readonly hasBalancedDelimiters: boolean;
  readonly passed: boolean;
}

export interface InlineNeuralParityReport {
  readonly sampleCount: number;
  readonly maxAbsError: number;
  readonly meanAbsError: number;
  readonly rmse: number;
  readonly maxQuantizationDriftVsFp32: number;
  readonly threshold: number;
  readonly wgslContract: WgslSyntaxContractReport;
  readonly passed: boolean;
}

export const MAX_INLINE_MLP_INPUT_DIM = 16;
export const MAX_INLINE_MLP_HIDDEN_DIM = 32;
export const MAX_INLINE_MLP_OUTPUT_DIM = 8;
export const DEFAULT_INLINE_NEURAL_PARITY_TOLERANCE = 1e-4;

const FLOAT32_SCRATCH = new Float32Array(1);
const UINT32_SCRATCH = new Uint32Array(FLOAT32_SCRATCH.buffer);

/**
 * IEEE 754 단정밀도 실수(FP32)를 반정밀도(FP16, uint16 비트 패턴)로 결정론적 변환한다.
 */
export function encodeFloat16(value: number): number {
  if (!Number.isFinite(value)) {
    if (Number.isNaN(value)) return 0x7e00;
    return value < 0 ? 0xfbff : 0x7bff;
  }
  FLOAT32_SCRATCH[0] = value;
  const bits = UINT32_SCRATCH[0];
  const sign = (bits >>> 16) & 0x8000;
  const exp = (bits >>> 23) & 0xff;
  const mantissa = bits & 0x7fffff;

  if (exp === 0) return sign;
  if (exp === 0xff) return sign | 0x7bff;

  const unbiasedExp = exp - 127;
  if (unbiasedExp > 15) return sign | 0x7bff;
  if (unbiasedExp < -24) return sign;
  if (unbiasedExp < -14) {
    const shift = -14 - unbiasedExp;
    const fullMantissa = 0x800000 | mantissa;
    const shifted = fullMantissa >>> (shift + 13);
    const remainder = fullMantissa & ((1 << (shift + 13)) - 1);
    const halfway = 1 << (shift + 12);
    const rounded =
      remainder > halfway || (remainder === halfway && (shifted & 1) === 1) ? shifted + 1 : shifted;
    return sign | rounded;
  }

  let resultExp = unbiasedExp + 15;
  let resultMantissa = mantissa >>> 13;
  const remainder = mantissa & 0x1fff;
  if (remainder > 0x1000 || (remainder === 0x1000 && (resultMantissa & 1) === 1)) {
    resultMantissa += 1;
    if (resultMantissa === 0x400) {
      resultMantissa = 0;
      resultExp += 1;
      if (resultExp >= 31) return sign | 0x7bff;
    }
  }
  return sign | (resultExp << 10) | resultMantissa;
}

/**
 * IEEE 754 반정밀도(FP16, uint16) 비트를 WGSL `unpack2x16float`과 동일한 단정밀도 실수로 복원한다.
 */
export function decodeFloat16(halfBits: number): number {
  const h = halfBits & 0xffff;
  const sign = (h & 0x8000) !== 0 ? -1 : 1;
  const exp = (h >>> 10) & 0x1f;
  const frac = h & 0x03ff;

  if (exp === 0) {
    if (frac === 0) return sign < 0 ? -0 : 0;
    return Math.fround(sign * Math.pow(2, -14) * (frac / 1024));
  }
  if (exp === 31) return frac === 0 ? sign * Infinity : Number.NaN;
  return Math.fround(sign * Math.pow(2, exp - 15) * (1 + frac / 1024));
}

function validateSpec(spec: InlineNeuralMlpSpec): void {
  if (!spec.shaderId || !/^[a-zA-Z0-9_-]+$/u.test(spec.shaderId)) {
    throw new Error(`유효하지 않은 shaderId입니다: "${spec.shaderId}"`);
  }
  if (!Number.isInteger(spec.inputDim) || spec.inputDim < 1 || spec.inputDim > MAX_INLINE_MLP_INPUT_DIM) {
    throw new Error(`inputDim(${spec.inputDim})은 1..${MAX_INLINE_MLP_INPUT_DIM} 정수여야 합니다.`);
  }
  if (!Number.isInteger(spec.hiddenDim) || spec.hiddenDim < 1 || spec.hiddenDim > MAX_INLINE_MLP_HIDDEN_DIM) {
    throw new Error(`hiddenDim(${spec.hiddenDim})은 1..${MAX_INLINE_MLP_HIDDEN_DIM} 정수여야 합니다.`);
  }
  if (!Number.isInteger(spec.outputDim) || spec.outputDim < 1 || spec.outputDim > MAX_INLINE_MLP_OUTPUT_DIM) {
    throw new Error(`outputDim(${spec.outputDim})은 1..${MAX_INLINE_MLP_OUTPUT_DIM} 정수여야 합니다.`);
  }
  const expectedW1 = spec.hiddenDim * spec.inputDim;
  const expectedW2 = spec.outputDim * spec.hiddenDim;
  if (spec.weightsLayer1.length !== expectedW1) {
    throw new Error(`weightsLayer1 길이(${spec.weightsLayer1.length})가 hiddenDim*inputDim(${expectedW1})과 다릅니다.`);
  }
  if (spec.biasLayer1.length !== spec.hiddenDim) {
    throw new Error(`biasLayer1 길이(${spec.biasLayer1.length})가 hiddenDim(${spec.hiddenDim})과 다릅니다.`);
  }
  if (spec.weightsLayer2.length !== expectedW2) {
    throw new Error(`weightsLayer2 길이(${spec.weightsLayer2.length})가 outputDim*hiddenDim(${expectedW2})과 다릅니다.`);
  }
  if (spec.biasLayer2.length !== spec.outputDim) {
    throw new Error(`biasLayer2 길이(${spec.biasLayer2.length})가 outputDim(${spec.outputDim})과 다릅니다.`);
  }
  for (const tensor of [spec.weightsLayer1, spec.biasLayer1, spec.weightsLayer2, spec.biasLayer2]) {
    for (let i = 0; i < tensor.length; i += 1) {
      if (!Number.isFinite(tensor[i])) {
        throw new Error(`가중치 텐서에 비유한 값(${String(tensor[i])})이 포함되어 있습니다.`);
      }
    }
  }
}

interface QuantizedTensorBlock {
  readonly words: Uint32Array;
  readonly scale: number;
  readonly dequantized: Float32Array;
}

function quantizeTensorBlock(
  values: ReadonlyArray<number> | Float32Array,
  quantization: InlineNeuralQuantization,
): QuantizedTensorBlock {
  const count = values.length;
  const dequantized = new Float32Array(count);

  if (quantization === "fp16") {
    const words = new Uint32Array(Math.ceil(count / 2));
    for (let i = 0; i < count; i += 1) {
      const h = encodeFloat16(values[i]);
      const wordIdx = i >>> 1;
      words[wordIdx] = (words[wordIdx] | ((i & 1) === 0 ? h : h << 16)) >>> 0;
      dequantized[i] = decodeFloat16(h);
    }
    return { words, scale: 1.0, dequantized };
  }

  let maxAbs = 0;
  for (let i = 0; i < count; i += 1) {
    const abs = Math.abs(values[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  const scale = maxAbs > 1e-8 ? Math.fround(maxAbs / 127) : 1.0;
  const words = new Uint32Array(Math.ceil(count / 4));
  for (let i = 0; i < count; i += 1) {
    const clampedQ = Math.max(-127, Math.min(127, Math.round(values[i] / scale)));
    const wordIdx = i >>> 2;
    words[wordIdx] = (words[wordIdx] | ((clampedQ & 0xff) << ((i & 3) * 8))) >>> 0;
    dequantized[i] = Math.fround(clampedQ * scale);
  }
  return { words, scale, dequantized };
}

function unpackElementFromBuffer(
  packed: Uint32Array,
  wordOffset: number,
  elementIndex: number,
  quantization: InlineNeuralQuantization,
  scale: number,
): number {
  if (quantization === "fp16") {
    const word = packed[wordOffset + (elementIndex >>> 1)];
    const halfBits = (elementIndex & 1) === 0 ? word & 0xffff : (word >>> 16) & 0xffff;
    return Math.fround(decodeFloat16(halfBits) * scale);
  }
  const word = packed[wordOffset + (elementIndex >>> 2)];
  const unsignedByte = (word >>> ((elementIndex & 3) * 8)) & 0xff;
  return Math.fround((unsignedByte >= 128 ? unsignedByte - 256 : unsignedByte) * scale);
}

function applyHiddenActivationCpu(x: number, kind: InlineNeuralHiddenActivation): number {
  const xf = Math.fround(x);
  switch (kind) {
    case "relu":
      return xf > 0 ? xf : 0;
    case "leaky_relu":
      return xf >= 0 ? xf : Math.fround(xf * Math.fround(0.1));
    case "tanh":
      return Math.fround(Math.tanh(xf));
    case "silu": {
      const clamped = Math.max(-20, Math.min(20, xf));
      return Math.fround(xf / Math.fround(1 + Math.fround(Math.exp(-clamped))));
    }
  }
}

function applyOutputActivationCpu(x: number, kind: InlineNeuralOutputActivation): number {
  const xf = Math.fround(x);
  switch (kind) {
    case "sigmoid": {
      const clamped = Math.max(-20, Math.min(20, xf));
      return Math.fround(1 / Math.fround(1 + Math.fround(Math.exp(-clamped))));
    }
    case "clamp01":
      return xf < 0 ? 0 : xf > 1 ? 1 : xf;
    case "linear":
      return xf;
  }
}

function computeFnv1aFingerprint(text: string, words: Uint32Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ (text.charCodeAt(i) & 0xff), 0x01000193) >>> 0;
  }
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    hash = Math.imul(hash ^ (w & 0xff), 0x01000193) >>> 0;
    hash = Math.imul(hash ^ ((w >>> 8) & 0xff), 0x01000193) >>> 0;
    hash = Math.imul(hash ^ ((w >>> 16) & 0xff), 0x01000193) >>> 0;
    hash = Math.imul(hash ^ ((w >>> 24) & 0xff), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * 초소형 2계층 인라인 MLP 사양을 양자화(FP16/INT8)하고 유효한 Slang 및 WebGPU WGSL 셰이더로 결정론적 컴파일한다.
 */
export function compileInlineNeuralShaderToWgsl(
  spec: InlineNeuralMlpSpec,
): CompiledInlineNeuralShaderArtifact {
  validateSpec(spec);

  const entryPoint = spec.entryPoint ?? "cs_inline_neural_brush";
  const workgroupSize: readonly [number, number, number] = spec.workgroupSize ?? [64, 1, 1];
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/u.test(entryPoint)) {
    throw new Error(`유효하지 않은 WGSL entryPoint입니다: "${entryPoint}"`);
  }

  const qW1 = quantizeTensorBlock(spec.weightsLayer1, spec.quantization);
  const qB1 = quantizeTensorBlock(spec.biasLayer1, spec.quantization);
  const qW2 = quantizeTensorBlock(spec.weightsLayer2, spec.quantization);
  const qB2 = quantizeTensorBlock(spec.biasLayer2, spec.quantization);

  const w1WordOffset = 0;
  const b1WordOffset = w1WordOffset + qW1.words.length;
  const w2WordOffset = b1WordOffset + qB1.words.length;
  const b2WordOffset = w2WordOffset + qW2.words.length;
  const totalU32Words = b2WordOffset + qB2.words.length;

  const packedWeightsU32 = new Uint32Array(totalU32Words);
  packedWeightsU32.set(qW1.words, w1WordOffset);
  packedWeightsU32.set(qB1.words, b1WordOffset);
  packedWeightsU32.set(qW2.words, w2WordOffset);
  packedWeightsU32.set(qB2.words, b2WordOffset);

  const weightLayout: QuantizedWeightBufferLayout = {
    quantization: spec.quantization,
    w1WordOffset,
    w1ElementCount: spec.weightsLayer1.length,
    b1WordOffset,
    b1ElementCount: spec.biasLayer1.length,
    w2WordOffset,
    w2ElementCount: spec.weightsLayer2.length,
    b2WordOffset,
    b2ElementCount: spec.biasLayer2.length,
    w1Scale: qW1.scale,
    b1Scale: qB1.scale,
    w2Scale: qW2.scale,
    b2Scale: qB2.scale,
    totalU32Words,
    byteLength: totalU32Words * 4,
  };

  const slangSource = buildSlangInlineShaderSource(spec, weightLayout, entryPoint, workgroupSize);
  const wgslSource = buildWgslInlineShaderSource(spec, weightLayout, entryPoint, workgroupSize);
  const bindings: ReadonlyArray<InlineNeuralBindingSpec> = [
    { group: 0, binding: 0, name: "u_meta", addressSpace: "uniform", access: "read", wgslType: "InlineNeuralMeta" },
    { group: 0, binding: 1, name: "b_weights_packed", addressSpace: "storage", access: "read", wgslType: "array<u32>" },
    { group: 0, binding: 2, name: "b_features", addressSpace: "storage", access: "read", wgslType: "array<f32>" },
    { group: 0, binding: 3, name: "b_outputs", addressSpace: "storage", access: "read_write", wgslType: "array<f32>" },
  ];

  return {
    shaderId: spec.shaderId,
    inputDim: spec.inputDim,
    hiddenDim: spec.hiddenDim,
    outputDim: spec.outputDim,
    hiddenActivation: spec.hiddenActivation,
    outputActivation: spec.outputActivation,
    quantization: spec.quantization,
    entryPoint,
    workgroupSize,
    slangSource,
    wgslSource,
    packedWeightsU32,
    weightLayout,
    dequantizedWeights: { w1: qW1.dequantized, b1: qB1.dequantized, w2: qW2.dequantized, b2: qB2.dequantized },
    bindings,
    fingerprint: computeFnv1aFingerprint(wgslSource, packedWeightsU32),
  };
}

export function packTactileBrushSampleToVector(sample: TactileBrushFeatureSample): Float32Array {
  return new Float32Array([
    sample.u,
    sample.v,
    sample.pressure,
    sample.tiltSin,
    sample.velocity,
    sample.paperGrain,
    sample.wetness,
    sample.radialDist,
  ]);
}

function forwardPassFloat32(
  features: ReadonlyArray<number> | Float32Array,
  inputDim: number,
  hiddenDim: number,
  outputDim: number,
  w1: ReadonlyArray<number> | Float32Array,
  b1: ReadonlyArray<number> | Float32Array,
  w2: ReadonlyArray<number> | Float32Array,
  b2: ReadonlyArray<number> | Float32Array,
  hiddenActivation: InlineNeuralHiddenActivation,
  outputActivation: InlineNeuralOutputActivation,
): Float32Array {
  if (features.length !== inputDim) {
    throw new Error(`입력 특징 차원(${features.length})이 모델 inputDim(${inputDim})과 다릅니다.`);
  }
  const hidden = new Float32Array(hiddenDim);
  for (let h = 0; h < hiddenDim; h += 1) {
    let acc = Math.fround(b1[h]);
    const rowOffset = h * inputDim;
    for (let i = 0; i < inputDim; i += 1) {
      acc = Math.fround(Math.fround(w1[rowOffset + i] * Math.fround(features[i])) + acc);
    }
    hidden[h] = applyHiddenActivationCpu(acc, hiddenActivation);
  }

  const out = new Float32Array(outputDim);
  for (let o = 0; o < outputDim; o += 1) {
    let acc = Math.fround(b2[o]);
    const rowOffset = o * hiddenDim;
    for (let h = 0; h < hiddenDim; h += 1) {
      acc = Math.fround(Math.fround(w2[rowOffset + h] * hidden[h]) + acc);
    }
    out[o] = applyOutputActivationCpu(acc, outputActivation);
  }
  return out;
}

/**
 * WGSL 컴퓨트 커널의 `b_weights_packed` 비트 언패킹 경로를 CPU에서 비트 단위로 에뮬레이션 실행한다.
 */
export function emulateCompiledWgslInlineMlp(
  compiled: CompiledInlineNeuralShaderArtifact,
  features: ReadonlyArray<number> | Float32Array,
): Float32Array {
  const { inputDim, hiddenDim, outputDim, packedWeightsU32, weightLayout } = compiled;
  if (features.length !== inputDim) {
    throw new Error(`입력 특징 차원(${features.length})이 모델 inputDim(${inputDim})과 다릅니다.`);
  }
  const hidden = new Float32Array(hiddenDim);
  for (let h = 0; h < hiddenDim; h += 1) {
    let acc = unpackElementFromBuffer(
      packedWeightsU32,
      weightLayout.b1WordOffset,
      h,
      weightLayout.quantization,
      weightLayout.b1Scale,
    );
    const rowOffset = h * inputDim;
    for (let i = 0; i < inputDim; i += 1) {
      const w = unpackElementFromBuffer(
        packedWeightsU32,
        weightLayout.w1WordOffset,
        rowOffset + i,
        weightLayout.quantization,
        weightLayout.w1Scale,
      );
      acc = Math.fround(Math.fround(w * Math.fround(features[i])) + acc);
    }
    hidden[h] = applyHiddenActivationCpu(acc, compiled.hiddenActivation);
  }

  const out = new Float32Array(outputDim);
  for (let o = 0; o < outputDim; o += 1) {
    let acc = unpackElementFromBuffer(
      packedWeightsU32,
      weightLayout.b2WordOffset,
      o,
      weightLayout.quantization,
      weightLayout.b2Scale,
    );
    const rowOffset = o * hiddenDim;
    for (let h = 0; h < hiddenDim; h += 1) {
      const w = unpackElementFromBuffer(
        packedWeightsU32,
        weightLayout.w2WordOffset,
        rowOffset + h,
        weightLayout.quantization,
        weightLayout.w2Scale,
      );
      acc = Math.fround(Math.fround(w * hidden[h]) + acc);
    }
    out[o] = applyOutputActivationCpu(acc, compiled.outputActivation);
  }
  return out;
}

/**
 * 컴파일된 인라인 뉴럴 셰이더(또는 원본 사양)를 CPU 참조 경로로 실행해 웹툰 촉각 브러시 출력을 계산한다.
 */
export function evaluateInlineNeuralTactileShader(
  model: CompiledInlineNeuralShaderArtifact | InlineNeuralMlpSpec,
  sample: TactileBrushFeatureSample | ReadonlyArray<number> | Float32Array,
): TactileBrushShaderEvaluation {
  const features =
    sample instanceof Float32Array || Array.isArray(sample)
      ? sample
      : packTactileBrushSampleToVector(sample as TactileBrushFeatureSample);

  const rawOutputs =
    "dequantizedWeights" in model
      ? forwardPassFloat32(
          features,
          model.inputDim,
          model.hiddenDim,
          model.outputDim,
          model.dequantizedWeights.w1,
          model.dequantizedWeights.b1,
          model.dequantizedWeights.w2,
          model.dequantizedWeights.b2,
          model.hiddenActivation,
          model.outputActivation,
        )
      : forwardPassFloat32(
          features,
          model.inputDim,
          model.hiddenDim,
          model.outputDim,
          model.weightsLayer1,
          model.biasLayer1,
          model.weightsLayer2,
          model.biasLayer2,
          model.hiddenActivation,
          model.outputActivation,
        );

  return {
    inkDensity: rawOutputs[0] ?? 0,
    dryBrushMask: rawOutputs[1] ?? 0,
    impastoHeight: rawOutputs[2] ?? 0,
    granulation: rawOutputs[3] ?? 0,
    rawOutputs,
  };
}

/**
 * 컴파일된 WGSL 패킹 버퍼 에뮬레이션과 CPU 참조 실행의 정합성(`< 1e-4`)을 다수 샘플에 대해 검증한다.
 */
export function verifyInlineNeuralShaderParity(
  compiled: CompiledInlineNeuralShaderArtifact,
  samples: ReadonlyArray<TactileBrushFeatureSample | ReadonlyArray<number> | Float32Array>,
  options: { readonly originalFp32Spec?: InlineNeuralMlpSpec; readonly tolerance?: number } = {},
): InlineNeuralParityReport {
  const tolerance = options.tolerance ?? DEFAULT_INLINE_NEURAL_PARITY_TOLERANCE;
  const wgslContract = validateTranspiledWgslContract(compiled);

  let maxAbsError = 0;
  let sumAbsError = 0;
  let sumSqError = 0;
  let totalElements = 0;
  let maxQuantizationDriftVsFp32 = 0;

  for (const sample of samples) {
    const feat =
      sample instanceof Float32Array || Array.isArray(sample)
        ? sample
        : packTactileBrushSampleToVector(sample as TactileBrushFeatureSample);
    const gpuEmulated = emulateCompiledWgslInlineMlp(compiled, feat);
    const cpuRef = evaluateInlineNeuralTactileShader(compiled, feat).rawOutputs;
    const fp32Ref = options.originalFp32Spec
      ? evaluateInlineNeuralTactileShader(options.originalFp32Spec, feat).rawOutputs
      : null;

    for (let o = 0; o < compiled.outputDim; o += 1) {
      const diff = Math.abs(gpuEmulated[o] - cpuRef[o]);
      if (diff > maxAbsError) maxAbsError = diff;
      sumAbsError += diff;
      sumSqError += diff * diff;
      totalElements += 1;
      if (fp32Ref !== null) {
        const drift = Math.abs(gpuEmulated[o] - fp32Ref[o]);
        if (drift > maxQuantizationDriftVsFp32) maxQuantizationDriftVsFp32 = drift;
      }
    }
  }

  return {
    sampleCount: samples.length,
    maxAbsError,
    meanAbsError: totalElements > 0 ? sumAbsError / totalElements : 0,
    rmse: totalElements > 0 ? Math.sqrt(sumSqError / totalElements) : 0,
    maxQuantizationDriftVsFp32,
    threshold: tolerance,
    wgslContract,
    passed: wgslContract.passed && maxAbsError < tolerance,
  };
}
