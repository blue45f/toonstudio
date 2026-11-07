import { describe, expect, it } from "vitest";

import { HUMANOID_BONE_NAMES } from "../contracts/bones";
import { IDENTITY_QUAT } from "../contracts/pose";
import {
  degToRad,
  qAngle,
  qConjugate,
  qDot,
  qFromAxisAngle,
  qLength,
  qMultiply,
  qNormalize,
  v3Distance,
  v3IsFinite,
  v3Length,
} from "../shared/math";
import { createPrng } from "../shared/prng";

import { SPINE_IK_CHAIN, fingerIkChain, fingerTipLocal, solveChainIk } from "./fabrik";
import { solveIkGoal } from "./ik-apply";
import { dragJointDetailed } from "./joint-drag";
import { poseLimitViolations } from "./joint-limits";
import { HAND_POSE_PRESETS, POSE_PRESETS, findHandPosePreset, findPosePreset } from "./presets";
import { createReferenceSkeleton } from "./reference-skeleton";
import { boneAxisLocal, boneWorldPosition, composeLocalRotation, computeWorldTransforms, poseRotationFromWorld } from "./skeleton-fk";

import type { DragCamera } from "./joint-drag";
import type { WorldTransformMap } from "./skeleton-fk";
import type { HumanoidBoneName } from "../contracts/bones";
import type { SkeletonData } from "../contracts/mesh-data";
import type { IkGoal, Pose, Quat, Vec3 } from "../contracts/pose";

function randomUnitVec3(prng: ReturnType<typeof createPrng>): Vec3 {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const x = prng.nextRange(-1, 1);
    const y = prng.nextRange(-1, 1);
    const z = prng.nextRange(-1, 1);
    const len = Math.hypot(x, y, z);
    if (len > 1e-4) return [x / len, y / len, z / len];
  }
  return [0, 1, 0];
}

function scaleQuat(q: Quat, scale: number): Quat {
  return [q[0] * scale, q[1] * scale, q[2] * scale, q[3] * scale];
}

describe("computeWorldTransforms", () => {
  const skeleton = createReferenceSkeleton();

  it("rest 포즈에서 모든 본의 월드 위치는 부모 위치 + rest 오프셋 합이다", () => {
    const t = computeWorldTransforms(skeleton, {});
    expect(t.size).toBe(HUMANOID_BONE_NAMES.length);
    expect(t.get("hips")?.position).toEqual([0, 0.95, 0]);
    expect(v3Distance(t.get("head")?.position ?? [0, 0, 0], [0, 1.49, 0])).toBeLessThanOrEqual(1e-9);
    expect(v3Distance(t.get("leftHand")?.position ?? [0, 0, 0], [0.67, 1.39, 0])).toBeLessThanOrEqual(1e-9);
    expect(v3Distance(t.get("rightFoot")?.position ?? [0, 0, 0], [-0.09, 0.08, 0])).toBeLessThanOrEqual(1e-9);
  });

  it("왼쪽 상완을 Z축 -90° 돌리면 손이 어깨 아래로 내려온다", () => {
    const t = computeWorldTransforms(skeleton, { leftUpperArm: qFromAxisAngle([0, 0, 1], degToRad(-90)) });
    const shoulder = t.get("leftUpperArm")?.position ?? [0, 0, 0];
    const hand = t.get("leftHand")?.position ?? [0, 0, 0];
    expect(hand[0]).toBeCloseTo(shoulder[0], 6);
    expect(hand[1]).toBeCloseTo(shoulder[1] - 0.52, 6);
  });

  it("rest 회전이 항등이 아닌 본도 glTF 규약(T·R 누적)으로 계산한다", () => {
    const rot = qFromAxisAngle([0, 1, 0], degToRad(90));
    const sk: SkeletonData = {
      bones: [
        { name: "hips", parent: null, restTranslation: [0, 1, 0], restRotation: rot },
        { name: "spine", parent: "hips", restTranslation: [1, 0, 0], restRotation: [0, 0, 0, 1] },
      ],
    };
    const t = computeWorldTransforms(sk, {});
    // +X 오프셋이 Y축 90° 회전으로 -Z로 간다
    expect(v3Distance(t.get("spine")?.position ?? [0, 0, 0], [0, 1, -1])).toBeLessThanOrEqual(1e-6);
    // 포즈 회전은 rest 뒤에 곱한다: pose = rot⁻¹이면 spine 로컬 회전이 항등
    const t2 = computeWorldTransforms(sk, { hips: [-rot[0], -rot[1], -rot[2], rot[3]] });
    expect(v3Distance(t2.get("spine")?.position ?? [0, 0, 0], [1, 1, 0])).toBeLessThanOrEqual(1e-6);
  });

  it("순환 부모 관계는 throw한다", () => {
    const sk: SkeletonData = {
      bones: [
        { name: "a", parent: "b", restTranslation: [0, 0, 0], restRotation: [0, 0, 0, 1] },
        { name: "b", parent: "a", restTranslation: [0, 0, 0], restRotation: [0, 0, 0, 1] },
      ],
    };
    expect(() => computeWorldTransforms(sk, {})).toThrow(/순환/u);
  });

  it("poseRotationFromWorld는 composeLocalRotation의 역이다", () => {
    const parent = qFromAxisAngle([0, 1, 0], 0.7);
    const rest = qFromAxisAngle([1, 0, 0], 0.3);
    const pose = qFromAxisAngle([0, 0, 1], -0.9);
    const world = qMultiply(parent, composeLocalRotation(rest, pose));
    const back = poseRotationFromWorld(parent, rest, world);
    for (let i = 0; i < 4; i += 1) expect(back[i]).toBeCloseTo(pose[i] ?? 0, 9);
  });

  it("최소 재현 픽스처(seed=0x20261106): 퇴화(0 길이·EPSILON 미만·NaN) 포즈·월드 회전이 유효한 rest·부모 회전을 지우지 않는다", () => {
    // [수정 전 결함 1] composeLocalRotation([1, 0, 0, 0], [0, 0, 0, 0])이 qMultiply 전에 정규화하지 않아
    // 곱 결과가 [0, 0, 0, 0]이 되고 qNormalize가 [0, 0, 0, 1]을 반환하여 180° restRotation이 소실됨.
    // 또한 restRotation=[1e6, 0, 0, 0], poseRotation=[1e-12, 0, 0, 0]일 때 곱의 길이가 1e-6 ≥ EPSILON이 되어
    // [0, 0, 0, -1](항등 회전)로 잘못 정규화되던 결함.
    const rest180X: Quat = [1, 0, 0, 0];
    expect(qAngle(composeLocalRotation(rest180X, [0, 0, 0, 0]), rest180X)).toBeLessThanOrEqual(1e-9);
    expect(qAngle(composeLocalRotation(scaleQuat(rest180X, 1e6), [1e-12, 0, 0, 0]), rest180X)).toBeLessThanOrEqual(1e-9);
    expect(qAngle(composeLocalRotation(rest180X, [Number.NaN, 0, 0, 1]), rest180X)).toBeLessThanOrEqual(1e-9);
    expect(composeLocalRotation([0, 0, 0, 0], undefined)).toEqual(IDENTITY_QUAT);

    // [수정 전 결함 2] poseRotationFromWorld에서 worldRotation=[1e-12, 0, 0, 0](EPSILON 미만)일 때
    // worldRotation을 먼저 qNormalize하지 않아 local의 길이가 1e-12가 되고, 마지막 qNormalize가
    // rest⁻¹·parent⁻¹ 대신 QUAT_IDENTITY로 붕괴시키던 결함.
    const parent = qFromAxisAngle([0, 1, 0], degToRad(90));
    const rest = qFromAxisAngle([1, 0, 0], degToRad(60));
    const expectedWhenWorldIdentity = qNormalize(qMultiply(qConjugate(rest), qConjugate(parent)));
    const actualSubEps = poseRotationFromWorld(parent, rest, [1e-12, 0, 0, 0]);
    const actualZero = poseRotationFromWorld(parent, rest, [0, 0, 0, 0]);
    expect(qAngle(actualSubEps, expectedWhenWorldIdentity)).toBeLessThanOrEqual(1e-7);
    expect(qAngle(actualZero, expectedWhenWorldIdentity)).toBeLessThanOrEqual(1e-7);
    for (let i = 0; i < 4; i += 1) {
      expect(actualSubEps[i]).toBeCloseTo(expectedWhenWorldIdentity[i] ?? 0, 12);
      expect(actualZero[i]).toBeCloseTo(expectedWhenWorldIdentity[i] ?? 0, 12);
    }
  });

  it("시드 기반 성질·메타모픽 회귀(seed=0x20261106, 64회): 비정규화 스케일·거의 0°·180° 경계에서 합성·역산 왕복이 보존된다", () => {
    const prng = createPrng(0x20261106);
    const boundaryAngles = [0, 1e-7, 1e-4, Math.PI - 1e-7, Math.PI - 1e-4, Math.PI];

    for (let trial = 0; trial < 64; trial += 1) {
      const parentAxis = randomUnitVec3(prng);
      const restAxis = randomUnitVec3(prng);
      const poseAxis = randomUnitVec3(prng);
      const parentAngle = trial < boundaryAngles.length ? (boundaryAngles[trial] ?? 0) : prng.nextRange(-Math.PI, Math.PI);
      const restAngle = prng.nextRange(-Math.PI, Math.PI);
      const poseAngle =
        trial < boundaryAngles.length ? (boundaryAngles[(trial + 2) % boundaryAngles.length] ?? 0) : prng.nextRange(-Math.PI, Math.PI);

      const parentUnit = qFromAxisAngle(parentAxis, parentAngle);
      const restUnit = qFromAxisAngle(restAxis, restAngle);
      const poseUnit = qFromAxisAngle(poseAxis, poseAngle);

      const sParent = Math.pow(10, prng.nextRange(-3, 3));
      const sRest = Math.pow(10, prng.nextRange(-3, 3));
      const sPose = Math.pow(10, prng.nextRange(-3, 3));
      const sWorld = Math.pow(10, prng.nextRange(-3, 3));

      const localScaled = composeLocalRotation(scaleQuat(restUnit, sRest), scaleQuat(poseUnit, sPose));
      const localUnit = composeLocalRotation(restUnit, poseUnit);
      expect(Math.abs(qLength(localScaled) - 1)).toBeLessThanOrEqual(1e-9);
      expect(qAngle(localScaled, localUnit)).toBeLessThanOrEqual(1e-7);

      const worldUnit = qNormalize(qMultiply(parentUnit, localUnit));
      const recovered = poseRotationFromWorld(
        scaleQuat(parentUnit, sParent),
        scaleQuat(restUnit, sRest),
        scaleQuat(worldUnit, sWorld),
      );
      expect(Math.abs(qLength(recovered) - 1)).toBeLessThanOrEqual(1e-9);
      expect(qAngle(recovered, poseUnit)).toBeLessThanOrEqual(1e-6);
    }
  });

  it("다단계 반복 FK·역산 왕복에서 쿼터니언 노름 드리프트가 없고 강체 회전 아래 부모-자식 본 거리가 불변이다", () => {
    const prng = createPrng(0x5f3759df);
    const activeBones: readonly HumanoidBoneName[] = [
      "hips",
      "spine",
      "chest",
      "upperChest",
      "neck",
      "head",
      "leftShoulder",
      "leftUpperArm",
      "leftLowerArm",
      "leftHand",
      "rightUpperLeg",
      "rightLowerLeg",
      "rightFoot",
    ];
    let currentPose: Pose = {};
    for (const name of activeBones) {
      currentPose = {
        ...currentPose,
        [name]: qFromAxisAngle(randomUnitVec3(prng), prng.nextRange(-Math.PI, Math.PI)),
      };
    }

    const restTransforms = computeWorldTransforms(skeleton, {});
    const initialTransforms = computeWorldTransforms(skeleton, currentPose);

    // 32단계 FK → poseRotationFromWorld 역산 반복 후에도 모든 본 회전 노름과 각도가 보존되어야 한다
    for (let step = 0; step < 32; step += 1) {
      const worldMap = computeWorldTransforms(skeleton, currentPose);
      const nextPose: Partial<Record<HumanoidBoneName, Quat>> = {};
      for (const bone of skeleton.bones) {
        const current = worldMap.get(bone.name);
        expect(current).toBeDefined();
        if (!current) continue;
        expect(v3IsFinite(current.position)).toBe(true);
        expect(Math.abs(qLength(current.rotation) - 1)).toBeLessThanOrEqual(1e-6);

        const parentWorld = bone.parent ? (worldMap.get(bone.parent)?.rotation ?? IDENTITY_QUAT) : IDENTITY_QUAT;
        nextPose[bone.name as HumanoidBoneName] = poseRotationFromWorld(parentWorld, bone.restRotation, current.rotation);

        if (bone.parent) {
          const parentPos = worldMap.get(bone.parent)?.position ?? [0, 0, 0];
          const restParentPos = restTransforms.get(bone.parent)?.position ?? [0, 0, 0];
          const restSelfPos = restTransforms.get(bone.name)?.position ?? [0, 0, 0];
          const expectedSegmentLen = v3Distance(restSelfPos, restParentPos);
          const actualSegmentLen = v3Distance(current.position, parentPos);
          expect(Math.abs(actualSegmentLen - expectedSegmentLen)).toBeLessThanOrEqual(1e-6);
        }
      }
      currentPose = nextPose;
    }

    const finalTransforms = computeWorldTransforms(skeleton, currentPose);
    for (const bone of skeleton.bones) {
      const a = initialTransforms.get(bone.name);
      const b = finalTransforms.get(bone.name);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      if (!a || !b) continue;
      expect(v3Distance(a.position, b.position)).toBeLessThanOrEqual(1e-6);
      expect(qAngle(a.rotation, b.rotation)).toBeLessThanOrEqual(1e-6);
    }
  });

  it("유효하지 않은 입력(순환 그래프·NaN/Infinity restTranslation·미존재 본 조회)은 명시적으로 거부하고 입력 객체를 변경하지 않는다", () => {
    const selfCycle: SkeletonData = {
      bones: [{ name: "hips", parent: "hips", restTranslation: [0, 1, 0], restRotation: [0, 0, 0, 1] }],
    };
    expect(() => computeWorldTransforms(selfCycle, {})).toThrow(/순환/u);

    const nanTranslation: SkeletonData = {
      bones: [
        { name: "hips", parent: null, restTranslation: [0, 1, 0], restRotation: [0, 0, 0, 1] },
        { name: "spine", parent: "hips", restTranslation: [0, Number.NaN, 0], restRotation: [0, 0, 0, 1] },
      ],
    };
    expect(() => computeWorldTransforms(nanTranslation, {})).toThrow(/ 유한하지 않습니다/u);

    const infTranslation: SkeletonData = {
      bones: [{ name: "hips", parent: null, restTranslation: [Number.POSITIVE_INFINITY, 0, 0], restRotation: [0, 0, 0, 1] }],
    };
    expect(() => computeWorldTransforms(infTranslation, {})).toThrow(/ 유한하지 않습니다/u);

    const validMap = computeWorldTransforms(skeleton, {});
    expect(() => boneWorldPosition(validMap, "nonExistentBone")).toThrow(/없는 본/u);

    // 입력 불변성 검증
    const poseInput: Pose = {
      hips: [0, 2, 0, 2],
      leftUpperArm: [1, 0, 0, 1],
    };
    const skeletonSnapshot = JSON.stringify(skeleton);
    const poseSnapshot = JSON.stringify(poseInput);
    computeWorldTransforms(skeleton, poseInput);
    expect(JSON.stringify(skeleton)).toBe(skeletonSnapshot);
    expect(JSON.stringify(poseInput)).toBe(poseSnapshot);
  });
});

describe("boneAxisLocal", () => {
  const skeleton = createReferenceSkeleton();

  it("자식 방향을 본 축으로 쓰고, 머리는 수직(+Y), 손목은 해부학적 축(±X 또는 중지 중수골)을 쓴다", () => {
    expect(boneAxisLocal(skeleton, "leftUpperArm")).toEqual([1, 0, 0]);
    expect(boneAxisLocal(skeleton, "rightUpperArm")).toEqual([-1, 0, 0]);
    expect(boneAxisLocal(skeleton, "leftUpperLeg")).toEqual([0, -1, 0]);
    expect(boneAxisLocal(skeleton, "head")).toEqual([0, 1, 0]);
    expect(boneAxisLocal(skeleton, "leftHand")).toEqual([1, 0, 0]);
    expect(boneAxisLocal(skeleton, "rightHand")).toEqual([-1, 0, 0]);

    const withMiddleMetacarpal: SkeletonData = {
      bones: [
        { name: "leftHand", parent: null, restTranslation: [0.25, 0, 0], restRotation: [0, 0, 0, 1] },
        { name: "leftMiddleMetacarpal", parent: "leftHand", restTranslation: [0.08, 0.06, 0], restRotation: [0, 0, 0, 1] },
      ],
    };
    const customHandAxis = boneAxisLocal(withMiddleMetacarpal, "leftHand");
    expect(customHandAxis[0]).toBeCloseTo(0.8, 6);
    expect(customHandAxis[1]).toBeCloseTo(0.6, 6);
    expect(customHandAxis[2]).toBeCloseTo(0, 6);
  });

  it("자식이 없는 말단 본은 자기 rest 오프셋 방향을 쓰고, 그것도 없으면 +Y", () => {
    const toes = boneAxisLocal(skeleton, "leftToes");
    expect(toes[2]).toBeGreaterThan(0.5);
    const lonely: SkeletonData = { bones: [{ name: "hips", parent: null, restTranslation: [0, 0, 0], restRotation: [0, 0, 0, 1] }] };
    expect(boneAxisLocal(lonely, "hips")).toEqual([0, 1, 0]);
  });

  it("퇴화 입력(0 길이 중수골·서로 상쇄되는 대칭 자식 오프셋·비정규화 restRotation)에서도 항상 유한 단위 벡터를 돌려준다", () => {
    const degenerateSkeleton: SkeletonData = {
      bones: [
        // 두 자식의 오프셋이 정반대여서 평균 합이 [0, 0, 0]이 되는 경우 → 자기 오프셋 또는 +Y로 폴백
        { name: "hips", parent: null, restTranslation: [0, 0, 2], restRotation: [0, 0, 0, 5] },
        { name: "leftUpperLeg", parent: "hips", restTranslation: [0.1, 0, 0], restRotation: [0, 0, 0, 1] },
        { name: "rightUpperLeg", parent: "hips", restTranslation: [-0.1, 0, 0], restRotation: [0, 0, 0, 1] },
        // 0 길이 중지 중수골 자식 → 해부학적 ±X로 폴백
        { name: "leftHand", parent: null, restTranslation: [0.25, 0, 0], restRotation: [0, 0, 0, 0] },
        { name: "leftMiddleMetacarpal", parent: "leftHand", restTranslation: [0, 0, 0], restRotation: [0, 0, 0, 1] },
      ],
    };

    const hipsAxis = boneAxisLocal(degenerateSkeleton, "hips");
    expect(v3IsFinite(hipsAxis)).toBe(true);
    expect(Math.abs(v3Length(hipsAxis) - 1)).toBeLessThanOrEqual(1e-6);
    expect(hipsAxis).toEqual([0, 0, 1]);

    const handAxis = boneAxisLocal(degenerateSkeleton, "leftHand");
    expect(handAxis).toEqual([1, 0, 0]);

    const unknownAxis = boneAxisLocal(degenerateSkeleton, "missingBone");
    expect(unknownAxis).toEqual([0, 1, 0]);
  });
});

function clonePose(pose: Pose): Pose {
  const copy: Pose = {};
  for (const [bone, q] of Object.entries(pose) as [HumanoidBoneName, Quat | undefined][]) {
    if (q) copy[bone] = [q[0], q[1], q[2], q[3]];
  }
  return copy;
}

function snapshotWorldTransforms(
  transforms: WorldTransformMap,
): ReadonlyArray<readonly [string, { readonly position: Vec3; readonly rotation: Quat }]> {
  return Array.from(transforms.entries(), ([name, t]) => [
    name,
    {
      position: [t.position[0], t.position[1], t.position[2]] as const,
      rotation: [t.rotation[0], t.rotation[1], t.rotation[2], t.rotation[3]] as const,
    },
  ]);
}

describe("caller integration contract: preset corpus & exception state preservation", () => {
  const skeleton = createReferenceSkeleton();

  it("실제 프리셋 코퍼스(POSE_PRESETS × HAND_POSE_PRESETS) 전체에서 FK 월드 변환·poseRotationFromWorld 역산 동치·재FK 불변성을 만족한다", () => {
    expect(POSE_PRESETS.length).toBeGreaterThan(0);
    expect(HAND_POSE_PRESETS.length).toBeGreaterThan(0);

    const nonUnitScales = [0.04, 18.5, -2.75, 0.35] as const;

    for (const posePreset of POSE_PRESETS) {
      for (const handPreset of HAND_POSE_PRESETS) {
        const mergedPose: Pose = {
          ...posePreset.pose,
          ...handPreset.left,
          ...handPreset.right,
        };

        const scaledPose: Pose = {};
        let idx = 0;
        for (const [bone, q] of Object.entries(mergedPose) as [HumanoidBoneName, Quat | undefined][]) {
          if (!q) continue;
          const s = nonUnitScales[idx % nonUnitScales.length] ?? 1;
          idx += 1;
          scaledPose[bone] = scaleQuat(q, s);
        }

        for (const inputPose of [mergedPose, scaledPose]) {
          const worldMap = computeWorldTransforms(skeleton, inputPose);
          expect(worldMap.size).toBe(HUMANOID_BONE_NAMES.length);

          const recoveredPose: Pose = {};
          for (const bone of skeleton.bones) {
            const world = worldMap.get(bone.name);
            expect(world).toBeDefined();
            if (!world) continue;

            expect(v3IsFinite(world.position)).toBe(true);
            expect(Math.abs(qLength(world.rotation) - 1)).toBeLessThanOrEqual(1e-6);

            const parentWorldRot = bone.parent ? (worldMap.get(bone.parent)?.rotation ?? IDENTITY_QUAT) : IDENTITY_QUAT;
            const recovered = poseRotationFromWorld(parentWorldRot, bone.restRotation, world.rotation);
            expect(Math.abs(qLength(recovered) - 1)).toBeLessThanOrEqual(1e-6);

            const rawInput = inputPose[bone.name as HumanoidBoneName] ?? IDENTITY_QUAT;
            const expected = qNormalize(rawInput);
            expect(Math.abs(qDot(recovered, expected))).toBeGreaterThanOrEqual(1 - 1e-6);

            recoveredPose[bone.name as HumanoidBoneName] = recovered;
          }

          const roundtripMap = computeWorldTransforms(skeleton, recoveredPose);
          for (const bone of skeleton.bones) {
            const before = worldMap.get(bone.name);
            const after = roundtripMap.get(bone.name);
            expect(before).toBeDefined();
            expect(after).toBeDefined();
            if (!before || !after) continue;
            expect(v3Distance(before.position, after.position)).toBeLessThanOrEqual(1e-6);
            expect(qAngle(before.rotation, after.rotation)).toBeLessThanOrEqual(1e-6);
            expect(Math.abs(qDot(before.rotation, after.rotation))).toBeGreaterThanOrEqual(1 - 1e-6);
          }
        }
      }
    }
  });

  it("상위 호출자(solveIkGoal, dragJointDetailed, solveChainIk) 연동 중 손상된 스켈레톤(NaN/Infinity restTranslation, 순환 부모) 예외 발생 전후로 pose·WorldTransformMap을 100% 보존하고 즉시 복구된다", () => {
    const idlePreset = findPosePreset("idle");
    const wavePreset = findPosePreset("wave");
    const relaxedHand = findHandPosePreset("relaxed");
    const pointHand = findHandPosePreset("point");

    const idlePose: Pose = { ...idlePreset.pose, ...relaxedHand.left, ...relaxedHand.right };
    const activePose: Pose = { ...wavePreset.pose, ...pointHand.left, ...pointHand.right };

    const idlePoseSnapshot = clonePose(idlePose);
    const activePoseSnapshot = clonePose(activePose);

    const baselineWorld = computeWorldTransforms(skeleton, activePose);
    const baselineWorldSnapshot = snapshotWorldTransforms(baselineWorld);

    // 1. 정상 상위 호출자 동작 확인 (idle 및 wave 프리셋)
    const ikGoal: IkGoal = {
      chain: "leftArm",
      target: [0.34, 1.15, 0.26],
      pole: [0.3, 0.9, -0.25],
    };
    expect(v3IsFinite(ikGoal.target)).toBe(true);

    const idleIk = solveIkGoal(idlePose, skeleton, ikGoal);
    expect(Number.isFinite(idleIk.error)).toBe(true);
    expect(poseLimitViolations(idleIk.pose, skeleton)).toEqual([]);
    expect(idlePose).toEqual(idlePoseSnapshot);

    const baselineIk = solveIkGoal(activePose, skeleton, ikGoal);
    expect(Number.isFinite(baselineIk.error)).toBe(true);
    expect(poseLimitViolations(baselineIk.pose, skeleton)).toEqual([]);
    expect(activePose).toEqual(activePoseSnapshot);

    const dragCamera: DragCamera = { position: [0, 1.35, 2.8], forward: [0, 0, -1] };
    const dragFrom: Vec3 = baselineWorld.get("leftHand")?.position ?? [0.2, 1.0, 0.1];
    const dragTo: Vec3 = [dragFrom[0] + 0.12, dragFrom[1] + 0.18, dragFrom[2]];
    const baselineDrag = dragJointDetailed(activePose, skeleton, "leftUpperArm", dragFrom, dragTo, dragCamera);
    expect(Number.isFinite(baselineDrag.requestedDeg)).toBe(true);
    expect(poseLimitViolations(baselineDrag.pose, skeleton)).toEqual([]);
    expect(activePose).toEqual(activePoseSnapshot);

    const headPos = baselineWorld.get("head")?.position ?? [0, 1.49, 0];
    const spineTarget: Vec3 = [headPos[0] + 0.03, headPos[1] - 0.02, headPos[2] + 0.08];
    expect(v3IsFinite(spineTarget)).toBe(true);
    const baselineSpineIk = solveChainIk(activePose, skeleton, SPINE_IK_CHAIN, spineTarget);
    expect(Number.isFinite(baselineSpineIk.error)).toBe(true);
    expect(poseLimitViolations(baselineSpineIk.pose, skeleton)).toEqual([]);
    expect(activePose).toEqual(activePoseSnapshot);

    const rightIndexChain = fingerIkChain("right", "Index");
    const rightIndexTip = fingerTipLocal(skeleton, "rightIndexDistal");
    const rightIndexProximalPos = baselineWorld.get("rightIndexProximal")?.position ?? [-0.4, 1.3, 0.1];
    const fingerTarget: Vec3 = [rightIndexProximalPos[0] - 0.04, rightIndexProximalPos[1] - 0.04, rightIndexProximalPos[2] + 0.02];
    expect(v3IsFinite(fingerTarget)).toBe(true);
    const baselineFingerIk = solveChainIk(activePose, skeleton, rightIndexChain, fingerTarget, { tipLocal: rightIndexTip });
    expect(Number.isFinite(baselineFingerIk.error)).toBe(true);
    expect(poseLimitViolations(baselineFingerIk.pose, skeleton)).toEqual([]);
    expect(activePose).toEqual(activePoseSnapshot);

    // 2. 손상된 스켈레톤 픽스처 2종 (비유한 restTranslation / 순환 부모 참조 a -> b -> a)
    const nanTranslationSkeleton: SkeletonData = {
      bones: skeleton.bones.map((bone) =>
        bone.name === "spine" ? { ...bone, restTranslation: [0, Number.NaN, 0] } : bone,
      ),
    };
    const infTranslationSkeleton: SkeletonData = {
      bones: skeleton.bones.map((bone) =>
        bone.name === "leftUpperArm" ? { ...bone, restTranslation: [Number.POSITIVE_INFINITY, 0, 0] } : bone,
      ),
    };
    const cycleAbSkeleton: SkeletonData = {
      bones: [
        { name: "a", parent: "b", restTranslation: [0, 0.1, 0], restRotation: [0, 0, 0, 1] },
        { name: "b", parent: "a", restTranslation: [0, 0.1, 0], restRotation: [0, 0, 0, 1] },
        ...skeleton.bones,
      ],
    };
    const cycleHipsSpineSkeleton: SkeletonData = {
      bones: skeleton.bones.map((bone) => {
        if (bone.name === "hips") return { ...bone, parent: "spine" };
        if (bone.name === "spine") return { ...bone, parent: "hips" };
        return bone;
      }),
    };

    for (const corrupted of [nanTranslationSkeleton, infTranslationSkeleton, cycleAbSkeleton, cycleHipsSpineSkeleton]) {
      expect(() => computeWorldTransforms(corrupted, activePose)).toThrow(Error);
      expect(() => solveIkGoal(activePose, corrupted, ikGoal)).toThrow(Error);
      expect(() => dragJointDetailed(activePose, corrupted, "leftUpperArm", dragFrom, dragTo, dragCamera)).toThrow(Error);
      expect(() => solveChainIk(activePose, corrupted, SPINE_IK_CHAIN, spineTarget)).toThrow(Error);
      expect(() => solveChainIk(activePose, corrupted, rightIndexChain, fingerTarget, { tipLocal: rightIndexTip })).toThrow(Error);

      // 예외 발생 전후 입력 pose와 기존 WorldTransformMap 스냅샷은 부분 변경 없이 100% 보존되어야 한다
      expect(activePose).toEqual(activePoseSnapshot);
      expect(snapshotWorldTransforms(baselineWorld)).toEqual(baselineWorldSnapshot);
    }

    // 3. 실패 후 복구(recovery): 동일한 activePose와 정상 스켈레톤으로 재호출 시 이전 정상 결과와 완벽히 일치
    const recoveredWorld = computeWorldTransforms(skeleton, activePose);
    const recoveredIk = solveIkGoal(activePose, skeleton, ikGoal);
    const recoveredDrag = dragJointDetailed(activePose, skeleton, "leftUpperArm", dragFrom, dragTo, dragCamera);
    const recoveredSpineIk = solveChainIk(activePose, skeleton, SPINE_IK_CHAIN, spineTarget);
    const recoveredFingerIk = solveChainIk(activePose, skeleton, rightIndexChain, fingerTarget, { tipLocal: rightIndexTip });

    expect(snapshotWorldTransforms(recoveredWorld)).toEqual(baselineWorldSnapshot);
    expect(recoveredIk).toEqual(baselineIk);
    expect(recoveredDrag).toEqual(baselineDrag);
    expect(recoveredSpineIk).toEqual(baselineSpineIk);
    expect(recoveredFingerIk).toEqual(baselineFingerIk);
    expect(activePose).toEqual(activePoseSnapshot);
  });
});


