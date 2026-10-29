import type { StudioBg3dViewportFramingState } from "./studio-bg3d-camera-application";
import type { StudioBg3dResolvedDeviceQuality } from "./studio-bg3d-device-quality";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { StudioBg3dModalSession } from "./studio-bg3d-modal-operation-coordinator";
import { studioBg3dModalOperationCoordinator } from "./studio-bg3d-modal-operation-coordinator";
import { collectStudioBg3dEffectivelyVisibleEntityIds, readStudioBg3dHiddenTagSet } from "./studio-bg3d-hierarchy";
import { normalizeStudioBg3dGlbAttachment, parseStudioBg3dSceneDocument, serializeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { StudioBg3dModelAttachment, StudioBg3dSceneDocument, StudioBg3dSceneNode } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dPrimitiveEditRuntime } from "./studio-bg3d-primitive-edit-source";
import { deriveStudioBg3dSessionGlbValidationPolicy } from "./studio-bg3d-session-glb-policy";
import { isStudioBg3dSceneGlbExportAvailable } from "./studio-bg3d-scene-glb-availability";

import { canonicalStudioCommandJson } from "../studio-command-journal";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { StudioBg3dSectionPlaneState } from "./studio-bg3d-section-plane";
import { fingerprintStudioBg3dModelSourceRestriction, readStudioBg3dEffectiveModelSourceRestriction } from "./studio-bg3d-model-source-restriction";

export { isStudioBg3dSceneGlbExportAvailable } from "./studio-bg3d-scene-glb-availability";

export interface StudioBg3dSceneGlbExportHost {
  readonly open?: boolean;
  readonly modelRenderer?: unknown;
  readonly isRestoringScene?: boolean;
  readonly isCapturing?: boolean;
  readonly isBatchRenderingShots?: boolean;
  readonly physicsInteractionLocked?: boolean;
  readonly isUploadingModel?: boolean;
  readonly hasPendingClone?: boolean;
  readonly hasCloneFailure?: boolean;
  readonly captureInFlightRef?: { readonly current: boolean };
  readonly cameraLensInteractionLocked?: () => boolean;
  readonly physicsRuntimeSourceRef?: { readonly current: StudioBg3dPrimitiveEditRuntime };
  readonly modalAssetSessionRef?: { readonly current: StudioBg3dModalSession | null };
  readonly modelRootCacheRef?: { readonly current: ReadonlyMap<string, StudioBg3dModelRootCacheEntry> };
  readonly attachmentByStorageModelIdRef?: { readonly current: ReadonlyMap<string, StudioBg3dModelAttachment> };
  readonly storageModelIdByAttachmentIdRef?: { readonly current: ReadonlyMap<string, string> };
  readonly viewportApiRef?: { readonly current: { readFramingState(): StudioBg3dViewportFramingState | null } | null };
  readonly deviceQuality?: StudioBg3dResolvedDeviceQuality;
  readonly modelAnimationTimeReadersRef?: { readonly current: ReadonlyMap<string, () => number> };
  readonly sharedCharacters?: readonly unknown[];
  readonly sectionPlane?: StudioBg3dSectionPlaneState;
}

export type StudioBg3dSceneGlbErrorCode = "unavailable" | "aborted" | "source-changed" | "unsupported-scene" | "asset-invalid" | "export-failed" | "download-failed" | "rights-restricted" | "rights-unavailable";
export class StudioBg3dSceneGlbError extends Error {
  constructor(readonly code: StudioBg3dSceneGlbErrorCode, readonly messageKo: string, options?: ErrorOptions) { super(messageKo, options); }
}
export interface StudioBg3dSceneGlbSource {
  readonly session: StudioBg3dModalSession;
  readonly document: StudioBg3dSceneDocument;
  readonly canonicalFingerprint: string;
  readonly framing: StudioBg3dViewportFramingState;
  readonly policy: ReturnType<typeof deriveStudioBg3dSessionGlbValidationPolicy>;
  readonly assets: ReadonlyMap<string, StudioBg3dSceneGlbSourceAsset>;
  readonly animationTimeSecondsByNodeId: ReadonlyMap<string, number>;
  readonly rendererEngine: "webgl" | "webgpu";
  readonly rendererRefSnapshot: unknown;
  readonly sectionPlane: StudioBg3dSectionPlaneState | null;
}
export interface StudioBg3dSceneGlbSourceAsset {
  readonly storageId: string;
  readonly attachment: StudioBg3dModelAttachment;
  readonly entry: StudioBg3dModelRootCacheEntry;
  readonly root: StudioBg3dModelRootCacheEntry["root"];
  readonly recordIdentity: string;
  readonly rootTransformFingerprint: string;
}

function close(a: number, b: number): boolean { return Number.isFinite(a) && Math.abs(a - b) <= 128 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)); }
function rootTransform(entry: StudioBg3dModelRootCacheEntry): string | null {
  const { root, normalizationScale: k } = entry;
  if (typeof k !== "number" || !Number.isFinite(k) || k <= 0 || root.position.toArray().some((value) => !close(value, 0))
    || root.scale.toArray().some((value) => !close(value, k)) || [root.quaternion.x, root.quaternion.y, root.quaternion.z].some((value) => !close(value, 0))
    || !close(Math.abs(root.quaternion.w), 1)) return null;
  return JSON.stringify({ position: root.position.toArray(), quaternion: root.quaternion.toArray(), scale: root.scale.toArray(), k });
}
function rendererEngine(value: unknown): "webgl" | "webgpu" {
  return typeof value === "object" && value !== null && "isWebGPURenderer" in value && value.isWebGPURenderer === true ? "webgpu" : "webgl";
}
function quaternion(rotation: readonly number[]): readonly number[] {
  const [x, y, z] = rotation.map((value) => value / 2), c1 = Math.cos(x), c2 = Math.cos(y), c3 = Math.cos(z), s1 = Math.sin(x), s2 = Math.sin(y), s3 = Math.sin(z);
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3];
}
function sameTransform(actual: BgPrimitive | BgCustomModelInstance, node: StudioBg3dSceneNode): boolean {
  const finiteTuple = (tuple: readonly number[]) => tuple.length === 3 && [0, 1, 2].every((index) => Object.hasOwn(tuple, index) && Number.isFinite(tuple[index]));
  if (![actual.position, actual.rotation, actual.scale].every(finiteTuple) || actual.position.some((value, index) => value !== node.transform.position[index])
    || actual.scale.some((value, index) => value !== node.transform.scale[index])) return false;
  const current = quaternion(actual.rotation), expected = quaternion(node.transform.rotation);
  return current.every((value, index) => close(value, expected[index])) || current.every((value, index) => close(-value, expected[index]));
}
function commonAppearance(value: BgPrimitive | BgCustomModelInstance | StudioBg3dSceneNode) {
  return { visible: value.visible !== false, locked: value.locked === true, parentId: value.parentId ?? null, linkedSourceId: value.linkedSourceId ?? null,
    tags: [...(value.tags ?? [])].sort(), componentRef: value.componentRef ?? null, surface: value.surface ?? null, materialOverride: value.materialOverride ?? null };
}
/** canonical 전용 그림자/첨부를 버리는 왕복 대신 실제 runtime 지원 필드만 비교한다. */
function assertRuntimeMatchesDocument(host: StudioBg3dSceneGlbExportHost, runtime: StudioBg3dPrimitiveEditRuntime, document: StudioBg3dSceneDocument): void {
  const changed = () => { throw new StudioBg3dSceneGlbError("source-changed", "현재 오브젝트의 형상·배치·재질이 정본과 달라 이전 장면을 내보내지 않았습니다."); };
  const primitiveById = new Map(runtime.primitives.map((value) => [value.id, value]));
  const modelById = new Map(runtime.customModels.map((value) => [value.id, value]));
  if (runtime.primitives.length + runtime.customModels.length !== document.nodes.length || primitiveById.size !== runtime.primitives.length
    || modelById.size !== runtime.customModels.length || [...primitiveById.keys()].some((id) => modelById.has(id))) changed();
  for (const node of document.nodes) {
    const actual = node.kind === "primitive" ? primitiveById.get(node.id) : modelById.get(node.id);
    if (!actual || !sameTransform(actual, node)) changed();
    if (!actual) continue;
    try {
      if (canonicalStudioCommandJson(commonAppearance(actual)) !== canonicalStudioCommandJson(commonAppearance(node))) changed();
      if (node.kind === "primitive") {
        const primitive = primitiveById.get(node.id);
        if (!primitive || primitive.kind !== node.primitiveKind || primitive.color.toLowerCase() !== node.color
          || (primitive.name ?? primitive.kind) !== node.name
          || canonicalStudioCommandJson(primitive.texturePaint ?? null) !== canonicalStudioCommandJson(node.texturePaint ?? null)) changed();
      } else {
        const model = modelById.get(node.id);
        const storageId = host.storageModelIdByAttachmentIdRef?.current.get(node.attachmentId);
        if (!model || (storageId !== undefined && storageId !== model.modelId) || (model.name ?? "GLB 모델") !== node.name
          || canonicalStudioCommandJson([model.modelTexturePaint ?? null, model.animation ?? null, model.pose ?? null, model.morph ?? null, model.constraints ?? null])
          !== canonicalStudioCommandJson([node.modelTexturePaint ?? null, node.animation ?? null, node.pose ?? null, node.morph ?? null, node.constraints ?? null])) changed();
      }
    } catch { changed(); }
  }
}

function recordIdentity(entry: StudioBg3dModelRootCacheEntry): string {
  const { id, storageVersion, format, contentHash, byteSize, mime, rights, validationVersion } = entry.record;
  return JSON.stringify({ id, storageVersion, format, contentHash, byteSize, mime,
    rights: { status: rights.status, commercialUse: rights.commercialUse, attributionRequired: rights.attributionRequired,
      attribution: rights.attribution ?? null, licenseName: rights.licenseName ?? null }, validationVersion, normalizationScale: entry.normalizationScale,
    sourceRestriction: fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(entry.record)) });
}
function attachmentMatches(attachment: StudioBg3dModelAttachment, entry: StudioBg3dModelRootCacheEntry): boolean {
  const record = entry.record;
  return record.storageVersion === 2 && record.format === "glb" && record.contentHash === attachment.hash
    && record.byteSize === attachment.byteSize && record.mime === attachment.mime
    && record.rights.status === attachment.rights.status && record.rights.commercialUse === attachment.rights.commercialUse
    && record.rights.attributionRequired === attachment.rights.attributionRequired && record.rights.attribution === attachment.rights.attribution
    && record.rights.licenseName === attachment.rights.licenseName;
}
function unavailable(): never { throw new StudioBg3dSceneGlbError("unavailable", "현재 장면과 모델이 준비된 뒤 다시 저장해 주세요."); }

/** 정본·실제 뷰포트·검증 캐시를 같은 호출에서 캡처한다. 애니메이션 시간은 이 순간의 읽기 전용 값이다. */
export function captureStudioBg3dSceneGlbSource(host: StudioBg3dSceneGlbExportHost, signal: AbortSignal): StudioBg3dSceneGlbSource {
  if (signal.aborted) throw new StudioBg3dSceneGlbError("aborted", "장면 GLB 저장을 취소했습니다.");
  if (!isStudioBg3dSceneGlbExportAvailable(host)) unavailable();
  if (host.sharedCharacters?.length) throw new StudioBg3dSceneGlbError("unsupported-scene", "프로젝트에 연결된 캐릭터까지 포함하는 GLB 저장은 아직 준비 중입니다. 장면을 변경하지 않았습니다.");
  const runtime = host.physicsRuntimeSourceRef?.current;
  const session = host.modalAssetSessionRef?.current;
  const framing = host.viewportApiRef?.current?.readFramingState();
  const quality = host.deviceQuality;
  if (!runtime || !session || !framing || !quality || !studioBg3dModalOperationCoordinator.isCurrent(session)) unavailable();
  const canonicalFingerprint = serializeStudioBg3dSceneDocument(runtime.document);
  const withView = serializeStudioBg3dSceneDocument({ ...runtime.document, camera: framing.view });
  const document = withView ? parseStudioBg3dSceneDocument(withView) : null;
  if (!canonicalFingerprint || !document) throw new StudioBg3dSceneGlbError("unsupported-scene", "장면의 정본 문서를 보존한 채 내보낼 수 없습니다.");
  assertRuntimeMatchesDocument(host, runtime, document);
  const visible = collectStudioBg3dEffectivelyVisibleEntityIds(document.nodes, readStudioBg3dHiddenTagSet(document));
  if (visible.size === 0) throw new StudioBg3dSceneGlbError("unsupported-scene", "표시된 오브젝트가 없습니다. 저장할 오브젝트를 표시해 주세요.");
  const assets = new Map<string, StudioBg3dSceneGlbSourceAsset>();
  const animationTimeSecondsByNodeId = new Map<string, number>();
  for (const node of document.nodes) {
    if (node.kind !== "model" || !visible.has(node.id)) continue;
    const attachment = document.attachments.find(({ id }) => id === node.attachmentId);
    const storageId = host.storageModelIdByAttachmentIdRef?.current.get(node.attachmentId);
    const entry = storageId ? host.modelRootCacheRef?.current.get(storageId) : undefined;
    const binding = storageId ? host.attachmentByStorageModelIdRef?.current.get(storageId) : undefined;
    const rootTransformFingerprint = entry ? rootTransform(entry) : null;
    if (!attachment || !storageId || !entry || !binding || !rootTransformFingerprint || entry.record.id !== storageId
      || JSON.stringify(normalizeStudioBg3dGlbAttachment(binding)) !== JSON.stringify(attachment) || !attachmentMatches(attachment, entry)) {
      throw new StudioBg3dSceneGlbError("asset-invalid", `모델 ‘${node.name}’의 검증된 원본 연결을 확인하지 못했습니다.`);
    }
    assets.set(attachment.id, { storageId, attachment: structuredClone(attachment), entry, root: entry.root, recordIdentity: recordIdentity(entry), rootTransformFingerprint });
    const time = host.modelAnimationTimeReadersRef?.current.get(node.id)?.();
    if (time !== undefined && Number.isFinite(time) && time >= 0) animationTimeSecondsByNodeId.set(node.id, time);
  }
  return Object.freeze({ session, document, canonicalFingerprint, framing: structuredClone(framing),
    policy: deriveStudioBg3dSessionGlbValidationPolicy(document, quality), assets, animationTimeSecondsByNodeId,
    rendererEngine: rendererEngine(host.modelRenderer), rendererRefSnapshot: host.modelRenderer,
    sectionPlane: host.sectionPlane ? structuredClone(host.sectionPlane) : null });
}

/** 비동기 준비 중 장면·렌즈·세션·캐시·연결·품질이 바뀌면 이전 파일을 다운로드하지 않는다. */
export function assertStudioBg3dSceneGlbSourceCurrent(host: StudioBg3dSceneGlbExportHost, source: StudioBg3dSceneGlbSource, signal: AbortSignal): void {
  if (signal.aborted) throw new StudioBg3dSceneGlbError("aborted", "장면 GLB 저장을 취소했습니다.");
  const quality = host.deviceQuality;
  const current = host.physicsRuntimeSourceRef?.current;
  if (!isStudioBg3dSceneGlbExportAvailable(host) || !current || !quality || host.modalAssetSessionRef?.current !== source.session
    || !studioBg3dModalOperationCoordinator.isCurrent(source.session) || host.modelRenderer !== source.rendererRefSnapshot
    || Boolean(host.sharedCharacters?.length) || canonicalStudioCommandJson(host.sectionPlane ?? null) !== canonicalStudioCommandJson(source.sectionPlane)
    || serializeStudioBg3dSceneDocument(current.document) !== source.canonicalFingerprint
    || JSON.stringify(host.viewportApiRef?.current?.readFramingState()) !== JSON.stringify(source.framing)
    || JSON.stringify(deriveStudioBg3dSessionGlbValidationPolicy(source.document, quality)) !== JSON.stringify(source.policy)) {
    throw new StudioBg3dSceneGlbError("source-changed", "저장 준비 중 장면·카메라 또는 편집기 상태가 바뀌었습니다. 현재 장면에서 다시 저장해 주세요.");
  }
  assertRuntimeMatchesDocument(host, current, source.document);
  for (const [attachmentId, asset] of source.assets) {
    if (host.modelRootCacheRef?.current.get(asset.storageId) !== asset.entry || asset.entry.root !== asset.root || recordIdentity(asset.entry) !== asset.recordIdentity
      || rootTransform(asset.entry) !== asset.rootTransformFingerprint
      || host.storageModelIdByAttachmentIdRef?.current.get(attachmentId) !== asset.storageId
      || JSON.stringify(normalizeStudioBg3dGlbAttachment(host.attachmentByStorageModelIdRef?.current.get(asset.storageId))) !== JSON.stringify(asset.attachment)) {
      throw new StudioBg3dSceneGlbError("source-changed", "저장 준비 중 모델 원본이나 권리 연결이 바뀌었습니다. 현재 장면에서 다시 저장해 주세요.");
    }
  }
}
