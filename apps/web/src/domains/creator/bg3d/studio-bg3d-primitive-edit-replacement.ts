import { FrontSide, Mesh, MeshStandardMaterial } from "three";

import {
  checkStudioBg3dThreeBudgets,
  measureStudioBg3dThreeMetrics,
  type BgCustomModelInstance,
} from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import { createStudioBg3dHistorySnapshot, type StudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import {
  assertStudioBg3dModelAttachmentAdmission,
  assertStudioBg3dModelPlacementAdmission,
  calculateStudioBg3dPlacedModelBytes,
} from "./studio-bg3d-model-placement-admission";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import {
  DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
  STUDIO_BG3D_GLB_MAX_BYTES,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
  normalizeStudioBg3dGlbAttachment,
  serializeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import type { StudioBg3dMaterialOverride, StudioBg3dModelAttachment, StudioBg3dSceneDocument } from "./studio-bg3d-scene-document-types";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import {
  revalidateStudioBg3dPrimitiveEditSource,
  type StudioBg3dPrimitiveEditSourceFailure,
  type StudioBg3dPrimitiveEditSourceHost,
  type StudioBg3dPrimitiveEditSourceSnapshot,
} from "./studio-bg3d-primitive-edit-source";
import type { StudioBg3dCanonicalDocumentMutation } from "./useStudioBg3dCanonicalDocumentState";

type RecordIdentity = Pick<Bg3dVerifiedStoredRecord, "id" | "contentHash" | "byteSize" | "mime" | "rights">;
export type StudioBg3dPrimitiveEditReplacementCache = Pick<StudioBg3dModelRootCacheEntry, "root" | "metrics" | "normalizationScale"> & {
  readonly record: RecordIdentity;
};

export interface StudioBg3dPrimitiveEditReplacementAsset {
  readonly storageModelId: string;
  readonly record: RecordIdentity;
  readonly attachment: StudioBg3dModelAttachment;
  readonly cache: StudioBg3dPrimitiveEditReplacementCache;
}

export interface StudioBg3dPrimitiveEditReplacementHost extends StudioBg3dPrimitiveEditSourceHost {
  readonly modelRootCacheRef: { readonly current: ReadonlyMap<string, StudioBg3dPrimitiveEditReplacementCache> };
  replaceCanonicalDocumentState(mutation: StudioBg3dCanonicalDocumentMutation): unknown;
  commitImmediateHistoryTransition(
    primitives: readonly BgPrimitive[], customModels: readonly BgCustomModelInstance[], document: StudioBg3dSceneDocument,
    before: StudioBg3dHistorySnapshot,
    options: { readonly commandId: string; readonly label: string; readonly source: "menu" },
  ): void;
}

export type StudioBg3dPrimitiveEditReplacementResult = StudioBg3dPrimitiveEditSourceFailure | {
  readonly ok: false;
  readonly code: "invalid-replacement" | "asset-mismatch" | "scale-out-of-range" | "budget-exceeded" | "document-rejected";
  readonly messageKo: string;
} | {
  readonly ok: true;
  readonly nodeId: string;
  readonly storageModelId: string;
  readonly document: StudioBg3dSceneDocument;
};

/** 단색 primitive의 숫자 PBR 기본값을 glTF 기본 metalness=1에 맡기지 않는다. */
export function createStudioBg3dPrimitiveEditMaterial(color: string): StudioBg3dMaterialOverride {
  return Object.freeze({ ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, colorMode: "replace", color,
    colorStrength: 1, roughness: 1, metalness: 0, emissiveColor: "#000000", emissiveIntensity: 1 });
}

function failure(
  code: Extract<StudioBg3dPrimitiveEditReplacementResult, { readonly ok: false }>["code"],
  messageKo: string,
): StudioBg3dPrimitiveEditReplacementResult { return { ok: false, code, messageKo }; }

function sameRecord(a: RecordIdentity, b: RecordIdentity): boolean {
  return a.id === b.id && a.contentHash === b.contentHash && a.byteSize === b.byteSize && a.mime === b.mime
    && sameRights(a.rights, b.rights);
}

function sameRights(a: RecordIdentity["rights"], b: RecordIdentity["rights"]): boolean {
  return a.status === b.status && a.commercialUse === b.commercialUse && a.attributionRequired === b.attributionRequired
    && a.attribution === b.attribution && a.licenseName === b.licenseName;
}

function normalizedCache(asset: StudioBg3dPrimitiveEditReplacementAsset): number | null {
  const { root, normalizationScale: scale } = asset.cache;
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) return null;
  const close = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) <= 64 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
  if (![root.scale.x, root.scale.y, root.scale.z].every((value) => close(value, scale))
    || !root.position.toArray().every((value) => close(value, 0))
    || ![root.quaternion.x, root.quaternion.y, root.quaternion.z].every((value) => close(value, 0))
    || !close(Math.abs(root.quaternion.w), 1)) return null;
  return scale;
}

/** 현 exporter의 무텍스처 StandardMaterial만 허용한다. false override로 원본 DoubleSide·투명도를 지울 수 없다. */
function plainGeneratedMaterial(asset: StudioBg3dPrimitiveEditReplacementAsset): boolean {
  let supported = true;
  let meshes = 0;
  asset.cache.root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshes += 1;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof MeshStandardMaterial) || material.side !== FrontSide || material.opacity !== 1
        || material.transparent || !material.depthWrite || !material.depthTest || !material.toneMapped
        || material.map || material.normalMap || material.roughnessMap || material.metalnessMap
        || material.emissiveMap || material.aoMap || material.alphaMap || material.bumpMap || material.displacementMap
        || material.lightMap || material.envMap) supported = false;
    }
  });
  return supported && meshes > 0;
}

function unchangedScene(before: StudioBg3dSceneDocument, after: StudioBg3dSceneDocument, selectedId: string): boolean {
  const withoutNodes = (document: StudioBg3dSceneDocument) => ({ ...document, nodes: [], attachments: [] });
  return JSON.stringify(withoutNodes(before)) === JSON.stringify(withoutNodes(after))
    && JSON.stringify(before.nodes.filter(({ id }) => id !== selectedId))
      === JSON.stringify(after.nodes.filter(({ id }) => id !== selectedId))
    && before.attachments.every((attachment) => after.attachments.some((next) => JSON.stringify(next) === JSON.stringify(attachment)));
}

/** 저장·admission 뒤 최신 원본과 실제 교체 후보 전체를 검사한다. 실패 경로는 문서·history·선택을 쓰지 않는다. */
export function replaceStudioBg3dPrimitiveEditSource(
  host: StudioBg3dPrimitiveEditReplacementHost,
  snapshot: StudioBg3dPrimitiveEditSourceSnapshot,
  asset: StudioBg3dPrimitiveEditReplacementAsset,
): StudioBg3dPrimitiveEditReplacementResult {
  const current = revalidateStudioBg3dPrimitiveEditSource(host, snapshot);
  if (!current.ok) return current;
  let candidate: { readonly primitives: readonly BgPrimitive[]; readonly customModels: readonly BgCustomModelInstance[]; readonly document: StudioBg3dSceneDocument };
  try {
    const { record, attachment, cache, storageModelId } = asset;
    const bound = host.attachmentByStorageModelIdRef.current.get(storageModelId);
    const normalizedAttachment = normalizeStudioBg3dGlbAttachment(attachment);
    if (storageModelId !== record.id || host.modelRootCacheRef.current.get(storageModelId) !== cache
      || !sameRecord(record, cache.record) || !normalizedAttachment || !bound
      || JSON.stringify(normalizeStudioBg3dGlbAttachment(bound)) !== JSON.stringify(normalizedAttachment) || attachment.id === storageModelId
      || attachment.hash !== record.contentHash || attachment.byteSize !== record.byteSize || attachment.mime !== record.mime
      || !sameRights(attachment.rights, record.rights)) {
      return failure("asset-mismatch", "저장한 모델·캐시·장면 원본 연결이 달라 상자를 교체하지 않았습니다.");
    }
    const scale = normalizedCache(asset);
    if (scale === null || !plainGeneratedMaterial(asset)) return failure("invalid-replacement", "모델 원점·정규화 배율·기본 재질을 안전하게 확인할 수 없습니다.");
    const inverseScale = current.primitive.scale.map((value) => value / scale);
    if (inverseScale.some((value) => !Number.isFinite(value) || value < 0.001 || value > 1_000)) {
      return failure("scale-out-of-range", "원본 크기를 유지하는 역배율이 장면 범위를 벗어났습니다. 크기를 잘라 교체하지 않았습니다.");
    }
    const measured = measureStudioBg3dThreeMetrics([cache.root], []);
    if (!measured.ok) return failure("invalid-replacement", "교체 모델의 실제 렌더 구조를 확인하지 못했습니다.");
    const cachedMetrics: Readonly<Record<string, number>> = { ...cache.metrics };
    if (Object.entries(measured.metrics).some(([key, value]) => cachedMetrics[key] !== value)
      || measured.metrics.textures !== 0 || measured.metrics.animations !== 0 || measured.metrics.skins !== 0
      || measured.metrics.joints !== 0 || measured.metrics.morphTargets !== 0 || measured.metrics.triangles < 1
      || checkStudioBg3dThreeBudgets(measured.metrics, current.runtime.document.budgets)) {
      return failure("budget-exceeded", "교체 모델의 실제 렌더 정보가 admission 또는 현재 장면 예산과 다릅니다.");
    }
    const primitive = current.primitive;
    const model: BgCustomModelInstance = {
      id: primitive.id, modelId: storageModelId, name: current.node.name,
      position: [...primitive.position], rotation: [...primitive.rotation],
      scale: [inverseScale[0], inverseScale[1], inverseScale[2]],
      ...(primitive.parentId !== undefined ? { parentId: primitive.parentId } : {}),
      ...(primitive.visible !== undefined ? { visible: primitive.visible } : {}),
      ...(primitive.locked !== undefined ? { locked: primitive.locked } : {}),
      ...(current.node.tags ? { tags: [...current.node.tags] } : {}),
      materialOverride: createStudioBg3dPrimitiveEditMaterial(primitive.color),
    };
    const primitives = current.runtime.primitives.filter(({ id }) => id !== primitive.id);
    const customModels = [...current.runtime.customModels, model];
    if (primitives.length + customModels.length > Math.min(STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES, current.runtime.document.budgets.complexity.maxNodes)) {
      return failure("budget-exceeded", "교체 후보가 현재 장면의 노드 예산을 초과합니다.");
    }
    assertStudioBg3dModelAttachmentAdmission({ models: customModels, attachments: host.attachmentByStorageModelIdRef.current,
      candidateAttachments: [attachment], maximumAttachments: STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS,
      maximumCumulativeBytes: STUDIO_BG3D_GLB_MAX_BYTES });
    assertStudioBg3dModelPlacementAdmission({ record, cachedRecord: cache.record, metrics: measured.metrics,
      budgets: current.runtime.document.budgets,
      cumulativeUsedBytes: calculateStudioBg3dPlacedModelBytes(customModels, host.attachmentByStorageModelIdRef.current, storageModelId),
      maximumCumulativeBytes: STUDIO_BG3D_GLB_MAX_BYTES });
    const adapted = tryAdaptStudioBg3dRuntimeToDocument({ primitives, customModels, baseDocument: current.runtime.document,
      attachmentByStorageModelId: host.attachmentByStorageModelIdRef.current });
    if (!adapted.ok || adapted.value.counts.droppedPrimitives !== 0 || adapted.value.counts.droppedCustomModels !== 0
      || adapted.value.counts.emittedPrimitives !== primitives.length || adapted.value.counts.emittedCustomModels !== customModels.length
      || adapted.value.diagnostics.length > 0 || new TextEncoder().encode(adapted.value.serialized).byteLength > STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES
      || serializeStudioBg3dSceneDocument(adapted.value.document) !== adapted.value.serialized
      || !unchangedScene(current.document, adapted.value.document, primitive.id)) {
      return failure("document-rejected", "교체 후보를 다른 장면 정보 손실 없이 저장할 수 없습니다.");
    }
    const persisted = adapted.value.document.nodes.find(({ id }) => id === primitive.id);
    if (!persisted || persisted.kind !== "model" || persisted.attachmentId !== attachment.id) {
      return failure("asset-mismatch", "교체 후보의 정본 모델 연결을 확인하지 못했습니다.");
    }
    candidate = { primitives, customModels, document: adapted.value.document };
  } catch {
    return failure("document-rejected", "교체 후보의 모델·용량·정본 검증을 통과하지 못했습니다.");
  }
  // 같은 JS 명령 안에서 마지막 scope fence를 통과한 뒤 단일 canonical revision과 단일 즉시 history를 발행한다.
  const finalSource = revalidateStudioBg3dPrimitiveEditSource(host, snapshot);
  if (!finalSource.ok) return finalSource;
  if (finalSource.runtime !== current.runtime) return failure("source-changed", "교체 검사 중 장면 상태가 바뀌었습니다. 다시 시도하세요.");
  const before = createStudioBg3dHistorySnapshot(current.runtime);
  host.commitImmediateHistoryTransition(candidate.primitives, candidate.customModels, candidate.document, before, {
    commandId: "studio.bg3d.primitive-edit.replace", label: "상자 원본 직접 편집", source: "menu",
  });
  host.replaceCanonicalDocumentState(candidate);
  return { ok: true, nodeId: snapshot.sourceNodeId, storageModelId: asset.storageModelId, document: candidate.document };
}
