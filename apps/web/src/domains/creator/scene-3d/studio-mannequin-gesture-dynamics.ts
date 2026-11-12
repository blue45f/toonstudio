/**
 * Studio 3D 데생 인형 v4 — 동세선(Line of Action)·콘트라포스토·시선 응시(Gaze Look-At)·호흡 흉곽 엔진.
 *
 * 클립스튜디오 데생 인형에 없는 작화 연출 핵심 보조 기능을 순수 결정적 수식으로 계산한다:
 * 1. 3D 동세선(Line of Action): 정수리 → 목 → 흉추 → 요추 → 골반 → 주 지지발로 이어지는 Catmull-Rom 스플라인.
 * 2. 콘트라포스토(Contrapposto) 분석 및 원클릭 생성기: 어깨축-골반축 반대 기울기 각도(deg) 정량 측정 및 좌/우 체중 이동 포즈 생성.
 * 3. 경추-흉추 분산 시선 응시(Gaze Look-At): 카메라(또는 목표 좌표)를 향해 가슴(15%)·목(35%)·머리(50%) 회전을 자연 배분.
 * 4. 호흡 흉곽 확장(Breathing Modulation): 들숨(+1, 기합·전투) ↔ 날숨(-1, 탈진·이완)에 따른 흉곽 부피·척추 신전 변조.
 *
 * Three.js 비의존 순수 모듈 — 단위 테스트와 직렬화가 안전하다.
 */

import {
  clampStudioMannequinBodyParams,
  clampStudioMannequinJointRotation,
  type StudioMannequinBodyParams,
  type StudioMannequinJointId,
  type StudioMannequinSpec,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import { normalizeStudioMannequinPose, type StudioMannequinPose } from "./studio-mannequin-poses";
import {
  applyStudioMannequinJointLocks,
  computeStudioMannequinWorldJointPositions,
  stabilizeStudioMannequinCenterOfMass,
  type StudioMannequinJointLockMap,
} from "./studio-mannequin-pro-kinematics";

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(max, Math.max(min, v));
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function deg(radVal: number): number {
  return (radVal * 180) / Math.PI;
}

// ── 1. 3D 동세선(Line of Action) & 콘트라포스토 기울기 분석 ───────────────────

export interface StudioMannequinGestureAnalysis {
  /** 정수리에서 주 지지 발끝까지 흐르는 3D Catmull-Rom 동세선 샘플 점열. */
  readonly lineOfActionPoints: readonly StudioMannequinVec3[];
  /** 정면(XY 평면) 기준 어깨축 기울기(deg). */
  readonly shoulderTiltDeg: number;
  /** 정면(XY 평면) 기준 골반축 기울기(deg). */
  readonly pelvisTiltDeg: number;
  /** 어깨와 골반의 반대 기울기 대비 각도(deg). 8°~24° 구간이 고전적 콘트라포스토 리듬. */
  readonly contrappostoAngleDeg: number;
  /** 두 축이 서로 반대 부호로 기울어져 자연스러운 S/C 리듬을 형성하는지 여부. */
  readonly hasCounterTilt: boolean;
  /** 동세선의 만곡도(0 = 수직 경직, 양수 = 역동적 C/S 커브, 단위 cm). */
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

/**
 * 현재 체형과 포즈로부터 3D 동세선(Line of Action) 스플라인과 어깨·골반 콘트라포스토 각도를 산출한다.
 */
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

  // 정수리 보간점: 목 -> 머리 벡터 연장
  const headDirX = headBase[0] - neck[0];
  const headDirY = headBase[1] - neck[1];
  const headDirZ = headBase[2] - neck[2];
  const headDirLen = Math.hypot(headDirX, headDirY, headDirZ) || 1;
  const crown: StudioMannequinVec3 = [
    headBase[0] + (headDirX / headDirLen) * spec.headUnit * 0.92,
    headBase[1] + (headDirY / headDirLen) * spec.headUnit * 0.92,
    headBase[2] + (headDirZ / headDirLen) * spec.headUnit * 0.92,
  ];

  // 주 지지 다리 선택: 더 낮게 접지되어 있거나 골반 수평 중심에 가까운 발을 동세선 종점으로 삼는다.
  const lFoot = world.leftFoot;
  const rFoot = world.rightFoot;
  const leftScore = lFoot[1] + Math.hypot(lFoot[0] - pelvis[0], lFoot[2] - pelvis[2]) * 0.35;
  const rightScore = rFoot[1] + Math.hypot(rFoot[0] - pelvis[0], rFoot[2] - pelvis[2]) * 0.35;
  const useLeftLeg = leftScore <= rightScore;
  const knee = useLeftLeg ? world.leftLowerLeg : world.rightLowerLeg;
  const ankle = useLeftLeg ? lFoot : rFoot;

  const anchors: readonly StudioMannequinVec3[] = [
    crown,
    neck,
    chest,
    spine,
    pelvis,
    knee,
    ankle,
  ];

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

  // 어깨축(우상완 -> 좌상완) 및 골반축(우고관절 -> 좌고관절) 기울기
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

  // 정수리-발목 직선 대비 척추/골반 최대 이탈 거리(만곡도, cm)
  const chord: StudioMannequinVec3 = [
    ankle[0] - crown[0],
    ankle[1] - crown[1],
    ankle[2] - crown[2],
  ];
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
 * 원클릭 콘트라포스토(Contrapposto) 자세 생성:
 * 지지 다리(`weightSide`) 쪽 골반을 들어 올리고 흉곽·어깨는 반대 방향으로 기울여
 * 고전 조각상과 웹툰 스탠딩 일러스트의 자연스러운 S-리듬을 즉시 부여한다.
 */
export function buildStudioMannequinContrappostoPose(
  spec: StudioMannequinSpec,
  basePose: StudioMannequinPose,
  weightSide: "left" | "right",
  intensity01 = 0.75,
  locks: StudioMannequinJointLockMap = {},
): StudioMannequinPose {
  const k = clamp(intensity01, 0, 1.2);
  // +X가 왼쪽 다리: 왼쪽 다리 지지 시 골반 좌측(+X)이 올라가려면 pelvis Z 회전이 음수(-Z가 +X를 위로 올리는지 확인:
  // 오른손 좌표계 Z축 회전 +theta에서 (1,0,0) -> (cos, sin, 0), 즉 +Z 회전이 왼쪽(+X) 골반을 위로 올린다!)
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
      // 지지 다리는 곧게 뻗어 내전하고, 유각(반대 다리)은 무릎을 살짝 굽혀 이완한다.
      leftUpperLeg:
        weightSide === "left"
          ? clampStudioMannequinJointRotation("leftUpperLeg", [rad(2 * k), 0, rad(-6.5 * k)])
          : clampStudioMannequinJointRotation("leftUpperLeg", [rad(-12 * k), rad(8 * k), rad(6 * k)]),
      leftLowerLeg:
        weightSide === "left"
          ? clampStudioMannequinJointRotation("leftLowerLeg", [rad(2 * k), 0, 0])
          : clampStudioMannequinJointRotation("leftLowerLeg", [rad(22 * k), 0, 0]),
      leftFoot:
        weightSide === "left"
          ? clampStudioMannequinJointRotation("leftFoot", [rad(-2 * k), 0, rad(5 * k)])
          : clampStudioMannequinJointRotation("leftFoot", [rad(10 * k), 0, 0]),
      rightUpperLeg:
        weightSide === "right"
          ? clampStudioMannequinJointRotation("rightUpperLeg", [rad(2 * k), 0, rad(6.5 * k)])
          : clampStudioMannequinJointRotation("rightUpperLeg", [rad(-12 * k), rad(-8 * k), rad(-6 * k)]),
      rightLowerLeg:
        weightSide === "right"
          ? clampStudioMannequinJointRotation("rightLowerLeg", [rad(2 * k), 0, 0])
          : clampStudioMannequinJointRotation("rightLowerLeg", [rad(22 * k), 0, 0]),
      rightFoot:
        weightSide === "right"
          ? clampStudioMannequinJointRotation("rightFoot", [rad(-2 * k), 0, rad(-5 * k)])
          : clampStudioMannequinJointRotation("rightFoot", [rad(10 * k), 0, 0]),
    },
    pelvisOffset: basePose.pelvisOffset,
  });

  const stabilized = stabilizeStudioMannequinCenterOfMass(spec, candidate);
  return applyStudioMannequinJointLocks(basePose, stabilized, locks);
}

// ── 2. 경추-흉추 분산 시선 응시(Gaze Look-At Solver) ─────────────────────────

/**
 * 월드 공간 목표 지점(`targetWorld`, 예: 현재 카메라 위치)을 바라보도록
 * 가슴(15%) · 목(35%) · 머리(50%) 회전을 자연스러운 해부학 비율로 배분한다.
 * 잠긴 관절은 건드리지 않고 나머지 관절이 한계 안에서 시선을 보완한다.
 */
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

  // 골반의 월드 Y 요(Yaw)를 기준으로 상대 시선 방위각 계산 (+Z가 정면)
  const pelvisYaw = pose.joints.pelvis?.[1] ?? 0;
  const worldYaw = Math.atan2(dx, dz);
  let relYaw = worldYaw - pelvisYaw;
  while (relYaw > Math.PI) relYaw -= Math.PI * 2;
  while (relYaw < -Math.PI) relYaw += Math.PI * 2;
  relYaw = clamp(relYaw, -rad(115), rad(115));

  // 위(+Y)를 볼 때는 X축 음수 회전(신전), 아래(-Y)를 볼 때는 X축 양수 회전(굴곡)
  const relPitch = clamp(-Math.atan2(dy, Math.max(0.08, horizDist)), -rad(65), rad(65));

  const weights: readonly { id: StudioMannequinJointId; yawW: number; pitchW: number }[] = [
    { id: "chest", yawW: 0.15, pitchW: 0.12 },
    { id: "neck", yawW: 0.35, pitchW: 0.38 },
    { id: "head", yawW: 0.50, pitchW: 0.50 },
  ];

  const nextJoints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {
    ...pose.joints,
  };
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

// ── 3. 호흡 흉곽 확장(Breathing Ribcage Modulation) ──────────────────────────

/**
 * 호흡 단계(`breathPhase`: -1 최대 날숨/웅크림 ~ 0 평상시 ~ +1 최대 들숨/기합)에 맞춰
 * 흉곽 깊이·너비와 허리 수축을 생리학적으로 변조한 체형 파라미터를 반환한다.
 */
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
