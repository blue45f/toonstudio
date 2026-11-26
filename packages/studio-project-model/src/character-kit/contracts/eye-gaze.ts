import { z } from "zod";

import { clamp, qFromEulerXYZ } from "../shared/math";

import type { Quat, Vec3 } from "./pose";

/** 눈 본 관절 제한(bones.ts)과 같은 ±25°. 생략된 레시피는 기존 pose를 그대로 쓴다. */
export const EYE_GAZE_LIMIT_DEG = 25;
const eyeAnglesSchema = z.object({ yawDeg: z.number().min(-25).max(25), pitchDeg: z.number().min(-25).max(25) }).strict();
const eyeQuaternionSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]).readonly().refine((q) => Math.abs(Math.hypot(...q) - 1) < 1e-4, "눈 회전은 단위 쿼터니언이어야 합니다.");
const frozenEyePoseSchema = z.object({ leftEye: eyeQuaternionSchema, rightEye: eyeQuaternionSchema }).strict();
export const eyeGazeSchema = z.object({
  mode: z.enum(["manual", "camera"]),
  symmetry: z.boolean(),
  left: eyeAnglesSchema,
  right: eyeAnglesSchema,
  /** 비항등 rest 축에서도 시선 고정이 roll을 잃지 않도록 실제 pose 회전을 저장한다. */
  frozenPose: frozenEyePoseSchema.optional(),
}).strict().refine((gaze) => !gaze.frozenPose || (gaze.mode === "manual" && !gaze.symmetry), "고정 회전은 수동·좌우 독립 상태에서만 저장합니다.");
export type EyeAngles = z.infer<typeof eyeAnglesSchema>;
export type EyeGaze = z.infer<typeof eyeGazeSchema>;
export const DEFAULT_EYE_GAZE: EyeGaze = Object.freeze({ mode: "manual", symmetry: true, left: Object.freeze({ yawDeg: 0, pitchDeg: 0 }), right: Object.freeze({ yawDeg: 0, pitchDeg: 0 }) });
/** 대칭은 수동 회전에만 적용한다. 카메라 응시는 각 눈의 실제 위치에서 같은 카메라를 향한다. */
export function resolveEyeGaze(gaze: EyeGaze): EyeGaze {
  return gaze.symmetry && gaze.mode === "manual" ? { ...gaze, right: { yawDeg: -gaze.left.yawDeg, pitchDeg: gaze.left.pitchDeg } } : gaze;
}
export type EyeGazeReading =
  | { readonly status: "available"; readonly left: EyeAngles; readonly right: EyeAngles; readonly frozenPose: z.infer<typeof frozenEyePoseSchema> }
  | { readonly status: "unavailable"; readonly reasonKo: string };

export function eyeAnglesQuaternion(angles: EyeAngles): Quat {
  return qFromEulerXYZ(angles.pitchDeg * Math.PI / 180, angles.yawDeg * Math.PI / 180, 0);
}

/** +Z 정면, +Y 위. 양의 pitch는 아래를 향한다(우수 좌표계 X 회전). */
export function eyeAnglesFromDirection(direction: Vec3): EyeAngles {
  const degrees = 180 / Math.PI;
  return {
    yawDeg: clamp(Math.atan2(direction[0], direction[2]) * degrees, -EYE_GAZE_LIMIT_DEG, EYE_GAZE_LIMIT_DEG),
    pitchDeg: clamp(-Math.atan2(direction[1], Math.hypot(direction[0], direction[2])) * degrees, -EYE_GAZE_LIMIT_DEG, EYE_GAZE_LIMIT_DEG),
  };
}
