import { useCallback, useRef } from "react";

import { compareColorFromRgb, type ComparePickedColor } from "./compare-review-model";

/**
 * 비교 페인 위 스포이드: 클릭한 지점의 색을 이미지에서 직접 샘플링한다.
 * 레퍼런스 캔버스(StudioReferencePanel)의 방식과 같게, 이미지를 작은 오프스크린
 * 캔버스에 그려 픽셀을 읽는다. CORS로 오염된 이미지(외부 URL 등)는 읽을 수 없어
 * null을 돌려주고 호출 측이 "이 이미지는 색을 찍을 수 없다"고 안내한다.
 */

const SAMPLE_CACHE_LIMIT = 6;

interface SampleRaster {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
}

export interface CompareEyedropper {
  /**
   * img 요소와 정규화 좌표(0..1, 이미지 콘텐츠 기준)로 색을 찍는다.
   * 실패(미로드·CORS 오염)하면 null.
   */
  readonly sample: (
    img: HTMLImageElement,
    point: { readonly x: number; readonly y: number },
  ) => ComparePickedColor | null;
}

export function useCompareReviewEyedropper(): CompareEyedropper {
  const cacheRef = useRef(new Map<string, SampleRaster | null>());

  const rasterFor = useCallback((img: HTMLImageElement): SampleRaster | null => {
    const key = img.currentSrc || img.src;
    const cache = cacheRef.current;
    if (cache.has(key)) return cache.get(key) ?? null;
    let raster: SampleRaster | null = null;
    try {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          raster = { canvas, width: img.naturalWidth, height: img.naturalHeight };
        }
      }
    } catch {
      raster = null;
    }
    if (cache.size >= SAMPLE_CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, raster);
    return raster;
  }, []);

  const sample = useCallback(
    (img: HTMLImageElement, point: { x: number; y: number }): ComparePickedColor | null => {
      const raster = rasterFor(img);
      if (!raster) return null;
      const ctx = raster.canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      const px = Math.min(raster.width - 1, Math.max(0, Math.floor(point.x * raster.width)));
      const py = Math.min(raster.height - 1, Math.max(0, Math.floor(point.y * raster.height)));
      try {
        const data = ctx.getImageData(px, py, 1, 1).data;
        return compareColorFromRgb(data[0], data[1], data[2]);
      } catch {
        // 오염된 캔버스 — 외부 이미지 등. 호출 측이 안내 문구를 띄운다.
        return null;
      }
    },
    [rasterFor],
  );

  return { sample };
}
