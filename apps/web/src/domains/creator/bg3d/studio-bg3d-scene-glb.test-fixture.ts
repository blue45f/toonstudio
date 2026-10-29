import { vi } from "vitest";

import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";
import { inspectStudioGeneric3dRuntimeHints } from "../studio-generic-3d-runtime-hints";
import { collectStudioBg3dThreeJoints, collectStudioBg3dThreeMorphTargets, computeAutoFitScale, loadVerifiedStudioBg3dGlbWithThree, measureBg3dObjectSize } from "../studio-background-3d-model";
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { BG3D_MODEL_LIBRARY_V12_MANIFEST_KIND, BG3D_MODEL_LIBRARY_V12_MANIFEST_VERSION,
  createStudioBg3dModelAttachment, parseV12ModelManifest } from "./bg3d-model-library";
import { resolveStudioBg3dDeviceQuality } from "./studio-bg3d-device-quality";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb } from "./studio-bg3d-glb-validation";
import { studioBg3dModalOperationCoordinator } from "./studio-bg3d-modal-operation-coordinator";
import { convertStudioBg3dPrimitiveToEditableMesh } from "./studio-bg3d-primitive-edit-mesh";
import { writeStudioBg3dPrimitiveEditMaterialGlb } from "./studio-bg3d-primitive-edit-material";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import { classifyStudioBg3dThreeSemanticMaterials } from "./studio-bg3d-three-semantic-materials";
import { parseStudioBg3dModelSourceRestriction, readStudioBg3dEffectiveModelSourceRestriction } from "./studio-bg3d-model-source-restriction";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import type { StudioBg3dViewportFramingState } from "./studio-bg3d-camera-application";
import type { StudioBg3dModalSession } from "./studio-bg3d-modal-operation-coordinator";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { StudioBg3dPrimitiveEditRuntime } from "./studio-bg3d-primitive-edit-source";
import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dSceneGlbExportHost } from "./studio-bg3d-scene-glb-source";
import type { StudioBg3dLibrariesAuthority, StudioBg3dLibraryBlobReceipt, StudioBg3dLibraryManifestSlot,
  StudioBg3dLibraryMutationContext, StudioBg3dLibraryMutationResult, StudioBg3dLibraryReadSnapshotContext } from "./studio-bg3d-libraries-sqlite-opfs-authority";
import type { StudioOpfsContentHash } from "../studio-opfs-asset-store";

export type MutableSceneGlbHost = { -readonly [Key in keyof StudioBg3dSceneGlbExportHost]: StudioBg3dSceneGlbExportHost[Key] };
const fixtures: { readonly session: { readonly current: StudioBg3dModalSession | null }; readonly entries: readonly StudioBg3dModelRootCacheEntry[] }[] = [];
export function disposeSceneGlbFixtures(): void {
  for (const fixture of fixtures.splice(0)) {
    if (fixture.session.current) studioBg3dModalOperationCoordinator.endSession(fixture.session.current);
    for (const entry of fixture.entries) entry.dispose();
  }
}
export function deferredSceneGlb<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

/** catalog HTTP 입력만 제공한다. 실제 parser/provenance 판단은 대체하지 않는다. */
export function emptySceneGlbFixtureBundleCatalog() {
  return { schema: "toonstudio.bg3d-bundle-theme-packs.v1", version: 1, inServiceOnly: true, downloadable: false,
    rights: { inServiceOnly: true, downloadable: false }, assetRoot: "/assets/studio/bundle-v2/",
    themes: [], packs: [], assets: [], presets: [], crowdPacks: [], pendingPacks: [],
    totals: { packs: 0, placeableAssets: 0, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 } };
}

/** 실제 V12 codec·manifest/CAS read adapter seam이다. SQLite/OPFS 통합·쓰기 잠금 증거는 아니다. */
function readOnlySceneModelAuthority() {
  const stored = new Map<string, Bg3dVerifiedStoredRecord>();
  const persistedRecords: ReadonlyMap<string, Bg3dVerifiedStoredRecord> = stored;
  const reads = { manifest: vi.fn<() => void>(), snapshot: vi.fn<() => void>(), blob: vi.fn<() => void>() };
  const mutationAttempts = vi.fn<() => void>();
  let revision = 0;
  const rawManifest = (records: ReadonlyMap<string, Bg3dVerifiedStoredRecord> = stored, currentRevision = revision): string => {
    const rows = [...records.values()].sort((left, right) => left.id.localeCompare(right.id)).map((record) => ({
      id: record.id, storageVersion: record.storageVersion, name: record.name, format: record.format,
      createdAt: record.createdAt, updatedAt: record.updatedAt, contentHash: record.contentHash, byteSize: record.byteSize,
      mime: record.mime, validationVersion: record.validationVersion, validatedAt: record.validatedAt,
      validatorProfile: record.validatorProfile, validatorMetrics: { ...record.validatorMetrics }, rights: { ...record.rights },
      ...(Object.hasOwn(record, "sourceRestriction") ? { sourceRestriction: readStudioBg3dEffectiveModelSourceRestriction(record) } : {}),
      blobRef: { hash: record.contentHash, bytes: record.byteSize, mime: record.mime },
    }));
    const raw = JSON.stringify({ kind: BG3D_MODEL_LIBRARY_V12_MANIFEST_KIND, version: BG3D_MODEL_LIBRARY_V12_MANIFEST_VERSION,
      revision: currentRevision, updatedAt: currentRevision, records: rows, thumbnails: [], deletions: [] });
    parseV12ModelManifest(raw);
    return raw;
  };
  const setStoredRecord = (record: Bg3dVerifiedStoredRecord): void => {
    const next = new Map(stored), detached = Object.freeze({ ...record, rights: Object.freeze({ ...record.rights }),
      validatorMetrics: Object.freeze({ ...record.validatorMetrics }),
      ...(Object.hasOwn(record, "sourceRestriction") ? { sourceRestriction: readStudioBg3dEffectiveModelSourceRestriction(record) } : {}) });
    next.set(record.id, detached); rawManifest(next, revision + 1);
    stored.set(record.id, detached); revision += 1;
  };
  const getBlob = async (records: ReadonlyMap<string, Bg3dVerifiedStoredRecord>, receipt: StudioBg3dLibraryBlobReceipt): Promise<Uint8Array> => {
    reads.blob();
    const record = [...records.values()].find((value) => value.contentHash === receipt.hash
      && value.byteSize === receipt.bytes && value.mime === receipt.mime);
    if (!record || record.blob.size !== receipt.bytes || record.blob.type !== receipt.mime) throw Error("fixture CAS receipt 불일치");
    return new Uint8Array(await record.blob.arrayBuffer());
  };
  const abort = (signal?: AbortSignal) => { if (signal?.aborted) throw signal.reason ?? Error("fixture 읽기 취소"); };
  const authority = {
    async readManifest(slot: StudioBg3dLibraryManifestSlot): Promise<string | null> {
      reads.manifest(); if (slot !== "models") throw Error("fixture models manifest만 지원"); return rawManifest();
    },
    readBlob: (receipt: StudioBg3dLibraryBlobReceipt) => getBlob(stored, receipt),
    async withReadSnapshot<T>(slot: StudioBg3dLibraryManifestSlot, read: (context: StudioBg3dLibraryReadSnapshotContext) => Promise<T>, signal?: AbortSignal): Promise<T> {
      reads.snapshot(); abort(signal); if (slot !== "models") throw Error("fixture models snapshot만 지원");
      const currentRaw = rawManifest(), snapshotRecords = new Map(stored);
      const result = await read({ currentRaw, getBlob: (receipt) => getBlob(snapshotRecords, receipt) });
      abort(signal); return result;
    },
    async mutate<T>(_slot: StudioBg3dLibraryManifestSlot, _refs: (raw: string | null) => readonly StudioOpfsContentHash[],
      _operation: (context: StudioBg3dLibraryMutationContext) => Promise<StudioBg3dLibraryMutationResult<T>>, _signal?: AbortSignal): Promise<T> {
      mutationAttempts(); throw Error("장면 export fixture는 저장소 쓰기를 허용하지 않습니다.");
    },
  } satisfies StudioBg3dLibrariesAuthority;
  return { authority, setStoredRecord, persistedRecords, authorityReads: reads, mutationAttempts };
}

/** 캐시 fixture도 실제 도형·exporter·strict validator·verified loader로 만든다. 저장소는 쓰지 않는다. */
export async function createSceneGlbFixture(withModel = true) {
  const storage = readOnlySceneModelAuthority();
  const base = createDefaultStudioBg3dSceneDocument();
  const primitive: BgPrimitive = { id: "scene-primitive", kind: "box", name: "현재 상자", color: "#8d6378",
    position: [2, 0.5, -1], rotation: [0.1, 0.3, 0.2], scale: [2, 1, 3], locked: true };
  const primitives = [primitive], models: BgCustomModelInstance[] = [];
  const cache = new Map<string, StudioBg3dModelRootCacheEntry>(), attachments = new Map<string, StudioBg3dModelAttachment>(), reverse = new Map<string, string>();
  let entry: StudioBg3dModelRootCacheEntry | null = null, record: Bg3dVerifiedStoredRecord | null = null;
  if (withModel) {
    const converted = convertStudioBg3dPrimitiveToEditableMesh(primitive); if (!converted.ok) throw Error(converted.detail);
    const exported = exportStudioHybridDccMeshGlb({ assetId: primitive.id, sourceRevision: 1, sourceHash: hashStudioEditableMesh(converted.value.mesh), mesh: converted.value.mesh });
    if (!exported.ok) throw Error("실제 모델 exporter 필요");
    const material = writeStudioBg3dPrimitiveEditMaterialGlb(exported.bytes, primitive.color); if (!material.ok) throw Error(material.messageKo);
    const bytes = material.bytes, digest = await crypto.subtle.digest("SHA-256", bytes);
    const contentHash: `sha256:${string}` = `sha256:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
    const verified = await validateStudioBg3dGlb(bytes, { profile: "desktop", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
      declared: { sha256: contentHash, byteSize: bytes.byteLength, mimeType: "model/gltf-binary" }, cumulative: { usedBytes: 0, maximumBytes: 100 * 1024 * 1024 } });
    if (!verified.ok) throw Error(verified.code);
    const loaded = await loadVerifiedStudioBg3dGlbWithThree(verified, base.budgets); if (!loaded.ok) throw Error(loaded.code);
    const k = computeAutoFitScale(measureBg3dObjectSize(loaded.root)); loaded.root.scale.setScalar(k);
    const sourceRestriction = parseStudioBg3dModelSourceRestriction({ version: 1, modelFileExport: "allowed",
      origin: { kind: "studio-generated", recordId: "stored-scene-model", sha256: contentHash }, parent: null });
    if (!sourceRestriction) throw Error("자체 제작 fixture 출처 필요");
    record = { id: "stored-scene-model", name: "원본 모델.glb", storageVersion: 2, format: "glb", thumbnail: null,
      blob: new Blob([bytes], { type: "model/gltf-binary" }), createdAt: 1, updatedAt: 1, contentHash, byteSize: bytes.byteLength,
      mime: "model/gltf-binary", validationVersion: 1, validatedAt: 1, validatorProfile: "desktop", validatorMetrics: verified.metrics,
      rights: { status: "licensed", commercialUse: true, attributionRequired: true, attribution: "시험 원저작자", licenseName: "시험 사용권" }, sourceRestriction };
    storage.setStoredRecord(record);
    const joints = collectStudioBg3dThreeJoints(loaded.root);
    entry = { root: loaded.root, dispose: vi.fn(loaded.dispose), animations: loaded.animations, record, metrics: loaded.metrics,
      normalizationScale: k, admittedProfiles: new Set(["desktop"]), joints, morphTargets: collectStudioBg3dThreeMorphTargets(loaded.root),
      semanticMaterials: classifyStudioBg3dThreeSemanticMaterials(loaded.root), genericHints: inspectStudioGeneric3dRuntimeHints(loaded.root, joints) };
    const attachment = createStudioBg3dModelAttachment(record, { attachmentId: "attachment-scene-model" });
    cache.set(record.id, entry); attachments.set(record.id, attachment); reverse.set(attachment.id, record.id);
    models.push({ id: "scene-model", modelId: record.id, name: "현재 모델", position: [4, 1, 2], rotation: [0, 0.2, 0], scale: [0.5, 0.6, 0.7] });
  }
  const adapted = tryAdaptStudioBg3dRuntimeToDocument({ primitives, customModels: models, baseDocument: base, attachmentByStorageModelId: attachments });
  if (!adapted.ok) throw Error("실제 정본 scene fixture 필요");
  const runtime: { current: StudioBg3dPrimitiveEditRuntime } = { current: { primitives, customModels: models, document: adapted.value.document } };
  const framing: { current: StudioBg3dViewportFramingState | null } = { current: {
    view: { ...adapted.value.document.camera, position: [3, 4, 8], target: [0.5, 1, 0], projection: "orthographic", orthographicHeight: 8, zoom: 2 },
    viewportAspect: 16 / 9, orthographicFrustumAtZoomOne: { width: 128 / 9, height: 8 },
  } };
  const session: { current: StudioBg3dModalSession | null } = { current: studioBg3dModalOperationCoordinator.beginSession() };
  const readFramingState = vi.fn(() => framing.current), replace = vi.fn(), commit = vi.fn();
  const host: MutableSceneGlbHost & { readonly replaceCanonicalDocumentState: typeof replace; readonly commitImmediateHistoryTransition: typeof commit } = {
    open: true, modelRenderer: {}, physicsRuntimeSourceRef: runtime, modalAssetSessionRef: session, modelRootCacheRef: { current: cache },
    attachmentByStorageModelIdRef: { current: attachments }, storageModelIdByAttachmentIdRef: { current: reverse },
    viewportApiRef: { current: { readFramingState } }, captureInFlightRef: { current: false }, cameraLensInteractionLocked: () => false,
    deviceQuality: resolveStudioBg3dDeviceQuality({ document: adapted.value.document, mode: "capture", preference: "desktop",
      signals: { cssWidth: 1600, cssHeight: 900, devicePixelRatio: 1, pointer: "fine", saveData: false, deviceMemoryGb: 8, hardwareConcurrency: 8 } }),
    modelAnimationTimeReadersRef: { current: new Map() }, replaceCanonicalDocumentState: replace, commitImmediateHistoryTransition: commit };
  fixtures.push({ session, entries: entry ? [entry] : [] });
  const refresh = () => {
    const result = tryAdaptStudioBg3dRuntimeToDocument({ ...runtime.current, baseDocument: runtime.current.document, attachmentByStorageModelId: attachments });
    if (!result.ok) throw Error("fixture 정본 갱신 실패"); runtime.current = { ...runtime.current, document: result.value.document };
  };
  return { host, runtime, framing, session, primitive, models, cache, attachments, reverse, entry, record, readFramingState, replace, commit, refresh, ...storage };
}
