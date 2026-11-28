/**
 * Wasm64 Wave 96 공개 배럴 진입점 (`wasm64-wave96-script-to-camera-blocking-solver`).
 *
 * - `korean-script-beat-parser`: 한국어 웹툰 대본·콘티 파서(씬 헤더 시간대 추론,
 *   화자·청자 교대, 감정·권력 구도·액션 강도, `[카메라: 축 전환]`) 및 영화적 샷 문법 추천기
 * - `camera-180-rule-and-lighting-solver`: 3D 180° 시선 축(Line-of-Action) 반평면 잠금,
 *   화면 좌→우 배치 투영, 30° 컷 분리, 인물 충돌 회피, 독립 연속성 감사기, 3점 조명 물리 솔버
 * - `blocking-floorplan-svg-and-audit`: 고대비 톱다운 블록킹 평면도 SVG 및 한국어 촬영 시트 요약기
 */

export {
  SHOT_SCALE_RANK_MAP,
  parseKoreanWebtoonScript,
  recommendShotGrammarForBeat,
  type BeatEmotionTag,
  type ComicShotScale,
  type ParseKoreanScriptOptions,
  type ParsedScriptScene,
  type PowerDynamics,
  type SceneTimeOfDay,
  type ScriptBeat,
  type ScriptBeatKind,
  type ShotGrammarRecommendation,
  type VerticalCameraAngleBias,
} from "./korean-script-beat-parser";

export {
  auditCameraBlockingContinuity,
  solveCameraBlockingPlan,
  solveThreePointLightingForBeat,
  type ActorScreenProjection,
  type BlockingActorSpec,
  type CameraBlockingAuditResult,
  type CameraBlockingPlan,
  type CameraBlockingShot,
  type CameraPlacement3d,
  type ContinuityViolation,
  type ContinuityViolationCode,
  type DirectionalLightSpec,
  type LineOfActionAxis,
  type NormalizedBlockingActor,
  type SolveCameraBlockingOptions,
  type ThreePointLightingRig,
  type Vec2XZ,
  type Vec3,
} from "./camera-180-rule-and-lighting-solver";

export {
  renderBlockingFloorplanSvg,
  summarizeCameraBlockingSheetKo,
  type BlockingFloorplanSvgOptions,
} from "./blocking-floorplan-svg-and-audit";
