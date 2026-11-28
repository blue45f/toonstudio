/**
 * Wasm64 Wave 69 공개 배럴 진입점 (`wasm64-wave69-motion-toon-animatic-director`).
 *
 * - `parallax-25d-camera-choreographer`: See-Through 분리 다층 2.5D 웹툰 컷의 9:16·16:9·1:1 60fps
 *   카메라 워킹(dolly-in / ken-burns-pan / dramatic-rack-focus / whip-reveal / breath-idle),
 *   원근 시차 변위, 피사계 심도(DoF) 및 0px 검은 여백 보장 오버스캔 안전 경계 해석기
 * - `beat-synced-animatic-sequencer`: BPM 비트 그리드 동기화 컷 전환, 말풍선 팝인/타자기 리빌,
 *   2차 모션 위상(머리카락·망토·카메라 쉐이크 감쇠) 및 `prefersReducedMotion` 저자극 대안 시퀀서
 * - `optical-flow-frame-interpolator`: 12fps/24fps -> 60fps 블록 매칭 옵티컬 플로 + 양방향 차폐 인지
 *   워핑 보간 엔진 및 유튜브 쇼츠·틱톡·인스타그램 릴스 60fps 출고 매니페스트 빌더
 */

export {
  DEFAULT_CAMERA_OPTICS_25D,
  DEFAULT_LAYER_DEPTH_Z_METERS,
  SHORTFORM_VIEWPORT_PRESETS,
  computeLayerDofBlurRadiusPx,
  computeOverscanSafeCropEnvelope,
  evaluateParallax25dFrameTransforms,
  measureLayerBlackBorderExposurePx,
  resolveShortformViewport,
  sampleCameraChoreographyPose,
  type CameraChoreographyMode,
  type CameraChoreographyPlan,
  type CameraFocusAnchor,
  type CameraOptics25dSpec,
  type CameraPoseAtFrame,
  type EvaluateParallax25dFrameInput,
  type LayerParallaxFrameTransform,
  type OverscanCropSafetyReport,
  type Parallax25dFrameEvaluation,
  type Parallax25dLayerRole,
  type Parallax25dLayerSpec,
  type SafeTitleInsetPx,
  type ShortformAspectPreset,
  type ShortformViewportSpec,
} from "./parallax-25d-camera-choreographer";

export {
  compileMotionToonAnimaticTimeline,
  sampleAnimaticTimelineAtTimeMs,
  type AnimaticCutScriptInput,
  type AnimaticDialogueCueInput,
  type AnimaticEmotionTag,
  type AnimaticSequenceCompileInput,
  type AnimaticSfxCueInput,
  type AnimaticTransitionKind,
  type BalloonRevealStyle,
  type BeatGridMarker,
  type CompiledAnimaticCut,
  type CompiledAnimaticTimeline,
  type CompiledBalloonCue,
  type CompiledSecondaryMotionSpec,
  type CompiledSfxCue,
  type SampledAnimaticFrameState,
  type SampledBalloonState,
  type SampledCameraShakeState,
  type SampledSecondaryMotionState,
  type SampledTransitionState,
  type SecondaryMotionElementInput,
  type SecondaryMotionKind,
} from "./beat-synced-animatic-sequencer";

export {
  SHORTFORM_PLATFORM_SPECS,
  buildShortformExportManifest,
  estimateBlockOpticalFlow,
  interpolateMotionToonFrameRgba,
  planKeyframeTo60fpsInterpolationSchedule,
  upsampleKeyframeSequenceTo60fps,
  type BlockMotionVector,
  type BlockOpticalFlowField,
  type BlockOpticalFlowOptions,
  type BuildShortformExportManifestInput,
  type InterpolatedMotionToonFrameResult,
  type KeyframeInterpolationSlot,
  type RgbaImageFrame,
  type ShortformExportManifest,
  type ShortformExportPlatform,
  type ShortformPlatformSpec,
  type ShortformPlatformValidationResult,
  type ShortformValidationIssue,
} from "./optical-flow-frame-interpolator";
