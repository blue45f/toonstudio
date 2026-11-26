/**
 * Wasm64 Wave 24 Master Orchestrator — 마르코프 도구 전이 프리페처 & 피츠 법칙 파이 메뉴·단축키 최적화 공개 진입점.
 *
 * - `markov-intent-prefetch-orchestrator`: 8개 스튜디오 공정 간 온라인 라플라스 평활화 1·2차 전이 확률 학습 및
 *   유휴 프레임 예산(`<= 2ms`)·데이터 절약·발열 감지 기반 지연 `wasm64-*` 모듈 프리페치 오케스트레이터
 * - `fitts-radial-hud-chord-optimizer`: 피츠의 법칙(`ID = log2(1 + D / W)`) 분기 한정 8분할 방사형 메뉴 배치 및
 *   `>= 44×44px` 히트 영역 불변 조건·한 손 무충돌 코드 단축키 최적화기
 *
 * 주의: 초기 번들 그래프에서 정적으로 import하지 않고 필요한 시점에만 지연 로드한다(`0B` 초기 번들 영향).
 */

export {
  CANONICAL_STUDIO_WORKFLOW_SEQUENCE,
  computeLaplaceSmoothedProbability,
  createDefaultWasm64StageCapabilityLoaders,
  DEFAULT_BACKOFF_PRIOR_WEIGHT,
  DEFAULT_LAPLACE_ALPHA,
  DEFAULT_PREFETCH_THRESHOLD,
  DEFAULT_PREFETCH_TOP_K,
  MarkovIntentPrefetchOrchestrator,
  MAX_PREFETCH_IDLE_BUDGET_MS,
  STUDIO_STAGE_LABELS_KO,
  STUDIO_WORKFLOW_STAGES,
  type EffectiveNetworkKind,
  type MarkovOrderStrategy,
  type MarkovPrefetchOrchestratorOptions,
  type MarkovPrefetchTelemetrySnapshot,
  type PrefetchDispatchReport,
  type PrefetchRuntimeEnvironment,
  type PrefetchSkipReason,
  type StageTransitionPrediction,
  type StudioWorkflowStage,
  type ThermalRuntimeState,
  type Wasm64CapabilityLoaderSpec,
} from "./markov-intent-prefetch-orchestrator";

export {
  CARDINAL_FLICK_DIRECTIONS,
  computeFittsIndexOfDifficulty,
  enforceMinimumHitTargetRect,
  estimateFittsMovementTimeMs,
  MIN_HIT_TARGET_PX,
  MIN_SAFE_RADIAL_RING_RADIUS_PX,
  normalizeShortcutChord,
  optimizeFittsRadialMenuAndChords,
  RADIAL_COMPASS_DIRECTIONS,
  RADIAL_DIRECTION_SPECS,
  RADIAL_SLICE_COUNT,
  rectsOverlap,
  resolveConflictFreeSingleHandChords,
  type AuditedScreenTarget,
  type CardinalFlickDirection,
  type ChordBindingAssignment,
  type CommandTransitionCount,
  type HandErgonomicProfile,
  type ModifierTouchPadTarget,
  type ParsedChord,
  type RadialAndChordOptimizationOptions,
  type RadialAndChordOptimizationResult,
  type RadialCompassDirection,
  type RadialDirectionDescriptor,
  type RadialSliceAssignment,
  type ScreenTargetRect,
  type ShortcutConflictFinding,
  type ShortcutConflictKind,
  type StudioCommandProfile,
} from "./fitts-radial-hud-chord-optimizer";

export {
  MIN_CHORD_TOUCH_TARGET_PX,
  type ChordCommandInput,
} from "./single-hand-chord-resolver";
