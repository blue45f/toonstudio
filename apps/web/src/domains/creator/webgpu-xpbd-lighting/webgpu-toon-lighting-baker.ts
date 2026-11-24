/**
 * WebGPU `@compute` Signed-Distance-Field(SDF) 실시간 광원 근사화 & 2D/3D 단일 물리 광원 리그 베이크 엔진.
 *
 * - 2D 배경 컷의 주광원 방위각·고도각·색온도(K)와 3D VRM 캐릭터의 툰 셀 램프·림라이트·
 *   OKLCH 바닥 바운스 컬러·투영 그림자 각도를 단일 물리 광원 리그로 일치시켜 이질감을 제거한다.
 * - WGSL `@compute` 셰이더(`TOON_SDF_RAYMARCH_WGSL`)와 결정론적 CPU SDF 폴백 베이크를 제공한다.
 */

import {
  createDefaultHumanoidCapsuleColliders,
  type CapsuleCollider,
  type Vec3,
} from "./xpbd-types-and-rig";

export {
  TOON_SDF_RAYMARCH_WGSL,
  TOON_SDF_WORKGROUP_SIZE,
  buildToonSdfRaymarchWgsl,
} from "./wgsl-shaders";

export {
  renderXpbdLightingPreviewCanvas,
  type PreviewCanvasRenderOptions,
} from "./preview-canvas-renderer";

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export interface PhysicalLightRigInput {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly colorTempKelvin: number;
  readonly keyIntensity?: number;
  readonly floorAlbedoOklch?: OklchColor;
  readonly skyFillRatio?: number;
  readonly celStepCount?: 2 | 3 | 4;
  readonly shadowSoftness?: number;
}

export interface NormalizedPhysicalLightRigInput {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly colorTempKelvin: number;
  readonly keyIntensity: number;
  readonly floorAlbedoOklch: OklchColor;
  readonly skyFillRatio: number;
  readonly celStepCount: 2 | 3 | 4;
  readonly shadowSoftness: number;
}

export interface ToonCelRampBand {
  readonly id: "shadow" | "midtone" | "lit" | "highlight";
  readonly labelKo: string;
  readonly ndotlThreshold: number;
  readonly colorOklch: OklchColor;
  readonly cssOklch: string;
}

export interface SdfRaymarchSample {
  readonly u: number;
  readonly v: number;
  readonly hit: boolean;
  readonly ndotl: number;
  readonly sdfShadow: number;
  readonly sdfAo: number;
  readonly celBandIndex: number;
  readonly rimFactor: number;
  readonly bounceFactor: number;
  readonly finalColorOklch: OklchColor;
}

export interface Cut2dLightMetadata {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly colorTempKelvin: number;
  readonly shadowAngleDeg: number;
  readonly shadowLengthRatio: number;
  readonly skyZenithOklch: OklchColor;
  readonly skyHorizonOklch: OklchColor;
  readonly groundLitOklch: OklchColor;
  readonly groundShadowOklch: OklchColor;
}

export interface VrmToonShaderUniforms {
  readonly lightDir: Vec3;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly colorTempKelvin: number;
  readonly projectedShadowAngleDeg: number;
  readonly projectedShadowLengthRatio: number;
  readonly keyLightOklch: OklchColor;
  readonly rimLightOklch: OklchColor;
  readonly floorBounceOklch: OklchColor;
  readonly shadowTintOklch: OklchColor;
  readonly celThresholds: readonly number[];
}

export interface LightRigAlignmentMetrics {
  readonly azimuthMismatchDeg: number;
  readonly elevationMismatchDeg: number;
  readonly kelvinMismatchK: number;
  readonly shadowOppositionErrorDeg: number;
  readonly harmonyScore: number;
}

export interface Unified2d3dLightRigResult {
  readonly input: NormalizedPhysicalLightRigInput;
  readonly lightDirection3d: Vec3;
  readonly lightDirection2d: readonly [number, number];
  readonly projectedShadowAngleDeg: number;
  readonly projectedShadowLengthRatio: number;
  readonly keyLightOklch: OklchColor;
  readonly keyLightCss: string;
  readonly ambientSkyOklch: OklchColor;
  readonly ambientSkyCss: string;
  readonly rimLightOklch: OklchColor;
  readonly rimLightCss: string;
  readonly floorBounceOklch: OklchColor;
  readonly floorBounceCss: string;
  readonly shadowTintOklch: OklchColor;
  readonly shadowTintCss: string;
  readonly celRamp: readonly ToonCelRampBand[];
  readonly cut2dLightMetadata: Cut2dLightMetadata;
  readonly vrmShaderUniforms: VrmToonShaderUniforms;
  readonly alignmentMetrics: LightRigAlignmentMetrics;
  readonly sdfFieldWidth: number;
  readonly sdfFieldHeight: number;
  readonly sdfSamples: readonly SdfRaymarchSample[];
  readonly bakeHashHex: string;
  readonly backend: "webgpu-compute-ready" | "cpu-sdf-fallback";
}

export interface ToonLightingPreset {
  readonly id: "morning-atelier" | "golden-sunset" | "noon-outdoor" | "moonlit-night";
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly light: PhysicalLightRigInput;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export const DEFAULT_FLOOR_ALBEDO_OKLCH: OklchColor = Object.freeze({
  l: 0.72,
  c: 0.042,
  h: 74,
});

export const DEFAULT_PHYSICAL_LIGHT_INPUT: NormalizedPhysicalLightRigInput = Object.freeze({
  azimuthDeg: 42,
  elevationDeg: 46,
  colorTempKelvin: 5200,
  keyIntensity: 1.0,
  floorAlbedoOklch: DEFAULT_FLOOR_ALBEDO_OKLCH,
  skyFillRatio: 0.34,
  celStepCount: 3,
  shadowSoftness: 0.16,
});

export const TOON_LIGHTING_PRESETS: readonly ToonLightingPreset[] = Object.freeze([
  Object.freeze({
    id: "morning-atelier" as const,
    labelKo: "오전 채광",
    descriptionKo: "5200K 자연광 · 46° 부드러운 창가 채광",
    light: Object.freeze({
      azimuthDeg: 42,
      elevationDeg: 46,
      colorTempKelvin: 5200,
      keyIntensity: 1.0,
      floorAlbedoOklch: Object.freeze({ l: 0.74, c: 0.038, h: 76 }),
      skyFillRatio: 0.36,
      celStepCount: 3 as const,
      shadowSoftness: 0.16,
    }),
  }),
  Object.freeze({
    id: "golden-sunset" as const,
    labelKo: "노을 역광",
    descriptionKo: "2900K 따뜻한 석양 · 18° 긴 투영 그림자와 강한 림라이트",
    light: Object.freeze({
      azimuthDeg: 152,
      elevationDeg: 18,
      colorTempKelvin: 2900,
      keyIntensity: 1.15,
      floorAlbedoOklch: Object.freeze({ l: 0.68, c: 0.068, h: 54 }),
      skyFillRatio: 0.28,
      celStepCount: 3 as const,
      shadowSoftness: 0.14,
    }),
  }),
  Object.freeze({
    id: "noon-outdoor" as const,
    labelKo: "정오 야외",
    descriptionKo: "5800K 청명한 정오 직사광 · 72° 짧은 그림자",
    light: Object.freeze({
      azimuthDeg: 85,
      elevationDeg: 72,
      colorTempKelvin: 5800,
      keyIntensity: 1.1,
      floorAlbedoOklch: Object.freeze({ l: 0.78, c: 0.025, h: 95 }),
      skyFillRatio: 0.42,
      celStepCount: 3 as const,
      shadowSoftness: 0.12,
    }),
  }),
  Object.freeze({
    id: "moonlit-night" as const,
    labelKo: "월광 심야",
    descriptionKo: "8200K 한색 달빛 · 34° 선명한 툰 림라이트",
    light: Object.freeze({
      azimuthDeg: 215,
      elevationDeg: 34,
      colorTempKelvin: 8200,
      keyIntensity: 0.88,
      floorAlbedoOklch: Object.freeze({ l: 0.46, c: 0.052, h: 248 }),
      skyFillRatio: 0.26,
      celStepCount: 4 as const,
      shadowSoftness: 0.18,
    }),
  }),
]);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeAngleDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return Number((((deg % 360) + 360) % 360).toFixed(2));
}

function angularDiffDeg(a: number, b: number): number {
  const diff = Math.abs(normalizeAngleDeg(a) - normalizeAngleDeg(b));
  return Number(Math.min(diff, 360 - diff).toFixed(4));
}

function srgbToLinear(c: number): number {
  const x = clamp(c, 0, 1);
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/**
 * 색온도(2000K ~ 10000K)를 선형 RGB(0..1)로 근사 변환한다.
 */
export function kelvinToLinearRgb(kelvin: number): readonly [number, number, number] {
  const k = clamp(kelvin, 2000, 10000) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (k <= 66) {
    r = 1;
    g = clamp((99.4708025861 * Math.log(k) - 161.1195681661) / 255, 0, 1);
    b = k <= 19 ? 0 : clamp((138.5177312231 * Math.log(k - 10) - 305.0447927307) / 255, 0, 1);
  } else {
    r = clamp((329.698727446 * (k - 60) ** -0.1332047592) / 255, 0, 1);
    g = clamp((288.1221695283 * (k - 60) ** -0.0755148492) / 255, 0, 1);
    b = 1;
  }
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/**
 * 선형 RGB(0..1)를 Björn Ottosson 표준 행렬로 OKLCH 색공간으로 변환한다.
 */
export function linearRgbToOklch(r: number, g: number, b: number): OklchColor {
  const lr = clamp(r, 0, 1.5);
  const lg = clamp(g, 0, 1.5);
  const lb = clamp(b, 0, 1.5);
  const lComp = Math.cbrt(Math.max(0, 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb));
  const mComp = Math.cbrt(Math.max(0, 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb));
  const sComp = Math.cbrt(Math.max(0, 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb));

  const L = 0.2104542553 * lComp + 0.793617785 * mComp - 0.0040720468 * sComp;
  const A = 1.9779984951 * lComp - 2.428592205 * mComp + 0.4505937099 * sComp;
  const B = 0.0259040371 * lComp + 0.7827717662 * mComp - 0.808675766 * sComp;
  const C = Math.hypot(A, B);
  const H = C < 1e-5 ? 0 : normalizeAngleDeg(Math.atan2(B, A) * RAD_TO_DEG);

  return Object.freeze({
    l: Number(clamp(L, 0, 1).toFixed(4)),
    c: Number(clamp(C, 0, 0.4).toFixed(4)),
    h: Number(H.toFixed(2)),
  });
}

/**
 * OKLCH 좌표를 선형 RGB(0..1)로 역변환한다.
 */
export function oklchToLinearRgb(color: OklchColor): readonly [number, number, number] {
  const hRad = color.h * DEG_TO_RAD;
  const a = color.c * Math.cos(hRad);
  const b = color.c * Math.sin(hRad);
  const l_ = color.l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = color.l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = color.l - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, 0, 1),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, 0, 1),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s, 0, 1),
  ];
}

export function kelvinToOklch(kelvin: number): OklchColor {
  const [r, g, b] = kelvinToLinearRgb(kelvin);
  return linearRgbToOklch(r, g, b);
}

export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = clamp(color.l, 0, 1).toFixed(3);
  const c = clamp(color.c, 0, 0.4).toFixed(3);
  const h = normalizeAngleDeg(color.h).toFixed(1);
  if (typeof alpha === "number" && Number.isFinite(alpha) && alpha < 0.999) {
    return `oklch(${l} ${c} ${h} / ${clamp(alpha, 0, 1).toFixed(2)})`;
  }
  return `oklch(${l} ${c} ${h})`;
}

function sdCapsuleCpu(p: Vec3, a: Vec3, b: Vec3, r: number): number {
  const pax = p[0] - a[0];
  const pay = p[1] - a[1];
  const paz = p[2] - a[2];
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const h = clamp(
    (pax * bax + pay * bay + paz * baz) / Math.max(bax * bax + bay * bay + baz * baz, 1e-8),
    0,
    1,
  );
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}

function mapCharacterSdfCpu(p: Vec3, colliders: readonly CapsuleCollider[]): number {
  let d = 1e5;
  for (const cap of colliders) {
    const cd = sdCapsuleCpu(p, cap.a, cap.b, cap.radius);
    const h = clamp(0.5 + (0.5 * (cd - d)) / 0.018, 0, 1);
    d = cd * (1 - h) + d * h - 0.018 * h * (1 - h);
  }
  return d;
}

function calcSdfNormalCpu(p: Vec3, colliders: readonly CapsuleCollider[]): Vec3 {
  const eps = 0.0025;
  const dx =
    mapCharacterSdfCpu([p[0] + eps, p[1], p[2]], colliders) -
    mapCharacterSdfCpu([p[0] - eps, p[1], p[2]], colliders);
  const dy =
    mapCharacterSdfCpu([p[0], p[1] + eps, p[2]], colliders) -
    mapCharacterSdfCpu([p[0], p[1] - eps, p[2]], colliders);
  const dz =
    mapCharacterSdfCpu([p[0], p[1], p[2] + eps], colliders) -
    mapCharacterSdfCpu([p[0], p[1], p[2] - eps], colliders);
  const len = Math.max(Math.hypot(dx, dy, dz), 1e-6);
  return [dx / len, dy / len, dz / len];
}

function marchSoftShadowCpu(
  ro: Vec3,
  rd: Vec3,
  k: number,
  colliders: readonly CapsuleCollider[],
): number {
  let res = 1;
  let t = 0.015;
  for (let i = 0; i < 16; i += 1) {
    const h = mapCharacterSdfCpu([ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t], colliders);
    if (h < 0.001) return 0;
    res = Math.min(res, (k * h) / t);
    t += clamp(h, 0.012, 0.08);
    if (t > 0.75) break;
  }
  return clamp(res, 0, 1);
}

function calcSdfAoCpu(p: Vec3, n: Vec3, colliders: readonly CapsuleCollider[]): number {
  let occ = 0;
  let scale = 1;
  for (let i = 1; i <= 4; i += 1) {
    const hr = 0.015 * i;
    occ += (hr - mapCharacterSdfCpu([p[0] + n[0] * hr, p[1] + n[1] * hr, p[2] + n[2] * hr], colliders)) * scale;
    scale *= 0.65;
  }
  return clamp(1 - occ * 3.2, 0.25, 1);
}

function blendOklch(a: OklchColor, b: OklchColor, t: number): OklchColor {
  const k = clamp(t, 0, 1);
  let dh = ((b.h - a.h + 540) % 360) - 180;
  if (a.c < 0.005) dh = 0;
  const h = a.c < 0.005 ? b.h : normalizeAngleDeg(a.h + dh * k);
  return Object.freeze({
    l: Number(clamp(a.l + (b.l - a.l) * k, 0, 1).toFixed(4)),
    c: Number(clamp(a.c + (b.c - a.c) * k, 0, 0.4).toFixed(4)),
    h: Number(h.toFixed(2)),
  });
}

function computeBakeHashHex(
  input: NormalizedPhysicalLightRigInput,
  samples: readonly SdfRaymarchSample[],
): string {
  let hash = 0x811c9dc5;
  const pushNum = (v: number): void => {
    const q = Math.round(v * 1000);
    hash ^= q & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (q >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193);
  };
  pushNum(input.azimuthDeg);
  pushNum(input.elevationDeg);
  pushNum(input.colorTempKelvin);
  pushNum(input.celStepCount);
  for (let i = 0; i < samples.length; i += 4) {
    const s = samples[i];
    if (!s) continue;
    pushNum(s.ndotl);
    pushNum(s.sdfShadow);
    pushNum(s.finalColorOklch.l);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * 2D 배경 컷 광원과 3D VRM 캐릭터 SDF 툰 셰이딩·림라이트·OKLCH 바닥 바운스를
 * 단일 물리 광원 리그로 베이크한다.
 */
export function bakeToonSdfLighting(
  rawInput: PhysicalLightRigInput,
  options: {
    readonly colliders?: readonly CapsuleCollider[];
    readonly gridSize?: number;
  } = {},
): Unified2d3dLightRigResult {
  const input: NormalizedPhysicalLightRigInput = Object.freeze({
    azimuthDeg: normalizeAngleDeg(rawInput.azimuthDeg),
    elevationDeg: Number(clamp(rawInput.elevationDeg, 5, 85).toFixed(2)),
    colorTempKelvin: Math.round(clamp(rawInput.colorTempKelvin, 2000, 10000)),
    keyIntensity: Number(clamp(rawInput.keyIntensity ?? 1.0, 0.4, 2.0).toFixed(2)),
    floorAlbedoOklch: rawInput.floorAlbedoOklch ?? DEFAULT_FLOOR_ALBEDO_OKLCH,
    skyFillRatio: Number(clamp(rawInput.skyFillRatio ?? 0.34, 0.1, 0.8).toFixed(2)),
    celStepCount: rawInput.celStepCount ?? 3,
    shadowSoftness: Number(clamp(rawInput.shadowSoftness ?? 0.16, 0.05, 0.5).toFixed(2)),
  });

  const azRad = input.azimuthDeg * DEG_TO_RAD;
  const elRad = input.elevationDeg * DEG_TO_RAD;
  const lx = Math.cos(elRad) * Math.cos(azRad);
  const ly = Math.sin(elRad);
  const lz = Math.cos(elRad) * Math.sin(azRad);
  const lightDirection3d: Vec3 = Object.freeze([
    Number(lx.toFixed(5)),
    Number(ly.toFixed(5)),
    Number(lz.toFixed(5)),
  ]);
  const dir2dLen = Math.max(Math.hypot(lx, ly), 1e-5);
  const lightDirection2d: readonly [number, number] = Object.freeze([
    Number((lx / dir2dLen).toFixed(5)),
    Number((ly / dir2dLen).toFixed(5)),
  ]);

  const projectedShadowAngleDeg = normalizeAngleDeg(input.azimuthDeg + 180);
  const projectedShadowLengthRatio = Number(
    clamp(1 / Math.max(Math.tan(elRad), 0.14), 0.09, 5.5).toFixed(3),
  );

  const [keyR, keyG, keyB] = kelvinToLinearRgb(input.colorTempKelvin);
  const rawKeyOklch = linearRgbToOklch(keyR, keyG, keyB);
  const keyLightOklch: OklchColor = Object.freeze({
    l: Number(clamp(0.76 + (input.keyIntensity - 0.8) * 0.14, 0.62, 0.96).toFixed(4)),
    c: Number(clamp(rawKeyOklch.c * 1.15, 0.008, 0.22).toFixed(4)),
    h: rawKeyOklch.h,
  });

  const coolShadowHue =
    input.colorTempKelvin < 5000
      ? normalizeAngleDeg(256 - (5000 - input.colorTempKelvin) * 0.006)
      : normalizeAngleDeg(242 + (input.colorTempKelvin - 5000) * 0.004);
  const shadowTintOklch: OklchColor = Object.freeze({
    l: Number(clamp(0.32 + input.skyFillRatio * 0.22, 0.22, 0.56).toFixed(4)),
    c: Number(clamp(0.045 + rawKeyOklch.c * 0.45, 0.035, 0.12).toFixed(4)),
    h: coolShadowHue,
  });

  const ambientSkyOklch: OklchColor = Object.freeze({
    l: Number(clamp(0.52 + input.skyFillRatio * 0.32, 0.36, 0.86).toFixed(4)),
    c: Number(clamp(0.032 + (input.colorTempKelvin > 6000 ? 0.035 : 0.015), 0.02, 0.11).toFixed(4)),
    h: input.colorTempKelvin < 4200 ? normalizeAngleDeg(keyLightOklch.h + 20) : 236,
  });

  const lowAngleBoost = clamp(1 - (input.elevationDeg - 10) / 75, 0, 1);
  const rimLightOklch: OklchColor = Object.freeze({
    l: Number(clamp(0.86 + lowAngleBoost * 0.09, 0.82, 0.97).toFixed(4)),
    c: Number(clamp(keyLightOklch.c * (1.1 + lowAngleBoost * 0.35), 0.015, 0.24).toFixed(4)),
    h: keyLightOklch.h,
  });

  const [floorR, floorG, floorB] = oklchToLinearRgb(input.floorAlbedoOklch);
  const bounceGain = 0.52 * Math.max(0.28, Math.sin(elRad)) * input.keyIntensity;
  const bounceLinear = linearRgbToOklch(
    keyR * floorR * bounceGain,
    keyG * floorG * bounceGain,
    keyB * floorB * bounceGain,
  );
  const floorBounceOklch: OklchColor = Object.freeze({
    l: Number(clamp(bounceLinear.l + 0.18, 0.34, 0.78).toFixed(4)),
    c: Number(clamp(Math.max(bounceLinear.c, input.floorAlbedoOklch.c * 0.75), 0.02, 0.16).toFixed(4)),
    h: bounceLinear.c > 0.01 ? bounceLinear.h : input.floorAlbedoOklch.h,
  });

  const bandSpecs: readonly {
    readonly id: ToonCelRampBand["id"];
    readonly labelKo: string;
    readonly threshold: number;
    readonly mixShadow: number;
    readonly mixKey: number;
  }[] =
    input.celStepCount === 2
      ? [
          { id: "shadow", labelKo: "1단 그림자", threshold: -0.1, mixShadow: 0.78, mixKey: 0.15 },
          { id: "lit", labelKo: "2단 주광면", threshold: 0.25, mixShadow: 0.08, mixKey: 0.88 },
        ]
      : input.celStepCount === 4
        ? [
            { id: "shadow", labelKo: "1단 심층 음영", threshold: -0.2, mixShadow: 0.86, mixKey: 0.1 },
            { id: "midtone", labelKo: "2단 반음영", threshold: 0.12, mixShadow: 0.42, mixKey: 0.52 },
            { id: "lit", labelKo: "3단 주광면", threshold: 0.48, mixShadow: 0.1, mixKey: 0.84 },
            { id: "highlight", labelKo: "4단 하이라이트", threshold: 0.78, mixShadow: 0.0, mixKey: 1.0 },
          ]
        : [
            { id: "shadow", labelKo: "1단 그림자", threshold: -0.15, mixShadow: 0.82, mixKey: 0.12 },
            { id: "midtone", labelKo: "2단 중간톤", threshold: 0.22, mixShadow: 0.32, mixKey: 0.62 },
            { id: "lit", labelKo: "3단 주광면", threshold: 0.62, mixShadow: 0.04, mixKey: 0.94 },
          ];

  const celRamp: ToonCelRampBand[] = bandSpecs.map((spec) => {
    const blended = blendOklch(shadowTintOklch, keyLightOklch, spec.mixKey);
    const adjusted: OklchColor = Object.freeze({
      l: Number(
        clamp(
          shadowTintOklch.l * spec.mixShadow + keyLightOklch.l * (1 - spec.mixShadow * 0.72),
          0.22,
          0.96,
        ).toFixed(4),
      ),
      c: blended.c,
      h: blended.h,
    });
    return Object.freeze({
      id: spec.id,
      labelKo: spec.labelKo,
      ndotlThreshold: spec.threshold,
      colorOklch: adjusted,
      cssOklch: formatOklch(adjusted),
    });
  });

  const colliders = options.colliders ?? createDefaultHumanoidCapsuleColliders();
  const gridSize = Math.round(clamp(options.gridSize ?? 18, 8, 48));
  const shadowK = 14 - 11 * clamp(input.shadowSoftness, 0, 1);
  const sdfSamples: SdfRaymarchSample[] = [];

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const u = (x + 0.5) / gridSize;
      const v = (y + 0.5) / gridSize;
      const ro: Vec3 = [(u - 0.5) * 0.56, 1.78 - v * 0.78, 0.62];
      let t = 0;
      let hit = false;
      for (let step = 0; step < 24; step += 1) {
        const d = mapCharacterSdfCpu([ro[0], ro[1], ro[2] - t], colliders);
        if (d < 0.002) {
          hit = true;
          break;
        }
        t += d;
        if (t > 1.25) break;
      }

      if (!hit) {
        sdfSamples.push(
          Object.freeze({
            u: Number(u.toFixed(4)),
            v: Number(v.toFixed(4)),
            hit: false,
            ndotl: 0,
            sdfShadow: 1,
            sdfAo: 1,
            celBandIndex: 0,
            rimFactor: 0,
            bounceFactor: 0,
            finalColorOklch: ambientSkyOklch,
          }),
        );
        continue;
      }

      const p: Vec3 = [ro[0], ro[1], ro[2] - t];
      const n = calcSdfNormalCpu(p, colliders);
      const ndotl = clamp(n[0] * lx + n[1] * ly + n[2] * lz, -1, 1);
      const sdfShadow = marchSoftShadowCpu(
        [p[0] + n[0] * 0.004, p[1] + n[1] * 0.004, p[2] + n[2] * 0.004],
        lightDirection3d,
        shadowK,
        colliders,
      );
      const sdfAo = calcSdfAoCpu(p, n, colliders);
      const litTerm = clamp((ndotl * 0.5 + 0.5) * sdfShadow * sdfAo, 0, 1);
      const celBandIndex = Math.min(celRamp.length - 1, Math.floor(litTerm * celRamp.length));
      const fresnel = Math.pow(1 - Math.max(n[2], 0), 2.4);
      const rimFactor = clamp(fresnel * clamp(ndotl + 0.45, 0, 1) * sdfShadow, 0, 1);
      const bounceFactor = clamp(Math.max(0, -n[1]) * Math.max(0.25, Math.sin(elRad)), 0, 1);

      const bandColor = celRamp[celBandIndex]?.colorOklch ?? keyLightOklch;
      const finalColorOklch = blendOklch(
        blendOklch(bandColor, floorBounceOklch, bounceFactor * 0.45),
        rimLightOklch,
        rimFactor * 0.55,
      );

      sdfSamples.push(
        Object.freeze({
          u: Number(u.toFixed(4)),
          v: Number(v.toFixed(4)),
          hit: true,
          ndotl: Number(ndotl.toFixed(4)),
          sdfShadow: Number(sdfShadow.toFixed(4)),
          sdfAo: Number(sdfAo.toFixed(4)),
          celBandIndex,
          rimFactor: Number(rimFactor.toFixed(4)),
          bounceFactor: Number(bounceFactor.toFixed(4)),
          finalColorOklch,
        }),
      );
    }
  }

  const cut2dLightMetadata: Cut2dLightMetadata = Object.freeze({
    azimuthDeg: input.azimuthDeg,
    elevationDeg: input.elevationDeg,
    colorTempKelvin: input.colorTempKelvin,
    shadowAngleDeg: projectedShadowAngleDeg,
    shadowLengthRatio: projectedShadowLengthRatio,
    skyZenithOklch: Object.freeze({
      l: Number(clamp(ambientSkyOklch.l - 0.12, 0.18, 0.85).toFixed(4)),
      c: ambientSkyOklch.c,
      h: ambientSkyOklch.h,
    }),
    skyHorizonOklch: blendOklch(ambientSkyOklch, keyLightOklch, 0.52),
    groundLitOklch: blendOklch(input.floorAlbedoOklch, keyLightOklch, 0.38),
    groundShadowOklch: blendOklch(input.floorAlbedoOklch, shadowTintOklch, 0.65),
  });

  const vrmShaderUniforms: VrmToonShaderUniforms = Object.freeze({
    lightDir: lightDirection3d,
    azimuthDeg: input.azimuthDeg,
    elevationDeg: input.elevationDeg,
    colorTempKelvin: input.colorTempKelvin,
    projectedShadowAngleDeg,
    projectedShadowLengthRatio,
    keyLightOklch,
    rimLightOklch,
    floorBounceOklch,
    shadowTintOklch,
    celThresholds: Object.freeze(celRamp.map((b) => b.ndotlThreshold)),
  });

  const azimuthMismatchDeg = angularDiffDeg(
    cut2dLightMetadata.azimuthDeg,
    vrmShaderUniforms.azimuthDeg,
  );
  const elevationMismatchDeg = Number(
    Math.abs(cut2dLightMetadata.elevationDeg - vrmShaderUniforms.elevationDeg).toFixed(4),
  );
  const kelvinMismatchK = Math.abs(
    cut2dLightMetadata.colorTempKelvin - vrmShaderUniforms.colorTempKelvin,
  );
  const shadowOppositionErrorDeg = angularDiffDeg(
    normalizeAngleDeg(vrmShaderUniforms.azimuthDeg + 180),
    vrmShaderUniforms.projectedShadowAngleDeg,
  );

  let monotonicPenalty = 0;
  for (let i = 1; i < celRamp.length; i += 1) {
    if ((celRamp[i]?.colorOklch.l ?? 0) < (celRamp[i - 1]?.colorOklch.l ?? 0)) {
      monotonicPenalty += 8;
    }
  }
  const harmonyScore = Math.round(
    clamp(
      100 -
        azimuthMismatchDeg * 2 -
        elevationMismatchDeg * 2 -
        kelvinMismatchK * 0.05 -
        shadowOppositionErrorDeg * 2 -
        monotonicPenalty,
      0,
      100,
    ),
  );

  const hasWebGpu =
    typeof navigator !== "undefined" &&
    "gpu" in navigator &&
    Boolean((navigator as { gpu?: unknown }).gpu);

  return Object.freeze({
    input,
    lightDirection3d,
    lightDirection2d,
    projectedShadowAngleDeg,
    projectedShadowLengthRatio,
    keyLightOklch,
    keyLightCss: formatOklch(keyLightOklch),
    ambientSkyOklch,
    ambientSkyCss: formatOklch(ambientSkyOklch),
    rimLightOklch,
    rimLightCss: formatOklch(rimLightOklch),
    floorBounceOklch,
    floorBounceCss: formatOklch(floorBounceOklch),
    shadowTintOklch,
    shadowTintCss: formatOklch(shadowTintOklch),
    celRamp: Object.freeze(celRamp),
    cut2dLightMetadata,
    vrmShaderUniforms,
    alignmentMetrics: Object.freeze({
      azimuthMismatchDeg,
      elevationMismatchDeg,
      kelvinMismatchK,
      shadowOppositionErrorDeg,
      harmonyScore,
    }),
    sdfFieldWidth: gridSize,
    sdfFieldHeight: gridSize,
    sdfSamples: Object.freeze(sdfSamples),
    bakeHashHex: computeBakeHashHex(input, sdfSamples),
    backend: hasWebGpu ? "webgpu-compute-ready" : "cpu-sdf-fallback",
  });
}

/**
 * WebGPU SDF 광원 베이크 uniform 버퍼(Float32Array 24요소 = 96바이트)를 패킹한다.
 */
export function packToonLightingUniformBuffer(
  result: Unified2d3dLightRigResult,
  colliderCount = 5,
): Float32Array {
  const buf = new Float32Array(24);
  const u32 = new Uint32Array(buf.buffer);
  u32[0] = result.sdfFieldWidth;
  u32[1] = result.sdfFieldHeight;
  u32[2] = Math.max(1, Math.floor(colliderCount));
  u32[3] = result.input.celStepCount;

  buf[4] = result.lightDirection3d[0];
  buf[5] = result.lightDirection3d[1];
  buf[6] = result.lightDirection3d[2];
  buf[7] = result.input.elevationDeg * DEG_TO_RAD;

  buf[8] = result.keyLightOklch.l;
  buf[9] = result.keyLightOklch.c;
  buf[10] = result.keyLightOklch.h;
  buf[11] = 1;

  buf[12] = result.floorBounceOklch.l;
  buf[13] = result.floorBounceOklch.c;
  buf[14] = result.floorBounceOklch.h;
  buf[15] = 1;

  buf[16] = result.rimLightOklch.l;
  buf[17] = result.rimLightOklch.c;
  buf[18] = result.rimLightOklch.h;
  buf[19] = 1;

  buf[20] = result.input.shadowSoftness;
  buf[21] = result.input.skyFillRatio;
  buf[22] = result.input.keyIntensity;
  buf[23] = 0;
  return buf;
}
