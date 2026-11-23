/**
 * 창작 부담 덜기 오토파일럿 공통 타입·레이블·수학 유틸리티.
 */

export type CreatorReliefLocale = "ko" | "en";

export interface BilingualLabel {
  readonly ko: string;
  readonly en: string;
}

export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
}

export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SvgLineSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export type CutMoodId = "shock" | "romance" | "action" | "quiet" | "confrontation";
export type ShotSizeId = "ECU" | "CU" | "MCU" | "MS" | "MLS" | "LS" | "ELS" | "OTS";
export type CameraAngleId =
  | "eye-level"
  | "low-angle"
  | "high-angle"
  | "dutch-tilt"
  | "birds-eye"
  | "worm-eye";
export type BalloonStyleId = "speech" | "shout" | "thought" | "narration";

export type CrowdSceneId = "cafe" | "street" | "classroom" | "ballroom";
export type CrowdPoseKind = "seated" | "walking" | "standing" | "conversing";
export type CrowdPropKind = "none" | "cup" | "bag" | "desk" | "glass";

export type ShadingLightingMoodId = "warm-day" | "cool-night" | "sunset" | "rofan-pastel";
export type ShadingStopRole = "highlight" | "base" | "shadow1" | "shadow2" | "rimLight";

export interface WireframeFigure {
  readonly role: "primary" | "secondary";
  readonly headCx: number;
  readonly headCy: number;
  readonly headR: number;
  readonly shoulderPath: string;
  readonly gazeDx: number;
  readonly gazeDy: number;
}

export interface CompositionWireframeData {
  readonly viewBoxWidth: number;
  readonly viewBoxHeight: number;
  readonly horizonY: number;
  readonly dutchAngleDeg: number;
  readonly ruleOfThirdsX: readonly [number, number];
  readonly ruleOfThirdsY: readonly [number, number];
  readonly focalPoint: NormalizedPoint;
  readonly subjectBounds: NormalizedRect;
  readonly figures: readonly WireframeFigure[];
  readonly speedLines: readonly SvgLineSegment[];
  readonly focalRingRadius: number;
}

export interface CutCompositionCard {
  readonly id: string;
  readonly variantIndex: 0 | 1 | 2;
  readonly mood: CutMoodId;
  readonly title: BilingualLabel;
  readonly rationale: BilingualLabel;
  readonly shotSize: ShotSizeId;
  readonly shotSizeLabel: BilingualLabel;
  readonly cameraAngle: CameraAngleId;
  readonly cameraAngleLabel: BilingualLabel;
  readonly thirdsAnchor: NormalizedPoint;
  readonly balloonAnchor: NormalizedPoint;
  readonly recommendedBalloonStyle: BalloonStyleId;
  readonly gutterPx: number;
  readonly pacingBeatSec: number;
  readonly dialogueExcerpt: string;
  readonly wireframe: CompositionWireframeData;
}

export interface PerspectiveCrowdOptions {
  readonly scene: CrowdSceneId;
  readonly count: number;
  readonly horizonPct?: number;
  readonly seed?: number;
}

export interface CrowdSilhouetteEntity {
  readonly id: string;
  readonly index: number;
  readonly depth: number;
  readonly xPct: number;
  readonly baselineYPct: number;
  readonly scale: number;
  readonly opacity: number;
  readonly blurPx: number;
  readonly pose: CrowdPoseKind;
  readonly facing: -1 | 1;
  readonly shoulderWidthPct: number;
  readonly headRadiusPct: number;
  readonly torsoHeightPct: number;
  readonly propKind: CrowdPropKind;
  readonly headCx: number;
  readonly headCy: number;
  readonly headR: number;
  readonly bodyPath: string;
  readonly propPath: string | null;
}

export interface PerspectiveCrowdResult {
  readonly scene: CrowdSceneId;
  readonly count: number;
  readonly horizonPct: number;
  readonly vanishingPoint: NormalizedPoint;
  readonly seed: number;
  readonly viewBoxWidth: number;
  readonly viewBoxHeight: number;
  readonly perspectiveGuides: readonly SvgLineSegment[];
  readonly silhouettes: readonly CrowdSilhouetteEntity[];
}

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export interface ShadingRampStop {
  readonly role: ShadingStopRole;
  readonly label: BilingualLabel;
  readonly usageHint: BilingualLabel;
  readonly rgb: RgbColor;
  readonly oklch: OklchColor;
  readonly relativeLuminance: number;
  readonly hueShiftDeg: number;
  readonly blendModeHint: "normal" | "multiply" | "screen" | "add";
}

export interface Webtoon5ToneShadingRamp {
  readonly lightingMood: ShadingLightingMoodId;
  readonly baseInput: RgbColor;
  readonly highlight: ShadingRampStop;
  readonly base: ShadingRampStop;
  readonly shadow1: ShadingRampStop;
  readonly shadow2: ShadingRampStop;
  readonly rimLight: ShadingRampStop;
  readonly stops: readonly [
    ShadingRampStop,
    ShadingRampStop,
    ShadingRampStop,
    ShadingRampStop,
    ShadingRampStop,
  ];
}

export interface CharacterBaseColorPreset {
  readonly id: string;
  readonly label: BilingualLabel;
  readonly rgb: RgbColor;
}

export interface ScriptBalloonLayoutItem {
  readonly id: string;
  readonly cutIndex: number;
  readonly sequenceIndex: number;
  readonly speaker: string | null;
  readonly style: BalloonStyleId;
  readonly text: string;
  readonly lines: readonly string[];
  readonly charCount: number;
  readonly isSplitContinuation: boolean;
  readonly side: "left" | "right" | "center";
  readonly anchor: NormalizedPoint;
  readonly gutterPx: number;
  readonly pacingNote: BilingualLabel;
}

export interface AutoBalloonLayoutResult {
  readonly maxCharsPerBalloon: number;
  readonly totalInputLines: number;
  readonly totalBalloons: number;
  readonly splitCount: number;
  readonly estimatedScrollHeightPx: number;
  readonly items: readonly ScriptBalloonLayoutItem[];
}

export const CUT_MOOD_IDS: readonly CutMoodId[] = [
  "shock",
  "romance",
  "action",
  "quiet",
  "confrontation",
];

export const CUT_MOOD_LABELS: Readonly<Record<CutMoodId, BilingualLabel>> = {
  shock: { ko: "충격·반전", en: "Shock" },
  romance: { ko: "로맨스·설렘", en: "Romance" },
  action: { ko: "액션·돌파", en: "Action" },
  quiet: { ko: "고요·여운", en: "Quiet" },
  confrontation: { ko: "대치·긴장", en: "Confrontation" },
};

export const SHOT_SIZE_LABELS: Readonly<Record<ShotSizeId, BilingualLabel>> = {
  ECU: { ko: "익스트림 클로즈업 (눈·표정)", en: "Extreme Close-Up (ECU)" },
  CU: { ko: "클로즈업 (얼굴 강조)", en: "Close-Up (CU)" },
  MCU: { ko: "미디엄 클로즈업 (가슴 위)", en: "Medium Close-Up (MCU)" },
  MS: { ko: "미디엄 샷 (허리 위)", en: "Medium Shot (MS)" },
  MLS: { ko: "미디엄 롱 샷 (무릎 위)", en: "Medium Long Shot (MLS)" },
  LS: { ko: "롱 샷 (전신·동세)", en: "Long Shot (LS)" },
  ELS: { ko: "익스트림 롱 샷 (여백·공간)", en: "Extreme Long Shot (ELS)" },
  OTS: { ko: "오버 더 숄더 (어깨 너머)", en: "Over-the-Shoulder (OTS)" },
};

export const CAMERA_ANGLE_LABELS: Readonly<Record<CameraAngleId, BilingualLabel>> = {
  "eye-level": { ko: "아이레벨 (눈높이)", en: "Eye Level" },
  "low-angle": { ko: "로우 앵글 (위압·웅장)", en: "Low Angle" },
  "high-angle": { ko: "하이 앵글 (고립·취약)", en: "High Angle" },
  "dutch-tilt": { ko: "더치 틸트 (기울기 긴장)", en: "Dutch Tilt" },
  "birds-eye": { ko: "버즈아이 (부감 시점)", en: "Bird's-Eye" },
  "worm-eye": { ko: "웜즈아이 (극저각)", en: "Worm's-Eye" },
};

export const CROWD_SCENE_IDS: readonly CrowdSceneId[] = [
  "cafe",
  "street",
  "classroom",
  "ballroom",
];

export const CROWD_SCENE_LABELS: Readonly<Record<CrowdSceneId, BilingualLabel>> = {
  cafe: { ko: "카페 좌석", en: "Cafe Tables" },
  street: { ko: "도심 거리", en: "City Street" },
  classroom: { ko: "교실 책상", en: "Classroom" },
  ballroom: { ko: "연회장·파티", en: "Ballroom" },
};

export const SHADING_LIGHTING_MOOD_IDS: readonly ShadingLightingMoodId[] = [
  "warm-day",
  "cool-night",
  "sunset",
  "rofan-pastel",
];

export const SHADING_LIGHTING_MOOD_LABELS: Readonly<Record<ShadingLightingMoodId, BilingualLabel>> = {
  "warm-day": { ko: "따뜻한 낮빛", en: "Warm Day" },
  "cool-night": { ko: "차가운 달빛 밤", en: "Cool Night" },
  sunset: { ko: "노을 매직아워", en: "Sunset" },
  "rofan-pastel": { ko: "로판 파스텔", en: "Rofan Pastel" },
};

export const BALLOON_STYLE_LABELS: Readonly<Record<BalloonStyleId, BilingualLabel>> = {
  speech: { ko: "일반 대사", en: "Speech" },
  shout: { ko: "외침·강조", en: "Shout" },
  thought: { ko: "속마음", en: "Thought" },
  narration: { ko: "나레이션", en: "Narration" },
};

export const CHARACTER_BASE_COLOR_PRESETS: readonly CharacterBaseColorPreset[] = [
  { id: "fair-skin", label: { ko: "밝은 피부톤", en: "Fair Skin" }, rgb: { r: 238, g: 204, b: 184 } },
  { id: "warm-skin", label: { ko: "건강한 피부톤", en: "Warm Skin" }, rgb: { r: 214, g: 164, b: 132 } },
  { id: "rofan-dress", label: { ko: "로판 장미 드레스", en: "Rose Gown" }, rgb: { r: 212, g: 122, b: 148 } },
  { id: "navy-hair", label: { ko: "네이비 머리카락", en: "Navy Hair" }, rgb: { r: 66, g: 82, b: 126 } },
  { id: "olive-coat", label: { ko: "올리브 코트", en: "Olive Coat" }, rgb: { r: 124, g: 142, b: 102 } },
  { id: "amber-hair", label: { ko: "허니 블론드", en: "Honey Blonde" }, rgb: { r: 222, g: 182, b: 112 } },
];

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampInt(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max));
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function pickLocaleText(label: BilingualLabel, locale: CreatorReliefLocale): string {
  return locale === "ko" ? label.ko : label.en;
}
