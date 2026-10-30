import { STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT, STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY } from "./studio-bg3d-primitive-edit-authoring-keys";
import { readStudioBg3dModelCacheEntry, resolveStudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";

import type { StudioBg3dAuthoredModelEditSourceHost } from "./studio-bg3d-authored-model-edit-source";
import type { StudioBg3dPrimitiveEditSourceSummary } from "./studio-bg3d-primitive-edit-source";

/** UI는 저장 권위·전체 cache entry를 요구하지 않는다. 실제 SourceHost도 이 좁은 입력을 만족한다. */
export type StudioBg3dAuthoredModelEditSummaryHost = Pick<StudioBg3dAuthoredModelEditSourceHost,
  "open" | "selectedIds" | "selectedIdsRef" | "physicsRuntimeSourceRef" | "modalAssetSessionRef" | "isPrimitiveEditInteractionLocked" | "modelRenderer" | "materialBackend" | "isMaterialBackendCurrent"
> & { readonly modelRootCacheRef: { readonly current: ReadonlyMap<string, { readonly root: { readonly userData: object }; readonly runtimeVariant: string; readonly record: { readonly id: string } }> } };

function ownValue(object: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function storedHint(userData: object): "missing" | "v1" | "malformed" {
  if (!Object.hasOwn(userData, STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY)) return "missing";
  const hint = ownValue(userData, STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY);
  return typeof hint === "object" && hint !== null && !Array.isArray(hint)
    && ownValue(hint, "format") === STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT && ownValue(hint, "version") === 1 ? "v1" : "malformed";
}

const blocked = (blockedReason: string): StudioBg3dPrimitiveEditSourceSummary => ({ nodeId: null, name: "", blockedReason });

/** 보관 힌트만 안내한다. 시작 시 dynamic source가 Blob SHA·권리·schema·scope를 다시 검증해야 한다. */
export function summarizeStudioBg3dAuthoredModelEditSource(host: StudioBg3dAuthoredModelEditSummaryHost): StudioBg3dPrimitiveEditSourceSummary {
  try {
    if (!host.open || !host.modalAssetSessionRef.current || host.isPrimitiveEditInteractionLocked()) {
      return blocked("현재 장면의 편집이 잠겨 있습니다. 진행 중인 작업이 끝난 뒤 다시 시도하세요.");
    }
    const ids = host.selectedIdsRef?.current ?? host.selectedIds;
    if (!ids || ids.size !== 1) return blocked("재편집할 저장 모델 하나만 선택하세요.");
    const runtime = host.physicsRuntimeSourceRef.current;
    const selectedId = ids.values().next().value;
    const model = runtime.customModels.find(({ id }) => id === selectedId);
    if (!model) return blocked("현재 선택한 객체는 재편집할 저장 모델이 아닙니다.");
    if (model.locked === true || model.visible === false || model.tags?.some((tag) => runtime.document.meta?.hiddenTags?.includes(tag))) {
      return blocked("숨기거나 잠긴 모델은 재편집할 수 없습니다. 숨긴 태그도 확인하세요.");
    }
    if (model.parentId != null || [...runtime.primitives, ...runtime.customModels].some(({ parentId }) => parentId === model.id)) {
      return blocked("부모·자식 관계가 없는 독립 모델을 선택하세요.");
    }
    const cache = host.isMaterialBackendCurrent?.() === false ? undefined : readStudioBg3dModelCacheEntry(host.modelRootCacheRef.current, model.modelId, resolveStudioBg3dMaterialBackend({ renderer: host.modelRenderer, materialBackend: host.materialBackend }));
    if (!cache) return blocked("모델 원본 캐시를 준비 중입니다. 모델이 표시된 뒤 다시 시도하세요.");
    if (storedHint(cache.root.userData) === "missing") {
      return blocked("이 기존 GLB에는 보관된 원본 면 편집 데이터가 없어 재편집할 수 없습니다.");
    }
    // v1 식별자가 맞아도 인증이 아니며, malformed 힌트의 구체적인 거부 역시 실제 capture가 담당한다.
    return { nodeId: model.id, name: model.name || "편집 모델", blockedReason: null };
  } catch { return blocked("현재 모델의 보관 힌트를 읽지 못했습니다. 모델이 표시된 뒤 다시 시도하세요."); }
}
