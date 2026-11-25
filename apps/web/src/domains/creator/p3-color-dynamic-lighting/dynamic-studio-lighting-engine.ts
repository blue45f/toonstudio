/**
 * Wave 40B — 실시간 다중 동적 조명(Dynamic Studio Lighting) 엔진 & WebGPU WGSL 셰이더.
 *
 * - 최대 4개 실시간 광원(태양 방향광 · 포인트 램프 · 역광 림라이트 · 환경 바운스).
 * - 2200K~10000K Planckian 근사 색온도 RGB 변환(`kelvinToRgb`).
 * - 볼류메트릭 빛줄기(god-ray cone falloff + 깊이 버퍼 차폐) + 피부 SSS 산란 + 2D 노멀/깊이 RGBA 리라이팅.
 * - 5종 시네마틱 웹툰 조명 프리셋 + WebGPU WGSL 컴퓨트 셰이더 소스.
 */

import { assertFloatChannel, assertSurfaceGeometry } from "./dynamic-surface-contract";

import {
  formatOklchCss,
  linearChannelToSrgb,
  srgbChannelToLinear,
  srgbToOklch,
  type RgbTuple,
} from "./p3-color-gamut-engine";

export const MAX_DYNAMIC_LIGHTS = 4 as const;
export const MIN_KELVIN = 2200 as const;
export const MAX_KELVIN = 10000 as const;

export type DynamicLightKind =
  | "sun-directional"
  | "point-lamp"
  | "rim-backlight"
  | "ambient-bounce";

export type CinematicLightingPresetId =
  | "seoul-golden-sunset"
  | "rainy-neon-alley"
  | "moonlit-window"
  | "afternoon-classroom-backlight"
  | "magic-citadel-torch";

export interface Vec3Tuple { readonly x: number; readonly y: number; readonly z: number; }

export interface DynamicLightSource {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly kind: DynamicLightKind;
  readonly enabled: boolean;
  readonly kelvin: number;
  readonly gelTint?: RgbTuple;
  readonly intensity: number;
  readonly position: Vec3Tuple;
  readonly direction: Vec3Tuple;
  readonly radius: number;
  readonly volumetricStrength: number;
  readonly volumetricConeDeg: number;
}

export interface DynamicLightingSceneConfig {
  readonly presetId: CinematicLightingPresetId;
  readonly lights: readonly DynamicLightSource[];
  readonly sssStrength: number;
  readonly volumetricGlobalGain: number;
  readonly exposure: number;
  readonly celSoftness: number;
}

export interface CinematicLightingPreset {
  readonly id: CinematicLightingPresetId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly moodKo: string;
  readonly moodEn: string;
  readonly config: DynamicLightingSceneConfig;
}

export interface KelvinColorResult {
  readonly kelvin: number;
  readonly srgb: RgbTuple;
  readonly linear: RgbTuple;
  readonly oklchCss: string;
}

export interface VolumetricGodRayInput {
  readonly u: number;
  readonly v: number;
  readonly pixelDepth: number;
  readonly light: DynamicLightSource;
  readonly depthBuffer?: Float32Array;
  readonly width?: number;
  readonly height?: number;
}

export interface SkinSubsurfaceInput {
  readonly normalDotLight: number;
  readonly viewDotNormal: number;
  readonly skinMask: number;
  readonly lightLinearRgb: RgbTuple;
  readonly lightIntensity: number;
  readonly sssStrength: number;
}

export interface DynamicSurfaceBuffers {
  readonly width: number;
  readonly height: number;
  readonly albedoRgba: Uint8ClampedArray;
  readonly normalRgb: Float32Array;
  readonly depthBuffer: Float32Array;
  readonly skinMask: Float32Array;
}

export interface RelightMetrics {
  readonly activeLightCount: number;
  readonly averageLuminance: number;
  readonly peakLuminance: number;
  readonly rimCoverageRatio: number;
  readonly sssAffectedPixels: number;
  readonly volumetricEnergy: number;
  readonly warmToCoolRatio: number;
  readonly renderTimeMs: number;
}

export interface DynamicRelightResult {
  readonly backend: "cpu";
  readonly gpuExecuted: false;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly metrics: RelightMetrics;
  readonly previewMosaic: { readonly cols: number; readonly rows: number; readonly cells: readonly string[] };
}

export interface WgslLightingContractCheck {
  readonly validationKind: "text-only";
  readonly compiled: false;
  readonly valid: boolean;
  readonly hasFourLightArray: boolean;
  readonly hasComputeEntry: boolean;
  readonly hasVolumetricGodRay: boolean;
  readonly hasSkinSubsurface: boolean;
  readonly hasAcesToneMap: boolean;
  readonly lineCount: number;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0;
  if (Math.abs(span) < 1e-8) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / span, 0, 1);
  return t * t * (3 - 2 * t);
}

function normalize3(v: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v.x, v.y, v.z);
  return len < 1e-8 ? { x: 0, y: 0, z: 1 } : { x: v.x / len, y: v.y / len, z: v.z / len };
}

function acesToneMapChannel(x: number): number {
  const v = Math.max(0, x);
  return clamp((v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14), 0, 1);
}

/** 2200K~10000K 색온도를 Planckian 흑체 복사 근사 곡선으로 sRGB·선형 RGB·OKLCH로 변환한다. */
export function kelvinToRgb(kelvinInput: number): KelvinColorResult {
  const kelvin = clamp(kelvinInput, MIN_KELVIN, MAX_KELVIN);
  const temp = kelvin / 100;
  let r255: number;
  let g255: number;
  let b255: number;

  if (temp <= 66) {
    r255 = 255;
    g255 = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b255 = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r255 = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g255 = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    b255 = 255;
  }

  const srgb: RgbTuple = {
    r: clamp(r255 / 255, 0, 1),
    g: clamp(g255 / 255, 0, 1),
    b: clamp(b255 / 255, 0, 1),
  };
  const linear: RgbTuple = {
    r: srgbChannelToLinear(srgb.r),
    g: srgbChannelToLinear(srgb.g),
    b: srgbChannelToLinear(srgb.b),
  };
  return { kelvin, srgb, linear, oklchCss: formatOklchCss(srgbToOklch(srgb)) };
}

function resolveLightLinearColor(light: DynamicLightSource): RgbTuple {
  const base = kelvinToRgb(light.kelvin).linear;
  if (!light.gelTint) return base;
  return {
    r: base.r * clamp(light.gelTint.r, 0, 2),
    g: base.g * clamp(light.gelTint.g, 0, 2),
    b: base.b * clamp(light.gelTint.b, 0, 2),
  };
}

/** 볼류메트릭 빛줄기(God-Ray Cone Falloff + 스크린 공간 깊이 차폐) 기여도를 계산한다. */
export function evaluateVolumetricGodRay(input: VolumetricGodRayInput): number {
  const { u, v, pixelDepth, light, depthBuffer, width, height } = input;
  if (!light.enabled || light.volumetricStrength <= 1e-4 || light.intensity <= 1e-4) return 0;

  const dx = u - light.position.x;
  const dy = v - light.position.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-5) return clamp(light.volumetricStrength * 0.65, 0, 1.5);

  const axisLen = Math.hypot(light.direction.x, light.direction.y);
  const axisX = axisLen > 1e-6 ? light.direction.x / axisLen : 0;
  const axisY = axisLen > 1e-6 ? light.direction.y / axisLen : 1;
  const cosTheta = (dx / dist) * axisX + (dy / dist) * axisY;
  const coneRad = (clamp(light.volumetricConeDeg, 8, 75) * Math.PI) / 180;
  const outerCos = Math.cos(coneRad);
  if (cosTheta <= outerCos) return 0;

  const angularFalloff = smoothstep(outerCos, Math.cos(coneRad * 0.52), cosTheta);
  const radialFalloff = 1 / (1 + dist * dist * (1.8 / Math.max(0.15, light.radius)));

  let transmittance = 1;
  if (depthBuffer && width && height && width > 1 && height > 1) {
    let occlusion = 0;
    for (let s = 1; s <= 5; s += 1) {
      const t = s / 6;
      const su = u - dx * t;
      const sv = v - dy * t;
      if (su >= 0 && su <= 1 && sv >= 0 && sv <= 1) {
        const ix = clamp(Math.round(su * (width - 1)), 0, width - 1);
        const iy = clamp(Math.round(sv * (height - 1)), 0, height - 1);
        if ((depthBuffer[iy * width + ix] ?? 0) > pixelDepth + 0.14) occlusion += 0.34;
      }
    }
    transmittance = Math.exp(-occlusion);
  }

  return clamp(light.volumetricStrength * angularFalloff * radialFalloff * transmittance * (1 - pixelDepth * 0.42), 0, 1.8);
}

/** 피부 서브서피스 산란(SSS Warm Cheek Tint) 선형 RGB 기여도를 계산한다. */
export function evaluateSkinSubsurfaceScattering(input: SkinSubsurfaceInput): RgbTuple {
  const skinMask = clamp(input.skinMask, 0, 1);
  const sssStrength = clamp(input.sssStrength, 0, 1.5);
  if (skinMask <= 1e-4 || sssStrength <= 1e-4 || input.lightIntensity <= 1e-4) {
    return { r: 0, g: 0, b: 0 };
  }
  const wrapped = clamp((input.normalDotLight + 0.55) / 1.55, 0, 1);
  const terminatorBand = Math.max(0, wrapped - Math.max(0, input.normalDotLight));
  const grazingBack = Math.pow(clamp(1 - Math.abs(input.normalDotLight), 0, 1), 2.1) * 0.45;
  const viewBoost = 0.65 + 0.35 * (1 - clamp(input.viewDotNormal, 0, 1));
  const scatter = (terminatorBand * 1.15 + grazingBack) * viewBoost * skinMask * sssStrength * input.lightIntensity;
  return {
    r: scatter * input.lightLinearRgb.r * 1.0,
    g: scatter * input.lightLinearRgb.g * 0.36,
    b: scatter * input.lightLinearRgb.b * 0.2,
  };
}

/** 실시간 리라이팅 테스트·프리뷰용 2.5D 웹툰 캐릭터(얼굴·볼 SSS·헤어·어깨·창틀) 표면 버퍼를 합성한다. */
export function createDemoCharacterSurfaceBuffers(width = 64, height = 48): DynamicSurfaceBuffers {
  assertSurfaceGeometry(width, height);
  const safeW = width;
  const safeH = height;
  const pixelCount = safeW * safeH;
  const albedoRgba = new Uint8ClampedArray(pixelCount * 4);
  const normalRgb = new Float32Array(pixelCount * 3);
  const depthBuffer = new Float32Array(pixelCount);
  const skinMask = new Float32Array(pixelCount);

  for (let y = 0; y < safeH; y += 1) {
    const v = safeH > 1 ? y / (safeH - 1) : 0;
    for (let x = 0; x < safeW; x += 1) {
      const u = safeW > 1 ? x / (safeW - 1) : 0;
      const idx = y * safeW + x;
      const p4 = idx * 4;
      const p3 = idx * 3;

      let r = 0.26;
      let g = 0.27;
      let b = 0.34;
      let nx = 0;
      let ny = 0;
      let nz = 1;
      let depth = 0.08;
      let skin = 0;

      if (u > 0.08 && u < 0.38 && v > 0.08 && v < 0.56) {
        r = 0.58;
        g = 0.63;
        b = 0.72;
        depth = 0.02;
      }

      const sx = (u - 0.52) / 0.28;
      const sy = (v - 0.88) / 0.3;
      if (sx * sx + sy * sy <= 1) {
        const sz = Math.sqrt(Math.max(0.02, 1 - sx * sx - sy * sy));
        const norm = normalize3({ x: sx * 0.85, y: sy * 0.65, z: sz });
        nx = norm.x;
        ny = norm.y;
        nz = norm.z;
        depth = 0.62 + sz * 0.16;
        r = 0.24;
        g = 0.3;
        b = 0.44;
      }

      const hx = (u - 0.52) / 0.17;
      const hy = (v - 0.44) / 0.22;
      if (hx * hx + hy * hy <= 1) {
        const hz = Math.sqrt(Math.max(0.02, 1 - hx * hx - hy * hy));
        const norm = normalize3({ x: hx, y: hy, z: hz });
        nx = norm.x;
        ny = norm.y;
        nz = norm.z;
        depth = 0.78 + hz * 0.22;
        if (hy < -0.28 || (hy < 0.12 && Math.abs(hx) > 0.76)) {
          r = 0.16;
          g = 0.17;
          b = 0.24;
          skin = 0;
        } else {
          r = 0.92;
          g = 0.77;
          b = 0.69;
          const leftCheek = Math.exp(-((hx + 0.46) ** 2 + (hy - 0.22) ** 2) / 0.16);
          const rightCheek = Math.exp(-((hx - 0.46) ** 2 + (hy - 0.22) ** 2) / 0.16);
          skin = clamp(0.45 + 0.55 * Math.max(leftCheek, rightCheek), 0, 1);
        }
      }

      albedoRgba[p4] = Math.round(clamp(r, 0, 1) * 255);
      albedoRgba[p4 + 1] = Math.round(clamp(g, 0, 1) * 255);
      albedoRgba[p4 + 2] = Math.round(clamp(b, 0, 1) * 255);
      albedoRgba[p4 + 3] = 255;
      normalRgb[p3] = nx;
      normalRgb[p3 + 1] = ny;
      normalRgb[p3 + 2] = nz;
      depthBuffer[idx] = depth;
      skinMask[idx] = skin;
    }
  }
  return { width: safeW, height: safeH, albedoRgba, normalRgb, depthBuffer, skinMask };
}

/** 2D 버퍼에 최대 4광원을 CPU로 계산한다. 실제 3D 씬·원고 반영이나 GPU 실행 경로는 없다. */
export function renderDynamicLitBuffer(
  surface: DynamicSurfaceBuffers,
  config: DynamicLightingSceneConfig,
): DynamicRelightResult {
  const startMs = typeof performance !== "undefined" ? performance.now() : 0;
  const { width, height, albedoRgba, normalRgb, depthBuffer, skinMask } = surface;
  const pixelCount = assertSurfaceGeometry(width, height);
  if (!(albedoRgba instanceof Uint8ClampedArray) || albedoRgba.length !== pixelCount * 4) {
    throw new RangeError("표면 RGBA 길이는 width × height × 4와 같아야 합니다.");
  }
  assertFloatChannel(normalRgb, pixelCount * 3, -1, 1);
  assertFloatChannel(depthBuffer, pixelCount, 0, 1);
  assertFloatChannel(skinMask, pixelCount, 0, 1);
  const outRgba = new Uint8ClampedArray(pixelCount * 4);

  const activeLights = config.lights
    .slice(0, MAX_DYNAMIC_LIGHTS)
    .filter((l) => l.enabled && l.intensity > 1e-4)
    .map((light) => ({
      light,
      linearColor: resolveLightLinearColor(light),
      unitDir: normalize3(light.direction),
    }));

  const exposure = clamp(config.exposure, 0.5, 2.2);
  const celSoftness = clamp(config.celSoftness, 0.05, 1.0);
  const sssStrength = clamp(config.sssStrength, 0, 1.5);
  const volumetricGain = clamp(config.volumetricGlobalGain, 0, 2.0);

  let luminanceSum = 0;
  let peakLuminance = 0;
  let rimHitCount = 0;
  let sssAffectedPixels = 0;
  let volumetricEnergySum = 0;
  let totalRed = 0;
  let totalBlue = 0;

  for (let y = 0; y < height; y += 1) {
    const v = height > 1 ? y / (height - 1) : 0;
    for (let x = 0; x < width; x += 1) {
      const u = width > 1 ? x / (width - 1) : 0;
      const idx = y * width + x;
      const p4 = idx * 4;
      const p3 = idx * 3;

      const baseR = srgbChannelToLinear((albedoRgba[p4] ?? 0) / 255);
      const baseG = srgbChannelToLinear((albedoRgba[p4 + 1] ?? 0) / 255);
      const baseB = srgbChannelToLinear((albedoRgba[p4 + 2] ?? 0) / 255);
      const nx = normalRgb[p3] ?? 0;
      const ny = normalRgb[p3 + 1] ?? 0;
      const nz = normalRgb[p3 + 2] ?? 1;
      const depth = depthBuffer[idx] ?? 0;
      const skin = skinMask[idx] ?? 0;
      const fgMask = smoothstep(0.25, 0.65, depth);

      let accR = baseR * 0.035;
      let accG = baseG * 0.035;
      let accB = baseB * 0.04;
      let pixelRim = 0;
      let pixelSssEnergy = 0;

      for (const { light, linearColor, unitDir } of activeLights) {
        const intensity = clamp(light.intensity, 0, 3);
        if (light.kind === "ambient-bounce") {
          const bounce = (0.45 + 0.55 * clamp(0.5 - ny * 0.5, 0, 1)) * intensity * 0.55;
          accR += baseR * linearColor.r * bounce;
          accG += baseG * linearColor.g * bounce;
          accB += baseB * linearColor.b * bounce;
          continue;
        }

        let lx = -unitDir.x;
        let ly = -unitDir.y;
        let lz = Math.max(0.15, unitDir.z);
        let attenuation = 1;

        if (light.kind === "point-lamp") {
          const dx = light.position.x - u;
          const dy = light.position.y - v;
          const dz = light.position.z - depth * 0.45;
          const dist = Math.hypot(dx, dy, dz);
          const safeDist = Math.max(0.05, dist);
          lx = dx / safeDist;
          ly = dy / safeDist;
          lz = dz / safeDist;
          const rad = Math.max(0.12, light.radius);
          attenuation = 1 / (1 + (dist * dist) / (rad * rad));
        } else {
          const normL = normalize3({ x: lx, y: ly, z: lz });
          lx = normL.x;
          ly = normL.y;
          lz = normL.z;
        }

        const nDotL = nx * lx + ny * ly + nz * lz;
        if (light.kind === "rim-backlight") {
          const fresnel = Math.pow(clamp(1 - Math.max(0, nz), 0, 1), 2.35);
          const rim = fresnel * smoothstep(-0.35, 0.85, nx * lx + ny * ly + 0.35) * fgMask * intensity * 1.45;
          pixelRim += rim;
          accR += (baseR * 0.35 + 0.65) * linearColor.r * rim;
          accG += (baseG * 0.35 + 0.65) * linearColor.g * rim;
          accB += (baseB * 0.35 + 0.65) * linearColor.b * rim;
        } else {
          const diff = smoothstep(-0.08 * celSoftness, 0.12 + 0.72 * celSoftness, nDotL) * intensity * attenuation;
          const halfVec = normalize3({ x: lx, y: ly, z: lz + 1 });
          const spec = Math.pow(Math.max(0, nx * halfVec.x + ny * halfVec.y + nz * halfVec.z), 28) * 0.22 * diff * fgMask;
          accR += (baseR * diff + spec) * linearColor.r;
          accG += (baseG * diff + spec) * linearColor.g;
          accB += (baseB * diff + spec) * linearColor.b;
        }

        if (skin > 1e-4 && sssStrength > 1e-4) {
          const sss = evaluateSkinSubsurfaceScattering({
            normalDotLight: nDotL,
            viewDotNormal: nz,
            skinMask: skin,
            lightLinearRgb: linearColor,
            lightIntensity: intensity * attenuation,
            sssStrength,
          });
          accR += baseR * sss.r;
          accG += baseG * sss.g;
          accB += baseB * sss.b;
          pixelSssEnergy += sss.r + sss.g + sss.b;
        }

        if (light.volumetricStrength > 1e-4 && volumetricGain > 1e-4) {
          const ray =
            evaluateVolumetricGodRay({ u, v, pixelDepth: depth, light, depthBuffer, width, height }) *
            volumetricGain *
            intensity *
            0.34;
          accR += linearColor.r * ray;
          accG += linearColor.g * ray;
          accB += linearColor.b * ray;
          volumetricEnergySum += ray;
        }
      }

      const mappedR = acesToneMapChannel(accR * exposure);
      const mappedG = acesToneMapChannel(accG * exposure);
      const mappedB = acesToneMapChannel(accB * exposure);

      outRgba[p4] = Math.round(clamp(linearChannelToSrgb(mappedR), 0, 1) * 255);
      outRgba[p4 + 1] = Math.round(clamp(linearChannelToSrgb(mappedG), 0, 1) * 255);
      outRgba[p4 + 2] = Math.round(clamp(linearChannelToSrgb(mappedB), 0, 1) * 255);
      outRgba[p4 + 3] = albedoRgba[p4 + 3] ?? 255;

      const lum = 0.2126 * mappedR + 0.7152 * mappedG + 0.0722 * mappedB;
      luminanceSum += lum;
      if (lum > peakLuminance) peakLuminance = lum;
      if (pixelRim > 0.16) rimHitCount += 1;
      if (pixelSssEnergy > 0.03) sssAffectedPixels += 1;
      totalRed += mappedR;
      totalBlue += mappedB;
    }
  }

  const cols = 16;
  const rows = 12;
  const cells: string[] = [];
  for (let ry = 0; ry < rows; ry += 1) {
    const sy = Math.min(height - 1, Math.floor(((ry + 0.5) / rows) * height));
    for (let rx = 0; rx < cols; rx += 1) {
      const sx = Math.min(width - 1, Math.floor(((rx + 0.5) / cols) * width));
      const p4 = (sy * width + sx) * 4;
      cells.push(formatOklchCss(srgbToOklch({ r: (outRgba[p4] ?? 0) / 255, g: (outRgba[p4 + 1] ?? 0) / 255, b: (outRgba[p4 + 2] ?? 0) / 255 })));
    }
  }
  const endMs = typeof performance !== "undefined" ? performance.now() : startMs;

  return {
    backend: "cpu",
    gpuExecuted: false,
    width,
    height,
    rgba: outRgba,
    metrics: {
      activeLightCount: activeLights.length,
      averageLuminance: pixelCount > 0 ? luminanceSum / pixelCount : 0,
      peakLuminance,
      rimCoverageRatio: pixelCount > 0 ? rimHitCount / pixelCount : 0,
      sssAffectedPixels,
      volumetricEnergy: pixelCount > 0 ? volumetricEnergySum / pixelCount : 0,
      warmToCoolRatio: totalBlue > 1e-6 ? totalRed / totalBlue : 1,
      renderTimeMs: Math.max(0, endMs - startMs),
    },
    previewMosaic: { cols, rows, cells },
  };
}

function makeLight(
  id: string,
  labelKo: string,
  labelEn: string,
  kind: DynamicLightKind,
  enabled: boolean,
  kelvin: number,
  intensity: number,
  position: Vec3Tuple,
  direction: Vec3Tuple,
  radius: number,
  volumetricStrength: number,
  volumetricConeDeg: number,
  gelTint?: RgbTuple,
): DynamicLightSource {
  return {
    id, labelKo, labelEn, kind, enabled, kelvin, intensity,
    position, direction, radius, volumetricStrength, volumetricConeDeg,
    ...(gelTint ? { gelTint } : {}),
  };
}

/** 5종 시네마틱 웹툰 조명 프리셋. */
export const DYNAMIC_LIGHTING_PRESETS: readonly CinematicLightingPreset[] = [
  {
    id: "seoul-golden-sunset",
    nameKo: "서울 황금 노을",
    nameEn: "Seoul Golden Sunset",
    moodKo: "서쪽 창가로 낮게 깔리는 3100K 황금빛 방향광과 감빛 역광 림라이트",
    moodEn: "Low 3100K golden directional sun with warm sunset rim",
    config: {
      presetId: "seoul-golden-sunset", sssStrength: 0.92, volumetricGlobalGain: 1.05, exposure: 1.15, celSoftness: 0.42,
      lights: [
        makeLight("sunset-sun", "노을 태양 방향광", "Sunset Key Sun", "sun-directional", true, 3100, 1.45, { x: 0.14, y: 0.18, z: 0.8 }, { x: 0.72, y: 0.42, z: 0.55 }, 0.9, 0.72, 34),
        makeLight("sunset-rim", "감빛 역광 림", "Persimmon Rim", "rim-backlight", true, 2550, 1.35, { x: 0.18, y: 0.25, z: 0.4 }, { x: 0.8, y: 0.25, z: 0.35 }, 0.75, 0.28, 28),
        makeLight("sunset-bounce", "보랏빛 황혼 바운스", "Twilight Sky Bounce", "ambient-bounce", true, 6800, 0.52, { x: 0.85, y: 0.15, z: 1.0 }, { x: -0.3, y: 0.8, z: 0.5 }, 1.2, 0, 45, { r: 0.95, g: 0.82, b: 1.08 }),
        makeLight("sunset-desk-lamp", "실내 보조 램프", "Interior Accent Lamp", "point-lamp", false, 2800, 0.7, { x: 0.84, y: 0.72, z: 0.45 }, { x: -0.6, y: -0.3, z: 0.6 }, 0.5, 0.15, 36),
      ],
    },
  },
  {
    id: "rainy-neon-alley",
    nameKo: "비 오는 네온 골목",
    nameEn: "Rainy Neon Alley",
    moodKo: "시안·마젠타 쌍방향 네온 포인트 램프와 젖은 림 하이라이트",
    moodEn: "Dual cyan & magenta neon point lamps with wet rain rim",
    config: {
      presetId: "rainy-neon-alley", sssStrength: 0.62, volumetricGlobalGain: 1.2, exposure: 1.18, celSoftness: 0.35,
      lights: [
        makeLight("neon-cyan-lamp", "네온 시안 간판 램프", "Cyan Neon Sign", "point-lamp", true, 9200, 1.55, { x: 0.16, y: 0.32, z: 0.52 }, { x: 0.75, y: 0.38, z: 0.45 }, 0.68, 0.68, 38, { r: 0.42, g: 1.15, b: 1.35 }),
        makeLight("neon-magenta-rim", "마젠타 역광 림", "Magenta Alley Rim", "rim-backlight", true, 2900, 1.5, { x: 0.88, y: 0.28, z: 0.42 }, { x: -0.82, y: 0.22, z: 0.32 }, 0.65, 0.48, 32, { r: 1.35, g: 0.35, b: 1.18 }),
        makeLight("rain-sky-bounce", "빗길 반사 바운스", "Wet Asphalt Bounce", "ambient-bounce", true, 9600, 0.48, { x: 0.5, y: 0.95, z: 0.8 }, { x: 0, y: -0.9, z: 0.4 }, 1.1, 0, 50),
        makeLight("alley-street-lamp", "원거리 가로등", "Distant Streetlight", "sun-directional", true, 4200, 0.45, { x: 0.24, y: 0.08, z: 0.9 }, { x: 0.45, y: 0.75, z: 0.45 }, 0.85, 0.42, 26),
      ],
    },
  },
  {
    id: "moonlit-window",
    nameKo: "달빛 창가",
    nameEn: "Moonlit Window",
    moodKo: "9200K 창문 달빛 빛줄기와 은은한 실내 2650K 무드등 대비",
    moodEn: "Crisp 9200K moonbeam shafts balanced by warm 2650K bedside fill",
    config: {
      presetId: "moonlit-window", sssStrength: 0.5, volumetricGlobalGain: 1.32, exposure: 1.08, celSoftness: 0.32,
      lights: [
        makeLight("moon-key", "창가 달빛 방향광", "Moonlight Directional", "sun-directional", true, 9200, 1.25, { x: 0.18, y: 0.14, z: 0.85 }, { x: 0.65, y: 0.62, z: 0.44 }, 0.95, 0.88, 28),
        makeLight("moon-rim", "은빛 창틀 역광", "Silver Window Rim", "rim-backlight", true, 9800, 1.28, { x: 0.16, y: 0.22, z: 0.45 }, { x: 0.85, y: 0.3, z: 0.3 }, 0.75, 0.24, 24),
        makeLight("bedside-lamp", "침대 머리맡 무드등", "Warm Bedside Lamp", "point-lamp", true, 2650, 0.62, { x: 0.86, y: 0.68, z: 0.46 }, { x: -0.7, y: -0.25, z: 0.55 }, 0.52, 0.12, 40),
        makeLight("night-room-bounce", "심야 실내 바운스", "Night Room Bounce", "ambient-bounce", true, 8400, 0.36, { x: 0.5, y: 0.5, z: 1.0 }, { x: 0, y: 0.5, z: 0.8 }, 1.2, 0, 55),
      ],
    },
  },
  {
    id: "afternoon-classroom-backlight",
    nameKo: "오후 교실 역광",
    nameEn: "Afternoon Classroom Backlight",
    moodKo: "창밖 4400K 역광 먼지 빛줄기와 투명한 볼 서브서피스 산란(SSS)",
    moodEn: "4400K classroom window backlight with translucent cheek SSS",
    config: {
      presetId: "afternoon-classroom-backlight", sssStrength: 1.18, volumetricGlobalGain: 1.4, exposure: 1.22, celSoftness: 0.5,
      lights: [
        makeLight("classroom-backlight", "교실 창가 주 역광", "Window Backlight Rim", "rim-backlight", true, 4400, 1.65, { x: 0.2, y: 0.18, z: 0.42 }, { x: 0.78, y: 0.46, z: 0.32 }, 0.9, 0.95, 34),
        makeLight("classroom-sun-shaft", "오후 햇살 방향광", "Afternoon Sun Shaft", "sun-directional", true, 4900, 1.15, { x: 0.18, y: 0.16, z: 0.82 }, { x: 0.7, y: 0.56, z: 0.44 }, 0.95, 0.78, 30),
        makeLight("classroom-sky-bounce", "칠판·하늘 환경 바운스", "Classroom Sky Fill", "ambient-bounce", true, 6400, 0.72, { x: 0.8, y: 0.2, z: 1.0 }, { x: -0.4, y: 0.6, z: 0.65 }, 1.25, 0, 50),
        makeLight("desk-wood-bounce", "원목 책상 반사광", "Wood Desk Bounce", "point-lamp", true, 3600, 0.58, { x: 0.54, y: 0.86, z: 0.55 }, { x: 0, y: -0.85, z: 0.5 }, 0.62, 0.08, 48),
      ],
    },
  },
  {
    id: "magic-citadel-torch",
    nameKo: "마법 성채 횃불",
    nameEn: "Magic Citadel Torch",
    moodKo: "2300K 성채 횃불 포인트 광원과 9600K 마력 림라이트의 극적 대비",
    moodEn: "2300K flickering torch point light paired with 9600K arcane rim",
    config: {
      presetId: "magic-citadel-torch", sssStrength: 1.05, volumetricGlobalGain: 1.15, exposure: 1.16, celSoftness: 0.36,
      lights: [
        makeLight("citadel-torch", "성채 벽면 횃불", "Citadel Wall Torch", "point-lamp", true, 2300, 1.75, { x: 0.22, y: 0.42, z: 0.48 }, { x: 0.78, y: 0.22, z: 0.52 }, 0.64, 0.66, 42),
        makeLight("arcane-crystal-rim", "마력 크리스탈 역광", "Arcane Crystal Rim", "rim-backlight", true, 9600, 1.42, { x: 0.86, y: 0.24, z: 0.4 }, { x: -0.84, y: 0.32, z: 0.32 }, 0.7, 0.44, 30, { r: 0.58, g: 1.05, b: 1.38 }),
        makeLight("stone-hall-bounce", "석조 벽체 잔광", "Stone Hall Bounce", "ambient-bounce", true, 3200, 0.42, { x: 0.5, y: 0.85, z: 0.9 }, { x: 0, y: -0.7, z: 0.7 }, 1.1, 0, 55),
        makeLight("citadel-moon-slit", "성채 천창 빛줄기", "Citadel Skylight Shaft", "sun-directional", true, 8600, 0.55, { x: 0.72, y: 0.06, z: 0.85 }, { x: -0.42, y: 0.82, z: 0.38 }, 0.85, 0.62, 22),
      ],
    },
  },
];

export function getLightingPresetById(id: CinematicLightingPresetId): CinematicLightingPreset {
  return DYNAMIC_LIGHTING_PRESETS.find((preset) => preset.id === id) ?? DYNAMIC_LIGHTING_PRESETS[0]!;
}

/** WebGPU WGSL 실시간 다중 동적 조명 컴퓨트 셰이더 소스 (Display-P3 HDR rgba16float 출력 대응). */
export const DYNAMIC_STUDIO_LIGHTING_WGSL = /* wgsl */ `
struct LightUniform {
  posRadius : vec4<f32>,
  dirCone   : vec4<f32>,
  colorInt  : vec4<f32>,
  meta      : vec4<f32>,
};

struct LightingSceneUniforms {
  resolution  : vec2<f32>,
  exposure    : f32,
  sssStrength : f32,
  volGain     : f32,
  celSoftness : f32,
  lightCount  : u32,
  pad0        : u32,
  lights      : array<LightUniform, 4>,
};

@group(0) @binding(0) var<uniform> scene : LightingSceneUniforms;
@group(0) @binding(1) var albedoTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var depthSkinTex : texture_2d<f32>;
@group(0) @binding(4) var outLitTex : texture_storage_2d<rgba16float, write>;

fn aces_filmic(x : vec3<f32>) -> vec3<f32> {
  let v = max(x, vec3<f32>(0.0));
  return clamp((v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn eval_skin_sss(nDotL : f32, nz : f32, skinMask : f32, lightCol : vec3<f32>, intensity : f32) -> vec3<f32> {
  let wrapped = clamp((nDotL + 0.55) / 1.55, 0.0, 1.0);
  let band = max(wrapped - max(nDotL, 0.0), 0.0);
  let grazing = pow(clamp(1.0 - abs(nDotL), 0.0, 1.0), 2.1) * 0.45;
  let scatter = (band * 1.15 + grazing) * (0.65 + 0.35 * (1.0 - clamp(nz, 0.0, 1.0))) * skinMask * scene.sssStrength * intensity;
  return lightCol * vec3<f32>(1.0, 0.36, 0.2) * scatter;
}

fn eval_volumetric_god_ray(uv : vec2<f32>, pixelDepth : f32, light : LightUniform) -> f32 {
  if (light.meta.y <= 0.0001) { return 0.0; }
  let delta = uv - light.posRadius.xy;
  let dist = max(length(delta), 0.0001);
  let cosTheta = dot(delta / dist, normalize(light.dirCone.xy + vec2<f32>(0.00001, 0.0)));
  let outerCos = light.dirCone.w;
  if (cosTheta <= outerCos) { return 0.0; }
  let ang = smoothstep(outerCos, mix(outerCos, 1.0, 0.48), cosTheta);
  let radial = 1.0 / (1.0 + dist * dist * (1.8 / max(0.15, light.posRadius.w)));
  return light.meta.y * ang * radial * (1.0 - pixelDepth * 0.42);
}

@compute @workgroup_size(8, 8, 1)
fn cs_relight_main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let dims = vec2<u32>(u32(scene.resolution.x), u32(scene.resolution.y));
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  let uv = (vec2<f32>(gid.xy) + vec2<f32>(0.5)) / scene.resolution;
  let albedo = textureLoad(albedoTex, coord, 0);
  let normal = normalize(textureLoad(normalTex, coord, 0).xyz * 2.0 - vec3<f32>(1.0));
  let depthSkin = textureLoad(depthSkinTex, coord, 0);
  let fgMask = smoothstep(0.25, 0.65, depthSkin.r);
  var accum = albedo.rgb * vec3<f32>(0.035, 0.035, 0.04);
  let count = min(scene.lightCount, 4u);

  for (var i : u32 = 0u; i < count; i = i + 1u) {
    let l = scene.lights[i];
    if (l.meta.z < 0.5 || l.colorInt.w <= 0.0001) { continue; }
    let kind = i32(l.meta.x + 0.5);
    let intensity = l.colorInt.w;
    let lightCol = l.colorInt.rgb;
    if (kind == 3) {
      accum += albedo.rgb * lightCol * ((0.45 + 0.55 * clamp(0.5 - normal.y * 0.5, 0.0, 1.0)) * intensity * 0.55);
      continue;
    }
    var lightVec = normalize(vec3<f32>(-l.dirCone.x, -l.dirCone.y, max(0.15, l.dirCone.z)));
    var atten = 1.0;
    if (kind == 1) {
      let dVec = l.posRadius.xyz - vec3<f32>(uv, depthSkin.r * 0.45);
      let dLen = max(length(dVec), 0.05);
      lightVec = dVec / dLen;
      let rad = max(0.12, l.posRadius.w);
      atten = 1.0 / (1.0 + (dLen * dLen) / (rad * rad));
    }
    let nDotL = dot(normal, lightVec);
    if (kind == 2) {
      let rim = pow(clamp(1.0 - max(normal.z, 0.0), 0.0, 1.0), 2.35) * smoothstep(-0.35, 0.85, dot(normal.xy, lightVec.xy) + 0.35) * fgMask * intensity * 1.45;
      accum += mix(albedo.rgb, vec3<f32>(1.0), 0.65) * lightCol * rim;
    } else {
      accum += albedo.rgb * lightCol * (smoothstep(-0.08 * scene.celSoftness, 0.12 + 0.72 * scene.celSoftness, nDotL) * intensity * atten);
    }
    if (depthSkin.g > 0.0001) {
      accum += albedo.rgb * eval_skin_sss(nDotL, normal.z, depthSkin.g, lightCol, intensity * atten);
    }
    accum += lightCol * (eval_volumetric_god_ray(uv, depthSkin.r, l) * scene.volGain * intensity * 0.34);
  }
  textureStore(outLitTex, coord, vec4<f32>(aces_filmic(accum * scene.exposure), albedo.a));
}
`.trim();

/** WGSL 동적 조명 셰이더의 구조 계약을 검증한다. */
export function validateWgslLightingContract(
  source: string = DYNAMIC_STUDIO_LIGHTING_WGSL,
): WgslLightingContractCheck {
  const hasFourLightArray = /array<LightUniform,\s*4>/u.test(source);
  const hasComputeEntry = /@compute\s+@workgroup_size\(8,\s*8,\s*1\)/u.test(source);
  const hasVolumetricGodRay = /fn\s+eval_volumetric_god_ray\b/u.test(source);
  const hasSkinSubsurface = /fn\s+eval_skin_sss\b/u.test(source);
  const hasAcesToneMap = /fn\s+aces_filmic\b/u.test(source);
  return {
    validationKind: "text-only",
    compiled: false,
    valid: hasFourLightArray && hasComputeEntry && hasVolumetricGodRay && hasSkinSubsurface && hasAcesToneMap,
    hasFourLightArray,
    hasComputeEntry,
    hasVolumetricGodRay,
    hasSkinSubsurface,
    hasAcesToneMap,
    lineCount: source.split(/\r?\n/).length,
  };
}
