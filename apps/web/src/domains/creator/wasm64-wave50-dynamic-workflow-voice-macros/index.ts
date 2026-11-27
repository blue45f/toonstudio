/**
 * Wasm64 Wave 50 공개 진입점 (`wasm64-wave50-dynamic-workflow-voice-macros`).
 *
 * - `context-reactive-tool-orchestrator`: 레이어 역할과 펜 궤적 기하 기반 자동 도구 전환·비침투 액션 제안,
 *   연속 확신도 히스테리시스·최소 쿨다운·수동 잠금(`manualLock`)·Sacred 82% 뷰포트 예산 검증기
 * - `voice-and-pen-macro-compiler`: 한국어 자연어 음성 디렉팅과 스타일러스 버튼·제스처 조합을
 *   결정론적 복합 매크로 실행 계획(`DynamicMacroPlan`)으로 컴파일하는 엔진
 * - `atomic-macro-rollback-journal`: 복합 매크로 상태 해시·단계 델타 그룹화(`MacroTransactionSnapshot`),
 *   중간 단계 실패 시 자동 전량 롤백(All-or-Nothing) 및 `Ctrl+Z` 1회 원복 저널
 */

export {
  analyzePenStrokeGeometry,
  createInitialHysteresisState,
  DEFAULT_LONG_HOLD_MS,
  DEFAULT_MIN_SUGGESTION_CONFIDENCE,
  DEFAULT_REQUIRED_CONSECUTIVE_HITS,
  DEFAULT_SWITCH_COOLDOWN_MS,
  evaluateContextReactiveWorkflow,
  MAX_CONTEXT_BAR_HEIGHT_PX,
  MAX_FLOATING_SUGGESTION_CHIP_RATIO,
  MAX_TOP_LEVEL_MENU_COUNT,
  SACRED_MIN_CANVAS_VIEWPORT_RATIO,
  validateSacredViewportBudget,
  type CanvasLayerRole,
  type ContextReactiveCanvasInput,
  type ContextReactiveDecision,
  type ContextReactiveEvaluationResult,
  type ContextReactiveSuggestion,
  type ContextReactiveSuggestionKind,
  type ReactiveDeliveryMode,
  type StrokeGeometryMetrics,
  type StrokePoint,
  type StudioToolId,
  type ToolSwitchHysteresisConfig,
  type ToolSwitchHysteresisState,
  type ViewportBudgetAudit,
  type ViewportBudgetInput,
} from "./context-reactive-tool-orchestrator";

export {
  compileDynamicMacroPlan,
  compilePenButtonMacroPlan,
  compileVoiceMacroPlan,
  type AtmospherePresetKind,
  type DynamicMacroPlan,
  type DynamicMacroStep,
  type HybridMacroCompileInput,
  type LayerOwnerFilter,
  type MacroPlanSource,
  type OklchToneVector,
  type PenButtonMacroCompileInput,
  type StylusButtonGesture,
  type StylusButtonId,
  type VoiceMacroCompileInput,
} from "./voice-and-pen-macro-compiler";

export {
  applyDefaultDynamicMacroStep,
  AtomicMacroRollbackJournal,
  computeDocumentStateHash,
  createDefaultCutMacroState,
  createStudioMacroDocumentState,
  DEFAULT_MAX_MACRO_HISTORY,
  type ExecuteMacroOptions,
  type MacroExecutionResult,
  type MacroStepDelta,
  type MacroStepDeltaStatus,
  type MacroStepExecutor,
  type MacroTransactionSnapshot,
  type MacroUndoRedoResult,
  type StudioCutMacroState,
  type StudioLayerComparisonState,
  type StudioMacroDocumentState,
} from "./atomic-macro-rollback-journal";
