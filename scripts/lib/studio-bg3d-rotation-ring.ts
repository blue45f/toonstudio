export interface StudioBg3dRingPixel {
  readonly x: number;
  readonly y: number;
}

export interface StudioBg3dRingMask {
  readonly width: number;
  readonly height: number;
  readonly pixels: readonly StudioBg3dRingPixel[];
}

/** 기본 상자·카메라의 실제 녹색 Y 링에서 입력점을 고른다. 화면 비율로 다른 축을 누르지 않는다. */
export function resolveStudioBg3dRotationRing(mask: StudioBg3dRingMask) {
  const { width, height, pixels } = mask;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 100 || height < 100
    || pixels.length < 40 || pixels.length > width * height * 0.02
    || pixels.some(({ x, y }) => !Number.isInteger(x) || !Number.isInteger(y)
      || x < width * 0.2 || x >= width * 0.8 || y < height * 0.2 || y >= height * 0.8)) {
    throw new Error("BG3D 녹색 Y 회전 링의 픽셀 근거가 없거나 모호합니다.");
  }
  const xs = pixels.map(({ x }) => x);
  const ys = pixels.map(({ y }) => y);
  const left = Math.min(...xs), right = Math.max(...xs);
  const top = Math.min(...ys), bottom = Math.max(...ys);
  const spanX = right - left, spanY = bottom - top;
  if (spanX < width * 0.1 || spanY < 4 || spanY > spanX * 0.6
    || Math.abs((left + right) / 2 - width / 2) > width * 0.1) {
    throw new Error("BG3D 녹색 픽셀이 기본 카메라의 Y 회전 링 기하와 다릅니다.");
  }
  const atColumn = (fraction: number): StudioBg3dRingPixel => {
    const column = Math.round(left + spanX * fraction);
    const values = pixels.filter(({ x }) => x === column).map(({ y }) => y).sort((a, b) => a - b);
    if (values.length === 0) throw new Error("BG3D Y 링의 입력 열에 실제 픽셀이 없습니다.");
    return { x: column, y: values[Math.floor(values.length / 2)] };
  };
  const start = atColumn(0.85);
  const end = atColumn(0.5);
  if (start.y < top + spanY * 0.4 || end.y < top + spanY * 0.6
    || start.x - end.x < spanX * 0.3) {
    throw new Error("BG3D Y 회전 링의 앞쪽 호를 확인하지 못했습니다.");
  }
  return { axis: "Y" as const, width, height, pixelCount: pixels.length,
    bounds: { left, top, right, bottom }, start, end };
}
