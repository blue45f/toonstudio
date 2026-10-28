import { Mesh } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";
import { pushPullStudioEditableMeshFaces } from "../hybrid-dcc/studio-hybrid-dcc-face-pushpull";
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { captureStudioBg3dAuthoredModelEditSource, revalidateStudioBg3dAuthoredModelEditSource } from "./studio-bg3d-authored-model-edit-source";
import { replaceStudioBg3dAuthoredModelEditSource } from "./studio-bg3d-authored-model-edit-replacement";
import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import { resolveStudioBg3dDeviceQuality } from "./studio-bg3d-device-quality";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb } from "./studio-bg3d-glb-validation";
import { commitStudioBg3dHistoryTransition, resetStudioBg3dCommandHistory, stepStudioBg3dCommandHistory } from "./studio-bg3d-history-command-adapter";
import { admitAndCacheStudioBg3dModel } from "./studio-bg3d-model-runtime-admission";
import { createStudioBg3dPrimitiveEditAuthoring } from "./studio-bg3d-primitive-edit-authoring";
import { writeStudioBg3dPrimitiveEditAuthoringToGlb } from "./studio-bg3d-primitive-edit-authoring-glb";
import { writeStudioBg3dPrimitiveEditMaterialGlb } from "./studio-bg3d-primitive-edit-material";
import { convertStudioBg3dPrimitiveToEditableMesh } from "./studio-bg3d-primitive-edit-mesh";
import { createStudioBg3dPrimitiveEditMaterial } from "./studio-bg3d-primitive-edit-replacement";
import { createDefaultStudioBg3dSceneDocument, STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES } from "./studio-bg3d-scene-document";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { StudioHybridDccObjectTransform } from "../hybrid-dcc/studio-hybrid-dcc-object-transform";
import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import type { StudioBg3dAuthoredModelEditReplacementHost } from "./studio-bg3d-authored-model-edit-replacement";
import type { StudioBg3dGlbValidationSuccess } from "./studio-bg3d-glb-validation";
import type { StudioBg3dHistoryCommandRefs } from "./studio-bg3d-history-command-adapter";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { StudioBg3dPrimitiveEditReplacementAsset } from "./studio-bg3d-primitive-edit-replacement";
import type { StudioBg3dPrimitiveEditRuntime } from "./studio-bg3d-primitive-edit-source";
import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";

type Library = typeof import("./bg3d-model-library");
const storage = vi.hoisted(() => ({ get: vi.fn<Library["getStoredBg3dModelV12"]>(), admit: vi.fn<Library["admitStoredBg3dModelForRenderingV12"]>() }));
vi.mock("./studio-bg3d-model-library-loader", () => ({ getStoredBg3dModelV12: storage.get, admitStoredBg3dModelForRenderingV12: storage.admit }));
const records = new Map<string, Bg3dVerifiedStoredRecord>(), verifications = new Map<string, StudioBg3dGlbValidationSuccess>();
const resources: StudioBg3dModelRootCacheEntry[] = [];
const HISTORICAL: StudioHybridDccObjectTransform = { revision: 1, position: [2.25, 0.75, -3.5], rotationEulerRad: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2] };
const RIGHTS: Bg3dVerifiedStoredRecord["rights"] = { status: "licensed", commercialUse: true, attributionRequired: true, attribution: "원저작자", licenseName: "시험 사용권" };

async function makeAsset(id: string, distance: number, transform = HISTORICAL, colorSrgb = "#c9a876") {
  const converted = convertStudioBg3dPrimitiveToEditableMesh({ id: "actual-original-box", kind: "box" });
  if (!converted.ok) throw Error(converted.detail);
  const edited = distance === 0 ? null : pushPullStudioEditableMeshFaces(converted.value.mesh, [2], distance);
  if (edited && !edited.ok) throw Error(edited.detail);
  const mesh = edited?.ok ? edited.value.mesh : converted.value.mesh;
  const authored = createStudioBg3dPrimitiveEditAuthoring({ assetId: "actual-original-box", revision: 2, mesh, objectTransformAtExport: transform, colorSrgb });
  if (!authored.ok) throw Error(authored.messageKo);
  const exported = exportStudioHybridDccMeshGlb({ assetId: "actual-original-box", mesh, sourceHash: hashStudioEditableMesh(mesh), sourceRevision: 2 });
  if (!exported.ok) throw Error("실제 GLB export 실패");
  const material = writeStudioBg3dPrimitiveEditMaterialGlb(exported.bytes, colorSrgb);
  if (!material.ok) throw Error(material.messageKo);
  const embedded = writeStudioBg3dPrimitiveEditAuthoringToGlb(material.bytes, authored.value.envelope);
  if (!embedded.ok) throw Error(embedded.messageKo);
  const bytes = embedded.value;
  const contentHash: `sha256:${string}` = `sha256:${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("")}`;
  const verification = await validateStudioBg3dGlb(bytes, { profile: "desktop", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    declared: { byteSize: bytes.byteLength, sha256: contentHash, mimeType: "model/gltf-binary" }, cumulative: { usedBytes: 0, maximumBytes: 100 * 1024 * 1024 } });
  if (!verification.ok) throw Error(verification.code);
  const record: Bg3dVerifiedStoredRecord = { id, storageVersion: 2, name: `${id}.glb`, format: "glb", blob: new Blob([bytes], { type: "model/gltf-binary" }),
    thumbnail: null, createdAt: 1, updatedAt: 1, contentHash, byteSize: bytes.byteLength, mime: "model/gltf-binary", validationVersion: 1,
    validatedAt: 1, validatorProfile: "desktop", validatorMetrics: verification.metrics, rights: { ...RIGHTS } };
  records.set(id, record); verifications.set(id, verification);
  const document = createDefaultStudioBg3dSceneDocument();
  const quality = resolveStudioBg3dDeviceQuality({ document, mode: "edit", preference: "desktop",
    signals: { cssWidth: 1600, cssHeight: 1000, devicePixelRatio: 1, pointer: "fine", saveData: false, deviceMemoryGb: 8, hardwareConcurrency: 8 } });
  const entry = await admitAndCacheStudioBg3dModel({ record, document, quality, renderer: null, cumulativeUsedBytes: 0,
    cache: new Map(), pending: new Map(), isActive: () => true });
  resources.push(entry);
  const attachment: StudioBg3dModelAttachment = { id: `attachment-${id}`, name: record.name, hash: contentHash,
    byteSize: record.byteSize, mime: record.mime, source: "upload", rights: record.rights };
  const asset: StudioBg3dPrimitiveEditReplacementAsset = { storageModelId: id, record, attachment, cache: entry };
  return { record, attachment, entry, asset, bytes };
}

async function fixture(shared = false, moved = true, nextDistance = 0.5) {
  const old = await makeAsset("stored-A", 0.25), other = await makeAsset("stored-C", 0);
  const k = old.entry.normalizationScale;
  if (!k) throw Error("실제 normalization 없음");
  const model: BgCustomModelInstance = { id: "same-node", modelId: old.record.id, name: "현재 원본 이름", tags: ["상자", "실내"], visible: true, locked: false, parentId: null,
    position: moved ? [7, 0.9, -2] : [...HISTORICAL.position], rotation: moved ? [0.2, -0.4, 0.1] : [...HISTORICAL.rotationEulerRad],
    scale: [HISTORICAL.scale[0] / k, HISTORICAL.scale[1] / k, HISTORICAL.scale[2] / k * (moved ? 1.25 : 1)],
    materialOverride: createStudioBg3dPrimitiveEditMaterial("#2244aa") };
  const otherModel: BgCustomModelInstance = { id: "other-node", modelId: other.record.id, name: "보존할 다른 모델", tags: ["다른"],
    position: [12, 0, -4], rotation: [0.1, 0, 0], scale: [1, 1, 1], visible: false, locked: true };
  const sharedModel: BgCustomModelInstance = { ...model, id: "shared-instance", name: "같은 캐시의 독립 인스턴스", position: [9, 0, 0] };
  const customModels = shared ? [model, otherModel, sharedModel] : [model, otherModel];
  const attachments = new Map([[old.record.id, old.attachment], [other.record.id, other.attachment]]);
  const cache = new Map([[old.record.id, old.entry], [other.record.id, other.entry]]);
  const reverse = new Map([[old.attachment.id, old.record.id], [other.attachment.id, other.record.id]]);
  const base = { ...createDefaultStudioBg3dSceneDocument(), meta: { name: "기존 장면", memo: "보존할 정보" },
    shots: [{ id: "cut", name: "유지할 컷", nodeVisibility: [{ nodeId: model.id, visible: false }] }] };
  const canonical = tryAdaptStudioBg3dRuntimeToDocument({ primitives: [], customModels, baseDocument: base, attachmentByStorageModelId: attachments });
  if (!canonical.ok) throw Error("실제 정본 fixture 실패");
  const live: { current: StudioBg3dPrimitiveEditRuntime } = { current: { primitives: [], customModels, document: canonical.value.document } };
  const selected = { current: new Set([model.id]) }, session: { current: object | null } = { current: {} };
  const history: StudioBg3dHistoryCommandRefs = { historyRef: { current: [] }, historyIndexRef: { current: -1 }, historyCommandTimelineRef: { current: null } };
  resetStudioBg3dCommandHistory(history, createStudioBg3dHistorySnapshot(live.current));
  const replace = vi.fn<StudioBg3dAuthoredModelEditReplacementHost["replaceCanonicalDocumentState"]>((mutation) => {
    live.current = { primitives: mutation.primitives ?? live.current.primitives, customModels: mutation.customModels ?? live.current.customModels, document: mutation.document ?? live.current.document };
  });
  const commit = vi.fn<StudioBg3dAuthoredModelEditReplacementHost["commitImmediateHistoryTransition"]>((primitives, models, document, before, options) => {
    commitStudioBg3dHistoryTransition(history, { before, after: createStudioBg3dHistorySnapshot({ primitives, customModels: models, document }), ...options });
  });
  let locked = false;
  const host: StudioBg3dAuthoredModelEditReplacementHost = { open: true, selectedIdsRef: selected, physicsRuntimeSourceRef: live, modalAssetSessionRef: session,
    modelRootCacheRef: { current: cache }, attachmentByStorageModelIdRef: { current: attachments }, storageModelIdByAttachmentIdRef: { current: reverse },
    isPrimitiveEditInteractionLocked: () => locked, replaceCanonicalDocumentState: replace, commitImmediateHistoryTransition: commit };
  const captured = await captureStudioBg3dAuthoredModelEditSource(host, new AbortController().signal);
  if (!captured.ok) throw Error(captured.messageKo);
  const source = captured.snapshot, next = await makeAsset("stored-B", nextDistance, source.objectTransform, source.sourceColorSrgb);
  cache.set(next.record.id, next.entry); attachments.set(next.record.id, next.attachment); reverse.set(next.attachment.id, next.record.id);
  return { host, source, next, old, other, live, model, otherModel, sharedModel, selected, session, history, replace, commit, cache, attachments, reverse, lock: () => { locked = true; } };
}

beforeEach(() => {
  records.clear(); verifications.clear();
  storage.get.mockReset().mockImplementation(async (id) => records.get(id) ?? null);
  storage.admit.mockReset().mockImplementation(async (id) => { const value = verifications.get(id); if (!value) throw Error("검증 원본 없음"); return value; });
});
afterEach(() => { for (const resource of resources.splice(0)) resource.dispose(); vi.restoreAllMocks(); });

describe("authored model A→B의 같은 node 원본 교체", () => {
  it.each([false, true])("공유=%s: 같은 ID·현재 canonical TRS·단색을 보존하고 실제 history로 한 번씩 Undo/Redo한다", async (shared) => {
    const f = await fixture(shared), before = createStudioBg3dHistorySnapshot(f.live.current), selectionIdentity = f.selected.current;
    const oldBlob = f.old.record.blob, oldCacheScale = f.old.entry.root.scale.toArray();
    const dispose = vi.spyOn(f.old.entry, "dispose");
    const result = replaceStudioBg3dAuthoredModelEditSource(f.host, f.source, f.next.asset);
    expect(result.ok).toBe(true); expect(f.replace).toHaveBeenCalledOnce(); expect(f.commit).toHaveBeenCalledOnce();
    const edited = f.live.current.customModels.find(({ id }) => id === f.model.id);
    expect(edited).toMatchObject({ id: f.model.id, modelId: f.next.record.id, name: f.source.canonicalNode.name, tags: f.source.canonicalNode.tags,
      position: f.source.canonicalNode.transform.position, rotation: f.source.canonicalNode.transform.rotation,
      visible: true, locked: false, parentId: null, materialOverride: createStudioBg3dPrimitiveEditMaterial(f.source.sourceColorSrgb) });
    expect(edited?.scale).toEqual(f.source.objectTransform.scale.map((value) => value / (f.next.entry.normalizationScale ?? Number.NaN)));
    expect(f.source.objectTransformBasis).toBe("current-instance");
    expect(f.live.current.customModels.find(({ id }) => id === f.otherModel.id)).toBe(f.otherModel);
    if (shared) expect(f.live.current.customModels.find(({ id }) => id === f.sharedModel.id)).toBe(f.sharedModel);
    expect(f.live.current.document.attachments.some(({ id }) => id === f.old.attachment.id)).toBe(shared);
    expect(f.live.current.document.attachments.some(({ id }) => id === f.other.attachment.id)).toBe(true);
    expect(f.attachments.get(f.old.record.id)).toBe(f.old.attachment); expect(f.cache.get(f.old.record.id)).toBe(f.old.entry);
    expect(records.get(f.old.record.id)?.blob).toBe(oldBlob); expect(f.old.entry.root.scale.toArray()).toEqual(oldCacheScale); expect(dispose).not.toHaveBeenCalled();
    expect(f.selected.current).toBe(selectionIdentity); expect([...selectionIdentity]).toEqual([f.model.id]);
    const after = createStudioBg3dHistorySnapshot(f.live.current);
    expect(stepStudioBg3dCommandHistory(f.history, "undo")?.state).toEqual(before);
    expect(stepStudioBg3dCommandHistory(f.history, "redo")?.state).toEqual(after);
    expect(f.commit.mock.calls[0][4]).toEqual({ commandId: "studio.bg3d.authored-model-edit.replace", label: "모델 원본 면 재편집", source: "menu" });
    expect(f.live.current.document.meta).toEqual(before.document.meta); expect(f.live.current.document.shots).toEqual(before.document.shots);
    f.next.entry.root.traverse((object) => { if (object instanceof Mesh) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        expect(material.polygonOffset).toBe(true); expect(material.polygonOffsetFactor).toBe(1); expect(material.polygonOffsetUnits).toBe(1);
      }
    } });
  });

  it("원래 historical/k 배치가 그대로면 과거 exact scale을 새 k로 나누어 보존한다", async () => {
    const f = await fixture(false, false);
    expect(f.source.objectTransformBasis).toBe("historical-exact");
    expect(replaceStudioBg3dAuthoredModelEditSource(f.host, f.source, f.next.asset).ok).toBe(true);
    expect(f.live.current.customModels[0].scale).toEqual(HISTORICAL.scale.map((value) => value / (f.next.entry.normalizationScale ?? Number.NaN)));
  });

  it.each(["clone", "selection", "session", "transform", "lock"])("%s 원본 변경은 canonical/history를 쓰지 않는다", async (change) => {
    const f = await fixture();
    if (change === "selection") f.selected.current = new Set();
    if (change === "session") f.session.current = {};
    if (change === "transform") f.model.position[0] += 1;
    if (change === "lock") f.lock();
    const before = createStudioBg3dHistorySnapshot(f.live.current);
    expect(replaceStudioBg3dAuthoredModelEditSource(f.host, change === "clone" ? { ...f.source } : f.source, f.next.asset).ok).toBe(false);
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
    expect(createStudioBg3dHistorySnapshot(f.live.current)).toEqual(before);
  });

  it.each(["reverse", "attachment", "cache", "rights", "same-source"])("새 자산 %s 불일치는 기존 자산을 지우거나 history를 쓰지 않는다", async (change) => {
    const f = await fixture(); let candidate = f.next.asset;
    if (change === "reverse") f.reverse.set(f.next.attachment.id, "wrong-id");
    if (change === "attachment") candidate = { ...candidate, attachment: { ...candidate.attachment, hash: `sha256:${"0".repeat(64)}` } };
    if (change === "cache") candidate = { ...candidate, cache: { ...candidate.cache } };
    if (change === "rights") candidate = { ...candidate, record: { ...candidate.record, rights: { status: "owned", commercialUse: true, attributionRequired: false } } };
    if (change === "same-source") candidate = f.old.asset;
    const before = createStudioBg3dHistorySnapshot(f.live.current);
    expect(replaceStudioBg3dAuthoredModelEditSource(f.host, f.source, candidate)).toMatchObject({ ok: false, code: "asset-mismatch" });
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
    expect(createStudioBg3dHistorySnapshot(f.live.current)).toEqual(before); expect(f.cache.get(f.old.record.id)).toBe(f.old.entry);
  });

  it.each(["scale", "metrics", "material", "normalization"])("새 자산 %s가 현재 범위·예산을 벗어나면 원자적으로 거부한다", async (change) => {
    const f = await fixture(); let candidate = f.next.asset;
    if (change === "scale") {
      const entry = { ...f.next.entry, normalizationScale: 1e-6 }; entry.root.scale.setScalar(1e-6);
      f.cache.set(f.next.record.id, entry); candidate = { ...candidate, cache: entry };
    }
    if (change === "metrics") {
      const entry = { ...f.next.entry, metrics: { ...f.next.entry.metrics, triangles: f.next.entry.metrics.triangles + 1 } };
      f.cache.set(f.next.record.id, entry); candidate = { ...candidate, cache: entry };
    }
    if (change === "material") f.next.entry.root.traverse((object) => { if (object instanceof Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.transparent = true; });
    if (change === "normalization") f.next.entry.root.position.x = 0.1;
    const before = createStudioBg3dHistorySnapshot(f.live.current);
    expect(replaceStudioBg3dAuthoredModelEditSource(f.host, f.source, candidate).ok).toBe(false);
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled(); expect(createStudioBg3dHistorySnapshot(f.live.current)).toEqual(before);
  });

  it("admission 이후 최신 렌더 예산이 줄어들면 새 캐시의 실제 metrics로 거부한다", async () => {
    const f = await fixture();
    f.live.current = { ...f.live.current, document: { ...f.live.current.document, budgets: { ...f.live.current.document.budgets,
      complexity: { ...f.live.current.document.budgets.complexity, maxTriangles: 1 } } } };
    expect(replaceStudioBg3dAuthoredModelEditSource(f.host, f.source, f.next.asset).ok).toBe(false);
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it("후보 검사 도중 선택이 바뀌면 마지막 브랜드 source fence에서 막는다", async () => {
    const f = await fixture(), root = f.next.entry.root, original = root.traverse;
    let changed = false;
    vi.spyOn(root, "traverse").mockImplementation((visit) => {
      original.call(root, visit);
      if (!changed) { changed = true; f.selected.current = new Set(); }
    });
    expect(replaceStudioBg3dAuthoredModelEditSource(f.host, f.source, f.next.asset).ok).toBe(false);
    expect(changed).toBe(true); expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
    expect(f.live.current.customModels[0].modelId).toBe(f.old.record.id);
  });

  it("512개 노드 경계에서도 새 노드를 추가하지 않고 다른 최신 노드를 모두 보존한다", async () => {
    const f = await fixture();
    const primitives: BgPrimitive[] = Array.from({ length: 510 }, (_, index) => ({ id: `late-node-${index}`, kind: "box", color: "#ffffff",
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }));
    f.live.current = { ...f.live.current, primitives, document: { ...f.live.current.document, budgets: { ...f.live.current.document.budgets,
      complexity: { ...f.live.current.document.budgets.complexity, maxNodes: 512 } } } };
    expect(replaceStudioBg3dAuthoredModelEditSource(f.host, f.source, f.next.asset).ok).toBe(true);
    expect(f.live.current.document.nodes).toHaveLength(512); expect(f.live.current.primitives).toBe(primitives);
    expect(f.live.current.customModels).toHaveLength(2); expect(f.commit).toHaveBeenCalledOnce(); expect(f.replace).toHaveBeenCalledOnce();
  });

  it("320KiB 직전의 실제 원본 후보도 새 scale의 직렬화 증가가 넘치면 history 없이 거부한다", async () => {
    const f = await fixture(false, true, 0.12345678901234566);
    const document = { ...f.live.current.document, budgets: { ...f.live.current.document.budgets,
      complexity: { ...f.live.current.document.budgets.complexity, maxNodes: 512 } } };
    const build = (totalPadding: number): BgPrimitive[] => Array.from({ length: 500 }, (_, index) => ({ id: `padding-${index}`, kind: "box", color: "#ffffff",
      name: `도형${"가".repeat(Math.floor(totalPadding / 500) + (index < totalPadding % 500 ? 1 : 0))}`,
      tags: Array.from({ length: 8 }, (_, tag) => `t${tag}${"t".repeat(29)}`), position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }));
    let low = 0, high = 500 * 78, closest: BgPrimitive[] | null = null, bytes = 0;
    while (low <= high) {
      const padding = Math.floor((low + high) / 2), primitives = build(padding);
      const adapted = tryAdaptStudioBg3dRuntimeToDocument({ primitives, customModels: f.live.current.customModels, baseDocument: document,
        attachmentByStorageModelId: f.attachments });
      if (!adapted.ok) { high = padding - 1; continue; }
      closest = primitives; bytes = new TextEncoder().encode(adapted.value.serialized).byteLength; low = padding + 1;
    }
    if (!closest) throw Error("320KiB 직전의 정규 후보가 필요합니다.");
    expect(STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES - bytes).toBeLessThan(3);
    f.live.current = { ...f.live.current, primitives: closest, document };
    const current = revalidateStudioBg3dAuthoredModelEditSource(f.host, f.source);
    expect(current.ok).toBe(true);
    if (!current.ok) throw Error(current.messageKo);
    expect(current.document.nodes).toHaveLength(502);
    const before = createStudioBg3dHistorySnapshot(f.live.current);
    expect(replaceStudioBg3dAuthoredModelEditSource(f.host, f.source, f.next.asset).ok).toBe(false);
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled(); expect(createStudioBg3dHistorySnapshot(f.live.current)).toEqual(before);
  });
});
