import { Vector3 } from "three";

import { createStudioVrmPoseEvaluationRig } from "./studio-vrm-pose-evaluation-rig";
import { applyFingerRotations } from "./studio-vrm-poser-utils";
import { getStudioVrmJointLimit } from "./studio-vrm-joint-limits";
import { createStudioVrmVirtualFingertipProbe, sampleStudioVrmVirtualFingertip } from "./studio-vrm-virtual-fingertip";

import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D } from "three";
import type { StudioVrmHandPoseType, StudioVrmHandSide } from "./studio-vrm-hand-poses";
import type { FingerRotationMap } from "./studio-vrm-poser-utils";

const DEGREES = Math.PI / 180;
const CONTACT_AXES = [
  ["ThumbMetacarpal", "y", 32], ["ThumbMetacarpal", "z", 28], ["ThumbMetacarpal", "x", 20],
  ["ThumbProximal", "y", 26], ["ThumbProximal", "z", 20], ["ThumbDistal", "z", 15],
  ["IndexProximal", "y", 11], ["IndexProximal", "z", 16], ["IndexIntermediate", "z", 16],
] as const;

function isContactGesture(gesture: StudioVrmHandPoseType) {
  return gesture === "okSign" || gesture === "pinch" || gesture === "fingerHeart";
}

/** 원위마디를 펴서 같은 모델의 중립 연장축을 구한 뒤 편집 중인 회전을 즉시 복원한다. */
function neutralTip(distal: Object3D, parent: Object3D, handSize: number, lengthRatio: number) {
  const rotation = distal.quaternion.clone();
  try {
    distal.quaternion.identity();
    return createStudioVrmVirtualFingertipProbe({ distal, previousJoint: parent, handSize, lengthRatio });
  } finally {
    distal.quaternion.copy(rotation);
  }
}

/** 명시적으로 고른 접촉 제스처를 이미 보정된 모델 축 위에서 맞춘다. 일반 컬·추적 입력에는 적용하지 않는다. */
export function fitStudioVrmHandPresetContact(
  vrm: VRM, side: StudioVrmHandSide, gesture: StudioVrmHandPoseType, authored: FingerRotationMap,
): FingerRotationMap {
  if (!isContactGesture(gesture)) return authored;
  const bone = (name: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(name);
  const wrist = bone(`${side}Hand`), middleBase = bone(`${side}MiddleProximal`);
  const indexDistal = bone(`${side}IndexDistal`), indexPip = bone(`${side}IndexIntermediate`);
  const thumbDistal = bone(`${side}ThumbDistal`), thumbMcp = bone(`${side}ThumbProximal`);
  // 제외된 손이나 잠긴 마디가 있으면 사용자가 편집한 관절을 기준으로 새 접촉을 강요하지 않는다.
  if (!wrist || !middleBase || !indexDistal || !indexPip || !thumbDistal || !thumbMcp
    || !authored[`${side}IndexDistal`] || CONTACT_AXES.some(([name]) => !authored[`${side}${name}`])) return authored;
  const a = new Vector3(), b = new Vector3();
  const size = wrist.getWorldPosition(a).distanceTo(middleBase.getWorldPosition(b));
  const thumbTip = neutralTip(thumbDistal, thumbMcp, size, 0.82);
  const indexTip = neutralTip(indexDistal, indexPip, size, 0.72);
  if (!thumbTip || !indexTip) return authored;
  // 하트는 엄지가 검지 끝마디 옆을 가로지르고 두 집기 제스처는 끝마디 패드끼리 만난다.
  const indexPad = { ...indexTip, localTip: new Vector3(...indexTip.localTip)
    .multiplyScalar(gesture === "fingerHeart" ? 0.28 : 0.87).toArray() };
  const padDistance = size * 0.06;
  const axes = CONTACT_AXES.flatMap(([name, axis, excursion]) => {
    const id = `${side}${name}` as const;
    const node = bone(id), rotation = authored[id];
    if (!node || !rotation) return [];
    const component = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    const authoredAngle = rotation[component];
    const initial = node.rotation[axis];
    if (Math.abs(authoredAngle) < 1e-7) return [];
    const sign = Math.sign(initial / authoredAngle);
    if (!sign) return [];
    const limits = getStudioVrmJointLimit(id)[axis];
    const min = Math.max(initial - excursion * DEGREES, Math.min(sign * limits.hardMin, sign * limits.hardMax));
    const max = Math.min(initial + excursion * DEGREES, Math.max(sign * limits.hardMin, sign * limits.hardMax));
    return [{ id, node, axis, component, sign, initial, min, max }];
  });
  const score = () => {
    if (!sampleStudioVrmVirtualFingertip(thumbTip, a) || !sampleStudioVrmVirtualFingertip(indexPad, b)) return Infinity;
    const distance = a.distanceTo(b) - padDistance;
    const deviation = axes.reduce((sum, { node, axis, initial }) => sum + (node.rotation[axis] - initial) ** 2, 0);
    return (distance / size) ** 2 + deviation * 0.0004;
  };
  let best = score();
  if (best < 0.0004) return authored;
  // 작은 손가락 체인만 유한 횟수 탐색한다. 같은 점수나 실패에서는 원래 각도가 유지된다.
  for (const step of [12, 8, 5, 3, 2, 1]) {
    for (const { node, axis, min, max } of axes) {
      const previous = node.rotation[axis];
      let chosen = previous;
      for (const direction of [-1, 1]) {
        const candidate = Math.min(max, Math.max(min, previous + direction * step * DEGREES));
        node.rotation[axis] = candidate;
        const value = score();
        if (value < best) { best = value; chosen = candidate; }
      }
      node.rotation[axis] = chosen;
    }
  }
  // 독립 포저의 저장 형식은 저작 축 Euler다. V3와 같은 관절 해를 해당 축으로 되돌린다.
  const fitted = { ...authored };
  for (const { id, node, axis, component, sign, initial } of axes) {
    const rotation = fitted[id];
    if (!rotation || node.rotation[axis] === initial) continue;
    const next: [number, number, number] = [...rotation];
    next[component] = sign * node.rotation[axis];
    fitted[id] = next;
  }
  return fitted;
}

/** 독립 포저에서도 확정 전 화면의 스켈레톤과 잠긴 관절에는 쓰지 않는다. */
export function fitStudioVrmHandPresetEdits(
  source: VRM | null, side: StudioVrmHandSide, gesture: StudioVrmHandPoseType, authored: FingerRotationMap,
): FingerRotationMap {
  if (!source?.humanoid?.normalizedRestPose || !isContactGesture(gesture)) return authored;
  const isolated = createStudioVrmPoseEvaluationRig(source);
  applyFingerRotations(isolated, authored);
  return fitStudioVrmHandPresetContact(isolated, side, gesture, authored);
}
