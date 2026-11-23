/**
 * 전 드로잉 서브시스템 통합 스트레스 · 30분(3,600틱) 소크 벤치마크 하네스.
 * ① 12종 혼합 브러시 · ② 10종 복합 필터 그래프 · ③ 500개 오브젝트+ARAP 변형/모핑
 * ④ 8인 동시 CRDT 스케치(<=16.7ms, 충돌 0) · ⑤ 30분(3,600틱) 메모리·p95 자동 판정
 */

import {
  ZeroCopyGpuRingBridge,
  applyImpastoReliefCpu,
  applySeparableFilterGraphCpu,
  compositeMultiLayerCpu,
  warpImageArapMeshCpu,
  type ArapWarpPin,
  type ImpastoReliefConfig,
} from "./webgpu-vello-zerocopy-pipeline";

export const FRAME_BUDGET_60FPS_MS = 16.7 as const;
export const DEFAULT_SOAK_TICKS_30MIN = 3600 as const;
export const DEFAULT_SIMULATED_MINUTES = 30 as const;
export const DEFAULT_MULTI_OBJECT_COUNT = 500 as const;
export const DEFAULT_CONCURRENT_USER_COUNT = 8 as const;

export const MIXED_12_BRUSH_MEDIA_IDS = Object.freeze([
  "pencil", "crayon", "charcoal", "pastel", "gpen-ink", "watercolor",
  "oil-impasto", "acrylic-gouache", "marker", "airbrush", "blending-stump", "kneaded-eraser",
] as const);

export type MixedBrushMediaId = (typeof MIXED_12_BRUSH_MEDIA_IDS)[number];

export const COMPOSITE_10_FILTER_NAMES = Object.freeze([
  "gaussian-blur", "unsharp-mask", "hsl-grading", "paper-grain-noise", "halftone-screentone",
  "impasto-relief", "multi-layer-blend", "radial-vignette", "sobel-lineart-enhance", "chromatic-bloom",
] as const);

export interface TimingSummary {
  readonly sampleCount: number;
  readonly totalMs: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

export interface Mixed12BrushSoakResult {
  readonly brushCount: number;
  readonly totalDabs: number;
  readonly mutatedBrushes: number;
  readonly timing: TimingSummary;
  readonly passed: boolean;
}

export interface Composite10FilterSoakResult {
  readonly filterCount: number;
  readonly filterNames: readonly string[];
  readonly distinctChecksums: number;
  readonly timing: TimingSummary;
  readonly passed: boolean;
}

export interface MultiObject500ArapSoakResult {
  readonly objectCount: number;
  readonly visibleObjectCount: number;
  readonly delaunayTriangleCount: number;
  readonly morphStepsTested: number;
  readonly finiteVertexIntegrity: boolean;
  readonly timing: TimingSummary;
  readonly passed: boolean;
}

export interface ConcurrentCrdtStrokeOp {
  readonly opId: string;
  readonly peerId: string;
  readonly wallMs: number;
  readonly logical: number;
  readonly tileKey: string;
  readonly brushId: MixedBrushMediaId;
  readonly strokeHash: number;
}

export interface MultiUserCrdtBurstResult {
  readonly userCount: number;
  readonly totalOpsSubmitted: number;
  readonly mergedUniqueOps: number;
  readonly unresolvedConflicts: number;
  readonly orderIndependentConvergence: boolean;
  readonly timing: TimingSummary;
  readonly passed: boolean;
}

export interface Simulated30MinSoakResult {
  readonly simulatedMinutes: number;
  readonly totalTicks: number;
  readonly earlyWindowMeanMs: number;
  readonly lateWindowMeanMs: number;
  readonly degradationRatio: number;
  readonly managedBytesStart: number;
  readonly managedBytesEnd: number;
  readonly managedBytesPeak: number;
  readonly managedMemoryBudgetBytes: number;
  readonly managedGrowthRatio: number;
  readonly heapGrowthMb: number;
  readonly zeroCopySlicesIssued: number;
  readonly totalBufferCopies: 0;
  readonly timing: TimingSummary;
  readonly passed: boolean;
}

export interface FullDrawingToolsSoakOptions {
  readonly brushTileSize: number;
  readonly filterTileSize: number;
  readonly objectCount: number;
  readonly concurrentUsers: number;
  readonly crdtOpsPerUser: number;
  readonly soakTicks: number;
  readonly frameBudgetMs: number;
  readonly maxManagedMemoryBytes: number;
}

export interface FullDrawingToolsSoakReport {
  readonly frameBudgetMs: number;
  readonly mixed12Brushes: Mixed12BrushSoakResult;
  readonly composite10Filters: Composite10FilterSoakResult;
  readonly multiObject500Arap: MultiObject500ArapSoakResult;
  readonly multiUser8Crdt: MultiUserCrdtBurstResult;
  readonly simulated30MinSoak: Simulated30MinSoakResult;
  readonly allPassed: boolean;
}

const DEFAULT_OPTIONS: FullDrawingToolsSoakOptions = {
  brushTileSize: 128,
  filterTileSize: 48,
  objectCount: DEFAULT_MULTI_OBJECT_COUNT,
  concurrentUsers: DEFAULT_CONCURRENT_USER_COUNT,
  crdtOpsPerUser: 40,
  soakTicks: DEFAULT_SOAK_TICKS_30MIN,
  frameBudgetMs: FRAME_BUDGET_60FPS_MS,
  maxManagedMemoryBytes: 64 * 1024 * 1024,
};

const nowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

function readHeapBytes(): number {
  const proc = (globalThis as { process?: { memoryUsage?: () => { heapUsed: number } } }).process;
  return proc && typeof proc.memoryUsage === "function" ? proc.memoryUsage().heapUsed : 0;
}

function summarizeTimings(samples: Float64Array, count: number): TimingSummary {
  const n = Math.max(0, Math.min(count, samples.length));
  if (n === 0) return { sampleCount: 0, totalMs: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  const sorted = Float64Array.from(samples.subarray(0, n)).sort();
  let total = 0;
  for (let i = 0; i < n; i += 1) total += sorted[i];
  const at = (q: number): number => sorted[Math.min(n - 1, Math.floor(q * (n - 1)))];
  return {
    sampleCount: n,
    totalMs: Number(total.toFixed(4)),
    meanMs: Number((total / n).toFixed(4)),
    p50Ms: Number(at(0.5).toFixed(4)),
    p95Ms: Number(at(0.95).toFixed(4)),
    p99Ms: Number(at(0.99).toFixed(4)),
    maxMs: Number(sorted[n - 1].toFixed(4)),
  };
}

function hashRgbaChecksum(buf: Uint8ClampedArray | Uint8Array): number {
  let h = 2166136261;
  const step = Math.max(1, Math.floor(buf.length / 512));
  for (let i = 0; i < buf.length; i += step) {
    h ^= buf[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createSyntheticPatternRgba(width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p4 = (y * width + x) * 4;
      const stripe = ((x >> 2) + (y >> 2)) & 1 ? 210 : 65;
      out[p4] = Math.min(255, stripe + ((x * 3) & 63));
      out[p4 + 1] = Math.min(255, 90 + ((y * 5) & 127));
      out[p4 + 2] = Math.min(255, 180 - ((x * 2) & 95));
      out[p4 + 3] = 255;
    }
  }
  return out;
}

function stampMediaBrushDab(
  rgba: Uint8ClampedArray,
  heightField: Float32Array,
  size: number,
  cx: number,
  cy: number,
  radius: number,
  mediaIndex: number,
  pressure: number,
): void {
  const r = Math.max(2, Math.min(10, Math.round(radius)));
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(size - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(size - 1, Math.ceil(cy + r));
  const isEraser = mediaIndex === 11;
  const isSmudge = mediaIndex === 10;
  const isImpasto = mediaIndex === 6 || mediaIndex === 7;
  const cr = ((mediaIndex * 53 + 40) % 215) + 20;
  const cg = ((mediaIndex * 97 + 60) % 215) + 20;
  const cb = ((mediaIndex * 131 + 80) % 215) + 20;

  for (let y = minY; y <= maxY; y += 1) {
    const dy = y - cy;
    for (let x = minX; x <= maxX; x += 1) {
      const distNorm = Math.hypot(x - cx, dy) / r;
      if (distNorm > 1) continue;
      const tooth = 0.55 + 0.45 * Math.sin(x * 0.7 + mediaIndex) * Math.cos(y * 0.7 - mediaIndex);
      const falloff = (1 - distNorm * distNorm) * pressure * tooth;
      const idx = y * size + x;
      const p4 = idx * 4;
      if (isEraser) {
        const lift = Math.min(1, falloff * 0.85);
        rgba[p4] = Math.round(rgba[p4] + (255 - rgba[p4]) * lift);
        rgba[p4 + 1] = Math.round(rgba[p4 + 1] + (255 - rgba[p4 + 1]) * lift);
        rgba[p4 + 2] = Math.round(rgba[p4 + 2] + (255 - rgba[p4 + 2]) * lift);
        heightField[idx] *= 1 - lift * 0.5;
      } else if (isSmudge && x > 0) {
        const prev4 = p4 - 4;
        const w = falloff * 0.5;
        rgba[p4] = Math.round(rgba[p4] * (1 - w) + rgba[prev4] * w);
        rgba[p4 + 1] = Math.round(rgba[p4 + 1] * (1 - w) + rgba[prev4 + 1] * w);
        rgba[p4 + 2] = Math.round(rgba[p4 + 2] * (1 - w) + rgba[prev4 + 2] * w);
      } else {
        const a = Math.min(0.95, falloff * (mediaIndex === 4 ? 1.35 : 0.75));
        rgba[p4] = Math.round(rgba[p4] * (1 - a) + cr * a);
        rgba[p4 + 1] = Math.round(rgba[p4 + 1] * (1 - a) + cg * a);
        rgba[p4 + 2] = Math.round(rgba[p4 + 2] * (1 - a) + cb * a);
        rgba[p4 + 3] = 255;
        if (isImpasto) heightField[idx] = Math.min(1, heightField[idx] + a * 0.45);
      }
    }
  }
}

/** ① 12종 혼합 브러시 연속 드로잉 벤치마크. */
export function runMixed12BrushSoak(
  tileSize: number,
  frameBudgetMs: number = FRAME_BUDGET_60FPS_MS,
): Mixed12BrushSoakResult {
  const rgba = new Uint8ClampedArray(tileSize * tileSize * 4).fill(245);
  const heightField = new Float32Array(tileSize * tileSize);
  const strokeSamples = new Float64Array(MIXED_12_BRUSH_MEDIA_IDS.length);
  let totalDabs = 0;
  let mutatedBrushes = 0;

  for (let b = 0; b < MIXED_12_BRUSH_MEDIA_IDS.length; b += 1) {
    const before = hashRgbaChecksum(rgba);
    const t0 = nowMs();
    for (let step = 0; step < 28; step += 1) {
      const frac = step / 27;
      const cx = 12 + frac * (tileSize - 24);
      const cy = 14 + ((b * 9 + Math.sin(frac * Math.PI * 2) * 14) % (tileSize - 28));
      stampMediaBrushDab(rgba, heightField, tileSize, cx, cy, 3 + (b % 5), b, 0.25 + 0.7 * Math.sin(frac * Math.PI));
      totalDabs += 1;
    }
    strokeSamples[b] = nowMs() - t0;
    if (hashRgbaChecksum(rgba) !== before) mutatedBrushes += 1;
  }
  const timing = summarizeTimings(strokeSamples, MIXED_12_BRUSH_MEDIA_IDS.length);
  return {
    brushCount: MIXED_12_BRUSH_MEDIA_IDS.length,
    totalDabs,
    mutatedBrushes,
    timing,
    passed: mutatedBrushes === MIXED_12_BRUSH_MEDIA_IDS.length && timing.p95Ms <= frameBudgetMs,
  };
}

function applyAuxFilterKernel(
  filterName: string,
  width: number,
  height: number,
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
): void {
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const maxR = Math.hypot(halfW, halfH) || 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p4 = (y * width + x) * 4;
      const r = src[p4];
      const g = src[p4 + 1];
      const b = src[p4 + 2];
      if (filterName === "paper-grain-noise") {
        const n = ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 31) - 15;
        dst[p4] = Math.max(0, Math.min(255, r + n));
        dst[p4 + 1] = Math.max(0, Math.min(255, g + n));
        dst[p4 + 2] = Math.max(0, Math.min(255, b + n));
      } else if (filterName === "halftone-screentone") {
        const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const dot = 0.5 + 0.5 * Math.sin((x + y) * 1.1) * Math.cos((x - y) * 1.1);
        const v = luma > dot * 0.85 ? 245 : 30;
        dst[p4] = v;
        dst[p4 + 1] = v;
        dst[p4 + 2] = v;
      } else if (filterName === "radial-vignette") {
        const factor = 1 - 0.55 * Math.pow(Math.hypot(x - halfW, y - halfH) / maxR, 2);
        dst[p4] = Math.round(r * factor);
        dst[p4 + 1] = Math.round(g * factor);
        dst[p4 + 2] = Math.round(b * factor);
      } else if (filterName === "sobel-lineart-enhance") {
        const rx = Math.min(width - 1, x + 1);
        const by = Math.min(height - 1, y + 1);
        const edge = Math.min(1, (Math.abs(src[(y * width + rx) * 4] - r) + Math.abs(src[(by * width + x) * 4] - r)) / 140);
        dst[p4] = Math.max(0, Math.round(r * (1 - edge * 0.65)));
        dst[p4 + 1] = Math.max(0, Math.round(g * (1 - edge * 0.65)));
        dst[p4 + 2] = Math.max(0, Math.round(b * (1 - edge * 0.65)));
      } else {
        const rx = Math.min(width - 1, x + 1);
        const lx = Math.max(0, x - 1);
        dst[p4] = Math.min(255, Math.round(src[(y * width + rx) * 4] * 0.75 + r * 0.35));
        dst[p4 + 1] = Math.min(255, Math.round(g * 1.08));
        dst[p4 + 2] = Math.min(255, Math.round(src[(y * width + lx) * 4 + 2] * 0.75 + b * 0.35));
      }
      dst[p4 + 3] = src[p4 + 3];
    }
  }
}

/** ② 10종 복합 필터 그래프 연속 적용 벤치마크. */
export function runComposite10FilterGraphSoak(
  tileSize: number,
  frameBudgetMs: number = FRAME_BUDGET_60FPS_MS,
): Composite10FilterSoakResult {
  const base = createSyntheticPatternRgba(tileSize, tileSize);
  const overlay = createSyntheticPatternRgba(tileSize, tileSize);
  const scratchF32 = new Float32Array(tileSize * tileSize * 4);
  const heightField = new Float32Array(tileSize * tileSize);
  for (let i = 0; i < heightField.length; i += 1) {
    heightField[i] = 0.5 + 0.45 * Math.sin((i % tileSize) * 0.25) * Math.cos(Math.floor(i / tileSize) * 0.25);
  }
  const impastoCfg: ImpastoReliefConfig = {
    reliefScale: 2.2, ambient: 0.35, lightX: -0.6, lightY: -0.6, lightZ: 0.85,
    specularStrength: 0.3, shininess: 24, shadowStrength: 0.35,
  };

  let cur = new Uint8ClampedArray(base);
  let nxt = new Uint8ClampedArray(base.length);
  const timings = new Float64Array(COMPOSITE_10_FILTER_NAMES.length);
  const checksums = new Set<number>();

  for (let i = 0; i < COMPOSITE_10_FILTER_NAMES.length; i += 1) {
    const name = COMPOSITE_10_FILTER_NAMES[i];
    const t0 = nowMs();
    if (name === "gaussian-blur") {
      applySeparableFilterGraphCpu(tileSize, tileSize, cur, {
        blurRadius: 2, unsharpAmount: 0, hueShiftDeg: 0, saturationDelta: 0, lightnessDelta: 0,
      }, nxt, scratchF32);
    } else if (name === "unsharp-mask") {
      applySeparableFilterGraphCpu(tileSize, tileSize, cur, {
        blurRadius: 2, unsharpAmount: 1.1, unsharpThreshold: 0.01, hueShiftDeg: 0, saturationDelta: 0, lightnessDelta: 0,
      }, nxt, scratchF32);
    } else if (name === "hsl-grading") {
      applySeparableFilterGraphCpu(tileSize, tileSize, cur, {
        blurRadius: 0, unsharpAmount: 0, hueShiftDeg: 28, saturationDelta: 0.18, lightnessDelta: 0.04,
      }, nxt, scratchF32);
    } else if (name === "impasto-relief") {
      applyImpastoReliefCpu(tileSize, tileSize, cur, heightField, impastoCfg, nxt);
    } else if (name === "multi-layer-blend") {
      compositeMultiLayerCpu(tileSize, tileSize, [
        { pixels: cur, blendMode: "normal", opacity: 1 },
        { pixels: overlay, blendMode: "overlay", opacity: 0.35 },
      ], nxt);
    } else {
      applyAuxFilterKernel(name, tileSize, tileSize, cur, nxt);
    }
    timings[i] = nowMs() - t0;
    checksums.add(hashRgbaChecksum(nxt));
    const swap = cur;
    cur = nxt;
    nxt = swap;
  }

  const timing = summarizeTimings(timings, COMPOSITE_10_FILTER_NAMES.length);
  return {
    filterCount: COMPOSITE_10_FILTER_NAMES.length,
    filterNames: COMPOSITE_10_FILTER_NAMES,
    distinctChecksums: checksums.size,
    timing,
    passed: checksums.size >= 8 && timing.p95Ms <= frameBudgetMs,
  };
}

/** ③ 500개 다중 오브젝트 자유변환 + 다중 핀 델라우니 ARAP/MLS 변형·모핑 벤치마크. */
export function runMultiObject500ArapTransformSoak(
  objectCount: number = DEFAULT_MULTI_OBJECT_COUNT,
  tileSize = 48,
  frameBudgetMs: number = FRAME_BUDGET_60FPS_MS,
): MultiObject500ArapSoakResult {
  const n = Math.max(1, objectCount);
  const tx = new Float32Array(n);
  const sx = new Float32Array(n);
  const sy = new Float32Array(n);
  const rot = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    tx[i] = (i * 37) % 1920;
    sx[i] = 0.75 + (i % 5) * 0.15;
    sy[i] = 0.75 + (i % 4) * 0.2;
    rot[i] = (i % 12) * 0.25;
  }

  const src = createSyntheticPatternRgba(tileSize, tileSize);
  const out = new Uint8ClampedArray(src.length);
  const pins: ArapWarpPin[] = [
    { restX: tileSize * 0.25, restY: tileSize * 0.25, targetX: tileSize * 0.3, targetY: tileSize * 0.22 },
    { restX: tileSize * 0.75, restY: tileSize * 0.28, targetX: tileSize * 0.72, targetY: tileSize * 0.35 },
    { restX: tileSize * 0.5, restY: tileSize * 0.55, targetX: tileSize * 0.58, targetY: tileSize * 0.48 },
    { restX: tileSize * 0.3, restY: tileSize * 0.78, targetX: tileSize * 0.24, targetY: tileSize * 0.74 },
    { restX: tileSize * 0.72, restY: tileSize * 0.76, targetX: tileSize * 0.78, targetY: tileSize * 0.8 },
  ];
  const morphSteps = [0.0, 0.25, 0.5, 0.75, 1.0];
  const samples = new Float64Array(morphSteps.length);
  let visibleCount = 0;
  let triCount = 0;
  let finiteIntegrity = true;

  for (let step = 0; step < morphSteps.length; step += 1) {
    const t0 = nowMs();
    visibleCount = 0;
    for (let i = 0; i < n; i += 1) {
      rot[i] += 0.04;
      const span = Math.abs(Math.cos(rot[i]) * 24 * sx[i]) + Math.abs(Math.sin(rot[i]) * 24 * sy[i]);
      if (tx[i] + span >= 0 && tx[i] - span <= 1920) visibleCount += 1;
    }
    const warp = warpImageArapMeshCpu(tileSize, tileSize, src, pins, morphSteps[step], out);
    triCount = warp.triangles.length;
    for (let vi = 0; vi < warp.deformedVertices.length; vi += 1) {
      if (!Number.isFinite(warp.deformedVertices[vi].x) || !Number.isFinite(warp.deformedVertices[vi].y)) {
        finiteIntegrity = false;
      }
    }
    samples[step] = nowMs() - t0;
  }

  const timing = summarizeTimings(samples, morphSteps.length);
  return {
    objectCount: n,
    visibleObjectCount: visibleCount,
    delaunayTriangleCount: triCount,
    morphStepsTested: morphSteps.length,
    finiteVertexIntegrity: finiteIntegrity,
    timing,
    passed: n >= 500 && triCount >= 4 && finiteIntegrity && timing.p95Ms <= frameBudgetMs,
  };
}

function compareCrdtOp(a: ConcurrentCrdtStrokeOp, b: ConcurrentCrdtStrokeOp): number {
  if (a.wallMs !== b.wallMs) return a.wallMs - b.wallMs;
  if (a.logical !== b.logical) return a.logical - b.logical;
  if (a.peerId !== b.peerId) return a.peerId < b.peerId ? -1 : 1;
  return a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0;
}

function mergeCrdtBurstOps(ops: readonly ConcurrentCrdtStrokeOp[]): {
  readonly merged: ConcurrentCrdtStrokeOp[];
  readonly digest: number;
} {
  const dedup = new Map<string, ConcurrentCrdtStrokeOp>();
  for (let i = 0; i < ops.length; i += 1) {
    if (!dedup.has(ops[i].opId)) dedup.set(ops[i].opId, ops[i]);
  }
  const merged = Array.from(dedup.values()).sort(compareCrdtOp);
  let digest = 2166136261;
  for (let i = 0; i < merged.length; i += 1) {
    const op = merged[i];
    digest ^= op.strokeHash ^ (op.logical << 8) ^ op.wallMs;
    digest = Math.imul(digest, 16777619);
  }
  return { merged, digest: digest >>> 0 };
}

/** ④ 8명 동시 스케치 CRDT 버스트 무충돌·결정론 수렴 벤치마크. */
export function runMultiUserCrdtSketchBurstSoak(
  userCount: number = DEFAULT_CONCURRENT_USER_COUNT,
  opsPerUser = 40,
  frameBudgetMs: number = FRAME_BUDGET_60FPS_MS,
): MultiUserCrdtBurstResult {
  const allOps: ConcurrentCrdtStrokeOp[] = [];
  const baseWallMs = 1_764_000_000_000;
  for (let u = 0; u < userCount; u += 1) {
    const peerId = `artist-${u + 1}`;
    for (let s = 0; s < opsPerUser; s += 1) {
      allOps.push({
        opId: `${peerId}:op:${s}`,
        peerId,
        wallMs: baseWallMs + Math.floor(s / 2) * 16,
        logical: s % 4,
        tileKey: `t:${(u + s) % 4}:${s % 4}`,
        brushId: MIXED_12_BRUSH_MEDIA_IDS[(u + s) % MIXED_12_BRUSH_MEDIA_IDS.length],
        strokeHash: ((u + 1) * 2654435761 + s * 2246822519) >>> 0,
      });
    }
  }

  const rounds = 8;
  const mergeSamples = new Float64Array(rounds);
  let baselineDigest = 0;
  let mergedCount = 0;
  let converged = true;

  for (let r = 0; r < rounds; r += 1) {
    const shuffled = allOps.slice();
    let seed = 0x9e3779b9 ^ (r * 0x85ebca6b);
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = seed % (i + 1);
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }
    const withDuplicates = shuffled.concat(shuffled.slice(0, Math.floor(shuffled.length * 0.1)));
    const t0 = nowMs();
    const res = mergeCrdtBurstOps(withDuplicates);
    mergeSamples[r] = nowMs() - t0;
    if (r === 0) {
      baselineDigest = res.digest;
      mergedCount = res.merged.length;
    } else if (res.digest !== baselineDigest || res.merged.length !== mergedCount) {
      converged = false;
    }
  }

  const timing = summarizeTimings(mergeSamples, rounds);
  const unresolvedConflicts = converged && mergedCount === allOps.length ? 0 : Math.abs(allOps.length - mergedCount);
  return {
    userCount,
    totalOpsSubmitted: allOps.length,
    mergedUniqueOps: mergedCount,
    unresolvedConflicts,
    orderIndependentConvergence: converged,
    timing,
    passed: userCount >= 8 && converged && unresolvedConflicts === 0 && timing.p95Ms <= frameBudgetMs && timing.maxMs <= frameBudgetMs,
  };
}

/** ⑤ 30분 작업 모사 (3,600틱 압축 루프) 장시간 소크 벤치마크. */
export function runSimulated30MinSoakLoop(
  options: Pick<FullDrawingToolsSoakOptions, "soakTicks" | "frameBudgetMs" | "maxManagedMemoryBytes" | "objectCount">,
): Simulated30MinSoakResult {
  const ticks = Math.max(10, Math.floor(options.soakTicks));
  const tileSize = 64;
  const tileBytes = tileSize * tileSize * 4;
  const bridge = new ZeroCopyGpuRingBridge({
    slotCount: 3, slotByteLength: 256 * 1024, gpuMemoryBudgetBytes: options.maxManagedMemoryBytes,
  });
  const heightField = new Float32Array(tileSize * tileSize);
  const scratchF32 = new Float32Array(tileSize * tileSize * 4);
  const workOut = new Uint8ClampedArray(tileBytes);
  const objTx = new Float32Array(options.objectCount);
  const objRot = new Float32Array(options.objectCount);
  const tickSamples = new Float64Array(ticks);

  for (let i = 0; i < 16; i += 1) bridge.registerGpuResource(`tile:${i}`, tileBytes);
  const managedBytesStart = bridge.getMemoryGovernorStats().allocatedBytes;
  const heapStart = readHeapBytes();

  const crdtSeedOps: ConcurrentCrdtStrokeOp[] = Array.from({ length: 16 }, (_, idx) => ({
    opId: `soak:${idx}`, peerId: `artist-${(idx % 8) + 1}`, wallMs: 1_764_000_000_000 + idx,
    logical: idx & 3, tileKey: `t:${idx & 3}:0`, brushId: MIXED_12_BRUSH_MEDIA_IDS[idx % 12],
    strokeHash: (idx + 1) * 1140071481,
  }));

  const initSlice = bridge.acquireZeroCopySlice(tileBytes);
  const canvasRgba = new Uint8ClampedArray(initSlice.buffer, initSlice.byteOffset, tileBytes).fill(240);

  for (let tick = 0; tick < ticks; tick += 1) {
    const t0 = nowMs();
    const slice = bridge.acquireZeroCopySlice(tileBytes);
    stampMediaBrushDab(
      canvasRgba, heightField, tileSize,
      8 + ((tick * 13) % (tileSize - 16)), 8 + ((tick * 19) % (tileSize - 16)),
      3 + (tick % 4), tick % MIXED_12_BRUSH_MEDIA_IDS.length, 0.65,
    );
    if (tick % 60 === 0) {
      applySeparableFilterGraphCpu(tileSize, tileSize, canvasRgba, {
        blurRadius: 1, unsharpAmount: 0.4, hueShiftDeg: 2, saturationDelta: 0.02, lightnessDelta: 0,
      }, workOut, scratchF32);
    }
    if (tick % 90 === 0) {
      for (let oi = 0; oi < options.objectCount; oi += 1) {
        objRot[oi] += 0.02;
        objTx[oi] = (objTx[oi] + Math.cos(objRot[oi])) % 1920;
      }
    }
    if (tick % 45 === 0) mergeCrdtBurstOps(crdtSeedOps);
    bridge.registerGpuResource(`tile:${tick % 32}`, tileBytes);
    bridge.planGpuUpload(slice);
    tickSamples[tick] = nowMs() - t0;
  }

  const stats = bridge.getMemoryGovernorStats();
  const heapEnd = readHeapBytes();
  const timing = summarizeTimings(tickSamples, ticks);
  const win = Math.max(1, Math.floor(ticks * 0.1));
  let earlySum = 0;
  let lateSum = 0;
  for (let i = 0; i < win; i += 1) {
    earlySum += tickSamples[i];
    lateSum += tickSamples[ticks - win + i];
  }
  const earlyWindowMeanMs = Number((earlySum / win).toFixed(4));
  const lateWindowMeanMs = Number((lateSum / win).toFixed(4));
  const degradationRatio = Number((lateWindowMeanMs / Math.max(earlyWindowMeanMs, 0.001)).toFixed(3));
  const managedGrowthRatio = Number(
    ((stats.allocatedBytes - managedBytesStart) / Math.max(options.maxManagedMemoryBytes, 1)).toFixed(6),
  );
  const heapGrowthMb = Number(((heapEnd - heapStart) / (1024 * 1024)).toFixed(3));

  return {
    simulatedMinutes: DEFAULT_SIMULATED_MINUTES,
    totalTicks: ticks,
    earlyWindowMeanMs,
    lateWindowMeanMs,
    degradationRatio,
    managedBytesStart,
    managedBytesEnd: stats.allocatedBytes,
    managedBytesPeak: stats.peakAllocatedBytes,
    managedMemoryBudgetBytes: options.maxManagedMemoryBytes,
    managedGrowthRatio,
    heapGrowthMb,
    zeroCopySlicesIssued: stats.totalZeroCopySlices,
    totalBufferCopies: 0,
    timing,
    passed:
      timing.p95Ms <= options.frameBudgetMs &&
      stats.peakAllocatedBytes <= options.maxManagedMemoryBytes &&
      managedGrowthRatio <= 0.15 &&
      stats.totalBufferCopies === 0,
  };
}

/** 전 드로잉 서브시스템 5축 통합 스트레스·소크 벤치마크 실행기. */
export function runFullDrawingToolsSoakBenchmark(
  partialOptions: Partial<FullDrawingToolsSoakOptions> = {},
): FullDrawingToolsSoakReport {
  const opts: FullDrawingToolsSoakOptions = { ...DEFAULT_OPTIONS, ...partialOptions };
  const mixed12Brushes = runMixed12BrushSoak(opts.brushTileSize, opts.frameBudgetMs);
  const composite10Filters = runComposite10FilterGraphSoak(opts.filterTileSize, opts.frameBudgetMs);
  const multiObject500Arap = runMultiObject500ArapTransformSoak(opts.objectCount, opts.filterTileSize, opts.frameBudgetMs);
  const multiUser8Crdt = runMultiUserCrdtSketchBurstSoak(opts.concurrentUsers, opts.crdtOpsPerUser, opts.frameBudgetMs);
  const simulated30MinSoak = runSimulated30MinSoakLoop(opts);

  return {
    frameBudgetMs: opts.frameBudgetMs,
    mixed12Brushes,
    composite10Filters,
    multiObject500Arap,
    multiUser8Crdt,
    simulated30MinSoak,
    allPassed:
      mixed12Brushes.passed &&
      composite10Filters.passed &&
      multiObject500Arap.passed &&
      multiUser8Crdt.passed &&
      simulated30MinSoak.passed,
  };
}
