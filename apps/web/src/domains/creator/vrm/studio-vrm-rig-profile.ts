import {
  canonicalizeStudioVrmJointRotation,
  dampStudioVrmJointRotation,
  getStudioVrmJointLimit,
  type StudioVrmJointAxisLimit,
  type StudioVrmJointLimit,
  type StudioVrmJointRotation,
} from "./studio-vrm-joint-limits";

import type { VRMHumanBoneName } from "@pixiv/three-vrm";

import {
  STUDIO_VRM_RIG_PROFILE_IDS,
  STUDIO_VRM_RIG_PROFILE_PURPOSE,
  STUDIO_VRM_RIG_PROFILE_VERSION,
  STUDIO_VRM_RIG_PROFILES,
  createStudioVrmRigProfileSelection,
  normalizeStudioVrmRigProfile,
  type StudioVrmRigProfile,
  type StudioVrmRigProfileId,
  type StudioVrmRigProfileInput,
  type StudioVrmRigProfilePurpose,
  type StudioVrmRigProfileSelection,
} from "../contracts/studio-vrm-rig-profile-selection";

export {
  STUDIO_VRM_RIG_PROFILE_IDS,
  STUDIO_VRM_RIG_PROFILE_PURPOSE,
  STUDIO_VRM_RIG_PROFILE_VERSION,
  STUDIO_VRM_RIG_PROFILES,
  createStudioVrmRigProfileSelection,
  normalizeStudioVrmRigProfile,
  type StudioVrmRigProfile,
  type StudioVrmRigProfileId,
  type StudioVrmRigProfileInput,
  type StudioVrmRigProfilePurpose,
  type StudioVrmRigProfileSelection,
};

function validAxisLimit(value: StudioVrmJointAxisLimit): boolean {
  const values = [value.hardMin, value.softMin, value.softMax, value.hardMax];
  return values.every(Number.isFinite)
    && value.hardMin <= value.softMin
    && value.softMin <= value.softMax
    && value.softMax <= value.hardMax;
}

function validJointLimit(value: StudioVrmJointLimit): boolean {
  return validAxisLimit(value.x) && validAxisLimit(value.y) && validAxisLimit(value.z);
}

function effectiveAxisLimit(
  base: StudioVrmJointAxisLimit,
  softRangeScale: number,
): StudioVrmJointAxisLimit {
  const midpoint = (base.softMin + base.softMax) / 2;
  const halfRange = (base.softMax - base.softMin) * softRangeScale / 2;
  const softMin = Math.max(base.softMin, Math.min(base.softMax, midpoint - halfRange));
  const softMax = Math.min(base.softMax, Math.max(base.softMin, midpoint + halfRange));
  return Object.freeze({
    hardMin: base.hardMin,
    softMin,
    softMax,
    hardMax: base.hardMax,
  });
}

/**
 * Applies a drawing preset to a trusted joint limit without ever changing its hard endpoints.
 * Invalid profiles or malformed limits fail closed instead of silently widening a joint.
 */
export function applyStudioVrmRigProfileToJointLimit(
  base: StudioVrmJointLimit,
  profileInput: StudioVrmRigProfileInput | unknown,
): StudioVrmJointLimit | null {
  const normalized = normalizeStudioVrmRigProfile(profileInput);
  if (!normalized || !validJointLimit(base)) return null;
  return Object.freeze({
    x: effectiveAxisLimit(base.x, normalized.softRangeScale),
    y: effectiveAxisLimit(base.y, normalized.softRangeScale),
    z: effectiveAxisLimit(base.z, normalized.softRangeScale),
  });
}

/** Effective profile limit for an existing normalized VRM humanoid bone. */
export function getEffectiveStudioVrmJointLimit(
  boneName: VRMHumanBoneName | unknown,
  profileInput: StudioVrmRigProfileInput | unknown,
): StudioVrmJointLimit | null {
  return applyStudioVrmRigProfileToJointLimit(
    getStudioVrmJointLimit(boneName),
    profileInput,
  );
}

const PROFILE_SOFT_LIMIT_CURVE = 3;

function clampProfileAxis(value: number, limit: StudioVrmJointAxisLimit): number {
  return Math.min(limit.hardMax, Math.max(limit.hardMin, value));
}

function profileSoftLimitProgress(value: number, limit: StudioVrmJointAxisLimit): number {
  if (value < limit.softMin) {
    return Math.min(1, (limit.softMin - value) / (limit.softMin - limit.hardMin));
  }
  if (value > limit.softMax) {
    return Math.min(1, (value - limit.softMax) / (limit.hardMax - limit.softMax));
  }
  return 0;
}

function dampProfileAxis(
  value: number,
  limit: StudioVrmJointAxisLimit,
  strength: number,
): number {
  const progress = profileSoftLimitProgress(value, limit);
  if (progress === 0 || strength === 0) return value;
  const denominator = strength * PROFILE_SOFT_LIMIT_CURVE * progress;
  const damping = -Math.expm1(-denominator) / denominator;
  if (value < limit.softMin) {
    return limit.softMin + (value - limit.softMin) * damping;
  }
  return limit.softMax + (value - limit.softMax) * damping;
}

/**
 * Applies a profile's effective soft interval and resistance to one IK rotation. Hard endpoints
 * remain the base joint limits. Invalid profile input fails closed with `null`.
 */
export function dampStudioVrmJointRotationForProfile(
  boneName: VRMHumanBoneName | unknown,
  rotation: unknown,
  profileInput: StudioVrmRigProfileInput | unknown,
): StudioVrmJointRotation | null {
  const profile = normalizeStudioVrmRigProfile(profileInput);
  if (!profile) return null;
  // This preserves the exact legacy math and output when the profile does not narrow soft ranges.
  if (profile.softRangeScale === 1) {
    return dampStudioVrmJointRotation(boneName, rotation, profile.damping);
  }
  const limit = getEffectiveStudioVrmJointLimit(boneName, profile);
  if (!limit) return null;
  const canonical = canonicalizeStudioVrmJointRotation(rotation);
  const values: StudioVrmJointRotation = [
    clampProfileAxis(canonical[0], limit.x),
    clampProfileAxis(canonical[1], limit.y),
    clampProfileAxis(canonical[2], limit.z),
  ];
  return [
    dampProfileAxis(values[0], limit.x, profile.damping),
    dampProfileAxis(values[1], limit.y, profile.damping),
    dampProfileAxis(values[2], limit.z, profile.damping),
  ];
}
