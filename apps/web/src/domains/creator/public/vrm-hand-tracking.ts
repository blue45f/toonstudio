/**
 * 플레이(가위바위보 등) 도메인이 웹캠 손 추적 및 손가락 본 역운동학(IK)을
 * 사용할 때 거치는 명시적 공개 경계.
 */
export {
  solveHandToFingerBones,
  type FingerEulerMap,
} from "../vrm/studio-vrm-hand-solver";
export {
  disposeHandLandmarker,
  initHandLandmarker,
} from "../vrm/studio-vrm-webcam-tracking";
