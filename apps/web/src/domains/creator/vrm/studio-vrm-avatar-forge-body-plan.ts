/**
 * v3 체형(body)의 레거시 리그 조정 계획. v4 부터 런타임 체형의 권위는 `studio-vrm-proportion-core`
 * 이고 이 계획은 제품 경로에서 쓰지 않는다(`studio-vrm-avatar-forge-v4-product-boundary.test.ts`).
 * 결정론 계약을 지키는 순수 함수로만 남긴다 — `studio-vrm-avatar-forge.ts` 에서 옮겨 왔다.
 */
import {
  AVATAR_FORGE_BODY_LIMITS,
  DEFAULT_AVATAR_FORGE_STATE,
  type AvatarForgeBodyParams,
  type AvatarForgeNumericLimit,
} from "./studio-vrm-avatar-forge";

export type AvatarForgeBodyBoneName =
  | "hips"
  | "spine"
  | "chest"
  | "upperChest"
  | "leftLowerArm"
  | "rightLowerArm"
  | "leftHand"
  | "rightHand"
  | "leftLowerLeg"
  | "rightLowerLeg"
  | "leftFoot"
  | "rightFoot";

export type AvatarForgeBodyBoneAdjustment = {
  readonly bone: AvatarForgeBodyBoneName;
  readonly positionMultiplier: readonly [number, number, number];
  readonly scaleMultiplier: readonly [number, number, number];
};

function clampNumber(value: unknown, limit: AvatarForgeNumericLimit, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(limit.max, Math.max(limit.min, numeric));
}

/**
 * Builds a renderer-independent, deterministic rig adjustment plan. Width is applied as a
 * conservative torso scale; length uses child-bone offsets so arbitrary source bone axes remain
 * intact and the original mesh/geometry buffers never change.
 */
export function buildAvatarForgeBodyAdjustmentPlan(
  body: AvatarForgeBodyParams,
): readonly AvatarForgeBodyBoneAdjustment[] {
  const defaults = DEFAULT_AVATAR_FORGE_STATE.body;
  const shoulder = clampNumber(body.shoulderWidth, AVATAR_FORGE_BODY_LIMITS.shoulderWidth, defaults.shoulderWidth);
  const torso = clampNumber(body.torsoLength, AVATAR_FORGE_BODY_LIMITS.torsoLength, defaults.torsoLength);
  const hip = clampNumber(body.hipWidth, AVATAR_FORGE_BODY_LIMITS.hipWidth, defaults.hipWidth);
  const arm = clampNumber(body.armLength, AVATAR_FORGE_BODY_LIMITS.armLength, defaults.armLength);
  const leg = clampNumber(body.legLength, AVATAR_FORGE_BODY_LIMITS.legLength, defaults.legLength);
  const unchanged = [1, 1, 1] as const;

  return [
    { bone: "hips", positionMultiplier: unchanged, scaleMultiplier: [hip, 1, 1] },
    { bone: "spine", positionMultiplier: [torso, torso, torso], scaleMultiplier: unchanged },
    { bone: "chest", positionMultiplier: [torso, torso, torso], scaleMultiplier: [shoulder, 1, 1] },
    { bone: "upperChest", positionMultiplier: [torso, torso, torso], scaleMultiplier: [shoulder, 1, 1] },
    { bone: "leftLowerArm", positionMultiplier: [arm, arm, arm], scaleMultiplier: unchanged },
    { bone: "rightLowerArm", positionMultiplier: [arm, arm, arm], scaleMultiplier: unchanged },
    { bone: "leftHand", positionMultiplier: [arm, arm, arm], scaleMultiplier: unchanged },
    { bone: "rightHand", positionMultiplier: [arm, arm, arm], scaleMultiplier: unchanged },
    { bone: "leftLowerLeg", positionMultiplier: [leg, leg, leg], scaleMultiplier: unchanged },
    { bone: "rightLowerLeg", positionMultiplier: [leg, leg, leg], scaleMultiplier: unchanged },
    { bone: "leftFoot", positionMultiplier: [leg, leg, leg], scaleMultiplier: unchanged },
    { bone: "rightFoot", positionMultiplier: [leg, leg, leg], scaleMultiplier: unchanged },
  ];
}
