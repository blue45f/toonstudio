import { applyStudioBundleSourcePatch } from "../catalog/studio-bundle-source-credit";
import { studioLinked3dPassSourceReplacementReason } from "../studio-linked-3d-raster-edit-policy";
import { studioWorkAssetSourceReplacementReason } from "../studio-work-asset-edit-guard";
import { isEffectivelyLocked } from "../studio-layers";
import { isPageReviewLocked } from "../studio-page-review";
import { linkedCutContextMatches, readLinkedCutPngSize } from "../vrm/studio-vrm-linked-cut-frame";
import { serializeStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";

import type { StudioVrmPoserInsertResult } from "../scene-3d/studio-3d-insert-contract";
import type { El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import type { StudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";

type ImageLayer = Extract<El, { type: "image" }>;

export interface StudioCharacterCutRefreshTarget {
  readonly elementId: string;
  readonly src: string;
  readonly scene: StudioVrmSceneDocument;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly layerFingerprint: string;
  readonly sceneFingerprint: string;
}

export interface StudioCharacterCutRefreshPlan {
  readonly pageId: string;
  readonly documentId: string;
  readonly revision: number;
  readonly targets: readonly StudioCharacterCutRefreshTarget[];
  readonly skipped: number;
}

function layerFingerprint(layer: ImageLayer): string {
  // 큰 PNG 문자열을 복제하지 않는다. 원본 PNG와 씬 일치는 각각 직접 확인한다.
  return JSON.stringify({ ...layer, src: undefined, vrmScene: undefined });
}

function reservedOrAmbiguousIds(page: PageState): Set<string> {
  const reserved = new Set(page.linked3dRender?.links.flatMap(link => link.layers.map(layer => layer.elementId)));
  const seen = new Set<string>();
  for (const element of page.elements) {
    if (seen.has(element.id)) reserved.add(element.id);
    seen.add(element.id);
  }
  return reserved;
}

function isSealedImage(layer: ImageLayer): boolean {
  return layer.bundleSourceCredit !== undefined || layer.bg3dLtBundleReference !== undefined
    || layer.bg3dLtBundleId !== undefined || layer.bg3dLtRole !== undefined || layer.bg3dScene !== undefined;
}

/** 한 페이지에서 같은 캐릭터에 명시적으로 연결된 편집 가능 컷만 캡처한다. */
export function planStudioCharacterCutRefresh(
  page: PageState, documentId: string, revision: number,
): StudioCharacterCutRefreshPlan {
  const targets: StudioCharacterCutRefreshTarget[] = [];
  let skipped = 0;
  if (documentId && Number.isSafeInteger(revision) && revision >= 0) {
    const reserved = reservedOrAmbiguousIds(page);
    const pageLocked = isPageReviewLocked(page.review);
    for (const element of page.elements) {
      const scene = element.type === "image" ? element.vrmScene : undefined;
      if (element.type !== "image" || !scene || scene.characterDocumentId !== documentId) continue;
      // 인라인 PNG 이외의 팀 에셋 URI와 봉인된 3D 패스는 캡처 원본으로 교체할 수 없다.
      const png = readLinkedCutPngSize(element.src);
      if (pageLocked || reserved.has(element.id) || isSealedImage(element) || isEffectivelyLocked(element, page.groups ?? []) || !png) {
        skipped++;
        continue;
      }
      const sceneFingerprint = serializeStudioVrmSceneDocument(scene);
      if (!sceneFingerprint) {
        skipped++;
        continue;
      }
      targets.push({ elementId: element.id, src: element.src, scene, pixelWidth: png.width, pixelHeight: png.height,
        layerFingerprint: layerFingerprint(element), sceneFingerprint });
    }
  }
  return { pageId: page.id, documentId, revision, targets, skipped };
}

/** 최신 페이지의 원본과 캡처 당시 상태가 일치하는 컷만 한 실행 취소 단위로 반영한다. */
export function applyStudioCharacterCutRefresh(
  page: PageState, plan: StudioCharacterCutRefreshPlan,
  results: ReadonlyMap<string, StudioVrmPoserInsertResult>,
  commit: (nextElements: El[], extraPatch?: undefined, targetPageId?: string) => boolean,
  currentCharacter: { readonly documentId: string; readonly revision: number } | null,
): { updated: number; skipped: number } {
  const total = plan.targets.length + plan.skipped;
  if (!currentCharacter || page.id !== plan.pageId || isPageReviewLocked(page.review)
    || currentCharacter.documentId !== plan.documentId || currentCharacter.revision !== plan.revision) {
    return { updated: 0, skipped: total };
  }
  const targets = new Map(plan.targets.map(target => [target.elementId, target]));
  const reserved = reservedOrAmbiguousIds(page);
  let updated = 0;
  const elements = page.elements.map((layer): El => {
    const target = targets.get(layer.id);
    const result = results.get(layer.id);
    if (!target || !result || layer.type !== "image" || !layer.vrmScene || reserved.has(layer.id) || isSealedImage(layer)
      || isEffectivelyLocked(layer, page.groups ?? []) || layer.src !== target.src
      || layer.vrmScene.characterDocumentId !== plan.documentId || result.scene.characterDocumentId !== plan.documentId
      || layerFingerprint(layer) !== target.layerFingerprint
      || serializeStudioVrmSceneDocument(layer.vrmScene) !== target.sceneFingerprint
      || !linkedCutContextMatches(layer.vrmScene, result.scene)) return layer;

    const size = readLinkedCutPngSize(result.pngDataUrl);
    if (!size || size.width !== target.pixelWidth || size.height !== target.pixelHeight
      || result.width !== size.width || result.height !== size.height) return layer;
    const scene = { ...layer.vrmScene, appearance: result.scene.appearance, props: result.scene.props };
    const capturedScene = serializeStudioVrmSceneDocument(scene);
    if (!capturedScene || (layer.src === result.pngDataUrl && capturedScene === target.sceneFingerprint)) return layer;
    const patch = { src: result.pngDataUrl, vrmScene: scene };
    if (studioWorkAssetSourceReplacementReason(layer, patch) || studioLinked3dPassSourceReplacementReason(layer, patch)) return layer;
    updated++;
    return applyStudioBundleSourcePatch(layer, patch);
  });
  if (updated > 0 && !commit(elements, undefined, page.id)) updated = 0;
  return { updated, skipped: total - updated };
}
