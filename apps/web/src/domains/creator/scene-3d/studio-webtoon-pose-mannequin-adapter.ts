/**
 * 웹툰 포즈 프리셋(휴머노이드 관절 오일러 deg) → 데생 인형 포즈(rad) 어댑터.
 *
 * - 데생 인형 정본 포즈(`studio-webtoon-pose-mannequin-overrides.ts`)가 있으면 그것을 쓴다.
 *   원본 관절값은 VRM 포저와 공유하는 휴머노이드 규약이라 데생 인형에서 팔꿈치가 펴지고
 *   손이 얼굴로 가지 못했다 — 정본은 같은 연출을 데생 인형 규약으로 다시 저작한 값이다.
 * - 정본이 없는 프리셋(사용자·외부 데이터)은 기존처럼 "hips"→"pelvis" 로 매핑한다.
 * - 모르는 관절은 버리고, 각도는 관절 한계 클램프를 거친 뒤 정규화한다.
 *   (studio-mannequin-poses.ts의 "알 수 없는 관절은 버리고 클램프" 계약과 동일)
 * - 골반 높이는 rest 그대로 둔다. 접지는 적용 시점에 현재 체형으로 다시 계산한다
 *   (`resolveWebtoonPresetGroundSpec` + `groundStudioMannequinPoseForSupport`).
 */

import {
  clampStudioMannequinJointRotation,
  isStudioMannequinJointId,
  type StudioMannequinJointId,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  STUDIO_MANNEQUIN_DEFAULT_GROUND_SPEC,
  type StudioMannequinPoseGroundSpec,
} from "./studio-mannequin-pose-ground-contact";
import {
  createStudioMannequinRestPose,
  normalizeStudioMannequinPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";
import { STUDIO_WEBTOON_POSE_MANNEQUIN_OVERRIDES } from "./studio-webtoon-pose-mannequin-overrides";

import type { CharacterFullBodyPosePreset } from "./studio-3d-advanced-poses-library";

const DEG_TO_RAD = Math.PI / 180;

/** 휴머노이드 관절명 → 마네킹 관절 id. "hips"만 이름이 다르다. */
function resolveMannequinJointId(joint: string): StudioMannequinJointId | null {
  if (joint === "hips") return "pelvis";
  return isStudioMannequinJointId(joint) ? joint : null;
}

function toClampedRadians(
  jointId: StudioMannequinJointId,
  degrees: readonly [number, number, number],
): StudioMannequinVec3 {
  const [xDeg, yDeg, zDeg] = degrees;
  return clampStudioMannequinJointRotation(jointId, [
    xDeg * DEG_TO_RAD,
    yDeg * DEG_TO_RAD,
    zDeg * DEG_TO_RAD,
  ]);
}

export function convertWebtoonPresetToMannequinPose(
  preset: CharacterFullBodyPosePreset,
): StudioMannequinPose {
  const joints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {};
  const override = Object.hasOwn(STUDIO_WEBTOON_POSE_MANNEQUIN_OVERRIDES, preset.id)
    ? STUDIO_WEBTOON_POSE_MANNEQUIN_OVERRIDES[preset.id]
    : undefined;
  if (override) {
    for (const [jointId, degrees] of Object.entries(override.joints)) {
      if (!isStudioMannequinJointId(jointId) || !degrees) continue;
      joints[jointId] = toClampedRadians(jointId, degrees);
    }
  } else {
    for (const rotation of preset.jointRotations) {
      const target = resolveMannequinJointId(rotation.joint);
      if (!target) continue;
      joints[target] = toClampedRadians(target, rotation.rotationEulerDeg);
    }
  }
  // 웹툰 프리셋에는 골반 오프셋이 없으므로 rest 위치를 유지한다(접지는 적용 시점 계산).
  return normalizeStudioMannequinPose({
    ...createStudioMannequinRestPose(),
    joints,
  });
}

/** 웹툰 프리셋의 지지 방식. 정본이 없으면 발로 선 자세로 본다. */
export function resolveWebtoonPresetGroundSpec(
  preset: Pick<CharacterFullBodyPosePreset, "id">,
): StudioMannequinPoseGroundSpec {
  return Object.hasOwn(STUDIO_WEBTOON_POSE_MANNEQUIN_OVERRIDES, preset.id)
    ? STUDIO_WEBTOON_POSE_MANNEQUIN_OVERRIDES[preset.id]?.ground ?? STUDIO_MANNEQUIN_DEFAULT_GROUND_SPEC
    : STUDIO_MANNEQUIN_DEFAULT_GROUND_SPEC;
}
