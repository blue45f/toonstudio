// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioWorkspaceMenu } from "../StudioWorkspaceMenu";
import {
  DEFAULT_STUDIO_WORKSPACE_STATE, normalizeStudioWorkspaceLayout,
  saveStudioWorkspace, switchStudioWorkspace,
  type StudioWorkspaceDeviceKind, type StudioWorkspaceState,
} from "../studio-workspaces";

const persisted = { status: "persisted", failure: null } as const;
const authoredDesktop = { leftPanelOpen: true, rightPanelOpen: true, leftPanelWidth: 240, rightPanelWidth: 300 };
const penDesktop = { leftPanelOpen: false, rightPanelOpen: false, leftPanelWidth: 180, rightPanelWidth: 240 };

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderDeviceMenu(appliedDeviceKind: StudioWorkspaceDeviceKind | null | undefined, observedDevice: StudioWorkspaceDeviceKind) {
  const layout = normalizeStudioWorkspaceLayout({
    ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
    desktop: authoredDesktop,
    deviceOverrides: { "pen-display": { desktop: penDesktop, controlSide: "left" } },
  });
  const saved = saveStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "혼합 입력 배치", layout);
  const custom = saved.customWorkspaces.at(-1);
  if (!custom) throw new Error("기기 배치를 저장할 사용자 작업공간이 없습니다.");
  const state = switchStudioWorkspace(saved, custom.id);
  const onStateChange = vi.fn((_next: StudioWorkspaceState) => persisted);
  const onApplyLayout = vi.fn();
  const resolveDeviceKind = vi.fn(() => observedDevice);
  const applied = appliedDeviceKind === undefined ? {} : { appliedDeviceKind };
  render(<StudioWorkspaceMenu initialOpen state={state} liveLayout={state.liveLayout}
    {...applied} resolveDeviceKind={resolveDeviceKind} persistence={persisted}
    onStateChange={onStateChange} onApplyLayout={onApplyLayout} />);
  fireEvent.click(screen.getByRole("button", { name: /^작업공간 관리$/ }));
  fireEvent.click(screen.getByRole("button", { name: /^전환 설정$/ }));
  const devices = within(screen.getByRole("group", { name: "조정할 기기" }));
  const saveCurrentDocks = () => {
    fireEvent.click(screen.getByRole("button", { name: /^지금 도크로$/ }));
    expect(onStateChange).toHaveBeenCalledTimes(1);
    const next = onStateChange.mock.calls[0]?.[0];
    if (!next) throw new Error("실제 메뉴가 저장할 작업공간을 전달하지 않았습니다.");
    expect(onApplyLayout).toHaveBeenCalledExactlyOnceWith(next.liveLayout, custom.id);
    expect(state.liveLayout).toEqual(layout);
    return next;
  };
  return { devices, resolveDeviceKind, saveCurrentDocks };
}

describe("지금 도크로 저장할 원본과 기기 선택의 분리", () => {
  it("pen 배치를 적용한 뒤 mouse로 연 실제 메뉴는 보이는 180/240을 mouse에 저장한다", () => {
    const menu = renderDeviceMenu("pen-display", "mouse");
    expect(menu.devices.getByRole("button", { name: /^마우스 · 지금 이 기기/ }).getAttribute("aria-pressed")).toBe("true");
    const next = menu.saveCurrentDocks();
    expect(next.liveLayout.deviceOverrides.mouse?.desktop).toEqual(penDesktop);
    expect(next.liveLayout.desktop).toEqual(authoredDesktop);
    expect(next.liveLayout.deviceOverrides["pen-display"]).toEqual({ desktop: penDesktop, controlSide: "left" });
    expect(next.customWorkspaces.at(-1)?.layout).toEqual(next.liveLayout);
    expect(menu.resolveDeviceKind).toHaveBeenCalledTimes(1);
  });

  it("명시 null은 pen 관측 후에도 저자 초기 배치 240/300을 복사한다", () => {
    const menu = renderDeviceMenu(null, "pen-display");
    const next = menu.saveCurrentDocks();
    expect(next.liveLayout.deviceOverrides["pen-display"]).toEqual({ desktop: authoredDesktop, controlSide: "left" });
    expect(next.liveLayout.desktop).toEqual(authoredDesktop);
  });

  it("적용 기기를 제공하지 않은 기존 호출자는 관측한 기기의 복사 동작을 유지한다", () => {
    const menu = renderDeviceMenu(undefined, "pen-display");
    expect(menu.saveCurrentDocks().liveLayout.deviceOverrides["pen-display"]?.desktop).toEqual(penDesktop);
  });

  it("저장 대상을 mobile로 골라도 원본은 적용 중인 pen 도크로 유지한다", () => {
    const menu = renderDeviceMenu("pen-display", "mouse");
    const mobile = menu.devices.getByRole("button", { name: /^모바일 · 저장된 배치를 따름/ });
    fireEvent.click(mobile);
    expect(mobile.getAttribute("aria-pressed")).toBe("true");
    const next = menu.saveCurrentDocks();
    expect(next.liveLayout.deviceOverrides.mobile?.desktop).toEqual(penDesktop);
    expect(next.liveLayout.deviceOverrides.mouse).toBeUndefined();
    expect(next.liveLayout.desktop).toEqual(authoredDesktop);
  });
});
