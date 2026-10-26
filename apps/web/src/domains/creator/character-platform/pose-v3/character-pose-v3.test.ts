import { describe, expect, it } from "vitest";

import { migrateCharacterPoseV2ToV3 } from "./character-pose-migrate";
import { solveCharacterGroundBalance } from "./character-ground-balance-solver";
import { limitCharacterSwingTwist } from "./character-swing-twist";
import { solveCharacterTwoBoneIk } from "./character-two-bone-ik";
import {
  buildCharacterSupportPolygon,
  characterCenterOfMass,
  characterSupportMargin,
} from "./character-support-polygon";
import {
  computeShaperBoneWeightHighlightColor,
  computeShaperGroundedBodyHeightCm,
  computeShaperMultiBonePivot,
  computeShaperMuscleFatBlendShapeAttenuation,
  cycleShaperBoneAiFixVector,
  evaluateShaperBoneAiConfidenceGate,
  mirrorShaperPoseEffectorOffset,
  SHAPER_BONE_AI_24_KEYPOINTS,
  solveShaperOrientationConstraintHalfSlerp,
} from "./character-pose-v3";

import type { CharacterPoseCandidateV2 } from "../pose/character-pose-v2";

const candidate: CharacterPoseCandidateV2 = {
  candidateId: "pose:photo-1",
  generationId: 1,
  source: "photo",
  root: { position: [0, 1, 0], rotation: [0, 0, 0, 1] },
  bones: { leftUpperArm: [0, 0, 0, 1] },
  confidence: { overall: 0.9, regions: {}, joints: { leftUpperArm: 0.9 } },
  contacts: [{
    id: "left-foot-ground",
    kind: "ground",
    bone: "leftFoot",
    target: [0, 0, 0],
    weight: 1,
    tolerance: 0.003,
  }],
  warnings: [],
};

describe("character pose v3 foundation", () => {
  it("migrates V2 without losing the original candidate or contacts", () => {
    const migrated = migrateCharacterPoseV2ToV3(candidate);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.legacySource).toBe(candidate);
    expect(migrated.contacts[0]).toMatchObject({ mode: "support", bone: "leftFoot" });
  });

  it("clamps twist and elliptical swing independently", () => {
    const result = limitCharacterSwingTwist(
      [0.6, 0.6, 0.6, 0.2],
      {
        twistAxis: [0, 1, 0],
        maximumPrimarySwingRadians: 0.4,
        maximumSecondarySwingRadians: 0.2,
        minimumTwistRadians: -0.25,
        maximumTwistRadians: 0.25,
      },
    );
    expect(result.twistRadians).toBeLessThanOrEqual(0.25);
    expect(Math.hypot(result.primarySwingRadians / 0.4, result.secondarySwingRadians / 0.2)).toBeLessThanOrEqual(1.000001);
    expect(result.swingClamped || result.twistClamped).toBe(true);
  });

  it("solves a two-bone limb toward a reachable target while preserving lengths", () => {
    const result = solveCharacterTwoBoneIk({
      start: [0, 0, 0],
      joint: [1, 0, 0],
      end: [2, 0, 0],
      target: [1.2, 1.2, 0],
      pole: [0, 0, 1],
      stretch: 1,
    });
    expect(result.reachable).toBe(true);
    expect(result.error).toBeLessThan(1e-5);
    expect(Math.hypot(...result.joint)).toBeCloseTo(1, 5);
    expect(Math.hypot(
      result.end[0] - result.joint[0],
      result.end[1] - result.joint[1],
      result.end[2] - result.joint[2],
    )).toBeCloseTo(1, 5);
  });

  it("computes support margin and applies bounded ground/balance correction", () => {
    const polygon = buildCharacterSupportPolygon([[-0.2, -0.1], [0.2, -0.1], [0.2, 0.1], [-0.2, 0.1]]);
    expect(characterSupportMargin([0, 0], polygon)).toBeGreaterThan(0);
    expect(characterCenterOfMass([
      { id: "torso", position: [0.5, 1, 0], mass: 2 },
      { id: "legs", position: [0, 0.5, 0], mass: 2 },
    ])).toEqual([0.25, 0.75, 0]);

    const solved = solveCharacterGroundBalance({
      rootPosition: [0, 0.1, 0],
      groundY: 0,
      contacts: [{ id: "heel", position: [0, 0.02, 0], weight: 1 }],
      supportPoints: polygon,
      massSegments: [{ id: "body", position: [0.5, 1, 0], mass: 1 }],
      dramaticImbalance: false,
      targetMargin: 0.02,
      maximumHorizontalCorrection: 0.4,
    });
    expect(solved.verticalCorrection).toBeCloseTo(-0.02);
    expect(solved.horizontalCorrection[0]).toBeLessThan(0);
    expect(solved.marginAfter).toBeGreaterThan(solved.marginBefore);
  });

  it("evaluates BoneAIManager 24-bone uncertainty < 0.03 confidence gate, cycles FixVector (0->1->2->0), and solves 50% Slerp orientation constraint", () => {
    const uncertainties: Record<string, number> = {};
    for (let i = 0; i < SHAPER_BONE_AI_24_KEYPOINTS.length; i += 1) {
      const joint = SHAPER_BONE_AI_24_KEYPOINTS[i]!;
      uncertainties[joint] = i < 18 ? 0.015 : 0.05;
    }
    const gatePass = evaluateShaperBoneAiConfidenceGate(uncertainties);
    expect(gatePass.accepted).toBe(true);
    expect(gatePass.validJointCount).toBe(18);
    expect(gatePass.rejectedJoints).toHaveLength(6);

    const step1 = cycleShaperBoneAiFixVector(0);
    const step2 = cycleShaperBoneAiFixVector(step1.nextMode);
    const step3 = cycleShaperBoneAiFixVector(step2.nextMode);
    expect(step1).toEqual({ nextMode: 1, rollOffsetDeg: 90, label: "+90° 롤 보정 축 (Mode 1)" });
    expect(step2.rollOffsetDeg).toBe(180);
    expect(step3.nextMode).toBe(0);

    // 90 deg rotation around Z: [0, 0, sin(45°), cos(45°)] => half slerp is 45 deg: [0, 0, sin(22.5°), cos(22.5°)]
    const half = solveShaperOrientationConstraintHalfSlerp([0, 0, Math.SQRT1_2, Math.SQRT1_2]);
    expect(half[2]).toBeCloseTo(Math.sin(Math.PI / 8), 5);
    expect(half[3]).toBeCloseTo(Math.cos(Math.PI / 8), 5);
  });

  it("computes SHAPER grounded body height in cm, 100/90 blendshape attenuation, Alt-click effector mirroring, multi-bone pivot, and 4*w1^2 heatmap", () => {
    const height = computeShaperGroundedBodyHeightCm({
      headTopY: 1.75,
      leftAnkleY: 0.03,
      rightAnkleY: -0.02,
      soleOffsetMeters: 0.03,
    });
    expect(height.minAnkleY).toBe(-0.02);
    expect(height.groundingOffsetY).toBe(0.05);
    expect(height.heightCm).toBe(180);
    expect(height.formattedBadge).toBe("신장 : 180 cm");

    const att = computeShaperMuscleFatBlendShapeAttenuation(0.8, 0.5);
    expect(att).toEqual({
      bodyMuscleWeight: 80,
      bodyFatWeight: 50,
      costumeMuscleWeight: 72,
      costumeFatWeight: 45,
      shoeMuscleWeight: 0,
      shoeFatWeight: 0,
    });

    const mirrored = mirrorShaperPoseEffectorOffset("leftHand", [0.15, 0.05, -0.1], {
      leftHand: "rightHand",
      rightHand: "leftHand",
    });
    expect(mirrored).toEqual({
      mirroredBone: "rightHand",
      mirroredOffset: [-0.15, 0.05, -0.1],
      ikYawOffsetDeg: 180,
    });

    const ikPivot = computeShaperMultiBonePivot([
      { boneId: "leftHand", position: [-0.4, 1.0, 0], parentDepth: 4 },
      { boneId: "rightHand", position: [0.4, 1.2, 0.2], parentDepth: 4 },
    ], "ik");
    expect(ikPivot.pivotPosition).toEqual([0, 1.1, 0.1]);
    expect(ikPivot.activeGizmos).toEqual(["move", "rotate"]);

    const fkPivot = computeShaperMultiBonePivot([
      { boneId: "leftLowerArm", position: [-0.3, 1.1, 0], parentDepth: 3 },
      { boneId: "leftUpperArm", position: [-0.2, 1.4, 0], parentDepth: 2 },
    ], "fk");
    expect(fkPivot.anchorBoneId).toBe("leftUpperArm");
    expect(fkPivot.activeGizmos).toEqual(["rotate"]);

    const heatmap = computeShaperBoneWeightHighlightColor({
      slot: 1,
      secondaryWeight1: 0.35,
      state: "selected",
    });
    expect(heatmap.amplifiedWeight).toBeCloseTo(0.49, 5);
    expect(heatmap.rgb).toEqual([1, 0.51, 0.51]);
  });
});
