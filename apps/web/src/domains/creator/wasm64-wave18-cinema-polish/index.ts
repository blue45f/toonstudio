/**
 * Wave 18 Cinema Polish 지연 로드 공개 진입점 (`wasm64-wave18-cinema-polish`).
 *
 * - `puddle-reflection-impact-crowd`: 임의 평면(`ax + by + c = 0`) 거울·유리창·빗물 웅덩이
 *   슐릭 프레넬 반사 + 동심원 빗방울 파문 워퍼, 고대비 흑백 타격 임팩트 프레임·비선형 스윙 호
 *   모션 스미어·감쇠 카메라 쉐이크 생성기, 브리드슨 포아송 디스크 원근 배경 군중 배치기
 * - `prosody-lettering-microscope-tvani`: 한글 음절 클러스터 보존 감정 운율 식자 셰이퍼,
 *   출고 전 1~3px 지우개 티끌·선화 밖 밑색 삐짐·반투명 흰 테두리 후광(Alpha Halo) 현미경 클리너,
 *   초소형 이진 벡터 애니메이션(`.tvani`) 코덱 및 교차 플랫폼 SHA-256 CAS 무손실 동기화 조정기
 *
 * 주의: 초기 번들 진입 그래프 영향 0B를 유지하도록 필요한 시점에만 지연 로드(on-demand)한다.
 */

export {
  ACTION_IMPACT_LABELS_KO,
  SURFACE_PRESET_LABELS_KO,
  computeSchlickFresnel,
  generateActionImpactFrame,
  generateDirectionalCameraShake,
  generateSwingArcMotionSmear,
  reflectPointAcrossPlane2D,
  scatterPerspectiveCrowdSilhouettes,
  warpPlanarFresnelReflection,
  type CameraShakeCurve,
  type CameraShakeKeyframe,
  type CameraShakeOptions,
  type CrowdExtraInstance,
  type ImpactFrameOptions,
  type ImpactFrameResult,
  type ImpactSpikeWedge,
  type MotionSmearResult,
  type PerspectiveCrowdOptions,
  type PerspectiveCrowdResult,
  type PlanarReflectionInput,
  type PlanarReflectionResult,
  type Point2D,
  type Polygon2D,
  type RaindropRippleSource,
  type ReflectionPlane2D,
  type ReflectionSurfacePreset,
  type SwingArcMotionSmearOptions,
} from "./puddle-reflection-impact-crowd";

export {
  MICROSCOPE_ANOMALY_LABELS_KO,
  PROSODY_LABELS_KO,
  TVANI_MAGIC_BYTES,
  buildCasAssetManifest,
  cleanStrayPixelsAndAlphaHalos,
  computeSha256Hex,
  decodeTvaniBinary,
  encodeTvaniBinary,
  measureTvaniCompressionRatio,
  reassembleCasAssetLossless,
  reconcileCasSyncPlan,
  segmentKoreanSyllableClusters,
  serializeLottieLikeJson,
  shapeExpressiveKoreanLettering,
  type BuildCasManifestInput,
  type CasAssetEntry,
  type CasAssetManifest,
  type CasChunkDescriptor,
  type CasPlatformKind,
  type CasRawAssetInput,
  type CasSyncReconciliationPlan,
  type KoreanSyllableCluster,
  type MicroscopeAnomaly,
  type MicroscopeAnomalyKind,
  type MicroscopeCleanReport,
  type MicroscopeCleanerOptions,
  type ProsodyEmotionTag,
  type ProsodyLetteringOptions,
  type ShapedGlyphCluster,
  type ShapedLetteringRun,
  type TvaniAnimationClip,
  type TvaniCompressionReport,
  type TvaniSplineEasing,
  type TvaniSplineKeyframe,
  type TvaniTrackProperty,
  type TvaniVectorTrack,
} from "./prosody-lettering-microscope-tvani";
