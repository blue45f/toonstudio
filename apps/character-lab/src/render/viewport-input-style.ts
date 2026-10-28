/** 앱과 렌더러가 공유하는 카메라 입력 설정. 특정 3D 엔진을 불러오지 않는다. */
export type ShaperCameraStyle = "unity" | "blender" | "max";

interface CameraInputTarget {
  alpha: number;
  beta: number;
  readonly lowerBetaLimit: number | null;
}

const cameraStyleByCanvas = new WeakMap<HTMLCanvasElement, ShaperCameraStyle>();
const cameraByCanvas = new WeakMap<HTMLCanvasElement, CameraInputTarget>();

export function setCanvasCameraInputStyle(canvas: HTMLCanvasElement, style: ShaperCameraStyle): void {
  cameraStyleByCanvas.set(canvas, style);
}

export function getCanvasCameraInputStyle(canvas: HTMLCanvasElement): ShaperCameraStyle {
  return cameraStyleByCanvas.get(canvas) ?? "unity";
}

/** 렌더러의 실제 카메라를 연결하며, 해제 시 더 최근에 연결된 카메라는 보존한다. */
export function registerCanvasCameraInputTarget(canvas: HTMLCanvasElement, camera: CameraInputTarget): () => void {
  cameraByCanvas.set(canvas, camera);
  return () => {
    if (cameraByCanvas.get(canvas) === camera) cameraByCanvas.delete(canvas);
  };
}

/** 정면·좌측면·상단 단축키를 연결된 실제 카메라의 구면각에 반영한다. */
export function applyCanvasShaperViewPreset(canvas: HTMLCanvasElement, view: "front" | "left" | "top"): boolean {
  const camera = cameraByCanvas.get(canvas);
  if (!camera) return false;
  camera.alpha = view === "left" ? Math.PI : Math.PI / 2;
  camera.beta = view === "top" ? Math.max(camera.lowerBetaLimit ?? 0.05, 0.08) : Math.PI / 2;
  return true;
}
