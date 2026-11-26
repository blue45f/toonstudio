const MAX_PUBLISH_RASTER_PIXELS = 16_777_216;

/** 출판 인코더와 사전 검사가 할당 전에 공유하는 RGBA 크기 계약. */
export function isValidPublishRaster(
  rgba: Uint8Array | Uint8ClampedArray | null | undefined,
  width: number,
  height: number,
): rgba is Uint8Array | Uint8ClampedArray {
  return Number.isSafeInteger(width)
    && Number.isSafeInteger(height)
    && width > 0
    && height > 0
    && width * height <= MAX_PUBLISH_RASTER_PIXELS
    && rgba !== null
    && rgba !== undefined
    && rgba.length === width * height * 4;
}
