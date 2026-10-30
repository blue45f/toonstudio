// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useLayoutEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { serializeStudioCommandJournal } from "../../studio-command-journal";
import { createStudioHybridDccComponentSelection } from "../studio-hybrid-dcc-component-selection";
import { hybridDccCommitGeometry } from "../studio-hybrid-dcc-document";
import { deriveStudioHybridDccViewportSnapshot } from "../StudioHybridDccViewportCore";
import { workspaceUnwrapUvActive } from "../studio-hybrid-dcc-uv-edit";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "../studio-hybrid-dcc-workfile";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceAddUnitCube, workspaceRedo, workspaceUndo } from "../studio-hybrid-dcc-workspace";

import { StudioHybridDccToonEditor } from "./StudioHybridDccToonEditor";
import { deriveStudioHybridDccMaterialGroups } from "./studio-hybrid-dcc-toon-projection";
import { createStudioHybridDccDefaultToonMaterial, type StudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";
import { workspaceSetStudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-workspace";
import { useStudioHybridDccToonEditor } from "./useStudioHybridDccToonEditor";

import type { StudioHybridDccViewportSnapshot } from "../StudioHybridDccViewportCore";
import type { StudioHybridDccWorkspace } from "../studio-hybrid-dcc-workspace";
import type { StudioHybridDccUvEditorHost } from "../useStudioHybridDccUvEditor";
import type { StudioHybridDccToonEditorState } from "./useStudioHybridDccToonEditor";

const auth = vi.hoisted(() => ({ actor: "toon-owner", revision: 0, listeners: new Set<() => void>() }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => auth.actor, getAuthSessionRevision: () => auth.revision, listeners: auth.listeners,
}));
beforeEach(() => { auth.actor = "toon-owner"; auth.revision = 0; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

interface Pending { readonly canCommit: () => boolean; readonly release: () => boolean }
class Probe {
  workspace?: StudioHybridDccWorkspace; model?: StudioHybridDccToonEditorState; snapshot?: StudioHybridDccViewportSnapshot;
  setWorkspace?: (workspace: StudioHybridDccWorkspace) => void;
  readonly commits: StudioHybridDccWorkspace[] = []; readonly pending: Pending[] = []; runs = 0;
  recordRun() { this.runs += 1; }
  publish(workspace: StudioHybridDccWorkspace) { this.commits.push(workspace); }
  enqueue(value: Pending) { this.pending.push(value); }
  observe(workspace: StudioHybridDccWorkspace, model: StudioHybridDccToonEditorState, snapshot: StudioHybridDccViewportSnapshot, setWorkspace: (workspace: StudioHybridDccWorkspace) => void) {
    this.workspace = workspace; this.model = model; this.snapshot = snapshot; this.setWorkspace = setWorkspace;
  }
}
interface HarnessProps {
  readonly source: StudioHybridDccWorkspace; readonly probe: Probe; readonly project?: string;
  readonly readOnly?: boolean; readonly busy?: boolean; readonly enabled?: boolean; readonly hold?: boolean;
}

/** GPU를 흉내 내지 않는다. 실제 hook·Editor·정본·snapshot과 호스트의 지연 발행만 연결한다. */
function Harness({ source, probe, project = "toon-project", readOnly = false, busy = false, enabled = true, hold = false }: HarnessProps) {
  const [workspace, setWorkspace] = useState(source), [seenSource, setSeenSource] = useState(source), [waiting, setWaiting] = useState(false);
  if (seenSource !== source) { setSeenSource(source); setWorkspace(source); }
  const run: NonNullable<StudioHybridDccUvEditorHost["onRunWorkspaceEdit"]> = (_label, edit, canCommit = () => true) => {
    probe.recordRun(); if (!canCommit()) return;
    const result = edit(workspace, createStudioHybridDccComponentSelection());
    const publish = () => {
      const allowed = canCommit();
      if (allowed) { probe.publish(result.workspace); setWorkspace(result.workspace); }
      setWaiting(false); return allowed;
    };
    if (hold) { setWaiting(true); probe.enqueue({ canCommit, release: publish }); } else publish();
  };
  const model = useStudioHybridDccToonEditor({ workspace, onSelectAsset: () => undefined, editingDisabled: busy || waiting },
    { workspaceDocumentId: project, ...(readOnly ? {} : { onRunWorkspaceEdit: run }) }, enabled);
  const snapshot = deriveStudioHybridDccViewportSnapshot(workspace, "object", false, model.preview);
  useLayoutEffect(() => { probe.observe(workspace, model, snapshot, setWorkspace); }, [probe, workspace, model, snapshot]);
  return <><StudioHybridDccToonEditor model={model} /><output data-testid="toon-snapshot" data-signature={snapshot.signature} /></>;
}

function source(material: StudioHybridDccToonMaterial = createStudioHybridDccDefaultToonMaterial()) {
  let workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("toon-editor-doc"), "cube");
  const mesh = workspace.session.state.geometry.records.cube?.mesh; if (!mesh) throw new Error("원본 메시가 없습니다.");
  workspace = synchronizeWorkspaceGeometryAuthority(workspace, hybridDccCommitGeometry(workspace.session, "cube",
    { ...mesh, faces: mesh.faces.map((face) => ({ ...face, materialSlot: face.id < 3 ? 0 : 7 })) }));
  workspace = workspaceUnwrapUvActive(workspace);
  return workspaceSetStudioHybridDccToonMaterial(workspace, "cube", [0, 7], material);
}
function mount(options: Partial<Omit<HarnessProps, "probe">> = {}) {
  const probe = new Probe();
  let props: HarnessProps = { ...options, source: options.source ?? source(), probe };
  const view = render(<Harness {...props} />);
  return { probe, view, get source() { return props.source; }, rerender: (patch: Partial<HarnessProps>) => { props = { ...props, ...patch }; view.rerender(<Harness {...props} />); } };
}
function current(probe: Probe) { if (!probe.workspace || !probe.model || !probe.snapshot) throw new Error("Editor 관찰값이 없습니다."); return { workspace: probe.workspace, model: probe.model, snapshot: probe.snapshot }; }
function asset(probe: Probe) { const value = current(probe).snapshot.assets.find(({ assetId }) => assetId === "cube"); if (!value) throw new Error("실제 viewport 자산이 없습니다."); return value; }
function pending(probe: Probe) { const value = probe.pending.at(-1); if (!value) throw new Error("지연 발행이 없습니다."); return value; }
const editor = () => screen.getByRole("region", { name: "툰 재질 편집" });
const button = (name: string) => within(editor()).getByRole("button", { name });
function base(value = "#80c0ff") { fireEvent.change(within(editor()).getByLabelText(/^밝은 면 색/u), { target: { value } }); }
function scope(value: string) { fireEvent.change(within(editor()).getByLabelText("적용 범위"), { target: { value } }); }
function replaceWorkspace(probe: Probe, workspace: StudioHybridDccWorkspace) { if (!probe.setWorkspace) throw new Error("호스트 갱신 함수가 없습니다."); act(() => probe.setWorkspace?.(workspace)); }
// 실제 auth transitionSession처럼 계정 전환마다 revision도 증가시킨다.
function authChange(actor: string, revision = auth.revision + 1) { act(() => { auth.actor = actor; auth.revision = revision; auth.listeners.forEach((listener) => listener()); }); }
function groups(probe: Probe) { const value = asset(probe); if (!value.triangleMaterialSlots) throw new Error("실제 표시 slot이 없습니다."); return deriveStudioHybridDccMaterialGroups(value.triangleMaterialSlots, value.indices.length).groups; }

describe("실제 툰 Editor·hook의 정본과 표시 preview", () => {
  it("slot 미리보기는 실제 snapshot style·triangle group만 바꾸고 source·journal·UV·저장 bytes를 바꾸지 않는다", () => {
    const harness = mount(); const original = harness.source; const hash = original.session.state.stateHash;
    const journal = serializeStudioCommandJournal(original.session.journal), bytes = encodeStudioHybridDccWorkfile(original);
    const signature = current(harness.probe).snapshot.signature; const originalAsset = asset(harness.probe);
    expect(groups(harness.probe)).toHaveLength(1);
    scope("7"); base();
    expect(asset(harness.probe).toonMaterials?.["7"]?.baseColorSrgb).toBe("#80c0ff");
    expect(asset(harness.probe).toonMaterials?.["0"]?.baseColorSrgb).toBe("#f2f2f2");
    expect(groups(harness.probe)).toEqual([{ start: 0, count: 18, materialIndex: 0 }, { start: 18, count: 18, materialIndex: 1 }]);
    expect(current(harness.probe).snapshot.signature).not.toBe(signature);
    expect(asset(harness.probe).positions).toEqual(originalAsset.positions); expect(asset(harness.probe).cornerUvs).toEqual(originalAsset.cornerUvs);
    expect(current(harness.probe).workspace).toBe(original); expect(original.session.state.stateHash).toBe(hash);
    expect(serializeStudioCommandJournal(original.session.journal)).toBe(journal); expect(encodeStudioHybridDccWorkfile(original)).toEqual(bytes);
    expect(harness.probe.commits).toEqual([]);
    fireEvent.click(button("재질 미리보기 취소")); expect(current(harness.probe).snapshot.signature).toBe(signature);
    expect(groups(harness.probe)).toHaveLength(1); expect(current(harness.probe).model.preview).toBeUndefined();
    base(); fireEvent.keyDown(document.body, { key: "Escape" }); expect(current(harness.probe).model.preview).toBeTruthy();
    fireEvent.keyDown(within(editor()).getByRole("textbox", { name: /^그림자 경계/u }), { key: "Escape" });
    expect(current(harness.probe).model.preview).toBeUndefined(); expect(harness.probe.runs).toBe(0);
  });

  it("Editor를 포함한 외부 dialog 안의 Esc는 재질 preview를 취소하고 외부로 전파하지 않는다", () => {
    const probe = new Probe(); const original = source(); const outerEscape = vi.fn();
    render(<div role="dialog" aria-label="전체 작업대"><Harness source={original} probe={probe} /></div>);
    const outer = screen.getByRole("dialog", { name: "전체 작업대" }); outer.addEventListener("keydown", outerEscape);
    try {
      base(); expect(current(probe).model.preview).toBeTruthy();
      const input = within(editor()).getByRole("textbox", { name: /^그림자 경계/u });
      const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }); fireEvent(input, event);
      expect(current(probe).model.preview).toBeUndefined(); expect(event.defaultPrevented).toBe(true);
      expect(outerEscape).not.toHaveBeenCalled(); expect(current(probe).workspace).toBe(original); expect(probe.runs).toBe(0);
    } finally { outer.removeEventListener("keydown", outerEscape); }
  });

  it("Editor 안쪽 별도 dialog의 Esc는 내부 handler에 도달하고 재질 preview를 유지한다", () => {
    const harness = mount(); base(); const signature = current(harness.probe).snapshot.signature;
    const inner = document.createElement("div"); inner.setAttribute("role", "dialog"); inner.setAttribute("aria-label", "내부 색상 대화상자");
    const input = document.createElement("input"); input.setAttribute("aria-label", "내부 색상 값"); inner.append(input); editor().append(inner);
    const innerEscape = vi.fn((event: Event) => { if (event instanceof KeyboardEvent && event.key === "Escape") event.preventDefault(); });
    inner.addEventListener("keydown", innerEscape);
    try {
      const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }); fireEvent(input, event);
      expect(innerEscape).toHaveBeenCalledTimes(1); expect(event.defaultPrevented).toBe(true);
      expect(current(harness.probe).model.preview).toBeTruthy(); expect(current(harness.probe).snapshot.signature).toBe(signature);
      expect(current(harness.probe).workspace).toBe(harness.source); expect(harness.probe.runs).toBe(0);
    } finally { inner.removeEventListener("keydown", innerEscape); inner.remove(); }
  });

  it("명시 적용은 단일 undo이며 slot 선택·전체 적용·reset과 .toon3d 재열기가 실제 값을 보존한다", async () => {
    const harness = mount(); const before = harness.source; scope("7"); base();
    const apply = button("툰 재질 적용"); fireEvent.click(apply); fireEvent.click(apply);
    await waitFor(() => expect(harness.probe.commits).toHaveLength(1));
    const applied = current(harness.probe).workspace;
    expect(applied.session.undoStack.length).toBe(before.session.undoStack.length + 1); expect(applied.session.journal.length).toBe(before.session.journal.length + 1);
    expect(applied.session.state.geometry).toBe(before.session.state.geometry);
    expect(asset(harness.probe).toonMaterials?.["0"]?.baseColorSrgb).toBe("#f2f2f2"); expect(asset(harness.probe).toonMaterials?.["7"]?.baseColorSrgb).toBe("#80c0ff");
    const reopened = decodeStudioHybridDccWorkfile(Uint8Array.from(encodeStudioHybridDccWorkfile(applied)), { documentId: "toon-editor-reopened" });
    expect(reopened.session.state.materials).toEqual(applied.session.state.materials);
    replaceWorkspace(harness.probe, workspaceUndo(applied)); expect(asset(harness.probe).toonMaterials?.["7"]?.baseColorSrgb).toBe("#f2f2f2");
    replaceWorkspace(harness.probe, workspaceRedo(current(harness.probe).workspace)); expect(asset(harness.probe).toonMaterials?.["7"]?.baseColorSrgb).toBe("#80c0ff");
    scope("all"); base("#123456"); expect(groups(harness.probe)).toHaveLength(1); fireEvent.click(button("툰 재질 적용"));
    await waitFor(() => expect(harness.probe.commits).toHaveLength(2));
    expect(Object.values(asset(harness.probe).toonMaterials ?? {}).every((material) => material.baseColorSrgb === "#123456")).toBe(true);
    scope("7"); fireEvent.click(button("기본 재질로 복원")); await waitFor(() => expect(harness.probe.commits).toHaveLength(3));
    expect(asset(harness.probe).toonMaterials?.["7"]).toBeUndefined(); expect(asset(harness.probe).toonMaterials?.["0"]).toBeTruthy();
    scope("all"); fireEvent.click(button("기본 재질로 복원")); await waitFor(() => expect(harness.probe.commits).toHaveLength(4));
    expect(current(harness.probe).workspace.session.state.materials).toBeUndefined();
    harness.view.unmount(); const second = mount({ source: reopened }); expect(asset(second.probe).toonMaterials?.["7"]?.baseColorSrgb).toBe("#80c0ff");
  });

  it.each(["", "NaN", "Infinity", "1.01", "-1.01"])("잘못된 경계 숫자 %j는 접근 가능한 오류이며 강제 submit도 적용하지 않는다", (value) => {
    const harness = mount(); fireEvent.change(within(editor()).getByRole("textbox", { name: /^그림자 경계/u }), { target: { value } });
    expect(within(editor()).getByRole("alert").textContent).toMatch(/유한한|경계/u);
    expect(button("툰 재질 적용").matches(":disabled")).toBe(true);
    const form = editor().querySelector("form"); if (!form) throw new Error("설정 form이 없습니다."); fireEvent.submit(form);
    expect(current(harness.probe).workspace).toBe(harness.source); expect(harness.probe.runs).toBe(0);
  });

  it("화면 높이 %와 SDK factor 왕복은 입력을 건드리지 않은 기본 폭을 바꾸지 않는다", async () => {
    const initial = createStudioHybridDccDefaultToonMaterial();
    const harness = mount({ source: source({ ...initial, outline: { ...initial.outline, mode: "screenCoordinates", width: .003 } }) });
    expect(within(editor()).getByRole("textbox", { name: "외곽선 너비 (화면 높이 %)" })).toHaveProperty("value", "0.15");
    fireEvent.click(button("재질 미리보기")); expect(button("툰 재질 적용").matches(":disabled")).toBe(true);
    fireEvent.change(within(editor()).getByLabelText("외곽선 크기 기준"), { target: { value: "worldCoordinates" } });
    fireEvent.change(within(editor()).getByLabelText("외곽선 크기 기준"), { target: { value: "screenCoordinates" } });
    expect(button("툰 재질 적용").matches(":disabled")).toBe(true);
    base(); fireEvent.click(button("툰 재질 적용")); await waitFor(() => expect(harness.probe.commits).toHaveLength(1));
    expect(asset(harness.probe).toonMaterials?.["0"]?.outline.width).toBe(.003);
  });

  it.each(["readonly", "busy", "disabled-mode"] as const)("%s 상태에서는 field·preview·강제 submit을 통한 적용을 막는다", (mode) => {
    const harness = mount({ readOnly: mode === "readonly", busy: mode === "busy", enabled: mode !== "disabled-mode" });
    if (mode === "disabled-mode") expect(screen.queryByRole("region", { name: "툰 재질 편집" })).toBeNull();
    else {
      base(); expect(current(harness.probe).model.preview).toBeUndefined();
      expect(button("재질 미리보기").matches(":disabled")).toBe(true);
      const form = editor().querySelector("form"); if (!form) throw new Error("설정 form이 없습니다."); fireEvent.submit(form);
    }
    expect(harness.probe.runs).toBe(0); expect(current(harness.probe).workspace).toBe(harness.source);
  });
});

describe("툰 적용의 실제 지연 호스트 lease", () => {
  it("같은 원본의 대기 중에는 lease가 유효하고 늦게 발행해도 한 command만 만든다", () => {
    const harness = mount({ hold: true }); base(); fireEvent.click(button("툰 재질 적용"));
    expect(harness.probe.pending).toHaveLength(1); expect(pending(harness.probe).canCommit()).toBe(true);
    expect(harness.probe.commits).toEqual([]); expect(current(harness.probe).workspace).toBe(harness.source);
    let allowed = false; act(() => { allowed = pending(harness.probe).release(); }); expect(allowed).toBe(true);
    expect(harness.probe.commits).toHaveLength(1); expect(current(harness.probe).workspace.session.undoStack.length).toBe(harness.source.session.undoStack.length + 1);
  });

  it.each(["actor", "revision", "project", "document", "identity", "unmount", "actor-ABA", "project-ABA", "workspace-ABA", "readonly", "readonly-ABA"] as const)("적용 대기 중 %s 전환은 미리보기와 late canCommit을 폐기한다", (change) => {
    const harness = mount({ hold: true }); const a = harness.source; base(); fireEvent.click(button("툰 재질 적용"));
    const held = pending(harness.probe); expect(held.canCommit()).toBe(true);
    if (change === "actor" || change === "actor-ABA") { authChange("other-owner"); if (change === "actor-ABA") authChange("toon-owner"); }
    else if (change === "revision") authChange("toon-owner", 1);
    else if (change === "project" || change === "project-ABA") { harness.rerender({ project: "other-project" }); if (change === "project-ABA") harness.rerender({ project: "toon-project" }); }
    else if (change === "document") harness.rerender({ source: decodeStudioHybridDccWorkfile(Uint8Array.from(encodeStudioHybridDccWorkfile(a)), { documentId: "other-doc" }) });
    else if (change === "identity" || change === "workspace-ABA") { harness.rerender({ source: { ...a } }); if (change === "workspace-ABA") harness.rerender({ source: a }); }
    else if (change === "readonly" || change === "readonly-ABA") { harness.rerender({ readOnly: true }); if (change === "readonly-ABA") harness.rerender({ readOnly: false }); }
    else harness.view.unmount();
    expect(held.canCommit()).toBe(false);
    if (change !== "unmount") expect(current(harness.probe).model.preview).toBeUndefined();
    act(() => { held.release(); }); expect(harness.probe.commits).toEqual([]);
  });
});
