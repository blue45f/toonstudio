import type { LoraAdapterWeights } from "./federated-lora-engine";
import { assertAdapter } from "./lora-input-contract";

export function computeFloat32L2Norm(arr: Float32Array): number {
  if (arr.some((value) => !Number.isFinite(value))) throw new RangeError("노름 버퍼에는 유한한 수만 허용합니다.");
  let sumSq = 0;
  for (let i = 0; i < arr.length; i += 1) {
    const v = arr[i] ?? 0;
    sumSq += v * v;
  }
  return Math.sqrt(sumSq);
}

/** 유효 저랭크 변화 행렬 ΔW = (alpha / r) · (A · B)와 프로베니우스 노름을 계산한다. */
export function computeEffectiveDeltaW(adapter: LoraAdapterWeights): { readonly deltaW: Float32Array; readonly frobeniusNorm: number } {
  assertAdapter(adapter);
  const { inDim, outDim, rank, alpha, matrixA, matrixB } = adapter;
  const scale = alpha / rank;
  const deltaW = new Float32Array(outDim * inDim);
  for (let row = 0; row < outDim; row += 1) {
    for (let col = 0; col < inDim; col += 1) {
      let acc = 0;
      for (let r = 0; r < rank; r += 1) acc += (matrixA[row * rank + r] ?? 0) * (matrixB[r * inDim + col] ?? 0);
      deltaW[row * inDim + col] = acc * scale;
    }
  }
  return { deltaW, frobeniusNorm: computeFloat32L2Norm(deltaW) };
}

/** 어댑터 순전파 y = base(x) + (alpha / r) · A · (B · x)를 계산한다. */
export function forwardLoraAdapter(adapter: LoraAdapterWeights, inputFeatures: Float32Array): Float32Array {
  assertAdapter(adapter);
  const { inDim, outDim, rank, alpha, matrixA, matrixB } = adapter;
  if (inputFeatures.length !== inDim || inputFeatures.some((value) => !Number.isFinite(value))) throw new RangeError("순전파 입력 길이·수치가 올바르지 않습니다.");
  const scale = alpha / rank;
  const hidden = new Float32Array(rank);
  for (let r = 0; r < rank; r += 1) {
    let acc = 0;
    for (let j = 0; j < inDim; j += 1) acc += (matrixB[r * inDim + j] ?? 0) * (inputFeatures[j] ?? 0);
    hidden[r] = acc;
  }
  const output = new Float32Array(outDim);
  for (let i = 0; i < outDim; i += 1) {
    let deltaAcc = 0;
    for (let r = 0; r < rank; r += 1) deltaAcc += (matrixA[i * rank + r] ?? 0) * (hidden[r] ?? 0);
    output[i] = (inputFeatures[i % inDim] ?? 0) + scale * deltaAcc;
  }
  return output;
}

