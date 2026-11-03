// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STUDIO_WORKSPACE_STATE,
  STUDIO_DEFAULT_WORKSPACES,
  normalizeStudioWorkspaceLayout,
  type StudioWorkspaceLayout,
  type StudioWorkspaceState,
} from "../studio-workspaces";
import type { CreatorRoleId } from "@/shared/lib/creator-role-contract";
import { StudioWorkspaceMenu } from "../StudioWorkspaceMenu";

const persisted = { status: "persisted", failure: null } as const;

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderWorkspaceMenu(
  liveLayout: StudioWorkspaceLayout = DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout
) {
  const onStateChange = vi.fn((_state: StudioWorkspaceState) => persisted);
  const onApplyLayout = vi.fn();
  render(
    <StudioWorkspaceMenu
      state={DEFAULT_STUDIO_WORKSPACE_STATE}
      liveLayout={liveLayout}
      persistence={persisted}
      onStateChange={onStateChange}
      onApplyLayout={onApplyLayout}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /^작업공간:/ }));
  return { onStateChange, onApplyLayout };
}

describe("StudioWorkspaceMenu friendly recommendation", () => {
  it("starts with the lowest-complexity workspace in one click", () => {
    const { onStateChange, onApplyLayout } = renderWorkspaceMenu();

    const action = screen.getByRole("button", {
      name: "빠른 스케치 작업공간으로 전환",
    });
    expect(screen.getByText("처음이라면 추천")).toBeTruthy();
    expect(action.getAttribute("data-workspace-id")).toBe("quick-sketch");
    fireEvent.click(action);

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange.mock.calls[0]?.[0].activeWorkspaceId).toBe("quick-sketch");
    expect(onApplyLayout).toHaveBeenCalledWith(
      expect.any(Object),
      "quick-sketch"
    );
  });

  it("still finds the Clip Studio migration preset with a familiar shorthand alias", () => {
    renderWorkspaceMenu();

    fireEvent.change(screen.getByRole("searchbox", { name: "작업공간 검색" }), {
      target: { value: "클튜" },
    });

    expect(screen.queryByTestId("studio-workspace-recommendation")).toBeNull();
    const result = screen.getByRole("button", {
      name: "클립 스튜디오형, 작업공간으로 전환",
    });
    expect(result.getAttribute("data-workspace-kind")).toBe("builtin");
    expect(result.getAttribute("data-workspace-id")).toBe("csp-migration");
  });

  it("실제 메뉴에서 Celtx로 찾은 스토리보드 배치로 전환한다", () => {
    const { onApplyLayout, onStateChange } = renderWorkspaceMenu();
    fireEvent.change(screen.getByRole("searchbox", { name: "작업공간 검색" }), {
      target: { value: "Celtx" },
    });
    const result = document.querySelector<HTMLButtonElement>(
      'button[data-workspace-id="storyboard"]',
    );
    expect(result).not.toBeNull();
    if (!result) throw new Error("Missing Celtx workspace result");
    expect(result.getAttribute("data-workspace-kind")).toBe("builtin");
    fireEvent.click(result);
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange.mock.calls[0]?.[0].activeWorkspaceId).toBe("storyboard");
    expect(onApplyLayout).toHaveBeenCalledWith(expect.any(Object), "storyboard");
  });

  it.each([
    { query: "MediBang", workspaceId: "mobile-draw" },
    { query: "Rebelle", workspaceId: "photo-edit" },
    { query: "ABLE", workspaceId: "pose-3d" },
    { query: "Spine", workspaceId: "animation" },
    { query: "NovelAI", workspaceId: "storyboard" },
  ])("실제 메뉴도 경쟁사 안내와 같은 $query 별칭으로 배치를 찾고 적용한다", ({ query, workspaceId }) => {
    const { onApplyLayout, onStateChange } = renderWorkspaceMenu();
    fireEvent.change(screen.getByRole("searchbox", { name: "작업공간 검색" }), {
      target: { value: query },
    });
    const result = document.querySelector<HTMLButtonElement>(`button[data-workspace-id="${workspaceId}"]`);
    if (!result) throw new Error(`${query} 작업공간 검색 결과가 없습니다.`);
    expect(result.getAttribute("data-workspace-kind")).toBe("builtin");
    expect(onApplyLayout).not.toHaveBeenCalled();
    expect(onStateChange).not.toHaveBeenCalled();
    fireEvent.click(result);
    expect(onApplyLayout).toHaveBeenCalledTimes(1);
    expect(onApplyLayout).toHaveBeenCalledWith(expect.any(Object), workspaceId);
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange.mock.calls[0]?.[0].activeWorkspaceId).toBe(workspaceId);
  });

  it("keeps unsaved layout changes behind the existing switch guard", () => {
    const dirtyLayout = normalizeStudioWorkspaceLayout({
      ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
      desktop: {
        ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout.desktop,
        leftPanelOpen: !DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout.desktop.leftPanelOpen,
      },
    });
    const { onStateChange, onApplyLayout } = renderWorkspaceMenu(dirtyLayout);

    fireEvent.click(screen.getByRole("button", {
      name: "빠른 스케치 작업공간으로 전환",
    }));

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/변경을 저장하고 전환할까요/)).toBeTruthy();
    expect(onStateChange).not.toHaveBeenCalled();
    expect(onApplyLayout).not.toHaveBeenCalled();
  });
  it.each([
    { query: "SketchUp", workspaceId: "pose-3d" },
    { query: "Celtx", workspaceId: "storyboard" },
  ])("실제 메뉴의 $query 선택도 미저장 배치 보호를 유지한다", ({ query, workspaceId }) => {
    const dirtyLayout = normalizeStudioWorkspaceLayout({
      ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
      desktop: { ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout.desktop, leftPanelOpen: !DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout.desktop.leftPanelOpen },
    });
    const { onApplyLayout, onStateChange } = renderWorkspaceMenu(dirtyLayout);
    fireEvent.change(screen.getByRole("searchbox", { name: "작업공간 검색" }), {
      target: { value: query },
    });
    const result = document.querySelector<HTMLButtonElement>(
      `button[data-workspace-id="${workspaceId}"]`,
    );
    expect(result).not.toBeNull();
    if (!result) throw new Error("Missing familiar-tool workspace result");
    fireEvent.click(result);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(onApplyLayout).not.toHaveBeenCalled();
    expect(onStateChange).not.toHaveBeenCalled();
  });

});

function roleMenuFixture() {
  const storyboard = STUDIO_DEFAULT_WORKSPACES.find((workspace) => workspace.id === "storyboard");
  if (!storyboard) throw new Error("스토리보드 작업공간이 필요합니다.");
  const state: StudioWorkspaceState = { ...DEFAULT_STUDIO_WORKSPACE_STATE, activeWorkspaceId: "storyboard", liveLayout: storyboard.layout };
  const onStateChange = vi.fn((_state: StudioWorkspaceState) => persisted);
  const onApplyLayout = vi.fn();
  const menu = (creatorRole: CreatorRoleId | null) => (
    <StudioWorkspaceMenu initialOpen state={state} liveLayout={state.liveLayout} creatorRole={creatorRole}
      persistence={persisted} onStateChange={onStateChange} onApplyLayout={onApplyLayout} />
  );
  return { menu, onStateChange, onApplyLayout };
}

it("직무 추천은 선택 전 배치를 바꾸지 않고 한 번의 클릭으로 선화 배치를 적용한다", () => {
  const { menu, onStateChange, onApplyLayout } = roleMenuFixture();
  render(menu("line-assistant"));
  expect(screen.getByText("내 직무에 맞춘 추천")).toBeTruthy();
  const action = screen.getByRole("button", { name: "선화 작업공간으로 전환" });
  expect(action.getAttribute("data-workspace-recommendation-action")).toBe("true");
  expect(action.getAttribute("data-workspace-id")).toBe("lineart");
  expect(onApplyLayout).not.toHaveBeenCalled();
  expect(onStateChange).not.toHaveBeenCalled();
  fireEvent.click(action);
  expect(onApplyLayout).toHaveBeenCalledTimes(1);
  expect(onApplyLayout).toHaveBeenCalledWith(expect.any(Object), "lineart");
  expect(onStateChange).toHaveBeenCalledTimes(1);
  expect(onStateChange.mock.calls[0]?.[0].activeWorkspaceId).toBe("lineart");
});

it("메뉴의 직무 변경과 미설정 상태가 이전 추천을 남기지 않는다", () => {
  const { menu, onApplyLayout, onStateChange } = roleMenuFixture();
  const view = render(menu("line-assistant"));
  const action = () => screen.getByTestId("studio-workspace-recommendation").querySelector("button");
  expect(action()?.getAttribute("data-workspace-id")).toBe("lineart");
  view.rerender(menu("background-assistant"));
  expect(action()?.getAttribute("data-workspace-id")).toBe("pose-3d");
  view.rerender(menu(null));
  expect(action()?.getAttribute("data-workspace-id")).toBe("quick-sketch");
  expect(screen.getByText("처음이라면 추천")).toBeTruthy();
  expect(screen.queryByText("내 직무에 맞춘 추천")).toBeNull();
  expect(onApplyLayout).not.toHaveBeenCalled();
  expect(onStateChange).not.toHaveBeenCalled();
});
