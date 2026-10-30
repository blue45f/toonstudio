import { FrontSide, Mesh, MeshStandardMaterial } from "three";

import { normalizeStudioHybridDccObjectTransform } from "../hybrid-dcc/studio-hybrid-dcc-object-transform";
import type { StudioHybridDccObjectTransform } from "../hybrid-dcc/studio-hybrid-dcc-object-transform";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import { collectStudioBg3dEffectivelyVisibleEntityIds, readStudioBg3dHiddenTagSet } from "./studio-bg3d-hierarchy";
import { getStoredBg3dModelV12, type Bg3dVerifiedStoredRecord } from "./studio-bg3d-model-library-loader";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import { readStudioBg3dModelCacheEntry, resolveStudioBg3dMaterialBackend, type StudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";
import { readStudioBg3dPrimitiveEditAuthoringGlb } from "./studio-bg3d-primitive-edit-authoring-glb";
import type { StudioBg3dPrimitiveEditAuthoringValue } from "./studio-bg3d-primitive-edit-authoring";
import type { StudioBg3dPrimitiveEditRuntime, StudioBg3dPrimitiveEditSourceHost, StudioBg3dPrimitiveEditSourceSummary } from "./studio-bg3d-primitive-edit-source";
import {
  DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, STUDIO_BG3D_GLB_MAX_BYTES, STUDIO_BG3D_GLB_MIME,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES, normalizeStudioBg3dGlbAttachment, normalizeStudioBg3dSceneDocument, serializeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import type { StudioBg3dAttachmentRights, StudioBg3dModelAttachment, StudioBg3dModelNode, StudioBg3dSceneDocument } from "./studio-bg3d-scene-document-types";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import { fingerprintStudioBg3dModelSourceRestriction, readStudioBg3dEffectiveModelSourceRestriction } from "./studio-bg3d-model-source-restriction";
import { resolveStudioBg3dModelExportProvenance, assertStudioBg3dModelExportReceiptCurrent } from "./studio-bg3d-model-export-provenance";
import type { StudioBg3dModelSourceRestrictionV1 } from "./studio-bg3d-model-source-restriction";

export interface StudioBg3dAuthoredModelEditSourceHost extends StudioBg3dPrimitiveEditSourceHost {
  readonly modelRenderer?: unknown;
  readonly materialBackend?: StudioBg3dMaterialBackend;
  readonly isMaterialBackendCurrent?: () => boolean;
  readonly modelRootCacheRef: { readonly current: ReadonlyMap<string, StudioBg3dModelRootCacheEntry> };
  readonly storageModelIdByAttachmentIdRef: { readonly current: ReadonlyMap<string, string> };
}

export interface StudioBg3dAuthoredModelEditRecordIdentity {
  readonly storageModelId: string;
  readonly attachmentId: string;
  readonly contentHash: `sha256:${string}`;
  readonly byteSize: number;
  readonly mime: typeof STUDIO_BG3D_GLB_MIME;
  readonly rights: StudioBg3dAttachmentRights;
  readonly sourceRestriction?: StudioBg3dModelSourceRestrictionV1;
}

export interface StudioBg3dAuthoredModelEditSourceSnapshot {
  readonly materialBackend: StudioBg3dMaterialBackend;
  readonly rendererRefSnapshot: unknown;
  readonly isMaterialBackendCurrent?: () => boolean;
  readonly kind: "authored-model";
  readonly modalSession: object;
  readonly sourceNodeId: string;
  readonly canonicalFingerprint: string;
  readonly model: BgCustomModelInstance;
  readonly canonicalNode: StudioBg3dModelNode;
  readonly authoring: StudioBg3dPrimitiveEditAuthoringValue;
  readonly recordIdentity: StudioBg3dAuthoredModelEditRecordIdentity;
  readonly attachment: StudioBg3dModelAttachment;
  readonly cache: StudioBg3dModelRootCacheEntry;
  readonly cacheRoot: StudioBg3dModelRootCacheEntry["root"];
  readonly normalizationScale: number;
  readonly objectTransform: StudioHybridDccObjectTransform;
  readonly objectTransformBasis: "historical-exact" | "current-instance";
  readonly sourceColorSrgb: string;
}

type FailureCode = "selection-unavailable" | "invalid-selection" | "unsupported-source" | "unsupported-material"
  | "invalid-source" | "document-rejected" | "session-changed" | "source-changed" | "model-loading"
  | "asset-mismatch" | "source-unavailable" | "invalid-authoring" | "aborted" | "read-failed";
export interface StudioBg3dAuthoredModelEditSourceFailure {
  readonly ok: false;
  readonly code: FailureCode;
  readonly messageKo: string;
}
export type StudioBg3dAuthoredModelEditSourceResult = StudioBg3dAuthoredModelEditSourceFailure
  | { readonly ok: true; readonly snapshot: StudioBg3dAuthoredModelEditSourceSnapshot };
export type StudioBg3dAuthoredModelEditSourceValidation = StudioBg3dAuthoredModelEditSourceFailure | {
  readonly ok: true;
  readonly model: BgCustomModelInstance;
  readonly runtime: StudioBg3dPrimitiveEditRuntime;
  readonly document: StudioBg3dSceneDocument;
  readonly node: StudioBg3dModelNode;
};

type Selected = Extract<StudioBg3dAuthoredModelEditSourceValidation, { readonly ok: true }> & {
  readonly materialBackend: StudioBg3dMaterialBackend;
  readonly rendererRefSnapshot: unknown;
  readonly isMaterialBackendCurrent?: () => boolean;
  readonly attachment: StudioBg3dModelAttachment;
  readonly cache: StudioBg3dModelRootCacheEntry;
  readonly normalizationScale: number;
  readonly overrideColor: string | null;
};
const snapshots = new WeakSet<StudioBg3dAuthoredModelEditSourceSnapshot>();
const SAME_KEYS = Object.keys(DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE);
const failure = (code: FailureCode, messageKo: string): StudioBg3dAuthoredModelEditSourceFailure => ({ ok: false, code, messageKo });
class SourceReadFailure extends Error {
  constructor(readonly value: StudioBg3dAuthoredModelEditSourceFailure) { super(value.messageKo); }
}
function reject(value: StudioBg3dAuthoredModelEditSourceFailure): never { throw new SourceReadFailure(value); }

function sameRights(a: StudioBg3dAttachmentRights, b: StudioBg3dAttachmentRights): boolean {
  return a.status === b.status && a.commercialUse === b.commercialUse && a.attributionRequired === b.attributionRequired
    && a.attribution === b.attribution && a.licenseName === b.licenseName;
}

function overrideColor(model: BgCustomModelInstance): { readonly supported: boolean; readonly color: string | null } {
  const material = model.materialOverride;
  if (material === undefined) return { supported: true, color: null };
  const actual: Readonly<Record<string, unknown>> = { ...material };
  if (Object.keys(actual).some((key) => !SAME_KEYS.includes(key))) return { supported: false, color: null };
  const matches = (expected: typeof DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE) =>
    Object.entries(expected).every(([key, value]) => actual[key] === value);
  if (matches(DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE)) return { supported: true, color: null };
  const color = typeof material.color === "string" && /^#[a-f0-9]{6}$/iu.test(material.color) ? material.color : null;
  const fixed = { ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, colorMode: "replace" as const, color: color ?? "",
    colorStrength: 1, roughness: 1, metalness: 0, emissiveColor: "#000000", emissiveIntensity: 1 };
  return { supported: color !== null && matches(fixed), color: color?.toLowerCase() ?? null };
}

function validTransform(model: BgCustomModelInstance): boolean {
  const tuple = (values: readonly number[], min: number, max: number) => Array.isArray(values) && values.length === 3
    && [0, 1, 2].every((index) => Object.hasOwn(values, index) && Number.isFinite(values[index]) && values[index] >= min && values[index] <= max);
  return tuple(model.position, -10_000, 10_000) && tuple(model.rotation, -Math.PI, Math.PI) && tuple(model.scale, 0.001, 1_000);
}

function resolveSelection(host: StudioBg3dAuthoredModelEditSourceHost): StudioBg3dAuthoredModelEditSourceFailure | {
  readonly ok: true; readonly model: BgCustomModelInstance; readonly runtime: StudioBg3dPrimitiveEditRuntime; readonly overrideColor: string | null;
} {
  if (!host.open || !host.modalAssetSessionRef.current || host.isPrimitiveEditInteractionLocked() || host.isMaterialBackendCurrent?.() === false) {
    return failure("selection-unavailable", "현재 장면의 편집이 잠겨 있습니다. 진행 중인 작업이 끝난 뒤 다시 시도하세요.");
  }
  const runtime = host.physicsRuntimeSourceRef.current, ids = host.selectedIdsRef?.current ?? host.selectedIds;
  if (!ids || ids.size !== 1) return failure("invalid-selection", "원본 면 편집 데이터를 가진 모델 하나만 선택하세요.");
  const entities = [...runtime.primitives, ...runtime.customModels];
  if (entities.length > STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES || new Set(entities.map(({ id }) => id)).size !== entities.length) {
    return failure("invalid-source", "장면의 오브젝트 개수 또는 ID를 안전하게 확인할 수 없습니다.");
  }
  const model = runtime.customModels.find(({ id }) => id === ids.values().next().value);
  if (!model) return failure("unsupported-source", "현재 선택한 객체는 재편집할 수 있는 저장 모델이 아닙니다.");
  if (model.parentId != null || entities.some(({ parentId }) => parentId === model.id)
    || model.componentRef !== undefined || model.linkedSourceId !== undefined || entities.some(({ linkedSourceId }) => linkedSourceId === model.id)) {
    return failure("unsupported-source", "부모·자식·컴포넌트·연결 복제 관계가 없는 독립 모델만 재편집할 수 있습니다.");
  }
  if (model.locked === true || !collectStudioBg3dEffectivelyVisibleEntityIds(entities, readStudioBg3dHiddenTagSet(runtime.document)).has(model.id)) {
    return failure("selection-unavailable", "숨기거나 잠긴 모델은 재편집할 수 없습니다. 숨긴 태그도 확인하세요.");
  }
  const material = overrideColor(model);
  if (model.surface !== undefined || model.modelTexturePaint !== undefined || model.animation !== undefined || model.pose !== undefined
    || model.morph !== undefined || model.constraints !== undefined || !material.supported) {
    return failure("unsupported-material", "페인트·절차 재질·리그·애니메이션·제약이 없는 고정 단색 모델만 재편집할 수 있습니다.");
  }
  if (!validTransform(model)) return failure("invalid-source", "모델의 현재 위치·회전·크기가 정본 범위를 벗어났습니다.");
  return { ok: true, model, runtime, overrideColor: material.color };
}

function normalizationScale(cache: StudioBg3dModelRootCacheEntry): number | null {
  const k = cache.normalizationScale, root = cache.root;
  if (typeof k !== "number" || !Number.isFinite(k) || k <= 0) return null;
  const close = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) <= 64 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
  return root.scale.toArray().every((value) => close(value, k)) && root.position.toArray().every((value) => close(value, 0))
    && [root.quaternion.x, root.quaternion.y, root.quaternion.z].every((value) => close(value, 0)) && close(Math.abs(root.quaternion.w), 1) ? k : null;
}

function plainCache(cache: StudioBg3dModelRootCacheEntry): boolean {
  if (cache.animations.length || cache.joints.length || cache.morphTargets.length || cache.metrics.animations || cache.metrics.skins
    || cache.metrics.joints || cache.metrics.morphTargets || cache.metrics.textures) return false;
  let supported = true, meshes = 0;
  cache.root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshes += 1;
    if (Object.keys(object.geometry.morphAttributes).length) supported = false;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof MeshStandardMaterial) || material.side !== FrontSide || material.opacity !== 1 || material.transparent
        || material.roughness !== 1 || material.metalness !== 0 || material.emissive.getHex() !== 0 || material.emissiveIntensity !== 1
        || material.wireframe || !material.depthWrite || !material.depthTest || !material.toneMapped
        || material.map || material.normalMap || material.roughnessMap || material.metalnessMap || material.emissiveMap
        || material.aoMap || material.alphaMap || material.bumpMap || material.displacementMap || material.lightMap || material.envMap) supported = false;
    }
  });
  return supported && meshes > 0;
}

function canonicalSelection(host: StudioBg3dAuthoredModelEditSourceHost): StudioBg3dAuthoredModelEditSourceFailure | Selected {
  const selected = resolveSelection(host);
  if (!selected.ok) return selected;
  const { runtime, model } = selected;
  if (!serializeStudioBg3dSceneDocument(runtime.document)) return failure("document-rejected", "현재 장면을 손실 없이 저장할 수 없습니다.");
  if (runtime.document.nodes.some((node) => node.castsShadow === false || node.receivesShadow === false)) {
    return failure("document-rejected", "그림자 투사 또는 수신이 꺼진 노드의 설정을 유지하는 원본 교체는 아직 지원하지 않습니다.");
  }
  const adapted = tryAdaptStudioBg3dRuntimeToDocument({ ...runtime, baseDocument: runtime.document,
    attachmentByStorageModelId: host.attachmentByStorageModelIdRef.current });
  if (!adapted.ok || adapted.value.diagnostics.length || adapted.value.counts.droppedPrimitives || adapted.value.counts.droppedCustomModels
    || adapted.value.counts.emittedPrimitives !== runtime.primitives.length || adapted.value.counts.emittedCustomModels !== runtime.customModels.length) {
    return failure("document-rejected", "현재 장면의 노드·모델 원본을 손실 없이 확인할 수 없습니다.");
  }
  const attachments = new Map(adapted.value.document.attachments.map((attachment) => [attachment.id, JSON.stringify(attachment)]));
  if (runtime.document.attachments.some((attachment) => attachments.get(attachment.id) !== JSON.stringify(normalizeStudioBg3dGlbAttachment(attachment)))) {
    return failure("document-rejected", "기존 모델 원본 연결이 누락되거나 달라져 원본 정보를 보존하기 위해 재편집을 중단했습니다.");
  }
  const node = adapted.value.document.nodes.find(({ id }) => id === model.id);
  if (!node || node.kind !== "model" || (model.name !== undefined && model.name !== node.name)
    || JSON.stringify([...(model.tags ?? [])].sort()) !== JSON.stringify([...(node.tags ?? [])].sort())) {
    return failure("invalid-source", "모델의 정본·이름·태그를 손실 없이 확인할 수 없습니다.");
  }
  const materialBackend = resolveStudioBg3dMaterialBackend({ renderer: host.modelRenderer, materialBackend: host.materialBackend });
  const cache = readStudioBg3dModelCacheEntry(host.modelRootCacheRef.current, model.modelId, materialBackend);
  if (!cache) return failure("model-loading", "모델 원본 캐시를 준비 중입니다. 모델이 표시된 뒤 다시 시도하세요.");
  const attachment = normalizeStudioBg3dGlbAttachment(host.attachmentByStorageModelIdRef.current.get(model.modelId));
  const record = cache.record;
  if (!attachment || attachment.id === model.modelId || node.attachmentId !== attachment.id
    || host.storageModelIdByAttachmentIdRef.current.get(attachment.id) !== model.modelId || record.id !== model.modelId
    || record.contentHash !== attachment.hash || record.byteSize !== attachment.byteSize || record.mime !== attachment.mime
    || !sameRights(record.rights, attachment.rights) || !record.rights.commercialUse || record.rights.status === "unknown"
    || !Number.isSafeInteger(record.byteSize) || record.byteSize <= 0 || record.byteSize > STUDIO_BG3D_GLB_MAX_BYTES
    || record.mime !== STUDIO_BG3D_GLB_MIME || !/^sha256:[a-f0-9]{64}$/u.test(record.contentHash)) {
    return failure("asset-mismatch", "저장 모델의 해시·권리·장면 연결이 현재 캐시와 다릅니다.");
  }
  const k = normalizationScale(cache);
  if (k === null || !plainCache(cache)) return failure("unsupported-source", "모델 원점·정규화 배율·고정 단색 재질을 안전하게 확인할 수 없습니다.");
  try {
    normalizeStudioHybridDccObjectTransform({ revision: 1, position: node.transform.position,
      rotationEulerRad: node.transform.rotation, scale: node.transform.scale.map((value) => value * k) });
  } catch { return failure("invalid-source", "현재 모델 배율을 원본 편집 좌표 범위 안에서 보존할 수 없습니다."); }
  return { ...selected, document: adapted.value.document, node, attachment, cache, normalizationScale: k,
    materialBackend, rendererRefSnapshot: host.modelRenderer, isMaterialBackendCurrent: host.isMaterialBackendCurrent };
}

function recordIdentity(selected: Selected): StudioBg3dAuthoredModelEditRecordIdentity {
  const record = selected.cache.record;
  return { storageModelId: selected.model.modelId, attachmentId: selected.attachment.id, contentHash: record.contentHash,
    byteSize: record.byteSize, mime: record.mime, rights: { ...record.rights },
    sourceRestriction: readStudioBg3dEffectiveModelSourceRestriction(record) };
}

function identityMatches(record: Bg3dVerifiedStoredRecord, identity: StudioBg3dAuthoredModelEditRecordIdentity): boolean {
  try {
    return record.id === identity.storageModelId && record.contentHash === identity.contentHash && record.byteSize === identity.byteSize
      && record.mime === identity.mime && sameRights(record.rights, identity.rights)
      && fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(record))
        === fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(identity));
  } catch { return false; }
}

function freezeTree<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

function assetColorMatches(cache: StudioBg3dModelRootCacheEntry, colorSrgb: string): boolean {
  const linear = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(colorSrgb.slice(offset, offset + 2), 16) / 255;
    return value < 0.04045 ? value * 0.0773993808 : Math.pow(value * 0.9478672986 + 0.0521327014, 2.4);
  });
  let matches = true;
  cache.root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof MeshStandardMaterial) || material.color.toArray().some((value, index) =>
        !Number.isFinite(value) || Math.abs(value - linear[index]) > 64 * Number.EPSILON)) matches = false;
    }
  });
  return matches;
}

function assertScope(host: StudioBg3dAuthoredModelEditSourceHost, initial: Selected, session: object, signal: AbortSignal,
  identity: StudioBg3dAuthoredModelEditRecordIdentity, root: StudioBg3dModelRootCacheEntry["root"]): Selected {
  if (signal.aborted) reject(failure("aborted", "원본 모델 읽기를 취소했습니다."));
  if (initial.isMaterialBackendCurrent?.() === false || host.modelRenderer !== initial.rendererRefSnapshot
    || resolveStudioBg3dMaterialBackend({ renderer: host.modelRenderer, materialBackend: host.materialBackend }) !== initial.materialBackend) reject(failure("source-changed", "원본을 읽는 동안 재질 backend가 바뀌었습니다."));
  if (host.modalAssetSessionRef.current !== session) reject(failure("session-changed", "편집기 세션이 바뀌어 원본 모델을 사용하지 않았습니다."));
  const current = canonicalSelection(host);
  if (!current.ok) reject(current);
  if (JSON.stringify(current.node) !== JSON.stringify(initial.node) || current.cache !== initial.cache || current.cache.root !== root
    || current.normalizationScale !== initial.normalizationScale || JSON.stringify(current.attachment) !== JSON.stringify(initial.attachment)
    || !identityMatches(current.cache.record, identity)) {
    reject(failure("source-changed", "읽기를 기다리는 동안 모델 원본·배치·캐시가 바뀌었습니다. 최신 모델에서 다시 시작하세요."));
  }
  return current;
}

async function readBytes(identity: StudioBg3dAuthoredModelEditRecordIdentity, signal: AbortSignal, fence: () => void): Promise<Uint8Array<ArrayBuffer>> {
  fence();
  const record = await getStoredBg3dModelV12(identity.storageModelId, { signal });
  fence();
  if (!record) reject(failure("source-unavailable", "저장한 모델 원본을 찾지 못했습니다."));
  if (!identityMatches(record, identity) || !(record.blob instanceof Blob) || record.blob.size !== identity.byteSize
    || (record.blob.type !== "" && record.blob.type !== identity.mime)) {
    reject(failure("asset-mismatch", "읽은 모델의 해시·크기·권리 정보가 현재 원본과 다릅니다."));
  }
  const provenance = await resolveStudioBg3dModelExportProvenance(record, { signal, assertCurrent: fence });
  fence();
  if (fingerprintStudioBg3dModelSourceRestriction(provenance.sourceRestriction)
    !== fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(identity))) {
    reject(failure("asset-mismatch", "실제 저장 원본의 파일 제한이 편집 원본과 다릅니다."));
  }
  const bytes = new Uint8Array(await record.blob.arrayBuffer());
  fence();
  if (bytes.byteLength !== identity.byteSize) reject(failure("asset-mismatch", "모델 원본 바이트 크기가 저장 정보와 다릅니다."));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  fence();
  const hash = `sha256:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
  if (hash !== identity.contentHash) reject(failure("asset-mismatch", "실제 모델 원본 바이트의 SHA-256이 저장한 원본과 다릅니다."));
  await assertStudioBg3dModelExportReceiptCurrent(provenance);
  fence();
  return bytes;
}

function caught(error: unknown, signal?: AbortSignal): StudioBg3dAuthoredModelEditSourceFailure {
  if (signal?.aborted) return failure("aborted", "원본 모델 읽기를 취소했습니다.");
  if (error instanceof SourceReadFailure) return error.value;
  return failure("read-failed", "원본 모델을 안전하게 읽지 못했습니다. 저장된 모델과 현재 선택을 확인한 뒤 다시 시도하세요.");
}

export function inspectStudioBg3dAuthoredModelEditSource(host: StudioBg3dAuthoredModelEditSourceHost): StudioBg3dPrimitiveEditSourceSummary {
  try {
    const selected = resolveSelection(host);
    return selected.ok ? { nodeId: selected.model.id, name: selected.model.name || "편집 모델", blockedReason: null }
      : { nodeId: null, name: "", blockedReason: selected.messageKo };
  } catch { return { nodeId: null, name: "", blockedReason: "현재 모델 정보를 읽지 못했습니다." }; }
}

/** 저장 Blob의 실제 해시와 GLB authoring/render 일치를 검증한 독립 사본만 발행한다. */
export async function captureStudioBg3dAuthoredModelEditSource(
  host: StudioBg3dAuthoredModelEditSourceHost, signal: AbortSignal,
): Promise<StudioBg3dAuthoredModelEditSourceResult> {
  try {
    if (signal.aborted) return failure("aborted", "원본 모델 읽기를 취소했습니다.");
    const rendererRefSnapshot = host.modelRenderer, materialBackend = resolveStudioBg3dMaterialBackend({ renderer: rendererRefSnapshot, materialBackend: host.materialBackend });
    const isMaterialBackendCurrent = host.isMaterialBackendCurrent;
    if (isMaterialBackendCurrent?.() === false) return failure("source-changed", "원본 모델의 재질 backend가 바뀌었습니다.");
    const selected = canonicalSelection(host), session = host.modalAssetSessionRef.current;
    if (!selected.ok) return selected;
    const initial = { ...selected, rendererRefSnapshot, materialBackend, isMaterialBackendCurrent };
    if (!session) return failure("session-changed", "편집기 세션이 바뀌었습니다.");
    const identity = freezeTree(recordIdentity(initial));
    const root = initial.cache.root;
    const fence = () => { assertScope(host, initial, session, signal, identity, root); };
    fence();
    const bytes = await readBytes(identity, signal, fence);
    fence();
    const parsed = readStudioBg3dPrimitiveEditAuthoringGlb(bytes);
    if (!parsed.ok) return failure("invalid-authoring", parsed.messageKo);
    fence();
    if (!assetColorMatches(initial.cache, parsed.value.envelope.sourceMaterialAtExport.colorSrgb)) {
      return failure("asset-mismatch", "현재 모델 캐시의 기본색이 저장한 원본 재질과 다릅니다.");
    }
    const historical = parsed.value.envelope.objectTransformAtExport;
    const expected = { position: historical.position, rotation: historical.rotationEulerRad,
      scale: historical.scale.map((value) => value / initial.normalizationScale) };
    const inRange = expected.position.every((value) => Math.abs(value) <= 10_000)
      && expected.rotation.every((value) => Math.abs(value) <= Math.PI)
      && expected.scale.every((value) => Number.isFinite(value) && value >= 0.001 && value <= 1_000);
    const canonicalHistorical = inRange ? normalizeStudioBg3dSceneDocument({ ...initial.document,
      nodes: initial.document.nodes.map((node) => node.id === initial.node.id ? { ...node, transform: expected } : node),
    }).nodes.find(({ id }) => id === initial.node.id)?.transform : undefined;
    // 각도 wrap의 부동소수점 정규화까지 같은 정본일 때만 과거 exact TRS를 재사용한다.
    const exact = canonicalHistorical !== undefined && JSON.stringify(canonicalHistorical) === JSON.stringify(initial.node.transform);
    const objectTransform = exact ? historical : normalizeStudioHybridDccObjectTransform({ revision: 1,
      position: [...initial.node.transform.position], rotationEulerRad: [...initial.node.transform.rotation],
      scale: initial.node.transform.scale.map((value) => value * initial.normalizationScale) });
    const model: BgCustomModelInstance = { ...initial.model, position: [...initial.model.position], rotation: [...initial.model.rotation],
      scale: [...initial.model.scale], ...(initial.model.tags ? { tags: [...initial.model.tags] } : {}),
      ...(initial.model.materialOverride ? { materialOverride: { ...initial.model.materialOverride } } : {}) };
    const snapshot: StudioBg3dAuthoredModelEditSourceSnapshot = Object.freeze({ kind: "authored-model", modalSession: session,
      materialBackend: initial.materialBackend, rendererRefSnapshot: initial.rendererRefSnapshot, isMaterialBackendCurrent: initial.isMaterialBackendCurrent,
      sourceNodeId: model.id, canonicalFingerprint: JSON.stringify(initial.node), model: freezeTree(model), canonicalNode: initial.node,
      authoring: freezeTree(parsed.value), recordIdentity: identity, attachment: initial.attachment,
      cache: initial.cache, cacheRoot: initial.cache.root, normalizationScale: initial.normalizationScale,
      objectTransform: freezeTree(objectTransform), objectTransformBasis: exact ? "historical-exact" : "current-instance",
      sourceColorSrgb: initial.overrideColor ?? parsed.value.envelope.sourceMaterialAtExport.colorSrgb });
    snapshots.add(snapshot);
    return { ok: true, snapshot };
  } catch (error) { return caught(error, signal); }
}

export function revalidateStudioBg3dAuthoredModelEditSource(
  host: StudioBg3dAuthoredModelEditSourceHost, snapshot: StudioBg3dAuthoredModelEditSourceSnapshot,
): StudioBg3dAuthoredModelEditSourceValidation {
  try {
    if (!snapshots.has(snapshot)) return failure("source-changed", "확인되지 않은 원본 모델 사본입니다.");
    if (snapshot.isMaterialBackendCurrent?.() === false || host.modelRenderer !== snapshot.rendererRefSnapshot
      || resolveStudioBg3dMaterialBackend({ renderer: host.modelRenderer, materialBackend: host.materialBackend }) !== snapshot.materialBackend) return failure("source-changed", "편집 중 재질 backend가 바뀌어 원본을 교체하지 않았습니다.");
    if (host.modalAssetSessionRef.current !== snapshot.modalSession) return failure("session-changed", "편집기 세션이 바뀌어 모델을 교체하지 않았습니다.");
    const current = canonicalSelection(host);
    if (!current.ok) return current;
    if (current.model.id !== snapshot.sourceNodeId || JSON.stringify(current.node) !== snapshot.canonicalFingerprint
      || current.cache !== snapshot.cache || current.cache.root !== snapshot.cacheRoot || current.normalizationScale !== snapshot.normalizationScale
      || JSON.stringify(current.attachment) !== JSON.stringify(snapshot.attachment) || !identityMatches(current.cache.record, snapshot.recordIdentity)
      || !assetColorMatches(current.cache, snapshot.authoring.envelope.sourceMaterialAtExport.colorSrgb)) {
      return failure("source-changed", "원본 모델의 배치·재질·저장 연결·캐시가 편집 중에 바뀌었습니다.");
    }
    return current;
  } catch { return failure("source-changed", "현재 모델 원본을 확인하지 못해 교체하지 않았습니다."); }
}

/** 적용 직전에는 기존 사본의 hash만 믿지 않고 현재 저장 Blob을 다시 읽는다. */
export async function rereadStudioBg3dAuthoredModelEditSource(
  host: StudioBg3dAuthoredModelEditSourceHost, snapshot: StudioBg3dAuthoredModelEditSourceSnapshot, signal: AbortSignal,
): Promise<StudioBg3dAuthoredModelEditSourceValidation> {
  try {
    const initial = revalidateStudioBg3dAuthoredModelEditSource(host, snapshot);
    if (!initial.ok) return initial;
    const fence = () => {
      if (signal.aborted) reject(failure("aborted", "원본 모델 읽기를 취소했습니다."));
      const current = revalidateStudioBg3dAuthoredModelEditSource(host, snapshot);
      if (!current.ok) reject(current);
    };
    await readBytes(snapshot.recordIdentity, signal, fence);
    fence();
    return revalidateStudioBg3dAuthoredModelEditSource(host, snapshot);
  } catch (error) { return caught(error, signal); }
}
