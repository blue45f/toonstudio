/**
 * manuscript-visual-diff.ts — 수정 전(v1)·수정 후(v2) 컷 픽셀 변경 영역을
 * 기기 안에서 즉시 계산하는 순수 함수 및 타임랩스 엔드카드 안내 규격.
 */

export interface PixelDiffBoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface PixelDiffSummary {
  readonly width: number;
  readonly height: number;
  readonly totalPixels: number;
  readonly changedPixelCount: number;
  readonly changedRatioPct: number;
  readonly hasChanges: boolean;
  readonly boundingBox: PixelDiffBoundingBox | null;
}

export interface TimelapseEndcardSpec {
  readonly workTitle: string;
  readonly creatorHandle: string;
  readonly portfolioUrl: string;
  readonly durationSec: 1.5;
  readonly certificateShortCode: string | null;
  readonly captionKo: string;
}

/**
 * 동일 해상도 RGBA 버퍼(픽셀당 4바이트) 두 개를 비교해 바뀐 픽셀 수와
 * 외접 사각형(bounding box) 좌표를 반환한다.
 */
export function computeRgbaDiffSummary(input: {
  readonly width: number;
  readonly height: number;
  readonly beforeRgba: Uint8Array | Uint8ClampedArray;
  readonly afterRgba: Uint8Array | Uint8ClampedArray;
  readonly channelThreshold?: number;
}): PixelDiffSummary {
  const { width, height, beforeRgba, afterRgba } = input;
  const threshold = Math.max(0, input.channelThreshold ?? 12);
  const totalPixels = Math.max(0, width * height);
  const expectedBytes = totalPixels * 4;

  if (
    width <= 0
    || height <= 0
    || beforeRgba.length < expectedBytes
    || afterRgba.length < expectedBytes
  ) {
    return {
      width: Math.max(0, width),
      height: Math.max(0, height),
      totalPixels: 0,
      changedPixelCount: 0,
      changedRatioPct: 0,
      hasChanges: false,
      boundingBox: null,
    };
  }

  let changedPixelCount = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let py = 0; py < height; py += 1) {
    const rowOffset = py * width * 4;
    for (let px = 0; px < width; px += 1) {
      const idx = rowOffset + px * 4;
      const dr = Math.abs((beforeRgba[idx] ?? 0) - (afterRgba[idx] ?? 0));
      const dg = Math.abs(
        (beforeRgba[idx + 1] ?? 0) - (afterRgba[idx + 1] ?? 0),
      );
      const db = Math.abs(
        (beforeRgba[idx + 2] ?? 0) - (afterRgba[idx + 2] ?? 0),
      );
      const da = Math.abs(
        (beforeRgba[idx + 3] ?? 0) - (afterRgba[idx + 3] ?? 0),
      );

      if (
        dr > threshold
        || dg > threshold
        || db > threshold
        || da > threshold
      ) {
        changedPixelCount += 1;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
    }
  }

  const hasChanges = changedPixelCount > 0 && maxX >= minX && maxY >= minY;
  const changedRatioPct =
    totalPixels > 0
      ? Number(((changedPixelCount / totalPixels) * 100).toFixed(2))
      : 0;

  return {
    width,
    height,
    totalPixels,
    changedPixelCount,
    changedRatioPct,
    hasChanges,
    boundingBox: hasChanges
      ? {
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        }
      : null,
  };
}

export function buildTimelapseEndcardSpec(input: {
  readonly workTitle: string;
  readonly creatorHandle: string;
  readonly certificateShortCode?: string | null;
}): TimelapseEndcardSpec {
  const cleanTitle = input.workTitle.trim() || "제목 미정 원고";
  const rawHandle = input.creatorHandle.trim().replace(/^@+/u, "") || "creator";
  const safeSlug = encodeURIComponent(rawHandle.toLowerCase());
  const shortCode = input.certificateShortCode?.trim() || null;

  return {
    workTitle: cleanTitle,
    creatorHandle: `@${rawHandle}`,
    portfolioUrl: `https://www.toonstudio.cloud/u/${safeSlug}`,
    durationSec: 1.5,
    certificateShortCode: shortCode,
    captionKo: shortCode
      ? `${cleanTitle} · @${rawHandle} · 권리 확인 #${shortCode}`
      : `${cleanTitle} · @${rawHandle} · 툰스튜디오 작업 기록`,
  };
}
