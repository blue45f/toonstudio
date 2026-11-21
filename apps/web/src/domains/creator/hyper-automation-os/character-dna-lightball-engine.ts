export type CharacterAngleId =
  | "front-0"
  | "front-right-45"
  | "right-90"
  | "back-right-135"
  | "back-180"
  | "back-left-225"
  | "left-270"
  | "front-left-315";

export type CharacterExpressionId =
  | "neutral"
  | "smile"
  | "laugh"
  | "smirk"
  | "determined"
  | "angry"
  | "shocked"
  | "sad"
  | "teary"
  | "shy"
  | "exhausted"
  | "awakened";

interface CharacterAngleSpec {
  readonly id: CharacterAngleId;
  readonly label: string;
  readonly yawDeg: number;
}

interface CharacterExpressionSpec {
  readonly id: CharacterExpressionId;
  readonly label: string;
  readonly browTiltDeg: number;
  readonly eyeOpenRatio: number;
  readonly mouthTension: number;
}

export interface CharacterDnaProfile {
  readonly dnaCode: string;
  readonly characterSummary: string;
  readonly consistencyLock: boolean;
  readonly proportionSpec: string;
  readonly selectedAngleId: CharacterAngleId;
  readonly selectedExpressionId: CharacterExpressionId;
  readonly lockedAngles: readonly CharacterAngleSpec[];
  readonly lockedExpressions: readonly CharacterExpressionSpec[];
  readonly totalTurnaroundCells: 96;
}

export interface LightballShadingState {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly keyIntensity: number;
  readonly lightVector: { readonly x: number; readonly y: number; readonly z: number };
  readonly shadowDirectionDeg: number;
  readonly shadowLengthRatio: number;
  readonly rimLightPercent: number;
  readonly contactShadowPercent: number;
  readonly terminatorSoftness: number;
  readonly highlightSpot: { readonly xPercent: number; readonly yPercent: number };
  readonly lightingMoodLabel: string;
  readonly keyColorOklch: string;
  readonly rimColorOklch: string;
  readonly shadowColorOklch: string;
}

export const CHARACTER_DNA_ANGLES: readonly CharacterAngleSpec[] = [
  { id: "front-0", label: "정면 0°", yawDeg: 0 },
  { id: "front-right-45", label: "우반측 45°", yawDeg: 45 },
  { id: "right-90", label: "우측면 90°", yawDeg: 90 },
  { id: "back-right-135", label: "우후측 135°", yawDeg: 135 },
  { id: "back-180", label: "후면 180°", yawDeg: 180 },
  { id: "back-left-225", label: "좌후측 225°", yawDeg: 225 },
  { id: "left-270", label: "좌측면 270°", yawDeg: 270 },
  { id: "front-left-315", label: "좌반측 315°", yawDeg: 315 },
];

export const CHARACTER_DNA_EXPRESSIONS: readonly CharacterExpressionSpec[] = [
  { id: "neutral", label: "무표정", browTiltDeg: 0, eyeOpenRatio: 0.82, mouthTension: 0.1 },
  { id: "smile", label: "미소", browTiltDeg: 4, eyeOpenRatio: 0.78, mouthTension: 0.45 },
  { id: "laugh", label: "활짝 웃음", browTiltDeg: 8, eyeOpenRatio: 0.56, mouthTension: 0.85 },
  { id: "smirk", label: "자신감·비웃음", browTiltDeg: -6, eyeOpenRatio: 0.72, mouthTension: 0.6 },
  { id: "determined", label: "결의", browTiltDeg: -12, eyeOpenRatio: 0.88, mouthTension: 0.5 },
  { id: "angry", label: "분노", browTiltDeg: -22, eyeOpenRatio: 0.94, mouthTension: 0.92 },
  { id: "shocked", label: "경악", browTiltDeg: 18, eyeOpenRatio: 1.0, mouthTension: 0.88 },
  { id: "sad", label: "슬픔", browTiltDeg: 14, eyeOpenRatio: 0.64, mouthTension: 0.35 },
  { id: "teary", label: "눈물·오열", browTiltDeg: 20, eyeOpenRatio: 0.48, mouthTension: 0.78 },
  { id: "shy", label: "당황·수줍음", browTiltDeg: 10, eyeOpenRatio: 0.74, mouthTension: 0.42 },
  { id: "exhausted", label: "탈진·피로", browTiltDeg: 6, eyeOpenRatio: 0.38, mouthTension: 0.2 },
  { id: "awakened", label: "각성·집중", browTiltDeg: -16, eyeOpenRatio: 0.96, mouthTension: 0.7 },
];

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hashFingerprint(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash).toString(36).toUpperCase().padStart(5, "0").slice(0, 5);
}

export function createCharacterDnaProfile(options: {
  readonly protagonistProfile: string;
  readonly genreCode: string;
  readonly selectedAngleId?: CharacterAngleId;
  readonly selectedExpressionId?: CharacterExpressionId;
  readonly consistencyLock?: boolean;
}): CharacterDnaProfile {
  const prefix = options.genreCode.slice(0, 2).toUpperCase();
  const code = `DNA-${prefix}-${hashFingerprint(`${options.protagonistProfile}:${options.genreCode}`)}`;
  return {
    dnaCode: code,
    characterSummary: options.protagonistProfile,
    consistencyLock: options.consistencyLock ?? true,
    proportionSpec: "7.5등신 · 눈간격 1.0 · 의상 5색 OKLCH 실루엣 앵커 고정",
    selectedAngleId: options.selectedAngleId ?? "front-right-45",
    selectedExpressionId: options.selectedExpressionId ?? "determined",
    lockedAngles: CHARACTER_DNA_ANGLES,
    lockedExpressions: CHARACTER_DNA_EXPRESSIONS,
    totalTurnaroundCells: 96,
  };
}

export function updateCharacterDnaSelection(
  profile: CharacterDnaProfile,
  patch: {
    readonly selectedAngleId?: CharacterAngleId;
    readonly selectedExpressionId?: CharacterExpressionId;
    readonly consistencyLock?: boolean;
  },
): CharacterDnaProfile {
  return {
    ...profile,
    selectedAngleId: patch.selectedAngleId ?? profile.selectedAngleId,
    selectedExpressionId: patch.selectedExpressionId ?? profile.selectedExpressionId,
    consistencyLock: patch.consistencyLock ?? profile.consistencyLock,
  };
}

export function computeLightballShading(options: {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly keyIntensity?: number;
  readonly keyColorOklch?: string;
  readonly rimColorOklch?: string;
  readonly shadowColorOklch?: string;
}): LightballShadingState {
  const normalizedAzimuth = ((Math.round(options.azimuthDeg) % 360) + 360) % 360;
  const elevationDeg = Math.round(clampNumber(options.elevationDeg, -30, 90));
  const keyIntensity = Math.round(clampNumber(options.keyIntensity ?? 84, 10, 100));

  const azRad = (normalizedAzimuth * Math.PI) / 180;
  const elRad = (elevationDeg * Math.PI) / 180;

  const cosEl = Math.cos(elRad);
  const x = roundTo(Math.sin(azRad) * cosEl, 3);
  const y = roundTo(Math.sin(elRad), 3);
  const z = roundTo(Math.cos(azRad) * cosEl, 3);

  const shadowDirectionDeg = (normalizedAzimuth + 180) % 360;
  const shadowLengthRatio = elevationDeg <= 8
    ? 2.4
    : roundTo(clampNumber(1 / Math.tan(elRad), 0.18, 2.4), 2);

  // 역광(z < 0)과 낮은 고도각일수록 림 라이트 강도가 높아진다.
  const backLightFactor = clampNumber((1 - z) / 2, 0, 1);
  const rimLightPercent = Math.round(clampNumber(28 + backLightFactor * 64 + (100 - Math.abs(elevationDeg)) * 0.08, 18, 98));
  const contactShadowPercent = Math.round(clampNumber(36 + (keyIntensity * 0.42) + Math.max(0, elevationDeg) * 0.14, 24, 92));
  const terminatorSoftness = roundTo(clampNumber(0.48 - (keyIntensity / 100) * 0.24 + (1 - Math.abs(y)) * 0.08, 0.12, 0.65), 2);

  const highlightSpot = {
    xPercent: Math.round(clampNumber(50 + x * 34, 16, 84)),
    yPercent: Math.round(clampNumber(50 - y * 34, 16, 84)),
  };

  let lightingMoodLabel = "정면 소프트 키라이트";
  if (elevationDeg < 0) {
    lightingMoodLabel = "하단 언더라이트 · 긴장감 강조";
  } else if (elevationDeg >= 68) {
    lightingMoodLabel = "상단 탑 라이트 · 강한 접촉 그림자";
  } else if (z <= -0.25) {
    lightingMoodLabel = "역광 림 라이트 · 실루엣 분리";
  } else if (Math.abs(x) >= 0.6) {
    lightingMoodLabel = "측광 드라마틱 명암";
  }

  return {
    azimuthDeg: normalizedAzimuth,
    elevationDeg,
    keyIntensity,
    lightVector: { x, y, z },
    shadowDirectionDeg,
    shadowLengthRatio,
    rimLightPercent,
    contactShadowPercent,
    terminatorSoftness,
    highlightSpot,
    lightingMoodLabel,
    keyColorOklch: options.keyColorOklch ?? "oklch(0.86 0.11 82)",
    rimColorOklch: options.rimColorOklch ?? "oklch(0.82 0.15 205)",
    shadowColorOklch: options.shadowColorOklch ?? "oklch(0.22 0.04 260)",
  };
}
