/**
 * Wave 74: 2.5D 웹툰 1컷 기하 복원(법선·깊이·재질 힌트) 및 실시간 다중 시간대·날씨 리라이팅 엔진.
 *
 * - 2D 웹툰 컷에서 잉크 선화를 보존한 채 단위 법선(`|N|=1`, `nz>0`), 부호 거리 팽창 깊이, 거칠기·금속성 힌트를 복원한다.
 * - 6종 시간대·날씨 프리셋(`RELIGHTING_ATMOSPHERE_PRESETS`)과 0~24시 연속 보간(`interpolateAtmosphereByHour`)을 제공한다.
 * - 2D 스크린 공간 광선 마칭 소프트 그림자, 셀/PBR 확산광, GGX 스펙큘러, 프레넬 림, OKLCH 색조 보존 그레이딩을 합성한다.
 */

export type RgbTuple = readonly [number, number, number];
export type Vec3Tuple = readonly [number, number, number];
export type OklchTuple = readonly [number, number, number];

export type RelightingAtmospherePresetId =
  | "morning-sunlight"
  | "golden-sunset"
  | "rainy-night-neon"
  | "overcast-studio"
  | "moonlit-rooftop"
  | "dramatic-candlelight";

export interface RelightingKeyLightConfig {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly colorRgb: RgbTuple;
  readonly intensity: number;
  readonly isPointLight: boolean;
  readonly pointUv: readonly [number, number];
  readonly pointFalloff: number;
}

export interface RelightingRimLightConfig {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly colorRgb: RgbTuple;
  readonly intensity: number;
  readonly fresnelPower: number;
}

export interface OklchGradeConfig {
  readonly lightnessShift: number;
  readonly chromaScale: number;
  readonly hueBiasDeg: number;
  readonly shadowTintRgb: RgbTuple;
  readonly highlightTintRgb: RgbTuple;
}

export interface RelightingAtmospherePreset {
  readonly id: RelightingAtmospherePresetId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly hourAnchor: number;
  readonly kelvin: number;
  readonly keyLight: RelightingKeyLightConfig;
  readonly rimLight: RelightingRimLightConfig;
  readonly secondaryRimLight: RelightingRimLightConfig | null;
  readonly ambientSkyRgb: RgbTuple;
  readonly ambientGroundRgb: RgbTuple;
  readonly ambientIntensity: number;
  readonly shadowStrength: number;
  readonly shadowSoftness: number;
  readonly shadowMaxSteps: number;
  readonly shadowStepPx: number;
  readonly specularBoost: number;
  readonly roughnessScale: number;
  readonly celSteps: number;
  readonly celHardness: number;
  readonly oklchGrade: OklchGradeConfig;
  readonly lineartPreservation: number;
}

export interface ReconstructCut25dOptions {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly lineartMask?: Float32Array | Uint8Array;
  readonly depthHints?: Float32Array;
  readonly inflationStrength?: number;
  readonly inflationRadiusPx?: number;
  readonly shadingReliefWeight?: number;
  readonly lineartThreshold?: number;
  readonly normalZBias?: number;
}

export interface Cut25dGeometryMaps {
  readonly width: number;
  readonly height: number;
  readonly normalXyz: Float32Array;
  readonly depthField: Float32Array;
  readonly lineartField: Float32Array;
  readonly roughnessField: Float32Array;
  readonly metallicField: Float32Array;
  readonly meanDepth: number;
  readonly lineartCoverage: number;
}

export interface Relight25dCutOptions {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly geometry?: Cut25dGeometryMaps;
  readonly lineartMask?: Float32Array | Uint8Array;
  readonly depthHints?: Float32Array;
  readonly presetId?: RelightingAtmospherePresetId;
  readonly hourOfDay?: number;
  readonly atmosphereOverride?: Partial<RelightingAtmospherePreset>;
  readonly keyLightDirectionOverride?: Vec3Tuple;
  readonly keyLightAzimuthOverrideDeg?: number;
  readonly keyLightElevationOverrideDeg?: number;
  readonly celMode?: "preset" | "smooth" | "cel";
  readonly celStepsOverride?: number;
}

export interface Relight25dCutResult {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly shadowMap: Float32Array;
  readonly highlightCentroid: readonly [number, number];
  readonly averageRgb: RgbTuple;
  readonly appliedAtmosphere: RelightingAtmospherePreset;
  readonly geometry: Cut25dGeometryMaps;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

export function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value <= min) return min;
  return value >= max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function normalizeVec3(x: number, y: number, z: number): Vec3Tuple {
  const len = Math.hypot(x, y, z);
  return !Number.isFinite(len) || len <= 1e-8 ? [0, 0, 1] : [x / len, y / len, z / len];
}

/** 방위각(0°=+X, 90°=+Y, 180°=-X, 270°=-Y)과 고도각(2~89°)을 단위 광원 방향 벡터로 변환한다. */
export function directionFromAngles(azimuthDeg: number, elevationDeg: number): Vec3Tuple {
  const az = azimuthDeg * DEG_TO_RAD;
  const el = clampRange(elevationDeg, 2, 89) * DEG_TO_RAD;
  const cosEl = Math.cos(el);
  return normalizeVec3(Math.cos(az) * cosEl, Math.sin(az) * cosEl, Math.sin(el));
}

export function srgbToLinearChannel(c: number): number {
  const v = clamp01(c);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgbChannel(c: number): number {
  const v = clamp01(c);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function srgbToLinearRgb(rgb: RgbTuple): RgbTuple {
  return [srgbToLinearChannel(rgb[0]), srgbToLinearChannel(rgb[1]), srgbToLinearChannel(rgb[2])];
}

export function linearToSrgbRgb(rgb: RgbTuple): RgbTuple {
  return [linearToSrgbChannel(rgb[0]), linearToSrgbChannel(rgb[1]), linearToSrgbChannel(rgb[2])];
}

function cbrtSafe(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  return value < 0 ? -Math.pow(-value, 1 / 3) : Math.pow(value, 1 / 3);
}

/** 선형 sRGB를 Björn Ottosson OKLCH(`L∈[0,1]`, `C>=0`, `h∈[0,360)`)로 변환한다. */
export function linearRgbToOklch(rgb: RgbTuple): OklchTuple {
  const r = Math.max(0, rgb[0]);
  const g = Math.max(0, rgb[1]);
  const b = Math.max(0, rgb[2]);
  const l3 = cbrtSafe(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m3 = cbrtSafe(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s3 = cbrtSafe(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3;
  const a = 1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3;
  const okB = 0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3;
  return [clamp01(L), Math.max(0, Math.hypot(a, okB)), (Math.atan2(okB, a) * RAD_TO_DEG + 360) % 360];
}

/** OKLCH 좌표를 선형 sRGB로 역변환한다. */
export function oklchToLinearRgb(oklch: OklchTuple): RgbTuple {
  const L = clamp01(oklch[0]);
  const C = Math.max(0, oklch[1]);
  const hRad = oklch[2] * DEG_TO_RAD;
  const a = C * Math.cos(hRad);
  const okB = C * Math.sin(hRad);
  const l3 = L + 0.3963377774 * a + 0.2158037573 * okB;
  const m3 = L - 0.1055613458 * a - 0.0638541728 * okB;
  const s3 = L - 0.0894841775 * a - 1.291485548 * okB;
  const l = l3 * l3 * l3;
  const m = m3 * m3 * m3;
  const s = s3 * s3 * s3;
  return [
    Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function makePreset(
  id: RelightingAtmospherePresetId,
  labelKo: string,
  summaryKo: string,
  hourAnchor: number,
  kelvin: number,
  keyLight: RelightingKeyLightConfig,
  rimLight: RelightingRimLightConfig,
  secondaryRimLight: RelightingRimLightConfig | null,
  ambientSkyRgb: RgbTuple,
  ambientGroundRgb: RgbTuple,
  ambientIntensity: number,
  shadow: readonly [number, number, number, number],
  pbr: readonly [number, number, number, number],
  oklchGrade: OklchGradeConfig,
  lineartPreservation: number,
): RelightingAtmospherePreset {
  return {
    id, labelKo, summaryKo, hourAnchor, kelvin, keyLight, rimLight, secondaryRimLight,
    ambientSkyRgb, ambientGroundRgb, ambientIntensity,
    shadowStrength: shadow[0], shadowSoftness: shadow[1], shadowMaxSteps: shadow[2], shadowStepPx: shadow[3],
    specularBoost: pbr[0], roughnessScale: pbr[1], celSteps: pbr[2], celHardness: pbr[3],
    oklchGrade, lineartPreservation,
  };
}

/** 웹툰 1컷 실시간 리라이팅용 6종 시간대·날씨 프리셋. */
export const RELIGHTING_ATMOSPHERE_PRESETS: Readonly<Record<RelightingAtmospherePresetId, RelightingAtmospherePreset>> = {
  "morning-sunlight": makePreset(
    "morning-sunlight", "아침 햇살 (5600K)", "맑은 오전 하늘의 선명한 주광과 산뜻한 하늘 확산광으로 인물 입체감을 살린다.", 8.5, 5600,
    { azimuthDeg: 205, elevationDeg: 38, colorRgb: [1.0, 0.96, 0.9], intensity: 1.32, isPointLight: false, pointUv: [0.22, 0.25], pointFalloff: 0 },
    { azimuthDeg: 25, elevationDeg: 24, colorRgb: [0.76, 0.89, 1.0], intensity: 0.42, fresnelPower: 2.6 },
    null, [0.68, 0.82, 1.0], [0.46, 0.44, 0.4], 0.34, [0.56, 0.38, 18, 1.4], [0.55, 0.95, 3, 0.55],
    { lightnessShift: 0.015, chromaScale: 1.04, hueBiasDeg: 2, shadowTintRgb: [0.62, 0.74, 0.94], highlightTintRgb: [1.0, 0.97, 0.9] }, 0.94,
  ),
  "golden-sunset": makePreset(
    "golden-sunset", "황금 노을 (2900K)", "낮은 주황빛 역광 림라이트와 푸른 그림자 필로 석양 장면을 연출한다.", 18.0, 2900,
    { azimuthDeg: 342, elevationDeg: 18, colorRgb: [1.0, 0.56, 0.24], intensity: 1.48, isPointLight: false, pointUv: [0.85, 0.42], pointFalloff: 0 },
    { azimuthDeg: 350, elevationDeg: 14, colorRgb: [1.0, 0.68, 0.3], intensity: 0.88, fresnelPower: 2.1 },
    { azimuthDeg: 165, elevationDeg: 30, colorRgb: [0.34, 0.44, 0.78], intensity: 0.3, fresnelPower: 3.0 },
    [0.44, 0.46, 0.74], [0.52, 0.28, 0.18], 0.3, [0.72, 0.34, 22, 1.6], [0.72, 0.88, 3, 0.62],
    { lightnessShift: -0.01, chromaScale: 1.12, hueBiasDeg: -4, shadowTintRgb: [0.32, 0.38, 0.68], highlightTintRgb: [1.0, 0.64, 0.32] }, 0.93,
  ),
  "rainy-night-neon": makePreset(
    "rainy-night-neon", "비 오는 밤 네온", "시안·마젠타 이중 네온 림과 젖은 표면의 날카로운 반사를 야간 컷에 입힌다.", 22.0, 6800,
    { azimuthDeg: 215, elevationDeg: 30, colorRgb: [0.22, 0.88, 1.0], intensity: 1.12, isPointLight: false, pointUv: [0.18, 0.25], pointFalloff: 0 },
    { azimuthDeg: 195, elevationDeg: 18, colorRgb: [0.08, 0.94, 1.0], intensity: 0.96, fresnelPower: 2.0 },
    { azimuthDeg: 15, elevationDeg: 22, colorRgb: [1.0, 0.18, 0.74], intensity: 0.92, fresnelPower: 2.0 },
    [0.12, 0.2, 0.34], [0.22, 0.1, 0.26], 0.24, [0.78, 0.3, 20, 1.5], [1.25, 0.42, 0, 0.45],
    { lightnessShift: -0.04, chromaScale: 1.16, hueBiasDeg: 0, shadowTintRgb: [0.12, 0.18, 0.36], highlightTintRgb: [0.68, 0.92, 1.0] }, 0.95,
  ),
  "overcast-studio": makePreset(
    "overcast-studio", "흐린 날 스튜디오", "부드러운 반구형 확산광으로 그림자 대비를 낮추고 원색 채도를 차분히 유지한다.", 13.0, 6400,
    { azimuthDeg: 265, elevationDeg: 64, colorRgb: [0.92, 0.95, 0.98], intensity: 0.84, isPointLight: false, pointUv: [0.5, 0.12], pointFalloff: 0 },
    { azimuthDeg: 90, elevationDeg: 35, colorRgb: [0.85, 0.9, 0.96], intensity: 0.22, fresnelPower: 3.2 },
    null, [0.78, 0.84, 0.9], [0.54, 0.56, 0.58], 0.56, [0.26, 0.72, 12, 1.2], [0.32, 1.12, 0, 0.3],
    { lightnessShift: 0.0, chromaScale: 0.94, hueBiasDeg: 0, shadowTintRgb: [0.7, 0.75, 0.82], highlightTintRgb: [0.95, 0.97, 1.0] }, 0.96,
  ),
  "moonlit-rooftop": makePreset(
    "moonlit-rooftop", "달빛 옥상 (4100K)", "차가운 은청색 달빛 림과 깊은 밤 그림자로 긴장감 있는 야외 컷을 만든다.", 0.0, 4100,
    { azimuthDeg: 235, elevationDeg: 44, colorRgb: [0.56, 0.74, 1.0], intensity: 0.92, isPointLight: false, pointUv: [0.3, 0.15], pointFalloff: 0 },
    { azimuthDeg: 245, elevationDeg: 26, colorRgb: [0.64, 0.82, 1.0], intensity: 0.84, fresnelPower: 2.2 },
    null, [0.16, 0.25, 0.46], [0.08, 0.12, 0.24], 0.26, [0.84, 0.28, 22, 1.5], [0.66, 0.85, 3, 0.68],
    { lightnessShift: -0.06, chromaScale: 0.9, hueBiasDeg: 6, shadowTintRgb: [0.12, 0.2, 0.44], highlightTintRgb: [0.7, 0.86, 1.0] }, 0.95,
  ),
  "dramatic-candlelight": makePreset(
    "dramatic-candlelight", "극적 촛불 실내 (1900K)", "가까운 점광원의 강한 거리 감쇠와 따뜻한 호박색 바운스로 밀도 높은 명암을 만든다.", 21.0, 1900,
    { azimuthDeg: 115, elevationDeg: 28, colorRgb: [1.0, 0.48, 0.14], intensity: 1.75, isPointLight: true, pointUv: [0.46, 0.66], pointFalloff: 2.6 },
    { azimuthDeg: 290, elevationDeg: 22, colorRgb: [0.95, 0.44, 0.16], intensity: 0.42, fresnelPower: 2.5 },
    null, [0.22, 0.12, 0.08], [0.42, 0.2, 0.08], 0.18, [0.88, 0.25, 20, 1.4], [0.78, 0.82, 0, 0.5],
    { lightnessShift: -0.05, chromaScale: 1.14, hueBiasDeg: -6, shadowTintRgb: [0.18, 0.1, 0.12], highlightTintRgb: [1.0, 0.62, 0.24] }, 0.94,
  ),
};

function lerpRgb(a: RgbTuple, b: RgbTuple, t: number): RgbTuple {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function lerpAngleDeg(a: number, b: number, t: number): number {
  const diff = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + diff * clamp01(t)) % 360) + 360) % 360;
}

function lerpRimLight(a: RelightingRimLightConfig | null, b: RelightingRimLightConfig | null, t: number): RelightingRimLightConfig | null {
  if (!a && !b) return null;
  const seed = a ?? b;
  const zero: RelightingRimLightConfig = { azimuthDeg: seed?.azimuthDeg ?? 0, elevationDeg: seed?.elevationDeg ?? 20, colorRgb: [0, 0, 0], intensity: 0, fresnelPower: seed?.fresnelPower ?? 2.5 };
  const l = a ?? zero;
  const r = b ?? zero;
  const intensity = lerp(l.intensity, r.intensity, t);
  if (intensity <= 1e-4) return null;
  return { azimuthDeg: lerpAngleDeg(l.azimuthDeg, r.azimuthDeg, t), elevationDeg: lerp(l.elevationDeg, r.elevationDeg, t), colorRgb: lerpRgb(l.colorRgb, r.colorRgb, t), intensity, fresnelPower: lerp(l.fresnelPower, r.fresnelPower, t) };
}

function lerpAtmosphere(a: RelightingAtmospherePreset, b: RelightingAtmospherePreset, rawT: number, hourWrapped: number): RelightingAtmospherePreset {
  const t = smoothstep(0, 1, clamp01(rawT));
  const dom = t < 0.5 ? a : b;
  return makePreset(
    dom.id, dom.labelKo, dom.summaryKo, hourWrapped, Math.round(lerp(a.kelvin, b.kelvin, t)),
    {
      azimuthDeg: lerpAngleDeg(a.keyLight.azimuthDeg, b.keyLight.azimuthDeg, t),
      elevationDeg: lerp(a.keyLight.elevationDeg, b.keyLight.elevationDeg, t),
      colorRgb: lerpRgb(a.keyLight.colorRgb, b.keyLight.colorRgb, t),
      intensity: lerp(a.keyLight.intensity, b.keyLight.intensity, t),
      isPointLight: dom.keyLight.isPointLight,
      pointUv: [lerp(a.keyLight.pointUv[0], b.keyLight.pointUv[0], t), lerp(a.keyLight.pointUv[1], b.keyLight.pointUv[1], t)],
      pointFalloff: lerp(a.keyLight.pointFalloff, b.keyLight.pointFalloff, t),
    },
    {
      azimuthDeg: lerpAngleDeg(a.rimLight.azimuthDeg, b.rimLight.azimuthDeg, t),
      elevationDeg: lerp(a.rimLight.elevationDeg, b.rimLight.elevationDeg, t),
      colorRgb: lerpRgb(a.rimLight.colorRgb, b.rimLight.colorRgb, t),
      intensity: lerp(a.rimLight.intensity, b.rimLight.intensity, t),
      fresnelPower: lerp(a.rimLight.fresnelPower, b.rimLight.fresnelPower, t),
    },
    lerpRimLight(a.secondaryRimLight, b.secondaryRimLight, t),
    lerpRgb(a.ambientSkyRgb, b.ambientSkyRgb, t),
    lerpRgb(a.ambientGroundRgb, b.ambientGroundRgb, t),
    lerp(a.ambientIntensity, b.ambientIntensity, t),
    [lerp(a.shadowStrength, b.shadowStrength, t), lerp(a.shadowSoftness, b.shadowSoftness, t), Math.round(lerp(a.shadowMaxSteps, b.shadowMaxSteps, t)), lerp(a.shadowStepPx, b.shadowStepPx, t)],
    [lerp(a.specularBoost, b.specularBoost, t), lerp(a.roughnessScale, b.roughnessScale, t), Math.round(lerp(a.celSteps, b.celSteps, t)), lerp(a.celHardness, b.celHardness, t)],
    {
      lightnessShift: lerp(a.oklchGrade.lightnessShift, b.oklchGrade.lightnessShift, t),
      chromaScale: lerp(a.oklchGrade.chromaScale, b.oklchGrade.chromaScale, t),
      hueBiasDeg: lerp(a.oklchGrade.hueBiasDeg, b.oklchGrade.hueBiasDeg, t),
      shadowTintRgb: lerpRgb(a.oklchGrade.shadowTintRgb, b.oklchGrade.shadowTintRgb, t),
      highlightTintRgb: lerpRgb(a.oklchGrade.highlightTintRgb, b.oklchGrade.highlightTintRgb, t),
    },
    lerp(a.lineartPreservation, b.lineartPreservation, t),
  );
}

const DIURNAL_KEYFRAMES: readonly { readonly hour: number; readonly preset: RelightingAtmospherePreset }[] = [
  { hour: 0.0, preset: RELIGHTING_ATMOSPHERE_PRESETS["moonlit-rooftop"] },
  { hour: 8.5, preset: RELIGHTING_ATMOSPHERE_PRESETS["morning-sunlight"] },
  { hour: 13.0, preset: RELIGHTING_ATMOSPHERE_PRESETS["overcast-studio"] },
  { hour: 18.0, preset: RELIGHTING_ATMOSPHERE_PRESETS["golden-sunset"] },
  { hour: 21.5, preset: RELIGHTING_ATMOSPHERE_PRESETS["rainy-night-neon"] },
  { hour: 24.0, preset: RELIGHTING_ATMOSPHERE_PRESETS["moonlit-rooftop"] },
];

/** 0~24시 연속 시간대 슬라이더를 24시간 주기(0시=24시)로 매끄럽게 보간한다. */
export function interpolateAtmosphereByHour(hour0to24: number): RelightingAtmospherePreset {
  const wrapped = (((Number.isFinite(hour0to24) ? hour0to24 : 12) % 24) + 24) % 24;
  for (let i = 0; i < DIURNAL_KEYFRAMES.length - 1; i += 1) {
    const start = DIURNAL_KEYFRAMES[i];
    const end = DIURNAL_KEYFRAMES[i + 1];
    if (wrapped >= start.hour && wrapped <= end.hour) {
      return lerpAtmosphere(start.preset, end.preset, (wrapped - start.hour) / Math.max(1e-5, end.hour - start.hour), wrapped);
    }
  }
  return RELIGHTING_ATMOSPHERE_PRESETS["moonlit-rooftop"];
}

function computeBoundaryDistanceField(width: number, height: number, boundaryFlags: Uint8Array, maxRadius: number): Float32Array {
  const total = width * height;
  const dist = new Float32Array(total);
  const inf = maxRadius + 2;
  for (let i = 0; i < total; i += 1) dist[i] = boundaryFlags[i] === 1 ? 0 : inf;
  const diag = Math.SQRT2;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      let d = dist[idx];
      if (d === 0) continue;
      if (x > 0) d = Math.min(d, dist[idx - 1] + 1);
      if (y > 0) {
        d = Math.min(d, dist[idx - width] + 1);
        if (x > 0) d = Math.min(d, dist[idx - width - 1] + diag);
        if (x + 1 < width) d = Math.min(d, dist[idx - width + 1] + diag);
      }
      dist[idx] = d;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    const row = y * width;
    for (let x = width - 1; x >= 0; x -= 1) {
      const idx = row + x;
      let d = dist[idx];
      if (d === 0) continue;
      if (x + 1 < width) d = Math.min(d, dist[idx + 1] + 1);
      if (y + 1 < height) {
        d = Math.min(d, dist[idx + width] + 1);
        if (x > 0) d = Math.min(d, dist[idx + width - 1] + diag);
        if (x + 1 < width) d = Math.min(d, dist[idx + width + 1] + diag);
      }
      dist[idx] = Math.min(d, maxRadius);
    }
  }
  return dist;
}

/** 2D 웹툰 컷에서 연속 단위 법선(`|N|=1`, `nz>0`), 부호 거리 팽창 깊이, 선화 보호 마스크, 거칠기·금속성 힌트를 복원한다. */
export function reconstructCut25dGeometryMaps(options: ReconstructCut25dOptions): Cut25dGeometryMaps {
  const width = Math.max(0, Math.floor(options.width));
  const height = Math.max(0, Math.floor(options.height));
  const total = width * height;
  if (total === 0 || options.rgba.length < total * 4) {
    return { width, height, normalXyz: new Float32Array(0), depthField: new Float32Array(0), lineartField: new Float32Array(0), roughnessField: new Float32Array(0), metallicField: new Float32Array(0), meanDepth: 0, lineartCoverage: 0 };
  }

  const inflationStrength = clampRange(options.inflationStrength ?? 1.0, 0, 3);
  const inflationRadius = clampRange(options.inflationRadiusPx ?? Math.max(6, Math.min(width, height) * 0.18), 2, 64);
  const shadingReliefWeight = clampRange(options.shadingReliefWeight ?? 0.35, 0, 1);
  const lineartThreshold = clampRange(options.lineartThreshold ?? 0.22, 0.04, 0.5);
  const normalZBias = clampRange(options.normalZBias ?? 0.85, 0.2, 4);

  const luma = new Float32Array(total);
  const alphaField = new Float32Array(total);
  const lineartField = new Float32Array(total);
  const roughnessField = new Float32Array(total);
  const metallicField = new Float32Array(total);
  const boundaryFlags = new Uint8Array(total);
  const explicitMask = options.lineartMask;
  const maskScale = explicitMask instanceof Uint8Array ? 1 / 255 : 1;

  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    const r = srgbToLinearChannel(options.rgba[o] / 255);
    const g = srgbToLinearChannel(options.rgba[o + 1] / 255);
    const b = srgbToLinearChannel(options.rgba[o + 2] / 255);
    const a = clamp01(options.rgba[o + 3] / 255);
    const yLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    luma[i] = yLuma;
    alphaField[i] = a;
    const ink = explicitMask && explicitMask.length >= total
      ? clamp01(explicitMask[i] * maskScale)
      : a > 0.2
        ? clamp01((1 - smoothstep(lineartThreshold * 0.45, lineartThreshold, yLuma)) * (1 - smoothstep(0.08, 0.26, chroma)))
        : 0;
    lineartField[i] = ink;
    roughnessField[i] = lerp(clampRange(0.76 - smoothstep(0.62, 0.96, yLuma) * 0.3 - (1 - chroma) * 0.08, 0.22, 0.92), 0.92, ink);
    metallicField[i] = lerp((1 - smoothstep(0.05, 0.22, chroma)) * smoothstep(0.32, 0.85, yLuma) * 0.35, 0, ink);
  }

  let lineartSum = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      lineartSum += lineartField[idx];
      if (alphaField[idx] < 0.1 || lineartField[idx] >= 0.48 || x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        boundaryFlags[idx] = 1;
        continue;
      }
      const dl = Math.abs(luma[idx] - luma[idx - 1]) + Math.abs(luma[idx] - luma[idx + 1]) + Math.abs(luma[idx] - luma[idx - width]) + Math.abs(luma[idx] - luma[idx + width]);
      if (dl > 0.65) boundaryFlags[idx] = 1;
    }
  }

  const distField = computeBoundaryDistanceField(width, height, boundaryFlags, inflationRadius);
  const rawDepth = new Float32Array(total);
  const depthHints = options.depthHints;
  const hasHints = Boolean(depthHints && depthHints.length >= total);
  for (let i = 0; i < total; i += 1) {
    const normDist = clamp01(distField[i] / inflationRadius);
    const dome = Math.sqrt(Math.max(0, 1 - (1 - normDist) * (1 - normDist)));
    let d = clamp01((dome * 0.72 + luma[i] * shadingReliefWeight * 0.28) * inflationStrength) * alphaField[i];
    if (hasHints && depthHints) d = clamp01(clamp01(depthHints[i]) * 0.7 + d * 0.3);
    rawDepth[i] = d;
  }

  const depthField = new Float32Array(total);
  let depthSum = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      if (lineartField[idx] >= 0.5) {
        depthField[idx] = rawDepth[idx];
        depthSum += rawDepth[idx];
        continue;
      }
      let acc = 0;
      let wSum = 0;
      const cD = rawDepth[idx];
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = clampRange(y + dy, 0, height - 1);
        for (let dx = -1; dx <= 1; dx += 1) {
          const nIdx = ny * width + clampRange(x + dx, 0, width - 1);
          const w = (dx === 0 && dy === 0 ? 2.5 : dx === 0 || dy === 0 ? 1.0 : 0.6) * (1 - lineartField[nIdx] * 0.85) * Math.exp(-Math.abs(rawDepth[nIdx] - cD) * 6);
          acc += rawDepth[nIdx] * w;
          wSum += w;
        }
      }
      const sm = wSum > 1e-6 ? acc / wSum : cD;
      depthField[idx] = sm;
      depthSum += sm;
    }
  }

  const normalXyz = new Float32Array(total * 3);
  const gradScale = 3.2 * Math.max(0.4, inflationStrength);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const yUp = Math.max(0, y - 1) * width;
    const yDn = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const damp = 1 - lineartField[idx] * 0.72;
      const gx = (depthField[row + Math.min(width - 1, x + 1)] - depthField[row + Math.max(0, x - 1)]) * 0.5 * gradScale * damp;
      const gy = (depthField[yDn + x] - depthField[yUp + x]) * 0.5 * gradScale * damp;
      const [nx, ny, nzRaw] = normalizeVec3(-gx, -gy, normalZBias);
      const [fnx, fny, fnz] = normalizeVec3(nx, ny, Math.max(0.08, nzRaw));
      normalXyz[idx * 3] = fnx;
      normalXyz[idx * 3 + 1] = fny;
      normalXyz[idx * 3 + 2] = fnz;
    }
  }
  return { width, height, normalXyz, depthField, lineartField, roughnessField, metallicField, meanDepth: depthSum / total, lineartCoverage: lineartSum / total };
}

/** 2D 스크린 공간 깊이장을 따라 광원 방향으로 레이마칭하며 소프트 그림자 투과율(`0..1`)을 산출한다. */
export function marchScreenSpaceSoftShadow(
  depthField: Float32Array, width: number, height: number, startX: number, startY: number,
  lightDir: Vec3Tuple, maxSteps: number, stepPx: number, softness: number,
): number {
  const planLen = Math.hypot(lightDir[0], lightDir[1]);
  if (planLen < 1e-4 || maxSteps <= 0) return 1;
  const dx = lightDir[0] / planLen;
  const dy = lightDir[1] / planLen;
  const baseDepth = depthField[startY * width + startX];
  const raySlope = clampRange(lightDir[2] / Math.max(0.18, planLen), 0.12, 2.5) * 0.045;
  const penumbraFactor = Math.max(0.08, softness * 0.45);
  let visibility = 1.0;
  for (let step = 1; step <= maxSteps; step += 1) {
    const ix = Math.round(startX + dx * stepPx * step);
    const iy = Math.round(startY + dy * stepPx * step);
    if (ix < 0 || ix >= width || iy < 0 || iy >= height) break;
    const occluderDelta = depthField[iy * width + ix] - (baseDepth + step * stepPx * raySlope);
    if (occluderDelta > 0.015) {
      visibility = Math.min(visibility, clamp01(1 - occluderDelta / (penumbraFactor * (0.4 + step / maxSteps))));
      if (visibility <= 0.02) return 0.02;
    }
  }
  return clamp01(visibility);
}

function quantizeCelRamp(ndotl: number, steps: number, hardness: number): number {
  if (steps <= 1) return clamp01(ndotl);
  const scaled = clamp01(ndotl) * steps;
  const band = Math.floor(scaled);
  const edge = clampRange(0.5 - hardness * 0.44, 0.04, 0.48);
  return clamp01((band + smoothstep(0.5 - edge, 0.5 + edge, scaled - band)) / steps);
}

function evaluateGgxSpecular(ndotL: number, ndotV: number, ndotH: number, roughness: number): number {
  if (ndotL <= 0 || ndotV <= 0) return 0;
  const a = Math.max(0.06, roughness * roughness);
  const a2 = a * a;
  const denom = ndotH * ndotH * (a2 - 1) + 1;
  const d = a2 / (Math.PI * denom * denom + 1e-6);
  const k = ((roughness + 1) * (roughness + 1)) / 8;
  return clampRange((d * (ndotV / (ndotV * (1 - k) + k + 1e-6)) * (ndotL / (ndotL * (1 - k) + k + 1e-6))) / (4 * ndotV * ndotL + 1e-4), 0, 6);
}

function applyOklchGradingAndFilmic(rgb: RgbTuple, grade: OklchGradeConfig, factor: number): RgbTuple {
  const t = clamp01(factor);
  const [L, C, h] = linearRgbToOklch([
    rgb[0] * lerp(grade.shadowTintRgb[0], grade.highlightTintRgb[0], t),
    rgb[1] * lerp(grade.shadowTintRgb[1], grade.highlightTintRgb[1], t),
    rgb[2] * lerp(grade.shadowTintRgb[2], grade.highlightTintRgb[2], t),
  ]);
  const ok = oklchToLinearRgb([
    clamp01(L + grade.lightnessShift * smoothstep(0.06, 0.35, L)),
    clampRange(C * grade.chromaScale, 0, 0.36),
    (((h + grade.hueBiasDeg) % 360) + 360) % 360,
  ]);
  const filmic = (v: number): number => {
    const x = Math.max(0, v);
    return clamp01((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
  };
  return [filmic(ok[0]), filmic(ok[1]), filmic(ok[2])];
}

function evalRimEnergy(nx: number, ny: number, nz: number, dir: Vec3Tuple, cfg: RelightingRimLightConfig, mask: number): number {
  return Math.pow(1 - clamp01(nz), cfg.fresnelPower) * clamp01(0.25 + 0.75 * Math.max(0, nx * dir[0] + ny * dir[1] + nz * dir[2])) * cfg.intensity * mask;
}

/** 2.5D 기하 맵과 시간대·날씨 광원 모델을 결합해 웹툰 1컷을 실시간으로 리라이팅한다. */
export function relight25dWebtoonCut(options: Relight25dCutOptions): Relight25dCutResult {
  const width = Math.max(0, Math.floor(options.width));
  const height = Math.max(0, Math.floor(options.height));
  const total = width * height;
  const baseAtm = options.hourOfDay !== undefined ? interpolateAtmosphereByHour(options.hourOfDay) : RELIGHTING_ATMOSPHERE_PRESETS[options.presetId ?? "morning-sunlight"];
  const atmosphere: RelightingAtmospherePreset = {
    ...baseAtm,
    ...options.atmosphereOverride,
    keyLight: {
      ...baseAtm.keyLight,
      ...(options.atmosphereOverride?.keyLight ?? {}),
      ...(options.keyLightAzimuthOverrideDeg !== undefined ? { azimuthDeg: options.keyLightAzimuthOverrideDeg } : {}),
      ...(options.keyLightElevationOverrideDeg !== undefined ? { elevationDeg: options.keyLightElevationOverrideDeg } : {}),
    },
    rimLight: { ...baseAtm.rimLight, ...(options.atmosphereOverride?.rimLight ?? {}) },
    oklchGrade: { ...baseAtm.oklchGrade, ...(options.atmosphereOverride?.oklchGrade ?? {}) },
  };
  const geometry = options.geometry ?? reconstructCut25dGeometryMaps({ width, height, rgba: options.rgba, lineartMask: options.lineartMask, depthHints: options.depthHints });

  if (total === 0 || options.rgba.length < total * 4) {
    return { width, height, rgba: new Uint8ClampedArray(0), shadowMap: new Float32Array(0), highlightCentroid: [0, 0], averageRgb: [0, 0, 0], appliedAtmosphere: atmosphere, geometry };
  }

  const outRgba = new Uint8ClampedArray(total * 4);
  const shadowMap = new Float32Array(total);
  const keyDirBase = options.keyLightDirectionOverride
    ? normalizeVec3(options.keyLightDirectionOverride[0], options.keyLightDirectionOverride[1], Math.max(0.05, options.keyLightDirectionOverride[2]))
    : directionFromAngles(atmosphere.keyLight.azimuthDeg, atmosphere.keyLight.elevationDeg);
  const rimDir = directionFromAngles(atmosphere.rimLight.azimuthDeg, atmosphere.rimLight.elevationDeg);
  const secRim = atmosphere.secondaryRimLight;
  const secRimDir = secRim ? directionFromAngles(secRim.azimuthDeg, secRim.elevationDeg) : null;
  const effectiveCelSteps = options.celMode === "smooth" ? 0 : options.celMode === "cel" ? Math.max(2, options.celStepsOverride ?? (atmosphere.celSteps || 3)) : (options.celStepsOverride ?? atmosphere.celSteps);

  const pointX = atmosphere.keyLight.pointUv[0] * width;
  const pointY = atmosphere.keyLight.pointUv[1] * height;
  const maxSpan = Math.max(1, Math.hypot(width, height));
  let sumR = 0; let sumG = 0; let sumB = 0; let weightSum = 0;
  let hiWeightSum = 0; let hiXSum = 0; let hiYSum = 0;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const o = idx * 4;
      if (options.rgba[o + 3] <= 0) {
        outRgba[o] = options.rgba[o]; outRgba[o + 1] = options.rgba[o + 1]; outRgba[o + 2] = options.rgba[o + 2]; outRgba[o + 3] = options.rgba[o + 3];
        shadowMap[idx] = 1;
        continue;
      }
      const alb: RgbTuple = [srgbToLinearChannel(options.rgba[o] / 255), srgbToLinearChannel(options.rgba[o + 1] / 255), srgbToLinearChannel(options.rgba[o + 2] / 255)];
      const nx = geometry.normalXyz[idx * 3];
      const ny = geometry.normalXyz[idx * 3 + 1];
      const nz = geometry.normalXyz[idx * 3 + 2];
      const ink = geometry.lineartField[idx];
      const rough = clampRange(geometry.roughnessField[idx] * atmosphere.roughnessScale, 0.08, 0.98);
      const metal = geometry.metallicField[idx];

      let keyDir = keyDirBase;
      let atten = 1;
      if (atmosphere.keyLight.isPointLight && !options.keyLightDirectionOverride) {
        const dx = (pointX - x) / maxSpan;
        const dy = (pointY - y) / maxSpan;
        keyDir = normalizeVec3(dx, dy, 0.38);
        atten = 1 / (1 + atmosphere.keyLight.pointFalloff * (dx * dx + dy * dy) * 5.2);
      }

      const vis = marchScreenSpaceSoftShadow(geometry.depthField, width, height, x, y, keyDir, atmosphere.shadowMaxSteps, atmosphere.shadowStepPx, atmosphere.shadowSoftness);
      const shadowLit = lerp(1, vis, atmosphere.shadowStrength);
      shadowMap[idx] = shadowLit;

      const rawNdotL = Math.max(0, nx * keyDir[0] + ny * keyDir[1] + nz * keyDir[2]);
      const diffTerm = effectiveCelSteps > 1 ? quantizeCelRamp(rawNdotL, effectiveCelSteps, atmosphere.celHardness) : rawNdotL;
      const hVec = normalizeVec3(keyDir[0], keyDir[1], keyDir[2] + 1);
      const ggx = evaluateGgxSpecular(rawNdotL, clamp01(nz), Math.max(0, nx * hVec[0] + ny * hVec[1] + nz * hVec[2]), rough) * atmosphere.specularBoost * shadowLit * atten;

      const skyMix = clamp01(0.5 - ny * 0.5);
      const ambR = lerp(atmosphere.ambientGroundRgb[0], atmosphere.ambientSkyRgb[0], skyMix) * atmosphere.ambientIntensity;
      const ambG = lerp(atmosphere.ambientGroundRgb[1], atmosphere.ambientSkyRgb[1], skyMix) * atmosphere.ambientIntensity;
      const ambB = lerp(atmosphere.ambientGroundRgb[2], atmosphere.ambientSkyRgb[2], skyMix) * atmosphere.ambientIntensity;

      const keyScale = diffTerm * atmosphere.keyLight.intensity * shadowLit * atten;
      const diffW = 1 - metal * 0.55;
      const rimMask = 1 - ink * 0.78;
      const rimE = evalRimEnergy(nx, ny, nz, rimDir, atmosphere.rimLight, rimMask);
      const secE = secRim && secRimDir ? evalRimEnergy(nx, ny, nz, secRimDir, secRim, rimMask) : 0;

      const litR = alb[0] * (ambR + atmosphere.keyLight.colorRgb[0] * keyScale * diffW) + lerp(0.04, alb[0], metal) * atmosphere.keyLight.colorRgb[0] * ggx + atmosphere.rimLight.colorRgb[0] * rimE + (secRim ? secRim.colorRgb[0] * secE : 0);
      const litG = alb[1] * (ambG + atmosphere.keyLight.colorRgb[1] * keyScale * diffW) + lerp(0.04, alb[1], metal) * atmosphere.keyLight.colorRgb[1] * ggx + atmosphere.rimLight.colorRgb[1] * rimE + (secRim ? secRim.colorRgb[1] * secE : 0);
      const litB = alb[2] * (ambB + atmosphere.keyLight.colorRgb[2] * keyScale * diffW) + lerp(0.04, alb[2], metal) * atmosphere.keyLight.colorRgb[2] * ggx + atmosphere.rimLight.colorRgb[2] * rimE + (secRim ? secRim.colorRgb[2] * secE : 0);

      const graded = applyOklchGradingAndFilmic([litR, litG, litB], atmosphere.oklchGrade, clamp01(diffTerm * shadowLit));
      const keepInk = clamp01(ink * atmosphere.lineartPreservation);
      const srgb = linearToSrgbRgb([lerp(graded[0], alb[0] * (0.25 + 0.75 * ambR), keepInk), lerp(graded[1], alb[1] * (0.25 + 0.75 * ambG), keepInk), lerp(graded[2], alb[2] * (0.25 + 0.75 * ambB), keepInk)]);
      outRgba[o] = Math.round(clamp01(srgb[0]) * 255);
      outRgba[o + 1] = Math.round(clamp01(srgb[1]) * 255);
      outRgba[o + 2] = Math.round(clamp01(srgb[2]) * 255);
      outRgba[o + 3] = options.rgba[o + 3];

      sumR += srgb[0]; sumG += srgb[1]; sumB += srgb[2]; weightSum += 1;
      const hiW = Math.pow(Math.max(0, 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]), 3) * (1 - ink);
      hiWeightSum += hiW; hiXSum += x * hiW; hiYSum += y * hiW;
    }
  }

  return {
    width, height, rgba: outRgba, shadowMap,
    highlightCentroid: [hiWeightSum > 1e-6 ? hiXSum / hiWeightSum : width * 0.5, hiWeightSum > 1e-6 ? hiYSum / hiWeightSum : height * 0.5],
    averageRgb: [weightSum > 0 ? sumR / weightSum : 0, weightSum > 0 ? sumG / weightSum : 0, weightSum > 0 ? sumB / weightSum : 0],
    appliedAtmosphere: atmosphere, geometry,
  };
}
