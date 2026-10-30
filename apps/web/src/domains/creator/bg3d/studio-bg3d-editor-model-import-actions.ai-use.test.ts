import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";

import { createStudioBg3dModelImportActions, type StudioBg3dModelImportActionsContext } from "./studio-bg3d-editor-model-import-actions";
import { studioBg3dSkpImportSession } from "./studio-bg3d-skp-import-session";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";
import { createStudioBg3dCacheTestEntry, createStudioBg3dCacheTestRecord } from "./studio-bg3d-model-cache.test-fixture";
import { studioBg3dModelCacheKey } from "./studio-bg3d-model-material-variant";

import type { StudioBg3dSkpImportOptions } from "./studio-bg3d-skp-import";
import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import type { admitAndCacheStudioBg3dModel } from "./studio-bg3d-model-runtime-admission";
import type { StudioBg3dModelImportOptions, StudioBg3dImportProgress } from "./studio-bg3d-model-import";
import type { StudioBg3dSkpImportRun } from "./studio-bg3d-skp-import-run";

type SkpRunModule = Pick<typeof import("./studio-bg3d-skp-import-run"), "beginStudioBg3dSkpImportRun">;

// 가져오기 권리 폼의 AI 사용 표기가 가져오기 액션에서 메타데이터 저장 단계와 이어지는 배선만 확인한다.
// 변환·검증·장면 배치 자체는 각자의 테스트가 다루므로 여기서는 경계를 가짜로 둔다.

const runtime = vi.hoisted(() => {
  class FakeImportError extends Error {
    constructor(readonly code: string, message = code) {
      super(message);
    }
  }
  return {
    FakeImportError,
    plan: vi.fn(),
    convert: vi.fn(),
    importVerified: vi.fn(),
    getStored: vi.fn(),
    deleteStored: vi.fn(),
    list: vi.fn(),
    runScene: vi.fn(),
    commit: vi.fn(),
    persist: vi.fn(),
    persistAi: vi.fn(),
    createAttachment: vi.fn(),
    admit: vi.fn(),
    loadSkpRun: vi.fn<() => Promise<SkpRunModule>>(),
  };
});

// 실제 await 전후 guard를 사용하고, 모듈 전달 시점만 지연한다.
vi.mock("./studio-bg3d-skp-import-run-loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-bg3d-skp-import-run-loader")>();
  return { ...actual, beginCurrentStudioBg3dSkpImportRun: (isCurrent: () => boolean) =>
    actual.beginCurrentStudioBg3dSkpImportRun(isCurrent, () => runtime.loadSkpRun()) };
});

vi.mock("./studio-bg3d-model-import", () => ({
  StudioBg3dModelImportError: runtime.FakeImportError,
  planStudioBg3dModelImports: runtime.plan,
  convertStudioBg3dModelFilesToGlb: runtime.convert,
}));
vi.mock("./studio-bg3d-model-library-loader", () => ({
  createStudioBg3dModelAttachment: runtime.createAttachment,
  deleteStoredBg3dModelV12: runtime.deleteStored,
  getStoredBg3dModelV12: runtime.getStored,
  importVerifiedBg3dModelsAtomicallyV12: runtime.importVerified,
  listBg3dModelLibraryEntriesV12: runtime.list,
}));
vi.mock("./studio-bg3d-modal-operation-coordinator", () => ({
  StudioBg3dStaleModalOperationError: class extends Error {},
  studioBg3dModalOperationCoordinator: { runSceneMutation: runtime.runScene, commitIfCurrent: runtime.commit },
}));
vi.mock("./studio-bg3d-session-glb-policy", () => ({
  deriveStudioBg3dSessionGlbValidationPolicy: () => ({ profile: "desktop", budgets: {} }),
}));
vi.mock("./studio-bg3d-model-placement-admission", () => ({
  StudioBg3dModelPlacementAdmissionError: class extends Error {},
  assertStudioBg3dModelAttachmentAdmission: vi.fn(),
  calculateStudioBg3dPlacedModelBytes: () => 0,
}));
vi.mock("./studio-bg3d-model-runtime-admission", () => ({
  admitAndCacheStudioBg3dModel: runtime.admit,
  bindModelAttachment: (
    maps: { attachmentByStorageModelId: Map<string, { id: string }>; storageModelIdByAttachmentId: Map<string, string> },
    record: { id: string },
    attachment: { id: string },
  ) => {
    maps.attachmentByStorageModelId.set(record.id, attachment);
    maps.storageModelIdByAttachmentId.set(attachment.id, record.id);
    return true;
  },
  withStudioGeneric3dWorkflowMetadata: (attachment: unknown) => attachment,
}));
vi.mock("./studio-bg3d-skp-asset-metadata", () => ({
  persistStudioBg3dSkpAssetMetadata: runtime.persist,
}));
vi.mock("./studio-bg3d-import-asset-metadata", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./studio-bg3d-import-asset-metadata")>()),
  persistStudioBg3dImportedAiUse: runtime.persistAi,
}));

const HASH: Bg3dVerifiedStoredRecord["contentHash"] = `sha256:${"f".repeat(64)}`;
const RIGHTS = { status: "owned", commercialUse: true, attributionRequired: false } as const;

function storedRecord(id: string) {
  return {
    id,
    name: "방",
    contentHash: HASH,
    byteSize: 2_000,
    validatorMetrics: { triangles: 80, textures: 0 },
    rights: RIGHTS,
  };
}

function harness() {
  const context = {
    attachmentByStorageModelIdRef: { current: new Map() },
    storageModelIdByAttachmentIdRef: { current: new Map() },
    modelRootCacheRef: { current: new Map() },
    modelLoadPendingRef: { current: new Map() },
    physicsRuntimeSourceRef: {
      current: {
        primitives: [],
        customModels: [],
        document: { budgets: { complexity: { maxNodes: 1_000, maxModelBytes: 1e9 } } },
      },
    },
    modalAssetSessionRef: { current: { id: "session" } },
    captureInFlightRef: { current: false },
    modelImportAbortRef: { current: null as AbortController | null },
    sceneRestoreAbortRef: { current: null as AbortController | null },
    placementSessionRef: { current: { phase: "idle" } },
    destructiveMutationGuardRef: { current: { begin: vi.fn(), finish: vi.fn() } },
    deviceQuality: { profile: "desktop" },
    genericModelClassifications: new Map(),
    isRestoringScene: false,
    modelRenderer: null,
    materialBackend: "webgpu" as const,
    isMaterialBackendCurrent: vi.fn(() => true),
    sceneBaseDocument: {},
    invalidateModelThumbnailCaptures: vi.fn(() => null),
    isModalAssetSessionCurrent: vi.fn(() => true),
    canAdmitSceneNodes: vi.fn(() => true),
    cancelCustomModelPlacement: vi.fn(),
    commitSceneEntityRemoval: vi.fn(),
    startModelThumbnailCaptureBatch: vi.fn(),
    replaceCanonicalDocumentState: vi.fn(),
    setDeletingModelId: vi.fn(),
    setError: vi.fn(),
    setGenericModelClassifications: vi.fn(),
    setGenericModelSourceFormats: vi.fn(),
    setIsUploadingModel: vi.fn(),
    setModelImportProgress: vi.fn(),
    setModelLibrary: vi.fn(),
    setModelLibraryStatus: vi.fn(),
    setRefTick: vi.fn(),
    setSelectedIds: vi.fn(),
    setCustomModels: vi.fn(),
    setSurfaceSnapStatus: vi.fn(),
  };
  return {
    context,
    actions: () => createStudioBg3dModelImportActions(context as unknown as StudioBg3dModelImportActionsContext),
  };
}

function planOf(...items: readonly { format: string; primaryPath: string }[]) {
  return { items, resources: new Map(), ignoredFiles: [], totalBytes: 0 };
}

function file(name: string): File {
  return new File([new Uint8Array([1])], name);
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => { throw new Error("대기 작업이 준비되지 않았습니다."); };
  let reject: (error: Error) => void = () => { throw new Error("대기 작업이 준비되지 않았습니다."); };
  const promise = new Promise<Value>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}

const AI_RIGHTS = { ...RIGHTS, aiGenerated: "yes", aiTraining: "prohibited" } as const;

beforeEach(() => {
  vi.resetAllMocks();
  studioBg3dSkpImportSession.clearResults();
  studioBg3dSkpImportSession.setActivity(null);
  runtime.list.mockResolvedValue([]);
  runtime.persist.mockResolvedValue("saved");
  runtime.persistAi.mockResolvedValue("saved");
  runtime.createAttachment.mockImplementation(async (record: { id: string }) => ({ id: `attachment-${record.id}`, hash: "h" }));
  runtime.admit.mockImplementation(async () => {
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(20, 12, 8), new MeshBasicMaterial()));
    root.scale.setScalar(0.1);
    return { root, normalizationScale: 0.1 };
  });
  runtime.importVerified.mockResolvedValue([{ id: "model-1", contentHash: HASH, byteSize: 2_000 }]);
  runtime.getStored.mockImplementation(async (id: string) => storedRecord(id));
  runtime.runScene.mockImplementation(async (_session: unknown, work: (lease: unknown) => Promise<unknown>, commit: (value: unknown) => void) => {
    commit(await work({ signal: new AbortController().signal, throwIfRevoked: () => undefined, isCurrent: () => true }));
    return { status: "committed" };
  });
  runtime.commit.mockImplementation((_session: unknown, commit: () => void) => {
    commit();
    return true;
  });
  runtime.convert.mockResolvedValue([new Blob([new Uint8Array([1])])]);
  runtime.plan.mockReturnValue(planOf({ format: "glb", primaryPath: "prop.glb" }));
  runtime.loadSkpRun.mockImplementation(() => import("./studio-bg3d-skp-import-run"));
});

describe("importModelFiles with AI use chosen on the rights form", () => {
  it("저장 뒤 보관함 조회 중 취소하면 늦은 목록으로 장면을 바꾸지 않고 저장 모델은 보존한다", async () => {
    const h = harness(), list = deferred<[]>(), controller = new AbortController();
    runtime.list.mockReturnValueOnce(list.promise);
    const pending = h.actions().importModelFiles([file("local-blender.glb")], AI_RIGHTS, controller.signal);
    await vi.waitFor(() => { expect(runtime.list).toHaveBeenCalledOnce(); });
    expect(runtime.importVerified).toHaveBeenCalledOnce();
    controller.abort();
    list.resolve([]);
    await expect(pending).resolves.toBe(false);
    expect(runtime.admit).not.toHaveBeenCalled();
    expect(h.context.replaceCanonicalDocumentState).not.toHaveBeenCalled();
    expect(h.context.setModelLibrary).not.toHaveBeenCalled();
    expect(h.context.attachmentByStorageModelIdRef.current.size).toBe(0);
    expect(runtime.persistAi).not.toHaveBeenCalled();
    expect(h.context.startModelThumbnailCaptureBatch).not.toHaveBeenCalled();
    expect(h.context.setSurfaceSnapStatus).not.toHaveBeenCalled();
    expect(runtime.deleteStored).not.toHaveBeenCalled();
    expect(runtime.list).toHaveBeenCalledOnce();
    expect(h.context.setError).toHaveBeenLastCalledWith(expect.stringContaining("검증·저장된 모델은 보관함에 남아 있습니다"));
    expect(h.context.modelImportAbortRef.current).toBeNull();
    expect(h.context.setIsUploadingModel.mock.calls).toEqual([[true], [false]]);
    expect(h.context.setModelImportProgress).toHaveBeenLastCalledWith(null);
  });

  it("취소를 무시한 admission의 늦은 캐시도 배치하지 않고 자기 캐시만 정리한다", async () => {
    const h = harness(), controller = new AbortController();
    const record = createStudioBg3dCacheTestRecord("model-1", HASH);
    const entry = { ...createStudioBg3dCacheTestEntry(record, "webgpu"), normalizationScale: 1 };
    entry.root.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()));
    const gate = deferred<typeof entry>();
    let admission: Parameters<typeof admitAndCacheStudioBg3dModel>[0] | undefined;
    runtime.admit.mockImplementationOnce((request: Parameters<typeof admitAndCacheStudioBg3dModel>[0]) => {
      admission = request;
      return gate.promise;
    });
    const pending = h.actions().importModelFiles([file("local-blender.glb")], AI_RIGHTS, controller.signal);
    await vi.waitFor(() => { expect(runtime.admit).toHaveBeenCalledOnce(); });
    if (!admission) throw new Error("admission 요청이 준비되지 않았습니다.");
    expect(admission.isActive()).toBe(true);
    controller.abort();
    expect(admission.isActive()).toBe(false);
    const key = studioBg3dModelCacheKey("model-1", "webgpu");
    admission.cache.set(key, entry);
    admission.onCacheEntryCreated?.("model-1", entry);
    gate.resolve(entry);
    await expect(pending).resolves.toBe(false);
    expect(entry.dispose).toHaveBeenCalledOnce();
    expect(h.context.modelRootCacheRef.current.has(key)).toBe(false);
    expect(h.context.attachmentByStorageModelIdRef.current.size).toBe(0);
    expect(h.context.storageModelIdByAttachmentIdRef.current.size).toBe(0);
    expect(h.context.replaceCanonicalDocumentState).not.toHaveBeenCalled();
    expect(h.context.setModelLibrary).not.toHaveBeenCalled();
    expect(h.context.startModelThumbnailCaptureBatch).not.toHaveBeenCalled();
    expect(runtime.persistAi).not.toHaveBeenCalled();
    expect(runtime.deleteStored).not.toHaveBeenCalled();
    expect(h.context.setIsUploadingModel).toHaveBeenLastCalledWith(false);
  });

  it("장면 배치 뒤 외부 취소는 이미 배치한 모델을 지우지 않고 늦은 AI 완료 알림을 차단한다", async () => {
    const h = harness(), save = deferred<string>(), controller = new AbortController();
    runtime.persistAi.mockReturnValueOnce(save.promise);
    const pending = h.actions().importModelFiles([file("local-blender.glb")], AI_RIGHTS, controller.signal);
    await vi.waitFor(() => { expect(runtime.persistAi).toHaveBeenCalledOnce(); });
    expect(h.context.replaceCanonicalDocumentState).toHaveBeenCalledOnce();
    controller.abort();
    save.resolve("saved");
    await expect(pending).resolves.toBe(true);
    expect(h.context.replaceCanonicalDocumentState).toHaveBeenCalledOnce();
    expect(h.context.setSurfaceSnapStatus).not.toHaveBeenCalled();
    expect(runtime.deleteStored).not.toHaveBeenCalled();
    expect(runtime.importVerified).toHaveBeenCalledOnce();
  });

  it("같은 backend A의 늦은 progress·catch·finally는 B의 controller·UI를 건드리지 않는다", async () => {
    const h = harness(), first = deferred<Blob[]>(), second = deferred<Blob[]>();
    const options: StudioBg3dModelImportOptions[] = [];
    runtime.convert.mockImplementationOnce((_files: unknown, value: StudioBg3dModelImportOptions) => { options.push(value); return first.promise; })
      .mockImplementationOnce((_files: unknown, value: StudioBg3dModelImportOptions) => { options.push(value); return second.promise; });
    const actionA = h.actions(), pendingA = actionA.importModelFiles([file("first.glb")], RIGHTS);
    await vi.waitFor(() => { expect(runtime.convert).toHaveBeenCalledOnce(); });
    const controllerA = h.context.modelImportAbortRef.current;
    const pendingB = h.actions().importModelFiles([file("second.glb")], RIGHTS);
    await vi.waitFor(() => { expect(runtime.convert).toHaveBeenCalledTimes(2); });
    const progress: StudioBg3dImportProgress = { stage: "reading", completedModels: 0, totalModels: 1, sourceName: "second.glb" };
    options[1]?.onProgress?.(progress);
    const controllerB = h.context.modelImportAbortRef.current, progressCalls = h.context.setModelImportProgress.mock.calls.length;
    expect(h.context.setModelImportProgress).toHaveBeenLastCalledWith(progress);
    expect(controllerA?.signal.aborted).toBe(true); expect(controllerB).not.toBeNull(); expect(controllerB).not.toBe(controllerA);
    options[0]?.onProgress?.({ ...progress, sourceName: "first.glb" });
    first.reject(new runtime.FakeImportError("aborted"));
    await expect(pendingA).resolves.toBe(false);
    expect(h.context.modelImportAbortRef.current).toBe(controllerB); expect(controllerB?.signal.aborted).toBe(false);
    expect(h.context.setIsUploadingModel).toHaveBeenLastCalledWith(true);
    expect(h.context.setModelImportProgress).toHaveBeenCalledTimes(progressCalls);
    second.resolve([new Blob([new Uint8Array([1])])]);
    await expect(pendingB).resolves.toBe(true);
    expect(h.context.modelImportAbortRef.current).toBeNull();
    expect(h.context.setIsUploadingModel).toHaveBeenLastCalledWith(false);
    expect(h.context.setModelImportProgress).toHaveBeenLastCalledWith(null);
    expect(h.context.replaceCanonicalDocumentState).toHaveBeenCalledOnce();
    expect(h.context.setError.mock.calls).toEqual([[null], [null]]); expect(runtime.list).toHaveBeenCalledOnce();
    const completedProgressCalls = h.context.setModelImportProgress.mock.calls.length;
    options[0]?.onProgress?.({ ...progress, stage: "ready", sourceName: "first.glb" });
    expect(h.context.setModelImportProgress).toHaveBeenCalledTimes(completedProgressCalls);
  });

  it.each(["resolve", "reject"] as const)("B 완료 뒤 A의 늦은 library %s가 현재 보관함·상태를 덮지 않는다", async (outcome) => {
    const h = harness(), firstList = deferred<{ id: string }[]>();
    runtime.convert.mockRejectedValueOnce(new runtime.FakeImportError("failed"));
    runtime.list.mockImplementationOnce(() => firstList.promise);
    const pendingA = h.actions().importModelFiles([file("first.glb")], RIGHTS);
    await vi.waitFor(() => { expect(runtime.list).toHaveBeenCalledOnce(); });
    await expect(h.actions().importModelFiles([file("second.glb")], RIGHTS)).resolves.toBe(true);
    expect(h.context.modelImportAbortRef.current).toBeNull();
    const libraryCalls = h.context.setModelLibrary.mock.calls.length, statusCalls = h.context.setModelLibraryStatus.mock.calls.length;
    const errorCalls = h.context.setError.mock.calls.length, progressCalls = h.context.setModelImportProgress.mock.calls.length;
    if (outcome === "resolve") firstList.resolve([{ id: "obsolete-model" }]);
    else firstList.reject(new Error("obsolete-list-failed"));
    await expect(pendingA).resolves.toBe(false);
    expect(h.context.setModelLibrary).toHaveBeenCalledTimes(libraryCalls);
    expect(h.context.setModelLibraryStatus).toHaveBeenCalledTimes(statusCalls);
    expect(h.context.setError).toHaveBeenCalledTimes(errorCalls);
    expect(h.context.setModelImportProgress).toHaveBeenCalledTimes(progressCalls);
    expect(h.context.modelImportAbortRef.current).toBeNull();
    expect(h.context.replaceCanonicalDocumentState).toHaveBeenCalledOnce();
  });

  it("A의 AI 저장 중 B가 시작·완료해 ref가 다시 null이어도 A의 지연 안내는 부활하지 않는다", async () => {
    const h = harness(), firstSave = deferred<string>();
    runtime.persistAi.mockImplementationOnce(() => firstSave.promise);
    const pendingA = h.actions().importModelFiles([file("first.glb")], AI_RIGHTS);
    await vi.waitFor(() => { expect(runtime.persistAi).toHaveBeenCalledOnce(); });
    expect(h.context.modelImportAbortRef.current).toBeNull();
    expect(h.context.replaceCanonicalDocumentState).toHaveBeenCalledOnce();
    await expect(h.actions().importModelFiles([file("second.glb")], RIGHTS)).resolves.toBe(true);
    expect(h.context.modelImportAbortRef.current).toBeNull();
    const libraryCalls = h.context.setModelLibrary.mock.calls.length, errorCalls = h.context.setError.mock.calls.length;
    const thumbnailCalls = h.context.startModelThumbnailCaptureBatch.mock.calls.length;
    firstSave.resolve("saved"); await expect(pendingA).resolves.toBe(true);
    expect(h.context.setSurfaceSnapStatus).not.toHaveBeenCalled();
    expect(h.context.setModelLibrary).toHaveBeenCalledTimes(libraryCalls); expect(h.context.setError).toHaveBeenCalledTimes(errorCalls);
    expect(h.context.startModelThumbnailCaptureBatch).toHaveBeenCalledTimes(thumbnailCalls);
    expect(h.context.replaceCanonicalDocumentState).toHaveBeenCalledTimes(2);
  });

  it("가져오기 renderer 요청과 대기 중 fence는 bind 시점 backend를 보존한다", async () => {
    const h = harness(); let captured: Parameters<typeof admitAndCacheStudioBg3dModel>[0] | undefined;
    runtime.admit.mockImplementationOnce(async (request: Parameters<typeof admitAndCacheStudioBg3dModel>[0]) => {
      captured = request;
      expect(request.materialBackend).toBe("webgpu"); expect(request.isActive()).toBe(true);
      h.context.isMaterialBackendCurrent.mockReturnValue(false);
    });
    await expect(h.actions().importModelFiles([file("prop.glb")], RIGHTS)).resolves.toBe(false);
    expect(captured?.isActive()).toBe(false);
    expect(h.context.replaceCanonicalDocumentState).not.toHaveBeenCalled();
    expect(h.context.setError).toHaveBeenCalledTimes(1); expect(h.context.setError).toHaveBeenCalledWith(null);
    expect(h.context.modelImportAbortRef.current).toBeNull();
    expect(h.context.setIsUploadingModel.mock.calls).toEqual([[true], [false]]);
    expect(h.context.setModelImportProgress).toHaveBeenLastCalledWith(null);
    expect(h.context.startModelThumbnailCaptureBatch).not.toHaveBeenCalled();
    expect(h.context.setSurfaceSnapStatus).not.toHaveBeenCalled();
  });

  it("records the AI use for the imported model after the scene is committed and says so on the status line", async () => {
    const h = harness();
    const committed = await h.actions().importModelFiles([file("prop.glb")], AI_RIGHTS);

    expect(committed).toBe(true);
    expect(runtime.persistAi).toHaveBeenCalledOnce();
    expect(runtime.persistAi.mock.calls[0]?.[0]).toMatchObject([{ id: "model-1", contentHash: HASH }]);
    expect(runtime.persistAi.mock.calls[0]?.[1]).toEqual({ aiGenerated: "yes", aiTraining: "prohibited" });
    expect(h.context.setSurfaceSnapStatus).toHaveBeenCalledWith({ tone: "success", message: "AI 사용 표기를 저장했어요." });
    // 오류 줄은 가져오기 시작 때 비우는 한 번뿐이다(AI 안내가 오류 줄로 가지 않는다).
    expect(h.context.setError).toHaveBeenCalledTimes(1);
    expect(h.context.setError).toHaveBeenCalledWith(null);
  });

  it("saves only after the model is on the scene, the upload flag is off and thumbnails have started", async () => {
    const h = harness();
    await h.actions().importModelFiles([file("prop.glb")], AI_RIGHTS);

    const persistOrder = runtime.persistAi.mock.invocationCallOrder[0]!;
    expect(h.context.setModelLibrary.mock.invocationCallOrder[0]!).toBeLessThan(persistOrder);
    expect(h.context.replaceCanonicalDocumentState.mock.invocationCallOrder[0]!).toBeLessThan(persistOrder);
    expect(h.context.setIsUploadingModel.mock.invocationCallOrder.at(-1)!).toBeLessThan(persistOrder);
    expect(h.context.startModelThumbnailCaptureBatch.mock.invocationCallOrder[0]!).toBeLessThan(persistOrder);
  });

  it("does not hold the scene back while the save hangs, and hands the save the import's cancel signal", async () => {
    let started!: () => void;
    const startedSaving = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: (status: string) => void;
    runtime.persistAi.mockImplementation(() => {
      started();
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    });
    const h = harness();
    const pending = h.actions().importModelFiles([file("prop.glb")], AI_RIGHTS);
    await startedSaving;

    // 저장이 끝나지 않았어도 모델은 이미 장면에 있고 가져오기 표시는 꺼졌으며 썸네일도 시작됐다.
    expect(h.context.replaceCanonicalDocumentState).toHaveBeenCalledOnce();
    expect(h.context.setIsUploadingModel).toHaveBeenLastCalledWith(false);
    expect(h.context.startModelThumbnailCaptureBatch).toHaveBeenCalledOnce();
    expect(h.context.setSurfaceSnapStatus).not.toHaveBeenCalled();
    const deps = runtime.persistAi.mock.calls[0]?.[2] as { signal?: AbortSignal } | undefined;
    expect(deps?.signal).toBeInstanceOf(AbortSignal);

    release("saved");
    await expect(pending).resolves.toBe(true);
    expect(h.context.setSurfaceSnapStatus).toHaveBeenCalledWith(expect.objectContaining({ tone: "success" }));
  });

  it("hands the AI use to the library import untouched so the library keeps its closed rights format", async () => {
    const h = harness();
    await h.actions().importModelFiles([file("prop.glb")], AI_RIGHTS);
    const items: unknown = runtime.importVerified.mock.calls[0]?.[0];
    expect(items).toMatchObject([{ rights: { status: "owned", commercialUse: true } }]);
    expect(items).toMatchObject([{ ingress: { kind: "user-file", modelFileExport: "allowed" } }]);
  });

  it("tells the user with an error status, after the model is placed, when the AI use could not be saved", async () => {
    runtime.persistAi.mockResolvedValue("failed");
    const h = harness();
    const committed = await h.actions().importModelFiles([file("prop.glb")], AI_RIGHTS);

    expect(committed).toBe(true);
    expect(h.context.setSurfaceSnapStatus).toHaveBeenLastCalledWith({
      tone: "error",
      message: expect.stringContaining("AI 사용 표기를 저장하지 못했어요"),
    });
    expect(h.context.setModelLibrary).toHaveBeenCalled();
  });

  it("reports an unloadable save module as a failed save instead of throwing", async () => {
    runtime.persistAi.mockRejectedValue(new Error("chunk-load-failed"));
    const h = harness();
    await expect(h.actions().importModelFiles([file("prop.glb")], AI_RIGHTS)).resolves.toBe(true);
    expect(h.context.setSurfaceSnapStatus).toHaveBeenLastCalledWith(expect.objectContaining({ tone: "error" }));
  });

  it("explains with an info status when an earlier record for the same model was left as it was, or the import was cancelled", async () => {
    runtime.persistAi.mockResolvedValue("existing");
    const h = harness();
    await h.actions().importModelFiles([file("prop.glb")], AI_RIGHTS);
    expect(h.context.setSurfaceSnapStatus).toHaveBeenLastCalledWith({
      tone: "info",
      message: expect.stringContaining("기존 기록"),
    });

    runtime.persistAi.mockResolvedValue("cancelled");
    const cancelled = harness();
    await cancelled.actions().importModelFiles([file("prop.glb")], AI_RIGHTS);
    expect(cancelled.context.setSurfaceSnapStatus).toHaveBeenLastCalledWith(expect.objectContaining({ tone: "info" }));
  });

  it("falls back to the error line when the editor gives no status line", async () => {
    runtime.persistAi.mockResolvedValue("failed");
    const h = harness();
    const { setSurfaceSnapStatus: _unused, ...withoutStatus } = h.context;
    const actions = createStudioBg3dModelImportActions(withoutStatus as unknown as StudioBg3dModelImportActionsContext);
    await actions.importModelFiles([file("prop.glb")], AI_RIGHTS);
    expect(h.context.setError).toHaveBeenLastCalledWith(expect.stringContaining("AI 사용 표기를 저장하지 못했어요"));
  });

  it("does not bury a placement failure under the AI notice, and never saves for an import that did not place", async () => {
    runtime.runScene.mockRejectedValue(new Error("scene-failed"));
    const h = harness();
    const committed = await h.actions().importModelFiles([file("prop.glb")], AI_RIGHTS);

    expect(committed).toBe(false);
    expect(h.context.setError).toHaveBeenLastCalledWith(expect.stringContaining("아무 모델도 배치하지 않았습니다"));
    expect(runtime.persistAi).not.toHaveBeenCalled();
    expect(h.context.setSurfaceSnapStatus).not.toHaveBeenCalled();
  });

  it("neither loads the save module nor says anything when no AI use was chosen", async () => {
    const h = harness();
    await h.actions().importModelFiles([file("prop.glb")], RIGHTS);
    expect(runtime.persistAi).not.toHaveBeenCalled();
    expect(h.context.setSurfaceSnapStatus).not.toHaveBeenCalled();
    expect(h.context.setError).toHaveBeenCalledTimes(1);
  });

  function skpPlan() {
    runtime.plan.mockReturnValue(planOf(
      { format: "glb", primaryPath: "prop.glb" },
      { format: "skp", primaryPath: "room.skp" },
    ));
    runtime.convert.mockImplementation(async (_files: unknown, options: { skp?: StudioBg3dSkpImportOptions }) => {
      options.skp?.onReport?.({ sourcePath: "room.skp", sourceName: "room.skp", report: createSkpReportFixture() });
      return [new Blob([new Uint8Array([1])]), new Blob([new Uint8Array([2])])];
    });
    runtime.importVerified.mockResolvedValue([
      { id: "glb-model", contentHash: `sha256:${"1".repeat(64)}`, byteSize: 10 },
      { id: "skp-model", contentHash: HASH, byteSize: 2_000 },
    ]);
    runtime.getStored.mockImplementation(async (id: string) => ({
      ...storedRecord(id),
      contentHash: id === "skp-model" ? HASH : `sha256:${"1".repeat(64)}`,
      byteSize: id === "skp-model" ? 2_000 : 10,
    }));
  }

  it("keeps a .skp out of the generic recording and carries its AI use with the SketchUp report instead", async () => {
    skpPlan();
    const h = harness();

    await h.actions().importModelFiles([file("prop.glb"), file("room.skp")], AI_RIGHTS);

    expect(runtime.persistAi.mock.calls[0]?.[0]).toMatchObject([{ id: "glb-model" }]);
    expect(runtime.persist.mock.calls[0]?.[0]).toMatchObject({
      sourcePath: "room.skp",
      aiUse: { aiGenerated: "yes", aiTraining: "prohibited" },
    });
    // SketchUp 보고서 기록도 가져오기의 취소 신호를 받는다(저장소가 응답하지 않아도 시간 한도에서 멈춘다).
    const deps = runtime.persist.mock.calls[0]?.[2] as { signal?: AbortSignal } | undefined;
    expect(deps?.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports the SketchUp report's AI save result too, and merges it with the other models' result", async () => {
    skpPlan();
    runtime.persist.mockResolvedValue("existing");
    const h = harness();
    await h.actions().importModelFiles([file("prop.glb"), file("room.skp")], AI_RIGHTS);
    // glb 는 새로 저장(saved), skp 는 기존 기록 유지(existing) → 일부만 저장.
    expect(h.context.setSurfaceSnapStatus).toHaveBeenLastCalledWith({
      tone: "info",
      message: expect.stringContaining("나머지는 표기를 저장했어요"),
    });

    runtime.persist.mockResolvedValue("failed");
    const failed = harness();
    await failed.actions().importModelFiles([file("prop.glb"), file("room.skp")], AI_RIGHTS);
    expect(failed.context.setSurfaceSnapStatus).toHaveBeenLastCalledWith(expect.objectContaining({ tone: "error" }));
  });

  it("reports a .skp-only import's AI save result without touching the generic save module", async () => {
    runtime.plan.mockReturnValue(planOf({ format: "skp", primaryPath: "room.skp" }));
    runtime.convert.mockImplementation(async (_files: unknown, options: { skp?: StudioBg3dSkpImportOptions }) => {
      options.skp?.onReport?.({ sourcePath: "room.skp", sourceName: "room.skp", report: createSkpReportFixture() });
      return [new Blob([new Uint8Array([2])])];
    });
    runtime.persist.mockResolvedValue("saved");
    const h = harness();
    await h.actions().importModelFiles([file("room.skp")], AI_RIGHTS);

    expect(runtime.persistAi).not.toHaveBeenCalled();
    expect(h.context.setSurfaceSnapStatus).toHaveBeenLastCalledWith({ tone: "success", message: "AI 사용 표기를 저장했어요." });
  });
});

function deferredSkpRuntime() {
  const complete = vi.fn<StudioBg3dSkpImportRun["complete"]>().mockResolvedValue("skipped");
  const run: StudioBg3dSkpImportRun = { options: {}, complete };
  const begin = vi.fn<SkpRunModule["beginStudioBg3dSkpImportRun"]>(() => run);
  const module: SkpRunModule = { beginStudioBg3dSkpImportRun: begin };
  return { begin, complete, run, module };
}

describe("SketchUp 모듈 대기 중 import action의 현재 요청·UI 소유권", () => {
  it.each(["resolve", "reject"])("backend가 교체된 A의 늦은 load %s는 begin·변환·정본·AI 안내를 시작하지 않는다", async (outcome) => {
    const h = harness(), gate = deferred<SkpRunModule>(), skp = deferredSkpRuntime();
    runtime.plan.mockReturnValue(planOf({ format: "skp", primaryPath: "room.skp" }));
    runtime.loadSkpRun.mockReturnValueOnce(gate.promise);
    const pending = h.actions().importModelFiles([file("room.skp")], AI_RIGHTS);
    await vi.waitFor(() => { expect(runtime.loadSkpRun).toHaveBeenCalledOnce(); });
    h.context.isMaterialBackendCurrent.mockReturnValue(false);
    if (outcome === "resolve") gate.resolve(skp.module); else gate.reject(new Error("obsolete-skp-chunk"));
    await expect(pending).resolves.toBe(false);
    expect(skp.begin).not.toHaveBeenCalled(); expect(skp.complete).not.toHaveBeenCalled();
    expect(runtime.convert).not.toHaveBeenCalled(); expect(runtime.importVerified).not.toHaveBeenCalled();
    expect(h.context.replaceCanonicalDocumentState).not.toHaveBeenCalled();
    expect(runtime.persist).not.toHaveBeenCalled(); expect(runtime.persistAi).not.toHaveBeenCalled();
    expect(h.context.setSurfaceSnapStatus).not.toHaveBeenCalled(); expect(h.context.setError.mock.calls).toEqual([[null]]);
    expect(h.context.modelImportAbortRef.current).toBeNull();
    expect(h.context.setIsUploadingModel.mock.calls).toEqual([[true], [false]]);
  });

  it.each(["resolve", "reject"])("A의 load %s가 늦게 와도 B의 controller·busy·progress·오류 안내를 덮지 않는다", async (outcome) => {
    const h = harness(), gate = deferred<SkpRunModule>(), skp = deferredSkpRuntime(), conversionB = deferred<Blob[]>();
    runtime.plan.mockReturnValueOnce(planOf({ format: "skp", primaryPath: "first.skp" }))
      .mockReturnValueOnce(planOf({ format: "glb", primaryPath: "second.glb" }));
    runtime.loadSkpRun.mockReturnValueOnce(gate.promise); runtime.convert.mockReturnValueOnce(conversionB.promise);
    const pendingA = h.actions().importModelFiles([file("first.skp")], AI_RIGHTS);
    await vi.waitFor(() => { expect(runtime.loadSkpRun).toHaveBeenCalledOnce(); });
    const controllerA = h.context.modelImportAbortRef.current;
    const pendingB = h.actions().importModelFiles([file("second.glb")], RIGHTS);
    await vi.waitFor(() => { expect(runtime.convert).toHaveBeenCalledOnce(); });
    const controllerB = h.context.modelImportAbortRef.current;
    expect(controllerA?.signal.aborted).toBe(true); expect(controllerB).not.toBeNull(); expect(controllerB).not.toBe(controllerA);
    const errorCalls = h.context.setError.mock.calls.length, progressCalls = h.context.setModelImportProgress.mock.calls.length;
    const busyCalls = h.context.setIsUploadingModel.mock.calls.length;
    if (outcome === "resolve") gate.resolve(skp.module); else gate.reject(new Error("obsolete-skp-chunk"));
    await expect(pendingA).resolves.toBe(false);
    expect(skp.begin).not.toHaveBeenCalled(); expect(skp.complete).not.toHaveBeenCalled();
    expect(runtime.convert).toHaveBeenCalledOnce(); expect(runtime.importVerified).not.toHaveBeenCalled();
    expect(h.context.modelImportAbortRef.current).toBe(controllerB); expect(controllerB?.signal.aborted).toBe(false);
    expect(h.context.setError).toHaveBeenCalledTimes(errorCalls);
    expect(h.context.setModelImportProgress).toHaveBeenCalledTimes(progressCalls);
    expect(h.context.setIsUploadingModel).toHaveBeenCalledTimes(busyCalls);
    expect(h.context.setIsUploadingModel).toHaveBeenLastCalledWith(true); expect(h.context.setSurfaceSnapStatus).not.toHaveBeenCalled();
    conversionB.resolve([new Blob([new Uint8Array([2])])]); await expect(pendingB).resolves.toBe(true);
    expect(h.context.replaceCanonicalDocumentState).toHaveBeenCalledOnce(); expect(h.context.modelImportAbortRef.current).toBeNull();
    expect(h.context.setIsUploadingModel).toHaveBeenLastCalledWith(false);
  });

  it.each(["resolve", "reject"])("load 대기 중 사용자 취소와 늦은 %s는 기존 취소 안내·false 반환을 지킨다", async (outcome) => {
    const h = harness(), gate = deferred<SkpRunModule>(), skp = deferredSkpRuntime(), controller = new AbortController();
    runtime.plan.mockReturnValue(planOf({ format: "skp", primaryPath: "room.skp" }));
    runtime.loadSkpRun.mockReturnValueOnce(gate.promise);
    const pending = h.actions().importModelFiles([file("room.skp")], AI_RIGHTS, controller.signal);
    await vi.waitFor(() => { expect(runtime.loadSkpRun).toHaveBeenCalledOnce(); });
    controller.abort();
    if (outcome === "resolve") gate.resolve(skp.module); else gate.reject(new Error("cancelled-skp-chunk"));
    await expect(pending).resolves.toBe(false);
    expect(skp.begin).not.toHaveBeenCalled(); expect(skp.complete).not.toHaveBeenCalled();
    expect(runtime.convert).not.toHaveBeenCalled(); expect(runtime.importVerified).not.toHaveBeenCalled();
    expect(h.context.replaceCanonicalDocumentState).not.toHaveBeenCalled();
    expect(h.context.setError).toHaveBeenLastCalledWith("3D 모델 가져오기를 취소했습니다. 장면과 라이브러리는 변경하지 않았습니다.");
    expect(h.context.setSurfaceSnapStatus).not.toHaveBeenCalled(); expect(runtime.persistAi).not.toHaveBeenCalled();
    expect(h.context.modelImportAbortRef.current).toBeNull(); expect(h.context.setIsUploadingModel).toHaveBeenLastCalledWith(false);
    expect(h.context.setModelImportProgress).toHaveBeenLastCalledWith(null);
  });

  it("현재 요청의 load 완료만 무인자 begin과 변환을 각 한 번 시작한다", async () => {
    const h = harness(), gate = deferred<SkpRunModule>(), skp = deferredSkpRuntime();
    runtime.plan.mockReturnValue(planOf({ format: "skp", primaryPath: "room.skp" }));
    runtime.loadSkpRun.mockReturnValueOnce(gate.promise);
    const pending = h.actions().importModelFiles([file("room.skp")], RIGHTS);
    await vi.waitFor(() => { expect(runtime.loadSkpRun).toHaveBeenCalledOnce(); });
    expect(skp.begin).not.toHaveBeenCalled(); expect(runtime.convert).not.toHaveBeenCalled();
    gate.resolve(skp.module); await expect(pending).resolves.toBe(true);
    expect(skp.begin.mock.calls).toEqual([[]]); expect(runtime.convert).toHaveBeenCalledOnce();
    const options: unknown = runtime.convert.mock.calls[0]?.[1];
    expect(options).toMatchObject({ executionBackend: "worker", skp: skp.run.options });
    expect(skp.complete).toHaveBeenCalledWith(expect.objectContaining({ status: "imported", sourcePaths: ["room.skp"] }));
    expect(h.context.replaceCanonicalDocumentState).toHaveBeenCalledOnce(); expect(h.context.setError.mock.calls).toEqual([[null]]);
  });

  it("현재 요청의 load 실패도 성공으로 바꾸지 않고 기존 일반 실패 안내와 정리 경로를 유지한다", async () => {
    const h = harness(), gate = deferred<SkpRunModule>(), skp = deferredSkpRuntime(), failure = new Error("skp-runtime-load-failed");
    runtime.plan.mockReturnValue(planOf({ format: "skp", primaryPath: "room.skp" }));
    runtime.loadSkpRun.mockReturnValueOnce(gate.promise);
    const pending = h.actions().importModelFiles([file("room.skp")], AI_RIGHTS);
    await vi.waitFor(() => { expect(runtime.loadSkpRun).toHaveBeenCalledOnce(); });
    gate.reject(failure); await expect(pending).resolves.toBe(false);
    expect(failure.message).toBe("skp-runtime-load-failed"); expect(skp.begin).not.toHaveBeenCalled();
    expect(runtime.convert).not.toHaveBeenCalled(); expect(runtime.importVerified).not.toHaveBeenCalled();
    expect(h.context.replaceCanonicalDocumentState).not.toHaveBeenCalled(); expect(h.context.setSurfaceSnapStatus).not.toHaveBeenCalled();
    expect(h.context.setError).toHaveBeenLastCalledWith(expect.stringContaining("아무 모델도 배치하지 않았습니다"));
    expect(h.context.modelImportAbortRef.current).toBeNull(); expect(h.context.setIsUploadingModel).toHaveBeenLastCalledWith(false);
  });
});
