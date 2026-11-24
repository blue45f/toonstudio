export { StudioCameraLensBlockingPanel } from "./StudioCameraLensBlockingPanel";
export type { StudioCameraLensBlockingPanelProps } from "./StudioCameraLensBlockingPanel";

export {
  CAMERA_BLOCKING_PRESETS,
  CINEMA_FOCAL_LENGTHS,
  FULL_FRAME_SENSOR_HEIGHT_MM,
  FULL_FRAME_SENSOR_WIDTH_MM,
  LENS_CHARACTER_KO,
  SHOT_SIZE_LABELS_KO,
  analyzeCameraBlocking,
  autoFixAxisViolations,
  classifyAxisSide,
  classifyShotSize,
  computeDutchTensionScore,
  computeHorizontalFovDeg,
  computeLineOfAction,
  computeSignedAxisDistanceM,
  computeVerticalFovDeg,
  exportThreeJsCameraRig,
  findCameraBlockingPresetById,
  mirrorCameraAcrossAxis,
  serializeThreeJsCameraRig,
} from "./camera-lens-blocking-engine";

export type {
  AxisLineOfAction,
  AxisSide,
  AxisViolation,
  BlockingDirectorReport,
  BlockingScenePreset,
  BlockingViolationKind,
  CameraCutSpec,
  CinemaFocalLengthMm,
  CutOpticalAnalysis,
  EyelineMatchQuality,
  ShotSizeCode,
  StageActor,
  ThreeJsCameraRigExport,
  ThreeJsPerspectiveCameraRigEntry,
  Vec3,
} from "./types";
