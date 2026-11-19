/** 라이브 오버레이의 캔버스와 예약 프레임을 동기적으로 정리한다. */
export function releaseStudioLiveOverlayCanvas(
  canvas: HTMLCanvasElement | null,
  replacement: HTMLCanvasElement | null = null,
): void {
  if (!canvas || canvas === replacement) return;
  if (canvas.width !== 1) canvas.width = 1;
  if (canvas.height !== 1) canvas.height = 1;
}

export function clearStudioLiveOverlayCanvas(
  context: CanvasRenderingContext2D | null,
  canvas: HTMLCanvasElement | null,
): void {
  if (!context || !canvas) return;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

export function cancelStudioLiveOverlayFrame(frame: number): number {
  if (frame) {
    cancelAnimationFrame(frame);
    return 0;
  }
  return frame;
}
