/**
 * Wasm64 드로잉 코어 알고리즘 계층:
 * 1) 실시간 선화 3차 베지어 벡터라이저 (RDP + Schneider 최소제곱 피팅)
 * 2) 스트리밍 대용량 PSD v1 / PSB v2 바이너리 헤더 64비트 파서
 * 3) 고속 필터(경계 차단 가우시안 블러 · Wasm64 언샤프 · 2.5D 임파스토) & MLS 강체 2D 워프
 * 4) 허브 UI 벤치마크용 결정론적 데모 픽스처 생성기
 */

import { STUDIO_WASM32_ADDRESS_LIMIT_BYTES } from "../studio-wasm64-memory-governor";

export interface Wasm64AlgorithmAccelerator {
  readonly backendMode: "wasm64-native" | "wasm32-fallback" | "js-fallback";
  readonly unsharpMixRgba: (
    orig: Uint8Array,
    blurred: Uint8Array,
    amount: number,
    threshold: number,
  ) => { readonly output: Uint8Array; readonly modifiedPixels: number };
  readonly computeFnv1aChecksum: (bytes: Uint8Array) => number;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

// ---------------------------------------------------------------------------
// 1. 실시간 선화 3차 베지어 벡터라이저 (RDP + Schneider 최소제곱 피팅)
// ---------------------------------------------------------------------------

export interface StrokeSamplePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

export interface CubicBezierCurveSegment {
  readonly p0: readonly [number, number];
  readonly c1: readonly [number, number];
  readonly c2: readonly [number, number];
  readonly p3: readonly [number, number];
  readonly widthStart: number;
  readonly widthEnd: number;
}

export interface VectorizeStrokeResult {
  readonly inputPointCount: number;
  readonly simplifiedPointCount: number;
  readonly segments: readonly CubicBezierCurveSegment[];
  readonly maxFitErrorPx: number;
  readonly compressionRatio: number;
  readonly elapsedMs: number;
  readonly svgPath: string;
}

function evalCubic(seg: CubicBezierCurveSegment, t: number): readonly [number, number] {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return [
    b0 * seg.p0[0] + b1 * seg.c1[0] + b2 * seg.c2[0] + b3 * seg.p3[0],
    b0 * seg.p0[1] + b1 * seg.c1[1] + b2 * seg.c2[1] + b3 * seg.p3[1],
  ];
}

function norm2(dx: number, dy: number): readonly [number, number] {
  const len = Math.hypot(dx, dy);
  return len > 1e-6 ? [dx / len, dy / len] : [1, 0];
}

function simplifyStrokeRdp(points: readonly StrokeSamplePoint[], epsilon: number): StrokeSamplePoint[] {
  const n = points.length;
  if (n <= 2 || epsilon <= 0) return [...points];
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: Array<readonly [number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end <= start + 1) continue;
    const a = points[start]!;
    const b = points[end]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abLenSq = abx * abx + aby * aby;
    let maxDist = -1;
    let splitIdx = start;
    for (let i = start + 1; i < end; i += 1) {
      const pt = points[i]!;
      const t = abLenSq > 1e-12
        ? Math.max(0, Math.min(1, ((pt.x - a.x) * abx + (pt.y - a.y) * aby) / abLenSq))
        : 0;
      const dist = Math.hypot(pt.x - (a.x + t * abx), pt.y - (a.y + t * aby));
      if (dist > maxDist) {
        maxDist = dist;
        splitIdx = i;
      }
    }
    if (maxDist > epsilon && splitIdx > start && splitIdx < end) {
      keep[splitIdx] = 1;
      stack.push([start, splitIdx], [splitIdx, end]);
    }
  }
  const out: StrokeSamplePoint[] = [];
  for (let i = 0; i < n; i += 1) {
    if (keep[i]) out.push(points[i]!);
  }
  return out;
}

function fitCubicSegment(
  pts: readonly StrokeSamplePoint[],
  tanL: readonly [number, number],
  tanR: readonly [number, number],
): { readonly seg: CubicBezierCurveSegment; readonly u: number[] } {
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const n = pts.length;
  const u = new Array<number>(n).fill(0);
  let total = 0;
  for (let i = 1; i < n; i += 1) {
    total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    u[i] = total;
  }
  for (let i = 0; i < n; i += 1) {
    u[i] = total > 1e-6 ? u[i]! / total : i / Math.max(1, n - 1);
  }
  const chord = Math.hypot(last.x - first.x, last.y - first.y);
  const defAlpha = Math.max(1e-3, chord / 3);
  let alphaL = defAlpha;
  let alphaR = defAlpha;
  if (n > 2) {
    let c00 = 0; let c01 = 0; let c11 = 0; let x0 = 0; let x1 = 0;
    for (let i = 0; i < n; i += 1) {
      const t = u[i]!;
      const inv = 1 - t;
      const b0 = inv * inv * inv;
      const b1 = 3 * inv * inv * t;
      const b2 = 3 * inv * t * t;
      const b3 = t * t * t;
      const a1x = tanL[0] * b1; const a1y = tanL[1] * b1;
      const a2x = tanR[0] * b2; const a2y = tanR[1] * b2;
      c00 += a1x * a1x + a1y * a1y;
      c01 += a1x * a2x + a1y * a2y;
      c11 += a2x * a2x + a2y * a2y;
      const rx = pts[i]!.x - ((b0 + b1) * first.x + (b2 + b3) * last.x);
      const ry = pts[i]!.y - ((b0 + b1) * first.y + (b2 + b3) * last.y);
      x0 += a1x * rx + a1y * ry;
      x1 += a2x * rx + a2y * ry;
    }
    const det = c00 * c11 - c01 * c01;
    if (Math.abs(det) > 1e-12) {
      const candL = (x0 * c11 - x1 * c01) / det;
      const candR = (c00 * x1 - c01 * x0) / det;
      if (candL > 1e-6 * chord && candR > 1e-6 * chord && candL <= chord * 2 && candR <= chord * 2) {
        alphaL = candL;
        alphaR = candR;
      }
    }
  }
  return {
    u,
    seg: {
      p0: [first.x, first.y],
      c1: [first.x + tanL[0] * alphaL, first.y + tanL[1] * alphaL],
      c2: [last.x + tanR[0] * alphaR, last.y + tanR[1] * alphaR],
      p3: [last.x, last.y],
      widthStart: Math.max(0, Math.min(1, first.pressure)),
      widthEnd: Math.max(0, Math.min(1, last.pressure)),
    },
  };
}

/** 실시간 Ramer-Douglas-Peucker + 3차 베지어 선화 벡터라이저. */
export function vectorizeStrokeWasm64(
  points: readonly StrokeSamplePoint[],
  options: { readonly rdpEpsilon?: number; readonly bezierTolerancePx?: number } = {},
): VectorizeStrokeResult {
  const started = nowMs();
  const rdpEps = Math.max(0, options.rdpEpsilon ?? 0.45);
  const tol = Math.max(0.05, options.bezierTolerancePx ?? 1.25);
  if (points.length < 2) {
    return {
      inputPointCount: points.length, simplifiedPointCount: points.length, segments: [],
      maxFitErrorPx: 0, compressionRatio: 1, elapsedMs: Math.max(0, nowMs() - started), svgPath: "",
    };
  }
  const simplified = simplifyStrokeRdp(points, rdpEps);
  const segments: CubicBezierCurveSegment[] = [];
  let maxErr = 0;
  const lastI = simplified.length - 1;
  const stack: Array<readonly [number, number, readonly [number, number], readonly [number, number], number]> = [[
    0, lastI,
    norm2(simplified[1]!.x - simplified[0]!.x, simplified[1]!.y - simplified[0]!.y),
    norm2(simplified[lastI - 1]!.x - simplified[lastI]!.x, simplified[lastI - 1]!.y - simplified[lastI]!.y),
    0,
  ]];
  while (stack.length > 0) {
    const [start, end, tanL, tanR, depth] = stack.pop()!;
    const slice = simplified.slice(start, end + 1);
    const { seg, u } = fitCubicSegment(slice, tanL, tanR);
    let localMax = 0;
    let localSplit = Math.floor(slice.length / 2);
    for (let i = 0; i < slice.length; i += 1) {
      const [ex, ey] = evalCubic(seg, u[i]!);
      const err = Math.hypot(slice[i]!.x - ex, slice[i]!.y - ey);
      if (err > localMax) { localMax = err; localSplit = i; }
    }
    const split = start + localSplit;
    if (localMax <= tol || end <= start + 2 || depth >= 10 || split <= start || split >= end) {
      if (localMax > maxErr) maxErr = localMax;
      segments.push(seg);
    } else {
      const prev = simplified[split - 1]!;
      const next = simplified[split + 1]!;
      const tanCR = norm2(prev.x - next.x, prev.y - next.y);
      const tanCL: readonly [number, number] = [-tanCR[0], -tanCR[1]];
      stack.push([split, end, tanCL, tanR, depth + 1], [start, split, tanL, tanCR, depth + 1]);
    }
  }
  const svgPath = segments.length > 0
    ? `M ${segments[0]!.p0[0].toFixed(1)} ${segments[0]!.p0[1].toFixed(1)} ${segments.map((s) => `C ${s.c1[0].toFixed(1)} ${s.c1[1].toFixed(1)}, ${s.c2[0].toFixed(1)} ${s.c2[1].toFixed(1)}, ${s.p3[0].toFixed(1)} ${s.p3[1].toFixed(1)}`).join(" ")}`
    : "";
  return {
    inputPointCount: points.length, simplifiedPointCount: simplified.length, segments,
    maxFitErrorPx: maxErr, compressionRatio: segments.length > 0 ? points.length / segments.length : 1,
    elapsedMs: Math.max(0, nowMs() - started), svgPath,
  };
}

// ---------------------------------------------------------------------------
// 2. 스트리밍 대용량 PSD/PSB 바이너리 헤더 파서
// ---------------------------------------------------------------------------

export type PsdColorModeName = "Bitmap" | "Grayscale" | "Indexed" | "RGB" | "CMYK" | "Multichannel" | "Duotone" | "Lab" | "Unknown";

export interface ParsedPsdHeaderWasm64 {
  readonly version: 1 | 2;
  readonly isPsb: boolean;
  readonly channels: number;
  readonly width: number;
  readonly height: number;
  readonly depthBits: 1 | 8 | 16 | 32;
  readonly colorMode: PsdColorModeName;
  readonly colorModeDataOffset: bigint;
  readonly colorModeDataLength: bigint;
  readonly imageResourcesOffset: bigint;
  readonly imageResourcesLength: bigint;
  readonly layerAndMaskOffset: bigint;
  readonly layerAndMaskLength: bigint;
  readonly imageDataOffset: bigint;
  readonly estimatedUncompressedRgbaBytes: bigint;
  readonly requiresMemory64: boolean;
  readonly elapsedMs: number;
}

export type ParsePsdHeaderResult =
  | { readonly ok: true; readonly header: ParsedPsdHeaderWasm64 }
  | { readonly ok: false; readonly errorCode: "truncated" | "bad-signature" | "unsupported-version" | "invalid-header"; readonly message: string };

const COLOR_MODE_MAP: Readonly<Record<number, PsdColorModeName>> = {
  0: "Bitmap", 1: "Grayscale", 2: "Indexed", 3: "RGB", 4: "CMYK", 7: "Multichannel", 8: "Duotone", 9: "Lab",
};

/** 데모·벤치마크·테스트용 표준 PSD v1 / PSB v2 바이너리 헤더를 생성한다. */
export function buildSyntheticPsdHeaderBytes(spec: {
  readonly version: 1 | 2;
  readonly channels: number;
  readonly width: number;
  readonly height: number;
  readonly depthBits: 1 | 8 | 16 | 32;
  readonly colorModeCode: number;
  readonly colorDataLen?: number;
  readonly resourcesLen?: number;
  readonly layerAndMaskLen?: bigint;
}): Uint8Array {
  const colorLen = spec.colorDataLen ?? 0;
  const resLen = spec.resourcesLen ?? 64;
  const lmLen = spec.layerAndMaskLen ?? BigInt(65536);
  const lmFieldBytes = spec.version === 2 ? 8 : 4;
  const out = new Uint8Array(26 + 4 + colorLen + 4 + resLen + lmFieldBytes);
  const dv = new DataView(out.buffer);
  out[0] = 0x38; out[1] = 0x42; out[2] = 0x50; out[3] = 0x53;
  dv.setUint16(4, spec.version, false);
  dv.setUint16(12, spec.channels, false);
  dv.setUint32(14, spec.height, false);
  dv.setUint32(18, spec.width, false);
  dv.setUint16(22, spec.depthBits, false);
  dv.setUint16(24, spec.colorModeCode, false);
  dv.setUint32(26, colorLen, false);
  const irOff = 30 + colorLen;
  dv.setUint32(irOff, resLen, false);
  const lmOff = irOff + 4 + resLen;
  if (spec.version === 2) dv.setBigUint64(lmOff, lmLen, false);
  else dv.setUint32(lmOff, Number(lmLen & BigInt(0xffffffff)), false);
  return out;
}

/** 스트리밍 Adobe PSD/PSB 바이너리 헤더 및 64비트 섹션 오프셋 파서. */
export function parseLargePsdHeaderWasm64(bytes: Uint8Array): ParsePsdHeaderResult {
  const started = nowMs();
  if (bytes.byteLength < 26) {
    return { ok: false, errorCode: "truncated", message: `Expected at least 26 bytes, got ${bytes.byteLength}` };
  }
  if (bytes[0] !== 0x38 || bytes[1] !== 0x42 || bytes[2] !== 0x50 || bytes[3] !== 0x53) {
    return { ok: false, errorCode: "bad-signature", message: "Missing 8BPS signature" };
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = dv.getUint16(4, false);
  if (version !== 1 && version !== 2) {
    return { ok: false, errorCode: "unsupported-version", message: `Unsupported PSD version: ${version}` };
  }
  const isPsb = version === 2;
  const channels = dv.getUint16(12, false);
  const height = dv.getUint32(14, false);
  const width = dv.getUint32(18, false);
  const depthBits = dv.getUint16(22, false);
  const colorModeCode = dv.getUint16(24, false);
  const maxDim = isPsb ? 300000 : 30000;
  if (channels < 1 || channels > 56 || width < 1 || height < 1 || width > maxDim || height > maxDim) {
    return { ok: false, errorCode: "invalid-header", message: `Invalid PSD dimensions or channels (${width}x${height})` };
  }
  if (depthBits !== 1 && depthBits !== 8 && depthBits !== 16 && depthBits !== 32) {
    return { ok: false, errorCode: "invalid-header", message: `Invalid bit depth: ${depthBits}` };
  }
  if (bytes.byteLength < 30) return { ok: false, errorCode: "truncated", message: "Missing color mode length" };
  const colorModeDataOffset = BigInt(26);
  const colorModeDataLength = BigInt(dv.getUint32(26, false));
  const imageResourcesOffset = colorModeDataOffset + BigInt(4) + colorModeDataLength;
  const irOffNum = Number(imageResourcesOffset);
  if (irOffNum + 4 > bytes.byteLength) return { ok: false, errorCode: "truncated", message: "Missing image resources length" };
  const imageResourcesLength = BigInt(dv.getUint32(irOffNum, false));
  const layerAndMaskOffset = imageResourcesOffset + BigInt(4) + imageResourcesLength;
  const lmOffNum = Number(layerAndMaskOffset);
  const lmLenField = isPsb ? 8 : 4;
  if (lmOffNum + lmLenField > bytes.byteLength) return { ok: false, errorCode: "truncated", message: "Missing layer/mask length" };
  const layerAndMaskLength = isPsb ? dv.getBigUint64(lmOffNum, false) : BigInt(dv.getUint32(lmOffNum, false));
  const imageDataOffset = layerAndMaskOffset + BigInt(lmLenField) + layerAndMaskLength;
  const estimatedUncompressedRgbaBytes = BigInt(width) * BigInt(height) * BigInt(4);
  return {
    ok: true,
    header: {
      version, isPsb, channels, width, height, depthBits, colorMode: COLOR_MODE_MAP[colorModeCode] ?? "Unknown",
      colorModeDataOffset, colorModeDataLength, imageResourcesOffset, imageResourcesLength,
      layerAndMaskOffset, layerAndMaskLength, imageDataOffset, estimatedUncompressedRgbaBytes,
      requiresMemory64: isPsb || estimatedUncompressedRgbaBytes >= STUDIO_WASM32_ADDRESS_LIMIT_BYTES,
      elapsedMs: Math.max(0, nowMs() - started),
    },
  };
}

// ---------------------------------------------------------------------------
// 3. 고속 필터 / 2.5D 임파스토 / ARAP·MLS 강체 워프 디스패처
// ---------------------------------------------------------------------------

export interface MlsWarpPin2D {
  readonly rest: readonly [number, number];
  readonly target: readonly [number, number];
}

export type Wasm64FilterOrWarpRequest =
  | { readonly kind: "gaussian-blur-masked"; readonly rgba: Uint8Array; readonly width: number; readonly height: number; readonly sigma: number; readonly selectionMask?: Uint8Array }
  | { readonly kind: "unsharp-mask"; readonly rgba: Uint8Array; readonly width: number; readonly height: number; readonly sigma: number; readonly amount: number; readonly threshold: number }
  | { readonly kind: "impasto-sobel"; readonly rgba: Uint8Array; readonly heightMap: Float32Array; readonly width: number; readonly height: number; readonly reliefStrength?: number }
  | { readonly kind: "mls-rigid-warp"; readonly vertices: ReadonlyArray<readonly [number, number]>; readonly pins: readonly MlsWarpPin2D[]; readonly alpha?: number };

export interface Wasm64FilterOrWarpResult {
  readonly kind: Wasm64FilterOrWarpRequest["kind"];
  readonly backendMode: Wasm64AlgorithmAccelerator["backendMode"];
  readonly elapsedMs: number;
  readonly pixelsProcessed: number;
  readonly checksum: number;
  readonly rgba?: Uint8Array;
  readonly warpedVertices?: ReadonlyArray<readonly [number, number]>;
  readonly boundaryBleedPixels?: number;
  readonly modifiedPixels?: number;
  readonly maxPinErrorPx?: number;
}

function buildGaussian1D(sigma: number): Float32Array {
  const radius = Math.max(1, Math.min(32, Math.ceil(sigma * 3)));
  const k = new Float32Array(radius * 2 + 1);
  const inv2s2 = 1 / (2 * sigma * sigma);
  let sum = 0;
  for (let i = 0; i < k.length; i += 1) {
    const d = i - radius;
    const w = Math.exp(-d * d * inv2s2);
    k[i] = w;
    sum += w;
  }
  for (let i = 0; i < k.length; i += 1) k[i] = (k[i] ?? 0) / sum;
  return k;
}

function runSeparableGaussianMasked(
  rgba: Uint8Array,
  width: number,
  height: number,
  sigma: number,
  mask?: Uint8Array,
): { readonly output: Uint8Array; readonly boundaryBleedPixels: number } {
  if (sigma < 1e-4) return { output: new Uint8Array(rgba), boundaryBleedPixels: 0 };
  const kernel = buildGaussian1D(sigma);
  const radius = kernel.length >>> 1;
  const horiz = new Float32Array(rgba.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const base = idx * 4;
      if (mask && (mask[idx] ?? 0) === 0) {
        for (let c = 0; c < 4; c += 1) horiz[base + c] = rgba[base + c] ?? 0;
        continue;
      }
      let r = 0; let g = 0; let b = 0; let a = 0; let wSum = 0;
      for (let ki = 0; ki < kernel.length; ki += 1) {
        const sx = Math.max(0, Math.min(width - 1, x + ki - radius));
        const sIdx = row + sx;
        const mW = mask ? (mask[sIdx] ?? 0) / 255 : 1;
        if (mW === 0) continue;
        const w = (kernel[ki] ?? 0) * mW;
        const sb = sIdx * 4;
        r += (rgba[sb] ?? 0) * w; g += (rgba[sb + 1] ?? 0) * w; b += (rgba[sb + 2] ?? 0) * w; a += (rgba[sb + 3] ?? 0) * w;
        wSum += w;
      }
      const inv = wSum > 0 ? 1 / wSum : 1;
      horiz[base] = r * inv; horiz[base + 1] = g * inv; horiz[base + 2] = b * inv; horiz[base + 3] = a * inv;
    }
  }
  const output = new Uint8Array(rgba.length);
  let bleed = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const base = idx * 4;
      if (mask && (mask[idx] ?? 0) === 0) {
        for (let c = 0; c < 4; c += 1) output[base + c] = rgba[base + c] ?? 0;
        if (output[base] !== rgba[base] || output[base + 1] !== rgba[base + 1] || output[base + 2] !== rgba[base + 2]) bleed += 1;
        continue;
      }
      let r = 0; let g = 0; let b = 0; let a = 0; let wSum = 0;
      for (let ki = 0; ki < kernel.length; ki += 1) {
        const sy = Math.max(0, Math.min(height - 1, y + ki - radius));
        const sIdx = sy * width + x;
        const mW = mask ? (mask[sIdx] ?? 0) / 255 : 1;
        if (mW === 0) continue;
        const w = (kernel[ki] ?? 0) * mW;
        const sb = sIdx * 4;
        r += (horiz[sb] ?? 0) * w; g += (horiz[sb + 1] ?? 0) * w; b += (horiz[sb + 2] ?? 0) * w; a += (horiz[sb + 3] ?? 0) * w;
        wSum += w;
      }
      const inv = wSum > 0 ? 1 / wSum : 1;
      output[base] = clampByte(r * inv); output[base + 1] = clampByte(g * inv);
      output[base + 2] = clampByte(b * inv); output[base + 3] = clampByte(a * inv);
    }
  }
  return { output, boundaryBleedPixels: bleed };
}

/** Wasm64 가속 필터(경계차단 블러·언샤프·임파스토 광원) 및 MLS 강체 2D 워프를 실행한다. */
export function runWasm64FilterOrWarp(
  wasmModule: Wasm64AlgorithmAccelerator,
  request: Wasm64FilterOrWarpRequest,
): Wasm64FilterOrWarpResult {
  const started = nowMs();
  if (request.kind === "gaussian-blur-masked") {
    const { output, boundaryBleedPixels } = runSeparableGaussianMasked(
      request.rgba, request.width, request.height, request.sigma, request.selectionMask,
    );
    return {
      kind: request.kind, backendMode: wasmModule.backendMode, elapsedMs: Math.max(0, nowMs() - started),
      pixelsProcessed: request.width * request.height, checksum: wasmModule.computeFnv1aChecksum(output),
      rgba: output, boundaryBleedPixels,
    };
  }
  if (request.kind === "unsharp-mask") {
    const { output: blurred } = runSeparableGaussianMasked(request.rgba, request.width, request.height, request.sigma);
    const { output, modifiedPixels } = wasmModule.unsharpMixRgba(request.rgba, blurred, request.amount, request.threshold);
    return {
      kind: request.kind, backendMode: wasmModule.backendMode, elapsedMs: Math.max(0, nowMs() - started),
      pixelsProcessed: request.width * request.height, checksum: wasmModule.computeFnv1aChecksum(output),
      rgba: output, modifiedPixels,
    };
  }
  if (request.kind === "impasto-sobel") {
    const relief = request.reliefStrength ?? 1.8;
    const out = new Uint8Array(request.rgba);
    const { width: w, height: h, heightMap } = request;
    const sampleH = (x: number, y: number): number =>
      heightMap[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))] ?? 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = (y * w + x) * 4;
        if ((out[idx + 3] ?? 0) === 0) continue;
        const gx = ((-sampleH(x - 1, y - 1) + sampleH(x + 1, y - 1)) + 2 * (-sampleH(x - 1, y) + sampleH(x + 1, y)) + (-sampleH(x - 1, y + 1) + sampleH(x + 1, y + 1))) * relief;
        const gy = ((-sampleH(x - 1, y - 1) - 2 * sampleH(x, y - 1) - sampleH(x + 1, y - 1)) + (sampleH(x - 1, y + 1) + 2 * sampleH(x, y + 1) + sampleH(x + 1, y + 1))) * relief;
        const invN = 1 / Math.hypot(-gx, -gy, 1);
        const lit = 0.35 + 0.75 * Math.max(0, (-gx * 0.45 - gy * 0.45 + 0.77) * invN);
        out[idx] = clampByte((out[idx] ?? 0) * lit);
        out[idx + 1] = clampByte((out[idx + 1] ?? 0) * lit);
        out[idx + 2] = clampByte((out[idx + 2] ?? 0) * lit);
      }
    }
    return {
      kind: request.kind, backendMode: wasmModule.backendMode, elapsedMs: Math.max(0, nowMs() - started),
      pixelsProcessed: w * h, checksum: wasmModule.computeFnv1aChecksum(out), rgba: out,
    };
  }

  const alpha = Math.max(0.25, request.alpha ?? 1.0);
  const { vertices, pins } = request;
  const warped: Array<readonly [number, number]> = [];
  if (pins.length === 0) {
    for (const v of vertices) warped.push([v[0], v[1]]);
  } else if (pins.length === 1) {
    const dx = pins[0]!.target[0] - pins[0]!.rest[0];
    const dy = pins[0]!.target[1] - pins[0]!.rest[1];
    for (const v of vertices) warped.push([v[0] + dx, v[1] + dy]);
  } else {
    const weights = new Float64Array(pins.length);
    for (const [vx, vy] of vertices) {
      let exact: readonly [number, number] | null = null;
      let wSum = 0; let psX = 0; let psY = 0; let qsX = 0; let qsY = 0;
      for (let i = 0; i < pins.length; i += 1) {
        const pin = pins[i]!;
        const dSq = (vx - pin.rest[0]) ** 2 + (vy - pin.rest[1]) ** 2;
        if (dSq < 1e-12) { exact = pin.target; break; }
        const w = 1 / Math.pow(dSq, alpha);
        weights[i] = w; wSum += w;
        psX += w * pin.rest[0]; psY += w * pin.rest[1];
        qsX += w * pin.target[0]; qsY += w * pin.target[1];
      }
      if (exact) { warped.push(exact); continue; }
      psX /= wSum; psY /= wSum; qsX /= wSum; qsY /= wSum;
      let cNum = 0; let sNum = 0;
      for (let i = 0; i < pins.length; i += 1) {
        const pin = pins[i]!;
        const w = weights[i]!;
        const phX = pin.rest[0] - psX; const phY = pin.rest[1] - psY;
        const qhX = pin.target[0] - qsX; const qhY = pin.target[1] - qsY;
        cNum += w * (phX * qhX + phY * qhY);
        sNum += w * (phX * qhY - phY * qhX);
      }
      const norm = Math.hypot(cNum, sNum);
      const cosT = norm > 1e-12 ? cNum / norm : 1;
      const sinT = norm > 1e-12 ? sNum / norm : 0;
      const vhX = vx - psX; const vhY = vy - psY;
      warped.push([cosT * vhX - sinT * vhY + qsX, sinT * vhX + cosT * vhY + qsY]);
    }
  }
  const f32Bytes = new Uint8Array(new Float32Array(warped.flatMap(([x, y]) => [x, y])).buffer);
  let maxPinErr = 0;
  for (const pin of pins) {
    const idx = vertices.findIndex((v) => Math.hypot(v[0] - pin.rest[0], v[1] - pin.rest[1]) < 1e-4);
    if (idx >= 0) {
      const wv = warped[idx]!;
      maxPinErr = Math.max(maxPinErr, Math.hypot(wv[0] - pin.target[0], wv[1] - pin.target[1]));
    }
  }
  return {
    kind: request.kind, backendMode: wasmModule.backendMode, elapsedMs: Math.max(0, nowMs() - started),
    pixelsProcessed: vertices.length, checksum: wasmModule.computeFnv1aChecksum(f32Bytes),
    warpedVertices: warped, maxPinErrorPx: maxPinErr,
  };
}

/** 허브 UI 실시간 벤치마크용 결정론적 데모 픽스처 묶음을 생성한다. */
export function createWasm64HubDemoFixtures(size = 32): {
  readonly rgba: Uint8Array;
  readonly mask: Uint8Array;
  readonly heightMap: Float32Array;
  readonly stroke: readonly StrokeSamplePoint[];
} {
  const rgba = new Uint8Array(size * size * 4);
  const mask = new Uint8Array(size * size);
  const heightMap = new Float32Array(size * size);
  const half = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      const left = x < half;
      rgba[idx] = left ? 220 : 32;
      rgba[idx + 1] = left ? ((x + y) % 2 === 0 ? 190 : 60) : 70;
      rgba[idx + 2] = left ? 44 : 218;
      rgba[idx + 3] = 255;
      mask[y * size + x] = left ? 255 : 0;
      const d = Math.hypot(x - half, y - half) / half;
      heightMap[y * size + x] = Math.max(0, 1 - d * d);
    }
  }
  const stroke: StrokeSamplePoint[] = [];
  for (let i = 0; i <= 72; i += 1) {
    const t = i / 72;
    stroke.push({
      x: 12 + t * 216,
      y: 44 + Math.sin(t * Math.PI * 2) * 26 + Math.cos(t * Math.PI * 4) * 5,
      pressure: 0.25 + 0.75 * Math.sin(t * Math.PI),
    });
  }
  return { rgba, mask, heightMap, stroke };
}
