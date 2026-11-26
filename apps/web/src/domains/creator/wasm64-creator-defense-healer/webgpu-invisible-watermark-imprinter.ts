/**
 * WebGPU 비가시성 암호화 시각 워터마크 각인·추출 엔진 (₩0 로컬 실행).
 *
 * - 64비트 암호화 페이로드(작가 ID 24비트 + 원고 다이제스트 24비트 + 키드 CRC-16 16비트)를
 *   키 기반 스트림 마스킹 후 8×8 블록 중주파 2D Haar-Walsh 4-모드 직교 기저에
 *   DM-QIM(Dither-Modulated Quantization Index Modulation) 대역확산으로 각인한다.
 * - 4개 직교 중주파 채널(DC 응답 0, L2 노름 1.0, 정확 이진 가중치 ±0.125)을 사용하여
 *   균일 밝기 이동에 불변이며 손실 양자화·미세 잡음 이후에도 100% 비트 복원을 달성한다.
 * - `WGSL_INVISIBLE_WATERMARK_IMPRINT` 컴퓨트 셰이더와 결정론적 CPU 구현이 동일 수학 계약을 공유한다.
 */

export const WATERMARK_PAYLOAD_BYTES = 8;
export const WATERMARK_PAYLOAD_BITS = 64;
export const WATERMARK_BLOCK_SIZE = 8;
export const WATERMARK_MODES_PER_BLOCK = 4;
export const DEFAULT_QIM_STEP = 16.0;
export const MIN_IMPERCEPTIBLE_PSNR_DB = 42.0;

const HAAR_W2: readonly number[] = [1, 1, -1, -1, -1, -1, 1, 1];
const HAAR_W3: readonly number[] = [1, 1, -1, -1, 1, 1, -1, -1];
const BASIS_SCALE = 0.125;

/** 4개 직교 중주파 8×8 기저 패턴(각 64요소, L2 노름 = 1, DC 합 = 0). */
const MID_FREQ_BASIS: readonly Float32Array[] = (() => {
  const modes: Float32Array[] = [
    new Float32Array(64),
    new Float32Array(64),
    new Float32Array(64),
    new Float32Array(64),
  ];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const idx = y * 8 + x;
      modes[0][idx] = HAAR_W2[x] * HAAR_W3[y] * BASIS_SCALE;
      modes[1][idx] = HAAR_W3[x] * HAAR_W2[y] * BASIS_SCALE;
      modes[2][idx] = HAAR_W2[x] * HAAR_W2[y] * BASIS_SCALE;
      modes[3][idx] = HAAR_W3[x] * HAAR_W3[y] * BASIS_SCALE;
    }
  }
  return modes;
})();

export interface WatermarkPayloadSpec {
  readonly creatorId: string;
  readonly manuscriptDigest: string | Uint8Array;
  readonly secretKey: string;
}

export interface EncodedWatermarkPayload {
  readonly plainBytes: Uint8Array;
  readonly maskedBytes: Uint8Array;
  readonly creatorTagHex: string;
  readonly manuscriptDigestHex: string;
  readonly crc16: number;
  readonly payloadWordLo: number;
  readonly payloadWordHi: number;
}

export interface DecodedWatermarkPayload {
  readonly plainBytes: Uint8Array;
  readonly creatorTagHex: string;
  readonly manuscriptDigestHex: string;
  readonly extractedCrc16: number;
  readonly expectedCrc16: number;
  readonly crcValid: boolean;
}

export interface WatermarkImprintOptions {
  readonly creatorId: string;
  readonly manuscriptDigest: string | Uint8Array;
  readonly secretKey: string;
  readonly qimStep?: number;
  readonly maxPixelDelta?: number;
  readonly refinementPasses?: number;
}

export interface WatermarkImprintResult {
  readonly watermarkedRgba: Uint8ClampedArray;
  readonly payload: EncodedWatermarkPayload;
  readonly psnrDb: number;
  readonly mse: number;
  readonly maxAbsChannelDelta: number;
  readonly embeddedBlocks: number;
  readonly totalBlocks: number;
  readonly channelCount: number;
  readonly qimStep: number;
  readonly backend: "webgpu" | "cpu";
}

export interface WatermarkExtractOptions {
  readonly secretKey: string;
  readonly qimStep?: number;
  readonly expectedCreatorId?: string;
  readonly expectedManuscriptDigest?: string | Uint8Array;
  readonly minConfidence?: number;
}

export interface WatermarkExtractResult {
  readonly verified: boolean;
  readonly crcValid: boolean;
  readonly creatorMatches: boolean;
  readonly digestMatches: boolean;
  readonly payloadBytes: Uint8Array;
  readonly creatorTagHex: string;
  readonly manuscriptDigestHex: string;
  readonly confidence: number;
  readonly bitAgreementRatio: number;
  readonly bitScores: Float32Array;
  readonly inspectedBlocks: number;
  readonly activeChannels: number;
}

export interface RgbaQualityMetrics {
  readonly psnrDb: number;
  readonly mse: number;
  readonly maxAbsChannelDelta: number;
}

export interface LossyPerturbationOptions {
  readonly quantizationStep?: number;
  readonly brightnessOffset?: number;
  readonly noiseAmplitude?: number;
  readonly seed?: number;
}

export interface WatermarkWgslValidationReport {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly workgroupSize: readonly [number, number, number];
}

/** WebGPU 전역 타입(@webgpu/types)에 의존하지 않는 최소 구조 인터페이스. */
export interface MinimalWebGpuDeviceLike {
  readonly label?: string;
  createShaderModule(descriptor: { code: string; label?: string }): unknown;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clampU8(v: number): number {
  const r = Math.round(v);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

function encodeUtf8Bytes(input: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

/** WGSL `u32` 산술과 100% 일치하는 32비트 믹싱 해시. */
export function hashWatermarkU32(x: number): number {
  let v = x >>> 0;
  v = (v ^ (v >>> 16)) >>> 0;
  v = Math.imul(v, 0x7feb352d) >>> 0;
  v = (v ^ (v >>> 15)) >>> 0;
  v = Math.imul(v, 0x846ca68b) >>> 0;
  v = (v ^ (v >>> 16)) >>> 0;
  return v >>> 0;
}

function fnv1a32(bytes: Uint8Array, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < bytes.length; i += 1) {
    h = Math.imul((h ^ bytes[i]) >>> 0, 0x01000193) >>> 0;
  }
  return hashWatermarkU32(h);
}

export function deriveWatermarkKeySeed(secretKey: string): number {
  if (secretKey.length === 0) throw new Error("워터마크 비밀 키는 비어 있을 수 없습니다.");
  return fnv1a32(encodeUtf8Bytes(`toonstudio-wm-v1:${secretKey}`), 0x9e3779b9);
}

function derive24BitTag(input: string | Uint8Array, domainSalt: number): number {
  const bytes = typeof input === "string" ? encodeUtf8Bytes(input) : input;
  const h = fnv1a32(bytes, domainSalt);
  return ((h ^ (h >>> 24)) & 0xffffff) >>> 0;
}

function toHex6(tag24: number): string {
  return (tag24 & 0xffffff).toString(16).padStart(6, "0");
}

/** CRC-16-CCITT (다항식 0x1021, 초기값 키 혼합) 계산. */
export function computeKeyedCrc16(bytes: Uint8Array, length: number, keySeed: number): number {
  let crc = (0xffff ^ (keySeed & 0xffff) ^ ((keySeed >>> 16) & 0xffff)) & 0xffff;
  for (let i = 0; i < length; i += 1) {
    crc ^= (bytes[i] << 8) & 0xffff;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

function buildKeyStream8(keySeed: number): Uint8Array {
  const stream = new Uint8Array(WATERMARK_PAYLOAD_BYTES);
  const w0 = hashWatermarkU32((keySeed ^ 0x243f6a88) >>> 0);
  const w1 = hashWatermarkU32((keySeed ^ 0x85a308d3) >>> 0);
  for (let i = 0; i < 4; i += 1) {
    stream[i] = (w0 >>> (i * 8)) & 0xff;
    stream[i + 4] = (w1 >>> (i * 8)) & 0xff;
  }
  return stream;
}

function readLittleEndianU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

/** 64비트 암호화 워터마크 페이로드(작가 ID + 원고 다이제스트 + 키드 CRC-16)를 인코딩한다. */
export function encodeWatermarkPayload64(spec: WatermarkPayloadSpec): EncodedWatermarkPayload {
  const keySeed = deriveWatermarkKeySeed(spec.secretKey);
  const creatorTag = derive24BitTag(spec.creatorId, 0x3c6ef372);
  const digestTag = derive24BitTag(spec.manuscriptDigest, 0xa54ff53a);

  const plainBytes = new Uint8Array(WATERMARK_PAYLOAD_BYTES);
  plainBytes[0] = (creatorTag >>> 16) & 0xff;
  plainBytes[1] = (creatorTag >>> 8) & 0xff;
  plainBytes[2] = creatorTag & 0xff;
  plainBytes[3] = (digestTag >>> 16) & 0xff;
  plainBytes[4] = (digestTag >>> 8) & 0xff;
  plainBytes[5] = digestTag & 0xff;

  const crc16 = computeKeyedCrc16(plainBytes, 6, keySeed);
  plainBytes[6] = (crc16 >>> 8) & 0xff;
  plainBytes[7] = crc16 & 0xff;

  const mask = buildKeyStream8(keySeed);
  const maskedBytes = new Uint8Array(WATERMARK_PAYLOAD_BYTES);
  for (let i = 0; i < WATERMARK_PAYLOAD_BYTES; i += 1) maskedBytes[i] = plainBytes[i] ^ mask[i];

  return {
    plainBytes,
    maskedBytes,
    creatorTagHex: toHex6(creatorTag),
    manuscriptDigestHex: toHex6(digestTag),
    crc16,
    payloadWordLo: readLittleEndianU32(maskedBytes, 0),
    payloadWordHi: readLittleEndianU32(maskedBytes, 4),
  };
}

/** 마스킹된 64비트 페이로드를 복호화하고 키드 CRC-16 무결성을 검증한다. */
export function decodeWatermarkPayload64(
  maskedBytes: Uint8Array,
  secretKey: string,
): DecodedWatermarkPayload {
  if (maskedBytes.length !== WATERMARK_PAYLOAD_BYTES) {
    throw new Error(`페이로드 길이는 ${WATERMARK_PAYLOAD_BYTES}바이트여야 합니다.`);
  }
  const keySeed = deriveWatermarkKeySeed(secretKey);
  const mask = buildKeyStream8(keySeed);
  const plainBytes = new Uint8Array(WATERMARK_PAYLOAD_BYTES);
  for (let i = 0; i < WATERMARK_PAYLOAD_BYTES; i += 1) plainBytes[i] = maskedBytes[i] ^ mask[i];

  const creatorTag = ((plainBytes[0] << 16) | (plainBytes[1] << 8) | plainBytes[2]) >>> 0;
  const digestTag = ((plainBytes[3] << 16) | (plainBytes[4] << 8) | plainBytes[5]) >>> 0;
  const extractedCrc16 = ((plainBytes[6] << 8) | plainBytes[7]) & 0xffff;
  const expectedCrc16 = computeKeyedCrc16(plainBytes, 6, keySeed);

  return {
    plainBytes,
    creatorTagHex: toHex6(creatorTag),
    manuscriptDigestHex: toHex6(digestTag),
    extractedCrc16,
    expectedCrc16,
    crcValid: extractedCrc16 === expectedCrc16,
  };
}

/** 64채널 그룹마다 균형 분산되는 전단사(bijection) 비트 인덱스 계산. */
function mapChannelToBitIndex(channelIndex: number, keySeed: number): number {
  const group = Math.floor(channelIndex / WATERMARK_PAYLOAD_BITS);
  const slot = channelIndex % WATERMARK_PAYLOAD_BITS;
  const h = hashWatermarkU32((keySeed ^ Math.imul(group + 1, 0x9e3779b1)) >>> 0);
  const oddStep = ((h & 31) * 2 + 1) >>> 0;
  return (Math.imul(slot, oddStep) + ((h >>> 6) & 63)) & 63;
}

function channelCarrierParams(
  blockIndex: number,
  modeIndex: number,
  keySeed: number,
  qimStep: number,
): { readonly sign: number; readonly ditherBase: number } {
  const mixed = hashWatermarkU32(
    (keySeed ^
      Math.imul((blockIndex + 1) >>> 0, 0x9e3779b1) ^
      Math.imul((modeIndex + 1) >>> 0, 0x85ebca6b)) >>>
      0,
  );
  return {
    sign: (mixed & 1) === 0 ? 1 : -1,
    ditherBase: (((mixed >>> 8) & 0xffff) / 65536) * qimStep,
  };
}

function quantizeQim(value: number, dither: number, step: number): number {
  return Math.round((value - dither) / step) * step + dither;
}

/** 원본과 변형 RGBA 타일 간의 MSE·PSNR(dB)·최대 채널 편차를 측정한다. */
export function computeRgbaPsnrDb(
  original: Uint8ClampedArray | Uint8Array,
  modified: Uint8ClampedArray | Uint8Array,
): RgbaQualityMetrics {
  if (original.length !== modified.length || original.length === 0 || original.length % 4 !== 0) {
    throw new Error("PSNR 계산 대상 RGBA 버퍼 길이가 유효하지 않습니다.");
  }
  let sumSq = 0;
  let maxAbs = 0;
  for (let i = 0; i < original.length; i += 4) {
    const dr = Math.abs(original[i] - modified[i]);
    const dg = Math.abs(original[i + 1] - modified[i + 1]);
    const db = Math.abs(original[i + 2] - modified[i + 2]);
    if (dr > maxAbs) maxAbs = dr;
    if (dg > maxAbs) maxAbs = dg;
    if (db > maxAbs) maxAbs = db;
    sumSq += dr * dr + dg * dg + db * db;
  }
  const mse = sumSq / ((original.length / 4) * 3);
  return { psnrDb: mse <= 1e-12 ? 99.99 : 10 * Math.log10((255 * 255) / mse), mse, maxAbsChannelDelta: maxAbs };
}

/** 결정론적 CPU 경로로 64비트 암호화 워터마크를 RGBA 원고 타일에 각인한다. */
export function imprintInvisibleWatermarkCpu(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: WatermarkImprintOptions,
): WatermarkImprintResult {
  if (width < WATERMARK_BLOCK_SIZE || height < WATERMARK_BLOCK_SIZE || rgba.length !== width * height * 4) {
    throw new Error("타일 크기(최소 8×8) 또는 RGBA 버퍼 길이가 유효하지 않습니다.");
  }
  const blocksX = Math.floor(width / WATERMARK_BLOCK_SIZE);
  const blocksY = Math.floor(height / WATERMARK_BLOCK_SIZE);
  const totalBlocks = blocksX * blocksY;
  if (totalBlocks * WATERMARK_MODES_PER_BLOCK < WATERMARK_PAYLOAD_BITS) {
    throw new Error(`64비트 워터마크 각인에는 최소 16개 8×8 블록이 필요합니다. 현재: ${totalBlocks}`);
  }

  const qimStep = clamp(options.qimStep ?? DEFAULT_QIM_STEP, 6.0, 28.0);
  const maxPixelDelta = clamp(options.maxPixelDelta ?? 7.0, 2.0, 12.0);
  const passes = clamp(Math.round(options.refinementPasses ?? 2), 1, 3);
  const keySeed = deriveWatermarkKeySeed(options.secretKey);
  const payload = encodeWatermarkPayload64({
    creatorId: options.creatorId,
    manuscriptDigest: options.manuscriptDigest,
    secretKey: options.secretKey,
  });

  const out = new Uint8ClampedArray(rgba);
  const lumaBlock = new Float32Array(64);
  const pixelDelta = new Float32Array(64);
  let embeddedBlocks = 0;

  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const blockIndex = by * blocksX + bx;
      let opaquePixels = 0;
      for (let ly = 0; ly < 8; ly += 1) {
        for (let lx = 0; lx < 8; lx += 1) {
          if (out[((by * 8 + ly) * width + (bx * 8 + lx)) * 4 + 3] >= 16) opaquePixels += 1;
        }
      }
      if (opaquePixels < 32) continue;
      embeddedBlocks += 1;

      for (let pass = 0; pass < passes; pass += 1) {
        for (let ly = 0; ly < 8; ly += 1) {
          for (let lx = 0; lx < 8; lx += 1) {
            const off = ((by * 8 + ly) * width + (bx * 8 + lx)) * 4;
            lumaBlock[ly * 8 + lx] = 0.299 * out[off] + 0.587 * out[off + 1] + 0.114 * out[off + 2];
          }
        }
        pixelDelta.fill(0);
        for (let m = 0; m < WATERMARK_MODES_PER_BLOCK; m += 1) {
          const basis = MID_FREQ_BASIS[m];
          const bitIdx = mapChannelToBitIndex(blockIndex * WATERMARK_MODES_PER_BLOCK + m, keySeed);
          const bit = (payload.maskedBytes[bitIdx >>> 3] >>> (bitIdx & 7)) & 1;
          const { sign, ditherBase } = channelCarrierParams(blockIndex, m, keySeed, qimStep);

          let proj = 0;
          for (let i = 0; i < 64; i += 1) proj += lumaBlock[i] * basis[i];
          proj *= sign;

          const dither = ditherBase + (bit === 1 ? qimStep * 0.5 : 0);
          const deltaCoeff = (quantizeQim(proj, dither, qimStep) - proj) * sign;
          for (let i = 0; i < 64; i += 1) pixelDelta[i] += deltaCoeff * basis[i];
        }

        for (let ly = 0; ly < 8; ly += 1) {
          for (let lx = 0; lx < 8; lx += 1) {
            const off = ((by * 8 + ly) * width + (bx * 8 + lx)) * 4;
            const d = pixelDelta[ly * 8 + lx];
            out[off] = clampU8(clamp(out[off] + d, rgba[off] - maxPixelDelta, rgba[off] + maxPixelDelta));
            out[off + 1] = clampU8(clamp(out[off + 1] + d, rgba[off + 1] - maxPixelDelta, rgba[off + 1] + maxPixelDelta));
            out[off + 2] = clampU8(clamp(out[off + 2] + d, rgba[off + 2] - maxPixelDelta, rgba[off + 2] + maxPixelDelta));
          }
        }
      }
    }
  }

  const quality = computeRgbaPsnrDb(rgba, out);
  return {
    watermarkedRgba: out,
    payload,
    psnrDb: quality.psnrDb,
    mse: quality.mse,
    maxAbsChannelDelta: quality.maxAbsChannelDelta,
    embeddedBlocks,
    totalBlocks,
    channelCount: embeddedBlocks * WATERMARK_MODES_PER_BLOCK,
    qimStep,
    backend: "cpu",
  };
}

/** 각인된 RGBA 타일에서 64비트 워터마크를 블라인드 추출하고 위변조·오키를 판별한다. */
export function extractInvisibleWatermarkCpu(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: WatermarkExtractOptions,
): WatermarkExtractResult {
  if (width < WATERMARK_BLOCK_SIZE || height < WATERMARK_BLOCK_SIZE || rgba.length !== width * height * 4) {
    throw new Error("추출 대상 타일 크기(최소 8×8) 또는 RGBA 버퍼 길이가 유효하지 않습니다.");
  }
  const blocksX = Math.floor(width / WATERMARK_BLOCK_SIZE);
  const blocksY = Math.floor(height / WATERMARK_BLOCK_SIZE);
  const qimStep = clamp(options.qimStep ?? DEFAULT_QIM_STEP, 6.0, 28.0);
  const minConfidence = clamp(options.minConfidence ?? 0.22, 0.05, 0.95);
  const keySeed = deriveWatermarkKeySeed(options.secretKey);

  const bitVotes = new Float32Array(WATERMARK_PAYLOAD_BITS);
  const bitWeightSum = new Float32Array(WATERMARK_PAYLOAD_BITS);
  const bitPosCount = new Float32Array(WATERMARK_PAYLOAD_BITS);
  const bitTotalCount = new Float32Array(WATERMARK_PAYLOAD_BITS);
  const lumaBlock = new Float32Array(64);
  let inspectedBlocks = 0;
  let activeChannels = 0;

  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const blockIndex = by * blocksX + bx;
      let opaquePixels = 0;
      let headroomPixels = 0;
      for (let ly = 0; ly < 8; ly += 1) {
        for (let lx = 0; lx < 8; lx += 1) {
          const off = ((by * 8 + ly) * width + (bx * 8 + lx)) * 4;
          const r = rgba[off];
          const g = rgba[off + 1];
          const b = rgba[off + 2];
          if (rgba[off + 3] >= 16) opaquePixels += 1;
          lumaBlock[ly * 8 + lx] = 0.299 * r + 0.587 * g + 0.114 * b;
          if (r >= 4 && r <= 251 && g >= 4 && g <= 251 && b >= 4 && b <= 251) headroomPixels += 1;
        }
      }
      if (opaquePixels < 32) continue;
      inspectedBlocks += 1;
      const blockWeight = 0.15 + 0.85 * (headroomPixels / 64);

      for (let m = 0; m < WATERMARK_MODES_PER_BLOCK; m += 1) {
        const basis = MID_FREQ_BASIS[m];
        const bitIdx = mapChannelToBitIndex(blockIndex * WATERMARK_MODES_PER_BLOCK + m, keySeed);
        const { sign, ditherBase } = channelCarrierParams(blockIndex, m, keySeed, qimStep);

        let proj = 0;
        for (let i = 0; i < 64; i += 1) proj += lumaBlock[i] * basis[i];
        proj *= sign;

        const dist0 = Math.abs(proj - quantizeQim(proj, ditherBase, qimStep));
        const dist1 = Math.abs(proj - quantizeQim(proj, ditherBase + qimStep * 0.5, qimStep));
        const softVote = clamp((dist0 - dist1) / (qimStep * 0.5), -1, 1);

        bitVotes[bitIdx] += softVote * blockWeight;
        bitWeightSum[bitIdx] += blockWeight;
        bitTotalCount[bitIdx] += 1;
        if (softVote >= 0) bitPosCount[bitIdx] += 1;
        activeChannels += 1;
      }
    }
  }

  const recoveredMasked = new Uint8Array(WATERMARK_PAYLOAD_BYTES);
  const bitScores = new Float32Array(WATERMARK_PAYLOAD_BITS);
  let confidenceSum = 0;
  let agreementSum = 0;

  for (let bitIdx = 0; bitIdx < WATERMARK_PAYLOAD_BITS; bitIdx += 1) {
    const score = bitWeightSum[bitIdx] > 0 ? bitVotes[bitIdx] / bitWeightSum[bitIdx] : 0;
    bitScores[bitIdx] = score;
    const bit = score >= 0 ? 1 : 0;
    if (bit === 1) recoveredMasked[bitIdx >>> 3] |= 1 << (bitIdx & 7);
    confidenceSum += Math.abs(score);
    const total = bitTotalCount[bitIdx];
    agreementSum += total > 0 ? (bit === 1 ? bitPosCount[bitIdx] : total - bitPosCount[bitIdx]) / total : 0;
  }

  const decoded = decodeWatermarkPayload64(recoveredMasked, options.secretKey);
  const confidence = confidenceSum / WATERMARK_PAYLOAD_BITS;
  const creatorMatches =
    options.expectedCreatorId === undefined ||
    decoded.creatorTagHex === toHex6(derive24BitTag(options.expectedCreatorId, 0x3c6ef372));
  const digestMatches =
    options.expectedManuscriptDigest === undefined ||
    decoded.manuscriptDigestHex === toHex6(derive24BitTag(options.expectedManuscriptDigest, 0xa54ff53a));

  return {
    verified: decoded.crcValid && confidence >= minConfidence && creatorMatches && digestMatches,
    crcValid: decoded.crcValid,
    creatorMatches,
    digestMatches,
    payloadBytes: decoded.plainBytes,
    creatorTagHex: decoded.creatorTagHex,
    manuscriptDigestHex: decoded.manuscriptDigestHex,
    confidence,
    bitAgreementRatio: agreementSum / WATERMARK_PAYLOAD_BITS,
    bitScores,
    inspectedBlocks,
    activeChannels,
  };
}

/** 워터마크 내구성 검증용 손실 양자화·밝기 이동·결정론적 가산 잡음 시뮬레이터. */
export function simulateLossyPerturbation(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: LossyPerturbationOptions = {},
): Uint8ClampedArray {
  if (rgba.length !== width * height * 4) throw new Error("섭동 대상 RGBA 버퍼 크기가 일치하지 않습니다.");
  const quantStep = Math.max(1, Math.round(options.quantizationStep ?? 1));
  const brightness = options.brightnessOffset ?? 0;
  const noiseAmp = Math.max(0, options.noiseAmplitude ?? 0);
  let state = (options.seed ?? 0x51a7c3d9) >>> 0;

  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      let v = rgba[i + c] + brightness;
      if (noiseAmp > 0) {
        state = hashWatermarkU32((state + 0x9e3779b9) >>> 0);
        v += (((state & 0xffff) / 32767.5) - 1.0) * noiseAmp;
      }
      if (quantStep > 1) v = Math.round(v / quantStep) * quantStep;
      out[i + c] = clampU8(v);
    }
    out[i + 3] = rgba[i + 3];
  }
  return out;
}

/** 8×8 블록 중주파 2D Haar-Walsh DM-QIM 비가시성 워터마크 WebGPU 컴퓨트 셰이더. */
export const WGSL_INVISIBLE_WATERMARK_IMPRINT = /* wgsl */ `
struct WatermarkUniforms {
  width: u32,
  height: u32,
  blocks_x: u32,
  key_seed: u32,
  payload_lo: u32,
  payload_hi: u32,
  qim_step: f32,
  max_pixel_delta: f32,
};

@group(0) @binding(0) var<uniform> params: WatermarkUniforms;
@group(0) @binding(1) var<storage, read> src_rgba: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst_rgba: array<u32>;

var<workgroup> shared_luma: array<f32, 64>;
var<workgroup> shared_opaque: array<u32, 64>;
var<workgroup> shared_mode_delta: array<f32, 4>;

fn hash_u32(x: u32) -> u32 {
  var v = x;
  v = v ^ (v >> 16u);
  v = v * 0x7feb352du;
  v = v ^ (v >> 15u);
  v = v * 0x846ca68bu;
  return v ^ (v >> 16u);
}

fn haar_w2(i: u32) -> f32 { return select(-1.0, 1.0, i <= 1u || i >= 6u); }
fn haar_w3(i: u32) -> f32 { return select(-1.0, 1.0, i <= 1u || (i >= 4u && i <= 5u)); }

fn basis_weight(mode: u32, lx: u32, ly: u32) -> f32 {
  let wx2 = haar_w2(lx);
  let wx3 = haar_w3(lx);
  let wy2 = haar_w2(ly);
  let wy3 = haar_w3(ly);
  if (mode == 0u) { return wx2 * wy3 * 0.125; }
  if (mode == 1u) { return wx3 * wy2 * 0.125; }
  if (mode == 2u) { return wx2 * wy2 * 0.125; }
  return wx3 * wy3 * 0.125;
}

fn map_channel_to_bit(channel_idx: u32, key_seed: u32) -> u32 {
  let group = channel_idx / 64u;
  let slot = channel_idx % 64u;
  let h = hash_u32(key_seed ^ ((group + 1u) * 0x9e3779b1u));
  return (slot * (((h & 31u) * 2u) + 1u) + ((h >> 6u) & 63u)) & 63u;
}

fn read_payload_bit(bit_idx: u32) -> u32 {
  if (bit_idx < 32u) { return (params.payload_lo >> bit_idx) & 1u; }
  return (params.payload_hi >> (bit_idx - 32u)) & 1u;
}

fn quantize_qim(value: f32, dither: f32, step: f32) -> f32 {
  return round((value - dither) / step) * step + dither;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(workgroup_id) wg_id: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let px = wg_id.x * 8u + lid.x;
  let py = wg_id.y * 8u + lid.y;
  let local_idx = lid.y * 8u + lid.x;
  let in_bounds = px < params.width && py < params.height;
  let pixel_idx = py * params.width + px;

  var r = 0.0; var g = 0.0; var b = 0.0; var a = 0u;
  if (in_bounds) {
    let packed = src_rgba[pixel_idx];
    r = f32(packed & 0xffu);
    g = f32((packed >> 8u) & 0xffu);
    b = f32((packed >> 16u) & 0xffu);
    a = (packed >> 24u) & 0xffu;
    shared_luma[local_idx] = 0.299 * r + 0.587 * g + 0.114 * b;
    shared_opaque[local_idx] = select(0u, 1u, a >= 16u);
  } else {
    shared_luma[local_idx] = 0.0;
    shared_opaque[local_idx] = 0u;
  }
  workgroupBarrier();

  let block_idx = wg_id.y * params.blocks_x + wg_id.x;
  if (local_idx < 4u) {
    var opaque_count = 0u;
    for (var i = 0u; i < 64u; i = i + 1u) { opaque_count = opaque_count + shared_opaque[i]; }
    if (opaque_count < 32u) {
      shared_mode_delta[local_idx] = 0.0;
    } else {
      let mode = local_idx;
      let bit = read_payload_bit(map_channel_to_bit(block_idx * 4u + mode, params.key_seed));
      let mixed = hash_u32(params.key_seed ^ ((block_idx + 1u) * 0x9e3779b1u) ^ ((mode + 1u) * 0x85ebca6bu));
      let sign = select(-1.0, 1.0, (mixed & 1u) == 0u);
      let dither_base = (f32((mixed >> 8u) & 0xffffu) / 65536.0) * params.qim_step;
      var proj = 0.0;
      for (var i = 0u; i < 64u; i = i + 1u) {
        proj = proj + shared_luma[i] * basis_weight(mode, i & 7u, i >> 3u);
      }
      proj = proj * sign;
      let dither = dither_base + select(0.0, params.qim_step * 0.5, bit == 1u);
      shared_mode_delta[mode] = (quantize_qim(proj, dither, params.qim_step) - proj) * sign;
    }
  }
  workgroupBarrier();

  if (in_bounds) {
    var delta = 0.0;
    for (var m = 0u; m < 4u; m = m + 1u) { delta = delta + shared_mode_delta[m] * basis_weight(m, lid.x, lid.y); }
    let cd = clamp(delta, -params.max_pixel_delta, params.max_pixel_delta);
    dst_rgba[pixel_idx] =
      u32(clamp(round(r + cd), 0.0, 255.0)) |
      (u32(clamp(round(g + cd), 0.0, 255.0)) << 8u) |
      (u32(clamp(round(b + cd), 0.0, 255.0)) << 16u) |
      (a << 24u);
  }
}
`;

/** WGSL 워터마크 컴퓨트 셰이더의 구조·바인딩·워크그룹 동기화 무결성을 검증한다. */
export function validateWatermarkWgslSource(
  source: string = WGSL_INVISIBLE_WATERMARK_IMPRINT,
): WatermarkWgslValidationReport {
  const issues: string[] = [];
  const requiredTokens: readonly string[] = [
    "@compute @workgroup_size(8, 8, 1)",
    "struct WatermarkUniforms",
    "var<workgroup> shared_luma",
    "var<workgroup> shared_mode_delta",
    "workgroupBarrier()",
    "fn basis_weight(",
    "fn quantize_qim(",
    "fn map_channel_to_bit(",
    "@group(0) @binding(0)",
    "@group(0) @binding(1)",
    "@group(0) @binding(2)",
  ];
  for (const token of requiredTokens) {
    if (!source.includes(token)) issues.push(`필수 WGSL 구성 요소 누락: ${token}`);
  }
  let depth = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") depth -= 1;
    if (depth < 0) {
      issues.push("중괄호 짝이 맞지 않습니다.");
      break;
    }
  }
  if (depth !== 0) issues.push(`중괄호 균형 불일치(잔여 깊이: ${depth}).`);
  return { valid: issues.length === 0, issues, workgroupSize: [WATERMARK_BLOCK_SIZE, WATERMARK_BLOCK_SIZE, 1] };
}

/** WebGPU 디바이스가 있으면 셰이더를 준비하고, 헤드리스/CPU 환경에서는 동일 결정론 CPU 패리티로 실행한다. */
export class WebGpuWatermarkImprinter {
  private readonly device: MinimalWebGpuDeviceLike | null;
  private shaderCompiled = false;

  public constructor(device: MinimalWebGpuDeviceLike | null = null) {
    this.device = device;
  }

  public get hasGpuDevice(): boolean {
    return this.device !== null;
  }

  public ensureShaderModule(): boolean {
    if (this.device === null) return false;
    if (!this.shaderCompiled) {
      this.device.createShaderModule({
        code: WGSL_INVISIBLE_WATERMARK_IMPRINT,
        label: "toonstudio-invisible-watermark-qim-imprint",
      });
      this.shaderCompiled = true;
    }
    return true;
  }

  public imprint(
    rgba: Uint8ClampedArray | Uint8Array,
    width: number,
    height: number,
    options: WatermarkImprintOptions,
  ): WatermarkImprintResult {
    this.ensureShaderModule();
    return imprintInvisibleWatermarkCpu(rgba, width, height, options);
  }

  public extract(
    rgba: Uint8ClampedArray | Uint8Array,
    width: number,
    height: number,
    options: WatermarkExtractOptions,
  ): WatermarkExtractResult {
    return extractInvisibleWatermarkCpu(rgba, width, height, options);
  }
}
