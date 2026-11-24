import { describe, expect, it } from "vitest";

import { resolveCharacterShaperGazeForPosePreset } from "../character-shaper/character-shaper-camera-runtime";
import {
  EXPRESSION_PRESETS,
  EXTRA_POSE_PRESETS,
  NATURAL_IDLE_POSES,
  naturalIdleSeed,
  pickNaturalIdlePose,
  POSER_FINGER_BONES,
  POSER_KNOWN_BONES,
  RELAXED_FINGER_CURL_MAX_DEG,
  RELAXED_FINGER_CURL_MIN_DEG,
  VRM_STANDARD_EXPRESSIONS,
  type PoseDirectionTarget,
  type PoseGazeIntent,
  type PoseVec3,
  type StudioPosePreset,
} from "../studio-pose-presets";
import { clampStudioVrmJointRotation } from "./studio-vrm-joint-limits";
import { POSE_PRESETS } from "./studio-vrm-poser-utils";
import { computeLightingUniforms, serializeFullVrmState, type BodyScale, type LightingParams } from "./studio-vrm-poser-utils";

import type { VRMHumanBoneName } from "@pixiv/three-vrm";

// tests for new pure helpers (imported from utils to exercise)

const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const HEAD_BONES = new Set(["neck", "head"]);
const TORSO_BONES = new Set(["spine", "chest"]);
const ROOT_BONES = new Set(["hips"]);

function directionTuple(direction: PoseDirectionTarget | undefined) {
  if (!direction) return undefined;
  if ("sideX" in direction) return [direction.sideX, direction.y, direction.z ?? 0];
  const [x, y, z] = direction as PoseVec3;
  return [x, y, z];
}

// 오른쪽 본 스펙이 왼쪽의 "완전 미러"인지 판정 — 미러가 아니면 비대칭으로 본다.
// sideX 방향 타깃은 포저가 좌우를 자동 반전하므로 동일 스펙 = 대칭, 회전은 [x, -y, -z] 미러.
function isMirroredPair(pose: StudioPosePreset, leftName: VRMHumanBoneName, rightName: VRMHumanBoneName) {
  const leftSpec = pose.bones[leftName];
  const rightSpec = pose.bones[rightName];
  if (!leftSpec || !rightSpec) return leftSpec === rightSpec;

  const mirrorRotation = (rotation: PoseVec3 | undefined) => (rotation ? [rotation[0], -rotation[1], -rotation[2]] : undefined);
  const leftJson = JSON.stringify({
    direction: directionTuple(leftSpec.direction),
    rotation: mirrorRotation(leftSpec.rotation),
  });
  const rightJson = JSON.stringify({
    direction: directionTuple(rightSpec.direction),
    rotation: rightSpec.rotation ? [...rightSpec.rotation] : undefined,
  });
  return leftJson === rightJson;
}

describe("확장 포즈 프리셋(studio-pose-presets)", () => {
  it("provides at least 20 presets with unique ids that do not collide with builtin poses", () => {
    expect(EXTRA_POSE_PRESETS.length).toBeGreaterThanOrEqual(25);
    const ids = EXTRA_POSE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const builtinIds = new Set(POSE_PRESETS.map((p) => p.id));
    for (const id of ids) {
      expect(builtinIds.has(id), `builtin collision: ${id}`).toBe(false);
    }
  });

  it("labels every preset with Korean label and tone", () => {
    for (const pose of EXTRA_POSE_PRESETS) {
      expect(pose.label.trim().length).toBeGreaterThan(0);
      expect(pose.tone.trim().length).toBeGreaterThan(0);
    }
  });

  it("only references bones the poser knows how to apply", () => {
    const known = new Set<string>(POSER_KNOWN_BONES);
    for (const pose of EXTRA_POSE_PRESETS) {
      for (const boneName of Object.keys(pose.bones)) {
        expect(known.has(boneName), `${pose.id} uses unknown bone ${boneName}`).toBe(true);
      }
    }
  });

  it("gives every bone spec a usable direction or rotation", () => {
    for (const pose of EXTRA_POSE_PRESETS) {
      for (const [boneName, spec] of Object.entries(pose.bones)) {
        const hasRotation = Array.isArray(spec.rotation) && spec.rotation.length === 3;
        const direction = spec.direction;
        let hasDirection = false;
        if (direction) {
          // Array.isArray는 readonly 튜플(PoseVec3)을 else 분기에서 좁히지 못한다 — `in` 연산자로 유니온을 판별.
          if ("sideX" in direction) {
            hasDirection = Math.hypot(direction.sideX, direction.y, direction.z ?? 0) > 0.01;
          } else {
            const [x, y, z] = direction as PoseVec3;
            hasDirection = Math.hypot(x, y, z) > 0.01;
          }
        }
        expect(hasRotation || hasDirection, `${pose.id}:${boneName} empty spec`).toBe(true);
      }
    }
  });

  it("keeps core rotations within comic-panel safe ranges", () => {
    const violations = EXTRA_POSE_PRESETS.flatMap((pose) =>
      Object.entries(pose.bones).flatMap(([boneName, spec]) => {
        if (!spec.rotation) return [];
        const limit = HEAD_BONES.has(boneName)
          ? 12
          : TORSO_BONES.has(boneName)
            ? 45
            : ROOT_BONES.has(boneName)
              ? 90
              : null;
        if (limit === null) return [];
        return spec.rotation.flatMap((radians, axis) => {
          const degrees = Math.round(toDegrees(radians));
          return Math.abs(degrees) > limit ? [`${pose.id}:${boneName}:${axis}:${degrees}`] : [];
        });
      })
    );
    expect(violations).toEqual([]);
  });

  it("keeps y-offsets within the poser stage range", () => {
    for (const pose of EXTRA_POSE_PRESETS) {
      expect(Math.abs(pose.yOffset ?? 0), `${pose.id} yOffset`).toBeLessThanOrEqual(0.6);
    }
  });

  it("covers the ComiPo-style staple poses", () => {
    const ids = new Set(EXTRA_POSE_PRESETS.map((p) => p.id));
    for (const required of [
      "xp_idle_relax",
      "xp_hands_on_hips",
      "xp_one_hand_hip",
      "xp_sprint",
      "xp_chair_sit",
      "xp_kneel",
      "xp_finger_heart",
      "xp_double_v",
      "xp_point_you",
      "xp_shock_hands",
      "xp_teary",
      "xp_banzai",
      "xp_guard_up",
      "xp_shrug",
      "xp_phone_look",
      "xp_chin_rest",
      "xp_polite_bow",
      "xp_jump_joy",
      "xp_look_back",
      "xp_lying_down",
    ]) {
      expect(ids.has(required), `missing pose ${required}`).toBe(true);
    }
  });
});

describe("자연 아이들 포즈(NATURAL_IDLE_POSES)", () => {
  const SIDE_PAIRS: ReadonlyArray<readonly [VRMHumanBoneName, VRMHumanBoneName]> = [
    ["leftShoulder", "rightShoulder"],
    ["leftUpperArm", "rightUpperArm"],
    ["leftLowerArm", "rightLowerArm"],
    ["leftHand", "rightHand"],
    ["leftUpperLeg", "rightUpperLeg"],
    ["leftLowerLeg", "rightLowerLeg"],
    ["leftFoot", "rightFoot"],
  ];

  it("provides 3-4 spawn idle variants with unique non-colliding ids", () => {
    expect(NATURAL_IDLE_POSES.length).toBeGreaterThanOrEqual(3);
    expect(NATURAL_IDLE_POSES.length).toBeLessThanOrEqual(9);

    const ids = NATURAL_IDLE_POSES.map((pose) => pose.id);
    expect(new Set(ids).size).toBe(ids.length);

    const otherIds = new Set([...POSE_PRESETS.map((pose) => pose.id), ...EXTRA_POSE_PRESETS.map((pose) => pose.id)]);
    for (const id of ids) {
      expect(otherIds.has(id), `id collision: ${id}`).toBe(false);
    }

    for (const pose of NATURAL_IDLE_POSES) {
      expect(pose.label.trim().length).toBeGreaterThan(0);
      expect(pose.tone.trim().length).toBeGreaterThan(0);
    }
  });

  it("only references bones the poser can apply and keeps rotations in safe ranges", () => {
    const known = new Set<string>(POSER_KNOWN_BONES);
    for (const pose of NATURAL_IDLE_POSES) {
      expect(Math.abs(pose.yOffset ?? 0)).toBeLessThanOrEqual(0.2);
      for (const [boneName, spec] of Object.entries(pose.bones)) {
        expect(known.has(boneName), `${pose.id} uses unknown bone ${boneName}`).toBe(true);
        if (!spec.rotation) continue;
        const limit = HEAD_BONES.has(boneName) ? 12 : TORSO_BONES.has(boneName) ? 45 : ROOT_BONES.has(boneName) ? 90 : 65;
        for (const radians of spec.rotation) {
          expect(Math.abs(toDegrees(radians)), `${pose.id}:${boneName}`).toBeLessThanOrEqual(limit);
        }
      }
    }
  });

  it("builds contrapposto weight-shift with explicit left-right asymmetry", () => {
    const idles = NATURAL_IDLE_POSES.slice(0, 4);
    for (const pose of idles) {
      // 골반 2~4° 기울임 + 척추/가슴이 반대 방향으로 카운터 회전.
      const hipsRoll = toDegrees(pose.bones.hips?.rotation?.[2] ?? 0);
      expect(Math.abs(hipsRoll), `${pose.id} hips roll`).toBeGreaterThanOrEqual(1.9);
      expect(Math.abs(hipsRoll)).toBeLessThanOrEqual(4.1);

      const counterRoll = toDegrees((pose.bones.spine?.rotation?.[2] ?? 0) + (pose.bones.chest?.rotation?.[2] ?? 0));
      expect(Math.sign(counterRoll), `${pose.id} spine/chest counter`).toBe(-Math.sign(hipsRoll));

      // 머리 2~4° 기울임.
      const headRoll = Math.abs(toDegrees(pose.bones.head?.rotation?.[2] ?? 0));
      expect(headRoll, `${pose.id} head roll`).toBeGreaterThanOrEqual(1.9);
      expect(headRoll).toBeLessThanOrEqual(4.1);

      // 어깨 내림 3~5° (정규화 본: 왼쪽 -z / 오른쪽 +z).
      const leftShoulderRoll = toDegrees(pose.bones.leftShoulder?.rotation?.[2] ?? 0);
      const rightShoulderRoll = toDegrees(pose.bones.rightShoulder?.rotation?.[2] ?? 0);
      expect(leftShoulderRoll, `${pose.id} left shoulder`).toBeLessThanOrEqual(-2.9);
      expect(leftShoulderRoll).toBeGreaterThanOrEqual(-5.1);
      expect(rightShoulderRoll, `${pose.id} right shoulder`).toBeGreaterThanOrEqual(2.9);
      expect(rightShoulderRoll).toBeLessThanOrEqual(5.1);

      // 손목 1~2° — 편안한 차렷(과도한 롤은 한쪽 손목이 꺾여 보임).
      for (const handName of ["leftHand", "rightHand"] as const) {
        const wristRoll = Math.abs(toDegrees(pose.bones[handName]?.rotation?.[2] ?? 0));
        expect(wristRoll, `${pose.id} ${handName} wrist`).toBeGreaterThanOrEqual(1);
        expect(wristRoll).toBeLessThanOrEqual(2.5);
      }

      // 좌우 본 회전 불일치(비대칭 필수) — 미러 대칭 쌍이 아니어야 한다.
      const asymmetricPairs = SIDE_PAIRS.filter(([left, right]) => !isMirroredPair(pose, left, right));
      expect(asymmetricPairs.length, `${pose.id} asymmetric pairs`).toBeGreaterThanOrEqual(4);
      expect(isMirroredPair(pose, "leftLowerArm", "rightLowerArm"), `${pose.id} arms must differ`).toBe(false);
      expect(isMirroredPair(pose, "leftUpperLeg", "rightUpperLeg"), `${pose.id} legs must differ`).toBe(false);
    }
  });

  it("relaxes elbows by 10-18 degrees", () => {
    const angleBetweenDeg = (a: number[], b: number[]) => {
      const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const len = Math.hypot(...a) * Math.hypot(...b);
      return (Math.acos(Math.min(1, Math.max(-1, dot / len))) * 180) / Math.PI;
    };

    for (const pose of NATURAL_IDLE_POSES) {
      for (const side of ["left", "right"] as const) {
        const upper = directionTuple(pose.bones[`${side}UpperArm`]?.direction);
        const lower = directionTuple(pose.bones[`${side}LowerArm`]?.direction);
        expect(upper, `${pose.id} ${side} upper arm`).toBeDefined();
        expect(lower, `${pose.id} ${side} lower arm`).toBeDefined();
        if (!upper || !lower) continue;
        const bend = angleBetweenDeg(upper, lower);
        expect(bend, `${pose.id} ${side} elbow bend`).toBeGreaterThanOrEqual(10);
        expect(bend).toBeLessThanOrEqual(18);
      }
    }
  });

  it("includes relaxed finger curls (open comfortable-attention range) in every idle pose", () => {
    for (const pose of NATURAL_IDLE_POSES) {
      for (const boneName of POSER_FINGER_BONES) {
        const rotation = pose.bones[boneName]?.rotation;
        expect(rotation, `${pose.id} missing finger ${boneName}`).toBeDefined();
        if (!rotation) continue;

        if (boneName.includes("Thumb")) {
          for (const radians of rotation) {
            expect(Math.abs(toDegrees(radians)), `${pose.id}:${boneName}`).toBeLessThanOrEqual(RELAXED_FINGER_CURL_MAX_DEG + 0.1);
          }
          continue;
        }

        // 프리셋 데이터는 좌우 모두 local +Z curl. 모델별 축 반전은 applyFingerRotations 가 보정한다.
        const curlDeg = toDegrees(rotation[2]);
        expect(curlDeg, `${pose.id}:${boneName} curl`).toBeGreaterThanOrEqual(RELAXED_FINGER_CURL_MIN_DEG - 0.1);
        expect(curlDeg).toBeLessThanOrEqual(RELAXED_FINGER_CURL_MAX_DEG + 0.1);
      }
    }
  });

  it("picks idle poses deterministically from the character id (no RNG)", () => {
    const sampleIds = [
      "sample-vrm",
      "avatar-a",
      "avatar-b",
      "avatar-c",
      "shion",
      "vivi",
      "vita",
      "rubin",
      "orion",
      "cryptovoxel",
      "meebit",
      "seedsan",
      "shino",
      "fumi",
      "kage",
      "hera",
      "haru",
      "mio",
      "noa",
      "alicia",
    ];

    const firstRun = sampleIds.map((id) => pickNaturalIdlePose(id).id);
    const secondRun = sampleIds.map((id) => pickNaturalIdlePose(id).id);
    expect(secondRun).toEqual(firstRun);

    const validIds = new Set(NATURAL_IDLE_POSES.map((pose) => pose.id));
    for (const poseId of firstRun) {
      expect(validIds.has(poseId)).toBe(true);
    }

    // 캐릭터마다 결정적으로 분산 — 모든 캐릭터가 한 포즈에 몰리면 안 된다.
    expect(new Set(firstRun).size).toBeGreaterThanOrEqual(2);
    expect(naturalIdleSeed("kage")).toBe(naturalIdleSeed("kage"));
    expect(validIds.has(pickNaturalIdlePose("").id)).toBe(true);
  });
});

describe("기존 프리셋 자연화 패스", () => {
  it("keeps intentionally symmetric presets symmetric and naturalized ones asymmetric", () => {
    const byId = new Map(EXTRA_POSE_PRESETS.map((pose) => [pose.id, pose]));

    // 의도적 대칭(만세·양손 브이·공손한 목례)은 좌우 미러 대칭을 유지한다.
    for (const id of ["xp_banzai", "xp_double_v", "xp_polite_bow"]) {
      const pose = byId.get(id);
      expect(pose, `missing pose ${id}`).toBeDefined();
      if (!pose) continue;
      expect(isMirroredPair(pose, "leftUpperArm", "rightUpperArm"), `${id} should stay symmetric`).toBe(true);
      expect(isMirroredPair(pose, "leftLowerArm", "rightLowerArm"), `${id} should stay symmetric`).toBe(true);
    }

    // 자연화 패스가 적용된 프리셋은 좌우 미세 비대칭을 가진다.
    for (const id of ["xp_hands_on_hips", "xp_chair_sit", "xp_kneel", "xp_shock_hands", "xp_teary", "xp_guard_up", "xp_shrug", "xp_jump_joy", "xp_lying_down", "xp_hands_behind"]) {
      const pose = byId.get(id);
      expect(pose, `missing pose ${id}`).toBeDefined();
      if (!pose) continue;
      const asymmetric = !isMirroredPair(pose, "leftUpperArm", "rightUpperArm") || !isMirroredPair(pose, "leftLowerArm", "rightLowerArm");
      expect(asymmetric, `${id} should be micro-asymmetric`).toBe(true);
    }
  });

  it("Wave 33B: 손들어 인사는 쇄골 상승·콘트라포스토·정면 손바닥을, 스마트폰 보기는 완화 손목·자연 시선 의도를 가진다", () => {
    const byId = new Map(EXTRA_POSE_PRESETS.map((pose) => [pose.id, pose]));
    const wave = byId.get("xp_wave_greeting")!;
    expect(toDegrees(wave.bones.rightShoulder?.rotation?.[2] ?? 0)).toBeLessThanOrEqual(-10);
    expect(Math.abs(toDegrees(wave.bones.hips?.rotation?.[2] ?? 0))).toBeGreaterThanOrEqual(2);
    expect(Math.sign((wave.bones.spine?.rotation?.[2] ?? 0) + (wave.bones.chest?.rotation?.[2] ?? 0)))
      .toBe(-Math.sign(wave.bones.hips?.rotation?.[2] ?? 0));
    expect(toDegrees(wave.bones.rightHand?.rotation?.[0] ?? 0)).toBeLessThan(-50);
    expect(wave.gazeIntent?.target).toBe("camera");

    const phone = byId.get("xp_phone_look")!;
    expect(Math.abs(toDegrees(phone.bones.leftHand?.rotation?.[1] ?? 0))).toBeLessThanOrEqual(8);
    expect(Math.abs(toDegrees(phone.bones.rightHand?.rotation?.[1] ?? 0))).toBeLessThanOrEqual(8);
    expect(toDegrees(phone.bones.rightHand?.rotation?.[0] ?? 0)).toBeLessThan(-65);
    expect(phone.gazeIntent).toMatchObject({ target: "hands" });
    expect(phone.gazeIntent!.pitchDeg).toBeLessThan(-15);
    expect(phone.gazeIntent!.convergence).toBeGreaterThan(0.5);
  });
});

describe("표정 프리셋(EXPRESSION_PRESETS)", () => {
  it("provides at least 12 presets with unique ids", () => {
    expect(EXPRESSION_PRESETS.length).toBeGreaterThanOrEqual(12);
    const ids = EXPRESSION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses only VRM standard expression names with weights in 0..1", () => {
    const standard = new Set(VRM_STANDARD_EXPRESSIONS);
    for (const preset of EXPRESSION_PRESETS) {
      for (const [name, weight] of Object.entries(preset.weights)) {
        expect(standard.has(name), `${preset.id} uses non-standard expression ${name}`).toBe(true);
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      }
    }
  });

  it("labels every preset with Korean label, emoji and tone", () => {
    for (const preset of EXPRESSION_PRESETS) {
      expect(preset.label.trim().length).toBeGreaterThan(0);
      expect(preset.emoji.trim().length).toBeGreaterThan(0);
      expect(preset.tone.trim().length).toBeGreaterThan(0);
    }
  });

  it("covers the requested core emotions", () => {
    const labels = EXPRESSION_PRESETS.map((p) => p.label).join(" ");
    for (const required of ["기쁨", "활짝웃음", "슬픔", "눈물", "분노", "킹받음", "놀람", "멍", "부끄러움", "윙크", "졸림", "무표정"]) {
      expect(labels).toContain(required);
    }
  });

  it("new assets: expressions >=18 , extra poses >=47 after expansion", () => {
    expect(EXPRESSION_PRESETS.length).toBeGreaterThanOrEqual(18);
    expect(EXTRA_POSE_PRESETS.length).toBeGreaterThanOrEqual(47);
  });
});

describe("new poser helpers (finger/scale/lighting/fullstate)", () => {
  it("body scale normalizes", () => {
    // pure data transform test via serialize
    const s = serializeFullVrmState({ bodyScale: {height: 1.3, width: 0.9} as BodyScale });
    expect(s.bodyScale?.height).toBe(1.3);
  });
  it("lighting uniforms in range", () => {
    const u = computeLightingUniforms({ intensity: 2.5, colorTemp: 0.8, directionDeg: 90 } as LightingParams);
    expect(u.intensity).toBeGreaterThan(2);
    expect(u.color.length).toBe(3);
  });
  it("full state serializes new fields", () => {
    const full = serializeFullVrmState({ lighting: {intensity:1.5} as any, env: "floor" as any });
    expect(full.version).toBe(3);
    expect(full.lighting?.intensity).toBe(1.5);
  });
});

describe("Wave 36C: 쇄골 연동·척추 S커브·손가락 곡률·시선 의도 회귀 검증", () => {
  const ALL_POSES: readonly StudioPosePreset[] = [...NATURAL_IDLE_POSES, ...EXTRA_POSE_PRESETS];
  const BY_ID = new Map(ALL_POSES.map((pose) => [pose.id, pose]));

  function armElevationDeg(direction: PoseDirectionTarget | undefined): number {
    const vec = directionTuple(direction);
    if (!vec) return 0;
    const len = Math.hypot(vec[0], vec[1], vec[2]);
    if (len <= 1e-6) return 0;
    return (Math.acos(Math.min(1, Math.max(-1, -vec[1] / len))) * 180) / Math.PI;
  }

  it("40° 초과 상완 거상 시 모든 프리셋이 해부학적 쇄골 상승(좌 +Z / 우 -Z, 8~18°)과 관절 한계를 준수한다", () => {
    let coupledCount = 0;
    for (const pose of ALL_POSES) {
      for (const side of ["left", "right"] as const) {
        const elev = armElevationDeg(pose.bones[`${side}UpperArm`]?.direction);
        const shoulderName = `${side}Shoulder` as const;
        const rot = pose.bones[shoulderName]?.rotation;
        expect(rot, `${pose.id}.${shoulderName} missing`).toBeDefined();
        if (!rot) continue;

        const clamped = clampStudioVrmJointRotation(shoulderName, rot);
        expect(rot[0], `${pose.id}.${shoulderName} X limit`).toBeCloseTo(clamped[0], 5);
        expect(rot[1], `${pose.id}.${shoulderName} Y limit`).toBeCloseTo(clamped[1], 5);
        expect(rot[2], `${pose.id}.${shoulderName} Z limit`).toBeCloseTo(clamped[2], 5);

        const sideSign = side === "left" ? 1 : -1;
        const liftDeg = sideSign * toDegrees(rot[2]);
        if (elev > 40) {
          coupledCount += 1;
          expect(liftDeg, `${pose.id}.${shoulderName} elev=${elev.toFixed(1)}°`).toBeGreaterThanOrEqual(7.9);
          expect(liftDeg, `${pose.id}.${shoulderName} elev=${elev.toFixed(1)}°`).toBeLessThanOrEqual(18.1);
        } else {
          // 자연 하수 팔(<=40°)은 과도한 으쓱 없이 이완(-5.1°..+0.1°) 범위를 유지한다.
          expect(liftDeg, `${pose.id}.${shoulderName} resting`).toBeGreaterThanOrEqual(-5.1);
          expect(liftDeg, `${pose.id}.${shoulderName} resting`).toBeLessThanOrEqual(0.1);
        }
      }
    }
    expect(coupledCount).toBeGreaterThanOrEqual(60);

    // 머리 위 만세/기지개/주먹 들기는 허리 손/스마트폰보다 쇄골 상승량이 명확히 크다.
    const banzaiLift = toDegrees(BY_ID.get("xp_banzai")!.bones.leftShoulder!.rotation![2]);
    const stretchLift = toDegrees(BY_ID.get("xp_stretch")!.bones.leftShoulder!.rotation![2]);
    const fistUpLift = -toDegrees(BY_ID.get("xp_fist_up")!.bones.rightShoulder!.rotation![2]);
    const hipsHandLift = toDegrees(BY_ID.get("xp_hands_on_hips")!.bones.leftShoulder!.rotation![2]);
    expect(banzaiLift).toBeGreaterThanOrEqual(15);
    expect(stretchLift).toBeGreaterThanOrEqual(15);
    expect(fistUpLift).toBeGreaterThanOrEqual(15);
    expect(banzaiLift).toBeGreaterThan(hipsHandLift + 4);
  });

  it("일상·감정·착석 포즈는 골반-척추 반대 기울임(콘트라포스토)과 S커브를 갖고, 의도적 정면 대칭 포즈는 수평을 유지한다", () => {
    const contrappostoIds = [
      "xp_wave_greeting", "xp_idle_relax", "xp_hands_on_hips", "xp_one_hand_hip",
      "xp_chair_sit", "xp_kneel", "xp_finger_heart", "xp_shrug", "xp_phone_look",
      "xp_chin_rest", "xp_hands_behind", "xp_thumbs_up", "xp_victory", "xp_phone_selfie",
      "xp_cool_lean", "xp_lean_wall", "xp_side_lean", "xp_wait_line", "xp_present",
      "xp_think_chin", "xp_blush_cover", "xp_hold_heart", "xp_teary", "xp_cry",
    ];
    for (const id of contrappostoIds) {
      const pose = BY_ID.get(id)!;
      expect(pose, `missing ${id}`).toBeDefined();
      const hipsRoll = toDegrees(pose.bones.hips?.rotation?.[2] ?? 0);
      const torsoCounterRoll = toDegrees(
        (pose.bones.spine?.rotation?.[2] ?? 0) + (pose.bones.chest?.rotation?.[2] ?? 0),
      );
      expect(Math.abs(hipsRoll), `${id} hips roll`).toBeGreaterThanOrEqual(0.9);
      expect(Math.sign(torsoCounterRoll), `${id} spine+chest counter roll`).toBe(-Math.sign(hipsRoll));
    }

    // 모든 확장 포즈는 최소 3개 이상의 코어 본(hips/spine/chest/neck/head)에 자연 회전을 가진다.
    const coreBones = ["hips", "spine", "chest", "neck", "head"] as const;
    for (const pose of EXTRA_POSE_PRESETS) {
      const activeCore = coreBones.filter((bone) =>
        (pose.bones[bone]?.rotation ?? [0, 0, 0]).some((rad) => Math.abs(rad) > 1e-4),
      );
      expect(activeCore.length, `${pose.id} wooden torso`).toBeGreaterThanOrEqual(3);
    }

    // 정면 대칭 포즈는 좌우 쏠림 없이 시상면 S커브/숙임만 유지한다.
    for (const id of ["xp_banzai", "xp_polite_bow", "xp_bow_deep", "xp_meditate", "xp_salutation"]) {
      const pose = BY_ID.get(id)!;
      expect(pose.bones.hips?.rotation?.[2] ?? 0, `${id} hips roll`).toBe(0);
      expect(pose.bones.spine?.rotation?.[2] ?? 0, `${id} spine roll`).toBe(0);
      expect(pose.bones.chest?.rotation?.[2] ?? 0, `${id} chest roll`).toBe(0);
    }

    // 양손 전방 작업/감정 포즈에서 오른팔이 등 뒤(z < 0)로 꺾이는 회귀가 없어야 한다.
    for (const id of [
      "xp_typing", "xp_reading", "xp_hug_self", "xp_guard", "xp_meditate",
      "xp_shock", "xp_laugh", "xp_victory", "xp_cheer_both", "xp_stretch",
    ]) {
      const pose = BY_ID.get(id)!;
      const leftZ = directionTuple(pose.bones.leftUpperArm?.direction)?.[2] ?? 0;
      const rightZ = directionTuple(pose.bones.rightUpperArm?.direction)?.[2] ?? 0;
      expect(leftZ, `${id} leftUpperArm.z`).toBeGreaterThan(0);
      expect(rightZ, `${id} rightUpperArm.z`).toBeGreaterThan(0);
    }
  });

  it("전체 72종 포즈에 30개 손가락 본이 채워지고 릴랙스·제스처 손가락 곡률 규약(+Z 굽힘)을 만족한다", () => {
    for (const pose of ALL_POSES) {
      for (const boneName of POSER_FINGER_BONES) {
        const rot = pose.bones[boneName]?.rotation;
        expect(rot, `${pose.id} missing ${boneName}`).toBeDefined();
        expect(rot?.every(Number.isFinite), `${pose.id}:${boneName} finite`).toBe(true);
      }
      for (const side of ["left", "right"] as const) {
        let nonThumbCurlSum = 0;
        for (const boneName of POSER_FINGER_BONES) {
          if (!boneName.startsWith(side) || boneName.includes("Thumb")) continue;
          const deg = toDegrees(pose.bones[boneName]!.rotation![2]);
          expect(deg, `${pose.id}:${boneName} hyperextended`).toBeGreaterThan(0);
          expect(deg, `${pose.id}:${boneName} over-flexed`).toBeLessThanOrEqual(96);
          nonThumbCurlSum += deg;
        }
        // 손가락 전체 합이 양수여야 applyFingerRotations의 극성 정렬과 일관되며 뻣뻣한 일자 손을 막는다.
        expect(nonThumbCurlSum, `${pose.id}:${side} curl sum`).toBeGreaterThan(60);
      }
    }

    // 주요 제스처 포즈 손 모양 검증
    for (const id of ["xp_guard_up", "xp_punch", "xp_fist_up", "xp_sprint", "xp_cheer_both"]) {
      const middlePip = toDegrees(BY_ID.get(id)!.bones.rightMiddleIntermediate!.rotation![2]);
      expect(middlePip, `${id} fist curl`).toBeGreaterThanOrEqual(75);
    }
    for (const id of ["xp_double_v", "xp_victory"]) {
      const pose = BY_ID.get(id)!;
      expect(toDegrees(pose.bones.rightIndexIntermediate!.rotation![2])).toBeLessThanOrEqual(10);
      expect(toDegrees(pose.bones.rightMiddleIntermediate!.rotation![2])).toBeLessThanOrEqual(10);
      expect(toDegrees(pose.bones.rightRingIntermediate!.rotation![2])).toBeGreaterThanOrEqual(75);
      expect(toDegrees(pose.bones.rightIndexProximal!.rotation![1])).toBeGreaterThan(5);
      expect(toDegrees(pose.bones.rightMiddleProximal!.rotation![1])).toBeLessThan(-2);
    }
    for (const id of ["xp_point_you", "xp_point_forward"]) {
      const pose = BY_ID.get(id)!;
      expect(toDegrees(pose.bones.rightIndexIntermediate!.rotation![2])).toBeLessThanOrEqual(10);
      expect(toDegrees(pose.bones.rightMiddleIntermediate!.rotation![2])).toBeGreaterThanOrEqual(75);
    }
    const thumbsUp = BY_ID.get("xp_thumbs_up")!;
    expect(toDegrees(thumbsUp.bones.rightIndexIntermediate!.rotation![2])).toBeGreaterThanOrEqual(75);
    expect(toDegrees(thumbsUp.bones.rightThumbMetacarpal!.rotation![1])).toBeLessThan(-10);

    // 릴랙스 기본 손 포즈는 RELAXED_FINGER_CURL_MIN_DEG..MAX_DEG 범위를 유지한다.
    for (const id of ["xp_idle_relax", "xp_chair_sit", "xp_hands_behind", "xp_polite_bow"]) {
      const pose = BY_ID.get(id)!;
      const middlePip = toDegrees(pose.bones.rightMiddleIntermediate!.rotation![2]);
      expect(middlePip, `${id} relaxed curl`).toBeGreaterThanOrEqual(RELAXED_FINGER_CURL_MIN_DEG - 0.1);
      expect(middlePip, `${id} relaxed curl`).toBeLessThanOrEqual(RELAXED_FINGER_CURL_MAX_DEG + 0.1);
    }
  });

  it("18종 이상 포즈에 연기 의도에 맞는 gazeIntent가 정의되고 CharacterShaper 시선 컨트롤러와 정합된다", () => {
    const withGaze = ALL_POSES.filter((pose) => Boolean(pose.gazeIntent));
    expect(withGaze.length).toBeGreaterThanOrEqual(18);

    const targets = new Set<PoseGazeIntent["target"]>();
    for (const pose of withGaze) {
      const intent = pose.gazeIntent!;
      targets.add(intent.target);
      expect(Number.isFinite(intent.pitchDeg), `${pose.id} pitch`).toBe(true);
      expect(Number.isFinite(intent.yawDeg), `${pose.id} yaw`).toBe(true);
      expect(intent.convergence, `${pose.id} convergence`).toBeGreaterThan(0);
      expect(intent.convergence, `${pose.id} convergence`).toBeLessThanOrEqual(1);

      const resolved = resolveCharacterShaperGazeForPosePreset(pose.id);
      expect(resolved, `${pose.id} resolved gaze`).not.toBeNull();
      if (intent.target === "camera") {
        expect(Math.abs(intent.yawDeg), `${pose.id} cam yaw`).toBeLessThanOrEqual(8);
        expect(Math.abs(intent.pitchDeg), `${pose.id} cam pitch`).toBeLessThanOrEqual(6);
        expect(resolved?.gazeMode).toBe("cam");
      } else {
        expect(Math.abs(intent.yawDeg), `${pose.id} world yaw`).toBeLessThanOrEqual(30);
        expect(Math.abs(intent.pitchDeg), `${pose.id} world pitch`).toBeLessThanOrEqual(24);
        expect(resolved?.gazeMode).toBe("world");
      }
    }
    expect(targets).toEqual(new Set(["camera", "hands", "down", "forward", "side"]));

    // 손 집중(폰·타이핑·요리·독서) -> world 하방 시선 + 높은 근거리 폭주
    for (const id of ["xp_phone_look", "xp_typing", "xp_cooking", "xp_reading"]) {
      const intent = BY_ID.get(id)!.gazeIntent!;
      expect(intent.target, id).toBe("hands");
      expect(intent.pitchDeg, id).toBeLessThanOrEqual(-15);
      expect(intent.convergence, id).toBeGreaterThanOrEqual(0.6);
      expect(resolveCharacterShaperGazeForPosePreset(id)?.gazeMode).toBe("world");
    }

    // 목례·울먹임·슬픔·졸음·기도성 하향 시선 -> down + 음수 피치
    for (const id of ["xp_polite_bow", "xp_bow_deep", "xp_teary", "xp_cry", "xp_sad_sit", "xp_sleep_stand", "xp_hug_self", "xp_kneel", "xp_meditate"]) {
      const intent = BY_ID.get(id)!.gazeIntent!;
      expect(intent.target, id).toBe("down");
      expect(intent.pitchDeg, id).toBeLessThanOrEqual(-10);
      expect(resolveCharacterShaperGazeForPosePreset(id)?.gazeOffset.pitchDeg).toBeLessThanOrEqual(-10);
    }

    // 곁눈질·뒤돌아보기·고민·부끄러움·궁수·잠입 -> side + 명확한 측면 요
    for (const id of ["xp_look_back", "xp_archer", "xp_sneak", "xp_chin_rest", "xp_think_chin", "xp_blush_cover", "xp_lean_wall", "xp_side_lean"]) {
      const intent = BY_ID.get(id)!.gazeIntent!;
      expect(intent.target, id).toBe("side");
      expect(Math.abs(intent.yawDeg), id).toBeGreaterThanOrEqual(12);
      expect(Math.abs(resolveCharacterShaperGazeForPosePreset(id)?.gazeOffset.yawDeg ?? 0)).toBeGreaterThanOrEqual(12);
    }

    // 인사·셀카·자신감·착석 카메라 시선 -> cam 모드
    for (const id of ["xp_wave_greeting", "xp_finger_heart", "xp_double_v", "xp_phone_selfie", "xp_thumbs_up", "xp_victory", "xp_hands_on_hips", "xp_chair_sit"]) {
      expect(BY_ID.get(id)!.gazeIntent?.target, id).toBe("camera");
      expect(resolveCharacterShaperGazeForPosePreset(id)?.gazeMode, id).toBe("cam");
    }
  });
});
