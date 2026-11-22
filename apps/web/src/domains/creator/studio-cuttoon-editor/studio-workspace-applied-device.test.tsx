// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, cleanup, render } from "@testing-library/react";
import { createElement, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readStudioWorkspaceDeviceSignalsFromGlobals } from "../studio-workspace-device-signals";
import {
  DEFAULT_STUDIO_WORKSPACE_STATE, captureStudioWorkspaceDeviceLayout,
  normalizeStudioWorkspaceLayout, resolveStudioWorkspaceControlSide,
  resolveStudioWorkspaceDeviceKind, resolveStudioWorkspaceDeviceLayout, saveStudioWorkspace,
  type StudioMobileControlSide, type StudioWorkspaceDesktopLayout, type StudioWorkspaceDeviceKind,
  type StudioWorkspaceLayout, type StudioWorkspaceState,
} from "../studio-workspaces";

type ApplySource = "switch" | "reload" | "owner-hydration" | "owner-scope-change";
interface Snapshot {
  readonly appliedDevice: StudioWorkspaceDeviceKind | null;
  readonly observedDevice: () => StudioWorkspaceDeviceKind | null;
  readonly captured: StudioWorkspaceLayout;
  readonly presented: StudioWorkspaceDesktopLayout;
  readonly controlSide: StudioMobileControlSide;
  readonly apply: (layout: StudioWorkspaceLayout, source: ApplySource) => void;
  readonly editDesktop: (patch: Partial<StudioWorkspaceDesktopLayout>) => void;
}

// 거대한 Host 전체의 renderer를 모킹하지 않는다. 실제 관측 effect·적용 함수·캡처 memo를
// 가져와 React로 실행하고, 화면 패널 setter만 작은 상태로 연결한다.
const source = readFileSync(resolve("apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx"), "utf8");
const tree = ts.createSourceFile("StudioCuttoonEditorHost.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function bindingNames(name: ts.BindingName): readonly string[] {
  return ts.isIdentifier(name) ? [name.text] : name.elements.flatMap((element) =>
    ts.isBindingElement(element) ? bindingNames(element.name) : []);
}
function statement(name: string): ts.VariableStatement | ts.FunctionDeclaration {
  const found: Array<ts.VariableStatement | ts.FunctionDeclaration> = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found.push(node);
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) =>
      bindingNames(declaration.name).includes(name))) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const result = found[0];
  if (!result || found.length !== 1) throw new Error(`Host workspace binding must be unique: ${name}`);
  return result;
}
const deviceBindings = source.slice(statement("workspaceDevicePointerTypeRef").getStart(tree),
  statement("initialWorkspaceDeviceLayout").getEnd());
const captureBinding = statement("liveWorkspaceLayout").getText(tree);
const applyBinding = statement("applyStudioWorkspaceLayout").getText(tree);
const emitted = ts.transpileModule(`
const { useEffect, useEffectEvent, useMemo, useRef, useState,
  captureStudioWorkspaceDeviceLayout, normalizeStudioWorkspaceLayout,
  resolveStudioWorkspaceControlSide, resolveStudioWorkspaceDeviceKind,
  resolveStudioWorkspaceDeviceLayout, readStudioWorkspaceDeviceSignalsFromGlobals } = bindings;
return function useHostWorkspaceFixture(workspaceState, publish) {
  ${deviceBindings}
  const [desktop, setDesktop] = useState(initialWorkspaceDeviceLayout.desktop);
  const [inspectorLayout, setInspectorLayout] = useState(initialWorkspaceDeviceLayout.inspector);
  const [drawingPaletteLayout, setDrawingPaletteLayout] = useState(initialWorkspaceDeviceLayout.drawingPalettes);
  const [quickActionsPreferences, setQuickActionsPreferences] = useState(initialWorkspaceDeviceLayout.quickActions);
  const setLeftPanelOpenWithOverride = (value) => setDesktop((prior) => ({ ...prior, leftPanelOpen: value }));
  const setRightPanelOpenWithOverride = (value) => setDesktop((prior) => ({ ...prior, rightPanelOpen: value }));
  const leftResizeSetWidthRef = { current: (value) => setDesktop((prior) => ({ ...prior, leftPanelWidth: value })) };
  const rightResizeSetWidthRef = { current: (value) => setDesktop((prior) => ({ ...prior, rightPanelWidth: value })) };
  const viewportPanelMemory = { authoredDesktop: desktop, authoredDrawingPalettes: drawingPaletteLayout,
    onWorkspaceLayoutApplied: () => undefined };
  const workspacePersistenceRef = { current: { state: workspaceState } };
  const canvasWidePanelRestoreRef = { current: { left: true, right: true } };
  const propsSheetRef = { current: null };
  const pendingSaveIntent = null, mobileSheet = null, uiDensityMode = "default";
  const studioRoute = { surface: "canvas" };
  const cancelDrawingPaletteDrag = () => undefined, setForceLeftPanelOpen = () => undefined;
  const setForceRightPanelOpen = () => undefined, setMobileSheet = () => undefined;
  const setQuickActionsOpen = () => undefined, closeStudioMenusForWorkspace = () => undefined;
  const applyStudioWorkspaceLaunchSurface = () => undefined, setWorkspaceSyncNotice = () => undefined;
  ${captureBinding}
  ${applyBinding}
  publish({ appliedDevice: workspaceDeviceKind, observedDevice: currentStudioWorkspaceDeviceKind,
    captured: liveWorkspaceLayout, presented: desktop, controlSide: workspaceControlSide,
    apply: (layout, source) => applyStudioWorkspaceLayout(layout, undefined, source),
    editDesktop: (patch) => setDesktop((prior) => ({ ...prior, ...patch })) });
}
`, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.None } });
const createHook = new Function("bindings", emitted.outputText);
const hostHook: unknown = createHook({ useEffect, useEffectEvent, useMemo, useRef, useState,
  captureStudioWorkspaceDeviceLayout, normalizeStudioWorkspaceLayout,
  resolveStudioWorkspaceControlSide, resolveStudioWorkspaceDeviceKind,
  resolveStudioWorkspaceDeviceLayout, readStudioWorkspaceDeviceSignalsFromGlobals });

function authoredLayout(): StudioWorkspaceLayout {
  const desktop = { leftPanelOpen: true, rightPanelOpen: true, leftPanelWidth: 240, rightPanelWidth: 300 };
  const adapted = { leftPanelOpen: false, rightPanelOpen: false, leftPanelWidth: 180, rightPanelWidth: 240 };
  return normalizeStudioWorkspaceLayout({ ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout, desktop,
    deviceOverrides: {
      "pen-display": { desktop: adapted, controlSide: "left" },
      touch: { desktop: { ...adapted, leftPanelWidth: 190 }, controlSide: "left" },
      mobile: { desktop: { ...adapted, rightPanelWidth: 250 }, controlSide: "left" },
    } });
}

function mountWorkspace(layout = authoredLayout(), coarse = false, width = 1440) {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("matchMedia", () => ({ matches: coarse }));
  let state: StudioWorkspaceState = { ...DEFAULT_STUDIO_WORKSPACE_STATE, liveLayout: layout };
  let snapshot: Snapshot | undefined;
  let renderCount = 0;
  const publish = (next: Snapshot) => { snapshot = next; renderCount += 1; };
  function Harness({ state: current }: { state: StudioWorkspaceState }) {
    if (typeof hostHook !== "function") throw new Error("Host workspace fixture did not produce a hook");
    hostHook(current, publish);
    return null;
  }
  const view = render(createElement(Harness, { state }));
  const read = () => {
    if (!snapshot) throw new Error("Host workspace fixture did not publish a snapshot");
    return snapshot;
  };
  return {
    read, renders: () => renderCount,
    observe(pointerType: string) {
      act(() => window.dispatchEvent(Object.assign(new Event("pointerdown"), { pointerType })));
    },
    apply(next = state.liveLayout, source: ApplySource = "switch") {
      act(() => read().apply(next, source));
    },
    editDesktop(patch: Partial<StudioWorkspaceDesktopLayout>) { act(() => read().editDesktop(patch)); },
    replaceState(next: StudioWorkspaceState) {
      state = next;
      view.rerender(createElement(Harness, { state }));
    },
  };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Host workspace capture follows the layout actually applied", () => {
  it.each([false, true])("mount의 적용 기기를 입력 관측만으로 바꾸지 않는다: coarse=%s", (coarse) => {
    const authored = authoredLayout(), view = mountWorkspace(authored, coarse);
    const initial = view.read(), renders = view.renders();
    expect(initial.appliedDevice).toBe(coarse ? "touch" : null);
    expect(initial.captured).toEqual(authored);
    for (const pointerType of ["mouse", "pen", "mouse", "pen"]) {
      view.observe(pointerType);
      expect(view.read().observedDevice()).toBe(pointerType === "pen" ? "pen-display" : "mouse");
      expect(view.read().presented).toEqual(initial.presented);
      expect(view.read().captured).toEqual(authored);
    }
    expect(view.read().appliedDevice).toBe(initial.appliedDevice);
    expect(view.renders()).toBe(renders);
  });

  it("pen 배치를 적용한 뒤 mouse 관측과 저장이 저자 desktop/기기 override를 오염시키지 않는다", () => {
    const authored = authoredLayout(), view = mountWorkspace(authored);
    view.observe("pen"); view.apply();
    expect(view.read().appliedDevice).toBe("pen-display");
    expect(view.read().presented).toEqual(authored.deviceOverrides["pen-display"]?.desktop);
    view.observe("mouse");
    view.editDesktop({ rightPanelWidth: 321 });
    const captured = view.read().captured;
    const saved = saveStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "혼합 입력 저장", captured);
    expect(saved.customWorkspaces.at(-1)?.layout.desktop).toEqual(authored.desktop);
    expect(saved.customWorkspaces.at(-1)?.layout.deviceOverrides["pen-display"]?.desktop.rightPanelWidth).toBe(321);
    expect(captured.desktop).toEqual(authored.desktop);
    expect(captured.deviceOverrides["pen-display"]?.desktop.rightPanelWidth).toBe(321);
    expect(captured.deviceOverrides.mouse).toBeUndefined();
    expect(view.read().appliedDevice).toBe("pen-display");
  });

  it.each(["reload", "owner-hydration", "owner-scope-change"] as const)("%s는 실제 새 적용 시점의 기기를 캡처에 함께 고정한다", (source) => {
    const authored = authoredLayout(), view = mountWorkspace(authored);
    view.observe("pen"); view.apply();
    view.observe("mouse");
    view.apply(authored, source);
    expect(view.read().appliedDevice).toBe("mouse");
    expect(view.read().presented).toEqual(authored.desktop);
    expect(view.read().captured).toEqual(authored);
    view.observe("pen");
    expect(view.read().captured).toEqual(authored);
    expect(view.read().appliedDevice).toBe("mouse");
  });

  it("좁은 화면의 pen/mobile 적용도 이후 mouse 입력과 독립적으로 유지된다", () => {
    const authored = authoredLayout(), view = mountWorkspace(authored, false, 768);
    view.observe("pen");
    expect(view.read().observedDevice()).toBe("mobile");
    view.apply();
    expect(view.read().appliedDevice).toBe("mobile");
    expect(view.read().presented).toEqual(authored.deviceOverrides.mobile?.desktop);
    view.observe("mouse");
    expect(view.read().captured).toEqual(authored);
    expect(view.read().appliedDevice).toBe("mobile");
  });

  it("소유자가 바뀌어 다른 원본 배치를 적용하면 이전 기기의 화면 기하를 새 원본에 쓰지 않는다", () => {
    const first = authoredLayout(), view = mountWorkspace(first);
    view.observe("pen"); view.apply(); view.observe("mouse");
    const next = normalizeStudioWorkspaceLayout({ ...first,
      desktop: { ...first.desktop, leftPanelWidth: 260, rightPanelWidth: 320 },
      deviceOverrides: { ...first.deviceOverrides,
        "pen-display": { desktop: { ...first.desktop, leftPanelWidth: 200 }, controlSide: "right" } } });
    view.replaceState({ ...DEFAULT_STUDIO_WORKSPACE_STATE, liveLayout: next });
    view.apply(next, "owner-scope-change");
    expect(view.read().presented).toEqual(next.desktop);
    expect(view.read().appliedDevice).toBe("mouse");
    view.observe("pen");
    expect(view.read().captured).toEqual(next);
    const saved = saveStudioWorkspace(DEFAULT_STUDIO_WORKSPACE_STATE, "새 소유자의 배치", view.read().captured);
    expect(saved.customWorkspaces.at(-1)?.layout).toEqual(next);
  });

  it("명시적 handedness 변경은 최근 입력을 해석해도 geometry의 적용 기기는 유지한다", () => {
    const base = authoredLayout();
    const authored = normalizeStudioWorkspaceLayout({ ...base, deviceOverrides: { ...base.deviceOverrides,
      mouse: { desktop: base.desktop, controlSide: "right" } } });
    const view = mountWorkspace(authored);
    view.replaceState({ ...DEFAULT_STUDIO_WORKSPACE_STATE, liveLayout: authored, mobileControlSide: "left" });
    view.observe("pen"); view.apply();
    expect(view.read().controlSide).toBe("left");
    view.observe("mouse");
    expect(view.read().controlSide).toBe("left");
    view.replaceState({ ...DEFAULT_STUDIO_WORKSPACE_STATE, liveLayout: authored, mobileControlSide: "right" });
    expect(view.read().controlSide).toBe("right");
    expect(view.read().captured).toEqual(authored);
    expect(view.read().appliedDevice).toBe("pen-display");
  });
});
