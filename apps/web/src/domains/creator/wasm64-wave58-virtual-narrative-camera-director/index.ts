/**
 * Wasm64 Wave 58 공개 배럴 진입점 (`wasm64-wave58-virtual-narrative-camera-director`).
 *
 * - `narrative-beat-shot-classifier`: 컷의 서사 비트(대사 감정, 화자·청자 3D 위치, 액션 속도 벡터,
 *   컷 중요도, 직전 샷)를 해석해 7종 샷 문법과 초점거리·화각·말풍선 네거티브 스페이스를 산출하는 분류기
 * - `virtual-camera-framing-solver`: 삼분할(Rule of Thirds)·황금나선 교점 정렬, ±22° 더치 틸트 안전 클램핑,
 *   얇은 렌즈 DoF 및 말풍선-얼굴 겹침 회피 프레이밍 솔버와 구도 품질 채점기
 * - `continuity-180-rule-auditor`: 180도 시선 축 위반·30도 점프컷·단조 샷 반복 자동 진단/교정기 및
 *   시간 단조·부드러운 이징 기반 돌리/패닝 키프레임 트랙 생성기
 */

export {
  CLASSIFIER_MAX_DUTCH_ROLL_DEG,
  DEFAULT_FULL_FRAME_SENSOR_HEIGHT_MM,
  NARRATIVE_SHOT_GRAMMARS,
  SHOT_GRAMMAR_PRESETS,
  computeCameraFovDegrees,
  recommendNarrativeShotPlan,
  type CameraFovDegrees,
  type NarrativeBeatInput,
  type NarrativeEmotion,
  type NarrativeParticipant,
  type NarrativeShotGrammar,
  type NarrativeShotPlan,
  type NegativeSpacePlan,
  type NegativeSpaceZone,
  type NormalizedRect2D,
  type ShotGrammarCandidateScore,
  type ShotGrammarPreset,
  type ShotScaleTier,
  type SubjectAnchorHint,
  type Vec2,
  type Vec3,
} from "./narrative-beat-shot-classifier";

export {
  DEFAULT_CIRCLE_OF_CONFUSION_MM,
  GOLDEN_SPIRAL_ANCHORS,
  MAX_SAFE_DUTCH_ROLL_DEG,
  RULE_OF_THIRDS_ANCHORS,
  evaluateFramingCompositionScore,
  projectWorldPointToScreen,
  solveVirtualCameraRig,
  type BoundingBox3D,
  type CompositionAnchorMode,
  type CompositionEvaluationOptions,
  type DepthOfFieldSpec,
  type FramingCompositionScore,
  type ProjectedScreenPoint,
  type SubjectFramingTarget,
  type VirtualCameraRig,
  type VirtualCameraSolveInput,
} from "./virtual-camera-framing-solver";

export {
  auditSequenceCameraContinuity,
  evaluateCameraEasing,
  generateCameraWorkingKeyframes,
  type CameraEasingMode,
  type CameraMotionStyle,
  type CameraWorkingCutSegment,
  type CameraWorkingKeyframe,
  type CameraWorkingTrack,
  type CameraWorkingTrackOptions,
  type ContinuityAuditOptions,
  type ContinuitySeverity,
  type ContinuityViolationKind,
  type ContinuityViolationRecord,
  type CorrectedSequenceCutCameraNode,
  type SequenceContinuityAuditResult,
  type SequenceCutCameraNode,
} from "./continuity-180-rule-auditor";
