// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioEditableMeshFromPolygons } from "../studio-editable-half-edge-mesh";
import { buildStudioXAtlasUvArtifact } from "../xatlas-uv/studio-xatlas-uv-provider-output";
import { STUDIO_XATLAS_UV_PROVIDER_LIMITS } from "../xatlas-uv/studio-xatlas-uv-provider";
import { StudioHybridDccPanel } from "./StudioHybridDccPanel";
import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority } from "./studio-hybrid-dcc-workspace";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "./studio-hybrid-dcc-workfile";

import type { StudioXAtlasUvRequest, StudioXAtlasUvResult } from "../xatlas-uv/studio-xatlas-uv-provider";
import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";
import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

const fixture = vi.hoisted(() => ({
  actor: "atlas-panel-owner", revision: 0, listeners: new Set<() => void>(), hold: false,
  releases: [] as Array<() => void>,
  requests: [] as Array<{ readonly request: StudioXAtlasUvRequest; readonly resolve: (result: StudioXAtlasUvResult) => void }>,
  dispose: vi.fn(),
}));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => fixture.actor, getAuthSessionRevision: () => fixture.revision, listeners: fixture.listeners,
}));
vi.mock("../xatlas-uv/studio-xatlas-uv-provider-worker-client", () => ({
  createStudioXAtlasUvWorkerClient: () => ({
    execute: (request: StudioXAtlasUvRequest) => new Promise<StudioXAtlasUvResult>((resolve) => { fixture.requests.push({ request, resolve }); }),
    dispose: fixture.dispose,
  }),
}));
vi.mock("./studio-hybrid-dcc-modifier-workspace", async (load) => {
  const actual = await load<typeof import("./studio-hybrid-dcc-modifier-workspace")>();
  return { ...actual, workspaceRefreshModifierPreviews: (workspace: StudioHybridDccWorkspace) => fixture.hold
    ? new Promise<StudioHybridDccWorkspace>((resolve) => { fixture.releases.push(() => { void actual.workspaceRefreshModifierPreviews(workspace).then(resolve); }); })
    : actual.workspaceRefreshModifierPreviews(workspace) };
});
// Canvas와 Worker 계산만 제어한다. 패널·문서 발행·이력·저장·다시 열기는 실제 경로다.
vi.mock("./StudioHybridDccViewportCore", async (load) => {
  const actual = await load<typeof import("./StudioHybridDccViewportCore")>();
  return { ...actual, StudioHybridDccViewport: (props: StudioHybridDccViewportProps) => {
    const record = props.workspace.session.state.geometry.records.mesh;
    return <div data-testid="atlas-panel-viewport" data-uv={JSON.stringify(record?.mesh.uvLayer ?? null)}
      data-vertices={JSON.stringify(record?.mesh.vertices)} data-locked={String(props.editingDisabled ?? false)} />;
  } };
});

beforeEach(() => {
  fixture.actor = "atlas-panel-owner"; fixture.revision = 0; fixture.hold = false; fixture.releases = []; fixture.requests = []; fixture.dispose.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function source() {
  const empty = createStudioHybridDccWorkspace("atlas-panel-doc");
  const mesh = createStudioEditableMeshFromPolygons([
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
  ], [[0, 1, 2, 3]]);
  return synchronizeWorkspaceGeometryAuthority({ ...empty, activeAssetId: "mesh" }, hybridDccRegisterAsset(empty.session, "mesh", mesh, {
    source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original",
  }));
}

function success(request: StudioXAtlasUvRequest): StudioXAtlasUvResult {
  const input = request.meshes[0]; if (!input) throw new Error("실제 UV 요청이 없습니다.");
  const vertexCount = input.positions.length / 3;
  const uv = new Float32Array([0.125, 0.25, 0.875, 0.25, 0.875, 0.75, 0.125, 0.75]);
  if (vertexCount !== 4) throw new Error("독립 사각형 fixture의 정점 수가 달라졌습니다.");
  const artifact = buildStudioXAtlasUvArtifact({ width: 64, height: 64, atlasCount: 1, meshCount: 1, texelsPerUnit: 16,
    meshes: [{ id: input.id, positions: input.positions.slice(), indices: new Uint32Array(input.indices), uv,
      originalInputVertexIndices: new Uint32Array([0, 1, 2, 3]), atlasSegments: [{ index: 0, count: input.indices.length, atlasIndex: 0 }] }],
  }, [{ id: input.id, positions: input.positions, sourceVertexCount: 4 }], STUDIO_XATLAS_UV_PROVIDER_LIMITS, {
    packageName: "xatlasjs", packageVersion: "panel-fixture", runtimeSource: "injected", intendedHost: "dedicated-worker",
    executionTopology: "single-dedicated-worker", rendererNeutral: true, defensiveInputCopy: true, defensiveOutputCopy: true,
    originalInputPreserved: true, nativeHandlesReturned: false, mainThreadFallback: false,
    atlasCleanup: "direct-destroyAtlas-finally", geometryCleanup: "release-typed-array-snapshots", wasmCleanup: "dedicated-worker-termination",
  }, 2, (reason, detail) => { throw new Error(`${reason}: ${detail}`); });
  return { ok: true, artifact };
}

const viewport = () => screen.getByTestId("atlas-panel-viewport");
const currentUv = () => viewport().getAttribute("data-uv");
function request() { const value = fixture.requests[0]; if (!value) throw new Error("계산 요청이 시작되지 않았습니다."); return value; }
function latest(notify: ReturnType<typeof vi.fn<(workspace: StudioHybridDccWorkspace) => void>>) {
  const call = notify.mock.calls.at(-1); if (!call) throw new Error("적용된 문서 알림이 없습니다."); return call[0];
}
async function startAndHold() {
  const workspace = source(); const notify = vi.fn<(workspace: StudioHybridDccWorkspace) => void>();
  const view = render(<StudioHybridDccPanel initialWorkspace={workspace} workspaceDocumentId="atlas-panel-project" workbenchMode="material" onWorkspaceChange={notify} />);
  const vertices = viewport().getAttribute("data-vertices");
  fireEvent.click(screen.getByRole("button", { name: "자동 UV 펼치기" }));
  await waitFor(() => expect(fixture.requests).toHaveLength(1));
  fixture.hold = true;
  await act(async () => { const pending = request(); pending.resolve(success(pending.request)); });
  await waitFor(() => expect(fixture.releases).toHaveLength(1));
  return { workspace, notify, view, vertices };
}
async function releaseCache() {
  fixture.hold = false;
  await act(async () => { for (const release of fixture.releases.splice(0)) release(); });
}

describe("실제 패널의 자동 UV 발행·저장 연결", () => {
  it("자기 busy와 cache 대기 중 중복 실행을 막고 한 명령으로 확정한 뒤 Undo·Redo와 재열기를 보존한다", async () => {
    const { workspace, notify, view, vertices } = await startAndHold();
    expect(viewport().getAttribute("data-locked")).toBe("true");
    expect(screen.getByRole("button", { name: "자동 UV 펼치기 진행 중" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "자동 UV 펼치기 취소" })).toHaveProperty("disabled", false);
    expect(currentUv()).toBe("null"); expect(notify).not.toHaveBeenCalled();
    await releaseCache();
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(currentUv()).not.toBe("null"); expect(viewport().getAttribute("data-vertices")).toBe(vertices);
    const applied = latest(notify); expect(applied.session.undoStack).toHaveLength(workspace.session.undoStack.length + 1);
    const saved = decodeStudioHybridDccWorkfile(
      Uint8Array.from(encodeStudioHybridDccWorkfile(applied)),
      { documentId: "atlas-panel-reopened" },
    );
    const expected = currentUv();
    fireEvent.click(screen.getByRole("button", { name: "마지막 3D 편집 되돌리기" }));
    await waitFor(() => expect(currentUv()).toBe("null"));
    fireEvent.click(screen.getByRole("button", { name: "되돌린 3D 편집 다시 실행" }));
    await waitFor(() => expect(currentUv()).toBe(expected));
    view.unmount();
    render(<StudioHybridDccPanel initialWorkspace={saved} workspaceDocumentId="atlas-panel-reopened-project" workbenchMode="material" />);
    expect(currentUv()).toBe(expected);
    fireEvent.click(screen.getByRole("button", { name: "마지막 3D 편집 되돌리기" }));
    await waitFor(() => expect(currentUv()).toBe("null"));
  });

  it("실제 부모 cache 대기 중 취소하면 늦은 완료가 문서나 이력을 바꾸지 않는다", async () => {
    const { workspace, notify } = await startAndHold();
    fireEvent.click(screen.getByRole("button", { name: "자동 UV 펼치기 취소" }));
    await releaseCache();
    await waitFor(() => expect(viewport().getAttribute("data-locked")).toBe("false"));
    expect(currentUv()).toBe("null"); expect(notify).not.toHaveBeenCalled();
    expect(workspace.session.state.geometry.records.mesh?.mesh.uvLayer).toBeUndefined();
  });

  it("실제 부모 cache 대기 중 인증 세대가 바뀌면 이전 계정의 결과를 발행하지 않는다", async () => {
    const { notify } = await startAndHold();
    act(() => { fixture.actor = "atlas-other-owner"; fixture.revision += 1; for (const listener of fixture.listeners) listener(); });
    await releaseCache();
    await waitFor(() => expect(viewport().getAttribute("data-locked")).toBe("false"));
    expect(currentUv()).toBe("null"); expect(notify).not.toHaveBeenCalled();
  });
});
