import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { checkStudioVrmPoseJointLimits } from "./studio-vrm-pose-anatomy-check";
import { clampVrmPoseAnatomicalJoints } from "./vrm-anatomy-garment-guard";
import {
  VRM_ACTION_SILHOUETTE_PRESETS,
  applyVrmActionSilhouettePreset,
  applyVrmLookAtPinToPose,
  applyVrmLookAtPinToVrm,
  findVrmActionSilhouettePreset,
  listVrmActionSilhouettePresets,
  solveVrmLookAtPin,
  type VrmActionSilhouetteId,
} from "./vrm-action-silhouette-presets";

import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

const EXPECTED_12_IDS: readonly VrmActionSilhouetteId[] = [
  "action-punch",
  "action-run",
  "action-sit",
  "action-look-back",
  "action-jump",
  "action-guard",
  "action-surprise",
  "action-crouch",
  "action-point",
  "action-lean",
  "action-fall",
  "action-greet",
];

const EXPECTED_12_LABELS = [
  "주먹",
  "달리기",
  "앉기",
  "뒤돌아보기",
  "점프",
  "방어",
  "놀람",
  "웅크림",
  "삿대질",
  "기대기",
  "낙하",
  "인사",
];

function createMinimalLookAtVrm(metaVersion: "0" | "1" = "1", sceneRotationY = 0) {
  const scene = new THREE.Group();
  scene.rotation.y = sceneRotationY;
  const bones: Partial<Record<VRMHumanBoneName, THREE.Object3D>> = {};
  const add = (name: VRMHumanBoneName, parent: THREE.Object3D, pos: [number, number, number]) => {
    const node = new THREE.Object3D();
    node.name = name;
    node.position.set(...pos);
    parent.add(node);
    bones[name] = node;
    return node;
  };
  const hips = add("hips", scene, [0, 0.95, 0]);
  const spine = add("spine", hips, [0, 0.14, 0]);
  const chest = add("chest", spine, [0, 0.18, 0]);
  const neck = add("neck", chest, [0, 0.22, 0]);
  const head = add("head", neck, [0, 0.1, 0]);
  add("leftEye", head, [0.03, 0.04, 0.06]);
  add("rightEye", head, [-0.03, 0.04, 0.06]);
  const ls = add("leftShoulder", chest, [0.07, 0.1, 0]);
  const lua = add("leftUpperArm", ls, [0.12, 0, 0]);
  const lla = add("leftLowerArm", lua, [0.27, 0, 0]);
  add("leftHand", lla, [0.25, 0, 0]);
  const rs = add("rightShoulder", chest, [-0.07, 0.1, 0]);
  const rua = add("rightUpperArm", rs, [-0.12, 0, 0]);
  const rla = add("rightLowerArm", rua, [-0.27, 0, 0]);
  add("rightHand", rla, [-0.25, 0, 0]);
  const lul = add("leftUpperLeg", hips, [0.09, -0.05, 0]);
  const lll = add("leftLowerLeg", lul, [0, -0.42, 0]);
  add("leftFoot", lll, [0, -0.42, 0]);
  const rul = add("rightUpperLeg", hips, [-0.09, -0.05, 0]);
  const rll = add("rightLowerLeg", rul, [0, -0.42, 0]);
  add("rightFoot", rll, [0, -0.42, 0]);

  const lookAt = { yaw: 0, pitch: 0, faceFront: new THREE.Vector3(0, 0, metaVersion === "0" ? -1 : 1) };
  const vrm = {
    meta: { metaVersion },
    scene,
    lookAt,
    humanoid: {
      resetNormalizedPose: () => {
        Object.values(bones).forEach((b) => {
          b.rotation.set(0, 0, 0);
          b.quaternion.identity();
        });
        scene.position.set(0, 0, 0);
        scene.updateMatrixWorld(true);
      },
      getNormalizedBoneNode: (name: VRMHumanBoneName) => bones[name] ?? null,
      update: () => scene.updateMatrixWorld(true),
    },
    update: () => scene.updateMatrixWorld(true),
  } as unknown as VRM;

  scene.updateMatrixWorld(true);
  return { vrm, bones, lookAt };
}

describe("vrm-action-silhouette-presets (#026)", () => {
  it("provides all 12 requested webtoon action silhouette presets with zero anatomical or hard-limit violations", () => {
    expect(VRM_ACTION_SILHOUETTE_PRESETS).toHaveLength(12);
    expect(listVrmActionSilhouettePresets().map((p) => p.id)).toEqual(EXPECTED_12_IDS);
    expect(listVrmActionSilhouettePresets().map((p) => p.label)).toEqual(EXPECTED_12_LABELS);

    for (const preset of VRM_ACTION_SILHOUETTE_PRESETS) {
      expect(findVrmActionSilhouettePreset(preset.id)).toBe(preset);
      const jointRotations: Record<string, readonly number[]> = {};
      for (const [bone, spec] of Object.entries(preset.bones)) {
        if (spec?.rotation) jointRotations[bone] = spec.rotation;
      }
      const hardViolations = checkStudioVrmPoseJointLimits({
        id: preset.id,
        label: preset.label,
        jointRotations,
      }).filter((finding) => finding.severity === "hard");
      expect(hardViolations, `${preset.id} hard joint limit violations`).toEqual([]);

      const anatomicalCheck = clampVrmPoseAnatomicalJoints(preset.bones);
      expect(anatomicalCheck.hyperextensionCount, `${preset.id} hyperextension`).toBe(0);
    }
  });

  it("solves a single LookAt pin target into coordinated neck, head, and eye rotations", () => {
    // 캐릭터 좌상단(+X, +Y, +Z) 목표 → yaw > 0, pitch < 0 (Three.js -X가 위쪽 시선)
    const solution = solveVrmLookAtPin({
      pin: { enabled: true, targetWorld: [1.0, 2.1, 1.8], weight: 1 },
      headWorldPosition: [0, 1.5, 0],
    });

    expect(solution.enabled).toBe(true);
    expect(solution.behindCharacter).toBe(false);
    expect(solution.yawRad).toBeGreaterThan(0.3);
    expect(solution.pitchRad).toBeLessThan(-0.2);

    // 목·머리·양안 모두 같은 부호 방향으로 분배되어야 한다
    expect(solution.neckRotation[1]).toBeGreaterThan(0);
    expect(solution.headRotation[1]).toBeGreaterThan(solution.neckRotation[1]);
    expect(solution.leftEyeRotation[1]).toBeGreaterThan(0);
    expect(solution.rightEyeRotation[1]).toBeCloseTo(solution.leftEyeRotation[1], 6);

    expect(solution.neckRotation[0]).toBeLessThan(0);
    expect(solution.headRotation[0]).toBeLessThan(0);
    expect(solution.leftEyeRotation[0]).toBeLessThan(0);

    // 총합이 요청 각도와 거의 일치해야 한다
    const expectedYaw = Math.atan2(1.0, 1.8);
    expect(solution.yawRad).toBeCloseTo(expectedYaw, 2);
  });

  it("clamps extreme behind-character LookAt targets safely within neck/head/eye limits", () => {
    const behind = solveVrmLookAtPin({
      pin: { enabled: true, targetWorld: [0.3, 1.5, -2.0], weight: 1 },
      headWorldPosition: [0, 1.5, 0],
    });
    expect(behind.behindCharacter).toBe(true);
    expect(behind.clamped).toBe(true);
    expect(Math.abs(behind.leftEyeRotation[1])).toBeLessThanOrEqual(35 * Math.PI / 180 + 1e-6);
    expect(Math.abs(behind.headRotation[1])).toBeLessThanOrEqual(70 * Math.PI / 180 + 1e-6);
    expect(Math.abs(behind.neckRotation[1])).toBeLessThanOrEqual(75 * Math.PI / 180 + 1e-6);
  });

  it("returns neutral zero rotations when the LookAt pin is disabled", () => {
    const off = solveVrmLookAtPin({
      pin: { enabled: false, targetWorld: [2, 3, 1] },
      headWorldPosition: [0, 1.5, 0],
    });
    expect(off.enabled).toBe(false);
    expect(off.neckRotation).toEqual([0, 0, 0]);
    expect(off.headRotation).toEqual([0, 0, 0]);
    expect(off.leftEyeRotation).toEqual([0, 0, 0]);
  });

  it("applies LookAt pin onto a PoseBoneMap immutably and applies preset + pin onto a VRM", () => {
    const punch = findVrmActionSilhouettePreset("action-punch")!;
    const gaze = solveVrmLookAtPin({
      pin: { enabled: true, targetWorld: [-0.8, 1.6, 2.0] },
      headWorldPosition: [0, 1.5, 0],
    });
    const combined = applyVrmLookAtPinToPose(punch.bones, gaze);
    expect(combined.head?.rotation).toEqual([...gaze.headRotation]);
    expect(combined.leftEye?.rotation).toEqual([...gaze.leftEyeRotation]);
    expect(punch.bones.leftEye).toBeUndefined();

    const { vrm, bones, lookAt } = createMinimalLookAtVrm("1", 0);
    const applied = applyVrmActionSilhouettePreset(vrm, "action-point", {
      lookAtPin: { enabled: true, targetWorld: [0.6, 1.9, 2.0] },
    });
    expect(applied.applied).toBe(true);
    expect(applied.preset?.label).toBe("삿대질");
    expect(applied.lookAtSolution?.enabled).toBe(true);
    expect(bones.head!.rotation.y).toBeGreaterThan(0);
    expect(lookAt.yaw).toBeGreaterThan(0);

    // VRM 0.x unrotated (-Z forward)에서도 정규화된 전방축으로 정확한 시선 부호 산출
    const { vrm: rawVrm0 } = createMinimalLookAtVrm("0", 0);
    const vrm0Gaze = applyVrmLookAtPinToVrm(rawVrm0, {
      enabled: true,
      targetWorld: [-0.6, 1.6, -2.0], // -Z를 바라보는 캐릭터의 좌측(-X)
    });
    expect(vrm0Gaze.behindCharacter).toBe(false);
    expect(vrm0Gaze.yawRad).toBeGreaterThan(0);
  });
});
