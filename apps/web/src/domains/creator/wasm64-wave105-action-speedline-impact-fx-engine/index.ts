/**
 * Wasm64 Wave 105 공개 배럴 진입점 (`wasm64-wave105-action-speedline-impact-fx-engine`).
 *
 * - `focal-safe-speedline-generator`: 4종 만화 집중선·속도선·소용돌이·플래시 베타 생성 및
 *   인물 안전 타원·말풍선 무침범 정밀 클리핑 엔진
 * - `slash-ribbon-shockwave-and-wgsl`: 2/3차 베지어 검기 궤적 리본, 충격파·파열 균열,
 *   잔상 고스트, 저모션 접근성 제어, WebGPU WGSL 셰이더 생성 및 검증
 * - `action-fx-svg-and-audit`: 인쇄 안전 OKLCH 고대비 SVG 합성기 및 자연 한국어 연출 QA 리포트
 */

export {
  clampFinite,
  createSeededRng,
  doesPolygonIntrudeKeepOuts,
  doesSegmentIntrudeBalloonBox,
  doesSegmentIntrudeEllipse,
  generateFocalSafeActionSpeedlines,
  intersectRayAabb,
  intersectRayEllipse,
  isPointInsideBalloonBox,
  isPointInsideSafeEllipse,
  subtractForbiddenIntervals,
  type ActionSpeedlineAuditMetrics,
  type ActionSpeedlineFieldResult,
  type ActionSpeedlineSpec,
  type BalloonKeepOutBox,
  type PanelRect,
  type SafeEllipse,
  type ScalarInterval,
  type SpeedlineFieldMode,
  type SpeedlineTier,
  type TaperedSpeedlinePolygon,
  type Vec2,
} from "./focal-safe-speedline-generator";

export {
  buildActionImpactFxWgsl,
  synthesizeSwordSlashRibbonAndImpactFx,
  validateActionImpactFxWgsl,
  type ActionFxWgslBindingDescriptor,
  type ActionFxWgslValidationReport,
  type ActionImpactFxWgslArtifact,
  type AfterimageMotionGhost,
  type FractureCrackPolyline,
  type ImpactMotionSafetyState,
  type ShockwaveRing,
  type SlashBezierCurveSpec,
  type SlashImpactFxOptions,
  type SlashVelocityProfile,
  type SwordSlashImpactFxResult,
  type SwordSlashMetrics,
  type SwordSlashSpec,
  type TrailingWakeStreak,
} from "./slash-ribbon-shockwave-and-wgsl";

export {
  escapeActionFxXml,
  renderActionImpactFxSvg,
  summarizeActionImpactFxKo,
  type ActionFxSvgTheme,
  type ActionImpactFxReportKo,
  type ActionImpactFxScene,
} from "./action-fx-svg-and-audit";
