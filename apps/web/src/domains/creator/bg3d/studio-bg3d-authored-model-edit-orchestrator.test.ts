import { Mesh } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mutateStudioHybridDccComponentSelection } from "../hybrid-dcc/studio-hybrid-dcc-component-selection";
import { commitStudioHybridDccFaceModeling } from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-workspace";
import { workspaceComponentSelectionSource } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { createStudioBg3dModelAttachment, normalizeBg3dModelRights } from "./bg3d-model-library";
import { captureStudioBg3dAuthoredModelEditSource } from "./studio-bg3d-authored-model-edit-source";
import { createStudioBg3dAuthoredModelEditWorkspace } from "./studio-bg3d-authored-model-edit-workspace";
import { applyStudioBg3dAuthoredModelEditWorkspace } from "./studio-bg3d-authored-model-edit-orchestrator";
import { resolveStudioBg3dDeviceQuality } from "./studio-bg3d-device-quality";
import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import { exportStudioBg3dFaceEditAsset } from "./studio-bg3d-face-edit-export";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb } from "./studio-bg3d-glb-validation";
import { commitStudioBg3dHistoryTransition, resetStudioBg3dCommandHistory, stepStudioBg3dCommandHistory } from "./studio-bg3d-history-command-adapter";
import { studioBg3dModalOperationCoordinator } from "./studio-bg3d-modal-operation-coordinator";
import { studioBg3dModelCacheKey } from "./studio-bg3d-model-material-variant";
import { applyStudioBg3dPrimitiveEditWorkspace } from "./studio-bg3d-primitive-edit-orchestrator";
import { captureStudioBg3dPrimitiveEditSource } from "./studio-bg3d-primitive-edit-source";
import { createStudioBg3dPrimitiveEditWorkspace } from "./studio-bg3d-primitive-edit-workspace";
import { createStudioBg3dPrimitiveEditMaterial } from "./studio-bg3d-primitive-edit-replacement";
import { readStudioBg3dPrimitiveEditAuthoringGlb } from "./studio-bg3d-primitive-edit-authoring-glb";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import { fingerprintStudioBg3dModelSourceRestriction, inheritStudioBg3dModelSourceRestriction,
  readStudioBg3dEffectiveModelSourceRestriction } from "./studio-bg3d-model-source-restriction";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import type { StudioBg3dAuthoredModelEditOrchestratorHost } from "./studio-bg3d-authored-model-edit-orchestrator";
import type { StudioBg3dFaceEditWorkspaceBase } from "./studio-bg3d-face-edit-workspace-base";
import type { StudioBg3dGlbValidationSuccess } from "./studio-bg3d-glb-validation";
import type { StudioBg3dHistoryCommandRefs } from "./studio-bg3d-history-command-adapter";
import type { StudioBg3dModalSession } from "./studio-bg3d-modal-operation-coordinator";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { StudioBg3dModelReadLease, StudioBg3dModelReadLeaseErrorCode, StudioBg3dModelReadLeaseRecordIdentity } from "./studio-bg3d-model-read-lease";
import type { StudioBg3dPrimitiveEditRuntime } from "./studio-bg3d-primitive-edit-source";
import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dModelSourceRestrictionV1 } from "./studio-bg3d-model-source-restriction";

type Library = typeof import("./bg3d-model-library");
type AcquireReadLease = typeof import("./studio-bg3d-model-read-lease")["acquireStudioBg3dModelReadLeaseV12"];
const leaseFailureCodes: readonly StudioBg3dModelReadLeaseErrorCode[] = ["unsupported-authority", "read-failed"];
const storage = vi.hoisted(() => ({ save: vi.fn<Library["importVerifiedBg3dModelsAtomicallyWithDispositionV12"]>(),
  compensate: vi.fn<Library["compensateImportedBg3dModelsIfCreationMatchesV12"]>(), get: vi.fn<Library["getStoredBg3dModelV12"]>(),
  attach: vi.fn<Library["createStudioBg3dModelAttachment"]>(), admit: vi.fn<Library["admitStoredBg3dModelForRenderingV12"]>(),
  source: vi.fn<Library["readStudioBg3dModelSourceSnapshotV12"]>() }));
vi.mock("./bg3d-model-library", async (original) => ({ ...(await original<Library>()),
  readStudioBg3dModelSourceSnapshotV12: storage.source }));
const leasePort = vi.hoisted(() => vi.fn<AcquireReadLease>());
vi.mock("./studio-bg3d-model-read-lease", () => ({ acquireStudioBg3dModelReadLeaseV12: leasePort }));
vi.mock("./studio-bg3d-model-library-loader", () => ({
  loadStudioBg3dModelLibraryModule: async () => ({ importVerifiedBg3dModelsAtomicallyWithDispositionV12: storage.save,
    compensateImportedBg3dModelsIfCreationMatchesV12: storage.compensate, getStoredBg3dModelV12: storage.get, createStudioBg3dModelAttachment: storage.attach }),
  getStoredBg3dModelV12: storage.get, admitStoredBg3dModelForRenderingV12: storage.admit,
}));

const records = new Map<string, Bg3dVerifiedStoredRecord>(), verifications = new Map<string, StudioBg3dGlbValidationSuccess>();
const events: string[] = [];
const pendingGates = new Set<() => void>();
function gate() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((release) => { resolve = release; });
  const release = () => { resolve(); pendingGates.delete(release); };
  pendingGates.add(release); return { promise, release };
}
let releaseGate: ReturnType<typeof gate> | null = null;
interface HeldLease { readonly lease: StudioBg3dModelReadLease; readonly isCurrent: ReturnType<typeof vi.fn<() => boolean>>; readonly release: ReturnType<typeof vi.fn<() => Promise<void>>> }
const heldLeases: HeldLease[] = [];
const fixtures: { readonly session: { current: StudioBg3dModalSession }; readonly cache: Map<string, StudioBg3dModelRootCacheEntry> }[] = [];
let sequence = 0, manifestRevision = 0;

const save: Library["importVerifiedBg3dModelsAtomicallyWithDispositionV12"] = async (inputs, options = {}) => {
  const input = inputs[0];
  if (inputs.length !== 1 || !input || !("file" in input) || !(input.file instanceof File) || !input.rights) throw Error("실제 단일 File·권리 필요");
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const verification = await validateStudioBg3dGlb(bytes, { profile: options.profile ?? "desktop", budgets: options.budgets ?? DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    declared: { byteSize: bytes.byteLength, sha256: input.expectedSha256 ?? "", mimeType: "model/gltf-binary" },
    cumulative: { usedBytes: options.cumulativeUsedBytes ?? 0, maximumBytes: options.maximumCumulativeBytes ?? 100 * 1024 * 1024 } });
  if (!verification.ok) throw Error(verification.code);
  const existing = [...records.values()].find((record) => record.contentHash === verification.verifiedSha256);
  const id = existing?.id ?? `authored-model-${++sequence}`;
  let sourceRestriction: StudioBg3dModelSourceRestrictionV1;
  if (input.sourceReceipt) {
    const source = records.get(input.sourceReceipt.sourceRecordId);
    if (!source || source.contentHash !== input.sourceReceipt.sourceContentHash
      || fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(source)) !== input.sourceReceipt.sourceRestrictionFingerprint) {
      throw new Error("파생 원본 출처 seam이 현재 실제 row와 다릅니다.");
    }
    sourceRestriction = inheritStudioBg3dModelSourceRestriction(source);
  } else if (input.ingress?.kind === "studio-generated") {
    sourceRestriction = { version: 1, modelFileExport: input.ingress.modelFileExport,
      origin: { kind: "studio-generated", recordId: id, sha256: verification.verifiedSha256 }, parent: null };
  } else sourceRestriction = { version: 1, modelFileExport: "unknown", origin: null, parent: null };
  const record: Bg3dVerifiedStoredRecord = existing ?? { id, storageVersion: 2, name: input.file.name, format: "glb", blob: input.file,
    thumbnail: null, createdAt: 1, updatedAt: 1, contentHash: verification.verifiedSha256, byteSize: bytes.byteLength, mime: "model/gltf-binary", validationVersion: 1,
    validatedAt: 1, validatorProfile: options.profile ?? "desktop", validatorMetrics: verification.metrics, rights: normalizeBg3dModelRights(input.rights), sourceRestriction };
  records.set(record.id, record); verifications.set(record.id, verification);
  return { kind: "toonstudio-bg3d-model-atomic-import", version: 1, manifestRevision: ++manifestRevision,
    records: [record], created: existing ? [] : [{ id: record.id, contentHash: record.contentHash }], removedDeletions: [] };
};

const acquire: AcquireReadLease = async (expected, options) => {
  events.push("lease-acquire");
  for (const identity of expected) {
    const record = records.get(identity.id);
    if (!record || record.contentHash !== identity.contentHash || record.byteSize !== identity.byteSize || record.mime !== identity.mime
      || JSON.stringify(record.rights) !== JSON.stringify(identity.rights)
      || fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(record))
        !== fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(identity))) {
      return { ok: false, code: "record-changed", messageKo: "저장 원본 또는 파일 제한이 바뀌었습니다." };
    }
  }
  let current = true;
  const waitForRelease = releaseGate;
  const isCurrent = vi.fn(() => { events.push("lease-current"); return current && options.signals.every((signal) => !signal.aborted); });
  const release = vi.fn(async () => { current = false; events.push("release-start"); await waitForRelease?.promise; events.push("release-end"); });
  const lease: StudioBg3dModelReadLease = { isCurrent, release };
  heldLeases.push({ lease, isCurrent, release });
  return { ok: true, lease };
};
function identity(record: Bg3dVerifiedStoredRecord): StudioBg3dModelReadLeaseRecordIdentity {
  return { id: record.id, contentHash: record.contentHash, byteSize: record.byteSize, mime: record.mime, rights: record.rights,
    sourceRestriction: readStudioBg3dEffectiveModelSourceRestriction(record) };
}
function edit(context: StudioBg3dFaceEditWorkspaceBase, distance: number) {
  const source = workspaceComponentSelectionSource(context.workspace);
  if (!source) throw Error("실제 면 원본 필요");
  const selected = mutateStudioHybridDccComponentSelection(context.selection, { mode: "face", operation: "replace", ids: [2], activeId: 2, source });
  if (!selected.ok) throw Error("실제 면 2 선택 실패");
  return commitStudioHybridDccFaceModeling(context.workspace, selected.value, { tool: "push-pull", distance }).workspace;
}

async function fixture(options: { readonly shared?: boolean; readonly licensed?: boolean; readonly moved?: boolean;
  readonly restriction?: "service-only" | "unknown" | "legacy" } = {}) {
  const session = { current: studioBg3dModalOperationCoordinator.beginSession() }, document = createDefaultStudioBg3dSceneDocument();
  const live: { current: StudioBg3dPrimitiveEditRuntime } = { current: { primitives: [{ id: "source-box", kind: "box", name: "실제 원본 상자", color: "#c9a876",
    position: [2.25, 0.75, -3.5], rotation: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2] }], customModels: [], document } };
  const selected = { current: new Set(["source-box"]) }, cache = new Map<string, StudioBg3dModelRootCacheEntry>(), attachments = new Map<string, StudioBg3dModelAttachment>(), reverse = new Map<string, string>();
  const history: StudioBg3dHistoryCommandRefs = { historyRef: { current: [] }, historyIndexRef: { current: -1 }, historyCommandTimelineRef: { current: null } };
  resetStudioBg3dCommandHistory(history, createStudioBg3dHistorySnapshot(live.current));
  const replace = vi.fn<StudioBg3dAuthoredModelEditOrchestratorHost["replaceCanonicalDocumentState"]>((mutation) => {
    events.push("canonical"); live.current = { primitives: mutation.primitives ?? live.current.primitives, customModels: mutation.customModels ?? live.current.customModels, document: mutation.document ?? live.current.document };
  });
  const commit = vi.fn<StudioBg3dAuthoredModelEditOrchestratorHost["commitImmediateHistoryTransition"]>((primitives, customModels, nextDocument, before, metadata) => {
    events.push("history"); commitStudioBg3dHistoryTransition(history, { before, after: createStudioBg3dHistorySnapshot({ primitives, customModels, document: nextDocument }), ...metadata });
  });
  const notify = vi.fn<NonNullable<StudioBg3dAuthoredModelEditOrchestratorHost["onAssetCommitted"]>>(async () => { events.push("notify"); });
  const host: StudioBg3dAuthoredModelEditOrchestratorHost = { open: true, modalAssetSessionRef: session, selectedIdsRef: selected, physicsRuntimeSourceRef: live,
    modelRootCacheRef: { current: cache }, attachmentByStorageModelIdRef: { current: attachments }, storageModelIdByAttachmentIdRef: { current: reverse },
    deviceQuality: resolveStudioBg3dDeviceQuality({ document, mode: "edit", preference: "desktop",
      signals: { cssWidth: 1600, cssHeight: 1000, devicePixelRatio: 1, pointer: "fine", saveData: false, deviceMemoryGb: 8, hardwareConcurrency: 8 } }),
    modelRenderer: null, isPrimitiveEditInteractionLocked: () => false, replaceCanonicalDocumentState: replace, commitImmediateHistoryTransition: commit, onAssetCommitted: notify };
  fixtures.push({ session, cache });
  const capturedPrimitive = captureStudioBg3dPrimitiveEditSource(host);
  if (!capturedPrimitive.ok) throw Error(capturedPrimitive.messageKo);
  const initial = createStudioBg3dPrimitiveEditWorkspace(capturedPrimitive.snapshot);
  if (!initial.ok) throw Error(initial.messageKo);
  const primitiveWorkspace = edit(initial.value, 0.12345678901234566);
  const primitiveApplied = await applyStudioBg3dPrimitiveEditWorkspace(host, initial.value, primitiveWorkspace, new AbortController().signal);
  if (!primitiveApplied.ok) throw Error(primitiveApplied.messageKo);
  let recordA = records.get(primitiveApplied.storageModelId);
  const cacheA = cache.get(studioBg3dModelCacheKey(primitiveApplied.storageModelId, "webgl")), originalAttachment = attachments.get(primitiveApplied.storageModelId);
  if (!recordA || !cacheA || !originalAttachment) throw Error("실제 primitive 적용 원본 A 없음");
  if (options.licensed || options.restriction) {
    if (options.licensed) recordA = { ...recordA, rights: { status: "licensed", commercialUse: true, attributionRequired: true, attribution: "시험 원저작자", licenseName: "시험 사용권" } };
    if (options.restriction === "legacy") {
      const { sourceRestriction: _restriction, ...legacy } = recordA; recordA = legacy;
    } else if (options.restriction) recordA = { ...recordA,
      sourceRestriction: { ...readStudioBg3dEffectiveModelSourceRestriction(recordA), modelFileExport: options.restriction } };
    records.set(recordA.id, recordA); cache.set(studioBg3dModelCacheKey(recordA.id, "webgl"), { ...cacheA, record: recordA });
    attachments.set(recordA.id, createStudioBg3dModelAttachment(recordA, { attachmentId: originalAttachment.id }));
  }
  const before = createStudioBg3dHistorySnapshot(live.current), current = live.current.customModels[0];
  const model: BgCustomModelInstance = { ...current, name: "현재 재선택한 모델", tags: ["상자", "실내"],
    position: options.moved === false ? [...current.position] : [7, 1.5, -2], rotation: options.moved === false ? [...current.rotation] : [0.42, -0.3, 0.1],
    scale: [current.scale[0], current.scale[1], current.scale[2] * (options.moved === false ? 1 : 1.25)], materialOverride: createStudioBg3dPrimitiveEditMaterial("#2244aa") };
  const sibling: BgCustomModelInstance = { ...model, id: "shared-A", name: "보존할 공유 인스턴스", position: [9, 0, 0] };
  const customModels = options.shared ? [model, sibling] : [model];
  // 동일 bytes의 licensed 저장 record와 현재 배치를 준비하는 저장/UI seam이다. 실제 source는 이후 다시 검증한다.
  const base = { ...live.current.document, attachments: live.current.document.attachments.map((item) => item.id === originalAttachment.id ? attachments.get(recordA.id) ?? item : item) };
  const canonical = tryAdaptStudioBg3dRuntimeToDocument({ primitives: [], customModels, baseDocument: base, attachmentByStorageModelId: attachments });
  if (!canonical.ok) throw Error("현재 canonical 배치 fixture 실패");
  live.current = { primitives: [], customModels, document: canonical.value.document };
  commitStudioBg3dHistoryTransition(history, { before, after: createStudioBg3dHistorySnapshot(live.current), commandId: "fixture.current-placement", label: "현재 배치 준비", source: "menu" });
  const source = await captureStudioBg3dAuthoredModelEditSource(host, new AbortController().signal);
  if (!source.ok) throw Error(source.messageKo);
  const context = createStudioBg3dAuthoredModelEditWorkspace(source.snapshot);
  if (!context.ok) throw Error(context.messageKo);
  const workspace = edit(context.value, 0.1111111111111111);
  replace.mockClear(); commit.mockClear(); notify.mockClear(); storage.save.mockClear(); storage.get.mockClear(); storage.admit.mockClear(); storage.compensate.mockClear(); leasePort.mockClear(); heldLeases.length = 0; events.length = 0;
  return { host, session, live, selected, cache, attachments, reverse, history, replace, commit, notify, recordA, sibling,
    context: context.value, workspace, before: createStudioBg3dHistorySnapshot(live.current) };
}

beforeEach(() => {
  records.clear(); verifications.clear(); heldLeases.length = 0; events.length = 0; releaseGate = null; sequence = 0; manifestRevision = 0;
  storage.save.mockReset().mockImplementation(save);
  storage.get.mockReset().mockImplementation(async (id) => records.get(id) ?? null);
  storage.source.mockReset().mockImplementation(async (id) => {
    const record = records.get(id);
    return record ? { record, sourceKind: "local-library", manifestRevision, catalogIdentity: null } : null;
  });
  storage.admit.mockReset().mockImplementation(async (id) => { const value = verifications.get(id); if (!value) throw Error("실제 검증 결과 없음"); return value; });
  storage.attach.mockReset().mockImplementation((record) => createStudioBg3dModelAttachment(record, { attachmentId: `attachment-${record.id}` }));
  storage.compensate.mockReset().mockImplementation(async (receipt) => {
    events.push("compensate");
    if (receipt.created.some(({ id, contentHash }) => records.get(id)?.contentHash !== contentHash)) return false;
    for (const { id } of receipt.created) { records.delete(id); verifications.delete(id); } return true;
  });
  leasePort.mockReset().mockImplementation(acquire);
});
afterEach(async () => {
  for (const release of [...pendingGates]) release();
  for (const f of fixtures) studioBg3dModalOperationCoordinator.endSession(f.session.current);
  await studioBg3dModalOperationCoordinator.waitForSceneMutationLane();
  for (const held of heldLeases) await held.lease.release();
  vi.restoreAllMocks();
  const disposed = new Set<StudioBg3dModelRootCacheEntry>();
  for (const f of fixtures.splice(0)) for (const entry of f.cache.values()) if (!disposed.has(entry)) { entry.dispose(); disposed.add(entry); }
});

describe("primitive→authoring A→같은 원본 B orchestration", () => {
  it("A를 연 뒤 같은 backend로 돌아와도 폐기된 원래 lease의 편집은 저장하지 않는다", async () => {
    const f = await fixture();
    let originalLeaseCurrent = true;
    Object.assign(f.host, { isMaterialBackendCurrent: () => originalLeaseCurrent });
    const source = await captureStudioBg3dAuthoredModelEditSource(f.host, new AbortController().signal);
    if (!source.ok) throw new Error(source.messageKo);
    const prepared = createStudioBg3dAuthoredModelEditWorkspace(source.snapshot);
    if (!prepared.ok) throw new Error(prepared.messageKo);
    const workspace = edit(prepared.value, 0.25);
    originalLeaseCurrent = false;
    Object.assign(f.host, { isMaterialBackendCurrent: () => true });
    const result = await applyStudioBg3dAuthoredModelEditWorkspace(f.host, prepared.value, workspace, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, cleanup: "not-created" });
    expect(storage.save).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
    expect(createStudioBg3dHistorySnapshot(f.live.current)).toEqual(f.before);
    expect(f.cache.get(studioBg3dModelCacheKey(f.recordA.id, "webgl"))?.record).toBe(f.recordA);
  });

  it.each([false, true])("공유=%s: 실제 double mesh·현재 배치·색·이름을 보존하고 한 번 Undo/Redo한다", async (shared) => {
    const f = await fixture({ shared }), sourceMesh = f.context.source.authoring.mesh, oldCache = f.cache.get(studioBg3dModelCacheKey(f.recordA.id, "webgl")), oldBlob = f.recordA.blob;
    const sourceY = Math.max(...sourceMesh.vertices.map(({ position }) => position.y));
    expect(sourceY).toBe(0.5 + 0.12345678901234566);
    expect(sourceMesh.vertices.some(({ position }) => Math.fround(position.y) !== position.y)).toBe(true);
    expect(f.context.workspace.session.state.geometry.records[f.context.assetId].mesh).toEqual(sourceMesh);
    let renderHasRoundedY = false;
    oldCache?.root.traverse((object) => { if (object instanceof Mesh) {
      const positions = object.geometry.getAttribute("position");
      for (let index = 0; index < positions.count; index += 1) if (sourceMesh.vertices.some(({ position }) => Math.fround(position.y) === positions.getY(index) && position.y !== positions.getY(index))) renderHasRoundedY = true;
    } });
    expect(renderHasRoundedY).toBe(true);
    const controller = new AbortController(), result = await applyStudioBg3dAuthoredModelEditWorkspace(f.host, f.context, f.workspace, controller.signal);
    expect(result.ok).toBe(true); if (!result.ok) throw Error(result.messageKo);
    expect(f.commit).toHaveBeenCalledOnce(); expect(f.replace).toHaveBeenCalledOnce(); expect(f.notify).toHaveBeenCalledOnce();
    const model = f.live.current.customModels[0], nextCache = f.cache.get(studioBg3dModelCacheKey(result.storageModelId, "webgl")), recordB = records.get(result.storageModelId);
    expect(model).toMatchObject({ id: f.context.source.sourceNodeId, modelId: result.storageModelId, name: "현재 재선택한 모델", tags: ["상자", "실내"],
      position: f.context.source.canonicalNode.transform.position, rotation: f.context.source.canonicalNode.transform.rotation,
      materialOverride: createStudioBg3dPrimitiveEditMaterial("#2244aa") });
    expect(model.scale).toEqual(f.context.source.objectTransform.scale.map((value) => value / (nextCache?.normalizationScale ?? Number.NaN)));
    expect(f.cache.get(studioBg3dModelCacheKey(f.recordA.id, "webgl"))).toBe(oldCache); expect(records.get(f.recordA.id)?.blob).toBe(oldBlob);
    if (shared) expect(f.live.current.customModels[1]).toBe(f.sibling);
    expect(f.live.current.document.attachments.some(({ id }) => id === f.context.source.attachment.id)).toBe(shared);
    expect(recordB).toBeTruthy(); if (!recordB) throw Error("B 원본 필요");
    const parsedB = readStudioBg3dPrimitiveEditAuthoringGlb(new Uint8Array(await recordB.blob.arrayBuffer()));
    expect(parsedB.ok).toBe(true); if (!parsedB.ok) throw Error(parsedB.messageKo);
    expect(parsedB.value.envelope.source.meshHash).toBe(f.workspace.session.state.geometry.records[f.context.assetId].meshHash);
    expect(Math.max(...parsedB.value.mesh.vertices.map(({ position }) => position.y))).toBe(sourceY + 0.1111111111111111);
    const exported = exportStudioBg3dFaceEditAsset(f.context, f.workspace, f.context.source.sourceColorSrgb);
    if (!exported.ok) throw Error(exported.messageKo);
    const item = storage.save.mock.calls[0][0][0]; if (!("file" in item)) throw Error("실제 File 필요");
    expect(new Uint8Array(await item.file.arrayBuffer())).toEqual(exported.bytes);
    expect(leasePort).toHaveBeenCalledExactlyOnceWith([identity(f.recordA), expect.objectContaining(identity(recordB))], { signals: [controller.signal, expect.any(AbortSignal)] });
    const signals = leasePort.mock.calls[0][1].signals;
    expect(signals[0]).not.toBe(signals[1]); expect(signals[1]).not.toBe(storage.save.mock.calls[0][1]?.signal);
    expect(heldLeases[0].isCurrent).toHaveBeenCalled(); expect(events.indexOf("lease-current")).toBeLessThan(events.indexOf("history"));
    expect(events.indexOf("release-end")).toBeLessThan(events.indexOf("notify"));
    const after = createStudioBg3dHistorySnapshot(f.live.current), undone = stepStudioBg3dCommandHistory(f.history, "undo");
    expect(undone?.state).toEqual(f.before); if (!undone) throw Error("Undo 필요"); f.live.current = undone.state;
    const restoredA = await captureStudioBg3dAuthoredModelEditSource(f.host, controller.signal);
    expect(restoredA.ok).toBe(true); if (!restoredA.ok) throw Error(restoredA.messageKo);
    expect(hashStudioEditableMesh(restoredA.snapshot.authoring.mesh)).toBe(hashStudioEditableMesh(sourceMesh));
    const redone = stepStudioBg3dCommandHistory(f.history, "redo"); expect(redone?.state).toEqual(after);
    if (!redone) throw Error("Redo 필요"); f.live.current = redone.state;
    const restoredB = await captureStudioBg3dAuthoredModelEditSource(f.host, controller.signal);
    expect(restoredB.ok).toBe(true); if (!restoredB.ok) throw Error(restoredB.messageKo);
    expect(restoredB.snapshot.recordIdentity.storageModelId).toBe(recordB.id);
  });

  it("licensed source record의 attribution을 owned로 승격하지 않고 B와 lease에 전달한다", async () => {
    const f = await fixture({ licensed: true });
    const result = await applyStudioBg3dAuthoredModelEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(result.ok).toBe(true); if (!result.ok) throw Error(result.messageKo);
    const record = records.get(result.storageModelId);
    expect(record?.rights).toEqual(f.recordA.rights); expect(record?.rights.status).toBe("licensed");
    const item = storage.save.mock.calls[0][0][0]; if (!("file" in item)) throw Error("실제 File 필요");
    expect(item.rights).toEqual(f.recordA.rights);
    expect(item.ingress).toBeUndefined();
    expect(item.sourceReceipt).toEqual({ sourceRecordId: f.recordA.id, sourceContentHash: f.recordA.contentHash,
      sourceRestrictionFingerprint: fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(f.recordA)) });
    expect(record?.sourceRestriction).toEqual(inheritStudioBg3dModelSourceRestriction(f.recordA));
    expect(leasePort.mock.calls[0][0].map(({ rights }) => rights)).toEqual([f.recordA.rights, f.recordA.rights]);
  });

  it.each(["service-only", "unknown", "legacy"] as const)("%s stored 원본 재편집은 허가 상승 없이 B를 저장·적용한다", async (restriction) => {
    const f = await fixture({ restriction, shared: true });
    const applied = await applyStudioBg3dAuthoredModelEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(applied.ok).toBe(true); if (!applied.ok) throw new Error(applied.messageKo);
    const derived = records.get(applied.storageModelId);
    expect(derived?.sourceRestriction).toEqual(inheritStudioBg3dModelSourceRestriction(f.recordA));
    expect(derived?.sourceRestriction?.modelFileExport).toBe(restriction === "service-only" ? "service-only" : "unknown");
    expect(records.get(f.recordA.id)).toBe(f.recordA);
    expect(f.live.current.customModels.find((node) => node.id === f.sibling.id)).toEqual(f.sibling);
    const item = storage.save.mock.calls[0]?.[0][0];
    if (!item || !("file" in item)) throw new Error("실제 파생 File 입력이 없습니다.");
    expect(item.ingress).toBeUndefined(); expect(item.sourceReceipt?.sourceRecordId).toBe(f.recordA.id);
  });

  it("실제 lock release 완료를 기다린 뒤에만 목록 notification을 시작한다", async () => {
    const f = await fixture(); releaseGate = gate();
    let settled = false;
    const applying = applyStudioBg3dAuthoredModelEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal).then((result) => { settled = true; return result; });
    await vi.waitFor(() => expect(events).toContain("release-start"));
    expect(f.replace).toHaveBeenCalledOnce(); expect(f.notify).not.toHaveBeenCalled(); expect(settled).toBe(false);
    releaseGate.release(); expect((await applying).ok).toBe(true);
    expect(events.indexOf("release-end")).toBeLessThan(events.indexOf("notify"));
  });

  it.each(["selection", "missing-A", "corrupt-A"])("%s source/read 실패는 저장과 history 전에 중단한다", async (mode) => {
    const f = await fixture();
    if (mode === "selection") f.selected.current = new Set();
    if (mode === "missing-A") records.delete(f.recordA.id);
    if (mode === "corrupt-A") storage.get.mockImplementation(async (id) => id === f.recordA.id ? { ...f.recordA,
      blob: new Blob([new Uint8Array(f.recordA.byteSize)], { type: f.recordA.mime }) } : records.get(id) ?? null);
    expect(await applyStudioBg3dAuthoredModelEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal)).toMatchObject({ ok: false, cleanup: "not-created" });
    expect(storage.save).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled(); expect(leasePort).not.toHaveBeenCalled();
  });

  it.each(["A", "B"])("lease의 원본 %s hash 변경을 감지하면 새 B만 정확한 disposition으로 보상한다", async (which) => {
    const f = await fixture();
    leasePort.mockImplementation(async (expected, options) => {
      const target = records.get(expected[which === "A" ? 0 : 1].id); if (!target) throw Error("lease 대상 필요");
      records.set(target.id, { ...target, contentHash: `sha256:${"0".repeat(64)}` }); return acquire(expected, options);
    });
    const result = await applyStudioBg3dAuthoredModelEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, cleanup: which === "A" ? "removed" : "retained" });
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
    const receipt = storage.compensate.mock.calls[0][0];
    expect(receipt.created).toHaveLength(1); expect(receipt.created[0].id).not.toBe(f.recordA.id);
    expect(receipt.created[0].contentHash).toBe(storage.save.mock.results[0].type === "return" ? (await storage.save.mock.results[0].value).records[0].contentHash : "unreachable");
    expect(records.has(f.recordA.id)).toBe(true); expect(f.cache.size).toBe(1);
    expect(records.size).toBe(which === "A" ? 1 : 2);
  });

  it.each(["A", "B"] as const)("held lease 획득 직전 %s의 restriction만 바뀌면 history 없이 중단하고 다른 저장 revision을 보존한다", async (which) => {
    const f = await fixture();
    leasePort.mockImplementation(async (expected, options) => {
      const target = records.get(expected[which === "A" ? 0 : 1]?.id ?? "");
      if (!target) throw new Error("lease 대상 실제 원본이 없습니다.");
      records.set(target.id, { ...target, sourceRestriction: { ...readStudioBg3dEffectiveModelSourceRestriction(target), modelFileExport: "service-only" } });
      manifestRevision += 1;
      return acquire(expected, options);
    });
    storage.compensate.mockResolvedValueOnce(false);
    const result = await applyStudioBg3dAuthoredModelEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, cleanup: "retained" });
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
    expect(storage.compensate).toHaveBeenCalledOnce(); expect(records.has(f.recordA.id)).toBe(true);
  });

  it.each(leaseFailureCodes)("lease %s 실패는 실제 새 B만 보상하고 history를 만들지 않는다", async (code) => {
    const f = await fixture();
    leasePort.mockResolvedValue({ ok: false, code, messageKo: "같은 저장 snapshot을 읽지 못했습니다." });
    expect(await applyStudioBg3dAuthoredModelEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal)).toMatchObject({ ok: false, cleanup: "removed" });
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled(); expect(f.notify).not.toHaveBeenCalled();
    const receipt = storage.compensate.mock.calls[0][0];
    expect(receipt.created).toHaveLength(1); expect(receipt.created[0].id).not.toBe(f.recordA.id);
    expect(records.size).toBe(1); expect(records.get(f.recordA.id)).toBe(f.recordA); expect(f.cache.size).toBe(1);
  });

  it("정상 lease를 받은 뒤 선택이 바뀌어도 최신 source fence가 history 전에 거부한다", async () => {
    const f = await fixture();
    leasePort.mockImplementation(async (...args) => { const result = await acquire(...args); f.selected.current = new Set(); return result; });
    expect(await applyStudioBg3dAuthoredModelEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal)).toMatchObject({ ok: false, cleanup: "removed" });
    expect(heldLeases[0].release).toHaveBeenCalledOnce();
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
    expect(events.indexOf("release-end")).toBeLessThan(events.indexOf("compensate")); expect(records.size).toBe(1);
  });

  it("grant 후 isCurrent=false면 commit 없이 release를 await하고 보상한다", async () => {
    const f = await fixture(); releaseGate = gate();
    leasePort.mockImplementation(async (...args) => { const result = await acquire(...args); if (result.ok) heldLeases[0].isCurrent.mockReturnValue(false); return result; });
    const applying = applyStudioBg3dAuthoredModelEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    await vi.waitFor(() => expect(events).toContain("release-start"));
    expect(storage.compensate).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
    releaseGate.release(); expect(await applying).toMatchObject({ ok: false, cleanup: "removed" });
    expect(events.indexOf("release-end")).toBeLessThan(events.indexOf("compensate")); expect(records.size).toBe(1);
  });

  it("lease grant의 마지막 cancel은 원본 A를 보존하고 commit 없이 새 B만 정리한다", async () => {
    const f = await fixture(), controller = new AbortController();
    leasePort.mockImplementation(async (...args) => { const result = await acquire(...args); queueMicrotask(() => controller.abort()); return result; });
    expect(await applyStudioBg3dAuthoredModelEditWorkspace(f.host, f.context, f.workspace, controller.signal)).toMatchObject({ ok: false, cleanup: "removed" });
    expect(heldLeases[0].release).toHaveBeenCalledOnce(); expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
    expect(events.indexOf("release-end")).toBeLessThan(events.indexOf("compensate")); expect(records.has(f.recordA.id)).toBe(true);
  });

  it("parent session 교체는 physical prepare·release 완료까지 기다리고 새 자산을 추정 삭제하지 않는다", async () => {
    const f = await fixture(), grant = gate(); releaseGate = gate();
    leasePort.mockImplementation(async (...args) => { const result = await acquire(...args); await grant.promise; return result; });
    let settled = false;
    const applying = applyStudioBg3dAuthoredModelEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal).then((result) => { settled = true; return result; });
    await vi.waitFor(() => expect(leasePort).toHaveBeenCalledOnce());
    f.session.current = studioBg3dModalOperationCoordinator.beginSession();
    expect(leasePort.mock.calls[0][1].signals[1].aborted).toBe(true); expect(settled).toBe(false);
    grant.release(); await vi.waitFor(() => expect(events).toContain("release-start")); expect(settled).toBe(false);
    releaseGate.release(); expect(await applying).toMatchObject({ ok: false, cleanup: "retained" });
    expect(storage.compensate).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
    expect(records.size).toBe(2); expect(f.cache.size).toBe(1);
  });

  it("저장 후 source A가 사라지면 post-admission reread가 새 B만 보상한다", async () => {
    const f = await fixture(); storage.save.mockImplementation(async (...args) => { const receipt = await save(...args); records.delete(f.recordA.id); return receipt; });
    expect(await applyStudioBg3dAuthoredModelEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal)).toMatchObject({ ok: false, cleanup: "removed" });
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled(); expect(leasePort).not.toHaveBeenCalled();
    expect(storage.compensate.mock.calls[0][0].created.every(({ id }) => id !== f.recordA.id)).toBe(true); expect(f.cache.has(studioBg3dModelCacheKey(f.recordA.id, "webgl"))).toBe(true);
  });

  it("부분 canonical actor 예외는 history/asset 채택 가능성을 추정해 B를 삭제하지 않는다", async () => {
    const f = await fixture(), original = f.replace.getMockImplementation();
    f.replace.mockImplementation((mutation) => { original?.(mutation); throw Error("canonical partial failure"); });
    const result = await applyStudioBg3dAuthoredModelEditWorkspace(f.host, f.context, f.workspace, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, cleanup: "retained" });
    expect(f.commit).toHaveBeenCalledOnce(); expect(f.replace).toHaveBeenCalledOnce(); expect(f.notify).not.toHaveBeenCalled();
    expect(storage.compensate).not.toHaveBeenCalled(); expect(heldLeases[0].release).toHaveBeenCalledOnce();
    expect(records.size).toBe(2); expect(f.cache.size).toBe(2); expect(records.has(f.live.current.customModels[0].modelId)).toBe(true);
    expect(records.has(f.recordA.id)).toBe(true);
  });
});
