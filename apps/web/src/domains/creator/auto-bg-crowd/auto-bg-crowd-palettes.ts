/**
 * 어울리는 배경·군중 자동 드로잉 엔진의 OKLCH 색공간, 시간대 팔레트, 테마/의상 메타데이터.
 * 원시 HEX 대신 지각 균일 OKLCH 토큰과 순수 sRGB 수학 변환만 사용한다.
 */

export type AutoBgThemeId =
  | "seoul-street"
  | "cozy-cafe"
  | "rofan-ballroom"
  | "school-hallway"
  | "han-river-night"
  | "wuxia-inn"
  | "rainy-alley"
  | "concert-plaza";

export type TimeOfDay = "dawn" | "day" | "sunset" | "night" | "rain";

export type WebtoonGenre =
  | "romance"
  | "rofan"
  | "slice-of-life"
  | "school"
  | "action"
  | "wuxia"
  | "noir"
  | "idol-music";

export type CutMood =
  | "warm"
  | "melancholic"
  | "tense"
  | "romantic"
  | "energetic"
  | "mysterious"
  | "calm";

export type PerspectiveMode = "1-point" | "2-point";

export type CrowdDensity = "none" | "sparse" | "medium" | "bustling";

export type DepthTier = "background" | "midground" | "foreground";

export type CrowdStyleId =
  | "commuter-coat"
  | "student-uniform"
  | "cafe-guest-cup"
  | "phone-walker"
  | "umbrella-walker"
  | "noble-gown"
  | "noble-tailcoat"
  | "wuxia-robe"
  | "wuxia-hat"
  | "concert-fan-stick"
  | "jogger-river"
  | "casual-tote";

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly a?: number;
}

export interface OklchScenePalette {
  readonly skyTop: string;
  readonly skyHorizon: string;
  readonly groundFar: string;
  readonly groundNear: string;
  readonly architectureLight: string;
  readonly architectureMid: string;
  readonly architectureShadow: string;
  readonly windowGlow: string;
  readonly accentLight: string;
  readonly inkLine: string;
  readonly shadowTint: string;
  readonly haze: string;
  readonly crowdBase: OklchColor;
  readonly crowdAccent: OklchColor;
  readonly crowdInk: OklchColor;
}

export interface AutoBgThemeSpec {
  readonly id: AutoBgThemeId;
  readonly labelKo: string;
  readonly shortSummaryKo: string;
  readonly defaultTimeOfDay: TimeOfDay;
  readonly defaultPerspective: PerspectiveMode;
  readonly defaultDensity: CrowdDensity;
  readonly defaultGenre: WebtoonGenre;
  readonly defaultMood: CutMood;
  readonly keywords: readonly string[];
  readonly preferredCrowdStyles: readonly CrowdStyleId[];
  readonly baseHue: number;
}

export interface CrowdStyleSpec {
  readonly id: CrowdStyleId;
  readonly labelKo: string;
  readonly poseKind: "walk-left" | "walk-right" | "stand" | "action";
  readonly accessory: "none" | "bag" | "cup" | "phone" | "umbrella" | "gown" | "cape" | "hat" | "lightstick";
  readonly shoulderRatio: number;
  readonly hipRatio: number;
  readonly hueShift: number;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function formatOklch(color: OklchColor): string {
  const l = clampNumber(color.l, 0, 1);
  const c = clampNumber(color.c, 0, 0.37);
  const h = ((color.h % 360) + 360) % 360;
  if (color.a !== undefined && color.a < 0.999) {
    const a = clampNumber(color.a, 0, 1);
    return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)} / ${a.toFixed(3)})`;
  }
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/** Björn Ottosson OKLab 역행렬 기반 OKLCH → sRGB RGBA(0..255) 변환. */
export function oklchToSrgbRgba(color: OklchColor): readonly [number, number, number, number] {
  const l = clampNumber(color.l, 0, 1);
  const c = clampNumber(color.c, 0, 0.37);
  const hRad = ((((color.h % 360) + 360) % 360) * Math.PI) / 180;
  const aLab = c * Math.cos(hRad);
  const bLab = c * Math.sin(hRad);

  const lPrime = l + 0.3963377774 * aLab + 0.2158037573 * bLab;
  const mPrime = l - 0.1055613458 * aLab - 0.0638541728 * bLab;
  const sPrime = l - 0.0894841775 * aLab - 1.291485548 * bLab;

  const l3 = lPrime * lPrime * lPrime;
  const m3 = mPrime * mPrime * mPrime;
  const s3 = sPrime * sPrime * sPrime;

  const rLin = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  const encode = (channel: number): number => {
    const clamped = clampNumber(channel, 0, 1);
    const srgb =
      clamped <= 0.0031308
        ? 12.92 * clamped
        : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    return Math.round(clampNumber(srgb, 0, 1) * 255);
  };

  const alpha = Math.round(clampNumber(color.a ?? 1, 0, 1) * 255);
  return [encode(rLin), encode(gLin), encode(bLin), alpha];
}

/** 결정적 시드 기반 PRNG (Mulberry32). */
export function createSeededRng(seed: number): () => number {
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1337;
}

export function escapeSvgAttr(raw: string): string {
  return raw
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

export const AUTO_BG_THEME_CATALOG: readonly AutoBgThemeSpec[] = Object.freeze([
  {
    id: "seoul-street",
    labelKo: "서울 도심 거리",
    shortSummaryKo: "유리 빌딩·간판·횡단보도 투시 거리",
    defaultTimeOfDay: "sunset",
    defaultPerspective: "1-point",
    defaultDensity: "medium",
    defaultGenre: "romance",
    defaultMood: "warm",
    keywords: ["서울", "거리", "홍대", "강남", "도심", "빌딩", "횡단보도", "출근", "퇴근", "시내", "도시", "street", "seoul"],
    preferredCrowdStyles: ["commuter-coat", "phone-walker", "cafe-guest-cup", "casual-tote", "student-uniform"],
    baseHue: 44,
  },
  {
    id: "cozy-cafe",
    labelKo: "감성 카페",
    shortSummaryKo: "통창 채광과 원목 천장·테이블 투시",
    defaultTimeOfDay: "day",
    defaultPerspective: "2-point",
    defaultDensity: "sparse",
    defaultGenre: "slice-of-life",
    defaultMood: "calm",
    keywords: ["카페", "커피", "창가", "디저트", "브런치", "찻집", "소개팅", "대화", "실내", "cafe", "coffee"],
    preferredCrowdStyles: ["cafe-guest-cup", "casual-tote", "phone-walker", "commuter-coat"],
    baseHue: 62,
  },
  {
    id: "rofan-ballroom",
    labelKo: "로판 대연회장",
    shortSummaryKo: "아치 기둥·샹들리에·대리석 바닥 투시",
    defaultTimeOfDay: "night",
    defaultPerspective: "1-point",
    defaultDensity: "bustling",
    defaultGenre: "rofan",
    defaultMood: "romantic",
    keywords: ["로판", "연회", "무도회", "황궁", "궁전", "성", "귀족", "샹들리에", "왈츠", "공작", "영애", "ballroom", "palace"],
    preferredCrowdStyles: ["noble-gown", "noble-tailcoat", "commuter-coat"],
    baseHue: 78,
  },
  {
    id: "school-hallway",
    labelKo: "학원 복도",
    shortSummaryKo: "창문 사선 햇살·사물함·교실 문 복도",
    defaultTimeOfDay: "sunset",
    defaultPerspective: "1-point",
    defaultDensity: "medium",
    defaultGenre: "school",
    defaultMood: "warm",
    keywords: ["학교", "학원", "복도", "교실", "방과", "고백", "교복", "사물함", "창문", "등교", "하교", "school", "hallway"],
    preferredCrowdStyles: ["student-uniform", "casual-tote", "phone-walker"],
    baseHue: 52,
  },
  {
    id: "han-river-night",
    labelKo: "한강 야경",
    shortSummaryKo: "대교 케이블·수면 반사·강변 산책로",
    defaultTimeOfDay: "night",
    defaultPerspective: "2-point",
    defaultDensity: "sparse",
    defaultGenre: "romance",
    defaultMood: "melancholic",
    keywords: ["한강", "야경", "강변", "대교", "다리", "산책", "강물", "자전거", "바람", "han", "river"],
    preferredCrowdStyles: ["jogger-river", "commuter-coat", "casual-tote", "phone-walker"],
    baseHue: 245,
  },
  {
    id: "wuxia-inn",
    labelKo: "무협 객잔",
    shortSummaryKo: "목조 서까래·2층 난간·등롱이 걸린 객잔",
    defaultTimeOfDay: "night",
    defaultPerspective: "2-point",
    defaultDensity: "medium",
    defaultGenre: "wuxia",
    defaultMood: "mysterious",
    keywords: ["무협", "객잔", "주막", "강호", "협객", "등롱", "기와", "한옥", "사극", "검객", "wuxia", "inn"],
    preferredCrowdStyles: ["wuxia-robe", "wuxia-hat"],
    baseHue: 36,
  },
  {
    id: "rainy-alley",
    labelKo: "비 오는 골목",
    shortSummaryKo: "젖은 바닥 반사·간판·빗줄기 골목 투시",
    defaultTimeOfDay: "rain",
    defaultPerspective: "1-point",
    defaultDensity: "sparse",
    defaultGenre: "noir",
    defaultMood: "tense",
    keywords: ["비", "골목", "우산", "느와르", "추격", "소나기", "장마", "빗물", "젖은", "rain", "alley"],
    preferredCrowdStyles: ["umbrella-walker", "commuter-coat", "phone-walker"],
    baseHue: 232,
  },
  {
    id: "concert-plaza",
    labelKo: "콘서트/광장",
    shortSummaryKo: "무대 조명 빔·광장 보도·응원봉 인파",
    defaultTimeOfDay: "night",
    defaultPerspective: "1-point",
    defaultDensity: "bustling",
    defaultGenre: "idol-music",
    defaultMood: "energetic",
    keywords: ["콘서트", "공연", "광장", "무대", "아이돌", "응원봉", "페스티벌", "축제", "버스킹", "concert", "plaza"],
    preferredCrowdStyles: ["concert-fan-stick", "casual-tote", "phone-walker", "student-uniform"],
    baseHue: 315,
  },
]);

export const CROWD_STYLE_VARIANTS: readonly CrowdStyleSpec[] = Object.freeze([
  { id: "commuter-coat", labelKo: "코트 통근객", poseKind: "walk-right", accessory: "bag", shoulderRatio: 0.34, hipRatio: 0.28, hueShift: -12 },
  { id: "student-uniform", labelKo: "교복 학생", poseKind: "walk-left", accessory: "bag", shoulderRatio: 0.31, hipRatio: 0.25, hueShift: 18 },
  { id: "cafe-guest-cup", labelKo: "커피 든 행인", poseKind: "walk-right", accessory: "cup", shoulderRatio: 0.32, hipRatio: 0.26, hueShift: 8 },
  { id: "phone-walker", labelKo: "스마트폰 행인", poseKind: "stand", accessory: "phone", shoulderRatio: 0.3, hipRatio: 0.25, hueShift: -24 },
  { id: "umbrella-walker", labelKo: "우산 행인", poseKind: "walk-left", accessory: "umbrella", shoulderRatio: 0.33, hipRatio: 0.26, hueShift: 26 },
  { id: "noble-gown", labelKo: "로판 드레스", poseKind: "stand", accessory: "gown", shoulderRatio: 0.28, hipRatio: 0.44, hueShift: 34 },
  { id: "noble-tailcoat", labelKo: "연미복 신사", poseKind: "stand", accessory: "cape", shoulderRatio: 0.36, hipRatio: 0.27, hueShift: -18 },
  { id: "wuxia-robe", labelKo: "무협 도포", poseKind: "walk-right", accessory: "cape", shoulderRatio: 0.35, hipRatio: 0.34, hueShift: -8 },
  { id: "wuxia-hat", labelKo: "삿갓 협객", poseKind: "stand", accessory: "hat", shoulderRatio: 0.34, hipRatio: 0.32, hueShift: 14 },
  { id: "concert-fan-stick", labelKo: "응원봉 관객", poseKind: "action", accessory: "lightstick", shoulderRatio: 0.32, hipRatio: 0.26, hueShift: 42 },
  { id: "jogger-river", labelKo: "강변 산책객", poseKind: "walk-left", accessory: "none", shoulderRatio: 0.33, hipRatio: 0.25, hueShift: -30 },
  { id: "casual-tote", labelKo: "에코백 행인", poseKind: "walk-right", accessory: "bag", shoulderRatio: 0.31, hipRatio: 0.26, hueShift: 10 },
]);

export const TIME_OF_DAY_LABELS_KO: Readonly<Record<TimeOfDay, string>> = Object.freeze({
  dawn: "새벽",
  day: "낮",
  sunset: "노을",
  night: "밤",
  rain: "비",
});

export const CROWD_DENSITY_LABELS_KO: Readonly<Record<CrowdDensity, string>> = Object.freeze({
  none: "군중 없음",
  sparse: "한산하게",
  medium: "적당히",
  bustling: "북적북적",
});

export function getThemeSpec(themeId: AutoBgThemeId): AutoBgThemeSpec {
  return AUTO_BG_THEME_CATALOG.find((spec) => spec.id === themeId) ?? AUTO_BG_THEME_CATALOG[0];
}

export function getCrowdStyleSpec(styleId: CrowdStyleId): CrowdStyleSpec {
  return CROWD_STYLE_VARIANTS.find((spec) => spec.id === styleId) ?? CROWD_STYLE_VARIANTS[0];
}

export function getColorTemperatureForTime(timeOfDay: TimeOfDay, theme: AutoBgThemeId): number {
  const baseByTime: Record<TimeOfDay, number> = {
    dawn: 4400,
    day: 5600,
    sunset: 3150,
    night: 6800,
    rain: 7400,
  };
  const indoorWarmOffset = theme === "cozy-cafe" || theme === "rofan-ballroom" || theme === "wuxia-inn" ? -750 : 0;
  return clampNumber(baseByTime[timeOfDay] + indoorWarmOffset, 2400, 8200);
}

/** 시간대 + 테마별 OKLCH 시맨틱 장면 팔레트를 생성한다. */
export function buildOklchScenePalette(theme: AutoBgThemeId, timeOfDay: TimeOfDay): OklchScenePalette {
  const spec = getThemeSpec(theme);
  const h = spec.baseHue;

  if (timeOfDay === "day") {
    return {
      skyTop: formatOklch({ l: 0.78, c: 0.085, h: 232 }),
      skyHorizon: formatOklch({ l: 0.94, c: 0.032, h: 86 }),
      groundFar: formatOklch({ l: 0.86, c: 0.025, h }),
      groundNear: formatOklch({ l: 0.74, c: 0.032, h }),
      architectureLight: formatOklch({ l: 0.91, c: 0.022, h }),
      architectureMid: formatOklch({ l: 0.79, c: 0.032, h }),
      architectureShadow: formatOklch({ l: 0.62, c: 0.038, h: (h + 210) % 360 }),
      windowGlow: formatOklch({ l: 0.97, c: 0.045, h: 88, a: 0.72 }),
      accentLight: formatOklch({ l: 0.76, c: 0.135, h }),
      inkLine: formatOklch({ l: 0.27, c: 0.026, h: 255 }),
      shadowTint: formatOklch({ l: 0.44, c: 0.042, h: 248, a: 0.26 }),
      haze: formatOklch({ l: 0.94, c: 0.02, h: 220, a: 0.48 }),
      crowdBase: { l: 0.56, c: 0.042, h: (h + 190) % 360 },
      crowdAccent: { l: 0.64, c: 0.075, h },
      crowdInk: { l: 0.25, c: 0.024, h: 255 },
    };
  }

  if (timeOfDay === "sunset") {
    return {
      skyTop: formatOklch({ l: 0.48, c: 0.125, h: 292 }),
      skyHorizon: formatOklch({ l: 0.82, c: 0.155, h: 52 }),
      groundFar: formatOklch({ l: 0.66, c: 0.068, h: 42 }),
      groundNear: formatOklch({ l: 0.46, c: 0.056, h: 32 }),
      architectureLight: formatOklch({ l: 0.79, c: 0.095, h: 56 }),
      architectureMid: formatOklch({ l: 0.58, c: 0.072, h: 36 }),
      architectureShadow: formatOklch({ l: 0.36, c: 0.068, h: 296 }),
      windowGlow: formatOklch({ l: 0.91, c: 0.145, h: 74, a: 0.76 }),
      accentLight: formatOklch({ l: 0.77, c: 0.165, h: 44 }),
      inkLine: formatOklch({ l: 0.22, c: 0.042, h: 302 }),
      shadowTint: formatOklch({ l: 0.28, c: 0.062, h: 295, a: 0.34 }),
      haze: formatOklch({ l: 0.84, c: 0.11, h: 58, a: 0.42 }),
      crowdBase: { l: 0.44, c: 0.058, h: 305 },
      crowdAccent: { l: 0.62, c: 0.092, h: 46 },
      crowdInk: { l: 0.2, c: 0.038, h: 302 },
    };
  }

  if (timeOfDay === "dawn") {
    return {
      skyTop: formatOklch({ l: 0.46, c: 0.088, h: 256 }),
      skyHorizon: formatOklch({ l: 0.85, c: 0.082, h: 24 }),
      groundFar: formatOklch({ l: 0.7, c: 0.042, h: 258 }),
      groundNear: formatOklch({ l: 0.54, c: 0.044, h: 252 }),
      architectureLight: formatOklch({ l: 0.82, c: 0.052, h: 32 }),
      architectureMid: formatOklch({ l: 0.62, c: 0.046, h: 262 }),
      architectureShadow: formatOklch({ l: 0.4, c: 0.052, h: 260 }),
      windowGlow: formatOklch({ l: 0.92, c: 0.095, h: 76, a: 0.65 }),
      accentLight: formatOklch({ l: 0.78, c: 0.115, h: 28 }),
      inkLine: formatOklch({ l: 0.24, c: 0.035, h: 265 }),
      shadowTint: formatOklch({ l: 0.32, c: 0.048, h: 264, a: 0.28 }),
      haze: formatOklch({ l: 0.86, c: 0.058, h: 26, a: 0.44 }),
      crowdBase: { l: 0.49, c: 0.046, h: 262 },
      crowdAccent: { l: 0.64, c: 0.072, h: 28 },
      crowdInk: { l: 0.22, c: 0.032, h: 265 },
    };
  }

  if (timeOfDay === "rain") {
    return {
      skyTop: formatOklch({ l: 0.3, c: 0.046, h: 242 }),
      skyHorizon: formatOklch({ l: 0.54, c: 0.052, h: 228 }),
      groundFar: formatOklch({ l: 0.44, c: 0.045, h: 236 }),
      groundNear: formatOklch({ l: 0.26, c: 0.042, h: 244 }),
      architectureLight: formatOklch({ l: 0.58, c: 0.044, h: 232 }),
      architectureMid: formatOklch({ l: 0.42, c: 0.045, h: 238 }),
      architectureShadow: formatOklch({ l: 0.24, c: 0.042, h: 248 }),
      windowGlow: formatOklch({ l: 0.88, c: 0.145, h: 82, a: 0.82 }),
      accentLight: formatOklch({ l: 0.74, c: 0.155, h: 196 }),
      inkLine: formatOklch({ l: 0.16, c: 0.028, h: 250 }),
      shadowTint: formatOklch({ l: 0.18, c: 0.038, h: 248, a: 0.42 }),
      haze: formatOklch({ l: 0.66, c: 0.046, h: 224, a: 0.44 }),
      crowdBase: { l: 0.36, c: 0.044, h: 238 },
      crowdAccent: { l: 0.56, c: 0.095, h: 196 },
      crowdInk: { l: 0.15, c: 0.025, h: 250 },
    };
  }

  // night
  return {
    skyTop: formatOklch({ l: 0.2, c: 0.055, h: 262 }),
    skyHorizon: formatOklch({ l: 0.38, c: 0.075, h: (h + 210) % 360 }),
    groundFar: formatOklch({ l: 0.32, c: 0.048, h: 260 }),
    groundNear: formatOklch({ l: 0.2, c: 0.038, h: 266 }),
    architectureLight: formatOklch({ l: 0.48, c: 0.062, h }),
    architectureMid: formatOklch({ l: 0.34, c: 0.052, h: 264 }),
    architectureShadow: formatOklch({ l: 0.2, c: 0.046, h: 270 }),
    windowGlow: formatOklch({ l: 0.9, c: 0.155, h: 82, a: 0.86 }),
    accentLight: formatOklch({ l: 0.76, c: 0.175, h: theme === "concert-plaza" ? 320 : 62 }),
    inkLine: formatOklch({ l: 0.14, c: 0.03, h: 268 }),
    shadowTint: formatOklch({ l: 0.14, c: 0.038, h: 272, a: 0.46 }),
    haze: formatOklch({ l: 0.52, c: 0.072, h: (h + 205) % 360, a: 0.34 }),
    crowdBase: { l: 0.32, c: 0.048, h: 264 },
    crowdAccent: { l: 0.54, c: 0.11, h },
    crowdInk: { l: 0.14, c: 0.028, h: 268 },
  };
}
