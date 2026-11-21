/**
 * 로컬 3D Shaper(HORANG v1.05 Build 9 · RootMotion FinalIK / DynamicBone REA) Pro 프리셋 카탈로그.
 *
 * - 양손 소품·무기 소켓 6종 (`SHAPER_HAND_SOCKET_PROPS`: 검·펜·커피잔·스마트폰·우산·마법봉)
 * - 2인 인터랙션 웹툰 포즈 12종 (`SHAPER_DUO_INTERACTION_PRESETS`)
 * - 웹툰 컷 과장 원근 18mm~135mm 렌즈 프리셋 (`SHAPER_MANGA_PERSPECTIVE_PRESETS`)
 */

export type ShaperVec3 = readonly [number, number, number];

/* -------------------------------------------------------------------------- */
/* 1. 양손 소품·무기 소켓 6종 (검·펜·커피잔·스마트폰·우산·마법봉)                */
/* -------------------------------------------------------------------------- */

export type ShaperHandSocketPropKind =
  | "sword"
  | "pen"
  | "coffee-cup"
  | "smartphone"
  | "umbrella"
  | "magic-wand";

export interface ShaperFingerCurlProfile {
  readonly thumb: number;
  readonly index: number;
  readonly middle: number;
  readonly ring: number;
  readonly little: number;
}

export interface ShaperDynamicBonePropSwing {
  readonly enabled: boolean;
  readonly elasticity: number;
  readonly damping: number;
  readonly inert: number;
  readonly swingPartKo: string;
}

export interface ShaperHandSocketPropSpec {
  readonly kind: ShaperHandSocketPropKind;
  readonly labelKo: string;
  readonly hintKo: string;
  readonly propIdAlias: string;
  readonly gripStyle: "power-cylinder" | "tripod-pinch" | "handle-loop" | "palm-cradle" | "vertical-shaft" | "cast-point";
  readonly supportsTwoHanded: boolean;
  readonly defaultTwoHanded: boolean;
  /** 주 손바닥 기준 소켓 로컬 오프셋 (m) */
  readonly primaryLocalOffset: ShaperVec3;
  /** 주 손목 목표 회전 오일러 (deg) */
  readonly primaryWristRotationDeg: ShaperVec3;
  /** 보조 손 소켓 오프셋 (주 손 기준, m) */
  readonly secondaryOffsetFromPrimary: ShaperVec3;
  /** 보조 손목 목표 회전 오일러 (deg) */
  readonly secondaryWristRotationDeg: ShaperVec3;
  readonly gripRadiusMeters: number;
  readonly primaryFingerCurlDeg: ShaperFingerCurlProfile;
  readonly secondaryFingerCurlDeg: ShaperFingerCurlProfile;
  readonly dynamicBoneSwing: ShaperDynamicBonePropSwing;
}

export const SHAPER_HAND_SOCKET_PROPS: readonly ShaperHandSocketPropSpec[] = Object.freeze([
  {
    kind: "sword",
    labelKo: "검 (양손·한손)",
    hintKo: "손잡이 파워 그립과 검날 전방 정렬, 양손 폼멜 보조 IK 지원",
    propIdAlias: "sword",
    gripStyle: "power-cylinder",
    supportsTwoHanded: true,
    defaultTwoHanded: true,
    primaryLocalOffset: [0.012, -0.025, 0.045],
    primaryWristRotationDeg: [-18, 6, -8],
    secondaryOffsetFromPrimary: [-0.04, -0.14, 0.025],
    secondaryWristRotationDeg: [-12, -14, 10],
    gripRadiusMeters: 0.019,
    primaryFingerCurlDeg: { thumb: 44, index: 58, middle: 60, ring: 58, little: 56 },
    secondaryFingerCurlDeg: { thumb: 42, index: 56, middle: 58, ring: 56, little: 54 },
    dynamicBoneSwing: { enabled: true, elasticity: 0.24, damping: 0.35, inert: 0.12, swingPartKo: "검술 태슬·끈" },
  },
  {
    kind: "pen",
    labelKo: "펜·스타일러스",
    hintKo: "엄지·검지·중지 3점 정밀 핀치 그립으로 필기·드로잉 컷에 최적화",
    propIdAlias: "pen",
    gripStyle: "tripod-pinch",
    supportsTwoHanded: false,
    defaultTwoHanded: false,
    primaryLocalOffset: [0.018, -0.014, 0.056],
    primaryWristRotationDeg: [14, -18, 12],
    secondaryOffsetFromPrimary: [-0.22, -0.04, 0.08],
    secondaryWristRotationDeg: [0, 0, 0],
    gripRadiusMeters: 0.0055,
    primaryFingerCurlDeg: { thumb: 32, index: 42, middle: 46, ring: 54, little: 58 },
    secondaryFingerCurlDeg: { thumb: 8, index: 10, middle: 12, ring: 14, little: 16 },
    dynamicBoneSwing: { enabled: false, elasticity: 0.9, damping: 0.85, inert: 0, swingPartKo: "없음" },
  },
  {
    kind: "coffee-cup",
    labelKo: "커피잔·머그",
    hintKo: "손잡이 고리 파지와 양손 감싸쥐기(카페 로맨스 컷) 지원",
    propIdAlias: "coffee_cup",
    gripStyle: "handle-loop",
    supportsTwoHanded: true,
    defaultTwoHanded: false,
    primaryLocalOffset: [0.01, -0.02, 0.052],
    primaryWristRotationDeg: [4, -10, 6],
    secondaryOffsetFromPrimary: [-0.082, -0.008, 0.012],
    secondaryWristRotationDeg: [6, 18, -8],
    gripRadiusMeters: 0.036,
    primaryFingerCurlDeg: { thumb: 26, index: 52, middle: 48, ring: 42, little: 36 },
    secondaryFingerCurlDeg: { thumb: 22, index: 34, middle: 36, ring: 36, little: 32 },
    dynamicBoneSwing: { enabled: false, elasticity: 0.8, damping: 0.9, inert: 0, swingPartKo: "없음" },
  },
  {
    kind: "smartphone",
    labelKo: "스마트폰",
    hintKo: "한손 엄지 스크롤 또는 양손 타이핑 팜 거치 자동 정렬",
    propIdAlias: "smartphone",
    gripStyle: "palm-cradle",
    supportsTwoHanded: true,
    defaultTwoHanded: false,
    primaryLocalOffset: [0.006, 0.014, 0.048],
    primaryWristRotationDeg: [24, -22, 16],
    secondaryOffsetFromPrimary: [-0.072, 0.004, 0.008],
    secondaryWristRotationDeg: [22, 24, -14],
    gripRadiusMeters: 0.038,
    primaryFingerCurlDeg: { thumb: 20, index: 38, middle: 42, ring: 44, little: 48 },
    secondaryFingerCurlDeg: { thumb: 24, index: 36, middle: 40, ring: 42, little: 44 },
    dynamicBoneSwing: { enabled: true, elasticity: 0.18, damping: 0.3, inert: 0.1, swingPartKo: "스마트폰 키링·스트랩" },
  },
  {
    kind: "umbrella",
    labelKo: "우산",
    hintKo: "수직 자루 파지와 비 오는 날 어깨 기울기 보정 지원",
    propIdAlias: "umbrella",
    gripStyle: "vertical-shaft",
    supportsTwoHanded: true,
    defaultTwoHanded: false,
    primaryLocalOffset: [0.008, -0.018, 0.042],
    primaryWristRotationDeg: [-6, 4, -4],
    secondaryOffsetFromPrimary: [-0.025, -0.11, 0.01],
    secondaryWristRotationDeg: [-4, -6, 6],
    gripRadiusMeters: 0.016,
    primaryFingerCurlDeg: { thumb: 46, index: 58, middle: 58, ring: 56, little: 54 },
    secondaryFingerCurlDeg: { thumb: 40, index: 52, middle: 54, ring: 52, little: 50 },
    dynamicBoneSwing: { enabled: true, elasticity: 0.32, damping: 0.42, inert: 0.18, swingPartKo: "우산 빗방울·캐노피 흔들림" },
  },
  {
    kind: "magic-wand",
    labelKo: "마법봉·지팡이",
    hintKo: "검지 전방 지시 캐스팅 각도와 마법 리본 DynamicBone 힌트",
    propIdAlias: "magic_wand",
    gripStyle: "cast-point",
    supportsTwoHanded: true,
    defaultTwoHanded: false,
    primaryLocalOffset: [0.014, -0.012, 0.054],
    primaryWristRotationDeg: [-24, 12, -6],
    secondaryOffsetFromPrimary: [-0.045, -0.16, 0.02],
    secondaryWristRotationDeg: [-16, -12, 8],
    gripRadiusMeters: 0.013,
    primaryFingerCurlDeg: { thumb: 36, index: 16, middle: 54, ring: 56, little: 56 },
    secondaryFingerCurlDeg: { thumb: 34, index: 48, middle: 50, ring: 50, little: 48 },
    dynamicBoneSwing: { enabled: true, elasticity: 0.16, damping: 0.28, inert: 0.14, swingPartKo: "마법봉 리본·참" },
  },
]);

/* -------------------------------------------------------------------------- */
/* 2. 2인 인터랙션 웹툰 포즈 프리셋 12종 (신장차 자동 보정 메타 포함)             */
/* -------------------------------------------------------------------------- */

export type ShaperDuoInteractionGenre = "romance" | "school" | "action" | "modern" | "fantasy";

export type ShaperDuoInteractionPoseId =
  | "kabedon"
  | "shoulder-arm"
  | "duel-standoff"
  | "hand-in-hand-run"
  | "cafe-across-table"
  | "back-to-back"
  | "forehead-touch"
  | "princess-carry"
  | "collar-grab"
  | "umbrella-share"
  | "whisper-ear"
  | "high-five-victory";

export type ShaperDuoContactType = "wall-hand" | "shoulder" | "weapon-guard" | "hand-join" | "table-gaze" | "back" | "forehead" | "chest-carry" | "collar" | "umbrella-canopy" | "ear-whisper" | "overhead-palm";

export interface ShaperDuoInteractionPreset {
  readonly id: ShaperDuoInteractionPoseId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly genre: ShaperDuoInteractionGenre;
  readonly contactType: ShaperDuoContactType;
  readonly defaultSpacingMeters: number;
  readonly recommendedFocalMm: number;
  readonly actorAPoseId: string;
  readonly actorBPoseId: string;
  readonly actorAExpression: string;
  readonly actorBExpression: string;
  readonly actorAYawDeg: number;
  readonly actorBYawDeg: number;
  /** 접촉 기준 높이 비율 (상대 신장 대비 0..1.15) */
  readonly contactHeightRatio: number;
  readonly seated?: boolean;
}

export const SHAPER_DUO_INTERACTION_PRESETS: readonly ShaperDuoInteractionPreset[] = Object.freeze([
  {
    id: "kabedon",
    labelKo: "벽치기",
    summaryKo: "주연의 팔 높이를 상대방 머리 옆 벽면에 맞춰 자동 보정하는 로맨스 클로즈업",
    genre: "romance",
    contactType: "wall-hand",
    defaultSpacingMeters: 0.52,
    recommendedFocalMm: 50,
    actorAPoseId: "reach",
    actorBPoseId: "shy",
    actorAExpression: "relaxed",
    actorBExpression: "surprised",
    actorAYawDeg: 82,
    actorBYawDeg: -86,
    contactHeightRatio: 0.88,
  },
  {
    id: "shoulder-arm",
    labelKo: "어깨동무",
    summaryKo: "신장차에 맞춰 팔꿈치 꺾임과 상체 기울기를 자동 정렬하는 친밀 버디 구도",
    genre: "school",
    contactType: "shoulder",
    defaultSpacingMeters: 0.48,
    recommendedFocalMm: 35,
    actorAPoseId: "confident",
    actorBPoseId: "stand",
    actorAExpression: "happy",
    actorBExpression: "happy",
    actorAYawDeg: 10,
    actorBYawDeg: -12,
    contactHeightRatio: 0.81,
  },
  {
    id: "duel-standoff",
    labelKo: "결투 대치",
    summaryKo: "검·무기 가드 라인과 대각선 시선을 교차시키는 액션 대결 구도",
    genre: "action",
    contactType: "weapon-guard",
    defaultSpacingMeters: 1.32,
    recommendedFocalMm: 24,
    actorAPoseId: "action",
    actorBPoseId: "combat",
    actorAExpression: "angry",
    actorBExpression: "angry",
    actorAYawDeg: 68,
    actorBYawDeg: -108,
    contactHeightRatio: 0.72,
  },
  {
    id: "hand-in-hand-run",
    labelKo: "손잡고 달리기",
    summaryKo: "두 캐릭터의 손목 연결점을 중간 높이로 자동 계산해 역동적으로 질주하는 컷",
    genre: "romance",
    contactType: "hand-join",
    defaultSpacingMeters: 0.68,
    recommendedFocalMm: 24,
    actorAPoseId: "run",
    actorBPoseId: "run",
    actorAExpression: "happy",
    actorBExpression: "surprised",
    actorAYawDeg: 22,
    actorBYawDeg: 16,
    contactHeightRatio: 0.54,
  },
  {
    id: "cafe-across-table",
    labelKo: "카페 마주앉기",
    summaryKo: "테이블을 사이에 두고 앉아 신장차 시선 각도를 자연스럽게 맞추는 대화 컷",
    genre: "modern",
    contactType: "table-gaze",
    defaultSpacingMeters: 1.05,
    recommendedFocalMm: 50,
    actorAPoseId: "sit",
    actorBPoseId: "sit",
    actorAExpression: "relaxed",
    actorBExpression: "happy",
    actorAYawDeg: 85,
    actorBYawDeg: -85,
    contactHeightRatio: 0.52,
    seated: true,
  },
  {
    id: "back-to-back",
    labelKo: "등맞대기",
    summaryKo: "견갑골 접촉과 반대 방향 경계 시선으로 신뢰감을 표현하는 버디·액션 컷",
    genre: "action",
    contactType: "back",
    defaultSpacingMeters: 0.42,
    recommendedFocalMm: 35,
    actorAPoseId: "confident",
    actorBPoseId: "action",
    actorAExpression: "neutral",
    actorBExpression: "angry",
    actorAYawDeg: -26,
    actorBYawDeg: 154,
    contactHeightRatio: 0.76,
  },
  {
    id: "forehead-touch",
    labelKo: "이마 맞대기",
    summaryKo: "큰 쪽 척추를 숙이고 작은 쪽 턱을 들어 이마 높이를 정확히 일치시키는 감성 컷",
    genre: "romance",
    contactType: "forehead",
    defaultSpacingMeters: 0.4,
    recommendedFocalMm: 85,
    actorAPoseId: "stand",
    actorBPoseId: "shy",
    actorAExpression: "relaxed",
    actorBExpression: "relaxed",
    actorAYawDeg: 88,
    actorBYawDeg: -88,
    contactHeightRatio: 0.94,
  },
  {
    id: "princess-carry",
    labelKo: "공주님 안기",
    summaryKo: "안는 캐릭터의 가슴 높이에 맞춰 상대방 골반 높이를 자동 승강하는 로판 하이라이트",
    genre: "fantasy",
    contactType: "chest-carry",
    defaultSpacingMeters: 0.32,
    recommendedFocalMm: 35,
    actorAPoseId: "confident",
    actorBPoseId: "sit",
    actorAExpression: "relaxed",
    actorBExpression: "surprised",
    actorAYawDeg: 14,
    actorBYawDeg: -72,
    contactHeightRatio: 0.68,
  },
  {
    id: "collar-grab",
    labelKo: "멱살 잡기",
    summaryKo: "상대 목깃 높이에 손목 IK를 고정해 긴장감을 극대화하는 드라마·액션 대치",
    genre: "action",
    contactType: "collar",
    defaultSpacingMeters: 0.62,
    recommendedFocalMm: 28,
    actorAPoseId: "action",
    actorBPoseId: "stand",
    actorAExpression: "angry",
    actorBExpression: "surprised",
    actorAYawDeg: 84,
    actorBYawDeg: -84,
    contactHeightRatio: 0.82,
  },
  {
    id: "umbrella-share",
    labelKo: "우산 같이 쓰기",
    summaryKo: "신장차에 맞춰 우산 기울기와 어깨 거리를 좁히는 비 오는 날 로맨스 구도",
    genre: "romance",
    contactType: "umbrella-canopy",
    defaultSpacingMeters: 0.5,
    recommendedFocalMm: 50,
    actorAPoseId: "walk",
    actorBPoseId: "walk",
    actorAExpression: "relaxed",
    actorBExpression: "happy",
    actorAYawDeg: 16,
    actorBYawDeg: -14,
    contactHeightRatio: 1.08,
  },
  {
    id: "whisper-ear",
    labelKo: "귓속말",
    summaryKo: "화자의 입 높이를 청자의 귀 높이에 맞춰 척추 굽힘을 자동 보정하는 밀착 연출",
    genre: "modern",
    contactType: "ear-whisper",
    defaultSpacingMeters: 0.44,
    recommendedFocalMm: 85,
    actorAPoseId: "stand",
    actorBPoseId: "stand",
    actorAExpression: "relaxed",
    actorBExpression: "surprised",
    actorAYawDeg: 58,
    actorBYawDeg: -22,
    contactHeightRatio: 0.9,
  },
  {
    id: "high-five-victory",
    labelKo: "하이파이브",
    summaryKo: "두 캐릭터가 닿을 수 있는 머리 위 중간 높이에 손바닥 접점을 맞추는 승리의 컷",
    genre: "school",
    contactType: "overhead-palm",
    defaultSpacingMeters: 0.78,
    recommendedFocalMm: 28,
    actorAPoseId: "happy",
    actorBPoseId: "happy",
    actorAExpression: "happy",
    actorBExpression: "happy",
    actorAYawDeg: 62,
    actorBYawDeg: -62,
    contactHeightRatio: 1.06,
  },
]);

/* -------------------------------------------------------------------------- */
/* 3. 웹툰 컷 과장 원근 (만화 퍼스펙티브 18mm~135mm) 프리셋                      */
/* -------------------------------------------------------------------------- */

export interface ShaperMangaPerspectivePreset {
  readonly focalMm: number;
  readonly labelKo: string;
  readonly hintKo: string;
  readonly recommendedDistanceMeters: number;
}

export const SHAPER_MANGA_PERSPECTIVE_PRESETS: readonly ShaperMangaPerspectivePreset[] = Object.freeze([
  { focalMm: 18, labelKo: "18mm 만화 과장", hintKo: "주먹·검 끝이 화면을 뚫고 나오는 초광각 액션 퍼스펙티브", recommendedDistanceMeters: 1.35 },
  { focalMm: 24, labelKo: "24mm 역동 광각", hintKo: "전신 동세와 대각선 구도를 살리는 액션·판타지 표준", recommendedDistanceMeters: 1.85 },
  { focalMm: 35, labelKo: "35mm 드라마 스냅", hintKo: "2인 대화와 공간감을 함께 담는 연출 렌즈", recommendedDistanceMeters: 2.3 },
  { focalMm: 50, labelKo: "50mm 표준 웹툰", hintKo: "인체 왜곡이 균형 잡힌 기본 상반신·전신 시점", recommendedDistanceMeters: 2.7 },
  { focalMm: 85, labelKo: "85mm 인물 클로즈업", hintKo: "로맨스 얼굴 클로즈업·이목구비 왜곡 최소화", recommendedDistanceMeters: 2.1 },
  { focalMm: 135, labelKo: "135mm 망원 일러스트", hintKo: "평면적 압축감의 표지·일러스트 망원 구도", recommendedDistanceMeters: 3.4 },
]);
