/**
 * Wave-4 HyperCore 지연 로드 진입점 (`wasm64-wave4-hypercore`, 초기 Eager 번들 영향 0B).
 *
 * - `webgpu-llm-vram-pager`: WGSL INT4/NF4 서브그룹·타일 MatMul 튜너 + 1.5~2.0 GiB 상한 PagedAttention KV 페이저
 * - `p2p-bft-timestamp-audit`: `3f + 1` 비잔틴 결함 감내 상태 검증기 + ₩0 WebCrypto 해시체인·머클 에포크 감사 원장
 * - `wasm-worker-slab-pool`: 비동기 WASM 워커 풀(Work-Stealing·배압·장애 교체) + 2의 거듭제곱 슬랩 아레나 + 제로카피 IPC 링
 * - `webgpu-webaudio-sab-sync`: SAB 제로카피 WebGPU↔WebAudio PLL 브리지 + 온디바이스 Ridge 회귀 WGSL 프리워밍 캐시
 * - `spline-edge-subpixel-preview`: Catmull-Rom/모폴로지 스플라인 최적화기 + ₩0 정적 타일 프리페치 + 4× RGSS·LCD RGB 선화 커널
 * - `webrtc-delta-and-zk-ownership`: WebRTC SCTP XOR-RLE 델타·벡터 클록 조정기 + Fiat-Shamir Schnorr 영지식 소유권 증명
 * - `ci-smart-shard-scheduler`: 필수 게이트(`core`+`verify`) 보존 변경 파일 경로 필터 + Graham LPT 샤드 분산기
 * - `hybrid-compute-shadow-ink-meshlet`: 이기종 DAG 스케줄러 + AEAD 스트림 검증기 + Split CSM + 모세관 잉크·입자 솔버 + 컴퓨트 메시렛
 */

export {
  NF4_CODEBOOK,
  TOKENS_PER_KV_PAGE,
  WebGpuVramKvPager,
  createInMemoryKvBackingPool,
  dequantizeWeightBlock32,
  executeQuantizedMatMulReference,
  quantizeWeightBlock32,
  tuneWebGpuLlmMatMulPipeline,
  type KvPageBackingPoolPort,
  type KvSwappedPageBlob,
  type LlmWeightQuantFormat,
  type LogicalKvPageEntry,
  type QuantizedBlock32,
  type TunedMatMulPipelineDescriptor,
  type VramKvPagerConfig,
  type VramKvPagerTelemetry,
  type WebGpuLlmAdapterLimits,
} from "./webgpu-llm-vram-pager";

export {
  P2pBftStateValidator,
  ZeroFeeTimestampAuditLog,
  generateCreatorAuditIdentity,
  sha256Hex,
  verifyAuditReceiptOffline,
  type AuditSignatureAlgorithm,
  type BftEquivocationEvidence,
  type BftPeerAttestation,
  type BftValidationDecision,
  type BftValidatorMetrics,
  type CreatorAuditIdentity,
  type MerkleEpochBundle,
  type MerkleSiblingStep,
  type OfflineTimestampProofReceipt,
  type OfflineVerificationResult,
  type TimestampAuditEntry,
} from "./p2p-bft-timestamp-audit";

export {
  PowerOfTwoSlabArena,
  SLAB_SIZE_CLASSES,
  WasmRendererWorkerPool,
  ZeroCopyIpcRingChannel,
  type IpcRingDescriptor,
  type RenderTileTaskInput,
  type RenderTileTaskResult,
  type SlabAllocationHandle,
  type SlabArenaTelemetry,
  type WasmRenderWorkerInstanceLike,
  type WasmWorkerPoolConfig,
  type WasmWorkerPoolTelemetry,
  type WorkerTaskPriority,
} from "./wasm-worker-slab-pool";

export {
  OnDeviceShaderPrewarmer,
  WebGpuWebAudioSabSyncBridge,
  extractWgslComplexityFeatures,
  type CompiledShaderHandle,
  type GpuFramePhaseSnapshot,
  type PrewarmSliceReport,
  type SabAudioGpuSyncConfig,
  type ShaderCandidateSpec,
  type ShaderPrewarmerMetrics,
  type WgslComplexityFeatures,
} from "./webgpu-webaudio-sab-sync";

export {
  RGSS_4X_OFFSETS,
  buildStaticEdgeTileManifest,
  evaluateCentripetalCatmullRom,
  optimizeMorphologicalSplineAsset,
  planStaticEdgeTilePrefetch,
  renderSubpixelRgssLineArtPreview,
  type LineSegmentStroke,
  type OptimizedSplineAsset,
  type PlannedTilePrefetch,
  type SplineSamplePoint,
  type StaticEdgeTileEntry,
  type StaticEdgeTileManifest,
  type SubpixelLinePreviewResult,
  type ViewportPrefetchState,
} from "./spline-edge-subpixel-preview";

export {
  SctpDeltaReassembler,
  chunkDeltaForSctpChannel,
  compareVectorClocks,
  coordinateEdgeVectorClockConflict,
  createZkManuscriptCommitment,
  decodeBinaryXorRleDelta,
  encodeBinaryXorRleDelta,
  modPowBigInt,
  proveZkManuscriptOwnership,
  tickVectorClock,
  verifyZkManuscriptOwnership,
  type ConflictResolutionOutcome,
  type SctpDeltaEnvelope,
  type VectorClockMap,
  type VectorClockRelation,
  type VectorClockReplicaUpdate,
  type ZkManuscriptOwnershipProof,
  type ZkManuscriptPublicCommitment,
} from "./webrtc-delta-and-zk-ownership";

export {
  DEFAULT_CI_WORKFLOW_CATALOG,
  MANDATORY_RELEASE_GATES,
  balanceSuitesLpt,
  buildSmartCiSchedulePlan,
  classifyChangedFileNode,
  propagateImpactedPackages,
  type CiOptionalWorkflowId,
  type CiShardBucket,
  type CiSmartSchedulePlan,
  type CiTestSuiteTiming,
  type CiWorkflowId,
  type CiWorkflowSpec,
  type MandatoryReleaseGateId,
} from "./ci-smart-shard-scheduler";

export {
  ChunkAuthenticatedAssetStreamVerifier,
  SplitCsmDirtyTileCache,
  WGSL_MESHLET_DISPLACEMENT_COMPUTE,
  encryptAssetIntoAuthenticatedChunks,
  scheduleHeterogeneousComputeDag,
  stepCapillaryInkBleed,
  stepSpatialHashParticles,
  subdivideAndDisplaceMeshlets,
  type AssetStreamSealManifest,
  type AuthenticatedAssetChunkPacket,
  type CapillaryInkGridState,
  type ComputeBackendTarget,
  type CsmCascadeSlice,
  type CsmFrameUpdatePlan,
  type DisplacedMeshletOutput,
  type HeterogeneousDagNode,
  type HeterogeneousDagSchedule,
  type HeterogeneousHardwareProfile,
  type MovingBoneBounds,
  type ScheduledDagTask,
  type SpatialParticle3D,
  type SubdividedMeshletCluster,
  type VerifiedChunkStagePort,
} from "./hybrid-compute-shadow-ink-meshlet";
