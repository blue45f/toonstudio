/**
 * 웹툰 컷 리듬 -> 2.5D 무빙툰 & 15초/30초 프로모 자동 연출기 공개 모듈 진입점.
 */

export {
  StudioCutRhythmPromoDirectorPanel,
  type StudioCutRhythmPromoDirectorPanelProps,
} from "./StudioCutRhythmPromoDirectorPanel";

export {
  BGM_SECTION_LABELS_KO,
  BUILTIN_STORYBOARD_PRESETS,
  DEFAULT_PARALLAX_SPEEDS,
  MAX_RECOMMENDED_BPM,
  MIN_RECOMMENDED_BPM,
  NARRATIVE_BEAT_LABELS_KO,
  SFX_MARKER_LABELS_KO,
  analyzeWebtoonCutRhythm,
  buildRemotionPromoManifest,
  createAudioCueIndex,
  createPresetEntriesIndex,
  directWebtoonPromo,
  evaluateCubicBezier,
  evaluateParallaxCameraAtFrame,
  generateAudioCueSheet,
  generateParallaxCameraKeyframes,
  serializeRemotionPromoManifest,
} from "./cut-rhythm-promo-engine";

export {
  renderParallaxStageCanvas,
  resolveCanvasSemanticPalette,
  type RenderParallaxStageParams,
} from "./parallax-stage-renderer";

export type {
  AnalyzedWebtoonCut,
  AudioCueLookupIndex,
  AudioCueSheet,
  BgMotifKind,
  BgmSectionKind,
  BgmTransitionCue,
  CameraKeyframePhase,
  CubicBezierTuple,
  CutDepthPlaneDescriptor,
  CutFocusPoint,
  CutParallaxTrack,
  CutRhythmAnalysisReport,
  CutToneToken,
  DirectPromoPipelineOptions,
  DirectedWebtoonPromoPlan,
  EasingPresetName,
  EpisodeStoryboardPreset,
  EvaluatedParallaxPose,
  FgAccentKind,
  MgSubjectKind,
  NarrativeBeat,
  ParallaxCameraKeyframe,
  ParallaxDirectorOptions,
  ParallaxLayerSpeeds,
  PlaneTransformOffset,
  PromoAspectPreset,
  PromoDurationSec,
  PromoFps,
  RemotionManifestOptions,
  RemotionPromoManifest,
  RemotionSequenceSpec,
  RhythmAnalysisOptions,
  SfxCueMarker,
  SfxMarkerKind,
  WebtoonCutInput,
} from "./types";
