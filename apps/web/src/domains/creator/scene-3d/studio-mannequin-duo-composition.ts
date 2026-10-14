/**
 * Studio 3D 데생 인형 — 다인(2인) 구도 원클릭 배치 솔버(순수 데이터 계층).
 *
 * 2인 포즈 프리셋(포옹·백허그·벽치기 등)을 적용할 때 상대 캐릭터를 손으로
 * 끌어 맞추지 않아도 되도록, 상대의 거리·방향(시선)·높이를 자동 배치한다.
 *
 * - 거리: 구도별 기준 간격에 두 체형의 몸통 반경을 반영하고, 몸통끼리
 *   관통하면 접촉 허용분까지만 겹치게 밀어내는 충돌 보정을 거친다.
 * - 시선: 두 캐릭터의 얼굴 위치를 FK(순방향 운동학)로 구해 목·머리 회전을
 *   관절 한계 안에서 나눠 얹어 서로를 바라보게 한다.
 * - 높이/접지: 상대 포즈를 FK로 평가해 가장 낮은 발바닥이 지면(y=0)에
 *   닿도록 루트 높이를 보정한다(키 차이가 크면 경고 영수증을 남긴다).
 *
 * Three.js import 없음 — 씬의 포즈 적용 계약(오일러 XYZ, 골반 오프셋)을
 * 그대로 재현한 결정적 계산이라 단위 테스트가 가능하다. 주인공은 원점에서
 * +Z를 바라보는 것으로 두고, 상대 배치(오프셋·요)는 주인공 로컬 프레임
 * 기준으로 반환한다. 호스트는 이 값을 두 번째 인형의 루트에 얹기만 하면 된다.
 */

import {
  buildStudioMannequinSpec,
  clampStudioMannequinBodyParams,
  clampStudioMannequinJointRotation,
  studioMannequinRestJointPosition,
  type StudioMannequinBodyParams,
  type StudioMannequinJointId,
  type StudioMannequinSpec,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  mirrorStudioMannequinPose,
  normalizeStudioMannequinPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";

// ── 구도 스펙 ────────────────────────────────────────────────────────────────

/** 상대의 배치 방식. */
export type StudioMannequinDuoArrangement =
  | "face-to-face" // 마주 보기 (포옹·하이파이브·벽치기)
  | "front-same-facing" // 주인공 앞, 같은 방향 (백허그의 상대)
  | "side-by-side"; // 나란히 (손잡기·팔짱·어깨 기대기)

export type StudioMannequinDuoPartnerPoseSource =
  | "mirror-lead" // 주인공 포즈를 좌우 반전해 대칭 상대역으로
  | "stand-relaxed" // 편안히 선 기본 자세
  | "authored"; // 구도 전용으로 저작한 상대 포즈

export type StudioMannequinDuoGazeMode =
  | "mutual" // 서로 바라보기
  | "lead-to-partner" // 주인공만 상대를 바라보기
  | "partner-to-lead" // 상대만 주인공을 바라보기
  | "none"; // 시선 보정 없음 (걷기 등 전방 주시 연출)

export interface StudioMannequinDuoCompositionSpec {
  readonly id: string;
  /** 이 구도가 대응하는 포즈 프리셋 id들(데생 인형/웹툰 라이브러리 공용). */
  readonly presetIds: readonly string[];
  readonly label: string;
  readonly arrangement: StudioMannequinDuoArrangement;
  /** 나란히 배치일 때 상대가 서는 쪽. +1 = 주인공 왼쪽(+X), -1 = 오른쪽(−X). */
  readonly side: 1 | -1;
  /** 몸통 표면 사이 목표 간격(m). 음수면 그만큼 닿아 겹치는 접촉 연출. */
  readonly gapM: number;
  /** 충돌 보정 시 허용하는 몸통 관통 깊이 상한(m). gapM이 이보다 깊이 겹치려 하면 밀어낸다. */
  readonly maxOverlapM: number;
  readonly partnerPoseSource: StudioMannequinDuoPartnerPoseSource;
  /** partnerPoseSource 가 "authored" 일 때 쓰는 상대 관절 맵(도 단위 저작 → rad 변환본). */
  readonly partnerJoints?: Readonly<
    Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>
  >;
  readonly gaze: StudioMannequinDuoGazeMode;
}

function deg3(x: number, y: number, z: number): StudioMannequinVec3 {
  return [(x * Math.PI) / 180, (y * Math.PI) / 180, (z * Math.PI) / 180];
}

/** 백허그·어깨 기대기의 상대역처럼 포즈 없이 서 있는 기본 자세(stand 프리셋과 같은 감각). */
const RELAXED_STAND_JOINTS: Readonly<
  Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>
> = Object.freeze({
  spine: deg3(2, 0, 0),
  leftUpperArm: deg3(-4, 0, 8),
  rightUpperArm: deg3(-4, 0, -8),
  leftLowerArm: deg3(-14, 0, 0),
  rightLowerArm: deg3(-14, 0, 0),
  leftUpperLeg: deg3(0, 0, 4),
  rightUpperLeg: deg3(0, 0, -4),
});

/** 벽치기 상대역 — 벽에 등을 붙이고 살짝 놀란 자세. */
const WALL_PRESSED_JOINTS: Readonly<
  Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>
> = Object.freeze({
  spine: deg3(-5, 0, 0),
  chest: deg3(-3, 0, 0),
  head: deg3(-8, 14, 0),
  leftUpperArm: deg3(6, 0, 14),
  leftLowerArm: deg3(-22, 0, 0),
  rightUpperArm: deg3(6, 0, -14),
  rightLowerArm: deg3(-22, 0, 0),
  leftUpperLeg: deg3(0, 0, 3),
  rightUpperLeg: deg3(0, 0, -3),
});

export const STUDIO_MANNEQUIN_DUO_COMPOSITIONS: readonly StudioMannequinDuoCompositionSpec[] =
  Object.freeze([
    {
      id: "duo-hug-front",
      presetIds: ["couple-hug-front", "dramatic-romantic-hug"],
      label: "마주 안기",
      arrangement: "face-to-face",
      side: 1,
      gapM: -0.08,
      maxOverlapM: 0.05,
      partnerPoseSource: "mirror-lead",
      gaze: "mutual",
    },
    {
      id: "duo-back-hug",
      presetIds: ["couple-back-hug"],
      label: "뒤에서 안기(백허그)",
      arrangement: "front-same-facing",
      side: 1,
      gapM: -0.08,
      maxOverlapM: 0.05,
      partnerPoseSource: "stand-relaxed",
      gaze: "lead-to-partner",
    },
    {
      id: "duo-hand-hold-walk",
      presetIds: ["couple-hand-hold-walk", "couple-hand-hold"],
      label: "손잡고 걷기",
      arrangement: "side-by-side",
      side: -1,
      gapM: 0.02,
      maxOverlapM: 0.03,
      partnerPoseSource: "mirror-lead",
      gaze: "none",
    },
    {
      id: "duo-shoulder-lean",
      presetIds: ["couple-shoulder-lean"],
      label: "어깨에 기대기",
      arrangement: "side-by-side",
      side: 1,
      gapM: -0.06,
      maxOverlapM: 0.04,
      partnerPoseSource: "stand-relaxed",
      gaze: "none",
    },
    {
      id: "duo-high-five",
      presetIds: ["couple-high-five"],
      label: "하이파이브",
      arrangement: "face-to-face",
      side: 1,
      gapM: 0.16,
      maxOverlapM: 0.02,
      partnerPoseSource: "mirror-lead",
      gaze: "mutual",
    },
    {
      id: "duo-arm-link",
      presetIds: ["couple-arm-link"],
      label: "팔짱 끼고 서기",
      arrangement: "side-by-side",
      side: -1,
      gapM: -0.05,
      maxOverlapM: 0.04,
      partnerPoseSource: "mirror-lead",
      gaze: "mutual",
    },
    {
      id: "duo-wall-slam",
      presetIds: ["dramatic-wall-slam-kabe-don", "wall-slam"],
      label: "벽치기(카베동)",
      arrangement: "face-to-face",
      side: 1,
      gapM: 0.05,
      maxOverlapM: 0.04,
      partnerPoseSource: "authored",
      partnerJoints: WALL_PRESSED_JOINTS,
      gaze: "mutual",
    },
  ]);

/** 스펙이 없는 2인 프리셋의 기본 구도 — 마주 보고 적당한 대화 거리. */
export const STUDIO_MANNEQUIN_DUO_FALLBACK_COMPOSITION: StudioMannequinDuoCompositionSpec =
  Object.freeze({
    id: "duo-fallback-face-to-face",
    presetIds: [],
    label: "마주 보기(기본 2인 구도)",
    arrangement: "face-to-face",
    side: 1,
    gapM: 0.24,
    maxOverlapM: 0.02,
    partnerPoseSource: "mirror-lead",
    gaze: "mutual",
  });

export function findStudioMannequinDuoComposition(
  presetId: unknown,
): StudioMannequinDuoCompositionSpec | null {
  if (typeof presetId !== "string") return null;
  return (
    STUDIO_MANNEQUIN_DUO_COMPOSITIONS.find(
      (spec) => spec.id === presetId || spec.presetIds.includes(presetId),
    ) ?? null
  );
}

// ── 작은 3D 수학 (three 미사용, 씬의 오일러 XYZ 계약 재현) ────────────────────

type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

const IDENTITY_MAT3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function mat3Multiply(a: Mat3, b: Mat3): Mat3 {
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

/** THREE Euler 'XYZ' 와 같은 합성: R = Rx · Ry · Rz. */
function mat3FromEulerXYZ(rotation: StudioMannequinVec3): Mat3 {
  const [x, y, z] = rotation;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  const rx: Mat3 = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const ry: Mat3 = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const rz: Mat3 = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mat3Multiply(mat3Multiply(rx, ry), rz);
}

function mat3Rotate(m: Mat3, v: StudioMannequinVec3): StudioMannequinVec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function vecAdd(a: StudioMannequinVec3, b: StudioMannequinVec3): StudioMannequinVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vecSub(a: StudioMannequinVec3, b: StudioMannequinVec3): StudioMannequinVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vecLength(v: StudioMannequinVec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function round4(value: number): number {
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundVec3(v: StudioMannequinVec3): StudioMannequinVec3 {
  return [round4(v[0]), round4(v[1]), round4(v[2])];
}

// ── FK (씬 applyPoseToGraph 와 같은 계약) ────────────────────────────────────

export interface StudioMannequinJointFrame {
  readonly position: StudioMannequinVec3;
  readonly rotation: Mat3;
}

/**
 * 포즈를 적용한 관절 월드 프레임. 루트(골반 부모)는 rootOffset 위치와
 * rootYawRad(Y축 회전)에 놓이며, 골반 그룹 위치 = rest 오프셋 + pelvisOffset,
 * 관절 회전은 관절 한계로 클램프한 오일러 XYZ — 씬 렌더와 동일하다.
 */
export function computeStudioMannequinJointFrames(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
  rootOffset: StudioMannequinVec3 = [0, 0, 0],
  rootYawRad = 0,
): ReadonlyMap<StudioMannequinJointId, StudioMannequinJointFrame> {
  const frames = new Map<StudioMannequinJointId, StudioMannequinJointFrame>();
  const rootRotation = mat3FromEulerXYZ([0, rootYawRad, 0]);
  for (const jointSpec of spec.joints) {
    const localRotation = mat3FromEulerXYZ(
      clampStudioMannequinJointRotation(
        jointSpec.id,
        pose.joints[jointSpec.id] ?? [0, 0, 0],
      ),
    );
    if (jointSpec.parentId === null) {
      const pelvisPosition = vecAdd(
        rootOffset,
        mat3Rotate(rootRotation, vecAdd(jointSpec.offset, pose.pelvisOffset)),
      );
      frames.set(jointSpec.id, {
        position: pelvisPosition,
        rotation: mat3Multiply(rootRotation, localRotation),
      });
      continue;
    }
    const parent = frames.get(jointSpec.parentId);
    if (!parent) continue;
    frames.set(jointSpec.id, {
      position: vecAdd(parent.position, mat3Rotate(parent.rotation, jointSpec.offset)),
      rotation: mat3Multiply(parent.rotation, localRotation),
    });
  }
  return frames;
}

/**
 * 얼굴(시선 원점) 위치 — 머리 관절 위치를 그대로 쓴다.
 * 원점과 목표를 모두 머리 관절로 통일해야 근거리에서도 피치가 뒤집히지 않는다.
 */
function facePoint(
  spec: StudioMannequinSpec,
  frames: ReadonlyMap<StudioMannequinJointId, StudioMannequinJointFrame>,
): StudioMannequinVec3 | null {
  void spec;
  return frames.get("head")?.position ?? null;
}

/** 머리가 현재 바라보는 방향(월드 단위 벡터). */
function facingDirection(
  frames: ReadonlyMap<StudioMannequinJointId, StudioMannequinJointFrame>,
): StudioMannequinVec3 | null {
  const head = frames.get("head");
  if (!head) return null;
  return mat3Rotate(head.rotation, [0, 0, 1]);
}

// ── 체형 측정 ────────────────────────────────────────────────────────────────

interface DuoBodyMeasure {
  readonly halfWidthM: number;
  readonly halfDepthM: number;
  /** 서 있을 때 발목 관절의 지면으로부터 높이 = 발바닥까지의 여유. */
  readonly ankleClearanceM: number;
  readonly heightM: number;
}

function measureBody(spec: StudioMannequinSpec): DuoBodyMeasure {
  let halfWidth = 0;
  let halfDepth = 0;
  for (const primitive of spec.primitives) {
    if (
      primitive.jointId !== "pelvis" &&
      primitive.jointId !== "spine" &&
      primitive.jointId !== "chest"
    ) {
      continue;
    }
    if (primitive.kind === "sphere") {
      const scaleX = primitive.scale ? primitive.scale[0] : 1;
      const scaleZ = primitive.scale ? primitive.scale[2] : 1;
      halfWidth = Math.max(halfWidth, primitive.radius * scaleX);
      halfDepth = Math.max(halfDepth, primitive.radius * scaleZ);
    } else if (primitive.kind === "capsule") {
      halfWidth = Math.max(halfWidth, primitive.radius);
      halfDepth = Math.max(halfDepth, primitive.radius);
    }
  }
  // 어깨 관절 반폭 + 팔 두께 여유 — 옆 배치 간격의 하한으로 쓴다.
  const shoulderHalf =
    Math.abs(studioMannequinRestJointPosition(spec, "leftUpperArm")[0]) + 0.05;
  halfWidth = Math.max(halfWidth, shoulderHalf);
  halfDepth = Math.max(halfDepth, 0.08);
  return {
    halfWidthM: halfWidth,
    halfDepthM: halfDepth,
    ankleClearanceM: studioMannequinRestJointPosition(spec, "leftFoot")[1],
    heightM: spec.heightM,
  };
}

/** 포즈의 가장 낮은 발바닥 높이(월드). 접지 보정량의 기준. */
function lowestFootBottomY(
  spec: StudioMannequinSpec,
  measure: DuoBodyMeasure,
  frames: ReadonlyMap<StudioMannequinJointId, StudioMannequinJointFrame>,
): number {
  const left = frames.get("leftFoot");
  const right = frames.get("rightFoot");
  const ys = [left?.position[1], right?.position[1]].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (ys.length === 0) return 0;
  return Math.min(...ys) - measure.ankleClearanceM;
}

// ── 시선 보정 ────────────────────────────────────────────────────────────────

interface GazeCorrection {
  readonly pose: StudioMannequinPose;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  /** 보정 후 얼굴 방향과 목표 방향 사이 각도(도). */
  readonly errorDeg: number;
}

const GAZE_NECK_SHARE = 0.45;

/**
 * target 을 바라보도록 목·머리에 요/피치 델타를 나눠 얹는다.
 * 델타는 루트 프레임에서 계산한 근사이며, 적용 후 실제 오차를 함께 잰다.
 */
function applyGazeCorrection(input: {
  spec: StudioMannequinSpec;
  pose: StudioMannequinPose;
  rootOffset: StudioMannequinVec3;
  rootYawRad: number;
  target: StudioMannequinVec3;
}): GazeCorrection {
  const { spec, rootOffset, rootYawRad, target } = input;
  const frames = computeStudioMannequinJointFrames(spec, input.pose, rootOffset, rootYawRad);
  const face = facePoint(spec, frames);
  if (!face) return { pose: input.pose, yawDeg: 0, pitchDeg: 0, errorDeg: 0 };
  const toTarget = vecSub(target, face);
  const distance = vecLength(toTarget);
  if (distance < 1e-6) return { pose: input.pose, yawDeg: 0, pitchDeg: 0, errorDeg: 0 };

  // 목표 방향과 현재 얼굴 방향을 모두 루트 프레임으로 되돌려 차이를 구한다.
  // 척추·가슴이 이미 기울어 있는 포즈에서도 델타가 맞도록 FK 실측 방향을 쓴다.
  const toRoot = mat3FromEulerXYZ([0, -rootYawRad, 0]);
  const local = mat3Rotate(toRoot, toTarget);
  const desiredYaw = Math.atan2(local[0], local[2]);
  const desiredPitch = -Math.atan2(local[1], Math.hypot(local[0], local[2]));
  const currentDir = facingDirection(frames);
  let yawDelta = desiredYaw;
  let pitchDelta = desiredPitch;
  if (currentDir) {
    const localCurrent = mat3Rotate(toRoot, currentDir);
    const currentYaw = Math.atan2(localCurrent[0], localCurrent[2]);
    const currentPitch = -Math.atan2(
      localCurrent[1],
      Math.hypot(localCurrent[0], localCurrent[2]),
    );
    yawDelta = desiredYaw - currentYaw;
    pitchDelta = desiredPitch - currentPitch;
  }
  const neck = input.pose.joints.neck ?? [0, 0, 0];
  const head = input.pose.joints.head ?? [0, 0, 0];

  const joints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {
    ...input.pose.joints,
    neck: clampStudioMannequinJointRotation("neck", [
      neck[0] + pitchDelta * GAZE_NECK_SHARE,
      neck[1] + yawDelta * GAZE_NECK_SHARE,
      neck[2],
    ]),
    head: clampStudioMannequinJointRotation("head", [
      head[0] + pitchDelta * (1 - GAZE_NECK_SHARE),
      head[1] + yawDelta * (1 - GAZE_NECK_SHARE),
      head[2],
    ]),
  };
  const pose = normalizeStudioMannequinPose({
    joints,
    pelvisOffset: input.pose.pelvisOffset,
  });

  const afterFrames = computeStudioMannequinJointFrames(spec, pose, rootOffset, rootYawRad);
  const afterFace = facePoint(spec, afterFrames);
  const afterDir = facingDirection(afterFrames);
  let errorDeg = 0;
  if (afterFace && afterDir) {
    const dir = vecSub(target, afterFace);
    const len = vecLength(dir);
    if (len > 1e-6) {
      const dot = Math.min(
        1,
        Math.max(
          -1,
          (afterDir[0] * dir[0] + afterDir[1] * dir[1] + afterDir[2] * dir[2]) / len,
        ),
      );
      errorDeg = (Math.acos(dot) * 180) / Math.PI;
    }
  }
  return {
    pose,
    yawDeg: round4((yawDelta * 180) / Math.PI),
    pitchDeg: round4((pitchDelta * 180) / Math.PI),
    errorDeg: round4(errorDeg),
  };
}

// ── 솔버 ─────────────────────────────────────────────────────────────────────

export interface StudioMannequinDuoSolveInput {
  /** 포즈 프리셋 id. 구도 스펙 조회에 쓴다. 없으면 compositionId/기본 구도. */
  readonly presetId?: string | null;
  /** 구도 스펙 id를 직접 지정할 때. */
  readonly compositionId?: string | null;
  /** 주인공에게 이미 적용된(또는 적용할) 포즈. */
  readonly leadPose: StudioMannequinPose;
  /** 주인공 체형. 없으면 기본 체형. */
  readonly leadBodyParams?: unknown;
  /** 상대 체형. 없으면 주인공과 같은 체형. */
  readonly partnerBodyParams?: unknown;
  /** 상대 키(cm)만 따로 지정할 때 — 체형의 heightCm 을 덮는다. */
  readonly partnerHeightCm?: number;
}

export interface StudioMannequinDuoCorrections {
  /** 충돌 보정으로 상대를 밀어낸 거리(m). 없으면 0. */
  readonly collisionPushM: number;
  /** 상대 접지 보정량(m) — 루트 높이에 더해진 값. */
  readonly groundAdjustM: number;
  /** 주인공 포즈 자체의 접지 어긋남(m). 호스트가 주인공에도 적용할 수 있다. */
  readonly leadGroundAdjustM: number;
  readonly gaze: {
    readonly leadYawDeg: number;
    readonly leadPitchDeg: number;
    readonly partnerYawDeg: number;
    readonly partnerPitchDeg: number;
    /** 보정 후 두 시선의 목표 오차 중 큰 값(도). */
    readonly errorDeg: number;
  };
}

export interface StudioMannequinDuoPlacement {
  readonly compositionId: string;
  readonly compositionLabel: string;
  readonly arrangement: StudioMannequinDuoArrangement;
  /** 시선 보정이 반영된 주인공 포즈. */
  readonly leadPose: StudioMannequinPose;
  /** 상대역 포즈(미러/기본/저작 + 시선 보정, 정규화 완료). */
  readonly partnerPose: StudioMannequinPose;
  /** 상대 루트 위치 — 주인공 로컬 프레임(주인공 원점·+Z 응시) 기준. */
  readonly partnerOffset: StudioMannequinVec3;
  /** 상대 루트 요(rad). 0 = 주인공과 같은 방향, π = 마주 보기. */
  readonly partnerYawRad: number;
  /** 두 루트 사이 수평 거리(m). */
  readonly distanceM: number;
  readonly corrections: StudioMannequinDuoCorrections;
  readonly warnings: readonly string[];
}

function resolvePartnerBasePose(
  spec: StudioMannequinDuoCompositionSpec,
  leadPose: StudioMannequinPose,
): StudioMannequinPose {
  if (spec.partnerPoseSource === "mirror-lead") {
    return normalizeStudioMannequinPose(mirrorStudioMannequinPose(leadPose));
  }
  if (spec.partnerPoseSource === "authored" && spec.partnerJoints) {
    return normalizeStudioMannequinPose({
      joints: spec.partnerJoints,
      pelvisOffset: [0, 0, 0],
    });
  }
  return normalizeStudioMannequinPose({
    joints: RELAXED_STAND_JOINTS,
    pelvisOffset: [0, 0, 0],
  });
}

/**
 * 2인 구도의 상대 배치를 한 번에 계산한다. 1인 프리셋 적용과 같은
 * "클릭 1회" 동선에서 호출해 주인공 포즈와 함께 쓰기 위한 순수 함수다.
 */
export function solveStudioMannequinDuoPlacement(
  input: StudioMannequinDuoSolveInput,
): StudioMannequinDuoPlacement {
  const composition =
    findStudioMannequinDuoComposition(input.compositionId) ??
    findStudioMannequinDuoComposition(input.presetId) ??
    STUDIO_MANNEQUIN_DUO_FALLBACK_COMPOSITION;

  const leadParams = clampStudioMannequinBodyParams(input.leadBodyParams);
  const partnerParamsInput =
    input.partnerBodyParams ?? (input.leadBodyParams as StudioMannequinBodyParams);
  const partnerParamsBase = clampStudioMannequinBodyParams(partnerParamsInput);
  const partnerParams: StudioMannequinBodyParams =
    typeof input.partnerHeightCm === "number" && Number.isFinite(input.partnerHeightCm)
      ? clampStudioMannequinBodyParams({
          ...partnerParamsBase,
          heightCm: input.partnerHeightCm,
        })
      : partnerParamsBase;

  const leadSpec = buildStudioMannequinSpec(leadParams);
  const partnerSpec = buildStudioMannequinSpec(partnerParams);
  const leadMeasure = measureBody(leadSpec);
  const partnerMeasure = measureBody(partnerSpec);

  const leadPose = normalizeStudioMannequinPose(input.leadPose);
  const partnerBasePose = resolvePartnerBasePose(composition, leadPose);

  // ── 거리·방향(1차 배치 + 충돌 보정) ──
  const faceToFace =
    composition.arrangement === "face-to-face" ||
    composition.arrangement === "front-same-facing";
  const leadHalf = faceToFace ? leadMeasure.halfDepthM : leadMeasure.halfWidthM;
  const partnerHalf = faceToFace
    ? partnerMeasure.halfDepthM
    : partnerMeasure.halfWidthM;
  const surfaceSum = leadHalf + partnerHalf;
  const desiredDistance = surfaceSum + composition.gapM;
  const minDistance = Math.max(0.05, surfaceSum - composition.maxOverlapM);
  let distance = Math.max(desiredDistance, minDistance);
  let collisionPush = Math.max(0, minDistance - desiredDistance);

  const axis: StudioMannequinVec3 = faceToFace
    ? [0, 0, 1]
    : [composition.side, 0, 0];
  const partnerYawRad =
    composition.arrangement === "face-to-face" ? Math.PI : 0;

  // 주인공 접지 어긋남(영수증용 — 주인공 포즈는 호출부가 이미 적용한 값이라 건드리지 않는다)
  const leadFrames = computeStudioMannequinJointFrames(leadSpec, leadPose, [0, 0, 0], 0);
  const leadGroundAdjust = -lowestFootBottomY(leadSpec, leadMeasure, leadFrames);
  const leadHead = leadFrames.get("head")?.position;

  // ── 얼굴 간격 보정 ──
  // 앞으로 숙인 포즈끼리 마주 보면 몸통 거리만으로는 두 머리가 서로를 지나쳐
  // 겹친다. 머리 관절의 축 방향 간격이 최소값보다 좁으면 상대를 더 밀어낸다.
  if (composition.arrangement === "face-to-face" && leadHead) {
    const probeOffset: StudioMannequinVec3 = [axis[0] * distance, 0, axis[2] * distance];
    const probeFrames = computeStudioMannequinJointFrames(
      partnerSpec,
      partnerBasePose,
      probeOffset,
      partnerYawRad,
    );
    const partnerHead = probeFrames.get("head")?.position;
    if (partnerHead) {
      const axialGap =
        (partnerHead[0] - leadHead[0]) * axis[0] +
        (partnerHead[2] - leadHead[2]) * axis[2];
      const FACE_MIN_AXIAL_GAP_M = 0.06;
      if (axialGap < FACE_MIN_AXIAL_GAP_M) {
        const push = FACE_MIN_AXIAL_GAP_M - axialGap;
        distance += push;
        collisionPush += push;
      }
    }
  }

  const partnerOffsetBase: StudioMannequinVec3 = [
    axis[0] * distance,
    0,
    axis[2] * distance,
  ];

  // ── 접지 보정(상대) ──
  const partnerFramesBase = computeStudioMannequinJointFrames(
    partnerSpec,
    partnerBasePose,
    partnerOffsetBase,
    partnerYawRad,
  );
  const groundAdjust = -lowestFootBottomY(partnerSpec, partnerMeasure, partnerFramesBase);
  const partnerOffset: StudioMannequinVec3 = [
    partnerOffsetBase[0],
    groundAdjust,
    partnerOffsetBase[2],
  ];

  // ── 시선 보정 ──
  const partnerFrames = computeStudioMannequinJointFrames(
    partnerSpec,
    partnerBasePose,
    partnerOffset,
    partnerYawRad,
  );
  // 시선 목표는 상대의 머리 관절 위치 — 얼굴 표면점이 아니라 머리 중심을 겨냥해야
  // 앞으로 숙인 포즈에서도 방향이 뒤집히지 않는다.
  const leadFace = leadFrames.get("head")?.position ?? null;
  const partnerFace = partnerFrames.get("head")?.position ?? null;

  let finalLeadPose = leadPose;
  let finalPartnerPose = partnerBasePose;
  let leadGaze = { yawDeg: 0, pitchDeg: 0, errorDeg: 0 };
  let partnerGaze = { yawDeg: 0, pitchDeg: 0, errorDeg: 0 };
  if (leadFace && partnerFace && composition.gaze !== "none") {
    if (composition.gaze === "mutual" || composition.gaze === "lead-to-partner") {
      const result = applyGazeCorrection({
        spec: leadSpec,
        pose: finalLeadPose,
        rootOffset: [0, 0, 0],
        rootYawRad: 0,
        target: partnerFace,
      });
      finalLeadPose = result.pose;
      leadGaze = result;
    }
    if (composition.gaze === "mutual" || composition.gaze === "partner-to-lead") {
      const result = applyGazeCorrection({
        spec: partnerSpec,
        pose: finalPartnerPose,
        rootOffset: partnerOffset,
        rootYawRad: partnerYawRad,
        target: leadFace,
      });
      finalPartnerPose = result.pose;
      partnerGaze = result;
    }
  }

  // ── 경고 영수증 ──
  const warnings: string[] = [];
  const heightDiff = Math.abs(leadMeasure.heightM - partnerMeasure.heightM);
  if (heightDiff >= 0.2) {
    warnings.push(
      `키 차이가 ${Math.round(heightDiff * 100)}cm라 접촉 위치가 어긋날 수 있어요. 시선은 자동으로 맞췄습니다.`,
    );
  }
  if (collisionPush > 0.005) {
    warnings.push("몸이 겹쳐서 상대를 살짝 밀어냈어요.");
  }
  if (Math.abs(groundAdjust) > 0.05) {
    warnings.push("상대 발이 지면에 닿도록 높이를 보정했어요.");
  }
  const gazeError = Math.max(leadGaze.errorDeg, partnerGaze.errorDeg);
  if (composition.gaze !== "none" && gazeError > 25) {
    warnings.push("관절 한계 때문에 시선을 끝까지 맞추지 못했어요.");
  }

  return {
    compositionId: composition.id,
    compositionLabel: composition.label,
    arrangement: composition.arrangement,
    leadPose: finalLeadPose,
    partnerPose: finalPartnerPose,
    partnerOffset: roundVec3(partnerOffset),
    partnerYawRad: round4(partnerYawRad),
    distanceM: round4(distance),
    corrections: {
      collisionPushM: round4(collisionPush),
      groundAdjustM: round4(groundAdjust),
      leadGroundAdjustM: round4(leadGroundAdjust),
      gaze: {
        leadYawDeg: leadGaze.yawDeg,
        leadPitchDeg: leadGaze.pitchDeg,
        partnerYawDeg: partnerGaze.yawDeg,
        partnerPitchDeg: partnerGaze.pitchDeg,
        errorDeg: round4(gazeError),
      },
    },
    warnings,
  };
}

/** 패널 상태 문구용 한 줄 요약 — "상대 자동 배치 · 거리 0.42m · 서로 바라보기 · 접지 보정". */
export function describeStudioMannequinDuoPlacement(
  placement: StudioMannequinDuoPlacement,
): string {
  const parts = [
    `상대 자동 배치 — ${placement.compositionLabel}`,
    `거리 ${placement.distanceM.toFixed(2)}m`,
  ];
  if (placement.arrangement === "face-to-face") parts.push("마주 보기");
  if (placement.arrangement === "side-by-side") parts.push("나란히 서기");
  if (placement.arrangement === "front-same-facing") parts.push("앞에 서기");
  if (Math.abs(placement.corrections.groundAdjustM) > 0.005) {
    parts.push("접지 보정 완료");
  }
  if (placement.corrections.collisionPushM > 0.005) {
    parts.push("겹침 보정 완료");
  }
  return parts.join(" · ");
}
