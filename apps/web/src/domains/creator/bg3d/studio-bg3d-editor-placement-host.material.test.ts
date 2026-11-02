import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { attachStudioBg3dEditorPlacementHost } from "./studio-bg3d-editor-placement-host";
import { createStudioBg3dCacheTestEntry, createStudioBg3dCacheTestRecord } from "./studio-bg3d-model-cache.test-fixture";
import { studioBg3dModelCacheKey } from "./studio-bg3d-model-material-variant";
import { createStudioBg3dPlacementSession, transitionStudioBg3dPlacementSession } from "./studio-bg3d-placement-session";
import type { admitAndCacheStudioBg3dModel, StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";

type ReadMetadata = typeof import("./studio-bg3d-asset-metadata-store").getStudioBg3dAssetMetadata;
const readMetadata = vi.hoisted(() => vi.fn<ReadMetadata>());
vi.mock("./studio-bg3d-asset-metadata-store", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-bg3d-asset-metadata-store")>(),
  getStudioBg3dAssetMetadata: readMetadata,
}));
vi.mock("./studio-bg3d-editor-runtime-bindings", async () => ({ ...await import("./studio-bg3d-model-material-variant") }));
beforeEach(() => { readMetadata.mockReset().mockResolvedValue(null); });

type Admission = Parameters<typeof admitAndCacheStudioBg3dModel>[0];
type ResolveModelHash = typeof import("./studio-bg3d-model-library-loader").resolveBg3dModelHashV12;
interface Lease { readonly signal: AbortSignal; isCurrent(): boolean; throwIfRevoked(): void }
interface Host extends Record<string, unknown> {
  isMaterialBackendCurrent: () => boolean;
  ensureModelRootCached?: (id: string, session: unknown, current: () => boolean, signal: AbortSignal) => Promise<unknown>;
  addCustomModelToScene?: (id: string) => Promise<void>;
  applyUserTemplate?: (entry: unknown) => Promise<void>;
}
function harness() {
  const record = createStudioBg3dCacheTestRecord("model"), cache = new Map<string, StudioBg3dModelRootCacheEntry>();
  const webgl = createStudioBg3dCacheTestEntry(record), webgpu = createStudioBg3dCacheTestEntry(record, "webgpu");
  const box = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial(); webgpu.root.add(new THREE.Mesh(box, material));
  cache.set(studioBg3dModelCacheKey(record.id, "webgl"), webgl); cache.set(studioBg3dModelCacheKey(record.id, "webgpu"), webgpu);
  let backendCurrent = true; let beforeCommit: (() => void) | undefined;
  const replacement = vi.fn(), preview = vi.fn(), bind = vi.fn(() => true);
  const admit = vi.fn<(args: Admission) => Promise<StudioBg3dModelRootCacheEntry>>(async (args) => {
    if (!args.isActive()) throw new Error("stale");
    args.onCacheEntryCreated?.(record.id, webgpu); return webgpu;
  });
  const coordinator = {
    runSceneMutation: async (_session: unknown, work: (lease: Lease) => Promise<unknown>, commit: (value: unknown) => void) => {
      const prepared = await work({ signal: new AbortController().signal, isCurrent: () => true, throwIfRevoked: () => undefined });
      beforeCommit?.(); commit(prepared); return { status: "committed" };
    },
    commitIfCurrent: (_session: unknown, commit: () => void) => { commit(); return true; },
  };
  class Stale extends Error {}
  const h: Host = {
    THREE, materialBackend: "webgpu", engineRuntime: { plan: { backend: "webgpu" } }, isMaterialBackendCurrent: () => backendCurrent,
    modelRenderer: null, getStoredBg3dModel: vi.fn(async () => record), getStoredBg3dModelByHash: vi.fn(async () => record),
    resolveBg3dModelHash: vi.fn<ResolveModelHash>(async () => ({ record, deletionReceipt: null })),
    modelRootCacheRef: { current: cache }, modelLoadPendingRef: { current: new Map() },
    attachmentByStorageModelIdRef: { current: new Map() }, storageModelIdByAttachmentIdRef: { current: new Map() },
    genericModelSourceFormats: new Map(), genericModelClassifications: new Map(),
    createStudioBg3dModelAttachment: async () => ({ id: "attachment", hash: record.contentHash }),
    withStudioGeneric3dWorkflowMetadata: (attachment: unknown) => attachment,
    normalizeStudioGeneric3dSourceFormat: () => "glb", normalizeStudioGeneric3dClassification: () => null,
    parseStudioGeneric3dWorkflowMetadata: () => null, mergeStudioGeneric3dWorkflowMaps: () => new Map(),
    physicsRuntimeSourceRef: { current: { primitives: [], customModels: [], document: { budgets: { complexity: { maxModelBytes: 1e8 } } } } },
    sceneBaseDocument: { budgets: { complexity: { maxNodes: 100, maxModelBytes: 1e8 } } },
    viewportHostRef: { current: null }, viewportApiRef: { current: null }, modalAssetSessionRef: { current: {} },
    calculateStudioBg3dPlacedModelBytes: () => 0, assertStudioBg3dModelAttachmentAdmission: () => undefined,
    STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS: 100, STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES: 100,
    resolveDeviceQuality: () => ({}), admitAndCacheModel: admit, bindModelAttachment: bind,
    isModalAssetSessionCurrent: () => true, studioBg3dModalOperationCoordinator: coordinator,
    StudioBg3dStaleModalOperationError: Stale, StudioBg3dThreeOperationError: Stale, StudioBg3dModelPlacementAdmissionError: Stale,
    isStudioBg3dPhysicsTransientPhase: () => false, physicsPhaseRef: { current: "idle" },
    canAdmitSceneNodes: () => true, applyingTemplateId: null, deletingModelId: null, captureInFlightRef: { current: false },
    placementSessionRef: { current: createStudioBg3dPlacementSession() }, placementTokenSequenceRef: { current: 0 },
    createStudioBg3dPlacementSession, transitionStudioBg3dPlacementSession,
    surfaceSnapArmedRef: { current: false }, setPlacementSession: vi.fn(), setPlacementPreviewAsset: preview,
    setSurfaceSnapStatus: vi.fn(), setSelectedIds: vi.fn(), setRefTick: vi.fn(), setError: vi.fn(), setApplyingTemplateId: vi.fn(),
    setGenericModelSourceFormats: vi.fn(), replaceCanonicalDocumentState: replacement,
    allocateStudioBg3dTemplateInstanceNodeIds: () => ({ nodeIds: ["placed"] }), generateId: () => "seed",
    instantiateBg3dTemplateDocument: async (document: unknown) => ({ document }), attachmentMatchesRecord: () => true,
    hydrateStudioBg3dDocumentToRuntime: () => ({ ok: true, diagnostics: [], omittedDiagnosticCount: 0, counts: { inputPrimitives: 0, inputCustomModels: 1, emittedPrimitives: 0, emittedCustomModels: 1, droppedPrimitives: 0, droppedCustomModels: 0 },
      primitives: [], customModels: [{ id: "placed", modelId: record.id }] }),
    orderStudioBg3dHierarchySelectionRootsFirst: () => ["placed"],
  };
  attachStudioBg3dEditorPlacementHost(h);
  return { h, record, cache, webgl, webgpu, admit, replacement, preview, bind,
    changeBackend: () => { backendCurrent = false; h.isMaterialBackendCurrent = () => true; },
    beforeCommit: (callback: () => void) => { beforeCommit = callback; },
    dispose: () => { box.dispose(); material.dispose(); } };
}

describe("실제 배치·템플릿 호스트의 material backend fence", () => {
  it("선택한 WebGPU variant의 실제 geometry로 배치 미리보기를 만들고 요청 backend를 전달한다", async () => {
    const value = harness();
    try {
      await value.h.addCustomModelToScene?.(value.record.id);
      expect(value.admit).toHaveBeenCalledOnce(); expect(value.admit.mock.calls[0]?.[0].materialBackend).toBe("webgpu");
      expect(readMetadata).toHaveBeenCalledWith(value.record.contentHash);
      expect(value.preview).toHaveBeenCalledWith(expect.objectContaining({ modelId: value.record.id, size: [1, 1, 1] }));
    } finally { value.dispose(); }
  });
  it("parse 대기 중 backend가 바뀌면 이전 callback을 바꿔도 원본 첨부를 bind하지 않는다", async () => {
    const value = harness();
    value.admit.mockImplementationOnce(async () => { value.changeBackend(); return value.webgpu; });
    try {
      await expect(value.h.ensureModelRootCached?.(value.record.id, {}, () => true, new AbortController().signal)).rejects.toThrow();
      expect(value.bind).not.toHaveBeenCalled();
    } finally { value.dispose(); }
  });
  it("메타데이터 대기 중 원래 backend 권위가 폐기되면 새 true 함수로 바뀌어도 첨부나 미리보기를 공개하지 않는다", async () => {
    const value = harness(), capturedGuard = value.h.isMaterialBackendCurrent;
    let releaseMetadata: (metadata: Awaited<ReturnType<ReadMetadata>>) => void = () => { throw new Error("메타데이터 대기를 준비하지 못했습니다."); };
    let markMetadataStarted: () => void = () => { throw new Error("메타데이터 조회 시작을 준비하지 못했습니다."); };
    const metadataPending = new Promise<Awaited<ReturnType<ReadMetadata>>>((resolve) => { releaseMetadata = resolve; });
    const metadataStarted = new Promise<void>((resolve) => { markMetadataStarted = resolve; });
    readMetadata.mockImplementationOnce(() => { markMetadataStarted(); return metadataPending; });
    const pending = value.h.addCustomModelToScene?.(value.record.id);
    try {
      await metadataStarted;
      expect(value.admit).toHaveBeenCalledOnce(); expect(readMetadata).toHaveBeenCalledWith(value.record.contentHash);
      value.changeBackend();
      expect(capturedGuard()).toBe(false); expect(value.h.isMaterialBackendCurrent()).toBe(true);
      releaseMetadata(null); await pending;
      expect(value.bind).not.toHaveBeenCalled(); expect(value.preview).not.toHaveBeenCalled();
      expect(value.replacement).not.toHaveBeenCalled(); expect(value.h.setGenericModelSourceFormats).not.toHaveBeenCalled();
    } finally { releaseMetadata(null); await pending; value.dispose(); }
  });
  it("cache 준비 뒤 commit 직전 renderer가 바뀌면 배치 미리보기를 공개하지 않는다", async () => {
    const value = harness(); value.beforeCommit(value.changeBackend);
    try { await value.h.addCustomModelToScene?.(value.record.id); expect(value.preview).not.toHaveBeenCalled(); }
    finally { value.dispose(); }
  });
  it("템플릿 rollback은 소유 WebGPU entry만 dispose한 뒤 삭제하고 다른 variant를 유지한다", async () => {
    const value = harness(), beforeCommit = vi.fn(value.changeBackend); value.beforeCommit(beforeCommit);
    try {
      await value.h.applyUserTemplate?.({ id: "template", document: { nodes: [{ kind: "custom-model" }], attachments: [{ hash: value.record.contentHash, byteSize: 32 }] } });
      expect(beforeCommit).toHaveBeenCalledOnce();
      expect(value.admit.mock.calls[0]?.[0].materialBackend).toBe("webgpu"); expect(value.replacement).not.toHaveBeenCalled();
      expect(value.webgpu.dispose).toHaveBeenCalledOnce(); expect(value.webgl.dispose).not.toHaveBeenCalled();
      expect(value.cache.get(studioBg3dModelCacheKey(value.record.id, "webgpu"))).toBeUndefined();
      expect(value.cache.get(studioBg3dModelCacheKey(value.record.id, "webgl"))).toBe(value.webgl);
    } finally { value.dispose(); }
  });
  it("rollback dispose가 실패하면 소유 entry를 먼저 삭제하지 않는다", async () => {
    const value = harness(), beforeCommit = vi.fn(value.changeBackend); value.beforeCommit(beforeCommit); vi.mocked(value.webgpu.dispose).mockImplementation(() => { throw new Error("dispose failed"); });
    try {
      await expect(value.h.applyUserTemplate?.({ id: "template", document: { nodes: [{ kind: "custom-model" }], attachments: [{ hash: value.record.contentHash, byteSize: 32 }] } })).rejects.toThrow(/dispose failed/u);
      expect(beforeCommit).toHaveBeenCalledOnce();
      expect(value.cache.get(studioBg3dModelCacheKey(value.record.id, "webgpu"))).toBe(value.webgpu);
    } finally { value.dispose(); }
  });
});
