/**
 * `studio-wasm64-extended-suite.wasm` (`--features full-suite`, 40 exports, `ext=0x7ffff`)
 * 확장 스위트 런타임 브리지 공용 타입·상수 정의.
 */

import type {
  Wasm64ExecutableTier,
  Wasm64HotpathLoadSource,
  WasmDirtyRect,
} from "./wasm64-hotpath-types";

export const WASM64_EXTENDED_SUITE_EXPECTED_ABI = 1;
export const WASM64_EXTENDED_SUITE_EXPECTED_HOTPATH_CAPS = 0x7f;
export const WASM64_EXTENDED_SUITE_EXPECTED_3D_CAPS = 0x3f;
export const WASM64_EXTENDED_SUITE_EXPECTED_STAGE_CAPS = 0x07;
export const WASM64_EXTENDED_SUITE_EXPECTED_CAPS = 0x7ffff;

export type RgbaColorInput = number | readonly [number, number, number, number];
export type HalftonePatternName = "dot" | "line" | "crosshatch" | "diamond";
export type HalftonePatternCode = 0 | 1 | 2 | 3;
export type LiquifyModeName = "push" | "bloat" | "pinch" | "twirl-cw" | "twirl-ccw";
export type LiquifyModeCode = 0 | 1 | 2 | 3 | 4;
export type StageDepthRangeName = "neg-one-to-one" | "zero-to-one";
export type FoleyFilterModeName = "lowpass" | "bandpass";

export interface WasmExtendedArenaStats {
  readonly activeAllocations: number;
  readonly totalAllocations: number;
  readonly totalFrees: number;
  readonly liveAllocatedBytes: number;
  readonly peakAllocatedBytes: number;
}

export interface StudioWasm64ExtendedSuiteMetadata {
  readonly abiVersion: number;
  readonly hotpathCapabilitiesMask: number;
  readonly extended3dCapabilitiesMask: number;
  readonly atelierStageCapabilitiesMask: number;
  readonly extendedCapabilitiesMask: number;
  readonly cpuTier: Wasm64ExecutableTier;
  readonly resolvedUrl: string | null;
  readonly wasmByteLength: number;
  readonly linearMemoryBytes: number;
  readonly loadSource: Exclude<Wasm64HotpathLoadSource, "js-fallback">;
  readonly loadElapsedMs: number;
}

export interface LoadStudioWasm64ExtendedSuiteOptions {
  readonly wasmUrl?: string;
  readonly wasmBytes?: Uint8Array | ArrayBuffer;
  readonly cpuTierHint?: Wasm64ExecutableTier;
  readonly fetchFn?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Pro Raster Tools (11 C-ABI wrappers)
// ---------------------------------------------------------------------------

export interface WasmFloodFillOptions {
  readonly seedX: number;
  readonly seedY: number;
  readonly fillRgba: RgbaColorInput;
  readonly tolerance?: number;
  readonly gapClosingRadius?: number;
  readonly boundaryMask?: Uint8Array | null;
  readonly mutateInPlace?: boolean;
}

export interface WasmFloodFillResult {
  readonly output: Uint8Array;
  readonly filledPixels: number;
  readonly dirtyRect: WasmDirtyRect;
}

export interface WasmMagicWandOptions {
  readonly seedX: number;
  readonly seedY: number;
  readonly tolerance?: number;
  readonly gapClosingRadius?: number;
  readonly antiAlias?: boolean;
  readonly boundaryMask?: Uint8Array | null;
}

export interface WasmMagicWandResult {
  readonly mask: Uint8Array;
  readonly selectedPixels: number;
  readonly dirtyRect: WasmDirtyRect;
}

export interface WasmMarchingAntsOptions {
  readonly threshold?: number;
}

export interface WasmMarchingAntsResult {
  /** `[x0, y0, x1, y1]` 스트라이드 4 배열. */
  readonly segments: Uint32Array;
  readonly segmentCount: number;
}

export interface WasmOklchBatchResult {
  /** `[L, C, H_deg, alpha]` 스트라이드 4 배열. */
  readonly oklch: Float32Array;
  readonly pixelCount: number;
}

export interface WasmRgbaBatchResult {
  readonly rgba: Uint8Array;
  readonly pixelCount: number;
}

export interface WasmCmykBatchResult {
  /** `[C, M, Y, K]` 스트라이드 4 배열. */
  readonly cmyk: Uint8Array;
  readonly pixelCount: number;
}

export interface WasmHalftoneOptions {
  readonly sourceRgba?: Uint8Array | Uint8ClampedArray | null;
  readonly pattern?: HalftonePatternName | HalftonePatternCode;
  readonly cellPitchPx?: number;
  readonly angleDeg?: number;
  readonly toneDensity?: number;
  readonly softness?: number;
  readonly inkRgba?: RgbaColorInput;
  readonly paperRgba?: RgbaColorInput;
}

export interface WasmHalftoneResult {
  readonly output: Uint8Array;
  readonly processedPixels: number;
}

export interface WasmLiquifyOptions {
  readonly mode: LiquifyModeName | LiquifyModeCode;
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly strength: number;
  readonly dx?: number;
  readonly dy?: number;
}

export interface WasmLiquifyResult {
  readonly output: Uint8Array;
  readonly affectedPixels: number;
  readonly dirtyRect: WasmDirtyRect;
}

export interface WasmMlsWarpResult {
  readonly verticesXy: Float32Array;
  readonly vertexCount: number;
}

export interface WasmVectorizeStrokeOptions {
  readonly rdpEpsilon?: number;
  readonly bezierErrorTolerance?: number;
}

export interface WasmVectorizeStrokeResult {
  /** `[p0x, p0y, c1x, c1y, c2x, c2y, p3x, p3y, w0, w1]` 스트라이드 10 배열. */
  readonly segments: Float32Array;
  readonly segmentCount: number;
  readonly maxFitError: number;
  readonly compressionRatio: number;
}

export type PsdColorModeName =
  | "bitmap"
  | "grayscale"
  | "indexed"
  | "rgb"
  | "cmyk"
  | "multichannel"
  | "duotone"
  | "lab"
  | "unknown";

export interface WasmPsdHeaderInfo {
  readonly version: number;
  readonly isPsb: boolean;
  readonly channels: number;
  readonly width: number;
  readonly height: number;
  readonly depthBits: number;
  readonly colorModeCode: number;
  readonly colorModeName: PsdColorModeName;
  readonly colorModeDataOffset: bigint;
  readonly colorModeDataLength: bigint;
  readonly imageResourcesOffset: bigint;
  readonly imageResourcesLength: bigint;
  readonly layerAndMaskOffset: bigint;
  readonly layerAndMaskLength: bigint;
  readonly imageDataOffset: bigint;
  readonly estimatedUncompressedRgbaBytes: bigint;
  readonly requiresMemory64: boolean;
}

// ---------------------------------------------------------------------------
// 3D & Virtual Studio (10 C-ABI wrappers)
// ---------------------------------------------------------------------------

export interface WasmVrmSkinningInput {
  readonly inPosXyz: Float32Array;
  readonly inNormXyz: Float32Array;
  readonly joints: Uint16Array;
  readonly weights: Float32Array;
  readonly boneMatrices: Float32Array;
  readonly vertexCount: number;
  readonly boneCount: number;
}

export interface WasmVrmSkinningResult {
  readonly outPosXyz: Float32Array;
  readonly outNormXyz: Float32Array;
  readonly skinnedVertices: number;
}

export interface WasmLtLineartParams {
  readonly depthThreshold?: number;
  readonly normalEdgeThreshold?: number;
  readonly depthWeight?: number;
  readonly normalWeight?: number;
  readonly edgeSoftness?: number;
  readonly minInkAlpha?: number;
}

export interface WasmLtLineartResult {
  readonly alpha: Uint8Array;
  readonly inkPixels: number;
}

export interface WasmStageCullInput {
  readonly viewProj: Float32Array;
  readonly cameraPos: readonly [number, number, number];
  readonly lodDistances: readonly [number, number, number];
  readonly depthRange?: StageDepthRangeName | 0 | 1;
  /** `[minX, minY, minZ, maxX, maxY, maxZ, isOccluder]` 스트라이드 7 배열. */
  readonly aabbs: Float32Array;
}

export interface WasmStageCullResult {
  readonly visibleIndices: Uint32Array;
  readonly visibleLods: Uint8Array;
  readonly visibleCount: number;
  readonly frustumCulledCount: number;
  readonly occlusionCulledCount: number;
  readonly occludersRasterized: number;
}

export interface WasmSphereOverlapOptions {
  readonly cellSize?: number;
  readonly iterations?: number;
  readonly relaxation?: number;
  readonly mutateInPlace?: boolean;
}

export interface WasmSphereOverlapResult {
  readonly spheres: Float32Array;
  readonly resolvedPairs: number;
}

export interface WasmStageAcousticsLightingInput {
  /** `f32[11]`: `[pos(3), forward(3), up(3), headShadowLpfHz, airAbsorptionPerM]`. */
  readonly listener: Float32Array;
  /** 스트라이드 7 (`sourceCount * 7`). */
  readonly sources: Float32Array;
  /** 스트라이드 9 (`lightCount * 9`). */
  readonly lights: Float32Array;
  /** 스트라이드 8 (`sampleCount * 8`). */
  readonly samples: Float32Array;
}

export interface WasmStageAcousticsLightingResult {
  /** 스트라이드 6 (`sourceCount * 6`). */
  readonly audioOut: Float32Array;
  /** 스트라이드 8 (`sampleCount * 8`). */
  readonly lightingOut: Float32Array;
  readonly evaluatedTotal: number;
}

export interface WasmVerletSpringParams {
  readonly dt: number;
  readonly stiffness: number;
  readonly damping: number;
  readonly windX: number;
  readonly windY: number;
  readonly windZ: number;
  readonly gravityY: number;
  readonly floorY: number;
  readonly floorRestitution: number;
  readonly particleRadius: number;
}

export interface WasmVerletSpringInput {
  readonly posXyz: Float32Array;
  readonly prevXyz: Float32Array;
  readonly invMass: Float32Array;
  readonly restLen: Float32Array;
  readonly colliders?: Float32Array;
  readonly iterations?: number;
  readonly params?: Partial<WasmVerletSpringParams>;
  readonly mutateInPlace?: boolean;
}

export interface WasmVerletSpringResult {
  readonly posXyz: Float32Array;
  readonly prevXyz: Float32Array;
  readonly particleCount: number;
}

export interface WasmFingerFabrikParams {
  readonly palmForward: readonly [number, number, number];
  readonly flexionNormal: readonly [number, number, number];
  readonly mcpMaxFlexionRad: number;
  readonly mcpMaxExtensionRad: number;
  readonly mcpMaxSplayRad: number;
  readonly pipMaxFlexionRad: number;
  readonly dipMaxFlexionRad: number;
  readonly tolerance: number;
}

export interface WasmFingerFabrikInput {
  readonly jointsXyz: Float32Array;
  readonly boneLengths: Float32Array;
  readonly targetXyz: Float32Array;
  readonly maxIterations?: number;
  readonly params?: Partial<WasmFingerFabrikParams>;
  readonly mutateInPlace?: boolean;
}

export interface WasmFingerFabrikResult {
  readonly jointsXyz: Float32Array;
  readonly iterations: number;
}

export interface WasmFoleyDspParams {
  readonly sampleRate: number;
  readonly cutoffHz: number;
  readonly qFactor: number;
  readonly pan: number;
  readonly gainDb: number;
  readonly limiterCeiling: number;
  readonly limiterReleaseMs: number;
  readonly targetLufs: number;
  readonly enableLufsLeveling: boolean;
}

export interface WasmFoleyBiquadInput {
  readonly monoIn: Float32Array;
  /** `f32[5]`: `[z1, z2, limiterEnv, lufsEnergyEwma, lufsGain]`. 미지정 시 기본 초기 상태 사용. */
  readonly state?: Float32Array;
  readonly filterMode?: FoleyFilterModeName | 0 | 1;
  readonly params?: Partial<WasmFoleyDspParams>;
  readonly mutateStateInPlace?: boolean;
}

export interface WasmFoleyBiquadResult {
  readonly outLeft: Float32Array;
  readonly outRight: Float32Array;
  readonly nextState: Float32Array;
  readonly renderedFrames: number;
}

export interface StudioWasm64ExtendedSuiteRuntime {
  readonly getMetadata: () => StudioWasm64ExtendedSuiteMetadata;
  readonly getArenaStats: () => WasmExtendedArenaStats;
  readonly floodFillRgba: (
    rgba: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    options: WasmFloodFillOptions,
  ) => WasmFloodFillResult;
  readonly magicWandMask: (
    rgba: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    options: WasmMagicWandOptions,
  ) => WasmMagicWandResult;
  readonly extractMarchingAnts: (
    mask: Uint8Array,
    width: number,
    height: number,
    options?: WasmMarchingAntsOptions,
  ) => WasmMarchingAntsResult;
  readonly rgbaToOklch: (rgba: Uint8Array | Uint8ClampedArray) => WasmOklchBatchResult;
  readonly oklchToRgba: (oklch: Float32Array) => WasmRgbaBatchResult;
  readonly rgbaToCmyk: (
    rgba: Uint8Array | Uint8ClampedArray,
    gcrFactor?: number,
  ) => WasmCmykBatchResult;
  readonly renderHalftoneScreentone: (
    width: number,
    height: number,
    options?: WasmHalftoneOptions,
  ) => WasmHalftoneResult;
  readonly liquifyDisplaceRgba: (
    rgba: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    options: WasmLiquifyOptions,
  ) => WasmLiquifyResult;
  readonly warpMeshRigidMls: (
    verticesXy: Float32Array,
    pins: Float32Array,
    alpha?: number,
  ) => WasmMlsWarpResult;
  readonly vectorizeStrokeCubic: (
    pointsXyp: Float32Array,
    options?: WasmVectorizeStrokeOptions,
  ) => WasmVectorizeStrokeResult;
  readonly parsePsdHeader: (bytes: Uint8Array) => WasmPsdHeaderInfo;
  readonly encodeMorton2d: (x: number, y: number) => number;
  readonly encodeMorton3d: (x: number, y: number, z: number) => number;
  readonly skinVrmMesh4BoneSoa: (input: WasmVrmSkinningInput) => WasmVrmSkinningResult;
  readonly extractLtLineart: (
    normalXyz: Float32Array,
    depth: Float32Array,
    width: number,
    height: number,
    params?: WasmLtLineartParams,
  ) => WasmLtLineartResult;
  readonly cullStageFrustumHiz: (input: WasmStageCullInput) => WasmStageCullResult;
  readonly resolveStageSphereOverlaps: (
    spheres: Float32Array,
    options?: WasmSphereOverlapOptions,
  ) => WasmSphereOverlapResult;
  readonly evaluateStageAcousticsAndLighting: (
    input: WasmStageAcousticsLightingInput,
  ) => WasmStageAcousticsLightingResult;
  readonly stepVerletSpringChainsSoa: (input: WasmVerletSpringInput) => WasmVerletSpringResult;
  readonly solveFingerFabrikChain: (input: WasmFingerFabrikInput) => WasmFingerFabrikResult;
  readonly renderFoleyBiquadBlock: (input: WasmFoleyBiquadInput) => WasmFoleyBiquadResult;
  readonly dispose: () => void;
}
