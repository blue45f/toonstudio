/**
 * 툰스튜디오 아카데미 · 12대 멀티 직군 특화 · 8단계 분업 파이프라인 & 7단계 거버넌스 공개 배럴.
 */

export const ACADEMY_AND_ROLES_HUB_SUMMARY = Object.freeze({
  titleKo: "멀티 직군 작업 특화 · 8단계 분업·거버넌스 · 툰스튜디오 아카데미",
  roleCount: 12,
  pipelineStageCount: 8,
  governanceTierCount: 7,
  academyTrackCount: 6,
  xrayLayerCount: 8,
  goalRecipeCount: 8,
} as const);

export {
  ACADEMY_ROLES_SPRITE_PATHS,
  CALM_TOOL_RAIL_BUDGET,
  MIGRATION_SHORTCUT_PRESETS,
  ROLE_COMBO_QUICK_PRESETS,
  STUDIO_CREATOR_ROLE_ORDER,
  STUDIO_CREATOR_ROLES,
  composeMultiRoleWorkspace,
  normalizeCreatorRoleIds,
} from "./studio-role-specialization-engine";
export type {
  AiRoleBackfillAssignment,
  ComposeMultiRoleOptions,
  ComposedChecklistItem,
  MultiRoleWorkspaceComposition,
  RoleDomainCategory,
  RoleLayerSpec,
  RoleToolSlotSpec,
  ShortcutBindingItem,
  ShortcutMigrationPreset,
  ShortcutMigrationPresetId,
  StudioCreatorRoleId,
  StudioCreatorRoleInputId,
  StudioCreatorRoleSpec,
  SynthesizedLayerStackItem,
} from "./studio-role-specialization-engine";

export {
  GOVERNANCE_TIER_ORDER,
  PIPELINE_STAGE_ORDER,
  RBAC_ACTION_LABELS,
  SAMPLE_CUT_PAYOUT_ENTRIES,
  SAMPLE_SLA_WORKLOAD_CUTS,
  STUDIO_GOVERNANCE_TIERS,
  STUDIO_RBAC_ROLES,
  WEBTOON_8_STAGE_PIPELINE,
  WORKSPACE_HIERARCHY_LEVELS,
  calculateCutPayoutLedger,
  createOutsourceSandboxPackage,
  detectPipelineBottlenecks,
  evaluateRbacPermission,
  evaluateStageHandoffGate,
  executeCutBatonHandoff,
  getNextPipelineStageId,
  getPipelineStageSpec,
  verifyOutsourceReturnBundle,
} from "./studio-pipeline-governance-engine";
export type {
  AssigneePayoutSummary,
  BottleneckSeverity,
  CutPayoutEntryInput,
  CutPayoutLedgerSummary,
  CutPipelineRuntimeState,
  OutsourceReturnVerificationInput,
  OutsourceReturnVerificationResult,
  OutsourceSandboxPackage,
  OutsourceSandboxRequest,
  PipelineBottleneckReport,
  PipelineStageId,
  PipelineStageSpec,
  PipelineWorkloadCut,
  RbacPermissionDecision,
  StageBottleneckAlert,
  StageGateCheckResult,
  StageHandoffGateEvaluation,
  StageHandoffGateInput,
  StudioGovernanceTierId,
  StudioGovernanceTierSpec,
  StudioRbacActionId,
  StudioRbacRoleId,
  StudioRbacRoleSpec,
  WorkspaceHierarchyLevelId,
  WorkspaceHierarchyLevelSpec,
} from "./studio-pipeline-governance-engine";

export {
  ACADEMY_SKILL_TRACKS,
  GOAL_FIRST_RECIPES,
  SHORTCUT_RHYTHM_DRILLS,
  XRAY_MANUSCRIPT_LAYERS,
  computeAcademySkillTreeProgress,
  evaluateShortcutRhythmDrill,
  searchGoalFirstRecipes,
  summarizeXrayLayerStack,
} from "./toonstudio-academy-curriculum";
export type {
  AcademySkillTrack,
  AcademySkillTreeProgress,
  GoalFirstRecipe,
  ShortcutRhythmDrill,
  ShortcutRhythmEvaluation,
  ShortcutRhythmStep,
  XrayManuscriptLayer,
  XrayStackSummary,
} from "./toonstudio-academy-curriculum";

export { StudioAcademyAndRoleCraftHub } from "./StudioAcademyAndRoleCraftHub";
export type {
  AcademyRoleCraftTabId,
  StudioAcademyAndRoleCraftHubProps,
} from "./StudioAcademyAndRoleCraftHub";
export { StudioPipelineGovernanceBoard } from "./StudioPipelineGovernanceBoard";
export type { StudioPipelineGovernanceBoardProps } from "./StudioPipelineGovernanceBoard";
