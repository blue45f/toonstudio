import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openStudioLocalDatabase, type StudioLocalDatabase } from "../studio-local-database";
import { createStudioOpfsAssetStore } from "../studio-opfs-asset-store";
import { createStudioOpfsMemoryFileSystem } from "../studio-opfs-filesystem";
import { createBgCustomModelInstance, StudioBg3dThreeOperationError, type BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import {
  createStudioBg3dModelAttachment,
  getStoredBg3dModelV12,
  importVerifiedBg3dModelsAtomicallyV12,
  type Bg3dVerifiedStoredRecord,
} from "./bg3d-model-library";
import { instantiateBg3dTemplateDocument, type Bg3dTemplateLibraryEntry } from "./bg3d-template-library";
import { bindConsumerReleaseFixture, consumerReleaseFixture, isConsumerCatalogUrl } from "./studio-bg3d-bundle-release-consumer.test-fixture";
import { findStudioBg3dBundleAssetByHash, loadStudioBg3dBundleThemePacks, resetStudioBg3dBundleThemePacksCache } from "./studio-bg3d-bundle-theme-packs";
import { resolveStudioBg3dDeviceQuality } from "./studio-bg3d-device-quality";
import { attachStudioBg3dEditorPlacementHost } from "./studio-bg3d-editor-placement-host";
import { disposeSharedStudioBg3dValidationWorker } from "./studio-bg3d-glb-validation-worker-client";
import { StudioBg3dValidationWorkerTestFixture } from "./studio-bg3d-glb-validation-worker.test-fixture";
import { createStudioBg3dLibrariesAuthority, type StudioBg3dLibrariesAuthority } from "./studio-bg3d-libraries-sqlite-opfs-authority";
import { studioBg3dModalOperationCoordinator, StudioBg3dStaleModalOperationError, type StudioBg3dModalSession } from "./studio-bg3d-modal-operation-coordinator";
import { getStoredBg3dModelByHashV12, resolveBg3dModelHashV12 } from "./studio-bg3d-model-library-loader";
import { studioBg3dModelCacheKey } from "./studio-bg3d-model-material-variant";
import { assertStudioBg3dModelAttachmentAdmission, calculateStudioBg3dPlacedModelBytes, StudioBg3dModelPlacementAdmissionError } from "./studio-bg3d-model-placement-admission";
import { admitAndCacheStudioBg3dModel, attachmentMatchesRecord, bindModelAttachment, disposeStudioBg3dModelCache, type StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import { isStudioBg3dPhysicsTransientPhase } from "./studio-bg3d-physics-ui";
import { createSceneGlbFixture, disposeSceneGlbFixtures } from "./studio-bg3d-scene-glb.test-fixture";
import { createDefaultStudioBg3dSceneDocument, STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS, STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES, type StudioBg3dModelAttachment, type StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { hydrateStudioBg3dDocumentToRuntime, tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";

const storage = vi.hoisted(
  (): { authority: StudioBg3dLibrariesAuthority | null } => ({ authority: null }),
);
vi.mock("./studio-bg3d-libraries-sqlite-opfs-authority", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-bg3d-libraries-sqlite-opfs-authority")>(),
  getStudioBg3dLibrariesAuthority: () => {
    if (!storage.authority) throw new Error("실제 시험 저장소가 필요합니다.");
    return storage.authority;
  },
}));
vi.mock("./studio-bg3d-editor-runtime-bindings", async () => ({
  ...await import("./studio-bg3d-model-material-variant"),
}));

const databases: StudioLocalDatabase[] = [];
const caches: Map<string, StudioBg3dModelRootCacheEntry>[] = [];

beforeEach(() => {
  resetStudioBg3dBundleThemePacksCache();
  vi.stubGlobal("Worker", StudioBg3dValidationWorkerTestFixture);
});
afterEach(async () => {
  const cleanup = [
    ...caches.splice(0).map((cache) => () => disposeStudioBg3dModelCache(cache)),
    () => disposeSceneGlbFixtures(),
    () => disposeSharedStudioBg3dValidationWorker(),
    ...databases.splice(0).map((database) => () => database.close()),
  ];
  try {
    const results = await Promise.allSettled(cleanup.map((task) => Promise.resolve().then(task)));
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length > 0) {
      throw new AggregateError(failures.map((result) => result.reason), "시험 자원 정리에 실패했습니다.");
    }
  } finally {
    storage.authority = null;
    resetStudioBg3dBundleThemePacksCache();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

async function storedTemplateFixture() {
  const geometry = await createSceneGlbFixture();
  if (!geometry.record) throw new Error("실제 도형을 내보낸 GLB가 필요합니다.");
  const database = await openStudioLocalDatabase({
    vfs: "memory",
    memoryFilename: "template-local-" + crypto.randomUUID() + ".sqlite3",
  });
  databases.push(database);
  const assets = createStudioOpfsAssetStore({ fs: createStudioOpfsMemoryFileSystem(), now: () => 1_000 });
  let tail: Promise<unknown> = Promise.resolve();
  const authority = createStudioBg3dLibrariesAuthority({
    acquireDatabase: async () => database,
    acquireAssetStore: async () => assets,
    allowNonDurableAssetStoreForTests: true,
    now: () => 1_000,
    runExclusive: <T>(task: () => Promise<T>) => {
      const result = tail.then(task, task);
      tail = result.catch(() => undefined);
      return result;
    },
  });
  storage.authority = authority;
  const [imported] = await importVerifiedBg3dModelsAtomicallyV12([{
    file: new File([geometry.record.blob], "template-local.glb", { type: "model/gltf-binary" }),
    rights: geometry.record.rights,
    ingress: { kind: "user-file", modelFileExport: "allowed" },
  }], { authority, executionBackend: "direct", now: 1_000 });
  if (!imported) throw new Error("원자적으로 저장한 모델이 필요합니다.");
  const local = await getStoredBg3dModelV12(imported.id, { authority });
  if (!local) throw new Error("SQLite manifest와 CAS에서 다시 읽은 모델이 필요합니다.");
  const attachment = createStudioBg3dModelAttachment(local);
  const model = createBgCustomModelInstance(local.id, 0);
  const destination = createDefaultStudioBg3dSceneDocument();
  const adapted = tryAdaptStudioBg3dRuntimeToDocument({
    primitives: [],
    customModels: [model],
    baseDocument: destination,
    attachmentByStorageModelId: new Map([[local.id, attachment]]),
  });
  if (!adapted.ok) throw new Error("손실 없는 정본 템플릿이 필요합니다.");
  const entry: Bg3dTemplateLibraryEntry = {
    id: "template-local-regression",
    name: "로컬 원본 복원 회귀",
    createdAt: 1_000,
    document: adapted.value.document,
    commercialUse: attachment.rights.commercialUse,
  };
  return { geometry, local, attachment, model, destination, entry };
}

function rawThemePacks(record: Bg3dVerifiedStoredRecord, assetId: string) {
  return {
    schema: "toonstudio.bg3d-bundle-theme-packs.v1",
    version: 1,
    inServiceOnly: true,
    downloadable: false,
    rights: { holder: "시험 권리자", inServiceOnly: true, downloadable: false },
    assetRoot: "/assets/studio/bundle-v2/",
    themes: [{ id: "city", label: "도시" }],
    packs: [{
      catalogIds: ["cbv1-001-test"],
      title: "동일 해시 번들",
      creator: "시험 제작자",
      theme: "city",
      category: "environment",
      ingestPackIds: ["test-pack"],
      placeable: 1,
      twinCovered: 0,
      deferred: { fbx: 0, gltf: 0, blend: 0, overBudget: {} },
      rights: {
        serve: "allow",
        status: "licensed",
        commercialUse: true,
        attributionRequired: false,
        licenseName: "동일 해시 번들 시험 사용권",
      },
      note: null,
    }],
    assets: [{
      id: assetId,
      pack: 0,
      path: "test-pack/scene.glb",
      bytes: record.byteSize,
      sha256: record.contentHash.slice("sha256:".length),
      tris: record.validatorMetrics.triangles,
    }],
    presets: [],
    crowdPacks: [],
    pendingPacks: [],
    totals: { packs: 1, placeableAssets: 1, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 },
  };
}

interface TemplateHost extends Record<string, unknown> {
  applyUserTemplate?: (entry: Bg3dTemplateLibraryEntry) => Promise<void>;
}
function templateHost(value: Awaited<ReturnType<typeof storedTemplateFixture>>) {
  const current: {
    primitives: BgPrimitive[];
    customModels: BgCustomModelInstance[];
    document: StudioBg3dSceneDocument;
  } = { primitives: [], customModels: [], document: value.destination };
  const cache = new Map<string, StudioBg3dModelRootCacheEntry>();
  caches.push(cache);
  const pending = new Map<string, Promise<StudioBg3dModelRootCacheEntry>>();
  const attachments = new Map<string, StudioBg3dModelAttachment>();
  const reverse = new Map<string, string>();
  const replacement = vi.fn<(next: Pick<typeof current, "primitives" | "customModels">) => void>(
    (next) => { Object.assign(current, next); },
  );
  const setError = vi.fn<(message: string | null) => void>();
  const instantiate = vi.fn(instantiateBg3dTemplateDocument);
  const match = vi.fn(attachmentMatchesRecord);
  const admit = vi.fn(admitAndCacheStudioBg3dModel);
  const bind = vi.fn(bindModelAttachment);
  const hydrate = vi.fn(hydrateStudioBg3dDocumentToRuntime);
  const resolve = vi.fn(resolveBg3dModelHashV12);
  const h: TemplateHost = {
    applyingTemplateId: null,
    isRestoringScene: false,
    isUploadingModel: false,
    captureInFlightRef: { current: false },
    physicsPhaseRef: { current: "idle" },
    isStudioBg3dPhysicsTransientPhase,
    modalAssetSessionRef: value.geometry.session,
    isModalAssetSessionCurrent: (session: StudioBg3dModalSession) =>
      studioBg3dModalOperationCoordinator.isCurrent(session),
    studioBg3dModalOperationCoordinator,
    StudioBg3dStaleModalOperationError,
    StudioBg3dThreeOperationError,
    StudioBg3dModelPlacementAdmissionError,
    materialBackend: "webgl",
    modelRenderer: null,
    isMaterialBackendCurrent: () => true,
    sceneBaseDocument: value.destination,
    physicsRuntimeSourceRef: { current },
    viewportHostRef: { current: null },
    modelRootCacheRef: { current: cache },
    modelLoadPendingRef: { current: pending },
    attachmentByStorageModelIdRef: { current: attachments },
    storageModelIdByAttachmentIdRef: { current: reverse },
    getStoredBg3dModelByHash: getStoredBg3dModelByHashV12,
    resolveBg3dModelHash: resolve,
    instantiateBg3dTemplateDocument: instantiate,
    attachmentMatchesRecord: match,
    admitAndCacheModel: admit,
    bindModelAttachment: bind,
    hydrateStudioBg3dDocumentToRuntime: hydrate,
    calculateStudioBg3dPlacedModelBytes,
    assertStudioBg3dModelAttachmentAdmission,
    STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS,
    STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
    resolveDeviceQuality: (document: StudioBg3dSceneDocument) =>
      resolveStudioBg3dDeviceQuality({
        document,
        mode: "edit",
        preference: "desktop",
        signals: {
          cssWidth: 1600, cssHeight: 900, devicePixelRatio: 1,
          pointer: "fine", saveData: false, deviceMemoryGb: 8, hardwareConcurrency: 8,
        },
      }),
    generateId: () => "template-local-seed",
    replaceCanonicalDocumentState: replacement,
    setSelectedIds: vi.fn<(ids: Set<string>) => void>(),
    setRefTick: vi.fn<(update: (previous: number) => number) => void>(),
    setApplyingTemplateId: vi.fn<(id: string | null) => void>(),
    setError,
  };
  attachStudioBg3dEditorPlacementHost(h);
  return { h, current, cache, pending, attachments, reverse, replacement, setError,
    instantiate, match, admit, bind, hydrate, resolve };
}

describe("실제 저장 모델을 사용하는 템플릿의 로컬 원본 복원", () => {
  it("같은 해시의 번들 GLB가 503이어도 SQLite/CAS의 로컬 원본을 적용한다", async () => {
    const value = await storedTemplateFixture();
    const host = templateHost(value);
    const assetId = "cbv1-ingest-template-" + crypto.randomUUID();
    const raw = rawThemePacks(value.local, assetId);
    bindConsumerReleaseFixture(() => raw);
    const fetcher = vi.fn<typeof fetch>(async (input) => isConsumerCatalogUrl(String(input))
      ? consumerReleaseFixture(raw).catalogResponse()
      : new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await loadStudioBg3dBundleThemePacks();
    expect(findStudioBg3dBundleAssetByHash(value.local.contentHash)).toMatchObject({
      id: assetId,
      bytes: value.local.byteSize,
    });
    expect(value.attachment.source).toBe("local-library");
    expect(value.local.rights.attributionRequired).toBe(true);
    expect(value.local.validatorMetrics.triangles).toBeGreaterThan(0);
    expect(host.cache.size).toBe(0);
    fetcher.mockClear();
    const apply = host.h.applyUserTemplate;
    if (!apply) throw new Error("실제 템플릿 적용 호스트가 필요합니다.");
    await apply(value.entry);
    expect(host.replacement, JSON.stringify({
      errors: host.setError.mock.calls,
      requests: fetcher.mock.calls.map(([input]) => String(input)),
    })).toHaveBeenCalledOnce();
    expect(host.resolve).toHaveBeenCalledWith(value.local.contentHash, {
      source: "local-library",
      signal: expect.any(AbortSignal),
    });
    expect(host.instantiate).toHaveBeenCalledOnce();
    expect(host.match).toHaveReturnedWith(true);
    expect(host.admit).toHaveBeenCalledOnce();
    expect(host.bind).toHaveReturnedWith(true);
    expect(host.hydrate).toHaveReturnedWith(expect.objectContaining({
      ok: true,
      diagnostics: [],
      counts: expect.objectContaining({
        emittedPrimitives: 0, emittedCustomModels: 1,
        droppedPrimitives: 0, droppedCustomModels: 0,
      }),
    }));
    expect(host.current.customModels).toHaveLength(1);
    expect(host.current.customModels[0]?.modelId).toBe(value.local.id);
    expect(host.current.customModels[0]?.id).not.toBe(value.model.id);
    expect(host.attachments.get(value.local.id)).toEqual(value.attachment);
    expect(host.reverse.get(value.attachment.id)).toBe(value.local.id);
    expect(host.cache.get(studioBg3dModelCacheKey(value.local.id, "webgl"))?.record.rights)
      .toEqual(value.local.rights);
    expect(host.pending.size).toBe(0);
    expect(host.setError).toHaveBeenLastCalledWith(null);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
