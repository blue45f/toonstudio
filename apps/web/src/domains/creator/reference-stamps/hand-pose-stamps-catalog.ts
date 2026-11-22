/**
 * 웹툰 빈출 손 포즈 24종 밑그림 와이어프레임 스탬프 카탈로그 및 SVG 생성기.
 *
 * 각 포즈는 손바닥 다각형, 5개 손가락(엄지·검지·중지·약지·소지)의 관절 마디 체인,
 * 그리고 소품/연출 보조선(펜·검·컵·스마트폰·턱·양손 등)을 벡터 SVG로 생성한다.
 */

import {
  REFERENCE_STAMP_PALETTES,
  svgToDataUrl,
  type ReferenceStampInkStyle,
} from "./turnaround-sheet-svg";

export type HandPoseStampCategory = "basic" | "emotion" | "prop-action" | "portrait";

export const HAND_POSE_STAMP_CATEGORY_LABELS: Readonly<Record<HandPoseStampCategory, string>> = {
  basic: "기본 포즈",
  emotion: "감정·표현",
  "prop-action": "소품·액션",
  portrait: "인물·연출",
};

export interface HandPoseFingerKinematics {
  /** 손바닥 기준 각도(deg, 위쪽=0, 왼쪽=-, 오른쪽=+). */
  readonly angleDeg: number;
  /** 마디별 굽힘 비율(0=곧게 폄, 1=강하게 접힘). */
  readonly curl: number;
  /** 전체 길이 배율(원근 단축 반영). */
  readonly reach: number;
}

export interface HandPoseWireframeSpec {
  readonly thumb: HandPoseFingerKinematics;
  readonly index: HandPoseFingerKinematics;
  readonly middle: HandPoseFingerKinematics;
  readonly ring: HandPoseFingerKinematics;
  readonly little: HandPoseFingerKinematics;
  /** 손바닥 회전(deg). */
  readonly palmTiltDeg?: number;
  /** 손바닥 폭 배율(측면일수록 좁아짐). */
  readonly palmWidthScale?: number;
  /** 보조 실루엣(양손 대칭 또는 소품·턱 보조선). */
  readonly accessory?:
    | "none"
    | "pen"
    | "sword"
    | "prayer-pair"
    | "chin-curve"
    | "cup"
    | "phone"
    | "collar"
    | "glasses"
    | "hair-strand"
    | "snap-arc"
    | "clap-pair"
    | "mouth-curve"
    | "heart-spark";
}

export interface HandPoseStampDefinition {
  readonly id: string;
  readonly nameKo: string;
  readonly category: HandPoseStampCategory;
  readonly tagsKo: readonly string[];
  readonly summaryKo: string;
  readonly wireframe: HandPoseWireframeSpec;
}

export interface HandPoseStampSvgOptions {
  readonly flipHorizontal?: boolean;
  readonly style?: ReferenceStampInkStyle;
  readonly showJoints?: boolean;
  readonly showLabel?: boolean;
}

export interface HandPoseStampSvgResult {
  readonly stampId: string;
  readonly nameKo: string;
  readonly svg: string;
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly flipped: boolean;
}

/** 웹툰 작화 빈출 손 포즈 24종 카탈로그. */
export const HAND_POSE_WIREFRAME_STAMPS: readonly HandPoseStampDefinition[] = [
  {
    id: "fist",
    nameKo: "주먹",
    category: "basic",
    tagsKo: ["분노", "결의", "타격", "기본"],
    summaryKo: "네 손가락을 말아 쥐고 엄지로 잠근 기본 주먹",
    wireframe: {
      thumb: { angleDeg: -14, curl: 0.78, reach: 0.72 },
      index: { angleDeg: -10, curl: 0.94, reach: 0.44 },
      middle: { angleDeg: 0, curl: 0.96, reach: 0.44 },
      ring: { angleDeg: 10, curl: 0.96, reach: 0.42 },
      little: { angleDeg: 18, curl: 0.95, reach: 0.4 },
    },
  },
  {
    id: "open-palm",
    nameKo: "펼침",
    category: "basic",
    tagsKo: ["손바닥", "인사", "개방", "기본"],
    summaryKo: "다섯 손가락을 고르게 펼친 정면 손바닥 기준선",
    wireframe: {
      thumb: { angleDeg: -56, curl: 0.08, reach: 0.95 },
      index: { angleDeg: -18, curl: 0.04, reach: 1.0 },
      middle: { angleDeg: 0, curl: 0.02, reach: 1.04 },
      ring: { angleDeg: 16, curl: 0.05, reach: 0.98 },
      little: { angleDeg: 32, curl: 0.08, reach: 0.92 },
    },
  },
  {
    id: "pointing",
    nameKo: "가리킴",
    category: "basic",
    tagsKo: ["지목", "방향", "설명", "검지"],
    summaryKo: "검지만 길게 뻗어 시선과 방향을 유도하는 지목 포즈",
    wireframe: {
      thumb: { angleDeg: -26, curl: 0.62, reach: 0.76 },
      index: { angleDeg: -6, curl: 0.03, reach: 1.06 },
      middle: { angleDeg: 4, curl: 0.92, reach: 0.46 },
      ring: { angleDeg: 12, curl: 0.94, reach: 0.44 },
      little: { angleDeg: 20, curl: 0.95, reach: 0.4 },
    },
  },
  {
    id: "peace-v",
    nameKo: "브이",
    category: "emotion",
    tagsKo: ["V사인", "승리", "셀카", "발랄"],
    summaryKo: "검지와 중지를 V자로 벌리고 나머지 세 손가락을 접은 포즈",
    wireframe: {
      thumb: { angleDeg: -18, curl: 0.72, reach: 0.7 },
      index: { angleDeg: -20, curl: 0.04, reach: 1.04 },
      middle: { angleDeg: 16, curl: 0.04, reach: 1.05 },
      ring: { angleDeg: 14, curl: 0.93, reach: 0.44 },
      little: { angleDeg: 22, curl: 0.94, reach: 0.4 },
    },
  },
  {
    id: "pen-grip",
    nameKo: "펜잡기",
    category: "prop-action",
    tagsKo: ["필기", "스타일러스", "메모", "소품"],
    summaryKo: "엄지·검지·중지 삼점 지지로 펜이나 붓을 쥔 구도",
    wireframe: {
      thumb: { angleDeg: -28, curl: 0.42, reach: 0.86 },
      index: { angleDeg: -12, curl: 0.48, reach: 0.84 },
      middle: { angleDeg: 6, curl: 0.58, reach: 0.76 },
      ring: { angleDeg: 16, curl: 0.84, reach: 0.54 },
      little: { angleDeg: 24, curl: 0.88, reach: 0.48 },
      palmTiltDeg: -14,
      accessory: "pen",
    },
  },
  {
    id: "sword-grip",
    nameKo: "검잡기",
    category: "prop-action",
    tagsKo: ["무기", "전투", "액션", "손잡이"],
    summaryKo: "원통 손잡이를 단단히 감싸 쥔 액션·판타지 무기 그립",
    wireframe: {
      thumb: { angleDeg: -24, curl: 0.64, reach: 0.82 },
      index: { angleDeg: -8, curl: 0.78, reach: 0.64 },
      middle: { angleDeg: 2, curl: 0.82, reach: 0.62 },
      ring: { angleDeg: 12, curl: 0.84, reach: 0.58 },
      little: { angleDeg: 20, curl: 0.86, reach: 0.54 },
      palmTiltDeg: -10,
      accessory: "sword",
    },
  },
  {
    id: "prayer",
    nameKo: "기도",
    category: "emotion",
    tagsKo: ["부탁", "간절함", "합장", "양손"],
    summaryKo: "양손 손바닥을 마주 대고 손끝을 모은 합장·기도 실루엣",
    wireframe: {
      thumb: { angleDeg: -22, curl: 0.16, reach: 0.84 },
      index: { angleDeg: -5, curl: 0.08, reach: 0.98 },
      middle: { angleDeg: 1, curl: 0.08, reach: 1.02 },
      ring: { angleDeg: 6, curl: 0.1, reach: 0.94 },
      little: { angleDeg: 12, curl: 0.12, reach: 0.86 },
      palmWidthScale: 0.58,
      accessory: "prayer-pair",
    },
  },
  {
    id: "chin-rest",
    nameKo: "턱괴기",
    category: "portrait",
    tagsKo: ["고민", "나른함", "책상", "얼굴"],
    summaryKo: "검지·중지 측면에 턱선을 얹어 생각에 잠긴 인물 연출",
    wireframe: {
      thumb: { angleDeg: -38, curl: 0.3, reach: 0.84 },
      index: { angleDeg: -14, curl: 0.34, reach: 0.9 },
      middle: { angleDeg: 4, curl: 0.42, reach: 0.84 },
      ring: { angleDeg: 16, curl: 0.76, reach: 0.58 },
      little: { angleDeg: 26, curl: 0.84, reach: 0.5 },
      palmTiltDeg: 8,
      accessory: "chin-curve",
    },
  },
  {
    id: "thumbs-up",
    nameKo: "엄지척",
    category: "emotion",
    tagsKo: ["찬성", "최고", "긍정", "제스처"],
    summaryKo: "네 손가락을 접고 엄지를 수직으로 치켜세운 긍정 사인",
    wireframe: {
      thumb: { angleDeg: -22, curl: 0.04, reach: 1.1 },
      index: { angleDeg: 4, curl: 0.92, reach: 0.48 },
      middle: { angleDeg: 10, curl: 0.94, reach: 0.46 },
      ring: { angleDeg: 16, curl: 0.95, reach: 0.44 },
      little: { angleDeg: 24, curl: 0.95, reach: 0.42 },
      palmTiltDeg: 22,
    },
  },
  {
    id: "ok-sign",
    nameKo: "OK 사인",
    category: "emotion",
    tagsKo: ["확인", "승낙", "동그라미"],
    summaryKo: "엄지와 검지 끝으로 원을 만들고 세 손가락을 세운 포즈",
    wireframe: {
      thumb: { angleDeg: -20, curl: 0.58, reach: 0.78 },
      index: { angleDeg: -24, curl: 0.64, reach: 0.74 },
      middle: { angleDeg: 4, curl: 0.08, reach: 1.02 },
      ring: { angleDeg: 18, curl: 0.1, reach: 0.96 },
      little: { angleDeg: 32, curl: 0.14, reach: 0.88 },
    },
  },
  {
    id: "finger-heart",
    nameKo: "손가락 하트",
    category: "emotion",
    tagsKo: ["로맨스", "애교", "하트", "사랑"],
    summaryKo: "엄지와 검지 첫마디를 교차해 작은 하트를 만드는 로맨스 포즈",
    wireframe: {
      thumb: { angleDeg: -16, curl: 0.4, reach: 0.86 },
      index: { angleDeg: -18, curl: 0.46, reach: 0.82 },
      middle: { angleDeg: 6, curl: 0.9, reach: 0.48 },
      ring: { angleDeg: 14, curl: 0.92, reach: 0.46 },
      little: { angleDeg: 22, curl: 0.93, reach: 0.42 },
      accessory: "heart-spark",
    },
  },
  {
    id: "cup-hold",
    nameKo: "컵 잡기",
    category: "prop-action",
    tagsKo: ["카페", "머그컵", "음료", "일상"],
    summaryKo: "원통 컵을 감싸며 자연스럽게 벌어진 손가락 아치",
    wireframe: {
      thumb: { angleDeg: -42, curl: 0.34, reach: 0.86 },
      index: { angleDeg: -10, curl: 0.54, reach: 0.8 },
      middle: { angleDeg: 2, curl: 0.58, reach: 0.82 },
      ring: { angleDeg: 14, curl: 0.62, reach: 0.78 },
      little: { angleDeg: 26, curl: 0.66, reach: 0.72 },
      palmWidthScale: 0.82,
      accessory: "cup",
    },
  },
  {
    id: "phone-hold",
    nameKo: "스마트폰 쥐기",
    category: "prop-action",
    tagsKo: ["메신저", "전화", "현대물", "일상"],
    summaryKo: "소지로 하단을 받치고 엄지로 화면을 조작하는 현대극 필수 포즈",
    wireframe: {
      thumb: { angleDeg: -18, curl: 0.3, reach: 0.86 },
      index: { angleDeg: -6, curl: 0.52, reach: 0.76 },
      middle: { angleDeg: 8, curl: 0.56, reach: 0.78 },
      ring: { angleDeg: 16, curl: 0.6, reach: 0.74 },
      little: { angleDeg: 28, curl: 0.42, reach: 0.82 },
      accessory: "phone",
    },
  },
  {
    id: "collar-grab",
    nameKo: "멱살 잡기",
    category: "prop-action",
    tagsKo: ["갈등", "긴장", "옷깃", "액션"],
    summaryKo: "손마디에 힘을 주어 옷깃을 움켜쥔 긴장감 있는 구도",
    wireframe: {
      thumb: { angleDeg: -30, curl: 0.68, reach: 0.78 },
      index: { angleDeg: -14, curl: 0.72, reach: 0.68 },
      middle: { angleDeg: 0, curl: 0.76, reach: 0.68 },
      ring: { angleDeg: 12, curl: 0.8, reach: 0.64 },
      little: { angleDeg: 24, curl: 0.84, reach: 0.58 },
      palmTiltDeg: -18,
      accessory: "collar",
    },
  },
  {
    id: "reach-out",
    nameKo: "손 내밀기",
    category: "portrait",
    tagsKo: ["구원", "악수", "초대", "원근"],
    summaryKo: "카메라 쪽으로 손바닥을 살짝 오므려 내미는 구원·초대 연출",
    wireframe: {
      thumb: { angleDeg: -50, curl: 0.22, reach: 0.92 },
      index: { angleDeg: -16, curl: 0.24, reach: 0.94 },
      middle: { angleDeg: 0, curl: 0.2, reach: 0.98 },
      ring: { angleDeg: 14, curl: 0.28, reach: 0.9 },
      little: { angleDeg: 28, curl: 0.34, reach: 0.84 },
      palmTiltDeg: 12,
    },
  },
  {
    id: "stop-palm",
    nameKo: "정지·막기",
    category: "basic",
    tagsKo: ["멈춰", "거절", "방어", "경계"],
    summaryKo: "손가락을 붙여 세워 상대를 제지하거나 거리를 두는 포즈",
    wireframe: {
      thumb: { angleDeg: -42, curl: 0.14, reach: 0.92 },
      index: { angleDeg: -8, curl: 0.04, reach: 1.0 },
      middle: { angleDeg: 0, curl: 0.02, reach: 1.04 },
      ring: { angleDeg: 8, curl: 0.04, reach: 0.98 },
      little: { angleDeg: 16, curl: 0.06, reach: 0.92 },
    },
  },
  {
    id: "back-hand-guard",
    nameKo: "손등 보이기",
    category: "basic",
    tagsKo: ["손등", "맹세", "반지", "방어"],
    summaryKo: "손등 관절과 손가락 너클 라인을 강조한 정면 손등 와이어프레임",
    wireframe: {
      thumb: { angleDeg: -32, curl: 0.36, reach: 0.82 },
      index: { angleDeg: -10, curl: 0.18, reach: 0.96 },
      middle: { angleDeg: 0, curl: 0.16, reach: 1.0 },
      ring: { angleDeg: 10, curl: 0.22, reach: 0.94 },
      little: { angleDeg: 22, curl: 0.28, reach: 0.86 },
      palmWidthScale: 1.06,
    },
  },
  {
    id: "relaxed-idle",
    nameKo: "힘 뺀 휴식 손",
    category: "basic",
    tagsKo: ["자연스러움", "서기", "기본", "휴식"],
    summaryKo: "검지에서 소지로 갈수록 부드럽게 말리는 자연스러운 대기 손",
    wireframe: {
      thumb: { angleDeg: -44, curl: 0.2, reach: 0.88 },
      index: { angleDeg: -14, curl: 0.22, reach: 0.94 },
      middle: { angleDeg: 0, curl: 0.3, reach: 0.94 },
      ring: { angleDeg: 12, curl: 0.42, reach: 0.86 },
      little: { angleDeg: 24, curl: 0.54, reach: 0.78 },
    },
  },
  {
    id: "glasses-push",
    nameKo: "안경 올리기",
    category: "portrait",
    tagsKo: ["지적", "안경", "캐릭터성", "클리셰"],
    summaryKo: "검지·중지 끝으로 안경 브리지를 밀어 올리는 웹툰 시그니처",
    wireframe: {
      thumb: { angleDeg: -36, curl: 0.44, reach: 0.8 },
      index: { angleDeg: -8, curl: 0.14, reach: 0.98 },
      middle: { angleDeg: 4, curl: 0.12, reach: 1.02 },
      ring: { angleDeg: 16, curl: 0.72, reach: 0.6 },
      little: { angleDeg: 24, curl: 0.8, reach: 0.54 },
      palmTiltDeg: -16,
      accessory: "glasses",
    },
  },
  {
    id: "hair-sweep",
    nameKo: "머리 쓸어넘기기",
    category: "portrait",
    tagsKo: ["앞머리", "분위기", "로맨스", "인물"],
    summaryKo: "손가락 사이로 머리카락을 빗어 넘기는 우아한 인물 포즈",
    wireframe: {
      thumb: { angleDeg: -50, curl: 0.24, reach: 0.88 },
      index: { angleDeg: -22, curl: 0.34, reach: 0.94 },
      middle: { angleDeg: -4, curl: 0.38, reach: 0.96 },
      ring: { angleDeg: 14, curl: 0.42, reach: 0.9 },
      little: { angleDeg: 30, curl: 0.48, reach: 0.82 },
      palmTiltDeg: 14,
      accessory: "hair-strand",
    },
  },
  {
    id: "finger-snap",
    nameKo: "손가락 튕기기",
    category: "prop-action",
    tagsKo: ["마법", "신호", "스냅", "연출"],
    summaryKo: "엄지와 중지를 맞대어 탄성을 모은 마법·신호 스냅 포즈",
    wireframe: {
      thumb: { angleDeg: -16, curl: 0.36, reach: 0.86 },
      index: { angleDeg: -22, curl: 0.08, reach: 0.98 },
      middle: { angleDeg: -4, curl: 0.56, reach: 0.76 },
      ring: { angleDeg: 14, curl: 0.88, reach: 0.5 },
      little: { angleDeg: 24, curl: 0.9, reach: 0.46 },
      accessory: "snap-arc",
    },
  },
  {
    id: "clap-hands",
    nameKo: "박수·맞잡기",
    category: "emotion",
    tagsKo: ["축하", "환영", "양손", "기쁨"],
    summaryKo: "양손을 살짝 어긋나게 마주 치는 박수·환영 동작 가이드",
    wireframe: {
      thumb: { angleDeg: -44, curl: 0.18, reach: 0.9 },
      index: { angleDeg: -12, curl: 0.1, reach: 0.98 },
      middle: { angleDeg: 0, curl: 0.08, reach: 1.02 },
      ring: { angleDeg: 12, curl: 0.12, reach: 0.96 },
      little: { angleDeg: 24, curl: 0.16, reach: 0.88 },
      palmTiltDeg: -12,
      accessory: "clap-pair",
    },
  },
  {
    id: "mouth-cover",
    nameKo: "입 가리기",
    category: "portrait",
    tagsKo: ["놀람", "웃음", "비밀", "감정"],
    summaryKo: "손끝을 가지런히 모아 입 앞을 가리는 놀람·수줍음 포즈",
    wireframe: {
      thumb: { angleDeg: -34, curl: 0.28, reach: 0.84 },
      index: { angleDeg: -10, curl: 0.2, reach: 0.94 },
      middle: { angleDeg: -2, curl: 0.2, reach: 0.98 },
      ring: { angleDeg: 6, curl: 0.24, reach: 0.92 },
      little: { angleDeg: 14, curl: 0.3, reach: 0.84 },
      palmTiltDeg: 6,
      accessory: "mouth-curve",
    },
  },
  {
    id: "finger-wag",
    nameKo: "경고 삿대질",
    category: "emotion",
    tagsKo: ["경고", "부정", "단호함", "대화"],
    summaryKo: "검지를 세워 좌우로 흔들며 단호하게 거절·경고하는 포즈",
    wireframe: {
      thumb: { angleDeg: -22, curl: 0.68, reach: 0.76 },
      index: { angleDeg: 8, curl: 0.04, reach: 1.08 },
      middle: { angleDeg: 6, curl: 0.9, reach: 0.48 },
      ring: { angleDeg: 14, curl: 0.93, reach: 0.45 },
      little: { angleDeg: 22, curl: 0.94, reach: 0.42 },
      palmTiltDeg: 10,
      accessory: "snap-arc",
    },
  },
] as const;

const STAMP_SIZE = 220;

function fmt(value: number): string {
  return Number(value.toFixed(1)).toString();
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildFingerSegments(
  baseX: number,
  baseY: number,
  lengthTotal: number,
  spec: HandPoseFingerKinematics,
  isThumb: boolean,
): readonly (readonly [number, number])[] {
  const rad = ((spec.angleDeg - 90) * Math.PI) / 180;
  const effectiveLength = lengthTotal * spec.reach * (1 - spec.curl * 0.48);
  const segCount = isThumb ? 2 : 3;
  const weights = isThumb ? [0.54, 0.46] : [0.44, 0.32, 0.24];
  const bendDir = isThumb ? 1 : spec.angleDeg < 0 ? 1 : -1;

  const points: [number, number][] = [[baseX, baseY]];
  let cx = baseX;
  let cy = baseY;
  let currentAngle = rad;

  for (let i = 0; i < segCount; i += 1) {
    const segLen = effectiveLength * weights[i]!;
    currentAngle += bendDir * spec.curl * (isThumb ? 0.34 : 0.22) * (i + 0.5);
    cx += Math.cos(currentAngle) * segLen;
    cy += Math.sin(currentAngle) * segLen;
    points.push([cx, cy]);
  }
  return points;
}

function renderAccessory(
  accessory: HandPoseWireframeSpec["accessory"],
  strokeSecondary: string,
): string {
  switch (accessory) {
    case "pen":
      return `<line x1="48" y1="158" x2="178" y2="34" stroke="${strokeSecondary}" stroke-width="2.4" stroke-dasharray="5 3" /><polygon points="44,162 52,150 56,158" fill="${strokeSecondary}" />`;
    case "sword":
      return `<rect x="97" y="18" width="26" height="176" rx="6" fill="none" stroke="${strokeSecondary}" stroke-width="1.8" stroke-dasharray="6 3" /><line x1="62" y1="84" x2="158" y2="84" stroke="${strokeSecondary}" stroke-width="2.4" />`;
    case "prayer-pair":
      return `<path d="M 110 26 L 110 184" stroke="${strokeSecondary}" stroke-width="1.4" stroke-dasharray="4 4" /><path d="M 122 146 L 136 96 L 122 44" fill="none" stroke="${strokeSecondary}" stroke-width="1.8" stroke-dasharray="4 3" />`;
    case "chin-curve":
      return `<path d="M 44 46 Q 110 92 176 46" fill="none" stroke="${strokeSecondary}" stroke-width="2" stroke-dasharray="6 4" />`;
    case "cup":
      return `<path d="M 64 46 L 72 152 Q 110 162 148 152 L 156 46 Z" fill="none" stroke="${strokeSecondary}" stroke-width="1.7" stroke-dasharray="5 3" /><ellipse cx="110" cy="46" rx="46" ry="8" fill="none" stroke="${strokeSecondary}" stroke-width="1.5" />`;
    case "phone":
      return `<rect x="66" y="26" width="88" height="148" rx="12" fill="none" stroke="${strokeSecondary}" stroke-width="1.8" stroke-dasharray="5 3" />`;
    case "collar":
      return `<path d="M 52 58 L 96 108 L 124 108 L 168 58" fill="none" stroke="${strokeSecondary}" stroke-width="2" stroke-dasharray="5 3" />`;
    case "glasses":
      return `<rect x="44" y="42" width="52" height="30" rx="8" fill="none" stroke="${strokeSecondary}" stroke-width="1.7" stroke-dasharray="4 3" /><rect x="124" y="42" width="52" height="30" rx="8" fill="none" stroke="${strokeSecondary}" stroke-width="1.7" stroke-dasharray="4 3" /><line x1="96" y1="56" x2="124" y2="56" stroke="${strokeSecondary}" stroke-width="1.8" />`;
    case "hair-strand":
      return `<path d="M 42 54 Q 98 22 178 66 M 48 80 Q 106 46 176 92" fill="none" stroke="${strokeSecondary}" stroke-width="1.6" stroke-dasharray="5 3" />`;
    case "snap-arc":
      return `<path d="M 142 36 Q 168 50 172 78 M 154 28 Q 180 44 184 70" fill="none" stroke="${strokeSecondary}" stroke-width="1.6" stroke-dasharray="4 3" />`;
    case "clap-pair":
      return `<path d="M 134 156 L 162 114 L 146 58" fill="none" stroke="${strokeSecondary}" stroke-width="1.8" stroke-dasharray="5 3" /><line x1="116" y1="42" x2="132" y2="30" stroke="${strokeSecondary}" stroke-width="1.6" />`;
    case "mouth-curve":
      return `<path d="M 74 56 Q 110 72 146 56" fill="none" stroke="${strokeSecondary}" stroke-width="1.9" stroke-dasharray="5 3" />`;
    case "heart-spark":
      return `<path d="M 96 42 C 96 34 86 34 86 42 C 86 50 96 56 96 60 C 96 56 106 50 106 42 C 106 34 96 34 96 42 Z" fill="none" stroke="${strokeSecondary}" stroke-width="1.7" />`;
    default:
      return "";
  }
}

/**
 * 선택한 손 포즈 1종의 벡터 와이어프레임 SVG 스탬프를 생성한다.
 */
export function buildHandPoseStampSvg(
  stamp: HandPoseStampDefinition,
  options: HandPoseStampSvgOptions = {},
): HandPoseStampSvgResult {
  const palette = REFERENCE_STAMP_PALETTES[options.style ?? "blueprint"];
  const flipped = options.flipHorizontal ?? false;
  const showJoints = options.showJoints ?? true;
  const showLabel = options.showLabel ?? true;

  const { wireframe } = stamp;
  const palmScale = wireframe.palmWidthScale ?? 1;
  const tiltDeg = wireframe.palmTiltDeg ?? 0;

  const wristY = 176;
  const palmBottomY = 156;
  const palmTopY = 104;
  const halfPalmBottom = 26 * palmScale;
  const halfPalmTop = 34 * palmScale;
  const cx = 110;

  const palmPolygon = [
    [cx - halfPalmBottom, palmBottomY],
    [cx - halfPalmTop, palmTopY + 4],
    [cx - halfPalmTop * 0.35, palmTopY - 2],
    [cx + halfPalmTop * 0.35, palmTopY - 1],
    [cx + halfPalmTop, palmTopY + 8],
    [cx + halfPalmBottom, palmBottomY],
  ] as const;

  const fingerBases: readonly {
    readonly key: "thumb" | "index" | "middle" | "ring" | "little";
    readonly x: number;
    readonly y: number;
    readonly length: number;
    readonly isThumb: boolean;
  }[] = [
    { key: "thumb", x: cx - halfPalmBottom * 0.96, y: 138, length: 46, isThumb: true },
    { key: "index", x: cx - halfPalmTop * 0.86, y: palmTopY + 3, length: 64, isThumb: false },
    { key: "middle", x: cx - halfPalmTop * 0.25, y: palmTopY - 2, length: 72, isThumb: false },
    { key: "ring", x: cx + halfPalmTop * 0.34, y: palmTopY, length: 65, isThumb: false },
    { key: "little", x: cx + halfPalmTop * 0.88, y: palmTopY + 8, length: 53, isThumb: false },
  ];

  const fingerMarkups: string[] = [];
  const jointPoints: [number, number][] = [];

  for (const finger of fingerBases) {
    const chain = buildFingerSegments(
      finger.x,
      finger.y,
      finger.length,
      wireframe[finger.key],
      finger.isThumb,
    );
    const pointsAttr = chain.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ");
    fingerMarkups.push(
      `<polyline data-finger="${finger.key}" points="${pointsAttr}" fill="none" stroke="${palette.strokePrimary}" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.22" />`,
      `<polyline points="${pointsAttr}" fill="none" stroke="${palette.strokePrimary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`,
    );
    for (const [jx, jy] of chain) {
      jointPoints.push([jx, jy]);
    }
  }

  const jointsMarkup = showJoints
    ? jointPoints
        .map(
          ([x, y]) =>
            `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="2.7" fill="${palette.jointFill}" stroke="${palette.strokePrimary}" stroke-width="1.1" />`,
        )
        .join("")
    : "";

  const palmPointsAttr = palmPolygon.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ");
  const accessoryMarkup = renderAccessory(wireframe.accessory, palette.strokeSecondary);

  const transformParts: string[] = [];
  if (flipped) {
    transformParts.push(`translate(${STAMP_SIZE} 0) scale(-1 1)`);
  }
  if (tiltDeg !== 0) {
    transformParts.push(`rotate(${fmt(tiltDeg)} ${cx} 130)`);
  }
  const transformAttr =
    transformParts.length > 0 ? ` transform="${transformParts.join(" ")}"` : "";

  const ariaLabel = `${stamp.nameKo} 손 포즈 밑그림 스탬프${flipped ? " (반전)" : ""}`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${STAMP_SIZE} ${STAMP_SIZE}" width="${STAMP_SIZE}" height="${STAMP_SIZE}" role="img" aria-label="${escapeXml(ariaLabel)}">`,
    `<title>${escapeXml(ariaLabel)}</title>`,
    `<rect x="0" y="0" width="${STAMP_SIZE}" height="${STAMP_SIZE}" rx="12" fill="${palette.background}" />`,
    `<g data-hand-pose-stamp="${escapeXml(stamp.id)}"${transformAttr}>`,
    accessoryMarkup,
    // 손목 가이드
    `<path d="M ${fmt(cx - halfPalmBottom * 0.72)} ${wristY} L ${fmt(cx - halfPalmBottom)} ${palmBottomY} M ${fmt(cx + halfPalmBottom * 0.72)} ${wristY} L ${fmt(cx + halfPalmBottom)} ${palmBottomY}" stroke="${palette.strokeSecondary}" stroke-width="1.6" />`,
    // 손바닥 다각형
    `<polygon points="${palmPointsAttr}" fill="${palette.jointFill}" fill-opacity="0.16" stroke="${palette.strokePrimary}" stroke-width="1.8" stroke-linejoin="round" />`,
    // 손바닥 중심선
    `<line x1="${cx}" y1="${palmTopY}" x2="${cx}" y2="${palmBottomY}" stroke="${palette.guideLine}" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="3 3" />`,
    fingerMarkups.join(""),
    jointsMarkup,
    "</g>",
    showLabel
      ? `<text x="${cx}" y="${STAMP_SIZE - 12}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${palette.guideLabel}">${escapeXml(stamp.nameKo)}${flipped ? " · 반전" : ""}</text>`
      : "",
    "</svg>",
  ].join("");

  return {
    stampId: stamp.id,
    nameKo: stamp.nameKo,
    svg,
    dataUrl: svgToDataUrl(svg),
    width: STAMP_SIZE,
    height: STAMP_SIZE,
    flipped,
  };
}

/**
 * 카테고리와 검색어로 24종 손 포즈 스탬프를 필터링한다.
 */
export function filterHandPoseStamps(
  category: HandPoseStampCategory | "all",
  query: string,
): readonly HandPoseStampDefinition[] {
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
  return HAND_POSE_WIREFRAME_STAMPS.filter((stamp) => {
    if (category !== "all" && stamp.category !== category) return false;
    if (normalized.length === 0) return true;
    const haystack = [
      stamp.nameKo,
      stamp.summaryKo,
      HAND_POSE_STAMP_CATEGORY_LABELS[stamp.category],
      ...stamp.tagsKo,
    ]
      .join(" ")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR");
    return haystack.includes(normalized);
  });
}
