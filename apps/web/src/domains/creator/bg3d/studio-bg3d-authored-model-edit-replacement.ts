import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import { measureStudioBg3dEditReplacementAsset, validateStudioBg3dEditReplacementAsset } from "./studio-bg3d-edit-replacement-asset";
import { assertStudioBg3dModelAttachmentAdmission, assertStudioBg3dModelPlacementAdmission, calculateStudioBg3dPlacedModelBytes } from "./studio-bg3d-model-placement-admission";
import { createStudioBg3dPrimitiveEditMaterial } from "./studio-bg3d-primitive-edit-replacement";
import { revalidateStudioBg3dAuthoredModelEditSource } from "./studio-bg3d-authored-model-edit-source";
import { STUDIO_BG3D_GLB_MAX_BYTES, STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS, STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES, serializeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { StudioBg3dAuthoredModelEditSourceFailure, StudioBg3dAuthoredModelEditSourceHost, StudioBg3dAuthoredModelEditSourceSnapshot } from "./studio-bg3d-authored-model-edit-source";
import type { StudioBg3dPrimitiveEditReplacementAsset, StudioBg3dPrimitiveEditReplacementHost } from "./studio-bg3d-primitive-edit-replacement";
import type { StudioBg3dAttachmentRights, StudioBg3dSceneDocument } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dPrimitiveEditRuntime } from "./studio-bg3d-primitive-edit-source";

export interface StudioBg3dAuthoredModelEditReplacementHost extends StudioBg3dAuthoredModelEditSourceHost,
  Pick<StudioBg3dPrimitiveEditReplacementHost, "replaceCanonicalDocumentState" | "commitImmediateHistoryTransition"> {}
export type StudioBg3dAuthoredModelEditReplacementResult = StudioBg3dAuthoredModelEditSourceFailure | {
  readonly ok: false;
  readonly code: "asset-mismatch" | "invalid-replacement" | "scale-out-of-range" | "budget-exceeded" | "document-rejected";
  readonly messageKo: string;
} | { readonly ok: true; readonly nodeId: string; readonly storageModelId: string; readonly document: StudioBg3dSceneDocument };

function failure(code: Extract<StudioBg3dAuthoredModelEditReplacementResult, { readonly ok: false }>["code"], messageKo: string): StudioBg3dAuthoredModelEditReplacementResult {
  return { ok: false, code, messageKo };
}
function sameRights(a: StudioBg3dAttachmentRights, b: StudioBg3dAttachmentRights): boolean {
  return a.status === b.status && a.commercialUse === b.commercialUse && a.attributionRequired === b.attributionRequired
    && a.attribution === b.attribution && a.licenseName === b.licenseName;
}
function preservedScene(before: StudioBg3dSceneDocument, after: StudioBg3dSceneDocument, selectedId: string, removableAttachmentId: string | null): boolean {
  const nonObjects = (document: StudioBg3dSceneDocument) => ({ ...document, nodes: [], attachments: [] });
  return JSON.stringify(nonObjects(before)) === JSON.stringify(nonObjects(after))
    && JSON.stringify(before.nodes.filter(({ id }) => id !== selectedId)) === JSON.stringify(after.nodes.filter(({ id }) => id !== selectedId))
    && before.attachments.filter(({ id }) => id !== removableAttachmentId)
      .every((attachment) => after.attachments.some((next) => JSON.stringify(next) === JSON.stringify(attachment)));
}

/** 저장된 model A→B를 같은 node에서 교체한다. 공유 instance와 기존 library/cache는 변경하지 않는다. */
export function replaceStudioBg3dAuthoredModelEditSource(
  host: StudioBg3dAuthoredModelEditReplacementHost, source: StudioBg3dAuthoredModelEditSourceSnapshot,
  asset: StudioBg3dPrimitiveEditReplacementAsset,
): StudioBg3dAuthoredModelEditReplacementResult {
  const current = revalidateStudioBg3dAuthoredModelEditSource(host, source);
  if (!current.ok) return current;
  let candidate: StudioBg3dPrimitiveEditRuntime;
  try {
    const { record, cache, attachment, storageModelId } = asset;
    if (storageModelId === current.model.modelId || host.storageModelIdByAttachmentIdRef.current.get(attachment.id) !== storageModelId
      || !sameRights(record.rights, source.recordIdentity.rights)) {
      return failure("asset-mismatch", "새 편집 모델의 저장 연결·권리가 원본과 다르거나 교체할 새 원본이 없습니다.");
    }
    const validated = validateStudioBg3dEditReplacementAsset(host, asset);
    if (!validated.ok) return validated;
    const scale = source.objectTransform.scale.map((value) => value / validated.normalizationScale);
    if (scale.some((value) => !Number.isFinite(value) || value < 0.001 || value > 1_000)) {
      return failure("scale-out-of-range", "현재 원본 크기를 보존하는 역배율이 장면 범위를 벗어났습니다. 크기를 잘라 교체하지 않았습니다.");
    }
    const measured = measureStudioBg3dEditReplacementAsset(asset, current.runtime.document.budgets);
    if (!measured.ok) return measured;
    const model: BgCustomModelInstance = { ...current.model, modelId: storageModelId, name: current.node.name,
      position: [...current.node.transform.position], rotation: [...current.node.transform.rotation], scale: [scale[0], scale[1], scale[2]],
      ...(current.node.tags ? { tags: [...current.node.tags] } : {}), materialOverride: createStudioBg3dPrimitiveEditMaterial(source.sourceColorSrgb) };
    const primitives = current.runtime.primitives, customModels = current.runtime.customModels.map((item) => item.id === source.sourceNodeId ? model : item);
    if (primitives.length + customModels.length > Math.min(STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES, current.runtime.document.budgets.complexity.maxNodes)) {
      return failure("budget-exceeded", "교체 후보가 현재 장면의 노드 예산을 초과합니다.");
    }
    const oldAttachmentId = source.recordIdentity.attachmentId;
    const shared = current.document.nodes.some((node) => node.id !== source.sourceNodeId && node.kind === "model" && node.attachmentId === oldAttachmentId);
    const removableAttachmentId = shared ? null : oldAttachmentId;
    assertStudioBg3dModelAttachmentAdmission({ models: customModels, attachments: host.attachmentByStorageModelIdRef.current,
      candidateAttachments: [attachment], maximumAttachments: STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS, maximumCumulativeBytes: STUDIO_BG3D_GLB_MAX_BYTES });
    assertStudioBg3dModelPlacementAdmission({ record, cachedRecord: cache.record, metrics: measured.metrics, budgets: current.runtime.document.budgets,
      cumulativeUsedBytes: calculateStudioBg3dPlacedModelBytes(customModels, host.attachmentByStorageModelIdRef.current, storageModelId),
      maximumCumulativeBytes: STUDIO_BG3D_GLB_MAX_BYTES });
    // 이전 node/shot 참조를 정규화할 때 source attachment를 먼저 빼지 않는다. adapter가 최종 사용 원본만 내보낸다.
    const adapted = tryAdaptStudioBg3dRuntimeToDocument({ primitives, customModels, baseDocument: current.runtime.document,
      attachmentByStorageModelId: host.attachmentByStorageModelIdRef.current });
    if (!adapted.ok || adapted.value.counts.droppedPrimitives || adapted.value.counts.droppedCustomModels
      || adapted.value.counts.emittedPrimitives !== primitives.length || adapted.value.counts.emittedCustomModels !== customModels.length
      || adapted.value.diagnostics.length || new TextEncoder().encode(adapted.value.serialized).byteLength > STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES
      || serializeStudioBg3dSceneDocument(adapted.value.document) !== adapted.value.serialized
      || !preservedScene(current.document, adapted.value.document, source.sourceNodeId, removableAttachmentId)) {
      return failure("document-rejected", "모델 교체 후보를 다른 장면·원본 연결 정보 손실 없이 저장할 수 없습니다.");
    }
    const persisted = adapted.value.document.nodes.find(({ id }) => id === source.sourceNodeId);
    if (!persisted || persisted.kind !== "model" || persisted.attachmentId !== attachment.id) {
      return failure("asset-mismatch", "교체 후보의 정본 모델 연결을 확인하지 못했습니다.");
    }
    candidate = { primitives, customModels, document: adapted.value.document };
  } catch {
    return failure("document-rejected", "교체 후보의 모델·용량·정본 검증을 통과하지 못했습니다.");
  }
  const finalSource = revalidateStudioBg3dAuthoredModelEditSource(host, source);
  if (!finalSource.ok) return finalSource;
  if (finalSource.runtime !== current.runtime) return failure("source-changed", "교체 검사 중 장면 상태가 바뀌었습니다. 최신 원본에서 다시 시도하세요.");
  const before = createStudioBg3dHistorySnapshot(current.runtime);
  host.commitImmediateHistoryTransition(candidate.primitives, candidate.customModels, candidate.document, before,
    { commandId: "studio.bg3d.authored-model-edit.replace", label: "모델 원본 면 재편집", source: "menu" });
  host.replaceCanonicalDocumentState(candidate);
  return { ok: true, nodeId: source.sourceNodeId, storageModelId: asset.storageModelId, document: candidate.document };
}
