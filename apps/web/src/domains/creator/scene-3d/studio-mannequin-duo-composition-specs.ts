/**
 * Studio 3D 데생 인형 — 2인 구도 스펙 표(순수 데이터).
 *
 * 2인 프리셋마다 상대를 어디에(배치·간격·쪽) 어떤 자세로(미러·기본·저작) 세우고 누가 누구를
 * 보는지(시선)를 선언한다. 배치·시선·손 접촉 계산은 studio-mannequin-duo-composition 과
 * studio-mannequin-duo-contacts 가 이 표를 읽어 수행한다.
 */

import type { StudioMannequinJointId, StudioMannequinVec3 } from "./studio-mannequin-model";

// ── 구도 스펙 ────────────────────────────────────────────────────────────────

/** 상대의 배치 방식. */
export type StudioMannequinDuoArrangement =
  | "face-to-face" // 마주 보기 (포옹·하이파이브·벽치기)
  | "front-same-facing" // 주인공 앞, 같은 방향 (백허그의 상대)
  | "side-by-side" // 나란히 (손잡기·팔짱·어깨 기대기)
  | "back-to-back"; // 등 맞대기 (라이벌·버디 대치 연출)

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
export const STUDIO_MANNEQUIN_DUO_RELAXED_STAND_JOINTS: Readonly<
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

/** 우산 같이 쓰기 상대역 — 우산 든 주인공 쪽으로 몸을 붙이고 두 손을 앞에 모은 자세. */
const UMBRELLA_PARTNER_JOINTS: Readonly<
  Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>
> = Object.freeze({
  spine: deg3(2, 0, -3),
  neck: deg3(0, 0, -4),
  head: deg3(6, 0, -6),
  leftUpperArm: deg3(-22, 0, 6),
  leftLowerArm: deg3(-84, 0, 0),
  rightUpperArm: deg3(-22, 0, -6),
  rightLowerArm: deg3(-84, 0, 0),
  leftUpperLeg: deg3(0, 0, 3),
  rightUpperLeg: deg3(0, 0, -3),
});

/** 귓속말 듣는 상대역 — 고개를 주인공 쪽(+X)으로 돌리고 살짝 기울여 귀를 내준다. */
const LISTEN_TOWARD_LEFT_JOINTS: Readonly<
  Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>
> = Object.freeze({
  spine: deg3(2, 4, -2),
  neck: deg3(4, 10, -6),
  head: deg3(6, 14, -8),
  leftUpperArm: deg3(-4, 0, 8),
  leftLowerArm: deg3(-18, 0, 0),
  rightUpperArm: deg3(-4, 0, -8),
  rightLowerArm: deg3(-18, 0, 0),
  leftUpperLeg: deg3(0, 0, 3),
  rightUpperLeg: deg3(0, 0, -3),
});

/** 같은 자세를 반대쪽(−X)으로 — 왼쪽으로 기울이는 웹툰 귓속말의 상대역. */
const LISTEN_TOWARD_RIGHT_JOINTS: Readonly<
  Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>
> = Object.freeze({
  spine: deg3(2, -4, 2),
  neck: deg3(4, -10, 6),
  head: deg3(6, -14, 8),
  leftUpperArm: deg3(-4, 0, 8),
  leftLowerArm: deg3(-18, 0, 0),
  rightUpperArm: deg3(-4, 0, -8),
  rightLowerArm: deg3(-18, 0, 0),
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
    // 귓속말: 기울이는 쪽에 상대를 세운다(라이브러리 판은 오른쪽, 웹툰 판은 왼쪽으로 기운다).
    {
      id: "duo-whisper",
      presetIds: ["dialogue-whisper"],
      label: "귓속말",
      arrangement: "side-by-side",
      side: -1,
      gapM: -0.04,
      maxOverlapM: 0.04,
      partnerPoseSource: "authored",
      partnerJoints: LISTEN_TOWARD_LEFT_JOINTS,
      gaze: "none",
    },
    {
      id: "duo-whisper-secret",
      presetIds: ["dialogue-whisper-secret"],
      label: "귓속말(비밀)",
      arrangement: "side-by-side",
      side: 1,
      gapM: -0.04,
      maxOverlapM: 0.04,
      partnerPoseSource: "authored",
      partnerJoints: LISTEN_TOWARD_RIGHT_JOINTS,
      gaze: "none",
    },
    {
      id: "duo-umbrella-share",
      presetIds: ["couple-umbrella-share"],
      label: "우산 같이 쓰기",
      arrangement: "side-by-side",
      side: -1,
      gapM: -0.02,
      maxOverlapM: 0.03,
      partnerPoseSource: "authored",
      partnerJoints: UMBRELLA_PARTNER_JOINTS,
      gaze: "mutual",
    },
    {
      id: "duo-shoulder-arm",
      presetIds: ["couple-shoulder-arm"],
      label: "어깨동무",
      arrangement: "side-by-side",
      side: 1,
      gapM: -0.03,
      maxOverlapM: 0.04,
      partnerPoseSource: "mirror-lead",
      gaze: "none",
    },
    {
      id: "duo-back-to-back",
      presetIds: ["couple-back-to-back"],
      label: "등 맞대기",
      arrangement: "back-to-back",
      side: 1,
      gapM: -0.01,
      maxOverlapM: 0.03,
      partnerPoseSource: "mirror-lead",
      gaze: "none",
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
