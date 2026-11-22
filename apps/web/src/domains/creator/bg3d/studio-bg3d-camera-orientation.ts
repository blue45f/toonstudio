/**
 * Studio BG3D 카메라 방향 수학·검증 재수출 창구.
 * 정본 계약은 `../contracts/studio-bg3d-camera-orientation` 에 두어
 * 문서 정규화 경로가 bg3d 금지 도메인으로 정적 엣지를 만들지 않도록 격리한다.
 */
export {
  STUDIO_BG3D_CAMERA_DEFAULT_NEAR_CLIP,
  STUDIO_BG3D_CAMERA_DEFAULT_UP,
  STUDIO_BG3D_CAMERA_MAX_DUTCH_ROLL_DEGREES,
  STUDIO_BG3D_CAMERA_MAX_NEAR_CLIP,
  STUDIO_BG3D_CAMERA_MAX_ORTHOGRAPHIC_HEIGHT,
  STUDIO_BG3D_CAMERA_MIN_DUTCH_ROLL_DEGREES,
  STUDIO_BG3D_CAMERA_MIN_NEAR_CLIP,
  STUDIO_BG3D_CAMERA_MIN_ORTHOGRAPHIC_HEIGHT,
  StudioBg3dCameraHeightValidationError,
  createStudioBg3dCameraUpForDutchRoll,
  isStudioBg3dCameraNearClip,
  isStudioBg3dCameraUpVectorValid,
  isStudioBg3dOrthographicHeight,
  normalizeStudioBg3dCameraUpVector,
  readStudioBg3dCameraDutchRollDegrees,
  readStudioBg3dOrthographicHeightField,
  resolveStudioBg3dCameraDistanceLimits,
  resolveStudioBg3dCameraNearClip,
  resolveStudioBg3dCameraUpVector,
  type StudioBg3dCameraOrientationLike,
  type StudioBg3dCameraOrientationVec3,
} from "../contracts/studio-bg3d-camera-orientation";
