// @vitest-environment jsdom

/**
 * 면 모델링 작업대 상호작용 보강 시험: 확정이 진행되는 동안의 잠금과 입력 방식의 세부 규칙.
 * 기본 흐름은 `StudioHybridDccFaceModelingTools.test.tsx`가 보고, 여기서는 패널의 비동기 실행기를 흉내 낸
 * 작은 하네스로 확정 중·다른 작업 중 상태를 만든다.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import { createStudioEditableMeshFromPolygons, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";

import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceComponentSelectionSource,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import { StudioHybridDccFaceModelingTools } from "./StudioHybridDccFaceModelingTools";
import { useStudioHybridDccFaceModeling } from "./useStudioHybridDccFaceModeling";

import type { StudioHybridDccWorkspaceEdit } from "./studio-hybrid-dcc-face-modeling-workspace";
import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";

const TOP = 3;

/** 한 변을 n칸으로 나눈 닫힌 정육면체(면 6n²개). */
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
  const base = createStudioHybridDccWorkspace("face-modeling-interaction-big");
  const session = hybridDccRegisterAsset(base.session, "cube", mesh, {
    source: "primitive",
    creator: "studio",
    license: "CC0-1.0",
    useScope: "commercial",
    derivative: "original",
  });
  return { ...base, session, activeAssetId: "cube" };
}

function selectionOf(workspace: StudioHybridDccWorkspace, ids: readonly number[]): StudioHybridDccComponentSelection {
  const result = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face",
    operation: "replace",
    ids,
    activeId: ids.at(-1),
    source: workspaceComponentSelectionSource(workspace)!,
  });
  if (!result.ok) throw new Error("selection");
  return result.value;
}

/** 하네스가 시험 본문에 내보내는 조종기: 대기 중인 확정을 끝내거나, 다른 작업(busy)을 켜고 끈다. */
class Controls {
  runs = 0;
  private finisher: () => void = () => undefined;
  private otherBusySetter: (busy: boolean) => void = () => undefined;
  noteRun(finisher: () => void) {
    this.runs += 1;
    this.finisher = finisher;
  }
  bindOtherBusy(setter: (busy: boolean) => void) {
    this.otherBusySetter = setter;
  }
  finish() {
    this.finisher();
  }
  setOtherBusy(busy: boolean) {
    this.otherBusySetter(busy);
  }
}

function Harness({ controls, initial }: { readonly controls: Controls; readonly initial?: StudioHybridDccWorkspace }) {
  const [workspace, setWorkspace] = useState(() => initial ?? workspaceAddUnitCube(createStudioHybridDccWorkspace("face-modeling-interaction"), "cube"));
  const [selection, setSelection] = useState(() => selectionOf(workspace, [initial ? 0 : TOP]));
  const [committing, setCommitting] = useState(false);
  const [otherBusy, setOtherBusy] = useState(false);
  const busy = committing || otherBusy;
  useEffect(() => {
    controls.bindOtherBusy(setOtherBusy);
  }, [controls]);
  const run = (_label: string, edit: StudioHybridDccWorkspaceEdit) => {
    const result = edit(workspace, selection);
    setCommitting(true);
    controls.noteRun(() => {
      act(() => {
        setWorkspace(result.workspace);
        if (result.selection) setSelection(result.selection);
        setCommitting(false);
      });
    });
  };
  const props: StudioHybridDccViewportProps = {
    workspace,
    componentSelection: selection,
    editingDisabled: busy,
    onSelectAsset: () => undefined,
  };
  const model = useStudioHybridDccFaceModeling(props, run);
  return <StudioHybridDccFaceModelingTools model={model} />;
}

function setup(initial?: StudioHybridDccWorkspace) {
  const controls = new Controls();
  render(<Harness controls={controls} initial={initial} />);
  fireEvent.click(screen.getByRole("button", { name: /^면 모델링 · 밀기\/당기기/u }));
  return controls;
}

function distanceField(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "거리 (m)" });
}

afterEach(cleanup);

describe("면 모델링 작업대: 확정이 진행되는 동안", () => {
  it("거리 칸은 읽기 전용이 되고(포커스는 유지) 핸들·도구·적용·취소가 잠기며, 끝나면 풀린다", () => {
    const controls = setup();
    fireEvent.change(distanceField(), { target: { value: "0.3" } });
    const field = distanceField();
    field.focus();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(controls.runs).toBe(1);
    expect(field.readOnly).toBe(true);
    expect(field.disabled).toBe(false);
    expect(document.activeElement).toBe(field);
    // 입력해도 값이 바뀌지 않는다.
    fireEvent.change(field, { target: { value: "0.31" } });
    expect(distanceField().value).toBe("0.3");
    expect(screen.getByRole("slider").getAttribute("aria-disabled")).toBe("true");
    for (const radio of screen.getAllByRole("radio")) expect((radio as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "적용" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "취소" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("적용하는 중");
    // Enter 를 다시 눌러도 같은 요청이 한 번 더 나가지 않는다.
    fireEvent.keyDown(field, { key: "Enter" });
    expect(controls.runs).toBe(1);

    controls.finish();
    expect(distanceField().readOnly).toBe(false);
    expect(distanceField().value).toBe("");
    expect(screen.getByRole("status").textContent).toContain("적용했어요");
  });

  it("면 그리기 패드도 확정 중에는 점을 찍거나 지울 수 없다", () => {
    const controls = setup();
    fireEvent.click(screen.getByRole("radio", { name: "면 그리기" }));
    const surface = document.querySelector<SVGSVGElement>("[data-studio-hybrid-dcc-face-draw-surface]")!;
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    const u = screen.getByLabelText("가로 u (m)");
    const v = screen.getByLabelText("세로 v (m)");
    for (const [x, y] of [["-0.2", "-0.2"], ["0.2", "-0.2"], ["0", "0.2"]]) {
      fireEvent.change(u, { target: { value: x } });
      fireEvent.change(v, { target: { value: y } });
      fireEvent.click(screen.getByRole("button", { name: "점 추가" }));
    }
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(controls.runs).toBe(1);
    expect(screen.getByRole("button", { name: "마지막 점 지우기" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "점 추가" }).closest("fieldset")!.disabled).toBe(true);
    expect(surface.getAttribute("class")).toContain("opacity-50");
    fireEvent.click(surface, { clientX: 50, clientY: 50 });
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("면 모델링 작업대: 다른 작업이 끝나기를 기다리는 동안", () => {
  it("적용 단추를 막고 이유를 알리되, 입력은 계속 고칠 수 있고 끝나면 적용할 수 있다", () => {
    const controls = setup();
    fireEvent.change(distanceField(), { target: { value: "0.3" } });
    const apply = () => screen.getByRole("button", { name: "적용" });
    expect(apply().getAttribute("aria-disabled")).toBeNull();
    act(() => controls.setOtherBusy(true));
    expect(apply().getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("다른 편집이 끝나면 적용할 수 있어요.")).toBeTruthy();
    fireEvent.click(apply());
    fireEvent.keyDown(distanceField(), { key: "Enter" });
    expect(controls.runs).toBe(0);
    // 확정 중이 아니므로 입력은 막히지 않는다.
    expect(distanceField().readOnly).toBe(false);
    fireEvent.change(distanceField(), { target: { value: "0.4" } });
    expect(distanceField().value).toBe("0.4");
    act(() => controls.setOtherBusy(false));
    expect(apply().getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(apply());
    expect(controls.runs).toBe(1);
  });
});

describe("면 모델링 작업대: 면이 많은 오브젝트", () => {
  it("입력을 기다리는 동안 이유를 알리고, Enter 는 먼저 미리보기를 보여 준 뒤 다시 누르면 적용한다", () => {
    const controls = setup(workspaceWithMesh(subdividedCube(12)));
    fireEvent.change(distanceField(), { target: { value: "0.1" } });
    expect(screen.getByText(/입력을 멈추면 미리보기를 계산해요/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "적용" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(distanceField(), { key: "Enter" });
    // 첫 Enter 는 미리보기만 계산한다.
    expect(controls.runs).toBe(0);
    expect(screen.queryByText(/입력을 멈추면 미리보기를 계산해요/u)).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("면 ");
    expect(screen.getByRole("button", { name: "적용" }).getAttribute("aria-disabled")).toBeNull();
    fireEvent.keyDown(distanceField(), { key: "Enter" });
    expect(controls.runs).toBe(1);
  });

  it("면이 8000개를 넘는 오브젝트는 쓸 수 없다고 알리고 거리 칸과 도구를 잠근다", () => {
    setup(workspaceWithMesh(subdividedCube(37)));
    expect(screen.getByRole("status").textContent).toContain("면이 8000개를 넘는 오브젝트는 면 모델링을 쓸 수 없어요");
    expect(distanceField().disabled).toBe(true);
    expect(screen.getByRole("button", { name: "적용" }).getAttribute("aria-disabled")).toBe("true");
  });
});
