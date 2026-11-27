/**
 * Wasm64 Wave 34 공개 진입점 (`wasm64-wave34-multimodal-style-gapfill-eyeflow`).
 *
 * - `multimodal-style-transfer-lut-baker`: OKLab 색공간 기반 실시간 에피소드 레퍼런스 스타일 전이 3D LUT,
 *   Reinhard + Monge-Kantorovich 색도 공분산 전이, 먹선 휘도 보존, 3단 셀 셰이딩 램프 및 삼선형 보간
 * - `semantic-asset-tagger-gapfill-flood`: 유클리드 거리장 기반 형태학적 틈새 닫기(`maxGapPx`) 채우기 및
 *   치수·종횡비·색온도·투명도·한영 어간 기반 결정론적 멀티모달 에셋 자동 태거
 * - `vertical-scroll-saliency-pacing-coach`: 모바일 뷰포트(`390x844`) 독자 도약 시선 동선, 역방향 읽기 위반,
 *   화면당 인지 과부하(`> 3` 말풍선·과다 대사·인물 밀집) 및 서사 비트별 최적 세로 여백 추천 코치
 */

export {
  DEFAULT_LINEART_FEATHER_BAND,
  DEFAULT_LINEART_MAX_LUMINANCE,
  DEFAULT_LUT_GRID_SIZE,
  applyEpisodeStyleTransfer,
  bakeStyleTransferLut3D,
  computeOklabChannelStats,
  extractCelShadingRamp,
  linearChannelToSrgb,
  oklabToSrgb,
  quantizeColorToCelRamp,
  sampleStyleLut3D,
  srgbChannelToLinear,
  srgbToOklab,
  transferOklabColor,
  type CelShadingRamp,
  type EpisodeStyleTransferResult,
  type OklabChannelStats,
  type OklabColor,
  type SrgbColor,
  type StyleLut3D,
  type StyleTransferBakeOptions,
} from "./multimodal-style-transfer-lut-baker";

export {
  computeSquaredDistanceTransform,
  floodFillWithGapClosing,
  inferStudioAssetSemanticTags,
  type AssetAspectProfile,
  type AssetColorTemperature,
  type AssetTransparencyClass,
  type GapClosingFloodFillInput,
  type GapClosingFloodFillResult,
  type StudioAssetCategory,
  type StudioAssetDimensions3D,
  type StudioAssetMultimodalInput,
  type StudioAssetSemanticTagResult,
} from "./semantic-asset-tagger-gapfill-flood";

export {
  DEFAULT_MAX_BALLOONS_PER_SCREENFUL,
  DEFAULT_MAX_CHARACTERS_PER_SCREENFUL,
  DEFAULT_MAX_FOCAL_ANCHORS_PER_SCREENFUL,
  DEFAULT_MOBILE_SCROLL_VIEWPORT,
  analyzeEpisodeScrollPacing,
  detectReverseReadingViolations,
  recommendPanelGutterHeightPx,
  type ActionMotionVector,
  type CharacterFocalAnchor,
  type CognitiveOverloadReason,
  type EpisodeScrollPacingInput,
  type EpisodeScrollPacingReport,
  type EpisodeScrollPanel,
  type GutterPacingIssue,
  type MobileScrollViewport,
  type NarrativeBeatKind,
  type PanelGutterRecommendation,
  type ReverseReadingViolation,
  type ReverseReadingViolationKind,
  type SaccadeTransition,
  type SaccadeWaypoint,
  type SaccadeWaypointKind,
  type ScreenfulOverloadDiagnostic,
  type SpeechBalloonNode,
} from "./vertical-scroll-saliency-pacing-coach";
