import { validateInfiniteZoomWgsl } from "./infinite-zoom-wgsl-contract";

export { validateInfiniteZoomWgsl } from "./infinite-zoom-wgsl-contract";

/**
 * Wave 55B — 무한 줌 레이어링 · 2.5D 공간 캔버스 & WebGPU Triple-Ring/Mega-Atlas 버퍼 엔진.
 *
 * - Floating-Origin 배정밀도(f64 원점 분리 -> f32 카메라 상대 오프셋) 무한 줌 좌표계 (0.01x ~ 100,000x, 7 decades)
 * - 4단계 시맨틱 줌(스토리보드 -> 본 편집/2.5D 시차 -> 벡터/G펜/스크린톤 -> 종이 섬유/안료 극접사 포털) 및 연속 교차 페이드
 * - CPU 용량·슬롯 계획 예제: 가정한 Triple-Ring 대기·단편화 수치, 실제 GPU 할당·Fence 없음
 * - 미컴파일 WGSL 소스 예제(상대좌표 변환 · 시맨틱 LOD 블렌딩 · 인다이렉션 테이블 샘플링) 및 정적 계약 검증기
 */

export const INFINITE_ZOOM_MANIFEST_SCHEMA_VERSION = "toonstudio.infinite-zoom-spatial-gpu.v1" as const;
export const MIN_ZOOM_EXP = -2.0;
export const MAX_ZOOM_EXP = 5.0;
export const ZOOM_DECADES_SPAN = 7;
export const MIN_ZOOM_FACTOR = 0.01;
export const MAX_ZOOM_FACTOR = 100_000;
export const DEFAULT_ZOOM_EXP = 0;
export const DEFAULT_PARALLAX_DEPTH = 0.45;
export const DEFAULT_WORLD_OFFSET_PX = 250_000;
export const FLOATING_ORIGIN_CHUNK_SIZE_PX = 4096;
export const WEBGPU_UNIFORM_OFFSET_ALIGNMENT = 256;
export const WEBGPU_BYTES_PER_ROW_ALIGNMENT = 256;
export const TRIPLE_RING_FRAME_COUNT = 3;
export const MEGA_ATLAS_DIMENSION_PX = 4096;
export const ATLAS_PAGE_SIZE_PX = 256;
export const ATLAS_GRID_COLS = MEGA_ATLAS_DIMENSION_PX / ATLAS_PAGE_SIZE_PX;
export const ATLAS_GRID_ROWS = MEGA_ATLAS_DIMENSION_PX / ATLAS_PAGE_SIZE_PX;
export const ATLAS_TOTAL_SLOTS = ATLAS_GRID_COLS * ATLAS_GRID_ROWS;
export const WGSL_UNIFORM_STRUCT_BYTES = 112;
export const WGSL_INDIRECTION_STRUCT_BYTES = 16;

export type SemanticZoomBandId =
  | "storyboard-overview" | "manuscript-parallax" | "vector-ink-screentone" | "micro-fiber-portal";
export type GpuBufferStrategy = "triple-ring-mega-atlas" | "single-staging-naive";
export type PortalCullState = "culled-too-small" | "active" | "overscaled-parent";
export type RingSlotFenceState =
  | "cpu-writing" | "gpu-executing" | "fence-signaled-free" | "stalled-awaiting-mapAsync";
export type AtlasSlotOccupancyState = "active-hot" | "cached-warm" | "lru-evictable" | "free";

export interface SemanticZoomBandSpec {
  readonly id: SemanticZoomBandId; readonly stageOrder: 1 | 2 | 3 | 4;
  readonly minZoom: number; readonly maxZoom: number;
  readonly minZoomExp: number; readonly maxZoomExp: number;
  readonly anchorZoom: number; readonly anchorZoomExp: number;
  readonly lodLevel: 0 | 1 | 2 | 3; readonly parallaxWeight: number; readonly depthZ: number;
  readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly primitivesKo: string; readonly primitivesEn: string;
}

export interface SemanticZoomJumpPreset {
  readonly id: string; readonly bandId: SemanticZoomBandId; readonly zoomExp: number;
  readonly zoomLabel: string; readonly labelKo: string; readonly labelEn: string;
}

export interface PrecisionProbeSample {
  readonly probeScreenPx: number; readonly worldCoordPx: number;
  readonly naiveF32ScreenPx: number; readonly floatingOriginScreenPx: number;
  readonly naiveF32ErrorPx: number; readonly floatingOriginErrorPx: number;
}

export interface FloatingOriginPrecisionReport {
  readonly zoomFactor: number; readonly zoomExp: number; readonly worldOffsetPx: number;
  readonly chunkSizePx: number; readonly chunkIndex: number;
  readonly chunkOriginWorldPx: number; readonly cameraLocalOffsetPx: number;
  readonly f32WorldUlpPx: number; readonly f64WorldUlpPx: number;
  readonly theoreticalNaiveUlpJitterPx: number;
  readonly naiveF32JitterPx: number; readonly floatingOriginJitterPx: number;
  readonly naiveF32MeanJitterPx: number; readonly floatingOriginMeanJitterPx: number;
  readonly precisionGainMultiplier: number;
  readonly subPixelStable: boolean; readonly naiveF32Broken: boolean;
  readonly probeSamples: readonly PrecisionProbeSample[];
}

export interface NestedPortalFrame {
  readonly portalIndex: 0 | 1 | 2 | 3; readonly bandId: SemanticZoomBandId;
  readonly labelKo: string; readonly labelEn: string;
  readonly anchorZoomExp: number; readonly relativeScale: number;
  readonly normalizedFrameRatio: number; readonly opacity: number;
  readonly lodMipLevel: number; readonly depthZ: number;
  readonly parallaxOffsetX: number; readonly parallaxOffsetY: number;
  readonly cullState: PortalCullState;
}

export interface SpatialParallaxLayer {
  readonly id: string; readonly depthOrder: 0 | 1 | 2 | 3; readonly depthZ: number;
  readonly labelKo: string; readonly labelEn: string;
  readonly effectiveShiftXPx: number; readonly effectiveShiftYPx: number;
  readonly perspectiveScale: number; readonly visibleInBand: boolean;
}

export interface GpuBufferPlanInput {
  readonly strategy?: GpuBufferStrategy; readonly frameIndex?: number;
  readonly zoomFactor?: number; readonly activeLayerCount?: number;
  readonly dirtyTileCount?: number; readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number; readonly tileSizePx?: number;
  readonly bytesPerPixel?: number;
}

export interface WebGpuAlignmentAudit {
  readonly minUniformOffsetAlignmentBytes: number; readonly bytesPerRowAlignmentBytes: number;
  readonly uniformStructRawBytes: number; readonly uniformSlotAlignedBytes: number;
  readonly uniformPaddingBytes: number; readonly tileRowRawBytes: number;
  readonly tileBytesPerRowAligned: number; readonly tileRowPaddingBytes: number;
  readonly singleTileUploadBytes: number; readonly allAlignmentsValid: boolean;
}

export interface StagingRingSlotStatus {
  readonly slotIndex: 0 | 1 | 2; readonly fenceValue: number; readonly state: RingSlotFenceState;
  readonly uniformOffsetBytes: number; readonly stagingBufferBytes: number; readonly dirtyTilesQueued: number;
}

export interface StagingRingPlan {
  readonly strategy: GpuBufferStrategy; readonly ringDepth: 1 | 3; readonly frameIndex: number;
  readonly activeWriteSlot: 0 | 1 | 2; readonly gpuReadingSlot: 0 | 1 | 2; readonly fenceRetiringSlot: 0 | 1 | 2;
  readonly pipelineStallCount: number; readonly estimatedCpuWaitMs: number;
  readonly perFrameStagingBytes: number; readonly totalRingBufferBytes: number;
  readonly slots: readonly StagingRingSlotStatus[];
}

export interface SparseMegaAtlasPlan {
  readonly atlasWidthPx: number; readonly atlasHeightPx: number; readonly pageSizePx: number;
  readonly gridCols: number; readonly gridRows: number; readonly totalSlots: number;
  readonly atlasTextureBytes: number; readonly allocatedSlots: number;
  readonly hotSlots: number; readonly warmSlots: number;
  readonly lruEvictableSlots: number; readonly freeSlots: number; readonly lruRecycledSlots: number;
  readonly occupancyPct: number; readonly externalFragmentationPct: number;
  readonly internalSlackPct: number; readonly fragmentationPct: number;
  readonly indirectionTableBytes: number; readonly drawCallsPerFrame: number;
  readonly slotStates: readonly AtlasSlotOccupancyState[];
}

export interface GpuStrategyComparisonMetrics {
  readonly tripleRingFrameMs: number; readonly singleStagingFrameMs: number;
  readonly stallEliminatedMs: number; readonly drawCallReductionPct: number;
  readonly fragmentationReductionPct: number;
}

export interface GpuRingAndAtlasPlan {
  readonly executionKind: "cpu-capacity-model"; readonly gpuAllocated: false;
  readonly gpuSubmitted: false; readonly timingMeasured: false;
  readonly strategy: GpuBufferStrategy; readonly activeLayerCount: number; readonly dirtyTileCount: number;
  readonly alignment: WebGpuAlignmentAudit; readonly stagingRing: StagingRingPlan;
  readonly megaAtlas: SparseMegaAtlasPlan; readonly estimatedUploadMs: number;
  readonly estimatedGpuFrameMs: number; readonly comparison: GpuStrategyComparisonMetrics;
}

export interface WgslContractCheck {
  readonly id: string; readonly passed: boolean; readonly detailKo: string; readonly detailEn: string;
}

export interface WgslValidationReport {
  readonly validationKind: "static-source-contract"; readonly gpuCompiled: false;
  readonly valid: boolean; readonly entryPoint: string;
  readonly workgroupSize: readonly [number, number, number];
  readonly uniformStructBytes: number; readonly uniformAlignedStrideBytes: number;
  readonly indirectionStructBytes: number; readonly bindingCount: number;
  readonly reservedKeywordHits: readonly string[];
  readonly checks: readonly WgslContractCheck[]; readonly errors: readonly string[];
}

export interface InfiniteZoomSceneInput {
  readonly zoomExp?: number; readonly parallaxDepth?: number; readonly worldOffsetPx?: number;
  readonly gpuStrategy?: GpuBufferStrategy; readonly frameIndex?: number;
  readonly activeLayerCount?: number; readonly dirtyTileCount?: number;
}

export interface HonestScopeDisclosure {
  readonly measuredMathKo: string; readonly measuredMathEn: string;
  readonly runtimeBoundaryKo: string; readonly runtimeBoundaryEn: string;
}

export interface InfiniteZoomSceneSnapshot {
  readonly sourceKind: "cpu-spatial-example"; readonly artworkApplied: false; readonly persisted: false;
  readonly schemaVersion: typeof INFINITE_ZOOM_MANIFEST_SCHEMA_VERSION;
  readonly zoomExp: number; readonly zoomFactor: number;
  readonly parallaxDepth: number; readonly worldOffsetPx: number;
  readonly activeBandId: SemanticZoomBandId; readonly activeBand: SemanticZoomBandSpec;
  readonly bandProgress: number; readonly bandWeights: Readonly<Record<SemanticZoomBandId, number>>;
  readonly precision: FloatingOriginPrecisionReport;
  readonly nestedPortals: readonly NestedPortalFrame[];
  readonly parallaxLayers: readonly SpatialParallaxLayer[];
  readonly gpuPlan: GpuRingAndAtlasPlan; readonly wgslValidation: WgslValidationReport;
  readonly honestScope: HonestScopeDisclosure;
}

export interface InfiniteZoomManifestExport {
  readonly scene: InfiniteZoomSceneSnapshot; readonly json: string; readonly wgsl: string;
}

export const SEMANTIC_ZOOM_BANDS: readonly [
  SemanticZoomBandSpec, SemanticZoomBandSpec, SemanticZoomBandSpec, SemanticZoomBandSpec,
] = [
  {
    id: "storyboard-overview", stageOrder: 1, minZoom: 0.01, maxZoom: 0.25,
    minZoomExp: Math.log10(0.01), maxZoomExp: Math.log10(0.25), anchorZoom: 0.06, anchorZoomExp: Math.log10(0.06),
    lodLevel: 3, parallaxWeight: 0.2, depthZ: -1.0, labelKo: "1단계 · 스토리보드 조감도", labelEn: "Band 1 · Storyboard Overview",
    summaryKo: "전체 회차 스크롤 리듬과 컷 간 시선 동선을 한눈에 배치합니다.", summaryEn: "Lays out full-episode scroll rhythm and panel reading flow at a glance.",
    primitivesKo: "컷 경계 박스 · 스크롤 페이싱 열지도 · 시선 동선", primitivesEn: "Panel boxes · pacing heatmap · eye-flow guides",
  },
  {
    id: "manuscript-parallax", stageOrder: 2, minZoom: 0.25, maxZoom: 4,
    minZoomExp: Math.log10(0.25), maxZoomExp: Math.log10(4), anchorZoom: 1, anchorZoomExp: 0,
    lodLevel: 2, parallaxWeight: 1.0, depthZ: 0.0, labelKo: "2단계 · 본 편집 · 2.5D 시차", labelEn: "Band 2 · Manuscript & 2.5D Parallax",
    summaryKo: "원고 채색·말풍선 조판과 전경/중경/배경 2.5D 깊이 시차를 편집합니다.", summaryEn: "Edits primary coloring, speech balloons, and 2.5D multi-plane parallax depth.",
    primitivesKo: "래스터 타일 · 2.5D 시차 평면 · 말풍선/효과음", primitivesEn: "Raster tiles · 2.5D depth planes · balloons & SFX",
  },
  {
    id: "vector-ink-screentone", stageOrder: 3, minZoom: 4, maxZoom: 64,
    minZoomExp: Math.log10(4), maxZoomExp: Math.log10(64), anchorZoom: 16, anchorZoomExp: Math.log10(16),
    lodLevel: 1, parallaxWeight: 0.6, depthZ: 0.55, labelKo: "3단계 · 벡터 · G펜 · 스크린톤", labelEn: "Band 3 · Vector · G-Pen · Screentone",
    summaryKo: "해상도 독립 베지어 곡선, G펜 닙 필압 가변폭, 스크린톤 망점을 정밀 보정합니다.", summaryEn: "Refines resolution-independent Bezier curves, G-pen nib width, and halftone dots.",
    primitivesKo: "3차 베지어 제어점 · G펜 닙 슬릿 · 모아레 억제 망점", primitivesEn: "Cubic Bezier curves · G-pen nib · anti-moire dots",
  },
  {
    id: "micro-fiber-portal", stageOrder: 4, minZoom: 64, maxZoom: 100_000,
    minZoomExp: Math.log10(64), maxZoomExp: Math.log10(100_000), anchorZoom: 1_600, anchorZoomExp: Math.log10(1_600),
    lodLevel: 0, parallaxWeight: 0.25, depthZ: 1.0, labelKo: "4단계 · 종이 섬유 · 극접사 포털", labelEn: "Band 4 · Paper Fiber & Macro Portal",
    summaryKo: "종이 펄프 요철, 안료 과립 침착, 중첩 포털 내부의 초정밀 서사를 그립니다.", summaryEn: "Renders paper pulp grain, pigment granulation, and nested micro-portal narratives.",
    primitivesKo: "셀룰로오스 섬유 노멀 · 안료 과립 · 4단 중첩 포털", primitivesEn: "Cellulose fiber normals · pigment granules · 4-tier portals",
  },
];

export const SEMANTIC_ZOOM_JUMP_PRESETS: readonly SemanticZoomJumpPreset[] = [
  { id: "jump-storyboard", bandId: "storyboard-overview", zoomExp: -1.3, zoomLabel: "0.05×", labelKo: "조감도", labelEn: "Overview" },
  { id: "jump-manuscript", bandId: "manuscript-parallax", zoomExp: 0, zoomLabel: "1×", labelKo: "본 편집", labelEn: "Manuscript" },
  { id: "jump-vector-ink", bandId: "vector-ink-screentone", zoomExp: 1.2, zoomLabel: "16×", labelKo: "G펜·망점", labelEn: "G-Pen/Tone" },
  { id: "jump-paper-fiber", bandId: "micro-fiber-portal", zoomExp: 2.7, zoomLabel: "500×", labelKo: "종이 섬유", labelEn: "Paper Fiber" },
  { id: "jump-deep-portal", bandId: "micro-fiber-portal", zoomExp: 4.7, zoomLabel: "50,000×", labelKo: "극접사 포털", labelEn: "Macro Portal" },
];

const PRECISION_PROBE_OFFSETS_SCREEN_PX: readonly number[] = [0.13, 0.5, 1.19, 7.41, 31.83, 127.67, 511.29, 1023.73];

const PARALLAX_LAYER_SPECS = [
  { id: "far-backdrop", depthOrder: 0 as const, depthZ: -0.8, labelKo: "원경 · 하늘/스카이라인", labelEn: "Far · Sky & Horizon" },
  { id: "mid-architecture", depthOrder: 1 as const, depthZ: -0.25, labelKo: "중경 · 배경 건축/소품", labelEn: "Mid · Architecture & Props" },
  { id: "focal-character", depthOrder: 2 as const, depthZ: 0.0, labelKo: "초점 · 인물 선화/채색", labelEn: "Focal · Character Ink & Color" },
  { id: "near-fx-balloon", depthOrder: 3 as const, depthZ: 0.65, labelKo: "근경 · 집중선/효과/말풍선", labelEn: "Near · Speedlines & FX" },
] as const;

/** GPU 컴파일·바인딩·실행을 하지 않는 WGSL 소스 예제: 상대좌표 변환 · 시맨틱 LOD 블렌딩 · 아틀라스 인다이렉션 샘플링. */
export const INFINITE_ZOOM_GPU_ATLAS_WGSL: string = /* wgsl */ `
struct InfiniteZoomUniforms {
  camera_local_and_zoom: vec4<f32>,
  chunk_and_viewport: vec4<f32>,
  band_weights: vec4<f32>,
  atlas_metrics: vec4<u32>,
  parallax_pan: vec4<f32>,
  portal_scales: vec4<f32>,
  portal_opacities: vec4<f32>,
}

struct AtlasIndirectionEntry {
  physical_slot: u32,
  lod_tier: u32,
  layer_z_packed: u32,
  lru_epoch: u32,
}

@group(0) @binding(0) var<uniform> zoom_ubo: InfiniteZoomUniforms;
@group(0) @binding(1) var<storage, read> page_table: array<AtlasIndirectionEntry>;
@group(0) @binding(2) var mega_atlas_tex: texture_2d<f32>;
@group(0) @binding(3) var mega_atlas_sampler: sampler;
@group(0) @binding(4) var out_frame_tex: texture_storage_2d<rgba8unorm, write>;

fn floating_origin_to_local(screen_px: vec2<f32>, parallax_z: f32) -> vec2<f32> {
  let half_vp = zoom_ubo.chunk_and_viewport.xy * 0.5;
  let inv_zoom = 1.0 / max(zoom_ubo.camera_local_and_zoom.z, 0.0001);
  let parallax_shift = zoom_ubo.parallax_pan.xy * zoom_ubo.chunk_and_viewport.z * (parallax_z - zoom_ubo.parallax_pan.z);
  let cam_rel_world = (screen_px - half_vp - parallax_shift) * inv_zoom;
  return cam_rel_world + zoom_ubo.camera_local_and_zoom.xy;
}

fn lookup_atlas_uv(local_world_px: vec2<f32>, entry: AtlasIndirectionEntry) -> vec2<f32> {
  let atlas_dim = f32(zoom_ubo.atlas_metrics.x);
  let page_px = f32(zoom_ubo.atlas_metrics.y);
  let pages_per_row = max(zoom_ubo.atlas_metrics.z, 1u);
  let slot_x = f32(entry.physical_slot % pages_per_row);
  let slot_y = f32(entry.physical_slot / pages_per_row);
  let page_uv = fract(local_world_px / page_px);
  let gutter = 0.5 / page_px;
  let safe_uv = clamp(page_uv, vec2<f32>(gutter), vec2<f32>(1.0 - gutter));
  return ((vec2<f32>(slot_x, slot_y) + safe_uv) * page_px) / atlas_dim;
}

fn blend_semantic_lod(coarse_col: vec4<f32>, fine_col: vec4<f32>, weights: vec4<f32>, portal_alpha: f32) -> vec4<f32> {
  let fine_ratio = clamp(weights.z + weights.w, 0.0, 1.0);
  let lod_mix = mix(coarse_col, fine_col, fine_ratio);
  let portal_tint = clamp(portal_alpha, 0.0, 1.0);
  return vec4<f32>(lod_mix.rgb, clamp(lod_mix.a * (0.25 + 0.75 * portal_tint), 0.0, 1.0));
}

@compute @workgroup_size(16, 16, 1)
fn main_infinite_zoom_atlas(@builtin(global_invocation_id) gid: vec3<u32>) {
  let vp_w = u32(zoom_ubo.chunk_and_viewport.x);
  let vp_h = u32(zoom_ubo.chunk_and_viewport.y);
  if (gid.x >= vp_w || gid.y >= vp_h) { return; }

  let screen_pos = vec2<f32>(f32(gid.x) + 0.5, f32(gid.y) + 0.5);
  let local_pos = floating_origin_to_local(screen_pos, 0.0);
  let page_px = f32(max(zoom_ubo.atlas_metrics.y, 1u));
  let pages_per_row = max(zoom_ubo.atlas_metrics.z, 1u);
  let page_count = arrayLength(&page_table);
  if (page_count == 0u) { return; }

  let vx = u32(abs(floor(local_pos.x / page_px))) % pages_per_row;
  let vy = u32(abs(floor(local_pos.y / page_px))) % pages_per_row;
  let coarse_idx = (vy * pages_per_row + vx) % page_count;
  let fine_idx = (coarse_idx + zoom_ubo.atlas_metrics.w + 1u) % page_count;

  let coarse_entry = page_table[coarse_idx];
  let fine_entry = page_table[fine_idx];
  let coarse_uv = lookup_atlas_uv(local_pos, coarse_entry);
  let fine_uv = lookup_atlas_uv(local_pos * max(zoom_ubo.portal_scales.z, 0.25), fine_entry);

  let coarse_col = textureSampleLevel(mega_atlas_tex, mega_atlas_sampler, coarse_uv, f32(coarse_entry.lod_tier));
  let fine_col = textureSampleLevel(mega_atlas_tex, mega_atlas_sampler, fine_uv, f32(fine_entry.lod_tier));
  let active_alpha = max(
    max(zoom_ubo.portal_opacities.x, zoom_ubo.portal_opacities.y),
    max(zoom_ubo.portal_opacities.z, zoom_ubo.portal_opacities.w),
  );
  let final_rgba = blend_semantic_lod(coarse_col, fine_col, zoom_ubo.band_weights, active_alpha);
  textureStore(out_frame_tex, vec2<i32>(i32(gid.x), i32(gid.y)), final_rgba);
}
`;

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}
function roundTo(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 256바이트 WebGPU uniform offset / bytesPerRow 정렬 계산. */
export function alignToWebGpu256(bytes: number): number {
  const safe = Number.isFinite(bytes) ? Math.max(1, Math.ceil(bytes)) : WEBGPU_UNIFORM_OFFSET_ALIGNMENT;
  const aligned = Math.ceil(safe / WEBGPU_UNIFORM_OFFSET_ALIGNMENT) * WEBGPU_UNIFORM_OFFSET_ALIGNMENT;
  if (!Number.isSafeInteger(aligned)) throw new RangeError("정렬 바이트 수가 안전한 정수 범위를 벗어났습니다.");
  return aligned;
}

/** WebGPU 텍스처 업로드 시 256B `bytesPerRow` 정렬 행 바이트 크기 계산. */
export function computeAlignedTextureBytesPerRow(widthPx: number, bytesPerPixel = 4): number {
  const safeW = Number.isFinite(widthPx) ? Math.max(1, Math.round(widthPx)) : ATLAS_PAGE_SIZE_PX;
  const safeBpp = Number.isFinite(bytesPerPixel) ? Math.max(1, Math.round(bytesPerPixel)) : 4;
  const rowBytes = safeW * safeBpp;
  if (!Number.isSafeInteger(rowBytes)) throw new RangeError("텍스처 행 바이트 수가 안전한 정수 범위를 벗어났습니다.");
  return alignToWebGpu256(rowBytes);
}

/** IEEE-754 지수 비트로 계산한다. subnormal 최소 단위와 최대 유한수의 경계를 보존한다. */
export function computeFloat32Ulp(value: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, Math.abs(Number.isFinite(value) ? value : 0));
  const exponent = (view.getUint32(0) >>> 23) & 255;
  if (exponent === 255) throw new RangeError("유한 f32로 표현할 수 없는 값입니다.");
  return 2 ** Math.max(-149, exponent - 127 - 23);
}
export function computeFloat64Ulp(value: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(Number.isFinite(value) ? value : 0));
  const exponent = (view.getUint32(0) >>> 20) & 2047;
  return exponent === 0 ? Number.MIN_VALUE : 2 ** (exponent - 1023 - 52);
}

/**
 * Floating-Origin 배정밀도 무한 줌 좌표계 정밀도 평가기.
 * 일반 32-bit float(`Math.fround`) GPU 세계좌표 지터(px) vs Floating-Origin(`f64` 원점 분리 -> `f32` 상대 오프셋) 오차(px) 실측.
 */
export function evaluateFloatingOriginPrecision(
  zoomFactorInput: number,
  worldOffsetPxInput: number = DEFAULT_WORLD_OFFSET_PX,
): FloatingOriginPrecisionReport {
  const zoomFactor = clamp(Number.isFinite(zoomFactorInput) ? zoomFactorInput : 1, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR);
  const zoomExp = roundTo(Math.log10(zoomFactor), 4);
  const worldOffsetPx = Number.isFinite(worldOffsetPxInput)
    ? clamp(worldOffsetPxInput, -10_000_000, 10_000_000)
    : DEFAULT_WORLD_OFFSET_PX;

  const chunkIndex = Math.floor(worldOffsetPx / FLOATING_ORIGIN_CHUNK_SIZE_PX);
  const chunkOriginWorldPx = chunkIndex * FLOATING_ORIGIN_CHUNK_SIZE_PX;
  const cameraLocalOffsetPx = worldOffsetPx - chunkOriginWorldPx;
  const zoomF32 = Math.fround(zoomFactor);
  const naiveCameraF32 = Math.fround(worldOffsetPx);

  let maxNaiveErr = 0;
  let maxFoErr = 0;
  let sumNaiveErr = 0;
  let sumFoErr = 0;

  const probeSamples: PrecisionProbeSample[] = PRECISION_PROBE_OFFSETS_SCREEN_PX.map((probeScreenPx) => {
    const deltaWorldF64 = probeScreenPx / zoomFactor;
    const worldCoordPx = worldOffsetPx + deltaWorldF64;

    const naiveScreenPx = Math.fround((Math.fround(worldCoordPx) - naiveCameraF32) * zoomF32);
    const naiveErr = Math.abs(naiveScreenPx - probeScreenPx);

    // 이상적인 delta를 재사용하지 않고 같은 f64 세계 좌표의 표현 오차까지 포함한다.
    const relativeWorldF64 = worldCoordPx - chunkOriginWorldPx;
    const relativeDeltaF64 = relativeWorldF64 - cameraLocalOffsetPx;
    const foScreenPx = Math.fround(Math.fround(relativeDeltaF64) * zoomF32);
    const foErr = Math.abs(foScreenPx - probeScreenPx);

    if (naiveErr > maxNaiveErr) maxNaiveErr = naiveErr;
    if (foErr > maxFoErr) maxFoErr = foErr;
    sumNaiveErr += naiveErr;
    sumFoErr += foErr;

    return {
      probeScreenPx, worldCoordPx, naiveF32ScreenPx: naiveScreenPx,
      floatingOriginScreenPx: foScreenPx, naiveF32ErrorPx: naiveErr, floatingOriginErrorPx: foErr,
    };
  });

  const f32WorldUlpPx = computeFloat32Ulp(worldOffsetPx);
  const f64WorldUlpPx = computeFloat64Ulp(worldOffsetPx);
  const precisionGainMultiplier = maxNaiveErr <= maxFoErr
    ? 1
    : roundTo(maxNaiveErr / Math.max(maxFoErr, 1e-9), 2);

  return {
    zoomFactor, zoomExp, worldOffsetPx, chunkSizePx: FLOATING_ORIGIN_CHUNK_SIZE_PX,
    chunkIndex, chunkOriginWorldPx, cameraLocalOffsetPx, f32WorldUlpPx, f64WorldUlpPx,
    theoreticalNaiveUlpJitterPx: worldOffsetPx === 0 ? 0 : 0.5 * f32WorldUlpPx * zoomFactor,
    naiveF32JitterPx: maxNaiveErr, floatingOriginJitterPx: maxFoErr,
    naiveF32MeanJitterPx: sumNaiveErr / probeSamples.length, floatingOriginMeanJitterPx: sumFoErr / probeSamples.length,
    precisionGainMultiplier, subPixelStable: maxFoErr < 0.001, naiveF32Broken: maxNaiveErr >= 0.5, probeSamples,
  };
}

function resolveSemanticBand(zoomFactor: number): SemanticZoomBandSpec {
  if (zoomFactor < SEMANTIC_ZOOM_BANDS[0].maxZoom) return SEMANTIC_ZOOM_BANDS[0];
  if (zoomFactor < SEMANTIC_ZOOM_BANDS[1].maxZoom) return SEMANTIC_ZOOM_BANDS[1];
  if (zoomFactor < SEMANTIC_ZOOM_BANDS[2].maxZoom) return SEMANTIC_ZOOM_BANDS[2];
  return SEMANTIC_ZOOM_BANDS[3];
}

function computeSemanticCrossFadeWeights(zoomExp: number): Readonly<Record<SemanticZoomBandId, number>> {
  const halfFade = 0.28;
  const s12 = smoothstep(Math.log10(0.25) - halfFade, Math.log10(0.25) + halfFade, zoomExp);
  const s23 = smoothstep(Math.log10(4) - halfFade, Math.log10(4) + halfFade, zoomExp);
  const s34 = smoothstep(Math.log10(64) - halfFade, Math.log10(64) + halfFade, zoomExp);
  const w1 = 1 - s12;
  const w2 = s12 * (1 - s23);
  const w3 = s23 * (1 - s34);
  const w4 = s34;
  const total = Math.max(w1 + w2 + w3 + w4, 1e-9);
  return {
    "storyboard-overview": roundTo(w1 / total, 4), "manuscript-parallax": roundTo(w2 / total, 4),
    "vector-ink-screentone": roundTo(w3 / total, 4), "micro-fiber-portal": roundTo(w4 / total, 4),
  };
}

/** WebGPU Triple-Buffered Staging Ring & 4096x4096 Sparse Mega-Atlas GPU 버퍼 플래너. */
export function planGpuRingAndAtlasBuffers(input?: GpuBufferPlanInput): GpuRingAndAtlasPlan {
  const strategy: GpuBufferStrategy = input?.strategy === "single-staging-naive"
    ? "single-staging-naive"
    : "triple-ring-mega-atlas";
  const frameIndex = Number.isFinite(input?.frameIndex) ? Math.max(0, Math.floor(input?.frameIndex ?? 0)) : 0;
  if (frameIndex > Number.MAX_SAFE_INTEGER - 1) throw new RangeError("프레임 번호가 안전한 Fence 정수 범위를 벗어났습니다.");
  const zoomFactor = clamp(input?.zoomFactor ?? 1, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR);
  const activeLayerCount = Math.round(clamp(input?.activeLayerCount ?? 12, 1, 64));
  const dirtyTileCount = Math.round(clamp(input?.dirtyTileCount ?? 48, 1, ATLAS_TOTAL_SLOTS));
  const viewportWidthPx = Math.round(clamp(input?.viewportWidthPx ?? 1920, 320, 7680));
  const viewportHeightPx = Math.round(clamp(input?.viewportHeightPx ?? 1080, 240, 4320));
  const tileSizePx = Math.round(clamp(input?.tileSizePx ?? ATLAS_PAGE_SIZE_PX, 64, 512));
  const bytesPerPixel = input?.bytesPerPixel === 8 ? 8 : 4;

  const uniformSlotAlignedBytes = alignToWebGpu256(WGSL_UNIFORM_STRUCT_BYTES);
  const tileRowRawBytes = tileSizePx * bytesPerPixel;
  const tileBytesPerRowAligned = computeAlignedTextureBytesPerRow(tileSizePx, bytesPerPixel);
  const singleTileUploadBytes = tileBytesPerRowAligned * tileSizePx;
  const alignment: WebGpuAlignmentAudit = {
    minUniformOffsetAlignmentBytes: WEBGPU_UNIFORM_OFFSET_ALIGNMENT,
    bytesPerRowAlignmentBytes: WEBGPU_BYTES_PER_ROW_ALIGNMENT,
    uniformStructRawBytes: WGSL_UNIFORM_STRUCT_BYTES, uniformSlotAlignedBytes,
    uniformPaddingBytes: uniformSlotAlignedBytes - WGSL_UNIFORM_STRUCT_BYTES,
    tileRowRawBytes, tileBytesPerRowAligned,
    tileRowPaddingBytes: tileBytesPerRowAligned - tileRowRawBytes, singleTileUploadBytes,
    allAlignmentsValid:
      uniformSlotAlignedBytes % WEBGPU_UNIFORM_OFFSET_ALIGNMENT === 0
      && tileBytesPerRowAligned % WEBGPU_BYTES_PER_ROW_ALIGNMENT === 0,
  };

  const perFrameStagingBytes = alignToWebGpu256(uniformSlotAlignedBytes + dirtyTileCount * singleTileUploadBytes);
  const visibleViewportTiles = Math.ceil(viewportWidthPx / ATLAS_PAGE_SIZE_PX) * Math.ceil(viewportHeightPx / ATLAS_PAGE_SIZE_PX);
  const zoomDetailMultiplier = 1 + clamp((Math.log10(zoomFactor) + 2) / ZOOM_DECADES_SPAN, 0, 1) * 0.45;
  const rawSlotDemand = Math.round(visibleViewportTiles * zoomDetailMultiplier + activeLayerCount * 4.5 + dirtyTileCount * 0.85);

  const isTriple = strategy === "triple-ring-mega-atlas";
  const activeWriteSlot = (isTriple ? (frameIndex % TRIPLE_RING_FRAME_COUNT) : 0) as 0 | 1 | 2;
  const gpuReadingSlot = (isTriple ? ((activeWriteSlot + 2) % TRIPLE_RING_FRAME_COUNT) : 0) as 0 | 1 | 2;
  const fenceRetiringSlot = (isTriple ? ((activeWriteSlot + 1) % TRIPLE_RING_FRAME_COUNT) : 0) as 0 | 1 | 2;
  const singleCpuWaitMs = roundTo(2.4 + dirtyTileCount * 0.042 + activeLayerCount * 0.055, 2);

  const slots: readonly StagingRingSlotStatus[] = isTriple
    ? ([0, 1, 2] as const).map((slotIndex) => ({
        slotIndex,
        fenceValue: Math.max(0, frameIndex - (slotIndex === activeWriteSlot ? 0 : slotIndex === gpuReadingSlot ? 1 : 2)) + 1,
        state: slotIndex === activeWriteSlot ? "cpu-writing" : slotIndex === gpuReadingSlot ? "gpu-executing" : "fence-signaled-free",
        uniformOffsetBytes: slotIndex * uniformSlotAlignedBytes,
        stagingBufferBytes: perFrameStagingBytes,
        dirtyTilesQueued: slotIndex === activeWriteSlot ? dirtyTileCount : Math.max(1, Math.round(dirtyTileCount * 0.85)),
      }))
    : [{
        slotIndex: 0, fenceValue: frameIndex + 1, state: "stalled-awaiting-mapAsync",
        uniformOffsetBytes: 0, stagingBufferBytes: perFrameStagingBytes, dirtyTilesQueued: dirtyTileCount,
      }];

  const stagingRing: StagingRingPlan = {
    strategy, ringDepth: isTriple ? 3 : 1, frameIndex,
    activeWriteSlot, gpuReadingSlot, fenceRetiringSlot,
    pipelineStallCount: isTriple ? 0 : 1, estimatedCpuWaitMs: isTriple ? 0 : singleCpuWaitMs,
    perFrameStagingBytes, totalRingBufferBytes: perFrameStagingBytes * (isTriple ? TRIPLE_RING_FRAME_COUNT : 1),
    slots,
  };

  const allocatedSlots = Math.min(ATLAS_TOTAL_SLOTS, Math.max(dirtyTileCount, rawSlotDemand));
  const lruRecycledSlots = isTriple ? Math.max(0, rawSlotDemand - ATLAS_TOTAL_SLOTS + Math.floor(dirtyTileCount * 0.25)) : 0;
  const hotSlots = Math.min(allocatedSlots, Math.max(dirtyTileCount, Math.round(visibleViewportTiles * 0.9)));
  const lruEvictableSlots = isTriple ? Math.min(Math.max(0, allocatedSlots - hotSlots), Math.max(8, Math.round(allocatedSlots * 0.22))) : 0;
  const warmSlots = Math.max(0, allocatedSlots - hotSlots - lruEvictableSlots);
  const freeSlots = Math.max(0, ATLAS_TOTAL_SLOTS - allocatedSlots);

  const naiveExternalFrag = roundTo(clamp(16.5 + activeLayerCount * 1.15 + (dirtyTileCount / ATLAS_TOTAL_SLOTS) * 12, 18, 44), 2);
  const naiveInternalSlack = roundTo(clamp(5.2 + activeLayerCount * 0.25, 5.2, 14), 2);
  const tripleInternalSlack = roundTo(clamp(1.4 + (freeSlots / ATLAS_TOTAL_SLOTS) * 2.2, 1.2, 4.5), 2);
  const externalFragmentationPct = isTriple ? 0 : naiveExternalFrag;
  const internalSlackPct = isTriple ? tripleInternalSlack : naiveInternalSlack;
  const fragmentationPct = roundTo(externalFragmentationPct + internalSlackPct, 2);

  const slotStates: AtlasSlotOccupancyState[] = [];
  for (let i = 0; i < ATLAS_TOTAL_SLOTS; i += 1) {
    const rotated = (i + (frameIndex % ATLAS_TOTAL_SLOTS) * 7) % ATLAS_TOTAL_SLOTS;
    if (rotated < hotSlots) slotStates.push("active-hot");
    else if (rotated < hotSlots + warmSlots) slotStates.push("cached-warm");
    else if (rotated < hotSlots + warmSlots + lruEvictableSlots) slotStates.push("lru-evictable");
    else slotStates.push("free");
  }

  const tripleDrawCalls = 2;
  const singleDrawCalls = Math.max(4, activeLayerCount * 2);
  const megaAtlas: SparseMegaAtlasPlan = {
    atlasWidthPx: MEGA_ATLAS_DIMENSION_PX, atlasHeightPx: MEGA_ATLAS_DIMENSION_PX,
    pageSizePx: ATLAS_PAGE_SIZE_PX, gridCols: ATLAS_GRID_COLS, gridRows: ATLAS_GRID_ROWS,
    totalSlots: ATLAS_TOTAL_SLOTS, atlasTextureBytes: MEGA_ATLAS_DIMENSION_PX * MEGA_ATLAS_DIMENSION_PX * bytesPerPixel,
    allocatedSlots, hotSlots, warmSlots, lruEvictableSlots, freeSlots, lruRecycledSlots,
    occupancyPct: roundTo((allocatedSlots / ATLAS_TOTAL_SLOTS) * 100, 2),
    externalFragmentationPct, internalSlackPct, fragmentationPct,
    indirectionTableBytes: alignToWebGpu256(ATLAS_TOTAL_SLOTS * WGSL_INDIRECTION_STRUCT_BYTES),
    drawCallsPerFrame: isTriple ? tripleDrawCalls : singleDrawCalls,
    slotStates,
  };

  const tripleUploadMs = roundTo(0.28 + dirtyTileCount * 0.012, 2);
  const singleUploadMs = roundTo(tripleUploadMs + singleCpuWaitMs, 2);
  const tripleGpuFrameMs = roundTo(1.35 + dirtyTileCount * 0.016 + activeLayerCount * 0.035, 2);
  const singleGpuFrameMs = roundTo(tripleGpuFrameMs + singleCpuWaitMs + activeLayerCount * 0.14, 2);
  const naiveTotalFrag = roundTo(naiveExternalFrag + naiveInternalSlack, 2);

  return {
    executionKind: "cpu-capacity-model", gpuAllocated: false, gpuSubmitted: false, timingMeasured: false,
    strategy, activeLayerCount, dirtyTileCount, alignment, stagingRing, megaAtlas,
    estimatedUploadMs: isTriple ? tripleUploadMs : singleUploadMs,
    estimatedGpuFrameMs: isTriple ? tripleGpuFrameMs : singleGpuFrameMs,
    comparison: {
      tripleRingFrameMs: tripleGpuFrameMs,
      singleStagingFrameMs: singleGpuFrameMs,
      stallEliminatedMs: roundTo(Math.max(0, singleGpuFrameMs - tripleGpuFrameMs), 2),
      drawCallReductionPct: roundTo(((singleDrawCalls - tripleDrawCalls) / singleDrawCalls) * 100, 1),
      fragmentationReductionPct: roundTo(((naiveTotalFrag - tripleInternalSlack) / naiveTotalFrag) * 100, 1),
    },
  };
}

/** 4단계 시맨틱 줌 · 중첩 포털 레이어링 · 2.5D 시차 · Floating-Origin · WebGPU 버퍼 통합 평가. */
export function evaluateInfiniteZoomScene(input?: InfiniteZoomSceneInput): InfiniteZoomSceneSnapshot {
  const zoomExp = roundTo(clamp(input?.zoomExp ?? DEFAULT_ZOOM_EXP, MIN_ZOOM_EXP, MAX_ZOOM_EXP), 3);
  const zoomFactor = clamp(Math.pow(10, zoomExp), MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR);
  const parallaxDepth = roundTo(clamp(input?.parallaxDepth ?? DEFAULT_PARALLAX_DEPTH, 0, 1), 3);
  const worldOffsetPx = Number.isFinite(input?.worldOffsetPx)
    ? clamp(input?.worldOffsetPx ?? DEFAULT_WORLD_OFFSET_PX, -10_000_000, 10_000_000)
    : DEFAULT_WORLD_OFFSET_PX;

  const activeBand = resolveSemanticBand(zoomFactor);
  const bandProgress = roundTo(clamp((zoomExp - activeBand.minZoomExp) / Math.max(0.001, activeBand.maxZoomExp - activeBand.minZoomExp), 0, 1), 4);
  const bandWeights = computeSemanticCrossFadeWeights(zoomExp);
  const precision = evaluateFloatingOriginPrecision(zoomFactor, worldOffsetPx);

  const cameraPanX = 48;
  const cameraPanY = -22;
  const nestedPortals: readonly NestedPortalFrame[] = SEMANTIC_ZOOM_BANDS.map((band, idx) => {
    const expDelta = zoomExp - band.anchorZoomExp;
    const bandWeight = bandWeights[band.id];
    const adjacentGlow = Math.exp(-Math.pow(expDelta / 1.45, 2)) * 0.35;
    const cullState: PortalCullState = expDelta < -1.85 ? "culled-too-small" : expDelta > 2.15 ? "overscaled-parent" : "active";
    return {
      portalIndex: idx as 0 | 1 | 2 | 3, bandId: band.id, labelKo: band.labelKo, labelEn: band.labelEn,
      anchorZoomExp: roundTo(band.anchorZoomExp, 3), relativeScale: roundTo(Math.pow(10, clamp(expDelta, -4, 4)), 4),
      normalizedFrameRatio: roundTo(clamp(0.18 + ((expDelta + 2.2) / 4.4) * 0.78, 0.08, 0.98), 4),
      opacity: roundTo(clamp(Math.max(bandWeight, adjacentGlow), 0.06, 1), 4),
      lodMipLevel: roundTo(clamp(3.6 - (zoomExp + 2) * 0.55 + (3 - idx) * 0.35, 0, 5), 2),
      depthZ: band.depthZ,
      parallaxOffsetX: roundTo(cameraPanX * parallaxDepth * band.depthZ * activeBand.parallaxWeight, 2),
      parallaxOffsetY: roundTo(cameraPanY * parallaxDepth * band.depthZ * activeBand.parallaxWeight, 2),
      cullState,
    };
  });

  const parallaxLayers: readonly SpatialParallaxLayer[] = PARALLAX_LAYER_SPECS.map((layer) => ({
    id: layer.id, depthOrder: layer.depthOrder, depthZ: layer.depthZ,
    labelKo: layer.labelKo, labelEn: layer.labelEn,
    effectiveShiftXPx: roundTo(cameraPanX * parallaxDepth * layer.depthZ * activeBand.parallaxWeight, 2),
    effectiveShiftYPx: roundTo(cameraPanY * parallaxDepth * layer.depthZ * activeBand.parallaxWeight, 2),
    perspectiveScale: roundTo(1 + parallaxDepth * layer.depthZ * 0.18, 4),
    visibleInBand: activeBand.stageOrder >= 2 || layer.depthOrder === 2,
  }));

  const gpuPlan = planGpuRingAndAtlasBuffers({
    strategy: input?.gpuStrategy, frameIndex: input?.frameIndex, zoomFactor,
    activeLayerCount: input?.activeLayerCount, dirtyTileCount: input?.dirtyTileCount,
  });

  return {
    sourceKind: "cpu-spatial-example", artworkApplied: false, persisted: false,
    schemaVersion: INFINITE_ZOOM_MANIFEST_SCHEMA_VERSION,
    zoomExp, zoomFactor, parallaxDepth, worldOffsetPx,
    activeBandId: activeBand.id, activeBand, bandProgress, bandWeights,
    precision, nestedPortals, parallaxLayers, gpuPlan,
    wgslValidation: validateInfiniteZoomWgsl(INFINITE_ZOOM_GPU_ATLAS_WGSL),
    honestScope: {
      measuredMathKo: "CPU 실측 예제: 같은 f64 좌표의 Math.fround 비교·정렬 계산·WGSL 소스 정적 검사. GPU 출력 비교는 아닙니다.",
      measuredMathEn: "CPU numerical example: same-f64-coordinate Math.fround comparison, alignment arithmetic and static WGSL source checks; no GPU output comparison.",
      runtimeBoundaryKo: "추정 모델: 시간·스톨·드로우콜·단편화·Fence는 가정한 CPU 계획입니다. GPU 할당·컴파일·실행, 실제 원고 적용·영구 저장은 하지 않습니다.",
      runtimeBoundaryEn: "Estimated CPU plan: timing, stalls, draw calls, fragmentation and fences are assumptions. No GPU allocation, compilation or submission, artwork mutation or persistence.",
    },
  };
}

/** 무한 줌 · Floating-Origin · WebGPU Triple-Ring/Mega-Atlas JSON & WGSL 매니페스트 내보내기. */
export function exportInfiniteZoomManifestJson(input?: InfiniteZoomSceneInput): InfiniteZoomManifestExport {
  const scene = evaluateInfiniteZoomScene(input);
  const { precision, gpuPlan, wgslValidation } = scene;
  const { stagingRing, megaAtlas } = gpuPlan;
  const payload = {
    sourceKind: scene.sourceKind, gpuSubmitted: false, gpuCompiled: false, artworkApplied: false, persisted: false,
    schemaVersion: scene.schemaVersion, zoomExp: scene.zoomExp, zoomFactor: scene.zoomFactor,
    parallaxDepth: scene.parallaxDepth, worldOffsetPx: scene.worldOffsetPx,
    activeBandId: scene.activeBandId, bandWeights: scene.bandWeights,
    floatingOriginPrecision: {
      chunkIndex: precision.chunkIndex, chunkOriginWorldPx: precision.chunkOriginWorldPx,
      cameraLocalOffsetPx: precision.cameraLocalOffsetPx, naiveF32JitterPx: precision.naiveF32JitterPx,
      floatingOriginJitterPx: precision.floatingOriginJitterPx, precisionGainMultiplier: precision.precisionGainMultiplier,
      subPixelStable: precision.subPixelStable,
    },
    gpuBufferPlan: {
      strategy: gpuPlan.strategy, alignment: gpuPlan.alignment, comparison: gpuPlan.comparison,
      stagingRing: { ringDepth: stagingRing.ringDepth, activeWriteSlot: stagingRing.activeWriteSlot, pipelineStallCount: stagingRing.pipelineStallCount, estimatedCpuWaitMs: stagingRing.estimatedCpuWaitMs, totalRingBufferBytes: stagingRing.totalRingBufferBytes },
      megaAtlas: { dimensionsPx: [megaAtlas.atlasWidthPx, megaAtlas.atlasHeightPx], pageSizePx: megaAtlas.pageSizePx, allocatedSlots: megaAtlas.allocatedSlots, totalSlots: megaAtlas.totalSlots, occupancyPct: megaAtlas.occupancyPct, fragmentationPct: megaAtlas.fragmentationPct, lruRecycledSlots: megaAtlas.lruRecycledSlots, drawCallsPerFrame: megaAtlas.drawCallsPerFrame },
    },
    wgslContract: { validationKind: wgslValidation.validationKind, gpuCompiled: false, valid: wgslValidation.valid, entryPoint: wgslValidation.entryPoint, workgroupSize: wgslValidation.workgroupSize, uniformStructBytes: wgslValidation.uniformStructBytes, uniformAlignedStrideBytes: wgslValidation.uniformAlignedStrideBytes, indirectionStructBytes: wgslValidation.indirectionStructBytes, bindingCount: wgslValidation.bindingCount, reservedKeywordHits: wgslValidation.reservedKeywordHits },
    honestScope: scene.honestScope,
  };
  return { scene, json: JSON.stringify(payload, null, 2), wgsl: INFINITE_ZOOM_GPU_ATLAS_WGSL.trim() };
}
