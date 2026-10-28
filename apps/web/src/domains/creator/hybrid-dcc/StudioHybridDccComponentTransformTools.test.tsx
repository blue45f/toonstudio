// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioHybridDccPanel } from "./StudioHybridDccPanel";
import {
  decodeStudioHybridDccWorkspacePersistenceEnvelope,
  encodeStudioHybridDccWorkspacePersistenceEnvelope,
} from "./studio-hybrid-dcc-workspace-persistence";

import type { StudioHybridDccComponentMode } from "./studio-hybrid-dcc-component-selection";
import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";

// 코어 Canvas만 대역이다. 패널·선택·변형 커널·미리보기·실행 큐·저장은 실제 구현을 쓴다.
vi.mock("./StudioHybridDccViewportCore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./StudioHybridDccViewportCore")>();
  return {
    ...actual,
    StudioHybridDccViewport: (props: StudioHybridDccViewportProps) => {
      const assetId = props.workspace.activeAssetId;
      const record = assetId ? props.workspace.session.state.geometry.records[assetId] : undefined;
      const select = (mode: StudioHybridDccComponentMode) => {
        if (!assetId || !record || props.editingDisabled) return;
        props.onComponentSelectionModeChange?.(mode);
        const ids = mode === "vertex" ? record.mesh.vertices.map(({ id }) => id)
          : mode === "face" ? record.mesh.faces.map(({ id }) => id)
            : record.mesh.halfEdges.filter((edge) => edge.twin < 0 || edge.id < edge.twin).map(({ id }) => id);
        ids.forEach((id, index) => props.onSelectComponent?.(assetId, mode, id, index === 0 ? "replace" : "add"));
      };
      return <div data-testid="component-viewport" data-hash={record?.meshHash ?? ""} data-revision={record?.revision ?? 0} data-selection-hash={props.componentSelection?.provenance?.sourceHash ?? ""} data-vertices={JSON.stringify(record?.mesh.vertices.map(({ position }) => position) ?? [])} data-locked={String(props.editingDisabled ?? false)}>
        {(["vertex", "edge", "face"] as const).map((mode) => <button key={mode} type="button" onClick={() => select(mode)}>{`선택 ${mode}`}</button>)}
        <button type="button" onClick={() => {
          const first = record?.mesh.vertices[0];
          if (assetId && first) props.onSelectComponent?.(assetId, "vertex", first.id, "replace");
        }}>첫 정점 선택</button>
        <button type="button" onClick={() => props.onComponentSelectionModeChange?.("object")}>오브젝트 모드</button>
        <button type="button" onClick={() => props.onClearComponentSelection?.()}>요소 선택 해제</button>
      </div>;
    },
  };
});

afterEach(cleanup);
const probe = () => screen.getByTestId("component-viewport");
const region = () => screen.getByRole("region", { name: "선택 요소 변형" });
const hash = () => probe().getAttribute("data-hash");
const latest = (notify: ReturnType<typeof vi.fn<(workspace: StudioHybridDccWorkspace) => void>>) => {
  const call = notify.mock.calls.at(-1);
  if (!call) throw new Error("문서 변경 알림이 없습니다.");
  return call[0];
};

async function start(mode: StudioHybridDccComponentMode = "face") {
  const notify = vi.fn<(workspace: StudioHybridDccWorkspace) => void>();
  const view = render(<StudioHybridDccPanel onWorkspaceChange={notify} />);
  fireEvent.click(screen.getByRole("button", { name: /큐브 추가/u }));
  await waitFor(() => expect(hash()).not.toBe(""));
  fireEvent.click(screen.getByRole("button", { name: `선택 ${mode}` }));
  expect(region()).toBeTruthy();
  return { notify, view, before: latest(notify), originalHash: hash() };
}

describe("선택한 메시 요소의 실제 웹 편집", () => {
  it("면이 새로 표시 불가능해지는 미리보기는 한글 오류와 비활성 적용 버튼을 보여준다", async () => {
    const { notify, before, originalHash } = await start("vertex");
    fireEvent.click(screen.getByRole("button", { name: "첫 정점 선택" }));
    const changesBefore = notify.mock.calls.length;
    const commandCount = before.session.state.commandCount;
    fireEvent.change(within(region()).getByRole("textbox", { name: "X (m)" }), { target: { value: "0.75" } });
    fireEvent.change(within(region()).getByRole("textbox", { name: "Y (m)" }), { target: { value: "0.75" } });
    expect(within(region()).getByRole("alert").textContent).toMatch(/변형 후 화면에 표시될 수 없습니다/u);
    const apply = within(region()).getByRole("button", { name: "요소 변형 적용" });
    expect(apply).toHaveProperty("disabled", true);
    fireEvent.click(apply);
    expect(hash()).toBe(originalHash);
    expect(notify.mock.calls).toHaveLength(changesBefore);
    expect(latest(notify).session.state.commandCount).toBe(commandCount);
    expect(latest(notify).session.undoStack).toBe(before.session.undoStack);
  });

  it.each(["vertex", "edge", "face"] as const)("%s 선택을 미리보기→한 번 적용→undo/redo하고 저장한 원본으로 재진입한다", async (mode) => {
    const { notify, view, before, originalHash } = await start(mode);
    const changesBefore = notify.mock.calls.length;
    fireEvent.change(within(region()).getByRole("textbox", { name: "Y (m)" }), { target: { value: "0.3" } });
    const previewHash = hash();
    expect(previewHash).not.toBe(originalHash);
    expect(probe().getAttribute("data-locked")).toBe("true");
    expect(notify.mock.calls).toHaveLength(changesBefore);
    expect(before.session.undoStack).toHaveLength(1);

    const apply = within(region()).getByRole("button", { name: "요소 변형 적용" });
    fireEvent.click(apply);
    fireEvent.click(apply);
    await waitFor(() => expect(latest(notify).session.undoStack).toHaveLength(2));
    await waitFor(() => expect(probe().getAttribute("data-locked")).toBe("false"));
    expect(hash()).toBe(previewHash);
    expect(probe().getAttribute("data-selection-hash")).toBe(previewHash);
    expect(Number(probe().getAttribute("data-revision"))).toBeGreaterThan(1);
    expect(latest(notify).session.state.objectTransforms).toEqual(before.session.state.objectTransforms);
    const committed = latest(notify);

    fireEvent.click(screen.getByRole("button", { name: "마지막 3D 편집 되돌리기" }));
    await waitFor(() => expect(hash()).toBe(originalHash));
    fireEvent.click(screen.getByRole("button", { name: "되돌린 3D 편집 다시 실행" }));
    await waitFor(() => expect(hash()).toBe(previewHash));

    const scope = { userId: "component-transform-test", workId: `cube-${mode}` };
    const { bytes } = encodeStudioHybridDccWorkspacePersistenceEnvelope({ workspace: committed, scope });
    const restored = decodeStudioHybridDccWorkspacePersistenceEnvelope({ bytes, scope }).workspace;
    if (!restored) throw new Error("저장한 3D 문서가 없습니다.");
    view.unmount();
    render(<StudioHybridDccPanel initialWorkspace={restored} />);
    await waitFor(() => expect(hash()).toBe(previewHash));
  });

  it("회전은 도 입력을 라디안으로 바꾸고 크기는 선택 중심을 기준으로 한 배율을 적용한다", async () => {
    const { notify, before } = await start("vertex");
    const original = Object.values(before.session.state.geometry.records)[0];
    if (!original) throw new Error("큐브 원본이 없습니다.");
    fireEvent.change(within(region()).getByLabelText("변형 종류"), { target: { value: "rotate" } });
    fireEvent.change(within(region()).getByRole("textbox", { name: "Z (도)" }), { target: { value: "90" } });
    fireEvent.click(within(region()).getByRole("button", { name: "요소 변형 적용" }));
    await waitFor(() => expect(latest(notify).session.undoStack).toHaveLength(2));
    const rotated = Object.values(latest(notify).session.state.geometry.records)[0];
    const initialPoint = original.mesh.vertices[0]?.position;
    const rotatedPoint = rotated?.mesh.vertices[0]?.position;
    if (!initialPoint || !rotatedPoint) throw new Error("편집한 큐브 정점이 없습니다.");
    expect(rotatedPoint.x).toBeCloseTo(-initialPoint.y);
    expect(rotatedPoint.y).toBeCloseTo(initialPoint.x);

    fireEvent.change(within(region()).getByLabelText("변형 종류"), { target: { value: "scale" } });
    fireEvent.change(within(region()).getByRole("textbox", { name: "X (배율)" }), { target: { value: "2" } });
    fireEvent.click(within(region()).getByRole("button", { name: "요소 변형 적용" }));
    await waitFor(() => expect(latest(notify).session.undoStack).toHaveLength(3));
    const scaled = Object.values(latest(notify).session.state.geometry.records)[0];
    expect(scaled?.mesh.vertices[0]?.position.x).toBeCloseTo(2 * rotatedPoint.x);
  });

  it("취소·잘못된 입력·0배율·선택 전환은 원본과 history에 편집을 추가하지 않는다", async () => {
    const { notify, originalHash } = await start();
    const changesBefore = notify.mock.calls.length;
    const x = within(region()).getByRole("textbox", { name: "X (m)" });
    fireEvent.change(x, { target: { value: "0.5" } });
    expect(hash()).not.toBe(originalHash);
    fireEvent.click(within(region()).getByRole("button", { name: "변형 취소" }));
    expect(hash()).toBe(originalHash);
    expect(notify.mock.calls).toHaveLength(changesBefore);
    fireEvent.change(x, { target: { value: "1e999" } });
    expect(within(region()).getByRole("alert").textContent).toMatch(/유효한 숫자/u);
    expect(within(region()).getByRole("button", { name: "요소 변형 적용" })).toHaveProperty("disabled", true);
    fireEvent.change(within(region()).getByLabelText("변형 종류"), { target: { value: "scale" } });
    fireEvent.change(within(region()).getByRole("textbox", { name: "X (배율)" }), { target: { value: "0" } });
    expect(within(region()).getByRole("alert").textContent).toMatch(/배율/u);
    expect(hash()).toBe(originalHash);
    expect(notify.mock.calls).toHaveLength(changesBefore);
    fireEvent.click(screen.getByRole("button", { name: "오브젝트 모드" }));
    expect(screen.queryByRole("region", { name: "선택 요소 변형" })).toBeNull();
    expect(hash()).toBe(originalHash);
  });

  it("요소 변형과 면 모델링 미리보기를 동시에 시작하지 않는다", async () => {
    await start();
    fireEvent.change(within(region()).getByRole("textbox", { name: "Y (m)" }), { target: { value: "0.1" } });
    fireEvent.click(screen.getByRole("button", { name: /^면 모델링 ·/u }));
    expect(screen.getByRole("textbox", { name: "거리 (m)" })).toHaveProperty("disabled", true);
    fireEvent.click(within(region()).getByRole("button", { name: "변형 취소" }));
    fireEvent.change(screen.getByRole("textbox", { name: "거리 (m)" }), { target: { value: "0.1" } });
    expect(within(region()).getByText(/면 모델링 미리보기를 적용하거나 취소/u)).toBeTruthy();
    expect(within(region()).getByRole("textbox", { name: "Y (m)" }).matches(":disabled")).toBe(true);
  });

  it("작업대 안의 Esc와 외부 선택 전환은 미리보기만 버리고 다른 구역의 Esc는 가로채지 않는다", async () => {
    const { notify, originalHash } = await start();
    const changesBefore = notify.mock.calls.length;
    const x = within(region()).getByRole("textbox", { name: "X (m)" });
    fireEvent.change(x, { target: { value: "0.25" } });
    const preview = hash();
    expect(preview).not.toBe(originalHash);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(hash()).toBe(preview);
    fireEvent.keyDown(x, { key: "Escape" });
    expect(hash()).toBe(originalHash);
    fireEvent.change(x, { target: { value: "0.25" } });
    fireEvent.click(screen.getByRole("button", { name: "오브젝트 모드" }));
    expect(hash()).toBe(originalHash);
    expect(screen.queryByRole("region", { name: "선택 요소 변형" })).toBeNull();
    expect(notify.mock.calls).toHaveLength(changesBefore);
  });

  it("정점 하나를 그 자체 중심으로 회전하는 등 실제 좌표가 안 바뀌면 확정하지 않는다", async () => {
    const { notify, originalHash } = await start("vertex");
    fireEvent.click(screen.getByRole("button", { name: "첫 정점 선택" }));
    const changesBefore = notify.mock.calls.length;
    fireEvent.change(within(region()).getByLabelText("변형 종류"), { target: { value: "rotate" } });
    fireEvent.change(within(region()).getByRole("textbox", { name: "Z (도)" }), { target: { value: "90" } });
    expect(within(region()).getByRole("button", { name: "요소 변형 적용" })).toHaveProperty("disabled", true);
    expect(within(region()).getByRole("status").textContent).toMatch(/변경할 값을/u);
    expect(hash()).toBe(originalHash);
    expect(notify.mock.calls).toHaveLength(changesBefore);
  });
});
