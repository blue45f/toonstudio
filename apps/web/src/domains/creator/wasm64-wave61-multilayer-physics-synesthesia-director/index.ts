/**
 * Wasm64 Wave 61 공개 배럴 진입점 (`wasm64-wave61-multilayer-physics-synesthesia-director`).
 *
 * - `multilayer-secondary-physics-solver`: Verlet/XPBD 제약 솔버 기반 머리카락·망토·빗줄기·파편
 *   2.5D 2차 물리 시뮬레이터, 선화·채색·그림자 다층 변위 동기화 및 만화적 모션 스미어 폴리라인 생성기
 * - `synesthetic-scroll-audio-haptic-timeline`: 웹툰 컷 대사 감정·의성어(SFX)·장면 태그·스크롤 Y
 *   기반 Web Audio 앰비언스/폴리 크로스페이드·덕킹 및 모바일 햅틱 펄스 타임라인 엔진
 * - `mobile-panel-slicer-cultural-adapter`: 얼굴·말풍선 절단 금지 제약 기반 모바일 세로 자동 컷 분할기 및
 *   5개 문화권(`ko-KR | en-US | ja-JP | zh-TW | fr-FR`) 배경 소품 비파괴 치환 계획 엔진
 */

export {
  DEFAULT_GRAVITY_PX_PER_SEC2,
  DEFAULT_MULTI_LAYER_SYNC_CONFIG,
  createBallisticPhysicsNodes,
  createPhysicsChainNodes,
  generateComicMotionSmearStrokes,
  stepMultiLayerSecondaryPhysics,
  type CircularCollider2D,
  type ComicMotionSmearOptions,
  type ComicMotionSmearStroke,
  type ComicPhysicsLayerKind,
  type ComicSmearStylePreset,
  type LayerNodeDisplacement,
  type MotionSmearPolylinePoint,
  type MultiLayerPhysicsStepInput,
  type MultiLayerPhysicsStepResult,
  type MultiLayerSyncConfig,
  type NodeLayerCouplingOverride,
  type SecondaryPhysicsDiagnostics,
  type SecondaryPhysicsElementKind,
  type SecondaryPhysicsNode,
  type ShockwaveImpulse25D,
  type Vec3Px,
  type WindField25D,
  type XpbdDistanceConstraint,
} from "./multilayer-secondary-physics-solver";

export {
  buildSynestheticScrollTimeline,
  evaluateScrollAudioHapticFrame,
  type AmbienceStemSegment,
  type CutDialogueEmotion,
  type CutDialogueEntry,
  type CutSceneAmbienceTag,
  type CutSfxCueInput,
  type DialogueDuckingZone,
  type EvaluatedAmbienceStemState,
  type EvaluatedFoleyTriggerState,
  type EvaluatedHapticPulseState,
  type FoleyTriggerEvent,
  type HapticPulseEvent,
  type MobileHapticPatternKind,
  type ScrollAudioHapticFrameInput,
  type SynestheticPlaybackPreferences,
  type SynestheticScrollCutInput,
  type SynestheticScrollFrameResult,
  type SynestheticScrollTimeline,
  type SynestheticTimelineBuildOptions,
} from "./synesthetic-scroll-audio-haptic-timeline";

export {
  CULTURAL_LOCALE_PROFILES,
  planCulturalBackgroundAdaptation,
  slicePanelForMobileReading,
  type CulturalAdaptationInput,
  type CulturalAdaptationSummary,
  type CulturalBackgroundPropInput,
  type CulturalLocale,
  type CulturalPropAdaptationItem,
  type CulturalPropAdaptationPlan,
  type CulturalPropCategory,
  type CulturalPropTextPatch,
  type CulturalPropTransformPatch,
  type CulturalSeason,
  type MobilePanelSlice,
  type MobilePanelSliceInput,
  type MobilePanelSlicePlan,
  type MobileSliceIntegrityReport,
  type PanelReadingDirection,
  type PanelRect2D,
  type ProtectedPanelRegion,
  type ProtectedPanelRegionKind,
  type TrafficHandedness,
} from "./mobile-panel-slicer-cultural-adapter";
