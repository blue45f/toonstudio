/**
 * 분기형 컷툰 그래프 v1 — 공개 진입점(`@toonstudio/core/branching-cuttoon`).
 * 데이터 모델·검증기·가져오기/내보내기·편집·독자 진행 상태를 모은 순수 모듈 묶음이다. 설명은 docs/features/branching-cuttoon.md.
 */
export {
  BRANCHING_PATH_LIMITS,
  distancesFromStart,
  enumerateEndingPaths,
  findBackEdges,
  indexBranchingGraph,
  nodesThatReachEnding,
} from "./branching-cuttoon-analysis";
export type {
  BranchingEdge,
  BranchingGraphIndex,
  BranchingPathEnumeration,
  BranchingPathLimits,
} from "./branching-cuttoon-analysis";
export {
  addChoice,
  addCut,
  addNode,
  createBranchingGraph,
  moveChoice,
  moveCutRef,
  removeChoice,
  removeCutRef,
  removeNode,
  setGraphTitle,
  setStartNode,
  updateChoice,
  updateCutCaption,
  updateNode,
} from "./branching-cuttoon-edit";
export type { BranchingEditBlock, BranchingEditResult } from "./branching-cuttoon-edit";
export {
  BRANCHING_IMPORT_LIMITS,
  parseBranchingCuttoonJson,
  parseBranchingCuttoonValue,
  serializeBranchingCuttoon,
} from "./branching-cuttoon-json";
export type { BranchingParseError, BranchingParseErrorCode, BranchingParseResult } from "./branching-cuttoon-json";
export {
  BRANCHING_PROGRESS_RECORD_VERSION,
  canStepBack,
  chooseBranch,
  findBranchingNode,
  readerScene,
  restoreReaderState,
  startReading,
  stepBack,
  toProgressRecord,
} from "./branching-cuttoon-reader";
export type {
  BranchingProgressRecord,
  BranchingReaderScene,
  BranchingReaderState,
  BranchingSceneCut,
  BranchingTrailStep,
} from "./branching-cuttoon-reader";
export { choiceLabelKey, countCodePoints, hasUnsafeText, isBlankText, isValidBranchingId, nextFreeId } from "./branching-cuttoon-text";
export {
  BRANCHING_CUTTOON_FORMAT,
  BRANCHING_CUTTOON_LIMITS,
  BRANCHING_CUTTOON_SCHEMA_VERSION,
  BRANCHING_ISSUE_CODES,
  BRANCHING_ISSUE_SEVERITY,
  BRANCHING_NODE_KINDS,
  BRANCHING_TRAIL_LIMIT,
} from "./branching-cuttoon-types";
export type {
  BranchingChoice,
  BranchingCuttoonGraph,
  BranchingCut,
  BranchingEditableNodeKind,
  BranchingGraphStats,
  BranchingIssue,
  BranchingIssueCode,
  BranchingIssueSeverity,
  BranchingLimitName,
  BranchingNode,
  BranchingNodeKind,
  BranchingValidationReport,
} from "./branching-cuttoon-types";
export { isBranchingCuttoonPlayable, validateBranchingCuttoon } from "./branching-cuttoon-validate";
export type { BranchingValidateOptions } from "./branching-cuttoon-validate";
export { branchingGraphVersion } from "./branching-cuttoon-version";
