// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDIO_ROLE_PIPELINE_STAGES, STUDIO_ROLE_PIPELINE_ROLES, type StudioRolePipelineState } from "@toonstudio/contracts/studio-role-pipeline";
import { ProductionRolePipelinePanel } from "./ProductionRolePipelinePanel";
import { scopedManagementUiFixture } from "./studio-scoped-write-management.test-fixture";

afterEach(cleanup);
function setup(enabled = false, disabled = false, canManage = true, canHandoff = false) {
  const f = scopedManagementUiFixture();
  const aggregate = { ...f.aggregate, tasks: STUDIO_ROLE_PIPELINE_STAGES.map((stage, index) => ({ ...f.task, id: `stage-task-${index}`, title: stage.label })) };
  const pipeline: StudioRolePipelineState = { version: 1, productionProjectId: aggregate.projectId, enabled: true,
    roleBindings: [{ roleId: "story", assignmentId: "artist-role" }], groupMappings: [{ groupId: "story-notes", targetIds: ["target"] }],
    stageTasks: STUDIO_ROLE_PIPELINE_STAGES.map((stage, index) => ({ stageId: stage.id, taskId: `stage-task-${index}` })),
    activeStageId: "story-script", frozenStageIds: [], approvedAt: null, history: [] };
  const policy = { ...f.policy, canManage, rolePipelineAccess: { editableTargetIds: [], frozenTargetIds: [], canHandoff }, ...(enabled ? { rolePipeline: pipeline } : {}) }, onCommand = vi.fn();
  render(<ProductionRolePipelinePanel policy={policy} aggregate={aggregate} disabled={disabled} onCommand={onCommand} workRevision={3} />);
  return { ...f, aggregate, pipeline, onCommand };
}
function acknowledge() { fireEvent.click(screen.getByRole("checkbox", { name: "연결한 실제 범위에 전체 편집자도 포함하는 보호를 적용함을 확인했습니다." })); }

describe("실제 프로젝트의 명시적 직군 보호 관리", () => {
  it("기본 OFF와 15개 직군을 표시하고 열기만으로 서버 명령을 만들지 않는다", () => {
    const f = setup();
    expect(screen.getByText("이 프로젝트의 원고 보호 꺼짐 (기본값)")).toBeTruthy();
    expect(screen.getAllByRole("listbox", { name: /^제작 직군 /u })).toHaveLength(STUDIO_ROLE_PIPELINE_ROLES.length);
    expect(screen.getByRole("button", { name: "이 프로젝트의 원고 보호 켜기" }).hasAttribute("disabled")).toBe(true);
    expect(f.onCommand).not.toHaveBeenCalled();
  });
  it("실제 assignment·target·서로 다른 8개 task를 명시한 뒤에만 configure한다", () => {
    const f = setup();
    fireEvent.change(screen.getByLabelText("제작 직군 글작가"), { target: { value: "artist-role" } });
    fireEvent.click(within(screen.getByRole("group", { name: "원작·플롯" })).getByRole("checkbox"));
    for (const [index, stage] of STUDIO_ROLE_PIPELINE_STAGES.entries()) fireEvent.change(screen.getByLabelText(`실제 공정 ${stage.label}`), { target: { value: `stage-task-${index}` } });
    acknowledge(); fireEvent.click(screen.getByRole("button", { name: "이 프로젝트의 원고 보호 켜기" }));
    expect(f.onCommand).toHaveBeenCalledWith({ type: "configure-role-pipeline", configuration: {
      productionProjectId: "production", roleBindings: [{ roleId: "story", assignmentId: "artist-role" }],
      groupMappings: [{ groupId: "story-notes", targetIds: ["target"] }], stageTasks: f.pipeline.stageTasks,
    } });
  });
  it("빈 매핑과 중복 공정은 전송하지 않고 현재 실제 인계는 aggregate revision을 보낸다", () => {
    const f = setup(); acknowledge(); fireEvent.click(screen.getByRole("button", { name: "이 프로젝트의 원고 보호 켜기" }));
    expect(screen.getByRole("alert")).toBeTruthy(); expect(f.onCommand).not.toHaveBeenCalled();
    cleanup(); const active = setup(true);
    fireEvent.click(screen.getByRole("button", { name: "승인된 제출을 확인하고 실제 다음 공정으로 인계" }));
    expect(active.onCommand).toHaveBeenCalledWith({ type: "handoff-role-pipeline", expectedProjectRevision: active.aggregate.revision });
  });
  it("권한·미확인 요청으로 disabled인 관리 화면에서는 명령을 실행하지 않는다", () => {
    const f = setup(true, true);
    fireEvent.click(screen.getByRole("button", { name: "승인된 제출을 확인하고 실제 다음 공정으로 인계" }));
    fireEvent.click(screen.getByRole("button", { name: "이 프로젝트의 보호 끄기" }));
    expect(f.onCommand).not.toHaveBeenCalled();
  });
  it("승인 후 편집 대상이 없어도 서버 canHandoff가 있는 실제 담당자는 인계만 제공한다", () => {
    const f = setup(true, false, false, true);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "이 프로젝트의 보호 끄기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "실제 보호 연결 저장" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "승인된 제출을 확인하고 실제 다음 공정으로 인계" }));
    expect(f.onCommand).toHaveBeenCalledWith({ type: "handoff-role-pipeline", expectedProjectRevision: f.aggregate.revision });
  });
});
