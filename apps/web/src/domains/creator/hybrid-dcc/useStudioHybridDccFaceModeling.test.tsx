// @vitest-environment jsdom

/**
 * 면 모델링 훅의 미리보기 계산 정책: 비용(면 수 + 선택 면 수 x 3)이 작은 메시는 입력마다 바로 계산하고, 400을 넘으면
 * 타이핑·화살표 입력은 200ms 멈춘 뒤에(Enter는 바로), 1500을 넘으면 핸들을 끄는 동안 멈췄다가 놓을 때 한 번만
 * 계산한다. 면이 8000개를 넘는 오브젝트는 도구를 쓸 수 없다. 화면 없이 훅만 렌더하고 시간은 가짜 시계로 흘린다.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioEditableMeshFromPolygons, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";

import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import { STUDIO_FACE_MODELING_LIMITS } from "./studio-hybrid-dcc-face-modeling-mesh";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceComponentSelectionSource,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import { useStudioHybridDccFaceModeling } from "./useStudioHybridDccFaceModeling";

import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

/** 가로 columns x 세로 rows 칸의 열린 평면 격자. 면 수를 정확히 맞추고 싶을 때 쓴다. */
function gridPlate(columns: number, rows: number): StudioEditableMesh {
  const positions: { x: number; y: number; z: number }[] = [];
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= columns; i += 1) positions.push({ x: i / columns, y: 0, z: j / rows });
  }
  const faces: number[][] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < columns; i += 1) {
      const at = (di: number, dj: number) => (j + dj) * (columns + 1) + i + di;
      faces.push([at(0, 0), at(0, 1), at(1, 1), at(1, 0)]);
    }
  }
  return createStudioEditableMeshFromPolygons(positions, faces);
}

function renderFaceModeling(workspace: StudioHybridDccWorkspace, faceIds: number | readonly number[]) {
  const ids = typeof faceIds === "number" ? [faceIds] : [...faceIds];
  const selection = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face",
    operation: "replace",
    ids,
    activeId: ids.at(-1),
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
  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
  return { view, shownHash, wait, originalHash: workspace.session.state.geometry.records.cube!.meshHash };
}

const DEBOUNCE = STUDIO_FACE_MODELING_LIMITS.previewDebounceMs;

describe("면 모델링 훅: 비용이 큰 메시에서 핸들을 끄는 동안의 미리보기 정책", () => {
  it("비용이 1500을 넘으면 끄는 동안은 다시 계산하지 않고 놓을 때 한 번 계산한다", () => {
    const mesh = subdividedCube(26);
    expect(mesh.faces.length).toBeGreaterThan(STUDIO_FACE_MODELING_LIMITS.livePreviewCost);
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
    // 놓은 직후에는 입력 대기 없이 바로 계산된다.
    expect(shownHash()).not.toBe(originalHash);
    expect(view.result.current.pending).toBe(false);
    expect(view.result.current.canApply).toBe(true);
    expect(view.result.current.error).toBeNull();
  });

  it("이미 값이 있는 큰 메시를 끌면 미리보기는 끌기 시작 값에 멈추고, 그 사이 보이지 않는 값은 적용하지 못한다", () => {
    const { view, shownHash, wait, originalHash } = renderFaceModeling(workspaceWithMesh(subdividedCube(26)), 0);
    act(() => view.result.current.setText("0.05"));
    wait(DEBOUNCE);
    const atStart = shownHash();
    expect(atStart).not.toBe(originalHash);
    expect(view.result.current.canApply).toBe(true);
    act(() => view.result.current.beginDrag());
    act(() => view.result.current.setHandleValue(0.3));
    wait(DEBOUNCE * 3);
    // 미리보기는 0.05 그대로인데 입력은 0.3 이므로 지금 확정하면 보이는 것과 다른 결과가 된다.
    expect(shownHash()).toBe(atStart);
    expect(view.result.current.text).toBe("0.3");
    expect(view.result.current.canApply).toBe(false);
    act(() => view.result.current.endDrag());
    expect(shownHash()).not.toBe(atStart);
    expect(view.result.current.canApply).toBe(true);
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

  it("비용이 400을 넘고 1500 이하인 메시는 끄는 동안에도 바로 계산한다", () => {
    const mesh = subdividedCube(12);
    expect(mesh.faces.length).toBeGreaterThan(STUDIO_FACE_MODELING_LIMITS.debouncedPreviewCost);
    expect(mesh.faces.length).toBeLessThan(STUDIO_FACE_MODELING_LIMITS.livePreviewCost);
    const { view, shownHash, originalHash } = renderFaceModeling(workspaceWithMesh(mesh), 0);
    act(() => view.result.current.beginDrag());
    act(() => view.result.current.setHandleValue(0.1));
    const first = shownHash();
    expect(first).not.toBe(originalHash);
    act(() => view.result.current.setHandleValue(0.2));
    expect(shownHash()).not.toBe(first);
    expect(view.result.current.pending).toBe(false);
  });
});

describe("면 모델링 훅: 비용이 큰 메시에서 타이핑·화살표 입력", () => {
  it("입력이 200ms 멈출 때까지 계산을 미루고, 그동안은 적용하지 못하며 이유를 알린다", () => {
    const { view, shownHash, wait, originalHash } = renderFaceModeling(workspaceWithMesh(subdividedCube(12)), 0);
    act(() => view.result.current.setText("0.1"));
    expect(shownHash()).toBe(originalHash);
    expect(view.result.current.pending).toBe(true);
    expect(view.result.current.canApply).toBe(false);
    expect(view.result.current.hint).toContain("입력을 멈추면");
    wait(DEBOUNCE - 1);
    expect(shownHash()).toBe(originalHash);
    wait(1);
    expect(shownHash()).not.toBe(originalHash);
    expect(view.result.current.pending).toBe(false);
    expect(view.result.current.canApply).toBe(true);
    expect(view.result.current.hint).toBeNull();
  });

  it("입력이 이어지는 동안에는 대기가 매번 새로 시작해 마지막 값으로 한 번만 계산한다", () => {
    const { view, shownHash, wait, originalHash } = renderFaceModeling(workspaceWithMesh(subdividedCube(12)), 0);
    act(() => view.result.current.setText("0.1"));
    wait(150);
    act(() => view.result.current.setText("0.12"));
    wait(150);
    expect(shownHash()).toBe(originalHash);
    wait(50);
    const settled = shownHash();
    expect(settled).not.toBe(originalHash);
    // 같은 값을 단독으로 입력했을 때와 같은 결과(중간 값 0.1 이 아니라 마지막 값 0.12 로 계산됐다).
    const reference = renderFaceModeling(workspaceWithMesh(subdividedCube(12)), 0);
    act(() => reference.view.result.current.setText("0.12"));
    reference.wait(DEBOUNCE);
    expect(reference.shownHash()).toBe(settled);
  });

  it("이미 미리보기가 보이는 상태에서 값을 고치면, 새 값이 반영되기 전까지는 보이는 결과를 적용하지 못한다", () => {
    const { view, shownHash, wait, originalHash } = renderFaceModeling(workspaceWithMesh(subdividedCube(12)), 0);
    act(() => view.result.current.setText("0.1"));
    wait(DEBOUNCE);
    const first = shownHash();
    expect(first).not.toBe(originalHash);
    expect(view.result.current.canApply).toBe(true);
    act(() => view.result.current.setText("0.2"));
    // 화면에는 아직 0.1 의 결과가 보이지만 입력은 0.2 다.
    expect(shownHash()).toBe(first);
    expect(view.result.current.pending).toBe(true);
    expect(view.result.current.canApply).toBe(false);
    wait(DEBOUNCE);
    expect(shownHash()).not.toBe(first);
    expect(view.result.current.canApply).toBe(true);
  });

  it("화살표 단계 이동도 같은 대기를 거치고, flushPreview(Enter)는 기다리지 않고 지금 값으로 계산한다", () => {
    const { view, shownHash, wait, originalHash } = renderFaceModeling(workspaceWithMesh(subdividedCube(12)), 0);
    act(() => view.result.current.step(1, "normal"));
    expect(view.result.current.pending).toBe(true);
    expect(shownHash()).toBe(originalHash);
    act(() => view.result.current.flushPreview());
    expect(view.result.current.pending).toBe(false);
    expect(shownHash()).not.toBe(originalHash);
    expect(view.result.current.canApply).toBe(true);
    wait(DEBOUNCE);
    expect(view.result.current.pending).toBe(false);
  });

  it("작은 메시는 입력마다 바로 계산한다", () => {
    const workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("face-modeling-hook"), "cube");
    const { view, shownHash, originalHash } = renderFaceModeling(workspace, 3);
    act(() => view.result.current.setText("0.1"));
    expect(shownHash()).not.toBe(originalHash);
    expect(view.result.current.pending).toBe(false);
  });

  it("비용에는 선택한 면 수가 들어간다: 같은 메시도 많이 고르면 입력을 기다린다", () => {
    const mesh = subdividedCube(7);
    expect(mesh.faces.length).toBeLessThanOrEqual(STUDIO_FACE_MODELING_LIMITS.debouncedPreviewCost);
    const workspace = workspaceWithMesh(mesh);
    const one = renderFaceModeling(workspace, 0);
    act(() => one.view.result.current.setText("0.05"));
    expect(one.view.result.current.pending).toBe(false);
    expect(one.shownHash()).not.toBe(one.originalHash);
    const many = renderFaceModeling(workspace, Array.from({ length: 40 }, (_, index) => index));
    act(() => many.view.result.current.setText("0.05"));
    expect(many.view.result.current.pending).toBe(true);
    expect(many.shownHash()).toBe(many.originalHash);
    many.wait(DEBOUNCE);
    expect(many.view.result.current.pending).toBe(false);
    expect(many.shownHash()).not.toBe(many.originalHash);
  });
});

describe("면 모델링 훅: 비용 임계값의 경계", () => {
  it("비용이 정확히 400이면 바로 계산하고 401부터 입력을 기다린다", () => {
    const mesh = gridPlate(17, 23);
    expect(mesh.faces).toHaveLength(391);
    // 선택 3개: 391 + 9 = 400.
    const exact = renderFaceModeling(workspaceWithMesh(mesh), [0, 1, 2]);
    act(() => exact.view.result.current.setText("0.05"));
    expect(exact.view.result.current.pending).toBe(false);
    expect(exact.shownHash()).not.toBe(exact.originalHash);
    // 선택 4개: 391 + 12 = 403.
    const over = renderFaceModeling(workspaceWithMesh(mesh), [0, 1, 2, 3]);
    act(() => over.view.result.current.setText("0.05"));
    expect(over.view.result.current.pending).toBe(true);
    expect(over.shownHash()).toBe(over.originalHash);
  });

  it("비용이 정확히 1500이면 끄는 동안에도 계산하고 1501부터 멈춘다", () => {
    const mesh = gridPlate(3, 499);
    expect(mesh.faces).toHaveLength(1497);
    // 선택 1개: 1497 + 3 = 1500.
    const exact = renderFaceModeling(workspaceWithMesh(mesh), 0);
    act(() => exact.view.result.current.beginDrag());
    act(() => exact.view.result.current.setHandleValue(0.1));
    expect(exact.shownHash()).not.toBe(exact.originalHash);
    // 선택 2개: 1497 + 6 = 1503.
    const over = renderFaceModeling(workspaceWithMesh(mesh), [0, 1]);
    act(() => over.view.result.current.beginDrag());
    act(() => over.view.result.current.setHandleValue(0.1));
    expect(over.shownHash()).toBe(over.originalHash);
    act(() => over.view.result.current.endDrag());
    expect(over.shownHash()).not.toBe(over.originalHash);
  });

  it("입력을 취소한 뒤 같은 값을 다시 입력해도 대기를 건너뛰지 않는다", () => {
    const { view, shownHash, wait, originalHash } = renderFaceModeling(workspaceWithMesh(subdividedCube(12)), 0);
    act(() => view.result.current.setText("0.1"));
    wait(DEBOUNCE);
    expect(shownHash()).not.toBe(originalHash);
    act(() => view.result.current.cancel());
    expect(shownHash()).toBe(originalHash);
    act(() => view.result.current.setText("0.1"));
    expect(view.result.current.pending).toBe(true);
    expect(shownHash()).toBe(originalHash);
  });
});

describe("면 모델링 훅: 면이 너무 많은 오브젝트", () => {
  it("면이 8000개를 넘으면 도구를 쓸 수 없다고 알리고 아무것도 계산하지 않는다", () => {
    const mesh = subdividedCube(37);
    expect(mesh.faces.length).toBeGreaterThan(STUDIO_FACE_MODELING_LIMITS.maxMeshFaces);
    const { view, shownHash, wait, originalHash } = renderFaceModeling(workspaceWithMesh(mesh), 0);
    expect(view.result.current.unusable).toContain("면이 8000개를 넘는");
    expect(view.result.current.unusable).toContain("단순하게");
    expect(view.result.current.range).toBeNull();
    act(() => view.result.current.setText("0.1"));
    wait(DEBOUNCE * 2);
    expect(shownHash()).toBe(originalHash);
    expect(view.result.current.canApply).toBe(false);
    // 면 그리기 도구도 같다.
    act(() => view.result.current.setTool("draw"));
    expect(view.result.current.unusable).toContain("면이 8000개를 넘는");
  });

  it("면이 8000개 이하면 쓸 수 있다", () => {
    const mesh = subdividedCube(36);
    expect(mesh.faces.length).toBeLessThanOrEqual(STUDIO_FACE_MODELING_LIMITS.maxMeshFaces);
    const { view } = renderFaceModeling(workspaceWithMesh(mesh), 0);
    expect(view.result.current.unusable).toBeNull();
    expect(view.result.current.range).not.toBeNull();
  });
});
