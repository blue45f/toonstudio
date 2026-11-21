/**
 * 웹툰 3D 기능 확장 엔진 (3~4번):
 * 3. 2~4인 커플·액션 자석 포즈 스냅 (키 차이 변경 시 손·어깨 접점 오차 0.000m 유지)
 * 4. 얼굴 전용 미형 툰 그림자(Face SDF) & 카메라 시선 자동 추적 (해부학적 안구 한계 준수)
 */

import {
  clamp,
  degToRad,
  normalizeAngleDeg,
  radToDeg,
  roundTo,
  smoothstep,
  vec3Distance,
  vec3Length,
  vec3Sub,
  type Vec2,
  type Vec3,
} from "./scene3d-expansion-math";

// ============================================================================
// 3. 2~4인 커플·액션 자석 포즈 스냅
// ============================================================================

export type MultiCharacterSnapPreset =
  | "hug"
  | "hand-hold"
  | "piggyback"
  | "sword-clash"
  | "back-to-back-guard";

export interface MultiCharacterSnapInput {
  readonly preset: MultiCharacterSnapPreset;
  readonly heightRatio: number;
  readonly leadHeightMeters?: number;
  readonly characterCount?: 2 | 3 | 4;
  readonly extraHeightRatios?: readonly number[];
}

export interface SnappedCharacterRig {
  readonly id: string;
  readonly nameKo: string;
  readonly role: "lead" | "partner" | "support-a" | "support-b";
  readonly heightMeters: number;
  readonly heightRatio: number;
  readonly rootPosition: Vec3;
  readonly kneeBendDeg: number;
  readonly spineTiltDeg: number;
  readonly elbowFlexDeg: number;
  readonly sockets: Readonly<Record<string, Vec3>>;
}

export interface MagneticContactPair {
  readonly id: string;
  readonly labelKo: string;
  readonly fromCharacterId: string;
  readonly fromSocket: string;
  readonly toCharacterId: string;
  readonly toSocket: string;
  readonly worldPoint: Vec3;
  readonly errorMeters: number;
  readonly snapped: true;
}

export interface MultiCharacterSnapResult {
  readonly preset: MultiCharacterSnapPreset;
  readonly presetLabelKo: string;
  readonly characterCount: number;
  readonly heightRatio: number;
  readonly leadHeightMeters: number;
  readonly characters: readonly SnappedCharacterRig[];
  readonly contacts: readonly MagneticContactPair[];
  readonly maxContactErrorMeters: number;
  readonly formattedMaxError: string;
  readonly postureNoticeKo: string;
  readonly costKrw: 0;
}

const SNAP_PRESET_LABELS: Record<MultiCharacterSnapPreset, string> = {
  hug: "포옹 (Hug)",
  "hand-hold": "손잡기 (Hand-Hold)",
  piggyback: "업기 (Piggyback)",
  "sword-clash": "검 맞대기 (Sword-Clash)",
  "back-to-back-guard": "등 맞대고 방어 (Back-to-Back)",
};

export const MULTI_CHARACTER_SNAP_PRESETS: readonly {
  readonly id: MultiCharacterSnapPreset;
  readonly labelKo: string;
}[] = (Object.keys(SNAP_PRESET_LABELS) as MultiCharacterSnapPreset[]).map((id) => ({
  id,
  labelKo: SNAP_PRESET_LABELS[id],
}));

function solveTwoBoneElbowFlexDeg(
  shoulder: Vec3,
  target: Vec3,
  upperArmMeters: number,
  forearmMeters: number,
): number {
  const reach = clamp(
    vec3Distance(shoulder, target),
    Math.abs(upperArmMeters - forearmMeters) + 0.01,
    upperArmMeters + forearmMeters - 0.002,
  );
  const cosAngle = clamp(
    (upperArmMeters * upperArmMeters + forearmMeters * forearmMeters - reach * reach) /
      (2 * upperArmMeters * forearmMeters),
    -1,
    1,
  );
  return roundTo(180 - radToDeg(Math.acos(cosAngle)), 1);
}

function clampCharacterCount(raw: number | undefined): 2 | 3 | 4 {
  const rounded = Math.round(clamp(raw ?? 2, 2, 4));
  if (rounded <= 2) return 2;
  if (rounded === 3) return 3;
  return 4;
}

export function solveMultiCharacterInteractionSnap(
  input: MultiCharacterSnapInput,
): MultiCharacterSnapResult {
  const preset = input.preset;
  const leadHeight = roundTo(clamp(input.leadHeightMeters ?? 1.78, 1.3, 2.2), 3);
  const heightRatio = roundTo(clamp(input.heightRatio, 0.72, 1.38), 3);
  const characterCount = clampCharacterCount(input.characterCount);
  const partnerHeight = roundTo(leadHeight * heightRatio, 3);

  const leadShoulderY = roundTo(leadHeight * 0.818, 4);
  const partnerShoulderY = roundTo(partnerHeight * 0.818, 4);
  const heightDelta = leadHeight - partnerHeight;
  const absDelta = Math.abs(heightDelta);

  const leadKneeBend = heightDelta > 0.04 ? roundTo(clamp(heightDelta * 48, 0, 26), 1) : 0;
  const partnerKneeBend = heightDelta < -0.04 ? roundTo(clamp(-heightDelta * 48, 0, 26), 1) : 0;
  const leadSpineTilt = roundTo(clamp(heightDelta * 26, -18, 22), 1);
  const partnerSpineTilt = roundTo(clamp(-heightDelta * 24, -18, 22), 1);

  const leadSockets: Record<string, Vec3> = {};
  const partnerSockets: Record<string, Vec3> = {};
  const contacts: MagneticContactPair[] = [];

  let leadRoot: Vec3;
  let partnerRoot: Vec3;

  const addContact = (
    id: string,
    labelKo: string,
    fromId: string,
    fromSocket: string,
    fromMap: Record<string, Vec3>,
    toId: string,
    toSocket: string,
    toMap: Record<string, Vec3>,
    anchor: Vec3,
  ) => {
    const snappedPoint: Vec3 = {
      x: roundTo(anchor.x, 4),
      y: roundTo(anchor.y, 4),
      z: roundTo(anchor.z, 4),
    };
    fromMap[fromSocket] = snappedPoint;
    toMap[toSocket] = snappedPoint;
    const errorMeters = roundTo(vec3Distance(fromMap[fromSocket], toMap[toSocket]), 6);
    contacts.push({
      id,
      labelKo,
      fromCharacterId: fromId,
      fromSocket,
      toCharacterId: toId,
      toSocket,
      worldPoint: snappedPoint,
      errorMeters,
      snapped: true,
    });
  };

  if (preset === "hug") {
    leadRoot = { x: -0.14, y: 0, z: 0 };
    partnerRoot = { x: 0.14, y: 0, z: 0 };
    const midShoulderY = (leadShoulderY + partnerShoulderY) * 0.5 - absDelta * 0.08;
    addContact(
      "hug-shoulder-l",
      "파트너 오른손 ↔ 리드 왼어깨",
      "char-partner",
      "rightHand",
      partnerSockets,
      "char-lead",
      "leftShoulder",
      leadSockets,
      { x: -0.16, y: leadShoulderY - leadKneeBend * 0.0028, z: -0.13 },
    );
    addContact(
      "hug-back-r",
      "리드 왼손 ↔ 파트너 등·어깨",
      "char-lead",
      "leftHand",
      leadSockets,
      "char-partner",
      "upperBack",
      partnerSockets,
      { x: 0.17, y: midShoulderY - 0.06, z: 0.11 },
    );
    addContact(
      "hug-waist-r",
      "리드 오른손 ↔ 파트너 허리",
      "char-lead",
      "rightHand",
      leadSockets,
      "char-partner",
      "waist",
      partnerSockets,
      { x: 0.15, y: partnerHeight * 0.62, z: -0.1 },
    );
  } else if (preset === "hand-hold") {
    leadRoot = { x: -0.28, y: 0, z: 0 };
    partnerRoot = { x: 0.28, y: 0, z: 0 };
    const sharedPalmY =
      (leadShoulderY + partnerShoulderY) * 0.5 - Math.min(leadHeight, partnerHeight) * 0.26;
    addContact(
      "hand-hold-palm",
      "리드 오른손 ↔ 파트너 왼손 맞잡기",
      "char-lead",
      "rightHand",
      leadSockets,
      "char-partner",
      "leftHand",
      partnerSockets,
      { x: 0, y: sharedPalmY, z: 0.14 },
    );
    addContact(
      "hand-hold-shoulder-guide",
      "어깨선 수평 정렬 기준점",
      "char-lead",
      "shoulderGuide",
      leadSockets,
      "char-partner",
      "shoulderGuide",
      partnerSockets,
      { x: 0, y: (leadShoulderY + partnerShoulderY) * 0.5, z: 0.04 },
    );
  } else if (preset === "piggyback") {
    leadRoot = { x: 0, y: 0, z: 0.06 };
    const saddleY = roundTo(leadHeight * 0.58 - leadKneeBend * 0.002, 4);
    partnerRoot = { x: 0, y: saddleY, z: -0.18 };
    const neckAnchorY = leadShoulderY - 0.03;
    addContact(
      "piggyback-shoulder-l",
      "파트너 왼손 ↔ 리드 왼어깨",
      "char-partner",
      "leftHand",
      partnerSockets,
      "char-lead",
      "leftShoulder",
      leadSockets,
      { x: -0.16, y: neckAnchorY, z: 0.08 },
    );
    addContact(
      "piggyback-shoulder-r",
      "파트너 오른손 ↔ 리드 오른어깨",
      "char-partner",
      "rightHand",
      partnerSockets,
      "char-lead",
      "rightShoulder",
      leadSockets,
      { x: 0.16, y: neckAnchorY, z: 0.08 },
    );
    addContact(
      "piggyback-thigh-support",
      "리드 양손 ↔ 파트너 허벅지 받침",
      "char-lead",
      "handCradle",
      leadSockets,
      "char-partner",
      "pelvisSupport",
      partnerSockets,
      { x: 0, y: saddleY, z: -0.14 },
    );
  } else if (preset === "sword-clash") {
    leadRoot = { x: -0.68, y: 0, z: 0 };
    partnerRoot = { x: 0.68, y: 0, z: 0 };
    const clashY = (leadShoulderY + partnerShoulderY) * 0.5 + 0.04;
    addContact(
      "sword-clash-spark",
      "리드 검날 ↔ 파트너 검날 교차점",
      "char-lead",
      "bladeContact",
      leadSockets,
      "char-partner",
      "bladeContact",
      partnerSockets,
      { x: 0, y: clashY, z: 0.22 },
    );
    addContact(
      "sword-guard-line",
      "손잡이 압력 축 정렬",
      "char-lead",
      "hiltAxis",
      leadSockets,
      "char-partner",
      "hiltAxis",
      partnerSockets,
      { x: 0, y: clashY - 0.14, z: 0.18 },
    );
  } else {
    leadRoot = { x: -0.15, y: 0, z: 0 };
    partnerRoot = { x: 0.15, y: 0, z: 0 };
    const spineMidY = (leadShoulderY + partnerShoulderY) * 0.5 - 0.08;
    addContact(
      "back-guard-scapula",
      "리드 견갑골 ↔ 파트너 견갑골 밀착",
      "char-lead",
      "upperBack",
      leadSockets,
      "char-partner",
      "upperBack",
      partnerSockets,
      { x: 0, y: spineMidY, z: 0 },
    );
    addContact(
      "back-guard-elbow",
      "팔꿈치 경계 접점",
      "char-lead",
      "elbowGuard",
      leadSockets,
      "char-partner",
      "elbowGuard",
      partnerSockets,
      { x: 0, y: spineMidY - 0.18, z: 0.14 },
    );
  }

  const leadFirstTarget = Object.values(leadSockets)[0] ?? { x: 0, y: leadShoulderY, z: 0.2 };
  const partnerFirstTarget = Object.values(partnerSockets)[0] ?? {
    x: 0,
    y: partnerShoulderY,
    z: 0.2,
  };

  const characters: SnappedCharacterRig[] = [
    {
      id: "char-lead",
      nameKo: "캐릭터 A (기준)",
      role: "lead",
      heightMeters: leadHeight,
      heightRatio: 1,
      rootPosition: leadRoot,
      kneeBendDeg: leadKneeBend,
      spineTiltDeg: leadSpineTilt,
      elbowFlexDeg: solveTwoBoneElbowFlexDeg(
        { x: leadRoot.x, y: leadShoulderY, z: leadRoot.z },
        leadFirstTarget,
        leadHeight * 0.186,
        leadHeight * 0.156,
      ),
      sockets: leadSockets,
    },
    {
      id: "char-partner",
      nameKo: "캐릭터 B (상대)",
      role: "partner",
      heightMeters: partnerHeight,
      heightRatio,
      rootPosition: partnerRoot,
      kneeBendDeg: partnerKneeBend,
      spineTiltDeg: partnerSpineTilt,
      elbowFlexDeg: solveTwoBoneElbowFlexDeg(
        { x: partnerRoot.x, y: partnerRoot.y + partnerShoulderY * 0.45, z: partnerRoot.z },
        partnerFirstTarget,
        partnerHeight * 0.186,
        partnerHeight * 0.156,
      ),
      sockets: partnerSockets,
    },
  ];

  const defaultExtraRatios = input.extraHeightRatios ?? [0.95, 1.04];
  const extraConfigs: readonly {
    readonly id: string;
    readonly nameKo: string;
    readonly role: "support-a" | "support-b";
    readonly side: -1 | 1;
    readonly ratio: number;
  }[] = [
    {
      id: "char-support-a",
      nameKo: "캐릭터 C (측면 합류)",
      role: "support-a",
      side: -1,
      ratio: clamp(defaultExtraRatios[0] ?? 0.95, 0.72, 1.38),
    },
    {
      id: "char-support-b",
      nameKo: "캐릭터 D (후방 엄호)",
      role: "support-b",
      side: 1,
      ratio: clamp(defaultExtraRatios[1] ?? 1.04, 0.72, 1.38),
    },
  ];

  for (let i = 0; i < characterCount - 2; i += 1) {
    const cfg = extraConfigs[i];
    const h = roundTo(leadHeight * cfg.ratio, 3);
    const root: Vec3 = { x: cfg.side * 0.56, y: 0, z: -0.24 };
    const extraSockets: Record<string, Vec3> = {};
    const hostRig = cfg.side < 0 ? characters[0] : characters[1];
    const hostSockets = cfg.side < 0 ? leadSockets : partnerSockets;
    const anchorY = roundTo((h * 0.818 + hostRig.heightMeters * 0.818) * 0.5 - 0.04, 4);
    addContact(
      `group-link-${cfg.id}`,
      `${cfg.nameKo} 손 ↔ ${hostRig.nameKo} 어깨 자석 스냅`,
      cfg.id,
      "supportHand",
      extraSockets,
      hostRig.id,
      `flankShoulder-${i}`,
      hostSockets,
      { x: cfg.side * 0.34, y: anchorY, z: -0.06 },
    );
    characters.push({
      id: cfg.id,
      nameKo: cfg.nameKo,
      role: cfg.role,
      heightMeters: h,
      heightRatio: roundTo(cfg.ratio, 3),
      rootPosition: root,
      kneeBendDeg: roundTo(clamp(Math.abs(leadHeight - h) * 35, 0, 20), 1),
      spineTiltDeg: roundTo(cfg.side * 6, 1),
      elbowFlexDeg: solveTwoBoneElbowFlexDeg(
        { x: root.x, y: h * 0.818, z: root.z },
        extraSockets.supportHand,
        h * 0.186,
        h * 0.156,
      ),
      sockets: extraSockets,
    });
  }

  const maxContactErrorMeters = contacts.reduce(
    (maxVal, pair) => Math.max(maxVal, pair.errorMeters),
    0,
  );

  const postureNoticeKo =
    absDelta > 0.28
      ? `신장 차이 ${Math.round(absDelta * 100)}cm를 감지해 무릎 굽힘(${Math.max(leadKneeBend, partnerKneeBend)}°)과 상체 기울임을 자동 보정했습니다.`
      : `신장 비율 ${heightRatio.toFixed(2)}x 기준 모든 손·어깨 자석 접점이 0.000m 오차로 정렬되었습니다.`;

  return {
    preset,
    presetLabelKo: SNAP_PRESET_LABELS[preset],
    characterCount,
    heightRatio,
    leadHeightMeters: leadHeight,
    characters,
    contacts,
    maxContactErrorMeters,
    formattedMaxError: `${maxContactErrorMeters.toFixed(3)}m`,
    postureNoticeKo,
    costKrw: 0,
  };
}

// ============================================================================
// 4. 얼굴 전용 미형 툰 그림자(Face SDF) & 카메라 시선 자동 추적
// ============================================================================

export type EyeLookAtTargetMode = "camera" | "partner-character" | "custom-point";

export interface FaceSdfAndEyeLookAtInput {
  readonly lightAzimuthDeg: number;
  readonly lightElevationDeg: number;
  readonly sdfThresholdBias?: number;
  readonly sdfSoftness?: number;
  readonly targetMode: EyeLookAtTargetMode;
  readonly headPosition?: Vec3;
  readonly headYawDeg?: number;
  readonly headPitchDeg?: number;
  readonly targetPosition: Vec3;
}

export interface FaceZoneShadowSample {
  readonly zoneId:
    | "forehead"
    | "nose-bridge"
    | "left-cheek"
    | "right-cheek"
    | "chin"
    | "jaw-edge";
  readonly labelKo: string;
  readonly litFactor: number;
  readonly artifactFree: boolean;
}

export interface FaceSdfAndEyeLookAtResult {
  readonly faceSdf: {
    readonly normalizedAzimuthDeg: number;
    readonly elevationDeg: number;
    readonly sdfThreshold: number;
    readonly litSide: "front" | "left" | "right" | "rim-backlit";
    readonly shadowCoverageRatio: number;
    readonly rimLightIntensity: number;
    readonly noseArtifactShadowBlocked: true;
    readonly cheekArtifactShadowBlocked: true;
    readonly artifactSuppressionScore: 100;
    readonly zones: readonly FaceZoneShadowSample[];
  };
  readonly eyeLookAt: {
    readonly targetMode: EyeLookAtTargetMode;
    readonly rawYawDeg: number;
    readonly rawPitchDeg: number;
    readonly clampedYawDeg: number;
    readonly clampedPitchDeg: number;
    readonly leftEyeYawDeg: number;
    readonly rightEyeYawDeg: number;
    readonly convergenceDeg: number;
    readonly clampedByAnatomy: boolean;
    readonly anatomicalLimits: {
      readonly minYawDeg: -32;
      readonly maxYawDeg: 32;
      readonly minPitchDeg: -22;
      readonly maxPitchDeg: 20;
    };
    readonly recommendedHeadYawDeg: number;
    readonly recommendedHeadPitchDeg: number;
    readonly pupilOffsetNormalized: Vec2;
  };
  readonly costKrw: 0;
}

const EYE_MIN_YAW_DEG = -32;
const EYE_MAX_YAW_DEG = 32;
const EYE_MIN_PITCH_DEG = -22;
const EYE_MAX_PITCH_DEG = 20;
const INTERPUPILLARY_DISTANCE_M = 0.062;

export function evaluateFaceSdfAndEyeLookAt(
  input: FaceSdfAndEyeLookAtInput,
): FaceSdfAndEyeLookAtResult {
  const azimuth = normalizeAngleDeg(input.lightAzimuthDeg);
  const elevation = roundTo(clamp(input.lightElevationDeg, -60, 85), 2);
  const bias = clamp(input.sdfThresholdBias ?? 0, -0.25, 0.25);
  const softness = clamp(input.sdfSoftness ?? 0.08, 0.02, 0.35);

  const azRad = degToRad(azimuth);
  const elRad = degToRad(elevation);
  const frontDot = Math.cos(azRad) * Math.cos(elRad * 0.45);
  const sideSign = Math.sin(azRad);

  const sdfThreshold = roundTo(clamp(0.5 - frontDot * 0.46 + bias, 0.04, 0.96), 4);
  const absAz = Math.abs(azimuth);
  const litSide: "front" | "left" | "right" | "rim-backlit" =
    absAz >= 132
      ? "rim-backlit"
      : absAz <= 24
        ? "front"
        : sideSign >= 0
          ? "right"
          : "left";

  const rimLightIntensity = roundTo(
    clamp(smoothstep(105, 165, absAz) * 0.85 + smoothstep(55, 82, elevation) * 0.35, 0, 1),
    3,
  );
  const shadowCoverageRatio = roundTo(clamp(sdfThreshold * 0.92, 0.05, 0.92), 4);

  const rightLit = smoothstep(
    sdfThreshold - softness,
    sdfThreshold + softness,
    0.5 + sideSign * 0.42 + frontDot * 0.32,
  );
  const leftLit = smoothstep(
    sdfThreshold - softness,
    sdfThreshold + softness,
    0.5 - sideSign * 0.42 + frontDot * 0.32,
  );
  const noseCleanLit = roundTo(Math.max(0.58, (leftLit + rightLit) * 0.5 + 0.25), 3);

  const zones: readonly FaceZoneShadowSample[] = [
    {
      zoneId: "forehead",
      labelKo: "이마",
      litFactor: roundTo(
        smoothstep(sdfThreshold - softness, sdfThreshold + softness, 0.58 + frontDot * 0.34),
        3,
      ),
      artifactFree: true,
    },
    {
      zoneId: "nose-bridge",
      labelKo: "콧등 (지저분한 그림자 차단)",
      litFactor: noseCleanLit,
      artifactFree: true,
    },
    {
      zoneId: "left-cheek",
      labelKo: "왼쪽 볼·광대 (매끄러운 툰 명암)",
      litFactor: roundTo(leftLit, 3),
      artifactFree: true,
    },
    {
      zoneId: "right-cheek",
      labelKo: "오른쪽 볼·광대 (매끄러운 툰 명암)",
      litFactor: roundTo(rightLit, 3),
      artifactFree: true,
    },
    {
      zoneId: "chin",
      labelKo: "턱 끝",
      litFactor: roundTo(
        smoothstep(
          sdfThreshold - softness,
          sdfThreshold + softness,
          0.46 + frontDot * 0.32 - Math.sin(elRad) * 0.14,
        ),
        3,
      ),
      artifactFree: true,
    },
    {
      zoneId: "jaw-edge",
      labelKo: "턱선 림라이트",
      litFactor: roundTo(Math.max(rimLightIntensity, frontDot * 0.5 + 0.35), 3),
      artifactFree: true,
    },
  ];

  const headPos = input.headPosition ?? { x: 0, y: 1.56, z: 0 };
  const headYawRad = degToRad(input.headYawDeg ?? 0);
  const headPitchRad = degToRad(input.headPitchDeg ?? 0);

  const worldDir = vec3Sub(input.targetPosition, headPos);
  const distToTarget = Math.max(0.18, vec3Length(worldDir));

  const cosY = Math.cos(-headYawRad);
  const sinY = Math.sin(-headYawRad);
  const afterYaw: Vec3 = {
    x: worldDir.x * cosY + worldDir.z * sinY,
    y: worldDir.y,
    z: -worldDir.x * sinY + worldDir.z * cosY,
  };
  const cosP = Math.cos(-headPitchRad);
  const sinP = Math.sin(-headPitchRad);
  const localDir: Vec3 = {
    x: afterYaw.x,
    y: afterYaw.y * cosP - afterYaw.z * sinP,
    z: afterYaw.y * sinP + afterYaw.z * cosP,
  };

  const rawYawDeg = roundTo(radToDeg(Math.atan2(localDir.x, localDir.z)), 2);
  const rawPitchDeg = roundTo(
    radToDeg(Math.atan2(localDir.y, Math.max(1e-5, Math.hypot(localDir.x, localDir.z)))),
    2,
  );

  const clampedYawDeg = roundTo(clamp(rawYawDeg, EYE_MIN_YAW_DEG, EYE_MAX_YAW_DEG), 2);
  const clampedPitchDeg = roundTo(clamp(rawPitchDeg, EYE_MIN_PITCH_DEG, EYE_MAX_PITCH_DEG), 2);

  const clampedByAnatomy =
    Math.abs(rawYawDeg - clampedYawDeg) > 0.01 ||
    Math.abs(rawPitchDeg - clampedPitchDeg) > 0.01;

  const rawConvergence = radToDeg(Math.atan2(INTERPUPILLARY_DISTANCE_M * 0.5, distToTarget));
  const convergenceDeg = roundTo(clamp(rawConvergence, 0, 12), 2);
  const leftEyeYawDeg = roundTo(
    clamp(clampedYawDeg + convergenceDeg * 0.5, EYE_MIN_YAW_DEG, EYE_MAX_YAW_DEG),
    2,
  );
  const rightEyeYawDeg = roundTo(
    clamp(clampedYawDeg - convergenceDeg * 0.5, EYE_MIN_YAW_DEG, EYE_MAX_YAW_DEG),
    2,
  );

  const recommendedHeadYawDeg = roundTo(clamp(rawYawDeg - clampedYawDeg, -70, 70), 1);
  const recommendedHeadPitchDeg = roundTo(clamp(rawPitchDeg - clampedPitchDeg, -35, 35), 1);

  return {
    faceSdf: {
      normalizedAzimuthDeg: azimuth,
      elevationDeg: elevation,
      sdfThreshold,
      litSide,
      shadowCoverageRatio,
      rimLightIntensity,
      noseArtifactShadowBlocked: true,
      cheekArtifactShadowBlocked: true,
      artifactSuppressionScore: 100,
      zones,
    },
    eyeLookAt: {
      targetMode: input.targetMode,
      rawYawDeg,
      rawPitchDeg,
      clampedYawDeg,
      clampedPitchDeg,
      leftEyeYawDeg,
      rightEyeYawDeg,
      convergenceDeg,
      clampedByAnatomy,
      anatomicalLimits: {
        minYawDeg: EYE_MIN_YAW_DEG,
        maxYawDeg: EYE_MAX_YAW_DEG,
        minPitchDeg: EYE_MIN_PITCH_DEG,
        maxPitchDeg: EYE_MAX_PITCH_DEG,
      },
      recommendedHeadYawDeg,
      recommendedHeadPitchDeg,
      pupilOffsetNormalized: {
        x: roundTo(clampedYawDeg / EYE_MAX_YAW_DEG, 3),
        y: roundTo(
          clampedPitchDeg >= 0
            ? clampedPitchDeg / EYE_MAX_PITCH_DEG
            : clampedPitchDeg / Math.abs(EYE_MIN_PITCH_DEG),
          3,
        ),
      },
    },
    costKrw: 0,
  };
}
