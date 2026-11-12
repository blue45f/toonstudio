/**
 * Studio 3D 데생 인형 v5 — 동세선(Line of Action)·콘트라포스토·1인 손발 접촉 솔버·시선 응시·호흡 흉곽 엔진.
 *
 * 실사용 작화 품질을 위해 다음 5가지 결정적 생체역학 연산을 제공한다:
 * 1. 3D 동세선(Line of Action): 정수리 → 목 → 흉추 → 요추 → 골반 → 주 지지발 Catmull-Rom 스플라인.
 * 2. 접지·상지 균형 통합 콘트라포스토 생성기: 어깨·골반 반대 기울기 + 상지 자연 이완 + 발바닥 지면(y=0) 정확 밀착.
 * 3. 1인 손-신체·바닥 밀착 IK 솔버(`applyStudioMannequinHandContact`): 체형(두신·어깨·골반·흉곽·턱)이 달라도
 *    턱 괴기(`chin`), 골반 손 얹기(`hip`), 가슴 손 얹기(`chest`), 뒷머리 팔베개(`occiput`), 바닥 짚기(`ground`)를
 *    관통·부유 없이 표면 법선 위치에 정확히 밀착시킨다.
 * 4. 경추-흉추 분산 시선 응시(Gaze Look-At): 가슴(15%)·목(35%)·머리(50%) 회전 배분.
 * 5. 호흡 흉곽 확장(Breathing Modulation): 들숨(+1) ↔ 날숨(-1) 생리학적 흉곽·허리 부피 변조.
 *
 * Three.js 비의존 순수 모듈 — 단위 테스트와 직렬화가 안전하다.
 */

import { computeStudioMannequinJointFrames, studioMannequinMat3Apply } from "./studio-mannequin-forward-kinematics";
import {
  blendStudioMannequinBuild,
  clampStudioMannequinBodyParams,
  clampStudioMannequinJointRotation,
  type StudioMannequinBodyParams,
  type StudioMannequinJointId,
  type StudioMannequinSpec,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  groundStudioMannequinPoseForSupport,
  measureStudioMannequinBodyFloor,
  reachStudioMannequinLimbEnd,
} from "./studio-mannequin-pose-ground-contact";
import { normalizeStudioMannequinPose, type StudioMannequinPose } from "./studio-mannequin-poses";
import {
  applyStudioMannequinJointLocks,
  applyStudioMannequinScapulohumeralRhythm,
  computeStudioMannequinWorldJointPositions,
  stabilizeStudioMannequinCenterOfMass,
  type StudioMannequinJointLockMap,
} from "./studio-mannequin-pro-kinematics";

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(max, Math.max(min, v));
}

function rad(degVal: number): number {
  return (degVal * Math.PI) / 180;
}

function deg(radVal: number): number {
  return (radVal * 180) / Math.PI;
}

// ── 1. 3D 동세선(Line of Action) & 콘트라포스토 기울기 분석 ───────────────────

export interface StudioMannequinGestureAnalysis {
  readonly lineOfActionPoints: readonly StudioMannequinVec3[];
  readonly shoulderTiltDeg: number;
  readonly pelvisTiltDeg: number;
  readonly contrappostoAngleDeg: number;
  readonly hasCounterTilt: boolean;
  readonly actionCurveBowCm: number;
}

function catmullRomPoint(
  p0: StudioMannequinVec3,
  p1: StudioMannequinVec3,
  p2: StudioMannequinVec3,
  p3: StudioMannequinVec3,
  t: number,
): StudioMannequinVec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const evalAxis = (i: 0 | 1 | 2): number =>
    0.5 * (
      2 * p1[i] +
      (-p0[i] + p2[i]) * t +
      (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
      (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3
    );
  return [evalAxis(0), evalAxis(1), evalAxis(2)];
}

export function analyzeStudioMannequinGesture(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
  segmentsPerSpan = 6,
): StudioMannequinGestureAnalysis {
  const world = computeStudioMannequinWorldJointPositions(spec, pose);
  const headBase = world.head;
  const neck = world.neck;
  const chest = world.chest;
  const spine = world.spine;
  const pelvis = world.pelvis;

  const headDirX = headBase[0] - neck[0];
  const headDirY = headBase[1] - neck[1];
  const headDirZ = headBase[2] - neck[2];
  const headDirLen = Math.hypot(headDirX, headDirY, headDirZ) || 1;
  const crown: StudioMannequinVec3 = [
    headBase[0] + (headDirX / headDirLen) * spec.headUnit * 0.92,
    headBase[1] + (headDirY / headDirLen) * spec.headUnit * 0.92,
    headBase[2] + (headDirZ / headDirLen) * spec.headUnit * 0.92,
  ];

  const lFoot = world.leftFoot;
  const rFoot = world.rightFoot;
  const leftScore = lFoot[1] + Math.hypot(lFoot[0] - pelvis[0], lFoot[2] - pelvis[2]) * 0.35;
  const rightScore = rFoot[1] + Math.hypot(rFoot[0] - pelvis[0], rFoot[2] - pelvis[2]) * 0.35;
  const useLeftLeg = leftScore <= rightScore;
  const knee = useLeftLeg ? world.leftLowerLeg : world.rightLowerLeg;
  const ankle = useLeftLeg ? lFoot : rFoot;

  const anchors: readonly StudioMannequinVec3[] = [crown, neck, chest, spine, pelvis, knee, ankle];
  const steps = Math.max(2, Math.min(12, Math.floor(segmentsPerSpan)));
  const sampled: StudioMannequinVec3[] = [];
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const p0 = anchors[Math.max(0, i - 1)] as StudioMannequinVec3;
    const p1 = anchors[i] as StudioMannequinVec3;
    const p2 = anchors[i + 1] as StudioMannequinVec3;
    const p3 = anchors[Math.min(anchors.length - 1, i + 2)] as StudioMannequinVec3;
    const limit = i === anchors.length - 2 ? steps : steps - 1;
    for (let s = 0; s <= limit; s += 1) {
      sampled.push(catmullRomPoint(p0, p1, p2, p3, s / steps));
    }
  }

  const lArm = world.leftUpperArm;
  const rArm = world.rightUpperArm;
  const lHip = world.leftUpperLeg;
  const rHip = world.rightUpperLeg;
  const shoulderTiltRad = Math.atan2(
    lArm[1] - rArm[1],
    Math.max(1e-4, Math.hypot(lArm[0] - rArm[0], lArm[2] - rArm[2])),
  );
  const pelvisTiltRad = Math.atan2(
    lHip[1] - rHip[1],
    Math.max(1e-4, Math.hypot(lHip[0] - rHip[0], lHip[2] - rHip[2])),
  );
  const shoulderTiltDeg = Math.round(deg(shoulderTiltRad) * 10) / 10;
  const pelvisTiltDeg = Math.round(deg(pelvisTiltRad) * 10) / 10;
  const contrappostoAngleDeg = Math.round(Math.abs(shoulderTiltDeg - pelvisTiltDeg) * 10) / 10;
  const hasCounterTilt =
    Math.abs(shoulderTiltDeg) >= 1.5 &&
    Math.abs(pelvisTiltDeg) >= 1.5 &&
    Math.sign(shoulderTiltDeg) !== Math.sign(pelvisTiltDeg);

  const chord: StudioMannequinVec3 = [ankle[0] - crown[0], ankle[1] - crown[1], ankle[2] - crown[2]];
  const chordLenSq = chord[0] ** 2 + chord[1] ** 2 + chord[2] ** 2;
  let maxBowM = 0;
  if (chordLenSq > 1e-8) {
    for (const pt of [chest, spine, pelvis]) {
      const rel: StudioMannequinVec3 = [pt[0] - crown[0], pt[1] - crown[1], pt[2] - crown[2]];
      const proj = clamp(
        (rel[0] * chord[0] + rel[1] * chord[1] + rel[2] * chord[2]) / chordLenSq,
        0,
        1,
      );
      const dist = Math.hypot(
        rel[0] - chord[0] * proj,
        rel[1] - chord[1] * proj,
        rel[2] - chord[2] * proj,
      );
      if (dist > maxBowM) maxBowM = dist;
    }
  }

  return {
    lineOfActionPoints: sampled,
    shoulderTiltDeg,
    pelvisTiltDeg,
    contrappostoAngleDeg,
    hasCounterTilt,
    actionCurveBowCm: Math.round(maxBowM * 1000) / 10,
  };
}

/**
 * 접지·상지 균형 통합 콘트라포스토 자세 생성:
 * 지지 다리(`weightSide`) 골반 거상 + 흉곽 반대 기울기 + 양팔 자연 이완 + 지면(y=0) 발바닥 정확 접지를 함께 수행한다.
 */
export function buildStudioMannequinContrappostoPose(
  spec: StudioMannequinSpec,
  basePose: StudioMannequinPose,
  weightSide: "left" | "right",
  intensity01 = 0.75,
  locks: StudioMannequinJointLockMap = {},
): StudioMannequinPose {
  const k = clamp(intensity01, 0, 1.2);
  const sign = weightSide === "left" ? 1 : -1;

  const candidate = normalizeStudioMannequinPose({
    joints: {
      ...basePose.joints,
      pelvis: clampStudioMannequinJointRotation("pelvis", [
        rad(-2.5 * k),
        rad(-sign * 5 * k),
        rad(sign * 8.5 * k),
      ]),
      spine: clampStudioMannequinJointRotation("spine", [
        rad(2 * k),
        rad(sign * 3.5 * k),
        rad(-sign * 6.5 * k),
      ]),
      chest: clampStudioMannequinJointRotation("chest", [
        rad(-1.5 * k),
        rad(sign * 4 * k),
        rad(-sign * 7.5 * k),
      ]),
      neck: clampStudioMannequinJointRotation("neck", [
        0,
        rad(-sign * 2.5 * k),
        rad(sign * 3.5 * k),
      ]),
      head: clampStudioMannequinJointRotation("head", [
        rad(2 * k),
        rad(-sign * 3 * k),
        rad(sign * 2.5 * k),
      ]),
      // 상지 카운터밸런스: 낮아진 어깨 쪽 팔은 살짝 외전·이완하고 반대쪽은 몸통 옆선에 자연스럽게 붙인다.
      leftShoulder: clampStudioMannequinJointRotation("leftShoulder", [0, 0, rad(-sign * 3 * k)]),
      rightShoulder: clampStudioMannequinJointRotation("rightShoulder", [0, 0, rad(-sign * 3 * k)]),
      leftUpperArm: clampStudioMannequinJointRotation("leftUpperArm", [
        rad((weightSide === "left" ? 5 : -4) * k),
        0,
        rad((weightSide === "left" ? 7 : 11) * k),
      ]),
      leftLowerArm: clampStudioMannequinJointRotation("leftLowerArm", [rad(-12 * k), 0, 0]),
      rightUpperArm: clampStudioMannequinJointRotation("rightUpperArm", [
        rad((weightSide === "right" ? 5 : -4) * k),
        0,
        rad(-(weightSide === "right" ? 7 : 11) * k),
      ]),
      rightLowerArm: clampStudioMannequinJointRotation("rightLowerArm", [rad(-12 * k), 0, 0]),
      leftUpperLeg:
        weightSide === "left"
          ? clampStudioMannequinJointRotation("leftUpperLeg", [rad(2 * k), 0, rad(-6.5 * k)])
          : clampStudioMannequinJointRotation("leftUpperLeg", [rad(-14 * k), rad(8 * k), rad(6 * k)]),
      leftLowerLeg:
        weightSide === "left"
          ? clampStudioMannequinJointRotation("leftLowerLeg", [rad(2 * k), 0, 0])
          : clampStudioMannequinJointRotation("leftLowerLeg", [rad(24 * k), 0, 0]),
      leftFoot:
        weightSide === "left"
          ? clampStudioMannequinJointRotation("leftFoot", [rad(-2 * k), 0, rad(5 * k)])
          : clampStudioMannequinJointRotation("leftFoot", [rad(8 * k), 0, 0]),
      rightUpperLeg:
        weightSide === "right"
          ? clampStudioMannequinJointRotation("rightUpperLeg", [rad(2 * k), 0, rad(6.5 * k)])
          : clampStudioMannequinJointRotation("rightUpperLeg", [rad(-14 * k), rad(-8 * k), rad(-6 * k)]),
      rightLowerLeg:
        weightSide === "right"
          ? clampStudioMannequinJointRotation("rightLowerLeg", [rad(2 * k), 0, 0])
          : clampStudioMannequinJointRotation("rightLowerLeg", [rad(24 * k), 0, 0]),
      rightFoot:
        weightSide === "right"
          ? clampStudioMannequinJointRotation("rightFoot", [rad(-2 * k), 0, rad(-5 * k)])
          : clampStudioMannequinJointRotation("rightFoot", [rad(8 * k), 0, 0]),
    },
    pelvisOffset: basePose.pelvisOffset,
  });

  // 1) 수평 무게중심(X/Z) 지지면 안착 → 2) 수직 발바닥 지면(y=0) 정확 접지
  const horizontallyBalanced = stabilizeStudioMannequinCenterOfMass(spec, candidate);
  const grounded = groundStudioMannequinPoseForSupport(spec, horizontallyBalanced, {
    support: "standing",
    contacts: [weightSide === "left" ? "leftFoot" : "rightFoot"],
  });
  return applyStudioMannequinJointLocks(basePose, grounded, locks);
}

// ── 2. 1인 손-신체·바닥 밀착 IK 솔버 (Hand Surface Contact) ──────────────────

export type StudioMannequinHandContactTargetId = "hip" | "chin" | "chest" | "occiput" | "ground";

export const STUDIO_MANNEQUIN_HAND_CONTACT_TARGETS: readonly {
  readonly id: StudioMannequinHandContactTargetId;
  readonly label: string;
  readonly desc: string;
}[] = Object.freeze([
  { id: "hip", label: "골반 손얹기", desc: "현재 골반 너비·깊이에 맞춰 장골능 표면에 손을 밀착합니다" },
  { id: "chin", label: "턱 괴기", desc: "현재 두상·턱 길이에 맞춰 턱 밑 표면에 손을 밀착합니다" },
  { id: "chest", label: "가슴 얹기", desc: "현재 흉곽 두께에 맞춰 대흉근 앞 표면에 손을 밀착합니다" },
  { id: "occiput", label: "뒷머리 받치기", desc: "현재 두개골 뒤통수 표면에 손을 밀착합니다" },
  { id: "ground", label: "바닥 손짚기", desc: "무릎·허리를 자연스럽게 낮춰 지면(y=0)에 손바닥을 정확히 접지합니다" },
]);

export interface StudioMannequinHandContactReport {
  readonly pose: StudioMannequinPose;
  /** 목표 접촉점과 실제 손목(또는 바닥 최저점) 사이의 잔여 오차(m). */
  readonly residualErrorM: number;
}

/**
 * 선택한 손(`side`)을 지정된 신체 부위 또는 지면(`targetId`) 표면에 관통·부유 없이 정확히 밀착시킨다.
 */
export function applyStudioMannequinHandContact(
  spec: StudioMannequinSpec,
  basePose: StudioMannequinPose,
  side: "left" | "right",
  targetId: StudioMannequinHandContactTargetId,
  locks: StudioMannequinJointLockMap = {},
): StudioMannequinHandContactReport {
  const sign = side === "left" ? 1 : -1;
  const chainId = side === "left" ? "leftArm" : "rightArm";
  const handJointId = side === "left" ? "leftHand" : "rightHand";
  const hu = spec.headUnit;
  const p = spec.params;
  const build = blendStudioMannequinBuild(p.build);
  const torsoDepth = p.torsoDepth ?? 1;
  const chestWidth = p.chestWidth ?? 1;
  const pelvisDepth = p.pelvisDepth ?? 1;
  const faceWidth = p.faceWidth ?? 1;
  const chinLength = p.chinLength ?? 1;
  const handLen = 0.085 * spec.heightM * p.armLength * (p.handScale ?? 1);
  const palmClearance = Math.max(0.018, handLen * 0.24);

  let workingPose = basePose;

  if (targetId === "ground") {
    // 서 있는 높이에서는 팔이 바닥에 닿지 않으므로 상체 전굴 + 하체 3점 착지 스쿼트를 먼저 형성한 뒤 손발을 동시에 지면에 맞춘다.
    const crouchCandidate = normalizeStudioMannequinPose({
      joints: {
        ...basePose.joints,
        pelvis: clampStudioMannequinJointRotation("pelvis", [rad(24), rad(-sign * 8), 0]),
        spine: clampStudioMannequinJointRotation("spine", [rad(28), rad(sign * 6), 0]),
        chest: clampStudioMannequinJointRotation("chest", [rad(24), rad(sign * 8), 0]),
        neck: clampStudioMannequinJointRotation("neck", [rad(-32), 0, 0]),
        head: clampStudioMannequinJointRotation("head", [rad(-22), 0, 0]),
        leftUpperLeg: clampStudioMannequinJointRotation("leftUpperLeg", [rad(-92), rad(12), rad(10)]),
        leftLowerLeg: clampStudioMannequinJointRotation("leftLowerLeg", [rad(118), 0, 0]),
        leftFoot: clampStudioMannequinJointRotation("leftFoot", [rad(-24), 0, 0]),
        rightUpperLeg: clampStudioMannequinJointRotation("rightUpperLeg", [rad(-92), rad(-12), rad(-10)]),
        rightLowerLeg: clampStudioMannequinJointRotation("rightLowerLeg", [rad(118), 0, 0]),
        rightFoot: clampStudioMannequinJointRotation("rightFoot", [rad(-24), 0, 0]),
        [side === "left" ? "leftUpperArm" : "rightUpperArm"]: clampStudioMannequinJointRotation(
          side === "left" ? "leftUpperArm" : "rightUpperArm",
          [rad(-58), 0, rad(sign * 8)],
        ),
        [side === "left" ? "leftLowerArm" : "rightLowerArm"]: clampStudioMannequinJointRotation(
          side === "left" ? "leftLowerArm" : "rightLowerArm",
          [rad(-14), 0, 0],
        ),
        [handJointId]: clampStudioMannequinJointRotation(handJointId, [rad(58), 0, 0]),
      },
      pelvisOffset: basePose.pelvisOffset,
    });
    const groundedCrouch = groundStudioMannequinPoseForSupport(spec, crouchCandidate, {
      support: "kneeling",
      contacts: ["leftFoot", "rightFoot", side === "left" ? "leftHand" : "rightHand"],
    });
    const finalGroundPose = applyStudioMannequinJointLocks(basePose, groundedCrouch, locks);
    const floorReport = measureStudioMannequinBodyFloor(spec, finalGroundPose);
    const handRegion = side === "left" ? "leftHand" : "rightHand";
    return {
      pose: finalGroundPose,
      residualErrorM: Math.abs(floorReport.regionLowestY[handRegion]),
    };
  }

  // 팔꿈치 폴 방향이 해부학적으로 자연스럽게 바깥·앞쪽을 향하도록 초기 힌트 자세를 부여한다.
  const preHintJoints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {
    ...workingPose.joints,
    [side === "left" ? "leftUpperArm" : "rightUpperArm"]:
      targetId === "hip"
        ? clampStudioMannequinJointRotation(side === "left" ? "leftUpperArm" : "rightUpperArm", [rad(18), rad(-sign * 20), rad(sign * 36)])
        : targetId === "occiput"
          ? clampStudioMannequinJointRotation(side === "left" ? "leftUpperArm" : "rightUpperArm", [rad(-115), rad(sign * 25), rad(sign * 65)])
          : clampStudioMannequinJointRotation(side === "left" ? "leftUpperArm" : "rightUpperArm", [rad(-55), rad(-sign * 18), rad(sign * 22)]),
    [side === "left" ? "leftLowerArm" : "rightLowerArm"]: clampStudioMannequinJointRotation(
      side === "left" ? "leftLowerArm" : "rightLowerArm",
      [rad(targetId === "hip" ? -78 : -112), 0, 0],
    ),
  };
  workingPose = normalizeStudioMannequinPose({
    joints: preHintJoints,
    pelvisOffset: workingPose.pelvisOffset,
  });

  const frames = computeStudioMannequinJointFrames(spec, workingPose);
  const toWorld = (jointId: StudioMannequinJointId, local: StudioMannequinVec3): StudioMannequinVec3 => {
    const f = frames.get(jointId);
    if (!f) return local;
    const rot = studioMannequinMat3Apply(f.rotation, local);
    return [f.position[0] + rot[0], f.position[1] + rot[1], f.position[2] + rot[2]];
  };

  let targetWorld: StudioMannequinVec3;
  let wristRot: StudioMannequinVec3;

  if (targetId === "hip") {
    const hipX = sign * (0.38 * hu * p.pelvisWidth * build.torsoLower + palmClearance);
    targetWorld = toWorld("pelvis", [hipX, 0.08 * hu, 0.04 * hu * pelvisDepth]);
    wristRot = clampStudioMannequinJointRotation(handJointId, [rad(12), rad(-sign * 18), rad(-sign * 38)]);
  } else if (targetId === "chin") {
    const chinY = hu * (0.14 - 0.04 * (chinLength - 1)) - palmClearance * 0.45;
    const chinZ = hu * 0.24 + palmClearance * 0.6;
    targetWorld = toWorld("head", [sign * 0.08 * hu * faceWidth, chinY, chinZ]);
    wristRot = clampStudioMannequinJointRotation(handJointId, [rad(-42), rad(sign * 16), rad(sign * 12)]);
  } else if (targetId === "chest") {
    const chestFrame = frames.get("chest");
    const chestZ = 0.27 * hu * torsoDepth + palmClearance;
    const chestY = (chestFrame ? 0.14 : 0.14) * (spec.heightM * 0.28);
    targetWorld = toWorld("chest", [sign * 0.11 * hu * chestWidth, chestY, chestZ]);
    wristRot = clampStudioMannequinJointRotation(handJointId, [rad(-18), rad(-sign * 24), rad(-sign * 22)]);
  } else {
    // occiput: 뒷머리 표면
    targetWorld = toWorld("head", [sign * 0.12 * hu * faceWidth, 0.56 * hu, -(0.42 * hu + palmClearance)]);
    wristRot = clampStudioMannequinJointRotation(handJointId, [rad(24), rad(sign * 20), rad(sign * 18)]);
  }

  let solved = reachStudioMannequinLimbEnd(spec, workingPose, chainId, targetWorld);
  solved = normalizeStudioMannequinPose({
    joints: { ...solved.joints, [handJointId]: wristRot },
    pelvisOffset: solved.pelvisOffset,
  });
  solved = applyStudioMannequinScapulohumeralRhythm(solved, locks, 1);
  // 쇄골 동반 회전 이후 목표점에 한 번 더 정밀 수렴(2-pass IK)
  solved = reachStudioMannequinLimbEnd(spec, solved, chainId, targetWorld);
  solved = normalizeStudioMannequinPose({
    joints: { ...solved.joints, [handJointId]: wristRot },
    pelvisOffset: solved.pelvisOffset,
  });
  // 지면 관통 방지
  const floorAfter = measureStudioMannequinBodyFloor(spec, solved);
  if (floorAfter.lowestY < -1e-4) {
    solved = groundStudioMannequinPoseForSupport(spec, solved, { support: "standing" });
  }

  const finalPose = applyStudioMannequinJointLocks(basePose, solved, locks);
  const finalWrist = computeStudioMannequinJointFrames(spec, finalPose).get(handJointId)?.position ?? targetWorld;
  const residualErrorM = Math.hypot(
    finalWrist[0] - targetWorld[0],
    finalWrist[1] - targetWorld[1],
    finalWrist[2] - targetWorld[2],
  );

  return { pose: finalPose, residualErrorM };
}

// ── 3. 경추-흉추 분산 시선 응시(Gaze Look-At Solver) ─────────────────────────

export function applyStudioMannequinGazeTarget(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
  targetWorld: StudioMannequinVec3,
  locks: StudioMannequinJointLockMap = {},
  blend01 = 1,
): StudioMannequinPose {
  const b = clamp(blend01, 0, 1);
  if (b <= 0) return pose;

  const world = computeStudioMannequinWorldJointPositions(spec, pose);
  const eyeCenter: StudioMannequinVec3 = [
    world.head[0],
    world.head[1] + spec.headUnit * 0.56,
    world.head[2],
  ];
  const dx = targetWorld[0] - eyeCenter[0];
  const dy = targetWorld[1] - eyeCenter[1];
  const dz = targetWorld[2] - eyeCenter[2];
  const horizDist = Math.hypot(dx, dz);
  if (horizDist < 1e-4 && Math.abs(dy) < 1e-4) return pose;

  const pelvisYaw = pose.joints.pelvis?.[1] ?? 0;
  const worldYaw = Math.atan2(dx, dz);
  let relYaw = worldYaw - pelvisYaw;
  while (relYaw > Math.PI) relYaw -= Math.PI * 2;
  while (relYaw < -Math.PI) relYaw += Math.PI * 2;
  relYaw = clamp(relYaw, -rad(115), rad(115));

  const relPitch = clamp(-Math.atan2(dy, Math.max(0.08, horizDist)), -rad(65), rad(65));

  const weights: readonly { id: StudioMannequinJointId; yawW: number; pitchW: number }[] = [
    { id: "chest", yawW: 0.15, pitchW: 0.12 },
    { id: "neck", yawW: 0.35, pitchW: 0.38 },
    { id: "head", yawW: 0.50, pitchW: 0.50 },
  ];

  const nextJoints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = { ...pose.joints };
  for (const { id, yawW, pitchW } of weights) {
    if (locks[id]) continue;
    const prev = pose.joints[id] ?? [0, 0, 0];
    const targetRot: StudioMannequinVec3 = [
      prev[0] * (1 - b) + relPitch * pitchW * b,
      prev[1] * (1 - b) + relYaw * yawW * b,
      prev[2],
    ];
    nextJoints[id] = clampStudioMannequinJointRotation(id, targetRot);
  }

  return normalizeStudioMannequinPose({
    joints: nextJoints,
    pelvisOffset: pose.pelvisOffset,
  });
}

// ── 4. 호흡 흉곽 확장(Breathing Ribcage Modulation) ──────────────────────────

export function applyStudioMannequinBreathingParams(
  baseParams: StudioMannequinBodyParams,
  breathPhase: number,
): StudioMannequinBodyParams {
  const phase = clamp(breathPhase, -1, 1);
  if (Math.abs(phase) < 1e-4) return baseParams;
  return clampStudioMannequinBodyParams({
    ...baseParams,
    torsoDepth: (baseParams.torsoDepth ?? 1) * (1 + 0.11 * phase),
    chestWidth: (baseParams.chestWidth ?? 1) * (1 + 0.07 * phase),
    waistWidth: (baseParams.waistWidth ?? 1) * (1 - 0.04 * phase),
  });
}
