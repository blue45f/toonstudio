/** 엔진을 불러오지 않는 캔버스 입력 설정·시점 제어 포트. */
export type ShaperCameraStyle = "unity" | "blender" | "max";
export type ShaperViewPreset = "front" | "left" | "top";

export interface CanvasViewportControls {
  applyViewPreset(view: ShaperViewPreset): void;
  detach(): void;
}

interface Registration {
  readonly controls: CanvasViewportControls;
  retired: boolean;
}

// 입력 설정은 렌더 엔진을 바꿔도 같은 캔버스에서 유지한다.
const cameraStyleByCanvas = new WeakMap<HTMLCanvasElement, ShaperCameraStyle>();
const controlsByCanvas = new WeakMap<HTMLCanvasElement, Registration>();

export function setCanvasCameraInputStyle(canvas: HTMLCanvasElement, style: ShaperCameraStyle): void {
  cameraStyleByCanvas.set(canvas, style);
}

export function getCanvasCameraInputStyle(canvas: HTMLCanvasElement): ShaperCameraStyle {
  return cameraStyleByCanvas.get(canvas) ?? "unity";
}

/** 새 소유자를 붙이기 전에 이전 입력을 정리하며, 오래된 해제는 새 소유자에 영향을 주지 않는다. */
export function registerCanvasViewportControls(canvas: HTMLCanvasElement, controls: CanvasViewportControls): () => void {
  const retire = (registration: Registration): void => {
    if (registration.retired) return;
    registration.retired = true;
    if (controlsByCanvas.get(canvas) === registration) controlsByCanvas.delete(canvas);
    registration.controls.detach();
  };
  const previous = controlsByCanvas.get(canvas);
  if (previous) retire(previous);
  const registration: Registration = { controls, retired: false };
  controlsByCanvas.set(canvas, registration);
  return () => retire(registration);
}

export function applyCanvasShaperViewPreset(canvas: HTMLCanvasElement, view: ShaperViewPreset): boolean {
  const registration = controlsByCanvas.get(canvas);
  if (!registration) return false;
  registration.controls.applyViewPreset(view);
  return true;
}
