import type { Layer } from "konva/lib/Layer";
import type { StudioLiveInkSurface } from "../live/studio-live-ink-overlay";
import type { StudioLiveOilUnderlay } from "../live/studio-live-oil-underlay-paint";
import { SceneCanvas } from "konva/lib/Canvas";
import { STUDIO_KONVA_DOCUMENT_SHADOW_NAME } from "../studio-single-object-drag-layer";
import { useLayoutEffect } from "react";
import type { StudioCanvasViewportProps } from "./StudioCanvasViewportTypes";
import type { StudioLiveTransformDraftStore } from "../studio-live-transform-draft-store";

/** 문서와 라이브 표면의 바닥·인계 바인딩을 같은 layout 단계에서 갱신한다. */
export function useStudioLiveOilUnderlay(input: {
  readonly renderer: StudioCanvasViewportProps["liveRetainedMediaOverlayRenderer"];
  readonly layerRef: StudioCanvasViewportProps["mainLayerRef"];
  readonly ownsDocument: boolean;
  readonly left: number;
  readonly top: number;
  readonly transformStore: StudioLiveTransformDraftStore;
  readonly transformScope: string;
  readonly transformRevision: number | null;
  readonly gpuEnabled: boolean;
  readonly elements: StudioCanvasViewportProps["elements"];
}): void {
  const { renderer, layerRef, ownsDocument, left, top, transformStore, transformScope,
    transformRevision, gpuEnabled, elements } = input;
  useLayoutEffect(() => {
    renderer.oilUnderlay.setProvider((surface) => {
      return captureStudioLiveOilUnderlay(layerRef.current, ownsDocument, left, top, surface);
    });
    return () => renderer.oilUnderlay.setProvider(null);
  }, [renderer, layerRef, ownsDocument, left, top]);
  // 변형 terminal draft는 정본이 커밋된 layout 단계에서만 반납한다.
  useLayoutEffect(() => {
    const snapshot = transformStore.getSnapshot();
    if (gpuEnabled && snapshot?.scope === transformScope && snapshot.phase === "handoff") return;
    transformStore.acknowledgeAuthoritative(transformScope, elements);
  }, [elements, gpuEnabled, transformScope, transformStore, transformRevision]);
}

/** 새 획은 기존 요소 뒤에 추가되므로 정본 document 그룹 끝까지가 혼색 바닥이다. */
export function captureStudioLiveOilUnderlay(
  layer: Layer | null,
  ownsDocument: boolean,
  left: number,
  top: number,
  surface: StudioLiveInkSurface,
): StudioLiveOilUnderlay | null {
  if (!layer) return null;
  const native = layer.getCanvas();
  if (!ownsDocument) {
    const snapshot = new SceneCanvas({ width: surface.width, height: surface.height,
      pixelRatio: native.getPixelRatio() });
    snapshot.getContext().translate(left - surface.left, top - surface.top);
    // 정본 획 이전의 guide는 포함하고 이후 선택 핸들·위쪽 가이드는 굽지 않는다.
    for (const child of layer.getChildren()) {
      child.drawScene(snapshot);
      if (child.hasName(STUDIO_KONVA_DOCUMENT_SHADOW_NAME)) {
        return { canvas: snapshot._canvas, pixelRatio: native.getPixelRatio(),
          left: surface.left, top: surface.top };
      }
    }
    return null;
  }
  const visible = ownsDocument
    ? layer.getStage()?.content.querySelector<HTMLCanvasElement>("canvas[data-studio-skia-document-surface='true']")
    : native._canvas;
  if (!visible || (ownsDocument && visible.style.visibility !== "visible")) return null;
  // GPU 문서도 마지막으로 실제 표시한 바닥만 읽는다. 숨겨진 Konva 그림으로 대체하지 않는다.
  const box = visible.getBoundingClientRect();
  const mainBox = native._canvas.getBoundingClientRect();
  return { canvas: visible, pixelRatio: ownsDocument ? visible.width / box.width : native.getPixelRatio(),
    left: left + box.left - mainBox.left, top: top + box.top - mainBox.top };
}
