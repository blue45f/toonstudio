import { BufferGeometry } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enableStudio3dHighAssetQuality, getStudio3dAssetQualitySnapshot, resetStudio3dAssetQualityMode } from "../studio-3d-asset-quality-session";
import { mutateStudioHybridDccComponentSelection } from "../hybrid-dcc/studio-hybrid-dcc-component-selection";
import { commitStudioHybridDccFaceModeling } from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-workspace";
import { workspaceComponentSelectionSource } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import { createStudioBg3dModelAttachment, type Bg3dModelAtomicImportDispositionV12, type Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import { resolveStudioBg3dDeviceQuality } from "./studio-bg3d-device-quality";
import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb, type StudioBg3dGlbValidationSuccess } from "./studio-bg3d-glb-validation";
import { commitStudioBg3dHistoryTransition, resetStudioBg3dCommandHistory, type StudioBg3dHistoryCommandRefs } from "./studio-bg3d-history-command-adapter";
import { studioBg3dModalOperationCoordinator, type StudioBg3dModalSession } from "./studio-bg3d-modal-operation-coordinator";
import { admitAndCacheStudioBg3dModel, type StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import { studioBg3dModelCacheKey, studioBg3dModelRuntimeVariant } from "./studio-bg3d-model-material-variant";
import { applyStudioBg3dPrimitiveEditWorkspace, type StudioBg3dPrimitiveEditOrchestratorHost } from "./studio-bg3d-primitive-edit-orchestrator";
import { captureStudioBg3dPrimitiveEditSource, revalidateStudioBg3dPrimitiveEditSource, type StudioBg3dPrimitiveEditRuntime } from "./studio-bg3d-primitive-edit-source";
import { createStudioBg3dPrimitiveEditWorkspace } from "./studio-bg3d-primitive-edit-workspace";
import { exportStudioBg3dFaceEditAsset } from "./studio-bg3d-face-edit-export";
import { applyStudioBg3dFaceEditOperation } from "./studio-bg3d-face-edit-orchestrator";
import { createDefaultStudioBg3dSceneDocument, serializeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";
import { hydrateStudioBg3dDocumentToRuntime, tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";

type Library = typeof import("./bg3d-model-library");
type AcquireReadLease = typeof import("./studio-bg3d-model-read-lease")["acquireStudioBg3dModelReadLeaseV12"];
const leasePort = vi.hoisted(() => vi.fn<AcquireReadLease>());
vi.mock("./studio-bg3d-model-read-lease", () => ({ acquireStudioBg3dModelReadLeaseV12: leasePort }));
const storage = vi.hoisted(() => ({
  save: vi.fn<Library["importVerifiedBg3dModelsAtomicallyWithDispositionV12"]>(),
  compensate: vi.fn<Library["compensateImportedBg3dModelsIfCreationMatchesV12"]>(),
  get: vi.fn<Library["getStoredBg3dModelV12"]>(),
  attach: vi.fn<Library["createStudioBg3dModelAttachment"]>(),
  admit: vi.fn<Library["admitStoredBg3dModelForRenderingV12"]>(),
}));
vi.mock("./studio-bg3d-model-library-loader", () => ({
  loadStudioBg3dModelLibraryModule: async () => ({ importVerifiedBg3dModelsAtomicallyWithDispositionV12: storage.save,
    compensateImportedBg3dModelsIfCreationMatchesV12: storage.compensate, getStoredBg3dModelV12: storage.get,
    createStudioBg3dModelAttachment: storage.attach }),
  admitStoredBg3dModelForRenderingV12: storage.admit,
}));

const records = new Map<string, Bg3dVerifiedStoredRecord>();
const verifications = new Map<string, StudioBg3dGlbValidationSuccess>();
const fixtures: { readonly session: { readonly current: StudioBg3dModalSession }; readonly cache: Map<string, StudioBg3dModelRootCacheEntry> }[] = [];
let manifestRevision = 0;
const readLeases: { readonly isCurrent: () => boolean; readonly release: ReturnType<typeof vi.fn<() => Promise<void>>> }[] = [];

const acquire: AcquireReadLease = async (expected, options) => {
  if (options.signals.some((signal) => signal.aborted)) return { ok: false, code: "aborted", messageKo: "취소된 저장 읽기" };
  for (const identity of expected) {
    const record = records.get(identity.id);
    if (!record || record.contentHash !== identity.contentHash || record.byteSize !== identity.byteSize
      || record.mime !== identity.mime || JSON.stringify(record.rights) !== JSON.stringify(identity.rights)) {
      return { ok: false, code: "record-changed", messageKo: "검사 뒤 새 파생본이 삭제되거나 바뀌었습니다." };
    }
  }
  let held = true;
  const lease = { isCurrent: () => held && options.signals.every((signal) => !signal.aborted),
    release: vi.fn(async () => { held = false; }) };
  readLeases.push(lease);
  return { ok: true, lease };
};

/** 영구 저장/Worker 실행만 seam이다. 실제 exporter·writer·strict validator·verified loader·admission·replacement를 사용한다. */
const save: Library["importVerifiedBg3dModelsAtomicallyWithDispositionV12"] = async (inputs, options = {}) => {
  const input = inputs[0];
  if (inputs.length !== 1 || !input || !("file" in input)) throw Error("단일 File input 필요");
  if (!(input.file instanceof File) || input.rights?.status !== "owned" || input.rights.commercialUse !== true
    || input.rights.attributionRequired !== false) throw Error("직접 제작 File·권리 정보 필요");
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const hash = `sha256:${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("")}`;
  const verification = await validateStudioBg3dGlb(bytes, { profile: options.profile ?? "desktop", budgets: options.budgets ?? DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    declared: { byteSize: bytes.byteLength, sha256: input.expectedSha256 ?? hash, mimeType: "model/gltf-binary" },
    cumulative: { usedBytes: 0, maximumBytes: 100 * 1024 * 1024 }, supportedRequiredExtensions: [] });
  if (!verification.ok) throw Error(verification.code);
  const existing = [...records.values()].find((record) => record.contentHash === verification.verifiedSha256);
  const record: Bg3dVerifiedStoredRecord = existing ?? {
    id: `derived-model-${records.size + 1}`, storageVersion: 2, name: input.file.name, format: "glb", blob: input.file,
    thumbnail: null, createdAt: 1, updatedAt: 1, contentHash: verification.verifiedSha256, byteSize: bytes.byteLength,
    mime: "model/gltf-binary", validationVersion: 1, validatedAt: 1, validatorProfile: options.profile ?? "desktop",
    validatorMetrics: verification.metrics, rights: { status: "owned", commercialUse: true, attributionRequired: false },
  };
  records.set(record.id, record); verifications.set(record.id, verification);
  return { kind: "toonstudio-bg3d-model-atomic-import", version: 1, manifestRevision: ++manifestRevision,
    records: [record], created: existing ? [] : [{ id: record.id, contentHash: record.contentHash }], removedDeletions: [] };
};

function fixture() {
  const session = { current: studioBg3dModalOperationCoordinator.beginSession() };
  const document = createDefaultStudioBg3dSceneDocument();
  const live: { current: StudioBg3dPrimitiveEditRuntime } = { current: { primitives: [{ id: "source-box", name: "원본 상자", kind: "box",
    position: [2.25, 0.75, -3.5], rotation: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2], color: "#c9a876" }], customModels: [], document } };
  const selected = { current: new Set(["source-box"]) };
  const cache = new Map<string, StudioBg3dModelRootCacheEntry>();
  const attachments = new Map<string, StudioBg3dModelAttachment>();
  const storageIds = new Map<string, string>();
  const quality = resolveStudioBg3dDeviceQuality({ document, mode: "edit", preference: "desktop",
    signals: { cssWidth: 1600, cssHeight: 1000, devicePixelRatio: 1, pointer: "fine", saveData: false, deviceMemoryGb: 8, hardwareConcurrency: 8 } });
  const history: StudioBg3dHistoryCommandRefs = { historyRef: { current: [] }, historyIndexRef: { current: -1 }, historyCommandTimelineRef: { current: null } };
  resetStudioBg3dCommandHistory(history, createStudioBg3dHistorySnapshot(live.current));
  const replace = vi.fn<StudioBg3dPrimitiveEditOrchestratorHost["replaceCanonicalDocumentState"]>((mutation) => {
    live.current = { primitives: mutation.primitives ?? live.current.primitives, customModels: mutation.customModels ?? live.current.customModels,
      document: mutation.document ?? live.current.document };
  });
  const commit = vi.fn<StudioBg3dPrimitiveEditOrchestratorHost["commitImmediateHistoryTransition"]>((primitives, customModels, nextDocument, before, options) => {
    commitStudioBg3dHistoryTransition(history, { before, after: createStudioBg3dHistorySnapshot({ primitives, customModels, document: nextDocument }), ...options });
  });
  const notify = vi.fn<NonNullable<StudioBg3dPrimitiveEditOrchestratorHost["onAssetCommitted"]>>(async () => undefined);
  const host: StudioBg3dPrimitiveEditOrchestratorHost = { open: true, modalAssetSessionRef: session,
    selectedIdsRef: selected, physicsRuntimeSourceRef: live, modelRootCacheRef: { current: cache },
    attachmentByStorageModelIdRef: { current: attachments }, storageModelIdByAttachmentIdRef: { current: storageIds },
    deviceQuality: quality, modelRenderer: null, isPrimitiveEditInteractionLocked: () => false,
    replaceCanonicalDocumentState: replace, commitImmediateHistoryTransition: commit, onAssetCommitted: notify };
  const captured = captureStudioBg3dPrimitiveEditSource(host);
  if (!captured.ok) throw Error(captured.messageKo);
  const initialized = createStudioBg3dPrimitiveEditWorkspace(captured.snapshot);
  if (!initialized.ok) throw Error(initialized.messageKo);
  const context = initialized.value;
  const selectionSource = workspaceComponentSelectionSource(context.workspace);
  if (!selectionSource) throw Error("면 선택 원본 없음");
  const face = mutateStudioHybridDccComponentSelection(context.selection, { mode: "face", operation: "replace", ids: [2], activeId: 2, source: selectionSource });
  if (!face.ok) throw Error("면 선택 실패");
  const workspace = commitStudioHybridDccFaceModeling(context.workspace, face.value, { tool: "push-pull", distance: 0.25 }).workspace;
  const f = { host, live, selected, session, cache, attachments, storageIds, history, replace, commit, notify, context, workspace };
  fixtures.push(f);
  return f;
}

function deferred() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

function blockCanonicalPreservation(f: ReturnType<typeof fixture>, mode: "source-box" | "other" | "unused-attachment") {
  const source = f.live.current.primitives[0];
  if (!source) throw Error("fixture 상자 없음");
  const primitives = mode === "other" ? [...f.live.current.primitives, { ...source, id: "other", name: "다른 상자" }] : f.live.current.primitives;
  const canonical = tryAdaptStudioBg3dRuntimeToDocument({ ...f.live.current, primitives, baseDocument: f.live.current.document,
    attachmentByStorageModelId: f.attachments });
  if (!canonical.ok) throw Error("정본 fixture 생성 실패");
  const attachment: StudioBg3dModelAttachment = { id: "unused-attachment", name: "보존할 원본.glb", hash: `sha256:${"c".repeat(64)}`,
    byteSize: 64, mime: "model/gltf-binary", source: "upload", rights: { status: "owned", commercialUse: true, attributionRequired: false } };
  const document = mode === "unused-attachment" ? { ...canonical.value.document, attachments: [attachment] }
    : { ...canonical.value.document, nodes: canonical.value.document.nodes.map((node) => node.id === mode ? { ...node, receivesShadow: false } : node) };
  if (!serializeStudioBg3dSceneDocument(document)) throw Error("strict 정본 fixture 필요");
  const hydrated = hydrateStudioBg3dDocumentToRuntime({ document, storageModelIdByAttachmentId: f.storageIds });
  if (!hydrated.ok || hydrated.diagnostics.length) throw Error("정본 fixture 복원 실패");
  f.live.current = { primitives: hydrated.primitives, customModels: hydrated.customModels, document };
}

beforeEach(() => {
  records.clear(); verifications.clear(); manifestRevision = 0;
  readLeases.length = 0; leasePort.mockReset().mockImplementation(acquire);
  resetStudio3dAssetQualityMode();
  storage.save.mockReset().mockImplementation(save);
  storage.compensate.mockReset().mockImplementation(async (receipt) => {
    for (const entry of receipt.created) { records.delete(entry.id); verifications.delete(entry.id); }
    return true;
  });
  storage.get.mockReset().mockImplementation(async (id) => records.get(id) ?? null);
  storage.attach.mockReset().mockImplementation((record) => createStudioBg3dModelAttachment(record, { attachmentId: "edited-attachment" }));
  storage.admit.mockReset().mockImplementation(async (id) => {
    const verification = verifications.get(id);
    if (!verification) throw Error("저장된 검증 결과 없음");
    return verification;
  });
});

afterEach(async () => {
  for (const f of fixtures) studioBg3dModalOperationCoordinator.endSession(f.session.current);
  await studioBg3dModalOperationCoordinator.waitForSceneMutationLane();
  for (const lease of readLeases) await lease.release();
  vi.restoreAllMocks();
  const disposed = new Set<StudioBg3dModelRootCacheEntry>();
  for (const f of fixtures.splice(0)) for (const entry of f.cache.values()) if (!disposed.has(entry)) { entry.dispose(); disposed.add(entry); }
  resetStudio3dAssetQualityMode();
});

describe("원본 primitive 편집의 저장·admission·보상 orchestration", () => {
  it("적용 실패 rollback은 자기 variant만 떼고 반대 backend의 공유 root·record를 보존한다", async () => {
    const f = fixture(); let opposite: StudioBg3dModelRootCacheEntry | undefined;
    const dispose = vi.fn();
    const result = await applyStudioBg3dFaceEditOperation(f.host, {
      modalSession: f.context.source.modalSession, sourceNodeId: f.context.source.sourceNodeId,
      name: f.context.source.canonicalNode.name, rights: { status: "owned", commercialUse: true, attributionRequired: false },
      readSource: () => revalidateStudioBg3dPrimitiveEditSource(f.host, f.context.source),
      exportAsset: () => exportStudioBg3dFaceEditAsset(f.context, f.workspace, f.context.source.primitive.color),
      replaceAsset: (asset) => {
        const own = f.cache.get(studioBg3dModelCacheKey(asset.storageModelId, "webgl"));
        if (!own) throw Error("설치된 variant가 없습니다.");
        const release = own.dispose;
        vi.spyOn(own, "dispose").mockImplementation(dispose);
        opposite = { ...own, runtimeVariant: studioBg3dModelRuntimeVariant("webgpu"), dispose: release };
        f.cache.set(studioBg3dModelCacheKey(asset.storageModelId, "webgpu"), opposite);
        return { ok: false, messageKo: "의도한 교체 거부" };
      },
    }, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, cleanup: "retained" });
    expect(f.cache.has(studioBg3dModelCacheKey("derived-model-1", "webgl"))).toBe(false);
    expect(f.cache.get(studioBg3dModelCacheKey("derived-model-1", "webgpu"))).toBe(opposite);
    expect(records.has("derived-model-1")).toBe(true); expect(dispose).not.toHaveBeenCalled();
    expect(storage.compensate).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it("저장 대기 중 시작 lease가 폐기되면 새 guard true로 A backend에 돌아와도 적용하지 않는다", async () => {
    const f = fixture(), waiting = deferred(); let active = true, guard = () => active;
    const host = { ...f.host, get isMaterialBackendCurrent() { return guard; } };
    storage.save.mockImplementationOnce(async (items, options) => { await waiting.promise; return save(items, options); });
    const pending = applyStudioBg3dPrimitiveEditWorkspace(host, f.context, f.workspace, new AbortController().signal);
    await vi.waitFor(() => expect(storage.save).toHaveBeenCalledOnce());
    active = false; guard = () => true; waiting.release();
    expect(await pending).toMatchObject({ ok: false, cleanup: "removed" });
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled(); expect(f.cache.size).toBe(0);
  });

  it("DB 원본이 없는 primitive도 새 B 하나의 lease를 동기 commit까지 유지한다", async () => {
    const f = fixture(), replace = f.replace.getMockImplementation();
    f.replace.mockImplementation((mutation) => {
      expect(readLeases[0]?.isCurrent()).toBe(true);
      expect(readLeases[0]?.release).not.toHaveBeenCalled();
      return replace?.(mutation);
    });
    expect((await applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal)).ok).toBe(true);
    expect(leasePort).toHaveBeenCalledOnce(); expect(leasePort.mock.calls[0][0]).toHaveLength(1);
    expect(leasePort.mock.calls[0][0][0].id).toBe("derived-model-1");
    expect(leasePort.mock.calls[0][1].signals).toHaveLength(2);
    expect(readLeases[0].release).toHaveBeenCalledOnce(); expect(readLeases[0].isCurrent()).toBe(false);
  });

  it("최종 get이 읽은 B가 반환 직전 삭제되면 primitive도 history/정본을 쓰지 않는다", async () => {
    const f = fixture();
    storage.get.mockImplementation(async (id) => { const read = records.get(id) ?? null; records.delete(id); return read; });
    const result = await applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, code: "stale-source" });
    expect(leasePort).toHaveBeenCalledOnce(); expect(records.size).toBe(0);
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
    expect(f.live.current.primitives).toHaveLength(1); expect(f.live.current.customModels).toHaveLength(0);
  });

  it("B lease가 commit 전에 취소되면 해제 완료를 기다린 뒤 새 자산만 보상한다", async () => {
    const f = fixture(), controller = new AbortController(), unlock = deferred(), events: string[] = [];
    leasePort.mockImplementation(async (...args) => {
      const result = await acquire(...args);
      if (result.ok) {
        result.lease.release = vi.fn(async () => { events.push("release-start"); await unlock.promise; events.push("release-end"); });
      }
      queueMicrotask(() => controller.abort());
      return result;
    });
    storage.compensate.mockImplementation(async (receipt) => { events.push("compensate"); for (const item of receipt.created) records.delete(item.id); return true; });
    let settled = false;
    const pending = applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, controller.signal).then((result) => { settled = true; return result; });
    await vi.waitFor(() => expect(events).toContain("release-start"));
    expect(storage.compensate).not.toHaveBeenCalled(); expect(settled).toBe(false);
    unlock.release();
    expect(await pending).toMatchObject({ ok: false, cleanup: "removed" });
    expect(events.indexOf("release-end")).toBeLessThan(events.indexOf("compensate"));
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled(); expect(records.size).toBe(0);
  });

  it("실제 export/material/validator/loader/admission으로 단일 교체하고 목록 갱신을 기다린다", async () => {
    const f = fixture();
    const notified = deferred(); f.notify.mockImplementation(() => notified.promise);
    let settled = false;
    const applying = applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal).then((value) => { settled = true; return value; });
    await vi.waitFor(() => expect(f.notify).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    expect(f.replace).toHaveBeenCalledOnce(); expect(f.commit).toHaveBeenCalledOnce();
    notified.release();
    const result = await applying;
    expect(result.ok).toBe(true);
    expect(storage.save.mock.calls[0]?.[1]).toMatchObject({ executionBackend: "worker", profile: "desktop" });
    expect(storage.save.mock.calls[0]?.[0][0]).toMatchObject({ ingress: { kind: "studio-generated", modelFileExport: "allowed" } });
    expect(storage.save.mock.calls[0]?.[0][0]).not.toHaveProperty("sourceReceipt");
    expect(storage.get).toHaveBeenCalledOnce(); expect(storage.compensate).not.toHaveBeenCalled();
    expect(f.live.current.primitives).toHaveLength(0);
    expect(f.live.current.customModels[0]).toMatchObject({ id: "source-box", position: [2.25, 0.75, -3.5], scale: [1.125, 0.37499999999999994, 1.375] });
    expect([...f.selected.current]).toEqual(["source-box"]);
    const entry = f.cache.values().next().value;
    expect(entry?.normalizationScale).toBe(1.6);
    expect(f.storageIds.get("edited-attachment")).toBe(entry?.record.id);
    expect(entry?.root.scale.toArray()).toEqual([1.6, 1.6, 1.6]);
  });

  it("no-op 작업공간이나 이미 바뀐 source는 File 저장 전에 거부한다", async () => {
    const f = fixture();
    expect((await applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.context.workspace, new AbortController().signal)).ok).toBe(false);
    f.selected.current = new Set();
    expect((await applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal)).ok).toBe(false);
    expect(storage.save).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it.each(["source-box", "other", "unused-attachment"] as const)("정본 %s 정보를 보존할 수 없으면 Worker 저장과 admission 전에 중단한다", async (mode) => {
    const f = fixture(); blockCanonicalPreservation(f, mode);
    const before = f.live.current;
    const result = await applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, cleanup: "not-created",
      messageKo: expect.stringContaining(mode === "unused-attachment" ? "기존 모델 원본 연결" : "그림자 투사 또는 수신") });
    expect(storage.save).not.toHaveBeenCalled(); expect(storage.admit).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled(); expect(f.live.current).toBe(before);
  });

  it.each(["source-box", "other", "unused-attachment"] as const)("저장을 기다리는 중 %s 보존 경계가 바뀌면 새 자산만 보상하고 정본을 유지한다", async (mode) => {
    const f = fixture(), gate = deferred();
    storage.save.mockImplementation(async (...args) => { await gate.promise; return save(...args); });
    const applying = applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    await vi.waitFor(() => expect(storage.save).toHaveBeenCalledOnce());
    blockCanonicalPreservation(f, mode); const before = f.live.current;
    gate.release();
    expect(await applying).toMatchObject({ ok: false, cleanup: "removed",
      messageKo: expect.stringContaining(mode === "unused-attachment" ? "기존 모델 원본 연결" : "그림자 투사 또는 수신") });
    expect(storage.compensate).toHaveBeenCalledOnce(); expect(storage.admit).not.toHaveBeenCalled();
    expect(records.size).toBe(0); expect(f.cache.size).toBe(0); expect(f.attachments.size).toBe(0);
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled(); expect(f.live.current).toBe(before);
  });

  it("Worker/OPFS 예외를 성공으로 바꾸지 않는다", async () => {
    const f = fixture(); storage.save.mockRejectedValue(new Error("worker authority unavailable"));
    const result = await applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, stage: "storage", cleanup: "not-created" });
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it("admission 실패를 정확한 disposition으로 보상하고 기존 high mode는 바꾸지 않는다", async () => {
    const f = fixture(); storage.admit.mockRejectedValue(new Error("parse failed"));
    enableStudio3dHighAssetQuality(); const quality = getStudio3dAssetQualitySnapshot();
    const result = await applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, stage: "admission", cleanup: "removed" });
    expect(getStudio3dAssetQualitySnapshot()).toBe(quality);
    expect(storage.compensate).toHaveBeenCalledExactlyOnceWith(await storage.save.mock.results[0]?.value);
    expect(records.size).toBe(0); expect(f.cache.size).toBe(0);
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it("늦게 저장된 사용자 취소도 물리적 저장 뒤 보상하고 원본은 교체하지 않는다", async () => {
    const f = fixture(), gate = deferred(), controller = new AbortController();
    storage.save.mockImplementation(async (...args) => { await gate.promise; return save(...args); });
    let settled = false;
    const applying = applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, controller.signal).then((value) => { settled = true; return value; });
    await vi.waitFor(() => expect(storage.save).toHaveBeenCalledOnce());
    controller.abort(); await Promise.resolve(); expect(settled).toBe(false);
    gate.release();
    expect(await applying).toMatchObject({ ok: false, cleanup: "removed" });
    expect(records.size).toBe(0); expect(storage.compensate).toHaveBeenCalledOnce();
    expect(f.replace).not.toHaveBeenCalled();
  });

  it("FIFO lease timeout 뒤에도 비협조적 저장이 끝난 다음 보상한다", async () => {
    const f = fixture(), gate = deferred();
    storage.save.mockImplementation(async (...args) => { await gate.promise; return save(...args); });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let settled = false;
      const applying = applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal).then((value) => { settled = true; return value; });
      await vi.waitFor(() => expect(storage.save).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(120_001);
      expect(settled).toBe(false);
      gate.release();
      expect(await applying).toMatchObject({ ok: false, cleanup: "removed" });
      expect(records.size).toBe(0); expect(f.replace).not.toHaveBeenCalled();
    } finally { gate.release(); vi.useRealTimers(); }
  });

  it("session revoke 뒤 FIFO와 물리적 저장을 기다리고 새 세션이 채택할 수 있는 asset은 남긴다", async () => {
    const f = fixture(), gate = deferred();
    storage.save.mockImplementation(async (...args) => { await gate.promise; return save(...args); });
    let settled = false;
    const applying = applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal).then((value) => { settled = true; return value; });
    await vi.waitFor(() => expect(storage.save).toHaveBeenCalledOnce());
    f.session.current = studioBg3dModalOperationCoordinator.beginSession();
    const nextPrepare = vi.fn(() => "next");
    const next = studioBg3dModalOperationCoordinator.runSceneMutation(f.session.current, nextPrepare, () => undefined);
    await Promise.resolve(); expect(settled).toBe(false); expect(nextPrepare).not.toHaveBeenCalled();
    gate.release();
    const result = await applying;
    expect(result).toMatchObject({ ok: false, cleanup: "retained", retainedStorageIds: ["derived-model-1"] });
    await next; expect(nextPrepare).toHaveBeenCalledOnce();
    expect(storage.compensate).not.toHaveBeenCalled(); expect(records.size).toBe(1);
    expect(f.replace).not.toHaveBeenCalled();
  });

  it.each(["manifest-conflict", "storage-exception"])("적용 직전 source 변경은 새 cache를 정리하고 %s 잔여 asset을 알린다", async (mode) => {
    const f = fixture();
    const disposed = vi.spyOn(BufferGeometry.prototype, "dispose");
    storage.get.mockImplementation(async (id) => { f.selected.current = new Set(); return records.get(id) ?? null; });
    if (mode === "manifest-conflict") storage.compensate.mockResolvedValue(false);
    else storage.compensate.mockRejectedValue(new Error("compensation authority failed"));
    const result = await applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, cleanup: "retained", retainedStorageIds: ["derived-model-1"] });
    if (!result.ok) expect(result.messageKo).toContain("삭제하지 않고");
    expect(disposed).toHaveBeenCalled(); expect(f.cache.size).toBe(0); expect(f.attachments.size).toBe(0);
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it("다른 reverse mapping은 덮지 않고 새 binding/cache만 롤백한다", async () => {
    const f = fixture();
    storage.get.mockImplementation(async (id) => { f.storageIds.set("edited-attachment", "another-model"); return records.get(id) ?? null; });
    const result = await applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, cleanup: "removed" });
    expect(f.storageIds.get("edited-attachment")).toBe("another-model");
    expect(f.cache.size).toBe(0); expect(f.attachments.size).toBe(0); expect(f.replace).not.toHaveBeenCalled();
  });

  it("다른 cache owner와 충돌하면 그 entry·asset을 덮거나 dispose하지 않는다", async () => {
    const f = fixture(); let other: StudioBg3dModelRootCacheEntry | null = null;
    storage.get.mockImplementation(async (id) => {
      const record = records.get(id);
      if (!record) return null;
      other = await admitAndCacheStudioBg3dModel({ record, document: f.live.current.document, quality: f.host.deviceQuality,
        cumulativeUsedBytes: 0, renderer: null, cache: new Map(), pending: new Map(), isActive: () => true, preserveQualityModeOnFailure: true });
      f.cache.set(studioBg3dModelCacheKey(id, "webgl"), other);
      return record;
    });
    const result = await applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, cleanup: "retained" });
    expect(f.cache.get(studioBg3dModelCacheKey("derived-model-1", "webgl"))).toBe(other); expect(records.size).toBe(1);
    expect(storage.compensate).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
  });

  it("dedup된 기존 asset/cache는 실패 보상에서 삭제하거나 dispose하지 않는다", async () => {
    const f = fixture();
    const exported = exportStudioBg3dFaceEditAsset(f.context, f.workspace, f.context.source.primitive.color);
    if (!exported.ok) throw Error(exported.messageKo);
    const seeded: Bg3dModelAtomicImportDispositionV12 = await save([{ file: new File([exported.bytes], "기존.glb"), rights: { status: "owned", commercialUse: true, attributionRequired: false } }]);
    const record = seeded.records[0]; if (!record) throw Error("seed 없음");
    const entry = await admitAndCacheStudioBg3dModel({ record, document: f.live.current.document, quality: f.host.deviceQuality,
      cumulativeUsedBytes: 0, renderer: null, cache: f.cache, pending: new Map(), isActive: () => true });
    const dispose = vi.spyOn(entry, "dispose");
    storage.get.mockImplementation(async (id) => { f.selected.current = new Set(); return records.get(id) ?? null; });
    const result = await applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, cleanup: "not-created" });
    expect(storage.compensate).not.toHaveBeenCalled(); expect(dispose).not.toHaveBeenCalled();
    expect(f.cache.get(studioBg3dModelCacheKey(record.id, "webgl"))).toBe(entry); expect(records.has(record.id)).toBe(true);
  });

  it("scene actor 예외는 성공으로 숨기지 않고 history가 참조할 자산을 보존한다", async () => {
    const f = fixture(); f.replace.mockImplementation(() => { throw Error("scene actor failed"); });
    const result = await applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, stage: "commit", cleanup: "retained" });
    expect(f.commit).toHaveBeenCalledOnce(); expect(f.cache.size).toBe(1); expect(f.attachments.size).toBe(1);
    expect(records.size).toBe(1); expect(storage.compensate).not.toHaveBeenCalled(); expect(f.notify).not.toHaveBeenCalled();
  });

  it("commit 뒤 비동기 목록 read 실패는 성공한 장면을 보상 삭제하지 않는다", async () => {
    const f = fixture(); f.notify.mockRejectedValue(new Error("listing read failed"));
    const result = await applyStudioBg3dPrimitiveEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(result).toMatchObject({ ok: true, notificationWarning: true });
    expect(f.live.current.customModels).toHaveLength(1); expect(storage.compensate).not.toHaveBeenCalled(); expect(records.size).toBe(1);
  });
});
