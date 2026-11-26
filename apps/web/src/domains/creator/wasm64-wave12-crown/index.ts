/**
 * Wasm64 Wave 12 Crown 연출·합성·메모리 가속 엔진 공개 진입점.
 *
 * - `axis180-speedline-balloon-fit`: 180도 연출 축 연속성 검증기, 1ms 미만 절차적 집중선·베타플래시·
 *   법선 정렬 교차 해칭 벡터 엔진, 다국어 번역 팽창 대응 이방성 말풍선 자동 맞춤 솔버
 * - `semantic-diff-gamut-mapper`: 오프라인 3-Way 레이어 트리·8-연결 픽셀 변경 영역 병합 검사기 및
 *   Display-P3 -> sRGB -> ISO-Coated CMYK(`TAC <= 300%`) 지각적 소프트-니 색역 매퍼
 * - `frustum-octree-layer-collision`: 뷰포트 프러스텀 외곽 무손실 8진트리 타일 동면기(0.5ms 미만 복원) 및
 *   `O(N log N)` Sweep-and-Prune + 협역 알파 마스크 충돌 가속기
 *
 * 주의: Studio 초기 진입 그래프에서 정적으로 import하지 않고 필요한 시점에만 지연 로드(on-demand)한다.
 */

export {
  analyzeActionAxisContinuity,
  fitSpeechBalloonForLocaleExpansion,
  generateBetaFlashFrame,
  generateNormalGuidedCrossHatching,
  generateRadialSpeedlines,
  LOCALE_SCRIPT_EXPANSION_FROM_KO,
  type ActionAxisContinuityInput,
  type ActionAxisContinuityReport,
  type ActionAxisViolation,
  type ActionCutEvaluation,
  type ActionCutShot,
  type ActionGroundPlane,
  type AnisotropicBalloonFitInput,
  type AnisotropicBalloonFitResult,
  type BalloonLocalizationLocale,
  type BalloonShapeKind,
  type BetaFlashFrameOptions,
  type CameraAxisSide,
  type CameraCorrectionSuggestion,
  type CrossHatchOptions,
  type KeepOutBox,
  type Point2D,
  type ProceduralEffectVectorBatch,
  type RadialSpeedlineOptions,
  type Rect2D,
  type ShadeNormalGrid,
  type SpeechBalloonGeometry,
  type TaperedVectorPolyline,
  type Vec3Point,
  type VectorStrokeSample,
} from "./axis180-speedline-balloon-fit";

export {
  extractDirtyConnectedComponents,
  inspectThreeWayManuscriptDiff,
  linearDisplayP3ToXyzD65,
  mapDisplayP3BufferGamut,
  mapDisplayP3ColorGamut,
  type BufferGamutMapReport,
  type CieXyzColor,
  type CmykSample,
  type DirtyRegionBox,
  type GamutMappingOptions,
  type LayerBlendMode,
  type LayerPropertyField,
  type LayerRasterBuffer,
  type LayerThreeWayDiffSummary,
  type LayerTransform2D,
  type ManuscriptLayerSnapshot,
  type ManuscriptRevisionSnapshot,
  type MergedPropertyChange,
  type OklchColor,
  type SingleColorGamutMapResult,
  type StructuralPropertyConflict,
  type TargetColorGamut,
  type ThreeWayDiffOptions,
  type ThreeWayManuscriptDiffReport,
  type TransferFunctionKind,
  type VisualConflictRegion,
} from "./semantic-diff-gamut-mapper";

export {
  compressTileRgbaLossless,
  computeFnv1a32,
  decompressTileRgbaLossless,
  detectLayerCollisionsSweepAndPrune,
  LosslessOctreeTileHibernator,
  type Aabb3D,
  type CollidableLayerKind,
  type CollidableStudioLayer,
  type FrustumHibernationUpdateReport,
  type HibernatedTilePacket,
  type LayerCollisionContactBox,
  type LayerCollisionPair,
  type LayerCollisionReport,
  type LosslessTileCodecMode,
  type OctreeCanvasTileInput,
  type OctreeTileHibernatorOptions,
  type TileResidencySnapshot,
} from "./frustum-octree-layer-collision";
