/**
 * Wave 115 — 웹툰 스토리보드 썸네일 보드 및 컷 흐름·페이싱 드래그 리플로우 솔버 공용 타입 계약.
 *
 * 2D 썸네일 보드(열 기반 씬 그룹 그리드)와 세로 스크롤 마스터 스트립의 이중 투영,
 * 5종 원자 리플로우 연산, 가역 명령 히스토리, 4막 텐션·페이싱 감사 결과를 정의한다.
 */

export type StoryboardAct = "intro" | "development" | "twist" | "climax" | "epilogue";

export const STORYBOARD_ACT_ORDER: Readonly<Record<StoryboardAct, number>> = {
  intro: 0,
  development: 1,
  twist: 2,
  climax: 3,
  epilogue: 4,
};

export const STORYBOARD_ACT_LABELS_KO: Readonly<Record<StoryboardAct, string>> = {
  intro: "기(도입)",
  development: "승(전개)",
  twist: "전(전환)",
  climax: "결(절정)",
  epilogue: "여운",
};

export const STORYBOARD_ACT_SHORT_KO: Readonly<Record<StoryboardAct, string>> = {
  intro: "기",
  development: "승",
  twist: "전",
  climax: "결",
  epilogue: "여운",
};

export interface StoryboardCutInput {
  readonly cutId: string;
  readonly sceneId: string;
  readonly sceneTitleKo?: string;
  readonly titleKo: string;
  readonly act: StoryboardAct;
  readonly tension: number;
  readonly dialogueCharCount: number;
  readonly visualComplexity: number;
  readonly heightPx: number;
  readonly gutterBeforePx: number;
  readonly lockedAnchor?: boolean;
  readonly continuityTargetCutIds?: readonly string[];
}

export interface NormalizedStoryboardCut {
  readonly cutId: string;
  readonly sceneId: string;
  readonly sceneTitleKo: string;
  readonly titleKo: string;
  readonly act: StoryboardAct;
  readonly tension: number;
  readonly dialogueCharCount: number;
  readonly visualComplexity: number;
  readonly heightPx: number;
  readonly gutterBeforePx: number;
  readonly lockedAnchor: boolean;
  readonly continuityTargetCutIds: readonly string[];
}

export interface StoryboardProjectionOptions {
  readonly episodeTitleKo?: string;
  readonly columns?: number;
  readonly canvasWidthPx?: number;
  readonly cardWidthPx?: number;
  readonly cardHeightPx?: number;
  readonly cardGapXPx?: number;
  readonly cardGapYPx?: number;
  readonly sceneHeaderHeightPx?: number;
  readonly sceneGapYPx?: number;
  readonly boardPaddingPx?: number;
  readonly readingCharsPerSec?: number;
  readonly baseVisualReadSec?: number;
  readonly scrollSpeedPxPerSec?: number;
}

export interface ResolvedStoryboardProjectionOptions {
  readonly episodeTitleKo: string;
  readonly columns: number;
  readonly canvasWidthPx: number;
  readonly cardWidthPx: number;
  readonly cardHeightPx: number;
  readonly cardGapXPx: number;
  readonly cardGapYPx: number;
  readonly sceneHeaderHeightPx: number;
  readonly sceneGapYPx: number;
  readonly boardPaddingPx: number;
  readonly readingCharsPerSec: number;
  readonly baseVisualReadSec: number;
  readonly scrollSpeedPxPerSec: number;
}

export interface ProjectedBoardCell {
  readonly row: number;
  readonly col: number;
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly sceneHeaderYPx: number;
}

export interface ProjectedVerticalStripItem {
  readonly yPx: number;
  readonly heightPx: number;
  readonly gutterBeforePx: number;
  readonly endYPx: number;
  readonly readingSec: number;
  readonly cumulativeReadingSec: number;
}

export interface ProjectedStoryboardCut extends NormalizedStoryboardCut {
  readonly index: number;
  readonly sceneGroupIndex: number;
  readonly row: number;
  readonly col: number;
  readonly yPx: number;
  readonly endYPx: number;
  readonly readingSec: number;
  readonly cumulativeReadingSec: number;
  readonly boardCell: ProjectedBoardCell;
  readonly vertical: ProjectedVerticalStripItem;
}

export interface StoryboardSceneHeader {
  readonly sceneGroupIndex: number;
  readonly sceneId: string;
  readonly sceneTitleKo: string;
  readonly startCutIndex: number;
  readonly endCutIndex: number;
  readonly cutCount: number;
  readonly startRow: number;
  readonly endRow: number;
  readonly headerYPx: number;
  readonly headerHeightPx: number;
  readonly stripStartYPx: number;
  readonly stripEndYPx: number;
  readonly averageTension: number;
  readonly totalDialogueChars: number;
  readonly totalReadingSec: number;
}

export interface ContinuityLinkStatus {
  readonly sourceCutId: string;
  readonly targetCutId: string;
  readonly sourceIndex: number;
  readonly targetIndex: number;
  readonly reversed: boolean;
  readonly spanCuts: number;
}

export interface ContinuityViolation {
  readonly sourceCutId: string;
  readonly targetCutId: string;
  readonly sourceIndex: number;
  readonly targetIndex: number;
  readonly reasonKo: string;
}

export interface StoryboardFlowProjection {
  readonly episodeTitleKo: string;
  readonly columns: number;
  readonly canvasWidthPx: number;
  readonly boardWidthPx: number;
  readonly boardHeightPx: number;
  readonly stripTotalHeightPx: number;
  readonly totalReadingSec: number;
  readonly totalDialogueChars: number;
  readonly cuts: readonly ProjectedStoryboardCut[];
  readonly scenes: readonly StoryboardSceneHeader[];
  readonly continuityLinks: readonly ContinuityLinkStatus[];
  readonly continuityViolations: readonly ContinuityViolation[];
  readonly stateSha256Hex: string;
  readonly options: ResolvedStoryboardProjectionOptions;
}

export interface ReorderCutOperation {
  readonly kind: "reorder-cut";
  readonly cutId: string;
  readonly targetIndex: number;
  readonly forceOverrideLock?: boolean;
}

export interface MoveSceneGroupOperation {
  readonly kind: "move-scene-group";
  readonly sceneId: string;
  readonly targetBeforeSceneId: string | null;
  readonly forceOverrideLock?: boolean;
}

export interface SplitCutOperation {
  readonly kind: "split-cut";
  readonly cutId: string;
  readonly splitRatio?: number;
  readonly firstCutId?: string;
  readonly secondCutId?: string;
  readonly forceOverrideLock?: boolean;
}

export interface MergeAdjacentCutsOperation {
  readonly kind: "merge-adjacent-cuts";
  readonly firstCutId: string;
  readonly secondCutId: string;
  readonly mergedCutId?: string;
  readonly forceOverrideLock?: boolean;
}

export interface InsertBreathingGutterOperation {
  readonly kind: "insert-breathing-gutter";
  readonly cutId: string;
  readonly extraGutterPx: number;
  readonly maxGutterPx?: number;
}

export type StoryboardReflowOperation =
  | ReorderCutOperation
  | MoveSceneGroupOperation
  | SplitCutOperation
  | MergeAdjacentCutsOperation
  | InsertBreathingGutterOperation;

export type StoryboardRejectionCode =
  | "LOCKED_ANCHOR"
  | "CUT_NOT_FOUND"
  | "SCENE_NOT_FOUND"
  | "NOT_ADJACENT"
  | "INVALID_OPERATION"
  | "NO_OP";

export interface StoryboardReflowResult {
  readonly applied: boolean;
  readonly rejected: boolean;
  readonly rejectionCode?: StoryboardRejectionCode;
  readonly rejectionReasonKo?: string;
  readonly operationKind: StoryboardReflowOperation["kind"];
  readonly affectedCutIds: readonly string[];
  readonly previousSha256Hex: string;
  readonly nextSha256Hex: string;
  readonly cuts: readonly NormalizedStoryboardCut[];
  readonly projection: StoryboardFlowProjection;
  readonly continuityViolations: readonly ContinuityViolation[];
  readonly summaryKo: string;
}

export interface StoryboardHistoryStepResult {
  readonly ok: boolean;
  readonly exactRoundTrip: boolean;
  readonly expectedSha256Hex: string;
  readonly stateSha256Hex: string;
  readonly cuts: readonly NormalizedStoryboardCut[];
  readonly projection: StoryboardFlowProjection;
  readonly labelKo: string;
}

export interface StoryboardReflowSession {
  getState(): readonly NormalizedStoryboardCut[];
  getProjection(): StoryboardFlowProjection;
  getStateSha256Hex(): string;
  apply(operation: StoryboardReflowOperation): StoryboardReflowResult;
  undo(): StoryboardHistoryStepResult;
  redo(): StoryboardHistoryStepResult;
  canUndo(): boolean;
  canRedo(): boolean;
  getUndoDepth(): number;
  getRedoDepth(): number;
}

export interface ActTensionSummary {
  readonly act: StoryboardAct;
  readonly labelKo: string;
  readonly cutCount: number;
  readonly averageTension: number;
  readonly minTension: number;
  readonly maxTension: number;
  readonly totalDialogueChars: number;
  readonly totalReadingSec: number;
}

export interface TensionFlatlineSpan {
  readonly startCutIndex: number;
  readonly endCutIndex: number;
  readonly cutIds: readonly string[];
  readonly length: number;
  readonly averageTension: number;
  readonly maxAdjacentDelta: number;
  readonly reasonKo: string;
}

export interface DialogueFatigueSpan {
  readonly startCutIndex: number;
  readonly endCutIndex: number;
  readonly cutIds: readonly string[];
  readonly length: number;
  readonly totalDialogueChars: number;
  readonly peakDialogueChars: number;
  readonly peakCutId: string;
  readonly averageVisualComplexity: number;
  readonly severity: "warning" | "critical";
  readonly reasonKo: string;
}

export type FlowReflowSuggestionCategory =
  | "continuity"
  | "dialogue-fatigue"
  | "flatline"
  | "scene-rhythm"
  | "ending-hook";

export interface FlowReflowSuggestion {
  readonly suggestionId: string;
  readonly priority: "high" | "medium" | "low";
  readonly category: FlowReflowSuggestionCategory;
  readonly targetCutIds: readonly string[];
  readonly operation: StoryboardReflowOperation;
  readonly titleKo: string;
  readonly rationaleKo: string;
  readonly expectedScoreGain: number;
}

export interface StoryboardFlowAuditOptions {
  readonly flatlineMaxDelta?: number;
  readonly flatlineMinSpan?: number;
  readonly dialogueFatigueCharThreshold?: number;
  readonly dialogueExtremeCharThreshold?: number;
  readonly minDialogueFatigueRun?: number;
  readonly targetSceneBoundaryGutterPx?: number;
  readonly targetClimaxGutterPx?: number;
}

export interface StoryboardFlowAuditResult {
  readonly cutCount: number;
  readonly sceneCount: number;
  readonly actDistribution: readonly ActTensionSummary[];
  readonly peakTensionCutId: string | null;
  readonly peakTension: number;
  readonly peakCutIndex: number;
  readonly peakPositionRatio: number;
  readonly averageTension: number;
  readonly tensionStdDev: number;
  readonly flatlineSpans: readonly TensionFlatlineSpan[];
  readonly dialogueFatigueSpans: readonly DialogueFatigueSpan[];
  readonly continuityViolations: readonly ContinuityViolation[];
  readonly endingHookScore: number;
  readonly sceneTransitionRhythmScore: number;
  readonly arcProgressionScore: number;
  readonly overallFlowHealthScore: number;
  readonly suggestions: readonly FlowReflowSuggestion[];
}

export interface ApplyFlowSuggestionOutcome {
  readonly suggestion: FlowReflowSuggestion;
  readonly reflow: StoryboardReflowResult;
  readonly beforeAudit: StoryboardFlowAuditResult;
  readonly afterAudit: StoryboardFlowAuditResult;
  readonly scoreDelta: number;
}

export interface StoryboardFlowBoardSvgOptions {
  readonly titleKo?: string;
  readonly chartHeightPx?: number;
  readonly showContinuityArrows?: boolean;
  readonly showReadingTime?: boolean;
}
