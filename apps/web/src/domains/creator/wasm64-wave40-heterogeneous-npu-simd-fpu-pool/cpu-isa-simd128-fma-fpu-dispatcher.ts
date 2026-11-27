/**
 * Wave 40 — CPU/WASM 명령어 세트(SIMD128 · Relaxed-SIMD · FMA · VNNI) 디스패처,
 * IEEE-754 FP16/BF16 ↔ FP32 고속 일괄 변환기 및 64바이트 캐시라인 정렬 SoA 타일 FMA 커널.
 */

export const SIMD_CACHE_LINE_BYTES = 64;
export const MAX_SOA_SCALAR_EQUIVALENCE_EPSILON = 1e-6;

export type HostCpuArchitectureHint = "arm64-neon-amx" | "x86_64-avx2-fma" | "x86_64-avx512-vnni" | "scalar-ieee754";
export type SimdKernelTier = "wasm-relaxed-simd-fma" | "wasm-simd128" | "scalar-ieee754";
export type SimdLaneWidth = 4 | 8 | 16;

export interface WasmSimdInstructionSupport {
  readonly simd128: boolean;
  readonly relaxedFmaF32x4: boolean;
  readonly relaxedDotI8x16I7x16AddS: boolean;
  readonly relaxedLaneSelect: boolean;
}

export interface CpuIsaProbeEnvironment {
  readonly arch?: string;
  readonly platform?: string;
  readonly userAgent?: string;
  readonly cpuFlags?: readonly string[];
  readonly hardwareConcurrency?: number;
  readonly wasmOverride?: Partial<WasmSimdInstructionSupport>;
}

export interface CpuIsaCapabilities extends WasmSimdInstructionSupport {
  readonly relaxedSimd: boolean;
  readonly hostArchHint: HostCpuArchitectureHint;
  readonly logicalCores: number;
  readonly cacheLineBytes: 64;
}

export interface SimdKernelDispatchPlan {
  readonly tier: SimdKernelTier;
  readonly hostArchHint: HostCpuArchitectureHint;
  readonly laneWidth: SimdLaneWidth;
  readonly useFmaPipeline: boolean;
  readonly useInt8DotProduct: boolean;
  readonly useBranchlessLaneSelect: boolean;
  readonly cacheLineBytes: 64;
  readonly workerTileConcurrency: number;
  readonly estimatedThroughputGflops: number;
}

export interface AlignedSoATileBuffer {
  readonly buffer: ArrayBuffer;
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly paddedLength: number;
  readonly byteAlignment: 64;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly a: Float32Array;
}

export interface BrushFalloffDabParams {
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusPx: number;
  readonly hardness: number;
  readonly opacity: number;
  readonly colorR: number;
  readonly colorG: number;
  readonly colorB: number;
}

export interface SoAScalarEquivalenceReport {
  readonly passed: boolean;
  readonly maxAbsError: number;
  readonly rmsError: number;
  readonly tolerance: number;
  readonly laneWidth: SimdLaneWidth;
  readonly cacheLineAligned: boolean;
}

const f32ScratchBuffer = new ArrayBuffer(4);
const f32ScratchView = new Float32Array(f32ScratchBuffer);
const u32ScratchView = new Uint32Array(f32ScratchBuffer);

function buildTernaryV128ProbeWasm(simdOpcodeLeb128: readonly number[]): Uint8Array<ArrayBuffer> {
  const bodyLength = 58 + simdOpcodeLeb128.length;
  const bytes: number[] = [
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
    0x03, 0x02, 0x01, 0x00,
    0x0a, bodyLength + 2, 0x01, bodyLength, 0x00,
  ];
  for (let i = 0; i < 3; i += 1) {
    bytes.push(0xfd, 0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
  bytes.push(0xfd, ...simdOpcodeLeb128, 0x1a, 0x0b);
  return new Uint8Array(bytes);
}

function validateWasmProbe(bytes: Uint8Array<ArrayBuffer>): boolean {
  if (typeof WebAssembly === "undefined" || typeof WebAssembly.validate !== "function") return false;
  try {
    return WebAssembly.validate(bytes);
  } catch {
    return false;
  }
}

export function probeWasmInstructionSupport(): WasmSimdInstructionSupport {
  const simd128 = validateWasmProbe(buildTernaryV128ProbeWasm([0x52]));
  if (!simd128) {
    return { simd128: false, relaxedFmaF32x4: false, relaxedDotI8x16I7x16AddS: false, relaxedLaneSelect: false };
  }
  return {
    simd128: true,
    relaxedFmaF32x4: validateWasmProbe(buildTernaryV128ProbeWasm([0x85, 0x02])),
    relaxedDotI8x16I7x16AddS: validateWasmProbe(buildTernaryV128ProbeWasm([0x93, 0x02])),
    relaxedLaneSelect: validateWasmProbe(buildTernaryV128ProbeWasm([0x89, 0x02])),
  };
}

function inferHostArchitectureHint(env: CpuIsaProbeEnvironment | undefined, simd128: boolean): HostCpuArchitectureHint {
  if (!simd128) return "scalar-ieee754";
  const archRaw = [
    env?.arch ?? (typeof process !== "undefined" ? process.arch : ""),
    env?.platform ?? (typeof navigator !== "undefined" ? navigator.platform : ""),
    env?.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : ""),
    ...(env?.cpuFlags ?? []),
  ].join(" ").toLowerCase();
  if (/arm64|aarch64|apple|neon|amx/u.test(archRaw)) return "arm64-neon-amx";
  if (/avx512|avx-512|vnni/u.test(archRaw)) return "x86_64-avx512-vnni";
  if (/x64|x86_64|amd64|win64|avx2|fma/u.test(archRaw)) return "x86_64-avx2-fma";
  return "scalar-ieee754";
}

export function detectCpuIsaCapabilities(env?: CpuIsaProbeEnvironment): CpuIsaCapabilities {
  const probed = probeWasmInstructionSupport();
  const simd128 = env?.wasmOverride?.simd128 ?? probed.simd128;
  const relaxedFmaF32x4 = simd128 && (env?.wasmOverride?.relaxedFmaF32x4 ?? probed.relaxedFmaF32x4);
  const relaxedDotI8x16I7x16AddS = simd128 && (env?.wasmOverride?.relaxedDotI8x16I7x16AddS ?? probed.relaxedDotI8x16I7x16AddS);
  const relaxedLaneSelect = simd128 && (env?.wasmOverride?.relaxedLaneSelect ?? probed.relaxedLaneSelect);
  const fallbackCores = typeof navigator !== "undefined" && navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : 4;
  const logicalCores = Math.max(1, Math.min(64, Math.trunc(env?.hardwareConcurrency ?? fallbackCores)));
  return {
    simd128,
    relaxedFmaF32x4,
    relaxedDotI8x16I7x16AddS,
    relaxedLaneSelect,
    relaxedSimd: relaxedFmaF32x4 && relaxedDotI8x16I7x16AddS && relaxedLaneSelect,
    hostArchHint: inferHostArchitectureHint(env, simd128),
    logicalCores,
    cacheLineBytes: SIMD_CACHE_LINE_BYTES,
  };
}

export function selectOptimalSimdKernelDispatch(capabilities: CpuIsaCapabilities, pixelCount = 4096): SimdKernelDispatchPlan {
  const workerTileConcurrency = Math.max(1, Math.min(capabilities.logicalCores, 16));
  if (!capabilities.simd128) {
    return {
      tier: "scalar-ieee754",
      hostArchHint: "scalar-ieee754",
      laneWidth: 4,
      useFmaPipeline: false,
      useInt8DotProduct: false,
      useBranchlessLaneSelect: false,
      cacheLineBytes: SIMD_CACHE_LINE_BYTES,
      workerTileConcurrency,
      estimatedThroughputGflops: Number((1.6 * workerTileConcurrency).toFixed(2)),
    };
  }
  let laneWidth: SimdLaneWidth = 4;
  if (pixelCount >= 256 && capabilities.hostArchHint === "x86_64-avx512-vnni") {
    laneWidth = 16;
  } else if (pixelCount >= 128 && (capabilities.hostArchHint !== "scalar-ieee754" || capabilities.relaxedFmaF32x4)) {
    laneWidth = pixelCount >= 1024 && capabilities.relaxedSimd ? 16 : 8;
  }
  const baseGflops = capabilities.hostArchHint === "x86_64-avx512-vnni" ? 28 : capabilities.hostArchHint === "arm64-neon-amx" ? 24 : capabilities.hostArchHint === "x86_64-avx2-fma" ? 20 : 12;
  const fmaBoost = capabilities.relaxedFmaF32x4 ? 1.35 : 1.0;
  return {
    tier: capabilities.relaxedFmaF32x4 ? "wasm-relaxed-simd-fma" : "wasm-simd128",
    hostArchHint: capabilities.hostArchHint,
    laneWidth,
    useFmaPipeline: capabilities.relaxedFmaF32x4,
    useInt8DotProduct: capabilities.relaxedDotI8x16I7x16AddS,
    useBranchlessLaneSelect: capabilities.relaxedLaneSelect,
    cacheLineBytes: SIMD_CACHE_LINE_BYTES,
    workerTileConcurrency,
    estimatedThroughputGflops: Number((baseGflops * fmaBoost * workerTileConcurrency).toFixed(2)),
  };
}

function f32BitsFromNumber(value: number): number {
  f32ScratchView[0] = value;
  return u32ScratchView[0] ?? 0;
}

function numberFromF32Bits(bits: number): number {
  u32ScratchView[0] = bits >>> 0;
  return f32ScratchView[0] ?? 0;
}

function float32BitsToFloat16BitsInternal(f32Bits: number): number {
  const sign = (f32Bits >>> 16) & 0x8000;
  const exp = (f32Bits >>> 23) & 0xff;
  const mantissa = f32Bits & 0x007fffff;
  if (exp === 0xff) return mantissa === 0 ? sign | 0x7c00 : sign | 0x7e00 | (mantissa >>> 13);
  if (exp === 0) return sign;
  const unbiasedExp = exp - 127;
  if (unbiasedExp > 15) return sign | 0x7c00;
  if (unbiasedExp >= -14) {
    const fp16Exp = unbiasedExp + 15;
    const fp16Mant = mantissa >>> 13;
    const dropped = mantissa & 0x1fff;
    const roundUp = dropped > 0x1000 || (dropped === 0x1000 && (fp16Mant & 1) === 1);
    return sign | (((fp16Exp << 10) + fp16Mant + (roundUp ? 1 : 0)) & 0x7fff);
  }
  if (unbiasedExp >= -25) {
    const significand = 0x00800000 | mantissa;
    const shift = -1 - unbiasedExp;
    const subMant = shift === 24 ? 0 : significand >>> shift;
    const halfBit = 1 << (shift - 1);
    const dropped = significand & ((halfBit << 1) - 1);
    const roundUp = dropped > halfBit || (dropped === halfBit && (subMant & 1) === 1);
    return sign | ((subMant + (roundUp ? 1 : 0)) & 0x7fff);
  }
  return sign;
}

function float16BitsToFloat32BitsInternal(bits: number): number {
  const h = bits & 0xffff;
  const sign = ((h & 0x8000) << 16) >>> 0;
  const exp = (h >>> 10) & 0x1f;
  const mant = h & 0x03ff;
  if (exp === 0) {
    if (mant === 0) return sign;
    let normMant = mant;
    let unbiasedExp = -14;
    while ((normMant & 0x0400) === 0) {
      normMant <<= 1;
      unbiasedExp -= 1;
    }
    return (sign | ((unbiasedExp + 127) << 23) | ((normMant & 0x03ff) << 13)) >>> 0;
  }
  if (exp === 0x1f) return mant === 0 ? (sign | 0x7f800000) >>> 0 : (sign | 0x7fc00000 | (mant << 13)) >>> 0;
  return (sign | ((exp - 15 + 127) << 23) | (mant << 13)) >>> 0;
}

function float32BitsToBfloat16BitsInternal(f32Bits: number): number {
  const exp = (f32Bits >>> 23) & 0xff;
  const mant = f32Bits & 0x007fffff;
  if (exp === 0xff) return mant === 0 ? (f32Bits >>> 16) & 0xffff : ((f32Bits >>> 16) | 0x0040) & 0xffff;
  const lsb = (f32Bits >>> 16) & 1;
  return (((f32Bits + 0x7fff + lsb) >>> 0) >>> 16) & 0xffff;
}

export function float32ToFloat16Bits(value: number): number {
  return float32BitsToFloat16BitsInternal(f32BitsFromNumber(value));
}
export function float16BitsToFloat32(bits: number): number {
  return numberFromF32Bits(float16BitsToFloat32BitsInternal(bits));
}
export function float32ToBfloat16Bits(value: number): number {
  return float32BitsToBfloat16BitsInternal(f32BitsFromNumber(value));
}
export function bfloat16BitsToFloat32(bits: number): number {
  return numberFromF32Bits(((bits & 0xffff) << 16) >>> 0);
}

function encodeF32BatchToU16(src: Float32Array, encodeFn: (f32Bits: number) => number, dst?: Uint16Array): Uint16Array {
  const out = dst && dst.length >= src.length ? dst : new Uint16Array(src.length);
  const alignedU32 = src.byteOffset % 4 === 0 ? new Uint32Array(src.buffer, src.byteOffset, src.length) : null;
  for (let i = 0; i < src.length; i += 1) {
    out[i] = encodeFn(alignedU32 ? (alignedU32[i] ?? 0) : f32BitsFromNumber(src[i] ?? 0));
  }
  return out;
}

function decodeU16BatchToF32(src: Uint16Array, decodeFn: (u16Bits: number) => number, dst?: Float32Array): Float32Array {
  const out = dst && dst.length >= src.length ? dst : new Float32Array(src.length);
  const alignedU32 = out.byteOffset % 4 === 0 ? new Uint32Array(out.buffer, out.byteOffset, src.length) : null;
  for (let i = 0; i < src.length; i += 1) {
    const f32Bits = decodeFn(src[i] ?? 0);
    if (alignedU32) alignedU32[i] = f32Bits;
    else out[i] = numberFromF32Bits(f32Bits);
  }
  return out;
}

export function convertFloat32ToFloat16Batch(src: Float32Array, dst?: Uint16Array): Uint16Array {
  return encodeF32BatchToU16(src, float32BitsToFloat16BitsInternal, dst);
}
export function convertFloat16ToFloat32Batch(src: Uint16Array, dst?: Float32Array): Float32Array {
  return decodeU16BatchToF32(src, float16BitsToFloat32BitsInternal, dst);
}
export function convertFloat32ToBfloat16Batch(src: Float32Array, dst?: Uint16Array): Uint16Array {
  return encodeF32BatchToU16(src, float32BitsToBfloat16BitsInternal, dst);
}
export function convertBfloat16ToFloat32Batch(src: Uint16Array, dst?: Float32Array): Float32Array {
  return decodeU16BatchToF32(src, (b) => (((b & 0xffff) << 16) >>> 0), dst);
}

export function createAlignedSoATileBuffer(width: number, height: number): AlignedSoATileBuffer {
  const safeW = Math.max(1, Math.trunc(width));
  const safeH = Math.max(1, Math.trunc(height));
  const pixelCount = safeW * safeH;
  const elemsPerLine = SIMD_CACHE_LINE_BYTES / Float32Array.BYTES_PER_ELEMENT;
  const paddedLength = Math.ceil(pixelCount / elemsPerLine) * elemsPerLine;
  const planeBytes = paddedLength * Float32Array.BYTES_PER_ELEMENT;
  const buffer = new ArrayBuffer(planeBytes * 4);
  return {
    buffer,
    width: safeW,
    height: safeH,
    pixelCount,
    paddedLength,
    byteAlignment: SIMD_CACHE_LINE_BYTES,
    r: new Float32Array(buffer, 0, paddedLength),
    g: new Float32Array(buffer, planeBytes, paddedLength),
    b: new Float32Array(buffer, planeBytes * 2, paddedLength),
    a: new Float32Array(buffer, planeBytes * 3, paddedLength),
  };
}

export function interleavedRgbaToAlignedSoA(rgba: Float32Array, width: number, height: number): AlignedSoATileBuffer {
  const tile = createAlignedSoATileBuffer(width, height);
  const count = Math.min(tile.pixelCount, Math.floor(rgba.length / 4));
  for (let i = 0; i < count; i += 1) {
    const base = i * 4;
    tile.r[i] = rgba[base] ?? 0;
    tile.g[i] = rgba[base + 1] ?? 0;
    tile.b[i] = rgba[base + 2] ?? 0;
    tile.a[i] = rgba[base + 3] ?? 0;
  }
  return tile;
}

export function alignedSoAToInterleavedRgba(tile: AlignedSoATileBuffer, out?: Float32Array): Float32Array {
  const needed = tile.pixelCount * 4;
  const target = out && out.length >= needed ? out : new Float32Array(needed);
  for (let i = 0; i < tile.pixelCount; i += 1) {
    const base = i * 4;
    target[base] = tile.r[i] ?? 0;
    target[base + 1] = tile.g[i] ?? 0;
    target[base + 2] = tile.b[i] ?? 0;
    target[base + 3] = tile.a[i] ?? 0;
  }
  return target;
}

function fmaF32(a: number, b: number, c: number): number {
  return Math.fround(Math.fround(a) * Math.fround(b) + Math.fround(c));
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function executeSoATileBrushFalloffFma(
  tile: AlignedSoATileBuffer,
  dab: BrushFalloffDabParams,
  laneWidth: SimdLaneWidth = 8,
): void {
  const invRadius = Math.fround(1 / Math.max(dab.radiusPx, 1e-5));
  const hardness = Math.fround(clamp01(dab.hardness));
  const invSoftSpan = Math.fround(1 / Math.max(1 - hardness, 1e-5));
  const opacity = Math.fround(clamp01(dab.opacity));
  const colR = Math.fround(clamp01(dab.colorR));
  const colG = Math.fround(clamp01(dab.colorG));
  const colB = Math.fround(clamp01(dab.colorB));
  const cx = Math.fround(dab.centerX);
  const cy = Math.fround(dab.centerY);
  const { r, g, b, a, width, pixelCount } = tile;

  for (let baseIdx = 0; baseIdx < pixelCount; baseIdx += laneWidth) {
    const chunkEnd = Math.min(pixelCount, baseIdx + laneWidth);
    for (let idx = baseIdx; idx < chunkEnd; idx += 1) {
      const px = Math.fround((idx % width) + 0.5 - cx);
      const py = Math.fround(Math.floor(idx / width) + 0.5 - cy);
      const distNorm = Math.fround(Math.hypot(px, py) * invRadius);
      if (distNorm >= 1) continue;
      const t = clamp01(Math.fround((distNorm - hardness) * invSoftSpan));
      const falloff = fmaF32(-Math.fround(t * t), fmaF32(-2, t, 3), 1);
      const srcA = Math.fround(opacity * falloff);
      const invSrcA = Math.fround(1 - srcA);
      r[idx] = fmaF32(r[idx] ?? 0, invSrcA, Math.fround(colR * srcA));
      g[idx] = fmaF32(g[idx] ?? 0, invSrcA, Math.fround(colG * srcA));
      b[idx] = fmaF32(b[idx] ?? 0, invSrcA, Math.fround(colB * srcA));
      a[idx] = fmaF32(a[idx] ?? 0, invSrcA, srcA);
    }
  }
}

export function executeScalarReferenceTileBrush(
  rgba: Float32Array,
  width: number,
  height: number,
  dab: BrushFalloffDabParams,
): Float32Array {
  const out = new Float32Array(rgba);
  const invRadius = 1 / Math.max(dab.radiusPx, 1e-5);
  const hardness = clamp01(dab.hardness);
  const invSoftSpan = 1 / Math.max(1 - hardness, 1e-5);
  const opacity = clamp01(dab.opacity);
  const colR = clamp01(dab.colorR);
  const colG = clamp01(dab.colorG);
  const colB = clamp01(dab.colorB);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distNorm = Math.hypot(x + 0.5 - dab.centerX, y + 0.5 - dab.centerY) * invRadius;
      if (distNorm >= 1) continue;
      const t = clamp01((distNorm - hardness) * invSoftSpan);
      const srcA = opacity * (1 - t * t * (3 - 2 * t));
      const invSrcA = 1 - srcA;
      const base = (y * width + x) * 4;
      out[base] = (out[base] ?? 0) * invSrcA + colR * srcA;
      out[base + 1] = (out[base + 1] ?? 0) * invSrcA + colG * srcA;
      out[base + 2] = (out[base + 2] ?? 0) * invSrcA + colB * srcA;
      out[base + 3] = (out[base + 3] ?? 0) * invSrcA + srcA;
    }
  }
  return out;
}

export function compositeAlignedSoATilesPremultipliedFma(
  dst: AlignedSoATileBuffer,
  src: AlignedSoATileBuffer,
  opacityScale = 1,
  laneWidth: SimdLaneWidth = 8,
): void {
  const scale = Math.fround(clamp01(opacityScale));
  const count = Math.min(dst.pixelCount, src.pixelCount);
  for (let base = 0; base < count; base += laneWidth) {
    const end = Math.min(count, base + laneWidth);
    for (let i = base; i < end; i += 1) {
      const effA = Math.fround((src.a[i] ?? 0) * scale);
      const invA = Math.fround(1 - effA);
      dst.r[i] = fmaF32(dst.r[i] ?? 0, invA, Math.fround((src.r[i] ?? 0) * scale));
      dst.g[i] = fmaF32(dst.g[i] ?? 0, invA, Math.fround((src.g[i] ?? 0) * scale));
      dst.b[i] = fmaF32(dst.b[i] ?? 0, invA, Math.fround((src.b[i] ?? 0) * scale));
      dst.a[i] = fmaF32(dst.a[i] ?? 0, invA, effA);
    }
  }
}

export function verifySoAFmaKernelEquivalence(
  width: number,
  height: number,
  dab: BrushFalloffDabParams,
  laneWidth: SimdLaneWidth = 8,
  baseRgba?: Float32Array,
): SoAScalarEquivalenceReport {
  const pixelCount = Math.max(1, Math.trunc(width)) * Math.max(1, Math.trunc(height));
  const initial = baseRgba ?? new Float32Array(pixelCount * 4);
  const soaTile = interleavedRgbaToAlignedSoA(initial, width, height);
  executeSoATileBrushFalloffFma(soaTile, dab, laneWidth);
  const actual = alignedSoAToInterleavedRgba(soaTile);
  const reference = executeScalarReferenceTileBrush(initial, width, height, dab);

  let maxAbsError = 0;
  let sumSqError = 0;
  for (let i = 0; i < actual.length; i += 1) {
    const diff = Math.abs((actual[i] ?? 0) - (reference[i] ?? 0));
    if (diff > maxAbsError) maxAbsError = diff;
    sumSqError += diff * diff;
  }
  const cacheLineAligned =
    soaTile.r.byteOffset % SIMD_CACHE_LINE_BYTES === 0 &&
    soaTile.g.byteOffset % SIMD_CACHE_LINE_BYTES === 0 &&
    soaTile.b.byteOffset % SIMD_CACHE_LINE_BYTES === 0 &&
    soaTile.a.byteOffset % SIMD_CACHE_LINE_BYTES === 0;

  return {
    passed: cacheLineAligned && maxAbsError <= MAX_SOA_SCALAR_EQUIVALENCE_EPSILON,
    maxAbsError,
    rmsError: Math.sqrt(sumSqError / Math.max(1, actual.length)),
    tolerance: MAX_SOA_SCALAR_EQUIVALENCE_EPSILON,
    laneWidth,
    cacheLineAligned,
  };
}
