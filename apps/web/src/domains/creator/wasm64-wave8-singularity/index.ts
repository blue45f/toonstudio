/**
 * Wave 8 Singularity 지연 로드(0B Eager Impact) 공개 진입점 (전 기능 ₩0 로컬 연산).
 *
 * - `arap-normal-flash-safety`: ARAP 삼각 메쉬 포즈 모핑 솔버, ITU-R BT.1702 / Harding 광과민성
 *   점멸 안전 감사·자동 감쇠 곡선, 윤곽선 기반 푸아송(Poisson/SOR) 2D→3D 노말맵 및 역광 림라이트 추정기
 * - `glyph-subset-dp-spacetime`: 실시간 한글·문장부호 글리프 서브셋터(`TSGF`), 로컬 ε-차분 프라이버시
 *   창작 텔레메트리 분석기, 시공간 HLC + 벡터 시계 CRDT 컨티뉴엄 엔진
 * - `noisegate-octree-voiceface-royalty`: 구조 보존 스캔 선화 노이즈 게이트, 기가픽셀 무한 희소 모턴
 *   옥트리/쿼드트리 프러스텀 인덱서(`BigInt(...)`), 온디바이스 음성→52-VRM 표정 애니메이터,
 *   무가스(₩0) SHA-256 + WebCrypto ECDSA 10,000 bps 공동 창작 로열티 분배 매니페스트 주입·검증기
 *
 * 주의: Studio 초기 진입 그래프에서 정적 import하지 않고 기능 활성화 시점에만 지연 로드한다.
 */

export {
  applyFlashMitigationToFrames,
  auditPhotosensitiveFlashSafety,
  computeMeshTotalArea,
  estimateContourNormalAndRimLight,
  morphArapPoseKeyframes,
  solveArapMeshDeformation,
  type ArapDeformationInput,
  type ArapDeformationResult,
  type ArapKeyframeMorphInput,
  type ArapKeyframeMorphResult,
  type ArapPinConstraint,
  type ArapWeightMode,
  type ContourInputMode,
  type ContourNormalEstimateInput,
  type ContourNormalEstimateResult,
  type FlashAuditFrameInput,
  type FlashAuditOptions,
  type FlashHazardInterval,
  type FlashHazardKind,
  type FlashSafetyAuditReport,
  type TriangleTuple,
  type Vec2Tuple,
  type Vec3Tuple,
} from "./arap-normal-flash-safety";

export {
  classifyGlyphCodePoint,
  compareHlcTimestamps,
  compareVectorClocks,
  decomposeHangulSyllable,
  DEFAULT_FULL_CJK_HANGUL_FONT_BYTES,
  DEFAULT_FULL_CJK_HANGUL_FONT_GLYPHS,
  estimateDebiasedRandomizedFrequencies,
  LocalDpCreatorTelemetryAnalyzer,
  lookupSubsetGlyphIdBinary,
  sampleCalibratedLaplace,
  SpacetimeContinuumEngine,
  subsetEpisodeDialogueGlyphs,
  type CausalOrderRelation,
  type ConcurrentBranchPair,
  type ContinuumReplaySnapshot,
  type ContinuumStrokePayload,
  type DpQueryLedgerEntry,
  type FontGlyphCatalog,
  type GlyphSubsetResult,
  type GlyphUnicodeCategory,
  type HangulJamoDecomposition,
  type HybridLogicalTimestamp,
  type LaplaceHistogramInput,
  type LaplaceHistogramResult,
  type MaterializedContinuumStroke,
  type RandomizedResponseResult,
  type SpacetimeStrokeOperation,
  type StrokePointSample,
  type SubsetCmapEntry,
  type UniformRandomSource,
  type VectorClockMap,
} from "./glyph-subset-dp-spacetime";

export {
  ARKIT_52_BLENDSHAPE_NAMES,
  calculateBasisPointPayouts,
  decodeMorton2D,
  decodeMorton3D,
  denoiseScanLineArt,
  encodeMorton2D,
  encodeMorton3D,
  generateRoyaltySigningKeyPair,
  injectRoyaltySplitManifest,
  SparseMortonTileIndexer,
  TOTAL_ROYALTY_BASIS_POINTS,
  verifyEmbeddedRoyaltyManifest,
  VoiceToVrmExpressionAnimator,
  type Arkit52BlendshapeName,
  type AxisAlignedBox3D,
  type FrustumPlane3D,
  type FrustumTileQueryResult,
  type RoyaltyLicenseTerms,
  type RoyaltyManifestVerificationResult,
  type RoyaltyRecipientShare,
  type RoyaltySplitManifestInput,
  type ScanLineArtNoiseGateInput,
  type ScanLineArtNoiseGateResult,
  type SignedRoyaltyManifestPayload,
  type SpatialTileRecord,
  type ViewportRect2D,
  type VoiceExpressionFrameResult,
  type VrmVisemeExpressionWeights,
} from "./noisegate-octree-voiceface-royalty";
