/** CPU 예제의 중간 Float32 버퍼까지 고려한 픽셀 예산. 원본은 수정하지 않는다. */
export const MAX_CPU_IMAGE_PIXELS = 1024 * 1024;

export function assertImageGeometry(width: number, height: number): number {
  const pixels = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      !Number.isSafeInteger(pixels) || pixels > MAX_CPU_IMAGE_PIXELS) {
    throw new RangeError("이미지 크기는 양의 정수이고 CPU 예제의 1,048,576픽셀 한도 이하여야 합니다.");
  }
  return pixels;
}

export function assertRgbaBuffer(buffer: {
  readonly width: number; readonly height: number; readonly data: Uint8ClampedArray;
}): void {
  const pixels = assertImageGeometry(buffer.width, buffer.height);
  if (!(buffer.data instanceof Uint8ClampedArray) || buffer.data.length !== pixels * 4) {
    throw new RangeError("RGBA 버퍼 길이는 width × height × 4와 정확히 같아야 합니다.");
  }
}

export function assertUpscaleFactor(factor: number): void {
  if (factor !== 2 && factor !== 4) throw new RangeError("배율은 2 또는 4여야 합니다.");
}

/** 투명 픽셀의 숨은 RGB가 보간 결과에 섞이지 않도록 먼저 알파를 곱한다. */
export function premultiplyRgba(data: Uint8ClampedArray): Float32Array {
  const result = new Float32Array(data.length);
  for (let k = 0; k < data.length; k += 4) {
    const alpha = data[k + 3] ?? 0;
    for (let c = 0; c < 3; c += 1) result[k + c] = (data[k + c] ?? 0) * alpha / 255;
    result[k + 3] = alpha;
  }
  return result;
}

/** 보간은 premultiplied RGBA로, 외부 출력은 straight RGBA로 돌려준다. */
export function writeStraightPixel(
  out: Uint8ClampedArray, offset: number, rgba: readonly number[],
): void {
  const alpha = Math.min(255, Math.max(0, rgba[3] ?? 0));
  const roundedAlpha = Math.round(alpha);
  out[offset + 3] = roundedAlpha;
  for (let c = 0; c < 3; c += 1) {
    out[offset + c] = roundedAlpha > 0
      ? Math.round(Math.min(alpha, Math.max(0, rgba[c] ?? 0)) * 255 / alpha) : 0;
  }
}
