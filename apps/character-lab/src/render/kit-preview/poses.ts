/**
 * 포즈 프리셋·사용자 포즈 해석(순수). 변형 테스트(팔 올림·팔꿈치/무릎 굽힘·앉기·허리 비틀기·목 돌림·주먹)용이다.
 *
 * 규약은 앱의 포즈 저작 규약(`animation/presets/rotation-dsl.ts`)과 같다 — `render/**`는 `animation/`을 import할 수 없어
 * 필요한 해부학 헬퍼(팔 방향·팔꿈치·무릎·손가락 말기 등)를 같은 부호 규칙으로 여기에 작게 다시 적었다:
 *   우수 좌표계·Y-up, 정면 +Z, 캐릭터 왼쪽 +X, rest = T-포즈(손바닥 아래, 엄지 앞), `Pose`의 쿼터니언은 rest 기준 **본 로컬 회전**.
 * 엔진은 이 값을 `model-space` 규약으로 해석한다(rest 회전이 항등이 아닌 Mixamo 계열 리그도 같은 의미로 움직인다).
 * `t-pose`는 모든 델타가 항등인 rest 자세다 — 키트는 레스트가 T-포즈이므로 T-포즈가 된다.
 */
import { isHumanoidBoneName } from "../../contracts";
import { degToRad, qFromAxisAngle, qFromEulerXYZ, qMultiply, qNormalize, quatFromTo } from "../../shared/math";

import type { KitPreviewPoseId, KitPreviewPoseRequest, PoseRotationSpec } from "./cli-args";
import type { HumanoidBoneName, Pose, Quat, Vec3 } from "../../contracts";

type Side = "left" | "right";

export interface ResolvedPose {
  /** 보고용 이름(프리셋 id, `custom`, `none`) */
  readonly id: string;
  readonly pose: Pose;
  /** 전신 프레이밍 거리에 곱할 배율(팔을 올리면 키가 커 보여 잘리지 않게) */
  readonly framingScale: number;
}

function sideSign(side: Side): 1 | -1 {
  return side === "left" ? 1 : -1;
}

function rotX(deg: number): Quat {
  return qFromAxisAngle([1, 0, 0], degToRad(deg));
}
function rotY(deg: number): Quat {
  return qFromAxisAngle([0, 1, 0], degToRad(deg));
}
function rotZ(deg: number): Quat {
  return qFromAxisAngle([0, 0, 1], degToRad(deg));
}

/** 회전을 나열한 순서대로 적용하는 합성 */
function seq(...rotations: readonly Quat[]): Quat {
  let result: Quat = [0, 0, 0, 1];
  for (const rotation of rotations) result = qMultiply(rotation, result);
  return qNormalize(result);
}

/** 상완 방향(구면 각): downDeg = 내린 각(음수면 올림), forwardDeg = 앞(+Z)으로 보낸 각. 순수 swing. */
export function armAim(side: Side, downDeg: number, forwardDeg: number): Quat {
  const sign = sideSign(side);
  const down = degToRad(downDeg);
  const forward = degToRad(forwardDeg);
  const lateral = Math.cos(down);
  return quatFromTo([sign, 0, 0], [sign * lateral * Math.cos(forward), -Math.sin(down), lateral * Math.sin(forward)]);
}

/** 팔꿈치 굴곡(본 로컬 Y 힌지): 손바닥 아래 T-포즈에서 손이 앞(+Z)으로 온다. */
export function elbowFlex(side: Side, deg: number): Quat {
  return rotY(-sideSign(side) * deg);
}

/** 대퇴 방향: rest(−Y) 기준 forwardDeg = 앞으로 든 각, outDeg = 바깥으로 벌린 각. 순수 swing. */
export function legAim(side: Side, forwardDeg: number, outDeg: number): Quat {
  const sign = sideSign(side);
  const forward = degToRad(forwardDeg);
  const out = degToRad(outDeg);
  return quatFromTo([0, -1, 0], [sign * Math.sin(out), -Math.cos(forward) * Math.cos(out), Math.sin(forward) * Math.cos(out)]);
}

/** 무릎 굴곡(본 로컬 X 힌지): 정강이가 뒤로 접힌다. */
export function kneeFlex(deg: number): Quat {
  return rotX(deg);
}

/** 발목: 양수 = 발끝을 아래로 */
export function anklePitch(deg: number): Quat {
  return rotX(-deg);
}

/** 앞으로 숙임(양수) */
export function lean(deg: number): Quat {
  return rotX(deg);
}

/** 해당 측으로 돌림(요) */
export function turnTo(side: Side, deg: number): Quat {
  return rotY(sideSign(side) * deg);
}

/** 해당 측 어깨 쪽으로 기울임(롤) */
export function tiltTo(side: Side, deg: number): Quat {
  return rotZ(-sideSign(side) * deg);
}

/** 검지~소지 굴곡(손바닥 쪽) */
export function fingerCurl(side: Side, deg: number): Quat {
  return rotZ(-sideSign(side) * deg);
}

/** 엄지 굴곡: 엄지 방향(측면 X + 앞 Z 대각)과 손바닥 법선(−Y)에 수직인 축 둘레 */
export function thumbCurl(side: Side, deg: number): Quat {
  const sign = sideSign(side);
  const axis: Vec3 = [Math.SQRT1_2, 0, -sign * Math.SQRT1_2];
  return qFromAxisAngle(axis, degToRad(deg));
}

function put(pose: Pose, bone: HumanoidBoneName, rotation: Quat): void {
  if (Math.abs(rotation[0]) > 1e-12 || Math.abs(rotation[1]) > 1e-12 || Math.abs(rotation[2]) > 1e-12) pose[bone] = rotation;
}

const SIDES: readonly Side[] = ["left", "right"];

function bone(side: Side, name: string): HumanoidBoneName {
  return `${side}${name}` as HumanoidBoneName;
}

function arms(pose: Pose, spec: { down: number; forward?: number; elbow?: number }): void {
  for (const side of SIDES) {
    put(pose, bone(side, "UpperArm"), armAim(side, spec.down, spec.forward ?? 0));
    put(pose, bone(side, "LowerArm"), elbowFlex(side, spec.elbow ?? 0));
  }
}

function fistFingers(pose: Pose): void {
  for (const side of SIDES) {
    for (const finger of ["Index", "Middle", "Ring", "Little"]) {
      put(pose, bone(side, `${finger}Proximal`), fingerCurl(side, 78));
      put(pose, bone(side, `${finger}Intermediate`), fingerCurl(side, 98));
      put(pose, bone(side, `${finger}Distal`), fingerCurl(side, 70));
    }
    put(pose, bone(side, "ThumbMetacarpal"), thumbCurl(side, 22));
    put(pose, bone(side, "ThumbProximal"), thumbCurl(side, 42));
    put(pose, bone(side, "ThumbDistal"), thumbCurl(side, 38));
  }
}

function build(id: KitPreviewPoseId): ResolvedPose {
  const pose: Pose = {};
  let framingScale = 1;
  switch (id) {
    case "t-pose":
      break;
    case "a-pose":
      arms(pose, { down: 45 });
      break;
    case "arms-up":
      arms(pose, { down: -78, elbow: 8 });
      framingScale = 1.25;
      break;
    case "elbows-bent":
      arms(pose, { down: 28, elbow: 112 });
      break;
    case "squat":
      for (const side of SIDES) {
        put(pose, bone(side, "UpperLeg"), legAim(side, 72, 18));
        put(pose, bone(side, "LowerLeg"), kneeFlex(128));
        put(pose, bone(side, "Foot"), anklePitch(24));
      }
      arms(pose, { down: 38, forward: 42, elbow: 34 });
      put(pose, "spine", lean(18));
      put(pose, "head", lean(-10));
      framingScale = 1.05;
      break;
    case "sit":
      for (const side of SIDES) {
        put(pose, bone(side, "UpperLeg"), legAim(side, 88, 6));
        put(pose, bone(side, "LowerLeg"), kneeFlex(92));
        put(pose, bone(side, "Foot"), anklePitch(-4));
      }
      arms(pose, { down: 70, forward: 26, elbow: 72 });
      put(pose, "spine", lean(6));
      put(pose, "neck", lean(2));
      framingScale = 1.1;
      break;
    case "twist":
      put(pose, "spine", turnTo("left", 24));
      put(pose, "chest", turnTo("left", 22));
      put(pose, "upperChest", turnTo("left", 14));
      break;
    case "neck-turn":
      put(pose, "neck", seq(turnTo("left", 38), tiltTo("right", 6)));
      put(pose, "head", turnTo("left", 24));
      break;
    case "fist":
      fistFingers(pose);
      break;
  }
  return { id, pose, framingScale };
}

/** 내장 프리셋 포즈 */
export function presetPose(id: KitPreviewPoseId): ResolvedPose {
  return build(id);
}

/** 포즈 JSON의 한 본 값 → 쿼터니언 */
export function rotationFromSpec(spec: PoseRotationSpec): Quat {
  switch (spec.kind) {
    case "quat":
      return qNormalize(spec.value);
    case "axis-angle":
      return qFromAxisAngle(spec.axis, degToRad(spec.deg));
    case "euler":
      return qFromEulerXYZ(degToRad(spec.degXyz[0]), degToRad(spec.degXyz[1]), degToRad(spec.degXyz[2]));
  }
}

/** CLI 포즈 요청 → 엔진 `ApplyPlan.boneRotations`. 본 이름 검증은 CLI 파서가 끝냈다. */
export function resolvePose(request: KitPreviewPoseRequest): ResolvedPose {
  if (request.kind === "none") return { id: "none", pose: {}, framingScale: 1 };
  if (request.kind === "preset") return presetPose(request.id);
  const pose: Pose = {};
  for (const [name, spec] of Object.entries(request.rotations)) if (isHumanoidBoneName(name)) pose[name] = rotationFromSpec(spec);
  return { id: "custom", pose, framingScale: 1 };
}
