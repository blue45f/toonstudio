/**
 * Wave 60D — PrismRender 계층적 Hi-Z 차폐 컬링 · 24×24 공간 해시 브러시 동역학 · 2.5D 신경망 깊이 합성 엔진.
 *
 * - 현재 구현(Current): CPU 결정론적 참조 모델(`deterministic-depth-and-culling-reference-model`)로서
 *   AtelierStage 4종 3D 웹툰 씬의 프러스텀·Hi-Z 차폐 컬링 및 LOD 0..3 드로우콜 절감 계산,
 *   실제 24×24 공간 해시 셀 버킷 기반 브러시 모 입자 반발·안료 뭉침·ToonCore 벡터 경계 충돌 O(1) 근접 탐색 쌍 실측,
 *   전경 인물·중경 소품·후경 건축·대기 원근 4층 깊이 맵(0.0~1.0) 및 Z-분리 마스크 수치 계획을 생성한다.
 * - 목표 런타임(Target): PrismRender WebGPU Hi-Z 깊이 피라미드 컴퓨트 셰이더, ToonCore 브러시 컴퓨트 커널,
 *   로컬 가속기 기반 2.5D 신경망 깊이 추론 파이프라인 연결(허위 실기 GPU/NPU 프레임 측정치 미포함).
 */

export const PRISM_SPATIAL_RENDER_SCHEMA_VERSION = "toonstudio.prism-spatial-render.v1" as const;
export const PRISM_SPATIAL_MODEL_KIND = "deterministic-depth-and-culling-reference-model" as const;
export const PRISM_ENGINE_BRAND = "PrismRender" as const;
export const ATELIER_STAGE_BRAND = "AtelierStage" as const;
export const TOON_CORE_BRAND = "ToonCore" as const;

export const PRISM_SCENE_IDS = ["seoul-urban-street", "fantasy-cathedral", "school-corridor", "atelier-studio"] as const;
export const PRISM_LOD_LEVELS = [0, 1, 2, 3] as const;
export const PRISM_DEPTH_LAYER_IDS = [
  "foreground-character", "midground-props", "background-architecture", "atmospheric-perspective",
] as const;

export const DEFAULT_SCENE_ID: PrismSceneId = "seoul-urban-street";
export const DEFAULT_HIZ_ENABLED = true as const;
export const MIN_HIZ_PYRAMID_LEVELS = 4 as const;
export const MAX_HIZ_PYRAMID_LEVELS = 8 as const;
export const DEFAULT_HIZ_PYRAMID_LEVELS = 6 as const;
export const MIN_HIZ_AGGRESSIVENESS = 0.2 as const;
export const MAX_HIZ_AGGRESSIVENESS = 1.0 as const;
export const DEFAULT_HIZ_AGGRESSIVENESS = 0.78 as const;
export const MIN_LOD_BIAS = -1.0 as const;
export const MAX_LOD_BIAS = 2.0 as const;
export const DEFAULT_LOD_BIAS = 0.0 as const;
export const MIN_CAMERA_FOV_DEG = 35 as const;
export const MAX_CAMERA_FOV_DEG = 110 as const;
export const DEFAULT_CAMERA_FOV_DEG = 62 as const;
export const MIN_SPATIAL_HASH_GRID_SIZE = 12 as const;
export const MAX_SPATIAL_HASH_GRID_SIZE = 32 as const;
export const DEFAULT_SPATIAL_HASH_GRID_SIZE = 24 as const;
export const MIN_BRISTLE_PARTICLES = 24 as const;
export const MAX_BRISTLE_PARTICLES = 192 as const;
export const DEFAULT_BRISTLE_PARTICLES = 96 as const;
export const MIN_DEPTH_SEPARATION = 0.2 as const;
export const MAX_DEPTH_SEPARATION = 1.0 as const;
export const DEFAULT_DEPTH_SEPARATION = 0.72 as const;
export const MIN_ATMOSPHERIC_HAZE = 0.0 as const;
export const MAX_ATMOSPHERIC_HAZE = 1.0 as const;
export const DEFAULT_ATMOSPHERIC_HAZE = 0.38 as const;
export const DEFAULT_FOCAL_DEPTH = 0.18 as const;
export const VIOLET_HUE_MIN_DEG = 270 as const;
export const VIOLET_HUE_MAX_DEG = 320 as const;

export type PrismSceneId = (typeof PRISM_SCENE_IDS)[number];
export type PrismLodLevel = (typeof PRISM_LOD_LEVELS)[number];
export type PrismDepthLayerId = (typeof PRISM_DEPTH_LAYER_IDS)[number];
export type PrismTopDownNodeState = "visible" | "hiz-culled" | "frustum-culled";

export interface PrismOccluderRect {
  readonly id: string; readonly xMin: number; readonly xMax: number; readonly zMin: number; readonly zMax: number;
}

export interface PrismScenePreset {
  readonly id: PrismSceneId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly totalObjects: number; readonly baselineDrawCalls: number; readonly avgTrianglesPerObject: number;
  readonly frustumVisibilityBase: number; readonly occluderWallRatio: number;
  readonly worldExtentMeters: number; readonly seed: number;
  readonly depthLayerShares: readonly [number, number, number, number];
  readonly occluderRects: readonly PrismOccluderRect[];
}

export interface PrismSpatialRenderInput {
  readonly sceneId?: PrismSceneId; readonly hiZEnabled?: boolean;
  readonly hiZPyramidLevels?: number; readonly hiZAggressiveness?: number;
  readonly lodBias?: number; readonly cameraFovDeg?: number;
  readonly gridSize?: number; readonly particleCount?: number;
  readonly depthSeparationStrength?: number; readonly atmosphericHazeAmount?: number; readonly focalDepth?: number;
}

export interface NormalizedPrismSpatialConfig {
  readonly sceneId: PrismSceneId; readonly hiZEnabled: boolean;
  readonly hiZPyramidLevels: number; readonly hiZAggressiveness: number;
  readonly lodBias: number; readonly cameraFovDeg: number;
  readonly gridSize: number; readonly particleCount: number;
  readonly depthSeparationStrength: number; readonly atmosphericHazeAmount: number; readonly focalDepth: number;
}

export interface PrismLodTierSummary {
  readonly lod: PrismLodLevel; readonly labelKo: string; readonly labelEn: string;
  readonly distanceRangeMeters: string; readonly objectCount: number; readonly drawCalls: number;
  readonly triangleMultiplier: number; readonly triangleCount: number; readonly shareOfSurvivingPct: number;
}

export interface PrismHiZMipLevel {
  readonly level: number; readonly width: number; readonly height: number;
  readonly texelCount: number; readonly occluderCoveragePct: number;
}

export interface PrismTopDownSampleNode {
  readonly id: string; readonly xNorm: number; readonly zNorm: number;
  readonly state: PrismTopDownNodeState; readonly lod: PrismLodLevel | null; readonly isOccluder: boolean;
}

export interface PrismHiZCullingResult {
  readonly sceneId: PrismSceneId; readonly hiZEnabled: boolean;
  readonly totalObjects: number; readonly frustumVisibleObjects: number; readonly frustumCulledObjects: number;
  readonly hiZOccludedObjects: number; readonly survivingObjects: number;
  readonly frustumCullRatioPct: number; readonly hiZCullRatioPct: number; readonly totalCullRatioPct: number;
  readonly baselineDrawCalls: number; readonly frustumOnlyDrawCalls: number; readonly finalDrawCalls: number;
  readonly drawCallReductionPct: number; readonly hiZAdditionalDrawCallSaved: number;
  readonly baselineTriangles: number; readonly survivingTriangles: number; readonly triangleReductionPct: number;
  readonly lodBreakdown: readonly PrismLodTierSummary[];
  readonly hiZPyramidMips: readonly PrismHiZMipLevel[];
  readonly occluderRects: readonly PrismOccluderRect[];
  readonly topDownSamples: readonly PrismTopDownSampleNode[];
}

export interface SpatialHashHotCell {
  readonly cx: number; readonly cy: number; readonly count: number;
  readonly pigmentDensity: number; readonly hasBoundaryHit: boolean;
}

export interface SpatialHashBristleParticle {
  readonly id: number; readonly x: number; readonly y: number; readonly vx: number; readonly vy: number;
  readonly clumpDensity: number; readonly boundaryHit: boolean;
}

export interface SpatialHashVectorPoint { readonly x: number; readonly y: number; }

export interface SpatialHashBristleResult {
  readonly pairsMeasured: true; readonly gridSize: number; readonly totalCellCount: number;
  readonly occupiedCellCount: number; readonly maxParticlesInCell: number; readonly cellLoadFactor: number;
  readonly particleCount: number; readonly bruteForcePairs: number; readonly spatialHashCheckedPairs: number;
  readonly pairReductionFactor: number; readonly pairReductionPct: number; readonly avgNeighborsPerParticle: number;
  readonly repulsionInteractions: number; readonly pigmentClumpPairs: number; readonly vectorBoundaryCollisions: number;
  readonly meanPigmentClumpingIndex: number; readonly meanRepulsionImpulse: number;
  readonly hotCells: readonly SpatialHashHotCell[];
  readonly sampleParticles: readonly SpatialHashBristleParticle[];
  readonly vectorBoundaryPolyline: readonly SpatialHashVectorPoint[];
}

export interface NeuralDepthLayerSpec {
  readonly id: PrismDepthLayerId; readonly order: 1 | 2 | 3 | 4;
  readonly labelKo: string; readonly labelEn: string; readonly roleKo: string; readonly roleEn: string;
  readonly depthMin: number; readonly depthMax: number; readonly normalizedDepth: number;
  readonly zMaskCoveragePct: number; readonly zSeparationConfidence: number; readonly maskEdgeIntegrityPct: number;
  readonly parallaxShiftPx: number; readonly aerialAttenuation: number; readonly defocusBlurRadiusPx: number;
}

export interface NeuralDepthProfileColumn {
  readonly index: number; readonly normalizedX: number; readonly layerId: PrismDepthLayerId; readonly depthValue: number;
}

export interface NeuralDepth25DResult {
  readonly layerCount: 4; readonly depthRange: readonly [0, 1]; readonly focalDepth: number;
  readonly depthSeparationStrength: number; readonly atmosphericHazeAmount: number;
  readonly zMaskOverlapConflictPct: number; readonly effectiveParallaxSpanPx: number;
  readonly layers: readonly NeuralDepthLayerSpec[];
  readonly depthProfileColumns: readonly NeuralDepthProfileColumn[];
}

export interface PrismHonestScopeDisclosure {
  readonly modelKind: typeof PRISM_SPATIAL_MODEL_KIND;
  readonly currentImplementationKo: string; readonly currentImplementationEn: string;
  readonly targetRuntimeKo: string; readonly targetRuntimeEn: string;
}

export interface PrismSpatialRenderReport {
  readonly schemaVersion: typeof PRISM_SPATIAL_RENDER_SCHEMA_VERSION;
  readonly modelKind: typeof PRISM_SPATIAL_MODEL_KIND;
  readonly engineBrand: typeof PRISM_ENGINE_BRAND;
  readonly stageBrand: typeof ATELIER_STAGE_BRAND;
  readonly runtimeBrand: typeof TOON_CORE_BRAND;
  readonly sourceKind: "cpu-reference-model";
  readonly gpuPipelineExecuted: false; readonly neuralInferenceExecuted: false; readonly spatialHashPairsMeasured: true;
  readonly config: NormalizedPrismSpatialConfig; readonly scene: PrismScenePreset;
  readonly culling: PrismHiZCullingResult; readonly spatialHash: SpatialHashBristleResult;
  readonly depthSynthesis: NeuralDepth25DResult; readonly honestScopeDisclosure: PrismHonestScopeDisclosure;
}

export const PRISM_SCENE_PRESETS: readonly PrismScenePreset[] = [
  {
    id: "seoul-urban-street", labelKo: "서울 도심 거리", labelEn: "Seoul Urban Street",
    summaryKo: "고층 상가·간판·차량 4,800객체가 밀집한 도심 차폐 테스트 씬",
    summaryEn: "4,800 dense urban blocks, signs, and vehicles for high occlusion",
    totalObjects: 4800, baselineDrawCalls: 5760, avgTrianglesPerObject: 820,
    frustumVisibilityBase: 0.44, occluderWallRatio: 0.72, worldExtentMeters: 180, seed: 604800,
    depthLayerShares: [24, 30, 32, 14],
    occluderRects: [
      { id: "urban-tower-l", xMin: -0.68, xMax: -0.22, zMin: 0.24, zMax: 0.36 },
      { id: "urban-arcade-r", xMin: 0.18, xMax: 0.66, zMin: 0.30, zMax: 0.42 },
      { id: "urban-overpass-c", xMin: -0.24, xMax: 0.22, zMin: 0.56, zMax: 0.66 },
    ],
  },
  {
    id: "fantasy-cathedral", labelKo: "판타지 대성당", labelEn: "Fantasy Cathedral",
    summaryKo: "석조 열주·아치·스테인드글라스 7,200객체의 대규모 아키텍처 씬",
    summaryEn: "7,200 grand nave pillars, vaults, and stained-glass fixtures",
    totalObjects: 7200, baselineDrawCalls: 8640, avgTrianglesPerObject: 1140,
    frustumVisibilityBase: 0.48, occluderWallRatio: 0.78, worldExtentMeters: 240, seed: 607200,
    depthLayerShares: [18, 26, 40, 16],
    occluderRects: [
      { id: "nave-pillar-l1", xMin: -0.58, xMax: -0.34, zMin: 0.22, zMax: 0.32 },
      { id: "nave-pillar-r1", xMin: 0.34, xMax: 0.58, zMin: 0.22, zMax: 0.32 },
      { id: "nave-choir-l2", xMin: -0.44, xMax: -0.14, zMin: 0.50, zMax: 0.60 },
      { id: "nave-choir-r2", xMin: 0.14, xMax: 0.44, zMin: 0.50, zMax: 0.60 },
    ],
  },
  {
    id: "school-corridor", labelKo: "학교 복도", labelEn: "School Corridor",
    summaryKo: "교실 벽체·사물함·창틀 2,400객체가 직선 원근을 이루는 실내 씬",
    summaryEn: "2,400 linear corridor lockers, frames, and classroom partitions",
    totalObjects: 2400, baselineDrawCalls: 2880, avgTrianglesPerObject: 640,
    frustumVisibilityBase: 0.36, occluderWallRatio: 0.68, worldExtentMeters: 95, seed: 602400,
    depthLayerShares: [28, 34, 28, 10],
    occluderRects: [
      { id: "corridor-wall-l", xMin: -0.78, xMax: -0.26, zMin: 0.20, zMax: 0.54 },
      { id: "corridor-wall-r", xMin: 0.26, xMax: 0.78, zMin: 0.26, zMax: 0.60 },
    ],
  },
  {
    id: "atelier-studio", labelKo: "가상 작업실", labelEn: "AtelierStage Studio",
    summaryKo: "화구 선반·조명 리그·이젤 1,200객체로 구성된 근거리 AtelierStage 씬",
    summaryEn: "1,200 near-field easels, prop shelves, and studio light rigs",
    totalObjects: 1200, baselineDrawCalls: 1440, avgTrianglesPerObject: 540,
    frustumVisibilityBase: 0.58, occluderWallRatio: 0.46, worldExtentMeters: 36, seed: 601200,
    depthLayerShares: [34, 36, 22, 8],
    occluderRects: [
      { id: "studio-shelf-l", xMin: -0.54, xMax: -0.18, zMin: 0.34, zMax: 0.46 },
      { id: "studio-desk-r", xMin: 0.16, xMax: 0.52, zMin: 0.44, zMax: 0.54 },
    ],
  },
] as const;

export const PRISM_HONEST_SCOPE_DISCLOSURE: PrismHonestScopeDisclosure = {
  modelKind: PRISM_SPATIAL_MODEL_KIND,
  currentImplementationKo:
    "현재 구현(Current): CPU 결정론적 참조 모델로 프러스텀·Hi-Z 차폐·LOD 드로우콜 절감과 4층 2.5D 깊이 맵을 계산하며, 24×24 공간 해시 브러시 근접 탐색 쌍은 CPU 버킷에서 직접 실측합니다.",
  currentImplementationEn:
    "Current: Deterministic CPU reference model computes frustum/Hi-Z culling, LOD draw-call savings, and 4-layer 2.5D depth maps, while measuring real 24×24 spatial-hash bristle neighbor pairs directly in CPU buckets.",
  targetRuntimeKo:
    "목표 런타임(Target): PrismRender WebGPU Hi-Z 피라미드 컴퓨트 패스, ToonCore 브러시 입자 GPU 커널, 로컬 NPU 2.5D 신경망 깊이 추론 연결 예정(실기 GPU/NPU 벤치마크 미포함).",
  targetRuntimeEn:
    "Target: PrismRender WebGPU Hi-Z compute pyramid, ToonCore GPU bristle kernel, and local NPU 2.5D neural depth inference (no fabricated live GPU/NPU timings).",
};

const LOD_SPEC_META = [
  { lod: 0 as PrismLodLevel, labelKo: "LOD 0 · 근경 정밀", labelEn: "LOD 0 · Hero Near", triangleMultiplier: 1.0, drawCallWeight: 1.0, baseShare: 0.16, rangeRatio: [0, 0.14] as const },
  { lod: 1 as PrismLodLevel, labelKo: "LOD 1 · 중근경 표준", labelEn: "LOD 1 · Mid Detail", triangleMultiplier: 0.48, drawCallWeight: 0.62, baseShare: 0.30, rangeRatio: [0.14, 0.36] as const },
  { lod: 2 as PrismLodLevel, labelKo: "LOD 2 · 원경 경량", labelEn: "LOD 2 · Far Light", triangleMultiplier: 0.18, drawCallWeight: 0.32, baseShare: 0.32, rangeRatio: [0.36, 0.68] as const },
  { lod: 3 as PrismLodLevel, labelKo: "LOD 3 · 초원경 임포스터", labelEn: "LOD 3 · Impostor", triangleMultiplier: 0.06, drawCallWeight: 0.12, baseShare: 0.22, rangeRatio: [0.68, 1.0] as const },
] as const;

const DEPTH_LAYER_META = [
  { id: "foreground-character" as PrismDepthLayerId, order: 1 as const, labelKo: "전경 인물", labelEn: "Foreground Character", roleKo: "주연 선화·표정·대사 말풍선 기준 Z-분리 마스크", roleEn: "Hero lineart, expression, and speech-balloon Z-mask", depthMin: 0.0, depthMax: 0.24, baseParallax: 26 },
  { id: "midground-props" as PrismDepthLayerId, order: 2 as const, labelKo: "중경 소품", labelEn: "Midground Props", roleKo: "가구·차량·실내 집기 접촉 그림자 및 상호작용 층", roleEn: "Props, furniture, vehicles, and contact-shadow layer", depthMin: 0.25, depthMax: 0.56, baseParallax: 15 },
  { id: "background-architecture" as PrismDepthLayerId, order: 3 as const, labelKo: "후경 건축", labelEn: "Background Architecture", roleKo: "AtelierStage 3D 건물·복도·열주 구조물 차폐 층", roleEn: "AtelierStage 3D architectural facades and colonnade layer", depthMin: 0.57, depthMax: 0.84, baseParallax: 6.5 },
  { id: "atmospheric-perspective" as PrismDepthLayerId, order: 4 as const, labelKo: "대기 원근", labelEn: "Atmospheric Perspective", roleKo: "원경 스카이라인·안개 산란·채도 감쇠 배경 층", roleEn: "Distant skyline, aerial scattering, and haze attenuation", depthMin: 0.85, depthMax: 1.0, baseParallax: 1.5 },
] as const;

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(value, min, max, fallback));
}
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** ES2017 호환 32비트 결정론적 의사난수 생성기(BigInt 미사용). */
function createDeterministicRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** 등록된 4종 AtelierStage 3D 웹툰 씬 프리셋을 안전하게 조회한다. */
export function getPrismScenePreset(sceneId?: PrismSceneId): PrismScenePreset {
  return PRISM_SCENE_PRESETS.find((preset) => preset.id === sceneId) ?? PRISM_SCENE_PRESETS[0];
}

/** 모든 입력 파라미터를 유한 범위로 정규화한다. */
export function normalizePrismSpatialConfig(input?: PrismSpatialRenderInput): NormalizedPrismSpatialConfig {
  const scene = getPrismScenePreset(input?.sceneId);
  return {
    sceneId: scene.id,
    hiZEnabled: typeof input?.hiZEnabled === "boolean" ? input.hiZEnabled : DEFAULT_HIZ_ENABLED,
    hiZPyramidLevels: clampInteger(input?.hiZPyramidLevels, MIN_HIZ_PYRAMID_LEVELS, MAX_HIZ_PYRAMID_LEVELS, DEFAULT_HIZ_PYRAMID_LEVELS),
    hiZAggressiveness: round2(clampNumber(input?.hiZAggressiveness, MIN_HIZ_AGGRESSIVENESS, MAX_HIZ_AGGRESSIVENESS, DEFAULT_HIZ_AGGRESSIVENESS)),
    lodBias: round2(clampNumber(input?.lodBias, MIN_LOD_BIAS, MAX_LOD_BIAS, DEFAULT_LOD_BIAS)),
    cameraFovDeg: clampInteger(input?.cameraFovDeg, MIN_CAMERA_FOV_DEG, MAX_CAMERA_FOV_DEG, DEFAULT_CAMERA_FOV_DEG),
    gridSize: clampInteger(input?.gridSize, MIN_SPATIAL_HASH_GRID_SIZE, MAX_SPATIAL_HASH_GRID_SIZE, DEFAULT_SPATIAL_HASH_GRID_SIZE),
    particleCount: clampInteger(input?.particleCount, MIN_BRISTLE_PARTICLES, MAX_BRISTLE_PARTICLES, DEFAULT_BRISTLE_PARTICLES),
    depthSeparationStrength: round2(clampNumber(input?.depthSeparationStrength, MIN_DEPTH_SEPARATION, MAX_DEPTH_SEPARATION, DEFAULT_DEPTH_SEPARATION)),
    atmosphericHazeAmount: round2(clampNumber(input?.atmosphericHazeAmount, MIN_ATMOSPHERIC_HAZE, MAX_ATMOSPHERIC_HAZE, DEFAULT_ATMOSPHERIC_HAZE)),
    focalDepth: round2(clampNumber(input?.focalDepth, 0.0, 1.0, DEFAULT_FOCAL_DEPTH)),
  };
}

function isPointOccludedByRects(x: number, z: number, rects: readonly PrismOccluderRect[], aggressiveness: number): boolean {
  if (z <= 0.12) return false;
  const padding = (aggressiveness - 0.5) * 0.06;
  for (const rect of rects) {
    if (z <= rect.zMax + 0.02) continue;
    const t = ((rect.zMin + rect.zMax) * 0.5) / z;
    if (t <= 0 || t >= 1) continue;
    const hitX = x * t;
    if (hitX >= rect.xMin - padding && hitX <= rect.xMax + padding) return true;
  }
  return false;
}

function resolveLodFromNormalizedDepth(zNorm: number, lodBias: number): PrismLodLevel {
  const shifted = zNorm + lodBias * 0.16;
  if (shifted < 0.24) return 0;
  if (shifted < 0.48) return 1;
  if (shifted < 0.74) return 2;
  return 3;
}

/** 4종 3D 웹툰 씬의 프러스텀 + Hi-Z 공격적 차폐 컬링 + LOD 0..3 드로우콜 절감률을 계산한다. */
export function computePrismHiZCulling(config: NormalizedPrismSpatialConfig): PrismHiZCullingResult {
  const scene = getPrismScenePreset(config.sceneId);
  const fovScale = clampNumber(config.cameraFovDeg / DEFAULT_CAMERA_FOV_DEG, 0.6, 1.65, 1.0);
  const frustumRatio = clampNumber(scene.frustumVisibilityBase * fovScale, 0.18, 0.88, 0.45);
  const frustumVisibleObjects = Math.max(1, Math.round(scene.totalObjects * frustumRatio));
  const frustumCulledObjects = scene.totalObjects - frustumVisibleObjects;

  const mipFactor = 0.88 + (config.hiZPyramidLevels - MIN_HIZ_PYRAMID_LEVELS) * 0.03;
  const rawHiZFraction = config.hiZEnabled
    ? clampNumber(scene.occluderWallRatio * (0.45 + config.hiZAggressiveness * 0.55) * mipFactor, 0.08, 0.84, 0.5)
    : 0;
  const hiZOccludedObjects = config.hiZEnabled
    ? Math.min(frustumVisibleObjects - 1, Math.round(frustumVisibleObjects * rawHiZFraction))
    : 0;
  const survivingObjects = frustumVisibleObjects - hiZOccludedObjects;

  const shift = config.lodBias;
  const rawWeights = [
    Math.max(0.04, LOD_SPEC_META[0].baseShare * Math.exp(-shift * 0.55)),
    Math.max(0.08, LOD_SPEC_META[1].baseShare * Math.exp(-shift * 0.15)),
    Math.max(0.10, LOD_SPEC_META[2].baseShare * Math.exp(shift * 0.25)),
    Math.max(0.08, LOD_SPEC_META[3].baseShare * Math.exp(shift * 0.65)),
  ];
  const weightSum = rawWeights.reduce((acc, w) => acc + w, 0);

  let assigned = 0;
  const lodCounts: number[] = rawWeights.map((w, idx) => {
    if (idx === rawWeights.length - 1) return Math.max(0, survivingObjects - assigned);
    const count = Math.round((w / weightSum) * survivingObjects);
    assigned += count;
    return count;
  });

  const drawCallPerObject = scene.baselineDrawCalls / scene.totalObjects;
  const lodBreakdown: PrismLodTierSummary[] = LOD_SPEC_META.map((meta, idx) => {
    const objectCount = lodCounts[idx] ?? 0;
    const drawCalls = Math.max(objectCount > 0 ? 1 : 0, Math.round(objectCount * drawCallPerObject * meta.drawCallWeight));
    const triangleCount = Math.round(objectCount * scene.avgTrianglesPerObject * meta.triangleMultiplier);
    return {
      lod: meta.lod, labelKo: meta.labelKo, labelEn: meta.labelEn,
      distanceRangeMeters: `${Math.round(scene.worldExtentMeters * meta.rangeRatio[0])}~${Math.round(scene.worldExtentMeters * meta.rangeRatio[1])}m`,
      objectCount, drawCalls, triangleMultiplier: meta.triangleMultiplier, triangleCount,
      shareOfSurvivingPct: survivingObjects > 0 ? round1((objectCount / survivingObjects) * 100) : 0,
    };
  });

  const finalDrawCalls = lodBreakdown.reduce((sum, item) => sum + item.drawCalls, 0);
  const avgLodDrawWeight = rawWeights.reduce((acc, w, idx) => acc + (w / weightSum) * (LOD_SPEC_META[idx]?.drawCallWeight ?? 0.5), 0);
  const frustumOnlyDrawCalls = Math.max(finalDrawCalls, Math.round(frustumVisibleObjects * drawCallPerObject * avgLodDrawWeight));
  const hiZAdditionalDrawCallSaved = Math.max(0, frustumOnlyDrawCalls - finalDrawCalls);
  const drawCallReductionPct = round1(((scene.baselineDrawCalls - finalDrawCalls) / scene.baselineDrawCalls) * 100);
  const baselineTriangles = scene.totalObjects * scene.avgTrianglesPerObject;
  const survivingTriangles = lodBreakdown.reduce((sum, item) => sum + item.triangleCount, 0);
  const triangleReductionPct = round1(((baselineTriangles - survivingTriangles) / baselineTriangles) * 100);

  const hiZPyramidMips: PrismHiZMipLevel[] = Array.from({ length: config.hiZPyramidLevels }, (_, level) => {
    const width = Math.max(4, Math.floor(512 / Math.pow(2, level)));
    const height = Math.max(2, Math.floor(256 / Math.pow(2, level)));
    return {
      level, width, height, texelCount: width * height,
      occluderCoveragePct: config.hiZEnabled
        ? round1(clampNumber(scene.occluderWallRatio * 100 * (0.64 + level * 0.055) * config.hiZAggressiveness, 12, 98, 50))
        : 0,
    };
  });

  const rng = createDeterministicRng(scene.seed + config.cameraFovDeg * 31);
  const halfFovRad = ((config.cameraFovDeg * 0.5) * Math.PI) / 180;
  const topDownSamples: PrismTopDownSampleNode[] = Array.from({ length: 36 }, (_, idx) => {
    const xNorm = round3(rng() * 1.84 - 0.92);
    const zNorm = round3(0.10 + rng() * 0.86);
    const inFrustum = Math.abs(Math.atan2(xNorm, zNorm)) <= halfFovRad;
    const isOccluder = scene.occluderRects.some((r) => xNorm >= r.xMin && xNorm <= r.xMax && zNorm >= r.zMin && zNorm <= r.zMax);
    let state: PrismTopDownNodeState = "frustum-culled";
    if (inFrustum) {
      const occluded = config.hiZEnabled && !isOccluder && isPointOccludedByRects(xNorm, zNorm, scene.occluderRects, config.hiZAggressiveness);
      state = occluded ? "hiz-culled" : "visible";
    }
    return {
      id: `${scene.id}-node-${idx + 1}`, xNorm, zNorm, state,
      lod: state === "visible" ? resolveLodFromNormalizedDepth(zNorm, config.lodBias) : null, isOccluder,
    };
  });

  return {
    sceneId: scene.id, hiZEnabled: config.hiZEnabled, totalObjects: scene.totalObjects,
    frustumVisibleObjects, frustumCulledObjects, hiZOccludedObjects, survivingObjects,
    frustumCullRatioPct: round1((frustumCulledObjects / scene.totalObjects) * 100),
    hiZCullRatioPct: round1((hiZOccludedObjects / scene.totalObjects) * 100),
    totalCullRatioPct: round1(((scene.totalObjects - survivingObjects) / scene.totalObjects) * 100),
    baselineDrawCalls: scene.baselineDrawCalls, frustumOnlyDrawCalls, finalDrawCalls,
    drawCallReductionPct, hiZAdditionalDrawCallSaved, baselineTriangles, survivingTriangles, triangleReductionPct,
    lodBreakdown, hiZPyramidMips, occluderRects: scene.occluderRects, topDownSamples,
  };
}

function pointToSegmentDistance(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): { readonly dist: number; readonly nx: number; readonly ny: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 1e-8 ? clampNumber(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1, 0) : 0;
  const rx = px - (ax + t * dx);
  const ry = py - (ay + t * dy);
  const dist = Math.hypot(rx, ry);
  return dist < 1e-6 ? { dist: 0, nx: 0, ny: -1 } : { dist, nx: rx / dist, ny: ry / dist };
}

/** 24×24(기본) 공간 해시 셀 버킷 기반 브러시 모 입자 반발·안료 뭉침·벡터 경계 충돌 O(1) 근접 탐색을 실측한다. */
export function simulateSpatialHashBristleDynamics(config: NormalizedPrismSpatialConfig): SpatialHashBristleResult {
  const scene = getPrismScenePreset(config.sceneId);
  const gridSize = config.gridSize;
  const totalCellCount = gridSize * gridSize;
  const count = config.particleCount;
  const rng = createDeterministicRng(scene.seed + gridSize * 101 + count * 17);

  const vectorBoundaryPolyline: readonly SpatialHashVectorPoint[] = [
    { x: 0.08, y: 0.72 }, { x: 0.30, y: 0.56 }, { x: 0.54, y: 0.62 }, { x: 0.78, y: 0.42 }, { x: 0.94, y: 0.34 },
  ];

  const px = new Float64Array(count);
  const py = new Float64Array(count);
  const vx = new Float64Array(count);
  const vy = new Float64Array(count);
  const clumpAccum = new Float64Array(count);
  const boundaryFlags = new Uint8Array(count);
  const cellX = new Int32Array(count);
  const cellY = new Int32Array(count);
  const buckets: number[][] = Array.from({ length: totalCellCount }, () => []);

  for (let i = 0; i < count; i += 1) {
    const theta = rng() * Math.PI * 2;
    const radial = Math.sqrt(rng());
    const x = clampNumber(0.5 + Math.cos(theta) * 0.41 * radial, 0.02, 0.98, 0.5);
    const y = clampNumber(0.5 + Math.sin(theta) * 0.39 * radial, 0.02, 0.98, 0.5);
    px[i] = x; py[i] = y;
    const cx = Math.min(gridSize - 1, Math.max(0, Math.floor(x * gridSize)));
    const cy = Math.min(gridSize - 1, Math.max(0, Math.floor(y * gridSize)));
    cellX[i] = cx; cellY[i] = cy;
    buckets[cy * gridSize + cx]?.push(i);
  }

  const cellSpan = 1 / gridSize;
  const repulsionRadius = cellSpan * 1.12;
  const clumpingRadius = cellSpan * 1.95;
  const boundaryRadius = cellSpan * 0.95;

  let spatialHashCheckedPairs = 0;
  let repulsionInteractions = 0;
  let pigmentClumpPairs = 0;
  let totalRepulsionImpulse = 0;

  for (let i = 0; i < count; i += 1) {
    const cx = cellX[i] ?? 0; const cy = cellY[i] ?? 0;
    const xi = px[i] ?? 0; const yi = py[i] ?? 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      const ny = cy + dy;
      if (ny < 0 || ny >= gridSize) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = cx + dx;
        if (nx < 0 || nx >= gridSize) continue;
        const bucket = buckets[ny * gridSize + nx];
        if (!bucket || bucket.length === 0) continue;
        for (let b = 0; b < bucket.length; b += 1) {
          const j = bucket[b] ?? -1;
          if (j <= i) continue;
          spatialHashCheckedPairs += 1;
          const rx = (px[j] ?? 0) - xi;
          const ry = (py[j] ?? 0) - yi;
          const dist = Math.hypot(rx, ry);
          if (dist < repulsionRadius) {
            repulsionInteractions += 1;
            const safeDist = Math.max(dist, 0.0005);
            const strength = (repulsionRadius - dist) / repulsionRadius;
            const fx = (rx / safeDist) * strength * 0.014;
            const fy = (ry / safeDist) * strength * 0.014;
            vx[i] = (vx[i] ?? 0) - fx; vy[i] = (vy[i] ?? 0) - fy;
            vx[j] = (vx[j] ?? 0) + fx; vy[j] = (vy[j] ?? 0) + fy;
            totalRepulsionImpulse += strength;
          } else if (dist < clumpingRadius) {
            pigmentClumpPairs += 1;
            const cohesion = 1 - (dist - repulsionRadius) / Math.max(0.0001, clumpingRadius - repulsionRadius);
            clumpAccum[i] = (clumpAccum[i] ?? 0) + cohesion * 0.34;
            clumpAccum[j] = (clumpAccum[j] ?? 0) + cohesion * 0.34;
          }
        }
      }
    }
  }

  let vectorBoundaryCollisions = 0;
  for (let i = 0; i < count; i += 1) {
    const xi = px[i] ?? 0; const yi = py[i] ?? 0;
    for (let s = 0; s < vectorBoundaryPolyline.length - 1; s += 1) {
      const a = vectorBoundaryPolyline[s]; const b = vectorBoundaryPolyline[s + 1];
      if (!a || !b) continue;
      const hit = pointToSegmentDistance(xi, yi, a.x, a.y, b.x, b.y);
      if (hit.dist < boundaryRadius) {
        boundaryFlags[i] = 1;
        vectorBoundaryCollisions += 1;
        const push = (boundaryRadius - hit.dist) * 0.45;
        vx[i] = (vx[i] ?? 0) + hit.nx * push;
        vy[i] = (vy[i] ?? 0) + hit.ny * push;
        break;
      }
    }
  }

  let occupiedCellCount = 0;
  let maxParticlesInCell = 0;
  const hotCells: SpatialHashHotCell[] = [];
  for (let idx = 0; idx < totalCellCount; idx += 1) {
    const bucket = buckets[idx];
    if (!bucket || bucket.length === 0) continue;
    occupiedCellCount += 1;
    if (bucket.length > maxParticlesInCell) maxParticlesInCell = bucket.length;
    let densitySum = 0; let hasBoundaryHit = false;
    for (const pid of bucket) {
      densitySum += Math.min(1, clumpAccum[pid] ?? 0);
      if (boundaryFlags[pid] === 1) hasBoundaryHit = true;
    }
    hotCells.push({
      cx: idx % gridSize, cy: Math.floor(idx / gridSize), count: bucket.length,
      pigmentDensity: round2(clampNumber(densitySum / bucket.length, 0.12, 1.0, 0.25)), hasBoundaryHit,
    });
  }

  let totalClump = 0;
  const sampleLimit = Math.min(count, 96);
  const sampleParticles: SpatialHashBristleParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    const clump = clampNumber(clumpAccum[i] ?? 0, 0, 1, 0);
    totalClump += clump;
    if (i < sampleLimit) {
      sampleParticles.push({
        id: i + 1, x: round3(px[i] ?? 0), y: round3(py[i] ?? 0),
        vx: round3(vx[i] ?? 0), vy: round3(vy[i] ?? 0),
        clumpDensity: round2(clump), boundaryHit: boundaryFlags[i] === 1,
      });
    }
  }

  const bruteForcePairs = (count * (count - 1)) / 2;
  const pairReductionFactor = round2(bruteForcePairs / Math.max(1, spatialHashCheckedPairs));
  const pairReductionPct = bruteForcePairs > 0 ? round1(((bruteForcePairs - spatialHashCheckedPairs) / bruteForcePairs) * 100) : 0;

  return {
    pairsMeasured: true, gridSize, totalCellCount, occupiedCellCount, maxParticlesInCell,
    cellLoadFactor: round3(occupiedCellCount > 0 ? count / occupiedCellCount : 0),
    particleCount: count, bruteForcePairs, spatialHashCheckedPairs, pairReductionFactor, pairReductionPct,
    avgNeighborsPerParticle: round2((spatialHashCheckedPairs * 2) / Math.max(1, count)),
    repulsionInteractions, pigmentClumpPairs, vectorBoundaryCollisions,
    meanPigmentClumpingIndex: round3(totalClump / Math.max(1, count)),
    meanRepulsionImpulse: round3(totalRepulsionImpulse / Math.max(1, repulsionInteractions)),
    hotCells, sampleParticles, vectorBoundaryPolyline,
  };
}

/** 2D→2.5D 신경망 깊이 합성(전경 인물·중경 소품·후경 건축·대기 원근 4층 깊이 맵 0.0~1.0 및 Z-분리 마스크)을 계산한다. */
export function synthesizeNeuralDepth25D(config: NormalizedPrismSpatialConfig): NeuralDepth25DResult {
  const scene = getPrismScenePreset(config.sceneId);
  const sep = config.depthSeparationStrength;
  const haze = config.atmosphericHazeAmount;
  const focal = config.focalDepth;

  const layers: NeuralDepthLayerSpec[] = DEPTH_LAYER_META.map((meta, idx) => {
    const normalizedDepth = round3(clampNumber((meta.depthMin + meta.depthMax) * 0.5, 0.0, 1.0, 0.5));
    return {
      id: meta.id, order: meta.order, labelKo: meta.labelKo, labelEn: meta.labelEn, roleKo: meta.roleKo, roleEn: meta.roleEn,
      depthMin: meta.depthMin, depthMax: meta.depthMax, normalizedDepth,
      zMaskCoveragePct: scene.depthLayerShares[idx] ?? 25,
      zSeparationConfidence: round3(clampNumber(0.62 + sep * 0.34 - idx * 0.025, 0.45, 0.99, 0.8)),
      maskEdgeIntegrityPct: round1(clampNumber(72 + sep * 26.5 - idx * 1.8, 60, 99.4, 88)),
      parallaxShiftPx: round1(meta.baseParallax * (0.45 + sep * 0.75)),
      aerialAttenuation: round3(clampNumber(Math.pow(normalizedDepth, 1.35) * haze, 0.0, 1.0, 0.0)),
      defocusBlurRadiusPx: round2(Math.abs(normalizedDepth - focal) * (3.2 + sep * 2.4)),
    };
  });

  const zMaskOverlapConflictPct = round2(clampNumber((1 - sep) * 9.5 + 0.65, 0.4, 12.0, 3.2));
  const effectiveParallaxSpanPx = round1((layers[0]?.parallaxShiftPx ?? 0) - (layers[3]?.parallaxShiftPx ?? 0));

  const depthProfileColumns: NeuralDepthProfileColumn[] = Array.from({ length: 12 }, (_, index) => {
    const layerIdx = index >= 4 && index <= 6 ? 0 : index === 3 || index === 7 || index === 8 ? 1 : index <= 2 || index === 9 ? 2 : 3;
    const layer = layers[layerIdx] ?? layers[0];
    const waveOffset = Math.sin(index * 1.15 + scene.seed * 0.001) * 0.04;
    const depthValue = round3(clampNumber((layer?.normalizedDepth ?? 0.5) + waveOffset, layer?.depthMin ?? 0.0, layer?.depthMax ?? 1.0, layer?.normalizedDepth ?? 0.5));
    return { index, normalizedX: round3((index + 0.5) / 12), layerId: layer?.id ?? "foreground-character", depthValue };
  });

  return {
    layerCount: 4, depthRange: [0, 1], focalDepth: focal, depthSeparationStrength: sep, atmosphericHazeAmount: haze,
    zMaskOverlapConflictPct, effectiveParallaxSpanPx, layers, depthProfileColumns,
  };
}

/** PrismRender 계층적 Hi-Z 컬링 · 공간 해시 브러시 · 2.5D 깊이 합성 통합 리포트를 생성한다. */
export function buildPrismSpatialRenderReport(input?: PrismSpatialRenderInput): PrismSpatialRenderReport {
  const config = normalizePrismSpatialConfig(input);
  const scene = getPrismScenePreset(config.sceneId);
  return {
    schemaVersion: PRISM_SPATIAL_RENDER_SCHEMA_VERSION, modelKind: PRISM_SPATIAL_MODEL_KIND,
    engineBrand: PRISM_ENGINE_BRAND, stageBrand: ATELIER_STAGE_BRAND, runtimeBrand: TOON_CORE_BRAND,
    sourceKind: "cpu-reference-model", gpuPipelineExecuted: false, neuralInferenceExecuted: false, spatialHashPairsMeasured: true,
    config, scene, culling: computePrismHiZCulling(config),
    spatialHash: simulateSpatialHashBristleDynamics(config), depthSynthesis: synthesizeNeuralDepth25D(config),
    honestScopeDisclosure: PRISM_HONEST_SCOPE_DISCLOSURE,
  };
}

/** PrismRender 통합 리포트를 결정론적 JSON 매니페스트 문자열로 직렬화한다. */
export function exportPrismSpatialRenderJson(report: PrismSpatialRenderReport): string {
  const { culling, spatialHash, depthSynthesis, scene } = report;
  return JSON.stringify(
    {
      schemaVersion: report.schemaVersion, modelKind: report.modelKind,
      brands: { renderEngine: report.engineBrand, stage: report.stageBrand, runtime: report.runtimeBrand },
      sourceKind: report.sourceKind,
      executionFlags: { gpuPipelineExecuted: report.gpuPipelineExecuted, neuralInferenceExecuted: report.neuralInferenceExecuted, spatialHashPairsMeasured: report.spatialHashPairsMeasured },
      config: report.config,
      scene: { id: scene.id, labelKo: scene.labelKo, labelEn: scene.labelEn, totalObjects: scene.totalObjects, worldExtentMeters: scene.worldExtentMeters },
      cullingSummary: {
        hiZEnabled: culling.hiZEnabled, frustumVisibleObjects: culling.frustumVisibleObjects, frustumCulledObjects: culling.frustumCulledObjects,
        hiZOccludedObjects: culling.hiZOccludedObjects, survivingObjects: culling.survivingObjects,
        baselineDrawCalls: culling.baselineDrawCalls, finalDrawCalls: culling.finalDrawCalls,
        drawCallReductionPct: culling.drawCallReductionPct, hiZAdditionalDrawCallSaved: culling.hiZAdditionalDrawCallSaved,
        triangleReductionPct: culling.triangleReductionPct, lodBreakdown: culling.lodBreakdown, hiZPyramidMips: culling.hiZPyramidMips,
      },
      spatialHashSummary: {
        gridSize: spatialHash.gridSize, totalCellCount: spatialHash.totalCellCount, occupiedCellCount: spatialHash.occupiedCellCount,
        particleCount: spatialHash.particleCount, bruteForcePairs: spatialHash.bruteForcePairs, spatialHashCheckedPairs: spatialHash.spatialHashCheckedPairs,
        pairReductionFactor: spatialHash.pairReductionFactor, pairReductionPct: spatialHash.pairReductionPct,
        repulsionInteractions: spatialHash.repulsionInteractions, pigmentClumpPairs: spatialHash.pigmentClumpPairs,
        vectorBoundaryCollisions: spatialHash.vectorBoundaryCollisions, meanPigmentClumpingIndex: spatialHash.meanPigmentClumpingIndex,
      },
      depthSynthesisSummary: {
        layerCount: depthSynthesis.layerCount, depthRange: depthSynthesis.depthRange, focalDepth: depthSynthesis.focalDepth,
        depthSeparationStrength: depthSynthesis.depthSeparationStrength, atmosphericHazeAmount: depthSynthesis.atmosphericHazeAmount,
        zMaskOverlapConflictPct: depthSynthesis.zMaskOverlapConflictPct, effectiveParallaxSpanPx: depthSynthesis.effectiveParallaxSpanPx,
        layers: depthSynthesis.layers,
      },
      honestScopeDisclosure: report.honestScopeDisclosure,
    },
    null,
    2,
  );
}
