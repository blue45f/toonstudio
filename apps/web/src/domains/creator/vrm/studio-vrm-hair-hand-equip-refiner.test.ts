import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  createStudioAttachmentNodeFromGripPreset,
  findStudioAttachmentSocket,
  reparentStudioAttachment,
  resolveStudioAttachmentWorldTransforms,
  snapStudioAttachmentNodeToEquipSocket,
  type StudioAttachmentGraph,
} from "./studio-vrm-attachment-graph";
import {
  bendStudioVrmAuthoredHairAlongSpine,
  createStudioVrmAuthoredHairClumpGeometry,
  createStudioVrmAuthoredHairGeometry,
} from "./studio-vrm-authored-hair-geometry";
import {
  resolveStudioVrmAnatomicalFingerAuthority,
  resolveStudioVrmFingerAuthority,
} from "./studio-vrm-auto-grip-authority";
import {
  buildAvatarForgeHairParts,
  createAvatarForgeState,
  type AvatarForgeHairPart,
} from "./studio-vrm-avatar-forge";
import { createStudioVrmGripContactTargets } from "./studio-vrm-grip-contact-targets";
import {
  STUDIO_VRM_12_EMOTIONS,
  STUDIO_VRM_HAND_15DOF_LIMITS,
  STUDIO_VRM_HAND_DIP_PIP_RATIO,
  STUDIO_VRM_HAIR_ZONE_SPRING_BOUNDS,
  alignStudioVrmPropGripToPalm,
  auditStudioVrmHairHandEquipQuality,
  auditStudioVrmHandPoseAnatomy,
  buildStudioVrmHairBodyColliders,
  evaluateStudioVrmHairHighlightRing,
  fitStudioVrmHairScalpCap,
  fitStudioVrmHairScalpVertex,
  refineStudioVrmHandPose15Dof,
  resolveStudioVrmAdjacentFingerSpread,
  resolveStudioVrmEquipSocketSnap,
  resolveStudioVrmHairColliderPushout,
  resolveStudioVrmHairZone,
  resolveStudioVrmHairZoneSpringTuning,
  resolveStudioVrmHeadwearCrownCompression,
  resolveStudioVrmJointVolumeCompensation,
  resolveStudioVrmLipSyncExpressionBlend,
  transitionStudioVrmExpression12,
} from "./studio-vrm-hair-hand-equip-refiner";
import {
  applyStudioVrmHairRigBodyColliders,
  buildStudioVrmHairRig,
} from "./studio-vrm-hair-rig";
import { planStudioVrmHairTransition } from "./studio-vrm-hair-transition";
import {
  STUDIO_VRM_HAND_POSE_TYPES,
  createStudioVrmFingerCurlPose,
  createStudioVrmHandPose,
} from "./studio-vrm-hand-poses";
import { HAND_LM, solveHandToFingerBones, type HandLandmark } from "./studio-vrm-hand-solver";
import {
  DEFAULT_VRM_PROP_RIG_METRICS,
  createAutoGripFingerOverrides,
  measureVrmPropRigMetrics,
  resolvePropAttachment,
  type VrmPropMetricBone,
} from "./studio-vrm-prop-rig";
import { createPropInstance, propDefById, type Vec3 } from "./studio-vrm-props";

import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

const SAMPLE_CAP_PART: AvatarForgeHairPart = {
  ...buildAvatarForgeHairParts(createAvatarForgeState("soft-bob")).find((part) => part.role === "cap")!,
  shine: 0.72,
};

function makeSyntheticVrmForGrip(): VRM {
  const scene = new THREE.Group();
  const bones: Partial<Record<VrmPropMetricBone, THREE.Object3D>> = {};
  const add = (name: VrmPropMetricBone, pos: Vec3) => {
    const node = new THREE.Object3D();
    node.name = name;
    node.position.set(...pos);
    scene.add(node);
    bones[name] = node;
  };
  add("hips", [0, 0.92, 0]);
  add("neck", [0, 1.46, 0]);
  add("head", [0, 1.62, 0]);
  add("leftShoulder", [0.2, 1.43, 0]);
  add("rightShoulder", [-0.2, 1.43, 0]);
  add("leftHand", [0.56, 1.2, 0]);
  add("rightHand", [-0.56, 1.2, 0]);
  add("leftFoot", [0.11, 0, 0]);
  add("rightFoot", [-0.11, 0, 0]);
  add("leftUpperLeg", [0.11, 0.92, 0]);
  add("rightUpperLeg", [-0.11, 0.92, 0]);
  for (const side of ["left", "right"] as const) {
    const sx = side === "left" ? 1 : -1;
    add(`${side}ThumbMetacarpal`, [sx * 0.535, 1.2, 0.025]);
    add(`${side}ThumbProximal`, [sx * 0.515, 1.2, 0.045]);
    add(`${side}ThumbDistal`, [sx * 0.505, 1.2, 0.065]);
    add(`${side}IndexProximal`, [sx * 0.535, 1.2, 0.08]);
    add(`${side}IndexIntermediate`, [sx * 0.535, 1.2, 0.115]);
    add(`${side}IndexDistal`, [sx * 0.535, 1.2, 0.14]);
    add(`${side}MiddleProximal`, [sx * 0.56, 1.2, 0.08]);
    add(`${side}MiddleIntermediate`, [sx * 0.56, 1.2, 0.12]);
    add(`${side}MiddleDistal`, [sx * 0.56, 1.2, 0.15]);
    add(`${side}RingProximal`, [sx * 0.575, 1.2, 0.078]);
    add(`${side}RingIntermediate`, [sx * 0.575, 1.2, 0.112]);
    add(`${side}RingDistal`, [sx * 0.575, 1.2, 0.137]);
    add(`${side}LittleProximal`, [sx * 0.585, 1.2, 0.08]);
    add(`${side}LittleIntermediate`, [sx * 0.585, 1.2, 0.108]);
    add(`${side}LittleDistal`, [sx * 0.585, 1.2, 0.13]);
  }
  scene.updateMatrixWorld(true);
  return {
    scene,
    humanoid: {
      getNormalizedBoneNode: (name: VRMHumanBoneName) => bones[name as VrmPropMetricBone] ?? null,
    },
  } as unknown as VRM;
}

describe("1. 헤어 두피 밀착·관통 0mm·3구역 스프링·캡슐 콜라이더·전환/하이라이트 정합", () => {
  it("1) 두피 캡 모든 정점이 이마·관자놀이·귀·목덜미에서 단위 두개골을 0mm도 관통하지 않는다", () => {
    const cap = createStudioVrmAuthoredHairGeometry(SAMPLE_CAP_PART);
    const pos = cap.getAttribute("position");
    let minRadius = Number.POSITIVE_INFINITY;
    for (let index = 0; index < pos.count; index += 1) {
      minRadius = Math.min(minRadius, Math.hypot(pos.getX(index), pos.getY(index), pos.getZ(index)));
    }
    expect(minRadius).toBeGreaterThanOrEqual(1.005);
    cap.dispose();
  });

  it("2) 머리 비율(넓은/좁은/긴/깊은 두상)이 변해도 fitStudioVrmHairScalpCap 관통은 0mm, 부양은 상한 이내다", () => {
    const skull = { center: [0, 0.1, 0] as const, radiusX: 0.1, radiusY: 0.115, radiusZ: 0.105 };
    const samples: Array<readonly [number, number, number]> = [
      [0, 0.19, 0.05], // 정수리 앞쪽 안쪽(관통 유발)
      [0.08, 0.09, 0.01], // 귀 옆 안쪽
      [0, 0.0, -0.02], // 목덜미 안쪽(목 관통 유발)
      [0, 0.27, 0], // 정수리 과도 부양
      [0, 0.12, 0.085], // 이마 관통
    ];
    for (const headAspectScale of [[1.3, 0.9, 1.1], [0.8, 1.25, 0.85], [1, 1, 1.3]] as const) {
      const report = fitStudioVrmHairScalpCap(samples, skull, { headAspectScale, maxFloatMm: 14 });
      expect(report.maxPenetrationMm).toBe(0);
      expect(report.maxFloatMm).toBeLessThanOrEqual(15.5);
    }
  });

  it("3) 모자 장착 시 정수리 상단 볼륨 자동 눌림(Crown Compression)이 두피 0mm 관통을 지키며 높이를 낮춘다", () => {
    const normal = fitStudioVrmHairScalpVertex(0, 0.96, 0.15, { crownCompression: 0 });
    const underHat = fitStudioVrmHairScalpVertex(0, 0.96, 0.15, { crownCompression: 0.8 });
    expect(underHat[1]).toBeLessThan(normal[1]);
    expect(Math.hypot(underHat[0], underHat[1], underHat[2])).toBeGreaterThanOrEqual(1.004);

    const capNormal = createStudioVrmAuthoredHairGeometry(SAMPLE_CAP_PART);
    const capCompressed = createStudioVrmAuthoredHairGeometry(SAMPLE_CAP_PART, { crownCompression: 0.75 });
    expect(capCompressed.boundingBox!.max.y).toBeLessThan(capNormal.boundingBox!.max.y);
    capNormal.dispose();
    capCompressed.dispose();
  });

  it("4) 앞머리 중심선이 퇴화(중복 점·동일선상 법선)되어도 NaN 없이 유한한 법선과 좌표를 생성한다", () => {
    const clump = createStudioVrmAuthoredHairClumpGeometry({
      ...SAMPLE_CAP_PART,
      id: "bang-0",
      role: "bang",
      primitive: "tapered-capsule",
    });
    const pt = new THREE.Vector3(0, 0.1, 0.08);
    bendStudioVrmAuthoredHairAlongSpine(clump, {
      points: [pt.clone(), pt.clone(), new THREE.Vector3(0, 0.04, 0.09)],
      normals: [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1)],
      halfWidth: 0.015,
      thickness: 0.006,
    });
    const pos = clump.getAttribute("position");
    const norm = clump.getAttribute("normal");
    for (let index = 0; index < pos.count; index += 1) {
      expect(Number.isFinite(pos.getX(index)) && Number.isFinite(pos.getY(index)) && Number.isFinite(pos.getZ(index))).toBe(true);
      expect(Math.hypot(norm.getX(index), norm.getY(index), norm.getZ(index))).toBeGreaterThan(0.95);
    }
    clump.dispose();
  });

  it("5) 웹툰 툰 하이라이트 링(엔젤링)은 정수리 위도 대역에서 최대치를 가지며 shine 증가에 비례한다", () => {
    const atCrown = evaluateStudioVrmHairHighlightRing(0.48, 0.9, 0);
    const atNape = evaluateStudioVrmHairHighlightRing(-0.5, 0.9, 0);
    const matteCrown = evaluateStudioVrmHairHighlightRing(0.48, 0.1, 0);
    expect(atCrown).toBeGreaterThan(atNape * 5);
    expect(atCrown).toBeGreaterThan(matteCrown * 2);
  });

  it("6) 앞머리·옆머리·뒷머리 3구역 스프링본 감쇠 상한과 강성 순서를 엄격히 지킨다", () => {
    expect(resolveStudioVrmHairZone("bang")).toBe("front");
    expect(resolveStudioVrmHairZone("side")).toBe("side");
    expect(resolveStudioVrmHairZone("back")).toBe("back");
    expect(resolveStudioVrmHairZone("tail")).toBe("back");

    for (const length of [0.05, 0.18, 0.35, 0.7]) {
      const front = resolveStudioVrmHairZoneSpringTuning(length, 1, "front");
      const side = resolveStudioVrmHairZoneSpringTuning(length, 1, "side");
      const back = resolveStudioVrmHairZoneSpringTuning(length, 1, "back");
      expect(front.dragForce).toBeLessThanOrEqual(STUDIO_VRM_HAIR_ZONE_SPRING_BOUNDS.front.dragMax);
      expect(side.dragForce).toBeLessThanOrEqual(STUDIO_VRM_HAIR_ZONE_SPRING_BOUNDS.side.dragMax);
      expect(back.dragForce).toBeLessThanOrEqual(STUDIO_VRM_HAIR_ZONE_SPRING_BOUNDS.back.dragMax);
      expect(front.stiffness).toBeGreaterThan(side.stiffness);
      expect(side.stiffness).toBeGreaterThan(back.stiffness);
    }
  });

  it("7) 머리·목·좌우 어깨 캡슐 콜라이더 밀어내기가 뿌리는 고정하고 관통 조인트를 0mm로 해소한다", () => {
    const colliders = buildStudioVrmHairBodyColliders({
      headCenter: [0, 1.62, 0],
      headRadius: 0.1,
      neckBase: [0, 1.44, 0],
      neckTop: [0, 1.54, 0],
      leftShoulder: [0.19, 1.42, 0],
      rightShoulder: [-0.19, 1.42, 0],
    });
    expect(colliders).toHaveLength(4);
    const joints = [
      { worldRest: [0, 1.72, -0.02] as const, hitRadius: 0.012 }, // 뿌리 고정
      { worldRest: [0, 1.56, 0.02] as const, hitRadius: 0.012 }, // 머리 내부 관통
      { worldRest: [0.01, 1.48, 0.01] as const, hitRadius: 0.012 }, // 목 내부 관통
      { worldRest: [0.14, 1.42, 0.0] as const, hitRadius: 0.012 }, // 왼쪽 어깨 관통
    ];
    const pushout = resolveStudioVrmHairColliderPushout(joints, colliders);
    expect(pushout.positions[0]).toEqual(joints[0]!.worldRest);
    expect(pushout.pushedJointCount).toBe(3);
    expect(pushout.residualPenetrationMm).toBe(0);
  });

  it("8) buildStudioVrmHairRig + applyStudioVrmHairRigBodyColliders가 3구역 분류와 콜라이더 밀어내기를 통합 수행한다", () => {
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
    const headRest = [0, 1.56, 0] as const;
    const rig = buildStudioVrmHairRig(
      [
        {
          part: { ...SAMPLE_CAP_PART, id: "bang-center", role: "bang", primitive: "tapered-capsule" },
          transform: { translation: [0, 1.58, 0.06], rotation: identity, scale: [0.02, 0.07, 0.01] },
        },
        {
          part: { ...SAMPLE_CAP_PART, id: "side-left", role: "side", primitive: "tapered-capsule" },
          transform: { translation: [0.09, 1.48, 0.01], rotation: identity, scale: [0.02, 0.14, 0.012] },
        },
        {
          part: { ...SAMPLE_CAP_PART, id: "back-sheet", role: "back", primitive: "ellipsoid" },
          transform: { translation: [0, 1.42, -0.04], rotation: identity, scale: [0.08, 0.2, 0.02] },
        },
      ],
      headRest,
      1,
    )!;
    const byId = new Map(rig.chains.map((chain) => [chain.id, chain]));
    expect(byId.get("bang-center")?.zone).toBe("front");
    expect(byId.get("side-left")?.zone).toBe("side");
    expect(byId.get("back-sheet")?.zone).toBe("back");

    const colliders = buildStudioVrmHairBodyColliders({
      headCenter: [0, 1.62, 0],
      headRadius: 0.1,
      neckBase: [0, 1.44, 0],
      neckTop: [0, 1.54, 0],
      leftShoulder: [0.19, 1.42, 0],
      rightShoulder: [-0.19, 1.42, 0],
    });
    const pushed = applyStudioVrmHairRigBodyColliders(rig, colliders, headRest);
    for (const chain of pushed.chains) {
      const check = resolveStudioVrmHairColliderPushout(chain.joints, colliders, 0);
      expect(check.residualPenetrationMm).toBe(0);
    }
  });

  it("9) 헤어 교체 전환 계획은 깜빡임 방지 원자적 스왑·기울어짐 방지 안정화 프레임·하이라이트 링을 제공한다", () => {
    const bob = createAvatarForgeState("soft-bob").hair;
    const pony = { ...bob, style: "ponytail" as const, shine: 0.85 };
    const swapPlan = planStudioVrmHairTransition(bob, pony);
    expect(swapPlan.swapPolicy).toBe("atomic-commit");
    expect(swapPlan.springSettleFrames).toBe(3);
    expect(swapPlan.lockNeutralRootBasis).toBe(true);
    expect(swapPlan.highlightRing.rollRad).toBe(0);
    expect(swapPlan.highlightRing.intensity).toBeGreaterThan(0.6);

    const visOnly = planStudioVrmHairTransition(bob, { ...bob, replaceOriginal: !bob.replaceOriginal });
    expect(visOnly.swapPolicy).toBe("keep");
    expect(visOnly.springSettleFrames).toBe(0);
    expect(visOnly.lockNeutralRootBasis).toBe(false);

    const offPlan = planStudioVrmHairTransition(bob, { ...bob, style: "none" });
    expect(offPlan.swapPolicy).toBe("dispose");
  });
});

describe("2. 해부학 15-DOF 손 포즈 전수 감사 · 역관절/교차 차단 · DIP ≈ 0.67 × PIP", () => {
  it("10) 웹툰 실무 16개 손 포즈 전체가 좌우 양손 모두 15-DOF 해부학 감사(역관절 0·교차 0)를 통과한다", () => {
    for (const pose of STUDIO_VRM_HAND_POSE_TYPES) {
      for (const side of ["left", "right"] as const) {
        const hand = createStudioVrmHandPose(side, pose);
        const audit = auditStudioVrmHandPoseAnatomy(side, hand);
        expect(audit.reverseJointViolations, `${side}/${pose}`).toBe(0);
        expect(audit.crossingPairs, `${side}/${pose}`).toBe(0);
        expect(audit.valid, `${side}/${pose}`).toBe(true);
      }
    }
  });

  it("11) 핵심 실무 포즈(릴렉스·검/펜/스마트폰/찻잔·주먹·지시)의 DIP ≈ 0.67 × PIP와 엄지 CMC 대립을 검증한다", () => {
    for (const pose of ["relaxed", "holding", "penGrip", "phoneGrip", "cupGrip", "fist", "okSign", "pinch"] as const) {
      const hand = createStudioVrmHandPose("right", pose);
      const audit = auditStudioVrmHandPoseAnatomy("right", hand);
      expect(audit.thumbCmcActive, pose).toBe(true);
      expect(audit.dipPipMaxError, pose).toBeLessThan(0.06);
      expect(hand.rightThumbMetacarpal[0] * RAD, `${pose} CMC X`).toBeGreaterThanOrEqual(9.5);
    }
  });

  it("12) 기존 peace 브이 포즈의 중지-약지 교차 결함이 교정되어 단조 비교차 순서를 만족한다", () => {
    const peace = createStudioVrmHandPose("right", "peace");
    const spreads = ["Index", "Middle", "Ring", "Little"].map((f) => peace[`right${f}Proximal`]![1] * RAD);
    expect(spreads[0]).toBeGreaterThan(spreads[1]!);
    expect(spreads[1]).toBeGreaterThanOrEqual(spreads[2]!);
    expect(spreads[2]).toBeGreaterThanOrEqual(spreads[3]!);
  });

  it("13) 역관절 음의 굽힘·과굴곡(150°)·비정상 DIP·인접 교차가 15-DOF 솔버에서 즉시 교정된다", () => {
    const broken: Record<string, [number, number, number]> = {
      rightIndexProximal: [0, -15 * DEG, -35 * DEG],
      rightIndexIntermediate: [0, 0, 145 * DEG],
      rightIndexDistal: [0, 0, -25 * DEG],
      rightMiddleProximal: [0, 12 * DEG, 120 * DEG],
      rightMiddleIntermediate: [0, 0, 40 * DEG],
      rightMiddleDistal: [0, 0, 110 * DEG],
      rightRingProximal: [0, 5 * DEG, 50 * DEG],
      rightRingIntermediate: [0, 0, 70 * DEG],
      rightRingDistal: [0, 0, 10 * DEG],
      rightLittleProximal: [0, 20 * DEG, 80 * DEG],
      rightLittleIntermediate: [0, 0, 80 * DEG],
      rightLittleDistal: [0, 0, 54 * DEG],
      rightThumbMetacarpal: [0, 0, 0],
      rightThumbProximal: [0, 10 * DEG, 45 * DEG],
      rightThumbDistal: [0, 0, 120 * DEG],
    };
    const fixed = refineStudioVrmHandPose15Dof("right", broken);
    const audit = auditStudioVrmHandPoseAnatomy("right", fixed);
    expect(audit.valid).toBe(true);
    expect(audit.reverseJointViolations).toBe(0);
    expect(audit.crossingPairs).toBe(0);
    expect(fixed.rightIndexProximal![2]).toBeGreaterThanOrEqual(0);
    expect(fixed.rightMiddleProximal![2] * RAD).toBeLessThanOrEqual(STUDIO_VRM_HAND_15DOF_LIMITS.mcpFlexMaxDeg + 1e-6);
    expect(fixed.rightThumbMetacarpal![0] * RAD).toBeGreaterThan(8);
    expect(fixed.rightThumbDistal![2] * RAD).toBeLessThanOrEqual(STUDIO_VRM_HAND_15DOF_LIMITS.thumbIpZ[1] + 1e-6);
  });

  it("14) 주먹(MCP 90°)으로 쥘수록 인접 손가락 벌림 폭이 해부학적으로 감쇠하며 교차하지 않는다", () => {
    const spreadOpen = resolveStudioVrmAdjacentFingerSpread([20, 4, -10, -20], [0, 0, 0, 0]);
    const spreadFist = resolveStudioVrmAdjacentFingerSpread([20, 4, -10, -20], [90, 90, 90, 90]);
    expect(Math.abs(spreadFist[0])).toBeLessThan(Math.abs(spreadOpen[0]) * 0.25);
    expect(spreadFist[0]).toBeGreaterThanOrEqual(spreadFist[1]);
    expect(spreadFist[1]).toBeGreaterThanOrEqual(spreadFist[2]);
    expect(spreadFist[2]).toBeGreaterThanOrEqual(spreadFist[3]);
  });

  it("15) 슬라이더 연동 손가락 컬이 DIP ≈ 0.67 × PIP 비율과 엄지 CMC 대립을 유지한다", () => {
    for (const deg of [15, 45, 75]) {
      const pose = createStudioVrmFingerCurlPose("right", deg);
      const pip = pose.rightIndexIntermediate![2] * RAD;
      const dip = pose.rightIndexDistal![2] * RAD;
      expect(dip / pip).toBeCloseTo(STUDIO_VRM_HAND_DIP_PIP_RATIO, 2);
      expect(pose.rightThumbMetacarpal![0] * RAD).toBeCloseTo(deg * 0.16, 4);
    }
  });

  it("16) MediaPipe 21-랜드마크 솔버가 노이즈 과굴곡·약지/소지 교차 랜드마크도 15-DOF 한계 안으로 정화한다", () => {
    const lm: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    lm[HAND_LM.wrist] = { x: 0, y: 0, z: 0 };
    lm[HAND_LM.indexMcp] = { x: -0.3, y: 1, z: 0 };
    lm[HAND_LM.indexPip] = { x: -0.3, y: 1.5, z: -0.9 };
    lm[HAND_LM.indexDip] = { x: -0.3, y: 0.7, z: -0.5 };
    lm[HAND_LM.indexTip] = { x: -0.3, y: 1.3, z: 0.2 };
    lm[HAND_LM.middleMcp] = { x: 0, y: 1, z: 0 };
    lm[HAND_LM.middlePip] = { x: 0, y: 2, z: 0 };
    lm[HAND_LM.middleDip] = { x: 0, y: 2.9, z: 0 };
    lm[HAND_LM.middleTip] = { x: 0, y: 3.7, z: 0 };
    lm[HAND_LM.ringMcp] = { x: 0.25, y: 1, z: 0 };
    lm[HAND_LM.ringPip] = { x: 0.75, y: 1.8, z: 0 }; // 과도 벌림
    lm[HAND_LM.ringDip] = { x: 0.85, y: 2.6, z: 0 };
    lm[HAND_LM.ringTip] = { x: 0.9, y: 3.2, z: 0 };
    lm[HAND_LM.littleMcp] = { x: 0.5, y: 0.9, z: 0 };
    lm[HAND_LM.littlePip] = { x: 0.55, y: 1.8, z: 0 }; // 약지보다 안쪽(교차 시도)
    lm[HAND_LM.littleDip] = { x: 0.56, y: 2.5, z: 0 };
    lm[HAND_LM.littleTip] = { x: 0.57, y: 3.0, z: 0 };
    lm[HAND_LM.thumbCmc] = { x: -0.35, y: 0.4, z: 0 };
    lm[HAND_LM.thumbMcp] = { x: -0.65, y: 0.7, z: 0.2 };
    lm[HAND_LM.thumbIp] = { x: -0.7, y: 0.9, z: -0.6 };
    lm[HAND_LM.thumbTip] = { x: -0.6, y: 0.3, z: 0.1 };

    const solved = solveHandToFingerBones(lm, "right");
    const audit = auditStudioVrmHandPoseAnatomy("right", solved);
    expect(audit.valid).toBe(true);
    expect(audit.reverseJointViolations).toBe(0);
    expect(audit.crossingPairs).toBe(0);
    expect(solved.rightLittleProximal![1]).toBeLessThanOrEqual(solved.rightRingProximal![1] + 1e-6);
  });
});

describe("3. 아이템·소품 소켓 영점 스냅 · 손바닥 법선 그립 정렬 · 모자 헤어 눌림 · 다축 리페어런팅", () => {
  it("17) 검·펜·컵·스마트폰·우산 손 소품의 그립 축이 손바닥 내측 법선에 0mm 관통·직교 정렬된다", () => {
    const cases = [
      { id: "sword", gripKind: "handle" as const, radius: 0.015, rawAxis: new THREE.Vector3(0.4, 0.7, 0.58) },
      { id: "pen", gripKind: "pinch" as const, radius: 0.005, rawAxis: new THREE.Vector3(0.3, 0.5, 0.8) },
      { id: "cup", gripKind: "cylinder" as const, radius: 0.036, rawAxis: new THREE.Vector3(0.1, 0.95, 0.28) },
      { id: "smartphone", gripKind: "flat" as const, radius: 0.008, rawAxis: new THREE.Vector3(-0.3, 0.6, 0.74) },
      { id: "umbrella", gripKind: "handle" as const, radius: 0.013, rawAxis: new THREE.Vector3(0.2, 0.85, -0.48) },
    ];
    const palmNormal = new THREE.Vector3(0, 1, 0);
    const palmForward = new THREE.Vector3(0, 0, 1);
    const palmCenter = new THREE.Vector3(0.2, 1.1, 0.05);
    for (const item of cases) {
      const aligned = alignStudioVrmPropGripToPalm({
        gripAxis: item.rawAxis,
        palmNormal,
        palmForward,
        palmCenter,
        gripRadius: item.radius,
        handSize: 0.08,
        side: "right",
        gripKind: item.gripKind,
      });
      expect(aligned.palmNormalOrthogonality, item.id).toBeLessThan(1e-6);
      expect(aligned.penetrationErrorMm, item.id).toBeLessThan(1e-6);
      expect(aligned.surfaceOffsetM, item.id).toBeGreaterThan(item.radius * 0.5);
    }
  });

  it("18) createStudioVrmGripContactTargets가 palmNormal 전달 시 손바닥 밀착 중심과 0mm 접점 반경을 계산한다", () => {
    const result = createStudioVrmGripContactTargets({
      center: new THREE.Vector3(0, 0, 0),
      axis: new THREE.Vector3(0.2, 0.6, 0.77),
      fallbackRadial: new THREE.Vector3(1, 0, 0),
      palmNormal: new THREE.Vector3(0, 1, 0),
      gripKind: "handle",
      fingertipWorldPositions: [
        new THREE.Vector3(0.03, 0.03, 0.02),
        new THREE.Vector3(0.03, 0.01, 0.02),
        new THREE.Vector3(0.03, -0.01, 0.02),
        new THREE.Vector3(0.03, -0.03, 0.02),
      ],
      gripRadius: 0.014,
      handSize: 0.08,
      side: "right",
    });
    expect(result).not.toBeNull();
    expect(result!.palmAxisOrthogonality).toBeLessThan(1e-6);
    expect(result!.alignedCenter!.y).toBeGreaterThan(0.014);
  });

  it("19) 모자·헬멧·베레모·비니 장착 시 Crown Compression이 자동 연동되고 안경·왕관·검은 비활성화된다", () => {
    for (const hatId of ["cap", "beanie", "beret", "surgicalCap", "blender_wizard_hat", "blender_tactical_helmet"]) {
      const comp = resolveStudioVrmHeadwearCrownCompression(hatId, "head", 1);
      expect(comp.active, hatId).toBe(true);
      expect(comp.compressionFactor, hatId).toBeGreaterThan(0.4);
      expect(comp.crownCeilingScale, hatId).toBeLessThan(0.95);
    }
    expect(resolveStudioVrmHeadwearCrownCompression("glasses", "head", 1).active).toBe(false);
    expect(resolveStudioVrmHeadwearCrownCompression("crown", "head", 1).active).toBe(false);
    expect(resolveStudioVrmHeadwearCrownCompression("cap", "rightHand", 1).active).toBe(false);

    const resolvedCap = resolvePropAttachment(
      propDefById("cap")!,
      createPropInstance("cap", "hat-comp")!,
      DEFAULT_VRM_PROP_RIG_METRICS,
    );
    expect(resolvedCap.crownCompression?.active).toBe(true);
    const resolvedGlasses = resolvePropAttachment(
      propDefById("glasses")!,
      createPropInstance("glasses", "gl-comp")!,
      DEFAULT_VRM_PROP_RIG_METRICS,
    );
    expect(resolvedGlasses.crownCompression).toBeUndefined();
  });

  it("20) 두피·코받침·귓불·어깨(망토)·손바닥 소켓 영점 스냅과 VRM0/VRM1 정면 부호 반전이 정확하다", () => {
    const metrics = { headRadius: 0.1, eyeDistance: 0.064, shoulderWidth: 0.36, handSize: 0.08 };
    const noseVrm1 = resolveStudioVrmEquipSocketSnap("nose-bridge", { ...metrics, frontSign: 1 });
    const noseVrm0 = resolveStudioVrmEquipSocketSnap("nose-bridge", { ...metrics, frontSign: -1 });
    expect(noseVrm1.localPosition[2]).toBeGreaterThan(0.09);
    expect(noseVrm0.localPosition[2]).toBeCloseTo(-noseVrm1.localPosition[2], 9);
    expect(noseVrm0.localRotationDeg[1]).toBe(180);

    const earL = resolveStudioVrmEquipSocketSnap("earlobe", metrics, "left");
    const earR = resolveStudioVrmEquipSocketSnap("earlobe", metrics, "right");
    expect(earL.localPosition[0]).toBeCloseTo(-earR.localPosition[0], 9);

    const cape = resolveStudioVrmEquipSocketSnap("shoulder-collar", metrics);
    expect(cape.localPosition[2]).toBeLessThan(0);
    expect(cape.localPosition[1]).toBeGreaterThan(0.04);
  });

  it("21) 부착 그래프에 귓불·정수리·망토 소켓 및 프리셋이 완비되고 영점 스냅이 모자 눌림을 함께 반환한다", () => {
    for (const id of ["ear-left-lobe", "ear-right-lobe", "head-crown", "shoulder-cape-collar"]) {
      expect(findStudioAttachmentSocket(id), id).toBeDefined();
    }
    const earNode = createStudioAttachmentNodeFromGripPreset({
      id: "earring-l",
      assetRevisionId: "ear-r1",
      presetId: "ear-wear",
      side: "left",
      parentNodeId: "head",
    });
    expect(earNode.parentSocket).toBe("ear-left-lobe");

    const capeNode = createStudioAttachmentNodeFromGripPreset({
      id: "cape",
      assetRevisionId: "cape-r1",
      presetId: "cape-drape",
      parentNodeId: "figure",
    });
    expect(capeNode.parentSocket).toBe("shoulder-cape-collar");

    const hatNode = createStudioAttachmentNodeFromGripPreset({
      id: "hat",
      assetRevisionId: "hat-r1",
      presetId: "head-wear",
      parentNodeId: "head",
    });
    const baseGraph: StudioAttachmentGraph = {
      version: 1,
      revision: 0,
      nodes: [
        {
          id: "head",
          kind: "head",
          assetRevisionId: "head-r1",
          localTransform: { position: { x: 0, y: 1.6, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
          constraints: [],
          visible: true,
          locked: false,
        },
        hatNode,
      ],
    };
    const snapped = snapStudioAttachmentNodeToEquipSocket({
      graph: baseGraph,
      nodeId: "hat",
      socketKind: "scalp",
      metrics: { headRadius: 0.105, eyeDistance: 0.064, shoulderWidth: 0.34, handSize: 0.08 },
      propId: "beanie",
    });
    expect(snapped.crownCompression.active).toBe(true);
    expect(snapped.graph.nodes[1]!.localTransform.position.y).toBeCloseTo(0.105 * 0.98, 6);
  });

  it("22) 다축 회전 부모(35°/-50°/25°)에서 reparentStudioAttachment가 월드 좌표를 0mm 오차로 보존한다", () => {
    const graph: StudioAttachmentGraph = {
      version: 1,
      revision: 0,
      nodes: [
        {
          id: "parent-tilted",
          kind: "figure",
          assetRevisionId: "fig-1",
          localTransform: {
            position: { x: 0.4, y: 1.2, z: -0.3 },
            rotation: { x: 35, y: -50, z: 25 },
            scale: { x: 1.1, y: 0.95, z: 1.05 },
          },
          constraints: [],
          visible: true,
          locked: false,
        },
        {
          id: "prop-item",
          kind: "prop",
          assetRevisionId: "prop-1",
          localTransform: {
            position: { x: 0.85, y: 1.55, z: 0.22 },
            rotation: { x: 10, y: 20, z: -15 },
            scale: { x: 1, y: 1, z: 1 },
          },
          constraints: [],
          visible: true,
          locked: false,
        },
      ],
    };
    const before = resolveStudioAttachmentWorldTransforms(graph).get("prop-item")!;
    const attached = reparentStudioAttachment(graph, "prop-item", "parent-tilted", "hand-right-grip");
    const after = resolveStudioAttachmentWorldTransforms(attached).get("prop-item")!;
    expect(after.position.x).toBeCloseTo(before.position.x, 9);
    expect(after.position.y).toBeCloseTo(before.position.y, 9);
    expect(after.position.z).toBeCloseTo(before.position.z, 9);
  });

  it("23) 자동 그립 권한 병합이 NaN 오염을 차단하고 해부학 15-DOF 권한 병합이 역관절을 제거한다", () => {
    const authored = createStudioVrmHandPose("right", "relaxed");
    const corrupted = { rightIndexProximal: [Number.NaN, 0, 0] as [number, number, number] };
    const safeMerged = resolveStudioVrmFingerAuthority(authored, corrupted);
    expect(safeMerged.rightIndexProximal).toEqual(authored.rightIndexProximal);

    const anatomical = resolveStudioVrmAnatomicalFingerAuthority(authored, {
      rightIndexProximal: [0, 0, -0.8],
    });
    expect(anatomical.rightIndexProximal![2]).toBeGreaterThanOrEqual(0);
  });

  it("24) 소품 자동 그립(검·머그·연필)이 엄지 CMC X축 대립을 활성화하고 좌우 대칭을 유지한다", () => {
    const metrics = measureVrmPropRigMetrics(makeSyntheticVrmForGrip());
    const rightSword = createPropInstance("sword", "sw-r")!;
    rightSword.rig = { ...rightSword.rig!, secondary: { ...rightSword.rig!.secondary!, enabled: false } };
    const leftSword = createPropInstance("sword", "sw-l")!;
    leftSword.bone = "leftHand";
    leftSword.rig = { ...leftSword.rig!, secondary: { ...leftSword.rig!.secondary!, enabled: false } };
    const overrides = createAutoGripFingerOverrides([rightSword, leftSword], propDefById, metrics);
    expect(overrides.rightThumbMetacarpal![0]).toBeGreaterThan(0.08);
    expect(overrides.leftThumbMetacarpal![0]).toBeCloseTo(overrides.rightThumbMetacarpal![0], 9);
    expect(overrides.leftThumbMetacarpal![1]).toBeCloseTo(-overrides.rightThumbMetacarpal![1], 9);
  });
});

describe("4. 12감정 표정 전이 · 음성 립싱크 Blendshape 관통 클램프 · 팔/어깨 볼륨 보정 · 통합 감사", () => {
  it("25) 12감정 S-커브 전이가 오버슈트 없이 단조 수렴하고 경계값(0, 1)을 정확히 재현한다", () => {
    expect(STUDIO_VRM_12_EMOTIONS).toHaveLength(12);
    const atStart = transitionStudioVrmExpression12({ happy: 0.9, shy: 0.4 }, { crying: 0.85, sad: 0.5 }, 0);
    const atMid = transitionStudioVrmExpression12({ happy: 0.9, shy: 0.4 }, { crying: 0.85, sad: 0.5 }, 0.5);
    const atEnd = transitionStudioVrmExpression12({ happy: 0.9, shy: 0.4 }, { crying: 0.85, sad: 0.5 }, 1);
    expect(atStart.happy).toBeCloseTo(0.9, 9);
    expect(atMid.happy).toBeCloseTo(0.45, 9);
    expect(atEnd.happy).toBe(0);
    expect(atEnd.crying).toBeCloseTo(0.85, 9);
    for (const key of STUDIO_VRM_12_EMOTIONS) {
      expect(atMid[key]).toBeGreaterThanOrEqual(0);
      expect(atMid[key]).toBeLessThanOrEqual(1);
    }
  });

  it("26) 12감정 + 동시 다중 발화 비젬(aa+oh+ou) 합성 시 입 변형 예산과 비젬 합계를 엄격 클램프한다", () => {
    const result = resolveStudioVrmLipSyncExpressionBlend(
      { happy: 1, surprised: 1, crying: 0.7 },
      { aa: 1, oh: 0.9, ou: 0.8 },
      { blink: 0.4 },
    );
    expect(result.clampedMouth).toBe(true);
    expect(result.visemeSum).toBeLessThanOrEqual(1.0001);
    expect(result.mouthBudgetLoad).toBeLessThanOrEqual(1.1501);
    // 발화 명료도 우선: 입 모양 비젬이 0으로 눌리지 않는다.
    expect(result.channels.aa).toBeGreaterThan(0.25);
  });

  it("27) 졸림(sleepy) + 미소(happy) + 눈 깜빡임(blink=1) 동시 적용 시 눈꺼풀 관통 예산 <= 1.0 을 지킨다", () => {
    const result = resolveStudioVrmLipSyncExpressionBlend(
      { sleepy: 1, happy: 0.9 },
      {},
      { blink: 1, blinkLeft: 1, blinkRight: 1 },
    );
    expect(result.clampedEyelid).toBe(true);
    expect(result.eyelidBudgetLoad).toBeLessThanOrEqual(1.0001);
  });

  it("28) 12감정 각각이 유효한 [0, 1] VRM 표정 채널 출력을 생성하며 NaN 입력을 방어한다", () => {
    for (const emotion of STUDIO_VRM_12_EMOTIONS) {
      const res = resolveStudioVrmLipSyncExpressionBlend({ [emotion]: 0.85 }, { aa: Number.NaN });
      const activeSum = Object.values(res.channels).reduce((acc, value) => acc + value, 0);
      expect(activeSum, emotion).toBeGreaterThan(0.2);
      expect(Object.values(res.channels).every((value) => Number.isFinite(value) && value >= 0 && value <= 1), emotion).toBe(true);
    }
  });

  it("29) 팔·어깨 중립 자세(0°, 0°)는 볼륨 왜곡 0이며, 거상·굽힘 시 삼각근·이두근·소매 여유가 부드럽게 증가한다", () => {
    const neutral = resolveStudioVrmJointVolumeCompensation({
      left: { shoulderRaiseDeg: 0, elbowFlexDeg: 0 },
      right: { shoulderRaiseDeg: 0, elbowFlexDeg: 0 },
    });
    expect(neutral.left.deltoidVolumeScale).toBe(1);
    expect(neutral.left.bicepBulgeScale).toBe(1);
    expect(neutral.left.axillaSleeveClearanceM).toBe(0);
    expect(neutral.left.elbowCreaseReliefM).toBe(0);
    expect(neutral.left.clavicleLiftRad).toBe(0);

    const action = resolveStudioVrmJointVolumeCompensation({
      left: { shoulderRaiseDeg: 145, elbowFlexDeg: 128, garmentThicknessM: 0.006 },
      right: { shoulderRaiseDeg: 75, elbowFlexDeg: 60, garmentThicknessM: 0.004 },
    });
    expect(action.left.deltoidVolumeScale).toBeGreaterThan(action.right.deltoidVolumeScale);
    expect(action.left.bicepBulgeScale).toBeGreaterThan(action.right.bicepBulgeScale);
    expect(action.left.clavicleLiftRad).toBeGreaterThan(0.2);
    expect(action.left.axillaSleeveClearanceM).toBeGreaterThan(0.01);
    expect(action.left.elbowCreaseReliefM).toBeGreaterThan(0.008);
  });

  it("30) 통합 품질 감사(auditStudioVrmHairHandEquipQuality)가 정상 파이프라인을 100% 통과로 판정한다", () => {
    const hairScalpReport = fitStudioVrmHairScalpCap(
      [[0, 0.21, 0.04], [0.09, 0.11, 0.02], [0, 0.02, -0.08]],
      { center: [0, 0.1, 0], radiusX: 0.1, radiusY: 0.115, radiusZ: 0.105 },
      { crownCompression: 0.68 },
    );
    const colliders = buildStudioVrmHairBodyColliders({
      headCenter: [0, 1.62, 0], headRadius: 0.1,
      neckBase: [0, 1.44, 0], neckTop: [0, 1.54, 0],
      leftShoulder: [0.19, 1.42, 0], rightShoulder: [-0.19, 1.42, 0],
    });
    const hairColliderReport = resolveStudioVrmHairColliderPushout(
      [{ worldRest: [0, 1.72, -0.02], hitRadius: 0.01 }, { worldRest: [0, 1.49, -0.02], hitRadius: 0.01 }],
      colliders,
    );
    const handAudit = auditStudioVrmHandPoseAnatomy("right", createStudioVrmHandPose("right", "holding"));
    const palmAlignment = alignStudioVrmPropGripToPalm({
      gripAxis: new THREE.Vector3(0.3, 0.8, 0.5),
      palmNormal: new THREE.Vector3(0, 1, 0),
      palmForward: new THREE.Vector3(0, 0, 1),
      palmCenter: new THREE.Vector3(0, 1.1, 0),
      gripRadius: 0.015,
      handSize: 0.08,
      side: "right",
      gripKind: "handle",
    });
    const crownCompression = resolveStudioVrmHeadwearCrownCompression("cap", "head", 1);
    const expressionBlend = resolveStudioVrmLipSyncExpressionBlend({ happy: 0.8 }, { aa: 0.7 }, { blink: 0.2 });
    const armVolume = resolveStudioVrmJointVolumeCompensation({
      left: { shoulderRaiseDeg: 90, elbowFlexDeg: 95 },
      right: { shoulderRaiseDeg: 120, elbowFlexDeg: 110 },
    });

    const report = auditStudioVrmHairHandEquipQuality({
      hairScalpReport,
      hairColliderReport,
      handAudit,
      palmAlignment,
      crownCompression,
      expressionBlend,
      armVolume,
    });
    expect(report.overallPass).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.hairPenetrationMm).toBe(0);
    expect(report.hairColliderPenetrationMm).toBe(0);
    expect(report.propContactErrorMm).toBeLessThan(1e-5);
    expect(report.crownCompressionActive).toBe(true);
  });

  it("31) 통합 품질 감사가 합성 관통·역관절·표정 예산 초과 결함을 누락 없이 적발한다", () => {
    const failed = auditStudioVrmHairHandEquipQuality({
      hairScalpReport: { vertices: [], maxPenetrationMm: 3.5, maxFloatMm: 2, compressedVertexCount: 0 },
      hairColliderReport: { positions: [], pushedJointCount: 0, residualPenetrationMm: 2.1 },
      handAudit: { valid: false, reverseJointViolations: 2, crossingPairs: 1, dipPipMaxError: 0.4, thumbCmcActive: false },
      palmAlignment: {
        alignedGripAxis: new THREE.Vector3(0, 1, 0),
        contactCenter: new THREE.Vector3(),
        alignmentQuaternion: new THREE.Quaternion(),
        surfaceOffsetM: 0.01,
        palmNormalOrthogonality: 0.5,
        penetrationErrorMm: 4.2,
      },
      crownCompression: { active: false, compressionFactor: 0, crownCeilingScale: 1, affectedLatitudeMin: 1 },
      expressionBlend: { channels: {}, visemeSum: 1.5, mouthBudgetLoad: 2.1, eyelidBudgetLoad: 1.3, clampedMouth: false, clampedEyelid: false },
      armVolume: {
        left: { deltoidVolumeScale: 1, axillaSleeveClearanceM: 0, clavicleLiftRad: 0, bicepBulgeScale: 1, elbowCreaseReliefM: 0, sleeveFoldTension: 0 },
        right: { deltoidVolumeScale: 1, axillaSleeveClearanceM: 0, clavicleLiftRad: 0, bicepBulgeScale: 1, elbowCreaseReliefM: 0, sleeveFoldTension: 0 },
      },
    });
    expect(failed.overallPass).toBe(false);
    expect(failed.issues.length).toBeGreaterThanOrEqual(5);
  });

  it("32) 의상 두께 변화에 따라 팔·어깨 소매 여유가 단조 증가하고 안전 상한(<=20mm/16mm)을 지킨다", () => {
    const thin = resolveStudioVrmJointVolumeCompensation({
      left: { shoulderRaiseDeg: 130, elbowFlexDeg: 120, garmentThicknessM: 0.002 },
      right: { shoulderRaiseDeg: 130, elbowFlexDeg: 120, garmentThicknessM: 0.012 },
    });
    expect(thin.right.axillaSleeveClearanceM).toBeGreaterThan(thin.left.axillaSleeveClearanceM);
    expect(thin.right.elbowCreaseReliefM).toBeGreaterThan(thin.left.elbowCreaseReliefM);
    expect(thin.right.axillaSleeveClearanceM).toBeLessThanOrEqual(0.02);
    expect(thin.right.elbowCreaseReliefM).toBeLessThanOrEqual(0.016);
  });
});
