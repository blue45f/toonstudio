import { describe, expect, it } from "vitest";

import {
  createStudioWorkspaceDefaultState,
  normalizeStudioCommandBarPreferences,
  saveStudioWorkspace,
  setStudioCommandBarVisible,
  switchStudioWorkspace,
  updateStudioWorkspaceLiveLayout,
  type StudioDefaultWorkspaceId,
} from "../studio-workspaces";
import { studioDrawingClarityEligible } from "./StudioDrawingClarityPolicy";

function input(): Parameters<typeof studioDrawingClarityEligible>[0] {
  return {
    baseline: { ownerScope: "guest", source: "default", state: createStudioWorkspaceDefaultState(null) },
    ownerScope: "guest", densityMode: "simple", documentWorkspace: "draw", workMode: "all",
    search: "", toolbarConfigured: false,
  };
}

describe("그리기 간소화의 진입 배치 보호", () => {
  it.each<StudioDefaultWorkspaceId>(["lineart", "pro-comic", "quick-sketch", "coloring", "pen-display", "mobile-draw"])("새 %s 기본 배치는 단순 화면을 허용한다", (workspaceId) => {
    const base = input();
    expect(studioDrawingClarityEligible({ ...base, baseline: {
      ownerScope: "guest", source: "default", state: switchStudioWorkspace(createStudioWorkspaceDefaultState(null), workspaceId),
    } })).toBe(true);
  });

  it.each(["", "?uiMode=basic", "?uiMode=standard&room=keep#canvas", "?drawingShell=app", "?drawingShell=integrated", "?roleWorkspace=lineart", "?roleWorkspace=custom-workspace", "?roleWorkspace=", "?roleWorkspace=lineart&roleWorkspace=review"])("주소 %s의 표준 그리기 진입을 허용한다", (search) => {
    expect(studioDrawingClarityEligible({ ...input(), search })).toBe(true);
  });

  it("만화 원고는 기본 만화 역할과 같은 화면을 쓰고 사용자가 지정한 다른 배치는 연다", () => {
    expect(studioDrawingClarityEligible({ ...input(), documentWorkspace: "comic", search: "?roleWorkspace=pro-comic" })).toBe(true);
    expect(studioDrawingClarityEligible({ ...input(), documentWorkspace: "comic", search: "?roleWorkspace=lineart" })).toBe(false);
  });

  it.each([
    "?uiMode=full", "?uiMode=studio", "?uiMode=unknown",
    "?uiMode=basic&uiMode=basic", "?roleWorkspace=review", "?roleWorkspace=pen-display",

  ])("명시한 화면·역할 주소 %s를 덮지 않는다", (search) => {
    expect(studioDrawingClarityEligible({ ...input(), search })).toBe(false);
  });

  it.each(["focus", "simple"])("퀵모드 %s 링크는 같은 드로잉 도구를 연다", (mode) => {
    const search = `?drawingShell=app&uiMode=${mode}&startTool=draw`;
    expect(studioDrawingClarityEligible({ ...input(), densityMode: "focus", search })).toBe(true);
    expect(studioDrawingClarityEligible({ ...input(), densityMode: "full", search })).toBe(false);
  });

  it("복원 대기·다른 계정·저장한 기본 배치를 새 사용자로 오인하지 않는다", () => {
    const base = input();
    const state = createStudioWorkspaceDefaultState(null);
    expect(studioDrawingClarityEligible({ ...base, baseline: null })).toBe(false);
    expect(studioDrawingClarityEligible({ ...base, ownerScope: "member" })).toBe(false);
    expect(studioDrawingClarityEligible({ ...base, baseline: { ownerScope: "guest", source: "current", state } })).toBe(false);
  });

  it("저장한 사용자 배치와 기본 배치의 개인 조정을 보존한다", () => {
    const base = input();
    const state = createStudioWorkspaceDefaultState(null);
    const custom = saveStudioWorkspace(state, "내 그리기 배치");
    const dirty = updateStudioWorkspaceLiveLayout(state, {
      ...state.liveLayout, desktop: { ...state.liveLayout.desktop, rightPanelWidth: state.liveLayout.desktop.rightPanelWidth + 24 },
    });
    const personalBar = updateStudioWorkspaceLiveLayout(state, {
      ...state.liveLayout, commandBar: setStudioCommandBarVisible(normalizeStudioCommandBarPreferences(state.liveLayout.commandBar), false),
    });
    for (const preserved of [custom, switchStudioWorkspace(custom, "lineart"), dirty, personalBar]) {
      expect(studioDrawingClarityEligible({ ...base, baseline: { ownerScope: "guest", source: "default", state: preserved } })).toBe(false);
    }
    expect(studioDrawingClarityEligible({ ...base, toolbarConfigured: true })).toBe(false);
  });

  it.each<StudioDefaultWorkspaceId>(["storyboard", "lettering", "animation", "review"])("그리기 밖 %s 작업공간을 바꾸지 않는다", (workspaceId) => {
    const base = input();
    expect(studioDrawingClarityEligible({ ...base, baseline: {
      ownerScope: "guest", source: "default", state: switchStudioWorkspace(createStudioWorkspaceDefaultState(null), workspaceId),
    } })).toBe(false);
  });

  it("집중·전체 밀도와 마감·식자 단계는 기존 화면을 유지한다", () => {
    for (const densityMode of ["focus", "full"] as const) {
      expect(studioDrawingClarityEligible({ ...input(), densityMode })).toBe(false);
    }
    for (const workMode of ["storyboard", "post", "lettering", "finish"] as const) {
      expect(studioDrawingClarityEligible({ ...input(), workMode })).toBe(false);
    }
  });
});
