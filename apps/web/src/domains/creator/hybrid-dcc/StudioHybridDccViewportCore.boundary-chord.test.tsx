// @vitest-environment jsdom
/** 실제 Core의 DOM 선택 경계 회귀. Canvas 표면·로컬 저장 장치 경계만 대체하며 GPU를 실행하지 않는다. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudioHybridDccComponentSelection, mutateStudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube, workspaceComponentSelectionSource } from "./studio-hybrid-dcc-workspace";
import { StudioHybridDccViewport } from "./StudioHybridDccViewportCore";
import { loadHybridDccViewportPreferences } from "./viewport-preferences-store";

const db = vi.hoisted(() => ({ rows: new Map<string, string>(), get: vi.fn(), set: vi.fn(), acquire: vi.fn(), asAsyncKeyValueStore: vi.fn() }));
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: db.acquire }));
vi.mock("@react-three/fiber", () => ({
  Canvas: (props: { readonly onPointerMissed?: () => void }) => <div role="application" aria-label="테스트 Canvas 표면">
    <button type="button" onClick={props.onPointerMissed}>테스트 빈 공간</button>
  </div>, useThree: vi.fn(),
}));
vi.mock("@react-three/drei/core/ContactShadows.js", () => ({ ContactShadows: () => null }));
vi.mock("@react-three/drei/core/OrbitControls.js", () => ({ OrbitControls: () => null }));
vi.mock("@react-three/drei/core/OrthographicCamera.js", () => ({ OrthographicCamera: () => null }));
vi.mock("@react-three/drei/core/PerspectiveCamera.js", () => ({ PerspectiveCamera: () => null }));
vi.mock("@react-three/drei/core/TransformControls.js", () => ({ TransformControls: () => null }));
beforeEach(() => {
  db.rows.clear(); db.get.mockReset().mockImplementation(async (key: string) => db.rows.get(key) ?? null);
  db.set.mockReset().mockImplementation(async (key: string, value: string) => { db.rows.set(key, value); });
  db.asAsyncKeyValueStore.mockReset().mockReturnValue(db); db.acquire.mockReset().mockResolvedValue(db);
});
afterEach(async () => { cleanup(); await loadHybridDccViewportPreferences(); vi.restoreAllMocks(); });
function fixture() {
  const workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("boundary-core"), "cube");
  const source = workspaceComponentSelectionSource(workspace);
  if (!source) throw new Error("실제 geometry source가 없습니다.");
  const face = readStudioMeshFaceLoops(source.mesh)?.find((loop) => loop.vertexIds.every((id) => source.mesh.vertices[id]?.position.z === 0.5));
  if (!face) throw new Error("실제 cube 앞면이 없습니다.");
  const selection = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), { mode: "face", operation: "replace", ids: [face.id], source });
  if (!selection.ok) throw new Error("실제 face selection이 없습니다.");
  return { workspace, componentSelection: selection.value, webglAvailable: true,
    onSelectAsset: vi.fn(), onSelectComponent: vi.fn(), onClearComponentSelection: vi.fn(),
    onComponentSelectionModeChange: vi.fn(), onDeleteSelected: vi.fn(), onDuplicateSelected: vi.fn() };
}
describe("실제 Core의 경계선 picking 선택 보존", () => {
  it("빈 공간은 chord 중 선택을 지우지 않고 일반 모드에서는 기존 해제 동작을 유지한다", () => {
    const props = fixture(), onBoundaryEndpointPick = vi.fn(() => false);
    const view = render(<StudioHybridDccViewport {...props} onBoundaryEndpointPick={onBoundaryEndpointPick} />);
    fireEvent.click(screen.getByRole("button", { name: "테스트 빈 공간" }));
    expect(props.onClearComponentSelection).not.toHaveBeenCalled(); expect(props.onSelectAsset).not.toHaveBeenCalled();
    expect(onBoundaryEndpointPick).not.toHaveBeenCalled();
    view.rerender(<StudioHybridDccViewport {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "테스트 빈 공간" }));
    expect(props.onClearComponentSelection).toHaveBeenCalledTimes(1);
  });
  it("component 모드·asset 버튼·편집 단축키는 잠그고 camera 투영 단축키는 유지한다", () => {
    const props = fixture(); render(<StudioHybridDccViewport {...props} onBoundaryEndpointPick={() => false} />);
    const mode = screen.getByRole("button", { name: "꼭짓점 선택 모드 (1)" });
    expect(mode).toHaveProperty("disabled", true); fireEvent.click(mode);
    const viewport = screen.getByLabelText("Hybrid DCC 3D 작업 뷰포트");
    const assetButton = viewport.querySelector<HTMLButtonElement>('button[data-render-hash]');
    if (!assetButton) throw new Error("실제 asset 선택 버튼이 없습니다.");
    expect(assetButton.disabled).toBe(true); fireEvent.click(assetButton);
    const target = screen.getByRole("button", { name: "테스트 빈 공간" });
    fireEvent.keyDown(target, { key: "1", code: "Digit1" });
    fireEvent.keyDown(target, { key: "Delete", code: "Delete" });
    expect(props.onComponentSelectionModeChange).not.toHaveBeenCalled(); expect(props.onSelectAsset).not.toHaveBeenCalled();
    expect(props.onDeleteSelected).not.toHaveBeenCalled(); expect(props.onDuplicateSelected).not.toHaveBeenCalled();
    const projection = viewport.getAttribute("data-projection");
    fireEvent.keyDown(target, { key: "5", code: "Numpad5" });
    expect(viewport.getAttribute("data-projection")).not.toBe(projection);
  });
});
