// @vitest-environment jsdom
/** 실제 Tools·hook·endpoint·커널·문서 명령의 미실행 UI 회귀. DOM 토큰 검사는 실제 픽셀 측정과 다르다. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { Matrix4, OrthographicCamera, Vector2, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18nDict, useI18n } from "@/shared/lib/i18n";
import { serializeStudioCommandJournal } from "../studio-command-journal";
import { hashStudioEditableMesh, serializeStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import {
  StudioHybridDccBoundaryChordTools, type StudioBoundaryChordPickingMode,
} from "./StudioHybridDccBoundaryChordTools";
import {
  createStudioHybridDccComponentSelection, mapStudioHybridDccRayFaceIndex, mutateStudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import { splitStudioEditableFaceBoundaryChordWithUv, type StudioBoundaryChordUvResult } from "./studio-hybrid-dcc-boundary-chord-uv";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import {
  createStudioHybridDccWorkspace, workspaceAddUnitCube, workspaceComponentSelectionSource, workspaceUndo,
} from "./studio-hybrid-dcc-workspace";
import { useStudioHybridDccBoundaryChord, type StudioBoundaryChordHookInput } from "./useStudioHybridDccBoundaryChord";
import type { StudioBoundaryChordWorkerInput } from "./studio-hybrid-dcc-boundary-chord-worker-protocol";

afterEach(cleanup);
function need<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("실제 UI 회귀 fixture의 값이 없습니다."); return value;
}
function actualCompute(input: StudioBoundaryChordWorkerInput): StudioBoundaryChordUvResult {
  return splitStudioEditableFaceBoundaryChordWithUv({ mesh: input.mesh, meshHash: input.meshHash, meshRevision: input.meshRevision }, input.request);
}
const compute: NonNullable<StudioBoundaryChordHookInput["compute"]> = async (input) => actualCompute(input);
function deferred<T>() {
  let complete: ((result: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => { complete = resolve; });
  return { promise, resolve(result: T) { if (complete === null) throw new Error("대기 계산이 준비되지 않았습니다."); complete(result); } };
}
function setup(options: { readonly compute?: StudioBoundaryChordHookInput["compute"]; readonly readOnly?: boolean } = {}) {
  const original = workspaceAddUnitCube(createStudioHybridDccWorkspace("boundary-chord-tools"), "cube");
  const source = need(workspaceComponentSelectionSource(original)), loops = need(readStudioMeshFaceLoops(source.mesh));
  const face = need(loops.find((loop) => loop.vertexIds.every((id) => need(source.mesh.vertices[id]).position.z === 0.5)));
  const selected = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face", operation: "replace", ids: [face.id], activeId: face.id, source,
  });
  if (!selected.ok) throw new Error("실제 한 면 선택을 만들지 못했습니다.");
  const initialSelection = selected.value, inspected = inspectStudioMeshSurfaceForInteractiveProjection(source.mesh);
  if (!inspected.ok) throw new Error(inspected.message);
  const faceIndex = inspected.value.plan.triangles.findIndex((triangle) => triangle.faceId === face.id);
  const hitResult = mapStudioHybridDccRayFaceIndex(source, faceIndex);
  if (!hitResult.ok) throw new Error("실제 surface faceIndex가 없습니다.");
  const hit = hitResult.value, camera = new OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 10);
  camera.position.set(0, 0, 3); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const projection = (edgeIndex: number, t: number) => {
    const edge = need(source.mesh.halfEdges[need(face.halfEdgeIds[edgeIndex])]);
    const a = need(source.mesh.vertices[need(source.mesh.halfEdges[edge.prev]).vertex]).position, b = need(source.mesh.vertices[edge.vertex]).position;
    const point = new Vector3(a.x, a.y, a.z).lerp(new Vector3(b.x, b.y, b.z), t).project(camera);
    return { camera, matrixWorld: new Matrix4(), pointerNdc: new Vector2(point.x, point.y), viewportSize: { width: 600, height: 600 } };
  };
  const published = vi.fn<(label: string) => void>(), observed = { workspace: original, selection: initialSelection };
  function Harness() {
    const [workspace, setWorkspace] = useState(original), [selection, setSelection] = useState(initialSelection);
    const [mode, setMode] = useState<StudioBoundaryChordPickingMode>(null), [busy, setBusy] = useState(false);
    const run: NonNullable<StudioBoundaryChordHookInput["run"]> = (label, edit, canCommit) => {
      if (!canCommit) throw new Error("host publication 검증 함수가 없습니다.");
      setBusy(true);
      try {
        const result = edit(workspace, selection);
        // 실제 host와 같이 계산 뒤 publication 직전의 최신 fence를 다시 읽는다.
        queueMicrotask(() => {
          if (canCommit()) {
            setWorkspace(result.workspace);
            if (result.selection) setSelection(result.selection);
            setMode(null); published(label);
          }
          setBusy(false);
        });
      } catch (cause) { setBusy(false); throw cause; }
    };
    const model = useStudioHybridDccBoundaryChord({ workspace, selection, enabled: !options.readOnly, disabled: busy,
      run: options.readOnly ? undefined : run, compute: options.compute ?? compute });
    useEffect(() => { observed.workspace = workspace; observed.selection = selection; }, [workspace, selection]);
    const pointLocked = mode === null || busy || model.pending || model.applying || Boolean(model.preview);
    return <>
      <StudioHybridDccBoundaryChordTools model={model} mode={mode} busy={busy}
        unavailable={options.readOnly ? "이 화면은 읽기 전용입니다." : null}
        onModeChange={setMode} onCancel={() => { model.cancel(); setMode(null); }}
        onRestart={() => { model.clear(); setMode(mode ?? "edge"); }} />
      <button type="button" disabled={pointLocked} onClick={() => { if (mode) model.pickEndpoint(hit, mode, projection(0, 0.25)); }}>시작 경계점 선택</button>
      <button type="button" disabled={pointLocked} onClick={() => { if (mode) model.pickEndpoint(hit, mode, projection(2, 0.75)); }}>반대 경계점 선택</button>
      <div data-testid="source-hash">{need(workspaceComponentSelectionSource(workspace)).sourceHash}</div>
      <div data-testid="preview-hash">{model.preview ? need(workspaceComponentSelectionSource(model.preview.workspace)).sourceHash : "없음"}</div>
    </>;
  }
  render(<Harness />);
  return { original, source, observed, published };
}
const button = (name: string) => screen.getByRole("button", { name });
function start() { fireEvent.click(button("모서리에서 선택")); fireEvent.click(button("시작 경계점 선택")); }
function both() { start(); fireEvent.click(button("반대 경계점 선택")); }

describe("경계선 면 나누기 전용 도구와 실제 hook", () => {
  it("명명된 영역·안내 연결·polite 상태와 44px/focus 토큰, 실제 선택 모드를 제공한다", () => {
    const f = setup(), section = screen.getByRole("region", { name: "경계선으로 면 나누기" });
    const titleId = need(section.getAttribute("aria-labelledby")), helpId = need(section.getAttribute("aria-describedby"));
    expect(document.getElementById(titleId)?.textContent).toBe("경계선으로 면 나누기");
    expect(document.getElementById(helpId)?.textContent).toContain("경계 두 곳");
    expect(section.getAttribute("aria-busy")).toBe("false");
    const status = within(section).getByRole("status"); expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("한 면을 선택");
    for (const control of within(section).getAllByRole("button")) {
      expect(control.classList.contains("min-h-11")).toBe(true); expect(control.classList.contains("min-w-11")).toBe(true);
      expect(control.classList.contains("focus-visible:outline-2")).toBe(true);
    }
    expect(button("면 나누기 적용")).toHaveProperty("disabled", true);
    fireEvent.click(button("모서리에서 선택")); expect(button("모서리에서 선택").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button("꼭짓점에서 선택")); expect(button("꼭짓점에서 선택").getAttribute("aria-pressed")).toBe("true");
    expect(button("모서리에서 선택").getAttribute("aria-pressed")).toBe("false");
    expect(f.observed.workspace).toBe(f.original); expect(f.published).not.toHaveBeenCalled();
  });

  it("두 실제 경계점의 preview는 원본을 보존하고 Apply 뒤 host가 발행한 단일 명령만 완료로 표시한다", async () => {
    const f = setup(), original = serializeStudioEditableMesh(f.source.mesh), journal = serializeStudioCommandJournal(f.original.session.journal);
    start(); expect(screen.getByText("선택한 경계점 1/2")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("시작점을 선택");
    expect(button("면 나누기 적용")).toHaveProperty("disabled", true); fireEvent.click(button("반대 경계점 선택"));
    await waitFor(() => expect(button("면 나누기 적용")).toHaveProperty("disabled", false));
    const resultHash = need(screen.getByTestId("preview-hash").textContent);
    expect(resultHash).not.toBe("없음"); expect(resultHash).not.toBe(f.source.sourceHash);
    expect(screen.getByRole("status").textContent).toBe(i18nDict[useI18n.getState().lang]?.["studio.bg3dScene.boundaryChord.status.ready"]);
    expect(f.observed.workspace).toBe(f.original); expect(f.published).not.toHaveBeenCalled();
    expect(serializeStudioEditableMesh(f.source.mesh)).toEqual(original);
    expect(serializeStudioCommandJournal(f.original.session.journal)).toBe(journal);
    fireEvent.click(button("면 나누기 적용"));
    await waitFor(() => expect(f.published).toHaveBeenCalledExactlyOnceWith("경계선으로 면 나누기"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(i18nDict[useI18n.getState().lang]?.["studio.bg3dScene.boundaryChord.notice.applied"]));
    expect(need(workspaceComponentSelectionSource(f.observed.workspace)).sourceHash).toBe(resultHash);
    expect(f.observed.workspace.session.state.commandCount).toBe(f.original.session.state.commandCount + 1);
    expect(f.observed.workspace.session.undoStack).toHaveLength(f.original.session.undoStack.length + 1);
    expect(f.observed.selection.elementIds).toHaveLength(2); expect(button("면 나누기 적용")).toHaveProperty("disabled", true);
    expect(need(workspaceComponentSelectionSource(workspaceUndo(f.observed.workspace))).sourceHash).toBe(f.source.sourceHash);
    expect(serializeStudioEditableMesh(f.source.mesh)).toEqual(original);
  });

  it("pending 중 취소·다시 선택은 원래 signal을 abort하고 늦은 실제 결과를 게시하지 않는다", async () => {
    const calls: { readonly input: StudioBoundaryChordWorkerInput; readonly signal: AbortSignal | undefined;
      readonly output: ReturnType<typeof deferred<StudioBoundaryChordUvResult>> }[] = [];
    const delayed: NonNullable<StudioBoundaryChordHookInput["compute"]> = (input, options) => {
      const output = deferred<StudioBoundaryChordUvResult>(); calls.push({ input, signal: options.signal, output }); return output.promise;
    };
    const f = setup({ compute: delayed }); both(); expect(calls).toHaveLength(1);
    expect(screen.getByRole("region", { name: "경계선으로 면 나누기" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("계산하는 중"); expect(button("면 나누기 적용")).toHaveProperty("disabled", true);
    expect(button("모서리에서 선택")).toHaveProperty("disabled", true); expect(button("경계선 취소")).toHaveProperty("disabled", false);
    expect(button("경계점 다시 선택")).toHaveProperty("disabled", false);
    fireEvent.click(button("경계선 취소")); const first = need(calls[0]); expect(first.signal?.aborted).toBe(true);
    await act(async () => { first.output.resolve(actualCompute(first.input)); });
    expect(screen.getByTestId("preview-hash").textContent).toBe("없음"); expect(f.published).not.toHaveBeenCalled();
    both(); expect(calls).toHaveLength(2); const second = need(calls[1]);
    fireEvent.click(button("경계점 다시 선택")); expect(second.signal?.aborted).toBe(true);
    expect(screen.getByText("선택한 경계점 0/2")).toBeTruthy(); expect(button("모서리에서 선택").getAttribute("aria-pressed")).toBe("true");
    await act(async () => { second.output.resolve(actualCompute(second.input)); });
    expect(screen.getByTestId("preview-hash").textContent).toBe("없음");
    fireEvent.click(button("시작 경계점 선택")); fireEvent.click(button("반대 경계점 선택"));
    expect(calls).toHaveLength(3); const third = need(calls[2]);
    await act(async () => { third.output.resolve(actualCompute(third.input)); });
    await waitFor(() => expect(button("면 나누기 적용")).toHaveProperty("disabled", false));
    expect(f.observed.workspace).toBe(f.original); expect(f.published).not.toHaveBeenCalled();
  });

  it("동일 endpoint의 실제 커널 오류를 alert로 보이고 원래 시작점에서 다른 경계로 재시도한다", async () => {
    const outcomes: StudioBoundaryChordUvResult[] = [];
    const capture: NonNullable<StudioBoundaryChordHookInput["compute"]> = async (input) => {
      const result = actualCompute(input); outcomes.push(result); return result;
    };
    const f = setup({ compute: capture }), originalJournal = serializeStudioCommandJournal(f.original.session.journal);
    start(); fireEvent.click(button("시작 경계점 선택"));
    await waitFor(() => expect(screen.getByRole("alert").textContent?.length).toBeGreaterThan(0));
    const refused = need(outcomes[0]); if (refused.ok) throw new Error("실제 degenerate chord가 성공했습니다.");
    expect(refused.code).toBe("degenerate-chord");
    const expectedError = i18nDict[useI18n.getState().lang]?.["studio.bg3dScene.boundaryChord.errors.degenerateChord"];
    expect(expectedError).toEqual(expect.any(String)); expect(screen.getByRole("alert").textContent).toBe(expectedError);
    expect(button("면 나누기 적용")).toHaveProperty("disabled", true); expect(screen.getByText("선택한 경계점 1/2")).toBeTruthy();
    expect(f.observed.workspace).toBe(f.original); expect(f.published).not.toHaveBeenCalled();
    expect(serializeStudioCommandJournal(f.original.session.journal)).toBe(originalJournal);
    fireEvent.click(button("반대 경계점 선택"));
    await waitFor(() => expect(button("면 나누기 적용")).toHaveProperty("disabled", false));
    expect(screen.queryByRole("alert")).toBeNull(); expect(outcomes).toHaveLength(2); expect(need(outcomes[1]).ok).toBe(true);
    fireEvent.click(button("면 나누기 적용")); await waitFor(() => expect(f.published).toHaveBeenCalledTimes(1));
    expect(hashStudioEditableMesh(need(workspaceComponentSelectionSource(f.observed.workspace)).mesh)).not.toBe(f.source.sourceHash);
  });

  it("읽기 전용 사유가 있으면 실제 계산·host 호출 없이 모드와 적용 버튼을 잠근다", () => {
    const computeSpy = vi.fn(compute), f = setup({ readOnly: true, compute: computeSpy });
    expect(screen.getByText("이 화면은 읽기 전용입니다.")).toBeTruthy();
    for (const name of ["모서리에서 선택", "꼭짓점에서 선택", "면 나누기 적용"]) expect(button(name)).toHaveProperty("disabled", true);
    fireEvent.click(button("모서리에서 선택")); fireEvent.click(button("시작 경계점 선택")); fireEvent.click(button("면 나누기 적용"));
    expect(computeSpy).not.toHaveBeenCalled(); expect(f.published).not.toHaveBeenCalled(); expect(f.observed.workspace).toBe(f.original);
    expect(screen.queryByRole("alert")).toBeNull(); expect(screen.getByTestId("preview-hash").textContent).toBe("없음");
  });
});
