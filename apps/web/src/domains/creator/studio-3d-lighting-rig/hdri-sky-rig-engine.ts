/**
 * Wave 42A — 3D 배경·캐릭터 통합 스튜디오 조명 릭 · 물리 하늘(서울 계절·시간대 태양 궤적) · 그림자 캐처 엔진.
 *
 * - 서울 위도(37.57°N, 동경 126.98°E, KST 기준경선 135°E) 기반 태양 고도각·방위각(elevation/azimuth)
 *   정밀 궤적 계산기(`computeSeoulSunPosition`) 및 하루 궤적 샘플러(`sampleSeoulDailyArc`).
 * - 6종 물리 하늘·대기 산란 프리셋(`정오 맑음`, `황금 노을`, `블루아워`, `비 오는 흐림`, `달빛 안뜰`, `겨울 정오`)
 *   및 레일리(Rayleigh)·미(Mie)·오존(Chappuis) 산란 OKLCH 돔 색채 계산기.
 * - 3점 조명(Key/Fill/Rim) + 건축 바운스 라이트(5종 재질) + 바닥 그림자 캐처(Shadow Catcher) 투영 타원/오파시티 계산.
 * - 2D 컷 리라이트 엔진용 버전드 JSON 조명 브리지 익스포터(`export2dCutRelightBridge`).
 */

export const SEOUL_LATITUDE_DEG = 37.5665 as const;
export const SEOUL_LATITUDE_DISPLAY = 37.57 as const;
export const SEOUL_LONGITUDE_DEG = 126.978 as const;
export const SEOUL_STANDARD_MERIDIAN_DEG = 135 as const;
export const MIN_SOLAR_HOUR_KST = 5 as const;
export const MAX_SOLAR_HOUR_KST = 22 as const;
export const MIN_RIG_KELVIN = 2200 as const;
export const MAX_RIG_KELVIN = 10000 as const;
export const RELIGHT_BRIDGE_SCHEMA_VERSION = "toonstudio.3d-lighting-bridge.v1" as const;

export type SeoulSeasonId = "spring" | "summer" | "autumn" | "winter";
export type PhysicalSkyPresetId = "noon-clear" | "golden-sunset" | "blue-hour" | "rainy-overcast" | "moonlit-courtyard" | "winter-noon";
export type SkyPhaseId = "daylight" | "golden-hour" | "blue-hour" | "night";
export type ArchitecturalSurfaceId = "warm-plaster" | "hanok-wood" | "wet-asphalt" | "concrete-courtyard" | "snow-slate";
export type Suggested2dRelightPresetId = "noon" | "sunset" | "moonlight" | "indoor";

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number; }
export interface RgbTuple { readonly r: number; readonly g: number; readonly b: number; }
export interface OklchColor { readonly L: number; readonly C: number; readonly h: number; }
export interface ColorSwatch { readonly linear: RgbTuple; readonly srgb: RgbTuple; readonly oklch: OklchColor; readonly oklchCss: string; }

export interface SeoulSeasonSpec {
  readonly id: SeoulSeasonId; readonly labelKo: string; readonly labelEn: string;
  readonly dayOfYear: number; readonly solarTermKo: string; readonly solarTermEn: string;
}

export interface SeoulSunPosition {
  readonly season: SeoulSeasonId; readonly dayOfYear: number;
  readonly hourKst: number; readonly formattedHourKst: string;
  readonly latitudeDeg: number; readonly longitudeDeg: number;
  readonly declinationDeg: number; readonly equationOfTimeMin: number; readonly hourAngleDeg: number;
  readonly elevationDeg: number; readonly azimuthDeg: number;
  readonly compassDirectionKo: string; readonly compassDirectionEn: string;
  readonly direction3d: Vec3; readonly airMass: number; readonly isAboveHorizon: boolean;
  readonly skyPhase: SkyPhaseId; readonly estimatedKelvin: number; readonly directTransmittance: number;
}

export interface SeoulDailyArcSummary {
  readonly season: SeoulSeasonId; readonly points: readonly SeoulSunPosition[];
  readonly maxElevationDeg: number; readonly solarNoonHourKst: number;
  readonly sunriseHourKst: number | null; readonly sunsetHourKst: number | null; readonly daylightHours: number;
}

export interface AtmosphericScatteringParams {
  readonly rayleighCoeff: number; readonly mieCoeff: number; readonly mieG: number;
  readonly turbidity: number; readonly cloudCoverage: number; readonly groundAlbedo: number; readonly ozoneStrength: number;
}

export interface AtmosphericSkyEvaluation {
  readonly zenith: ColorSwatch; readonly midSky: ColorSwatch; readonly horizon: ColorSwatch;
  readonly groundBounce: ColorSwatch; readonly sunDisk: ColorSwatch;
  readonly rayleighOpticalDepth: number; readonly mieHazeIndex: number;
  readonly skyToSunRatio: number; readonly hemisphereIrradianceLux: number; readonly dominantSkyKelvin: number;
  readonly gradientStopsOklch: readonly { readonly offsetPct: number; readonly oklchCss: string }[];
}

export interface RigLightChannel {
  readonly enabled: boolean; readonly azimuthDeg: number; readonly elevationDeg: number;
  readonly intensity: number; readonly kelvin: number; readonly softness: number;
}

export interface ArchitecturalBounceConfig {
  readonly enabled: boolean; readonly surfaceMaterial: ArchitecturalSurfaceId;
  readonly azimuthDeg: number; readonly reflectance: number; readonly intensity: number; readonly kelvin: number;
}

export interface ShadowCatcherConfig {
  readonly enabled: boolean; readonly subjectHeightM: number; readonly subjectRadiusM: number;
  readonly groundRoughness: number; readonly contactAoStrength: number;
  readonly maxShadowLengthM: number; readonly catcherOpacityScale: number;
}

export interface StudioRigConfig {
  readonly presetId: PhysicalSkyPresetId; readonly season: SeoulSeasonId; readonly hourKst: number;
  readonly syncKeyWithSun: boolean; readonly atmosphere: AtmosphericScatteringParams;
  readonly key: RigLightChannel; readonly fill: RigLightChannel; readonly rim: RigLightChannel;
  readonly bounce: ArchitecturalBounceConfig; readonly shadowCatcher: ShadowCatcherConfig;
}

export interface PhysicalSkyPreset {
  readonly id: PhysicalSkyPresetId; readonly nameKo: string; readonly nameEn: string;
  readonly moodKo: string; readonly moodEn: string;
  readonly recommendedSeason: SeoulSeasonId; readonly recommendedHourKst: number;
  readonly config: StudioRigConfig;
}

export interface ArchitecturalSurfaceSpec {
  readonly id: ArchitecturalSurfaceId; readonly labelKo: string; readonly labelEn: string;
  readonly defaultReflectance: number; readonly defaultKelvin: number;
  readonly tintLinear: RgbTuple; readonly swatchOklchCss: string;
}

export interface ResolvedRigLight {
  readonly id: "key" | "fill" | "rim" | "architectural-bounce";
  readonly labelKo: string; readonly labelEn: string; readonly enabled: boolean;
  readonly azimuthDeg: number; readonly elevationDeg: number; readonly direction3d: Vec3;
  readonly intensity: number; readonly kelvin: number; readonly softness: number; readonly color: ColorSwatch;
}

export interface ShadowCatcherProjection {
  readonly enabled: boolean; readonly isAmbientOnly: boolean;
  readonly shadowAzimuthDeg: number; readonly sourceElevationDeg: number;
  readonly castLengthM: number; readonly centerOffsetX_m: number; readonly centerOffsetZ_m: number;
  readonly semiMajorAxisM: number; readonly semiMinorAxisM: number; readonly rotationDeg: number;
  readonly castOpacity: number; readonly contactAoRadiusM: number; readonly contactAoOpacity: number;
  readonly penumbraBlurPx: number; readonly shadowTint: ColorSwatch;
}

export interface StudioLightingRigEvaluation {
  readonly sun: SeoulSunPosition; readonly sky: AtmosphericSkyEvaluation;
  readonly key: ResolvedRigLight; readonly fill: ResolvedRigLight; readonly rim: ResolvedRigLight; readonly bounce: ResolvedRigLight;
  readonly lights: readonly ResolvedRigLight[]; readonly shadowCatcher: ShadowCatcherProjection;
  readonly metrics: {
    readonly activeLightCount: number; readonly keyToFillRatio: number; readonly rimSeparationIndex: number;
    readonly bounceFillContribution: number; readonly totalIlluminanceScore: number; readonly characterBackgroundMatchScore: number;
  };
}

export interface RelightBridge2dPayload {
  readonly schemaVersion: typeof RELIGHT_BRIDGE_SCHEMA_VERSION;
  readonly sourceEngine: "studio-3d-lighting-rig";
  readonly location: {
    readonly city: "Seoul"; readonly latitudeDeg: number; readonly longitudeDeg: number;
    readonly season: SeoulSeasonId; readonly hourKst: number; readonly formattedHourKst: string;
  };
  readonly sky: {
    readonly presetId: PhysicalSkyPresetId; readonly presetNameKo: string; readonly skyPhase: SkyPhaseId;
    readonly sunElevationDeg: number; readonly sunAzimuthDeg: number;
    readonly turbidity: number; readonly cloudCoverage: number;
    readonly zenithOklch: string; readonly horizonOklch: string; readonly groundBounceOklch: string;
    readonly hemisphereIrradianceLux: number;
  };
  readonly threeLayer2dRelight: {
    readonly suggestedPresetId: Suggested2dRelightPresetId; readonly kelvin: number;
    readonly albedoTint: readonly [number, number, number]; readonly shadowTint: readonly [number, number, number];
    readonly shadowDepth: number; readonly keyColor: readonly [number, number, number]; readonly keyIntensity: number;
    readonly bounceColor: readonly [number, number, number]; readonly bounceIntensity: number;
    readonly ambientFloor: number; readonly exposure: number;
  };
  readonly dynamicLights: readonly {
    readonly id: ResolvedRigLight["id"]; readonly enabled: boolean;
    readonly azimuthDeg: number; readonly elevationDeg: number; readonly direction3d: Vec3;
    readonly intensity: number; readonly kelvin: number; readonly softness: number;
    readonly linearRgb: readonly [number, number, number]; readonly oklchCss: string;
  }[];
  readonly shadowCatcher: {
    readonly enabled: boolean; readonly isAmbientOnly: boolean;
    readonly shadowAzimuthDeg: number; readonly castLengthM: number;
    readonly semiMajorAxisM: number; readonly semiMinorAxisM: number;
    readonly castOpacity: number; readonly contactAoOpacity: number;
    readonly penumbraBlurPx: number; readonly shadowTintOklch: string;
  };
  readonly characterBackgroundMatchScore: number;
}

export interface RelightBridgeValidationResult {
  readonly valid: boolean; readonly errorKo: string | null; readonly payload: RelightBridge2dPayload | null;
}

export const SEOUL_SEASONS: readonly SeoulSeasonSpec[] = [
  { id: "spring", labelKo: "봄 (춘분)", labelEn: "Spring Equinox", dayOfYear: 80, solarTermKo: "춘분", solarTermEn: "Vernal" },
  { id: "summer", labelKo: "여름 (하지)", labelEn: "Summer Solstice", dayOfYear: 172, solarTermKo: "하지", solarTermEn: "Summer" },
  { id: "autumn", labelKo: "가을 (추분)", labelEn: "Autumn Equinox", dayOfYear: 266, solarTermKo: "추분", solarTermEn: "Autumnal" },
  { id: "winter", labelKo: "겨울 (동지)", labelEn: "Winter Solstice", dayOfYear: 355, solarTermKo: "동지", solarTermEn: "Winter" },
];

export const ARCHITECTURAL_SURFACES: readonly ArchitecturalSurfaceSpec[] = [
  { id: "warm-plaster", labelKo: "따뜻한 회벽", labelEn: "Warm Plaster", defaultReflectance: 0.62, defaultKelvin: 3900, tintLinear: { r: 0.96, g: 0.86, b: 0.72 }, swatchOklchCss: "oklch(0.84 0.045 78)" },
  { id: "hanok-wood", labelKo: "한옥 목재", labelEn: "Hanok Timber", defaultReflectance: 0.44, defaultKelvin: 3100, tintLinear: { r: 0.88, g: 0.56, b: 0.3 }, swatchOklchCss: "oklch(0.66 0.095 56)" },
  { id: "wet-asphalt", labelKo: "젖은 아스팔트", labelEn: "Wet Asphalt", defaultReflectance: 0.28, defaultKelvin: 7400, tintLinear: { r: 0.48, g: 0.6, b: 0.78 }, swatchOklchCss: "oklch(0.51 0.045 245)" },
  { id: "concrete-courtyard", labelKo: "콘크리트 안뜰", labelEn: "Concrete Courtyard", defaultReflectance: 0.48, defaultKelvin: 5600, tintLinear: { r: 0.74, g: 0.74, b: 0.73 }, swatchOklchCss: "oklch(0.71 0.008 75)" },
  { id: "snow-slate", labelKo: "겨울 석재·설면", labelEn: "Winter Snow Slate", defaultReflectance: 0.78, defaultKelvin: 7800, tintLinear: { r: 0.82, g: 0.9, b: 1.0 }, swatchOklchCss: "oklch(0.88 0.025 232)" },
];

function clamp(v: number, min: number, max: number): number { return !Number.isFinite(v) ? min : v < min ? min : v > max ? max : v; }
function roundTo(v: number, decimals: number): number { const f = Math.pow(10, decimals); return Math.round(v * f) / f; }
function normalizeAngle360(deg: number): number { if (!Number.isFinite(deg)) return 0; const m = deg % 360; return m < 0 ? m + 360 : m; }
function degToRad(deg: number): number { return (deg * Math.PI) / 180; }
function radToDeg(rad: number): number { return (rad * 180) / Math.PI; }
function angularDistanceDeg(a: number, b: number): number { const d = Math.abs(normalizeAngle360(a) - normalizeAngle360(b)); return d > 180 ? 360 - d : d; }
function srgbChannelToLinear(c: number): number { const v = clamp(c, 0, 1); return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function linearChannelToSrgb(c: number): number { const v = clamp(c, 0, 1); return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }

function linearRgbToOklch(lin: RgbTuple): OklchColor {
  const r = clamp(lin.r, 0, 1);
  const g = clamp(lin.g, 0, 1);
  const b = clamp(lin.b, 0, 1);
  const l = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const m = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const s = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bLab = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bLab);
  const h = C < 1e-5 ? 0 : normalizeAngle360(radToDeg(Math.atan2(bLab, a)));
  return { L: clamp(L, 0, 1), C: clamp(C, 0, 0.4), h };
}

export function formatOklchCss(oklch: OklchColor, alpha?: number): string {
  const l = roundTo(clamp(oklch.L, 0, 1), 3);
  const c = roundTo(clamp(oklch.C, 0, 0.4), 3);
  const h = roundTo(normalizeAngle360(oklch.h), 1);
  return alpha !== undefined && alpha < 0.999 ? `oklch(${l} ${c} ${h} / ${roundTo(clamp(alpha, 0, 1), 3)})` : `oklch(${l} ${c} ${h})`;
}

function makeColorSwatch(linear: RgbTuple): ColorSwatch {
  const clampedLin: RgbTuple = { r: clamp(linear.r, 0, 1), g: clamp(linear.g, 0, 1), b: clamp(linear.b, 0, 1) };
  const srgb: RgbTuple = { r: linearChannelToSrgb(clampedLin.r), g: linearChannelToSrgb(clampedLin.g), b: linearChannelToSrgb(clampedLin.b) };
  const oklch = linearRgbToOklch(clampedLin);
  return { linear: clampedLin, srgb, oklch, oklchCss: formatOklchCss(oklch) };
}

function mixLinearRgb(a: RgbTuple, b: RgbTuple, tInput: number): RgbTuple {
  const t = clamp(tInput, 0, 1);
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** 2200K~10000K 색온도를 Planckian 흑체 복사 근사로 선형 RGB·OKLCH 스와치로 변환한다. */
export function kelvinToOklchColor(kelvinInput: number): ColorSwatch {
  const kelvin = clamp(kelvinInput, MIN_RIG_KELVIN, MAX_RIG_KELVIN);
  const temp = kelvin / 100;
  const r255 = temp <= 66 ? 255 : 329.698727446 * Math.pow(temp - 60, -0.1332047592);
  const g255 = temp <= 66
    ? 99.4708025861 * Math.log(temp) - 161.1195681661
    : 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  const b255 = temp >= 66 ? 255 : temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  return makeColorSwatch({
    r: srgbChannelToLinear(clamp(r255 / 255, 0, 1)),
    g: srgbChannelToLinear(clamp(g255 / 255, 0, 1)),
    b: srgbChannelToLinear(clamp(b255 / 255, 0, 1)),
  });
}

/** 방위각(0°=북, 90°=동, 180°=남, 270°=서)·고도각을 Y-Up 3D 단위 방향 벡터로 변환한다. */
export function sphericalAnglesToVec3(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = degToRad(normalizeAngle360(azimuthDeg));
  const el = degToRad(clamp(elevationDeg, -89.5, 89.5));
  const cosEl = Math.cos(el);
  return { x: roundTo(cosEl * Math.sin(az), 5), y: roundTo(Math.sin(el), 5), z: roundTo(-cosEl * Math.cos(az), 5) };
}

export function formatHourKst(hourInput: number): string {
  const totalMinutes = Math.round(clamp(hourInput, MIN_SOLAR_HOUR_KST, MAX_SOLAR_HOUR_KST) * 60);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function getCompassLabels(azimuthDeg: number): { readonly ko: string; readonly en: string } {
  const sectors = [
    { ko: "북", en: "N" }, { ko: "북동", en: "NE" }, { ko: "동", en: "E" }, { ko: "남동", en: "SE" },
    { ko: "남", en: "S" }, { ko: "남서", en: "SW" }, { ko: "서", en: "W" }, { ko: "북서", en: "NW" },
  ] as const;
  return sectors[Math.round(normalizeAngle360(azimuthDeg) / 45) % 8] ?? { ko: "남", en: "S" };
}

export function getSeasonSpec(season: SeoulSeasonId): SeoulSeasonSpec {
  return SEOUL_SEASONS.find((s) => s.id === season) ?? {
    id: "spring", labelKo: "봄 (춘분)", labelEn: "Spring Equinox", dayOfYear: 80, solarTermKo: "춘분", solarTermEn: "Vernal",
  };
}

/**
 * 서울(37.57°N, 126.98°E, KST 기준경선 135°E)의 계절·시각(05:00~22:00)별 태양 고도각·방위각 궤적을 계산한다.
 * Spencer 균시차·적위 근사와 Kasten-Young 대기 질량식을 사용한다.
 */
export function computeSeoulSunPosition(
  season: SeoulSeasonId,
  hourKstInput: number,
  options?: { readonly latitudeDeg?: number; readonly longitudeDeg?: number },
): SeoulSunPosition {
  const seasonSpec = getSeasonSpec(season);
  const hourKst = clamp(hourKstInput, MIN_SOLAR_HOUR_KST, MAX_SOLAR_HOUR_KST);
  const latitudeDeg = clamp(options?.latitudeDeg ?? SEOUL_LATITUDE_DEG, -66, 66);
  const longitudeDeg = clamp(options?.longitudeDeg ?? SEOUL_LONGITUDE_DEG, -180, 180);

  const gamma = ((2 * Math.PI) / 365) * (seasonSpec.dayOfYear - 1 + (hourKst - 12) / 24);
  const equationOfTimeMin = 229.18 * (
    0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)
  );
  const declRad =
    0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

  const trueSolarTimeMin = hourKst * 60 + equationOfTimeMin + 4 * (longitudeDeg - SEOUL_STANDARD_MERIDIAN_DEG);
  const hourAngleDeg = trueSolarTimeMin / 4 - 180;
  const latRad = degToRad(latitudeDeg);
  const sinEl = clamp(Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(degToRad(hourAngleDeg)), -1, 1);
  const elRad = Math.asin(sinEl);
  const elevationDeg = radToDeg(elRad);
  const cosEl = Math.cos(elRad);

  let azimuthDeg = 180;
  if (Math.abs(cosEl) > 1e-6 && Math.abs(Math.cos(latRad)) > 1e-6) {
    const azBase = radToDeg(Math.acos(clamp((Math.sin(declRad) - Math.sin(latRad) * sinEl) / (Math.cos(latRad) * cosEl), -1, 1)));
    azimuthDeg = hourAngleDeg > 0 ? 360 - azBase : azBase;
  }
  azimuthDeg = normalizeAngle360(azimuthDeg);

  const isAboveHorizon = elevationDeg > 0;
  const airMass = isAboveHorizon ? clamp(1 / (sinEl + 0.50572 * Math.pow(elevationDeg + 6.07995, -1.6364)), 1, 38) : 38;
  const directTransmittance = isAboveHorizon ? clamp(Math.exp(-0.14 * airMass), 0, 1) : 0;

  let skyPhase: SkyPhaseId = "night";
  let estimatedKelvin = 8900;
  if (elevationDeg >= 10) {
    skyPhase = "daylight";
    estimatedKelvin = Math.round(4500 + clamp((elevationDeg - 10) / 60, 0, 1) * 1450);
  } else if (elevationDeg >= -1) {
    skyPhase = "golden-hour";
    estimatedKelvin = Math.round(2850 + clamp((elevationDeg + 1) / 11, 0, 1) * 1550);
  } else if (elevationDeg >= -8) {
    skyPhase = "blue-hour";
    estimatedKelvin = Math.round(7400 + clamp((-1 - elevationDeg) / 7, 0, 1) * 1500);
  }

  const compass = getCompassLabels(azimuthDeg);
  return {
    season, dayOfYear: seasonSpec.dayOfYear, hourKst: roundTo(hourKst, 3), formattedHourKst: formatHourKst(hourKst),
    latitudeDeg: roundTo(latitudeDeg, 4), longitudeDeg: roundTo(longitudeDeg, 3), declinationDeg: roundTo(radToDeg(declRad), 2),
    equationOfTimeMin: roundTo(equationOfTimeMin, 2), hourAngleDeg: roundTo(hourAngleDeg, 2),
    elevationDeg: roundTo(elevationDeg, 2), azimuthDeg: roundTo(azimuthDeg, 2),
    compassDirectionKo: compass.ko, compassDirectionEn: compass.en, direction3d: sphericalAnglesToVec3(azimuthDeg, elevationDeg),
    airMass: roundTo(airMass, 2), isAboveHorizon, skyPhase, estimatedKelvin, directTransmittance: roundTo(directTransmittance, 3),
  };
}

/** 05:00~22:00 서울 일간 태양 궤적 포인트를 샘플링하고 일출·남중·일몰 요약을 산출한다. */
export function sampleSeoulDailyArc(season: SeoulSeasonId, stepMinutes = 30): SeoulDailyArcSummary {
  const stepHours = clamp(stepMinutes, 10, 120) / 60;
  const points: SeoulSunPosition[] = [];
  for (let h = MIN_SOLAR_HOUR_KST; h <= MAX_SOLAR_HOUR_KST + 1e-6; h += stepHours) {
    points.push(computeSeoulSunPosition(season, Math.min(h, MAX_SOLAR_HOUR_KST)));
  }
  let peak = points[0] ?? computeSeoulSunPosition(season, 12.5);
  let sunriseHourKst: number | null = null;
  let sunsetHourKst: number | null = null;

  for (let i = 0; i < points.length; i += 1) {
    const curr = points[i];
    if (!curr) continue;
    if (curr.elevationDeg > peak.elevationDeg) peak = curr;
    if (i > 0) {
      const prev = points[i - 1];
      if (!prev) continue;
      if (prev.elevationDeg <= 0 && curr.elevationDeg > 0 && sunriseHourKst === null) {
        sunriseHourKst = roundTo(prev.hourKst + (-prev.elevationDeg / Math.max(1e-5, curr.elevationDeg - prev.elevationDeg)) * (curr.hourKst - prev.hourKst), 2);
      }
      if (prev.elevationDeg > 0 && curr.elevationDeg <= 0 && sunsetHourKst === null) {
        sunsetHourKst = roundTo(prev.hourKst + (prev.elevationDeg / Math.max(1e-5, prev.elevationDeg - curr.elevationDeg)) * (curr.hourKst - prev.hourKst), 2);
      }
    }
  }

  const daylightHours = sunriseHourKst !== null && sunsetHourKst !== null
    ? roundTo(Math.max(0, sunsetHourKst - sunriseHourKst), 2)
    : roundTo(points.filter((p) => p.isAboveHorizon).length * stepHours, 2);
  return { season, points, maxElevationDeg: peak.elevationDeg, solarNoonHourKst: peak.hourKst, sunriseHourKst, sunsetHourKst, daylightHours };
}

/** 태양 위치와 레일리·미·오존·운량 파라미터로 물리 하늘 돔 색채(OKLCH)와 조도를 계산한다. */
export function evaluatePhysicalSkyAtmosphere(sun: SeoulSunPosition, params: AtmosphericScatteringParams): AtmosphericSkyEvaluation {
  const rayleigh = clamp(params.rayleighCoeff, 0.2, 2.5);
  const mie = clamp(params.mieCoeff, 0.001, 0.08);
  const turbidity = clamp(params.turbidity, 1, 10);
  const cloud = clamp(params.cloudCoverage, 0, 1);
  const albedo = clamp(params.groundAlbedo, 0.05, 0.9);
  const ozone = clamp(params.ozoneStrength, 0, 1.5);

  const dayW = clamp((sun.elevationDeg + 2) / 28, 0, 1);
  const goldenW = clamp(1 - Math.abs(sun.elevationDeg - 4.0) / 12, 0, 1) * (1 - Math.pow(cloud, 1.8) * 0.82);
  const twilightW = clamp(1 - Math.abs(sun.elevationDeg + 4) / 7.5, 0, 1);
  const nightW = clamp((-sun.elevationDeg - 6) / 12, 0, 1);
  const overcastWash = Math.pow(cloud, 1.35);

  const clearZenith: RgbTuple = { r: 0.05 + 0.06 / rayleigh, g: 0.19 + 0.08 * clamp(rayleigh * 0.6, 0, 1), b: 0.56 + 0.18 * clamp(rayleigh * 0.7, 0, 1) };
  const clearHorizon: RgbTuple = { r: 0.42 + 0.04 * turbidity, g: 0.58 + 0.02 * turbidity, b: 0.78 - 0.03 * turbidity };
  const blueZenith: RgbTuple = { r: 0.03, g: 0.07, b: 0.22 + 0.08 * ozone };
  const blueHorizon: RgbTuple = { r: 0.16, g: 0.21, b: 0.42 + 0.06 * ozone };
  const overcastGrey: RgbTuple = { r: 0.26 + 0.2 * dayW, g: 0.28 + 0.21 * dayW, b: 0.32 + 0.22 * dayW };

  let zenithLin = mixLinearRgb(blueZenith, clearZenith, dayW);
  zenithLin = mixLinearRgb(zenithLin, { r: 0.14, g: 0.13, b: 0.34 }, goldenW * 0.65);
  zenithLin = mixLinearRgb(zenithLin, blueZenith, twilightW * 0.75);
  zenithLin = mixLinearRgb(zenithLin, { r: 0.012, g: 0.02, b: 0.06 }, nightW * 0.92);
  zenithLin = mixLinearRgb(zenithLin, overcastGrey, overcastWash * 0.76);

  let horizonLin = mixLinearRgb(blueHorizon, clearHorizon, dayW);
  horizonLin = mixLinearRgb(horizonLin, { r: 0.96, g: 0.36, b: 0.08 }, goldenW * 0.92);
  horizonLin = mixLinearRgb(horizonLin, blueHorizon, twilightW * 0.72);
  horizonLin = mixLinearRgb(horizonLin, { r: 0.035, g: 0.055, b: 0.12 }, nightW * 0.9);
  horizonLin = mixLinearRgb(horizonLin, overcastGrey, overcastWash * 0.8);

  const midSkyLin = mixLinearRgb(zenithLin, horizonLin, 0.52);
  const groundBounceLin: RgbTuple = {
    r: clamp((horizonLin.r * 0.55 + zenithLin.r * 0.45) * albedo * 0.85, 0.01, 0.9),
    g: clamp((horizonLin.g * 0.55 + zenithLin.g * 0.45) * albedo * 0.85, 0.01, 0.9),
    b: clamp((horizonLin.b * 0.55 + zenithLin.b * 0.45) * albedo * 0.85, 0.01, 0.9),
  };
  const sunDiskLin = mixLinearRgb(kelvinToOklchColor(sun.estimatedKelvin).linear, overcastGrey, cloud * 0.65);

  const cloudDirectFactor = Math.pow(1 - cloud, 1.85);
  const directLux = sun.isAboveHorizon ? 88000 * sun.directTransmittance * cloudDirectFactor : 0;
  const diffuseLux = (14500 * dayW + 1800 * twilightW + 45 * nightW) * (1 - cloud * 0.25);
  const hemisphereIrradianceLux = Math.round(Math.max(18, directLux + diffuseLux));
  const skyToSunRatio = roundTo(clamp(diffuseLux / Math.max(120, directLux + diffuseLux), 0.08, 1), 3);
  const dominantSkyKelvin = Math.round(clamp(sun.estimatedKelvin * (1 - cloud * 0.25) + 6400 * (cloud * 0.25) + ozone * twilightW * 750, MIN_RIG_KELVIN, MAX_RIG_KELVIN));

  const zenith = makeColorSwatch(zenithLin);
  const midSky = makeColorSwatch(midSkyLin);
  const horizon = makeColorSwatch(horizonLin);
  const groundBounce = makeColorSwatch(groundBounceLin);
  const sunDisk = makeColorSwatch(sunDiskLin);

  return {
    zenith, midSky, horizon, groundBounce, sunDisk,
    rayleighOpticalDepth: roundTo(0.095 * rayleigh * Math.min(sun.airMass, 12), 3),
    mieHazeIndex: roundTo(clamp(mie * turbidity * 8.5 + cloud * 0.45, 0.02, 2.5), 3),
    skyToSunRatio, hemisphereIrradianceLux, dominantSkyKelvin,
    gradientStopsOklch: [
      { offsetPct: 0, oklchCss: zenith.oklchCss }, { offsetPct: 52, oklchCss: midSky.oklchCss },
      { offsetPct: 84, oklchCss: horizon.oklchCss }, { offsetPct: 100, oklchCss: groundBounce.oklchCss },
    ],
  };
}

function makeSkyPreset(
  id: PhysicalSkyPresetId, nameKo: string, nameEn: string, moodKo: string, moodEn: string,
  season: SeoulSeasonId, hourKst: number, syncKeyWithSun: boolean,
  atmosphere: AtmosphericScatteringParams, key: RigLightChannel, fill: RigLightChannel, rim: RigLightChannel,
  bounce: ArchitecturalBounceConfig,
  catcher: Pick<ShadowCatcherConfig, "groundRoughness" | "contactAoStrength" | "maxShadowLengthM" | "catcherOpacityScale">,
): PhysicalSkyPreset {
  return {
    id, nameKo, nameEn, moodKo, moodEn, recommendedSeason: season, recommendedHourKst: hourKst,
    config: { presetId: id, season, hourKst, syncKeyWithSun, atmosphere, key, fill, rim, bounce, shadowCatcher: { enabled: true, subjectHeightM: 1.68, subjectRadiusM: 0.34, ...catcher } },
  };
}

/** 6종 서울 물리 하늘·대기 산란 및 3점 조명 통합 프리셋. */
export const PHYSICAL_SKY_PRESETS: readonly PhysicalSkyPreset[] = [
  makeSkyPreset(
    "noon-clear", "정오 맑음", "Clear Noon",
    "청명한 서울 한낮 5650K 직사광과 선명한 하늘 바운스", "Crisp 5650K Seoul midday sunlight with clean sky fill",
    "summer", 12.5, true,
    { rayleighCoeff: 1.05, mieCoeff: 0.006, mieG: 0.78, turbidity: 1.9, cloudCoverage: 0.08, groundAlbedo: 0.42, ozoneStrength: 0.45 },
    { enabled: true, azimuthDeg: 180, elevationDeg: 75, intensity: 1.45, kelvin: 5650, softness: 0.18 },
    { enabled: true, azimuthDeg: 35, elevationDeg: 38, intensity: 0.48, kelvin: 7400, softness: 0.72 },
    { enabled: true, azimuthDeg: 325, elevationDeg: 34, intensity: 0.62, kelvin: 6200, softness: 0.35 },
    { enabled: true, surfaceMaterial: "concrete-courtyard", azimuthDeg: 180, reflectance: 0.48, intensity: 0.34, kelvin: 5400 },
    { groundRoughness: 0.26, contactAoStrength: 0.82, maxShadowLengthM: 6.0, catcherOpacityScale: 1.0 },
  ),
  makeSkyPreset(
    "golden-sunset", "황금 노을", "Golden Sunset",
    "낮은 서쪽 태양의 3150K 호박빛 키라이트와 긴 드라마틱 그림자", "Low western 3150K amber key light with long dramatic cast shadows",
    "autumn", 17.75, true,
    { rayleighCoeff: 1.25, mieCoeff: 0.024, mieG: 0.87, turbidity: 4.2, cloudCoverage: 0.22, groundAlbedo: 0.36, ozoneStrength: 0.7 },
    { enabled: true, azimuthDeg: 264, elevationDeg: 7, intensity: 1.55, kelvin: 3150, softness: 0.3 },
    { enabled: true, azimuthDeg: 88, elevationDeg: 32, intensity: 0.36, kelvin: 7800, softness: 0.8 },
    { enabled: true, azimuthDeg: 252, elevationDeg: 22, intensity: 0.92, kelvin: 2700, softness: 0.24 },
    { enabled: true, surfaceMaterial: "warm-plaster", azimuthDeg: 105, reflectance: 0.62, intensity: 0.46, kelvin: 3400 },
    { groundRoughness: 0.34, contactAoStrength: 0.78, maxShadowLengthM: 6.0, catcherOpacityScale: 1.05 },
  ),
  makeSkyPreset(
    "blue-hour", "블루아워", "Blue Hour",
    "일몰 직후 오존층 청남색 돔과 실내 창가 온백 바운스 대비", "Post-sunset ozone cobalt sky dome paired with warm architectural spill",
    "autumn", 18.9, false,
    { rayleighCoeff: 1.4, mieCoeff: 0.014, mieG: 0.8, turbidity: 2.8, cloudCoverage: 0.18, groundAlbedo: 0.28, ozoneStrength: 1.25 },
    { enabled: true, azimuthDeg: 278, elevationDeg: 18, intensity: 0.82, kelvin: 8200, softness: 0.68 },
    { enabled: true, azimuthDeg: 112, elevationDeg: 28, intensity: 0.42, kelvin: 7400, softness: 0.85 },
    { enabled: true, azimuthDeg: 38, elevationDeg: 26, intensity: 0.78, kelvin: 3200, softness: 0.42 },
    { enabled: true, surfaceMaterial: "warm-plaster", azimuthDeg: 42, reflectance: 0.58, intensity: 0.52, kelvin: 2900 },
    { groundRoughness: 0.52, contactAoStrength: 0.85, maxShadowLengthM: 5.2, catcherOpacityScale: 0.85 },
  ),
  makeSkyPreset(
    "rainy-overcast", "비 오는 흐림", "Rainy Overcast",
    "두꺼운 구름층의 균일 6400K 확산광과 젖은 아스팔트 반사", "Thick overcast 6400K diffused dome with wet asphalt ground bounce",
    "spring", 14.0, true,
    { rayleighCoeff: 0.75, mieCoeff: 0.042, mieG: 0.68, turbidity: 6.5, cloudCoverage: 0.88, groundAlbedo: 0.26, ozoneStrength: 0.3 },
    { enabled: true, azimuthDeg: 215, elevationDeg: 45, intensity: 0.88, kelvin: 6400, softness: 0.86 },
    { enabled: true, azimuthDeg: 35, elevationDeg: 48, intensity: 0.64, kelvin: 6800, softness: 0.92 },
    { enabled: true, azimuthDeg: 318, elevationDeg: 32, intensity: 0.58, kelvin: 7600, softness: 0.62 },
    { enabled: true, surfaceMaterial: "wet-asphalt", azimuthDeg: 200, reflectance: 0.32, intensity: 0.4, kelvin: 7200 },
    { groundRoughness: 0.78, contactAoStrength: 0.9, maxShadowLengthM: 4.0, catcherOpacityScale: 0.72 },
  ),
  makeSkyPreset(
    "moonlit-courtyard", "달빛 안뜰", "Moonlit Courtyard",
    "8800K 서늘한 달빛 림·키와 한옥 처마 등불 바운스의 극적 대비", "Cool 8800K lunar key/rim contrasted with warm courtyard lantern bounce",
    "autumn", 21.5, false,
    { rayleighCoeff: 1.1, mieCoeff: 0.01, mieG: 0.74, turbidity: 2.1, cloudCoverage: 0.14, groundAlbedo: 0.22, ozoneStrength: 0.85 },
    { enabled: true, azimuthDeg: 148, elevationDeg: 34, intensity: 0.76, kelvin: 8800, softness: 0.32 },
    { enabled: true, azimuthDeg: 320, elevationDeg: 28, intensity: 0.22, kelvin: 9200, softness: 0.8 },
    { enabled: true, azimuthDeg: 162, elevationDeg: 42, intensity: 1.05, kelvin: 9000, softness: 0.22 },
    { enabled: true, surfaceMaterial: "hanok-wood", azimuthDeg: 25, reflectance: 0.46, intensity: 0.54, kelvin: 2700 },
    { groundRoughness: 0.42, contactAoStrength: 0.88, maxShadowLengthM: 5.5, catcherOpacityScale: 0.9 },
  ),
  makeSkyPreset(
    "winter-noon", "겨울 정오", "Winter Noon",
    "낮은 서울 동지 정오 고도(약 29°)의 맑고 긴 그림자와 설면 반사광", "Low Seoul winter solstice noon (~29°) with crisp long shadows and snow bounce",
    "winter", 12.5, true,
    { rayleighCoeff: 1.18, mieCoeff: 0.004, mieG: 0.76, turbidity: 1.5, cloudCoverage: 0.05, groundAlbedo: 0.72, ozoneStrength: 0.55 },
    { enabled: true, azimuthDeg: 180, elevationDeg: 29, intensity: 1.38, kelvin: 5950, softness: 0.15 },
    { enabled: true, azimuthDeg: 15, elevationDeg: 36, intensity: 0.52, kelvin: 8100, softness: 0.7 },
    { enabled: true, azimuthDeg: 342, elevationDeg: 24, intensity: 0.72, kelvin: 7200, softness: 0.28 },
    { enabled: true, surfaceMaterial: "snow-slate", azimuthDeg: 180, reflectance: 0.78, intensity: 0.58, kelvin: 7600 },
    { groundRoughness: 0.22, contactAoStrength: 0.8, maxShadowLengthM: 6.0, catcherOpacityScale: 1.02 },
  ),
];

export function getPhysicalSkyPresetById(id: PhysicalSkyPresetId): PhysicalSkyPreset {
  const found = PHYSICAL_SKY_PRESETS.find((p) => p.id === id) ?? PHYSICAL_SKY_PRESETS[0];
  if (found) return found;
  throw new Error("PHYSICAL_SKY_PRESETS must not be empty");
}

export function getArchitecturalSurfaceById(id: ArchitecturalSurfaceId): ArchitecturalSurfaceSpec {
  const found = ARCHITECTURAL_SURFACES.find((s) => s.id === id) ?? ARCHITECTURAL_SURFACES[0];
  if (found) return found;
  throw new Error("ARCHITECTURAL_SURFACES must not be empty");
}

export function createInitialStudioRigConfig(presetId: PhysicalSkyPresetId = "noon-clear"): StudioRigConfig {
  const src = getPhysicalSkyPresetById(presetId).config;
  return { ...src, atmosphere: { ...src.atmosphere }, key: { ...src.key }, fill: { ...src.fill }, rim: { ...src.rim }, bounce: { ...src.bounce }, shadowCatcher: { ...src.shadowCatcher } };
}

/** 주광원 방향·고도각·운량·바닥 거칠기 기반 바닥 그림자 캐처(Shadow Catcher) 투영 타원 및 오파시티를 계산한다. */
export function computeShadowCatcherProjection(input: {
  readonly shadowCatcher: ShadowCatcherConfig;
  readonly keyLight: ResolvedRigLight;
  readonly sky: AtmosphericSkyEvaluation;
  readonly cloudCoverage: number;
}): ShadowCatcherProjection {
  const { shadowCatcher, keyLight, sky } = input;
  const cloud = clamp(input.cloudCoverage, 0, 1);
  const heightM = clamp(shadowCatcher.subjectHeightM, 0.4, 3.2);
  const radiusM = clamp(shadowCatcher.subjectRadiusM, 0.12, 1.2);
  const roughness = clamp(shadowCatcher.groundRoughness, 0, 1);
  const aoStrength = clamp(shadowCatcher.contactAoStrength, 0, 1);
  const maxLen = clamp(shadowCatcher.maxShadowLengthM, 1.0, 12.0);
  const opacityScale = clamp(shadowCatcher.catcherOpacityScale, 0, 1.5);

  const shadowTint = makeColorSwatch({
    r: clamp(sky.zenith.linear.r * 0.18 + 0.015, 0.01, 0.2),
    g: clamp(sky.zenith.linear.g * 0.2 + 0.018, 0.01, 0.22),
    b: clamp(sky.zenith.linear.b * 0.28 + 0.032, 0.02, 0.34),
  });

  if (!shadowCatcher.enabled) {
    return {
      enabled: false, isAmbientOnly: true, shadowAzimuthDeg: 0, sourceElevationDeg: 90, castLengthM: 0,
      centerOffsetX_m: 0, centerOffsetZ_m: 0, semiMajorAxisM: 0, semiMinorAxisM: 0, rotationDeg: 0,
      castOpacity: 0, contactAoRadiusM: 0, contactAoOpacity: 0, penumbraBlurPx: 0, shadowTint,
    };
  }

  const hasDirectionalKey = keyLight.enabled && keyLight.intensity > 0.08 && keyLight.elevationDeg > 1.5;
  const contactAoRadiusM = roundTo(radiusM * (1.08 + roughness * 0.22), 3);
  const contactAoOpacity = roundTo(clamp((0.36 + aoStrength * 0.48) * opacityScale, 0, 0.92), 3);

  if (!hasDirectionalKey) {
    const ambientRadius = roundTo(radiusM * (1.45 + cloud * 0.35 + roughness * 0.25), 3);
    return {
      enabled: true, isAmbientOnly: true, shadowAzimuthDeg: 0, sourceElevationDeg: roundTo(keyLight.elevationDeg, 2),
      castLengthM: 0, centerOffsetX_m: 0, centerOffsetZ_m: 0, semiMajorAxisM: ambientRadius, semiMinorAxisM: ambientRadius,
      rotationDeg: 0, castOpacity: roundTo(clamp(0.28 * opacityScale * (0.65 + aoStrength * 0.35), 0.05, 0.55), 3),
      contactAoRadiusM, contactAoOpacity, penumbraBlurPx: roundTo(10 + roughness * 10 + cloud * 8, 1), shadowTint,
    };
  }

  const shadowAzimuthDeg = normalizeAngle360(keyLight.azimuthDeg + 180);
  const effectiveEl = clamp(keyLight.elevationDeg, 6, 86);
  const castLengthM = roundTo(clamp(heightM / Math.tan(degToRad(effectiveEl)), radiusM * 0.45, maxLen), 3);
  const shadowRad = degToRad(shadowAzimuthDeg);
  const centerDist = castLengthM * 0.5;
  const softness = clamp(keyLight.softness, 0, 1);
  const penumbraSpread = 0.08 + softness * 0.24 + cloud * 0.28 + roughness * 0.14;
  const directCrispness = (1 - cloud * 0.62) * (1 - softness * 0.36) * (1 - roughness * 0.22);
  const intensityFactor = clamp(keyLight.intensity / 1.35, 0.25, 1.15);

  return {
    enabled: true, isAmbientOnly: false,
    shadowAzimuthDeg: roundTo(shadowAzimuthDeg, 2), sourceElevationDeg: roundTo(keyLight.elevationDeg, 2),
    castLengthM,
    centerOffsetX_m: roundTo(Math.sin(shadowRad) * centerDist, 3),
    centerOffsetZ_m: roundTo(-Math.cos(shadowRad) * centerDist, 3),
    semiMajorAxisM: roundTo(Math.max(radiusM, castLengthM * 0.56 + radiusM * 0.48 + penumbraSpread * 0.35), 3),
    semiMinorAxisM: roundTo(radiusM * (1.02 + penumbraSpread * 0.85), 3),
    rotationDeg: roundTo(shadowAzimuthDeg, 2),
    castOpacity: roundTo(clamp((0.24 + 0.56 * directCrispness) * intensityFactor * opacityScale, 0.08, 0.9), 3),
    contactAoRadiusM, contactAoOpacity,
    penumbraBlurPx: roundTo(clamp(1.8 + softness * 8.5 + cloud * 9.5 + roughness * 4.5 + castLengthM * 0.75, 1.5, 28), 1),
    shadowTint,
  };
}

function resolveChannelLight(
  id: "key" | "fill" | "rim",
  labelKo: string,
  labelEn: string,
  ch: RigLightChannel,
  overrides?: { readonly azimuthDeg: number; readonly elevationDeg: number; readonly intensity: number; readonly kelvin: number },
): ResolvedRigLight {
  const azimuthDeg = normalizeAngle360(overrides?.azimuthDeg ?? ch.azimuthDeg);
  const elevationDeg = clamp(overrides?.elevationDeg ?? ch.elevationDeg, -15, 88);
  const kelvin = clamp(overrides?.kelvin ?? ch.kelvin, MIN_RIG_KELVIN, MAX_RIG_KELVIN);
  const intensity = clamp(overrides?.intensity ?? ch.intensity, 0, 3);
  return {
    id, labelKo, labelEn, enabled: ch.enabled,
    azimuthDeg: roundTo(azimuthDeg, 2), elevationDeg: roundTo(elevationDeg, 2),
    direction3d: sphericalAnglesToVec3(azimuthDeg, elevationDeg),
    intensity: roundTo(intensity, 2), kelvin: Math.round(kelvin),
    softness: roundTo(clamp(ch.softness, 0, 1), 2), color: kelvinToOklchColor(kelvin),
  };
}

/** 3D 배경·캐릭터 통합 물리 하늘 + 3점 조명 + 건축 바운스 + 그림자 캐처를 통합 평가한다. */
export function evaluateStudioLightingRig(config: StudioRigConfig): StudioLightingRigEvaluation {
  const sun = computeSeoulSunPosition(config.season, config.hourKst);
  const sky = evaluatePhysicalSkyAtmosphere(sun, config.atmosphere);
  const bounceSurface = getArchitecturalSurfaceById(config.bounce.surfaceMaterial);

  const key = resolveChannelLight("key", "키라이트 (주광)", "Key Light", config.key, config.syncKeyWithSun ? {
    azimuthDeg: sun.azimuthDeg, elevationDeg: sun.elevationDeg, kelvin: sun.estimatedKelvin,
    intensity: sun.isAboveHorizon ? config.key.intensity : config.key.intensity * 0.22,
  } : undefined);
  const fill = resolveChannelLight("fill", "필라이트 (보조광)", "Fill Light", config.fill);
  const rim = resolveChannelLight("rim", "림라이트 (윤곽 역광)", "Rim Light", config.rim);

  const bounceAz = normalizeAngle360(config.bounce.azimuthDeg);
  const bounceKelvin = clamp(config.bounce.kelvin, MIN_RIG_KELVIN, MAX_RIG_KELVIN);
  const bounceTempLin = kelvinToOklchColor(bounceKelvin).linear;
  const bounceReflectance = clamp(config.bounce.reflectance, 0.05, 0.95);
  const bounce: ResolvedRigLight = {
    id: "architectural-bounce",
    labelKo: `건축 바운스 (${bounceSurface.labelKo})`,
    labelEn: `Bounce (${bounceSurface.labelEn})`,
    enabled: config.bounce.enabled, azimuthDeg: roundTo(bounceAz, 2), elevationDeg: -18,
    direction3d: sphericalAnglesToVec3(bounceAz, -18),
    intensity: roundTo(clamp(config.bounce.intensity * (0.55 + bounceReflectance * 0.75), 0, 2), 2),
    kelvin: Math.round(bounceKelvin), softness: 0.88,
    color: makeColorSwatch({
      r: bounceTempLin.r * bounceSurface.tintLinear.r,
      g: bounceTempLin.g * bounceSurface.tintLinear.g,
      b: bounceTempLin.b * bounceSurface.tintLinear.b,
    }),
  };

  const lights: readonly ResolvedRigLight[] = [key, fill, rim, bounce];
  const shadowCatcher = computeShadowCatcherProjection({
    shadowCatcher: config.shadowCatcher, keyLight: key, sky, cloudCoverage: config.atmosphere.cloudCoverage,
  });

  const effKey = key.enabled ? key.intensity : 0;
  const effFill = fill.enabled ? fill.intensity : 0;
  const effRim = rim.enabled ? rim.intensity : 0;
  const effBounce = bounce.enabled ? bounce.intensity : 0;
  const totalEnergy = effKey + effFill + effRim + effBounce;
  const azDelta = sun.isAboveHorizon ? angularDistanceDeg(key.azimuthDeg, sun.azimuthDeg) : 0;
  const elDelta = sun.isAboveHorizon ? Math.abs(key.elevationDeg - sun.elevationDeg) : 0;
  const matchPenalty =
    (config.syncKeyWithSun ? 0 : azDelta * 0.22 + elDelta * 0.35) +
    (Math.abs(key.kelvin - sky.dominantSkyKelvin) / 1000) * 4.5 +
    (shadowCatcher.enabled ? 0 : 12) +
    (bounce.enabled ? 0 : 6);

  return {
    sun, sky, key, fill, rim, bounce, lights, shadowCatcher,
    metrics: {
      activeLightCount: lights.filter((l) => l.enabled && l.intensity > 0.01).length,
      keyToFillRatio: roundTo(effKey / Math.max(0.12, effFill + effBounce * 0.35), 2),
      rimSeparationIndex: rim.enabled ? roundTo(clamp((effRim / Math.max(0.45, effKey + effFill * 0.5)) * 0.85, 0, 1), 3) : 0,
      bounceFillContribution: totalEnergy > 1e-4 ? roundTo(effBounce / totalEnergy, 3) : 0,
      totalIlluminanceScore: roundTo(clamp(totalEnergy * 34, 0, 100), 1),
      characterBackgroundMatchScore: Math.round(clamp(100 - matchPenalty, 20, 100)),
    },
  };
}

function mapSuggested2dPreset(presetId: PhysicalSkyPresetId, skyPhase: SkyPhaseId): Suggested2dRelightPresetId {
  if (presetId === "moonlit-courtyard" || skyPhase === "night") return "moonlight";
  if (presetId === "golden-sunset" || skyPhase === "golden-hour") return "sunset";
  if (presetId === "blue-hour" || skyPhase === "blue-hour") return "indoor";
  return "noon";
}

/** 2D 컷 리라이트 엔진(3층 채색 리라이트 + 다중 광원 브리지)용 정본 페이로드를 생성한다. */
export function export2dCutRelightBridge(config: StudioRigConfig): RelightBridge2dPayload {
  const evalRig = evaluateStudioLightingRig(config);
  const preset = getPhysicalSkyPresetById(config.presetId);
  const keyLin = evalRig.key.color.linear;
  const bounceLin = evalRig.bounce.color.linear;
  const shadowLin = evalRig.shadowCatcher.shadowTint.linear;

  return {
    schemaVersion: RELIGHT_BRIDGE_SCHEMA_VERSION,
    sourceEngine: "studio-3d-lighting-rig",
    location: {
      city: "Seoul", latitudeDeg: evalRig.sun.latitudeDeg, longitudeDeg: evalRig.sun.longitudeDeg,
      season: evalRig.sun.season, hourKst: evalRig.sun.hourKst, formattedHourKst: evalRig.sun.formattedHourKst,
    },
    sky: {
      presetId: config.presetId, presetNameKo: preset.nameKo, skyPhase: evalRig.sun.skyPhase,
      sunElevationDeg: evalRig.sun.elevationDeg, sunAzimuthDeg: evalRig.sun.azimuthDeg,
      turbidity: roundTo(config.atmosphere.turbidity, 2), cloudCoverage: roundTo(config.atmosphere.cloudCoverage, 2),
      zenithOklch: evalRig.sky.zenith.oklchCss, horizonOklch: evalRig.sky.horizon.oklchCss,
      groundBounceOklch: evalRig.sky.groundBounce.oklchCss, hemisphereIrradianceLux: evalRig.sky.hemisphereIrradianceLux,
    },
    threeLayer2dRelight: {
      suggestedPresetId: mapSuggested2dPreset(config.presetId, evalRig.sun.skyPhase),
      kelvin: evalRig.key.kelvin,
      albedoTint: [roundTo(0.86 + keyLin.r * 0.18, 3), roundTo(0.86 + keyLin.g * 0.18, 3), roundTo(0.86 + keyLin.b * 0.18, 3)],
      shadowTint: [roundTo(clamp(shadowLin.r * 2.4, 0.08, 0.72), 3), roundTo(clamp(shadowLin.g * 2.4, 0.08, 0.72), 3), roundTo(clamp(shadowLin.b * 2.4, 0.12, 0.85), 3)],
      shadowDepth: roundTo(clamp(0.45 + evalRig.shadowCatcher.castOpacity * 0.55, 0.35, 0.94), 3),
      keyColor: [roundTo(keyLin.r, 3), roundTo(keyLin.g, 3), roundTo(keyLin.b, 3)],
      keyIntensity: roundTo(clamp(evalRig.key.enabled ? evalRig.key.intensity * 0.48 : 0, 0, 1.4), 3),
      bounceColor: [roundTo(bounceLin.r, 3), roundTo(bounceLin.g, 3), roundTo(bounceLin.b, 3)],
      bounceIntensity: roundTo(clamp(evalRig.bounce.enabled ? evalRig.bounce.intensity * 0.55 : 0, 0, 1.1), 3),
      ambientFloor: roundTo(clamp(0.018 + evalRig.sky.skyToSunRatio * 0.032, 0.015, 0.06), 3),
      exposure: roundTo(clamp(0.92 + evalRig.metrics.totalIlluminanceScore * 0.0018, 0.85, 1.18), 3),
    },
    dynamicLights: evalRig.lights.map((light) => ({
      id: light.id, enabled: light.enabled, azimuthDeg: light.azimuthDeg, elevationDeg: light.elevationDeg,
      direction3d: light.direction3d, intensity: light.intensity, kelvin: light.kelvin, softness: light.softness,
      linearRgb: [roundTo(light.color.linear.r, 3), roundTo(light.color.linear.g, 3), roundTo(light.color.linear.b, 3)],
      oklchCss: light.color.oklchCss,
    })),
    shadowCatcher: {
      enabled: evalRig.shadowCatcher.enabled, isAmbientOnly: evalRig.shadowCatcher.isAmbientOnly,
      shadowAzimuthDeg: evalRig.shadowCatcher.shadowAzimuthDeg, castLengthM: evalRig.shadowCatcher.castLengthM,
      semiMajorAxisM: evalRig.shadowCatcher.semiMajorAxisM, semiMinorAxisM: evalRig.shadowCatcher.semiMinorAxisM,
      castOpacity: evalRig.shadowCatcher.castOpacity, contactAoOpacity: evalRig.shadowCatcher.contactAoOpacity,
      penumbraBlurPx: evalRig.shadowCatcher.penumbraBlurPx, shadowTintOklch: evalRig.shadowCatcher.shadowTint.oklchCss,
    },
    characterBackgroundMatchScore: evalRig.metrics.characterBackgroundMatchScore,
  };
}

export function serialize2dCutRelightBridgeJson(config: StudioRigConfig): string {
  return JSON.stringify(export2dCutRelightBridge(config), null, 2);
}

/** 2D 컷 리라이트 JSON 브리지 문자열의 스키마·광원 배열·그림자 캐처 무결성을 검증한다. */
export function validate2dCutRelightBridge(jsonText: string): RelightBridgeValidationResult {
  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== "object") return { valid: false, errorKo: "JSON 객체 형식이 아닙니다.", payload: null };
    const c = parsed as Partial<RelightBridge2dPayload>;
    if (c.schemaVersion !== RELIGHT_BRIDGE_SCHEMA_VERSION) return { valid: false, errorKo: "지원하지 않는 조명 브리지 스키마 버전입니다.", payload: null };
    if (c.sourceEngine !== "studio-3d-lighting-rig") return { valid: false, errorKo: "출처 엔진 식별자가 일치하지 않습니다.", payload: null };
    if (!Array.isArray(c.dynamicLights) || c.dynamicLights.length !== 4) return { valid: false, errorKo: "4종 통합 광원(Key/Fill/Rim/Bounce) 슬롯이 누락되었습니다.", payload: null };
    if (!c.threeLayer2dRelight || !c.shadowCatcher || !c.sky || !c.location) return { valid: false, errorKo: "2D 리라이트·하늘·그림자 캐처 필수 필드가 누락되었습니다.", payload: null };
    return { valid: true, errorKo: null, payload: c as RelightBridge2dPayload };
  } catch {
    return { valid: false, errorKo: "JSON 구문 파싱에 실패했습니다.", payload: null };
  }
}
