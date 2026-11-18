/** 녹화가 진행되는 캔버스의 demand 렌더러에만 새 프레임을 요청한다. */
const frameRequests = new WeakMap<HTMLCanvasElement, () => void>();

export function bindWorkspaceVideoFrame(canvas: HTMLCanvasElement, invalidate: () => void) {
  const request = () => invalidate();
  frameRequests.set(canvas, request);
  return () => {
    if (frameRequests.get(canvas) === request) frameRequests.delete(canvas);
  };
}

export function requestWorkspaceVideoFrame(canvas: HTMLCanvasElement) {
  frameRequests.get(canvas)?.();
}
