/**
 * Wave 74: 2.5D 리라이팅·광학 굴절 색분산·이방성 메탈 반사 WebGPU 컴퓨트 WGSL 셰이더,
 * 16-byte 정렬 유니폼 패커 및 정적 셰이더 계약 검증기.
 */

import {
  clamp01,
  clampRange,
  directionFromAngles,
  RELIGHTING_ATMOSPHERE_PRESETS,
  type RelightingAtmospherePreset,
  type RelightingAtmospherePresetId,
  type RgbTuple,
  type Vec3Tuple,
} from "./relighting-25d-lightfield-engine";
import { OPTICAL_BRUSH_MATERIALS, type OpticalBrushMaterialId } from "./optical-refraction-reflection-brush";

export interface RelightingWgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage";
  readonly access: "read" | "read_write";
}

export interface RelightingWgslShaderContract {
  readonly shaderId: string;
  readonly entryPoint: string;
  readonly workgroupSize: readonly [number, number, number];
  readonly uniformStructName: string;
  readonly uniformFloatCount: number;
  readonly uniformByteLength: number;
  readonly bindings: readonly RelightingWgslBindingDescriptor[];
}

export interface RelightingWgslSingleValidation {
  readonly shaderId: string;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly discoveredBindings: readonly number[];
  readonly discoveredEntryPoints: readonly string[];
}

export interface RelightingWgslSuiteValidation {
  readonly valid: boolean;
  readonly results: readonly RelightingWgslSingleValidation[];
  readonly errors: readonly string[];
}

export interface Relighting25dUniformInput {
  readonly width: number;
  readonly height: number;
  readonly presetId?: RelightingAtmospherePresetId;
  readonly atmosphere?: RelightingAtmospherePreset;
}

export interface OpticalRefractionUniformInput {
  readonly width: number;
  readonly height: number;
  readonly material?: OpticalBrushMaterialId;
  readonly thicknessPx?: number;
  readonly frostBlurPx?: number;
  readonly puddleTiltDeg?: number;
  readonly waterlineY?: number;
  readonly lightDir?: Vec3Tuple;
}

export interface AnisotropicMetalUniformInput {
  readonly width: number;
  readonly height: number;
  readonly lightDir?: Vec3Tuple;
  readonly alphaT?: number;
  readonly alphaB?: number;
  readonly f0Rgb?: RgbTuple;
  readonly skyRgb?: RgbTuple;
  readonly neonAccentRgb?: RgbTuple;
}

/** 2.5D 리라이팅 + 스크린 공간 광선 마칭 그림자 WGSL 셰이더 (Uniform: 28×f32 = 112B). */
export const CUT_25D_RELIGHTING_RAYMARCH_WGSL = /* wgsl */ `
struct Relighting25dUniforms {
  canvasSize: vec2<f32>,
  shadowStepPx: f32,
  shadowMaxSteps: f32,
  keyDirAndIntensity: vec4<f32>,
  keyColorAndShadowStr: vec4<f32>,
  rimDirAndIntensity: vec4<f32>,
  rimColorAndPower: vec4<f32>,
  ambientSkyAndIntensity: vec4<f32>,
  ambientGroundAndCelSteps: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uParams: Relighting25dUniforms;
@group(0) @binding(1) var<storage, read> albedoField: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> normalDepthField: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> materialMaskField: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> outputField: array<vec4<f32>>;

fn idx25d(coord: vec2<i32>, dims: vec2<i32>) -> u32 {
  let c = vec2<i32>(clamp(coord.x, 0, dims.x - 1), clamp(coord.y, 0, dims.y - 1));
  return u32(c.y * dims.x + c.x);
}

fn marchSoftShadow25d(origin: vec2<i32>, dims: vec2<i32>, baseDepth: f32, lDir: vec3<f32>) -> f32 {
  let planLen = length(lDir.xy);
  if (planLen < 0.0001) { return 1.0; }
  let dir2 = lDir.xy / planLen;
  let slope = clamp(lDir.z / max(0.18, planLen), 0.12, 2.5) * 0.045;
  let maxSteps = i32(clamp(uParams.shadowMaxSteps, 1.0, 32.0));
  var vis: f32 = 1.0;
  var pos = vec2<f32>(f32(origin.x), f32(origin.y));
  for (var s: i32 = 1; s <= 32; s = s + 1) {
    if (s > maxSteps) { break; }
    pos = pos + dir2 * uParams.shadowStepPx;
    let sc = vec2<i32>(i32(round(pos.x)), i32(round(pos.y)));
    if (sc.x < 0 || sc.x >= dims.x || sc.y < 0 || sc.y >= dims.y) { break; }
    let delta = normalDepthField[idx25d(sc, dims)].w - (baseDepth + f32(s) * uParams.shadowStepPx * slope);
    if (delta > 0.015) { vis = min(vis, clamp(1.0 - delta / 0.25, 0.02, 1.0)); }
  }
  return vis;
}

@compute @workgroup_size(8, 8, 1)
fn cs_relight_25d_cut(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<i32>(i32(uParams.canvasSize.x), i32(uParams.canvasSize.y));
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  if (coord.x >= dims.x || coord.y >= dims.y) { return; }
  let i = idx25d(coord, dims);
  let albedo = albedoField[i];
  let nd = normalDepthField[i];
  let mat = materialMaskField[i];
  let n = normalize(vec3<f32>(nd.x, nd.y, max(0.08, nd.z)));
  let lDir = normalize(uParams.keyDirAndIntensity.xyz);
  let rDir = normalize(uParams.rimDirAndIntensity.xyz);
  let shadowLit = mix(1.0, marchSoftShadow25d(coord, dims, nd.w, lDir), uParams.keyColorAndShadowStr.w);
  let rawNdotL = max(0.0, dot(n, lDir));
  let celSteps = uParams.ambientGroundAndCelSteps.w;
  var diff = rawNdotL;
  if (celSteps > 1.5) { diff = floor(rawNdotL * celSteps + 0.5) / celSteps; }
  let amb = mix(uParams.ambientGroundAndCelSteps.xyz, uParams.ambientSkyAndIntensity.xyz, clamp(0.5 - n.y * 0.5, 0.0, 1.0)) * uParams.ambientSkyAndIntensity.w;
  let keyRgb = uParams.keyColorAndShadowStr.xyz * (diff * uParams.keyDirAndIntensity.w * shadowLit);
  let hVec = normalize(lDir + vec3<f32>(0.0, 0.0, 1.0));
  let rough = clamp(mat.x, 0.08, 0.98);
  let ndotH = max(0.0, dot(n, hVec));
  let a2 = rough * rough * rough * rough;
  let denom = ndotH * ndotH * (a2 - 1.0) + 1.0;
  let spec = clamp(a2 / (3.14159265 * denom * denom + 0.0001), 0.0, 4.0) * 0.14 * shadowLit;
  let rimF = pow(clamp(1.0 - n.z, 0.0, 1.0), uParams.rimColorAndPower.w);
  let rimRgb = uParams.rimColorAndPower.xyz * (rimF * uParams.rimDirAndIntensity.w * max(0.2, dot(n, rDir)) * (1.0 - mat.z * 0.78));
  let lit = albedo.rgb * (amb + keyRgb) + uParams.keyColorAndShadowStr.xyz * spec + rimRgb;
  outputField[i] = vec4<f32>(clamp(mix(lit, albedo.rgb * (0.25 + 0.75 * amb), clamp(mat.z * 0.94, 0.0, 1.0)), vec3<f32>(0.0), vec3<f32>(1.0)), albedo.a);
}
`;

/** 스넬 RGB 색분산 굴절 + 서리 투과 + 수면 평면 반사 WGSL 셰이더 (Uniform: 16×f32 = 64B). */
export const OPTICAL_REFRACTION_DISPERSION_WGSL = /* wgsl */ `
struct OpticalRefractionUniforms {
  canvasSize: vec2<f32>,
  thicknessPx: f32,
  frostBlurPx: f32,
  iorRgbAndF0: vec4<f32>,
  lightDirAndMode: vec4<f32>,
  puddleTiltAndWaterline: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uOptical: OpticalRefractionUniforms;
@group(0) @binding(1) var<storage, read> sourceRgba: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> opticalNormalCov: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> refractedOut: array<vec4<f32>>;

fn sampleBilinearOptical(pos: vec2<f32>, dims: vec2<i32>) -> vec4<f32> {
  let cx = clamp(pos.x, 0.0, f32(dims.x - 1));
  let cy = clamp(pos.y, 0.0, f32(dims.y - 1));
  let x0 = i32(floor(cx));
  let y0 = i32(floor(cy));
  let x1 = min(dims.x - 1, x0 + 1);
  let y1 = min(dims.y - 1, y0 + 1);
  let fx = cx - f32(x0);
  let fy = cy - f32(y0);
  let c00 = sourceRgba[u32(y0 * dims.x + x0)];
  let c10 = sourceRgba[u32(y0 * dims.x + x1)];
  let c01 = sourceRgba[u32(y1 * dims.x + x0)];
  let c11 = sourceRgba[u32(y1 * dims.x + x1)];
  return mix(mix(c00, c10, fx), mix(c01, c11, fx), fy);
}

fn snellOffsetPx(n: vec3<f32>, ior: f32, thickness: f32) -> vec2<f32> {
  let eta = 1.0 / max(0.25, ior);
  let cosI = clamp(n.z, 0.0, 1.0);
  let sin2T = eta * eta * max(0.0, 1.0 - cosI * cosI);
  if (sin2T >= 0.9999) { return n.xy * thickness; }
  let k = eta * cosI - sqrt(max(0.0, 1.0 - sin2T));
  let tVec = normalize(vec3<f32>(k * n.x, k * n.y, -eta + k * n.z));
  return (tVec.xy / max(0.2, abs(tVec.z))) * thickness;
}

@compute @workgroup_size(8, 8, 1)
fn cs_optical_refraction_dispersion(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<i32>(i32(uOptical.canvasSize.x), i32(uOptical.canvasSize.y));
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  if (coord.x >= dims.x || coord.y >= dims.y) { return; }
  let idx = u32(coord.y * dims.x + coord.x);
  let baseColor = sourceRgba[idx];
  let nc = opticalNormalCov[idx];
  if (nc.w <= 0.0001) {
    refractedOut[idx] = baseColor;
    return;
  }
  let n = normalize(vec3<f32>(nc.x, nc.y, max(0.05, nc.z)));
  let pos = vec2<f32>(f32(coord.x), f32(coord.y));
  let f0 = clamp(uOptical.iorRgbAndF0.w, 0.0, 1.0);
  let fresnel = clamp(f0 + (1.0 - f0) * pow(1.0 - clamp(n.z, 0.0, 1.0), 5.0), 0.0, 1.0);
  var opticalRgb = baseColor.rgb;
  if (uOptical.lightDirAndMode.w > 2.5) {
    let wl = uOptical.puddleTiltAndWaterline.y;
    let refl = sampleBilinearOptical(vec2<f32>(clamp(pos.x + n.x * 18.0, 0.0, f32(dims.x - 1)), clamp(wl - max(0.0, pos.y - wl) + n.y * 18.0, 0.0, f32(dims.y - 1))), dims).rgb;
    let tiltF = clamp(f0 + (1.0 - f0) * pow(1.0 - clamp(uOptical.puddleTiltAndWaterline.x, 0.0, 1.0), 5.0), 0.0, 1.0);
    opticalRgb = mix(baseColor.rgb * 0.7, refl, tiltF);
  } else {
    let rVal = sampleBilinearOptical(pos + snellOffsetPx(n, uOptical.iorRgbAndF0.x, uOptical.thicknessPx), dims).r;
    let gVal = sampleBilinearOptical(pos + snellOffsetPx(n, uOptical.iorRgbAndF0.y, uOptical.thicknessPx), dims).g;
    let bVal = sampleBilinearOptical(pos + snellOffsetPx(n, uOptical.iorRgbAndF0.z, uOptical.thicknessPx), dims).b;
    let hVec = normalize(normalize(uOptical.lightDirAndMode.xyz) + vec3<f32>(0.0, 0.0, 1.0));
    let glint = pow(max(0.0, dot(n, hVec)), 64.0) * 1.25;
    opticalRgb = mix(vec3<f32>(rVal, gVal, bVal), vec3<f32>(0.85, 0.94, 1.0), fresnel * 0.75) + vec3<f32>(glint);
  }
  refractedOut[idx] = vec4<f32>(clamp(mix(baseColor.rgb, opticalRgb, nc.w), vec3<f32>(0.0), vec3<f32>(1.0)), baseColor.a);
}
`;

/** 스트로크 접선 정렬 이방성 검신 메탈 Ward/GGX 반사 WGSL 셰이더 (Uniform: 16×f32 = 64B). */
export const ANISOTROPIC_METAL_REFLECTION_WGSL = /* wgsl */ `
struct AnisotropicMetalUniforms {
  canvasSize: vec2<f32>,
  alphaT: f32,
  alphaB: f32,
  lightDirAndPad: vec4<f32>,
  f0RgbAndStrength: vec4<f32>,
  skyAndNeonBlend: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uMetal: AnisotropicMetalUniforms;
@group(0) @binding(1) var<storage, read> sourceRgba: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> bladeTangentMask: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> metalOut: array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn cs_anisotropic_metal_reflection(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<i32>(i32(uMetal.canvasSize.x), i32(uMetal.canvasSize.y));
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  if (coord.x >= dims.x || coord.y >= dims.y) { return; }
  let idx = u32(coord.y * dims.x + coord.x);
  let baseColor = sourceRgba[idx];
  let tm = bladeTangentMask[idx];
  if (tm.w <= 0.0001) {
    metalOut[idx] = baseColor;
    return;
  }
  let tangent2 = normalize(vec2<f32>(tm.x, tm.y));
  let bitangent2 = vec2<f32>(-tangent2.y, tangent2.x);
  let n = normalize(vec3<f32>(bitangent2.x * tm.z, bitangent2.y * tm.z, 0.88));
  let tVec = normalize(vec3<f32>(tangent2.x, tangent2.y, 0.0) - n * dot(vec3<f32>(tangent2.x, tangent2.y, 0.0), n));
  let bVec = normalize(cross(n, tVec));
  let hVec = normalize(normalize(uMetal.lightDirAndPad.xyz) + vec3<f32>(0.0, 0.0, 1.0));
  let hN = max(0.05, dot(hVec, n));
  let hT = dot(hVec, tVec);
  let hB = dot(hVec, bVec);
  let aT = clamp(uMetal.alphaT, 0.03, 1.0);
  let aB = clamp(uMetal.alphaB, 0.03, 1.0);
  let ward = exp(clamp(-((hT / aT) * (hT / aT) + (hB / aB) * (hB / aB)) / (hN * hN), -30.0, 0.0)) / (4.0 * 3.14159265 * aT * aB + 0.0001);
  let fRgb = clamp(uMetal.f0RgbAndStrength.xyz + (vec3<f32>(1.0) - uMetal.f0RgbAndStrength.xyz) * pow(1.0 - clamp(n.z, 0.0, 1.0), 5.0), vec3<f32>(0.0), vec3<f32>(1.0));
  let envRgb = mix(uMetal.skyAndNeonBlend.xyz, vec3<f32>(0.22, 0.9, 1.0), clamp(abs(hT), 0.0, 1.0) * uMetal.skyAndNeonBlend.w);
  let metalRgb = baseColor.rgb * 0.22 + fRgb * (envRgb * 0.58 + clamp(ward, 0.0, 5.0) * 0.45 * uMetal.f0RgbAndStrength.w);
  metalOut[idx] = vec4<f32>(clamp(mix(baseColor.rgb, metalRgb, tm.w), vec3<f32>(0.0), vec3<f32>(1.0)), baseColor.a);
}
`;

export const WAVE74_WGSL_SHADER_CONTRACTS: readonly RelightingWgslShaderContract[] = [
  {
    shaderId: "cut-25d-relighting-raymarch",
    entryPoint: "cs_relight_25d_cut",
    workgroupSize: [8, 8, 1],
    uniformStructName: "Relighting25dUniforms",
    uniformFloatCount: 28,
    uniformByteLength: 112,
    bindings: [
      { group: 0, binding: 0, name: "uParams", addressSpace: "uniform", access: "read" },
      { group: 0, binding: 1, name: "albedoField", addressSpace: "storage", access: "read" },
      { group: 0, binding: 2, name: "normalDepthField", addressSpace: "storage", access: "read" },
      { group: 0, binding: 3, name: "materialMaskField", addressSpace: "storage", access: "read" },
      { group: 0, binding: 4, name: "outputField", addressSpace: "storage", access: "read_write" },
    ],
  },
  {
    shaderId: "optical-refraction-dispersion",
    entryPoint: "cs_optical_refraction_dispersion",
    workgroupSize: [8, 8, 1],
    uniformStructName: "OpticalRefractionUniforms",
    uniformFloatCount: 16,
    uniformByteLength: 64,
    bindings: [
      { group: 0, binding: 0, name: "uOptical", addressSpace: "uniform", access: "read" },
      { group: 0, binding: 1, name: "sourceRgba", addressSpace: "storage", access: "read" },
      { group: 0, binding: 2, name: "opticalNormalCov", addressSpace: "storage", access: "read" },
      { group: 0, binding: 3, name: "refractedOut", addressSpace: "storage", access: "read_write" },
    ],
  },
  {
    shaderId: "anisotropic-metal-reflection",
    entryPoint: "cs_anisotropic_metal_reflection",
    workgroupSize: [8, 8, 1],
    uniformStructName: "AnisotropicMetalUniforms",
    uniformFloatCount: 16,
    uniformByteLength: 64,
    bindings: [
      { group: 0, binding: 0, name: "uMetal", addressSpace: "uniform", access: "read" },
      { group: 0, binding: 1, name: "sourceRgba", addressSpace: "storage", access: "read" },
      { group: 0, binding: 2, name: "bladeTangentMask", addressSpace: "storage", access: "read" },
      { group: 0, binding: 3, name: "metalOut", addressSpace: "storage", access: "read_write" },
    ],
  },
];

/** `Relighting25dUniforms`와 1:1 매핑되는 16-byte 정렬 `Float32Array(28)`(112B)를 패킹한다. */
export function packRelighting25dUniforms(input: Relighting25dUniformInput): Float32Array {
  const atm = input.atmosphere ?? RELIGHTING_ATMOSPHERE_PRESETS[input.presetId ?? "morning-sunlight"];
  const keyDir = directionFromAngles(atm.keyLight.azimuthDeg, atm.keyLight.elevationDeg);
  const rimDir = directionFromAngles(atm.rimLight.azimuthDeg, atm.rimLight.elevationDeg);
  return new Float32Array([
    Math.max(1, Math.floor(input.width)), Math.max(1, Math.floor(input.height)), clampRange(atm.shadowStepPx, 0.5, 8), clampRange(atm.shadowMaxSteps, 1, 32),
    keyDir[0], keyDir[1], keyDir[2], clampRange(atm.keyLight.intensity, 0, 5),
    clamp01(atm.keyLight.colorRgb[0]), clamp01(atm.keyLight.colorRgb[1]), clamp01(atm.keyLight.colorRgb[2]), clamp01(atm.shadowStrength),
    rimDir[0], rimDir[1], rimDir[2], clampRange(atm.rimLight.intensity, 0, 4),
    clamp01(atm.rimLight.colorRgb[0]), clamp01(atm.rimLight.colorRgb[1]), clamp01(atm.rimLight.colorRgb[2]), clampRange(atm.rimLight.fresnelPower, 0.5, 8),
    clamp01(atm.ambientSkyRgb[0]), clamp01(atm.ambientSkyRgb[1]), clamp01(atm.ambientSkyRgb[2]), clamp01(atm.ambientIntensity),
    clamp01(atm.ambientGroundRgb[0]), clamp01(atm.ambientGroundRgb[1]), clamp01(atm.ambientGroundRgb[2]), clampRange(atm.celSteps, 0, 8),
  ]);
}

/** `OpticalRefractionUniforms`와 1:1 매핑되는 16-byte 정렬 `Float32Array(16)`(64B)를 패킹한다. */
export function packOpticalRefractionUniforms(input: OpticalRefractionUniformInput): Float32Array {
  const matId = input.material ?? "raindrop-glass";
  const preset = OPTICAL_BRUSH_MATERIALS[matId];
  const modeCode = matId === "raindrop-glass" ? 0 : matId === "frosted-crystal" ? 1 : matId === "anisotropic-blade-metal" ? 2 : 3;
  const light = input.lightDir ?? [-0.55, -0.58, 0.6];
  const cosTilt = Math.cos((clampRange(input.puddleTiltDeg ?? preset.defaultPuddleTiltDeg, 0, 88) * Math.PI) / 180);
  return new Float32Array([
    Math.max(1, Math.floor(input.width)), Math.max(1, Math.floor(input.height)), clampRange(input.thicknessPx ?? preset.defaultThicknessPx, 0, 96), clampRange(input.frostBlurPx ?? preset.defaultFrostBlurPx, 0, 12),
    preset.iorRgb[0], preset.iorRgb[1], preset.iorRgb[2], preset.f0Rgb[0],
    light[0], light[1], light[2], modeCode,
    cosTilt, Math.max(0, input.waterlineY ?? 0), 0, 0,
  ]);
}

/** `AnisotropicMetalUniforms`와 1:1 매핑되는 16-byte 정렬 `Float32Array(16)`(64B)를 패킹한다. */
export function packAnisotropicMetalUniforms(input: AnisotropicMetalUniformInput): Float32Array {
  const metalPreset = OPTICAL_BRUSH_MATERIALS["anisotropic-blade-metal"];
  const light = input.lightDir ?? [-0.5, -0.6, 0.62];
  const f0 = input.f0Rgb ?? metalPreset.f0Rgb;
  const sky = input.skyRgb ?? [0.68, 0.86, 1.0];
  return new Float32Array([
    Math.max(1, Math.floor(input.width)), Math.max(1, Math.floor(input.height)), clampRange(input.alphaT ?? metalPreset.anisotropicAlphaT, 0.03, 1.0), clampRange(input.alphaB ?? metalPreset.anisotropicAlphaB, 0.03, 1.0),
    light[0], light[1], light[2], 0,
    clamp01(f0[0]), clamp01(f0[1]), clamp01(f0[2]), 1.0,
    clamp01(sky[0]), clamp01(sky[1]), clamp01(sky[2]), input.neonAccentRgb ? 0.65 : 0.4,
  ]);
}

/** 단일 WGSL 컴퓨트 셰이더의 괄호 균형, 16-byte 유니폼 정렬, 워크그룹 크기, 진입점, 바인딩 계약을 검증한다. */
export function validateSingleRelightingWgslContract(
  source: string,
  contract: RelightingWgslShaderContract,
): RelightingWgslSingleValidation {
  const errors: string[] = [];
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    if (braceDepth < 0 || parenDepth < 0) {
      errors.push(`[${contract.shaderId}] WGSL 괄호 깊이가 음수입니다.`);
      break;
    }
  }
  if (braceDepth !== 0) errors.push(`[${contract.shaderId}] 중괄호 불균형: ${braceDepth}`);
  if (parenDepth !== 0) errors.push(`[${contract.shaderId}] 소괄호 불균형: ${parenDepth}`);
  if (contract.uniformByteLength % 16 !== 0) {
    errors.push(`[${contract.shaderId}] Uniform 크기(${contract.uniformByteLength}B)는 16바이트 배수여야 합니다.`);
  }
  if (contract.uniformFloatCount * 4 !== contract.uniformByteLength) {
    errors.push(`[${contract.shaderId}] Uniform float 개수와 바이트 크기가 불일치합니다.`);
  }
  if (!source.includes(`struct ${contract.uniformStructName}`)) {
    errors.push(`[${contract.shaderId}] Uniform 구조체 누락: ${contract.uniformStructName}`);
  }
  const [wx, wy, wz] = contract.workgroupSize;
  const expectedWg = `@workgroup_size(${wx}, ${wy}, ${wz})`;
  if (!source.includes("@compute") || !source.includes(expectedWg)) {
    errors.push(`[${contract.shaderId}] @compute ${expectedWg} 선언이 누락되었습니다.`);
  }

  const discoveredEntryPoints: string[] = [];
  const fnRegex = /@compute[\s\S]*?fn\s+(\w+)\s*\(/g;
  let fnMatch: RegExpExecArray | null = fnRegex.exec(source);
  while (fnMatch !== null) {
    const name = fnMatch[1] ?? "";
    if (name) discoveredEntryPoints.push(name);
    fnMatch = fnRegex.exec(source);
  }
  if (!source.includes(`fn ${contract.entryPoint}(`)) {
    errors.push(`[${contract.shaderId}] 진입점 누락: ${contract.entryPoint}`);
  }

  const bindingRegex = /@group\((\d+)\)\s+@binding\((\d+)\)\s+var<(uniform|storage)(?:,\s*(read|read_write))?>\s+(\w+)/g;
  const discoveredBindings: number[] = [];
  const bindingMap = new Map<string, { space: string; access: string; name: string }>();
  let bMatch: RegExpExecArray | null = bindingRegex.exec(source);
  while (bMatch !== null) {
    discoveredBindings.push(Number(bMatch[2]));
    bindingMap.set(`${Number(bMatch[1])}:${Number(bMatch[2])}`, { space: bMatch[3] ?? "", access: bMatch[4] ?? "read", name: bMatch[5] ?? "" });
    bMatch = bindingRegex.exec(source);
  }

  for (let i = 0; i < contract.bindings.length; i += 1) {
    const exp = contract.bindings[i];
    const actual = bindingMap.get(`${exp.group}:${exp.binding}`);
    if (!actual) {
      errors.push(`[${contract.shaderId}] 바인딩 누락: @group(${exp.group}) @binding(${exp.binding}) ${exp.name}`);
    } else if (actual.name !== exp.name || actual.space !== exp.addressSpace || actual.access !== exp.access) {
      errors.push(`[${contract.shaderId}] 바인딩 불일치(${exp.name}): ${actual.name}/${actual.space}/${actual.access}`);
    }
  }
  return { shaderId: contract.shaderId, valid: errors.length === 0, errors, discoveredBindings, discoveredEntryPoints };
}

/** Wave 74의 3종 WebGPU 컴퓨트 WGSL 셰이더 전체 계약을 일괄 검증한다. */
export function validateRelightingOpticalWgslContracts(): RelightingWgslSuiteValidation {
  const sources = [CUT_25D_RELIGHTING_RAYMARCH_WGSL, OPTICAL_REFRACTION_DISPERSION_WGSL, ANISOTROPIC_METAL_REFLECTION_WGSL];
  const results: RelightingWgslSingleValidation[] = [];
  const allErrors: string[] = [];
  for (let i = 0; i < WAVE74_WGSL_SHADER_CONTRACTS.length; i += 1) {
    const res = validateSingleRelightingWgslContract(sources[i] ?? "", WAVE74_WGSL_SHADER_CONTRACTS[i]);
    results.push(res);
    for (let j = 0; j < res.errors.length; j += 1) allErrors.push(res.errors[j]);
  }
  return { valid: allErrors.length === 0, results, errors: allErrors };
}
