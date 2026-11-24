/**
 * 가상 스튜디오 3D HRTF 바이노럴 공간 음향 스테이지 · 공간 컴퓨팅 데스크 배럴 모듈.
 */

export {
  ACOUSTIC_ZONE_LIST,
  ACOUSTIC_ZONE_PROFILES,
  ACTIVITY_LABEL_KO,
  STUDIO_STAGE_BOUNDS,
  clampNumber,
  computeInverseSquareAttenuation,
  computeListenerBasis,
  computeSabineRt60Sec,
  createDefaultListenerState,
  createDefaultPeerSources,
  createDefaultStudioWalls,
  dbToLinearGain,
  evaluateAcousticStageMix,
  evaluatePeerSpatialAudio,
  evaluateWallOcclusion,
  formatStereoPanKo,
  linearGainToDb,
  segmentsIntersect2D,
  type AcousticStageMixReport,
  type AcousticStageOptions,
  type AcousticWallSegment,
  type AcousticZoneId,
  type AcousticZoneProfile,
  type HrtfSpatialEvaluation,
  type PeerAcousticActivity,
  type SpatialListenerState,
  type SpatialPeerAudioSource,
  type SpatialPoint2D,
  type SpatialVec3,
  type WallMaterialId,
} from "./spatial-binaural-stage";

export {
  SpatialBinauralAudioGraph,
  createSafeSpatialAudioGraph,
  type PeerAudioChannelSnapshot,
  type SpatialAudioContextLike,
  type SpatialAudioGraphSnapshot,
  type SpatialAudioListenerLike,
  type SpatialAudioNodeLike,
  type SpatialAudioParamLike,
  type SpatialBiquadFilterNodeLike,
  type SpatialGainNodeLike,
  type SpatialPannerNodeLike,
} from "./spatial-binaural-graph";

export {
  CUT_STAGE_LABEL_KO,
  CUT_STAGE_ORDER,
  STICKER_CATEGORY_LABEL_KO,
  SpatialDeskCrdtStateMachine,
  computeLightboxCutPose,
  createDefaultSpatialDeskMachine,
  probeSpatialComputingRuntime,
  type FeedbackStickerCategory,
  type FloatingLightboxCut,
  type LightboxCutStage,
  type LightboxLayoutMode,
  type PeerSpatialPointerState,
  type SpatialCutPose,
  type SpatialDeskOperation,
  type SpatialDeskSnapshot,
  type SpatialFeedbackSticker,
  type SpatialRuntimeCapability,
  type SpatialRuntimeMode,
} from "./spatial-computing-desk";

export {
  SpatialAcousticMapSvg,
  type SpatialAcousticMapSvgProps,
} from "./SpatialAcousticMapSvg";

export {
  SpatialLightboxDeskSection,
  type SpatialLightboxDeskSectionProps,
} from "./SpatialLightboxDeskSection";

export {
  StudioSpatialStagePanel,
  type StudioSpatialStagePanelProps,
} from "./StudioSpatialStagePanel";
