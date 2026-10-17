import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioBg3dModelImportActions, type StudioBg3dModelImportActionsContext } from "./studio-bg3d-editor-model-import-actions";
import { studioBg3dSkpImportSession } from "./studio-bg3d-skp-import-session";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";

import type { StudioBg3dSkpImportOptions } from "./studio-bg3d-skp-import";

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
    list: vi.fn(),
    runScene: vi.fn(),
    commit: vi.fn(),
    persist: vi.fn(),
    persistAi: vi.fn(),
    createAttachment: vi.fn(),
    admit: vi.fn(),
  };
});

vi.mock("./studio-bg3d-model-import", () => ({
  StudioBg3dModelImportError: runtime.FakeImportError,
  planStudioBg3dModelImports: runtime.plan,
  convertStudioBg3dModelFilesToGlb: runtime.convert,
}));
vi.mock("./studio-bg3d-model-library-loader", () => ({
  createStudioBg3dModelAttachment: runtime.createAttachment,
  deleteStoredBg3dModelV12: vi.fn(),
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

const HASH = `sha256:${"f".repeat(64)}`;
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

const AI_RIGHTS = { ...RIGHTS, aiGenerated: "yes", aiTraining: "prohibited" } as const;

beforeEach(() => {
  vi.resetAllMocks();
  studioBg3dSkpImportSession.clearResults();
  studioBg3dSkpImportSession.setActivity(null);
  runtime.list.mockResolvedValue([]);
  runtime.persist.mockResolvedValue("saved");
  runtime.persistAi.mockResolvedValue("saved");
  runtime.createAttachment.mockImplementation(async (record: { id: string }) => ({ id: `attachment-${record.id}`, hash: "h" }));
  runtime.admit.mockResolvedValue(undefined);
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
});

describe("importModelFiles with AI use chosen on the rights form", () => {
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
