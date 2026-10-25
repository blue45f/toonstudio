/**
 * 플레이(가위바위보 등) 도메인이 VRM 포즈·표정·손가락 회전 유틸을
 * 사용할 때 거치는 명시적 공개 경계.
 */
export {
  applyExpressionWeightsToVrm,
  applyFingerRotations,
  applyPoseToVrm,
  POSE_PRESETS,
  type FingerRotationMap,
  type PoseBoneMap,
} from "../vrm/studio-vrm-poser-utils";
