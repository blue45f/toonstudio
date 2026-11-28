/**
 * Wave 111 — 셀 음영(Cel Shadow)·다중 레이어 접촉 AO(Contact AO)·프레넬 림라이트 합성기
 * 및 WebGPU WGSL 컴퓨트/프래그먼트 셰이더 생성·검증기.
 */

import {
  binarizeSilhouetteMask,
  type Inflated2dNormalField,
  type NormalInflationProfile,
} from "./silhouette-sdf-normal-inflator";

export type CelBandCount = 2 | 3 | 4;
export type RgbByteTuple = readonly [number, number, number];
export type Vec3Tuple = readonly [number, number, number];

/** 다중 레이어 접촉 AO 계산용 상위 차폐 마스크 레이어(앞머리·칼라·소품 등). */
export interface ContactAoOccluderLayer {
  readonly id: string;
  readonly labelKo?: string;
  readonly mask: Uint8Array;
  readonly alphaThreshold?: number;
  readonly elevationPx?: number;
  readonly opacity?: number;
  readonly rayDistancePx?: number;
  readonly creaseRadiusPx?: number;
}

/** 셀 음영·접촉 AO·프레넬 림라이트 합성 파라미터. */
export interface CelLightingSpec {
  readonly keyLightDir: Vec3Tuple;
  readonly rimLightDir?: Vec3Tuple;
  readonly bandCount?: CelBandCount;
  readonly terminatorShift?: number;
  readonly terminatorSoftness?: number;
  readonly rimPower?: number;
  readonly rimIntensity?: number;
  readonly contactAoStrength?: number;
  readonly shadowTintStrength?: number;
  readonly baseColorRgb?: RgbByteTuple;
  readonly shadowTintRgb?: RgbByteTuple;
  readonly rimColorRgb?: RgbByteTuple;
}

/** 셀·접촉 AO·림라이트 패스 통계 지표. */
export interface LightingPassTelemetry {
  readonly interiorPixelCount: number;
  readonly exteriorPixelCount: number;
  readonly outsideMaskLeakPixels: number;
  readonly celLitPixelCount: number;
  readonly celShadowPixelCount: number;
  readonly meanInteriorCel: number;
  readonly meanInteriorAo: number;
  readonly minInteriorAo: number;
  readonly contactAoDarkenedPixelCount: number;
  readonly rimPeakIntensity: number;
  readonly meanInteriorRim: number;
  readonly rimLitPixelCount: number;
  readonly occluderLayerCount: number;
  readonly nanCount: number;
}

/** 셀 음영·접촉 AO·프레넬 림라이트 합성 결과. */
export interface CelContactAoRimPassResult {
  readonly width: number;
  readonly height: number;
  readonly normalField: Inflated2dNormalField;
  readonly keyLightDir: Vec3Tuple;
  readonly rimLightDir: Vec3Tuple;
  readonly bandCount: CelBandCount;
  readonly terminatorShift: number;
  readonly terminatorSoftness: number;
  readonly rimPower: number;
  readonly rimIntensity: number;
  readonly occluderLabelsKo: readonly string[];
  readonly celShadeBuffer: Float32Array;
  readonly contactAoBuffer: Float32Array;
  readonly rimBuffer: Float32Array;
  readonly compositeRgba: Uint8ClampedArray;
  readonly telemetry: LightingPassTelemetry;
}

export interface NormalAoRimWgslBinding {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
}

export interface NormalAoRimWgslArtifact {
  readonly profile: NormalInflationProfile;
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly workgroupSize: readonly [number, number, number];
  readonly bindings: readonly NormalAoRimWgslBinding[];
  readonly entryPoints: readonly string[];
}

export interface NormalAoRimWgslValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
}

const DEFAULT_BASE_RGB: RgbByteTuple = [238, 212, 194];
const DEFAULT_SHADOW_TINT_RGB: RgbByteTuple = [118, 112, 152];
const DEFAULT_RIM_RGB: RgbByteTuple = [255, 244, 214];
const CREASE_DIRS_8: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.70710678, 0.70710678],
  [-0.70710678, 0.70710678],
  [0.70710678, -0.70710678],
  [-0.70710678, -0.70710678],
];

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function clampRange(value: number, min: number, max: number, fallback: number): number {
  const safe = Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, safe));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** 3D 벡터를 안전하게 단위 벡터로 정규화한다(영벡터는 대체 벡터 사용). */
export function normalizeVec3Safe(vec: Vec3Tuple, fallback: Vec3Tuple = [0, 0, 1]): Vec3Tuple {
  const x = Number.isFinite(vec[0]) ? vec[0] : fallback[0];
  const y = Number.isFinite(vec[1]) ? vec[1] : fallback[1];
  const z = Number.isFinite(vec[2]) ? vec[2] : fallback[2];
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len <= 1e-6 || !Number.isFinite(len)) {
    const fbLen = Math.hypot(fallback[0], fallback[1], fallback[2]);
    return fbLen <= 1e-6
      ? [0, 0, 1]
      : [fallback[0] / fbLen, fallback[1] / fbLen, fallback[2] / fbLen];
  }
  return [x / len, y / len, z / len];
}

/** `NdotL` 값을 2·3·4단계 웹툰 셀 음영 램프(`[0, 1]`)로 양자화한다. */
export function evaluateCelShadowRamp(
  ndotl: number,
  bandCount: CelBandCount,
  terminatorShift: number,
  terminatorSoftness: number,
): number {
  const safeNdotl = Number.isFinite(ndotl) ? ndotl : 0;
  const mapped = clamp01((safeNdotl + terminatorShift + 0.25) / 1.15);
  const clampedSoft = clampRange(terminatorSoftness, 0, 0.25, 0.04);
  const stepCount = bandCount - 1;
  let acc = 0;
  for (let k = 1; k <= stepCount; k += 1) {
    const threshold = k / bandCount;
    acc +=
      clampedSoft <= 1e-6
        ? mapped >= threshold
          ? 1
          : 0
        : smoothstep(threshold - clampedSoft, threshold + clampedSoft, mapped);
  }
  return clamp01(acc / stepCount);
}

interface PreparedOccluder {
  readonly labelKo: string;
  readonly binaryMask: Uint8Array;
  readonly elevationPx: number;
  readonly opacity: number;
  readonly rayDistancePx: number;
  readonly creaseRadiusPx: number;
}

function prepareOccluders(
  occluderLayers: readonly ContactAoOccluderLayer[] | undefined,
  width: number,
  height: number,
): PreparedOccluder[] {
  if (!occluderLayers || occluderLayers.length === 0) return [];
  const prepared: PreparedOccluder[] = [];
  for (let i = 0; i < occluderLayers.length; i += 1) {
    const layer = occluderLayers[i];
    if (!layer) continue;
    const { binaryMask } = binarizeSilhouetteMask(layer.mask, width, height, layer.alphaThreshold);
    prepared.push({
      labelKo: layer.labelKo?.trim() || layer.id,
      binaryMask,
      elevationPx: clampRange(layer.elevationPx ?? 3.0, 0.5, 24.0, 3.0),
      opacity: clampRange(layer.opacity ?? 0.85, 0, 1, 0.85),
      rayDistancePx: Math.max(2, Math.min(32, Math.round(layer.rayDistancePx ?? 10))),
      creaseRadiusPx: Math.max(1, Math.min(12, Math.round(layer.creaseRadiusPx ?? 4))),
    });
  }
  return prepared;
}

function sampleBinaryAt(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || ix >= width || iy < 0 || iy >= height) return 0;
  return mask[iy * width + ix] ?? 0;
}

/**
 * 상위 차폐 레이어 군집에 대해 방향성 레이마칭(입사광 진행 방향 반대쪽 탐색)과
 * 근거리 8방향 등방성 틈새(Crease) AO를 결합한다.
 */
function evaluatePixelContactAo(
  x: number,
  y: number,
  width: number,
  height: number,
  keyLightDir: Vec3Tuple,
  occluders: readonly PreparedOccluder[],
): number {
  if (occluders.length === 0) return 1.0;

  const xyLen = Math.hypot(keyLightDir[0], keyLightDir[1]);
  const marchX = xyLen > 1e-4 ? keyLightDir[0] / xyLen : 0;
  const marchY = xyLen > 1e-4 ? keyLightDir[1] / xyLen : -1;
  const castLengthScale = clampRange(1.35 - keyLightDir[2] * 0.65, 0.55, 1.35, 1.0);
  let transmittance = 1.0;

  for (let l = 0; l < occluders.length; l += 1) {
    const occ = occluders[l];
    if (!occ || occ.opacity <= 0) continue;

    const directHit = sampleBinaryAt(occ.binaryMask, width, height, x, y);
    const directOcclusion = directHit > 0 ? 0.68 * occ.opacity : 0;

    let rayOcclusion = 0;
    const effectiveSteps = Math.max(2, Math.min(32, Math.round(occ.rayDistancePx * castLengthScale)));
    const elevationAtten = 1 / (1 + occ.elevationPx * 0.12);
    for (let step = 1; step <= effectiveSteps; step += 1) {
      if (sampleBinaryAt(occ.binaryMask, width, height, x + marchX * step, y + marchY * step) > 0) {
        const nd = step / (effectiveSteps + 1);
        rayOcclusion = 0.62 * occ.opacity * elevationAtten * (1 - nd) * (1 - nd);
        break;
      }
    }

    let creaseWeightedHits = 0;
    let creaseWeightSum = 0;
    for (let r = 1; r <= occ.creaseRadiusPx; r += 1) {
      const ringWeight = 1 - (r - 1) / (occ.creaseRadiusPx + 0.5);
      for (let d = 0; d < CREASE_DIRS_8.length; d += 1) {
        const dir = CREASE_DIRS_8[d];
        if (!dir) continue;
        creaseWeightedHits +=
          sampleBinaryAt(occ.binaryMask, width, height, x + dir[0] * r, y + dir[1] * r) * ringWeight;
        creaseWeightSum += ringWeight;
      }
    }
    const creaseRatio = creaseWeightSum > 0 ? creaseWeightedHits / creaseWeightSum : 0;
    const creaseOcclusion = creaseRatio * 0.42 * occ.opacity * elevationAtten;
    const layerOcclusion = clamp01(Math.max(directOcclusion, rayOcclusion) + creaseOcclusion * 0.45);
    transmittance *= 1 - layerOcclusion;
  }

  return clamp01(transmittance);
}

/**
 * 팽창 법선장·조명 사양·상위 차폐 레이어로부터 셀 음영, 접촉 AO, 프레넬 림라이트 및
 * 알파 보존 RGBA 프리뷰를 결정론적으로 합성한다.
 */
export function synthesizeCelShadowContactAoAndRimPass(
  normalField: Inflated2dNormalField,
  lightingSpec: CelLightingSpec,
  occluderLayers?: readonly ContactAoOccluderLayer[],
): CelContactAoRimPassResult {
  const { width, height, binaryMask, normals, sourceMask, isBinaryMaskInput } = normalField;
  const pixelCount = width * height;

  const keyLightDir = normalizeVec3Safe(lightingSpec.keyLightDir, [-0.65, -0.45, 0.61]);
  const defaultRimFallback: Vec3Tuple =
    Math.hypot(keyLightDir[0], keyLightDir[1]) > 0.1
      ? [-keyLightDir[0], -Math.max(0.25, Math.abs(keyLightDir[1]) * 0.5), 0.38]
      : [0.85, -0.35, 0.39];
  const rimLightDir = normalizeVec3Safe(lightingSpec.rimLightDir ?? defaultRimFallback, [0.85, -0.35, 0.39]);

  const bandCount: CelBandCount = lightingSpec.bandCount ?? 3;
  const terminatorShift = clampRange(lightingSpec.terminatorShift ?? 0, -0.6, 0.6, 0);
  const terminatorSoftness = clampRange(lightingSpec.terminatorSoftness ?? 0.04, 0, 0.25, 0.04);
  const rimPower = clampRange(lightingSpec.rimPower ?? 2.5, 0.5, 12.0, 2.5);
  const rimIntensity = clampRange(lightingSpec.rimIntensity ?? 0.9, 0, 2.0, 0.9);
  const contactAoStrength = clampRange(lightingSpec.contactAoStrength ?? 0.6, 0, 1, 0.6);
  const shadowTintStrength = clampRange(lightingSpec.shadowTintStrength ?? 0.5, 0, 1, 0.5);

  const baseRgb = lightingSpec.baseColorRgb ?? DEFAULT_BASE_RGB;
  const shadowRgb = lightingSpec.shadowTintRgb ?? DEFAULT_SHADOW_TINT_RGB;
  const rimRgb = lightingSpec.rimColorRgb ?? DEFAULT_RIM_RGB;
  const occluders = prepareOccluders(occluderLayers, width, height);

  const celShadeBuffer = new Float32Array(pixelCount);
  const contactAoBuffer = new Float32Array(pixelCount);
  const rimBuffer = new Float32Array(pixelCount);
  const compositeRgba = new Uint8ClampedArray(pixelCount * 4);

  let interiorPixelCount = 0;
  let exteriorPixelCount = 0;
  let outsideMaskLeakPixels = 0;
  let celLitPixelCount = 0;
  let celShadowPixelCount = 0;
  let celSum = 0;
  let aoSum = 0;
  let minInteriorAo = 1;
  let contactAoDarkenedPixelCount = 0;
  let rimPeakIntensity = 0;
  let rimSum = 0;
  let rimLitPixelCount = 0;
  let nanCount = 0;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOffset + x;
      const rgbaIdx = idx * 4;
      if (binaryMask[idx] === 0) {
        exteriorPixelCount += 1;
        celShadeBuffer[idx] = 0;
        contactAoBuffer[idx] = 0;
        rimBuffer[idx] = 0;
        compositeRgba[rgbaIdx] = 0;
        compositeRgba[rgbaIdx + 1] = 0;
        compositeRgba[rgbaIdx + 2] = 0;
        compositeRgba[rgbaIdx + 3] = 0;
        if (
          celShadeBuffer[idx] !== 0 ||
          contactAoBuffer[idx] !== 0 ||
          rimBuffer[idx] !== 0 ||
          compositeRgba[rgbaIdx + 3] !== 0
        ) {
          outsideMaskLeakPixels += 1;
        }
        continue;
      }

      interiorPixelCount += 1;
      const nIdx = idx * 3;
      const nx = normals[nIdx] ?? 0;
      const ny = normals[nIdx + 1] ?? 0;
      const nz = normals[nIdx + 2] ?? 1;

      const ndotl = nx * keyLightDir[0] + ny * keyLightDir[1] + nz * keyLightDir[2];
      const cel = evaluateCelShadowRamp(ndotl, bandCount, terminatorShift, terminatorSoftness);
      celShadeBuffer[idx] = cel;
      celSum += cel;
      if (cel >= 0.5) celLitPixelCount += 1;
      else celShadowPixelCount += 1;

      const ao = evaluatePixelContactAo(x, y, width, height, keyLightDir, occluders);
      contactAoBuffer[idx] = ao;
      aoSum += ao;
      if (ao < minInteriorAo) minInteriorAo = ao;
      if (ao < 0.92) contactAoDarkenedPixelCount += 1;

      const grazing = Math.max(0, 1 - nz);
      const rimDot = Math.max(0, nx * rimLightDir[0] + ny * rimLightDir[1] + nz * rimLightDir[2]);
      const rim = clamp01(Math.pow(grazing, rimPower) * rimDot * rimIntensity);
      rimBuffer[idx] = rim;
      rimSum += rim;
      if (rim > rimPeakIntensity) rimPeakIntensity = rim;
      if (rim >= 0.15) rimLitPixelCount += 1;

      const shadeMix = 1 - shadowTintStrength * (1 - cel);
      const aoFactor = 1 - contactAoStrength * (1 - ao);
      const outR = (shadowRgb[0] * (1 - shadeMix) + baseRgb[0] * shadeMix) * aoFactor + rimRgb[0] * rim * 0.72;
      const outG = (shadowRgb[1] * (1 - shadeMix) + baseRgb[1] * shadeMix) * aoFactor + rimRgb[1] * rim * 0.72;
      const outB = (shadowRgb[2] * (1 - shadeMix) + baseRgb[2] * shadeMix) * aoFactor + rimRgb[2] * rim * 0.72;

      if (!Number.isFinite(cel + ao + rim + outR + outG + outB)) nanCount += 1;

      compositeRgba[rgbaIdx] = Math.round(clampRange(outR, 0, 255, 0));
      compositeRgba[rgbaIdx + 1] = Math.round(clampRange(outG, 0, 255, 0));
      compositeRgba[rgbaIdx + 2] = Math.round(clampRange(outB, 0, 255, 0));
      compositeRgba[rgbaIdx + 3] = isBinaryMaskInput ? 255 : (sourceMask[idx] ?? 255);
    }
  }

  return {
    width,
    height,
    normalField,
    keyLightDir,
    rimLightDir,
    bandCount,
    terminatorShift,
    terminatorSoftness,
    rimPower,
    rimIntensity,
    occluderLabelsKo: occluders.map((o) => o.labelKo),
    celShadeBuffer,
    contactAoBuffer,
    rimBuffer,
    compositeRgba,
    telemetry: {
      interiorPixelCount,
      exteriorPixelCount,
      outsideMaskLeakPixels,
      celLitPixelCount,
      celShadowPixelCount,
      meanInteriorCel: interiorPixelCount > 0 ? celSum / interiorPixelCount : 0,
      meanInteriorAo: interiorPixelCount > 0 ? aoSum / interiorPixelCount : 1,
      minInteriorAo: interiorPixelCount > 0 ? minInteriorAo : 1,
      contactAoDarkenedPixelCount,
      rimPeakIntensity,
      meanInteriorRim: interiorPixelCount > 0 ? rimSum / interiorPixelCount : 0,
      rimLitPixelCount,
      occluderLayerCount: occluders.length,
      nanCount,
    },
  };
}

function buildWgslBevelBody(profile: NormalInflationProfile): string {
  if (profile === "soft-organic") {
    return "  let o = 1.0 - u;\n  return sqrt(max(0.0, 1.0 - o * o));";
  }
  if (profile === "cel-bevel") {
    return "  let o = 1.0 - u;\n  return 1.0 - o * o;";
  }
  return "  return u;";
}

/**
 * 선택한 2D 법선 팽창 프로파일용 WebGPU WGSL 컴퓨트/프래그먼트 셰이더를 생성한다.
 */
export function buildNormalAoRimWgsl(
  profile: NormalInflationProfile = "soft-organic",
): NormalAoRimWgslArtifact {
  const bevelBody = buildWgslBevelBody(profile);
  const bindings: readonly NormalAoRimWgslBinding[] = [
    { group: 0, binding: 0, name: "u_pass", addressSpace: "uniform" },
    { group: 0, binding: 1, name: "b_edt_dist", addressSpace: "storage-read" },
    { group: 0, binding: 2, name: "b_occluder_mask", addressSpace: "storage-read" },
    { group: 0, binding: 3, name: "b_normals_out", addressSpace: "storage-read-write" },
    { group: 0, binding: 4, name: "b_passes_out", addressSpace: "storage-read-write" },
  ];

  const wgsl = `// Wave 111 2D Silhouette Normal, Contact AO & Fresnel Rim-Light WGSL (${profile})
struct NormalAoRimUniforms {
  dims_bevel_elev: vec4<f32>,
  key_light_and_shift: vec4<f32>,
  rim_light_and_power: vec4<f32>,
  bands_soft_rim_ao: vec4<f32>,
  base_color_and_shadow: vec4<f32>,
  shadow_tint_and_steps: vec4<f32>,
  rim_color_and_opacity: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_pass: NormalAoRimUniforms;
@group(0) @binding(1) var<storage, read> b_edt_dist: array<f32>;
@group(0) @binding(2) var<storage, read> b_occluder_mask: array<u32>;
@group(0) @binding(3) var<storage, read_write> b_normals_out: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> b_passes_out: array<vec4<f32>>;

fn evaluate_bevel_height(dist_px: f32, bevel_radius: f32) -> f32 {
  if (dist_px <= 0.0) { return 0.0; }
  let u = clamp(dist_px / max(bevel_radius, 1.0), 0.0, 1.0);
${bevelBody}
}

fn sample_metric_height(x: i32, y: i32, w: i32, h: i32) -> f32 {
  if (x < 0 || x >= w || y < 0 || y >= h) { return 0.0; }
  let r = max(u_pass.dims_bevel_elev.z, 1.0);
  return evaluate_bevel_height(b_edt_dist[u32(y * w + x)], r) * r * u_pass.dims_bevel_elev.w;
}

fn sample_inflated_normal(coord: vec2<i32>, dims: vec2<i32>) -> vec3<f32> {
  let w = dims.x;
  let h = dims.y;
  let tl = sample_metric_height(coord.x - 1, coord.y - 1, w, h);
  let tc = sample_metric_height(coord.x, coord.y - 1, w, h);
  let tr = sample_metric_height(coord.x + 1, coord.y - 1, w, h);
  let ml = sample_metric_height(coord.x - 1, coord.y, w, h);
  let mr = sample_metric_height(coord.x + 1, coord.y, w, h);
  let bl = sample_metric_height(coord.x - 1, coord.y + 1, w, h);
  let bc = sample_metric_height(coord.x, coord.y + 1, w, h);
  let br = sample_metric_height(coord.x + 1, coord.y + 1, w, h);
  let dhdx = (tr + 2.0 * mr + br - (tl + 2.0 * ml + bl)) * 0.125;
  let dhdy = (bl + 2.0 * bc + br - (tl + 2.0 * tc + tr)) * 0.125;
  return normalize(vec3<f32>(-dhdx, -dhdy, 1.0));
}

fn evaluate_cel_ramp(ndotl: f32, band_count: f32, shift: f32, softness: f32) -> f32 {
  let mapped = clamp((ndotl + shift + 0.25) / 1.15, 0.0, 1.0);
  let steps = max(1, i32(round(band_count)) - 1);
  let soft = clamp(softness, 0.0, 0.25);
  var acc: f32 = 0.0;
  for (var k: i32 = 1; k <= 3; k = k + 1) {
    if (k > steps) { break; }
    let th = f32(k) / f32(steps + 1);
    acc = acc + select(smoothstep(th - soft, th + soft, mapped), select(0.0, 1.0, mapped >= th), soft <= 1e-6);
  }
  return clamp(acc / f32(steps), 0.0, 1.0);
}

fn sample_contact_ao(coord: vec2<i32>, dims: vec2<i32>, key_dir: vec3<f32>) -> f32 {
  let w = dims.x;
  let h = dims.y;
  let idx = u32(coord.y * w + coord.x);
  let occ_opacity = clamp(u_pass.rim_color_and_opacity.w, 0.0, 1.0);
  if (occ_opacity <= 0.0) { return 1.0; }
  let direct_hit = select(0.0, 0.68 * occ_opacity, b_occluder_mask[idx] > 0u);
  let xy_len = length(key_dir.xy);
  let march_dir = select(vec2<f32>(0.0, -1.0), key_dir.xy / xy_len, xy_len > 1e-4);
  let max_steps = clamp(i32(round(u_pass.shadow_tint_and_steps.w)), 2, 24);
  var ray_occ: f32 = 0.0;
  for (var s: i32 = 1; s <= 24; s = s + 1) {
    if (s > max_steps) { break; }
    let p = vec2<i32>(round(vec2<f32>(coord) + march_dir * f32(s)));
    if (p.x < 0 || p.x >= w || p.y < 0 || p.y >= h) { break; }
    if (b_occluder_mask[u32(p.y * w + p.x)] > 0u) {
      let nd = f32(s) / f32(max_steps + 1);
      ray_occ = 0.62 * occ_opacity * (1.0 - nd) * (1.0 - nd);
      break;
    }
  }
  return clamp(1.0 - max(direct_hit, ray_occ), 0.0, 1.0);
}

fn evaluate_fresnel_rim(normal: vec3<f32>, rim_dir: vec3<f32>, rim_power: f32, rim_intensity: f32) -> f32 {
  let grazing = max(0.0, 1.0 - normal.z);
  let rim_dot = max(0.0, dot(normal, normalize(rim_dir)));
  return clamp(pow(grazing, rim_power) * rim_dot * rim_intensity, 0.0, 1.0);
}

@compute @workgroup_size(8, 8, 1)
fn cs_normal_ao_rim(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<i32>(i32(u_pass.dims_bevel_elev.x), i32(u_pass.dims_bevel_elev.y));
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  if (coord.x >= dims.x || coord.y >= dims.y) { return; }
  let idx = u32(coord.y * dims.x + coord.x);
  if (b_edt_dist[idx] <= 0.0) {
    b_normals_out[idx] = vec4<f32>(0.0, 0.0, 1.0, 0.0);
    b_passes_out[idx] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return;
  }
  let n = sample_inflated_normal(coord, dims);
  let key_dir = normalize(u_pass.key_light_and_shift.xyz);
  let cel = evaluate_cel_ramp(dot(n, key_dir), u_pass.bands_soft_rim_ao.x, u_pass.key_light_and_shift.w, u_pass.bands_soft_rim_ao.y);
  let ao = sample_contact_ao(coord, dims, key_dir);
  let rim = evaluate_fresnel_rim(n, u_pass.rim_light_and_power.xyz, u_pass.rim_light_and_power.w, u_pass.bands_soft_rim_ao.z);
  b_normals_out[idx] = vec4<f32>(n, 1.0);
  b_passes_out[idx] = vec4<f32>(cel, ao, rim, 1.0);
}

@fragment
fn fs_composite_cel_pass(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let dims = vec2<i32>(i32(u_pass.dims_bevel_elev.x), i32(u_pass.dims_bevel_elev.y));
  let coord = clamp(vec2<i32>(i32(frag_coord.x), i32(frag_coord.y)), vec2<i32>(0, 0), dims - vec2<i32>(1, 1));
  let pass_data = b_passes_out[u32(coord.y * dims.x + coord.x)];
  if (pass_data.w <= 0.0) { return vec4<f32>(0.0, 0.0, 0.0, 0.0); }
  let shade_mix = 1.0 - u_pass.base_color_and_shadow.w * (1.0 - pass_data.x);
  let ao_factor = 1.0 - u_pass.bands_soft_rim_ao.w * (1.0 - pass_data.y);
  let base_rgb = mix(u_pass.shadow_tint_and_steps.xyz, u_pass.base_color_and_shadow.xyz, shade_mix);
  let final_rgb = clamp(base_rgb * ao_factor + u_pass.rim_color_and_opacity.xyz * pass_data.z * 0.72, vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(final_rgb, 1.0);
}
`;

  return {
    profile,
    wgsl,
    uniformBufferByteLength: 7 * 16,
    workgroupSize: [8, 8, 1],
    bindings,
    entryPoints: ["cs_normal_ao_rim", "fs_composite_cel_pass"],
  };
}

/** 생성된 Wave 111 WGSL 셰이더의 괄호 균형·필수 심볼·16바이트 정렬 계약을 검증한다. */
export function validateNormalAoRimWgsl(
  input: NormalAoRimWgslArtifact | string,
): NormalAoRimWgslValidationReport {
  const wgsl = typeof input === "string" ? input : input.wgsl;
  const errors: string[] = [];
  const trimmed = wgsl.trim();
  if (trimmed.length === 0) {
    return { valid: false, errors: ["WGSL 소스 문자열이 비어 있습니다."], lineCount: 0 };
  }

  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    if (braceDepth < 0) {
      errors.push("WGSL 중괄호 닫힘이 열림보다 먼저 나타났습니다.");
      break;
    }
    if (parenDepth < 0) {
      errors.push("WGSL 소괄호 닫힘이 열림보다 먼저 나타났습니다.");
      break;
    }
  }
  if (braceDepth !== 0) errors.push(`WGSL 중괄호 짝이 맞지 않습니다(잔여: ${braceDepth}).`);
  if (parenDepth !== 0) errors.push(`WGSL 소괄호 짝이 맞지 않습니다(잔여: ${parenDepth}).`);

  const requiredTokens = [
    "struct NormalAoRimUniforms",
    "@group(0) @binding(0)",
    "@compute @workgroup_size(",
    "fn cs_normal_ao_rim",
    "@fragment",
    "fn fs_composite_cel_pass",
    "fn evaluate_bevel_height",
    "fn evaluate_cel_ramp",
    "fn sample_contact_ao",
    "fn evaluate_fresnel_rim",
  ];
  for (let i = 0; i < requiredTokens.length; i += 1) {
    const token = requiredTokens[i];
    if (token && !trimmed.includes(token)) {
      errors.push(`필수 WGSL 심볼 누락: ${token}`);
    }
  }
  if (/\b(?:NaN|Infinity|undefined)\b/.test(trimmed)) {
    errors.push("WGSL 소스에 비정상 리터럴이 포함되어 있습니다.");
  }
  if (typeof input !== "string" && input.uniformBufferByteLength % 16 !== 0) {
    errors.push(`유니폼 버퍼 크기(${input.uniformBufferByteLength}B)가 16바이트 정렬을 위반합니다.`);
  }

  return { valid: errors.length === 0, errors, lineCount: trimmed.split("\n").length };
}
