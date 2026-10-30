/** 명시한 직교 높이만 기억한다. 기존 픽셀 절두체를 장면 단위 높이로 추정하지 않는다. */
import { isStudioBg3dOrthographicHeight } from "./studio-bg3d-camera-orientation";

export interface StudioBg3dFrustumViewport { readonly width: number; readonly height: number }
export interface StudioBg3dOrthographicPlanes {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}
export interface StudioBg3dOrthographicCameraLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
  manual?: boolean;
  updateProjectionMatrix(): void;
}
export interface StudioBg3dOrthographicFrustumPlan {
  readonly height: number | undefined;
  readonly planes: StudioBg3dOrthographicPlanes | null;
  readonly manual: boolean | undefined;
}

const authoredHeights = new WeakMap<object, number>();

export function readStudioBg3dCameraOrthographicHeight(camera: object): number | undefined { return authoredHeights.get(camera); }

/** 원근 카메라도 잠재된 직교 높이를 보존하되 실제 투영에는 적용하지 않는다. */
export function recordStudioBg3dCameraOrthographicHeight(camera: object, height: number | undefined): boolean {
  if (height !== undefined && !isStudioBg3dOrthographicHeight(height)) return false;
  if (height === undefined) authoredHeights.delete(camera);
  else authoredHeights.set(camera, height);
  return true;
}

function validViewport(value: StudioBg3dFrustumViewport | null | undefined): value is StudioBg3dFrustumViewport {
  return value !== null && value !== undefined && Number.isFinite(value.width) && Number.isFinite(value.height) && value.width > 0 && value.height > 0;
}

/** 높이를 고정하고 폭만 실제 트랙 비율에 맞춘다. zoom·view offset은 다른 단계에서 그대로 적용된다. */
export function resolveStudioBg3dOrthographicPlanes(height: number, viewport: StudioBg3dFrustumViewport | null | undefined): StudioBg3dOrthographicPlanes | null {
  if (!isStudioBg3dOrthographicHeight(height) || !validViewport(viewport)) return null;
  const width = height * (viewport.width / viewport.height);
  if (!Number.isFinite(width) || width / 2 <= 0) return null;
  return { left: -width / 2, right: width / 2, top: height / 2, bottom: -height / 2 };
}

/** 계산만 한다. legacy 복귀에 필요한 현재 픽셀 크기가 없으면 이전 월드 절두체를 추정해 바꾸지 않는다. */
export function planStudioBg3dOrthographicFrustum(
  camera: StudioBg3dOrthographicCameraLike,
  height: number | undefined,
  viewport?: StudioBg3dFrustumViewport | null,
): StudioBg3dOrthographicFrustumPlan | null {
  if (height !== undefined) {
    const aspectSource = viewport ?? { width: Math.abs(camera.right - camera.left), height: Math.abs(camera.top - camera.bottom) };
    const planes = resolveStudioBg3dOrthographicPlanes(height, aspectSource);
    return planes ? { height, planes, manual: true } : null;
  }
  if (readStudioBg3dCameraOrthographicHeight(camera) !== undefined) {
    if (!validViewport(viewport)) return null;
    return { height: undefined, manual: false, planes: { left: -viewport.width / 2, right: viewport.width / 2, top: viewport.height / 2, bottom: -viewport.height / 2 } };
  }
  return { height: undefined, planes: null, manual: camera.manual };
}

export function applyStudioBg3dOrthographicFrustumPlan(camera: StudioBg3dOrthographicCameraLike, plan: StudioBg3dOrthographicFrustumPlan): void {
  recordStudioBg3dCameraOrthographicHeight(camera, plan.height);
  if (plan.manual !== undefined) camera.manual = plan.manual;
  if (plan.planes) Object.assign(camera, plan.planes);
}

/** 매 프레임 실제 트랙 크기로 명시한 높이의 폭을 갱신한다. 다른 manual 카메라는 건드리지 않는다. */
export function resizeStudioBg3dAuthoredOrthographicFrustum(camera: StudioBg3dOrthographicCameraLike, viewport: StudioBg3dFrustumViewport): boolean {
  const height = readStudioBg3dCameraOrthographicHeight(camera);
  if (height === undefined) return false;
  const plan = planStudioBg3dOrthographicFrustum(camera, height, viewport);
  if (!plan) return false;
  const planes = plan.planes;
  const changed = planes && (camera.left !== planes.left || camera.right !== planes.right || camera.top !== planes.top || camera.bottom !== planes.bottom);
  applyStudioBg3dOrthographicFrustumPlan(camera, plan);
  if (changed) camera.updateProjectionMatrix();
  return true;
}
