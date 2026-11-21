/**
 * Pure TypeScript PNG alpha-mask decoder & R8 MIP pyramid builder.
 *
 * Uses the gateway's dependency-free synchronous `inflateZlib` so PNG tip and
 * grain assets inside CSP `.sut`/`.sutg` and Procreate `.brushset` files decode
 * identically in Node, Workers, and browsers without DOM/Canvas dependencies.
 */

import { bytesToBase64 } from "./format-common";
import { inflateZlib } from "./zlib-inflate";

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const PNG_ALPHA_DECODE_LIMITS = Object.freeze({
  maxDimension: 4096,
  maxPixels: 16 * 1024 * 1024,
  maxCompressedBytes: 32 * 1024 * 1024,
  maxRawBytes: 64 * 1024 * 1024 + 16_384,
});

export type PngMaskPolarity = "auto" | "light-is-opaque" | "dark-is-opaque" | "alpha-only";

export interface DecodedPngAlphaMask {
  readonly width: number;
  readonly height: number;
  readonly alpha: Uint8Array;
  readonly source: "alpha" | "grayscale-light" | "grayscale-dark";
}

export interface R8TipMipLevel {
  readonly size: number;
  readonly alpha: Uint8Array;
  readonly alphaMapBase64: string;
}

export interface R8TipPyramid {
  readonly size: number;
  readonly alpha: Uint8Array;
  readonly alphaMapBase64: string;
  readonly documentSize: number;
  readonly documentAlpha: Uint8Array;
  readonly documentAlphaMapBase64: string;
  readonly mipLevels: readonly R8TipMipLevel[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterScanlines(
  raw: Uint8Array,
  width: number,
  height: number,
  bytesPerPixel: number,
  stride: number,
): Uint8Array {
  const output = new Uint8Array(height * stride);
  const rowStride = stride + 1;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * rowStride] ?? 0;
    const srcOffset = y * rowStride + 1;
    const dstOffset = y * stride;
    const prevOffset = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const byte = raw[srcOffset + x] ?? 0;
      const a = x >= bytesPerPixel ? (output[dstOffset + x - bytesPerPixel] ?? 0) : 0;
      const b = y > 0 ? (output[prevOffset + x] ?? 0) : 0;
      const c = y > 0 && x >= bytesPerPixel ? (output[prevOffset + x - bytesPerPixel] ?? 0) : 0;
      let decoded: number;
      if (filter === 0) decoded = byte;
      else if (filter === 1) decoded = (byte + a) & 0xff;
      else if (filter === 2) decoded = (byte + b) & 0xff;
      else if (filter === 3) decoded = (byte + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) decoded = (byte + paethPredictor(a, b, c)) & 0xff;
      else throw new Error(`unsupported PNG filter type ${filter}`);
      output[dstOffset + x] = decoded;
    }
  }
  return output;
}

function sampleLuminance(r: number, g: number, b: number): number {
  return Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722);
}

function unpackPixelsToRgba(
  unfiltered: Uint8Array,
  width: number,
  height: number,
  bitDepth: number,
  colorType: number,
  palette: Uint8Array | null,
  trns: Uint8Array | null,
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const bytesPerSample = bitDepth === 16 ? 2 : 1;
  const stride = Math.ceil((width * channels * bitDepth) / 8);

  const readSample8 = (rowStart: number, pixelIndex: number, channel: number): number => {
    if (bitDepth === 8) {
      return unfiltered[rowStart + pixelIndex * channels + channel] ?? 0;
    }
    if (bitDepth === 16) {
      return unfiltered[rowStart + (pixelIndex * channels + channel) * bytesPerSample] ?? 0;
    }
    // 1, 2, or 4-bit grayscale or indexed sample
    const bitIndex = pixelIndex * bitDepth;
    const byte = unfiltered[rowStart + (bitIndex >> 3)] ?? 0;
    const shift = 8 - bitDepth - (bitIndex & 7);
    const mask = (1 << bitDepth) - 1;
    const raw = (byte >> shift) & mask;
    return colorType === 3 ? raw : Math.round((raw / mask) * 255);
  };

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    for (let x = 0; x < width; x += 1) {
      const dst = (y * width + x) * 4;
      if (colorType === 0) {
        const g = readSample8(rowStart, x, 0);
        rgba[dst] = g;
        rgba[dst + 1] = g;
        rgba[dst + 2] = g;
        rgba[dst + 3] = 255;
      } else if (colorType === 2) {
        rgba[dst] = readSample8(rowStart, x, 0);
        rgba[dst + 1] = readSample8(rowStart, x, 1);
        rgba[dst + 2] = readSample8(rowStart, x, 2);
        rgba[dst + 3] = 255;
      } else if (colorType === 3) {
        const idx = readSample8(rowStart, x, 0);
        const pOff = idx * 3;
        rgba[dst] = palette ? (palette[pOff] ?? 0) : 0;
        rgba[dst + 1] = palette ? (palette[pOff + 1] ?? 0) : 0;
        rgba[dst + 2] = palette ? (palette[pOff + 2] ?? 0) : 0;
        rgba[dst + 3] = trns && idx < trns.byteLength ? (trns[idx] ?? 255) : 255;
      } else if (colorType === 4) {
        const g = readSample8(rowStart, x, 0);
        rgba[dst] = g;
        rgba[dst + 1] = g;
        rgba[dst + 2] = g;
        rgba[dst + 3] = readSample8(rowStart, x, 1);
      } else {
        rgba[dst] = readSample8(rowStart, x, 0);
        rgba[dst + 1] = readSample8(rowStart, x, 1);
        rgba[dst + 2] = readSample8(rowStart, x, 2);
        rgba[dst + 3] = readSample8(rowStart, x, 3);
      }
    }
  }
  return rgba;
}

/**
 * Decodes a non-interlaced PNG image into an R8 alpha coverage mask.
 * Returns null if the PNG is invalid, interlaced, or exceeds safety limits.
 */
export function decodePngToR8AlphaMask(
  bytes: Uint8Array,
  polarity: PngMaskPolarity = "auto",
): DecodedPngAlphaMask | null {
  if (bytes.byteLength < 33) return null;
  for (let i = 0; i < PNG_SIGNATURE.byteLength; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idatChunks: Uint8Array[] = [];
  let idatTotal = 0;
  let sawIhdr = false;
  let sawIend = false;

  while (offset + 12 <= bytes.byteLength) {
    const length = view.getUint32(offset, false);
    const end = offset + 12 + length;
    if (length > bytes.byteLength || end > bytes.byteLength) return null;
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      if (sawIhdr || length !== 13) return null;
      sawIhdr = true;
      const ihdr = new DataView(data.buffer, data.byteOffset, 13);
      width = ihdr.getUint32(0, false);
      height = ihdr.getUint32(4, false);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? -1;
      const compression = data[10] ?? 0;
      const filter = data[11] ?? 0;
      const interlace = data[12] ?? 0;
      if (
        width < 1 ||
        height < 1 ||
        width > PNG_ALPHA_DECODE_LIMITS.maxDimension ||
        height > PNG_ALPHA_DECODE_LIMITS.maxDimension ||
        width * height > PNG_ALPHA_DECODE_LIMITS.maxPixels ||
        compression !== 0 ||
        filter !== 0 ||
        interlace !== 0 ||
        ![1, 2, 4, 8, 16].includes(bitDepth) ||
        ![0, 2, 3, 4, 6].includes(colorType)
      ) {
        return null;
      }
      if ((colorType === 2 || colorType === 4 || colorType === 6) && bitDepth < 8) return null;
      if (colorType === 3 && bitDepth === 16) return null;
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      trns = data;
    } else if (type === "IDAT") {
      idatTotal += data.byteLength;
      if (idatTotal > PNG_ALPHA_DECODE_LIMITS.maxCompressedBytes) return null;
      idatChunks.push(data);
    } else if (type === "IEND") {
      sawIend = true;
      break;
    }
    offset = end;
  }

  if (!sawIhdr || !sawIend || idatChunks.length === 0) return null;

  const compressed = new Uint8Array(idatTotal);
  let write = 0;
  for (const chunk of idatChunks) {
    compressed.set(chunk, write);
    write += chunk.byteLength;
  }

  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const stride = Math.ceil((width * channels * bitDepth) / 8);
  const expectedRaw = height * (stride + 1);
  if (expectedRaw > PNG_ALPHA_DECODE_LIMITS.maxRawBytes) return null;

  let inflated: Uint8Array;
  try {
    inflated = inflateZlib(compressed, {
      maxOutputBytes: expectedRaw,
      expectedBytes: expectedRaw,
      skipChecksum: true,
    }).output;
  } catch {
    return null;
  }

  let unfiltered: Uint8Array;
  try {
    const bpp = Math.max(1, Math.ceil((channels * bitDepth) / 8));
    unfiltered = unfilterScanlines(inflated, width, height, bpp, stride);
  } catch {
    return null;
  }

  const rgba = unpackPixelsToRgba(unfiltered, width, height, bitDepth, colorType, palette, trns);
  const pixelCount = width * height;
  let hasTransparency = false;
  let centreLumSum = 0;
  let centreCount = 0;
  let edgeLumSum = 0;
  let edgeCount = 0;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const a = rgba[idx + 3] ?? 255;
      if (a < 250) hasTransparency = true;
      const lum = sampleLuminance(rgba[idx] ?? 0, rgba[idx + 1] ?? 0, rgba[idx + 2] ?? 0);
      const nx = width <= 1 ? 0 : Math.abs(x - cx) / (width / 2);
      const ny = height <= 1 ? 0 : Math.abs(y - cy) / (height / 2);
      if (nx <= 0.35 && ny <= 0.35) {
        centreLumSum += lum;
        centreCount += 1;
      }
      if (nx >= 0.72 || ny >= 0.72) {
        edgeLumSum += lum;
        edgeCount += 1;
      }
    }
  }

  let source: DecodedPngAlphaMask["source"];
  if (polarity === "alpha-only" || (polarity === "auto" && hasTransparency)) {
    source = "alpha";
  } else if (polarity === "light-is-opaque") {
    source = hasTransparency ? "alpha" : "grayscale-light";
  } else if (polarity === "dark-is-opaque") {
    source = hasTransparency ? "alpha" : "grayscale-dark";
  } else {
    const centreAvg = centreCount > 0 ? centreLumSum / centreCount : 128;
    const edgeAvg = edgeCount > 0 ? edgeLumSum / edgeCount : 0;
    source = centreAvg + 4 < edgeAvg
      ? "grayscale-dark"
      : centreAvg > edgeAvg + 4
        ? "grayscale-light"
        : edgeAvg >= 128
          ? "grayscale-dark"
          : "grayscale-light";
  }

  const alpha = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const idx = i * 4;
    if (source === "alpha") {
      alpha[i] = rgba[idx + 3] ?? 0;
    } else {
      const lum = sampleLuminance(rgba[idx] ?? 0, rgba[idx + 1] ?? 0, rgba[idx + 2] ?? 0);
      alpha[i] = source === "grayscale-dark" ? 255 - lum : lum;
    }
  }
  return { width, height, alpha, source };
}

/** Area-averaged (box-filter) R8 downsampler when shrinking; bilinear when expanding. */
export function resampleR8Alpha(
  source: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Uint8Array {
  const out = new Uint8Array(dstWidth * dstHeight);
  if (srcWidth === dstWidth && srcHeight === dstHeight) {
    out.set(source.subarray(0, out.length));
    return out;
  }
  const scaleX = srcWidth / dstWidth;
  const scaleY = srcHeight / dstHeight;
  const shrinking = scaleX > 1 || scaleY > 1;

  if (shrinking) {
    for (let dy = 0; dy < dstHeight; dy += 1) {
      const sy0 = dy * scaleY;
      const sy1 = Math.min(srcHeight, (dy + 1) * scaleY);
      const yStart = Math.floor(sy0);
      const yEnd = Math.min(srcHeight - 1, Math.ceil(sy1) - 1);
      for (let dx = 0; dx < dstWidth; dx += 1) {
        const sx0 = dx * scaleX;
        const sx1 = Math.min(srcWidth, (dx + 1) * scaleX);
        const xStart = Math.floor(sx0);
        const xEnd = Math.min(srcWidth - 1, Math.ceil(sx1) - 1);
        let weightedSum = 0;
        let totalWeight = 0;
        for (let sy = yStart; sy <= yEnd; sy += 1) {
          const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
          if (wy <= 0) continue;
          const row = sy * srcWidth;
          for (let sx = xStart; sx <= xEnd; sx += 1) {
            const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
            if (wx <= 0) continue;
            const w = wx * wy;
            weightedSum += (source[row + sx] ?? 0) * w;
            totalWeight += w;
          }
        }
        out[dy * dstWidth + dx] = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
      }
    }
    return out;
  }

  for (let dy = 0; dy < dstHeight; dy += 1) {
    const sy = ((dy + 0.5) / dstHeight) * srcHeight - 0.5;
    const top = clamp(Math.floor(sy), 0, srcHeight - 1);
    const bottom = Math.min(srcHeight - 1, top + 1);
    const ty = clamp(sy - top, 0, 1);
    for (let dx = 0; dx < dstWidth; dx += 1) {
      const sx = ((dx + 0.5) / dstWidth) * srcWidth - 0.5;
      const left = clamp(Math.floor(sx), 0, srcWidth - 1);
      const right = Math.min(srcWidth - 1, left + 1);
      const tx = clamp(sx - left, 0, 1);
      const a00 = source[top * srcWidth + left] ?? 0;
      const a10 = source[top * srcWidth + right] ?? 0;
      const a01 = source[bottom * srcWidth + left] ?? 0;
      const a11 = source[bottom * srcWidth + right] ?? 0;
      const topVal = a00 * (1 - tx) + a10 * tx;
      const botVal = a01 * (1 - tx) + a11 * tx;
      out[dy * dstWidth + dx] = Math.round(topVal * (1 - ty) + botVal * ty);
    }
  }
  return out;
}

/**
 * Builds a square R8 alpha tip up to `maxSize` (default 1024px) plus a halved
 * R8 MIP pyramid down to `documentMaxSize` (default 64px) for compact storage.
 */
export function buildR8TipPyramid(
  source: Uint8Array,
  width: number,
  height: number,
  options: {
    readonly minSize?: number;
    readonly maxSize?: number;
    readonly documentMaxSize?: number;
  } = {},
): R8TipPyramid {
  const minSize = options.minSize ?? 8;
  const maxSize = options.maxSize ?? 1024;
  const documentMaxSize = options.documentMaxSize ?? 64;
  const targetSize = Math.round(clamp(Math.max(width, height), minSize, maxSize));
  const scale = targetSize / Math.max(width, height);
  const drawnW = Math.max(1, Math.round(width * scale));
  const drawnH = Math.max(1, Math.round(height * scale));
  const resized = resampleR8Alpha(source, width, height, drawnW, drawnH);

  const square = new Uint8Array(targetSize * targetSize);
  const offsetX = Math.floor((targetSize - drawnW) / 2);
  const offsetY = Math.floor((targetSize - drawnH) / 2);
  for (let y = 0; y < drawnH; y += 1) {
    square.set(
      resized.subarray(y * drawnW, (y + 1) * drawnW),
      (offsetY + y) * targetSize + offsetX,
    );
  }

  const mipLevels: R8TipMipLevel[] = [
    {
      size: targetSize,
      alpha: square,
      alphaMapBase64: bytesToBase64(square),
    },
  ];
  let currentSize = targetSize;
  let currentAlpha: Uint8Array = square;
  while (currentSize > documentMaxSize) {
    const nextSize = Math.max(documentMaxSize, Math.floor(currentSize / 2));
    const nextAlpha = resampleR8Alpha(currentAlpha, currentSize, currentSize, nextSize, nextSize);
    mipLevels.push({
      size: nextSize,
      alpha: nextAlpha,
      alphaMapBase64: bytesToBase64(nextAlpha),
    });
    currentSize = nextSize;
    currentAlpha = nextAlpha;
  }

  const docLevel = mipLevels[mipLevels.length - 1]!;
  return {
    size: targetSize,
    alpha: square,
    alphaMapBase64: mipLevels[0]!.alphaMapBase64,
    documentSize: docLevel.size,
    documentAlpha: docLevel.alpha,
    documentAlphaMapBase64: docLevel.alphaMapBase64,
    mipLevels,
  };
}
