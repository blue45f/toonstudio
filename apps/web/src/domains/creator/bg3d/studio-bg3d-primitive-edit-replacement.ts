import { measureStudioBg3dEditReplacementAsset, validateStudioBg3dEditReplacementAsset } from "./studio-bg3d-edit-replacement-asset";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
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

type RecordIdentity = Pick<Bg3dVerifiedStoredRecord, "id" | "contentHash" | "byteSize" | "mime" | "rights" | "sourceRestriction">;
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
    const validated = validateStudioBg3dEditReplacementAsset(host, asset);
    if (!validated.ok) return validated;
    const scale = validated.normalizationScale;
    const inverseScale = current.primitive.scale.map((value) => value / scale);
    if (inverseScale.some((value) => !Number.isFinite(value) || value < 0.001 || value > 1_000)) {
      return failure("scale-out-of-range", "원본 크기를 유지하는 역배율이 장면 범위를 벗어났습니다. 크기를 잘라 교체하지 않았습니다.");
    }
    const measured = measureStudioBg3dEditReplacementAsset(asset, current.runtime.document.budgets);
    if (!measured.ok) return measured;
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
