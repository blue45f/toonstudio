// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { serializeStudioCommandJournal } from "../studio-command-journal";
import { createStudioEditableMeshFromPolygons, serializeStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { buildStudioXAtlasUvArtifact } from "../xatlas-uv/studio-xatlas-uv-provider-output";
import { STUDIO_XATLAS_UV_PROVIDER_LIMITS } from "../xatlas-uv/studio-xatlas-uv-provider";

import { createStudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import { prepareStudioHybridDccUvAtlas } from "./studio-hybrid-dcc-uv-atlas-workspace";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceUndo } from "./studio-hybrid-dcc-workspace";
import { useStudioHybridDccUvAtlas } from "./useStudioHybridDccUvAtlas";

import type { StudioXAtlasUvExecution, StudioXAtlasUvResult } from "../xatlas-uv/studio-xatlas-uv-provider";
import type { StudioXAtlasUvWorkerClient, StudioXAtlasUvWorkerClientOptions } from "../xatlas-uv/studio-xatlas-uv-provider-worker-client";
import type { StudioHybridDccWorkspaceEdit } from "./studio-hybrid-dcc-face-modeling-workspace";
import type { StudioHybridDccUvAtlasRun } from "./studio-hybrid-dcc-uv-atlas-host";
import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

const auth = vi.hoisted(() => ({ actor: "uv-owner", revision: 0, listeners: new Set<() => void>() }));
const workerFactory = vi.hoisted(() => ({ create: vi.fn<(options: StudioXAtlasUvWorkerClientOptions) => ControlledClient>() }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => auth.actor,
  getAuthSessionRevision: () => auth.revision,
  listeners: auth.listeners,
}));
vi.mock("../xatlas-uv/studio-xatlas-uv-provider-worker-client", () => ({ createStudioXAtlasUvWorkerClient: workerFactory.create }));

function deferred<T>() {
  let complete: (value: T) => void = () => { throw new Error("검증용 Promise가 초기화되지 않았습니다."); };
  const promise = new Promise<T>((resolve) => { complete = resolve; });
  return { promise, resolve: (value: T) => complete(value) };
}

/** 늦은 결과·진행률을 의도적으로 돌려주는 단위 대역이며 실제 Worker 증거는 아니다. */
class ControlledClient {
  readonly result = deferred<StudioXAtlasUvResult>();
  request: unknown = null;
  execution: StudioXAtlasUvExecution | undefined;
  readonly execute = vi.fn<StudioXAtlasUvWorkerClient["execute"]>((request, execution) => {
    this.request = request;
    this.execution = execution;
    return this.result.promise;
  });
  readonly dispose = vi.fn<StudioXAtlasUvWorkerClient["dispose"]>();
  progress(value: number) { this.execution?.onProgress?.({ sequence: 1, mode: "unit-fixture", progress: value }); }
}

const clients: ControlledClient[] = [];
beforeEach(() => {
  auth.actor = "uv-owner"; auth.revision = 0; auth.listeners.clear();
  clients.length = 0;
  workerFactory.create.mockReset();
  workerFactory.create.mockImplementation(() => {
    const client = new ControlledClient(); clients.push(client); return client;
  });
});
afterEach(cleanup);

function source(documentId = "uv-hook-document"): StudioHybridDccWorkspace {
  const empty = createStudioHybridDccWorkspace(documentId);
  const mesh = createStudioEditableMeshFromPolygons([
    { x: 0.125, y: 0.25, z: 0 }, { x: 1.125, y: 0.25, z: 0 }, { x: 0.375, y: 1.75, z: 0 },
  ], [[0, 1, 2]]);
  return synchronizeWorkspaceGeometryAuthority({ ...empty, activeAssetId: "triangle" }, hybridDccRegisterAsset(empty.session, "triangle", mesh, {
    source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original",
  }));
}

function record(workspace: StudioHybridDccWorkspace) {
  const result = workspace.session.state.geometry.records.triangle;
  if (!result) throw new Error("검증할 삼각형 정본이 없습니다.");
  return result;
}

/** 고정 수치는 실제 출력 조립기로 검증하되 WASM 실행·축 규약 증거로 사용하지 않는다. */
function success(workspace: StudioHybridDccWorkspace): StudioXAtlasUvResult {
  const snapshot = prepareStudioHybridDccUvAtlas(workspace);
  const { prepared } = snapshot;
  return { ok: true, artifact: buildStudioXAtlasUvArtifact({
    width: 64, height: 64, atlasCount: 1, meshCount: 1, texelsPerUnit: 16,
    meshes: [{ id: snapshot.assetId, positions: prepared.positions.slice(), indices: prepared.indices.slice(),
      uv: new Float32Array([0.125, 0.25, 0.875, 0.25, 0.25, 0.875]),
      originalInputVertexIndices: new Uint32Array([0, 1, 2]),
      atlasSegments: [{ index: 0, count: prepared.indices.length, atlasIndex: 0 }],
    }],
  }, [{ id: snapshot.assetId, positions: prepared.positions, sourceVertexCount: 3 }], STUDIO_XATLAS_UV_PROVIDER_LIMITS, {
    packageName: "xatlasjs", packageVersion: "hook-unit-fixture", runtimeSource: "injected",
    intendedHost: "dedicated-worker", executionTopology: "single-dedicated-worker", rendererNeutral: true,
    defensiveInputCopy: true, defensiveOutputCopy: true, originalInputPreserved: true,
    nativeHandlesReturned: false, mainThreadFallback: false, atlasCleanup: "direct-destroyAtlas-finally",
    geometryCleanup: "release-typed-array-snapshots", wasmCleanup: "dedicated-worker-termination",
  }, 2, (reason, detail) => { throw new Error(`${reason}: ${detail}`); }) };
}

type HookProps = Parameters<typeof useStudioHybridDccUvAtlas>[0];
function mount(overrides: Partial<HookProps> = {}) {
  const workspace = source();
  const run = vi.fn<StudioHybridDccUvAtlasRun>(async () => {});
  const props: HookProps = { workspace, workspaceDocumentId: "project-a/document-a", enabled: true, editingDisabled: false, blocked: false, run, ...overrides };
  return { ...renderHook((input: HookProps) => useStudioHybridDccUvAtlas(input), { initialProps: props }), props, run };
}

async function begin(view: ReturnType<typeof mount>) {
  const previous = clients.length;
  let completion: Promise<void> | undefined;
  act(() => { completion = view.result.current.start(); });
  await waitFor(() => expect(clients.length).toBe(previous + 1));
  const client = clients[previous];
  if (!client || !completion) throw new Error("자동 UV 단위 요청이 시작되지 않았습니다.");
  await waitFor(() => expect(client.request).not.toBeNull());
  return { completion, client };
}

function publicationGate() {
  const completion = deferred<void>();
  let invocation: { edit: StudioHybridDccWorkspaceEdit; canCommit: () => boolean; onCommitted: () => void } | undefined;
  const run = vi.fn<StudioHybridDccUvAtlasRun>((_label, edit, canCommit, onCommitted) => {
    invocation = { edit, canCommit, onCommitted };
    return completion.promise;
  });
  return {
    run, completion,
    current() { if (!invocation) throw new Error("자동 UV 호스트가 발행 요청을 받지 못했습니다."); return invocation; },
  };
}

describe("자동 UV hook의 취소·원본·발행 lease", () => {
  it("같은 render의 중복 실행은 한 client만 만들고 실제 adapter의 단일 명령·Undo를 발행한다", async () => {
    const workspace = source();
    const selection = createStudioHybridDccComponentSelection();
    const published: { current: StudioHybridDccWorkspace | null } = { current: null };
    const run = vi.fn<StudioHybridDccUvAtlasRun>(async (_label, edit, guard, acknowledge) => {
      expect(guard()).toBe(true);
      const next = edit(workspace, selection);
      expect(next.selection).toBe(selection);
      published.current = next.workspace;
      acknowledge();
    });
    const view = mount({ workspace, run });
    const before = serializeStudioEditableMesh(record(workspace).mesh);
    const journal = serializeStudioCommandJournal(workspace.session.journal);
    let pending: Promise<void> | undefined;
    let duplicate: Promise<void> | undefined;
    act(() => { pending = view.result.current.start(); duplicate = view.result.current.start(); });
    await waitFor(() => expect(clients).toHaveLength(1));
    const client = clients[0];
    if (!client || !pending || !duplicate) throw new Error("자동 UV 요청을 받지 못했습니다.");
    await waitFor(() => expect(client.request).not.toBeNull());
    expect(client.request).toMatchObject({ options: { resolution: 4096, padding: 4, rotateCharts: true } });
    act(() => { client.progress(0.25); });
    expect(view.result.current.progress).toBe(0.25);
    expect(serializeStudioEditableMesh(record(workspace).mesh)).toEqual(before);
    await act(async () => { client.result.resolve(success(workspace)); await pending; await duplicate; });
    expect(workerFactory.create).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
    const applied = published.current;
    if (!applied) throw new Error("정본 UV가 발행되지 않았습니다.");
    expect(applied.session.state.commandCount).toBe(workspace.session.state.commandCount + 1);
    expect(applied.session.undoStack).toHaveLength(workspace.session.undoStack.length + 1);
    expect(record(applied).mesh.uvLayer).toBeDefined();
    expect(workspaceUndo(applied).session.state.stateHash).toBe(workspace.session.state.stateHash);
    expect(serializeStudioEditableMesh(record(workspace).mesh)).toEqual(before);
    expect(serializeStudioCommandJournal(workspace.session.journal)).toBe(journal);
    expect(view.result.current.notice).toMatch(/되돌리기 한 번/u);
    expect(view.result.current.phase).toBe("idle");
    expect(client.dispose).toHaveBeenCalledOnce();
  });

  it("계산 중 취소한 뒤 도착한 결과·진행률은 원본과 상태를 바꾸지 않는다", async () => {
    const view = mount();
    const job = await begin(view);
    act(() => { view.result.current.cancel(); });
    const notice = view.result.current.notice;
    expect(job.client.execution?.signal?.aborted).toBe(true);
    expect(job.client.dispose).toHaveBeenCalledOnce();
    act(() => { job.client.progress(0.9); });
    await act(async () => { job.client.result.resolve(success(view.props.workspace)); await job.completion; });
    expect(view.run).not.toHaveBeenCalled();
    expect(view.result.current.phase).toBe("idle");
    expect(view.result.current.progress).toBeNull();
    expect(view.result.current.notice).toBe(notice);
    expect(record(view.props.workspace).mesh.uvLayer).toBeUndefined();
  });

  it.each(["actor", "revision", "project", "document", "asset", "workspace", "mode", "preview"] as const)("%s 전환 뒤의 이전 결과·진행률은 발행하지 않는다", async (change) => {
    const view = mount();
    const job = await begin(view);
    const old = view.props.workspace;
    const before = serializeStudioCommandJournal(old.session.journal);
    act(() => {
      if (change === "actor" || change === "revision") {
        if (change === "actor") auth.actor = "another-owner";
        auth.revision += 1;
        for (const listener of auth.listeners) listener();
      } else {
        const changes: Partial<HookProps> = change === "project" ? { workspaceDocumentId: "project-b/document-a" }
          : change === "document" ? { workspace: source("another-document") }
            : change === "asset" ? { workspace: { ...old, activeAssetId: null } }
              : change === "workspace" ? { workspace: { ...old } }
                : change === "mode" ? { enabled: false } : { blocked: true };
        view.rerender({ ...view.props, ...changes });
      }
    });
    expect(job.client.execution?.signal?.aborted).toBe(true);
    const notice = view.result.current.notice;
    act(() => { job.client.progress(0.95); });
    await act(async () => { job.client.result.resolve(success(old)); await job.completion; });
    expect(view.run).not.toHaveBeenCalled();
    expect(view.result.current.progress).toBeNull();
    expect(view.result.current.notice).toBe(notice);
    expect(serializeStudioCommandJournal(old.session.journal)).toBe(before);
    expect(job.client.dispose).toHaveBeenCalledOnce();
  });

  it("인증 store만 먼저 바뀌어도 React 재렌더 전의 늦은 진행률을 차단한다", async () => {
    const view = mount();
    const job = await begin(view);
    auth.actor = "new-owner";
    auth.revision += 1;
    act(() => { job.client.progress(0.95); });
    expect(view.result.current.progress).toBeNull();
    await act(async () => { job.client.result.resolve(success(view.props.workspace)); await job.completion; });
    expect(view.run).not.toHaveBeenCalled();
  });

  it("계산 중 다른 편집이 잠그면 즉시 중단하고 늦은 성공을 버린다", async () => {
    const view = mount();
    const job = await begin(view);
    view.rerender({ ...view.props, editingDisabled: true });
    expect(job.client.execution?.signal?.aborted).toBe(true);
    expect(view.result.current.phase).toBe("idle");
    await act(async () => { job.client.result.resolve(success(view.props.workspace)); await job.completion; });
    expect(view.run).not.toHaveBeenCalled();
    expect(view.result.current.canStart).toBe(false);
  });

  it("unmount 뒤의 결과·진행률은 호스트에 전달하지 않고 client를 해제한다", async () => {
    const view = mount();
    const job = await begin(view);
    view.unmount();
    expect(job.client.execution?.signal?.aborted).toBe(true);
    act(() => { job.client.progress(0.9); });
    await act(async () => { job.client.result.resolve(success(view.props.workspace)); await job.completion; });
    expect(view.run).not.toHaveBeenCalled();
    expect(job.client.dispose).toHaveBeenCalledOnce();
  });

  it("own publishing의 busy 재렌더는 guard를 유지하고 부모 Promise·실제 ack까지 잠금을 유지한다", async () => {
    const host = publicationGate();
    const view = mount({ run: host.run });
    const job = await begin(view);
    act(() => { job.client.result.resolve(success(view.props.workspace)); });
    await waitFor(() => expect(view.result.current.phase).toBe("publishing"));
    const publication = host.current();
    view.rerender({ ...view.props, editingDisabled: true });
    expect(view.result.current.busy).toBe(true);
    expect(publication.canCommit()).toBe(true);
    expect(job.client.execution?.signal?.aborted).toBe(false);
    act(() => { view.result.current.setResolution("2048"); });
    expect(view.result.current.resolution).toBe("4096");
    await act(async () => { await view.result.current.start(); });
    expect(host.run).toHaveBeenCalledOnce();
    const applied = publication.edit(view.props.workspace, createStudioHybridDccComponentSelection()).workspace;
    expect(applied.session.state.commandCount).toBe(view.props.workspace.session.state.commandCount + 1);
    act(() => { publication.onCommitted(); });
    expect(view.result.current.busy).toBe(true);
    await act(async () => { host.completion.resolve(); await job.completion; });
    expect(view.result.current.phase).toBe("idle");
    expect(view.result.current.busy).toBe(true);
    view.rerender({ ...view.props, workspace: applied, editingDisabled: false });
    expect(view.result.current.busy).toBe(false);
    expect(view.result.current.error).toBe("");
    expect(view.result.current.notice).toMatch(/적용했습니다/u);
  });

  it("publishing 취소는 부모의 commit guard를 닫고 늦은 ack·완료를 무시한다", async () => {
    const host = publicationGate();
    const view = mount({ run: host.run });
    const job = await begin(view);
    act(() => { job.client.result.resolve(success(view.props.workspace)); });
    await waitFor(() => expect(view.result.current.phase).toBe("publishing"));
    const publication = host.current();
    act(() => { view.result.current.cancel(); });
    expect(publication.canCommit()).toBe(false);
    const selection = createStudioHybridDccComponentSelection();
    expect(() => publication.edit(view.props.workspace, selection)).toThrow(/원본이 바뀌었습니다/u);
    act(() => { publication.onCommitted(); });
    await act(async () => { host.completion.resolve(); await job.completion; });
    expect(view.result.current.notice).toMatch(/취소했습니다/u);
    expect(view.result.current.error).toBe("");
    expect(record(view.props.workspace).mesh.uvLayer).toBeUndefined();
  });

  it("ack 없이 끝난 부모 작업은 성공으로 표시하지 않고 오류와 자원 해제를 남긴다", async () => {
    const view = mount();
    const job = await begin(view);
    await act(async () => { job.client.result.resolve(success(view.props.workspace)); await job.completion; });
    expect(view.run).toHaveBeenCalledOnce();
    expect(view.result.current.error).toMatch(/적용을 확인하지 못했습니다/u);
    expect(view.result.current.notice).not.toMatch(/적용했습니다/u);
    expect(view.result.current.phase).toBe("idle");
    expect(job.client.dispose).toHaveBeenCalledOnce();
    expect(job.client.execution?.signal?.aborted).toBe(true);
  });

  it("취소 후 재시도 중 이전 finally·진행률이 새 작업을 해제하지 않는다", async () => {
    const view = mount();
    const previous = await begin(view);
    act(() => { view.result.current.cancel(); });
    const next = await begin(view);
    act(() => { previous.client.progress(0.9); });
    await act(async () => { previous.client.result.resolve(success(view.props.workspace)); await previous.completion; });
    expect(view.result.current.phase).toBe("computing");
    expect(view.result.current.progress).toBeNull();
    expect(next.client.dispose).not.toHaveBeenCalled();
    expect(next.client.execution?.signal?.aborted).toBe(false);
    act(() => { next.client.progress(0.5); });
    expect(view.result.current.progress).toBe(0.5);
    await act(async () => {
      next.client.result.resolve({ ok: false, reason: "provider-failure", detail: "새 요청 실패" });
      await next.completion;
    });
    expect(view.result.current.error).toMatch(/자동 UV 계산에 실패했습니다/u);
    expect(view.run).not.toHaveBeenCalled();
  });

  it.each([
    ["resolution", ""], ["resolution", "0"], ["resolution", "-1"], ["resolution", "0.5"],
    ["resolution", "NaN"], ["resolution", "Infinity"], ["resolution", "9007199254740992"],
    ["resolution", "8193"], ["padding", ""], ["padding", "-1"], ["padding", "0.5"], ["padding", "65"],
  ] as const)("잘못된 %s 초안 '%s'는 client나 문서 명령을 만들지 않는다", async (field, value) => {
    const view = mount();
    act(() => {
      if (field === "resolution") view.result.current.setResolution(value);
      else view.result.current.setPadding(value);
    });
    await act(async () => { await view.result.current.start(); });
    expect(view.result.current[field]).toBe(value);
    expect(view.result.current.error).not.toBe("");
    expect(workerFactory.create).not.toHaveBeenCalled();
    expect(view.run).not.toHaveBeenCalled();
    expect(view.result.current.phase).toBe("idle");
  });
});
