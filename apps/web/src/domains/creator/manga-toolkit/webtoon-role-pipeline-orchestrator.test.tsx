// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudioBlankComicProDrawingSubPanel } from "./StudioBlankComicProDrawingSubPanel";
import { StudioWebtoonRolePipelineSubPanel } from "./StudioWebtoonRolePipelineSubPanel";
import {
  createInitialRolePipelineHandoffState,
  evaluateRoleLayerEditGuard,
  executeOneClickStageHandoff,
  resolveRolePipelinePreset,
  WEBTOON_CANONICAL_LAYER_GROUPS,
  WEBTOON_E2E_ROLE_PIPELINE_STAGES,
} from "./webtoon-role-pipeline-orchestrator";

describe("Webtoon Role Specialization, Tailored Menus & Layer-RBAC Orchestrator", () => {
  it("defines 8 end-to-end pipeline stages and 18 canonical webtoon layer groups", () => {
    expect(WEBTOON_E2E_ROLE_PIPELINE_STAGES).toHaveLength(8);
    expect(WEBTOON_CANONICAL_LAYER_GROUPS).toHaveLength(18);
  });

  it("resolves specialized menu/command-bar presets and strict layer RBAC for sub-roles", () => {
    const flatColorAssistant = resolveRolePipelinePreset("flat-color-assistant");
    expect(flatColorAssistant.stage.id).toBe("flat-color-mask");
    expect(flatColorAssistant.allowedLayerGroups).toEqual(["flat-color", "color-mask"]);
    expect(flatColorAssistant.lockedLayerGroups).toContain("main-lineart");
    expect(flatColorAssistant.lockedLayerGroups).toContain("dialogue-draft");
    expect(flatColorAssistant.requiresLeadReview).toBe(true);

    const storyWriter = resolveRolePipelinePreset("story");
    expect(storyWriter.stage.id).toBe("story-script");
    expect(storyWriter.allowedLayerGroups).toContain("story-notes");
    expect(storyWriter.allowedLayerGroups).toContain("dialogue-draft");
    expect(storyWriter.lockedLayerGroups).toContain("main-lineart");

    const associateWriter = resolveRolePipelinePreset("associate-writer");
    expect(associateWriter.requiresLeadReview).toBe(true);
    expect(associateWriter.canonWriteAccess).toBe("propose-only");
  });

  it("enforces strict RBAC layer edit guards and approved-freeze protection", () => {
    // 밑색 어시스턴트가 밑색 레이어를 편집할 때는 허용
    const allowFlat = evaluateRoleLayerEditGuard({
      roleId: "flat-color-assistant",
      targetLayerGroup: "flat-color",
    });
    expect(allowFlat.allowed).toBe(true);
    expect(allowFlat.code).toBe("allowed");

    // 밑색 어시스턴트가 주연 메인 선화 레이어를 건드리면 즉시 차단
    const blockMainLine = evaluateRoleLayerEditGuard({
      roleId: "flat-color-assistant",
      targetLayerGroup: "main-lineart",
    });
    expect(blockMainLine.allowed).toBe(false);
    expect(blockMainLine.code).toBe("blocked-role-rbac");

    // 타 작업자 선점 잠금 시 차단
    const blockOtherUser = evaluateRoleLayerEditGuard({
      roleId: "line-art",
      targetLayerGroup: "main-lineart",
      lockedByOtherUser: "김작가",
    });
    expect(blockOtherUser.allowed).toBe(false);
    expect(blockOtherUser.code).toBe("blocked-other-user-lock");

    // 최종 승인 동결(Freeze) 상태에서는 일반 작화 직군 차단, PD/편집자는 허용
    const blockFrozen = evaluateRoleLayerEditGuard({
      roleId: "line-art",
      targetLayerGroup: "main-lineart",
      isApprovedFrozen: true,
    });
    expect(blockFrozen.allowed).toBe(false);
    expect(blockFrozen.code).toBe("blocked-approved-freeze");

    const allowPdOnFrozen = evaluateRoleLayerEditGuard({
      roleId: "producer",
      targetLayerGroup: "review-annotation",
      isApprovedFrozen: true,
    });
    expect(allowPdOnFrozen.allowed).toBe(true);
  });

  it("advances through all 8 stages via 1-click handoff and locks upstream layers", () => {
    let state = createInitialRolePipelineHandoffState();
    expect(state.activeStageId).toBe("story-script");

    state = executeOneClickStageHandoff(state);
    expect(state.activeStageId).toBe("storyboard-conte");
    expect(state.frozenLayerGroups).toContain("story-notes");
    expect(state.frozenLayerGroups).toContain("dialogue-draft");

    // 나머지 공정 연속 인계 후 최종 승인 동결 확인
    for (let i = 0; i < 7; i += 1) {
      state = executeOneClickStageHandoff(state);
    }
    expect(state.isEpisodeApprovedFrozen).toBe(true);
    expect(state.frozenLayerGroups).toHaveLength(18);
  });

  it("renders StudioWebtoonRolePipelineSubPanel and integrates into StudioBlankComicProDrawingSubPanel", () => {
    render(<StudioWebtoonRolePipelineSubPanel />);
    expect(screen.getByTestId("webtoon-role-pipeline-section")).toBeTruthy();
    expect(screen.getByTestId("role-layer-guard-status").textContent).toContain(
      "RBAC 잠금 차단",
    );

    // 허용된 레이어('밑색 채우기') 칩 클릭 시 편집 허용으로 전환
    fireEvent.click(screen.getByTestId("role-layer-chip-flat-color"));
    expect(screen.getByTestId("role-layer-guard-status").textContent).toContain(
      "편집 허용",
    );

    // 원클릭 인계 버튼 클릭 시 2단계 콘티·연출로 전환
    fireEvent.click(screen.getByTestId("role-pipeline-handoff-btn"));
    expect(screen.getByTestId("role-pipeline-active-stage-label").textContent).toContain(
      "2단계",
    );

    render(<StudioBlankComicProDrawingSubPanel />);
    fireEvent.click(screen.getByTestId("pro-drawing-tab-role-pipeline"));
    expect(
      screen.getAllByTestId("webtoon-role-pipeline-section").length,
    ).toBeGreaterThanOrEqual(1);
  });
});
