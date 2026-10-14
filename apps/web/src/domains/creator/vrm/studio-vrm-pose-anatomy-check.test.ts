import { describe, expect, it } from "vitest";

import { ADVANCED_WEBTOON_POSES } from "../scene-3d/studio-3d-advanced-poses-library";
import {
  checkStudioVrmPoseAnatomy,
  checkStudioVrmPoseJointLimits,
  checkStudioVrmPoseSelfPenetration,
  segmentSegmentDistance,
  studioVrmPoseDegreesToCheckInput,
  studioVrmPoseJointListToCheckInput,
} from "./studio-vrm-pose-anatomy-check";

describe("포즈 프리셋 해부학 검수", () => {
  it("accepts the rest pose with no findings", () => {
    const result = checkStudioVrmPoseAnatomy({ id: "rest", jointRotations: {} });
    expect(result.ok).toBe(true);
    expect(result.limitFindings).toEqual([]);
    expect(result.penetrationFindings).toEqual([]);
  });

  it("flags rotations beyond the hard limit as hard violations", () => {
    const findings = checkStudioVrmPoseJointLimits(
      studioVrmPoseDegreesToCheckInput("bad-knee", { leftLowerLeg: [170, 0, 0] }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ bone: "leftLowerLeg", axis: "x", severity: "hard" });
  });

  it("flags rotations past the soft limit (but inside hard) as soft findings", () => {
    const findings = checkStudioVrmPoseJointLimits(
      studioVrmPoseDegreesToCheckInput("deep-kneel", { leftLowerLeg: [140, 0, 0] }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("soft");
    expect(findings[0]?.exceedsNeutralProfile).toBe(true);
  });

  it("detects an arm folded across the torso as self-penetration suspects", () => {
    const findings = checkStudioVrmPoseSelfPenetration(
      studioVrmPoseDegreesToCheckInput("cross-arm", {
        leftUpperArm: [0, -90, -90],
        leftLowerArm: [0, -120, 0],
      }),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((finding) => finding.boneB === "leftLowerArm")).toBe(true);
  });

  it("computes segment-segment distance for parallel and crossing segments", () => {
    expect(segmentSegmentDistance([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0])).toBeCloseTo(1, 9);
    expect(segmentSegmentDistance([0, 0, 0], [1, 0, 0], [0.5, -1, 0], [0.5, 1, 0])).toBeCloseTo(0, 9);
  });

  it("keeps every advanced webtoon pose free of hard violations and penetration suspects", () => {
    for (const pose of ADVANCED_WEBTOON_POSES) {
      const result = checkStudioVrmPoseAnatomy(
        studioVrmPoseJointListToCheckInput(pose.id, pose.jointRotations, pose.name),
      );
      const hard = result.limitFindings.filter((finding) => finding.severity === "hard");
      expect(hard, `${pose.id} hard violations`).toEqual([]);
      expect(result.penetrationFindings, `${pose.id} penetration suspects`).toEqual([]);
    }
  });

  it("documents the one intentional soft exceedance: deep kneel knee flexion", () => {
    const kneeling = ADVANCED_WEBTOON_POSES.find((pose) => pose.id === "dramatic-kneeling-despair");
    expect(kneeling).toBeDefined();
    const result = checkStudioVrmPoseAnatomy(
      studioVrmPoseJointListToCheckInput(kneeling!.id, kneeling!.jointRotations, kneeling!.name),
    );
    // 무릎 꿇기는 정강이가 허벅지에 닿는 깊은 굽힘이 본질이라 soft 초과 140°를 유지한다.
    // soft는 차단이 아닌 감쇠 구간이며 hard(155°) 안쪽이다.
    expect(result.limitFindings).toHaveLength(2);
    expect(result.limitFindings.every((finding) => finding.severity === "soft")).toBe(true);
    expect(result.limitFindings.map((finding) => finding.bone).sort()).toEqual([
      "leftLowerLeg",
      "rightLowerLeg",
    ]);
  });
});
