// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioHybridDccPanel } from "./StudioHybridDccPanel";
import { createStudioHybridDccUvSelection, deriveStudioHybridDccUvEditorModel, workspaceTransformUvIslands, workspaceUnwrapUvActive } from "./studio-hybrid-dcc-uv-edit";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "./studio-hybrid-dcc-workfile";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube } from "./studio-hybrid-dcc-workspace";
import { workspacePackUvActive } from "./studio-hybrid-dcc-uv-pack-workspace";
import { studioUvViewBox } from "./studio-hybrid-dcc-uv-editor-session";

import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";
import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

const fixture = vi.hoisted(() => ({ actor: "uv-owner", revision: 0, listeners: new Set<() => void>(), hold: false, release: [] as Array<() => void> }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({ getAuthUserId: () => fixture.actor, getAuthSessionRevision: () => fixture.revision, listeners: fixture.listeners }));
vi.mock("./studio-hybrid-dcc-modifier-workspace", async (load) => {
  const actual = await load<typeof import("./studio-hybrid-dcc-modifier-workspace")>();
  return { ...actual, workspaceRefreshModifierPreviews: (workspace: StudioHybridDccWorkspace) => fixture.hold ? new Promise<StudioHybridDccWorkspace>((resolve) => { fixture.release.push(() => { void actual.workspaceRefreshModifierPreviews(workspace).then(resolve); }); }) : actual.workspaceRefreshModifierPreviews(workspace) };
});
// Canvas만 대역이다. 실제 문서·정본 UV·선택·명령·이력·저장 경로를 관찰한다.
vi.mock("./StudioHybridDccViewportCore", async (load) => {
  const actual = await load<typeof import("./StudioHybridDccViewportCore")>();
  return { ...actual, StudioHybridDccViewport: (props: StudioHybridDccViewportProps) => {
    const uv = deriveStudioHybridDccUvEditorModel(props.workspace);
    const record = props.workspace.activeAssetId ? props.workspace.session.state.geometry.records[props.workspace.activeAssetId] : undefined;
    return <div data-testid="uv-viewport" data-state={props.workspace.session.state.stateHash} data-uv={JSON.stringify(uv?.corners ?? [])} data-hash={uv?.uvHash ?? ""} data-vertices={JSON.stringify(record?.mesh.vertices)} data-checker={String(props.uvChecker ?? false)} data-locked={String(props.editingDisabled ?? false)} />;
  } };
});
beforeEach(() => { fixture.actor = "uv-owner"; fixture.revision = 0; fixture.hold = false; fixture.release = []; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const probe = () => screen.getByTestId("uv-viewport");
const region = () => screen.getByRole("region", { name: "UV 편집" });
const uv = () => probe().getAttribute("data-uv");
const hash = () => probe().getAttribute("data-hash");
const latest = (notify: ReturnType<typeof vi.fn<(workspace: StudioHybridDccWorkspace) => void>>) => {
  const call = notify.mock.calls.at(-1); if (!call) throw new Error("UV 변경 알림이 없습니다."); return call[0];
};
function source(unwrap = true) {
  const workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("uv-doc"), "uv-cube");
  return unwrap ? workspaceUnwrapUvActive(workspace) : workspace;
}
async function mount(unwrap = true, initialWorkspace?: StudioHybridDccWorkspace) {
  const workspace = initialWorkspace ?? source(unwrap); const notify = vi.fn<(workspace: StudioHybridDccWorkspace) => void>();
  const view = render(<StudioHybridDccPanel initialWorkspace={workspace} workspaceDocumentId="uv-doc" workbenchMode="material" onWorkspaceChange={notify} />);
  await waitFor(() => expect(probe().getAttribute("data-checker")).toBe("true"));
  return { workspace, notify, view };
}
const selectionChecks = () => within(within(region()).getByRole("group", { name: "UV 목록에서 선택" })).getAllByRole("checkbox");
function firstIsland() { fireEvent.click(selectionChecks()[0] ?? (() => { throw new Error("UV 아일랜드가 없습니다."); })()); }
function move(u = "0.2", v = "-0.1") {
  fireEvent.change(within(region()).getByRole("textbox", { name: "U (이동량)" }), { target: { value: u } });
  fireEvent.change(within(region()).getByRole("textbox", { name: "V (이동량)" }), { target: { value: v } });
}

describe("실제 원본 UV의 웹 편집", () => {
  it("정본 UV 펼치기는 문서 명령이며 lastUvMap이 없어도 편집 화면과 checker를 연결한다", async () => {
    const { notify, workspace } = await mount(false);
    expect(within(region()).queryByRole("img")).toBeNull();
    fireEvent.click(within(region()).getByRole("button", { name: "UV 펼치기" }));
    await waitFor(() => expect(hash()).not.toBe(""));
    expect(latest(notify).session.undoStack).toHaveLength(workspace.session.undoStack.length + 1);
    expect(latest(notify).lastUvMap).toBeNull();
    expect(within(region()).getByRole("img", { name: "UV 아일랜드와 코너 편집 화면" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "마지막 3D 편집 되돌리기" }));
    await waitFor(() => expect(hash()).toBe(""));
  });

  it("아일랜드 미리보기는 원본 불변이며 두 번 눌러도 한 번 적용, undo/redo와 파일 재진입이 유지된다", async () => {
    const { notify, workspace, view } = await mount(); const original = uv(); const vertices = probe().getAttribute("data-vertices");
    firstIsland(); move(); const preview = uv(); const previewHash = hash();
    expect(preview).not.toBe(original); expect(probe().getAttribute("data-locked")).toBe("true");
    expect(probe().getAttribute("data-vertices")).toBe(vertices);
    expect(notify).not.toHaveBeenCalled(); expect(workspace.session.undoStack).toHaveLength(2);
    const apply = within(region()).getByRole("button", { name: "UV 변형 적용" }); fireEvent.click(apply); fireEvent.click(apply);
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(latest(notify).session.undoStack).toHaveLength(3); expect(hash()).toBe(previewHash);
    expect(probe().getAttribute("data-locked")).toBe("false");
    const saved = decodeStudioHybridDccWorkfile(Uint8Array.from(encodeStudioHybridDccWorkfile(latest(notify))), { documentId: "uv-reopened" });
    fireEvent.click(screen.getByRole("button", { name: "마지막 3D 편집 되돌리기" })); await waitFor(() => expect(uv()).toBe(original));
    fireEvent.click(screen.getByRole("button", { name: "되돌린 3D 편집 다시 실행" })); await waitFor(() => expect(uv()).toBe(preview));
    view.unmount(); render(<StudioHybridDccPanel initialWorkspace={saved} workbenchMode="material" />);
    expect(hash()).toBe(previewHash);
  });

  it("실제 SVG의 면 내부 포인터 선택과 선택 UV 드래그가 3D 미리보기로 이어진다", async () => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    const { notify, workspace } = await mount(); const original = uv();
    const model = deriveStudioHybridDccUvEditorModel(workspace); const island = model?.islands[0];
    if (!model || !island) throw new Error("UV 아일랜드가 없습니다.");
    const surface = within(region()).getByRole("img");
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 300, 300));
    const view = studioUvViewBox(model.corners);
    const x = 10 + ((island.bounds.minU + island.bounds.maxU) / 2 - view.x) / view.size * 300;
    const y = 20 + (-(island.bounds.minV + island.bounds.maxV) / 2 - view.y) / view.size * 300;
    fireEvent.pointerDown(surface, { clientX: x, clientY: y, button: 0 });
    expect(within(region()).getByText("선택한 UV 코너 4개")).toBeTruthy();
    fireEvent.pointerDown(surface, { clientX: x, clientY: y, button: 0 });
    fireEvent.pointerMove(surface, { clientX: x + 30, clientY: y - 15 });
    fireEvent.pointerUp(surface);
    expect(uv()).not.toBe(original); expect(notify).not.toHaveBeenCalled();
    expect(Number((within(region()).getByRole("textbox", { name: "U (이동량)" }) as HTMLInputElement).value)).toBeCloseTo(view.size / 10);
    expect(Number((within(region()).getByRole("textbox", { name: "V (이동량)" }) as HTMLInputElement).value)).toBeCloseTo(view.size / 20);
    fireEvent.click(within(region()).getByRole("button", { name: "UV 미리보기 취소" })); expect(uv()).toBe(original);
  });

  it("코너 하나를 독립 편집하고, 도 회전과 0배율을 실제 UV에 적용한다", async () => {
    const { notify } = await mount();
    fireEvent.click(within(region()).getByRole("button", { name: "코너" }));
    const check = selectionChecks()[0]; if (!check) throw new Error("코너 목록이 없습니다."); fireEvent.click(check);
    const original = deriveStudioHybridDccUvEditorModel(source()); if (!original) throw new Error("UV가 없습니다.");
    move("-2", "3"); fireEvent.click(within(region()).getByRole("button", { name: "UV 변형 적용" }));
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    const result = deriveStudioHybridDccUvEditorModel(latest(notify));
    expect(result?.corners.filter((corner, index) => corner.u !== original.corners[index]?.u || corner.v !== original.corners[index]?.v)).toHaveLength(1);
    fireEvent.click(within(region()).getByRole("button", { name: "UV 전체 선택" }));
    fireEvent.change(within(region()).getByLabelText("UV 변형 종류"), { target: { value: "rotate" } });
    fireEvent.change(within(region()).getByRole("textbox", { name: "UV 회전 (도)" }), { target: { value: "90" } });
    const rotated = uv(); expect(rotated).not.toBe(JSON.stringify(result?.corners));
    fireEvent.click(within(region()).getByRole("button", { name: "UV 변형 적용" })); await waitFor(() => expect(notify).toHaveBeenCalledTimes(2));
    expect(uv()).toBe(rotated);
    fireEvent.change(within(region()).getByLabelText("UV 변형 종류"), { target: { value: "scale" } });
    fireEvent.change(within(region()).getByRole("textbox", { name: "U (배율)" }), { target: { value: "0" } });
    fireEvent.change(within(region()).getByRole("textbox", { name: "V (배율)" }), { target: { value: "0" } });
    expect(within(region()).queryByRole("alert")).toBeNull();
    fireEvent.click(within(region()).getByRole("button", { name: "UV 변형 적용" })); await waitFor(() => expect(notify).toHaveBeenCalledTimes(3));
    const collapsed = deriveStudioHybridDccUvEditorModel(latest(notify));
    expect(new Set(collapsed?.corners.map(({ u, v }) => `${u},${v}`)).size).toBe(1);
    expect(selectionChecks().length).toBe(24);
  });

  it("잘못된 값·취소·선택 전환·구역 내 Esc는 미리보기만 버리고 원본 이력을 바꾸지 않는다", async () => {
    const { notify } = await mount(); const original = uv(); firstIsland(); move();
    fireEvent.keyDown(document.body, { key: "Escape" }); expect(uv()).not.toBe(original);
    fireEvent.keyDown(within(region()).getByRole("textbox", { name: "U (이동량)" }), { key: "Escape" }); expect(uv()).toBe(original);
    move("Infinity", "0"); expect(within(region()).getByRole("alert").textContent).toMatch(/유한한/u);
    expect(within(region()).getByRole("button", { name: "UV 변형 적용" })).toHaveProperty("disabled", true);
    move(); fireEvent.click(within(region()).getByRole("button", { name: "UV 미리보기 취소" })); expect(uv()).toBe(original);
    move(); fireEvent.click(selectionChecks()[1] ?? (() => { throw new Error("두 번째 섬이 없습니다."); })()); expect(uv()).toBe(original);
    expect(notify).not.toHaveBeenCalled();
  });

  it("같은 계정의 인증 세대·프로젝트·모드 전환도 미리보기를 즉시 제거한다", async () => {
    const { notify, workspace, view } = await mount(); const original = uv(); firstIsland(); move();
    act(() => { fixture.revision += 1; fixture.listeners.forEach((listener) => listener()); }); expect(uv()).toBe(original);
    firstIsland(); move(); view.rerender(<StudioHybridDccPanel initialWorkspace={workspace} workspaceDocumentId="another-project" workbenchMode="material" onWorkspaceChange={notify} />); expect(uv()).toBe(original);
    firstIsland(); move(); view.rerender(<StudioHybridDccPanel initialWorkspace={workspace} workspaceDocumentId="another-project" workbenchMode="model" onWorkspaceChange={notify} />);
    expect(uv()).toBe(original); expect(screen.queryByRole("region", { name: "UV 편집" })).toBeNull(); expect(notify).not.toHaveBeenCalled();
  });

  it("적용 뒤 비동기 표시 캐시 대기 중 계정이 바뀌면 낡은 UV 명령을 발행하지 않는다", async () => {
    const { notify } = await mount(); const original = uv(); firstIsland(); move(); fixture.hold = true;
    fireEvent.click(within(region()).getByRole("button", { name: "UV 변형 적용" }));
    await waitFor(() => expect(fixture.release).toHaveLength(1));
    act(() => { fixture.actor = "next-owner"; fixture.revision += 1; fixture.listeners.forEach((listener) => listener()); });
    expect(uv()).toBe(original);
    await act(async () => { fixture.release.splice(0).forEach((release) => release()); await Promise.resolve(); });
    await waitFor(() => expect(probe().getAttribute("data-locked")).toBe("false"));
    expect(uv()).toBe(original); expect(notify).not.toHaveBeenCalled();
  });
});

const packing = () => screen.getByRole("form", { name: "아일랜드 정리" });
function displaced() {
  const workspace = source(); const model = deriveStudioHybridDccUvEditorModel(workspace);
  if (!model) throw new Error("정리할 UV가 없습니다.");
  return workspaceTransformUvIslands(workspace, createStudioHybridDccUvSelection(workspace, model.islands.map(({ id }) => id)), { kind: "translate", value: { x: 2, y: -3 } }).workspace;
}
function uvBytes(workspace: StudioHybridDccWorkspace): Uint8Array {
  const model = deriveStudioHybridDccUvEditorModel(workspace); if (!model) throw new Error("정본 UV가 없습니다.");
  return new Uint8Array(Float32Array.from(model.corners.flatMap(({ u, v }) => [u, v])).buffer);
}

describe("실제 UV 아일랜드 정리 UI", () => {
  it("여백·회전 설정은 원본을 바꾸지 않고 명시 제출만 실제 kernel과 같은 UV bytes를 단일 undo로 적용한다", async () => {
    const workspace = displaced(); const { notify } = await mount(true, workspace); const original = uv();
    expect(within(packing()).getByRole("textbox", { name: "UV 여백" })).toHaveProperty("value", "0.02");
    expect(within(packing()).getByRole("checkbox", { name: "90도 회전 허용" })).toHaveProperty("checked", true);
    fireEvent.change(within(packing()).getByRole("textbox", { name: "UV 여백" }), { target: { value: "0.04" } });
    fireEvent.click(within(packing()).getByRole("checkbox", { name: "90도 회전 허용" }));
    expect(uv()).toBe(original); expect(notify).not.toHaveBeenCalled();
    const expected = workspacePackUvActive(workspace, { margin: 0.04, rotate: false });
    const button = within(packing()).getByRole("button", { name: "UV 정리 적용" });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    const result = latest(notify); const model = deriveStudioHybridDccUvEditorModel(result);
    expect(uvBytes(result)).toEqual(uvBytes(expected)); expect(uv()).not.toBe(original);
    expect(model?.corners.every(({ u, v }) => u >= 0 && u <= 1 && v >= 0 && v <= 1)).toBe(true);
    expect(result.session.undoStack).toHaveLength(workspace.session.undoStack.length + 1);
    expect(result.session.state.geometry.records["uv-cube"]?.mesh.vertices).toEqual(workspace.session.state.geometry.records["uv-cube"]?.mesh.vertices);
    expect(result.session.state.geometry.records["uv-cube"]?.mesh.halfEdges).toEqual(workspace.session.state.geometry.records["uv-cube"]?.mesh.halfEdges);
    expect(result.session.state.objectTransforms).toEqual(workspace.session.state.objectTransforms);
    const packed = uv();
    fireEvent.click(screen.getByRole("button", { name: "마지막 3D 편집 되돌리기" })); await waitFor(() => expect(uv()).toBe(original));
    fireEvent.click(screen.getByRole("button", { name: "되돌린 3D 편집 다시 실행" })); await waitFor(() => expect(uv()).toBe(packed));
    expect(uvBytes(decodeStudioHybridDccWorkfile(Uint8Array.from(encodeStudioHybridDccWorkfile(result)), { documentId: "packed-reopened" }))).toEqual(uvBytes(result));
    expect(uvBytes(workspace)).not.toEqual(uvBytes(result));
  });

  it("변형 draft 중에는 정리를 잠그며 강제 제출도 미리보기·입력·원본 이력을 버리지 않는다", async () => {
    const { notify } = await mount(); firstIsland(); move("0.3", "0.15"); const preview = uv();
    expect(within(packing()).getByRole("button", { name: "UV 정리 적용" }).matches(":disabled")).toBe(true);
    expect(within(packing()).getByRole("textbox", { name: "UV 여백" }).matches(":disabled")).toBe(true);
    expect(within(packing()).getByText(/변형 미리보기를 먼저 적용하거나 취소/u)).toBeTruthy();
    fireEvent.submit(packing()); expect(uv()).toBe(preview); expect(notify).not.toHaveBeenCalled();
    expect(within(region()).getByRole("textbox", { name: "U (이동량)" })).toHaveProperty("value", "0.3");
    fireEvent.click(within(region()).getByRole("button", { name: "UV 미리보기 취소" }));
    expect(within(packing()).getByRole("button", { name: "UV 정리 적용" }).matches(":disabled")).toBe(false);
  });

  it.each(["", "NaN", "1e999", "-0.01", "0.251"])("잘못된 여백 %j는 명령 전 접근 가능한 오류로 알리고 원본을 보존한다", async (value) => {
    const { notify } = await mount(); const original = uv(); const input = within(packing()).getByRole("textbox", { name: "UV 여백" });
    fireEvent.change(input, { target: { value } }); fireEvent.submit(packing());
    expect(within(region()).getByRole("alert").textContent).toMatch(/유한한|0 이상 0.25 이하/u);
    expect(input.getAttribute("aria-invalid")).toBe("true"); expect(uv()).toBe(original); expect(notify).not.toHaveBeenCalled();
  });

  it("0 여백은 유효하며 최소 간격 안내와 함께 실제 kernel의 좌표를 적용한다", async () => {
    const workspace = displaced(); const { notify } = await mount(true, workspace);
    expect(within(packing()).getByText(/여백이 0이어도/u)).toBeTruthy();
    fireEvent.change(within(packing()).getByRole("textbox", { name: "UV 여백" }), { target: { value: "0" } });
    fireEvent.submit(packing()); await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(uvBytes(latest(notify))).toEqual(uvBytes(workspacePackUvActive(workspace, { margin: 0, rotate: true })));
  });

  it("접힌 UV의 kernel 실패는 원본을 보존하고 다시 펼치라는 오류를 표시한다", async () => {
    const before = source(); const model = deriveStudioHybridDccUvEditorModel(before); if (!model) throw new Error("UV가 없습니다.");
    const collapsed = workspaceTransformUvIslands(before, createStudioHybridDccUvSelection(before, model.islands.map(({ id }) => id)), { kind: "scale", value: { x: 0, y: 0 } }).workspace;
    const { notify } = await mount(true, collapsed); const original = uv(); fireEvent.submit(packing());
    await waitFor(() => expect(within(region()).getByRole("alert").textContent).toMatch(/접힌 UV.*펼치/u));
    expect(uv()).toBe(original); expect(notify).not.toHaveBeenCalled();
    expect(collapsed.session.undoStack).toHaveLength(before.session.undoStack.length + 1);
  });

  it.each(["actor", "project", "unmount"] as const)("정리 적용의 cache 대기 중 %s 전환은 이전 결과 발행을 차단한다", async (change) => {
    const workspace = displaced(); const { notify, view } = await mount(true, workspace); const original = uv(); fixture.hold = true;
    fireEvent.submit(packing()); await waitFor(() => expect(fixture.release).toHaveLength(1));
    if (change === "actor") act(() => { fixture.actor = "next-packing-owner"; fixture.revision += 1; fixture.listeners.forEach((listener) => listener()); });
    else if (change === "project") view.rerender(<StudioHybridDccPanel initialWorkspace={workspace} workspaceDocumentId="next-project" workbenchMode="material" onWorkspaceChange={notify} />);
    else view.unmount();
    await act(async () => { fixture.release.splice(0).forEach((release) => release()); await Promise.resolve(); });
    if (change !== "unmount") { await waitFor(() => expect(probe().getAttribute("data-locked")).toBe("false")); expect(uv()).toBe(original); }
    expect(notify).not.toHaveBeenCalled();
  });
});
