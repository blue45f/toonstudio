/**
 * Wave 165: 2D 라인아트 시맨틱 깊이 마스크 및 오클루전 안티-블리드 솔버 핵심 타입 계약.
 *
 * - 6단계 시맨틱 깊이 레이어(전경 소품 → 헤어 → 얼굴 → 의상 → 중경 → 배경)를 결정론적 정수 순위로 정의한다.
 * - 원시 hex/rgb 색표기 대신 순수 OKLCH 진단 스와치만 사용한다.
 * - 엄격한 ES2017 호환 및 `verbatimModuleSyntax` 계약을 준수한다.
 */

export type SemanticDepthLayerClass =
  | "foreground-prop"
  | "character-hair"
  | "character-face"
  | "character-outfit"
  | "midground-env"
  | "background-sky";

export interface SemanticDepthLayerMetadata {
  readonly layerClass: SemanticDepthLayerClass;
  /** 높을수록 카메라에 가까운 전경 우선순위(1..6). */
  readonly depthRank: number;
  /** 래스터 마스크 버퍼(`Uint8Array`)에 기록하는 결정론적 클래스 ID(1..6, 0은 미할당). */
  readonly classId: number;
  readonly labelKo: string;
  readonly oklchFill: string;
  readonly oklchStroke: string;
}

/** 전경에서 배경 순으로 정렬된 6개 시맨틱 깊이 클래스. */
export const SEMANTIC_DEPTH_LAYER_ORDER: readonly SemanticDepthLayerClass[] = [
  "foreground-prop",
  "character-hair",
  "character-face",
  "character-outfit",
  "midground-env",
  "background-sky",
];

/** 시맨틱 깊이 클래스 메타데이터 사전(순수 OKLCH 팔레트). */
export const SEMANTIC_DEPTH_LAYER_INFO: Readonly<
  Record<SemanticDepthLayerClass, SemanticDepthLayerMetadata>
> = {
  "foreground-prop": {
    layerClass: "foreground-prop",
    depthRank: 6,
    classId: 6,
    labelKo: "전경 소품",
    oklchFill: "oklch(0.64 0.16 25)",
    oklchStroke: "oklch(0.42 0.14 25)",
  },
  "character-hair": {
    layerClass: "character-hair",
    depthRank: 5,
    classId: 5,
    labelKo: "캐릭터 헤어",
    oklchFill: "oklch(0.56 0.13 265)",
    oklchStroke: "oklch(0.36 0.11 265)",
  },
  "character-face": {
    layerClass: "character-face",
    depthRank: 4,
    classId: 4,
    labelKo: "캐릭터 얼굴",
    oklchFill: "oklch(0.84 0.08 62)",
    oklchStroke: "oklch(0.58 0.09 55)",
  },
  "character-outfit": {
    layerClass: "character-outfit",
    depthRank: 3,
    classId: 3,
    labelKo: "캐릭터 의상",
    oklchFill: "oklch(0.58 0.11 162)",
    oklchStroke: "oklch(0.38 0.09 162)",
  },
  "midground-env": {
    layerClass: "midground-env",
    depthRank: 2,
    classId: 2,
    labelKo: "중경 환경",
    oklchFill: "oklch(0.72 0.06 105)",
    oklchStroke: "oklch(0.48 0.06 105)",
  },
  "background-sky": {
    layerClass: "background-sky",
    depthRank: 1,
    classId: 1,
    labelKo: "배경 하늘",
    oklchFill: "oklch(0.88 0.05 225)",
    oklchStroke: "oklch(0.62 0.07 225)",
  },
};

export const SEMANTIC_CLASS_ID_TO_LAYER: Readonly<Record<number, SemanticDepthLayerClass>> = {
  1: "background-sky",
  2: "midground-env",
  3: "character-outfit",
  4: "character-face",
  5: "character-hair",
  6: "foreground-prop",
};

/** 2D 라인아트 알파 래스터 입력(`inkAlpha`: 0..255, 행 우선 `y * width + x`). */
export interface LineartRasterInput {
  readonly width: number;
  readonly height: number;
  readonly inkAlpha: Uint8Array;
}

/** 작가가 지정한 시맨틱 채색 영역 시드 힌트. */
export interface SemanticSeedHint {
  readonly x: number;
  readonly y: number;
  readonly layerClass: SemanticDepthLayerClass;
  readonly labelKo: string;
}

/** 라인아트 틈 봉합 및 영역 분할 옵션. */
export interface LineartSegmentationOptions {
  /** 선화 경계로 간주할 최소 잉크 알파(0..255, 기본값 128). */
  readonly inkBarrierThreshold?: number;
  /** 봉합할 열린 펜선 틈 최대 픽셀 폭(0..6, 기본값 3). */
  readonly maxGapClosePx?: number;
  /** 미시드 닫힌 소영역 귀속 시 기준 면적 상한(기본값 64). */
  readonly minMicroRegionArea?: number;
  /** 경계에 닿은 미시드 외곽 영역 기본 클래스(기본값 `background-sky`). */
  readonly unseededFallbackClass?: SemanticDepthLayerClass;
}

/** 열린 선화 틈 봉합 배리어 산출물. */
export interface GapSealedBarrierResult {
  readonly width: number;
  readonly height: number;
  readonly inkBarrierThreshold: number;
  readonly maxGapClosePx: number;
  /** 원본 선화 임계치 마스크(`0` 또는 `1`). */
  readonly rawInkMask: Uint8Array;
  /** 원본 선화 + 1..3px 틈 봉합 브리지 마스크(`0` 또는 `1`). */
  readonly sealedBarrierMask: Uint8Array;
  /** 순수하게 새로 채워진 틈 봉합 브리지 픽셀 마스크(`0` 또는 `1`). */
  readonly bridgeOnlyMask: Uint8Array;
  readonly rawInkPixelCount: number;
  readonly bridgePixelCount: number;
  readonly closedGapCount: number;
  /** 기존 선화 대비 브리지 추가 비율(굵어짐 억제 지표). */
  readonly thickeningRatio: number;
}

export interface RegionBoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface RegionCentroid {
  readonly x: number;
  readonly y: number;
}

export interface LineartRegionSummary {
  readonly regionId: number;
  readonly pixelCount: number;
  readonly bbox: RegionBoundingBox;
  readonly centroid: RegionCentroid;
  readonly touchesBorder: boolean;
  readonly borderSidesTouched: number;
  readonly wrapsCanvasExterior: boolean;
  readonly neighborRegionIds: readonly number[];
}

export interface LineartRegionExtractionResult {
  readonly width: number;
  readonly height: number;
  /** `0`은 선화·브리지 경계, `1..regionCount`는 4-연결 영역 ID. */
  readonly regionLabels: Int32Array;
  readonly regionCount: number;
  readonly regions: readonly LineartRegionSummary[];
  /** 영역별 인접 영역 ID 목록. */
  readonly adjacency: Readonly<Record<number, readonly number[]>>;
  /** 영역별 인접 영역과의 경계 접촉 가중치(`adjacencyWeights[a][b]`). */
  readonly adjacencyWeights: Readonly<Record<number, Readonly<Record<number, number>>>>;
}

export type SemanticAssignmentSource = "seed" | "enclosure-neighbor" | "border-fallback";

export interface SemanticLayerAssignmentEntry {
  readonly regionId: number;
  readonly layerClass: SemanticDepthLayerClass;
  readonly depthRank: number;
  readonly classId: number;
  readonly assignmentSource: SemanticAssignmentSource;
  readonly seedLabelsKo: readonly string[];
  readonly pixelCount: number;
  readonly hasSeedCollision: boolean;
  readonly leakedIntoBorder: boolean;
}

export interface SemanticDepthMaskAssignment {
  readonly width: number;
  readonly height: number;
  /** 열린 영역 픽셀에만 시맨틱 클래스 ID(`1..6`)를 기록한 코어 레이어 맵(`0`은 선화 경계). */
  readonly coreLayerMap: Uint8Array;
  readonly assignments: readonly SemanticLayerAssignmentEntry[];
  /** 전경·캐릭터 시드가 외곽으로 새거나 타 클래스 시드와 병합된 누수 영역 수. */
  readonly leakedRegionCount: number;
  /** 하나의 연결 영역 안에서 서로 다른 시맨틱 클래스가 충돌한 건수. */
  readonly seedCollisionCount: number;
  /** 시드 없이 닫힌 소영역이 주변/포위 규칙으로 귀속된 개수. */
  readonly resolvedMicroRegionCount: number;
  readonly orphanedRegionCount: number;
  readonly perClassPixelCounts: Readonly<Record<SemanticDepthLayerClass, number>>;
}

/** 서브-잉크 안티-블리드 솔버 옵션. */
export interface AntiBleedSolverOptions {
  /** 반투명 안티앨리어싱 잉크 하한 알파(기본값 8). */
  readonly antiAliasFloor?: number;
  /** 완전 불투명 잉크 상한 알파(기본값 245). */
  readonly opaqueInkCeiling?: number;
  /** 선화 아래로 마스크를 확장하는 최대 반경(px, 기본값 3). */
  readonly maxChokeRadiusPx?: number;
}

export interface LayerClippingMask {
  readonly layerClass: SemanticDepthLayerClass;
  readonly depthRank: number;
  readonly classId: number;
  readonly labelKo: string;
  /** 픽셀별 클리핑 알파(`0` 또는 `255`). */
  readonly maskAlpha: Uint8Array;
  readonly corePixelCount: number;
  readonly underInkExpandedPixelCount: number;
  readonly totalMaskedPixelCount: number;
}

export interface AntiBleedMaskSolution {
  readonly width: number;
  readonly height: number;
  readonly mode: "naive-threshold" | "sub-ink-antibleed";
  /** 픽셀별 최종 승리 시맨틱 클래스 ID(`0`은 미채색/빈 픽셀, `1..6`은 레이어 ID). */
  readonly resolvedLayerMap: Uint8Array;
  /** 전경 → 배경 순으로 정렬된 레이어별 클리핑 마스크 목록. */
  readonly layerMasks: readonly LayerClippingMask[];
  readonly underInkFilledPixelCount: number;
  readonly iterationsExecuted: number;
}

export interface AntiBleedQualityMetrics {
  /** 반투명 잉크 경계 아래에 채색 마스크가 비어 흰 테두리가 드러나는 픽셀 수. */
  readonly whiteHaloPixelCount: number;
  /** 인접 레이어가 선화 반대편 영역이나 상대 반투명 가장자리로 침범한 픽셀 수. */
  readonly crossLayerBleedCount: number;
  /** 시맨틱 영역 분할 단계에서 감지된 누수 영역 수. */
  readonly leakedRegionCount: number;
  /** 전체 캔버스 대비 유효 마스크(또는 완전 불투명 선화) 커버리지(0..1). */
  readonly coverageRatio: number;
  readonly coveredPixelCount: number;
  readonly totalPixelCount: number;
  readonly perLayerCoverage: Readonly<Record<SemanticDepthLayerClass, number>>;
}

export type SemanticMaskAuditStatus = "PASS" | "WARN" | "FAIL";

export interface AntiBleedAuditComparison {
  readonly naiveMetrics: AntiBleedQualityMetrics;
  readonly solvedMetrics: AntiBleedQualityMetrics;
  /** 기준선 대비 흰 테두리 제거율(0..1). */
  readonly haloReductionRatio: number;
  readonly haloEliminatedPixels: number;
  readonly zeroBleedGuaranteed: boolean;
  readonly zeroLeakGuaranteed: boolean;
  readonly status: SemanticMaskAuditStatus;
}

/** 16-byte 정렬 64-byte(16×f32) WebGPU 프래그먼트 유니폼 구조. */
export interface DepthMaskWgslUniformValues {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly antiAliasFloorNorm: number;
  readonly inkOpacityGain: number;
  readonly chokeBiasPx: number;
  readonly depthPriorityGain: number;
  readonly premultiplyClamp: number;
  readonly activeLayerCount: number;
  readonly inkTintR: number;
  readonly inkTintG: number;
  readonly inkTintB: number;
  readonly inkTintA: number;
  readonly paperLuma: number;
  readonly edgeSoftness: number;
  readonly haloGuardEps: number;
  readonly debugOverlayMode: number;
}

export interface DepthMaskWgslBundle {
  readonly shaderId: string;
  readonly entryPoint: string;
  readonly wgslSource: string;
  readonly uniformByteLength: number;
  readonly uniformFloats: Float32Array;
  readonly uniformValues: DepthMaskWgslUniformValues;
}

export interface DepthMaskWgslValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly braceDepthBalance: number;
  readonly bindingKeys: readonly string[];
  readonly uniformByteLength: number;
}

export interface LineartSemanticDepthMaskScenario {
  readonly scenarioId: string;
  readonly titleKo: string;
  readonly raster: LineartRasterInput;
  readonly seeds: readonly SemanticSeedHint[];
  readonly segmentationOptions?: LineartSegmentationOptions;
  readonly antiBleedOptions?: AntiBleedSolverOptions;
}

export interface LineartSemanticDepthMaskOrchestratorResult {
  readonly engineId: "wasm64-wave165-lineart-semantic-depth-mask-and-antibleed-solver";
  readonly scenarioId: string;
  readonly titleKo: string;
  readonly barrier: GapSealedBarrierResult;
  readonly extraction: LineartRegionExtractionResult;
  readonly assignment: SemanticDepthMaskAssignment;
  readonly naiveSolution: AntiBleedMaskSolution;
  readonly solvedSolution: AntiBleedMaskSolution;
  readonly audit: AntiBleedAuditComparison;
  readonly wgsl: DepthMaskWgslBundle;
  readonly wgslValidation: DepthMaskWgslValidationResult;
  readonly fingerprintSha256: string;
  readonly auditSvg: string;
  readonly summaryKo: string;
}

export function createZeroClassCountRecord(): Record<SemanticDepthLayerClass, number> {
  return {
    "foreground-prop": 0,
    "character-hair": 0,
    "character-face": 0,
    "character-outfit": 0,
    "midground-env": 0,
    "background-sky": 0,
  };
}

export function getDepthRankForClass(layerClass: SemanticDepthLayerClass): number {
  return SEMANTIC_DEPTH_LAYER_INFO[layerClass].depthRank;
}

export function getClassIdForLayer(layerClass: SemanticDepthLayerClass): number {
  return SEMANTIC_DEPTH_LAYER_INFO[layerClass].classId;
}

export function getLayerForClassId(classId: number): SemanticDepthLayerClass | null {
  return SEMANTIC_CLASS_ID_TO_LAYER[classId] ?? null;
}

export function assertValidLineartRaster(raster: LineartRasterInput): void {
  if (!Number.isInteger(raster.width) || raster.width <= 0) {
    throw new RangeError(`라인아트 너비는 양의 정수여야 합니다: ${String(raster.width)}`);
  }
  if (!Number.isInteger(raster.height) || raster.height <= 0) {
    throw new RangeError(`라인아트 높이는 양의 정수여야 합니다: ${String(raster.height)}`);
  }
  const expectedLength = raster.width * raster.height;
  if (raster.inkAlpha.length !== expectedLength) {
    throw new RangeError(
      `inkAlpha 길이(${String(raster.inkAlpha.length)})가 width*height(${String(expectedLength)})와 일치하지 않습니다.`,
    );
  }
}
