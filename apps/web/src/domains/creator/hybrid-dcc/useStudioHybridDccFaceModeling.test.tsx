// @vitest-environment jsdom

/**
 * 면 모델링 훅의 미리보기 계산 정책: 면이 4000개를 넘는 큰 메시는 핸들을 끄는 동안 다시 계산하지 않고 놓을 때
 * 한 번만 계산하며, 작은 메시와 직접 입력은 항상 바로 계산한다. 화면 없이 훅만 렌더해 본다.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createStudioEditableMeshFromPolygons, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";

import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceComponentSelectionSource,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import { useStudioHybridDccFaceModeling } from "./useStudioHybridDccFaceModeling";

import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";

afterEach(cleanup);

/** 한 변을 n칸으로 나눈 닫힌 정육면체(면 6n²개). 모든 면이 사각형이고 정점을 공유한다. */
function subdividedCube(n: number): StudioEditableMesh {
  const positions: { x: number; y: number; z: number }[] = [];
  const known = new Map<string, number>();
  const vertex = (x: number, y: number, z: number) => {
    const key = `${x},${y},${z}`;
    let id = known.get(key);
    if (id === undefined) {
      id = positions.length;
      known.set(key, id);
      positions.push({ x: x / n - 0.5, y: y / n - 0.5, z: z / n - 0.5 });
    }
    return id;
  };
  const faces: number[][] = [];
  for (const axis of [0, 1, 2]) {
    for (const side of [0, 1]) {
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          const corner = (di: number, dj: number) => {
            const c = [0, 0, 0];
            c[axis] = side * n;
            c[u] = i + di;
            c[v] = j + dj;
            return vertex(c[0]!, c[1]!, c[2]!);
          };
          const quad = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
          faces.push(side === 1 ? quad : quad.reverse());
        }
      }
    }
  }
  return createStudioEditableMeshFromPolygons(positions, faces);
}

function workspaceWithMesh(mesh: StudioEditableMesh): StudioHybridDccWorkspace {
  const workspace = createStudioHybridDccWorkspace("face-modeling-big");
  const session = hybridDccRegisterAsset(workspace.session, "cube", mesh, {
    source: "primitive",
    creator: "studio",
    license: "CC0-1.0",
    useScope: "commercial",
    derivative: "original",
  });
  return { ...workspace, session, activeAssetId: "cube" };
}

function renderFaceModeling(workspace: StudioHybridDccWorkspace, faceId: number) {
  const selection = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face",
    operation: "replace",
    ids: [faceId],
    activeId: faceId,
    source: workspaceComponentSelectionSource(workspace)!,
  });
  if (!selection.ok) throw new Error("selection");
  const props: StudioHybridDccViewportProps = {
    workspace,
    componentSelection: selection.value,
    onSelectAsset: () => undefined,
  };
  const view = renderHook(() => useStudioHybridDccFaceModeling(props, () => undefined));
  act(() => view.result.current.setOpen(true));
  const shownHash = () => view.result.current.viewportProps.workspace.session.state.geometry.records.cube!.meshHash;
  return { view, shownHash, originalHash: workspace.session.state.geometry.records.cube!.meshHash };
}

describe("면 모델링 훅: 핸들을 끄는 동안의 미리보기 정책", () => {
  it("면이 4000개를 넘으면 끄는 동안은 다시 계산하지 않고 놓을 때 한 번 계산한다", () => {
    const mesh = subdividedCube(26);
    expect(mesh.faces.length).toBeGreaterThan(4000);
    const { view, shownHash, originalHash } = renderFaceModeling(workspaceWithMesh(mesh), 0);
    act(() => view.result.current.beginDrag());
    act(() => view.result.current.setHandleValue(0.1));
    act(() => view.result.current.setHandleValue(0.2));
    expect(view.result.current.text).toBe("0.2");
    expect(view.result.current.dragging).toBe(true);
    expect(shownHash()).toBe(originalHash);
    // 보이는 결과(원본)와 입력(0.2)이 다르므로 끄는 동안에는 적용하지 못한다.
    expect(view.result.current.canApply).toBe(false);
    act(() => view.result.current.endDrag());
    expect(shownHash()).not.toBe(originalHash);
    expect(view.result.current.canApply).toBe(true);
    expect(view.result.current.error).toBeNull();
  });

  it("이미 값이 있는 큰 메시를 끌면 미리보기는 끌기 시작 값에 멈추고, 그 사이 보이지 않는 값은 적용하지 못한다", () => {
    const { view, shownHash, originalHash } = renderFaceModeling(workspaceWithMesh(subdividedCube(26)), 0);
    act(() => view.result.current.setText("0.05"));
    const atStart = shownHash();
    expect(atStart).not.toBe(originalHash);
    expect(view.result.current.canApply).toBe(true);
    act(() => view.result.current.beginDrag());
    act(() => view.result.current.setHandleValue(0.3));
    // 미리보기는 0.05 그대로인데 입력은 0.3 이므로 지금 확정하면 보이는 것과 다른 결과가 된다.
    expect(shownHash()).toBe(atStart);
    expect(view.result.current.text).toBe("0.3");
    expect(view.result.current.canApply).toBe(false);
    act(() => view.result.current.endDrag());
    expect(shownHash()).not.toBe(atStart);
    expect(view.result.current.canApply).toBe(true);
  });

  it("직접 입력은 큰 메시도 바로 계산한다", () => {
    const { view, shownHash, originalHash } = renderFaceModeling(workspaceWithMesh(subdividedCube(26)), 0);
    act(() => view.result.current.setText("0.1"));
    expect(shownHash()).not.toBe(originalHash);
  });

  it("작은 메시는 끄는 동안에도 값마다 미리보기를 다시 계산한다", () => {
    const workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("face-modeling-hook"), "cube");
    const { view, shownHash, originalHash } = renderFaceModeling(workspace, 3);
    act(() => view.result.current.beginDrag());
    act(() => view.result.current.setHandleValue(0.1));
    const first = shownHash();
    act(() => view.result.current.setHandleValue(0.3));
    expect(first).not.toBe(originalHash);
    expect(shownHash()).not.toBe(first);
    expect(view.result.current.dragging).toBe(true);
  });
});
