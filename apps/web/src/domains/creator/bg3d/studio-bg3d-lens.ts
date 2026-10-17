// 카메라 렌즈 수학 — Blender 카메라의 초점거리(mm) 표기와 2점 투시(수직선 보정)를 기존 문서
// 카메라 필드(fovDegrees·projection·lensShift)에 얹는 순수 모듈. Three.js/DOM 의존 없음.
//
// 초점거리 규약: 35mm 풀프레임 세로 24mm 기준의 "세로 화각" 환산. three.js PerspectiveCamera.fov가
// 세로 화각이므로 이 축을 기준으로 잡아야 렌더와 표기가 일치한다(가로 기준 환산을 쓰면 같은 mm가
// 뷰포트 비율에 따라 다른 그림이 되는 함정).
//
// 2점 투시 규약: 건축 일러스트의 "수직선을 화면에서 수직으로" 보정. 카메라 피치를 0(수평)으로
// 만들면 수직 엣지가 전부 화면 수직이 되고, 원래 바라보던 지점이 화면 밖으로 밀리는 만큼을
// lens shift(뷰 오프셋)로 되가져온다 — 틸트-시프트 렌즈의 라이즈/폴과 동일한 원리.

import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";

/** 35mm 풀프레임 세로 치수(mm). fov = 2·atan(12/f). */
export const STUDIO_BG3D_LENS_SENSOR_HEIGHT_MM = 24;
export const STUDIO_BG3D_LENS_MIN_FOCAL_MM = 8;
export const STUDIO_BG3D_LENS_MAX_FOCAL_MM = 135;
/** 문서 카메라 fovDegrees의 정규화 범위(studio-bg3d-scene-document.ts §normalizeCamera). */
export const STUDIO_BG3D_LENS_MIN_FOV_DEG = 10;
export const STUDIO_BG3D_LENS_MAX_FOV_DEG = 120;
/**
 * 렌즈 시프트(가로, 세로) 한 축의 절댓값 한도. 단위는 "프레임 한 변의 비율"이며
 * studio-bg3d-scene-document.ts 의 카메라·샷 정규화(±2)와 같은 값이다. 슬라이더, 2점 투시 자동 보정,
 * 문서 정규화가 모두 이 한 값을 따라야 화면에서 고른 값이 저장 단계에서 조용히 잘리지 않는다.
 */
export const STUDIO_BG3D_LENS_SHIFT_LIMIT = 2;
/** 이 값보다 작은 시프트는 "없음"으로 본다(부동소수 잡음 허용). */
const STUDIO_BG3D_LENS_SHIFT_EPSILON = 1e-4;

export function studioBg3dFocalLengthToFovDegrees(focalLengthMm: number): number {
  const focal = Math.min(
    STUDIO_BG3D_LENS_MAX_FOCAL_MM,
    Math.max(STUDIO_BG3D_LENS_MIN_FOCAL_MM, Number.isFinite(focalLengthMm) ? focalLengthMm : 50),
  );
  const fov = (2 * Math.atan(STUDIO_BG3D_LENS_SENSOR_HEIGHT_MM / 2 / focal) * 180) / Math.PI;
  return Math.min(STUDIO_BG3D_LENS_MAX_FOV_DEG, Math.max(STUDIO_BG3D_LENS_MIN_FOV_DEG, fov));
}

export function studioBg3dFovDegreesToFocalLength(fovDegrees: number): number {
  const fov = Math.min(
    STUDIO_BG3D_LENS_MAX_FOV_DEG,
    Math.max(STUDIO_BG3D_LENS_MIN_FOV_DEG, Number.isFinite(fovDegrees) ? fovDegrees : 50),
  );
  const focal = STUDIO_BG3D_LENS_SENSOR_HEIGHT_MM / 2 / Math.tan((fov * Math.PI) / 360);
  return Math.min(
    STUDIO_BG3D_LENS_MAX_FOCAL_MM,
    Math.max(STUDIO_BG3D_LENS_MIN_FOCAL_MM, focal),
  );
}

export interface StudioBg3dLensPreset {
  readonly focalLengthMm: number;
  readonly label: string;
}

export const STUDIO_BG3D_LENS_PRESETS: readonly StudioBg3dLensPreset[] = Object.freeze([
  { focalLengthMm: 12, label: "12mm 극광각" },
  { focalLengthMm: 16, label: "16mm 초광각" },
  { focalLengthMm: 24, label: "24mm 광각" },
  { focalLengthMm: 35, label: "35mm 준광각" },
  { focalLengthMm: 50, label: "50mm 표준" },
  { focalLengthMm: 85, label: "85mm 망원" },
  { focalLengthMm: 135, label: "135mm 인물 망원" },
]);

export interface StudioBg3dTwoPointPerspectiveResult {
  /** 수평화된 시선의 새 타깃(카메라와 같은 높이). */
  readonly target: readonly [number, number, number];
  /** 원래 타깃을 화면상의 원래 세로 위치로 되돌리는 세로 lens shift(전체 프레임 비율). */
  readonly lensShiftY: number;
}

/**
 * 현재 카메라 상태에서 2점 투시(수직 보정) 패치를 계산한다.
 *
 * 유도: 피치 θ = atan(Δy / d)일 때(Δy = target.y − position.y, d = 수평 거리), 카메라를 수평으로
 * 만들면 원래 타깃은 화면 중심에서 tanθ/tan(fov/2) NDC만큼 이동한다. three의
 * setViewOffset(F, F, sx·F, sy·F, F, F)는 서브창을 이미지 좌표(+y 아래)로 sy만큼 옮기므로,
 * 타깃이 화면 위쪽(Δy>0)에 있으면 sy<0(창을 위로)이어야 타깃이 프레임 안으로 돌아온다.
 * NDC 1 = 프레임 절반이라 shift 비율은 NDC 값의 ½: sy = −tanθ / (2·tan(fov/2)).
 * 부호·크기는 실제 THREE.PerspectiveCamera 투영으로 회귀 테스트한다(studio-bg3d-lens.test.ts).
 *
 * 수평 거리가 0(정수직 시점)이면 보정이 정의되지 않아 null — 호출부는 조용히 무시하면 된다.
 */
export function computeStudioBg3dTwoPointPerspective(
  view: Pick<StudioBg3dCameraSettings, "position" | "target" | "fovDegrees">,
): StudioBg3dTwoPointPerspectiveResult | null {
  const [px, py, pz] = view.position;
  const [tx, ty, tz] = view.target;
  const horizontalDistance = Math.hypot(tx - px, tz - pz);
  if (!Number.isFinite(horizontalDistance) || horizontalDistance < 1e-4) return null;
  const deltaY = ty - py;
  const tanPitch = deltaY / horizontalDistance;
  const tanHalfFov = Math.tan((view.fovDegrees * Math.PI) / 360);
  if (!Number.isFinite(tanHalfFov) || tanHalfFov < 1e-6) return null;
  const lensShiftY = -tanPitch / (2 * tanHalfFov);
  if (!Number.isFinite(lensShiftY)) return null;
  return {
    target: [tx, py, tz],
    // 문서 정규화 한도(±2)로 미리 클램프 — 극단 피치에서 조용히 잘려 저장되는 대신 여기서 확정.
    lensShiftY: clampStudioBg3dLensShiftValue(lensShiftY),
  };
}

/** 현재 카메라가 이미 2점 투시 상태(수평 시선 + 세로 시프트만)인지 판별한다. */
export function isStudioBg3dTwoPointPerspectiveActive(
  view: Pick<StudioBg3dCameraSettings, "position" | "target" | "lensShift">,
): boolean {
  const pitchLevel = Math.abs(view.target[1] - view.position[1]) < 1e-3;
  const shiftY = view.lensShift?.[1] ?? 0;
  return pitchLevel && Math.abs(shiftY) > STUDIO_BG3D_LENS_SHIFT_EPSILON;
}

export type StudioBg3dLensShift = readonly [number, number];
export type StudioBg3dLensShiftAxis = "x" | "y";

/** 유한하지 않은 값은 0, 그 밖에는 ±한도로 누른다(슬라이더·문서 정규화 공통). */
export function clampStudioBg3dLensShiftValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(
    STUDIO_BG3D_LENS_SHIFT_LIMIT,
    Math.max(-STUDIO_BG3D_LENS_SHIFT_LIMIT, value),
  );
}

/** 문서 카메라에서 [가로, 세로] 시프트를 읽는다. 값이 없거나 손상됐으면 [0, 0]. */
export function readStudioBg3dLensShift(
  view: Pick<StudioBg3dCameraSettings, "lensShift"> | null | undefined,
): StudioBg3dLensShift {
  const shift = view?.lensShift;
  if (!shift || shift.length !== 2) return [0, 0];
  return [clampStudioBg3dLensShiftValue(shift[0]), clampStudioBg3dLensShiftValue(shift[1])];
}

/** 한 축만 바꾼 새 시프트를 돌려준다. 다른 축은 그대로 두고 바꾼 값은 한도로 누른다. */
export function withStudioBg3dLensShiftAxis(
  current: StudioBg3dLensShift,
  axis: StudioBg3dLensShiftAxis,
  value: number,
): StudioBg3dLensShift {
  const next = clampStudioBg3dLensShiftValue(value);
  return axis === "x" ? [next, current[1]] : [current[0], next];
}

/** 두 축 모두 "없음" 범위인지(시프트 초기화 버튼의 활성 판정). */
export function isStudioBg3dLensShiftNeutral(shift: StudioBg3dLensShift): boolean {
  return (
    Math.abs(shift[0]) <= STUDIO_BG3D_LENS_SHIFT_EPSILON &&
    Math.abs(shift[1]) <= STUDIO_BG3D_LENS_SHIFT_EPSILON
  );
}

/** 슬라이더 값 표기: 부호를 붙인 소수 둘째 자리(0 은 부호 없이). */
export function formatStudioBg3dLensShiftValue(value: number): string {
  const rounded = Math.round(clampStudioBg3dLensShiftValue(value) * 100) / 100;
  if (rounded === 0) return "0.00";
  return `${rounded > 0 ? "+" : "\u2212"}${Math.abs(rounded).toFixed(2)}`;
}
