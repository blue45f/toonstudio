import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioBg3dModelImportActions, type StudioBg3dModelImportActionsContext } from "./studio-bg3d-editor-model-import-actions";
import { studioBg3dSkpImportSession } from "./studio-bg3d-skp-import-session";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";

import type { StudioBg3dSkpImportOptions } from "./studio-bg3d-skp-import";

// .skp 가져오기가 에디터 액션에서 결과 화면·자산 메타데이터와 이어지는 배선만 확인한다.
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

beforeEach(() => {
  vi.resetAllMocks();
  studioBg3dSkpImportSession.clearResults();
  studioBg3dSkpImportSession.setActivity(null);
  runtime.list.mockResolvedValue([]);
  runtime.persist.mockResolvedValue("saved");
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
});

describe("importModelFiles with a SketchUp file", () => {
  it("gives the pipeline the skp options, then publishes the report and records it once the model is placed", async () => {
    const h = harness();
    runtime.plan.mockReturnValue(planOf({ format: "skp", primaryPath: "set/room.skp" }));
    runtime.convert.mockImplementation(async (_files: unknown, options: { skp?: StudioBg3dSkpImportOptions }) => {
      options.skp?.onStage?.({
        sourcePath: "set/room.skp",
        sourceName: "room.skp",
        progress: { stage: "building-scene", fraction: null, execution: "worker" },
      });
      options.skp?.onReport?.({ sourcePath: "set/room.skp", sourceName: "room.skp", report: createSkpReportFixture() });
      return [new Blob([new Uint8Array([1])])];
    });

    const committed = await h.actions().importModelFiles([file("room.skp")], RIGHTS);

    expect(committed).toBe(true);
    expect(h.context.setError).toHaveBeenCalledTimes(1);
    expect(h.context.setError).toHaveBeenCalledWith(null);
    expect(runtime.persist).toHaveBeenCalledTimes(1);
    expect(runtime.persist.mock.calls[0]?.[0]).toMatchObject({
      sourcePath: "set/room.skp",
      name: "방",
      contentHash: HASH,
      triangles: 80,
      rights: RIGHTS,
    });
    expect(studioBg3dSkpImportSession.getSnapshot().results).toMatchObject([
      { sourceName: "room.skp", status: "imported", reason: null, metadata: "saved" },
    ]);
    expect(studioBg3dSkpImportSession.getSnapshot().activity).toBeNull();
  });

  it("shows the converted report as not imported, with the reason, when the model cannot be admitted", async () => {
    const h = harness();
    runtime.plan.mockReturnValue(planOf({ format: "skp", primaryPath: "room.skp" }));
    runtime.convert.mockImplementation(async (_files: unknown, options: { skp?: StudioBg3dSkpImportOptions }) => {
      options.skp?.onReport?.({ sourcePath: "room.skp", sourceName: "room.skp", report: createSkpReportFixture() });
      throw new runtime.FakeImportError("triangle-budget-exceeded", "삼각형 예산을 넘었습니다.");
    });

    const committed = await h.actions().importModelFiles([file("room.skp")], RIGHTS);

    expect(committed).toBe(false);
    expect(h.context.setError).toHaveBeenLastCalledWith("삼각형 예산을 넘었습니다.");
    expect(runtime.persist).not.toHaveBeenCalled();
    expect(studioBg3dSkpImportSession.getSnapshot().results).toMatchObject([
      { sourceName: "room.skp", status: "not-imported", reason: "삼각형 예산을 넘었습니다.", metadata: "skipped" },
    ]);
  });

  it("shows the converter's own refusal as the import error and leaves no result card", async () => {
    const h = harness();
    runtime.plan.mockReturnValue(planOf({ format: "skp", primaryPath: "room.skp" }));
    runtime.convert.mockRejectedValue(new runtime.FakeImportError("skp-timeout", "SketchUp 변환이 제한 시간을 넘겼습니다."));

    await h.actions().importModelFiles([file("room.skp")], RIGHTS);

    expect(h.context.setError).toHaveBeenLastCalledWith("SketchUp 변환이 제한 시간을 넘겼습니다.");
    expect(studioBg3dSkpImportSession.getSnapshot().results).toEqual([]);
    expect(studioBg3dSkpImportSession.getSnapshot().activity).toBeNull();
  });

  it("records only the .skp files of a mixed selection, matched by their position in the plan", async () => {
    const h = harness();
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
      name: id === "skp-model" ? "방" : "소품",
      contentHash: id === "skp-model" ? HASH : `sha256:${"1".repeat(64)}`,
      byteSize: id === "skp-model" ? 2_000 : 10,
    }));

    await h.actions().importModelFiles([file("prop.glb"), file("room.skp")], RIGHTS);

    expect(runtime.persist).toHaveBeenCalledTimes(1);
    expect(runtime.persist.mock.calls[0]?.[0]).toMatchObject({ sourcePath: "room.skp", name: "방", contentHash: HASH });
    expect(studioBg3dSkpImportSession.getSnapshot().results).toHaveLength(1);
  });

  it("does not load or involve the SketchUp wiring for other formats", async () => {
    const h = harness();
    runtime.plan.mockReturnValue(planOf({ format: "glb", primaryPath: "prop.glb" }));

    await h.actions().importModelFiles([file("prop.glb")], RIGHTS);

    const options: unknown = runtime.convert.mock.calls[0]?.[1];
    expect(options).toMatchObject({ skp: undefined });
    expect(runtime.persist).not.toHaveBeenCalled();
    expect(studioBg3dSkpImportSession.getSnapshot().results).toEqual([]);
  });

  it("publishes nothing when the editing session went away during the import", async () => {
    const h = harness();
    runtime.plan.mockReturnValue(planOf({ format: "skp", primaryPath: "room.skp" }));
    runtime.convert.mockImplementation(async (_files: unknown, options: { skp?: StudioBg3dSkpImportOptions }) => {
      options.skp?.onReport?.({ sourcePath: "room.skp", sourceName: "room.skp", report: createSkpReportFixture() });
      h.context.isModalAssetSessionCurrent.mockReturnValue(false);
      return [new Blob([new Uint8Array([1])])];
    });

    const committed = await h.actions().importModelFiles([file("room.skp")], RIGHTS);

    expect(committed).toBe(false);
    expect(runtime.persist).not.toHaveBeenCalled();
    expect(studioBg3dSkpImportSession.getSnapshot().results).toEqual([]);
    expect(studioBg3dSkpImportSession.getSnapshot().activity).toBeNull();
  });
});
