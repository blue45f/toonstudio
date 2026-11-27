/**
 * Wasm64 Wave 42 공개 진입점 (`wasm64-wave42-bigmemory-smart-color`).
 *
 * - `wasm64-bigmemory-virtual-scene-pager`: `> 4 GiB ~ 64 GiB` `BigInt` 64비트 가상 장면 페이저,
 *   `64B` SIMD 정렬 디스크립터, 핀 보호, 스캔 저항성 `LRU-2 / Clock-Pro`, OPFS 더티 병합 및 온라인 파편화 압축
 * - `multidimensional-oklch-smart-coloring-solver`: 선화 폐영역 인접 그래프 + `OKLCH`·재질·모델시트 앵커
 *   다차원 에너지 최소화 스마트 컬러링, `Ambient / Key / Rim` 색온도 음영 및 인접 `DeltaE_OK` 대비 자동 보정
 * - `local-hnsw-asset-db-and-edge-state-coordinator`: 온디바이스 `HNSW + SQ8` 에셋 벡터 DB 및
 *   인과 `HLVC`·타일 머클 차분·네트워크 단절 무손실 수렴 엣지 상태 조율 프로토콜
 */

export {
  advanceHybridVectorClock,
  buildSceneMerkleSummary,
  compareHybridVectorClocks,
  computeMerkleTileDiff,
  computeSq8AsymmetricL2Distance,
  createInitialHybridVectorClock,
  DEFAULT_HNSW_EF_CONSTRUCTION,
  DEFAULT_HNSW_EF_SEARCH,
  DEFAULT_HNSW_M,
  dequantizeVectorSq8,
  EdgeStateCoordinatorNode,
  LocalHnswSq8AssetIndex,
  mergeHybridVectorClocks,
  MERKLE_RADIX_BUCKET_COUNT,
  quantizeVectorSq8,
  reconcileEdgeReplicaPair,
  type CausalOrderRelation,
  type EdgeReplicaSnapshot,
  type EdgeSyncReconciliationReport,
  type EdgeTileEntityRecord,
  type EdgeTileMutationOp,
  type HnswAssetDocument,
  type HnswAssetKind,
  type HnswAssetSearchHit,
  type HnswAssetSearchOptions,
  type HnswAssetSearchReport,
  type HnswIndexConfig,
  type HybridVectorClock,
  type MerkleTileDiffResult,
  type SceneMerkleSummary,
  type Sq8QuantizedVector,
} from "./local-hnsw-asset-db-and-edge-state-coordinator";

export {
  computeDeltaEOk,
  computeKelvinLinearTint,
  computeOklabFromSrgb,
  computeOklchFromSrgb,
  computeSrgbFromOklch,
  DEFAULT_MIN_ADJACENT_DELTA_E_OK,
  DEFAULT_NEUTRAL_KELVIN,
  MAX_SKIN_HUE_SHIFT_DEG,
  solveSmartColoringGraph,
  type LineArtClosedRegion,
  type ModelSheetPaletteAnchor,
  type OklabVector,
  type OklchColorVector,
  type RegionAdjacencyEdge,
  type SceneLightingEnvironment,
  type SmartColoredRegionResult,
  type SmartColoringGraphInput,
  type SmartColoringGraphSolution,
  type SmartColorMaterialCategory,
  type SmartColorMaterialTrait,
  type Srgb8Color,
} from "./multidimensional-oklch-smart-coloring-solver";

export {
  alignUp64BigInt,
  computeFnv1a64,
  DEFAULT_WASM64_PAGE_SIZE_BYTES,
  packPageDescriptor64B,
  unpackPageDescriptor64B,
  WASM32_LEGACY_CEILING_BYTES,
  WASM64_MAX_VIRTUAL_ADDRESS_BYTES,
  WASM64_SEGMENT_BASE_OFFSETS,
  WASM64_SIMD_ALIGNMENT_BYTES,
  WASM64_SIMD_DESCRIPTOR_BYTES,
  Wasm64BigMemoryScenePager,
  Wasm64PagerError,
  type OpfsWriteCoalescedBatch,
  type PackedSimdPageDescriptor,
  type PageCompactionReport,
  type ScenePageHandle,
  type ScenePageStatsSnapshot,
  type Wasm64OpfsBackingStore,
  type Wasm64PagerErrorCode,
  type Wasm64ScenePagerOptions,
  type Wasm64SceneSegmentKind,
} from "./wasm64-bigmemory-virtual-scene-pager";
