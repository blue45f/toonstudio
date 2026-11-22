import { describe, expect, it } from "vitest";

import {
  VRM_ANATOMICAL_GUARD_BONES,
  VRM_ANATOMICAL_HYPEREXTENSION_LIMITS,
  VRM_GARMENT_PUSHOUT_OFFSET_M,
  buildStandardVrmBodyCapsules,
  clampVrmAnatomicalJointRotation,
  clampVrmPoseAnatomicalJoints,
  detectAndGuardGarmentCapsuleClipping,
  guardVrmGarmentCapsuleOverlap,
  pointToCapsuleSurfaceDistance,
  type VrmBodyCapsule,
} from "./vrm-anatomy-garment-guard";

const DEG = Math.PI / 180;

describe("vrm-anatomy-garment-guard (#027/#029)", () => {
  describe("#027 anatomical joint hyperextension clamp", () => {
    it("prevents elbow hyperextension symmetrically for left (+Z) and right (-Z)", () => {
      const leftBackward = clampVrmAnatomicalJointRotation("leftLowerArm", [0, 0, 25 * DEG]);
      expect(leftBackward.clamped).toBe(true);
      expect(leftBackward.rotation[2]).toBe(0);
      expect(leftBackward.violations[0]?.kind).toBe("hyperextension");

      const leftNormalFlex = clampVrmAnatomicalJointRotation("leftLowerArm", [0, 0, -90 * DEG]);
      expect(leftNormalFlex.clamped).toBe(false);
      expect(leftNormalFlex.rotation[2]).toBeCloseTo(-90 * DEG, 6);

      const rightBackward = clampVrmAnatomicalJointRotation("rightLowerArm", [0, 0, -25 * DEG]);
      expect(rightBackward.clamped).toBe(true);
      expect(rightBackward.rotation[2]).toBe(0);
      expect(rightBackward.violations[0]?.kind).toBe("hyperextension");

      const rightNormalFlex = clampVrmAnatomicalJointRotation("rightLowerArm", [0, 0, 90 * DEG]);
      expect(rightNormalFlex.clamped).toBe(false);
      expect(rightNormalFlex.rotation[2]).toBeCloseTo(90 * DEG, 6);
    });

    it("prevents knee hyperextension (-X) while allowing natural knee flexion (+X)", () => {
      const leftKneeSnap = clampVrmAnatomicalJointRotation("leftLowerLeg", [-18 * DEG, 0, 0]);
      expect(leftKneeSnap.clamped).toBe(true);
      expect(leftKneeSnap.rotation[0]).toBe(0);
      expect(leftKneeSnap.violations[0]?.kind).toBe("hyperextension");

      const rightKneeSnap = clampVrmAnatomicalJointRotation("rightLowerLeg", [-12 * DEG, 0, 0]);
      expect(rightKneeSnap.clamped).toBe(true);
      expect(rightKneeSnap.rotation[0]).toBe(0);
      expect(rightKneeSnap.violations[0]?.kind).toBe("hyperextension");

      const bentKnee = clampVrmAnatomicalJointRotation("leftLowerLeg", [110 * DEG, 0, 0]);
      expect(bentKnee.clamped).toBe(false);
      expect(bentKnee.rotation[0]).toBeCloseTo(110 * DEG, 6);
    });

    it("clamps shoulder dislocation twists and enforces exact left/right mirroring", () => {
      const leftDislocated = clampVrmAnatomicalJointRotation("leftUpperArm", [150 * DEG, 125 * DEG, 130 * DEG]);
      expect(leftDislocated.clamped).toBe(true);
      expect(leftDislocated.rotation[0]).toBeCloseTo(120 * DEG, 6);
      expect(leftDislocated.rotation[1]).toBeCloseTo(95 * DEG, 6);
      expect(leftDislocated.rotation[2]).toBeCloseTo(95 * DEG, 6);
      expect(leftDislocated.violations.every((v) => v.kind === "hyperextension")).toBe(true);

      // 좌우 미러 규약 확인 (X 동일, Y/Z 부호 반전)
      expect(VRM_ANATOMICAL_GUARD_BONES).toHaveLength(8);
      expect(VRM_ANATOMICAL_HYPEREXTENSION_LIMITS.rightUpperArm.z.minRad).toBeCloseTo(
        -VRM_ANATOMICAL_HYPEREXTENSION_LIMITS.leftUpperArm.z.maxRad,
        12,
      );
      expect(VRM_ANATOMICAL_HYPEREXTENSION_LIMITS.rightShoulder.y.minRad).toBeCloseTo(
        -VRM_ANATOMICAL_HYPEREXTENSION_LIMITS.leftShoulder.y.maxRad,
        12,
      );
    });

    it("clamps a full pose map without mutating caller input and reports hyperextension count", () => {
      const input = {
        leftLowerArm: { rotation: [0, 0, 15 * DEG] as [number, number, number] },
        rightLowerLeg: { rotation: [-20 * DEG, 0, 0] as [number, number, number] },
        spine: { rotation: [10 * DEG, 0, 0] as [number, number, number] },
      };
      const result = clampVrmPoseAnatomicalJoints(input);
      expect(result.wasClamped).toBe(true);
      expect(result.hyperextensionCount).toBe(2);
      expect(result.bones.leftLowerArm?.rotation?.[2]).toBe(0);
      expect(result.bones.rightLowerLeg?.rotation?.[0]).toBe(0);
      expect(result.bones.spine?.rotation?.[0]).toBeCloseTo(10 * DEG, 6);
      // 원본 불변성 확인
      expect(input.leftLowerArm.rotation[2]).toBeCloseTo(15 * DEG, 6);
    });
  });

  describe("#029 garment-body capsule penetration guard & 2mm push-out", () => {
    it("exports exact 0.002 m (2mm) push-out offset and builds standard body capsules", () => {
      expect(VRM_GARMENT_PUSHOUT_OFFSET_M).toBe(0.002);
      const capsules = buildStandardVrmBodyCapsules();
      expect(capsules.length).toBeGreaterThanOrEqual(10);
      expect(capsules.some((c) => c.bone === "hips")).toBe(true);
      expect(capsules.some((c) => c.bone === "leftUpperArm")).toBe(true);
    });

    it("detects garment vertices penetrating a body capsule, warns, and pushes them to radius + 0.002m", () => {
      const torsoCapsule: VrmBodyCapsule = {
        id: "torso-test",
        bone: "chest",
        start: [0, 1.0, 0],
        end: [0, 1.4, 0],
        radius: 0.12,
      };
      // 정점 0: 캡슐 내부 20mm 관통 (x=0.10 < 0.12)
      // 정점 1: 캡슐 표면 바로 위 0.5mm (2mm 여유 미달: x=0.1205 < 0.122)
      // 정점 2: 안전한 바깥 정점 (x=0.15 > 0.122)
      const garmentVertices = new Float32Array([
        0.1, 1.2, 0,
        0.1205, 1.2, 0,
        0.15, 1.2, 0,
      ]);

      const result = detectAndGuardGarmentCapsuleClipping(garmentVertices, [torsoCapsule], {
        garmentId: "school-jacket",
      });

      expect(result.hasClipping).toBe(true);
      expect(result.penetratedVertexCount).toBe(1);
      expect(result.pushedVertexCount).toBe(2);
      expect(result.remainingPenetrationCount).toBe(0);
      expect(result.maxPenetrationDepthM).toBeCloseTo(0.02, 5);
      expect(result.appliedPushOutOffsetM).toBe(0.002);

      // 정점 0과 1이 정확히 radius + 0.002m = 0.122m로 밀려났는지 검증
      expect(result.positions[0]).toBeCloseTo(0.122, 6);
      expect(result.positions[3]).toBeCloseTo(0.122, 6);
      // 안전한 정점 2는 이동하지 않음
      expect(result.positions[6]).toBeCloseTo(0.15, 6);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.garmentId).toBe("school-jacket");
      expect(result.warnings[0]?.severity).toBe("critical");
      expect(result.warnings[0]?.message).toContain("Push-Out");

      // 밀어내기 이후 재검사 시 모든 정점이 캡슐 바깥 >= 2mm 유지
      for (let i = 0; i < 3; i += 1) {
        const q = pointToCapsuleSurfaceDistance(
          [result.positions[i * 3]!, result.positions[i * 3 + 1]!, result.positions[i * 3 + 2]!],
          torsoCapsule,
        );
        expect(q.signedDistanceToSurface).toBeGreaterThanOrEqual(0.002 - 1e-5);
      }
    });

    it("handles degenerate vertex lying directly on capsule centerline via fallback normal", () => {
      const armCapsule: VrmBodyCapsule = {
        id: "left-upper-arm",
        bone: "leftUpperArm",
        start: [0.2, 1.4, 0],
        end: [0.5, 1.4, 0],
        radius: 0.05,
      };
      const centerVertex = new Float32Array([0.35, 1.4, 0]);
      const normals = new Float32Array([0, 1, 0]);
      const result = detectAndGuardGarmentCapsuleClipping(centerVertex, [armCapsule], {
        garmentNormals: normals,
      });

      expect(result.penetratedVertexCount).toBe(1);
      expect(result.remainingPenetrationCount).toBe(0);
      expect(result.positions[1]).toBeCloseTo(1.4 + 0.052, 6);
    });

    it("guards garment-capsule vs body-capsule bounding overlap with exact 2mm push-out vector", () => {
      const body: VrmBodyCapsule = {
        id: "right-thigh",
        bone: "rightUpperLeg",
        start: [-0.1, 0.9, 0],
        end: [-0.1, 0.5, 0],
        radius: 0.07,
      };
      const overlappingSkirt: VrmBodyCapsule = {
        id: "skirt-right",
        bone: "rightUpperLeg",
        start: [-0.1, 0.85, 0.09],
        end: [-0.1, 0.55, 0.09],
        radius: 0.03, // 합 반경 0.10m > 중심 거리 0.09m → 10mm 관통!
      };

      const guard = guardVrmGarmentCapsuleOverlap(overlappingSkirt, [body], {
        garmentId: "pleated-skirt",
      });
      expect(guard.hasClipping).toBe(true);
      expect(guard.penetrationDepthM).toBeCloseTo(0.01, 5);
      // 10mm 관통 + 2mm Push-Out 오프셋 = +0.012m along +Z
      expect(guard.pushOutVector[2]).toBeCloseTo(0.012, 5);
      expect(guard.warning?.garmentId).toBe("pleated-skirt");
      expect(guard.warning?.severity).toBe("critical");
    });
  });
});
