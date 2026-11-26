/**
 * Wasm64 Wave 7 소버린 크리에이터 엔진 공개 진입점.
 *
 * - `biomech-joint-ransac-perspective`: 해부학 스윙-트위스트 쿼터니언 관절 한계 가드 및
 *   결정론적 RANSAC 1·2·3점 투시 소실점·지평선·가이드 자(Ruler) 추정기
 * - `kalman-stylus-semantic-archiver`: 6상태 등가속도 칼만-에르미트(`4..8ms`) 무지연 스타일러스 예측기 및
 *   시맨틱 레이어 인지(선화·밑색·명암) 비트 단위 무손실 원고 아카이버
 * - `bvh-colorize-lod-cosign`: 궤적·SSE 예측형 Auto-LOD 에셋 캐시, 공간 BVH 광선 차폐 +
 *   엣지-스토핑 조화 자동 채색기, M-of-N 오프라인 WebCrypto 공동 서명 출고 게이트
 *
 * 주의: Studio 초기 진입 그래프에 정적 포함하지 않고, 해당 기능 호출 시 지연 로드(on-demand)한다.
 */

export {
  ANATOMICAL_JOINT_LIMITS,
  decomposeSwingTwist,
  estimatePerspectiveVanishingPointsRansac,
  guardJointPoseQuaternion,
  guardSkeletonPoseBatch,
  multiplyQuaternions,
  normalizeCanonicalQuaternion,
  rotateVec3ByQuaternion,
  type BiomechJointId,
  type EstimatedVanishingPoint,
  type HorizonLineModel,
  type JointLimitSpec,
  type JointPoseGuardResult,
  type PerspectiveEstimateOptions,
  type PerspectiveEstimationReport,
  type PerspectiveModeKind,
  type QuatTuple,
  type SkeletonJointPoseInput,
  type SkeletonPoseBatchResult,
  type SketchLineSegment,
  type SnappedPerspectiveRulerSegment,
  type SwingTwistDecomposition,
  type Vec2Tuple,
  type Vec3Tuple,
} from "./biomech-joint-ransac-perspective";

export {
  archiveManuscriptLayers,
  classifyManuscriptLayer,
  KalmanHermiteStylusPredictor,
  restoreManuscriptArchive,
  type ArchivedLayerSummary,
  type KalmanPredictionFrame,
  type KalmanStylusPredictorOptions,
  type ManuscriptArchiveResult,
  type ManuscriptLayerInput,
  type ManuscriptLayerSemanticKind,
  type RestoredManuscriptLayer,
  type StrokeFinalizationSummary,
  type StylusRawSample,
  type StylusStrokePoint,
} from "./kalman-stylus-semantic-archiver";

export {
  autoColorizeHarmonicBvh,
  computeCanonicalManifestSha256Hex,
  generateStudioCosignerKeyPair,
  PredictiveAutoLodAssetCache,
  signManuscriptReleaseManifest,
  SpatialOccluderBvh,
  verifyThresholdManuscriptRelease,
  type AuthorizedCosignerKey,
  type BvhOccluderPrimitive,
  type ColorScribbleSeed,
  type CosignatureReceipt,
  type CosignRejectionReason,
  type CosignReleaseGateReport,
  type GeneratedStudioCosigner,
  type HarmonicAutoColorizeInput,
  type HarmonicAutoColorizeResult,
  type LodLevel,
  type LodPrefetchTask,
  type ManuscriptReleaseManifest,
  type PredictiveAssetDescriptor,
  type PredictiveLodPlanReport,
  type RejectedCosignature,
  type RgbTuple,
  type StudioCosignRole,
  type Vec3,
  type ViewportTrajectoryState,
} from "./bvh-colorize-lod-cosign";
