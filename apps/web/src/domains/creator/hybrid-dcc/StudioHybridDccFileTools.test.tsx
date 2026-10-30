// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioHybridDccPanel } from "./StudioHybridDccPanel";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile, STUDIO_HYBRID_DCC_WORKFILE_MAX_BYTES, STUDIO_HYBRID_DCC_WORKFILE_MIME } from "./studio-hybrid-dcc-workfile";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube, workspaceCommitObjectTransform } from "./studio-hybrid-dcc-workspace";

import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";

const f = vi.hoisted(() => ({ actor: "file-owner", revision: 0, listeners: new Set<() => void>(), holdPreview: false, release: [] as Array<() => void> }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({ getAuthUserId: () => f.actor, getAuthSessionRevision: () => f.revision, listeners: f.listeners }));
vi.mock("./studio-hybrid-dcc-modifier-workspace", async (load) => {
  const actual = await load<typeof import("./studio-hybrid-dcc-modifier-workspace")>();
  return { ...actual, workspaceRefreshModifierPreviews: (workspace: StudioHybridDccWorkspace) => {
    if (!f.holdPreview || !workspace.session.state.geometry.records["file-cube"]) return actual.workspaceRefreshModifierPreviews(workspace);
    return new Promise<StudioHybridDccWorkspace>((resolve) => { f.release.push(() => { void actual.workspaceRefreshModifierPreviews(workspace).then(resolve); }); });
  } };
});
vi.mock("./StudioHybridDccViewportCore", async (load) => {
  const actual = await load<typeof import("./StudioHybridDccViewportCore")>();
  return { ...actual, StudioHybridDccViewport: (props: StudioHybridDccViewportProps) => <div data-testid="file-workspace" data-assets={Object.keys(props.workspace.session.state.geometry.records).sort().join(",")} data-document={props.workspace.session.state.documentId} data-undo={props.workspace.session.undoStack.length} data-state={props.workspace.session.state.stateHash} /> };
});

const NativeURL = URL;
let downloads: Array<{ blob: Blob; filename?: string }> = [];
const modalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const modalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeEach(() => {
  f.actor = "file-owner"; f.revision = 0; f.holdPreview = false; f.release = []; downloads = [];
  vi.stubGlobal("URL", class extends NativeURL {
    static createObjectURL(value: Blob | MediaSource): string {
      if (!(value instanceof Blob)) throw new Error("테스트 다운로드가 Blob이 아닙니다.");
      downloads.push({ blob: value }); return `blob:workfile-test-${downloads.length}`;
    }
    static revokeObjectURL() {}
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { const last = downloads.at(-1); if (last) last.filename = this.download; });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (modalShow) Object.defineProperty(HTMLDialogElement.prototype, "showModal", modalShow); else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (modalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", modalClose); else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

function source(id: string, assetId: string): StudioHybridDccWorkspace { return workspaceAddUnitCube(createStudioHybridDccWorkspace(id), assetId); }
function fileWorkspace() {
  const workspace = source("author-file", "file-cube");
  const transform = workspace.session.state.objectTransforms["file-cube"];
  if (!transform) throw new Error("파일 큐브가 없습니다.");
  return workspaceCommitObjectTransform(workspace, "file-cube", { ...transform, position: [2, 0, 0] });
}
function workfile(): File { return new File([Uint8Array.from(encodeStudioHybridDccWorkfile(fileWorkspace()))], "scene.toon3d", { type: STUDIO_HYBRID_DCC_WORKFILE_MIME }); }
function choose(file: File) { fireEvent.change(screen.getByLabelText("열 .toon3d 작업파일 선택"), { target: { files: [file] } }); }
const probe = () => screen.getByTestId("file-workspace");
const confirm = () => screen.getByRole("dialog", { name: "3D 작업파일을 열까요?" });
function fileError(): HTMLElement {
  const topbar = document.querySelector<HTMLElement>("[data-studio-hybrid-dcc-topbar]");
  if (!topbar) throw new Error("작업파일 도구 막대가 없습니다.");
  return within(topbar).getByRole("alert");
}
async function mount() {
  const workspace = source("current-doc", "current-cube");
  const notify = vi.fn<(workspace: StudioHybridDccWorkspace) => void>();
  const view = render(<StudioHybridDccPanel initialWorkspace={workspace} workspaceDocumentId="current-doc" onWorkspaceChange={notify} />);
  await waitFor(() => expect(probe().getAttribute("data-assets")).toBe("current-cube"));
  return { workspace, notify, view };
}
async function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(new Uint8Array(reader.result)) : reject(new Error("Blob 읽기 실패")); reader.onerror = reject; reader.readAsArrayBuffer(blob); });
}
function holdReads(): FileReader[] {
  const readers: FileReader[] = [];
  vi.spyOn(FileReader.prototype, "readAsArrayBuffer").mockImplementation(function (this: FileReader) { readers.push(this); });
  return readers;
}

describe("native .toon3d 파일 저장과 열기", () => {
  it("저장 버튼이 다시 검증 가능한 실제 파일을 내려받고 OBJ도 메시 본문을 내려받는다", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "작업파일 저장" }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.filename).toMatch(/\.toon3d$/u);
    expect(downloads[0]?.blob.type).toBe(STUDIO_HYBRID_DCC_WORKFILE_MIME);
    const first = downloads[0]; if (!first) throw new Error("작업파일 다운로드가 없습니다.");
    const decoded = decodeStudioHybridDccWorkfile(await readBlob(first.blob), { documentId: "reopened-doc" });
    expect(Object.keys(decoded.session.state.geometry.records)).toEqual(["current-cube"]);
    fireEvent.click(screen.getByRole("button", { name: "OBJ 저장" }));
    expect(downloads).toHaveLength(2);
    const obj = downloads[1]; if (!obj) throw new Error("OBJ 다운로드가 없습니다.");
    expect(obj.filename).toMatch(/\.obj$/u);
    const text = new TextDecoder().decode(await readBlob(obj.blob));
    expect(text).toMatch(/^v /mu); expect(text).toMatch(/^f /mu);
  });

  it("컷 모드 추천 도구와 전문가 목록의 기존 내보내기 버튼도 실제 다운로드를 쓴다", async () => {
    const workspace = source("export-doc", "current-cube");
    render(<StudioHybridDccPanel initialWorkspace={workspace} workbenchMode="shot" />);
    fireEvent.click(screen.getByRole("button", { name: /^\.toon3d 작업 파일/u }));
    expect(downloads.at(-1)?.filename).toMatch(/\.toon3d$/u);
    fireEvent.click(screen.getByText(/전문가용 전체 도구/u));
    fireEvent.click(screen.getByRole("button", { name: /^Export \.toon3d/u }));
    expect(downloads).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /^Export OBJ/u }));
    expect(downloads).toHaveLength(3); expect(downloads.at(-1)?.filename).toMatch(/\.obj$/u);
  });

  it("완전 검증 뒤 확인을 표시하고 취소는 보존, 확인 두 번은 가져온 이력을 한 번만 교체한다", async () => {
    const { notify } = await mount(); const before = probe().getAttribute("data-state");
    choose(workfile()); await waitFor(() => expect(confirm()).toBeTruthy());
    expect(document.activeElement?.textContent).toBe("취소");
    expect(probe().getAttribute("data-state")).toBe(before);
    fireEvent.click(within(confirm()).getByRole("button", { name: "취소" }));
    expect(probe().getAttribute("data-state")).toBe(before);
    choose(workfile()); await waitFor(() => expect(confirm()).toBeTruthy());
    const changesBefore = notify.mock.calls.length;
    const apply = within(confirm()).getByRole("button", { name: "현재 작업을 교체하고 열기" });
    fireEvent.click(apply); fireEvent.click(apply);
    await waitFor(() => expect(probe().getAttribute("data-assets")).toBe("file-cube"));
    expect(probe().getAttribute("data-document")).toBe("current-doc");
    expect(probe().getAttribute("data-undo")).toBe(String(fileWorkspace().session.undoStack.length));
    expect(notify.mock.calls.length).toBe(changesBefore + 1);
    fireEvent.click(screen.getByRole("button", { name: "마지막 3D 편집 되돌리기" }));
    await waitFor(() => expect(probe().getAttribute("data-undo")).toBe("1"));
    expect(probe().getAttribute("data-assets")).toBe("file-cube");
  });

  it("손상·지원하지 않는 내용·크기 초과는 교체 확인이나 원본 변경 전에 거부한다", async () => {
    const { notify } = await mount(); const before = probe().getAttribute("data-state"); const changesBefore = notify.mock.calls.length;
    choose(new File(["broken-json"], "bad.toon3d"));
    await waitFor(() => expect(fileError().textContent).toMatch(/형식/u));
    expect(screen.queryByRole("dialog")).toBeNull();
    const oversized = new File(["x"], "large.toon3d"); Object.defineProperty(oversized, "size", { value: STUDIO_HYBRID_DCC_WORKFILE_MAX_BYTES + 1 });
    choose(oversized);
    await waitFor(() => expect(fileError().textContent).toMatch(/크기 한도/u));
    expect(probe().getAttribute("data-state")).toBe(before); expect(notify.mock.calls).toHaveLength(changesBefore);
  });

  it("읽기 실패와 읽기 취소 후 늦은 완료는 현재 작업을 보존한다", async () => {
    await mount(); const before = probe().getAttribute("data-state"); const readers = holdReads();
    choose(workfile()); const first = readers[0]; if (!first) throw new Error("파일 읽기가 시작되지 않았습니다.");
    await act(async () => { first.dispatchEvent(new ProgressEvent("error")); });
    expect(fileError().textContent).toMatch(/읽지 못했습니다/u);
    choose(workfile()); const second = readers[1]; if (!second) throw new Error("두 번째 읽기가 없습니다.");
    fireEvent.click(screen.getByRole("button", { name: "파일 읽기 취소" }));
    await act(async () => { Object.defineProperty(second, "result", { value: encodeStudioHybridDccWorkfile(fileWorkspace()).buffer }); second.dispatchEvent(new ProgressEvent("load")); });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(probe().getAttribute("data-state")).toBe(before);
  });

  it.each(["actor", "project", "workspace"] as const)("%s가 바뀌면 이전 파일 읽기와 교체 확인을 폐기한다", async (change) => {
    const { workspace, view, notify } = await mount(); const readers = holdReads();
    choose(workfile()); const reader = readers[0]; if (!reader) throw new Error("파일 읽기가 없습니다.");
    if (change === "actor") act(() => { f.actor = "other-owner"; f.revision += 1; f.listeners.forEach((listener) => listener()); });
    else if (change === "project") view.rerender(<StudioHybridDccPanel initialWorkspace={workspace} workspaceDocumentId="other-doc" onWorkspaceChange={notify} />);
    else { fireEvent.click(screen.getByRole("button", { name: /큐브 추가/u })); await waitFor(() => expect(probe().getAttribute("data-assets")).toContain("asset-cube")); }
    const afterChange = probe().getAttribute("data-state");
    await act(async () => { Object.defineProperty(reader, "result", { value: encodeStudioHybridDccWorkfile(fileWorkspace()).buffer }); reader.dispatchEvent(new ProgressEvent("load")); });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(probe().getAttribute("data-state")).toBe(afterChange);
  });

  it("파일 검증이 끝난 확인창에서도 계정 전환은 교체 대상을 폐기한다", async () => {
    await mount(); const before = probe().getAttribute("data-state");
    choose(workfile()); await waitFor(() => expect(confirm()).toBeTruthy());
    act(() => { f.actor = "new-file-owner"; f.revision += 1; f.listeners.forEach((listener) => listener()); });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(probe().getAttribute("data-state")).toBe(before);
  });

  it("확인 뒤 파생 메시 재생성 중 계정이 바뀌어도 이전 파일을 최종 publish하지 않는다", async () => {
    await mount(); const before = probe().getAttribute("data-state"); choose(workfile()); await waitFor(() => expect(confirm()).toBeTruthy());
    f.holdPreview = true;
    fireEvent.click(within(confirm()).getByRole("button", { name: "현재 작업을 교체하고 열기" }));
    await waitFor(() => expect(f.release).toHaveLength(1));
    act(() => { f.revision += 1; f.listeners.forEach((listener) => listener()); });
    await act(async () => { f.release.forEach((release) => release()); });
    expect(probe().getAttribute("data-state")).toBe(before); expect(probe().getAttribute("data-assets")).toBe("current-cube");
  });
});
