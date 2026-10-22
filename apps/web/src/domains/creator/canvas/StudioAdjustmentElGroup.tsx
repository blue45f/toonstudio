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
 * 마스크: 요소에 실물 마스크 픽셀(`maskSrc` — PSD 가져오기가 무손실 PNG로
 * 보존한 마스크)이 있으면 디코드해 커버리지로 곱한다. 라이브 조정 그룹과
 * 같은 규약으로, 커버리지는 캐시 버퍼 크기(=현재 밀도)에 맞춰 원본
 * 마스크에서 다시 투영하므로 출력 배율에서도 미리보기 마스크를 확대하지
 * 않는다. `maskHash`는 픽셀 실물이 없는 해시라 적용 대상이 아니다.
 * 마스크 디코드가 끝나기 전에는 조정 캐시를 확정하지 않고(자식은 무조정
 * 상태로 그려진다), 디코드가 실패하면 화면은 마스크 없이 진행하되 캡처는
 * 아래 펜스가 막는다.
 *
 * 캡처/내보내기: 라이브 조정 그룹과 같은 캡처 준비 펜스를 등록한다.
 * 캡처가 요청한 밀도에서는 미리보기 예산 캡을 적용하지 않고 그 밀도
 * 그대로 재계산한다(풀해상도 합성). 단, 작업 버퍼 한도(런타임 한도와 같은
 * 768MiB/20B-per-px 감각)를 넘는 밀도는 조용히 낮추지 않고 실패로 닫아,
 * 낮은 해상도 결과가 풀해상도인 척 나가지 않게 한다. 캡처가 끝나면
 * 복원 콜백이 미리보기 밀도로 되돌린다.
 */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Group } from "react-konva/lib/ReactKonvaCore";

import {
  adjustmentMaskCoverageFromImageData,
  compositeAdjustmentPixels,
  type AdjustmentMaskCoverage,
} from "../layer/studio-adjustment-composite-executor";
import type { AdjustmentElement } from "../layer/studio-adjustment-layer-elements";
import {
  refreshStudioRasterPresentationCaches,
  registerStudioRasterCapturePreparation,
  registerStudioRasterPresentationCache,
} from "../render/studio-raster-presentation-cache";

import type Konva from "konva";

/** 미리보기 캐시 픽셀 상한 — 라이브 조정 그룹과 같은 총량 감각(프리뷰 예산의 절반). */
const PREVIEW_PIXEL_BUDGET = 33_554_432;
/**
 * 캡처(풀해상도) 작업 버퍼 상한 — 조정 런타임 한도(maxWorkingBytes 768MiB,
 * 픽셀당 약 20바이트)와 같은 감각. Konva 캐시 버퍼 + 실행기 복제본 +
 * 마스크 커버리지를 합친 추정치로, 이보다 큰 출력은 실패로 닫는다.
 */
const CAPTURE_PIXEL_BUDGET = Math.floor((768 * 1024 * 1024) / 20);

type MaskState = "none" | "loading" | "ready" | "error";

async function decodeMaskImage(src: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      image.removeAttribute("src");
      reject(signal.reason);
    };
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("조정 레이어 마스크를 불러오지 못했어요."));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    image.src = src;
  });
}

/** 디코드된 마스크 원본을 캐시 버퍼 크기(=현재 밀도)로 다시 투영해 커버리지를 만든다. */
function renderMaskCoverage(
  image: HTMLImageElement,
  bufferWidth: number,
  bufferHeight: number,
): AdjustmentMaskCoverage {
  const canvas = document.createElement("canvas");
  canvas.width = bufferWidth;
  canvas.height = bufferHeight;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("조정 레이어 마스크 캔버스를 만들지 못했어요.");
    context.drawImage(image, 0, 0, bufferWidth, bufferHeight);
    const rgba = context.getImageData(0, 0, bufferWidth, bufferHeight);
    return adjustmentMaskCoverageFromImageData(
      { data: rgba.data, width: rgba.width, height: rgba.height },
      bufferWidth,
      bufferHeight,
    );
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

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
    const controller = new AbortController();
    const maskSrc = element.maskSrc && element.maskEnabled !== false ? element.maskSrc : undefined;
    let maskState: MaskState = maskSrc ? "loading" : "none";
    let maskImage: HTMLImageElement | null = null;
    // 출력 배율이 커도 미리보기 예산을 넘지 않게 캐시 밀도를 낮춘다(최소 1).
    const requested = Math.max(1, Math.ceil(pixelRatio));
    const budgetDensity = Math.max(
      1,
      Math.floor(Math.sqrt(PREVIEW_PIXEL_BUDGET / Math.max(1, width * height))),
    );
    const previewDensity = Math.min(requested, budgetDensity);
    let density = previewDensity;
    const recache = () => {
      if (controller.signal.aborted) return false;
      // 마스크 디코드가 끝나기 전에 조정 캐시를 확정하면 마스크 없는 결과가
      // 캐시에 굳는다 — 디코드가 끝나면 아래 로더가 다시 부른다.
      if (maskState === "loading") return false;
      try {
        node.filters([(imageData) => {
          const mask = maskState === "ready" && maskImage
            ? renderMaskCoverage(maskImage, imageData.width, imageData.height)
            : undefined;
          const result = compositeAdjustmentPixels(
            { data: imageData.data, width: imageData.width, height: imageData.height },
            inputsRef.current.element,
            mask,
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
    const unregisterCapture = registerStudioRasterCapturePreparation(node, (requestedDensity) => {
      if (maskState === "loading" || maskState === "error") {
        throw new Error("조정 레이어 마스크 준비가 끝나지 않아 출력하지 않았어요.");
      }
      const target = Math.max(1, Math.ceil(requestedDensity));
      if (width * height * target * target > CAPTURE_PIXEL_BUDGET) {
        throw new Error("요청한 출력 배율에서는 조정 레이어 작업 버퍼 한도를 넘어 출력하지 않았어요. 출력 배율을 낮춰 주세요.");
      }
      if (target === density) return () => undefined;
      const previous = density;
      const restore = () => {
        density = previous;
        if (!recache() || !refreshStudioRasterPresentationCaches(node)) {
          throw new Error("조정 레이어 화면 캐시를 복원하지 못했어요.");
        }
      };
      density = target;
      if (!recache() || !refreshStudioRasterPresentationCaches(node)) {
        try { restore(); } catch { /* 캡처는 실패로 닫힌다 — 부분 픽셀을 읽지 않는다. */ }
        throw new Error("요청한 출력 배율에서 조정 레이어를 계산하지 못했어요. 출력 배율을 낮춰 주세요.");
      }
      return restore;
    });
    recache();
    if (maskSrc) {
      void decodeMaskImage(maskSrc, controller.signal)
        .then((image) => {
          if (controller.signal.aborted) return;
          maskImage = image;
          maskState = "ready";
          if (recache() && refreshStudioRasterPresentationCaches(node)) layer.batchDraw();
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          // 화면은 마스크 없이 진행하되(기존 동작), 캡처 펜스가 error 상태를 막는다.
          maskState = "error";
          recache();
        });
    }
    return () => {
      controller.abort();
      unregisterCapture();
      unregister();
      node.clearCache();
      node.filters([]);
    };
  }, [cacheKey, width, height, pixelRatio]);
  return <Group ref={ref}>{children}</Group>;
}
