/**
 * Wasm64 Wave 36 공개 진입점 (`wasm64-wave36-gesture-autocolor-spatial-nav`).
 *
 * - `ergonomic-touch-pen-gesture-recognizer`: 손바닥 오터치 잠금(`stylusActiveWithinMs`),
 *   2손가락 실행 취소·3손가락 다시 실행·2손가락 이동/확대/회전 인식기 및 `>= 44px` 데드존·히스테리시스 8방향 원형 메뉴
 * - `intelligent-light-consistent-color-corrector`: 장면 주광원(방위각·고도각·색온도) 일관성 밑색 보정기,
 *   1단 셀 그림자·림라이트 자동 산출 및 피부 톤 색상각 편차 `<= 4°` 보호기
 * - `spatial-audio-gaze-canvas-navigator`: 펜 위치·속도·필압·종이 결 기반 스테레오 WebAudio 파라미터 산출기(즉시 음소거 보장) 및
 *   데드존·전정기관 멀미 방지 기반 컷 읽기 앵커 시선 내비게이터
 */

export {
  buildMotionSafeTransitionHint,
  DEFAULT_ANGULAR_HYSTERESIS_DEG,
  DEFAULT_PALM_CONTACT_RADIUS_PX,
  DEFAULT_RADIAL_HYSTERESIS_PX,
  DEFAULT_RADIAL_PIE_SECTORS,
  DEFAULT_STYLUS_LOCK_WINDOW_MS,
  DEFAULT_TAP_MAX_DURATION_MS,
  DEFAULT_TAP_MAX_MOVEMENT_PX,
  MIN_RADIAL_DEADZONE_RADIUS_PX,
  RADIAL_PIE_SECTOR_COUNT,
  recognizeStudioGestureChord,
  resolveRadialPieSector,
  type GesturePointerContact,
  type GesturePointerType,
  type MotionSafeTransitionHint,
  type PinchRotatePanTransform,
  type RadialPieQueryInput,
  type RadialPieResolution,
  type RadialPieSectorItem,
  type RadialSectorIndex,
  type StudioGestureChordInput,
  type StudioGestureChordKind,
  type StudioGestureChordResult,
} from "./ergonomic-touch-pen-gesture-recognizer";

export {
  computeRelativeLuminance,
  computeSrgbHueAndSpan,
  harmonizeCutFlatColorsToKeyLight,
  kelvinToLinearRgbTint,
  linearChannelToSrgb8,
  MAX_SKIN_TONE_HUE_DRIFT_DEG,
  NEUTRAL_DAYLIGHT_KELVIN,
  srgb8ToLinearChannel,
  type CutColorRegionKind,
  type CutFlatColorRegionInput,
  type CutLightHarmonizationReport,
  type HarmonizedCutRegionResult,
  type LinearRgbTint,
  type OklchColor,
  type SceneKeyLightConfig,
  type SrgbColor,
  type SurfaceDirectionAngles,
} from "./intelligent-light-consistent-color-corrector";

export {
  computeSpatialBrushAudioParams,
  DEFAULT_MAX_VESTIBULAR_PAN_SPEED_PX_PER_SEC,
  DEFAULT_MIN_ANCHOR_DWELL_MS,
  MAX_BRUSH_BANDPASS_HZ,
  MAX_SPATIAL_BRUSH_GAIN_LINEAR,
  MIN_BRUSH_BANDPASS_HZ,
  planGazeAssistedCanvasViewport,
  type CanvasViewportState,
  type GazeFocusSample,
  type GazeViewportPlanInput,
  type GazeViewportPlanResult,
  type GazeViewportTransitionMode,
  type PanelReadingAnchor,
  type SpatialBrushAudioInput,
  type SpatialBrushAudioParams,
} from "./spatial-audio-gaze-canvas-navigator";
