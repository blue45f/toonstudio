/**
 * Wave 40 — 그룹 단위(32/64/128) 대칭·비대칭 동적 INT8 및 니블 패킹 INT4 텐서 양자화기,
 * L1 중요도 기반 구조적 채널 가지치기(Pruner) 및 공간 희소 마스크 Winograd F(2×2, 3×3) · 깊이별 분리 합성곱 가속기.
 */

export type QuantizationGroupSize = 32 | 64 | 128;
export type QuantizationBitWidth = 4 | 8;
export type QuantizationSchemeMode = "symmetric" | "asymmetric";
export type ConvActivationKind = "none" | "relu" | "gelu";

export interface TensorQuantizationOptions {
  readonly bits: QuantizationBitWidth;
  readonly mode: QuantizationSchemeMode;
  readonly groupSize: QuantizationGroupSize;
}

export interface QuantizedTensorPacket {
  readonly bits: QuantizationBitWidth;
  readonly mode: QuantizationSchemeMode;
  readonly groupSize: QuantizationGroupSize;
  readonly originalLength: number;
  readonly groupCount: number;
  readonly packedData: Uint8Array;
  readonly scales: Float32Array;
  readonly zeroPoints: Int16Array;
}

export interface QuantizationQualityReport {
  readonly sqnrDb: number;
  readonly maxAbsError: number;
  readonly meanAbsError: number;
  readonly originalBytes: number;
  readonly packedWeightBytes: number;
  readonly metadataBytes: number;
  readonly totalCompressedBytes: number;
  readonly payloadSavingsRatio: number;
  readonly totalMemorySavingsRatio: number;
}

export interface QuantizeWithReportResult {
  readonly packet: QuantizedTensorPacket;
  readonly reconstructed: Float32Array;
  readonly report: QuantizationQualityReport;
}

export interface StructuredChannelPruneInput {
  readonly weights: Float32Array;
  readonly outChannels: number;
  readonly inChannels: number;
  readonly kernelH: number;
  readonly kernelW: number;
  readonly bias?: Float32Array;
  readonly activationImportance?: Float32Array;
  readonly targetPruneRatio: number;
  readonly minKeepChannels?: number;
  readonly channelMultiple?: 1 | 2 | 4 | 8;
}

export interface StructuredChannelPruneResult {
  readonly prunedWeights: Float32Array;
  readonly prunedBias: Float32Array | null;
  readonly keptOutChannels: number;
  readonly originalOutChannels: number;
  readonly keptChannelIndices: Int32Array;
  readonly prunedChannelIndices: Int32Array;
  readonly channelImportanceScores: Float32Array;
  readonly actualPruneRatio: number;
  readonly retainedImportanceRatio: number;
}

export interface WinogradConv2d3x3Input {
  readonly input: Float32Array;
  readonly inChannels: number;
  readonly height: number;
  readonly width: number;
  readonly weights: Float32Array;
  readonly outChannels: number;
  readonly bias?: Float32Array;
  readonly padding?: 0 | 1;
  readonly activation?: ConvActivationKind;
  readonly spatialMask?: Uint8Array;
}

export interface WinogradConv2d3x3Result {
  readonly output: Float32Array;
  readonly outChannels: number;
  readonly outHeight: number;
  readonly outWidth: number;
  readonly totalTiles: number;
  readonly executedTiles: number;
  readonly skippedSparseTiles: number;
  readonly tileSparsityRatio: number;
}

export interface DepthwiseSeparableConv2dInput {
  readonly input: Float32Array;
  readonly inChannels: number;
  readonly height: number;
  readonly width: number;
  readonly depthwiseWeights3x3: Float32Array;
  readonly depthwiseBias?: Float32Array;
  readonly pointwiseWeights1x1: Float32Array;
  readonly outChannels: number;
  readonly pointwiseBias?: Float32Array;
  readonly padding?: 0 | 1;
  readonly depthwiseActivation?: ConvActivationKind;
  readonly pointwiseActivation?: ConvActivationKind;
  readonly spatialMask?: Uint8Array;
}

export interface DepthwiseSeparableConv2dResult {
  readonly output: Float32Array;
  readonly outChannels: number;
  readonly outHeight: number;
  readonly outWidth: number;
  readonly skippedDepthwiseTiles: number;
  readonly skippedPointwisePixels: number;
}

const MAX_SQNR_CEILING_DB = 120;

function clampInt(value: number, lo: number, hi: number): number {
  const rounded = Math.round(value);
  return rounded < lo ? lo : rounded > hi ? hi : rounded === 0 ? 0 : rounded;
}

function applyConvActivation(value: number, activation: ConvActivationKind): number {
  if (activation === "relu") return value > 0 ? value : 0;
  if (activation === "gelu") {
    const inner = 0.7978845608028654 * (value + 0.044715 * value * value * value);
    return 0.5 * value * (1 + Math.tanh(inner));
  }
  return value;
}

function writeQuantizedCode(packedData: Uint8Array, index: number, bits: QuantizationBitWidth, q: number): void {
  if (bits === 8) {
    packedData[index] = q & 0xff;
    return;
  }
  const nibble = q & 0x0f;
  const byteIdx = index >>> 1;
  packedData[byteIdx] = (packedData[byteIdx] ?? 0) | ((index & 1) === 0 ? nibble : nibble << 4);
}

export function quantizeTensorDynamicGroupwise(tensor: Float32Array, options: TensorQuantizationOptions): QuantizedTensorPacket {
  const { bits, mode, groupSize } = options;
  const originalLength = tensor.length;
  const groupCount = Math.max(1, Math.ceil(originalLength / groupSize));
  const scales = new Float32Array(groupCount);
  const zeroPoints = new Int16Array(groupCount);
  const packedData = new Uint8Array(bits === 4 ? Math.ceil(originalLength / 2) : originalLength);
  const symMaxQ = bits === 8 ? 127 : 7;
  const asymMaxQ = bits === 8 ? 255 : 15;

  for (let g = 0; g < groupCount; g += 1) {
    const start = g * groupSize;
    const end = Math.min(originalLength, start + groupSize);
    if (mode === "symmetric") {
      let maxAbs = 0;
      for (let i = start; i < end; i += 1) {
        const absVal = Math.abs(tensor[i] ?? 0);
        if (absVal > maxAbs) maxAbs = absVal;
      }
      scales[g] = maxAbs > 1e-12 ? maxAbs / symMaxQ : 1;
      zeroPoints[g] = 0;
      const invScale = maxAbs > 1e-12 ? symMaxQ / maxAbs : 0;
      for (let i = start; i < end; i += 1) {
        writeQuantizedCode(packedData, i, bits, clampInt((tensor[i] ?? 0) * invScale, -symMaxQ, symMaxQ));
      }
    } else {
      let minVal = 0;
      let maxVal = 0;
      for (let i = start; i < end; i += 1) {
        const v = tensor[i] ?? 0;
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
      const span = maxVal - minVal;
      scales[g] = span > 1e-12 ? span / asymMaxQ : 1;
      const invScale = span > 1e-12 ? asymMaxQ / span : 0;
      const zp = span > 1e-12 ? clampInt(-minVal * invScale, 0, asymMaxQ) : 0;
      zeroPoints[g] = zp;
      for (let i = start; i < end; i += 1) {
        writeQuantizedCode(packedData, i, bits, clampInt((tensor[i] ?? 0) * invScale + zp, 0, asymMaxQ));
      }
    }
  }
  return { bits, mode, groupSize, originalLength, groupCount, packedData, scales, zeroPoints };
}

export function dequantizeTensorDynamicGroupwise(packet: QuantizedTensorPacket, dst?: Float32Array): Float32Array {
  const { bits, mode, groupSize, originalLength, packedData, scales, zeroPoints } = packet;
  const out = dst && dst.length >= originalLength ? dst : new Float32Array(originalLength);
  for (let i = 0; i < originalLength; i += 1) {
    const g = Math.floor(i / groupSize);
    let q: number;
    if (bits === 8) {
      const rawByte = packedData[i] ?? 0;
      q = mode === "symmetric" ? (rawByte << 24) >> 24 : rawByte;
    } else {
      const rawByte = packedData[i >>> 1] ?? 0;
      const nibble = (i & 1) === 0 ? rawByte & 0x0f : (rawByte >>> 4) & 0x0f;
      q = mode === "symmetric" ? (nibble << 28) >> 28 : nibble;
    }
    out[i] = (q - (zeroPoints[g] ?? 0)) * (scales[g] ?? 1);
  }
  return out;
}

export function evaluateQuantizationQuality(
  original: Float32Array,
  reconstructed: Float32Array,
  packet: QuantizedTensorPacket,
): QuantizationQualityReport {
  let signalPower = 0;
  let noisePower = 0;
  let maxAbsError = 0;
  let absErrorSum = 0;
  for (let i = 0; i < original.length; i += 1) {
    const ref = original[i] ?? 0;
    const err = Math.abs(ref - (reconstructed[i] ?? 0));
    signalPower += ref * ref;
    noisePower += err * err;
    absErrorSum += err;
    if (err > maxAbsError) maxAbsError = err;
  }
  const sqnrDb = noisePower <= 1e-24 ? MAX_SQNR_CEILING_DB : signalPower > 1e-24 ? 10 * Math.log10(signalPower / noisePower) : 0;
  const originalBytes = original.byteLength;
  const packedWeightBytes = packet.packedData.byteLength;
  const metadataBytes = packet.scales.byteLength + packet.zeroPoints.byteLength;
  const totalCompressedBytes = packedWeightBytes + metadataBytes;
  return {
    sqnrDb, maxAbsError, meanAbsError: original.length > 0 ? absErrorSum / original.length : 0,
    originalBytes, packedWeightBytes, metadataBytes, totalCompressedBytes,
    payloadSavingsRatio: originalBytes > 0 ? 1 - packedWeightBytes / originalBytes : 0,
    totalMemorySavingsRatio: originalBytes > 0 ? 1 - totalCompressedBytes / originalBytes : 0,
  };
}

export function quantizeAndAuditTensor(tensor: Float32Array, options: TensorQuantizationOptions): QuantizeWithReportResult {
  const packet = quantizeTensorDynamicGroupwise(tensor, options);
  const reconstructed = dequantizeTensorDynamicGroupwise(packet);
  return { packet, reconstructed, report: evaluateQuantizationQuality(tensor, reconstructed, packet) };
}

export function pruneConv2dOutputChannelsStructured(input: StructuredChannelPruneInput): StructuredChannelPruneResult {
  const { weights, outChannels, inChannels, kernelH, kernelW, bias, activationImportance, targetPruneRatio } = input;
  const minKeep = Math.max(1, Math.min(outChannels, Math.trunc(input.minKeepChannels ?? 1)));
  const multiple = input.channelMultiple ?? 1;
  const clampedRatio = targetPruneRatio < 0 ? 0 : targetPruneRatio > 0.95 ? 0.95 : targetPruneRatio;
  const kernelVolume = inChannels * kernelH * kernelW;
  const channelImportanceScores = new Float32Array(outChannels);
  let totalImportance = 0;
  for (let oc = 0; oc < outChannels; oc += 1) {
    let l1 = 0;
    const base = oc * kernelVolume;
    for (let k = 0; k < kernelVolume; k += 1) l1 += Math.abs(weights[base + k] ?? 0);
    const score = l1 * (activationImportance ? Math.max(0, activationImportance[oc] ?? 1) : 1);
    channelImportanceScores[oc] = score;
    totalImportance += score;
  }
  const rawKeep = Math.round(outChannels * (1 - clampedRatio));
  const alignedKeep = multiple > 1 ? Math.max(multiple, Math.round(rawKeep / multiple) * multiple) : rawKeep;
  const keptOutChannels = Math.max(minKeep, Math.min(outChannels, alignedKeep));
  const ranked = Array.from({ length: outChannels }, (_, idx) => idx).sort((a, b) => {
    const diff = (channelImportanceScores[b] ?? 0) - (channelImportanceScores[a] ?? 0);
    return diff !== 0 ? diff : a - b;
  });
  const keptSet = new Set<number>(ranked.slice(0, keptOutChannels));
  const keptChannelIndices = new Int32Array(keptOutChannels);
  const prunedChannelIndices = new Int32Array(outChannels - keptOutChannels);
  let keptCursor = 0;
  let prunedCursor = 0;
  let retainedImportance = 0;
  for (let oc = 0; oc < outChannels; oc += 1) {
    if (keptSet.has(oc)) {
      keptChannelIndices[keptCursor] = oc;
      keptCursor += 1;
      retainedImportance += channelImportanceScores[oc] ?? 0;
    } else {
      prunedChannelIndices[prunedCursor] = oc;
      prunedCursor += 1;
    }
  }
  const prunedWeights = new Float32Array(keptOutChannels * kernelVolume);
  const prunedBias = bias ? new Float32Array(keptOutChannels) : null;
  for (let newOc = 0; newOc < keptOutChannels; newOc += 1) {
    const oldOc = keptChannelIndices[newOc] ?? 0;
    prunedWeights.set(weights.subarray(oldOc * kernelVolume, (oldOc + 1) * kernelVolume), newOc * kernelVolume);
    if (prunedBias && bias) prunedBias[newOc] = bias[oldOc] ?? 0;
  }
  return {
    prunedWeights, prunedBias, keptOutChannels, originalOutChannels: outChannels,
    keptChannelIndices, prunedChannelIndices, channelImportanceScores,
    actualPruneRatio: outChannels > 0 ? (outChannels - keptOutChannels) / outChannels : 0,
    retainedImportanceRatio: totalImportance > 1e-12 ? retainedImportance / totalImportance : 1,
  };
}

const temp4x3 = new Float64Array(12);
const temp4x4 = new Float64Array(16);

function transformWinogradFilter3x3(g: Float32Array, offset: number, outU: Float64Array, uOffset: number): void {
  for (let c = 0; c < 3; c += 1) {
    const g0 = g[offset + c] ?? 0;
    const g1 = g[offset + 3 + c] ?? 0;
    const g2 = g[offset + 6 + c] ?? 0;
    temp4x3[c] = g0;
    temp4x3[3 + c] = 0.5 * (g0 + g1 + g2);
    temp4x3[6 + c] = 0.5 * (g0 - g1 + g2);
    temp4x3[9 + c] = g2;
  }
  for (let r = 0; r < 4; r += 1) {
    const t0 = temp4x3[r * 3] ?? 0;
    const t1 = temp4x3[r * 3 + 1] ?? 0;
    const t2 = temp4x3[r * 3 + 2] ?? 0;
    const dst = uOffset + r * 4;
    outU[dst] = t0;
    outU[dst + 1] = 0.5 * (t0 + t1 + t2);
    outU[dst + 2] = 0.5 * (t0 - t1 + t2);
    outU[dst + 3] = t2;
  }
}

function transformWinogradInputTile4x4(d: Float64Array, outV: Float64Array, vOffset: number): void {
  for (let c = 0; c < 4; c += 1) {
    const d0 = d[c] ?? 0;
    const d1 = d[4 + c] ?? 0;
    const d2 = d[8 + c] ?? 0;
    const d3 = d[12 + c] ?? 0;
    temp4x4[c] = d0 - d2;
    temp4x4[4 + c] = d1 + d2;
    temp4x4[8 + c] = d2 - d1;
    temp4x4[12 + c] = d1 - d3;
  }
  for (let r = 0; r < 4; r += 1) {
    const w0 = temp4x4[r * 4] ?? 0;
    const w1 = temp4x4[r * 4 + 1] ?? 0;
    const w2 = temp4x4[r * 4 + 2] ?? 0;
    const w3 = temp4x4[r * 4 + 3] ?? 0;
    const dst = vOffset + r * 4;
    outV[dst] = w0 - w2;
    outV[dst + 1] = w1 + w2;
    outV[dst + 2] = w2 - w1;
    outV[dst + 3] = w1 - w3;
  }
}

export function executeWinogradConv2d3x3(params: WinogradConv2d3x3Input): WinogradConv2d3x3Result {
  const { input, inChannels, height, width, weights, outChannels, bias, spatialMask } = params;
  const padding = params.padding ?? 1;
  const activation = params.activation ?? "none";
  const outHeight = Math.max(0, height + 2 * padding - 2);
  const outWidth = Math.max(0, width + 2 * padding - 2);
  const outSpatial = outHeight * outWidth;
  const output = new Float32Array(outChannels * outSpatial);
  if (outHeight === 0 || outWidth === 0) {
    return { output, outChannels, outHeight, outWidth, totalTiles: 0, executedTiles: 0, skippedSparseTiles: 0, tileSparsityRatio: 0 };
  }

  const transformedU = new Float64Array(outChannels * inChannels * 16);
  for (let pair = 0; pair < outChannels * inChannels; pair += 1) {
    transformWinogradFilter3x3(weights, pair * 9, transformedU, pair * 16);
  }
  const dPatch = new Float64Array(16);
  const transformedV = new Float64Array(inChannels * 16);
  const accumM = new Float64Array(16);
  const inSpatial = height * width;
  let totalTiles = 0;
  let executedTiles = 0;
  let skippedSparseTiles = 0;

  for (let oy = 0; oy < outHeight; oy += 2) {
    for (let ox = 0; ox < outWidth; ox += 2) {
      totalTiles += 1;
      const v01 = ox + 1 < outWidth;
      const v10 = oy + 1 < outHeight;
      const m00 = !spatialMask || (spatialMask[oy * outWidth + ox] ?? 0) !== 0;
      const m01 = v01 && (!spatialMask || (spatialMask[oy * outWidth + ox + 1] ?? 0) !== 0);
      const m10 = v10 && (!spatialMask || (spatialMask[(oy + 1) * outWidth + ox] ?? 0) !== 0);
      const m11 = v01 && v10 && (!spatialMask || (spatialMask[(oy + 1) * outWidth + ox + 1] ?? 0) !== 0);
      if (!m00 && !m01 && !m10 && !m11) {
        skippedSparseTiles += 1;
        continue;
      }
      executedTiles += 1;

      for (let ic = 0; ic < inChannels; ic += 1) {
        const chOffset = ic * inSpatial;
        for (let py = 0; py < 4; py += 1) {
          const sy = oy + py - padding;
          const rowOk = sy >= 0 && sy < height;
          for (let px = 0; px < 4; px += 1) {
            const sx = ox + px - padding;
            dPatch[py * 4 + px] = rowOk && sx >= 0 && sx < width ? (input[chOffset + sy * width + sx] ?? 0) : 0;
          }
        }
        transformWinogradInputTile4x4(dPatch, transformedV, ic * 16);
      }

      for (let oc = 0; oc < outChannels; oc += 1) {
        accumM.fill(0);
        const ocPairBase = oc * inChannels;
        for (let ic = 0; ic < inChannels; ic += 1) {
          const uBase = (ocPairBase + ic) * 16;
          const vBase = ic * 16;
          for (let k = 0; k < 16; k += 1) accumM[k] = (accumM[k] ?? 0) + (transformedU[uBase + k] ?? 0) * (transformedV[vBase + k] ?? 0);
        }
        const z00 = (accumM[0] ?? 0) + (accumM[4] ?? 0) + (accumM[8] ?? 0);
        const z01 = (accumM[1] ?? 0) + (accumM[5] ?? 0) + (accumM[9] ?? 0);
        const z02 = (accumM[2] ?? 0) + (accumM[6] ?? 0) + (accumM[10] ?? 0);
        const z03 = (accumM[3] ?? 0) + (accumM[7] ?? 0) + (accumM[11] ?? 0);
        const z10 = (accumM[4] ?? 0) - (accumM[8] ?? 0) - (accumM[12] ?? 0);
        const z11 = (accumM[5] ?? 0) - (accumM[9] ?? 0) - (accumM[13] ?? 0);
        const z12 = (accumM[6] ?? 0) - (accumM[10] ?? 0) - (accumM[14] ?? 0);
        const z13 = (accumM[7] ?? 0) - (accumM[11] ?? 0) - (accumM[15] ?? 0);
        const bVal = bias ? (bias[oc] ?? 0) : 0;
        const outBase = oc * outSpatial;
        if (m00) output[outBase + oy * outWidth + ox] = applyConvActivation(z00 + z01 + z02 + bVal, activation);
        if (m01) output[outBase + oy * outWidth + ox + 1] = applyConvActivation(z01 - z02 - z03 + bVal, activation);
        if (m10) output[outBase + (oy + 1) * outWidth + ox] = applyConvActivation(z10 + z11 + z12 + bVal, activation);
        if (m11) output[outBase + (oy + 1) * outWidth + ox + 1] = applyConvActivation(z11 - z12 - z13 + bVal, activation);
      }
    }
  }
  return { output, outChannels, outHeight, outWidth, totalTiles, executedTiles, skippedSparseTiles, tileSparsityRatio: totalTiles > 0 ? skippedSparseTiles / totalTiles : 0 };
}

export function executeDirectConv2d3x3Reference(params: WinogradConv2d3x3Input): Float32Array {
  const { input, inChannels, height, width, weights, outChannels, bias, spatialMask } = params;
  const padding = params.padding ?? 1;
  const activation = params.activation ?? "none";
  const outHeight = Math.max(0, height + 2 * padding - 2);
  const outWidth = Math.max(0, width + 2 * padding - 2);
  const outSpatial = outHeight * outWidth;
  const inSpatial = height * width;
  const output = new Float32Array(outChannels * outSpatial);

  for (let oy = 0; oy < outHeight; oy += 1) {
    for (let ox = 0; ox < outWidth; ox += 1) {
      const pixelIdx = oy * outWidth + ox;
      if (spatialMask && (spatialMask[pixelIdx] ?? 0) === 0) continue;
      for (let oc = 0; oc < outChannels; oc += 1) {
        let sum = bias ? (bias[oc] ?? 0) : 0;
        for (let ic = 0; ic < inChannels; ic += 1) {
          const wBase = (oc * inChannels + ic) * 9;
          const inBase = ic * inSpatial;
          for (let ky = 0; ky < 3; ky += 1) {
            const sy = oy + ky - padding;
            if (sy < 0 || sy >= height) continue;
            for (let kx = 0; kx < 3; kx += 1) {
              const sx = ox + kx - padding;
              if (sx >= 0 && sx < width) sum += (input[inBase + sy * width + sx] ?? 0) * (weights[wBase + ky * 3 + kx] ?? 0);
            }
          }
        }
        output[oc * outSpatial + pixelIdx] = applyConvActivation(sum, activation);
      }
    }
  }
  return output;
}

export function executeDepthwiseSeparableConv2d(params: DepthwiseSeparableConv2dInput): DepthwiseSeparableConv2dResult {
  const { input, inChannels, height, width, depthwiseWeights3x3, depthwiseBias, pointwiseWeights1x1, outChannels, pointwiseBias, spatialMask } = params;
  const padding = params.padding ?? 1;
  const dwAct = params.depthwiseActivation ?? "none";
  const pwAct = params.pointwiseActivation ?? "none";
  const outHeight = Math.max(0, height + 2 * padding - 2);
  const outWidth = Math.max(0, width + 2 * padding - 2);
  const outSpatial = outHeight * outWidth;
  const inSpatial = height * width;
  const depthwiseOut = new Float32Array(inChannels * outSpatial);
  let skippedDepthwiseTiles = 0;

  for (let ch = 0; ch < inChannels; ch += 1) {
    const dwRes = executeWinogradConv2d3x3({
      input: input.subarray(ch * inSpatial, (ch + 1) * inSpatial),
      inChannels: 1,
      height,
      width,
      weights: depthwiseWeights3x3.subarray(ch * 9, (ch + 1) * 9),
      outChannels: 1,
      bias: depthwiseBias ? depthwiseBias.subarray(ch, ch + 1) : undefined,
      padding,
      activation: dwAct,
      spatialMask,
    });
    depthwiseOut.set(dwRes.output, ch * outSpatial);
    if (ch === 0) skippedDepthwiseTiles = dwRes.skippedSparseTiles;
  }

  const output = new Float32Array(outChannels * outSpatial);
  let skippedPointwisePixels = 0;
  for (let idx = 0; idx < outSpatial; idx += 1) {
    if (spatialMask && (spatialMask[idx] ?? 0) === 0) {
      skippedPointwisePixels += 1;
      continue;
    }
    for (let oc = 0; oc < outChannels; oc += 1) {
      let sum = pointwiseBias ? (pointwiseBias[oc] ?? 0) : 0;
      const pwBase = oc * inChannels;
      for (let ic = 0; ic < inChannels; ic += 1) sum += (depthwiseOut[ic * outSpatial + idx] ?? 0) * (pointwiseWeights1x1[pwBase + ic] ?? 0);
      output[oc * outSpatial + idx] = applyConvActivation(sum, pwAct);
    }
  }
  return { output, outChannels, outHeight, outWidth, skippedDepthwiseTiles, skippedPointwisePixels };
}
