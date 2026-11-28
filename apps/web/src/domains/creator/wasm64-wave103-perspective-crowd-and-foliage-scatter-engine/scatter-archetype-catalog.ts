/**
 * Wave 103 — 웹툰 군중·식생 배치 타입 계약, 7종 아키타입 카탈로그 및 결정론적 시드 PRNG.
 *
 * - 인물 4종(1.58m~1.84m), 식생 2종(4.5m~8.0m), 가로등 1종(4.2m~5.6m) 물리 제원 정의
 * - 32비트 결정론적 의사난수 생성기(`mulberry32`) 및 변형 시그니처 생성기 제공
 */

import type {
  AtmosphericDepthStyle,
  DetailTier,
  PerspectiveGroundStage,
  ScreenBoundingBox,
} from "./horizon-perspective-projection-and-density";

export type ScatterArchetypeId =
  | "bystander-walker"
  | "bystander-commuter"
  | "student-uniform"
  | "fantasy-soldier"
  | "street-tree"
  | "cherry-blossom-canopy"
  | "street-lamp";

export type ScatterAssetCategory = "human" | "foliage" | "prop";
export type KeepOutRole = "hero-silhouette" | "speech-balloon" | "focal-corridor";
export type DepthDistributionMode = "screen-balanced" | "log-depth" | "horizon-dense";
export type EyeHeightLockMode = "natural-height-band" | "exact-camera-eye-level";

export interface ScatterAssetTemplate {
  readonly id: ScatterArchetypeId;
  readonly labelKo: string;
  readonly category: ScatterAssetCategory;
  readonly minHeightMeters: number;
  readonly maxHeightMeters: number;
  readonly minWidthMeters: number;
  readonly maxWidthMeters: number;
  readonly footprintRadiusM: number;
  readonly eyeHeightRatio: number;
  readonly poseVariants: readonly string[];
  readonly allowMirror: boolean;
  readonly defaultWeight: number;
}

export interface KeepOutZone {
  readonly id: string;
  readonly role: KeepOutRole;
  readonly bbox: ScreenBoundingBox;
  readonly paddingPx?: number;
}

export interface CrowdScatterOptions {
  readonly stage: PerspectiveGroundStage;
  readonly seed: number;
  readonly targetCount: number;
  readonly templates?: readonly ScatterAssetTemplate[];
  readonly archetypeIds?: readonly ScatterArchetypeId[];
  readonly archetypeWeights?: Readonly<Partial<Record<ScatterArchetypeId, number>>>;
  readonly keepOutZones?: readonly KeepOutZone[];
  readonly spacingMultiplier?: number;
  readonly edgeMarginPx?: number;
  readonly depthDistribution?: DepthDistributionMode;
  readonly eyeHeightLockMode?: EyeHeightLockMode;
  readonly maxAttemptsMultiplier?: number;
  readonly activeExpansionCandidates?: number;
}

export interface PlacedScatterEntity {
  readonly id: string;
  readonly painterOrderIndex: number;
  readonly templateId: ScatterArchetypeId;
  readonly labelKo: string;
  readonly category: ScatterAssetCategory;
  readonly poseVariant: string;
  readonly mirrored: boolean;
  readonly variantSignature: string;
  readonly worldXMeters: number;
  readonly depthMeters: number;
  readonly physicalHeightMeters: number;
  readonly physicalWidthMeters: number;
  readonly eyeHeightMeters: number;
  readonly footprintRadiusM: number;
  readonly footScreenX: number;
  readonly footScreenY: number;
  readonly headScreenY: number;
  readonly eyeScreenY: number;
  readonly canonicalEyeScreenY: number;
  readonly screenHeightPx: number;
  readonly screenWidthPx: number;
  readonly horizonEyeErrorPx: number;
  readonly canonicalHorizonEyeErrorPx: number;
  readonly bbox: ScreenBoundingBox;
  readonly atmosphericStyle: AtmosphericDepthStyle;
}

export interface CrowdScatterMetrics {
  readonly requestedCount: number;
  readonly placedCount: number;
  readonly attemptsUsed: number;
  readonly rejectedCollisionCount: number;
  readonly rejectedKeepOutCount: number;
  readonly rejectedBoundsCount: number;
  readonly worldCollisionCount: number;
  readonly keepOutViolationCount: number;
  readonly adjacentCloneConflictCount: number;
  readonly diversityEntropy01: number;
  readonly uniqueVariantCount: number;
  readonly availableVariantCount: number;
  readonly maxHorizonEyeErrorPx: number;
  readonly maxCanonicalHorizonEyeErrorPx: number;
  readonly isDepthSortedBackToFront: boolean;
  readonly tierCounts: Readonly<Record<DetailTier, number>>;
  readonly categoryCounts: Readonly<Record<ScatterAssetCategory, number>>;
  readonly meanScreenHeightNearPx: number;
  readonly meanScreenHeightFarPx: number;
  readonly horizonCompressionFactor: number;
}

export interface CrowdScatterResult {
  readonly stage: PerspectiveGroundStage;
  readonly seed: number;
  readonly spacingMultiplier: number;
  readonly depthDistribution: DepthDistributionMode;
  readonly eyeHeightLockMode: EyeHeightLockMode;
  readonly nearDepthMeters: number;
  readonly farDepthMeters: number;
  readonly keepOutZones: readonly KeepOutZone[];
  readonly entities: readonly PlacedScatterEntity[];
  readonly metrics: CrowdScatterMetrics;
}

/**
 * 웹툰 배경 연출용 7종 기본 아키타입 카탈로그.
 * - 인물 4종: 신장 1.58m ~ 1.84m 범위 준수
 * - 식생 2종: 수고 4.5m ~ 8.0m 범위 준수
 * - 거리 소품 1종: 가로등 4.2m ~ 5.6m
 */
export const DEFAULT_SCATTER_ASSET_TEMPLATES: readonly ScatterAssetTemplate[] = [
  {
    id: "bystander-walker",
    labelKo: "보행 행인",
    category: "human",
    minHeightMeters: 1.6,
    maxHeightMeters: 1.8,
    minWidthMeters: 0.48,
    maxWidthMeters: 0.58,
    footprintRadiusM: 0.44,
    eyeHeightRatio: 0.935,
    poseVariants: ["stride-left", "stride-right", "casual-glance", "phone-stroll"],
    allowMirror: true,
    defaultWeight: 1.0,
  },
  {
    id: "bystander-commuter",
    labelKo: "출근 통근자",
    category: "human",
    minHeightMeters: 1.62,
    maxHeightMeters: 1.84,
    minWidthMeters: 0.52,
    maxWidthMeters: 0.64,
    footprintRadiusM: 0.48,
    eyeHeightRatio: 0.935,
    poseVariants: ["briefcase-stride", "coat-hurry", "umbrella-carry", "bag-shoulder"],
    allowMirror: true,
    defaultWeight: 0.95,
  },
  {
    id: "student-uniform",
    labelKo: "교복 학생",
    category: "human",
    minHeightMeters: 1.58,
    maxHeightMeters: 1.76,
    minWidthMeters: 0.46,
    maxWidthMeters: 0.54,
    footprintRadiusM: 0.42,
    eyeHeightRatio: 0.935,
    poseVariants: ["backpack-walk", "chat-turn", "tote-stroll", "blazer-stride"],
    allowMirror: true,
    defaultWeight: 0.9,
  },
  {
    id: "fantasy-soldier",
    labelKo: "판타지 경비병",
    category: "human",
    minHeightMeters: 1.68,
    maxHeightMeters: 1.84,
    minWidthMeters: 0.6,
    maxWidthMeters: 0.74,
    footprintRadiusM: 0.56,
    eyeHeightRatio: 0.935,
    poseVariants: ["halberd-patrol", "shield-march", "cloak-vigil", "spear-ready"],
    allowMirror: true,
    defaultWeight: 0.75,
  },
  {
    id: "street-tree",
    labelKo: "도심 가로수",
    category: "foliage",
    minHeightMeters: 4.5,
    maxHeightMeters: 7.2,
    minWidthMeters: 3.0,
    maxWidthMeters: 4.6,
    footprintRadiusM: 1.45,
    eyeHeightRatio: 0.82,
    poseVariants: ["oval-crown", "wind-lean", "split-bough", "trimmed-canopy"],
    allowMirror: true,
    defaultWeight: 0.45,
  },
  {
    id: "cherry-blossom-canopy",
    labelKo: "벚꽃 수관나무",
    category: "foliage",
    minHeightMeters: 4.8,
    maxHeightMeters: 8.0,
    minWidthMeters: 3.6,
    maxWidthMeters: 5.6,
    footprintRadiusM: 1.75,
    eyeHeightRatio: 0.8,
    poseVariants: ["bloom-arch", "petal-sweep", "wide-cloud", "weeping-branch"],
    allowMirror: true,
    defaultWeight: 0.4,
  },
  {
    id: "street-lamp",
    labelKo: "거리 가로등",
    category: "prop",
    minHeightMeters: 4.2,
    maxHeightMeters: 5.6,
    minWidthMeters: 0.65,
    maxWidthMeters: 0.95,
    footprintRadiusM: 0.55,
    eyeHeightRatio: 0.9,
    poseVariants: ["single-arm", "double-lantern", "arched-modern", "classic-globe"],
    allowMirror: true,
    defaultWeight: 0.35,
  },
];

export const SCATTER_TEMPLATE_BY_ID: Readonly<Record<ScatterArchetypeId, ScatterAssetTemplate>> = {
  "bystander-walker": DEFAULT_SCATTER_ASSET_TEMPLATES[0],
  "bystander-commuter": DEFAULT_SCATTER_ASSET_TEMPLATES[1],
  "student-uniform": DEFAULT_SCATTER_ASSET_TEMPLATES[2],
  "fantasy-soldier": DEFAULT_SCATTER_ASSET_TEMPLATES[3],
  "street-tree": DEFAULT_SCATTER_ASSET_TEMPLATES[4],
  "cherry-blossom-canopy": DEFAULT_SCATTER_ASSET_TEMPLATES[5],
  "street-lamp": DEFAULT_SCATTER_ASSET_TEMPLATES[6],
};

/**
 * 결정론적 32비트 시드 의사난수 생성기(`mulberry32`). `[0, 1)` 균등 분포 실수를 반환한다.
 */
export function mulberry32(seed: number): () => number {
  let state = (Math.floor(Number.isFinite(seed) ? seed : 0) >>> 0) || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const createMulberry32 = mulberry32;

export function buildVariantSignature(
  templateId: ScatterArchetypeId,
  poseVariant: string,
  mirrored: boolean,
): string {
  return `${templateId}::${poseVariant}::${mirrored ? "L" : "R"}`;
}
