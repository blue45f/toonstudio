/**
 * 웹툰 액션 실루엣 12종 프리셋 + 단일 시선(LookAt) 핀 솔버 (#026).
 *
 * - 주먹·달리기·앉기·뒤돌아보기·점프·방어·놀람·웅크림·삿대질·기대기·낙하·인사 12종
 *   실루엣 포즈 프리셋을 VRM 정규화 본 규약(`PosePreset`)으로 제공한다.
 * - 모든 프리셋은 해부학 관절 과신전 클램프(`#027`)와 일반 관절 한계를 위반하지 않도록 설계된다.
 * - 단일 LookAt 핀(`VrmLookAtPin`)은 3D 목표 좌표 하나를 받아 VRM 전방축(`#030`) 기준으로
 *   목(`neck`)·머리(`head`)·양안(`leftEye`/`rightEye`) 회전을 자연스럽게 분배·클램프한다.
 */
import * as THREE from "three";

import {
  clampStudioVrmJointRotation,
  getStudioVrmJointLimit,
  type StudioVrmJointRotation,
} from "./studio-vrm-joint-limits";
import { applyPoseToVrm, type PoseBoneMap, type PosePreset } from "./studio-vrm-poser-utils";
import { clampVrmPoseAnatomicalJoints, type VrmVec3 } from "./vrm-anatomy-garment-guard";
import {
  VRM_CANONICAL_WORLD_FORWARD,
  resolveVrmForwardAxisFromVrm,
  type VrmForwardAxisSourceLike,
} from "./vrm-forward-axis-normalizer";

import type { StudioVrmHandPoseType } from "./studio-vrm-hand-poses";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

const DEG = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EPSILON = 1e-6;

export type VrmActionSilhouetteId =
  | "action-punch"
  | "action-run"
  | "action-sit"
  | "action-look-back"
  | "action-jump"
  | "action-guard"
  | "action-surprise"
  | "action-crouch"
  | "action-point"
  | "action-lean"
  | "action-fall"
  | "action-greet";

export type VrmActionSilhouetteCategory =
  | "combat"
  | "locomotion"
  | "emotion"
  | "daily";

export interface VrmActionSilhouettePreset extends PosePreset {
  readonly id: VrmActionSilhouetteId;
  readonly label: string;
  readonly category: VrmActionSilhouetteCategory;
  readonly silhouetteSummary: string;
  readonly handPair: readonly [left: StudioVrmHandPoseType, right: StudioVrmHandPoseType];
  /** 캐릭터 기준 기본 시선 핀 상대 오프셋(m, 머리 기준 로컬). */
  readonly defaultLookAtOffset: VrmVec3;
  readonly yOffset: number;
}

function rot(xDeg: number, yDeg: number, zDeg: number): { rotation: [number, number, number] } {
  return { rotation: [xDeg * DEG, yDeg * DEG, zDeg * DEG] };
}

function defineActionPreset(spec: {
  id: VrmActionSilhouetteId;
  label: string;
  category: VrmActionSilhouetteCategory;
  silhouetteSummary: string;
  handPair: readonly [StudioVrmHandPoseType, StudioVrmHandPoseType];
  defaultLookAtOffset: VrmVec3;
  yOffset: number;
  bones: PoseBoneMap;
}): VrmActionSilhouettePreset {
  const guarded = clampVrmPoseAnatomicalJoints(spec.bones);
  return Object.freeze({
    id: spec.id,
    label: spec.label,
    category: spec.category,
    silhouetteSummary: spec.silhouetteSummary,
    handPair: Object.freeze([spec.handPair[0], spec.handPair[1]] as const),
    defaultLookAtOffset: Object.freeze([...spec.defaultLookAtOffset] as const),
    yOffset: spec.yOffset,
    bones: guarded.bones,
  });
}

/**
 * 웹툰 연출용 12종 액션 실루엣 프리셋 카탈로그.
 * 순서: 주먹 · 달리기 · 앉기 · 뒤돌아보기 · 점프 · 방어 · 놀람 · 웅크림 · 삿대질 · 기대기 · 낙하 · 인사.
 */
export const VRM_ACTION_SILHOUETTE_PRESETS: readonly VrmActionSilhouettePreset[] = Object.freeze([
  defineActionPreset({
    id: "action-punch",
    label: "주먹",
    category: "combat",
    silhouetteSummary: "오른주먹 정권 찌르기, 상체 비틀림과 왼팔 당김으로 강한 전방 추력 실루엣",
    handPair: ["fist", "fist"],
    defaultLookAtOffset: [0, 0, 2.2],
    yOffset: -0.06,
    bones: {
      hips: rot(6, -24, -4),
      spine: rot(8, -14, -3),
      chest: rot(6, -16, -2),
      neck: rot(-4, 24, 2),
      head: rot(-4, 26, 2),
      leftShoulder: rot(0, -14, -8),
      leftUpperArm: rot(18, -32, -52),
      leftLowerArm: rot(0, 0, -108),
      rightShoulder: rot(0, 18, 6),
      rightUpperArm: rot(-14, -78, 12),
      rightLowerArm: rot(0, 0, 8),
      leftUpperLeg: rot(-38, 10, -8),
      leftLowerLeg: rot(42, 0, 0),
      leftFoot: rot(-8, 0, 0),
      rightUpperLeg: rot(26, -14, 10),
      rightLowerLeg: rot(22, 0, 0),
      rightFoot: rot(16, 0, 0),
    },
  }),
  defineActionPreset({
    id: "action-run",
    label: "달리기",
    category: "locomotion",
    silhouetteSummary: "전방 경사 질주, 대각 팔·다리 스트라이드와 역동적 무게중심 이동",
    handPair: ["fist", "fist"],
    defaultLookAtOffset: [0, 0.05, 2.6],
    yOffset: -0.04,
    bones: {
      hips: rot(16, 12, -3),
      spine: rot(12, 10, 0),
      chest: rot(10, 12, 2),
      neck: rot(-14, -10, 0),
      head: rot(-14, -10, 0),
      leftShoulder: rot(0, 10, -6),
      leftUpperArm: rot(-24, 48, -42),
      leftLowerArm: rot(0, 0, -96),
      rightShoulder: rot(0, -10, 6),
      rightUpperArm: rot(28, 36, 48),
      rightLowerArm: rot(0, 0, 88),
      leftUpperLeg: rot(34, 0, -4),
      leftLowerLeg: rot(64, 0, 0),
      leftFoot: rot(18, 0, 0),
      rightUpperLeg: rot(-62, 0, 4),
      rightLowerLeg: rot(52, 0, 0),
      rightFoot: rot(-12, 0, 0),
    },
  }),
  defineActionPreset({
    id: "action-sit",
    label: "앉기",
    category: "daily",
    silhouetteSummary: "의자·턱 착석 자세, 90° 고관절·무릎 굴곡과 편안한 손 얹기",
    handPair: ["relaxed", "relaxed"],
    defaultLookAtOffset: [0, 0, 2.0],
    yOffset: -0.38,
    bones: {
      hips: rot(-6, 4, 0),
      spine: rot(6, 0, 0),
      chest: rot(4, -2, 0),
      neck: rot(2, -2, 0),
      head: rot(2, -2, 0),
      leftShoulder: rot(0, 0, -10),
      leftUpperArm: rot(10, 22, -62),
      leftLowerArm: rot(0, 0, -48),
      rightShoulder: rot(0, 0, 10),
      rightUpperArm: rot(12, -20, 60),
      rightLowerArm: rot(0, 0, 52),
      leftUpperLeg: rot(-86, 8, -6),
      leftLowerLeg: rot(88, 0, 0),
      leftFoot: rot(4, 0, 0),
      rightUpperLeg: rot(-86, -8, 6),
      rightLowerLeg: rot(88, 0, 0),
      rightFoot: rot(4, 0, 0),
    },
  }),
  defineActionPreset({
    id: "action-look-back",
    label: "뒤돌아보기",
    category: "emotion",
    silhouetteSummary: "어깨 너머 시선 회수, 척추·가슴·목·머리를 단계적으로 비튼 드라마틱 실루엣",
    handPair: ["relaxed", "open"],
    defaultLookAtOffset: [-1.1, 0.05, -1.6],
    yOffset: 0,
    bones: {
      hips: rot(0, -18, 4),
      spine: rot(-4, -20, -2),
      chest: rot(-4, -26, -4),
      neck: rot(0, -42, 4),
      head: rot(-4, -46, 4),
      leftShoulder: rot(0, -8, -10),
      leftUpperArm: rot(6, 12, -68),
      leftLowerArm: rot(0, 0, -24),
      rightShoulder: rot(0, -12, 8),
      rightUpperArm: rot(12, -16, 62),
      rightLowerArm: rot(0, 0, 38),
      leftUpperLeg: rot(-10, 8, -4),
      leftLowerLeg: rot(14, 0, 0),
      rightUpperLeg: rot(12, -10, 6),
      rightLowerLeg: rot(12, 0, 0),
    },
  }),
  defineActionPreset({
    id: "action-jump",
    label: "점프",
    category: "locomotion",
    silhouetteSummary: "공중 도약 실루엣, 양팔 상향 전개와 비대칭 무릎 당김",
    handPair: ["open", "fist"],
    defaultLookAtOffset: [0, 0.2, 2.2],
    yOffset: 0.24,
    bones: {
      hips: rot(-10, 8, -4),
      spine: rot(-10, 6, -3),
      chest: rot(-12, 6, -2),
      neck: rot(-6, -4, 0),
      head: rot(-8, -6, 2),
      leftShoulder: rot(0, 0, 20),
      leftUpperArm: rot(-16, 24, 58),
      leftLowerArm: rot(0, 0, -42),
      rightShoulder: rot(0, 0, -24),
      rightUpperArm: rot(-22, -26, -68),
      rightLowerArm: rot(0, 0, 34),
      leftUpperLeg: rot(-74, 10, -10),
      leftLowerLeg: rot(96, 0, 0),
      leftFoot: rot(24, 0, 0),
      rightUpperLeg: rot(18, -8, 8),
      rightLowerLeg: rot(48, 0, 0),
      rightFoot: rot(30, 0, 0),
    },
  }),
  defineActionPreset({
    id: "action-guard",
    label: "방어",
    category: "combat",
    silhouetteSummary: "근접 하이 가드, 양 전완으로 얼굴·가슴을 보호하는 낮은 격투 스탠스",
    handPair: ["fist", "fist"],
    defaultLookAtOffset: [0, -0.05, 2.0],
    yOffset: -0.1,
    bones: {
      hips: rot(10, 22, 0),
      spine: rot(10, 12, 2),
      chest: rot(12, 10, 2),
      neck: rot(-6, -18, -2),
      head: rot(6, -18, -2),
      leftShoulder: rot(0, 14, -4),
      leftUpperArm: rot(-26, 68, -24),
      leftLowerArm: rot(0, 0, -124),
      rightShoulder: rot(0, -14, 4),
      rightUpperArm: rot(-30, -72, 28),
      rightLowerArm: rot(0, 0, 122),
      leftUpperLeg: rot(-36, 14, -10),
      leftLowerLeg: rot(48, 0, 0),
      leftFoot: rot(-10, 0, 0),
      rightUpperLeg: rot(18, -16, 10),
      rightLowerLeg: rot(34, 0, 0),
      rightFoot: rot(12, 0, 0),
    },
  }),
  defineActionPreset({
    id: "action-surprise",
    label: "놀람",
    category: "emotion",
    silhouetteSummary: "급제동 후방 경사 + 양손 가슴 앞 벌림으로 충격·놀람 감정 강조",
    handPair: ["open", "open"],
    defaultLookAtOffset: [0, 0.1, 1.8],
    yOffset: -0.03,
    bones: {
      hips: rot(-12, 0, 0),
      spine: rot(-14, 0, 2),
      chest: rot(-16, 0, 2),
      neck: rot(-10, 0, -3),
      head: rot(-12, 4, -4),
      leftShoulder: rot(0, -8, 16),
      leftUpperArm: rot(-18, 42, -26),
      leftLowerArm: rot(0, 0, -88),
      rightShoulder: rot(0, 8, -16),
      rightUpperArm: rot(-18, -42, 26),
      rightLowerArm: rot(0, 0, 88),
      leftUpperLeg: rot(-24, 10, -8),
      leftLowerLeg: rot(32, 0, 0),
      rightUpperLeg: rot(-14, -10, 8),
      rightLowerLeg: rot(22, 0, 0),
    },
  }),
  defineActionPreset({
    id: "action-crouch",
    label: "웅크림",
    category: "locomotion",
    silhouetteSummary: "은신·착지 충격 흡수용 깊은 웅크림, 낮은 골반과 컴팩트한 외곽 실루엣",
    handPair: ["open", "fist"],
    defaultLookAtOffset: [0, 0.12, 2.0],
    yOffset: -0.44,
    bones: {
      hips: rot(22, 6, 0),
      spine: rot(20, 0, 0),
      chest: rot(18, -4, 0),
      neck: rot(-20, -4, 0),
      head: rot(-22, -4, 0),
      leftShoulder: rot(0, 10, -10),
      leftUpperArm: rot(12, 34, -52),
      leftLowerArm: rot(0, 0, -92),
      rightShoulder: rot(0, -10, 10),
      rightUpperArm: rot(20, -28, 48),
      rightLowerArm: rot(0, 0, 74),
      leftUpperLeg: rot(-108, 14, -12),
      leftLowerLeg: rot(126, 0, 0),
      leftFoot: rot(-18, 0, 0),
      rightUpperLeg: rot(-94, -12, 12),
      rightLowerLeg: rot(118, 0, 0),
      rightFoot: rot(-20, 0, 0),
    },
  }),
  defineActionPreset({
    id: "action-point",
    label: "삿대질",
    category: "emotion",
    silhouetteSummary: "오른팔 정면 직선 지목 + 왼손 허리춤 배치로 단호한 대사 컷 실루엣",
    handPair: ["fist", "point"],
    defaultLookAtOffset: [-0.15, 0.04, 2.4],
    yOffset: 0,
    bones: {
      hips: rot(2, 16, -2),
      spine: rot(4, 10, -2),
      chest: rot(4, 14, -2),
      neck: rot(-2, -16, 2),
      head: rot(-2, -18, 2),
      leftShoulder: rot(0, -6, -8),
      leftUpperArm: rot(8, -14, -56),
      leftLowerArm: rot(0, 0, -82),
      rightShoulder: rot(0, 12, 6),
      rightUpperArm: rot(-10, -82, 6),
      rightLowerArm: rot(0, 0, 4),
      leftUpperLeg: rot(-16, 12, -8),
      leftLowerLeg: rot(18, 0, 0),
      rightUpperLeg: rot(12, -10, 8),
      rightLowerLeg: rot(10, 0, 0),
    },
  }),
  defineActionPreset({
    id: "action-lean",
    label: "기대기",
    category: "daily",
    silhouetteSummary: "벽·난간에 한쪽 어깨와 골반을 기댄 여유로운 비대칭 S자 실루엣",
    handPair: ["relaxed", "relaxed"],
    defaultLookAtOffset: [0.35, -0.04, 2.0],
    yOffset: -0.02,
    bones: {
      hips: rot(-6, 14, -10),
      spine: rot(-4, 6, 8),
      chest: rot(-4, 4, 8),
      neck: rot(2, -10, -6),
      head: rot(4, -12, -6),
      leftShoulder: rot(0, -6, -12),
      leftUpperArm: rot(12, -8, -70),
      leftLowerArm: rot(0, 0, -34),
      rightShoulder: rot(0, 4, 10),
      rightUpperArm: rot(8, -28, 52),
      rightLowerArm: rot(0, 0, 78),
      leftUpperLeg: rot(-18, 12, -8),
      leftLowerLeg: rot(26, 0, 0),
      rightUpperLeg: rot(6, -6, 6),
      rightLowerLeg: rot(6, 0, 0),
    },
  }),
  defineActionPreset({
    id: "action-fall",
    label: "낙하",
    category: "locomotion",
    silhouetteSummary: "무중력·추락 아치, 사지 외향 전개와 뒤로 젖힌 흉곽의 공중 실루엣",
    handPair: ["open", "open"],
    defaultLookAtOffset: [0, 0.85, 1.5],
    yOffset: 0.16,
    bones: {
      hips: rot(-22, -10, 8),
      spine: rot(-16, -6, 6),
      chest: rot(-18, -6, 4),
      neck: rot(-16, 8, -4),
      head: rot(-18, 10, -6),
      leftShoulder: rot(0, -10, 22),
      leftUpperArm: rot(-24, -22, 48),
      leftLowerArm: rot(0, 0, -32),
      rightShoulder: rot(0, 10, -22),
      rightUpperArm: rot(-18, 28, -56),
      rightLowerArm: rot(0, 0, 42),
      leftUpperLeg: rot(-42, 16, -18),
      leftLowerLeg: rot(74, 0, 0),
      leftFoot: rot(22, 0, 0),
      rightUpperLeg: rot(-18, -14, 16),
      rightLowerLeg: rot(44, 0, 0),
      rightFoot: rot(28, 0, 0),
    },
  }),
  defineActionPreset({
    id: "action-greet",
    label: "인사",
    category: "daily",
    silhouetteSummary: "오른손을 들어 흔드는 친근한 웹툰 등장 인사 실루엣",
    handPair: ["relaxed", "open"],
    defaultLookAtOffset: [0, 0.02, 2.2],
    yOffset: 0,
    bones: {
      hips: rot(0, -8, 4),
      spine: rot(2, -4, -4),
      chest: rot(2, -4, -4),
      neck: rot(0, 6, 4),
      head: rot(2, 8, 6),
      leftShoulder: rot(0, 0, -10),
      leftUpperArm: rot(6, 10, -68),
      leftLowerArm: rot(0, 0, -24),
      rightShoulder: rot(0, 0, -16),
      rightUpperArm: rot(-16, -24, -44),
      rightLowerArm: rot(0, 0, 96),
      leftUpperLeg: rot(-6, 8, -5),
      leftLowerLeg: rot(10, 0, 0),
      rightUpperLeg: rot(4, -6, 5),
      rightLowerLeg: rot(6, 0, 0),
    },
  }),
]);

const ACTION_PRESET_BY_ID: ReadonlyMap<string, VrmActionSilhouettePreset> = new Map(
  VRM_ACTION_SILHOUETTE_PRESETS.map((preset) => [preset.id, preset]),
);

/** ID로 웹툰 액션 실루엣 12종 프리셋을 조회한다. */
export function findVrmActionSilhouettePreset(id: string): VrmActionSilhouettePreset | null {
  return ACTION_PRESET_BY_ID.get(id) ?? null;
}

/** 등록된 12종 웹툰 액션 실루엣 프리셋 전체 목록을 반환한다. */
export function listVrmActionSilhouettePresets(): readonly VrmActionSilhouettePreset[] {
  return VRM_ACTION_SILHOUETTE_PRESETS;
}

/* ------------------------------------------------------------------ */
/* 단일 시선(LookAt) 핀 솔버: 타깃 3D 좌표 → 목/머리/안구 회전 분배        */
/* ------------------------------------------------------------------ */

/** 캐릭터 1인당 유지하는 단일 시선(LookAt) 핀. */
export interface VrmLookAtPin {
  readonly enabled: boolean;
  /** 월드 공간 단일 시선 목표 좌표(m). */
  readonly targetWorld: VrmVec3;
  /** 시선 추적 강도 [0, 1] (기본 1). */
  readonly weight?: number;
}

export interface VrmLookAtDistribution {
  readonly neckShare: number;
  readonly headShare: number;
  readonly eyeShare: number;
}

export const DEFAULT_VRM_LOOK_AT_DISTRIBUTION: VrmLookAtDistribution = Object.freeze({
  neckShare: 0.25,
  headShare: 0.45,
  eyeShare: 0.30,
});

export interface SolveVrmLookAtPinInput {
  readonly pin: VrmLookAtPin;
  readonly headWorldPosition: VrmVec3;
  /** 캐릭터 정면 월드 벡터(기본 `+Z`, `#030` 정규화 결과 주입 가능). */
  readonly characterForward?: VrmVec3;
  /** 캐릭터 상향 월드 벡터(기본 `+Y`). */
  readonly characterUp?: VrmVec3;
  readonly distribution?: Partial<VrmLookAtDistribution>;
}

export interface VrmLookAtPinSolution {
  readonly enabled: boolean;
  readonly targetWorld: VrmVec3;
  readonly yawRad: number;
  readonly pitchRad: number;
  readonly lookAtDeg: Readonly<{ readonly yawDeg: number; readonly pitchDeg: number }>;
  readonly neckRotation: StudioVrmJointRotation;
  readonly headRotation: StudioVrmJointRotation;
  readonly leftEyeRotation: StudioVrmJointRotation;
  readonly rightEyeRotation: StudioVrmJointRotation;
  readonly clamped: boolean;
  readonly behindCharacter: boolean;
  readonly bones: PoseBoneMap;
}

function normalizeVec3(v: VrmVec3): VrmVec3 | null {
  if (!Number.isFinite(v[0]) || !Number.isFinite(v[1]) || !Number.isFinite(v[2])) return null;
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < EPSILON) return null;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: VrmVec3, b: VrmVec3): VrmVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: VrmVec3, b: VrmVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cleanZero(value: number): number {
  return Object.is(value, -0) || Math.abs(value) < 1e-12 ? 0 : value;
}

function normalizeDistribution(
  partial?: Partial<VrmLookAtDistribution>,
): VrmLookAtDistribution {
  const neck = Math.max(0, partial?.neckShare ?? DEFAULT_VRM_LOOK_AT_DISTRIBUTION.neckShare);
  const head = Math.max(0, partial?.headShare ?? DEFAULT_VRM_LOOK_AT_DISTRIBUTION.headShare);
  const eye = Math.max(0, partial?.eyeShare ?? DEFAULT_VRM_LOOK_AT_DISTRIBUTION.eyeShare);
  const sum = neck + head + eye;
  if (!Number.isFinite(sum) || sum <= EPSILON) return DEFAULT_VRM_LOOK_AT_DISTRIBUTION;
  return { neckShare: neck / sum, headShare: head / sum, eyeShare: eye / sum };
}

function clampSingleAxis(
  bone: VRMHumanBoneName,
  axis: "x" | "y",
  value: number,
): { readonly value: number; readonly overflow: number; readonly clamped: boolean } {
  // 자연스러운 시선 추적을 위해 soft 한계(목 ±55°·머리 ±50°·눈 ±25°, 총 ±130°)를 적용해
  // 캐릭터 등 뒤 타깃에서도 부엉이처럼 목이 180° 돌아가지 않도록 방지한다.
  const limit = getStudioVrmJointLimit(bone)[axis];
  const clampedValue = Math.min(limit.softMax, Math.max(limit.softMin, value));
  const overflow = value - clampedValue;
  return {
    value: cleanZero(clampedValue),
    overflow: cleanZero(overflow),
    clamped: Math.abs(overflow) > EPSILON,
  };
}

function distributeAxisWithRollover(
  totalAngle: number,
  axis: "x" | "y",
  dist: VrmLookAtDistribution,
): {
  readonly neck: number;
  readonly head: number;
  readonly eye: number;
  readonly clamped: boolean;
} {
  // 1차 분배: 안구가 먼저 반응하고 머리와 목이 자연스럽게 따라간다.
  const eyeStep = clampSingleAxis("leftEye", axis, totalAngle * dist.eyeShare);
  const headStep = clampSingleAxis(
    "head",
    axis,
    totalAngle * dist.headShare + eyeStep.overflow * 0.65,
  );
  const neckStep = clampSingleAxis(
    "neck",
    axis,
    totalAngle * dist.neckShare + eyeStep.overflow * 0.35 + headStep.overflow,
  );
  return {
    neck: neckStep.value,
    head: headStep.value,
    eye: eyeStep.value,
    clamped: eyeStep.clamped || headStep.clamped || neckStep.clamped,
  };
}

function neutralLookAtSolution(targetWorld: VrmVec3, enabled: boolean): VrmLookAtPinSolution {
  const zero: StudioVrmJointRotation = Object.freeze([0, 0, 0] as const);
  return Object.freeze({
    enabled,
    targetWorld: Object.freeze([targetWorld[0], targetWorld[1], targetWorld[2]] as const),
    yawRad: 0,
    pitchRad: 0,
    lookAtDeg: Object.freeze({ yawDeg: 0, pitchDeg: 0 }),
    neckRotation: zero,
    headRotation: zero,
    leftEyeRotation: zero,
    rightEyeRotation: zero,
    clamped: false,
    behindCharacter: false,
    bones: Object.freeze({
      neck: { rotation: [0, 0, 0] },
      head: { rotation: [0, 0, 0] },
      leftEye: { rotation: [0, 0, 0] },
      rightEye: { rotation: [0, 0, 0] },
    }),
  });
}

/**
 * 단일 LookAt 타깃 좌표를 목(`neck`)·머리(`head`)·양안(`leftEye`/`rightEye`) 오일러 회전으로 푼다.
 *
 * Three.js / VRM 정규화 좌표계(`+Y` 위, `+Z` 정면, `+X` 캐릭터 좌측) 기준:
 * - `+Y` 회전(yaw > 0)은 캐릭터 좌측(`+X`)을 바라본다.
 * - `-X` 회전(pitch < 0)은 위쪽(`+Y`), `+X` 회전(pitch > 0)은 아래쪽(`-Y`)을 바라본다.
 */
export function solveVrmLookAtPin(input: SolveVrmLookAtPinInput): VrmLookAtPinSolution {
  const { pin, headWorldPosition } = input;
  const safeTarget: VrmVec3 = [
    Number.isFinite(pin.targetWorld[0]) ? pin.targetWorld[0] : 0,
    Number.isFinite(pin.targetWorld[1]) ? pin.targetWorld[1] : 1.5,
    Number.isFinite(pin.targetWorld[2]) ? pin.targetWorld[2] : 2,
  ];
  const weight =
    typeof pin.weight === "number" && Number.isFinite(pin.weight)
      ? Math.min(1, Math.max(0, pin.weight))
      : 1;
  if (!pin.enabled || weight <= EPSILON) {
    return neutralLookAtSolution(safeTarget, pin.enabled);
  }

  const delta: VrmVec3 = [
    safeTarget[0] - headWorldPosition[0],
    safeTarget[1] - headWorldPosition[1],
    safeTarget[2] - headWorldPosition[2],
  ];
  const dir = normalizeVec3(delta);
  if (!dir) return neutralLookAtSolution(safeTarget, true);

  const forward = normalizeVec3(input.characterForward ?? VRM_CANONICAL_WORLD_FORWARD)
    ?? VRM_CANONICAL_WORLD_FORWARD;
  const rawUp = normalizeVec3(input.characterUp ?? ([0, 1, 0] as const)) ?? ([0, 1, 0] as const);
  const leftAxis = normalizeVec3(cross(rawUp, forward)) ?? ([1, 0, 0] as const);
  const upAxis = normalizeVec3(cross(forward, leftAxis)) ?? rawUp;

  const localLeft = dot(dir, leftAxis);
  const localUp = dot(dir, upAxis);
  const localForward = dot(dir, forward);
  const horizontalDist = Math.hypot(localLeft, localForward);

  const rawYaw = Math.atan2(localLeft, localForward);
  const rawPitch = Math.atan2(-localUp, horizontalDist);
  const behindCharacter = localForward < 0;

  const weightedYaw = rawYaw * weight;
  const weightedPitch = rawPitch * weight;
  const dist = normalizeDistribution(input.distribution);

  const yawSplit = distributeAxisWithRollover(weightedYaw, "y", dist);
  const pitchSplit = distributeAxisWithRollover(weightedPitch, "x", dist);

  const neckRotation = clampStudioVrmJointRotation("neck", [pitchSplit.neck, yawSplit.neck, 0]);
  const headRotation = clampStudioVrmJointRotation("head", [pitchSplit.head, yawSplit.head, 0]);
  const leftEyeRotation = clampStudioVrmJointRotation("leftEye", [pitchSplit.eye, yawSplit.eye, 0]);
  const rightEyeRotation = clampStudioVrmJointRotation("rightEye", [pitchSplit.eye, yawSplit.eye, 0]);

  const appliedYaw = neckRotation[1] + headRotation[1] + leftEyeRotation[1];
  const appliedPitch = neckRotation[0] + headRotation[0] + leftEyeRotation[0];

  return Object.freeze({
    enabled: true,
    targetWorld: Object.freeze(safeTarget),
    yawRad: cleanZero(appliedYaw),
    pitchRad: cleanZero(appliedPitch),
    lookAtDeg: Object.freeze({
      yawDeg: cleanZero(leftEyeRotation[1] * RAD_TO_DEG),
      pitchDeg: cleanZero(-leftEyeRotation[0] * RAD_TO_DEG),
    }),
    neckRotation: Object.freeze(neckRotation),
    headRotation: Object.freeze(headRotation),
    leftEyeRotation: Object.freeze(leftEyeRotation),
    rightEyeRotation: Object.freeze(rightEyeRotation),
    clamped: yawSplit.clamped || pitchSplit.clamped,
    behindCharacter,
    bones: Object.freeze({
      neck: { rotation: [neckRotation[0], neckRotation[1], neckRotation[2]] },
      head: { rotation: [headRotation[0], headRotation[1], headRotation[2]] },
      leftEye: { rotation: [leftEyeRotation[0], leftEyeRotation[1], leftEyeRotation[2]] },
      rightEye: { rotation: [rightEyeRotation[0], rightEyeRotation[1], rightEyeRotation[2]] },
    }),
  });
}

/**
 * 기본 포즈 본 맵에 단일 LookAt 핀 솔루션을 덮어쓰기(또는 기존 목·머리 회전과 가산)한다.
 * 원본 포즈 맵을 변이하지 않고 해부학 클램프를 거쳐 안전하게 반환한다.
 */
export function applyVrmLookAtPinToPose(
  baseBones: PoseBoneMap,
  solution: VrmLookAtPinSolution,
  options: { readonly mode?: "replace" | "additive" } = {},
): PoseBoneMap {
  if (!solution.enabled) return { ...baseBones };
  const mode = options.mode ?? "replace";
  const next: PoseBoneMap = { ...baseBones };
  const gazeBones = [
    ["neck", solution.neckRotation],
    ["head", solution.headRotation],
    ["leftEye", solution.leftEyeRotation],
    ["rightEye", solution.rightEyeRotation],
  ] as const;

  for (const [boneName, solvedRot] of gazeBones) {
    if (mode === "additive") {
      const prev = baseBones[boneName]?.rotation ?? [0, 0, 0];
      const clamped = clampStudioVrmJointRotation(boneName, [
        prev[0] + solvedRot[0],
        prev[1] + solvedRot[1],
        prev[2] + solvedRot[2],
      ]);
      next[boneName] = { rotation: [clamped[0], clamped[1], clamped[2]] };
    } else {
      next[boneName] = { rotation: [solvedRot[0], solvedRot[1], solvedRot[2]] };
    }
  }
  return next;
}

/** 로드된 VRM 인스턴스에 단일 LookAt 핀을 풀어 머리·목·안구 본(및 `vrm.lookAt`)에 반영한다. */
export function applyVrmLookAtPinToVrm(
  vrm: VRM & VrmForwardAxisSourceLike,
  pin: VrmLookAtPin,
  options: {
    readonly distribution?: Partial<VrmLookAtDistribution>;
    readonly ignoreUserBodyRotation?: boolean;
  } = {},
): VrmLookAtPinSolution {
  vrm.scene?.updateMatrixWorld(true);
  const headNode = vrm.humanoid?.getNormalizedBoneNode("head") ?? null;
  const headWorld = headNode
    ? headNode.getWorldPosition(new THREE.Vector3())
    : new THREE.Vector3(0, 1.52, 0);
  const forwardResolution = resolveVrmForwardAxisFromVrm(vrm, {
    ignoreUserBodyRotation: options.ignoreUserBodyRotation ?? false,
  });
  const solution = solveVrmLookAtPin({
    pin,
    headWorldPosition: [headWorld.x, headWorld.y, headWorld.z],
    characterForward: forwardResolution.worldForward,
    distribution: options.distribution,
  });

  if (!solution.enabled) return solution;

  const updates: readonly [VRMHumanBoneName, StudioVrmJointRotation][] = [
    ["neck", solution.neckRotation],
    ["head", solution.headRotation],
    ["leftEye", solution.leftEyeRotation],
    ["rightEye", solution.rightEyeRotation],
  ];
  for (const [boneName, rotation] of updates) {
    const node = vrm.humanoid?.getNormalizedBoneNode(boneName);
    if (!node) continue;
    node.rotation.set(rotation[0], rotation[1], rotation[2]);
  }
  if (vrm.lookAt) {
    vrm.lookAt.yaw = solution.lookAtDeg.yawDeg;
    vrm.lookAt.pitch = solution.lookAtDeg.pitchDeg;
  }
  vrm.scene?.updateMatrixWorld(true);
  return solution;
}

/** 12종 웹툰 액션 실루엣 프리셋 1건과 선택적 단일 LookAt 핀을 VRM에 원클릭 적용한다. */
export function applyVrmActionSilhouettePreset(
  vrm: VRM & VrmForwardAxisSourceLike,
  presetId: VrmActionSilhouetteId,
  options: { readonly lookAtPin?: VrmLookAtPin | null } = {},
): {
  readonly applied: boolean;
  readonly preset: VrmActionSilhouettePreset | null;
  readonly lookAtSolution: VrmLookAtPinSolution | null;
} {
  const preset = findVrmActionSilhouettePreset(presetId);
  if (!preset) {
    return Object.freeze({ applied: false, preset: null, lookAtSolution: null });
  }
  const applied = applyPoseToVrm(vrm, preset.bones, preset.yOffset);
  if (!applied) {
    return Object.freeze({ applied: false, preset, lookAtSolution: null });
  }
  const lookAtSolution = options.lookAtPin?.enabled
    ? applyVrmLookAtPinToVrm(vrm, options.lookAtPin)
    : null;
  return Object.freeze({ applied: true, preset, lookAtSolution });
}
