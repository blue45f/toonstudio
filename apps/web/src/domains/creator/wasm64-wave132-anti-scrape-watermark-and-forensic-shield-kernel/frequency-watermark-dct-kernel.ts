/**
 * Wave 132 — 8×8 DCT-II 중주파 계수 쌍 비가시 워터마크 삽입 및
 * 크롭 위상 자동 정렬 블라인드 검출 커널.
 */

import {
  bitsToUint,
  clampByte,
  computeForensicCrc8,
  deriveForensicKeySchedule,
  encodeForensicPayloadBits,
  extractLumaPlane,
  forwardDct8x8,
  inverseDct8x8,
  toHex4,
  validateTileImage,
  type ForensicKeySchedule,
} from "./dct8x8-transform-and-codec";
import {
  DEFAULT_WATERMARK_STRENGTH,
  FORENSIC_CODEWORD_BIT_LENGTH,
  FORENSIC_PAYLOAD_BIT_LENGTH,
  ForensicWatermarkError,
  MACRO_TILE_BLOCKS,
  MID_BAND_DCT_PAIRS,
  SYNC_PREAMBLE_BITS,
  type BitValue,
  type WatermarkDetectOptions,
  type WatermarkDetectResult,
  type WatermarkEmbedOptions,
  type WatermarkEmbedResult,
  type WatermarkTileImage,
} from "./forensic-watermark-types";

export {
  clampByte,
  computeForensicCrc8,
  encodeForensicPayloadBits,
  extractLumaPlane,
  forwardDct8x8,
  inverseDct8x8,
  matchDetectedPayloadToRecipients,
  validateTileImage,
  verifyDct8x8RoundTrip,
} from "./dct8x8-transform-and-codec";

/**
 * 8×8 DCT-II 중주파 계수 쌍에 비밀 키 시드 기반 반복 부호화 저작자·회차 페이로드를 비가시 삽입한다.
 * 호스트 간섭이 극단적인 선화 경계 쌍은 무리하게 뒤집지 않고 보존하여 PSNR과 선화 선명도를 동시에 지킨다.
 */
export function embedInvisibleDctWatermark(
  sourceTile: WatermarkTileImage,
  options: WatermarkEmbedOptions,
): WatermarkEmbedResult {
  const { blocksX, blocksY } = validateTileImage(sourceTile, 64);
  const strength = options.strength ?? DEFAULT_WATERMARK_STRENGTH;
  if (!Number.isFinite(strength) || strength < 0.35 || strength > 2.0) {
    throw new ForensicWatermarkError(
      "INVALID_STRENGTH",
      `워터마크 강도(strength)는 0.35~2.0 범위여야 합니다 (입력: ${String(strength)}).`,
    );
  }

  const encodedPayload = encodeForensicPayloadBits(options.payload);
  const schedule = deriveForensicKeySchedule(options.secretKey);
  const srcLuma = extractLumaPlane(sourceTile);
  const dstLuma = new Float64Array(srcLuma.length);

  const totalBlocks = blocksX * blocksY;
  const blockBuf = new Float64Array(64);
  const avgEnergy = new Float64Array(64);

  for (let by = 0; by < blocksY; by += 1) {
    const my = by & 3;
    for (let bx = 0; bx < blocksX; bx += 1) {
      const mx = bx & 3;
      const slotBase = (my * 4 + mx) * 4;

      for (let y = 0; y < 8; y += 1) {
        const rowOff = (by * 8 + y) * sourceTile.width + bx * 8;
        for (let x = 0; x < 8; x += 1) blockBuf[y * 8 + x] = srcLuma[rowOff + x];
      }

      const dct = forwardDct8x8(blockBuf);

      for (let p = 0; p < MID_BAND_DCT_PAIRS.length; p += 1) {
        const pair = MID_BAND_DCT_PAIRS[p];
        const slot = slotBase + p;
        const bitIdx = schedule.slotToBitIndex[slot];
        const bitPolarity = encodedPayload.codewordBits[bitIdx] === 1 ? 1 : -1;
        const targetPolarity = schedule.slotPolarity[slot] * bitPolarity;

        const idxA = pair.first.v * 8 + pair.first.u;
        const idxB = pair.second.v * 8 + pair.second.u;
        const c1 = dct[idxA];
        const c2 = dct[idxB];
        const signedDiff = targetPolarity * (c1 - c2);
        const targetMargin = pair.baseMargin * strength;
        const maxDelta = pair.maxPerCoeffDelta * strength;
        const hostileSkipLimit = -(targetMargin * 1.75);

        if (signedDiff < targetMargin && signedDiff >= hostileSkipLimit) {
          const halfShift = Math.min(maxDelta, (targetMargin - signedDiff) * 0.5);
          dct[idxA] = c1 + targetPolarity * halfShift;
          dct[idxB] = c2 - targetPolarity * halfShift;
        }
      }

      for (let i = 0; i < 64; i += 1) avgEnergy[i] += Math.abs(dct[i]);

      const restored = inverseDct8x8(dct);
      for (let y = 0; y < 8; y += 1) {
        const rowOff = (by * 8 + y) * sourceTile.width + bx * 8;
        for (let x = 0; x < 8; x += 1) dstLuma[rowOff + x] = restored[y * 8 + x];
      }
    }
  }

  for (let i = 0; i < 64; i += 1) avgEnergy[i] /= totalBlocks;

  const outData = new Uint8Array(sourceTile.data.length);
  let sumSquaredError = 0;
  let channelComparisons = 0;
  let maxAbsChannelDelta = 0;
  let nonFiniteChannelCount = 0;
  let outOfRangeChannelCount = 0;

  const pixelCount = sourceTile.width * sourceTile.height;
  if (sourceTile.format === "luma-u8") {
    for (let i = 0; i < pixelCount; i += 1) {
      const raw = dstLuma[i];
      if (!Number.isFinite(raw)) nonFiniteChannelCount += 1;
      const quantized = clampByte(raw);
      if (quantized < 0 || quantized > 255) outOfRangeChannelCount += 1;
      outData[i] = quantized;
      const diff = quantized - sourceTile.data[i];
      sumSquaredError += diff * diff;
      const absDiff = Math.abs(diff);
      if (absDiff > maxAbsChannelDelta) maxAbsChannelDelta = absDiff;
      channelComparisons += 1;
    }
  } else {
    for (let i = 0; i < pixelCount; i += 1) {
      const off = i * 4;
      const deltaY = dstLuma[i] - srcLuma[i];
      if (!Number.isFinite(deltaY)) nonFiniteChannelCount += 3;
      for (let c = 0; c < 3; c += 1) {
        const orig = sourceTile.data[off + c];
        const updated = clampByte(orig + deltaY);
        if (updated < 0 || updated > 255) outOfRangeChannelCount += 1;
        outData[off + c] = updated;
        const diff = updated - orig;
        sumSquaredError += diff * diff;
        const absDiff = Math.abs(diff);
        if (absDiff > maxAbsChannelDelta) maxAbsChannelDelta = absDiff;
        channelComparisons += 1;
      }
      outData[off + 3] = sourceTile.data[off + 3];
    }
  }

  const mse = channelComparisons > 0 ? sumSquaredError / channelComparisons : 0;
  const psnrDb = mse <= 1e-12 ? 99.0 : 10 * Math.log10((255 * 255) / mse);

  return {
    watermarkedTile: {
      width: sourceTile.width,
      height: sourceTile.height,
      format: sourceTile.format,
      data: outData,
    },
    encodedPayload,
    secretKeyFingerprintHex: schedule.fingerprintHex,
    strength,
    blocksX,
    blocksY,
    totalBlocks,
    copiesPerBit: (totalBlocks * MID_BAND_DCT_PAIRS.length) / FORENSIC_CODEWORD_BIT_LENGTH,
    psnrDb,
    mse,
    maxAbsChannelDelta,
    nonFiniteChannelCount,
    outOfRangeChannelCount,
    averageDctAbsEnergy: Array.from(avgEnergy),
    pairsUsed: MID_BAND_DCT_PAIRS,
  };
}

interface PhaseCandidate {
  readonly phaseX: number;
  readonly phaseY: number;
  readonly score: number;
  readonly syncMatchedBits: number;
  readonly syncCorrelation: number;
  readonly payloadCoherence: number;
  readonly normalizedCorrelation: number;
  readonly payloadBits: readonly BitValue[];
  readonly payloadCode: number;
  readonly crc8: number;
  readonly crcValid: boolean;
  readonly softCorrectedBitIndex: number | null;
}

function evaluateDetectionPhase(
  blockPairDiffs: Float64Array,
  activeMask: Uint8Array,
  blocksX: number,
  blocksY: number,
  schedule: ForensicKeySchedule,
  phaseX: number,
  phaseY: number,
): PhaseCandidate {
  const voteSums = new Float64Array(FORENSIC_CODEWORD_BIT_LENGTH);
  const voteWeights = new Float64Array(FORENSIC_CODEWORD_BIT_LENGTH);

  for (let by = 0; by < blocksY; by += 1) {
    const my = (by + phaseY) & 3;
    for (let bx = 0; bx < blocksX; bx += 1) {
      const bIdx = by * blocksX + bx;
      if (activeMask[bIdx] === 0) continue;
      const mx = (bx + phaseX) & 3;
      const slotBase = (my * 4 + mx) * 4;
      const diffBase = bIdx * 4;

      for (let p = 0; p < MID_BAND_DCT_PAIRS.length; p += 1) {
        const pair = MID_BAND_DCT_PAIRS[p];
        const slot = slotBase + p;
        const bitIdx = schedule.slotToBitIndex[slot];
        const rawDiff = blockPairDiffs[diffBase + p];
        const signedDiff = schedule.slotPolarity[slot] * rawDiff;
        const softScale = pair.baseMargin * 0.45;
        const normMag = Math.abs(rawDiff) / pair.baseMargin;
        const edgeWeight =
          normMag <= 2.15 ? 1.0 : 1.0 / (1.0 + Math.pow((normMag - 2.15) / 0.75, 3));
        voteSums[bitIdx] += edgeWeight * Math.tanh(signedDiff / softScale);
        voteWeights[bitIdx] += edgeWeight;
      }
    }
  }

  const meanVotes = new Float64Array(FORENSIC_CODEWORD_BIT_LENGTH);
  for (let b = 0; b < FORENSIC_CODEWORD_BIT_LENGTH; b += 1) {
    const denom = voteWeights[b] >= 1.0 ? voteWeights[b] : 1.0;
    meanVotes[b] = voteSums[b] / denom;
  }

  let syncCorrSum = 0;
  let syncMatchedBits = 0;
  for (let b = 0; b < SYNC_PREAMBLE_BITS.length; b += 1) {
    const expectedPolarity = SYNC_PREAMBLE_BITS[b] === 1 ? 1 : -1;
    syncCorrSum += expectedPolarity * meanVotes[b];
    if ((meanVotes[b] >= 0 ? 1 : 0) === SYNC_PREAMBLE_BITS[b]) syncMatchedBits += 1;
  }
  const syncCorrelation = syncCorrSum / SYNC_PREAMBLE_BITS.length;

  const dataBits: BitValue[] = [];
  let dataCoherenceSum = 0;
  for (let b = 8; b < 32; b += 1) {
    dataBits.push(meanVotes[b] >= 0 ? 1 : 0);
    dataCoherenceSum += Math.abs(meanVotes[b]);
  }
  const payloadCoherence = dataCoherenceSum / 24;

  let payloadBits: BitValue[] = dataBits.slice(0, 16);
  let payloadCode = bitsToUint(payloadBits);
  let crc8 = bitsToUint(dataBits.slice(16, 24));
  let crcValid = computeForensicCrc8(payloadCode) === crc8;
  let softCorrectedBitIndex: number | null = null;

  if (!crcValid && syncMatchedBits === 8 && syncCorrelation >= 0.55 && payloadCoherence >= 0.55) {
    let minAbs = Number.POSITIVE_INFINITY;
    let minIdx = -1;
    for (let i = 0; i < 24; i += 1) {
      const mag = Math.abs(meanVotes[8 + i]);
      if (mag < minAbs) {
        minAbs = mag;
        minIdx = i;
      }
    }
    if (minIdx >= 0 && minAbs < 0.4) {
      const candidateData = dataBits.slice();
      candidateData[minIdx] = candidateData[minIdx] === 1 ? 0 : 1;
      const candPayload = candidateData.slice(0, 16);
      const candCode = bitsToUint(candPayload);
      const candCrcVal = bitsToUint(candidateData.slice(16, 24));
      if (computeForensicCrc8(candCode) === candCrcVal) {
        payloadBits = candPayload;
        payloadCode = candCode;
        crc8 = candCrcVal;
        crcValid = true;
        softCorrectedBitIndex = minIdx;
      }
    }
  }

  const normalizedCorrelation =
    syncCorrelation > 0
      ? Math.max(-1, Math.min(1, (syncCorrelation * 8 + dataCoherenceSum) / 32))
      : syncCorrelation;

  return {
    phaseX,
    phaseY,
    score: syncCorrelation + (crcValid ? 0.35 : 0) + payloadCoherence * 0.25,
    syncMatchedBits,
    syncCorrelation,
    payloadCoherence,
    normalizedCorrelation,
    payloadBits,
    payloadCode,
    crc8,
    crcValid,
    softCorrectedBitIndex,
  };
}

/**
 * 원본 이미지 없이 워터마크 타일과 비밀 키만으로 중주파 계수 쌍 차분 다수결·연판정 상관 투표를
 * 수행하여 페이로드 비트열, 신뢰도(normalizedCorrelation), 비트 오류율을 블라인드 복원한다.
 */
export function detectInvisibleDctWatermark(
  suspectTile: WatermarkTileImage,
  options: WatermarkDetectOptions,
): WatermarkDetectResult {
  const { blocksX, blocksY } = validateTileImage(suspectTile, 32);
  const schedule = deriveForensicKeySchedule(options.secretKey);
  const minCorr = options.minNormalizedCorrelation ?? 0.55;
  if (!Number.isFinite(minCorr) || minCorr <= 0 || minCorr > 1) {
    throw new ForensicWatermarkError("NON_FINITE_PARAMETER", "minNormalizedCorrelation은 (0, 1] 범위여야 합니다.");
  }
  if (
    options.expectedPayloadBits !== undefined &&
    options.expectedPayloadBits.length !== FORENSIC_PAYLOAD_BIT_LENGTH
  ) {
    throw new ForensicWatermarkError(
      "INVALID_PAYLOAD",
      `expectedPayloadBits는 ${FORENSIC_PAYLOAD_BIT_LENGTH}비트여야 합니다.`,
    );
  }

  const luma = extractLumaPlane(suspectTile);
  const totalBlockCount = blocksX * blocksY;
  const blockPairDiffs = new Float64Array(totalBlockCount * 4);
  const activeMask = new Uint8Array(totalBlockCount);
  const blockBuf = new Float64Array(64);
  let activeBlockCount = 0;

  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const bIdx = by * blocksX + bx;
      let nonZeroFound = false;
      for (let y = 0; y < 8; y += 1) {
        const rowOff = (by * 8 + y) * suspectTile.width + bx * 8;
        for (let x = 0; x < 8; x += 1) {
          const val = luma[rowOff + x];
          blockBuf[y * 8 + x] = val;
          if (val > 0) nonZeroFound = true;
        }
      }
      if (!nonZeroFound) continue;
      activeMask[bIdx] = 1;
      activeBlockCount += 1;

      const dct = forwardDct8x8(blockBuf);
      const diffBase = bIdx * 4;
      for (let p = 0; p < MID_BAND_DCT_PAIRS.length; p += 1) {
        const pair = MID_BAND_DCT_PAIRS[p];
        blockPairDiffs[diffBase + p] =
          dct[pair.first.v * 8 + pair.first.u] - dct[pair.second.v * 8 + pair.second.u];
      }
    }
  }

  if (activeBlockCount < 16) {
    return {
      detected: false,
      recoveredPayloadBits: new Array<BitValue>(FORENSIC_PAYLOAD_BIT_LENGTH).fill(0),
      recoveredPayloadCode: 0,
      recoveredPayloadHex: "0000",
      recoveredCrc8: 0,
      crcValid: false,
      softCorrectedBitIndex: null,
      syncMatchedBits: 0,
      syncTotalBits: SYNC_PREAMBLE_BITS.length,
      syncCorrelation: 0,
      payloadCoherence: 0,
      normalizedCorrelation: 0,
      bitErrorRate: options.expectedPayloadBits ? 1 : null,
      phaseShiftX: 0,
      phaseShiftY: 0,
      activeBlockCount,
      totalBlockCount,
      rejectionReason: "유효한 8×8 블록 수가 최소 기준(16블록) 미만입니다.",
    };
  }

  const maxPhase = (options.searchCropPhase ?? true) ? MACRO_TILE_BLOCKS : 1;
  let best: PhaseCandidate | null = null;
  for (let py = 0; py < maxPhase; py += 1) {
    for (let px = 0; px < maxPhase; px += 1) {
      const candidate = evaluateDetectionPhase(
        blockPairDiffs,
        activeMask,
        blocksX,
        blocksY,
        schedule,
        px,
        py,
      );
      if (best === null || candidate.score > best.score) best = candidate;
    }
  }

  const winner = best as PhaseCandidate;
  let rejectionReason: string | null = null;
  if (winner.syncMatchedBits < 7) {
    rejectionReason = `동기 프리앰블 일치 비트 부족 (${winner.syncMatchedBits}/8).`;
  } else if (winner.syncCorrelation < 0.45) {
    rejectionReason = `동기 상관도 기준 미달 (${winner.syncCorrelation.toFixed(3)} < 0.450).`;
  } else if (!winner.crcValid) {
    rejectionReason = "페이로드 CRC-8 무결성 검증 불일치.";
  } else if (winner.normalizedCorrelation < minCorr) {
    rejectionReason = `정규화 상관도 임계값 미달 (${winner.normalizedCorrelation.toFixed(3)} < ${minCorr.toFixed(3)}).`;
  }

  let bitErrorRate: number | null = null;
  if (options.expectedPayloadBits) {
    let errors = 0;
    for (let i = 0; i < FORENSIC_PAYLOAD_BIT_LENGTH; i += 1) {
      if (winner.payloadBits[i] !== options.expectedPayloadBits[i]) errors += 1;
    }
    bitErrorRate = errors / FORENSIC_PAYLOAD_BIT_LENGTH;
  }

  return {
    detected: rejectionReason === null,
    recoveredPayloadBits: winner.payloadBits,
    recoveredPayloadCode: winner.payloadCode,
    recoveredPayloadHex: toHex4(winner.payloadCode),
    recoveredCrc8: winner.crc8,
    crcValid: winner.crcValid,
    softCorrectedBitIndex: winner.softCorrectedBitIndex,
    syncMatchedBits: winner.syncMatchedBits,
    syncTotalBits: SYNC_PREAMBLE_BITS.length,
    syncCorrelation: winner.syncCorrelation,
    payloadCoherence: winner.payloadCoherence,
    normalizedCorrelation: winner.normalizedCorrelation,
    bitErrorRate,
    phaseShiftX: winner.phaseX,
    phaseShiftY: winner.phaseY,
    activeBlockCount,
    totalBlockCount,
    rejectionReason,
  };
}
