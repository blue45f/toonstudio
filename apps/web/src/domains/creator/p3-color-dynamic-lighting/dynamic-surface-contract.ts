/** 합성 CPU 조명 예제의 입력 검증. 원본 버퍼는 읽기만 한다. */
export function assertSurfaceGeometry(width: number, height: number): number {
  const pixels = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      !Number.isSafeInteger(pixels) || pixels > 1024 * 1024) {
    throw new RangeError("표면 크기는 양의 정수이고 CPU 예제의 1,048,576픽셀 한도 이하여야 합니다.");
  }
  return pixels;
}

export function assertFloatChannel(
  data: Float32Array, expectedLength: number, min: number, max: number,
): void {
  if (!(data instanceof Float32Array) || data.length !== expectedLength ||
      data.some((value) => !Number.isFinite(value) || value < min || value > max)) {
    throw new RangeError("표면 채널의 길이 또는 유한 범위가 올바르지 않습니다.");
  }
}
