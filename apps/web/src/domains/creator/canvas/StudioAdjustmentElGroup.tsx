/**
 * StudioAdjustmentElGroup — 문서 조정 레이어(AdjustmentEl)를 캔버스 합성에
 * 실제로 적용하는 Konva 그룹.
 *
 * 렌더 트리(`buildStudioLiveAdjustmentRenderTree`)가 조정 레이어보다 아래
 * 요소들을 이 그룹의 자식으로 접어 넣는다. 그룹을 cache()하면 자식 합성이
 * 오프스크린 버퍼로 격리되고, 그 버퍼에 조정 픽셀 패스
 * (`compositeAdjustmentPixels` — 종류별 실행 + 블렌드·불투명도)를 Konva
 * 필터로 적용한다. 문서 요소 자체는 건드리지 않는 비파괴 합성이라, 조정
 * 레이어를 숨기거나 지우면 트리에서 빠지고 원본 합성이 그대로 돌아온다.
 *
 * 라이브 조정 레이어(StudioLiveAdjustmentGroup)와 같은 캐시 패턴을 따르되,
 * 이쪽은 마스크·상태 발행·캡처 펜스가 없다 — 마스크(maskHash) 적용과 출력
 * 배율별 재계산은 후속 범위다(보고서 한계 참조).
 */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Group } from "react-konva/lib/ReactKonvaCore";

import { compositeAdjustmentPixels } from "../layer/studio-adjustment-composite-executor";
import type { AdjustmentElement } from "../layer/studio-adjustment-layer-elements";
import { registerStudioRasterPresentationCache } from "../render/studio-raster-presentation-cache";

import type Konva from "konva";

/** 미리보기 캐시 픽셀 상한 — 라이브 조정 그룹과 같은 총량 감각(프리뷰 예산의 절반). */
const PREVIEW_PIXEL_BUDGET = 33_554_432;

export function StudioAdjustmentElGroup({ element, width, height, cacheKey, pixelRatio = 1, children }: {
  element: AdjustmentElement;
  width: number;
  height: number;
  cacheKey: string;
  pixelRatio?: number;
  children: ReactNode;
}) {
  const ref = useRef<Konva.Group>(null);
  const inputsRef = useRef({ element });
  inputsRef.current = { element };
  useLayoutEffect(() => {
    const node = ref.current;
    const layer = node?.getLayer();
    if (!node || !layer) return;
    // 출력 배율이 커도 미리보기 예산을 넘지 않게 캐시 밀도를 낮춘다(최소 1).
    const requested = Math.max(1, Math.ceil(pixelRatio));
    const budgetDensity = Math.max(
      1,
      Math.floor(Math.sqrt(PREVIEW_PIXEL_BUDGET / Math.max(1, width * height))),
    );
    const density = Math.min(requested, budgetDensity);
    const recache = () => {
      try {
        node.filters([(imageData) => {
          const result = compositeAdjustmentPixels(
            { data: imageData.data, width: imageData.width, height: imageData.height },
            inputsRef.current.element,
          );
          imageData.data.set(result.imageData.data);
        }]);
        node.clearCache();
        node.cache({ x: 0, y: 0, width, height, pixelRatio: density, hitCanvasPixelRatio: 1 });
        layer.batchDraw();
        return true;
      } catch {
        return false;
      }
    };
    const unregister = registerStudioRasterPresentationCache(node, recache);
    recache();
    return () => {
      unregister();
      node.clearCache();
      node.filters([]);
    };
  }, [cacheKey, width, height, pixelRatio]);
  return <Group ref={ref}>{children}</Group>;
}
