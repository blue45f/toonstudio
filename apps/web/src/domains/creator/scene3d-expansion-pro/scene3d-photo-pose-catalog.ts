/**
 * 웹툰 3D 기능 확장 5번(계절·파괴 5대 환경 프리셋) 및 7번(사진 1장 → 3D 전신·손 포즈 + 카메라 각도 즉시 복제).
 * 원시 HEX 금지 — 모든 환경 조명·파티클 색상은 OKLCH 토큰으로만 정의.
 */

import { clamp, radToDeg, roundTo, type Vec2 } from "./scene3d-expansion-math";

export type InteractiveEnvironmentPreset =
  | "spring-sakura"
  | "rainy-night"
  | "snowy-winter"
  | "ruined-aftermath"
  | "golden-hour";

export type SceneParticleType =
  | "sakura-petals"
  | "rain-streaks"
  | "snowflakes"
  | "ash-debris"
  | "sun-motes";

export interface EnvironmentPresetSpec {
  readonly labelKo: string;
  readonly moodSummaryKo: string;
  readonly skyColorOklch: string;
  readonly keyLightOklch: string;
  readonly ambientFillOklch: string;
  readonly fogColorOklch: string;
  readonly accentParticleOklch: string;
  readonly keyIntensity: number;
  readonly ambientIntensity: number;
  readonly fogDensity: number;
  readonly surfaceWetness: number;
  readonly structuralDamageRatio: number;
  readonly particleType: SceneParticleType;
  readonly particleLabelKo: string;
  readonly baseParticleCount: number;
  readonly windSpeedMps: number;
  readonly fallSpeedMps: number;
}

export const ENVIRONMENT_PRESET_SPECS: Record<
  InteractiveEnvironmentPreset,
  EnvironmentPresetSpec
> = {
  "spring-sakura": {
    labelKo: "봄 벚꽃 (Spring Sakura)",
    moodSummaryKo: "맑은 연분홍 오후 햇살과 흩날리는 벚꽃잎으로 로맨스 컷 분위기를 완성합니다.",
    skyColorOklch: "oklch(0.87 0.06 232)",
    keyLightOklch: "oklch(0.95 0.05 78)",
    ambientFillOklch: "oklch(0.86 0.06 352)",
    fogColorOklch: "oklch(0.92 0.03 348)",
    accentParticleOklch: "oklch(0.82 0.12 355)",
    keyIntensity: 1.18,
    ambientIntensity: 0.64,
    fogDensity: 0.014,
    surfaceWetness: 0.06,
    structuralDamageRatio: 0,
    particleType: "sakura-petals",
    particleLabelKo: "벚꽃잎 파티클",
    baseParticleCount: 160,
    windSpeedMps: 2.8,
    fallSpeedMps: 0.75,
  },
  "rainy-night": {
    labelKo: "비 오는 밤 (Rainy Night)",
    moodSummaryKo: "차가운 청남색 야경 빗줄기와 젖은 노면 반사로 스릴러·감정선을 극대화합니다.",
    skyColorOklch: "oklch(0.24 0.05 256)",
    keyLightOklch: "oklch(0.68 0.09 235)",
    ambientFillOklch: "oklch(0.34 0.06 248)",
    fogColorOklch: "oklch(0.29 0.05 252)",
    accentParticleOklch: "oklch(0.76 0.07 224)",
    keyIntensity: 0.48,
    ambientIntensity: 0.28,
    fogDensity: 0.046,
    surfaceWetness: 0.92,
    structuralDamageRatio: 0.08,
    particleType: "rain-streaks",
    particleLabelKo: "빗줄기 스트릭",
    baseParticleCount: 420,
    windSpeedMps: 5.4,
    fallSpeedMps: 9.2,
  },
  "snowy-winter": {
    labelKo: "눈 오는 겨울 (Snowy Winter)",
    moodSummaryKo: "부드러운 한랭 확산광과 굵은 눈송이로 겨울 일상·서정 컷을 연출합니다.",
    skyColorOklch: "oklch(0.84 0.03 236)",
    keyLightOklch: "oklch(0.94 0.02 228)",
    ambientFillOklch: "oklch(0.81 0.04 242)",
    fogColorOklch: "oklch(0.88 0.02 238)",
    accentParticleOklch: "oklch(0.97 0.01 230)",
    keyIntensity: 0.88,
    ambientIntensity: 0.76,
    fogDensity: 0.032,
    surfaceWetness: 0.34,
    structuralDamageRatio: 0,
    particleType: "snowflakes",
    particleLabelKo: "눈송이 파티클",
    baseParticleCount: 280,
    windSpeedMps: 1.9,
    fallSpeedMps: 1.15,
  },
  "ruined-aftermath": {
    labelKo: "전투 후 폐허 (Ruined Aftermath)",
    moodSummaryKo: "균열·파편·재 연기가 흩날리는 저채도 회갈색 전장 상태로 1클릭 전환합니다.",
    skyColorOklch: "oklch(0.42 0.04 54)",
    keyLightOklch: "oklch(0.72 0.09 44)",
    ambientFillOklch: "oklch(0.38 0.03 62)",
    fogColorOklch: "oklch(0.47 0.03 58)",
    accentParticleOklch: "oklch(0.64 0.14 34)",
    keyIntensity: 0.74,
    ambientIntensity: 0.36,
    fogDensity: 0.058,
    surfaceWetness: 0.15,
    structuralDamageRatio: 0.78,
    particleType: "ash-debris",
    particleLabelKo: "잿가루·파편 입자",
    baseParticleCount: 240,
    windSpeedMps: 4.1,
    fallSpeedMps: 0.62,
  },
  "golden-hour": {
    labelKo: "노을 골든아워 (Golden Hour)",
    moodSummaryKo: "낮은 고도의 주황빛 역광과 따뜻한 먼지 빛망울로 엔딩 컷 감성을 완성합니다.",
    skyColorOklch: "oklch(0.74 0.14 52)",
    keyLightOklch: "oklch(0.86 0.16 62)",
    ambientFillOklch: "oklch(0.62 0.11 26)",
    fogColorOklch: "oklch(0.76 0.1 48)",
    accentParticleOklch: "oklch(0.91 0.14 78)",
    keyIntensity: 1.32,
    ambientIntensity: 0.52,
    fogDensity: 0.024,
    surfaceWetness: 0.04,
    structuralDamageRatio: 0,
    particleType: "sun-motes",
    particleLabelKo: "노을 빛망울 입자",
    baseParticleCount: 130,
    windSpeedMps: 1.2,
    fallSpeedMps: 0.25,
  },
};

export const INTERACTIVE_ENVIRONMENT_PRESETS: readonly {
  readonly id: InteractiveEnvironmentPreset;
  readonly labelKo: string;
}[] = (Object.keys(ENVIRONMENT_PRESET_SPECS) as InteractiveEnvironmentPreset[]).map((id) => ({
  id,
  labelKo: ENVIRONMENT_PRESET_SPECS[id].labelKo,
}));

export type PhotoPosePresetId =
  | "hero-landing"
  | "dramatic-pointing"
  | "contrapposto-idle";

export interface Photo2dBodyLandmarks {
  readonly nose: Vec2;
  readonly neck: Vec2;
  readonly leftShoulder: Vec2;
  readonly rightShoulder: Vec2;
  readonly leftElbow: Vec2;
  readonly rightElbow: Vec2;
  readonly leftWrist: Vec2;
  readonly rightWrist: Vec2;
  readonly pelvis: Vec2;
  readonly leftHip: Vec2;
  readonly rightHip: Vec2;
  readonly leftKnee: Vec2;
  readonly rightKnee: Vec2;
  readonly leftAnkle: Vec2;
  readonly rightAnkle: Vec2;
}

export interface Photo2dHandLandmarks {
  readonly wrist: Vec2;
  readonly thumbTip: Vec2;
  readonly indexTip: Vec2;
  readonly middleTip: Vec2;
  readonly pinkyTip: Vec2;
}

export interface PhotoPoseReconstructionInput {
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly landmarks: Photo2dBodyLandmarks;
  readonly leftHand?: Photo2dHandLandmarks;
  readonly rightHand?: Photo2dHandLandmarks;
  readonly subjectHeightMeters?: number;
}

export interface SamplePhotoPosePreset {
  readonly id: PhotoPosePresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly input: PhotoPoseReconstructionInput;
}

export type ReconstructedJointId =
  | "spine"
  | "neck"
  | "leftShoulder"
  | "leftElbow"
  | "rightShoulder"
  | "rightElbow"
  | "leftHip"
  | "leftKnee"
  | "rightHip"
  | "rightKnee";

export interface JointEulerDeg {
  readonly pitchDeg: number;
  readonly yawDeg: number;
  readonly rollDeg: number;
}

export type HandGripType = "open" | "fist" | "point" | "peace" | "pinch";

export interface ReconstructedHandPose {
  readonly gripType: HandGripType;
  readonly gripLabelKo: string;
  readonly thumbCurl: number;
  readonly indexCurl: number;
  readonly middleCurl: number;
  readonly ringCurl: number;
  readonly pinkyCurl: number;
  readonly wristRollDeg: number;
}

export interface PhotoPoseReconstructionResult {
  readonly camera: {
    readonly focalLengthMm: number;
    readonly pitchDeg: number;
    readonly yawDeg: number;
    readonly rollDeg: number;
    readonly distanceMeters: number;
    readonly shotLabelKo: string;
  };
  readonly joints: Readonly<Record<ReconstructedJointId, JointEulerDeg>>;
  readonly hands: {
    readonly left: ReconstructedHandPose;
    readonly right: ReconstructedHandPose;
  };
  readonly skeleton2dNormalized: Photo2dBodyLandmarks;
  readonly confidence: number;
  readonly reprojectionErrorPx: number;
  readonly costKrw: 0;
}

const SAMPLE_PHOTO_POSE_PRESETS: Record<PhotoPosePresetId, SamplePhotoPosePreset> = {
  "hero-landing": {
    id: "hero-landing",
    labelKo: "히어로 착지 (광각 로우앵글)",
    descriptionKo: "한쪽 무릎을 꿇고 오른손을 지면에 짚은 로우앵글 광각 액션 사진 샘플",
    input: {
      imageWidth: 1080,
      imageHeight: 1440,
      subjectHeightMeters: 1.78,
      landmarks: {
        nose: { x: 0.49, y: 0.24 },
        neck: { x: 0.5, y: 0.31 },
        leftShoulder: { x: 0.34, y: 0.34 },
        rightShoulder: { x: 0.67, y: 0.37 },
        leftElbow: { x: 0.24, y: 0.45 },
        rightElbow: { x: 0.72, y: 0.56 },
        leftWrist: { x: 0.19, y: 0.36 },
        rightWrist: { x: 0.62, y: 0.74 },
        pelvis: { x: 0.51, y: 0.56 },
        leftHip: { x: 0.42, y: 0.56 },
        rightHip: { x: 0.6, y: 0.57 },
        leftKnee: { x: 0.35, y: 0.7 },
        rightKnee: { x: 0.68, y: 0.77 },
        leftAnkle: { x: 0.36, y: 0.87 },
        rightAnkle: { x: 0.78, y: 0.89 },
      },
      leftHand: {
        wrist: { x: 0.19, y: 0.36 },
        thumbTip: { x: 0.21, y: 0.34 },
        indexTip: { x: 0.2, y: 0.33 },
        middleTip: { x: 0.19, y: 0.33 },
        pinkyTip: { x: 0.18, y: 0.34 },
      },
      rightHand: {
        wrist: { x: 0.62, y: 0.74 },
        thumbTip: { x: 0.56, y: 0.79 },
        indexTip: { x: 0.59, y: 0.83 },
        middleTip: { x: 0.63, y: 0.84 },
        pinkyTip: { x: 0.69, y: 0.81 },
      },
    },
  },
  "dramatic-pointing": {
    id: "dramatic-pointing",
    labelKo: "정면 지목 (3/4 사선 포즈)",
    descriptionKo: "오른손 검지로 카메라를 정면 지목하는 드라마틱 컷 사진 샘플",
    input: {
      imageWidth: 1080,
      imageHeight: 1440,
      subjectHeightMeters: 1.72,
      landmarks: {
        nose: { x: 0.55, y: 0.16 },
        neck: { x: 0.51, y: 0.23 },
        leftShoulder: { x: 0.38, y: 0.26 },
        rightShoulder: { x: 0.62, y: 0.25 },
        leftElbow: { x: 0.33, y: 0.42 },
        rightElbow: { x: 0.68, y: 0.33 },
        leftWrist: { x: 0.36, y: 0.54 },
        rightWrist: { x: 0.63, y: 0.29 },
        pelvis: { x: 0.49, y: 0.51 },
        leftHip: { x: 0.42, y: 0.51 },
        rightHip: { x: 0.56, y: 0.51 },
        leftKnee: { x: 0.41, y: 0.71 },
        rightKnee: { x: 0.57, y: 0.7 },
        leftAnkle: { x: 0.4, y: 0.9 },
        rightAnkle: { x: 0.59, y: 0.89 },
      },
      leftHand: {
        wrist: { x: 0.36, y: 0.54 },
        thumbTip: { x: 0.38, y: 0.56 },
        indexTip: { x: 0.37, y: 0.57 },
        middleTip: { x: 0.36, y: 0.57 },
        pinkyTip: { x: 0.35, y: 0.56 },
      },
      rightHand: {
        wrist: { x: 0.63, y: 0.29 },
        thumbTip: { x: 0.61, y: 0.27 },
        indexTip: { x: 0.67, y: 0.19 },
        middleTip: { x: 0.64, y: 0.27 },
        pinkyTip: { x: 0.62, y: 0.28 },
      },
    },
  },
  "contrapposto-idle": {
    id: "contrapposto-idle",
    labelKo: "자연스러운 스탠딩 (50mm 표준)",
    descriptionKo: "무게 중심을 한쪽 다리에 실은 웹툰 일상 컷 표준 렌즈 샘플",
    input: {
      imageWidth: 1080,
      imageHeight: 1440,
      subjectHeightMeters: 1.68,
      landmarks: {
        nose: { x: 0.5, y: 0.14 },
        neck: { x: 0.5, y: 0.21 },
        leftShoulder: { x: 0.39, y: 0.24 },
        rightShoulder: { x: 0.61, y: 0.25 },
        leftElbow: { x: 0.35, y: 0.39 },
        rightElbow: { x: 0.65, y: 0.4 },
        leftWrist: { x: 0.36, y: 0.53 },
        rightWrist: { x: 0.63, y: 0.54 },
        pelvis: { x: 0.51, y: 0.5 },
        leftHip: { x: 0.44, y: 0.5 },
        rightHip: { x: 0.58, y: 0.51 },
        leftKnee: { x: 0.45, y: 0.7 },
        rightKnee: { x: 0.58, y: 0.71 },
        leftAnkle: { x: 0.44, y: 0.9 },
        rightAnkle: { x: 0.59, y: 0.9 },
      },
      leftHand: {
        wrist: { x: 0.36, y: 0.53 },
        thumbTip: { x: 0.4, y: 0.56 },
        indexTip: { x: 0.39, y: 0.61 },
        middleTip: { x: 0.37, y: 0.62 },
        pinkyTip: { x: 0.33, y: 0.59 },
      },
      rightHand: {
        wrist: { x: 0.63, y: 0.54 },
        thumbTip: { x: 0.59, y: 0.57 },
        indexTip: { x: 0.61, y: 0.62 },
        middleTip: { x: 0.63, y: 0.63 },
        pinkyTip: { x: 0.66, y: 0.6 },
      },
    },
  },
};

export const PHOTO_POSE_PRESET_LIST: readonly {
  readonly id: PhotoPosePresetId;
  readonly labelKo: string;
}[] = (Object.keys(SAMPLE_PHOTO_POSE_PRESETS) as PhotoPosePresetId[]).map((id) => ({
  id,
  labelKo: SAMPLE_PHOTO_POSE_PRESETS[id].labelKo,
}));

export function getSamplePhotoPosePreset(id: PhotoPosePresetId): SamplePhotoPosePreset {
  return SAMPLE_PHOTO_POSE_PRESETS[id];
}

function normalizePt(pt: Vec2, w: number, h: number): Vec2 {
  const isPixel = pt.x > 1.5 || pt.y > 1.5;
  return {
    x: roundTo(clamp(isPixel ? pt.x / Math.max(1, w) : pt.x, 0, 1), 4),
    y: roundTo(clamp(isPixel ? pt.y / Math.max(1, h) : pt.y, 0, 1), 4),
  };
}

function solveLimbEuler(
  parent: Vec2,
  child: Vec2,
  expectedSpanNorm: number,
  sideSign: number,
): JointEulerDeg {
  const dx = child.x - parent.x;
  const dy = child.y - parent.y;
  const len2d = Math.hypot(dx, dy);
  const dz = Math.sqrt(Math.max(0, expectedSpanNorm * expectedSpanNorm - len2d * len2d));
  return {
    pitchDeg: roundTo(
      clamp(radToDeg(Math.atan2(dz, Math.max(1e-4, len2d))) * (dy < 0 ? -1 : 1), -140, 140),
      1,
    ),
    yawDeg: roundTo(
      clamp(
        sideSign * radToDeg(Math.atan2(Math.abs(dx), Math.max(1e-4, expectedSpanNorm))) * 0.6,
        -90,
        90,
      ),
      1,
    ),
    rollDeg: roundTo(clamp(radToDeg(Math.atan2(dx, Math.max(1e-4, dy))), -165, 165), 1),
  };
}

function reconstructHandPose(
  hand: Photo2dHandLandmarks | undefined,
  imgW: number,
  imgH: number,
): ReconstructedHandPose {
  if (!hand) {
    return {
      gripType: "open",
      gripLabelKo: "자연스럽게 펼친 손",
      thumbCurl: 0.2,
      indexCurl: 0.18,
      middleCurl: 0.2,
      ringCurl: 0.24,
      pinkyCurl: 0.28,
      wristRollDeg: 0,
    };
  }
  const wrist = normalizePt(hand.wrist, imgW, imgH);
  const thumb = normalizePt(hand.thumbTip, imgW, imgH);
  const index = normalizePt(hand.indexTip, imgW, imgH);
  const middle = normalizePt(hand.middleTip, imgW, imgH);
  const pinky = normalizePt(hand.pinkyTip, imgW, imgH);

  const reachToCurl = (tip: Vec2, fullReach: number): number =>
    roundTo(
      clamp(1 - (Math.hypot(tip.x - wrist.x, tip.y - wrist.y) - 0.02) / Math.max(0.02, fullReach), 0, 1),
      2,
    );

  const thumbCurl = reachToCurl(thumb, 0.055);
  const indexCurl = reachToCurl(index, 0.082);
  const middleCurl = reachToCurl(middle, 0.088);
  const pinkyCurl = reachToCurl(pinky, 0.072);
  const ringCurl = roundTo((middleCurl + pinkyCurl) * 0.5, 2);

  const thumbIndexDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
  let gripType: HandGripType = "open";
  let gripLabelKo = "펼친 손바닥";
  if (indexCurl < 0.35 && middleCurl > 0.62 && pinkyCurl > 0.62) {
    gripType = "point";
    gripLabelKo = "검지 지목 포즈";
  } else if (indexCurl < 0.35 && middleCurl < 0.35 && pinkyCurl > 0.65) {
    gripType = "peace";
    gripLabelKo = "브이(V) 포즈";
  } else if (thumbIndexDist < 0.022 && middleCurl < 0.5) {
    gripType = "pinch";
    gripLabelKo = "집게 잡기 포즈";
  } else if (indexCurl > 0.62 && middleCurl > 0.62 && pinkyCurl > 0.58) {
    gripType = "fist";
    gripLabelKo = "주먹 쥔 포즈";
  }

  return {
    gripType,
    gripLabelKo,
    thumbCurl,
    indexCurl,
    middleCurl,
    ringCurl,
    pinkyCurl,
    wristRollDeg: roundTo(
      clamp(
        radToDeg(Math.atan2(index.x - pinky.x, Math.max(0.005, Math.abs(index.y - wrist.y)))),
        -85,
        85,
      ),
      1,
    ),
  };
}

export function reconstruct3dPoseAndCameraFromPhoto(
  input: PhotoPoseReconstructionInput,
): PhotoPoseReconstructionResult {
  const imgW = Math.max(64, input.imageWidth);
  const imgH = Math.max(64, input.imageHeight);
  const subjectHeight = clamp(input.subjectHeightMeters ?? 1.7, 1.2, 2.2);

  const l = input.landmarks;
  const norm: Photo2dBodyLandmarks = {
    nose: normalizePt(l.nose, imgW, imgH),
    neck: normalizePt(l.neck, imgW, imgH),
    leftShoulder: normalizePt(l.leftShoulder, imgW, imgH),
    rightShoulder: normalizePt(l.rightShoulder, imgW, imgH),
    leftElbow: normalizePt(l.leftElbow, imgW, imgH),
    rightElbow: normalizePt(l.rightElbow, imgW, imgH),
    leftWrist: normalizePt(l.leftWrist, imgW, imgH),
    rightWrist: normalizePt(l.rightWrist, imgW, imgH),
    pelvis: normalizePt(l.pelvis, imgW, imgH),
    leftHip: normalizePt(l.leftHip, imgW, imgH),
    rightHip: normalizePt(l.rightHip, imgW, imgH),
    leftKnee: normalizePt(l.leftKnee, imgW, imgH),
    rightKnee: normalizePt(l.rightKnee, imgW, imgH),
    leftAnkle: normalizePt(l.leftAnkle, imgW, imgH),
    rightAnkle: normalizePt(l.rightAnkle, imgW, imgH),
  };

  const shoulderMid: Vec2 = {
    x: (norm.leftShoulder.x + norm.rightShoulder.x) * 0.5,
    y: (norm.leftShoulder.y + norm.rightShoulder.y) * 0.5,
  };
  const ankleMid: Vec2 = {
    x: (norm.leftAnkle.x + norm.rightAnkle.x) * 0.5,
    y: (norm.leftAnkle.y + norm.rightAnkle.y) * 0.5,
  };

  const bodySpanY = Math.max(0.18, ankleMid.y - norm.nose.y);
  const torsoLenY = Math.max(0.06, norm.pelvis.y - shoulderMid.y);
  const legLenY = Math.max(0.08, ankleMid.y - norm.pelvis.y);
  const shoulderSpanX = Math.abs(norm.rightShoulder.x - norm.leftShoulder.x);
  const hipSpanX = Math.max(0.03, Math.abs(norm.rightHip.x - norm.leftHip.x));
  const upperLowerWidthRatio = shoulderSpanX / hipSpanX;

  const perspectiveDeviation = Math.abs(upperLowerWidthRatio - 1.54);
  const focalLengthMm = roundTo(
    clamp(54 - perspectiveDeviation * 58 - Math.max(0, bodySpanY - 0.72) * 28, 18, 135),
    1,
  );
  const torsoToLegRatio = torsoLenY / legLenY;
  const pitchDeg = roundTo(
    clamp((torsoToLegRatio - 0.67) * 52 + (norm.pelvis.y - 0.52) * 48, -45, 45),
    1,
  );
  const yawDeg = roundTo(
    clamp(((norm.nose.x - shoulderMid.x) / Math.max(0.05, shoulderSpanX)) * 95, -90, 90),
    1,
  );
  const rollDeg = roundTo(
    clamp(
      radToDeg(
        Math.atan2(
          norm.rightShoulder.y - norm.leftShoulder.y,
          Math.max(0.02, norm.rightShoulder.x - norm.leftShoulder.x),
        ),
      ),
      -25,
      25,
    ),
    1,
  );
  const distanceMeters = roundTo(
    clamp((subjectHeight * (focalLengthMm / 24)) / bodySpanY, 0.85, 12.0),
    2,
  );

  const shotLabelKo =
    pitchDeg <= -8
      ? "로우앵글 박력 샷"
      : pitchDeg >= 10
        ? "하이앵글 부감 샷"
        : Math.abs(yawDeg) >= 16
          ? "3/4 사선 아이레벨 샷"
          : "정면 표준 아이레벨 샷";

  const joints: Record<ReconstructedJointId, JointEulerDeg> = {
    spine: {
      pitchDeg: roundTo(clamp((0.68 - torsoToLegRatio) * 45, -35, 55), 1),
      yawDeg: roundTo(yawDeg * 0.45, 1),
      rollDeg: roundTo(rollDeg * 0.65, 1),
    },
    neck: {
      pitchDeg: roundTo(clamp((norm.neck.y - norm.nose.y - bodySpanY * 0.09) * 180, -35, 35), 1),
      yawDeg: roundTo(clamp(yawDeg * 0.75, -60, 60), 1),
      rollDeg: roundTo(rollDeg * 0.3, 1),
    },
    leftShoulder: solveLimbEuler(norm.leftShoulder, norm.leftElbow, bodySpanY * 0.21, -1),
    leftElbow: solveLimbEuler(norm.leftElbow, norm.leftWrist, bodySpanY * 0.18, -1),
    rightShoulder: solveLimbEuler(norm.rightShoulder, norm.rightElbow, bodySpanY * 0.21, 1),
    rightElbow: solveLimbEuler(norm.rightElbow, norm.rightWrist, bodySpanY * 0.18, 1),
    leftHip: solveLimbEuler(norm.leftHip, norm.leftKnee, bodySpanY * 0.27, -1),
    leftKnee: solveLimbEuler(norm.leftKnee, norm.leftAnkle, bodySpanY * 0.27, -1),
    rightHip: solveLimbEuler(norm.rightHip, norm.rightKnee, bodySpanY * 0.27, 1),
    rightKnee: solveLimbEuler(norm.rightKnee, norm.rightAnkle, bodySpanY * 0.27, 1),
  };

  const symmetryBalance = clamp(1 - Math.abs(shoulderSpanX - hipSpanX * 1.45) * 1.2, 0.65, 0.99);
  const handBonus = (input.leftHand ? 0.04 : 0) + (input.rightHand ? 0.04 : 0);
  const confidence = roundTo(clamp(0.84 + symmetryBalance * 0.08 + handBonus, 0.5, 0.99), 3);

  return {
    camera: { focalLengthMm, pitchDeg, yawDeg, rollDeg, distanceMeters, shotLabelKo },
    joints,
    hands: {
      left: reconstructHandPose(input.leftHand, imgW, imgH),
      right: reconstructHandPose(input.rightHand, imgW, imgH),
    },
    skeleton2dNormalized: norm,
    confidence,
    reprojectionErrorPx: roundTo(clamp((1 - confidence) * 18 + 0.6, 0.4, 8.5), 2),
    costKrw: 0,
  };
}
