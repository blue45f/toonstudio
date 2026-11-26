/**
 * Wave-3 확장 스위트(Audio DSP · Vector Path · Webtoon Smart Slicer/Dedup · Color/Display-P3/CMYK-TAC/Palette)
 * 지연 로드 전용 타입·상수 계약.
 */

export const STUDIO_WASM64_WAVE3_URL = "/wasm/studio-wasm64-extended-suite.wasm";
export const WAVE3_EXPECTED_ABI_VERSION = 1;
export const WAVE3_EXPECTED_CAPABILITIES = 0x0f;

export type Wave3BackendTier =
  | "native-dylib"
  | "wasm-relaxed-simd"
  | "wasm-simd128"
  | "wasm-scalar"
  | "js-fallback";

export type BiquadFilterKindName = "lowpass" | "highpass" | "peaking";
export type ResampleInterpolationName = "linear" | "cubic-hermite";
export type StrokeJoinStyleName = "bevel" | "miter";
export type WindingFillRuleName = "nonzero" | "evenodd";
export type TileClassName = "empty-transparent" | "solid-color" | "content";

export interface Wave3ArenaStats {
  readonly activeAllocations: number;
  readonly totalAllocations: number;
  readonly totalFrees: number;
  readonly liveAllocatedBytes: number;
  readonly peakAllocatedBytes: number;
}

export interface Wave3RuntimeMetadata {
  readonly backend: Wave3BackendTier;
  readonly abiVersion: number;
  readonly wave3CapabilitiesMask: number;
  readonly resolvedUrl: string | null;
  readonly wasmByteLength: number;
  readonly linearMemoryBytes: number;
  readonly loadElapsedMs: number;
}

export interface Wave3BiquadEqOptions {
  readonly kind: BiquadFilterKindName;
  readonly sampleRate?: number;
  readonly freqHz: number;
  readonly q?: number;
  readonly gainDb?: number;
  /** `[lz1, lz2, rz1, rz2]` 연속 청크 필터 상태 (생략 시 0 초기화). */
  readonly state?: Float32Array;
}

export interface Wave3BiquadEqResult {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly nextState: Float32Array;
  readonly frames: number;
  readonly backend: Wave3BackendTier;
}

export interface Wave3MixTrackParam {
  readonly gain: number;
  readonly pan: number;
  readonly mute?: boolean;
}

export interface Wave3DynamicsOptions {
  readonly sampleRate?: number;
  readonly thresholdDb?: number;
  readonly ratio?: number;
  readonly kneeDb?: number;
  readonly attackMs?: number;
  readonly releaseMs?: number;
  readonly makeupDb?: number;
  readonly limiterCeilingDb?: number;
}

export interface Wave3MixMasterResult {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly frames: number;
  readonly integratedLufs: number;
  readonly truePeakLinear: number;
  readonly truePeakDbfs: number;
  readonly samplePeakLinear: number;
  readonly maxGainReductionDb: number;
  readonly activeTracks: number;
  readonly backend: Wave3BackendTier;
}

export interface Wave3ReverbOptions {
  readonly sampleRate?: number;
  readonly roomSize?: number;
  readonly damping?: number;
  readonly wet?: number;
  readonly dry?: number;
}

export interface Wave3ReverbResult {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly frames: number;
  readonly backend: Wave3BackendTier;
}

export interface Wave3ResampleResult {
  readonly samples: Float32Array;
  readonly outputFrames: number;
  readonly backend: Wave3BackendTier;
}

export interface Wave3BezierFlattenResult {
  readonly pointsXy: Float32Array;
  readonly arcLengths: Float32Array;
  readonly pointCount: number;
  readonly totalLength: number;
  readonly backend: Wave3BackendTier;
}

export interface Wave3StrokeOutlineResult {
  readonly polygonXy: Float32Array;
  readonly vertexCount: number;
  readonly backend: Wave3BackendTier;
}

export interface Wave3HitTestResult {
  readonly hits: Uint8Array;
  readonly hitCount: number;
  readonly backend: Wave3BackendTier;
}

export interface Wave3SliceConfig {
  readonly targetHeight?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly searchWindow?: number;
  readonly inkL1Threshold?: number;
  readonly continuityWeight?: number;
}

export interface Wave3SliceSpan {
  readonly startY: number;
  readonly endY: number;
  readonly height: number;
  readonly cutCost: number;
  readonly isCleanGutter: boolean;
}

export interface Wave3SmartSliceResult {
  readonly spans: readonly Wave3SliceSpan[];
  readonly backend: Wave3BackendTier;
}

export interface Wave3TileDedupEntry {
  readonly tileIndex: number;
  readonly fnv1a64: bigint;
  readonly canonicalTileIndex: number;
  readonly tileClass: TileClassName;
  readonly tileWidth: number;
  readonly tileHeight: number;
}

export interface Wave3TileDedupResult {
  readonly tilesX: number;
  readonly tilesY: number;
  readonly totalTiles: number;
  readonly uniqueTiles: number;
  readonly duplicateTiles: number;
  readonly emptyTransparentTiles: number;
  readonly solidColorTiles: number;
  readonly contentTiles: number;
  readonly dedupRatio: number;
  readonly entries: readonly Wave3TileDedupEntry[];
  readonly backend: Wave3BackendTier;
}

export interface Wave3CmykTacOptions {
  readonly gcrStrength?: number;
  readonly ucrStart?: number;
  readonly maxK?: number;
  readonly tacLimitPct?: number;
}

export interface Wave3CmykTacResult {
  readonly cmyk: Uint8Array;
  readonly pixelCount: number;
  readonly clampedPixels: number;
  readonly maxTacPct: number;
  readonly backend: Wave3BackendTier;
}

export interface Wave3PaletteSwatch {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly count: number;
  readonly coverage: number;
}

export interface Wave3PaletteResult {
  readonly swatches: readonly Wave3PaletteSwatch[];
  readonly backend: Wave3BackendTier;
}

export interface StudioWave3Runtime {
  readonly getMetadata: () => Wave3RuntimeMetadata;
  readonly getArenaStats: () => Wave3ArenaStats;
  readonly biquadEqStereo: (
    left: Float32Array,
    right: Float32Array,
    options: Wave3BiquadEqOptions,
  ) => Wave3BiquadEqResult;
  readonly mixAndMasterStereo: (
    tracksPlanar: Float32Array,
    trackCount: number,
    frames: number,
    trackParams: readonly Wave3MixTrackParam[],
    dynamics?: Wave3DynamicsOptions,
  ) => Wave3MixMasterResult;
  readonly schroederReverbStereo: (
    inLeft: Float32Array,
    inRight: Float32Array,
    options?: Wave3ReverbOptions,
  ) => Wave3ReverbResult;
  readonly resampleMono: (
    input: Float32Array,
    outputFrames: number,
    rateRatio: number,
    mode?: ResampleInterpolationName,
  ) => Wave3ResampleResult;
  readonly simplifyPolylineRdp: (xy: Float32Array, epsilon: number) => Float32Array;
  readonly smoothPolylineChaikin: (
    xy: Float32Array,
    iterations: number,
    closed?: boolean,
    ratio?: number,
  ) => Float32Array;
  readonly flattenCubicBezier: (
    ctrlXy: Float32Array,
    tolerance: number,
  ) => Wave3BezierFlattenResult;
  readonly expandVariableWidthStroke: (
    spineXyw: Float32Array,
    join?: StrokeJoinStyleName,
    miterLimit?: number,
  ) => Wave3StrokeOutlineResult;
  readonly hitTestPolygonBatch: (
    polyXy: Float32Array,
    queriesXy: Float32Array,
    rule?: WindingFillRuleName,
  ) => Wave3HitTestResult;
  readonly planWebtoonSmartSlices: (
    rgba: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    config?: Wave3SliceConfig,
  ) => Wave3SmartSliceResult;
  readonly dedupTilesFnv64: (
    rgba: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    tileSize: number,
  ) => Wave3TileDedupResult;
  readonly srgbToDisplayP3: (rgba: Uint8Array | Uint8ClampedArray) => Float32Array;
  readonly displayP3ToSrgb: (p3Rgba: Float32Array) => Uint8Array;
  readonly rgbaToCmykTac: (
    rgba: Uint8Array | Uint8ClampedArray,
    options?: Wave3CmykTacOptions,
  ) => Wave3CmykTacResult;
  readonly extractPaletteMedianCut: (
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors?: number,
    alphaThreshold?: number,
  ) => Wave3PaletteResult;
  readonly dispose: () => void;
}
