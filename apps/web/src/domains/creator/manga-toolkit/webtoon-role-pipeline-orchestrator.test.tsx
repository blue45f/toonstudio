// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { StudioBlankComicProDrawingSubPanel } from "./StudioBlankComicProDrawingSubPanel";
import { StudioWebtoonRolePipelineSubPanel } from "./StudioWebtoonRolePipelineSubPanel";
import {
  createInitialRolePipelineHandoffState,
  evaluateRoleLayerEditGuard,
  evaluateRolePipelineHandoff,
  executeOneClickStageHandoff,
  resolveRolePipelinePreset,
  WEBTOON_CANONICAL_LAYER_GROUPS,
  WEBTOON_E2E_ROLE_PIPELINE_STAGES,
} from "./webtoon-role-pipeline-orchestrator";

import { useI18n } from "@/shared/lib/i18n";

beforeEach(() => useI18n.setState({ lang: "ko" }));

describe("웹툰 직군별 메뉴·권한 예시와 지역 인계 계획", () => {
  it("8개 공정과 18개 그룹의 제작 계획을 제공한다", () => {
    expect(WEBTOON_E2E_ROLE_PIPELINE_STAGES).toHaveLength(8);
    expect(WEBTOON_CANONICAL_LAYER_GROUPS).toHaveLength(18);
  });

  it("세부 직군의 담당 예시와 책임자 검토 조건을 구분한다", () => {
    const flatColorAssistant = resolveRolePipelinePreset("flat-color-assistant");
    expect(flatColorAssistant.stage.id).toBe("flat-color-mask");
    expect(flatColorAssistant.allowedLayerGroups).toEqual(["flat-color", "color-mask"]);
    expect(flatColorAssistant.lockedLayerGroups).toContain("main-lineart");
    expect(flatColorAssistant.lockedLayerGroups).toContain("dialogue-draft");
    expect(flatColorAssistant.requiresLeadReview).toBe(true);
    expect(flatColorAssistant.permissionBadgeKo).toContain("권한 예시");

    const storyWriter = resolveRolePipelinePreset("story");
    expect(storyWriter.stage.id).toBe("story-script");
    expect(storyWriter.allowedLayerGroups).toContain("story-notes");
    expect(storyWriter.allowedLayerGroups).toContain("dialogue-draft");
    expect(storyWriter.lockedLayerGroups).toContain("main-lineart");

    const associateWriter = resolveRolePipelinePreset("associate-writer");
    expect(associateWriter.requiresLeadReview).toBe(true);
    expect(associateWriter.canonWriteAccess).toBe("propose-only");
  });

  it.each(["planner", "reviewer", "educator"] as const)("읽기 전용 %s 예시는 편집·승인을 허용하지 않는다", (roleId) => {
    const preset = resolveRolePipelinePreset(roleId);
    expect(preset.canonWriteAccess).toBe("read-only");
    expect(preset.allowedLayerGroups).toEqual([]);
    expect(preset.canApproveDepartment).toBe(false);
    expect(preset.permissionBadgeKo).toContain("읽기 전용");
    expect(evaluateRoleLayerEditGuard({ roleId, targetLayerGroup: "review-annotation" }).allowed).toBe(false);
  });

  it("담당 그룹·선점 예시·최종 동결을 구분해 판정한다", () => {
    const allowFlat = evaluateRoleLayerEditGuard({ roleId: "flat-color-assistant", targetLayerGroup: "flat-color" });
    expect(allowFlat.allowed).toBe(true);
    expect(allowFlat.code).toBe("allowed");
    expect(allowFlat.reasonKo).toContain("책임자 검토");

    const blockMainLine = evaluateRoleLayerEditGuard({ roleId: "flat-color-assistant", targetLayerGroup: "main-lineart" });
    expect(blockMainLine.allowed).toBe(false);
    expect(blockMainLine.code).toBe("blocked-role-rbac");

    const blockOtherUser = evaluateRoleLayerEditGuard({ roleId: "line-art", targetLayerGroup: "main-lineart", lockedByOtherUser: "김작가" });
    expect(blockOtherUser.allowed).toBe(false);
    expect(blockOtherUser.code).toBe("blocked-other-user-lock");

    const blockFrozen = evaluateRoleLayerEditGuard({ roleId: "line-art", targetLayerGroup: "main-lineart", isApprovedFrozen: true });
    expect(blockFrozen.allowed).toBe(false);
    expect(blockFrozen.code).toBe("blocked-approved-freeze");
    expect(evaluateRoleLayerEditGuard({ roleId: "producer", targetLayerGroup: "review-annotation", isApprovedFrozen: true }).code).toBe("blocked-approved-freeze");
    expect(evaluateRoleLayerEditGuard({ roleId: "creator", targetLayerGroup: "story-notes", frozenLayerGroups: ["story-notes"] }).code).toBe("blocked-upstream-freeze");
  });

  it("담당 공정이 아닌 직군과 읽기 전용 직군은 인계 계획을 진행하지 못한다", () => {
    const initial = createInitialRolePipelineHandoffState();
    expect(evaluateRolePipelineHandoff(initial, "flat-color-assistant").code).toBe("blocked-role");
    expect(executeOneClickStageHandoff(initial, { actorRoleId: "flat-color-assistant" })).toBe(initial);
    expect(executeOneClickStageHandoff(initial, { actorRoleId: "planner" })).toBe(initial);
    expect(executeOneClickStageHandoff(initial, { actorRoleId: "story" }).activeStageId).toBe("storyboard-conte");
    expect(executeOneClickStageHandoff(initial, { actorRoleId: "producer" }).activeStageId).toBe("storyboard-conte");
  });

  it("인계 이후 이전 공정 동결은 원래 담당 직군으로 돌아가도 유지한다", () => {
    const next = executeOneClickStageHandoff(createInitialRolePipelineHandoffState());
    expect(next.activeStageId).toBe("storyboard-conte");
    expect(next.frozenLayerGroups).toEqual(["story-notes", "dialogue-draft"]);
    const guard = evaluateRoleLayerEditGuard({ roleId: "story", targetLayerGroup: "story-notes", frozenLayerGroups: next.frozenLayerGroups });
    expect(guard.allowed).toBe(false);
    expect(guard.code).toBe("blocked-upstream-freeze");
    expect(evaluateRoleLayerEditGuard({ roleId: "storyboard", targetLayerGroup: "storyboard", frozenLayerGroups: next.frozenLayerGroups }).allowed).toBe(true);
  });

  it("8단계 최종 동결은 승인 예시 직군만 수행하고 완료 후 반복해도 상태를 보존한다", () => {
    let state = createInitialRolePipelineHandoffState();
    for (let i = 0; i < 7; i += 1) state = executeOneClickStageHandoff(state);
    expect(state.activeStageId).toBe("pd-editorial-review");
    expect(state.isEpisodeApprovedFrozen).toBe(false);
    expect(evaluateRolePipelineHandoff(state, "reviewer").code).toBe("blocked-final-approval");
    expect(executeOneClickStageHandoff(state, { actorRoleId: "reviewer" })).toBe(state);
    const approved = executeOneClickStageHandoff(state, { actorRoleId: "editor" });
    expect(approved.isEpisodeApprovedFrozen).toBe(true);
    expect(approved.frozenLayerGroups).toHaveLength(18);
    expect(approved.handoffHistory).toHaveLength(8);
    expect(executeOneClickStageHandoff(approved, { actorRoleId: "producer" })).toBe(approved);
    expect(evaluateRolePipelineHandoff(approved, "creator").code).toBe("blocked-completed");
    expect(JSON.parse(JSON.stringify(approved))).toEqual(approved);
  });

  it("공정·담당·동결·인계 이력이 불일치하면 입력을 그대로 보존한다", () => {
    const initial = createInitialRolePipelineHandoffState();
    const invalidStageOwner = { ...initial, activeStageId: "line-art-ink" as const };
    const next = executeOneClickStageHandoff(initial);
    const missingFreeze = { ...next, frozenLayerGroups: [] };
    const duplicateFreeze = { ...next, frozenLayerGroups: [...next.frozenLayerGroups, ...next.frozenLayerGroups] };
    const missingHistory = { ...next, handoffHistory: [] };
    for (const invalid of [invalidStageOwner, missingFreeze, duplicateFreeze, missingHistory]) {
      expect(evaluateRolePipelineHandoff(invalid, "creator").code).toBe("blocked-invalid-state");
      expect(executeOneClickStageHandoff(invalid, { actorRoleId: "creator" })).toBe(invalid);
    }
  });

  it("계획의 범위·동결 칩·불가 사유·선택 상태를 표시하고 초기화 시 직군과 공정을 맞춘다", () => {
    render(<StudioWebtoonRolePipelineSubPanel />);
    expect(screen.getByTestId("role-pipeline-scope-notice").textContent).toContain("실제 원고·서버 권한·담당자·작업공간은 변경하지 않습니다");
    expect(screen.getByTestId("role-pipeline-select-story").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("role-pipeline-select-flat-color-assistant"));
    expect(screen.getByTestId("role-layer-guard-status").textContent).toContain("계획상 편집 제외");
    fireEvent.click(screen.getByTestId("role-layer-chip-flat-color"));
    expect(screen.getByTestId("role-layer-guard-status").textContent).toContain("계획상 제안 가능");
    expect(screen.getByTestId("role-pipeline-handoff-btn").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("role-pipeline-handoff-reason").textContent).toContain("현재 공정");
    fireEvent.click(screen.getByTestId("role-pipeline-select-story"));
    fireEvent.click(screen.getByTestId("role-pipeline-handoff-btn"));
    expect(screen.getByTestId("role-pipeline-active-stage-label").textContent).toContain("2단계");
    fireEvent.click(screen.getByTestId("role-pipeline-select-story"));
    fireEvent.click(screen.getByTestId("role-layer-chip-story-notes"));
    expect(screen.getByTestId("role-layer-guard-reason").textContent).toContain("이전 공정 동결");
    expect(screen.getByTestId("role-layer-chip-story-notes").textContent).toContain("🔒");
    fireEvent.click(screen.getByTestId("role-pipeline-reset-btn"));
    expect(screen.getByTestId("role-pipeline-active-stage-label").textContent).toContain("1단계");
    expect(screen.getByTestId("role-pipeline-select-story").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("role-layer-chip-story-notes").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("role-pipeline-handoff-log")).toBeNull();
    expect(screen.getByTestId("role-pipeline-handoff-btn").hasAttribute("disabled")).toBe(false);
  });

  it("부모 패널의 탭에서 실제 분업 계획 패널을 마운트한다", () => {
    const standalone = render(<StudioWebtoonRolePipelineSubPanel />);
    expect(screen.getByTestId("webtoon-role-pipeline-section")).toBeTruthy();
    standalone.unmount();
    const parent = render(<StudioBlankComicProDrawingSubPanel />);
    const local = within(parent.container);
    expect(local.queryByTestId("webtoon-role-pipeline-section")).toBeNull();
    fireEvent.click(local.getByTestId("pro-drawing-tab-role-pipeline"));
    expect(local.getByTestId("webtoon-role-pipeline-section")).toBeTruthy();
  });

  it("영어 화면에도 계획 범위와 실제 적용하지 않는다는 안내를 제공한다", () => {
    act(() => useI18n.setState({ lang: "en" }));
    const view = render(<StudioWebtoonRolePipelineSubPanel />);
    expect(screen.getByRole("region", { name: "Production plan and permission preview" })).toBeTruthy();
    expect(screen.getByTestId("role-pipeline-scope-notice").textContent).toContain("does not change manuscripts, server permissions, assignees or workspaces");
    expect(screen.getByTestId("role-pipeline-handoff-btn").textContent).toContain("Plan next stage");
    view.unmount();
    act(() => useI18n.setState({ lang: "ko" }));
  });
});
