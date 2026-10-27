import {
  getStudioHumanoidBoneDescriptor,
  isStudioHumanoidBoneName,
  type StudioHumanoidBoneName,
} from "../studio-humanoid-bones";

import type {
  DirectionTarget,
  FingerRotationMap,
  PoseBone,
  PoseBoneMap,
  Vec3,
} from "./studio-vrm-poser-utils";

const LIMB_DIRECTION_BONE_SET: ReadonlySet<StudioHumanoidBoneName> = new Set([
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
  "leftUpperLeg",
  "rightUpperLeg",
  "leftLowerLeg",
  "rightLowerLeg",
]);

export interface StudioVrmPoseApplyInput {
  readonly currentBones: PoseBoneMap;
  readonly currentFingerEdits: FingerRotationMap;
  /** Body bone targets. Accepts PoseBoneMap or a rotation-only record. */
  readonly incomingBones?: PoseBoneMap | Readonly<Record<string, { readonly rotation?: unknown }>>;
  /** Finger bone targets as raw Euler triples (FingerRotationMap shape). */
  readonly incomingFingerEdits?: FingerRotationMap | Readonly<Record<string, unknown>>;
  readonly lockedBones?: readonly string[];
  readonly isBoneAvailable: (bone: StudioHumanoidBoneName) => boolean;
  readonly clampRotation?: (
    bone: StudioHumanoidBoneName,
    axisIndex: 0 | 1 | 2,
    radians: number,
  ) => number;
  /** 0 = keep current (identity); 1 = full replace. Default 1. */
  readonly strength?: number;
}

export interface StudioVrmPoseApplyPlan {
  readonly bones: PoseBoneMap;
  readonly fingerEdits: FingerRotationMap;
  readonly appliedBodyBones: readonly StudioHumanoidBoneName[];
  readonly appliedFingerBones: readonly StudioHumanoidBoneName[];
  readonly skippedLocked: readonly StudioHumanoidBoneName[];
  readonly skippedMissing: readonly StudioHumanoidBoneName[];
  readonly skippedInvalid: readonly string[];
}

const ZERO: Vec3 = Object.freeze([0, 0, 0]);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function asFiniteTriple(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const x = value[0];
  const y = value[1];
  const z = value[2];
  if (
    typeof x !== "number" || !Number.isFinite(x)
    || typeof y !== "number" || !Number.isFinite(y)
    || typeof z !== "number" || !Number.isFinite(z)
  ) {
    return null;
  }
  return Object.freeze([x, y, z]);
}

function extractIncomingBodyRotation(value: unknown): Vec3 | null {
  if (value == null || typeof value !== "object") return null;
  const rotation = (value as { rotation?: unknown }).rotation;
  return asFiniteTriple(rotation);
}

function extractIncomingLimbDirection(
  bone: StudioHumanoidBoneName,
  value: unknown,
): DirectionTarget | null {
  if (!LIMB_DIRECTION_BONE_SET.has(bone)) return null;
  if (value == null || typeof value !== "object") return null;
  const direction = (value as { direction?: unknown }).direction;
  const tuple = asFiniteTriple(direction);
  if (tuple) return tuple;
  if (direction != null && typeof direction === "object" && !Array.isArray(direction)) {
    const candidate = direction as { sideX?: unknown; y?: unknown; z?: unknown };
    if (
      typeof candidate.sideX === "number" && Number.isFinite(candidate.sideX)
      && typeof candidate.y === "number" && Number.isFinite(candidate.y)
      && (candidate.z === undefined || (typeof candidate.z === "number" && Number.isFinite(candidate.z)))
    ) {
      return Object.freeze({
        sideX: candidate.sideX,
        y: candidate.y,
        ...(candidate.z !== undefined ? { z: candidate.z } : {}),
      });
    }
  }
  return null;
}

function available(
  bone: StudioHumanoidBoneName,
  isBoneAvailable: StudioVrmPoseApplyInput["isBoneAvailable"],
): boolean {
  try {
    return isBoneAvailable(bone);
  } catch {
    return false;
  }
}

function clampAxis(
  bone: StudioHumanoidBoneName,
  axisIndex: 0 | 1 | 2,
  radians: number,
  clampRotation: StudioVrmPoseApplyInput["clampRotation"],
): number | null {
  if (!clampRotation) return radians;
  try {
    const next = clampRotation(bone, axisIndex, radians);
    return Number.isFinite(next) ? next : null;
  } catch {
    return null;
  }
}

function blendRotation(
  bone: StudioHumanoidBoneName,
  current: Vec3 | undefined,
  incoming: Vec3,
  strength: number,
  clampRotation: StudioVrmPoseApplyInput["clampRotation"],
): Vec3 | null {
  const from = current ?? ZERO;
  const rotation: number[] = [];
  for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
    const a = from[axisIndex]!;
    const b = incoming[axisIndex]!;
    const lerped = a + (b - a) * strength;
    if (!Number.isFinite(lerped)) return null;
    const clamped = clampAxis(bone, axisIndex as 0 | 1 | 2, lerped, clampRotation);
    if (clamped == null) return null;
    rotation.push(clamped);
  }
  return Object.freeze([rotation[0]!, rotation[1]!, rotation[2]!]);
}

/**
 * Plans one lock-aware pose apply without mutating React state or the live VRM.
 * Unlocked bones present in the incoming maps are blended toward the target by `strength`
 * (0 = identity / current only, 1 = full replace). Locked, missing, and invalid bones are
 * reported and keep their current values.
 */
export function createStudioVrmPoseApplyPlan(
  input: StudioVrmPoseApplyInput,
): StudioVrmPoseApplyPlan {
  const bones: PoseBoneMap = { ...input.currentBones };
  const fingerEdits: FingerRotationMap = { ...input.currentFingerEdits };
  const locked = new Set(input.lockedBones ?? []);
  const strength = clamp01(input.strength ?? 1);
  const appliedBodyBones: StudioHumanoidBoneName[] = [];
  const appliedFingerBones: StudioHumanoidBoneName[] = [];
  const skippedLocked: StudioHumanoidBoneName[] = [];
  const skippedMissing: StudioHumanoidBoneName[] = [];
  const skippedInvalid: string[] = [];

  for (const [rawBone, rawValue] of Object.entries(input.incomingBones ?? {})) {
    if (!isStudioHumanoidBoneName(rawBone)) {
      skippedInvalid.push(rawBone);
      continue;
    }
    const isFinger = getStudioHumanoidBoneDescriptor(rawBone).region === "finger";
    if (isFinger) {
      // Body channel only — finger targets belong in incomingFingerEdits.
      skippedInvalid.push(rawBone);
      continue;
    }
    if (locked.has(rawBone)) {
      skippedLocked.push(rawBone);
      continue;
    }
    if (!available(rawBone, input.isBoneAvailable)) {
      skippedMissing.push(rawBone);
      continue;
    }
    const incoming = extractIncomingBodyRotation(rawValue);
    if (incoming) {
      const next = blendRotation(
        rawBone,
        input.currentBones[rawBone]?.rotation,
        incoming,
        strength,
        input.clampRotation,
      );
      if (!next) {
        skippedInvalid.push(rawBone);
        continue;
      }
      bones[rawBone] = { rotation: next };
      appliedBodyBones.push(rawBone);
      continue;
    }
    const incomingDirection = extractIncomingLimbDirection(rawBone, rawValue);
    if (incomingDirection) {
      if (strength > 0) {
        const nextSpec: PoseBone = { direction: incomingDirection };
        bones[rawBone] = nextSpec;
      }
      appliedBodyBones.push(rawBone);
      continue;
    }
    skippedInvalid.push(rawBone);
  }

  for (const [rawBone, rawValue] of Object.entries(input.incomingFingerEdits ?? {})) {
    if (!isStudioHumanoidBoneName(rawBone)) {
      skippedInvalid.push(rawBone);
      continue;
    }
    const isFinger = getStudioHumanoidBoneDescriptor(rawBone).region === "finger";
    if (!isFinger) {
      // Finger channel only — body targets belong in incomingBones.
      skippedInvalid.push(rawBone);
      continue;
    }
    if (locked.has(rawBone)) {
      skippedLocked.push(rawBone);
      continue;
    }
    if (!available(rawBone, input.isBoneAvailable)) {
      skippedMissing.push(rawBone);
      continue;
    }
    const incoming = asFiniteTriple(rawValue);
    if (!incoming) {
      skippedInvalid.push(rawBone);
      continue;
    }
    const next = blendRotation(
      rawBone,
      input.currentFingerEdits[rawBone],
      incoming,
      strength,
      input.clampRotation,
    );
    if (!next) {
      skippedInvalid.push(rawBone);
      continue;
    }
    fingerEdits[rawBone] = next;
    delete bones[rawBone];
    appliedFingerBones.push(rawBone);
  }

  return Object.freeze({
    bones,
    fingerEdits,
    appliedBodyBones: Object.freeze(appliedBodyBones),
    appliedFingerBones: Object.freeze(appliedFingerBones),
    skippedLocked: Object.freeze(skippedLocked),
    skippedMissing: Object.freeze(skippedMissing),
    skippedInvalid: Object.freeze(skippedInvalid),
  });
}
