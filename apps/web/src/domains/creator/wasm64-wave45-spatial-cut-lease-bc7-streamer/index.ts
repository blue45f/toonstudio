/**
 * Wasm64 Wave 45 공개 진입점 (`wasm64-wave45-spatial-cut-lease-bc7-streamer`).
 *
 * - `spatial-cut-role-lease-arbiter`: 컷×공정(선화·밑색·명암·배경·식자) 2차원 공간 임대 중재기,
 *   TTL 기반 좀비 잠금 자동 회수, HLC 결정론적 경합 우선권 및 경계 타일 픽셀 델타 합성기
 * - `gpu-block-texture-tile-packer`: 800×20,000px 장편 원고용 단색 0바이트 승격, `R8` 선화 4:1 압축,
 *   `BC1(64비트)`·`ASTC-4x4 호환(128비트)` 블록 색양자화 패커 및 복원기
 * - `scroll-velocity-mipmap-residency-scheduler`: 세로 스크롤 속도·줌·활성 컷 기반 `LOD 0/1/2` 상주 및
 *   `2ms` 프레임 예산 내 LRU+거리 가중치 VRAM 퇴거 스케줄러
 */

export {
  acquireCutRoleLease,
  advanceHlc,
  buildCutRoleLeaseKey,
  compareHlc,
  createCutRoleLeaseArbiterState,
  DEFAULT_CONTENTION_WINDOW_MS,
  DEFAULT_CUT_ROLE_LEASE_TTL_MS,
  expireStaleCutRoleLeases,
  listCoexistingRolesInCut,
  MANUSCRIPT_ROLE_COMPOSITE_ORDER,
  MANUSCRIPT_ROLE_LABELS_KO,
  MANUSCRIPT_ROLES,
  MAX_CUT_ROLE_LEASE_TTL_MS,
  mergeBoundaryTilePixelDeltas,
  MIN_CUT_ROLE_LEASE_TTL_MS,
  releaseCutRoleLease,
  resolveSimultaneousCutRoleClaims,
  type BoundaryTileDeltaMergeOptions,
  type BoundaryTileDeltaMergeResult,
  type BoundaryTileSubrectDelta,
  type CutRoleLeaseDecision,
  type CutRoleLeaseDecisionStatus,
  type CutRoleLeaseRequest,
  type HybridLogicalClock,
  type ManuscriptRole,
  type SimultaneousCutRoleBatchResult,
  type SpatialCutRoleArbiterState,
  type SpatialCutRoleLease,
} from "./spatial-cut-role-lease-arbiter";

export {
  ASTC4X4_COMPAT_BLOCK_BYTES,
  BC1_BLOCK_BYTES,
  computeRgbaTilePsnrDb,
  DEFAULT_GPU_TILE_SIZE_PX,
  packGpuTextureTile,
  packManuscriptTileBatch,
  unpackGpuTextureTile,
  type GpuPackedTileFormat,
  type ManuscriptTileBatchPackSummary,
  type PackedGpuTextureTile,
  type PackGpuTextureTileOptions,
} from "./gpu-block-texture-tile-packer";

export {
  DEFAULT_LOOKAHEAD_HORIZON_SEC,
  DEFAULT_MAX_UPLOADS_PER_FRAME,
  DEFAULT_SCHEDULER_FRAME_BUDGET_MS,
  estimateMipmapVramBytes,
  FAST_SCROLL_VELOCITY_PX_PER_SEC,
  MEDIUM_SCROLL_VELOCITY_PX_PER_SEC,
  resolveDominantMipmapLod,
  scheduleScrollMipmapResidency,
  type ActiveCutVerticalBounds,
  type ManuscriptTileCandidate,
  type MipmapLodLevel,
  type ResidentGpuTileState,
  type ScheduledTileEviction,
  type ScheduledTileUpload,
  type ScrollResidencyScheduleInput,
  type ScrollResidencySchedulePlan,
  type TileUploadScheduleReason,
} from "./scroll-velocity-mipmap-residency-scheduler";
