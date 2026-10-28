// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import { resolveStudioBg3dDeviceQuality } from "./studio-bg3d-device-quality";
import * as modelLibrary from "./studio-bg3d-model-library-loader";
import { applyStudioBg3dPrimitiveEditWorkspace } from "./studio-bg3d-primitive-edit-orchestrator";
import { createStudioBg3dPrimitiveEditHost, createStudioBg3dPrimitiveEditHostPorts } from "./studio-bg3d-primitive-edit-host";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { Bg3dModelLibraryEntry, Bg3dVerifiedStoredRecord } from "./studio-bg3d-model-library-loader";
import type { StudioBg3dPrimitiveEditEditorHost } from "./studio-bg3d-primitive-edit-host";
import type { StudioBg3dPrimitiveEditOrchestratorHost } from "./studio-bg3d-primitive-edit-orchestrator";
import type { StudioBg3dPrimitiveEditRuntime } from "./studio-bg3d-primitive-edit-source";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document";

// adapter의 전달만 대체한다. begin의 source·재검증·converter·workspace는 실제 권위를 사용한다.
vi.mock("./studio-bg3d-primitive-edit-orchestrator", () => ({ applyStudioBg3dPrimitiveEditWorkspace: vi.fn() }));

type MutableEditorHost = { -readonly [Key in keyof StudioBg3dPrimitiveEditEditorHost]: StudioBg3dPrimitiveEditEditorHost[Key] };

function fixture() {
  const primitive: BgPrimitive = { id: "source-box", kind: "box", name: "실제 원본 상자", color: "#c9a876",
    position: [2.25, 0.75, -3.5], rotation: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2] };
  const runtime: { current: StudioBg3dPrimitiveEditRuntime } = { current: {
    primitives: [primitive], customModels: [], document: createDefaultStudioBg3dSceneDocument(),
  } };
  const session = { current: { epoch: 1 } };
  const selection = { current: new Set([primitive.id]) };
  const replace = vi.fn<StudioBg3dPrimitiveEditOrchestratorHost["replaceCanonicalDocumentState"]>();
  const commit = vi.fn<StudioBg3dPrimitiveEditOrchestratorHost["commitImmediateHistoryTransition"]>();
  const host: MutableEditorHost = { open: true, selectedIds: new Set(["stale-render"]), selectedIdsRef: selection,
    physicsRuntimeSourceRef: runtime, modalAssetSessionRef: session,
    modelRootCacheRef: { current: new Map<string, StudioBg3dModelRootCacheEntry>() },
    attachmentByStorageModelIdRef: { current: new Map<string, StudioBg3dModelAttachment>() },
    storageModelIdByAttachmentIdRef: { current: new Map<string, string>() },
    deviceQuality: resolveStudioBg3dDeviceQuality({ document: runtime.current.document, mode: "capture", preference: "desktop",
      signals: { cssWidth: 1440, cssHeight: 900, devicePixelRatio: 1, pointer: "fine", saveData: false, deviceMemoryGb: 8, hardwareConcurrency: 8 } }),
    modelRenderer: { domElement: document.createElement("canvas"), isWebGPURenderer: true, hasFeature: () => false },
    addGeneratedParts: () => false, replaceCanonicalDocumentState: replace, commitImmediateHistoryTransition: commit };
  return { host, primitive, runtime, session, selection, replace, commit };
}

async function begin(host: StudioBg3dPrimitiveEditEditorHost) {
  const command = createStudioBg3dPrimitiveEditHostPorts(host).onBeginPrimitiveEdit;
  if (!command) throw new Error("실제 begin 명령이 필요합니다.");
  const result = await command();
  if (!result.ok) throw new Error(result.messageKo);
  if (result.context.kind !== "primitive") throw new Error("기본 상자 fixture의 편집 문맥이 필요합니다.");
  return result.context;
}

function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => { complete = resolve; });
  return { promise, finish(value: T) { if (!complete) throw new Error("대기 요청이 필요합니다."); complete(value); } };
}

function record(): Bg3dVerifiedStoredRecord {
  return { id: "private-model", name: "편집한 상자.glb", format: "glb", storageVersion: 2, thumbnail: null,
    blob: new Blob([new Uint8Array(3344)], { type: "model/gltf-binary" }), createdAt: 100, updatedAt: 200,
    contentHash: `sha256:${"a".repeat(64)}`, byteSize: 3344, mime: "model/gltf-binary", validationVersion: 1,
    validatedAt: 200, validatorProfile: "desktop", rights: { status: "owned", commercialUse: true, attributionRequired: false },
    validatorMetrics: { byteSize: 3344, jsonByteSize: 2700, binByteSize: 616, nodes: 1, meshes: 1, meshPrimitives: 1,
      drawCalls: 1, triangles: 12, materials: 1, textures: 0, images: 0, imageBytes: 0, estimatedDecodedImageBytes: 0,
      maxImageDimension: 0, undeterminedImageDimensions: 0, lights: 0, animations: 0, animationChannels: 0,
      animationKeyframes: 0, animationValues: 0, skins: 0, joints: 0, morphTargets: 0, accessorElements: 36, estimatedDecodedGeometryBytes: 576 } };
}

function entries(): Bg3dModelLibraryEntry[] {
  return [{ id: "private-model", name: "편집한 상자.glb", format: "glb", source: "sqlite-opfs", thumbnail: null,
    createdAt: 100, updatedAt: 200, status: "verified", canUse: true, statusMessage: "검증한 모델",
    contentHash: `sha256:${"a".repeat(64)}`, byteSize: 3344, commercialUse: true }];
}

beforeEach(() => { vi.mocked(applyStudioBg3dPrimitiveEditWorkspace).mockReset().mockResolvedValue({ ok: true, nodeId: "source-box", storageModelId: "private-model" }); });
afterEach(() => { vi.restoreAllMocks(); });

describe("기본 도형 직접 편집의 가변 host adapter", () => {
  it("생성 뒤 교체한 모든 ref·선택·품질·renderer를 호출 시점에 읽는다", () => {
    const first = fixture(), latest = fixture();
    const adapter = createStudioBg3dPrimitiveEditHost(first.host);
    expect(adapter.selectedIdsRef).toBe(first.selection);
    first.host.open = false;
    first.host.selectedIds = new Set(["new-render-selection"]);
    first.host.selectedIdsRef = latest.selection;
    first.host.physicsRuntimeSourceRef = latest.runtime;
    first.host.modalAssetSessionRef = latest.session;
    first.host.modelRootCacheRef = latest.host.modelRootCacheRef;
    first.host.attachmentByStorageModelIdRef = latest.host.attachmentByStorageModelIdRef;
    first.host.storageModelIdByAttachmentIdRef = latest.host.storageModelIdByAttachmentIdRef;
    first.host.deviceQuality = latest.host.deviceQuality;
    first.host.modelRenderer = latest.host.modelRenderer;
    expect(adapter.open).toBe(false);
    expect(adapter.selectedIds).toBe(first.host.selectedIds);
    expect(adapter.selectedIdsRef).toBe(latest.selection);
    expect(adapter.physicsRuntimeSourceRef).toBe(latest.runtime);
    expect(adapter.modalAssetSessionRef).toBe(latest.session);
    expect(adapter.modelRootCacheRef).toBe(latest.host.modelRootCacheRef);
    expect(adapter.attachmentByStorageModelIdRef).toBe(latest.host.attachmentByStorageModelIdRef);
    expect(adapter.storageModelIdByAttachmentIdRef).toBe(latest.host.storageModelIdByAttachmentIdRef);
    expect(adapter.deviceQuality).toBe(latest.host.deviceQuality);
    expect(adapter.modelRenderer).toBe(latest.host.modelRenderer);
    first.host.modelRenderer = undefined;
    expect(adapter.modelRenderer).toBeNull();
    first.host.physicsRuntimeSourceRef = undefined;
    expect(() => adapter.physicsRuntimeSourceRef).toThrow("현재 호스트");
  });

  it("렌더 뒤 교체한 정본·history 함수에 현재 host를 this로 전달하고 반환값을 보존한다", () => {
    const f = fixture(), adapter = createStudioBg3dPrimitiveEditHost(f.host);
    const token = Symbol("정본 반영 반환값");
    const replace = vi.fn(function (this: MutableEditorHost) { expect(this).toBe(f.host); return token; });
    const commit = vi.fn(function (this: MutableEditorHost) { expect(this).toBe(f.host); });
    f.host.replaceCanonicalDocumentState = replace; f.host.commitImmediateHistoryTransition = commit;
    const mutation = { document: f.runtime.current.document };
    expect(adapter.replaceCanonicalDocumentState(mutation)).toBe(token);
    const before = createStudioBg3dHistorySnapshot(f.runtime.current);
    adapter.commitImmediateHistoryTransition(f.runtime.current.primitives, [], f.runtime.current.document, before,
      { commandId: "primitive-test", label: "원본 편집", source: "menu" });
    expect(replace).toHaveBeenCalledWith(mutation);
    expect(commit).toHaveBeenCalledWith(f.runtime.current.primitives, [], f.runtime.current.document, before,
      { commandId: "primitive-test", label: "원본 편집", source: "menu" });
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it("현재 insertion·capture ref·camera 함수의 잠금을 각각 반영한다", () => {
    const f = fixture(), adapter = createStudioBg3dPrimitiveEditHost(f.host);
    expect(adapter.isPrimitiveEditInteractionLocked()).toBe(false);
    f.host.isUploadingModel = true; expect(adapter.isPrimitiveEditInteractionLocked()).toBe(true);
    f.host.isUploadingModel = false; f.host.captureInFlightRef = { current: true };
    expect(adapter.isPrimitiveEditInteractionLocked()).toBe(true);
    f.host.captureInFlightRef = { current: false }; f.host.cameraLensInteractionLocked = () => true;
    expect(adapter.isPrimitiveEditInteractionLocked()).toBe(true);
    f.host.cameraLensInteractionLocked = () => false;
    expect(adapter.isPrimitiveEditInteractionLocked()).toBe(false);
    f.host.modelRenderer = null; expect(adapter.isPrimitiveEditInteractionLocked()).toBe(true);
  });

  it.each(["physicsRuntimeSourceRef", "modalAssetSessionRef", "modelRootCacheRef", "attachmentByStorageModelIdRef",
    "storageModelIdByAttachmentIdRef", "deviceQuality", "replaceCanonicalDocumentState", "commitImmediateHistoryTransition"] satisfies (keyof MutableEditorHost)[])
  ("필수 %s가 없으면 summary·begin·apply 모두 명시적으로 거부한다", async (key) => {
    const f = fixture(), context = await begin(f.host);
    const incomplete = { ...f.host, [key]: undefined };
    const ports = createStudioBg3dPrimitiveEditHostPorts(incomplete);
    expect(ports.primitiveEditSelection).toMatchObject({ nodeId: null, blockedReason: expect.any(String) });
    expect(await ports.onBeginPrimitiveEdit?.()).toMatchObject({ ok: false, messageKo: expect.any(String) });
    expect(await ports.onApplyPrimitiveEdit?.(context, context.workspace, new AbortController().signal)).toMatchObject({ ok: false });
    expect(applyStudioBg3dPrimitiveEditWorkspace).not.toHaveBeenCalled();
  });

  it("실제 최신 선택으로 source→6개 면 workspace를 만들고 원본·문서·history를 변경하지 않는다", async () => {
    const f = fixture(), before = JSON.stringify(f.runtime.current);
    const ports = createStudioBg3dPrimitiveEditHostPorts(f.host);
    expect(ports.primitiveEditSelection).toEqual({ nodeId: "source-box", name: "실제 원본 상자", blockedReason: null, sourceType: "primitive" });
    const context = await begin(f.host), mesh = context.workspace.session.state.geometry.records[context.assetId].mesh;
    expect(context.source.sourceNodeId).toBe(f.primitive.id);
    expect(context.source.modalSession).toBe(f.session.current);
    expect(context.source.primitive).not.toBe(f.primitive);
    expect(context.source.primitive).toEqual(f.primitive);
    expect(mesh.vertices).toHaveLength(8); expect(mesh.faces).toHaveLength(6);
    expect(context.geometry.faceSources[2]?.sourceTriangleIds).toEqual([4, 5]);
    expect(context.initialUndoDepth).toBe(1);
    expect(JSON.stringify(f.runtime.current)).toBe(before);
    expect([...f.selection.current]).toEqual([f.primitive.id]);
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it.each(["source", "selection", "session", "port", "lock"])("begin의 await 경계에서 바뀐 %s를 재검증한다", async (change) => {
    const f = fixture(), command = createStudioBg3dPrimitiveEditHostPorts(f.host).onBeginPrimitiveEdit;
    if (!command) throw new Error("begin이 필요합니다.");
    const pending = command();
    if (change === "source") f.primitive.position[0] += 1;
    if (change === "selection") f.selection.current = new Set();
    if (change === "session") f.session.current = { epoch: 2 };
    if (change === "port") f.host.modelRootCacheRef = undefined;
    if (change === "lock") f.host.isCapturing = true;
    expect(await pending).toMatchObject({ ok: false, messageKo: expect.any(String) });
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it("동일 ports의 다음 begin은 교체된 runtime·선택 ref·session을 사용한다", async () => {
    const f = fixture(), ports = createStudioBg3dPrimitiveEditHostPorts(f.host);
    const primitive = { ...f.primitive, id: "new-box", name: "새 원본" };
    const runtime = { current: { ...f.runtime.current, primitives: [primitive] } };
    const session = { current: { epoch: 5 } };
    f.host.physicsRuntimeSourceRef = runtime; f.host.selectedIdsRef = { current: new Set([primitive.id]) }; f.host.modalAssetSessionRef = session;
    const result = await ports.onBeginPrimitiveEdit?.();
    expect(result?.ok).toBe(true);
    if (!result?.ok) throw new Error("최신 원본을 준비해야 합니다.");
    if (result.context.kind !== "primitive") throw new Error("현재 fixture는 기본 상자입니다.");
    expect(result.context.source.sourceNodeId).toBe("new-box");
    expect(result.context.source.modalSession).toBe(session.current);
    expect(result.context.source.primitive.name).toBe("새 원본");
  });

  it("apply는 동일 context·workspace·signal과 가변 adapter를 전달하며 예외·취소를 처리한다", async () => {
    const f = fixture(), context = await begin(f.host), ports = createStudioBg3dPrimitiveEditHostPorts(f.host);
    const controller = new AbortController();
    expect(await ports.onApplyPrimitiveEdit?.(context, context.workspace, controller.signal)).toMatchObject({ ok: true });
    expect(applyStudioBg3dPrimitiveEditWorkspace).toHaveBeenCalledOnce();
    const [adapter, forwardedContext, workspace, signal] = vi.mocked(applyStudioBg3dPrimitiveEditWorkspace).mock.calls[0];
    expect(forwardedContext).toBe(context); expect(workspace).toBe(context.workspace); expect(signal).toBe(controller.signal);
    const newer = fixture(); f.host.physicsRuntimeSourceRef = newer.runtime;
    expect(adapter.physicsRuntimeSourceRef).toBe(newer.runtime);
    vi.mocked(applyStudioBg3dPrimitiveEditWorkspace).mockRejectedValueOnce(new Error("apply failed"));
    expect(await ports.onApplyPrimitiveEdit?.(context, context.workspace, controller.signal)).toMatchObject({ ok: false, messageKo: expect.any(String) });
    controller.abort();
    expect(await ports.onApplyPrimitiveEdit?.(context, context.workspace, controller.signal)).toMatchObject({ ok: false });
    expect(applyStudioBg3dPrimitiveEditWorkspace).toHaveBeenCalledTimes(2);
  });

  it("actual library entry 배열을 최신 setter에 전달하고 최신 async 통지가 완료될 때까지 기다린다", async () => {
    const f = fixture(), adapter = createStudioBg3dPrimitiveEditHost(f.host), pending = deferred<Bg3dModelLibraryEntry[]>();
    const list = vi.spyOn(modelLibrary, "listBg3dModelLibraryEntriesV12").mockReturnValue(pending.promise);
    const firstSetter = vi.fn(), nextSetter = vi.fn(), firstNotify = vi.fn(), notification = deferred<void>();
    const nextNotify = vi.fn(() => notification.promise);
    f.host.setModelLibrary = firstSetter; f.host.onAssetCommitted = firstNotify;
    const saved = record(), request = Promise.resolve(adapter.onAssetCommitted?.(saved));
    await vi.waitFor(() => expect(list).toHaveBeenCalledOnce());
    f.host.setModelLibrary = nextSetter; f.host.onAssetCommitted = nextNotify;
    const rows = entries(); pending.finish(rows);
    await vi.waitFor(() => expect(nextNotify).toHaveBeenCalledWith(saved));
    expect(nextSetter).toHaveBeenCalledWith(rows);
    expect(firstSetter).not.toHaveBeenCalled(); expect(firstNotify).not.toHaveBeenCalled();
    expect(nextSetter.mock.calls[0][0][0]).toMatchObject({ source: "sqlite-opfs", status: "verified", canUse: true });
    let completed = false; void request.then(() => { completed = true; });
    await Promise.resolve(); expect(completed).toBe(false);
    notification.finish(); await request; expect(completed).toBe(true);
  });

  it.each(["session", "closed"])("목록 조회 중 %s 변경은 새 장면 setter와 통지를 건드리지 않는다", async (change) => {
    const f = fixture(), pending = deferred<Bg3dModelLibraryEntry[]>(), adapter = createStudioBg3dPrimitiveEditHost(f.host);
    const list = vi.spyOn(modelLibrary, "listBg3dModelLibraryEntriesV12").mockReturnValue(pending.promise);
    const setter = vi.fn(), notify = vi.fn(); f.host.setModelLibrary = setter; f.host.onAssetCommitted = notify;
    const request = Promise.resolve(adapter.onAssetCommitted?.(record()));
    await vi.waitFor(() => expect(list).toHaveBeenCalledOnce());
    if (change === "session") f.host.modalAssetSessionRef = { current: { epoch: 2 } }; else f.host.open = false;
    pending.finish(entries()); await request;
    expect(setter).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
  });

  it("목록·async 통지 예외는 삼키지 않아 상위 orchestrator가 경고로 처리할 수 있다", async () => {
    const f = fixture(), adapter = createStudioBg3dPrimitiveEditHost(f.host);
    f.host.setModelLibrary = vi.fn();
    const list = vi.spyOn(modelLibrary, "listBg3dModelLibraryEntriesV12").mockRejectedValueOnce(new Error("library failed"));
    await expect(adapter.onAssetCommitted?.(record())).rejects.toThrow("library failed");
    list.mockResolvedValue(entries());
    f.host.onAssetCommitted = async () => { throw new Error("notification failed"); };
    await expect(adapter.onAssetCommitted?.(record())).rejects.toThrow("notification failed");
  });
});
