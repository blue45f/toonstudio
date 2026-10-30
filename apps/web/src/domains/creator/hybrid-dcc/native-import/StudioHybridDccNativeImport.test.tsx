// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioHybridDccPanel } from "../StudioHybridDccPanel";
import { StudioHybridDccNativeImportStatus } from "./StudioHybridDccNativeImportStatus";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube } from "../studio-hybrid-dcc-workspace";
import { STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES } from "./studio-hybrid-dcc-native-import-contracts";
import { readStudioNativeWorkspaceImportReport } from "./studio-hybrid-dcc-native-import-workspace";
import { nativeImportGlbFixture, nativeImportObjFixture } from "./studio-hybrid-dcc-native-import.test-fixtures";
import { groupStudioNativeImportIssues } from "./studio-hybrid-dcc-native-import-copy";

import type { StudioHybridDccViewportProps } from "../StudioHybridDccViewportCore";
import type { StudioHybridDccWorkspace } from "../studio-hybrid-dcc-workspace";
import type { StudioNativeImportIssue } from "./studio-hybrid-dcc-native-import-contracts";
import type { StudioHybridDccNativeImportModel } from "./useStudioHybridDccNativeImport";

const f = vi.hoisted(() => ({ actor: "import-owner", revision: 0, listeners: new Set<() => void>(), holdPreview: false, release: [] as Array<() => void> }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({ getAuthUserId: () => f.actor, getAuthSessionRevision: () => f.revision, listeners: f.listeners }));
vi.mock("../studio-hybrid-dcc-modifier-workspace", async (load) => {
  const actual = await load<typeof import("../studio-hybrid-dcc-modifier-workspace")>();
  return { ...actual, workspaceRefreshModifierPreviews: (workspace: StudioHybridDccWorkspace) => {
    if (!f.holdPreview) return actual.workspaceRefreshModifierPreviews(workspace);
    return new Promise<StudioHybridDccWorkspace>((resolve) => { f.release.push(() => { void actual.workspaceRefreshModifierPreviews(workspace).then(resolve); }); });
  } };
});
vi.mock("../StudioHybridDccViewportCore", async (load) => {
  const actual = await load<typeof import("../StudioHybridDccViewportCore")>();
  return { ...actual, StudioHybridDccViewport: ({ workspace }: StudioHybridDccViewportProps) => <div data-testid="import-workspace" data-assets={Object.keys(workspace.session.state.geometry.records).join(",")} data-state={workspace.session.state.stateHash} data-undo={workspace.session.undoStack.length} /> };
});
beforeEach(() => { f.actor = "import-owner"; f.revision = 0; f.holdPreview = false; f.release = []; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const probe = () => screen.getByTestId("import-workspace");
const status = () => screen.getByRole("region", { name: "모델 가져오기 상태" });
function choose(file: File) { fireEvent.change(screen.getByLabelText("가져올 3D 파일 선택"), { target: { files: [file] } }); }
function objFile(name = "parts.obj") { return new File([Uint8Array.from(nativeImportObjFixture())], name); }
function glbFile() { return new File([Uint8Array.from(nativeImportGlbFixture(true))], "scene.glb"); }
async function mount() {
  const workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("current-doc"), "existing");
  const notify = vi.fn<(workspace: StudioHybridDccWorkspace) => void>();
  const view = render(<StudioHybridDccPanel initialWorkspace={workspace} workspaceDocumentId="current-doc" onWorkspaceChange={notify} />);
  await waitFor(() => expect(probe().getAttribute("data-assets")).toBe("existing"));
  return { workspace, notify, view };
}
function holdReads(): FileReader[] {
  const readers: FileReader[] = [];
  vi.spyOn(FileReader.prototype, "readAsArrayBuffer").mockImplementation(function (this: FileReader) { readers.push(this); });
  return readers;
}
function readerAt(readers: FileReader[], index = 0): FileReader { const reader = readers[index]; if (!reader) throw new Error("모델 파일 읽기가 시작되지 않았습니다."); return reader; }
async function finish(reader: FileReader, bytes: Uint8Array) {
  await act(async () => { Object.defineProperty(reader, "result", { configurable: true, value: Uint8Array.from(bytes).buffer }); reader.dispatchEvent(new ProgressEvent("load")); });
}
function current(notify: ReturnType<typeof vi.fn<(workspace: StudioHybridDccWorkspace) => void>>) {
  const value = notify.mock.calls.at(-1)?.[0]; if (!value) throw new Error("발행된 작업 공간이 없습니다."); return value;
}

describe("실제 모델 파일의 읽기·검증·등록 UI", () => {
  it("원본 진단을 보존하면서 같은 표시 설명만 발생 건수로 묶고 다른 의미·심각도는 구분한다", () => {
    const issues: readonly StudioNativeImportIssue[] = Object.freeze([
      ...Array.from({ length: 67 }, (_, index): StudioNativeImportIssue => ({ severity: "warning", code: "NORMALS_REGENERATED", detail: "법선을 다시 계산합니다.", path: `meshes[${index}]` })),
      ...Array.from({ length: 50 }, (_, index): StudioNativeImportIssue => ({ severity: "warning", code: "ATTRIBUTE_DROPPED", detail: "추가 속성을 가져오지 않습니다.", path: `meshes[${index}]` })),
      ...["NODE_HIERARCHY_FLATTENED", "PRIMITIVES_SPLIT", "INSTANCES_MADE_UNIQUE"].map((code): StudioNativeImportIssue => ({ severity: "warning", code, detail: "장면 구조를 편집 자산으로 변환합니다." })),
    ].map((issue) => Object.freeze(issue)));
    const report = { kind: "studio-native-editable-import", revision: 1, format: "vrm", sourceName: "scene.vrm", sourceHash: `sha256:${"a".repeat(64)}`, committed: true, outcome: "registered", assets: [], issues } as const;
    const original = JSON.stringify(report);
    const model = { phase: "idle", error: "", issues: [], notice: "", report, cancel: vi.fn(), open: async () => {} } satisfies StudioHybridDccNativeImportModel;
    const view = render(<StudioHybridDccNativeImportStatus model={model} />);
    const items = within(status()).getAllByRole("listitem"); expect(items).toHaveLength(5);
    expect(items[0]?.textContent).toContain("(67건)"); expect(items[1]?.textContent).toContain("(50건)");
    expect(status().textContent).toContain("부모·자식 노드 계층"); expect(status().textContent).toContain("한 노드의 여러 primitive"); expect(status().textContent).toContain("독립 편집 복사본");
    expect(JSON.stringify(report)).toBe(original); expect(report.issues).toHaveLength(120);
    const english = groupStudioNativeImportIssues((_ko, en) => en, issues);
    expect(english.map(({ text }) => text).join(" ")).toContain("Parent-child nodes were flattened");
    expect(english.map(({ text }) => text).join(" ")).toContain("Multiple primitives in one node");
    expect(english.map(({ text }) => text).join(" ")).toContain("Shared-mesh instances became independent");
    view.rerender(<StudioHybridDccNativeImportStatus model={{ ...model, issues: [
      { severity: "warning", code: "warning", detail: "같은 설명" }, { severity: "error", code: "first", detail: "같은 설명" },
      { severity: "error", code: "second", detail: "같은 설명" }, { severity: "error", code: "different", detail: "다른 오류 설명" },
    ] }} />);
    expect(within(status()).getAllByRole("listitem")).toHaveLength(3);
    expect(within(status()).getByRole("alert").textContent).toContain("다른 오류 설명");
    expect(status().querySelector('[data-issue-severity="error"]')?.textContent).toBe("같은 설명 (2건)");
  });

  it("OBJ 선택은 실제 UV 메시 두 개를 한 번 등록하고 재질·법선 손실을 읽을 수 있게 표시한다", async () => {
    const { workspace, notify } = await mount(); choose(objFile());
    await waitFor(() => expect(probe().getAttribute("data-assets")?.split(",")).toHaveLength(3));
    expect(probe().getAttribute("data-undo")).toBe(String(workspace.session.undoStack.length + 1));
    const next = current(notify); const report = readStudioNativeWorkspaceImportReport(next.lastImportReport);
    expect(report?.assets).toHaveLength(2);
    for (const item of report?.assets ?? []) expect(next.session.state.geometry.records[item.assetId]?.mesh.uvLayer?.corners).toHaveLength(3);
    expect(status().textContent).toContain("외부 MTL·이미지는 읽지 않았습니다");
    expect(status().textContent).toContain("사용자 지정 법선은 보존하지 않고");
    expect(status().textContent).not.toMatch(/obj-external-material|obj-custom-normals/u);
    fireEvent.click(screen.getByRole("button", { name: "마지막 3D 편집 되돌리기" }));
    await waitFor(() => expect(probe().getAttribute("data-assets")).toBe("existing"));
    fireEvent.click(screen.getByRole("button", { name: "되돌린 3D 편집 다시 실행" }));
    await waitFor(() => expect(probe().getAttribute("data-assets")?.split(",")).toHaveLength(3));
  });

  it("GLB의 모든 node·primitive와 UV·초기 배치를 실제 등록하고 원본 재질 미보존을 안내한다", async () => {
    const { notify } = await mount(); choose(glbFile());
    await waitFor(() => expect(probe().getAttribute("data-assets")?.split(",")).toHaveLength(5));
    const next = current(notify); const report = readStudioNativeWorkspaceImportReport(next.lastImportReport);
    expect(report?.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    for (const item of report?.assets ?? []) {
      expect(next.session.state.geometry.records[item.assetId]?.mesh.uvLayer?.corners.length).toBeGreaterThan(0);
      expect(next.session.state.objectTransforms[item.assetId]?.position).toEqual(item.sourceNodeIndex === 0 ? [2, 3, 4] : [-2, 0, 1]);
    }
    expect(status().textContent).toContain("원본 재질과 셰이더는 가져오지 않았습니다");
  });

  it("크기 초과·빈 파일은 읽기를 시작하기 전에 거부하고 손상된 파일도 원본을 보존한다", async () => {
    const { notify } = await mount(); const before = probe().getAttribute("data-state");
    const read = vi.spyOn(FileReader.prototype, "readAsArrayBuffer");
    const huge = new File(["x"], "huge.glb"); Object.defineProperty(huge, "size", { value: STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES + 1 });
    choose(huge); await waitFor(() => expect(within(status()).getByRole("alert").textContent).toContain("128 MiB"));
    choose(new File([], "empty.obj")); await waitFor(() => expect(within(status()).getByRole("alert").textContent).toContain("비어 있거나"));
    expect(read).not.toHaveBeenCalled();
    choose(new File(["broken"], "broken.glb"));
    await waitFor(() => expect(within(status()).getByRole("alert").textContent).toMatch(/GLB|glTF/u));
    expect(probe().getAttribute("data-state")).toBe(before); expect(notify).not.toHaveBeenCalled();
  });

  it("읽기 실패·부분 읽기는 진단하고 취소 후 늦은 완료도 원본을 바꾸지 않는다", async () => {
    await mount(); const before = probe().getAttribute("data-state"); const readers = holdReads();
    choose(objFile()); await act(async () => { readerAt(readers).dispatchEvent(new ProgressEvent("error")); });
    expect(within(status()).getByRole("alert").textContent).toContain("읽지 못했습니다");
    choose(objFile()); await finish(readerAt(readers, 1), new Uint8Array([1]));
    expect(within(status()).getByRole("alert").textContent).toContain("전체를 읽지 못했습니다");
    choose(objFile()); const reader = readerAt(readers, 2);
    fireEvent.click(screen.getByRole("button", { name: "모델 가져오기 취소" }));
    expect(reader.onload).toBeNull(); await finish(reader, nativeImportObjFixture());
    expect(status().textContent).toContain("취소했습니다"); expect(probe().getAttribute("data-state")).toBe(before);
  });

  it("읽는 도중 새 파일을 선택하면 이전 읽기를 폐기하고 마지막 파일만 등록한다", async () => {
    const { notify } = await mount(); const readers = holdReads();
    choose(objFile("first.obj")); choose(objFile("second.obj"));
    expect(readerAt(readers).onload).toBeNull(); await finish(readerAt(readers), nativeImportObjFixture());
    expect(probe().getAttribute("data-assets")).toBe("existing");
    await finish(readerAt(readers, 1), nativeImportObjFixture());
    await waitFor(() => expect(probe().getAttribute("data-assets")?.split(",")).toHaveLength(3));
    expect(readStudioNativeWorkspaceImportReport(current(notify).lastImportReport)?.sourceName).toBe("second.obj");
    expect(current(notify).session.undoStack).toHaveLength(2);
  });

  it.each(["actor", "revision", "project", "source", "unmount"] as const)("%s 전환은 진행 중 읽기와 늦은 결과를 폐기한다", async (change) => {
    const { workspace, notify, view } = await mount(); const readers = holdReads(); choose(objFile());
    if (change === "actor" || change === "revision") act(() => { if (change === "actor") f.actor = "other-owner"; f.revision += 1; f.listeners.forEach((listener) => listener()); });
    else if (change === "project") view.rerender(<StudioHybridDccPanel initialWorkspace={workspace} workspaceDocumentId="other-project-document" onWorkspaceChange={notify} />);
    else if (change === "source") { fireEvent.click(screen.getByRole("button", { name: /큐브 추가/u })); await waitFor(() => expect(probe().getAttribute("data-assets")?.split(",")).toHaveLength(2)); }
    else view.unmount();
    const calls = notify.mock.calls.length; const before = screen.queryByTestId("import-workspace")?.getAttribute("data-state");
    expect(readerAt(readers).onload).toBeNull(); await finish(readerAt(readers), nativeImportObjFixture());
    expect(notify).toHaveBeenCalledTimes(calls); expect(screen.queryByTestId("import-workspace")?.getAttribute("data-state")).toBe(before);
  });

  it("다른 편집이 시작되어 busy가 되면 아직 읽는 모델은 중단한다", async () => {
    await mount(); const readers = holdReads(); choose(objFile()); f.holdPreview = true;
    fireEvent.click(screen.getByRole("button", { name: /큐브 추가/u }));
    await waitFor(() => expect(status().textContent).toContain("다른 편집이 시작되어"));
    expect(readerAt(readers).onload).toBeNull(); await finish(readerAt(readers), nativeImportObjFixture());
    await act(async () => { f.release.forEach((release) => release()); });
    expect(probe().getAttribute("data-assets")?.split(",")).toHaveLength(2);
    expect(probe().getAttribute("data-assets")).not.toContain("import-");
  });

  it.each(["cancel", "actor", "project", "unmount"] as const)("검증 후 비동기 발행 대기 중 %s도 이전 모델을 확정하지 않는다", async (change) => {
    const { workspace, view, notify } = await mount(); const before = probe().getAttribute("data-state"); f.holdPreview = true; choose(objFile());
    await waitFor(() => expect(f.release).toHaveLength(1));
    if (change === "cancel") fireEvent.click(screen.getByRole("button", { name: "모델 가져오기 취소" }));
    else if (change === "actor") act(() => { f.actor = "other-owner"; f.revision += 1; f.listeners.forEach((listener) => listener()); });
    else if (change === "project") view.rerender(<StudioHybridDccPanel initialWorkspace={workspace} workspaceDocumentId="other-doc" onWorkspaceChange={notify} />);
    else view.unmount();
    await act(async () => { f.release.forEach((release) => release()); });
    expect(notify).not.toHaveBeenCalled(); if (change !== "unmount") expect(probe().getAttribute("data-state")).toBe(before);
  });

  it("편집 메시를 만들지 않은 형식은 성공으로 발행하지 않고 실제 한계를 표시한다", async () => {
    const { notify } = await mount(); const before = probe().getAttribute("data-state"); choose(new File(["BLENDER-v300"], "original.blend"));
    await waitFor(() => expect(within(status()).getByRole("alert").textContent).toContain("편집 메시로 등록할 수 없습니다"));
    expect(probe().getAttribute("data-state")).toBe(before); expect(notify).not.toHaveBeenCalled();
  });
});
