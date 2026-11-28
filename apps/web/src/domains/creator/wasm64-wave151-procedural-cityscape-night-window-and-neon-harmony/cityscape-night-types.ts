/**
 * Wave 151 — 도시 야경 실내 시차 창문 · 다국어 네온 간판 배치 · 야간 색온도(OKLCH) 조화 엔진
 * 공유 데이터 계약, 4종 야경 도시 무드 프리셋, 결정론적 난수 및 기하 유틸리티.
 */

export type CityscapeNightMoodId =
  | "seoul-gangnam-noir"
  | "hongdae-warm-alley"
  | "cyber-neon-alley"
  | "quiet-midnight-apartment";

export type CityscapeDepthBand = "foreground" | "midground" | "background";

export type BuildingUsageKind = "office" | "residential" | "mixed";

export type InteriorRoomStyle =
  | "office-desks"
  | "bookshelf-lounge"
  | "apartment-curtain"
  | "server-rack"
  | "empty-hall";

export type SignboardOrientation = "vertical" | "horizontal";

export type SignboardScript = "ko" | "ja" | "en" | "mixed";

export type SignboardPreferredZone =
  | "lower"
  | "mid"
  | "upper"
  | "edge-left"
  | "edge-right";

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha?: number;
}

export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface KeepOutBox2D {
  readonly id: string;
  readonly labelKo: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly paddingPx?: number;
}

export interface InteriorParallaxOffset {
  readonly backWallOffsetU: number;
  readonly backWallOffsetV: number;
  readonly midFurnitureOffsetU: number;
  readonly midFurnitureOffsetV: number;
  readonly ceilingLightOffsetU: number;
  readonly ceilingLightOffsetV: number;
  readonly visibleSideWall: "left" | "right" | "none";
  readonly visibleHorizontalSurface: "ceiling" | "floor" | "none";
  readonly effectiveParallaxMagnitude: number;
}

export interface FacadeWindowCell {
  readonly id: string;
  readonly buildingId: string;
  readonly floor: number;
  readonly column: number;
  readonly rect: Rect2D;
  readonly lit: boolean;
  readonly clusterId: string | null;
  readonly interiorDepthM: number;
  readonly blindClosureRatio: number;
  readonly kelvin: number;
  readonly oklch: OklchColor;
  readonly oklchCss: string;
  readonly luminanceIntensity: number;
  readonly interiorStyle: InteriorRoomStyle;
  readonly parallax: InteriorParallaxOffset;
}

export interface BuildingFacadeWindowsResult {
  readonly buildingId: string;
  readonly moodId: CityscapeNightMoodId;
  readonly hourOfNight: number;
  readonly floors: number;
  readonly columns: number;
  readonly buildingType: BuildingUsageKind;
  readonly depthBand: CityscapeDepthBand;
  readonly targetOccupancyRatio: number;
  readonly actualOccupancyRatio: number;
  readonly litWindowCount: number;
  readonly totalWindowCount: number;
  readonly clusterCount: number;
  readonly averageClusterSize: number;
  readonly rowBitmasks: readonly string[];
  readonly duplicateRowCount: number;
  readonly rowHashRepetitionRate: number;
  readonly windows: readonly FacadeWindowCell[];
}

export interface NeonSignboardCandidate {
  readonly id: string;
  readonly text: string;
  readonly script?: SignboardScript;
  readonly preferredOrientation?: SignboardOrientation;
  readonly priority?: number;
  readonly accentColorOklch?: OklchColor;
  readonly fontSizePx?: number;
  readonly preferredZone?: SignboardPreferredZone;
}

export interface PlacedNeonSignboard {
  readonly id: string;
  readonly buildingId: string;
  readonly text: string;
  readonly script: SignboardScript;
  readonly orientation: SignboardOrientation;
  readonly rect: Rect2D;
  readonly aspectRatio: number;
  readonly fontSizePx: number;
  readonly characterCount: number;
  readonly priority: number;
  readonly accentColorOklch: OklchColor;
  readonly accentColorCss: string;
  readonly glowRadiusPx: number;
}

export interface SkippedNeonSignboard {
  readonly id: string;
  readonly text: string;
  readonly reason: "keep-out-blocked" | "no-collision-free-slot" | "exceeds-facade-bounds";
}

export interface NeonSignboardPlacementResult {
  readonly buildingId: string;
  readonly moodId: CityscapeNightMoodId;
  readonly placedSigns: readonly PlacedNeonSignboard[];
  readonly skippedSigns: readonly SkippedNeonSignboard[];
  readonly signOverlapCount: number;
  readonly keepOutViolationCount: number;
  readonly outOfBoundsCount: number;
}

export interface CityscapeBuilding {
  readonly id: string;
  readonly labelKo: string;
  readonly depthBand: CityscapeDepthBand;
  readonly distanceMeters: number;
  readonly buildingType: BuildingUsageKind;
  readonly rect: Rect2D;
  readonly facadeBaseOklch: OklchColor;
  readonly facadeBaseCss: string;
  readonly facadeWindows: BuildingFacadeWindowsResult;
  readonly signboards: readonly PlacedNeonSignboard[];
}

export interface CityscapeNightScene {
  readonly sceneId: string;
  readonly moodId: CityscapeNightMoodId;
  readonly hourOfNight: number;
  readonly seed: string;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly skyZenithOklch: OklchColor;
  readonly skyHorizonOklch: OklchColor;
  readonly hazeOklch: OklchColor;
  readonly moonlightKelvin: number;
  readonly keepOutBoxes: readonly KeepOutBox2D[];
  readonly buildings: readonly CityscapeBuilding[];
  readonly signOverlapCount: number;
  readonly keepOutViolationCount: number;
  readonly outOfBoundsSignCount: number;
  readonly averageRowHashRepetitionRate: number;
  readonly overallOccupancyRatio: number;
}

export interface CityscapeDefaultSignSample {
  readonly text: string;
  readonly script: SignboardScript;
  readonly preferredOrientation: SignboardOrientation;
  readonly preferredZone: SignboardPreferredZone;
}

export interface CityscapeMoodPreset {
  readonly id: CityscapeNightMoodId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly defaultBuildingType: BuildingUsageKind;
  readonly skyZenithOklch: OklchColor;
  readonly skyHorizonOklch: OklchColor;
  readonly hazeOklch: OklchColor;
  readonly facadeBaseOklch: OklchColor;
  readonly moonlightKelvin: number;
  readonly windowKelvinRange: readonly [number, number];
  readonly occupancyBias: number;
  readonly officeClusterMin: number;
  readonly officeClusterMax: number;
  readonly neonPaletteOklch: readonly OklchColor[];
  readonly neonBloomStrength: number;
  readonly wetRoadReflectionGain: number;
  readonly atmosphericExtinctionBeta: number;
  readonly shaderModeId: number;
  readonly defaultSignSamples: readonly CityscapeDefaultSignSample[];
}

export const CITYSCAPE_NIGHT_PRESETS: Readonly<Record<CityscapeNightMoodId, CityscapeMoodPreset>> = {
  "seoul-gangnam-noir": {
    id: "seoul-gangnam-noir",
    labelKo: "서울 강남 비 오는 야경",
    descriptionKo: "비에 젖은 아스팔트 반사와 차가운 고층 오피스 야근 불빛이 어우러진 현대 느와르 무드",
    defaultBuildingType: "office",
    skyZenithOklch: { l: 0.155, c: 0.032, h: 256 },
    skyHorizonOklch: { l: 0.255, c: 0.044, h: 244 },
    hazeOklch: { l: 0.245, c: 0.030, h: 248 },
    facadeBaseOklch: { l: 0.215, c: 0.028, h: 252 },
    moonlightKelvin: 7800,
    windowKelvinRange: [3000, 6200],
    occupancyBias: 0.02,
    officeClusterMin: 2,
    officeClusterMax: 4,
    neonPaletteOklch: [
      { l: 0.72, c: 0.165, h: 215 },
      { l: 0.70, c: 0.175, h: 38 },
      { l: 0.68, c: 0.155, h: 255 },
    ],
    neonBloomStrength: 0.72,
    wetRoadReflectionGain: 0.85,
    atmosphericExtinctionBeta: 0.0088,
    shaderModeId: 0,
    defaultSignSamples: [
      { text: "강남 법률사무소", script: "ko", preferredOrientation: "vertical", preferredZone: "edge-left" },
      { text: "NOIR BAR", script: "en", preferredOrientation: "horizontal", preferredZone: "lower" },
      { text: "24시 카페", script: "ko", preferredOrientation: "horizontal", preferredZone: "lower" },
      { text: "深夜珈琲", script: "ja", preferredOrientation: "vertical", preferredZone: "edge-right" },
    ],
  },
  "hongdae-warm-alley": {
    id: "hongdae-warm-alley",
    labelKo: "홍대 따뜻한 텅스텐 골목",
    descriptionKo: "포근한 2800K 백열등과 아날로그 간판이 골목 온기를 살리는 로맨스·일상 야경 무드",
    defaultBuildingType: "mixed",
    skyZenithOklch: { l: 0.175, c: 0.028, h: 268 },
    skyHorizonOklch: { l: 0.290, c: 0.048, h: 48 },
    hazeOklch: { l: 0.265, c: 0.032, h: 52 },
    facadeBaseOklch: { l: 0.245, c: 0.026, h: 56 },
    moonlightKelvin: 4800,
    windowKelvinRange: [2700, 4200],
    occupancyBias: 0.03,
    officeClusterMin: 2,
    officeClusterMax: 3,
    neonPaletteOklch: [
      { l: 0.74, c: 0.165, h: 58 },
      { l: 0.67, c: 0.170, h: 22 },
      { l: 0.71, c: 0.130, h: 158 },
    ],
    neonBloomStrength: 0.58,
    wetRoadReflectionGain: 0.35,
    atmosphericExtinctionBeta: 0.0076,
    shaderModeId: 1,
    defaultSignSamples: [
      { text: "홍대 LP바", script: "ko", preferredOrientation: "vertical", preferredZone: "edge-left" },
      { text: "연남 라멘", script: "ko", preferredOrientation: "horizontal", preferredZone: "lower" },
      { text: "JAZZ CLUB", script: "en", preferredOrientation: "horizontal", preferredZone: "mid" },
      { text: "喫茶店", script: "ja", preferredOrientation: "vertical", preferredZone: "edge-right" },
    ],
  },
  "cyber-neon-alley": {
    id: "cyber-neon-alley",
    labelKo: "고채도 사이버 네온 골목",
    descriptionKo: "청록과 마젠타 네온이 짙은 야간 안개 속에서 또렷하게 대비되는 사이버펑크 무드",
    defaultBuildingType: "mixed",
    skyZenithOklch: { l: 0.135, c: 0.042, h: 282 },
    skyHorizonOklch: { l: 0.235, c: 0.064, h: 308 },
    hazeOklch: { l: 0.220, c: 0.038, h: 274 },
    facadeBaseOklch: { l: 0.195, c: 0.032, h: 272 },
    moonlightKelvin: 8600,
    windowKelvinRange: [3400, 6500],
    occupancyBias: 0.025,
    officeClusterMin: 2,
    officeClusterMax: 4,
    neonPaletteOklch: [
      { l: 0.74, c: 0.185, h: 196 },
      { l: 0.66, c: 0.215, h: 342 },
      { l: 0.78, c: 0.165, h: 92 },
    ],
    neonBloomStrength: 0.92,
    wetRoadReflectionGain: 0.92,
    atmosphericExtinctionBeta: 0.0094,
    shaderModeId: 2,
    defaultSignSamples: [
      { text: "네오 클리닉", script: "ko", preferredOrientation: "vertical", preferredZone: "edge-left" },
      { text: "電脳市場", script: "ja", preferredOrientation: "vertical", preferredZone: "edge-right" },
      { text: "CYBER 99", script: "en", preferredOrientation: "horizontal", preferredZone: "lower" },
      { text: "심야 데이터", script: "ko", preferredOrientation: "horizontal", preferredZone: "mid" },
    ],
  },
  "quiet-midnight-apartment": {
    id: "quiet-midnight-apartment",
    labelKo: "심야 아파트 주거단지",
    descriptionKo: "대부분의 세대가 소등된 고요한 밤, 드문드문 켜진 거실 불빛이 돋보이는 주거 야경 무드",
    defaultBuildingType: "residential",
    skyZenithOklch: { l: 0.145, c: 0.024, h: 250 },
    skyHorizonOklch: { l: 0.225, c: 0.028, h: 242 },
    hazeOklch: { l: 0.215, c: 0.020, h: 246 },
    facadeBaseOklch: { l: 0.235, c: 0.016, h: 248 },
    moonlightKelvin: 6800,
    windowKelvinRange: [2700, 4800],
    occupancyBias: -0.025,
    officeClusterMin: 1,
    officeClusterMax: 3,
    neonPaletteOklch: [
      { l: 0.72, c: 0.125, h: 68 },
      { l: 0.66, c: 0.115, h: 162 },
    ],
    neonBloomStrength: 0.34,
    wetRoadReflectionGain: 0.20,
    atmosphericExtinctionBeta: 0.0072,
    shaderModeId: 3,
    defaultSignSamples: [
      { text: "102동 관리실", script: "ko", preferredOrientation: "horizontal", preferredZone: "lower" },
      { text: "24시 마트", script: "ko", preferredOrientation: "horizontal", preferredZone: "lower" },
      { text: "APARTMENT", script: "en", preferredOrientation: "horizontal", preferredZone: "upper" },
    ],
  },
};

export const DEPTH_BAND_DEFAULT_DISTANCES_M: Readonly<Record<CityscapeDepthBand, number>> = {
  foreground: 22,
  midground: 78,
  background: 168,
};

export function getCityscapeMoodPreset(moodId: CityscapeNightMoodId): CityscapeMoodPreset {
  return CITYSCAPE_NIGHT_PRESETS[moodId];
}

export function listCityscapeMoodPresets(): readonly CityscapeMoodPreset[] {
  return [
    CITYSCAPE_NIGHT_PRESETS["seoul-gangnam-noir"],
    CITYSCAPE_NIGHT_PRESETS["hongdae-warm-alley"],
    CITYSCAPE_NIGHT_PRESETS["cyber-neon-alley"],
    CITYSCAPE_NIGHT_PRESETS["quiet-midnight-apartment"],
  ];
}

export function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function formatSafeDecimal(value: number, digits = 3): string {
  const safe = Number.isFinite(value) ? value : 0;
  const factor = Math.pow(10, digits);
  const rounded = Math.round(safe * factor) / factor;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return normalized.toFixed(digits);
}

export function normalizeHueDeg(hue: number): number {
  if (!Number.isFinite(hue)) return 0;
  const mod = hue % 360;
  return mod < 0 ? mod + 360 : mod;
}

export function formatOklchCss(color: OklchColor): string {
  const l = clampFinite(color.l, 0, 1, 0.5);
  const c = clampFinite(color.c, 0, 0.4, 0);
  const h = normalizeHueDeg(color.h);
  if (color.alpha !== undefined && Number.isFinite(color.alpha) && color.alpha < 0.999) {
    const a = clampFinite(color.alpha, 0, 1, 1);
    return `oklch(${formatSafeDecimal(l, 3)} ${formatSafeDecimal(c, 3)} ${formatSafeDecimal(h, 1)} / ${formatSafeDecimal(a, 3)})`;
  }
  return `oklch(${formatSafeDecimal(l, 3)} ${formatSafeDecimal(c, 3)} ${formatSafeDecimal(h, 1)})`;
}

/**
 * 시간대(`19..23`, `0..4`, 또는 확장 표기 `24..28`)를 정규화한다.
 * `hoursSinceEveningStart`는 19시=0, 자정(0시)=5, 새벽 3시=8, 새벽 4시=9로 매핑된다.
 */
export function normalizeHourOfNight(hourOfNight: number): {
  readonly clockHour: number;
  readonly hoursSinceEveningStart: number;
} {
  const safe = Number.isFinite(hourOfNight) ? hourOfNight : 22;
  let extended: number;
  if (safe >= 0 && safe <= 4) {
    extended = safe + 24;
  } else if (safe > 4 && safe < 12) {
    extended = 28;
  } else if (safe >= 12 && safe < 19) {
    extended = 19;
  } else if (safe >= 19 && safe <= 28) {
    extended = safe;
  } else {
    extended = clampFinite(safe, 19, 28, 22);
  }
  const hoursSinceEveningStart = clampFinite(extended - 19, 0, 9, 3);
  const rawClock = extended >= 24 ? extended - 24 : extended;
  const clockHour = Math.round(rawClock * 100) / 100;
  return { clockHour, hoursSinceEveningStart };
}

/**
 * 32비트 FNV-1a 기반 결정론적 시드 해시.
 */
export function hashSeed32(seed: string | number): number {
  const text = String(seed);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Mulberry32 기반 결정론적 [0, 1) 의사난수 생성기.
 */
export function createDeterministicRng(seed: string | number): () => number {
  let state = hashSeed32(seed) || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rectOverlaps(a: Rect2D, b: Rect2D, margin = 0): boolean {
  const m = Number.isFinite(margin) ? margin : 0;
  return (
    a.x - m < b.x + b.width &&
    a.x + a.width + m > b.x &&
    a.y - m < b.y + b.height &&
    a.y + a.height + m > b.y
  );
}

export function rectInsideBounds(inner: Rect2D, bounds: Rect2D, epsilon = 0.001): boolean {
  return (
    inner.x >= bounds.x - epsilon &&
    inner.y >= bounds.y - epsilon &&
    inner.x + inner.width <= bounds.x + bounds.width + epsilon &&
    inner.y + inner.height <= bounds.y + bounds.height + epsilon
  );
}
