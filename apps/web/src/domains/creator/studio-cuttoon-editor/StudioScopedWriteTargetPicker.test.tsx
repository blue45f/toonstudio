// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDIO_ROLE_PIPELINE_STAGES } from "@toonstudio/contracts/studio-role-pipeline";
import { createStudioScopedWriteFixture } from "../studio-collab/studio-scoped-write.test-fixture";
import type { StudioScopedWritePolicy } from "@toonstudio/contracts/studio-scoped-write";
import { StudioScopedWriteTargetPicker } from "./StudioScopedWriteTargetPicker";

afterEach(cleanup);
describe("명시적인 담당 원고 선택의 실제 편집 위치", () => {
  it.each([false, true])("fullEdit=%s에서도 선택한 실제 페이지·레이어·컷만 라우팅한다", (fullEdit) => {
    const f = createStudioScopedWriteFixture();
    const policy: StudioScopedWritePolicy = { ...f.policy, fullEdit,
      grants: f.policy.grants.map((grant) => ({ ...grant, endsAt: null })),
      targets: f.policy.targets.map((target) => ({ ...target, definition: { ...target.definition,
        layerId: target.definition.id === "target-1" ? "actual-layer" : "page-root", frameId: "actual-frame" } })),
      rolePipeline: { version: 1, productionProjectId: "production-1", enabled: true, activeStageId: "story-script",
        roleBindings: [{ roleId: "story", assignmentId: "assignment-1" }], groupMappings: [{ groupId: "story-notes", targetIds: ["target-1"] }],
        stageTasks: STUDIO_ROLE_PIPELINE_STAGES.map((stage, i) => ({ stageId: stage.id, taskId: i === 0 ? "current-task-1" : `task-${i}` })), frozenStageIds: [], approvedAt: null, history: [] },
      rolePipelineAccess: { editableTargetIds: ["target-1"], frozenTargetIds: [] } };
    f.authority.setPolicy(policy);
    const onPage = vi.fn(), onLayer = vi.fn(), onDraw = vi.fn();
    render(<StudioScopedWriteTargetPicker runtime={{ authority: f.authority, policy, loading: false, error: null, refresh: async () => policy }} currentPageId="page-1"
      onPage={onPage} onLayer={onLayer} onDraw={onDraw} />);
    expect(onPage).not.toHaveBeenCalled(); expect(onLayer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: JSON.stringify(["target-1", "grant-1"]) } });
    expect(onPage).toHaveBeenLastCalledWith("page-1"); expect(onLayer).toHaveBeenLastCalledWith("actual-layer", "actual-frame");
    fireEvent.click(screen.getByRole("button", { name: "이 범위에서 그리기" }));
    expect(onDraw).toHaveBeenCalledTimes(1); expect(onLayer).toHaveBeenCalledTimes(2);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: JSON.stringify(["target-2", "grant-2"]) } });
    expect(onLayer).toHaveBeenLastCalledWith(null, "actual-frame");
  });
});
