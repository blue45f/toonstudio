import { describe, expect, it, vi } from "vitest";

import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { serializeStudioCommandJournal } from "../studio-command-journal";
import {
  createStudioEditableMeshFromPolygons, deserializeStudioEditableMesh, hashStudioEditableMesh,
  serializeStudioEditableMesh, type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";

import {
  createStudioHybridDccComponentSelection, mutateStudioHybridDccComponentSelection,
  validateStudioHybridDccComponentSelection, type StudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import {
  dissolveStudioHybridDccCoplanarEdges, type StudioCoplanarEdgeDissolveResult,
} from "./studio-hybrid-dcc-coplanar-edge-dissolve";
import {
  canCommitStudioHybridDccCoplanarEdgeDissolve, commitStudioHybridDccCoplanarEdgeDissolve,
  prepareStudioHybridDccCoplanarEdgeDissolve, previewStudioHybridDccCoplanarEdgeDissolve,
  StudioCoplanarEdgeDissolveWorkspaceError,
  type StudioHybridDccCoplanarEdgeDissolveCurrent as Current,
  type StudioHybridDccCoplanarEdgeDissolvePlan as Plan,
  type StudioHybridDccCoplanarEdgeDissolvePreparation as Preparation,
} from "./studio-hybrid-dcc-coplanar-edge-dissolve-workspace";
import * as hybridDocument from "./studio-hybrid-dcc-document";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import { workspaceRefreshModifierPreviews } from "./studio-hybrid-dcc-modifier-workspace";
import {
  createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceAddUnitCube,
  workspaceComponentSelectionSource, workspaceRedo, workspaceSelectAsset, workspaceSetAssetVisibility, workspaceUndo,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import {
  decodeStudioHybridDccWorkspacePersistenceEnvelope, encodeStudioHybridDccWorkspacePersistenceEnvelope,
} from "./studio-hybrid-dcc-workspace-persistence";

type Success = Extract<StudioCoplanarEdgeDissolveResult, { readonly ok: true }>;
const SCOPE = { userId: "coplanar-adapter-test", workId: "edge-heal" };
function need<T>(value: T | undefined | null, detail: string): T {
  if (value === undefined || value === null) throw new Error(detail);
  return value;
}
function record(workspace: StudioHybridDccWorkspace, assetId = "cube") {
  return need(workspace.session.state.geometry.records[assetId], "실제 geometry record가 없습니다.");
}
function edgeBetween(mesh: StudioEditableMesh, from: number, to: number): number {
  const edge = need(mesh.halfEdges.find((item) => mesh.halfEdges[item.prev]?.vertex === from && item.vertex === to), "실제 모서리가 없습니다.");
  return edge.twin < 0 ? edge.id : Math.min(edge.id, edge.twin);
}
function selectEdges(workspace: StudioHybridDccWorkspace, ids: readonly number[]): StudioHybridDccComponentSelection {
  const source = need(workspaceComponentSelectionSource(workspace), "선택할 실제 원본이 없습니다.");
  const selected = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "edge", operation: "replace", ids, activeId: ids.at(-1), source,
  });
  if (!selected.ok) throw new Error(selected.diagnostics.map(({ message }) => message).join(" · "));
  return selected.value;
}

/** 실제 factory·document command로 분할 cube를 등록한다. 다른 test 파일의 suite·fixture는 가져오지 않는다. */
function sourceCurrent(): Current {
  const cube = workspaceAddUnitCube(createStudioHybridDccWorkspace("coplanar-adapter"), "cube");
  const original = record(cube).mesh, loops = need(readStudioMeshFaceLoops(original), "cube 루프가 없습니다.");
  const top = need(loops.find((loop) => loop.vertexIds.every((id) => original.vertices[id]?.position.z === 0.5)), "+Z 면이 없습니다.");
  if (top.vertexIds.length !== 4) throw new Error("시험 원본은 실제 사각 cube 면이어야 합니다.");
  const a = need(top.vertexIds[0], "첫 코너가 없습니다."), b = need(top.vertexIds[1], "둘째 코너가 없습니다.");
  const c = need(top.vertexIds[2], "셋째 코너가 없습니다."), d = need(top.vertexIds[3], "넷째 코너가 없습니다.");
  const mesh = createStudioEditableMeshFromPolygons(
    original.vertices.map(({ position }) => ({ ...position, x: position.x + 2 ** -40 })),
    [...loops.map((loop) => loop.id === top.id ? [a, b, c] : loop.vertexIds), [a, c, d]],
  );
  const seam = edgeBetween(mesh, a, c), outside = edgeBetween(mesh, a, b);
  const attributed: StudioEditableMesh = { ...mesh,
    vertices: mesh.vertices.map((vertex) => ({ ...vertex, crease: vertex.id === a ? 0.375 : 0 })),
    halfEdges: mesh.halfEdges.map((edge) => ({ ...edge,
      crease: edge.id === outside ? 0.25 : edge.id === mesh.halfEdges[outside]?.twin ? 0.5 : 0,
    })),
    faces: mesh.faces.map((face) => ({ ...face, smooth: false,
      materialSlot: face.id === top.id || face.id === loops.length ? 7 : face.id + 10,
    })),
  };
  const withUv: StudioEditableMesh = { ...attributed,
    uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(attributed),
      corners: attributed.halfEdges.map((edge) => {
        const vertex = need(attributed.vertices[need(attributed.halfEdges[edge.prev], "UV prev가 없습니다.").vertex], "UV 정점이 없습니다.");
        return { halfEdgeId: edge.id, u: Math.fround(vertex.position.x + 0.5), v: Math.fround(vertex.position.y + 0.5) };
      }) }, attributed),
  };
  const workspace = synchronizeWorkspaceGeometryAuthority(cube, hybridDocument.hybridDccCommitGeometry(cube.session, "cube", withUv));
  return { workspace, selection: selectEdges(workspace, [seam]) };
}

function snapshot(workspace: StudioHybridDccWorkspace) {
  return {
    state: JSON.stringify(workspace.session.state), journal: serializeStudioCommandJournal(workspace.session.journal),
    undo: workspace.session.undoStack, redo: workspace.session.redoStack,
    mesh: serializeStudioEditableMesh(record(workspace).mesh), hash: record(workspace).meshHash,
    persisted: encodeStudioHybridDccWorkspacePersistenceEnvelope({ workspace, scope: SCOPE, savedAt: 1 }).bytes,
  };
}
function expectUnchanged(workspace: StudioHybridDccWorkspace, before: ReturnType<typeof snapshot>): void {
  expect(snapshot(workspace)).toEqual(before);
  expect(workspace.session.undoStack).toBe(before.undo);
  expect(workspace.session.redoStack).toBe(before.redo);
}
function deferred<T>() {
  let resolveValue: ((value: T) => void) | undefined, rejectValue: ((error: Error) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => { resolveValue = resolve; rejectValue = reject; });
  return {
    promise,
    resolve(value: T) { need(resolveValue, "지연 resolve가 없습니다.")(value); },
    reject(error: Error) { need(rejectValue, "지연 reject가 없습니다.")(error); },
  };
}
// 실제 커널을 비동기 producer 포트로 사용한다. 이 테스트는 Worker 실행 증거가 아니다.
const compute: Preparation["compute"] = async (source, request) => dissolveStudioHybridDccCoplanarEdges(source, request);
function harness(producer: Preparation["compute"] = compute) {
  const initial = sourceCurrent(), live = { current: initial, epoch: 1 };
  const controller = new AbortController(), generation = live.epoch;
  const preparation: Preparation = { generation, signal: controller.signal,
    readCurrent: () => live.current, isCurrent: () => live.epoch === generation, compute: producer,
  };
  return { initial, live, controller, preparation,
    prepare: () => prepareStudioHybridDccCoplanarEdgeDissolve(initial, preparation) };
}
async function expectFailure(operation: () => unknown, code: string): Promise<void> {
  try { await operation(); }
  catch (error) {
    expect(error).toBeInstanceOf(StudioCoplanarEdgeDissolveWorkspaceError);
    if (!(error instanceof StudioCoplanarEdgeDissolveWorkspaceError)) throw error;
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`예상한 ${code} 실패가 발생하지 않았습니다.`);
}
function successful(result: StudioCoplanarEdgeDissolveResult): Success {
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  return result;
}
function controls(workspace: StudioHybridDccWorkspace) {
  return { state: JSON.stringify(workspace.session.state), journal: serializeStudioCommandJournal(workspace.session.journal),
    undo: workspace.session.undoStack, redo: workspace.session.redoStack };
}
function alternateSelection(current: Current): StudioHybridDccComponentSelection {
  const mesh = record(current.workspace).mesh;
  const other = need(mesh.halfEdges.find((edge) => (edge.twin < 0 || edge.id < edge.twin)
    && !current.selection.elementIds.includes(edge.id)), "다른 실제 모서리를 찾지 못했습니다.");
  return selectEdges(current.workspace, [other.id]);
}
function reopen(workspace: StudioHybridDccWorkspace): StudioHybridDccWorkspace {
  const encoded = encodeStudioHybridDccWorkspacePersistenceEnvelope({ workspace, scope: SCOPE, savedAt: 7 });
  const decoded = decodeStudioHybridDccWorkspacePersistenceEnvelope({ bytes: encoded.bytes, scope: SCOPE });
  expect(decoded.kind).toBe("workspace");
  expect(decoded.documentStateHash).toBe(workspace.session.state.stateHash);
  return need(decoded.workspace, "실제 persistence codec가 작업공간을 복원하지 못했습니다.");
}

/** Panel의 최종 modifier await·canCommit 조건만 재현한다. 실제 React 발행/브라우저 회귀는 아니다. */
async function publishAfterModifiers(plan: Plan, completion: Promise<StudioHybridDccWorkspace>,
  publish: (workspace: StudioHybridDccWorkspace) => void): Promise<boolean> {
  const next = await completion;
  if (!canCommitStudioHybridDccCoplanarEdgeDissolve(plan)) return false;
  publish(next); return true;
}

describe("공유 모서리 치유의 원본·후보·발행 수명", () => {
  it("실제 edge 선택을 한 명령으로 확정하고 UV·속성·UndoRedo·persistence 재열기까지 보존한다", async () => {
    const h = harness(), before = snapshot(h.initial.workspace), original = record(h.initial.workspace);
    const plan = await h.prepare();
    expect(Object.isFrozen(plan)).toBe(true);
    expect(plan).toMatchObject({ operation: "coplanar-edge-dissolve", assetId: "cube", generation: 1,
      sourceMeshHash: original.meshHash, sourceMeshRevision: original.revision });
    const preview = previewStudioHybridDccCoplanarEdgeDissolve(h.initial, plan), shown = record(preview.workspace);
    expect(shown.mesh.faces).toHaveLength(6);
    expect(shown.meshHash).toBe(plan.resultMeshHash);
    expect(shown.revision).toBe(original.revision);
    expect(hashStudioEditableMesh(shown.modifierStack.source)).toBe(plan.resultMeshHash);
    expect(shown.renderCache).toBeNull();
    expect(preview.workspace.session.state.commandCount).toBe(h.initial.workspace.session.state.commandCount);
    expect(preview.workspace.session.state.stateHash).toBe(h.initial.workspace.session.state.stateHash);
    expect(preview.workspace.session.journal).toBe(h.initial.workspace.session.journal);
    expect(preview.workspace.session.undoStack).toBe(before.undo);
    expect(preview.workspace.session.redoStack).toBe(before.redo);
    expectUnchanged(h.initial.workspace, before);

    const candidate = commitStudioHybridDccCoplanarEdgeDissolve(h.initial, plan), after = record(candidate.workspace);
    expect(canCommitStudioHybridDccCoplanarEdgeDissolve(plan)).toBe(true);
    const settled = await workspaceRefreshModifierPreviews(candidate.workspace);
    expect(settled).toBe(candidate.workspace);
    expect(canCommitStudioHybridDccCoplanarEdgeDissolve(plan)).toBe(true);
    expect(after.revision).toBe(original.revision + 1);
    expect(settled.session.state.commandCount).toBe(h.initial.workspace.session.state.commandCount + 1);
    expect(settled.session.undoStack).toHaveLength(before.undo.length + 1);
    expect(serializeStudioCommandJournal(settled.session.journal)).not.toBe(before.journal);
    expect(settled.bridge.set.objects.find(({ id }) => id === "cube")?.geometryHash).toBe(plan.resultMeshHash);
    expect(after.mesh.vertices.map(({ position, crease }) => ({ position, crease })))
      .toEqual(original.mesh.vertices.map(({ position, crease }) => ({ position, crease })));
    expect(after.mesh.vertices.some(({ position }) => Math.fround(position.x) !== position.x)).toBe(true);
    const selected = need(original.mesh.halfEdges[need(h.initial.selection.elementIds[0], "선택 모서리가 없습니다.")], "선택한 원본 모서리가 없습니다.");
    const drop = Math.max(selected.face, need(original.mesh.halfEdges[selected.twin], "선택한 twin이 없습니다.").face);
    expect(after.mesh.faces.map(({ materialSlot, smooth }) => ({ materialSlot, smooth })))
      .toEqual(original.mesh.faces.filter(({ id }) => id !== drop).map(({ materialSlot, smooth }) => ({ materialSlot, smooth })));
    expect(after.mesh.uvLayer?.corners).toHaveLength(24);
    expect(after.mesh.uvLayer?.topologyHash).toBe(hashStudioMeshUvTopology(after.mesh));
    expect(candidate.selection.mode).toBe("face");
    expect(candidate.selection.elementIds).toEqual([plan.mergedFaceId]);
    expect(validateStudioHybridDccComponentSelection(candidate.selection, need(workspaceComponentSelectionSource(settled), "선택 원본이 없습니다.")).ok).toBe(true);

    const undone = workspaceUndo(settled), redone = workspaceRedo(undone);
    expect(serializeStudioEditableMesh(record(undone).mesh)).toEqual(before.mesh);
    expect(serializeStudioEditableMesh(record(redone).mesh)).toEqual(serializeStudioEditableMesh(after.mesh));
    expect(record(redone).meshHash).toBe(plan.resultMeshHash);
    const restored = reopen(settled);
    expect(serializeStudioEditableMesh(record(restored).mesh)).toEqual(serializeStudioEditableMesh(after.mesh));
    expect(serializeStudioCommandJournal(restored.session.journal)).toBe(serializeStudioCommandJournal(settled.session.journal));
    expect(validateStudioHybridDccComponentSelection(candidate.selection, need(workspaceComponentSelectionSource(restored), "복원 선택 원본이 없습니다.")).ok).toBe(true);
    expect(serializeStudioEditableMesh(record(workspaceUndo(restored)).mesh)).toEqual(before.mesh);
    expect(record(workspaceRedo(workspaceUndo(restored))).meshHash).toBe(plan.resultMeshHash);
    expect(record(reopen(undone)).meshHash).toBe(original.meshHash);
    expect(record(workspaceRedo(reopen(undone))).meshHash).toBe(plan.resultMeshHash);
    expectUnchanged(h.initial.workspace, before);
  });

  it("중복 commit을 거부해도 첫 후보의 modifier 대기·catch용 현재성 guard를 무효화하지 않는다", async () => {
    const h = harness(), before = snapshot(h.initial.workspace), plan = await h.prepare();
    const candidate = commitStudioHybridDccCoplanarEdgeDissolve(h.initial, plan);
    await expectFailure(() => commitStudioHybridDccCoplanarEdgeDissolve(h.initial, plan), "plan-already-attempted");
    await expectFailure(() => previewStudioHybridDccCoplanarEdgeDissolve(h.initial, plan), "plan-already-attempted");
    expect(canCommitStudioHybridDccCoplanarEdgeDissolve(plan)).toBe(true);
    const completion = deferred<StudioHybridDccWorkspace>(), publish = vi.fn();
    const pending = publishAfterModifiers(plan, completion.promise, publish);
    expect(canCommitStudioHybridDccCoplanarEdgeDissolve(plan)).toBe(true);
    completion.resolve(await workspaceRefreshModifierPreviews(candidate.workspace));
    expect(await pending).toBe(true);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(candidate.workspace);
    h.live.current = { workspace: candidate.workspace, selection: candidate.selection };
    expect(canCommitStudioHybridDccCoplanarEdgeDissolve(plan)).toBe(false);
    expectUnchanged(h.initial.workspace, before);
  });

  it("준비 전 취소는 producer 호출 없이 원본·이력을 보존한다", async () => {
    const producer = vi.fn(compute), h = harness(producer), before = snapshot(h.initial.workspace);
    h.controller.abort();
    await expectFailure(() => h.prepare(), "aborted");
    expect(producer).not.toHaveBeenCalled(); expectUnchanged(h.initial.workspace, before);
  });

  it("실제 edge 선택이 없는 준비는 계산 포트를 호출하지 않는다", async () => {
    const h = harness(), producer = vi.fn(compute), before = snapshot(h.initial.workspace);
    const current: Current = { ...h.initial, selection: createStudioHybridDccComponentSelection() };
    await expectFailure(() => prepareStudioHybridDccCoplanarEdgeDissolve(current, {
      ...h.preparation, readCurrent: () => current, compute: producer,
    }), "invalid-selection");
    expect(producer).not.toHaveBeenCalled(); expectUnchanged(h.initial.workspace, before);
  });

  it("실제 커널의 비공면 거부를 원래 typed code로 전달하고 문서를 유지한다", async () => {
    const h = harness(), before = snapshot(h.initial.workspace);
    const current: Current = { ...h.initial, selection: alternateSelection(h.initial) };
    await expectFailure(() => prepareStudioHybridDccCoplanarEdgeDissolve(current, {
      ...h.preparation, readCurrent: () => current,
    }), "non-coplanar");
    expectUnchanged(h.initial.workspace, before);
  });

  it("계산이 실제 결과를 늦게 반환해도 await 뒤 취소를 성공 계획으로 바꾸지 않는다", async () => {
    const started = deferred<void>(), release = deferred<void>();
    const producer: Preparation["compute"] = async (source, request) => {
      started.resolve(undefined); await release.promise;
      return dissolveStudioHybridDccCoplanarEdges(source, request);
    };
    const h = harness(producer), before = snapshot(h.initial.workspace), pending = h.prepare();
    await started.promise; h.controller.abort(); release.resolve(undefined);
    await expectFailure(() => pending, "aborted"); expectUnchanged(h.initial.workspace, before);
  });

  it("후보 생성 뒤 modifier await 중 취소되면 실제 결과 후보를 발행하지 않는다", async () => {
    const h = harness(), before = snapshot(h.initial.workspace), plan = await h.prepare();
    const candidate = commitStudioHybridDccCoplanarEdgeDissolve(h.initial, plan);
    const completion = deferred<StudioHybridDccWorkspace>(), publish = vi.fn();
    const pending = publishAfterModifiers(plan, completion.promise, publish);
    h.controller.abort(); completion.resolve(candidate.workspace);
    expect(await pending).toBe(false); expect(publish).not.toHaveBeenCalled();
    expect(canCommitStudioHybridDccCoplanarEdgeDissolve(plan)).toBe(false);
    expectUnchanged(h.initial.workspace, before);
  });

  it("실제 visibility setter의 same-session bridge 변경도 원본과 후보 양쪽 수명에서 거부한다", async () => {
    const h = harness(), plan = await h.prepare();
    const candidate = commitStudioHybridDccCoplanarEdgeDissolve(h.initial, plan);
    const completion = deferred<StudioHybridDccWorkspace>(), publish = vi.fn();
    const pending = publishAfterModifiers(plan, completion.promise, publish);
    const changed = workspaceSetAssetVisibility(h.initial.workspace, "cube", false);
    expect(changed.session).toBe(h.initial.workspace.session);
    expect(changed.bridge).not.toBe(h.initial.workspace.bridge);
    h.live.current = { workspace: changed, selection: h.initial.selection };
    expect(canCommitStudioHybridDccCoplanarEdgeDissolve(plan)).toBe(false);
    completion.resolve(candidate.workspace);
    expect(await pending).toBe(false); expect(publish).not.toHaveBeenCalled();
    expect(changed.bridge.set.objects.find(({ id }) => id === "cube")?.visible).toBe(false);
    const fresh = harness(), freshPlan = await fresh.prepare();
    const bridged: Current = { workspace: workspaceSetAssetVisibility(fresh.initial.workspace, "cube", false), selection: fresh.initial.selection };
    await expectFailure(() => previewStudioHybridDccCoplanarEdgeDissolve(bridged, freshPlan), "stale-context");
    expect(canCommitStudioHybridDccCoplanarEdgeDissolve(freshPlan)).toBe(true);
    fresh.live.current = bridged;
    await expectFailure(() => commitStudioHybridDccCoplanarEdgeDissolve(fresh.initial, freshPlan), "stale-context");
    expect(canCommitStudioHybridDccCoplanarEdgeDissolve(freshPlan)).toBe(false);
  });

  it.each(["session", "selection-pointer", "selection-content", "asset", "mesh-pointer", "revision", "hash", "mesh-content"])(
    "compute await 중 %s 변경을 현재 결과로 오인하지 않는다", async (kind) => {
      const started = deferred<void>(), release = deferred<void>();
      const producer: Preparation["compute"] = async (source, request) => {
        started.resolve(undefined); await release.promise; return dissolveStudioHybridDccCoplanarEdges(source, request);
      };
      const h = harness(producer), pending = h.prepare();
      await started.promise;
      const original = h.initial.workspace, currentRecord = record(original);
      if (kind === "session") h.live.current = { ...h.initial, workspace: { ...original, session: { ...original.session } } };
      else if (kind === "selection-pointer") h.live.current = { ...h.initial, selection: { ...h.initial.selection } };
      else if (kind === "selection-content") h.live.current = { ...h.initial, selection: alternateSelection(h.initial) };
      else if (kind === "asset") h.live.current = { ...h.initial, workspace: workspaceSelectAsset(original, null) };
      else if (kind === "mesh-pointer") expect(Reflect.set(currentRecord, "mesh", deserializeStudioEditableMesh(serializeStudioEditableMesh(currentRecord.mesh)))).toBe(true);
      else if (kind === "revision") expect(Reflect.set(currentRecord, "revision", currentRecord.revision + 1)).toBe(true);
      else if (kind === "hash") expect(Reflect.set(currentRecord, "meshHash", `mesh:sha256:${"0".repeat(64)}`)).toBe(true);
      else {
        const position = need(currentRecord.mesh.vertices[0], "변경할 원본 정점이 없습니다.").position;
        expect(Reflect.set(position, "x", position.x + 0.125)).toBe(true);
      }
      // 테스트가 의도적으로 만든 외부 변경 이후, adapter가 추가 문서 변경을 하지 않는지 검사한다.
      const afterExternalChange = controls(original);
      release.resolve(undefined); await expectFailure(() => pending, "stale-context");
      expect(controls(original)).toEqual(afterExternalChange);
      expect(original.session.undoStack).toBe(afterExternalChange.undo);
      expect(original.session.redoStack).toBe(afterExternalChange.redo);
    });

  it.each(["selection", "undo-redo"])("%s A→B→A도 caller epoch가 바뀌면 원래 plan으로 돌아가지 않는다", async (kind) => {
    const h = harness(), before = snapshot(h.initial.workspace), plan = await h.prepare();
    if (kind === "selection") h.live.current = { ...h.initial, selection: alternateSelection(h.initial) };
    else {
      const undone = workspaceUndo(h.initial.workspace), redone = workspaceRedo(undone);
      expect(record(redone).meshHash).toBe(record(h.initial.workspace).meshHash);
      h.live.current = { workspace: redone, selection: h.initial.selection };
    }
    h.live.epoch += 1; h.live.current = h.initial;
    expect(canCommitStudioHybridDccCoplanarEdgeDissolve(plan)).toBe(false);
    await expectFailure(() => previewStudioHybridDccCoplanarEdgeDissolve(h.initial, plan), "stale-context");
    await expectFailure(() => commitStudioHybridDccCoplanarEdgeDissolve(h.initial, plan), "stale-context");
    expectUnchanged(h.initial.workspace, before);
  });

  it("예전 compute가 pending이어도 새 세대가 확정한 뒤 늦은 결과는 새 문서를 덮지 못한다", async () => {
    const started = deferred<void>(), oldCompletion = deferred<StudioCoplanarEdgeDissolveResult>();
    let oldOutput: StudioCoplanarEdgeDissolveResult | undefined;
    const oldProducer: Preparation["compute"] = async (source, request) => {
      oldOutput = dissolveStudioHybridDccCoplanarEdges(source, request);
      started.resolve(undefined); return oldCompletion.promise;
    };
    const h = harness(oldProducer), before = snapshot(h.initial.workspace), oldPublish = vi.fn();
    const oldRequest = h.prepare().then((plan) => {
      const candidate = commitStudioHybridDccCoplanarEdgeDissolve(h.live.current, plan);
      h.live.current = { workspace: candidate.workspace, selection: candidate.selection };
      oldPublish(candidate.workspace);
    });
    await started.promise;
    expect(need(oldOutput, "예전 실제 계산 결과가 없습니다.").ok).toBe(true);
    const generation = ++h.live.epoch;
    const newPlan = await prepareStudioHybridDccCoplanarEdgeDissolve(h.initial, {
      ...h.preparation, generation, isCurrent: () => h.live.epoch === generation, compute,
    });
    const candidate = commitStudioHybridDccCoplanarEdgeDissolve(h.initial, newPlan);
    const published: Current = { workspace: await workspaceRefreshModifierPreviews(candidate.workspace), selection: candidate.selection };
    h.live.current = published;
    const afterNewPublication = snapshot(published.workspace);
    oldCompletion.resolve(need(oldOutput, "예전 실제 계산 결과가 없습니다."));
    await expectFailure(() => oldRequest, "stale-context");
    expect(oldPublish).not.toHaveBeenCalled();
    expect(h.live.current).toBe(published);
    expect(record(published.workspace).meshHash).toBe(newPlan.resultMeshHash);
    expectUnchanged(published.workspace, afterNewPublication);
    expectUnchanged(h.initial.workspace, before);
  });

  it("producer의 원본·결과 포인터와 preview를 변경해도 비공개 확정 snapshot은 유지된다", async () => {
    let producerMesh: StudioEditableMesh | undefined, output: Success | undefined;
    const producer: Preparation["compute"] = async (source, request, options) => {
      producerMesh = source.mesh;
      expect(options).toMatchObject({ assetId: "cube", generation: 1 });
      output = successful(dissolveStudioHybridDccCoplanarEdges(source, request));
      return output;
    };
    const h = harness(producer), before = snapshot(h.initial.workspace), plan = await h.prepare();
    expect(producerMesh).not.toBe(record(h.initial.workspace).mesh);
    const computed = need(output, "실제 producer 결과가 없습니다."), computedPosition = need(computed.mesh.vertices[0], "계산 정점이 없습니다.").position;
    expect(Reflect.set(computedPosition, "x", computedPosition.x + 9)).toBe(true);
    const computedUv = need(computed.mesh.uvLayer?.corners[0], "계산 UV가 없습니다.");
    expect(Reflect.set(computedUv, "u", computedUv.u + 9)).toBe(true);
    const preview = previewStudioHybridDccCoplanarEdgeDissolve(h.initial, plan), previewMesh = record(preview.workspace).mesh;
    const expected = serializeStudioEditableMesh(previewMesh);
    const previewPosition = need(previewMesh.vertices[0], "표시 정점이 없습니다.").position;
    expect(Reflect.set(previewPosition, "y", previewPosition.y + 7)).toBe(true);
    expect(Reflect.set(need(previewMesh.faces[0], "표시 면이 없습니다."), "materialSlot", 999)).toBe(true);
    const candidate = commitStudioHybridDccCoplanarEdgeDissolve(h.initial, plan);
    expect(serializeStudioEditableMesh(record(candidate.workspace).mesh)).toEqual(expected);
    expect(record(candidate.workspace).meshHash).toBe(plan.resultMeshHash);
    expectUnchanged(h.initial.workspace, before);
  });

  it("계획의 shallow copy와 구조가 같은 forged DTO는 원본 계획의 권위를 복제하지 못한다", async () => {
    const h = harness(), before = snapshot(h.initial.workspace), plan = await h.prepare();
    const copied = { ...plan }, forged: Plan = { operation: "coplanar-edge-dissolve", assetId: plan.assetId,
      generation: plan.generation, sourceMeshHash: plan.sourceMeshHash, sourceMeshRevision: plan.sourceMeshRevision,
      resultMeshHash: plan.resultMeshHash, mergedFaceId: plan.mergedFaceId };
    for (const untrusted of [copied, forged]) {
      expect(canCommitStudioHybridDccCoplanarEdgeDissolve(untrusted)).toBe(false);
      await expectFailure(() => previewStudioHybridDccCoplanarEdgeDissolve(h.initial, untrusted), "invalid-plan");
      await expectFailure(() => commitStudioHybridDccCoplanarEdgeDissolve(h.initial, untrusted), "invalid-plan");
    }
    expect(canCommitStudioHybridDccCoplanarEdgeDissolve(plan)).toBe(true);
    expect(record(commitStudioHybridDccCoplanarEdgeDissolve(h.initial, plan).workspace).meshHash).toBe(plan.resultMeshHash);
    expectUnchanged(h.initial.workspace, before);
  });

  it("제공 current 불일치는 첫 attempt를 소모해도 실제 현재 요청의 catch 안내 guard를 유지한다", async () => {
    const h = harness(), before = snapshot(h.initial.workspace), plan = await h.prepare();
    const wrong: Current = { ...h.initial, workspace: { ...h.initial.workspace, session: { ...h.initial.workspace.session } } };
    await expectFailure(() => commitStudioHybridDccCoplanarEdgeDissolve(wrong, plan), "stale-context");
    expect(canCommitStudioHybridDccCoplanarEdgeDissolve(plan)).toBe(true);
    await expectFailure(() => commitStudioHybridDccCoplanarEdgeDissolve(h.initial, plan), "plan-already-attempted");
    expectUnchanged(h.initial.workspace, before);
  });

  it("실제 geometry.commit 예외는 journal·history를 바꾸지 않고 실패 plan 재사용을 막는다", async () => {
    const h = harness(), before = snapshot(h.initial.workspace), plan = await h.prepare();
    const error = new Error("정본 geometry.commit 실패");
    const commit = vi.spyOn(hybridDocument, "hybridDccCommitGeometry").mockImplementationOnce(() => { throw error; });
    try {
      await expectFailure(() => commitStudioHybridDccCoplanarEdgeDissolve(h.initial, plan), "invalid-result");
      expect(commit).toHaveBeenCalledTimes(1);
      const call = need(commit.mock.calls[0], "실제 document commit 호출이 없습니다.");
      expect(call[0]).toBe(h.initial.workspace.session);
      expect(call[1]).toBe("cube");
      expect(hashStudioEditableMesh(call[2])).toBe(plan.resultMeshHash);
      expect(canCommitStudioHybridDccCoplanarEdgeDissolve(plan)).toBe(true);
      await expectFailure(() => commitStudioHybridDccCoplanarEdgeDissolve(h.initial, plan), "plan-already-attempted");
      expect(commit).toHaveBeenCalledTimes(1);
      expectUnchanged(h.initial.workspace, before);
    } finally { commit.mockRestore(); }
  });

  it("modifier 실패 뒤 현재 요청의 catch 안내는 허용하지만 같은 plan으로 후보를 다시 만들지 않는다", async () => {
    const h = harness(), before = snapshot(h.initial.workspace), plan = await h.prepare();
    commitStudioHybridDccCoplanarEdgeDissolve(h.initial, plan);
    const completion = deferred<StudioHybridDccWorkspace>(), publish = vi.fn(), error = new Error("모디파이어 계산 실패");
    const pending = publishAfterModifiers(plan, completion.promise, publish);
    completion.reject(error);
    await expect(pending).rejects.toBe(error);
    expect(publish).not.toHaveBeenCalled(); expect(canCommitStudioHybridDccCoplanarEdgeDissolve(plan)).toBe(true);
    await expectFailure(() => commitStudioHybridDccCoplanarEdgeDissolve(h.initial, plan), "plan-already-attempted");
    expectUnchanged(h.initial.workspace, before);
  });

  it("producer가 독립 계산 원본을 바꾸고 실패해도 실제 geometry와 새 요청 재시도를 보존한다", async () => {
    const producer: Preparation["compute"] = async (source) => {
      const p = need(source.mesh.vertices[0], "producer 원본이 없습니다.").position;
      expect(Reflect.set(p, "x", p.x + 99)).toBe(true);
      throw new Error("계산 포트 실패");
    };
    const h = harness(producer), before = snapshot(h.initial.workspace);
    await expectFailure(() => h.prepare(), "invalid-result");
    expectUnchanged(h.initial.workspace, before);
    const next = await prepareStudioHybridDccCoplanarEdgeDissolve(h.initial, { ...h.preparation, generation: 2, compute });
    expect(next.generation).toBe(2); expect(canCommitStudioHybridDccCoplanarEdgeDissolve(next)).toBe(true);
  });

  it.each(["hash", "vertices", "removed", "remap", "uv"])("producer의 잘못된 %s 결과를 private plan으로 발급하지 않는다", async (kind) => {
    const producer: Preparation["compute"] = async (source, request) => {
      const result = successful(dissolveStudioHybridDccCoplanarEdges(source, request));
      if (kind === "hash") return { ...result, resultMeshHash: source.meshHash };
      if (kind === "vertices") return { ...result, vertexRemap: result.vertexRemap.slice(1) };
      if (kind === "removed") return { ...result, removedHalfEdgeIds: [] };
      if (kind === "remap") return { ...result, halfEdgeRemap: result.halfEdgeRemap.slice(1) };
      const layer = need(result.mesh.uvLayer, "생성 결과의 UV가 없습니다.");
      const mesh: StudioEditableMesh = { ...result.mesh, uvLayer: { ...layer,
        corners: layer.corners.map((corner, index) => index === 0 ? { ...corner, u: corner.u + 1 } : corner),
      } };
      return { ...result, mesh, resultMeshHash: hashStudioEditableMesh(mesh) };
    };
    const h = harness(producer), before = snapshot(h.initial.workspace);
    await expectFailure(() => h.prepare(), "invalid-result"); expectUnchanged(h.initial.workspace, before);
  });
});
