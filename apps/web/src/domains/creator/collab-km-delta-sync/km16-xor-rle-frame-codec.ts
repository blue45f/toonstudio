/**
 * 16파장 Kubelka-Munk 분광 광학 혼색 · 평면 XOR 타일 델타 · RLE · LEB128 가변정수 ·
 * 결정론적 OpId 전순서 및 Yjs/WebRTC 호환 바이너리 프레임 코덱.
 */

export const COLLAB_KM_DELTA_PROTOCOL_VERSION = 1 as const;
export const COLLAB_KM_DELTA_FRAME_MAGIC = Object.freeze([0x54, 0x53, 0x4b, 0x4d] as const);
export const KM16_BAND_COUNT = 16 as const;
export const DEFAULT_KM_TILE_SIZE = 64 as const;
export const MIN_REQUIRED_COMPRESSION_RATIO = 8 as const;

const KM16_REFLECTANCE_FLOOR = 0.002;
const KM16_CONCENTRATION_GAMMA = 1.5;
const RLE_TAG_ZERO = 0;
const RLE_TAG_REPEAT = 1;
const RLE_TAG_LITERAL = 2;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/** 가시광선 16개 중심 파장(nm, 390..705nm, 21nm 등간격). */
export const KM16_WAVELENGTHS_NM: readonly number[] = Object.freeze([
  390, 411, 432, 453, 474, 495, 516, 537, 558, 579, 600, 621, 642, 663, 684, 705,
]);

/** 모든 파장에서 B_R[i] + B_G[i] + B_B[i] = 1.0을 만족하는 16파장 원색 반사율 기저. */
export const KM16_BASIS_R: readonly number[] = Object.freeze([
  0.16, 0.12, 0.04, 0.02, 0.02, 0.02, 0.03, 0.05, 0.22, 0.52, 0.8, 0.91, 0.93, 0.92, 0.9, 0.88,
]);
export const KM16_BASIS_G: readonly number[] = Object.freeze([
  0.02, 0.03, 0.06, 0.1, 0.26, 0.5, 0.68, 0.81, 0.72, 0.46, 0.18, 0.07, 0.04, 0.04, 0.03, 0.03,
]);
export const KM16_BASIS_B: readonly number[] = Object.freeze([
  0.82, 0.85, 0.9, 0.88, 0.72, 0.48, 0.29, 0.14, 0.06, 0.02, 0.02, 0.02, 0.03, 0.04, 0.07, 0.09,
]);

const KM16_PERCEPTUAL_WEIGHTS: readonly number[] = Object.freeze([
  0.35, 0.55, 0.75, 0.95, 1.05, 1.15, 1.25, 1.4, 1.35, 1.25, 1.15, 1.0, 0.85, 0.7, 0.55, 0.4,
]);

function buildKm16ReconstructMatrix(): readonly [readonly number[], readonly number[], readonly number[]] {
  const basis = [KM16_BASIS_R, KM16_BASIS_G, KM16_BASIS_B] as const;
  const gram: [number[], number[], number[]] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let r = 0; r < 3; r += 1) {
    const br = basis[r];
    for (let c = 0; c < 3; c += 1) {
      const bc = basis[c];
      let sum = 0;
      for (let i = 0; i < KM16_BAND_COUNT; i += 1) {
        sum += (br?.[i] ?? 0) * (KM16_PERCEPTUAL_WEIGHTS[i] ?? 1) * (bc?.[i] ?? 0);
      }
      gram[r][c] = sum;
    }
  }
  const [a, b, c] = gram[0];
  const [d, e, f] = gram[1];
  const [g, h, iv] = gram[2];
  const c00 = e * iv - f * h;
  const c01 = -(b * iv - c * h);
  const c02 = b * f - c * e;
  const c10 = -(d * iv - f * g);
  const c11 = a * iv - c * g;
  const c12 = -(a * f - c * d);
  const c20 = d * h - e * g;
  const c21 = -(a * h - b * g);
  const c22 = a * e - b * d;
  const det = a * c00 + b * c10 + c * c20;
  const inv = [
    [c00 / det, c01 / det, c02 / det],
    [c10 / det, c11 / det, c12 / det],
    [c20 / det, c21 / det, c22 / det],
  ] as const;

  const out: [number[], number[], number[]] = [[], [], []];
  for (let r = 0; r < 3; r += 1) {
    for (let i = 0; i < KM16_BAND_COUNT; i += 1) {
      let s = 0;
      for (let k = 0; k < 3; k += 1) {
        s += (inv[r]?.[k] ?? 0) * (basis[k]?.[i] ?? 0) * (KM16_PERCEPTUAL_WEIGHTS[i] ?? 1);
      }
      out[r].push(s);
    }
  }
  return Object.freeze([Object.freeze(out[0]), Object.freeze(out[1]), Object.freeze(out[2])] as const);
}

const KM16_RECONSTRUCT_MATRIX = buildKm16ReconstructMatrix();

export interface Km16Spectrum {
  readonly bands: readonly number[];
  readonly luminance: number;
}

export interface DeterministicOpId {
  readonly lamport: number;
  readonly peerId: string;
  readonly opSeq: number;
}

export interface KmStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

export interface KmStrokeInput {
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly pigmentRgba: readonly [number, number, number, number];
  readonly wetness: number;
  readonly opacity: number;
  readonly radiusPx: number;
  readonly points: readonly KmStrokePoint[];
}

export interface KmStrokeCommand extends KmStrokeInput {
  readonly opId: DeterministicOpId;
  readonly workId: string;
  readonly tileSize: number;
}

export interface EncodedKmDeltaFrame {
  readonly bytes: Uint8Array;
  readonly opId: DeterministicOpId;
  readonly opKey: string;
  readonly workId: string;
  readonly layerId: string;
  readonly tileKey: string;
  readonly rawRgbaBytes: number;
  readonly compressedBytes: number;
  readonly compressionRatio: number;
  readonly baseTileChecksum: number;
  readonly afterTileChecksum: number;
  readonly frameChecksum32: number;
}

export interface DecodedKmDeltaFrame {
  readonly version: number;
  readonly opId: DeterministicOpId;
  readonly opKey: string;
  readonly workId: string;
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly tileSize: number;
  readonly baseTileChecksum: number;
  readonly afterTileChecksum: number;
  readonly pigmentSpectrum16: Uint8Array;
  readonly pigmentRgba: readonly [number, number, number, number];
  readonly wetness: number;
  readonly opacity: number;
  readonly radiusPx: number;
  readonly points: readonly KmStrokePoint[];
  readonly rleXorDelta: Uint8Array;
  readonly frameChecksum32: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function clampByte(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 255 ? 255 : Math.round(value);
}

function srgb8ToLinear(channel: number): number {
  const x = clamp01(channel / 255);
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function linearToSrgb8(linear: number): number {
  const x = clamp01(linear);
  const s = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return clampByte(s * 255);
}

function reflectanceToKs(r: number): number {
  const rc = Math.max(KM16_REFLECTANCE_FLOOR, Math.min(1, r));
  const diff = 1 - rc;
  return (diff * diff) / (2 * rc);
}

function ksToReflectance(ks: number): number {
  const q = Number.isFinite(ks) && ks > 0 ? ks : 0;
  return 1 / (1 + q + Math.sqrt(q * q + 2 * q));
}

export function srgb8ToKm16Spectrum(r: number, g: number, b: number): Km16Spectrum {
  const lr = srgb8ToLinear(r);
  const lg = srgb8ToLinear(g);
  const lb = srgb8ToLinear(b);
  const bands: number[] = new Array<number>(KM16_BAND_COUNT);
  for (let i = 0; i < KM16_BAND_COUNT; i += 1) {
    const ref = lr * (KM16_BASIS_R[i] ?? 0) + lg * (KM16_BASIS_G[i] ?? 0) + lb * (KM16_BASIS_B[i] ?? 0);
    bands[i] = clamp01(ref);
  }
  const luminance = Math.max(KM16_REFLECTANCE_FLOOR, 0.2126 * lr + 0.7152 * lg + 0.0722 * lb);
  return { bands, luminance };
}

export function km16SpectrumToSrgb8(bands: readonly number[]): readonly [number, number, number] {
  const mR = KM16_RECONSTRUCT_MATRIX[0];
  const mG = KM16_RECONSTRUCT_MATRIX[1];
  const mB = KM16_RECONSTRUCT_MATRIX[2];
  let lr = 0;
  let lg = 0;
  let lb = 0;
  for (let i = 0; i < KM16_BAND_COUNT; i += 1) {
    const v = bands[i] ?? 0;
    lr += (mR[i] ?? 0) * v;
    lg += (mG[i] ?? 0) * v;
    lb += (mB[i] ?? 0) * v;
  }
  return [linearToSrgb8(lr), linearToSrgb8(lg), linearToSrgb8(lb)] as const;
}

export function quantizeKm16Spectrum(spectrum: Km16Spectrum): Uint8Array {
  const out = new Uint8Array(KM16_BAND_COUNT);
  for (let i = 0; i < KM16_BAND_COUNT; i += 1) {
    out[i] = clampByte((spectrum.bands[i] ?? 0) * 255);
  }
  return out;
}

export function dequantizeKm16Spectrum(bytes: Uint8Array): Km16Spectrum {
  const bands: number[] = new Array<number>(KM16_BAND_COUNT);
  for (let i = 0; i < KM16_BAND_COUNT; i += 1) {
    bands[i] = clamp01((bytes[i] ?? 0) / 255);
  }
  const [r, g, b] = km16SpectrumToSrgb8(bands);
  const lum = Math.max(
    KM16_REFLECTANCE_FLOOR,
    0.2126 * srgb8ToLinear(r) + 0.7152 * srgb8ToLinear(g) + 0.0722 * srgb8ToLinear(b),
  );
  return { bands, luminance: lum };
}

/** 와이어 직렬화 양자화 격자(u8·0.25px·1/16px)에 스트로크 입력을 정규화해 빠른 XOR 경로와 역순 재생의 비트 동등성을 보장한다. */
export function canonicalizeKmStrokeInput(stroke: KmStrokeInput): KmStrokeInput {
  return {
    layerId: stroke.layerId,
    tileX: Math.trunc(stroke.tileX),
    tileY: Math.trunc(stroke.tileY),
    pigmentRgba: [
      clampByte(stroke.pigmentRgba[0]),
      clampByte(stroke.pigmentRgba[1]),
      clampByte(stroke.pigmentRgba[2]),
      clampByte(stroke.pigmentRgba[3]),
    ] as const,
    wetness: clampByte(clamp01(stroke.wetness) * 255) / 255,
    opacity: clampByte(clamp01(stroke.opacity) * 255) / 255,
    radiusPx: Math.round(Math.max(1, stroke.radiusPx) * 16) / 16,
    points: stroke.points.map((pt) => ({
      x: Math.round(pt.x * 4) / 4,
      y: Math.round(pt.y * 4) / 4,
      pressure: clampByte(clamp01(pt.pressure) * 255) / 255,
    })),
  };
}

export function mixKm16OpticalRgba(
  dstRgba: readonly [number, number, number, number],
  srcRgba: readonly [number, number, number, number],
  ratio: number,
  wetness = 1,
): readonly [number, number, number, number] {
  const t = clamp01(ratio);
  if (t <= 0) return [clampByte(dstRgba[0]), clampByte(dstRgba[1]), clampByte(dstRgba[2]), clampByte(dstRgba[3])];
  if (t >= 1) return [clampByte(srcRgba[0]), clampByte(srcRgba[1]), clampByte(srcRgba[2]), clampByte(srcRgba[3])];

  const specA = srgb8ToKm16Spectrum(dstRgba[0], dstRgba[1], dstRgba[2]);
  const specB = srgb8ToKm16Spectrum(srcRgba[0], srcRgba[1], srcRgba[2]);
  const cA = Math.pow(1 - t, KM16_CONCENTRATION_GAMMA) * specA.luminance;
  const cB = Math.pow(t, KM16_CONCENTRATION_GAMMA) * specB.luminance;
  const invTotal = 1 / Math.max(1e-7, cA + cB);
  const mixedBands: number[] = new Array<number>(KM16_BAND_COUNT);
  for (let i = 0; i < KM16_BAND_COUNT; i += 1) {
    const ksMix = (reflectanceToKs(specA.bands[i] ?? KM16_REFLECTANCE_FLOOR) * cA
      + reflectanceToKs(specB.bands[i] ?? KM16_REFLECTANCE_FLOOR) * cB) * invTotal;
    mixedBands[i] = ksToReflectance(ksMix);
  }
  const [kmR, kmG, kmB] = km16SpectrumToSrgb8(mixedBands);
  const wet = clamp01(wetness);
  return [
    clampByte(kmR * wet + (dstRgba[0] * (1 - t) + srcRgba[0] * t) * (1 - wet)),
    clampByte(kmG * wet + (dstRgba[1] * (1 - t) + srcRgba[1] * t) * (1 - wet)),
    clampByte(kmB * wet + (dstRgba[2] * (1 - t) + srcRgba[2] * t) * (1 - wet)),
    clampByte(Math.max(dstRgba[3], dstRgba[3] * (1 - t) + srcRgba[3] * t)),
  ] as const;
}

export function createBlankTileRgba(tileSize: number = DEFAULT_KM_TILE_SIZE): Uint8Array {
  const buf = new Uint8Array(tileSize * tileSize * 4);
  buf.fill(252);
  for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
  return buf;
}

/** 16파장 Kubelka-Munk 스트로크를 결정론적으로 타일 RGBA 버퍼에 래스터화한다. */
export function rasterizeKm16StrokeOnTile(
  baseTileRgba: Uint8Array,
  tileSize: number,
  stroke: KmStrokeInput,
): Uint8Array {
  const out = new Uint8Array(baseTileRgba);
  const points = stroke.points;
  if (points.length === 0) return out;

  const baseRadius = Math.max(1, Math.min(12, stroke.radiusPx));
  const baseOpacity = clamp01(stroke.opacity);
  const wetness = clamp01(stroke.wetness);
  const stamp = (cx: number, cy: number, pressure: number): void => {
    const r = Math.max(1, baseRadius * (0.45 + 0.55 * clamp01(pressure)));
    const minX = Math.max(0, Math.floor(cx - r));
    const maxX = Math.min(tileSize - 1, Math.ceil(cx + r));
    const minY = Math.max(0, Math.floor(cy - r));
    const maxY = Math.min(tileSize - 1, Math.ceil(cy + r));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dist = Math.hypot(x - cx, y - cy);
        if (dist > r) continue;
        const falloff = 1 - (dist / (r + 0.25)) ** 2;
        const alpha = clamp01(falloff * baseOpacity * (0.5 + 0.5 * clamp01(pressure)));
        if (alpha <= 0.01) continue;
        const idx = (y * tileSize + x) * 4;
        const mixed = mixKm16OpticalRgba(
          [out[idx] ?? 252, out[idx + 1] ?? 252, out[idx + 2] ?? 252, out[idx + 3] ?? 255],
          stroke.pigmentRgba,
          alpha,
          wetness,
        );
        out[idx] = mixed[0];
        out[idx + 1] = mixed[1];
        out[idx + 2] = mixed[2];
        out[idx + 3] = mixed[3];
      }
    }
  };

  for (let i = 0; i < points.length; i += 1) {
    const curr = points[i];
    if (!curr) continue;
    if (i === 0) {
      stamp(curr.x, curr.y, curr.pressure);
      continue;
    }
    const prev = points[i - 1];
    if (!prev) continue;
    const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const steps = Math.max(1, Math.ceil(dist / Math.max(1, baseRadius * 0.45)));
    for (let s = 1; s <= steps; s += 1) {
      const f = s / steps;
      stamp(prev.x + (curr.x - prev.x) * f, prev.y + (curr.y - prev.y) * f, prev.pressure + (curr.pressure - prev.pressure) * f);
    }
  }
  return out;
}

export function computeFnv1a32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function formatDigestHex(checksum32: number): string {
  return (checksum32 >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export function encodeUleb128(value: number, out: number[]): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`ULEB128 값은 0 이상의 안전한 정수여야 합니다: ${value}`);
  }
  let v = value;
  do {
    let byte = v % 128;
    v = Math.floor(v / 128);
    if (v > 0) byte |= 0x80;
    out.push(byte);
  } while (v > 0);
}

export function decodeUleb128(bytes: Uint8Array, offset: number): { readonly value: number; readonly nextOffset: number } {
  let result = 0;
  let multiplier = 1;
  let pos = offset;
  for (let count = 0; count < 8; count += 1) {
    if (pos >= bytes.length) throw new RangeError("ULEB128 바이트 스트림이 조기 종료되었습니다.");
    const byte = bytes[pos] ?? 0;
    pos += 1;
    result += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) {
      if (!Number.isSafeInteger(result)) throw new RangeError("ULEB128 안전 정수 범위를 초과했습니다.");
      return { value: result, nextOffset: pos };
    }
    multiplier *= 128;
  }
  throw new RangeError("ULEB128 인코딩 길이가 8바이트 상한을 초과했습니다.");
}

export function encodeSleb128(value: number, out: number[]): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`SLEB128 값은 안전한 정수여야 합니다: ${value}`);
  }
  encodeUleb128(value >= 0 ? value * 2 : -value * 2 - 1, out);
}

export function decodeSleb128(bytes: Uint8Array, offset: number): { readonly value: number; readonly nextOffset: number } {
  const { value: zigzag, nextOffset } = decodeUleb128(bytes, offset);
  return { value: zigzag % 2 === 0 ? zigzag / 2 : -((zigzag + 1) / 2), nextOffset };
}

/** RGBA 타일 두 상태의 채널 평면화 XOR 델타를 RLE + LEB128로 무손실 압축한다. */
export function compressXorTileDeltaRleLeb128(beforeRgba: Uint8Array, afterRgba: Uint8Array): Uint8Array {
  if (beforeRgba.length !== afterRgba.length || beforeRgba.length % 4 !== 0) {
    throw new RangeError("XOR 타일 델타 압축 대상 RGBA 버퍼 길이가 일치하지 않거나 4의 배수가 아닙니다.");
  }
  const pixelCount = beforeRgba.length / 4;
  const planarXor = new Uint8Array(beforeRgba.length);
  for (let p = 0; p < pixelCount; p += 1) {
    const base = p * 4;
    planarXor[p] = (beforeRgba[base] ?? 0) ^ (afterRgba[base] ?? 0);
    planarXor[pixelCount + p] = (beforeRgba[base + 1] ?? 0) ^ (afterRgba[base + 1] ?? 0);
    planarXor[pixelCount * 2 + p] = (beforeRgba[base + 2] ?? 0) ^ (afterRgba[base + 2] ?? 0);
    planarXor[pixelCount * 3 + p] = (beforeRgba[base + 3] ?? 0) ^ (afterRgba[base + 3] ?? 0);
  }

  const out: number[] = [];
  let i = 0;
  const len = planarXor.length;
  while (i < len) {
    const curr = planarXor[i] ?? 0;
    if (curr === 0) {
      let run = 1;
      while (i + run < len && (planarXor[i + run] ?? 0) === 0) run += 1;
      encodeUleb128((run - 1) * 4 + RLE_TAG_ZERO, out);
      i += run;
      continue;
    }
    let rep = 1;
    while (i + rep < len && (planarXor[i + rep] ?? 0) === curr) rep += 1;
    if (rep >= 3) {
      encodeUleb128((rep - 1) * 4 + RLE_TAG_REPEAT, out);
      out.push(curr);
      i += rep;
      continue;
    }
    const litStart = i;
    i += 1;
    while (i < len) {
      const b = planarXor[i] ?? 0;
      if (b === 0) break;
      if (i + 2 < len && (planarXor[i + 1] ?? 0) === b && (planarXor[i + 2] ?? 0) === b) break;
      i += 1;
    }
    encodeUleb128((i - litStart - 1) * 4 + RLE_TAG_LITERAL, out);
    for (let k = litStart; k < i; k += 1) out.push(planarXor[k] ?? 0);
  }
  return Uint8Array.from(out);
}

/** RLE + LEB128 압축 평면 XOR 델타를 원본 RGBA 순서의 XOR 바이트 배열로 무손실 복원한다. */
export function decompressXorTileDeltaRleLeb128(encoded: Uint8Array, expectedByteLength: number): Uint8Array {
  if (expectedByteLength % 4 !== 0 || expectedByteLength < 0) {
    throw new RangeError("복원 대상 RGBA 바이트 길이는 0 이상의 4배수여야 합니다.");
  }
  const planarXor = new Uint8Array(expectedByteLength);
  let srcOffset = 0;
  let dstOffset = 0;
  while (srcOffset < encoded.length) {
    const { value: header, nextOffset } = decodeUleb128(encoded, srcOffset);
    srcOffset = nextOffset;
    const tag = header % 4;
    const count = Math.floor(header / 4) + 1;
    if (dstOffset + count > expectedByteLength) {
      throw new RangeError("RLE+LEB128 델타 복원 길이가 타일 크기를 초과했습니다.");
    }
    if (tag === RLE_TAG_ZERO) {
      dstOffset += count;
    } else if (tag === RLE_TAG_REPEAT) {
      if (srcOffset >= encoded.length) throw new RangeError("REPEAT 토큰의 바이트 값이 누락되었습니다.");
      planarXor.fill(encoded[srcOffset] ?? 0, dstOffset, dstOffset + count);
      srcOffset += 1;
      dstOffset += count;
    } else if (tag === RLE_TAG_LITERAL) {
      if (srcOffset + count > encoded.length) throw new RangeError("LITERAL 토큰 길이가 버퍼를 초과했습니다.");
      planarXor.set(encoded.subarray(srcOffset, srcOffset + count), dstOffset);
      srcOffset += count;
      dstOffset += count;
    } else {
      throw new RangeError(`알 수 없는 RLE 태그입니다: ${tag}`);
    }
  }
  if (dstOffset !== expectedByteLength) {
    throw new RangeError(`복원 바이트 길이가 일치하지 않습니다: ${dstOffset} !== ${expectedByteLength}`);
  }

  const pixelCount = expectedByteLength / 4;
  const interleavedXor = new Uint8Array(expectedByteLength);
  for (let p = 0; p < pixelCount; p += 1) {
    const base = p * 4;
    interleavedXor[base] = planarXor[p] ?? 0;
    interleavedXor[base + 1] = planarXor[pixelCount + p] ?? 0;
    interleavedXor[base + 2] = planarXor[pixelCount * 2 + p] ?? 0;
    interleavedXor[base + 3] = planarXor[pixelCount * 3 + p] ?? 0;
  }
  return interleavedXor;
}

export function applyXorTileDelta(baseRgba: Uint8Array, compressedDelta: Uint8Array): Uint8Array {
  const xorBytes = decompressXorTileDeltaRleLeb128(compressedDelta, baseRgba.length);
  const out = new Uint8Array(baseRgba.length);
  for (let i = 0; i < baseRgba.length; i += 1) {
    out[i] = (baseRgba[i] ?? 0) ^ (xorBytes[i] ?? 0);
  }
  return out;
}

export function compareDeterministicOpId(a: DeterministicOpId, b: DeterministicOpId): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  if (a.peerId !== b.peerId) return a.peerId < b.peerId ? -1 : 1;
  return a.opSeq - b.opSeq;
}

export function formatOpIdKey(opId: DeterministicOpId): string {
  return `${String(opId.lamport).padStart(12, "0")}:${opId.peerId}:${String(opId.opSeq).padStart(8, "0")}`;
}

export function makeKmTileKey(layerId: string, tileX: number, tileY: number): string {
  return `${layerId}:${tileX}:${tileY}`;
}

function writeStringLeb128(text: string, out: number[]): void {
  const utf8 = TEXT_ENCODER.encode(text);
  encodeUleb128(utf8.length, out);
  for (let i = 0; i < utf8.length; i += 1) out.push(utf8[i] ?? 0);
}

function readStringLeb128(bytes: Uint8Array, offset: number): { readonly text: string; readonly nextOffset: number } {
  const { value: len, nextOffset } = decodeUleb128(bytes, offset);
  if (nextOffset + len > bytes.length) throw new RangeError("문자열 길이가 바이너리 프레임 범위를 초과했습니다.");
  return { text: TEXT_DECODER.decode(bytes.subarray(nextOffset, nextOffset + len)), nextOffset: nextOffset + len };
}

export function encodeKmDeltaBinaryFrame(input: {
  readonly stroke: KmStrokeCommand;
  readonly beforeTileRgba: Uint8Array;
  readonly afterTileRgba: Uint8Array;
}): EncodedKmDeltaFrame {
  const { stroke, beforeTileRgba, afterTileRgba } = input;
  const rleXorDelta = compressXorTileDeltaRleLeb128(beforeTileRgba, afterTileRgba);
  const baseTileChecksum = computeFnv1a32(beforeTileRgba);
  const afterTileChecksum = computeFnv1a32(afterTileRgba);
  const spectrum16 = quantizeKm16Spectrum(
    srgb8ToKm16Spectrum(stroke.pigmentRgba[0], stroke.pigmentRgba[1], stroke.pigmentRgba[2]),
  );

  const body: number[] = [...COLLAB_KM_DELTA_FRAME_MAGIC, COLLAB_KM_DELTA_PROTOCOL_VERSION, 0x01];
  encodeUleb128(stroke.opId.lamport, body);
  writeStringLeb128(stroke.opId.peerId, body);
  encodeUleb128(stroke.opId.opSeq, body);
  writeStringLeb128(stroke.workId, body);
  writeStringLeb128(stroke.layerId, body);
  encodeSleb128(stroke.tileX, body);
  encodeSleb128(stroke.tileY, body);
  encodeUleb128(stroke.tileSize, body);
  encodeUleb128(baseTileChecksum, body);
  encodeUleb128(afterTileChecksum, body);

  for (let i = 0; i < KM16_BAND_COUNT; i += 1) body.push(spectrum16[i] ?? 0);
  body.push(
    clampByte(stroke.pigmentRgba[0]),
    clampByte(stroke.pigmentRgba[1]),
    clampByte(stroke.pigmentRgba[2]),
    clampByte(stroke.pigmentRgba[3]),
    clampByte(stroke.wetness * 255),
    clampByte(stroke.opacity * 255),
  );
  encodeUleb128(Math.round(Math.max(1, stroke.radiusPx) * 16), body);
  encodeUleb128(stroke.points.length, body);

  let prevQx = 0;
  let prevQy = 0;
  for (const pt of stroke.points) {
    const qx = Math.round(pt.x * 4);
    const qy = Math.round(pt.y * 4);
    encodeSleb128(qx - prevQx, body);
    encodeSleb128(qy - prevQy, body);
    body.push(clampByte(pt.pressure * 255));
    prevQx = qx;
    prevQy = qy;
  }

  encodeUleb128(rleXorDelta.length, body);
  for (let i = 0; i < rleXorDelta.length; i += 1) body.push(rleXorDelta[i] ?? 0);

  const payload = Uint8Array.from(body);
  const frameChecksum32 = computeFnv1a32(payload);
  const frameBytes = new Uint8Array(payload.length + 4);
  frameBytes.set(payload, 0);
  new DataView(frameBytes.buffer, frameBytes.byteOffset, frameBytes.byteLength).setUint32(
    payload.length,
    frameChecksum32,
    false,
  );

  const rawRgbaBytes = beforeTileRgba.length;
  return {
    bytes: frameBytes,
    opId: stroke.opId,
    opKey: formatOpIdKey(stroke.opId),
    workId: stroke.workId,
    layerId: stroke.layerId,
    tileKey: makeKmTileKey(stroke.layerId, stroke.tileX, stroke.tileY),
    rawRgbaBytes,
    compressedBytes: frameBytes.length,
    compressionRatio: rawRgbaBytes / Math.max(1, frameBytes.length),
    baseTileChecksum,
    afterTileChecksum,
    frameChecksum32,
  };
}

export function decodeKmDeltaBinaryFrame(bytes: Uint8Array): DecodedKmDeltaFrame {
  if (bytes.length < 32) {
    throw new RangeError("KM 델타 바이너리 프레임 크기가 최소 헤더 길이보다 작습니다.");
  }
  for (let i = 0; i < 4; i += 1) {
    if (bytes[i] !== COLLAB_KM_DELTA_FRAME_MAGIC[i]) {
      throw new RangeError("유효하지 않은 TSKM 바이너리 프레임 매직 헤더입니다.");
    }
  }
  const bodySlice = bytes.subarray(0, bytes.length - 4);
  const expectedChecksum = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    bytes.length - 4,
    false,
  );
  if (expectedChecksum !== computeFnv1a32(bodySlice)) {
    throw new RangeError("TSKM 바이너리 프레임 체크섬이 손상되었습니다.");
  }
  const version = bodySlice[4] ?? 0;
  if (version !== COLLAB_KM_DELTA_PROTOCOL_VERSION) {
    throw new RangeError(`지원하지 않는 TSKM 프레임 버전입니다: ${version}`);
  }

  let pos = 6;
  const lamportRes = decodeUleb128(bodySlice, pos); pos = lamportRes.nextOffset;
  const peerRes = readStringLeb128(bodySlice, pos); pos = peerRes.nextOffset;
  const seqRes = decodeUleb128(bodySlice, pos); pos = seqRes.nextOffset;
  const workRes = readStringLeb128(bodySlice, pos); pos = workRes.nextOffset;
  const layerRes = readStringLeb128(bodySlice, pos); pos = layerRes.nextOffset;
  const tileXRes = decodeSleb128(bodySlice, pos); pos = tileXRes.nextOffset;
  const tileYRes = decodeSleb128(bodySlice, pos); pos = tileYRes.nextOffset;
  const tileSizeRes = decodeUleb128(bodySlice, pos); pos = tileSizeRes.nextOffset;
  const baseCkRes = decodeUleb128(bodySlice, pos); pos = baseCkRes.nextOffset;
  const afterCkRes = decodeUleb128(bodySlice, pos); pos = afterCkRes.nextOffset;

  if (pos + KM16_BAND_COUNT + 6 > bodySlice.length) {
    throw new RangeError("16파장 KM 스펙트럼 필드가 잘렸습니다.");
  }
  const pigmentSpectrum16 = bodySlice.slice(pos, pos + KM16_BAND_COUNT);
  pos += KM16_BAND_COUNT;
  const pigmentRgba = [
    bodySlice[pos] ?? 0,
    bodySlice[pos + 1] ?? 0,
    bodySlice[pos + 2] ?? 0,
    bodySlice[pos + 3] ?? 255,
  ] as const;
  const wetness = (bodySlice[pos + 4] ?? 255) / 255;
  const opacity = (bodySlice[pos + 5] ?? 255) / 255;
  pos += 6;

  const radiusRes = decodeUleb128(bodySlice, pos); pos = radiusRes.nextOffset;
  const pointCountRes = decodeUleb128(bodySlice, pos); pos = pointCountRes.nextOffset;
  const points: KmStrokePoint[] = [];
  let accQx = 0;
  let accQy = 0;
  for (let i = 0; i < pointCountRes.value; i += 1) {
    const dxRes = decodeSleb128(bodySlice, pos); pos = dxRes.nextOffset;
    const dyRes = decodeSleb128(bodySlice, pos); pos = dyRes.nextOffset;
    if (pos >= bodySlice.length) throw new RangeError("스트로크 필압 바이트가 누락되었습니다.");
    accQx += dxRes.value;
    accQy += dyRes.value;
    points.push({ x: accQx / 4, y: accQy / 4, pressure: (bodySlice[pos] ?? 255) / 255 });
    pos += 1;
  }

  const deltaLenRes = decodeUleb128(bodySlice, pos); pos = deltaLenRes.nextOffset;
  if (pos + deltaLenRes.value !== bodySlice.length) {
    throw new RangeError("XOR+RLE+LEB128 페이로드 길이가 프레임 끝과 일치하지 않습니다.");
  }
  const opId: DeterministicOpId = { lamport: lamportRes.value, peerId: peerRes.text, opSeq: seqRes.value };

  return {
    version,
    opId,
    opKey: formatOpIdKey(opId),
    workId: workRes.text,
    layerId: layerRes.text,
    tileX: tileXRes.value,
    tileY: tileYRes.value,
    tileSize: tileSizeRes.value,
    baseTileChecksum: baseCkRes.value,
    afterTileChecksum: afterCkRes.value,
    pigmentSpectrum16,
    pigmentRgba,
    wetness,
    opacity,
    radiusPx: radiusRes.value / 16,
    points,
    rleXorDelta: bodySlice.slice(pos, pos + deltaLenRes.value),
    frameChecksum32: expectedChecksum,
  };
}
