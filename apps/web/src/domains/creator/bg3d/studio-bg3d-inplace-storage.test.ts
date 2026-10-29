import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareStudioBg3dInplaceDerivative } from "./studio-bg3d-inplace-storage";
import { readStudioBg3dInplaceSelection } from "./useStudioBg3dInplaceTools";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import {
  commitStudioBg3dHistoryTransition,
  stepStudioBg3dCommandHistory,
} from "./studio-bg3d-history-command-adapter";
import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import type { StudioBg3dHistoryCommandRefs } from "./studio-bg3d-history-command-adapter";
import type { StudioBg3dInplaceToolsContext } from "./studio-bg3d-inplace-tools-context";
import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { SpecialistArtifact } from "../scene3d/specialists/specialist-contract";
import type { StudioBg3dKtx2Renderer } from "./studio-bg3d-ktx2-renderer-runtime";
import type { StudioBg3dResolvedDeviceQuality } from "./studio-bg3d-device-quality";
import { createStudioBg3dCacheTestEntry, createStudioBg3dCacheTestRecord } from "./studio-bg3d-model-cache.test-fixture";
import { studioBg3dModelCacheKey, type StudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";

const seam = vi.hoisted(() => ({
  save: vi.fn(),
  get: vi.fn(),
  compensate: vi.fn(),
  admit: vi.fn(),
  mutation: vi.fn(),
}));
vi.mock("./studio-bg3d-model-library-loader", () => ({
  loadStudioBg3dModelLibraryModule: async () => ({
    importVerifiedBg3dModelsAtomicallyWithDispositionV12: seam.save,
    getStoredBg3dModelV12: seam.get,
    compensateImportedBg3dModelsIfCreationMatchesV12: seam.compensate,
    createStudioBg3dModelAttachment: (record: Bg3dVerifiedStoredRecord) => ({
      id: "attachment-derived",
      name: record.name,
      hash: record.contentHash,
      byteSize: record.byteSize,
      mime: record.mime,
      rights: record.rights,
      source: "local-library",
    }),
  }),
}));
vi.mock("./studio-bg3d-model-runtime-admission", async (original) => ({
  ...(await original<object>()),
  admitAndCacheStudioBg3dModel: seam.admit,
}));
vi.mock("./studio-bg3d-modal-operation-coordinator", () => ({
  studioBg3dModalOperationCoordinator: { runSceneMutation: seam.mutation },
}));
const sourceHash = `sha256:${"a".repeat(64)}` as const;
const outputHash = `sha256:${"b".repeat(64)}` as const;
function record(id: string, hash: string): Bg3dVerifiedStoredRecord {
  return { ...createStudioBg3dCacheTestRecord(id, hash), name: id === "storage-original" ? "source.glb" : "derivative.glb" };
}
function entry(
  rec: Bg3dVerifiedStoredRecord,
  rootScale: number,
  backend: StudioBg3dMaterialBackend = "webgl",
): StudioBg3dModelRootCacheEntry {
  const result = createStudioBg3dCacheTestEntry(rec, backend);
  result.root.scale.setScalar(rootScale);
  return result;
}
function fixture(backend: StudioBg3dMaterialBackend = "webgl") {
  const original = record("storage-original", sourceHash);
  const derivative = record("storage-derived", outputHash);
  const sourceEntry = entry(original, 1, backend);
  const derivedEntry = entry(derivative, 0.25, backend);
  const sourceKey = studioBg3dModelCacheKey(original.id, backend), derivedKey = studioBg3dModelCacheKey(derivative.id, backend);
  const history: StudioBg3dHistoryCommandRefs = {
    historyRef: { current: [] },
    historyIndexRef: { current: -1 },
    historyCommandTimelineRef: { current: null },
  };
  const model = {
    id: "model-one",
    modelId: original.id,
    position: [2, 3, 4] as [number, number, number],
    rotation: [0, 0.2, 0] as [number, number, number],
    scale: [2, 2, 2] as [number, number, number],
    name: "selected",
    visible: true,
  };
  const context: StudioBg3dInplaceToolsContext = {
    live: {
      current: {
        revision: 0,
        document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
        primitives: [],
        customModels: [
          model,
          { ...model, id: "shared-two", name: "unselected" },
        ],
      },
    },
    selectedIds: new Set([model.id]),
    session: { epoch: 1 },
    ready: true,
    renderer: { [backend === "webgpu" ? "isWebGPURenderer" : "isWebGLRenderer"]: true } as StudioBg3dKtx2Renderer,
    materialBackend: backend,
    quality: {
      profile: "desktop",
      shadows: true,
      textureScale: 1,
    } as StudioBg3dResolvedDeviceQuality,
    cache: new Map([[sourceKey, sourceEntry]]),
    attachments: new Map([
      [
        original.id,
        {
          id: "attachment-original",
          name: original.name,
          hash: original.contentHash,
          byteSize: original.byteSize,
          mime: original.mime,
          rights: original.rights,
          source: "local-library",
        },
      ],
    ]),
    storageIds: new Map([["attachment-original", original.id]]),
    isSessionCurrent: () => true,
    isBlocked: () => false,
    replace: (mutation) =>
      (context.live.current = {
        ...context.live.current,
        ...mutation,
        customModels: mutation.customModels
          ? [...mutation.customModels]
          : context.live.current.customModels,
        primitives: mutation.primitives
          ? [...mutation.primitives]
          : context.live.current.primitives,
        revision: context.live.current.revision + 1,
      }),
    commitHistory: (primitives, customModels, document, before, options) => {
      commitStudioBg3dHistoryTransition(history, {
        before,
        after: createStudioBg3dHistorySnapshot({
          primitives,
          customModels,
          document,
        }),
        ...options,
      });
    },
    notify: vi.fn(),
  };
  const disposition = {
    records: [derivative],
    created: [{ id: derivative.id, contentHash: derivative.contentHash }],
    removedDeletions: [],
  };
  seam.save.mockResolvedValue(disposition);
  seam.get.mockResolvedValue(derivative);
  seam.compensate.mockResolvedValue(true);
  seam.admit.mockImplementation(async (args) => {
    args.cache.set(derivedKey, derivedEntry);
    args.onCacheEntryCreated(derivative.id, derivedEntry);
    return derivedEntry;
  });
  seam.mutation.mockImplementation(async (_session, prepare, commit) => {
    const value = await prepare({
      signal: new AbortController().signal,
      throwIfRevoked() {},
    });
    commit(value);
    return { status: "committed", value };
  });
  const selected = readStudioBg3dInplaceSelection(context);
  const assertCurrent = () => {
    if (
      readStudioBg3dInplaceSelection(context).revisionKey !==
      selected.revisionKey
    )
      throw new Error("stale");
  };
  const artifact: SpecialistArtifact = {
    name: "lod-1.glb",
    mime: "model/gltf-binary",
    bytes: new Uint8Array(32),
    sha256: outputHash,
  };
  const prepare = () =>
    prepareStudioBg3dInplaceDerivative(
      () => context,
      selected,
      artifact,
      "test.apply",
      assertCurrent,
    );
  return {
    context,
    original,
    derivative,
    sourceEntry,
    derivedEntry,
    disposition,
    history,
    selected,
    artifact,
    prepare,
    sourceKey,
    derivedKey,
  };
}
beforeEach(() => vi.clearAllMocks());
describe("existing BG3D storage/history derivative bridge", () => {
  it("stages privately, preserves world scale and shared instances, then supports real Undo/Redo and document round trips", async () => {
    const f = fixture();
    const prepared = await f.prepare();
    expect(f.context.cache.has(f.derivedKey)).toBe(false);
    expect(f.context.live.current.customModels[0]!.modelId).toBe(f.original.id);
    await prepared.commit();
    const models = f.context.live.current.customModels;
    expect(models[0]).toMatchObject({
      id: "model-one",
      modelId: f.derivative.id,
      position: [2, 3, 4],
      rotation: [0, 0.2, 0],
      scale: [8, 8, 8],
    });
    expect(models[1]!.modelId).toBe(f.original.id);
    expect(f.sourceEntry.dispose).not.toHaveBeenCalled();
    expect(
      f.history.historyCommandTimelineRef.current?.readRetainedStates().states,
    ).toHaveLength(2);
    const adapted = tryAdaptStudioBg3dRuntimeToDocument({
      primitives: [],
      customModels: models,
      attachmentByStorageModelId: f.context.attachments,
      baseDocument: f.context.live.current.document,
    });
    expect(adapted.ok).toBe(true);
    if (!adapted.ok) throw new Error("Document projection failed.");
    const saved = serializeStudioBg3dSceneDocument(adapted.value.document)!;
    expect(saved).not.toContain("storage-original");
    expect(saved).not.toContain("storage-derived");
    const reopened = parseStudioBg3dSceneDocument(saved)!;
    expect(reopened.attachments.map((a) => a.hash)).toEqual(
      expect.arrayContaining([sourceHash, outputHash]),
    );
    expect(
      stepStudioBg3dCommandHistory(f.history, "undo")?.state.customModels[0]!
        .modelId,
    ).toBe(f.original.id);
    expect(
      stepStudioBg3dCommandHistory(f.history, "redo")?.state.customModels[0]!
        .modelId,
    ).toBe(f.derivative.id);
    await prepared.rollback();
    expect(f.derivedEntry.dispose).not.toHaveBeenCalled();
    expect(seam.compensate).not.toHaveBeenCalled();
    expect(seam.save).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          expectedSha256: outputHash,
          rights: f.original.rights,
        }),
      ],
      expect.anything(),
    );
  });
  it("compensates the exact import and only destroys private staged resources on failure", async () => {
    const f = fixture();
    const prepared = await f.prepare();
    await prepared.rollback();
    await prepared.rollback();
    expect(seam.compensate).toHaveBeenCalledExactlyOnceWith(f.disposition);
    expect(f.derivedEntry.dispose).toHaveBeenCalledOnce();
    expect(f.sourceEntry.dispose).not.toHaveBeenCalled();
    expect(f.context.live.current.customModels[0]!.modelId).toBe(f.original.id);
    expect(f.history.historyCommandTimelineRef.current).toBeNull();
  });
  it("does not dispose a reused global cache entry during compensation", async () => {
    const f = fixture();
    f.context.cache.set(f.derivedKey, f.derivedEntry);
    seam.admit.mockImplementationOnce(async () => f.derivedEntry);
    seam.save.mockResolvedValueOnce({ ...f.disposition, created: [] });
    const prepared = await f.prepare();
    await prepared.rollback();
    expect(f.derivedEntry.dispose).not.toHaveBeenCalled();
  });
  it("refuses a deleted/replaced durable derivative immediately before canonical commit", async () => {
    const f = fixture();
    const prepared = await f.prepare();
    seam.get.mockResolvedValueOnce(null);
    await expect(prepared.commit()).rejects.toMatchObject({
      code: "persistence",
    });
    await prepared.rollback();
    expect(f.context.live.current.customModels[0]!.modelId).toBe(f.original.id);
    expect(f.history.historyCommandTimelineRef.current).toBeNull();
  });
  it("does not flatten or unlock an edited/locked model", () => {
    const f = fixture();
    f.context.live.current.customModels[0]!.locked = true;
    expect(() => readStudioBg3dInplaceSelection(f.context)).toThrow("잠겨");
    f.context.live.current.customModels[0]!.locked = false;
    f.context.live.current.customModels[0]!.pose = { enabled: true, weight: 1, joints: [] };
    expect(() => readStudioBg3dInplaceSelection(f.context)).toThrow(
      "개별 재질",
    );
  });
  it("does not erase the source on storage or model-admission failure", async () => {
    const f = fixture();
    seam.admit.mockRejectedValueOnce(new Error("GPU admission failed"));
    await expect(f.prepare()).rejects.toThrow("GPU admission failed");
    expect(seam.compensate).toHaveBeenCalledExactlyOnceWith(f.disposition);
    expect(f.sourceEntry.dispose).not.toHaveBeenCalled();
  });
});

it("rejects child-bearing parents and locked ancestry without changing source bindings", () => {
  const f = fixture();
  const child = f.context.live.current.customModels[1]!;
  child.parentId = "model-one";
  expect(() => readStudioBg3dInplaceSelection(f.context)).toThrow("자식 객체");
  child.parentId = null;
  f.context.live.current.customModels[0]!.parentId = child.id;
  child.locked = true;
  expect(() => readStudioBg3dInplaceSelection(f.context)).toThrow("잠겨");
  expect(f.history.historyCommandTimelineRef.current).toBeNull();
});
it("runs exact compensation even when a temporary renderer resource throws during disposal", async () => {
  const f = fixture();
  const prepared = await f.prepare();
  vi.mocked(f.derivedEntry.dispose).mockImplementationOnce(() => {
    throw new Error("listener failed");
  });
  await expect(prepared.rollback()).rejects.toMatchObject({
    code: "persistence",
  });
  expect(seam.compensate).toHaveBeenCalledExactlyOnceWith(f.disposition);
  expect(f.sourceEntry.dispose).not.toHaveBeenCalled();
});


it("retains newly durable bytes after a session change instead of deleting potential new-scene references", async () => {
  const f = fixture(); const prepared = await f.prepare(); f.context.isSessionCurrent = () => false;
  await expect(prepared.rollback()).rejects.toMatchObject({ code: "persistence" });
  expect(seam.compensate).not.toHaveBeenCalled(); expect(f.derivedEntry.dispose).toHaveBeenCalledOnce(); expect(f.sourceEntry.dispose).not.toHaveBeenCalled();
});
it("does not compensate a newly imported row adopted by another cache owner", async () => {
  const f = fixture(); const prepared = await f.prepare(); f.context.cache.set(f.derivedKey, entry(f.derivative, 0.25));
  await expect(prepared.rollback()).rejects.toMatchObject({ code: "persistence" }); expect(seam.compensate).not.toHaveBeenCalled();
});

it("WebGPU 선택·승격은 해당 variant만 사용하고 DB·장면 모델 ID를 바꾸지 않는다", async () => {
  const f = fixture("webgpu"), glSource = entry(f.original, 99), glDerived = entry(f.derivative, 99);
  f.context.cache.set(studioBg3dModelCacheKey(f.original.id, "webgl"), glSource);
  f.context.cache.set(studioBg3dModelCacheKey(f.derivative.id, "webgl"), glDerived);
  expect(readStudioBg3dInplaceSelection(f.context).sourceOwner).toBe(f.sourceEntry);
  const prepared = await f.prepare(); await prepared.commit();
  expect(seam.admit).toHaveBeenCalledWith(expect.objectContaining({ materialBackend: "webgpu" }));
  expect(f.context.cache.get(f.derivedKey)).toBe(f.derivedEntry);
  expect(f.context.cache.get(studioBg3dModelCacheKey(f.derivative.id, "webgl"))).toBe(glDerived);
  expect(f.context.live.current.customModels[0]).toMatchObject({ modelId: f.derivative.id, scale: [8, 8, 8] });
  expect(f.context.storageIds.get("attachment-derived")).toBe(f.derivative.id);
  expect(f.context.cache.has(f.derivative.id)).toBe(false); expect(glSource.dispose).not.toHaveBeenCalled(); expect(glDerived.dispose).not.toHaveBeenCalled();
});

it.each(["backend", "renderer", "lease"] as const)("준비 후 %s 변경이면 canonical/history/cache 승격 없이 private 결과를 정리한다", async (boundary) => {
  const f = fixture(); let runtimeCurrent = true;
  Object.assign(f.context, { isMaterialBackendCurrent: () => runtimeCurrent });
  const prepared = await f.prepare();
  if (boundary === "backend") {
    const gpuSource = entry(f.original, 1, "webgpu");
    f.context.cache.set(studioBg3dModelCacheKey(f.original.id, "webgpu"), gpuSource);
    Object.assign(f.context, { materialBackend: "webgpu", renderer: { isWebGPURenderer: true } });
  } else if (boundary === "renderer") Object.assign(f.context, { renderer: { isWebGLRenderer: true } });
  else runtimeCurrent = false;
  await expect(prepared.commit()).rejects.toThrow(); await prepared.rollback();
  expect(f.context.live.current.customModels[0]?.modelId).toBe(f.original.id);
  expect(f.history.historyCommandTimelineRef.current).toBeNull(); expect(f.context.cache.has(f.derivedKey)).toBe(false);
  expect(f.sourceEntry.dispose).not.toHaveBeenCalled(); expect(f.derivedEntry.dispose).toHaveBeenCalledOnce();
});

it("다른 backend가 채택한 durable 원본은 compensation으로 삭제하지 않는다", async () => {
  const f = fixture(), prepared = await f.prepare(), adopted = entry(f.derivative, 1, "webgpu");
  f.context.cache.set(studioBg3dModelCacheKey(f.derivative.id, "webgpu"), adopted);
  await expect(prepared.rollback()).rejects.toMatchObject({ code: "persistence" });
  expect(seam.compensate).not.toHaveBeenCalled(); expect(adopted.dispose).not.toHaveBeenCalled(); expect(f.derivedEntry.dispose).toHaveBeenCalledOnce();
});

it("다른 backend 또는 raw storage ID만 있으면 선택 원본으로 fallback하지 않는다", () => {
  const f = fixture(); f.context.cache.clear();
  f.context.cache.set(f.original.id, f.sourceEntry);
  f.context.cache.set(studioBg3dModelCacheKey(f.original.id, "webgpu"), entry(f.original, 1, "webgpu"));
  expect(() => readStudioBg3dInplaceSelection(f.context)).toThrow("먼저 불러와야");
});
