/**
 * Wave 48D — 3D 소품 기반 15관절 손 자동 그립(Auto-Grip) 기구학 엔진.
 *
 * - 8종 웹툰 실전 3D 소품 카탈로그(물리 지름 mm · 두께 mm · 파지 유형 · 충돌 경계 반경)
 * - 15관절 손 모델(5손가락 × MCP/PIP/DIP 각도 + 엄지 대립각 + 손목 굴곡·편위·회내각) 해부학적 클램프
 * - 소품 × 좌/우 손 × 3종 감정·행동 의도 조합으로 Top-3 비파괴 파지 포즈 제안(`proposeHandPropGripsTop3`)
 * - 손가락별 굴곡·전체 파지 강도·손목 각도 미세 보정(`tweakFingerCurl`, `tweakGripTightness`, `tweakWristOrientation`)
 * - 비파괴 미리보기·적용·되돌리기 상태 머신 및 15관절 3D 핸드 리깅 JSON 직렬화(`exportHandGripRigJson`)
 */

export type HandPropId = "mug" | "sword" | "smartphone" | "pen" | "umbrella" | "teacup" | "cane" | "letter";
export type HandGripType = "cylindrical" | "pinch" | "handle" | "flat" | "precision";
export type HandSide = "left" | "right";
export type GripIntent = "relaxed-hold" | "tense-grip" | "offering";
export type FingerId = "thumb" | "index" | "middle" | "ring" | "pinky";
export type FingerJointSlot = "mcp" | "pip" | "dip";
export type GripProposalVariant = "ergonomic-natural" | "camera-silhouette" | "expressive-character";
export type HandGripSessionStatus = "idle" | "previewing" | "applied" | "reverted";
export type PenetrationRisk = "none" | "tight" | "overlap";

export interface JointAngleRange { readonly min: number; readonly max: number; }
export interface FingerJointAngles { readonly mcpDeg: number; readonly pipDeg: number; readonly dipDeg: number; }
export interface WristOrientationAngles { readonly flexionDeg: number; readonly deviationDeg: number; readonly pronationDeg: number; }

export interface HandRigPose15 {
  readonly fingers: Readonly<Record<FingerId, FingerJointAngles>>;
  readonly thumbOppositionDeg: number;
  readonly wrist: WristOrientationAngles;
  readonly tightness: number;
}

export interface HandPropSpec {
  readonly id: HandPropId;
  readonly labelKo: string; readonly labelEn: string;
  readonly subtitleKo: string; readonly subtitleEn: string;
  readonly gripType: HandGripType;
  readonly diameterMm: number; readonly thicknessMm: number; readonly collisionRadiusMm: number;
  readonly recommendedContacts: number;
  readonly sceneNoteKo: string; readonly sceneNoteEn: string;
}

export interface GripIntentMeta {
  readonly id: GripIntent;
  readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
}

export interface FingerMeta {
  readonly id: FingerId;
  readonly labelKo: string; readonly labelEn: string;
  readonly shortKo: string; readonly shortEn: string;
}

export interface HandPropGripRequest {
  readonly propId: HandPropId;
  readonly handSide?: HandSide;
  readonly intent?: GripIntent;
}

export interface HandGripMetrics {
  readonly contactPoints: number;
  readonly contactFingers: readonly FingerId[];
  readonly clearanceScore: number;
  readonly silhouetteScore: number;
  readonly overallScore: number;
  readonly penetrationRisk: PenetrationRisk;
}

export interface HandPropGripProposal {
  readonly id: string;
  readonly rank: 1 | 2 | 3;
  readonly variant: GripProposalVariant;
  readonly propId: HandPropId; readonly handSide: HandSide; readonly intent: GripIntent;
  readonly titleKo: string; readonly titleEn: string;
  readonly pose: HandRigPose15;
  readonly contactPoints: number; readonly contactFingers: readonly FingerId[];
  readonly clearanceScore: number; readonly silhouetteScore: number; readonly overallScore: number;
  readonly penetrationRisk: PenetrationRisk;
  readonly descriptionKo: string; readonly descriptionEn: string;
  readonly requiresAuthorApproval: true;
}

export interface HandPropGripProposalBundle {
  readonly prop: HandPropSpec;
  readonly handSide: HandSide;
  readonly intent: GripIntent;
  readonly proposals: readonly [HandPropGripProposal, HandPropGripProposal, HandPropGripProposal];
}

export interface HandGripSnapshot {
  readonly labelKo: string; readonly labelEn: string;
  readonly propId: HandPropId; readonly handSide: HandSide; readonly intent: GripIntent;
  readonly pose: HandRigPose15;
  readonly contactPoints: number; readonly contactFingers: readonly FingerId[];
  readonly clearanceScore: number; readonly silhouetteScore: number;
}

export interface HandGripTransition {
  readonly step: number;
  readonly action: "apply" | "revert";
  readonly proposalId: string | null;
  readonly labelKo: string;
}

export interface HandGripSessionState {
  readonly baseline: HandGripSnapshot;
  readonly current: HandGripSnapshot;
  readonly previewingProposalId: string | null;
  readonly appliedProposalId: string | null;
  readonly status: HandGripSessionStatus;
  readonly canRevert: boolean;
  readonly history: readonly HandGripTransition[];
}

export interface HandRigJoint15Entry {
  readonly finger: FingerId;
  readonly joint: FingerJointSlot;
  readonly boneName: string;
  readonly angleDeg: number;
  readonly minDeg: number;
  readonly maxDeg: number;
}

export interface HandGripRigExportInput {
  readonly prop: HandPropSpec;
  readonly handSide: HandSide;
  readonly intent: GripIntent;
  readonly pose: HandRigPose15;
  readonly metrics: HandGripMetrics;
  readonly session: HandGripSessionState;
  readonly activeProposalId?: string | null;
}

export const FINGER_IDS: readonly FingerId[] = ["thumb", "index", "middle", "ring", "pinky"];

export const FINGER_META: readonly FingerMeta[] = [
  { id: "thumb", labelKo: "엄지", labelEn: "Thumb", shortKo: "엄", shortEn: "Th" },
  { id: "index", labelKo: "검지", labelEn: "Index", shortKo: "검", shortEn: "In" },
  { id: "middle", labelKo: "중지", labelEn: "Middle", shortKo: "중", shortEn: "Mi" },
  { id: "ring", labelKo: "약지", labelEn: "Ring", shortKo: "약", shortEn: "Ri" },
  { id: "pinky", labelKo: "소지", labelEn: "Pinky", shortKo: "소", shortEn: "Pi" },
];

export const GRIP_INTENTS: readonly GripIntentMeta[] = [
  {
    id: "relaxed-hold", labelKo: "가볍게 쥠", labelEn: "Relaxed Hold",
    summaryKo: "일상 대화 컷에 맞게 손가락 힘을 빼고 자연스럽게 받칩니다.",
    summaryEn: "Softens finger curl for everyday dialogue cuts with natural resting arch.",
  },
  {
    id: "tense-grip", labelKo: "긴장한 힘", labelEn: "Tense Grip",
    summaryKo: "관절 굴곡과 엄지 대립력을 높여 대치·액션의 긴장감을 살립니다.",
    summaryEn: "Deepens joint flexion and thumb lock to convey tension or combat grip.",
  },
  {
    id: "offering", labelKo: "건네기·내밀기", labelEn: "Offering",
    summaryKo: "손목을 바깥으로 열고 손가락을 정리해 소품 실루엣을 또렷이 보여 줍니다.",
    summaryEn: "Opens wrist pronation and staggers fingers so the prop reads clearly.",
  },
];

export const HAND_GRIP_TYPE_LABELS: Readonly<Record<HandGripType, { readonly ko: string; readonly en: string }>> = {
  cylindrical: { ko: "원통 감싸쥐기", en: "Cylindrical Wrap" },
  pinch: { ko: "집게 파지", en: "Pinch Grip" },
  handle: { ko: "손잡이 고리", en: "Handle Loop" },
  flat: { ko: "평면 받침", en: "Flat Cradle" },
  precision: { ko: "정밀 삼각 파지", en: "Precision Tripod" },
};

export const ANATOMICAL_JOINT_LIMITS: {
  readonly fingers: Readonly<Record<FingerId, {
    readonly mcpDeg: JointAngleRange; readonly pipDeg: JointAngleRange; readonly dipDeg: JointAngleRange;
  }>>;
  readonly thumbOppositionDeg: JointAngleRange;
  readonly wrist: {
    readonly flexionDeg: JointAngleRange; readonly deviationDeg: JointAngleRange; readonly pronationDeg: JointAngleRange;
  };
} = {
  fingers: {
    thumb: { mcpDeg: { min: -15, max: 65 }, pipDeg: { min: -10, max: 75 }, dipDeg: { min: -15, max: 85 } },
    index: { mcpDeg: { min: -20, max: 95 }, pipDeg: { min: 0, max: 108 }, dipDeg: { min: -5, max: 80 } },
    middle: { mcpDeg: { min: -20, max: 95 }, pipDeg: { min: 0, max: 108 }, dipDeg: { min: -5, max: 80 } },
    ring: { mcpDeg: { min: -18, max: 95 }, pipDeg: { min: 0, max: 108 }, dipDeg: { min: -5, max: 80 } },
    pinky: { mcpDeg: { min: -18, max: 95 }, pipDeg: { min: 0, max: 105 }, dipDeg: { min: -5, max: 80 } },
  },
  thumbOppositionDeg: { min: 0, max: 75 },
  wrist: { flexionDeg: { min: -70, max: 75 }, deviationDeg: { min: -25, max: 35 }, pronationDeg: { min: -85, max: 85 } },
};

export const HAND_PROP_CATALOG: readonly HandPropSpec[] = [
  {
    id: "mug", labelKo: "머그컵 손잡이", labelEn: "Mug Handle",
    subtitleKo: "D형 고리 · 카페 일상 컷", subtitleEn: "D-loop handle · Cafe cut",
    gripType: "handle", diameterMm: 22, thicknessMm: 14, collisionRadiusMm: 42, recommendedContacts: 4,
    sceneNoteKo: "검지~약지를 손잡이 고리에 걸고 엄지로 상단 굴곡을 눌러 안정감을 잡습니다.",
    sceneNoteEn: "Hooks index through ring inside the D-loop while thumb steadies the top crest.",
  },
  {
    id: "sword", labelKo: "장검 자루", labelEn: "Longsword Hilt",
    subtitleKo: "원통 자루 · 판타지 액션", subtitleEn: "Cylindrical hilt · Action",
    gripType: "cylindrical", diameterMm: 34, thicknessMm: 30, collisionRadiusMm: 18, recommendedContacts: 5,
    sceneNoteKo: "약지·소지부터 단단히 감고 손목을 척측으로 14° 기울여 칼날 축을 맞춥니다.",
    sceneNoteEn: "Anchors ring and pinky firmly with 14° ulnar tilt aligned to the blade axis.",
  },
  {
    id: "smartphone", labelKo: "스마트폰 세로 파지", labelEn: "Smartphone Portrait",
    subtitleKo: "평면 바디 · 현대물 메시지", subtitleEn: "Flat body · Modern drama",
    gripType: "flat", diameterMm: 74, thicknessMm: 8.5, collisionRadiusMm: 38, recommendedContacts: 4,
    sceneNoteKo: "소지로 하단 모서리를 받치고 네 손가락이 옆면을 감싸 화면 가림을 줄입니다.",
    sceneNoteEn: "Rests bottom edge on the pinky shelf while fingers cradle side rails cleanly.",
  },
  {
    id: "pen", labelKo: "만년필·G펜", labelEn: "Fountain / G-Pen",
    subtitleKo: "정밀 삼각 · 작업실·계약 컷", subtitleEn: "Precision tripod · Desk cut",
    gripType: "precision", diameterMm: 11, thicknessMm: 11, collisionRadiusMm: 6.5, recommendedContacts: 3,
    sceneNoteKo: "엄지·검지·중지 3점 지지로 펜대를 고정하고 약지·소지를 안쪽으로 접습니다.",
    sceneNoteEn: "Locks barrel in a 3-point tripod while ring and pinky tuck smoothly below.",
  },
  {
    id: "umbrella", labelKo: "장우산 손잡이", labelEn: "Umbrella Crook",
    subtitleKo: "J형 손잡이 · 빗속 로맨스", subtitleEn: "J-crook handle · Rain scene",
    gripType: "handle", diameterMm: 24, thicknessMm: 24, collisionRadiusMm: 14, recommendedContacts: 5,
    sceneNoteKo: "다섯 손가락을 고르게 감아 우산 대가 수직으로 서도록 손목 균형을 잡습니다.",
    sceneNoteEn: "Wraps all five digits evenly around the crook to keep the shaft upright.",
  },
  {
    id: "teacup", labelKo: "찻잔·와인잔", labelEn: "Teacup / Wine Glass",
    subtitleKo: "집게 파지 · 로판 티타임", subtitleEn: "Delicate pinch · Tea scene",
    gripType: "pinch", diameterMm: 16, thicknessMm: 9, collisionRadiusMm: 34, recommendedContacts: 3,
    sceneNoteKo: "엄지와 검지 끝으로 잔 손잡이를 집고 약지·소지를 부드럽게 펼쳐 우아함을 냅니다.",
    sceneNoteEn: "Pinches the slender ear with thumb and index while fanning ring and pinky.",
  },
  {
    id: "cane", labelKo: "지팡이·마법봉", labelEn: "Cane / Magic Staff",
    subtitleKo: "원통 봉 · 판타지·느와르", subtitleEn: "Staff shaft · Fantasy / Noir",
    gripType: "cylindrical", diameterMm: 30, thicknessMm: 30, collisionRadiusMm: 16, recommendedContacts: 5,
    sceneNoteKo: "손바닥 중심으로 봉을 감싸고 엄지를 상단에 올려 지탱·시전 자세를 잡습니다.",
    sceneNoteEn: "Seats shaft across palm center with thumb braced high for stance or casting.",
  },
  {
    id: "letter", labelKo: "봉투·편지지", labelEn: "Envelope / Letter",
    subtitleKo: "평면 집기 · 고백·밀서 컷", subtitleEn: "Thin flat sheet · Confession",
    gripType: "flat", diameterMm: 95, thicknessMm: 2, collisionRadiusMm: 28, recommendedContacts: 3,
    sceneNoteKo: "엄지를 봉투 앞면에 대고 검지·중지로 뒷면을 받쳐 종이 구겨짐을 막습니다.",
    sceneNoteEn: "Presses thumb on the front face while index and middle back the envelope.",
  },
];

type JointTuple = readonly [number, number, number];
function fAngles(t: JointTuple): FingerJointAngles { return { mcpDeg: t[0], pipDeg: t[1], dipDeg: t[2] }; }
function buildPose(
  thumb: JointTuple, index: JointTuple, middle: JointTuple, ring: JointTuple, pinky: JointTuple,
  thumbOppositionDeg: number, wrist: JointTuple, tightness: number,
): HandRigPose15 {
  return {
    fingers: { thumb: fAngles(thumb), index: fAngles(index), middle: fAngles(middle), ring: fAngles(ring), pinky: fAngles(pinky) },
    thumbOppositionDeg,
    wrist: { flexionDeg: wrist[0], deviationDeg: wrist[1], pronationDeg: wrist[2] },
    tightness,
  };
}

export const NEUTRAL_OPEN_HAND_POSE: HandRigPose15 = buildPose(
  [8, 10, 6], [12, 16, 8], [14, 18, 10], [16, 20, 10], [18, 22, 12], 22, [0, 0, 0], 18,
);

interface PropKinematicsProfile {
  readonly basePose: HandRigPose15;
  readonly primaryContactFingers: readonly FingerId[];
}

const PROP_PROFILES: Readonly<Record<HandPropId, PropKinematicsProfile>> = {
  mug: { basePose: buildPose([24, 28, 18], [62, 78, 46], [66, 82, 48], [58, 72, 42], [34, 44, 24], 48, [-4, 8, 10], 58), primaryContactFingers: ["thumb", "index", "middle", "ring"] },
  sword: { basePose: buildPose([34, 44, 32], [58, 74, 46], [66, 82, 50], [72, 86, 52], [74, 88, 54], 62, [-6, 14, 20], 76), primaryContactFingers: ["thumb", "index", "middle", "ring", "pinky"] },
  smartphone: { basePose: buildPose([16, 22, 14], [24, 38, 24], [28, 42, 26], [30, 44, 28], [48, 56, 32], 44, [-8, -4, -24], 46), primaryContactFingers: ["thumb", "middle", "ring", "pinky"] },
  pen: { basePose: buildPose([28, 32, 22], [48, 64, 34], [54, 68, 40], [66, 78, 46], [70, 82, 48], 64, [-14, 10, 28], 60), primaryContactFingers: ["thumb", "index", "middle"] },
  umbrella: { basePose: buildPose([30, 38, 26], [60, 76, 46], [64, 80, 48], [66, 82, 50], [64, 78, 48], 56, [-4, 12, 6], 68), primaryContactFingers: ["thumb", "index", "middle", "ring", "pinky"] },
  teacup: { basePose: buildPose([26, 30, 24], [44, 66, 40], [36, 48, 28], [22, 30, 16], [14, 20, 10], 58, [-8, 6, -10], 44), primaryContactFingers: ["thumb", "index", "middle"] },
  cane: { basePose: buildPose([20, 24, 16], [60, 76, 44], [64, 80, 48], [68, 84, 50], [66, 80, 48], 50, [-10, 12, 14], 66), primaryContactFingers: ["thumb", "index", "middle", "ring", "pinky"] },
  letter: { basePose: buildPose([18, 22, 16], [28, 36, 20], [32, 40, 22], [40, 50, 28], [46, 56, 32], 52, [-6, -4, -16], 42), primaryContactFingers: ["thumb", "index", "middle"] },
};

function round1(value: number): number { return Math.round(value * 10) / 10; }
function clamp(value: number, min: number, max: number): number { return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min; }
function clampRange(value: number, range: JointAngleRange): number { return round1(clamp(value, range.min, range.max)); }

export function getHandPropSpec(propId: HandPropId): HandPropSpec {
  return HAND_PROP_CATALOG.find((item) => item.id === propId) ?? HAND_PROP_CATALOG[0];
}

export function getGripIntentMeta(intent: GripIntent): GripIntentMeta {
  return GRIP_INTENTS.find((item) => item.id === intent) ?? GRIP_INTENTS[0];
}

/** 15개 손가락 관절 + 엄지 대립각 + 손목 3축 각도를 해부학적 안전 범위 안으로 클램프한다. */
export function clampHandRigPose(pose: HandRigPose15): HandRigPose15 {
  const fingers = {} as Record<FingerId, FingerJointAngles>;
  for (const finger of FINGER_IDS) {
    const raw = pose.fingers[finger];
    const limit = ANATOMICAL_JOINT_LIMITS.fingers[finger];
    fingers[finger] = {
      mcpDeg: clampRange(raw.mcpDeg, limit.mcpDeg),
      pipDeg: clampRange(raw.pipDeg, limit.pipDeg),
      dipDeg: clampRange(raw.dipDeg, limit.dipDeg),
    };
  }
  return {
    fingers,
    thumbOppositionDeg: clampRange(pose.thumbOppositionDeg, ANATOMICAL_JOINT_LIMITS.thumbOppositionDeg),
    wrist: {
      flexionDeg: clampRange(pose.wrist.flexionDeg, ANATOMICAL_JOINT_LIMITS.wrist.flexionDeg),
      deviationDeg: clampRange(pose.wrist.deviationDeg, ANATOMICAL_JOINT_LIMITS.wrist.deviationDeg),
      pronationDeg: clampRange(pose.wrist.pronationDeg, ANATOMICAL_JOINT_LIMITS.wrist.pronationDeg),
    },
    tightness: Math.round(clamp(pose.tightness, 0, 100)),
  };
}

function fingerCurlComposite(angles: FingerJointAngles): number {
  return angles.mcpDeg * 0.44 + angles.pipDeg * 0.4 + angles.dipDeg * 0.16;
}

function maxSafeCurlForProp(prop: HandPropSpec, finger: FingerId): number {
  if (finger === "thumb") return prop.gripType === "flat" ? 56 : prop.gripType === "pinch" ? 64 : 68;
  if (prop.gripType === "flat") return prop.id === "smartphone" ? (finger === "pinky" ? 66 : 56) : 64;
  if (prop.gripType === "precision") return 88;
  if (prop.gripType === "pinch") return 82;
  return round1(68 + clamp((44 - prop.diameterMm) * 0.68, 0, 22));
}

/** 고정 소품·관절 각도로 접촉 손가락(0~5)과 적합도를 추정한다. 실제 메시 충돌 검사는 아니다. */
export function evaluateHandPropPoseMetrics(
  pose: HandRigPose15, prop: HandPropSpec, _handSide: HandSide, intent: GripIntent,
): HandGripMetrics {
  const clamped = clampHandRigPose(pose);
  const profile = PROP_PROFILES[prop.id];
  const basePose = profile.basePose;

  const activeContacts: FingerId[] = [];
  let totalPenetrationPenalty = 0;
  let totalFitPenalty = 0;

  for (const finger of FINGER_IDS) {
    const actualCurl = fingerCurlComposite(clamped.fingers[finger]);
    const refCurl = fingerCurlComposite(basePose.fingers[finger]);
    const safeMax = maxSafeCurlForProp(prop, finger);
    const isPrimary = profile.primaryContactFingers.includes(finger);

    if (actualCurl > safeMax) {
      totalPenetrationPenalty += (actualCurl - safeMax) * (isPrimary ? 2.1 : 1.15);
    }
    const delta = Math.abs(actualCurl - refCurl);
    if (isPrimary) {
      totalFitPenalty += Math.max(0, delta - 14) * 0.55;
      if (actualCurl >= refCurl - 22) activeContacts.push(finger);
    } else if (actualCurl >= refCurl + 12 && actualCurl <= safeMax + 6) {
      activeContacts.push(finger);
    }
  }

  const thumbOppDiff = Math.abs(clamped.thumbOppositionDeg - basePose.thumbOppositionDeg);
  if (clamped.thumbOppositionDeg > 70 && prop.collisionRadiusMm >= 28) {
    totalPenetrationPenalty += (clamped.thumbOppositionDeg - 70) * 1.6;
  }
  totalFitPenalty += Math.max(0, thumbOppDiff - 18) * 0.35;

  const finalContacts = activeContacts.slice(0, 5);
  const contactPoints = finalContacts.length;

  const clearanceScore = Math.round(clamp(97 - totalPenetrationPenalty - totalFitPenalty * 0.6, 0, 100));
  const penetrationRisk: PenetrationRisk = clearanceScore >= 78 ? "none" : clearanceScore >= 58 ? "tight" : "overlap";

  const curls = FINGER_IDS.map((f) => fingerCurlComposite(clamped.fingers[f]));
  const spreadBonus = clamp((Math.max(...curls) - Math.min(...curls)) * 0.55, 6, 24);
  const thumbVisibilityBonus = clamp((clamped.thumbOppositionDeg - 20) * 0.25, 0, 11);
  const wristReadability = intent === "offering"
    ? clamp(16 - Math.abs(clamped.wrist.pronationDeg + 26) * 0.25, 4, 16)
    : clamp(14 - Math.abs(clamped.wrist.pronationDeg) * 0.14, 4, 14);
  const silhouetteScore = Math.round(
    clamp(52 + spreadBonus + thumbVisibilityBonus + wristReadability - (penetrationRisk === "overlap" ? 14 : 0), 0, 100),
  );
  const overallScore = Math.round(clamp(clearanceScore * 0.54 + silhouetteScore * 0.36 + (contactPoints / 5) * 10, 0, 100));

  return { contactPoints, contactFingers: finalContacts, clearanceScore, silhouetteScore, overallScore, penetrationRisk };
}

/** 개별 손가락의 굴곡(MCP·PIP·DIP)을 비파괴적으로 deltaDeg만큼 미세 보정한다. */
export function tweakFingerCurl(pose: HandRigPose15, finger: FingerId, deltaDeg: number): HandRigPose15 {
  const safeDelta = Number.isFinite(deltaDeg) ? deltaDeg : 0;
  const target = pose.fingers[finger];
  return clampHandRigPose({
    ...pose,
    fingers: {
      ...pose.fingers,
      [finger]: {
        mcpDeg: target.mcpDeg + safeDelta * 0.75,
        pipDeg: target.pipDeg + safeDelta * 1.0,
        dipDeg: target.dipDeg + safeDelta * 0.65,
      },
    },
    thumbOppositionDeg: finger === "thumb" ? pose.thumbOppositionDeg + safeDelta * 0.28 : pose.thumbOppositionDeg,
  });
}

/** 전체 파지 강도(tightness, -100~+100 포인트 델타)를 반영해 5손가락 굴곡과 엄지 대립각을 연동 보정한다. */
export function tweakGripTightness(pose: HandRigPose15, tightnessDelta: number): HandRigPose15 {
  const safeDelta = Number.isFinite(tightnessDelta) ? clamp(tightnessDelta, -100, 100) : 0;
  const curlStep = safeDelta * 0.34;
  const nextFingers = {} as Record<FingerId, FingerJointAngles>;
  for (const finger of FINGER_IDS) {
    const f = pose.fingers[finger];
    const w = finger === "thumb" ? 0.65 : finger === "pinky" ? 0.85 : 1.0;
    nextFingers[finger] = {
      mcpDeg: f.mcpDeg + curlStep * 0.72 * w,
      pipDeg: f.pipDeg + curlStep * 0.96 * w,
      dipDeg: f.dipDeg + curlStep * 0.62 * w,
    };
  }
  return clampHandRigPose({
    ...pose,
    fingers: nextFingers,
    thumbOppositionDeg: pose.thumbOppositionDeg + safeDelta * 0.16,
    tightness: pose.tightness + safeDelta,
  });
}

/** 손목 3축 각도(굴곡·편위·회내)를 부분 패치로 보정하고 해부학적 안전 범위 안으로 클램프한다. */
export function tweakWristOrientation(pose: HandRigPose15, patch: Partial<WristOrientationAngles>): HandRigPose15 {
  return clampHandRigPose({
    ...pose,
    wrist: {
      flexionDeg: patch.flexionDeg ?? pose.wrist.flexionDeg,
      deviationDeg: patch.deviationDeg ?? pose.wrist.deviationDeg,
      pronationDeg: patch.pronationDeg ?? pose.wrist.pronationDeg,
    },
  });
}

function applyIntentToBasePose(basePose: HandRigPose15, prop: HandPropSpec, intent: GripIntent): HandRigPose15 {
  if (intent === "relaxed-hold") {
    const next = tweakFingerCurl(tweakGripTightness(basePose, -8), "pinky", -6);
    return tweakWristOrientation(next, { flexionDeg: basePose.wrist.flexionDeg + 2, pronationDeg: basePose.wrist.pronationDeg - 4 });
  }
  if (intent === "tense-grip") {
    let next = tweakGripTightness(basePose, 16);
    next = tweakFingerCurl(next, "index", prop.gripType === "flat" ? 4 : 7);
    next = tweakFingerCurl(next, "thumb", 6);
    return tweakWristOrientation(next, {
      flexionDeg: basePose.wrist.flexionDeg + 8,
      deviationDeg: basePose.wrist.deviationDeg + 5,
      pronationDeg: basePose.wrist.pronationDeg + 10,
    });
  }
  let next = tweakGripTightness(basePose, -12);
  next = tweakFingerCurl(tweakFingerCurl(next, "ring", -8), "pinky", -12);
  return tweakWristOrientation(next, {
    flexionDeg: basePose.wrist.flexionDeg - 10,
    deviationDeg: basePose.wrist.deviationDeg - 4,
    pronationDeg: basePose.wrist.pronationDeg - 26,
  });
}

function buildVariantPose(
  intentPose: HandRigPose15, prop: HandPropSpec, intent: GripIntent, variant: GripProposalVariant,
): HandRigPose15 {
  if (variant === "ergonomic-natural") return clampHandRigPose(intentPose);
  if (variant === "camera-silhouette") {
    let next = tweakFingerCurl(tweakFingerCurl(intentPose, "pinky", -10), "ring", -5);
    next = tweakFingerCurl(next, "thumb", prop.gripType === "flat" ? -4 : -2);
    return tweakWristOrientation(next, { flexionDeg: intentPose.wrist.flexionDeg - 4, pronationDeg: intentPose.wrist.pronationDeg - 14 });
  }
  if (intent === "tense-grip") {
    const next = tweakFingerCurl(tweakGripTightness(intentPose, 8), "middle", 5);
    return tweakWristOrientation(next, { flexionDeg: intentPose.wrist.flexionDeg + 6, deviationDeg: intentPose.wrist.deviationDeg + 4 });
  }
  if (intent === "offering") {
    const next = tweakFingerCurl(tweakFingerCurl(intentPose, "index", -6), "pinky", -8);
    return tweakWristOrientation(next, { flexionDeg: intentPose.wrist.flexionDeg - 6, pronationDeg: intentPose.wrist.pronationDeg - 10 });
  }
  const next = tweakFingerCurl(
    tweakFingerCurl(intentPose, "index", -4),
    "pinky",
    prop.id === "teacup" || prop.id === "mug" ? -12 : -7,
  );
  return tweakWristOrientation(next, { flexionDeg: intentPose.wrist.flexionDeg - 5, deviationDeg: intentPose.wrist.deviationDeg - 3 });
}

function describeProposal(
  prop: HandPropSpec, handSide: HandSide, intent: GripIntent, variant: GripProposalVariant, metrics: HandGripMetrics,
): { readonly titleKo: string; readonly titleEn: string; readonly descriptionKo: string; readonly descriptionEn: string } {
  const sideKo = handSide === "left" ? "왼손" : "오른손";
  const sideEn = handSide === "left" ? "Left" : "Right";
  const intentMeta = getGripIntentMeta(intent);

  if (variant === "ergonomic-natural") {
    return {
      titleKo: `안정 밀착 · ${prop.labelKo}`,
      titleEn: `Natural Fit · ${prop.labelEn}`,
      descriptionKo: `${sideKo}·지름 ${prop.diameterMm}mm의 고정 예제에서 ${metrics.contactPoints}개 접촉 손가락을 추정합니다. ${intentMeta.labelKo} 각도 후보이며 실제 접촉·관통은 검증하지 않았습니다.`,
      descriptionEn: `Estimates ${metrics.contactPoints} contact fingers for a fixed ${prop.diameterMm}mm ${sideEn.toLowerCase()}-hand example. Actual contact and mesh penetration are unverified.`,
    };
  }
  if (variant === "camera-silhouette") {
    return {
      titleKo: "실루엣 선명 · 카메라 컷",
      titleEn: "Clear Silhouette · Camera Read",
      descriptionKo: "손목을 바깥으로 열어 소품 외곽이 손바닥에 가리지 않게 정리했습니다. 원거리·미디엄 컷에서도 파지 형태가 또렷하게 읽힙니다.",
      descriptionEn: "Opens wrist angle and staggers outer digits so the prop silhouette reads sharply from medium distance.",
    };
  }
  const nuanceKo = intent === "tense-grip"
    ? "손가락 끝 굴곡과 손목 버팀을 더해 힘을 꽉 준 긴박감을 강조합니다."
    : intent === "offering"
      ? "손끝을 바깥으로 부드럽게 열어 상대에게 건네는 시선 흐름을 만듭니다."
      : "검지·소지 마디 층차를 살려 일상 컷에 여유 있는 손끝 연기를 더합니다.";
  const nuanceEn = intent === "tense-grip"
    ? "Adds distal curl and wrist bracing for taut, high-stakes grip tension."
    : intent === "offering"
      ? "Extends outer fingers gently to lead the reader's gaze toward the offered prop."
      : "Introduces subtle finger stagger for poised, lifelike character acting.";

  return {
    titleKo: `연기 강조 · ${intentMeta.labelKo}`,
    titleEn: `Expressive · ${intentMeta.labelEn}`,
    descriptionKo: `${sideKo} 클로즈업용 연출안입니다. ${nuanceKo}`,
    descriptionEn: `${sideEn}-hand close-up acting pass. ${nuanceEn}`,
  };
}

/** 소품 + 손 좌/우 + 감정·행동 의도 조합으로 비파괴 Top-3 파지 포즈 제안을 결정론적으로 생성한다. */
export function proposeHandPropGripsTop3(request: HandPropGripRequest): HandPropGripProposalBundle {
  const prop = getHandPropSpec(request.propId);
  const handSide: HandSide = request.handSide ?? "right";
  const intent: GripIntent = request.intent ?? "relaxed-hold";
  const intentPose = applyIntentToBasePose(PROP_PROFILES[prop.id].basePose, prop, intent);
  const variants: readonly [GripProposalVariant, GripProposalVariant, GripProposalVariant] = [
    "ergonomic-natural", "camera-silhouette", "expressive-character",
  ];

  const items = variants.map((variant, index) => {
    const pose = buildVariantPose(intentPose, prop, intent, variant);
    const metrics = evaluateHandPropPoseMetrics(pose, prop, handSide, intent);
    const copy = describeProposal(prop, handSide, intent, variant, metrics);
    return {
      id: `grip-${prop.id}-${handSide}-${intent}-${variant}`,
      rank: (index + 1) as 1 | 2 | 3,
      variant, propId: prop.id, handSide, intent,
      titleKo: copy.titleKo, titleEn: copy.titleEn,
      pose,
      contactPoints: metrics.contactPoints, contactFingers: metrics.contactFingers,
      clearanceScore: metrics.clearanceScore, silhouetteScore: metrics.silhouetteScore,
      overallScore: metrics.overallScore, penetrationRisk: metrics.penetrationRisk,
      descriptionKo: copy.descriptionKo, descriptionEn: copy.descriptionEn,
      requiresAuthorApproval: true as const,
    };
  });

  return { prop, handSide, intent, proposals: [items[0], items[1], items[2]] };
}

/** 15관절 손가락 각도를 VRM Humanoid 표준 본 이름과 함께 15개 평탄 배열로 변환한다. */
export function flattenHandJoints15(pose: HandRigPose15, handSide: HandSide): readonly HandRigJoint15Entry[] {
  const prefix = handSide === "left" ? "left" : "right";
  const clamped = clampHandRigPose(pose);
  const entries: HandRigJoint15Entry[] = [];
  const boneMap: Readonly<Record<FingerId, readonly [string, string, string]>> = {
    thumb: [`${prefix}ThumbMetacarpal`, `${prefix}ThumbProximal`, `${prefix}ThumbDistal`],
    index: [`${prefix}IndexProximal`, `${prefix}IndexIntermediate`, `${prefix}IndexDistal`],
    middle: [`${prefix}MiddleProximal`, `${prefix}MiddleIntermediate`, `${prefix}MiddleDistal`],
    ring: [`${prefix}RingProximal`, `${prefix}RingIntermediate`, `${prefix}RingDistal`],
    pinky: [`${prefix}LittleProximal`, `${prefix}LittleIntermediate`, `${prefix}LittleDistal`],
  };

  for (const finger of FINGER_IDS) {
    const f = clamped.fingers[finger];
    const limit = ANATOMICAL_JOINT_LIMITS.fingers[finger];
    const [b0, b1, b2] = boneMap[finger];
    entries.push(
      { finger, joint: "mcp", boneName: b0, angleDeg: f.mcpDeg, minDeg: limit.mcpDeg.min, maxDeg: limit.mcpDeg.max },
      { finger, joint: "pip", boneName: b1, angleDeg: f.pipDeg, minDeg: limit.pipDeg.min, maxDeg: limit.pipDeg.max },
      { finger, joint: "dip", boneName: b2, angleDeg: f.dipDeg, minDeg: limit.dipDeg.min, maxDeg: limit.dipDeg.max },
    );
  }
  return entries;
}

export function createBaselineHandSnapshot(
  propId: HandPropId = "mug", handSide: HandSide = "right", intent: GripIntent = "relaxed-hold",
): HandGripSnapshot {
  const prop = getHandPropSpec(propId);
  const metrics = evaluateHandPropPoseMetrics(NEUTRAL_OPEN_HAND_POSE, prop, handSide, intent);
  return {
    labelKo: "예제 기준 · 기본 펼친 손", labelEn: "Example Baseline · Neutral Open Hand",
    propId, handSide, intent, pose: clampHandRigPose(NEUTRAL_OPEN_HAND_POSE),
    contactPoints: metrics.contactPoints, contactFingers: metrics.contactFingers,
    clearanceScore: metrics.clearanceScore, silhouetteScore: metrics.silhouetteScore,
  };
}

export function createHandGripSessionState(baseline?: HandGripSnapshot): HandGripSessionState {
  const base = baseline ?? createBaselineHandSnapshot();
  return {
    baseline: base, current: base, previewingProposalId: null, appliedProposalId: null,
    status: "idle", canRevert: false, history: [],
  };
}

/** 비파괴 미리보기 토글: baseline과 current를 바꾸지 않고 previewingProposalId만 전환한다. */
export function previewHandGripProposal(session: HandGripSessionState, proposalId: string | null): HandGripSessionState {
  if (proposalId === null || session.previewingProposalId === proposalId) {
    return {
      ...session,
      previewingProposalId: null,
      status: session.appliedProposalId ? "applied" : session.history.length > 0 ? "reverted" : "idle",
    };
  }
  return { ...session, previewingProposalId: proposalId, status: "previewing" };
}

/** 작가 승인으로 선택한 그립 포즈(또는 미세 보정 포즈)를 current에 비파괴 적용한다. */
export function applyHandGripProposal(
  session: HandGripSessionState, proposal: HandPropGripProposal, overridePose?: HandRigPose15,
): HandGripSessionState {
  const prop = getHandPropSpec(proposal.propId);
  const effectivePose = clampHandRigPose(overridePose ?? proposal.pose);
  const metrics = evaluateHandPropPoseMetrics(effectivePose, prop, proposal.handSide, proposal.intent);
  const snapshot: HandGripSnapshot = {
    labelKo: `적용됨 · ${proposal.titleKo}`, labelEn: `Applied · ${proposal.titleEn}`,
    propId: proposal.propId, handSide: proposal.handSide, intent: proposal.intent, pose: effectivePose,
    contactPoints: metrics.contactPoints, contactFingers: metrics.contactFingers,
    clearanceScore: metrics.clearanceScore, silhouetteScore: metrics.silhouetteScore,
  };
  return {
    ...session, current: snapshot, previewingProposalId: null, appliedProposalId: proposal.id,
    status: "applied", canRevert: true,
    history: [...session.history, { step: session.history.length + 1, action: "apply", proposalId: proposal.id, labelKo: proposal.titleKo }],
  };
}

/** 적용한 그립을 원본 baseline 손 포즈로 즉시 되돌린다. */
export function revertHandGripProposal(session: HandGripSessionState): HandGripSessionState {
  if (!session.canRevert && session.appliedProposalId === null) {
    return { ...session, previewingProposalId: null, status: session.history.length > 0 ? "reverted" : "idle" };
  }
  return {
    ...session, current: session.baseline, previewingProposalId: null, appliedProposalId: null,
    status: "reverted", canRevert: false,
    history: [...session.history, { step: session.history.length + 1, action: "revert", proposalId: null, labelKo: session.baseline.labelKo }],
  };
}

/** 현재 15관절 핸드 리깅 포즈·소품 충돌 정보·비파괴 세션 상태를 3D 리깅 JSON으로 직렬화한다. */
export function exportHandGripRigJson(input: HandGripRigExportInput): string {
  const clampedPose = clampHandRigPose(input.pose);
  const joints15 = flattenHandJoints15(clampedPose, input.handSide);
  const prefix = `grip-${input.prop.id}-${input.handSide}-${input.intent}-`;
  const belongsToTarget = (id: string | null | undefined): id is string => typeof id === "string" && id.startsWith(prefix);
  const activeId = input.activeProposalId === undefined ? input.session.appliedProposalId : input.activeProposalId;
  const current = input.session.current;
  const matchesCurrent = current.propId === input.prop.id && current.handSide === input.handSide && current.intent === input.intent
    && JSON.stringify(clampHandRigPose(current.pose)) === JSON.stringify(clampedPose);
  const appliedId = matchesCurrent && belongsToTarget(input.session.appliedProposalId) ? input.session.appliedProposalId : null;
  const metrics = evaluateHandPropPoseMetrics(clampedPose, input.prop, input.handSide, input.intent);
  const payload = {
    schemaVersion: "toonstudio.hand-prop-autogrip.v1",
    nonDestructivePolicy: "author-approval-required",
    execution: { source: "synthetic-catalog", meshCollisionChecked: false, sceneMutationVerified: false, persistenceVerified: false },
    handSide: input.handSide,
    mirrorSign: input.handSide === "left" ? -1 : 1,
    intent: input.intent,
    activeProposalId: belongsToTarget(activeId) ? activeId : null,
    prop: {
      id: input.prop.id, labelKo: input.prop.labelKo, labelEn: input.prop.labelEn,
      gripType: input.prop.gripType, diameterMm: input.prop.diameterMm,
      thicknessMm: input.prop.thicknessMm, collisionRadiusMm: input.prop.collisionRadiusMm,
    },
    metrics: {
      contactPoints: metrics.contactPoints, contactFingers: metrics.contactFingers,
      clearanceScore: metrics.clearanceScore, silhouetteScore: metrics.silhouetteScore,
      overallScore: metrics.overallScore, penetrationRisk: metrics.penetrationRisk,
    },
    rig15: {
      jointCount: joints15.length,
      thumbOppositionDeg: clampedPose.thumbOppositionDeg,
      tightness: clampedPose.tightness,
      wrist: {
        boneName: input.handSide === "left" ? "leftHand" : "rightHand",
        flexionDeg: clampedPose.wrist.flexionDeg,
        deviationDeg: clampedPose.wrist.deviationDeg,
        pronationDeg: clampedPose.wrist.pronationDeg,
      },
      joints: joints15,
    },
    session: {
      status: matchesCurrent ? input.session.status : "previewing", canRevert: matchesCurrent && input.session.canRevert,
      appliedProposalId: appliedId,
      previewingProposalId: belongsToTarget(input.session.previewingProposalId) ? input.session.previewingProposalId : null,
      historyCount: input.session.history.length,
    },
  };
  return JSON.stringify(payload, null, 2);
}
