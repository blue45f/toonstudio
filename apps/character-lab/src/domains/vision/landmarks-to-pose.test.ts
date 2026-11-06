import { describe, expect, it } from "vitest";

import { IDENTITY_QUAT, POSE_LANDMARK_NAMES, bonesInScope } from "../../contracts";
import { degToRad, qRotateVec3, qRotationAngle, radToDeg } from "../../shared/math";

import { armsDownBody, leftArmForwardBody, tPoseBody, toImageLandmarks, toWorldLandmarks } from "./landmark-fixtures";
import {
  SHAPER_AI_POSE_MIN_VALID_JOINTS,
  SHAPER_AI_POSE_UNCERTAINTY_MAX,
  applyShaperQuadrantAxisFix,
  controllableBones,
  evaluateShaperAiPoseConfidence,
  landmarksToPose,
  quatFromBasis,
  retargetShaperHandPosePreservingWrist,
} from "./landmarks-to-pose";

import type { HumanoidBoneName, PoseLandmark } from "../../contracts";

function angleDeg(result: ReturnType<typeof landmarksToPose>, bone: HumanoidBoneName): number {
  const quat = result.pose[bone];
  if (!quat) throw new Error(`${bone} 없음`);
  return radToDeg(qRotationAngle(quat));
}

describe("vision/landmarks-to-pose", () => {
  it("T-pose 픽스처는 모든 제어 본에 항등(≤0.5°) 회전을 낸다", () => {
    const result = landmarksToPose(toWorldLandmarks(tPoseBody()), { scope: "full", space: "world" });
    expect(result.skippedBones).toEqual([]);
    expect(result.appliedBones).toEqual(controllableBones("full"));
    for (const bone of result.appliedBones) expect(angleDeg(result, bone)).toBeLessThan(0.5);
    expect(result.clampedBones).toEqual([]);
  });

  it("팔을 내린 픽스처는 상완 90°(80~100°), 하완은 상완 기준 항등을 낸다", () => {
    const result = landmarksToPose(toWorldLandmarks(armsDownBody()), { scope: "arms-hands", space: "world" });
    const upper = angleDeg(result, "leftUpperArm");
    expect(upper).toBeGreaterThanOrEqual(80);
    expect(upper).toBeLessThanOrEqual(100);
    expect(angleDeg(result, "rightUpperArm")).toBeGreaterThanOrEqual(80);
    expect(angleDeg(result, "leftLowerArm")).toBeLessThan(1);
    // 상완 로컬 회전이 rest(+X)를 -Y로 보낸다
    const quat = result.pose.leftUpperArm ?? IDENTITY_QUAT;
    const direction = qRotateVec3(quat, [1, 0, 0]);
    expect(direction[1]).toBeCloseTo(-1, 3);
    expect(result.pose.leftUpperLeg).toBeUndefined();
    expect(result.pose.hips).toBeUndefined();
  });

  it("왼팔만 앞으로 뻗으면 왼쪽 상완만 바뀌고 오른팔은 항등이다(이미지 좌표·비율 보정)", () => {
    const result = landmarksToPose(toImageLandmarks(leftArmForwardBody(), 1.33), { scope: "upper", space: "image", aspectRatio: 1.33 });
    const direction = qRotateVec3(result.pose.leftUpperArm ?? IDENTITY_QUAT, [1, 0, 0]);
    expect(direction[2]).toBeCloseTo(1, 2);
    expect(angleDeg(result, "rightUpperArm")).toBeLessThan(0.5);
    expect(result.pose.leftUpperLeg).toBeUndefined();
  });

  it("거울 모드는 왼팔 동작을 오른팔로 옮긴다", () => {
    const result = landmarksToPose(toWorldLandmarks(leftArmForwardBody()), { scope: "arms-hands", space: "world", mirror: true });
    const right = qRotateVec3(result.pose.rightUpperArm ?? IDENTITY_QUAT, [-1, 0, 0]);
    expect(right[2]).toBeCloseTo(1, 2);
    expect(angleDeg(result, "leftUpperArm")).toBeLessThan(0.5);
    expect(result.mirrored).toBe(true);
  });

  it("가시성 미달 랜드마크가 끼는 본은 건너뛰고 사유를 남긴다", () => {
    const landmarks = toWorldLandmarks(tPoseBody(), { visibilityOverrides: { left_elbow: 0.2 } });
    const result = landmarksToPose(landmarks, { scope: "full", space: "world" });
    const skipped = result.skippedBones.map((entry) => entry.bone);
    expect(skipped).toEqual(["leftUpperArm", "leftLowerArm"]);
    expect(result.skippedBones[0]?.reasonKo).toMatch(/left_elbow/u);
    expect(result.pose.leftUpperArm).toBeUndefined();
    expect(result.pose.leftHand).toBeDefined();
    const lenient = landmarksToPose(landmarks, { scope: "full", space: "world", visibilityMin: 0.1 });
    expect(lenient.skippedBones).toEqual([]);
  });

  it("스코프 밖 본은 결과에 없고 제어 본 목록은 스코프 부분집합이다", () => {
    const result = landmarksToPose(toWorldLandmarks(armsDownBody()), { scope: "upper", space: "world" });
    const allowed = new Set<string>(bonesInScope("upper"));
    for (const bone of Object.keys(result.pose)) expect(allowed.has(bone)).toBe(true);
    expect(result.pose.leftUpperLeg).toBeUndefined();
    expect(controllableBones("arms-hands")).toEqual(["leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand"]);
    expect(controllableBones("full")).toContain("hips");
    expect(controllableBones("full")).toHaveLength(14);
    expect(controllableBones("upper")).not.toContain("hips");
    expect(controllableBones("upper")).toContain("spine");
    expect(controllableBones("upper")).toContain("chest");
  });

  it("upper 스코프에서도 상체 기울기(torso lean)를 spine·chest에 분배하여 자연스러운 상체 기울기와 어깨·목 기준 프레임을 유지한다", () => {
    const body = tPoseBody();
    const leanRad = degToRad(24);
    const pivotY = 0.95;
    const tiltForward = (p: readonly [number, number, number]): [number, number, number] => {
      const dy = p[1] - pivotY;
      const dz = p[2];
      return [p[0], pivotY + dy * Math.cos(leanRad) - dz * Math.sin(leanRad), dy * Math.sin(leanRad) + dz * Math.cos(leanRad)];
    };
    const leaning = {
      ...body,
      left_shoulder: tiltForward(body.left_shoulder),
      right_shoulder: tiltForward(body.right_shoulder),
      left_elbow: tiltForward(body.left_elbow),
      right_elbow: tiltForward(body.right_elbow),
      left_wrist: tiltForward(body.left_wrist),
      right_wrist: tiltForward(body.right_wrist),
      nose: tiltForward(body.nose),
      left_ear: tiltForward(body.left_ear),
      right_ear: tiltForward(body.right_ear),
    };

    const fullResult = landmarksToPose(toWorldLandmarks(leaning), { scope: "full", space: "world" });
    expect(angleDeg(fullResult, "hips")).toBeCloseTo(24, 1);

    const upperResult = landmarksToPose(toWorldLandmarks(leaning), { scope: "upper", space: "world" });
    expect(upperResult.pose.hips).toBeUndefined();
    expect(angleDeg(upperResult, "spine")).toBeGreaterThan(10);
    expect(angleDeg(upperResult, "chest")).toBeGreaterThan(10);
    // 상체와 함께 기울어진 T-pose 팔은 chest 프레임 기준 로컬 회전이 거의 0°여야 한다
    expect(angleDeg(upperResult, "leftUpperArm")).toBeLessThan(1);
    expect(angleDeg(upperResult, "rightUpperArm")).toBeLessThan(1);
  });

  it("머리를 왼쪽으로 돌린 픽스처는 head에 Y축 회전(요)을 낸다", () => {
    const body = tPoseBody();
    const yaw = degToRad(40);
    const rotate = (p: readonly [number, number, number], center: readonly [number, number, number]): [number, number, number] => {
      const dx = p[0] - center[0];
      const dz = p[2] - center[2];
      return [center[0] + dx * Math.cos(yaw) + dz * Math.sin(yaw), p[1], center[2] - dx * Math.sin(yaw) + dz * Math.cos(yaw)];
    };
    const center: readonly [number, number, number] = [0, 1.63, 0];
    const turned = { ...body, nose: rotate(body.nose, center), left_ear: rotate(body.left_ear, center), right_ear: rotate(body.right_ear, center) };
    const result = landmarksToPose(toWorldLandmarks(turned), { scope: "upper", space: "world" });
    const forward = qRotateVec3(result.pose.head ?? IDENTITY_QUAT, [0, 0, 1]);
    expect(Math.abs(forward[0])).toBeGreaterThan(0.5);
    expect(angleDeg(result, "head")).toBeGreaterThan(30);
    expect(angleDeg(result, "head")).toBeLessThanOrEqual(70.5);
  });

  describe("큰 요(yaw)에서 이중 덮개(w<0)가 클램프 방향을 뒤집지 않는다", () => {
    type Point = readonly [number, number, number];
    const yawPoint = (p: Point, yawRad: number): Point => [p[0] * Math.cos(yawRad) + p[2] * Math.sin(yawRad), p[1], -p[0] * Math.sin(yawRad) + p[2] * Math.cos(yawRad)];

    it("몸통 전체를 Y축으로 -130°·-150°·+130°·+150° 돌리면 hips가 그 회전 그대로 나오고 클램프되지 않는다", () => {
      for (const yawDeg of [-130, -150, 130, 150, -90, 90]) {
        const yaw = degToRad(yawDeg);
        const body = tPoseBody();
        const turned = Object.fromEntries(POSE_LANDMARK_NAMES.map((name) => [name, yawPoint(body[name], yaw)])) as typeof body;
        const result = landmarksToPose(toWorldLandmarks(turned), { scope: "full", space: "world" });
        const hips = result.pose.hips;
        if (!hips) throw new Error("hips 없음");
        // hips 한계는 180/180이라 어떤 요에서도 잘리면 안 된다
        expect(result.clampedBones).not.toContain("hips");
        expect(angleDeg(result, "hips")).toBeCloseTo(Math.abs(yawDeg), 3);
        // 정면(+Z)이 요 방향으로 돈다: (sin yaw, 0, cos yaw)
        const forward = qRotateVec3(hips, [0, 0, 1]);
        expect(forward[0]).toBeCloseTo(Math.sin(yaw), 3);
        expect(forward[1]).toBeCloseTo(0, 3);
        expect(forward[2]).toBeCloseTo(Math.cos(yaw), 3);
      }
    });

    it("머리 트위스트가 한계(70°)를 넘으면 돌린 방향 쪽 한계로 잘린다(반대 방향이 아니다)", () => {
      for (const yawDeg of [-130, -150, 150, 130]) {
        const yaw = degToRad(yawDeg);
        const body = tPoseBody();
        const center: Point = [0, 1.63, 0];
        const around = (p: Point): Point => {
          const turned = yawPoint([p[0] - center[0], p[1] - center[1], p[2] - center[2]], yaw);
          return [turned[0] + center[0], turned[1] + center[1], turned[2] + center[2]];
        };
        const turned = { ...body, nose: around(body.nose), left_ear: around(body.left_ear), right_ear: around(body.right_ear) };
        const result = landmarksToPose(toWorldLandmarks(turned), { scope: "upper", space: "world" });
        const head = result.pose.head;
        if (!head) throw new Error("head 없음");
        expect(result.clampedBones).toContain("head");
        const forward = qRotateVec3(head, [0, 0, 1]);
        // 돌린 방향의 부호와 같은 쪽(x 부호)으로 70° 부근까지만 돌아야 한다
        expect(Math.sign(forward[0])).toBe(Math.sign(Math.sin(yaw)));
        expect(Math.abs(forward[0])).toBeGreaterThan(Math.sin(degToRad(60)));
      }
    });
  });

  it("관절 한계를 넘는 방향은 클램프되고 clampedBones에 기록된다", () => {
    const body = armsDownBody();
    // 팔꿈치를 어깨 위쪽 뒤로 꺾은 비정상 자세: 하완이 상완에 대해 150° 이상
    const bent = { ...body, left_wrist: [0.18, 1.4, -0.05] as const, left_index: [0.18, 1.47, -0.06] as const, left_pinky: [0.18, 1.47, -0.08] as const, left_thumb: [0.2, 1.45, -0.04] as const };
    const result = landmarksToPose(toWorldLandmarks(bent), { scope: "arms-hands", space: "world" });
    expect(result.clampedBones).toContain("leftLowerArm");
    expect(angleDeg(result, "leftLowerArm")).toBeLessThanOrEqual(150.01);
    const unclamped = landmarksToPose(toWorldLandmarks(bent), { scope: "arms-hands", space: "world", clampToJointLimits: false });
    expect(unclamped.clampedBones).toEqual([]);
    expect(angleDeg(unclamped, "leftLowerArm")).toBeGreaterThan(150);
  });

  it("기저 → 쿼터니언은 항등·축 회전을 복원한다", () => {
    expect(quatFromBasis([1, 0, 0], [0, 1, 0], [0, 0, 1])).toEqual([0, 0, 0, 1]);
    const q = quatFromBasis([0, 0, -1], [0, 1, 0], [1, 0, 0]);
    const rotated = qRotateVec3(q, [1, 0, 0]);
    expect(rotated[2]).toBeCloseTo(-1, 9);
    expect(() => landmarksToPose([] as PoseLandmark[], { scope: "full" })).toThrow(/33개/u);
    expect(POSE_LANDMARK_NAMES.length).toBe(33);
  });

  describe("SHAPER AI 3D 포즈 불확실도 필터(< 0.03, >= 16관절) 및 손목 보존 리타기팅", () => {
    it("uncertainty < 0.03인 관절이 16개 이상일 때만 포즈 적용을 승인한다", () => {
      expect(SHAPER_AI_POSE_UNCERTAINTY_MAX).toBe(0.03);
      expect(SHAPER_AI_POSE_MIN_VALID_JOINTS).toBe(16);

      const goodMap: Record<string, number> = {};
      for (let i = 0; i < 16; i += 1) goodMap[`joint_${i}`] = 0.015;
      goodMap.noisy_joint = 0.045;

      const accepted = evaluateShaperAiPoseConfidence(goodMap);
      expect(accepted.accepted).toBe(true);
      expect(accepted.validJointNames).toHaveLength(16);
      expect(accepted.rejectedJointNames).toEqual(["noisy_joint"]);

      const rejected = evaluateShaperAiPoseConfidence({ a: 0.01, b: 0.02 });
      expect(rejected.accepted).toBe(false);
    });

    it("사분면 90° 축 보정(applyShaperQuadrantAxisFix) 및 손 포즈 손목 보존(retargetShaperHandPosePreservingWrist)을 수행한다", () => {
      expect(applyShaperQuadrantAxisFix([10, 20, 30], "upperArmL")).toEqual([10, 20, -60]);
      expect(applyShaperQuadrantAxisFix([10, 20, 30], "upperArmR")).toEqual([10, 20, 120]);
      expect(applyShaperQuadrantAxisFix([0, 0, 0], "upperLegL")).toEqual([90, 0, 180]);

      const wristQuat = [0, 0.5, 0, 0.8660254] as const;
      const fingerQuat = [0.2, 0, 0, 0.9797959] as const;
      const merged = retargetShaperHandPosePreservingWrist({
        currentPose: { leftHand: wristQuat },
        incomingHandPose: {
          leftHand: [1, 0, 0, 0],
          leftIndexProximal: fingerQuat,
        },
        handSide: "left",
      });
      expect(merged.leftHand).toEqual(wristQuat);
      expect(merged.leftIndexProximal).toEqual(fingerQuat);
    });
  });
});
