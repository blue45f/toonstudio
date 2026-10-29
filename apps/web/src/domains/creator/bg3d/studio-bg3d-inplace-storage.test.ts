import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareStudioBg3dInplaceDerivative } from "./studio-bg3d-inplace-storage";
import { createStudioBg3dInplaceToolsBridge, readStudioBg3dInplaceSelection } from "./useStudioBg3dInplaceTools";
import { digestScene3dBytes } from "../scene3d/integration/scene3d-inplace-controller";
import { fingerprintStudioBg3dModelSourceRestriction, inheritStudioBg3dModelSourceRestriction, readStudioBg3dEffectiveModelSourceRestriction } from "./studio-bg3d-model-source-restriction";
import type { StudioBg3dModelSourceRestrictionV1 } from "./studio-bg3d-model-source-restriction";
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
import { hydrateStudioBg3dDocumentToRuntime, tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import type { StudioBg3dHistoryCommandRefs } from "./studio-bg3d-history-command-adapter";
import type { StudioBg3dInplaceToolsContext } from "./studio-bg3d-inplace-tools-context";
import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { SpecialistArtifact } from "../scene3d/specialists/specialist-contract";
import type { StudioBg3dKtx2Renderer } from "./studio-bg3d-ktx2-renderer-runtime";
import type { StudioBg3dResolvedDeviceQuality } from "./studio-bg3d-device-quality";

const seam = vi.hoisted(() => ({
  save: vi.fn(),
  get: vi.fn(),
  compensate: vi.fn(),
  admit: vi.fn(),
  mutation: vi.fn(),
  readSource: vi.fn<typeof import("./bg3d-model-library").readStudioBg3dModelSourceSnapshotV12>(),
}));
vi.mock("./bg3d-model-library", async (original) => ({
  ...(await original<typeof import("./bg3d-model-library")>()),
  readStudioBg3dModelSourceSnapshotV12: seam.readSource,
}));
vi.mock("./studio-bg3d-model-library-loader", () => ({
  getStoredBg3dModelV12: seam.get,
  loadStudioBg3dModelLibraryModule: async () => ({
    importVerifiedBg3dModelsAtomicallyWithDispositionV12: seam.save,
    getStoredBg3dModelV12: seam.get,
    compensateImportedBg3dModelsIfCreationMatchesV12: seam.compensate,
    createStudioBg3dModelAttachment: (record: Bg3dVerifiedStoredRecord) => ({
      id: `attachment-${crypto.randomUUID()}`,
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
  return {
    id,
    contentHash: hash,
    byteSize: 32,
    mime: "model/gltf-binary",
    name: id === "storage-original" ? "source.glb" : "derivative.glb",
    blob: new Blob([new Uint8Array(32)]),
    rights: {
      status: "public-domain",
      commercialUse: true,
      attributionRequired: false,
      attribution: "",
      licenseName: "CC0-1.0",
    },
  } as Bg3dVerifiedStoredRecord;
}
function entry(
  rec: Bg3dVerifiedStoredRecord,
  rootScale: number,
): StudioBg3dModelRootCacheEntry {
  const root = new THREE.Group();
  root.scale.setScalar(rootScale);
  return {
    record: rec,
    root,
    dispose: vi.fn(),
    animations: [],
    metrics: {
      nodes: 1,
      triangles: 12,
      drawCalls: 1,
      materials: 1,
      lights: 0,
      animations: 0,
      animationChannels: 0,
      animationKeyframes: 0,
      animationValues: 0,
      skins: 0,
      joints: 0,
      morphTargets: 0,
      accessorElements: 36,
      estimatedDecodedGeometryBytes: 512,
      textures: 0,
      textureBytes: 0,
      maxTextureDimension: 0,
    },
  } as unknown as StudioBg3dModelRootCacheEntry;
}
function fixture(sourceRestriction?: StudioBg3dModelSourceRestrictionV1) {
  const original = { ...record("storage-original", sourceHash), ...(sourceRestriction ? { sourceRestriction } : {}) };
  const derivative = record("storage-derived", outputHash);
  const stored = new Map([[original.id, original], [derivative.id, derivative]]);
  seam.readSource.mockImplementation(async (id) => {
    const actual = stored.get(id);
    return actual ? { record: actual, sourceKind: "local-library", manifestRevision: 1, catalogIdentity: null } : null;
  });
  const sourceEntry = entry(original, 1);
  const derivedEntry = entry(derivative, 0.25);
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
    renderer: {} as StudioBg3dKtx2Renderer,
    quality: {
      profile: "desktop",
      shadows: true,
      textureScale: 1,
    } as StudioBg3dResolvedDeviceQuality,
    cache: new Map([[original.id, sourceEntry]]),
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
    args.cache.set(derivative.id, derivedEntry);
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
    stored,
  };
}
beforeEach(() => vi.clearAllMocks());
describe("existing BG3D storage/history derivative bridge", () => {
  it("service-only 출처도 가공·적용하되 실제 제한 receipt를 파생 저장에 넘긴다", async () => {
    const f = fixture({ version: 1, modelFileExport: "service-only", origin: null, parent: null });
    const prepared = await f.prepare();
    expect(seam.save).toHaveBeenCalledWith([expect.objectContaining({ sourceReceipt: {
      sourceRecordId: f.original.id, sourceContentHash: sourceHash,
      sourceRestrictionFingerprint: fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(f.original)),
    } })], expect.anything());
    expect(seam.save.mock.calls[0]?.[0]?.[0]?.ingress).toBeUndefined();
    await prepared.commit();
    expect(f.context.live.current.customModels[0]?.modelId).toBe(f.derivative.id);
    expect(f.sourceEntry.dispose).not.toHaveBeenCalled();
  });
  it("파생 준비 뒤 실제 원본 제한이 바뀌면 정본·history 변경 없이 정확히 보상한다", async () => {
    const f = fixture(); const prepared = await f.prepare();
    f.stored.set(f.original.id, { ...f.original,
      sourceRestriction: { version: 1, modelFileExport: "service-only", origin: null, parent: null } });
    await expect(prepared.commit()).rejects.toMatchObject({ code: "source-changed" });
    await prepared.rollback();
    expect(f.history.historyCommandTimelineRef.current).toBeNull();
    expect(f.context.live.current.customModels[0]?.modelId).toBe(f.original.id);
    expect(seam.compensate).toHaveBeenCalledExactlyOnceWith(f.disposition);
  });
  it("장면 저장·복원 뒤 파생본을 다시 가공해도 durable 출처와 직접 부모를 이어받는다", async () => {
    const f = fixture({ version: 1, modelFileExport: "service-only",
      origin: { kind: "bundle-pack", recordId: "bundle-original", sha256: sourceHash }, parent: null });
    const derivativeB = { ...f.derivative, sourceRestriction: inheritStudioBg3dModelSourceRestriction(f.original) };
    const derivativeC: Bg3dVerifiedStoredRecord = { ...f.derivative, id: "storage-third", contentHash: `sha256:${"c".repeat(64)}`,
      sourceRestriction: inheritStudioBg3dModelSourceRestriction(derivativeB) };
    const stage = (record: Bg3dVerifiedStoredRecord, k: number) => {
      const staged = entry(record, k);
      f.stored.set(record.id, record);
      seam.save.mockResolvedValueOnce({ records: [record], created: [{ id: record.id, contentHash: record.contentHash }], removedDeletions: [] });
      seam.get.mockResolvedValue(record);
      seam.admit.mockImplementationOnce(async (args) => {
        args.cache.set(record.id, staged); args.onCacheEntryCreated(record.id, staged); return staged;
      });
    };
    stage(derivativeB, 0.25);
    const first = await f.prepare(); await first.commit();
    const projected = tryAdaptStudioBg3dRuntimeToDocument({ ...f.context.live.current,
      baseDocument: f.context.live.current.document, attachmentByStorageModelId: f.context.attachments });
    if (!projected.ok) throw new Error("장면을 정본으로 변환하지 못했습니다.");
    const json = serializeStudioBg3dSceneDocument(projected.value.document);
    if (!json) throw new Error("장면을 저장하지 못했습니다.");
    const document = parseStudioBg3dSceneDocument(json);
    if (!document) throw new Error("장면을 복원하지 못했습니다.");
    expect(json).not.toContain("sourceRestriction");
    // 프로젝트는 portable attachment만 보관하고, 재개 후 실제 저장 원본이 제한 권위다.
    const restored = hydrateStudioBg3dDocumentToRuntime({ document, storageModelIdByAttachmentId: f.context.storageIds });
    expect(restored.customModels).toHaveLength(2);
    f.context.live.current = { ...f.context.live.current, document, customModels: restored.customModels, primitives: restored.primitives };
    const selectionB = readStudioBg3dInplaceSelection(f.context);
    const guardB = () => {
      if (readStudioBg3dInplaceSelection(f.context).revisionKey !== selectionB.revisionKey) throw new Error("stale");
    };
    stage(derivativeC, 0.5);
    const second = await prepareStudioBg3dInplaceDerivative(() => f.context, selectionB,
      { ...f.artifact, sha256: derivativeC.contentHash }, "test.second-derivative", guardB);
    await second.commit();
    expect(seam.save.mock.calls[1]?.[0]).toEqual([expect.objectContaining({ sourceReceipt: {
      sourceRecordId: derivativeB.id, sourceContentHash: derivativeB.contentHash,
      sourceRestrictionFingerprint: fingerprintStudioBg3dModelSourceRestriction(derivativeB.sourceRestriction),
    } })]);
    expect(f.context.cache.get(derivativeC.id)?.record.sourceRestriction).toEqual({ version: 1, modelFileExport: "service-only",
      origin: f.original.sourceRestriction?.origin, parent: { recordId: derivativeB.id, sha256: derivativeB.contentHash } });
    expect(f.context.live.current.customModels[0]?.modelId).toBe(derivativeC.id);
    expect(f.context.live.current.customModels[1]?.modelId).toBe(f.original.id);
    expect(f.sourceEntry.dispose).not.toHaveBeenCalled();
  });
  it("적용 직전 파생 row의 제한이 달라지면 캐시 metadata를 허가로 사용하지 않는다", async () => {
    const f = fixture(); const prepared = await f.prepare();
    seam.get.mockResolvedValueOnce({ ...f.derivative,
      sourceRestriction: { version: 1, modelFileExport: "service-only", origin: null, parent: null } });
    await expect(prepared.commit()).rejects.toMatchObject({ code: "persistence" });
    await prepared.rollback();
    expect(f.history.historyCommandTimelineRef.current).toBeNull();
    expect(f.sourceEntry.dispose).not.toHaveBeenCalled();
  });
  it("다른 저장 ID의 캐시는 같은 bytes여도 선택 원본으로 취급하지 않는다", () => {
    const f = fixture(); f.context.cache.set(f.original.id, entry({ ...f.original, id: "different-source" }, 1));
    expect(() => readStudioBg3dInplaceSelection(f.context)).toThrow("원본");
    expect(seam.save).not.toHaveBeenCalled();
  });
  it("stages privately, preserves world scale and shared instances, then supports real Undo/Redo and document round trips", async () => {
    const f = fixture();
    const prepared = await f.prepare();
    expect(f.context.cache.has(f.derivative.id)).toBe(false);
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
    f.context.cache.set(f.derivative.id, f.derivedEntry);
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
  const f = fixture(); const prepared = await f.prepare(); f.context.cache.set(f.derivative.id, entry(f.derivative, 0.25));
  await expect(prepared.rollback()).rejects.toMatchObject({ code: "persistence" }); expect(seam.compensate).not.toHaveBeenCalled();
});

async function captureExportSource(modelFileExport: StudioBg3dModelSourceRestrictionV1["modelFileExport"]) {
  const hash = await digestScene3dBytes(new Uint8Array(32));
  const contentHash = `sha256:${hash.slice(7)}` as const;
  const f = fixture({ version: 1, modelFileExport, origin: modelFileExport === "allowed"
    ? { kind: "user-file", recordId: "storage-original", sha256: contentHash } : null, parent: null });
  const actual: Bg3dVerifiedStoredRecord = { ...f.original, contentHash };
  f.context.cache.set(actual.id, entry(actual, 1)); f.stored.set(actual.id, actual);
  const attachment = f.context.attachments.get(actual.id);
  if (!attachment) throw new Error("원본 첨부가 없습니다.");
  f.context.attachments.set(actual.id, { ...attachment, hash: actual.contentHash });
  seam.get.mockImplementation(async (id: string) => f.stored.get(id) ?? null);
  const bridge = createStudioBg3dInplaceToolsBridge(() => f.context);
  const input = await bridge.captureSelection();
  const guard = bridge.assertSourceFileExportAllowed;
  if (!guard) throw new Error("파일 저장 guard가 없습니다.");
  return { ...f, actual, bridge, input, guard };
}
describe("실제 출처 receipt를 쓰는 선택 원본 파일 저장", () => {
  it.each(["service-only", "unknown"] as const)("%s 원본은 읽고 가공할 수 있지만 raw 파일 허가는 주지 않는다", async (restriction) => {
    const f = await captureExportSource(restriction);
    expect(f.input.source.byteLength).toBe(32);
    await expect(f.guard(f.input)).rejects.toMatchObject({ code: restriction === "service-only" ? "rights-restricted" : "rights-unavailable" });
    expect(f.history.historyCommandTimelineRef.current).toBeNull(); expect(seam.save).not.toHaveBeenCalled();
  });
  it("actual allowed 원본만 허가하며 복사한 binding은 허가 객체로 받지 않는다", async () => {
    const f = await captureExportSource("allowed");
    await expect(f.guard(f.input)).resolves.toBeUndefined();
    await expect(f.guard({ ...f.input })).rejects.toMatchObject({ code: "unavailable" });
    expect(f.context.live.current.customModels[0]?.modelId).toBe(f.actual.id);
  });
  it("읽기 이후 제한 변경·실제 row 삭제·취소를 저장 클릭 시 다시 확인한다", async () => {
    const f = await captureExportSource("allowed");
    f.stored.set(f.actual.id, { ...f.actual,
      sourceRestriction: { version: 1, modelFileExport: "service-only", origin: null, parent: null } });
    await expect(f.guard(f.input)).rejects.toMatchObject({ code: "source-changed" });
    f.stored.delete(f.actual.id);
    await expect(f.guard(f.input)).rejects.toMatchObject({ code: "source-changed" });
    const cancelled = new AbortController(); cancelled.abort();
    await expect(f.guard(f.input, cancelled.signal)).rejects.toMatchObject({ code: "cancelled" });
    expect(f.history.historyCommandTimelineRef.current).toBeNull();
  });
});
