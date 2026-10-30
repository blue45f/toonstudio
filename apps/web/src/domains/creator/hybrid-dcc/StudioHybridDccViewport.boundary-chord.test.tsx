// @vitest-environment jsdom
/** 3D 표면만 대체하고 실제 wrapper·면 hook·canonical 선택·투영 수학을 연결한다. GPU 증거가 아니다. */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Matrix4, OrthographicCamera, Vector2, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import { createStudioHybridDccComponentSelection, mapStudioHybridDccRayFaceIndex, mutateStudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube, workspaceComponentSelectionSource } from "./studio-hybrid-dcc-workspace";
import { StudioHybridDccViewport } from "./StudioHybridDccViewport";

import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";
import type { StudioHybridDccBoundaryEndpointPick } from "./studio-hybrid-dcc-viewport-mesh-click";
import type { StudioHybridDccFaceModelingModel } from "./useStudioHybridDccFaceModeling";
import type { StudioHybridDccWorkspaceEdit } from "./studio-hybrid-dcc-face-modeling-workspace";

const surfaces: StudioHybridDccViewportProps[] = [];
vi.mock("./StudioHybridDccViewportCore", () => ({ StudioHybridDccViewport: (props: StudioHybridDccViewportProps) => {
  surfaces.push(props); return <canvas tabIndex={0} aria-label="테스트 3D 표면" />;
} }));
vi.mock("./StudioHybridDccComponentTransformTools", () => ({ StudioHybridDccComponentTransformTools: () => null }));
vi.mock("./StudioHybridDccMeshSelectionTools", () => ({ StudioHybridDccMeshSelectionTools: () => null }));
vi.mock("./StudioHybridDccPrecisionTools", () => ({ StudioHybridDccPrecisionTools: () => null }));
vi.mock("./StudioHybridDccTransformUtilities", () => ({ StudioHybridDccTransformUtilities: () => null }));
vi.mock("./StudioHybridDccUvEditor", () => ({ StudioHybridDccUvEditor: () => null }));
vi.mock("./materials/StudioHybridDccToonEditor", () => ({ StudioHybridDccToonEditor: () => null }));
vi.mock("./StudioHybridDccFaceModelingTools", () => ({ StudioHybridDccFaceModelingTools: ({ model }: { readonly model: StudioHybridDccFaceModelingModel }) => (
  <section ref={model.sectionRef} aria-label="기존 면 작업대">
    <button type="button" onClick={() => { model.setOpen(true); model.setText("0.1"); }}>기존 도구 미리보기</button>
    <button type="button" disabled={!model.canApply} onClick={model.apply}>기존 적용</button>
  </section>
) }));
function need<T>(value: T | undefined | null): T { if (value === undefined || value === null) throw new Error("실제 viewport fixture 값이 없습니다."); return value; }
function surface(): StudioHybridDccViewportProps { return need(surfaces.at(-1)); }
function fixture() {
  const workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("boundary-viewport"), "cube");
  const source = need(workspaceComponentSelectionSource(workspace));
  const face = need(readStudioMeshFaceLoops(source.mesh)?.find((loop) => loop.vertexIds.every((id) => source.mesh.vertices[id]?.position.z === 0.5)));
  const selected = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), { mode: "face", operation: "replace", ids: [face.id], source });
  if (!selected.ok) throw new Error("실제 면 선택을 만들지 못했습니다.");
  const planned = inspectStudioMeshSurfaceForInteractiveProjection(source.mesh);
  if (!planned.ok) throw new Error(planned.message);
  const hit = mapStudioHybridDccRayFaceIndex(source, planned.value.plan.triangles.findIndex((triangle) => triangle.faceId === face.id));
  if (!hit.ok) throw new Error("실제 surface mapping이 없습니다.");
  const edge = need(source.mesh.halfEdges[need(face.halfEdgeIds[0])]);
  const a = need(source.mesh.vertices[need(source.mesh.halfEdges[edge.prev]).vertex]).position, b = need(source.mesh.vertices[edge.vertex]).position;
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.set(0, 0, 3); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const point = new Vector3(a.x, a.y, a.z).lerp(new Vector3(b.x, b.y, b.z), 0.25).project(camera);
  const pick: StudioHybridDccBoundaryEndpointPick = { assetId: source.assetId, hit: hit.value,
    projection: { pointerNdc: new Vector2(point.x, point.y), camera, matrixWorld: new Matrix4(), viewportSize: { width: 600, height: 600 } } };
  const run = vi.fn((_label: string, _edit: StudioHybridDccWorkspaceEdit, _canCommit?: () => boolean) => undefined);
  const props = { workspace, componentSelection: selected.value, onSelectAsset: vi.fn(), onRunWorkspaceEdit: run };
  return { props, pick, source, run };
}
beforeEach(() => { surfaces.length = 0; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("실제 viewport wrapper의 경계선 도구 연결", () => {
  it("명시 모드에서만 실제 endpoint를 받고 다른 asset 거부는 기존 선택 명령으로 이어지지 않는다", () => {
    const f = fixture(); render(<StudioHybridDccViewport {...f.props} />);
    expect(surface().onBoundaryEndpointPick).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "모서리에서 선택" }));
    expect(screen.getByRole("button", { name: "모서리에서 선택" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("region", { name: "기존 면 작업대" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("테스트 3D 표면"));
    const pick = need(surface().onBoundaryEndpointPick);
    act(() => { expect(pick({ ...f.pick, assetId: "other-asset" })).toBe(false); });
    expect(screen.getByText("선택한 경계점 0/2")).toBeTruthy();
    expect(f.props.onSelectAsset).not.toHaveBeenCalled();
    act(() => { expect(pick(f.pick)).toBe(true); });
    expect(screen.getByText("선택한 경계점 1/2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "기존 적용" })).toBeNull();
    expect(f.run).not.toHaveBeenCalled();
  });

  it("첫 점 전과 첫 점 뒤 Escape는 원본 선택을 보존하고 picking 모드까지 종료한다", () => {
    const f = fixture(); render(<StudioHybridDccViewport {...f.props} />);
    fireEvent.click(screen.getByRole("button", { name: "모서리에서 선택" }));
    fireEvent.keyDown(screen.getByLabelText("테스트 3D 표면"), { key: "Escape", isComposing: true });
    expect(surface().onBoundaryEndpointPick).toBeDefined();
    fireEvent.keyDown(screen.getByLabelText("테스트 3D 표면"), { key: "Escape" });
    expect(surface().onBoundaryEndpointPick).toBeUndefined();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "모서리에서 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "모서리에서 선택" }));
    act(() => { need(surface().onBoundaryEndpointPick)(f.pick); });
    expect(surface().boundaryEndpointMarkers).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "꼭짓점에서 선택" }));
    fireEvent.keyDown(screen.getByLabelText("테스트 3D 표면"), { key: "Escape" });
    expect(surface().onBoundaryEndpointPick).toBeUndefined();
    expect(screen.getByText("선택한 경계점 0/2")).toBeTruthy();
    expect(f.props.onSelectAsset).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled();
  });

  it("카메라 투영 전환은 선택한 anchor를 유지하고 문서·선택 변경 후 원래 선택으로 돌아와도 모드를 재활성화하지 않는다", () => {
    const f = fixture(), view = render(<StudioHybridDccViewport {...f.props} />);
    fireEvent.click(screen.getByRole("button", { name: "모서리에서 선택" }));
    act(() => { need(surface().onBoundaryEndpointPick)(f.pick); });
    view.rerender(<StudioHybridDccViewport {...f.props} projection="orthographic" />);
    expect(screen.getByText("선택한 경계점 1/2")).toBeTruthy();
    expect(surface().onBoundaryEndpointPick).toBeDefined();
    view.rerender(<StudioHybridDccViewport {...f.props} componentSelection={createStudioHybridDccComponentSelection()} />);
    expect(surface().onBoundaryEndpointPick).toBeUndefined();
    view.rerender(<StudioHybridDccViewport {...f.props} />);
    expect(surface().onBoundaryEndpointPick).toBeUndefined();
    expect(screen.getByRole("button", { name: "모서리에서 선택" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("선택한 경계점 0/2")).toBeTruthy();
  });

  it("실제 읽기 전용·조형·host busy 경계에서는 시작과 callback을 잠그며 해제 후 새 작업을 허용한다", () => {
    const f = fixture(), view = render(<StudioHybridDccViewport {...f.props} onRunWorkspaceEdit={undefined} />);
    expect(screen.getByRole("button", { name: "모서리에서 선택" }).hasAttribute("disabled")).toBe(true);
    view.rerender(<StudioHybridDccViewport {...f.props} onSculptStroke={() => undefined} />);
    expect(screen.getByRole("button", { name: "모서리에서 선택" }).hasAttribute("disabled")).toBe(true);
    view.rerender(<StudioHybridDccViewport {...f.props} />);
    fireEvent.click(screen.getByRole("button", { name: "모서리에서 선택" }));
    view.rerender(<StudioHybridDccViewport {...f.props} editingDisabled />);
    expect(surface().editingDisabled).toBe(true);
    expect(screen.getByRole("button", { name: "모서리에서 선택" }).hasAttribute("disabled")).toBe(true);
    act(() => { expect(need(surface().onBoundaryEndpointPick)(f.pick)).toBe(false); });
    expect(screen.getByText("선택한 경계점 0/2")).toBeTruthy();
    view.rerender(<StudioHybridDccViewport {...f.props} />);
    act(() => { expect(need(surface().onBoundaryEndpointPick)(f.pick)).toBe(true); });
    expect(screen.getByText("선택한 경계점 1/2")).toBeTruthy();
    expect(f.run).not.toHaveBeenCalled();
  });

  it("기존 실제 거리 preview가 있으면 경계선 도구를 시작하지 않고 재질 모드 왕복은 picking을 닫는다", () => {
    const f = fixture(), view = render(<StudioHybridDccViewport {...f.props} />);
    fireEvent.click(screen.getByRole("button", { name: "기존 도구 미리보기" }));
    expect(screen.getByRole("button", { name: "모서리에서 선택" }).hasAttribute("disabled")).toBe(true);
    expect(surface().onBoundaryEndpointPick).toBeUndefined();
    view.unmount();
    const next = render(<StudioHybridDccViewport {...f.props} />);
    fireEvent.click(screen.getByRole("button", { name: "모서리에서 선택" }));
    next.rerender(<StudioHybridDccViewport {...f.props} materialMode />);
    expect(surface().onBoundaryEndpointPick).toBeUndefined();
    next.rerender(<StudioHybridDccViewport {...f.props} materialMode={false} />);
    expect(surface().onBoundaryEndpointPick).toBeUndefined();
    expect(screen.getByRole("button", { name: "모서리에서 선택" }).getAttribute("aria-pressed")).toBe("false");
  });
});
