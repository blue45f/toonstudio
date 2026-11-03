// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CreatorRoleId } from "@/shared/lib/creator-role-contract";
import { useI18n } from "@/shared/lib/i18n";
import { StudioMenubarContent } from "../StudioMenubarContent";
import { createProps } from "../StudioMenubarContent.test-fixture";
import { STUDIO_MAIN_MENU_PRESENTATION_ORDER } from "../studio-main-menu-presentation";

const roleState = vi.hoisted(() => ({ activeRole: "background-assistant" as CreatorRoleId | null, listeners: new Set<() => void>() }));
vi.mock("./use-studio-menubar-role", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useStudioMenubarRole: () => useSyncExternalStore(
    (listener) => { roleState.listeners.add(listener); return () => { roleState.listeners.delete(listener); }; },
    () => roleState.activeRole,
  ) };
});
vi.mock("../studio-tool-belt-lazy-ui", () => ({ preloadStudioAssetToolPopoverBody: vi.fn() }));
vi.mock("../studio-page-lazy-ui", () => ({
  preloadStudioExportMenuPanel: vi.fn(), StudioExportMenuPanel: () => null,
  StudioMainMenu: ({ groups, surface }: { groups: readonly { id: string; label: string }[]; surface?: "primary" | "action" }) => (
    <nav data-role-menu={surface ?? "primary"}>{groups.map((group) => <button key={group.id} data-role-group={group.id}>{group.label}</button>)}</nav>
  ),
}));
const workspaceGate = vi.hoisted(() => vi.fn());
vi.mock("../StudioWorkspaceMenuGate", () => ({
  StudioWorkspaceMenuGate: ({ creatorRole }: { creatorRole?: CreatorRoleId | null }) => {
    workspaceGate(creatorRole);
    return null;
  },
}));
beforeEach(() => { roleState.activeRole = "background-assistant"; workspaceGate.mockClear(); });
afterEach(cleanup);
it("실제 메뉴 소비자가 직군 변경 후에도 모든 메뉴와 AI를 유지한다", () => {
  useI18n.setState({ lang: "en" });
  const ids = ["file", "edit", "view", "canvas", "layer", "select", "transform", "brush", "filter", "vector", "text", "comic", "animation", "3d", "collaboration", "window", "ai", "help"];
  const props = createProps({ studioMainMenuGroups: ids.map((id) => ({ id, label: id, items: [] })) });
  const view = render(<StudioMenubarContent {...props} />);
  const primary = () => [...view.container.querySelectorAll<HTMLElement>('[data-role-menu="primary"] [data-role-group]')].map((node) => node.dataset.roleGroup);
  expect(primary().slice(0, 4)).toEqual(["file", "insert", "canvas", "view"]);
  expect([...primary()].sort()).toEqual([...STUDIO_MAIN_MENU_PRESENTATION_ORDER].sort());
  act(() => { roleState.activeRole = "effect-assistant"; for (const listener of roleState.listeners) listener(); });
  expect(primary().slice(0, 4)).toEqual(["file", "filter", "layer", "create"]);
  expect(view.container.querySelector('[data-role-menu="action"] [data-role-group="ai"]')).toBeTruthy();
});

it("실제 상위 메뉴가 직무 변경과 미설정 상태를 작업공간 게이트에 전달한다", () => {
  render(<StudioMenubarContent {...createProps()} />);
  expect(workspaceGate).toHaveBeenLastCalledWith("background-assistant");
  act(() => { roleState.activeRole = "effect-assistant"; for (const listener of roleState.listeners) listener(); });
  expect(workspaceGate).toHaveBeenLastCalledWith("effect-assistant");
  act(() => { roleState.activeRole = null; for (const listener of roleState.listeners) listener(); });
  expect(workspaceGate).toHaveBeenLastCalledWith(null);
});
