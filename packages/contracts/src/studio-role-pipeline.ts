import { z } from "zod";

export const STUDIO_ROLE_PIPELINE_STAGE_IDS = ["story-script", "storyboard-conte", "bg3d-spatial", "line-art-ink",
  "flat-color-mask", "shading-fx-post", "lettering-sfx", "pd-editorial-review"] as const;
export const STUDIO_ROLE_PIPELINE_GROUP_IDS = ["story-notes", "dialogue-draft", "storyboard", "panel-frame", "camera-guide",
  "background-3d", "background-line", "background-tone", "main-lineart", "assistant-line", "flat-color", "color-mask",
  "shading", "fx-overlay", "balloon", "dialogue-text", "sfx-typography", "review-annotation"] as const;
export const STUDIO_ROLE_PIPELINE_ROLE_IDS = ["story", "adaptation", "associate-writer", "storyboard", "background",
  "background-assistant", "line-art", "line-assistant", "flat-color-assistant", "shading-assistant", "effect-assistant",
  "lettering", "lettering-assistant", "editor", "creator"] as const;
export type StudioRolePipelineStageId = typeof STUDIO_ROLE_PIPELINE_STAGE_IDS[number];
export type StudioRolePipelineGroupId = typeof STUDIO_ROLE_PIPELINE_GROUP_IDS[number];
export type StudioRolePipelineRoleId = typeof STUDIO_ROLE_PIPELINE_ROLE_IDS[number];

export const STUDIO_ROLE_PIPELINE_STAGES: readonly { readonly id: StudioRolePipelineStageId; readonly label: string;
  readonly groupIds: readonly StudioRolePipelineGroupId[] }[] = [
  { id: "story-script", label: "원작·대본", groupIds: ["story-notes", "dialogue-draft"] },
  { id: "storyboard-conte", label: "콘티·연출", groupIds: ["storyboard", "panel-frame", "camera-guide"] },
  { id: "bg3d-spatial", label: "3D·배경", groupIds: ["background-3d", "background-line", "background-tone"] },
  { id: "line-art-ink", label: "선화", groupIds: ["main-lineart", "assistant-line"] },
  { id: "flat-color-mask", label: "밑색·마스크", groupIds: ["flat-color", "color-mask"] },
  { id: "shading-fx-post", label: "명암·효과", groupIds: ["shading", "fx-overlay"] },
  { id: "lettering-sfx", label: "식자·효과음", groupIds: ["balloon", "dialogue-text", "sfx-typography"] },
  { id: "pd-editorial-review", label: "편집·최종 승인", groupIds: ["review-annotation"] },
];
export const STUDIO_ROLE_PIPELINE_GROUP_LABELS: Readonly<Record<StudioRolePipelineGroupId, string>> = {
  "story-notes": "원작·플롯", "dialogue-draft": "대본 초안", storyboard: "콘티", "panel-frame": "컷 프레임",
  "camera-guide": "카메라·투시", "background-3d": "3D 배경", "background-line": "배경 선화", "background-tone": "배경 톤",
  "main-lineart": "메인 선화", "assistant-line": "보조 선화", "flat-color": "밑색", "color-mask": "채색 마스크",
  shading: "명암", "fx-overlay": "효과", balloon: "말풍선", "dialogue-text": "대사", "sfx-typography": "효과음", "review-annotation": "검수 주석",
};
export const STUDIO_ROLE_PIPELINE_ROLES: readonly { readonly id: StudioRolePipelineRoleId; readonly label: string;
  readonly groupIds: readonly StudioRolePipelineGroupId[] }[] = [
  { id: "story", label: "글작가", groupIds: ["story-notes", "dialogue-draft", "review-annotation"] },
  { id: "adaptation", label: "각색작가", groupIds: ["story-notes", "dialogue-draft", "storyboard", "panel-frame"] },
  { id: "associate-writer", label: "보조 글작가", groupIds: ["story-notes", "dialogue-draft"] },
  { id: "storyboard", label: "콘티작가", groupIds: ["storyboard", "panel-frame", "camera-guide", "dialogue-draft", "balloon"] },
  { id: "background", label: "배경작가", groupIds: ["background-3d", "background-line", "background-tone", "camera-guide"] },
  { id: "background-assistant", label: "배경 어시스턴트", groupIds: ["background-3d", "background-line", "background-tone"] },
  { id: "line-art", label: "선화작가", groupIds: ["main-lineart", "assistant-line", "storyboard"] },
  { id: "line-assistant", label: "선화 어시스턴트", groupIds: ["assistant-line"] },
  { id: "flat-color-assistant", label: "밑색 어시스턴트", groupIds: ["flat-color", "color-mask"] },
  { id: "shading-assistant", label: "명암 어시스턴트", groupIds: ["shading"] },
  { id: "effect-assistant", label: "효과 어시스턴트", groupIds: ["fx-overlay", "sfx-typography"] },
  { id: "lettering", label: "식자 디자이너", groupIds: ["balloon", "dialogue-text", "sfx-typography"] },
  { id: "lettering-assistant", label: "식자 어시스턴트", groupIds: ["balloon", "sfx-typography"] },
  { id: "editor", label: "편집자·PD", groupIds: ["review-annotation", "dialogue-draft", "dialogue-text"] },
  { id: "creator", label: "총괄 1인작가", groupIds: STUDIO_ROLE_PIPELINE_GROUP_IDS },
];

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u);
const stageId = z.enum(STUDIO_ROLE_PIPELINE_STAGE_IDS);
const unique = <T>(values: readonly T[], key: (value: T) => string) => new Set(values.map(key)).size === values.length;
export const StudioRolePipelineConfigurationSchema = z.object({
  productionProjectId: id,
  roleBindings: z.array(z.object({ roleId: z.enum(STUDIO_ROLE_PIPELINE_ROLE_IDS), assignmentId: id }).strict()).min(1).max(1000)
    .refine((values) => unique(values, (value) => `${value.roleId}:${value.assignmentId}`)),
  groupMappings: z.array(z.object({ groupId: z.enum(STUDIO_ROLE_PIPELINE_GROUP_IDS), targetIds: z.array(id).min(1).max(1000)
    .refine((values) => unique(values, (value) => value)) }).strict()).min(1).max(18)
    .refine((values) => unique(values, (value) => value.groupId)
      && unique(values.flatMap((value) => value.targetIds), (value) => value)),
  stageTasks: z.array(z.object({ stageId, taskId: id }).strict()).length(8)
    .refine((values) => unique(values, (value) => value.stageId) && unique(values, (value) => value.taskId)),
}).strict();
export const StudioRolePipelineStateSchema = StudioRolePipelineConfigurationSchema.extend({
  version: z.literal(1), enabled: z.boolean(), activeStageId: stageId,
  frozenStageIds: z.array(stageId).max(8).refine((values) => unique(values, (value) => value)),
  approvedAt: z.iso.datetime({ offset: true }).nullable(),
  history: z.array(z.object({ kind: z.enum(["handoff", "restart"]), mutationId: z.uuid(), actorUserId: id, fromStageId: stageId, toStageId: stageId.nullable(),
    submissionId: id, createdAt: z.iso.datetime({ offset: true }) }).strict()).max(1000),
}).strict();
export const StudioRolePipelineAccessSchema = z.object({
  editableTargetIds: z.array(id).max(100_000), frozenTargetIds: z.array(id).max(100_000),
  canHandoff: z.boolean().optional(),
}).strict();
export const StudioRolePipelineManagementSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("configure-role-pipeline"), configuration: StudioRolePipelineConfigurationSchema }).strict(),
  z.object({ type: z.literal("disable-role-pipeline") }).strict(),
  z.object({ type: z.literal("handoff-role-pipeline"), expectedProjectRevision: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("restart-role-pipeline"), configuration: StudioRolePipelineConfigurationSchema,
    expectedWorkRevision: z.number().int().positive() }).strict(),
]);
export type StudioRolePipelineConfiguration = z.infer<typeof StudioRolePipelineConfigurationSchema>;
export type StudioRolePipelineState = z.infer<typeof StudioRolePipelineStateSchema>;
export type StudioRolePipelineAccess = z.infer<typeof StudioRolePipelineAccessSchema>;
export type StudioRolePipelineManagement = z.infer<typeof StudioRolePipelineManagementSchema>;

export const studioRolePipelineGroupStage = (groupId: StudioRolePipelineGroupId): StudioRolePipelineStageId => {
  const stage = STUDIO_ROLE_PIPELINE_STAGES.find((entry) => entry.groupIds.includes(groupId));
  if (!stage) throw new Error("제작 레이어 그룹의 정본 공정이 없습니다.");
  return stage.id;
};
export function studioRolePipelineControlledTargetIds(pipeline: StudioRolePipelineState | null | undefined): readonly string[] {
  return pipeline?.enabled ? pipeline.groupMappings.flatMap((mapping) => mapping.targetIds) : [];
}
/** 현재성 검증을 통과한 실제 grant만 전달한다. 프로필 직군은 권한 근거가 아니다. */
export function studioRolePipelineGrantTargetIds(pipeline: StudioRolePipelineState,
  grant: { readonly assignmentId: string; readonly taskId: string; readonly targetIds: readonly string[] }): readonly string[] {
  if (!pipeline.enabled || pipeline.approvedAt || pipeline.frozenStageIds.includes(pipeline.activeStageId)
    || pipeline.stageTasks.find((entry) => entry.stageId === pipeline.activeStageId)?.taskId !== grant.taskId) return [];
  const groups = new Set(pipeline.roleBindings.filter((binding) => binding.assignmentId === grant.assignmentId)
    .flatMap((binding) => STUDIO_ROLE_PIPELINE_ROLES.find((role) => role.id === binding.roleId)?.groupIds ?? []));
  return pipeline.groupMappings.filter((mapping) => groups.has(mapping.groupId)
    && studioRolePipelineGroupStage(mapping.groupId) === pipeline.activeStageId)
    .flatMap((mapping) => mapping.targetIds.filter((targetId) => grant.targetIds.includes(targetId)));
}
export function studioRolePipelineFrozenTargetIds(pipeline: StudioRolePipelineState | null | undefined): readonly string[] {
  if (!pipeline?.enabled) return [];
  return pipeline.groupMappings.filter((mapping) => pipeline.approvedAt
    || pipeline.frozenStageIds.includes(studioRolePipelineGroupStage(mapping.groupId))).flatMap((mapping) => mapping.targetIds);
}
