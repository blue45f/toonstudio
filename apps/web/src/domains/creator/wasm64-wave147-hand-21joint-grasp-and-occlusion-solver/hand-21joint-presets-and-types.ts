/**
 * Wave 147 — 21-관절 손 해부학 타입, 관절 ROM 상수, 표준 치수 및 웹툰 실무 6종 프리셋 정의.
 */

import { vec3, type GraspPropPrimitive, type Vec3 } from "./hand-pose-math-and-sha256";

export type Handedness = "left" | "right";
export type HandFingerId = "thumb" | "index" | "middle" | "ring" | "pinky";

export const HAND_FINGER_IDS: readonly HandFingerId[] = [
  "thumb",
  "index",
  "middle",
  "ring",
  "pinky",
];

export type HandJointId =
  | "wrist"
  | "thumb_cmc"
  | "thumb_mcp"
  | "thumb_ip"
  | "thumb_tip"
  | "index_mcp"
  | "index_pip"
  | "index_dip"
  | "index_tip"
  | "middle_mcp"
  | "middle_pip"
  | "middle_dip"
  | "middle_tip"
  | "ring_mcp"
  | "ring_pip"
  | "ring_dip"
  | "ring_tip"
  | "pinky_mcp"
  | "pinky_pip"
  | "pinky_dip"
  | "pinky_tip";

export const HAND_21_JOINT_IDS: readonly HandJointId[] = [
  "wrist",
  "thumb_cmc",
  "thumb_mcp",
  "thumb_ip",
  "thumb_tip",
  "index_mcp",
  "index_pip",
  "index_dip",
  "index_tip",
  "middle_mcp",
  "middle_pip",
  "middle_dip",
  "middle_tip",
  "ring_mcp",
  "ring_pip",
  "ring_dip",
  "ring_tip",
  "pinky_mcp",
  "pinky_pip",
  "pinky_dip",
  "pinky_tip",
];

export type HandSegmentKind = "metacarpal" | "proximal" | "middle" | "distal";

export type HandPresetId =
  | "open-palm"
  | "clenched-fist"
  | "sword-hilt-grip"
  | "smartphone-hold"
  | "teacup-pinch"
  | "pointing-accusation";

export const HAND_PRESET_IDS: readonly HandPresetId[] = [
  "open-palm",
  "clenched-fist",
  "sword-hilt-grip",
  "smartphone-hold",
  "teacup-pinch",
  "pointing-accusation",
];

export interface AngleRangeDeg {
  readonly minDeg: number;
  readonly maxDeg: number;
}

export interface FingerRomLimitSpec {
  readonly mcpFlex: AngleRangeDeg;
  readonly mcpAbduct: AngleRangeDeg;
  readonly pipFlex: AngleRangeDeg;
  readonly dipFlex: AngleRangeDeg;
  readonly opposition: AngleRangeDeg;
}

export interface WristRomLimitSpec {
  readonly flexion: AngleRangeDeg;
  readonly radialUlnar: AngleRangeDeg;
  readonly pronation: AngleRangeDeg;
}

export interface WristPoseAngles {
  /** 손목 굴곡(+)/신전(-) 각도 (deg) */
  readonly flexionDeg: number;
  /** 요측(+)/척측(-) 편위 각도 (deg) */
  readonly radialUlnarDeg: number;
  /** 회내(+)/회외(-) 비틀림 각도 (deg) */
  readonly pronationDeg: number;
}

export interface FingerPoseAngles {
  /** CMC(엄지) 또는 MCP(4손가락) 굴곡각 (deg) */
  readonly mcpFlexDeg: number;
  /** CMC/MCP 외전·벌림각 (deg, + = 중심에서 바깥쪽) */
  readonly mcpAbductDeg: number;
  /** PIP(엄지는 MCP) 굴곡각 (deg) */
  readonly pipFlexDeg: number;
  /** DIP(엄지는 IP) 굴곡각 (deg) */
  readonly dipFlexDeg: number;
  /** 엄지 대립 회전각 (deg, 엄지 전용 0~75도) */
  readonly oppositionDeg?: number;
}

export type FingerPoseAngleMap = Readonly<Record<HandFingerId, FingerPoseAngles>>;

export interface HandPoseSpec {
  readonly handedness: Handedness;
  /** 손바닥 표준 너비 (mm, 기본값 84mm) */
  readonly palmWidthMm?: number;
  readonly wristAngles?: Partial<WristPoseAngles>;
  /** 손목 기준 전역 위치 이동 (mm) */
  readonly wristTranslationMm?: Vec3;
  readonly fingers: FingerPoseAngleMap;
  /** true이면 buildHand21JointPose가 ROM 위반 관절을 자동 클램핑한다. */
  readonly clampToRom?: boolean;
  readonly presetId?: HandPresetId;
}

export interface HandJoint3D {
  readonly index: number;
  readonly id: HandJointId;
  readonly parentId: HandJointId | null;
  readonly finger: HandFingerId | "palm";
  readonly positionMm: Vec3;
  readonly radiusMm: number;
}

export interface HandBoneCapsule {
  readonly segmentIndex: number;
  readonly id: string;
  readonly fromJointId: HandJointId;
  readonly toJointId: HandJointId;
  readonly finger: HandFingerId;
  readonly kind: HandSegmentKind;
  readonly startMm: Vec3;
  readonly endMm: Vec3;
  readonly lengthMm: number;
  readonly radiusMm: number;
}

export interface Hand21JointPose {
  readonly handedness: Handedness;
  readonly palmWidthMm: number;
  readonly presetId: HandPresetId | "custom";
  readonly wristAngles: WristPoseAngles;
  readonly wristTranslationMm: Vec3;
  readonly fingerAngles: FingerPoseAngleMap;
  readonly joints: readonly HandJoint3D[];
  readonly jointMap: Readonly<Record<HandJointId, HandJoint3D>>;
  readonly capsules: readonly HandBoneCapsule[];
  readonly palmNormal: Vec3;
}

export type HandRomViolationKind =
  | "hyperextension"
  | "overflexion"
  | "abduction-limit"
  | "opposition-limit"
  | "wrist-limit";

export type HandRomJointField =
  | "mcpFlexDeg"
  | "mcpAbductDeg"
  | "pipFlexDeg"
  | "dipFlexDeg"
  | "oppositionDeg"
  | "wrist.flexionDeg"
  | "wrist.radialUlnarDeg"
  | "wrist.pronationDeg";

export interface HandRomViolation {
  readonly target: HandFingerId | "wrist";
  readonly field: HandRomJointField;
  readonly kind: HandRomViolationKind;
  readonly actualDeg: number;
  readonly minDeg: number;
  readonly maxDeg: number;
  readonly excessDeg: number;
  readonly clampedDeg: number;
  readonly messageKo: string;
}

export interface HandAnatomicalRomAudit {
  readonly passed: boolean;
  readonly violationCount: number;
  readonly hyperextensionCount: number;
  readonly overflexionCount: number;
  readonly maxExcessDeg: number;
  readonly violations: readonly HandRomViolation[];
  readonly clampedSpec: HandPoseSpec;
  readonly clampedPose: Hand21JointPose;
}

export interface HandPresetDefinition {
  readonly id: HandPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly wristAngles: WristPoseAngles;
  readonly fingers: FingerPoseAngleMap;
  readonly defaultProp?: GraspPropPrimitive;
}

export interface FingerAnatomyMetric {
  readonly baseOffsetMm: Vec3;
  readonly naturalSplayDeg: number;
  readonly abductSign: number;
  readonly lengthsMm: readonly [number, number, number];
  readonly radiiMm: readonly [number, number, number, number];
  readonly jointIds: readonly [HandJointId, HandJointId, HandJointId, HandJointId];
}

export const DEFAULT_PALM_WIDTH_MM = 84;

export const WRIST_ROM_LIMITS: WristRomLimitSpec = {
  flexion: { minDeg: -70, maxDeg: 80 },
  radialUlnar: { minDeg: -35, maxDeg: 25 },
  pronation: { minDeg: -90, maxDeg: 90 },
};

/** 5손가락 정본 해부학 관절 가동범위(ROM) 상수표 (PIP/DIP 역꺾임 < -5도, 과굴곡 > 115도 차단). */
export const HAND_FINGER_ROM_LIMITS: Readonly<Record<HandFingerId, FingerRomLimitSpec>> = {
  thumb: {
    mcpFlex: { minDeg: -15, maxDeg: 65 },
    mcpAbduct: { minDeg: -5, maxDeg: 65 },
    pipFlex: { minDeg: -5, maxDeg: 80 },
    dipFlex: { minDeg: -5, maxDeg: 90 },
    opposition: { minDeg: 0, maxDeg: 75 },
  },
  index: {
    mcpFlex: { minDeg: -25, maxDeg: 95 },
    mcpAbduct: { minDeg: -12, maxDeg: 28 },
    pipFlex: { minDeg: -5, maxDeg: 115 },
    dipFlex: { minDeg: -5, maxDeg: 90 },
    opposition: { minDeg: 0, maxDeg: 0 },
  },
  middle: {
    mcpFlex: { minDeg: -25, maxDeg: 95 },
    mcpAbduct: { minDeg: -14, maxDeg: 14 },
    pipFlex: { minDeg: -5, maxDeg: 115 },
    dipFlex: { minDeg: -5, maxDeg: 90 },
    opposition: { minDeg: 0, maxDeg: 0 },
  },
  ring: {
    mcpFlex: { minDeg: -25, maxDeg: 95 },
    mcpAbduct: { minDeg: -16, maxDeg: 18 },
    pipFlex: { minDeg: -5, maxDeg: 115 },
    dipFlex: { minDeg: -5, maxDeg: 90 },
    opposition: { minDeg: 0, maxDeg: 0 },
  },
  pinky: {
    mcpFlex: { minDeg: -25, maxDeg: 95 },
    mcpAbduct: { minDeg: -12, maxDeg: 30 },
    pipFlex: { minDeg: -5, maxDeg: 115 },
    dipFlex: { minDeg: -5, maxDeg: 90 },
    opposition: { minDeg: 0, maxDeg: 0 },
  },
};

/** 손바닥 너비 84mm 기준 우수(right) 표준 해부학 치수 (mm). */
export const FINGER_ANATOMY_METRICS: Readonly<Record<HandFingerId, FingerAnatomyMetric>> = {
  thumb: {
    baseOffsetMm: vec3(25, 28, 9),
    naturalSplayDeg: 24,
    abductSign: 1,
    lengthsMm: [43, 31, 24],
    radiiMm: [11.0, 10.0, 8.8, 7.8],
    jointIds: ["thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip"],
  },
  index: {
    baseOffsetMm: vec3(26, 88, 0),
    naturalSplayDeg: 4,
    abductSign: 1,
    lengthsMm: [41, 25, 18],
    radiiMm: [10.5, 8.4, 7.4, 6.6],
    jointIds: ["index_mcp", "index_pip", "index_dip", "index_tip"],
  },
  middle: {
    baseOffsetMm: vec3(4, 92, -1),
    naturalSplayDeg: 0,
    abductSign: 1,
    lengthsMm: [46, 29, 19],
    radiiMm: [10.5, 8.6, 7.6, 6.8],
    jointIds: ["middle_mcp", "middle_pip", "middle_dip", "middle_tip"],
  },
  ring: {
    baseOffsetMm: vec3(-18, 87, -2),
    naturalSplayDeg: -4,
    abductSign: -1,
    lengthsMm: [42, 27, 18],
    radiiMm: [10.0, 8.2, 7.2, 6.4],
    jointIds: ["ring_mcp", "ring_pip", "ring_dip", "ring_tip"],
  },
  pinky: {
    baseOffsetMm: vec3(-38, 78, -4),
    naturalSplayDeg: -8,
    abductSign: -1,
    lengthsMm: [33, 20, 16],
    radiiMm: [9.2, 7.2, 6.4, 5.8],
    jointIds: ["pinky_mcp", "pinky_pip", "pinky_dip", "pinky_tip"],
  },
};

export const FINGER_NAME_KO: Readonly<Record<HandFingerId, string>> = {
  thumb: "엄지",
  index: "검지",
  middle: "중지",
  ring: "약지",
  pinky: "소지",
};

/** 웹툰 실무 6종 손 포즈 프리셋 정본 카탈로그. */
export const HAND_POSE_PRESETS: Readonly<Record<HandPresetId, HandPresetDefinition>> = {
  "open-palm": {
    id: "open-palm",
    labelKo: "편 손",
    descriptionKo: "다섯 손가락을 자연스럽게 편 기준 해부학 포즈",
    wristAngles: { flexionDeg: 0, radialUlnarDeg: 0, pronationDeg: 0 },
    fingers: {
      thumb: { mcpFlexDeg: 6, mcpAbductDeg: 32, pipFlexDeg: 6, dipFlexDeg: 4, oppositionDeg: 10 },
      index: { mcpFlexDeg: 6, mcpAbductDeg: 10, pipFlexDeg: 8, dipFlexDeg: 5 },
      middle: { mcpFlexDeg: 4, mcpAbductDeg: 0, pipFlexDeg: 7, dipFlexDeg: 4 },
      ring: { mcpFlexDeg: 7, mcpAbductDeg: 8, pipFlexDeg: 9, dipFlexDeg: 6 },
      pinky: { mcpFlexDeg: 9, mcpAbductDeg: 14, pipFlexDeg: 11, dipFlexDeg: 7 },
    },
  },
  "clenched-fist": {
    id: "clenched-fist",
    labelKo: "주먹",
    descriptionKo: "액션 타격 컷용 밀착 주먹 포즈",
    wristAngles: { flexionDeg: 4, radialUlnarDeg: 0, pronationDeg: 0 },
    fingers: {
      thumb: { mcpFlexDeg: 22, mcpAbductDeg: 26, pipFlexDeg: 32, dipFlexDeg: 38, oppositionDeg: 58 },
      index: { mcpFlexDeg: 78, mcpAbductDeg: 4, pipFlexDeg: 92, dipFlexDeg: 62 },
      middle: { mcpFlexDeg: 82, mcpAbductDeg: 0, pipFlexDeg: 94, dipFlexDeg: 64 },
      ring: { mcpFlexDeg: 80, mcpAbductDeg: 4, pipFlexDeg: 92, dipFlexDeg: 64 },
      pinky: { mcpFlexDeg: 76, mcpAbductDeg: 8, pipFlexDeg: 88, dipFlexDeg: 60 },
    },
  },
  "sword-hilt-grip": {
    id: "sword-hilt-grip",
    labelKo: "검 자루 파지",
    descriptionKo: "원통형 검 자루를 감싸 쥔 무협·액션 파지 포즈",
    wristAngles: { flexionDeg: 0, radialUlnarDeg: -8, pronationDeg: 0 },
    fingers: {
      thumb: { mcpFlexDeg: 14, mcpAbductDeg: 32, pipFlexDeg: 18, dipFlexDeg: 22, oppositionDeg: 46 },
      index: { mcpFlexDeg: 36, mcpAbductDeg: 6, pipFlexDeg: 46, dipFlexDeg: 34 },
      middle: { mcpFlexDeg: 38, mcpAbductDeg: 0, pipFlexDeg: 50, dipFlexDeg: 36 },
      ring: { mcpFlexDeg: 38, mcpAbductDeg: 6, pipFlexDeg: 48, dipFlexDeg: 34 },
      pinky: { mcpFlexDeg: 34, mcpAbductDeg: 10, pipFlexDeg: 42, dipFlexDeg: 30 },
    },
    defaultProp: {
      id: "prop-katana-hilt",
      labelKo: "검 자루(원통)",
      kind: "cylinder",
      centerMm: vec3(0, 74, 34),
      radiusMm: 16,
      lengthMm: 150,
      axis: vec3(1, 0, 0),
    },
  },
  "smartphone-hold": {
    id: "smartphone-hold",
    labelKo: "스마트폰 파지",
    descriptionKo: "직육면체 스마트폰을 한 손으로 받쳐 든 현대극 포즈",
    wristAngles: { flexionDeg: 4, radialUlnarDeg: 2, pronationDeg: 0 },
    fingers: {
      thumb: { mcpFlexDeg: 12, mcpAbductDeg: 34, pipFlexDeg: 16, dipFlexDeg: 14, oppositionDeg: 42 },
      index: { mcpFlexDeg: 14, mcpAbductDeg: 12, pipFlexDeg: 16, dipFlexDeg: 12 },
      middle: { mcpFlexDeg: 16, mcpAbductDeg: 0, pipFlexDeg: 18, dipFlexDeg: 14 },
      ring: { mcpFlexDeg: 18, mcpAbductDeg: 10, pipFlexDeg: 20, dipFlexDeg: 14 },
      pinky: { mcpFlexDeg: 22, mcpAbductDeg: 16, pipFlexDeg: 24, dipFlexDeg: 16 },
    },
    defaultProp: {
      id: "prop-smartphone",
      labelKo: "스마트폰(직육면체)",
      kind: "box",
      centerMm: vec3(0, 88, 42),
      sizeMm: vec3(72, 146, 9),
    },
  },
  "teacup-pinch": {
    id: "teacup-pinch",
    labelKo: "찻잔 집기",
    descriptionKo: "엄지와 검지로 찻잔을 우아하게 집은 로맨스판타지 포즈",
    wristAngles: { flexionDeg: -8, radialUlnarDeg: 4, pronationDeg: 0 },
    fingers: {
      thumb: { mcpFlexDeg: 18, mcpAbductDeg: 28, pipFlexDeg: 16, dipFlexDeg: 16, oppositionDeg: 52 },
      index: { mcpFlexDeg: 32, mcpAbductDeg: 8, pipFlexDeg: 36, dipFlexDeg: 26 },
      middle: { mcpFlexDeg: 24, mcpAbductDeg: 2, pipFlexDeg: 30, dipFlexDeg: 18 },
      ring: { mcpFlexDeg: 18, mcpAbductDeg: 10, pipFlexDeg: 22, dipFlexDeg: 14 },
      pinky: { mcpFlexDeg: 12, mcpAbductDeg: 18, pipFlexDeg: 14, dipFlexDeg: 10 },
    },
    defaultProp: {
      id: "prop-porcelain-teacup",
      labelKo: "도자기 찻잔(구형 손잡이)",
      kind: "sphere",
      centerMm: vec3(32, 126, 62),
      radiusMm: 16,
    },
  },
  "pointing-accusation": {
    id: "pointing-accusation",
    labelKo: "삿대질",
    descriptionKo: "검지를 곧게 뻗고 나머지 손가락을 말아 쥔 법정·드라마 포즈",
    wristAngles: { flexionDeg: -4, radialUlnarDeg: 4, pronationDeg: 0 },
    fingers: {
      thumb: { mcpFlexDeg: 16, mcpAbductDeg: 24, pipFlexDeg: 20, dipFlexDeg: 22, oppositionDeg: 48 },
      index: { mcpFlexDeg: 4, mcpAbductDeg: 10, pipFlexDeg: 4, dipFlexDeg: 2 },
      middle: { mcpFlexDeg: 78, mcpAbductDeg: 0, pipFlexDeg: 92, dipFlexDeg: 64 },
      ring: { mcpFlexDeg: 80, mcpAbductDeg: 6, pipFlexDeg: 92, dipFlexDeg: 64 },
      pinky: { mcpFlexDeg: 76, mcpAbductDeg: 12, pipFlexDeg: 88, dipFlexDeg: 60 },
    },
  },
};

/** 프리셋 ID와 좌/우 손잡이 기준으로 기본 HandPoseSpec을 반환한다. */
export function createHandPresetSpec(
  presetId: HandPresetId,
  handedness: Handedness = "right",
  palmWidthMm: number = DEFAULT_PALM_WIDTH_MM,
): HandPoseSpec {
  const preset = HAND_POSE_PRESETS[presetId];
  return {
    handedness,
    palmWidthMm,
    presetId,
    wristAngles: { ...preset.wristAngles },
    wristTranslationMm: vec3(0, 0, 0),
    fingers: {
      thumb: { ...preset.fingers.thumb },
      index: { ...preset.fingers.index },
      middle: { ...preset.fingers.middle },
      ring: { ...preset.fingers.ring },
      pinky: { ...preset.fingers.pinky },
    },
  };
}

/** 좌수용 기본 소품 좌표(X 대칭)까지 맞춰 프리셋 기본 소품을 반환한다. */
export function getPresetDefaultProp(
  presetId: HandPresetId,
  handedness: Handedness = "right",
): GraspPropPrimitive | null {
  const prop = HAND_POSE_PRESETS[presetId].defaultProp;
  if (!prop) {
    return null;
  }
  if (handedness === "right") {
    return prop;
  }
  const mirroredCenter = vec3(-prop.centerMm.x, prop.centerMm.y, prop.centerMm.z);
  if (prop.kind === "cylinder") {
    const axis = prop.axis ? vec3(-prop.axis.x, prop.axis.y, prop.axis.z) : undefined;
    return { ...prop, centerMm: mirroredCenter, axis };
  }
  return { ...prop, centerMm: mirroredCenter };
}
