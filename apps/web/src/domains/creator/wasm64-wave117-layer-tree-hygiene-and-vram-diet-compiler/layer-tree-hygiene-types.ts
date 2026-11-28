/**
 * Wave 117 — 웹툰 원고 레이어 트리 자동 정규화·안전 병합 및 타일-희소 VRAM 다이어트 컴파일러 공통 타입.
 *
 * - ES2017 strict TypeScript 및 verbatimModuleSyntax 준수
 * - 한국 웹툰 스튜디오 9단계 표준 역할 코드 체계(01_GUIDE ~ 09_SFX) 정의
 */

export type LayerNodeKind =
  | "raster"
  | "vector-line"
  | "folder"
  | "adjustment"
  | "text-balloon"
  | "bg3d-ref"
  | "guide";

export type LayerBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "add-glow"
  | "pass-through";

export type StudioLayerRole =
  | "guide"
  | "bg3d"
  | "flat"
  | "shadow"
  | "line"
  | "light"
  | "effect"
  | "balloon"
  | "sfx";

export type LayerHygieneSeverity = "info" | "warning" | "error" | "critical";

export type LayerHygieneIssueCode =
  | "cycle"
  | "orphan-parent"
  | "non-folder-parent"
  | "duplicate-node-id"
  | "meaningless-name"
  | "empty-layer"
  | "empty-folder"
  | "hidden-heavy-layer"
  | "dangling-clip-mask"
  | "redundant-clip-mask"
  | "invalid-numeric-metadata";

export type LayerRenameReason =
  | "already-canonical"
  | "replace-meaningless-name"
  | "apply-studio-prefix"
  | "disambiguate-collision";

export type TreeIntegrityStatus = "valid" | "failed-closed";

export type SafetyBarrierReasonCode =
  | "locked-layer"
  | "non-destructive-kind"
  | "clipped-layer"
  | "clip-chain-base"
  | "non-normal-blend-mode"
  | "partial-opacity"
  | "different-role"
  | "different-parent"
  | "hidden-nonempty-layer"
  | "mismatched-pixel-format"
  | "editable-alpha-mask"
  | "tree-integrity-failure";

export type LayerDietActionKind =
  | "safe-lossless-merge"
  | "prune-empty-layer"
  | "keep-protected-barrier"
  | "keep-preserved"
  | "blocked-integrity-failure";

export type DietPlanStatus =
  | "optimized"
  | "already-optimal"
  | "blocked-integrity-failure";

export type TileOverlapEstimationMode =
  | "exact-tile-set"
  | "probabilistic-occupancy";

export interface StudioRoleSpec {
  readonly role: StudioLayerRole;
  readonly prefix: string;
  readonly defaultStem: string;
  readonly labelKo: string;
  readonly opfsCompressionRatio: number;
}

export const STUDIO_ROLE_SPECS: Readonly<Record<StudioLayerRole, StudioRoleSpec>> = {
  guide: {
    role: "guide",
    prefix: "01_GUIDE",
    defaultStem: "LAYOUT",
    labelKo: "가이드·콘티",
    opfsCompressionRatio: 0.34,
  },
  bg3d: {
    role: "bg3d",
    prefix: "02_BG3D",
    defaultStem: "BG3D",
    labelKo: "3D 배경 참조",
    opfsCompressionRatio: 0.68,
  },
  flat: {
    role: "flat",
    prefix: "03_FLAT",
    defaultStem: "BASE",
    labelKo: "밑색·채색",
    opfsCompressionRatio: 0.36,
  },
  shadow: {
    role: "shadow",
    prefix: "04_SHADOW",
    defaultStem: "SHADE",
    labelKo: "명암·그림자",
    opfsCompressionRatio: 0.52,
  },
  line: {
    role: "line",
    prefix: "05_LINE",
    defaultStem: "INK",
    labelKo: "선화·잉크",
    opfsCompressionRatio: 0.32,
  },
  light: {
    role: "light",
    prefix: "06_LIGHT",
    defaultStem: "GLOW",
    labelKo: "광원·하이라이트",
    opfsCompressionRatio: 0.54,
  },
  effect: {
    role: "effect",
    prefix: "07_EFFECT",
    defaultStem: "FX",
    labelKo: "효과·이펙트",
    opfsCompressionRatio: 0.56,
  },
  balloon: {
    role: "balloon",
    prefix: "08_BALLOON",
    defaultStem: "SPEECH",
    labelKo: "말풍선·대사",
    opfsCompressionRatio: 0.30,
  },
  sfx: {
    role: "sfx",
    prefix: "09_SFX",
    defaultStem: "SFX",
    labelKo: "효과음·식자",
    opfsCompressionRatio: 0.35,
  },
};

export const STUDIO_ROLE_ORDER: readonly StudioLayerRole[] = [
  "guide",
  "bg3d",
  "flat",
  "shadow",
  "line",
  "light",
  "effect",
  "balloon",
  "sfx",
];

/** 비파괴 보존 대상 레이어 종류 (절대 래스터 병합 금지). */
export const NON_DESTRUCTIVE_LAYER_KINDS: readonly LayerNodeKind[] = [
  "guide",
  "text-balloon",
  "bg3d-ref",
  "vector-line",
  "adjustment",
];

/** 기본 숨김 대용량 레이어 경보 기준 (4 MiB). */
export const DEFAULT_HIDDEN_HEAVY_VRAM_THRESHOLD_BYTES = 4 * 1024 * 1024;

/** 레이어 1개당 OPFS 메타데이터·페이지 테이블 고정 오버헤드(바이트). */
export const LAYER_OPFS_HEADER_OVERHEAD_BYTES = 2048;

/** 타일 1개당 64비트 타일 인덱스 엔트리 크기(바이트). */
export const TILE_PAGE_TABLE_ENTRY_BYTES = 8;

export interface LayerTreeNodeInput {
  readonly id: string;
  readonly parentId: string | null;
  /** 같은 부모 내부의 아래→위 합성 순서(0이 가장 아래). 생략 시 입력 배열 순서를 사용한다. */
  readonly orderIndex?: number;
  readonly rawName: string;
  readonly kind: LayerNodeKind;
  readonly blendMode: LayerBlendMode;
  readonly opacity: number;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly clippedToBelow: boolean;
  readonly nonEmptyTileCount: number;
  readonly totalTileCount: number;
  readonly tileSizePx: number;
  readonly bytesPerPixel: number;
  readonly hasAlphaMask: boolean;
  /** 선택적 역할 명시 힌트. */
  readonly roleHint?: StudioLayerRole;
  /** 선택적 활성 타일 인덱스 목록(제공 시 병합 타일 합집합을 정확히 계산). */
  readonly activeTileIndices?: readonly number[];
  /** 선택적 실측 OPFS 압축 디스크 점유 바이트. */
  readonly opfsCompressedBytes?: number;
}

export interface LayerTreeAuditOptions {
  readonly documentId?: string;
  readonly hiddenHeavyVramThresholdBytes?: number;
}

export interface SanitizedLayerNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly orderIndex: number;
  readonly inputIndex: number;
  readonly depth: number;
  readonly rawName: string;
  readonly normalizedName: string;
  readonly renameReason: LayerRenameReason;
  readonly inferredRole: StudioLayerRole;
  readonly kind: LayerNodeKind;
  readonly blendMode: LayerBlendMode;
  readonly opacity: number;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly clippedToBelow: boolean;
  readonly clipBaseLayerId: string | null;
  readonly isClipChainBase: boolean;
  readonly nonEmptyTileCount: number;
  readonly totalTileCount: number;
  readonly tileSizePx: number;
  readonly bytesPerPixel: number;
  readonly hasAlphaMask: boolean;
  readonly denseVramBytes: number;
  readonly sparseVramBytes: number;
  readonly estimatedOpfsBytes: number;
  readonly activeTileIndices?: readonly number[];
}

export interface LayerHygieneIssue {
  readonly code: LayerHygieneIssueCode;
  readonly severity: LayerHygieneSeverity;
  readonly layerId: string;
  readonly relatedLayerIds: readonly string[];
  readonly messageKo: string;
}

export interface LayerRenameEntry {
  readonly layerId: string;
  readonly rawName: string;
  readonly normalizedName: string;
  readonly inferredRole: StudioLayerRole;
  readonly reason: LayerRenameReason;
}

export interface LayerTreeHygieneAuditResult {
  readonly documentId: string;
  readonly integrityStatus: TreeIntegrityStatus;
  readonly safeToCompile: boolean;
  readonly totalLayerCount: number;
  readonly folderCount: number;
  readonly pixelLayerCount: number;
  readonly nodes: readonly SanitizedLayerNode[];
  readonly renameMap: readonly LayerRenameEntry[];
  readonly issues: readonly LayerHygieneIssue[];
  readonly integrityErrorCount: number;
  readonly meaninglessNameCount: number;
  readonly emptyLayerCount: number;
  readonly hiddenHeavyLayerCount: number;
  readonly danglingClipMaskCount: number;
  readonly redundantClipMaskCount: number;
}

export interface LayerVramDietCompileOptions {
  /** true이면 편집 가능한 알파 마스크 보유 래스터도 병합 장벽으로 보호한다(기본 false). */
  readonly protectAlphaMaskedLayers?: boolean;
}

export interface SafetyBarrierRecord {
  readonly layerId: string;
  readonly adjacentLayerId: string | null;
  readonly reasonCode: SafetyBarrierReasonCode;
  readonly mathematicalReasonKo: string;
}

export interface SafeMergeGroup {
  readonly groupId: string;
  readonly parentId: string | null;
  readonly role: StudioLayerRole;
  readonly sourceLayerIds: readonly string[];
  readonly targetLayerId: string;
  readonly targetNormalizedName: string;
  readonly beforeTileCount: number;
  readonly afterTileCount: number;
  readonly savedTileCount: number;
  readonly beforeSparseVramBytes: number;
  readonly afterSparseVramBytes: number;
  readonly savedVramBytes: number;
  readonly tileOverlapMode: TileOverlapEstimationMode;
  readonly equivalenceProof: string;
}

export interface PrunedEmptyLayerRecord {
  readonly layerId: string;
  readonly parentId: string | null;
  readonly rawName: string;
  readonly normalizedName: string;
  readonly reclaimedDenseVramBytes: number;
  readonly reclaimedOpfsBytes: number;
  readonly reasonKo: string;
}

export interface LayerDietDecision {
  readonly layerId: string;
  readonly normalizedName: string;
  readonly action: LayerDietActionKind;
  readonly mergeGroupId: string | null;
  readonly barrierReasons: readonly SafetyBarrierReasonCode[];
}

export interface VramAndOpfsMetrics {
  readonly denseVramBytes: number;
  readonly sparseVramBytes: number;
  readonly optimizedVramBytes: number;
  readonly denseVramMiB: number;
  readonly sparseVramMiB: number;
  readonly optimizedVramMiB: number;
  readonly denseToSparseSavingsBytes: number;
  readonly denseToSparseSavingsPercent: number;
  readonly dietMergeSavingsBytes: number;
  readonly dietMergeSavingsPercent: number;
  readonly totalSavingsFromDenseBytes: number;
  readonly totalSavingsFromDenseMiB: number;
  readonly totalSavingsFromDensePercent: number;
  readonly opfsBeforeBytes: number;
  readonly opfsAfterBytes: number;
  readonly opfsSavingsBytes: number;
  readonly opfsSavingsPercent: number;
  readonly hiddenNonEmptyReclaimableVramBytes: number;
}

export interface CompiledLayerManifestNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly orderIndex: number;
  readonly name: string;
  readonly role: StudioLayerRole;
  readonly kind: LayerNodeKind;
  readonly blendMode: LayerBlendMode;
  readonly opacity: number;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly clippedToBelow: boolean;
  readonly nonEmptyTileCount: number;
  readonly totalTileCount: number;
  readonly tileSizePx: number;
  readonly bytesPerPixel: number;
  readonly hasAlphaMask: boolean;
  readonly mergedFromIds: readonly string[];
}

export interface LayerVramDietPlanResult {
  readonly documentId: string;
  readonly status: DietPlanStatus;
  readonly layerCountBefore: number;
  readonly layerCountAfter: number;
  readonly mergedGroupCount: number;
  readonly prunedEmptyLayerCount: number;
  readonly protectedBarrierLayerCount: number;
  readonly mergeGroups: readonly SafeMergeGroup[];
  readonly prunedLayers: readonly PrunedEmptyLayerRecord[];
  readonly blockedBarriers: readonly SafetyBarrierRecord[];
  readonly decisions: readonly LayerDietDecision[];
  readonly compiledManifest: readonly CompiledLayerManifestNode[];
  readonly metrics: VramAndOpfsMetrics;
  readonly beforeManifestSha256: string;
  readonly afterManifestSha256: string;
}
