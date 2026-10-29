import { Group, Mesh, MeshStandardMaterial } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";
import type { StudioHybridDccObjectTransform } from "../hybrid-dcc/studio-hybrid-dcc-object-transform";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import { resolveStudioBg3dDeviceQuality } from "./studio-bg3d-device-quality";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb, type StudioBg3dGlbValidationSuccess } from "./studio-bg3d-glb-validation";
import { admitAndCacheStudioBg3dModel, type StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import { createStudioBg3dPrimitiveEditAuthoring } from "./studio-bg3d-primitive-edit-authoring";
import { writeStudioBg3dPrimitiveEditAuthoringToGlb } from "./studio-bg3d-primitive-edit-authoring-glb";
import { writeStudioBg3dPrimitiveEditMaterialGlb } from "./studio-bg3d-primitive-edit-material";
import { convertStudioBg3dPrimitiveToEditableMesh } from "./studio-bg3d-primitive-edit-mesh";
import { createStudioBg3dPrimitiveEditMaterial } from "./studio-bg3d-primitive-edit-replacement";
import type { StudioBg3dPrimitiveEditRuntime } from "./studio-bg3d-primitive-edit-source";
import { createDefaultStudioBg3dSceneDocument, DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, serializeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";
import { hydrateStudioBg3dDocumentToRuntime, tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import { readStudioBg3dEffectiveModelSourceRestriction } from "./studio-bg3d-model-source-restriction";
import type { StudioBg3dModelSourceRestrictionV1 } from "./studio-bg3d-model-source-restriction";
import {
  captureStudioBg3dAuthoredModelEditSource, inspectStudioBg3dAuthoredModelEditSource,
  rereadStudioBg3dAuthoredModelEditSource, revalidateStudioBg3dAuthoredModelEditSource,
  type StudioBg3dAuthoredModelEditSourceHost,
} from "./studio-bg3d-authored-model-edit-source";

type Library = typeof import("./bg3d-model-library");
const storage = vi.hoisted(() => ({ get: vi.fn<Library["getStoredBg3dModelV12"]>(), admit: vi.fn<Library["admitStoredBg3dModelForRenderingV12"]>(),
  source: vi.fn<Library["readStudioBg3dModelSourceSnapshotV12"]>() }));
vi.mock("./bg3d-model-library", async (original) => ({ ...(await original<Library>()), readStudioBg3dModelSourceSnapshotV12: storage.source }));
vi.mock("./studio-bg3d-model-library-loader", () => ({ getStoredBg3dModelV12: storage.get, admitStoredBg3dModelForRenderingV12: storage.admit }));
const records = new Map<string, Bg3dVerifiedStoredRecord>();
const verifications = new Map<string, StudioBg3dGlbValidationSuccess>();
const caches: StudioBg3dModelRootCacheEntry[] = [];
const HISTORICAL: StudioHybridDccObjectTransform = { revision: 1, position: [2.25, 0.75, -3.5], rotationEulerRad: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2] };
const signal = () => new AbortController().signal;

async function fixture(withAuthoring = true, modelFileExport?: StudioBg3dModelSourceRestrictionV1["modelFileExport"]) {
  const primitive = { id: "historical-box", kind: "box", name: "역사 원본", color: "#c9a876",
    position: HISTORICAL.position, rotation: HISTORICAL.rotationEulerRad, scale: HISTORICAL.scale };
  const converted = convertStudioBg3dPrimitiveToEditableMesh(primitive);
  if (!converted.ok) throw Error(converted.detail);
  const mesh = converted.value.mesh;
  const created = createStudioBg3dPrimitiveEditAuthoring({ assetId: primitive.id, revision: 1, mesh,
    objectTransformAtExport: HISTORICAL, colorSrgb: primitive.color });
  if (!created.ok) throw Error(created.messageKo);
  const exported = exportStudioHybridDccMeshGlb({ assetId: primitive.id, mesh, sourceHash: hashStudioEditableMesh(mesh), sourceRevision: 1 });
  if (!exported.ok) throw Error("실제 GLB export 실패");
  const material = writeStudioBg3dPrimitiveEditMaterialGlb(exported.bytes, primitive.color);
  if (!material.ok) throw Error(material.messageKo);
  const authored = writeStudioBg3dPrimitiveEditAuthoringToGlb(material.bytes, created.value.envelope);
  if (!authored.ok) throw Error(authored.messageKo);
  const bytes = withAuthoring ? authored.value : material.bytes;
  const hash = `sha256:${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("")}` as const;
  const verification = await validateStudioBg3dGlb(bytes, { profile: "desktop", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    declared: { byteSize: bytes.byteLength, sha256: hash, mimeType: "model/gltf-binary" }, cumulative: { usedBytes: 0, maximumBytes: 100 * 1024 * 1024 },
    supportedRequiredExtensions: [] });
  if (!verification.ok) throw Error(verification.code);
  const record: Bg3dVerifiedStoredRecord = { id: "stored-authored", storageVersion: 2, name: "편집 상자.glb", format: "glb", blob: new Blob([bytes], { type: "model/gltf-binary" }),
    thumbnail: null, createdAt: 1, updatedAt: 1, contentHash: hash, byteSize: bytes.byteLength, mime: "model/gltf-binary", validationVersion: 1,
    validatedAt: 1, validatorProfile: "desktop", validatorMetrics: verification.metrics,
    rights: { status: "licensed", commercialUse: true, attributionRequired: true, attribution: "원저작자", licenseName: "시험 사용권" },
    ...(modelFileExport ? { sourceRestriction: { version: 1 as const, modelFileExport, origin: modelFileExport === "allowed"
      ? { kind: "user-file" as const, recordId: "stored-authored", sha256: hash } : null, parent: null } } : {}) };
  records.set(record.id, record); verifications.set(record.id, verification);
  const attachment: StudioBg3dModelAttachment = { id: "attachment-authored", name: record.name, hash: record.contentHash,
    byteSize: record.byteSize, mime: record.mime, source: "upload", rights: record.rights };
  const document = createDefaultStudioBg3dSceneDocument();
  const quality = resolveStudioBg3dDeviceQuality({ document, mode: "edit", preference: "desktop",
    signals: { cssWidth: 1600, cssHeight: 1000, devicePixelRatio: 1, pointer: "fine", saveData: false, deviceMemoryGb: 8, hardwareConcurrency: 8 } });
  const cache = new Map<string, StudioBg3dModelRootCacheEntry>();
  const entry = await admitAndCacheStudioBg3dModel({ record, document, quality, renderer: null, cumulativeUsedBytes: 0,
    cache, pending: new Map(), isActive: () => true });
  caches.push(entry);
  const k = entry.normalizationScale;
  if (!k) throw Error("실제 cache k 없음");
  const model: BgCustomModelInstance = { id: "duplicate-instance", modelId: record.id, name: "현재 인스턴스", tags: ["실내"],
    position: [...HISTORICAL.position], rotation: [...HISTORICAL.rotationEulerRad],
    scale: [HISTORICAL.scale[0] / k, HISTORICAL.scale[1] / k, HISTORICAL.scale[2] / k],
    materialOverride: createStudioBg3dPrimitiveEditMaterial("#2244aa") };
  const attachments = new Map([[record.id, attachment]]), reverse = new Map([[attachment.id, record.id]]);
  const canonical = tryAdaptStudioBg3dRuntimeToDocument({ primitives: [], customModels: [model], baseDocument: document, attachmentByStorageModelId: attachments });
  if (!canonical.ok) throw Error("정본 fixture 실패");
  const live: { current: StudioBg3dPrimitiveEditRuntime } = { current: { primitives: [], customModels: [model], document: canonical.value.document } };
  const selected = { current: new Set([model.id]) }, session: { current: object | null } = { current: {} };
  let locked = false;
  const host: StudioBg3dAuthoredModelEditSourceHost = { open: true, selectedIds: new Set(["stale-render"]), selectedIdsRef: selected,
    physicsRuntimeSourceRef: live, modalAssetSessionRef: session, attachmentByStorageModelIdRef: { current: attachments },
    storageModelIdByAttachmentIdRef: { current: reverse }, modelRootCacheRef: { current: cache }, isPrimitiveEditInteractionLocked: () => locked };
  storage.get.mockClear();
  return { host, live, selected, session, model, record, bytes, mesh, attachment, attachments, reverse, cache, entry, k, lock: () => { locked = true; } };
}

function deferred() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
beforeEach(() => {
  records.clear(); verifications.clear();
  storage.get.mockReset().mockImplementation(async (id) => records.get(id) ?? null);
  storage.source.mockReset().mockImplementation(async (id) => {
    const record = records.get(id);
    return record ? { record, sourceKind: "local-library", manifestRevision: 1, catalogIdentity: null } : null;
  });
  storage.admit.mockReset().mockImplementation(async (id) => { const value = verifications.get(id); if (!value) throw Error("검증 원본 없음"); return value; });
});
afterEach(() => { for (const entry of caches.splice(0)) entry.dispose(); vi.restoreAllMocks(); });

describe("저장 authored model의 재편집 원본 권위", () => {
  it.each(["allowed", "service-only", "unknown"] as const)("실제 %s 제한을 가공 가능 snapshot에 보존하고 제한만 바뀌어도 reread에서 거부한다", async (restriction) => {
    const f = await fixture(true, restriction), before = JSON.stringify(f.live.current);
    const captured = await captureStudioBg3dAuthoredModelEditSource(f.host, signal());
    expect(captured.ok).toBe(true); if (!captured.ok) throw new Error(captured.messageKo);
    expect(captured.snapshot.recordIdentity.sourceRestriction).toEqual(f.record.sourceRestriction);
    records.set(f.record.id, { ...f.record, sourceRestriction: { version: 1,
      modelFileExport: restriction === "service-only" ? "unknown" : "service-only", origin: null, parent: null } });
    expect((await rereadStudioBg3dAuthoredModelEditSource(f.host, captured.snapshot, signal())).ok).toBe(false);
    expect(JSON.stringify(f.live.current)).toBe(before); expect(f.cache.get(f.record.id)).toBe(f.entry);
  });

  it("legacy cache와 byte row가 같아도 실제 카탈로그/저장 권위의 다른 제한을 누락하지 않는다", async () => {
    const f = await fixture(), before = JSON.stringify(f.live.current);
    storage.source.mockResolvedValue({ record: { ...f.record,
      sourceRestriction: { version: 1, modelFileExport: "service-only", origin: null, parent: null } },
      sourceKind: "local-library", manifestRevision: 1, catalogIdentity: null });
    expect((await captureStudioBg3dAuthoredModelEditSource(f.host, signal())).ok).toBe(false);
    expect(JSON.stringify(f.live.current)).toBe(before); expect(f.cache.get(f.record.id)).toBe(f.entry);
  });

  it("실제 exporter·GLB reader·verified loader·cache의 다른 instance ID를 hash/권리와 묶어 독립 사본을 발행한다", async () => {
    const f = await fixture();
    expect(inspectStudioBg3dAuthoredModelEditSource(f.host)).toEqual({ nodeId: f.model.id, name: f.model.name, blockedReason: null });
    expect(storage.get).not.toHaveBeenCalled();
    const result = await captureStudioBg3dAuthoredModelEditSource(f.host, signal());
    expect(result.ok).toBe(true); if (!result.ok) throw Error(result.messageKo);
    const s = result.snapshot;
    expect(storage.get).toHaveBeenCalledExactlyOnceWith(f.record.id, { signal: expect.any(AbortSignal) });
    expect(s.kind).toBe("authored-model"); expect(s.sourceNodeId).not.toBe(s.authoring.envelope.source.assetId);
    expect(hashStudioEditableMesh(s.authoring.mesh)).toBe(hashStudioEditableMesh(f.mesh));
    expect(s.recordIdentity).toEqual({ storageModelId: f.record.id, attachmentId: f.attachment.id, contentHash: f.record.contentHash,
      byteSize: f.record.byteSize, mime: f.record.mime, rights: f.record.rights,
      sourceRestriction: readStudioBg3dEffectiveModelSourceRestriction(f.record) });
    expect(s.cache).toBe(f.entry); expect(s.cacheRoot).toBe(f.entry.root); expect(s.normalizationScale).toBe(f.k);
    expect(s.objectTransformBasis).toBe("historical-exact"); expect(s.objectTransform).toEqual(HISTORICAL);
    expect(s.sourceColorSrgb).toBe("#2244aa"); expect(s.authoring.envelope.sourceMaterialAtExport.colorSrgb).toBe("#c9a876");
    expect(s.model).not.toBe(f.model); expect(s.model.position).not.toBe(f.model.position);
    for (const value of [s.model, s.model.position, s.model.materialOverride, s.authoring, s.authoring.mesh.vertices,
      s.authoring.mesh.vertices[0], s.authoring.envelope.mesh, s.objectTransform, s.recordIdentity.rights,
      s.recordIdentity.sourceRestriction]) expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(f.entry)).toBe(false); expect(Object.isFrozen(f.entry.root)).toBe(false);
    expect(revalidateStudioBg3dAuthoredModelEditSource(f.host, s).ok).toBe(true);
    expect((await rereadStudioBg3dAuthoredModelEditSource(f.host, s, signal())).ok).toBe(true);
    expect(storage.get).toHaveBeenCalledTimes(2);
  });

  it("현재 canonical 위치·회전·modelScale*k를 사용하고 history TRS를 복원값으로 덮지 않는다", async () => {
    const f = await fixture(); f.model.position[0] = 7; f.model.rotation[1] = 0.2; f.model.scale[2] *= 1.3;
    const result = await captureStudioBg3dAuthoredModelEditSource(f.host, signal());
    if (!result.ok) throw Error(result.messageKo);
    expect(result.snapshot.objectTransformBasis).toBe("current-instance");
    expect(result.snapshot.objectTransform).toEqual({ revision: 1, position: result.snapshot.canonicalNode.transform.position, rotationEulerRad: result.snapshot.canonicalNode.transform.rotation,
      scale: f.model.scale.map((value) => value * f.k) });
    expect(result.snapshot.authoring.envelope.objectTransformAtExport).toEqual(HISTORICAL);
  });

  it("다른 복제 인스턴스·공유 캐시를 바꾸지 않고 한 ULP의 현재 scale 변경도 과거 exact로 되돌리지 않는다", async () => {
    const f = await fixture();
    const other = { ...f.model, id: "another-instance", position: [9, 0, 0] as [number, number, number] };
    f.live.current = { ...f.live.current, customModels: [...f.live.current.customModels, other] };
    f.model.scale[0] += Number.EPSILON;
    const result = await captureStudioBg3dAuthoredModelEditSource(f.host, signal());
    if (!result.ok) throw Error(result.messageKo);
    expect(result.snapshot.objectTransformBasis).toBe("current-instance");
    expect(result.snapshot.objectTransform.scale[0]).toBe(f.model.scale[0] * f.k);
    expect(f.live.current.customModels[1]).toBe(other); expect(other.position).toEqual([9, 0, 0]);
    expect(f.cache.get(f.record.id)).toBe(f.entry); expect(f.entry.root.scale.toArray()).toEqual([f.k, f.k, f.k]);
  });

  it("현재 modelScale*k가 DCC 범위를 벗어나면 잘라 받지 않고 저장 읽기 전에 거부한다", async () => {
    const f = await fixture();
    Object.defineProperty(f.entry, "normalizationScale", { value: 1e12 }); f.entry.root.scale.setScalar(1e12);
    expect(await captureStudioBg3dAuthoredModelEditSource(f.host, signal())).toMatchObject({ ok: false, code: "invalid-source",
      messageKo: expect.stringContaining("배율") });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it.each([undefined, DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE])("neutral override %s에서는 GLB 역사 색을 현재 색으로 쓴다", async (materialOverride) => {
    const f = await fixture(); f.model.materialOverride = materialOverride;
    const result = await captureStudioBg3dAuthoredModelEditSource(f.host, signal());
    expect(result.ok && result.snapshot.sourceColorSrgb).toBe("#c9a876");
  });

  it("실제 Blob SHA 변조와 record metadata/권리 변경·원본 누락·저장 예외를 성공으로 바꾸지 않는다", async () => {
    const f = await fixture();
    const tampered = Uint8Array.from(f.bytes); tampered[tampered.length - 1] ^= 1;
    for (const record of [null, { ...f.record, blob: new Blob([tampered], { type: f.record.mime }) },
      { ...f.record, rights: { ...f.record.rights, licenseName: "다른 권리" } }, { ...f.record, byteSize: f.record.byteSize + 1 }]) {
      storage.get.mockResolvedValueOnce(record);
      expect((await captureStudioBg3dAuthoredModelEditSource(f.host, signal())).ok).toBe(false);
    }
    storage.get.mockRejectedValueOnce(new Error("OPFS read failed"));
    expect(await captureStudioBg3dAuthoredModelEditSource(f.host, signal())).toMatchObject({ ok: false, code: "read-failed" });
    expect(f.live.current.customModels[0]).toBe(f.model); expect(f.cache.get(f.record.id)).toBe(f.entry);
  });

  it("표식이 없는 유효 GLB의 거부는 실제 authoring reader에 위임한다", async () => {
    const f = await fixture(false);
    expect(await captureStudioBg3dAuthoredModelEditSource(f.host, signal())).toMatchObject({ ok: false, code: "invalid-authoring",
      messageKo: expect.stringContaining("원본 면 편집 데이터가 없습니다") });
  });

  it("미리 취소한 capture/reread는 저장 권위를 읽지 않는다", async () => {
    const f = await fixture(); const captured = await captureStudioBg3dAuthoredModelEditSource(f.host, signal());
    if (!captured.ok) throw Error(captured.messageKo);
    storage.get.mockClear(); const controller = new AbortController(); controller.abort();
    expect(await captureStudioBg3dAuthoredModelEditSource(f.host, controller.signal)).toMatchObject({ ok: false, code: "aborted" });
    expect(await rereadStudioBg3dAuthoredModelEditSource(f.host, captured.snapshot, controller.signal)).toMatchObject({ ok: false, code: "aborted" });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it.each(["hidden-tag", "mixed", "duplicate", "cache-loading", "reverse", "attachment-rights"] as const)("%s 경계가 맞지 않으면 원본 I/O 전에 거부한다", async (kind) => {
    const f = await fixture();
    if (kind === "hidden-tag") f.live.current = { ...f.live.current, document: { ...f.live.current.document, meta: { hiddenTags: ["실내"] } } };
    if (kind === "mixed") f.selected.current = new Set([f.model.id, "another"]);
    if (kind === "duplicate") f.live.current = { ...f.live.current, customModels: [...f.live.current.customModels, { ...f.model }] };
    if (kind === "cache-loading") f.cache.clear();
    if (kind === "reverse") f.reverse.set(f.attachment.id, "different-storage");
    if (kind === "attachment-rights") f.attachments.set(f.record.id, { ...f.attachment, rights: { ...f.attachment.rights, attribution: "변경된 저작자" } });
    expect((await captureStudioBg3dAuthoredModelEditSource(f.host, signal())).ok).toBe(false);
    expect(storage.get).not.toHaveBeenCalled();
  });

  it.each(["session", "selection", "lock", "transform", "color", "cache", "root", "binding", "record"] as const)("저장 읽기 대기 중 %s 변경을 다시 검사한다", async (change) => {
    const f = await fixture(), gate = deferred();
    storage.get.mockImplementationOnce(async () => { await gate.promise; return f.record; });
    const pending = captureStudioBg3dAuthoredModelEditSource(f.host, signal());
    await vi.waitFor(() => expect(storage.get).toHaveBeenCalledOnce());
    if (change === "session") f.session.current = {};
    if (change === "selection") f.selected.current = new Set();
    if (change === "lock") f.lock();
    if (change === "transform") f.model.position[0] += 1;
    if (change === "color") f.model.materialOverride = createStudioBg3dPrimitiveEditMaterial("#abcdef");
    if (change === "cache") f.cache.set(f.record.id, { ...f.entry });
    if (change === "root") Object.defineProperty(f.entry, "root", { value: new Group(), configurable: true });
    if (change === "binding") f.reverse.set(f.attachment.id, "another-storage-id");
    if (change === "record") Object.defineProperty(f.entry, "record", { value: { ...f.record, rights: { ...f.record.rights, attribution: "다른 저작자" } } });
    gate.release(); expect((await pending).ok).toBe(false);
  });

  it("Blob 읽기와 SHA 계산을 기다리는 사이의 변경·취소도 fence에서 거부한다", async () => {
    const f = await fixture(), blobGate = deferred(), controller = new AbortController();
    class DelayedBlob extends Blob { override async arrayBuffer() { await blobGate.promise; return super.arrayBuffer(); } }
    storage.get.mockResolvedValueOnce({ ...f.record, blob: new DelayedBlob([f.bytes], { type: f.record.mime }) });
    const pending = captureStudioBg3dAuthoredModelEditSource(f.host, controller.signal);
    await vi.waitFor(() => expect(storage.get).toHaveBeenCalledOnce()); controller.abort(); blobGate.release();
    expect(await pending).toMatchObject({ ok: false, code: "aborted" });
    const digestGate = deferred(), original = crypto.subtle.digest.bind(crypto.subtle);
    const digest = vi.spyOn(crypto.subtle, "digest").mockImplementationOnce(async (...args) => { await digestGate.promise; return original(...args); });
    const hashing = captureStudioBg3dAuthoredModelEditSource(f.host, signal());
    await vi.waitFor(() => expect(digest).toHaveBeenCalledOnce()); f.model.position[0] = 12; digestGate.release();
    expect(await hashing).toMatchObject({ ok: false, code: "source-changed" });
  });

  it("snapshot 복제·cache identity/k·같은 record Blob 변조를 reread에서 거부하고 무관한 장면 변경은 허용한다", async () => {
    const f = await fixture(); const result = await captureStudioBg3dAuthoredModelEditSource(f.host, signal());
    if (!result.ok) throw Error(result.messageKo); const s = result.snapshot;
    expect(revalidateStudioBg3dAuthoredModelEditSource(f.host, { ...s })).toMatchObject({ ok: false, code: "source-changed" });
    f.live.current = { ...f.live.current, document: { ...f.live.current.document, camera: { ...f.live.current.document.camera, position: [4, 5, 6] } } };
    expect(revalidateStudioBg3dAuthoredModelEditSource(f.host, s).ok).toBe(true);
    f.cache.set(f.record.id, { ...f.entry }); expect(revalidateStudioBg3dAuthoredModelEditSource(f.host, s).ok).toBe(false);
    f.cache.set(f.record.id, f.entry); Object.defineProperty(f.entry, "normalizationScale", { value: f.k * 2, configurable: true });
    expect(revalidateStudioBg3dAuthoredModelEditSource(f.host, s).ok).toBe(false);
    Object.defineProperty(f.entry, "normalizationScale", { value: f.k });
    const bytes = Uint8Array.from(f.bytes); bytes[bytes.length - 1] ^= 1;
    records.set(f.record.id, { ...f.record, blob: new Blob([bytes], { type: f.record.mime }) });
    expect(await rereadStudioBg3dAuthoredModelEditSource(f.host, s, signal())).toMatchObject({ ok: false, code: "asset-mismatch" });
  });

  it.each(["hidden", "locked", "parent", "child", "follower", "component", "paint", "pose", "morph", "animation", "constraints", "material"] as const)("%s 모델을 원본 읽기 전에 거부한다", async (kind) => {
    const f = await fixture();
    if (kind === "hidden") f.model.visible = false;
    if (kind === "locked") f.model.locked = true;
    if (kind === "parent") f.model.parentId = "other";
    if (kind === "child" || kind === "follower") f.live.current = { ...f.live.current, customModels: [...f.live.current.customModels,
      { ...f.model, id: "other", ...(kind === "child" ? { parentId: f.model.id } : { linkedSourceId: f.model.id }) }] };
    if (kind === "component") f.live.current = { ...f.live.current, customModels: [{ ...f.model, componentRef: { id: "component", name: "정의" } }] };
    if (kind === "paint") f.model.modelTexturePaint = { version: 1, targets: [] };
    if (kind === "pose") f.model.pose = { enabled: true, weight: 1, joints: [] };
    if (kind === "morph") f.model.morph = { enabled: true, weight: 1, targets: [] };
    if (kind === "animation") f.model.animation = { playing: false, clipIndex: 0, timeScale: 1, loop: "repeat", timeSeconds: 0, weight: 1 };
    if (kind === "constraints") f.model.constraints = { enabled: true, aims: [], twoBoneIks: [] };
    if (kind === "material") f.model.materialOverride = { ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, metalness: 0.8 };
    expect(inspectStudioBg3dAuthoredModelEditSource(f.host).blockedReason).toBeTruthy();
    expect((await captureStudioBg3dAuthoredModelEditSource(f.host, signal())).ok).toBe(false); expect(storage.get).not.toHaveBeenCalled();
  });

  it.each(["source-shadow", "other-shadow", "unused-attachment"] as const)("strict canonical→hydrate의 %s 손실을 capture/revalidate 이전에 차단한다", async (kind) => {
    const f = await fixture(); const captured = await captureStudioBg3dAuthoredModelEditSource(f.host, signal());
    if (!captured.ok) throw Error(captured.messageKo);
    const other = { ...f.live.current.document.nodes[0], id: "other" };
    const nodes = [...f.live.current.document.nodes, other].map((node) =>
      (kind === "source-shadow" && node.id === f.model.id) || (kind === "other-shadow" && node.id === "other") ? { ...node, castsShadow: false } : node);
    const unused = { ...f.attachment, id: "unused", hash: `sha256:${"b".repeat(64)}` };
    const document = { ...f.live.current.document, nodes, attachments: kind === "unused-attachment" ? [...f.live.current.document.attachments, unused] : f.live.current.document.attachments };
    expect(serializeStudioBg3dSceneDocument(document)).toBeTruthy();
    const hydrated = hydrateStudioBg3dDocumentToRuntime({ document, storageModelIdByAttachmentId: f.reverse });
    expect(hydrated.ok).toBe(true); expect(hydrated.diagnostics).toEqual([]);
    f.live.current = { primitives: hydrated.primitives, customModels: hydrated.customModels, document }; storage.get.mockClear();
    expect((await captureStudioBg3dAuthoredModelEditSource(f.host, signal())).ok).toBe(false);
    expect(revalidateStudioBg3dAuthoredModelEditSource(f.host, captured.snapshot).ok).toBe(false);
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("cache의 실제 재질/텍스처·변형 데이터는 payload marker와 별도로 검사한다", async () => {
    const f = await fixture();
    f.entry.root.traverse((node) => { if (node instanceof Mesh && node.material instanceof MeshStandardMaterial) node.material.roughness = 0.2; });
    expect((await captureStudioBg3dAuthoredModelEditSource(f.host, signal())).ok).toBe(false); expect(storage.get).not.toHaveBeenCalled();
  });

  it("같은 캐시의 기본색이 바뀐 경우 현재 override와 역사 색을 혼동하지 않고 capture/revalidate에서 거부한다", async () => {
    const f = await fixture(); const captured = await captureStudioBg3dAuthoredModelEditSource(f.host, signal());
    if (!captured.ok) throw Error(captured.messageKo);
    f.entry.root.traverse((node) => { if (node instanceof Mesh && node.material instanceof MeshStandardMaterial) node.material.color.set("#f0a020"); });
    expect(await captureStudioBg3dAuthoredModelEditSource(f.host, signal())).toMatchObject({ ok: false, code: "asset-mismatch" });
    expect(revalidateStudioBg3dAuthoredModelEditSource(f.host, captured.snapshot)).toMatchObject({ ok: false, code: "source-changed" });
  });
});
