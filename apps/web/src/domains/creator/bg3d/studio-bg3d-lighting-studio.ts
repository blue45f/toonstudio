import { studioBg3dLightAnglesToDirection } from "./studio-bg3d-light-direction";
import {
  normalizeStudioBg3dSceneDocument,
  type StudioBg3dBackgroundSettings,
  type StudioBg3dDirectionalLightSettings,
  type StudioBg3dLightingSettings,
  type StudioBg3dSceneDocument,
  type StudioBg3dToneMapping,
} from "./studio-bg3d-scene-document";

const VALUE_EPSILON = 1e-4;

export interface StudioBg3dLightingStudioPreset {
  readonly id:
    | "balanced"
    | "portrait-soft"
    | "action-rim"
    | "lineart-flat"
    | "cinematic-3point"
    | "sunset-golden"
    | "cyberpunk-neon"
    | "midnight-noir";
  readonly label: string;
  readonly description: string;
  readonly lighting: StudioBg3dLightingSettings;
  readonly exposure: number;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const STUDIO_BG3D_LIGHTING_STUDIO_PRESETS:
readonly StudioBg3dLightingStudioPreset[] = deepFreeze([
  {
    id: "cinematic-3point",
    label: "시네마틱 3점",
    description: "따뜻한 키와 차가운 필, 낮은 환경광으로 인물 실루엣을 또렷하게 분리",
    exposure: 1.12,
    lighting: {
      ambientColor: "#222a36",
      ambientIntensity: 0.42,
      key: {
        color: "#ffdfa0",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: 45,
          elevationDeg: 45,
        }),
        intensity: 1.65,
        castsShadow: true,
      },
      fill: {
        color: "#60a5fa",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: -135,
          elevationDeg: 25,
        }),
        intensity: 0.45,
        castsShadow: false,
      },
    },
  },
  {
    id: "balanced",
    label: "균형 3점",
    description: "형태와 재질을 고르게 읽는 웹툰 제작 기본광",
    exposure: 1,
    lighting: {
      ambientColor: "#dbe5f0",
      ambientIntensity: 0.58,
      key: {
        color: "#fff0d2",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: 38,
          elevationDeg: 48,
        }),
        intensity: 1.25,
        castsShadow: true,
      },
      fill: {
        color: "#b9cfee",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: -132,
          elevationDeg: 28,
        }),
        intensity: 0.38,
        castsShadow: false,
      },
    },
  },
  {
    id: "portrait-soft",
    label: "인물 소프트",
    description: "얼굴 명암을 열고 피부와 의상 색을 부드럽게 유지",
    exposure: 1.05,
    lighting: {
      ambientColor: "#eee4df",
      ambientIntensity: 0.82,
      key: {
        color: "#ffe8d1",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: -32,
          elevationDeg: 56,
        }),
        intensity: 0.92,
        castsShadow: true,
      },
      fill: {
        color: "#d2e3ff",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: 118,
          elevationDeg: 34,
        }),
        intensity: 0.56,
        castsShadow: false,
      },
    },
  },
  {
    id: "action-rim",
    label: "액션 림",
    description: "강한 측후면 키와 절제된 필로 실루엣을 분리",
    exposure: 0.9,
    lighting: {
      ambientColor: "#53627b",
      ambientIntensity: 0.2,
      key: {
        color: "#ffd0a4",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: 122,
          elevationDeg: 30,
        }),
        intensity: 1.82,
        castsShadow: true,
      },
      fill: {
        color: "#7898d8",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: -68,
          elevationDeg: 18,
        }),
        intensity: 0.16,
        castsShadow: false,
      },
    },
  },
  {
    id: "lineart-flat",
    label: "선화 균일",
    description: "LT·선화 추출 전 면의 과한 명암을 줄이는 평탄광",
    exposure: 1.08,
    lighting: {
      ambientColor: "#e7e7e2",
      ambientIntensity: 1.04,
      key: {
        color: "#fff4df",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: 24,
          elevationDeg: 68,
        }),
        intensity: 0.58,
        castsShadow: false,
      },
      fill: {
        color: "#dfe8f2",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: -156,
          elevationDeg: 52,
        }),
        intensity: 0.46,
        castsShadow: false,
      },
    },
  },
  {
    id: "sunset-golden",
    label: "황혼 노을",
    description: "따뜻한 골든아워 주광과 짙은 보랏빛 역광으로 서정적인 석양 연출",
    exposure: 1.15,
    lighting: {
      ambientColor: "#451a2d",
      ambientIntensity: 0.45,
      key: {
        color: "#ff8c38",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: -70,
          elevationDeg: 22,
        }),
        intensity: 1.95,
        castsShadow: true,
      },
      fill: {
        color: "#c084fc",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: 110,
          elevationDeg: 35,
        }),
        intensity: 0.52,
        castsShadow: false,
      },
    },
  },
  {
    id: "cyberpunk-neon",
    label: "사이버펑크 네온",
    description: "시안 메인광과 마젠타 림라이트의 강렬한 네온 무드",
    exposure: 1.2,
    lighting: {
      ambientColor: "#090d16",
      ambientIntensity: 0.32,
      key: {
        color: "#06b6d4",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: 55,
          elevationDeg: 38,
        }),
        intensity: 1.75,
        castsShadow: true,
      },
      fill: {
        color: "#f43f5e",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: -125,
          elevationDeg: 42,
        }),
        intensity: 0.88,
        castsShadow: true,
      },
    },
  },
  {
    id: "midnight-noir",
    label: "심야 느와르",
    description: "차가운 달빛과 짙은 명암 대비로 긴장감 있는 밤 씬 연출",
    exposure: 0.88,
    lighting: {
      ambientColor: "#0b1220",
      ambientIntensity: 0.22,
      key: {
        color: "#bfdbfe",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: 135,
          elevationDeg: 62,
        }),
        intensity: 1.45,
        castsShadow: true,
      },
      fill: {
        color: "#1e3a8a",
        direction: studioBg3dLightAnglesToDirection({
          azimuthDeg: -45,
          elevationDeg: 20,
        }),
        intensity: 0.28,
        castsShadow: false,
      },
    },
  },
] satisfies StudioBg3dLightingStudioPreset[]);

function valuesMatch(left: number, right: number): boolean {
  return Math.abs(left - right) <= VALUE_EPSILON;
}

function directionsMatch(
  left: StudioBg3dDirectionalLightSettings["direction"],
  right: StudioBg3dDirectionalLightSettings["direction"],
): boolean {
  return left.every((value, index) => valuesMatch(value, right[index] ?? Number.NaN));
}

function directionalLightsMatch(
  left: StudioBg3dDirectionalLightSettings,
  right: StudioBg3dDirectionalLightSettings,
): boolean {
  return left.color.toLowerCase() === right.color.toLowerCase()
    && valuesMatch(left.intensity, right.intensity)
    && left.castsShadow === right.castsShadow
    && directionsMatch(left.direction, right.direction);
}

export function resolveStudioBg3dLightingStudioPreset(
  lighting: StudioBg3dLightingSettings,
  exposure: number,
): StudioBg3dLightingStudioPreset | null {
  return STUDIO_BG3D_LIGHTING_STUDIO_PRESETS.find((preset) =>
    preset.lighting.ambientColor.toLowerCase() === lighting.ambientColor.toLowerCase()
      && valuesMatch(preset.lighting.ambientIntensity, lighting.ambientIntensity)
      && directionalLightsMatch(preset.lighting.key, lighting.key)
      && directionalLightsMatch(preset.lighting.fill, lighting.fill)
      && valuesMatch(preset.exposure, exposure)
  ) ?? null;
}

export type StudioBg3dWebtoonAtmospherePresetId =
  | "morning"
  | "day"
  | "sunset"
  | "night"
  | "rain"
  | "snow"
  | "backlight";

export interface StudioBg3dWebtoonAtmosphereFog {
  readonly active: boolean;
  readonly color: string;
  /** 0~1 범위의 웹툰 대기 안개 밀도 지수. */
  readonly density: number;
  readonly near: number;
  readonly far: number;
}

export interface StudioBg3dWebtoonAtmosphereWeather {
  readonly presetId: string;
  readonly precipitationKind: "none" | "rain" | "snow";
  readonly precipitationIntensity01: number;
  readonly sunTimeHours: number;
  readonly sunAzimuthDeg: number;
  readonly sunElevationDeg: number;
  readonly windStrength01: number;
  readonly badgeKo: string;
  readonly badgeEn: string;
}

export interface StudioBg3dWebtoonAtmospherePreset {
  readonly id: StudioBg3dWebtoonAtmospherePresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly lighting: StudioBg3dLightingSettings;
  readonly exposure: number;
  readonly toneMapping: StudioBg3dToneMapping;
  readonly skyPresetId: StudioBg3dBackgroundSettings["skyPresetId"];
  readonly backgroundColor: string;
  readonly fog: StudioBg3dWebtoonAtmosphereFog;
  readonly inkLineWeightPx: number;
  readonly weather: StudioBg3dWebtoonAtmosphereWeather;
  /** DOM UI 전용 OKLCH 의미 토큰 색 (원시 HEX 금지). */
  readonly spectrumToneVar: string;
  readonly spectrumGlowMix: string;
}

/**
 * Snaptoon급 원클릭 웹툰 라이팅·분위기 7대 프리셋 (아침 · 낮 · 노을 · 밤 · 비 · 눈 · 역광).
 * 조명·노출·하늘·안개 밀도·외곽선 두께(inkLineWeightPx)·날씨/태양각을 한 번에 전환한다.
 */
export const STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS:
readonly StudioBg3dWebtoonAtmospherePreset[] = deepFreeze([
  {
    id: "morning",
    labelKo: "아침",
    labelEn: "Morning",
    descriptionKo: "맑은 금빛 사광과 옅은 아침 물안개로 상쾌한 등교·출근 컷 연출",
    descriptionEn: "Crisp golden morning rays with soft mist for fresh daytime panels",
    exposure: 1.08,
    toneMapping: "aces-filmic",
    skyPresetId: "clear_day",
    backgroundColor: "#e6f0fb",
    fog: { active: true, color: "#dce9f8", density: 0.24, near: 12, far: 64 },
    inkLineWeightPx: 1.4,
    weather: {
      presetId: "golden-dawn",
      precipitationKind: "none",
      precipitationIntensity01: 0,
      sunTimeHours: 7.5,
      sunAzimuthDeg: 78,
      sunElevationDeg: 24,
      windStrength01: 0.18,
      badgeKo: "07:30 맑은 사광",
      badgeEn: "07:30 crisp rays",
    },
    lighting: {
      ambientColor: "#dce8f5",
      ambientIntensity: 0.72,
      key: {
        color: "#ffe3b3",
        direction: studioBg3dLightAnglesToDirection({ azimuthDeg: 78, elevationDeg: 24 }),
        intensity: 1.42,
        castsShadow: true,
      },
      fill: {
        color: "#a8d0ff",
        direction: studioBg3dLightAnglesToDirection({ azimuthDeg: -102, elevationDeg: 32 }),
        intensity: 0.52,
        castsShadow: false,
      },
    },
    spectrumToneVar: "var(--color-warn)",
    spectrumGlowMix: "color-mix(in oklch, var(--color-warn) 22%, var(--color-card))",
  },
  {
    id: "day",
    labelKo: "낮",
    labelEn: "Day",
    descriptionKo: "선명한 정오 직사광과 얇고 깔끔한 외곽선으로 일상·학원 배경 최적화",
    descriptionEn: "Clean midday key light and crisp line weight for everyday scenes",
    exposure: 1.04,
    toneMapping: "aces-filmic",
    skyPresetId: "clear_day",
    backgroundColor: "#eef4fb",
    fog: { active: true, color: "#e5eef9", density: 0.12, near: 20, far: 96 },
    inkLineWeightPx: 1.2,
    weather: {
      presetId: "clear-day",
      precipitationKind: "none",
      precipitationIntensity01: 0,
      sunTimeHours: 13.0,
      sunAzimuthDeg: 36,
      sunElevationDeg: 60,
      windStrength01: 0.14,
      badgeKo: "13:00 맑은 정오",
      badgeEn: "13:00 clear noon",
    },
    lighting: {
      ambientColor: "#e4edf8",
      ambientIntensity: 0.84,
      key: {
        color: "#fff7e8",
        direction: studioBg3dLightAnglesToDirection({ azimuthDeg: 36, elevationDeg: 60 }),
        intensity: 1.32,
        castsShadow: true,
      },
      fill: {
        color: "#c2dbf8",
        direction: studioBg3dLightAnglesToDirection({ azimuthDeg: -144, elevationDeg: 38 }),
        intensity: 0.48,
        castsShadow: false,
      },
    },
    spectrumToneVar: "var(--color-cool)",
    spectrumGlowMix: "color-mix(in oklch, var(--color-cool) 20%, var(--color-card))",
  },
  {
    id: "sunset",
    labelKo: "노을",
    labelEn: "Sunset",
    descriptionKo: "낮은 호박빛 주광과 보라빛 그림자, 굵어진 윤곽선으로 감정 고조 컷 연출",
    descriptionEn: "Warm amber sunset rays, violet fill, and richer outlines for dramatic emotion",
    exposure: 1.14,
    toneMapping: "aces-filmic",
    skyPresetId: "sunset",
    backgroundColor: "#f2c3a4",
    fog: { active: true, color: "#e8a586", density: 0.36, near: 9, far: 48 },
    inkLineWeightPx: 1.8,
    weather: {
      presetId: "crimson-sunset",
      precipitationKind: "none",
      precipitationIntensity01: 0,
      sunTimeHours: 17.75,
      sunAzimuthDeg: -72,
      sunElevationDeg: 16,
      windStrength01: 0.28,
      badgeKo: "17:45 황혼 노을",
      badgeEn: "17:45 amber dusk",
    },
    lighting: {
      ambientColor: "#63364b",
      ambientIntensity: 0.48,
      key: {
        color: "#ff9248",
        direction: studioBg3dLightAnglesToDirection({ azimuthDeg: -72, elevationDeg: 16 }),
        intensity: 1.88,
        castsShadow: true,
      },
      fill: {
        color: "#b78bfa",
        direction: studioBg3dLightAnglesToDirection({ azimuthDeg: 108, elevationDeg: 30 }),
        intensity: 0.56,
        castsShadow: false,
      },
    },
    spectrumToneVar: "var(--color-accent)",
    spectrumGlowMix: "color-mix(in oklch, var(--color-accent) 24%, var(--color-card))",
  },
  {
    id: "night",
    labelKo: "밤",
    labelEn: "Night",
    descriptionKo: "푸른 달빛과 깊은 야간 안개, 묵직한 먹선으로 스릴러·심야 장면 완성",
    descriptionEn: "Cool moonlight, deep nocturnal fog, and bold ink contours for night drama",
    exposure: 0.88,
    toneMapping: "aces-filmic",
    skyPresetId: "night",
    backgroundColor: "#141d31",
    fog: { active: true, color: "#19243d", density: 0.48, near: 6, far: 36 },
    inkLineWeightPx: 2.3,
    weather: {
      presetId: "moonlit-night",
      precipitationKind: "none",
      precipitationIntensity01: 0,
      sunTimeHours: 22.5,
      sunAzimuthDeg: 132,
      sunElevationDeg: 52,
      windStrength01: 0.2,
      badgeKo: "22:30 달빛 심야",
      badgeEn: "22:30 moonlit",
    },
    lighting: {
      ambientColor: "#1e2e4f",
      ambientIntensity: 0.34,
      key: {
        color: "#9bc4ff",
        direction: studioBg3dLightAnglesToDirection({ azimuthDeg: 132, elevationDeg: 52 }),
        intensity: 1.48,
        castsShadow: true,
      },
      fill: {
        color: "#435ea3",
        direction: studioBg3dLightAnglesToDirection({ azimuthDeg: -48, elevationDeg: 22 }),
        intensity: 0.36,
        castsShadow: false,
      },
    },
    spectrumToneVar: "var(--color-cool)",
    spectrumGlowMix: "color-mix(in oklch, var(--color-cool) 26%, var(--color-card))",
  },
  {
    id: "rain",
    labelKo: "비",
    labelEn: "Rain",
    descriptionKo: "젖은 회청색 확산광과 짙은 비안개, 선명한 펜선으로 비 오는 거리 연출",
    descriptionEn: "Overcast wet blue-grey light, dense rain mist, and crisp ink separation",
    exposure: 0.94,
    toneMapping: "aces-filmic",
    skyPresetId: "night",
    backgroundColor: "#334255",
    fog: { active: true, color: "#4e6075", density: 0.68, near: 3.5, far: 24 },
    inkLineWeightPx: 1.9,
    weather: {
      presetId: "rainy-overcast",
      precipitationKind: "rain",
      precipitationIntensity01: 0.72,
      sunTimeHours: 15.5,
      sunAzimuthDeg: -28,
      sunElevationDeg: 44,
      windStrength01: 0.64,
      badgeKo: "비 72% · 습기 안개",
      badgeEn: "Rain 72% · mist",
    },
    lighting: {
      ambientColor: "#6e8299",
      ambientIntensity: 0.64,
      key: {
        color: "#bfd4ea",
        direction: studioBg3dLightAnglesToDirection({ azimuthDeg: -28, elevationDeg: 44 }),
        intensity: 1.02,
        castsShadow: true,
      },
      fill: {
        color: "#7c99b8",
        direction: studioBg3dLightAnglesToDirection({ azimuthDeg: 145, elevationDeg: 28 }),
        intensity: 0.54,
        castsShadow: false,
      },
    },
    spectrumToneVar: "var(--color-good)",
    spectrumGlowMix: "color-mix(in oklch, var(--color-good) 20%, var(--color-card))",
  },
  {
    id: "snow",
    labelKo: "눈",
    labelEn: "Snow",
    descriptionKo: "부드러운 설원 반사광과 포근한 흰 안개, 섬세한 얇은 선화로 겨울 컷 연출",
    descriptionEn: "Bright snow bounce light, soft white haze, and delicate thin linework",
    exposure: 1.12,
    toneMapping: "aces-filmic",
    skyPresetId: "clear_day",
    backgroundColor: "#e6eef6",
    fog: { active: true, color: "#eef4fa", density: 0.56, near: 5, far: 30 },
    inkLineWeightPx: 1.1,
    weather: {
      presetId: "winter-snow",
      precipitationKind: "snow",
      precipitationIntensity01: 0.68,
      sunTimeHours: 11.0,
      sunAzimuthDeg: 22,
      sunElevationDeg: 40,
      windStrength01: 0.32,
      badgeKo: "눈 68% · 설원 반사",
      badgeEn: "Snow 68% · bright",
    },
    lighting: {
      ambientColor: "#dbe9f7",
      ambientIntensity: 0.96,
      key: {
        color: "#f4f8ff",
        direction: studioBg3dLightAnglesToDirection({ azimuthDeg: 22, elevationDeg: 40 }),
        intensity: 1.12,
        castsShadow: true,
      },
      fill: {
        color: "#cbe0f5",
        direction: studioBg3dLightAnglesToDirection({ azimuthDeg: -150, elevationDeg: 24 }),
        intensity: 0.68,
        castsShadow: false,
      },
    },
    spectrumToneVar: "var(--color-cool)",
    spectrumGlowMix: "color-mix(in oklch, var(--color-cool) 18%, var(--color-card))",
  },
  {
    id: "backlight",
    labelKo: "역광",
    labelEn: "Backlight",
    descriptionKo: "강렬한 후면 림라이트와 대비 높은 굵은 실루엣 선화로 주인공 등장 컷 극대화",
    descriptionEn: "Dramatic rear rim lighting and bold silhouette contours for hero entrances",
    exposure: 1.06,
    toneMapping: "aces-filmic",
    skyPresetId: "sunset",
    backgroundColor: "#2f2438",
    fog: { active: true, color: "#c9856b", density: 0.42, near: 7, far: 42 },
    inkLineWeightPx: 2.6,
    weather: {
      presetId: "dramatic-backlight",
      precipitationKind: "none",
      precipitationIntensity01: 0,
      sunTimeHours: 18.15,
      sunAzimuthDeg: 172,
      sunElevationDeg: 14,
      windStrength01: 0.42,
      badgeKo: "후면 림광 · 강실루엣",
      badgeEn: "Rear rim · silhouette",
    },
    lighting: {
      ambientColor: "#332a42",
      ambientIntensity: 0.28,
      key: {
        color: "#ffd194",
        direction: studioBg3dLightAnglesToDirection({ azimuthDeg: 172, elevationDeg: 14 }),
        intensity: 2.15,
        castsShadow: true,
      },
      fill: {
        color: "#769cf2",
        direction: studioBg3dLightAnglesToDirection({ azimuthDeg: -12, elevationDeg: 26 }),
        intensity: 0.26,
        castsShadow: false,
      },
    },
    spectrumToneVar: "var(--color-accent-2)",
    spectrumGlowMix: "color-mix(in oklch, var(--color-accent-2) 24%, var(--color-card))",
  },
] satisfies StudioBg3dWebtoonAtmospherePreset[]);

export function getStudioBg3dWebtoonAtmospherePreset(
  presetId: StudioBg3dWebtoonAtmospherePresetId | string,
): StudioBg3dWebtoonAtmospherePreset | null {
  return STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

export function resolveStudioBg3dWebtoonAtmospherePreset(
  document: Pick<StudioBg3dSceneDocument, "lighting" | "render" | "background" | "output">,
): StudioBg3dWebtoonAtmospherePreset | null {
  return STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS.find((preset) =>
    preset.lighting.ambientColor.toLowerCase() === document.lighting.ambientColor.toLowerCase()
      && valuesMatch(preset.lighting.ambientIntensity, document.lighting.ambientIntensity)
      && directionalLightsMatch(preset.lighting.key, document.lighting.key)
      && directionalLightsMatch(preset.lighting.fill, document.lighting.fill)
      && valuesMatch(preset.exposure, document.render.exposure)
      && valuesMatch(preset.inkLineWeightPx, document.output.line.widthPx)
      && preset.skyPresetId === document.background.skyPresetId
      && preset.fog.active === document.background.fogEnabled
  ) ?? null;
}

export function applyStudioBg3dWebtoonAtmospherePresetToDocument(
  document: StudioBg3dSceneDocument,
  presetOrId: StudioBg3dWebtoonAtmospherePreset | StudioBg3dWebtoonAtmospherePresetId,
): StudioBg3dSceneDocument | null {
  const preset = typeof presetOrId === "string"
    ? getStudioBg3dWebtoonAtmospherePreset(presetOrId)
    : presetOrId;
  if (!preset) return null;
  const candidate: StudioBg3dSceneDocument = {
    ...document,
    background: {
      ...document.background,
      mode: document.background.mode === "transparent" ? "transparent" : "sky",
      color: preset.backgroundColor,
      skyPresetId: preset.skyPresetId,
      fogEnabled: preset.fog.active,
      fogColor: preset.fog.color,
      fogNear: preset.fog.near,
      fogFar: preset.fog.far,
    },
    lighting: {
      ...document.lighting,
      ambientColor: preset.lighting.ambientColor,
      ambientIntensity: preset.lighting.ambientIntensity,
      key: {
        ...preset.lighting.key,
        direction: [...preset.lighting.key.direction] as [number, number, number],
      },
      fill: {
        ...preset.lighting.fill,
        direction: [...preset.lighting.fill.direction] as [number, number, number],
      },
    },
    render: {
      ...document.render,
      exposure: preset.exposure,
      toneMapping: preset.toneMapping,
    },
    output: {
      ...document.output,
      line: {
        ...document.output.line,
        widthPx: preset.inkLineWeightPx,
      },
    },
  };
  return normalizeStudioBg3dSceneDocument(candidate);
}
