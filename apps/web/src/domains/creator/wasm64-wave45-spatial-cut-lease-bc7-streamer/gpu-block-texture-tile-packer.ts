/**
 * Wave 45: 800×20,000px 이상 장편 웹툰 원고용 GPU 블록 압축 텍스처 타일 패커 및 복원기.
 *
 * - 단색·빈 여백 타일: 0바이트 상수 승격(`constant-zero-bytes`, VRAM 페이로드 100% 절감)
 * - 흑백 종이 선화 및 투명 잉크 마스크 선화: 단일 채널 `R8` 패킹(`r8-paper-luma`, `r8-ink-alpha`, 75% 절감)
 * - 불투명 채색 타일: 4×4 블록 64비트 엔드포인트 양자화(`bc1-rgb565-64bit`, 87.5% 절감)
 * - 반투명 명암·수채 타일: 4×4 블록 128비트 색상+알파 분리 양자화(`astc4x4-rgba-128bit`, 75% 절감)
 */

export const DEFAULT_GPU_TILE_SIZE_PX = 256 as const;
export const BC1_BLOCK_BYTES = 8 as const;
export const ASTC4X4_COMPAT_BLOCK_BYTES = 16 as const;

export type GpuPackedTileFormat =
  | "constant-zero-bytes"
  | "r8-paper-luma"
  | "r8-ink-alpha"
  | "bc1-rgb565-64bit"
  | "astc4x4-rgba-128bit";

export interface PackGpuTextureTileOptions {
  readonly tileId: string;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly chromaLineartTolerance?: number;
  readonly constantColorTolerance?: number;
  readonly preferHighPrecisionColor?: boolean;
}

export interface PackedGpuTextureTile {
  readonly tileId: string;
  readonly width: number;
  readonly height: number;
  readonly format: GpuPackedTileFormat;
  readonly rawByteLength: number;
  readonly vramPayloadByteLength: number;
  readonly savingsRatio: number;
  readonly constantRgba: readonly [number, number, number, number] | null;
  readonly inkRgb: readonly [number, number, number] | null;
  readonly blocksX: number;
  readonly blocksY: number;
  readonly payload: Uint8Array;
}

export interface ManuscriptTileBatchPackSummary {
  readonly packedTiles: readonly PackedGpuTextureTile[];
  readonly totalRawBytes: number;
  readonly totalVramPayloadBytes: number;
  readonly overallSavingsRatio: number;
  readonly formatCounts: Readonly<Record<GpuPackedTileFormat, number>>;
}

type RgbTriplet = readonly [number, number, number];
type RgbaPalette4 = readonly [RgbTriplet, RgbTriplet, RgbTriplet, RgbTriplet];

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function encodeRgb565(r: number, g: number, b: number): number {
  const r5 = ((clampByte(r) * 31 + 127) / 255) | 0;
  const g6 = ((clampByte(g) * 63 + 127) / 255) | 0;
  const b5 = ((clampByte(b) * 31 + 127) / 255) | 0;
  return (r5 << 11) | (g6 << 5) | b5;
}

function decodeRgb565(code: number): RgbTriplet {
  const r5 = (code >>> 11) & 0x1f;
  const g6 = (code >>> 5) & 0x3f;
  const b5 = code & 0x1f;
  return [(r5 << 3) | (r5 >>> 2), (g6 << 2) | (g6 >>> 4), (b5 << 3) | (b5 >>> 2)];
}

function buildFourColorPalette(p0: RgbTriplet, p1: RgbTriplet): RgbaPalette4 {
  return [
    p0,
    p1,
    [Math.round((2 * p0[0] + p1[0]) / 3), Math.round((2 * p0[1] + p1[1]) / 3), Math.round((2 * p0[2] + p1[2]) / 3)],
    [Math.round((p0[0] + 2 * p1[0]) / 3), Math.round((p0[1] + 2 * p1[1]) / 3), Math.round((p0[2] + 2 * p1[2]) / 3)],
  ];
}

function setRgbaPixel(out: Uint8Array, pixelIndex: number, r: number, g: number, b: number, a: number): void {
  const o = pixelIndex * 4;
  out[o] = r;
  out[o + 1] = g;
  out[o + 2] = b;
  out[o + 3] = a;
}

/** 4×4 블록 내 유효 픽셀들의 주성분 축 투영으로 RGB 듀얼 엔드포인트 `[ep0, ep1]`을 추정한다. */
function estimateRgbBlockEndpoints(blockRgba: Uint8Array, ignoreZeroAlpha: boolean): readonly [RgbTriplet, RgbTriplet] {
  let count = 0;
  let meanR = 0;
  let meanG = 0;
  let meanB = 0;
  for (let i = 0; i < 16; i += 1) {
    const o = i * 4;
    if (ignoreZeroAlpha && (blockRgba[o + 3] ?? 0) === 0) continue;
    meanR += blockRgba[o] ?? 0;
    meanG += blockRgba[o + 1] ?? 0;
    meanB += blockRgba[o + 2] ?? 0;
    count += 1;
  }
  if (count === 0) return [[0, 0, 0], [0, 0, 0]];
  meanR /= count;
  meanG /= count;
  meanB /= count;

  let crr = 0, crg = 0, crb = 0, cgg = 0, cgb = 0, cbb = 0;
  for (let i = 0; i < 16; i += 1) {
    const o = i * 4;
    if (ignoreZeroAlpha && (blockRgba[o + 3] ?? 0) === 0) continue;
    const dr = (blockRgba[o] ?? 0) - meanR;
    const dg = (blockRgba[o + 1] ?? 0) - meanG;
    const db = (blockRgba[o + 2] ?? 0) - meanB;
    crr += dr * dr; crg += dr * dg; crb += dr * db;
    cgg += dg * dg; cgb += dg * db; cbb += db * db;
  }

  let ax = 1, ay = 1, az = 1;
  for (let iter = 0; iter < 4; iter += 1) {
    const nx = crr * ax + crg * ay + crb * az;
    const ny = crg * ax + cgg * ay + cgb * az;
    const nz = crb * ax + cgb * ay + cbb * az;
    const norm = Math.hypot(nx, ny, nz);
    if (norm <= 1e-6) break;
    ax = nx / norm; ay = ny / norm; az = nz / norm;
  }

  let minProj = Number.POSITIVE_INFINITY;
  let maxProj = Number.NEGATIVE_INFINITY;
  let minPixel: RgbTriplet = [clampByte(meanR), clampByte(meanG), clampByte(meanB)];
  let maxPixel: RgbTriplet = minPixel;
  for (let i = 0; i < 16; i += 1) {
    const o = i * 4;
    if (ignoreZeroAlpha && (blockRgba[o + 3] ?? 0) === 0) continue;
    const r = blockRgba[o] ?? 0, g = blockRgba[o + 1] ?? 0, b = blockRgba[o + 2] ?? 0;
    const proj = (r - meanR) * ax + (g - meanG) * ay + (b - meanB) * az;
    if (proj < minProj) { minProj = proj; minPixel = [r, g, b]; }
    if (proj > maxProj) { maxProj = proj; maxPixel = [r, g, b]; }
  }
  return [maxPixel, minPixel];
}

function assignRgbIndices32(blockRgba: Uint8Array, p0: RgbTriplet, p1: RgbTriplet): number {
  const palette = buildFourColorPalette(p0, p1);
  let packed = 0;
  for (let i = 0; i < 16; i += 1) {
    const o = i * 4;
    const r = blockRgba[o] ?? 0, g = blockRgba[o + 1] ?? 0, b = blockRgba[o + 2] ?? 0;
    let bestIdx = 0;
    let bestErr = Number.POSITIVE_INFINITY;
    for (let k = 0; k < 4; k += 1) {
      const entry = palette[k] ?? p0;
      const err = (r - entry[0]) ** 2 + (g - entry[1]) ** 2 + (b - entry[2]) ** 2;
      if (err < bestErr) { bestErr = err; bestIdx = k; }
    }
    packed = (packed | (bestIdx << (i * 2))) >>> 0;
  }
  return packed;
}

function extractClampedBlock4x4(
  rgba: Uint8Array,
  width: number,
  height: number,
  bx: number,
  by: number,
  outBlock: Uint8Array,
): void {
  for (let ly = 0; ly < 4; ly += 1) {
    const sy = Math.min(height - 1, by * 4 + ly);
    for (let lx = 0; lx < 4; lx += 1) {
      const sx = Math.min(width - 1, bx * 4 + lx);
      const sOff = (sy * width + sx) * 4;
      setRgbaPixel(outBlock, ly * 4 + lx, rgba[sOff] ?? 0, rgba[sOff + 1] ?? 0, rgba[sOff + 2] ?? 0, rgba[sOff + 3] ?? 0);
    }
  }
}

function makePackedTile(
  options: PackGpuTextureTileOptions,
  format: GpuPackedTileFormat,
  payload: Uint8Array,
  extras: { constantRgba?: readonly [number, number, number, number] | null; inkRgb?: RgbTriplet | null; blocksX?: number; blocksY?: number } = {},
): PackedGpuTextureTile {
  const rawByteLength = options.width * options.height * 4;
  return {
    tileId: options.tileId, width: options.width, height: options.height, format,
    rawByteLength, vramPayloadByteLength: payload.byteLength, savingsRatio: 1 - payload.byteLength / rawByteLength,
    constantRgba: extras.constantRgba ?? null, inkRgb: extras.inkRgb ?? null,
    blocksX: extras.blocksX ?? 0, blocksY: extras.blocksY ?? 0, payload,
  };
}

/** 타일 픽셀 특성을 분석해 최적 하드웨어 친화 압축 포맷으로 패킹한다. */
export function packGpuTextureTile(options: PackGpuTextureTileOptions): PackedGpuTextureTile {
  const { width, height, rgba } = options;
  if (width <= 0 || height <= 0) throw new RangeError(`타일 크기(${width}x${height})는 양수여야 합니다.`);
  const pixelCount = width * height;
  const rawByteLength = pixelCount * 4;
  if (rgba.length !== rawByteLength) {
    throw new RangeError(`타일(${options.tileId}) 버퍼 길이(${rgba.length})가 ${rawByteLength}와 다릅니다.`);
  }

  const chromaTol = Math.max(0, Math.trunc(options.chromaLineartTolerance ?? 2));
  const constTol = Math.max(0, Math.trunc(options.constantColorTolerance ?? 0));
  let allTransparent = true, isPaperGrayscale = true, isInkAlphaMask = true, foundInk = false;
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0, minA = 255, maxA = 0;
  let inkR = 0, inkG = 0, inkB = 0;

  for (let i = 0; i < rawByteLength; i += 4) {
    const r = rgba[i] ?? 0, g = rgba[i + 1] ?? 0, b = rgba[i + 2] ?? 0, a = rgba[i + 3] ?? 0;
    if (a !== 0) allTransparent = false;
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minG = Math.min(minG, g); maxG = Math.max(maxG, g);
    minB = Math.min(minB, b); maxB = Math.max(maxB, b);
    minA = Math.min(minA, a); maxA = Math.max(maxA, a);
    if (a !== 255 || Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b)) > chromaTol) {
      isPaperGrayscale = false;
    }
    if (a > 0) {
      if (!foundInk) {
        foundInk = true; inkR = r; inkG = g; inkB = b;
      } else if (Math.abs(r - inkR) > chromaTol || Math.abs(g - inkG) > chromaTol || Math.abs(b - inkB) > chromaTol) {
        isInkAlphaMask = false;
      }
    }
  }

  if (allTransparent) {
    return makePackedTile(options, "constant-zero-bytes", new Uint8Array(0), { constantRgba: [0, 0, 0, 0] });
  }
  if (Math.max(maxR - minR, maxG - minG, maxB - minB, maxA - minA) <= constTol) {
    return makePackedTile(options, "constant-zero-bytes", new Uint8Array(0), {
      constantRgba: [rgba[0] ?? 0, rgba[1] ?? 0, rgba[2] ?? 0, rgba[3] ?? 0],
    });
  }
  if (isPaperGrayscale) {
    const payload = new Uint8Array(pixelCount);
    for (let p = 0; p < pixelCount; p += 1) {
      const o = p * 4;
      payload[p] = Math.round(((rgba[o] ?? 0) + (rgba[o + 1] ?? 0) + (rgba[o + 2] ?? 0)) / 3);
    }
    return makePackedTile(options, "r8-paper-luma", payload);
  }
  if (isInkAlphaMask && foundInk) {
    const payload = new Uint8Array(pixelCount);
    for (let p = 0; p < pixelCount; p += 1) payload[p] = rgba[p * 4 + 3] ?? 0;
    return makePackedTile(options, "r8-ink-alpha", payload, { inkRgb: [inkR, inkG, inkB] });
  }

  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const scratchBlock = new Uint8Array(64);

  if (minA === 255 && !options.preferHighPrecisionColor) {
    const payload = new Uint8Array(blocksX * blocksY * BC1_BLOCK_BYTES);
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    let writeOffset = 0;
    for (let by = 0; by < blocksY; by += 1) {
      for (let bx = 0; bx < blocksX; bx += 1) {
        extractClampedBlock4x4(rgba, width, height, bx, by, scratchBlock);
        const [epA, epB] = estimateRgbBlockEndpoints(scratchBlock, false);
        let c0 = encodeRgb565(epA[0], epA[1], epA[2]);
        let c1 = encodeRgb565(epB[0], epB[1], epB[2]);
        if (c0 < c1) [c0, c1] = [c1, c0];
        const indices = c0 === c1 ? 0 : assignRgbIndices32(scratchBlock, decodeRgb565(c0), decodeRgb565(c1));
        view.setUint16(writeOffset, c0, true);
        view.setUint16(writeOffset + 2, c1, true);
        view.setUint32(writeOffset + 4, indices, true);
        writeOffset += BC1_BLOCK_BYTES;
      }
    }
    return makePackedTile(options, "bc1-rgb565-64bit", payload, { blocksX, blocksY });
  }

  const payload = new Uint8Array(blocksX * blocksY * ASTC4X4_COMPAT_BLOCK_BYTES);
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let writeOffset = 0;
  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      extractClampedBlock4x4(rgba, width, height, bx, by, scratchBlock);
      const [ep0, ep1] = estimateRgbBlockEndpoints(scratchBlock, true);
      let bMinA = 255, bMaxA = 0;
      for (let i = 0; i < 16; i += 1) {
        const a = scratchBlock[i * 4 + 3] ?? 0;
        bMinA = Math.min(bMinA, a); bMaxA = Math.max(bMaxA, a);
      }
      const rgbIndices =
        ep0[0] === ep1[0] && ep0[1] === ep1[1] && ep0[2] === ep1[2] ? 0 : assignRgbIndices32(scratchBlock, ep0, ep1);
      const alphaPal = [bMaxA, bMinA, Math.round((2 * bMaxA + bMinA) / 3), Math.round((bMaxA + 2 * bMinA) / 3)];
      let alphaIndices = 0;
      if (bMaxA !== bMinA) {
        for (let i = 0; i < 16; i += 1) {
          const a = scratchBlock[i * 4 + 3] ?? 0;
          let bestIdx = 0, bestDiff = 256;
          for (let k = 0; k < 4; k += 1) {
            const diff = Math.abs(a - (alphaPal[k] ?? bMaxA));
            if (diff < bestDiff) { bestDiff = diff; bestIdx = k; }
          }
          alphaIndices = (alphaIndices | (bestIdx << (i * 2))) >>> 0;
        }
      }
      payload.set([ep0[0], ep0[1], ep0[2], ep1[0], ep1[1], ep1[2], bMaxA, bMinA], writeOffset);
      view.setUint32(writeOffset + 8, rgbIndices, true);
      view.setUint32(writeOffset + 12, alphaIndices, true);
      writeOffset += ASTC4X4_COMPAT_BLOCK_BYTES;
    }
  }
  return makePackedTile(options, "astc4x4-rgba-128bit", payload, { blocksX, blocksY });
}

function writeDecodedBlockToTile(
  out: Uint8Array,
  width: number,
  height: number,
  bx: number,
  by: number,
  rgbPalette: RgbaPalette4,
  rgbIndices: number,
  alphaPalette: readonly [number, number, number, number] | null,
  alphaIndices: number,
): void {
  for (let ly = 0; ly < 4; ly += 1) {
    const py = by * 4 + ly;
    if (py >= height) continue;
    for (let lx = 0; lx < 4; lx += 1) {
      const px = bx * 4 + lx;
      if (px >= width) continue;
      const tIdx = ly * 4 + lx;
      const alpha = alphaPalette ? (alphaPalette[(alphaIndices >>> (tIdx * 2)) & 0x3] ?? 255) : 255;
      if (alpha === 0) continue;
      const color = rgbPalette[(rgbIndices >>> (tIdx * 2)) & 0x3] ?? rgbPalette[0];
      setRgbaPixel(out, py * width + px, color[0], color[1], color[2], alpha);
    }
  }
}

/** 패킹된 GPU 타일을 `RGBA8` 픽셀 버퍼로 복원한다. */
export function unpackGpuTextureTile(packed: PackedGpuTextureTile): Uint8Array {
  const { width, height, format, payload } = packed;
  const pixelCount = width * height;
  const out = new Uint8Array(pixelCount * 4);

  if (format === "constant-zero-bytes") {
    const [r, g, b, a] = packed.constantRgba ?? [0, 0, 0, 0];
    if (r === 0 && g === 0 && b === 0 && a === 0) return out;
    for (let p = 0; p < pixelCount; p += 1) setRgbaPixel(out, p, r, g, b, a);
    return out;
  }
  if (format === "r8-paper-luma") {
    for (let p = 0; p < pixelCount; p += 1) {
      const v = payload[p] ?? 255;
      setRgbaPixel(out, p, v, v, v, 255);
    }
    return out;
  }
  if (format === "r8-ink-alpha") {
    const [ir, ig, ib] = packed.inkRgb ?? [0, 0, 0];
    for (let p = 0; p < pixelCount; p += 1) {
      const a = payload[p] ?? 0;
      if (a > 0) setRgbaPixel(out, p, ir, ig, ib, a);
    }
    return out;
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let readOffset = 0;
  if (format === "bc1-rgb565-64bit") {
    for (let by = 0; by < packed.blocksY; by += 1) {
      for (let bx = 0; bx < packed.blocksX; bx += 1) {
        const c0 = view.getUint16(readOffset, true);
        const c1 = view.getUint16(readOffset + 2, true);
        const indices = view.getUint32(readOffset + 4, true);
        readOffset += BC1_BLOCK_BYTES;
        writeDecodedBlockToTile(out, width, height, bx, by, buildFourColorPalette(decodeRgb565(c0), decodeRgb565(c1)), indices, null, 0);
      }
    }
    return out;
  }

  for (let by = 0; by < packed.blocksY; by += 1) {
    for (let bx = 0; bx < packed.blocksX; bx += 1) {
      const ep0: RgbTriplet = [payload[readOffset] ?? 0, payload[readOffset + 1] ?? 0, payload[readOffset + 2] ?? 0];
      const ep1: RgbTriplet = [payload[readOffset + 3] ?? 0, payload[readOffset + 4] ?? 0, payload[readOffset + 5] ?? 0];
      const a0 = payload[readOffset + 6] ?? 255;
      const a1 = payload[readOffset + 7] ?? 255;
      const rgbIndices = view.getUint32(readOffset + 8, true);
      const alphaIndices = view.getUint32(readOffset + 12, true);
      readOffset += ASTC4X4_COMPAT_BLOCK_BYTES;
      const alphaPal: readonly [number, number, number, number] = [a0, a1, Math.round((2 * a0 + a1) / 3), Math.round((a0 + 2 * a1) / 3)];
      writeDecodedBlockToTile(out, width, height, bx, by, buildFourColorPalette(ep0, ep1), rgbIndices, alphaPal, alphaIndices);
    }
  }
  return out;
}

/** 원본과 복원된 RGBA8 타일 간의 최대 신호 대 잡음비(`PSNR`, 단위 `dB`)를 계산한다. */
export function computeRgbaTilePsnrDb(originalRgba: Uint8Array, reconstructedRgba: Uint8Array): number {
  if (originalRgba.length !== reconstructedRgba.length || originalRgba.length === 0) {
    throw new RangeError("PSNR 비교 대상 버퍼 길이가 유효하지 않거나 서로 다릅니다.");
  }
  let sumSquaredError = 0;
  for (let i = 0; i < originalRgba.length; i += 1) {
    const diff = (originalRgba[i] ?? 0) - (reconstructedRgba[i] ?? 0);
    sumSquaredError += diff * diff;
  }
  return sumSquaredError === 0 ? Number.POSITIVE_INFINITY : 10 * Math.log10((255 * 255) / (sumSquaredError / originalRgba.length));
}

/** 장편 원고의 전체 타일 묶음을 일괄 패킹하고 VRAM 절감 통계를 집계한다. */
export function packManuscriptTileBatch(tiles: readonly PackGpuTextureTileOptions[]): ManuscriptTileBatchPackSummary {
  const formatCounts: Record<GpuPackedTileFormat, number> = {
    "constant-zero-bytes": 0,
    "r8-paper-luma": 0,
    "r8-ink-alpha": 0,
    "bc1-rgb565-64bit": 0,
    "astc4x4-rgba-128bit": 0,
  };
  let totalRawBytes = 0;
  let totalVramPayloadBytes = 0;
  const packedTiles: PackedGpuTextureTile[] = [];
  for (const tile of tiles) {
    const packed = packGpuTextureTile(tile);
    packedTiles.push(packed);
    totalRawBytes += packed.rawByteLength;
    totalVramPayloadBytes += packed.vramPayloadByteLength;
    formatCounts[packed.format] += 1;
  }
  return {
    packedTiles,
    totalRawBytes,
    totalVramPayloadBytes,
    overallSavingsRatio: totalRawBytes > 0 ? 1 - totalVramPayloadBytes / totalRawBytes : 0,
    formatCounts,
  };
}
