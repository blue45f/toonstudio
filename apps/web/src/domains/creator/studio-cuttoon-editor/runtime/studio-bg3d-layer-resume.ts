import { parseStudio3dTool } from "../../studio-background-3d-metadata";
import type { El, ImageEl } from "../../studio-element-model";
import { isEffectivelyLocked } from "../../studio-layers";
import { isPageReviewLocked } from "../../studio-page-review";
import type { PageState } from "../../studio-page-state";
import { resolveStudioScene3dLinkedLayerEditSource, snapshotStudioScene3dLinkedLayerEditSource } from "../../scene3d/studio-scene3d-linked-layer-source";

type ScenePage = Pick<PageState, "linked3dRender" | "shared3dStage">;

/** 레이어에서 열 때와 브라우저가 이전 항목을 복구할 때 같은 원본만 허용한다. */
export function studioBg3dLayerEditSource(element: El | null, page: ScenePage, elements: readonly El[]) {
  if (element?.type !== "image") return null;
  if (element.id.startsWith("vrmcut-") && element.src === `work-asset://image/${element.id}`) return { scene: undefined, legacyDataUrl: undefined, teamAnchorId: element.id };
  let source = element.bg3dScene;
  if (element.bg3dLtBundleId) {
    if (page.linked3dRender && page.shared3dStage) {
      const scene = resolveStudioScene3dLinkedLayerEditSource({
        bundleId: element.bg3dLtBundleId, linked3dRender: page.linked3dRender,
        shared3dStage: page.shared3dStage, elements,
      });
      return scene ? { scene } : null;
    }
    const anchor = elements.find((entry): entry is ImageEl =>
      entry.type === "image" && entry.bg3dLtBundleId === element.bg3dLtBundleId && entry.bg3dScene !== undefined);
    source = anchor?.bg3dScene ?? source;
  }
  if (source) {
    const scene = snapshotStudioScene3dLinkedLayerEditSource(source);
    return scene ? { scene } : null;
  }
  return parseStudio3dTool(element.src) === "bg3d" ? { legacyDataUrl: element.src } : null;
}

export function readStudioBg3dHistoryTarget(state: unknown): unknown {
  return typeof state === "object" && state !== null && "studioBg3dEditTarget" in state
    ? state.studioBg3dEditTarget ?? null : undefined;
}

/** 히스토리에는 식별자만 있다. 권한과 원본은 현재 원고에서 다시 구한다. */
export function resolveStudioBg3dHistoryTarget(
  target: unknown, scope: string, pages: readonly PageState[], documentLocked: boolean, reviewBound: boolean,
) {
  if (!target || typeof target !== "object" || !("scope" in target) || target.scope !== scope
    || !("pageId" in target) || !("layerId" in target) || documentLocked) return null;
  const matchingPages = pages.filter((page) => page.id === target.pageId);
  if (matchingPages.length !== 1) return null;
  const page = matchingPages[0]!;
  if (reviewBound && isPageReviewLocked(page.review)) return null;
  const layers = page.elements.filter((el) => el.id === target.layerId);
  const layer = layers[0];
  if (layers.length !== 1 || !layer || isEffectivelyLocked(layer, page.groups ?? [])) return null;
  const source = studioBg3dLayerEditSource(layer, page, page.elements);
  return source ? { pageId: page.id, layerId: layer.id, source } : null;
}
