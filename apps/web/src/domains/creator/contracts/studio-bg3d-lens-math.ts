/**
 * Studio BG3D 35mm 풀프레임 세로 화각 환산 순수 수학 리프.
 * 연계 3D 레이어 비교(studio-scene3d-linked-layer-source)가 3D 렌즈 UI/2점 투시 모듈 전체를
 * 초기 정적 그래프에 끌어오지 않고 초점거리 → 세로 화각 환산만 공유할 수 있게 한다.
 */

/** 35mm 풀프레임 세로 치수(mm). fov = 2·atan(12/f). */
export const STUDIO_BG3D_LENS_SENSOR_HEIGHT_MM = 24;
export const STUDIO_BG3D_LENS_MIN_FOCAL_MM = 8;
export const STUDIO_BG3D_LENS_MAX_FOCAL_MM = 135;
/** 문서 카메라 fovDegrees의 정규화 범위(studio-bg3d-scene-document.ts §normalizeCamera). */
export const STUDIO_BG3D_LENS_MIN_FOV_DEG = 10;
export const STUDIO_BG3D_LENS_MAX_FOV_DEG = 120;

export function studioBg3dFocalLengthToFovDegrees(focalLengthMm: number): number {
  const focal = Math.min(
    STUDIO_BG3D_LENS_MAX_FOCAL_MM,
    Math.max(STUDIO_BG3D_LENS_MIN_FOCAL_MM, Number.isFinite(focalLengthMm) ? focalLengthMm : 50),
  );
  const fov = (2 * Math.atan(STUDIO_BG3D_LENS_SENSOR_HEIGHT_MM / 2 / focal) * 180) / Math.PI;
  return Math.min(STUDIO_BG3D_LENS_MAX_FOV_DEG, Math.max(STUDIO_BG3D_LENS_MIN_FOV_DEG, fov));
}
