/**
 * 가역 2D 리프팅 정수 Haar 웨이블릿(LL, LH, HL, HH) + LOCO-I(MED: Median Edge Detector)
 * 점진적 웹툰 컷 무손실 코덱.
 *
 * - 부동소수점 반올림 오차가 전혀 없는 순수 정수 리프팅 S-변환과 가역 YCoCg-R 색변환으로
 *   100% 비트 일치(bit-exact) 왕복 복원을 보장한다.
 * - 전체 비트스트림의 앞쪽 6~10% 바이트만 디코딩해도 즉시 전체 해상도 거친 미리보기(LL Coarse Preview)를
 *   복원하며, 후속 고주파 부대역 청크가 도착할수록 점진적으로 선명해져 최종 원본 RGBA와 완전히 일치한다.
 */

export interface IntegerHaar2DSubbands {
  readonly width: number;
  readonly height: number;
  readonly lowWidth: number;
  readonly lowHeight: number;
  readonly highWidth: number;
  readonly highHeight: number;
  readonly ll: Int32Array;
  readonly hl: Int32Array;
  readonly lh: Int32Array;
  readonly hh: Int32Array;
}

export interface ProgressiveCutEncodeOptions {
  readonly decompositionLevels?: "auto" | 1 | 2 | 3 | 4;
  readonly targetCoarseByteRatioMin?: number;
  readonly targetCoarseByteRatioMax?: number;
}

export interface ProgressiveCutEncodedPacket {
  readonly bitstream: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly decompositionLevels: number;
  readonly totalChunks: number;
  readonly coarseChunkCount: number;
  readonly coarsePreviewByteLength: number;
  readonly coarsePreviewByteRatio: number;
  readonly uncompressedByteLength: number;
  readonly compressionRatio: number;
  readonly checksumFnv1a32: number;
  readonly elapsedMs: number;
}

export interface ProgressiveCutDecodeResult {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly decodedChunks: number;
  readonly totalChunks: number;
  readonly isCompleteLossless: boolean;
  readonly checksumVerified: boolean;
  readonly elapsedMs: number;
}

const MAGIC_B0 = 0x57; // 'W'
const MAGIC_B1 = 0x48; // 'H'
const MAGIC_B2 = 0x31; // '1'
const MAGIC_B3 = 0x35; // '5'
const HEADER_FIXED_BYTES = 20;
const FLAG_OPAQUE_ALPHA = 1;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clampByteInt(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * 무손실 원본 검증용 32비트 FNV-1a 해시를 계산한다.
 */
export function computeCutFnv1a32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * LOCO-I(JPEG-LS) 표준 비선형 에지 적응 예측기(MED: Median Edge Detector).
 */
export function predictLocoIMed(west: number, north: number, northWest: number): number {
  const minWN = west < north ? west : north;
  const maxWN = west > north ? west : north;
  if (northWest >= maxWN) return minWN;
  if (northWest <= minWN) return maxWN;
  return west + north - northWest;
}

/**
 * 가역 2D 리프팅 스킴 정수 Haar 정방향 변환(LL, HL, LH, HH 부대역 분리).
 * 짝수·홀수 해상도 모두 패딩 손실 없이 100% 정수 전단사 변환을 수행한다.
 */
export function forwardHaar2DInt(
  channel: Int32Array,
  width: number,
  height: number,
): IntegerHaar2DSubbands {
  if (width < 1 || height < 1 || channel.length !== width * height) {
    throw new RangeError(`유효하지 않은 평면 크기: ${width}x${height} (len=${channel.length})`);
  }
  const lowWidth = (width + 1) >> 1;
  const highWidth = width >> 1;
  const lowHeight = (height + 1) >> 1;
  const highHeight = height >> 1;

  const temp = new Int32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let i = 0; i < highWidth; i += 1) {
      const even = channel[rowOff + i * 2]!;
      const odd = channel[rowOff + i * 2 + 1]!;
      const d = odd - even;
      const s = even + (d >> 1);
      temp[rowOff + i] = s;
      temp[rowOff + lowWidth + i] = d;
    }
    if (lowWidth > highWidth) {
      temp[rowOff + lowWidth - 1] = channel[rowOff + width - 1]!;
    }
  }

  const ll = new Int32Array(lowWidth * lowHeight);
  const hl = new Int32Array(highWidth * lowHeight);
  const lh = new Int32Array(lowWidth * highHeight);
  const hh = new Int32Array(highWidth * highHeight);

  for (let x = 0; x < width; x += 1) {
    const isLowX = x < lowWidth;
    const dstS = isLowX ? ll : hl;
    const dstD = isLowX ? lh : hh;
    const stride = isLowX ? lowWidth : highWidth;
    const col = isLowX ? x : x - lowWidth;
    for (let j = 0; j < highHeight; j += 1) {
      const even = temp[j * 2 * width + x]!;
      const odd = temp[(j * 2 + 1) * width + x]!;
      const d = odd - even;
      dstS[j * stride + col] = even + (d >> 1);
      dstD[j * stride + col] = d;
    }
    if (lowHeight > highHeight) dstS[(lowHeight - 1) * stride + col] = temp[(height - 1) * width + x]!;
  }

  return { width, height, lowWidth, lowHeight, highWidth, highHeight, ll, hl, lh, hh };
}

/**
 * 가역 2D 리프팅 스킴 정수 Haar 역방향 변환.
 * 정방향 변환된 LL, HL, LH, HH 부대역으로부터 원본 정수 평면을 비트 단위로 정확히 복원한다.
 */
export function inverseHaar2DInt(subbands: IntegerHaar2DSubbands): Int32Array {
  const { width, height, lowWidth, lowHeight, highWidth, highHeight, ll, hl, lh, hh } = subbands;
  const temp = new Int32Array(width * height);

  for (let x = 0; x < width; x += 1) {
    const isLowX = x < lowWidth;
    const srcS = isLowX ? ll : hl;
    const srcD = isLowX ? lh : hh;
    const stride = isLowX ? lowWidth : highWidth;
    const col = isLowX ? x : x - lowWidth;
    for (let j = 0; j < highHeight; j += 1) {
      const s = srcS[j * stride + col]!;
      const d = srcD[j * stride + col]!;
      const even = s - (d >> 1);
      temp[j * 2 * width + x] = even;
      temp[(j * 2 + 1) * width + x] = d + even;
    }
    if (lowHeight > highHeight) temp[(height - 1) * width + x] = srcS[(lowHeight - 1) * stride + col]!;
  }

  const restored = new Int32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let i = 0; i < highWidth; i += 1) {
      const s = temp[rowOff + i]!;
      const d = temp[rowOff + lowWidth + i]!;
      const even = s - (d >> 1);
      const odd = d + even;
      restored[rowOff + i * 2] = even;
      restored[rowOff + i * 2 + 1] = odd;
    }
    if (lowWidth > highWidth) {
      restored[rowOff + width - 1] = temp[rowOff + lowWidth - 1]!;
    }
  }
  return restored;
}

class BitWriter {
  private buf: Uint8Array;
  private bytePos = 0;
  private currentByte = 0;
  private bitCount = 0;

  constructor(initialCapacity = 256) {
    this.buf = new Uint8Array(initialCapacity);
  }

  private pushByte(b: number): void {
    if (this.bytePos >= this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.bytePos] = b & 0xff;
    this.bytePos += 1;
  }

  writeBit(bit: number): void {
    this.currentByte = (this.currentByte << 1) | (bit & 1);
    this.bitCount += 1;
    if (this.bitCount === 8) {
      this.pushByte(this.currentByte);
      this.currentByte = 0;
      this.bitCount = 0;
    }
  }

  writeBits(value: number, count: number): void {
    for (let i = count - 1; i >= 0; i -= 1) {
      this.writeBit((value >>> i) & 1);
    }
  }

  writeUnsignedGamma(n: number): void {
    const v = (n + 1) >>> 0;
    const bits = 31 - Math.clz32(v);
    for (let z = 0; z < bits; z += 1) this.writeBit(0);
    this.writeBit(1);
    if (bits > 0) this.writeBits(v & ((1 << bits) - 1), bits);
  }

  writeRice(mapped: number, k: number): void {
    const q = mapped >>> k;
    if (q < 16) {
      for (let i = 0; i < q; i += 1) this.writeBit(1);
      this.writeBit(0);
      if (k > 0) this.writeBits(mapped & ((1 << k) - 1), k);
    } else {
      for (let i = 0; i < 16; i += 1) this.writeBit(1);
      this.writeBit(0);
      this.writeUnsignedGamma(mapped - (16 << k));
    }
  }

  finish(): Uint8Array {
    if (this.bitCount > 0) {
      this.pushByte(this.currentByte << (8 - this.bitCount));
      this.currentByte = 0;
      this.bitCount = 0;
    }
    return this.buf.slice(0, this.bytePos);
  }
}

class BitReader {
  private readonly buf: Uint8Array;
  private bytePos = 0;
  private bitIdx = 8;
  private currentByte = 0;

  constructor(buf: Uint8Array) {
    this.buf = buf;
  }

  readBit(): number {
    if (this.bitIdx === 8) {
      this.currentByte = this.bytePos < this.buf.length ? this.buf[this.bytePos]! : 0;
      this.bytePos += 1;
      this.bitIdx = 0;
    }
    const bit = (this.currentByte >>> (7 - this.bitIdx)) & 1;
    this.bitIdx += 1;
    return bit;
  }

  readBits(count: number): number {
    let val = 0;
    for (let i = 0; i < count; i += 1) {
      val = (val << 1) | this.readBit();
    }
    return val >>> 0;
  }

  readUnsignedGamma(): number {
    let bits = 0;
    while (this.readBit() === 0 && bits < 28) bits += 1;
    let v = 1 << bits;
    if (bits > 0) v |= this.readBits(bits);
    return (v >>> 0) - 1;
  }

  readRice(k: number): number {
    let q = 0;
    while (q < 16 && this.readBit() === 1) q += 1;
    if (q < 16) {
      const r = k > 0 ? this.readBits(k) : 0;
      return ((q << k) | r) >>> 0;
    }
    // q === 16일 때는 탈출 구분자 0 비트를 하나 소비한 뒤 감마 나머지를 읽는다.
    this.readBit();
    return ((16 << k) + this.readUnsignedGamma()) >>> 0;
  }
}

function zigZagEncode(err: number): number {
  return err >= 0 ? err * 2 : -err * 2 - 1;
}

function zigZagDecode(mapped: number): number {
  return (mapped & 1) === 0 ? mapped >>> 1 : -((mapped + 1) >>> 1);
}

function computeAdaptiveRiceK(accA: number, accN: number): number {
  let k = 0;
  while ((accN << k) < accA && k < 10) k += 1;
  return k;
}

function encodeSubbandChunk(plane: Int32Array, width: number, height: number, useMed: boolean): Uint8Array {
  const len = width * height;
  if (len === 0) return new Uint8Array(0);
  const residuals = new Int32Array(len);
  if (useMed) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        const west = x > 0 ? plane[idx - 1]! : y > 0 ? plane[idx - width]! : 0;
        const north = y > 0 ? plane[idx - width]! : west;
        const northWest = x > 0 && y > 0 ? plane[idx - width - 1]! : west;
        residuals[idx] = plane[idx]! - predictLocoIMed(west, north, northWest);
      }
    }
  } else {
    residuals.set(plane);
  }

  const writer = new BitWriter(Math.max(32, len >> 1));
  let accA = 8;
  let accN = 2;
  let prevZero = false;
  let i = 0;

  while (i < len) {
    let err: number;
    let mappedOffset = 0;
    if (prevZero) {
      let run = 0;
      while (i + run < len && residuals[i + run] === 0) run += 1;
      writer.writeUnsignedGamma(run);
      i += run;
      if (i >= len) break;
      err = residuals[i]!;
      mappedOffset = 1;
    } else {
      err = residuals[i]!;
    }
    writer.writeRice(zigZagEncode(err) - mappedOffset, computeAdaptiveRiceK(accA, accN));
    accA += Math.abs(err);
    accN += 1;
    if (accN >= 64) {
      accA >>= 1;
      accN >>= 1;
    }
    prevZero = err === 0;
    i += 1;
  }
  return writer.finish();
}

function decodeSubbandChunk(bytes: Uint8Array, width: number, height: number, useMed: boolean): Int32Array {
  const len = width * height;
  const out = new Int32Array(len);
  if (len === 0 || bytes.length === 0) return out;

  const reader = new BitReader(bytes);
  let accA = 8;
  let accN = 2;
  let prevZero = false;
  let i = 0;

  while (i < len) {
    let mappedOffset = 0;
    if (prevZero) {
      i += Math.min(len - i, reader.readUnsignedGamma());
      if (i >= len) break;
      mappedOffset = 1;
    }
    const err = zigZagDecode(reader.readRice(computeAdaptiveRiceK(accA, accN)) + mappedOffset);
    out[i] = err;
    accA += Math.abs(err);
    accN += 1;
    if (accN >= 64) {
      accA >>= 1;
      accN >>= 1;
    }
    prevZero = err === 0;
    i += 1;
  }

  if (useMed) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        const west = x > 0 ? out[idx - 1]! : y > 0 ? out[idx - width]! : 0;
        const north = y > 0 ? out[idx - width]! : west;
        const northWest = x > 0 && y > 0 ? out[idx - width - 1]! : west;
        out[idx] = out[idx]! + predictLocoIMed(west, north, northWest);
      }
    }
  }
  return out;
}

function rgbaToYCoCgR(rgba: Uint8Array, pixelCount: number): { planes: Int32Array[]; opaqueAlpha: boolean } {
  const yPlane = new Int32Array(pixelCount);
  const coPlane = new Int32Array(pixelCount);
  const cgPlane = new Int32Array(pixelCount);
  const aPlane = new Int32Array(pixelCount);
  let opaqueAlpha = true;

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const r = rgba[off]!;
    const g = rgba[off + 1]!;
    const b = rgba[off + 2]!;
    const a = rgba[off + 3]!;
    const co = r - b;
    const t = b + (co >> 1);
    const cg = g - t;
    const y = t + (cg >> 1);
    yPlane[i] = y;
    coPlane[i] = co;
    cgPlane[i] = cg;
    aPlane[i] = a;
    if (a !== 255) opaqueAlpha = false;
  }
  return { planes: opaqueAlpha ? [yPlane, coPlane, cgPlane] : [yPlane, coPlane, cgPlane, aPlane], opaqueAlpha };
}

function yCoCgRToRgba(planes: readonly Int32Array[], pixelCount: number): Uint8Array {
  const rgba = new Uint8Array(pixelCount * 4);
  const yPlane = planes[0]!;
  const coPlane = planes[1]!;
  const cgPlane = planes[2]!;
  const aPlane = planes.length >= 4 ? planes[3]! : null;

  for (let i = 0; i < pixelCount; i += 1) {
    const y = yPlane[i]!;
    const co = coPlane[i]!;
    const cg = cgPlane[i]!;
    const t = y - (cg >> 1);
    const g = cg + t;
    const b = t - (co >> 1);
    const r = b + co;
    const off = i * 4;
    rgba[off] = clampByteInt(r);
    rgba[off + 1] = clampByteInt(g);
    rgba[off + 2] = clampByteInt(b);
    rgba[off + 3] = aPlane ? clampByteInt(aPlane[i]!) : 255;
  }
  return rgba;
}

function buildLevelDimensions(width: number, height: number, levels: number) {
  const dims: { w: number; h: number; lowW: number; lowH: number; highW: number; highH: number }[] = [];
  let cw = width;
  let ch = height;
  for (let l = 0; l < levels; l += 1) {
    const lowW = (cw + 1) >> 1;
    const highW = cw >> 1;
    const lowH = (ch + 1) >> 1;
    const highH = ch >> 1;
    dims.push({ w: cw, h: ch, lowW, lowH, highW, highH });
    cw = lowW;
    ch = lowH;
  }
  return dims;
}

function writeU32LE(dst: Uint8Array, off: number, val: number): void {
  const u = val >>> 0;
  dst[off] = u & 0xff;
  dst[off + 1] = (u >>> 8) & 0xff;
  dst[off + 2] = (u >>> 16) & 0xff;
  dst[off + 3] = (u >>> 24) & 0xff;
}

function readU32LE(src: Uint8Array, off: number): number {
  return (
    (src[off]! | (src[off + 1]! << 8) | (src[off + 2]! << 16) | (src[off + 3]! << 24)) >>> 0
  );
}

function encodeWithFixedLevels(
  planes: readonly Int32Array[],
  opaqueAlpha: boolean,
  width: number,
  height: number,
  levels: number,
  checksum: number,
  ratioMin: number,
  ratioMax: number,
) {
  const channelCount = planes.length;
  const perChannelPyramids: IntegerHaar2DSubbands[][] = [];
  for (let c = 0; c < channelCount; c += 1) {
    const channelLevels: IntegerHaar2DSubbands[] = [];
    let current = planes[c]!;
    let cw = width;
    let ch = height;
    for (let l = 0; l < levels; l += 1) {
      const sb = forwardHaar2DInt(current, cw, ch);
      channelLevels.push(sb);
      current = sb.ll;
      cw = sb.lowWidth;
      ch = sb.lowHeight;
    }
    perChannelPyramids.push(channelLevels);
  }

  const chunks: Uint8Array[] = [];
  for (let c = 0; c < channelCount; c += 1) {
    const top = perChannelPyramids[c]![levels - 1]!;
    chunks.push(encodeSubbandChunk(top.ll, top.lowWidth, top.lowHeight, true));
  }
  for (let l = levels - 1; l >= 0; l -= 1) {
    for (let c = 0; c < channelCount; c += 1) {
      const sb = perChannelPyramids[c]![l]!;
      chunks.push(encodeSubbandChunk(sb.hl, sb.highWidth, sb.lowHeight, false));
      chunks.push(encodeSubbandChunk(sb.lh, sb.lowWidth, sb.highHeight, false));
      chunks.push(encodeSubbandChunk(sb.hh, sb.highWidth, sb.highHeight, false));
    }
  }

  let totalBytes = HEADER_FIXED_BYTES;
  const cumulativeOffsets: number[] = [];
  for (const chunk of chunks) {
    totalBytes += 4 + chunk.byteLength;
    cumulativeOffsets.push(totalBytes);
  }

  const targetMid = (ratioMin + ratioMax) * 0.5;
  let bestCoarseCount = channelCount;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let k = channelCount; k <= chunks.length; k += 1) {
    const ratio = cumulativeOffsets[k - 1]! / totalBytes;
    const inBandPenalty = ratio >= ratioMin && ratio <= ratioMax ? 0 : 10;
    const score = inBandPenalty + Math.abs(ratio - targetMid);
    if (score < bestScore) {
      bestScore = score;
      bestCoarseCount = k;
    }
  }

  const bitstream = new Uint8Array(totalBytes);
  bitstream[0] = MAGIC_B0;
  bitstream[1] = MAGIC_B1;
  bitstream[2] = MAGIC_B2;
  bitstream[3] = MAGIC_B3;
  bitstream[4] = width & 0xff;
  bitstream[5] = (width >>> 8) & 0xff;
  bitstream[6] = height & 0xff;
  bitstream[7] = (height >>> 8) & 0xff;
  bitstream[8] = levels & 0xff;
  bitstream[9] = opaqueAlpha ? FLAG_OPAQUE_ALPHA : 0;
  bitstream[10] = chunks.length & 0xff;
  bitstream[11] = (chunks.length >>> 8) & 0xff;
  bitstream[12] = bestCoarseCount & 0xff;
  bitstream[13] = (bestCoarseCount >>> 8) & 0xff;
  writeU32LE(bitstream, 14, checksum);
  bitstream[18] = channelCount & 0xff;
  bitstream[19] = 0;

  let cursor = HEADER_FIXED_BYTES;
  for (const chunk of chunks) {
    writeU32LE(bitstream, cursor, chunk.byteLength);
    cursor += 4;
    bitstream.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  const coarsePreviewByteLength = cumulativeOffsets[bestCoarseCount - 1]!;
  return {
    bitstream,
    levels,
    totalChunks: chunks.length,
    coarseChunkCount: bestCoarseCount,
    coarsePreviewByteLength,
    coarsePreviewByteRatio: coarsePreviewByteLength / bitstream.byteLength,
  };
}

/**
 * RGBA 컷 버퍼를 가역 정수 Haar 웨이블릿 + LOCO-I(MED) 점진적 무손실 패킷으로 부호화한다.
 */
export function encodeProgressiveCutLossless(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: ProgressiveCutEncodeOptions = {},
): ProgressiveCutEncodedPacket {
  const t0 = nowMs();
  if (width < 1 || height < 1 || rgba.byteLength !== width * height * 4) {
    throw new RangeError(`유효하지 않은 RGBA 입력 크기: ${width}x${height} (bytes=${rgba.byteLength})`);
  }
  const ratioMin = options.targetCoarseByteRatioMin ?? 0.06;
  const ratioMax = options.targetCoarseByteRatioMax ?? 0.1;
  const checksum = computeCutFnv1a32(rgba);
  const { planes, opaqueAlpha } = rgbaToYCoCgR(rgba, width * height);

  const candidateLevels: number[] = [];
  if (options.decompositionLevels === undefined || options.decompositionLevels === "auto") {
    const minDim = Math.min(width, height);
    if (minDim >= 16) candidateLevels.push(3, 2);
    else if (minDim >= 4) candidateLevels.push(2, 1);
    else candidateLevels.push(1);
  } else {
    candidateLevels.push(options.decompositionLevels);
  }

  let best = encodeWithFixedLevels(planes, opaqueAlpha, width, height, candidateLevels[0]!, checksum, ratioMin, ratioMax);
  for (let i = 1; i < candidateLevels.length; i += 1) {
    const cand = encodeWithFixedLevels(planes, opaqueAlpha, width, height, candidateLevels[i]!, checksum, ratioMin, ratioMax);
    const bestInWindow = best.coarsePreviewByteRatio >= ratioMin && best.coarsePreviewByteRatio <= ratioMax;
    const candInWindow = cand.coarsePreviewByteRatio >= ratioMin && cand.coarsePreviewByteRatio <= ratioMax;
    if (candInWindow && !bestInWindow) {
      best = cand;
    } else if (candInWindow === bestInWindow && cand.bitstream.byteLength < best.bitstream.byteLength) {
      best = cand;
    }
  }

  return {
    bitstream: best.bitstream,
    width,
    height,
    decompositionLevels: best.levels,
    totalChunks: best.totalChunks,
    coarseChunkCount: best.coarseChunkCount,
    coarsePreviewByteLength: best.coarsePreviewByteLength,
    coarsePreviewByteRatio: best.coarsePreviewByteRatio,
    uncompressedByteLength: rgba.byteLength,
    compressionRatio: rgba.byteLength / Math.max(1, best.bitstream.byteLength),
    checksumFnv1a32: checksum,
    elapsedMs: Math.max(0, nowMs() - t0),
  };
}

/**
 * 앞쪽 일부만 도착한 부분 비트스트림(예: 6~10% Coarse LL 구간) 또는 전체 비트스트림으로부터
 * 가용한 모든 웨이블릿 부대역을 복원해 전체 해상도 RGBA 이미지를 생성한다.
 */
export function decodeProgressiveCutPreview(partialBitstream: Uint8Array): ProgressiveCutDecodeResult {
  const t0 = nowMs();
  if (
    partialBitstream.byteLength < HEADER_FIXED_BYTES ||
    partialBitstream[0] !== MAGIC_B0 ||
    partialBitstream[1] !== MAGIC_B1 ||
    partialBitstream[2] !== MAGIC_B2 ||
    partialBitstream[3] !== MAGIC_B3
  ) {
    throw new Error("유효하지 않은 WH15 점진적 웨이블릿 패킷 헤더");
  }
  const width = partialBitstream[4]! | (partialBitstream[5]! << 8);
  const height = partialBitstream[6]! | (partialBitstream[7]! << 8);
  const levels = partialBitstream[8]!;
  const flags = partialBitstream[9]!;
  const totalChunks = partialBitstream[10]! | (partialBitstream[11]! << 8);
  const expectedChecksum = readU32LE(partialBitstream, 14);
  const channelCount = (flags & FLAG_OPAQUE_ALPHA) !== 0 ? 3 : 4;

  const dims = buildLevelDimensions(width, height, levels);
  const rawChunks: Uint8Array[] = [];
  let cursor = HEADER_FIXED_BYTES;
  while (rawChunks.length < totalChunks && cursor + 4 <= partialBitstream.byteLength) {
    const chunkLen = readU32LE(partialBitstream, cursor);
    if (cursor + 4 + chunkLen > partialBitstream.byteLength) break;
    rawChunks.push(partialBitstream.subarray(cursor + 4, cursor + 4 + chunkLen));
    cursor += 4 + chunkLen;
  }

  const nextChunkOrZeros = (w: number, h: number, useMed: boolean): Int32Array => {
    const res = chunkIdx < rawChunks.length ? decodeSubbandChunk(rawChunks[chunkIdx]!, w, h, useMed) : new Int32Array(w * h);
    chunkIdx += 1;
    return res;
  };
  const topDim = dims[levels - 1]!;
  const currentLLs: Int32Array[] = [];
  let chunkIdx = 0;
  for (let c = 0; c < channelCount; c += 1) {
    currentLLs.push(nextChunkOrZeros(topDim.lowW, topDim.lowH, true));
  }
  for (let l = levels - 1; l >= 0; l -= 1) {
    const d = dims[l]!;
    for (let c = 0; c < channelCount; c += 1) {
      const hl = nextChunkOrZeros(d.highW, d.lowH, false);
      const lh = nextChunkOrZeros(d.lowW, d.highH, false);
      const hh = nextChunkOrZeros(d.highW, d.highH, false);
      currentLLs[c] = inverseHaar2DInt({
        width: d.w, height: d.h, lowWidth: d.lowW, lowHeight: d.lowH, highWidth: d.highW, highHeight: d.highH,
        ll: currentLLs[c]!, hl, lh, hh,
      });
    }
  }

  const rgba = yCoCgRToRgba(currentLLs, width * height);
  const isCompleteLossless = rawChunks.length === totalChunks;
  const checksumVerified = isCompleteLossless && computeCutFnv1a32(rgba) === expectedChecksum;

  return {
    width,
    height,
    rgba,
    decodedChunks: rawChunks.length,
    totalChunks,
    isCompleteLossless,
    checksumVerified,
    elapsedMs: Math.max(0, nowMs() - t0),
  };
}

/**
 * 전체 점진적 패킷을 완전 무손실 복원하고 FNV-1a32 비트 일치 체크섬을 강제 검증한다.
 */
export function decodeProgressiveCutLossless(fullBitstream: Uint8Array): ProgressiveCutDecodeResult {
  const result = decodeProgressiveCutPreview(fullBitstream);
  if (!result.isCompleteLossless) {
    throw new Error(`불완전한 비트스트림: ${result.decodedChunks}/${result.totalChunks} 청크만 존재`);
  }
  if (!result.checksumVerified) {
    throw new Error("무손실 복원 체크섬 불일치");
  }
  return result;
}
