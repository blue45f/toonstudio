/**
 * Studio 3D 데생 인형 — 포즈 프리셋 라이브러리 + 미러 유틸 + 직렬화(순수 데이터 계층).
 *
 * 포즈는 관절 오일러(rad) 맵과 골반 오프셋(m)만으로 표현되어 체형 파라미터와 독립적으로
 * 재사용된다. 직렬화는 다른 Studio 문서와 같은 버전드 + 방어적 정규화 계약을 따른다:
 * 알 수 없는 관절은 버리고, 각도는 표준 범위 접기 + 관절 한계 클램프를 거친다.
 * Three.js import 없음 — 결정적이고 단위 테스트 가능하다.
 */

import {
  STUDIO_MANNEQUIN_JOINT_IDS,
  clampStudioMannequinBodyParams,
  clampStudioMannequinJointRotation,
  isStudioMannequinJointId,
  type StudioMannequinBodyParams,
  type StudioMannequinJointId,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";

export interface StudioMannequinPose {
  /** 관절 오일러(XYZ, rad). 항등 회전 관절은 생략 가능. */
  readonly joints: Readonly<Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>>;
  /** rest 골반 위치에 더하는 오프셋(m) — 앉기/점프/눕기용. */
  readonly pelvisOffset: StudioMannequinVec3;
}

export type StudioMannequinPoseCategory =
  | "basic"
  | "action"
  | "daily"
  | "dialogue"
  | "couple"
  | "sitting"
  | "sports"
  | "webtoon"
  | "hand";

export const STUDIO_MANNEQUIN_POSE_CATEGORIES: readonly {
  id: StudioMannequinPoseCategory;
  label: string;
}[] = Object.freeze([
  { id: "basic", label: "기본" },
  { id: "daily", label: "일상" },
  { id: "dialogue", label: "대화" },
  { id: "couple", label: "커플·2인" },
  { id: "sitting", label: "앉기" },
  { id: "action", label: "액션·전투" },
  { id: "sports", label: "스포츠·동작" },
  { id: "webtoon", label: "웹툰 연출" },
  { id: "hand", label: "손 전용" },
]);

/** 프리셋 적용 범위. "hand-only"는 손목 관절만 바꾸고 몸 포즈는 건드리지 않는다. */
export type StudioMannequinPoseScope = "full-body" | "hand-only";

export interface StudioMannequinPosePreset {
  readonly id: string;
  readonly label: string;
  readonly category: StudioMannequinPoseCategory;
  readonly pose: StudioMannequinPose;
  /** 검색·탐색용 한글 키워드. 없으면 라벨·카테고리로만 검색된다. */
  readonly tags?: readonly string[];
  /** 목록에서 포즈 용도를 한 줄로 설명한다. */
  readonly description?: string;
  /** 적용 범위. 없으면 카테고리가 "hand"일 때 손 전용, 아니면 전신으로 본다. */
  readonly scope?: StudioMannequinPoseScope;
  /** 연출에 필요한 인원수. 없으면 1인. 커플 포즈는 2. */
  readonly figures?: 1 | 2;
}

/** 프리셋의 실제 적용 범위(기본값 규칙 적용). */
export function studioMannequinPosePresetScope(
  preset: StudioMannequinPosePreset,
): StudioMannequinPoseScope {
  return preset.scope ?? (preset.category === "hand" ? "hand-only" : "full-body");
}

const PELVIS_OFFSET_LIMIT = 2;

function deg3(x: number, y: number, z: number): StudioMannequinVec3 {
  return [(x * Math.PI) / 180, (y * Math.PI) / 180, (z * Math.PI) / 180];
}

export function createStudioMannequinRestPose(): StudioMannequinPose {
  return { joints: {}, pelvisOffset: [0, 0, 0] };
}

type JointMap = Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>;

function pose(joints: JointMap, pelvisOffset: StudioMannequinVec3 = [0, 0, 0]): StudioMannequinPose {
  return { joints, pelvisOffset };
}

/**
 * 프리셋 각도는 전부 관절 한계 안에서 손으로 저작했다(테스트가 클램프 불변을 검증).
 * 좌표 감각: 팔다리 rest 는 −Y로 늘어짐. X− = 앞으로 스윙(팔·다리), 팔꿈치 X− = 앞굽힘,
 * 무릎 X+ = 뒤굽힘, 왼쪽 Z+ = 바깥 벌림(오른쪽은 부호 반전), 몸통 X+ = 앞으로 숙임.
 */
export const STUDIO_MANNEQUIN_POSE_PRESETS: readonly StudioMannequinPosePreset[] = Object.freeze([
  {
    id: "stand",
    label: "서기",
    category: "basic",
    tags: ["서기", "기본자세", "대기"],
    description: "가장 기본이 되는 편안한 서기 자세",
    pose: pose({
      spine: deg3(2, 0, 0),
      leftUpperArm: deg3(-4, 0, 8),
      rightUpperArm: deg3(-4, 0, -8),
      leftLowerArm: deg3(-14, 0, 0),
      rightLowerArm: deg3(-14, 0, 0),
      leftUpperLeg: deg3(0, 0, 4),
      rightUpperLeg: deg3(0, 0, -4),
    }),
  },
  {
    id: "attention",
    label: "차렷",
    category: "basic",
    tags: ["차렷", "대기", "기본"],
    description: "발을 모으고 똑바로 선 차렷 자세",
    pose: pose({
      leftUpperArm: deg3(0, 0, 3),
      rightUpperArm: deg3(0, 0, -3),
      leftLowerArm: deg3(-4, 0, 0),
      rightLowerArm: deg3(-4, 0, 0),
      leftUpperLeg: deg3(0, 0, 1),
      rightUpperLeg: deg3(0, 0, -1),
    }),
  },
  {
    id: "walk",
    label: "걷기",
    category: "daily",
    tags: ["걷기", "이동", "보행"],
    description: "자연스럽게 걷는 중간 동작",
    pose: pose({
      pelvis: deg3(0, -6, 0),
      chest: deg3(0, 7, 0),
      leftUpperLeg: deg3(-26, 0, 2),
      leftLowerLeg: deg3(10, 0, 0),
      leftFoot: deg3(6, 0, 0),
      rightUpperLeg: deg3(20, 0, -2),
      rightLowerLeg: deg3(30, 0, 0),
      rightFoot: deg3(18, 0, 0),
      leftUpperArm: deg3(22, 0, 6),
      leftLowerArm: deg3(-20, 0, 0),
      rightUpperArm: deg3(-26, 0, -6),
      rightLowerArm: deg3(-38, 0, 0),
    }),
  },
  {
    id: "run",
    label: "달리기",
    category: "sports",
    tags: ["달리기", "뛰기", "질주"],
    description: "힘차게 달리는 동작",
    pose: pose({
      spine: deg3(14, 0, 0),
      chest: deg3(8, 6, 0),
      leftUpperLeg: deg3(-62, 0, 3),
      leftLowerLeg: deg3(48, 0, 0),
      leftFoot: deg3(-12, 0, 0),
      rightUpperLeg: deg3(34, 0, -3),
      rightLowerLeg: deg3(96, 0, 0),
      rightFoot: deg3(28, 0, 0),
      leftUpperArm: deg3(34, 0, 6),
      leftLowerArm: deg3(-72, 0, 0),
      rightUpperArm: deg3(-48, 0, -6),
      rightLowerArm: deg3(-92, 0, 0),
    }, [0, 0.04, 0]),
  },
  {
    id: "sit-chair",
    label: "앉기(의자)",
    category: "sitting",
    tags: ["앉기", "의자", "카페"],
    description: "의자에 앉은 기본 자세",
    pose: pose({
      spine: deg3(6, 0, 0),
      leftUpperLeg: deg3(-84, 0, 6),
      rightUpperLeg: deg3(-84, 0, -6),
      leftLowerLeg: deg3(82, 0, 0),
      rightLowerLeg: deg3(82, 0, 0),
      leftFoot: deg3(2, 0, 0),
      rightFoot: deg3(2, 0, 0),
      leftUpperArm: deg3(-26, 0, 6),
      rightUpperArm: deg3(-26, 0, -6),
      leftLowerArm: deg3(-44, 0, 0),
      rightLowerArm: deg3(-44, 0, 0),
    }, [0, -0.42, 0]),
  },
  {
    id: "kneel",
    label: "무릎앉기",
    category: "sitting",
    tags: ["무릎", "앉기", "바닥"],
    description: "한쪽 무릎을 꿇고 앉은 자세",
    pose: pose({
      spine: deg3(4, 0, 0),
      leftUpperLeg: deg3(-72, 0, 4),
      leftLowerLeg: deg3(70, 0, 0),
      leftFoot: deg3(-8, 0, 0),
      rightUpperLeg: deg3(12, 0, -4),
      rightLowerLeg: deg3(112, 0, 0),
      rightFoot: deg3(42, 0, 0),
      leftUpperArm: deg3(-12, 0, 8),
      leftLowerArm: deg3(-16, 0, 0),
      rightUpperArm: deg3(-30, 0, -6),
      rightLowerArm: deg3(-52, 0, 0),
    }, [0, -0.45, 0]),
  },
  {
    id: "jump",
    label: "점프",
    category: "sports",
    tags: ["점프", "도약", "공중"],
    description: "양팔을 벌리고 뛰어오른 순간",
    pose: pose({
      spine: deg3(-6, 0, 0),
      leftUpperArm: deg3(-10, 0, 150),
      rightUpperArm: deg3(-10, 0, -150),
      leftLowerArm: deg3(-18, 0, 0),
      rightLowerArm: deg3(-18, 0, 0),
      leftUpperLeg: deg3(-36, 0, 6),
      rightUpperLeg: deg3(-36, 0, -6),
      leftLowerLeg: deg3(64, 0, 0),
      rightLowerLeg: deg3(64, 0, 0),
      leftFoot: deg3(30, 0, 0),
      rightFoot: deg3(30, 0, 0),
    }, [0, 0.28, 0]),
  },
  {
    id: "punch",
    label: "스트레이트 펀치",
    category: "action",
    tags: ["펀치", "주먹", "격투", "전투"],
    description: "몸을 틀어 내지르는 스트레이트 펀치",
    pose: pose({
      spine: deg3(0, -12, 0),
      chest: deg3(0, -28, 0),
      head: deg3(0, 24, 0),
      rightUpperArm: deg3(-88, 0, -12),
      rightLowerArm: deg3(-6, 0, 0),
      leftUpperArm: deg3(-38, 0, 20),
      leftLowerArm: deg3(-118, 0, 0),
      leftUpperLeg: deg3(-18, 0, 4),
      leftLowerLeg: deg3(12, 0, 0),
      rightUpperLeg: deg3(24, 0, -6),
      rightLowerLeg: deg3(22, 0, 0),
    }),
  },
  {
    id: "kick-flying",
    label: "플라잉 점프 킥",
    category: "action",
    tags: ["발차기", "킥", "점프", "격투"],
    description: "공중에서 날리는 플라잉 킥",
    pose: pose({
      spine: deg3(-12, 10, 0),
      rightUpperLeg: deg3(-82, 0, -6),
      rightLowerLeg: deg3(10, 0, 0),
      leftUpperLeg: deg3(18, 0, 6),
      leftLowerLeg: deg3(98, 0, 0),
      rightUpperArm: deg3(20, 0, -32),
      rightLowerArm: deg3(-72, 0, 0),
      leftUpperArm: deg3(-42, 0, 60),
      leftLowerArm: deg3(-40, 0, 0),
    }, [0, 0.35, 0]),
  },
  {
    id: "sword-ready",
    label: "검술 발도 자세",
    category: "action",
    tags: ["검", "발도", "무사", "전투"],
    description: "검을 뽑기 직전의 발도 자세",
    pose: pose({
      spine: deg3(12, -18, 0),
      chest: deg3(4, -12, 0),
      head: deg3(-4, 28, 0),
      rightUpperArm: deg3(-58, 20, -42),
      rightLowerArm: deg3(-88, 0, 0),
      leftUpperArm: deg3(-48, -14, 28),
      leftLowerArm: deg3(-102, 0, 0),
      leftUpperLeg: deg3(-42, 0, 10),
      leftLowerLeg: deg3(38, 0, 0),
      rightUpperLeg: deg3(22, 0, -8),
      rightLowerLeg: deg3(44, 0, 0),
    }, [0, -0.15, 0]),
  },
  {
    id: "hero-landing",
    label: "히어로 착지 포즈",
    category: "action",
    tags: ["히어로", "착지", "슈퍼히어로"],
    description: "한 손을 바닥에 짚는 히어로 착지",
    pose: pose({
      spine: deg3(44, 0, 0),
      chest: deg3(24, 0, 0),
      head: deg3(-32, 0, 0),
      rightUpperArm: deg3(12, 0, -18),
      rightLowerArm: deg3(-120, 0, 0),
      leftUpperArm: deg3(28, 0, 24),
      leftLowerArm: deg3(-48, 0, 0),
      rightUpperLeg: deg3(-78, 0, -12),
      rightLowerLeg: deg3(105, 0, 0),
      leftUpperLeg: deg3(-62, 0, 14),
      leftLowerLeg: deg3(88, 0, 0),
    }, [0, -0.52, 0]),
  },
  {
    id: "arms-spread",
    label: "양팔벌리기",
    category: "basic",
    tags: ["양팔", "벌리기", "환영"],
    description: "양팔을 활짝 벌린 자세",
    pose: pose({
      leftUpperArm: deg3(0, 0, 86),
      rightUpperArm: deg3(0, 0, -86),
      leftLowerArm: deg3(-4, 0, 0),
      rightLowerArm: deg3(-4, 0, 0),
      leftHand: deg3(0, 0, 6),
      rightHand: deg3(0, 0, -6),
      leftUpperLeg: deg3(0, 0, 10),
      rightUpperLeg: deg3(0, 0, -10),
    }),
  },
  {
    id: "selfie",
    label: "셀카 포즈",
    category: "daily",
    tags: ["셀카", "사진", "브이"],
    description: "한 손으로 셀카를 찍고 다른 손은 브이",
    pose: pose({
      spine: deg3(0, 0, 6),
      chest: deg3(0, -6, 4),
      neck: deg3(0, -8, -4),
      head: deg3(-4, -18, -8),
      rightUpperArm: deg3(-118, 0, -26),
      rightLowerArm: deg3(-30, 0, 0),
      rightHand: deg3(-20, 0, 10),
      leftUpperArm: deg3(8, 0, 26),
      leftLowerArm: deg3(-96, 0, 0),
      leftHand: deg3(0, 0, -40),
    }),
  },
  {
    id: "think",
    label: "생각하기(턱괴기)",
    category: "daily",
    tags: ["생각", "턱괴기", "고민"],
    description: "턱을 괴고 생각에 잠긴 자세",
    pose: pose({
      spine: deg3(4, 0, 0),
      neck: deg3(6, 6, 0),
      head: deg3(10, 14, 8),
      rightUpperArm: deg3(-42, 0, -14),
      rightLowerArm: deg3(-126, 0, 0),
      rightHand: deg3(-28, 0, 0),
      leftUpperArm: deg3(-22, 0, 8),
      leftLowerArm: deg3(-86, 22, 0),
    }),
  },
  {
    id: "smartphone",
    label: "스마트폰 터치",
    category: "daily",
    tags: ["스마트폰", "전화", "휴대폰"],
    description: "양손으로 스마트폰을 보는 자세",
    pose: pose({
      spine: deg3(8, 0, 0),
      head: deg3(22, 0, 0),
      leftUpperArm: deg3(-38, 12, 24),
      leftLowerArm: deg3(-98, 0, 0),
      rightUpperArm: deg3(-42, -12, -24),
      rightLowerArm: deg3(-105, 0, 0),
    }),
  },
  {
    id: "wave",
    label: "손흔들기",
    category: "webtoon",
    tags: ["인사", "손흔들기", "반가움"],
    description: "한 손을 들어 흔드는 인사",
    pose: pose({
      head: deg3(0, 0, -8),
      rightUpperArm: deg3(-16, 0, -128),
      rightLowerArm: deg3(-48, 0, 0),
      rightHand: deg3(0, 0, 24),
      leftUpperArm: deg3(-4, 0, 8),
      leftLowerArm: deg3(-12, 0, 0),
      leftUpperLeg: deg3(0, 0, 4),
      rightUpperLeg: deg3(0, 0, -4),
    }),
  },
  {
    id: "heart-sign",
    label: "손가락 하트 시그널",
    category: "webtoon",
    tags: ["하트", "손가락하트", "애정"],
    description: "양손으로 하트 신호를 만드는 자세",
    pose: pose({
      spine: deg3(2, 4, 0),
      head: deg3(-4, -6, 6),
      leftUpperArm: deg3(-52, -14, 42),
      leftLowerArm: deg3(-108, 0, 0),
      rightUpperArm: deg3(-52, 14, -42),
      rightLowerArm: deg3(-108, 0, 0),
    }),
  },
  {
    id: "surprised",
    label: "깜짝 놀람 연출",
    category: "webtoon",
    tags: ["놀람", "깜짝", "충격"],
    description: "깜짝 놀라 몸을 뒤로 빼는 연출",
    pose: pose({
      spine: deg3(-14, 0, 0),
      chest: deg3(-12, 0, 0),
      head: deg3(-10, 0, 0),
      leftUpperArm: deg3(-18, 0, 68),
      leftLowerArm: deg3(-72, 0, 0),
      rightUpperArm: deg3(-18, 0, -68),
      rightLowerArm: deg3(-72, 0, 0),
      leftUpperLeg: deg3(12, 0, 8),
      rightUpperLeg: deg3(12, 0, -8),
    }, [0, 0.08, 0]),
  },
  {
    id: "soccer-shot",
    label: "축구 강력 슈팅",
    category: "sports",
    tags: ["축구", "슈팅", "킥", "스포츠"],
    description: "공을 강하게 차는 슈팅 동작",
    pose: pose({
      spine: deg3(-8, -14, 0),
      rightUpperLeg: deg3(-68, 0, -4),
      rightLowerLeg: deg3(12, 0, 0),
      leftUpperLeg: deg3(32, 0, 6),
      leftLowerLeg: deg3(64, 0, 0),
      leftUpperArm: deg3(-32, 0, 58),
      rightUpperArm: deg3(24, 0, -42),
    }),
  },
  {
    id: "bow",
    label: "정중한 정면 인사",
    category: "webtoon",
    tags: ["인사", "고개숙이기", "정중"],
    description: "상체를 숙이는 정중한 인사",
    pose: pose({
      spine: deg3(32, 0, 0),
      chest: deg3(26, 0, 0),
      neck: deg3(14, 0, 0),
      head: deg3(10, 0, 0),
      leftUpperArm: deg3(-8, 0, 4),
      rightUpperArm: deg3(-8, 0, -4),
      leftLowerArm: deg3(-10, 0, 0),
      rightLowerArm: deg3(-10, 0, 0),
      leftLowerLeg: deg3(4, 0, 0),
      rightLowerLeg: deg3(4, 0, 0),
    }),
  },
  {
    id: "hand-fist",
    label: "주먹 (Fist)",
    category: "hand",
    tags: ["주먹", "쥐기", "손"],
    description: "양손을 주먹으로 쥔 손 전용 포즈",
    scope: "hand-only",
    pose: pose({
      leftUpperArm: deg3(10, 0, 15),
      rightUpperArm: deg3(10, 0, -15),
      leftLowerArm: deg3(-60, 0, 0),
      rightLowerArm: deg3(-60, 0, 0),
      leftHand: deg3(-30, 0, 45),
      rightHand: deg3(-30, 0, -45),
    }),
  },
  {
    id: "hand-open",
    label: "펼친 손 (Open Palm)",
    category: "hand",
    tags: ["편손", "손바닥", "손"],
    description: "손가락을 활짝 편 손 전용 포즈",
    scope: "hand-only",
    pose: pose({
      leftUpperArm: deg3(15, 0, 20),
      rightUpperArm: deg3(15, 0, -20),
      leftLowerArm: deg3(-30, 0, 0),
      rightLowerArm: deg3(-30, 0, 0),
      leftHand: deg3(0, 0, 0),
      rightHand: deg3(0, 0, 0),
    }),
  },
  {
    id: "hand-peace",
    label: "V 사인 (Peace)",
    category: "hand",
    tags: ["브이", "피스", "손"],
    description: "브이 사인을 만드는 손 전용 포즈",
    scope: "hand-only",
    pose: pose({
      leftUpperArm: deg3(15, 0, 10),
      rightUpperArm: deg3(45, 0, -10),
      leftLowerArm: deg3(-20, 0, 0),
      rightLowerArm: deg3(-80, 0, 0),
      leftHand: deg3(0, 0, 10),
      rightHand: deg3(10, 0, -20),
    }),
  },
  {
    id: "hand-point",
    label: "가리키기 (Pointing)",
    category: "hand",
    tags: ["가리키기", "검지", "손"],
    description: "검지로 가리키는 손 전용 포즈",
    scope: "hand-only",
    pose: pose({
      leftUpperArm: deg3(15, 0, 15),
      rightUpperArm: deg3(70, 0, 0),
      leftLowerArm: deg3(-20, 0, 0),
      rightLowerArm: deg3(-10, 0, 0),
      leftHand: deg3(0, 0, 10),
      rightHand: deg3(0, 0, -10),
    }),
  },
  {
    id: "hand-chin",
    label: "턱 괴기 (Chin Rest)",
    category: "hand",
    tags: ["턱괴기", "생각", "고민", "손"],
    description: "턱을 괴고 생각에 잠긴 손 전용 포즈",
    scope: "hand-only",
    pose: pose({
      leftUpperArm: deg3(5, 0, 10), leftLowerArm: deg3(-15, 0, 0), leftHand: deg3(0, 0, 5),
      rightUpperArm: deg3(25, 0, -25), rightLowerArm: deg3(-115, 0, 0), rightHand: deg3(-15, 0, -10),
    }),
  },
  {
    id: "hand-salute",
    label: "경례 (Salute)",
    category: "hand",
    tags: ["경례", "손"],
    description: "이마에 손을 대는 경례 손 포즈",
    scope: "hand-only",
    pose: pose({
      leftUpperArm: deg3(10, 0, 10),
      rightUpperArm: deg3(50, 0, -30),
      leftLowerArm: deg3(-20, 0, 0),
      rightLowerArm: deg3(-110, 0, 0),
      leftHand: deg3(0, 0, 0),
      rightHand: deg3(15, 0, -10),
    }),
  },
  {
    id: "hand-prayer",
    label: "두 손 모으기 (Clasp)",
    category: "hand",
    tags: ["합장", "두손모으기", "기도", "손"],
    description: "두 손을 모으는 손 전용 포즈",
    scope: "hand-only",
    pose: pose({
      chest: deg3(8, 0, 0),
      leftUpperArm: deg3(30, 0, 20),
      rightUpperArm: deg3(30, 0, -20),
      leftLowerArm: deg3(-90, 0, 0),
      rightLowerArm: deg3(-90, 0, 0),
      leftHand: deg3(-10, 0, 30),
      rightHand: deg3(-10, 0, -30),
    }),
  },
  // ── 대화 (신규) ──────────────────────────────────────────────────────────
  {
    id: "dialogue-explain",
    label: "설명하며 손짓하기",
    category: "dialogue",
    tags: ["대화", "설명", "손짓", "발표"],
    description: "양손으로 손짓하며 설명하는 대화 자세",
    pose: pose({
      spine: deg3(4, -8, 0),
      chest: deg3(0, -6, 0),
      head: deg3(0, 10, 0),
      rightUpperArm: deg3(-52, 0, -18),
      rightLowerArm: deg3(-38, 0, 0),
      leftUpperArm: deg3(-34, 0, 22),
      leftLowerArm: deg3(-52, 0, 0),
      leftUpperLeg: deg3(0, 0, 4),
      rightUpperLeg: deg3(0, 0, -4),
    }),
  },
  {
    id: "dialogue-listen",
    label: "경청하며 끄덕이기",
    category: "dialogue",
    tags: ["대화", "경청", "끄덕이기", "듣기"],
    description: "상대 말을 들으며 살짝 고개를 숙인 자세",
    pose: pose({
      spine: deg3(8, 0, 0),
      neck: deg3(8, 0, 4),
      head: deg3(12, -6, 4),
      leftUpperArm: deg3(-18, 0, 14),
      leftLowerArm: deg3(-72, 0, 0),
      rightUpperArm: deg3(-18, 0, -14),
      rightLowerArm: deg3(-72, 0, 0),
    }),
  },
  {
    id: "dialogue-argue",
    label: "언쟁하며 삿대질",
    category: "dialogue",
    tags: ["대화", "언쟁", "다툼", "삿대질", "화"],
    description: "한 손으로 삿대질하며 따지는 언쟁 자세",
    pose: pose({
      spine: deg3(10, -10, 0),
      chest: deg3(6, -14, 0),
      head: deg3(0, 16, 0),
      rightUpperArm: deg3(-78, 0, -10),
      rightLowerArm: deg3(-8, 0, 0),
      leftUpperArm: deg3(-20, 0, 30),
      leftLowerArm: deg3(-96, 0, 0),
      leftUpperLeg: deg3(-14, 0, 4),
      leftLowerLeg: deg3(14, 0, 0),
      rightUpperLeg: deg3(16, 0, -4),
      rightLowerLeg: deg3(18, 0, 0),
    }),
  },
  {
    id: "dialogue-whisper",
    label: "귓속말하기",
    category: "dialogue",
    tags: ["대화", "귓속말", "속삭이기", "비밀"],
    description: "상대 귀에 대고 속삭이듯 몸을 기울인 자세",
    figures: 2,
    pose: pose({
      spine: deg3(6, -16, 6),
      neck: deg3(0, -18, 6),
      head: deg3(4, -24, 8),
      rightUpperArm: deg3(-44, 0, -30),
      rightLowerArm: deg3(-118, 0, 0),
      rightHand: deg3(-16, 0, -12),
      leftUpperArm: deg3(-6, 0, 10),
      leftLowerArm: deg3(-20, 0, 0),
    }),
  },
  {
    id: "dialogue-shout",
    label: "멀리 부르기",
    category: "dialogue",
    tags: ["대화", "부르기", "외치기", "손흔들기"],
    description: "한 팔을 높이 들어 멀리 있는 사람을 부르는 자세",
    pose: pose({
      spine: deg3(-6, 0, 0),
      head: deg3(-8, -12, 0),
      rightUpperArm: deg3(-30, 0, -120),
      rightLowerArm: deg3(-36, 0, 0),
      rightHand: deg3(0, 0, -20),
      leftUpperArm: deg3(-8, 0, 12),
      leftLowerArm: deg3(-16, 0, 0),
    }, [0, 0.02, 0]),
  },
  {
    id: "dialogue-question",
    label: "묻기·어깨 으쓱",
    category: "dialogue",
    tags: ["대화", "질문", "묻기", "으쓱", "모름"],
    description: "양손을 들고 어깨를 으쓱하는 물음 자세",
    pose: pose({
      spine: deg3(0, 0, -4),
      head: deg3(0, 0, -10),
      leftUpperArm: deg3(-16, 0, 64),
      leftLowerArm: deg3(-58, 0, 0),
      leftHand: deg3(0, 0, 18),
      rightUpperArm: deg3(-16, 0, -64),
      rightLowerArm: deg3(-58, 0, 0),
      rightHand: deg3(0, 0, -18),
    }),
  },
  // ── 커플·2인 (신규) — 포즈 자체는 주인공 1인분이며 figures가 상대 필요를 알린다 ──
  {
    id: "couple-hug-front",
    label: "마주 안기",
    category: "couple",
    tags: ["포옹", "안기", "연인", "로맨스"],
    description: "양팔을 벌려 상대를 마주 안는 자세 (상대 1인 추가 필요)",
    figures: 2,
    pose: pose({
      spine: deg3(6, 0, 0),
      chest: deg3(4, 0, 0),
      head: deg3(-4, 0, 4),
      leftUpperArm: deg3(-56, -18, 36),
      leftLowerArm: deg3(-64, 0, 0),
      rightUpperArm: deg3(-56, 18, -36),
      rightLowerArm: deg3(-64, 0, 0),
    }),
  },
  {
    id: "couple-back-hug",
    label: "뒤에서 안기(백허그)",
    category: "couple",
    tags: ["백허그", "포옹", "연인", "로맨스"],
    description: "상대 뒤에서 양팔로 감싸 안는 자세 (상대 1인 추가 필요)",
    figures: 2,
    pose: pose({
      spine: deg3(10, 0, 0),
      chest: deg3(6, 0, 0),
      leftUpperArm: deg3(-62, -24, 24),
      leftLowerArm: deg3(-78, 0, 0),
      rightUpperArm: deg3(-62, 24, -24),
      rightLowerArm: deg3(-78, 0, 0),
      leftUpperLeg: deg3(-10, 0, 4),
      rightUpperLeg: deg3(8, 0, -4),
    }),
  },
  {
    id: "couple-hand-hold-walk",
    label: "손잡고 걷기",
    category: "couple",
    tags: ["손잡기", "걷기", "데이트", "연인"],
    description: "옆 사람 손을 잡고 걷는 중간 동작 (상대 1인 추가 필요)",
    figures: 2,
    pose: pose({
      pelvis: deg3(0, -6, 0),
      chest: deg3(0, 6, 0),
      rightUpperArm: deg3(-24, 0, -30),
      rightLowerArm: deg3(-14, 0, 0),
      leftUpperArm: deg3(20, 0, 8),
      leftLowerArm: deg3(-18, 0, 0),
      leftUpperLeg: deg3(-24, 0, 2),
      leftLowerLeg: deg3(10, 0, 0),
      leftFoot: deg3(6, 0, 0),
      rightUpperLeg: deg3(18, 0, -2),
      rightLowerLeg: deg3(26, 0, 0),
      rightFoot: deg3(16, 0, 0),
    }),
  },
  {
    id: "couple-shoulder-lean",
    label: "어깨에 기대기",
    category: "couple",
    tags: ["기대기", "어깨", "연인", "휴식"],
    description: "옆 사람 어깨에 머리를 기대는 자세 (상대 1인 추가 필요)",
    figures: 2,
    pose: pose({
      spine: deg3(2, 0, 10),
      neck: deg3(0, 0, 12),
      head: deg3(0, 0, 14),
      leftUpperArm: deg3(-10, 0, 8),
      leftLowerArm: deg3(-24, 0, 0),
      rightUpperArm: deg3(-30, 0, -20),
      rightLowerArm: deg3(-70, 0, 0),
    }),
  },
  {
    id: "couple-high-five",
    label: "하이파이브",
    category: "couple",
    tags: ["하이파이브", "손뼉", "축하", "동료"],
    description: "한 손을 높이 들어 상대와 손뼉을 마주치는 자세 (상대 1인 추가 필요)",
    figures: 2,
    pose: pose({
      spine: deg3(-4, 0, 0),
      rightUpperArm: deg3(-140, 0, -24),
      rightLowerArm: deg3(-10, 0, 0),
      rightHand: deg3(0, 0, -14),
      leftUpperArm: deg3(-6, 0, 10),
      leftLowerArm: deg3(-12, 0, 0),
    }, [0, 0.05, 0]),
  },
  {
    id: "couple-arm-link",
    label: "팔짱 끼고 서기",
    category: "couple",
    tags: ["팔짱", "연인", "데이트", "서기"],
    description: "옆 사람과 팔짱을 끼고 나란히 선 자세 (상대 1인 추가 필요)",
    figures: 2,
    pose: pose({
      spine: deg3(0, 0, 4),
      head: deg3(0, -8, 4),
      rightUpperArm: deg3(-28, 0, -26),
      rightLowerArm: deg3(-88, 0, 0),
      leftUpperArm: deg3(-14, 0, 12),
      leftLowerArm: deg3(-30, 0, 0),
      leftUpperLeg: deg3(0, 0, 5),
      rightUpperLeg: deg3(0, 0, -5),
    }),
  },
  // ── 앉기 (신규) ──────────────────────────────────────────────────────────
  {
    id: "sit-floor-cross",
    label: "바닥 양반다리",
    category: "sitting",
    tags: ["앉기", "바닥", "양반다리", "좌식"],
    description: "바닥에 다리를 꼬고 앉은 좌식 자세",
    pose: pose({
      spine: deg3(6, 0, 0),
      leftUpperLeg: deg3(-78, 0, 38),
      leftLowerLeg: deg3(118, 0, 0),
      leftFoot: deg3(18, 0, 0),
      rightUpperLeg: deg3(-78, 0, -38),
      rightLowerLeg: deg3(118, 0, 0),
      rightFoot: deg3(18, 0, 0),
      leftUpperArm: deg3(-30, 0, 16),
      leftLowerArm: deg3(-28, 0, 0),
      rightUpperArm: deg3(-30, 0, -16),
      rightLowerArm: deg3(-28, 0, 0),
    }, [0, -0.62, 0]),
  },
  {
    id: "sit-sofa-lean",
    label: "소파에 기대앉기",
    category: "sitting",
    tags: ["앉기", "소파", "휴식", "기대기"],
    description: "등을 기대고 편하게 앉은 휴식 자세",
    pose: pose({
      spine: deg3(-10, 0, 0),
      chest: deg3(-6, 0, 0),
      leftUpperLeg: deg3(-72, 0, 8),
      leftLowerLeg: deg3(64, 0, 0),
      leftFoot: deg3(6, 0, 0),
      rightUpperLeg: deg3(-72, 0, -8),
      rightLowerLeg: deg3(64, 0, 0),
      rightFoot: deg3(6, 0, 0),
      leftUpperArm: deg3(-16, 0, 30),
      leftLowerArm: deg3(-36, 0, 0),
      rightUpperArm: deg3(-16, 0, -30),
      rightLowerArm: deg3(-36, 0, 0),
    }, [0, -0.4, 0]),
  },
  {
    id: "sit-desk",
    label: "책상에 엎드려 쉬기",
    category: "sitting",
    tags: ["앉기", "책상", "엎드리기", "졸기", "학교"],
    description: "의자에 앉아 책상에 상체를 엎드린 자세",
    pose: pose({
      spine: deg3(34, 0, 0),
      chest: deg3(30, 0, 0),
      neck: deg3(20, 0, 0),
      head: deg3(24, 0, 0),
      leftUpperLeg: deg3(-84, 0, 6),
      leftLowerLeg: deg3(82, 0, 0),
      rightUpperLeg: deg3(-84, 0, -6),
      rightLowerLeg: deg3(82, 0, 0),
      leftUpperArm: deg3(-64, 0, 18),
      leftLowerArm: deg3(-96, 0, 0),
      rightUpperArm: deg3(-64, 0, -18),
      rightLowerArm: deg3(-96, 0, 0),
    }, [0, -0.42, 0]),
  },
  {
    id: "sit-seiza",
    label: "정좌(무릎 꿇고 앉기)",
    category: "sitting",
    tags: ["앉기", "정좌", "무릎", "바닥", "예절"],
    description: "무릎을 꿇고 발등 위에 앉은 정좌 자세",
    pose: pose({
      spine: deg3(4, 0, 0),
      leftUpperLeg: deg3(-96, 0, 4),
      leftLowerLeg: deg3(142, 0, 0),
      leftFoot: deg3(48, 0, 0),
      rightUpperLeg: deg3(-96, 0, -4),
      rightLowerLeg: deg3(142, 0, 0),
      rightFoot: deg3(48, 0, 0),
      leftUpperArm: deg3(-20, 0, 10),
      leftLowerArm: deg3(-38, 0, 0),
      rightUpperArm: deg3(-20, 0, -10),
      rightLowerArm: deg3(-38, 0, 0),
    }, [0, -0.58, 0]),
  },
  {
    id: "sit-stairs",
    label: "계단에 턱 괴고 앉기",
    category: "sitting",
    tags: ["앉기", "계단", "턱괴기", "생각"],
    description: "계단이나 턱에 앉아 한 손으로 턱을 괸 자세",
    pose: pose({
      spine: deg3(12, 0, 0),
      head: deg3(10, 8, 0),
      leftUpperLeg: deg3(-96, 0, 10),
      leftLowerLeg: deg3(88, 0, 0),
      leftFoot: deg3(4, 0, 0),
      rightUpperLeg: deg3(-70, 0, -10),
      rightLowerLeg: deg3(58, 0, 0),
      rightFoot: deg3(10, 0, 0),
      rightUpperArm: deg3(-40, 0, -14),
      rightLowerArm: deg3(-124, 0, 0),
      rightHand: deg3(-24, 0, 0),
      leftUpperArm: deg3(-30, 0, 16),
      leftLowerArm: deg3(-50, 0, 0),
    }, [0, -0.3, 0]),
  },
  {
    id: "sit-squat",
    label: "쪼그려 앉기",
    category: "sitting",
    tags: ["앉기", "쪼그리기", "웅크리기"],
    description: "발뒤꿈치를 들고 쪼그려 앉은 자세",
    pose: pose({
      pelvis: deg3(16, 0, 0),
      spine: deg3(18, 0, 0),
      chest: deg3(10, 0, 0),
      leftUpperLeg: deg3(-118, 0, 8),
      leftLowerLeg: deg3(138, 0, 0),
      leftFoot: deg3(-30, 0, 0),
      rightUpperLeg: deg3(-118, 0, -8),
      rightLowerLeg: deg3(138, 0, 0),
      rightFoot: deg3(-30, 0, 0),
      leftUpperArm: deg3(-36, 0, 14),
      leftLowerArm: deg3(-44, 0, 0),
      rightUpperArm: deg3(-36, 0, -14),
      rightLowerArm: deg3(-44, 0, 0),
    }, [0, -0.66, 0]),
  },
  // ── 일상 (추가) ──────────────────────────────────────────────────────────
  {
    id: "daily-stretch",
    label: "기지개 켜기",
    category: "daily",
    tags: ["기지개", "스트레칭", "아침", "일상"],
    description: "양팔을 머리 위로 쭉 뻗는 기지개 자세",
    pose: pose({
      spine: deg3(-10, 0, 0),
      chest: deg3(-8, 0, 0),
      head: deg3(-10, 0, 0),
      leftUpperArm: deg3(-8, 0, 158),
      leftLowerArm: deg3(-14, 0, 0),
      leftHand: deg3(0, 0, 10),
      rightUpperArm: deg3(-8, 0, -158),
      rightLowerArm: deg3(-14, 0, 0),
      rightHand: deg3(0, 0, -10),
    }, [0, 0.03, 0]),
  },
  {
    id: "daily-bag-carry",
    label: "가방 메고 서기",
    category: "daily",
    tags: ["가방", "서기", "등교", "출근", "일상"],
    description: "한 손으로 가방 끈을 잡고 선 자세",
    pose: pose({
      spine: deg3(0, 0, -4),
      rightUpperArm: deg3(-12, 0, -16),
      rightLowerArm: deg3(-64, 0, 0),
      leftUpperArm: deg3(-4, 0, 10),
      leftLowerArm: deg3(-12, 0, 0),
      leftUpperLeg: deg3(0, 0, 5),
      rightUpperLeg: deg3(0, 0, -3),
    }),
  },
  {
    id: "daily-window-lean",
    label: "창가에 기대 서기",
    category: "daily",
    tags: ["창가", "기대기", "서기", "사색", "일상"],
    description: "한쪽 팔꿈치를 기대고 창밖을 보는 자세",
    pose: pose({
      pelvis: deg3(0, 0, 4),
      spine: deg3(0, 0, 8),
      leftUpperArm: deg3(-24, 0, 20),
      leftLowerArm: deg3(-104, 0, 0),
      rightUpperArm: deg3(-6, 0, -8),
      rightLowerArm: deg3(-14, 0, 0),
      leftUpperLeg: deg3(0, 0, 6),
      rightUpperLeg: deg3(-6, 0, -4),
      rightLowerLeg: deg3(10, 0, 0),
    }),
  },
  // ── 액션 (추가) ──────────────────────────────────────────────────────────
  {
    id: "action-dodge",
    label: "숙여서 피하기",
    category: "action",
    tags: ["회피", "숙이기", "전투", "방어"],
    description: "상체를 깊이 숙여 공격을 피하는 자세",
    pose: pose({
      pelvis: deg3(30, 0, 0),
      spine: deg3(38, 0, 0),
      chest: deg3(28, 0, 0),
      head: deg3(-20, 0, 0),
      leftUpperArm: deg3(-30, 0, 44),
      leftLowerArm: deg3(-70, 0, 0),
      rightUpperArm: deg3(-44, 0, -30),
      rightLowerArm: deg3(-60, 0, 0),
      leftUpperLeg: deg3(-38, 0, 6),
      leftLowerLeg: deg3(44, 0, 0),
      rightUpperLeg: deg3(20, 0, -6),
      rightLowerLeg: deg3(30, 0, 0),
    }, [0, -0.28, 0]),
  },
  {
    id: "action-block",
    label: "양팔로 막기(가드)",
    category: "action",
    tags: ["방어", "가드", "막기", "전투"],
    description: "양팔을 얼굴 앞에 교차해 막는 가드 자세",
    pose: pose({
      spine: deg3(8, -8, 0),
      chest: deg3(4, -10, 0),
      head: deg3(6, 10, 0),
      leftUpperArm: deg3(-58, -16, 30),
      leftLowerArm: deg3(-112, 0, 0),
      rightUpperArm: deg3(-58, 16, -30),
      rightLowerArm: deg3(-112, 0, 0),
      leftUpperLeg: deg3(-20, 0, 6),
      leftLowerLeg: deg3(18, 0, 0),
      rightUpperLeg: deg3(18, 0, -6),
      rightLowerLeg: deg3(22, 0, 0),
    }),
  },
  {
    id: "action-sprint-start",
    label: "출발 자세(크라우치 스타트)",
    category: "action",
    tags: ["출발", "달리기", "스타트", "스포츠", "전투"],
    description: "땅을 짚고 튀어나가기 직전의 출발 자세",
    pose: pose({
      pelvis: deg3(42, 0, 0),
      spine: deg3(40, 0, 0),
      chest: deg3(26, 0, 0),
      head: deg3(-28, 0, 0),
      leftUpperArm: deg3(-72, 0, 10),
      leftLowerArm: deg3(-18, 0, 0),
      rightUpperArm: deg3(28, 0, -14),
      rightLowerArm: deg3(-64, 0, 0),
      leftUpperLeg: deg3(-96, 0, 4),
      leftLowerLeg: deg3(96, 0, 0),
      leftFoot: deg3(34, 0, 0),
      rightUpperLeg: deg3(28, 0, -4),
      rightLowerLeg: deg3(88, 0, 0),
      rightFoot: deg3(40, 0, 0),
    }, [0, -0.44, 0]),
  },
  // ── 손 전용 (추가) — scope hand-only: 적용해도 몸 포즈는 유지된다 ──
  {
    id: "hand-thumbs-up",
    label: "엄지 척 (Thumbs Up)",
    category: "hand",
    tags: ["엄지", "최고", "긍정", "손"],
    description: "엄지를 치켜든 손 전용 포즈",
    scope: "hand-only",
    pose: pose({
      leftUpperArm: deg3(12, 0, 16),
      rightUpperArm: deg3(12, 0, -16),
      leftLowerArm: deg3(-52, 0, 0),
      rightLowerArm: deg3(-52, 0, 0),
      leftHand: deg3(-18, 0, 20),
      rightHand: deg3(-18, 0, -20),
    }),
  },
  {
    id: "hand-ok",
    label: "OK 사인 (OK)",
    category: "hand",
    tags: ["오케이", "확인", "손"],
    description: "엄지와 검지로 원을 만드는 손 전용 포즈",
    scope: "hand-only",
    pose: pose({
      leftUpperArm: deg3(14, 0, 18),
      rightUpperArm: deg3(14, 0, -18),
      leftLowerArm: deg3(-56, 0, 0),
      rightLowerArm: deg3(-56, 0, 0),
      leftHand: deg3(-12, 8, 24),
      rightHand: deg3(-12, -8, -24),
    }),
  },
  {
    id: "hand-rock",
    label: "락 사인 (Rock On)",
    category: "hand",
    tags: ["락", "뿔", "공연", "손"],
    description: "검지와 새끼를 편 락 사인 손 전용 포즈",
    scope: "hand-only",
    pose: pose({
      leftUpperArm: deg3(16, 0, 14),
      rightUpperArm: deg3(30, 0, -20),
      leftLowerArm: deg3(-24, 0, 0),
      rightLowerArm: deg3(-84, 0, 0),
      leftHand: deg3(0, 0, 16),
      rightHand: deg3(8, 0, -18),
    }),
  },
  {
    id: "hand-call",
    label: "전화 제스처 (Call Me)",
    category: "hand",
    tags: ["전화", "연락", "샤카", "손"],
    description: "엄지와 새끼만 편 전화 제스처 손 전용 포즈",
    scope: "hand-only",
    pose: pose({
      leftUpperArm: deg3(10, 0, 12),
      rightUpperArm: deg3(44, 0, -26),
      leftLowerArm: deg3(-18, 0, 0),
      rightLowerArm: deg3(-108, 0, 0),
      leftHand: deg3(0, 0, 10),
      rightHand: deg3(10, 0, -12),
    }),
  },
  {
    id: "hand-grab",
    label: "움켜쥐기 (Grab)",
    category: "hand",
    tags: ["쥐기", "잡기", "손"],
    description: "무언가를 움켜쥐는 손 전용 포즈",
    scope: "hand-only",
    pose: pose({
      leftUpperArm: deg3(18, 0, 20),
      rightUpperArm: deg3(18, 0, -20),
      leftLowerArm: deg3(-66, 0, 0),
      rightLowerArm: deg3(-66, 0, 0),
      leftHand: deg3(-38, 0, 38),
      rightHand: deg3(-38, 0, -38),
    }),
  },
  {
    id: "hand-stop",
    label: "정지 손바닥 (Stop)",
    category: "hand",
    tags: ["정지", "손바닥", "멈춤", "손"],
    description: "한 손바닥을 앞으로 내미는 정지 손 전용 포즈",
    scope: "hand-only",
    pose: pose({
      leftUpperArm: deg3(12, 0, 14),
      rightUpperArm: deg3(-62, 0, -12),
      leftLowerArm: deg3(-20, 0, 0),
      rightLowerArm: deg3(-10, 0, 0),
      leftHand: deg3(0, 0, 12),
      rightHand: deg3(-6, 0, -8),
    }),
  },

]);

export function findStudioMannequinPosePreset(id: unknown): StudioMannequinPosePreset | null {
  if (typeof id !== "string") return null;
  return STUDIO_MANNEQUIN_POSE_PRESETS.find((preset) => preset.id === id) ?? null;
}

// ── 탐색(카테고리·범위·인원·검색) ─────────────────────────────────────────────

/** 손 전용 프리셋만 모은 분리 라이브러리. 전신 포즈와 섞지 않고 따로 탐색·적용한다. */
export const STUDIO_MANNEQUIN_HAND_POSE_PRESETS: readonly StudioMannequinPosePreset[] =
  Object.freeze(
    STUDIO_MANNEQUIN_POSE_PRESETS.filter(
      (preset) => studioMannequinPosePresetScope(preset) === "hand-only",
    ),
  );

export interface StudioMannequinPosePresetFilter {
  /** "all"이면 카테고리 무관. */
  readonly category?: StudioMannequinPoseCategory | "all";
  /** "all"이면 전신·손 전용 무관. */
  readonly scope?: StudioMannequinPoseScope | "all";
  /** "all"이면 인원수 무관. */
  readonly figures?: 1 | 2 | "all";
  /** 라벨·id·태그·설명·카테고리 이름 부분 일치(대소문자·공백 무시). */
  readonly query?: string;
}

function normalizePoseSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

const POSE_CATEGORY_LABEL_BY_ID = new Map(
  STUDIO_MANNEQUIN_POSE_CATEGORIES.map((meta) => [meta.id, meta.label] as const),
);

/**
 * 포즈 프리셋 탐색. 카테고리 × 범위 × 인원수 × 검색어를 AND로 적용한다.
 * 기존 패널의 라벨 부분 일치 검색을 태그·설명·카테고리 이름까지 넓힌 것이며,
 * 빈 필터는 전체 프리셋을 원래 순서로 돌려준다.
 */
export function filterStudioMannequinPosePresets(
  filter: StudioMannequinPosePresetFilter = {},
): StudioMannequinPosePreset[] {
  const category = filter.category ?? "all";
  const scope = filter.scope ?? "all";
  const figures = filter.figures ?? "all";
  const query = normalizePoseSearchText(filter.query ?? "");
  return STUDIO_MANNEQUIN_POSE_PRESETS.filter((preset) => {
    if (category !== "all" && preset.category !== category) return false;
    if (scope !== "all" && studioMannequinPosePresetScope(preset) !== scope) return false;
    if (figures !== "all" && (preset.figures ?? 1) !== figures) return false;
    if (query) {
      const haystack = normalizePoseSearchText(
        [
          preset.label,
          preset.id,
          preset.description ?? "",
          POSE_CATEGORY_LABEL_BY_ID.get(preset.category) ?? "",
          ...(preset.tags ?? []),
        ].join(" "),
      );
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/** 카테고리 칩에 개수를 함께 보여주기 위한 집계. 없는 카테고리는 0. */
export function countStudioMannequinPosePresetsByCategory(): Readonly<
  Record<StudioMannequinPoseCategory, number>
> {
  const counts = Object.fromEntries(
    STUDIO_MANNEQUIN_POSE_CATEGORIES.map((meta) => [meta.id, 0]),
  ) as Record<StudioMannequinPoseCategory, number>;
  for (const preset of STUDIO_MANNEQUIN_POSE_PRESETS) counts[preset.category] += 1;
  return Object.freeze(counts);
}

// ── 손 분리 적용 ─────────────────────────────────────────────────────────────

export type StudioMannequinHandSide = "left" | "right" | "both";

const HAND_JOINT_BY_SIDE: Readonly<Record<"left" | "right", StudioMannequinJointId>> = {
  left: "leftHand",
  right: "rightHand",
};

/**
 * 포즈에서 손목 관절만 뽑는다. 손 전용 프리셋을 지금 포즈 위에 얹을 때
 * 몸 관절이 따라 바뀌지 않게 하는 분리 경계다.
 */
export function extractStudioMannequinHandPose(
  poseInput: StudioMannequinPose,
  side: StudioMannequinHandSide = "both",
): StudioMannequinPose {
  const joints: JointMap = {};
  const sides = side === "both" ? (["left", "right"] as const) : [side];
  for (const oneSide of sides) {
    const jointId = HAND_JOINT_BY_SIDE[oneSide];
    const rotation = poseInput.joints[jointId];
    if (rotation) joints[jointId] = rotation;
  }
  return { joints, pelvisOffset: [0, 0, 0] };
}

/**
 * 손 전용 프리셋을 기존 포즈에 합친다. 손목 관절(선택한 쪽)만 프리셋 값으로
 * 교체하고 나머지 관절·골반 오프셋은 base를 그대로 유지한다.
 * handPreset이 손 전용이 아니어도 손 관절만 취하므로 안전하다.
 */
export function applyStudioMannequinHandPreset(
  base: StudioMannequinPose,
  handPreset: StudioMannequinPosePreset,
  side: StudioMannequinHandSide = "both",
): StudioMannequinPose {
  const handJoints = extractStudioMannequinHandPose(handPreset.pose, side).joints;
  return {
    joints: { ...base.joints, ...handJoints },
    pelvisOffset: base.pelvisOffset,
  };
}

// ── 미러 ────────────────────────────────────────────────────────────────────

function mirrorJointId(jointId: StudioMannequinJointId): StudioMannequinJointId {
  if (jointId.startsWith("left")) {
    return `right${jointId.slice("left".length)}` as StudioMannequinJointId;
  }
  if (jointId.startsWith("right")) {
    return `left${jointId.slice("right".length)}` as StudioMannequinJointId;
  }
  return jointId;
}

function mirrorRotation(rotation: StudioMannequinVec3): StudioMannequinVec3 {
  // 하우스 미러 계약: YZ 평면 반사 = X 유지, Y/Z 부호 반전.
  return [rotation[0], -rotation[1], -rotation[2]];
}

/** 좌우 반전 포즈(관절 스왑 + Y/Z 부호 반전 + 골반 X 오프셋 반전). 두 번 적용하면 원본. */
export function mirrorStudioMannequinPose(input: StudioMannequinPose): StudioMannequinPose {
  const joints: JointMap = {};
  for (const [jointId, rotation] of Object.entries(input.joints)) {
    if (!isStudioMannequinJointId(jointId) || !rotation) continue;
    joints[mirrorJointId(jointId)] = mirrorRotation(rotation);
  }
  return {
    joints,
    pelvisOffset: [-input.pelvisOffset[0], input.pelvisOffset[1], input.pelvisOffset[2]],
  };
}

// ── 정규화 + 직렬화 ─────────────────────────────────────────────────────────

export const STUDIO_MANNEQUIN_POSE_DOC_KIND = "studio-mannequin-pose" as const;
export const STUDIO_MANNEQUIN_POSE_DOC_VERSION = 1 as const;
export const STUDIO_MANNEQUIN_POSE_DOC_MAX_BYTES = 16 * 1024;

function clampOffsetAxis(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const clamped = Math.min(PELVIS_OFFSET_LIMIT, Math.max(-PELVIS_OFFSET_LIMIT, value));
  const quantized = Math.round(clamped * 1e6) / 1e6;
  return Object.is(quantized, -0) ? 0 : quantized;
}

function normalizePelvisOffset(value: unknown): StudioMannequinVec3 {
  const source = Array.isArray(value) ? value : [];
  return [clampOffsetAxis(source[0]), clampOffsetAxis(source[1]), clampOffsetAxis(source[2])];
}

function isIdentityRotation(rotation: StudioMannequinVec3): boolean {
  return rotation[0] === 0 && rotation[1] === 0 && rotation[2] === 0;
}

/**
 * 알 수 없는 입력을 항상 유효한 포즈로 정규화한다. 알 수 없는 관절 키는 버리고, 각도는
 * 표준 범위 접기 + 관절 한계 클램프, 항등 회전은 생략해 표현을 canonical 하게 만든다.
 */
export function normalizeStudioMannequinPose(input: unknown): StudioMannequinPose {
  const source = (typeof input === "object" && input !== null ? input : {}) as {
    joints?: unknown;
    pelvisOffset?: unknown;
  };
  const joints: JointMap = {};
  const sourceJoints = (typeof source.joints === "object" && source.joints !== null
    ? source.joints
    : {}) as Record<string, unknown>;
  // 순서를 관절 정의 순으로 고정해 직렬화 출력을 결정적으로 만든다.
  for (const jointId of STUDIO_MANNEQUIN_JOINT_IDS) {
    if (!Object.hasOwn(sourceJoints, jointId)) continue;
    const rotation = clampStudioMannequinJointRotation(jointId, sourceJoints[jointId]);
    if (isIdentityRotation(rotation)) continue;
    joints[jointId] = rotation;
  }
  return { joints, pelvisOffset: normalizePelvisOffset(source.pelvisOffset) };
}

export function serializeStudioMannequinPose(input: StudioMannequinPose): string {
  const normalized = normalizeStudioMannequinPose(input);
  return JSON.stringify({
    kind: STUDIO_MANNEQUIN_POSE_DOC_KIND,
    version: STUDIO_MANNEQUIN_POSE_DOC_VERSION,
    joints: normalized.joints,
    pelvisOffset: normalized.pelvisOffset,
  });
}

/** JSON 문자열/객체 어느 쪽이든 안전하게 파싱한다. 계약 위반이면 null. */
export function parseStudioMannequinPose(raw: unknown): StudioMannequinPose | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > STUDIO_MANNEQUIN_POSE_DOC_MAX_BYTES) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null) return null;
  const doc = value as { kind?: unknown; version?: unknown };
  if (doc.kind !== STUDIO_MANNEQUIN_POSE_DOC_KIND) return null;
  if (doc.version !== STUDIO_MANNEQUIN_POSE_DOC_VERSION) return null;
  return normalizeStudioMannequinPose(value);
}

// ── 세션 상태(체형 + 포즈) 영속 계약 ─────────────────────────────────────────

/**
 * Explicit pre-V12 localStorage import/test seam. Product boot must not probe this key; users may
 * move an old value only through an explicit import flow.
 */
export const STUDIO_MANNEQUIN_STATE_STORAGE_KEY = "toonstudio-studio-mannequin-state:v1";
export const STUDIO_MANNEQUIN_STATE_DOC_KIND = "studio-mannequin-state" as const;
export const STUDIO_MANNEQUIN_STATE_DOC_VERSION = 1 as const;
export const STUDIO_MANNEQUIN_STATE_DOC_MAX_BYTES = 24 * 1024;

export interface StudioMannequinPersistentState {
  readonly params: StudioMannequinBodyParams;
  readonly pose: StudioMannequinPose;
}

export function serializeStudioMannequinState(input: StudioMannequinPersistentState): string {
  return JSON.stringify({
    kind: STUDIO_MANNEQUIN_STATE_DOC_KIND,
    version: STUDIO_MANNEQUIN_STATE_DOC_VERSION,
    params: clampStudioMannequinBodyParams(input.params),
    pose: normalizeStudioMannequinPose(input.pose),
  });
}

export function parseStudioMannequinState(raw: unknown): StudioMannequinPersistentState | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > STUDIO_MANNEQUIN_STATE_DOC_MAX_BYTES) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null) return null;
  const doc = value as { kind?: unknown; version?: unknown; params?: unknown; pose?: unknown };
  if (doc.kind !== STUDIO_MANNEQUIN_STATE_DOC_KIND) return null;
  if (doc.version !== STUDIO_MANNEQUIN_STATE_DOC_VERSION) return null;
  return {
    params: clampStudioMannequinBodyParams(doc.params),
    pose: normalizeStudioMannequinPose(doc.pose),
  };
}

// ── 공유 내보내기/가져오기 + 클립보드 해시 ────────────────────────────────

export function exportStudioMannequinStateToJSON(input: StudioMannequinPersistentState): string {
  return serializeStudioMannequinState(input);
}

export function importStudioMannequinStateFromJSON(raw: unknown): StudioMannequinPersistentState | null {
  return parseStudioMannequinState(raw);
}

export function encodeStudioMannequinShareHash(input: StudioMannequinPersistentState): string {
  const json = serializeStudioMannequinState(input);
  try {
    return `#mannequin=${encodeURIComponent(btoa(json))}`;
  } catch {
    return "";
  }
}

export function parseStudioMannequinShareHash(hash: string): StudioMannequinPersistentState | null {
  if (!hash.includes("mannequin=")) return null;
  const match = /mannequin=([^&]+)/.exec(hash);
  if (!match || !match[1]) return null;
  try {
    const json = atob(decodeURIComponent(match[1]));
    return parseStudioMannequinState(json);
  } catch {
    return null;
  }
}
