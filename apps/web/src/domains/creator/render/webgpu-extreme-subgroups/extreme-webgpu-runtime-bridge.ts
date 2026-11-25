/**
 * 2025~2026 극한 WebGPU 기능 협상(Subgroups · shader-f16 · timestamp-query) +
 * CPU 참조 계산과 호출자가 제공한 타임스탬프 집계. 장치 요청·GPU 실행·실측 수집은 연결하지 않는다.
 */

import {
  KM7_BASIS_B, KM7_BASIS_G, KM7_BASIS_R,
  KM7_RECONSTRUCT_B, KM7_RECONSTRUCT_G, KM7_RECONSTRUCT_R,
} from "../studio-webgpu-km7-spectral-core";
import {
  F16_SPECTRAL_KM7_BRUSH_WGSL, F32_SPECTRAL_KM7_BRUSH_WGSL,
  KM7_F16_REFLECTANCE_FLOOR, KM7_F32_REFLECTANCE_FLOOR,
  SPARSE_STRIP_HEIGHT_4, SPARSE_STRIP_HEIGHT_8,
  STANDARD_PREFIX_SUM_TILE_BIN_WGSL,
  SUBGROUP_TILE_WORKGROUP_SIZE_X,
  type SparseStripHeightPx, type SpectralKm7UniformInput,
} from "./extreme-webgpu-wgsl-shaders";
import { extremeDimensions, extremeFiniteArray, extremeInteger, extremePrefixCounts, validateExtremePolygons, validateExtremeStrips } from "./extreme-webgpu-input-contract";
import { exactStripPixelCoverage } from "./extreme-sparse-strip-area";

export const EXTREME_WEBGPU_OPTIONAL_FEATURES = [
  "subgroups", "subgroup-size-control", "shader-f16",
  "timestamp-query", "indirect-first-instance", "bgra8unorm-storage",
] as const;

export type ExtremeWebGpuFeatureName = (typeof EXTREME_WEBGPU_OPTIONAL_FEATURES)[number];
export type ExtremeWebGpuTier = "extreme-subgroup-f16" | "modern-f16" | "core-webgpu-f32" | "wasm-simd-fallback";
export type TileBinShaderVariant = "subgroup-prefix-sum" | "barrier-prefix-sum" | "cpu-wasm-fallback";
export type SpectralBrushShaderVariant = "f16-spectral-km7" | "f32-spectral-km7" | "cpu-wasm-fallback";
export type SparseStripShaderVariant = "vello-sparse-strip-gpu" | "cpu-wasm-fallback";
export type GpuTimestampPassStage = "tile-bin" | "spectral-brush" | "sparse-strip" | "composite" | "other";

export interface ExtremeWebGpuCapabilities {
  readonly subgroups: boolean; readonly subgroupSizeControl: boolean; readonly shaderF16: boolean;
  readonly timestampQuery: boolean; readonly indirectFirstInstance: boolean; readonly bgra8unormStorage: boolean;
}

export interface ExtremeWebGpuNegotiationOptions {
  readonly webgpuAvailable?: boolean | undefined; readonly wasmSimdAvailable?: boolean | undefined;
  readonly subgroupMinSize?: number | undefined; readonly subgroupMaxSize?: number | undefined;
  readonly preferredStripHeight?: SparseStripHeightPx | undefined;
}

export interface ExtremeWebGpuNegotiatedProfile {
  readonly selectionScope: "source-candidate-only"; readonly executionVerified: false;
  readonly tier: ExtremeWebGpuTier; readonly webgpuAvailable: boolean; readonly wasmSimdAvailable: boolean;
  readonly capabilities: ExtremeWebGpuCapabilities;
  readonly requiredFeatures: readonly ExtremeWebGpuFeatureName[];
  readonly shaders: Readonly<{
    readonly tileBinVariant: TileBinShaderVariant; readonly tileBinWgsl: string | null;
    readonly spectralBrushVariant: SpectralBrushShaderVariant; readonly spectralBrushWgsl: string | null;
    readonly sparseStripVariant: SparseStripShaderVariant; readonly sparseStripWgsl: string | null;
    readonly sparseStripHeight: SparseStripHeightPx;
  }>;
  readonly spectralStorageBytesPerPixel: 8 | 16; readonly spectralBandwidthRatio: 0.5 | 1;
  readonly timestampProfilingEnabled: boolean; readonly indirectFirstInstanceEnabled: boolean; readonly directBgraStorageEnabled: boolean;
  readonly subgroupSizeBounds: Readonly<{ readonly min: number; readonly max: number; readonly controllable: boolean }> | null;
  readonly reasons: readonly string[];
}

export interface SubgroupPrefixSumOptions { readonly workgroupSize?: number | undefined; readonly subgroupSize?: number | undefined; }

export interface SubgroupPrefixSumResult {
  readonly gpuParityVerified: false;
  readonly localOffsets: Uint32Array; readonly globalOffsets: Uint32Array; readonly workgroupTotals: Uint32Array;
  readonly totalCount: number; readonly workgroupCount: number; readonly workgroupSize: number;
  readonly subgroupSize: number; readonly subgroupsPerWorkgroup: number;
  readonly subgroupBarrierCountPerWorkgroup: 1; readonly standardBarrierCountPerWorkgroup: 13;
}

export interface EmulateSpectralKm7Input {
  readonly canvasRgba: Float32Array; readonly strokeMask: Float32Array;
  readonly params: SpectralKm7UniformInput; readonly precisionMode?: "f16" | "f32" | undefined;
}

export interface EmulateSpectralKm7Result {
  readonly gpuParityVerified: false; readonly simulatedStorageBytesPerPixel: 8 | 16;
  readonly outputRgba: Float32Array; readonly precisionMode: "f16" | "f32";
  readonly storageBytesPerPixel: 8 | 16; readonly processedPixels: number;
  readonly activeStrokePixels: number; readonly overflowCount: number;
}

export interface SpectralPrecisionParityReport {
  readonly comparisonScope: "cpu-precision-reference-only"; readonly gpuParityVerified: false;
  readonly maxAbsChannelError: number; readonly meanAbsChannelError: number; readonly f16OverflowCount: number;
  readonly f16Result: EmulateSpectralKm7Result; readonly f32Result: EmulateSpectralKm7Result;
}

export interface SparseStripSegment { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number; }

export interface SparseStripDescriptor {
  readonly originX: number; readonly originY: number; readonly widthPx: number;
  readonly stripHeight: SparseStripHeightPx; readonly backdropWinding: number;
  readonly fillRule?: "nonzero" | "evenodd" | undefined; readonly segments: readonly SparseStripSegment[];
}

export interface EmulateSparseStripInput {
  readonly canvasWidth: number; readonly canvasHeight: number;
  readonly stripHeight?: SparseStripHeightPx | undefined; readonly fillRule?: "nonzero" | "evenodd" | undefined;
  readonly strips: readonly SparseStripDescriptor[]; readonly inkColor?: readonly [number, number, number, number] | undefined;
}

export interface EmulateSparseStripResult {
  readonly gpuParityVerified: false; readonly rasterizationScope: "cpu-fill-rule-area-reference";
  readonly coverage: Float32Array; readonly rgba: Float32Array; readonly stripCount: number;
  readonly totalCanvasPixels: number; readonly evaluatedPixels: number; readonly coveredPixels: number;
  readonly skippedEmptyPixels: number; readonly sparseRatio: number;
}

export interface GpuTimestampPassSample {
  readonly passId: string; readonly stage?: GpuTimestampPassStage | undefined;
  readonly startNs: number | bigint; readonly endNs: number | bigint; readonly dispatchedWorkgroups?: number | undefined;
}

export interface GpuTimestampPassMetric {
  readonly passId: string; readonly stage: GpuTimestampPassStage; readonly valid: boolean;
  readonly deltaNs: number; readonly durationMs: number; readonly shareOfTotal: number;
  readonly dispatchedWorkgroups: number | null;
}

export interface GpuTimestampWindowSummary {
  readonly measurementSource: "caller-supplied-timestamps"; readonly deviceMeasurementsVerified: false;
  readonly hasMeasurements: boolean; readonly sampleCount: number;
  readonly validPassCount: number; readonly invalidSampleCount: number;
  readonly totalGpuNs: number; readonly totalGpuMs: number;
  readonly windowSpanMs: number; readonly overlapRatio: number | null;
  readonly frameBudgetMs: number; readonly budgetUtilizationRatio: number | null;
  readonly withinFrameBudget: boolean | null; readonly hottestPassId: string | null;
  readonly stageTotalsMs: Readonly<Record<GpuTimestampPassStage, number>>;
  readonly passes: readonly GpuTimestampPassMetric[];
}

const f16ScratchBuffer = new ArrayBuffer(4);
const f16ScratchF32 = new Float32Array(f16ScratchBuffer);
const f16ScratchU32 = new Uint32Array(f16ScratchBuffer);

/** IEEE-754 binary16(half-float) round-to-nearest-even 양자화(`Math.fround` 기반). */
export function quantizeFloat16(value: number): number {
  const f32Val = Math.fround(value);
  if (Number.isNaN(f32Val) || !Number.isFinite(f32Val) || f32Val === 0) return f32Val;
  f16ScratchF32[0] = f32Val;
  const bits = f16ScratchU32[0] ?? 0;
  const sign = (bits >>> 31) & 1;
  const signMul = sign === 1 ? -1 : 1;
  const exp = ((bits >>> 23) & 0xff) - 127;
  const frac = bits & 0x7fffff;

  if (exp > 15) return signMul * Number.POSITIVE_INFINITY;
  if (exp >= -14) {
    let hExp = exp + 15;
    let mant = frac >>> 13;
    const rem = frac & 0x1fff;
    if (rem > 0x1000 || (rem === 0x1000 && (mant & 1) === 1)) {
      mant += 1;
      if (mant === 0x400) { mant = 0; hExp += 1; }
    }
    return hExp >= 31 ? signMul * Number.POSITIVE_INFINITY : signMul * Math.pow(2, hExp - 15) * (1 + mant / 1024);
  }
  if (exp >= -25) {
    const totalShift = -14 - exp + 13;
    const full = 0x800000 | frac;
    let subMant = full >>> totalShift;
    const rem = full & ((1 << totalShift) - 1);
    const half = 1 << (totalShift - 1);
    if (rem > half || (rem === half && (subMant & 1) === 1)) subMant += 1;
    return signMul * Math.pow(2, -24) * subMant;
  }
  return sign === 1 ? -0 : 0;
}

function normalizeSubgroupSize(rawSize: number | undefined, workgroupSize: number): number {
  const target = typeof rawSize === "number" && Number.isFinite(rawSize) ? Math.floor(rawSize) : 32;
  let chosen = 4;
  for (const s of [4, 8, 16, 32, 64] as const) {
    if (s <= workgroupSize && s <= target) chosen = s;
  }
  return Math.max(4, Math.min(workgroupSize, chosen));
}

/** WebGPU 어댑터 `features` 조합으로 실행 티어와 셰이더 변형(Subgroup/Barrier, f16/f32)을 협상한다. */
export function negotiateExtremeWebGpuProfile(
  features: Iterable<string> | null | undefined,
  options: ExtremeWebGpuNegotiationOptions = {},
): ExtremeWebGpuNegotiatedProfile {
  const webgpuAvailable = options.webgpuAvailable !== false && features !== null && features !== undefined;
  const wasmSimdAvailable = options.wasmSimdAvailable ?? true;
  const stripHeight: SparseStripHeightPx = options.preferredStripHeight === 8 ? SPARSE_STRIP_HEIGHT_8 : SPARSE_STRIP_HEIGHT_4;
  const featureSet = new Set<string>();
  let featureCount = 0;
  if (webgpuAvailable && features) for (const feature of features) {
    if (++featureCount > 256) throw new RangeError("기능 토큰 개수 상한을 초과했습니다.");
    featureSet.add(feature);
  }

  const subgroups = webgpuAvailable && featureSet.has("subgroups");
  const subgroupSizeControl = subgroups && featureSet.has("subgroup-size-control");
  const shaderF16 = webgpuAvailable && featureSet.has("shader-f16");
  const timestampQuery = webgpuAvailable && featureSet.has("timestamp-query");
  const indirectFirstInstance = webgpuAvailable && featureSet.has("indirect-first-instance");
  const bgra8unormStorage = webgpuAvailable && featureSet.has("bgra8unorm-storage");

  const capabilities: ExtremeWebGpuCapabilities = Object.freeze({
    subgroups, subgroupSizeControl, shaderF16, timestampQuery, indirectFirstInstance, bgra8unormStorage,
  });
  const featureFlagMap: Readonly<Record<ExtremeWebGpuFeatureName, boolean>> = {
    subgroups, "subgroup-size-control": subgroupSizeControl, "shader-f16": shaderF16,
    "timestamp-query": timestampQuery, "indirect-first-instance": indirectFirstInstance, "bgra8unorm-storage": bgra8unormStorage,
  };
  const requiredFeatures = EXTREME_WEBGPU_OPTIONAL_FEATURES.filter((name) => name !== "subgroup-size-control" && featureFlagMap[name]);
  const tier: ExtremeWebGpuTier = !webgpuAvailable ? "wasm-simd-fallback" : subgroups && shaderF16 ? "extreme-subgroup-f16" : shaderF16 ? "modern-f16" : "core-webgpu-f32";

  const reasons: string[] = [
    tier === "wasm-simd-fallback"
      ? "WebGPU 소스 후보가 없습니다. 호환 티어명은 wasm-simd-fallback이지만 이 모듈의 참조 계산은 JS이며 WASM SIMD는 미연결입니다."
      : tier === "extreme-subgroup-f16"
        ? "입력 목록에 subgroups + shader-f16이 있어 8B/px 분광 소스를 후보로 선택합니다."
        : tier === "modern-f16"
          ? "`shader-f16` 지원으로 반정밀도 분광 혼색을 사용하고 타일 빈닝은 표준 `workgroupBarrier` 폴백을 선택합니다."
          : subgroups
            ? "입력 목록에 subgroups가 있지만 순서 보존 배리어 스캔과 f32 분광 소스를 선택합니다."
            : "코어 WebGPU 환경으로 `workgroupBarrier` 타일 빈닝과 `f32` 분광 혼색을 선택합니다.",
  ];
  reasons.unshift("입력 features에 따른 소스 후보 선택이며 device 생성·실행·패리티·대역폭은 미검증입니다.");
  if (timestampQuery) reasons.push("timestamp-query 지원 목록은 확인했지만 QuerySet·readback·실측 수집은 미연결입니다.");
  if (bgra8unormStorage) reasons.push("bgra8unorm-storage 지원 목록은 확인했지만 현재 소스는 버퍼 출력이며 스왑체인 기록은 미연결입니다.");
  if (indirectFirstInstance) reasons.push("indirect-first-instance 지원 목록은 확인했지만 간접 드로우 실행은 미연결입니다.");
  if (subgroups) reasons.push("서브그룹 invocation 순서와 local index의 일치는 검증되지 않아 순서 보존 배리어 스캔을 선택합니다.");
  reasons.push("Sparse Strip WGSL의 signed-area 근사는 겹친 윤곽의 fill-rule 면적을 보존하지 않아 실행 후보에서 제외합니다. CPU 참조 계산만 제공합니다.");

  const tileBinVariant: TileBinShaderVariant = !webgpuAvailable ? "cpu-wasm-fallback" : "barrier-prefix-sum";
  const spectralBrushVariant: SpectralBrushShaderVariant = !webgpuAvailable ? "cpu-wasm-fallback" : shaderF16 ? "f16-spectral-km7" : "f32-spectral-km7";
  const minSg = extremeInteger(options.subgroupMinSize ?? 4, 4, 128, "subgroup minimum");
  const maxSg = extremeInteger(options.subgroupMaxSize ?? 64, minSg, 128, "subgroup maximum");

  return Object.freeze({
    selectionScope: "source-candidate-only", executionVerified: false,
    tier, webgpuAvailable, wasmSimdAvailable, capabilities,
    requiredFeatures: Object.freeze(requiredFeatures),
    shaders: Object.freeze({
      tileBinVariant,
      tileBinWgsl: tileBinVariant === "barrier-prefix-sum" ? STANDARD_PREFIX_SUM_TILE_BIN_WGSL : null,
      spectralBrushVariant,
      spectralBrushWgsl: spectralBrushVariant === "f16-spectral-km7" ? F16_SPECTRAL_KM7_BRUSH_WGSL : spectralBrushVariant === "f32-spectral-km7" ? F32_SPECTRAL_KM7_BRUSH_WGSL : null,
      sparseStripVariant: "cpu-wasm-fallback",
      sparseStripWgsl: null,
      sparseStripHeight: stripHeight,
    }),
    spectralStorageBytesPerPixel: shaderF16 ? 8 : 16,
    spectralBandwidthRatio: shaderF16 ? 0.5 : 1,
    timestampProfilingEnabled: false,
    indirectFirstInstanceEnabled: false,
    directBgraStorageEnabled: false,
    subgroupSizeBounds: subgroups ? Object.freeze({ min: minSg, max: maxSg, controllable: false }) : null,
    reasons: Object.freeze(reasons),
  });
}

/** `SUBGROUP_PREFIX_SUM_TILE_BIN_WGSL`의 2단계 서브그룹 Exclusive Prefix-Sum CPU 참조 에뮬레이터. */
export function emulateSubgroupTilePrefixSum(
  tileCounts: ArrayLike<number>,
  options: SubgroupPrefixSumOptions = {},
): SubgroupPrefixSumResult {
  const counts = extremePrefixCounts(tileCounts);
  const n = counts.length;
  const wgSize = extremeInteger(options.workgroupSize ?? SUBGROUP_TILE_WORKGROUP_SIZE_X, 4, 256, "workgroup size");
  const sgSize = normalizeSubgroupSize(options.subgroupSize, wgSize);
  const wgCount = n === 0 ? 0 : Math.ceil(n / wgSize);
  const sgPerWg = Math.ceil(wgSize / sgSize);

  const localOffsets = new Uint32Array(n);
  const globalOffsets = new Uint32Array(n);
  const workgroupTotals = new Uint32Array(wgCount);
  const sgTotals = new Uint32Array(sgPerWg);
  const lanePrefixes = new Uint32Array(wgSize);
  let runningWgOffset = 0;

  for (let w = 0; w < wgCount; w += 1) {
    const base = w * wgSize;
    sgTotals.fill(0);
    for (let sg = 0; sg < sgPerWg; sg += 1) {
      const sgStart = sg * sgSize;
      const sgEnd = Math.min(wgSize, sgStart + sgSize);
      let acc = 0;
      for (let lid = sgStart; lid < sgEnd; lid += 1) {
        const idx = base + lid;
        const val = idx < n ? counts[idx] ?? 0 : 0;
        lanePrefixes[lid] = acc >>> 0;
        acc = (acc + val) >>> 0;
      }
      sgTotals[sg] = acc >>> 0;
    }
    let wgSum = 0;
    for (let sg = 0; sg < sgPerWg; sg += 1) {
      const sgOffset = wgSum;
      wgSum = (wgSum + (sgTotals[sg] ?? 0)) >>> 0;
      for (let lid = sg * sgSize; lid < Math.min(wgSize, (sg + 1) * sgSize); lid += 1) {
        const idx = base + lid;
        if (idx >= n) break;
        const local = (sgOffset + (lanePrefixes[lid] ?? 0)) >>> 0;
        localOffsets[idx] = local;
        globalOffsets[idx] = (runningWgOffset + local) >>> 0;
      }
    }
    workgroupTotals[w] = wgSum >>> 0;
    runningWgOffset = (runningWgOffset + wgSum) >>> 0;
  }

  return {
    gpuParityVerified: false,
    localOffsets, globalOffsets, workgroupTotals, totalCount: runningWgOffset >>> 0,
    workgroupCount: wgCount, workgroupSize: wgSize, subgroupSize: sgSize, subgroupsPerWorkgroup: sgPerWg,
    subgroupBarrierCountPerWorkgroup: 1, standardBarrierCountPerWorkgroup: 13,
  };
}

/** `STANDARD_PREFIX_SUM_TILE_BIN_WGSL`(64-wide Blelloch `workgroupBarrier`) 정확 CPU 미러. */
export function emulateStandardBarrierTilePrefixSum(tileCounts: ArrayLike<number>): SubgroupPrefixSumResult {
  const counts = extremePrefixCounts(tileCounts);
  const n = counts.length;
  const wgSize = SUBGROUP_TILE_WORKGROUP_SIZE_X;
  const wgCount = n === 0 ? 0 : Math.ceil(n / wgSize);
  const localOffsets = new Uint32Array(n);
  const globalOffsets = new Uint32Array(n);
  const workgroupTotals = new Uint32Array(wgCount);
  const shared = new Uint32Array(wgSize);
  let runningWgOffset = 0;

  for (let w = 0; w < wgCount; w += 1) {
    const base = w * wgSize;
    for (let tid = 0; tid < wgSize; tid += 1) {
      const idx = base + tid;
      shared[tid] = idx < n ? counts[idx] ?? 0 : 0;
    }
    let offset = 1;
    for (let d = wgSize >>> 1; d > 0; d >>>= 1) {
      for (let tid = 0; tid < d; tid += 1) {
        const bi = offset * (2 * tid + 2) - 1;
        shared[bi] = ((shared[bi] ?? 0) + (shared[offset * (2 * tid + 1) - 1] ?? 0)) >>> 0;
      }
      offset <<= 1;
    }
    const wgTotal = shared[wgSize - 1] ?? 0;
    workgroupTotals[w] = wgTotal;
    shared[wgSize - 1] = 0;
    for (let d = 1; d < wgSize; d <<= 1) {
      offset >>>= 1;
      for (let tid = 0; tid < d; tid += 1) {
        const ai = offset * (2 * tid + 1) - 1;
        const bi = offset * (2 * tid + 2) - 1;
        const left = shared[ai] ?? 0;
        shared[ai] = shared[bi] ?? 0;
        shared[bi] = ((shared[bi] ?? 0) + left) >>> 0;
      }
    }
    for (let tid = 0; tid < wgSize; tid += 1) {
      const idx = base + tid;
      if (idx >= n) break;
      const local = shared[tid] ?? 0;
      localOffsets[idx] = local;
      globalOffsets[idx] = (runningWgOffset + local) >>> 0;
    }
    runningWgOffset = (runningWgOffset + wgTotal) >>> 0;
  }

  return {
    gpuParityVerified: false,
    localOffsets, globalOffsets, workgroupTotals, totalCount: runningWgOffset >>> 0,
    workgroupCount: wgCount, workgroupSize: wgSize, subgroupSize: wgSize, subgroupsPerWorkgroup: 1,
    subgroupBarrierCountPerWorkgroup: 1, standardBarrierCountPerWorkgroup: 13,
  };
}

function clampQ(value: number, min: number, max: number, q: (v: number) => number): number {
  return q(!Number.isFinite(value) ? min : Math.max(min, Math.min(max, value)));
}

/** `F16_SPECTRAL_KM7_BRUSH_WGSL` / `F32_SPECTRAL_KM7_BRUSH_WGSL` 결정론적 CPU 참조 패리티 에뮬레이터. */
export function emulateF16SpectralKm7Mix(input: EmulateSpectralKm7Input): EmulateSpectralKm7Result {
  const mode = input.precisionMode ?? input.params.precisionMode ?? "f16";
  const isF16 = mode === "f16";
  const q = isF16 ? quantizeFloat16 : Math.fround;
  const floorVal = q(isF16 ? KM7_F16_REFLECTANCE_FLOOR : KM7_F32_REFLECTANCE_FLOOR);
  const epsVal = q(isF16 ? 0.0005 : 1e-6);
  const alphaFloor = q(isF16 ? 0.001 : 1e-6);

  const [width, height] = extremeDimensions(input.params.width, input.params.height);
  const pixelCount = width * height;
  extremeFiniteArray(input.canvasRgba, pixelCount * 4); extremeFiniteArray(input.strokeMask, pixelCount);
  if (isF16) for (let i = 0; i < pixelCount * 4; i += 1) if (!Number.isFinite(q(input.canvasRgba[i] ?? 0))) throw new RangeError("f16 캔버스 표현 범위를 초과했습니다.");
  if (Object.values(input.params).some((value) => typeof value === "number" && !Number.isFinite(value))) throw new RangeError("분광 파라미터는 유한 수치여야 합니다.");
  const out = new Float32Array(pixelCount * 4);
  const [br, bg, bb, ba] = [clampQ(input.params.pigmentR ?? 0.12, 0, 1, q), clampQ(input.params.pigmentG ?? 0.24, 0, 1, q), clampQ(input.params.pigmentB ?? 0.72, 0, 1, q), clampQ(input.params.pigmentA ?? 1, 0, 1, q)];
  const [flow, mixStr, tintA, tintB, gamma] = [clampQ(input.params.flowOpacity ?? 1, 0, 1, q), clampQ(input.params.mixStrength ?? 0.6, 0, 1, q), clampQ(input.params.tintCanvas ?? 1, 0.1, 8, q), clampQ(input.params.tintBrush ?? 1, 0.1, 8, q), clampQ(input.params.concentrationGamma ?? 1.65, 0.5, 3, q)];
  const [basisR, basisG, basisB] = [KM7_BASIS_R.map(q), KM7_BASIS_G.map(q), KM7_BASIS_B.map(q)];
  const [recR, recG, recB] = [KM7_RECONSTRUCT_R.map(q), KM7_RECONSTRUCT_G.map(q), KM7_RECONSTRUCT_B.map(q)];
  const mixedBands = new Float32Array(7);
  let activeStrokePixels = 0;
  let overflowCount = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const base = i * 4;
    const [dr, dg, db, da] = [q(input.canvasRgba[base] ?? 0), q(input.canvasRgba[base + 1] ?? 0), q(input.canvasRgba[base + 2] ?? 0), q(input.canvasRgba[base + 3] ?? 0)];
    const mask = clampQ(input.strokeMask[i] ?? 0, 0, 1, q);
    if (mask <= epsVal) { out[base] = dr; out[base + 1] = dg; out[base + 2] = db; out[base + 3] = da; continue; }
    const srcA = clampQ(q(q(mask * flow) * ba), 0, 1, q);
    if (srcA === 0) { out[base] = dr; out[base + 1] = dg; out[base + 2] = db; out[base + 3] = da; continue; }
    activeStrokePixels += 1;
    const dstA = clampQ(da, 0, 1, q);
    const mixT = clampQ(q(srcA * mixStr), 0, 1, q);
    let [outR, outG, outB] = [br, bg, bb];

    if (dstA > alphaFloor) {
      const [ar, ag, ab] = [clampQ(dr, 0, 1, q), clampQ(dg, 0, 1, q), clampQ(db, 0, 1, q)];
      const lumA = Math.max(floorVal, q(q(q(0.2126) * ar) + q(q(q(0.7152) * ag) + q(q(0.0722) * ab))));
      const lumB = Math.max(floorVal, q(q(q(0.2126) * br) + q(q(q(0.7152) * bg) + q(q(0.0722) * bb))));
      const cA = q(q(q(Math.pow(Math.max(q(1 - mixT), epsVal), gamma)) * tintA) * q(lumA * q(16)));
      const cB = q(q(q(Math.pow(Math.max(mixT, epsVal), gamma)) * tintB) * q(lumB * q(16)));
      const normA = clampQ(q(cA / Math.max(q(cA + cB), epsVal)), 0, 1, q);
      const normB = q(1 - normA);
      for (let b = 0; b < 7; b += 1) {
        const rA = clampQ(q(q(ar * (basisR[b] ?? 0)) + q(q(ag * (basisG[b] ?? 0)) + q(ab * (basisB[b] ?? 0)))), floorVal, 1, q);
        const rB = clampQ(q(q(br * (basisR[b] ?? 0)) + q(q(bg * (basisG[b] ?? 0)) + q(bb * (basisB[b] ?? 0)))), floorVal, 1, q);
        const ks = Math.max(q(0), q(q(q(q(q(1 - rA) * q(1 - rA)) / q(q(2) * rA)) * normA) + q(q(q(q(1 - rB) * q(1 - rB)) / q(q(2) * rB)) * normB)));
        const qs = q(ks * q(0.25));
        const denom = q(q(1 + ks) + q(q(4) * q(Math.sqrt(q(q(qs * qs) + q(q(0.5) * qs))))));
        if (!Number.isFinite(ks) || !Number.isFinite(denom)) overflowCount += 1;
        mixedBands[b] = clampQ(q(1 / denom), floorVal, 1, q);
      }
      let [accR, accG, accB] = [q(0), q(0), q(0)];
      for (let b = 0; b < 7; b += 1) {
        const mv = mixedBands[b] ?? 0;
        accR = q(accR + q(mv * (recR[b] ?? 0))); accG = q(accG + q(mv * (recG[b] ?? 0))); accB = q(accB + q(mv * (recB[b] ?? 0)));
      }
      outR = clampQ(accR, 0, 1, q); outG = clampQ(accG, 0, 1, q); outB = clampQ(accB, 0, 1, q);
    }
    const outA = clampQ(q(srcA + q(dstA * q(1 - srcA))), 0, 1, q);
    if (!Number.isFinite(outR) || !Number.isFinite(outG) || !Number.isFinite(outB) || !Number.isFinite(outA)) overflowCount += 1;
    out[base] = outR; out[base + 1] = outG; out[base + 2] = outB; out[base + 3] = outA;
  }

  return { outputRgba: out, precisionMode: mode, storageBytesPerPixel: 16, simulatedStorageBytesPerPixel: isF16 ? 8 : 16, gpuParityVerified: false, processedPixels: pixelCount, activeStrokePixels, overflowCount };
}

/** `f16` 반정밀도 분광 혼색과 `f32` 기준 분광 혼색 간의 채널 오차를 정량 비교한다. */
export function compareF16VsF32SpectralParity(
  canvasRgba: Float32Array,
  strokeMask: Float32Array,
  params: SpectralKm7UniformInput,
): SpectralPrecisionParityReport {
  const f16Result = emulateF16SpectralKm7Mix({ canvasRgba, strokeMask, params, precisionMode: "f16" });
  const f32Result = emulateF16SpectralKm7Mix({ canvasRgba, strokeMask, params, precisionMode: "f32" });
  const len = Math.min(f16Result.outputRgba.length, f32Result.outputRgba.length);
  let maxErr = 0;
  let sumErr = 0;
  for (let i = 0; i < len; i += 1) {
    const err = Math.abs((f16Result.outputRgba[i] ?? 0) - (f32Result.outputRgba[i] ?? 0));
    if (err > maxErr) maxErr = err;
    sumErr += err;
  }
  return { comparisonScope: "cpu-precision-reference-only", gpuParityVerified: false, maxAbsChannelError: maxErr, meanAbsChannelError: len > 0 ? sumErr / len : 0, f16OverflowCount: f16Result.overflowCount, f16Result, f32Result };
}

/** 닫힌 2D 폴리곤 목록을 4×4 또는 8×8 Vello Sparse Strips(활성 스트립 + 백드롭 와인딩)로 분할한다. */
export function buildSparseStripsFromPolygons(
  polygons: readonly (readonly (readonly [number, number])[])[],
  canvasWidth: number,
  canvasHeight: number,
  stripHeight: SparseStripHeightPx = SPARSE_STRIP_HEIGHT_4,
  fillRule: "nonzero" | "evenodd" = "nonzero",
): readonly SparseStripDescriptor[] {
  const [w, h] = extremeDimensions(canvasWidth, canvasHeight);
  const tileH: SparseStripHeightPx = stripHeight === 8 ? SPARSE_STRIP_HEIGHT_8 : SPARSE_STRIP_HEIGHT_4;
  const [cols, bands] = [Math.ceil(w / tileH), Math.ceil(h / tileH)];
  validateExtremePolygons(polygons, cols * bands);
  const allSegs: SparseStripSegment[] = [];
  for (const poly of polygons) {
    if (poly.length < 3) continue;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a && b && Math.abs(b[1] - a[1]) > 1e-6) allSegs.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1] });
    }
  }
  const strips: SparseStripDescriptor[] = [];
  for (let band = 0; band < bands; band += 1) {
    const [y0, y1] = [band * tileH, Math.min(h, (band + 1) * tileH)];
    const bandSegs = allSegs.filter((s) => Math.max(s.y0, s.y1) > y0 && Math.min(s.y0, s.y1) < y1);
    if (bandSegs.length === 0) continue;
    for (let col = 0; col < cols; col += 1) {
      const x0 = col * tileH;
      const widthPx = Math.min(tileH, w - x0);
      const x1 = x0 + widthPx;
      const tileSegs: SparseStripSegment[] = [];
      let backdrop = 0;
      for (const s of bandSegs) {
        const down = s.y1 > s.y0;
        const [ax, ay, bx, by] = down ? [s.x0, s.y0, s.x1, s.y1] : [s.x1, s.y1, s.x0, s.y0];
        const [cy0, cy1] = [Math.max(y0, Math.min(y1, ay)), Math.max(y0, Math.min(y1, by))];
        if (cy1 - cy0 <= 1e-6) continue;
        const inv = 1 / Math.max(by - ay, 1e-6);
        const [sx0, sx1] = [ax + (bx - ax) * ((cy0 - ay) * inv), ax + (bx - ax) * ((cy1 - ay) * inv)];
        if (Math.max(sx0, sx1) <= x0 && ay <= y0 && by >= y1) backdrop += down ? 1 : -1;
        else if (Math.min(sx0, sx1) < x1) tileSegs.push(s);
      }
      if (tileSegs.length > 0 || backdrop !== 0) {
        strips.push({ originX: x0, originY: y0, widthPx, stripHeight: tileH, backdropWinding: backdrop, fillRule, segments: tileSegs });
      }
    }
  }
  return strips;
}

/** 4×4 / 8×8 스트립의 채움 규칙별 CPU 면적 참조 계산. GPU signed-area 근사와의 패리티는 보장하지 않는다. */
export function emulateSparseStripRaster(input: EmulateSparseStripInput): EmulateSparseStripResult {
  const [w, h] = extremeDimensions(input.canvasWidth, input.canvasHeight);
  validateExtremeStrips(input.strips);
  const totalCanvasPixels = w * h;
  const coverage = new Float32Array(totalCanvasPixels);
  const rgba = new Float32Array(totalCanvasPixels * 4);
  const [inkR, inkG, inkB, inkA] = input.inkColor ?? [0.08, 0.1, 0.14, 1];
  if (![inkR, inkG, inkB, inkA].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) throw new RangeError("잉크 채널은 0..1 유한 수치여야 합니다.");
  const defaultRule = input.fillRule ?? "nonzero";
  const evaluatedMask = new Uint8Array(totalCanvasPixels);
  let evaluatedPixels = 0;

  for (const strip of input.strips) {
    const [sh, sw] = [Math.max(4, Math.min(8, Math.floor(strip.stripHeight))), Math.max(0, Math.floor(strip.widthPx))];
    const rule = strip.fillRule ?? defaultRule;
    for (let ly = 0; ly < sh; ly += 1) {
      const py = strip.originY + ly;
      if (py < 0 || py >= h) continue;
      for (let lx = 0; lx < sw; lx += 1) {
        const px = strip.originX + lx;
        if (px < 0 || px >= w) continue;
        const idx = py * w + px;
        if (evaluatedMask[idx] !== 0) throw new RangeError("겹치는 스트립은 GPU 출력 경쟁을 피하기 위해 지원하지 않습니다.");
        evaluatedMask[idx] = 1; evaluatedPixels += 1;
        const cov = exactStripPixelCoverage(strip, px, py, rule);
        coverage[idx] = cov;
        const alpha = Math.max(0, Math.min(1, cov * inkA));
        const b = idx * 4;
        rgba[b] = inkR * alpha; rgba[b + 1] = inkG * alpha; rgba[b + 2] = inkB * alpha; rgba[b + 3] = alpha;
      }
    }
  }
  let coveredPixels = 0;
  for (let i = 0; i < totalCanvasPixels; i += 1) if ((coverage[i] ?? 0) > 1e-4) coveredPixels += 1;
  return {
    gpuParityVerified: false, rasterizationScope: "cpu-fill-rule-area-reference",
    coverage, rgba, stripCount: input.strips.length, totalCanvasPixels, evaluatedPixels, coveredPixels,
    skippedEmptyPixels: Math.max(0, totalCanvasPixels - evaluatedPixels),
    sparseRatio: totalCanvasPixels > 0 ? evaluatedPixels / totalCanvasPixels : 0,
  };
}

function compareNs(a: number | bigint, b: number | bigint): number {
  if (typeof a === "bigint" || typeof b === "bigint") {
    const ba = typeof a === "bigint" ? a : BigInt(Math.trunc(a));
    const bb = typeof b === "bigint" ? b : BigInt(Math.trunc(b));
    return ba < bb ? -1 : ba > bb ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function computeDeltaNs(startNs: number | bigint, endNs: number | bigint): number | null {
  const valid = (value: number | bigint): boolean => typeof value === "bigint" ? value >= BigInt(0) : Number.isSafeInteger(value) && value >= 0;
  if (!valid(startNs) || !valid(endNs)) return null;
  const delta = BigInt(endNs) - BigInt(startNs);
  return delta < BigInt(0) || delta > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(delta);
}

/**
 * WebGPU `timestamp-query` 실측 나노초 델타를 패스별 밀리초 프로파일링 요약으로 집계한다.
 * 실측 샘플이 없거나 역전/비유한 타임스탬프는 허위 추정치 없이 무효로 분리해 보고한다.
 */
export function summarizeGpuTimestampPassWindow(
  samples: readonly GpuTimestampPassSample[],
  options: { readonly frameBudgetMs?: number | undefined; readonly timestampPeriodNs?: number | undefined } = {},
): GpuTimestampWindowSummary {
  extremeInteger(samples.length, 0, 4096, "timestamp sample count");
  const frameBudgetMs = typeof options.frameBudgetMs === "number" && Number.isFinite(options.frameBudgetMs) && options.frameBudgetMs > 0 ? options.frameBudgetMs : 1000 / 60;
  const periodNs = typeof options.timestampPeriodNs === "number" && Number.isFinite(options.timestampPeriodNs) && options.timestampPeriodNs > 0 ? options.timestampPeriodNs : 1;
  const stageTotalsMs: Record<GpuTimestampPassStage, number> = { "tile-bin": 0, "spectral-brush": 0, "sparse-strip": 0, composite: 0, other: 0 };

  let totalGpuNs = 0;
  let validPassCount = 0;
  let invalidSampleCount = 0;
  let minStartNs: number | bigint | null = null;
  let maxEndNs: number | bigint | null = null;
  const provisional: Array<{ passId: string; stage: GpuTimestampPassStage; valid: boolean; deltaNs: number; durationMs: number; dispatchedWorkgroups: number | null }> = [];

  for (const sample of samples) {
    const stage: GpuTimestampPassStage = sample.stage && Object.hasOwn(stageTotalsMs, sample.stage) ? sample.stage : "other";
    const wg = typeof sample.dispatchedWorkgroups === "number" && Number.isFinite(sample.dispatchedWorkgroups) ? Math.max(0, Math.floor(sample.dispatchedWorkgroups)) : null;
    const rawDelta = computeDeltaNs(sample.startNs, sample.endNs);
    if (rawDelta === null) {
      invalidSampleCount += 1;
      provisional.push({ passId: sample.passId, stage, valid: false, deltaNs: 0, durationMs: 0, dispatchedWorkgroups: wg });
      continue;
    }
    const scaledNs = rawDelta * periodNs;
    const nextMin = minStartNs === null || compareNs(sample.startNs, minStartNs) < 0 ? sample.startNs : minStartNs;
    const nextMax = maxEndNs === null || compareNs(sample.endNs, maxEndNs) > 0 ? sample.endNs : maxEndNs;
    const span = computeDeltaNs(nextMin, nextMax);
    if (!Number.isFinite(scaledNs) || totalGpuNs + scaledNs > Number.MAX_SAFE_INTEGER || span === null || !Number.isFinite(span * periodNs) || span * periodNs > Number.MAX_SAFE_INTEGER) {
      invalidSampleCount += 1;
      provisional.push({ passId: sample.passId, stage, valid: false, deltaNs: 0, durationMs: 0, dispatchedWorkgroups: wg });
      continue;
    }
    const durationMs = scaledNs / 1_000_000;
    totalGpuNs += scaledNs;
    validPassCount += 1;
    stageTotalsMs[stage] += durationMs;
    if (minStartNs === null || compareNs(sample.startNs, minStartNs) < 0) minStartNs = sample.startNs;
    if (maxEndNs === null || compareNs(sample.endNs, maxEndNs) > 0) maxEndNs = sample.endNs;
    provisional.push({ passId: sample.passId, stage, valid: true, deltaNs: scaledNs, durationMs, dispatchedWorkgroups: wg });
  }

  const totalGpuMs = totalGpuNs / 1_000_000;
  const spanRaw = minStartNs !== null && maxEndNs !== null ? computeDeltaNs(minStartNs, maxEndNs) : null;
  const windowSpanMs = spanRaw !== null ? (spanRaw * periodNs) / 1_000_000 : 0;
  let hottestPassId: string | null = null;
  let hottestMs = -1;
  const passes: GpuTimestampPassMetric[] = provisional.map((entry) => {
    if (entry.valid && entry.durationMs > hottestMs) { hottestMs = entry.durationMs; hottestPassId = entry.passId; }
    return Object.freeze({
      passId: entry.passId, stage: entry.stage, valid: entry.valid,
      deltaNs: entry.deltaNs, durationMs: entry.durationMs,
      shareOfTotal: entry.valid && totalGpuMs > 0 ? entry.durationMs / totalGpuMs : 0,
      dispatchedWorkgroups: entry.dispatchedWorkgroups,
    });
  });

  const hasMeasurements = validPassCount > 0;
  return Object.freeze({
    measurementSource: "caller-supplied-timestamps", deviceMeasurementsVerified: false,
    hasMeasurements, sampleCount: samples.length, validPassCount, invalidSampleCount,
    totalGpuNs, totalGpuMs, windowSpanMs,
    overlapRatio: hasMeasurements && windowSpanMs > 0 ? totalGpuMs / windowSpanMs : null,
    frameBudgetMs,
    budgetUtilizationRatio: hasMeasurements ? totalGpuMs / frameBudgetMs : null,
    withinFrameBudget: hasMeasurements ? totalGpuMs <= frameBudgetMs : null,
    hottestPassId, stageTotalsMs: Object.freeze(stageTotalsMs), passes: Object.freeze(passes),
  });
}
