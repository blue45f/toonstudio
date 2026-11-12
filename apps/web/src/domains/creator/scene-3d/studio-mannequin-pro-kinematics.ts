/**
 * Studio 3D 데생 인형 v3 — 프로 키네마틱스·무게중심(CoM) 밸런스·작화 보조선 엔진.
 *
 * 클립스튜디오 3D 데생 인형을 능가하기 위한 핵심 키네마틱스 및 작화 보조 기능:
 * 1. 관절 잠금(Joint Lock): 잠긴 관절은 IK·포즈 프리셋·미러·자동 균형 보정에서 보존.
 * 2. 견갑상완 리듬(Scapulohumeral Rhythm): 팔 거상 시 쇄골/견갑골이 2:1 해부학 비율로 자연 동반 회전해 어깨 찢어짐 방지.
 * 3. 생체역학 무게중심(Center of Mass) 추선 & 지지 다각형 밸런스 판정 + 원클릭 균형 보정.
 * 4. 작화 보조선(Loomis 두상 십자선 · 흉곽/골반 정중선 및 기울기 축 · 사지 단축법 등고선 링).
 *
 * CSP `.pep`/`.3dp` 브리지는 `studio-mannequin-csp-bridge.ts`에서 제공하며 여기서 함께 재노출한다.
 * Three.js 비의존 순수 모듈 — 단위 테스트 가능하며 결정적이다.
 */

import { studioMannequinMatrixFromEulerXyz as eulerToMat3 } from "./studio-mannequin-ik";
import {
  STUDIO_MANNEQUIN_JOINT_IDS,
  blendStudioMannequinBuild,
  clampStudioMannequinJointRotation,
  type StudioMannequinJointId,
  type StudioMannequinSpec,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import { normalizeStudioMannequinPose, type StudioMannequinPose } from "./studio-mannequin-poses";

export {
  exportMannequinParamsToCsp3dp,
  exportMannequinPoseToCspPep,
  importCsp3dpToMannequinParams,
  importCspPepPoseToMannequin,
  type CspPepImportResult,
} from "./studio-mannequin-csp-bridge";

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ── 1. 관절 잠금(Joint Lock) ─────────────────────────────────────────────────

export type StudioMannequinJointLockMap = Readonly<
  Partial<Record<StudioMannequinJointId, boolean>>
>;

export function toggleStudioMannequinJointLock(
  locks: StudioMannequinJointLockMap,
  jointId: StudioMannequinJointId,
): StudioMannequinJointLockMap {
  const next = { ...locks };
  if (next[jointId]) {
    delete next[jointId];
  } else {
    next[jointId] = true;
  }
  return Object.freeze(next);
}

export function countStudioMannequinLockedJoints(locks: StudioMannequinJointLockMap): number {
  return STUDIO_MANNEQUIN_JOINT_IDS.filter((id) => locks[id] === true).length;
}

/**
 * 새 포즈를 적용할 때 잠긴 관절은 이전(base) 포즈의 회전을 그대로 유지한다.
 */
export function applyStudioMannequinJointLocks(
  basePose: StudioMannequinPose,
  nextPose: StudioMannequinPose,
  locks: StudioMannequinJointLockMap,
  options: { readonly lockPelvisTranslation?: boolean } = {},
): StudioMannequinPose {
  const lockedIds = STUDIO_MANNEQUIN_JOINT_IDS.filter((id) => locks[id] === true);
  if (lockedIds.length === 0 && !options.lockPelvisTranslation) return nextPose;

  const mergedJoints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {
    ...nextPose.joints,
  };
  for (const id of lockedIds) {
    const prevRot = basePose.joints[id];
    if (prevRot) {
      mergedJoints[id] = prevRot;
    } else {
      delete mergedJoints[id];
    }
  }
  const pelvisOffset =
    options.lockPelvisTranslation || locks.pelvis
      ? basePose.pelvisOffset
      : nextPose.pelvisOffset;

  return normalizeStudioMannequinPose({
    joints: mergedJoints,
    pelvisOffset,
  });
}

// ── 2. 견갑상완 리듬(Scapulohumeral Rhythm) 해부학 연동 ──────────────────────

/**
 * 상완(UpperArm)을 옆으로 들어 올리거나(외전) 앞으로 높이 들 때(굴곡),
 * 해부학적 견갑상완 리듬(약 2:1 비율, 22° 이상 거상 시 활성)에 따라 쇄골(Shoulder)을
 * 자연스럽게 상방 회전·전인시킨다. 클립스튜디오의 고질적인 만세 포즈 어깨 함몰을 해결한다.
 */
export function applyStudioMannequinScapulohumeralRhythm(
  pose: StudioMannequinPose,
  locks: StudioMannequinJointLockMap = {},
  strength01 = 1,
): StudioMannequinPose {
  const s = clamp(Number.isFinite(strength01) ? strength01 : 1, 0, 1);
  if (s <= 0) return pose;

  const nextJoints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {
    ...pose.joints,
  };

  if (!locks.leftShoulder) {
    const lArm = pose.joints.leftUpperArm ?? [0, 0, 0];
    const abductExcess = Math.max(0, lArm[2] - rad(22));
    const flexExcess = Math.max(0, -lArm[0] - rad(45));
    const baseClav = pose.joints.leftShoulder ?? [0, 0, 0];
    const coupledZ = clamp(abductExcess * 0.32 * s + flexExcess * 0.14 * s, -rad(12), rad(28));
    const coupledY = clamp(
      (Math.max(0, -lArm[0]) * 0.16 - Math.max(0, lArm[0]) * 0.12) * s,
      -rad(24),
      rad(24),
    );
    nextJoints.leftShoulder = clampStudioMannequinJointRotation("leftShoulder", [
      baseClav[0],
      coupledY,
      coupledZ,
    ]);
  }

  if (!locks.rightShoulder) {
    const rArm = pose.joints.rightUpperArm ?? [0, 0, 0];
    const abductExcess = Math.max(0, -rArm[2] - rad(22));
    const flexExcess = Math.max(0, -rArm[0] - rad(45));
    const baseClav = pose.joints.rightShoulder ?? [0, 0, 0];
    const coupledZ = -clamp(abductExcess * 0.32 * s + flexExcess * 0.14 * s, -rad(12), rad(28));
    const coupledY = -clamp(
      (Math.max(0, -rArm[0]) * 0.16 - Math.max(0, rArm[0]) * 0.12) * s,
      -rad(24),
      rad(24),
    );
    nextJoints.rightShoulder = clampStudioMannequinJointRotation("rightShoulder", [
      baseClav[0],
      coupledY,
      coupledZ,
    ]);
  }

  return normalizeStudioMannequinPose({
    joints: nextJoints,
    pelvisOffset: pose.pelvisOffset,
  });
}

// ── 3. 전진 운동학(FK) & 무게중심(Center of Mass) 밸런스 분석기 ──────────────

type Mat3Tuple = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

function mulMat3(a: Mat3Tuple, b: Mat3Tuple): Mat3Tuple {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

function applyMat3(m: Mat3Tuple, v: StudioMannequinVec3): StudioMannequinVec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

const IDENTITY_MAT3: Mat3Tuple = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Winter 인체측정학 기반 분절 질량 가중치 (합계 = 1.0). */
const JOINT_MASS_WEIGHTS: Readonly<Record<StudioMannequinJointId, number>> = Object.freeze({
  pelvis: 0.142,
  spine: 0.135,
  chest: 0.196,
  neck: 0.024,
  head: 0.057,
  leftShoulder: 0.012,
  leftUpperArm: 0.028,
  leftLowerArm: 0.016,
  leftHand: 0.006,
  rightShoulder: 0.012,
  rightUpperArm: 0.028,
  rightLowerArm: 0.016,
  rightHand: 0.006,
  leftUpperLeg: 0.100,
  leftLowerLeg: 0.0465,
  leftFoot: 0.0145,
  rightUpperLeg: 0.100,
  rightLowerLeg: 0.0465,
  rightFoot: 0.0145,
});

export type StudioMannequinBalanceState =
  | "balanced"
  | "edge"
  | "off-balance"
  | "airborne";

export interface StudioMannequinBalanceReport {
  readonly centerOfMass: StudioMannequinVec3;
  readonly groundProjection: StudioMannequinVec3;
  readonly supportCenter: StudioMannequinVec3;
  readonly supportRadiusM: number;
  readonly horizontalOffsetCm: number;
  readonly stabilityMarginCm: number;
  readonly state: StudioMannequinBalanceState;
  readonly groundedContacts: readonly StudioMannequinVec3[];
}

export function computeStudioMannequinWorldJointPositions(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
): Readonly<Record<StudioMannequinJointId, StudioMannequinVec3>> {
  const posMap = {} as Record<StudioMannequinJointId, StudioMannequinVec3>;
  const rotMap = {} as Record<StudioMannequinJointId, Mat3Tuple>;

  for (const jointSpec of spec.joints) {
    const euler = clampStudioMannequinJointRotation(
      jointSpec.id,
      pose.joints[jointSpec.id] ?? [0, 0, 0],
    );
    const localRot = eulerToMat3(euler) as unknown as Mat3Tuple;
    if (!jointSpec.parentId) {
      posMap[jointSpec.id] = [
        jointSpec.offset[0] + pose.pelvisOffset[0],
        jointSpec.offset[1] + pose.pelvisOffset[1],
        jointSpec.offset[2] + pose.pelvisOffset[2],
      ];
      rotMap[jointSpec.id] = localRot;
    } else {
      const parentPos = posMap[jointSpec.parentId] ?? [0, 0, 0];
      const parentRot = rotMap[jointSpec.parentId] ?? IDENTITY_MAT3;
      const worldOffset = applyMat3(parentRot, jointSpec.offset);
      posMap[jointSpec.id] = [
        parentPos[0] + worldOffset[0],
        parentPos[1] + worldOffset[1],
        parentPos[2] + worldOffset[2],
      ];
      rotMap[jointSpec.id] = mulMat3(parentRot, localRot);
    }
  }
  return posMap;
}

/**
 * 현재 체형과 포즈에서 3D 무게중심(CoM), 바닥 투영 추선, 접지 지지면 안정성을 분석한다.
 */
export function analyzeStudioMannequinBalance(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
): StudioMannequinBalanceReport {
  const worldPos = computeStudioMannequinWorldJointPositions(spec, pose);
  let totalWeight = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;

  for (const id of STUDIO_MANNEQUIN_JOINT_IDS) {
    const w = JOINT_MASS_WEIGHTS[id] ?? 0.01;
    const p = worldPos[id];
    const yShift = id === "head" ? spec.headUnit * 0.45 : 0;
    cx += p[0] * w;
    cy += (p[1] + yShift) * w;
    cz += p[2] * w;
    totalWeight += w;
  }

  const com: StudioMannequinVec3 = [cx / totalWeight, cy / totalWeight, cz / totalWeight];
  const groundProjection: StudioMannequinVec3 = [com[0], 0, com[2]];

  const ankleThreshold = Math.max(0.16, spec.headUnit * 0.58);
  const candidateJoints: readonly StudioMannequinJointId[] = [
    "leftFoot",
    "rightFoot",
    "leftLowerLeg",
    "rightLowerLeg",
    "pelvis",
  ];
  const groundedContacts: StudioMannequinVec3[] = [];
  const footLen = 0.95 * spec.headUnit * (spec.params.footScale ?? 1);

  for (const jId of candidateJoints) {
    const p = worldPos[jId];
    if (p[1] <= ankleThreshold) {
      if (jId === "leftFoot" || jId === "rightFoot") {
        groundedContacts.push([p[0], 0, p[2] - 0.04 * footLen]);
        groundedContacts.push([p[0], 0, p[2] + 0.48 * footLen]);
      } else {
        groundedContacts.push([p[0], 0, p[2]]);
      }
    }
  }

  if (groundedContacts.length === 0) {
    return {
      centerOfMass: com,
      groundProjection,
      supportCenter: [0, 0, 0],
      supportRadiusM: 0.12,
      horizontalOffsetCm: Math.round(Math.hypot(com[0], com[2]) * 1000) / 10,
      stabilityMarginCm: -Math.round(Math.hypot(com[0], com[2]) * 1000) / 10,
      state: "airborne",
      groundedContacts: [],
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of groundedContacts) {
    minX = Math.min(minX, c[0]);
    maxX = Math.max(maxX, c[0]);
    minZ = Math.min(minZ, c[2]);
    maxZ = Math.max(maxZ, c[2]);
  }
  const footHalfWidth = 0.14 * spec.headUnit * (spec.params.footScale ?? 1);
  minX -= footHalfWidth;
  maxX += footHalfWidth;
  minZ -= footHalfWidth * 0.65;
  maxZ += footHalfWidth * 0.85;

  const supportCenter: StudioMannequinVec3 = [(minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5];
  const halfSpanX = Math.max(0.05, (maxX - minX) * 0.5);
  const halfSpanZ = Math.max(0.06, (maxZ - minZ) * 0.5);
  const supportRadiusM = Math.hypot(halfSpanX, halfSpanZ) * 0.72;

  const dxOut = Math.max(0, Math.abs(com[0] - supportCenter[0]) - halfSpanX);
  const dzOut = Math.max(0, Math.abs(com[2] - supportCenter[2]) - halfSpanZ);
  const outsideDist = Math.hypot(dxOut, dzOut);
  const insideMargin = Math.min(
    halfSpanX - Math.abs(com[0] - supportCenter[0]),
    halfSpanZ - Math.abs(com[2] - supportCenter[2]),
  );
  const marginM = outsideDist > 0 ? -outsideDist : insideMargin;
  const offsetM = Math.hypot(com[0] - supportCenter[0], com[2] - supportCenter[2]);

  const state: StudioMannequinBalanceState =
    outsideDist > 0.005
      ? "off-balance"
      : marginM < 0.028
        ? "edge"
        : "balanced";

  return {
    centerOfMass: com,
    groundProjection,
    supportCenter,
    supportRadiusM,
    horizontalOffsetCm: Math.round(offsetM * 1000) / 10,
    stabilityMarginCm: Math.round(marginM * 1000) / 10,
    state,
    groundedContacts,
  };
}

/**
 * 원클릭 무게중심 자동 균형(Auto-Balance): 접지된 발을 기준으로 골반 수평 오프셋을 이동시켜
 * 무게중심 추선이 지지면 중앙에 안착하도록 보정한다. 공중 점프 포즈는 건드리지 않는다.
 */
export function stabilizeStudioMannequinCenterOfMass(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
): StudioMannequinPose {
  const report = analyzeStudioMannequinBalance(spec, pose);
  if (report.state === "airborne") return pose;
  const shiftX = report.supportCenter[0] - report.centerOfMass[0];
  const shiftZ = report.supportCenter[2] - report.centerOfMass[2];
  return normalizeStudioMannequinPose({
    joints: pose.joints,
    pelvisOffset: [
      pose.pelvisOffset[0] + shiftX * 0.88,
      pose.pelvisOffset[1],
      pose.pelvisOffset[2] + shiftZ * 0.88,
    ],
  });
}

// ── 4. 작화 보조선(Loomis 십자선 · 정중선 · 사지 단축 등고선) ─────────────────

export interface StudioMannequinGuideVisibility {
  readonly loomisHead: boolean;
  readonly torsoCenterline: boolean;
  readonly limbCrossContours: boolean;
  readonly balancePlumbLine: boolean;
  readonly lineOfAction?: boolean;
}

export const STUDIO_MANNEQUIN_DEFAULT_GUIDE_VISIBILITY: StudioMannequinGuideVisibility =
  Object.freeze({
    loomisHead: true,
    torsoCenterline: true,
    limbCrossContours: true,
    balancePlumbLine: true,
    lineOfAction: true,
  });

export interface StudioMannequinGuidePolyline {
  readonly id: string;
  readonly jointId: StudioMannequinJointId;
  readonly kind: "loomis" | "centerline" | "contour";
  readonly closed: boolean;
  readonly points: readonly StudioMannequinVec3[];
}

function makeEllipseRing(
  center: StudioMannequinVec3,
  rx: number,
  rz: number,
  plane: "xz" | "yz" | "xy",
  segments = 28,
): readonly StudioMannequinVec3[] {
  const pts: StudioMannequinVec3[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const th = (2 * Math.PI * i) / segments;
    const c = Math.cos(th);
    const s = Math.sin(th);
    if (plane === "xz") {
      pts.push([center[0] + rx * c, center[1], center[2] + rz * s]);
    } else if (plane === "yz") {
      pts.push([center[0], center[1] + rx * c, center[2] + rz * s]);
    } else {
      pts.push([center[0] + rx * c, center[1] + rz * s, center[2]]);
    }
  }
  return pts;
}

/**
 * 선택된 작화 보조선 옵션에 따라 관절 로컬 좌표계의 3D 보조선 폴리라인 배열을 생성한다.
 */
export function buildStudioMannequinConstructionGuides(
  spec: StudioMannequinSpec,
  visibility: Partial<StudioMannequinGuideVisibility> = STUDIO_MANNEQUIN_DEFAULT_GUIDE_VISIBILITY,
): readonly StudioMannequinGuidePolyline[] {
  const hu = spec.headUnit;
  const p = spec.params;
  const build = blendStudioMannequinBuild(p.build);
  const faceW = p.faceWidth ?? 1;
  const torsoDepth = p.torsoDepth ?? 1;
  const limbR = build.limbRadius * (p.limbThickness ?? 1);
  const lines: StudioMannequinGuidePolyline[] = [];

  if (visibility.loomisHead ?? true) {
    const hc: StudioMannequinVec3 = [0, hu * 0.5, -0.015 * hu];
    lines.push(
      {
        id: "loomis-head-median",
        jointId: "head",
        kind: "loomis",
        closed: true,
        points: makeEllipseRing(hc, hu * 0.508, hu * 0.425, "yz", 32),
      },
      {
        id: "loomis-head-brow",
        jointId: "head",
        kind: "loomis",
        closed: true,
        points: makeEllipseRing([0, hu * 0.56, -0.015 * hu], hu * 0.388 * faceW, hu * 0.422, "xz", 32),
      },
    );
    for (const sx of [-1, 1] as const) {
      lines.push({
        id: `loomis-head-side-${sx > 0 ? "L" : "R"}`,
        jointId: "head",
        kind: "loomis",
        closed: true,
        points: makeEllipseRing([sx * 0.33 * hu * faceW, hu * 0.52, -0.01 * hu], hu * 0.27, hu * 0.27, "yz", 24),
      });
    }
  }

  if (visibility.torsoCenterline ?? true) {
    const chestJoint = spec.joints.find((j) => j.id === "chest");
    const neckJoint = spec.joints.find((j) => j.id === "neck");
    const chestH = (chestJoint?.offset[1] ?? 0.18) + (neckJoint?.offset[1] ?? 0.18) * 0.5;
    const halfShoulder = 0.78 * hu * p.shoulderWidth * build.shoulder;
    const hipHalf = 0.36 * hu * p.pelvisWidth;
    lines.push(
      {
        id: "torso-shoulder-axis",
        jointId: "chest",
        kind: "centerline",
        closed: false,
        points: [
          [-halfShoulder, chestH * 0.52, 0],
          [halfShoulder, chestH * 0.52, 0],
        ],
      },
      {
        id: "torso-pelvis-axis",
        jointId: "pelvis",
        kind: "centerline",
        closed: false,
        points: [
          [-hipHalf, 0.08 * hu, 0.16 * hu * torsoDepth],
          [hipHalf, 0.08 * hu, 0.16 * hu * torsoDepth],
        ],
      },
      {
        id: "torso-ribcage-equator",
        jointId: "chest",
        kind: "centerline",
        closed: true,
        points: makeEllipseRing(
          [0, chestH * 0.32, 0],
          0.46 * hu * p.shoulderWidth * (p.chestWidth ?? 1) * build.torsoUpper,
          0.26 * hu * torsoDepth,
          "xz",
          32,
        ),
      },
    );
  }

  if (visibility.limbCrossContours ?? true) {
    for (const side of ["left", "right"] as const) {
      const armChain = spec.chains[side === "left" ? "leftArm" : "rightArm"];
      const legChain = spec.chains[side === "left" ? "leftLeg" : "rightLeg"];
      const uArmR = 0.128 * hu * limbR * (p.upperArmThickness ?? 1);
      const fArmR = 0.105 * hu * limbR * (p.forearmThickness ?? 1);
      const thighR = 0.168 * hu * limbR * (p.thighThickness ?? 1);
      const calfR = 0.132 * hu * limbR * (p.calfThickness ?? 1);

      lines.push(
        {
          id: `contour-${side}-upper-arm`,
          jointId: side === "left" ? "leftUpperArm" : "rightUpperArm",
          kind: "contour",
          closed: true,
          points: makeEllipseRing([0, -0.48 * armChain.upperLength, 0], uArmR, uArmR * 1.04, "xz", 24),
        },
        {
          id: `contour-${side}-forearm`,
          jointId: side === "left" ? "leftLowerArm" : "rightLowerArm",
          kind: "contour",
          closed: true,
          points: makeEllipseRing([0, -0.42 * armChain.lowerLength, 0], fArmR * 1.04, fArmR * 0.92, "xz", 24),
        },
        {
          id: `contour-${side}-thigh`,
          jointId: side === "left" ? "leftUpperLeg" : "rightUpperLeg",
          kind: "contour",
          closed: true,
          points: makeEllipseRing([0, -0.46 * legChain.upperLength, 0], thighR, thighR * 1.05, "xz", 24),
        },
        {
          id: `contour-${side}-calf`,
          jointId: side === "left" ? "leftLowerLeg" : "rightLowerLeg",
          kind: "contour",
          closed: true,
          points: makeEllipseRing([0, -0.36 * legChain.lowerLength, -0.015 * hu], calfR, calfR * 1.08, "xz", 24),
        },
      );
    }
  }

  return lines;
}
