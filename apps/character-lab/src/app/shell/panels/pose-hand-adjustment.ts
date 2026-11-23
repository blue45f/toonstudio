import { fingerCurl, sideSign } from "../../../animation";
import { LEFT_FINGER_BONE_NAMES, RIGHT_FINGER_BONE_NAMES, bonesInScope } from "../../../contracts";
import { QUAT_IDENTITY, clamp, qDot, qInverse, qMultiply, qNormalize, radToDeg } from "../../../shared/math";

import { buildSingleHandFinePose, type HandSlidersState } from "./pose-fine-limb-gaze-math";

import type { CharacterRecipe, HandPosePreset, HumanoidBoneName, Pose, Quat } from "../../../contracts";
import type { HandSide } from "./pose-panel-helpers";

type Side = "left" | "right";
const FINGERS = ["Index", "Middle", "Ring", "Little"] as const;

// 제작 리그의 손가락과 손목: Z 굴곡 × Y 벌림 × X 비틀림.
function handAngles(q: Quat, side: Side) {
  const [x, y, z, w] = qNormalize(q);
  const sign = -sideSign(side);
  return {
    flex: sign * radToDeg(Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))),
    spread: sign * radToDeg(Math.asin(clamp(2 * (w * y - z * x), -1, 1))),
  };
}

export function readHandSliders(pose: Pose, side: Side): HandSlidersState {
  const wrist = handAngles(pose[`${side}Hand`] ?? QUAT_IDENTITY, side);
  const index = handAngles(pose[`${side}IndexProximal`] ?? QUAT_IDENTITY, side);
  const little = handAngles(pose[`${side}LittleProximal`] ?? QUAT_IDENTITY, side);
  const curl = FINGERS.reduce((sum, finger) => sum + handAngles(pose[`${side}${finger}Intermediate`] ?? QUAT_IDENTITY, side).flex, 0);
  return { curlDeg: curl / FINGERS.length, spreadDeg: (index.spread - little.spread) / 1.65,
    wristFlexDeg: wrist.flex, wristDeviateDeg: wrist.spread };
}

export function effectiveHandPose(recipe: CharacterRecipe): Pose {
  return { ...recipe.pose, ...recipe.handPose.left, ...recipe.handPose.right };
}

export function matchesHandPosePreset(pose: Pose, side: HandSide, preset: HandPosePreset): boolean {
  return (["left", "right"] as const).every((target) => {
    if (side !== "both" && target !== side) return true;
    const fingers = target === "left" ? LEFT_FINGER_BONE_NAMES : RIGHT_FINGER_BONE_NAMES;
    return fingers.every((bone) => {
      const expected = preset[target][bone] ?? QUAT_IDENTITY;
      const actual = pose[bone] ?? QUAT_IDENTITY;
      return Math.abs(qDot(expected, actual)) > 1 - 1e-7;
    });
  });
}

export function adjustHandAxis(
  pose: Pose, side: HandSide, axis: keyof HandSlidersState, value: number, constrain: (changed: Pose) => Pose,
): Pose {
  const scope = side === "both" ? "arms-hands" : side === "left" ? "left-hand" : "right-hand";
  const next: Partial<Record<HumanoidBoneName, Quat>> = {};
  for (const bone of bonesInScope(scope)) {
    if (pose[bone]) next[bone] = pose[bone];
  }
  for (const target of ["left", "right"] as const) {
    if (side !== "both" && side !== target) continue;
    const values = readHandSliders(pose, target);
    const before = buildSingleHandFinePose(target, values);
    const after = buildSingleHandFinePose(target, { ...values, [axis]: value });
    const changed: Partial<Record<HumanoidBoneName, Quat>> = {};
    for (const bone of bonesInScope(target === "left" ? "left-hand" : "right-hand")) {
      const from = before[bone] ?? QUAT_IDENTITY;
      const to = after[bone] ?? QUAT_IDENTITY;
      if (from.every((component, i) => component === to[i])) continue;
      // 절대 그립으로 덮어쓰면 브이·가리키기의 펴진 손가락까지 접힌다.
      const actual = pose[bone] ?? QUAT_IDENTITY;
      let delta = qMultiply(to, qInverse(from));
      if (axis === "spreadDeg" && bone.endsWith("Proximal") && !bone.includes("Thumb")) {
        // 검지와 약지가 서로 다른 각도로 굽혀진 채 벌어질 때 각 손가락의 실제 굴곡축을 따른다.
        const alignment = fingerCurl(target, handAngles(actual, target).flex - handAngles(from, target).flex);
        delta = qMultiply(qMultiply(alignment, delta), qInverse(alignment));
      }
      changed[bone] = qNormalize(qMultiply(delta, actual));
    }
    Object.assign(next, constrain(changed));
  }
  return next;
}
