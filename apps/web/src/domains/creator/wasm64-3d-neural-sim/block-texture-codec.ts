/**
 * 4×4 블록 엔드포인트+2비트 인덱스 GPU 텍스처 코덱(BC1 8:1 · BC3 4:1),
 * PSNR 텔레메트리 및 WebNN 실행 프로바이더 탐지기.
 */

export type RgbTuple = readonly [number, number, number];
export type BlockCodecMode = "bc1-rgb565-8to1" | "bc3-rgba-4to1";

export type WebNnExecutionProviderKind =
  | "webnn-npu"
  | "webnn-gpu"
  | "webnn-cpu"
  | "wasm-simd"
  | "cpu-deterministic";

export interface WebNnExecutionProviderReport {
  readonly hasWebNnApi: boolean;
  readonly availableProviders: readonly WebNnExecutionProviderKind[];
  readonly preferredProvider: WebNnExecutionProviderKind;
  readonly zeroServerCost: true;
}

export interface RgbaTextureBuffer {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

export interface BlockCompressionTelemetry {
  readonly mode: BlockCodecMode;
  readonly width: number;
  readonly height: number;
  readonly blocksX: number;
  readonly blocksY: number;
  readonly bytesPerBlock: 8 | 16;
  readonly rawByteLength: number;
  readonly compressedByteLength: number;
  readonly compressionRatio: number;
  readonly mseRgb: number;
  readonly psnrRgbDb: number;
  readonly psnrRgbaDb: number;
  readonly maxChannelError: number;
}

export interface CompressedBlockTexture {
  readonly mode: BlockCodecMode;
  readonly width: number;
  readonly height: number;
  readonly blocksX: number;
  readonly blocksY: number;
  readonly bytesPerBlock: 8 | 16;
  readonly blocks: Uint8Array;
  readonly telemetry: BlockCompressionTelemetry;
}

const EPS = 1e-6;

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** WebNN NPU/GPU/CPU 및 로컬 WASM 실행 프로바이더 가용성을 탐지한다. */
export function probeWebNnExecutionProviders(): WebNnExecutionProviderReport {
  const g = globalThis as {
    readonly navigator?: { readonly ml?: { readonly createContext?: unknown } };
    readonly WebAssembly?: unknown;
  };
  const hasWebNnApi = Boolean(
    g.navigator &&
      typeof g.navigator.ml === "object" &&
      g.navigator.ml !== null &&
      typeof g.navigator.ml.createContext === "function",
  );
  const hasWasm = typeof g.WebAssembly === "object" && g.WebAssembly !== null;
  const providers: WebNnExecutionProviderKind[] = [];
  if (hasWebNnApi) providers.push("webnn-npu", "webnn-gpu", "webnn-cpu");
  if (hasWasm) providers.push("wasm-simd");
  providers.push("cpu-deterministic");
  return {
    hasWebNnApi,
    availableProviders: providers,
    preferredProvider: providers[0] ?? "cpu-deterministic",
    zeroServerCost: true,
  };
}

function encodeRgb565(r: number, g: number, b: number): number {
  return ((clampByte(r) >> 3) << 11) | ((clampByte(g) >> 2) << 5) | (clampByte(b) >> 3);
}

function decodeRgb565(c: number): [number, number, number] {
  const r5 = (c >>> 11) & 0x1f;
  const g6 = (c >>> 5) & 0x3f;
  const b5 = c & 0x1f;
  return [(r5 << 3) | (r5 >> 2), (g6 << 2) | (g6 >> 4), (b5 << 3) | (b5 >> 2)];
}

function buildBc1Palette4(c0: number, c1: number): readonly [number, number, number][] {
  const p0 = decodeRgb565(c0);
  const p1 = decodeRgb565(c1);
  return [
    p0,
    p1,
    [Math.round((2 * p0[0] + p1[0]) / 3), Math.round((2 * p0[1] + p1[1]) / 3), Math.round((2 * p0[2] + p1[2]) / 3)],
    [Math.round((p0[0] + 2 * p1[0]) / 3), Math.round((p0[1] + 2 * p1[1]) / 3), Math.round((p0[2] + 2 * p1[2]) / 3)],
  ];
}

function pickBc1Indices(blockRgb: Uint8Array, c0: number, c1: number): Uint8Array {
  const pal = buildBc1Palette4(c0, c1);
  const idxs = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    const r = blockRgb[i * 3];
    const g = blockRgb[i * 3 + 1];
    const b = blockRgb[i * 3 + 2];
    let bestK = 0;
    let bestErr = Number.POSITIVE_INFINITY;
    for (let k = 0; k < 4; k += 1) {
      const entry = pal[k];
      if (!entry) continue;
      const dr = r - entry[0];
      const dg = g - entry[1];
      const db = b - entry[2];
      const err = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
      if (err < bestErr) {
        bestErr = err;
        bestK = k;
      }
    }
    idxs[i] = bestK;
  }
  return idxs;
}

function encodeColorBlock4x4(blockRgb: Uint8Array, out: Uint8Array, outOffset: number): void {
  let meanR = 0;
  let meanG = 0;
  let meanB = 0;
  for (let i = 0; i < 16; i += 1) {
    meanR += blockRgb[i * 3];
    meanG += blockRgb[i * 3 + 1];
    meanB += blockRgb[i * 3 + 2];
  }
  meanR /= 16;
  meanG /= 16;
  meanB /= 16;

  let covRR = 0;
  let covRG = 0;
  let covRB = 0;
  let covGG = 0;
  let covGB = 0;
  let covBB = 0;
  for (let i = 0; i < 16; i += 1) {
    const dr = blockRgb[i * 3] - meanR;
    const dg = blockRgb[i * 3 + 1] - meanG;
    const db = blockRgb[i * 3 + 2] - meanB;
    covRR += dr * dr;
    covRG += dr * dg;
    covRB += dr * db;
    covGG += dg * dg;
    covGB += dg * db;
    covBB += db * db;
  }

  let axR = 0.299;
  let axG = 0.587;
  let axB = 0.114;
  for (let iter = 0; iter < 6; iter += 1) {
    const nr = covRR * axR + covRG * axG + covRB * axB;
    const ng = covRG * axR + covGG * axG + covGB * axB;
    const nb = covRB * axR + covGB * axG + covBB * axB;
    const nLen = Math.hypot(nr, ng, nb);
    if (nLen <= EPS) break;
    axR = nr / nLen;
    axG = ng / nLen;
    axB = nb / nLen;
  }

  let minProj = Number.POSITIVE_INFINITY;
  let maxProj = Number.NEGATIVE_INFINITY;
  let minIdx = 0;
  let maxIdx = 0;
  for (let i = 0; i < 16; i += 1) {
    const proj = (blockRgb[i * 3] - meanR) * axR + (blockRgb[i * 3 + 1] - meanG) * axG + (blockRgb[i * 3 + 2] - meanB) * axB;
    if (proj < minProj) {
      minProj = proj;
      minIdx = i;
    }
    if (proj > maxProj) {
      maxProj = proj;
      maxIdx = i;
    }
  }

  let c0 = encodeRgb565(blockRgb[maxIdx * 3], blockRgb[maxIdx * 3 + 1], blockRgb[maxIdx * 3 + 2]);
  let c1 = encodeRgb565(blockRgb[minIdx * 3], blockRgb[minIdx * 3 + 1], blockRgb[minIdx * 3 + 2]);
  if (c0 < c1) [c0, c1] = [c1, c0];

  let indices = pickBc1Indices(blockRgb, c0, c1);
  const w0Table = [1, 0, 2 / 3, 1 / 3];
  const w1Table = [0, 1, 1 / 3, 2 / 3];
  let aa = 0;
  let bb = 0;
  let ab = 0;
  let ar = 0;
  let ag = 0;
  let aBlue = 0;
  let br = 0;
  let bg = 0;
  let bBlue = 0;
  for (let i = 0; i < 16; i += 1) {
    const w0 = w0Table[indices[i]] ?? 0;
    const w1 = w1Table[indices[i]] ?? 0;
    aa += w0 * w0;
    bb += w1 * w1;
    ab += w0 * w1;
    ar += w0 * blockRgb[i * 3];
    ag += w0 * blockRgb[i * 3 + 1];
    aBlue += w0 * blockRgb[i * 3 + 2];
    br += w1 * blockRgb[i * 3];
    bg += w1 * blockRgb[i * 3 + 1];
    bBlue += w1 * blockRgb[i * 3 + 2];
  }
  const det = aa * bb - ab * ab;
  if (Math.abs(det) > 1e-4) {
    let ref0 = encodeRgb565((bb * ar - ab * br) / det, (bb * ag - ab * bg) / det, (bb * aBlue - ab * bBlue) / det);
    let ref1 = encodeRgb565((aa * br - ab * ar) / det, (aa * bg - ab * ag) / det, (aa * bBlue - ab * aBlue) / det);
    if (ref0 < ref1) [ref0, ref1] = [ref1, ref0];
    c0 = ref0;
    c1 = ref1;
    indices = pickBc1Indices(blockRgb, c0, c1);
  }

  out[outOffset] = c0 & 0xff;
  out[outOffset + 1] = (c0 >>> 8) & 0xff;
  out[outOffset + 2] = c1 & 0xff;
  out[outOffset + 3] = (c1 >>> 8) & 0xff;

  let bits = 0;
  for (let i = 0; i < 16; i += 1) bits |= (indices[i] & 0x3) << (i * 2);
  out[outOffset + 4] = bits & 0xff;
  out[outOffset + 5] = (bits >>> 8) & 0xff;
  out[outOffset + 6] = (bits >>> 16) & 0xff;
  out[outOffset + 7] = (bits >>> 24) & 0xff;
}

function encodeAlphaBlock4x4(blockAlpha: Uint8Array, out: Uint8Array, outOffset: number): void {
  let minA = 255;
  let maxA = 0;
  for (let i = 0; i < 16; i += 1) {
    if (blockAlpha[i] < minA) minA = blockAlpha[i];
    if (blockAlpha[i] > maxA) maxA = blockAlpha[i];
  }
  out[outOffset] = maxA;
  out[outOffset + 1] = minA;

  const lut = new Uint8Array(8);
  lut[0] = maxA;
  lut[1] = minA;
  if (maxA > minA) {
    for (let k = 1; k <= 6; k += 1) lut[k + 1] = Math.round(((7 - k) * maxA + k * minA) / 7);
  } else {
    lut.fill(maxA);
  }

  let low24 = 0;
  let high24 = 0;
  for (let i = 0; i < 16; i += 1) {
    const val = blockAlpha[i];
    let bestK = 0;
    let bestDiff = 256;
    for (let k = 0; k < 8; k += 1) {
      const d = Math.abs(val - lut[k]);
      if (d < bestDiff) {
        bestDiff = d;
        bestK = k;
      }
    }
    if (i < 8) low24 |= (bestK & 0x7) << (i * 3);
    else high24 |= (bestK & 0x7) << ((i - 8) * 3);
  }
  out[outOffset + 2] = low24 & 0xff;
  out[outOffset + 3] = (low24 >>> 8) & 0xff;
  out[outOffset + 4] = (low24 >>> 16) & 0xff;
  out[outOffset + 5] = high24 & 0xff;
  out[outOffset + 6] = (high24 >>> 8) & 0xff;
  out[outOffset + 7] = (high24 >>> 16) & 0xff;
}

/** 4×4 블록 엔드포인트+2비트 인덱스 압축 텍스처를 RGBA8 버퍼로 디코딩한다. */
export function decompressBlockTexture(
  compressed: Pick<CompressedBlockTexture, "mode" | "width" | "height" | "blocksX" | "blocksY" | "bytesPerBlock" | "blocks">,
): RgbaTextureBuffer {
  const { mode, width, height, blocksX, blocksY, bytesPerBlock, blocks } = compressed;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const alphaLut = new Uint8Array(8);

  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const blockOffset = (by * blocksX + bx) * bytesPerBlock;
      let colorOffset = blockOffset;
      let low24 = 0;
      let high24 = 0;

      if (mode === "bc3-rgba-4to1") {
        const a0 = blocks[blockOffset];
        const a1 = blocks[blockOffset + 1];
        alphaLut[0] = a0;
        alphaLut[1] = a1;
        if (a0 > a1) {
          for (let k = 1; k <= 6; k += 1) alphaLut[k + 1] = Math.round(((7 - k) * a0 + k * a1) / 7);
        } else {
          alphaLut.fill(a0);
        }
        low24 = blocks[blockOffset + 2] | (blocks[blockOffset + 3] << 8) | (blocks[blockOffset + 4] << 16);
        high24 = blocks[blockOffset + 5] | (blocks[blockOffset + 6] << 8) | (blocks[blockOffset + 7] << 16);
        colorOffset = blockOffset + 8;
      }

      const c0 = blocks[colorOffset] | (blocks[colorOffset + 1] << 8);
      const c1 = blocks[colorOffset + 2] | (blocks[colorOffset + 3] << 8);
      const pal = buildBc1Palette4(c0, c1);
      const idxBits =
        (blocks[colorOffset + 4] |
          (blocks[colorOffset + 5] << 8) |
          (blocks[colorOffset + 6] << 16) |
          (blocks[colorOffset + 7] << 24)) >>>
        0;

      for (let py = 0; py < 4; py += 1) {
        const y = by * 4 + py;
        if (y >= height) continue;
        for (let px = 0; px < 4; px += 1) {
          const x = bx * 4 + px;
          if (x >= width) continue;
          const pIdx = py * 4 + px;
          const rgb = pal[(idxBits >>> (pIdx * 2)) & 0x3] ?? [0, 0, 0];
          const alpha =
            mode === "bc3-rgba-4to1"
              ? alphaLut[pIdx < 8 ? (low24 >>> (pIdx * 3)) & 0x7 : (high24 >>> ((pIdx - 8) * 3)) & 0x7]
              : 255;
          const dst = (y * width + x) * 4;
          rgba[dst] = rgb[0];
          rgba[dst + 1] = rgb[1];
          rgba[dst + 2] = rgb[2];
          rgba[dst + 3] = alpha;
        }
      }
    }
  }
  return { width, height, rgba };
}

/** 원본과 복원 RGBA8 텍스처 간 MSE 및 PSNR(dB) 텔레메트리를 산출한다. */
export function computeTexturePsnrMetrics(
  original: Uint8ClampedArray,
  reconstructed: Uint8ClampedArray,
): {
  readonly mseRgb: number;
  readonly psnrRgbDb: number;
  readonly psnrRgbaDb: number;
  readonly maxChannelError: number;
} {
  const pixelCount = Math.floor(Math.min(original.length, reconstructed.length) / 4);
  if (pixelCount <= 0) return { mseRgb: 0, psnrRgbDb: 99, psnrRgbaDb: 99, maxChannelError: 0 };
  let sqRgb = 0;
  let sqRgba = 0;
  let maxErr = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const o = i * 4;
    const dr = original[o] - reconstructed[o];
    const dg = original[o + 1] - reconstructed[o + 1];
    const db = original[o + 2] - reconstructed[o + 2];
    const da = original[o + 3] - reconstructed[o + 3];
    const rgbSq = dr * dr + dg * dg + db * db;
    sqRgb += rgbSq;
    sqRgba += rgbSq + da * da;
    maxErr = Math.max(maxErr, Math.abs(dr), Math.abs(dg), Math.abs(db), Math.abs(da));
  }
  const mseRgb = sqRgb / (pixelCount * 3);
  const mseRgba = sqRgba / (pixelCount * 4);
  return {
    mseRgb,
    psnrRgbDb: mseRgb <= 1e-9 ? 99 : 10 * Math.log10((255 * 255) / mseRgb),
    psnrRgbaDb: mseRgba <= 1e-9 ? 99 : 10 * Math.log10((255 * 255) / mseRgba),
    maxChannelError: maxErr,
  };
}

/** RGBA8 텍스처를 4×4 블록 8:1(`bc1-rgb565-8to1`) 또는 4:1(`bc3-rgba-4to1`) 포맷으로 압축한다. */
export function compressBlockTexture(
  input: RgbaTextureBuffer,
  mode: BlockCodecMode = "bc1-rgb565-8to1",
): CompressedBlockTexture {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const bytesPerBlock: 8 | 16 = mode === "bc3-rgba-4to1" ? 16 : 8;
  const blocks = new Uint8Array(blocksX * blocksY * bytesPerBlock);
  const blockRgb = new Uint8Array(16 * 3);
  const blockAlpha = new Uint8Array(16);

  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      for (let py = 0; py < 4; py += 1) {
        const sy = Math.min(height - 1, by * 4 + py);
        for (let px = 0; px < 4; px += 1) {
          const sx = Math.min(width - 1, bx * 4 + px);
          const src = (sy * width + sx) * 4;
          const pIdx = py * 4 + px;
          blockRgb[pIdx * 3] = input.rgba[src];
          blockRgb[pIdx * 3 + 1] = input.rgba[src + 1];
          blockRgb[pIdx * 3 + 2] = input.rgba[src + 2];
          blockAlpha[pIdx] = input.rgba[src + 3];
        }
      }
      const outOffset = (by * blocksX + bx) * bytesPerBlock;
      if (mode === "bc3-rgba-4to1") {
        encodeAlphaBlock4x4(blockAlpha, blocks, outOffset);
        encodeColorBlock4x4(blockRgb, blocks, outOffset + 8);
      } else {
        encodeColorBlock4x4(blockRgb, blocks, outOffset);
      }
    }
  }

  const decoded = decompressBlockTexture({ mode, width, height, blocksX, blocksY, bytesPerBlock, blocks });
  const psnr = computeTexturePsnrMetrics(input.rgba, decoded.rgba);
  const rawByteLength = width * height * 4;
  return {
    mode,
    width,
    height,
    blocksX,
    blocksY,
    bytesPerBlock,
    blocks,
    telemetry: {
      mode,
      width,
      height,
      blocksX,
      blocksY,
      bytesPerBlock,
      rawByteLength,
      compressedByteLength: blocks.byteLength,
      compressionRatio: blocks.byteLength > 0 ? rawByteLength / blocks.byteLength : 1,
      mseRgb: psnr.mseRgb,
      psnrRgbDb: psnr.psnrRgbDb,
      psnrRgbaDb: psnr.psnrRgbaDb,
      maxChannelError: psnr.maxChannelError,
    },
  };
}
