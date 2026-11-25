/**
 * Wave 48A — 컷 감정·조명 자동 연출 제안기 (Scene Lighting & Atmosphere Advisor) 순수 결정론적 엔진.
 *
 * - 대사/지문 + 6대 시간대 + 6대 장소/장르 프리셋 분석으로 6대 감정 벡터(긴장·설렘·분노·고독·환희·서스펜스) 산출
 * - 비파괴 Top-3 3점 조명·분위기 구성 예제 제안(`proposeSceneLightingTop3`), 생성 제안은 탈-바이올렛 OKLCH 안료 사용
 * - 인물 얼굴 명암 대비비 및 대사 말풍선 영역 배경 명도 자동 점검(`auditLightingReadability`)
 * - 비파괴 미리보기·적용·되돌리기·미세 조정·전 컷 비교 상태 머신 및 Three.js/Blender 연동 JSON 내보내기
 */

import { assertLightingBundle, assertLightingInput, assertLightingPatch, assertLightingProposal, assertLightingSession, validateLightingRig } from "./lighting-input-contract";

export type SceneTimeOfDay = "dawn" | "day" | "golden-hour" | "rainy-dusk" | "night-neon" | "snow-overcast";
export type SceneLocationPresetId =
  | "rooftop-rain" | "chase-alley" | "sunset-classroom" | "dawn-bedroom" | "snow-duel" | "royal-hall";
export type SceneEmotion = "tension" | "flutter" | "anger" | "solitude" | "elation" | "suspense";
export type LightingProposalVariant = "cinematic-key" | "dramatic-rim" | "readable-soft";
export type LightingSessionStatus = "idle" | "previewing" | "applied" | "tweaked" | "reverted";
export type PreviousCutLightingPresetId = "neutral-day" | "warm-sunset" | "cold-rain" | "neon-night";
export type FaceContrastStatus = "optimal" | "flat" | "harsh";
export type BubbleReadabilityStatus = "clear" | "caution" | "warning";
export type ReadabilityGrade = "pass" | "caution" | "warning";
export type CutShiftSeverity = "smooth" | "notice" | "dramatic-shift";

export interface OklchColor {
  readonly l: number; readonly c: number; readonly h: number;
}
export interface KeyLightParams {
  readonly azimuthDeg: number; readonly elevationDeg: number;
  readonly kelvin: number; readonly intensity: number; readonly colorOklch: OklchColor;
}
export interface FillLightParams {
  readonly azimuthDeg: number; readonly kelvin: number;
  readonly fillRatio: number; readonly intensity: number; readonly colorOklch: OklchColor;
}
export interface RimLightParams {
  readonly angleDeg: number; readonly intensity: number;
  readonly pigmentOklch: OklchColor; readonly pigmentNameKo: string; readonly pigmentNameEn: string;
}
export interface AtmosphereParams {
  readonly fogDensity: number; readonly volumetricStrength: number;
  readonly shadowContrastRatio: number; readonly colorTempBalance: number;
  readonly ambientLuminance: number; readonly backdropOklch: OklchColor;
}
export interface SceneLightingRig {
  readonly labelKo: string; readonly labelEn: string;
  readonly keyLight: KeyLightParams; readonly fillLight: FillLightParams;
  readonly rimLight: RimLightParams; readonly atmosphere: AtmosphereParams;
}
export interface LightingReadabilityAudit {
  readonly faceContrastRatio: number; readonly faceContrastStatus: FaceContrastStatus;
  readonly bubbleZoneLuminance: number; readonly bubbleContrastRatio: number;
  readonly bubbleReadabilityStatus: BubbleReadabilityStatus; readonly overallGrade: ReadabilityGrade;
  readonly recommendedBubbleStyleKo: string; readonly recommendedBubbleStyleEn: string;
  readonly warningsKo: readonly string[]; readonly warningsEn: readonly string[];
  readonly recommendationsKo: readonly string[]; readonly recommendationsEn: readonly string[];
}
export interface SceneLightingAnalysisInput {
  readonly dialogue: string; readonly timeOfDay?: SceneTimeOfDay; readonly scenePresetId?: SceneLocationPresetId;
}
export interface SceneLightingEmotionAnalysis {
  readonly dialogue: string; readonly timeOfDay: SceneTimeOfDay; readonly scenePresetId: SceneLocationPresetId;
  readonly emotionVector: Readonly<Record<SceneEmotion, number>>;
  readonly primaryEmotion: SceneEmotion; readonly secondaryEmotion: SceneEmotion;
  readonly confidence: number; readonly detectedSignals: readonly string[];
}
export interface SceneLightingProposal {
  readonly id: string; readonly rank: 1 | 2 | 3; readonly variant: LightingProposalVariant;
  readonly titleKo: string; readonly titleEn: string; readonly confidence: number;
  readonly rig: SceneLightingRig; readonly reasonKo: string; readonly reasonEn: string;
  readonly readabilityAudit: LightingReadabilityAudit; readonly requiresAuthorApproval: true;
}
export interface LightingCutComparison {
  readonly keyKelvinDeltaK: number; readonly contrastDelta: number; readonly luminanceDelta: number;
  readonly continuityScore: number; readonly shiftSeverity: CutShiftSeverity;
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface SceneLightingProposalBundle {
  readonly analysis: SceneLightingEmotionAnalysis;
  readonly proposals: readonly [SceneLightingProposal, SceneLightingProposal, SceneLightingProposal];
  readonly previousCutComparison: LightingCutComparison | null;
}
export interface LightingSessionTransition {
  readonly step: number; readonly action: "apply" | "revert" | "tweak";
  readonly proposalId: string | null; readonly labelKo: string;
}
export interface SceneLightingSession {
  readonly baselineRig: SceneLightingRig; readonly currentRig: SceneLightingRig;
  readonly previousCutRig: SceneLightingRig;
  readonly previewingProposalId: string | null; readonly previewRig: SceneLightingRig | null;
  readonly appliedProposalId: string | null; readonly status: LightingSessionStatus;
  readonly isTweaked: boolean; readonly canRevert: boolean;
  readonly history: readonly LightingSessionTransition[];
}
export interface LightingRigTweakPatch {
  readonly keyIntensity?: number; readonly keyKelvin?: number; readonly keyAzimuthDeg?: number;
  readonly fillRatio?: number; readonly fillKelvin?: number;
  readonly rimIntensity?: number; readonly rimHueDeg?: number; readonly fogDensity?: number;
}
export interface SceneTimeOfDayMeta {
  readonly id: SceneTimeOfDay; readonly labelKo: string; readonly labelEn: string;
  readonly keyKelvin: number; readonly fillKelvin: number; readonly elevationDeg: number;
  readonly ambientLuminance: number; readonly fogDensity: number; readonly volumetricStrength: number;
  readonly backdropOklch: OklchColor; readonly emotionBias: Partial<Readonly<Record<SceneEmotion, number>>>;
}
export interface SceneLocationPresetMeta {
  readonly id: SceneLocationPresetId; readonly labelKo: string; readonly labelEn: string;
  readonly genreKo: string; readonly genreEn: string; readonly defaultTimeOfDay: SceneTimeOfDay;
  readonly defaultDialogueKo: string; readonly defaultDialogueEn: string;
  readonly keyAzimuthDeg: number; readonly rimAngleDeg: number;
  readonly rimPigmentOklch: OklchColor; readonly rimPigmentNameKo: string; readonly rimPigmentNameEn: string;
  readonly baseKeyIntensity: number; readonly baseFillRatio: number; readonly baseRimIntensity: number;
  readonly fogBoost: number; readonly volumetricBoost: number;
  readonly emotionBias: Partial<Readonly<Record<SceneEmotion, number>>>;
}
export interface SceneEmotionMeta {
  readonly id: SceneEmotion; readonly labelKo: string; readonly labelEn: string;
  readonly keyKelvinShift: number; readonly keyIntensityMul: number; readonly fillRatioDelta: number;
  readonly rimIntensityDelta: number; readonly fogDelta: number;
  readonly rimPigmentOklch: OklchColor; readonly rimPigmentNameKo: string; readonly rimPigmentNameEn: string;
  readonly moodPhraseKo: string; readonly moodPhraseEn: string;
}
export interface PreviousCutLightingPreset {
  readonly id: PreviousCutLightingPresetId; readonly labelKo: string; readonly labelEn: string;
  readonly rig: SceneLightingRig;
}

export const VIOLET_SLOP_MIN_HUE = 270;
export const VIOLET_SLOP_MAX_HUE = 320;

function round2(n: number): number { return Math.round(n * 100) / 100; }
function clamp(n: number, min: number, max: number): number { return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; }
function clamp01(n: number): number { return round2(clamp(n, 0, 1)); }
function normalizeHue(deg: number): number { return Number.isFinite(deg) ? Math.round(((deg % 360) + 360) % 360) : 42; }

/** 270~320도 바이올렛 슬롭 구간 여부를 검사한다. */
export function isVioletSlopHue(hueDeg: number): boolean {
  const h = normalizeHue(hueDeg);
  return h >= VIOLET_SLOP_MIN_HUE && h <= VIOLET_SLOP_MAX_HUE;
}

/** 바이올렛 구간(270~320°)으로 진입한 휴를 안전한 코발트(252°) 또는 연지(342°)로 교정한다. */
export function sanitizeNonVioletHue(hueDeg: number): number {
  const h = normalizeHue(hueDeg);
  return h >= VIOLET_SLOP_MIN_HUE && h <= VIOLET_SLOP_MAX_HUE ? (h < 295 ? 252 : 342) : h;
}

/** OKLCH 색상을 CSS/SVG 표준 문자열로 직렬화한다. */
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = clamp01(color.l);
  const c = round2(clamp(color.c, 0, 0.34));
  const h = sanitizeNonVioletHue(color.h);
  if (typeof alpha === "number" && Number.isFinite(alpha)) {
    return `oklch(${l.toFixed(2)} ${c.toFixed(2)} ${h} / ${clamp01(alpha).toFixed(2)})`;
  }
  return `oklch(${l.toFixed(2)} ${c.toFixed(2)} ${h})`;
}

/** 색온도(2200K~9500K)를 탈-바이올렛 OKLCH 광원 색상으로 변환한다. */
export function kelvinToOklch(kelvin: number, chromaScale = 1): OklchColor {
  const k = clamp(kelvin, 2200, 9500);
  const scale = clamp(chromaScale, 0.2, 1.5);
  if (k < 3400) {
    const t = (k - 2200) / 1200;
    return { l: round2(0.74 + t * 0.07), c: round2((0.16 - t * 0.04) * scale), h: sanitizeNonVioletHue(46 + t * 22) };
  }
  if (k < 4800) {
    const t = (k - 3400) / 1400;
    return { l: round2(0.81 + t * 0.08), c: round2((0.12 - t * 0.06) * scale), h: sanitizeNonVioletHue(68 + t * 18) };
  }
  if (k <= 5800) {
    const t = (k - 4800) / 1000;
    const h = k <= 5400 ? 92 + t * 8 : 220 + (t - 0.6) * 20;
    return { l: round2(0.9 + t * 0.03), c: round2(0.03 * scale), h: sanitizeNonVioletHue(h) };
  }
  const t = (k - 5800) / 3700;
  return { l: round2(0.86 - t * 0.09), c: round2((0.06 + t * 0.08) * scale), h: sanitizeNonVioletHue(228 + t * 24) };
}

const DEFAULT_TIME_OF_DAY_META: SceneTimeOfDayMeta = {
  id: "rainy-dusk", labelKo: "비 오는 해질녘", labelEn: "Rainy Dusk",
  keyKelvin: 6800, fillKelvin: 7600, elevationDeg: 34, ambientLuminance: 0.28,
  fogDensity: 0.52, volumetricStrength: 0.58, backdropOklch: { l: 0.26, c: 0.06, h: 238 },
  emotionBias: { tension: 1.0, solitude: 0.65, anger: 0.45, suspense: 0.55 },
};

export const SCENE_TIME_OF_DAY_PRESETS: readonly SceneTimeOfDayMeta[] = [
  { id: "dawn", labelKo: "새벽", labelEn: "Dawn", keyKelvin: 6400, fillKelvin: 7200, elevationDeg: 18, ambientLuminance: 0.34, fogDensity: 0.38, volumetricStrength: 0.42, backdropOklch: { l: 0.32, c: 0.06, h: 236 }, emotionBias: { solitude: 0.9, tension: 0.35, flutter: 0.3 } },
  { id: "day", labelKo: "한낮", labelEn: "Daylight", keyKelvin: 5500, fillKelvin: 6100, elevationDeg: 58, ambientLuminance: 0.72, fogDensity: 0.1, volumetricStrength: 0.22, backdropOklch: { l: 0.74, c: 0.04, h: 222 }, emotionBias: { elation: 0.75, flutter: 0.45 } },
  { id: "golden-hour", labelKo: "골든아워", labelEn: "Golden Hour", keyKelvin: 3400, fillKelvin: 4800, elevationDeg: 16, ambientLuminance: 0.56, fogDensity: 0.24, volumetricStrength: 0.64, backdropOklch: { l: 0.54, c: 0.11, h: 58 }, emotionBias: { flutter: 1.05, elation: 0.55, solitude: 0.35 } },
  DEFAULT_TIME_OF_DAY_META,
  { id: "night-neon", labelKo: "네온 야경", labelEn: "Night Neon", keyKelvin: 7400, fillKelvin: 3600, elevationDeg: 28, ambientLuminance: 0.19, fogDensity: 0.44, volumetricStrength: 0.68, backdropOklch: { l: 0.18, c: 0.05, h: 244 }, emotionBias: { suspense: 1.05, tension: 0.85, anger: 0.4 } },
  { id: "snow-overcast", labelKo: "흐린 설원", labelEn: "Snow Overcast", keyKelvin: 7100, fillKelvin: 6800, elevationDeg: 42, ambientLuminance: 0.76, fogDensity: 0.48, volumetricStrength: 0.34, backdropOklch: { l: 0.78, c: 0.03, h: 230 }, emotionBias: { solitude: 0.85, tension: 0.7, suspense: 0.4 } },
];

const DEFAULT_SCENE_LOCATION_META: SceneLocationPresetMeta = {
  id: "rooftop-rain", labelKo: "빗속 옥상", labelEn: "Rooftop Rain", genreKo: "액션·대치", genreEn: "Action Standoff",
  defaultTimeOfDay: "rainy-dusk",
  defaultDialogueKo: "(거센 빗줄기가 옥상 난간을 때린다) 여기서 끝내자. 더는 물러설 곳 없어.",
  defaultDialogueEn: "(Heavy rain lashes the rooftop rail) End it here. Nowhere left to run.",
  keyAzimuthDeg: -48, rimAngleDeg: 148,
  rimPigmentOklch: { l: 0.67, c: 0.2, h: 32 }, rimPigmentNameKo: "주홍", rimPigmentNameEn: "Vermilion",
  baseKeyIntensity: 1.85, baseFillRatio: 0.34, baseRimIntensity: 1.55, fogBoost: 0.12, volumetricBoost: 0.14,
  emotionBias: { tension: 1.2, anger: 0.55, suspense: 0.5 },
};

export const SCENE_LOCATION_PRESETS: readonly SceneLocationPresetMeta[] = [
  DEFAULT_SCENE_LOCATION_META,
  {
    id: "chase-alley", labelKo: "추격 뒷골목", labelEn: "Chase Alley", genreKo: "스릴러·추격", genreEn: "Thriller Chase",
    defaultTimeOfDay: "night-neon",
    defaultDialogueKo: "(젖은 골목 끝에서 발소리가 울린다) 설마 벌써 따라온 거야?! 저쪽 출구로 뛰어!",
    defaultDialogueEn: "(Footsteps echo down the wet alley) Did they catch up already?! Run for the exit!",
    keyAzimuthDeg: 58, rimAngleDeg: -142,
    rimPigmentOklch: { l: 0.74, c: 0.15, h: 196 }, rimPigmentNameKo: "청록 네온", rimPigmentNameEn: "Teal Neon",
    baseKeyIntensity: 1.75, baseFillRatio: 0.28, baseRimIntensity: 1.7, fogBoost: 0.16, volumetricBoost: 0.18,
    emotionBias: { suspense: 1.25, tension: 0.85 },
  },
  {
    id: "sunset-classroom", labelKo: "노을 교실", labelEn: "Sunset Classroom", genreKo: "로맨스·학원", genreEn: "Campus Romance",
    defaultTimeOfDay: "golden-hour",
    defaultDialogueKo: "(창가로 붉은 노을이 번진다) 저기... 방과 후에 잠깐 같이 걸을래? 두근거려서 말이 안 나와.",
    defaultDialogueEn: "(Warm sunset pours through the classroom window) Hey... want to walk home together?",
    keyAzimuthDeg: -62, rimAngleDeg: 132,
    rimPigmentOklch: { l: 0.79, c: 0.16, h: 74 }, rimPigmentNameKo: "황금 앰버", rimPigmentNameEn: "Golden Amber",
    baseKeyIntensity: 1.55, baseFillRatio: 0.56, baseRimIntensity: 1.25, fogBoost: 0.04, volumetricBoost: 0.16,
    emotionBias: { flutter: 1.3, elation: 0.45 },
  },
  {
    id: "dawn-bedroom", labelKo: "새벽 침실", labelEn: "Dawn Bedroom", genreKo: "드라마·독백", genreEn: "Quiet Drama",
    defaultTimeOfDay: "dawn",
    defaultDialogueKo: "(커튼 틈으로 푸른 새벽빛이 스민다) 결국 아무도 없네... 또 혼자 아침을 맞았어.",
    defaultDialogueEn: "(Pale dawn light filters through the curtain) Nobody stayed... another morning alone.",
    keyAzimuthDeg: -72, rimAngleDeg: 156,
    rimPigmentOklch: { l: 0.76, c: 0.09, h: 232 }, rimPigmentNameKo: "새벽 청회", rimPigmentNameEn: "Dawn Cerulean",
    baseKeyIntensity: 1.28, baseFillRatio: 0.46, baseRimIntensity: 0.95, fogBoost: 0.06, volumetricBoost: 0.08,
    emotionBias: { solitude: 1.35, flutter: 0.2 },
  },
  {
    id: "snow-duel", labelKo: "설원 결투", labelEn: "Snow Duel", genreKo: "판타지·무협", genreEn: "Fantasy Duel",
    defaultTimeOfDay: "snow-overcast",
    defaultDialogueKo: "(칼바람과 눈보라가 시야를 가린다) 검을 뽑아라! 오늘 이 설원에서 배신의 대가를 치른다!",
    defaultDialogueEn: "(Blizzard winds cut across the snowfield) Draw your blade! Today you answer for betrayal!",
    keyAzimuthDeg: 40, rimAngleDeg: -155,
    rimPigmentOklch: { l: 0.65, c: 0.21, h: 24 }, rimPigmentNameKo: "선홍 크림슨", rimPigmentNameEn: "Crimson Edge",
    baseKeyIntensity: 1.95, baseFillRatio: 0.44, baseRimIntensity: 1.6, fogBoost: 0.14, volumetricBoost: 0.1,
    emotionBias: { anger: 1.15, tension: 0.95, solitude: 0.4 },
  },
  {
    id: "royal-hall", labelKo: "궁정 대전", labelEn: "Royal Hall", genreKo: "로판·축연", genreEn: "Royal Fantasy",
    defaultTimeOfDay: "day",
    defaultDialogueKo: "(높은 창에서 햇살이 대리석 위로 쏟아진다) 드디어 해냈어! 모두 축배를 들어, 오늘의 승리를 축하하자!",
    defaultDialogueEn: "(Sunbeams flood the marble hall) We finally did it! Raise your glasses to tonight's triumph!",
    keyAzimuthDeg: -34, rimAngleDeg: 162,
    rimPigmentOklch: { l: 0.82, c: 0.15, h: 82 }, rimPigmentNameKo: "샹페인 골드", rimPigmentNameEn: "Champagne Gold",
    baseKeyIntensity: 1.68, baseFillRatio: 0.62, baseRimIntensity: 1.2, fogBoost: -0.02, volumetricBoost: 0.22,
    emotionBias: { elation: 1.3, flutter: 0.45 },
  },
];

const DEFAULT_SCENE_EMOTION_META: SceneEmotionMeta = {
  id: "tension", labelKo: "긴장", labelEn: "Tension",
  keyKelvinShift: 350, keyIntensityMul: 1.08, fillRatioDelta: -0.08, rimIntensityDelta: 0.22, fogDelta: 0.08,
  rimPigmentOklch: { l: 0.67, c: 0.2, h: 32 }, rimPigmentNameKo: "주홍", rimPigmentNameEn: "Vermilion",
  moodPhraseKo: "인물 실루엣과 대치 긴장선을 또렷하게 분리", moodPhraseEn: "carves sharp silhouette tension for standoff framing",
};

export const SCENE_EMOTIONS: readonly SceneEmotionMeta[] = [
  DEFAULT_SCENE_EMOTION_META,
  { id: "flutter", labelKo: "설렘", labelEn: "Flutter", keyKelvinShift: -650, keyIntensityMul: 0.96, fillRatioDelta: 0.14, rimIntensityDelta: 0.1, fogDelta: 0.02, rimPigmentOklch: { l: 0.78, c: 0.15, h: 68 }, rimPigmentNameKo: "살구 앰버", rimPigmentNameEn: "Warm Apricot", moodPhraseKo: "피부 톤을 부드럽게 감싸며 시선 교차의 온기를 강조", moodPhraseEn: "wraps skin tones warmly to elevate romantic closeness" },
  { id: "anger", labelKo: "분노", labelEn: "Anger", keyKelvinShift: -300, keyIntensityMul: 1.18, fillRatioDelta: -0.14, rimIntensityDelta: 0.35, fogDelta: 0.05, rimPigmentOklch: { l: 0.62, c: 0.23, h: 24 }, rimPigmentNameKo: "진홍", rimPigmentNameEn: "Crimson", moodPhraseKo: "강한 명암 대비와 붉은 역광으로 폭발 직전의 압박감을 형성", moodPhraseEn: "builds explosive pressure via high contrast and crimson rim" },
  { id: "solitude", labelKo: "고독", labelEn: "Solitude", keyKelvinShift: 650, keyIntensityMul: 0.86, fillRatioDelta: -0.04, rimIntensityDelta: -0.05, fogDelta: 0.1, rimPigmentOklch: { l: 0.74, c: 0.1, h: 232 }, rimPigmentNameKo: "청회", rimPigmentNameEn: "Slate Cerulean", moodPhraseKo: "채도를 절제한 한색 광원으로 여백과 고립감을 차분히 유지", moodPhraseEn: "uses restrained cool light to deepen quiet isolation" },
  { id: "elation", labelKo: "환희", labelEn: "Elation", keyKelvinShift: -400, keyIntensityMul: 1.06, fillRatioDelta: 0.16, rimIntensityDelta: 0.15, fogDelta: -0.06, rimPigmentOklch: { l: 0.83, c: 0.15, h: 86 }, rimPigmentNameKo: "골드", rimPigmentNameEn: "Sun Gold", moodPhraseKo: "개방적인 필라이트와 황금빛 역광으로 해방감과 생동감을 살림", moodPhraseEn: "opens shadows with golden rim lift for triumphant energy" },
  { id: "suspense", labelKo: "서스펜스", labelEn: "Suspense", keyKelvinShift: 800, keyIntensityMul: 1.02, fillRatioDelta: -0.16, rimIntensityDelta: 0.3, fogDelta: 0.14, rimPigmentOklch: { l: 0.72, c: 0.15, h: 196 }, rimPigmentNameKo: "청록", rimPigmentNameEn: "Teal", moodPhraseKo: "짙은 그림자와 안개 속 청록 림라이트로 미지의 위협을 암시", moodPhraseEn: "suspends hidden threat in deep shadow and teal fog rim" },
];

const EMOTION_LEXICON: Readonly<Record<SceneEmotion, readonly string[]>> = {
  tension: ["대치", "멈춰", "끝내자", "물러서", "경고", "긴장", "결판", "겨누", "위험", "옥상", "숨소리", "빗줄기", "standoff", "freeze", "tension", "end it"],
  flutter: ["두근", "심장", "설레", "좋아해", "같이 걸", "노을", "고백", "손잡", "부끄", "떨려", "방과 후", "따뜻", "flutter", "heartbeat", "blush", "sunset", "together"],
  anger: ["분노", "용서", "배신", "닥쳐", "꺼져", "미쳤", "부숴", "복수", "감히", "화나", "열받", "장난해", "대가", "검을 뽑", "angry", "betray", "revenge", "furious"],
  solitude: ["혼자", "외로", "쓸쓸", "아무도", "침묵", "빈방", "새벽", "떠나", "그리워", "눈물", "텅 빈", "결국", "아침을 맞", "alone", "lonely", "empty", "silence", "dawn"],
  elation: ["환희", "드디어", "해냈", "축하", "만세", "기뻐", "승리", "축배", "최고", "빛나", "영광", "성공", "잔을 들", "victory", "triumph", "elated", "cheer", "celebrate"],
  suspense: ["설마", "누구", "발소리", "따라오", "뒷골목", "어둠", "숨어", "들키", "수상", "비명", "추격", "사라졌", "골목", "출구", "suspense", "footsteps", "chase", "alley", "shadow"],
};

export function getTimeOfDayMeta(id: SceneTimeOfDay): SceneTimeOfDayMeta {
  return SCENE_TIME_OF_DAY_PRESETS.find((item) => item.id === id) ?? DEFAULT_TIME_OF_DAY_META;
}

export function getSceneLocationPreset(id: SceneLocationPresetId): SceneLocationPresetMeta {
  return SCENE_LOCATION_PRESETS.find((item) => item.id === id) ?? DEFAULT_SCENE_LOCATION_META;
}

export function getSceneEmotionMeta(id: SceneEmotion): SceneEmotionMeta {
  return SCENE_EMOTIONS.find((item) => item.id === id) ?? DEFAULT_SCENE_EMOTION_META;
}

function buildRig(input: {
  readonly labelKo: string; readonly labelEn: string;
  readonly keyAzimuthDeg: number; readonly keyElevationDeg: number;
  readonly keyKelvin: number; readonly keyIntensity: number;
  readonly fillKelvin: number; readonly fillRatio: number;
  readonly rimAngleDeg: number; readonly rimIntensity: number;
  readonly rimPigmentOklch: OklchColor; readonly rimPigmentNameKo: string; readonly rimPigmentNameEn: string;
  readonly fogDensity: number; readonly volumetricStrength: number;
  readonly ambientLuminance: number; readonly backdropOklch: OklchColor;
}): SceneLightingRig {
  const keyAzimuthDeg = Math.round(clamp(input.keyAzimuthDeg, -180, 180));
  const keyElevationDeg = Math.round(clamp(input.keyElevationDeg, 5, 85));
  const keyKelvin = Math.round(clamp(input.keyKelvin, 2200, 9500));
  const keyIntensity = round2(clamp(input.keyIntensity, 0.2, 3.0));
  const fillKelvin = Math.round(clamp(input.fillKelvin, 2400, 9500));
  const fillRatio = round2(clamp(input.fillRatio, 0.1, 1.0));
  const rimAngleDeg = Math.round(clamp(input.rimAngleDeg, -180, 180));
  const rimIntensity = round2(clamp(input.rimIntensity, 0, 2.5));
  const fogDensity = clamp01(input.fogDensity);
  const volumetricStrength = clamp01(input.volumetricStrength);
  const ambientLuminance = round2(clamp(input.ambientLuminance, 0.1, 0.9));
  const fillAzimuthDeg = keyAzimuthDeg >= 0 ? Math.max(-180, keyAzimuthDeg - 105) : Math.min(180, keyAzimuthDeg + 105);

  const fillIntensity = round2(keyIntensity * fillRatio);
  const lit = keyIntensity + fillIntensity * 0.32 + ambientLuminance * 0.25;
  const dark = Math.max(0.14, fillIntensity + ambientLuminance * 0.34 + fogDensity * 0.1);
  const shadowContrastRatio = round2(clamp(lit / dark, 1.4, 12.0));
  const colorTempBalance = round2(clamp((5500 - (keyKelvin * 0.68 + fillKelvin * 0.32)) / 3000, -1, 1));

  return {
    labelKo: input.labelKo, labelEn: input.labelEn,
    keyLight: { azimuthDeg: keyAzimuthDeg, elevationDeg: keyElevationDeg, kelvin: keyKelvin, intensity: keyIntensity, colorOklch: kelvinToOklch(keyKelvin, 1) },
    fillLight: { azimuthDeg: fillAzimuthDeg, kelvin: fillKelvin, fillRatio, intensity: fillIntensity, colorOklch: kelvinToOklch(fillKelvin, 0.72) },
    rimLight: {
      angleDeg: rimAngleDeg, intensity: rimIntensity,
      pigmentOklch: { l: clamp01(input.rimPigmentOklch.l), c: round2(clamp(input.rimPigmentOklch.c, 0, 0.3)), h: sanitizeNonVioletHue(input.rimPigmentOklch.h) },
      pigmentNameKo: input.rimPigmentNameKo, pigmentNameEn: input.rimPigmentNameEn,
    },
    atmosphere: {
      fogDensity, volumetricStrength, shadowContrastRatio, colorTempBalance, ambientLuminance,
      backdropOklch: { l: ambientLuminance, c: round2(clamp(input.backdropOklch.c, 0, 0.18)), h: sanitizeNonVioletHue(input.backdropOklch.h) },
    },
  };
}

const DEFAULT_PREV_CUT_PRESET: PreviousCutLightingPreset = {
  id: "neutral-day", labelKo: "전 컷 · 표준 주간", labelEn: "Prev · Neutral Day",
  rig: buildRig({ labelKo: "전 컷 · 표준 주간", labelEn: "Prev Cut · Neutral Day", keyAzimuthDeg: -38, keyElevationDeg: 52, keyKelvin: 5500, keyIntensity: 1.5, fillKelvin: 6000, fillRatio: 0.58, rimAngleDeg: 145, rimIntensity: 0.75, rimPigmentOklch: { l: 0.86, c: 0.04, h: 224 }, rimPigmentNameKo: "은백", rimPigmentNameEn: "Silver Daylight", fogDensity: 0.1, volumetricStrength: 0.18, ambientLuminance: 0.68, backdropOklch: { l: 0.68, c: 0.03, h: 220 } }),
};

export const PREVIOUS_CUT_LIGHTING_PRESETS: readonly PreviousCutLightingPreset[] = [
  DEFAULT_PREV_CUT_PRESET,
  { id: "warm-sunset", labelKo: "전 컷 · 노을 실내", labelEn: "Prev · Warm Sunset", rig: buildRig({ labelKo: "전 컷 · 노을 실내", labelEn: "Prev Cut · Warm Sunset", keyAzimuthDeg: -56, keyElevationDeg: 18, keyKelvin: 3400, keyIntensity: 1.55, fillKelvin: 4600, fillRatio: 0.52, rimAngleDeg: 136, rimIntensity: 1.15, rimPigmentOklch: { l: 0.79, c: 0.16, h: 72 }, rimPigmentNameKo: "황금 앰버", rimPigmentNameEn: "Golden Amber", fogDensity: 0.22, volumetricStrength: 0.56, ambientLuminance: 0.52, backdropOklch: { l: 0.52, c: 0.1, h: 58 } }) },
  { id: "cold-rain", labelKo: "전 컷 · 빗속 야외", labelEn: "Prev · Cold Rain", rig: buildRig({ labelKo: "전 컷 · 빗속 야외", labelEn: "Prev Cut · Cold Rain", keyAzimuthDeg: -45, keyElevationDeg: 36, keyKelvin: 6900, keyIntensity: 1.8, fillKelvin: 7500, fillRatio: 0.34, rimAngleDeg: 150, rimIntensity: 1.4, rimPigmentOklch: { l: 0.68, c: 0.19, h: 32 }, rimPigmentNameKo: "주홍", rimPigmentNameEn: "Vermilion", fogDensity: 0.54, volumetricStrength: 0.54, ambientLuminance: 0.27, backdropOklch: { l: 0.27, c: 0.06, h: 238 } }) },
  { id: "neon-night", labelKo: "전 컷 · 네온 골목", labelEn: "Prev · Neon Night", rig: buildRig({ labelKo: "전 컷 · 네온 골목", labelEn: "Prev Cut · Neon Night", keyAzimuthDeg: 54, keyElevationDeg: 28, keyKelvin: 7400, keyIntensity: 1.75, fillKelvin: 3600, fillRatio: 0.26, rimAngleDeg: -145, rimIntensity: 1.65, rimPigmentOklch: { l: 0.74, c: 0.15, h: 196 }, rimPigmentNameKo: "청록 네온", rimPigmentNameEn: "Teal Neon", fogDensity: 0.48, volumetricStrength: 0.68, ambientLuminance: 0.18, backdropOklch: { l: 0.18, c: 0.05, h: 244 } }) },
];

export function getPreviousCutLightingPreset(id: PreviousCutLightingPresetId): PreviousCutLightingPreset {
  return PREVIOUS_CUT_LIGHTING_PRESETS.find((item) => item.id === id) ?? DEFAULT_PREV_CUT_PRESET;
}

/** 대사/지문 + 시간대 + 장소/장르 프리셋을 분석해 6대 감정 벡터를 산출한다. */
export function analyzeSceneLightingEmotion(input: SceneLightingAnalysisInput): SceneLightingEmotionAnalysis {
  assertLightingInput(input);
  const dialogue = input.dialogue;
  const scenePresetId: SceneLocationPresetId = input.scenePresetId ?? "rooftop-rain";
  const preset = getSceneLocationPreset(scenePresetId);
  const timeOfDay: SceneTimeOfDay = input.timeOfDay ?? preset.defaultTimeOfDay;
  const timeMeta = getTimeOfDayMeta(timeOfDay);

  const scores: Record<SceneEmotion, number> = {
    tension: 0.18, flutter: 0.18, anger: 0.18, solitude: 0.18, elation: 0.18, suspense: 0.18,
  };
  const signals: string[] = [`장소:${preset.labelKo}`, `시간:${timeMeta.labelKo}`];

  for (const emo of SCENE_EMOTIONS) {
    scores[emo.id] += (preset.emotionBias[emo.id] ?? 0) * 0.85 + (timeMeta.emotionBias[emo.id] ?? 0) * 0.75;
  }

  const lower = dialogue.toLowerCase();
  for (const emo of SCENE_EMOTIONS) {
    for (const kw of EMOTION_LEXICON[emo.id]) {
      if (lower.includes(kw)) {
        scores[emo.id] += kw.length >= 3 ? 2.4 : 1.9;
        if (signals.length < 7) signals.push(`어휘:${kw}`);
      }
    }
  }

  if (/\([^()]*(?:비|빗|번개|바람|눈보라|칼|총)[^()]*\)/u.test(dialogue)) {
    scores.tension += 1.05; scores.suspense += 0.55; signals.push("지문:악천후·대치");
  }
  if (/\([^()]*(?:노을|햇살|창가|커튼|달빛)[^()]*\)/u.test(dialogue)) {
    scores.flutter += 0.85; scores.solitude += 0.45; signals.push("지문:자연광");
  }
  if (/\([^()]*(?:발소리|어둠|골목|그림자)[^()]*\)/u.test(dialogue)) {
    scores.suspense += 1.2; scores.tension += 0.5; signals.push("지문:추격·암부");
  }
  if (/[?!]{2,}/u.test(dialogue) && dialogue.includes("?") && dialogue.includes("!")) {
    scores.suspense += 1.1; scores.tension += 0.9; scores.anger += 0.65; signals.push("부호(?!)");
  } else if (/!{2,}/u.test(dialogue)) {
    scores.anger += 1.15; scores.elation += 0.7; scores.tension += 0.65; signals.push("강조감탄(!!)");
  } else if (dialogue.includes("!")) {
    scores.tension += 0.4; scores.elation += 0.45; scores.anger += 0.35;
  }
  if (/(?:\.{2,}|…)/u.test(dialogue)) {
    scores.solitude += 1.05; scores.flutter += 0.45; signals.push("말줄임표(...)");
  }
  if (dialogue.includes("~")) {
    scores.flutter += 0.8; scores.elation += 0.65; signals.push("물결표(~)");
  }

  const ranked = [...SCENE_EMOTIONS].map((m) => ({ id: m.id, score: scores[m.id] })).sort((a, b) => b.score - a.score);
  const top = ranked[0] ?? { id: "tension" as SceneEmotion, score: 1 };
  const second = ranked[1] ?? { id: "suspense" as SceneEmotion, score: 0.5 };
  const total = ranked.reduce((acc, item) => acc + item.score, 0) || 1;

  return {
    dialogue, timeOfDay, scenePresetId,
    emotionVector: {
      tension: round2(scores.tension / total), flutter: round2(scores.flutter / total),
      anger: round2(scores.anger / total), solitude: round2(scores.solitude / total),
      elation: round2(scores.elation / total), suspense: round2(scores.suspense / total),
    },
    primaryEmotion: top.id, secondaryEmotion: second.id,
    confidence: clamp01(0.6 + Math.min(0.36, Math.max(0, top.score - second.score) * 0.12)),
    detectedSignals: signals,
  };
}

/** 인물 얼굴 명암 대비비와 대사 말풍선 영역 배경 명도를 점검해 경고·권고를 산출한다. */
export function auditLightingReadability(input: SceneLightingRig): LightingReadabilityAudit {
  const rig = validateLightingRig(input);
  const faceContrastRatio = rig.atmosphere.shadowContrastRatio;
  const faceContrastStatus: FaceContrastStatus =
    faceContrastRatio < 1.85 ? "flat" : faceContrastRatio > 7.2 ? "harsh" : "optimal";

  const bubbleZoneLuminance = clamp01(
    rig.atmosphere.ambientLuminance * 0.78 + rig.atmosphere.fogDensity * 0.14 + rig.atmosphere.volumetricStrength * 0.08,
  );
  const bgLinear = Math.pow(bubbleZoneLuminance, 2.2);
  const whiteLinear = Math.pow(0.96, 2.2);
  const bubbleContrastRatio = round2((Math.max(whiteLinear, bgLinear) + 0.05) / (Math.min(whiteLinear, bgLinear) + 0.05));

  const bubbleReadabilityStatus: BubbleReadabilityStatus =
    bubbleZoneLuminance >= 0.82 || bubbleContrastRatio < 1.45
      ? "warning"
      : bubbleZoneLuminance >= 0.72 || (rig.atmosphere.fogDensity >= 0.65 && rig.atmosphere.volumetricStrength >= 0.65)
        ? "caution"
        : "clear";

  const warningsKo: string[] = [];
  const warningsEn: string[] = [];
  const recommendationsKo: string[] = [];
  const recommendationsEn: string[] = [];

  if (faceContrastStatus === "harsh") {
    warningsKo.push(`얼굴 명암 대비비(${faceContrastRatio.toFixed(1)}:1)가 높아 눈·입 선화가 암부에 묻힐 수 있습니다.`);
    warningsEn.push(`High facial contrast (${faceContrastRatio.toFixed(1)}:1) may bury linework in shadow.`);
    recommendationsKo.push("필라이트 비율을 35% 이상으로 올려 그림자 측 표정 선을 살리세요.");
    recommendationsEn.push("Raise fill ratio above 35% to keep shadow-side lines legible.");
  } else if (faceContrastStatus === "flat") {
    warningsKo.push(`얼굴 명암 대비비(${faceContrastRatio.toFixed(1)}:1)가 낮아 인물이 평면적으로 보일 수 있습니다.`);
    warningsEn.push(`Low facial contrast (${faceContrastRatio.toFixed(1)}:1) flattens facial depth.`);
    recommendationsKo.push("키라이트 강도를 0.25 높이거나 필라이트 비율을 낮춰 입체감을 잡으세요.");
    recommendationsEn.push("Increase key intensity by 0.25 or lower fill ratio to restore volume.");
  }

  if (bubbleReadabilityStatus === "warning") {
    warningsKo.push(`말풍선 상단 배경 명도(${Math.round(bubbleZoneLuminance * 100)}%)가 매우 밝아 흰색 말풍선 경계가 흐려집니다.`);
    warningsEn.push(`High bubble-zone luminance (${Math.round(bubbleZoneLuminance * 100)}%) blurs white speech-bubble edges.`);
    recommendationsKo.push("말풍선 테두리를 2px 먹선으로 보강하거나 상단 배경 명도를 10% 낮추세요.");
    recommendationsEn.push("Use a 2px ink bubble stroke or dim upper backdrop lightness by 10%.");
  } else if (bubbleReadabilityStatus === "caution") {
    warningsKo.push(`말풍선 영역 명도(${Math.round(bubbleZoneLuminance * 100)}%)·안개 광량이 높아 얇은 대사 글꼴 대비를 확인해야 합니다.`);
    warningsEn.push(`Elevated bubble-zone luminance (${Math.round(bubbleZoneLuminance * 100)}%) warrants checking thin dialogue strokes.`);
    recommendationsKo.push("말풍선 외곽선과 얕은 그림자를 유지하고 볼류메트릭 광선을 대사 영역 바깥으로 배치하세요.");
    recommendationsEn.push("Keep bubble borders crisp and steer volumetric beams away from text zones.");
  }

  if (warningsKo.length === 0) {
    recommendationsKo.push("입력한 조명 매개변수 예제에서는 두 지표가 기준 범위입니다. 실제 원고의 얼굴·말풍선 영역은 별도로 확인하세요.");
    recommendationsEn.push("Both parameter-based example metrics meet the model thresholds. Check the actual artwork's face and dialogue areas separately.");
  }

  const overallGrade: ReadabilityGrade =
    faceContrastStatus === "harsh" || bubbleReadabilityStatus === "warning"
      ? "warning"
      : faceContrastStatus === "flat" || bubbleReadabilityStatus === "caution"
        ? "caution"
        : "pass";

  return {
    faceContrastRatio, faceContrastStatus, bubbleZoneLuminance, bubbleContrastRatio,
    bubbleReadabilityStatus, overallGrade,
    recommendedBubbleStyleKo: bubbleZoneLuminance >= 0.74
      ? "짙은 2px 먹선 테두리 + 옅은 외곽 그림자 말풍선 권장"
      : bubbleZoneLuminance <= 0.28
        ? "흰색 말풍선 대비 최상 · 야경 눈부심 방지를 위해 미세 난색 종이톤(L 0.95) 권장"
        : "표준 흰색 말풍선 + 1.5px 먹선 테두리로 가독성 안정",
    recommendedBubbleStyleEn: bubbleZoneLuminance >= 0.74
      ? "Use 2px dark ink outline + subtle drop shadow on speech bubbles"
      : bubbleZoneLuminance <= 0.28
        ? "Strong night contrast — warm paper white (L 0.95) prevents glare"
        : "Standard white bubble with 1.5px ink border reads cleanly",
    warningsKo, warningsEn, recommendationsKo, recommendationsEn,
  };
}

/** 전 컷 조명과 현재 컷 조명을 비교해 색온도·대비비·명도 연속성을 진단한다. */
export function compareLightingCuts(previousInput: SceneLightingRig, activeInput: SceneLightingRig): LightingCutComparison {
  const previousRig = validateLightingRig(previousInput), activeRig = validateLightingRig(activeInput);
  const keyKelvinDeltaK = Math.round(activeRig.keyLight.kelvin - previousRig.keyLight.kelvin);
  const contrastDelta = round2(activeRig.atmosphere.shadowContrastRatio - previousRig.atmosphere.shadowContrastRatio);
  const luminanceDelta = round2(activeRig.atmosphere.ambientLuminance - previousRig.atmosphere.ambientLuminance);

  const penalty =
    Math.min(44, Math.abs(keyKelvinDeltaK) / 75)
    + Math.min(28, Math.abs(contrastDelta) * 5.2)
    + Math.min(28, Math.abs(luminanceDelta) * 52);
  const continuityScore = Math.round(clamp(100 - penalty, 0, 100));
  const shiftSeverity: CutShiftSeverity =
    continuityScore >= 72 ? "smooth" : continuityScore >= 46 ? "notice" : "dramatic-shift";

  const kSign = keyKelvinDeltaK >= 0 ? "+" : "";
  const cSign = contrastDelta >= 0 ? "+" : "";
  return {
    keyKelvinDeltaK, contrastDelta, luminanceDelta, continuityScore, shiftSeverity,
    summaryKo: shiftSeverity === "smooth"
      ? `전 컷과 자연스럽게 이어집니다 (색온도 ${kSign}${keyKelvinDeltaK}K · 대비비 ${cSign}${contrastDelta.toFixed(1)}).`
      : shiftSeverity === "notice"
        ? `전 컷 대비 조명 변화가 감지됩니다 (색온도 ${kSign}${keyKelvinDeltaK}K · 대비비 ${cSign}${contrastDelta.toFixed(1)}). 감정 전환 컷에 적합합니다.`
        : `전 컷과 급격한 조명 전환(${kSign}${keyKelvinDeltaK}K · 대비비 ${cSign}${contrastDelta.toFixed(1)})입니다. 같은 장소라면 필라이트·색온도를 소폭 맞추세요.`,
    summaryEn: shiftSeverity === "smooth"
      ? `Smooth cut continuity (Key ${kSign}${keyKelvinDeltaK}K, contrast ${cSign}${contrastDelta.toFixed(1)}).`
      : shiftSeverity === "notice"
        ? `Noticeable lighting shift (Key ${kSign}${keyKelvinDeltaK}K, contrast ${cSign}${contrastDelta.toFixed(1)}) suited for mood turns.`
        : `Dramatic lighting jump (Key ${kSign}${keyKelvinDeltaK}K, contrast ${cSign}${contrastDelta.toFixed(1)}). Blend fill/kelvin if staying in one room.`,
  };
}

function describeKelvinToneKo(kelvin: number): string {
  return kelvin <= 3600 ? `따뜻한 ${kelvin}K` : kelvin <= 5800 ? `선명한 ${kelvin}K` : `차가운 ${kelvin}K`;
}

/** 대사·시간대·장소 분석 결과로부터 비파괴 Top-3 3D 조명·분위기 연출 제안을 생성한다. */
export function proposeSceneLightingTop3(
  input: SceneLightingAnalysisInput,
  previousCut?: SceneLightingRig | null,
): SceneLightingProposalBundle {
  const analysis = analyzeSceneLightingEmotion(input);
  const preset = getSceneLocationPreset(analysis.scenePresetId);
  const timeMeta = getTimeOfDayMeta(analysis.timeOfDay);
  const primaryEmo = getSceneEmotionMeta(analysis.primaryEmotion);
  const secondaryEmo = getSceneEmotionMeta(analysis.secondaryEmotion);

  const keyKelvin1 = Math.round(clamp(timeMeta.keyKelvin + primaryEmo.keyKelvinShift * 0.45, 2400, 9200));
  const fillKelvin1 = Math.round(clamp(timeMeta.fillKelvin + secondaryEmo.keyKelvinShift * 0.25, 2600, 9200));
  const keyIntensity1 = round2(clamp(preset.baseKeyIntensity * primaryEmo.keyIntensityMul, 0.7, 2.6));
  const fillRatio1 = round2(clamp(preset.baseFillRatio + primaryEmo.fillRatioDelta, 0.22, 0.78));
  const rimIntensity1 = round2(clamp(preset.baseRimIntensity + primaryEmo.rimIntensityDelta, 0.4, 2.3));
  const fog1 = clamp01(timeMeta.fogDensity + preset.fogBoost + primaryEmo.fogDelta);
  const vol1 = clamp01(timeMeta.volumetricStrength + preset.volumetricBoost);

  const rig1 = buildRig({
    labelKo: `${preset.labelKo} · 시네마틱 3점 조명`, labelEn: `${preset.labelEn} · Cinematic 3-Point`,
    keyAzimuthDeg: preset.keyAzimuthDeg, keyElevationDeg: timeMeta.elevationDeg,
    keyKelvin: keyKelvin1, keyIntensity: keyIntensity1, fillKelvin: fillKelvin1, fillRatio: fillRatio1,
    rimAngleDeg: preset.rimAngleDeg, rimIntensity: rimIntensity1,
    rimPigmentOklch: preset.rimPigmentOklch, rimPigmentNameKo: preset.rimPigmentNameKo, rimPigmentNameEn: preset.rimPigmentNameEn,
    fogDensity: fog1, volumetricStrength: vol1, ambientLuminance: timeMeta.ambientLuminance, backdropOklch: timeMeta.backdropOklch,
  });

  const rig2 = buildRig({
    labelKo: `${preset.labelKo} · 고대비 역광 강조`, labelEn: `${preset.labelEn} · Dramatic Rim Split`,
    keyAzimuthDeg: preset.keyAzimuthDeg + (preset.keyAzimuthDeg < 0 ? -16 : 16),
    keyElevationDeg: clamp(timeMeta.elevationDeg + 12, 12, 76),
    keyKelvin: clamp(keyKelvin1 + (primaryEmo.keyKelvinShift >= 0 ? 450 : -450), 2300, 9400),
    keyIntensity: clamp(keyIntensity1 + 0.35, 0.9, 2.85), fillKelvin: fillKelvin1, fillRatio: clamp(fillRatio1 - 0.14, 0.18, 0.52),
    rimAngleDeg: preset.rimAngleDeg, rimIntensity: clamp(rimIntensity1 + 0.45, 0.8, 2.45),
    rimPigmentOklch: primaryEmo.rimPigmentOklch, rimPigmentNameKo: primaryEmo.rimPigmentNameKo, rimPigmentNameEn: primaryEmo.rimPigmentNameEn,
    fogDensity: clamp01(fog1 + 0.12), volumetricStrength: clamp01(vol1 + 0.16),
    ambientLuminance: clamp(timeMeta.ambientLuminance - 0.08, 0.14, 0.72), backdropOklch: timeMeta.backdropOklch,
  });

  const safeBubbleLum = clamp(timeMeta.ambientLuminance, 0.24, 0.64);
  const rig3 = buildRig({
    labelKo: `${preset.labelKo} · 대사·표정 가독성 우선`, labelEn: `${preset.labelEn} · Dialogue Readability Safe`,
    keyAzimuthDeg: Math.round(preset.keyAzimuthDeg * 0.75), keyElevationDeg: clamp(timeMeta.elevationDeg + 6, 22, 56),
    keyKelvin: Math.round(keyKelvin1 * 0.7 + 5200 * 0.3), keyIntensity: clamp(keyIntensity1 * 0.88, 0.95, 2.0),
    fillKelvin: Math.round(fillKelvin1 * 0.7 + 5400 * 0.3), fillRatio: clamp(Math.max(fillRatio1 + 0.18, 0.52), 0.5, 0.72),
    rimAngleDeg: preset.rimAngleDeg, rimIntensity: clamp(rimIntensity1 * 0.78, 0.5, 1.5),
    rimPigmentOklch: preset.rimPigmentOklch, rimPigmentNameKo: preset.rimPigmentNameKo, rimPigmentNameEn: preset.rimPigmentNameEn,
    fogDensity: clamp01(Math.min(fog1, 0.36)), volumetricStrength: clamp01(Math.min(vol1, 0.44)),
    ambientLuminance: safeBubbleLum,
    backdropOklch: { l: safeBubbleLum, c: round2(timeMeta.backdropOklch.c * 0.85), h: timeMeta.backdropOklch.h },
  });

  const proposalKey = JSON.stringify([analysis.scenePresetId, analysis.timeOfDay, analysis.primaryEmotion, analysis.secondaryEmotion]);
  const p1: SceneLightingProposal = {
    id: `lighting-p1-${proposalKey}`, rank: 1, variant: "cinematic-key",
    titleKo: "정석 시네마틱 3점 연출", titleEn: "Cinematic 3-Point Key",
    confidence: clamp01(Math.max(0.8, analysis.confidence)), rig: rig1,
    reasonKo: `${preset.labelKo}(${timeMeta.labelKo}) ${primaryEmo.labelKo} 장면에 ${describeKelvinToneKo(rig1.keyLight.kelvin)} 키라이트와 ${rig1.rimLight.pigmentNameKo} 림라이트로 ${primaryEmo.moodPhraseKo}합니다.`,
    reasonEn: `Pairs ${rig1.keyLight.kelvin}K key light with ${rig1.rimLight.pigmentNameEn} rim on ${preset.labelEn} (${timeMeta.labelEn}) — ${primaryEmo.moodPhraseEn}.`,
    readabilityAudit: auditLightingReadability(rig1), requiresAuthorApproval: true,
  };

  const p2: SceneLightingProposal = {
    id: `lighting-p2-${proposalKey}`, rank: 2, variant: "dramatic-rim",
    titleKo: "고대비 역광·림 강조안", titleEn: "Dramatic Rim Contrast",
    confidence: clamp01(Math.max(0.71, p1.confidence - 0.06)), rig: rig2,
    reasonKo: `필라이트 비율을 ${Math.round(rig2.fillLight.fillRatio * 100)}%로 낮추고 ${rig2.rimLight.pigmentNameKo} 림라이트(${rig2.rimLight.intensity.toFixed(1)})와 안개 광선을 키워 클라이맥스 실루엣을 극대화합니다.`,
    reasonEn: `Drops fill to ${Math.round(rig2.fillLight.fillRatio * 100)}% and boosts ${rig2.rimLight.pigmentNameEn} rim (${rig2.rimLight.intensity.toFixed(1)}) with volumetric haze for climax impact.`,
    readabilityAudit: auditLightingReadability(rig2), requiresAuthorApproval: true,
  };

  const p3: SceneLightingProposal = {
    id: `lighting-p3-${proposalKey}`, rank: 3, variant: "readable-soft",
    titleKo: "대사·표정 가독성 우선안", titleEn: "Dialogue & Face Readability",
    confidence: clamp01(Math.max(0.66, p2.confidence - 0.05)), rig: rig3,
    reasonKo: `얼굴 대비비(${rig3.atmosphere.shadowContrastRatio.toFixed(1)}:1)와 말풍선 영역 명도(${Math.round(rig3.atmosphere.ambientLuminance * 100)}%)를 안정권에 맞춰 대사량이 많은 컷에서도 표정과 글자가 선명하게 읽힙니다.`,
    reasonEn: `Keeps facial contrast (${rig3.atmosphere.shadowContrastRatio.toFixed(1)}:1) and bubble-zone luminance (${Math.round(rig3.atmosphere.ambientLuminance * 100)}%) balanced for dialogue-heavy panels.`,
    readabilityAudit: auditLightingReadability(rig3), requiresAuthorApproval: true,
  };

  return {
    analysis,
    proposals: [p1, p2, p3],
    previousCutComparison: previousCut ? compareLightingCuts(previousCut, rig1) : null,
  };
}

/** 비파괴 컷 조명 어시스턴트 세션을 초기화한다. */
export function createLightingSession(initialBaseline?: SceneLightingRig, previousCut?: SceneLightingRig): SceneLightingSession {
  const defaultBaseline = initialBaseline ?? buildRig({
    labelKo: "작가 원본 기본 조명", labelEn: "Author Baseline Lighting",
    keyAzimuthDeg: -35, keyElevationDeg: 48, keyKelvin: 5400, keyIntensity: 1.68,
    fillKelvin: 5900, fillRatio: 0.44, rimAngleDeg: 148, rimIntensity: 0.85,
    rimPigmentOklch: { l: 0.84, c: 0.05, h: 224 }, rimPigmentNameKo: "중립 은백", rimPigmentNameEn: "Neutral Silver",
    fogDensity: 0.12, volumetricStrength: 0.16, ambientLuminance: 0.52, backdropOklch: { l: 0.52, c: 0.03, h: 224 },
  });
  return {
    baselineRig: validateLightingRig(defaultBaseline), currentRig: validateLightingRig(defaultBaseline), previousCutRig: validateLightingRig(previousCut ?? DEFAULT_PREV_CUT_PRESET.rig),
    previewingProposalId: null, previewRig: null, appliedProposalId: null,
    status: "idle", isTweaked: false, canRevert: false, history: [],
  };
}

/** 제안안을 비파괴 미리보기한다(원본·적용 릭은 건드리지 않음). 동일 ID 재호출 또는 null이면 해제. */
export function previewLightingProposal(session: SceneLightingSession, proposal: SceneLightingProposal | null): SceneLightingSession {
  assertLightingSession(session);
  if (proposal) assertLightingProposal(proposal);
  if (!proposal || session.previewingProposalId === proposal.id) {
    const restored: LightingSessionStatus = session.isTweaked ? "tweaked" : session.appliedProposalId || session.canRevert ? "applied" : "idle";
    return { ...session, previewingProposalId: null, previewRig: null, status: restored };
  }
  return { ...session, previewingProposalId: proposal.id, previewRig: proposal.rig, status: "previewing" };
}

/** 작가 승인으로 선택한 조명 제안을 비파괴 적용한다(baselineRig 보존). */
export function applyLightingProposal(session: SceneLightingSession, proposal: SceneLightingProposal): SceneLightingSession {
  assertLightingSession(session); assertLightingProposal(proposal);
  return {
    ...session,
    currentRig: proposal.rig, previewingProposalId: null, previewRig: null,
    appliedProposalId: proposal.id, status: "applied", isTweaked: false, canRevert: true,
    history: [...session.history.slice(-19), { step: session.history.length + 1, action: "apply", proposalId: proposal.id, labelKo: proposal.titleKo }],
  };
}

/** 적용·미세조정한 조명을 원본 baselineRig로 1클릭 복원한다. */
export function revertLightingProposal(session: SceneLightingSession): SceneLightingSession {
  assertLightingSession(session);
  return {
    ...session,
    currentRig: session.baselineRig, previewingProposalId: null, previewRig: null,
    appliedProposalId: null, status: "reverted", isTweaked: false, canRevert: false,
    history: [...session.history.slice(-19), { step: session.history.length + 1, action: "revert", proposalId: null, labelKo: "원본 조명 되돌리기" }],
  };
}

/** 키·필·림 강도 및 색온도(K)·안개 밀도를 비파괴 미세 조정한다. */
export function tweakLightingRig(session: SceneLightingSession, patch: LightingRigTweakPatch): SceneLightingSession {
  assertLightingSession(session); assertLightingPatch(patch);
  const base = session.previewRig ?? session.currentRig;
  const nextRig = buildRig({
    labelKo: base.labelKo.includes("미세 조정") ? base.labelKo : `${base.labelKo} · 미세 조정`,
    labelEn: base.labelEn.includes("Tweaked") ? base.labelEn : `${base.labelEn} · Tweaked`,
    keyAzimuthDeg: patch.keyAzimuthDeg ?? base.keyLight.azimuthDeg, keyElevationDeg: base.keyLight.elevationDeg,
    keyKelvin: patch.keyKelvin ?? base.keyLight.kelvin, keyIntensity: patch.keyIntensity ?? base.keyLight.intensity,
    fillKelvin: patch.fillKelvin ?? base.fillLight.kelvin, fillRatio: patch.fillRatio ?? base.fillLight.fillRatio,
    rimAngleDeg: base.rimLight.angleDeg, rimIntensity: patch.rimIntensity ?? base.rimLight.intensity,
    rimPigmentOklch: { l: base.rimLight.pigmentOklch.l, c: base.rimLight.pigmentOklch.c, h: sanitizeNonVioletHue(patch.rimHueDeg ?? base.rimLight.pigmentOklch.h) },
    rimPigmentNameKo: base.rimLight.pigmentNameKo, rimPigmentNameEn: base.rimLight.pigmentNameEn,
    fogDensity: patch.fogDensity ?? base.atmosphere.fogDensity, volumetricStrength: base.atmosphere.volumetricStrength,
    ambientLuminance: base.atmosphere.ambientLuminance, backdropOklch: base.atmosphere.backdropOklch,
  });
  return {
    ...session,
    currentRig: nextRig, previewingProposalId: null, previewRig: null,
    status: "tweaked", isTweaked: true, canRevert: true,
    history: [...session.history.slice(-19), { step: session.history.length + 1, action: "tweak", proposalId: session.appliedProposalId, labelKo: "조명 릭 미세 조정" }],
  };
}

/** 전 컷 기준 조명을 교체한다. */
export function updateLightingPreviousCut(session: SceneLightingSession, previousCutRig: SceneLightingRig): SceneLightingSession {
  assertLightingSession(session);
  return { ...session, previousCutRig: validateLightingRig(previousCutRig) };
}

function sphericalToCartesianThreeJs(azimuthDeg: number, elevationDeg: number, radius = 8): readonly [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const cosEl = Math.cos(el);
  return [round2(radius * cosEl * Math.sin(az)), round2(radius * Math.sin(el)), round2(radius * cosEl * Math.cos(az))];
}

/** Three.js / Blender 3D 배경 릭 연동용 결정론적 JSON 패키지를 생성한다. */
export function exportLightingRigJson(
  session: SceneLightingSession,
  bundle?: SceneLightingProposalBundle,
): string {
  assertLightingSession(session);
  if (bundle) assertLightingBundle(bundle);
  const activeRig = validateLightingRig(session.previewRig ?? session.currentRig);
  const readabilityAudit = auditLightingReadability(activeRig);
  const previousCutComparison = compareLightingCuts(session.previousCutRig, activeRig);

  const keyPos = sphericalToCartesianThreeJs(activeRig.keyLight.azimuthDeg, activeRig.keyLight.elevationDeg, 10);
  const fillPos = sphericalToCartesianThreeJs(activeRig.fillLight.azimuthDeg, Math.max(12, activeRig.keyLight.elevationDeg * 0.65), 9);
  const rimPos = sphericalToCartesianThreeJs(activeRig.rimLight.angleDeg, 26, 7.5);

  const payload = {
    schema: "toonstudio.scene-lighting-rig.v1",
    requiresAuthorApproval: true,
    dataSourceKind: "cpu-calculation-example", sceneApplied: false, rendererCompatibilityVerified: false,
    analysisScope: "latest-proposal-input",
    violetSlopPct: round2([activeRig.keyLight.colorOklch, activeRig.fillLight.colorOklch, activeRig.rimLight.pigmentOklch, activeRig.atmosphere.backdropOklch].filter(color => isVioletSlopHue(color.h)).length * 25),
    sessionStatus: session.status,
    appliedProposalId: session.appliedProposalId,
    isTweaked: session.isTweaked,
    canRevert: session.canRevert,
    analysis: bundle
      ? {
          scenePresetId: bundle.analysis.scenePresetId, timeOfDay: bundle.analysis.timeOfDay,
          primaryEmotion: bundle.analysis.primaryEmotion, secondaryEmotion: bundle.analysis.secondaryEmotion,
          emotionVector: {
            tension: bundle.analysis.emotionVector.tension, flutter: bundle.analysis.emotionVector.flutter,
            anger: bundle.analysis.emotionVector.anger, solitude: bundle.analysis.emotionVector.solitude,
            elation: bundle.analysis.emotionVector.elation, suspense: bundle.analysis.emotionVector.suspense,
          },
        }
      : null,
    activeRig: {
      labelKo: activeRig.labelKo, labelEn: activeRig.labelEn,
      keyLight: { ...activeRig.keyLight, colorCss: formatOklch(activeRig.keyLight.colorOklch) },
      fillLight: { ...activeRig.fillLight, colorCss: formatOklch(activeRig.fillLight.colorOklch) },
      rimLight: { ...activeRig.rimLight, pigmentCss: formatOklch(activeRig.rimLight.pigmentOklch) },
      atmosphere: { ...activeRig.atmosphere, backdropCss: formatOklch(activeRig.atmosphere.backdropOklch) },
    },
    threeJs: {
      keyDirectionalLight: { position: keyPos, intensity: activeRig.keyLight.intensity, kelvin: activeRig.keyLight.kelvin, colorOklch: formatOklch(activeRig.keyLight.colorOklch), castShadow: true },
      fillDirectionalLight: { position: fillPos, intensity: activeRig.fillLight.intensity, kelvin: activeRig.fillLight.kelvin, colorOklch: formatOklch(activeRig.fillLight.colorOklch), castShadow: false },
      rimSpotLight: { position: rimPos, intensity: activeRig.rimLight.intensity, angleRad: 0.62, penumbra: 0.45, colorOklch: formatOklch(activeRig.rimLight.pigmentOklch) },
      fogExp2: { density: round2(activeRig.atmosphere.fogDensity * 0.045), volumetricStrength: activeRig.atmosphere.volumetricStrength, colorOklch: formatOklch(activeRig.atmosphere.backdropOklch) },
    },
    blender: {
      engineHint: "EEVEE_NEXT",
      keySunOrArea: { rotationEulerDeg: [round2(90 - activeRig.keyLight.elevationDeg), 0, activeRig.keyLight.azimuthDeg], energyWatts: Math.round(activeRig.keyLight.intensity * 180), blackbodyKelvin: activeRig.keyLight.kelvin },
      fillArea: { rotationEulerDeg: [round2(90 - activeRig.keyLight.elevationDeg * 0.65), 0, activeRig.fillLight.azimuthDeg], energyWatts: Math.round(activeRig.fillLight.intensity * 140), blackbodyKelvin: activeRig.fillLight.kelvin },
      rimArea: { locationMeters: [rimPos[0], round2(-rimPos[2]), rimPos[1]], energyWatts: Math.round(activeRig.rimLight.intensity * 210), pigmentOklch: formatOklch(activeRig.rimLight.pigmentOklch) },
      worldVolumeScatter: { density: round2(activeRig.atmosphere.fogDensity * 0.08), anisotropy: round2(activeRig.atmosphere.volumetricStrength * 0.65), backdropOklch: formatOklch(activeRig.atmosphere.backdropOklch) },
    },
    readabilityAudit,
    previousCutComparison,
  };

  return JSON.stringify(payload, null, 2);
}
