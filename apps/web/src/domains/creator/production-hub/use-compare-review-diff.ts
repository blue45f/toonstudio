import { useEffect, useState, type RefObject } from "react";

import {
  computeProcessCompareDiffRegions,
  type ProcessCompareDiffRegion,
} from "./process-compare-model";

/**
 * 비교 검수용 차이 영역 계산. 기존 use-process-compare-diff(슬라이더·깜빡 전용)를
 * 오버레이·나란히(첫 두 페인 기준)까지 넓힌 판이다. 두 이미지를 같은 크기의 작은
 * 캔버스에 그어 픽셀 차이 큰 셀을 이미지 콘텐츠 기준 % 박스로 돌려준다.
 * CORS 등으로 캔버스가 오염되면 빈 배열.
 */

const DIFF_PREVIEW_WIDTH = 80;

function readComparePixels(
  imgA: HTMLImageElement,
  imgB: HTMLImageElement,
): { dataA: Uint8ClampedArray; dataB: Uint8ClampedArray; width: number; height: number } | null {
  if (imgA.naturalWidth === 0 || imgB.naturalWidth === 0) return null;
  const width = DIFF_PREVIEW_WIDTH;
  const height = Math.max(1, Math.round((width * imgA.naturalHeight) / imgA.naturalWidth));

  const read = (img: HTMLImageElement): Uint8ClampedArray | null => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data;
  };

  const dataA = read(imgA);
  const dataB = read(imgB);
  if (!dataA || !dataB) return null;
  return { dataA, dataB, width, height };
}

export function useCompareReviewDiffRegions(
  enabled: boolean,
  artA: string | null,
  artB: string | null,
  imgARef: RefObject<HTMLImageElement | null>,
  imgBRef: RefObject<HTMLImageElement | null>,
): readonly ProcessCompareDiffRegion[] {
  const [regions, setRegions] = useState<readonly ProcessCompareDiffRegion[]>([]);

  useEffect(() => {
    if (!enabled || !artA || !artB) {
      setRegions([]);
      return;
    }
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const imgA = imgARef.current;
      const imgB = imgBRef.current;
      if (!imgA || !imgB) return;
      try {
        const pixels = readComparePixels(imgA, imgB);
        if (!pixels || cancelled) return;
        setRegions(
          computeProcessCompareDiffRegions(pixels.dataA, pixels.dataB, pixels.width, pixels.height),
        );
      } catch {
        if (!cancelled) setRegions([]);
      }
    };
    const timer = window.setTimeout(run, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, artA, artB, imgARef, imgBRef]);

  return regions;
}
