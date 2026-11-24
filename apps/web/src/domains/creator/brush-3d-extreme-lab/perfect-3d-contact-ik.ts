/**
 * Wave 38F — 1드래그 전신 Contact-Lock IK 솔버.
 * 발바닥 지면 0mm 비관통 + 의자/소품/커플 손목 자석 고정 + 무게중심(CoM) 균형 유지를 수행한다.
 */

export type Vec3 = readonly [number, number, number];

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export type HumanoidJointId =
  | "pelvis"
  | "spine"
  | "chest"
  | "head"
  | "leftShoulder"
  | "leftElbow"
  | "leftHand"
  | "rightShoulder"
  | "rightElbow"
  | "rightHand"
  | "leftHip"
  | "leftKnee"
  | "leftAnkle"
  | "leftToe"
  | "rightHip"
  | "rightKnee"
  | "rightAnkle"
  | "rightToe";

export type ContactLockKind = "ground-foot" | "chair-seat" | "prop-grip" | "couple-wrist";

export interface ContactLockTarget {
  readonly id: string;
  readonly labelKo: string;
  readonly joint: "leftHand" | "rightHand" | "pelvis" | "leftAnkle" | "rightAnkle";
  readonly kind: ContactLockKind;
  readonly targetPos: Vec3;
  readonly magnetStrength: number;
  readonly lockRadiusM: number;
}

export interface ContactLockDragHandle {
  readonly joint: "pelvis" | "leftHand" | "rightHand" | "head";
  readonly targetPos: Vec3;
}

export interface ContactLockIkRequest {
  readonly dragHandle?: ContactLockDragHandle;
  readonly contactLocks?: readonly ContactLockTarget[];
  readonly groundPlaneY?: number;
  readonly enableBalanceCompensation?: boolean;
}

export interface ContactLockIkResult {
  readonly joints: Readonly<Record<HumanoidJointId, Vec3>>;
  readonly groundPenetrationMm: number;
  readonly leftFootElevationMm: number;
  readonly rightFootElevationMm: number;
  readonly contactErrorsMm: Readonly<Record<string, number>>;
  readonly maxContactErrorMm: number;
  readonly centerOfMass: Vec3;
  readonly supportCentroid: Vec3;
  readonly comBalanceOffsetM: number;
  readonly isBalanced: boolean;
  readonly appliedLocksCount: number;
}

export type ContactLockPresetId = "standing-prop-reach" | "chair-sit-lock" | "couple-wrist-hold";

export interface ContactLockPreset {
  readonly id: ContactLockPresetId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly request: ContactLockIkRequest;
}

export const CONTACT_LOCK_PRESETS: readonly ContactLockPreset[] = [
  {
    id: "standing-prop-reach",
    labelKo: "서서 소품 잡기",
    summaryKo: "양발 지면 0mm 고정 + 오른손 검/소품 자석 락 + 무게중심 자동 균형",
    request: {
      dragHandle: { joint: "pelvis", targetPos: [0.06, 0.88, 0.04] },
      contactLocks: [
        {
          id: "left-foot-ground",
          labelKo: "왼발 지면 접지",
          joint: "leftAnkle",
          kind: "ground-foot",
          targetPos: [-0.14, 0, 0.02],
          magnetStrength: 1,
          lockRadiusM: 0.08,
        },
        {
          id: "right-foot-ground",
          labelKo: "오른발 지면 접지",
          joint: "rightAnkle",
          kind: "ground-foot",
          targetPos: [0.15, 0, -0.02],
          magnetStrength: 1,
          lockRadiusM: 0.08,
        },
        {
          id: "prop-sword-grip",
          labelKo: "오른손 소품 자석 고정",
          joint: "rightHand",
          kind: "prop-grip",
          targetPos: [0.42, 1.12, 0.28],
          magnetStrength: 0.96,
          lockRadiusM: 0.25,
        },
      ],
      groundPlaneY: 0,
      enableBalanceCompensation: true,
    },
  },
  {
    id: "chair-sit-lock",
    labelKo: "의자 착석 고정",
    summaryKo: "의자 좌판 46cm 골반 자석 고정 + 양발 지면 0mm 밀착",
    request: {
      dragHandle: { joint: "pelvis", targetPos: [0, 0.44, -0.1] },
      contactLocks: [
        {
          id: "chair-seat-pelvis",
          labelKo: "의자 좌판 자석 고정",
          joint: "pelvis",
          kind: "chair-seat",
          targetPos: [0, 0.48, -0.08],
          magnetStrength: 1,
          lockRadiusM: 0.22,
        },
        {
          id: "left-foot-ground",
          labelKo: "왼발 지면 접지",
          joint: "leftAnkle",
          kind: "ground-foot",
          targetPos: [-0.14, 0, 0.24],
          magnetStrength: 1,
          lockRadiusM: 0.12,
        },
        {
          id: "right-foot-ground",
          labelKo: "오른발 지면 접지",
          joint: "rightAnkle",
          kind: "ground-foot",
          targetPos: [0.14, 0, 0.24],
          magnetStrength: 1,
          lockRadiusM: 0.12,
        },
      ],
      groundPlaneY: 0,
      enableBalanceCompensation: true,
    },
  },
  {
    id: "couple-wrist-hold",
    labelKo: "커플 손목 자석 락",
    summaryKo: "양발 지면 고정 상태에서 상대 손목 앵커에 왼손 자석 결속",
    request: {
      dragHandle: { joint: "pelvis", targetPos: [-0.04, 0.92, 0.03] },
      contactLocks: [
        {
          id: "left-foot-ground",
          labelKo: "왼발 지면 접지",
          joint: "leftAnkle",
          kind: "ground-foot",
          targetPos: [-0.15, 0, 0],
          magnetStrength: 1,
          lockRadiusM: 0.1,
        },
        {
          id: "right-foot-ground",
          labelKo: "오른발 지면 접지",
          joint: "rightAnkle",
          kind: "ground-foot",
          targetPos: [0.15, 0, 0],
          magnetStrength: 1,
          lockRadiusM: 0.1,
        },
        {
          id: "couple-wrist-magnet",
          labelKo: "커플 손목 자석 고정",
          joint: "leftHand",
          kind: "couple-wrist",
          targetPos: [-0.36, 1.04, 0.26],
          magnetStrength: 0.98,
          lockRadiusM: 0.28,
        },
      ],
      groundPlaneY: 0,
      enableBalanceCompensation: true,
    },
  },
] as const;

export function clamp3d(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function formatOklchColor(color: OklchColor, alpha?: number): string {
  const l = clamp3d(color.l, 0, 1).toFixed(3);
  const c = clamp3d(color.c, 0, 0.37).toFixed(3);
  const h = (((color.h % 360) + 360) % 360).toFixed(1);
  if (typeof alpha === "number" && Number.isFinite(alpha) && alpha < 0.999) {
    return `oklch(${l} ${c} ${h} / ${clamp3d(alpha, 0, 1).toFixed(2)})`;
  }
  return `oklch(${l} ${c} ${h})`;
}

export function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function len3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function norm3(v: Vec3, fallback: Vec3 = [0, 1, 0]): Vec3 {
  const l = len3(v);
  if (l < 1e-6) return fallback;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function dist3(a: Vec3, b: Vec3): number {
  return len3(sub3(a, b));
}

function solveTwoBoneIk(
  root: Vec3,
  target: Vec3,
  poleHint: Vec3,
  lenUpper: number,
  lenLower: number,
): { readonly mid: Vec3; readonly end: Vec3 } {
  const toTarget = sub3(target, root);
  const rawDist = len3(toTarget);
  const minReach = Math.max(0.04, Math.abs(lenUpper - lenLower) + 0.02);
  const maxReach = Math.max(minReach + 0.02, lenUpper + lenLower - 0.002);
  const clampedDist = clamp3d(rawDist, minReach, maxReach);
  const dir = norm3(toTarget, [0, -1, 0]);
  const end = add3(root, scale3(dir, clampedDist));

  const cosAngle = clamp3d(
    (lenUpper * lenUpper + clampedDist * clampedDist - lenLower * lenLower) /
      (2 * lenUpper * clampedDist),
    -1,
    1,
  );
  const sinAngle = Math.sqrt(Math.max(0, 1 - cosAngle * cosAngle));

  const poleVec = sub3(poleHint, root);
  const polePerp = sub3(poleVec, scale3(dir, dot3(poleVec, dir)));
  const bendDir =
    len3(polePerp) > 1e-5 ? norm3(polePerp) : norm3(cross3(dir, [1, 0, 0]), [0, 0, 1]);

  const mid = add3(
    add3(root, scale3(dir, lenUpper * cosAngle)),
    scale3(bendDir, lenUpper * sinAngle),
  );
  return { mid, end };
}

export function createDefaultHumanoidSkeleton(): Record<HumanoidJointId, Vec3> {
  return {
    pelvis: [0, 0.94, 0],
    spine: [0, 1.14, 0],
    chest: [0, 1.36, 0],
    head: [0, 1.62, 0.02],
    leftShoulder: [-0.18, 1.36, 0],
    leftElbow: [-0.26, 1.09, -0.02],
    leftHand: [-0.3, 0.84, 0.04],
    rightShoulder: [0.18, 1.36, 0],
    rightElbow: [0.26, 1.09, -0.02],
    rightHand: [0.3, 0.84, 0.04],
    leftHip: [-0.11, 0.92, 0],
    leftKnee: [-0.12, 0.48, 0.03],
    leftAnkle: [-0.13, 0, 0],
    leftToe: [-0.13, 0, 0.14],
    rightHip: [0.11, 0.92, 0],
    rightKnee: [0.12, 0.48, 0.03],
    rightAnkle: [0.13, 0, 0],
    rightToe: [0.13, 0, 0.14],
  };
}

/**
 * 1드래그 전신 Contact-Lock IK 솔버.
 */
export function solveContactLockIk(request: ContactLockIkRequest = {}): ContactLockIkResult {
  const groundY = request.groundPlaneY ?? 0;
  const locks = request.contactLocks ?? [];
  const enableBalance = request.enableBalanceCompensation ?? true;
  const base = createDefaultHumanoidSkeleton();

  const thighLen = 0.46;
  const shinLen = 0.46;
  const upperArmLen = 0.31;
  const forearmLen = 0.29;

  let pelvisPos: Vec3 =
    request.dragHandle?.joint === "pelvis" ? request.dragHandle.targetPos : base.pelvis;

  const pelvisLock = locks.find((l) => l.joint === "pelvis");
  if (pelvisLock) {
    const d = dist3(pelvisPos, pelvisLock.targetPos);
    const snapWeight =
      d <= pelvisLock.lockRadiusM
        ? clamp3d(pelvisLock.magnetStrength, 0, 1)
        : clamp3d(pelvisLock.magnetStrength * 0.45, 0, 1);
    pelvisPos = add3(scale3(pelvisPos, 1 - snapWeight), scale3(pelvisLock.targetPos, snapWeight));
  }

  const leftFootLock = locks.find((l) => l.joint === "leftAnkle");
  const rightFootLock = locks.find((l) => l.joint === "rightAnkle");
  const leftAnkleTarget: Vec3 = leftFootLock
    ? [
        leftFootLock.targetPos[0],
        Math.max(groundY, leftFootLock.targetPos[1]),
        leftFootLock.targetPos[2],
      ]
    : [base.leftAnkle[0], groundY, base.leftAnkle[2]];
  const rightAnkleTarget: Vec3 = rightFootLock
    ? [
        rightFootLock.targetPos[0],
        Math.max(groundY, rightFootLock.targetPos[1]),
        rightFootLock.targetPos[2],
      ]
    : [base.rightAnkle[0], groundY, base.rightAnkle[2]];

  const supportPoints: Vec3[] = [leftAnkleTarget, rightAnkleTarget];
  if (pelvisLock) supportPoints.push(pelvisLock.targetPos);
  const supportCentroid: Vec3 = [
    supportPoints.reduce((acc, p) => acc + p[0], 0) / supportPoints.length,
    groundY,
    supportPoints.reduce((acc, p) => acc + p[2], 0) / supportPoints.length,
  ];

  const maxLegReachY = groundY + thighLen + shinLen - 0.015;
  const minPelvisY = groundY + 0.34;
  pelvisPos = [pelvisPos[0], clamp3d(pelvisPos[1], minPelvisY, maxLegReachY), pelvisPos[2]];

  if (enableBalance) {
    const dx = pelvisPos[0] - supportCentroid[0];
    const dz = pelvisPos[2] - supportCentroid[2];
    const horizDist = Math.hypot(dx, dz);
    const maxSafeRadius = pelvisLock ? 0.24 : 0.16;
    if (horizDist > maxSafeRadius) {
      const pull = (horizDist - maxSafeRadius) * 0.78;
      pelvisPos = [
        pelvisPos[0] - (dx / horizDist) * pull,
        pelvisPos[1],
        pelvisPos[2] - (dz / horizDist) * pull,
      ];
    }
  }

  const spine: Vec3 = add3(pelvisPos, [0, 0.2, 0.01]);
  const chest: Vec3 = add3(pelvisPos, [0, 0.42, 0.02]);
  const headTarget: Vec3 =
    request.dragHandle?.joint === "head"
      ? request.dragHandle.targetPos
      : add3(chest, [0, 0.26, 0.02]);
  const head: Vec3 = add3(chest, scale3(norm3(sub3(headTarget, chest), [0, 1, 0]), 0.26));

  const leftShoulder: Vec3 = add3(chest, [-0.18, 0, 0]);
  const rightShoulder: Vec3 = add3(chest, [0.18, 0, 0]);
  const leftHip: Vec3 = add3(pelvisPos, [-0.11, -0.02, 0]);
  const rightHip: Vec3 = add3(pelvisPos, [0.11, -0.02, 0]);

  const leftLeg = solveTwoBoneIk(
    leftHip,
    leftAnkleTarget,
    add3(leftHip, [-0.04, -0.25, 0.45]),
    thighLen,
    shinLen,
  );
  const rightLeg = solveTwoBoneIk(
    rightHip,
    rightAnkleTarget,
    add3(rightHip, [0.04, -0.25, 0.45]),
    thighLen,
    shinLen,
  );

  const resolveHandTarget = (
    side: "leftHand" | "rightHand",
    shoulder: Vec3,
    defaultOffset: Vec3,
  ): Vec3 => {
    const raw =
      request.dragHandle?.joint === side
        ? request.dragHandle.targetPos
        : add3(shoulder, defaultOffset);
    const lock = locks.find((l) => l.joint === side);
    if (!lock) return raw;
    const w = clamp3d(lock.magnetStrength, 0, 1);
    return add3(scale3(raw, 1 - w), scale3(lock.targetPos, w));
  };

  const leftArm = solveTwoBoneIk(
    leftShoulder,
    resolveHandTarget("leftHand", leftShoulder, [-0.12, -0.5, 0.08]),
    add3(leftShoulder, [-0.28, -0.2, -0.22]),
    upperArmLen,
    forearmLen,
  );
  const rightArm = solveTwoBoneIk(
    rightShoulder,
    resolveHandTarget("rightHand", rightShoulder, [0.12, -0.5, 0.08]),
    add3(rightShoulder, [0.28, -0.2, -0.22]),
    upperArmLen,
    forearmLen,
  );

  const clampFloor = (v: Vec3): Vec3 => [v[0], Math.max(groundY, v[1]), v[2]];
  const leftAnkle = clampFloor(leftLeg.end);
  const rightAnkle = clampFloor(rightLeg.end);
  const leftToe: Vec3 = [leftAnkle[0], Math.max(groundY, leftAnkle[1]), leftAnkle[2] + 0.14];
  const rightToe: Vec3 = [rightAnkle[0], Math.max(groundY, rightAnkle[1]), rightAnkle[2] + 0.14];

  const joints: Record<HumanoidJointId, Vec3> = {
    pelvis: clampFloor(pelvisPos),
    spine: clampFloor(spine),
    chest: clampFloor(chest),
    head: clampFloor(head),
    leftShoulder: clampFloor(leftShoulder),
    leftElbow: clampFloor(leftArm.mid),
    leftHand: clampFloor(leftArm.end),
    rightShoulder: clampFloor(rightShoulder),
    rightElbow: clampFloor(rightArm.mid),
    rightHand: clampFloor(rightArm.end),
    leftHip: clampFloor(leftHip),
    leftKnee: clampFloor(leftLeg.mid),
    leftAnkle,
    leftToe,
    rightHip: clampFloor(rightHip),
    rightKnee: clampFloor(rightLeg.mid),
    rightAnkle,
    rightToe,
  };

  let maxPenetrationM = 0;
  for (const pos of Object.values(joints)) {
    if (pos[1] < groundY) {
      maxPenetrationM = Math.max(maxPenetrationM, groundY - pos[1]);
    }
  }

  const contactErrorsMm: Record<string, number> = {};
  let maxContactErrorMm = 0;
  for (const lock of locks) {
    const errMm = dist3(joints[lock.joint], lock.targetPos) * 1000;
    contactErrorsMm[lock.id] = Number(errMm.toFixed(2));
    if (errMm > maxContactErrorMm) maxContactErrorMm = errMm;
  }

  const weighted: ReadonlyArray<readonly [Vec3, number]> = [
    [joints.pelvis, 0.24],
    [joints.spine, 0.18],
    [joints.chest, 0.2],
    [joints.head, 0.08],
    [joints.leftKnee, 0.08],
    [joints.rightKnee, 0.08],
    [joints.leftElbow, 0.07],
    [joints.rightElbow, 0.07],
  ];
  let comX = 0;
  let comY = 0;
  let comZ = 0;
  for (const [pos, weight] of weighted) {
    comX += pos[0] * weight;
    comY += pos[1] * weight;
    comZ += pos[2] * weight;
  }
  const centerOfMass: Vec3 = [comX, comY, comZ];
  const comBalanceOffsetM = Math.hypot(comX - supportCentroid[0], comZ - supportCentroid[2]);
  const balanceThresholdM = pelvisLock ? 0.28 : 0.22;

  return {
    joints,
    groundPenetrationMm: Number((maxPenetrationM * 1000).toFixed(4)),
    leftFootElevationMm: Number(((joints.leftAnkle[1] - groundY) * 1000).toFixed(2)),
    rightFootElevationMm: Number(((joints.rightAnkle[1] - groundY) * 1000).toFixed(2)),
    contactErrorsMm,
    maxContactErrorMm: Number(maxContactErrorMm.toFixed(2)),
    centerOfMass,
    supportCentroid,
    comBalanceOffsetM: Number(comBalanceOffsetM.toFixed(4)),
    isBalanced: comBalanceOffsetM <= balanceThresholdM,
    appliedLocksCount: locks.length,
  };
}
