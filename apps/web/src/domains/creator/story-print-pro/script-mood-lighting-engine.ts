/**
 * 대본 무드·시간대 키워드 → 실시간 캔버스 Kelvin 색온도(2700K~8500K)·그림자 틴트·3D↔2D 림라이트 매핑 엔진.
 *
 * 100% 브라우저 로컬 결정적 색과학 파이프라인(₩0):
 * - Planckian 흑체 근사(Tanner Helland 보정)로 2700K~8500K 연속 색온도 산출
 * - 3D 씬 직사광·반구 환경광 벡터와 2D 캔버스 투영 림라이트 법선·오버레이 파라미터를 동시 동기화
 */

import type { StoryboardCut, StoryboardPlan } from "./script-to-storyboard-engine";

export type ScriptMoodPresetId =
  | "dawn"
  | "sunset"
  | "tension"
  | "flashback"
  | "romance"
  | "night"
  | "daylight"
  | "rain-melancholy";

export interface RgbColor8 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface MoodWeightContribution {
  readonly presetId: ScriptMoodPresetId;
  readonly weight: number;
  readonly matchedKeywords: readonly string[];
}

export interface MoodDetectionResult {
  readonly primaryMood: ScriptMoodPresetId;
  readonly contributions: readonly MoodWeightContribution[];
  readonly confidence01: number;
}

export interface KeyLightSpec {
  readonly kelvin: number;
  readonly rgb: RgbColor8;
  readonly hex: string;
  readonly intensity: number;
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  readonly direction3D: Vec3;
}

export interface ShadowTintSpec {
  readonly rgb: RgbColor8;
  readonly hex: string;
  readonly multiplyOpacity: number;
  readonly shadowLift: number;
  readonly contrastBoost: number;
}

export interface AmbientHemisphereSpec {
  readonly skyRgb: RgbColor8;
  readonly skyHex: string;
  readonly groundRgb: RgbColor8;
  readonly groundHex: string;
  readonly keyToFillRatio: number;
}

export interface RimLight3dTo2dMapping {
  readonly rgb: RgbColor8;
  readonly hex: string;
  readonly intensity: number;
  readonly direction3D: Vec3;
  readonly fresnelPower: number;
  readonly projectedNormal2D: Vec2;
  readonly canvasEdgeWidthPx: number;
  readonly canvasBlendMode: "screen" | "soft-light" | "color-dodge";
  readonly canvasOpacity: number;
}

export interface CanvasColorGradeSpec {
  readonly exposureEv: number;
  readonly saturation: number;
  readonly contrast: number;
  readonly vignetteStrength: number;
  readonly bloomThreshold: number;
}

export interface MoodLightingRig {
  readonly primaryMood: ScriptMoodPresetId;
  readonly labelKo: string;
  readonly kelvin: number;
  readonly contributions: readonly MoodWeightContribution[];
  readonly keyLight: KeyLightSpec;
  readonly shadowTint: ShadowTintSpec;
  readonly ambient: AmbientHemisphereSpec;
  readonly rimLight3dTo2d: RimLight3dTo2dMapping;
  readonly colorGrade: CanvasColorGradeSpec;
}

export interface CutMoodLightingEntry {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly sceneNumber: number;
  readonly rig: MoodLightingRig;
  readonly kelvinDeltaFromPrev: number;
}

export const MIN_KELVIN = 2700;
export const MAX_KELVIN = 8500;

interface MoodPresetDefinition {
  readonly id: ScriptMoodPresetId;
  readonly labelKo: string;
  readonly keywords: readonly string[];
  readonly kelvin: number;
  readonly keyIntensity: number;
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  readonly shadowRgb: RgbColor8;
  readonly shadowOpacity: number;
  readonly shadowLift: number;
  readonly shadowContrast: number;
  readonly skyRgb: RgbColor8;
  readonly groundRgb: RgbColor8;
  readonly keyToFillRatio: number;
  readonly rimRgb: RgbColor8;
  readonly rimIntensity: number;
  readonly rimFresnelPower: number;
  readonly rimEdgeWidthPx: number;
  readonly rimBlendMode: "screen" | "soft-light" | "color-dodge";
  readonly rimOpacity: number;
  readonly exposureEv: number;
  readonly saturation: number;
  readonly contrast: number;
  readonly vignetteStrength: number;
  readonly bloomThreshold: number;
}

export const SCRIPT_MOOD_PRESETS: Readonly<Record<ScriptMoodPresetId, MoodPresetDefinition>> = {
  dawn: {
    id: "dawn",
    labelKo: "새벽 · 여명",
    keywords: ["새벽", "여명", "동틀녘", "아침이슬", "이른 아침", "안개", "dawn", "daybreak", "early morning"],
    kelvin: 4100,
    keyIntensity: 0.95,
    elevationDeg: 16,
    azimuthDeg: 58,
    shadowRgb: { r: 68, g: 82, b: 124 },
    shadowOpacity: 0.34,
    shadowLift: 0.06,
    shadowContrast: 1.04,
    skyRgb: { r: 158, g: 184, b: 224 },
    groundRgb: { r: 112, g: 102, b: 118 },
    keyToFillRatio: 2.6,
    rimRgb: { r: 255, g: 196, b: 162 },
    rimIntensity: 0.82,
    rimFresnelPower: 2.8,
    rimEdgeWidthPx: 2.5,
    rimBlendMode: "screen",
    rimOpacity: 0.42,
    exposureEv: -0.1,
    saturation: 0.94,
    contrast: 1.02,
    vignetteStrength: 0.18,
    bloomThreshold: 0.82,
  },
  sunset: {
    id: "sunset",
    labelKo: "노을 · 황혼",
    keywords: ["노을", "석양", "해질녘", "황혼", "붉은 하늘", "저녁놀", "sunset", "golden hour", "dusk"],
    kelvin: 2900,
    keyIntensity: 1.25,
    elevationDeg: 14,
    azimuthDeg: 248,
    shadowRgb: { r: 66, g: 48, b: 96 },
    shadowOpacity: 0.44,
    shadowLift: 0.03,
    shadowContrast: 1.14,
    skyRgb: { r: 238, g: 142, b: 108 },
    groundRgb: { r: 84, g: 58, b: 68 },
    keyToFillRatio: 4.2,
    rimRgb: { r: 255, g: 168, b: 92 },
    rimIntensity: 1.18,
    rimFresnelPower: 2.3,
    rimEdgeWidthPx: 3.5,
    rimBlendMode: "color-dodge",
    rimOpacity: 0.56,
    exposureEv: 0.05,
    saturation: 1.16,
    contrast: 1.12,
    vignetteStrength: 0.24,
    bloomThreshold: 0.72,
  },
  tension: {
    id: "tension",
    labelKo: "긴장 · 대치",
    keywords: ["긴장", "위기", "추격", "공포", "살기", "경고", "대치", "불안", "심장", "tension", "tense", "suspense", "danger"],
    kelvin: 6800,
    keyIntensity: 1.18,
    elevationDeg: 48,
    azimuthDeg: 315,
    shadowRgb: { r: 24, g: 38, b: 58 },
    shadowOpacity: 0.62,
    shadowLift: -0.04,
    shadowContrast: 1.28,
    skyRgb: { r: 92, g: 122, b: 148 },
    groundRgb: { r: 34, g: 42, b: 52 },
    keyToFillRatio: 6.4,
    rimRgb: { r: 152, g: 214, b: 255 },
    rimIntensity: 1.12,
    rimFresnelPower: 3.6,
    rimEdgeWidthPx: 2.2,
    rimBlendMode: "screen",
    rimOpacity: 0.52,
    exposureEv: -0.28,
    saturation: 0.78,
    contrast: 1.26,
    vignetteStrength: 0.42,
    bloomThreshold: 0.88,
  },
  flashback: {
    id: "flashback",
    labelKo: "회상 · 기억",
    keywords: ["회상", "과거", "기억", "그날", "추억", "어린 시절", "옛날", "flashback", "memory", "past"],
    kelvin: 3600,
    keyIntensity: 0.88,
    elevationDeg: 36,
    azimuthDeg: 130,
    shadowRgb: { r: 88, g: 76, b: 68 },
    shadowOpacity: 0.28,
    shadowLift: 0.14,
    shadowContrast: 0.9,
    skyRgb: { r: 224, g: 206, b: 178 },
    groundRgb: { r: 146, g: 132, b: 112 },
    keyToFillRatio: 2.0,
    rimRgb: { r: 248, g: 230, b: 196 },
    rimIntensity: 0.64,
    rimFresnelPower: 2.1,
    rimEdgeWidthPx: 3.0,
    rimBlendMode: "soft-light",
    rimOpacity: 0.36,
    exposureEv: 0.12,
    saturation: 0.66,
    contrast: 0.88,
    vignetteStrength: 0.36,
    bloomThreshold: 0.76,
  },
  romance: {
    id: "romance",
    labelKo: "로맨스 · 설렘",
    keywords: ["로맨스", "설렘", "고백", "두근", "벚꽃", "봄바람", "따뜻한 미소", "사랑", "romance", "love", "blossom"],
    kelvin: 3350,
    keyIntensity: 1.08,
    elevationDeg: 28,
    azimuthDeg: 210,
    shadowRgb: { r: 122, g: 84, b: 114 },
    shadowOpacity: 0.26,
    shadowLift: 0.1,
    shadowContrast: 0.96,
    skyRgb: { r: 252, g: 206, b: 214 },
    groundRgb: { r: 184, g: 148, b: 158 },
    keyToFillRatio: 2.2,
    rimRgb: { r: 255, g: 214, b: 224 },
    rimIntensity: 0.96,
    rimFresnelPower: 2.0,
    rimEdgeWidthPx: 4.0,
    rimBlendMode: "screen",
    rimOpacity: 0.48,
    exposureEv: 0.18,
    saturation: 1.08,
    contrast: 0.95,
    vignetteStrength: 0.16,
    bloomThreshold: 0.68,
  },
  night: {
    id: "night",
    labelKo: "야간 · 달빛",
    keywords: ["야간", "밤", "심야", "달빛", "자정", "어둠", "별빛", "네온", "night", "midnight", "moonlight"],
    kelvin: 8100,
    keyIntensity: 0.78,
    elevationDeg: 54,
    azimuthDeg: 38,
    shadowRgb: { r: 18, g: 28, b: 64 },
    shadowOpacity: 0.68,
    shadowLift: -0.02,
    shadowContrast: 1.2,
    skyRgb: { r: 58, g: 82, b: 138 },
    groundRgb: { r: 24, g: 30, b: 48 },
    keyToFillRatio: 5.5,
    rimRgb: { r: 164, g: 202, b: 255 },
    rimIntensity: 1.05,
    rimFresnelPower: 3.4,
    rimEdgeWidthPx: 2.6,
    rimBlendMode: "screen",
    rimOpacity: 0.58,
    exposureEv: -0.45,
    saturation: 0.86,
    contrast: 1.18,
    vignetteStrength: 0.46,
    bloomThreshold: 0.8,
  },
  daylight: {
    id: "daylight",
    labelKo: "주간 · 자연광",
    keywords: ["낮", "정오", "맑은 하늘", "교실", "카페", "오후", "햇살", "day", "daylight", "noon", "sunny"],
    kelvin: 5600,
    keyIntensity: 1.1,
    elevationDeg: 52,
    azimuthDeg: 145,
    shadowRgb: { r: 74, g: 88, b: 112 },
    shadowOpacity: 0.3,
    shadowLift: 0.04,
    shadowContrast: 1.04,
    skyRgb: { r: 186, g: 214, b: 248 },
    groundRgb: { r: 158, g: 152, b: 142 },
    keyToFillRatio: 3.0,
    rimRgb: { r: 255, g: 250, b: 238 },
    rimIntensity: 0.68,
    rimFresnelPower: 2.6,
    rimEdgeWidthPx: 2.0,
    rimBlendMode: "soft-light",
    rimOpacity: 0.32,
    exposureEv: 0,
    saturation: 1.0,
    contrast: 1.03,
    vignetteStrength: 0.1,
    bloomThreshold: 0.86,
  },
  "rain-melancholy": {
    id: "rain-melancholy",
    labelKo: "우천 · 쓸쓸함",
    keywords: ["비", "장마", "빗소리", "우산", "우울", "눈물", "이별", "흐림", "rain", "overcast", "melancholy"],
    kelvin: 7300,
    keyIntensity: 0.82,
    elevationDeg: 62,
    azimuthDeg: 180,
    shadowRgb: { r: 46, g: 62, b: 84 },
    shadowOpacity: 0.46,
    shadowLift: 0.02,
    shadowContrast: 1.08,
    skyRgb: { r: 122, g: 142, b: 164 },
    groundRgb: { r: 62, g: 72, b: 84 },
    keyToFillRatio: 2.1,
    rimRgb: { r: 196, g: 218, b: 242 },
    rimIntensity: 0.74,
    rimFresnelPower: 3.0,
    rimEdgeWidthPx: 2.2,
    rimBlendMode: "screen",
    rimOpacity: 0.38,
    exposureEv: -0.22,
    saturation: 0.72,
    contrast: 1.06,
    vignetteStrength: 0.32,
    bloomThreshold: 0.84,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampByte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

export function rgbToHex(rgb: RgbColor8): string {
  const toHex = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len <= 1e-8) return { x: 0, y: 1, z: 0 };
  return {
    x: roundTo3(v.x / len),
    y: roundTo3(v.y / len),
    z: roundTo3(v.z / len),
  };
}

function normalizeVec2(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len <= 1e-8) return { x: 0, y: -1 };
  return {
    x: roundTo3(v.x / len),
    y: roundTo3(v.y / len),
  };
}

function sphericalToDirection3D(elevationDeg: number, azimuthDeg: number): Vec3 {
  const elevRad = (elevationDeg * Math.PI) / 180;
  const azimRad = (azimuthDeg * Math.PI) / 180;
  const cosElev = Math.cos(elevRad);
  return normalizeVec3({
    x: cosElev * Math.sin(azimRad),
    y: Math.sin(elevRad),
    z: cosElev * Math.cos(azimRad),
  });
}

function projectRimDirectionTo2D(rimDirection3D: Vec3): Vec2 {
  // 2D 캔버스 좌표계(+X 오른쪽, +Y 아래)로 3D 림라이트 벡터를 투영한다.
  return normalizeVec2({
    x: rimDirection3D.x,
    y: -rimDirection3D.y,
  });
}

/**
 * 색온도(Kelvin, 2700K~8500K 클램프)를 물리적 흑체 복사 근사 sRGB(0..255)로 변환한다.
 * 색온도가 높아질수록 R/B 비율이 단조 감소한다(따뜻한 황색 → 중성 백색 → 차가운 청백색).
 */
export function kelvinToRgb(kelvinInput: number): RgbColor8 {
  const clampedKelvin = clamp(kelvinInput, MIN_KELVIN, MAX_KELVIN);
  const temp = clampedKelvin / 100;

  let red: number;
  let green: number;
  let blue: number;

  if (temp <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temp) - 161.1195681661;
    blue = temp <= 19
      ? 0
      : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    blue = 255;
  }

  return {
    r: clampByte(red),
    g: clampByte(green),
    b: clampByte(blue),
  };
}

/**
 * 대본 문장·지문·시간대 텍스트에서 무드/시간대 가중치 분포를 결정적으로 추출한다.
 */
export function detectScriptMoodProfile(text: string): MoodDetectionResult {
  const lower = text.toLowerCase();
  const rawHits: { presetId: ScriptMoodPresetId; matchedKeywords: string[]; score: number }[] = [];

  for (const preset of Object.values(SCRIPT_MOOD_PRESETS)) {
    const matched = preset.keywords.filter((keyword) => lower.includes(keyword));
    if (matched.length > 0) {
      rawHits.push({
        presetId: preset.id,
        matchedKeywords: matched,
        score: matched.length,
      });
    }
  }

  if (rawHits.length === 0) {
    return {
      primaryMood: "daylight",
      contributions: [{ presetId: "daylight", weight: 1, matchedKeywords: [] }],
      confidence01: 0.35,
    };
  }

  rawHits.sort((a, b) => b.score - a.score || a.presetId.localeCompare(b.presetId));
  const totalScore = rawHits.reduce((sum, hit) => sum + hit.score, 0);
  const contributions: MoodWeightContribution[] = rawHits.map((hit) => ({
    presetId: hit.presetId,
    weight: roundTo3(hit.score / totalScore),
    matchedKeywords: hit.matchedKeywords,
  }));

  const weightSum = contributions.reduce((sum, entry) => sum + entry.weight, 0);
  const normalizedContributions: MoodWeightContribution[] = contributions.map((entry, idx) =>
    idx === 0
      ? { ...entry, weight: roundTo3(entry.weight + (1 - weightSum)) }
      : entry,
  );

  const primary = normalizedContributions[0]?.presetId ?? "daylight";
  const confidence01 = roundTo3(clamp(0.55 + Math.min(totalScore, 4) * 0.11, 0.55, 0.99));

  return {
    primaryMood: primary,
    contributions: normalizedContributions,
    confidence01,
  };
}

function blendRgb(pairs: readonly { readonly rgb: RgbColor8; readonly weight: number }[]): RgbColor8 {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const pair of pairs) {
    r += pair.rgb.r * pair.weight;
    g += pair.rgb.g * pair.weight;
    b += pair.rgb.b * pair.weight;
  }
  return { r: clampByte(r), g: clampByte(g), b: clampByte(b) };
}

function blendNumber(pairs: readonly { readonly value: number; readonly weight: number }[]): number {
  return pairs.reduce((sum, pair) => sum + pair.value * pair.weight, 0);
}

/**
 * 대본 텍스트(또는 명시적 무드 오버라이드)로부터 캔버스 색온도·그림자 틴트·3D↔2D 림라이트 리그를 생성한다.
 */
export function computeMoodLightingRig(
  scriptContextText: string,
  overridePreset?: ScriptMoodPresetId,
): MoodLightingRig {
  const detection: MoodDetectionResult = overridePreset
    ? {
        primaryMood: overridePreset,
        contributions: [{ presetId: overridePreset, weight: 1, matchedKeywords: [overridePreset] }],
        confidence01: 1,
      }
    : detectScriptMoodProfile(scriptContextText);

  const primaryPreset = SCRIPT_MOOD_PRESETS[detection.primaryMood];
  const weightedPresets = detection.contributions.map((contribution) => ({
    preset: SCRIPT_MOOD_PRESETS[contribution.presetId],
    weight: contribution.weight,
  }));

  const kelvin = Math.round(
    clamp(
      blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.kelvin, weight: entry.weight }))),
      MIN_KELVIN,
      MAX_KELVIN,
    ),
  );
  const keyRgb = kelvinToRgb(kelvin);
  const elevationDeg = Math.round(
    blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.elevationDeg, weight: entry.weight }))),
  );
  const azimuthDeg = Math.round(
    blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.azimuthDeg, weight: entry.weight }))),
  ) % 360;

  const keyDirection3D = sphericalToDirection3D(elevationDeg, azimuthDeg);
  // 림라이트는 주광 반대 방위(180° 반전)의 역광으로 배치해 3D 모델과 2D 캐릭터 외곽광이 일치하도록 한다.
  const rimDirection3D = sphericalToDirection3D(
    clamp(elevationDeg * 0.7 + 12, 10, 68),
    (azimuthDeg + 180) % 360,
  );
  const projectedNormal2D = projectRimDirectionTo2D(rimDirection3D);

  const shadowRgb = blendRgb(weightedPresets.map((entry) => ({ rgb: entry.preset.shadowRgb, weight: entry.weight })));
  const skyRgb = blendRgb(weightedPresets.map((entry) => ({ rgb: entry.preset.skyRgb, weight: entry.weight })));
  const groundRgb = blendRgb(weightedPresets.map((entry) => ({ rgb: entry.preset.groundRgb, weight: entry.weight })));
  const rimRgb = blendRgb(weightedPresets.map((entry) => ({ rgb: entry.preset.rimRgb, weight: entry.weight })));

  return {
    primaryMood: detection.primaryMood,
    labelKo: primaryPreset.labelKo,
    kelvin,
    contributions: detection.contributions,
    keyLight: {
      kelvin,
      rgb: keyRgb,
      hex: rgbToHex(keyRgb),
      intensity: roundTo3(blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.keyIntensity, weight: entry.weight })))),
      elevationDeg,
      azimuthDeg,
      direction3D: keyDirection3D,
    },
    shadowTint: {
      rgb: shadowRgb,
      hex: rgbToHex(shadowRgb),
      multiplyOpacity: roundTo3(blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.shadowOpacity, weight: entry.weight })))),
      shadowLift: roundTo3(blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.shadowLift, weight: entry.weight })))),
      contrastBoost: roundTo3(blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.shadowContrast, weight: entry.weight })))),
    },
    ambient: {
      skyRgb,
      skyHex: rgbToHex(skyRgb),
      groundRgb,
      groundHex: rgbToHex(groundRgb),
      keyToFillRatio: roundTo3(blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.keyToFillRatio, weight: entry.weight })))),
    },
    rimLight3dTo2d: {
      rgb: rimRgb,
      hex: rgbToHex(rimRgb),
      intensity: roundTo3(blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.rimIntensity, weight: entry.weight })))),
      direction3D: rimDirection3D,
      fresnelPower: roundTo3(blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.rimFresnelPower, weight: entry.weight })))),
      projectedNormal2D,
      canvasEdgeWidthPx: roundTo3(blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.rimEdgeWidthPx, weight: entry.weight })))),
      canvasBlendMode: primaryPreset.rimBlendMode,
      canvasOpacity: roundTo3(blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.rimOpacity, weight: entry.weight })))),
    },
    colorGrade: {
      exposureEv: roundTo3(blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.exposureEv, weight: entry.weight })))),
      saturation: roundTo3(blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.saturation, weight: entry.weight })))),
      contrast: roundTo3(blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.contrast, weight: entry.weight })))),
      vignetteStrength: roundTo3(blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.vignetteStrength, weight: entry.weight })))),
      bloomThreshold: roundTo3(blendNumber(weightedPresets.map((entry) => ({ value: entry.preset.bloomThreshold, weight: entry.weight })))),
    },
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(a: RgbColor8, b: RgbColor8, t: number): RgbColor8 {
  return {
    r: clampByte(lerp(a.r, b.r, t)),
    g: clampByte(lerp(a.g, b.g, t)),
    b: clampByte(lerp(a.b, b.b, t)),
  };
}

/**
 * 두 컷 사이의 무드 라이팅 리그를 비율 t(0..1)로 연속 보간한다.
 */
export function interpolateMoodLightingRigs(from: MoodLightingRig, to: MoodLightingRig, tInput: number): MoodLightingRig {
  const t = clamp(tInput, 0, 1);
  const kelvin = Math.round(clamp(lerp(from.kelvin, to.kelvin, t), MIN_KELVIN, MAX_KELVIN));
  const keyRgb = kelvinToRgb(kelvin);
  const shadowRgb = lerpRgb(from.shadowTint.rgb, to.shadowTint.rgb, t);
  const skyRgb = lerpRgb(from.ambient.skyRgb, to.ambient.skyRgb, t);
  const groundRgb = lerpRgb(from.ambient.groundRgb, to.ambient.groundRgb, t);
  const rimRgb = lerpRgb(from.rimLight3dTo2d.rgb, to.rimLight3dTo2d.rgb, t);

  const keyDir = normalizeVec3({
    x: lerp(from.keyLight.direction3D.x, to.keyLight.direction3D.x, t),
    y: lerp(from.keyLight.direction3D.y, to.keyLight.direction3D.y, t),
    z: lerp(from.keyLight.direction3D.z, to.keyLight.direction3D.z, t),
  });
  const rimDir = normalizeVec3({
    x: lerp(from.rimLight3dTo2d.direction3D.x, to.rimLight3dTo2d.direction3D.x, t),
    y: lerp(from.rimLight3dTo2d.direction3D.y, to.rimLight3dTo2d.direction3D.y, t),
    z: lerp(from.rimLight3dTo2d.direction3D.z, to.rimLight3dTo2d.direction3D.z, t),
  });

  const dominant = t < 0.5 ? from : to;

  return {
    primaryMood: dominant.primaryMood,
    labelKo: dominant.labelKo,
    kelvin,
    contributions: dominant.contributions,
    keyLight: {
      kelvin,
      rgb: keyRgb,
      hex: rgbToHex(keyRgb),
      intensity: roundTo3(lerp(from.keyLight.intensity, to.keyLight.intensity, t)),
      elevationDeg: Math.round(lerp(from.keyLight.elevationDeg, to.keyLight.elevationDeg, t)),
      azimuthDeg: Math.round(lerp(from.keyLight.azimuthDeg, to.keyLight.azimuthDeg, t)) % 360,
      direction3D: keyDir,
    },
    shadowTint: {
      rgb: shadowRgb,
      hex: rgbToHex(shadowRgb),
      multiplyOpacity: roundTo3(lerp(from.shadowTint.multiplyOpacity, to.shadowTint.multiplyOpacity, t)),
      shadowLift: roundTo3(lerp(from.shadowTint.shadowLift, to.shadowTint.shadowLift, t)),
      contrastBoost: roundTo3(lerp(from.shadowTint.contrastBoost, to.shadowTint.contrastBoost, t)),
    },
    ambient: {
      skyRgb,
      skyHex: rgbToHex(skyRgb),
      groundRgb,
      groundHex: rgbToHex(groundRgb),
      keyToFillRatio: roundTo3(lerp(from.ambient.keyToFillRatio, to.ambient.keyToFillRatio, t)),
    },
    rimLight3dTo2d: {
      rgb: rimRgb,
      hex: rgbToHex(rimRgb),
      intensity: roundTo3(lerp(from.rimLight3dTo2d.intensity, to.rimLight3dTo2d.intensity, t)),
      direction3D: rimDir,
      fresnelPower: roundTo3(lerp(from.rimLight3dTo2d.fresnelPower, to.rimLight3dTo2d.fresnelPower, t)),
      projectedNormal2D: projectRimDirectionTo2D(rimDir),
      canvasEdgeWidthPx: roundTo3(lerp(from.rimLight3dTo2d.canvasEdgeWidthPx, to.rimLight3dTo2d.canvasEdgeWidthPx, t)),
      canvasBlendMode: dominant.rimLight3dTo2d.canvasBlendMode,
      canvasOpacity: roundTo3(lerp(from.rimLight3dTo2d.canvasOpacity, to.rimLight3dTo2d.canvasOpacity, t)),
    },
    colorGrade: {
      exposureEv: roundTo3(lerp(from.colorGrade.exposureEv, to.colorGrade.exposureEv, t)),
      saturation: roundTo3(lerp(from.colorGrade.saturation, to.colorGrade.saturation, t)),
      contrast: roundTo3(lerp(from.colorGrade.contrast, to.colorGrade.contrast, t)),
      vignetteStrength: roundTo3(lerp(from.colorGrade.vignetteStrength, to.colorGrade.vignetteStrength, t)),
      bloomThreshold: roundTo3(lerp(from.colorGrade.bloomThreshold, to.colorGrade.bloomThreshold, t)),
    },
  };
}

function buildCutMoodQueryText(cut: StoryboardCut): string {
  return [
    cut.sceneHeading,
    cut.location,
    cut.timeOfDay,
    cut.emotion,
    cut.actionSummary,
    ...cut.bubbles.map((bubble) => bubble.text),
  ].join(" ");
}

/**
 * 생성된 스토리보드 플랜의 전 컷에 대해 실시간 캔버스·3D 동기화 무드 라이팅을 일괄 매핑한다.
 */
export function mapStoryboardToMoodLighting(plan: StoryboardPlan): readonly CutMoodLightingEntry[] {
  const entries: CutMoodLightingEntry[] = [];
  let prevKelvin: number | null = null;

  for (const cut of plan.cuts) {
    const rig = computeMoodLightingRig(buildCutMoodQueryText(cut));
    const kelvinDeltaFromPrev = prevKelvin === null ? 0 : rig.kelvin - prevKelvin;
    prevKelvin = rig.kelvin;
    entries.push({
      cutId: cut.cutId,
      cutIndex: cut.cutIndex,
      sceneNumber: cut.sceneNumber,
      rig,
      kelvinDeltaFromPrev,
    });
  }

  return entries;
}
