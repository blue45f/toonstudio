/**
 * Wasm64 Wave 11 Apex — ITU-R BS.1770-4 통합 음량(LUFS)·4x 트루피크(dBTP) 오디오툰 마스터링 엔진
 * 및 10년+ 장기 보존용 자가 검증 아카이브 카트리지(`.tsarc`) 패키저·검증기.
 *
 * - 외부 서버 의존 0건(₩0), 브라우저 키-값 저장소 직접 접근 0건, 오프라인 단독 검증을 보장한다.
 * - K-가중 2단 바이쿼드 필터(고역 셸프 + RLB 고역 통과), 400ms 게이팅 블록(-70 LUFS 절대 / -10 LU 상대),
 *   4배 오버샘플링 48탭 폴리페이즈 트루피크 검출기, 룩어헤드 소프트니 리미터로 -14.0 LUFS / -1.0 dBTP 정규화한다.
 * - 결정론적 바이너리 헤더(`TSARC` + `00 01 00`), 레이어 페이로드, 서브셋 폰트 테이블,
 *   ICC/OKLCH 색공간 기술자, SHA-256 머클 루트 TOC를 단일 `.tsarc` 파일에 봉인하고 비트 부패를 검출한다.
 */

export const DEFAULT_TARGET_INTEGRATED_LUFS = -14.0;
export const DEFAULT_TARGET_TRUE_PEAK_DBTP = -1.0;
export const BS1770_ABSOLUTE_GATE_LUFS = -70.0;
export const BS1770_RELATIVE_GATE_OFFSET_LU = -10.0;

/** `.tsarc` 8바이트 매직 시그니처 (`"TSARC"` + `0x00 0x01 0x00`). */
export const TSARC_MAGIC_BYTES = new Uint8Array([0x54, 0x53, 0x41, 0x52, 0x43, 0x00, 0x01, 0x00]);
export const TSARC_MAGIC_SIGNATURE = String.fromCharCode(0x54, 0x53, 0x41, 0x52, 0x43, 0x00, 0x01, 0x00);
export const TSARC_HEADER_SIZE_BYTES = 96;

export interface BiquadCoefficients {
  readonly b0: number; readonly b1: number; readonly b2: number; readonly a1: number; readonly a2: number;
}

export interface Bs1770LoudnessMetrics {
  readonly integratedLufs: number; readonly ungatedLufs: number; readonly shortTermMaxLufs: number;
  readonly samplePeakDbfs: number; readonly truePeakDbtp: number;
  readonly totalBlockCount: number; readonly gatedBlockCount: number; readonly relativeGateThresholdLufs: number;
}

export interface AudioToonMasteringOptions {
  readonly sampleRateHz: number;
  readonly targetIntegratedLufs?: number; readonly targetTruePeakDbtp?: number;
  readonly lookaheadMs?: number; readonly softKneeWidthDb?: number;
  readonly releaseMs?: number; readonly maxMakeupGainDb?: number;
}

export interface AudioToonMasteringResult {
  readonly channels: readonly Float32Array[]; readonly sampleRateHz: number;
  readonly inputMetrics: Bs1770LoudnessMetrics; readonly outputMetrics: Bs1770LoudnessMetrics;
  readonly appliedMakeupGainDb: number; readonly maxGainReductionDb: number; readonly serverCostKrw: 0;
}

export type TsarcColorSpaceKind = "oklch-d65" | "display-p3" | "srgb-iec61966";
export type TsarcLayerEncoding = "raw-rgba8" | "png" | "webp" | "vector-json";
export type TsarcEntryKind = "color-profile" | "font-subset" | "layer-payload" | "episode-manifest";

export interface TsarcColorProfileDescriptor {
  readonly colorSpace: TsarcColorSpaceKind;
  readonly whitePointChromaticity: readonly [number, number];
  readonly transferCharacteristic: "linear" | "srgb" | "perceptual-oklch";
  readonly renderingIntent: "perceptual" | "relative-colorimetric";
  readonly iccProfileBytes?: Uint8Array;
}

export interface TsarcFontSubsetEntry {
  readonly fontId: string; readonly fontFamily: string; readonly fontWeight: number;
  readonly subsetTag: string; readonly unicodeRanges: readonly string[];
  readonly glyphCount: number; readonly licenseSpdx: string; readonly subsetBytes: Uint8Array;
}

export interface TsarcLayerPayloadEntry {
  readonly layerId: string; readonly name: string; readonly zIndex: number;
  readonly widthPx: number; readonly heightPx: number;
  readonly blendMode: "normal" | "multiply" | "screen" | "overlay";
  readonly opacityMilli: number; readonly encoding: TsarcLayerEncoding; readonly payloadBytes: Uint8Array;
}

export interface TsarcPackInput {
  readonly documentId: string; readonly episodeTitle: string; readonly createdUnixEpochSec?: number;
  readonly colorProfile: TsarcColorProfileDescriptor;
  readonly fontSubsets: readonly TsarcFontSubsetEntry[];
  readonly layers: readonly TsarcLayerPayloadEntry[];
}

export interface TsarcTocRecordSummary {
  readonly entryIndex: number; readonly kind: TsarcEntryKind; readonly entryId: string;
  readonly payloadOffset: number; readonly payloadByteLength: number; readonly leafHashHex: string;
}

export interface TsarcPackResult {
  readonly cartridgeBytes: Uint8Array; readonly merkleRootHex: string;
  readonly tocEntries: readonly TsarcTocRecordSummary[];
  readonly totalByteLength: number; readonly serverCostKrw: 0;
}

export type TsarcIntegrityIssueCode =
  | "truncated-container"
  | "invalid-magic"
  | "unsupported-version"
  | "header-checksum-mismatch"
  | "toc-bounds-corrupted"
  | "entry-payload-corrupted"
  | "merkle-root-mismatch";

export interface TsarcIntegrityIssue {
  readonly code: TsarcIntegrityIssueCode; readonly entryId?: string; readonly messageKo: string;
}

export interface TsarcVerifyResult {
  readonly valid: boolean; readonly issues: readonly TsarcIntegrityIssue[];
  readonly merkleRootHex: string; readonly computedMerkleRootHex: string;
  readonly createdUnixEpochSec: number; readonly documentId: string; readonly episodeTitle: string;
  readonly colorProfile: TsarcColorProfileDescriptor | null;
  readonly fontSubsets: readonly TsarcFontSubsetEntry[];
  readonly layers: readonly TsarcLayerPayloadEntry[];
  readonly tocEntries: readonly TsarcTocRecordSummary[];
  readonly serverCostKrw: 0;
}

export interface TsarcMerkleInclusionProof {
  readonly entryIndex: number; readonly leafHashHex: string;
  readonly siblings: ReadonlyArray<{ readonly hashHex: string; readonly position: "left" | "right" }>;
  readonly merkleRootHex: string;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

// ============================================================================
// 1. ITU-R BS.1770-4 Loudness, 4x True-Peak & Lookahead Soft-Knee Limiter
// ============================================================================

/** 임의 샘플레이트에 대한 ITU-R BS.1770-4 K-가중 2단 바이쿼드 계수를 산출한다. */
export function computeBs1770KWeightingFilters(sampleRateHz: number): {
  readonly highShelf: BiquadCoefficients; readonly rlbHighPass: BiquadCoefficients;
} {
  if (Math.abs(sampleRateHz - 48000) < 1e-3) {
    return {
      highShelf: { b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285, a1: -1.69065929318241, a2: 0.73248077421585 },
      rlbHighPass: { b0: 1.0, b1: -2.0, b2: 1.0, a1: -1.99004745483398, a2: 0.99007225036621 },
    };
  }
  const fs = Math.max(8000, sampleRateHz);
  const kShelf = Math.tan((Math.PI * 1681.974450955533) / fs);
  const vh = Math.pow(10, 3.999843853973347 / 20); const vb = Math.pow(vh, 0.4996667741545416);
  const qShelf = 0.7071752369554196; const a0Shelf = 1 + kShelf / qShelf + kShelf * kShelf;
  const kHp = Math.tan((Math.PI * 38.13547087602444) / fs);
  const qHp = 0.5003270373238773; const a0Hp = 1 + kHp / qHp + kHp * kHp;
  return {
    highShelf: { b0: (vh + (vb * kShelf) / qShelf + kShelf * kShelf) / a0Shelf, b1: (2 * (kShelf * kShelf - vh)) / a0Shelf, b2: (vh - (vb * kShelf) / qShelf + kShelf * kShelf) / a0Shelf, a1: (2 * (kShelf * kShelf - 1)) / a0Shelf, a2: (1 - kShelf / qShelf + kShelf * kShelf) / a0Shelf },
    rlbHighPass: { b0: 1 / a0Hp, b1: -2 / a0Hp, b2: 1 / a0Hp, a1: (2 * (kHp * kHp - 1)) / a0Hp, a2: (1 - kHp / qHp + kHp * kHp) / a0Hp },
  };
}

function applyBiquadFilter(input: Float32Array | Float64Array, coeff: BiquadCoefficients): Float64Array {
  const out = new Float64Array(input.length);
  let z1 = 0; let z2 = 0; const { b0, b1, b2, a1, a2 } = coeff;
  for (let i = 0; i < input.length; i += 1) {
    const x = input[i]!; const y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; out[i] = y;
  }
  return out;
}

const TRUE_PEAK_TAPS_PER_PHASE = 12;
const TRUE_PEAK_CENTER_INDEX = 5;
const TRUE_PEAK_POLYPHASE_FIR: ReadonlyArray<Float64Array> = (() => {
  const phases: Float64Array[] = [];
  for (let p = 0; p < 4; p += 1) {
    const frac = p * 0.25; const taps = new Float64Array(TRUE_PEAK_TAPS_PER_PHASE); let sum = 0;
    for (let m = 0; m < TRUE_PEAK_TAPS_PER_PHASE; m += 1) {
      const t = m - TRUE_PEAK_CENTER_INDEX - frac;
      const sincVal = Math.abs(t) < 1e-12 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const u = clamp(t / 6.25, -1, 1);
      taps[m] = sincVal * (0.42 + 0.5 * Math.cos(Math.PI * u) + 0.08 * Math.cos(2 * Math.PI * u));
      sum += taps[m]!;
    }
    for (let m = 0; m < TRUE_PEAK_TAPS_PER_PHASE; m += 1) taps[m] = taps[m]! / sum;
    phases.push(taps);
  }
  return phases;
})();

/** 4배 오버샘플링 폴리페이즈 FIR 필터로 프레임별 연속 파형 트루피크 엔벨로프를 산출한다. */
export function computeTruePeakEnvelope4x(channels: readonly Float32Array[]): {
  readonly perFrameTruePeak: Float64Array; readonly maxSamplePeakLinear: number; readonly maxTruePeakLinear: number;
} {
  const frameCount = channels[0]?.length ?? 0; const perFrameTruePeak = new Float64Array(frameCount);
  let maxSamplePeakLinear = 0; let maxTruePeakLinear = 0;
  const [p0, p1, p2, p3] = TRUE_PEAK_POLYPHASE_FIR as [Float64Array, Float64Array, Float64Array, Float64Array];
  for (const ch of channels) {
    const len = ch.length;
    for (let n = 0; n < len; n += 1) {
      const rawAbs = Math.abs(ch[n]!); if (rawAbs > maxSamplePeakLinear) maxSamplePeakLinear = rawAbs;
      let acc0 = 0; let acc1 = 0; let acc2 = 0; let acc3 = 0;
      for (let m = 0; m < TRUE_PEAK_TAPS_PER_PHASE; m += 1) {
        const idx = n + (m - TRUE_PEAK_CENTER_INDEX); const s = idx >= 0 && idx < len ? ch[idx]! : 0;
        acc0 += s * p0[m]!; acc1 += s * p1[m]!; acc2 += s * p2[m]!; acc3 += s * p3[m]!;
      }
      const localPeak = Math.max(rawAbs, Math.abs(acc0), Math.abs(acc1), Math.abs(acc2), Math.abs(acc3));
      if (localPeak > perFrameTruePeak[n]!) perFrameTruePeak[n] = localPeak;
      if (localPeak > maxTruePeakLinear) maxTruePeakLinear = localPeak;
    }
  }
  return { perFrameTruePeak, maxSamplePeakLinear, maxTruePeakLinear };
}

function channelWeightBs1770(channelIndex: number, channelCount: number): number {
  return channelCount >= 6 ? (channelIndex === 3 ? 0 : channelIndex === 4 || channelIndex === 5 ? 1.41 : 1.0) : 1.0;
}
const energyToLufs = (wms: number): number => (wms <= 1e-18 ? Number.NEGATIVE_INFINITY : -0.691 + 10 * Math.log10(wms));
const linearToDb = (lin: number): number => (lin <= 1e-12 ? -240 : 20 * Math.log10(lin));
const dbToLinear = (db: number): number => Math.pow(10, db / 20);

/** ITU-R BS.1770-4 규격에 따라 통합 음량(Integrated LUFS), 단기 음량, 샘플 피크 및 4x 트루피크를 측정한다. */
export function measureBs1770Loudness(channels: readonly Float32Array[], sampleRateHz: number): Bs1770LoudnessMetrics {
  if (channels.length === 0 || (channels[0]?.length ?? 0) === 0) {
    return {
      integratedLufs: Number.NEGATIVE_INFINITY, ungatedLufs: Number.NEGATIVE_INFINITY,
      shortTermMaxLufs: Number.NEGATIVE_INFINITY, samplePeakDbfs: Number.NEGATIVE_INFINITY,
      truePeakDbtp: Number.NEGATIVE_INFINITY, totalBlockCount: 0, gatedBlockCount: 0,
      relativeGateThresholdLufs: Number.NEGATIVE_INFINITY,
    };
  }
  const frameCount = channels[0]!.length;
  const { highShelf, rlbHighPass } = computeBs1770KWeightingFilters(sampleRateHz);
  const prefixSqSums = channels.map((ch) => {
    const wCh = applyBiquadFilter(applyBiquadFilter(ch, highShelf), rlbHighPass);
    const prefix = new Float64Array(wCh.length + 1);
    let running = 0;
    for (let i = 0; i < wCh.length; i += 1) { running += wCh[i]! * wCh[i]!; prefix[i + 1] = running; }
    return prefix;
  });

  const blockFrames = Math.min(frameCount, Math.max(1, Math.round(0.4 * sampleRateHz)));
  const hopFrames = Math.max(1, Math.round(0.1 * sampleRateHz));
  const blockEnergies: number[] = [];

  for (let start = 0; start + blockFrames <= frameCount; start += hopFrames) {
    const end = start + blockFrames;
    let weightedSum = 0;
    for (let c = 0; c < prefixSqSums.length; c += 1) {
      const w = channelWeightBs1770(c, prefixSqSums.length);
      if (w > 0) weightedSum += w * ((prefixSqSums[c]![end]! - prefixSqSums[c]![start]!) / blockFrames);
    }
    blockEnergies.push(weightedSum);
  }

  let ungatedSum = 0;
  for (const e of blockEnergies) ungatedSum += e;
  const ungatedLufs = blockEnergies.length > 0 ? energyToLufs(ungatedSum / blockEnergies.length) : Number.NEGATIVE_INFINITY;
  const absGatePassed = blockEnergies.filter((e) => energyToLufs(e) > BS1770_ABSOLUTE_GATE_LUFS);
  let integratedLufs = Number.NEGATIVE_INFINITY;
  let relativeGateThresholdLufs = Number.NEGATIVE_INFINITY;
  let gatedBlockCount = 0;

  if (absGatePassed.length > 0) {
    let absSum = 0;
    for (const e of absGatePassed) absSum += e;
    relativeGateThresholdLufs = energyToLufs(absSum / absGatePassed.length) + BS1770_RELATIVE_GATE_OFFSET_LU;
    let relSum = 0;
    for (const e of absGatePassed) {
      if (energyToLufs(e) > relativeGateThresholdLufs) { relSum += e; gatedBlockCount += 1; }
    }
    if (gatedBlockCount > 0) integratedLufs = energyToLufs(relSum / gatedBlockCount);
  }

  const shortTermFrames = Math.min(frameCount, Math.max(1, Math.round(3.0 * sampleRateHz)));
  let shortTermMaxLufs = Number.NEGATIVE_INFINITY;
  for (let start = 0; start + shortTermFrames <= frameCount; start += hopFrames) {
    const end = start + shortTermFrames;
    let weightedSum = 0;
    for (let c = 0; c < prefixSqSums.length; c += 1) {
      const w = channelWeightBs1770(c, prefixSqSums.length);
      if (w > 0) weightedSum += w * ((prefixSqSums[c]![end]! - prefixSqSums[c]![start]!) / shortTermFrames);
    }
    shortTermMaxLufs = Math.max(shortTermMaxLufs, energyToLufs(weightedSum));
  }

  const { maxSamplePeakLinear, maxTruePeakLinear } = computeTruePeakEnvelope4x(channels);
  return {
    integratedLufs, ungatedLufs, shortTermMaxLufs,
    samplePeakDbfs: linearToDb(maxSamplePeakLinear), truePeakDbtp: linearToDb(maxTruePeakLinear),
    totalBlockCount: blockEnergies.length, gatedBlockCount, relativeGateThresholdLufs,
  };
}

function softKneeLimiterGainDb(levelDb: number, ceilingDb: number, kneeWidthDb: number): number {
  const w = Math.max(0.1, kneeWidthDb);
  const kneeStart = ceilingDb - w;
  if (levelDb <= kneeStart) return 0;
  if (levelDb >= ceilingDb + w) return ceilingDb - levelDb;
  const delta = levelDb - kneeStart;
  return Math.min(ceilingDb, levelDb - (delta * delta) / (4 * w)) - levelDb;
}

function runLookaheadTruePeakLimiterPass(
  sourceChannels: readonly Float32Array[], makeupLinear: number, ceilingDbtp: number,
  lookaheadFrames: number, kneeWidthDb: number, releaseCoeff: number,
): { readonly output: Float32Array[]; readonly maxReductionDb: number } {
  const scaled = sourceChannels.map((ch) => {
    const buf = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i += 1) buf[i] = ch[i]! * makeupLinear;
    return buf;
  });
  const frameCount = scaled[0]?.length ?? 0;
  const { perFrameTruePeak } = computeTruePeakEnvelope4x(scaled);
  const internalCeilingDb = ceilingDbtp - 0.05;
  const targetGain = new Float64Array(frameCount);
  for (let i = 0; i < frameCount; i += 1) {
    targetGain[i] = dbToLinear(softKneeLimiterGainDb(linearToDb(perFrameTruePeak[i]!), internalCeilingDb, kneeWidthDb));
  }

  const minWindowGain = new Float64Array(frameCount);
  const dequeIdx = new Int32Array(frameCount);
  let head = 0; let tail = 0; let cursor = 0;
  for (let i = 0; i < frameCount; i += 1) {
    const windowEnd = Math.min(frameCount - 1, i + lookaheadFrames);
    while (cursor <= windowEnd) {
      const val = targetGain[cursor]!;
      while (tail > head && targetGain[dequeIdx[tail - 1]!]! >= val) tail -= 1;
      dequeIdx[tail] = cursor; tail += 1; cursor += 1;
    }
    while (head < tail && dequeIdx[head]! < i) head += 1;
    minWindowGain[i] = targetGain[dequeIdx[head]!]!;
  }

  const smoothGain = new Float64Array(frameCount);
  const attackCoeff = lookaheadFrames > 1 ? Math.exp(-2.2 / lookaheadFrames) : 0;
  let env = 1.0; let maxReductionDb = 0;
  for (let i = 0; i < frameCount; i += 1) {
    const desired = minWindowGain[i]!;
    env = desired < env ? attackCoeff * env + (1 - attackCoeff) * desired : releaseCoeff * env + (1 - releaseCoeff) * desired;
    const boundedGain = Math.min(env, targetGain[i]!);
    smoothGain[i] = boundedGain;
    maxReductionDb = Math.max(maxReductionDb, Math.max(0, -linearToDb(boundedGain)));
  }

  for (const ch of scaled) for (let i = 0; i < frameCount; i += 1) ch[i] = ch[i]! * smoothGain[i]!;
  const postTp = computeTruePeakEnvelope4x(scaled);
  const hardCeilingLinear = dbToLinear(ceilingDbtp);
  if (postTp.maxTruePeakLinear > hardCeilingLinear) {
    const trim = hardCeilingLinear / postTp.maxTruePeakLinear;
    for (const ch of scaled) for (let i = 0; i < frameCount; i += 1) ch[i] = ch[i]! * trim;
    maxReductionDb += Math.max(0, -linearToDb(trim));
  }
  return { output: scaled, maxReductionDb };
}

/** 에피소드 오디오를 `-14.0 LUFS` 통합 음량과 `-1.0 dBTP` 트루피크 상한에 맞춰 마스터링한다. */
export function masterAudioToonEpisode(
  inputChannels: readonly Float32Array[],
  options: AudioToonMasteringOptions,
): AudioToonMasteringResult {
  const sampleRateHz = Math.max(8000, options.sampleRateHz);
  const targetLufs = options.targetIntegratedLufs ?? DEFAULT_TARGET_INTEGRATED_LUFS;
  const targetTruePeakDbtp = options.targetTruePeakDbtp ?? DEFAULT_TARGET_TRUE_PEAK_DBTP;
  const lookaheadFrames = Math.max(4, Math.round(((options.lookaheadMs ?? 5.0) / 1000) * sampleRateHz));
  const kneeWidthDb = options.softKneeWidthDb ?? 3.0;
  const releaseCoeff = Math.exp(-1 / Math.max(16, Math.round(((options.releaseMs ?? 80) / 1000) * sampleRateHz)));
  const maxMakeupGainDb = options.maxMakeupGainDb ?? 24.0;

  const inputMetrics = measureBs1770Loudness(inputChannels, sampleRateHz);
  if (!Number.isFinite(inputMetrics.integratedLufs)) {
    return {
      channels: inputChannels.map((c) => new Float32Array(c)),
      sampleRateHz, inputMetrics, outputMetrics: inputMetrics,
      appliedMakeupGainDb: 0, maxGainReductionDb: 0, serverCostKrw: 0,
    };
  }

  let makeupGainDb = clamp(targetLufs - inputMetrics.integratedLufs, -36, maxMakeupGainDb);
  let pass = runLookaheadTruePeakLimiterPass(
    inputChannels, dbToLinear(makeupGainDb), targetTruePeakDbtp, lookaheadFrames, kneeWidthDb, releaseCoeff,
  );
  let outputMetrics = measureBs1770Loudness(pass.output, sampleRateHz);

  if (Number.isFinite(outputMetrics.integratedLufs) && Math.abs(targetLufs - outputMetrics.integratedLufs) > 0.08) {
    makeupGainDb = clamp(makeupGainDb + clamp(targetLufs - outputMetrics.integratedLufs, -6, 6), -36, maxMakeupGainDb);
    pass = runLookaheadTruePeakLimiterPass(
      inputChannels, dbToLinear(makeupGainDb), targetTruePeakDbtp, lookaheadFrames, kneeWidthDb, releaseCoeff,
    );
    outputMetrics = measureBs1770Loudness(pass.output, sampleRateHz);
  }
  return {
    channels: pass.output, sampleRateHz, inputMetrics, outputMetrics,
    appliedMakeupGainDb: Math.round(makeupGainDb * 1000) / 1000,
    maxGainReductionDb: Math.round(pass.maxReductionDb * 1000) / 1000,
    serverCostKrw: 0,
  };
}

// ============================================================================
// 2. Self-Verifying Archival Cartridge (.tsarc) Packager & Merkle Verifier
// ============================================================================

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** 외부 런타임 의존 없이 모든 환경에서 동일하게 동작하는 순수 FIPS 180-4 SHA-256 해시 함수. */
export function sha256Bytes(data: Uint8Array): Uint8Array {
  const bitLenHi = Math.floor(data.length / 0x20000000) >>> 0;
  const bitLenLo = (data.length * 8) >>> 0;
  const paddedLen = (((data.length + 9 + 63) >>> 6) << 6) >>> 0;
  const padded = new Uint8Array(paddedLen);
  padded.set(data, 0);
  padded[data.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 8, bitLenHi, false);
  dv.setUint32(paddedLen - 4, bitLenLo, false);

  let h0 = 0x6a09e667; let h1 = 0xbb67ae85; let h2 = 0x3c6ef372; let h3 = 0xa54ff53a;
  let h4 = 0x510e527f; let h5 = 0x9b05688c; let h6 = 0x1f83d9ab; let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = dv.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15]!; const w2 = w[i - 2]!;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outDv = new DataView(out.buffer);
  outDv.setUint32(0, h0, false); outDv.setUint32(4, h1, false); outDv.setUint32(8, h2, false); outDv.setUint32(12, h3, false);
  outDv.setUint32(16, h4, false); outDv.setUint32(20, h5, false); outDv.setUint32(24, h6, false); outDv.setUint32(28, h7, false);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  const hexChars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i]!;
    out += hexChars[b >>> 4]! + hexChars[b & 0x0f]!;
  }
  return out;
}

export function sha256Hex(data: Uint8Array): string {
  return bytesToHex(sha256Bytes(data));
}

function hashMerkleLeaf(kindCode: number, idBytes: Uint8Array, metaBytes: Uint8Array, payloadBytes: Uint8Array): Uint8Array {
  const payloadDigest = sha256Bytes(payloadBytes);
  const preimage = new Uint8Array(2 + 4 + idBytes.length + 4 + metaBytes.length + 32);
  preimage[0] = 0x00; preimage[1] = kindCode & 0xff;
  const dv = new DataView(preimage.buffer);
  dv.setUint32(2, idBytes.length, true); preimage.set(idBytes, 6);
  const metaPos = 6 + idBytes.length;
  dv.setUint32(metaPos, metaBytes.length, true); preimage.set(metaBytes, metaPos + 4);
  preimage.set(payloadDigest, metaPos + 4 + metaBytes.length);
  return sha256Bytes(preimage);
}

function hashMerkleBranch(left32: Uint8Array, right32: Uint8Array): Uint8Array {
  const buf = new Uint8Array(65);
  buf[0] = 0x01; buf.set(left32, 1); buf.set(right32, 33);
  return sha256Bytes(buf);
}

function computeMerkleTreeLevels(leafHashes: readonly Uint8Array[]): readonly (readonly Uint8Array[])[] {
  if (leafHashes.length === 0) return [[sha256Bytes(new Uint8Array([0x00]))]];
  const levels: Array<readonly Uint8Array[]> = [leafHashes];
  let current = leafHashes;
  while (current.length > 1) {
    const nextLevel: Uint8Array[] = [];
    for (let i = 0; i < current.length; i += 2) {
      nextLevel.push(i + 1 < current.length ? hashMerkleBranch(current[i]!, current[i + 1]!) : current[i]!);
    }
    levels.push(nextLevel); current = nextLevel;
  }
  return levels;
}

const ENTRY_KIND_TO_CODE: Readonly<Record<TsarcEntryKind, number>> = { "episode-manifest": 1, "color-profile": 2, "font-subset": 3, "layer-payload": 4 };
const CODE_TO_ENTRY_KIND: Readonly<Record<number, TsarcEntryKind>> = { 1: "episode-manifest", 2: "color-profile", 3: "font-subset", 4: "layer-payload" };
const alignUp4 = (value: number): number => (value + 3) & ~3;
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
function hexTo32Bytes(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** 에피소드 레이어·서브셋 폰트·ICC/OKLCH 색공간을 SHA-256 머클 루트 기반 `.tsarc` 카트리지로 패키징한다. */
export function packTsarcCartridge(input: TsarcPackInput): TsarcPackResult {
  const encoder = new TextEncoder();
  const createdEpoch = Math.max(0, Math.floor(input.createdUnixEpochSec ?? 0));
  const sortedFonts = [...input.fontSubsets].sort((a, b) => `${a.fontId}:${a.subsetTag}`.localeCompare(`${b.fontId}:${b.subsetTag}`));
  const sortedLayers = [...input.layers].sort((a, b) => (a.zIndex !== b.zIndex ? a.zIndex - b.zIndex : a.layerId.localeCompare(b.layerId)));

  const sections: Array<{ readonly kind: TsarcEntryKind; readonly entryId: string; readonly metaJson: string; readonly payloadBytes: Uint8Array }> = [
    {
      kind: "episode-manifest", entryId: `manifest:${input.documentId}`,
      metaJson: JSON.stringify({ documentId: input.documentId, episodeTitle: input.episodeTitle }),
      payloadBytes: encoder.encode(JSON.stringify({ schemaVersion: 1, documentId: input.documentId, episodeTitle: input.episodeTitle, layerCount: sortedLayers.length, fontSubsetCount: sortedFonts.length })),
    },
    {
      kind: "color-profile", entryId: `color:${input.colorProfile.colorSpace}`,
      metaJson: JSON.stringify({ colorSpace: input.colorProfile.colorSpace, whitePointChromaticity: input.colorProfile.whitePointChromaticity, transferCharacteristic: input.colorProfile.transferCharacteristic, renderingIntent: input.colorProfile.renderingIntent, hasEmbeddedIcc: Boolean(input.colorProfile.iccProfileBytes && input.colorProfile.iccProfileBytes.length > 0) }),
      payloadBytes: input.colorProfile.iccProfileBytes ?? new Uint8Array(0),
    },
  ];
  for (const font of sortedFonts) {
    sections.push({
      kind: "font-subset", entryId: `font:${font.fontId}:${font.subsetTag}`,
      metaJson: JSON.stringify({ fontId: font.fontId, fontFamily: font.fontFamily, fontWeight: font.fontWeight, subsetTag: font.subsetTag, unicodeRanges: font.unicodeRanges, glyphCount: font.glyphCount, licenseSpdx: font.licenseSpdx }),
      payloadBytes: font.subsetBytes,
    });
  }
  for (const layer of sortedLayers) {
    sections.push({
      kind: "layer-payload", entryId: `layer:${layer.layerId}`,
      metaJson: JSON.stringify({ layerId: layer.layerId, name: layer.name, zIndex: layer.zIndex, widthPx: layer.widthPx, heightPx: layer.heightPx, blendMode: layer.blendMode, opacityMilli: layer.opacityMilli, encoding: layer.encoding }),
      payloadBytes: layer.payloadBytes,
    });
  }

  const encodedTocItems = sections.map((sec, idx) => {
    const kindCode = ENTRY_KIND_TO_CODE[sec.kind];
    const idBytes = encoder.encode(sec.entryId); const metaBytes = encoder.encode(sec.metaJson);
    const leafHash = hashMerkleLeaf(kindCode, idBytes, metaBytes, sec.payloadBytes);
    return { entryIndex: idx, kind: sec.kind, kindCode, entryId: sec.entryId, idBytes, metaBytes, leafHash, payloadBytes: sec.payloadBytes, alignedRecLen: alignUp4(52 + idBytes.length + metaBytes.length) };
  });

  const tocOffsetBytes = TSARC_HEADER_SIZE_BYTES;
  let tocByteLength = 0;
  for (const item of encodedTocItems) tocByteLength += item.alignedRecLen;
  const payloadRegionOffsetBytes = alignUp4(tocOffsetBytes + tocByteLength);
  let runningPayloadOffset = payloadRegionOffsetBytes;
  const payloadOffsets: number[] = [];
  for (const item of encodedTocItems) { payloadOffsets.push(runningPayloadOffset); runningPayloadOffset = alignUp4(runningPayloadOffset + item.payloadBytes.length); }
  const totalCartridgeBytes = runningPayloadOffset;
  const merkleLevels = computeMerkleTreeLevels(encodedTocItems.map((e) => e.leafHash));
  const merkleRootBytes = merkleLevels[merkleLevels.length - 1]![0]!;
  const merkleRootHex = bytesToHex(merkleRootBytes);

  const cartridgeBytes = new Uint8Array(totalCartridgeBytes);
  const dv = new DataView(cartridgeBytes.buffer);
  let tocCursor = tocOffsetBytes;
  const tocEntries: TsarcTocRecordSummary[] = [];

  for (let i = 0; i < encodedTocItems.length; i += 1) {
    const item = encodedTocItems[i]!; const payloadOffset = payloadOffsets[i]!; const payloadLen = item.payloadBytes.length;
    dv.setUint32(tocCursor, item.entryIndex, true); cartridgeBytes[tocCursor + 4] = item.kindCode;
    dv.setUint32(tocCursor + 8, payloadOffset, true); dv.setUint32(tocCursor + 12, payloadLen, true);
    cartridgeBytes.set(item.leafHash, tocCursor + 16);
    dv.setUint16(tocCursor + 48, item.idBytes.length, true); dv.setUint16(tocCursor + 50, item.metaBytes.length, true);
    cartridgeBytes.set(item.idBytes, tocCursor + 52); cartridgeBytes.set(item.metaBytes, tocCursor + 52 + item.idBytes.length);
    cartridgeBytes.set(item.payloadBytes, payloadOffset);
    tocEntries.push({ entryIndex: item.entryIndex, kind: item.kind, entryId: item.entryId, payloadOffset, payloadByteLength: payloadLen, leafHashHex: bytesToHex(item.leafHash) });
    tocCursor += item.alignedRecLen;
  }

  cartridgeBytes.set(TSARC_MAGIC_BYTES, 0); dv.setUint32(8, TSARC_HEADER_SIZE_BYTES, true);
  dv.setUint32(12, 0x01 | 0x02 | (sortedFonts.length > 0 ? 0x04 : 0), true);
  dv.setUint32(16, createdEpoch >>> 0, true); dv.setUint32(20, Math.floor(createdEpoch / 0x100000000) >>> 0, true);
  dv.setUint32(24, encodedTocItems.length, true); dv.setUint32(28, tocOffsetBytes, true);
  dv.setUint32(32, tocByteLength, true); dv.setUint32(36, payloadRegionOffsetBytes, true);
  dv.setUint32(40, totalCartridgeBytes, true); cartridgeBytes.set(merkleRootBytes, 44);
  cartridgeBytes.set(sha256Bytes(cartridgeBytes.subarray(0, 76)).subarray(0, 20), 76);
  return { cartridgeBytes, merkleRootHex, tocEntries, totalByteLength: totalCartridgeBytes, serverCostKrw: 0 };
}

/** `.tsarc` 내 특정 인덱스 항목에 대한 SHA-256 머클 포함 증명(Inclusion Proof)을 생성한다. */
export function buildTsarcInclusionProof(
  tocEntries: readonly TsarcTocRecordSummary[],
  entryIndex: number,
): TsarcMerkleInclusionProof {
  if (entryIndex < 0 || entryIndex >= tocEntries.length) {
    throw new Error("머클 포함 증명 대상 entryIndex가 TOC 범위를 벗어났습니다.");
  }
  const levels = computeMerkleTreeLevels(tocEntries.map((entry) => hexTo32Bytes(entry.leafHashHex)));
  const siblings: Array<{ readonly hashHex: string; readonly position: "left" | "right" }> = [];
  let idx = entryIndex;
  for (let lvl = 0; lvl + 1 < levels.length; lvl += 1) {
    const levelNodes = levels[lvl]!;
    if ((idx & 1) === 1) siblings.push({ hashHex: bytesToHex(levelNodes[idx - 1]!), position: "left" });
    else if (idx + 1 < levelNodes.length) siblings.push({ hashHex: bytesToHex(levelNodes[idx + 1]!), position: "right" });
    idx = idx >>> 1;
  }
  return { entryIndex, leafHashHex: tocEntries[entryIndex]!.leafHashHex, siblings, merkleRootHex: bytesToHex(levels[levels.length - 1]![0]!) };
}

/** 단일 항목의 머클 포함 증명을 루트 해시와 대조해 변조 여부를 독립 검증한다. */
export function verifyTsarcInclusionProof(proof: TsarcMerkleInclusionProof): boolean {
  let current = hexTo32Bytes(proof.leafHashHex);
  for (const step of proof.siblings) {
    const sib = hexTo32Bytes(step.hashHex);
    current = step.position === "left" ? hashMerkleBranch(sib, current) : hashMerkleBranch(current, sib);
  }
  return bytesToHex(current) === proof.merkleRootHex;
}

/** 오프라인 `.tsarc` 카트리지의 매직·체크섬·개별 페이로드 SHA-256·머클 루트를 검증하고 언패킹한다. */
export function verifyAndUnpackTsarcCartridge(cartridgeBytes: Uint8Array): TsarcVerifyResult {
  const issues: TsarcIntegrityIssue[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const emptyFail = (merkleRootHex = "", createdUnixEpochSec = 0): TsarcVerifyResult => ({
    valid: false, issues, merkleRootHex, computedMerkleRootHex: "", createdUnixEpochSec,
    documentId: "", episodeTitle: "", colorProfile: null, fontSubsets: [], layers: [], tocEntries: [], serverCostKrw: 0,
  });

  if (cartridgeBytes.length < TSARC_HEADER_SIZE_BYTES) {
    issues.push({ code: "truncated-container", messageKo: "카트리지 파일 크기가 최소 96바이트 헤더보다 작아 손상되었습니다." });
    return emptyFail();
  }
  const magicPrefixOk =
    cartridgeBytes[0] === 0x54 && cartridgeBytes[1] === 0x53 && cartridgeBytes[2] === 0x41 &&
    cartridgeBytes[3] === 0x52 && cartridgeBytes[4] === 0x43 && cartridgeBytes[5] === 0x00;
  if (!magicPrefixOk) {
    issues.push({ code: "invalid-magic", messageKo: "TSARC 매직 시그니처가 일치하지 않습니다. 유효한 아카이브 파일이 아닙니다." });
  } else if (cartridgeBytes[6] !== 0x01 || cartridgeBytes[7] !== 0x00) {
    issues.push({ code: "unsupported-version", messageKo: "지원하지 않는 TSARC 포맷 버전입니다." });
  }

  const dv = new DataView(cartridgeBytes.buffer, cartridgeBytes.byteOffset, cartridgeBytes.byteLength);
  const headerSize = dv.getUint32(8, true);
  const createdUnixEpochSec = dv.getUint32(20, true) * 0x100000000 + dv.getUint32(16, true);
  const entryCount = dv.getUint32(24, true); const tocOffset = dv.getUint32(28, true);
  const tocByteLength = dv.getUint32(32, true); const payloadRegionOffset = dv.getUint32(36, true);
  const declaredTotalBytes = dv.getUint32(40, true);
  const storedMerkleRoot = cartridgeBytes.subarray(44, 76);
  const merkleRootHex = bytesToHex(storedMerkleRoot);

  if (!bytesEqual(sha256Bytes(cartridgeBytes.subarray(0, 76)).subarray(0, 20), cartridgeBytes.subarray(76, 96))) {
    issues.push({ code: "header-checksum-mismatch", messageKo: "카트리지 헤더 체크섬이 일치하지 않습니다(헤더 비트 손상 또는 변조 감지)." });
  }
  if (headerSize !== TSARC_HEADER_SIZE_BYTES || declaredTotalBytes > cartridgeBytes.length || tocOffset < TSARC_HEADER_SIZE_BYTES || tocOffset + tocByteLength > cartridgeBytes.length || payloadRegionOffset < tocOffset + tocByteLength) {
    issues.push({ code: "toc-bounds-corrupted", messageKo: "TOC 또는 페이로드 오프셋 경계가 실제 파일 크기를 벗어났습니다." });
    return emptyFail(merkleRootHex, createdUnixEpochSec);
  }

  let cursor = tocOffset; const tocEnd = tocOffset + tocByteLength;
  const computedLeaves: Uint8Array[] = []; const tocEntries: TsarcTocRecordSummary[] = [];
  let documentId = ""; let episodeTitle = "";
  let colorProfile: TsarcColorProfileDescriptor | null = null;
  const fontSubsets: TsarcFontSubsetEntry[] = []; const layers: TsarcLayerPayloadEntry[] = [];

  for (let i = 0; i < entryCount; i += 1) {
    if (cursor + 52 > tocEnd) { issues.push({ code: "toc-bounds-corrupted", messageKo: "TOC 레코드 길이가 손상되어 전체 항목을 읽을 수 없습니다." }); break; }
    const entryIndex = dv.getUint32(cursor, true); const kindCode = cartridgeBytes[cursor + 4]!;
    const kind = CODE_TO_ENTRY_KIND[kindCode];
    const payloadOffset = dv.getUint32(cursor + 8, true); const payloadByteLength = dv.getUint32(cursor + 12, true);
    const storedLeafHash = cartridgeBytes.subarray(cursor + 16, cursor + 48);
    const idLen = dv.getUint16(cursor + 48, true); const metaLen = dv.getUint16(cursor + 50, true);
    const alignedRecLen = alignUp4(52 + idLen + metaLen);
    if (!kind || cursor + alignedRecLen > tocEnd || payloadOffset < payloadRegionOffset || payloadOffset + payloadByteLength > cartridgeBytes.length) {
      issues.push({ code: "toc-bounds-corrupted", messageKo: `TOC 항목 #${i}의 메타데이터 또는 페이로드 범위가 손상되었습니다.` }); break;
    }
    const idBytes = cartridgeBytes.subarray(cursor + 52, cursor + 52 + idLen);
    const metaBytes = cartridgeBytes.subarray(cursor + 52 + idLen, cursor + 52 + idLen + metaLen);
    const entryId = decoder.decode(idBytes);
    const payloadSlice = cartridgeBytes.subarray(payloadOffset, payloadOffset + payloadByteLength);
    const recomputedLeaf = hashMerkleLeaf(kindCode, idBytes, metaBytes, payloadSlice);
    computedLeaves.push(recomputedLeaf);
    if (!bytesEqual(recomputedLeaf, storedLeafHash)) {
      issues.push({ code: "entry-payload-corrupted", entryId, messageKo: `항목 '${entryId}'의 페이로드 또는 메타데이터에서 비트 부패(변조)가 감지되었습니다.` });
    }
    tocEntries.push({ entryIndex, kind, entryId, payloadOffset, payloadByteLength, leafHashHex: bytesToHex(storedLeafHash) });

    try {
      const metaObj = JSON.parse(decoder.decode(metaBytes)) as Record<string, unknown>;
      if (kind === "episode-manifest") {
        documentId = typeof metaObj.documentId === "string" ? metaObj.documentId : "";
        episodeTitle = typeof metaObj.episodeTitle === "string" ? metaObj.episodeTitle : "";
      } else if (kind === "color-profile") {
        const wp = Array.isArray(metaObj.whitePointChromaticity) ? ([Number(metaObj.whitePointChromaticity[0] ?? 0.3127), Number(metaObj.whitePointChromaticity[1] ?? 0.329)] as const) : ([0.3127, 0.329] as const);
        colorProfile = {
          colorSpace: (metaObj.colorSpace as TsarcColorSpaceKind) ?? "oklch-d65", whitePointChromaticity: wp,
          transferCharacteristic: (metaObj.transferCharacteristic as TsarcColorProfileDescriptor["transferCharacteristic"]) ?? "perceptual-oklch",
          renderingIntent: (metaObj.renderingIntent as TsarcColorProfileDescriptor["renderingIntent"]) ?? "perceptual",
          ...(payloadSlice.length > 0 ? { iccProfileBytes: new Uint8Array(payloadSlice) } : {}),
        };
      } else if (kind === "font-subset") {
        fontSubsets.push({
          fontId: String(metaObj.fontId ?? ""), fontFamily: String(metaObj.fontFamily ?? ""), fontWeight: Number(metaObj.fontWeight ?? 400),
          subsetTag: String(metaObj.subsetTag ?? ""), unicodeRanges: Array.isArray(metaObj.unicodeRanges) ? metaObj.unicodeRanges.map((u) => String(u)) : [],
          glyphCount: Number(metaObj.glyphCount ?? 0), licenseSpdx: String(metaObj.licenseSpdx ?? ""), subsetBytes: new Uint8Array(payloadSlice),
        });
      } else if (kind === "layer-payload") {
        layers.push({
          layerId: String(metaObj.layerId ?? ""), name: String(metaObj.name ?? ""), zIndex: Number(metaObj.zIndex ?? 0),
          widthPx: Number(metaObj.widthPx ?? 0), heightPx: Number(metaObj.heightPx ?? 0),
          blendMode: (metaObj.blendMode as TsarcLayerPayloadEntry["blendMode"]) ?? "normal",
          opacityMilli: Number(metaObj.opacityMilli ?? 1000), encoding: (metaObj.encoding as TsarcLayerEncoding) ?? "raw-rgba8",
          payloadBytes: new Uint8Array(payloadSlice),
        });
      }
    } catch {
      issues.push({ code: "entry-payload-corrupted", entryId, messageKo: `항목 '${entryId}'의 JSON 기술자가 손상되어 해석할 수 없습니다.` });
    }
    cursor += alignedRecLen;
  }

  const levels = computeMerkleTreeLevels(computedLeaves);
  const computedRootBytes = levels[levels.length - 1]![0]!;
  const computedMerkleRootHex = bytesToHex(computedRootBytes);
  if (!bytesEqual(computedRootBytes, storedMerkleRoot)) {
    issues.push({ code: "merkle-root-mismatch", messageKo: "SHA-256 머클 루트가 헤더 기록값과 일치하지 않습니다. 아카이브 무결성 검증에 실패했습니다." });
  }
  return {
    valid: issues.length === 0, issues, merkleRootHex, computedMerkleRootHex,
    createdUnixEpochSec, documentId, episodeTitle, colorProfile, fontSubsets, layers, tocEntries, serverCostKrw: 0,
  };
}
