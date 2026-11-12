/**
 * 포즈 강도(Slerp / 과장 블렌딩): 기준 포즈의 각 관절 회전을 Rest([0,0,0,1]) 기준으로
 * 부드럽게 감쇠(0..1)하거나 웹툰 역동성을 위해 과장(1..1.5)한다.
 */
import { QUAT_IDENTITY, clamp, qFromAxisAngle, qNormalize, qSlerp, qToAxisAngle } from "../shared/math";

import type { HumanoidBoneName, Pose, Quat } from "../contracts";

export const MIN_POSE_INTENSITY = 0;
export const MAX_POSE_INTENSITY = 1.5;
const MAX_SINGLE_BONE_ANGLE_RAD = Math.PI * 0.92;

/**
 * 기준 포즈 `basePose`에 강도 배율 `intensity` ∈ [0, 1.5]를 적용한 새 포즈를 반환한다.
 * - `intensity === 0`: 모든 본이 항등 회전이 되어 빈 포즈 `{}` 반환
 * - `0 < intensity <= 1`: `qSlerp(QUAT_IDENTITY, q, intensity)` 구면 선형 보간
 * - `1 < intensity <= 1.5`: 회전축을 유지한 채 각도를 `angle * intensity`로 확장(안전 상한 클램프)
 */
export function scalePoseIntensity(basePose: Pose, intensity: number): Pose {
  const t = Number.isFinite(intensity) ? clamp(intensity, MIN_POSE_INTENSITY, MAX_POSE_INTENSITY) : 1;
  if (t <= 1e-6) return {};
  const out: Partial<Record<HumanoidBoneName, Quat>> = {};
  for (const [bone, rawQuat] of Object.entries(basePose) as Array<[HumanoidBoneName, Quat | undefined]>) {
    if (!rawQuat) continue;
    const q = qNormalize(rawQuat);
    if (Math.abs(t - 1) <= 1e-6) {
      out[bone] = q;
      continue;
    }
    if (t < 1) {
      out[bone] = qSlerp(QUAT_IDENTITY, q, t);
      continue;
    }
    const { axis, angle } = qToAxisAngle(q);
    if (angle <= 1e-6) {
      out[bone] = QUAT_IDENTITY;
    } else {
      out[bone] = qNormalize(qFromAxisAngle(axis, Math.min(MAX_SINGLE_BONE_ANGLE_RAD, angle * t)));
    }
  }
  return out;
}
