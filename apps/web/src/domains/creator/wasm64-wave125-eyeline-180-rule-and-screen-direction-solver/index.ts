/**
 * Wasm64 Wave 125 공개 배럴 진입점 (`wasm64-wave125-eyeline-180-rule-and-screen-direction-solver`).
 *
 * - `eyeline-180-rule-types`: 3D 스테이지 대화·추격 컷 스키마, 상수, 순수 ES2017 FIPS 180-4 SHA-256
 * - `eyeline-180-geometry`: 2D/3D XZ 외적, 대칭 반사, 시선 피치, 화면 방향 투영, SHA-256 블로킹 지문
 * - `eyeline-180-rule-solver`: 180도 액션 축·시선 매치·추격 방향 감사기 및 자동 교정 솔버
 * - `eyeline-180-svg-and-report`: 인쇄 안전 순수 OKLCH 탑다운 액션 축 평면도 SVG 및 한국어 연출 감독 브리프
 */

export {
  CAMERA_SHOT_KIND_LABELS_KO,
  DEFAULT_AXIS_ON_LINE_TOLERANCE_M,
  DEFAULT_EYELINE_PITCH_TOLERANCE_DEG,
  DEFAULT_FRONT_FACING_DEADZONE_DEG,
  GEOMETRY_EPSILON,
  LEGAL_AXIS_BRIDGE_SHOT_KINDS,
  MOTION_DIRECTION_LABELS_KO,
  SCREEN_FACING_LABELS_KO,
  VIOLATION_KIND_LABELS_KO,
  canonicalizeBlockingJson,
  isLegalAxisBridgeShot,
  sha256EyelineHex,
  type AuditEyeline180Options,
  type AxisGeometrySummary,
  type CameraBlockingFixActionKind,
  type CameraBlockingFixRecord,
  type CameraCutSpec,
  type CameraShotKind,
  type CutGeometryAnalysis,
  type DialogueActionSceneSpec,
  type Eyeline180AuditResult,
  type EyelineViolation,
  type EyelineViolationKind,
  type EyelineViolationSeverity,
  type HalfPlaneSign,
  type LegalAxisTransitionRecord,
  type LegalScreenDirectionTransitionRecord,
  type MotionTravelDirection,
  type SafeCameraBlockingFixResult,
  type ScreenFacingDirection,
  type StageCharacterSpec,
  type Vec2XZ,
} from "./eyeline-180-rule-types";

export {
  computeCameraBlockingSha256Hex,
  computeExpectedEyelinePitchDeg,
  computeProjectedScreenFacing,
  computeSignedAxisDistanceM,
  cross2DXZ,
  distance2DXZ,
  reflectPointAcrossLineXZ,
  type ProjectedScreenFacingResult,
  type SignedAxisDistanceResult,
} from "./eyeline-180-geometry";

export {
  applySafeCameraBlockingFix,
  auditSceneEyelineAnd180Rule,
} from "./eyeline-180-rule-solver";

export {
  renderEyeline180StageDiagramSvg,
  summarizeEyeline180AuditKo,
  type EyelineStageDiagramSvgOptions,
} from "./eyeline-180-svg-and-report";
