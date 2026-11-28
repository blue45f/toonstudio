/**
 * Wave 145 — 웹툰·모션툰 액션 컷 타격 임팩트 프레임(Hit-Stop) · 잔상(Smear/Afterimage) &
 * 모션 궤적 호(Motion Arc) 타이밍 합성 솔버 공개 배럴.
 */

export {
  canonicalizeActionJson,
  computeActionManifestSha256Hex,
  encodeActionUtf8Bytes,
  sha256ActionBytesHex,
  sha256ActionUtf8Hex,
} from "./action-impact-sha256";

export {
  buildActionMotionArc,
  computeVolumePreservingSquashStretch,
  generateAfterimageGhosts,
  generateSmearFanPolygon,
  sampleActionMotionArcAt,
} from "./motion-arc-and-smear-geometry";

export type {
  ActionCurveKind,
  ActionMotionArcInput,
  ActionMotionArcResult,
  ActionPoint2D,
  ActionWeaponProfile,
  AfterimageGhost,
  AfterimageGhostOptions,
  AfterimageGhostSetResult,
  MotionArcSample,
  SmearFanOptions,
  SmearFanPolygonResult,
  SquashStretchInput,
  SquashStretchPhaseMode,
  SquashStretchResult,
} from "./motion-arc-and-smear-geometry";

export {
  CAMERA_SHAKE_CONVERGENCE_THRESHOLD_PX,
  WCAG_MAX_IMPACT_FLASH_RATE_HZ,
  compileActionImpactSequence,
  synthesizeImpactCameraShake,
} from "./hitstop-timing-and-impact-solver";

export type {
  ActionImpactSequenceInput,
  ActionImpactSequenceResult,
  ActionImpactTier,
  ActionPhaseFrameCounts,
  ActionSafetyGuardReport,
  ActionTimelineFrame,
  CameraShakeSample,
  ImpactCameraShakeInput,
  ImpactCameraShakeResult,
  ImpactFrameFlashMode,
  ImpactFramePhase,
} from "./hitstop-timing-and-impact-solver";

export {
  buildActionSmearImpactWgsl,
  validateActionSmearImpactWgsl,
} from "./action-smear-impact-wgsl";

export type {
  ActionSmearImpactWgslArtifact,
  ActionSmearImpactWgslOptions,
  ActionSmearWgslBindingDescriptor,
  ActionSmearWgslTier,
  ActionSmearWgslValidationReport,
} from "./action-smear-impact-wgsl";

export {
  escapeActionXml,
  renderActionImpactStoryboardSvg,
  summarizeActionImpactSequenceKo,
} from "./action-impact-svg-and-report";

export type {
  ActionDirectorQaReportKo,
  ActionStoryboardSvgOptions,
  ActionStoryboardSvgTheme,
} from "./action-impact-svg-and-report";
