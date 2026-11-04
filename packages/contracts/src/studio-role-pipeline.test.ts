import { describe, expect, it } from "vitest";

import { StudioRolePipelineConfigurationSchema, StudioRolePipelineStateSchema, STUDIO_ROLE_PIPELINE_GROUP_IDS,
  STUDIO_ROLE_PIPELINE_ROLE_IDS, STUDIO_ROLE_PIPELINE_STAGE_IDS, studioRolePipelineControlledTargetIds,
  studioRolePipelineFrozenTargetIds, studioRolePipelineGrantTargetIds, type StudioRolePipelineState } from "./studio-role-pipeline";

const configuration = () => ({ productionProjectId: "project", roleBindings: [{ roleId: "creator" as const, assignmentId: "assignment" }],
  groupMappings: [{ groupId: "story-notes" as const, targetIds: ["story-target"] }, { groupId: "main-lineart" as const, targetIds: ["line-target"] }],
  stageTasks: STUDIO_ROLE_PIPELINE_STAGE_IDS.map((stageId) => ({ stageId, taskId: `task-${stageId}` })) });
const state = (): StudioRolePipelineState => ({ ...configuration(), version: 1, enabled: true, activeStageId: "story-script",
  frozenStageIds: [], approvedAt: null, history: [] });
const grant = () => ({ assignmentId: "assignment", taskId: "task-story-script", targetIds: ["story-target", "line-target"] });

describe("실제 직군별 원고 보호의 공통 계약", () => {
  it("15직군·18그룹·8공정을 고정하고 명시적 계정 배정만 현재 공정에 허용한다", () => {
    expect(STUDIO_ROLE_PIPELINE_ROLE_IDS).toHaveLength(15);
    expect(STUDIO_ROLE_PIPELINE_GROUP_IDS).toHaveLength(18);
    expect(STUDIO_ROLE_PIPELINE_STAGE_IDS).toHaveLength(8);
    expect(StudioRolePipelineStateSchema.parse(state())).toEqual(state());
    expect(studioRolePipelineGrantTargetIds(state(), grant())).toEqual(["story-target"]);
    expect(studioRolePipelineGrantTargetIds(state(), { ...grant(), assignmentId: "profile-creator" })).toEqual([]);
    expect(studioRolePipelineGrantTargetIds(state(), { ...grant(), taskId: "another-task" })).toEqual([]);
  });
  it("기존 미설정·꺼짐은 보호 대상을 만들지 않고 승인·인계 잠금은 허용 배정으로 풀리지 않는다", () => {
    expect(studioRolePipelineControlledTargetIds(null)).toEqual([]);
    expect(studioRolePipelineControlledTargetIds({ ...state(), enabled: false })).toEqual([]);
    expect(studioRolePipelineFrozenTargetIds({ ...state(), frozenStageIds: ["story-script"] })).toEqual(["story-target"]);
    const approved = { ...state(), approvedAt: "2026-11-04T00:00:00Z" };
    expect(studioRolePipelineFrozenTargetIds(approved)).toEqual(["story-target", "line-target"]);
    expect(studioRolePipelineGrantTargetIds(approved, grant())).toEqual([]);
  });
  it("보조 선화 배정은 메인 원화나 대본 권한으로 승격되지 않는다", () => {
    expect(studioRolePipelineGrantTargetIds({ ...state(), roleBindings: [{ roleId: "line-assistant", assignmentId: "assignment" }] }, grant())).toEqual([]);
  });
  it("중복·위조 그룹과 누락·중복 공정은 정책으로 저장하지 않는다", () => {
    const input = configuration();
    for (const invalid of [
      { ...input, roleBindings: [{ roleId: "admin", assignmentId: "assignment" }] },
      { ...input, groupMappings: [{ groupId: "all-visual-layers", targetIds: ["story-target"] }] },
      { ...input, groupMappings: [{ groupId: "story-notes", targetIds: ["same"] }, { groupId: "main-lineart", targetIds: ["same"] }] },
      { ...input, stageTasks: input.stageTasks.slice(1) },
      { ...input, stageTasks: input.stageTasks.map((entry) => ({ ...entry, taskId: "same" })) },
    ]) expect(StudioRolePipelineConfigurationSchema.safeParse(invalid).success).toBe(false);
  });
});
