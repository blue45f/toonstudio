/**
 * Wasm64 Wave 57 공개 진입점 (`wasm64-wave57-kinematic-tension-lighting-director`).
 *
 * - `creative-cadence-telemetry-analyzer`: 비의료 작화 운동학 텔레메트리(펜 획 속도·필압 분산·창작 휴지 리듬)와
 *   컷 서사 긴장도 메타데이터를 결합해 긴장도(`0..1`), 몰입 흐름(`0..1`), 5종 조명 무드를 산출한다.
 * - `dynamic-three-point-lighting-solver`: Kang et al.(2002) 흑체 Kelvin→선형 sRGB 변환,
 *   장면 연속성 제약을 지키는 동적 3점 조명(Key/Fill/Rim) 해석기, 오버슈트 0 임계 감쇠 보간기 및
 *   `prefersReducedMotion` 즉시/저자극 전환 모드를 제공한다.
 * - `mood-grading-lut-generator`: 단조 증가 1D S-커브 톤 커브, OKLCH 색역 안전 3D LUT 생성기,
 *   3선형 보간 기반 결정론적 RGBA 고속 색보정 적용기를 제공한다.
 */

export {
  DEFAULT_KINEMATIC_WEIGHT,
  DEFAULT_MOOD_HYSTERESIS_MARGIN,
  DEFAULT_REFERENCE_PAUSE_CALM_MS,
  DEFAULT_REFERENCE_PEAK_SPEED_PX_PER_SEC,
  SCENE_LIGHTING_MOODS,
  SCENE_MOOD_LABELS_KO,
  analyzeCreativeCadenceAndMood,
  type CreativeCadenceAnalysisOptions,
  type CreativeCadenceAnalysisResult,
  type CreativeCadenceTelemetryInput,
  type CreativeStrokeTelemetrySample,
  type CutDialogueTone,
  type CutNarrativeIntent,
  type CutNarrativeMetadata,
  type KinematicCadenceMetrics,
  type NarrativeTensionMetrics,
  type SceneLightingMood,
  type SceneMoodScoreMap,
} from "./creative-cadence-telemetry-analyzer";

export {
  MAX_PHYSICAL_KELVIN,
  MIN_PHYSICAL_KELVIN,
  NEUTRAL_DAYLIGHT_KELVIN,
  anglesToLightDirectionVector,
  createInitialDampedLightingState,
  kelvinToLinearRgb,
  normalizeAngleDeg360,
  shortestAngleDeltaDeg,
  solveDynamicCutLightingRig,
  stepDampedLightingRig,
  type DampedLightingRigState,
  type DampedLightingStepOptions,
  type DirectionalLightSpec,
  type DirectionalLightVelocityState,
  type DynamicThreePointLightingRig,
  type LightDirectionVector3D,
  type LinearRgbColor,
  type ReducedMotionLightingStrategy,
  type SceneBaseLightingConstraints,
  type ThreePointLightRole,
} from "./dynamic-three-point-lighting-solver";

export {
  DEFAULT_MOOD_LUT_SIZE,
  TONE_CURVE_1D_LENGTH,
  applyMoodGradingToRgba,
  buildMoodColorGradingLut,
  buildToneCurve1DTable,
  evaluateMoodToneCurve1D,
  type ApplyMoodGradingOptions,
  type MoodColorGradingLut,
  type MoodColorGradingLutOptions,
  type MoodOklchGradeParams,
  type MoodToneCurveParams,
} from "./mood-grading-lut-generator";
